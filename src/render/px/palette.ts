/**
 * La palette du rendu pixel : des couleurs nommées, les matières et les teintes de pierre.
 * Les clés et les valeurs sont celles de la maquette `docs/maquettes/heure-doree.html`.
 */

/** Les couleurs nommées de la maquette, telles quelles. */
export const C = {
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
  // les minerais : des teintes de roche, pas des bonbons
  ir0: '#c9a08c', ir1: '#9c6450', ir2: '#764a3c', ir3: '#53352e', irm: '#dcd8d0', irk: '#4f4040',
  ma0: '#c3d9c4', ma1: '#93b8a0', ma2: '#6a927c', ma3: '#4b6e5c', az: '#6f86ad', az2: '#9eb0cc',
  qz0: '#fbf8f0', qz1: '#e9e6de', qz2: '#cfd2cd', qz3: '#a7aeac', qz4: '#7f8789',
  ch0: '#6a6270', ch1: '#433c49', ch2: '#2a242f', chs: '#b2a6e6',
  pink: '#ff9fbf', pink2: '#e46a93', white: '#fffbf0', blue: '#9cc4ff', red: '#ff6a4a', reed: '#b0a65c', reed2: '#857d42',
  ui0: '#241b21', ui1: '#4b3d45', ui2: '#150f13', ui3: '#3a2e35', good: '#9be07a',
  shade: 'rgba(72,44,104,0.32)', shadeL: 'rgba(72,44,104,0.2)',
} as const;

/** Une couleur de la palette, sous forme `#rrggbb` ou `rgba(...)`. */
export type Color = string;

/** Les six teintes d'une matière : dessus, arête claire, ombre, face sud, face ombrée, joint. */
export interface Material {
  t: Color;
  hi: Color;
  sh: Color;
  f: Color;
  fl: Color;
  seam: Color;
}

/** Les matières du jeu : béton, béton sombre, acier noirci, acier, bois. */
export const M: Record<'conc' | 'concD' | 'dark' | 'steel' | 'wood', Material> = {
  conc: { t: C.c1, hi: C.c0, sh: C.c2, f: C.c3, fl: C.c4, seam: C.c4 },
  concD: { t: C.c2, hi: C.c1, sh: C.c3, f: C.c4, fl: C.c5, seam: C.c5 },
  dark: { t: C.s3, hi: C.s2, sh: C.s4, f: C.s4, fl: C.ink2, seam: C.ink2 },
  steel: { t: C.s1, hi: C.s0, sh: C.s2, f: C.s2, fl: C.s3, seam: C.s3 },
  wood: { t: C.e1, hi: C.e0, sh: C.e2, f: C.e2, fl: C.e3, seam: C.e3 },
};

/** La pierre taillée, vue de dessus puis de face. */
export const STONE: Material = { t: C.st1, hi: C.st0, sh: C.st2, f: C.st2, fl: C.st3, seam: C.st3 };

/** Les pierres d'une face à l'ombre, de la plus claire au joint. */
export const STONE_F: readonly string[] = [C.st1, C.st2, C.st3, '#7d6b5e', C.st4];

/** Le verre dépoli des baies et des cuves. */
export const GLASS: Material = { t: C.qz2, hi: C.qz1, sh: C.qz3, f: C.qz3, fl: C.qz4, seam: C.qz4 };

/** Un panneau solaire, terne. */
export const PANEL = '#4b5466';

/** Le cadre clair d'un panneau solaire. */
export const PANEL2 = '#6b7588';
