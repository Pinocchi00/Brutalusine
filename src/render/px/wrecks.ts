/**
 * Les épaves d'anciennes capsules : une coque à moitié enterrée, de la tôle rouillée,
 * du béton fendu, de la mousse, et une lueur orange tant qu'elles gardent des noyaux.
 */
import type { Wreck } from '../../sim/wrecks';
import { C, M } from './palette';
import { rng } from './noise';
import type { Pen } from './pen';
import { build, type Light, type Sprite } from './sprite';
import { box, courses, moss } from './volumes';
import { TILE_PX } from './view';

/** La hauteur de l'épave au-dessus de son emprise. */
export const WRECK_UP = 14;

/** Une épave garde une lueur tant qu'elle n'a pas été fouillée et qu'il lui reste des noyaux. */
export function wreckLit(w: Pick<Wreck, 'searched' | 'cores'>): boolean {
  return !w.searched && w.cores > 0;
}

/** L'épave touche-t-elle la fenêtre visible, avec une marge ? */
export function wreckVisible(x: number, y: number, x0: number, y0: number, x1: number, y1: number): boolean {
  return x + 2 > x0 && x < x1 && y + 2 > y0 && y < y1;
}

/** Dessine la coque commune ; `open` ouvre la trappe et éteint la lueur. */
function hull(P: Pen, U: number, L: Light[], open: boolean): void {
  const r = rng(open ? 941 : 940);

  // le sol remué autour de l'épave
  P.ell(24, U + 38, 23, 9, C.sd3);
  P.ell(24, U + 37, 20, 7, C.sd2);
  for (let k = 0; k < 40; k++) {
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r());
    P.p(24 + Math.cos(a) * 21 * d, U + 37 + Math.sin(a) * 8 * d, r() < 0.5 ? C.sd3 : C.e4);
  }

  // la dalle de béton fendue, à moitié enfoncée
  box(P, 5, U + 28, 38, 12, 4, M.concD, false);
  courses(P, 5, U + 40, 38, 4, 3, [C.st0, C.st1, C.st2, C.st3, C.st4]);
  P.r(5, U + 28, 38, 1, C.c1);
  P.r(5, U + 28, 1, 12, C.c1);
  P.line(15, U + 29, 19, U + 34, C.ink2);
  P.line(19, U + 34, 17, U + 40, C.ink2);
  P.line(31, U + 30, 28, U + 36, C.ink2);

  // la coque, inclinée vers le nord-est
  P.ell(23, U + 20, 17, 12, C.s4);
  P.ell(23, U + 19, 15, 10, C.s3);
  P.ell(22, U + 16, 12, 7, C.s2);
  P.ell(21, U + 13, 9, 4, C.s1);
  P.r(9, U + 14, 30, 10, C.s3);
  P.r(9, U + 14, 30, 1, C.s2);
  P.r(9, U + 23, 30, 1, C.ink2);
  // la tôle rouillée et ses rivets
  for (let i = 11; i < 38; i += 5) {
    P.r(i, U + 16, 3, 1, C.ir2);
    P.p(i + 1, U + 18, C.ir1);
  }
  for (const [x, y] of [[12, U + 15], [20, U + 15], [30, U + 15], [36, U + 16]]) {
    P.p(x, y, C.s0);
    P.p(x + 1, y, C.s3);
  }
  P.line(13, U + 20, 20, U + 17, C.ir3);
  P.line(27, U + 21, 35, U + 18, C.ir3);

  // le hublot et la trappe
  if (open) {
    P.ell(27, U + 19, 6, 5, C.ink);
    P.ell(27, U + 19, 4, 3, C.ink2);
    P.r(23, U + 15, 8, 2, C.s2);
    P.r(23, U + 15, 8, 1, C.s1);
  } else {
    P.ell(27, U + 18, 5, 4, C.ink2);
    P.ell(27, U + 18, 3, 2, C.s3);
    P.p(26, U + 17, C.s1);
  }

  // une antenne tordue et un morceau de capsule arraché
  P.line(36, U + 14, 42, U + 4, C.s3, 2);
  P.line(36, U + 14, 42, U + 4, C.s2);
  P.p(42, U + 3, C.o3);
  P.r(39, U + 30, 7, 3, C.s3);
  P.r(39, U + 30, 7, 1, C.s2);

  // la mousse et les herbes folles
  moss(P, 4, U + 31, 40, 8, 951, 22);
  moss(P, 8, U + 12, 32, 6, 952, 12);
  for (const [x, y] of [[7, U + 42], [37, U + 41], [17, U + 44], [29, U + 45]]) {
    P.line(x, y, x - 1, y - 5, C.m3);
    P.p(x - 2, y - 5, C.m2);
    P.p(x, y - 4, C.m4);
  }

  if (!open) L.push({ k: 'glow', x: 27, y: U + 18, r: 3, per: 7 });
}

const sprites: Record<'open' | 'closed', Sprite | undefined> = { open: undefined, closed: undefined };

/** Le sprite d'une épave selon son état, dessiné une fois. */
export function wreckSprite(open: boolean): Sprite {
  const kind = open ? 'open' : 'closed';
  const cached = sprites[kind];
  if (cached) return cached;
  const sprite = build(2 * TILE_PX, 2 * TILE_PX, WRECK_UP, (P, U, L) => hull(P, U, L, open));
  sprites[kind] = sprite;
  return sprite;
}

/** Prépare les deux dessins d'épave au démarrage. */
export function prepareWrecks(): void {
  wreckSprite(false);
  wreckSprite(true);
}
