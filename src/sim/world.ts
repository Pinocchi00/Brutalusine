// Le monde : une grille infinie découpée en blocs de 32×32, générée à la demande.
// Une rivière sinueuse, des gués, des bosquets et des sentiers fixes ; tout vient de la graine.

import { fbm, hash01, mulberry32 } from './rng';
import { TREE_MIN } from './data';

export const CHUNK = 32;
export const GROUND_SOIL = 0;
export const GROUND_WATER = 1;
export const GROUND_BANK = 2;
export const GROUND_PATH = 3;
export const BANK_FIELD = 1.6;   // une case est de la berge si la moyenne de ses coins est dans [0, BANK_FIELD[
export const PATH_TILE = 0.6;    // une case est un chemin si son centre est à moins de 0,6 case d'un segment
export const SMOKE_RES = 8;      // 8×8 cellules de fumée par bloc (4 cases chacune)

/** Un morceau de sentier, en cases du monde. */
export interface PathSegment { ax: number; ay: number; bx: number; by: number; }

export class Chunk {
  ground = new Uint8Array(CHUNK * CHUNK);
  canopy = new Uint8Array(CHUNK * CHUNK);    // densité de canopée 0-255
  deposit = new Uint8Array(CHUNK * CHUNK);   // type de gisement
  amount = new Uint16Array(CHUNK * CHUNK);   // unités restantes
  slab = new Uint8Array(CHUNK * CHUNK);
  loot = new Uint8Array(CHUNK * CHUNK);      // débris à ramasser (1 = ferraille)
  cap = new Uint8Array(CHUNK * CHUNK);       // taille adulte de l'arbre de cette case (0 = pas d'arbre)
  ent = new Int32Array(CHUNK * CHUNK);       // identifiant d'entité (0 = vide)
  region = new Uint16Array(CHUNK * CHUNK);   // réseau électrique
  shore = new Float32Array((CHUNK + 1) * (CHUNK + 1));   // le champ de rivage aux 33×33 coins
  smoke = new Float32Array(SMOKE_RES * SMOKE_RES);
  next: Float32Array | null = null;          // tampon de diffusion
  pending = false;
  smokeSum = 0;
  version = 1;        // incrémenté à chaque changement visible (cache de rendu)
  urgent = false;     // changement à repeindre tout de suite (construction, coupe)
  slabCount = 0;
  constructor(public cx: number, public cy: number) {}
}

export interface Blob { x: number; y: number; r: number; type: number; }

/** Les réglages d'une rivière, tous tirés de la graine. */
interface RiverParams {
  rx: number; ry: number;          // direction de la rivière
  nx: number; ny: number;          // sa normale, du côté de l'eau
  offset: number;                  // distance de la rive intérieure au départ
  a1: number; w1: number; p1: number;
  a2: number; w2: number; p2: number;
  h0: number; ha: number; hw: number; hp: number;
  bankBase: number; bankAmp: number; bankW: number; bankP: number;
  fordShift: number; fordSpacing: number; fordRise: number; fordReach: number;
}

interface Grove { x: number; y: number; r: number; }

const TAU = Math.PI * 2;
const key = (cx: number, cy: number) => (cx + 32768) * 65536 + (cy + 32768);

export class World {
  chunks = new Map<number, Chunk>();
  list: Chunk[] = [];
  blobs: Blob[] = [];          // gisements garantis près du départ
  river: { x: number; y: number };   // le point d'eau le plus proche du départ
  firstFord: { x: number; y: number };   // le premier gué, pour les sentiers
  scraps = new Set<number>();  // débris du module, autour du départ
  private params: RiverParams;
  private campPaths: PathSegment[] = [];
  grove: { x: number; y: number; r: number };   // le bosquet garanti près du départ
  private groveCache = new Map<number, Grove | null>();
  private trailCache = new Map<number, PathSegment[]>();
  private last: Chunk | null = null;

  constructor(public seed: number) {
    const rnd = mulberry32(seed ^ 0x9e3779b9);
    const angle = rnd() * TAU;
    this.params = {
      rx: Math.cos(angle), ry: Math.sin(angle),
      nx: -Math.sin(angle), ny: Math.cos(angle),
      offset: 21,
      a1: 4, w1: 0.025, p1: rnd() * TAU,
      a2: 1, w2: 0.04, p2: rnd() * TAU,
      h0: 2.75, ha: 0.5, hw: 0.05, hp: rnd() * TAU,
      bankBase: 0.5, bankAmp: 0.3, bankW: 0.08, bankP: rnd() * TAU,
      fordShift: 16 + rnd() * 6, fordSpacing: 40 + rnd() * 30, fordRise: 0.8, fordReach: 9.5,
    };
    const near = this.placeRiver();
    this.river = near;
    this.firstFord = this.fordPoint(this.params.fordShift);
    this.grove = this.chooseHomeGrove();
    this.makeBlobs(rnd);
    this.makeScraps(rnd);
    this.makeCampPaths(rnd);
  }

  // ------------------------------------------------------------ la rivière
  private centerline(u: number): number {
    const p = this.params;
    return p.offset
      + p.a1 * Math.sin(p.w1 * u + p.p1) - p.a1 * Math.sin(p.p1)
      + p.a2 * Math.sin(p.w2 * u + p.p2) - p.a2 * Math.sin(p.p2);
  }

  private halfWidth(u: number): number {
    const p = this.params;
    return p.h0 + p.ha * Math.sin(p.hw * u + p.hp);
  }

  private fordCut(u: number): number {
    const p = this.params;
    const base = Math.floor((u - p.fordShift) / p.fordSpacing);
    const height = this.halfWidth(u) + p.fordRise;
    let cut = 0;
    for (let k = base - 1; k <= base + 1; k++) {
      const du = Math.abs(u - (p.fordShift + k * p.fordSpacing));
      if (du < p.fordReach) cut = Math.max(cut, height * (1 - du / p.fordReach));
    }
    return cut;
  }

  /** Distance signée du coin au rivage : négative dans l'eau, positive sur la terre. */
  shoreField(x: number, y: number): number {
    const p = this.params;
    const u = x * p.rx + y * p.ry;
    const v = x * p.nx + y * p.ny;
    const raw = Math.abs(v - this.centerline(u)) - this.halfWidth(u) + this.fordCut(u);
    if (raw < 0) return raw;
    const bank = p.bankBase + p.bankAmp * Math.sin(p.bankW * u + p.bankP);
    return raw - bank * (1 - Math.exp(-raw / 1.6));
  }

  private waterAt(tx: number, ty: number): boolean {
    const s = (x: number, y: number) => this.shoreField(x, y);
    return s(tx, ty) + s(tx + 1, ty) + s(tx, ty + 1) + s(tx + 1, ty + 1) < 0;
  }

  /** Ajuste la rive pour que l'eau la plus proche du départ soit à bonne distance. */
  private placeRiver(): { x: number; y: number } {
    let best = this.nearWater();
    for (let i = 0; i < 6 && (best.dist < 15 || best.dist > 24); i++) {
      this.params.offset += 19.5 - best.dist;
      best = this.nearWater();
    }
    return { x: best.x + 0.5, y: best.y + 0.5 };
  }

  private nearWater(): { x: number; y: number; dist: number } {
    let bx = 0, by = 0, bd = Infinity;
    for (let y = -34; y <= 33; y++) {
      for (let x = -34; x <= 33; x++) {
        const dist = Math.hypot(x + 0.5, y + 0.5);
        if (dist >= bd || dist > 27) continue;
        if (this.waterAt(x, y)) { bd = dist; bx = x; by = y; }
      }
    }
    return { x: bx, y: by, dist: bd };
  }

  private fordPoint(u: number): { x: number; y: number } {
    const p = this.params, v = this.centerline(u);
    return { x: u * p.rx + v * p.nx, y: u * p.ry + v * p.ny };
  }

  // ------------------------------------------------------------ les gisements
  private makeBlobs(rnd: () => number): void {
    const p = this.params;
    const base = Math.atan2(-p.ny, -p.nx);
    const specs: [number, number, number, number, number][] = [
      [1, 0, 12, 3.4, 0.2], [2, 0.9, 17, 3.2, 0.2], [3, -0.9, 20, 3.0, 0.2], [4, Math.PI, 44, 4.2, 0.25],
    ];
    for (const [type, da, dist, r, jitter] of specs) {
      const a = base + da + (rnd() - 0.5) * jitter;
      const d = dist + rnd() * 2;
      const b: Blob = { x: Math.round(Math.cos(a) * d), y: Math.round(Math.sin(a) * d), r, type };
      const ux = Math.cos(a), uy = Math.sin(a);
      for (let i = 0; i < 12 && this.shoreField(b.x, b.y) < b.r + 2; i++) {
        b.x += Math.round(ux);
        b.y += Math.round(uy);
      }
      this.blobs.push(b);
    }
  }

  private makeScraps(rnd: () => number): void {
    for (let i = 0; i < 12; i++) {
      const a = rnd() * TAU + i * 0.52;
      const d = 8 + rnd() * 2;
      const x = Math.round(Math.cos(a) * d), y = Math.round(Math.sin(a) * d);
      if (this.shoreField(x, y) > 0) this.scraps.add(key(x, y));
    }
  }

  // ------------------------------------------------------------ les bosquets
  private chooseHomeGrove(): Grove {
    const p = this.params;
    const base = Math.atan2(-p.ny, -p.nx);
    const a = base - 1.25 + (hash01(7, 9, this.seed) - 0.5) * 0.25;
    const d = 12.5;
    return { x: Math.cos(a) * d, y: Math.sin(a) * d, r: 6 };
  }

  private regionalGrove(cx: number, cy: number): Grove | null {
    const k = key(cx, cy);
    const hit = this.groveCache.get(k);
    if (hit !== undefined) return hit;
    let g: Grove | null = null;
    if (hash01(cx, cy, this.seed + 501) < 0.55) {
      const x = cx * 48 + 8 + hash01(cx, cy, this.seed + 502) * 32;
      const y = cy * 48 + 8 + hash01(cx, cy, this.seed + 503) * 32;
      const r = 2.6 + hash01(cx, cy, this.seed + 504) * 2.2;
      if (Math.hypot(x, y) >= 28) g = { x, y, r };
    }
    this.groveCache.set(k, g);
    return g;
  }

  private groveStrength(x: number, y: number): number {
    let s = 0;
    const h = this.grove, dh = Math.hypot(x - h.x, y - h.y);
    if (dh < h.r) s = 1 - dh / h.r;
    const cx0 = Math.floor((x - 6) / 48), cx1 = Math.floor((x + 6) / 48);
    const cy0 = Math.floor((y - 6) / 48), cy1 = Math.floor((y + 6) / 48);
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const g = this.regionalGrove(cx, cy);
        if (!g) continue;
        const d = Math.hypot(x - g.x, y - g.y);
        if (d < g.r) s = Math.max(s, 1 - d / g.r);
      }
    }
    return s;
  }

  /** Densité de forêt en un point (0 = prairie, 1 = bosquet plein). Sert aussi au rendu du sol. */
  density(x: number, y: number): number {
    if (Math.hypot(x, y) < 6.5) return 0;
    const iso = 0.04 + 0.07 * fbm(x * 0.03, y * 0.03, this.seed + 6, 2);
    return Math.max(this.groveStrength(x, y), iso);
  }

  // ------------------------------------------------------------ les sentiers
  private bezier(p0: { x: number; y: number }, p2: { x: number; y: number }, bend: number): PathSegment[] {
    const dx = p2.x - p0.x, dy = p2.y - p0.y;
    const len = Math.hypot(dx, dy) || 1;
    const p1 = { x: (p0.x + p2.x) / 2 - (dy / len) * bend, y: (p0.y + p2.y) / 2 + (dx / len) * bend };
    const n = Math.max(6, Math.ceil(len / 3));
    const out: PathSegment[] = [];
    let ax = p0.x, ay = p0.y;
    for (let i = 1; i <= n; i++) {
      const t = i / n, s = 1 - t;
      const bx = s * s * p0.x + 2 * s * t * p1.x + t * t * p2.x;
      const by = s * s * p0.y + 2 * s * t * p1.y + t * t * p2.y;
      out.push({ ax, ay, bx, by });
      ax = bx; ay = by;
    }
    return out;
  }

  private makeCampPaths(rnd: () => number): void {
    const camp = { x: 0, y: 0 };
    const iron = this.blobs[0];
    const targets = [
      { x: this.grove.x, y: this.grove.y },
      { x: this.firstFord.x, y: this.firstFord.y },
      { x: iron.x, y: iron.y },
    ];
    for (const t of targets) {
      const bend = (rnd() - 0.5) * Math.hypot(t.x - camp.x, t.y - camp.y) * 0.22;
      this.campPaths.push(...this.bezier(camp, t, bend));
    }
  }

  /** Les sentiers d'une région : ils ne dépendent que de la graine et de la cellule. */
  private trails(cx: number, cy: number): PathSegment[] {
    const k = key(cx, cy);
    const hit = this.trailCache.get(k);
    if (hit) return hit;
    let out: PathSegment[] = [];
    if (!(cx === 0 && cy === 0) && hash01(cx, cy, this.seed + 901) < 0.45) {
      const x0 = cx * 128, y0 = cy * 128;
      const p0 = { x: x0 + 16 + hash01(cx, cy, this.seed + 902) * 96, y: y0 + 16 + hash01(cx, cy, this.seed + 903) * 96 };
      const p1 = { x: x0 + 16 + hash01(cx, cy, this.seed + 904) * 96, y: y0 + 16 + hash01(cx, cy, this.seed + 905) * 96 };
      const bend = (hash01(cx, cy, this.seed + 906) - 0.5) * 44;
      out = this.bezier(p0, p1, bend);
    }
    this.trailCache.set(k, out);
    return out;
  }

  /** Les segments qui passent à moins de 2 cases du bloc. */
  pathSegments(cx: number, cy: number): readonly PathSegment[] {
    const x0 = cx * CHUNK, y0 = cy * CHUNK, x1 = x0 + CHUNK, y1 = y0 + CHUNK;
    const out: PathSegment[] = [];
    for (const s of this.campPaths) if (segmentRect(s, x0 - 2, y0 - 2, x1 + 2, y1 + 2) <= 2) out.push(s);
    const ax = Math.floor((x0 - 2) / 128), bx = Math.floor((x1 + 2) / 128);
    const ay = Math.floor((y0 - 2) / 128), by = Math.floor((y1 + 2) / 128);
    for (let ty = ay; ty <= by; ty++) {
      for (let tx = ax; tx <= bx; tx++) {
        for (const s of this.trails(tx, ty)) if (segmentRect(s, x0 - 2, y0 - 2, x1 + 2, y1 + 2) <= 2) out.push(s);
      }
    }
    return out;
  }

  // ------------------------------------------------------------ les blocs
  chunk(cx: number, cy: number, create = true): Chunk | null {
    const l = this.last;
    if (l && l.cx === cx && l.cy === cy) return l;
    const k = key(cx, cy);
    let c = this.chunks.get(k) ?? null;
    if (!c && create) {
      c = new Chunk(cx, cy);
      this.chunks.set(k, c);
      this.list.push(c);
      this.generate(c);
    }
    if (c) this.last = c;
    return c;
  }

  at(x: number, y: number, create = true): Chunk | null { return this.chunk(x >> 5, y >> 5, create); }

  // --- accès par case (créent le bloc au besoin)
  ground(x: number, y: number): number { return this.at(x, y)!.ground[((y & 31) << 5) | (x & 31)]; }
  canopy(x: number, y: number): number { return this.at(x, y)!.canopy[((y & 31) << 5) | (x & 31)]; }
  deposit(x: number, y: number): number { return this.at(x, y)!.deposit[((y & 31) << 5) | (x & 31)]; }
  amount(x: number, y: number): number { return this.at(x, y)!.amount[((y & 31) << 5) | (x & 31)]; }
  slab(x: number, y: number): number { return this.at(x, y)!.slab[((y & 31) << 5) | (x & 31)]; }
  ent(x: number, y: number): number { return this.at(x, y)!.ent[((y & 31) << 5) | (x & 31)]; }
  loot(x: number, y: number): number { return this.at(x, y)!.loot[((y & 31) << 5) | (x & 31)]; }
  tree(x: number, y: number): boolean { return this.canopy(x, y) >= TREE_MIN; }
  takeLoot(x: number, y: number): boolean {
    const c = this.at(x, y)!; const i = ((y & 31) << 5) | (x & 31);
    if (!c.loot[i]) return false;
    c.loot[i] = 0; c.version++; c.urgent = true;
    return true;
  }

  setCanopy(x: number, y: number, v: number): void {
    const c = this.at(x, y)!; c.canopy[((y & 31) << 5) | (x & 31)] = v; c.version++; c.urgent = true;
  }
  setSlab(x: number, y: number, v: number): void {
    const c = this.at(x, y)!; const i = ((y & 31) << 5) | (x & 31);
    if (c.slab[i] !== v) { c.slabCount += v ? 1 : -1; c.slab[i] = v; c.version++; c.urgent = true; }
  }
  setEnt(x: number, y: number, id: number): void { this.at(x, y)!.ent[((y & 31) << 5) | (x & 31)] = id; }
  takeDeposit(x: number, y: number): boolean {
    const c = this.at(x, y)!; const i = ((y & 31) << 5) | (x & 31);
    if (c.amount[i] === 0) return false;
    if (--c.amount[i] === 0) { c.deposit[i] = 0; c.version++; c.urgent = true; }
    return true;
  }

  /** Fumée au point (x, y), interpolée au plus proche. */
  smokeAt(x: number, y: number): number {
    const c = this.at(x, y, false);
    return c ? c.smoke[(((y & 31) >> 2) << 3) | ((x & 31) >> 2)] : 0;
  }
  addSmoke(x: number, y: number, v: number): void {
    const c = this.at(x, y)!; c.smoke[(((y & 31) >> 2) << 3) | ((x & 31) >> 2)] += v; c.smokeSum += v;
  }

  ensureArea(x0: number, y0: number, x1: number, y1: number): void {
    for (let cy = y0 >> 5; cy <= (y1 >> 5); cy++)
      for (let cx = x0 >> 5; cx <= (x1 >> 5); cx++) this.chunk(cx, cy);
  }

  // ------------------------------------------------------------ génération
  private depositAt(x: number, y: number): [number, number] {
    const d = Math.hypot(x, y);
    for (const b of this.blobs) {
      const db = Math.hypot(x - b.x, y - b.y) + (hash01(x, y, this.seed + 31) - 0.5) * 1.2;
      if (db < b.r) return [b.type, Math.round(500 + 500 * (1 - db / b.r))];
    }
    if (d < 30) return [0, 0];
    const mins = [0, 30, 34, 38, 60];
    for (let t = 1; t <= 4; t++) {
      if (d < mins[t]) continue;
      const n = fbm(x * 0.06, y * 0.06, this.seed + 40 + t * 13, 3);
      const thr = 0.705 - Math.min(0.05, d / 6000);
      if (n > thr) return [t, Math.round((400 + (n - thr) * 9000) * (1 + d / 120))];
    }
    return [0, 0];
  }

  private pathDistance(x: number, y: number, paths: readonly PathSegment[]): number {
    let best = Infinity;
    for (const s of paths) {
      const d = segmentPoint(s, x, y);
      if (d < best) best = d;
    }
    return best;
  }

  private generate(c: Chunk): void {
    const n = CHUNK + 1, bx = c.cx * CHUNK, by = c.cy * CHUNK;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) c.shore[j * n + i] = this.shoreField(bx + i, by + j);
    }
    const paths = this.pathSegments(c.cx, c.cy);
    for (let ly = 0; ly < CHUNK; ly++) {
      for (let lx = 0; lx < CHUNK; lx++) {
        const x = bx + lx, y = by + ly, i = (ly << 5) | lx;
        const avg = (c.shore[ly * n + lx] + c.shore[ly * n + lx + 1] + c.shore[(ly + 1) * n + lx] + c.shore[(ly + 1) * n + lx + 1]) * 0.25;
        let g: number;
        if (avg < 0) g = GROUND_WATER;
        else if (this.pathDistance(x + 0.5, y + 0.5, paths) < PATH_TILE) g = GROUND_PATH;
        else if (avg < BANK_FIELD) g = GROUND_BANK;
        else g = GROUND_SOIL;
        c.ground[i] = g;
        if (g === GROUND_WATER) continue;
        const [type, amt] = this.depositAt(x, y);
        if (type) {
          c.deposit[i] = type;
          c.amount[i] = Math.min(65535, amt);
          continue;
        }
        if (g !== GROUND_SOIL) continue;
        const d = Math.hypot(x, y);
        if (this.scraps.has(key(x, y)) || (d > 26 && hash01(x, y, this.seed + 81) < 0.0022)) { c.loot[i] = 1; continue; }
        const dens = this.density(x, y);
        if (dens < 0.12) continue;
        const scaled = (dens - 0.08) / 0.92;
        if (hash01(x, y, this.seed + 9) > 0.01 + 0.99 * Math.pow(scaled, 0.8)) continue;
        const size = Math.round(Math.min(255, (95 + 150 * hash01(x, y, this.seed + 10)) * (0.7 + 0.3 * Math.min(1, dens))));
        c.cap[i] = size; c.canopy[i] = size;
      }
    }
  }
}

/** Distance d'un point à un segment. */
function segmentPoint(s: PathSegment, x: number, y: number): number {
  const dx = s.bx - s.ax, dy = s.by - s.ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - s.ax) * dx + (y - s.ay) * dy) / l2)) : 0;
  return Math.hypot(x - s.ax - t * dx, y - s.ay - t * dy);
}

/** Distance d'un segment à un rectangle, nulle s'il le touche. */
function segmentRect(s: PathSegment, x0: number, y0: number, x1: number, y1: number): number {
  const inRect = (x: number, y: number) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
  if (inRect(s.ax, s.ay) || inRect(s.bx, s.by)) return 0;
  if (segmentCrossesRect(s, x0, y0, x1, y1)) return 0;
  const corners: [number, number][] = [[x0, y0], [x1, y0], [x0, y1], [x1, y1]];
  let best = Math.min(segmentPoint(s, x0, (y0 + y1) / 2), segmentPoint(s, x1, (y0 + y1) / 2),
    segmentPoint(s, (x0 + x1) / 2, y0), segmentPoint(s, (x0 + x1) / 2, y1));
  for (const [x, y] of corners) best = Math.min(best, segmentPoint(s, x, y));
  return best;
}

function segmentCrossesRect(s: PathSegment, x0: number, y0: number, x1: number, y1: number): boolean {
  const edges: [number, number][] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  for (let i = 0; i < 4; i++) {
    const a = edges[i], b = edges[(i + 1) % 4];
    if (segmentsCross(s.ax, s.ay, s.bx, s.by, a[0], a[1], b[0], b[1])) return true;
  }
  return false;
}

function segmentsCross(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number): boolean {
  const d1 = cross(cx, cy, dx, dy, ax, ay), d2 = cross(cx, cy, dx, dy, bx, by);
  const d3 = cross(ax, ay, bx, by, cx, cy), d4 = cross(ax, ay, bx, by, dx, dy);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

function cross(ax: number, ay: number, bx: number, by: number, px: number, py: number): number {
  return (bx - ax) * (py - ay) - (by - ay) * (px - ax);
}
