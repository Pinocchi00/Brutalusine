/**
 * La Scierie, ère 1 : une scie de long sur un chevalet, sous un auvent de branches.
 * Dessin inventé dans le style de la maquette `docs/maquettes/heure-doree.html`.
 */
import type { Pen } from './pen';
import type { Light } from './sprite';
import { C, STONE, STONE_F } from './palette';
import { rng } from './noise';
import { box, courses, logEnds } from './volumes';

/** Ère 1 · un tronc lisible sur deux chevalets en X, une scie verticale, quatre poteaux et un auvent. */
export function scierieE1(P: Pen, U: number, L: Light[]): void {
  const r = rng(83);

  P.r(1, U + 34, 46, 14, C.sd1);
  P.r(1, U + 34, 46, 1, C.sd0);
  P.r(1, U + 36, 46, 1, C.sd2);
  for (let k = 0; k < 30; k++) {
    P.p(2 + Math.floor(r() * 44), U + 35 + Math.floor(r() * 12), r() < 0.6 ? C.sd2 : C.e1);
  }

  P.r(3, U - 12, 3, 56, C.e3);
  P.r(3, U - 12, 1, 56, C.e1);
  P.r(5, U - 12, 1, 56, C.e2);
  P.r(42, U - 12, 3, 56, C.e3);
  P.r(42, U - 12, 1, 56, C.e1);
  P.r(44, U - 12, 1, 56, C.e2);

  P.line(6, U + 22, 18, U + 42, C.e3, 3);
  P.line(5, U + 23, 17, U + 42, C.e2);
  P.line(18, U + 22, 6, U + 42, C.e3, 3);
  P.line(17, U + 23, 5, U + 42, C.e2);
  P.line(30, U + 22, 42, U + 42, C.e3, 3);
  P.line(29, U + 23, 41, U + 42, C.e2);
  P.line(42, U + 22, 30, U + 42, C.e3, 3);
  P.line(41, U + 23, 29, U + 42, C.e2);

  P.r(5, U + 12, 39, 12, C.e2);
  P.r(5, U + 12, 39, 2, C.e1);
  P.r(5, U + 22, 39, 2, C.e4);
  for (const [x, y, len] of [[10, U + 15, 3], [16, U + 18, 2], [28, U + 14, 4], [33, U + 19, 2], [21, U + 20, 2]]) {
    P.r(x, y, 1, len, C.e3);
  }
  P.ell(40, U + 18, 3, 5, C.e3);
  P.ell(40, U + 18, 2, 4, C.e1);
  P.ell(40, U + 18, 1, 2.5, C.e0);
  P.p(40, U + 18, C.e3);

  P.r(23, U - 2, 3, 34, C.s1);
  P.r(23, U - 2, 1, 34, C.s0);
  P.r(25, U - 2, 1, 34, C.s3);
  for (let y = U + 2; y < U + 29; y += 2) P.p(22, y, C.s1);
  P.r(18, U - 3, 12, 3, C.e3);
  P.r(18, U - 3, 12, 1, C.e1);
  P.r(18, U - 1, 12, 1, C.e4);
  P.r(18, U + 29, 12, 3, C.e3);
  P.r(18, U + 29, 12, 1, C.e1);
  P.r(18, U + 31, 12, 1, C.e4);

  P.line(1, U - 6, 46, U - 10, C.e3, 2);
  P.line(2, U - 12, 44, U - 6, C.e2, 2);
  const leaves: [number, number, number][] = [
    [5, U - 10, 5], [15, U - 11, 5], [25, U - 10, 5], [35, U - 11, 5], [44, U - 10, 4],
    [10, U - 7, 4], [20, U - 7, 4], [30, U - 7, 4], [40, U - 8, 4],
  ];
  for (const [x, y, rad] of leaves) {
    P.ell(x, y, rad, Math.max(2, rad - 2), C.g3);
    P.ell(x - 1, y - 1, Math.max(2, rad - 3), Math.max(1, rad - 3), C.g2);
    P.p(x - 2, y - 2, C.g1);
  }

  P.ell(24, U + 40, 7, 2, C.sd0);
  for (let k = 0; k < 10; k++) P.p(18 + Math.floor(r() * 12), U + 39 + Math.floor(r() * 4), C.sd0);

  P.r(4, U + 41, 11, 3, C.e2);
  P.r(4, U + 41, 11, 1, C.e1);
  P.r(4, U + 43, 11, 1, C.e4);
  P.r(7, U + 45, 10, 2, C.e2);
  P.r(7, U + 45, 10, 1, C.e1);
  P.r(7, U + 46, 10, 1, C.e4);
  P.ell(15, U + 42, 2, 2, C.e1);
  P.ell(17, U + 46, 2, 1.5, C.e1);
}

/** Ère 2 · un bâti de pierre à deux montants, une grande lame dentée qui déborde, un tas de sciure. */
export function scierieE2(P: Pen, U: number, L: Light[]): void {
  const r = rng(97);

  // le socle de pierre, large, et son assise en contrebas
  box(P, 1, U + 30, 46, 8, 10, STONE, false);
  courses(P, 1, U + 38, 46, 10, 51, STONE_F);
  P.r(1, U + 30, 46, 1, C.st0);
  P.r(1, U + 30, 1, 8, C.st0);
  P.r(46, U + 31, 1, 7, C.st3);

  // les deux montants et la traverse : le bâti
  box(P, 2, U - 16, 9, 7, 39, STONE, false);
  box(P, 37, U - 16, 9, 7, 39, STONE, false);
  box(P, 1, U - 22, 46, 8, 4, STONE, false);
  courses(P, 2, U - 9, 9, 39, 52, STONE_F);
  courses(P, 37, U - 9, 9, 39, 53, STONE_F);
  courses(P, 1, U - 14, 46, 4, 54, STONE_F);
  P.r(2, U - 16, 9, 1, C.st0);
  P.r(37, U - 16, 9, 1, C.st0);
  P.r(1, U - 22, 46, 1, C.st0);

  // le banc de sciage et son rondin, sous la lame
  P.r(13, U + 26, 22, 4, C.e2);
  P.r(13, U + 26, 22, 1, C.e1);
  P.r(13, U + 29, 22, 1, C.e3);
  logEnds(P, [[15, U + 27], [33, U + 27]]);

  // la lame : dents, disque, moyeu
  const cx = 24, cy = U + 6, R = 14;
  for (let k = 0; k < 28; k++) {
    const a = k / 28 * Math.PI * 2;
    P.line(cx + Math.cos(a) * (R - 1), cy + Math.sin(a) * (R - 1),
      cx + Math.cos(a) * (R + 3), cy + Math.sin(a) * (R + 3), C.s2, 2);
    P.p(cx + Math.cos(a + 0.08) * (R + 2), cy + Math.sin(a + 0.08) * (R + 2), C.s0);
  }
  P.disc(cx, cy, R, C.s2);
  P.disc(cx, cy, R - 1, C.s1);
  P.disc(cx, cy, R - 4, C.s2);
  P.disc(cx, cy, R - 5, C.s1);
  for (let a = -2.5; a < -0.9; a += 0.12) {
    P.p(cx + Math.cos(a) * (R - 2), cy + Math.sin(a) * (R - 2), C.s0);
    P.p(cx + Math.cos(a) * (R - 3), cy + Math.sin(a) * (R - 3), C.s0);
  }
  P.disc(cx, cy, 3, C.s3);
  P.disc(cx, cy, 2, C.s1);
  P.p(cx - 1, cy - 1, C.s0);
  for (const [dx, dy] of [[-5, 0], [5, 0], [0, -5], [0, 5]]) P.p(cx + dx, cy + dy, C.s3);

  // la sciure au sud, en tas clair
  P.ell(24, U + 42, 12, 4, C.sd2);
  P.ell(23, U + 41, 8, 3, C.sd1);
  P.ell(22, U + 40, 4, 2, C.sd0);
  for (let k = 0; k < 22; k++) {
    P.p(6 + Math.floor(r() * 37), U + 40 + Math.floor(r() * 6), r() < 0.6 ? C.sd1 : C.sd0);
  }
}

