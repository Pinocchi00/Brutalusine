/**
 * Les tapis du rendu pixel : la tuile de 24 px de la maquette, son cache, la géométrie du
 * chemin et la position des objets qui glissent dessus. Le dessin est identique à la maquette.
 */
import { BELT_SPEED, DX, DY, TILE_U } from '../../sim/data';
import type { Game } from '../../sim/game';
import type { BeltPath } from '../../sim/belts';
import { C } from './palette';
import { pen, type Pen } from './pen';
import { makeSurface } from './surface';
import { TILE_PX } from './view';

/** Un côté d'une case en pixels de pixel art. */
const T = TILE_PX;

/** Les quatre directions, dans l'ordre de la maquette : est, sud, ouest, nord. */
const D4: readonly (readonly [number, number])[] = [[1, 0], [0, 1], [-1, 0], [0, -1]];

/** Un vecteur à deux composantes, en pixels. */
type Vec = [number, number];

/** Une case d'un chemin de la maquette : x, y, direction de sortie, entrée de la première case. */
export type PathTile = readonly [x: number, y: number, out: number, firstIn?: number];

/** Un point du monde en pixels. */
export interface PathPoint {
  x: number;
  y: number;
}

/** La position d'un objet sur un chemin : le sol en pixels et sa hauteur sur un pont. */
export interface BeltPoint {
  x: number;
  y: number;
  z: number;
}

/** Le pivot d'une tuile en virage et les deux directions de son arc, comme dans la maquette. */
function pivotOf(inD: number, outD: number): { px: number; py: number; E: Vec; X: Vec } {
  const entry = (inD + 2) & 3;
  const px = entry === 0 || outD === 0 ? T : 0;
  const py = entry === 1 || outD === 1 ? T : 0;
  const hT = T / 2;
  const side: readonly Vec[] = [[T, hT], [hT, T], [0, hT], [hT, 0]];
  const norm = (v: Vec): Vec => {
    const l = Math.hypot(v[0], v[1]);
    return [v[0] / l, v[1] / l];
  };
  return {
    px,
    py,
    E: norm([side[entry][0] - px, side[entry][1] - py]),
    X: norm([side[outD][0] - px, side[outD][1] - py]),
  };
}

/** Peint une tuile de tapis de 24 px, au pixel près, comme la maquette. */
export function beltTile(P: Pen, X: number, Y: number, inD: number, outD: number, off: number): void {
  const ph = Math.floor(off) % 6;
  if (inD === outD) {
    const horiz = outD % 2 === 0;
    for (let j = 0; j < T; j++) {
      for (let i = 0; i < T; i++) {
        const a = horiz ? j : i;
        const b = horiz ? i : j;
        let col: string | null = null;
        if (a === 3 || a === 20) col = C.ink2;
        else if (a === 4) col = C.s1;
        else if (a === 5) col = C.s2;
        else if (a === 19) col = C.s3;
        else if (a === 18) col = C.s2;
        else if (a > 5 && a < 18) {
          const s = outD === 0 || outD === 1 ? b - ph : b + ph;
          col = (((s % 6) + 6) % 6) === 0 ? C.s3 : C.s4;
          if (a === 6) col = C.s3;
        }
        if (col) P.p(X + i, Y + j, col);
      }
    }
    for (const k of [4, 12, 20]) {
      if (horiz) {
        P.p(X + k, Y + 4, C.s0);
        P.p(X + k, Y + 21, C.s1);
      } else {
        P.p(X + 4, Y + k, C.s0);
        P.p(X + 19, Y + k, C.s1);
      }
    }
    if (horiz) {
      P.r(X, Y + 21, T, 1, C.s3);
      P.r(X, Y + 22, T, 1, C.ink2);
    }
    return;
  }
  const { px, py, E, X: XX } = pivotOf(inD, outD);
  for (let j = 0; j < T; j++) {
    for (let i = 0; i < T; i++) {
      const vx = i + 0.5 - px;
      const vy = j + 0.5 - py;
      const d = Math.hypot(vx, vy);
      if (d < 3 || d >= 21) continue;
      let col: string;
      if (d < 4 || d >= 20) col = C.ink2;
      else if (d < 5) col = C.s1;
      else if (d < 6) col = C.s2;
      else if (d >= 19) col = C.s3;
      else if (d >= 18) col = C.s2;
      else {
        const th = Math.atan2(vx * XX[0] + vy * XX[1], vx * E[0] + vy * E[1]);
        const s = Math.floor(th * 12);
        col = (((s - ph) % 6) + 6) % 6 === 0 ? C.s3 : C.s4;
      }
      P.p(X + i, Y + j, col);
    }
  }
}

/** La phase du tapis, ramenée sur ses six positions. */
function beltPhase(off: number): number {
  return ((Math.floor(off) % 6) + 6) % 6;
}

/** Le cache des tuiles : seize combinaisons de directions et six phases, dessinées une fois. */
const TILES = 16;
const PHASES = 6;
const tileCache: (HTMLCanvasElement | undefined)[] = new Array(TILES * PHASES);

/** La tuile de tapis en cache, prête à être blittée ; mêmes pixels que `beltTile` direct. */
export function beltTileImage(inD: number, outD: number, off: number): HTMLCanvasElement {
  const phase = beltPhase(off);
  const key = ((inD & 3) * 4 + (outD & 3)) * PHASES + phase;
  const hit = tileCache[key];
  if (hit) return hit;
  const { canvas, ctx } = makeSurface(T, T);
  beltTile(pen(ctx), 0, 0, inD & 3, outD & 3, phase);
  tileCache[key] = canvas;
  return canvas;
}

/** La position en pixels monde d'un point situé à `s` pixels du début d'un chemin. */
export function pathPos(tiles: readonly PathTile[], s: number): PathPoint | null {
  const k = Math.floor(s / T);
  if (k < 0 || k >= tiles.length) return null;
  const u = (s - k * T) / T;
  const tile = tiles[k];
  const tx = tile[0];
  const ty = tile[1];
  const out = tile[2];
  const firstIn = tile[3];
  const inD = k ? tiles[k - 1][2] : (firstIn ?? out);
  if (inD === out) {
    const [dx, dy] = D4[out];
    return {
      x: tx * T + T / 2 + dx * (u * T - T / 2),
      y: ty * T + T / 2 + dy * (u * T - T / 2),
    };
  }
  const { px, py, E, X } = pivotOf(inD, out);
  const th = u * Math.PI / 2;
  const R = T / 2;
  return {
    x: tx * T + px + R * (Math.cos(th) * E[0] + Math.sin(th) * X[0]),
    y: ty * T + py + R * (Math.cos(th) * E[1] + Math.sin(th) * X[1]),
  };
}

/** La position en pixels monde d'un objet du jeu situé à `pos` unités du début du chemin. */
export function pathItemPixels(p: BeltPath, pos: number): BeltPoint {
  const k = p.tileIndex(pos);
  const t = p.tiles[k];
  const f = (pos - p.starts[k]) / p.lens[k];
  const cx = t.x + 0.5;
  const cy = t.y + 0.5;
  let x: number;
  let y: number;
  let z = 0;
  if (p.lens[k] > TILE_U) {
    const span = p.lens[k] / TILE_U;
    x = cx + DX[t.rot] * (f * span - 0.5);
    y = cy + DY[t.rot] * (f * span - 0.5);
    if (f * span >= 0.5) {
      const rise = (f * span - 0.5) / (span - 1);
      z = 0.05 + Math.sin(Math.PI * Math.min(1, Math.max(0, rise))) * 0.3;
    }
  } else if (t.inDir !== t.rot && t.inDir !== ((t.rot + 2) & 3)) {
    const a = f * Math.PI / 2;
    const co = Math.cos(a) * 0.5;
    const si = Math.sin(a) * 0.5;
    x = cx - DX[t.inDir] * 0.5 + DX[t.rot] * 0.5 - DX[t.rot] * co + DX[t.inDir] * si;
    y = cy - DY[t.inDir] * 0.5 + DY[t.rot] * 0.5 - DY[t.rot] * co + DY[t.inDir] * si;
  } else {
    x = cx + DX[t.rot] * (f - 0.5);
    y = cy + DY[t.rot] * (f - 0.5);
  }
  return { x: x * T, y: y * T, z: z * T };
}

/** Dessine les tapis visibles et les objets posés dessus, en pixels monde ; la bande suit exactement la simulation. */
export function drawBelts(
  ctx: CanvasRenderingContext2D,
  g: Game,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  itemImg: (id: number) => HTMLCanvasElement,
): void {
  const phase = (g.tick * BELT_SPEED / TILE_U) * T;
  const paths = g.paths;
  for (let i = 0; i < paths.length; i++) {
    const p = paths[i];
    if (p.maxx + 1 < x0 || p.minx - 1 > x1 || p.maxy + 1 < y0 || p.miny - 1 > y1) continue;
    const tiles = p.tiles;
    for (let k = 0; k < tiles.length; k++) {
      const t = tiles[k];
      if (t.def.kind === 'bridge') continue;
      if (t.x < x0 || t.x > x1 || t.y < y0 || t.y > y1) continue;
      ctx.drawImage(beltTileImage(t.inDir, t.rot, phase), t.x * T, t.y * T);
    }
  }
  for (let i = 0; i < paths.length; i++) {
    const p = paths[i];
    if (p.maxx + 1 < x0 || p.minx - 1 > x1 || p.maxy + 1 < y0 || p.miny - 1 > y1) continue;
    let dist = 0;
    for (let k = p.head; k < p.types.length; k++) {
      dist += p.gaps[k];
      const pos = p.length - dist;
      const q = pathItemPixels(p, pos);
      if (q.x < x0 * T || q.x > (x1 + 1) * T || q.y < y0 * T || q.y > (y1 + 1) * T) continue;
      const img = itemImg(p.types[k]);
      const px = Math.round(q.x - img.width / 2);
      const py = Math.round(q.y - q.z - img.height / 2 - 1);
      ctx.drawImage(img, px, py);
    }
  }
}
