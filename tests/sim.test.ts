import { describe, it, expect } from 'vitest';
import { Game } from '../src/sim/game';
import { I, R, SPACING, TILE_U, BELT_SPEED, UPS, B } from '../src/sim/data';
import { Status } from '../src/sim/ent';

/** Partie de test : tout débloqué, stock illimité. */
function sandbox(seed = 7): Game {
  const g = new Game(seed);
  g.stock.fill(1e6);
  g.quota = 99;
  return g;
}
const run = (g: Game, ticks: number) => { for (let i = 0; i < ticks; i++) g.step(); };
const line = (g: Game, x0: number, y: number, n: number) => {
  for (let i = 0; i < n; i++) expect(g.place('convoyeur', x0 + i, y, 0, { free: true }).ok).toBe(true);
};
/** Aplanit une zone en sol nu (ni eau, ni gisement, ni canopée) pour pouvoir y construire. */
const clear = (g: Game, x0: number, y0: number, x1: number, y1: number) => {
  g.world.ensureArea(x0, y0, x1, y1);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const c = g.world.at(x, y)!, i = ((y & 31) << 5) | (x & 31);
    if (c.ent[i]) continue;
    c.ground[i] = 0; c.deposit[i] = 0; c.amount[i] = 0;
    g.clearCanopy(x, y, 255);
  }
};

describe('convoyeurs', () => {
  it('une ligne droite forme un seul chemin et livre à la Tour', () => {
    const g = sandbox();
    clear(g, -14, -2, -5, 2);
    line(g, -12, 0, 10);                 // finit contre la Tour (qui occupe -1..1)
    g.place('convoyeur', -2, 0, 0, { free: true });
    run(g, 1);
    expect(g.paths.length).toBe(1);
    expect(g.paths[0].tiles.length).toBe(11);
    const before = g.stock[I.fer];
    for (let i = 0; i < 5; i++) expect(g.paths[0].insertAtStart(I.fer)).toBe(i === 0);
    run(g, Math.ceil((11 * TILE_U) / BELT_SPEED) + 2);
    expect(g.stock[I.fer]).toBe(before + 1);
  });

  it('débit maximal : 6 objets par seconde, sans perte aux jonctions', () => {
    const g = sandbox();
    clear(g, -32, -8, -5, 2);
    line(g, -30, 0, 29);
    for (let y = -6; y < 0; y++) g.place('convoyeur', -10, y, 1, { free: true });   // alimentation latérale : coupe le chemin
    run(g, 1);
    expect(g.paths.length).toBe(3);
    const start = g.paths.find((p) => p.tiles[0].x === -30)!;
    const before = g.stock[I.fer];
    const T = UPS * 30;
    for (let t = 0; t < T; t++) { start.insertAtStart(I.fer); g.step(); }
    run(g, UPS * 20);
    const delivered = g.stock[I.fer] - before;
    const ideal = (T * BELT_SPEED) / SPACING;
    expect(delivered).toBeGreaterThan(ideal * 0.98);
    expect(delivered).toBeLessThanOrEqual(ideal + 1);
  });

  it('une file bloquée se compresse à 3 objets par case et ne perd rien', () => {
    const g = sandbox();
    clear(g, 8, 8, 24, 12);
    line(g, 10, 10, 10);                 // cul-de-sac
    run(g, 1);
    const p = g.paths.find((q) => q.tiles[0].x === 10)!;
    let inserted = 0;
    for (let t = 0; t < 4000; t++) { if (p.insertAtStart(I.fer)) inserted++; g.step(); }
    expect(inserted).toBe((10 * TILE_U) / SPACING + 1);   // de 0 à 2400 par pas de 80
    expect(p.count).toBe(inserted);
  });

  it('modifier le tracé conserve les objets en transit', () => {
    const g = sandbox();
    clear(g, 8, 6, 24, 14);
    line(g, 10, 10, 10);
    run(g, 1);
    const p = g.paths[0];
    for (let t = 0; t < 600; t++) { p.insertAtStart(I.fer); g.step(); }
    const n = g.paths.reduce((s, q) => s + q.count, 0);
    const stock = g.stock[I.fer];
    g.place('convoyeur', 20, 10, 1, { free: true });   // prolonge avec un virage
    g.place('convoyeur', 15, 9, 1, { free: true });    // alimentation latérale : coupe le chemin
    run(g, 1);
    const n2 = g.paths.reduce((s, q) => s + q.count, 0);
    expect(n2 + (g.stock[I.fer] - stock)).toBe(n);
    expect(g.paths.length).toBe(3);
  });

  it('un pont fait passer un flux au-dessus d’un autre', () => {
    const g = sandbox();
    clear(g, 8, 4, 24, 16);
    line(g, 10, 10, 2);
    expect(g.place('pont', 12, 10, 0, { free: true }).ok).toBe(true);
    expect(g.place('pont', 15, 10, 0, { free: true }).ok).toBe(true);
    line(g, 16, 10, 2);
    for (let y = 6; y < 14; y++) if (y !== 10) g.place('convoyeur', 13, y, 1, { free: true });
    g.place('convoyeur', 13, 10, 1, { free: true });   // flux croisé, sous le pont
    run(g, 1);
    expect(g.entAt(15, 10)!.isOut).toBe(true);
    const main = g.paths.find((q) => q.tiles[0].x === 10)!;
    expect(main.tiles.length).toBe(6);
    expect(main.length).toBe(TILE_U * 8);
    const cross = g.paths.find((q) => q.tiles[0].x === 13)!;
    expect(cross.tiles.length).toBe(8);
  });

  it('un aiguillage filtré envoie l’élu tout droit et le reste sur les côtés', () => {
    const g = sandbox();
    clear(g, 8, 6, 24, 16);
    line(g, 10, 10, 3);
    g.place('aiguillage', 13, 10, 0, { free: true, filter: I.cuivre });
    line(g, 14, 10, 3);                               // tout droit
    for (let y = 11; y < 14; y++) g.place('convoyeur', 13, y, 1, { free: true });  // côté
    run(g, 1);
    const src = g.paths.find((q) => q.tiles[0].x === 10)!;
    for (let t = 0; t < 900; t++) { if (t % 20 === 0) src.insertAtStart(t % 40 === 0 ? I.cuivre : I.scorie); g.step(); }
    const straight = g.paths.find((q) => q.tiles[0].x === 14)!;
    const side = g.paths.find((q) => q.tiles[0].y === 11)!;
    expect(straight.count).toBeGreaterThan(0);
    expect(side.count).toBeGreaterThan(0);
    for (let i = straight.head; i < straight.types.length; i++) expect(straight.types[i]).toBe(I.cuivre);
    for (let i = side.head; i < side.types.length; i++) expect(side.types[i]).toBe(I.scorie);
  });
});

describe('machines', () => {
  it('une fonderie réduit l’hématite selon la vraie stœchiométrie', () => {
    const g = sandbox();
    clear(g, 8, 8, 16, 14);
    expect(g.place('four', 10, 10, 0, { free: true, recipe: 'reduction' }).ok).toBe(true);
    const f = g.entAt(10, 10)!;
    // relie la fonderie au réseau de la Tour
    for (let x = 5; x < 10; x++) for (let y = 4; y <= 10; y++) { g.clearCanopy(x, y, 255); g.place('dalle', x, y, 0, { free: true }); }
    expect(f.recipe).toBe(R.reduction);
    f.buf![I.hematite] = 2; f.buf![I.carbone] = 3;
    const co2 = g.atmo.emitted;
    run(g, 300);
    expect(f.out![I.fer]).toBe(4);
    expect(g.atmo.emitted - co2).toBe(3);
    expect(f.status).toBe(Status.NoInput);
  });

  it('chaîne complète : puits → convoyeur', () => {
    const g = sandbox();
    const b = g.world.blobs.find((q) => q.type === 1)!;
    g.world.ensureArea(b.x - 8, b.y - 8, b.x + 8, b.y + 8);
    for (let y = b.y - 6; y <= b.y + 6; y++) for (let x = b.x - 6; x <= b.x + 6; x++) g.clearCanopy(x, y, 255);
    expect(g.place('puits', b.x - 1, b.y - 1, 0, { free: true }).ok).toBe(true);
    g.place('convoyeur', b.x + 2, b.y, 0, { free: true });
    // île isolée : on lui donne un amphithéâtre
    g.place('amphi', b.x - 1, b.y + 2, 0, { free: true });
    g.entAt(b.x - 1, b.y + 2)!.buf![I.biomasse] = 4;
    run(g, 600);
    const belt = g.entAt(b.x + 2, b.y)!;
    expect(belt.path!.count).toBeGreaterThan(0);
    expect(belt.path!.types[belt.path!.head]).toBe(I.hematite);
  });

  it('sans courant, rien ne tourne ; un amphithéâtre alimenté rétablit la cadence', () => {
    const g = sandbox();
    clear(g, 38, 38, 60, 50);
    // île de dalles séparée de la Tour : pas d'énergie de base
    for (let i = 0; i < 4; i++) expect(g.place('four', 40 + i * 4, 40, 0, { free: true, recipe: 'pyrolyse' }).ok).toBe(true);
    for (let i = 0; i < 3; i++) g.place('dalle', 43 + i * 4, 40, 0, { free: true });
    const fours = [0, 1, 2, 3].map((i) => g.entAt(40 + i * 4, 40)!);
    for (const f of fours) f.buf![I.biomasse] = 2;
    run(g, 120);
    expect(fours[0].status).toBe(Status.NoPower);
    expect(fours[0].done).toBe(0);
    expect(g.place('amphi', 40, 42, 0, { free: true }).ok).toBe(true);
    const amphi = g.entAt(40, 42)!;
    amphi.buf![I.biomasse] = 5;
    run(g, 400);
    expect(fours[0].region).toBe(amphi.region);
    expect(g.regions[amphi.region].sat).toBeCloseTo(1, 5);
    expect(fours[0].done).toBeGreaterThan(0);
  });
});

describe('lois de conservation', () => {
  it('le carbone, le fer, le calcium, le silicium et le cuivre se conservent sur toute une usine', () => {
    const g = sandbox(11);
    g.stock.fill(0);
    clear(g, 6, 6, 44, 30);
    const mk = (key: string, x: number, y: number, recipe?: string) => {
      expect(g.place(key, x, y, 0, { free: true, recipe }).ok, key).toBe(true);
      return g.entAt(x, y)!;
    };
    const a = mk('four', 10, 10, 'pyrolyse'); a.buf![I.biomasse] = 2;
    const b = mk('four', 10, 12, 'reduction'); b.buf![I.hematite] = 4; b.buf![I.carbone] = 6;
    const c = mk('four', 10, 14, 'calcination'); c.buf![I.calcaire] = 2;
    const d = mk('four', 13, 10, 'fusion_cuivre'); d.buf![I.chalcopyrite] = 4; d.buf![I.quartz] = 4;
    const e = mk('epurateur', 13, 12); e.buf![I.eau] = 4;
    const f = mk('amphi', 13, 14); f.buf![I.biomasse] = 3; f.buf![I.carbone] = 3;
    mk('scierie', 16, 10);
    mk('convoyeur', 18, 10);
    mk('convoyeur', 19, 10);
    run(g, 1);
    const els = ['C', 'Fe', 'Ca', 'Si', 'Cu', 'S'];
    const before = els.map((el) => g.ledger(el));
    run(g, UPS * 120);
    els.forEach((el, i) => expect(g.ledger(el), el).toBeCloseTo(before[i], 3));
    expect(a.done + b.done + c.done + d.done + e.done).toBeGreaterThan(5);
    expect(e.done).toBeGreaterThan(0);   // le SO₂ a bien été capté et transformé
  });

  it('la canopée repousse et fixe du CO₂', () => {
    const g = sandbox(3);
    g.world.ensureArea(60, 60, 90, 90);
    for (let y = 64; y < 80; y++) for (let x = 64; x < 80; x++) if (g.world.ground(x, y) === 0 && !g.world.deposit(x, y)) g.world.setCanopy(x, y, 120);
    const sum = () => { let s = 0; for (let y = 64; y < 80; y++) for (let x = 64; x < 80; x++) s += g.world.canopy(x, y); return s; };
    const c0 = sum(), fixed0 = g.atmo.fixed;
    run(g, UPS * 200);
    expect(sum()).toBeGreaterThan(c0);
    expect(g.atmo.fixed).toBeGreaterThan(fixed0);
  });
});

describe('progression', () => {
  it('livrer le quota fait grandir la Tour et débloque la suite', () => {
    const g = new Game(5);
    expect(g.unlocked(B.four)).toBe(false);
    for (let i = 0; i < 20; i++) g.accept(g.hub, I.hematite, 0);
    run(g, 61);
    expect(g.quota).toBe(1);
    expect(g.hub.level).toBe(1);
    expect(g.unlocked(B.four)).toBe(true);
  });

  it('la partie est déterministe', () => {
    const play = () => {
      const g = sandbox(42);
      clear(g, -14, -2, -5, 2);
      line(g, -12, 0, 10);
      run(g, 2000);
      return [g.atmo.co2, g.ledger('C'), g.world.canopy(20, 20), g.world.canopy(-20, 13)].join('|');
    };
    expect(play()).toBe(play());
  });
});
