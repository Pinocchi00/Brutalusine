/**
 * La vie du sol du rendu pixel : le clapotis, l'écume, les reflets, les nénuphars, les roseaux,
 * les touffes et les fleurs. C'est la transposition de `docs/maquettes/heure-doree.html` à une
 * rivière qui tourne dans tous les sens : le champ de rivage donne la ligne zéro et sa normale,
 * au lieu du seul `SHORE[j]` horizontal de la maquette.
 */
import { hash } from './noise';
import { C } from './palette';
import type { Pen } from './pen';

const T = 24;
const CHUNK = 32;
const CORNER = CHUNK + 1;
const TAU = Math.PI * 2;

/** Une graine propre à un canal de tirage, pour ne pas corréler les décorations d'une même case. */
function salt(seed: number, channel: number): number {
  return (seed ^ Math.imul(channel + 1, 0x9e3779b1)) | 0;
}

/** Une source de vie du sol : la graine, l'origine du bloc, son rivage et ses cases. */
export interface LifeSource {
  readonly seed: number;
  readonly originX: number;
  readonly originY: number;
  readonly shore: ArrayLike<number>;
  readonly ground: ArrayLike<number>;
}

/** Un point de la ligne zéro du rivage, avec la normale unitaire dirigée vers l'eau. */
export interface ShorePoint {
  readonly x: number;
  readonly y: number;
  readonly nx: number;
  readonly ny: number;
  readonly k: number;
  readonly tx: number;
  readonly ty: number;
}

/** Un reflet du soleil sur l'eau profonde. */
export interface GroundGlint {
  readonly x: number;
  readonly y: number;
  readonly nx: number;
  readonly ny: number;
  readonly per: number;
  readonly phase: number;
  readonly tx: number;
  readonly ty: number;
}

/** Un nénuphar, avec ou sans fleur. */
export interface GroundLily {
  readonly x: number;
  readonly y: number;
  readonly fl: boolean;
  readonly tx: number;
  readonly ty: number;
}

/** Un roseau penché. */
export interface GroundReed {
  readonly x: number;
  readonly y: number;
  readonly h: number;
  readonly ph: number;
  readonly tx: number;
  readonly ty: number;
}

/** Une touffe d'herbe. */
export interface GroundTuft {
  readonly x: number;
  readonly y: number;
  readonly tx: number;
  readonly ty: number;
}

/** Une fleur, avec sa paire de couleurs et sa phase de balancement. */
export interface GroundFlower {
  readonly x: number;
  readonly y: number;
  readonly c1: string;
  readonly c2: string;
  readonly ph: number;
  readonly tx: number;
  readonly ty: number;
}

/** Tout ce qu'un bloc porte de vivant sur son sol, calculé une fois et immuable. */
export interface GroundLife {
  readonly originX: number;
  readonly originY: number;
  readonly seed: number;
  readonly shore: readonly ShorePoint[];
  readonly glints: readonly GroundGlint[];
  readonly lilies: readonly GroundLily[];
  readonly reeds: readonly GroundReed[];
  readonly tufts: readonly GroundTuft[];
  readonly flowers: readonly GroundFlower[];
}

// =====================================================================================
// La ligne zéro : on marche sur les arêtes des cases (marching squares), puis on
// rééchantillonne chaque chaîne au pixel. Les valeurs aux coins sont linéaires le long
// d'une arête, donc les croisements sont exacts ; à l'intérieur d'une case, on relie.
// =====================================================================================

interface Cross {
  readonly id: number;
  readonly x: number;
  readonly y: number;
}

interface Segment {
  readonly a: Cross;
  readonly b: Cross;
}

/** Lit un coin du champ, en coordonnées de coin locales (0 à 32). */
function cornerAt(shore: ArrayLike<number>, i: number, j: number): number {
  return shore[j * CORNER + i];
}

/** Le croisement horizontal de l'arête entre les coins (i, j) et (i + 1, j). */
function hCross(shore: ArrayLike<number>, i: number, j: number, ox: number, oy: number): Cross {
  const a = cornerAt(shore, i, j);
  const b = cornerAt(shore, i + 1, j);
  const t = a / (a - b);
  return { id: (j * CORNER + i) * 2, x: ox + (i + t) * T, y: oy + j * T };
}

/** Le croisement vertical de l'arête entre les coins (i, j) et (i, j + 1). */
function vCross(shore: ArrayLike<number>, i: number, j: number, ox: number, oy: number): Cross {
  const a = cornerAt(shore, i, j);
  const d = cornerAt(shore, i, j + 1);
  const t = a / (a - d);
  return { id: (j * CORNER + i) * 2 + 1, x: ox + i * T, y: oy + (j + t) * T };
}

/** Assemble les segments de la ligne zéro de tout le bloc. */
function contourSegments(shore: ArrayLike<number>, ox: number, oy: number): Segment[] {
  const out: Segment[] = [];
  const add = (a: Cross | null, b: Cross | null): void => {
    if (a !== null && b !== null) out.push({ a, b });
  };
  for (let j = 0; j < CHUNK; j++) {
    for (let i = 0; i < CHUNK; i++) {
      const a = cornerAt(shore, i, j);
      const b = cornerAt(shore, i + 1, j);
      const c = cornerAt(shore, i + 1, j + 1);
      const d = cornerAt(shore, i, j + 1);
      const ta = a < 0;
      const tb = b < 0;
      const tc = c < 0;
      const td = d < 0;
      const n = (ta ? 1 : 0) + (tb ? 1 : 0) + (tc ? 1 : 0) + (td ? 1 : 0);
      if (n === 0 || n === 4) continue;
      const top = ta !== tb ? hCross(shore, i, j, ox, oy) : null;
      const right = tb !== tc ? vCross(shore, i + 1, j, ox, oy) : null;
      const bottom = tc !== td ? hCross(shore, i, j + 1, ox, oy) : null;
      const left = ta !== td ? vCross(shore, i, j, ox, oy) : null;
      if (n === 2) {
        // Deux croisements opposés sont possibles quand la ligne zéro longe une arête.
        const pts: Cross[] = [];
        if (top !== null) pts.push(top);
        if (right !== null) pts.push(right);
        if (bottom !== null) pts.push(bottom);
        if (left !== null) pts.push(left);
        add(pts[0], pts[1]);
      } else {
        // Cas selle : le signe au centre départage les deux diagonales.
        const centre = (a + b + c + d) / 4;
        const centreWater = centre < 0;
        if (ta === tc) {
          const connected = centreWater === ta;
          if (connected) {
            add(top, right);
            add(bottom, left);
          } else {
            add(top, left);
            add(right, bottom);
          }
        } else {
          const connected = centreWater === tb;
          if (connected) {
            add(top, left);
            add(right, bottom);
          } else {
            add(top, right);
            add(bottom, left);
          }
        }
      }
    }
  }
  return out;
}

/** Le champ interpolé entre les quatre coins d'une case, en coordonnées de coin. */
function shoreAt(shore: ArrayLike<number>, u: number, v: number): number {
  const cu = u < 0 ? 0 : u > CHUNK ? CHUNK : u;
  const cv = v < 0 ? 0 : v > CHUNK ? CHUNK : v;
  let i = Math.floor(cu);
  let j = Math.floor(cv);
  if (i >= CHUNK) i = CHUNK - 1;
  if (j >= CHUNK) j = CHUNK - 1;
  const fu = cu - i;
  const fv = cv - j;
  const a = cornerAt(shore, i, j);
  const b = cornerAt(shore, i + 1, j);
  const c = cornerAt(shore, i, j + 1);
  const d = cornerAt(shore, i + 1, j + 1);
  return a + (b - a) * fu + (c - a) * fv + (a - b - c + d) * fu * fv;
}

/** Construit les points du clapotis, rééchantillonnés tous les pixels le long de la ligne zéro. */
function shoreLine(shore: ArrayLike<number>, originX: number, originY: number): ShorePoint[] {
  const ox = originX * T;
  const oy = originY * T;
  const segments = contourSegments(shore, ox, oy);
  if (segments.length === 0) return [];

  const edges = new Map<number, number[]>();
  for (let s = 0; s < segments.length; s++) {
    const seg = segments[s];
    const la = edges.get(seg.a.id);
    const lb = edges.get(seg.b.id);
    if (la === undefined) edges.set(seg.a.id, [s]);
    else la.push(s);
    if (lb === undefined) edges.set(seg.b.id, [s]);
    else lb.push(s);
  }

  const used = new Uint8Array(segments.length);
  const points: ShorePoint[] = [];

  const extend = (fromId: number, fromSeg: number, chain: Cross[]): void => {
    let seg = fromSeg;
    let id = fromId;
    let guard = 0;
    while (guard++ < segments.length + 2) {
      const list = edges.get(id);
      if (list === undefined) return;
      let next = -1;
      for (let n = 0; n < list.length; n++) {
        const candidate = list[n];
        if (candidate !== seg && used[candidate] === 0) {
          next = candidate;
          break;
        }
      }
      if (next < 0) return;
      used[next] = 1;
      const s = segments[next];
      const far = s.a.id === id ? s.b : s.a;
      chain.push(far);
      seg = next;
      id = far.id;
    }
  };

  const local = { u: 0, v: 0 };

  for (let s = 0; s < segments.length; s++) {
    if (used[s] === 1) continue;
    used[s] = 1;
    const seed = segments[s];
    const forward: Cross[] = [seed.a, seed.b];
    extend(seed.b.id, s, forward);
    const backward: Cross[] = [];
    extend(seed.a.id, s, backward);
    backward.reverse();
    const chain = backward.concat(forward);

    // L'indice part d'une projection monde le long de la tangente : deux blocs voisins
    // retrouvent la même phase sans se connaître, et le pas reste de 0,025 par point.
    const first = chain[0];
    const second = chain[1];
    let k0 = 0;
    let localIndex = 0;
    if (first !== undefined && second !== undefined) {
      const tx = second.x - first.x;
      const ty = second.y - first.y;
      const len = Math.hypot(tx, ty);
      if (len > 0.0001) k0 = Math.round(first.x * tx / len + first.y * ty / len);
    }

    for (let q = 0; q + 1 < chain.length; q++) {
      const p0 = chain[q];
      const p1 = chain[q + 1];
      const dx = p1.x - p0.x;
      const dy = p1.y - p0.y;
      const len = Math.hypot(dx, dy);
      if (len < 0.0001) continue;
      let nx = -dy / len;
      let ny = dx / len;
      // La normale doit regarder l'eau, c'est-à-dire le côté où le champ diminue.
      const mx = (p0.x + p1.x) / 2;
      const my = (p0.y + p1.y) / 2;
      local.u = (mx - ox) / T;
      local.v = (my - oy) / T;
      const here = shoreAt(shore, local.u, local.v);
      local.u = (mx + nx - ox) / T;
      local.v = (my + ny - oy) / T;
      if (shoreAt(shore, local.u, local.v) > here) {
        nx = -nx;
        ny = -ny;
      }

      const n = Math.max(1, Math.round(len));
      for (let k = 0; k < n; k++) {
        const t = k / n;
        const x = p0.x + dx * t;
        const y = p0.y + dy * t;
        const tx = Math.max(originX, Math.min(originX + CHUNK - 1, Math.floor(x / T)));
        const ty = Math.max(originY, Math.min(originY + CHUNK - 1, Math.floor(y / T)));
        points.push({ x, y, nx, ny, k: k0 + localIndex++, tx, ty });
      }
    }
    if (chain.length > 1) {
      const last = chain[chain.length - 1];
      const prev = chain[chain.length - 2];
      const dx = last.x - prev.x;
      const dy = last.y - prev.y;
      const len = Math.hypot(dx, dy);
      let nx = len > 0.0001 ? -dy / len : 0;
      let ny = len > 0.0001 ? dx / len : 1;
      local.u = (last.x + nx - ox) / T;
      local.v = (last.y + ny - oy) / T;
      if (shoreAt(shore, local.u, local.v) > shoreAt(shore, (last.x - ox) / T, (last.y - oy) / T)) {
        nx = -nx;
        ny = -ny;
      }
      const tx = Math.max(originX, Math.min(originX + CHUNK - 1, Math.floor(last.x / T)));
      const ty = Math.max(originY, Math.min(originY + CHUNK - 1, Math.floor(last.y / T)));
      points.push({ x: last.x, y: last.y, nx, ny, k: k0 + localIndex++, tx, ty });
    }
  }
  return points;
}

// =====================================================================================
// Le placement : tout sort de `hash` sur les cases monde, donc un bloc se calcule seul.
// =====================================================================================

/** Les quatre paires de couleurs des fleurs, à l'identique de la maquette. */
const FLOWER_COLORS: readonly (readonly [string, string])[] = [
  [C.pink, C.pink2],
  [C.white, C.c2],
  [C.o1, C.o2],
  [C.blue, '#6f8fd8'],
];

/** Les quatre brins d'une touffe : décalage et hauteur. */
const TUFT_STEMS: readonly (readonly [number, number])[] = [[-3, 3], [-1, 5], [1, 6], [3, 4]];

/** Calcule une fois ce qu'un bloc porte. Pur et déterministe. */
export function layoutLife(src: LifeSource): GroundLife {
  const originX = src.originX;
  const originY = src.originY;
  const seed = src.seed;
  const ox = originX * T;
  const oy = originY * T;
  const shore = shoreLine(src.shore, originX, originY);
  const glints: GroundGlint[] = [];
  const lilies: GroundLily[] = [];
  const reeds: GroundReed[] = [];
  const tufts: GroundTuft[] = [];
  const flowers: GroundFlower[] = [];

  // La valeur du champ au centre de chaque case : profondeur d'eau ou éloignement du bord.
  const centre = new Float32Array(CHUNK * CHUNK);
  for (let ly = 0; ly < CHUNK; ly++) {
    for (let lx = 0; lx < CHUNK; lx++) {
      centre[ly * CHUNK + lx] = shoreAt(src.shore, lx + 0.5, ly + 0.5);
    }
  }

  const tileOf = (x: number, y: number): number => {
    const lx = Math.floor(x / T) - originX;
    const ly = Math.floor(y / T) - originY;
    if (lx < 0 || lx >= CHUNK || ly < 0 || ly >= CHUNK) return -1;
    return ly * CHUNK + lx;
  };
  const soilAt = (x: number, y: number): boolean => {
    const t = tileOf(x, y);
    return t >= 0 && src.ground[t] === 0;
  };
  const waterAt = (x: number, y: number): boolean => {
    const t = tileOf(x, y);
    return t >= 0 && src.ground[t] === 1;
  };
  const depthAt = (x: number, y: number): number => {
    const t = tileOf(x, y);
    return t >= 0 ? -centre[t] * T : -1;
  };

  let flowerGroup = 0;
  for (let ly = 0; ly < CHUNK; ly++) {
    for (let lx = 0; lx < CHUNK; lx++) {
      const code = src.ground[ly * CHUNK + lx];
      const tx = originX + lx;
      const ty = originY + ly;
      const ax = ox + (lx + 0.5) * T;
      const ay = oy + (ly + 0.5) * T;
      const depth = -centre[ly * CHUNK + lx] * T;

      if (code === 0) {
        // Des touffes par petits groupes sur la prairie.
        const ht = hash(tx, ty, salt(seed, 1));
        if (ht < 0.01) {
          const count = 3 + Math.floor(hash(tx, ty, salt(seed, 2)) * 3);
          for (let n = 0; n < count; n++) {
            const x = Math.round(ax + (hash(tx + n * 131 + 17, ty, salt(seed, 3)) - 0.5) * 34);
            const y = Math.round(ay + (hash(tx, ty + n * 97 + 31, salt(seed, 4)) - 0.5) * 18);
            if (!soilAt(x, y) || !soilAt(x - 3, y) || !soilAt(x + 3, y)) continue;
            if (!soilAt(x - 3, y - 6) || !soilAt(x, y - 6) || !soilAt(x + 3, y - 6)) continue;
            tufts.push({ x, y, tx: Math.floor(x / T), ty: Math.floor(y / T) });
          }
        }
        // Des fleurs par groupes de six, en faisant tourner les quatre couleurs.
        const hf = hash(tx, ty, salt(seed, 5));
        if (hf < 0.006) {
          const pair = FLOWER_COLORS[flowerGroup % FLOWER_COLORS.length];
          flowerGroup++;
          for (let n = 0; n < 6; n++) {
            const x = Math.round(ax + (hash(tx + n * 71 + 11, ty + 3, salt(seed, 6)) - 0.5) * 18);
            const y = Math.round(ay + (hash(tx + 5, ty + n * 53 + 7, salt(seed, 7)) - 0.5) * 10);
            if (!soilAt(x, y) || !soilAt(x - 2, y) || !soilAt(x + 2, y)) continue;
            if (!soilAt(x - 2, y - 4) || !soilAt(x, y - 4) || !soilAt(x + 2, y - 4)) continue;
            flowers.push({
              x, y, c1: pair[0], c2: pair[1],
              ph: hash(tx + n * 29, ty + n * 41, salt(seed, 8)) * TAU,
              tx: Math.floor(x / T), ty: Math.floor(y / T),
            });
          }
        }
      } else if (code === 1) {
        // Des reflets sur l'eau profonde, à 16-90 pixels du bord.
        if (depth >= 16 && depth <= 90 && hash(tx, ty, salt(seed, 9)) < 0.55) {
          const u = lx + 0.5;
          const v = ly + 0.5;
          const e = 0.25;
          let gx = shoreAt(src.shore, u + e, v) - shoreAt(src.shore, u - e, v);
          let gy = shoreAt(src.shore, u, v + e) - shoreAt(src.shore, u, v - e);
          const gl = Math.hypot(gx, gy) || 1;
          gx /= gl;
          gy /= gl;
          const per = 7 + hash(tx, ty, salt(seed, 10)) * 5;
          glints.push({
            x: Math.round(ax + (hash(tx, ty, salt(seed, 11)) - 0.5) * 12),
            y: Math.round(ay + (hash(tx, ty, salt(seed, 12)) - 0.5) * 12),
            nx: -gx, ny: -gy, per,
            phase: hash(tx, ty, salt(seed, 13)) * per,
            tx, ty,
          });
        }
        // Des roseaux par groupes, juste au bord de l'eau.
        if (depth >= 2 && depth <= 16 && hash(tx, ty, salt(seed, 14)) < 0.3) {
          const count = 3 + Math.floor(hash(tx, ty, salt(seed, 15)) * 3);
          for (let n = 0; n < count; n++) {
            const x = Math.round(ax + (hash(tx + n * 43 + 19, ty, salt(seed, 16)) - 0.5) * 20);
            const y = Math.round(ay + (hash(tx, ty + n * 61 + 23, salt(seed, 17)) - 0.5) * 8);
            if (!waterAt(x, y)) continue;
            const d = depthAt(x, y);
            if (d < 1 || d > 18) continue;
            const h = 8 + Math.floor(hash(tx + n * 13, ty + n * 17, salt(seed, 18)) * 8);
            reeds.push({
              x, y, h,
              ph: hash(tx + n * 37, ty + n * 11, salt(seed, 19)) * TAU,
              tx: Math.floor(x / T), ty: Math.floor(y / T),
            });
          }
        }
        // Des nénuphars en petits groupes sur l'eau calme, une fleur une fois sur deux.
        if (depth >= 18 && depth <= 60 && hash(tx, ty, salt(seed, 20)) < 0.03) {
          const count = 2 + Math.floor(hash(tx, ty, salt(seed, 21)) * 2);
          for (let n = 0; n < count; n++) {
            const x = Math.round(ax + (hash(tx + n * 83 + 3, ty + 1, salt(seed, 22)) - 0.5) * 16);
            const y = Math.round(ay + (hash(tx + 1, ty + n * 67 + 9, salt(seed, 23)) - 0.5) * 10);
            if (!waterAt(x, y)) continue;
            if (depthAt(x, y) < 16) continue;
            lilies.push({ x, y, fl: n % 2 === 0, tx: Math.floor(x / T), ty: Math.floor(y / T) });
          }
        }
      }
    }
  }

  return { originX, originY, seed, shore, glints, lilies, reeds, tufts, flowers };
}

// =====================================================================================
// Le dessin
// =====================================================================================

/** Une bande d'épaisseur entière le long de la normale, du côté de la terre. */
function band(P: Pen, x: number, y: number, nx: number, ny: number, o1: number, o2: number, col: string): void {
  const lx = -nx;
  const ly = -ny;
  const thick = Math.round(Math.abs(o2 - o1)) + 1;
  const mid = (o1 + o2) / 2;
  if (Math.abs(nx) >= Math.abs(ny)) {
    const start = lx >= 0 ? Math.round(x + lx * o1) : Math.round(x + lx * o2);
    P.r(start, Math.round(y + ly * mid), thick, 1, col);
  } else {
    const start = ly >= 0 ? Math.round(y + ly * o1) : Math.round(y + ly * o2);
    P.r(Math.round(x + lx * mid), start, 1, thick, col);
  }
}

/** Dessine le clapotis et l'écume le long de la ligne zéro, côté eau. */
function drawShore(P: Pen, life: GroundLife, now: number, x0: number, y0: number, x1: number, y1: number, blocked: (tx: number, ty: number) => boolean): void {
  const turn = Math.floor(now * 0.7);
  const pts = life.shore;
  for (let n = 0; n < pts.length; n++) {
    const s = pts[n];
    if (s.x + 9 < x0 || s.x - 9 >= x1 || s.y + 9 < y0 || s.y - 9 >= y1) continue;
    if (blocked(s.tx, s.ty)) continue;
    const lap = Math.sin(now * TAU / 6 + s.k * 0.025) * 2.5;
    band(P, s.x, s.y, s.nx, s.ny, lap - 5, lap - 4, C.q1);
    const phase = s.k + turn;
    if ((((phase % 9) + 9) % 9) !== 0) band(P, s.x, s.y, s.nx, s.ny, lap - 3, lap - 1, C.q0);
    if (lap < -0.6) {
      const w = Math.round(-lap);
      band(P, s.x, s.y, s.nx, s.ny, lap + 1, lap + w, C.sd3);
    }
  }
}

/** Dessine les reflets du soleil sur l'eau profonde. */
function drawGlints(P: Pen, life: GroundLife, now: number, x0: number, y0: number, x1: number, y1: number, blocked: (tx: number, ty: number) => boolean): void {
  for (let n = 0; n < life.glints.length; n++) {
    const g = life.glints[n];
    if (g.x + 7 < x0 || g.x - 7 >= x1 || g.y + 7 < y0 || g.y - 7 >= y1) continue;
    if (blocked(g.tx, g.ty)) continue;
    const ph = ((now + g.phase) % g.per + g.per) % g.per;
    if (ph >= 1.1) continue;
    const x = g.x + g.nx * ph * 2;
    const y = g.y + g.ny * ph * 2;
    const w = ph < 0.25 || ph > 0.85 ? 2 : 4;
    const col = ph > 0.25 && ph < 0.85 ? C.o0 : C.o1;
    if (Math.abs(g.nx) >= Math.abs(g.ny)) {
      const start = -g.nx >= 0 ? Math.round(x) : Math.round(x) - (w - 1);
      P.r(start, Math.round(y), w, 1, col);
    } else {
      const start = -g.ny >= 0 ? Math.round(y) : Math.round(y) - (w - 1);
      P.r(Math.round(x), start, 1, w, col);
    }
  }
}

/** Dessine les nénuphars et leur fleur. */
function drawLilies(P: Pen, life: GroundLife, now: number, x0: number, y0: number, x1: number, y1: number, blocked: (tx: number, ty: number) => boolean): void {
  for (let n = 0; n < life.lilies.length; n++) {
    const l = life.lilies[n];
    if (l.x + 9 < x0 || l.x - 9 >= x1 || l.y + 5 < y0 || l.y - 6 >= y1) continue;
    if (blocked(l.tx, l.ty)) continue;
    const bob = Math.round(Math.sin(now * TAU / 5 + l.x) * 0.6);
    const y = l.y + bob;
    P.ell(l.x, y, 8, 4, C.ink2);
    P.ell(l.x, y - 0.5, 7, 3.3, C.g3);
    P.ell(l.x - 1.5, y - 1, 4, 1.6, C.g2);
    P.r(l.x, y - 3, 5, 1, C.q4);
    P.r(l.x + 1, y - 2, 3, 1, C.q4);
    if (l.fl) {
      P.r(l.x - 3, y - 5, 5, 3, C.pink);
      P.r(l.x - 2, y - 6, 3, 1, C.pink);
      P.p(l.x - 1, y - 5, C.white);
      P.p(l.x - 1, y - 4, C.o1);
    }
  }
}

/** Dessine les roseaux, penchés par le vent. */
function drawReeds(P: Pen, life: GroundLife, now: number, x0: number, y0: number, x1: number, y1: number, blocked: (tx: number, ty: number) => boolean): void {
  for (let n = 0; n < life.reeds.length; n++) {
    const r = life.reeds[n];
    if (r.x + 3 < x0 || r.x - 3 >= x1 || r.y < y0 || r.y - r.h - 3 >= y1) continue;
    if (blocked(r.tx, r.ty)) continue;
    const s = Math.sin(now * TAU / 4.5 + r.ph) * 1.5;
    let j = 0;
    while (j < r.h) {
      const col = j < 3 ? C.reed2 : C.reed;
      const px = r.x + Math.round(s * j / r.h);
      let j2 = j;
      while (j2 + 1 < r.h) {
        const c2 = j2 + 1 < 3 ? C.reed2 : C.reed;
        if (c2 !== col || r.x + Math.round(s * (j2 + 1) / r.h) !== px) break;
        j2++;
      }
      P.r(px, r.y - j2, 1, j2 - j + 1, col);
      j = j2 + 1;
    }
    P.r(r.x + Math.round(s), r.y - r.h - 3, 2, 4, C.e3);
    P.p(r.x + Math.round(s), r.y - r.h - 3, C.e2);
  }
}

/** Le coup de vent : une bande de 40 pixels qui balaie 3 000 pixels toutes les dix secondes. */
function gust(x: number, y: number, now: number): number {
  const front = ((now % 10) / 3) * 900 - 120;
  const d = (((x + y * 0.4 - front) % 3000) + 3000) % 3000;
  return d > 2960 ? 1 : 0;
}

/** Dessine les touffes d'herbe. */
function drawTufts(P: Pen, life: GroundLife, now: number, x0: number, y0: number, x1: number, y1: number, blocked: (tx: number, ty: number) => boolean): void {
  for (let n = 0; n < life.tufts.length; n++) {
    const t = life.tufts[n];
    if (t.x + 3 < x0 || t.x - 3 >= x1 || t.y < y0 || t.y - 6 >= y1) continue;
    if (blocked(t.tx, t.ty)) continue;
    const wind = gust(t.x, t.y, now);
    P.r(t.x - 3, t.y, 7, 1, C.m5);
    for (let q = 0; q < TUFT_STEMS.length; q++) {
      const bx = TUFT_STEMS[q][0];
      const h = TUFT_STEMS[q][1];
      const dir = bx > 0 ? 1 : -1;
      let j = 1;
      while (j <= h) {
        const col = j === h ? C.m1 : j > h - 2 ? C.m2 : C.m4;
        const px = t.x + bx + Math.round(dir * j / 4) + (j > 2 ? wind : 0);
        let j2 = j;
        while (j2 + 1 <= h) {
          const c2 = j2 + 1 === h ? C.m1 : j2 + 1 > h - 2 ? C.m2 : C.m4;
          const px2 = t.x + bx + Math.round(dir * (j2 + 1) / 4) + (j2 + 1 > 2 ? wind : 0);
          if (c2 !== col || px2 !== px) break;
          j2++;
        }
        P.r(px, t.y - j2, 1, j2 - j + 1, col);
        j = j2 + 1;
      }
    }
  }
}

/** Dessine les fleurs, balancées par le vent. */
function drawFlowers(P: Pen, life: GroundLife, now: number, x0: number, y0: number, x1: number, y1: number, blocked: (tx: number, ty: number) => boolean): void {
  for (let n = 0; n < life.flowers.length; n++) {
    const f = life.flowers[n];
    if (f.x + 2 < x0 || f.x - 2 >= x1 || f.y < y0 || f.y - 4 >= y1) continue;
    if (blocked(f.tx, f.ty)) continue;
    const s = gust(f.x, f.y, now) || Math.round(Math.sin(now * 0.9 + f.ph) * 0.6);
    P.p(f.x, f.y, C.m5);
    P.p(f.x + s, f.y - 1, C.m4);
    P.p(f.x + s, f.y - 2, C.m4);
    P.p(f.x + s - 1, f.y - 3, f.c1);
    P.p(f.x + s + 1, f.y - 3, f.c1);
    P.p(f.x + s, f.y - 4, f.c1);
    P.p(f.x + s, f.y - 3, C.o1);
    P.p(f.x + s + 1, f.y - 2, f.c2);
  }
}

/** Dessine la vie du bloc à l'instant `now` (secondes), en pixels monde. */
export function drawGroundLife(P: Pen, life: GroundLife, now: number, x0: number, y0: number, x1: number, y1: number, blocked: (tx: number, ty: number) => boolean): void {
  drawGlints(P, life, now, x0, y0, x1, y1, blocked);
  drawShore(P, life, now, x0, y0, x1, y1, blocked);
  drawLilies(P, life, now, x0, y0, x1, y1, blocked);
  drawReeds(P, life, now, x0, y0, x1, y1, blocked);
  drawTufts(P, life, now, x0, y0, x1, y1, blocked);
  drawFlowers(P, life, now, x0, y0, x1, y1, blocked);
}
