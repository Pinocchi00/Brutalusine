/**
 * La fenêtre pixel : tout ce qui relie l'écran, le tampon et le monde.
 * Le monde est en cases, un pixel monde vaut 1/24 de case et l'écran est en pixels physiques.
 * Ce module est pur : aucune API du navigateur, testable sous Node.
 */

/** Le nombre de pixels de pixel art dans une case du monde. */
export const TILE_PX = 24;

/** L'échelle réelle du rendu pixel : un multiple entier de case, jamais nul. */
export function renderZoom(zoom: number): number {
  return Math.max(1, Math.round(zoom / TILE_PX)) * TILE_PX;
}

/** Le nombre de lignes monde que l'écran montre par défaut (le cadrage de la maquette). */
const DEFAULT_WORLD_LINES = 360;

/** Le nombre minimal de lignes monde que l'écran doit montrer. */
const MIN_WORLD_LINES = 240;

/** Le nombre maximal de lignes monde que l'écran doit montrer. */
const MAX_WORLD_LINES = 720;

/** Un point à deux coordonnées, en cases, en pixels physiques ou en pixels de tampon. */
export interface Point {
  x: number;
  y: number;
}

/** La fenêtre calculée : échelle entière, tampon, origine, pose et cases visibles. */
export interface PixelView {
  readonly scale: number;
  readonly screenW: number;
  readonly screenH: number;
  readonly bufW: number;
  readonly bufH: number;
  readonly originX: number;
  readonly originY: number;
  readonly blitX: number;
  readonly blitY: number;
  readonly tileX0: number;
  readonly tileY0: number;
  readonly tileX1: number;
  readonly tileY1: number;
}

/** L'échelle entière par défaut (≥ 1) qui montre environ 360 lignes monde. */
export function pickScale(screenW: number, screenH: number): number {
  void screenW;
  return Math.max(1, Math.round(screenH / DEFAULT_WORLD_LINES));
}

/** Les échelles permises : l'écran montre alors entre 240 et 720 lignes monde. */
export function scaleBounds(screenW: number, screenH: number): { min: number; max: number } {
  void screenW;
  const min = Math.max(1, Math.ceil(screenH / MAX_WORLD_LINES));
  const max = Math.max(min, Math.floor(screenH / MIN_WORLD_LINES));
  return { min, max };
}

/** Un cran de molette sur l'échelle, toujours ramené dans les bornes de l'écran. */
export function stepScale(scale: number, delta: number, screenW: number, screenH: number): number {
  const { min, max } = scaleBounds(screenW, screenH);
  return Math.min(max, Math.max(min, scale + delta));
}

/** Calcule la fenêtre complète : tampon, origine entière, pose entière et cases visibles. */
export function computeView(
  camX: number,
  camY: number,
  scale: number,
  screenW: number,
  screenH: number,
  margin = 0,
): PixelView {
  const wx0 = camX * TILE_PX - screenW / (2 * scale);
  const wy0 = camY * TILE_PX - screenH / (2 * scale);
  const bufW = Math.ceil(screenW / scale) + 2;
  const bufH = Math.ceil(screenH / scale) + 2;
  const originX = Math.floor(wx0) - 1;
  const originY = Math.floor(wy0) - 1;
  const blitX = -Math.round((wx0 - originX) * scale);
  const blitY = -Math.round((wy0 - originY) * scale);
  const spanX = visibleTileSpan(originX, blitX, screenW, scale);
  const spanY = visibleTileSpan(originY, blitY, screenH, scale);
  return {
    scale,
    screenW,
    screenH,
    bufW,
    bufH,
    originX,
    originY,
    blitX,
    blitY,
    tileX0: spanX.first - margin,
    tileY0: spanY.first - margin,
    tileX1: spanX.last + margin,
    tileY1: spanY.last + margin,
  };
}

/** Un point de l'écran (pixels physiques) ramené en cases flottantes du monde. */
export function screenToWorld(view: PixelView, sx: number, sy: number): Point {
  return {
    x: (view.originX + (sx - view.blitX) / view.scale) / TILE_PX,
    y: (view.originY + (sy - view.blitY) / view.scale) / TILE_PX,
  };
}

/** Un point du monde (cases) projeté en pixels physiques de l'écran. */
export function worldToScreen(view: PixelView, wx: number, wy: number): Point {
  return {
    x: view.blitX + (wx * TILE_PX - view.originX) * view.scale,
    y: view.blitY + (wy * TILE_PX - view.originY) * view.scale,
  };
}

/** Un point du monde (cases) ramené en pixels flottants du tampon. */
export function worldToBuffer(view: PixelView, wx: number, wy: number): Point {
  return {
    x: wx * TILE_PX - view.originX,
    y: wy * TILE_PX - view.originY,
  };
}

/** Les cases visibles d'un axe, bornes incluses, d'après les pixels réellement à l'écran. */
function visibleTileSpan(
  origin: number,
  blit: number,
  screen: number,
  scale: number,
): { first: number; last: number } {
  const firstPixel = Math.floor(origin - blit / scale);
  const lastPixel = Math.ceil(origin + (screen - blit) / scale) - 1;
  return {
    first: Math.floor(firstPixel / TILE_PX),
    last: Math.floor(lastPixel / TILE_PX),
  };
}
