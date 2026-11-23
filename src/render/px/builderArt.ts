/**
 * Le dessin du bâtisseur boxeur, porté au pixel près depuis la maquette `docs/maquettes/heure-doree.html`.
 * La coque se tourne et se tasse, les jambes plient, les bras d'acier frappent, les antennes suivent avec retard.
 */
import { C } from './palette';
import { edges, pen, stroke, type Pen } from './pen';
import { finish } from './finish';
import { makeSurface } from './surface';
import type { BuilderFrame } from './builderTypes';

/** Les trois tons de la lentille : sombre, moyen, reflet. */
export interface LensColors {
  readonly deep: string;
  readonly mid: string;
  readonly glint: string;
}

/** La lentille orange de la maquette. */
export const LENS_ORANGE: LensColors = { deep: C.o3, mid: C.o2, glint: C.o0 };

/** Un point en pixels. */
export type LimbPoint = readonly [number, number];

/** Le résultat d'un membre à deux segments : l'articulation et l'extrémité atteinte. */
export interface LimbSolution {
  /** L'articulation (genou ou coude). */
  readonly e: LimbPoint;
  /** L'extrémité effectivement atteinte. */
  readonly f: LimbPoint;
}

/** L'échelle de la coque, comme le `BS` de la maquette. */
const BODY_SCALE = 1.12;

/** Met une longueur à l'échelle de la coque. */
function bq(v: number): number {
  return v * BODY_SCALE;
}

/** Résout les deux segments d'un membre (le `ik` de la maquette). */
export function solveLimb(
  sx: number,
  sy: number,
  fx: number,
  fy: number,
  a: number,
  b: number,
  pick: (first: LimbPoint, second: LimbPoint) => LimbPoint,
): LimbSolution {
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

/** Dessine une jambe (le `drawLeg` de la maquette). */
export function drawLeg(P: Pen, hx: number, hy: number, fx: number, fy: number, toe: boolean, rear: boolean): void {
  const { e: [kx, ky] } = solveLimb(hx, hy, fx, fy - 1, 4.5, 4.5, (a, b) => (a[0] > b[0] ? a : b));
  const core = rear ? C.s3 : C.s2;
  const hi = rear ? C.s2 : C.s1;
  stroke(P, hx, hy, kx, ky, 2.5, C.ink);
  stroke(P, kx, ky, fx, fy - 1, 2.5, C.ink);
  if (toe) {
    P.r(fx - 1, fy - 3, 6, 4, C.ink);
  } else {
    P.r(fx - 4, fy - 2, 9, 4, C.ink);
  }
  stroke(P, hx, hy, kx, ky, 1.5, C.s3);
  stroke(P, kx, ky, fx, fy - 1, 1.5, core);
  P.p(Math.round(kx) - 1, Math.round(ky) - 1, hi);
  if (toe) {
    P.r(fx, fy - 2, 4, 2, C.s2);
    P.r(fx, fy - 2, 4, 1, C.s1);
  } else {
    P.r(fx - 3, fy - 1, 7, 2, C.s2);
    P.r(fx - 3, fy - 1, 7, 1, C.s1);
    P.p(fx + 3, fy, C.s3);
  }
}

/** Dessine un bras (le `drawArm` de la maquette). */
export function drawArm(P: Pen, sx: number, sy: number, fx: number, fy: number, up: number, rear: boolean): void {
  const { e: el, f } = solveLimb(sx, sy, fx, fy, 7.5, 8.5, (a, b) => {
    const [lo, hi] = a[1] > b[1] ? [a, b] : [b, a];
    return [lo[0] + (hi[0] - lo[0]) * up, lo[1] + (hi[1] - lo[1]) * up];
  });
  const ex = Math.round(el[0]);
  const ey = Math.round(el[1]);
  fx = Math.round(f[0]);
  fy = Math.round(f[1]);
  const s = 3;
  const core = rear ? C.s3 : C.s2;
  const fore = rear ? C.s2 : C.s1;
  const hi = rear ? C.s1 : C.s0;
  const lo = rear ? C.s4 : C.s3;
  stroke(P, sx, sy, ex, ey, 2.5, C.ink);
  stroke(P, ex, ey, fx, fy, 2.5, C.ink);
  P.r(fx - s, fy - s + 1, s * 2 + 1, s * 2 - 1, C.ink);
  P.r(fx - s + 1, fy - s, s * 2 - 1, s * 2 + 1, C.ink);
  P.disc(sx + 0.5, sy + 0.5, 3.5, C.ink);
  stroke(P, sx, sy, ex, ey, 1.5, core);
  edges(P, sx, sy, ex, ey, fore, lo);
  stroke(P, ex, ey, fx, fy, 1.5, fore);
  edges(P, ex, ey, fx, fy, hi, lo);
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
  P.disc(sx + 0.5, sy + 0.5, 2.5, rear ? C.s3 : C.s2);
  P.disc(sx, sy, 1.5, rear ? C.s2 : C.s1);
  P.p(sx, sy, hi);
}

/** Peint la coque une fois, sur une surface de 40×40 pixels, puis la finit. */
function paintTorso(tw: number, sq: number, lens: LensColors): HTMLCanvasElement {
  const { canvas, ctx } = makeSurface(40, 40);
  const P = pen(ctx);
  const cx = bq(14);
  const cy = bq(20) + sq;
  const rx = bq(9) + sq * 0.6;
  const ry = bq(9.5) - sq;
  P.ell(cx, cy, rx, ry, C.c4);
  P.ell(cx - 0.4, cy - 0.4, rx - 0.8, ry - 0.8, C.c1);
  P.ell(bq(12) - tw * 0.6, cy - bq(2.5), bq(4.5), bq(4.4), C.c0);
  P.p(bq(10.5) - tw * 0.6, cy - bq(4.5), C.white);
  P.r(cx - rx + 3 + tw, cy + bq(4) - sq * 0.4, rx * 1.5, 1, C.c3);
  for (const k of [0, 1, 2, 3]) {
    P.p(bq(8 + k * 4) + tw, cy + bq(5.5) - sq * 0.4, C.s2);
  }
  P.r(bq(10) + tw * 0.5, cy - bq(8.4) + sq * 0.3, bq(8), 2, C.c3);
  P.r(bq(11) + tw * 0.5, cy - bq(9) + sq * 0.3, bq(6), 1, C.s2);
  const vl = bq(13) + tw;
  const vr = bq(22) + Math.min(0, tw) + Math.max(0, tw) * 0.5;
  P.r(vl, cy - bq(3.5), vr - vl, bq(5), C.ink);
  P.r(vl + 0.6, cy - bq(3), vr - vl - 1.2, bq(4), C.ink2);
  const lx = bq(18) + tw * 0.9;
  const ly = cy - bq(1);
  P.disc(lx, ly, bq(2.3), lens.deep);
  P.disc(lx + 0.2, ly, bq(1.5), lens.mid);
  P.p(lx + 0.4, ly - 0.4, lens.glint);
  P.p(vl + 2, cy - bq(2.4), C.s3);
  return finish(canvas);
}

const TORSO_CACHE = new Map<string, HTMLCanvasElement>();

/** La coque déjà finie, en cache, pour une rotation (-1..2), un tassement (-1..1) et une lentille. */
export function torsoImage(tw: number, sq: number, lens: LensColors = LENS_ORANGE): HTMLCanvasElement {
  const rotation = Math.max(-1, Math.min(2, Math.round(tw)));
  const squash = Math.max(-1, Math.min(1, Math.round(sq)));
  const key = `${lens.deep}|${lens.mid}|${lens.glint}|${rotation}|${squash}`;
  const cached = TORSO_CACHE.get(key);
  if (cached) {
    return cached;
  }
  const image = paintTorso(rotation, squash, lens);
  TORSO_CACHE.set(key, image);
  return image;
}

/** Dessine le bâtisseur, `x` et `y` étant le coin de référence (le `BUILDER` de la maquette). */
export function drawBuilderFrame(
  ctx: CanvasRenderingContext2D,
  P: Pen,
  x: number,
  y: number,
  frame: BuilderFrame,
  lens: LensColors = LENS_ORANGE,
): void {
  const ps = frame.pose;
  const tx = Math.round(ps.tx);
  const ty = Math.round(ps.ty);
  const tw = Math.max(-1, Math.min(2, Math.round(ps.tw)));
  const sq = Math.max(-1, Math.min(1, Math.round(ps.sq)));
  const back = frame.lagged;
  const lagX = Math.max(-2, Math.min(2, Math.round(back.tx - ps.tx)));
  const lagY = Math.max(-2, Math.min(2, Math.round(back.ty - ps.ty)));
  const flash = frame.flash;
  P.ell(x + 17 + Math.round(tx / 2), y + 38, 12, 3, C.shade);
  drawLeg(P, x + 12 + tx, y + 30 + ty, x + 9 + Math.round(ps.feet?.rearX ?? 0), y + 37 + Math.round(ps.feet?.rearY ?? 0), ps.tw > 1.2, true);
  drawLeg(P, x + 19 + tx, y + 31 + ty, x + 24 + Math.round(ps.feet?.frontX ?? 0), y + 37 + Math.round(ps.feet?.frontY ?? 0), false, false);
  const smear = (f: LimbPoint, g: LimbPoint): void => {
    const d = Math.hypot(f[0] - g[0], f[1] - g[1]);
    if (d > 4) {
      P.line(x + g[0], y + g[1], x + f[0], y + f[1], 'rgba(255,243,220,0.35)', 2);
    }
  };
  const prev = frame.previous;
  smear(ps.R, prev.R);
  drawArm(P, x + 17 + tx + Math.round(ps.tw * 1.2), y + 21 + ty + sq, x + ps.R[0], y + ps.R[1], 0, true);
  for (const [x0, y0, x1, y1] of [[10, 13, 6, 5], [15, 12, 17, 3]]) {
    const ax = x + Math.round(bq(x0)) + tx;
    const ay = y + Math.round(bq(y0)) + ty + sq;
    const bx = x + Math.round(bq(x1)) + tx + lagX;
    const by = y + Math.round(bq(y1)) + ty + lagY + sq;
    P.line(ax - 1, ay - 1, bx - 1, by - 1, C.ink, 3);
    P.line(ax, ay, bx, by, C.s2);
    P.r(bx - 2, by - 2, 5, 5, C.ink);
    P.r(bx - 1, by - 1, 3, 3, flash ? C.o1 : C.o3);
    P.p(bx, by, flash ? C.white : C.o0);
  }
  ctx.drawImage(torsoImage(tw, sq, lens), x + tx, y + ty);
  smear(ps.L, prev.L);
  drawArm(P, x + 22 + tx + Math.round(ps.tw * 0.4), y + 27 + ty + sq, x + ps.L[0], y + ps.L[1], ps.up, false);
}
