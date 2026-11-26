import { describe, it, expect } from 'vitest';
import { Game } from '../src/sim/game';
import { I, R, SPACING, TILE_U, BELT_SPEED, UPS, B, BUILDINGS, QUOTAS, RECIPES, LOOT_WOOD, TREE_MIN, DAY_TICKS, costOf } from '../src/sim/data';
import { Status, type Ent } from '../src/sim/ent';
import { serialize, deserialize } from '../src/sim/save';

/** Partie de test à l'ère du Bois, stock illimité ; les poses gratuites ignorent le déblocage. */
function sandbox(seed = 7): Game {
  const g = new Game(seed);
  g.stock.fill(1e6);
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
    const before = g.stock[I.pierre];
    for (let i = 0; i < 5; i++) expect(g.paths[0].insertAtStart(I.pierre)).toBe(i === 0);
    run(g, Math.ceil((11 * TILE_U) / BELT_SPEED) + 2);
    expect(g.stock[I.pierre]).toBe(before + 1);
  });

  it('débit maximal : 3 objets par seconde, sans perte aux jonctions', () => {
    const g = sandbox();
    clear(g, -32, -8, -4, 2);
    line(g, -30, 0, 29);
    for (let y = -6; y < 0; y++) g.place('convoyeur', -10, y, 1, { free: true });   // alimentation latérale : coupe le chemin
    run(g, 1);
    expect(g.paths.length).toBe(3);
    const start = g.paths.find((p) => p.tiles[0].x === -30)!;
    const before = g.stock[I.pierre];
    const T = UPS * 30;
    for (let t = 0; t < T; t++) { start.insertAtStart(I.pierre); g.step(); }
    run(g, UPS * 40);                                // à 4 unités par pas, le trajet de 29 cases dure 1 740 pas
    const delivered = g.stock[I.pierre] - before;
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
    for (let t = 0; t < 4000; t++) { if (p.insertAtStart(I.pierre)) inserted++; g.step(); }
    expect(inserted).toBe((10 * TILE_U) / SPACING + 1);   // de 0 à 2400 par pas de 80
    expect(p.count).toBe(inserted);
  });

  it('modifier le tracé conserve les objets en transit', () => {
    const g = sandbox();
    clear(g, 8, 6, 24, 14);
    line(g, 10, 10, 10);
    run(g, 1);
    const p = g.paths[0];
    for (let t = 0; t < 600; t++) { p.insertAtStart(I.pierre); g.step(); }
    const n = g.paths.reduce((s, q) => s + q.count, 0);
    const stock = g.stock[I.pierre];
    g.place('convoyeur', 20, 10, 1, { free: true });   // prolonge avec un virage
    g.place('convoyeur', 15, 9, 1, { free: true });    // alimentation latérale : coupe le chemin
    run(g, 1);
    const n2 = g.paths.reduce((s, q) => s + q.count, 0);
    expect(n2 + (g.stock[I.pierre] - stock)).toBe(n);
    expect(g.paths.length).toBe(3);
  });

  it('un trieur envoie l’élu tout droit et le reste sur les côtés', () => {
    const g = sandbox();
    clear(g, 8, 6, 24, 16);
    line(g, 10, 10, 3);
    g.place('trieur', 13, 10, 0, { free: true, filter: I.brique });
    line(g, 14, 10, 3);                               // tout droit
    for (let y = 11; y < 14; y++) g.place('convoyeur', 13, y, 1, { free: true });  // côté
    run(g, 1);
    const src = g.paths.find((q) => q.tiles[0].x === 10)!;
    for (let t = 0; t < 900; t++) { if (t % 20 === 0) src.insertAtStart(t % 40 === 0 ? I.brique : I.pierre); g.step(); }
    const straight = g.paths.find((q) => q.tiles[0].x === 14)!;
    const side = g.paths.find((q) => q.tiles[0].y === 11)!;
    expect(straight.count).toBeGreaterThan(0);
    expect(side.count).toBeGreaterThan(0);
    for (let i = straight.head; i < straight.types.length; i++) expect(straight.types[i]).toBe(I.brique);
    for (let i = side.head; i < side.types.length; i++) expect(side.types[i]).toBe(I.pierre);
  });

  it('un pont fait passer un flux au-dessus d’un autre', () => {
    const g = sandbox();
    clear(g, 8, 4, 24, 16);
    line(g, 10, 10, 2);
    const bridge = { ...B.convoyeur, key: 'essai', kind: 'bridge' as const };
    g.spawn(bridge, 12, 10, 0);
    const exit = g.spawn(bridge, 15, 10, 0);
    exit.isOut = true;
    line(g, 16, 10, 2);
    for (let y = 6; y < 14; y++) g.place('convoyeur', 13, y, 1, { free: true });   // flux croisé, sous le pont
    run(g, 1);
    expect(g.entAt(15, 10)!.isOut).toBe(true);
    const main = g.paths.find((q) => q.tiles[0].x === 10)!;
    expect(main.tiles.length).toBe(6);
    expect(main.length).toBe(TILE_U * 8);
    expect(g.paths.find((q) => q.tiles[0].x === 13)!.tiles.length).toBe(8);
  });

  it('un entrepôt garde les objets puis les ressort par sa flèche', () => {
    const g = sandbox();
    clear(g, 8, 6, 24, 16);
    line(g, 8, 10, 2);
    g.place('entrepot', 10, 10, 0, { free: true });   // 2×2 : sortie à l'est en (12, 10)
    line(g, 12, 10, 4);
    run(g, 1);
    const src = g.paths.find((q) => q.tiles[0].x === 8)!;
    for (let t = 0; t < 600; t++) { if (t % 30 === 0) src.insertAtStart(I.brique); g.step(); }
    const out = g.paths.find((q) => q.tiles[0].x === 12)!;
    expect(out.count).toBeGreaterThan(0);
    expect(out.types[out.head]).toBe(I.brique);
  });
});

describe('machines', () => {
  it('une Charbonnière cuit 2 bois en 1 charbon, sans courant', () => {
    const g = sandbox();
    clear(g, 8, 8, 16, 14);
    expect(g.place('charbonniere', 10, 10, 0, { free: true }).ok).toBe(true);
    const f = g.entAt(10, 10)!;
    expect(f.recipe).toBe(R.charbon);
    f.buf![I.bois] = 2;
    run(g, 300);
    expect(f.out![I.carbone]).toBe(1);
    expect(f.status).toBe(Status.NoInput);
    expect(f.missing).toBe(I.bois);
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
    expect(belt.path!.types[belt.path!.head]).toBe(I.pierre);
    expect(g.made[I.pierre]).toBe(1);
  });

  it('un puits ne se pose que sur un gisement', () => {
    const g = sandbox();
    clear(g, 50, 50, 60, 60);
    expect(g.place('puits', 52, 52, 0, { free: true }).ok).toBe(false);
  });

  it('quand la demande dépasse la capacité, toute l’usine ralentit ; un brûleur rétablit la cadence', () => {
    const g = sandbox();
    clear(g, 38, 38, 60, 52);
    for (let i = 0; i < 10; i++) {
      const x = 40 + (i % 5) * 3, y = 40 + Math.floor(i / 5) * 3;
      expect(g.place('scierie', x, y, 0, { free: true }).ok).toBe(true);
    }
    for (let i = 0; i < 10; i++) {
      const x = 40 + (i % 5) * 3, y = 40 + Math.floor(i / 5) * 3;
      g.world.setCanopy(x + 2, y, 200);              // un arbre à portée : la Scierie travaille
    }
    run(g, 60);
    expect(g.power.lastDemand).toBe(400);
    expect(g.power.sat).toBeCloseTo(300 / 400, 5);      // la Tour ne fournit que 300 W
    expect(g.place('bruleur', 40, 47, 0, { free: true }).ok).toBe(true);
    g.entAt(40, 47)!.buf![I.bois] = 5;
    run(g, 60);
    expect(g.power.sat).toBeCloseTo(1, 5);
  });

  it('le Brûleur brûle du bois quand les machines manquent de courant', () => {
    const g = sandbox();
    clear(g, 38, 38, 60, 52);
    for (let i = 0; i < 10; i++) g.place('scierie', 40 + (i % 5) * 3, 40 + Math.floor(i / 5) * 3, 0, { free: true });
    for (let i = 0; i < 10; i++) g.world.setCanopy(42 + (i % 5) * 3, 40 + Math.floor(i / 5) * 3, 200);
    g.place('bruleur', 40, 47, 0, { free: true });
    const b = g.entAt(40, 47)!;
    b.buf![I.bois] = 5;
    run(g, 120);
    expect(g.power.sat).toBeCloseTo(1, 5);
    expect(b.buf![I.bois]).toBeLessThan(5);
  });
});

describe('récolte à la main', () => {
  it('déraciner un arbre donne son bois sans compter pour la livraison', () => {
    const g = new Game(4);
    g.world.ensureArea(-60, -60, 60, 60);
    let tx = 0, ty = 0;
    search: for (let y = -60; y <= 60; y++) for (let x = -60; x <= 60; x++) if (g.world.tree(x, y)) { tx = x; ty = y; break search; }
    const size = g.world.canopy(tx, ty);
    expect(size).toBeGreaterThanOrEqual(TREE_MIN);
    const woodBefore = g.ledger(I.bois);
    const wood = g.uproot(tx, ty);
    expect(wood).toBeCloseTo(size / 32, 6);
    expect(g.stock[I.bois]).toBeCloseTo(wood, 6);
    expect(g.delivered[I.bois]).toBe(0);
    expect(g.world.canopy(tx, ty)).toBe(0);
    expect(g.ledger(I.bois)).toBeCloseTo(woodBefore, 6);
    expect(g.events.some((e) => e.type === 'fell')).toBe(true);
  });

  it('piocher la roche et ramasser des débris remplit le stock', () => {
    const g = new Game(4);
    const b = g.world.blobs.find((q) => q.type === 1)!;
    const stone = g.ledger(I.pierre);
    const wood = g.ledger(I.bois);
    expect(g.handMine(b.x, b.y)).toBe(I.pierre);
    expect(g.stock[I.pierre]).toBe(1);
    expect(g.world.scraps.size).toBeGreaterThanOrEqual(6);
    let picked = 0;
    for (let y = -10; y <= 10; y++) for (let x = -10; x <= 10; x++) if (g.world.loot(x, y) && g.pickLoot(x, y)) picked++;
    expect(picked).toBeGreaterThanOrEqual(6);
    expect(g.stock[I.bois]).toBe(picked * LOOT_WOOD);
    expect(g.ledger(I.pierre)).toBeCloseTo(stone, 6);
    expect(g.ledger(I.bois)).toBeCloseTo(wood, 6);
    expect(g.gathered).toBe(picked + 1);
  });

  it('on peut nourrir une machine depuis le stock et vider sa sortie', () => {
    const g = sandbox();
    clear(g, 8, 8, 16, 14);
    g.place('charbonniere', 10, 10, 0, { free: true });
    const e = g.entAt(10, 10)!;
    g.stock[I.bois] = 5; g.stock[I.carbone] = 0;
    expect(g.feed(e)).toBe(4);
    expect(g.stock[I.bois]).toBe(1);
    run(g, 240);
    expect(e.out![I.carbone]).toBe(1);
    expect(g.take(e)).toBe(1);
    expect(g.stock[I.carbone]).toBe(1);
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
  it('les objets se conservent quand on extrait, transporte et démolit', () => {
    const g = sandbox(11);
    g.stock.fill(0);
    g.quota = 5;
    g.world.ensureArea(-60, -60, 60, 60);
    let tx = 0, ty = 0;
    search: for (let y = -60; y <= 60; y++) for (let x = -60; x <= 60; x++) if (g.world.tree(x, y)) { tx = x; ty = y; break search; }
    g.stock[I.bois] = 100; g.stock[I.pierre] = 100;
    const before = [g.ledger(I.bois), g.ledger(I.pierre)];

    let scierie: Ent | null = null;
    search: for (let dy = -3; dy <= 3 && !scierie; dy++) for (let dx = -3; dx <= 3 && !scierie; dx++) {
      const x = tx + dx, y = ty + dy;
      if (!g.canPlace(B.scierie, x, y, 0).ok) continue;
      if (!g.place('scierie', x, y, 0).ok) continue;
      const e = g.entAt(x, y)!;
      let near = 0;
      for (let j = -5; j <= 5; j++) for (let i = -5; i <= 5; i++) if (g.world.tree(Math.floor(e.cx) + i, Math.floor(e.cy) + j)) near++;
      if (near > 0) { scierie = e; break search; }
      g.remove(x, y);
    }
    expect(scierie).not.toBeNull();

    const rock = g.world.blobs.find((q) => q.type === 1)!;
    g.world.ensureArea(rock.x - 8, rock.y - 8, rock.x + 8, rock.y + 8);
    expect(g.place('puits', rock.x - 1, rock.y - 1, 0).ok).toBe(true);
    const puits = g.entAt(rock.x - 1, rock.y - 1)!;

    g.tick = Math.round(DAY_TICKS * 0.75);        // la nuit : aucun arbre ne repousse
    run(g, 600);
    expect(scierie!.done).toBeGreaterThan(0);
    expect(puits.done).toBeGreaterThan(0);
    expect(g.ledger(I.bois)).toBeCloseTo(before[0], 6);
    expect(g.ledger(I.pierre)).toBeCloseTo(before[1], 6);
  });

  it('un arbre coupé repousse à sa place, pas sous une dalle', () => {
    const g = sandbox(3);
    g.world.ensureArea(-90, -90, 90, 90);
    const trees: [number, number][] = [];
    for (let y = -90; y <= 90 && trees.length < 2; y++) for (let x = -90; x <= 90 && trees.length < 2; x++) if (g.world.tree(x, y) && !trees.some(([a, b]) => Math.abs(a - x) < 3 && Math.abs(b - y) < 3)) trees.push([x, y]);
    const [[ax, ay], [bx, by]] = trees;
    g.uproot(ax, ay); g.uproot(bx, by);
    g.place('dalle', bx, by, 0, { free: true });
    run(g, UPS * 240);
    expect(g.world.canopy(ax, ay)).toBeGreaterThan(TREE_MIN);
    expect(g.world.canopy(bx, by)).toBe(0);
  });
});

describe('contenu et progression', () => {
  it('chaque bâtiment constructible est débloqué par une livraison écrite, et chaque recette a sa machine', () => {
    for (const b of BUILDINGS) if (b.cat) expect(b.unlock, b.key).toBeLessThan(QUOTAS.length);
    for (const r of RECIPES) expect(BUILDINGS.some((b) => b.recipes.includes(r)), r.key).toBe(true);
    expect(BUILDINGS.filter((b) => b.cat).length).toBe(14);
  });

  it('le coût de chaque bâtiment est celui de son ère, et les machines à chauffer n’ont pas de courant', () => {
    for (const b of BUILDINGS) {
      expect(b.cost).toEqual(costOf(b, b.era));
      if (b.heat) {
        expect(b.power).toBe(0);
        expect(b.recipes.length).toBeGreaterThan(0);
      }
    }
    expect(B.tour.cost).toEqual([]);
    expect(B.dalle.cost).toEqual([]);
    expect(B.convoyeur.cost).toEqual([[I.bois, 1]]);
  });

  it('livrer 20 bois fait grandir la Tour et débloque la Charbonnière', () => {
    const g = new Game(5);
    expect(g.unlocked(B.charbonniere)).toBe(false);
    for (let i = 0; i < 20; i++) g.accept(g.hub, I.bois, 0);
    run(g, 61);
    expect(g.quota).toBe(1);
    expect(g.hub.level).toBe(1);
    expect(g.unlocked(B.charbonniere)).toBe(true);
  });

  it('le départ est vide', () => {
    const g = new Game(9);
    expect(Array.from(g.stock).every((n) => n === 0)).toBe(true);
    expect(g.quota).toBe(0);
    expect(g.era).toBe(1);
  });

  it('la partie est déterministe, et une sauvegarde la restitue exactement', () => {
    const play = () => {
      const g = sandbox(42);
      clear(g, 4, -8, 30, 8);
      g.place('charbonniere', 10, 0, 0, { free: true });
      g.entAt(10, 0)!.buf![I.bois] = 6;
      for (let x = 12; x <= 20; x++) g.place('convoyeur', x, 0, 0, { free: true });
      g.place('trieur', 21, 0, 0, { free: true, filter: I.carbone });
      for (let x = 22; x <= 25; x++) g.place('convoyeur', x, 0, 0, { free: true });
      g.place('bruleur', 10, 4, 0, { free: true });
      g.entAt(10, 4)!.buf![I.bois] = 4;
      g.place('entrepot', 16, 5, 0, { free: true });
      run(g, 900);
      return g;
    };
    const a = play(), b0 = play();
    expect(serialize(b0)).toEqual(serialize(a));
    const b = deserialize(structuredClone(serialize(a)));
    expect(b.tick).toBe(a.tick);
    expect(b.tickers.length).toBe(a.tickers.length);
    expect(b.belts.length).toBe(a.belts.length);
    expect(Array.from(b.stock)).toEqual(Array.from(a.stock));
    expect(b.paths.reduce((s, p) => s + p.count, 0)).toBe(a.paths.reduce((s, p) => s + p.count, 0));
    expect(b.entAt(21, 0)!.filter).toBe(I.carbone);
    run(a, 600); run(b, 600);
    expect(serialize(b)).toEqual(serialize(a));
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
    // Saturation : 100 cases par chemin à 4 unités par pas demandent 6 000 pas.
    for (let t = 0; t < 6500; t++) { for (const p of g.paths) p.insertAtStart(I.pierre); g.step(); }
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
    for (const [cx, cy] of common) {
      const a = first.world.chunk(cx, cy)!;
      const b = second.world.chunk(cx, cy)!;
      expect(Array.from(b.canopy)).toEqual(Array.from(a.canopy));
    }
  });
});
