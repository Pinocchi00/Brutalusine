/**
 * Les affleurements minés : trois blocs de la même pierre, le minerai qui n'affleure que là où
 * la roche casse, une cassure fraîche et des cailloux au pied. Porté de `docs/maquettes/heure-doree.html`.
 *
 * Repères : la maquette dessine sur une surface `w * 3 + 10` par `h * 3 + 14`, puis `finish` ajoute
 * un pixel de contour de chaque côté. Les `marks` de la maquette visent déjà le pixel fini (le fer et
 * le quartz ajoutent `+1`, le cuivre vise la ligne au-dessus de sa veine), ils sont donc repris tels
 * quels. `crack` est le centre du cœur de la cassure, décalé lui aussi du contour.
 */
import { C } from './palette';
import { hash, rng } from './noise';
import { finish } from './finish';
import { makeSurface } from './surface';
import { pen } from './pen';
import type { Pen } from './pen';

/** Le type de roche d'un gisement. */
export type RockKind = 'fe' | 'st' | 'qz' | 'cu';

/** Le nombre de variantes d'un affleurement. */
export const OUTCROP_VARIANTS = 3;

/** Un point du sprite, en pixels, après finition (décalage du contour compris). */
export interface RockMark { x: number; y: number; }

/** Le plan pur d'un affleurement, sans canevas. */
export interface OutcropPlan {
  kind: RockKind;
  width: number;
  height: number;
  foot: number;
  marks: readonly RockMark[];
  crack: RockMark;
}

/** Un affleurement fini. */
export interface OutcropSprite extends OutcropPlan { img: HTMLCanvasElement; }

/** Chaque roche a sa pierre : arête, dessus clair, dessus, face, pied. */
const ROCK: Record<RockKind, readonly [string, string, string, string, string]> = {
  st: [C.st0, C.st1, C.st2, C.st3, C.st4],
  fe: ['#dcc6b6', '#ae9282', '#866c60', '#5f4b45', '#41332f'],
  cu: ['#dedcce', '#b1b0a0', '#888a7a', '#5f6258', '#41443d'],
  qz: ['#efebe2', '#cbc5b9', '#a29c92', '#77716a', '#4f4a45'],
};

/** Les dimensions d'une case d'affleurement selon sa variante. */
const SIZES: readonly { w: number; h: number }[] = [
  { w: 10, h: 7 },
  { w: 12, h: 8 },
  { w: 14, h: 9 },
];

/** L'ordre des types, qui fixe la graine de chaque roche. */
const KIND_ORDER: readonly RockKind[] = ['fe', 'st', 'qz', 'cu'];

/** La graine d'un affleurement : le type et la variante, jamais le hasard. */
function seedOf(kind: RockKind, variant: number): number {
  return KIND_ORDER.indexOf(kind) * 1000 + variant * 37 + 17;
}

/** Ramène une variante dans ses bornes. */
function normalizeVariant(variant: number): number {
  return ((Math.trunc(variant) % OUTCROP_VARIANTS) + OUTCROP_VARIANTS) % OUTCROP_VARIANTS;
}

/** Un rocher en volume : dessus éclairé, face avant dans l'ombre et facettes. */
function boulder(
  P: Pen,
  cx: number,
  cy: number,
  w: number,
  h: number,
  r: () => number,
  pal: readonly [string, string, string, string, string],
  sep: boolean,
): void {
  const [hi, t1, t2, f, ft] = pal;
  const fh = Math.max(3, Math.round(h * 0.9));
  if (sep) {
    P.ell(cx, cy + fh * 0.5, w + 1, h * 0.85 + 1, C.ink);
    P.ell(cx, cy, w + 1, h * 0.8 + 1, C.ink);
  }
  P.ell(cx, cy + fh * 0.5, w, h * 0.85, ft);
  P.r(cx - w + 1, cy, w * 2 - 2, fh * 0.6, f);
  P.ell(cx, cy, w, h * 0.8, f);
  P.ell(cx - 0.6, cy - 1, w * 0.92, h * 0.72, t2);
  P.ell(cx - w * 0.25, cy - h * 0.3, w * 0.55, h * 0.42, t1);
  P.r(cx - w * 0.55, cy - h * 0.5, Math.max(2, w * 0.3), 1, hi);
  P.line(cx - w * 0.2, cy + h * 0.1, cx + w * 0.35, cy - h * 0.25, f);
  for (let k = 0; k < w * 0.6; k++) {
    P.p(cx + (r() - 0.5) * w * 1.4, cy + fh * 0.3 + r() * fh * 0.4, ft);
  }
}

/** Le type de roche d'un gisement : 1 fer, 2 pierre, 3 quartz, 4 cuivre. */
export function rockKind(deposit: 1 | 2 | 3 | 4): RockKind {
  return (['fe', 'st', 'qz', 'cu'] as const)[deposit - 1];
}

/** La variante 0 à OUTCROP_VARIANTS - 1 selon la case et la graine. */
export function outcropVariantAt(tx: number, ty: number, seed: number): number {
  return Math.floor(hash(tx, ty, seed + 213) * OUTCROP_VARIANTS);
}

/** Dessine l'affleurement non fini et rend son plan. Toute la logique de dessin est ici. */
export function paintOutcrop(P: Pen, kind: RockKind, variant: number): OutcropPlan {
  const v = normalizeVariant(variant);
  const { w, h } = SIZES[v];
  const width = w * 3 + 10;
  const height = h * 3 + 14;
  const r = rng(seedOf(kind, v));
  const pal = ROCK[kind];
  const cx = w * 1.5 + 5;
  const cy = h * 1.4 + 6;
  const lumps: readonly (readonly [number, number, number, number])[] = [
    [w * 0.05, -h * 0.25, w * 0.9, h],
    [-w * 0.6, h * 0.35, w * 0.62, h * 0.7],
    [w * 0.62, h * 0.5, w * 0.55, h * 0.62],
  ];

  lumps.forEach(([dx, dy, lw, lh], n) => boulder(P, cx + dx, cy + dy, lw, lh, r, pal, n > 0));

  const marks: RockMark[] = [];
  lumps.forEach(([dx, dy, lw, lh], n) => {
    const bx = Math.round(cx + dx);
    const by = Math.round(cy + dy);
    const fh = Math.max(3, Math.round(lh * 0.9));
    if (kind === 'fe') {
      for (let k = 0; k < Math.max(2, Math.round(lw * 0.3)); k++) {
        const sx = Math.round(bx - lw * 0.75 + r() * lw * 1.5);
        const sy = Math.round(by + lh * 0.25);
        const length = 2 + Math.floor(r() * fh * 0.5);
        P.r(sx, sy, 1, length, C.ir2);
        P.p(sx, sy, C.ir1);
        if (r() < 0.4) P.p(sx + 1, sy + 1, C.ir3);
      }
      P.ell(bx + lw * 0.1, by - lh * 0.2, lw * 0.32, lh * 0.18, C.ir1);
      for (let k = 0; k < 2; k++) {
        const px = Math.round(bx + (r() - 0.5) * lw);
        const py = Math.round(by - lh * 0.3 + r() * lh * 0.3);
        P.p(px, py, C.irm);
        marks.push({ x: px + 1, y: py + 1 });
      }
    } else if (kind === 'cu') {
      let px = bx - lw * 0.7;
      let py = by - lh * 0.1 + r() * lh * 0.3;
      for (let k = 0; k < 4; k++) {
        const nx = px + lw * 0.35;
        const ny = py + (r() - 0.4) * lh * 0.5;
        P.line(px, py, nx, ny, C.ma3);
        P.line(px, py - 1, nx, ny - 1, C.ma2);
        if (k % 2) {
          marks.push({ x: Math.round(nx) + 1, y: Math.round(ny) });
          P.p(nx, ny - 1, C.ma1);
        }
        px = nx;
        py = ny;
      }
      if (n === 0) {
        P.r(bx + lw * 0.35, by + lh * 0.05, 2, 1, C.az);
        P.p(bx + lw * 0.35, by + lh * 0.05 - 1, C.az2);
      }
    } else if (kind === 'st') {
      const strata = n === 0 ? 3 : 2;
      for (let k = 0; k < strata; k++) {
        const y = Math.round(by + lh * (0.3 + k * 0.22));
        P.r(bx - lw * 0.55, y, Math.max(2, lw * 0.7), 1, pal[3]);
      }
      for (let k = 0; k < 3; k++) {
        const px = Math.round(bx + (r() - 0.5) * lw * 1.1);
        const py = Math.round(by - lh * 0.45 + r() * lh * 0.35);
        P.p(px, py, r() < 0.5 ? C.m3 : C.m4);
        if (r() < 0.5) P.p(px + 1, py, r() < 0.5 ? C.m3 : C.m4);
      }
    } else {
      for (let k = 0; k < (n === 0 ? 3 : 2); k++) {
        const ax = Math.round(bx - lw * 0.45 + k * lw * 0.42 + r() * 3);
        const ay = Math.round(by - lh * 0.35 + r() * lh * 0.3);
        const hh = 3 + Math.floor(r() * (n === 0 ? 5 : 3));
        P.r(ax - 1, ay, 4, 1, pal[4]);
        P.r(ax, ay - hh, 2, hh, C.qz2);
        P.r(ax, ay - hh, 1, hh, C.qz0);
        P.p(ax + 1, ay - hh, C.qz1);
        P.p(ax, ay - hh - 1, C.qz0);
        P.p(ax + 1, ay - 1, C.qz3);
        marks.push({ x: ax + 1, y: ay - hh });
      }
    }
  });

  const bx = Math.round(cx + w * 0.15);
  const by = Math.round(cy + h * 0.25);
  const orePix = kind === 'fe' ? C.ir1 : kind === 'cu' ? C.ma2 : kind === 'qz' ? C.qz1 : pal[0];
  const shine = kind === 'cu' ? C.ma1 : kind === 'fe' ? C.ir0 : C.white;
  P.r(bx - 3, by - 1, 7, 4, pal[1]);
  P.r(bx - 2, by - 2, 5, 1, pal[1]);
  P.r(bx - 3, by + 3, 7, 1, pal[3]);
  P.r(bx - 1, by, 3, 2, orePix);
  P.p(bx - 1, by, shine);

  for (let k = 0; k < 5; k++) {
    const px = Math.round(cx - w * 1.1 + r() * w * 2.2);
    const py = Math.round(cy + h * 1.15 + r() * h * 0.3);
    P.r(px, py, 3, 2, pal[3]);
    P.r(px, py, 2, 1, pal[1]);
    if (k === 1) P.p(px + 1, py + 1, orePix);
  }

  return {
    kind,
    width,
    height,
    foot: Math.round(cy + h * 1.15) + 1,
    marks,
    crack: { x: bx + 1, y: by + 1 },
  };
}

/** Le cache des affleurements finis, un par type et variante. */
const SPRITES = new Map<string, OutcropSprite>();

/** L'affleurement fini (`finish`), en cache par type et variante. */
export function outcropSprite(kind: RockKind, variant: number): OutcropSprite {
  const v = normalizeVariant(variant);
  const key = `${kind}:${v}`;
  const cached = SPRITES.get(key);
  if (cached) return cached;
  const { w, h } = SIZES[v];
  const { canvas, ctx } = makeSurface(w * 3 + 10, h * 3 + 14);
  const plan = paintOutcrop(pen(ctx), kind, v);
  const sprite: OutcropSprite = { ...plan, img: finish(canvas) };
  SPRITES.set(key, sprite);
  return sprite;
}

/** L'indice d'un repère, ramené dans les bornes même pour un temps négatif. */
function markIndex(value: number, length: number): number {
  return ((Math.floor(value) % length) + length) % length;
}

/** La vie discrète du minerai, comme la maquette ; (X, Y) est le coin du sprite. */
export function drawOreLive(P: Pen, rock: OutcropPlan, X: number, Y: number, now: number, phase: number): void {
  const marks = rock.marks;
  if (!marks.length) return;
  if (rock.kind === 'fe') {
    const pulse = (now + phase * 1.3) % 3.2;
    if (pulse < 0.4) {
      const mark = marks[markIndex(now / 3.2 + phase, marks.length)];
      P.p(X + mark.x, Y + mark.y, C.white);
      if (pulse > 0.1 && pulse < 0.3) {
        P.p(X + mark.x - 1, Y + mark.y, C.irm);
        P.p(X + mark.x + 1, Y + mark.y, C.irm);
        P.p(X + mark.x, Y + mark.y - 1, C.irm);
      }
    }
  } else if (rock.kind === 'cu') {
    const b = (Math.sin(now * Math.PI * 2 / 8) + 1) / 2;
    if (b > 0.6) {
      for (const mark of marks) P.p(X + mark.x, Y + mark.y, b > 0.9 ? C.ma0 : C.ma1);
    }
  } else if (rock.kind === 'qz') {
    const pulse = now % 2.4;
    if (pulse < 0.45) {
      const mark = marks[markIndex(now / 2.4, marks.length)];
      P.p(X + mark.x, Y + mark.y, C.white);
      if (pulse > 0.1 && pulse < 0.32) {
        P.p(X + mark.x - 1, Y + mark.y, C.qz1);
        P.p(X + mark.x + 1, Y + mark.y, C.qz1);
        P.p(X + mark.x, Y + mark.y - 1, C.qz1);
      }
    }
  }
}

/** Le décalage horizontal d'une roche frappée depuis `since` secondes. */
export function rockShake(since: number): number {
  if (since >= 0.28) return 0;
  return Math.floor(since * 16) % 2 ? 1 : -1;
}

/** L'éclair de la cassure juste après le coup, rien après 0,18 s. */
export function drawRockHit(P: Pen, rock: OutcropPlan, X: number, Y: number, since: number): void {
  if (since >= 0.18) return;
  const pal = ROCK[rock.kind];
  const cx = X + rock.crack.x;
  const cy = Y + rock.crack.y;
  P.p(cx, cy, C.white);
  P.p(cx - 1, cy, pal[0]);
  P.p(cx + 1, cy, pal[0]);
  P.p(cx, cy - 1, pal[0]);
  P.p(cx, cy + 1, pal[0]);
}
