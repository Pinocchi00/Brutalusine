/**
 * La Tour, ères 1 et 2 de la maquette : la capsule d'arrivée sur son plancher de bois,
 * puis le tambour de pierre taillée. Les trait et l'ordre des tirages sont ceux de la maquette.
 */
import type { Pen } from './pen';
import type { Light } from './sprite';
import { C, M, PANEL, PANEL2, STONE, STONE_F, type Material } from './palette';
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

/** La brique de la Tour : terre cuite sourde, arêtes claires, joints de chaux. */
const BRICK: Material = {
  t: C.ir1,
  hi: C.ir0,
  sh: C.ir2,
  f: C.ir2,
  fl: C.ir3,
  seam: '#d9b79a',
};

/** Les pierres d'une façade de brique : la teinte, l'arête, l'ombre et le joint clair. */
const BRICK_F: readonly string[] = [C.ir0, C.ir1, C.ir2, '#8a5545', '#d9b79a'];

/** Ère 3 · Brique : la Tour de Pierre rebâtie en brique, un étage de plus, l'œil de la capsule au cœur. */
export function towerE3(P: Pen, U: number, L: Light[]): void {
  // le soubassement de pierre, hérité de la Tour de Pierre
  box(P, 0, U + 4, 72, 64, 4, STONE, false);
  courses(P, 0, U + 68, 72, 4, 7, STONE_F);
  P.r(0, U + 4, 72, 1, C.st0);
  P.r(0, U + 4, 1, 64, C.st0);

  // le hall trapu, en brique
  box(P, 4, U - 8, 64, 50, 20, BRICK, false);
  courses(P, 4, U - 7, 64, 18, 11, BRICK_F);
  courses(P, 4, U + 42, 64, 20, 13, BRICK_F);
  P.r(4, U - 8, 64, 1, C.ir0);
  P.r(4, U - 8, 1, 50, C.ir0);
  P.r(67, U - 7, 1, 49, C.ir3);
  P.r(4, U + 41, 64, 1, C.ir3);

  // quatre pilastres de brique sur la façade
  for (const x of [5, 23, 47, 66]) {
    P.r(x, U + 41, 4, 22, C.ir1);
    P.r(x, U + 41, 1, 22, C.ir0);
    P.r(x + 3, U + 42, 1, 21, C.ir3);
    for (let y = U + 45; y < U + 62; y += 4) P.r(x + 1, y, 2, 1, '#d9b79a');
  }

  // les arcades du hall : deux baies et la grande porte du sud
  const arch = (cx: number, top: number, rx: number, h: number): void => {
    const X = Math.round(cx - rx);
    P.ell(cx, top + rx, rx + 1, rx, C.ir3);
    P.r(X - 1, top, (rx + 1) * 2, h, C.ir3);
    P.ell(cx, top + rx, rx, Math.max(1, rx - 1), C.ink2);
    P.r(X, top + rx, rx * 2, h - rx, C.ink2);
  };
  arch(14, U + 45, 5, 17);
  arch(58, U + 45, 5, 17);
  arch(36, U + 43, 7, 19);
  for (const cx of [14, 58, 36]) {
    P.p(cx - 2, U + 48, C.o4);
    P.p(cx + 2, U + 52, C.o3);
  }

  // la trémie de l'ouest et le linteau du sud
  box(P, 0, U + 28, 10, 12, 8, M.steel, false);
  P.r(2, U + 30, 6, 8, C.ink2);
  P.r(0, U + 40, 10, 1, C.o3);
  P.r(6, U + 62, 16, 3, C.ir3);
  P.r(6, U + 62, 16, 1, C.ir0);

  // le fût de brique, haut et étroit, avec ses deux arêtes
  box(P, 22, U - 50, 28, 18, 52, BRICK, false);
  courses(P, 22, U - 49, 28, 16, 17, BRICK_F);
  courses(P, 22, U - 32, 28, 52, 19, BRICK_F);
  P.r(22, U - 32, 2, 52, C.ir0);
  P.r(47, U - 32, 3, 52, C.ir3);
  P.r(22, U - 50, 28, 1, C.ir0);

  // un étage de plus : un tambour de brique, ses meurtrières et sa corniche
  box(P, 27, U - 64, 18, 14, 14, BRICK, false);
  courses(P, 27, U - 52, 18, 14, 23, BRICK_F);
  P.r(27, U - 64, 18, 1, C.ir0);
  P.r(27, U - 64, 1, 14, C.ir0);
  P.r(44, U - 63, 1, 13, C.ir3);
  for (const x of [31, 36, 41]) {
    P.r(x, U - 58, 2, 7, C.ink2);
    P.p(x, U - 58, C.s3);
  }
  box(P, 25, U - 69, 22, 5, 2, M.dark, false);
  P.r(25, U - 72, 22, 1, C.ir0);
  for (let i = 26; i < 46; i += 4) P.r(i, U - 71, 1, 3, C.ir3);

  // l'œil de la capsule, toujours visible au cœur du hall
  P.disc(36, U + 9, 7, C.ir3);
  P.disc(36, U + 9, 6, C.st1);
  P.disc(36, U + 9, 5, C.ink2);
  P.disc(36, U + 9, 3, C.o3);
  P.disc(36, U + 9, 2, C.o2);
  P.p(35, U + 8, C.o0);
  L.push({ k: 'lens', x: 36, y: U + 9, r: 2.5 });

  // deux fenêtres basses, une lueur d'atelier dans le hall
  P.r(10, U + 30, 4, 6, C.ink2);
  P.r(54, U + 30, 4, 6, C.ink2);
  L.push({ k: 'win', x: 11, y: U + 31, w: 2, h: 4, per: 9 });
  L.push({ k: 'win', x: 55, y: U + 31, w: 2, h: 4, per: 11 });

  // les mousses et les herbes des vieux murs
  moss(P, 3, U + 58, 66, 7, 31, 24);
  moss(P, 0, U + 66, 72, 5, 32, 18);
  moss(P, 8, U + 4, 20, 5, 33, 7);
  moss(P, 44, U + 2, 20, 5, 34, 6);
}
