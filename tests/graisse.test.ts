// La graisse : une machine à rouages graissée par un tapis va 1,5 fois plus vite pendant dix cycles.
import { describe, it, expect } from 'vitest';
import { Game } from '../src/sim/game';
import { B, ERA_SPEED, GREASE_BOOST, GREASE_BUF, GREASE_CYCLES, I } from '../src/sim/data';
import { Status, type Ent } from '../src/sim/ent';
import { deserialize, serialize } from '../src/sim/save';
import { GROUND_BANK } from '../src/sim/world';

const run = (g: Game, ticks: number): void => { for (let i = 0; i < ticks; i++) g.step(); };

/** Aplanit une zone en sol nu (ni eau, ni gisement, ni canopée, ni arbre) pour y construire librement. */
function clear(g: Game, x0: number, y0: number, x1: number, y1: number): void {
  g.world.ensureArea(x0 - 2, y0 - 2, x1 + 2, y1 + 2);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const c = g.world.at(x, y)!, i = ((y & 31) << 5) | (x & 31);
    if (c.ent[i]) continue;
    c.ground[i] = 0; c.deposit[i] = 0; c.amount[i] = 0; c.canopy[i] = 0; c.cap[i] = 0; c.loot[i] = 0;
  }
}

/** Une partie à l'ère de la Pierre, avec de quoi bâtir. */
function stoneGame(seed: number): Game {
  const g = new Game(seed);
  g.quota = 3;
  g.stock[I.pierre] = 200;
  g.stock[I.bois] = 100;
  g.stock[I.carbone] = 50;
  return g;
}

/** Pose un tapis d'arbres adultes à portée de la machine (255 : la repousse ne les change pas). */
function plantAround(g: Game, e: Ent): void {
  const cx = Math.floor(e.cx), cy = Math.floor(e.cy);
  for (let j = -5; j <= 5; j++) for (let i = -5; i <= 5; i++) {
    if (i * i + j * j > 27) continue;
    g.world.setCanopy(cx + i, cy + j, 255);
  }
}

/** Compte les pas nécessaires à `target` cycles, avec un plafond qui échoue clairement. */
function cyclesUntil(g: Game, e: Ent, target: number): number {
  const start = e.done;
  let steps = 0;
  while (e.done < start + target && steps < 20000) { g.step(); steps++; }
  expect(e.done, `${e.done - start} cycles seulement en ${steps} pas`).toBe(start + target);
  return steps;
}

/** Une Scierie en version Pierre au milieu des arbres, sa sortie dans un Stockage. */
function sawmillRig(g: Game): Ent {
  const x = 30, y = 30;
  clear(g, x - 3, y - 3, x + 8, y + 6);
  const res = g.place('scierie', x, y, 0, { free: true });
  expect(res.ok, res.reason).toBe(true);
  const mill = g.entAt(x, y)!;
  expect(mill.era).toBe(2);
  const out = g.place('entrepot', x + 2, y, 0, { free: true });
  expect(out.ok, out.reason).toBe(true);
  plantAround(g, mill);
  g.refresh();
  return mill;
}

/** Un Puits en version Pierre sur un gisement, sa sortie dans un Stockage. */
function wellRig(g: Game): Ent {
  const b = g.world.blobs.find((q) => q.type === 1)!;
  g.world.ensureArea(b.x - 6, b.y - 6, b.x + 6, b.y + 6);
  const res = g.place('puits', b.x - 1, b.y - 1, 0, { free: true });
  expect(res.ok, res.reason).toBe(true);
  const well = g.entAt(b.x - 1, b.y - 1)!;
  expect(well.era).toBe(2);
  const out = g.place('entrepot', b.x + 2, b.y, 0, { free: true });
  expect(out.ok, out.reason).toBe(true);
  g.refresh();
  return well;
}

/** Une Argilière en version Pierre sur une berge, sa sortie dans un Stockage. */
function clayRig(g: Game): Ent {
  clear(g, 6, 6, 20, 20);
  const c = g.world.at(12, 12)!, i = ((12 & 31) << 5) | (12 & 31);
  c.ground[i] = GROUND_BANK;
  const res = g.place('argiliere', 11, 11, 0, { free: true });
  expect(res.ok, res.reason).toBe(true);
  const clay = g.entAt(11, 11)!;
  expect(clay.era).toBe(2);
  const out = g.place('entrepot', 13, 11, 0, { free: true });
  expect(out.ok, out.reason).toBe(true);
  g.refresh();
  return clay;
}

/** Une Scierie alimentée en graisse par un tapis depuis un Stockage, sa sortie vidée dans un autre. */
function greaseFeedRig(g: Game): { mill: Ent; store: Ent; out: Ent } {
  clear(g, 4, 6, 24, 16);
  expect(g.place('scierie', 10, 10, 0, { free: true }).ok).toBe(true);
  const mill = g.entAt(10, 10)!;
  expect(g.place('entrepot', 6, 10, 0, { free: true }).ok).toBe(true);
  const store = g.entAt(6, 10)!;
  store.out![I.graisse] = 240;
  store.outCount = 240;
  for (let x = 8; x <= 9; x++) expect(g.place('convoyeur', x, 10, 0, { free: true }).ok).toBe(true);
  expect(g.place('entrepot', 12, 10, 0, { free: true }).ok).toBe(true);
  const out = g.entAt(12, 10)!;
  plantAround(g, mill);
  g.refresh();
  return { mill, store, out };
}

describe('la graisse accélère les machines à rouages', () => {
  it('une Scierie graissée fait 10 cycles 1,5 fois plus vite, puis revient à sa vitesse', () => {
    const plain = stoneGame(401);
    const mill = sawmillRig(plain);
    const slow = cyclesUntil(plain, mill, 10);
    const expected = (10 * 90) / ERA_SPEED[1];
    expect(Math.abs(slow - expected)).toBeLessThanOrEqual(10);

    const greasy = stoneGame(401);
    const boosted = sawmillRig(greasy);
    boosted.buf![I.graisse] = 1;
    const fast = cyclesUntil(greasy, boosted, 10);
    expect(Math.abs(fast - expected / GREASE_BOOST)).toBeLessThanOrEqual(10);
    expect(boosted.buf![I.graisse]).toBe(0);
    expect(boosted.greased).toBe(0);

    const eleventh = cyclesUntil(greasy, boosted, 1);
    expect(eleventh).toBe(Math.ceil(90 / ERA_SPEED[1]));
  });

  it('le Puits et l’Argilière vont aussi 1,5 fois plus vite, à 2 % près', () => {
    const ratio = (make: (g: Game) => Ent): number => {
      const slowGame = stoneGame(402);
      const slow = cyclesUntil(slowGame, make(slowGame), 10);
      const fastGame = stoneGame(402);
      const target = make(fastGame);
      target.buf![I.graisse] = 1;
      const fast = cyclesUntil(fastGame, target, 10);
      return slow / fast;
    };

    const well = ratio(wellRig);
    expect(well).toBeGreaterThan(GREASE_BOOST * 0.98);
    expect(well).toBeLessThan(GREASE_BOOST * 1.02);

    const clay = ratio(clayRig);
    expect(clay).toBeGreaterThan(GREASE_BOOST * 0.98);
    expect(clay).toBeLessThan(GREASE_BOOST * 1.02);
  });
});

describe('recevoir la graisse', () => {
  it('par un tapis : au plus GREASE_BUF en attente et une graisse tous les dix cycles', () => {
    const g = stoneGame(403);
    const { mill, out } = greaseFeedRig(g);
    const cyclesAtTake: number[] = [];
    let blockedBehind = false;

    for (let t = 0; t < 4000 && mill.done < 30; t++) {
      g.step();
      for (const ev of g.events) if (ev.type === 'grease') cyclesAtTake.push(mill.done);
      g.events.length = 0;
      expect(mill.buf![I.graisse]).toBeLessThanOrEqual(GREASE_BUF);
      if (mill.buf![I.graisse] === GREASE_BUF && g.paths.some((p) => p.count > 0)) blockedBehind = true;
      g.take(out);
    }

    expect(mill.done).toBe(30);
    expect(cyclesAtTake.length).toBe(3);
    for (let i = 1; i < cyclesAtTake.length; i++) {
      expect(cyclesAtTake[i] - cyclesAtTake[i - 1]).toBe(GREASE_CYCLES);
    }
    expect(blockedBehind).toBe(true);
  });

  it('une Charbonnière, un Four et une Tannerie la refusent ; le tapis garde l’objet', () => {
    const g = stoneGame(404);
    clear(g, 4, 4, 24, 20);
    const kiln = g.spawn(B.charbonniere, 8, 8, 0, 2);
    const furnace = g.spawn(B.four, 12, 8, 0, 2);
    const tannery = g.spawn(B.tannerie, 16, 8, 0, 2);
    for (const e of [kiln, furnace, tannery]) expect(g.accept(e, I.graisse, 0)).toBe(false);

    expect(g.place('charbonniere', 10, 14, 0, { free: true }).ok).toBe(true);
    const target = g.entAt(10, 14)!;
    expect(g.place('entrepot', 6, 14, 0, { free: true }).ok).toBe(true);
    const store = g.entAt(6, 14)!;
    store.out![I.graisse] = 10;
    store.outCount = 10;
    for (let x = 8; x <= 9; x++) expect(g.place('convoyeur', x, 14, 0, { free: true }).ok).toBe(true);
    g.refresh();

    const before = g.ledger(I.graisse);
    run(g, 300);
    expect(target.buf![I.graisse]).toBe(0);
    expect(g.ledger(I.graisse)).toBeCloseTo(before, 6);
    expect(g.paths.reduce((s, p) => s + p.count, 0)).toBeGreaterThan(0);
  });
});

describe('ne pas gaspiller', () => {
  it('une Scierie bloquée ou sans arbre et un Puits sans courant gardent leur graisse 2 minutes', () => {
    const full = stoneGame(405);
    clear(full, 28, 28, 44, 44);
    expect(full.place('scierie', 34, 34, 0, { free: true }).ok).toBe(true);
    const blocked = full.entAt(34, 34)!;
    blocked.out![I.bois] = 4;
    blocked.outCount = 4;
    blocked.buf![I.graisse] = 2;
    blocked.greased = 5;
    run(full, 2 * 60 * 60);
    expect(blocked.status).toBe(Status.Blocked);
    expect(blocked.buf![I.graisse]).toBe(2);
    expect(blocked.greased).toBe(5);

    const bare = stoneGame(405);
    clear(bare, 28, 28, 44, 44);
    expect(bare.place('scierie', 34, 34, 0, { free: true }).ok).toBe(true);
    const treeless = bare.entAt(34, 34)!;
    treeless.buf![I.graisse] = 2;
    treeless.greased = 5;
    run(bare, 2 * 60 * 60);
    expect(treeless.status).toBe(Status.NoResource);
    expect(treeless.buf![I.graisse]).toBe(2);
    expect(treeless.greased).toBe(5);

    const dark = stoneGame(405);
    const well = wellRig(dark);
    well.buf![I.graisse] = 2;
    well.greased = 5;
    dark.power.base = 0;
    run(dark, 2 * 60 * 60);
    expect(well.status).toBe(Status.NoPower);
    expect(well.buf![I.graisse]).toBe(2);
    expect(well.greased).toBe(5);

    // à l'arrêt et sans graisse en cours, elle n'en prend pas une nouvelle
    const idle = stoneGame(405);
    const well0 = wellRig(idle);
    idle.power.base = 0;
    run(idle, 10);                                       // la coupure prend effet au pas suivant
    expect(well0.status).toBe(Status.NoPower);
    well0.buf![I.graisse] = 2;
    well0.greased = 0;
    run(idle, 2 * 60 * 60);
    expect(well0.status).toBe(Status.NoPower);
    expect(well0.buf![I.graisse]).toBe(2);
    expect(well0.greased).toBe(0);
  });

  it('une Scierie ne prend pas la graisse par sa sortie', () => {
    const g = stoneGame(406);
    clear(g, 28, 28, 44, 44);
    expect(g.place('scierie', 34, 34, 0, { free: true }).ok).toBe(true);   // sortie à l'est
    const e = g.entAt(34, 34)!;
    expect(g.accept(e, I.graisse, 2)).toBe(false);                       // arrive de l'est, par la sortie
    expect(e.buf![I.graisse]).toBe(0);
    expect(g.accept(e, I.graisse, 0)).toBe(true);                        // arrive de l'ouest
    expect(e.buf![I.graisse]).toBe(1);
  });
});

describe('démolition, conservation et sauvegarde', () => {
  it('démolir une Scierie rend les deux graisses de son tampon', () => {
    const g = stoneGame(406);
    clear(g, 28, 28, 44, 44);
    expect(g.place('scierie', 34, 34, 0, { free: true }).ok).toBe(true);
    const mill = g.entAt(34, 34)!;
    mill.buf![I.graisse] = 2;
    const before = g.ledger(I.graisse);
    expect(g.remove(34, 34)).not.toBeNull();
    expect(g.ledger(I.graisse)).toBeCloseTo(before, 6);
    expect(g.stock[I.graisse]).toBeCloseTo(2, 6);
  });

  it('sur dix minutes graissées, le ledger et les graisses brûlées ne perdent rien', () => {
    const g = stoneGame(407);
    const { mill, out } = greaseFeedRig(g);
    const total = g.ledger(I.graisse);
    let burnt = 0;
    const limit = 10 * 60 * 60;

    for (let t = 0; t < limit; t++) {
      g.step();
      for (const ev of g.events) if (ev.type === 'grease') burnt++;
      g.events.length = 0;
      if (t % 60 !== 0) continue;
      plantAround(g, mill);
      g.take(out);
      expect(g.ledger(I.graisse) + burnt).toBeCloseTo(total, 6);
    }
    expect(burnt).toBeGreaterThan(0);
  }, 60_000);

  it('sauvegardée au milieu d’un cycle graissé, la partie reprend exactement pareil', () => {
    const play = (): Game => {
      const g = stoneGame(408);
      const mill = sawmillRig(g);
      mill.buf![I.graisse] = 1;
      run(g, 50);
      return g;
    };

    const a = play();
    const mill = a.entAt(30, 30)!;
    expect(mill.greased).toBeGreaterThan(0);
    expect(mill.greased).toBeLessThan(GREASE_CYCLES);

    const b = deserialize(structuredClone(serialize(a)));
    expect(b.entAt(30, 30)!.greased).toBe(mill.greased);

    run(a, 500);
    run(b, 500);
    expect(serialize(b)).toEqual(serialize(a));
  });
});
