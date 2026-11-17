// Tracé d'un convoyeur : un L (un seul virage) de la case de départ à la case visée.
// Fonction pure : le geste et l'aperçu s'en servent, les tests aussi.

import { DX, DY, type Dir } from './data';
import type { Game } from './game';
import { accepts } from './belts';

export interface RouteCell { x: number; y: number; dir: Dir; }
export interface Route {
  cells: RouteCell[];
  /** Ce qui reçoit le flux au bout du tracé : une machine (ou la Tour), un autre tapis, ou rien. */
  into: 'ent' | 'belt' | null;
}

const MAX_CELLS = 200;
const dirOf = (dx: number, dy: number): Dir => (dx > 0 ? 0 : dx < 0 ? 2 : dy > 0 ? 1 : 3);

/**
 * Le L va de (ax, ay) à (bx, by) : d'abord le long de x si `xFirst`, sinon le long de y.
 * Chaque case pointe vers la suivante ; la dernière garde la direction du dernier pas
 * (ou `rot` si le tracé ne fait qu'une case). Le tracé s'arrête contre un bâtiment :
 * la case d'avant pointe alors dedans, et le flux y entre.
 */
export function beltRoute(g: Game, ax: number, ay: number, bx: number, by: number, xFirst: boolean, rot: Dir): Route {
  const pts: [number, number][] = [[ax, ay]];
  const cx = xFirst ? bx : ax, cy = xFirst ? ay : by;
  for (const [tx, ty] of [[cx, cy], [bx, by]]) {
    let [x, y] = pts[pts.length - 1];
    while ((x !== tx || y !== ty) && pts.length < MAX_CELLS) { x += Math.sign(tx - x); y += Math.sign(ty - y); pts.push([x, y]); }
  }
  const cells: RouteCell[] = [];
  for (let i = 0; i < pts.length; i++) {
    const [x, y] = pts[i];
    const e = g.entAt(x, y);
    if (e && e.def.kind !== 'belt') break;                  // contre une machine : on s'arrête, le flux y entre
    const dir = i + 1 < pts.length ? dirOf(pts[i + 1][0] - x, pts[i + 1][1] - y)
      : i > 0 ? dirOf(x - pts[i - 1][0], y - pts[i - 1][1]) : rot;
    cells.push({ x, y, dir });
  }
  // ce qui reçoit le flux : mêmes règles que la simulation (belts.accepts pour les tapis, Game.takesFrom sinon)
  let into: Route['into'] = null;
  const last = cells[cells.length - 1];
  if (last) {
    const t = g.entAt(last.x + DX[last.dir], last.y + DY[last.dir]);
    if (t && (t.def.kind === 'belt' || t.def.kind === 'bridge')) into = accepts(t, last.dir) ? 'belt' : null;
    else if (t && g.takesFrom(t, last.dir)) into = 'ent';
  }
  return { cells, into };
}
