/**
 * Le cabiai du rendu pixel : une boule de poil rêche, la tête en bloc, une crinière raide.
 * Le dessin reprend fidèlement le croquis validé `_briefs/8-croquis-cabiai.ts`.
 */
import type { BeastState } from '../../sim/fauna';
import { C } from './palette';
import { rng } from './noise';
import { pen, stroke, type Pen } from './pen';
import { finish, outline, rim } from './finish';
import { makeSurface } from './surface';
import { TILE_PX } from './view';

/** La pose d'un cabiai : debout ou la tête basse pour brouter. */
export type BeastPose = 'stand' | 'graze';

/** L'image d'une bête : sa pose, son pas de marche, son tressaillement et son sens. */
export interface BeastFrame {
  pose: BeastPose;
  step: number;
  flinch: boolean;
  face: -1 | 1;
}

/** Le nombre de pas pendant lesquels une bête frappée tressaille. */
export const FLINCH_TICKS = 12;

/** L'image d'une bête selon son état, son pas, son dernier coup et son sens. */
export function beastFrame(state: BeastState, tick: number, id: number, face: -1 | 1, struck: number): BeastFrame {
  const flinch = struck >= 0 && tick - struck < FLINCH_TICKS;
  if (state === 'graze') return { pose: 'graze', step: 0, flinch, face };
  return { pose: 'stand', step: Math.floor((tick + id * 11) / 10) % 3, flinch, face };
}

/** Vrai si une bête au centre (x, y) peut toucher la fenêtre visible, avec une marge. */
export function beastVisible(x: number, y: number, x0: number, y0: number, x1: number, y1: number): boolean {
  return x + 1.5 > x0 && x - 1.5 < x1 && y + 1.5 > y0 && y - 1.5 < y1;
}

/** Le cabiai de profil, tourné vers l'ouest, à la pose et au pas demandés. */
function capybara(P: Pen, graze: boolean, step: number): void {
  const hy = graze ? 4 : 0;
  const gait = graze ? 0 : step;
  P.r(16, 25, 3, 5, C.e3);
  P.r(32, 25, 3, 5, C.e3);
  P.ell(26, 18, 14, 10, C.e2);
  P.ell(26, 23, 13, 5, C.e3);
  P.ell(24, 12, 10, 3.5, C.e1);
  // le poil : de courtes mèches
  const R = rng(9);
  for (let i = 0; i < 44; i++) {
    const x = 14 + Math.floor(R() * 25);
    const y = 10 + Math.floor(R() * 15);
    const dx = (x - 26) / 14;
    const dy = (y - 18) / 10;
    if (dx * dx + dy * dy < 0.8) P.line(x, y, x + 1, y + 1, y < 16 ? C.e2 : C.e4);
  }
  // la crinière
  for (let x = 17; x <= 34; x += 2) {
    const h = 3 + ((x * 7) % 3);
    P.line(x, 9 - h + 2, x + 1, 10, C.ink2);
    P.p(x + 1, 10 - h + 2, C.e4);
  }
  // la tête en bloc
  P.ell(11, 15 + hy, 7, 6.5, C.e2);
  P.r(3, 12 + hy, 9, 9, C.e2);
  P.r(3, 18 + hy, 9, 3, C.e3);
  P.r(4, 12 + hy, 7, 1, C.e1);
  P.r(3, 13 + hy, 1, 6, C.e1);
  P.p(3, 15 + hy, C.ink);
  P.line(3, 19 + hy, 7, 19 + hy, C.e4);
  // les oreilles
  P.disc(14, 8.5 + hy, 1.6, C.e3);
  P.disc(10.5, 8.5 + hy, 1.6, C.e3);
  P.p(14, 8 + hy, C.e4);
  // l'œil, haut placé
  P.r(9, 12 + hy, 2, 2, C.ink);
  P.p(9, 12 + hy, C.c0);
  // les pattes de devant, courtes, qui alternent à la marche
  const front = gait === 1 ? 1 : 0;
  const rear = gait === 2 ? 1 : 0;
  P.r(20, 26 - front, 3, 5, C.e2);
  P.r(22, 26 - front, 1, 5, C.e3);
  P.r(36, 25 - rear, 3, 5, C.e2);
  P.r(20, 30 - front, 3, 1, C.ink2);
  P.r(36, 29 - rear, 3, 1, C.ink2);
  // une bouchée d'herbe quand il broute
  if (graze) {
    stroke(P, 5, 27, 3, 30, 1, C.m2);
    P.p(3, 30, C.m3);
    P.p(6, 30, C.m4);
  }
}

/** Une image de cabiai finie, avec son contour d'encre ou son liseré clair de tressaillement. */
export interface BeastSprite {
  img: HTMLCanvasElement;
  ax: number;
  ay: number;
}

const sprites = new Map<string, BeastSprite>();

/** L'image d'une bête, dessinée une fois par pose, pas et tressaillement. */
export function beastSprite(frame: BeastFrame): BeastSprite {
  const key = `${frame.pose}#${frame.step}#${frame.flinch ? 'hit' : 'calm'}`;
  const cached = sprites.get(key);
  if (cached) return cached;
  const { canvas, ctx } = makeSurface(48, 34);
  capybara(pen(ctx), frame.pose === 'graze', frame.step);
  const img = frame.flinch ? rim(outline(canvas, C.c0), C.o1) : finish(canvas);
  const sprite = { img, ax: img.width / 2, ay: img.height - 4 };
  sprites.set(key, sprite);
  return sprite;
}

/** Dessine une bête à son centre en cases, retournée si elle regarde vers l'est. */
export function drawBeast(
  ctx: CanvasRenderingContext2D,
  sprite: BeastSprite,
  x: number,
  y: number,
  face: -1 | 1,
  flinch: boolean,
): void {
  const anchorX = x * TILE_PX + (flinch ? 1 : 0);
  const anchorY = y * TILE_PX + 6;
  if (face < 0) {
    ctx.save();
    ctx.translate(Math.round(anchorX), Math.round(anchorY));
    ctx.scale(-1, 1);
    ctx.drawImage(sprite.img, Math.round(-sprite.ax), Math.round(-sprite.ay));
    ctx.restore();
    return;
  }
  ctx.drawImage(sprite.img, Math.round(anchorX - sprite.ax), Math.round(anchorY - sprite.ay));
}
