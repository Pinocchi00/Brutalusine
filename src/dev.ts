// Outil de développement (jamais chargé en production) : pose une usine de démonstration
// pour juger le rendu et les systèmes d'un coup d'œil. Dans la console : brutalusine.demo()

import { B, I } from './sim/data';
import { GROUND_BANK } from './sim/world';
import type { Game } from './sim/game';

export function buildDemo(g: Game): string[] {
  const log: string[] = [];
  g.quota = 5;                 // tout le contenu des ères Bois et Pierre est débloqué
  g.stock.fill(5000);
  // une pose refusée est notée dans le journal ; son tampon est alors un tampon factice, sans effet
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
  // bois : scierie → charbonnière → Tour
  P('scierie', 22, -4, 2);
  belt(21, -4, 18, -4, 2);
  P('charbonniere', 16, -5, 2);
  belt(15, -5, 3, -5, 2); belt(2, -5, 2, -2, 1);
  // pierre : un Puits sur la roche, un Brûleur pour le courant
  const rock = g.world.blobs.find((q) => q.type === 1);
  if (rock) {
    g.world.ensureArea(rock.x - 8, rock.y - 8, rock.x + 8, rock.y + 8);
    P('puits', rock.x - 1, rock.y - 1);
    P('bruleur', rock.x - 4, rock.y - 4).buf![I.bois] = 8;
  }
  // une ligne avec stockage, répartiteur et trieur
  P('entrepot', -8, -3);
  belt(-6, -2, -4, -2, 0);
  P('aiguillage', -3, -2);
  belt(-2, -2, 0, -2, 0);
  P('trieur', 2, -2, 0, { filter: I.carbone });
  belt(3, -2, 4, -2, 0);
  // fonte : Four nourri à la main, Argilière posée sur la berge
  const four = P('four', -5, 6);
  four.buf![I.argile] = 60; four.buf![I.carbone] = 30;
  const bank = findBank(g);
  if (bank) P('argiliere', bank.x, bank.y);
  for (let i = 0; i < 1500; i++) g.step();
  return log;
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
