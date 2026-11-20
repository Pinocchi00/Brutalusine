/**
 * La page d'essai des effets pixel : rafales, arbre frappé et arbre qui tombe, sur un pré agrandi ×4.
 * Page de développement seulement, hors du build.
 */
import { PixelFx } from '../render/px/fx';
import { C } from '../render/px/palette';
import { hash } from '../render/px/noise';
import { makeSurface } from '../render/px/surface';
import { pen, type Pen } from '../render/px/pen';

declare global {
  interface Window {
    __effets?: { done: boolean };
  }
}

const W = 240;
const H = 140;
const ZOOM = 4;
const TREE_X = 5;
const TREE_Y = 4.2;
const FALL_X = 2.4;
const FALL_Y = 4.2;

const KINDS = ['leaf', 'dust', 'spark', 'chip', 'star'] as const;
const SPOTS = [1.2, 3, 4.8, 6.6, 8.4] as const;

/** Le canevas de la page, son contexte et son crayon. */
function surface(): { ctx: CanvasRenderingContext2D; P: Pen } {
  const canvas = document.getElementById('vue');
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Canevas de la page absent');
  canvas.width = W;
  canvas.height = H;
  canvas.style.width = `${W * ZOOM}px`;
  canvas.style.height = `${H * ZOOM}px`;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Contexte 2D indisponible');
  ctx.imageSmoothingEnabled = false;
  return { ctx, P: pen(ctx) };
}

/** Le houppier provisoire : trois disques verts sur un fond transparent. */
function crown(): HTMLCanvasElement {
  const { canvas, ctx } = makeSurface(34, 34);
  const P = pen(ctx);
  P.disc(17, 19, 14, C.g4);
  P.disc(16, 17, 12, C.g3);
  P.disc(14, 15, 8, C.g2);
  P.disc(12, 13, 4, C.g1);
  return canvas;
}

/** Peint le pré : une herbe `C.m2` semée de touffes plus sombres. */
function grass(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = C.m2;
  ctx.fillRect(0, 0, W, H);
  for (let y = 0; y < H; y += 3) {
    for (let x = 0; x < W; x += 3) {
      if (hash(x, y, 17) < 0.22) {
        ctx.fillStyle = hash(x, y, 3) < 0.5 ? C.m3 : C.m1;
        ctx.fillRect(x + Math.floor(hash(x, y, 5) * 3), y, 1, 2);
      }
    }
  }
}

/** Dessine l'arbre provisoire debout, décalé du tremblement en cours. */
function standing(ctx: CanvasRenderingContext2D, img: HTMLCanvasElement, x: number, shift: number): void {
  const px = Math.round(x * 24 + shift);
  const py = Math.round(TREE_Y * 24);
  ctx.fillStyle = C.e3;
  ctx.fillRect(px - 2, py - 16, 4, 16);
  ctx.fillStyle = C.e2;
  ctx.fillRect(px - 2, py - 16, 1, 16);
  ctx.drawImage(img, px - Math.round(img.width / 2), py - img.height - 4);
}

/** Lance l'animation, les rafales et la chute, puis rend la page prête. */
function main(): void {
  const { ctx, P } = surface();
  const fx = new PixelFx();
  const img = crown();
  const canvas = ctx.canvas;
  let now = 0;
  let start = 0;
  let last = 0;
  let nextBurst = 0;
  let nextFall = 0;

  const strike = (): void => {
    fx.hit(TREE_X, TREE_Y, now, Math.random() < 0.5 ? 1 : 2);
    fx.burst('chip', TREE_X, TREE_Y - 0.3, C.e1, 4);
    fx.burst('star', TREE_X, TREE_Y - 0.4, C.o1, 1);
  };
  canvas.addEventListener('pointerdown', strike);

  const frame = (ts: number): void => {
    if (start === 0) start = ts;
    if (last === 0) last = ts;
    const dt = Math.min(0.05, (ts - last) / 1000);
    last = ts;
    now = ((ts - start) / 1000) * 2;
    const seconds = (ts - start) / 1000;

    if (seconds >= nextBurst) {
      for (let i = 0; i < KINDS.length; i++) {
        fx.burst(KINDS[i], SPOTS[i], 1.6 + (i % 2) * 0.8, C.ir1, 10);
      }
      nextBurst += 1;
    }
    if (seconds >= nextFall) {
      fx.fell(FALL_X, FALL_Y, 220, now, img);
      nextFall += 3;
    }

    fx.update(dt, 0.5 + Math.sin(now * 0.4) * 0.3);
    grass(ctx);
    standing(ctx, img, TREE_X, fx.shake(TREE_X, TREE_Y, now));
    fx.draw(P, ctx, now);
    window.__effets = { done: true };
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

main();
