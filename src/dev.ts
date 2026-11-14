// Outil de développement (jamais chargé en production) : pose une usine de démonstration
// pour juger le rendu et les systèmes d'un coup d'œil. Dans la console : brutalusine.demo()

import { I } from './sim/data';
import type { Game } from './sim/game';

export function buildDemo(g: Game): string[] {
  const log: string[] = [];
  g.quota = 12;
  g.stock.fill(5000);
  const P = (k: string, x: number, y: number, r = 0, o: { filter?: number; recipe?: string } = {}) => {
    const res = g.place(k, x, y, r, o);
    if (!res.ok) log.push(`${k}@${x},${y}: ${res.reason}`);
    return g.entAt(x, y)!;
  };
  const belt = (x0: number, y0: number, x1: number, y1: number, r: number) => {
    let x = x0, y = y0;
    for (;;) { P('convoyeur', x, y, r); if (x === x1 && y === y1) break; x += Math.sign(x1 - x); y += Math.sign(y1 - y); }
  };
  // chaîne du fer : scierie → charbonnière → haut fourneau → Tour
  P('scierie', 22, -4, 2); belt(21, -4, 18, -4, 2);
  P('charbonniere', 16, -5, 2); belt(15, -5, 13, -5, 2);
  P('haut_fourneau', 10, -6, 2).buf![I.hematite] = 600;
  belt(9, -5, 3, -5, 2); belt(2, -5, 2, -2, 1); P('convoyeur', 2, -1, 2);
  // acier
  const cv = P('convertisseur', 6, 2, 2); cv.buf![I.fer] = 300; cv.buf![I.carbone] = 100;
  belt(5, 3, 3, 3, 2); P('convoyeur', 2, 3, 3); P('convoyeur', 2, 2, 3); P('convoyeur', 2, 1, 2);
  // énergie
  P('amphi', 10, 2).buf![I.biomasse] = 8;
  for (let i = 0; i < 5; i++) { P('heliostat', 13 + i, 2); P('heliostat', 13 + i, 3); }
  P('accu', 10, 5); P('eolienne', -6, 3); P('pile', 1, 9).buf![I.hydrogene] = 8;
  // cuivre, tri de la scorie, épurateur
  const fo = P('fonderie', 13, 6); fo.buf![I.chalcopyrite] = 200; fo.buf![I.quartz] = 200;
  belt(16, 6, 18, 6, 0); P('trieur', 19, 6, 0, { filter: I.cuivre }); belt(20, 6, 22, 6, 0); belt(19, 7, 19, 9, 1);
  P('epurateur', 13, 9).buf![I.eau] = 100;
  // un échantillon de chaque famille
  const fa = P('four_arc', -8, -4); fa.buf![I.quartz] = 50; fa.buf![I.carbone] = 50;
  P('reacteur', -12, -4).buf![I.hydrogene] = 60;
  P('entrepot', -5, -3); P('lampadaire', 4, 5); P('lampadaire', 8, 6); P('lampadaire', -3, 5);
  P('four_chaux', -5, 6).buf![I.calcaire] = 60; P('presse', -9, 6); P('atelier', -9, 1); P('cloitre', -13, 1);
  P('serre', -13, 6).buf![I.eau] = 40; P('electrolyseur', -2, 6).buf![I.eau] = 40; P('verrerie', -2, 9).buf![I.quartz] = 40;
  P('usine_engrais', 4, 9); P('platriere', 8, 9); P('semeur', -6, 10);
  P('aiguillage', 6, -9); P('pont', 8, -9); P('pont', 11, -9);
  for (let i = 0; i < 1500; i++) g.step();
  return log;
}
