// Les décisions du geste à mains nues : ce que vise un clic, la bête qu'on poursuit,
// la cadence des coups et la durée d'une fouille. Pures, sans DOM, pour être testées seules.

import type { Game } from '../sim/game';

/** Ce qu'un clic à mains nues peut viser : une bête ou une épave. */
export interface Prey {
  readonly kind: 'beast' | 'wreck';
  readonly id: number;
}

/** Rayon, en cases, où le clic attrape une bête. */
export const PREY_RADIUS = 0.8;
/** Secondes entre deux coups de poing. */
export const STRIKE_INTERVAL = 0.5;
/** Secondes que dure la fouille d'une épave. */
export const SEARCH_TIME = 1.5;

/** Ce qu'un clic à mains libres récolte sur une case. */
export interface HarvestPick {
  kind: 'loot' | 'tree' | 'ore';
  x: number;
  y: number;
}

/** Ce que le clic doit faire, dans l'ordre de priorité : bâtiment, bête, épave, récolte, marche. */
export type ClickTarget =
  | { kind: 'entity' }
  | { kind: 'beast'; id: number }
  | { kind: 'wreck'; id: number; searched: boolean }
  | { kind: 'harvest'; pick: HarvestPick }
  | { kind: 'walk' };

/** La bête ou l'épave visée à mains nues : la bête d'abord, puis l'épave non fouillée. */
export function preyAt(g: Game, x: number, y: number, cx: number, cy: number): Prey | null {
  const beast = g.beastAt(x, y, PREY_RADIUS);
  if (beast) return { kind: 'beast', id: beast.id };
  const wreck = g.wreckAt(cx, cy);
  if (wreck && !wreck.searched) return { kind: 'wreck', id: wreck.id };
  return null;
}

/** Ce que le clic gauche doit faire, selon la priorité du geste. */
export function clickTarget(
  g: Game,
  cx: number,
  cy: number,
  point: { x: number; y: number },
  harvest: HarvestPick | null,
): ClickTarget {
  if (g.entAt(cx, cy)) return { kind: 'entity' };
  const beast = g.beastAt(point.x, point.y, PREY_RADIUS);
  if (beast) return { kind: 'beast', id: beast.id };
  const wreck = g.wreckAt(cx, cy);
  if (wreck) return { kind: 'wreck', id: wreck.id, searched: wreck.searched };
  if (harvest) return { kind: 'harvest', pick: harvest };
  return { kind: 'walk' };
}

/** Où en est la bête suivie : sa position courante, sa case, et si elle est à portée. */
export interface BeastFollow {
  x: number;
  y: number;
  tileX: number;
  tileY: number;
  dist: number;
  reach: boolean;
}

/** Suit une bête à sa position courante ; null si elle a disparu. */
export function followBeast(g: Game, id: number, px: number, py: number, reach: number): BeastFollow | null {
  const beast = g.beasts.find((b) => b.id === id);
  if (!beast) return null;
  const dist = Math.hypot(beast.x - px, beast.y - py);
  return {
    x: beast.x,
    y: beast.y,
    tileX: Math.floor(beast.x),
    tileY: Math.floor(beast.y),
    dist,
    reach: dist <= reach,
  };
}

/** L'attente d'un coup : renvoie le nouveau compte et si un coup est dû. */
export function strikeStep(timer: number, dt: number): { timer: number; strike: boolean } {
  const t = timer + dt;
  if (t >= STRIKE_INTERVAL) return { timer: t - STRIKE_INTERVAL, strike: true };
  return { timer: t, strike: false };
}

/** L'avancement d'une fouille : la progression 0..1 et si elle est finie. */
export function searchStep(progress: number, dt: number): { progress: number; done: boolean } {
  const p = Math.min(1, progress + dt / SEARCH_TIME);
  return { progress: p, done: p >= 1 };
}

/** La case de l'épave 2 × 2 la plus proche du bâtisseur, où il s'arrête pour fouiller. */
export function wreckNearestCell(w: { x: number; y: number }, px: number, py: number): { x: number; y: number } {
  let best = { x: w.x, y: w.y };
  let bd = Infinity;
  for (let j = 0; j < 2; j++) {
    for (let i = 0; i < 2; i++) {
      const x = w.x + i;
      const y = w.y + j;
      const d = Math.hypot(x + 0.5 - px, y + 0.5 - py);
      if (d < bd) {
        bd = d;
        best = { x, y };
      }
    }
  }
  return best;
}
