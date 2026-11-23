/**
 * Vérifie le cadran du soleil : la position du disque sur l'arc et le SVG net du HUD pixel.
 */
import { describe, expect, it } from 'vitest';
import { sunDialPoint, sunDialSvg } from '../src/ui/px/sunDial';
import { DAY_PART } from '../src/sim/sun';
import { C } from '../src/render/px/palette';

describe('sunDialPoint', () => {
  it('pose le lever à gauche de l’horizon', () => {
    expect(sunDialPoint(0)).toEqual({ x: 3, y: 13, day: true });
  });

  it('atteint le zénith au milieu du jour', () => {
    expect(sunDialPoint(DAY_PART / 2)).toEqual({ x: 14, y: 2, day: true });
  });

  it('pose le coucher juste avant la nuit, à droite de l’horizon', () => {
    const point = sunDialPoint(DAY_PART - 1e-9);
    expect(point.day).toBe(true);
    expect(point.x).toBe(25);
    expect(point.y).toBe(13);
  });

  it('passe la nuit sous l’horizon avec day à faux', () => {
    const point = sunDialPoint(0.8);
    expect(point.day).toBe(false);
    expect(point.y).toBeLessThan(13);
  });

  it('ramène une phase hors bornes dans [0, 1[', () => {
    expect(sunDialPoint(1)).toEqual(sunDialPoint(0));
    expect(sunDialPoint(2.3)).toEqual(sunDialPoint(0.3));
    expect(sunDialPoint(-0.1)).toEqual(sunDialPoint(0.9));
  });

  it('traite NaN comme zéro', () => {
    expect(sunDialPoint(Number.NaN)).toEqual(sunDialPoint(0));
  });
});

describe('sunDialSvg', () => {
  it('dessine le soleil le jour, pas la lune', () => {
    const svg = sunDialSvg(0.3);
    expect(svg).toContain(C.o1);
    expect(svg).not.toContain(C.s1);
  });

  it('dessine la lune la nuit, pas le soleil', () => {
    const svg = sunDialSvg(0.8);
    expect(svg).toContain(C.s1);
    expect(svg).not.toContain(C.o1);
  });

  it('donne la même chaîne pour la même phase', () => {
    expect(sunDialSvg(0.42)).toBe(sunDialSvg(0.42));
  });

  it('ne laisse ni undefined ni NaN dans le résultat', () => {
    for (const t of [0, 0.2, DAY_PART, 0.8, 0.999, Number.NaN]) {
      const svg = sunDialSvg(t);
      expect(svg).not.toContain('undefined');
      expect(svg).not.toContain('NaN');
    }
  });
});
