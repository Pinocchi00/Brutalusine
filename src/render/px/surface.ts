/** Une surface de dessin hors écran : le canevas et son contexte 2D, sans lissage. */
export interface Surface {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
}

/** Options de création : `read` réserve la surface aux lectures de pixels répétées. */
export interface SurfaceOptions {
  read?: boolean;
}

/** Crée une surface hors écran de `w × h` pixels, sans lissage. */
export function makeSurface(w: number, h: number, options: SurfaceOptions = {}): Surface {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', options.read ? { willReadFrequently: true } : undefined);
  if (!ctx) throw new Error('Contexte 2D indisponible');
  ctx.imageSmoothingEnabled = false;
  return { canvas, ctx };
}

/** Copie une surface sur un canevas normal, destiné à être dessiné à chaque image. */
export function copySurface(src: HTMLCanvasElement): HTMLCanvasElement {
  const { canvas, ctx } = makeSurface(src.width, src.height);
  ctx.drawImage(src, 0, 0);
  return canvas;
}
