/**
 * Le cache du sol peint par tranches : il étale la peinture d'un bloc sur plusieurs images,
 * garde les blocs complets et ne repeint que les cases qui ont changé.
 * Il ne connaît ni le monde ni le canevas : tout passe par les dépendances injectées.
 */

/** Le nombre de cases d'un côté d'un bloc. */
const TILES = 32;

/** Le côté d'une case, en pixels de pixel art. */
const TILE_PX = 24;

/** Le côté d'un bloc, en pixels. */
const BLOCK_PX = TILES * TILE_PX;

/** Le nombre de codes par côté, marge d'une case comprise. */
const CODES = TILES + 2;

/** Le nombre d'octets d'une rangée peinte. */
const ROW_BYTES = BLOCK_PX * TILE_PX * 4;

/** Le nombre de coûts récents retenus pour estimer la tranche la plus lente. */
const RECENT = 8;

/** Le budget par défaut d'une image, en millisecondes. */
const DEFAULT_BUDGET = 4;

/** Le nombre de blocs gardés par défaut. */
const DEFAULT_LIMIT = 64;

/** Ce que le cache attend du monde et du peintre, sans jamais les importer. */
export interface GroundCacheDeps<K, S> {
  /** Écrit dans `out` (34×34) ce que le sol dessine pour ce bloc et sa marge : un code par case. */
  readCodes(chunk: K, out: Uint8Array): void;
  /** Peint un rectangle de cases, comme `paintTiles`. */
  paint(chunk: K, out: Uint8ClampedArray, tx0: number, ty0: number, tx1: number, ty1: number): void;
  /** Crée une surface hors écran d'un bloc. */
  createSurface(): S;
  /** Copie `data` (w×h pixels RGBA) dans la surface, en (x, y). */
  blit(surface: S, data: Uint8ClampedArray, x: number, y: number, w: number, h: number): void;
  /** L'heure en millisecondes. */
  now(): number;
}

/** Un rectangle de cases à repeindre, bornes hautes exclues. */
interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Un bloc gardé en cache, complet ou en cours de peinture. */
interface Entry<K, S> {
  chunk: K;
  surface: S;
  /** Les codes du sol au moment de la dernière synchronisation. */
  codes: Uint8Array;
  /** La prochaine rangée à peindre, de 0 à 32. */
  row: number;
  complete: boolean;
  /** La dernière image où le bloc a été vu. */
  used: number;
  /** Les retouches découvertes mais pas encore appliquées. */
  pending: Rect[];
}

/** L'avancement d'une image : l'heure de départ et le travail déjà lancé. */
interface JobState<K> {
  start: number;
  retouched: number;
  rows: number;
  /** Les blocs déjà traités pendant cette image, pour ne pas boucler. */
  done: Set<K>;
}

/** Ajoute un rectangle en fusionnant ceux qui se chevauchent déjà. */
function addRect(list: Rect[], rect: Rect): void {
  let merged = rect;
  for (let i = 0; i < list.length; ) {
    const other = list[i];
    const overlap = merged.x0 < other.x1 && other.x0 < merged.x1 && merged.y0 < other.y1 && other.y0 < merged.y1;
    if (!overlap) {
      i++;
      continue;
    }
    merged = {
      x0: Math.min(merged.x0, other.x0),
      y0: Math.min(merged.y0, other.y0),
      x1: Math.max(merged.x1, other.x1),
      y1: Math.max(merged.y1, other.y1),
    };
    list.splice(i, 1);
    i = 0;
  }
  list.push(merged);
}

/** Le cache des blocs de sol, peint par rangées et retouché case par case. */
export class GroundCache<K, S> {
  private readonly deps: GroundCacheDeps<K, S>;
  private readonly budgetMs: number;
  private readonly limit: number;
  private readonly entries = new Map<K, Entry<K, S>>();
  private readonly pool: S[] = [];
  private readonly rowBuffer = new Uint8ClampedArray(ROW_BYTES);
  private readonly codeScratch = new Uint8Array(CODES * CODES);
  private readonly recent: number[] = [];
  private rectBuffer: Uint8ClampedArray | null = null;
  private active: Entry<K, S> | null = null;
  private slowest = 0;

  /** Prépare le cache avec ses dépendances et, si besoin, d'autres limites. */
  constructor(deps: GroundCacheDeps<K, S>, options: { budgetMs?: number; limit?: number } = {}) {
    this.deps = deps;
    this.budgetMs = options.budgetMs ?? DEFAULT_BUDGET;
    this.limit = options.limit ?? DEFAULT_LIMIT;
  }

  /** Avance la peinture et les retouches des blocs visibles, puis des voisins. */
  update(visible: readonly K[], nearby: readonly K[], frame: number): void {
    const visibleSet = new Set<K>(visible);
    const nearbySet = new Set<K>(nearby);
    for (const chunk of visible) this.touch(chunk, frame);
    for (const chunk of nearby) {
      if (!visibleSet.has(chunk)) this.touch(chunk, frame);
    }
    const state: JobState<K> = { start: this.deps.now(), retouched: 0, rows: 0, done: new Set<K>() };
    this.retouchBlocks(visible, null, state);
    this.retouchBlocks(nearby, visibleSet, state);
    this.paintBlocks(visible, nearby, visibleSet, nearbySet, frame, state);
    this.evictToLimit(visibleSet);
  }

  /** La surface d'un bloc entièrement peint, sinon `null`. */
  get(chunk: K): S | null {
    const entry = this.entries.get(chunk);
    if (!entry || !entry.complete) return null;
    return entry.surface;
  }

  /** Oublie tous les blocs, les surfaces en réserve et le travail en cours. */
  clear(): void {
    this.entries.clear();
    this.pool.length = 0;
    this.active = null;
    this.rectBuffer = null;
    this.recent.length = 0;
    this.slowest = 0;
  }

  /** Marque un bloc connu comme vu à cette image. */
  private touch(chunk: K, frame: number): void {
    const entry = this.entries.get(chunk);
    if (entry) entry.used = frame;
  }

  /** Vrai si le temps écoulé plus la tranche la plus lente tient encore dans le budget. */
  private fits(state: JobState<K>): boolean {
    return this.deps.now() - state.start + this.slowest <= this.budgetMs;
  }

  /** Retient le coût d'une tranche et recalcule la plus lente récemment vue. */
  private recordCost(before: number): void {
    const cost = Math.max(0, this.deps.now() - before);
    this.recent.push(cost);
    if (this.recent.length > RECENT) this.recent.shift();
    let slowest = 0;
    for (const value of this.recent) {
      if (value > slowest) slowest = value;
    }
    this.slowest = slowest;
  }

  /** Compare les codes et repeint les petits rectangles des blocs déjà peints. */
  private retouchBlocks(list: readonly K[], skip: Set<K> | null, state: JobState<K>): void {
    for (const chunk of list) {
      if (skip && skip.has(chunk)) continue;
      const entry = this.entries.get(chunk);
      if (!entry || !entry.complete) continue;
      this.syncCodes(entry);
      this.flushRects(entry, state);
    }
  }

  /** Lit les codes du bloc et empile les rectangles des cases changées. */
  private syncCodes(entry: Entry<K, S>): void {
    this.deps.readCodes(entry.chunk, this.codeScratch);
    for (let cy = 0; cy < CODES; cy++) {
      for (let cx = 0; cx < CODES; cx++) {
        const i = cy * CODES + cx;
        if (entry.codes[i] === this.codeScratch[i]) continue;
        const lx = cx - 1;
        const ly = cy - 1;
        const x0 = Math.max(0, lx - 1);
        const y0 = Math.max(0, ly - 1);
        const x1 = Math.min(TILES, lx + 2);
        const y1 = Math.min(TILES, ly + 2);
        if (x0 < x1 && y0 < y1) addRect(entry.pending, { x0, y0, x1, y1 });
      }
    }
    entry.codes.set(this.codeScratch);
  }

  /** Applique les retouches en attente d'un bloc, dans la limite du budget. */
  private flushRects(entry: Entry<K, S>, state: JobState<K>): void {
    while (entry.pending.length > 0) {
      if (state.retouched > 0 && !this.fits(state)) return;
      const rect = entry.pending.shift();
      if (!rect) return;
      this.paintRect(entry, rect);
      state.retouched++;
    }
  }

  /** Peint un rectangle de cases et le copie dans la surface du bloc. */
  private paintRect(entry: Entry<K, S>, rect: Rect): void {
    const w = (rect.x1 - rect.x0) * TILE_PX;
    const h = (rect.y1 - rect.y0) * TILE_PX;
    if (w <= 0 || h <= 0) return;
    const size = w * h * 4;
    if (!this.rectBuffer || this.rectBuffer.length !== size) {
      this.rectBuffer = new Uint8ClampedArray(size);
    }
    const buffer = this.rectBuffer;
    const before = this.deps.now();
    this.deps.paint(entry.chunk, buffer, rect.x0, rect.y0, rect.x1, rect.y1);
    this.deps.blit(entry.surface, buffer, rect.x0 * TILE_PX, rect.y0 * TILE_PX, w, h);
    this.recordCost(before);
  }

  /** Peint les blocs manquants dans l'ordre de priorité, un bloc à la fois. */
  private paintBlocks(
    visible: readonly K[],
    nearby: readonly K[],
    visibleSet: Set<K>,
    nearbySet: Set<K>,
    frame: number,
    state: JobState<K>,
  ): void {
    for (;;) {
      const target = this.nextTarget(visible, nearby, visibleSet, nearbySet, frame, state);
      if (!target) return;
      const complete = this.paintRows(target, state);
      if (!complete) return;
    }
  }

  /** Choisit le bloc à peindre : le bloc commencé d'abord, puis les visibles, puis les voisins. */
  private nextTarget(
    visible: readonly K[],
    nearby: readonly K[],
    visibleSet: Set<K>,
    nearbySet: Set<K>,
    frame: number,
    state: JobState<K>,
  ): Entry<K, S> | null {
    if (state.rows > 0 && !this.fits(state)) return null;
    if (this.active) {
      const key = this.active.chunk;
      const relevant = visibleSet.has(key) || nearbySet.has(key);
      if (relevant && !this.active.complete && !state.done.has(key)) return this.active;
      this.active = null;
    }
    for (const chunk of visible) {
      if (state.done.has(chunk)) continue;
      const entry = this.entries.get(chunk) ?? this.createEntry(chunk, true, visibleSet, frame);
      if (!entry) {
        state.done.add(chunk);
        continue;
      }
      if (entry.complete) {
        state.done.add(chunk);
        continue;
      }
      this.active = entry;
      return entry;
    }
    for (const chunk of nearby) {
      if (visibleSet.has(chunk) || state.done.has(chunk)) continue;
      const entry = this.entries.get(chunk) ?? this.createEntry(chunk, false, visibleSet, frame);
      if (!entry) {
        state.done.add(chunk);
        continue;
      }
      if (entry.complete) {
        state.done.add(chunk);
        continue;
      }
      this.active = entry;
      return entry;
    }
    return null;
  }

  /** Peint les rangées restantes d'un bloc ; rend vrai quand il est complet. */
  private paintRows(entry: Entry<K, S>, state: JobState<K>): boolean {
    while (entry.row < TILES) {
      if (state.rows > 0 && !this.fits(state)) break;
      const before = this.deps.now();
      this.deps.paint(entry.chunk, this.rowBuffer, 0, entry.row, TILES, entry.row + 1);
      this.deps.blit(entry.surface, this.rowBuffer, 0, entry.row * TILE_PX, BLOCK_PX, TILE_PX);
      this.recordCost(before);
      entry.row++;
      state.rows++;
    }
    if (entry.row < TILES) return false;
    entry.complete = true;
    state.done.add(entry.chunk);
    if (this.active === entry) this.active = null;
    return true;
  }

  /** Ouvre un bloc, en réutilisant une surface libérée quand il y en a une. */
  private createEntry(chunk: K, isVisible: boolean, visibleSet: Set<K>, frame: number): Entry<K, S> | null {
    if (!isVisible && this.entries.size >= this.limit) {
      this.evictOne(visibleSet);
      if (this.entries.size >= this.limit) return null;
    }
    const surface = this.pool.pop() ?? this.deps.createSurface();
    const codes = new Uint8Array(CODES * CODES);
    this.deps.readCodes(chunk, codes);
    const entry: Entry<K, S> = {
      chunk,
      surface,
      codes,
      row: 0,
      complete: false,
      used: frame,
      pending: [],
    };
    this.entries.set(chunk, entry);
    return entry;
  }

  /** Libère le bloc non visible le moins récemment vu et range sa surface en réserve. */
  private evictOne(visibleSet: Set<K>): boolean {
    let oldest: Entry<K, S> | null = null;
    for (const entry of this.entries.values()) {
      if (visibleSet.has(entry.chunk)) continue;
      if (!oldest || entry.used < oldest.used) oldest = entry;
    }
    if (!oldest) return false;
    this.entries.delete(oldest.chunk);
    this.pool.push(oldest.surface);
    if (this.active === oldest) this.active = null;
    return true;
  }

  /** Ramène le cache sous sa limite sans jamais libérer un bloc visible. */
  private evictToLimit(visibleSet: Set<K>): void {
    while (this.entries.size > this.limit) {
      if (!this.evictOne(visibleSet)) return;
    }
  }
}
