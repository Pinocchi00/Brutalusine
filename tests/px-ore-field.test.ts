/**
 * Vérification hors navigateur du regroupement des gisements : un carré 2 × 2, un seul affleurement,
 * et le carré reste décrit tant qu'il reste au moins une case.
 */
import { describe, expect, it } from 'vitest';
import { oreCell, oreOffset, oreVariant } from '../src/render/px/oreField';

/** Une lecture de gisements depuis une table de cases. */
function reader(cells: ReadonlyMap<string, number>): (tx: number, ty: number) => number {
  return (tx, ty) => cells.get(`${tx},${ty}`) ?? 0;
}

/** Construit la table depuis une liste de cases typées. */
function field(entries: readonly [number, number, number][]): ReadonlyMap<string, number> {
  return new Map(entries.map(([x, y, type]) => [`${x},${y}`, type]));
}

describe('oreCell', () => {
  it('renvoie null pour un carré vide', () => {
    expect(oreCell(reader(new Map()), 0, 0)).toBeNull();
    expect(oreCell(reader(new Map()), 7, -3)).toBeNull();
  });

  it('lit les coordonnées négatives sans bouger le carré', () => {
    const read = reader(field([[-2, -2, 2], [-1, -1, 2]]));
    const cell = oreCell(read, -1, -1);
    expect(cell).not.toBeNull();
    expect(cell?.type).toBe(2);
    expect(cell?.count).toBe(2);
    expect(cell?.tiles).toEqual([{ x: -2, y: -2 }, { x: -1, y: -1 }]);
    expect(cell?.centerX).toBe(-1);
    expect(cell?.footY).toBe(0);
  });

  it('décrit un carré d’une seule case', () => {
    const cell = oreCell(reader(field([[0, 0, 1]])), 0, 0);
    expect(cell).toEqual({
      type: 1,
      count: 1,
      centerX: 0.5,
      footY: 1,
      tiles: [{ x: 0, y: 0 }],
      others: [],
    });
  });

  it('donne le centre et le pied exacts pour deux cases', () => {
    const cell = oreCell(reader(field([[0, 0, 2], [1, 0, 2]])), 0, 0);
    expect(cell?.count).toBe(2);
    expect(cell?.centerX).toBe(1);
    expect(cell?.footY).toBe(1);
  });

  it('donne le centre et le pied exacts pour trois cases', () => {
    const cell = oreCell(reader(field([[0, 0, 3], [1, 0, 3], [0, 1, 3]])), 0, 0);
    expect(cell?.count).toBe(3);
    expect(cell?.centerX).toBeCloseTo((0.5 + 1.5 + 0.5) / 3, 12);
    expect(cell?.footY).toBe(2);
  });

  it('donne le centre et le pied exacts pour quatre cases', () => {
    const cell = oreCell(reader(field([[0, 0, 4], [1, 0, 4], [0, 1, 4], [1, 1, 4]])), 0, 0);
    expect(cell?.count).toBe(4);
    expect(cell?.centerX).toBe(1);
    expect(cell?.footY).toBe(2);
    expect(cell?.tiles).toHaveLength(4);
  });

  it('suit l’ordre nord-sud puis ouest-est pour le type principal et les autres', () => {
    const cell = oreCell(reader(field([[0, 0, 1], [1, 0, 2], [0, 1, 3], [1, 1, 2]])), 0, 0);
    expect(cell?.type).toBe(1);
    expect(cell?.tiles).toEqual([{ x: 0, y: 0 }]);
    expect(cell?.others).toEqual([
      { x: 1, y: 0, type: 2 },
      { x: 0, y: 1, type: 3 },
      { x: 1, y: 1, type: 2 },
    ]);
  });

  it('choisit le premier type restant quand le premier du carré a disparu', () => {
    const cell = oreCell(reader(field([[1, 0, 2], [0, 1, 2]])), 0, 0);
    expect(cell?.type).toBe(2);
    expect(cell?.count).toBe(2);
    expect(cell?.others).toEqual([]);
  });

  it('ne lit chaque case qu’une fois, et aucune pour un carré vide', () => {
    const counts = new Map<string, number>();
    const read = (tx: number, ty: number): number => {
      const key = `${tx},${ty}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
      return tx === 0 && ty === 0 ? 1 : 0;
    };
    oreCell(read, 0, 0);
    expect(counts.size).toBe(4);
    for (const value of counts.values()) expect(value).toBe(1);
    const emptyCounts = new Map<string, number>();
    const empty = (tx: number, ty: number): number => {
      const key = `${tx},${ty}`;
      emptyCounts.set(key, (emptyCounts.get(key) ?? 0) + 1);
      return 0;
    };
    expect(oreCell(empty, 5, 5)).toBeNull();
    expect(emptyCounts.size).toBe(4);
    for (const value of emptyCounts.values()) expect(value).toBe(1);
  });

  it('garde un sprite jusqu’à la dernière case retirée', () => {
    const remaining = [1, 2, 3, 4];
    const positions: readonly [number, number][] = [[0, 0], [1, 0], [0, 1], [1, 1]];
    while (remaining.length > 0) {
      const read = (tx: number, ty: number): number => {
        const index = positions.findIndex(([x, y]) => x === tx && y === ty);
        return index >= 0 && remaining.includes(index + 1) ? 1 : 0;
      };
      const cell = oreCell(read, 0, 0);
      expect(cell, `${remaining.length} case(s)`).not.toBeNull();
      expect(cell?.count).toBe(remaining.length);
      remaining.pop();
    }
    expect(oreCell(reader(new Map()), 0, 0)).toBeNull();
  });
});

describe('oreVariant', () => {
  it('donne toujours 0 pour une seule case', () => {
    expect(oreVariant(1, 0)).toBe(0);
    expect(oreVariant(1, 0.49)).toBe(0);
    expect(oreVariant(1, 0.5)).toBe(0);
    expect(oreVariant(1, 0.99)).toBe(0);
  });

  it('choisit 0 ou 1 pour deux ou trois cases selon le tirage', () => {
    for (const count of [2, 3]) {
      expect(oreVariant(count, 0)).toBe(0);
      expect(oreVariant(count, 0.499)).toBe(0);
      expect(oreVariant(count, 0.5)).toBe(1);
      expect(oreVariant(count, 0.999)).toBe(1);
    }
  });

  it('choisit 1 ou 2 pour quatre cases selon le tirage', () => {
    expect(oreVariant(4, 0)).toBe(1);
    expect(oreVariant(4, 0.499)).toBe(1);
    expect(oreVariant(4, 0.5)).toBe(2);
    expect(oreVariant(4, 0.999)).toBe(2);
  });
});

describe('oreOffset', () => {
  it('décale les rangées paires et impaires en sens opposé', () => {
    expect(oreOffset(0, 0.5, 0.5)).toEqual({ x: -6, y: 0 });
    expect(oreOffset(1, 0.5, 0.5)).toEqual({ x: 6, y: 0 });
    expect(oreOffset(2, 0.5, 0.5)).toEqual({ x: -6, y: 0 });
    expect(oreOffset(3, 0.5, 0.5)).toEqual({ x: 6, y: 0 });
  });

  it('comprend les coordonnées négatives : -1 est impair, -2 est pair', () => {
    expect(oreOffset(-1, 0.5, 0.5)).toEqual({ x: 6, y: 0 });
    expect(oreOffset(-2, 0.5, 0.5)).toEqual({ x: -6, y: 0 });
    expect(oreOffset(-3, 0.5, 0.5)).toEqual({ x: 6, y: 0 });
  });

  it('garde l’offset dans ses bornes pour h1 et h2 dans [0, 1[', () => {
    for (let i = 0; i <= 1000; i++) {
      const h = i / 1000;
      for (let cellY = -3; cellY <= 3; cellY++) {
        const offset = oreOffset(cellY, h, h);
        expect(offset.x).toBeGreaterThanOrEqual(-12);
        expect(offset.x).toBeLessThanOrEqual(12);
        expect(offset.y).toBeGreaterThanOrEqual(-9);
        expect(offset.y).toBeLessThanOrEqual(9);
        expect(Number.isInteger(offset.x)).toBe(true);
        expect(Number.isInteger(offset.y)).toBe(true);
      }
    }
  });

  it('suit les tirages : x de -12 à 0 ou de 0 à 12, y de -9 à 9', () => {
    expect(oreOffset(0, 0, 0)).toEqual({ x: -12, y: -9 });
    expect(oreOffset(0, 0.999, 0.999)).toEqual({ x: 0, y: 9 });
    expect(oreOffset(1, 0, 0)).toEqual({ x: 0, y: -9 });
    expect(oreOffset(1, 0.999, 0.999)).toEqual({ x: 12, y: 9 });
  });
});
