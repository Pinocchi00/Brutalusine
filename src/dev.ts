// Outil de développement (jamais chargé en production) : pose une usine de démonstration
// pour juger le rendu et les systèmes d'un coup d'œil. Dans la console : brutalusine.demo()

import { I } from './sim/data';
import type { Game } from './sim/game';

export function buildDemo(g: Game): string[] {
  const log: string[] = [];
  g.quota = 12;
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
  // chaîne du fer : scierie → charbonnière → fonderie → Tour
  P('scierie', 22, -4, 2); belt(21, -4, 18, -4, 2);
  P('charbonniere', 16, -5, 2); belt(15, -5, 13, -5, 2);
  P('fonderie', 10, -6, 2).buf![I.hematite] = 600;
  belt(9, -5, 3, -5, 2); belt(2, -5, 2, -2, 1);
  // acier, avec un virage et un raccord en T
  const cv = P('convertisseur', 6, 2, 2); cv.buf![I.fer] = 300; cv.buf![I.carbone] = 100;
  belt(5, 3, 3, 3, 2); P('convoyeur', 2, 3, 3); P('convoyeur', 2, 2, 3);
  // énergie
  P('bruleur', 10, 2).buf![I.bois] = 8;
  for (let i = 0; i < 5; i++) { P('heliostat', 13 + i, 2); P('heliostat', 13 + i, 3); }
  P('accu', 10, 5); P('eolienne', -6, 3);
  // cuivre trié
  const fo = P('fonderie', 13, 6, 0, { recipe: 'cuivre' }); fo.buf![I.malachite] = 200; fo.buf![I.carbone] = 200;
  belt(16, 7, 18, 7, 0); P('trieur', 19, 7, 0, { filter: I.cuivre }); belt(20, 7, 22, 7, 0); belt(19, 8, 19, 10, 1);
  // un échantillon de chaque famille
  const fa = P('four_arc', -8, -4); fa.buf![I.quartz] = 50; fa.buf![I.carbone] = 50;
  P('entrepot', -5, -3); P('lampadaire', 4, 5); P('lampadaire', 8, 6); P('lampadaire', -3, 5);
  P('four', -5, 6).buf![I.calcaire] = 60; P('presse', -9, 6).buf![I.fer] = 80; P('cloitre', -13, 1);
  const at = P('atelier', -9, 1); at.buf![I.cuivre] = 40; at.buf![I.silicium] = 20;
  const be = P('betonniere', -13, 6); be.buf![I.chaux] = 40; be.buf![I.quartz] = 20;
  P('aiguillage', 6, -9); P('pont', 8, -9); P('pont', 11, -9); belt(4, -9, 5, -9, 0); belt(12, -9, 14, -9, 0); belt(9, -11, 9, -7, 1);
  for (let i = 0; i < 1500; i++) g.step();
  return log;
}
