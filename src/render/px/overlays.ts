/**
 * Les repères dessinés dans le monde, en pixel art : cadres, portée, aperçus, tracés,
 * bouches de la Tour, repère du guide, ondes et bulles de cause.
 * Les positions d'entrée sont en cases ; le dessin se fait en pixels monde (1 case = 24 pixels).
 */
import type { Sprite } from './sprite';
import type { Pen } from './pen';
import type { RouteView, Ring } from './types';
import { Status } from '../../sim/ent';
import { B, DX, DY, ITEMS } from '../../sim/data';
import { SAW_RANGE } from '../../sim/game';
import { C } from './palette';
import { TILE_PX } from './view';
import { chev } from './volumes';
import { makeSurface } from './surface';
import { hexToRgb } from './noise';

/** Le rouge de refus, adouci vers l'encre : lisible sans crier. */
const REFUSED = blendHex(C.red, C.ink, 0.38);

/** Le rouge de refus pour les arêtes claires. */
const REFUSED_HI = blendHex(C.red, C.ink, 0.16);

/** La teinte sourde de l'aperçu refusé : du rouge mêlé à l'acier sombre. */
const GHOST_REFUSED = blendHex(C.red, C.s3, 0.5);

/** Les petits sprites teintés, gardés d'un aperçu à l'autre. */
const tinted = new WeakMap<Sprite, HTMLCanvasElement>();

/** Mélange deux couleurs hexadécimales : `k` est la part de `b` dans le résultat. */
function blendHex(a: string, b: string, k: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const mix = (x: number, y: number): string => Math.round(x + (y - x) * k).toString(16).padStart(2, '0');
  return `#${mix(ar, br)}${mix(ag, bg)}${mix(ab, bb)}`;
}

/** L'aller-retour d'un pixel, par paliers : 0 ou 1. */
function breathe(now: number): number {
  return Math.floor(now * 2) % 2;
}

/** Une ellipse en pointillés d'un pixel, balayée en angles. */
function dottedEllipse(P: Pen, cx: number, cy: number, rx: number, ry: number, col: string, phase: number, skip: number): void {
  const n = Math.max(24, Math.round((rx + ry) * 0.9));
  for (let i = 0; i < n; i++) {
    if (skip > 1 && i % skip !== 0) continue;
    const a = (i / n) * Math.PI * 2 + phase;
    P.p(Math.round(cx + Math.cos(a) * rx), Math.round(cy + Math.sin(a) * ry), col);
  }
}

/** Une ellipse tracée d'un pixel, avec un liseré d'encre juste en dessous. */
function ringEllipse(P: Pen, cx: number, cy: number, rx: number, ry: number, col: string): void {
  const n = Math.max(24, Math.round((rx + ry) * 3.2));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = Math.round(cx + Math.cos(a) * rx);
    const y = Math.round(cy + Math.sin(a) * ry);
    P.p(x, y + 1, C.ink);
    P.p(x, y, col);
  }
}

/** Tourne un point local d'un quart de tour par unité de `dir`. */
function turn(x: number, y: number, dir: number): readonly [number, number] {
  let a = x;
  let b = y;
  for (let k = 0; k < (dir & 3); k++) {
    const nx = -b;
    b = a;
    a = nx;
  }
  return [a, b];
}

/** Remplit un triangle plein tourné vers `dir`, sans contour. */
function triangle(P: Pen, cx: number, cy: number, dir: number, size: number, col: string): void {
  const len = Math.max(1, Math.round(size));
  const back = Math.max(1, Math.round(size * 0.7));
  const wing = Math.max(1, Math.round(size * 0.9));
  for (let u = -back; u <= len; u++) {
    const t = (u + back) / (len + back);
    const hw = Math.round(wing * t);
    for (let v = -hw; v <= hw; v++) {
      const [x, y] = turn(u, v, dir);
      P.p(cx + x, cy + y, col);
    }
  }
}

/** Une flèche pleine : un triangle d'encre, puis sa couleur dedans. */
function arrow(P: Pen, cx: number, cy: number, dir: number, col: string, size = 6): void {
  triangle(P, cx, cy, dir, size + 1, C.ink);
  triangle(P, cx, cy, dir, size, col);
}

/** Remplit un polygone par balayage horizontal. */
function polygon(P: Pen, pts: readonly (readonly [number, number])[], col: string): void {
  let top = Infinity;
  let bottom = -Infinity;
  for (const [, y] of pts) {
    top = Math.min(top, y);
    bottom = Math.max(bottom, y);
  }
  for (let y = Math.floor(top); y <= Math.ceil(bottom); y++) {
    let left = Infinity;
    let right = -Infinity;
    for (let i = 0; i < pts.length; i++) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[(i + 1) % pts.length];
      if (y0 === y1 || y < Math.min(y0, y1) || y >= Math.max(y0, y1)) continue;
      const x = x0 + ((y - y0) / (y1 - y0)) * (x1 - x0);
      left = Math.min(left, x);
      right = Math.max(right, x);
    }
    if (right >= left) P.r(left, y, right - left + 1, 1, col);
  }
}

/** Dessine un contour d'encre autour d'un polygone, puis le remplit de sa couleur. */
function filledPolygon(P: Pen, pts: readonly (readonly [number, number])[], col: string): void {
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[(i + 1) % pts.length];
    P.line(x0, y0, x1, y1, C.ink, 3);
  }
  polygon(P, pts, col);
}

/** Quatre coins en équerre autour d'une emprise, qui respirent d'un pixel. */
export function drawBrackets(P: Pen, x: number, y: number, w: number, h: number, color: string, now: number): void {
  const X = x * TILE_PX;
  const Y = y * TILE_PX;
  const W = w * TILE_PX;
  const H = h * TILE_PX;
  const off = 1 + breathe(now);
  const len = 8;
  const x0 = X - off;
  const y0 = Y - off;
  const x1 = X + W + off;
  const y1 = Y + H + off;
  const corners: readonly (readonly [number, number, number, number])[] = [
    [x0, y0, 1, 1],
    [x1, y0, -1, 1],
    [x0, y1, 1, -1],
    [x1, y1, -1, -1],
  ];
  for (const [px, py, ix, iy] of corners) {
    P.line(px, py, px + ix * len, py, C.ink);
    P.line(px, py, px, py + iy * len, C.ink);
    P.line(px, py + iy, px + ix * (len - 1), py + iy, color);
    P.line(px + ix, py, px + ix, py + iy * (len - 1), color);
  }
}

/** La portée d'une machine, en pointillé d'un pixel : la Scierie coupe à cinq cases. */
export function drawRange(P: Pen, key: string, x: number, y: number, w: number, h: number, now: number): void {
  const def = B[key];
  if (!def || def.kind !== 'sawmill') return;
  const cx = (x + w / 2) * TILE_PX;
  const cy = (y + h / 2) * TILE_PX;
  const r = (SAW_RANGE + 0.4) * TILE_PX;
  const phase = (Math.floor(now * 2) % 8) * (Math.PI / 32);
  const n = 28;
  for (let i = 0; i < n; i += 2) {
    const a0 = (i / n) * Math.PI * 2 + phase;
    const a1 = a0 + (1 / n) * Math.PI * 2 * 0.55;
    const x0 = cx + Math.cos(a0) * r;
    const y0 = cy + Math.sin(a0) * r;
    const x1 = cx + Math.cos(a1) * r;
    const y1 = cy + Math.sin(a1) * r;
    P.line(x0, y0 + 1, x1, y1 + 1, C.ink);
    P.line(x0, y0, x1, y1, C.white);
  }
}

/** L'aperçu d'un bâtiment à poser en X, Y (pixels monde) : à moitié transparent, rouge sourd si la pose est refusée. */
export function drawGhost(ctx: CanvasRenderingContext2D, sprite: Sprite, X: number, Y: number, ok: boolean): void {
  let image = sprite.img;
  if (!ok) {
    let t = tinted.get(sprite);
    if (!t) {
      const surface = makeSurface(sprite.img.width, sprite.img.height);
      surface.ctx.drawImage(sprite.img, 0, 0);
      surface.ctx.globalCompositeOperation = 'source-atop';
      surface.ctx.fillStyle = GHOST_REFUSED;
      surface.ctx.fillRect(0, 0, sprite.img.width, sprite.img.height);
      t = surface.canvas;
      tinted.set(sprite, t);
    }
    image = t;
  }
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = 0.5;
  ctx.drawImage(image, Math.round(X), Math.round(Y));
  ctx.restore();
  if (!ok) {
    const cx = Math.round(X + sprite.img.width / 2);
    const cy = Math.round(Y + sprite.img.height / 2 + sprite.up / 2);
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.fillStyle = C.ink;
    ctx.fillRect(cx, cy - 2, 1, 5);
    ctx.fillRect(cx - 2, cy, 5, 1);
    ctx.fillStyle = C.red;
    ctx.fillRect(cx, cy, 1, 1);
    ctx.restore();
  }
}

/** Le tracé d'un convoyeur case par case : chevrons dans le sens de marche, rouge sur les refus. */
export function drawRoute(P: Pen, route: readonly RouteView[], into: boolean, now: number): void {
  for (const t of route) {
    const X = t.x * TILE_PX;
    const Y = t.y * TILE_PX;
    P.r(X + 1, Y + 1, TILE_PX - 2, TILE_PX - 2, C.ink);
    P.r(X + 2, Y + 2, TILE_PX - 4, TILE_PX - 4, t.ok ? C.s3 : REFUSED);
    P.r(X + 2, Y + 2, TILE_PX - 4, 1, t.ok ? C.s1 : REFUSED_HI);
    P.r(X + 2, Y + TILE_PX - 3, TILE_PX - 4, 1, t.ok ? C.s4 : C.ink);
    const col = t.ok ? C.o1 : C.red;
    chev(P, Math.round(X + TILE_PX / 2) + 1, Math.round(Y + TILE_PX / 2) + 1, t.dir, C.ink);
    chev(P, Math.round(X + TILE_PX / 2), Math.round(Y + TILE_PX / 2), t.dir, col);
  }
  const last = route[route.length - 1];
  if (!into || !last) return;
  const ex = (last.x + 0.5) * TILE_PX + DX[last.dir] * (TILE_PX / 2);
  const ey = (last.y + 0.5) * TILE_PX + DY[last.dir] * (TILE_PX / 2);
  const b = breathe(now) * 2;
  if (last.dir % 2 === 0) {
    P.r(ex - 2, ey - 7 - b / 2, 5, 14 + b, C.ink);
    P.r(ex - 1, ey - 6 - b / 2, 3, 12 + b, C.o1);
  } else {
    P.r(ex - 7 - b / 2, ey - 2, 14 + b, 5, C.ink);
    P.r(ex - 6 - b / 2, ey - 1, 12 + b, 3, C.o1);
  }
}

/** Les entrées libres de la Tour : une flèche orange, une case au-dehors, qui bat vers l'intérieur. */
export function drawHubMouths(P: Pen, x: number, y: number, w: number, h: number, open: readonly boolean[], now: number): void {
  const b = breathe(now);
  for (let d = 0; d < 4; d++) {
    if (!open[d]) continue;
    const px = (x + (w - 1) / 2 + 0.5 + DX[d] * (w / 2 + 0.5)) * TILE_PX;
    const py = (y + (h - 1) / 2 + 0.5 + DY[d] * (h / 2 + 0.5)) * TILE_PX;
    const inward = (d + 2) & 3;
    arrow(P, Math.round(px + DX[inward] * b), Math.round(py + DY[inward] * b), inward, C.o1, 7);
  }
}

/** La flèche du guide, qui rebondit par paliers, et son ellipse au sol. */
export function drawMarker(P: Pen, x: number, y: number, now: number): void {
  const mx = Math.round(x * TILE_PX);
  const my = Math.round(y * TILE_PX);
  const b = Math.round(Math.abs(Math.sin(now * 1.6)) * 4);
  ringEllipse(P, mx, my, 14, 7, C.o1);
  arrow(P, mx, my - 18 - b, 1, C.o1, 7);
}

/** Une onde qui s'élargit au sol et s'efface par paliers. */
export function drawRing(P: Pen, ring: Ring, now: number): void {
  if (ring.dur <= 0) return;
  const t = (now - ring.t0) / ring.dur;
  if (!(t >= 0 && t <= 1)) return;
  const ease = 1 - (1 - t) * (1 - t);
  const rx = (0.3 + ring.size * ease) * TILE_PX;
  const ry = rx * 0.5;
  const cx = ring.x * TILE_PX;
  const cy = ring.y * TILE_PX;
  const skip = 1 + Math.floor(t * 3);
  dottedEllipse(P, cx, cy, rx, ry, ring.color, 0, skip);
}

/** Une bulle d'encre au-dessus d'une machine arrêtée, avec la cause dessinée dedans. */
export function drawCauseBubble(
  P: Pen,
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  status: Status,
  missing: number,
  now: number,
  itemImg?: (id: number) => CanvasImageSource,
): void {
  const bx = Math.round(x * TILE_PX);
  const by = Math.round(y * TILE_PX) - breathe(now);
  P.disc(bx, by, 11, C.ink);
  P.r(bx - 2, by + 9, 4, 2, C.ink);
  P.r(bx - 1, by + 11, 2, 2, C.ink);
  P.p(bx, by + 13, C.ink);
  const rim = status === Status.NoPower ? C.o1 : status === Status.Blocked ? REFUSED_HI : C.white;
  ringEllipse(P, bx, by, 10, 10, rim);
  if (status === Status.NoInput && missing >= 0 && missing < ITEMS.length) {
    if (itemImg) {
      ctx.drawImage(itemImg(missing), bx - 7, by - 7, 14, 14);
    } else {
      const col = blendHex(ITEMS[missing].color, C.ink, 0.22);
      P.r(bx - 5, by - 5, 10, 10, C.ink);
      P.r(bx - 4, by - 4, 8, 8, col);
      P.r(bx - 4, by - 4, 8, 1, blendHex(col, C.white, 0.45));
    }
    return;
  }
  if (status === Status.Blocked) {
    P.r(bx - 5, by - 6, 5, 12, C.ink);
    P.r(bx, by - 6, 5, 12, C.ink);
    P.r(bx - 4, by - 5, 3, 10, REFUSED_HI);
    P.r(bx + 1, by - 5, 3, 10, REFUSED_HI);
    return;
  }
  if (status === Status.NoPower) {
    const bolt: readonly (readonly [number, number])[] = [
      [bx + 1, by - 7],
      [bx - 4, by],
      [bx - 1, by],
      [bx - 2, by + 7],
      [bx + 4, by],
      [bx + 1, by],
    ];
    filledPolygon(P, bolt, C.o1);
    return;
  }
  ringEllipse(P, bx, by, 6, 6, C.white);
  P.line(bx - 5, by + 5, bx + 5, by - 5, C.white);
}
