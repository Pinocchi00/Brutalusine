/**
 * La finition des sprites : le contour sombre d'un pixel et le liseré doré du bord éclairé.
 * Les algorithmes lisent les pixels de la silhouette, comme dans la maquette.
 */
import { C } from './palette';
import { hexToRgb } from './noise';
import { makeSurface } from './surface';
import { pen } from './pen';

/** Entoure la silhouette d'un contour d'un pixel, élargi d'un pixel de chaque côté. */
export function outline(src: HTMLCanvasElement, col: string): HTMLCanvasElement {
  const w = src.width + 2, h = src.height + 2;
  const { canvas, ctx } = makeSurface(w, h);
  ctx.drawImage(src, 1, 1);
  const d = ctx.getImageData(0, 0, w, h), a = d.data;
  const [R, G, B] = hexToRgb(col), mark: number[] = [];
  const on = (i: number, j: number): boolean => i >= 0 && j >= 0 && i < w && j < h && a[(j * w + i) * 4 + 3] > 0;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      if (!on(i, j) && (on(i - 1, j) || on(i + 1, j) || on(i, j - 1) || on(i, j + 1))) mark.push((j * w + i) * 4);
    }
  }
  for (const k of mark) { a[k] = R; a[k + 1] = G; a[k + 2] = B; a[k + 3] = 255; }
  ctx.putImageData(d, 0, 0);
  return canvas;
}

/** Dore d'un demi-ton le bord éclairé de la silhouette, là où le contour sombre affleure. */
export function rim(src: HTMLCanvasElement, col: string): HTMLCanvasElement {
  const w = src.width, h = src.height;
  const { canvas, ctx } = makeSurface(w, h);
  ctx.drawImage(src, 0, 0);
  const d = ctx.getImageData(0, 0, w, h), a = d.data;
  const [R, G, B] = hexToRgb(col), out: number[] = [];
  const solid = (i: number, j: number): boolean => i >= 0 && j >= 0 && i < w && j < h && a[(j * w + i) * 4 + 3] > 0;
  const dark = (k: number): boolean => a[k] + a[k + 1] + a[k + 2] < 120;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const k = (j * w + i) * 4;
      if (!solid(i, j) || dark(k)) continue;
      const kl = (j * w + i - 1) * 4, ku = ((j - 1) * w + i) * 4;
      if ((solid(i - 1, j) && dark(kl) && !solid(i - 2, j)) || (solid(i, j - 1) && dark(ku) && !solid(i, j - 2))) out.push(k);
    }
  }
  for (const k of out) {
    a[k] = Math.round((a[k] + R) / 2);
    a[k + 1] = Math.round((a[k + 1] + G) / 2);
    a[k + 2] = Math.round((a[k + 2] + B) / 2);
  }
  ctx.putImageData(d, 0, 0);
  return canvas;
}

/** La finition complète d'un sprite : contour à l'encre, puis liseré doré. */
export function finish(c: HTMLCanvasElement): HTMLCanvasElement {
  return rim(outline(c, C.ink), C.o1);
}

/** Compose un sprite depuis des lignes de caractères et une palette de caractères. */
export function fromRows(rows: readonly string[], pal: Readonly<Record<string, string>>): HTMLCanvasElement {
  const { canvas, ctx } = makeSurface(rows[0].length, rows.length);
  const P = pen(ctx);
  rows.forEach((row, j) => {
    [...row].forEach((ch, i) => {
      if (ch !== '.') P.p(i, j, pal[ch]);
    });
  });
  return outline(canvas, C.ink);
}
