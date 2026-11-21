import { describe, it, expect } from 'vitest';
import {
  World, Chunk, CHUNK, GROUND_SOIL, GROUND_WATER, GROUND_BANK, GROUND_PATH, BANK_FIELD, PATH_TILE,
  type PathSegment,
} from '../src/sim/world';
import { serialize, deserialize, type SaveData } from '../src/sim/save';
import { Game } from '../src/sim/game';
import { TREE_MIN } from '../src/sim/data';

const SEEDS = Array.from({ length: 50 }, (_, i) => i + 1);

function ground(w: World, x: number, y: number): number {
  const c = w.chunk(x >> 5, y >> 5)!;
  return c.ground[((y & 31) << 5) | (x & 31)];
}

function distanceToSegment(s: PathSegment, x: number, y: number): number {
  const dx = s.bx - s.ax, dy = s.by - s.ay, l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - s.ax) * dx + (y - s.ay) * dy) / l2)) : 0;
  return Math.hypot(x - s.ax - t * dx, y - s.ay - t * dy);
}

function nearestWater(w: World, x: number, y: number, reach: number): number {
  let best = Infinity;
  for (let ty = y - reach; ty <= y + reach; ty++) {
    for (let tx = x - reach; tx <= x + reach; tx++) {
      const d = Math.hypot(tx + 0.5 - x, ty + 0.5 - y);
      if (d < best && ground(w, tx, ty) === GROUND_WATER) best = d;
    }
  }
  return best;
}

function flood(w: World, limit: number): Uint8Array {
  const n = limit * 2 + 1, seen = new Uint8Array(n * n);
  const q: [number, number][] = [[0, 0]];
  seen[limit * n + limit] = 1;
  for (let qi = 0; qi < q.length; qi++) {
    const [x, y] = q[qi];
    const dirs: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [dx, dy] of dirs) {
      const nx = x + dx, ny = y + dy;
      if (nx < -limit || nx > limit || ny < -limit || ny > limit) continue;
      const i = (ny + limit) * n + (nx + limit);
      if (seen[i] || ground(w, nx, ny) === GROUND_WATER) continue;
      seen[i] = 1;
      q.push([nx, ny]);
    }
  }
  return seen;
}

describe('monde : déterminisme et rivage', () => {
  it('même graine, même monde, quel que soit l’ordre de génération des blocs', () => {
    const blocks: [number, number][] = [[-2, -2], [1, -1], [0, 0], [2, 3], [-3, 2]];
    for (const seed of SEEDS) {
      const a = new World(seed), b = new World(seed);
      for (const [cx, cy] of blocks) a.chunk(cx, cy);
      for (const [cx, cy] of [...blocks].reverse()) b.chunk(cx, cy);
      for (const [cx, cy] of blocks) {
        const ca = a.chunk(cx, cy)!, cb = b.chunk(cx, cy)!;
        expect(Array.from(ca.ground)).toEqual(Array.from(cb.ground));
        expect(Array.from(ca.shore)).toEqual(Array.from(cb.shore));
        expect(Array.from(ca.canopy)).toEqual(Array.from(cb.canopy));
        expect(Array.from(ca.cap)).toEqual(Array.from(cb.cap));
        expect(Array.from(ca.deposit)).toEqual(Array.from(cb.deposit));
        expect(Array.from(ca.amount)).toEqual(Array.from(cb.amount));
        expect(Array.from(ca.loot)).toEqual(Array.from(cb.loot));
      }
    }
  }, 60_000);

  it('les blocs voisins partagent leur bord, et le champ ne saute jamais de plus de 1,5', () => {
    for (const seed of SEEDS) {
      const w = new World(seed);
      const blocks: Chunk[] = [w.chunk(-1, 0)!, w.chunk(0, 0)!, w.chunk(1, 0)!, w.chunk(0, -1)!, w.chunk(0, 1)!];
      const east = w.chunk(1, 0)!, west = w.chunk(-1, 0)!, centre = w.chunk(0, 0)!, north = w.chunk(0, 1)!, south = w.chunk(0, -1)!;
      for (let j = 0; j <= CHUNK; j++) {
        expect(centre.shore[j * 33 + CHUNK]).toBe(east.shore[j * 33]);
        expect(centre.shore[j * 33]).toBe(west.shore[j * 33 + CHUNK]);
        expect(centre.shore[CHUNK * 33 + j]).toBe(north.shore[j]);
        expect(centre.shore[j]).toBe(south.shore[CHUNK * 33 + j]);
      }
      for (const c of blocks) {
        for (let j = 0; j <= CHUNK; j++) {
          for (let i = 0; i <= CHUNK; i++) {
            const x = c.cx * CHUNK + i, y = c.cy * CHUNK + j;
            expect(c.shore[j * 33 + i]).toBeCloseTo(w.shoreField(x, y), 5);
            if (i > 0) expect(Math.abs(c.shore[j * 33 + i] - c.shore[j * 33 + i - 1])).toBeLessThanOrEqual(1.5);
            if (j > 0) expect(Math.abs(c.shore[j * 33 + i] - c.shore[(j - 1) * 33 + i])).toBeLessThanOrEqual(1.5);
          }
        }
      }
    }
  }, 60_000);

  it('chaque case suit exactement la règle du contrat', () => {
    for (const seed of SEEDS) {
      const w = new World(seed);
      for (const [cx, cy] of [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1]] as [number, number][]) {
        const c = w.chunk(cx, cy)!;
        const paths = w.pathSegments(cx, cy);
        for (let ly = 0; ly < CHUNK; ly++) {
          for (let lx = 0; lx < CHUNK; lx++) {
            const x = cx * CHUNK + lx, y = cy * CHUNK + ly;
            const a = (c.shore[ly * 33 + lx] + c.shore[ly * 33 + lx + 1] + c.shore[(ly + 1) * 33 + lx] + c.shore[(ly + 1) * 33 + lx + 1]) / 4;
            const pd = paths.reduce((m, s) => Math.min(m, distanceToSegment(s, x + 0.5, y + 0.5)), Infinity);
            const want = a < 0 ? GROUND_WATER : pd < PATH_TILE ? GROUND_PATH : a < BANK_FIELD ? GROUND_BANK : GROUND_SOIL;
            expect(c.ground[ly * 32 + lx]).toBe(want);
          }
        }
      }
    }
  }, 60_000);

  it('l’eau la plus proche est à bonne distance et le départ est une clairière sèche', () => {
    for (const seed of SEEDS) {
      const w = new World(seed);
      w.ensureArea(-27, -27, 27, 27);
      const near = nearestWater(w, 0, 0, 27);
      expect(near).toBeGreaterThanOrEqual(14);
      expect(near).toBeLessThanOrEqual(26);
      const rd = Math.hypot(w.river.x, w.river.y);
      expect(rd).toBeGreaterThanOrEqual(14);
      expect(rd).toBeLessThanOrEqual(26);
      expect(ground(w, Math.floor(w.river.x), Math.floor(w.river.y))).toBe(GROUND_WATER);
      for (let y = -7; y <= 7; y++) {
        for (let x = -7; x <= 7; x++) {
          if (Math.hypot(x + 0.5, y + 0.5) > 6.5) continue;
          expect(ground(w, x, y)).not.toBe(GROUND_WATER);
          expect(w.tree(x, y)).toBe(false);
          expect(w.deposit(x, y)).toBe(0);
          expect(w.loot(x, y)).toBe(0);
        }
      }
    }
  }, 60_000);
});

describe('monde : gués ronds', () => {
  function waterWidth(w: World, x: number, y: number, nx: number, ny: number): number {
    let sum = 0;
    for (const side of [1, -1]) {
      let last = 0;
      for (let t = 0; t <= 8; t += 0.01) {
        if (w.shoreField(x + nx * t * side, y + ny * t * side) < 0) last = t;
        else break;
      }
      sum += last;
    }
    return sum;
  }

  it('l’extrémité de l’eau est ronde : à une case de la pointe, la largeur dépasse 3 cases', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const w = new World(seed);
      const eps = 0.05;
      const px = w.river.x, py = w.river.y;
      const gx = (w.shoreField(px + eps, py) - w.shoreField(px - eps, py)) / (2 * eps);
      const gy = (w.shoreField(px, py + eps) - w.shoreField(px, py - eps)) / (2 * eps);
      const gl = Math.hypot(gx, gy);
      expect(gl).toBeGreaterThan(1e-3);
      const nx = gx / gl, ny = gy / gl;
      const ax = -ny, ay = nx;
      const fx = w.firstFord.x, fy = w.firstFord.y;
      let end = -1;
      for (let d = 0; d <= 8; d += 0.01) {
        if (w.shoreField(fx + ax * d, fy + ay * d) < 0) { end = d; break; }
      }
      expect(end).toBeGreaterThan(0);
      const cx = fx + ax * (end + 1), cy = fy + ay * (end + 1);
      expect(w.shoreField(cx, cy)).toBeLessThan(0);
      expect(waterWidth(w, cx, cy, nx, ny)).toBeGreaterThanOrEqual(3);
    }
  }, 60_000);
});

describe('monde : eau, arbres, gisements', () => {
  it('une eau ne touche jamais la prairie, et rien de vivant ne pousse sur l’eau ou la berge', () => {
    for (const seed of SEEDS) {
      const w = new World(seed);
      w.ensureArea(-40, -40, 40, 40);
      for (let y = -40; y <= 40; y++) {
        for (let x = -40; x <= 40; x++) {
          const g = ground(w, x, y);
          if (g === GROUND_WATER) {
            const dirs: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
            for (const [dx, dy] of dirs) {
              const n = ground(w, x + dx, y + dy);
              expect(n === GROUND_WATER || n === GROUND_BANK || n === GROUND_PATH).toBe(true);
            }
            expect(w.tree(x, y)).toBe(false);
            expect(w.deposit(x, y)).toBe(0);
            expect(w.loot(x, y)).toBe(0);
          }
          if (w.tree(x, y)) expect(g).toBe(GROUND_SOIL);
          if (w.deposit(x, y)) expect(g).not.toBe(GROUND_WATER);
          if (w.loot(x, y)) expect(g).not.toBe(GROUND_WATER);
        }
      }
    }
  }, 60_000);

  it('les gisements garantis sont sur la terre ferme, du bon côté pour les trois premiers', () => {
    for (const seed of SEEDS) {
      const w = new World(seed);
      w.ensureArea(-60, -60, 60, 60);
      for (const b of w.blobs) {
        const cx = Math.round(b.x), cy = Math.round(b.y);
        expect(ground(w, cx, cy)).not.toBe(GROUND_WATER);
        for (let y = cy - Math.ceil(b.r); y <= cy + Math.ceil(b.r); y++) {
          for (let x = cx - Math.ceil(b.r); x <= cx + Math.ceil(b.r); x++) {
            if (Math.hypot(x - b.x, y - b.y) <= b.r) expect(ground(w, x, y)).not.toBe(GROUND_WATER);
          }
        }
        expect(w.shoreField(cx, cy)).toBeGreaterThanOrEqual(b.r + 2 - 1e-6);
      }
      const crossesWater = (b: { x: number; y: number }): boolean => {
        for (let i = 1; i < 20; i++) {
          const t = i / 20;
          if (ground(w, Math.round(b.x * t), Math.round(b.y * t)) === GROUND_WATER) return true;
        }
        return false;
      };
      expect(crossesWater(w.blobs[0])).toBe(false);
      expect(crossesWater(w.blobs[1])).toBe(false);
      expect(crossesWater(w.blobs[2])).toBe(false);
      expect(w.grove.r).toBeGreaterThan(0);
    }
  }, 60_000);

  it('parcours sans traverser l’eau : tous les gisements et l’autre rive sont atteignables', () => {
    for (const seed of SEEDS) {
      const w = new World(seed);
      const limit = 70;
      w.ensureArea(-limit, -limit, limit, limit);
      const seen = flood(w, limit);
      const tileSeen = (x: number, y: number): boolean => x >= -limit && x <= limit && y >= -limit && y <= limit
        && seen[(y + limit) * (limit * 2 + 1) + (x + limit)] === 1;
      for (const b of w.blobs) expect(tileSeen(Math.round(b.x), Math.round(b.y))).toBe(true);
      const r = Math.hypot(w.river.x, w.river.y), ux = w.river.x / r, uy = w.river.y / r;
      let far: { x: number; y: number } | null = null;
      for (let d = 1; d <= 30 && !far; d += 0.5) {
        const x = Math.round(w.river.x + ux * d), y = Math.round(w.river.y + uy * d);
        if (Math.abs(x) > limit || Math.abs(y) > limit) break;
        if (ground(w, x, y) !== GROUND_WATER) far = { x, y };
      }
      expect(far).not.toBeNull();
      expect(tileSeen(far!.x, far!.y)).toBe(true);
    }
  }, 60_000);
});

describe('monde : bosquets et sentiers', () => {
  it('au moins douze arbres près du départ, dont un bosquet de huit arbres voisins', () => {
    for (const seed of SEEDS) {
      const w = new World(seed);
      w.ensureArea(-20, -20, 20, 20);
      const trees = new Set<string>();
      for (let y = -20; y <= 20; y++) {
        for (let x = -20; x <= 20; x++) {
          if (Math.hypot(x, y) <= 20 && w.tree(x, y)) trees.add(x + ',' + y);
        }
      }
      expect(trees.size).toBeGreaterThanOrEqual(12);
      const seen = new Set<string>();
      let best = 0;
      for (const start of trees) {
        if (seen.has(start)) continue;
        const q = [start];
        seen.add(start);
        for (let qi = 0; qi < q.length; qi++) {
          const parts = q[qi].split(','), x = Number(parts[0]), y = Number(parts[1]);
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              const k = (x + dx) + ',' + (y + dy);
              if (trees.has(k) && !seen.has(k)) { seen.add(k); q.push(k); }
            }
          }
        }
        best = Math.max(best, q.length);
      }
      expect(best).toBeGreaterThanOrEqual(8);
    }
  }, 60_000);

  it('le chemin du camp atteint le bosquet, le premier gué et le gisement de fer', () => {
    for (const seed of SEEDS) {
      const w = new World(seed);
      const targets = [w.grove, w.firstFord, w.blobs[0]];
      for (const t of targets) {
        const cx = Math.floor(t.x / CHUNK), cy = Math.floor(t.y / CHUNK);
        const paths = w.pathSegments(cx, cy);
        const ends = paths.some((s) => Math.hypot(s.bx - t.x, s.by - t.y) < 1e-6);
        expect(ends).toBe(true);
      }
      expect(Math.hypot(w.firstFord.x, w.firstFord.y)).toBeLessThan(40);
    }
  }, 60_000);
});

describe('monde : sauvegarde et vitesse', () => {
  it('une sauvegarde v2 est refusée', () => {
    const old = { v: 2 } as unknown as SaveData;
    expect(() => deserialize(old)).toThrow('ancienne version');
    const g = new Game(1);
    const fresh = serialize(g);
    expect(fresh.v).toBe(3);
    expect(deserialize(structuredClone(fresh)).seed).toBe(1);
  });

  it('la génération reste sous 8 ms par bloc en moyenne', () => {
    const blocks: [number, number][] = [];
    for (let i = 0; i < 64; i++) blocks.push([(i % 8) - 3, Math.floor(i / 8) - 4]);
    const w = new World(123);
    const t0 = performance.now();
    for (const [cx, cy] of blocks) w.chunk(cx, cy);
    const average = (performance.now() - t0) / blocks.length;
    expect(average).toBeLessThan(8);
  });
});


describe('relecture : débris, gisements, arbres, rivière, sentes', () => {
  it('exactement douze débris réels près du départ, et chaque scrap en porte un', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const w = new World(seed);
      expect(w.scraps.size).toBe(12);
      for (const k of w.scraps) {
        const x = Math.floor(k / 65536) - 32768;
        const y = (k % 65536) - 32768;
        expect(w.loot(x, y)).toBe(1);
        expect(w.ground(x, y)).toBe(GROUND_SOIL);
        expect(w.deposit(x, y)).toBe(0);
        expect(w.tree(x, y)).toBe(false);
      }
      let real = 0;
      for (let y = -11; y <= 11; y++) {
        for (let x = -11; x <= 11; x++) {
          if (Math.hypot(x + 0.5, y + 0.5) < 11 && w.loot(x, y)) real++;
        }
      }
      expect(real).toBe(12);
    }
  }, 120_000);

  it('les gisements hors blobs couvrent 4 à 8 % du monde', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const w = new World(seed);
      w.ensureArea(-128, -128, 127, 127);
      let deposits = 0;
      for (let cy = -4; cy < 4; cy++) {
        for (let cx = -4; cx < 4; cx++) {
          for (const v of w.chunk(cx, cy)!.deposit) if (v) deposits++;
        }
      }
      const coverage = deposits / (256 * 256);
      expect(coverage).toBeGreaterThanOrEqual(0.04);
      expect(coverage).toBeLessThanOrEqual(0.08);
    }
  }, 120_000);

  it('les arbres couvrent 3 à 7 % du monde et restent groupés', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const w = new World(seed);
      w.ensureArea(-128, -128, 127, 127);
      const tree = new Uint8Array(256 * 256);
      let trees = 0;
      for (let cy = -4; cy < 4; cy++) {
        for (let cx = -4; cx < 4; cx++) {
          const c = w.chunk(cx, cy)!;
          for (let ly = 0; ly < 32; ly++) {
            for (let lx = 0; lx < 32; lx++) {
              if (c.canopy[ly * 32 + lx] >= TREE_MIN) {
                tree[((cy * 32 + ly) + 128) * 256 + ((cx * 32 + lx) + 128)] = 1;
                trees++;
              }
            }
          }
        }
      }
      expect(trees / (256 * 256)).toBeGreaterThanOrEqual(0.03);
      expect(trees / (256 * 256)).toBeLessThanOrEqual(0.07);
      let grouped = 0;
      for (let y = 0; y < 256; y++) {
        for (let x = 0; x < 256; x++) {
          if (!tree[y * 256 + x]) continue;
          let near = false;
          for (let dy = -2; dy <= 2 && !near; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
              if (dx === 0 && dy === 0) continue;
              const nx = x + dx, ny = y + dy;
              if (nx >= 0 && nx < 256 && ny >= 0 && ny < 256 && tree[ny * 256 + nx]) { near = true; break; }
            }
          }
          if (near) grouped++;
        }
      }
      expect(grouped / trees).toBeGreaterThanOrEqual(0.7);
    }
  }, 120_000);

  it('la rivière serpente vraiment, sans pente excessive', () => {
    for (const seed of SEEDS) {
      const w = new World(seed);
      let min = Infinity, max = -Infinity;
      for (let u = -128; u <= 128; u++) {
        const c = w.riverCenter(u);
        min = Math.min(min, c);
        max = Math.max(max, c);
        expect(Math.abs(w.riverSlope(u))).toBeLessThanOrEqual(1.2);
      }
      expect(max - min).toBeGreaterThanOrEqual(25);
    }
  }, 120_000);

  it('les sentes régionales ne plongent pas dans la rivière', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const w = new World(seed);
      for (let cy = -4; cy < 4; cy++) {
        for (let cx = -4; cx < 4; cx++) {
          for (const s of w.pathSegments(cx, cy)) {
            expect(w.shoreField(s.ax, s.ay)).toBeGreaterThanOrEqual(0);
            expect(w.shoreField(s.bx, s.by)).toBeGreaterThanOrEqual(0);
          }
        }
      }
    }
  }, 120_000);
});
