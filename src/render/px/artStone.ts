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
  courses(P, 31, 2, 12, U + 2, 41, STONE_F);
  P.r(31, 2, 2, U + 2, C.st1);
  P.r(40, 2, 3, U + 2, C.st3);
  P.r(29, 0, 16, 3, C.st3);
  P.r(29, 0, 16, 1, C.st1);
  P.r(31, 2, 12, 2, C.ink2);
  P.r(32, 1, 10, 1, C.st4);

  box(P, 3, U - 4, 42, 20, 24, STONE, false);
  courses(P, 4, U - 3, 40, 18, 5);
  courses(P, 3, U + 16, 42, 24, 12, STONE_F);
  P.r(3, U - 4, 42, 1, C.st0);
  P.r(3, U - 4, 1, 20, C.st0);
  P.r(44, U - 3, 1, 19, C.st3);
  P.r(3, U + 15, 42, 1, C.st3);
  for (const y of [U + 16, U + 24, U + 32]) {
    P.r(3, y, 2, 3, C.st0);
    P.r(43, y, 2, 3, C.st2);
  }

  P.ell(24, U + 29, 12, 11, C.st3);
  P.ell(24, U + 29, 11, 10, C.st0);
  P.r(13, U + 30, 23, 10, C.st0);
  P.ell(24, U + 30, 10, 10, C.ink2);
  P.r(14, U + 30, 21, 10, C.ink2);
  P.r(12, U + 30, 2, 10, C.st1);
  P.r(35, U + 30, 2, 10, C.st1);

  P.r(16, U + 30, 17, 10, C.o4);
  P.r(17, U + 32, 15, 8, C.o3);
  P.r(19, U + 34, 11, 6, C.o2);
  P.r(21, U + 36, 7, 4, C.o1);
  L.push({ k: 'fire', x: 18, y: U + 35, w: 12 });

  moss(P, 5, U + 36, 38, 4, 17, 14);
  moss(P, 6, U - 2, 38, 4, 23, 10);
  moss(P, 31, 6, 11, 26, 29, 6);

  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < 3; i++) {
      const x = 4 + i * 6 + row * 1;
      const y = U + 41 + row * 3;
      P.r(x, y, 4, 3, C.o3);
      P.r(x, y, 4, 1, C.o2);
      P.r(x, y + 2, 4, 1, C.o4);
      P.p(x + 3, y + 1, C.o4);
    }
  }
}
