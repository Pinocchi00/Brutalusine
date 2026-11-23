/**
 * Vérification hors navigateur du dessin du bâtisseur.
 * Un faux crayon note chaque primitive ; on compare le portage à une copie fidèle des fonctions
 * `ik`, `drawLeg`, `drawArm`, `stroke` et `edges` de `docs/maquettes/heure-doree.html`.
 * La copie de l'oracle ne doit pas être modifiée : elle sert de référence.
 */
import { describe, expect, it } from 'vitest';
import { rng } from '../src/render/px/noise';
import type { Pen } from '../src/render/px/pen';
import { LENS_ORANGE, drawArm, drawLeg, lensForColor, solveLimb, type LimbPoint } from '../src/render/px/builderArt';

// =====================================================================================
// ORACLE — copie fidèle de la maquette.
// =====================================================================================
const OC = {
  ink: '#1a1018',
  s0: '#ddd6d0',
  s1: '#aaa2a2',
  s2: '#7c737b',
  s3: '#564d57',
  s4: '#3a323c',
} as const;

/** Le `ik` de la maquette. */
function oracleIk(
  sx: number,
  sy: number,
  fx: number,
  fy: number,
  a: number,
  b: number,
  pick: (first: LimbPoint, second: LimbPoint) => LimbPoint,
): { e: LimbPoint; f: LimbPoint } {
  let dx = fx - sx;
  let dy = fy - sy;
  let d = Math.hypot(dx, dy);
  if (d > a + b - 0.3) {
    const k = (a + b - 0.3) / d;
    dx *= k;
    dy *= k;
    d = a + b - 0.3;
  }
  d = Math.max(d, 2.5);
  const ang = Math.acos(Math.min(1, Math.max(-1, (a * a + d * d - b * b) / (2 * a * d))));
  const base = Math.atan2(dy, dx);
  const first: LimbPoint = [sx + Math.cos(base + ang) * a, sy + Math.sin(base + ang) * a];
  const second: LimbPoint = [sx + Math.cos(base - ang) * a, sy + Math.sin(base - ang) * a];
  return { e: pick(first, second), f: [sx + dx, sy + dy] };
}

/** Le `stroke` de la maquette. */
function oracleStroke(P: Pen, x0: number, y0: number, x1: number, y1: number, r: number, col: string): void {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    P.disc(Math.round(x0 + (x1 - x0) * t) + 0.5, Math.round(y0 + (y1 - y0) * t) + 0.5, r, col);
  }
}

/** Le `edges` de la maquette. */
function oracleEdges(P: Pen, x0: number, y0: number, x1: number, y1: number, hi: string, lo: string): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const d = Math.hypot(dx, dy) || 1;
  let nx = dy / d;
  let ny = -dx / d;
  if (ny > 0) {
    nx = -nx;
    ny = -ny;
  }
  P.line(Math.round(x0 + nx), Math.round(y0 + ny), Math.round(x1 + nx), Math.round(y1 + ny), hi);
  P.line(Math.round(x0 - nx), Math.round(y0 - ny), Math.round(x1 - nx), Math.round(y1 - ny), lo);
}

/** Le `drawLeg` de la maquette. */
function oracleDrawLeg(P: Pen, hx: number, hy: number, fx: number, fy: number, toe: boolean, rear: boolean): void {
  const { e: [kx, ky] } = oracleIk(hx, hy, fx, fy - 1, 4.5, 4.5, (a, b) => (a[0] > b[0] ? a : b));
  const core = rear ? OC.s3 : OC.s2;
  const hi = rear ? OC.s2 : OC.s1;
  oracleStroke(P, hx, hy, kx, ky, 2.5, OC.ink);
  oracleStroke(P, kx, ky, fx, fy - 1, 2.5, OC.ink);
  if (toe) {
    P.r(fx - 1, fy - 3, 6, 4, OC.ink);
  } else {
    P.r(fx - 4, fy - 2, 9, 4, OC.ink);
  }
  oracleStroke(P, hx, hy, kx, ky, 1.5, OC.s3);
  oracleStroke(P, kx, ky, fx, fy - 1, 1.5, core);
  P.p(Math.round(kx) - 1, Math.round(ky) - 1, hi);
  if (toe) {
    P.r(fx, fy - 2, 4, 2, OC.s2);
    P.r(fx, fy - 2, 4, 1, OC.s1);
  } else {
    P.r(fx - 3, fy - 1, 7, 2, OC.s2);
    P.r(fx - 3, fy - 1, 7, 1, OC.s1);
    P.p(fx + 3, fy, OC.s3);
  }
}

/** Le `drawArm` de la maquette. */
function oracleDrawArm(P: Pen, sx: number, sy: number, fx: number, fy: number, up: number, rear: boolean): void {
  const { e: el, f } = oracleIk(sx, sy, fx, fy, 7.5, 8.5, (a, b) => {
    const [lo, hi] = a[1] > b[1] ? [a, b] : [b, a];
    return [lo[0] + (hi[0] - lo[0]) * up, lo[1] + (hi[1] - lo[1]) * up];
  });
  const ex = Math.round(el[0]);
  const ey = Math.round(el[1]);
  fx = Math.round(f[0]);
  fy = Math.round(f[1]);
  const s = 3;
  const core = rear ? OC.s3 : OC.s2;
  const fore = rear ? OC.s2 : OC.s1;
  const hi = rear ? OC.s1 : OC.s0;
  const lo = rear ? OC.s4 : OC.s3;
  oracleStroke(P, sx, sy, ex, ey, 2.5, OC.ink);
  oracleStroke(P, ex, ey, fx, fy, 2.5, OC.ink);
  P.r(fx - s, fy - s + 1, s * 2 + 1, s * 2 - 1, OC.ink);
  P.r(fx - s + 1, fy - s, s * 2 - 1, s * 2 + 1, OC.ink);
  P.disc(sx + 0.5, sy + 0.5, 3.5, OC.ink);
  oracleStroke(P, sx, sy, ex, ey, 1.5, core);
  oracleEdges(P, sx, sy, ex, ey, fore, lo);
  oracleStroke(P, ex, ey, fx, fy, 1.5, fore);
  oracleEdges(P, ex, ey, fx, fy, hi, lo);
  P.disc(ex + 0.5, ey + 0.5, 1.5, lo);
  P.p(ex, ey, hi);
  const mx = Math.round(ex + (fx - ex) * 0.55);
  const my = Math.round(ey + (fy - ey) * 0.55);
  P.disc(mx + 0.5, my + 0.5, 1.5, lo);
  P.p(mx, my - 1, core);
  P.r(fx - s + 1, fy - s + 1, s * 2 - 1, s * 2 - 1, fore);
  P.r(fx - s + 2, fy - s + 1, s * 2 - 3, 1, hi);
  P.r(fx - s + 1, fy - s + 2, 1, s * 2 - 3, hi);
  P.r(fx + s - 1, fy - s + 1, 1, s * 2 - 1, lo);
  for (let j = -s + 2; j < s; j += 2) P.p(fx + s - 2, fy + j, lo);
  P.r(fx - s + 1, fy + s - 2, 3, 1, lo);
  P.disc(sx + 0.5, sy + 0.5, 2.5, rear ? OC.s3 : OC.s2);
  P.disc(sx, sy, 1.5, rear ? OC.s2 : OC.s1);
  P.p(sx, sy, hi);
}

// =====================================================================================
// Le faux crayon et la comparaison
// =====================================================================================
type Op = 'r' | 'p' | 'line' | 'ell' | 'disc';

interface Call {
  op: Op;
  args: readonly (number | string)[];
}

/** Un crayon qui note chaque appel, dans l'ordre. */
function recorder(): { P: Pen; calls: Call[] } {
  const calls: Call[] = [];
  const add = (op: Op, args: readonly (number | string)[]): void => {
    calls.push({ op, args });
  };
  const P: Pen = {
    r: (a, b, w, h, col) => add('r', [a, b, w, h, col]),
    p: (a, b, col) => add('p', [a, b, col]),
    line: (x0, y0, x1, y1, col, th = 1) => add('line', [x0, y0, x1, y1, col, th]),
    ell: (cx, cy, rx, ry, col) => add('ell', [cx, cy, rx, ry, col]),
    disc: (cx, cy, rad, col) => add('disc', [cx, cy, rad, col]),
  };
  return { P, calls };
}

/** Des positions déterministes variées, dont des cibles hors de portée et confondues. */
function positions(count: number): LimbPoint[] {
  const fixed: LimbPoint[] = [
    [0, 0],
    [20, 20],
    [-30, 12],
    [5, 5],
    [10, -40],
  ];
  const r = rng(0x51b0d1);
  const out: LimbPoint[] = [];
  for (let i = 0; i < count; i++) {
    if (i < fixed.length) {
      out.push(fixed[i]);
    } else {
      out.push([-12 + r() * 64, -12 + r() * 52]);
    }
  }
  return out;
}

describe('drawLeg contre l’oracle', () => {
  it('200 positions, pied à plat et sur la pointe, avant et arrière', () => {
    const r = rng(0x1e6);
    for (const [hx, hy] of positions(200)) {
      const fx = hx + (r() - 0.5) * 34;
      const fy = hy + (r() - 0.5) * 34;
      for (const toe of [false, true]) {
        for (const rear of [false, true]) {
          const mine = recorder();
          const reference = recorder();
          drawLeg(mine.P, hx, hy, fx, fy, toe, rear);
          oracleDrawLeg(reference.P, hx, hy, fx, fy, toe, rear);
          expect(mine.calls.length).toBeGreaterThan(0);
          expect(mine.calls).toEqual(reference.calls);
        }
      }
    }
  });
});

describe('drawArm contre l’oracle', () => {
  it('200 positions, avant et arrière, up de 0 à 1', () => {
    const r = rng(0x2a4);
    const ups = [0, 0.25, 0.5, 0.75, 1];
    const points = positions(200);
    points.forEach(([sx, sy], i) => {
      const fx = sx + (r() - 0.5) * 40;
      const fy = sy + (r() - 0.5) * 40;
      const up = ups[i % ups.length];
      for (const rear of [false, true]) {
        const mine = recorder();
        const reference = recorder();
        drawArm(mine.P, sx, sy, fx, fy, up, rear);
        oracleDrawArm(reference.P, sx, sy, fx, fy, up, rear);
        expect(mine.calls.length).toBeGreaterThan(0);
        expect(mine.calls).toEqual(reference.calls);
      }
    });
  });
});

describe('lensForColor', () => {
  it('l’orange du premier joueur donne la lentille de la maquette, quelle que soit la casse', () => {
    for (const color of ['#F08A24', '#f08a24', '#F08a24', '#f08A24']) {
      expect(lensForColor(color)).toBe(LENS_ORANGE);
    }
  });

  it('une autre couleur garde son ton et reçoit deux tons dérivés', () => {
    const color = '#3FD0FF';
    const lens = lensForColor(color);
    expect(lens.mid).toBe(color);
    expect(lens.deep).toMatch(/^#[0-9a-f]{6}$/);
    expect(lens.glint).toMatch(/^#[0-9a-f]{6}$/);
    expect(lens.deep).not.toBe(lens.glint);
    expect(lens.deep).not.toBe(lens.mid);
    expect(lens.glint).not.toBe(lens.mid);
  });

  it('une couleur invalide retombe sur la lentille orange, sans exception', () => {
    for (const color of ['', 'orange', '#fff', '#12345', '#gggggg', 'rgb(1,2,3)']) {
      expect(lensForColor(color)).toBe(LENS_ORANGE);
    }
  });

  it('le même objet revient au second appel', () => {
    const first = lensForColor('#B9F24A');
    const second = lensForColor('#B9F24A');
    expect(second).toBe(first);
  });
});

describe('solveLimb', () => {
  it('cible trop loin : l’extrémité se pose à portée, les segments gardent leur longueur', () => {
    const solution = solveLimb(10, 10, 100, 100, 4.5, 4.5, (a) => a);
    expect(Math.hypot(solution.e[0] - 10, solution.e[1] - 10)).toBeCloseTo(4.5, 9);
    expect(Math.hypot(solution.f[0] - solution.e[0], solution.f[1] - solution.e[1])).toBeCloseTo(4.5, 9);
    expect(Math.hypot(solution.f[0] - 10, solution.f[1] - 10)).toBeCloseTo(9 - 0.3, 9);
  });

  it('cible confondue avec la racine : aucun NaN', () => {
    const solution = solveLimb(5, 5, 5, 5, 7.5, 8.5, (a) => a);
    for (const v of [solution.e[0], solution.e[1], solution.f[0], solution.f[1]]) {
      expect(Number.isNaN(v)).toBe(false);
      expect(Number.isFinite(v)).toBe(true);
    }
    expect(solution.f).toEqual([5, 5]);
    expect(Math.hypot(solution.e[0] - 5, solution.e[1] - 5)).toBeCloseTo(7.5, 9);
  });

  it('cible à portée : les deux segments gardent leur longueur', () => {
    const solution = solveLimb(0, 0, 5, 0, 4.5, 4.5, (a) => a);
    expect(Math.hypot(solution.e[0], solution.e[1])).toBeCloseTo(4.5, 9);
    expect(Math.hypot(solution.f[0] - solution.e[0], solution.f[1] - solution.e[1])).toBeCloseTo(4.5, 9);
  });
});
