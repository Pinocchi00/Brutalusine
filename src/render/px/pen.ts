/**
 * Le crayon du rendu pixel : des rectangles arrondis au pixel, des traits et des ellipses.
 * Toutes les primitives sont celles de la maquette, à l'identique.
 */

/** Le crayon : rectangles, pixels, traits, ellipses et disques. */
export interface Pen {
  /** Un rectangle plein, coordonnées arrondies au pixel le plus proche. */
  r(a: number, b: number, w: number, h: number, col: string): void;
  /** Un pixel unique. */
  p(a: number, b: number, col: string): void;
  /** Un trait de Bresenham, d'épaisseur `th` pixels. */
  line(x0: number, y0: number, x1: number, y1: number, col: string, th?: number): void;
  /** Une ellipse pleine, balayée ligne par ligne. */
  ell(cx: number, cy: number, rx: number, ry: number, col: string): void;
  /** Un disque plein. */
  disc(cx: number, cy: number, rad: number, col: string): void;
}

/** Le strict nécessaire d'un contexte 2D pour dessiner au crayon : une couleur et un rectangle plein. */
export type PixelTarget = Pick<CanvasRenderingContext2D, 'fillStyle' | 'fillRect'>;

/** Enveloppe un contexte 2D dans un crayon pixel. */
export function pen(ctx: PixelTarget): Pen {
  const r = (a: number, b: number, w: number, h: number, col: string): void => {
    a = Math.round(a);
    b = Math.round(b);
    w = Math.round(w);
    h = Math.round(h);
    if (w <= 0 || h <= 0) return;
    ctx.fillStyle = col;
    ctx.fillRect(a, b, w, h);
  };

  const p = (a: number, b: number, col: string): void => r(a, b, 1, 1, col);

  const line = (x0: number, y0: number, x1: number, y1: number, col: string, th = 1): void => {
    x0 = Math.round(x0);
    y0 = Math.round(y0);
    x1 = Math.round(x1);
    y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let e = dx + dy;
    for (let g = 0; g < 800; g++) {
      r(x0, y0, th, th, col);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * e;
      if (e2 >= dy) { e += dy; x0 += sx; }
      if (e2 <= dx) { e += dx; y0 += sy; }
    }
  };

  const ell = (cx: number, cy: number, rx: number, ry: number, col: string): void => {
    for (let yy = Math.floor(cy - ry); yy < Math.ceil(cy + ry); yy++) {
      const dy = (yy + 0.5 - cy) / ry;
      if (Math.abs(dy) > 1) continue;
      const hw = rx * Math.sqrt(1 - dy * dy), a = Math.round(cx - hw), b = Math.round(cx + hw);
      if (b > a) { ctx.fillStyle = col; ctx.fillRect(a, yy, b - a, 1); }
    }
  };

  const disc = (cx: number, cy: number, rad: number, col: string): void => ell(cx, cy, rad, rad, col);

  return { r, p, line, ell, disc };
}

/** Un trait épais et arrondi : une suite de disques le long du segment. */
export function stroke(P: Pen, x0: number, y0: number, x1: number, y1: number, r: number, col: string): void {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    P.disc(Math.round(x0 + (x1 - x0) * t) + 0.5, Math.round(y0 + (y1 - y0) * t) + 0.5, r, col);
  }
}

/** Le liseré éclairé (au-dessus) et ombré (en dessous) d'un segment épais. */
export function edges(P: Pen, x0: number, y0: number, x1: number, y1: number, hi: string, lo: string): void {
  const dx = x1 - x0, dy = y1 - y0, d = Math.hypot(dx, dy) || 1;
  let nx = dy / d, ny = -dx / d;
  if (ny > 0) { nx = -nx; ny = -ny; }
  P.line(Math.round(x0 + nx), Math.round(y0 + ny), Math.round(x1 + nx), Math.round(y1 + ny), hi);
  P.line(Math.round(x0 - nx), Math.round(y0 - ny), Math.round(x1 - nx), Math.round(y1 - ny), lo);
}
