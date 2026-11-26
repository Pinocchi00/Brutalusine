/**
 * Les lumières animées des bâtiments : fanal, œil de capsule, fenêtres, feux, flammes, braises.
 * Portage exact de `drawLights` de la maquette `docs/maquettes/heure-doree.html`.
 */
import { Status } from '../../sim/ent';
import { C } from './palette';
import { bump, vnoise } from './noise';
import type { Pen } from './pen';
import type { Light } from './sprite';

/** Dessine les lumières animées d'un bâtiment ; `now` est un temps d'animation (déjà multiplié par PACE). */
export function drawLights(P: Pen, lights: readonly Light[], X: number, Y: number, now: number): void {
  for (const l of lights) {
    // La position absolue et le temps décalé de la phase propre à cette lumière.
    const x = X + l.x;
    const y = Y + l.y;
    const t = now + (l.ph || 0);

    if (l.k === 'beat') {
      // Le fanal : deux battements, puis le repos.
      const c = t % 4;
      const g = Math.max(bump(c / 0.35), 0.8 * bump((c - 0.45) / 0.35));
      const r = l.r || 3;
      const col = g > 0.75 ? C.o0 : g > 0.4 ? C.o1 : g > 0.1 ? C.o2 : C.o3;
      P.ell(x, y, r, Math.max(1.5, r * 0.55), col);
      if (g > 0.4) P.p(x - 1, y - 1, C.white);
      if (g > 0.3) {
        P.p(x - r - 3, y, C.o1);
        P.p(x + r + 3, y, C.o1);
      }
    } else if (l.k === 'lens') {
      // L'œil de la capsule respire, lentement.
      const b = (Math.sin(t * Math.PI * 2 / 5) + 1) / 2;
      const r = l.r || 2.5;
      P.disc(x, y, r, b > 0.66 ? C.o1 : b > 0.33 ? C.o2 : C.o3);
      P.p(x - 1, y - 1, b > 0.5 ? C.o0 : C.o1);
    } else if (l.k === 'win') {
      // Une fenêtre éclairée de l'intérieur, qui vacille à peine.
      const b = 0.5 + 0.5 * Math.sin(t * Math.PI * 2 / (l.per || 7));
      P.r(x, y, l.w, l.h, b > 0.8 ? C.o1 : C.o2);
      if (l.h > 3) P.r(x, y + l.h - 1, l.w, 1, C.o3);
    } else if (l.k === 'blink') {
      // Un feu de signalisation.
      const on = t % (l.per || 2.5) < 0.35;
      P.p(x, y, on ? (l.c || C.o1) : (l.off || C.o4));
      if (on) P.p(x, y - 1, C.white);
    } else if (l.k === 'fire') {
      // Des flammes basses, dans un brasero.
      for (let i = 0; i < (l.w || 5); i++) {
        const v = vnoise(i * 1.3 + x, t * 1.4, 7);
        const hh = 1 + Math.round(v * 3);
        P.r(x + i, y - hh, 1, hh, v > 0.55 ? C.o1 : C.o2);
        P.p(x + i, y - hh, v > 0.7 ? C.o0 : C.o1);
      }
    } else if (l.k === 'ember') {
      // Des braises : ça rougeoie, ça ne flambe pas.
      const v = vnoise(x * 0.7 + y, t * 0.45, 4);
      P.r(x, y, l.w || 2, l.h || 1, v > 0.62 ? C.o1 : v > 0.36 ? C.o2 : C.o3);
    } else if (l.k === 'glow') {
      // Une lueur de noyau : lente, faible, un peu plus vive quand la machine travaille.
      const b = (Math.sin(t * Math.PI * 2 / (l.per || 6)) + 1) / 2;
      const r = (l.r || 2) * (0.8 + b * 0.3);
      P.disc(x, y, r, b > 0.55 ? C.o2 : C.o3);
      P.disc(x, y, Math.max(1, r - 1), b > 0.7 ? C.o1 : C.o2);
      if (b > 0.8) P.p(x - 1, y - 1, C.o0);
    }
  }
}

/** L'intensité d'un noyau : vive quand la machine travaille, faible et fixe sinon. */
export function coreIntensity(status: Status): number {
  return status === Status.Working ? 1 : 0.35;
}

/** La lueur du noyau d'un bâtiment, au cœur de son emprise. */
export function drawCore(P: Pen, cx: number, cy: number, status: Status, now: number): void {
  const working = status === Status.Working;
  const b = working ? (Math.sin(now * Math.PI * 2 / 3.2) + 1) / 2 : 0;
  P.disc(cx, cy, 2.4, working ? C.o3 : C.o4);
  P.disc(cx, cy, 1.6, working ? C.o2 : C.o3);
  if (working) {
    P.p(cx, cy, b > 0.5 ? C.o0 : C.o1);
    if (b > 0.75) P.p(cx - 1, cy - 1, C.white);
  } else {
    P.p(cx, cy, C.o3);
  }
}
