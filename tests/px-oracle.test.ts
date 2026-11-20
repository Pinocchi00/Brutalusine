/**
 * Vérification hors navigateur du socle pixel.
 * Un faux contexte 2D enregistre chaque `fillStyle` et chaque `fillRect` ; on compare la suite
 * produite par le portage à celle de l'oracle, qui est une copie fidèle de la maquette.
 */
import { describe, expect, it } from 'vitest';
import { C, GLASS, M, PANEL, PANEL2, STONE, STONE_F } from '../src/render/px/palette';
import { EASE, bump, hash, hexToRgb, rgba, rng, smooth, vnoise } from '../src/render/px/noise';
import { edges, pen, stroke, type Pen } from '../src/render/px/pen';
import { box, chev, courses, crate, cyl, logEnds, moss } from '../src/render/px/volumes';

// =====================================================================================
// ORACLE — référence copiée de docs/maquettes/heure-doree.html, ne pas modifier.
// Seuls les types et les noms des fonctions internes de l'oracle ont été ajoutés.
// =====================================================================================
const ORACLE_C = {
  ink: '#1a1018', ink2: '#2b1d26',
  c0: '#fff3dc', c1: '#ead7b8', c2: '#cdb592', c3: '#a68c6d', c4: '#7c6550', c5: '#56443a',
  s0: '#ddd6d0', s1: '#aaa2a2', s2: '#7c737b', s3: '#564d57', s4: '#3a323c',
  o0: '#fff3b8', o1: '#ffcc5c', o2: '#f78f22', o3: '#cc5a14', o4: '#7e2f0c',
  g0: '#e6ef94', g1: '#b6d466', g2: '#7fb04e', g3: '#56893f', g4: '#3d6a3a', g5: '#2a4f35', g6: '#1c3329',
  m0: '#eef09a', m1: '#c2d66a', m2: '#9cbf57', m3: '#76a24b', m4: '#557f42', m5: '#3e6140',
  e0: '#ecc78f', e1: '#cf9f69', e2: '#a87a52', e3: '#80593c', e4: '#5a3d2b',
  sd0: '#f8e0ae', sd1: '#ebc994', sd2: '#d0a674', sd3: '#b08660',
  q0: '#fff6e0', q1: '#bfeee0', q2: '#86d2c2', q3: '#58b3ac', q4: '#3a9199', q5: '#2b737f', q6: '#215967', q7: '#1b4756',
  st0: '#ece0cc', st1: '#c2b29c', st2: '#958170', st3: '#6c5b50', st4: '#4a3e38',
  ir0: '#c9a08c', ir1: '#9c6450', ir2: '#764a3c', ir3: '#53352e', irm: '#dcd8d0', irk: '#4f4040',
  ma0: '#c3d9c4', ma1: '#93b8a0', ma2: '#6a927c', ma3: '#4b6e5c', az: '#6f86ad', az2: '#9eb0cc',
  qz0: '#fbf8f0', qz1: '#e9e6de', qz2: '#cfd2cd', qz3: '#a7aeac', qz4: '#7f8789',
  ch0: '#6a6270', ch1: '#433c49', ch2: '#2a242f', chs: '#b2a6e6',
  pink: '#ff9fbf', pink2: '#e46a93', white: '#fffbf0', blue: '#9cc4ff', red: '#ff6a4a', reed: '#b0a65c', reed2: '#857d42',
  ui0: '#241b21', ui1: '#4b3d45', ui2: '#150f13', ui3: '#3a2e35', good: '#9be07a',
  shade: 'rgba(72,44,104,0.32)', shadeL: 'rgba(72,44,104,0.2)',
};

const ORACLE_M = {
  conc: { t: ORACLE_C.c1, hi: ORACLE_C.c0, sh: ORACLE_C.c2, f: ORACLE_C.c3, fl: ORACLE_C.c4, seam: ORACLE_C.c4 },
  concD: { t: ORACLE_C.c2, hi: ORACLE_C.c1, sh: ORACLE_C.c3, f: ORACLE_C.c4, fl: ORACLE_C.c5, seam: ORACLE_C.c5 },
  dark: { t: ORACLE_C.s3, hi: ORACLE_C.s2, sh: ORACLE_C.s4, f: ORACLE_C.s4, fl: ORACLE_C.ink2, seam: ORACLE_C.ink2 },
  steel: { t: ORACLE_C.s1, hi: ORACLE_C.s0, sh: ORACLE_C.s2, f: ORACLE_C.s2, fl: ORACLE_C.s3, seam: ORACLE_C.s3 },
  wood: { t: ORACLE_C.e1, hi: ORACLE_C.e0, sh: ORACLE_C.e2, f: ORACLE_C.e2, fl: ORACLE_C.e3, seam: ORACLE_C.e3 },
};
const ORACLE_STONE = { t: ORACLE_C.st1, hi: ORACLE_C.st0, sh: ORACLE_C.st2, f: ORACLE_C.st2, fl: ORACLE_C.st3, seam: ORACLE_C.st3 };
const ORACLE_STONE_F = [ORACLE_C.st1, ORACLE_C.st2, ORACLE_C.st3, '#7d6b5e', ORACLE_C.st4];
const ORACLE_GLASS = { t: ORACLE_C.qz2, hi: ORACLE_C.qz1, sh: ORACLE_C.qz3, f: ORACLE_C.qz3, fl: ORACLE_C.qz4, seam: ORACLE_C.qz4 };
const ORACLE_PANEL = '#4b5466', ORACLE_PANEL2 = '#6b7588';

function oracleRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function oracleHash(x: number, y: number, s: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 982451653)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function oracleVnoise(x: number, y: number, s: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const sm = (t: number): number => t * t * (3 - 2 * t);
  const a = oracleHash(xi, yi, s), b = oracleHash(xi + 1, yi, s), c = oracleHash(xi, yi + 1, s), d = oracleHash(xi + 1, yi + 1, s);
  const u = sm(xf), v = sm(yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const oracleSm = (u: number): number => u * u * (3 - 2 * u);
const ORACLE_EASE = { io: oracleSm, out: (u: number): number => 1 - (1 - u) ** 3, back: (u: number): number => 1 + 2.9 * (u - 1) ** 3 + 1.9 * (u - 1) ** 2 };

function oraclePen(x: CanvasRenderingContext2D): Pen {
  const r = (a: number, b: number, w: number, h: number, col: string): void => {
    a = Math.round(a); b = Math.round(b); w = Math.round(w); h = Math.round(h);
    if (w <= 0 || h <= 0) return;
    x.fillStyle = col; x.fillRect(a, b, w, h);
  };
  const p = (a: number, b: number, col: string): void => r(a, b, 1, 1, col);
  const line = (x0: number, y0: number, x1: number, y1: number, col: string, th = 1): void => {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let e = dx + dy;
    for (let g = 0; g < 800; g++) {
      r(x0, y0, th, th, col);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * e;
      if (e2 >= dy) { e += dy; x0 += sx; }
      if (e2 <= dx) { e += dx; y0 += sy; }
    }
  };
  const ell = (cx: number, cy: number, rx: number, ry: number, col: string): void => {
    for (let yy = Math.floor(cy - ry); yy < Math.ceil(cy + ry); yy++) {
      const dy = (yy + 0.5 - cy) / ry;
      if (Math.abs(dy) > 1) continue;
      const hw = rx * Math.sqrt(1 - dy * dy), a = Math.round(cx - hw), b = Math.round(cx + hw);
      if (b > a) { x.fillStyle = col; x.fillRect(a, yy, b - a, 1); }
    }
  };
  const disc = (cx: number, cy: number, rad: number, col: string): void => ell(cx, cy, rad, rad, col);
  return { r, p, line, ell, disc };
}
function oracleStroke(P: Pen, x0: number, y0: number, x1: number, y1: number, r: number, col: string): void {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2));
  for (let i = 0; i <= n; i++) { const t = i / n; P.disc(Math.round(x0 + (x1 - x0) * t) + 0.5, Math.round(y0 + (y1 - y0) * t) + 0.5, r, col); }
}
function oracleEdges(P: Pen, x0: number, y0: number, x1: number, y1: number, hi: string, lo: string): void {
  const dx = x1 - x0, dy = y1 - y0, d = Math.hypot(dx, dy) || 1;
  let nx = dy / d, ny = -dx / d;
  if (ny > 0) { nx = -nx; ny = -ny; }
  P.line(Math.round(x0 + nx), Math.round(y0 + ny), Math.round(x1 + nx), Math.round(y1 + ny), hi);
  P.line(Math.round(x0 - nx), Math.round(y0 - ny), Math.round(x1 - nx), Math.round(y1 - ny), lo);
}
function oracleBox(P: Pen, x: number, y: number, w: number, d: number, h: number, m: typeof ORACLE_M.conc, tex = true): void {
  P.r(x, y, w, d, m.t); P.r(x, y, w, 1, m.hi); P.r(x, y, 1, d, m.hi); P.r(x + w - 1, y + 1, 1, d - 1, m.sh);
  if (tex && w >= 16 && d >= 10) {
    for (let j = y + 8; j < y + d - 1; j += 8) P.r(x + 1, j, w - 2, 1, m.sh);
    for (let j = y + 1, row = 0; j < y + d - 1; j += 8, row++) for (let i = x + 8 + (row % 2) * 8; i < x + w - 2; i += 16) P.r(i, j, 1, Math.min(7, y + d - 1 - j), m.sh);
    const r = oracleRng(x * 31 + y * 7 + w);
    for (let k = 0; k < w * d / 60; k++) P.p(x + 2 + Math.floor(r() * (w - 4)), y + 2 + Math.floor(r() * (d - 4)), r() < 0.6 ? m.sh : m.hi);
  }
  if (h <= 0) return;
  P.r(x, y + d, w, h, m.f); P.r(x, y + d, w, 1, m.sh); P.r(x + w - 1, y + d, 1, h, m.fl); P.r(x, y + d + h - 1, w, 1, m.fl);
  if (tex && h >= 6) for (let i = x + 12; i < x + w - 4; i += 12) P.r(i, y + d + 2, 1, h - 3, m.seam);
  if (tex && h >= 9) for (let i = x + 6; i < x + w - 4; i += 12) { P.p(i, y + d + 3, m.seam); P.p(i, y + d + h - 4, m.seam); }
  if (tex && h >= 8) { const r = oracleRng(x + y * 3); for (let i = x + 3; i < x + w - 3; i += 5 + Math.floor(r() * 7)) P.r(i, y + d + 1, 1, 2 + Math.floor(r() * Math.min(5, h - 3)), m.seam); }
}
function oracleCyl(P: Pen, cx: number, top: number, rad: number, h: number, m: typeof ORACLE_M.conc): void {
  const ry = Math.max(1, Math.round(rad * 0.45)), lw = Math.max(1, Math.round(rad * 0.45)), rw = Math.max(1, Math.round(rad * 0.5));
  P.ell(cx, top + h, rad, ry, m.fl); P.r(cx - rad, top, rad * 2, h, m.f); P.r(cx - rad, top, lw, h, m.t); P.r(cx - rad + 1, top, 1, h, m.hi);
  P.r(cx + rad - rw, top, rw, h, m.fl); P.ell(cx, top, rad, ry, m.sh); P.ell(cx, top - 0.5, Math.max(1, rad - 1), Math.max(1, ry - 1), m.t);
}
function oracleChev(P: Pen, cx: number, cy: number, dir: number, col: string): void {
  for (const [a, b] of [[-1, -2], [0, -1], [1, 0], [0, 1], [-1, 2], [-2, -2], [-1, -1], [0, 0], [-1, 1], [-2, 2]]) {
    let x = a, y = b;
    for (let k = 0; k < dir; k++) [x, y] = [-y, x];
    P.p(cx + x, cy + y, col);
  }
}
function oracleMoss(P: Pen, x: number, y: number, w: number, h: number, seed: number, n: number): void {
  const r = oracleRng(seed);
  for (let k = 0; k < n; k++) { const a = x + Math.floor(r() * w), b = y + Math.floor(r() * h); P.p(a, b, ORACLE_C.m4); if (r() < 0.6) P.p(a + 1, b, r() < 0.5 ? ORACLE_C.m3 : ORACLE_C.m4); if (r() < 0.3) P.p(a, b - 1, ORACLE_C.m2); }
}
function oracleCourses(P: Pen, x: number, y: number, w: number, h: number, seed: number, pal: readonly string[] = [ORACLE_C.st0, ORACLE_C.st1, ORACLE_C.st2, '#a8977f', ORACLE_C.st3]): void {
  const r = oracleRng(seed), [hi, a1, a2, a3, jt] = pal;
  for (let j = 0; j < h; j += 4) {
    const hh = Math.min(4, h - j);
    let i = -Math.floor(r() * 6);
    while (i < w) {
      const bw = 5 + Math.floor(r() * 6), a = Math.max(0, i), b = Math.min(w, i + bw);
      if (b > a) { const tn = r(); P.r(x + a, y + j, b - a, hh, tn < 0.3 ? a1 : tn < 0.8 ? a2 : a3); P.r(x + a, y + j, b - a, 1, tn < 0.3 ? hi : a1); P.r(x + b - 1, y + j, 1, hh, jt); if (hh === 4) P.r(x + a, y + j + 3, b - a, 1, jt); }
      i += bw;
    }
  }
}
function oracleCrate(P: Pen, x: number, y: number, w: number, d: number, h: number): void {
  oracleBox(P, x, y, w, d, h, ORACLE_M.wood, false);
  for (let i = x + 4; i < x + w - 2; i += 5) P.r(i, y + 1, 1, d - 1, ORACLE_C.e2);
  P.r(x, y + d + Math.floor(h / 2), w, 1, ORACLE_C.e3); P.line(x + 1, y + d + h - 2, x + w - 2, y + d + 1, ORACLE_C.e3);
  for (const [a, b] of [[x, y + d], [x + w - 2, y + d], [x, y + d + h - 2], [x + w - 2, y + d + h - 2]]) { P.r(a, b, 2, 2, ORACLE_C.s3); P.p(a, b, ORACLE_C.s1); }
}
function oracleLogEnds(P: Pen, pts: readonly (readonly [number, number])[]): void {
  for (const [x, y] of pts) { P.disc(x, y, 3, ORACLE_C.e3); P.disc(x, y, 2.2, ORACLE_C.e1); P.p(x, y, ORACLE_C.e3); P.p(x - 1, y - 1, ORACLE_C.e0); }
}

// =====================================================================================
// Le faux contexte et la comparaison
// =====================================================================================
type Call = ['style', string] | ['rect', number, number, number, number];

/** Un contexte 2D minimal qui note les appels dans l'ordre. */
function recorder(): { ctx: CanvasRenderingContext2D; calls: Call[] } {
  const calls: Call[] = [];
  let style = '';
  const ctx = {
    get fillStyle(): string { return style; },
    set fillStyle(v: string) { style = v; calls.push(['style', v]); },
    fillRect(x: number, y: number, w: number, h: number): void { calls.push(['rect', x, y, w, h]); },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

/** Compare les appels du portage à ceux de l'oracle pour un même dessin. */
function same(name: string, portable: (P: Pen) => void, oracle: (P: Pen) => void): void {
  it(name, () => {
    const mine = recorder(), reference = recorder();
    portable(pen(mine.ctx));
    oracle(oraclePen(reference.ctx));
    expect(mine.calls.length).toBeGreaterThan(0);
    expect(mine.calls).toEqual(reference.calls);
  });
}

describe('palette et matières', () => {
  it('la palette, les matières et les teintes sont identiques à la maquette', () => {
    expect(C).toEqual(ORACLE_C);
    expect(M).toEqual(ORACLE_M);
    expect(STONE).toEqual(ORACLE_STONE);
    expect(STONE_F).toEqual(ORACLE_STONE_F);
    expect(GLASS).toEqual(ORACLE_GLASS);
    expect(PANEL).toBe(ORACLE_PANEL);
    expect(PANEL2).toBe(ORACLE_PANEL2);
  });
});

describe('bruit et courbes', () => {
  it('rng donne 1000 valeurs identiques', () => {
    const a = rng(987654321), b = oracleRng(987654321);
    for (let i = 0; i < 1000; i++) expect(a()).toBe(b());
  });

  it('hash donne 1000 valeurs identiques', () => {
    for (let i = 0; i < 1000; i++) expect(hash(i * 31 - 700, i * 17 - 400, i % 13)).toBe(oracleHash(i * 31 - 700, i * 17 - 400, i % 13));
  });

  it('vnoise donne 1000 valeurs identiques', () => {
    for (let i = 0; i < 1000; i++) expect(vnoise(i * 0.37 - 12, i * 0.23 - 7, 5)).toBe(oracleVnoise(i * 0.37 - 12, i * 0.23 - 7, 5));
  });

  it('sm, bump, EASE et les couleurs sont identiques', () => {
    expect(smooth(0.37)).toBe(oracleSm(0.37));
    expect(bump(0.37)).toBe(Math.max(0, Math.sin(Math.PI * Math.min(1, Math.max(0, 0.37)))));
    for (const u of [0, 0.25, 0.5, 0.75, 1]) {
      for (const key of ['io', 'out', 'back'] as const) expect(EASE[key](u)).toBe(ORACLE_EASE[key](u));
    }
    expect(hexToRgb('#48286a')).toEqual([72, 40, 106]);
    expect(rgba('#48286a', 0.28)).toBe('rgba(72,40,106,0.28)');
  });
});

describe('primitives du crayon', () => {
  same('r et p à coordonnées fractionnaires', (P) => {
    P.r(1.4, 2.5, 7.6, 3.5, C.c1); P.r(-1.6, 4.2, 0.4, 5, C.o2); P.p(3.5, 9.5, C.ink); P.p(-0.5, 0.5, C.white);
  }, (P) => {
    P.r(1.4, 2.5, 7.6, 3.5, C.c1); P.r(-1.6, 4.2, 0.4, 5, C.o2); P.p(3.5, 9.5, C.ink); P.p(-0.5, 0.5, C.white);
  });

  for (const th of [1, 2, 3]) {
    same(`line épaisseur ${th}, horizontale, verticale, diagonale`, (P) => {
      P.line(0.4, 5.6, 20.5, 5.4, C.s1, th);
      P.line(10.2, 0.5, 10.4, 18.7, C.s2, th);
      P.line(1.5, 1.5, 19.5, 12.5, C.o1, th);
      P.line(21.4, 17.5, 3.6, 8.5, C.g2, th);
    }, (P) => {
      P.line(0.4, 5.6, 20.5, 5.4, C.s1, th);
      P.line(10.2, 0.5, 10.4, 18.7, C.s2, th);
      P.line(1.5, 1.5, 19.5, 12.5, C.o1, th);
      P.line(21.4, 17.5, 3.6, 8.5, C.g2, th);
    });
  }

  same('ell et disc à coordonnées fractionnaires', (P) => {
    P.ell(20.5, 12.5, 7.5, 4.5, C.q3); P.ell(9.25, 8.75, 3.2, 6.8, C.e2); P.disc(17.4, 6.6, 5.5, C.o2); P.disc(3.5, 3.5, 1.2, C.ink);
  }, (P) => {
    P.ell(20.5, 12.5, 7.5, 4.5, C.q3); P.ell(9.25, 8.75, 3.2, 6.8, C.e2); P.disc(17.4, 6.6, 5.5, C.o2); P.disc(3.5, 3.5, 1.2, C.ink);
  });
});

describe('traits et liserés', () => {
  const dirs: readonly (readonly [number, number, number, number])[] = [
    [2, 18, 26, 4], [4, 4, 24, 16], [24, 3, 3, 20], [6, 20, 20, 20], [26, 2, 26, 20],
  ];
  dirs.forEach(([x0, y0, x1, y1], i) => {
    same(`stroke et edges, direction ${i + 1}`, (P) => {
      stroke(P, x0, y0, x1, y1, 2.5, C.ink);
      edges(P, x0, y0, x1, y1, C.s1, C.s3);
    }, (P) => {
      oracleStroke(P, x0, y0, x1, y1, 2.5, C.ink);
      oracleEdges(P, x0, y0, x1, y1, C.s1, C.s3);
    });
  });
});

describe('volumes', () => {
  for (const [key, m] of Object.entries(M)) {
    for (const tex of [true, false]) {
      same(`box ${key} texturée=${tex}, trois tailles`, (P) => {
        box(P, 2, 3, 40, 24, 16, m, tex);
        box(P, 50, 4, 18, 12, 7, m, tex);
        box(P, 74, 6, 21, 11, 0, m, tex);
      }, (P) => {
        oracleBox(P, 2, 3, 40, 24, 16, ORACLE_M[key as keyof typeof ORACLE_M], tex);
        oracleBox(P, 50, 4, 18, 12, 7, ORACLE_M[key as keyof typeof ORACLE_M], tex);
        oracleBox(P, 74, 6, 21, 11, 0, ORACLE_M[key as keyof typeof ORACLE_M], tex);
      });
    }
  }

  same('cyl, trois tailles', (P) => {
    cyl(P, 14.5, 4, 9, 18, M.steel);
    cyl(P, 38.5, 2.5, 5, 6, M.wood);
    cyl(P, 56.5, 8, 3.5, 0.5, M.conc);
  }, (P) => {
    oracleCyl(P, 14.5, 4, 9, 18, ORACLE_M.steel);
    oracleCyl(P, 38.5, 2.5, 5, 6, ORACLE_M.wood);
    oracleCyl(P, 56.5, 8, 3.5, 0.5, ORACLE_M.conc);
  });

  same('chev dans les quatre directions', (P) => {
    for (let d = 0; d < 4; d++) chev(P, 8 + d * 8, 6 + d * 3, d, C.o2);
  }, (P) => {
    for (let d = 0; d < 4; d++) oracleChev(P, 8 + d * 8, 6 + d * 3, d, C.o2);
  });

  same('moss', (P) => {
    moss(P, 3, 4, 30, 18, 77, 40);
    moss(P, 40, 2, 12, 9, 5, 0);
  }, (P) => {
    oracleMoss(P, 3, 4, 30, 18, 77, 40);
    oracleMoss(P, 40, 2, 12, 9, 5, 0);
  });

  same('courses, palette par défaut', (P) => {
    courses(P, 2, 3, 42, 21, 31);
  }, (P) => {
    oracleCourses(P, 2, 3, 42, 21, 31);
  });

  same('courses, palette STONE_F', (P) => {
    courses(P, 5, 1, 30, 13, 12, STONE_F);
  }, (P) => {
    oracleCourses(P, 5, 1, 30, 13, 12, ORACLE_STONE_F);
  });

  same('crate', (P) => {
    crate(P, 4, 3, 20, 12, 8);
    crate(P, 30, 2, 9, 7, 0);
  }, (P) => {
    oracleCrate(P, 4, 3, 20, 12, 8);
    oracleCrate(P, 30, 2, 9, 7, 0);
  });

  same('logEnds', (P) => {
    logEnds(P, [[6, 7], [18.5, 9.5], [3, 17]]);
  }, (P) => {
    oracleLogEnds(P, [[6, 7], [18.5, 9.5], [3, 17]]);
  });
});
