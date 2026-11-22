/**
 * Les dalles d'ère : bois et pierre, sans navigateur, sur des scènes synthétiques.
 */
import { describe, expect, it } from 'vitest';
import { CHUNK } from '../src/sim/world';
import { C } from '../src/render/px/palette';
import { TILE_PX } from '../src/render/px/view';
import { paintTiles, type GroundSource } from '../src/render/px/groundPaint';
import type { Era } from '../src/render/px/eras';

const CORNER = CHUNK + 1;
const SLAB_SIDE = CHUNK + 2;

/** Empaquette une couleur `#rrggbb` en entier RGB. */
function pack(hex: string): number {
  return parseInt(hex.slice(1), 16);
}

/** La couleur RGB d'un pixel d'un tampon RGBA. */
function pixelColor(buf: Uint8ClampedArray, index: number): number {
  const o = index * 4;
  return (buf[o] << 16) | (buf[o + 1] << 8) | buf[o + 2];
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

/** La couleur d'une case de dalle, ou le champ absent quand `era` est `null`. */
function slabSource(slab: (tx: number, ty: number) => boolean, era: Era | undefined | null): GroundSource {
  const shore = new Float64Array(CORNER * CORNER);
  shore.fill(6);
  const ford = new Float64Array(CORNER * CORNER);
  const slabField = new Uint8Array(SLAB_SIDE * SLAB_SIDE);
  for (let ly = -1; ly <= CHUNK; ly++) {
    for (let lx = -1; lx <= CHUNK; lx++) {
      slabField[(ly + 1) * SLAB_SIDE + lx + 1] = slab(lx, ly) ? 1 : 0;
    }
  }
  const loot = new Uint8Array(CHUNK * CHUNK);
  const base: GroundSource = { seed: 7331, originX: 0, originY: 0, shore, ford, paths: [], slab: slabField, loot };
  if (era === null) return base;
  return { ...base, slabEra: era };
}

/** Peint un rectangle de cases dans un tampon neuf. */
function paintRange(src: GroundSource, x0: number, y0: number, x1: number, y1: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray((x1 - x0) * TILE_PX * (y1 - y0) * TILE_PX * 4);
  paintTiles(src, out, x0, y0, x1, y1);
  return out;
}

/** Une grande dalle de prairie, sans bord, pour comparer les ères. */
function bigSlab(tx: number, ty: number): boolean {
  return tx >= 2 && tx <= 6 && ty >= 2 && ty <= 6;
}

describe('les dalles d’ère', () => {
  it('ne change pas un pixel quand l’ère est absente ou indéfinie', () => {
    const absent = slabSource(bigSlab, null);
    const undef = slabSource(bigSlab, undefined);
    const a = paintRange(absent, 0, 0, 8, 8);
    const b = paintRange(undef, 0, 0, 8, 8);
    expect(diffPixels(a, b)).toEqual([]);
  });

  it('donne le bois, la pierre et le fond sans ère tous différents', () => {
    const fondo = paintRange(slabSource(bigSlab, null), 0, 0, 8, 8);
    const bois = paintRange(slabSource(bigSlab, 1), 0, 0, 8, 8);
    const pierre = paintRange(slabSource(bigSlab, 2), 0, 0, 8, 8);
    expect(diffPixels(bois, fondo).length).toBeGreaterThan(0);
    expect(diffPixels(pierre, fondo).length).toBeGreaterThan(0);
    expect(diffPixels(bois, pierre).length).toBeGreaterThan(0);
  });

  it('donne exactement les mêmes pixels pour deux peintures de la même source', () => {
    for (const era of [1, 2] as const) {
      const src = slabSource(bigSlab, era);
      expect(diffPixels(paintRange(src, 0, 0, 8, 8), paintRange(src, 0, 0, 8, 8))).toEqual([]);
    }
  });

  it('donne le même grand rectangle peint d’un coup ou en deux moitiés', () => {
    for (const era of [1, 2] as const) {
      const src = slabSource(bigSlab, era);
      const full = paintRange(src, 1, 1, 7, 7);
      const width = 6 * TILE_PX;
      const height = 6 * TILE_PX;
      const left = paintRange(src, 1, 1, 4, 7);
      const right = paintRange(src, 4, 1, 7, 7);
      const half = 3 * TILE_PX;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const o = (y * width + x) * 4;
          const s = x < half ? left : right;
          const so = (y * half + (x < half ? x : x - half)) * 4;
          for (let k = 0; k < 4; k++) {
            if (full[o + k] !== s[so + k]) {
              throw new Error(`ère ${era} : pixel (${x},${y}) différent entre le tout et les moitiés`);
            }
          }
        }
      }
    }
  });

  it('porte la lèvre au sud sans voisine, et pas avec une voisine', () => {
    const onlyTile = (tx: number, ty: number): boolean => tx === 2 && ty === 2;
    const withSouth = (tx: number, ty: number): boolean =>
      (tx === 2 && ty === 2) || (tx === 2 && ty === 3);
    const lips: Record<Era, number[]> = {
      1: [pack(C.e1), pack(C.e2), pack(C.e3)],
      2: [pack(C.st1), pack(C.st2), pack(C.st3)],
    };
    for (const era of [1, 2] as const) {
      const edge = paintRange(slabSource(onlyTile, era), 2, 2, 3, 3);
      for (let i = 0; i < 3; i++) {
        const y = TILE_PX - 3 + i;
        expect(pixelColor(edge, y * TILE_PX + 5)).toBe(lips[era][i]);
      }
      const inner = paintRange(slabSource(withSouth, era), 2, 2, 3, 3);
      expect(pixelColor(inner, (TILE_PX - 1) * TILE_PX + 5)).not.toBe(lips[era][2]);
    }
  });
});
