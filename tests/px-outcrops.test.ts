/**
 * Vérification hors navigateur des affleurements : le plan, les repères et les animations,
 * sur un faux crayon qui écrit les couleurs dans une grille. Aucun canevas.
 */
import { describe, expect, it, vi } from 'vitest';
import { DEPOSITS } from '../src/sim/data';
import { C } from '../src/render/px/palette';
import type { Pen } from '../src/render/px/pen';
import {
  OUTCROP_ALTS,
  OUTCROP_VARIANTS,
  type OutcropPlan,
  type RockKind,
  drawOreLive,
  drawRockHit,
  outcropSprite,
  outcropSpriteKeys,
  paintOutcrop,
  paintRubble,
  rockKind,
  rockShake,
  rubbleSolid,
} from '../src/render/px/outcrops';

vi.mock('../src/render/px/surface', () => ({
  makeSurface: (w: number, h: number) => ({
    canvas: { width: w, height: h },
    ctx: {
      fillStyle: '',
      fillRect: () => undefined,
      drawImage: () => undefined,
      getImageData: (x: number, y: number, width: number, height: number) => ({
        data: new Uint8ClampedArray(width * height * 4),
      }),
    },
  }),
}));

vi.mock('../src/render/px/finish', () => ({
  finish: (canvas: { width: number; height: number }) => (
    { width: canvas.width, height: canvas.height } as unknown as HTMLCanvasElement
  ),
  outline: (canvas: HTMLCanvasElement) => canvas,
}));

/** Une grille de couleurs et le compte des pixels qui auraient débordé. */
interface Grid {
  width: number;
  height: number;
  cells: string[];
  outside: number;
}

/** Un faux crayon fidèle aux arrondis du crayon réel, qui note les débordements. */
function fakePen(width: number, height: number): { pen: Pen; grid: Grid } {
  const grid: Grid = { width, height, cells: new Array<string>(width * height).fill(''), outside: 0 };

  const set = (a: number, b: number, col: string): void => {
    if (a < 0 || b < 0 || a >= width || b >= height) {
      grid.outside++;
      return;
    }
    grid.cells[b * width + a] = col;
  };

  const r = (a: number, b: number, w: number, h: number, col: string): void => {
    const x = Math.round(a), y = Math.round(b), rw = Math.round(w), rh = Math.round(h);
    if (rw <= 0 || rh <= 0) return;
    for (let j = 0; j < rh; j++) {
      for (let i = 0; i < rw; i++) set(x + i, y + j, col);
    }
  };

  const p = (a: number, b: number, col: string): void => r(a, b, 1, 1, col);

  const line = (x0: number, y0: number, x1: number, y1: number, col: string, th = 1): void => {
    let x = Math.round(x0), y = Math.round(y0);
    const ex = Math.round(x1), ey = Math.round(y1);
    const dx = Math.abs(ex - x), dy = -Math.abs(ey - y);
    const sx = x < ex ? 1 : -1, sy = y < ey ? 1 : -1;
    let e = dx + dy;
    for (let g = 0; g < 800; g++) {
      r(x, y, th, th, col);
      if (x === ex && y === ey) break;
      const e2 = 2 * e;
      if (e2 >= dy) {
        e += dy;
        x += sx;
      }
      if (e2 <= dx) {
        e += dx;
        y += sy;
      }
    }
  };

  const ell = (cx: number, cy: number, rx: number, ry: number, col: string): void => {
    for (let yy = Math.floor(cy - ry); yy < Math.ceil(cy + ry); yy++) {
      const dy = (yy + 0.5 - cy) / ry;
      if (Math.abs(dy) > 1) continue;
      const hw = rx * Math.sqrt(1 - dy * dy);
      const a = Math.round(cx - hw), b = Math.round(cx + hw);
      for (let i = a; i < b; i++) set(i, yy, col);
    }
  };

  const disc = (cx: number, cy: number, rad: number, col: string): void => ell(cx, cy, rad, rad, col);

  return { pen: { r, p, line, ell, disc }, grid };
}

/** Les dimensions attendues de la surface de base, selon la variante. */
const BASE_SIZES = [
  { w: 10, h: 7 },
  { w: 12, h: 8 },
  { w: 14, h: 9 },
] as const;

/** Peint un affleurement sur une grille de sa taille de base. */
function paint(kind: RockKind, variant: number, alt = 0): { plan: OutcropPlan; grid: Grid } {
  const size = BASE_SIZES[variant];
  const { pen, grid } = fakePen(size.w * 3 + 10, size.h * 3 + 14);
  const plan = paintOutcrop(pen, kind, variant, alt);
  return { plan, grid };
}

/** Les coordonnées peintes d'une grille. */
function drawn(grid: Grid): { x: number; y: number; col: string }[] {
  const out: { x: number; y: number; col: string }[] = [];
  grid.cells.forEach((col, i) => {
    if (col) out.push({ x: i % grid.width, y: Math.floor(i / grid.width), col });
  });
  return out;
}

/** Les couleurs distinctes d'une grille. */
function colors(grid: Grid): string[] {
  return [...new Set(grid.cells.filter((col) => col))];
}

const KINDS: readonly RockKind[] = ['fe', 'st', 'qz', 'cu'];
const VARIANTS = Array.from({ length: OUTCROP_VARIANTS }, (_, i) => i);
const QZ = new Set<string>([C.qz0, C.qz1, C.qz2, C.qz3, C.qz4]);
const IR = new Set<string>([C.ir0, C.ir1, C.ir2, C.ir3, C.irm, C.irk]);
const MA = new Set<string>([C.ma0, C.ma1, C.ma2, C.ma3]);

describe('gisements et variantes', () => {
  it('suit l’ordre de DEPOSITS : fer, pierre, quartz, cuivre', () => {
    const fromDeposits = DEPOSITS.slice(1).map((_, index) => rockKind((index + 1) as 1 | 2 | 3 | 4));
    expect(fromDeposits).toEqual(['fe', 'st', 'qz', 'cu']);
    for (let deposit = 1; deposit <= 4; deposit++) {
      expect(rockKind(deposit as 1 | 2 | 3 | 4)).toBe(fromDeposits[deposit - 1]);
    }
  });

});

describe('le plan écrit', () => {
  it('donne la même grille à deux appels et change avec la variante', () => {
    for (const kind of KINDS) {
      const a = paint(kind, 0);
      const b = paint(kind, 0);
      expect(a.grid.cells).toEqual(b.grid.cells);
      expect(a.plan).toEqual(b.plan);
      const wide = paint(kind, 1);
      expect(wide.grid.cells.join('|')).not.toBe(a.grid.cells.join('|'));
    }
  });

  it('ne peint aucun pixel hors de width × height, pour tous les types et variantes', () => {
    for (const kind of KINDS) {
      for (const variant of VARIANTS) {
        const { plan, grid } = paint(kind, variant);
        expect(grid.outside, `${kind} ${variant}`).toBe(0);
        expect(grid.width).toBe(plan.width);
        expect(grid.height).toBe(plan.height);
      }
    }
  });

  it('garde marks, crack et foot dans le sprite fini', () => {
    for (const kind of KINDS) {
      for (const variant of VARIANTS) {
        const { plan } = paint(kind, variant);
        const width = plan.width + 2, height = plan.height + 2;
        expect(plan.foot).toBeGreaterThanOrEqual(0);
        expect(plan.foot).toBeLessThan(height);
        expect(plan.crack.x).toBeGreaterThanOrEqual(0);
        expect(plan.crack.x).toBeLessThan(width);
        expect(plan.crack.y).toBeGreaterThanOrEqual(0);
        expect(plan.crack.y).toBeLessThan(height);
        for (const mark of plan.marks) {
          expect(mark.x).toBeGreaterThanOrEqual(0);
          expect(mark.x).toBeLessThan(width);
          expect(mark.y).toBeGreaterThanOrEqual(0);
          expect(mark.y).toBeLessThan(height);
        }
      }
    }
  });

  it('ne montre ni quartz, ni fer, ni malachite dans la pierre, et aucun repère', () => {
    for (const variant of VARIANTS) {
      const { plan, grid } = paint('st', variant);
      expect(plan.marks).toEqual([]);
      for (const col of colors(grid)) {
        expect(QZ.has(col), `quartz ${col}`).toBe(false);
        expect(IR.has(col), `fer ${col}`).toBe(false);
        expect(MA.has(col), `malachite ${col}`).toBe(false);
      }
    }
  });

  it('montre le minerai de chaque roche : ir1 pour le fer, ma2 pour le cuivre, qz0 pour le quartz', () => {
    expect(colors(paint('fe', 0).grid)).toContain(C.ir1);
    expect(colors(paint('cu', 0).grid)).toContain(C.ma2);
    expect(colors(paint('qz', 0).grid)).toContain(C.qz0);
  });
});

describe('clés des affleurements', () => {
  it('couvre exactement les 36 combinaisons de type, variante et alternative, sans doublon', () => {
    const keys = outcropSpriteKeys();
    expect(keys).toHaveLength(36);
    const seen = new Set(keys.map((key) => `${key.kind}:${key.variant}:${key.alt}`));
    expect(seen.size).toBe(36);
    for (const kind of KINDS) {
      for (const variant of VARIANTS) {
        for (let alt = 0; alt < OUTCROP_ALTS; alt++) {
          expect(seen.has(`${kind}:${variant}:${alt}`), `${kind} ${variant} ${alt}`).toBe(true);
        }
      }
    }
  });
});

describe('les alternatives de graine', () => {
  it('change la grille sans toucher au type ni aux dimensions', () => {
    for (const kind of KINDS) {
      const base = paint(kind, 0, 0);
      const same = paint(kind, 0, 0);
      const other = paint(kind, 0, 1);
      expect(same.grid.cells).toEqual(base.grid.cells);
      expect(other.grid.cells.join('|')).not.toBe(base.grid.cells.join('|'));
      expect(other.plan.width).toBe(base.plan.width);
      expect(other.plan.height).toBe(base.plan.height);
      expect(other.plan.kind).toBe(base.plan.kind);
    }
  });

  it('garde un cache distinct par alternative et type', () => {
    const a = outcropSprite('fe', 0, 0);
    const again = outcropSprite('fe', 0, 0);
    const alt = outcropSprite('fe', 0, 1);
    expect(again).toBe(a);
    expect(alt).not.toBe(a);
    expect(alt.img).not.toBe(a.img);
  });

  it('ramène l’alternative dans ses bornes', () => {
    const first = outcropSprite('fe', 0, 0);
    expect(outcropSprite('fe', 0, OUTCROP_ALTS)).toBe(first);
    expect(outcropSprite('fe', 0, -OUTCROP_ALTS)).toBe(first);
    expect(outcropSprite('fe', 0, -1)).toBe(outcropSprite('fe', 0, OUTCROP_ALTS - 1));
  });
});

describe('la vie du minerai', () => {
  it('ne dessine rien pour la pierre, quel que soit l’instant', () => {
    const { plan } = paint('st', 0);
    for (const now of [0, 0.05, 0.3, 1, 2, 4, 8]) {
      const { pen, grid } = fakePen(plan.width + 2, plan.height + 2);
      drawOreLive(pen, plan, 0, 0, now, 0);
      expect(grid.cells.every((col) => col === '')).toBe(true);
    }
  });

  it('garde la vie du fer, du cuivre et du quartz sur les repères', () => {
    for (const [kind, now] of [['fe', 0], ['cu', 2], ['qz', 0]] as const) {
      const { plan } = paint(kind, 0);
      expect(plan.marks.length).toBeGreaterThan(0);
      const { pen, grid } = fakePen(plan.width + 2, plan.height + 2);
      drawOreLive(pen, plan, 0, 0, now, 0);
      const points = drawn(grid);
      expect(points.length).toBeGreaterThan(0);
      for (const point of points) {
        const near = plan.marks.some((mark) => Math.abs(mark.x - point.x) <= 1 && Math.abs(mark.y - point.y) <= 1);
        expect(near, `${kind} (${point.x}, ${point.y})`).toBe(true);
      }
    }
  });
});

describe('les cailloux au pied', () => {
  it('peint trois ou quatre cailloux de pierre dans 20 × 14, avec un pixel de minerai', () => {
    for (const variant of VARIANTS) {
      const { pen, grid } = fakePen(20, 14);
      paintRubble(pen, 'st', variant);
      expect(grid.outside, `variante ${variant}`).toBe(0);
      const count = variant % 2 === 0 ? 3 : 4;
      const tops = grid.cells.filter((col) => col === C.st1);
      const bases = grid.cells.filter((col) => col === C.st3);
      const ore = grid.cells.filter((col) => col === C.st0);
      expect(tops, `dessus ${variant}`).toHaveLength(count * 2);
      expect(bases.length, `pieds ${variant}`).toBeGreaterThan(0);
      expect(ore, `minerai ${variant}`).toHaveLength(1);
    }
  });

  it('reste dans 20 × 14 pour chaque type et variante', () => {
    for (const kind of KINDS) {
      for (const variant of VARIANTS) {
        const { pen, grid } = fakePen(20, 14);
        paintRubble(pen, kind, variant);
        expect(grid.outside, `${kind} ${variant}`).toBe(0);
      }
    }
  });

  it('ne range pas tous les cailloux sur la même ligne', () => {
    const rows = new Set<number>();
    for (const kind of KINDS) {
      for (const variant of VARIANTS) {
        const { pen, grid } = fakePen(20, 14);
        paintRubble(pen, kind, variant);
        grid.cells.forEach((col, index) => {
          if (col) rows.add(Math.floor(index / grid.width));
        });
      }
    }
    expect(rows.size).toBeGreaterThan(1);
  });

  it('garde chaque type dans sa propre pierre et le minerai qui lui correspond', () => {
    for (const kind of KINDS) {
      const { pen, grid } = fakePen(20, 14);
      paintRubble(pen, kind, 0);
      expect(grid.outside, kind).toBe(0);
      const painted = colors(grid);
      expect(painted.length, kind).toBeGreaterThan(0);
      if (kind === 'fe') expect(painted).toContain(C.ir1);
      if (kind === 'cu') expect(painted).toContain(C.ma2);
      if (kind === 'qz') expect(painted).toContain(C.qz1);
    }
  });
});

describe('masque des cailloux', () => {
  it('couvre 20 × 14 pixels et reste en cache par type et variante', () => {
    const first = rubbleSolid('st', 0);
    expect(first).toHaveLength(20 * 14);
    expect(rubbleSolid('st', 0)).toBe(first);
    expect(rubbleSolid('st', 1)).not.toBe(first);
    expect(rubbleSolid('fe', 0)).not.toBe(first);
  });
});

describe('le coup de pioche', () => {  it('ne trempe que de -1, 0 ou 1 et retombe à zéro dès 0,28 s', () => {
    for (let i = 0; i <= 1000; i++) {
      const shake = rockShake(i / 1000);
      expect([-1, 0, 1]).toContain(shake);
    }
    for (const since of [0.28, 0.29, 0.5, 1, 2, 10]) {
      expect(rockShake(since)).toBe(0);
    }
    expect(rockShake(0)).toBe(-1);
    expect(rockShake(0.1)).toBe(1);
  });

  it('dessine un éclat de cinq pixels autour de la cassure, puis plus rien après 0,18 s', () => {
    const { plan } = paint('fe', 0);
    for (const since of [0, 0.05, 0.17]) {
      const { pen, grid } = fakePen(plan.width + 2, plan.height + 2);
      drawRockHit(pen, plan, 0, 0, since);
      const points = drawn(grid);
      expect(points).toHaveLength(5);
      const center = points.find((point) => point.x === plan.crack.x && point.y === plan.crack.y);
      expect(center?.col).toBe(C.white);
      for (const point of points) {
        if (point === center) continue;
        expect(point.col).toBe('#dcc6b6');
        const onCross = point.y === plan.crack.y || point.x === plan.crack.x;
        expect(onCross).toBe(true);
      }
    }
    for (const since of [0.18, 0.19, 0.5, 1]) {
      const { pen, grid } = fakePen(plan.width + 2, plan.height + 2);
      drawRockHit(pen, plan, 0, 0, since);
      expect(grid.cells.every((col) => col === '')).toBe(true);
    }
  });
});
