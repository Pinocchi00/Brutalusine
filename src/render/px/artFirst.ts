/**
 * La Scierie, ère 1 : une scie de long sur un chevalet, sous un auvent de branches.
 * Dessin inventé dans le style de la maquette `docs/maquettes/heure-doree.html`.
 */
import type { Pen } from './pen';
import type { Light } from './sprite';
import { C } from './palette';
import { rng } from './noise';

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
