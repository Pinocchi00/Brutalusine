/**
 * Banc de comparaison pixel : le portage `src/render/px/` contre la maquette, dans le navigateur.
 * Chaque cas dessine la même chose deux fois (maquette dans une iframe cachée, portage) et
 * compte les pixels dont le RGBA diffère. La page est réservée au développement.
 */
import { C, GLASS, M, PANEL, PANEL2, STONE, STONE_F } from '../render/px/palette';
import { EASE, bump, hash, rng, smooth, vnoise } from '../render/px/noise';
import { makeSurface } from '../render/px/surface';
import { edges, pen, stroke, type Pen } from '../render/px/pen';
import { finish, fromRows, outline, rim } from '../render/px/finish';
import { box, chev, courses, crate, cyl, logEnds, moss } from '../render/px/volumes';
import { build, castShadow, type Light } from '../render/px/sprite';
import { drawLights } from '../render/px/lights';

/** L'API commune aux deux côtés : la maquette et le portage exposent les mêmes fonctions. */
interface Api {
  C: typeof C;
  M: typeof M;
  STONE: typeof STONE;
  STONE_F: typeof STONE_F;
  GLASS: typeof GLASS;
  PANEL: typeof PANEL;
  PANEL2: typeof PANEL2;
  rng: typeof rng;
  hash: typeof hash;
  vnoise: typeof vnoise;
  bump: typeof bump;
  smooth: typeof smooth;
  EASE: typeof EASE;
  makeSurface: typeof makeSurface;
  pen: typeof pen;
  outline: typeof outline;
  rim: typeof rim;
  finish: typeof finish;
  fromRows: typeof fromRows;
  box: typeof box;
  cyl: typeof cyl;
  chev: typeof chev;
  moss: typeof moss;
  courses: typeof courses;
  crate: typeof crate;
  logEnds: typeof logEnds;
  build: typeof build;
  castShadow: typeof castShadow;
  drawLights: typeof drawLights;
  stroke: typeof stroke;
  edges: typeof edges;
}

/** Ce que la maquette expose réellement : `mk` renvoie un couple et `sm` est le lissage. */
interface MaquetteRaw extends Omit<Api, 'smooth' | 'makeSurface'> {
  sm: typeof smooth;
  mk(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D];
  /** Règle l'horloge globale de la maquette, que son `drawLights` lit. */
  setNow(t: number): void;
  LOG: HTMLCanvasElement;
  CHAR: HTMLCanvasElement;
  OREI: HTMLCanvasElement;
}

interface PixelCase {
  kind: 'pixels';
  name: string;
  w: number;
  h: number;
  /** Écart maximal toléré par canal (0 par défaut : pixels identiques exigés). */
  tolerance?: number;
  draw(api: Api, ctx: CanvasRenderingContext2D): void;
  reference?(ref: { api: Api; raw: MaquetteRaw }, ctx: CanvasRenderingContext2D): void;
}

interface ValueCase {
  kind: 'values';
  name: string;
  compare(reference: Api, port: Api): { diff: number; total: number };
}

type BenchCase = PixelCase | ValueCase;

interface BenchResult {
  name: string;
  diff: number;
  total: number;
}

declare global {
  interface Window {
    __banc?: { done: boolean; cases: BenchResult[]; ok: boolean };
  }
}

const PORT: Api = {
  C, M, STONE, STONE_F, GLASS, PANEL, PANEL2,
  rng, hash, vnoise, bump, smooth, EASE,
  makeSurface, pen, outline, rim, finish, fromRows,
  box, cyl, chev, moss, courses, crate, logEnds,
  build, castShadow, drawLights, stroke, edges,
};

/** Adapte l'objet de la maquette à l'API commune. */
function adapt(raw: MaquetteRaw): Api {
  const api: Api = {
    C: raw.C, M: raw.M, STONE: raw.STONE, STONE_F: raw.STONE_F, GLASS: raw.GLASS, PANEL: raw.PANEL, PANEL2: raw.PANEL2,
    rng: raw.rng, hash: raw.hash, vnoise: raw.vnoise, bump: raw.bump, smooth: raw.sm, EASE: raw.EASE,
    makeSurface: (w, h) => {
      const [canvas, ctx] = raw.mk(w, h);
      return { canvas, ctx };
    },
    pen: raw.pen, outline: raw.outline, rim: raw.rim, finish: raw.finish, fromRows: raw.fromRows,
    box: raw.box, cyl: raw.cyl, chev: raw.chev, moss: raw.moss, courses: raw.courses, crate: raw.crate, logEnds: raw.logEnds,
    build: raw.build, castShadow: raw.castShadow, drawLights: raw.drawLights, stroke: raw.stroke, edges: raw.edges,
  };
  return api;
}

const LOG_ROWS = ['..........', '.a11111112', 'abc2222223', 'ab22222223', 'abc2223333', '.a33333333'] as const;
const LOG_PAL = { a: C.e0, b: C.e1, c: C.e2, 1: C.e1, 2: C.e2, 3: C.e3 } as const;
const CHAR_ROWS = ['..aa1....', '.a1112...', '.1s12233.', '122223333', '.2223334.', '..33344..'] as const;
const CHAR_PAL = { a: C.st1, 1: C.ch0, 2: C.ch1, 3: C.ch2, 4: '#141117', s: C.chs } as const;
const OREI_ROWS = ['...0011...', '..011122..', '.01k2m223.', '0112k23333', '.12222333.', '..22333...'] as const;
const OREI_PAL = { 0: '#dcc6b6', 1: '#ae9282', 2: '#866c60', 3: '#5f4b45', m: C.irm, k: C.ir1 } as const;

const BUILD_W = 44, BUILD_H = 42, BUILD_UP = 20;

/** Le petit bâtiment de test : une caisse de béton, une cheminée d'acier, des assises de pierre. */
function building(api: Api) {
  return api.build(BUILD_W, BUILD_H, BUILD_UP, (P, up, lights) => {
    api.box(P, 4, up + 8, 32, 14, 10, api.M.conc);
    api.cyl(P, 32, up + 4, 6, 18, api.M.steel);
    api.courses(P, 4, up + 32, 32, 8, 21);
    lights.push({ k: 'win', x: 10, y: up + 12, w: 4, h: 3 });
  });
}

/** Une silhouette brute pour éprouver le contour et le liseré. */
function silhouette(api: Api): HTMLCanvasElement {
  const { canvas, ctx } = api.makeSurface(20, 16);
  const P = api.pen(ctx);
  P.ell(9.5, 8.5, 6.5, 5.2, C.c1);
  P.r(3, 9, 14, 4, C.c2);
  P.disc(15, 5, 3, C.o2);
  return canvas;
}

/** Compte les valeurs différentes entre deux suites de 1000 tirages. */
function countValues(getReference: (i: number) => number, getPort: (i: number) => number, total = 1000): { diff: number; total: number } {
  let diff = 0;
  for (let i = 0; i < total; i++) if (getReference(i) !== getPort(i)) diff++;
  return { diff, total };
}

const CASES: BenchCase[] = [];

// --- le crayon -------------------------------------------------------------------------
const pencil = (P: Pen): void => {
  P.r(1.4, 2.5, 7.6, 3.5, C.c1); P.r(-1.6, 4.2, 0.4, 5, C.o2); P.p(3.5, 9.5, C.ink); P.p(9.2, 12.7, C.white);
  P.r(12.2, 3.5, 4.4, 7.6, C.g2);
};
CASES.push({ kind: 'pixels', name: 'crayon · r et p fractionnaires', w: 24, h: 16, draw: (api, ctx) => pencil(api.pen(ctx)) });

const lines = (P: Pen): void => {
  P.line(0.4, 5.6, 20.5, 5.4, C.s1, 1);
  P.line(10.2, 0.5, 10.4, 18.7, C.s2, 2);
  P.line(1.5, 1.5, 19.5, 12.5, C.o1, 3);
  P.line(21.4, 17.5, 3.6, 8.5, C.g2, 1);
};
CASES.push({ kind: 'pixels', name: 'crayon · line 1, 2, 3 en diagonale', w: 24, h: 20, draw: (api, ctx) => lines(api.pen(ctx)) });

const ellipses = (P: Pen): void => {
  P.ell(20.5, 12.5, 7.5, 4.5, C.q3); P.ell(9.25, 8.75, 3.2, 6.8, C.e2);
  P.disc(17.4, 6.6, 5.5, C.o2); P.disc(3.5, 3.5, 1.2, C.ink);
};
CASES.push({ kind: 'pixels', name: 'crayon · ell et disc fractionnaires', w: 30, h: 22, draw: (api, ctx) => ellipses(api.pen(ctx)) });

const strokes = (api: Api, P: Pen): void => {
  for (const [x0, y0, x1, y1] of [[4, 30, 34, 4], [6, 6, 32, 26], [34, 2, 2, 30]]) {
    api.stroke(P, x0, y0, x1, y1, 2.5, C.ink);
    api.edges(P, x0, y0, x1, y1, C.s1, C.s3);
  }
};
CASES.push({ kind: 'pixels', name: 'stroke et edges, trois directions', w: 38, h: 34, draw: (api, ctx) => strokes(api, api.pen(ctx)) });

// --- les finitions ---------------------------------------------------------------------
CASES.push({
  kind: 'pixels', name: 'outline sur une silhouette', w: 22, h: 18,
  draw: (api, ctx) => ctx.drawImage(api.outline(silhouette(api), C.ink), 0, 0),
});
CASES.push({
  kind: 'pixels', name: 'rim sur une silhouette', w: 20, h: 16,
  draw: (api, ctx) => ctx.drawImage(api.rim(silhouette(api), C.o1), 0, 0),
});
CASES.push({
  kind: 'pixels', name: 'finish sur une silhouette', w: 22, h: 18,
  draw: (api, ctx) => ctx.drawImage(api.finish(silhouette(api)), 0, 0),
});

// --- les volumes -----------------------------------------------------------------------
for (const key of Object.keys(M) as (keyof typeof M)[]) {
  for (const textured of [true, false]) {
    CASES.push({
      kind: 'pixels',
      name: `box · ${key} · ${textured ? 'texturé' : 'nu'} · trois tailles`,
      w: 100, h: 50,
      draw: (api, ctx) => {
        const P = api.pen(ctx);
        api.box(P, 2, 3, 40, 24, 16, api.M[key], textured);
        api.box(P, 50, 4, 18, 12, 7, api.M[key], textured);
        api.box(P, 74, 6, 21, 11, 0, api.M[key], textured);
      },
    });
  }
}

CASES.push({
  kind: 'pixels', name: 'cyl · trois tailles', w: 80, h: 40,
  draw: (api, ctx) => {
    const P = api.pen(ctx);
    api.cyl(P, 14.5, 4, 9, 18, api.M.steel);
    api.cyl(P, 38.5, 2.5, 5, 6, api.M.wood);
    api.cyl(P, 56.5, 8, 3.5, 0.5, api.M.conc);
  },
});

CASES.push({
  kind: 'pixels', name: 'chev · quatre directions', w: 60, h: 30,
  draw: (api, ctx) => {
    const P = api.pen(ctx);
    for (let d = 0; d < 4; d++) api.chev(P, 8 + d * 12, 8 + d * 4, d, C.o2);
  },
});

CASES.push({
  kind: 'pixels', name: 'moss', w: 60, h: 30,
  draw: (api, ctx) => {
    const P = api.pen(ctx);
    api.moss(P, 3, 4, 30, 18, 77, 40);
    api.moss(P, 40, 2, 12, 9, 5, 0);
  },
});

CASES.push({
  kind: 'pixels', name: 'courses · palette par défaut', w: 60, h: 30,
  draw: (api, ctx) => api.courses(api.pen(ctx), 2, 3, 42, 21, 31),
});

CASES.push({
  kind: 'pixels', name: 'courses · STONE_F', w: 60, h: 30,
  draw: (api, ctx) => api.courses(api.pen(ctx), 5, 1, 30, 13, 12, api.STONE_F),
});

CASES.push({
  kind: 'pixels', name: 'crate', w: 60, h: 30,
  draw: (api, ctx) => {
    const P = api.pen(ctx);
    api.crate(P, 4, 3, 20, 12, 8);
    api.crate(P, 30, 2, 9, 7, 0);
  },
});

CASES.push({
  kind: 'pixels', name: 'logEnds', w: 30, h: 24,
  draw: (api, ctx) => api.logEnds(api.pen(ctx), [[6, 7], [18.5, 9.5], [3, 17]]),
});

// --- les objets venus des lignes de caractères -----------------------------------------
for (const [name, rows, pal, spriteWidth, spriteHeight] of [
  ['LOG', LOG_ROWS, LOG_PAL, LOG_ROWS[0].length + 2, LOG_ROWS.length + 2],
  ['CHAR', CHAR_ROWS, CHAR_PAL, CHAR_ROWS[0].length + 2, CHAR_ROWS.length + 2],
  ['OREI', OREI_ROWS, OREI_PAL, OREI_ROWS[0].length + 2, OREI_ROWS.length + 2],
] as const) {
  CASES.push({
    kind: 'pixels', name: `fromRows · ${name} contre le sprite exposé`, w: spriteWidth, h: spriteHeight,
    reference: (ref, ctx) => ctx.drawImage(ref.raw[name], 0, 0),
    draw: (api, ctx) => ctx.drawImage(api.fromRows(rows, pal), 0, 0),
  });
}

// --- le bâtiment de test ---------------------------------------------------------------
CASES.push({
  kind: 'pixels', name: 'build · image', w: 46, h: 64,
  draw: (api, ctx) => ctx.drawImage(building(api).img, 0, 0),
});
CASES.push({
  kind: 'pixels', name: 'build · silhouette d’ombre', w: 46, h: 64,
  draw: (api, ctx) => ctx.drawImage(building(api).shadow, 0, 0),
});

// --- les lumières animées ---------------------------------------------------------------
const LIGHT_CELL = 24, LIGHT_HEIGHT = 36;

// Les instants du fanal tombent juste sur les bornes de ses deux battements : c = 0, 0,35, 0,45 et 0,8.
const BEAT_INSTANTS: readonly number[] = [0, 0.175, 0.35, 0.45, 0.625, 0.8, 1.25, 2, 3, 4.35, 4.45, 4.8];

/** Les instants d'un feu : juste à l'allumage, juste à l'extinction, juste avant et en plein repos. */
function blinkInstants(per: number): number[] {
  const instants: number[] = [];
  for (let k = 0; k < 3; k++) {
    instants.push(per * k, per * k + 0.35, per * k + 0.9, per * k + 0.35 - 1e-9);
  }
  return instants;
}

// Les autres lumières : douze instants variés, dont les bornes du fanal.
const LIGHT_INSTANTS: readonly number[] = [0, 0.13, 0.35, 0.45, 0.8, 1.1, 1.75, 2.5, 3.2, 4, 5.7, 7.3];

interface LightCase {
  label: string;
  lights: Light[];
  instants: readonly number[];
}

const LIGHT_CASES: readonly LightCase[] = [
  { label: 'beat · défaut', lights: [{ k: 'beat', x: 8, y: 20 }], instants: BEAT_INSTANTS },
  { label: 'beat · rayon', lights: [{ k: 'beat', x: 8, y: 20, r: 4 }], instants: BEAT_INSTANTS },
  { label: 'beat · phase', lights: [{ k: 'beat', x: 8, y: 20, ph: 0.7 }], instants: BEAT_INSTANTS },
  { label: 'lens · défaut', lights: [{ k: 'lens', x: 8, y: 20 }], instants: LIGHT_INSTANTS },
  { label: 'lens · rayon', lights: [{ k: 'lens', x: 8, y: 20, r: 4 }], instants: LIGHT_INSTANTS },
  { label: 'lens · phase', lights: [{ k: 'lens', x: 8, y: 20, ph: 1.1 }], instants: LIGHT_INSTANTS },
  { label: 'win · défaut', lights: [{ k: 'win', x: 6, y: 16, w: 7, h: 5 }], instants: LIGHT_INSTANTS },
  { label: 'win · période', lights: [{ k: 'win', x: 6, y: 16, w: 4, h: 2, per: 3 }], instants: LIGHT_INSTANTS },
  { label: 'win · phase', lights: [{ k: 'win', x: 6, y: 16, w: 6, h: 4, ph: 0.9 }], instants: LIGHT_INSTANTS },
  { label: 'blink · défaut', lights: [{ k: 'blink', x: 8, y: 20 }], instants: blinkInstants(2.5) },
  { label: 'blink · période et couleurs', lights: [{ k: 'blink', x: 8, y: 20, per: 1.4, c: C.good, off: C.ink }], instants: blinkInstants(1.4) },
  { label: 'blink · phase', lights: [{ k: 'blink', x: 8, y: 20, ph: 0.8 }], instants: blinkInstants(2.5) },
  { label: 'fire · défaut', lights: [{ k: 'fire', x: 6, y: 20 }], instants: LIGHT_INSTANTS },
  { label: 'fire · largeur', lights: [{ k: 'fire', x: 6, y: 20, w: 7 }], instants: LIGHT_INSTANTS },
  { label: 'fire · phase', lights: [{ k: 'fire', x: 6, y: 20, ph: 1.6 }], instants: LIGHT_INSTANTS },
  { label: 'ember · défaut', lights: [{ k: 'ember', x: 8, y: 20 }], instants: LIGHT_INSTANTS },
  { label: 'ember · largeur et hauteur', lights: [{ k: 'ember', x: 6, y: 18, w: 5, h: 3 }], instants: LIGHT_INSTANTS },
  { label: 'ember · phase', lights: [{ k: 'ember', x: 8, y: 20, ph: 2.2 }], instants: LIGHT_INSTANTS },
];

for (const lightCase of LIGHT_CASES) {
  CASES.push({
    kind: 'pixels',
    name: `drawLights · ${lightCase.label} · ${lightCase.instants.length} instants`,
    w: LIGHT_CELL * lightCase.instants.length,
    h: LIGHT_HEIGHT,
    draw: (api, ctx) => {
      const P = api.pen(ctx);
      lightCase.instants.forEach((t, i) => api.drawLights(P, lightCase.lights, i * LIGHT_CELL + 4, 0, t));
    },
    // La maquette lit son horloge globale : `setNow` la règle, et son `drawLights` ignore le cinquième argument.
    reference: (ref, ctx) => {
      const P = ref.api.pen(ctx);
      lightCase.instants.forEach((t, i) => {
        ref.raw.setNow(t);
        ref.api.drawLights(P, lightCase.lights, i * LIGHT_CELL + 4, 0, t);
      });
    },
  });
}

const SHADOW_X = 16, SHADOW_Y = 12, CAMERA_X = 7, CAMERA_Y = 5;
// La silhouette d'ombre du portage vit sur un canevas normal (accéléré), dessiné en
// semi-transparence avec une transformation : la carte graphique arrondit alors les canaux
// un peu autrement que le canevas willReadFrequently de la maquette (écarts mesurés de 1 à 3).
// On garde le canevas normal pour la fluidité et on tolère ±4 par canal, pour ces deux cas.
const SHADOW_TOLERANCE = 4;

CASES.push({
  kind: 'pixels', name: 'castShadow · ombre portée', w: 160, h: 90, tolerance: SHADOW_TOLERANCE,
  draw: (api, ctx) => api.castShadow(ctx, building(api), SHADOW_X, SHADOW_Y),
});
CASES.push({
  kind: 'pixels', name: 'castShadow · translation préalable', w: 160, h: 90, tolerance: SHADOW_TOLERANCE,
  draw: (api, ctx) => {
    ctx.translate(CAMERA_X, CAMERA_Y);
    api.castShadow(ctx, building(api), SHADOW_X, SHADOW_Y);
  },
  // La maquette emploie setTransform et ignore donc une translation déjà posée : on lui
  // décale X et Y de la caméra pour obtenir la même image, alors que le portage compose
  // cette translation avec sa propre transformation.
  reference: (ref, ctx) => ref.api.castShadow(ctx, building(ref.api), SHADOW_X + CAMERA_X, SHADOW_Y + CAMERA_Y),
});

// --- les valeurs pures -----------------------------------------------------------------
CASES.push({
  kind: 'values', name: 'rng · 1000 valeurs',
  compare: (reference, port) => {
    const a = reference.rng(424242), b = port.rng(424242);
    return countValues(() => a(), () => b());
  },
});
CASES.push({
  kind: 'values', name: 'hash · 1000 valeurs',
  compare: (reference, port) => countValues((i) => reference.hash(i * 31 - 700, i * 17 - 400, i % 13), (i) => port.hash(i * 31 - 700, i * 17 - 400, i % 13)),
});
CASES.push({
  kind: 'values', name: 'vnoise · 1000 valeurs',
  compare: (reference, port) => countValues((i) => reference.vnoise(i * 0.37 - 12, i * 0.23 - 7, 5), (i) => port.vnoise(i * 0.37 - 12, i * 0.23 - 7, 5)),
});
CASES.push({
  kind: 'values', name: 'bump · 1000 valeurs, bornes comprises',
  compare: (reference, port) => countValues((i) => reference.bump(-0.5 + i * 2 / 999), (i) => port.bump(-0.5 + i * 2 / 999)),
});
CASES.push({
  kind: 'values', name: 'EASE · 1000 valeurs',
  compare: (reference, port) => {
    const keys = ['io', 'out', 'back'] as const;
    return countValues((i) => {
      const key = keys[i % 3];
      return reference.EASE[key](i / 999);
    }, (i) => {
      const key = keys[i % 3];
      return port.EASE[key](i / 999);
    });
  },
});

/**
 * Peint une surface et renvoie son canevas.
 * Les deux côtés peignent sur une surface de lecture forcée (calculée par le processeur) :
 * on compare la logique, pas le moteur de rendu. Un canevas accéléré mélange l'alpha 0,28
 * légèrement autrement, ce qui ferait diverger les ombres sans changer leur dessin.
 */
function paint(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const { canvas, ctx } = makeSurface(w, h, { read: true });
  draw(ctx);
  return canvas;
}

/**
 * Carte des différences : magenta pour un pixel hors tolérance, gris sombre sinon.
 * Renvoie aussi le nombre de pixels exactement identiques.
 */
function differenceMap(
  a: HTMLCanvasElement,
  b: HTMLCanvasElement,
  w: number,
  h: number,
  tolerance = 0,
): { canvas: HTMLCanvasElement; diff: number; exact: number } {
  const { canvas, ctx } = makeSurface(w, h, { read: true });
  const da = a.getContext('2d')?.getImageData(0, 0, w, h);
  const db = b.getContext('2d')?.getImageData(0, 0, w, h);
  if (!da || !db) throw new Error('Lecture des pixels impossible');
  const out = ctx.createImageData(w, h);
  let diff = 0, exact = 0;
  for (let i = 0; i < da.data.length; i += 4) {
    let differs = false, outOfTolerance = false;
    for (let channel = 0; channel < 4; channel++) {
      const delta = Math.abs(da.data[i + channel] - db.data[i + channel]);
      if (delta !== 0) differs = true;
      if (delta > tolerance) outOfTolerance = true;
    }
    if (!differs) exact++;
    if (outOfTolerance) {
      diff++;
      out.data[i] = 255; out.data[i + 1] = 0; out.data[i + 2] = 255; out.data[i + 3] = 255;
    } else {
      out.data[i] = 20; out.data[i + 1] = 16; out.data[i + 2] = 22; out.data[i + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  return { canvas, diff, exact };
}

/** Affiche une figure agrandie ×4, sans lissage. */
function figure(label: string, canvas: HTMLCanvasElement, zoom = 4): HTMLElement {
  const boxEl = document.createElement('figure');
  const caption = document.createElement('figcaption');
  caption.textContent = label;
  canvas.style.width = `${canvas.width * zoom}px`;
  canvas.style.height = `${canvas.height * zoom}px`;
  boxEl.append(caption, canvas);
  return boxEl;
}

/** Lance le banc une fois la maquette chargée. */
async function main(): Promise<void> {
  const verdict = document.getElementById('verdict');
  const root = document.getElementById('cases');
  if (!verdict || !root) throw new Error('Page du banc incomplète');

  const frame = document.createElement('iframe');
  frame.src = '/docs/maquettes/heure-doree.html';
  frame.style.display = 'none';
  document.body.appendChild(frame);
  const raw = await waitForMaquette(frame);
  const reference = adapt(raw);

  const results: BenchResult[] = [];
  for (const c of CASES) {
    const section = document.createElement('section');
    section.className = 'case';
    const title = document.createElement('h2');
    title.textContent = c.name;
    section.appendChild(title);

    let result: BenchResult;
    let countText: string;
    if (c.kind === 'pixels') {
      const refCanvas = paint(c.w, c.h, (ctx) => {
        if (c.reference) c.reference({ api: reference, raw }, ctx);
        else c.draw(reference, ctx);
      });
      const portCanvas = paint(c.w, c.h, (ctx) => c.draw(PORT, ctx));
      const tolerance = c.tolerance ?? 0;
      const { canvas: diffCanvas, diff, exact } = differenceMap(refCanvas, portCanvas, c.w, c.h, tolerance);
      result = { name: c.name, diff, total: c.w * c.h };
      countText = `${exact} / ${result.total} exactement identiques · ${diff} hors tolérance${tolerance > 0 ? ` (±${tolerance})` : ''}`;
      const row = document.createElement('div');
      row.className = 'row';
      row.append(figure('Référence', refCanvas), figure('Portage', portCanvas), figure('Différences', diffCanvas));
      section.appendChild(row);
    } else {
      const { diff, total } = c.compare(reference, PORT);
      result = { name: c.name, diff, total };
      countText = `${diff} écart${diff > 1 ? 's' : ''} sur ${total} valeurs`;
      const values = document.createElement('p');
      values.className = 'values';
      values.textContent = countText;
      section.appendChild(values);
    }

    const count = document.createElement('span');
    count.className = 'count';
    count.textContent = countText;
    title.appendChild(count);
    results.push(result);
    root.appendChild(section);
  }

  const diff = results.reduce((sum, r) => sum + r.diff, 0);
  const total = results.reduce((sum, r) => sum + r.total, 0);
  const ok = diff === 0;
  verdict.className = ok ? 'ok' : 'ko';
  verdict.textContent = ok
    ? `OK — 0 écart sur ${total} pixels et valeurs, ${results.length} cas.`
    : `ÉCHEC — ${diff} écarts sur ${total} pixels et valeurs, ${results.length} cas.`;
  window.__banc = { done: true, cases: results, ok };
}

/** Attend que la maquette de l'iframe expose ses internes. */
function waitForMaquette(frame: HTMLIFrameElement): Promise<MaquetteRaw> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = (): void => {
      const win = frame.contentWindow as (Window & { __maquette?: MaquetteRaw }) | null;
      if (win?.__maquette) { resolve(win.__maquette); return; }
      if (Date.now() - started > 15000) { reject(new Error('La maquette n’a pas exposé __maquette')); return; }
      setTimeout(tick, 50);
    };
    tick();
  });
}

main().catch((err: unknown) => {
  const verdict = document.getElementById('verdict');
  if (verdict) {
    verdict.className = 'ko';
    verdict.textContent = `ÉCHEC du banc : ${err instanceof Error ? err.message : String(err)}`;
  }
});
