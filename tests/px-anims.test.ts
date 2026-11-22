/**
 * Vérification hors navigateur des animations des bâtiments : le seau du Puits et les fumées.
 * Un faux crayon enregistre les rectangles et les traits, sans aucune API du navigateur.
 */
import { describe, expect, it } from 'vitest';
import { bucketDrop, drawPuitsMotion, isBurning, smokeVent, wheelAngle } from '../src/render/px/buildingAnims';
import { puitsE1, puitsE2 } from '../src/render/px/artWorks';
import { bruleurE1, bruleurE2 } from '../src/render/px/artFirst';
import { fourE2 } from '../src/render/px/artStone';
import { B } from '../src/sim/data';
import { Ent, Status } from '../src/sim/ent';
import type { Pen } from '../src/render/px/pen';
import type { Light } from '../src/render/px/sprite';

/** Un rectangle enregistré par le faux crayon. */
interface Rect {
  a: number;
  b: number;
  w: number;
  h: number;
}

/** Un trait enregistré par le faux crayon. */
interface Line {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Le faux crayon et la liste de ses rectangles et de ses traits. */
function fakePen(): { P: Pen; rects: Rect[]; lines: Line[] } {
  const rects: Rect[] = [];
  const lines: Line[] = [];
  const r = (a: number, b: number, w: number, h: number): void => {
    rects.push({ a, b, w, h });
  };
  const p = (a: number, b: number): void => r(a, b, 1, 1);
  const line = (x0: number, y0: number, x1: number, y1: number): void => {
    lines.push({ x0, y0, x1, y1 });
  };
  const ell = (): void => {};
  const disc = (): void => {};
  return { P: { r, p, line, ell, disc }, rects, lines };
}

/** Vrai si le faux crayon a reçu exactement ce rectangle. */
function hasRect(rects: readonly Rect[], a: number, b: number, w: number, h: number): boolean {
  return rects.some((rect) => rect.a === a && rect.b === b && rect.w === w && rect.h === h);
}

describe('isBurning', () => {
  it('suit le statut d’une machine, même en fin de cycle', () => {
    const machine = new Ent(1, B.charbonniere, 0, 0, 0, 2, 2);
    machine.status = Status.Working;
    machine.working = false;
    expect(isBurning(machine)).toBe(true);
    for (const status of [Status.NoInput, Status.Blocked, Status.NoPower]) {
      machine.status = status;
      machine.working = true;
      expect(isBurning(machine)).toBe(false);
    }
  });

  it('suit le statut d’un générateur', () => {
    const generator = new Ent(2, B.bruleur, 0, 0, 0, 2, 2);
    generator.status = Status.Working;
    expect(isBurning(generator)).toBe(true);
    generator.status = Status.NoInput;
    expect(isBurning(generator)).toBe(false);
  });
});

describe('les foyers éteints', () => {
  it('n’émettent aucune lumière, et un seul feu allumés', () => {
    for (const draw of [bruleurE1, bruleurE2, fourE2]) {
      const off: Light[] = [];
      draw(fakePen().P, 0, off, false);
      expect(off).toHaveLength(0);
      const on: Light[] = [];
      draw(fakePen().P, 0, on, true);
      expect(on).toHaveLength(1);
      expect(on[0].k).toBe('fire');
    }
  });
});

describe('bucketDrop', () => {
  it('part en haut, descend à fond au milieu et revient en haut', () => {
    expect(bucketDrop(0, 8)).toBe(0);
    expect(bucketDrop(30, 8)).toBe(8);
    expect(bucketDrop(60, 8)).toBe(0);
  });

  it('borne la progression hors du cycle', () => {
    expect(bucketDrop(-30, 10)).toBe(0);
    expect(bucketDrop(120, 10)).toBe(0);
  });
});

describe('wheelAngle', () => {
  it('avance d’un huitième de tour par minerai', () => {
    expect(wheelAngle(0)).toBeCloseTo(0.2, 12);
    expect(wheelAngle(60) - wheelAngle(0)).toBeCloseTo(Math.PI / 4, 12);
  });
});

describe('le seau du Puits', () => {
  it('garde la corde et le seau quand le dessin est fixe', () => {
    const one = fakePen();
    puitsE1(one.P, 0, [], false, false);
    expect(hasRect(one.rects, 36, -3, 1, 34)).toBe(true);
    expect(hasRect(one.rects, 32, 30, 8, 6)).toBe(true);
    const two = fakePen();
    puitsE2(two.P, 0, [], false, false);
    expect(hasRect(two.rects, 46, -26, 1, 52)).toBe(true);
    expect(hasRect(two.rects, 42, 24, 9, 7)).toBe(true);
  });

  it('retire la corde et le seau du dessin animé', () => {
    const one = fakePen();
    puitsE1(one.P, 0, [], false, true);
    expect(hasRect(one.rects, 36, -3, 1, 34)).toBe(false);
    expect(hasRect(one.rects, 32, 30, 8, 6)).toBe(false);
    const two = fakePen();
    puitsE2(two.P, 0, [], false, true);
    expect(hasRect(two.rects, 46, -26, 1, 52)).toBe(false);
    expect(hasRect(two.rects, 42, 24, 9, 7)).toBe(false);
    expect(hasRect(two.rects, 25, -22, 22, 3)).toBe(true);
  });
});

describe('drawPuitsMotion', () => {
  it('descend le seau et allonge la corde au milieu du cycle', () => {
    const one = fakePen();
    drawPuitsMotion(one.P, 1, 0, 0, 10, 30);
    expect(hasRect(one.rects, 36, 7, 1, 42)).toBe(true);
    expect(hasRect(one.rects, 32, 48, 8, 6)).toBe(true);
  });

  it('tourne les huit rayons de la roue de Pierre', () => {
    const two = fakePen();
    drawPuitsMotion(two.P, 2, 0, 0, 42, 30);
    expect(two.lines).toHaveLength(9);
    expect(hasRect(two.rects, 46, 23, 1, 52)).toBe(true);
  });

  it('redessine les montants par-dessus la corde et le seau', () => {
    const one = fakePen();
    drawPuitsMotion(one.P, 1, 0, 0, 10, 30);
    expect(one.lines).toContainEqual({ x0: 36, y0: 4, x1: 15, y1: 68 });
    expect(one.lines).toContainEqual({ x0: 36, y0: 4, x1: 59, y1: 66 });
    const two = fakePen();
    drawPuitsMotion(two.P, 2, 0, 0, 42, 30);
    expect(two.lines).toContainEqual({ x0: 58, y0: 98, x1: 42, y1: 22 });
  });
});

describe('smokeVent', () => {
  it('donne un évent aux trois bâtiments qui fument, aux deux ères', () => {
    for (const era of [1, 2] as const) {
      expect(smokeVent('charbonniere', era, 2)).not.toBeNull();
      expect(smokeVent('four', era, 44)).not.toBeNull();
      expect(smokeVent('bruleur', era, 40)).not.toBeNull();
    }
  });

  it('colore la fumée et n’en donne pas aux autres bâtiments', () => {
    expect(smokeVent('charbonniere', 1, 2)).toEqual({ x: 24, y: 20, color: 'dark' });
    expect(smokeVent('four', 2, 44)).toEqual({ x: 36, y: 2, color: 'pale' });
    expect(smokeVent('bruleur', 2, 40)?.color).toBe('dark');
    expect(smokeVent('puits', 1, 10)).toBeNull();
    expect(smokeVent('entrepot', 2, 20)).toBeNull();
  });
});
