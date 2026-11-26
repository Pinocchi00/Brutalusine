// Outil de développement (jamais chargé en production) : pose une usine de démonstration
// pour juger le rendu et les systèmes d'un coup d'œil. Dans la console : brutalusine.demo()

import { B, I, type BuildingDef } from './sim/data';
import { GROUND_BANK } from './sim/world';
import type { Game } from './sim/game';

export function buildDemo(g: Game): string[] {
  const log: string[] = [];
  g.stock[I.noyau] += 6;   // la démo pose six machines à noyau
  // le stock se remplit par les tapis, pas d'avance : une pose refusée est notée dans le journal
  // et son tampon est alors un tampon factice, sans effet
  const sink = { buf: new Int32Array(64) };
  const P = (k: string, x: number, y: number, r = 0, o: { filter?: number; recipe?: string } = {}) => {
    const res = g.place(k, x, y, r, { ...o, free: true });
    if (!res.ok) log.push(`${k}@${x},${y}: ${res.reason}`);
    const e = res.ok ? g.entAt(x, y) : null;   // jamais le bâtiment qui occupait déjà la case
    return e && e.buf ? e : sink;
  };
  const belt = (x0: number, y0: number, x1: number, y1: number, r: number) => {
    let x = x0, y = y0;
    for (;;) { P('convoyeur', x, y, r); if (x === x1 && y === y1) break; x += Math.sign(x1 - x); y += Math.sign(y1 - y); }
  };
  // bois : scierie → charbonnière → Tour, sur la première allée entièrement sèche
  // on les pose avant l'ère de la Pierre : elles naissent en version 1, puis le marteau les refait
  g.quota = 0;
  for (const ry of [-4, 4, -8, 8, -12, 12, -16, 16]) {
    if (!woodLane(g, ry)) continue;
    P('scierie', 22, ry, 2);
    belt(21, ry, 18, ry, 2);
    P('charbonniere', 16, ry - 1, 2);
    belt(15, ry, 3, ry, 2);
    belt(2, ry, 2, 0, ry < 0 ? 1 : 3);
    P('convoyeur', 2, 0, 2);              // entre dans la Tour par l'est
    break;
  }
  // les machines de bois sont posées en version 1, puis la démo passe à l'ère de la Pierre
  g.quota = 5;                 // tout le contenu des ères Bois et Pierre est débloqué
  // pierre : un Puits sur la roche, un Brûleur pour le courant, posés sur des cases libres
  const rock = g.world.blobs.find((q) => q.type === 1);
  if (rock) {
    g.world.ensureArea(rock.x - 8, rock.y - 8, rock.x + 8, rock.y + 8);
    const spot = freeSpot(g, B.puits, rock.x, rock.y, 3);
    if (spot) {
      P('puits', spot.x, spot.y);
      const burner = freeSpot(g, B.bruleur, spot.x, spot.y, 5);
      if (burner) P('bruleur', burner.x, burner.y).buf![I.bois] = 8;
    }
  }
  // une ligne avec stockage, répartiteur et trieur, au sud de la Tour et libre de tout passage
  P('entrepot', -8, 4);
  belt(-6, 5, -4, 5, 0);
  P('aiguillage', -3, 5);
  belt(-2, 5, 0, 5, 0);
  P('trieur', 1, 5, 0, { filter: I.carbone });
  belt(2, 5, 4, 5, 0);
  // fonte : Four nourri à la main, Argilière posée sur la berge
  const four = P('four', -5, 6);
  four.buf![I.argile] = 60; four.buf![I.carbone] = 30;
  const bank = findBank(g);
  if (bank) P('argiliere', bank.x, bank.y);
  // le marteau : deux machines restées en Bois et une ligne de dalles, refaites en Pierre
  g.stock[I.pierre] += 200;
  for (const key of ['scierie', 'charbonniere']) {
    const e = g.tickers.find((t) => t.def.key === key);
    if (!e) continue;
    g.upgrade(e.x, e.y);
  }
  for (const [x, y] of demoSlabLine(g)) {
    g.world.setSlab(x, y, 1);
    g.upgrade(x, y);
  }
  for (let i = 0; i < 1500; i++) g.step();
  return log;
}

/** Six cases sèches et libres de suite, pour la ligne de dalles refaite au marteau. */
function demoSlabLine(g: Game): [number, number][] {
  for (let y = 4; y <= 40; y++) {
    for (let x = -20; x <= 20; x++) {
      const line: [number, number][] = [];
      for (let i = 0; i < 6; i++) {
        if (!g.canPlace(B.dalle, x + i, y, 0, true).ok) break;
        line.push([x + i, y]);
      }
      if (line.length === 6) return line;
    }
  }
  return [];
}

/** L'allée de bois tient-elle entièrement sur des cases sèches et libres, à cette hauteur ? */
function woodLane(g: Game, ry: number): boolean {
  if (!g.canPlace(B.scierie, 22, ry, 0, true).ok) return false;
  if (!g.canPlace(B.charbonniere, 16, ry - 1, 0, true).ok) return false;
  for (let x = 21; x >= 18; x--) if (!g.canPlace(B.convoyeur, x, ry, 0, true).ok) return false;
  for (let x = 15; x >= 3; x--) if (!g.canPlace(B.convoyeur, x, ry, 0, true).ok) return false;
  const step = ry < 0 ? 1 : -1;
  for (let y = ry; y !== 0; y += step) if (!g.canPlace(B.convoyeur, 2, y, 0, true).ok) return false;
  return g.canPlace(B.convoyeur, 2, 0, 0, true).ok;
}

/** La première case libre, en anneaux croissants autour de (cx, cy), où poser `def`. */
function freeSpot(g: Game, def: BuildingDef, cx: number, cy: number, radius: number): { x: number; y: number } | null {
  for (let r = 0; r <= radius; r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = cx + dx, y = cy + dy;
      if (g.canPlace(def, x, y, 0, true).ok) return { x, y };
    }
  }
  return null;
}

/** Une case de berge libre où l'Argilière tient, la plus proche du départ. */
function findBank(g: Game): { x: number; y: number } | null {
  const w = g.world;
  for (let r = 0; r <= 60; r++) {
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
      if (Math.max(Math.abs(x), Math.abs(y)) !== r) continue;
      if (w.ground(x, y) !== GROUND_BANK || w.ent(x, y)) continue;
      if (g.canPlace(B.argiliere, x, y, 0, true).ok) return { x, y };
    }
  }
  return null;
}
