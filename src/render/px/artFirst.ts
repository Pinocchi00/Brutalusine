/**
 * La Scierie, ère 1 : une scie de long sur un chevalet, sous un auvent de branches.
 * Dessin inventé dans le style de la maquette `docs/maquettes/heure-doree.html`.
 */
import type { Pen } from './pen';
import type { Light } from './sprite';
import { C, M } from './palette';
import { rng } from './noise';
import { box, logEnds, moss } from './volumes';

/** Ère 1 · un chevalet de bois, un tronc, une longue lame, quatre poteaux et un auvent de branches. */
export function scierieE1(P: Pen, U: number, L: Light[]): void {
  const r = rng(83);

  P.ell(24, U + 43, 17, 4, C.sd1);
  P.ell(24, U + 42, 14, 3, C.sd0);
  for (let k = 0; k < 20; k++) {
    const x = 9 + Math.floor(r() * 30);
    const y = U + 39 + Math.floor(r() * 6);
    P.p(x, y, r() < 0.7 ? C.sd0 : C.sd2);
  }

  P.r(6, U - 2, 2, 20, C.e3);
  P.r(6, U - 2, 1, 20, C.e1);
  P.r(40, U - 2, 2, 20, C.e3);
  P.r(40, U - 2, 1, 20, C.e2);
  P.r(3, U + 4, 2, 38, C.e3);
  P.r(3, U + 4, 1, 38, C.e1);
  P.r(43, U + 4, 2, 38, C.e3);
  P.r(43, U + 4, 1, 38, C.e2);

  P.line(1, U + 6, 46, U - 4, C.e3, 2);
  P.line(2, U + 2, 44, U + 10, C.e2, 2);
  P.line(2, U - 6, 20, U + 6, C.e3);
  P.line(46, U - 6, 28, U + 6, C.e3);
  const leaves: [number, number, number][] = [
    [6, U - 6, 6], [16, U - 8, 5], [27, U - 7, 6], [38, U - 6, 5],
    [10, U - 1, 5], [21, U + 1, 6], [33, U, 5], [43, U - 1, 4],
    [15, U + 7, 4], [30, U + 8, 4], [42, U + 7, 3],
  ];
  for (const [x, y, rad] of leaves) {
    P.ell(x, y, rad, Math.max(2, rad - 2), C.g3);
    P.ell(x - 1, y - 1, Math.max(2, rad - 3), Math.max(1, rad - 3), C.g2);
    P.p(x - 2, y - 2, C.g1);
  }
  moss(P, 2, U - 8, 44, 18, 31, 16);

  const beam = U + 27;
  P.line(15, beam, 10, U + 42, C.e3, 2);
  P.line(15, beam, 20, U + 42, C.e3, 2);
  P.line(33, beam, 28, U + 42, C.e3, 2);
  P.line(33, beam, 38, U + 42, C.e3, 2);
  P.line(13, beam, 35, beam, C.e3, 2);
  P.r(13, beam - 1, 23, 1, C.e1);
  for (const x of [10, 20, 28, 38]) P.r(x - 1, U + 41, 2, 2, C.e2);

  P.r(8, U + 20, 32, 8, C.e2);
  P.r(8, U + 20, 32, 2, C.e1);
  P.r(8, U + 26, 32, 2, C.e3);
  for (const [x, y] of [[12, U + 24], [17, U + 23], [31, U + 24], [36, U + 23]]) {
    P.p(x, y, C.e3);
    P.p(x + 1, y, C.e2);
  }
  P.r(22, U + 19, 5, 3, C.e4);

  P.r(22, U + 4, 4, 17, C.s1);
  P.r(22, U + 4, 1, 17, C.s0);
  P.r(25, U + 4, 1, 17, C.s2);
  for (let y = U + 7; y < U + 21; y += 2) P.p(21, y, C.s1);
  P.r(20, U + 1, 8, 3, C.e3);
  P.r(20, U + 1, 8, 1, C.e1);
  P.r(19, U + 3, 2, 3, C.e3);
  P.r(27, U + 3, 2, 3, C.e3);

  box(P, 4, U + 40, 14, 4, 2, M.wood, false);
  P.r(4, U + 40, 14, 1, C.e1);
  box(P, 28, U + 41, 14, 4, 2, M.wood, false);
  box(P, 8, U + 36, 10, 3, 2, M.wood, false);
  logEnds(P, [[18, U + 42], [42, U + 43], [18, U + 38]]);
}
