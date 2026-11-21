/**
 * La vie du sol du rendu pixel : le clapotis, l'écume, les reflets, les nénuphars, les roseaux,
 * les touffes et les fleurs. C'est la transposition de `docs/maquettes/heure-doree.html` à une
 * rivière qui tourne dans tous les sens : le champ de rivage donne la ligne zéro et sa normale,
 * au lieu du seul `SHORE[j]` horizontal de la maquette.
 */
import { hash, vnoise } from './noise';
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
  readonly tx: number;
  readonly ty: number;
}

/** Un reflet du soleil sur l'eau profonde. */
export interface GroundGlint {
  readonly x: number;
  readonly y: number;
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
  return { x: ox + (i + t) * T, y: oy + j * T };
}

/** Le croisement vertical de l'arête entre les coins (i, j) et (i, j + 1). */
function vCross(shore: ArrayLike<number>, i: number, j: number, ox: number, oy: number): Cross {
  const a = cornerAt(shore, i, j);
  const d = cornerAt(shore, i, j + 1);
  const t = a / (a - d);
  return { x: ox + i * T, y: oy + (j + t) * T };
}

/** Assemble les segments de la ligne zéro de tout le bloc. */
export function contourSegments(shore: ArrayLike<number>, ox: number, oy: number): Segment[] {
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
      const top = ta !== tb ? hCross(shore, i, j, ox, oy) : null;
      const right = tb !== tc ? vCross(shore, i + 1, j, ox, oy) : null;
      const bottom = tc !== td ? hCross(shore, i, j + 1, ox, oy) : null;
      const left = ta !== td ? vCross(shore, i, j, ox, oy) : null;
      const pts: Cross[] = [];
      if (top !== null) pts.push(top);
      if (right !== null) pts.push(right);
      if (bottom !== null) pts.push(bottom);
      if (left !== null) pts.push(left);
      if (pts.length === 2) {
        add(pts[0], pts[1]);
      } else if (pts.length === 4) {
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
  const points: ShorePoint[] = [];
  for (let q = 0; q < segments.length; q++) {
    const seg = segments[q];
    const dx = seg.b.x - seg.a.x;
    const dy = seg.b.y - seg.a.y;
    const len = Math.hypot(dx, dy);
    if (len < 0.0001) continue;
    const n = Math.max(1, Math.round(len));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const x = seg.a.x + dx * t;
      const y = seg.a.y + dy * t;
      const u = (x - ox) / T;
      const v = (y - oy) / T;
      // La normale vient du gradient du champ : elle regarde le côté où il diminue.
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
      const mix = a - b - c + d;
      let nx = -((b - a) + mix * fv);
      let ny = -((c - a) + mix * fu);
      const mag = Math.hypot(nx, ny);
      if (mag > 0.000001) {
        nx /= mag;
        ny /= mag;
      } else {
        nx = -dy / len;
        ny = dx / len;
        const here = shoreAt(shore, u, v);
        if (shoreAt(shore, (x + nx - ox) / T, (y + ny - oy) / T) > here) {
          nx = -nx;
          ny = -ny;
        }
      }
      const tx = Math.max(originX, Math.min(originX + CHUNK - 1, Math.floor(x / T)));
      const ty = Math.max(originY, Math.min(originY + CHUNK - 1, Math.floor(y / T)));
      points.push({ x, y, nx, ny, tx, ty });
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
    const u = (x - ox) / T;
    const v = (y - oy) / T;
    if (u < 0 || u > CHUNK || v < 0 || v > CHUNK) return -1;
    return -shoreAt(src.shore, u, v) * T;
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
        if (depth >= 16 && depth <= 90 && hash(tx, ty, salt(seed, 9)) < 0.13) {
          const per = 7 + hash(tx, ty, salt(seed, 10)) * 5;
          glints.push({
            x: Math.round(ax + (hash(tx, ty, salt(seed, 11)) - 0.5) * 22),
            y: Math.round(ay + (hash(tx, ty, salt(seed, 12)) - 0.5) * 22),
            per,
            phase: hash(tx, ty, salt(seed, 13)) * per,
            tx, ty,
          });
        }
        // Des roseaux par groupes, juste au bord de l'eau.
        if (depth >= 3 && depth <= 12 && vnoise(tx / 10, ty / 10, salt(seed, 24)) > 0.74) {
          const count = 3 + Math.floor(hash(tx, ty, salt(seed, 15)) * 3);
          for (let n = 0; n < count; n++) {
            const x = Math.round(ax + (hash(tx + n * 43 + 19, ty, salt(seed, 16)) - 0.5) * 20);
            const y = Math.round(ay + (hash(tx, ty + n * 61 + 23, salt(seed, 17)) - 0.5) * 8);
            if (!waterAt(x, y)) continue;
            const d = depthAt(x, y);
            if (d < 3 || d > 12) continue;
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
            const d = depthAt(x, y);
            if (d < 18 || d > 60) continue;
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

/** Vrai si l'une des cases que couvre un rectangle en pixels est bloquée. */
function blockedBox(blocked: (tx: number, ty: number) => boolean, x0: number, y0: number, x1: number, y1: number): boolean {
  const tx0 = Math.floor(x0 / T);
  const ty0 = Math.floor(y0 / T);
  const tx1 = Math.floor(x1 / T);
  const ty1 = Math.floor(y1 / T);
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      if (blocked(tx, ty)) return true;
    }
  }
  return false;
}

/** Une bande d'épaisseur entière le long de la normale, du côté de la terre. */
function band(P: Pen, blocked: (tx: number, ty: number) => boolean, x: number, y: number, nx: number, ny: number, o1: number, o2: number, col: string): void {
  const lx = -nx;
  const ly = -ny;
  const thick = Math.round(Math.abs(o2 - o1)) + 1;
  const mid = (o1 + o2) / 2;
  if (Math.abs(nx) >= Math.abs(ny)) {
    const start = lx >= 0 ? Math.round(x + lx * o1) : Math.round(x + lx * o2);
    const other = Math.round(y + ly * mid);
    if (blocked(Math.floor(start / T), Math.floor(other / T))) return;
    if (blocked(Math.floor((start + thick - 1) / T), Math.floor(other / T))) return;
    P.r(start, other, thick, 1, col);
  } else {
    const start = ly >= 0 ? Math.round(y + ly * o1) : Math.round(y + ly * o2);
    const other = Math.round(x + lx * mid);
    if (blocked(Math.floor(other / T), Math.floor(start / T))) return;
    if (blocked(Math.floor(other / T), Math.floor((start + thick - 1) / T))) return;
    P.r(other, start, 1, thick, col);
  }
}

/** Dessine le clapotis et l'écume le long de la ligne zéro, côté eau. */
function drawShore(P: Pen, life: GroundLife, now: number, x0: number, y0: number, x1: number, y1: number, blocked: (tx: number, ty: number) => boolean): void {
  const turn = Math.floor(now * 0.7);
  const pts = life.shore;
  for (let n = 0; n < pts.length; n++) {
    const s = pts[n];
    if (s.x + 9 < x0 || s.x - 9 >= x1 || s.y + 9 < y0 || s.y - 9 >= y1) continue;
    const lap = Math.sin(now * TAU / 6 + (s.x + s.y) * 0.025) * 2.5;
    band(P, blocked, s.x, s.y, s.nx, s.ny, lap - 5, lap - 4, C.q1);
    const foam = Math.abs(s.nx) >= Math.abs(s.ny) ? Math.round(s.y) : Math.round(s.x);
    if ((((foam + turn) % 9) + 9) % 9 !== 0) band(P, blocked, s.x, s.y, s.nx, s.ny, lap - 3, lap - 1, C.q0);
    if (lap < -0.6) {
      const w = Math.round(-lap);
      band(P, blocked, s.x, s.y, s.nx, s.ny, lap + 1, lap + w, C.sd3);
    }
  }
}

/** Dessine les reflets du soleil sur l'eau profonde. */
function drawGlints(P: Pen, life: GroundLife, now: number, x0: number, y0: number, x1: number, y1: number, blocked: (tx: number, ty: number) => boolean): void {
  for (let n = 0; n < life.glints.length; n++) {
    const g = life.glints[n];
    if (g.x + 7 < x0 || g.x - 7 >= x1 || g.y + 7 < y0 || g.y - 7 >= y1) continue;
    if (blockedBox(blocked, g.x - 3, g.y, g.x + 4, g.y)) continue;
    const ph = ((now + g.phase) % g.per + g.per) % g.per;
    if (ph >= 1.1) continue;
    const x = g.x - ph * 2;
    const w = ph < 0.25 || ph > 0.85 ? 2 : 4;
    const col = ph > 0.25 && ph < 0.85 ? C.o0 : C.o1;
    P.r(Math.round(x), Math.round(g.y), w, 1, col);
  }
}

/** Dessine les nénuphars et leur fleur. */
function drawLilies(P: Pen, life: GroundLife, now: number, x0: number, y0: number, x1: number, y1: number, blocked: (tx: number, ty: number) => boolean): void {
  for (let n = 0; n < life.lilies.length; n++) {
    const l = life.lilies[n];
    if (l.x + 9 < x0 || l.x - 9 >= x1 || l.y + 5 < y0 || l.y - 6 >= y1) continue;
    if (blockedBox(blocked, l.x - 9, l.y - 6, l.x + 9, l.y + 5)) continue;
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
    if (blockedBox(blocked, r.x - 3, r.y - r.h - 3, r.x + 3, r.y)) continue;
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
    if (blockedBox(blocked, t.x - 3, t.y - 6, t.x + 3, t.y)) continue;
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
    if (blockedBox(blocked, f.x - 2, f.y - 4, f.x + 2, f.y)) continue;
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
