/**
 * Le Puits, la Charbonnière et le Stockage, ères 1 et 2 de la maquette.
 * Les traits et l'ordre des tirages sont ceux de la maquette, à l'identique.
 */
import type { Pen } from './pen';
import type { Light } from './sprite';
import { C, M, STONE, STONE_F } from './palette';
import { rng } from './noise';
import { box, courses, crate, cyl, logEnds, moss } from './volumes';

/** Ère 1 · un trou creusé à la main, un trépied de perches, un seau, une échelle. */
export function puitsE1(P: Pen, U: number, L: Light[], chute = true, moving = false): void {
  const r = rng(61);
  P.ell(36, U + 46, 27, 18, C.e3);
  P.ell(36, U + 45, 25, 16, C.e2);
  for (let k = 0; k < 26; k++) {
    const a = r() * 6.283;
    P.r(36 + Math.cos(a) * 22, U + 45 + Math.sin(a) * 14, 2, 1, k % 3 ? C.e1 : C.ir1);
  }
  P.ell(36, U + 47, 17, 11, C.e4);
  P.ell(36, U + 48, 13, 8, C.ink2);
  P.ell(12, U + 64, 11, 5, C.e4);
  P.ell(12, U + 62, 9, 5, C.e3);
  P.ell(11, U + 60, 6, 3, C.e2);
  for (const [a, b] of [[8, U + 61], [13, U + 59], [16, U + 63]]) {
    P.r(a, b, 3, 2, '#866c60');
    P.p(a, b, C.ir1);
  }
  if (chute) {
    box(P, 52, U + 38, 20, 8, 3, M.wood, false);
    P.r(54, U + 39, 16, 5, C.e3);
  }
  P.line(36, U - 6, 39, U + 34, C.e3, 2);
  if (!moving) {
    P.r(36, U - 3, 1, 34, C.c3);
    P.r(32, U + 30, 8, 6, C.e2);
    P.r(32, U + 30, 8, 1, C.e1);
    P.r(32, U + 33, 8, 1, C.s3);
    P.r(33, U + 29, 6, 1, C.ir1);
  }
  P.line(46, U + 52, 50, U + 30, C.e2);
  P.line(51, U + 52, 55, U + 30, C.e2);
  for (let k = 0; k < 6; k++) {
    P.line(47 + k * 0.8, U + 48 - k * 4, 52 + k * 0.8, U + 48 - k * 4, C.e1);
  }
  P.line(36, U - 6, 15, U + 58, C.e2, 2);
  P.line(35, U - 6, 14, U + 58, C.e1);
  P.line(36, U - 6, 59, U + 56, C.e2, 2);
  P.r(34, U - 7, 4, 3, C.c3);
  P.p(35, U - 6, C.c1);
  P.line(22, U + 42, 27, U + 26, C.e2);
  P.r(23, U + 25, 8, 2, C.s2);
  P.p(23, U + 25, C.s0);
  P.r(23, U + 18, 4, 5, C.s3);
  P.r(24, U + 16, 2, 2, C.s3);
  L.push({ k: 'ember', x: 24, y: U + 19, w: 2, h: 2 });
}

/** Ère 2 · un anneau de pierres sèches, un chevalement de bois, une grande roue. */
export function puitsE2(P: Pen, U: number, L: Light[], chute = true, moving = false): void {
  P.ell(36, U + 44, 30, 20, C.st4);
  P.ell(36, U + 44, 22, 13, C.e4);
  P.ell(36, U + 45, 18, 10, C.ink2);
  const stones: [number, number, number][] = [];
  for (let k = 0; k < 24; k++) {
    const a = k / 24 * 6.283;
    stones.push([36 + Math.cos(a) * 26, U + 44 + Math.sin(a) * 16, k]);
  }
  stones.sort((a, b) => a[1] - b[1]);
  for (const [x, y, k] of stones) {
    P.r(x - 3, y - 2, 7, 5, C.ink2);
    P.r(x - 2, y - 2, 5, 4, k % 3 ? C.st1 : C.st2);
    P.r(x - 2, y - 2, 3, 1, C.st0);
    P.r(x - 2, y + 1, 5, 1, C.st3);
  }
  if (chute) {
    box(P, 52, U + 34, 20, 8, 3, M.wood, false);
    P.r(54, U + 35, 16, 5, C.e3);
  }
  P.line(20, U + 30, 31, U - 20, C.e3, 2);
  P.line(52, U + 30, 41, U - 20, C.e3, 2);
  P.line(20, U + 28, 52, U + 28, C.e3, 2);
  P.line(24, U + 8, 48, U + 8, C.e3, 2);
  if (!moving) {
    P.r(46, U - 26, 1, 52, C.c3);
    P.r(42, U + 24, 9, 7, C.e2);
    P.r(42, U + 24, 9, 1, C.e1);
    P.r(42, U + 27, 9, 1, C.s3);
    P.r(43, U + 23, 7, 1, C.ir1);
  }
  P.line(14, U + 56, 30, U - 20, C.e2, 2);
  P.line(13, U + 56, 29, U - 20, C.e1);
  P.line(58, U + 56, 42, U - 20, C.e2, 2);
  P.r(25, U - 22, 22, 3, C.e2);
  P.r(25, U - 22, 22, 1, C.e1);
  for (let a = 0; a < 6.283; a += 0.04) {
    for (const rr of [10, 11]) {
      P.p(36 + Math.cos(a) * rr, U - 28 + Math.sin(a) * rr, rr === 11 ? C.e3 : C.e1);
    }
  }
  if (!moving) {
    for (let k = 0; k < 8; k++) {
      const a = k * Math.PI / 4 + 0.2;
      P.line(36, U - 28, 36 + Math.cos(a) * 10, U - 28 + Math.sin(a) * 10, C.e2);
    }
    P.disc(36, U - 28, 2.5, C.s3);
    P.p(35, U - 29, C.s1);
  }
  P.r(8, U + 24, 2, 32, C.e3);
  P.r(6, U + 20, 5, 5, C.s3);
  L.push({ k: 'ember', x: 7, y: U + 22, w: 3, h: 2 });
}

/** Ère 1 · la meule : du bois en dôme sous la terre et les mottes ; elle cuit sans flamme. */
export function kilnE1(P: Pen, U: number, L: Light[]): void {
  P.ell(24, U + 38, 22, 9, C.e4);
  P.ell(24, U + 32, 21, 13, C.e3);
  P.ell(22, U + 28, 17, 10, C.e2);
  P.ell(19, U + 25, 9, 5, C.e1);
  const r = rng(71);
  for (let k = 0; k < 16; k++) {
    const a = r() * 6.283;
    const d = r() * 0.85;
    const x = 24 + Math.cos(a) * 18 * d;
    const y = U + 30 + Math.sin(a) * 10 * d;
    P.r(x, y, 3, 2, C.m4);
    P.p(x, y, C.m3);
  }
  for (const [x, y] of [[13, U + 30], [29, U + 25], [24, U + 37], [35, U + 33]]) {
    P.r(x, y, 3, 2, C.ink2);
    L.push({ k: 'ember', x: x + 1, y: y + 1, w: 1, h: 1 });
  }
  logEnds(P, [[39, U + 44], [44, U + 44], [41.5, U + 40]]);
  P.line(4, U + 44, 9, U + 22, C.e2);
  P.line(8, U + 44, 13, U + 22, C.e2);
  for (let k = 0; k < 5; k++) {
    P.line(5 + k, U + 40 - k * 4, 9 + k, U + 40 - k * 4, C.e1);
  }
}

/** Ère 2 · le four de pierre : une ruche de pierres sèches, une bouche voûtée, un trou de fumée. */
export function kilnE2(P: Pen, U: number, L: Light[]): void {
  for (let k = 0; k < 8; k++) {
    const cy = U + 36 - k * 4.6;
    const rx = 21 - k * 2.3;
    const ry = 9 - k * 0.7;
    P.ell(24, cy + 1, rx, ry, C.st3);
    P.ell(24, cy, rx, ry, k % 2 ? C.st1 : C.st2);
    P.p(24 - rx + 1, cy, C.st0);
    for (let a = 0.35; a < 2.9; a += 0.55) {
      P.p(24 + Math.cos(a) * rx, cy + Math.sin(a) * ry, C.st3);
    }
  }
  P.ell(24, U + 3, 4, 2, C.ink2);
  L.push({ k: 'ember', x: 23, y: U + 3, w: 3, h: 1 });
  P.r(18, U + 34, 12, 9, C.st0);
  P.r(19, U + 33, 10, 1, C.st0);
  P.r(20, U + 35, 8, 8, C.ink2);
  P.r(21, U + 34, 6, 1, C.ink2);
  L.push({ k: 'ember', x: 21, y: U + 39, w: 6, h: 3 });
  logEnds(P, [[4, U + 42], [9, U + 42], [6.5, U + 38]]);
}

/** Ère 1 · des caisses, un tonneau, une corde. */
export function storeE1(P: Pen, U: number, L: Light[]): void {
  crate(P, 3, U + 24, 18, 12, 12);
  crate(P, 23, U + 28, 18, 12, 12);
  crate(P, 8, U + 12, 14, 9, 11);
  cyl(P, 40, U + 14, 5, 12, M.wood);
  P.r(35, U + 17, 10, 1, C.s3);
  P.r(35, U + 23, 10, 1, C.s3);
  P.ell(9, U + 50, 4, 2, C.c3);
  P.ell(9, U + 50, 2, 1, C.c4);
}

/** Ère 2 · une réserve de pierre, un toit de planches, une lampe à la fenêtre. */
export function storeE2(P: Pen, U: number, L: Light[]): void {
  box(P, 3, U - 12, 42, 40, 18, STONE, false);
  courses(P, 3, U + 28, 42, 18, 9, STONE_F);
  P.r(0, U - 18, 48, 8, C.e3);
  for (let i = 2; i < 48; i += 4) {
    P.r(i, U - 18, 1, 8, C.e4);
  }
  P.r(0, U - 10, 48, 2, C.e0);
  P.r(0, U - 8, 48, 34, C.e2);
  for (let i = 3; i < 48; i += 4) {
    P.r(i, U - 8, 1, 34, C.e3);
  }
  P.r(0, U - 8, 1, 34, C.e1);
  P.r(0, U + 24, 48, 2, C.e4);
  moss(P, 2, U - 6, 44, 8, 14, 12);
  P.r(19, U + 31, 10, 15, C.e3);
  for (const i of [21, 24, 27]) {
    P.r(i, U + 31, 1, 15, C.e4);
  }
  P.r(19, U + 34, 10, 1, C.s3);
  P.r(19, U + 41, 10, 1, C.s3);
  P.r(18, U + 29, 12, 2, C.st0);
  P.r(35, U + 33, 6, 5, C.ink2);
  L.push({ k: 'win', x: 36, y: U + 34, w: 4, h: 3, per: 8 });
}
