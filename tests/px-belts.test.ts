/**
 * Les tapis pixel : géométrie du chemin contre l'oracle de la maquette, et position des objets
 * du jeu sur des convoyeurs droits et en L, vérifiée pas à pas.
 */
import { describe, expect, it } from 'vitest';
import { Game } from '../src/sim/game';
import { BELT_SPEED, I, TILE_U } from '../src/sim/data';
import type { BeltPath } from '../src/sim/belts';
import { pathItemPixels, pathPos, type PathTile } from '../src/render/px/belts';

const T = 24;

/** Le pas d'un objet par tick de simulation, en pixels. */
const STEP = (BELT_SPEED * T) / TILE_U;

// =====================================================================================
// ORACLE — copie fidèle de docs/maquettes/heure-doree.html (lignes 909-943).
// =====================================================================================
const ORACLE_D4 = [[1, 0], [0, 1], [-1, 0], [0, -1]];

function oraclePivotOf(inD: number, outD: number): { px: number; py: number; E: number[]; X: number[] } {
  const entry = (inD + 2) & 3;
  const px = entry === 0 || outD === 0 ? T : 0;
  const py = entry === 1 || outD === 1 ? T : 0;
  const hT = T / 2;
  const side = [[T, hT], [hT, T], [0, hT], [hT, 0]];
  const norm = ([a, b]: number[]): number[] => {
    const l = Math.hypot(a, b);
    return [a / l, b / l];
  };
  return {
    px,
    py,
    E: norm([side[entry][0] - px, side[entry][1] - py]),
    X: norm([side[outD][0] - px, side[outD][1] - py]),
  };
}

function oraclePathPos(tiles: readonly PathTile[], s: number): [number, number] | null {
  const k = Math.floor(s / T);
  if (k < 0 || k >= tiles.length) return null;
  const u = (s - k * T) / T;
  const [tx, ty, out, firstIn] = tiles[k];
  const inD = k ? tiles[k - 1][2] : (firstIn ?? out);
  if (inD === out) {
    const [dx, dy] = ORACLE_D4[out];
    return [tx * T + T / 2 + dx * (u * T - T / 2), ty * T + T / 2 + dy * (u * T - T / 2)];
  }
  const { px, py, E, X } = oraclePivotOf(inD, out);
  const th = u * Math.PI / 2;
  const R = T / 2;
  return [tx * T + px + R * (Math.cos(th) * E[0] + Math.sin(th) * X[0]), ty * T + py + R * (Math.cos(th) * E[1] + Math.sin(th) * X[1])];
}

// Les trois tapis de la scène (docs/maquettes/heure-doree.html, lignes 882-886).
const BELTS: readonly (readonly PathTile[])[] = [
  [[16, 7, 0], [17, 7, 0], [18, 7, 0], [19, 7, 0], [20, 7, 0]],
  [[11, 7, 0], [12, 7, 0], [13, 7, 0]],
  [[21, 12, 3, 0], [21, 11, 3], [21, 10, 3], [21, 9, 3]],
];

describe('pathPos contre l’oracle', () => {
  it('les deux tapis droits et le tapis en virage donnent les mêmes valeurs', () => {
    BELTS.forEach((tiles) => {
      const length = tiles.length * T;
      for (let n = 0; n < 120; n++) {
        const s = (n / 120) * length;
        const mine = pathPos(tiles, s);
        const oracle = oraclePathPos(tiles, s);
        expect(mine).not.toBe(null);
        if (!mine || !oracle) return;
        expect(mine.x).toBe(oracle[0]);
        expect(mine.y).toBe(oracle[1]);
      }
    });
  });

  it('les seize combinaisons d’entrée et de sortie donnent les mêmes valeurs', () => {
    for (let inD = 0; inD < 4; inD++) {
      for (let outD = 0; outD < 4; outD++) {
        const tiles: PathTile[] = [[5, 6, outD, inD], [6, 6, outD]];
        for (let n = 0; n < 40; n++) {
          const s = (n / 40) * 2 * T;
          const mine = pathPos(tiles, s);
          const oracle = oraclePathPos(tiles, s);
          expect(mine).not.toBe(null);
          if (!mine || !oracle) return;
          expect(mine.x).toBe(oracle[0]);
          expect(mine.y).toBe(oracle[1]);
        }
      }
    }
  });

  it('hors du chemin, les deux renvoient null', () => {
    for (const tiles of BELTS) {
      const length = tiles.length * T;
      for (const s of [-1, -T, length, length + 1]) {
        expect(pathPos(tiles, s)).toBe(null);
        expect(oraclePathPos(tiles, s)).toBe(null);
      }
    }
  });

  it('le virage entre et sort par les bords de sa case', () => {
    const tiles = BELTS[2];
    const start = pathPos(tiles, 0)!;
    expect(start.x).toBeCloseTo(21 * T, 10);
    expect(start.y).toBeCloseTo(12 * T + T / 2, 10);
    const end = pathPos(tiles, T)!;
    expect(end.x).toBeCloseTo(21 * T + T / 2, 10);
    expect(end.y).toBeCloseTo(12 * T, 10);
  });
});

/** Partie de test : tout débloqué, stock illimité. */
function sandbox(seed = 7): Game {
  const g = new Game(seed);
  g.stock.fill(1e6);
  g.quota = 99;
  return g;
}

const run = (g: Game, ticks: number): void => {
  for (let i = 0; i < ticks; i++) g.step();
};

/** Aplanit une zone en sol nu pour y construire librement. */
function clear(g: Game, x0: number, y0: number, x1: number, y1: number): void {
  g.world.ensureArea(x0 - 2, y0 - 2, x1 + 2, y1 + 2);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const c = g.world.at(x, y)!;
      const i = ((y & 31) << 5) | (x & 31);
      if (c.ent[i]) continue;
      c.ground[i] = 0;
      c.deposit[i] = 0;
      c.amount[i] = 0;
      c.canopy[i] = 0;
      c.cap[i] = 0;
      c.loot[i] = 0;
    }
  }
}

function place(g: Game, x: number, y: number, rot: number): void {
  expect(g.place('convoyeur', x, y, rot, { free: true }).ok).toBe(true);
}

function pathAt(g: Game, x: number, y: number): BeltPath {
  const p = g.paths.find((q) => q.tiles[0].x === x && q.tiles[0].y === y);
  if (!p) throw new Error(`Chemin absent en ${x},${y}`);
  return p;
}

/** La distance du premier objet du chemin depuis son début. */
function headPos(p: BeltPath): number {
  return p.length - p.gaps[p.head];
}

/** Échantillonne la position du premier objet pendant `ticks` pas. */
function samples(g: Game, p: BeltPath, ticks: number): { x: number; y: number; k: number; pos: number }[] {
  const out: { x: number; y: number; k: number; pos: number }[] = [];
  for (let t = 0; t < ticks; t++) {
    const pos = headPos(p);
    const q = pathItemPixels(p, pos);
    out.push({ x: q.x, y: q.y, k: p.tileIndex(pos), pos });
    g.step();
  }
  return out;
}

/** Vérifie que l'objet reste dans la case du chemin et avance sans saut. */
function expectContinuous(p: BeltPath, points: { x: number; y: number; k: number; pos: number }[]): void {
  for (const q of points) {
    const t = p.tiles[q.k];
    expect(q.x).toBeGreaterThanOrEqual(t.x * T - 1e-9);
    expect(q.x).toBeLessThanOrEqual((t.x + 1) * T + 1e-9);
    expect(q.y).toBeGreaterThanOrEqual(t.y * T - 1e-9);
    expect(q.y).toBeLessThanOrEqual((t.y + 1) * T + 1e-9);
  }
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    const step = Math.hypot(dx, dy);
    expect(step).toBeGreaterThan(0);
    expect(step).toBeLessThanOrEqual(STEP + 1e-9);
  }
}

describe('position des objets du jeu', () => {
  it('un tapis droit : la position avance de 0,8 px par pas, sans quitter la case', () => {
    const g = sandbox();
    clear(g, 8, 8, 24, 12);
    for (let i = 0; i < 10; i++) place(g, 10 + i, 10, 0);
    run(g, 1);
    const p = pathAt(g, 10, 10);
    expect(p.insertAtStart(I.fer)).toBe(true);
    const points = samples(g, p, 140);
    expect(points[0].k).toBe(0);
    expect(points[points.length - 1].k).toBeGreaterThan(3);
    expectContinuous(p, points);
  });

  it('un tapis en L : le virage se prend sans saut entre deux cases', () => {
    const g = sandbox();
    clear(g, 8, 8, 24, 20);
    for (let x = 10; x <= 12; x++) place(g, x, 10, 0);
    place(g, 13, 10, 1);
    for (let y = 11; y <= 14; y++) place(g, 13, y, 1);
    run(g, 1);
    const p = pathAt(g, 10, 10);
    expect(p.insertAtStart(I.fer)).toBe(true);
    const points = samples(g, p, 200);
    expect(points.some((q) => q.k === 3)).toBe(true);
    expectContinuous(p, points);
  });

  it('la position est celle de l’ancien rendu, à la case près', () => {
    const g = sandbox();
    clear(g, 8, 8, 24, 12);
    place(g, 10, 10, 0);
    place(g, 11, 10, 0);
    run(g, 1);
    const p = pathAt(g, 10, 10);
    const start = pathItemPixels(p, 0);
    expect(start).toEqual({ x: 10 * T, y: 10 * T + T / 2, z: 0 });
    const middle = pathItemPixels(p, TILE_U / 2);
    expect(middle).toEqual({ x: 10 * T + T / 2, y: 10 * T + T / 2, z: 0 });
    const cross = pathItemPixels(p, TILE_U);
    expect(cross).toEqual({ x: 11 * T, y: 10 * T + T / 2, z: 0 });
  });
});
