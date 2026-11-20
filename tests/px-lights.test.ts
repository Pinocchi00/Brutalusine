/**
 * Vérification hors navigateur des lumières pixel.
 * Un faux contexte 2D enregistre chaque `fillStyle` et chaque `fillRect` ; on compare la suite
 * produite par le portage à celle de l'oracle, copie fidèle de `drawLights` de la maquette.
 */
import { describe, expect, it } from 'vitest';
import { C } from '../src/render/px/palette';
import { bump, vnoise } from '../src/render/px/noise';
import { pen, type Pen, type PixelTarget } from '../src/render/px/pen';
import { PACE, animTime } from '../src/render/px/clock';
import { drawLights } from '../src/render/px/lights';
import type { Light } from '../src/render/px/sprite';

// =====================================================================================
// ORACLE — référence copiée de docs/maquettes/heure-doree.html, ne pas modifier.
// La maquette lit une horloge globale `now` ; `oracleSetNow` la règle.
// =====================================================================================
let oracleNow = 0;

/** Règle l'horloge de l'oracle, comme le `setNow` exposé par la maquette. */
function oracleSetNow(t: number): void {
  oracleNow = t;
}

/** Copie étiquetée de `drawLights` : mêmes formules, mêmes seuils, mêmes arrondis. */
function oracleDrawLights(P: Pen, L: readonly Light[], X: number, Y: number): void {
  for (const l of L) {
    const x = X + l.x, y = Y + l.y, t = oracleNow + (l.ph || 0);
    if (l.k === 'beat') {
      const c = t % 4, g = Math.max(bump(c / 0.35), 0.8 * bump((c - 0.45) / 0.35)), r = l.r || 3;
      const col = g > 0.75 ? C.o0 : g > 0.4 ? C.o1 : g > 0.1 ? C.o2 : C.o3;
      P.ell(x, y, r, Math.max(1.5, r * 0.55), col);
      if (g > 0.4) P.p(x - 1, y - 1, C.white);
      if (g > 0.3) {
        P.p(x - r - 3, y, C.o1);
        P.p(x + r + 3, y, C.o1);
      }
    } else if (l.k === 'lens') {
      const b = (Math.sin(t * Math.PI * 2 / 5) + 1) / 2, r = l.r || 2.5;
      P.disc(x, y, r, b > 0.66 ? C.o1 : b > 0.33 ? C.o2 : C.o3);
      P.p(x - 1, y - 1, b > 0.5 ? C.o0 : C.o1);
    } else if (l.k === 'win') {
      const b = 0.5 + 0.5 * Math.sin(t * Math.PI * 2 / (l.per || 7));
      P.r(x, y, l.w, l.h, b > 0.8 ? C.o1 : C.o2);
      if (l.h > 3) P.r(x, y + l.h - 1, l.w, 1, C.o3);
    } else if (l.k === 'blink') {
      const on = t % (l.per || 2.5) < 0.35;
      P.p(x, y, on ? (l.c || C.o1) : (l.off || C.o4));
      if (on) P.p(x, y - 1, C.white);
    } else if (l.k === 'fire') {
      for (let i = 0; i < (l.w || 5); i++) {
        const v = vnoise(i * 1.3 + x, t * 1.4, 7), hh = 1 + Math.round(v * 3);
        P.r(x + i, y - hh, 1, hh, v > 0.55 ? C.o1 : C.o2);
        P.p(x + i, y - hh, v > 0.7 ? C.o0 : C.o1);
      }
    } else if (l.k === 'ember') {
      const v = vnoise(x * 0.7 + y, t * 0.45, 4);
      P.r(x, y, l.w || 2, l.h || 1, v > 0.62 ? C.o1 : v > 0.36 ? C.o2 : C.o3);
    }
  }
}

type Call = ['style', string] | ['rect', number, number, number, number];

/** Un contexte 2D minimal qui note les appels dans l'ordre. */
function recorder(): { ctx: PixelTarget; calls: Call[] } {
  const calls: Call[] = [];
  let style = '';
  const ctx: PixelTarget = {
    get fillStyle(): string { return style; },
    set fillStyle(v) { style = v; calls.push(['style', v]); },
    fillRect(x: number, y: number, w: number, h: number): void { calls.push(['rect', x, y, w, h]); },
  };
  return { ctx, calls };
}

// Cinquante instants : les seuils du fanal et du feu, puis un pas irrégulier pour balayer les périodes.
const INSTANTS: readonly number[] = [
  0, 0.35, 0.45, 0.8, 2.5, 2.85,
  ...Array.from({ length: 44 }, (_, i) => 0.11 + i * 0.19),
];

interface LightSample {
  label: string;
  lights: Light[];
}

const SAMPLES: readonly LightSample[] = [
  { label: 'beat · défaut', lights: [{ k: 'beat', x: 12, y: 14 }] },
  { label: 'beat · rayon et phase', lights: [{ k: 'beat', x: 12, y: 14, r: 4, ph: 0.7 }] },
  { label: 'lens · défaut', lights: [{ k: 'lens', x: 12, y: 14 }] },
  { label: 'lens · rayon et phase', lights: [{ k: 'lens', x: 12, y: 14, r: 4, ph: 1.1 }] },
  { label: 'win · défaut', lights: [{ k: 'win', x: 8, y: 10, w: 7, h: 5 }] },
  { label: 'win · période et phase', lights: [{ k: 'win', x: 8, y: 10, w: 6, h: 4, per: 3, ph: 0.9 }] },
  { label: 'blink · défaut', lights: [{ k: 'blink', x: 12, y: 14 }] },
  { label: 'blink · période, couleurs et phase', lights: [{ k: 'blink', x: 12, y: 14, per: 1.4, c: C.good, off: C.ink, ph: 0.8 }] },
  { label: 'fire · défaut', lights: [{ k: 'fire', x: 8, y: 14 }] },
  { label: 'fire · largeur et phase', lights: [{ k: 'fire', x: 8, y: 14, w: 7, ph: 1.6 }] },
  { label: 'ember · défaut', lights: [{ k: 'ember', x: 12, y: 14 }] },
  { label: 'ember · largeur, hauteur et phase', lights: [{ k: 'ember', x: 8, y: 12, w: 5, h: 3, ph: 2.2 }] },
];

describe('horloge des animations', () => {
  it('le temps d’animation avance deux fois plus vite que le temps réel', () => {
    expect(PACE).toBe(2);
    expect(animTime(0)).toBe(0);
    expect(animTime(1)).toBe(2);
    expect(animTime(2.5)).toBe(5);
    expect(animTime(-0.75)).toBe(-1.5);
  });
});

describe('drawLights, identique à la maquette', () => {
  for (const sample of SAMPLES) {
    it(`${sample.label} · ${INSTANTS.length} instants`, () => {
      const mine = recorder();
      const reference = recorder();
      const portPen = pen(mine.ctx);
      const oraclePen = pen(reference.ctx);
      for (const t of INSTANTS) {
        drawLights(portPen, sample.lights, 16, 18, t);
        oracleSetNow(t);
        oracleDrawLights(oraclePen, sample.lights, 16, 18);
      }
      expect(mine.calls.length).toBeGreaterThan(0);
      expect(mine.calls).toEqual(reference.calls);
    });
  }
});
