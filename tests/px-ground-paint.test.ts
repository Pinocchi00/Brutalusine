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

/** Une scène synthétique, indépendante du découpage en blocs. */
interface Scene {
  shore(cx: number, cy: number): number;
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
  return { seed: 4242, originX, originY, shore, paths: scene.paths, slab, loot };
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
});
