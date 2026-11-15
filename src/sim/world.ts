// Le monde : une grille infinie découpée en blocs de 32×32, générée à la demande.

import { fbm, hash01, mulberry32 } from './rng';
import { TREE_MIN } from './data';

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
  loot = new Uint8Array(CHUNK * CHUNK);      // débris à ramasser (1 = ferraille)
  cap = new Uint8Array(CHUNK * CHUNK);       // taille adulte de l'arbre de cette case (0 = pas d'arbre)
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
  scraps = new Set<number>();  // débris du module, autour du départ
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
    for (let i = 0; i < 12; i++) {
      const p = at(base + i * 0.52 + rnd() * 0.3, 5 + rnd() * 3.5);
      if (Math.max(Math.abs(p.x), Math.abs(p.y)) >= 4) this.scraps.add(key(p.x, p.y));
    }
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
  loot(x: number, y: number): number { return this.at(x, y)!.loot[((y & 31) << 5) | (x & 31)]; }
  /** Y a-t-il un arbre adulte sur cette case ? */
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

  /** Densité de forêt en un point (0 = clairière, 1 = jungle épaisse). Sert aussi au rendu du sol. */
  density(x: number, y: number): number {
    const d = Math.hypot(x, y);
    let dens = 0.35 + 0.75 * fbm(x * 0.045, y * 0.045, this.seed + 5, 3);
    const clearing = fbm(x * 0.02, y * 0.02, this.seed + 6, 2);
    if (clearing < 0.32) dens *= clearing / 0.32;
    if (d < 6.5) dens = 0; else if (d < 12) dens *= (d - 6.5) / 5.5;
    return dens;
  }

  private generate(c: Chunk): void {
    for (let ly = 0; ly < CHUNK; ly++) {
      for (let lx = 0; lx < CHUNK; lx++) {
        const x = c.cx * CHUNK + lx, y = c.cy * CHUNK + ly, i = (ly << 5) | lx;
        const d = Math.hypot(x, y);
        if (this.isWater(x, y)) { c.ground[i] = GROUND_WATER; continue; }
        const [type, amt] = this.depositAt(x, y);
        c.deposit[i] = type;
        c.amount[i] = Math.min(65535, amt);
        if (type) continue;                                   // rien ne pousse sur la roche
        if (this.scraps.has(key(x, y)) || (d > 26 && hash01(x, y, this.seed + 81) < 0.0022)) { c.loot[i] = 1; continue; }
        // forêt : dense par endroits, trouée de clairières ; chaque case porte un arbre ou rien
        const dens = this.density(x, y);
        if (dens < 0.15 || hash01(x, y, this.seed + 9) > 0.08 + 0.5 * dens) continue;
        const size = Math.round(Math.min(255, (100 + 155 * hash01(x, y, this.seed + 10)) * (0.65 + 0.35 * Math.min(1, dens))));
        c.cap[i] = size; c.canopy[i] = size;
      }
    }
  }
}
