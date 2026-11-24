// Gestes de construction : le tracé de convoyeur en L et la rotation d'un bâtiment posé.
import { describe, it, expect } from 'vitest';
import { Game } from '../src/sim/game';
import { B, I } from '../src/sim/data';
import { beltRoute } from '../src/sim/route';
import { outputPorts } from '../src/sim/belts';
import { serialize, deserialize } from '../src/sim/save';

function sandbox(seed = 7): Game {
  const g = new Game(seed);
  g.stock.fill(1e6);
  g.quota = 99;
  return g;
}
const run = (g: Game, ticks: number) => { for (let i = 0; i < ticks; i++) g.step(); };
/** Aplanit une zone en sol nu pour y construire librement. */
const clear = (g: Game, x0: number, y0: number, x1: number, y1: number) => {
  g.world.ensureArea(x0 - 2, y0 - 2, x1 + 2, y1 + 2);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const c = g.world.at(x, y)!, i = ((y & 31) << 5) | (x & 31);
    if (c.ent[i]) continue;
    c.ground[i] = 0; c.deposit[i] = 0; c.amount[i] = 0; c.canopy[i] = 0; c.cap[i] = 0; c.loot[i] = 0;
  }
};
const cellsOf = (r: ReturnType<typeof beltRoute>) => r.cells.map((c) => `${c.x},${c.y},${c.dir}`);

describe('tracé de convoyeur en L', () => {
  it('un seul virage : d’abord le long de x, puis de y', () => {
    const g = sandbox();
    clear(g, 10, 10, 20, 20);
    const r = beltRoute(g, 10, 10, 13, 12, true, 0);
    expect(cellsOf(r)).toEqual(['10,10,0', '11,10,0', '12,10,0', '13,10,1', '13,11,1', '13,12,1']);
    expect(r.into).toBe(null);
  });

  it('l’autre coude : d’abord le long de y', () => {
    const g = sandbox();
    clear(g, 10, 10, 20, 20);
    const r = beltRoute(g, 10, 10, 13, 12, false, 0);
    expect(cellsOf(r)).toEqual(['10,10,1', '10,11,1', '10,12,0', '11,12,0', '12,12,0', '13,12,0']);
  });

  it('jamais d’escalier, quelle que soit la diagonale', () => {
    const g = sandbox();
    clear(g, 0, 20, 30, 40);
    const r = beltRoute(g, 2, 22, 20, 37, true, 0);
    let turns = 0;
    for (let i = 1; i < r.cells.length; i++) if (r.cells[i].dir !== r.cells[i - 1].dir) turns++;
    expect(turns).toBe(1);
    expect(r.cells.length).toBe(18 + 15 + 1);
  });

  it('une case seule garde l’orientation choisie', () => {
    const g = sandbox();
    clear(g, 10, 10, 12, 12);
    expect(cellsOf(beltRoute(g, 11, 11, 11, 11, true, 3))).toEqual(['11,11,3']);
  });

  it('s’arrête contre la Tour et s’y déverse', () => {
    const g = sandbox();
    clear(g, -12, -2, -4, 2);
    const r = beltRoute(g, -10, 0, 0, 0, true, 0);   // la Tour occupe -1..1
    expect(r.cells[r.cells.length - 1]).toEqual({ x: -2, y: 0, dir: 0 });
    expect(r.into).toBe('ent');
    for (const c of r.cells) expect(g.place('convoyeur', c.x, c.y, c.dir, { free: true }).ok).toBe(true);
    run(g, 1);
    const p = g.entAt(-10, 0)!.path!;
    expect(p.target.ent).toBe(g.hub);
    p.insertAtStart(I.pierre);
    const before = g.stock[I.pierre];
    run(g, 600);
    expect(g.stock[I.pierre]).toBe(before + 1);
  });

  it('se raccorde au flanc d’un tapis, jamais de face', () => {
    const g = sandbox();
    clear(g, 10, 10, 20, 20);
    for (let y = 10; y <= 14; y++) g.place('convoyeur', 15, y, 1, { free: true });   // un tapis vers le sud
    expect(beltRoute(g, 11, 12, 14, 12, true, 0).into).toBe('belt');
    g.place('convoyeur', 18, 12, 2, { free: true });                                // un tapis vers l'ouest
    expect(beltRoute(g, 16, 12, 17, 12, true, 0).into).toBe(null);                  // il nous fait face
  });
});

describe('le raccord annoncé est celui que la simulation fera', () => {
  it('une Scierie ne prend rien ; un Répartiteur ne prend que par l’arrière', () => {
    const g = sandbox();
    clear(g, 10, 10, 30, 30);
    g.place('scierie', 14, 10, 0, { free: true });                      // 2×2 en (14..15, 10..11)
    expect(beltRoute(g, 10, 10, 13, 10, true, 0).into).toBe(null);
    g.place('aiguillage', 20, 20, 0, { free: true });                   // entrée par l'ouest (il pousse vers l'est)
    expect(beltRoute(g, 16, 20, 19, 20, true, 0).into).toBe('ent');    // par l'arrière
    expect(beltRoute(g, 20, 16, 20, 19, true, 1).into).toBe(null);     // par le flanc nord
  });
});

describe('pivoter un bâtiment posé', () => {
  it('la sortie tourne, gratuitement, et se raccorde au tapis qui l’attend', () => {
    const g = sandbox();
    clear(g, 10, 10, 20, 20);
    expect(g.place('four', 12, 12, 0, { free: true }).ok).toBe(true);           // 2×2, sortie à l'est
    g.place('convoyeur', 11, 12, 2, { free: true });                               // un tapis à l'ouest
    const e = g.entAt(12, 12)!;
    run(g, 1);
    expect(e.outT.path).toBe(null);
    const stock = g.stock.slice();
    const res = g.rotate(12, 12, 2);
    expect(res).toMatchObject({ ok: true, from: 0 });
    run(g, 1);
    expect(e.rot).toBe(2);
    expect(outputPorts(e)[0]).toEqual([11, 12, 2]);
    expect(e.outT.path).not.toBe(null);
    expect(Array.from(g.stock)).toEqual(Array.from(stock));
  });

  it('un quart de tour par défaut ; on revient en arrière avec `to`', () => {
    const g = sandbox();
    clear(g, 10, 10, 20, 20);
    g.place('four', 12, 12, 0, { free: true });
    expect(g.rotate(13, 13).ok).toBe(true);
    expect(g.entAt(12, 12)!.rot).toBe(1);
    expect(g.rotate(12, 12, 0).ok).toBe(true);
    expect(g.entAt(12, 12)!.rot).toBe(0);
  });

  it('un bâtiment non carré change d’emprise, s’il a la place', () => {
    const g = sandbox();
    clear(g, 10, 10, 20, 20);
    const def = { ...B.scierie, key: 'essai', w: 3, h: 2 };   // 3×2, comme l'ancienne Bétonnière
    const e = g.spawn(def, 12, 12, 0);
    expect(g.rotate(12, 12).ok).toBe(true);
    expect([e.w, e.h]).toEqual([2, 3]);
    expect(g.entAt(14, 12)).toBe(null);                  // l'ancienne emprise est libérée
    expect(g.entAt(12, 14)).toBe(e);
    g.place('convoyeur', 14, 12, 0, { free: true });     // bloque le retour à 3×2
    const res = g.rotate(12, 12);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('Pas la place pour pivoter');
    expect(e.rot).toBe(1);
  });

  it('la Tour et le Brûleur ne pivotent pas, avec la raison', () => {
    const g = sandbox();
    clear(g, 10, 10, 20, 20);
    expect(g.rotate(0, 0)).toMatchObject({ ok: false, reason: 'La Tour ne pivote pas' });
    g.place('bruleur', 12, 12, 0, { free: true });
    expect(g.rotate(12, 12)).toMatchObject({ ok: false, reason: 'Brûleur n’a pas de sortie à orienter' });
    expect(g.rotate(19, 19)).toMatchObject({ ok: false, reason: 'Rien à pivoter ici' });
  });

  it('rien ne se perd, et la sauvegarde garde l’orientation', () => {
    const g = sandbox();
    clear(g, 10, 10, 20, 20);
    g.place('entrepot', 12, 12, 0, { free: true });
    const e = g.entAt(12, 12)!;
    g.accept(e, I.bois, 0); g.accept(e, I.bois, 0);
    run(g, 10);
    const wood = g.ledger(I.bois);
    g.rotate(12, 12, 1);
    run(g, 400);
    expect(g.ledger(I.bois)).toBeCloseTo(wood, 6);
    const b = deserialize(JSON.parse(JSON.stringify(serialize(g))));
    expect(b.entAt(12, 12)!.rot).toBe(1);
  });
});
