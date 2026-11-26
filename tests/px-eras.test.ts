/**
 * Vérification hors navigateur des ères et des huit dessins Bois et Pierre.
 * Un faux crayon enregistre les rectangles et les lumières, sans aucune API du navigateur.
 */
import { describe, expect, it } from 'vitest';
import { eraFor, forcedEra, versionEra } from '../src/render/px/eras';
import { eraArts } from '../src/render/px/buildings';
import { towerE1, towerE2, towerE3 } from '../src/render/px/artTower';
import { kilnE1, kilnE2, shaftE1, shaftE2, storeE1, storeE2 } from '../src/render/px/artWorks';
import {
  splitterE1,
  splitterE2,
  burnerE1,
  burnerE2,
  sawmillE1,
  sawmillE2,
} from '../src/render/px/artFirst';
import {
  clayPitE2,
  furnaceE2,
  trapE2,
  waterWheelE2,
  tanneryE2,
  sorterE2,
} from '../src/render/px/artStone';
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

describe('forcedEra', () => {
  it('ne force rien quand l’adresse ne dit rien', () => {
    expect(forcedEra('')).toBeNull();
  });

  it('lit les trois ères et ignore les autres paramètres', () => {
    expect(forcedEra('?ere=1')).toBe(1);
    expect(forcedEra('?ere=2')).toBe(2);
    expect(forcedEra('?ere=3')).toBe(3);
    expect(forcedEra('?graine=7&ere=2')).toBe(2);
  });

  it('ne force rien pour une valeur invalide', () => {
    expect(forcedEra('?ere=4')).toBeNull();
    expect(forcedEra('?ere=abc')).toBeNull();
    expect(forcedEra('?ere=2.5')).toBeNull();
  });
});

describe('versionEra', () => {
  it('dessine la Pierre puis la Brique au-delà des premières versions', () => {
    expect(versionEra(0)).toBe(1);
    expect(versionEra(1)).toBe(1);
    expect(versionEra(2)).toBe(2);
    expect(versionEra(3)).toBe(3);
    expect(versionEra(8)).toBe(3);
  });
});

describe('eraFor', () => {
  it('ne descend jamais sous l’ère d’apparition', () => {
    expect(eraFor(1, 1)).toBe(1);
    expect(eraFor(1, 2)).toBe(2);
    expect(eraFor(2, 1)).toBe(2);
    expect(eraFor(2, 2)).toBe(2);
    expect(eraFor(3, 1)).toBe(3);
    expect(eraFor(3, 2)).toBe(3);
    expect(eraFor(1, 3)).toBe(3);
  });
});

describe('eraArts', () => {
  it('donne les hauteurs de la maquette', () => {
    expect(eraArts('tour')?.map((art) => art.up)).toEqual([16, 30, 72]);
    expect(eraArts('puits')?.map((art) => art.up)).toEqual([10, 42]);
    expect(eraArts('charbonniere')?.map((art) => art.up)).toEqual([2, 4]);
    expect(eraArts('entrepot')?.map((art) => art.up)).toEqual([2, 20]);
    expect(eraArts('scierie')?.map((art) => art.up)).toEqual([18, 22]);
    expect(eraArts('bruleur')?.map((art) => art.up)).toEqual([10, 40]);
    expect(eraArts('aiguillage')?.map((art) => art.up)).toEqual([6, 6]);
    expect(eraArts('four')?.map((art) => art.up)).toEqual([44, 44]);
    expect(eraArts('trieur')?.map((art) => art.up)).toEqual([8, 8]);
    expect(eraArts('piege')?.map((art) => art.up)).toEqual([16, 16]);
    expect(eraArts('argiliere')?.map((art) => art.up)).toEqual([24, 24]);
    expect(eraArts('tannerie')?.map((art) => art.up)).toEqual([20, 20]);
    expect(eraArts('roue')?.map((art) => art.up)).toEqual([26, 26]);
  });

  it('renvoie null pour un bâtiment sans dessin', () => {
    expect(eraArts('convoyeur')).toBeNull();
  });
});

describe('les bâtiments de Pierre dessinés', () => {
  it('inscrit le Piège, l’Argilière, la Tannerie et la Roue dans eraArts', () => {
    for (const key of ['piege', 'argiliere', 'tannerie', 'roue']) {
      expect(eraArts(key)).not.toBeNull();
    }
  });
});

describe('les lumières des dessins', () => {
  it('allume la Tour Bois d’un œil puis d’un feu clignotant', () => {
    expect(lightKinds(towerE1)).toEqual(['lens', 'blink']);
  });

  it('allume la Tour Pierre d’un œil puis du brasero', () => {
    expect(lightKinds(towerE2)).toEqual(['lens', 'fire']);
  });

  it('garde l’œil de la capsule dans la Tour de brique et éclaire deux fenêtres', () => {
    expect(lightKinds(towerE3)).toEqual(['lens', 'win', 'win']);
  });

  it('pose une lanterne sur chaque Puits', () => {
    expect(lightKinds(shaftE1)).toEqual(['ember']);
    expect(lightKinds(shaftE2)).toEqual(['ember']);
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
    expect(lightKinds(sawmillE1)).toEqual([]);
    expect(lightKinds(sawmillE2)).toEqual([]);
  });

  it('n’allume aucune lumière dans les Répartiteurs', () => {
    expect(lightKinds(splitterE1)).toEqual([]);
    expect(lightKinds(splitterE2)).toEqual([]);
  });

  it('allume un seul feu dans chaque Brûleur', () => {
    expect(lightKinds(burnerE1)).toEqual(['fire']);
    expect(lightKinds(burnerE2)).toEqual(['fire']);
  });

  it('allume un seul feu dans la gueule du Four', () => {
    expect(lightKinds(furnaceE2)).toEqual(['fire']);
  });

  it('n’allume rien dans le Trieur, le Piège, l’Argilière, la Tannerie ni la Roue à eau', () => {
    expect(lightKinds(sorterE2)).toEqual([]);
    expect(lightKinds(trapE2)).toEqual([]);
    expect(lightKinds(clayPitE2)).toEqual([]);
    expect(lightKinds(tanneryE2)).toEqual([]);
    expect(lightKinds(waterWheelE2)).toEqual([]);
  });
});

describe('la goulotte fixe du Puits', () => {
  it('disparaît du Puits Bois quand chute est faux', () => {
    const withChute = fakePen();
    shaftE1(withChute.P, 0, [], true);
    expect(hasRect(withChute.rects, 54, 39, 16, 5)).toBe(true);
    const withoutChute = fakePen();
    shaftE1(withoutChute.P, 0, [], false);
    expect(hasRect(withoutChute.rects, 54, 39, 16, 5)).toBe(false);
  });

  it('disparaît du Puits Pierre quand chute est faux', () => {
    const withChute = fakePen();
    shaftE2(withChute.P, 0, [], true);
    expect(hasRect(withChute.rects, 54, 35, 16, 5)).toBe(true);
    const withoutChute = fakePen();
    shaftE2(withoutChute.P, 0, [], false);
    expect(hasRect(withoutChute.rects, 54, 35, 16, 5)).toBe(false);
  });
});
