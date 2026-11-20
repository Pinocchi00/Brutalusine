import { describe, expect, it } from 'vitest';
import { EASE, bump, hash, hexToRgb, rgba, rng, smooth, vnoise } from '../src/render/px/noise';

const samples = (n: number, f: (i: number) => number): number[] => Array.from({ length: n }, (_, i) => f(i));

describe('bruit déterministe', () => {
  it('rng reste dans [0, 1) et se répète à graine égale', () => {
    const a = rng(12345), b = rng(12345);
    const xs = samples(1000, () => a());
    expect(xs).toEqual(samples(1000, () => b()));
    for (const v of xs) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('rng change avec la graine', () => {
    expect(rng(1)()).not.toBe(rng(2)());
  });

  it('hash reste dans [0, 1), est déterministe et dépend des trois arguments', () => {
    for (let i = 0; i < 1000; i++) {
      const v = hash(i * 7 - 500, i * 13 - 900, i % 11);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      expect(hash(i * 7 - 500, i * 13 - 900, i % 11)).toBe(v);
    }
    expect(hash(3, 4, 5)).not.toBe(hash(4, 3, 5));
    expect(hash(3, 4, 5)).not.toBe(hash(3, 4, 6));
  });

  it('vnoise reste dans [0, 1) et vaut le hash aux nœuds entiers', () => {
    for (let i = 0; i < 1000; i++) {
      const v = vnoise((i % 37) - 18, (i % 23) - 11, 9);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    expect(vnoise(2, 5, 9)).toBe(hash(2, 5, 9));
  });

  it('vnoise est continu : un petit pas ne fait pas de saut', () => {
    for (let i = 0; i < 200; i++) {
      const x = i * 0.37 - 20, y = i * 0.23 - 8;
      expect(Math.abs(vnoise(x + 1e-4, y, 3) - vnoise(x, y, 3))).toBeLessThan(1e-3);
    }
  });
});

describe('courbes', () => {
  it('bump est nul aux bords et plein au milieu', () => {
    expect(bump(-1)).toBe(0);
    expect(bump(0)).toBe(0);
    expect(bump(0.5)).toBeCloseTo(1, 12);
    expect(bump(1)).toBeLessThan(1e-12);
    expect(bump(2)).toBeLessThan(1e-12);
  });

  it('smooth vaut 0, 1/2 et 1 aux points remarquables', () => {
    expect(smooth(0)).toBe(0);
    expect(smooth(0.5)).toBe(0.5);
    expect(smooth(1)).toBe(1);
  });

  it('EASE vaut 0 en 0 et 1 en 1', () => {
    for (const key of ['io', 'out', 'back'] as const) {
      expect(EASE[key](0)).toBe(0);
      expect(EASE[key](1)).toBe(1);
    }
  });
});

describe('couleurs', () => {
  it('hexToRgb décompose un hexadécimal', () => {
    expect(hexToRgb('#1a1018')).toEqual([26, 16, 24]);
    expect(hexToRgb('#fffbf0')).toEqual([255, 251, 240]);
  });

  it('hexToRgb refuse tout ce qui n’est pas #rrggbb', () => {
    expect(() => hexToRgb('rgba(72,44,104,0.32)')).toThrow(/hexadécimale/);
    expect(() => hexToRgb('#abc')).toThrow(/hexadécimale/);
    expect(() => hexToRgb('1a1018')).toThrow(/hexadécimale/);
    expect(() => hexToRgb('#gggggg')).toThrow(/hexadécimale/);
  });

  it('rgba compose la même chaîne que la maquette', () => {
    expect(rgba('#48286a', 0.28)).toBe('rgba(72,40,106,0.28)');
  });
});
