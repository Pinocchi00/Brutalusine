// Le soleil : un cycle jour/nuit qui est une mécanique, pas un décor.
// La lumière alimente les héliostats et la photosynthèse ; les ombres tournent comme sur un cadran.

import { DAY_TICKS } from './data';

export const DAY_PART = 0.65;        // fraction du cycle où le soleil est levé
export const START_TIME = 0.07;      // la partie commence à l'heure dorée du matin
const MAX_ELEV = (62 * Math.PI) / 180;

export interface Sun {
  t: number;        // 0..1 dans le cycle (0 = lever)
  day: boolean;
  elev: number;     // 0..1
  light: number;    // 0..1 : énergie reçue au sol
  sx: number; sy: number;   // vecteur unitaire au sol pointant vers le soleil
  shadow: number;   // longueur d'ombre par unité de hauteur
  night: number;    // 0..1 : obscurité (rendu)
  hour: number;     // heure affichée (0..24)
}

export function sunAt(tick: number, out?: Sun): Sun {
  const s = out ?? ({} as Sun);
  const t = ((tick / DAY_TICKS) + START_TIME) % 1;
  s.t = t;
  s.day = t < DAY_PART;
  if (s.day) {
    const ph = t / DAY_PART;                    // 0 lever, 0.5 zénith, 1 coucher
    s.elev = Math.sin(Math.PI * ph);
    const ax = Math.cos(Math.PI * ph), ay = 0.35 + 0.65 * Math.sin(Math.PI * ph);
    const n = Math.hypot(ax, ay);
    s.sx = ax / n; s.sy = ay / n;
    s.light = Math.pow(s.elev, 0.6);
    s.shadow = Math.min(5, 1 / Math.tan(Math.max(0.19, s.elev * MAX_ELEV)));
    s.night = Math.max(0, 1 - s.elev * 6) * 0.55;
    s.hour = 6 + ph * 13.5;
  } else {
    const ph = (t - DAY_PART) / (1 - DAY_PART);  // 0 coucher, 1 lever
    s.elev = 0; s.light = 0; s.shadow = 0;
    s.sx = ph < 0.5 ? -1 : 1; s.sy = 0;
    s.night = 0.55 + 0.45 * Math.sin(Math.PI * ph);
    s.hour = (19.5 + ph * 10.5) % 24;
  }
  return s;
}
