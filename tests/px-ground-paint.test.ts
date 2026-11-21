/**
 * Les propriétés de la peinture du sol : déterminisme, opacité, découpe, décor contenu et débris.
 */
import { describe, expect, it } from 'vitest';
import { CHUNK } from '../src/sim/world';
import { C } from '../src/render/px/palette';
import { TILE_PX } from '../src/render/px/view';
import {
  paintGroundCore,
  paintTiles,
  type GroundPathSegment,
  type GroundSource,
} from '../src/render/px/groundPaint';

const CORNER = CHUNK + 1;
const SLAB_SIDE = CHUNK + 2;

/** Empaquette une couleur `#rrggbb` en entier. */
function pack(hex: string): number {
  return parseInt(hex.slice(1), 16);
}

const S1 = pack(C.s1);
const S3 = pack(C.s3);
const INK = pack(C.ink);
const SD0 = pack(C.sd0);
const SD1 = pack(C.sd1);
const SD2 = pack(C.sd2);
const SD3 = pack(C.sd3);
const M1 = pack(C.m1);
const E2 = pack(C.e2);
const Q1 = pack(C.q1);
const Q2 = pack(C.q2);
const Q3 = pack(C.q3);
const Q4 = pack(C.q4);
const Q5 = pack(C.q5);
const Q6 = pack(C.q6);
const Q7 = pack(C.q7);
const ST0 = pack(C.st0);
const ST1 = pack(C.st1);
const ST3 = pack(C.st3);

/** La couleur d'un pixel d'un tampon RGBA. */
function pixelColor(buf: Uint8ClampedArray, index: number): number {
  const o = index * 4;
  return (buf[o] << 16) | (buf[o + 1] << 8) | buf[o + 2];
}

/** La bande d'eau d'une couleur, de 1 (q1) à 7 (q7), ou 0 hors de l'eau. */
function waterBand(color: number): number {
  if (color === Q1) return 1;
  if (color === Q2) return 2;
  if (color === Q3) return 3;
  if (color === Q4) return 4;
  if (color === Q5) return 5;
  if (color === Q6) return 6;
  if (color === Q7) return 7;
  return 0;
}

/** Une scène synthétique, indépendante du découpage en blocs. */
interface Scene {
  shore(cx: number, cy: number): number;
  ford?(cx: number, cy: number): number;
  slab(tx: number, ty: number): boolean;
  paths: readonly GroundPathSegment[];
  loot(tx: number, ty: number): boolean;
}

/** Construit la source d'un bloc à partir d'une scène globale. */
function blockSource(scene: Scene, originX: number, originY: number): GroundSource {
  const shore = new Float64Array(CORNER * CORNER);
  for (let j = 0; j < CORNER; j++) {
    for (let i = 0; i < CORNER; i++) shore[j * CORNER + i] = scene.shore(originX + i, originY + j);
  }
  const ford = new Float64Array(CORNER * CORNER);
  if (scene.ford) {
    for (let j = 0; j < CORNER; j++) {
      for (let i = 0; i < CORNER; i++) ford[j * CORNER + i] = scene.ford(originX + i, originY + j);
    }
  }
  const slab = new Uint8Array(SLAB_SIDE * SLAB_SIDE);
  for (let ly = -1; ly <= CHUNK; ly++) {
    for (let lx = -1; lx <= CHUNK; lx++) {
      slab[(ly + 1) * SLAB_SIDE + lx + 1] = scene.slab(originX + lx, originY + ly) ? 1 : 0;
    }
  }
  const loot = new Uint8Array(CHUNK * CHUNK);
  for (let ly = 0; ly < CHUNK; ly++) {
    for (let lx = 0; lx < CHUNK; lx++) {
      loot[ly * CHUNK + lx] = scene.loot(originX + lx, originY + ly) ? 1 : 0;
    }
  }
  return { seed: 4242, originX, originY, shore, ford, paths: scene.paths, slab, loot };
}

/** Les indices des pixels dont le RGBA diffère entre deux tampons. */
function diffPixels(a: Uint8ClampedArray, b: Uint8ClampedArray): number[] {
  const out: number[] = [];
  for (let i = 0; i < a.length; i += 4) {
    if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3]) {
      out.push(i / 4);
    }
  }
  return out;
}

const richScene: Scene = {
  shore: (cx, cy) => (cx - 40) * 0.4 + Math.sin(cy * 0.23) * 1.2,
  slab: (tx, ty) => tx >= 15 && tx <= 20 && ty >= 8 && ty <= 12,
  paths: [
    { ax: 2, ay: 20, bx: 18, by: 6 },
    { ax: 8, ay: 2, bx: 14, by: 30 },
  ],
  loot: (tx, ty) => (tx === 10 && ty === 10) || (tx === 26 && ty === 5),
};

describe('peinture du sol', () => {
  it('est déterministe et peint tous les pixels en opaque', () => {
    const src = blockSource(richScene, 0, 0);
    const a = new Uint8ClampedArray(CHUNK * TILE_PX * CHUNK * TILE_PX * 4);
    const b = new Uint8ClampedArray(CHUNK * TILE_PX * CHUNK * TILE_PX * 4);
    paintTiles(src, a, 0, 0, CHUNK, CHUNK);
    paintTiles(src, b, 0, 0, CHUNK, CHUNK);
    expect(diffPixels(a, b)).toEqual([]);
    for (let i = 3; i < a.length; i += 4) {
      if (a[i] !== 255) throw new Error(`pixel transparent à l’octet ${i}`);
    }
  });

  it('donne exactement la même zone pour un sous-rectangle, coordonnées négatives et dalles comprises', () => {
    const scene: Scene = {
      shore: (cx, cy) => (cx + 24) * 0.5 + Math.sin(cy * 0.2),
      slab: (tx, ty) => (tx >= -20 && tx <= -12 && ty >= -20 && ty <= -12) || (tx >= -12 && tx <= -10 && ty >= -16 && ty <= -10),
      paths: [{ ax: -28, ay: -25, bx: -6, by: -14 }],
      loot: (tx, ty) => tx === -25 && ty === -25,
    };
    const src = blockSource(scene, -CHUNK, -CHUNK);
    const full = new Uint8ClampedArray(CHUNK * TILE_PX * CHUNK * TILE_PX * 4);
    paintTiles(src, full, -CHUNK, -CHUNK, 0, 0);
    const rects = [
      [-CHUNK, -CHUNK, -CHUNK + 6, -CHUNK + 6],
      [-19, -19, -12, -12],
      [-13, -13, -9, -9],
      [-9, -9, -4, -4],
      [-1, -1, 0, 0],
    ] as const;
    for (const [x0, y0, x1, y1] of rects) {
      const w = (x1 - x0) * TILE_PX;
      const h = (y1 - y0) * TILE_PX;
      const part = new Uint8ClampedArray(w * h * 4);
      paintTiles(src, part, x0, y0, x1, y1);
      for (let ry = 0; ry < h; ry++) {
        for (let rx = 0; rx < w; rx++) {
          const a = (ry * w + rx) * 4;
          const b = (((y0 + CHUNK) * TILE_PX + ry) * CHUNK * TILE_PX + (x0 + CHUNK) * TILE_PX + rx) * 4;
          for (let k = 0; k < 4; k++) {
            if (part[a + k] !== full[b + k]) {
              throw new Error(`pixel (${rx},${ry}) du rectangle ${x0},${y0},${x1},${y1} diffère`);
            }
          }
        }
      }
    }
  });

  it('peint toute case dallée comme une dalle, même sur sable ou avec un coin dans l’eau', () => {
    const slab = (tx: number, ty: number): boolean => tx >= 3 && tx <= 5 && ty >= 3 && ty <= 5;
    const prairie: Scene = { shore: () => 6, slab, paths: [], loot: () => false };
    const sable: Scene = { shore: () => 1.2, slab, paths: [], loot: () => false };
    const coin: Scene = {
      shore: (cx, cy) => (cx === 3 && cy === 3 ? -0.5 : 6),
      slab,
      paths: [],
      loot: () => false,
    };
    const width = 6 * TILE_PX;
    const paint = (scene: Scene): Uint8ClampedArray => {
      const out = new Uint8ClampedArray(width * width * 4);
      paintGroundCore(blockSource(scene, 0, 0), out, 0, 0, 6, 6);
      return out;
    };
    const reference = paint(prairie);
    for (const [name, scene] of [['sable', sable], ['coin négatif', coin]] as const) {
      const got = paint(scene);
      for (let ty = 3; ty <= 5; ty++) {
        for (let tx = 3; tx <= 5; tx++) {
          for (let py = 0; py < TILE_PX; py++) {
            for (let px = 0; px < TILE_PX; px++) {
              const x = tx * TILE_PX + px;
              const y = ty * TILE_PX + py;
              const o = (y * width + x) * 4;
              for (let k = 0; k < 4; k++) {
                if (got[o + k] !== reference[o + k]) {
                  throw new Error(`dalle ${name} différente en (${x},${y})`);
                }
              }
            }
          }
        }
      }
    }
  });

  it('ne pose aucun décor sur les dalles et préserve l’ombre m5 qui déborde', () => {
    const scene: Scene = {
      shore: () => 1.4,
      slab: (tx, ty) => tx >= 8 && tx <= 16 && ty >= 8 && ty <= 16,
      paths: [],
      loot: () => false,
    };
    const src = blockSource(scene, 0, 0);
    const width = 20 * TILE_PX;
    const full = new Uint8ClampedArray(width * width * 4);
    const core = new Uint8ClampedArray(width * width * 4);
    paintTiles(src, full, 0, 0, 20, 20);
    paintGroundCore(src, core, 0, 0, 20, 20);
    for (let ty = 8; ty <= 16; ty++) {
      for (let tx = 8; tx <= 16; tx++) {
        for (let py = 0; py < TILE_PX; py++) {
          for (let px = 0; px < TILE_PX; px++) {
            const x = tx * TILE_PX + px;
            const y = ty * TILE_PX + py;
            const o = (y * width + x) * 4;
            for (let k = 0; k < 4; k++) {
              if (full[o + k] !== core[o + k]) {
                throw new Error(`décor sur la dalle en (${x},${y})`);
              }
            }
          }
        }
      }
    }
    const m5 = pack(C.m5);
    for (let y = 0; y < width; y++) {
      for (let x = 0; x < width; x++) {
        const o = (y * width + x) * 4;
        const coreColor = (core[o] << 16) | (core[o + 1] << 8) | core[o + 2];
        if (coreColor !== m5) continue;
        const fullColor = (full[o] << 16) | (full[o + 1] << 8) | full[o + 2];
        if (fullColor !== m5) throw new Error(`ombre m5 écrasée en (${x},${y})`);
      }
    }
  });

  it('donne le même sous-rectangle que le bloc entier avec des dalles sur sable', () => {
    const scene: Scene = {
      shore: () => 1.4,
      slab: (tx, ty) => tx >= 8 && tx <= 16 && ty >= 8 && ty <= 16,
      paths: [],
      loot: () => false,
    };
    const src = blockSource(scene, 0, 0);
    const full = new Uint8ClampedArray(CHUNK * TILE_PX * CHUNK * TILE_PX * 4);
    paintTiles(src, full, 0, 0, CHUNK, CHUNK);
    const rects = [[7, 7, 15, 15], [9, 13, 22, 22], [16, 16, 18, 18]] as const;
    for (const [x0, y0, x1, y1] of rects) {
      const w = (x1 - x0) * TILE_PX;
      const h = (y1 - y0) * TILE_PX;
      const part = new Uint8ClampedArray(w * h * 4);
      paintTiles(src, part, x0, y0, x1, y1);
      for (let ry = 0; ry < h; ry++) {
        for (let rx = 0; rx < w; rx++) {
          const a = (ry * w + rx) * 4;
          const b = (((y0 * TILE_PX + ry) * CHUNK * TILE_PX) + (x0 * TILE_PX + rx)) * 4;
          for (let k = 0; k < 4; k++) {
            if (part[a + k] !== full[b + k]) {
              throw new Error(`pixel (${rx},${ry}) du rectangle ${x0},${y0},${x1},${y1} diffère`);
            }
          }
        }
      }
    }
  });

  it('garde l’écume et les galets dans leur case', () => {
    const foam: Scene = {
      shore: (cx, cy) => (cx >= 2 && cx <= 3 && cy >= 2 && cy <= 3 ? -0.5 : -5),
      slab: () => false,
      paths: [],
      loot: () => false,
    };
    const pebble: Scene = {
      shore: (cx, cy) => (cx >= 2 && cx <= 3 && cy >= 2 && cy <= 3 ? 0.5 : 5),
      slab: () => false,
      paths: [],
      loot: () => false,
    };
    for (const scene of [foam, pebble]) {
      const src = blockSource(scene, 0, 0);
      const full = new Uint8ClampedArray(6 * TILE_PX * 6 * TILE_PX * 4);
      const core = new Uint8ClampedArray(6 * TILE_PX * 6 * TILE_PX * 4);
      paintTiles(src, full, 0, 0, 6, 6);
      paintGroundCore(src, core, 0, 0, 6, 6);
      const diff = diffPixels(full, core);
      expect(diff.length).toBeGreaterThan(0);
      for (const p of diff) {
        const x = p % (6 * TILE_PX);
        const y = Math.floor(p / (6 * TILE_PX));
        if (x < 2 * TILE_PX || x >= 3 * TILE_PX || y < 2 * TILE_PX || y >= 3 * TILE_PX) {
          throw new Error(`marque hors de sa case au pixel (${x},${y})`);
        }
      }
    }
  });

  it('réserve les pierres de gué aux cases où un sentier arrive près de l’eau', () => {
    const scene: Scene = {
      shore: (cx, cy) => (cx >= 2 && cx <= 3 && cy >= 2 && cy <= 3 ? 0.5 : 5),
      slab: () => false,
      paths: [{ ax: 2.2, ay: 2.2, bx: 2.8, by: 2.8 }],
      loot: () => false,
    };
    const src = blockSource(scene, 0, 0);
    const full = new Uint8ClampedArray(6 * TILE_PX * 6 * TILE_PX * 4);
    const core = new Uint8ClampedArray(6 * TILE_PX * 6 * TILE_PX * 4);
    paintTiles(src, full, 0, 0, 6, 6);
    paintGroundCore(src, core, 0, 0, 6, 6);
    const diff = diffPixels(full, core);
    expect(diff.length).toBeGreaterThan(0);
    for (const p of diff) {
      const x = p % (6 * TILE_PX);
      const y = Math.floor(p / (6 * TILE_PX));
      if (x < 2 * TILE_PX || x >= 3 * TILE_PX || y < 2 * TILE_PX || y >= 3 * TILE_PX) {
        throw new Error(`pierre de gué hors de sa case au pixel (${x},${y})`);
      }
    }
  });

  it('garde les taches d’argile sur le sable sec et dans les tons voulus', () => {
    const scene: Scene = {
      shore: () => 1.5,
      slab: () => false,
      paths: [],
      loot: () => false,
    };
    const src = blockSource(scene, 0, 0);
    const full = new Uint8ClampedArray(6 * TILE_PX * 6 * TILE_PX * 4);
    const core = new Uint8ClampedArray(6 * TILE_PX * 6 * TILE_PX * 4);
    paintTiles(src, full, 0, 0, 6, 6);
    paintGroundCore(src, core, 0, 0, 6, 6);
    const diff = diffPixels(full, core);
    expect(diff.length).toBeGreaterThan(0);
    for (const p of diff) {
      const o = p * 4;
      const coreColor = (core[o] << 16) | (core[o + 1] << 8) | core[o + 2];
      if (coreColor !== SD0 && coreColor !== SD1 && coreColor !== SD2 && coreColor !== M1) {
        throw new Error(`argile hors du sable sec : ${coreColor.toString(16)}`);
      }
      const clayColor = (full[o] << 16) | (full[o + 1] << 8) | full[o + 2];
      if (clayColor !== SD3 && clayColor !== E2) {
        throw new Error(`couleur d’argile inattendue : ${clayColor.toString(16)}`);
      }
    }
  });

  it('garde l’argile rare et groupée sur une longue rive', () => {
    const scene: Scene = {
      shore: () => 1.4,
      slab: () => false,
      paths: [],
      loot: () => false,
    };
    const src = blockSource(scene, 0, 0);
    const width = CHUNK * TILE_PX;
    const full = new Uint8ClampedArray(width * width * 4);
    const core = new Uint8ClampedArray(width * width * 4);
    paintTiles(src, full, 0, 0, CHUNK, CHUNK);
    paintGroundCore(src, core, 0, 0, CHUNK, CHUNK);
    const clayTiles = new Set<number>();
    for (let y = 0; y < width; y++) {
      for (let x = 0; x < width; x++) {
        const o = (y * width + x) * 4;
        if (full[o] === core[o] && full[o + 1] === core[o + 1] && full[o + 2] === core[o + 2]) continue;
        clayTiles.add(Math.floor(y / TILE_PX) * CHUNK + Math.floor(x / TILE_PX));
      }
    }
    const ratio = clayTiles.size / (CHUNK * CHUNK);
    expect(ratio).toBeGreaterThanOrEqual(0.02);
    expect(ratio).toBeLessThanOrEqual(0.09);
  });

  it('garde la silhouette et les couleurs de la ferraille', () => {
    const scene: Scene = {
      shore: () => 5,
      slab: () => false,
      paths: [],
      loot: (tx, ty) => tx === 4 && ty === 4,
    };
    const src = blockSource(scene, 0, 0);
    const withLoot = new Uint8ClampedArray(6 * TILE_PX * 6 * TILE_PX * 4);
    paintTiles(src, withLoot, 0, 0, 6, 6);
    const cleanSrc = { ...src, loot: new Uint8Array(CHUNK * CHUNK) };
    const clean = new Uint8ClampedArray(6 * TILE_PX * 6 * TILE_PX * 4);
    paintTiles(cleanSrc, clean, 0, 0, 6, 6);
    const diff = diffPixels(withLoot, clean);
    expect(diff.length).toBeGreaterThan(0);
    const width = 6 * TILE_PX;
    for (const p of diff) {
      const x = p % width;
      const y = Math.floor(p / width);
      if (x < 4 * TILE_PX || x >= 5 * TILE_PX || y < 4 * TILE_PX || y >= 5 * TILE_PX) {
        throw new Error(`débris hors de sa case au pixel (${x},${y})`);
      }
      const o = p * 4;
      const color = (withLoot[o] << 16) | (withLoot[o + 1] << 8) | withLoot[o + 2];
      if (color !== S1 && color !== S3 && color !== INK) {
        throw new Error(`couleur de ferraille inattendue : ${color.toString(16)}`);
      }
    }
  });

  it('garde les bandes profondes quand le gué est nul', () => {
    const scene: Scene = {
      shore: () => -4,
      slab: () => false,
      paths: [],
      loot: () => false,
    };
    const src = blockSource(scene, 0, 0);
    const width = 6 * TILE_PX;
    const out = new Uint8ClampedArray(width * width * 4);
    paintTiles(src, out, 0, 0, 6, 6);
    let deep = 0;
    let light = 0;
    for (let i = 0; i < width * width; i++) {
      const color = pixelColor(out, i);
      if (color === Q5 || color === Q6 || color === Q7) deep++;
      if (color === Q1) light++;
    }
    expect(deep).toBeGreaterThan(0);
    expect(light).toBe(0);
  });

  it('éclaircit le plein gué en q1 et q2, sans aucune bande profonde', () => {
    const scene: Scene = {
      shore: () => -6,
      ford: () => 1,
      slab: () => false,
      paths: [],
      loot: () => false,
    };
    const src = blockSource(scene, 0, 0);
    const width = 8 * TILE_PX;
    const out = new Uint8ClampedArray(width * width * 4);
    paintTiles(src, out, 0, 0, 8, 8);
    let q1 = 0;
    let q2 = 0;
    for (let i = 0; i < width * width; i++) {
      const color = pixelColor(out, i);
      const band = waterBand(color);
      if (band > 2) throw new Error(`bande profonde ${band} au pixel ${i}`);
      if (color === Q1) q1++;
      if (color === Q2) q2++;
    }
    expect(q1).toBeGreaterThan(0);
    expect(q2).toBeGreaterThan(0);
  });

  it('fait remonter les bandes en douceur quand le gué augmente', () => {
    const tiles = 16;
    const scene: Scene = {
      shore: () => -6,
      ford: (cx) => Math.max(0, Math.min(1, cx / 15)),
      slab: () => false,
      paths: [],
      loot: () => false,
    };
    const src = blockSource(scene, 0, 0);
    const width = tiles * TILE_PX;
    const height = 4 * TILE_PX;
    const out = new Uint8ClampedArray(width * height * 4);
    paintTiles(src, out, 0, 0, tiles, 4);
    const deep = new Array<number>(tiles).fill(0);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (waterBand(pixelColor(out, y * width + x)) >= 3) {
          deep[Math.floor(x / TILE_PX)]++;
        }
      }
    }
    expect(deep[0]).toBeGreaterThan(0);
    expect(deep[tiles - 1]).toBe(0);
    for (let t = 1; t < tiles; t++) {
      expect(deep[t]).toBeLessThanOrEqual(deep[t - 1] + 4);
    }
  });

  it('pose les pierres de passage dans leur case d’eau, avec leurs quatre tons', () => {
    const scene: Scene = {
      shore: () => -5,
      ford: (cx, cy) => (cx >= 2 && cx <= 3 && cy >= 2 && cy <= 3 ? 1 : 0),
      slab: () => false,
      paths: [],
      loot: () => false,
    };
    const src = blockSource(scene, 0, 0);
    const width = 6 * TILE_PX;
    const full = new Uint8ClampedArray(width * width * 4);
    const core = new Uint8ClampedArray(width * width * 4);
    paintTiles(src, full, 0, 0, 6, 6);
    paintGroundCore(src, core, 0, 0, 6, 6);
    const diff = diffPixels(full, core);
    expect(diff.length).toBeGreaterThan(0);
    const seen = new Set<number>();
    for (const p of diff) {
      const x = p % width;
      const y = Math.floor(p / width);
      if (x < 2 * TILE_PX || x >= 3 * TILE_PX || y < 2 * TILE_PX || y >= 3 * TILE_PX) {
        throw new Error(`pierre de passage hors de sa case au pixel (${x},${y})`);
      }
      const color = pixelColor(full, p);
      if (color !== ST0 && color !== ST1 && color !== ST3 && color !== Q1) {
        throw new Error(`couleur de pierre inattendue : ${color.toString(16)}`);
      }
      seen.add(color);
    }
    expect(seen).toEqual(new Set([ST0, ST1, ST3, Q1]));
  });

  it('ne pose aucune pierre sur une dalle ni sous le seuil de gué', () => {
    const deep: Scene = {
      shore: () => -5,
      ford: () => 1,
      slab: () => false,
      paths: [],
      loot: () => false,
    };
    const width = 6 * TILE_PX;
    const baseline = new Uint8ClampedArray(width * width * 4);
    const baselineCore = new Uint8ClampedArray(width * width * 4);
    paintTiles(blockSource(deep, 0, 0), baseline, 0, 0, 6, 6);
    paintGroundCore(blockSource(deep, 0, 0), baselineCore, 0, 0, 6, 6);
    expect(diffPixels(baseline, baselineCore).length).toBeGreaterThan(0);

    const slabScene: Scene = { ...deep, slab: (tx, ty) => tx >= 2 && tx <= 3 && ty >= 2 && ty <= 3 };
    const slabFull = new Uint8ClampedArray(width * width * 4);
    const slabCore = new Uint8ClampedArray(width * width * 4);
    paintTiles(blockSource(slabScene, 0, 0), slabFull, 0, 0, 6, 6);
    paintGroundCore(blockSource(slabScene, 0, 0), slabCore, 0, 0, 6, 6);
    for (let y = 2 * TILE_PX; y < 4 * TILE_PX; y++) {
      for (let x = 2 * TILE_PX; x < 4 * TILE_PX; x++) {
        const p = y * width + x;
        expect(pixelColor(slabFull, p)).toBe(pixelColor(slabCore, p));
      }
    }

    const lowScene: Scene = { ...deep, ford: () => 0.65 };
    const lowFull = new Uint8ClampedArray(width * width * 4);
    const lowCore = new Uint8ClampedArray(width * width * 4);
    paintTiles(blockSource(lowScene, 0, 0), lowFull, 0, 0, 6, 6);
    paintGroundCore(blockSource(lowScene, 0, 0), lowCore, 0, 0, 6, 6);
    expect(diffPixels(lowFull, lowCore)).toEqual([]);
  });

  it('donne le même sous-rectangle que le bloc entier avec un gué', () => {
    const scene: Scene = {
      shore: (cx, cy) => (cx - 16) * 0.6 + Math.sin(cy * 0.25) * 1.2,
      ford: (cx, cy) => Math.max(0, Math.min(1, 1 - Math.abs(cy - 16) / 6)),
      slab: () => false,
      paths: [],
      loot: () => false,
    };
    const src = blockSource(scene, 0, 0);
    const full = new Uint8ClampedArray(CHUNK * TILE_PX * CHUNK * TILE_PX * 4);
    paintTiles(src, full, 0, 0, CHUNK, CHUNK);
    const rects = [[0, 0, 10, 10], [11, 8, 26, 23], [24, 24, 32, 32]] as const;
    for (const [x0, y0, x1, y1] of rects) {
      const w = (x1 - x0) * TILE_PX;
      const h = (y1 - y0) * TILE_PX;
      const part = new Uint8ClampedArray(w * h * 4);
      paintTiles(src, part, x0, y0, x1, y1);
      for (let ry = 0; ry < h; ry++) {
        for (let rx = 0; rx < w; rx++) {
          const a = (ry * w + rx) * 4;
          const b = (((y0 * TILE_PX + ry) * CHUNK * TILE_PX) + (x0 * TILE_PX + rx)) * 4;
          for (let k = 0; k < 4; k++) {
            if (part[a + k] !== full[b + k]) {
              throw new Error(`pixel (${rx},${ry}) du rectangle ${x0},${y0},${x1},${y1} diffère`);
            }
          }
        }
      }
    }
  });

  it('ne crée pas de couture de gué entre deux blocs voisins', () => {
    const scene: Scene = {
      shore: (cx, cy) => (cx - 40) * 0.55 + Math.sin(cy * 0.27) * 1.6,
      ford: (cx, cy) => Math.max(0, Math.min(0.5, 0.5 - Math.abs(cy - 16) / 12)),
      slab: () => false,
      paths: [],
      loot: () => false,
    };
    const left = blockSource(scene, 0, 0);
    const right = blockSource(scene, CHUNK, 0);
    const w = CHUNK * TILE_PX;
    const a = new Uint8ClampedArray(w * w * 4);
    const b = new Uint8ClampedArray(w * w * 4);
    paintGroundCore(left, a, 0, 0, CHUNK, CHUNK);
    paintGroundCore(right, b, CHUNK, 0, CHUNK * 2, CHUNK);
    for (let y = 0; y < w; y++) {
      const before = waterBand(pixelColor(a, y * w + (w - 1)));
      const after = waterBand(pixelColor(b, y * w));
      if (Math.abs(after - before) > 1) {
        throw new Error(`couture de gué à la ligne ${y} : ${before} puis ${after}`);
      }
    }
  });
});
