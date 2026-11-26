// Le Piège et la Tannerie : attirer, prendre, trier, tanner et livrer du cuir.
import { describe, it, expect } from 'vitest';
import { Game } from '../src/sim/game';
import { B, ERA_SPEED, I, ITEMS, type Dir } from '../src/sim/data';
import { Status, type Ent } from '../src/sim/ent';
import { TRAP_OUT_MAX, TRAP_RANGE, TRAP_TICKS, type Zone } from '../src/sim/fauna';
import { deserialize, serialize } from '../src/sim/save';
import { GROUND_WATER } from '../src/sim/world';

const run = (g: Game, ticks: number): void => { for (let i = 0; i < ticks; i++) g.step(); };
const ids = ITEMS.map((it) => it.id);
const snap = (g: Game): number[] => ids.map((id) => g.ledger(id));
const same = (g: Game, before: number[], what: string): void => ids.forEach((id, i) => {
  expect(g.ledger(id), `${what} · ${ITEMS[id].name}`).toBeCloseTo(before[i], 6);
});

/** Nettoie une zone du terrain : eau, gisements, arbres et dalles (copié du fichier des livraisons). */
const clear = (g: Game, x0: number, y0: number, x1: number, y1: number): void => {
  g.world.ensureArea(x0 - 2, y0 - 2, x1 + 2, y1 + 2);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const c = g.world.at(x, y)!, i = ((y & 31) << 5) | (x & 31);
    if (c.ent[i]) continue;
    c.ground[i] = 0; c.deposit[i] = 0; c.amount[i] = 0; c.canopy[i] = 0; c.cap[i] = 0; c.loot[i] = 0;
  }
};

/** Une partie à l'ère de la Pierre avec de quoi bâtir. */
function stoneGame(seed: number): Game {
  const g = new Game(seed);
  g.quota = 3;
  g.stock[I.pierre] = 200;
  g.stock[I.bois] = 100;
  g.stock[I.carbone] = 50;
  return g;
}

interface Cell { x: number; y: number; }

/** La place d'un Piège de 2×2 dont le centre est le plus proche de `want` cases d'une bête. */
function trapSpot(g: Game, bx: number, by: number, rot: Dir, want = 4): Cell {
  const x0 = Math.floor(bx), y0 = Math.floor(by);
  let best: Cell | null = null;
  let bestD = Infinity;
  for (let y = y0 - 6; y <= y0 + 5; y++) {
    for (let x = x0 - 6; x <= x0 + 5; x++) {
      const d = Math.abs(Math.hypot(x + 1 - bx, y + 1 - by) - want);
      if (d >= bestD) continue;
      if (!g.canPlace(B.piege, x, y, rot).ok) continue;
      bestD = d;
      best = { x, y };
    }
  }
  if (!best) throw new Error('aucune place pour le Piège');
  return best;
}

/** Pose un Piège près d'une bête et le rend. */
function placeTrap(g: Game, bx: number, by: number, rot: Dir): Ent {
  clear(g, Math.floor(bx) - 9, Math.floor(by) - 9, Math.floor(bx) + 9, Math.floor(by) + 9);
  const spot = trapSpot(g, bx, by, rot);
  const res = g.place('piege', spot.x, spot.y, rot);
  expect(res.ok, res.reason).toBe(true);
  return g.entAt(spot.x, spot.y)!;
}

/** Attend une prise et rend le pas où elle a eu lieu. */
function waitCatch(g: Game, e: Ent, max: number): number {
  const done = e.done;
  for (let i = 0; i < max; i++) {
    g.step();
    if (e.done > done) return g.tick;
  }
  return -1;
}

describe('le Piège', () => {
  it('prend une bête à 4 cases en moins de 30 s et donne exactement 1 peau, 1 graisse et 1 os', () => {
    const g = stoneGame(201);
    const beast = g.beasts[0];
    expect(beast).toBeDefined();
    const trap = placeTrap(g, beast.x, beast.y, 0);
    const before = [g.ledger(I.peau), g.ledger(I.graisse), g.ledger(I.os)];

    let ticks = 0;
    while (trap.done < 1 && ticks < 1800) { g.step(); ticks++; }

    expect(trap.done).toBe(1);
    expect(ticks).toBeLessThan(1800);
    expect(trap.out![I.peau]).toBe(1);
    expect(trap.out![I.graisse]).toBe(1);
    expect(trap.out![I.os]).toBe(1);
    expect(g.ledger(I.peau)).toBe(before[0] + 1);
    expect(g.ledger(I.graisse)).toBe(before[1] + 1);
    expect(g.ledger(I.os)).toBe(before[2] + 1);
  }, 30_000);

  it('ne prend rien s’il est loin de toute bête, et dit pourquoi', () => {
    const g = stoneGame(202);
    clear(g, -6, -6, 10, 10);
    expect(g.place('piege', 4, 4, 0).ok).toBe(true);
    const trap = g.entAt(4, 4)!;
    for (const b of g.beasts) {
      expect(Math.hypot(b.x - trap.cx, b.y - trap.cy), `bête ${b.id}`).toBeGreaterThan(TRAP_RANGE + 3);
    }
    run(g, 3600);
    expect(trap.done).toBe(0);
    expect(trap.outCount).toBe(0);
    expect(trap.status).toBe(Status.NoBeast);
  }, 30_000);

  it('contourne un Stockage posé entre lui et la bête', () => {
    const g = stoneGame(207);
    const beast = g.beasts[0];
    const bx = Math.floor(beast.x), by = Math.floor(beast.y);
    clear(g, bx - 14, by - 14, bx + 14, by + 14);
    beast.x = bx + 0.5; beast.y = by + 0.5; beast.tx = beast.x; beast.ty = beast.y;
    beast.state = 'graze'; beast.timer = 5000;
    const id = beast.id;
    expect(g.place('piege', bx - 5, by - 1, 0).ok).toBe(true);
    const trap = g.entAt(bx - 5, by - 1)!;
    expect(g.place('entrepot', bx - 2, by, 0).ok).toBe(true);
    expect(Math.hypot(trap.cx - beast.x, trap.cy - beast.y)).toBeLessThanOrEqual(TRAP_RANGE);

    let ticks = 0;
    while (trap.done < 1 && ticks < 3600) { g.step(); ticks++; }
    expect(trap.done, `pas de prise en ${ticks} pas`).toBe(1);
    expect(g.beasts.some((b) => b.id === id)).toBe(false);
  }, 30_000);

  it('dit NoPath quand des dalles bouchent toute sa bordure', () => {
    const g = stoneGame(208);
    const beast = g.beasts[0];
    const bx = Math.floor(beast.x), by = Math.floor(beast.y);
    clear(g, bx - 14, by - 14, bx + 14, by + 14);
    const trapX = bx - 1, trapY = by - 5;
    expect(g.place('piege', trapX, trapY, 0).ok).toBe(true);
    const trap = g.entAt(trapX, trapY)!;
    const id = beast.id;
    beast.x = bx + 0.5; beast.y = by + 0.5; beast.tx = beast.x; beast.ty = beast.y;
    beast.state = 'graze'; beast.timer = 5000;
    for (let y = trapY - 1; y <= trapY + 2; y++) {
      for (let x = trapX - 1; x <= trapX + 2; x++) {
        if (x >= trapX && x < trapX + 2 && y >= trapY && y < trapY + 2) continue;
        const res = g.place('dalle', x, y, 0);
        expect(res.ok, `dalle en ${x},${y} : ${res.reason}`).toBe(true);
      }
    }
    expect(Math.hypot(trap.cx - beast.x, trap.cy - beast.y)).toBeLessThanOrEqual(TRAP_RANGE);
    const before = [g.ledger(I.peau), g.ledger(I.graisse), g.ledger(I.os)];

    run(g, 3600);

    expect(trap.done).toBe(0);
    expect(g.ledger(I.peau)).toBe(before[0]);
    expect(g.ledger(I.graisse)).toBe(before[1]);
    expect(g.ledger(I.os)).toBe(before[2]);
    expect(g.beasts.some((b) => b.id === id)).toBe(true);
    expect(trap.status).toBe(Status.NoPath);
  }, 30_000);

  it('garde au moins TRAP_TICKS / ERA_SPEED[1] pas entre deux prises en version 2', () => {
    const g = stoneGame(203);
    const beast = g.beasts.find((b) => g.fauna.zones[b.zone].cap >= 2) ?? g.beasts[0];
    const trap = placeTrap(g, beast.x, beast.y, 0);
    const first = waitCatch(g, trap, 3000);
    expect(first).toBeGreaterThan(-1);
    const second = waitCatch(g, trap, 3000);
    expect(second).toBeGreaterThan(-1);
    expect(trap.era).toBe(2);
    expect(second - first).toBeGreaterThanOrEqual(TRAP_TICKS / ERA_SPEED[1]);
  }, 30_000);

  it('s’arrête sortie pleine, le dit, et laisse les bêtes vivantes', () => {
    const g = stoneGame(204);
    const beast = g.beasts.find((b) => g.fauna.zones[b.zone].cap >= 2) ?? g.beasts[0];
    const trap = placeTrap(g, beast.x, beast.y, 0);
    for (let i = 0; i < 3000 && trap.done < 2; i++) g.step();
    expect(trap.done).toBe(2);
    expect(trap.outCount).toBe(TRAP_OUT_MAX);
    run(g, 5);
    expect(trap.status).toBe(Status.Blocked);
    const alive = new Set(g.beasts.map((b) => b.id));
    run(g, 600);
    expect(trap.done).toBe(2);
    for (const id of alive) expect(g.beasts.some((b) => b.id === id), `bête ${id}`).toBe(true);
  }, 30_000);

  it('démolir un Piège plein rend sa sortie et son prix au stock', () => {
    const g = stoneGame(205);
    const beast = g.beasts.find((b) => g.fauna.zones[b.zone].cap >= 2) ?? g.beasts[0];
    const trap = placeTrap(g, beast.x, beast.y, 0);
    for (let i = 0; i < 3000 && trap.done < 2; i++) g.step();
    expect(trap.outCount).toBe(TRAP_OUT_MAX);
    const before = snap(g);
    expect(g.remove(trap.x, trap.y)).not.toBeNull();
    same(g, before, 'Piège démoli');
  }, 30_000);

  it('une Tannerie fait 1 cuir avec 1 peau', () => {
    const g = stoneGame(206);
    clear(g, 6, 6, 16, 16);
    const res = g.place('tannerie', 8, 8, 0);
    expect(res.ok, res.reason).toBe(true);
    const tannery = g.entAt(8, 8)!;
    tannery.buf![I.peau] = 1;
    run(g, 200);
    expect(tannery.out![I.cuir]).toBe(1);
    expect(tannery.out![I.peau]).toBe(0);
  }, 30_000);
});

// ------------------------------------------------------------- la chaîne du cuir

/** La place d'un Piège à l'ouest d'une bête, assez loin du départ pour bâtir la chaîne. */
function chainTrapSpot(g: Game, bx: number, by: number): Cell {
  const x0 = Math.floor(bx), y0 = Math.floor(by);
  let best: Cell | null = null;
  let bestScore = Infinity;
  for (let y = y0 - 5; y <= y0 + 4; y++) {
    for (let x = x0 - 6; x <= x0 + 5; x++) {
      const cx = x + 1, cy = y + 1;
      if (Math.hypot(cx - bx, cy - by) > TRAP_RANGE - 0.5) continue;
      if (x < 18) continue;
      if (!g.canPlace(B.piege, x, y, 2).ok) continue;
      const score = cx + Math.abs(cy);
      if (score < bestScore) { bestScore = score; best = { x, y }; }
    }
  }
  if (!best) throw new Error('aucune place pour le Piège de la chaîne');
  return best;
}

const dirOf = (dx: number, dy: number): Dir => (dx > 0 ? 0 : dx < 0 ? 2 : dy > 0 ? 1 : 3);

/** Le trajet de la Tannerie à la Tour : tout droit vers l'ouest, un virage, puis l'entrée de la Tour. */
function finalPath(sx: number, y0: number): Cell[] {
  const cells: Cell[] = [];
  for (let x = sx; x >= 4; x--) cells.push({ x, y: y0 });
  if (y0 > 0) for (let y = y0 - 1; y >= 0; y--) cells.push({ x: 4, y });
  else if (y0 < 0) for (let y = y0 + 1; y <= 0; y++) cells.push({ x: 4, y });
  cells.push({ x: 3, y: 0 }, { x: 2, y: 0 });
  return cells;
}

/** Toutes les cases qu'occuperont le Piège, les bâtiments et les tapis de la chaîne. */
function chainCells(X: number, y0: number): Cell[] {
  const triX = X - 4, tanX = X - 9;
  const cells: Cell[] = [];
  for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) cells.push({ x: X + i, y: y0 + j });
  for (let x = X - 1; x >= triX; x--) cells.push({ x, y: y0 });
  for (let x = triX - 1; x >= tanX + 2; x--) cells.push({ x, y: y0 });
  for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) cells.push({ x: tanX + i, y: y0 + j });
  for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
    cells.push({ x: triX + i, y: y0 - 2 + j });
    cells.push({ x: triX + i, y: y0 + 1 + j });
  }
  for (const c of finalPath(tanX - 1, y0)) cells.push(c);
  return cells;
}

/** Le trajet ne coupe aucune eau : la sauvegarde n'a pas à retenir le sol, qui ne change jamais en jeu. */
function dryChain(g: Game, X: number, y0: number): boolean {
  return chainCells(X, y0).every((c) => g.world.ground(c.x, c.y) !== GROUND_WATER);
}

/** Monte la chaîne complète : Piège, Trieur, Tannerie, Stockages, tapis jusqu'à la Tour. */
function buildChain(seed: number): { g: Game; trap: Ent } {
  const g = stoneGame(seed);
  const zones = g.fauna.zones
    .map((z, i) => ({ z, i }))
    .filter(({ z }) => z.herd && z.cap >= 2 && z.count >= 2 && z.ax >= 24);
  zones.sort((a, b) => a.z.ax + 2 * Math.abs(a.z.ay) - (b.z.ax + 2 * Math.abs(b.z.ay)));
  if (!zones.length) throw new Error('aucun troupeau à l’est');

  let chosen: { z: Zone; i: number; x: number; y: number } | null = null;
  for (const { z, i } of zones) {
    const beast = g.beasts.find((b) => b.zone === i);
    if (!beast) continue;
    const spot = chainTrapSpot(g, beast.x, beast.y);
    if (!dryChain(g, spot.x, spot.y)) continue;
    chosen = { z, i, x: spot.x, y: spot.y };
    break;
  }
  if (!chosen) throw new Error('aucun troupeau avec un trajet au sec');
  const { z, i: zi, x: X, y: y0 } = chosen;

  // un seul troupeau suffit : les autres ne font que ralentir le test
  g.fauna.beasts = g.fauna.beasts.filter((b) => b.zone === zi);
  for (const other of g.fauna.zones) {
    if (other === z) continue;
    other.herd = false;
    other.cap = 0;
    other.count = 0;
  }
  z.count = g.fauna.beasts.length;

  // le trajet est au sec : nettoyer chaque case ne touche jamais le sol (que la sauvegarde ne garde pas)
  for (const c of chainCells(X, y0)) clear(g, c.x, c.y, c.x, c.y);

  const triX = X - 4;
  const tanX = X - 9;

  const put = (key: string, x: number, y: number, rot: Dir, filter?: number): Ent => {
    const res = g.place(key, x, y, rot, filter === undefined ? {} : { filter });
    expect(res.ok, `${key} en ${x},${y} : ${res.reason}`).toBe(true);
    return g.entAt(x, y)!;
  };

  const trap = put('piege', X, y0, 2);
  for (let x = X - 1; x >= triX + 1; x--) put('convoyeur', x, y0, 2);
  put('trieur', triX, y0, 2, I.peau);
  for (let x = triX - 1; x >= tanX + 2; x--) put('convoyeur', x, y0, 2);
  put('tannerie', tanX, y0, 2);
  put('entrepot', triX, y0 - 2, 0);
  put('entrepot', triX, y0 + 1, 0);

  const path = finalPath(tanX - 1, y0);
  for (let i = 0; i < path.length; i++) {
    const c = path[i];
    const rot = i + 1 < path.length ? dirOf(path[i + 1].x - c.x, path[i + 1].y - c.y) : 2;
    put('convoyeur', c.x, c.y, rot);
  }
  return { g, trap };
}

describe('la chaîne des 30 cuirs', () => {
  for (const seed of [311, 312, 1, 2, 3, 4]) {
    it(`va de la bête à la Tour et ne perd pas de matière (graine ${seed})`, () => {
      const { g, trap } = buildChain(seed);
      let caught = 0;
      let ticks = 0;
      const limit = 20 * 60 * 60;
      while (g.quota < 4 && ticks < limit) {
        g.step();
        ticks++;
        for (const ev of g.events) if (ev.type === 'catch' || ev.type === 'kill') caught++;
        g.events.length = 0;
      }
      console.log(`graine ${seed} : ${ticks} pas (${(ticks / 60).toFixed(1)} s de jeu), `
        + `${caught} bêtes prises, ${trap.done} prises par le Piège`);
      expect(g.quota, `graine ${seed} bloquée à ${ticks} pas`).toBe(4);
      expect(ticks).toBeLessThan(limit);
      expect(trap.done).toBe(caught);
      expect(g.ledger(I.cuir) + g.ledger(I.peau)).toBeCloseTo(caught, 6);
      expect(g.ledger(I.graisse)).toBeCloseTo(caught, 6);
      expect(g.ledger(I.os)).toBeCloseTo(caught, 6);
    }, 240_000);
  }

  for (const seed of [311, 312]) {
    it(`ne dit jamais NoBeast quand une bête est à portée (graine ${seed})`, () => {
      const { g, trap } = buildChain(seed);
      const limit = 10 * 60 * 60;
      let ticks = 0;
      while (ticks < limit) {
        g.step();
        ticks++;
        if (ticks % 30 !== 0) continue;
        const near = g.beasts.some((b) => Math.hypot(b.x - trap.cx, b.y - trap.cy) <= TRAP_RANGE);
        if (!near) continue;
        expect(trap.status, `graine ${seed}, pas ${ticks}`).not.toBe(Status.NoBeast);
      }
    }, 120_000);
  }

  it('rechargée au milieu de la chaîne, la partie suit exactement la même voie', () => {
    const straight = buildChain(312).g;
    run(straight, 2400);
    const resumed = deserialize(structuredClone(serialize(straight)));
    let ticks = 0;
    const limit = 20 * 60 * 60;
    while (straight.quota < 4 && ticks < limit) {
      straight.step();
      resumed.step();
      ticks++;
    }
    expect(straight.quota, `rechargée bloquée à ${ticks} pas`).toBe(4);
    expect(ticks).toBeLessThan(limit);
    expect(resumed.quota).toBe(4);
    expect(serialize(resumed)).toEqual(serialize(straight));
  }, 240_000);
});
