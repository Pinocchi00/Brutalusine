/**
 * La Scierie, ère 1 : une scie de long sur un chevalet, sous un auvent de branches.
 * Dessin inventé dans le style de la maquette `docs/maquettes/heure-doree.html`.
 */
import type { Pen } from './pen';
import type { Light } from './sprite';
import { C } from './palette';
import { rng } from './noise';
import { logEnds, moss } from './volumes';

/** Ère 1 · un sol de terre battue, quatre poteaux, un rondin sur un chevalet et une scie à deux poignées. */
export function scierieE1(P: Pen, U: number, L: Light[]): void {
  const r = rng(83);

  P.ell(24, U + 33, 23, 14, C.sd2);
  P.ell(24, U + 32, 21, 12, C.sd1);
  P.ell(23, U + 30, 17, 9, C.sd0);
  P.ell(28, U + 35, 14, 7, C.sd1);
  for (let k = 0; k < 26; k++) {
    const a = r() * 6.283;
    const d = 0.55 + r() * 0.45;
    P.p(24 + Math.cos(a) * 22 * d, U + 32 + Math.sin(a) * 13 * d, r() < 0.5 ? C.sd2 : C.e1);
  }

  P.r(5, U - 8, 3, 22, C.e3);
  P.r(5, U - 8, 1, 22, C.e1);
  P.r(7, U - 8, 1, 22, C.e2);
  P.r(40, U - 8, 3, 22, C.e3);
  P.r(40, U - 8, 1, 22, C.e1);
  P.r(42, U - 8, 1, 22, C.e2);
  P.r(3, U - 6, 3, 50, C.e3);
  P.r(3, U - 6, 1, 50, C.e1);
  P.r(5, U - 6, 1, 50, C.e2);
  P.r(42, U - 6, 3, 50, C.e3);
  P.r(42, U - 6, 1, 50, C.e1);
  P.r(44, U - 6, 1, 50, C.e2);

  P.line(1, U - 2, 46, U - 8, C.e3, 2);
  P.line(2, U - 10, 44, U - 2, C.e2, 2);
  P.line(4, U - 7, 20, U + 2, C.e3);
  P.line(44, U - 7, 28, U + 2, C.e3);
  const leaves: [number, number, number][] = [
    [6, U - 8, 6], [15, U - 11, 5], [25, U - 10, 6], [36, U - 9, 5], [44, U - 7, 4],
    [10, U - 3, 5], [20, U - 5, 6], [31, U - 4, 5], [41, U - 2, 4],
    [14, U + 1, 4], [27, U, 4], [38, U - 1, 3],
  ];
  for (const [x, y, rad] of leaves) {
    P.ell(x, y, rad, Math.max(2, rad - 2), C.g3);
    P.ell(x - 1, y - 1, Math.max(2, rad - 3), Math.max(1, rad - 3), C.g2);
    P.p(x - 2, y - 2, C.g1);
  }
  moss(P, 2, U - 12, 44, 16, 31, 18);

  const beam = U + 34;
  P.line(15, beam, 11, U + 45, C.e3, 2);
  P.line(15, beam, 21, U + 45, C.e3, 2);
  P.line(33, beam, 27, U + 45, C.e3, 2);
  P.line(33, beam, 37, U + 45, C.e3, 2);
  P.line(14, beam, 34, beam, C.e3, 2);
  P.r(14, beam - 1, 21, 1, C.e1);

  P.disc(7, U + 29, 5, C.e3);
  P.disc(40, U + 29, 5, C.e3);
  P.r(7, U + 24, 34, 10, C.e3);
  P.r(7, U + 24, 34, 2, C.e2);
  P.r(7, U + 24, 1, 10, C.e2);
  P.r(7, U + 32, 34, 2, C.e4);
  for (const [x, y, len] of [[12, U + 27, 4], [18, U + 30, 3], [30, U + 27, 5], [35, U + 30, 3]]) {
    P.r(x, y, 1, len, C.e4);
  }
  logEnds(P, [[7, U + 29], [40, U + 29]]);

  P.r(22, U + 24, 5, 10, C.e4);
  P.r(23, U + 12, 4, 28, C.s1);
  P.r(23, U + 12, 1, 28, C.s0);
  P.r(26, U + 12, 1, 28, C.s3);
  for (let y = U + 15; y < U + 39; y += 2) P.p(22, y, C.s1);
  P.r(19, U + 8, 12, 4, C.e3);
  P.r(19, U + 8, 12, 1, C.e1);
  P.r(19, U + 11, 12, 1, C.e4);
  P.r(24, U + 12, 2, 1, C.e2);
  P.r(19, U + 39, 12, 4, C.e3);
  P.r(19, U + 39, 12, 1, C.e1);
  P.r(19, U + 42, 12, 1, C.e4);

  P.r(5, U + 43, 9, 3, C.e2);
  P.r(5, U + 43, 9, 1, C.e1);
  P.r(5, U + 45, 9, 1, C.e3);
  P.r(33, U + 44, 9, 3, C.e2);
  P.r(33, U + 44, 9, 1, C.e1);
  P.r(33, U + 46, 9, 1, C.e3);
  logEnds(P, [[14, U + 44], [41, U + 45]]);

  P.ell(24, U + 44, 7, 2, C.sd0);
  for (let k = 0; k < 10; k++) P.p(18 + Math.floor(r() * 12), U + 43 + Math.floor(r() * 4), C.sd0);
}
