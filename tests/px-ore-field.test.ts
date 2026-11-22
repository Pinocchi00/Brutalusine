/**
 * Vérification hors navigateur du regroupement des gisements : un carré 2 × 2, un seul affleurement,
 * et le carré reste décrit tant qu'il reste au moins une case.
 */
import { describe, expect, it } from 'vitest';
import {
  chooseHarvest,
  maskCovers,
  oreCell,
  oreCoversScrap,
  oreOffset,
  oreSolidAt,
  oreVariant,
  pickOreTile,
  pickVisibleOreTile,
  rubbleOffset,
  type OreBlocker,
  type PlacedOre,
} from '../src/render/px/oreField';

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

/** Une roche placée minimale, surchargée au besoin. */
function rock(overrides: Partial<PlacedOre>): PlacedOre {
  return {
    X: 0,
    Y: 0,
    width: 2,
    height: 2,
    footPx: 0,
    solid: [0, 0, 0, 0],
    tiles: [{ x: 0, y: 0 }],
    ...overrides,
  };
}

describe('maskCovers', () => {
  const mask = [1, 0, 1, 0];

  it('reconnaît un pixel plein et un pixel transparent', () => {
    expect(maskCovers(mask, 2, 2, 0, 0)).toBe(true);
    expect(maskCovers(mask, 2, 2, 1, 0)).toBe(false);
  });

  it('refuse les quatre bords hors des bornes', () => {
    expect(maskCovers(mask, 2, 2, -1, 0)).toBe(false);
    expect(maskCovers(mask, 2, 2, 2, 0)).toBe(false);
    expect(maskCovers(mask, 2, 2, 0, -1)).toBe(false);
    expect(maskCovers(mask, 2, 2, 0, 2)).toBe(false);
  });

  it('reconnaît les quatre coins du masque', () => {
    const corners = [1, 0, 0, 1];
    expect(maskCovers(corners, 2, 2, 0, 0)).toBe(true);
    expect(maskCovers(corners, 2, 2, 1, 0)).toBe(false);
    expect(maskCovers(corners, 2, 2, 0, 1)).toBe(false);
    expect(maskCovers(corners, 2, 2, 1, 1)).toBe(true);
  });
});

describe('oreSolidAt', () => {
  it('reconnaît un pixel plein et un pixel transparent', () => {
    const ore = rock({ solid: [1, 0, 0, 1] });
    expect(oreSolidAt(ore, 0, 0)).toBe(true);
    expect(oreSolidAt(ore, 1, 0)).toBe(false);
    expect(oreSolidAt(ore, 0, 1)).toBe(false);
    expect(oreSolidAt(ore, 1, 1)).toBe(true);
  });

  it('refuse tout pixel hors du rectangle du sprite', () => {
    const ore = rock({ X: 10, Y: 20, solid: [1, 1, 1, 1] });
    expect(oreSolidAt(ore, 9, 20)).toBe(false);
    expect(oreSolidAt(ore, 10, 19)).toBe(false);
    expect(oreSolidAt(ore, 12, 20)).toBe(false);
    expect(oreSolidAt(ore, 10, 22)).toBe(false);
    expect(oreSolidAt(ore, 10, 20)).toBe(true);
    expect(oreSolidAt(ore, 11, 21)).toBe(true);
  });

  it('gère les coordonnées négatives', () => {
    const ore = rock({ X: -10, Y: -10, solid: [0, 1, 0, 0] });
    expect(oreSolidAt(ore, -9, -10)).toBe(true);
    expect(oreSolidAt(ore, -10, -10)).toBe(false);
    expect(oreSolidAt(ore, -11, -10)).toBe(false);
    expect(oreSolidAt(ore, -9, -11)).toBe(false);
  });
});

describe('pickOreTile', () => {
  const solid = [1, 1, 1, 1];

  it('ne choisit rien sur un pixel transparent', () => {
    expect(pickOreTile([rock({})], 0, 0)).toBeNull();
    expect(pickOreTile([], 5, 5)).toBeNull();
  });

  it('prend la roche au pied le plus au sud', () => {
    const north = rock({ X: 0, Y: 0, footPx: 10, solid, tiles: [{ x: 1, y: 1 }] });
    const south = rock({ X: 0, Y: 0, footPx: 20, solid, tiles: [{ x: 2, y: 2 }] });
    expect(pickOreTile([north, south], 0, 0)).toEqual({ x: 2, y: 2 });
    expect(pickOreTile([south, north], 0, 0)).toEqual({ x: 2, y: 2 });
  });

  it('à pied égal, prend le plus grand X', () => {
    const left = rock({ X: 0, Y: 0, footPx: 20, solid, tiles: [{ x: 1, y: 0 }] });
    const right = rock({ X: 4, Y: 0, footPx: 20, solid, tiles: [{ x: 2, y: 0 }] });
    expect(pickOreTile([left, right], 4, 0)).toEqual({ x: 2, y: 0 });
    expect(pickOreTile([right, left], 4, 0)).toEqual({ x: 2, y: 0 });
  });

  it('prend la case la plus proche du point', () => {
    const ore = rock({
      width: 200,
      height: 24,
      solid: new Uint8Array(200 * 24).fill(1),
      tiles: [{ x: 0, y: 0 }, { x: 5, y: 0 }],
    });
    expect(pickOreTile([ore], 12, 12)).toEqual({ x: 0, y: 0 });
    expect(pickOreTile([ore], 130, 12)).toEqual({ x: 5, y: 0 });
  });

  it('à distance égale, prend la première case de la liste', () => {
    const ore = rock({
      width: 200,
      height: 24,
      solid: new Uint8Array(200 * 24).fill(1),
      tiles: [{ x: 0, y: 0 }, { x: 1, y: 0 }],
    });
    expect(pickOreTile([ore], 24, 12)).toEqual({ x: 0, y: 0 });
  });
});

describe('pickVisibleOreTile', () => {
  const solid = [1, 1, 1, 1];
  const ore = rock({ footPx: 10, solid, tiles: [{ x: 3, y: 3 }] });

  it('choisit la roche quand aucun bloqueur ne couvre le pixel', () => {
    expect(pickVisibleOreTile([ore], [], 0, 0)).toEqual({ x: 3, y: 3 });
  });

  it('rend null si un bloqueur au pied plus au sud couvre le pixel', () => {
    const blocker: OreBlocker = { footPx: 11, x: 0, frontOnTie: false, covers: () => true };
    expect(pickVisibleOreTile([ore], [blocker], 0, 0)).toBeNull();
  });

  it('ne cache pas si le bloqueur est au même pied mais à un X plus petit', () => {
    const same: OreBlocker = { footPx: 10, x: -1, frontOnTie: false, covers: () => true };
    const north: OreBlocker = { footPx: 9, x: 0, frontOnTie: false, covers: () => true };
    expect(pickVisibleOreTile([ore], [same], 0, 0)).toEqual({ x: 3, y: 3 });
    expect(pickVisibleOreTile([ore], [north], 0, 0)).toEqual({ x: 3, y: 3 });
  });

  it('à pied égal, un bloqueur de X plus grand cache la roche', () => {
    const blocker: OreBlocker = { footPx: 10, x: 1, frontOnTie: false, covers: () => true };
    expect(pickVisibleOreTile([ore], [blocker], 0, 0)).toBeNull();
  });

  it('à pied et X égaux, un bloqueur de façade cache la roche', () => {
    const blocker: OreBlocker = { footPx: 10, x: 0, frontOnTie: true, covers: () => true };
    expect(pickVisibleOreTile([ore], [blocker], 0, 0)).toBeNull();
  });

  it('à pied et X égaux, un bloqueur d’arbre ne cache pas la roche', () => {
    const blocker: OreBlocker = { footPx: 10, x: 0, frontOnTie: false, covers: () => true };
    expect(pickVisibleOreTile([ore], [blocker], 0, 0)).toEqual({ x: 3, y: 3 });
  });

  it('ne cache pas si le bloqueur au sud ne couvre pas ce pixel', () => {
    const blocker: OreBlocker = { footPx: 20, x: 0, frontOnTie: false, covers: () => false };
    expect(pickVisibleOreTile([ore], [blocker], 0, 0)).toEqual({ x: 3, y: 3 });
  });
});

describe('oreCoversScrap', () => {
  /** Un débris 24 × 24 dont seuls les pixels indiqués portent de l'alpha. */
  function scrap(opaque: ReadonlyMap<number, number>): Uint8ClampedArray {
    const data = new Uint8ClampedArray(24 * 24 * 4);
    for (const [index, alpha] of opaque) data[index * 4 + 3] = alpha;
    return data;
  }

  it('recouvre un débris dès qu’un pixel plein de la roche tombe sur un pixel opaque', () => {
    const placed = rock({ X: 24, Y: 48, width: 2, height: 2, solid: [1, 0, 0, 0] });
    expect(oreCoversScrap(placed, scrap(new Map([[0, 255]])), 1, 2)).toBe(true);
  });

  it('ne recouvre rien si la roche ne tombe que sur des pixels transparents', () => {
    const placed = rock({ X: 24, Y: 48, width: 2, height: 2, solid: [1, 0, 0, 0] });
    expect(oreCoversScrap(placed, scrap(new Map([[1, 255]])), 1, 2)).toBe(false);
    expect(oreCoversScrap(placed, scrap(new Map()), 1, 2)).toBe(false);
  });
});

describe('chooseHarvest', () => {
  it('fait gagner un débris sur tout le reste', () => {
    expect(chooseHarvest({
      loot: { x: 1, y: 2 },
      entity: true,
      visibleOre: { x: 3, y: 4 },
      direct: { kind: 'tree', x: 5, y: 6 },
    })).toEqual({ kind: 'loot', x: 1, y: 2 });
  });

  it('rend null devant une entité quand il n’y a pas de débris', () => {
    expect(chooseHarvest({
      loot: null,
      entity: true,
      visibleOre: { x: 3, y: 4 },
      direct: { kind: 'tree', x: 5, y: 6 },
    })).toBeNull();
  });

  it('fait passer la roche visible devant l’arbre ou le gisement de la case', () => {
    expect(chooseHarvest({
      loot: null,
      entity: false,
      visibleOre: { x: 3, y: 4 },
      direct: { kind: 'tree', x: 5, y: 6 },
    })).toEqual({ kind: 'ore', x: 3, y: 4 });
  });

  it('retombe sur la case visée quand rien ne passe devant', () => {
    expect(chooseHarvest({
      loot: null,
      entity: false,
      visibleOre: null,
      direct: { kind: 'tree', x: 5, y: 6 },
    })).toEqual({ kind: 'tree', x: 5, y: 6 });
    expect(chooseHarvest({ loot: null, entity: false, visibleOre: null, direct: null })).toBeNull();
  });
});

describe('rubbleOffset', () => {
  it('garde x dans [-5, 5] et y dans [-9, 3] pour h1 et h2 dans [0, 1[', () => {
    for (let i = 0; i <= 1000; i++) {
      const h = i / 1000;
      const offset = rubbleOffset(h, h);
      expect(offset.x).toBeGreaterThanOrEqual(-5);
      expect(offset.x).toBeLessThanOrEqual(5);
      expect(offset.y).toBeGreaterThanOrEqual(-9);
      expect(offset.y).toBeLessThanOrEqual(3);
      expect(Number.isInteger(offset.x)).toBe(true);
      expect(Number.isInteger(offset.y)).toBe(true);
    }
  });

  it('est déterministe et suit les extrémités des tirages', () => {
    expect(rubbleOffset(0.25, 0.8)).toEqual(rubbleOffset(0.25, 0.8));
    expect(rubbleOffset(0, 0)).toEqual({ x: -5, y: -9 });
    expect(rubbleOffset(0.999, 0.999)).toEqual({ x: 5, y: 3 });
  });
});
