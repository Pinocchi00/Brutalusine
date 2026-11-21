import { describe, expect, it } from 'vitest';
import { C } from '../src/render/px/palette';
import type { Pen } from '../src/render/px/pen';
import {
  TREE_RADIUS,
  TREE_VARIANTS,
  canopySize,
  paintCanopy,
  treeKindAt,
  treeSway,
  treeVariantAt,
  type TreeKind,
  type TreeSize,
} from '../src/render/px/trees';

/** Une grille de couleurs qui imite le crayon, avec le compte des pixels hors du carré. */
interface Grid {
  w: number;
  h: number;
  cells: (string | null)[];
  outside: number;
}

/** Un faux crayon qui écrit dans une grille, sans canevas : les primitives suivent `pen.ts`. */
function fakePen(w: number, h: number): { P: Pen; grid: Grid } {
  const grid: Grid = { w, h, cells: new Array<string | null>(w * h).fill(null), outside: 0 };

  const fill = (a: number, b: number, rw: number, rh: number, col: string): void => {
    for (let y = b; y < b + rh; y++) {
      for (let x = a; x < a + rw; x++) {
        if (x < 0 || y < 0 || x >= w || y >= h) {
          grid.outside++;
          continue;
        }
        grid.cells[y * w + x] = col;
      }
    }
  };

  const r = (a: number, b: number, rw: number, rh: number, col: string): void => {
    a = Math.round(a);
    b = Math.round(b);
    rw = Math.round(rw);
    rh = Math.round(rh);
    if (rw <= 0 || rh <= 0) return;
    fill(a, b, rw, rh, col);
  };

  const p = (a: number, b: number, col: string): void => r(a, b, 1, 1, col);

  const line = (x0: number, y0: number, x1: number, y1: number, col: string, th = 1): void => {
    x0 = Math.round(x0);
    y0 = Math.round(y0);
    x1 = Math.round(x1);
    y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let e = dx + dy;
    for (let g = 0; g < 800; g++) {
      r(x0, y0, th, th, col);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * e;
      if (e2 >= dy) {
        e += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        e += dx;
        y0 += sy;
      }
    }
  };

  const ell = (cx: number, cy: number, rx: number, ry: number, col: string): void => {
    for (let yy = Math.floor(cy - ry); yy < Math.ceil(cy + ry); yy++) {
      const dy = (yy + 0.5 - cy) / ry;
      if (Math.abs(dy) > 1) continue;
      const hw = rx * Math.sqrt(1 - dy * dy), a = Math.round(cx - hw), b = Math.round(cx + hw);
      if (b > a) fill(a, yy, b - a, 1, col);
    }
  };

  const disc = (cx: number, cy: number, rad: number, col: string): void => ell(cx, cy, rad, rad, col);

  return { P: { r, p, line, ell, disc }, grid };
}

/** Peint un houppier et renvoie sa grille. */
function canopyGrid(R: number, seed: number, kind: TreeKind): Grid {
  const S = canopySize(R);
  const { P, grid } = fakePen(S, S);
  paintCanopy(P, R, seed, kind);
  return grid;
}

/** Les couleurs présentes dans une grille, sans les cases vides. */
function colorsOf(grid: Grid): Set<string> {
  const out = new Set<string>();
  for (const col of grid.cells) if (col !== null) out.add(col);
  return out;
}

const KINDS: readonly TreeKind[] = ['leafy', 'palm', 'flower'];
const SIZES: readonly TreeSize[] = [1, 2, 3];

describe('répartition des arbres', () => {
  it('espèce et variante sont déterministes et dans leurs bornes', () => {
    for (let ty = 0; ty < 100; ty++) {
      for (let tx = 0; tx < 200; tx++) {
        const kind = treeKindAt(tx, ty, 1234);
        expect(KINDS).toContain(kind);
        expect(treeKindAt(tx, ty, 1234)).toBe(kind);
        const variant = treeVariantAt(tx, ty, 1234);
        expect(Number.isInteger(variant)).toBe(true);
        expect(variant).toBeGreaterThanOrEqual(0);
        expect(variant).toBeLessThan(TREE_VARIANTS);
        expect(treeVariantAt(tx, ty, 1234)).toBe(variant);
      }
    }
  });

  it('sur 20 000 cases, les parts sont à ±3 points de 74 / 16 / 10', () => {
    const counts: Record<TreeKind, number> = { leafy: 0, palm: 0, flower: 0 };
    for (let ty = 0; ty < 100; ty++) {
      for (let tx = 0; tx < 200; tx++) counts[treeKindAt(tx, ty, 1234)]++;
    }
    expect(Math.abs(counts.leafy / 200 - 74)).toBeLessThanOrEqual(3);
    expect(Math.abs(counts.palm / 200 - 16)).toBeLessThanOrEqual(3);
    expect(Math.abs(counts.flower / 200 - 10)).toBeLessThanOrEqual(3);
  });

  it('deux graines donnent des répartitions différentes', () => {
    const counts = (seed: number): number[] => {
      const out = [0, 0, 0];
      for (let ty = 0; ty < 100; ty++) {
        for (let tx = 0; tx < 200; tx++) out[KINDS.indexOf(treeKindAt(tx, ty, seed))]++;
      }
      return out;
    };
    expect(counts(1234)).not.toEqual(counts(4321));
  });
});

describe('houppier peint', () => {
  it('donne la même grille à deux appels', () => {
    const a = canopyGrid(14, 777, 'leafy');
    const b = canopyGrid(14, 777, 'leafy');
    expect(a.cells).toEqual(b.cells);
  });

  it('donne des grilles différentes pour deux variantes', () => {
    const a = canopyGrid(14, 111, 'leafy');
    const b = canopyGrid(14, 222, 'leafy');
    expect(a.cells).not.toEqual(b.cells);
  });

  it('reste dans son carré pour chaque espèce et chaque taille', () => {
    for (const kind of KINDS) {
      for (const size of SIZES) {
        const grid = canopyGrid(TREE_RADIUS[size], 4242 + size, kind);
        expect(grid.outside).toBe(0);
        expect(colorsOf(grid).size).toBeGreaterThan(0);
      }
    }
  });
});

describe('couleurs des espèces', () => {
  it('seules les fleurs contiennent C.pink', () => {
    for (const size of SIZES) {
      const leafy = colorsOf(canopyGrid(TREE_RADIUS[size], 31, 'leafy'));
      const palm = colorsOf(canopyGrid(TREE_RADIUS[size], 31, 'palm'));
      const flower = colorsOf(canopyGrid(TREE_RADIUS[size], 31, 'flower'));
      expect(leafy.has(C.pink)).toBe(false);
      expect(palm.has(C.pink)).toBe(false);
      expect(flower.has(C.pink)).toBe(true);
    }
  });

  it('le palmier contient C.e2 au centre', () => {
    for (const size of SIZES) {
      const grid = canopyGrid(TREE_RADIUS[size], 31, 'palm');
      const S = canopySize(TREE_RADIUS[size]);
      const center = grid.cells[(S / 2) * S + S / 2];
      expect(center).toBe(C.e2);
    }
  });

  it('le feuillu a du C.g1 en haut à gauche et du C.g5 en bas à droite', () => {
    for (const size of SIZES) {
      const grid = canopyGrid(TREE_RADIUS[size], 31, 'leafy');
      const S = canopySize(TREE_RADIUS[size]);
      const center = S / 2;
      let topLeft = false, bottomRight = false;
      for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
          const col = grid.cells[y * S + x];
          if (col === C.g1 && x < center && y < center) topLeft = true;
          if (col === C.g5 && x > center && y > center) bottomRight = true;
        }
      }
      expect(topLeft).toBe(true);
      expect(bottomRight).toBe(true);
    }
  });
});

describe('balancement', () => {
  it('treeSway reste dans [-1, 1]', () => {
    for (let i = 0; i < 2000; i++) {
      const sway = treeSway(i * 0.13 - 10, i * 7 - 300);
      expect(sway).toBeGreaterThanOrEqual(-1);
      expect(sway).toBeLessThanOrEqual(1);
    }
  });
});
