/**
 * Oracle du sol : une copie fidèle des formules de la maquette, comparée pixel à pixel au portage.
 * Les formules viennent des lignes 828 à 841 et 847 à 856 de `docs/maquettes/heure-doree.html`.
 * Ne pas modifier la copie de l’oracle : elle sert de référence.
 */
import { describe, expect, it } from 'vitest';
import { CHUNK } from '../src/sim/world';
import { C } from '../src/render/px/palette';
import { hash, rng, vnoise } from '../src/render/px/noise';
import { TILE_PX } from '../src/render/px/view';
import {
  paintGroundCore,
  paintTiles,
  type GroundPathSegment,
  type GroundSource,
} from '../src/render/px/groundPaint';

/** Une scène synthétique du monde, indépendante du découpage en blocs. */
interface Scene {
  shore(cx: number, cy: number): number;
  slab(tx: number, ty: number): boolean;
  paths: readonly GroundPathSegment[];
}

const CORNER = CHUNK + 1;
const SLAB_SIDE = CHUNK + 2;

/** Empaquette une couleur `#rrggbb` en entier. */
function pack(hex: string): number {
  return parseInt(hex.slice(1), 16);
}

const RGB = {
  q1: pack(C.q1), q2: pack(C.q2), q3: pack(C.q3), q4: pack(C.q4), q5: pack(C.q5),
  q6: pack(C.q6), q7: pack(C.q7),
  sd0: pack(C.sd0), sd1: pack(C.sd1), sd2: pack(C.sd2),
  m1: pack(C.m1), m2: pack(C.m2), m3: pack(C.m3), m5: pack(C.m5),
  c0: pack(C.c0), c1: pack(C.c1), c2: pack(C.c2), c3: pack(C.c3), c4: pack(C.c4),
  e0: pack(C.e0), e1: pack(C.e1), e2: pack(C.e2),
} as const;

/** Construit la source d'un bloc à partir d'une scène globale. */
function blockSource(scene: Scene, originX: number, originY: number): GroundSource {
  const shore = new Float64Array(CORNER * CORNER);
  for (let j = 0; j < CORNER; j++) {
    for (let i = 0; i < CORNER; i++) {
      shore[j * CORNER + i] = scene.shore(originX + i, originY + j);
    }
  }
  const slab = new Uint8Array(SLAB_SIDE * SLAB_SIDE);
  for (let ly = -1; ly <= CHUNK; ly++) {
    for (let lx = -1; lx <= CHUNK; lx++) {
      slab[(ly + 1) * SLAB_SIDE + lx + 1] = scene.slab(originX + lx, originY + ly) ? 1 : 0;
    }
  }
  return {
    seed: 1234,
    originX,
    originY,
    shore,
    paths: scene.paths,
    slab,
    loot: new Uint8Array(CHUNK * CHUNK),
  };
}

/** La distance d'un pixel à un segment, en pixels, comme `segDist` de la maquette. */
function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = 0;
  if (len2 > 0) {
    t = ((px - ax) * dx + (py - ay) * dy) / len2;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
  }
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

/** La distance bruitée au sentier, en pixels, comme `dirtD` de la maquette. */
function dirtD(scene: Scene, x: number, y: number): number {
  let nearest = Infinity;
  for (const p of scene.paths) {
    const d = segDist(x, y, p.ax * TILE_PX, p.ay * TILE_PX, p.bx * TILE_PX, p.by * TILE_PX);
    if (d < nearest) nearest = d;
  }
  return nearest - (vnoise(x * 0.12, y * 0.12, 31) - 0.5) * 3;
}

/** Écrit dans le tampon local de l'oracle, avec rognage. */
function makePut(out: Uint8ClampedArray, width: number, x0: number, y0: number, x1: number, y1: number) {
  return (x: number, y: number, color: number): void => {
    if (x < x0 || x >= x1 || y < y0 || y >= y1) return;
    const o = ((y - y0) * width + (x - x0)) * 4;
    out[o] = (color >> 16) & 255;
    out[o + 1] = (color >> 8) & 255;
    out[o + 2] = color & 255;
    out[o + 3] = 255;
  };
}

/** Le socle de l'oracle : copie fidèle de la maquette, sans décor ni débris. */
function oracleCore(
  scene: Scene,
  tx0: number,
  ty0: number,
  tx1: number,
  ty1: number,
): Uint8ClampedArray {
  const width = (tx1 - tx0) * TILE_PX;
  const height = (ty1 - ty0) * TILE_PX;
  const out = new Uint8ClampedArray(width * height * 4);
  const put = makePut(out, width, tx0 * TILE_PX, ty0 * TILE_PX, tx1 * TILE_PX, ty1 * TILE_PX);

  for (let ly = ty0; ly < ty1; ly++) {
    for (let lx = tx0; lx < tx1; lx++) {
      const c00 = scene.shore(lx, ly);
      const c10 = scene.shore(lx + 1, ly);
      const c01 = scene.shore(lx, ly + 1);
      const c11 = scene.shore(lx + 1, ly + 1);
      const isSlab = scene.slab(lx, ly);
      for (let py = 0; py < TILE_PX; py++) {
        const fy = py / TILE_PX;
        const ddStep = -((c10 - c00) + (c11 - c01 - (c10 - c00)) * fy);
        let dd = -(c00 + (c01 - c00) * fy) * TILE_PX;
        for (let px = 0; px < TILE_PX; px++) {
          const i = lx * TILE_PX + px;
          const j = ly * TILE_PX + py;
          let col: number;
          if (dd > 3) {
            const n = (vnoise(i * 0.03, j * 0.022, 3) - 0.5) * 10;
            const e = dd + n;
            col = e > 76 ? RGB.q7 : e > 58 ? RGB.q6 : e > 42 ? RGB.q5 : e > 27 ? RGB.q4 : e > 13 ? RGB.q3 : RGB.q2;
          } else if (dd > -6) {
            col = RGB.sd2;
          } else if (dd > -8) {
            col = RGB.sd1;
          } else if (dd > -34) {
            col = hash(i, j, 9) < 0.035 ? RGB.sd1 : RGB.sd0;
          } else if (dd > -38) {
            col = ((i + j) & 1) === 0 ? RGB.m1 : RGB.sd0;
          } else if (isSlab) {
            col = RGB.c1;
          } else {
            const dd2 = dirtD(scene, i, j);
            if (dd2 < 3.5) {
              const h = hash(i, j, 15);
              col = dd2 < 2 ? RGB.e1 : RGB.e0;
              if (h > 0.96) col = RGB.e2;
              else if (h < 0.03) col = RGB.sd1;
            } else {
              const n = vnoise(i * 0.016, j * 0.016, 11);
              const ck = ((i + j) & 1) === 0;
              col = n > 0.67 ? RGB.m1 : n > 0.62 ? (ck ? RGB.m1 : RGB.m2) : n > 0.37 ? RGB.m2 : n > 0.32 ? (ck ? RGB.m2 : RGB.m3) : RGB.m3;
              if (dd2 < 4.5 && ck && dd2 > 3.5) col = RGB.e0;
            }
          }
          put(i, j, col);
          dd += ddStep;
        }
      }
    }
  }

  const fill = (x: number, y: number, w: number, h: number, color: number): void => {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(x + i, y + j, color);
  };
  const line = (x0: number, y0: number, x1: number, y1: number, color: number): void => {
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let e = dx + dy;
    let x = x0;
    let y = y0;
    for (let g = 0; g < 800; g++) {
      put(x, y, color);
      if (x === x1 && y === y1) break;
      const e2 = 2 * e;
      if (e2 >= dy) { e += dy; x += sx; }
      if (e2 <= dx) { e += dx; y += sy; }
    }
  };

  for (let ty = ty0 - 1; ty < ty1; ty++) {
    for (let tx = tx0 - 1; tx < tx1; tx++) {
      if (!scene.slab(tx, ty)) continue;
      const X = tx * TILE_PX;
      const Y = ty * TILE_PX;
      const r = rng(tx * 17 + ty);
      fill(X, Y, TILE_PX, 1, RGB.c0);
      fill(X, Y, 1, TILE_PX, RGB.c0);
      fill(X + TILE_PX - 1, Y, 1, TILE_PX, RGB.c2);
      fill(X, Y + TILE_PX - 1, TILE_PX, 1, RGB.c2);
      if (r() < 0.4) {
        const a = X + 3 + Math.floor(r() * 12);
        const b = Y + 3 + Math.floor(r() * 12);
        for (let k = 0; k < 9; k++) if (r() < 0.7) put(a + (k % 3) * 2, b + Math.floor(k / 3), RGB.c2);
      }
      if (r() < 0.15) {
        const a = X + 4 + Math.floor(r() * 12);
        const b = Y + 4 + Math.floor(r() * 12);
        line(a, b, a + 5, b + 3, RGB.c3);
      }
      if (!scene.slab(tx, ty + 1)) {
        fill(X, Y + TILE_PX - 3, TILE_PX, 1, RGB.c2);
        fill(X, Y + TILE_PX - 2, TILE_PX, 1, RGB.c3);
        fill(X, Y + TILE_PX - 1, TILE_PX, 1, RGB.c4);
        fill(X, Y + TILE_PX, TILE_PX, 1, RGB.m5);
      }
      if (!scene.slab(tx + 1, ty)) {
        fill(X + TILE_PX - 1, Y, 1, TILE_PX, RGB.c3);
        fill(X + TILE_PX, Y + 2, 1, TILE_PX - 1, RGB.m5);
      }
      if (!scene.slab(tx, ty - 1)) {
        for (let i = 0; i < TILE_PX; i += 3) if (r() < 0.6) put(X + i, Y, RGB.m3);
      }
      if (!scene.slab(tx - 1, ty)) {
        for (let j = 0; j < TILE_PX; j += 3) if (r() < 0.6) put(X, Y + j, RGB.m3);
      }
    }
  }
  return out;
}

/** Compte et localise les octets qui diffèrent entre deux tampons. */
function diffPixels(a: Uint8ClampedArray, b: Uint8ClampedArray): number[] {
  const out: number[] = [];
  for (let i = 0; i < a.length; i += 4) {
    if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3]) {
      out.push(i / 4);
    }
  }
  return out;
}

const wavyShore: Scene = {
  shore: (cx, cy) => (cx - 10) * 0.9 + Math.sin(cy * 0.35) * 1.4 + Math.sin(cy * 0.11 + 2) * 0.8,
  slab: () => false,
  paths: [],
};

const slabScene: Scene = {
  shore: () => 5,
  slab: (tx, ty) => {
    const x = tx;
    const y = ty;
    const bar = x >= 2 && x <= 6 && y >= 2 && y <= 5;
    const leg = x >= 5 && x <= 6 && y >= 5 && y <= 8;
    return bar || leg;
  },
  paths: [],
};

const pathScene: Scene = {
  shore: () => 5,
  slab: () => false,
  paths: [
    { ax: 1, ay: 6, bx: 9, by: 2 },
    { ax: 2, ay: 1, bx: 7, by: 9 },
  ],
};

const prairieScene: Scene = {
  shore: () => 5,
  slab: () => false,
  paths: [],
};

describe('oracle du sol', () => {
  it('retrouve la maquette sur un rivage au champ connu', () => {
    const src = blockSource(wavyShore, 0, 0);
    const got = new Uint8ClampedArray(8 * TILE_PX * 8 * TILE_PX * 4);
    paintGroundCore(src, got, 0, 0, 8, 8);
    const want = oracleCore(wavyShore, 0, 0, 8, 8);
    expect(diffPixels(got, want)).toEqual([]);
  });

  it('retrouve la maquette sur des dalles en L et leurs bords', () => {
    const src = blockSource(slabScene, 0, 0);
    const got = new Uint8ClampedArray(10 * TILE_PX * 10 * TILE_PX * 4);
    paintGroundCore(src, got, 0, 0, 10, 10);
    const want = oracleCore(slabScene, 0, 0, 10, 10);
    expect(diffPixels(got, want)).toEqual([]);
  });

  it('retrouve la maquette sur un sentier', () => {
    const src = blockSource(pathScene, 0, 0);
    const got = new Uint8ClampedArray(10 * TILE_PX * 10 * TILE_PX * 4);
    paintGroundCore(src, got, 0, 0, 10, 10);
    const want = oracleCore(pathScene, 0, 0, 10, 10);
    expect(diffPixels(got, want)).toEqual([]);
  });

  it('retrouve la maquette sur la prairie', () => {
    const src = blockSource(prairieScene, 0, 0);
    const got = new Uint8ClampedArray(8 * TILE_PX * 8 * TILE_PX * 4);
    paintGroundCore(src, got, 0, 0, 8, 8);
    const want = oracleCore(prairieScene, 0, 0, 8, 8);
    expect(diffPixels(got, want)).toEqual([]);
  });

  it('retrouve la maquette aux coordonnées négatives', () => {
    const src = blockSource(wavyShore, -64, -32);
    const got = new Uint8ClampedArray(8 * TILE_PX * 8 * TILE_PX * 4);
    paintGroundCore(src, got, -60, -28, -52, -20);
    const want = oracleCore(wavyShore, -60, -28, -52, -20);
    expect(diffPixels(got, want)).toEqual([]);
  });

  it('donne exactement la même zone pour un sous-rectangle du socle', () => {
    const src = blockSource(wavyShore, 0, 0);
    const full = new Uint8ClampedArray(CHUNK * TILE_PX * CHUNK * TILE_PX * 4);
    paintGroundCore(src, full, 0, 0, CHUNK, CHUNK);
    const rects = [[0, 0, 8, 8], [7, 5, 19, 14], [24, 24, 32, 32]] as const;
    for (const [x0, y0, x1, y1] of rects) {
      const w = (x1 - x0) * TILE_PX;
      const h = (y1 - y0) * TILE_PX;
      const part = new Uint8ClampedArray(w * h * 4);
      paintGroundCore(src, part, x0, y0, x1, y1);
      for (let ry = 0; ry < h; ry++) {
        for (let rx = 0; rx < w; rx++) {
          const a = (ry * w + rx) * 4;
          const b = (((y0 * TILE_PX + ry) * CHUNK * TILE_PX) + (x0 * TILE_PX + rx)) * 4;
          for (let k = 0; k < 4; k++) {
            if (part[a + k] !== full[b + k]) {
              throw new Error(`pixel (${rx},${ry}) du rectangle ${x0},${y0},${x1},${y1} diffère`);
            }
          }
        }
      }
    }
  });

  it('ne crée pas de couture entre deux blocs voisins, pour l’eau, la prairie et le sentier', () => {
    const scene: Scene = {
      shore: (cx, cy) => (cx - 40) * 0.55 + Math.sin(cy * 0.27) * 1.6,
      slab: () => false,
      paths: [{ ax: 20, ay: 2, bx: 44, by: 30 }],
    };
    const left = blockSource(scene, 0, 0);
    const right = blockSource(scene, CHUNK, 0);
    const w = CHUNK * TILE_PX;
    const a = new Uint8ClampedArray(w * w * 4);
    const b = new Uint8ClampedArray(w * w * 4);
    paintGroundCore(left, a, 0, 0, CHUNK, CHUNK);
    paintGroundCore(right, b, CHUNK, 0, CHUNK * 2, CHUNK);
    expect(diffPixels(a, oracleCore(scene, 0, 0, CHUNK, CHUNK))).toEqual([]);
    expect(diffPixels(b, oracleCore(scene, CHUNK, 0, CHUNK * 2, CHUNK))).toEqual([]);
  });

  it('donne exactement la même zone pour un sous-rectangle du bloc complet', () => {
    const src = blockSource(wavyShore, 0, 0);
    const full = new Uint8ClampedArray(CHUNK * TILE_PX * CHUNK * TILE_PX * 4);
    paintTiles(src, full, 0, 0, CHUNK, CHUNK);
    const rects = [[0, 0, 5, 5], [9, 7, 21, 17], [27, 23, 32, 32]] as const;
    for (const [x0, y0, x1, y1] of rects) {
      const w = (x1 - x0) * TILE_PX;
      const h = (y1 - y0) * TILE_PX;
      const part = new Uint8ClampedArray(w * h * 4);
      paintTiles(src, part, x0, y0, x1, y1);
      for (let ry = 0; ry < h; ry++) {
        for (let rx = 0; rx < w; rx++) {
          const a = (ry * w + rx) * 4;
          const b = (((y0 * TILE_PX + ry) * CHUNK * TILE_PX) + (x0 * TILE_PX + rx)) * 4;
          for (let k = 0; k < 4; k++) {
            if (part[a + k] !== full[b + k]) {
              throw new Error(`pixel (${rx},${ry}) du rectangle ${x0},${y0},${x1},${y1} diffère`);
            }
          }
        }
      }
    }
  });
});
