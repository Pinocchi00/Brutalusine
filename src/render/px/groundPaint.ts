/**
 * La peinture du sol d'un bloc, fidèle à la maquette `heure-doree.html`.
 * Tout est pur : aucune API du navigateur, aucun état gardé entre deux appels.
 */
import { CHUNK } from '../../sim/world';
import { C } from './palette';
import { hash, rng, smooth, vnoise } from './noise';
import { TILE_PX } from './view';

/** Un segment de sentier, en cases du monde. */
export interface GroundPathSegment {
  ax: number;
  ay: number;
  bx: number;
  by: number;
}

/** Tout ce que la peinture sait d'un bloc et de sa marge d'une case. */
export interface GroundSource {
  readonly seed: number;
  /** La case monde du coin nord-ouest du bloc. */
  readonly originX: number;
  readonly originY: number;
  /** 33×33 coins, indice `j * 33 + i`. */
  readonly shore: ArrayLike<number>;
  /** 33×33 coins de gué, indice `j * 33 + i`, de 0 (eau normale) à 1 (plein gué). */
  readonly ford: ArrayLike<number>;
  readonly paths: readonly GroundPathSegment[];
  /** 34×34 cases (marge d'une case), indice `(ly + 1) * 34 + (lx + 1)`. */
  readonly slab: ArrayLike<number>;
  /** 32×32 cases, indice `ly * 32 + lx`. */
  readonly loot: ArrayLike<number>;
}

/** Le nombre de coins d'un côté du champ de rivage. */
const CORNER = CHUNK + 1;

/** Le nombre de cases d'un côté de la dalle, marge comprise. */
const SLAB_SIDE = CHUNK + 2;

/** La distance maximale, en pixels, à laquelle un sentier colore encore le sol. */
const DIRT_REACH = 4.5;

/** La marge de sécurité du bruit du sentier, en pixels. */
const DIRT_NOISE = 1.5;

/** La distance d'un centre de case à un segment au-delà de laquelle aucune case ne peut être peinte. */
const TILE_SEGMENT_REACH = TILE_PX * 0.75 + DIRT_REACH + DIRT_NOISE;

/** Le gué au-delà duquel l'eau devient une trame claire, sans bandes profondes. */
const FORD_FULL = 0.6;

/** Le gué à partir duquel l'eau s'éclaircit progressivement vers la trame. */
const FORD_SOFT = 0.5;

/** L'échelle du bruit de courant dans un gué, en cases. */
const FORD_WEAVE = 0.045;

/** Le seuil au-delà duquel la trame de gué prend le ton clair. */
const FORD_WEAVE_LIGHT = 0.62;

/** Les tons du sol, empaquetés en RGBA 32 bits (octet rouge en premier), pour peindre vite. */
const RGB = {
  q1: pack(C.q1), q2: pack(C.q2), q3: pack(C.q3), q4: pack(C.q4), q5: pack(C.q5),
  q6: pack(C.q6), q7: pack(C.q7),
  sd0: pack(C.sd0), sd1: pack(C.sd1), sd2: pack(C.sd2), sd3: pack(C.sd3),
  m1: pack(C.m1), m2: pack(C.m2), m3: pack(C.m3), m5: pack(C.m5),
  c0: pack(C.c0), c1: pack(C.c1), c2: pack(C.c2), c3: pack(C.c3), c4: pack(C.c4),
  e0: pack(C.e0), e1: pack(C.e1), e2: pack(C.e2),
  st0: pack(C.st0), st1: pack(C.st1), st3: pack(C.st3),
  s1: pack(C.s1), s3: pack(C.s3), ink: pack(C.ink),
} as const;

/** Empaquette une couleur opaque `#rrggbb` dans un entier RGBA 32 bits, rouge en premier. */
function pack(hex: string): number {
  const m = parseInt(hex.slice(1), 16);
  const r = (m >> 16) & 255;
  const g = (m >> 8) & 255;
  const b = m & 255;
  return (0xff000000 | (b << 16) | (g << 8) | r) >>> 0;
}

/** La couleur d'une eau de profondeur apparente `e`, du plus clair au plus profond. */
function waterColor(e: number): number {
  if (e > 76) return RGB.q7;
  if (e > 58) return RGB.q6;
  if (e > 42) return RGB.q5;
  if (e > 27) return RGB.q4;
  if (e > 13) return RGB.q3;
  return RGB.q2;
}

/** L'effacement progressif de la profondeur à l'approche du plein gué, de 0 à 1. */
function fordFade(f: number): number {
  if (f <= FORD_SOFT) return 0;
  return smooth(Math.min(1, (f - FORD_SOFT) / (FORD_FULL - FORD_SOFT)));
}

/** Un segment de sentier déjà converti en pixels du monde. */
interface SegmentPx {
  ax: number;
  ay: number;
  dx: number;
  dy: number;
  len2: number;
}

/** Le rectangle de sortie d'un appel, en pixels du monde. */
interface Bounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  width: number;
}

/** Un bruit de valeur précalculé sur le rectangle : les nœuds et les fractions par pixel. */
interface NoiseGrid {
  readonly width: number;
  readonly values: Float64Array;
  readonly colIndex: Int32Array;
  readonly colFrac: Float64Array;
  readonly rowIndex: Int32Array;
  readonly rowFrac: Float64Array;
}

/** Prépare un bruit `vnoise` sur tout un rectangle, sans changer ses valeurs. */
function makeNoiseGrid(
  bounds: Bounds,
  sx: number,
  sy: number,
  seed: number,
): NoiseGrid {
  const xi0 = Math.floor(bounds.x0 * sx);
  const xi1 = Math.floor((bounds.x1 - 1) * sx) + 1;
  const yi0 = Math.floor(bounds.y0 * sy);
  const yi1 = Math.floor((bounds.y1 - 1) * sy) + 1;
  const gw = xi1 - xi0 + 1;
  const gh = yi1 - yi0 + 1;
  const values = new Float64Array(gw * gh);
  for (let j = 0; j < gh; j++) {
    for (let i = 0; i < gw; i++) values[j * gw + i] = hash(xi0 + i, yi0 + j, seed);
  }
  const width = bounds.width;
  const height = bounds.y1 - bounds.y0;
  const colIndex = new Int32Array(width);
  const colFrac = new Float64Array(width);
  for (let x = 0; x < width; x++) {
    const g = (bounds.x0 + x) * sx;
    const i = Math.floor(g);
    colIndex[x] = i - xi0;
    colFrac[x] = smooth(g - i);
  }
  const rowIndex = new Int32Array(height);
  const rowFrac = new Float64Array(height);
  for (let y = 0; y < height; y++) {
    const g = (bounds.y0 + y) * sy;
    const j = Math.floor(g);
    rowIndex[y] = j - yi0;
    rowFrac[y] = smooth(g - j);
  }
  return { width: gw, values, colIndex, colFrac, rowIndex, rowFrac };
}

/** Une vue 32 bits de la sortie quand elle est alignée, sinon `null`. */
function pixelWords(out: Uint8ClampedArray): Uint32Array | null {
  if ((out.byteOffset & 3) !== 0 || (out.length & 3) !== 0) return null;
  return new Uint32Array(out.buffer, out.byteOffset, out.length >>> 2);
}

/** Le rectangle d'un appel en pixels du monde. */
function tileBounds(tx0: number, ty0: number, tx1: number, ty1: number): Bounds {
  return {
    x0: tx0 * TILE_PX,
    y0: ty0 * TILE_PX,
    x1: tx1 * TILE_PX,
    y1: ty1 * TILE_PX,
    width: (tx1 - tx0) * TILE_PX,
  };
}

/** Peint le socle brut (eau, rivage, dalle, prairie), sans sentier, décor ni débris. */
function paintGroundBase(
  src: GroundSource,
  out: Uint8ClampedArray,
  tx0: number,
  ty0: number,
  tx1: number,
  ty1: number,
): void {
  if (tx1 <= tx0 || ty1 <= ty0) return;
  const bounds = tileBounds(tx0, ty0, tx1, ty1);
  const out32 = pixelWords(out);
  const waterNoise = makeNoiseGrid(bounds, 0.03, 0.022, 3);
  const grassNoise = makeNoiseGrid(bounds, 0.016, 0.016, 11);
  const wnWidth = waterNoise.width;
  const wnValues = waterNoise.values;
  const wnCol = waterNoise.colIndex;
  const wnColF = waterNoise.colFrac;
  const wnRow = waterNoise.rowIndex;
  const wnRowF = waterNoise.rowFrac;
  const gnWidth = grassNoise.width;
  const gnValues = grassNoise.values;
  const gnCol = grassNoise.colIndex;
  const gnColF = grassNoise.colFrac;
  const gnRow = grassNoise.rowIndex;
  const gnRowF = grassNoise.rowFrac;

  for (let ty = ty0; ty < ty1; ty++) {
    const ly = ty - src.originY;
    const cornerRow = ly * CORNER;
    const slabRow = (ly + 1) * SLAB_SIDE;
    for (let tx = tx0; tx < tx1; tx++) {
      const lx = tx - src.originX;
      const c00 = src.shore[cornerRow + lx];
      const c10 = src.shore[cornerRow + lx + 1];
      const c01 = src.shore[cornerRow + CORNER + lx];
      const c11 = src.shore[cornerRow + CORNER + lx + 1];
      const f00 = src.ford[cornerRow + lx];
      const f10 = src.ford[cornerRow + lx + 1];
      const f01 = src.ford[cornerRow + CORNER + lx];
      const f11 = src.ford[cornerRow + CORNER + lx + 1];
      const hasFord = f00 !== 0 || f10 !== 0 || f01 !== 0 || f11 !== 0;
      const isSlab = src.slab[slabRow + lx + 1] !== 0;
      const baseX = tx * TILE_PX;
      const baseY = ty * TILE_PX;
      const localX = (tx - tx0) * TILE_PX;
      const localY = (ty - ty0) * TILE_PX;
      if (isSlab) {
        for (let py = 0; py < TILE_PX; py++) {
          const rowBase = (localY + py) * bounds.width + localX;
          for (let px = 0; px < TILE_PX; px++) {
            const index = rowBase + px;
            if (out32) out32[index] = RGB.c1;
            else {
              const o = index * 4;
              out[o] = RGB.c1 & 255;
              out[o + 1] = (RGB.c1 >>> 8) & 255;
              out[o + 2] = (RGB.c1 >>> 16) & 255;
              out[o + 3] = 255;
            }
          }
        }
        continue;
      }
      for (let py = 0; py < TILE_PX; py++) {
        const fy = py / TILE_PX;
        const rowOffset = localY + py;
        const rowBase = rowOffset * bounds.width + localX;
        const wri = wnRow[rowOffset];
        const wrf = wnRowF[rowOffset];
        const gri = gnRow[rowOffset];
        const grf = gnRowF[rowOffset];
        const ddStep = -((c10 - c00) + (c11 - c01 - (c10 - c00)) * fy);
        let dd = -(c00 + (c01 - c00) * fy) * TILE_PX;
        for (let px = 0; px < TILE_PX; px++) {
          const wx = baseX + px;
          const wy = baseY + py;
          const cx = localX + px;
          let color: number;
          if (dd > 3) {
            const ci = wnCol[cx];
            const u = wnColF[cx];
            const base = wri * wnWidth + ci;
            const a = wnValues[base];
            const b = wnValues[base + 1];
            const c = wnValues[base + wnWidth];
            const d = wnValues[base + wnWidth + 1];
            const noise = a + (b - a) * u + (c - a) * wrf + (a - b - c + d) * u * wrf;
            const e = dd + (noise - 0.5) * 10;
            if (!hasFord) {
              color = waterColor(e);
            } else {
              const fx = px / TILE_PX;
              const top = f00 + (f10 - f00) * fx;
              const bottom = f01 + (f11 - f01) * fx;
              const f = top + (bottom - top) * fy;
              if (f > FORD_FULL) {
                const flow = vnoise(wx * FORD_WEAVE, wy * FORD_WEAVE, 7);
                color = flow > FORD_WEAVE_LIGHT ? RGB.q1 : RGB.q2;
              } else {
                color = waterColor(e * (1 - f) * (1 - fordFade(f)));
              }
            }
          } else if (dd > -6) {
            color = RGB.sd2;
          } else if (dd > -8) {
            color = RGB.sd1;
          } else if (dd > -34) {
            color = hash(wx, wy, 9) < 0.035 ? RGB.sd1 : RGB.sd0;
          } else if (dd > -38) {
            color = ((wx + wy) & 1) === 0 ? RGB.m1 : RGB.sd0;
          } else {
            const ci = gnCol[cx];
            const u = gnColF[cx];
            const base = gri * gnWidth + ci;
            const a = gnValues[base];
            const b = gnValues[base + 1];
            const c = gnValues[base + gnWidth];
            const d = gnValues[base + gnWidth + 1];
            const n = a + (b - a) * u + (c - a) * grf + (a - b - c + d) * u * grf;
            const even = ((wx + wy) & 1) === 0;
            if (n > 0.67) color = RGB.m1;
            else if (n > 0.62) color = even ? RGB.m1 : RGB.m2;
            else if (n > 0.37) color = RGB.m2;
            else if (n > 0.32) color = even ? RGB.m2 : RGB.m3;
            else color = RGB.m3;
          }
          const index = rowBase + px;
          if (out32) out32[index] = color;
          else {
            const o = index * 4;
            out[o] = color & 255;
            out[o + 1] = (color >>> 8) & 255;
            out[o + 2] = (color >>> 16) & 255;
            out[o + 3] = 255;
          }
          dd += ddStep;
        }
      }
    }
  }
}

/** Peint le socle du sol (eau, rivage, sentier, dalle), sans décor ni débris. */
export function paintGroundCore(
  src: GroundSource,
  out: Uint8ClampedArray,
  tx0: number,
  ty0: number,
  tx1: number,
  ty1: number,
): void {
  if (tx1 <= tx0 || ty1 <= ty0) return;
  paintGroundBase(src, out, tx0, ty0, tx1, ty1);
  const bounds = tileBounds(tx0, ty0, tx1, ty1);
  paintPaths(src, out, bounds, tx0, ty0, tx1, ty1);
  paintSlabDetails(src, out, bounds, tx0, ty0, tx1, ty1, slabLookup(src));
}

/** Peint le bloc entier : socle, sentier, décor, détails de dalle, puis débris. */
export function paintTiles(
  src: GroundSource,
  out: Uint8ClampedArray,
  tx0: number,
  ty0: number,
  tx1: number,
  ty1: number,
): void {
  if (tx1 <= tx0 || ty1 <= ty0) return;
  paintGroundBase(src, out, tx0, ty0, tx1, ty1);
  const bounds = tileBounds(tx0, ty0, tx1, ty1);
  paintPaths(src, out, bounds, tx0, ty0, tx1, ty1);
  paintDecor(src, out, bounds, tx0, ty0, tx1, ty1);
  paintSlabDetails(src, out, bounds, tx0, ty0, tx1, ty1, slabLookup(src));
  paintDebris(src, out, bounds, tx0, ty0, tx1, ty1);
}

/** La distance d'un point à un segment, en pixels. */
function segmentDistance(px: number, py: number, seg: SegmentPx): number {
  let t = 0;
  if (seg.len2 > 0) {
    t = ((px - seg.ax) * seg.dx + (py - seg.ay) * seg.dy) / seg.len2;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
  }
  const x = seg.ax + t * seg.dx;
  const y = seg.ay + t * seg.dy;
  return Math.hypot(px - x, py - y);
}

/** Convertit les sentiers des cases en segments de pixels. */
function pixelSegments(paths: readonly GroundPathSegment[]): SegmentPx[] {
  const out: SegmentPx[] = [];
  for (const path of paths) {
    const ax = path.ax * TILE_PX;
    const ay = path.ay * TILE_PX;
    const dx = path.bx * TILE_PX - ax;
    const dy = path.by * TILE_PX - ay;
    out.push({ ax, ay, dx, dy, len2: dx * dx + dy * dy });
  }
  return out;
}

/** Ne garde, pour une case, que les segments qui peuvent encore la peindre. */
function fillCandidates(out: SegmentPx[], segments: readonly SegmentPx[], tx: number, ty: number): void {
  out.length = 0;
  const cx = tx * TILE_PX + TILE_PX / 2;
  const cy = ty * TILE_PX + TILE_PX / 2;
  for (const seg of segments) {
    if (segmentDistance(cx, cy, seg) <= TILE_SEGMENT_REACH) out.push(seg);
  }
}

/** Un accès sûr à la marge de dalles, en coordonnées locales de case. */
function slabLookup(src: GroundSource): (lx: number, ly: number) => boolean {
  return (lx: number, ly: number): boolean => {
    if (lx < -1 || ly < -1 || lx > CHUNK || ly > CHUNK) return false;
    return src.slab[(ly + 1) * SLAB_SIDE + lx + 1] !== 0;
  };
}

/** Écrit un pixel opaque du socle dans la sortie, sans déborder du rectangle demandé. */
function writePixel(out: Uint8ClampedArray, bounds: Bounds, lx: number, ly: number, color: number): void {
  const o = (ly * bounds.width + lx) * 4;
  out[o] = color & 255;
  out[o + 1] = (color >>> 8) & 255;
  out[o + 2] = (color >>> 16) & 255;
  out[o + 3] = 255;
}

/** Écrit un pixel du monde, en le rognant au rectangle demandé. */
function putWorld(out: Uint8ClampedArray, bounds: Bounds, wx: number, wy: number, color: number): void {
  if (wx < bounds.x0 || wx >= bounds.x1 || wy < bounds.y0 || wy >= bounds.y1) return;
  writePixel(out, bounds, wx - bounds.x0, wy - bounds.y0, color);
}

/** Remplit un rectangle du monde, rogné à la sortie. */
function fillWorld(
  out: Uint8ClampedArray,
  bounds: Bounds,
  x: number,
  y: number,
  w: number,
  h: number,
  color: number,
): void {
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) putWorld(out, bounds, x + i, y + j, color);
  }
}

/** Un trait de Bresenham, identique à celui du crayon de la maquette. */
function lineWorld(
  out: Uint8ClampedArray,
  bounds: Bounds,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: number,
): void {
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let e = dx + dy;
  let x = x0;
  let y = y0;
  for (let guard = 0; guard < 800; guard++) {
    putWorld(out, bounds, x, y, color);
    if (x === x1 && y === y1) break;
    const e2 = 2 * e;
    if (e2 >= dy) {
      e += dy;
      x += sx;
    }
    if (e2 <= dx) {
      e += dx;
      y += sy;
    }
  }
}

/** Peint le sentier et son halo sur la terre ferme, case par case, sans toucher au reste. */
function paintPaths(
  src: GroundSource,
  out: Uint8ClampedArray,
  bounds: Bounds,
  tx0: number,
  ty0: number,
  tx1: number,
  ty1: number,
): void {
  if (src.paths.length === 0) return;
  const segments = pixelSegments(src.paths);
  const candidates: SegmentPx[] = [];
  const noise = makeNoiseGrid(bounds, 0.12, 0.12, 31);
  const out32 = pixelWords(out);
  const dnWidth = noise.width;
  const dnValues = noise.values;
  const dnCol = noise.colIndex;
  const dnColF = noise.colFrac;
  const dnRow = noise.rowIndex;
  const dnRowF = noise.rowFrac;
  for (let ty = ty0; ty < ty1; ty++) {
    const ly = ty - src.originY;
    const slabRow = (ly + 1) * SLAB_SIDE;
    for (let tx = tx0; tx < tx1; tx++) {
      const lx = tx - src.originX;
      if (src.slab[slabRow + lx + 1] !== 0) continue;
      fillCandidates(candidates, segments, tx, ty);
      const candidateCount = candidates.length;
      if (candidateCount === 0) continue;
      const cornerRow = ly * CORNER;
      const c00 = src.shore[cornerRow + lx];
      const c10 = src.shore[cornerRow + lx + 1];
      const c01 = src.shore[cornerRow + CORNER + lx];
      const c11 = src.shore[cornerRow + CORNER + lx + 1];
      const baseX = tx * TILE_PX;
      const localX = (tx - tx0) * TILE_PX;
      const localY = (ty - ty0) * TILE_PX;
      for (let py = 0; py < TILE_PX; py++) {
        const fy = py / TILE_PX;
        const rowOffset = localY + py;
        const rowBase = rowOffset * bounds.width + localX;
        const dri = dnRow[rowOffset];
        const drf = dnRowF[rowOffset];
        const ddStep = -((c10 - c00) + (c11 - c01 - (c10 - c00)) * fy);
        let dd = -(c00 + (c01 - c00) * fy) * TILE_PX;
        for (let px = 0; px < TILE_PX; px++) {
          if (dd <= -38) {
            const wx = baseX + px;
            const wy = ty * TILE_PX + py;
            let nearest = Infinity;
            for (let k = 0; k < candidateCount; k++) {
              const distance = segmentDistance(wx, wy, candidates[k]);
              if (distance < nearest) nearest = distance;
            }
            const cx = localX + px;
            const ci = dnCol[cx];
            const u = dnColF[cx];
            const base = dri * dnWidth + ci;
            const a = dnValues[base];
            const b = dnValues[base + 1];
            const c = dnValues[base + dnWidth];
            const d = dnValues[base + dnWidth + 1];
            const n = a + (b - a) * u + (c - a) * drf + (a - b - c + d) * u * drf;
            const dirt = nearest - (n - 0.5) * 3;
            const even = ((wx + wy) & 1) === 0;
            let color = -1;
            if (dirt < 3.5) {
              const h = hash(wx, wy, 15);
              color = dirt < 2 ? RGB.e1 : RGB.e0;
              if (h > 0.96) color = RGB.e2;
              else if (h < 0.03) color = RGB.sd1;
            } else if (dirt < 4.5 && even && dirt > 3.5) {
              color = RGB.e0;
            }
            if (color !== -1) {
              const index = rowBase + px;
              if (out32) out32[index] = color;
              else {
                const o = index * 4;
                out[o] = color & 255;
                out[o + 1] = (color >>> 8) & 255;
                out[o + 2] = (color >>> 16) & 255;
                out[o + 3] = 255;
              }
            }
          }
          dd += ddStep;
        }
      }
    }
  }
}

/** Peint les joints, taches, lèvres et mousses de chaque dalle, dans l'ordre de la maquette. */
function paintSlabDetails(
  src: GroundSource,
  out: Uint8ClampedArray,
  bounds: Bounds,
  tx0: number,
  ty0: number,
  tx1: number,
  ty1: number,
  slabAt: (lx: number, ly: number) => boolean,
): void {
  for (let ty = ty0 - 1; ty < ty1; ty++) {
    const ly = ty - src.originY;
    for (let tx = tx0 - 1; tx < tx1; tx++) {
      const lx = tx - src.originX;
      if (!slabAt(lx, ly)) continue;
      paintSlabTile(out, bounds, tx, ty, lx, ly, slabAt);
    }
  }
}

/** Peint une dalle et ce qui déborde d'elle sur ses voisines du sud et de l'est. */
function paintSlabTile(
  out: Uint8ClampedArray,
  bounds: Bounds,
  tx: number,
  ty: number,
  lx: number,
  ly: number,
  slabAt: (lx: number, ly: number) => boolean,
): void {
  const X = tx * TILE_PX;
  const Y = ty * TILE_PX;
  const r = rng(tx * 17 + ty);
  fillWorld(out, bounds, X, Y, TILE_PX, 1, RGB.c0);
  fillWorld(out, bounds, X, Y, 1, TILE_PX, RGB.c0);
  fillWorld(out, bounds, X + TILE_PX - 1, Y, 1, TILE_PX, RGB.c2);
  fillWorld(out, bounds, X, Y + TILE_PX - 1, TILE_PX, 1, RGB.c2);
  if (r() < 0.4) {
    const a = X + 3 + Math.floor(r() * 12);
    const b = Y + 3 + Math.floor(r() * 12);
    for (let k = 0; k < 9; k++) {
      if (r() < 0.7) putWorld(out, bounds, a + (k % 3) * 2, b + Math.floor(k / 3), RGB.c2);
    }
  }
  if (r() < 0.15) {
    const a = X + 4 + Math.floor(r() * 12);
    const b = Y + 4 + Math.floor(r() * 12);
    lineWorld(out, bounds, a, b, a + 5, b + 3, RGB.c3);
  }
  if (!slabAt(lx, ly + 1)) {
    fillWorld(out, bounds, X, Y + TILE_PX - 3, TILE_PX, 1, RGB.c2);
    fillWorld(out, bounds, X, Y + TILE_PX - 2, TILE_PX, 1, RGB.c3);
    fillWorld(out, bounds, X, Y + TILE_PX - 1, TILE_PX, 1, RGB.c4);
    fillWorld(out, bounds, X, Y + TILE_PX, TILE_PX, 1, RGB.m5);
  }
  if (!slabAt(lx + 1, ly)) {
    fillWorld(out, bounds, X + TILE_PX - 1, Y, 1, TILE_PX, RGB.c3);
    fillWorld(out, bounds, X + TILE_PX, Y + 2, 1, TILE_PX - 1, RGB.m5);
  }
  if (!slabAt(lx, ly - 1)) {
    for (let i = 0; i < TILE_PX; i += 3) {
      if (r() < 0.6) putWorld(out, bounds, X + i, Y, RGB.m3);
    }
  }
  if (!slabAt(lx - 1, ly)) {
    for (let j = 0; j < TILE_PX; j += 3) {
      if (r() < 0.6) putWorld(out, bounds, X, Y + j, RGB.m3);
    }
  }
}

/** Peint l'écume, les galets, les pierres de gué et l'argile, case par case. */
function paintDecor(
  src: GroundSource,
  out: Uint8ClampedArray,
  bounds: Bounds,
  tx0: number,
  ty0: number,
  tx1: number,
  ty1: number,
): void {
  const seed = src.seed;
  for (let ty = ty0; ty < ty1; ty++) {
    const ly = ty - src.originY;
    const cornerRow = ly * CORNER;
    const slabRow = (ly + 1) * SLAB_SIDE;
    for (let tx = tx0; tx < tx1; tx++) {
      const lx = tx - src.originX;
      if (src.slab[slabRow + lx + 1] !== 0) continue;
      const c00 = src.shore[cornerRow + lx];
      const c10 = src.shore[cornerRow + lx + 1];
      const c01 = src.shore[cornerRow + CORNER + lx];
      const c11 = src.shore[cornerRow + CORNER + lx + 1];
      const f00 = src.ford[cornerRow + lx];
      const f10 = src.ford[cornerRow + lx + 1];
      const f01 = src.ford[cornerRow + CORNER + lx];
      const f11 = src.ford[cornerRow + CORNER + lx + 1];
      const ford = (f00 + f10 + f01 + f11) * 0.25;
      const avg = (c00 + c10 + c01 + c11) * 0.25;
      if (avg < -0.1 && avg > -1.3) foamTile(out, bounds, tx, ty, seed, c00, c10, c01, c11);
      if (avg > 0.1 && avg < 1.3) pebbleTile(out, bounds, tx, ty, seed, c00, c10, c01, c11);
      if (avg > 0.3 && avg < 1.7) clayTile(out, bounds, tx, ty, seed, avg, c00, c10, c01, c11);
      if (avg > 0.1 && avg < 1.2 && nearPath(src.paths, tx, ty)) {
        fordTile(out, bounds, tx, ty, seed, c00, c10, c01, c11);
      }
      if (avg < 0 && ford >= 0.7) fordStonesTile(out, bounds, tx, ty, seed);
    }
  }
}

/** La position locale d'une case, d'après un hash et un sel. */
function markX(tx: number, ty: number, salt: number): number {
  return Math.floor(hash(tx, ty, salt) * (TILE_PX - 2));
}

/** La position locale d'une ligne de case, d'après un hash et un sel. */
function markY(tx: number, ty: number, salt: number): number {
  return Math.floor(hash(tx, ty, salt) * (TILE_PX - 1));
}

/** La hauteur d'eau en pixels d'un pixel local d'une case, d'après ses quatre coins. */
function localDd(c00: number, c10: number, c01: number, c11: number, px: number, py: number): number {
  const fx = px / TILE_PX;
  const fy = py / TILE_PX;
  const top = c00 + (c10 - c00) * fx;
  const bottom = c01 + (c11 - c01) * fx;
  return -(top + (bottom - top) * fy) * TILE_PX;
}

/** L'écume d'une case d'eau : deux ou trois marques courtes, entièrement dans la case. */
function foamTile(
  out: Uint8ClampedArray,
  bounds: Bounds,
  tx: number,
  ty: number,
  seed: number,
  c00: number,
  c10: number,
  c01: number,
  c11: number,
): void {
  const count = 2 + (hash(tx, ty, seed + 81) < 0.67 ? 1 : 0);
  for (let k = 0; k < count; k++) {
    const x = markX(tx, ty, seed + 82 + k * 5);
    const y = markY(tx, ty, seed + 83 + k * 5);
    for (let j = 0; j < 2; j++) {
      for (let i = 0; i < 3; i++) {
        if (localDd(c00, c10, c01, c11, x + i, y + j) <= 3) continue;
        const color = i === 2 && j === 1 ? RGB.q3 : RGB.q1;
        putWorld(out, bounds, tx * TILE_PX + x + i, ty * TILE_PX + y + j, color);
      }
    }
  }
}

/** Un galet de sable sec : trois pixels de pierre et une ombre, dans la case. */
function pebbleTile(
  out: Uint8ClampedArray,
  bounds: Bounds,
  tx: number,
  ty: number,
  seed: number,
  c00: number,
  c10: number,
  c01: number,
  c11: number,
): void {
  const count = 1 + (hash(tx, ty, seed + 91) < 0.5 ? 1 : 0) + (hash(tx, ty, seed + 92) < 0.5 ? 1 : 0);
  for (let k = 0; k < count; k++) {
    const x = markX(tx, ty, seed + 93 + k * 6);
    const y = Math.floor(hash(tx, ty, seed + 94 + k * 6) * (TILE_PX - 3));
    for (let j = 0; j < 3; j++) {
      for (let i = 0; i < 3; i++) {
        if (j === 2 && i > 0) continue;
        const dd = localDd(c00, c10, c01, c11, x + i, y + j);
        if (dd > -6 || dd <= -38) continue;
        let color = RGB.st1;
        if (j === 0 && i === 0) color = RGB.st0;
        else if (j === 2) color = RGB.sd2;
        putWorld(out, bounds, tx * TILE_PX + x + i, ty * TILE_PX + y + j, color);
      }
    }
  }
}

/** Les pierres de gué, réservées aux cases où un sentier arrive près de l'eau. */
function fordTile(
  out: Uint8ClampedArray,
  bounds: Bounds,
  tx: number,
  ty: number,
  seed: number,
  c00: number,
  c10: number,
  c01: number,
  c11: number,
): void {
  const count = 1 + (hash(tx, ty, seed + 101) < 0.5 ? 1 : 0);
  for (let k = 0; k < count; k++) {
    const x = markX(tx, ty, seed + 102 + k * 4);
    const y = Math.floor(hash(tx, ty, seed + 103 + k * 4) * (TILE_PX - 3));
    for (let j = 0; j < 3; j++) {
      for (let i = 0; i < 3; i++) {
        const dd = localDd(c00, c10, c01, c11, x + i, y + j);
        if (dd > -6 || dd <= -38) continue;
        const color = j === 2 ? RGB.sd2 : RGB.sd1;
        putWorld(out, bounds, tx * TILE_PX + x + i, ty * TILE_PX + y + j, color);
      }
    }
  }
}

/** Deux ou trois pierres plates posées dans l'eau claire d'un gué, avec leur reflet et leur courant. */
function fordStonesTile(
  out: Uint8ClampedArray,
  bounds: Bounds,
  tx: number,
  ty: number,
  seed: number,
): void {
  const count = 2 + (hash(tx, ty, seed + 121) < 0.5 ? 1 : 0);
  for (let k = 0; k < count; k++) {
    const salt = seed + 122 + k * 7;
    const w = 5 + Math.floor(hash(tx, ty, salt) * 3);
    const h = 3 + Math.floor(hash(tx, ty, salt + 1) * 2);
    const x = Math.floor(hash(tx, ty, salt + 2) * (TILE_PX - w));
    const y = 1 + Math.floor(hash(tx, ty, salt + 3) * (TILE_PX - h - 2));
    const X = tx * TILE_PX + x;
    const Y = ty * TILE_PX + y;
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        let color = RGB.st1;
        if (j === 0 && i === 0) color = RGB.st0;
        else if (j === h - 1) color = RGB.st3;
        putWorld(out, bounds, X + i, Y + j, color);
      }
    }
    for (let i = 0; i < w; i++) putWorld(out, bounds, X + i, Y + h, RGB.q1);
  }
}

/** Une tache d'argile rare et tramée sur le sable sec, qui annonce l'Argilière. */
function clayTile(
  out: Uint8ClampedArray,
  bounds: Bounds,
  tx: number,
  ty: number,
  seed: number,
  avg: number,
  c00: number,
  c10: number,
  c01: number,
  c11: number,
): void {
  const zone = vnoise(tx / 12, ty / 12, seed + 110);
  if (zone < 0.72) return;
  if (hash(tx, ty, seed + 111) >= 0.3) return;
  if (avg > 1.55) return;
  const cx = 5 + hash(tx, ty, seed + 112) * 14;
  const cy = 5 + hash(tx, ty, seed + 113) * 14;
  const rx = 2 + hash(tx, ty, seed + 114) * 4;
  const ry = 1.5 + hash(tx, ty, seed + 115) * 3;
  for (let py = 0; py < TILE_PX; py++) {
    const dy = (py - cy) / ry;
    for (let px = 0; px < TILE_PX; px++) {
      const dx = (px - cx) / rx;
      const d2 = dx * dx + dy * dy;
      if (d2 > 1) continue;
      const dd = localDd(c00, c10, c01, c11, px, py);
      if (dd > -8 || dd <= -38) continue;
      const wx = tx * TILE_PX + px;
      const wy = ty * TILE_PX + py;
      if (d2 > 0.55 && hash(wx, wy, seed + 116) < 0.45) continue;
      const color = hash(wx, wy, seed + 117) < 0.3 ? RGB.e2 : RGB.sd3;
      putWorld(out, bounds, wx, wy, color);
    }
  }
}

/** Vrai si un sentier passe assez près d'une case pour qu'on y pose un gué. */
function nearPath(paths: readonly GroundPathSegment[], tx: number, ty: number): boolean {
  const cx = tx + 0.5;
  const cy = ty + 0.5;
  for (const path of paths) {
    if (pathDistance(cx, cy, path) <= 0.85) return true;
  }
  return false;
}

/** La distance d'un point en cases à un segment de sentier, en cases. */
function pathDistance(px: number, py: number, path: GroundPathSegment): number {
  const dx = path.bx - path.ax;
  const dy = path.by - path.ay;
  const len2 = dx * dx + dy * dy;
  let t = 0;
  if (len2 > 0) {
    t = ((px - path.ax) * dx + (py - path.ay) * dy) / len2;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
  }
  return Math.hypot(px - path.ax - t * dx, py - path.ay - t * dy);
}

/** La silhouette d'un petit morceau de ferraille, en coordonnées de case. */
function inScrap(x: number, y: number): boolean {
  return (x >= 6 && x <= 15 && y >= 9 && y <= 14) || (x >= 12 && x <= 17 && y >= 12 && y <= 16);
}

/** Peint les débris du bloc, par-dessus tout le reste. */
function paintDebris(
  src: GroundSource,
  out: Uint8ClampedArray,
  bounds: Bounds,
  tx0: number,
  ty0: number,
  tx1: number,
  ty1: number,
): void {
  for (let ty = ty0; ty < ty1; ty++) {
    const ly = ty - src.originY;
    for (let tx = tx0; tx < tx1; tx++) {
      const lx = tx - src.originX;
      if (src.loot[ly * CHUNK + lx] === 0) continue;
      const baseX = tx * TILE_PX;
      const baseY = ty * TILE_PX;
      for (let py = 0; py < TILE_PX; py++) {
        for (let px = 0; px < TILE_PX; px++) {
          const color = scrapPixel(px, py, baseX + px, baseY + py, src.seed);
          if (color !== 0) putWorld(out, bounds, baseX + px, baseY + py, color);
        }
      }
    }
  }
}

/** Un pixel de ferraille, ou `0` hors du morceau. */
function scrapPixel(px: number, py: number, wx: number, wy: number, seed: number): number {
  if (inScrap(px, py)) return hash(wx, wy, seed + 41) < 0.22 ? RGB.s3 : RGB.s1;
  const edge =
    inScrap(px - 1, py) || inScrap(px + 1, py) || inScrap(px, py - 1) || inScrap(px, py + 1);
  return edge ? RGB.ink : 0;
}
