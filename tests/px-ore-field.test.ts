/**
 * Vérification hors navigateur du regroupement des gisements : un carré 2 × 2, un seul affleurement,
 * et le carré reste décrit tant qu'il reste au moins une case.
 */
import { describe, expect, it } from 'vitest';
import { oreCell, oreVariant } from '../src/render/px/oreField';

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
  it('suit le nombre de cases : 1 → 0, 2 ou 3 → 1, 4 → 2', () => {
    expect(oreVariant(1)).toBe(0);
    expect(oreVariant(2)).toBe(1);
    expect(oreVariant(3)).toBe(1);
    expect(oreVariant(4)).toBe(2);
  });
});
