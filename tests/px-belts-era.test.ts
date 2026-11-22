/**
 * Les tapis d'ère du rendu pixel : rails communs, bandes distinctes, périodes des phases,
 * phases négatives et virage vide au-delà des anneaux. Un faux crayon, sans navigateur.
 */
import { describe, expect, it } from 'vitest';
import { eraBeltTile } from '../src/render/px/belts';
import type { Era } from '../src/render/px/eras';
import { C } from '../src/render/px/palette';
import type { Pen } from '../src/render/px/pen';

const T = 24;

/** Une tuile peinte : chaque pixel et sa couleur, indexés par « x,y ». */
type Pixels = Map<string, string>;

/** Peint une tuile d'ère dans un faux crayon qui enregistre chaque pixel. */
function tile(inD: number, outD: number, off: number, era: Era): Pixels {
  const pixels: Pixels = new Map();
  const r = (a: number, b: number, w: number, h: number, col: string): void => {
    const x0 = Math.round(a);
    const y0 = Math.round(b);
    const x1 = x0 + Math.round(w);
    const y1 = y0 + Math.round(h);
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) pixels.set(`${x},${y}`, col);
    }
  };
  const p = (a: number, b: number, col: string): void => r(a, b, 1, 1, col);
  const P: Pen = { r, p, line: () => {}, ell: () => {}, disc: () => {} };
  eraBeltTile(P, 0, 0, inD, outD, off, era);
  return pixels;
}

/** Vrai si deux tuiles ont exactement les mêmes pixels de la même couleur. */
function sameTiles(a: Pixels, b: Pixels): boolean {
  if (a.size !== b.size) return false;
  for (const [key, col] of a) {
    if (b.get(key) !== col) return false;
  }
  return true;
}

/** La couleur d'une rangée entière, de gauche à droite. */
function row(pixels: Pixels, y: number): (string | undefined)[] {
  const cols: (string | undefined)[] = [];
  for (let x = 0; x < T; x++) cols.push(pixels.get(`${x},${y}`));
  return cols;
}

/** Le décalage qui place la strie des rondins sur la phase voulue. */
function logOff(phase: number): number {
  return phase / 1.6;
}

/** Le pivot d'un virage, copié de la géométrie de la maquette. */
function pivotOf(inD: number, outD: number): { px: number; py: number } {
  const entry = (inD + 2) & 3;
  const px = entry === 0 || outD === 0 ? T : 0;
  const py = entry === 1 || outD === 1 ? T : 0;
  return { px, py };
}

describe('eraBeltTile — tuile droite vers l’est', () => {
  it('garde les rails a = 3 et a = 20 en ink2 aux deux ères', () => {
    for (const era of [1, 2] as const) {
      const pixels = tile(0, 0, 0, era);
      expect(pixels.get('0,3')).toBe(C.ink2);
      expect(pixels.get('12,3')).toBe(C.ink2);
      expect(pixels.get('0,20')).toBe(C.ink2);
      expect(pixels.get('12,20')).toBe(C.ink2);
    }
  });

  it('donne des bandes de couleurs différentes entre rondins et cuir', () => {
    const logs = row(tile(0, 0, 0, 1), 10);
    const leather = row(tile(0, 0, 0, 2), 10);
    expect(logs).not.toEqual(leather);
  });

  it('peint la bande sur les rangées 6 à 17', () => {
    const pixels = tile(0, 0, 0, 1);
    for (let y = 6; y < 18; y++) {
      expect(pixels.get(`0,${y}`)).toBeDefined();
    }
  });
});

describe('eraBeltTile — périodes des phases', () => {
  it('les rondins répètent la phase 0 à la phase 5', () => {
    expect(sameTiles(tile(0, 0, logOff(0), 1), tile(0, 0, logOff(5), 1))).toBe(true);
  });

  it('les rondins distinguent les phases 0 et 1', () => {
    expect(sameTiles(tile(0, 0, logOff(0), 1), tile(0, 0, logOff(1), 1))).toBe(false);
  });

  it('le cuir répète la phase 0 à la phase 8', () => {
    expect(sameTiles(tile(0, 0, 0, 2), tile(0, 0, 8, 2))).toBe(true);
  });

  it('le cuir distingue les phases 0 et 1', () => {
    expect(sameTiles(tile(0, 0, 0, 2), tile(0, 0, 1, 2))).toBe(false);
  });
});

describe('eraBeltTile — phases négatives', () => {
  it('les rondins ramènent une phase négative sur sa phase positive', () => {
    expect(sameTiles(tile(0, 0, -1, 1), tile(0, 0, logOff(3), 1))).toBe(true);
  });

  it('le cuir ramène une phase négative sur sa phase positive', () => {
    expect(sameTiles(tile(0, 0, -1, 2), tile(0, 0, 7, 2))).toBe(true);
  });
});

describe('eraBeltTile — virage', () => {
  it('ne peint rien à d < 3 ni à d >= 21 aux deux ères', () => {
    for (const era of [1, 2] as const) {
      const pixels = tile(3, 0, 0, era);
      expect(pixels.size).toBeGreaterThan(0);
      const { px, py } = pivotOf(3, 0);
      for (const key of pixels.keys()) {
        const [x, y] = key.split(',').map(Number);
        const d = Math.hypot(x + 0.5 - px, y + 0.5 - py);
        expect(d).toBeGreaterThanOrEqual(3);
        expect(d).toBeLessThan(21);
      }
    }
  });
});
