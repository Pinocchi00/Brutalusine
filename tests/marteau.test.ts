// L'amélioration au marteau : refaire un bâtiment, un convoyeur ou une dalle dans l'ère en cours.
import { describe, it, expect } from 'vitest';
import { Game } from '../src/sim/game';
import { B, I, ITEMS, R } from '../src/sim/data';
import { serialize, deserialize } from '../src/sim/save';

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

/** Le bilan de chaque objet, pour vérifier qu'une opération ne perd rien. */
const snap = (g: Game): number[] => ITEMS.map((it) => g.ledger(it.id));
const same = (g: Game, before: number[], what: string): void => {
  ITEMS.forEach((it, i) => expect(g.ledger(it.id), `${what} · ${it.name}`).toBeCloseTo(before[i], 6));
};

describe('marteau sur un bâtiment', () => {
  it('une Scierie de version 1 passe en 2 : 8 pierres prises, 8 bois rendus, rien d’autre ne change', () => {
    const g = new Game(101);
    g.quota = 3;                                   // ère de la Pierre
    g.stock.fill(0);
    g.stock[I.bois] = 100;
    clear(g, 8, 8, 16, 16);
    expect(g.place('scierie', 10, 10, 0).ok).toBe(true);
    const saw = g.entAt(10, 10)!;
    expect(saw.era).toBe(1);
    expect(g.stock[I.bois]).toBe(92);
    const id = saw.id;

    g.stock[I.pierre] = 100;
    const res = g.upgrade(10, 10);
    expect(res.ok).toBe(true);
    expect(res.from).toBe(1);
    expect(res.to).toBe(2);
    expect(saw.era).toBe(2);
    expect(saw.id).toBe(id);
    expect(saw.x).toBe(10);
    expect(saw.y).toBe(10);
    expect(saw.rot).toBe(0);
    expect(saw.upgraded).toBe(g.tick);
    expect(g.stock[I.pierre]).toBe(92);            // 2 × 2 cases × 2 pierres
    expect(g.stock[I.bois]).toBe(100);             // l'ancienne matière revient

    const last = g.events[g.events.length - 1];
    expect(last.type).toBe('upgrade');
    expect(last.a).toBe(2);
    expect(last.x).toBe(saw.cx);
    expect(last.y).toBe(saw.cy);
  });

  it('une Charbonnière en plein cycle garde tout son état et finit plus tôt', () => {
    const setup = (g: Game): void => {
      clear(g, 8, 8, 16, 16);
      const kiln = g.spawn(B.charbonniere, 10, 10, 0, 1);
      kiln.buf![I.bois] = 3;
      kiln.out![I.carbone] = 2;
      kiln.outCount = 2;
      kiln.progress = 100;
      kiln.working = true;
    };

    const fast = new Game(102);
    fast.quota = 3;
    fast.stock[I.pierre] = 100;
    setup(fast);
    const upgraded = fast.entAt(10, 10)!;
    expect(fast.upgrade(10, 10).ok).toBe(true);
    expect(upgraded.era).toBe(2);
    expect(upgraded.recipe).toBe(R.charbon);
    expect(upgraded.buf![I.bois]).toBe(3);
    expect(upgraded.out![I.carbone]).toBe(2);
    expect(upgraded.outCount).toBe(2);
    expect(upgraded.progress).toBe(100);
    expect(upgraded.working).toBe(true);

    let fastTicks = 0;
    while (upgraded.out![I.carbone] <= 2 && fastTicks < 500) { fast.step(); fastTicks++; }
    expect(upgraded.out![I.carbone]).toBe(3);

    const slow = new Game(102);
    slow.quota = 3;
    setup(slow);
    const plain = slow.entAt(10, 10)!;
    expect(plain.era).toBe(1);
    let slowTicks = 0;
    while (plain.out![I.carbone] <= 2 && slowTicks < 500) { slow.step(); slowTicks++; }
    expect(plain.out![I.carbone]).toBe(3);

    expect(fastTicks).toBeLessThan(slowTicks);
  });
});

describe('marteau sur un convoyeur', () => {
  it('une ligne de 8 convoyeurs chargée de 10 objets garde tout et livre tout', () => {
    const g = new Game(103);
    g.quota = 3;
    g.stock.fill(0);
    g.stock[I.bois] = 500;
    g.stock[I.cuir] = 0;
    clear(g, -12, -3, 0, 3);

    for (let x = -9; x <= -6; x++) expect(g.place('convoyeur', x, 0, 0).ok).toBe(true);   // version 1
    g.stock[I.cuir] = 100;
    for (let x = -5; x <= -2; x++) expect(g.place('convoyeur', x, 0, 0).ok).toBe(true);   // version 2
    run(g, 1);
    expect(g.paths.length).toBe(2);
    expect(g.entAt(-6, 0)!.era).toBe(1);
    expect(g.entAt(-5, 0)!.era).toBe(2);

    const start = g.paths.find((p) => p.tiles[0].x === -9 && p.tiles[0].y === 0)!;
    let inserted = 0;
    for (let t = 0; t < 1200 && inserted < 10; t++) {
      if (t % 20 === 0 && start.insertAtStart(I.pierre)) inserted++;
      g.step();
    }
    expect(inserted).toBe(10);
    const carried = (): number => g.paths.reduce((s, p) => s + p.count, 0);
    expect(carried()).toBe(10);

    g.stock[I.cuir] = 100;
    expect(g.upgrade(-6, 0).ok).toBe(true);
    expect(g.entAt(-6, 0)!.era).toBe(2);
    run(g, 1);                                     // les chemins se refont
    expect(g.paths.length).toBe(2);
    expect(carried()).toBe(10);                    // aucun objet perdu

    const before = g.delivered[I.pierre];
    run(g, 2400);
    expect(g.delivered[I.pierre] - before).toBe(10);
    expect(carried()).toBe(0);
  });
});

describe('marteau sur un réglage et un contenu', () => {
  it('un Trieur garde son filtre et l’objet qu’il tient, un Stockage son contenu', () => {
    const g = new Game(104);
    g.quota = 3;
    g.stock.fill(0);
    g.stock[I.pierre] = 100;
    clear(g, 8, 8, 20, 20);

    const sorter = g.spawn(B.trieur, 10, 10, 0, 1);
    sorter.filter = I.pierre;
    sorter.held = I.bois;
    expect(g.upgrade(10, 10).ok).toBe(true);
    expect(sorter.era).toBe(2);
    expect(sorter.filter).toBe(I.pierre);
    expect(sorter.held).toBe(I.bois);

    const store = g.spawn(B.entrepot, 14, 14, 0, 1);
    store.out![I.bois] = 5;
    store.outCount = 5;
    expect(g.upgrade(14, 14).ok).toBe(true);
    expect(store.era).toBe(2);
    expect(store.out![I.bois]).toBe(5);
    expect(store.outCount).toBe(5);
  });
});

describe('refus du marteau', () => {
  it('donne la raison exacte et ne change rien', () => {
    const g = new Game(105);
    g.quota = 3;
    g.stock.fill(0);
    clear(g, 8, 8, 20, 20);
    const before = Array.from(g.stock);

    const empty = g.upgrade(12, 12);
    expect(empty.ok).toBe(false);
    expect(empty.reason).toBe('Rien à améliorer ici');
    expect(empty.from).toBe(0);
    expect(empty.to).toBe(2);

    const hub = g.upgrade(-1, -1);
    expect(hub.ok).toBe(false);
    expect(hub.reason).toBe('La Tour se refait par ses livraisons');

    const modern = g.spawn(B.scierie, 10, 10, 0, 2);
    const already = g.upgrade(10, 10);
    expect(already.ok).toBe(false);
    expect(already.reason).toBe('Déjà à l’ère Pierre');
    expect(already.from).toBe(2);
    expect(already.to).toBe(2);
    expect(modern.era).toBe(2);
    expect(Array.from(g.stock)).toEqual(before);

    const old = new Game(106);
    old.quota = 0;                                 // ère du Bois
    old.stock.fill(0);
    old.stock[I.bois] = 100;
    clear(old, 8, 8, 16, 16);
    expect(old.place('scierie', 10, 10, 0).ok).toBe(true);
    const ancient = old.entAt(10, 10)!;
    const oldStock = Array.from(old.stock);
    const early = old.upgrade(10, 10);
    expect(early.ok).toBe(false);
    expect(early.reason).toBe('Déjà à l’ère Bois');
    expect(early.from).toBe(1);
    expect(early.to).toBe(1);
    expect(ancient.era).toBe(1);
    expect(Array.from(old.stock)).toEqual(oldStock);

    const poor = new Game(107);
    poor.quota = 3;
    poor.stock.fill(0);
    poor.stock[I.bois] = 100;
    clear(poor, 8, 8, 16, 16);
    expect(poor.place('scierie', 10, 10, 0).ok).toBe(true);
    const broke = poor.entAt(10, 10)!;
    const poorStock = Array.from(poor.stock);
    const missing = poor.upgrade(10, 10);
    expect(missing.ok).toBe(false);
    expect(missing.reason).toBe('Il manque Pierre (0/8)');
    expect(missing.from).toBe(1);
    expect(broke.era).toBe(1);
    expect(Array.from(poor.stock)).toEqual(poorStock);
  });
});

describe('marteau sur une dalle', () => {
  it('une dalle de version 1 passe en 2 pour une pierre, sans changer le compte du bloc', () => {
    const g = new Game(108);
    g.quota = 3;
    g.stock.fill(0);
    clear(g, 18, 18, 22, 22);
    expect(g.place('dalle', 20, 20, 0).ok).toBe(true);   // gratuite en Bois : version 1
    expect(g.world.slab(20, 20)).toBe(1);
    const c = g.world.at(20, 20)!;
    const count = c.slabCount;

    g.stock[I.pierre] = 1;
    const res = g.upgrade(20, 20);
    expect(res.ok).toBe(true);
    expect(res.from).toBe(1);
    expect(res.to).toBe(2);
    expect(g.world.slab(20, 20)).toBe(2);
    expect(g.stock[I.pierre]).toBe(0);
    expect(c.slabCount).toBe(count);

    const info = g.remove(20, 20);
    expect(info?.key).toBe('dalle');
    expect(g.stock[I.pierre]).toBe(1);
  });
});

describe('la version visée', () => {
  it('reste la Pierre une fois la démo finie', () => {
    const g = new Game(109);
    g.quota = 6;                                   // ère de la Brique
    g.stock.fill(0);
    g.stock[I.bois] = 100;
    clear(g, 8, 8, 16, 16);
    expect(g.era).toBe(3);
    expect(g.place('scierie', 10, 10, 0).ok).toBe(true);
    expect(g.entAt(10, 10)!.era).toBe(1);
    g.stock[I.pierre] = 100;
    const res = g.upgrade(10, 10);
    expect(res.to).toBe(2);
    expect(res.ok).toBe(true);
    expect(g.entAt(10, 10)!.era).toBe(2);
  });
});

describe('conservation et sauvegarde', () => {
  it('améliorer une Scierie, un convoyeur chargé et une dalle ne change aucun ledger', () => {
    const g = new Game(110);
    g.quota = 3;
    g.stock.fill(0);
    g.stock[I.bois] = 500;
    g.stock[I.cuir] = 0;
    clear(g, 8, 8, 24, 16);
    expect(g.place('scierie', 10, 10, 0).ok).toBe(true);     // version 1
    expect(g.place('convoyeur', 14, 10, 0).ok).toBe(true);   // version 1
    expect(g.place('dalle', 18, 10, 0).ok).toBe(true);       // version 1
    g.stock[I.pierre] = 50;
    g.stock[I.cuir] = 50;

    g.refresh();
    const belt = g.entAt(14, 10)!;
    expect(belt.era).toBe(1);
    expect(belt.path!.insertAtStart(I.pierre)).toBe(true);

    const before = snap(g);
    g.tick = 28800;                                // la nuit
    expect(g.upgrade(10, 10).ok).toBe(true);       // la Scierie
    same(g, before, 'Scierie améliorée');
    expect(g.upgrade(14, 10).ok).toBe(true);       // le convoyeur chargé
    same(g, before, 'convoyeur amélioré');
    expect(g.upgrade(18, 10).ok).toBe(true);       // la dalle
    same(g, before, 'dalle améliorée');
  });

  it('une sauvegarde après amélioration garde la version, et la partie reste déterministe', () => {
    const play = (): Game => {
      const g = new Game(111);
      g.quota = 3;
      g.stock.fill(0);
      g.stock[I.bois] = 200;
      clear(g, 8, 8, 20, 20);
      expect(g.place('scierie', 10, 10, 0).ok).toBe(true);   // version 1
      g.stock[I.pierre] = 100;
      expect(g.upgrade(10, 10).ok).toBe(true);
      g.stock[I.cuir] = 0;
      expect(g.place('convoyeur', 14, 10, 0).ok).toBe(true); // version 1
      g.stock[I.cuir] = 100;
      expect(g.upgrade(14, 10).ok).toBe(true);
      run(g, 60);
      return g;
    };
    const a = play();
    const b = play();
    expect(serialize(b)).toEqual(serialize(a));

    const c = deserialize(structuredClone(serialize(a)));
    expect(c.entAt(10, 10)!.era).toBe(2);
    expect(c.entAt(14, 10)!.era).toBe(2);
    run(a, 120);
    run(c, 120);
    expect(serialize(c)).toEqual(serialize(a));
  });
});
