/**
 * Le sol provisoire du rendu pixel : l'eau, l'herbe, les dalles et les débris d'un bloc.
 * Chaque bloc est peint une fois dans un canevas hors écran, gardé en cache et repeint quand
 * son contenu change. La partie qui choisit les couleurs est pure et se teste sous Node.
 */
import { CHUNK, GROUND_WATER, type Chunk, type World } from '../../sim/world';
import { C } from './palette';
import { hash, vnoise } from './noise';
import { makeSurface } from './surface';
import { TILE_PX } from './view';

/** Le côté d'un bloc peint, en pixels de pixel art. */
export const GROUND_PX = CHUNK * TILE_PX;

/** Le nombre de blocs gardés en cache avant de libérer le moins récemment vu. */
const CACHE_LIMIT = 64;

/** La profondeur maximale cherchée pour les bandes d'eau, en cases. */
const BAND_REACH = 6;

/** Les tons du sol, empaquetés en 0xRRGGBB pour peindre vite. */
const RGB = {
  q1: pack(C.q1), q3: pack(C.q3), q4: pack(C.q4), q5: pack(C.q5), q6: pack(C.q6),
  m1: pack(C.m1), m2: pack(C.m2), m3: pack(C.m3), m5: pack(C.m5),
  c0: pack(C.c0), c1: pack(C.c1), c2: pack(C.c2), c3: pack(C.c3), c4: pack(C.c4),
  s1: pack(C.s1), s3: pack(C.s3), ink: pack(C.ink),
} as const;

/** Empaquette une couleur `#rrggbb` en entier. */
function pack(hex: string): number {
  return parseInt(hex.slice(1), 16);
}

/** Tout ce qu'il faut savoir d'un pixel pour choisir sa couleur, sans API du navigateur. */
export interface GroundSample {
  /** Le pixel en coordonnées monde, une case valant 24 pixels. */
  wx: number;
  wy: number;
  /** La position du pixel dans sa case, de 0 à 23. */
  px: number;
  py: number;
  /** La case est de l'eau. */
  water: boolean;
  /** La distance au rivage en cases : 1 pour la première case d'eau, 0 pour la terre. */
  depth: number;
  /** Un bord de cette case d'eau touche la terre ferme. */
  rim: boolean;
  /** La case est dallée. */
  slab: boolean;
  /** Les cases voisines sont dallées, par point cardinal. */
  slabN: boolean;
  slabS: boolean;
  slabW: boolean;
  slabE: boolean;
  /** La case porte un débris. */
  loot: boolean;
  /** Le numéro de la case dans le monde, pour les taches. */
  tileX: number;
  tileY: number;
  /** La graine du monde. */
  seed: number;
}

/** La couleur RGB empaquetée d'un pixel de sol ; `0` signifie « rien dessiné ici ». */
export function groundPixel(s: GroundSample): number {
  if (s.loot) {
    const scrap = scrapPixel(s);
    if (scrap !== 0) return scrap;
  }
  if (s.water) return waterPixel(s);
  if (s.slab) return slabPixel(s);
  return grassPixel(s.wx, s.wy);
}

/** Peint un bloc entier en pixels RGBA, sans aucune API du navigateur. */
export function paintChunk(chunk: Chunk, world: World): Uint8ClampedArray {
  const n = CHUNK + BAND_REACH * 2;
  const water = new Uint8Array(n * n);
  const slab = new Uint8Array(n * n);
  const depth = new Uint8Array(CHUNK * CHUNK);
  const loot = new Uint8Array(CHUNK * CHUNK);
  const bx = chunk.cx * CHUNK;
  const by = chunk.cy * CHUNK;
  const at = (ax: number, ay: number): number => (ay + BAND_REACH) * n + (ax + BAND_REACH);

  for (let ay = -BAND_REACH; ay < CHUNK + BAND_REACH; ay++) {
    for (let ax = -BAND_REACH; ax < CHUNK + BAND_REACH; ax++) {
      const x = bx + ax;
      const y = by + ay;
      const inside = ax >= 0 && ax < CHUNK && ay >= 0 && ay < CHUNK;
      const c = inside ? chunk : world.at(x, y, false);
      if (!c) continue;
      const i = ((y & 31) << 5) | (x & 31);
      if (c.ground[i] === GROUND_WATER) water[at(ax, ay)] = 1;
      if (c.slab[i]) slab[at(ax, ay)] = 1;
      if (inside) loot[ay * CHUNK + ax] = c.loot[i];
    }
  }

  for (let ly = 0; ly < CHUNK; ly++) {
    for (let lx = 0; lx < CHUNK; lx++) {
      if (water[at(lx, ly)]) depth[ly * CHUNK + lx] = waterDepth(water, n, lx, ly);
    }
  }

  const out = new Uint8ClampedArray(GROUND_PX * GROUND_PX * 4);
  const sample: GroundSample = {
    wx: 0, wy: 0, px: 0, py: 0,
    water: false, depth: 0, rim: false,
    slab: false, slabN: false, slabS: false, slabW: false, slabE: false,
    loot: false, tileX: 0, tileY: 0, seed: world.seed,
  };
  for (let ly = 0; ly < CHUNK; ly++) {
    for (let lx = 0; lx < CHUNK; lx++) {
      const wet = water[at(lx, ly)] === 1;
      const x0 = (bx + lx) * TILE_PX;
      const y0 = (by + ly) * TILE_PX;
      const north = wet && !water[at(lx, ly - 1)];
      const south = wet && !water[at(lx, ly + 1)];
      const west = wet && !water[at(lx - 1, ly)];
      const east = wet && !water[at(lx + 1, ly)];
      sample.water = wet;
      sample.depth = depth[ly * CHUNK + lx];
      sample.slab = slab[at(lx, ly)] === 1;
      sample.slabN = slab[at(lx, ly - 1)] === 1;
      sample.slabS = slab[at(lx, ly + 1)] === 1;
      sample.slabW = slab[at(lx - 1, ly)] === 1;
      sample.slabE = slab[at(lx + 1, ly)] === 1;
      sample.loot = loot[ly * CHUNK + lx] === 1;
      sample.tileX = bx + lx;
      sample.tileY = by + ly;
      for (let py = 0; py < TILE_PX; py++) {
        sample.py = py;
        sample.wy = y0 + py;
        for (let px = 0; px < TILE_PX; px++) {
          sample.px = px;
          sample.wx = x0 + px;
          sample.rim = wet && ((py < 2 && north) || (py >= TILE_PX - 2 && south) || (px < 2 && west) || (px >= TILE_PX - 2 && east));
          const color = groundPixel(sample);
          const o = ((ly * TILE_PX + py) * GROUND_PX + lx * TILE_PX + px) * 4;
          out[o] = (color >> 16) & 255;
          out[o + 1] = (color >> 8) & 255;
          out[o + 2] = color & 255;
          out[o + 3] = 255;
        }
      }
    }
  }
  return out;
}

/** La distance au rivage d'une case d'eau, en cases, cherchée dans le voisinage du bloc. */
function waterDepth(water: Uint8Array, n: number, lx: number, ly: number): number {
  for (let r = 1; r <= BAND_REACH; r++) {
    for (let ay = -r; ay <= r; ay++) {
      for (let ax = -r; ax <= r; ax++) {
        if (Math.max(Math.abs(ax), Math.abs(ay)) !== r) continue;
        if (!water[(ly + ay + BAND_REACH) * n + lx + ax + BAND_REACH]) return r;
      }
    }
  }
  return BAND_REACH + 1;
}

/** L'herbe de la maquette : trois tons et une bande tramée sur les seuils. */
function grassPixel(wx: number, wy: number): number {
  const n = vnoise(wx * 0.016, wy * 0.016, 11);
  const checker = ((wx + wy) & 1) === 0;
  if (n > 0.67) return RGB.m1;
  if (n > 0.62) return checker ? RGB.m1 : RGB.m2;
  if (n > 0.37) return RGB.m2;
  if (n > 0.32) return checker ? RGB.m2 : RGB.m3;
  return RGB.m3;
}

/** L'eau : un liseré clair au bord, puis des bandes de plus en plus profondes. */
function waterPixel(s: GroundSample): number {
  if (s.rim) return RGB.q1;
  const wobble = vnoise(s.wx * 0.05, s.wy * 0.05, 17) - 0.5;
  const d = s.depth + wobble * 0.7;
  if (d <= 1.6) return RGB.q3;
  if (d <= 2.6) return RGB.q4;
  if (d <= 3.6) return RGB.q5;
  return RGB.q6;
}

/** Une dalle de béton : joints, lèvre en façade sud, mousse aux bords et taches. */
function slabPixel(s: GroundSample): number {
  const { px, py } = s;
  const north = !s.slabN;
  const south = !s.slabS;
  const west = !s.slabW;
  const east = !s.slabE;
  if (south) {
    if (py === TILE_PX - 1) return RGB.c4;
    if (py === TILE_PX - 2) return RGB.c3;
    if (py === TILE_PX - 3) return RGB.c2;
  }
  if (py === 0 || px === 0) {
    const mossN = north && py === 0 && px % 3 === 0 && hash(s.tileX, s.tileY, s.seed + 3) < 0.6;
    const mossW = west && px === 0 && py % 3 === 0 && hash(s.tileX, s.tileY, s.seed + 4) < 0.6;
    if (mossN || mossW) return RGB.m3;
    return RGB.c0;
  }
  if (px === TILE_PX - 1) return east ? RGB.c2 : RGB.c3;
  if (py === TILE_PX - 1) return south ? RGB.c4 : RGB.c2;
  const stain = hash(s.tileX, s.tileY, s.seed + 31);
  if (stain < 0.4) {
    const a = 3 + Math.floor(hash(s.tileX, s.tileY, s.seed + 32) * 12);
    const b = 3 + Math.floor(hash(s.tileX, s.tileY, s.seed + 33) * 12);
    if (px >= a && px < a + 3 && py >= b && py < b + 3 && ((px + py) & 1) === 0) return RGB.c2;
  } else if (stain > 0.86) {
    const a = 4 + Math.floor(hash(s.tileX, s.tileY, s.seed + 34) * 12);
    const b = 4 + Math.floor(hash(s.tileX, s.tileY, s.seed + 35) * 12);
    if (px >= a && px <= a + 5 && px - a === py - b) return RGB.c3;
  }
  return RGB.c1;
}

/** La silhouette d'un petit morceau de ferraille, en coordonnées de case. */
function inScrap(x: number, y: number): boolean {
  return (x >= 6 && x <= 15 && y >= 9 && y <= 14) || (x >= 12 && x <= 17 && y >= 12 && y <= 16);
}

/** Un débris : de la ferraille claire cernée d'encre, ou `0` hors du morceau. */
function scrapPixel(s: GroundSample): number {
  if (inScrap(s.px, s.py)) return hash(s.wx, s.wy, s.seed + 41) < 0.22 ? RGB.s3 : RGB.s1;
  const edge = inScrap(s.px - 1, s.py) || inScrap(s.px + 1, s.py) || inScrap(s.px, s.py - 1) || inScrap(s.px, s.py + 1);
  return edge ? RGB.ink : 0;
}

/** La signature de ce que le sol peint vraiment : eau, dalles et débris, sans les arbres. */
export function groundSignature(chunk: Chunk): number {
  let sig = 0;
  for (let i = 0; i < CHUNK * CHUNK; i++) {
    const cell = chunk.ground[i] | (chunk.slab[i] << 1) | (chunk.loot[i] << 2);
    sig = (sig * 33 + (i + 1) * (cell + 1)) | 0;
  }
  return sig;
}

/** Vrai si au moins la moitié des cases du bloc est de l'eau. */
export function chunkMostlyWater(chunk: Chunk): boolean {
  let water = 0;
  for (let i = 0; i < CHUNK * CHUNK; i++) {
    if (chunk.ground[i] === GROUND_WATER) water++;
  }
  return water * 2 >= CHUNK * CHUNK;
}

/** Une entrée du cache : le canevas peint et la signature du sol qu'il représente. */
interface CacheEntry {
  canvas: HTMLCanvasElement;
  sig: number;
  used: number;
}

/** Le cache des blocs de sol, limité aux 64 blocs les plus récemment vus. */
export class GroundCache {
  private readonly entries = new Map<Chunk, CacheEntry>();
  private budget = 0;

  /** Ouvre une image : un seul bloc sera peint, sauf si rien n'est encore peint du tout. */
  beginFrame(): void {
    this.budget = this.entries.size === 0 ? Number.MAX_SAFE_INTEGER : 1;
  }

  /** Oublie tous les blocs peints. */
  clear(): void {
    this.entries.clear();
  }

  /** Le canevas peint d'un bloc, `null` s'il attend son tour ; repeint si son sol a changé. */
  get(chunk: Chunk, world: World, frame: number): HTMLCanvasElement | null {
    let entry = this.entries.get(chunk);
    if (!entry) {
      if (this.budget <= 0) return null;
      const { canvas } = makeSurface(GROUND_PX, GROUND_PX);
      entry = { canvas, sig: NaN, used: frame };
      this.entries.set(chunk, entry);
    }
    entry.used = frame;
    const sig = groundSignature(chunk);
    if (entry.sig !== sig && this.budget > 0) {
      this.budget--;
      const ctx = entry.canvas.getContext('2d');
      if (!ctx) throw new Error('Contexte 2D indisponible');
      const image = ctx.createImageData(GROUND_PX, GROUND_PX);
      image.data.set(paintChunk(chunk, world));
      ctx.putImageData(image, 0, 0);
      entry.sig = sig;
    }
    this.evict();
    return entry.canvas;
  }

  /** Libère le bloc le moins récemment vu tant que le cache dépasse sa limite. */
  private evict(): void {
    if (this.entries.size <= CACHE_LIMIT) return;
    let oldest: Chunk | null = null;
    let used = Infinity;
    for (const [chunk, entry] of this.entries) {
      if (entry.used < used) {
        used = entry.used;
        oldest = chunk;
      }
    }
    if (oldest) this.entries.delete(oldest);
  }
}
