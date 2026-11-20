/** Une surface de dessin hors écran : le canevas et son contexte 2D, sans lissage. */
export interface Surface {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
}

/** Crée une surface hors écran de `w × h` pixels, en lecture rapide et sans lissage. */
export function makeSurface(w: number, h: number): Surface {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Contexte 2D indisponible');
  ctx.imageSmoothingEnabled = false;
  return { canvas, ctx };
}
