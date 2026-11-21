import { describe, expect, it } from 'vitest';
import { PixelFx, softenColor } from '../src/render/px/fx';
import { C } from '../src/render/px/palette';
import { hexToRgb } from '../src/render/px/noise';

describe('tremblement des arbres', () => {
  it('suit les instants clés d’une frappe normale', () => {
    const fx = new PixelFx();
    fx.hit(3, 4, 10, 1);
    expect(fx.shake(3, 4, 10)).toBe(-1);
    expect(fx.shake(3, 4, 10.1)).toBe(1);
    expect(fx.shake(3, 4, 10.2)).toBe(1);
    expect(fx.shake(3, 4, 10.35)).toBe(0);
    expect(fx.shake(3, 4, 10.4)).toBe(0);
  });

  it('amplifie une frappe forte', () => {
    const fx = new PixelFx();
    fx.hit(3, 4, 0, 2);
    expect(fx.shake(3, 4, 0)).toBe(-2);
    expect(fx.shake(3, 4, 0.1)).toBe(2);
    expect(fx.shake(3, 4, 0.2)).toBe(1);
    expect(fx.shake(3, 4, 0.35)).toBe(0);
    expect(fx.shake(3, 4, 0.4)).toBe(0);
  });

  it('garde chaque case indépendante et renvoie zéro sans coup', () => {
    const fx = new PixelFx();
    fx.hit(1, 1, 0, 2);
    fx.hit(2, 2, 0, 1);
    expect(fx.shake(1, 1, 0)).toBe(-2);
    expect(fx.shake(2, 2, 0)).toBe(-1);
    expect(fx.shake(3, 3, 0)).toBe(0);
    expect(fx.shake(1, 2, 0)).toBe(0);
  });

  it('ne tremble pas avant le coup et oublie les anciens coups', () => {
    const fx = new PixelFx();
    fx.hit(0, 0, 5);
    expect(fx.shake(0, 0, 4.9)).toBe(0);
    fx.update(0.2, 0);
    expect(fx.shake(0, 0, 5)).toBe(0);
  });

  it('arrondit les cases flottantes vers le bas', () => {
    const fx = new PixelFx();
    fx.hit(2.9, 7.1, 0);
    expect(fx.shake(2, 7, 0)).toBe(-1);
  });

  it('donne le temps écoulé depuis le coup, puis null après 0,35 s', () => {
    const fx = new PixelFx();
    expect(fx.hitSince(1, 2, 5)).toBeNull();
    fx.hit(1, 2, 5);
    expect(fx.hitSince(1, 2, 5)).toBe(0);
    expect(fx.hitSince(1, 2, 5.1)).toBeCloseTo(0.1, 12);
    expect(fx.hitSince(1, 2, 5.349)).not.toBeNull();
    expect(fx.hitSince(1, 2, 5.35)).toBeNull();
    expect(fx.hitSince(1, 2, 6)).toBeNull();
  });

  it('ne donne aucun coup ni tremblement avant l’instant du coup', () => {
    const fx = new PixelFx();
    fx.hit(0, 0, 5);
    expect(fx.hitSince(0, 0, 4.9)).toBeNull();
    expect(fx.shake(0, 0, 4.9)).toBe(0);
  });

  it('laisse le tremblement inchangé : mêmes valeurs qu’avant le calcul du temps', () => {
    const fx = new PixelFx();
    fx.hit(3, 4, 10, 1);
    expect(fx.shake(3, 4, 10)).toBe(-1);
    expect(fx.shake(3, 4, 10.1)).toBe(1);
    expect(fx.shake(3, 4, 10.2)).toBe(1);
    expect(fx.shake(3, 4, 10.05)).toBe(-1);
    expect(fx.shake(3, 4, 10.35)).toBe(0);
  });
});

describe('particules', () => {
  it('monte puis retombe à zéro', () => {
    const fx = new PixelFx();
    expect(fx.count).toBe(0);
    fx.burst('leaf', 4, 5, C.g2, 12);
    expect(fx.count).toBe(12);
    fx.update(0.05, 0.5);
    expect(fx.count).toBe(12);
    for (let i = 0; i < 30; i++) fx.update(0.1, 0.5);
    expect(fx.count).toBe(0);
  });

  it('respecte le plafond de 1200 particules', () => {
    const fx = new PixelFx();
    fx.burst('chip', 0, 0, C.e1, 900);
    expect(fx.count).toBe(900);
    fx.burst('spark', 0, 0, C.o2, 900);
    expect(fx.count).toBe(1200);
    fx.burst('star', 0, 0, C.o1, 50);
    expect(fx.count).toBe(1200);
  });

  it('accepte les cinq sortes et un nombre nul', () => {
    const fx = new PixelFx();
    fx.burst('leaf', 0, 0, C.g1, 2);
    fx.burst('dust', 0, 0, C.e1, 2);
    fx.burst('spark', 0, 0, C.o2, 2);
    fx.burst('chip', 0, 0, C.ir1, 2);
    fx.burst('star', 0, 0, C.o1, 2);
    fx.burst('star', 0, 0, C.o1, 0);
    expect(fx.count).toBe(10);
  });

  it('oublie tout au reset', () => {
    const fx = new PixelFx();
    fx.burst('leaf', 0, 0, C.g2, 4);
    fx.hit(1, 1, 0);
    fx.reset();
    expect(fx.count).toBe(0);
    expect(fx.shake(1, 1, 0)).toBe(0);
  });

  it('ignore un pas de temps nul ou négatif', () => {
    const fx = new PixelFx();
    fx.burst('leaf', 0, 0, C.g2, 3);
    fx.update(0, 0);
    fx.update(-1, 0);
    expect(fx.count).toBe(3);
  });
});

describe('adoucissement des couleurs', () => {
  it('mêle la couleur à moitié avec C.c3', () => {
    const [r, g, b] = hexToRgb(C.c3);
    expect(softenColor('#ff0000')).toBe(`#${Math.round((255 + r) / 2).toString(16).padStart(2, '0')}${Math.round(g / 2).toString(16).padStart(2, '0')}${Math.round(b / 2).toString(16).padStart(2, '0')}`);
  });

  it('garde chaque canal entre la couleur et C.c3', () => {
    const base = hexToRgb(C.c3);
    for (const color of ['#ff00ff', '#00ff00', '#102030', '#abcdef', '#000000', '#ffffff']) {
      const [r, g, b] = hexToRgb(softenColor(color));
      const src = hexToRgb(color);
      for (const [channel, index] of [[r, 0], [g, 1], [b, 2]] as const) {
        expect(channel).toBeGreaterThanOrEqual(Math.min(src[index], base[index]));
        expect(channel).toBeLessThanOrEqual(Math.max(src[index], base[index]));
      }
    }
  });

  it('adoucit aussi rgb et rgba, et laisse une couleur illisible intacte', () => {
    const expected = softenColor('#78a05a');
    expect(softenColor('rgb(120,160,90)')).toBe(expected);
    expect(softenColor('rgba(120,160,90,0.4)')).toBe(expected);
    expect(softenColor('rgba(120,160,90,')).toBe(expected);
    expect(softenColor('pas une couleur')).toBe('pas une couleur');
  });
});
