import { describe, it, expect } from 'vitest';
import { Game } from '../src/sim/game';
import { serialize, deserialize } from '../src/sim/save';
import { I } from '../src/sim/data';

const run = (g: Game, ticks: number) => { for (let i = 0; i < ticks; i++) g.step(); };

/** Une petite usine en marche, pour avoir de tout dans la sauvegarde. */
function factory(): Game {
  const g = new Game(21);
  g.stock.fill(1000);
  g.quota = 99;
  g.world.ensureArea(0, -12, 40, 12);
  for (let y = -8; y <= 8; y++) for (let x = 5; x <= 30; x++) {
    const c = g.world.at(x, y)!, i = ((y & 31) << 5) | (x & 31);
    c.ground[i] = 0; c.deposit[i] = 0; c.amount[i] = 0;
    g.clearCanopy(x, y, 255);
  }
  g.place('four', 10, 0, 0, { recipe: 'pyrolyse' });
  g.entAt(10, 0)!.buf![I.biomasse] = 2;
  for (let x = 13; x <= 20; x++) g.place('convoyeur', x, 0, 0);
  g.place('aiguillage', 21, 0, 0, { filter: I.carbone });
  for (let x = 22; x <= 25; x++) g.place('convoyeur', x, 0, 0);
  g.place('amphi', 10, 3, 0);
  g.entAt(10, 3)!.buf![I.biomasse] = 4;
  g.place('pont', 16, 3, 0); g.place('pont', 19, 3, 0);
  for (let x = 5; x <= 9; x++) for (let y = -4; y <= 1; y++) g.place('dalle', x, y, 0);
  run(g, 900);
  return g;
}

describe('sauvegarde', () => {
  it('un aller-retour restitue exactement la même partie', () => {
    const a = factory();
    const data = structuredClone(serialize(a));
    const b = deserialize(data);
    expect(b.tick).toBe(a.tick);
    expect(b.tickers.length).toBe(a.tickers.length);
    expect(b.belts.length).toBe(a.belts.length);
    expect(b.slabCount).toBe(a.slabCount);
    for (const el of ['C', 'Fe', 'Ca']) expect(b.ledger(el)).toBeCloseTo(a.ledger(el), 6);
    // les deux parties évoluent ensuite à l'identique : la sauvegarde ne perd rien
    run(a, 600); run(b, 600);
    expect(b.atmo.co2).toBeCloseTo(a.atmo.co2, 6);
    expect(Array.from(b.stock)).toEqual(Array.from(a.stock));
    expect(b.paths.reduce((s, p) => s + p.count, 0)).toBe(a.paths.reduce((s, p) => s + p.count, 0));
    expect(b.entAt(16, 3)!.isOut).toBe(false);
    expect(b.entAt(19, 3)!.isOut).toBe(true);
    expect(b.entAt(21, 0)!.filter).toBe(I.carbone);
  });
});

describe('performance', () => {
  it('une grande usine tient largement dans le budget de 16 ms par pas', () => {
    const g = new Game(8);
    g.stock.fill(1e7);
    g.quota = 99;
    // 200 lignes de 100 convoyeurs chargés + 200 fonderies
    g.world.ensureArea(100, 100, 420, 520);
    for (let row = 0; row < 200; row++) {
      const y = 104 + row * 2;
      for (let x = 110; x < 210; x++) {
        const c = g.world.at(x, y)!, i = ((y & 31) << 5) | (x & 31);
        c.ground[i] = 0; c.canopy[i] = 0;
        g.place('convoyeur', x, y, 0, { free: true });
      }
    }
    run(g, 1);
    expect(g.belts.length).toBe(20000);
    for (let t = 0; t < 1500; t++) { for (const p of g.paths) p.insertAtStart(I.fer); g.step(); }
    const items = g.paths.reduce((s, p) => s + p.count, 0);
    expect(items).toBeGreaterThan(50000);
    const t0 = performance.now();
    run(g, 300);
    const ms = (performance.now() - t0) / 300;
    expect(ms).toBeLessThan(8);
  });
});
