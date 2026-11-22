/**
 * La Scierie, ère 1 : une scie de long sur un chevalet, sous un auvent de branches.
 * Dessin inventé dans le style de la maquette `docs/maquettes/heure-doree.html`.
 */
import type { Pen } from './pen';
import { stroke } from './pen';
import type { Light } from './sprite';
import { C, STONE, STONE_F } from './palette';
import { rng } from './noise';
import { box, courses, logEnds, moss } from './volumes';

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

/** Ère 2 · un bâti de pierre à deux montants, une grande lame dentée qui déborde, un tas de sciure. */
export function scierieE2(P: Pen, U: number, L: Light[]): void {
  const r = rng(97);

  // le socle de pierre, large, et son assise en contrebas
  box(P, 1, U + 30, 46, 8, 10, STONE, false);
  courses(P, 1, U + 38, 46, 10, 51, STONE_F);
  P.r(1, U + 30, 46, 1, C.st0);
  P.r(1, U + 30, 1, 8, C.st0);
  P.r(46, U + 31, 1, 7, C.st3);

  // les deux montants et la traverse : le bâti
  box(P, 2, U - 16, 9, 7, 39, STONE, false);
  box(P, 37, U - 16, 9, 7, 39, STONE, false);
  box(P, 1, U - 22, 46, 8, 4, STONE, false);
  courses(P, 2, U - 9, 9, 39, 52, STONE_F);
  courses(P, 37, U - 9, 9, 39, 53, STONE_F);
  courses(P, 1, U - 14, 46, 4, 54, STONE_F);
  P.r(2, U - 16, 9, 1, C.st0);
  P.r(37, U - 16, 9, 1, C.st0);
  P.r(1, U - 22, 46, 1, C.st0);

  // le banc de sciage et son rondin, sous la lame
  P.r(13, U + 26, 22, 4, C.e2);
  P.r(13, U + 26, 22, 1, C.e1);
  P.r(13, U + 29, 22, 1, C.e3);
  logEnds(P, [[15, U + 27], [33, U + 27]]);

  // la lame : dents, disque, moyeu
  const cx = 24, cy = U + 6, R = 14;
  for (let k = 0; k < 28; k++) {
    const a = k / 28 * Math.PI * 2;
    P.line(cx + Math.cos(a) * (R - 1), cy + Math.sin(a) * (R - 1),
      cx + Math.cos(a) * (R + 3), cy + Math.sin(a) * (R + 3), C.s2, 2);
    P.p(cx + Math.cos(a + 0.08) * (R + 2), cy + Math.sin(a + 0.08) * (R + 2), C.s0);
  }
  P.disc(cx, cy, R, C.s2);
  P.disc(cx, cy, R - 1, C.s1);
  P.disc(cx, cy, R - 4, C.s2);
  P.disc(cx, cy, R - 5, C.s1);
  for (let a = -2.5; a < -0.9; a += 0.12) {
    P.p(cx + Math.cos(a) * (R - 2), cy + Math.sin(a) * (R - 2), C.s0);
    P.p(cx + Math.cos(a) * (R - 3), cy + Math.sin(a) * (R - 3), C.s0);
  }
  P.disc(cx, cy, 3, C.s3);
  P.disc(cx, cy, 2, C.s1);
  P.p(cx - 1, cy - 1, C.s0);
  for (const [dx, dy] of [[-5, 0], [5, 0], [0, -5], [0, 5]]) P.p(cx + dx, cy + dy, C.s3);

  // la sciure au sud, en tas clair
  P.ell(24, U + 42, 12, 4, C.sd2);
  P.ell(23, U + 41, 8, 3, C.sd1);
  P.ell(22, U + 40, 4, 2, C.sd0);
  for (let k = 0; k < 22; k++) {
    P.p(6 + Math.floor(r() * 37), U + 40 + Math.floor(r() * 6), r() < 0.6 ? C.sd1 : C.sd0);
  }
}

/** Ère 1 · un foyer au creux d'un cercle de bûches, un lit de braises et de courtes flammes. */
export function bruleurE1(P: Pen, U: number, L: Light[]): void {
  const r = rng(101);

  // des bûches empilées au nord, en arrière-plan
  P.r(12, U + 5, 24, 4, C.e3);
  P.r(12, U + 5, 24, 1, C.e2);
  P.r(12, U + 8, 24, 1, C.e4);
  P.r(15, U + 9, 20, 4, C.e3);
  P.r(15, U + 9, 20, 1, C.e2);
  P.r(15, U + 12, 20, 1, C.e4);
  logEnds(P, [[12, U + 6], [36, U + 6], [15, U + 10], [35, U + 10]]);

  // le cercle de bûches, dessiné de l'arrière vers l'avant
  const logs: [number, number, number][] = [];
  for (let k = 0; k < 14; k++) {
    const a = k / 14 * Math.PI * 2 + 0.11;
    logs.push([24 + Math.cos(a) * 17, U + 26 + Math.sin(a) * 14, a]);
  }
  logs.sort((a, b) => a[1] - b[1]);
  for (const [x, y, a] of logs) {
    const tx = Math.cos(a) * 3, ty = Math.sin(a) * 2;
    stroke(P, x - tx, y - ty, x + tx, y + ty, 4, C.e3);
    stroke(P, x - tx, y - ty - 1, x + tx, y + ty - 1, 2.5, C.e1);
    logEnds(P, [[x - tx, y - ty], [x + tx, y + ty]]);
  }

  // le creux : cendre et braises
  P.ell(24, U + 26, 14, 9, C.ink2);
  P.ell(24, U + 26, 12, 7, C.st4);
  for (let k = 0; k < 34; k++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r());
    P.p(24 + Math.cos(a) * 11 * d, U + 26 + Math.sin(a) * 6 * d, r() < 0.5 ? C.o4 : r() < 0.7 ? C.o3 : C.o2);
  }
  P.ell(24, U + 27, 7, 3, C.o4);

  // les flammes basses
  for (const [x, h, w] of [[19, 6, 3], [23, 9, 4], [27, 7, 3], [31, 5, 2]] as const) {
    P.line(x, U + 27, x, U + 27 - h, C.o4, w);
    P.line(x, U + 27, x, U + 27 - h + 2, C.o3, Math.max(1, w - 1));
    P.line(x, U + 26, x, U + 27 - h + 3, C.o2, 1);
  }
  P.ell(24, U + 25, 3, 2, C.o1);
  P.p(24, U + 25, C.o0);
  L.push({ k: 'fire', x: 18, y: U + 21, w: 12 });
}

/** Ère 2 · un poêle voûté de pierre, une porte à feu sous un arc, une cheminée de pierre. */
export function bruleurE2(P: Pen, U: number, L: Light[]): void {
  // la cheminée de pierre, en arrière-plan
  P.r(31, U - 38, 10, 52, C.st2);
  P.r(31, U - 38, 2, 52, C.st1);
  P.r(39, U - 38, 2, 52, C.st3);
  courses(P, 31, U - 38, 10, 52, 61, STONE_F);
  P.r(29, U - 40, 14, 3, C.st3);
  P.r(29, U - 40, 14, 1, C.st1);
  P.r(31, U - 37, 9, 2, C.st3);
  P.r(33, U - 37, 5, 1, C.ink2);
  moss(P, 31, U + 4, 10, 8, 62, 8);

  // le corps du poêle
  box(P, 2, U + 14, 44, 12, 22, STONE, false);
  courses(P, 2, U + 26, 44, 22, 63, STONE_F);
  P.r(2, U + 14, 44, 1, C.st0);
  P.r(2, U + 14, 1, 12, C.st0);
  P.r(45, U + 15, 1, 11, C.st3);

  // la voûte de pierre
  P.ell(24, U + 20, 21, 11, C.st3);
  P.ell(24, U + 18, 21, 10, C.st2);
  P.ell(24, U + 17, 19, 8, C.st1);
  P.ell(24, U + 17, 15, 6, C.st2);
  P.ell(24, U + 17, 11, 4, C.st1);
  P.ell(20, U + 14, 10, 3, C.st0);
  P.ell(24, U + 17, 7, 2, C.st2);
  moss(P, 4, U + 8, 40, 6, 64, 10);

  // la porte à feu, sous un arc de pierre
  P.r(15, U + 30, 18, 15, C.st0);
  P.ell(24, U + 31, 9, 5, C.st0);
  P.r(16, U + 31, 16, 14, C.ink2);
  P.ell(24, U + 32, 8, 4, C.ink2);
  P.r(18, U + 37, 12, 8, C.o4);
  P.r(19, U + 38, 10, 7, C.o3);
  P.r(20, U + 40, 8, 5, C.o2);
  P.r(22, U + 42, 4, 3, C.o1);
  P.p(23, U + 43, C.o0);
  L.push({ k: 'fire', x: 18, y: U + 39, w: 12 });

  // l'âtre déborde un peu au pied
  P.r(13, U + 45, 22, 3, C.st4);
  P.r(13, U + 45, 22, 1, C.st3);
}

/** Ère 1 · un tourniquet de trois planches à plat sur un plateau, autour de son pivot. */
export function aiguillageE1(P: Pen, U: number, L: Light[]): void {
  // le socle rond, bas, en terre battue
  P.ell(12, U + 15, 10, 8, C.e4);
  P.ell(12, U + 13, 10, 8, C.e3);
  P.ell(11, U + 12, 8, 6, C.sd3);
  P.ell(10, U + 11, 4, 2, C.sd2);
  for (const [x, y] of [[5, U + 10], [18, U + 12], [8, U + 19], [16, U + 20], [21, U + 15]]) {
    P.p(x, y, C.e4);
  }

  // trois planches à 120 degrés, posées à plat
  const arms: [number, number][] = [[12, U + 4], [19.8, U + 17.5], [4.2, U + 17.5]];
  const cols = [C.ink2, C.e0, C.e1, C.e1, C.e1, C.e3, C.ink2];
  for (const [ex, ey] of arms) {
    const d = Math.hypot(ex - 12, ey - (U + 13));
    const ux = (ex - 12) / d, uy = (ey - (U + 13)) / d;
    const px = -uy, py = ux;
    for (let k = -3; k <= 3; k++) {
      P.line(12 + px * k, U + 13 + py * k, ex + px * k, ey + py * k, cols[k + 3]);
    }
    P.line(ex + ux + px * -3.5, ey + uy + py * -3.5, ex + ux + px * 3.5, ey + uy + py * 3.5, C.ink2);
  }

  // le pivot central, dessiné en dernier
  P.disc(12, U + 13, 1.5, C.s2);
  P.p(12, U + 12, C.s0);
}

/** Ère 2 · un socle de pierre et un volet de bois qui bascule sur son axe. */
export function aiguillageE2(P: Pen, U: number, L: Light[]): void {
  // le socle de pierre
  box(P, 1, U + 14, 22, 4, 6, STONE, false);
  courses(P, 1, U + 18, 22, 6, 71, STONE_F);
  P.r(1, U + 14, 22, 1, C.st0);
  P.r(1, U + 14, 1, 4, C.st0);
  P.r(22, U + 15, 1, 3, C.st3);

  // le volet : un panneau de planches qui bascule
  for (let i = 0; i < 14; i++) {
    const x = 5 + i;
    const y = U + 15 - Math.round(i * 0.55);
    P.r(x, y - 11, 1, 12, i % 4 === 0 ? C.e2 : C.e1);
    P.r(x, y - 11, 1, 1, C.e0);
    P.r(x, y, 1, 1, C.e3);
  }
  P.line(5, U + 4, 18, U - 4, C.e0);
  P.line(5, U + 16, 18, U + 8, C.e4);

  // le montant de pierre et l'axe du volet
  P.r(17, U - 1, 4, 15, C.st3);
  P.r(17, U - 1, 1, 15, C.st2);
  P.r(16, U - 3, 6, 2, C.s3);
  P.p(17, U - 3, C.s1);
  P.r(14, U - 1, 8, 2, C.s3);
  P.r(17, U + 6, 2, 2, C.s1);
}
