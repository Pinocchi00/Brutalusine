/**
 * Les volumes du rendu pixel : caisses, cylindres, chevrons, mousse, assises de pierre, rondins.
 * Les formules, l'ordre des tirages et les arrondis sont ceux de la maquette.
 */
import type { Material } from './palette';
import { C, M } from './palette';
import { rng } from './noise';
import type { Pen } from './pen';

/** Une boîte vue de trois quarts : dessus texturé, face sud, joints et coulures de pluie. */
export function box(P: Pen, x: number, y: number, w: number, d: number, h: number, m: Material, tex = true): void {
  P.r(x, y, w, d, m.t);
  P.r(x, y, w, 1, m.hi);
  P.r(x, y, 1, d, m.hi);
  P.r(x + w - 1, y + 1, 1, d - 1, m.sh);
  if (tex && w >= 16 && d >= 10) {
    for (let j = y + 8; j < y + d - 1; j += 8) P.r(x + 1, j, w - 2, 1, m.sh);
    for (let j = y + 1, row = 0; j < y + d - 1; j += 8, row++) {
      for (let i = x + 8 + (row % 2) * 8; i < x + w - 2; i += 16) P.r(i, j, 1, Math.min(7, y + d - 1 - j), m.sh);
    }
    const r = rng(x * 31 + y * 7 + w);
    for (let k = 0; k < w * d / 60; k++) P.p(x + 2 + Math.floor(r() * (w - 4)), y + 2 + Math.floor(r() * (d - 4)), r() < 0.6 ? m.sh : m.hi);
  }
  if (h <= 0) return;
  P.r(x, y + d, w, h, m.f);
  P.r(x, y + d, w, 1, m.sh);
  P.r(x + w - 1, y + d, 1, h, m.fl);
  P.r(x, y + d + h - 1, w, 1, m.fl);
  if (tex && h >= 6) {
    for (let i = x + 12; i < x + w - 4; i += 12) P.r(i, y + d + 2, 1, h - 3, m.seam);
  }
  if (tex && h >= 9) {
    for (let i = x + 6; i < x + w - 4; i += 12) {
      P.p(i, y + d + 3, m.seam);
      P.p(i, y + d + h - 4, m.seam);
    }
  }
  if (tex && h >= 8) {
    const r = rng(x + y * 3);
    for (let i = x + 3; i < x + w - 3; i += 5 + Math.floor(r() * 7)) {
      P.r(i, y + d + 1, 1, 2 + Math.floor(r() * Math.min(5, h - 3)), m.seam);
    }
  }
}

/** Un cylindre vu de trois quarts : flanc ombré, reflet, fond et couvercle elliptiques. */
export function cyl(P: Pen, cx: number, top: number, rad: number, h: number, m: Material): void {
  const ry = Math.max(1, Math.round(rad * 0.45)), lw = Math.max(1, Math.round(rad * 0.45)), rw = Math.max(1, Math.round(rad * 0.5));
  P.ell(cx, top + h, rad, ry, m.fl);
  P.r(cx - rad, top, rad * 2, h, m.f);
  P.r(cx - rad, top, lw, h, m.t);
  P.r(cx - rad + 1, top, 1, h, m.hi);
  P.r(cx + rad - rw, top, rw, h, m.fl);
  P.ell(cx, top, rad, ry, m.sh);
  P.ell(cx, top - 0.5, Math.max(1, rad - 1), Math.max(1, ry - 1), m.t);
}

/** Un chevron de quatre pixels, tourné d'un quart de tour par `dir` (0 à 3). */
export function chev(P: Pen, cx: number, cy: number, dir: number, col: string): void {
  for (const [a, b] of [[-1, -2], [0, -1], [1, 0], [0, 1], [-1, 2], [-2, -2], [-1, -1], [0, 0], [-1, 1], [-2, 2]]) {
    let x = a, y = b;
    for (let k = 0; k < dir; k++) [x, y] = [-y, x];
    P.p(cx + x, cy + y, col);
  }
}

/** Sème `n` touffes de mousse dans un rectangle, à partir d'une graine. */
export function moss(P: Pen, x: number, y: number, w: number, h: number, seed: number, n: number): void {
  const r = rng(seed);
  for (let k = 0; k < n; k++) {
    const a = x + Math.floor(r() * w), b = y + Math.floor(r() * h);
    P.p(a, b, C.m4);
    if (r() < 0.6) P.p(a + 1, b, r() < 0.5 ? C.m3 : C.m4);
    if (r() < 0.3) P.p(a, b - 1, C.m2);
  }
}

/** Des pierres taillées en assises décalées, sur une face. */
export function courses(
  P: Pen,
  x: number,
  y: number,
  w: number,
  h: number,
  seed: number,
  pal: readonly string[] = [C.st0, C.st1, C.st2, '#a8977f', C.st3],
): void {
  const r = rng(seed), [hi, a1, a2, a3, jt] = pal;
  for (let j = 0; j < h; j += 4) {
    const hh = Math.min(4, h - j);
    let i = -Math.floor(r() * 6);
    while (i < w) {
      const bw = 5 + Math.floor(r() * 6), a = Math.max(0, i), b = Math.min(w, i + bw);
      if (b > a) {
        const tn = r();
        P.r(x + a, y + j, b - a, hh, tn < 0.3 ? a1 : tn < 0.8 ? a2 : a3);
        P.r(x + a, y + j, b - a, 1, tn < 0.3 ? hi : a1);
        P.r(x + b - 1, y + j, 1, hh, jt);
        if (hh === 4) P.r(x + a, y + j + 3, b - a, 1, jt);
      }
      i += bw;
    }
  }
}

/** Une caisse de bois : planches, renfort, et quatre équerres d'acier aux coins. */
export function crate(P: Pen, x: number, y: number, w: number, d: number, h: number): void {
  box(P, x, y, w, d, h, M.wood, false);
  for (let i = x + 4; i < x + w - 2; i += 5) P.r(i, y + 1, 1, d - 1, C.e2);
  P.r(x, y + d + Math.floor(h / 2), w, 1, C.e3);
  P.line(x + 1, y + d + h - 2, x + w - 2, y + d + 1, C.e3);
  for (const [a, b] of [[x, y + d], [x + w - 2, y + d], [x, y + d + h - 2], [x + w - 2, y + d + h - 2]]) {
    P.r(a, b, 2, 2, C.s3);
    P.p(a, b, C.s1);
  }
}

/** Dessine une section de rondin par point : bois clair, cerne sombre et éclat. */
export function logEnds(P: Pen, pts: readonly (readonly [number, number])[]): void {
  for (const [x, y] of pts) {
    P.disc(x, y, 3, C.e3);
    P.disc(x, y, 2.2, C.e1);
    P.p(x, y, C.e3);
    P.p(x - 1, y - 1, C.e0);
  }
}
