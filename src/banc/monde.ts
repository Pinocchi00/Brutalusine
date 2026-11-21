/**
 * Carte de développement : six mondes côte à côte, un pixel par case.
 * Hors build, sans dépendance. `?graine=` choisit la première graine, ou une liste séparée par des virgules.
 */
import { World, GROUND_WATER, GROUND_FORD, GROUND_BANK, GROUND_PATH } from '../sim/world';
import { TREE_MIN } from '../sim/data';

interface MondeStats {
  seed: number;
  water: number;   // distance du départ au point d'eau le plus proche
  trees: number;   // arbres à moins de 20 cases du départ
  ford: number;    // distance du départ au premier gué
}

interface MondeGlobal {
  seeds: number[];
  stats: MondeStats[];
}

declare global {
  interface Window { __monde?: MondeGlobal; }
}

const SPAN = 256;
const HALF = 128;

const COLOR = {
  water: 0x4c8fa8,
  ford: 0x9ed7e4,
  bank: 0xc9b47e,
  path: 0x9a7646,
  soil: 0x6f9350,
  tree: 0x315d33,
  loot: 0x9aa0a6,
} as const;

const DEPOSIT_COLOR = [0, 0xd4552b, 0xe4dcc6, 0x8fe6ff, 0x2fd6a3] as const;

function readSeeds(): number[] {
  const raw = new URLSearchParams(location.search).get('graine');
  if (!raw) return [1, 2, 3, 4, 5, 6];
  const list = raw.split(',').map((s) => Number.parseInt(s, 10)).filter((n) => Number.isFinite(n));
  if (list.length >= 6) return list.slice(0, 6);
  const base = list[0] ?? 1;
  return Array.from({ length: 6 }, (_, i) => base + i);
}

function paint(seed: number): { canvas: HTMLCanvasElement; stats: MondeStats } {
  const w = new World(seed);
  w.ensureArea(-HALF, -HALF, HALF - 1, HALF - 1);
  const canvas = document.createElement('canvas');
  canvas.width = SPAN;
  canvas.height = SPAN;
  canvas.className = 'map';
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(SPAN, SPAN);
  const data = img.data;
  let trees = 0;
  for (let y = -HALF; y < HALF; y++) {
    for (let x = -HALF; x < HALF; x++) {
      const c = w.chunk(x >> 5, y >> 5)!;
      const i = ((y & 31) << 5) | (x & 31);
      const g = c.ground[i];
      let color: number = COLOR.soil;
      if (g === GROUND_WATER) color = COLOR.water;
      else if (g === GROUND_FORD) color = COLOR.ford;
      else if (g === GROUND_PATH) color = COLOR.path;
      else if (g === GROUND_BANK) color = COLOR.bank;
      else if (c.deposit[i]) color = DEPOSIT_COLOR[c.deposit[i]] ?? COLOR.soil;
      else if (c.canopy[i] >= TREE_MIN) color = COLOR.tree;
      else if (c.loot[i]) color = COLOR.loot;
      if (c.canopy[i] >= TREE_MIN && Math.hypot(x, y) < 20) trees++;
      const o = ((y + HALF) * SPAN + (x + HALF)) * 4;
      data[o] = (color >> 16) & 255;
      data[o + 1] = (color >> 8) & 255;
      data[o + 2] = color & 255;
      data[o + 3] = 255;
    }
  }
  // le repère du départ : une petite croix orange sur la case (0, 0)
  for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const o = ((HALF + dy) * SPAN + (HALF + dx)) * 4;
    data[o] = 255; data[o + 1] = 140; data[o + 2] = 30; data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return {
    canvas,
    stats: {
      seed,
      water: Math.hypot(w.river.x, w.river.y),
      trees,
      ford: Math.hypot(w.firstFord.x, w.firstFord.y),
    },
  };
}

function main(): void {
  const seeds = readSeeds();
  const grid = document.getElementById('grid')!;
  const stats: MondeStats[] = [];
  for (const seed of seeds) {
    const { canvas, stats: s } = paint(seed);
    stats.push(s);
    const card = document.createElement('figure');
    const title = document.createElement('figcaption');
    title.textContent = `graine ${seed}`;
    const values = document.createElement('p');
    values.textContent = `eau ${s.water.toFixed(1)} · arbres ${s.trees} · gué ${s.ford.toFixed(1)}`;
    card.append(title, canvas, values);
    grid.append(card);
  }
  window.__monde = { seeds, stats };
}

main();
