// Le cadran du soleil du HUD pixel : un arc de points, un horizon, et le disque qui suit le cycle.
// Pur : aucune dépendance au DOM, la même phase donne toujours le même dessin.

import { DAY_PART } from '../../sim/sun';
import { C } from '../../render/px/palette';

const CX = 14;
const CY = 13;
const R = 11;
const STEP = 0.12;

/** La position du disque sur l'arc du cadran, en points, pour une phase `t` du cycle (`Sun.t`). */
export function sunDialPoint(t: number): { x: number; y: number; day: boolean } {
  const phase = Number.isFinite(t) ? ((t % 1) + 1) % 1 : 0;
  const day = phase < DAY_PART;
  const p = day ? phase / DAY_PART : (phase - DAY_PART) / (1 - DAY_PART);
  const angle = Math.PI + p * Math.PI;
  const x = Math.round(CX + Math.cos(angle) * R);
  const y = Math.round(CY + Math.sin(angle) * R);
  return { x, y, day };
}

/** Le cadran en SVG : arc, horizon, soleil le jour, lune la nuit. Chaque point est un `<rect>` net. */
export function sunDialSvg(t: number): string {
  const point = sunDialPoint(t);
  const parts: string[] = [];
  for (let angle = Math.PI; angle <= 2 * Math.PI + 0.01; angle += STEP) {
    const x = Math.round(CX + Math.cos(angle) * R);
    const y = Math.round(CY + Math.sin(angle) * R);
    parts.push(rect(x, y, C.ui1));
  }
  parts.push(`<rect x="1" y="${CY}" width="27" height="1" fill="${C.c4}"/>`);
  const discColor = point.day ? C.o1 : C.s1;
  for (let dy = -3; dy <= 3; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
      if (dx * dx + dy * dy <= 9) parts.push(rect(point.x + dx, point.y + dy, discColor));
    }
  }
  parts.push(rect(point.x - 1, point.y - 1, point.day ? C.o0 : C.s0));
  return `<svg class="sundial" width="60" height="40" viewBox="-1 -2 30 20" shape-rendering="crispEdges" aria-hidden="true">${parts.join('')}</svg>`;
}

function rect(x: number, y: number, fill: string): string {
  return `<rect x="${x}" y="${y}" width="1" height="1" fill="${fill}"/>`;
}
