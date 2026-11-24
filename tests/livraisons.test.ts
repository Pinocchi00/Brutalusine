// Les livraisons de la Tour et ce que la démo promet : tout doit être atteignable avec ce qui est débloqué.
import { describe, it, expect } from 'vitest';
import { Game } from '../src/sim/game';
import { B, BUILDINGS, DAY_TICKS, I, ITEMS, LOOT_WOOD, QUOTAS, TREE_MIN } from '../src/sim/data';
import { serialize, deserialize } from '../src/sim/save';
import { GROUND_BANK } from '../src/sim/world';

/** Un objet sort-il déjà d'une recette ou d'un bâtiment débloqué à cet indice de livraison ? */
function producedBy(id: number, index: number): boolean {
  return BUILDINGS.some((b) => {
    if (b.unlock > index) return false;
    if (b.kind === 'sawmill' && id === I.bois) return true;
    if (b.kind === 'clay' && id === I.argile) return true;
    if (b.kind === 'miner' && id === I.pierre) return true;
    return b.recipes.some((r) => r.unlock <= index && r.outputs.some(([x]) => x === id));
  });
}

/** Un objet peut-il être obtenu à la main ou par une machine débloquée ? */
function obtainable(id: number, index: number): boolean {
  if (id === I.bois || id === I.pierre) return true;
  return producedBy(id, index);
}

function sandbox(seed = 7): Game {
  const g = new Game(seed);
  g.stock.fill(1e6);
  g.quota = 5;
  return g;
}
const run = (g: Game, ticks: number) => { for (let i = 0; i < ticks; i++) g.step(); };
const clear = (g: Game, x0: number, y0: number, x1: number, y1: number) => {
  g.world.ensureArea(x0 - 2, y0 - 2, x1 + 2, y1 + 2);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const c = g.world.at(x, y)!, i = ((y & 31) << 5) | (x & 31);
    if (c.ent[i]) continue;
    c.ground[i] = 0; c.deposit[i] = 0; c.amount[i] = 0; c.canopy[i] = 0; c.cap[i] = 0; c.loot[i] = 0;
  }
};
const ids = ITEMS.map((it) => it.id);
const snap = (g: Game) => ids.map((id) => g.ledger(id));
const same = (g: Game, before: number[], what: string) => ids.forEach((id, i) => {
  expect(g.ledger(id), `${what} · ${ITEMS[id].name}`).toBeCloseTo(before[i], 6);
});
function findLoot(g: Game): { x: number; y: number } | null {
  for (let y = -12; y <= 12; y++) for (let x = -12; x <= 12; x++) if (g.world.loot(x, y)) return { x, y };
  return null;
}
function findTree(g: Game): { x: number; y: number } | null {
  g.world.ensureArea(-30, -30, 30, 30);
  for (let y = -30; y <= 30; y++) for (let x = -30; x <= 30; x++) if (g.world.canopy(x, y) >= TREE_MIN) return { x, y };
  return null;
}

describe('les livraisons', () => {
  it('chaque livraison, sauf la chasse à l’étape 8, est atteignable avec ce qui est débloqué', () => {
    QUOTAS.forEach((q, index) => {
      if (index === 3) return;                        // le cuir demandera la chasse, à l'étape 8 du projet
      for (const [id] of q.need) expect(producedBy(id, index), `${q.title} · ${ITEMS[id].name}`).toBe(true);
    });
  });

  it('chaque bâtiment posable coûte des objets déjà obtenables à son déblocage', () => {
    for (const b of BUILDINGS) {
      for (const [id] of b.cost) expect(obtainable(id, b.unlock), `${b.key} · ${ITEMS[id].name}`).toBe(true);
    }
  });

  it('un débris donne 6 bois, déraciner ne compte pas pour la livraison, un tapis qui entre dans la Tour compte', () => {
    const g = new Game(4);
    g.world.ensureArea(-15, -15, 15, 15);
    const loot = findLoot(g);
    expect(loot).not.toBeNull();
    expect(g.pickLoot(loot!.x, loot!.y)).toBe(true);
    expect(g.stock[I.bois]).toBe(LOOT_WOOD);
    expect(g.delivered[I.bois]).toBe(0);
    const tree = findTree(g);
    expect(tree).not.toBeNull();
    expect(g.uproot(tree!.x, tree!.y)).toBeGreaterThan(0);
    expect(g.delivered[I.bois]).toBe(0);
    clear(g, -10, -2, -2, 2);
    for (let x = -8; x <= -2; x++) expect(g.place('convoyeur', x, 0, 0, { free: true }).ok).toBe(true);
    run(g, 1);
    const p = g.entAt(-8, 0)!.path!;
    expect(p.insertAtStart(I.bois)).toBe(true);
    run(g, 600);
    expect(g.delivered[I.bois]).toBe(1);
  });

  it('20 bois entrés dans la Tour accomplissent la première livraison et débloquent la Charbonnière', () => {
    const g = new Game(5);
    for (let i = 0; i < 20; i++) g.accept(g.hub, I.bois, 0);
    run(g, 61);
    expect(g.quota).toBe(1);
    expect(g.hub.level).toBe(1);
    expect(g.unlocked(B.charbonniere)).toBe(true);
  });

  it('la tour de pierre exige la livraison et le stock ; elle retire 60 pierres et ouvre l’ère de la Pierre', () => {
    const stoneOnly = new Game(6);
    stoneOnly.quota = 2;
    stoneOnly.stock[I.pierre] = 60;
    run(stoneOnly, 61);
    expect(stoneOnly.quota).toBe(2);                 // piocher à la main ne suffit pas

    const deliveredOnly = new Game(7);
    deliveredOnly.quota = 2;
    for (let i = 0; i < 60; i++) deliveredOnly.accept(deliveredOnly.hub, I.pierre, 0);
    deliveredOnly.stock[I.pierre] = 59;              // la pierre a été dépensée après livraison
    run(deliveredOnly, 61);
    expect(deliveredOnly.quota).toBe(2);

    const g = new Game(8);
    g.quota = 2;
    for (let i = 0; i < 60; i++) g.accept(g.hub, I.pierre, 0);
    run(g, 61);
    expect(g.quota).toBe(3);
    expect(g.stock[I.pierre]).toBe(0);
    expect(g.era).toBe(2);
  });

  it('une Charbonnière fait 1 charbon avec 2 bois, un Four fait 2 briques avec 2 argiles et 1 charbon', () => {
    const g = sandbox();
    clear(g, 8, 8, 24, 16);
    g.place('charbonniere', 10, 10, 0, { free: true });
    const kiln = g.entAt(10, 10)!;
    kiln.buf![I.bois] = 2;
    run(g, 240);
    expect(kiln.out![I.carbone]).toBe(1);

    g.place('four', 16, 10, 0, { free: true });
    const oven = g.entAt(16, 10)!;
    oven.buf![I.argile] = 2;
    oven.buf![I.carbone] = 1;
    run(g, 300);
    expect(oven.out![I.brique]).toBe(2);
  });

  it('une Argilière refuse une case sans berge, et sort de l’argile sur la berge', () => {
    const g = sandbox();
    clear(g, 50, 50, 60, 60);
    const no = g.place('argiliere', 52, 52, 0, { free: true });
    expect(no.ok).toBe(false);
    expect(no.reason).toBe('À poser sur la berge (la terre humide au bord de l’eau)');

    g.world.ensureArea(-70, -70, 70, 70);
    let spot: { x: number; y: number } | null = null;
    for (let y = -70; y <= 70 && !spot; y++) for (let x = -70; x <= 70 && !spot; x++) {
      if (g.world.ground(x, y) !== GROUND_BANK) continue;
      if (g.canPlace(B.argiliere, x, y, 0, true).ok) spot = { x, y };
    }
    expect(spot).not.toBeNull();
    expect(g.place('argiliere', spot!.x, spot!.y, 0, { free: true }).ok).toBe(true);
    run(g, 140);
    expect(g.entAt(spot!.x, spot!.y)!.out![I.argile]).toBeGreaterThan(0);
  });

  it('un Puits refuse un gisement pas encore exploitable, avec la raison', () => {
    const g = sandbox();
    const b = g.world.blobs.find((q) => q.type === 2)!;
    g.world.ensureArea(b.x - 8, b.y - 8, b.x + 8, b.y + 8);
    const res = g.place('puits', b.x - 1, b.y - 1, 0, { free: true });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('Ce gisement ne s’exploite pas encore');
  });
});

describe('conservation pendant la nuit', () => {
  it('ramasser, déraciner, poser, démolir, transporter, livrer, nourrir et prendre ne perdent rien', () => {
    const g = new Game(11);
    g.quota = 5;
    g.tick = Math.round(DAY_TICKS * 0.75);
    g.stock.fill(0);
    g.world.ensureArea(-20, -20, 40, 40);
    clear(g, 6, 6, 40, 30);
    g.stock[I.bois] = 500;
    g.stock[I.pierre] = 200;
    g.stock[I.argile] = 10;
    g.stock[I.carbone] = 10;

    // L'entrepôt se pose sur des dalles déjà payées : poser puis démolir ne doit rien changer.
    for (let y = 10; y <= 11; y++) for (let x = 10; x <= 11; x++) expect(g.place('dalle', x, y, 0).ok).toBe(true);

    const baseline = snap(g);
    const loot = findLoot(g);
    expect(loot).not.toBeNull();
    g.pickLoot(loot!.x, loot!.y);
    same(g, baseline, 'débris ramassé');

    const tree = findTree(g);
    expect(tree).not.toBeNull();
    g.uproot(tree!.x, tree!.y);
    same(g, baseline, 'arbre déraciné');

    expect(g.place('entrepot', 10, 10, 0).ok).toBe(true);
    same(g, baseline, 'bâtiment posé');
    g.remove(10, 10);
    same(g, baseline, 'bâtiment démoli');

    clear(g, -10, -2, -2, 2);
    for (let x = -8; x <= -2; x++) expect(g.place('convoyeur', x, 0, 0).ok).toBe(true);
    run(g, 1);
    const withBelts = snap(g);
    const p = g.entAt(-8, 0)!.path!;
    for (let k = 0; k < 6; k++) { if (p.insertAtStart(I.bois)) g.stock[I.bois]--; g.step(); }
    run(g, 600);
    same(g, withBelts, 'objets livrés par tapis');

    const oven = g.place('four', 20, 20, 0);
    expect(oven.ok).toBe(true);
    const e = g.entAt(20, 20)!;
    const beforeFeed = snap(g);
    g.feed(e);
    same(g, beforeFeed, 'machine nourrie');

    const store = g.place('entrepot', -8, 10, 0);
    expect(store.ok).toBe(true);
    const st = g.entAt(-8, 10)!;
    const beforeStore = snap(g);
    g.stock[I.bois] -= 2;
    g.accept(st, I.bois, 0);
    g.accept(st, I.bois, 0);
    same(g, beforeStore, 'stockage rempli');
    g.take(st);
    same(g, beforeStore, 'stockage vidé');
  });

  it('accomplir une tour reconstruite ne change aucun bilan', () => {
    const g = new Game(12);
    g.quota = 2;
    g.tick = Math.round(DAY_TICKS * 0.75);
    for (let i = 0; i < 60; i++) g.accept(g.hub, I.pierre, 0);   // la pierre entre par la Tour
    const before = snap(g);
    run(g, 61);
    expect(g.quota).toBe(3);
    same(g, before, 'livraison de pierre');
  });
});

describe('déterminisme', () => {
  it('même graine et mêmes commandes donnent la même sauvegarde, et v3 est refusée', () => {
    const play = () => {
      const g = sandbox(42);
      clear(g, 4, -8, 30, 8);
      g.place('charbonniere', 10, 0, 0, { free: true });
      g.entAt(10, 0)!.buf![I.bois] = 6;
      for (let x = 12; x <= 20; x++) g.place('convoyeur', x, 0, 0, { free: true });
      g.place('trieur', 21, 0, 0, { free: true, filter: I.carbone });
      g.place('bruleur', 10, 4, 0, { free: true });
      g.entAt(10, 4)!.buf![I.bois] = 4;
      run(g, 900);
      return g;
    };
    const a = play(), b = play();
    expect(serialize(b)).toEqual(serialize(a));
    const c = deserialize(structuredClone(serialize(a)));
    run(a, 600);
    run(c, 600);
    expect(serialize(c)).toEqual(serialize(a));
    const old = { ...serialize(a), v: 3 } as unknown as ReturnType<typeof serialize>;
    expect(() => deserialize(old)).toThrow('Sauvegarde d’une ancienne version');
  });
});
