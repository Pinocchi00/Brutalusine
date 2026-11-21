import { describe, it, expect } from 'vitest';
import { Game } from '../src/sim/game';
import { I, R, SPACING, TILE_U, BELT_SPEED, UPS, B, BUILDINGS, QUOTAS, RECIPES, LOOT_FER, TREE_MIN } from '../src/sim/data';
import { Status } from '../src/sim/ent';
import { serialize, deserialize } from '../src/sim/save';

/** Partie de test : tout débloqué, stock illimité. */
function sandbox(seed = 7): Game {
  const g = new Game(seed);
  g.stock.fill(1e6);
  g.quota = 99;
  return g;
}
const run = (g: Game, ticks: number) => { for (let i = 0; i < ticks; i++) g.step(); };
/** Aplanit une zone en sol nu (ni eau, ni gisement, ni canopée, ni arbre) pour y construire librement. */
const clear = (g: Game, x0: number, y0: number, x1: number, y1: number) => {
  g.world.ensureArea(x0 - 2, y0 - 2, x1 + 2, y1 + 2);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const c = g.world.at(x, y)!, i = ((y & 31) << 5) | (x & 31);
    if (c.ent[i]) continue;
    c.ground[i] = 0; c.deposit[i] = 0; c.amount[i] = 0; c.canopy[i] = 0; c.cap[i] = 0; c.loot[i] = 0;
  }
};
const line = (g: Game, x0: number, y: number, n: number) => {
  for (let i = 0; i < n; i++) expect(g.place('convoyeur', x0 + i, y, 0, { free: true }).ok).toBe(true);
};

describe('convoyeurs', () => {
  it('une ligne droite forme un seul chemin et livre à la Tour', () => {
    const g = sandbox();
    clear(g, -14, -2, -4, 2);
    line(g, -12, 0, 11);                 // finit contre la Tour (qui occupe -1..1)
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
    clear(g, -32, -8, -4, 2);
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
    for (let y = 6; y < 14; y++) g.place('convoyeur', 13, y, 1, { free: true });   // flux croisé, sous le pont
    run(g, 1);
    expect(g.entAt(15, 10)!.isOut).toBe(true);
    const main = g.paths.find((q) => q.tiles[0].x === 10)!;
    expect(main.tiles.length).toBe(6);
    expect(main.length).toBe(TILE_U * 8);
    expect(g.paths.find((q) => q.tiles[0].x === 13)!.tiles.length).toBe(8);
  });

  it('un trieur envoie l’élu tout droit et le reste sur les côtés', () => {
    const g = sandbox();
    clear(g, 8, 6, 24, 16);
    line(g, 10, 10, 3);
    g.place('trieur', 13, 10, 0, { free: true, filter: I.cuivre });
    line(g, 14, 10, 3);                               // tout droit
    for (let y = 11; y < 14; y++) g.place('convoyeur', 13, y, 1, { free: true });  // côté
    run(g, 1);
    const src = g.paths.find((q) => q.tiles[0].x === 10)!;
    for (let t = 0; t < 900; t++) { if (t % 20 === 0) src.insertAtStart(t % 40 === 0 ? I.cuivre : I.fer); g.step(); }
    const straight = g.paths.find((q) => q.tiles[0].x === 14)!;
    const side = g.paths.find((q) => q.tiles[0].y === 11)!;
    expect(straight.count).toBeGreaterThan(0);
    expect(side.count).toBeGreaterThan(0);
    for (let i = straight.head; i < straight.types.length; i++) expect(straight.types[i]).toBe(I.cuivre);
    for (let i = side.head; i < side.types.length; i++) expect(side.types[i]).toBe(I.fer);
  });

  it('un entrepôt garde les objets puis les ressort par sa flèche', () => {
    const g = sandbox();
    clear(g, 8, 6, 24, 16);
    line(g, 8, 10, 2);
    g.place('entrepot', 10, 10, 0, { free: true });   // 2×2 : sortie à l'est en (12, 10)
    line(g, 12, 10, 4);
    run(g, 1);
    const src = g.paths.find((q) => q.tiles[0].x === 8)!;
    for (let t = 0; t < 600; t++) { if (t % 30 === 0) src.insertAtStart(I.beton); g.step(); }
    const out = g.paths.find((q) => q.tiles[0].x === 12)!;
    expect(out.count).toBeGreaterThan(0);
    expect(out.types[out.head]).toBe(I.beton);
  });
});

describe('machines', () => {
  it('une fonderie fond le minerai dans les vraies proportions', () => {
    const g = sandbox();
    clear(g, 8, 8, 16, 14);
    expect(g.place('fonderie', 10, 10, 0, { free: true }).ok).toBe(true);
    const f = g.entAt(10, 10)!;
    expect(f.recipe).toBe(R.reduction);
    f.buf![I.hematite] = 2; f.buf![I.carbone] = 3;
    const co2 = g.atmo.co2;
    run(g, 300);
    expect(f.out![I.fer]).toBe(4);
    expect(f.status).toBe(Status.NoInput);
    expect(f.missing).toBe(I.hematite);
    expect(g.atmo.co2).toBeGreaterThan(co2);
  });

  it('chaîne complète : puits → convoyeur', () => {
    const g = sandbox();
    const b = g.world.blobs.find((q) => q.type === 1)!;
    g.world.ensureArea(b.x - 8, b.y - 8, b.x + 8, b.y + 8);
    expect(g.place('puits', b.x - 1, b.y - 1, 0, { free: true }).ok).toBe(true);
    g.place('convoyeur', b.x + 2, b.y, 0, { free: true });
    run(g, 600);
    const belt = g.entAt(b.x + 2, b.y)!;
    expect(belt.path!.count).toBeGreaterThan(0);
    expect(belt.path!.types[belt.path!.head]).toBe(I.hematite);
    expect(g.made[I.hematite]).toBe(1);
  });

  it('un puits ne se pose que sur un gisement', () => {
    const g = sandbox();
    clear(g, 50, 50, 60, 60);
    expect(g.place('puits', 52, 52, 0, { free: true }).ok).toBe(false);
  });

  it('quand la demande dépasse la capacité, toute l’usine ralentit ; un brûleur rétablit la cadence', () => {
    const g = sandbox();
    clear(g, 38, 38, 60, 52);
    const fours = [0, 1, 2, 3].map((i) => { expect(g.place('fonderie', 40 + i * 4, 40, 0, { free: true }).ok).toBe(true); return g.entAt(40 + i * 4, 40)!; });
    for (const f of fours) { f.buf![I.hematite] = 4; f.buf![I.carbone] = 6; }
    run(g, 60);
    expect(g.power.lastDemand).toBe(600);
    expect(g.power.sat).toBeCloseTo(0.5, 5);          // la Tour ne fournit que 300 W
    expect(g.place('bruleur', 40, 46, 0, { free: true }).ok).toBe(true);
    g.entAt(40, 46)!.buf![I.bois] = 5;
    run(g, 60);
    expect(g.power.sat).toBeCloseTo(1, 5);
    run(g, 400);
    expect(fours[0].done).toBeGreaterThan(0);
  });

  it('un héliostat produit le jour et rien la nuit', () => {
    const g = sandbox();
    clear(g, -12, -12, 12, 12);
    g.place('heliostat', 8, 8, 0, { free: true });
    run(g, 200);
    expect(g.sun.day).toBe(true);
    expect(g.entAt(8, 8)!.light).toBeGreaterThan(0.2);
    g.tick += Math.round(0.75 * 36000);               // en pleine nuit
    run(g, 60);
    expect(g.sun.day).toBe(false);
    expect(g.entAt(8, 8)!.light).toBe(0);
  });
});

describe('récolte à la main', () => {
  it('déraciner un arbre donne son bois et compte pour le quota', () => {
    const g = new Game(4);
    g.world.ensureArea(-60, -60, 60, 60);
    let tx = 0, ty = 0;
    search: for (let y = -60; y <= 60; y++) for (let x = -60; x <= 60; x++) if (g.world.tree(x, y)) { tx = x; ty = y; break search; }
    const size = g.world.canopy(tx, ty);
    expect(size).toBeGreaterThanOrEqual(TREE_MIN);
    const carbon = g.ledger('C');
    const wood = g.uproot(tx, ty);
    expect(wood).toBeCloseTo(size / 32, 6);
    expect(g.stock[I.bois]).toBeCloseTo(wood, 6);
    expect(g.delivered[I.bois]).toBeCloseTo(wood, 6);
    expect(g.world.canopy(tx, ty)).toBe(0);
    expect(g.ledger('C')).toBeCloseTo(carbon, 6);
    expect(g.events.some((e) => e.type === 'fell')).toBe(true);
  });

  it('piocher un gisement et ramasser des débris remplit le stock', () => {
    const g = new Game(4);
    const b = g.world.blobs[0];
    const fe = g.ledger('Fe');
    expect(g.handMine(b.x, b.y)).toBe(I.hematite);
    expect(g.stock[I.hematite]).toBe(1);
    expect(g.world.scraps.size).toBeGreaterThanOrEqual(6);
    let picked = 0;
    for (let y = -10; y <= 10; y++) for (let x = -10; x <= 10; x++) if (g.world.loot(x, y) && g.pickLoot(x, y)) picked++;
    expect(picked).toBeGreaterThanOrEqual(6);
    expect(g.stock[I.fer]).toBe(40 + picked * LOOT_FER);
    expect(g.ledger('Fe')).toBeCloseTo(fe, 6);
    expect(g.gathered).toBe(picked + 1);
  });

  it('on peut nourrir une machine depuis le stock et vider sa sortie', () => {
    const g = sandbox();
    clear(g, 8, 8, 16, 14);
    g.place('charbonniere', 10, 10, 0, { free: true });
    const e = g.entAt(10, 10)!;
    g.stock[I.bois] = 5; g.stock[I.carbone] = 0;
    expect(g.feed(e)).toBe(2);
    expect(g.stock[I.bois]).toBe(3);
    run(g, 200);
    expect(e.out![I.carbone]).toBe(6);
    expect(g.take(e)).toBe(6);
    expect(g.stock[I.carbone]).toBe(6);
    expect(e.outCount).toBe(0);
  });

  it('poser un bâtiment sur des arbres les déracine', () => {
    const g = sandbox(4);
    g.world.ensureArea(-60, -60, 60, 60);
    let tx = 0, ty = 0;
    search: for (let y = -60; y <= 60; y++) for (let x = -60; x <= 60; x++) {
      if (g.world.tree(x, y) && !g.world.deposit(x + 1, y + 1) && g.world.ground(x + 1, y + 1) === 0 && g.world.ground(x, y + 1) === 0 && g.world.ground(x + 1, y) === 0) { tx = x; ty = y; break search; }
    }
    expect(g.place('charbonniere', tx, ty, 0, { free: true }).ok).toBe(true);
    expect(g.world.canopy(tx, ty)).toBe(0);
    expect(g.world.slab(tx, ty)).toBe(1);
  });
});

describe('lois de conservation', () => {
  it('carbone, fer, calcium, silicium et cuivre se conservent sur toute une usine', () => {
    const g = sandbox(11);
    g.stock.fill(0);
    clear(g, 6, 6, 44, 30);
    const mk = (key: string, x: number, y: number, recipe?: string) => {
      expect(g.place(key, x, y, 0, { free: true, recipe }).ok, key).toBe(true);
      return g.entAt(x, y)!;
    };
    const a = mk('charbonniere', 10, 10); a.buf![I.bois] = 2;
    const b = mk('fonderie', 10, 13); b.buf![I.hematite] = 4; b.buf![I.carbone] = 6;
    const c = mk('four', 10, 17); c.buf![I.calcaire] = 2;
    const d = mk('fonderie', 14, 10, 'cuivre'); d.buf![I.malachite] = 2; d.buf![I.carbone] = 2;
    const f = mk('bruleur', 14, 16); f.buf![I.bois] = 3; f.buf![I.carbone] = 3;
    const h = mk('four_arc', 18, 13); h.buf![I.quartz] = 2; h.buf![I.carbone] = 4;
    const p = mk('presse', 18, 10); p.buf![I.fer] = 4;
    mk('scierie', 24, 10);
    mk('convoyeur', 26, 10);
    mk('convoyeur', 27, 10);
    run(g, 1);
    const els = ['C', 'Fe', 'Ca', 'Si', 'Cu'];
    const before = els.map((el) => g.ledger(el));
    run(g, UPS * 150);
    els.forEach((el, i) => expect(g.ledger(el), el).toBeCloseTo(before[i], 3));
    expect(a.done + b.done + c.done + d.done + h.done + p.done).toBeGreaterThan(6);
    expect(d.out![I.cuivre]).toBeGreaterThan(0);
  });

  it('un arbre coupé repousse à sa place, pas sous une dalle, et le carbone se conserve', () => {
    const g = sandbox(3);
    g.world.ensureArea(-90, -90, 90, 90);
    const trees: [number, number][] = [];
    for (let y = -90; y <= 90 && trees.length < 2; y++) for (let x = -90; x <= 90 && trees.length < 2; x++) if (g.world.tree(x, y) && !trees.some(([a, b]) => Math.abs(a - x) < 3 && Math.abs(b - y) < 3)) trees.push([x, y]);
    const [[ax, ay], [bx, by]] = trees;
    g.uproot(ax, ay); g.uproot(bx, by);
    g.place('dalle', bx, by, 0, { free: true });
    const carbon = g.ledger('C');
    run(g, UPS * 240);
    expect(g.world.canopy(ax, ay)).toBeGreaterThan(TREE_MIN);
    expect(g.world.canopy(bx, by)).toBe(0);
    expect(g.ledger('C')).toBeCloseTo(carbon, 3);
  });
});

describe('contenu et progression', () => {
  it('chaque bâtiment constructible est débloqué par un quota écrit, et chaque recette a sa machine', () => {
    for (const b of BUILDINGS) if (b.cat) expect(b.unlock, b.key).toBeLessThan(QUOTAS.length);
    const combustion = (k: string) => k.startsWith('combustion');
    for (const r of RECIPES) if (!combustion(r.key)) expect(BUILDINGS.some((b) => b.recipes.includes(r)), r.key).toBe(true);
    expect(BUILDINGS.filter((b) => b.cat).length).toBeGreaterThanOrEqual(22);
  });

  it('chaque quota est atteignable, et le coût de chaque bâtiment est payable quand il se débloque', () => {
    const raw = [I.hematite, I.calcaire, I.quartz, I.malachite, I.bois];
    const makeable = (id: number, index: number) => raw.includes(id) || id === I.fer
      || BUILDINGS.some((b) => b.unlock <= index && b.recipes.some((r) => r.unlock <= index && r.outputs.some(([x]) => x === id)));
    QUOTAS.forEach((q, index) => {
      for (const [id] of q.need) expect(makeable(id, index), `quota ${q.title}`).toBe(true);
      for (const s of q.steps) if (s.t === 'build' || s.t === 'tool' || s.t === 'link') expect(B[s.key].unlock, `${q.title} → ${s.key}`).toBeLessThanOrEqual(index);
    });
    for (const b of BUILDINGS) for (const [id] of b.cost) expect(makeable(id, b.unlock), `coût de ${b.key}`).toBe(true);
  });

  it('livrer le quota fait grandir la Tour et débloque la suite', () => {
    const g = new Game(5);
    expect(g.unlocked(B.scierie)).toBe(false);
    for (let i = 0; i < 30; i++) g.accept(g.hub, I.hematite, 0);
    run(g, 61);
    expect(g.quota).toBe(1);
    expect(g.hub.level).toBe(1);
    expect(g.unlocked(B.scierie)).toBe(true);
  });

  it('le départ suffit pour accomplir le premier quota : fer en stock et débris à ramasser', () => {
    const g = new Game(9);
    const b = g.world.blobs[0];
    expect(g.place('puits', b.x - 1, b.y - 1, 0).ok).toBe(true);
    let debris = 0;
    for (let y = -11; y <= 11; y++) for (let x = -11; x <= 11; x++) if (g.world.loot(x, y)) debris++;
    const reach = g.stock[I.fer] + debris * LOOT_FER;
    expect(reach).toBeGreaterThan(Math.abs(b.x) + Math.abs(b.y) + 10);   // assez de fer pour les convoyeurs
  });

  it('la partie est déterministe, et une sauvegarde la restitue exactement', () => {
    const play = () => {
      const g = sandbox(42);
      clear(g, 4, -8, 30, 8);
      g.place('charbonniere', 10, 0, 0, { free: true });
      g.entAt(10, 0)!.buf![I.bois] = 3;
      for (let x = 12; x <= 20; x++) g.place('convoyeur', x, 0, 0, { free: true });
      g.place('trieur', 21, 0, 0, { free: true, filter: I.carbone });
      for (let x = 22; x <= 25; x++) g.place('convoyeur', x, 0, 0, { free: true });
      g.place('bruleur', 10, 4, 0, { free: true });
      g.entAt(10, 4)!.buf![I.bois] = 4;
      g.place('pont', 16, 4, 0, { free: true }); g.place('pont', 19, 4, 0, { free: true });
      run(g, 900);
      return g;
    };
    const a = play(), b0 = play();
    expect(b0.atmo.co2).toBe(a.atmo.co2);
    const b = deserialize(structuredClone(serialize(a)));
    expect(b.tick).toBe(a.tick);
    expect(b.tickers.length).toBe(a.tickers.length);
    expect(b.belts.length).toBe(a.belts.length);
    for (const el of ['C', 'Fe', 'Ca']) expect(b.ledger(el)).toBeCloseTo(a.ledger(el), 6);
    run(a, 600); run(b, 600);
    expect(b.atmo.co2).toBeCloseTo(a.atmo.co2, 6);
    expect(Array.from(b.stock)).toEqual(Array.from(a.stock));
    expect(b.paths.reduce((s, p) => s + p.count, 0)).toBe(a.paths.reduce((s, p) => s + p.count, 0));
    expect(b.entAt(19, 4)!.isOut).toBe(true);
    expect(b.entAt(21, 0)!.filter).toBe(I.carbone);
  });
});

describe('performance', () => {
  it('20 000 convoyeurs chargés de 60 000 objets : moins de 4 ms par pas', () => {
    const g = sandbox(8);
    g.world.ensureArea(100, 100, 220, 520);
    for (let row = 0; row < 200; row++) {
      const y = 104 + row * 2;
      for (let x = 110; x < 210; x++) {
        const c = g.world.at(x, y)!, i = ((y & 31) << 5) | (x & 31);
        c.ground[i] = 0; c.canopy[i] = 0; c.cap[i] = 0; c.deposit[i] = 0; c.ent[i] = 0;
        expect(g.place('convoyeur', x, y, 0, { free: true }).ok).toBe(true);
      }
    }
    run(g, 1);
    expect(g.paths.length).toBe(200);
    for (let t = 0; t < 3300; t++) { for (const p of g.paths) p.insertAtStart(I.fer); g.step(); }   // jusqu'à saturation
    expect(g.paths.reduce((s, p) => s + p.count, 0)).toBeGreaterThan(55000);
    const t0 = performance.now();
    run(g, 300);
    expect((performance.now() - t0) / 300).toBeLessThan(4);
  });
});


describe('repousse des arbres', () => {
  it('la phase de repousse ne dépend pas de l’ordre de génération des blocs', () => {
    const first = new Game(2024);
    const common: [number, number][] = [[-2, -2], [-1, 0], [0, 0], [1, 1]];
    const candidates: [number, number][] = [];
    for (let cy = 2; cy <= 5; cy++) {
      for (let cx = 2; cx <= 5; cx++) candidates.push([cx, cy]);
    }
    let target: [number, number] | null = null;
    for (const [cx, cy] of candidates) {
      const c = first.world.chunk(cx, cy)!;
      if (!target && c.cap.some((v) => v > 0)) target = [cx, cy];
      common.push([cx, cy]);
    }
    expect(target).not.toBeNull();
    const index = first.world.list.findIndex((c) => c.cx === target![0] && c.cy === target![1]);
    // Un décalage de 80 - index fait passer ce bloc d'une visite de plus à une visite de moins en 2 000 pas.
    const extras = 80 - index;
    const second = new Game(2024);
    for (let i = 0; i < extras; i++) {
      const extra = second.world.chunk(40 + (i % 16), 40 + Math.floor(i / 16))!;
      extra.canopy.fill(0);
      extra.cap.fill(0);
    }
    for (const [cx, cy] of common.slice(4)) second.world.chunk(cx, cy);
    for (const g of [first, second]) {
      for (const [cx, cy] of common) {
        const c = g.world.chunk(cx, cy)!;
        for (let i = 0; i < c.cap.length; i++) if (c.cap[i] > 0) c.canopy[i] = 0;
      }
    }
    for (let t = 0; t < 2000; t++) {
      first.step();
      second.step();
    }
    expect(second.atmo.co2).toBe(first.atmo.co2);
    for (const [cx, cy] of common) {
      const a = first.world.chunk(cx, cy)!;
      const b = second.world.chunk(cx, cy)!;
      expect(Array.from(b.canopy)).toEqual(Array.from(a.canopy));
    }
  });
});
