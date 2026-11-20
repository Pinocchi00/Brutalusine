import { describe, expect, it } from 'vitest';
import {
  TILE_PX,
  computeView,
  pickScale,
  scaleBounds,
  screenToWorld,
  stepScale,
  worldToBuffer,
  worldToScreen,
} from '../src/render/px/view';
import type { PixelView } from '../src/render/px/view';
import { rng } from '../src/render/px/noise';

/** Les tailles d'écran de référence, en pixels physiques. */
const SCREENS: ReadonlyArray<readonly [number, number]> = [
  [1280, 720],
  [1920, 1080],
  [2560, 1440],
  [3840, 2160],
  [800, 600],
  [320, 200],
  [100, 50],
];

/** Tire un entier dans [lo, hi] avec le générateur fourni. */
const int = (rand: () => number, lo: number, hi: number): number =>
  lo + Math.floor(rand() * (hi - lo + 1));

/** Deux vues identiques à une case près : sert au test de défilement. */
const assertSmooth = (a: PixelView, b: PixelView, wx: number, wy: number, axis: 'x' | 'y'): void => {
  const pa = worldToScreen(a, wx, wy);
  const pb = worldToScreen(b, wx, wy);
  expect(Math.abs(pb[axis] - pa[axis])).toBeLessThanOrEqual(1);
};

describe('échelles', () => {
  it('pickScale suit le cadrage de la maquette', () => {
    // 720 / 360 = 2 exactement.
    expect(pickScale(1280, 720)).toBe(2);
    // 1080 / 360 = 3 exactement.
    expect(pickScale(1920, 1080)).toBe(3);
    // 1440 / 360 = 4 exactement.
    expect(pickScale(2560, 1440)).toBe(4);
    // 2160 / 360 = 6 exactement.
    expect(pickScale(3840, 2160)).toBe(6);
    // 600 / 360 ≈ 1,67, arrondi à 2.
    expect(pickScale(800, 600)).toBe(2);
    // 200 / 360 ≈ 0,56, arrondi à 1 : jamais zéro.
    expect(pickScale(320, 200)).toBe(1);
    // 50 / 360 ≈ 0,14, arrondi à 0 puis ramené à 1 : jamais zéro.
    expect(pickScale(100, 50)).toBe(1);
  });

  it('scaleBounds garde entre 240 et 720 lignes monde', () => {
    // min = ceil(720/720) = 1, max = floor(720/240) = 3.
    expect(scaleBounds(1280, 720)).toEqual({ min: 1, max: 3 });
    // min = ceil(1080/720) = 2, max = floor(1080/240) = 4.
    expect(scaleBounds(1920, 1080)).toEqual({ min: 2, max: 4 });
    // min = ceil(1440/720) = 2, max = floor(1440/240) = 6.
    expect(scaleBounds(2560, 1440)).toEqual({ min: 2, max: 6 });
    // min = ceil(2160/720) = 3, max = floor(2160/240) = 9.
    expect(scaleBounds(3840, 2160)).toEqual({ min: 3, max: 9 });
    // min = ceil(600/720) = 1, max = floor(600/240) = 2.
    expect(scaleBounds(800, 600)).toEqual({ min: 1, max: 2 });
    // min = ceil(200/720) = 1, max = floor(200/240) = 0 → ramené à 1.
    expect(scaleBounds(320, 200)).toEqual({ min: 1, max: 1 });
    // min = ceil(50/720) = 1, max = floor(50/240) = 0 → ramené à 1.
    expect(scaleBounds(100, 50)).toEqual({ min: 1, max: 1 });
  });

  it('pickScale est toujours dans les bornes', () => {
    for (const [w, h] of SCREENS) {
      const bound = scaleBounds(w, h);
      const scale = pickScale(w, h);
      expect(bound.min).toBeLessThanOrEqual(bound.max);
      expect(bound.min).toBeGreaterThanOrEqual(1);
      expect(scale).toBeGreaterThanOrEqual(bound.min);
      expect(scale).toBeLessThanOrEqual(bound.max);
    }
  });

  it('stepScale ne sort jamais des bornes', () => {
    for (const [w, h] of SCREENS) {
      const { min, max } = scaleBounds(w, h);
      for (let scale = min; scale <= max; scale++) {
        expect(stepScale(scale, 1, w, h)).toBeLessThanOrEqual(max);
        expect(stepScale(scale, -1, w, h)).toBeGreaterThanOrEqual(min);
      }
      expect(stepScale(min, -1, w, h)).toBe(min);
      expect(stepScale(max, 1, w, h)).toBe(max);
    }
  });
});

describe('fenêtre pixel', () => {
  it('calcule une fenêtre connue au pixel près', () => {
    const view = computeView(0, 0, 2, 1280, 720);
    // wx0 = -1280/4 = -320 et wy0 = -720/4 = -180.
    expect(view.originX).toBe(-321);
    expect(view.originY).toBe(-181);
    // bufW = ceil(1280/2) + 2 = 642 et bufH = ceil(720/2) + 2 = 362.
    expect(view.bufW).toBe(642);
    expect(view.bufH).toBe(362);
    // (wx0 - originX) = 1, donc blitX = -round(2) = -2 (idem en y).
    expect(view.blitX).toBe(-2);
    expect(view.blitY).toBe(-2);
    // Le tampon montre les cases -14 à 13 en x et -8 à 7 en y.
    expect(view.tileX0).toBe(-14);
    expect(view.tileX1).toBe(13);
    expect(view.tileY0).toBe(-8);
    expect(view.tileY1).toBe(7);
  });

  it('le tampon couvre l’écran, les bords et les conversions s’inversent', () => {
    const rand = rng(0x51a7);
    for (let i = 0; i < 2000; i++) {
      const screenIndex = int(rand, 0, SCREENS.length - 1);
      const [screenW, screenH] = SCREENS[screenIndex];
      const camX = (rand() - 0.5) * 2000;
      const camY = (rand() - 0.5) * 2000;
      const scale = int(rand, 1, 8);
      const view = computeView(camX, camY, scale, screenW, screenH);

      expect(view.bufW).toBe(Math.ceil(screenW / scale) + 2);
      expect(view.bufH).toBe(Math.ceil(screenH / scale) + 2);
      expect(Number.isInteger(view.originX)).toBe(true);
      expect(Number.isInteger(view.originY)).toBe(true);
      expect(Number.isInteger(view.blitX)).toBe(true);
      expect(Number.isInteger(view.blitY)).toBe(true);

      // Aucune bande vide : le tampon agrandi couvre tout l'écran sur chaque bord.
      expect(view.blitX).toBeLessThanOrEqual(0);
      expect(view.blitY).toBeLessThanOrEqual(0);
      expect(view.blitX + view.bufW * scale).toBeGreaterThanOrEqual(screenW);
      expect(view.blitY + view.bufH * scale).toBeGreaterThanOrEqual(screenH);

      const wx = camX + (rand() - 0.5) * 60;
      const wy = camY + (rand() - 0.5) * 60;
      const screen = worldToScreen(view, wx, wy);
      const back = screenToWorld(view, screen.x, screen.y);
      expect(Math.abs(back.x - wx)).toBeLessThanOrEqual(1e-9);
      expect(Math.abs(back.y - wy)).toBeLessThanOrEqual(1e-9);

      // Le même point tombe au même pixel, qu'on passe par l'écran ou par le tampon.
      const buffer = worldToBuffer(view, wx, wy);
      expect(Math.abs(buffer.x * scale + view.blitX - screen.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(buffer.y * scale + view.blitY - screen.y)).toBeLessThanOrEqual(1);
    }
  });

  it('le défilement ne saute pas de plus d’un pixel physique', () => {
    const rand = rng(20261120);
    for (let i = 0; i < 500; i++) {
      const screenIndex = int(rand, 0, SCREENS.length - 1);
      const [screenW, screenH] = SCREENS[screenIndex];
      const camX = (rand() - 0.5) * 2000;
      const camY = (rand() - 0.5) * 2000;
      const scale = int(rand, 1, 8);
      const wx = camX + (rand() - 0.5) * 40;
      const wy = camY + (rand() - 0.5) * 40;

      const still = computeView(camX, camY, scale, screenW, screenH);
      const movedX = computeView(camX + 0.001, camY, scale, screenW, screenH);
      const movedY = computeView(camX, camY + 0.001, scale, screenW, screenH);

      assertSmooth(still, movedX, wx, wy, 'x');
      assertSmooth(still, movedY, wx, wy, 'y');
    }
  });

  it('les cases visibles contiennent tout pixel affiché et rien de plus', () => {
    const rand = rng(0xbadc0de);
    for (let i = 0; i < 200; i++) {
      const screenW = int(rand, 64, 3200);
      const screenH = int(rand, 64, 2000);
      const camX = (rand() - 0.5) * 400;
      const camY = (rand() - 0.5) * 400;
      const scale = int(rand, 1, 8);
      const view = computeView(camX, camY, scale, screenW, screenH);

      for (let tile = view.tileX0; tile <= view.tileX1; tile++) {
        expect(tileHasPixel(view, tile, view.tileY0, 'x')).toBe(true);
      }
      for (let tile = view.tileY0; tile <= view.tileY1; tile++) {
        expect(tileHasPixel(view, view.tileX0, tile, 'y')).toBe(true);
      }
      // Une case juste au-delà de chaque bord ne montre aucun pixel.
      expect(tileHasPixel(view, view.tileX0 - 1, view.tileY0, 'x')).toBe(false);
      expect(tileHasPixel(view, view.tileX1 + 1, view.tileY0, 'x')).toBe(false);
      expect(tileHasPixel(view, view.tileX0, view.tileY0 - 1, 'y')).toBe(false);
      expect(tileHasPixel(view, view.tileX0, view.tileY1 + 1, 'y')).toBe(false);
    }
  });

  it('la marge élargit les bornes de chaque côté', () => {
    const rand = rng(0x1b1b);
    for (let i = 0; i < 200; i++) {
      const screenIndex = int(rand, 0, SCREENS.length - 1);
      const [screenW, screenH] = SCREENS[screenIndex];
      const camX = (rand() - 0.5) * 2000;
      const camY = (rand() - 0.5) * 2000;
      const scale = int(rand, 1, 8);
      const margin = int(rand, 1, 5);
      const plain = computeView(camX, camY, scale, screenW, screenH);
      const wide = computeView(camX, camY, scale, screenW, screenH, margin);

      expect(wide.tileX0).toBe(plain.tileX0 - margin);
      expect(wide.tileY0).toBe(plain.tileY0 - margin);
      expect(wide.tileX1).toBe(plain.tileX1 + margin);
      expect(wide.tileY1).toBe(plain.tileY1 + margin);
    }
  });
});

/** Vrai si la case a au moins un pixel monde qui tombe dans l'écran sur l'axe donné. */
function tileHasPixel(view: PixelView, tx: number, ty: number, axis: 'x' | 'y'): boolean {
  const first = (axis === 'x' ? tx : ty) * TILE_PX;
  const origin = axis === 'x' ? view.originX : view.originY;
  const blit = axis === 'x' ? view.blitX : view.blitY;
  const screen = axis === 'x' ? view.screenW : view.screenH;
  for (let pixel = first; pixel < first + TILE_PX; pixel++) {
    const start = blit + (pixel - origin) * view.scale;
    if (start + view.scale > 0 && start < screen) {
      return true;
    }
  }
  return false;
}
