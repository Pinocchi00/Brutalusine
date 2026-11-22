/**
 * Le Four, ère 2 : un four carré de pierres taillées, une gueule rouge et une haute cheminée.
 * Dessin inventé dans le style de la maquette `docs/maquettes/heure-doree.html`.
 */
import type { Pen } from './pen';
import type { Light } from './sprite';
import { C, STONE, STONE_F } from './palette';
import { box, courses, moss } from './volumes';

/** Ère 2 · un corps de pierre, une gueule voûtée avec son feu, une cheminée au nord-est, des briques devant. */
export function fourE2(P: Pen, U: number, L: Light[]): void {
  courses(P, 30, 2, 11, U - 6, 41, STONE_F);
  P.r(30, 2, 1, U - 6, C.st0);
  P.r(40, 2, 1, U - 6, C.st4);
  P.r(28, 0, 15, 3, C.st3);
  P.r(28, 0, 15, 1, C.st1);
  P.r(30, 2, 11, 2, C.ink2);
  P.r(31, 1, 9, 1, C.st4);

  box(P, 6, U - 10, 36, 18, 28, STONE, false);
  courses(P, 7, U - 9, 34, 16, 5);
  courses(P, 6, U + 8, 36, 28, 12, STONE_F);
  P.r(6, U - 10, 36, 1, C.st0);
  P.r(6, U - 10, 1, 18, C.st0);
  P.r(41, U - 9, 1, 17, C.st3);
  P.r(6, U + 7, 36, 1, C.st3);
  for (const y of [U + 8, U + 16, U + 24]) {
    P.r(6, y, 2, 3, C.st0);
    P.r(40, y, 2, 3, C.st2);
  }

  P.ell(24, U + 22, 9, 8, C.st3);
  P.ell(24, U + 22, 8, 7, C.st0);
  P.r(16, U + 22, 17, 14, C.st0);
  P.ell(24, U + 22, 6, 5, C.ink2);
  P.r(18, U + 22, 13, 14, C.ink2);
  P.r(16, U + 34, 3, 2, C.st1);
  P.r(29, U + 34, 3, 2, C.st1);

  P.r(20, U + 31, 9, 4, C.o4);
  P.r(21, U + 31, 7, 4, C.o3);
  P.r(22, U + 32, 5, 3, C.o2);
  P.r(23, U + 33, 3, 2, C.o1);
  L.push({ k: 'fire', x: 22, y: U + 31, w: 8 });

  moss(P, 7, U + 31, 34, 5, 17, 16);
  moss(P, 8, U - 8, 30, 4, 23, 10);
  moss(P, 30, 4, 10, 28, 29, 8);

  for (let row = 0; row < 3; row++) {
    const n = row === 2 ? 2 : 3;
    for (let i = 0; i < n; i++) {
      const x = 4 + i * 6 + (row % 2) * 2;
      const y = U + 39 + row * 3;
      P.r(x, y, 5, 3, C.o3);
      P.r(x, y, 5, 1, C.o2);
      P.r(x, y + 2, 5, 1, C.o4);
      P.p(x + 4, y + 1, C.o4);
    }
  }
  P.r(21, U + 43, 4, 2, C.o3);
  P.r(21, U + 43, 4, 1, C.o2);
  P.p(24, U + 44, C.o4);
}
