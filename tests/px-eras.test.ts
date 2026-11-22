/**
 * Vérification hors navigateur des ères et des huit dessins Bois et Pierre.
 * Un faux crayon enregistre les rectangles et les lumières, sans aucune API du navigateur.
 */
import { describe, expect, it } from 'vitest';
import { eraFor, readEra } from '../src/render/px/eras';
import { eraArts } from '../src/render/px/buildings';
import { towerE1, towerE2 } from '../src/render/px/artTower';
import { kilnE1, kilnE2, puitsE1, puitsE2, storeE1, storeE2 } from '../src/render/px/artWorks';
import { bruleurE1, bruleurE2, scierieE1, scierieE2 } from '../src/render/px/artFirst';
import { fourE2 } from '../src/render/px/artStone';
import type { Pen } from '../src/render/px/pen';
import type { Light } from '../src/render/px/sprite';

/** Un rectangle enregistré par le faux crayon. */
interface Rect {
  a: number;
  b: number;
  w: number;
  h: number;
  col: string;
}

/** Le faux crayon et la liste de ses rectangles. */
function fakePen(): { P: Pen; rects: Rect[] } {
  const rects: Rect[] = [];
  const r = (a: number, b: number, w: number, h: number, col: string): void => {
    rects.push({ a, b, w, h, col });
  };
  const p = (a: number, b: number, col: string): void => r(a, b, 1, 1, col);
  const line = (): void => {};
  const ell = (): void => {};
  const disc = (): void => {};
  return { P: { r, p, line, ell, disc }, rects };
}

/** Vrai si le faux crayon a reçu exactement ce rectangle. */
function hasRect(rects: readonly Rect[], a: number, b: number, w: number, h: number): boolean {
  return rects.some((rect) => rect.a === a && rect.b === b && rect.w === w && rect.h === h);
}

/** Les types de lumières d'un dessin, dans l'ordre où il les pousse. */
function lightKinds(draw: (P: Pen, U: number, L: Light[]) => void): string[] {
  const { P } = fakePen();
  const lights: Light[] = [];
  draw(P, 0, lights);
  return lights.map((light) => light.k);
}

describe('readEra', () => {
  it('donne le Bois quand l’adresse ne dit rien', () => {
    expect(readEra('')).toBe(1);
  });

  it('lit les deux ères et ignore les autres paramètres', () => {
    expect(readEra('?ere=1')).toBe(1);
    expect(readEra('?ere=2')).toBe(2);
    expect(readEra('?rendu=pixel&ere=2')).toBe(2);
  });

  it('retombe sur le Bois pour une valeur invalide', () => {
    expect(readEra('?ere=3')).toBe(1);
    expect(readEra('?ere=abc')).toBe(1);
    expect(readEra('?ere=2.5')).toBe(1);
  });
});

describe('eraFor', () => {
  it('ne descend jamais sous l’ère d’apparition', () => {
    expect(eraFor(1, 1)).toBe(1);
    expect(eraFor(1, 2)).toBe(2);
    expect(eraFor(2, 1)).toBe(2);
    expect(eraFor(2, 2)).toBe(2);
  });
});

describe('eraArts', () => {
  it('donne les hauteurs de la maquette', () => {
    expect(eraArts('tour')?.map((art) => art.up)).toEqual([16, 30]);
    expect(eraArts('puits')?.map((art) => art.up)).toEqual([10, 42]);
    expect(eraArts('charbonniere')?.map((art) => art.up)).toEqual([2, 4]);
    expect(eraArts('entrepot')?.map((art) => art.up)).toEqual([2, 20]);
    expect(eraArts('scierie')?.map((art) => art.up)).toEqual([18, 22]);
    expect(eraArts('bruleur')?.map((art) => art.up)).toEqual([10, 40]);
    expect(eraArts('four')?.map((art) => art.up)).toEqual([44, 44]);
  });

  it('renvoie null pour un bâtiment sans dessin', () => {
    expect(eraArts('trieur')).toBeNull();
  });
});

describe('les lumières des dessins', () => {
  it('allume la Tour Bois d’un œil puis d’un feu clignotant', () => {
    expect(lightKinds(towerE1)).toEqual(['lens', 'blink']);
  });

  it('allume la Tour Pierre d’un œil puis du brasero', () => {
    expect(lightKinds(towerE2)).toEqual(['lens', 'fire']);
  });

  it('pose une lanterne sur chaque Puits', () => {
    expect(lightKinds(puitsE1)).toEqual(['ember']);
    expect(lightKinds(puitsE2)).toEqual(['ember']);
  });

  it('rougeoie quatre fois dans la meule et deux fois dans le four', () => {
    expect(lightKinds(kilnE1)).toEqual(['ember', 'ember', 'ember', 'ember']);
    expect(lightKinds(kilnE2)).toEqual(['ember', 'ember']);
  });

  it('n’allume rien dans les caisses et une fenêtre dans la réserve', () => {
    expect(lightKinds(storeE1)).toEqual([]);
    expect(lightKinds(storeE2)).toEqual(['win']);
  });

  it('n’allume aucune lumière dans les Scieries', () => {
    expect(lightKinds(scierieE1)).toEqual([]);
    expect(lightKinds(scierieE2)).toEqual([]);
  });

  it('allume un seul feu dans chaque Brûleur', () => {
    expect(lightKinds(bruleurE1)).toEqual(['fire']);
    expect(lightKinds(bruleurE2)).toEqual(['fire']);
  });

  it('allume un seul feu dans la gueule du Four', () => {
    expect(lightKinds(fourE2)).toEqual(['fire']);
  });
});

describe('la goulotte fixe du Puits', () => {
  it('disparaît du Puits Bois quand chute est faux', () => {
    const withChute = fakePen();
    puitsE1(withChute.P, 0, [], true);
    expect(hasRect(withChute.rects, 54, 39, 16, 5)).toBe(true);
    const withoutChute = fakePen();
    puitsE1(withoutChute.P, 0, [], false);
    expect(hasRect(withoutChute.rects, 54, 39, 16, 5)).toBe(false);
  });

  it('disparaît du Puits Pierre quand chute est faux', () => {
    const withChute = fakePen();
    puitsE2(withChute.P, 0, [], true);
    expect(hasRect(withChute.rects, 54, 35, 16, 5)).toBe(true);
    const withoutChute = fakePen();
    puitsE2(withoutChute.P, 0, [], false);
    expect(hasRect(withoutChute.rects, 54, 35, 16, 5)).toBe(false);
  });
});
