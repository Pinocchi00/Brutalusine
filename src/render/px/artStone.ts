/**
 * Le Four, ère 2 : un four carré de pierres taillées, une gueule rouge et une haute cheminée.
 * Dessin inventé dans le style de la maquette `docs/maquettes/heure-doree.html`.
 */
import type { Pen } from './pen';
import { stroke } from './pen';
import type { Light } from './sprite';
import { C, STONE, STONE_F } from './palette';
import { rng } from './noise';
import { box, courses, logEnds, moss } from './volumes';

/** Ère 2 · un corps de pierre, une gueule voûtée avec son feu, une cheminée au nord-est, des briques devant. */
export function furnaceE2(P: Pen, U: number, L: Light[], lit = true): void {
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

  if (lit) {
    P.r(16, U + 30, 17, 10, C.o4);
    P.r(17, U + 32, 15, 8, C.o3);
    P.r(19, U + 34, 11, 6, C.o2);
    P.r(21, U + 36, 7, 4, C.o1);
    L.push({ k: 'fire', x: 18, y: U + 35, w: 12 });
  } else {
    for (const [x, y] of [[18, U + 34], [21, U + 32], [24, U + 36], [27, U + 33], [30, U + 35]]) {
      P.p(x, y, C.st3);
    }
  }

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

/** Ère 2 · des murets de pierre en Y et un clapet de bois à contrepoids au centre. */
export function sorterE2(P: Pen, U: number, L: Light[]): void {
  const r = rng(131);

  // un muret de pierre : contour sombre, dessus clair, arête éclairée
  const wall = (x0: number, y0: number, x1: number, y1: number): void => {
    P.line(x0 - 1, y0 - 1, x1 - 1, y1 - 1, C.st4, 4);
    P.line(x0, y0, x1, y1, C.st1, 3);
    P.line(x0, y0, x1, y1, C.st0);
    P.line(x0 + 1, y0 + 2, x1 + 1, y1 + 2, C.st3);
  };

  // le Y : une queue au nord, deux bras écartés vers le sud
  wall(12, U + 9, 12, U + 1);
  wall(12, U + 9, 3, U + 20);
  wall(12, U + 9, 21, U + 20);

  // quelques cailloux et touffes le long des murets
  for (let k = 0; k < 12; k++) {
    const x = 2 + Math.floor(r() * 20), y = U + 8 + Math.floor(r() * 14);
    P.p(x, y, r() < 0.5 ? C.st2 : C.m4);
  }

  // le clapet : un panneau de bois qui pend au centre de la fourche
  P.r(10, U + 9, 5, 8, C.e2);
  P.r(10, U + 9, 5, 1, C.e0);
  P.r(10, U + 16, 5, 1, C.e3);
  P.r(10, U + 9, 1, 8, C.e1);
  P.r(14, U + 9, 1, 8, C.e3);
  P.r(10, U + 12, 5, 1, C.e4);
  P.r(10, U + 14, 5, 1, C.e4);

  // l'axe de fer du clapet
  P.r(9, U + 8, 7, 2, C.s3);
  P.r(9, U + 8, 7, 1, C.s1);

  // le contrepoids de fer, suspendu à droite
  P.line(15, U + 9, 17, U + 11, C.c3);
  P.r(16, U + 11, 4, 5, C.s3);
  P.r(16, U + 11, 4, 1, C.s2);
  P.r(16, U + 11, 1, 5, C.s2);
  P.r(19, U + 12, 1, 4, C.s4);
  P.r(16, U + 15, 4, 1, C.ink2);
  P.p(17, U + 12, C.s0);

  moss(P, 3, U + 18, 20, 5, 134, 6);
}

/** Ère 2 · une fosse sombre bordée de pierres, un arceau de bois et son collet, des baies rouges. */
export function trapE2(P: Pen, U: number, L: Light[]): void {
  const r = rng(151);

  // le sol battu autour de la fosse
  P.ell(24, U + 33, 23, 14, C.sd3);
  P.ell(24, U + 32, 21, 12, C.sd2);
  for (let k = 0; k < 46; k++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r());
    P.p(24 + Math.cos(a) * 22 * d, U + 32 + Math.sin(a) * 12 * d, r() < 0.5 ? C.sd3 : C.e4);
  }

  // une pierre du rebord : socle sombre, dessus clair, ombre au sud
  const stone = (x: number, y: number): void => {
    P.r(x - 3, y - 2, 7, 5, C.st4);
    P.r(x - 3, y - 2, 6, 4, C.st2);
    P.r(x - 3, y - 2, 6, 1, C.st1);
    P.p(x - 2, y - 1, C.st0);
    P.r(x - 3, y + 1, 6, 1, C.st3);
  };

  // le rebord de pierres, de l'arrière vers l'avant
  const rim: [number, number][] = [];
  for (let k = 0; k < 22; k++) {
    const a = k / 22 * Math.PI * 2;
    rim.push([24 + Math.cos(a) * 19, U + 33 + Math.sin(a) * 12]);
  }
  rim.sort((a, b) => a[1] - b[1]);
  for (const [x, y] of rim) {
    if (y < U + 33) stone(x, y);
  }

  // la fosse, et sa paroi nord éclairée
  P.ell(24, U + 33, 17, 10, C.st4);
  P.ell(24, U + 32, 16, 9, C.ink2);
  P.ell(24, U + 31, 15, 8, C.ink);
  P.ell(24, U + 31, 13, 6, C.ink2);
  for (let k = 0; k < 26; k++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r());
    P.p(24 + Math.cos(a) * 14 * d, U + 31 + Math.sin(a) * 7 * d, r() < 0.6 ? C.ink2 : C.st4);
  }

  for (const [x, y] of rim) {
    if (y >= U + 33) stone(x, y);
  }

  // l'arceau : deux branches plantées au bord, courbées au-dessus de la fosse
  const arch: [number, number][] = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    arch.push([5 + 38 * t, U + 43 - Math.sin(Math.PI * t) * 41]);
  }
  for (const [x, y] of arch) P.disc(x, y, 2.4, C.e3);
  for (const [x, y] of arch) P.disc(x - 0.4, y - 0.8, 1.4, C.e1);
  for (const [x, y] of arch) P.p(x - 1, y - 1, C.e0);
  P.r(3, U + 41, 4, 4, C.e3);
  P.r(3, U + 41, 4, 1, C.e2);
  P.r(41, U + 41, 4, 4, C.e3);
  P.r(41, U + 41, 4, 1, C.e2);

  // le collet : la corde, l'anneau et son nœud
  P.line(24, U + 2, 24, U + 15, C.c1);
  P.p(23, U + 8, C.c0);
  P.p(24, U + 11, C.c0);
  P.ell(24, U + 19, 5, 6, C.e2);
  P.ell(24, U + 19, 4, 5, C.c1);
  P.ell(24, U + 19, 3, 4, C.ink2);
  P.p(24, U + 13, C.c2);
  P.line(22, U + 13, 26, U + 13, C.c2);

  // les baies rouges, dans la fosse et sur une brindille au sud
  for (const [x, y] of [[21, U + 28], [23, U + 27], [25, U + 29], [22, U + 30], [26, U + 26]]) {
    P.r(x, y, 2, 2, C.red);
    P.p(x, y, C.pink);
  }
  P.line(14, U + 44, 19, U + 39, C.e3);
  for (const [x, y] of [[15, U + 40], [17, U + 38], [19, U + 40], [16, U + 42]]) {
    P.r(x, y, 2, 2, C.red);
    P.p(x, y, C.pink);
  }
}

/** Ère 2 · une fosse d'argile humide, une drague à godets sur son bâti de bois, des mottes qui sèchent. */
export function clayPitE2(P: Pen, U: number, L: Light[]): void {
  const r = rng(163);

  // la fosse d'argile : bourrelet de terre, parois humides, fond sombre
  P.ell(18, U + 35, 17, 11, C.sd3);
  P.ell(18, U + 35, 15, 9, C.e3);
  P.ell(18, U + 34, 14, 8, C.ir2);
  P.ell(18, U + 34, 12, 7, C.ir3);
  for (let k = 0; k < 34; k++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r());
    P.p(18 + Math.cos(a) * 13 * d, U + 34 + Math.sin(a) * 7 * d, r() < 0.5 ? C.ir2 : C.ir1);
  }
  // l'eau qui suinte au fond de la fosse
  P.ell(13, U + 39, 6, 3, C.q5);
  P.ell(13, U + 39, 5, 2, C.q4);
  P.r(10, U + 38, 4, 1, C.q3);
  P.p(12, U + 38, C.q2);
  P.p(15, U + 40, C.q3);

  // le bâti de bois de la drague, à l'est
  const beam = (x0: number, y0: number, x1: number, y1: number): void => {
    P.line(x0, y0, x1, y1, C.e3, 3);
    P.line(x0, y0, x1, y1, C.e1);
    P.line(x0 + 1, y0 + 2, x1 + 1, y1 + 2, C.e4);
  };
  beam(32, U + 42, 30, U - 6);
  beam(42, U + 42, 43, U - 8);
  beam(31, U + 22, 42, U + 24);
  P.r(29, U - 9, 15, 3, C.e3);
  P.r(29, U - 9, 15, 1, C.e1);
  P.r(29, U - 7, 15, 1, C.e4);
  P.r(32, U + 38, 10, 3, C.e2);
  P.r(32, U + 38, 10, 1, C.e1);

  // la poulie et l'échelle à godets qui plonge dans la fosse
  P.disc(37, U - 4, 3, C.s3);
  P.disc(37, U - 4, 2, C.s1);
  P.p(36, U - 5, C.s0);
  P.line(36, U - 2, 18, U + 31, C.e3, 5);
  P.line(36, U - 1, 18, U + 32, C.e2, 3);
  P.line(36, U - 2, 18, U + 31, C.e1);
  P.line(24, U + 25, 30, U + 6, C.e4, 2);
  for (const t of [0.15, 0.34, 0.53, 0.72, 0.9]) {
    const x = 36 - 18 * t;
    const y = U - 2 + 33 * t;
    P.r(x - 2, y, 5, 4, C.s4);
    P.r(x - 2, y, 5, 1, C.s2);
    P.r(x - 2, y + 1, 5, 2, C.s3);
    P.p(x - 2, y, C.s1);
    P.r(x - 1, y + 1, 3, 1, C.ir2);
  }

  // les mottes qui sèchent au sud
  const clod = (x: number, y: number, w: number, h: number): void => {
    P.ell(x, y, w + 1, h + 1, C.e4);
    P.ell(x, y - 1, w, h, C.sd2);
    P.ell(x - 1, y - 2, Math.max(1, w - 1), Math.max(1, h - 1), C.sd1);
    P.p(x - 2, y - 2, C.q0);
    P.p(x + 1, y - 1, C.e3);
  };
  clod(4, U + 45, 4, 2);
  clod(12, U + 46, 5, 2);
  clod(20, U + 45, 4, 2);
  clod(28, U + 46, 3, 2);
  moss(P, 3, U + 41, 22, 4, 164, 7);
}

/** Ère 2 · deux cuves de pierre au liquide brun, des peaux tendues sur des cadres de bois au nord. */
export function tanneryE2(P: Pen, U: number, L: Light[]): void {
  const r = rng(173);

  // une peau claire tendue sur son cadre, avec ses coutures et une traverse
  const frame = (x: number, y: number, w: number, h: number, seed: number): void => {
    const q = rng(seed);
    P.r(x + 2, y + 2, w - 4, h - 4, C.sd1);
    P.r(x + 2, y + 2, w - 4, 2, C.sd0);
    P.r(x + 2, y + 2, 1, h - 4, C.sd0);
    P.r(x + w - 3, y + 2, 1, h - 4, C.sd3);
    P.r(x + 2, y + h - 3, w - 4, 1, C.sd3);
    for (let k = 0; k < Math.floor(w * h / 26); k++) {
      P.p(x + 3 + Math.floor(q() * (w - 6)), y + 3 + Math.floor(q() * (h - 6)), q() < 0.6 ? C.sd2 : C.e2);
    }
    for (let i = x + 4; i < x + w - 3; i += 3) {
      P.p(i, y + 2, C.e3);
      P.p(i, y + h - 3, C.e3);
    }
    for (let j = y + 4; j < y + h - 3; j += 3) {
      P.p(x + 2, j, C.e3);
      P.p(x + w - 3, j, C.e3);
    }
    P.r(x, y, w, 2, C.e2);
    P.r(x, y, w, 1, C.e1);
    P.r(x, y + h - 2, w, 2, C.e3);
    P.r(x, y + h - 1, w, 1, C.e4);
    P.r(x, y, 2, h, C.e2);
    P.r(x, y, 1, h, C.e1);
    P.r(x + w - 2, y, 2, h, C.e3);
    P.r(x + w - 1, y, 1, h, C.e4);
    P.r(x, y + Math.floor(h / 2), w, 1, C.e3);
    for (const [cx, cy] of [[x + 2, y + 1], [x + w - 3, y + 1], [x + 2, y + h - 2], [x + w - 3, y + h - 2]]) {
      P.p(cx, cy, C.c2);
    }
  };

  // une cuve de pierre remplie de liquide brun
  const vat = (x: number, y: number, w: number, d: number, h: number, seed: number): void => {
    const cx = x + w / 2, cy = y + d / 2;
    box(P, x, y, w, d, h, STONE, false);
    courses(P, x, y + d, w, h, seed, STONE_F);
    P.r(x, y, w, 1, C.st0);
    P.r(x, y, 1, d, C.st0);
    P.r(x + w - 1, y + 1, 1, d - 1, C.st3);
    P.ell(cx, cy, (w - 6) / 2, (d - 4) / 2, C.st4);
    P.ell(cx, cy, (w - 8) / 2, (d - 6) / 2, C.e4);
    P.ell(cx - 1, cy - 1, (w - 10) / 2, (d - 8) / 2, C.e3);
    P.r(x + 5, y + 4, w - 11, 1, C.e2);
    for (let k = 0; k < 8; k++) {
      const a = r() * Math.PI * 2, e = Math.sqrt(r());
      P.p(cx + Math.cos(a) * (w - 10) / 2 * e, cy + Math.sin(a) * (d - 8) / 2 * e, r() < 0.5 ? C.e2 : C.ir1);
    }
  };

  // les pieds des cadres, plantés derrière les cuves
  for (const [x0, y0, x1, y1] of [[6, U + 8, 7, U + 22], [18, U + 8, 19, U + 22], [29, U + 6, 30, U + 21], [42, U + 6, 41, U + 21]]) {
    P.line(x0, y0, x1, y1, C.e3, 2);
    P.line(x0, y0, x1, y1, C.e1);
  }

  // les cadres de peaux, au nord
  frame(3, U - 14, 17, 24, 174);
  frame(26, U - 17, 19, 25, 175);

  // les deux cuves, au sud, et la poutre qui les relie
  vat(2, U + 22, 19, 12, 12, 176);
  vat(26, U + 24, 19, 12, 10, 177);
  P.r(20, U + 24, 7, 3, C.e2);
  P.r(20, U + 24, 7, 1, C.e1);
  P.r(20, U + 26, 7, 1, C.e3);

  // le bâton qui remue la cuve de gauche
  P.line(10, U + 23, 16, U + 11, C.e3, 2);
  P.line(10, U + 23, 16, U + 11, C.e1);
  P.r(14, U + 10, 5, 2, C.e3);
  P.r(14, U + 10, 5, 1, C.e1);

  moss(P, 3, U + 35, 17, 5, 178, 7);
  moss(P, 27, U + 35, 17, 5, 179, 7);
}

/** Ère 2 · une grande roue à aubes de face dans un bief de pierre, l'eau bleue et l'écume au pied. */
export function waterWheelE2(P: Pen, U: number, L: Light[]): void {
  const r = rng(181);
  const cx = 24, cy = U + 10, R = 22;

  // le bief : bassin de pierre et eau bleue
  P.r(0, U + 27, 48, 21, C.st4);
  P.r(8, U + 31, 32, 17, C.q5);
  P.r(9, U + 31, 30, 16, C.q4);
  P.r(10, U + 32, 28, 14, C.q3);
  P.r(9, U + 31, 30, 1, C.q2);
  for (let k = 0; k < 26; k++) {
    const x = 10 + Math.floor(r() * 27);
    const y = U + 33 + Math.floor(r() * 13);
    P.r(x, y, 1 + Math.floor(r() * 4), 1, r() < 0.6 ? C.q2 : C.q1);
  }

  // les deux culées de pierre
  for (const x of [1, 39]) {
    box(P, x, U + 27, 8, 11, 10, STONE, false);
    courses(P, x, U + 38, 8, 10, 182 + x, STONE_F);
    P.r(x, U + 27, 8, 1, C.st0);
    P.r(x, U + 27, 1, 11, C.st0);
    P.r(x + 7, U + 28, 1, 10, C.st3);
  }
  // les chapeaux de pierre et les paliers de fer
  P.r(0, U + 25, 11, 3, C.st2);
  P.r(0, U + 25, 11, 1, C.st1);
  P.r(37, U + 25, 11, 3, C.st2);
  P.r(37, U + 25, 11, 1, C.st1);
  P.r(4, U + 24, 6, 3, C.s4);
  P.r(38, U + 24, 6, 3, C.s4);

  // l'axe de fer, de culée en culée
  P.r(2, cy, 44, 1, C.s4);
  P.r(2, cy + 1, 44, 1, C.s3);
  P.line(2, cy, 46, cy, C.s2);

  // la roue : jante, rayons, aubes
  for (let a = 0; a < Math.PI * 2; a += 0.012) {
    const ca = Math.cos(a), sa = Math.sin(a);
    P.p(cx + ca * R, cy + sa * R, C.e2);
    P.p(cx + ca * (R - 1), cy + sa * (R - 1), C.e3);
    P.p(cx + ca * (R - 2), cy + sa * (R - 2), C.e2);
    P.p(cx + ca * (R - 3), cy + sa * (R - 3), sa < -0.3 ? C.e0 : C.e1);
  }
  for (let k = 0; k < 12; k++) {
    const a = k / 12 * Math.PI * 2 + 0.13;
    const x0 = cx + Math.cos(a) * 4, y0 = cy + Math.sin(a) * 4;
    const x1 = cx + Math.cos(a) * (R - 3), y1 = cy + Math.sin(a) * (R - 3);
    P.line(x0, y0, x1, y1, C.e2, 2);
    P.line(x0, y0, x1, y1, C.e1);
    P.r(cx + Math.cos(a) * (R - 4) - 1, cy + Math.sin(a) * (R - 4) - 1, 2, 2, C.s3);
  }
  for (let k = 0; k < 12; k++) {
    const a = k / 12 * Math.PI * 2 + 0.13 + Math.PI / 12;
    const bx = cx + Math.cos(a) * (R + 1), by = cy + Math.sin(a) * (R + 1);
    const tx = Math.sin(a) * 4, ty = -Math.cos(a) * 4;
    P.line(bx - tx, by - ty, bx + tx, by + ty, C.e2, 3);
    P.line(bx - tx, by - ty, bx + tx, by + ty, C.e1);
    P.p(bx + tx, by + ty, C.e4);
  }

  // le moyeu de fer
  P.disc(cx, cy, 5, C.e3);
  P.disc(cx, cy, 4, C.e2);
  P.disc(cx, cy, 3, C.s3);
  P.disc(cx, cy, 2, C.s1);
  P.p(cx - 1, cy - 1, C.s0);

  // l'écume au pied de la roue
  for (let k = 0; k < 46; k++) {
    const a = Math.PI * (0.18 + r() * 0.64);
    const d = R - 3 + r() * 6;
    P.p(cx + Math.cos(a) * d, cy + Math.sin(a) * d, r() < 0.5 ? C.c0 : r() < 0.7 ? C.q1 : C.q2);
  }
  for (const [x, y, w] of [[8, U + 36, 4], [34, U + 38, 5], [12, U + 42, 4], [29, U + 43, 5]] as const) {
    P.r(x, y, w, 1, C.c0);
    P.p(x + 1, y + 1, C.q1);
  }

  moss(P, 2, U + 36, 8, 8, 183, 6);
  moss(P, 39, U + 36, 8, 8, 184, 6);
}
