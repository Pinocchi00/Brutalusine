// Les cabiais : troupeaux fixes par la graine, dérive lente, frappe aux poings et reconstitution.
import { describe, it, expect } from 'vitest';
import { Game } from '../src/sim/game';
import { B, I } from '../src/sim/data';
import { CHUNK, GROUND_WATER } from '../src/sim/world';
import { BEAST_HP, RESPAWN_TICKS, SPAWN_MIN_DIST, ZONE_RANGE } from '../src/sim/fauna';
import { SAVE_VERSION, serialize, deserialize, type SaveData } from '../src/sim/save';

const run = (g: Game, ticks: number) => { for (let i = 0; i < ticks; i++) g.step(); };
const runTo = (g: Game, tick: number) => { while (g.tick < tick) g.step(); };
const zoneOf = (g: Game, b: { zone: number }) => g.fauna.zones[b.zone];
const inZone = (g: Game, zone: number) => g.beasts.filter((b) => b.zone === zone);

describe('les troupeaux', () => {
  it('une partie neuve a 2 à 4 bêtes par zone à troupeau, et nulle part ailleurs', () => {
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    for (const seed of seeds) {
      const g = new Game(seed);
      let herds = 0;
      expect(g.fauna.zones.length).toBe((2 * ZONE_RANGE) ** 2);
      g.fauna.zones.forEach((z, index) => {
        const n = inZone(g, index).length;
        if (z.herd) {
          herds++;
          expect(n, `graine ${seed} · zone ${z.cx},${z.cy}`).toBe(z.cap);
          expect(n).toBeGreaterThanOrEqual(2);
          expect(n).toBeLessThanOrEqual(4);
        } else {
          expect(n, `graine ${seed} · zone ${z.cx},${z.cy}`).toBe(0);
        }
      });
      expect(herds, `graine ${seed}`).toBeGreaterThan(0);
      for (const b of g.beasts) {
        expect(Math.hypot(b.x, b.y), `graine ${seed} · bête ${b.id}`).toBeGreaterThanOrEqual(SPAWN_MIN_DIST);
      }
    }
  }, 120_000);

  it('les bêtes ne marchent ni sur l’eau, ni sur un bâtiment, ni sur une dalle', () => {
    const g = new Game(77);
    const z = g.fauna.zones.find((q) => q.herd && q.count > 0)!;
    const footprint = new Set(g.beasts.map((b) => `${Math.floor(b.x)},${Math.floor(b.y)}`));
    let slab: { x: number; y: number } | null = null;
    let belt: { x: number; y: number } | null = null;
    for (let dy = -3; dy <= 3 && (!slab || !belt); dy++) {
      for (let dx = -3; dx <= 3 && (!slab || !belt); dx++) {
        const x = z.ax + dx;
        const y = z.ay + dy;
        if (footprint.has(`${x},${y}`)) continue;
        if (!slab && g.canPlace(B.dalle, x, y, 0, true).ok) slab = { x, y };
        else if (!belt && g.canPlace(B.convoyeur, x, y, 0, true).ok) belt = { x, y };
      }
    }
    if (slab) expect(g.place('dalle', slab.x, slab.y, 0, { free: true }).ok).toBe(true);
    if (belt) expect(g.place('convoyeur', belt.x, belt.y, 0, { free: true }).ok).toBe(true);

    const previous = new Map<number, { x: number; y: number }>();
    let moved = 0;
    const total = 108_000;
    for (let t = 0; t < total; t++) {
      g.step();
      if (g.tick % 60 !== 0) continue;
      for (const b of g.beasts) {
        const tx = Math.floor(b.x);
        const ty = Math.floor(b.y);
        expect(g.world.ground(tx, ty), `eau · bête ${b.id}`).not.toBe(GROUND_WATER);
        expect(g.world.ent(tx, ty), `bâtiment · bête ${b.id}`).toBe(0);
        expect(g.world.slab(tx, ty), `dalle · bête ${b.id}`).toBe(0);
        const old = previous.get(b.id);
        if (old) moved += Math.hypot(b.x - old.x, b.y - old.y);
        previous.set(b.id, { x: b.x, y: b.y });
      }
    }
    expect(moved).toBeGreaterThan(0);
  }, 180_000);

  it('une bête reste près de l’ancre et dans sa zone', () => {
    const g = new Game(78);
    const total = 60_000;
    for (let t = 0; t < total; t++) {
      g.step();
      if (g.tick % 60 !== 0) continue;
      for (const b of g.beasts) {
        const z = zoneOf(g, b);
        expect(Math.hypot(b.x - z.ax, b.y - z.ay), `bête ${b.id}`).toBeLessThanOrEqual(12);
        expect(Math.floor(b.x)).toBeGreaterThanOrEqual(z.cx * CHUNK - 3);
        expect(Math.floor(b.x)).toBeLessThanOrEqual(z.cx * CHUNK + CHUNK + 2);
        expect(Math.floor(b.y)).toBeGreaterThanOrEqual(z.cy * CHUNK - 3);
        expect(Math.floor(b.y)).toBeLessThanOrEqual(z.cy * CHUNK + CHUNK + 2);
      }
    }
  }, 120_000);
});

describe('la chasse aux poings', () => {
  it('trois coups abattent une bête et donnent exactement 1 peau, 1 graisse et 1 os', () => {
    const g = new Game(79);
    const b = g.beasts[0];
    expect(b).toBeDefined();
    expect(b.hp).toBe(BEAST_HP);
    const before = [g.ledger(I.peau), g.ledger(I.graisse), g.ledger(I.os)];

    const near = g.beastAt(b.x, b.y, 2);
    expect(near).not.toBeNull();
    expect(Math.hypot(near!.x - b.x, near!.y - b.y)).toBeLessThan(2);

    const one = g.strikeBeast(b.id);
    expect(one).toMatchObject({ ok: true, killed: false });
    expect(b.hp).toBe(2);
    const two = g.strikeBeast(b.id);
    expect(two).toMatchObject({ ok: true, killed: false });
    expect(b.hp).toBe(1);
    const three = g.strikeBeast(b.id);
    expect(three).toMatchObject({ ok: true, killed: true });
    expect(b.hp).toBe(0);
    expect(g.beasts.some((q) => q.id === b.id)).toBe(false);

    expect(g.stock[I.peau]).toBe(1);
    expect(g.stock[I.graisse]).toBe(1);
    expect(g.stock[I.os]).toBe(1);
    expect(g.ledger(I.peau)).toBe(before[0] + 1);
    expect(g.ledger(I.graisse)).toBe(before[1] + 1);
    expect(g.ledger(I.os)).toBe(before[2] + 1);

    expect(g.strikeBeast(b.id)).toEqual({ ok: false, reason: 'Plus de bête ici', killed: false });
    expect(g.strikeBeast(999_999)).toEqual({ ok: false, reason: 'Plus de bête ici', killed: false });
  });

  it('une zone vidée se repeuple, sans jamais dépasser son plafond', () => {
    const g = new Game(80);
    const z = g.fauna.zones.find((q) => q.herd && q.count > 0)!;
    const zone = g.fauna.zones.indexOf(z);
    const victims = inZone(g, zone).map((b) => b.id);
    expect(victims.length).toBeGreaterThan(0);
    for (const id of victims) {
      for (let k = 0; k < BEAST_HP; k++) expect(g.strikeBeast(id).ok).toBe(true);
    }
    expect(inZone(g, zone).length).toBe(0);

    run(g, RESPAWN_TICKS);
    expect(inZone(g, zone).length).toBeGreaterThanOrEqual(1);
    expect(inZone(g, zone).length).toBeLessThanOrEqual(z.cap);

    for (let t = 0; t < 108_000; t++) {
      g.step();
      if (g.tick % 600 !== 0) continue;
      expect(inZone(g, zone).length).toBeLessThanOrEqual(z.cap);
    }
    expect(inZone(g, zone).length).toBeGreaterThanOrEqual(1);
  }, 180_000);
});

describe('déterminisme et sauvegarde', () => {
  it('même graine et mêmes frappes donnent les mêmes bêtes, sauvegarde comprise', () => {
    const seed = 81;
    const first = new Game(seed);
    const second = new Game(seed);
    runTo(first, 600);
    runTo(second, 600);
    const id = first.beasts[0].id;
    expect(first.strikeBeast(id).ok).toBe(true);
    expect(second.strikeBeast(id).ok).toBe(true);
    runTo(first, 1200);
    runTo(second, 1200);

    const saved = structuredClone(serialize(first));
    runTo(first, 72_000);
    runTo(second, 72_000);
    expect(serialize(second).beasts).toEqual(serialize(first).beasts);

    const reloaded = deserialize(saved);
    runTo(reloaded, 72_000);
    expect(serialize(reloaded).beasts).toEqual(serialize(first).beasts);
    expect(serialize(reloaded).zones).toEqual(serialize(first).zones);
  }, 180_000);

  it('une sauvegarde v4 est refusée, une v5 est la version courante', () => {
    const g = new Game(82);
    const data = serialize(g);
    expect(data.v).toBe(SAVE_VERSION);
    expect(SAVE_VERSION).toBe(5);
    const old = { ...data, v: 4 } as unknown as SaveData;
    expect(() => deserialize(old)).toThrow('Sauvegarde d’une ancienne version');
  });
});

describe('le coût de la faune', () => {
  it('la faune peuplée reste sous trois fois le coût d’une faune vide', () => {
    const populated = new Game(83);
    const empty = new Game(83);
    empty.fauna.beasts = [];
    for (const z of empty.fauna.zones) {
      z.herd = false;
      z.cap = 0;
      z.count = 0;
    }
    const ticks = 36_000;
    const t0 = performance.now();
    run(populated, ticks);
    const filledMs = performance.now() - t0;
    const t1 = performance.now();
    run(empty, ticks);
    const emptyMs = performance.now() - t1;
    console.log(`faune peuplée : ${filledMs.toFixed(1)} ms · faune vide : ${emptyMs.toFixed(1)} ms · `
      + `rapport ${(filledMs / emptyMs).toFixed(2)}`);
    expect(filledMs).toBeLessThan(emptyMs * 3);
  }, 180_000);
});
