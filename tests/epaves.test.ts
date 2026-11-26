// Les noyaux et les épaves : placement par la graine, fouille, occupation et conservation.
import { describe, it, expect } from 'vitest';
import { Game } from '../src/sim/game';
import { B, I, ITEMS, TREE_MIN, needsCore } from '../src/sim/data';
import { GROUND_WATER, CHUNK } from '../src/sim/world';
import { ZONE_RANGE } from '../src/sim/fauna';
import { GUARANTEED_CORES, RARE_MIN_DIST, WRECK_GAP, wreckGap } from '../src/sim/wrecks';
import { serialize, deserialize } from '../src/sim/save';

const run = (g: Game, ticks: number): void => {
  for (let i = 0; i < ticks; i++) g.step();
};
const runTo = (g: Game, tick: number): void => {
  let guard = 0;
  while (g.tick < tick) {
    g.step();
    if (++guard > 1_000_000) throw new Error(`boucle bloquée au pas ${g.tick}`);
  }
};

/** Aplanit une zone en sol nu (ni eau, ni gisement, ni canopée, ni arbre) pour y construire librement. */
function clear(g: Game, x0: number, y0: number, x1: number, y1: number): void {
  g.world.ensureArea(x0 - 2, y0 - 2, x1 + 2, y1 + 2);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const c = g.world.at(x, y)!, i = ((y & 31) << 5) | (x & 31);
    if (c.ent[i]) continue;
    c.ground[i] = 0; c.deposit[i] = 0; c.amount[i] = 0; c.canopy[i] = 0; c.cap[i] = 0; c.loot[i] = 0;
  }
}

const snapshot = (g: Game): number[] => ITEMS.map((it) => g.ledger(it.id));
const same = (g: Game, before: number[], what: string): void => {
  ITEMS.forEach((it, i) => expect(g.ledger(it.id), `${what} · ${it.name}`).toBeCloseTo(before[i], 6));
};

/** Le centre d'une épave, en cases. */
const center = (w: { x: number; y: number }): { x: number; y: number } => ({ x: w.x + 1, y: w.y + 1 });

describe('le placement des épaves', () => {
  it('une épave garantie et des rares, propres, dans le carré de la faune, jamais trop près', () => {
    const seeds = Array.from({ length: 50 }, (_, i) => i + 1);
    let rareTotal = 0;
    for (const seed of seeds) {
      const g = new Game(seed);
      const wrecks = g.wrecks;
      const guaranteed = wrecks.filter((w) => w.cores === GUARANTEED_CORES);
      expect(guaranteed.length, `graine ${seed}`).toBe(1);
      const rare = wrecks.filter((w) => w.cores !== GUARANTEED_CORES);
      rareTotal += rare.length;

      for (const w of wrecks) {
        const c = center(w);
        const dist = Math.hypot(c.x, c.y);
        if (w.cores === GUARANTEED_CORES) {
          expect(dist, `garantie · graine ${seed}`).toBeGreaterThanOrEqual(25);
          expect(dist, `garantie · graine ${seed}`).toBeLessThanOrEqual(40);
        } else {
          expect(dist, `rare · graine ${seed}`).toBeGreaterThanOrEqual(RARE_MIN_DIST);
          expect(w.cores, `rare · graine ${seed}`).toBeGreaterThanOrEqual(1);
          expect(w.cores, `rare · graine ${seed}`).toBeLessThanOrEqual(2);
          const cx = Math.floor(w.x / CHUNK), cy = Math.floor(w.y / CHUNK);
          expect(cx, `rare · graine ${seed}`).toBeGreaterThanOrEqual(-ZONE_RANGE);
          expect(cx, `rare · graine ${seed}`).toBeLessThan(ZONE_RANGE);
          expect(cy, `rare · graine ${seed}`).toBeGreaterThanOrEqual(-ZONE_RANGE);
          expect(cy, `rare · graine ${seed}`).toBeLessThan(ZONE_RANGE);
        }
        expect(w.searched).toBe(false);
        for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
          const x = w.x + i, y = w.y + j;
          expect(g.world.ground(x, y), `eau · graine ${seed}`).not.toBe(GROUND_WATER);
          expect(g.world.canopy(x, y), `arbre · graine ${seed}`).toBeLessThan(TREE_MIN);
          expect(g.world.deposit(x, y), `gisement · graine ${seed}`).toBe(0);
          expect(g.world.loot(x, y), `débris · graine ${seed}`).toBe(0);
        }
      }

      for (let a = 0; a < wrecks.length; a++) for (let b = a + 1; b < wrecks.length; b++) {
        expect(wreckGap(wrecks[a], wrecks[b]), `écart · graine ${seed}`).toBeGreaterThanOrEqual(WRECK_GAP);
      }
    }
    const average = rareTotal / seeds.length;
    console.log(`épaves rares : ${average.toFixed(2)} en moyenne sur ${seeds.length} graines`);
    expect(average).toBeGreaterThanOrEqual(5);
  }, 240_000);

  it('aucun bloc n’est créé après la création de la partie, même après dix minutes', () => {
    const g = new Game(31);
    const chunks = g.world.list.length;
    run(g, 10 * 60 * 60);
    expect(g.world.list.length).toBe(chunks);
  }, 120_000);
});

describe('les noyaux et les machines', () => {
  it('six noyaux au départ, six Scieries, la septième refusée sans rien prendre, puis démolition', () => {
    const g = new Game(32);
    g.stock[I.bois] = 100;
    g.stock[I.noyau] = 6;
    clear(g, 3, 5, 18, 11);

    const spots: [number, number][] = [[4, 6], [7, 6], [10, 6], [13, 6], [16, 6], [4, 9]];
    for (const [x, y] of spots) expect(g.place('scierie', x, y, 0).ok).toBe(true);
    expect(g.stock[I.noyau]).toBe(0);
    expect(g.stock[I.bois]).toBe(100 - 6 * 8);

    const wood = g.stock[I.bois];
    const no = g.place('scierie', 10, 9, 0);
    expect(no.ok).toBe(false);
    expect(no.reason).toBe('Plus de noyau : fouille une épave');
    expect(g.stock[I.bois]).toBe(wood);
    expect(g.stock[I.noyau]).toBe(0);

    expect(g.remove(4, 9)?.key).toBe('scierie');
    expect(g.stock[I.noyau]).toBe(1);
    expect(g.place('scierie', 10, 9, 0).ok).toBe(true);
    expect(g.stock[I.noyau]).toBe(0);
  });

  it('une Tour, un convoyeur, une dalle, un Stockage, un Répartiteur et un Trieur se posent sans noyau', () => {
    const g = new Game(33);
    g.quota = 3;
    g.stock[I.noyau] = 0;
    g.stock[I.pierre] = 1000;
    g.stock[I.bois] = 1000;
    g.stock[I.cuir] = 1000;
    clear(g, 4, 4, 26, 14);

    expect(needsCore(B.tour)).toBe(false);
    expect(needsCore(B.convoyeur)).toBe(false);
    expect(needsCore(B.dalle)).toBe(false);
    expect(needsCore(B.entrepot)).toBe(false);
    expect(needsCore(B.aiguillage)).toBe(false);
    expect(needsCore(B.trieur)).toBe(false);

    expect(g.place('tour', 17, 4, 0).ok).toBe(true);
    expect(g.place('convoyeur', 5, 5, 0).ok).toBe(true);
    expect(g.place('dalle', 6, 8, 0).ok).toBe(true);
    expect(g.place('entrepot', 8, 8, 0).ok).toBe(true);
    expect(g.place('aiguillage', 12, 8, 0).ok).toBe(true);
    expect(g.place('trieur', 14, 8, 0).ok).toBe(true);
    expect(g.stock[I.noyau]).toBe(0);
  });
});

describe('la fouille et l’occupation', () => {
  it('fouiller l’épave garantie rend quatre noyaux sans changer le bilan ; on ne la fouille pas deux fois', () => {
    const g = new Game(34);
    const w = g.wrecks.find((q) => q.cores === GUARANTEED_CORES)!;
    const c = center(w);
    const before = snapshot(g);

    const res = g.searchWreck(w.id);
    expect(res).toEqual({ ok: true, reason: '', cores: GUARANTEED_CORES });
    expect(g.stock[I.noyau]).toBe(6 + GUARANTEED_CORES);
    expect(w.searched).toBe(true);
    expect(w.cores).toBe(0);
    same(g, before, 'épave fouillée');

    const search = g.events.find((e) => e.type === 'search')!;
    expect(search.x).toBe(c.x);
    expect(search.y).toBe(c.y);
    expect(search.a).toBe(GUARANTEED_CORES);

    expect(g.searchWreck(w.id)).toEqual({ ok: false, reason: 'Déjà fouillée : elle est vide', cores: 0 });
    expect(g.searchWreck(999_999)).toEqual({ ok: false, reason: 'Plus d’épave ici', cores: 0 });
    same(g, before, 'refus de fouille');
  });

  it('on ne pose rien sur une épave, et la repousse et les bêtes la laissent tranquille', () => {
    const g = new Game(35);
    g.quota = 3;
    g.stock[I.noyau] = 6;
    g.stock[I.bois] = 1000;
    g.stock[I.pierre] = 1000;

    const w = g.wrecks.find((q) => q.cores === GUARANTEED_CORES)!;
    const store = g.place('entrepot', w.x, w.y, 0);
    expect(store.ok).toBe(false);
    expect(store.reason).toBe('Une épave est là : fouille-la');
    const slab = g.place('dalle', w.x, w.y, 0);
    expect(slab.ok).toBe(false);
    expect(slab.reason).toBe('Une épave est là : fouille-la');

    const total = 30 * 60 * 60;
    for (let t = 0; t < total; t++) {
      g.step();
      if (g.tick % 60 !== 0) continue;
      for (const b of g.beasts) {
        expect(g.wreckAt(Math.floor(b.x), Math.floor(b.y)), `bête ${b.id} sur une épave`).toBeNull();
      }
      for (const x of g.wrecks) {
        for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
          expect(g.world.tree(x.x + i, x.y + j), `arbre sur l’épave ${x.id}`).toBe(false);
        }
      }
    }
  }, 240_000);
});

describe('le bilan des noyaux', () => {
  it('poser, démolir, améliorer au marteau et fouiller ne changent jamais le bilan', () => {
    const g = new Game(36);
    g.quota = 1;
    g.stock[I.bois] = 1000;
    g.stock[I.pierre] = 1000;
    clear(g, 3, 3, 12, 12);

    const start = snapshot(g);
    const cores = g.ledger(I.noyau);

    expect(g.place('scierie', 4, 4, 0).ok).toBe(true);
    same(g, start, 'scierie posée');
    expect(g.place('charbonniere', 8, 4, 0).ok).toBe(true);
    same(g, start, 'charbonnière posée');
    expect(g.place('scierie', 4, 8, 0).ok).toBe(true);
    same(g, start, 'seconde scierie posée');
    expect(g.ledger(I.noyau)).toBe(cores);

    g.quota = 3;                                   // l'ère de la Pierre pour le marteau
    const before = snapshot(g);                    // la Tour en pierre réserve désormais ses 60 pierres
    expect(g.upgrade(4, 4).ok).toBe(true);
    same(g, before, 'scierie améliorée');
    expect(g.remove(4, 8)?.key).toBe('scierie');
    same(g, before, 'scierie démolie');
    expect(g.ledger(I.noyau)).toBe(cores);

    const w = g.wrecks.find((q) => q.cores === GUARANTEED_CORES)!;
    expect(g.searchWreck(w.id).ok).toBe(true);
    same(g, before, 'épave fouillée');
    expect(g.ledger(I.noyau)).toBe(cores);
  });
});

describe('le déterminisme des épaves', () => {
  it('deux parties de même graine ont les mêmes épaves, et le rechargement garde fouille et suite', () => {
    const seed = 37;
    const first = new Game(seed);
    const second = new Game(seed);
    expect(second.wrecks).toEqual(first.wrecks);

    runTo(first, 600);
    runTo(second, 600);
    const id = first.wrecks.find((w) => w.cores > 0)!.id;
    expect(first.searchWreck(id).ok).toBe(true);
    expect(second.searchWreck(id).ok).toBe(true);
    runTo(first, 1200);
    runTo(second, 1200);
    expect(serialize(second).wrecks).toEqual(serialize(first).wrecks);

    const saved = structuredClone(serialize(first));
    const reloaded = deserialize(saved);
    expect(reloaded.wrecks).toEqual(first.wrecks);
    runTo(first, 7200);
    runTo(reloaded, 7200);
    expect(serialize(reloaded).wrecks).toEqual(serialize(first).wrecks);
    expect(serialize(reloaded)).toEqual(serialize(first));
  }, 120_000);
});
