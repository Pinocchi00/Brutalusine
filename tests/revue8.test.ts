// Les sept défauts de la revue de l'étape 8 : faune, Piège, pose, HUD et noms anglais.
import { describe, it, expect } from 'vitest';
import { Game } from '../src/sim/game';
import { B, I } from '../src/sim/data';
import { Status } from '../src/sim/ent';
import { beltRoute } from '../src/sim/route';
import { CHUNK } from '../src/sim/world';

/** Aplanit une zone en sol nu pour y construire librement. */
const clear = (g: Game, x0: number, y0: number, x1: number, y1: number): void => {
  g.world.ensureArea(x0 - 2, y0 - 2, x1 + 2, y1 + 2);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const c = g.world.at(x, y)!, i = ((y & 31) << 5) | (x & 31);
    if (c.ent[i]) continue;
    c.ground[i] = 0; c.deposit[i] = 0; c.amount[i] = 0; c.canopy[i] = 0; c.cap[i] = 0; c.loot[i] = 0;
  }
};

interface TrapChain { zone: number; cells: { x: number; y: number }[]; }

/** Une suite de six Pièges espacés de 11 cases, posée vers l'extérieur d'une zone, ou null. */
function outwardTraps(g: Game): TrapChain | null {
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
  for (let zi = 0; zi < g.fauna.zones.length; zi++) {
    const z = g.fauna.zones[zi];
    if (!z.herd || !z.hasAnchor) continue;
    for (const [dx, dy] of dirs) {
      const cells: { x: number; y: number }[] = [];
      for (let k = 1; k <= 6; k++) {
        const x = Math.round(z.ax + 0.5 + dx * 11 * k) - 1;
        const y = Math.round(z.ay + 0.5 + dy * 11 * k) - 1;
        if (!g.canPlace(B.piege, x, y, 0, true).ok) { cells.length = 0; break; }
        cells.push({ x, y });
      }
      if (cells.length === 6) return { zone: zi, cells };
    }
  }
  return null;
}

describe('un troupeau ne quitte pas sa zone', () => {
  it('une suite de six Pièges vers l’extérieur ne le traîne pas hors de la zone', () => {
    let found: { g: Game; zone: number } | null = null;
    for (const seed of [401, 402, 403, 404, 405]) {
      const g = new Game(seed);
      g.stock.fill(1e6);
      const chain = outwardTraps(g);
      if (!chain) continue;
      for (const s of chain.cells) expect(g.place('piege', s.x, s.y, 0, { free: true }).ok).toBe(true);
      found = { g, zone: chain.zone };
      break;
    }
    expect(found).not.toBeNull();
    const { g, zone } = found!;
    const z = g.fauna.zones[zone];
    const x0 = z.cx * CHUNK, y0 = z.cy * CHUNK;
    const x1 = x0 + CHUNK - 1, y1 = y0 + CHUNK - 1;
    const chunks = g.world.list.length;
    let worstAnchor = 0;
    for (let t = 0; t < 108_000; t++) {
      g.step();
      if (g.tick % 60 !== 0) continue;
      worstAnchor = Math.max(worstAnchor, x0 - z.ax, z.ax - x1, y0 - z.ay, z.ay - y1);
    }
    expect(worstAnchor, 'l’ancre sort de sa zone').toBeLessThanOrEqual(3);
    expect(g.world.list.length, 'des blocs ont été chargés en cours de partie').toBe(chunks);
  }, 180_000);
});

describe('une machine n’annonce pas une entrée qu’elle refuse', () => {
  it('une Scierie de version 1 n’a pas d’entrée ; une version 2 en a une', () => {
    const early = new Game(9);
    early.stock.fill(1e6);
    early.quota = 0;
    clear(early, 10, 10, 30, 20);
    expect(early.place('scierie', 14, 10, 0, { free: true }).ok).toBe(true);
    expect(early.entAt(14, 10)!.era).toBe(1);
    expect(beltRoute(early, 10, 10, 13, 10, true, 0).into).toBe(null);

    const stone = new Game(9);
    stone.stock.fill(1e6);
    stone.quota = 3;
    clear(stone, 10, 10, 30, 20);
    expect(stone.place('scierie', 14, 10, 0, { free: true }).ok).toBe(true);
    expect(stone.entAt(14, 10)!.era).toBe(2);
    expect(beltRoute(stone, 10, 10, 13, 10, true, 0).into).toBe('ent');
  });
});

describe('la cause d’un refus de pose', () => {
  it('sans noyau, un bâtiment non débloqué dit d’abord qu’il n’est pas débloqué', () => {
    const g = new Game(10);
    g.stock.fill(0);
    g.quota = 0;
    clear(g, -6, -6, 10, 10);
    const locked = g.canPlace(B.piege, 4, 4, 0);
    expect(locked.ok).toBe(false);
    expect(locked.reason).toBe('Pas encore débloqué');
  });

  it('sans noyau, un bâtiment débloqué mais trop cher dit d’abord ce qui manque', () => {
    const g = new Game(10);
    g.stock.fill(0);
    g.quota = 0;
    clear(g, -6, -6, 10, 10);
    const poor = g.canPlace(B.scierie, 4, 4, 0);
    expect(poor.ok).toBe(false);
    expect(poor.reason).toBe('Il manque Bois (0/8)');
  });
});

describe('les cabiais ne s’empilent pas en broutant', () => {
  it('sur trente minutes, presque aucune paire de bêtes qui broutent n’est à moins de 0,5 case', () => {
    const g = new Game(501);
    let close = 0;
    let total = 0;
    for (let t = 0; t < 108_000; t++) {
      g.step();
      if (g.tick % 60 !== 0) continue;
      for (let zi = 0; zi < g.fauna.zones.length; zi++) {
        const grazing = g.beasts.filter((b) => b.zone === zi && b.state === 'graze');
        for (let i = 0; i < grazing.length; i++) {
          for (let j = i + 1; j < grazing.length; j++) {
            total++;
            if (Math.hypot(grazing[i].x - grazing[j].x, grazing[i].y - grazing[j].y) < 0.5) close++;
          }
        }
      }
    }
    const rate = total === 0 ? 0 : close / total;
    console.log(`paires de bêtes qui broutent à moins de 0,5 case : ${(rate * 100).toFixed(2)} % `
      + `(${close}/${total})`);
    expect(total).toBeGreaterThan(0);
    expect(rate, 'des bêtes se recouvrent en broutant').toBeLessThan(0.02);
  }, 180_000);
});

describe('le Piège ne dit pas « En marche » sans bête', () => {
  it('loin de toute bête, pendant son attente, il dit NoBeast', () => {
    const g = new Game(202);
    g.quota = 3;
    g.stock[I.pierre] = 200;
    clear(g, -6, -6, 10, 10);
    expect(g.place('piege', 4, 4, 0).ok).toBe(true);
    const trap = g.entAt(4, 4)!;
    for (let i = 0; i < 30; i++) g.step();
    expect(trap.progress).toBeGreaterThan(0);
    expect(trap.status).toBe(Status.NoBeast);
  }, 30_000);
});
