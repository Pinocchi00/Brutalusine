import { describe, it, expect } from 'vitest';
import { Game } from '../src/sim/game';
import { I, R, SPACING, TILE_U, BELT_SPEED, UPS, B, BUILDINGS, QUOTAS, RECIPES } from '../src/sim/data';
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
    const e = g.entAt(x, y);
    if (e && e.def.kind === 'tree') { g.trees = g.trees.filter((t) => t !== e); g.ents.delete(e.id); for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) g.world.setEnt(e.x + k, e.y + j, 0); }
    if (c.ent[i]) continue;
    c.ground[i] = 0; c.deposit[i] = 0; c.amount[i] = 0; c.canopy[i] = 0;
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
    for (let t = 0; t < 900; t++) { if (t % 20 === 0) src.insertAtStart(t % 40 === 0 ? I.cuivre : I.scorie); g.step(); }
    const straight = g.paths.find((q) => q.tiles[0].x === 14)!;
    const side = g.paths.find((q) => q.tiles[0].y === 11)!;
    expect(straight.count).toBeGreaterThan(0);
    expect(side.count).toBeGreaterThan(0);
    for (let i = straight.head; i < straight.types.length; i++) expect(straight.types[i]).toBe(I.cuivre);
    for (let i = side.head; i < side.types.length; i++) expect(side.types[i]).toBe(I.scorie);
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
  it('un haut fourneau réduit l’hématite selon la vraie stœchiométrie', () => {
    const g = sandbox();
    clear(g, 8, 8, 16, 14);
    expect(g.place('haut_fourneau', 10, 10, 0, { free: true }).ok).toBe(true);
    const f = g.entAt(10, 10)!;
    expect(f.recipe).toBe(R.reduction);
    f.buf![I.hematite] = 2; f.buf![I.carbone] = 3;
    const co2 = g.atmo.emitted;
    run(g, 300);
    expect(f.out![I.fer]).toBe(4);
    expect(g.atmo.emitted - co2).toBe(3);
    expect(f.status).toBe(Status.NoInput);
    expect(f.missing).toBe(I.hematite);
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

  it('quand la demande dépasse la capacité, toute l’usine ralentit ; un amphithéâtre rétablit la cadence', () => {
    const g = sandbox();
    clear(g, 38, 38, 60, 52);
    const fours = [0, 1, 2, 3].map((i) => { expect(g.place('haut_fourneau', 40 + i * 4, 40, 0, { free: true }).ok).toBe(true); return g.entAt(40 + i * 4, 40)!; });
    for (const f of fours) { f.buf![I.hematite] = 4; f.buf![I.carbone] = 6; }
    run(g, 60);
    expect(g.power.lastDemand).toBe(600);
    expect(g.power.sat).toBeCloseTo(0.5, 5);          // la Tour ne fournit que 300 W
    expect(g.place('amphi', 40, 46, 0, { free: true }).ok).toBe(true);
    g.entAt(40, 46)!.buf![I.biomasse] = 5;
    run(g, 60);
    expect(g.power.sat).toBeCloseTo(1, 5);
    run(g, 400);
    expect(fours[0].done).toBeGreaterThan(0);
  });

  it('un héliostat ne produit rien la nuit ni à l’ombre de la Tour', () => {
    const g = sandbox();
    clear(g, -12, -12, 12, 12);
    // la Tour occupe (-1..1) ; au matin le soleil est à l'est : l'ombre tombe à l'ouest
    g.place('heliostat', -3, 0, 0, { free: true });
    g.place('heliostat', 8, 8, 0, { free: true });
    run(g, 200);
    expect(g.sun.day).toBe(true);
    expect(g.entAt(-3, 0)!.light).toBe(0);
    expect(g.entAt(8, 8)!.light).toBeGreaterThan(0.2);
    g.tick += Math.round(0.75 * 36000);               // en pleine nuit
    run(g, 60);
    expect(g.sun.day).toBe(false);
    expect(g.entAt(8, 8)!.light).toBe(0);
  });
});

describe('lois de conservation', () => {
  it('carbone, fer, calcium, silicium, cuivre et soufre se conservent sur toute une usine', () => {
    const g = sandbox(11);
    g.stock.fill(0);
    clear(g, 6, 6, 44, 30);
    const mk = (key: string, x: number, y: number, recipe?: string) => {
      expect(g.place(key, x, y, 0, { free: true, recipe }).ok, key).toBe(true);
      return g.entAt(x, y)!;
    };
    const a = mk('charbonniere', 10, 10); a.buf![I.biomasse] = 2;
    const b = mk('haut_fourneau', 10, 13); b.buf![I.hematite] = 4; b.buf![I.carbone] = 6;
    const c = mk('four_chaux', 10, 17); c.buf![I.calcaire] = 2;
    const d = mk('fonderie', 14, 10); d.buf![I.chalcopyrite] = 4; d.buf![I.quartz] = 4;
    const e = mk('epurateur', 14, 13); e.buf![I.eau] = 4;
    const f = mk('amphi', 14, 16); f.buf![I.biomasse] = 3; f.buf![I.carbone] = 3;
    const h = mk('serre', 18, 13); h.buf![I.eau] = 10;
    const p = mk('platriere', 18, 10); p.buf![I.calcaire] = 2; p.buf![I.acide] = 2;
    mk('scierie', 24, 10);
    mk('convoyeur', 26, 10);
    mk('convoyeur', 27, 10);
    run(g, 1);
    const els = ['C', 'Fe', 'Ca', 'Si', 'Cu', 'S'];
    const before = els.map((el) => g.ledger(el));
    run(g, UPS * 150);
    els.forEach((el, i) => expect(g.ledger(el), el).toBeCloseTo(before[i], 3));
    expect(a.done + b.done + c.done + d.done + e.done + p.done).toBeGreaterThan(6);
    expect(e.done).toBeGreaterThan(0);   // le SO₂ a bien été capté et transformé
    expect(h.done).toBeGreaterThan(0);   // la serre a fixé du CO₂
  });

  it('la jungle repousse et fixe du CO₂ ; un Semeur l’accélère', () => {
    const g = sandbox(3);
    clear(g, 60, 60, 84, 84);
    for (let y = 60; y <= 84; y++) for (let x = 60; x <= 84; x++) g.world.setCanopy(x, y, 110);
    const sum = () => { let s = 0; for (let y = 60; y <= 84; y++) for (let x = 60; x <= 84; x++) s += g.world.canopy(x, y); return s; };
    const c0 = sum(), fixed0 = g.atmo.fixed, carbon = g.ledger('C');
    run(g, UPS * 120);
    const natural = sum() - c0;
    expect(natural).toBeGreaterThan(0);
    expect(g.atmo.fixed).toBeGreaterThan(fixed0);
    expect(g.ledger('C')).toBeCloseTo(carbon, 3);
    g.place('semeur', 71, 71, 0, { free: true });
    g.entAt(71, 71)!.buf![I.engrais] = 8;
    const c1 = sum();
    run(g, UPS * 120);
    expect(sum() - c1).toBeGreaterThan(natural * 1.5);
  });
});

describe('contenu et progression', () => {
  it('chaque bâtiment constructible est débloqué par un quota écrit, et chaque recette a sa machine', () => {
    for (const b of BUILDINGS) if (b.cat) expect(b.unlock, b.key).toBeLessThan(QUOTAS.length);
    const combustion = (k: string) => k.startsWith('combustion');
    for (const r of RECIPES) if (!combustion(r.key)) expect(BUILDINGS.some((b) => b.recipes.includes(r)), r.key).toBe(true);
    expect(BUILDINGS.filter((b) => b.cat).length).toBeGreaterThanOrEqual(33);
  });

  it('chaque quota est atteignable : ce qu’il demande est produit par des bâtiments déjà débloqués', () => {
    QUOTAS.forEach((q, index) => {
      for (const [id] of q.need) {
        const raw = [I.hematite, I.calcaire, I.quartz, I.chalcopyrite, I.biomasse, I.eau].includes(id);
        const makers = BUILDINGS.filter((b) => b.unlock <= index && b.recipes.some((r) => r.unlock <= index && r.outputs.some(([x]) => x === id)));
        expect(raw || makers.length > 0, `quota ${q.title}`).toBe(true);
      }
      for (const s of q.steps) if (s.t !== 'make') expect(B[s.key].unlock, `${q.title} → ${s.key}`).toBeLessThanOrEqual(index);
    });
  });

  it('livrer le quota fait grandir la Tour, donne un Savoir et débloque la suite', () => {
    const g = new Game(5);
    expect(g.unlocked(B.scierie)).toBe(false);
    for (let i = 0; i < 20; i++) g.accept(g.hub, I.hematite, 0);
    run(g, 61);
    expect(g.quota).toBe(1);
    expect(g.hub.level).toBe(1);
    expect(g.savoir).toBe(1);
    expect(g.unlocked(B.scierie)).toBe(true);
  });

  it('le stock de départ suffit pour accomplir le premier quota', () => {
    const g = new Game(9);
    const b = g.world.blobs[0];
    expect(g.place('puits', b.x - 1, b.y - 1, 0).ok).toBe(true);
    expect(g.stock[I.fer]).toBeGreaterThan(Math.abs(b.x) + Math.abs(b.y) + 10);   // assez de fer pour les convoyeurs
  });

  it('la partie est déterministe, et une sauvegarde la restitue exactement', () => {
    const play = () => {
      const g = sandbox(42);
      clear(g, 4, -8, 30, 8);
      g.place('charbonniere', 10, 0, 0, { free: true });
      g.entAt(10, 0)!.buf![I.biomasse] = 3;
      for (let x = 12; x <= 20; x++) g.place('convoyeur', x, 0, 0, { free: true });
      g.place('trieur', 21, 0, 0, { free: true, filter: I.carbone });
      for (let x = 22; x <= 25; x++) g.place('convoyeur', x, 0, 0, { free: true });
      g.place('amphi', 10, 4, 0, { free: true });
      g.entAt(10, 4)!.buf![I.biomasse] = 4;
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
        c.ground[i] = 0; c.canopy[i] = 0; c.deposit[i] = 0; c.ent[i] = 0;
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
