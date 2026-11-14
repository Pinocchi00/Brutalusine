// Le monde : une grille infinie découpée en blocs de 32×32, générée à la demande.

import { fbm, hash01, mulberry32 } from './rng';

export const CHUNK = 32;
export const GROUND_SOIL = 0;
export const GROUND_WATER = 1;
export const SMOKE_RES = 8;   // 8×8 cellules de fumée par bloc (4 cases chacune)

export class Chunk {
  ground = new Uint8Array(CHUNK * CHUNK);
  canopy = new Uint8Array(CHUNK * CHUNK);    // densité de canopée 0-255
  deposit = new Uint8Array(CHUNK * CHUNK);   // type de gisement
  amount = new Uint16Array(CHUNK * CHUNK);   // unités restantes
  slab = new Uint8Array(CHUNK * CHUNK);
  ent = new Int32Array(CHUNK * CHUNK);       // identifiant d'entité (0 = vide)
  region = new Uint16Array(CHUNK * CHUNK);   // réseau électrique
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

const key = (cx: number, cy: number) => (cx + 32768) * 65536 + (cy + 32768);

export class World {
  chunks = new Map<number, Chunk>();
  list: Chunk[] = [];
  blobs: Blob[] = [];          // gisements garantis près du départ
  lake: { x: number; y: number; r: number };
  firstTree: { x: number; y: number };
  /** Appelé quand la génération fait naître un Éventail. */
  onTree: ((x: number, y: number) => void) | null = null;
  private last: Chunk | null = null;

  constructor(public seed: number) {
    const rnd = mulberry32(seed ^ 0x9e3779b9);
    const base = rnd() * Math.PI * 2;
    const at = (angle: number, dist: number) => ({ x: Math.round(Math.cos(angle) * dist), y: Math.round(Math.sin(angle) * dist) });
    // hématite, calcaire, quartz proches ; chalcopyrite plus loin
    const specs: [number, number, number, number][] = [[1, 0, 12, 3.4], [2, 2.1, 17, 3.2], [3, 4.2, 20, 3.0], [4, 1.1, 44, 4.2]];
    for (const [type, da, dist, r] of specs) {
      const p = at(base + da + (rnd() - 0.5) * 0.5, dist + rnd() * 2);
      this.blobs.push({ ...p, r, type });
    }
    const lp = at(base + 3.2 + (rnd() - 0.5) * 0.4, 32);
    this.lake = { ...lp, r: 5.5 };
    const tp = at(base + 5.3 + (rnd() - 0.5) * 0.4, 27);
    this.firstTree = tp;
  }

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
  region(x: number, y: number): number { return this.at(x, y)!.region[((y & 31) << 5) | (x & 31)]; }

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
  private isWater(x: number, y: number): boolean {
    const d2 = x * x + y * y;
    const lk = this.lake;
    const dl = Math.hypot(x - lk.x, y - lk.y);
    if (dl < lk.r + (fbm(x * 0.2, y * 0.2, this.seed + 7, 2) - 0.5) * 3) return true;
    if (d2 < 24 * 24) return false;
    const r = fbm(x * 0.011, y * 0.011, this.seed + 1, 3);
    const width = 0.012 + 0.008 * fbm(x * 0.05, y * 0.05, this.seed + 2, 2);
    return Math.abs(r - 0.5) < width;
  }

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

  private treeHere(x: number, y: number): boolean {
    if (x === this.firstTree.x && y === this.firstTree.y) return true;
    const G = 30;
    const gx = Math.floor(x / G), gy = Math.floor(y / G);
    if (hash01(gx, gy, this.seed + 71) > 0.55) return false;
    const tx = gx * G + 3 + Math.floor(hash01(gx, gy, this.seed + 72) * (G - 8));
    const ty = gy * G + 3 + Math.floor(hash01(gx, gy, this.seed + 73) * (G - 8));
    return tx === x && ty === y && Math.hypot(x, y) > 36;
  }

  private generate(c: Chunk): void {
    const trees: [number, number][] = [];
    for (let ly = 0; ly < CHUNK; ly++) {
      for (let lx = 0; lx < CHUNK; lx++) {
        const x = c.cx * CHUNK + lx, y = c.cy * CHUNK + ly, i = (ly << 5) | lx;
        const d = Math.hypot(x, y);
        if (this.isWater(x, y)) { c.ground[i] = GROUND_WATER; continue; }
        const [type, amt] = this.depositAt(x, y);
        c.deposit[i] = type;
        c.amount[i] = Math.min(65535, amt);
        // canopée : dense partout, clairières ponctuelles, clairsemée sur les gisements
        let can = 0.5 + 0.6 * fbm(x * 0.045, y * 0.045, this.seed + 5, 3);
        const clearing = fbm(x * 0.02, y * 0.02, this.seed + 6, 2);
        if (clearing < 0.3) can *= clearing / 0.3;
        can += (hash01(x, y, this.seed + 9) - 0.5) * 0.25;
        if (type) can *= 0.12;
        if (d < 6.5) can = 0; else if (d < 12) can *= (d - 6.5) / 5.5;
        c.canopy[i] = Math.max(0, Math.min(255, Math.round(can * 255)));
        if (this.treeHere(x, y)) trees.push([x, y]);
      }
    }
    for (const [x, y] of trees) this.onTree?.(x, y);
  }
}
