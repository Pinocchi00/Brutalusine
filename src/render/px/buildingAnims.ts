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

/** Vrai si la machine brûle : son statut est `Working`, y compris quand `working` retombe en fin de cycle. */
export function isBurning(e: Ent): boolean {
  return e.status === Status.Working;
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

/** Trace un liseré d'un pixel autour d'un rectangle, avant de le remplir. */
function border(P: Pen, x: number, y: number, w: number, h: number): void {
  P.r(x - 1, y - 1, w + 2, 1, C.ink2);
  P.r(x - 1, y + h, w + 2, 1, C.ink2);
  P.r(x - 1, y, 1, h, C.ink2);
  P.r(x + w, y, 1, h, C.ink2);
}

/** Le seau de l'ère 1, aux mêmes pixels que la maquette mais décalé de `drop`. */
function bucketE1(P: Pen, X: number, Y: number, drop: number): void {
  border(P, X + 32, Y + 29 + drop, 8, 7);
  P.r(X + 32, Y + 30 + drop, 8, 6, C.e2);
  P.r(X + 32, Y + 30 + drop, 8, 1, C.e1);
  P.r(X + 32, Y + 33 + drop, 8, 1, C.s3);
  P.r(X + 33, Y + 29 + drop, 6, 1, C.ir1);
}

/** Le seau de l'ère 2, aux mêmes pixels que la maquette mais décalé de `drop`. */
function bucketE2(P: Pen, X: number, Y: number, drop: number): void {
  border(P, X + 42, Y + 23 + drop, 9, 8);
  P.r(X + 42, Y + 24 + drop, 9, 7, C.e2);
  P.r(X + 42, Y + 24 + drop, 9, 1, C.e1);
  P.r(X + 42, Y + 27 + drop, 9, 1, C.s3);
  P.r(X + 43, Y + 23 + drop, 7, 1, C.ir1);
}

/** Dessine ce qui bouge sur un Puits, à l'origine du sprite (`X + 1`, `Y + 1`). */
export function drawShaftMotion(P: Pen, era: Era, X: number, Y: number, up: number, progress: number): void {
  if (era === 1) {
    const drop = bucketDrop(progress, 8);
    P.r(X + 36, Y + up - 3, 1, 34 + drop, C.c3);
    bucketE1(P, X, Y + up, drop);
    P.line(X + 36, Y + up - 6, X + 15, Y + up + 58, C.e2, 2);
    P.line(X + 36, Y + up - 6, X + 59, Y + up + 56, C.e2, 2);
    return;
  }
  const drop = bucketDrop(progress, 10);
  P.r(X + 46, Y + up - 19, 1, 42 + drop, C.c3);
  bucketE2(P, X, Y + up, drop);
  P.line(X + 58, Y + up + 56, X + 42, Y + up - 20, C.e2, 2);
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

/** Un petit engrenage d'acier dont un reflet clair tourne avec le temps. */
function greaseGear(P: Pen, cx: number, cy: number, rad: number, now: number): void {
  P.disc(cx, cy, rad + 1, C.s4);
  P.disc(cx, cy, rad, C.s1);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * TAU;
    P.p(cx + Math.cos(a) * (rad + 1), cy + Math.sin(a) * (rad + 1), C.s2);
  }
  const a = now * 1.7;
  P.p(cx + Math.cos(a) * (rad - 1), cy + Math.sin(a) * (rad - 1), C.s0);
  P.p(cx + Math.cos(a + 2.4) * (rad - 1), cy + Math.sin(a + 2.4) * (rad - 1), C.c0);
  P.p(cx, cy, C.s3);
}

/** Montre la graisse d'une machine : des engrenages qui luisent et une burette posée à côté. */
export function drawGrease(P: Pen, e: Ent, X: number, Y: number, up: number, now: number): void {
  if (e.greased <= 0 || !e.def.grease) return;
  const footY = Y + up + e.h * 24;
  const cx = X + e.w * 24 * 0.7;
  const cy = footY - 10;
  greaseGear(P, cx, cy, 4, now);
  greaseGear(P, cx - 7, cy + 3, 3, now + 2);
  const bx = X + 3;
  const by = footY - 8;
  P.r(bx + 1, by - 2, 3, 2, C.s3);
  P.r(bx + 1, by - 2, 3, 1, C.s2);
  P.r(bx, by, 6, 6, C.s3);
  P.r(bx, by, 6, 1, C.s1);
  P.r(bx, by, 1, 6, C.s2);
  P.r(bx + 5, by + 1, 1, 5, C.s4);
  P.r(bx, by + 5, 6, 1, C.ink2);
  P.line(bx + 6, by + 1, bx + 9, by - 2, C.e2, 2);
  P.line(bx + 6, by + 1, bx + 9, by - 2, C.e1);
  P.p(bx + 9, by - 3, C.o1);
}
