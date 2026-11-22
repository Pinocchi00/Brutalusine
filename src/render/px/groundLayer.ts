/**
 * La couche de sol du rendu pixel : elle relie le monde au cache de peinture et à la vie du sol.
 * Le renderer ne connaît qu'elle ; rien ici ne crée de bloc.
 */
import { CHUNK, GROUND_WATER, type Chunk, type World } from '../../sim/world';
import { TREE_MIN } from '../../sim/data';
import { C } from './palette';
import { makeSurface } from './surface';
import { TILE_PX, type PixelView } from './view';
import { GroundCache } from './groundCache';
import { paintTiles, type GroundPathSegment, type GroundSource } from './groundPaint';
import { drawGroundLife, layoutLife, type GroundLife } from './groundLife';
import { pen } from './pen';

/** Le côté d'un bloc peint, en pixels de pixel art. */
const BLOCK_PX = CHUNK * TILE_PX;

/** Le nombre de cases d'un côté des codes, marge d'une case comprise. */
const CODES = CHUNK + 2;

/** Le nombre de coins d'un côté du champ de rivage. */
const CORNER = CHUNK + 1;

/** Le nombre d'images sans être vu après lequel la vie d'un bloc est oubliée. */
const LIFE_TTL = 120;

/** Le plafond de toute la mise à jour du sol, en millisecondes. */
export const GROUND_TOTAL_MS = 4;

/** Le budget de peinture par image, en millisecondes : il laisse 1 ms au reste du sol. */
const GROUND_BUDGET_MS = 3;

/** Le nombre de coûts récents retenus pour estimer la vie d'un bloc. */
const LIFE_RECENT = 8;

/** L'estimation de départ d'un calcul de vie, en millisecondes. */
const LIFE_DEFAULT_MS = 1;

/** Le plancher de l'estimation d'un calcul de vie, en millisecondes. */
const LIFE_FLOOR_MS = 0.5;

/** Le nombre de reports après lequel un calcul de vie est forcé. */
const MAX_LIFE_DEFER = 60;

/** En dessous de ce temps écoulé, aucune peinture n'a eu lieu, en millisecondes. */
const IDLE_MS = 0.5;

/** Le nombre de passes de peinture du préchauffage. */
const WARM_PASSES = 3;

/** Le nombre de calculs de vie du préchauffage. */
const WARM_LIFE = 8;

/** Le nombre de coûts de préchauffage retenus pour l'estimation. */
const WARM_RECENT = 3;

/** La graine fixe de la source de préchauffage. */
const WARM_SEED = 0x5eed;

/** Vrai si un calcul estimé à `estimateMs` tient encore dans le plafond, après `elapsedMs`. */
export function lifeFits(elapsedMs: number, estimateMs: number, totalMs: number = GROUND_TOTAL_MS): boolean {
  return elapsedMs + estimateMs <= totalMs;
}

/** Une source synthétique, pure et déterministe, qui chauffe toutes les branches de la peinture. */
export function warmGroundSource(): GroundSource {
  const shore = new Float32Array(CORNER * CORNER);
  const ford = new Float32Array(CORNER * CORNER);
  const slab = new Uint8Array(CODES * CODES);
  const loot = new Uint8Array(CHUNK * CHUNK);
  for (let j = 0; j < CORNER; j++) {
    for (let i = 0; i < CORNER; i++) {
      const k = j * CORNER + i;
      shore[k] = (CHUNK - j) * 0.5 - 4;
      const across = Math.min(i - 6, 25 - i);
      if (j >= 20 && across >= 0) ford[k] = across >= 2 ? 1 : across * 0.5;
    }
  }
  for (let ly = 4; ly < 7; ly++) {
    for (let lx = 4; lx < 7; lx++) slab[(ly + 1) * CODES + (lx + 1)] = 1;
  }
  loot[10 * CHUNK + 10] = 1;
  loot[16 * CHUNK + 21] = 1;
  const paths: GroundPathSegment[] = [{ ax: 2, ay: 2, bx: 29, by: 23 }];
  return { seed: WARM_SEED, originX: 0, originY: 0, shore, ford, paths, slab, loot };
}

/** Vrai si le centre d'une case est à moins de 0,6 case d'un segment de sentier. */
function nearPath(paths: readonly GroundPathSegment[], tx: number, ty: number): boolean {
  const px = tx + 0.5;
  const py = ty + 0.5;
  for (const path of paths) {
    const dx = path.bx - path.ax;
    const dy = path.by - path.ay;
    const len2 = dx * dx + dy * dy;
    let t = 0;
    if (len2 > 0) {
      t = ((px - path.ax) * dx + (py - path.ay) * dy) / len2;
      if (t < 0) t = 0;
      else if (t > 1) t = 1;
    }
    const qx = path.ax + t * dx;
    const qy = path.ay + t * dy;
    if (Math.hypot(px - qx, py - qy) < 0.6) return true;
  }
  return false;
}

/** Déduit les cinq codes de sol d'une source : terre, eau, berge, chemin ou gué. */
export function lifeGround(source: GroundSource): Uint8Array {
  const ground = new Uint8Array(CHUNK * CHUNK);
  for (let ly = 0; ly < CHUNK; ly++) {
    for (let lx = 0; lx < CHUNK; lx++) {
      const i = ly * CORNER + lx;
      const shore = (source.shore[i] + source.shore[i + 1] + source.shore[i + CORNER] + source.shore[i + CORNER + 1]) / 4;
      const ford = (source.ford[i] + source.ford[i + 1] + source.ford[i + CORNER] + source.ford[i + CORNER + 1]) / 4;
      let code = 0;
      if (shore < 0) code = ford >= 0.9 ? 4 : 1;
      else if (nearPath(source.paths, lx, ly)) code = 3;
      else if (shore < 1.6) code = 2;
      ground[ly * CHUNK + lx] = code;
    }
  }
  return ground;
}

/** Une entrée de vie du sol, avec la dernière image où son bloc a été vu. */
interface LifeEntry {
  life: GroundLife;
  seen: number;
}

/** Vrai si au moins la moitié des cases du bloc est de l'eau. */
function mostlyWater(chunk: Chunk): boolean {
  let water = 0;
  for (let i = 0; i < CHUNK * CHUNK; i++) {
    if (chunk.ground[i] === GROUND_WATER) water++;
  }
  return water * 2 >= CHUNK * CHUNK;
}

/** La couche de sol : cache des blocs, vie du sol et liste des blocs visibles. */
export class GroundLayer {
  private readonly cache: GroundCache<Chunk, HTMLCanvasElement>;
  private readonly visible: Chunk[] = [];
  private readonly nearby: Chunk[] = [];
  private readonly life = new Map<Chunk, LifeEntry>();
  private readonly slab = new Uint8Array(CODES * CODES);
  private readonly now: () => number;
  private readonly lifeRecent: number[] = [];
  private lifeEstimate = LIFE_DEFAULT_MS;
  private preparedEstimate = LIFE_DEFAULT_MS;
  private lifeDeferred = 0;
  private paths = new WeakMap<Chunk, readonly GroundPathSegment[]>();
  private world: World | null = null;

  /** Le temps réel passé dans la mise à jour du sol à la dernière image. */
  groundMs = 0;

  constructor(options: { now?: () => number } = {}) {
    this.now = options.now ?? (() => performance.now());
    this.cache = new GroundCache<Chunk, HTMLCanvasElement>(
      {
        readCodes: (chunk, out) => {
          if (this.world) this.readCodes(this.world, chunk, out);
        },
        paint: (chunk, out, tx0, ty0, tx1, ty1) => {
          if (this.world) this.paintRect(this.world, chunk, out, tx0, ty0, tx1, ty1);
        },
        createSurface: () => makeSurface(BLOCK_PX, BLOCK_PX).canvas,
        blit: (surface, data, x, y, w, h) => {
          const ctx = surface.getContext('2d');
          if (!ctx) throw new Error('Contexte 2D indisponible');
          const image = new ImageData(data as Uint8ClampedArray<ArrayBuffer>, w, h);
          ctx.putImageData(image, x, y);
        },
        now: () => this.now(),
      },
      { budgetMs: GROUND_BUDGET_MS },
    );
  }

  /** Vide le cache et la vie du sol. */
  clear(): void {
    this.cache.clear();
    this.life.clear();
    this.paths = new WeakMap();
    this.visible.length = 0;
    this.nearby.length = 0;
    this.lifeRecent.length = 0;
    this.lifeEstimate = this.preparedEstimate;
    this.lifeDeferred = 0;
    this.groundMs = 0;
  }

  /** Peint et calcule une source synthétique pour chauffer le code hors partie. */
  prepare(): void {
    const source = warmGroundSource();
    const row = new Uint8ClampedArray(BLOCK_PX * TILE_PX * 4);
    const recent: number[] = [];
    const measure = (run: () => void): void => {
      const before = this.now();
      run();
      recent.push(Math.max(0, this.now() - before));
      if (recent.length > WARM_RECENT) recent.shift();
    };
    for (let pass = 0; pass < WARM_PASSES; pass++) {
      for (let ty = 0; ty < CHUNK; ty++) {
        measure(() => paintTiles(source, row, 0, ty, CHUNK, ty + 1));
      }
    }
    const lifeSource = {
      seed: source.seed,
      originX: source.originX,
      originY: source.originY,
      shore: source.shore,
      ground: lifeGround(source),
    };
    for (let i = 0; i < WARM_LIFE; i++) {
      measure(() => layoutLife(lifeSource));
    }
    let max = 0;
    for (const value of recent) {
      if (value > max) max = value;
    }
    this.preparedEstimate = Math.max(LIFE_DEFAULT_MS, max);
    this.lifeEstimate = this.preparedEstimate;
  }

  /** Avance la peinture des blocs visibles et prépare la vie d'un bloc au plus par image. */
  update(world: World, view: PixelView, frame: number): void {
    const start = this.now();
    this.world = world;
    const cx0 = Math.floor(view.tileX0 / CHUNK);
    const cx1 = Math.floor(view.tileX1 / CHUNK);
    const cy0 = Math.floor(view.tileY0 / CHUNK);
    const cy1 = Math.floor(view.tileY1 / CHUNK);
    this.visible.length = 0;
    this.nearby.length = 0;
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const chunk = world.chunk(cx, cy, false);
        if (chunk) this.visible.push(chunk);
      }
    }
    const centreX = (view.tileX0 + view.tileX1) / 2;
    const centreY = (view.tileY0 + view.tileY1) / 2;
    this.visible.sort((a, b) => {
      const dxa = a.cx * CHUNK + CHUNK / 2 - centreX;
      const dya = a.cy * CHUNK + CHUNK / 2 - centreY;
      const dxb = b.cx * CHUNK + CHUNK / 2 - centreX;
      const dyb = b.cy * CHUNK + CHUNK / 2 - centreY;
      return dxa * dxa + dya * dya - (dxb * dxb + dyb * dyb) || a.cy - b.cy || a.cx - b.cx;
    });
    for (let cy = cy0 - 1; cy <= cy1 + 1; cy++) {
      for (let cx = cx0 - 1; cx <= cx1 + 1; cx++) {
        if (cx >= cx0 && cx <= cx1 && cy >= cy0 && cy <= cy1) continue;
        const chunk = world.chunk(cx, cy, false);
        if (chunk) this.nearby.push(chunk);
      }
    }
    this.cache.update(this.visible, this.nearby, frame);
    this.updateLife(frame, start);
    this.groundMs = this.now() - start;
  }

  /** Dessine le sol visible : un canevas peint, ou un aplat en attendant. */
  drawGround(ctx: CanvasRenderingContext2D): void {
    for (const chunk of this.visible) {
      const image = this.cache.get(chunk);
      const X = chunk.cx * BLOCK_PX;
      const Y = chunk.cy * BLOCK_PX;
      if (image) {
        ctx.drawImage(image, X, Y);
      } else {
        ctx.fillStyle = mostlyWater(chunk) ? C.q4 : C.m2;
        ctx.fillRect(X, Y, BLOCK_PX, BLOCK_PX);
      }
    }
  }

  /** Dessine la vie du sol à l'instant d'animation de la maquette. */
  drawLife(ctx: CanvasRenderingContext2D, view: PixelView, anim: number): void {
    const P = pen(ctx);
    const x0 = view.tileX0 * TILE_PX;
    const y0 = view.tileY0 * TILE_PX;
    const x1 = (view.tileX1 + 1) * TILE_PX;
    const y1 = (view.tileY1 + 1) * TILE_PX;
    for (const chunk of this.visible) {
      if (!this.cache.get(chunk)) continue;
      const entry = this.life.get(chunk);
      if (!entry) continue;
      drawGroundLife(P, entry.life, anim, x0, y0, x1, y1, this.blocked);
    }
  }

  /** Vrai si une case porte une entité, une dalle, un gisement, un arbre ou des débris. */
  readonly blocked = (tx: number, ty: number): boolean => {
    const world = this.world;
    if (!world) return false;
    const chunk = world.at(tx, ty, false);
    if (!chunk) return false;
    const i = ((ty & 31) << 5) | (tx & 31);
    return (
      chunk.ent[i] !== 0 ||
      chunk.slab[i] !== 0 ||
      chunk.deposit[i] !== 0 ||
      chunk.loot[i] !== 0 ||
      chunk.canopy[i] >= TREE_MIN
    );
  };

  /** Écrit les codes de dalle et de débris d'un bloc et de sa marge de cases. */
  readCodes(world: World, chunk: Chunk, out: Uint8Array): void {
    const bx = chunk.cx * CHUNK;
    const by = chunk.cy * CHUNK;
    for (let cy = 0; cy < CODES; cy++) {
      const y = by + cy - 1;
      for (let cx = 0; cx < CODES; cx++) {
        const x = bx + cx - 1;
        const inside = cx >= 1 && cx <= CHUNK && cy >= 1 && cy <= CHUNK;
        const c = inside ? chunk : world.at(x, y, false);
        const i = ((y & 31) << 5) | (x & 31);
        out[cy * CODES + cx] = c ? c.slab[i] | (c.loot[i] << 1) : 0;
      }
    }
  }

  /** Peint un rectangle local de cases, ramené aux coordonnées monde du bloc. */
  private paintRect(
    world: World,
    chunk: Chunk,
    out: Uint8ClampedArray,
    tx0: number,
    ty0: number,
    tx1: number,
    ty1: number,
  ): void {
    const bx = chunk.cx * CHUNK;
    const by = chunk.cy * CHUNK;
    this.readSlab(world, chunk);
    const source: GroundSource = {
      seed: world.seed,
      originX: bx,
      originY: by,
      shore: chunk.shore,
      ford: chunk.ford,
      paths: this.pathsFor(world, chunk),
      slab: this.slab,
      loot: chunk.loot,
    };
    paintTiles(source, out, bx + tx0, by + ty0, bx + tx1, by + ty1);
  }

  /** Lit la marge de dalles d'un bloc dans le tampon réutilisé. */
  private readSlab(world: World, chunk: Chunk): void {
    const bx = chunk.cx * CHUNK;
    const by = chunk.cy * CHUNK;
    for (let cy = 0; cy < CODES; cy++) {
      const y = by + cy - 1;
      for (let cx = 0; cx < CODES; cx++) {
        const x = bx + cx - 1;
        const inside = cx >= 1 && cx <= CHUNK && cy >= 1 && cy <= CHUNK;
        const c = inside ? chunk : world.at(x, y, false);
        this.slab[cy * CODES + cx] = c ? c.slab[((y & 31) << 5) | (x & 31)] : 0;
      }
    }
  }

  /** Les sentiers d'un bloc, calculés une seule fois tant que le bloc vit. */
  private pathsFor(world: World, chunk: Chunk): readonly GroundPathSegment[] {
    const hit = this.paths.get(chunk);
    if (hit) return hit;
    const paths = world.pathSegments(chunk.cx, chunk.cy);
    this.paths.set(chunk, paths);
    return paths;
  }

  /** Marque les blocs vus et calcule la vie d'un seul bloc nouveau si le temps le permet. */
  private updateLife(frame: number, start: number): void {
    let target: Chunk | null = null;
    for (const chunk of this.visible) {
      const entry = this.life.get(chunk);
      if (entry) entry.seen = frame;
      else if (!target && this.cache.get(chunk)) target = chunk;
    }
    for (const chunk of this.nearby) {
      const entry = this.life.get(chunk);
      if (entry) entry.seen = frame;
    }
    if (target && this.world) {
      const elapsed = this.now() - start;
      const idle = elapsed < IDLE_MS;
      // Ce calcul forcé, comme le cas `idle`, est la seule exception permise au plafond, pour qu'aucun bloc ne reste sans vie.
      const forced = this.lifeDeferred >= MAX_LIFE_DEFER;
      if (idle || lifeFits(elapsed, this.lifeEstimate) || forced) {
        const before = this.now();
        const world = this.world;
        const life = layoutLife({
          seed: world.seed,
          originX: target.cx * CHUNK,
          originY: target.cy * CHUNK,
          shore: target.shore,
          ground: target.ground,
        });
        this.recordLifeCost(before);
        this.life.set(target, { life, seen: frame });
        this.lifeDeferred = 0;
      } else {
        this.lifeDeferred++;
      }
    }
    for (const [chunk, entry] of this.life) {
      if (frame - entry.seen > LIFE_TTL) this.life.delete(chunk);
    }
  }

  /** Retient le coût d'un calcul de vie et garde le maximum des huit derniers. */
  private recordLifeCost(before: number): void {
    const cost = Math.max(0, this.now() - before);
    this.lifeRecent.push(cost);
    if (this.lifeRecent.length > LIFE_RECENT) this.lifeRecent.shift();
    let max = 0;
    for (const value of this.lifeRecent) {
      if (value > max) max = value;
    }
    this.lifeEstimate = Math.max(LIFE_FLOOR_MS, max);
  }
}
