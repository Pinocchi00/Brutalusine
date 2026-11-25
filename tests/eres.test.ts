// Les ères dans la simulation : versions des bâtiments, vitesse, courant, tapis, dalles et sauvegarde.
import { describe, it, expect } from 'vitest';
import { Game } from '../src/sim/game';
import { B, I, ITEMS, TREE_MIN, TILE_U } from '../src/sim/data';
import { Status } from '../src/sim/ent';
import { serialize, deserialize } from '../src/sim/save';
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

/** Le bilan de chaque objet, pour vérifier qu'une opération ne perd rien. */
const snap = (g: Game): number[] => ITEMS.map((it) => g.ledger(it.id));
const same = (g: Game, before: number[], what: string): void => {
  ITEMS.forEach((it, i) => expect(g.ledger(it.id), `${what} · ${it.name}`).toBeCloseTo(before[i], 6));
};

describe('version des bâtiments', () => {
  it('une Scierie neuve paie la version la plus récente possible, sinon la moins chère, sinon refuse', () => {
    const g = new Game(7);
    g.quota = 3;                                   // ère de la Pierre
    g.stock[I.pierre] = 100;
    g.stock[I.bois] = 100;
    clear(g, 8, 8, 20, 20);

    expect(g.place('scierie', 10, 10, 0).ok).toBe(true);
    const fast = g.entAt(10, 10)!;
    expect(fast.era).toBe(2);
    expect(g.stock[I.pierre]).toBe(92);            // 2 × 2 cases × 2 pierres
    expect(g.stock[I.bois]).toBe(100);

    g.stock[I.pierre] = 0;
    expect(g.place('scierie', 14, 10, 0).ok).toBe(true);
    const slow = g.entAt(14, 10)!;
    expect(slow.era).toBe(1);
    expect(g.stock[I.bois]).toBe(92);              // 2 × 2 cases × 2 bois

    g.stock[I.bois] = 0;
    const no = g.place('scierie', 18, 10, 0);
    expect(no.ok).toBe(false);
    expect(no.reason).toBe('Il manque Bois (0/8)');
  });

  it('une pose n’est refusée que si aucune version n’est payable', () => {
    const g = new Game(18);
    g.quota = 3;
    g.stock[I.pierre] = 8;                         // de quoi payer la version 2
    g.stock[I.bois] = 0;                           // mais pas la version 1
    clear(g, 8, 8, 16, 16);
    expect(g.versionFor(B.scierie)).toBe(2);
    expect(g.affordable(B.scierie)).toBe(true);
    const res = g.place('scierie', 10, 10, 0);
    expect(res.ok).toBe(true);
    expect(g.entAt(10, 10)!.era).toBe(2);
    expect(g.stock[I.pierre]).toBe(0);
  });

  it('une Tour en brique ne fabrique pas de version Brique', () => {
    const g = new Game(22);
    g.quota = 6;                                   // ère de la Brique
    g.stock[I.brique] = 100;
    g.stock[I.pierre] = 100;
    clear(g, 8, 8, 16, 16);
    expect(g.era).toBe(3);
    expect(g.versionFor(B.scierie)).toBe(2);
    expect(g.place('scierie', 10, 10, 0).ok).toBe(true);
    expect(g.entAt(10, 10)!.era).toBe(2);
    expect(g.stock[I.pierre]).toBe(92);            // 8 pierres pour la version 2
    expect(g.stock[I.brique]).toBe(100);           // aucune brique dépensée
  });

  it('la vitesse de l’ère raccourcit le cycle d’une Charbonnière', () => {
    const fast = new Game(8);
    fast.quota = 3;
    fast.stock[I.pierre] = 100;
    fast.stock[I.bois] = 100;
    clear(fast, 8, 8, 16, 14);
    expect(fast.place('charbonniere', 10, 10, 0).ok).toBe(true);
    const a = fast.entAt(10, 10)!;
    expect(a.era).toBe(2);
    a.buf![I.bois] = 2;
    run(fast, 171);                                // 171 × 1,4 = 239,4 pas
    expect(a.out![I.carbone]).toBe(0);
    run(fast, 1);                                  // 172 × 1,4 = 240,8 : le cycle est fini
    expect(a.out![I.carbone]).toBe(1);

    const slow = new Game(8);
    slow.quota = 2;                                // encore l'ère du Bois, mais la Charbonnière est débloquée
    slow.stock[I.bois] = 100;
    clear(slow, 8, 8, 16, 14);
    expect(slow.place('charbonniere', 10, 10, 0).ok).toBe(true);
    const b = slow.entAt(10, 10)!;
    expect(b.era).toBe(1);
    b.buf![I.bois] = 2;
    run(slow, 239);
    expect(b.out![I.carbone]).toBe(0);
    run(slow, 1);
    expect(b.out![I.carbone]).toBe(1);
  });

  it('le courant suit l’ère ; une machine qui chauffe n’en demande pas', () => {
    const g = new Game(9);
    g.quota = 3;
    clear(g, 8, 8, 24, 20);
    const saw = g.spawn(B.scierie, 10, 10, 0, 2);
    g.world.setCanopy(12, 10, 200);                // un arbre à portée
    run(g, 60);                                    // la recherche d'arbre n'a lieu qu'une fois par seconde
    expect(g.power.lastDemand).toBe(60);           // 40 W × 1,5

    g.remove(10, 10);
    run(g, 1);
    expect(g.power.lastDemand).toBe(0);

    const kiln = g.spawn(B.charbonniere, 16, 10, 0, 2);
    kiln.buf![I.bois] = 2;
    run(g, 1);
    expect(kiln.working).toBe(true);
    expect(g.power.lastDemand).toBe(0);            // elle chauffe : aucun courant
  });
});

describe('tapis par ère', () => {
  it('un tapis de rondins avance d’une case (240 unités) en 60 pas', () => {
    const g = new Game(10);
    g.stock[I.bois] = 100;
    clear(g, 8, 8, 24, 12);
    for (let x = 10; x <= 12; x++) expect(g.place('convoyeur', x, 10, 0).ok).toBe(true);
    run(g, 1);
    const p = g.entAt(10, 10)!.path!;
    expect(p.era).toBe(1);
    expect(p.speed).toBe(4);
    expect(p.insertAtStart(I.pierre)).toBe(true);
    run(g, 60);
    expect(p.length - p.gaps[p.head]).toBe(TILE_U);
  });

  it('une ligne de deux ères forme deux chemins et laisse tout passer', () => {
    const g = new Game(11);
    g.quota = 3;
    g.stock[I.bois] = 100;
    clear(g, -12, -4, -2, 4);
    g.stock[I.cuir] = 0;
    for (let x = -7; x <= -5; x++) expect(g.place('convoyeur', x, 0, 0).ok).toBe(true);
    g.stock[I.cuir] = 10;
    for (let x = -4; x <= -2; x++) expect(g.place('convoyeur', x, 0, 0).ok).toBe(true);
    run(g, 1);
    expect(g.paths.length).toBe(2);
    expect(g.paths.map((p) => p.era).sort((a, b) => a - b)).toEqual([1, 2]);

    const start = g.paths.find((p) => p.tiles[0].x === -7)!;
    const before = g.delivered[I.pierre];
    let inserted = 0;
    for (let t = 0; t < 1200 && inserted < 10; t++) {
      if (t % 20 === 0 && start.insertAtStart(I.pierre)) inserted++;
      g.step();
    }
    expect(inserted).toBe(10);
    run(g, 1200);
    expect(g.delivered[I.pierre] - before).toBe(10);
    expect(g.paths.reduce((s, p) => s + p.count, 0)).toBe(0);
  });

  it('un pont dont l’entrée est en version 1 et la sortie en version 2 laisse tout passer', () => {
    const g = new Game(23);
    clear(g, -12, -4, -2, 4);
    const bridge = { ...B.convoyeur, key: 'essai', kind: 'bridge' as const };
    const entry = g.spawn(bridge, -8, 0, 0, 1);
    const exit = g.spawn(bridge, -5, 0, 0, 2);
    exit.isOut = true;
    for (let x = -4; x <= -2; x++) g.spawn(B.convoyeur, x, 0, 0, 2);
    run(g, 1);
    expect(entry.path).not.toBe(null);
    expect(entry.era).toBe(1);
    expect(exit.era).toBe(2);

    const start = entry.path!;
    const before = g.delivered[I.pierre];
    let inserted = 0;
    for (let t = 0; t < 1200 && inserted < 10; t++) {
      if (t % 20 === 0 && start.insertAtStart(I.pierre)) inserted++;
      g.step();
    }
    expect(inserted).toBe(10);
    run(g, 1200);
    expect(g.delivered[I.pierre] - before).toBe(10);
    expect(g.paths.reduce((s, p) => s + p.count, 0)).toBe(0);
  });
});

describe('dalles par ère', () => {
  it('une Dalle prend l’ère payable, se compte et se rembourse', () => {
    const g = new Game(12);
    g.quota = 3;
    g.stock[I.pierre] = 10;
    clear(g, 8, 8, 16, 16);
    expect(g.place('dalle', 10, 10, 0).ok).toBe(true);
    expect(g.world.slab(10, 10)).toBe(2);
    expect(g.stock[I.pierre]).toBe(9);

    const info = g.remove(10, 10);
    expect(info?.key).toBe('dalle');
    expect(g.world.slab(10, 10)).toBe(0);
    expect(g.stock[I.pierre]).toBe(10);

    const c = g.world.at(20, 20)!;
    const i = ((20 & 31) << 5) | (20 & 31);
    const before = c.slabCount;
    expect(c.slab[i]).toBe(0);
    g.world.setSlab(20, 20, 1);
    expect(c.slabCount).toBe(before + 1);
    g.world.setSlab(20, 20, 2);                    // une autre ère n'est pas une dalle de plus
    expect(c.slabCount).toBe(before + 1);
    g.world.setSlab(20, 20, 0);
    expect(c.slabCount).toBe(before);
  });

  it('les dalles coulées sous un bâtiment restent d’ère 1 et ne créent pas de matière', () => {
    const g = new Game(19);
    g.quota = 3;
    const b = g.world.blobs.find((q) => q.type === 1)!;
    g.world.ensureArea(b.x - 8, b.y - 8, b.x + 8, b.y + 8);
    for (let y = b.y - 7; y <= b.y + 7; y++) for (let x = b.x - 7; x <= b.x + 7; x++) {
      const c = g.world.at(x, y)!, i = ((y & 31) << 5) | (x & 31);
      if (c.deposit[i]) continue;                  // on garde le gisement, on enlève arbres et débris
      c.canopy[i] = 0; c.cap[i] = 0; c.loot[i] = 0;
    }
    g.stock[I.pierre] = 100;
    g.stock[I.bois] = 100;

    const x0 = b.x - 1, y0 = b.y - 1;
    expect(g.place('puits', x0, y0, 0).ok).toBe(true);
    const well = g.entAt(x0, y0)!;
    expect(well.era).toBe(2);
    expect(g.stock[I.pierre]).toBe(82);            // 3 × 3 cases × 2 pierres
    expect(g.world.slab(x0, y0)).toBe(1);          // la dalle sous le Puits est offerte en Bois
    expect(g.remove(x0, y0)?.key).toBe('puits');
    for (let y = y0; y < y0 + 3; y++) for (let x = x0; x < x0 + 3; x++) expect(g.remove(x, y)?.key).toBe('dalle');
    expect(g.stock[I.pierre]).toBe(100);
    expect(g.stock[I.bois]).toBe(100);
  });
});

describe('trois défauts corrigés', () => {
  it('un Puits épuisé et une Scierie sans arbre ne prennent plus de courant', () => {
    const mine = new Game(13);
    const b = mine.world.blobs.find((q) => q.type === 1)!;
    mine.world.ensureArea(b.x - 8, b.y - 8, b.x + 8, b.y + 8);
    expect(mine.place('puits', b.x - 1, b.y - 1, 0, { free: true }).ok).toBe(true);
    const well = mine.entAt(b.x - 1, b.y - 1)!;
    const cells = well.cells!;
    for (let k = 0; k < cells.length; k += 2) {
      const c = mine.world.at(cells[k], cells[k + 1])!;
      const i = ((cells[k + 1] & 31) << 5) | (cells[k] & 31);
      c.amount[i] = 0; c.deposit[i] = 0;           // le gisement est vidé
    }
    for (let t = 0; t < 300; t++) {
      mine.step();
      expect(well.status).toBe(Status.NoResource);
      expect(mine.power.lastDemand).toBe(0);       // plus de demande de courant
    }

    const saw = new Game(14);
    clear(saw, 30, 30, 50, 50);
    expect(saw.place('scierie', 34, 34, 0, { free: true }).ok).toBe(true);
    const mill = saw.entAt(34, 34)!;
    for (let t = 0; t < 300; t++) {
      saw.step();
      expect(mill.status).toBe(Status.NoResource);
      expect(saw.power.lastDemand).toBe(0);
    }
    saw.world.setCanopy(36, 35, TREE_MIN);         // un arbre repousse à portée
    let cut = false;
    for (let t = 0; t < 300 && !cut; t++) {
      saw.step();
      cut = mill.out![I.bois] > 0;
    }
    expect(cut).toBe(true);
  });

  it('une Scierie entourée de grands arbres coupe dix fois sans attente', () => {
    const g = new Game(21);
    clear(g, 28, 28, 44, 44);
    expect(g.place('scierie', 34, 34, 0, { free: true }).ok).toBe(true);
    const mill = g.entAt(34, 34)!;
    for (let y = 31; y <= 38; y++) for (let x = 31; x <= 38; x++) g.world.setCanopy(x, y, 255);

    let steps = 0;
    while (mill.done < 10 && steps < 1000) {
      g.step();
      steps++;
      expect(mill.status).toBe(Status.Working);
      g.take(mill);
    }
    expect(mill.done).toBe(10);
    expect(steps).toBeLessThan(10 * 90 + 10);
  });

  it('l’Argilière déverse son argile sur un tapis jusqu’à la Tour', () => {
    const g = new Game(15);
    clear(g, -8, -2, -2, 4);
    const c = g.world.at(-4, 0)!;
    const i = ((0 & 31) << 5) | (-4 & 31);
    c.ground[i] = GROUND_BANK;
    c.deposit[i] = 0; c.amount[i] = 0; c.canopy[i] = 0; c.cap[i] = 0; c.loot[i] = 0;

    expect(g.place('argiliere', -5, 0, 0, { free: true }).ok).toBe(true);
    const clay = g.entAt(-5, 0)!;
    expect(clay.era).toBe(2);
    expect(g.place('convoyeur', -3, 0, 0, { free: true }).ok).toBe(true);
    expect(g.place('convoyeur', -2, 0, 0, { free: true }).ok).toBe(true);
    run(g, 1);
    expect(clay.outT.path).not.toBe(null);

    const before = g.stock[I.argile];
    run(g, 300);
    expect(g.stock[I.argile]).toBeGreaterThan(before);
  });
});

describe('sauvegarde et conservation', () => {
  it('une sauvegarde garde l’ère des bâtiments et des dalles, et la partie reste déterministe', () => {
    const play = (): Game => {
      const g = new Game(16);
      g.quota = 3;
      g.stock[I.pierre] = 100;
      g.stock[I.bois] = 100;
      clear(g, 8, 8, 20, 20);
      expect(g.place('scierie', 10, 10, 0).ok).toBe(true);
      expect(g.place('dalle', 14, 14, 0).ok).toBe(true);
      run(g, 30);
      return g;
    };
    const a = play();
    const b = play();
    expect(serialize(b)).toEqual(serialize(a));

    const c = deserialize(structuredClone(serialize(a)));
    expect(c.entAt(10, 10)!.era).toBe(2);
    expect(c.world.slab(14, 14)).toBe(2);
    run(a, 120);
    run(c, 120);
    expect(serialize(c)).toEqual(serialize(a));
  });

  it('une Scierie sans arbre se recharge au même pas, sans état caché', () => {
    const play = (): Game => {
      const g = new Game(20);
      clear(g, 30, 30, 50, 50);
      expect(g.place('scierie', 34, 34, 0, { free: true }).ok).toBe(true);
      run(g, 35);                                  // sauvegarde au milieu d'une seconde
      return g;
    };
    const a = play();
    const c = deserialize(structuredClone(serialize(a)));
    a.world.setCanopy(36, 35, TREE_MIN);           // le même arbre, au même pas
    c.world.setCanopy(36, 35, TREE_MIN);
    run(a, 600);
    run(c, 600);
    expect(serialize(c)).toEqual(serialize(a));
  });

  it('poser puis démolir un bâtiment et une dalle de version 2 ne change aucun ledger', () => {
    const g = new Game(17);
    g.quota = 3;
    g.stock.fill(0);
    g.stock[I.pierre] = 500;
    g.stock[I.bois] = 500;

    const baseline = snap(g);
    expect(g.place('charbonniere', 2, 2, 0).ok).toBe(true);   // sur le socle déjà dallé de la Tour
    expect(g.entAt(2, 2)!.era).toBe(2);
    same(g, baseline, 'bâtiment posé');
    expect(g.remove(2, 2)?.key).toBe('charbonniere');
    same(g, baseline, 'bâtiment démoli');

    expect(g.place('dalle', 5, 0, 0).ok).toBe(true);
    expect(g.world.slab(5, 0)).toBe(2);
    same(g, baseline, 'dalle posée');
    expect(g.remove(5, 0)?.key).toBe('dalle');
    same(g, baseline, 'dalle démolie');
  });
});
