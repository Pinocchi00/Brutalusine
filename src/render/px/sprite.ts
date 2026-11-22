/**
 * Les sprites de bâtiment : la partie fixe dessinée une fois, sa silhouette d'ombre teintée,
 * et la liste de ses lumières animées (dessinées par le lot suivant).
 */
import { makeSurface } from './surface';
import { pen } from './pen';
import type { Pen } from './pen';
import { finish } from './finish';

/** Le socle commun d'une lumière : sa position dans le sprite et son décalage de phase. */
export interface LightBase {
  x: number;
  y: number;
  ph?: number;
}

/** Les lumières posées avec le dessin d'un bâtiment, chacune animée à sa manière. */
export type Light =
  | (LightBase & { k: 'beat'; r?: number }) // le fanal : deux battements puis le repos
  | (LightBase & { k: 'lens'; r?: number }) // l'œil de la capsule qui respire
  | (LightBase & { k: 'win'; w: number; h: number; per?: number }) // une fenêtre éclairée qui vacille
  | (LightBase & { k: 'blink'; per?: number; c?: string; off?: string }) // un feu de signalisation
  | (LightBase & { k: 'fire'; w?: number }) // des flammes basses
  | (LightBase & { k: 'ember'; w?: number; h?: number }); // des braises qui rougeoient

/** Un bâtiment dessiné : son image finie, son ombre, sa hauteur et ses lumières. */
export interface Sprite {
  img: HTMLCanvasElement;
  shadow: HTMLCanvasElement;
  up: number;
  lights: Light[];
}

/** Dessine la partie fixe d'un bâtiment, puis en dérive le contour, le liseré et la silhouette d'ombre. */
export function build(
  w: number,
  h: number,
  up: number,
  fn: (P: Pen, up: number, lights: Light[]) => void,
): Sprite {
  const { canvas, ctx } = makeSurface(w, h + up);
  const lights: Light[] = [];
  fn(pen(ctx), up, lights);
  const img = finish(canvas);
  const shadowSurface = makeSurface(img.width, img.height);
  shadowSurface.ctx.drawImage(img, 0, 0);
  shadowSurface.ctx.globalCompositeOperation = 'source-in';
  shadowSurface.ctx.fillStyle = '#48286a';
  shadowSurface.ctx.fillRect(0, 0, shadowSurface.canvas.width, shadowSurface.canvas.height);
  return { img, shadow: shadowSurface.canvas, up, lights };
}

/** Le cache des masques alpha des sprites finis. */
const masks = new WeakMap<Sprite, Uint8Array>();

/** Le masque alpha d'un sprite : 1 pour un pixel plein, 0 sinon, indice `y * largeur + x`. */
export function spriteMask(sprite: Sprite): Uint8Array {
  const cached = masks.get(sprite);
  if (cached) return cached;
  const { width, height } = sprite.img;
  const { ctx } = makeSurface(width, height, { read: true });
  ctx.drawImage(sprite.img, 0, 0);
  const data = ctx.getImageData(0, 0, width, height).data;
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < mask.length; i++) mask[i] = data[i * 4 + 3] !== 0 ? 1 : 0;
  masks.set(sprite, mask);
  return mask;
}

/** Projette l'ombre longue d'un sprite en biais ; son alpha se multiplie à celui déjà posé autour. */
export function castShadow(ctx: CanvasRenderingContext2D, sprite: Sprite, X: number, Y: number): void {
  const gy = Y + sprite.img.height - 2, K = 1.1, tt = 0.16;
  ctx.save();
  ctx.globalAlpha *= 0.28;
  ctx.transform(1, 0, -K, -tt, K * gy, gy * (1 + tt));
  ctx.drawImage(sprite.shadow, X, Y);
  ctx.restore();
}
