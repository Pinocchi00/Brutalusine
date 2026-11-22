/**
 * La Tour, ères 1 et 2 de la maquette : la capsule d'arrivée sur son plancher de bois,
 * puis le tambour de pierre taillée. Les trait et l'ordre des tirages sont ceux de la maquette.
 */
import type { Pen } from './pen';
import type { Light } from './sprite';
import { C, M, PANEL, PANEL2, STONE, STONE_F } from './palette';
import { hash, rng } from './noise';
import { box, courses, crate, cyl, logEnds, moss } from './volumes';

/** Le nez bombé de la capsule : quatre ellipses de plus en plus courtes. */
function capsuleNose(P: Pen, cx: number, top: number, rad: number): void {
  for (let k = 1; k <= 4; k++) {
    const x = cx - k * 0.5;
    const y = top - k * rad * 0.2;
    const rx = rad * (1 - k * 0.2);
    const ry = Math.max(1, rad * 0.45 * (1 - k * 0.12));
    P.ell(x, y, rx, ry, k < 3 ? C.s1 : C.s0);
  }
}

/** La capsule d'arrivée : un cylindre d'acier brûlé par l'entrée dans l'air, son œil et son nez. */
function capsule(P: Pen, cx: number, top: number, rad: number, h: number, lensY: number, L: Light[]): void {
  cyl(P, cx, top, rad, h, M.steel);
  capsuleNose(P, cx, top, rad);
  P.r(cx - rad, top + 4, rad * 2, 1, C.s3);
  for (let i = cx - rad + 2; i < cx + rad - 1; i += 4) {
    P.p(i, top + 5, C.s0);
  }
  for (let j = 0; j < 6; j++) {
    for (let i = -rad + 1; i < rad - 1; i++) {
      if ((i + j) % 2 !== 0) continue;
      if (hash(i, j, cx) >= 0.75 - j * 0.12) continue;
      P.p(cx + i, top + h - 1 - j, j < 2 ? C.s3 : C.s2);
    }
  }
  P.disc(cx, lensY, 4, C.s3);
  P.disc(cx, lensY, 3, C.ink2);
  P.disc(cx, lensY, 2, C.o3);
  L.push({ k: 'lens', x: cx, y: lensY, r: 2 });
}

/** Ère 1 · Bois : la capsule posée sur un plancher de rondins, un mât, un fanion, deux caisses. */
export function towerE1(P: Pen, U: number, L: Light[]): void {
  box(P, 6, U + 28, 60, 36, 4, M.wood, false);
  for (let j = U + 33; j < U + 64; j += 5) {
    P.r(7, j, 58, 1, C.e2);
    P.p(8, j - 2, C.e3);
    P.p(63, j - 2, C.e3);
  }
  for (const x of [8, 34, 61]) {
    P.r(x, U + 68, 3, 4, C.e4);
  }
  P.r(0, U + 40, 9, 12, C.e3);
  P.r(1, U + 42, 7, 8, C.ink2);
  P.r(0, U + 40, 9, 1, C.e1);
  P.line(30, U + 22, 26, U + 34, C.s3, 2);
  capsule(P, 36, U + 2, 12, 26, U + 13, L);
  P.line(27, U + 24, 20, U + 40, C.s2, 2);
  P.line(45, U + 24, 52, U + 40, C.s2, 2);
  P.r(17, U + 40, 6, 2, C.s1);
  P.r(50, U + 40, 6, 2, C.s1);
  P.r(36, U - 12, 1, 12, C.s2);
  P.p(36, U - 13, C.s1);
  L.push({ k: 'blink', x: 36, y: U - 14, per: 3 });
  crate(P, 9, U + 42, 14, 8, 9);
  crate(P, 11, U + 34, 10, 6, 8);
  P.r(46, U + 48, 14, 7, C.s3);
  P.r(47, U + 49, 12, 5, PANEL);
  for (const i of [50, 53, 56]) {
    P.r(i, U + 49, 1, 5, PANEL2);
  }
  P.r(47, U + 51, 12, 1, PANEL2);
  P.r(52, U + 55, 2, 4, C.s3);
  P.line(58, U - 10, 44, U + 30, C.c4);
  P.line(58, U - 10, 66, U + 40, C.c4);
  P.r(57, U - 12, 2, 66, C.e2);
  P.r(57, U - 12, 1, 66, C.e1);
  for (let j = 0; j < 6; j++) {
    P.r(59, U - 11 + j, 12 - j * 2, 1, j === 2 ? C.o3 : j < 2 ? C.c0 : C.c1);
  }
}

/** Ère 2 · Pierre : un socle de pierres taillées, la capsule dans un tambour, un brasero sur un pilier. */
export function towerE2(P: Pen, U: number, L: Light[]): void {
  box(P, 2, U + 14, 68, 50, 8, STONE, false);
  courses(P, 2, U + 64, 68, 8, 3, STONE_F);
  const slabs = rng(4);
  for (let k = 0; k < 26; k++) {
    const x = 4 + Math.floor(slabs() * 62);
    const y = U + 16 + Math.floor(slabs() * 46);
    P.r(x, y, 4 + Math.floor(slabs() * 4), 1, C.st2);
  }
  P.r(26, U + 64, 16, 4, C.st0);
  P.r(26, U + 65, 16, 3, C.st1);
  P.r(24, U + 68, 20, 4, C.st1);
  P.r(24, U + 68, 20, 1, C.st0);
  P.r(2, U + 34, 6, 14, C.st0);
  P.r(3, U + 36, 4, 11, C.ink2);
  P.r(7, U + 64, 14, 8, C.ink2);
  P.r(6, U + 63, 16, 2, C.e2);
  P.r(6, U + 63, 16, 1, C.e1);
  cyl(P, 36, U - 8, 18, 36, STONE);
  P.ell(36, U - 8, 13, 6, C.ink2);
  capsuleNose(P, 36, U - 8, 12);
  for (let row = 0, y = U - 4; y < U + 28; y += 5, row++) {
    for (let i = -17; i <= 17; i++) {
      const yy = y + Math.round(Math.sqrt(Math.max(0, 1 - (i / 18) ** 2)) * 7);
      P.p(36 + i, yy, C.st3);
      if ((i + row * 3) % 7 === 0) {
        P.r(36 + i, yy - 4, 1, 4, C.st3);
      }
    }
  }
  P.disc(36, U + 2, 6, C.st0);
  P.disc(36, U + 2, 5, C.st1);
  P.disc(36, U + 2, 4, C.ink2);
  L.push({ k: 'lens', x: 36, y: U + 2, r: 2.5 });
  P.r(31, U + 15, 10, 14, C.e3);
  P.r(32, U + 14, 8, 1, C.e3);
  for (const i of [33, 36, 39]) {
    P.r(i, U + 15, 1, 14, C.e4);
  }
  P.r(31, U + 18, 10, 1, C.s3);
  P.r(31, U + 25, 10, 1, C.s3);
  P.r(30, U + 13, 12, 2, C.st0);
  for (const [x, y] of [[12, U + 46], [21, U + 48], [15, U + 41]]) {
    box(P, x, y, 9, 5, 5, STONE, false);
    P.r(x, y + 5, 9, 1, C.st3);
  }
  P.r(52, U + 50, 12, 6, C.e3);
  P.r(52, U + 50, 12, 1, C.e1);
  P.r(53, U + 51, 10, 1, C.st1);
  logEnds(P, [[54, U + 57], [62, U + 57]]);
  box(P, 57, U - 18, 9, 7, 34, STONE, false);
  courses(P, 57, U - 11, 9, 34, 5, STONE_F);
  P.r(55, U - 24, 13, 5, C.s3);
  for (const i of [56, 59, 62, 65]) {
    P.r(i, U - 24, 1, 6, C.s4);
  }
  P.r(55, U - 24, 13, 1, C.s2);
  L.push({ k: 'fire', x: 57, y: U - 24, w: 9 });
  moss(P, 2, U + 58, 68, 12, 12, 30);
  moss(P, 18, U + 22, 36, 6, 13, 10);
}
