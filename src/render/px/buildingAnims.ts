/**
 * Les animations propres aux bâtiments : le seau du Puits et les évents de fumée.
 * Tout est pur et ne dépend que de la progression de la simulation, jamais du temps.
 */
import type { Ent } from '../../sim/ent';
import { Status } from '../../sim/ent';
import type { Era } from './eras';
import { C } from './palette';
import type { Pen } from './pen';

/** Le tour complet d'un cycle, en radians. */
const TAU = Math.PI * 2;

/** Vrai si la machine brûle : une machine en marche, ou un générateur dont le statut est `Working`. */
export function isBurning(e: Ent): boolean {
  return e.working || (e.def.kind === 'generator' && e.status === Status.Working);
}

/** Le nombre de pas d'un minerai, la durée d'un cycle du Puits. */
const CYCLE = 60;

/** Le seau descend puis remonte une fois par minerai : 0 en haut, `depth` en bas, en pixels entiers. */
export function bucketDrop(progress: number, depth: number): number {
  const p = Math.max(0, Math.min(1, progress / CYCLE));
  return Math.round((depth * (1 - Math.cos(TAU * p))) / 2);
}

/** L'angle de la roue : un huitième de tour par minerai, donc sans saut d'un cycle à l'autre. */
export function wheelAngle(progress: number): number {
  return (progress / CYCLE) * (Math.PI / 4) + 0.2;
}

/** Trace un contour d'un pixel autour d'un rectangle, avant de le remplir. */
function contour(P: Pen, x: number, y: number, w: number, h: number): void {
  P.r(x - 1, y - 1, w + 2, 1, C.ink2);
  P.r(x - 1, y + h, w + 2, 1, C.ink2);
  P.r(x - 1, y, 1, h, C.ink2);
  P.r(x + w, y, 1, h, C.ink2);
}

/** Le seau de l'ère 1, aux mêmes pixels que la maquette mais décalé de `drop`. */
function bucketE1(P: Pen, X: number, Y: number, drop: number): void {
  contour(P, X + 32, Y + 29 + drop, 8, 7);
  P.r(X + 32, Y + 30 + drop, 8, 6, C.e2);
  P.r(X + 32, Y + 30 + drop, 8, 1, C.e1);
  P.r(X + 32, Y + 33 + drop, 8, 1, C.s3);
  P.r(X + 33, Y + 29 + drop, 6, 1, C.ir1);
}

/** Le seau de l'ère 2, aux mêmes pixels que la maquette mais décalé de `drop`. */
function bucketE2(P: Pen, X: number, Y: number, drop: number): void {
  contour(P, X + 42, Y + 23 + drop, 9, 8);
  P.r(X + 42, Y + 24 + drop, 9, 7, C.e2);
  P.r(X + 42, Y + 24 + drop, 9, 1, C.e1);
  P.r(X + 42, Y + 27 + drop, 9, 1, C.s3);
  P.r(X + 43, Y + 23 + drop, 7, 1, C.ir1);
}

/** Dessine ce qui bouge sur un Puits, à l'origine du sprite (`X + 1`, `Y + 1`). */
export function drawPuitsMotion(P: Pen, era: Era, X: number, Y: number, up: number, progress: number): void {
  if (era === 1) {
    const drop = bucketDrop(progress, 8);
    P.r(X + 36, Y + up - 3, 1, 34 + drop, C.c3);
    bucketE1(P, X, Y + up, drop);
    return;
  }
  const drop = bucketDrop(progress, 10);
  P.r(X + 46, Y + up - 26, 1, 52 + drop, C.c3);
  bucketE2(P, X, Y + up, drop);
  const cx = X + 36;
  const cy = Y + up - 28;
  const angle = wheelAngle(progress);
  for (let k = 0; k < 8; k++) {
    const a = k * Math.PI / 4 + angle;
    P.line(cx, cy, cx + Math.cos(a) * 10, cy + Math.sin(a) * 10, C.e2);
  }
  P.disc(cx, cy, 2.5, C.s3);
  P.p(cx - 1, cy - 1, C.s1);
}

/** Où sort la fumée, en pixels depuis l'origine du sprite, ou null. */
export function smokeVent(key: string, era: Era, up: number): { x: number; y: number; color: 'dark' | 'pale' } | null {
  if (key === 'charbonniere') {
    return { x: 24, y: era === 1 ? up + 18 : up + 1, color: 'dark' };
  }
  if (key === 'four') {
    return { x: 36, y: 2, color: 'pale' };
  }
  if (key === 'bruleur') {
    return era === 1
      ? { x: 24, y: up + 18, color: 'dark' }
      : { x: 36, y: up - 38, color: 'dark' };
  }
  return null;
}
