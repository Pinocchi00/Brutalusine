// Bâtiments, arbres et bâtisseurs : tout est dessiné en vectoriel, en unités de case.
// Vue de dessus « trois quarts » : ce qui est haut est décalé vers le nord et montre sa face sud.
// Chaque bâtiment a son mouvement propre : c'est lui qui dit ce que fait la machine.

import { B } from '../sim/data';
import { PAL, mix } from './terrain';

export const K = 0.22;   // décalage vers le nord par unité de hauteur

export interface SpriteState {
  w: number; h: number; rot: number;
  t: number;           // phase d'animation (n'avance que si la machine travaille)
  act: number;         // 0..1 : activité lissée (démarrage et arrêt en douceur)
  prog: number;        // 0..1 du cycle en cours
  color: string;       // couleur du produit
  night: number;       // 0..1
  level: number;       // étages (Tour), charge (accumulateur), lumière (héliostat), remplissage (entrepôt)
  time: number;        // temps réel (scintillements)
  aim: number;         // angle visé (scierie, héliostat, répartiteur)
  mark: string | null; // couleur du filtre (trieur)
  flag: boolean;       // sortie de pont
  pulse: number;       // 0..1 : vient de produire / de recevoir
  plinth: string;      // teinte du socle : la famille du bâtiment, lisible même de loin
}

export const IDLE: SpriteState = { w: 1, h: 1, rot: 0, t: 0, act: 0, prog: 0, color: PAL.signal, night: 0, level: 0, time: 0, aim: 0, mark: null, flag: false, pulse: 0, plinth: PAL.roofLo };

/**
 * Le socle dit la famille, en matières sourdes (l'orange reste le seul accent) :
 * terre ocre pour l'extraction, béton suié pour la fonte, béton froid pour la fabrication,
 * acier pour l'énergie, béton clair pour la logistique.
 */
const PLINTH: Record<string, string> = {
  logistique: PAL.roofLo, extraction: '#A88F6B', fonte: '#6F6862', fabrication: '#A3AEB4', energie: '#7E8794',
};
export function plinthOf(key: string): string { const cat = B[key]?.cat; return (cat && PLINTH[cat]) || PAL.roofLo; }

type Ctx = CanvasRenderingContext2D;
const TAU = Math.PI * 2;

// ------------------------------------------------------------------ primitives
/** Pavé : face sud visible, puis dessus. */
function block(c: Ctx, x: number, y: number, w: number, h: number, z0: number, z1: number, top = PAL.roof, side = PAL.wall): void {
  c.fillStyle = side; c.fillRect(x, y + h - z1 * K, w, (z1 - z0) * K + 0.005);
  c.fillStyle = top; c.fillRect(x, y - z1 * K, w, h);
  c.fillStyle = 'rgba(255,255,255,0.28)'; c.fillRect(x, y - z1 * K, w, 0.035);
  c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillRect(x, y + h - z1 * K - 0.03, w, 0.03);
}
/** Cylindre debout. */
function cyl(c: Ctx, x: number, y: number, r: number, z0: number, z1: number, top = PAL.roof, side = PAL.wall): void {
  c.fillStyle = side;
  c.beginPath(); c.arc(x, y - z0 * K, r, 0, Math.PI); c.lineTo(x - r, y - z1 * K); c.lineTo(x + r, y - z1 * K); c.closePath(); c.fill();
  c.fillStyle = top; c.beginPath(); c.arc(x, y - z1 * K, r, 0, TAU); c.fill();
  c.strokeStyle = 'rgba(255,255,255,0.3)'; c.lineWidth = 0.03; c.beginPath(); c.arc(x, y - z1 * K, r - 0.015, Math.PI * 1.05, Math.PI * 1.95); c.stroke();
}
function disc(c: Ctx, x: number, y: number, r: number, fill: string): void { c.fillStyle = fill; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); }
function ring(c: Ctx, x: number, y: number, r: number, w: number, stroke: string): void { c.strokeStyle = stroke; c.lineWidth = w; c.beginPath(); c.arc(x, y, r, 0, TAU); c.stroke(); }
function glow(c: Ctx, x: number, y: number, r: number, col: string, a: number): void {
  if (a <= 0.01) return;
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
  const old = c.globalAlpha; c.globalAlpha = old * Math.min(1, a); c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); c.globalAlpha = old;
}
/** Socle commun : la dalle un peu surélevée sur laquelle repose la machine. */
function base(c: Ctx, s: SpriteState, z = 0.25, top = s.plinth): void { block(c, -s.w / 2 + 0.04, -s.h / 2 + 0.04, s.w - 0.08, s.h - 0.08, 0, z, top, PAL.wallLo); }
/** Cheminée avec son foyer rougeoyant. */
function stack(c: Ctx, x: number, y: number, r: number, z0: number, z1: number, s: SpriteState): void {
  cyl(c, x, y, r, z0, z1, PAL.steel, PAL.dark);
  disc(c, x, y - z1 * K, r * 0.62, PAL.ink);
  if (s.act > 0.05) disc(c, x, y - z1 * K, r * 0.5, mix('#3a1408', PAL.hot, s.act * (0.6 + 0.4 * Math.sin(s.time * 9))));
}
const hazard = (c: Ctx, x: number, y: number, w: number, h: number) => {
  c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
  c.fillStyle = PAL.signal; c.fillRect(x, y, w, h);
  c.strokeStyle = PAL.ink; c.lineWidth = 0.07; c.beginPath();
  for (let i = -2; i < w / 0.16 + 2; i++) { c.moveTo(x + i * 0.16, y + h + 0.05); c.lineTo(x + i * 0.16 + h + 0.1, y - 0.05); }
  c.stroke(); c.restore();
};

// ------------------------------------------------------------------ bâtiments
const S: Record<string, (c: Ctx, s: SpriteState) => void> = {
  tour(c, s) {
    // ziggourat : chaque quota accompli ajoute un gradin
    const n = 3 + Math.min(6, s.level);
    let z = 0;
    for (let i = 0; i < n; i++) {
      const k = 1.46 - i * (1.1 / n), dz = i === 0 ? 0.5 : 0.36;
      block(c, -k, -k, k * 2, k * 2, z, z + dz, i % 2 ? PAL.roofHi : PAL.roof, i % 2 ? PAL.wall : PAL.wallLo);
      if (i === 0) for (const [x, y, w, h] of [[-0.3, 1.46 - 0.5 * K - 0.02, 0.6, 0.5 * K], [-0.3, -1.46 - 0.5 * K, 0.6, 0.1], [-1.46, -0.3 - 0.5 * K, 0.1, 0.6], [1.36, -0.3 - 0.5 * K, 0.1, 0.6]]) { c.fillStyle = PAL.ink; c.fillRect(x, y, w, h); }
      z += dz;
    }
    const y = -z * K, beat = 0.5 + 0.5 * Math.sin(s.time * 2.2);
    disc(c, 0, y, 0.3, PAL.ink);
    disc(c, 0, y, 0.23, PAL.signal);
    disc(c, 0, y, 0.1 + 0.05 * beat + 0.1 * s.pulse, PAL.glowHot);
    if (s.pulse > 0.02) ring(c, 0, y, 0.3 + (1 - s.pulse) * 0.9, 0.05 * s.pulse, PAL.signalHi);
  },

  puits(c, s) {
    base(c, s, 0.3);
    const y = -0.3 * K;
    // la fosse et son minerai
    disc(c, 0, y, 1.12, PAL.wallLo); disc(c, 0, y + 0.03, 1.04, PAL.ink);
    disc(c, 0, y + 0.06, 0.96, mix(s.color, '#120c08', 0.62));
    for (let i = 0; i < 7; i++) { const a = i * 0.9 + 0.3, d = 0.3 + (i % 3) * 0.24; disc(c, Math.cos(a) * d, y + 0.08 + Math.sin(a) * d, 0.1 + (i % 2) * 0.05, mix(s.color, '#120c08', 0.3)); }
    // le trépan : un bras qui tourne, deux molettes qui broient
    c.save(); c.translate(0, y - 0.1 + 0.03 * Math.sin(s.t * 14)); c.rotate(s.t * 2.4);
    c.fillStyle = PAL.dark; c.fillRect(-1.0, -0.11, 2.0, 0.22);
    c.fillStyle = PAL.steelHi; c.fillRect(-1.0, -0.11, 2.0, 0.06);
    for (const sx of [-0.82, 0.82]) {
      c.save(); c.translate(sx, 0); c.rotate(s.t * 9 * Math.sign(sx));
      c.fillStyle = PAL.steel; c.beginPath();
      for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; c.lineTo(Math.cos(a) * 0.26, Math.sin(a) * 0.26); c.lineTo(Math.cos(a + 0.39) * 0.17, Math.sin(a + 0.39) * 0.17); }
      c.closePath(); c.fill(); disc(c, 0, 0, 0.07, PAL.ink); c.restore();
    }
    c.restore();
    cyl(c, 0, y - 0.1, 0.24, 0.3, 0.75, PAL.roof, PAL.wall);
    disc(c, 0, y - 0.1 - 0.45 * K, 0.11, s.act > 0.3 ? PAL.signal : PAL.dark);
    for (const [x, yy] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]]) block(c, x - 0.13, yy - 0.13, 0.26, 0.26, 0.3, 0.6, PAL.roofHi, PAL.wall);
  },

  scierie(c, s) {
    base(c, s, 0.25);
    block(c, -0.82, -0.3, 0.9, 1.05, 0.25, 0.8, PAL.roof, PAL.wall);
    hazard(c, -0.82, 0.75 - 0.8 * K - 0.02, 0.9, 0.09);
    // la lame, à demi sortie de son carter
    const y = -0.42 - 0.45 * K;
    c.save(); c.translate(0.32, y); c.rotate(s.t * 11);
    c.fillStyle = PAL.steelHi; c.beginPath();
    for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU; c.lineTo(Math.cos(a) * 0.52, Math.sin(a) * 0.52); c.lineTo(Math.cos(a + 0.24) * 0.4, Math.sin(a + 0.24) * 0.4); }
    c.closePath(); c.fill();
    c.strokeStyle = PAL.steel; c.lineWidth = 0.04; c.beginPath(); c.moveTo(-0.3, 0); c.lineTo(0.3, 0); c.moveTo(0, -0.3); c.lineTo(0, 0.3); c.stroke();
    c.restore();
    disc(c, 0.32, y, 0.1, PAL.signal);
    // le bras qui désigne l'arbre qu'il vient de couper
    c.save(); c.translate(-0.4, -0.3 - 0.8 * K + 0.5); c.rotate(s.aim);
    c.strokeStyle = PAL.dark; c.lineWidth = 0.12; c.lineCap = 'round'; c.beginPath(); c.moveTo(0, 0); c.lineTo(0.55 + 0.08 * Math.sin(s.t * 5), 0); c.stroke();
    disc(c, 0.58 + 0.08 * Math.sin(s.t * 5), 0, 0.09, PAL.signal);
    c.restore();
    disc(c, -0.4, -0.3 - 0.8 * K + 0.5, 0.13, PAL.steel);
  },

  charbonniere(c, s) {
    base(c, s, 0.2);
    // une meule : un dôme, des évents qui rougeoient
    cyl(c, 0, 0.08, 0.78, 0.2, 0.55, PAL.roofLo, PAL.wall);
    const y = 0.08 - 0.55 * K;
    disc(c, 0, y - 0.05, 0.66, PAL.roof); disc(c, -0.06, y - 0.12, 0.44, PAL.roofHi);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU + 0.5, x = Math.cos(a) * 0.52, yy = y - 0.03 + Math.sin(a) * 0.5;
      disc(c, x, yy, 0.085, PAL.ink);
      disc(c, x, yy, 0.06, mix('#2a0f06', PAL.hot, s.act * (0.5 + 0.5 * Math.sin(s.time * 7 + i * 2))));
    }
    stack(c, 0, y - 0.1, 0.17, 0.75, 1.15, s);
  },

  fonderie(c, s) {
    base(c, s, 0.3);
    block(c, -1.3, -1.2, 2.6, 2.35, 0.3, 1.1, PAL.roof, PAL.wall);
    const y = -1.1 * K;
    c.fillStyle = PAL.joint; c.fillRect(-1.3, y - 0.02, 2.6, 0.04); c.fillRect(-0.02, y - 1.2, 0.04, 2.35);
    // le creuset : il se remplit, puis coule
    disc(c, -0.2, y + 0.2, 0.74, PAL.wallLo); disc(c, -0.2, y + 0.2, 0.64, PAL.ink);
    const lvl = s.act > 0.05 ? 0.25 + 0.39 * s.prog : 0;
    if (lvl > 0) {
      const g = c.createRadialGradient(-0.2, y + 0.2, 0, -0.2, y + 0.2, lvl);
      g.addColorStop(0, PAL.glowHot); g.addColorStop(0.6, PAL.hot); g.addColorStop(1, mix(PAL.hot, s.color, 0.6));
      c.fillStyle = g; c.beginPath(); c.arc(-0.2, y + 0.2, lvl, 0, TAU); c.fill();
      for (let i = 0; i < 3; i++) { const a = s.time * (1 + i * 0.4) + i * 2; disc(c, -0.2 + Math.cos(a) * lvl * 0.5, y + 0.2 + Math.sin(a * 1.3) * lvl * 0.5, 0.05, '#FFF3C4'); }
    }
    // la rigole de coulée vers la sortie
    const dx = [1, 0, -1, 0][s.rot], dy = [0, 1, 0, -1][s.rot];
    c.strokeStyle = PAL.ink; c.lineWidth = 0.2; c.lineCap = 'butt'; c.beginPath(); c.moveTo(-0.2 + dx * 0.6, y + 0.2 + dy * 0.6); c.lineTo(dx * 1.3 + (dx ? 0 : -0.2), y + dy * 1.15 + (dy ? 0 : 0.2)); c.stroke();
    if (s.pulse > 0.02) { c.strokeStyle = mix(s.color, PAL.glowHot, s.pulse); c.lineWidth = 0.12; c.stroke(); }
    stack(c, 0.85, -0.75, 0.3, 1.1, 2.0, s);
    stack(c, 0.85, -0.05, 0.2, 1.1, 1.6, s);
    hazard(c, -1.3, 1.15 - 1.1 * K - 0.02, 2.6, 0.08);
  },

  four(c, s) {
    base(c, s, 0.2);
    block(c, -0.82, -0.78, 1.64, 1.56, 0.2, 0.9, PAL.roof, PAL.wall);
    // la gueule du four, sur la face sud : on voit le feu
    const fy = 0.78 - 0.9 * K + 0.02, fh = 0.7 * K - 0.04;
    c.fillStyle = PAL.ink; c.beginPath(); c.roundRect(-0.42, fy, 0.84, fh, [0.12, 0.12, 0, 0]); c.fill();
    if (s.act > 0.05) {
      const fl = 0.7 + 0.3 * Math.sin(s.time * 11);
      c.fillStyle = mix(PAL.hot, s.color, 0.25 * s.prog); c.globalAlpha = s.act; c.beginPath(); c.roundRect(-0.34, fy + 0.03, 0.68, fh - 0.03, [0.1, 0.1, 0, 0]); c.fill();
      c.fillStyle = PAL.glowHot; c.beginPath(); c.ellipse(0, fy + fh, 0.22 * fl, fh * 0.75 * fl, 0, Math.PI, TAU); c.fill(); c.globalAlpha = 1;
    }
    const y = -0.9 * K;
    c.fillStyle = PAL.roofLo; c.fillRect(-0.6, y - 0.55, 1.2, 0.9);
    c.strokeStyle = PAL.joint; c.lineWidth = 0.03; c.beginPath(); for (let i = 1; i < 4; i++) { c.moveTo(-0.6 + i * 0.3, y - 0.55); c.lineTo(-0.6 + i * 0.3, y + 0.35); } c.stroke();
    stack(c, 0.45, -0.4, 0.2, 0.9, 1.5, s);
  },

  four_arc(c, s) {
    base(c, s, 0.3);
    cyl(c, 0, 0.05, 1.22, 0.3, 0.95, PAL.roof, PAL.wall);
    const y = 0.05 - 0.95 * K;
    disc(c, 0, y, 0.92, PAL.wallLo); disc(c, 0, y, 0.82, PAL.ink);
    if (s.act > 0.05) { glow(c, 0, y, 0.8, '#9FD8FF', 0.5 * s.act); disc(c, 0, y, 0.3 + 0.25 * s.prog, mix('#1c2c5c', s.color, 0.7)); }
    // trois électrodes ; entre elles, l'arc
    const tips: [number, number][] = [];
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU - Math.PI / 2, x0 = Math.cos(a) * 1.25, y0 = y + Math.sin(a) * 1.25, x1 = Math.cos(a) * 0.36, y1 = y + Math.sin(a) * 0.36;
      c.strokeStyle = PAL.dark; c.lineWidth = 0.2; c.lineCap = 'butt'; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
      c.strokeStyle = PAL.steelHi; c.lineWidth = 0.05; c.beginPath(); c.moveTo(x0, y0 - 0.07); c.lineTo(x1, y1 - 0.07); c.stroke();
      tips.push([x1, y1]);
    }
    if (s.act > 0.2) {
      c.strokeStyle = '#E8F6FF'; c.lineWidth = 0.045; c.lineCap = 'round'; c.beginPath();
      const k = Math.floor(s.time * 24);
      for (let i = 0; i < 3; i++) {
        const [ax, ay] = tips[i], [bx, by] = tips[(i + 1) % 3];
        c.moveTo(ax, ay);
        for (let j = 1; j < 4; j++) { const f = j / 4, r = (Math.sin(k * 12.9 + i * 7 + j * 3.1) * 43758.5) % 1; c.lineTo(ax + (bx - ax) * f + r * 0.14, ay + (by - ay) * f - r * 0.14); }
        c.lineTo(bx, by);
      }
      c.stroke();
    }
  },

  presse(c, s) {
    base(c, s, 0.2);
    block(c, -0.8, -0.72, 1.6, 1.5, 0.2, 0.55, PAL.roofLo, PAL.wall);
    const y = -0.55 * K;
    // l'enclume et la pièce
    c.fillStyle = PAL.dark; c.fillRect(-0.5, y - 0.42, 1.0, 0.9);
    c.fillStyle = mix(PAL.dark, s.color, s.act * 0.8); c.fillRect(-0.3, y - 0.22, 0.6, 0.5);
    // le marteau : il monte lentement, tombe d'un coup
    const up = s.act > 0.05 ? (s.prog < 0.85 ? s.prog / 0.85 : 1 - (s.prog - 0.85) / 0.15) : 0.3;
    const z = 0.6 + up * 0.7, k = 0.44 + up * 0.06;
    c.fillStyle = `rgba(0,0,0,${0.35 - up * 0.2})`; c.fillRect(-k, y - k + 0.03, k * 2, k * 2);
    block(c, -k, -k + 0.03 + y + 0.55 * K, k * 2, k * 2, z - 0.3, z, PAL.steel, PAL.dark);
    c.fillStyle = PAL.signal; c.fillRect(-k, -k + 0.03 + y + 0.55 * K - z * K + k - 0.06, k * 2, 0.12);
    if (s.pulse > 0.4) ring(c, 0, y, 0.5 + (1 - s.pulse) * 0.6, 0.06, PAL.glowHot);
    for (const x of [-0.72, 0.72]) for (const yy of [-0.62, 0.66]) cyl(c, x, yy, 0.09, 0.55, 1.35, PAL.steelHi, PAL.steel);
  },

  betonniere(c, s) {
    base(c, s, 0.2);
    const W = s.w, H = s.h, horiz = W >= H;
    block(c, -W / 2 + 0.16, -H / 2 + 0.16, W - 0.32, H - 0.32, 0.2, 0.5, PAL.roofLo, PAL.wall);
    // la cuve tourne : ses bandes défilent
    const y = -0.85 * K, L = (horiz ? W : H) / 2 - 0.42, Rr = (horiz ? H : W) / 2 - 0.34;
    c.save(); c.translate(0, y); if (!horiz) c.rotate(Math.PI / 2);
    c.fillStyle = PAL.wallLo; c.beginPath(); c.roundRect(-L, -Rr + 0.14, L * 2, Rr * 2, Rr * 0.5); c.fill();
    c.fillStyle = PAL.roof; c.beginPath(); c.roundRect(-L, -Rr, L * 2, Rr * 2, Rr * 0.5); c.fill();
    c.save(); c.beginPath(); c.roundRect(-L, -Rr, L * 2, Rr * 2, Rr * 0.5); c.clip();
    c.strokeStyle = PAL.signal; c.lineWidth = 0.1;
    const off = (s.t * 0.9) % 0.5;
    c.beginPath(); for (let x = -L - 1; x < L + 1; x += 0.5) { c.moveTo(x + off, Rr); c.lineTo(x + off + 0.4, -Rr); } c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.22)'; c.fillRect(-L, -Rr, L * 2, Rr * 0.45);
    c.fillStyle = 'rgba(0,0,0,0.2)'; c.fillRect(-L, Rr * 0.5, L * 2, Rr * 0.5);
    c.restore();
    disc(c, L - 0.05, 0, Rr * 0.5, PAL.ink); disc(c, L - 0.05, 0, Rr * 0.36, mix('#3b3a36', s.color, s.act));
    c.restore();
  },

  convertisseur(c, s) {
    base(c, s, 0.3);
    block(c, -1.3, -1.25, 0.5, 2.5, 0.3, 1.3, PAL.roof, PAL.wall);
    block(c, 0.8, -1.25, 0.5, 2.5, 0.3, 1.3, PAL.roof, PAL.wall);
    // la cornue bascule entre ses deux tourillons
    const tilt = s.act > 0.05 ? Math.sin(s.prog * Math.PI) * 0.28 : 0, y = -0.9 * K + tilt;
    c.fillStyle = PAL.dark; c.fillRect(-0.9, -0.9 * K - 0.1, 1.8, 0.2);
    cyl(c, 0, y + 0.2, 0.7, 0.4, 1.0, PAL.steel, PAL.dark);
    const my = y + 0.2 - 1.0 * K;
    disc(c, 0, my, 0.5, PAL.ink);
    if (s.act > 0.05) {
      disc(c, 0, my, 0.42, mix(PAL.hot, s.color, s.prog * 0.5)); disc(c, -0.08, my - 0.08, 0.2, PAL.glowHot);
      c.fillStyle = '#FFF3C4';
      for (let i = 0; i < 9; i++) { const f = (s.time * 1.7 + i * 0.37) % 1, a = i * 2.4; c.globalAlpha = (1 - f) * s.act; c.fillRect(Math.cos(a) * f * 0.9 - 0.02, my + Math.sin(a) * f * 0.5 - f * 0.5, 0.045, 0.045); }
      c.globalAlpha = 1;
    }
    ring(c, 0, my, 0.56, 0.08, PAL.steelHi);
  },

  atelier(c, s) {
    base(c, s, 0.25);
    block(c, -1.34, -1.3, 2.68, 2.6, 0.25, 0.8, PAL.roof, PAL.wall);
    const y = -0.8 * K;
    // verrière : on voit l'établi
    c.fillStyle = PAL.ink; c.fillRect(-1.05, y - 1.02, 2.1, 2.05);
    c.fillStyle = '#20303A'; c.fillRect(-0.98, y - 0.95, 1.96, 1.91);
    const pts: [number, number][] = [[-0.6, -0.5], [0.6, -0.5], [0, 0.45]];
    pts.forEach(([x, yy], i) => { c.fillStyle = PAL.steel; c.fillRect(x - 0.24, y + yy - 0.2, 0.48, 0.4); disc(c, x, y + yy, 0.1, i === 2 ? mix('#20303A', s.color, 0.3 + 0.7 * s.prog) : PAL.steelHi); });
    // le bras va chercher, rapporte, assemble
    const ph = s.act > 0.05 ? s.t * 0.9 : 0, i0 = Math.floor(ph) % 3, f = ph % 1, e = f < 0.5 ? 2 * f * f : 1 - 2 * (1 - f) * (1 - f);
    const ax = pts[i0][0] + (pts[(i0 + 1) % 3][0] - pts[i0][0]) * e, ay = y + pts[i0][1] + (pts[(i0 + 1) % 3][1] - pts[i0][1]) * e;
    c.strokeStyle = PAL.signal; c.lineWidth = 0.1; c.lineCap = 'round'; c.beginPath(); c.moveTo(0, y - 0.95); c.lineTo(ax * 0.5, (y - 0.95 + ay) / 2 - 0.15); c.lineTo(ax, ay); c.stroke();
    disc(c, ax, ay, 0.09, PAL.white); disc(c, 0, y - 0.95, 0.12, PAL.dark);
    c.strokeStyle = 'rgba(160,220,255,0.25)'; c.lineWidth = 0.03; c.beginPath(); for (let i = 1; i < 4; i++) { c.moveTo(-0.98 + i * 0.49, y - 0.95); c.lineTo(-0.98 + i * 0.49, y + 0.96); c.moveTo(-0.98, y - 0.95 + i * 0.48); c.lineTo(0.98, y - 0.95 + i * 0.48); } c.stroke();
    for (let i = 0; i < 4; i++) disc(c, -1.2 + i * 0.12, y + 1.18, 0.035, s.act > 0.05 && Math.floor(s.time * 4 + i) % 4 === 0 ? PAL.signalHi : PAL.wallLo);
  },

  cloitre(c, s) {
    base(c, s, 0.3);
    const y = -0.3 * K;
    disc(c, 0, y, 1.3, PAL.roofLo); disc(c, 0, y, 0.98, PAL.ink);
    glow(c, 0, y, 1.0, PAL.glow, 0.35 * s.act + 0.1);
    for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU; cyl(c, Math.cos(a) * 1.14, Math.sin(a) * 1.14, 0.13, 0.3, 1.3, PAL.roofHi, PAL.wall); }
    c.save(); c.translate(0, y - 0.6 * K); c.rotate(s.t * 0.8);
    ring(c, 0, 0, 0.66, 0.12, PAL.white);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; disc(c, Math.cos(a) * 0.66, Math.sin(a) * 0.66, 0.1, PAL.roofHi); }
    c.restore();
    c.save(); c.translate(0, y - 0.9 * K); c.rotate(-s.t * 1.3); ring(c, 0, 0, 0.36, 0.07, PAL.glow); c.fillStyle = PAL.glow; c.fillRect(-0.36, -0.03, 0.72, 0.06); c.restore();
    disc(c, 0, y - 0.9 * K, 0.1 + 0.08 * s.prog, PAL.white);
  },

  bruleur(c, s) {
    base(c, s, 0.2);
    block(c, -0.82, -0.8, 1.64, 1.58, 0.2, 0.8, PAL.roofLo, PAL.wall);
    // la grille du foyer, sur la face sud
    const fy = 0.78 - 0.8 * K + 0.03, fh = 0.6 * K - 0.05;
    c.fillStyle = PAL.ink; c.fillRect(-0.6, fy, 1.2, fh);
    if (s.act > 0.03) { c.fillStyle = mix(PAL.hot, PAL.glowHot, 0.5 + 0.5 * Math.sin(s.time * 13)); c.globalAlpha = s.act; c.fillRect(-0.56, fy + 0.02, 1.12, fh - 0.02); c.globalAlpha = 1; }
    c.fillStyle = PAL.dark; for (let i = 0; i < 6; i++) c.fillRect(-0.56 + i * 0.22, fy, 0.05, fh);
    // dessus : la trappe à combustible et les flammes qu'on devine
    const y = -0.8 * K;
    disc(c, -0.25, y, 0.44, PAL.dark); disc(c, -0.25, y, 0.36, PAL.ink);
    if (s.act > 0.03) for (let i = 0; i < 4; i++) { const a = s.time * 3 + i * 1.7, r = 0.1 + 0.07 * Math.sin(a * 2.3); disc(c, -0.25 + Math.cos(a) * 0.14, y + Math.sin(a * 1.4) * 0.14, r * (0.5 + s.act), i % 2 ? PAL.hot : PAL.glowHot); }
    stack(c, 0.48, -0.42, 0.22, 0.8, 1.7, s);
    hazard(c, 0.2, y + 0.42, 0.56, 0.1);
  },

  heliostat(c, s) {
    cyl(c, 0, 0.1, 0.12, 0, 0.5, PAL.steel, PAL.dark);
    // le miroir suit le soleil
    c.save(); c.translate(0, 0.1 - 0.55 * K); c.rotate(s.aim);
    c.fillStyle = PAL.dark; c.fillRect(-0.4, -0.34, 0.84, 0.72);
    c.fillStyle = s.level > 0.05 ? mix('#1E5A80', '#9FE4FF', s.level * 0.6) : '#1A2E44'; c.fillRect(-0.4, -0.38, 0.8, 0.7);
    c.strokeStyle = 'rgba(255,255,255,0.25)'; c.lineWidth = 0.025; c.beginPath(); c.moveTo(0, -0.38); c.lineTo(0, 0.32); c.moveTo(-0.4, -0.03); c.lineTo(0.4, -0.03); c.stroke();
    if (s.level > 0.05) { const g = (s.time * 0.25 + 0.3) % 1.6 - 0.4; c.fillStyle = 'rgba(255,255,255,0.55)'; c.beginPath(); c.moveTo(-0.4 + g, 0.32); c.lineTo(-0.3 + g, 0.32); c.lineTo(-0.1 + g, -0.38); c.lineTo(-0.2 + g, -0.38); c.closePath(); c.save(); c.beginPath(); c.rect(-0.4, -0.38, 0.8, 0.7); c.clip(); c.fill(); c.restore(); }
    c.restore();
  },

  eolienne(c, s) {
    base(c, s, 0.2);
    cyl(c, 0, 0, 0.26, 0.2, 2.2, PAL.roofHi, PAL.roofLo);
    c.save(); c.translate(0, -2.3 * K); c.rotate(s.t * 2.2);
    for (let i = 0; i < 3; i++) {
      c.rotate(TAU / 3);
      c.fillStyle = PAL.white; c.beginPath(); c.moveTo(0, -0.08); c.quadraticCurveTo(0.9, -0.2, 1.75, -0.03); c.lineTo(1.75, 0.03); c.quadraticCurveTo(0.8, 0.12, 0, 0.08); c.closePath(); c.fill();
      c.fillStyle = PAL.signal; c.fillRect(1.5, -0.045, 0.25, 0.09);
    }
    c.restore();
    disc(c, 0, -2.3 * K, 0.17, PAL.steel); disc(c, 0, -2.3 * K, 0.07, PAL.signal);
  },

  turbine(c, s) {
    base(c, s, 0.2);
    const y = -0.2 * K;
    c.fillStyle = PAL.ink; c.fillRect(-0.72, y - 0.6, 1.44, 1.2);
    c.fillStyle = PAL.water[0]; c.fillRect(-0.66, y - 0.54, 1.32, 1.08);
    // les pales défilent dans le courant
    c.save(); c.beginPath(); c.rect(-0.66, y - 0.54, 1.32, 1.08); c.clip();
    const off = (s.t * 1.4) % 0.36;
    for (let x = -1; x < 1; x += 0.36) { c.fillStyle = PAL.steelHi; c.fillRect(x + off, y - 0.5, 0.1, 1.0); c.fillStyle = 'rgba(210,245,255,0.6)'; c.fillRect(x + off + 0.1, y - 0.5, 0.06, 1.0); }
    c.restore();
    block(c, -0.9, -0.2, 1.8, 0.4, 0.2, 0.7, PAL.roof, PAL.wall);
    disc(c, 0, -0.7 * K, 0.14, PAL.signal);
  },

  accu(c, s) {
    base(c, s, 0.2);
    block(c, -0.8, -0.78, 1.6, 1.56, 0.2, 0.75, PAL.roofLo, PAL.wall);
    const y = -0.75 * K;
    for (let i = 0; i < 4; i++) {
      const x = -0.62 + i * 0.33, on = s.level > (i + 0.5) / 4, part = Math.max(0, Math.min(1, s.level * 4 - i));
      c.fillStyle = PAL.ink; c.fillRect(x, y - 0.5, 0.25, 1.0);
      c.fillStyle = on ? '#4BD8FF' : '#2A6E88'; c.fillRect(x + 0.03, y + 0.47 - 0.94 * part, 0.19, 0.94 * part);
    }
    c.fillStyle = PAL.signal; c.fillRect(-0.8, 0.78 - 0.75 * K + 0.04, 1.6, 0.06);
  },

  entrepot(c, s) {
    base(c, s, 0.2);
    block(c, -0.86, -0.84, 1.72, 1.66, 0.2, 1.0, PAL.roof, PAL.wall);
    const y = -1.0 * K;
    // toit à deux pans, lanterneau, jauge
    c.fillStyle = PAL.roofHi; c.fillRect(-0.86, y - 0.84, 1.72, 0.83);
    c.fillStyle = PAL.joint; c.fillRect(-0.86, y - 0.03, 1.72, 0.06);
    c.strokeStyle = PAL.joint; c.lineWidth = 0.025; c.beginPath(); for (let i = 1; i < 6; i++) { c.moveTo(-0.86 + i * 0.287, y - 0.84); c.lineTo(-0.86 + i * 0.287, y + 0.82); } c.stroke();
    const dy = 0.82 - 1.0 * K + 0.03;
    c.fillStyle = PAL.dark; c.fillRect(-0.4, dy, 0.8, 0.8 * K - 0.04);
    c.fillStyle = PAL.steel; for (let i = 0; i < 3; i++) c.fillRect(-0.4, dy + i * 0.055, 0.8, 0.02);
    c.fillStyle = PAL.ink; c.fillRect(0.5, dy + 0.02, 0.28, 0.07); c.fillStyle = PAL.signal; c.fillRect(0.5, dy + 0.02, 0.28 * s.level, 0.07);
  },

  aiguillage(c, s) {
    cyl(c, 0, 0.02, 0.42, 0, 0.35, PAL.roofLo, PAL.wall);
    const y = 0.02 - 0.35 * K;
    disc(c, 0, y, 0.3, PAL.dark);
    c.save(); c.translate(0, y); c.rotate(s.aim);
    c.fillStyle = PAL.signal; c.beginPath(); c.moveTo(0.26, 0); c.lineTo(-0.08, -0.16); c.lineTo(-0.02, 0); c.lineTo(-0.08, 0.16); c.closePath(); c.fill();
    c.restore();
    disc(c, 0, y, 0.06, PAL.steelHi);
  },

  trieur(c, s) {
    block(c, -0.42, -0.4, 0.84, 0.84, 0, 0.35, PAL.roofLo, PAL.wall);
    const y = -0.35 * K;
    c.fillStyle = PAL.dark; c.fillRect(-0.3, y - 0.28, 0.6, 0.6);
    c.save(); c.translate(0, y + 0.02); c.rotate(s.rot * Math.PI / 2);
    c.fillStyle = PAL.steelHi; c.fillRect(-0.02, -0.26, 0.04, 0.52); c.fillRect(-0.24, -0.02, 0.5, 0.04);
    c.restore();
    disc(c, 0, y + 0.02, 0.17, PAL.ink);
    c.fillStyle = s.mark ?? PAL.wallLo; c.beginPath(); c.moveTo(0, y - 0.11); c.lineTo(0.13, y + 0.02); c.lineTo(0, y + 0.15); c.lineTo(-0.13, y + 0.02); c.closePath(); c.fill();
  },

  pont(c, s) {
    // une rampe : elle monte à l'entrée, descend à la sortie
    c.save(); c.rotate(s.rot * Math.PI / 2);
    c.fillStyle = PAL.wallLo; c.fillRect(-0.5, -0.42, 1, 0.84);
    c.fillStyle = PAL.roof; c.fillRect(-0.5, -0.42, 1, 0.14); c.fillRect(-0.5, 0.28, 1, 0.14);
    const g = c.createLinearGradient(-0.5, 0, 0.5, 0);
    g.addColorStop(s.flag ? 1 : 0, PAL.dark); g.addColorStop(s.flag ? 0 : 1, PAL.steel);
    c.fillStyle = g; c.fillRect(-0.5, -0.28, 1, 0.56);
    c.fillStyle = PAL.signal; c.beginPath(); c.moveTo(-0.12, -0.16); c.lineTo(0.16, 0); c.lineTo(-0.12, 0.16); c.closePath(); c.fill();
    c.restore();
  },

  lampadaire(c, s) {
    cyl(c, 0, 0.12, 0.09, 0, 1.1, PAL.steelHi, PAL.steel);
    const y = 0.12 - 1.15 * K;
    c.fillStyle = PAL.dark; c.fillRect(-0.3, y - 0.07, 0.6, 0.14);
    for (const x of [-0.26, 0.26]) disc(c, x, y, 0.1, s.night > 0.15 ? PAL.glowHot : PAL.roofHi);
  },
};
S.foreuse = (c, s) => {
  S.puits(c, s);
  cyl(c, 0, -0.1 - 0.3 * K, 0.34, 0.75, 1.5, PAL.steel, PAL.dark);
  hazard(c, -0.34, -0.1 - 0.3 * K - 1.5 * K - 0.05, 0.68, 0.1);
  disc(c, 0, -0.1 - 0.3 * K - 1.5 * K, 0.14, s.act > 0.3 ? PAL.signalHi : PAL.dark);
};

export function drawSprite(c: Ctx, key: string, s: SpriteState): void {
  const draw = S[key];
  if (draw) {
    draw(c, s);
    return;
  }
  const height = B[key]?.height ?? 0.6;
  block(c, -s.w / 2 + 0.04, -s.h / 2 + 0.04, s.w - 0.08, s.h - 0.08, 0, height, PAL.roofHi, PAL.wallLo);
}

/** Icône d'un bâtiment pour l'interface (image mise en cache). */
const iconCache = new Map<string, string>();
export function buildingIcon(key: string): string {
  let url = iconCache.get(key);
  if (url) return url;
  const def = B[key], size = 96;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const c = cv.getContext('2d')!;
  const span = Math.max(def.w, def.h, 1) + def.height * K * 2 + 0.25;
  c.translate(size / 2, size / 2 + (def.height * K * size) / span / 2);
  c.scale(size / span, size / span);
  if (key === 'convoyeur') {
    c.fillStyle = PAL.steelHi; c.fillRect(-0.6, -0.42, 1.2, 0.84);
    c.fillStyle = PAL.dark; c.fillRect(-0.6, -0.34, 1.2, 0.68);
    c.fillStyle = PAL.steel; for (let x = -0.55; x < 0.6; x += 0.2) c.fillRect(x, -0.3, 0.07, 0.6);
    for (const [x, col] of [[-0.3, '#D4552B'], [0.25, '#C3CAD6']] as [number, string][]) { c.fillStyle = col; c.beginPath(); c.arc(x, 0, 0.17, 0, TAU); c.fill(); }
  } else if (key === 'dalle') {
    c.fillStyle = PAL.wallLo; c.fillRect(-0.5, -0.36, 1, 1); c.fillStyle = PAL.roof; c.fillRect(-0.5, -0.5, 1, 1);
    c.fillStyle = PAL.joint; c.fillRect(-0.015, -0.5, 0.03, 1); c.fillRect(-0.5, -0.015, 1, 0.03);
  } else drawSprite(c, key, { ...IDLE, w: def.w, h: def.h, act: 0.8, prog: 0.7, t: 0.6, time: 0.4, level: key === 'tour' ? 2 : 0.7, plinth: plinthOf(key), color: key === 'puits' || key === 'foreuse' ? '#D4552B' : '#C3CAD6' });
  url = cv.toDataURL();
  iconCache.set(key, url);
  return url;
}

// ---------------------------------------------------------------------- arbres
/** Planches d'arbres pré-dessinées : feuillus, palmes, et un arbre à fleurs, plus rare. */
const TREE = 128;
let treeAtlas: HTMLCanvasElement[] | null = null;
export function trees(): HTMLCanvasElement[] {
  if (treeAtlas) return treeAtlas;
  treeAtlas = [];
  const rnd = (i: number, k: number) => { const v = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return v - Math.floor(v); };
  for (let v = 0; v < 8; v++) {
    const cv = document.createElement('canvas'); cv.width = cv.height = TREE;
    const c = cv.getContext('2d')!;
    c.translate(TREE / 2, TREE / 2); c.scale(TREE / 2.4, TREE / 2.4);   // l'arbre tient dans un cercle de rayon 1,2
    const L = PAL.leaf;
    if (v < 5) {
      // feuillu : des touffes qui se chevauchent, du plus sombre (bas, sud) au plus clair (haut, nord-ouest)
      const n = 7 + (v % 3);
      for (let layer = 0; layer < 4; layer++) {
        c.fillStyle = v === 4 && layer === 3 ? PAL.bloom : L[layer + (v % 2)];
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU + rnd(v, i) * 0.8, d = (0.62 - layer * 0.15) * (0.75 + rnd(v + 9, i) * 0.4);
          const r = (0.42 - layer * 0.07) * (0.8 + rnd(v + 3, i) * 0.4);
          if (v === 4 && layer === 3 && i % 2) continue;
          c.beginPath(); c.arc(Math.cos(a) * d - layer * 0.07, Math.sin(a) * d - layer * 0.09, v === 4 && layer === 3 ? r * 0.35 : r, 0, TAU); c.fill();
        }
        if (layer < 3) { c.beginPath(); c.arc(-layer * 0.07, -layer * 0.09, 0.5 - layer * 0.12, 0, TAU); c.fill(); }
      }
    } else {
      // palme : des frondes en étoile, une nervure claire
      const n = 9 + (v - 5) * 2;
      for (let layer = 0; layer < 2; layer++) for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + rnd(v, i) * 0.3 + layer * 0.3, len = (1.08 - layer * 0.3) * (0.85 + rnd(v + 5, i) * 0.2), c1 = Math.cos(a), s1 = Math.sin(a), wd = 0.2 - layer * 0.04;
        c.fillStyle = L[1 + layer * 2 - (i % 2 && !layer ? 1 : 0)];
        c.beginPath(); c.moveTo(0, 0);
        c.quadraticCurveTo(c1 * len * 0.5 - s1 * wd, s1 * len * 0.5 + c1 * wd, c1 * len, s1 * len);
        c.quadraticCurveTo(c1 * len * 0.5 + s1 * wd, s1 * len * 0.5 - c1 * wd, 0, 0); c.fill();
        c.strokeStyle = L[4]; c.globalAlpha = 0.5; c.lineWidth = 0.02; c.beginPath(); c.moveTo(0, 0); c.lineTo(c1 * len * 0.9, s1 * len * 0.9); c.stroke(); c.globalAlpha = 1;
      }
      c.fillStyle = PAL.trunk; c.beginPath(); c.arc(0, 0, 0.1, 0, TAU); c.fill();
      c.fillStyle = v === 7 ? PAL.glow : '#C9A45A'; for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(Math.cos(i * 2.1) * 0.13, Math.sin(i * 2.1) * 0.13, 0.055, 0, TAU); c.fill(); }
    }
    treeAtlas.push(cv);
  }
  return treeAtlas;
}

// ------------------------------------------------------------------ bâtisseur
export interface Critter {
  x: number; y: number; fx: number; fy: number;   // position, direction du regard
  walk: number;        // phase de marche
  speed: number;       // 0..1
  color: string;
  swing: number;       // 0..1 : coup de pioche en cours
  lean: number;        // inertie des antennes
  blink: number;
}

/** Le bâtisseur : une petite créature d'os clair, un œil, deux antennes qui traînent derrière elle. */
export function drawCritter(c: Ctx, p: Critter, time: number, night: number): void {
  const bob = Math.sin(p.walk * 2) * 0.035 * p.speed, hop = Math.abs(Math.sin(p.walk)) * 0.07 * p.speed;
  c.fillStyle = 'rgba(16,14,48,0.32)'; c.beginPath(); c.ellipse(p.x + 0.05, p.y + 0.2, 0.3 - hop * 0.5, 0.15, 0, 0, TAU); c.fill();
  c.save(); c.translate(p.x, p.y - 0.12 - hop);
  // pieds : ils alternent dans le sens de la marche
  const px = -p.fy, py = p.fx;
  for (const sd of [-1, 1]) {
    const st = Math.sin(p.walk + (sd > 0 ? Math.PI : 0)) * 0.13 * p.speed;
    c.fillStyle = PAL.dark; c.beginPath(); c.ellipse(px * 0.15 * sd + p.fx * st, 0.27 + hop + py * 0.06 * sd + p.fy * st * 0.6, 0.1, 0.065, 0, 0, TAU); c.fill();
  }
  // corps : une goutte qui s'écrase et s'étire en marchant
  const sx = 1 + bob, sy = 1 - bob;
  c.fillStyle = PAL.wall; c.beginPath(); c.ellipse(0, 0.05, 0.27 * sx, 0.3 * sy, 0, 0, TAU); c.fill();
  c.fillStyle = PAL.white; c.beginPath(); c.ellipse(0, 0, 0.27 * sx, 0.3 * sy, 0, 0, TAU); c.fill();
  c.fillStyle = p.color; c.beginPath(); c.ellipse(0, 0.17, 0.2 * sx, 0.1 * sy, 0, 0, Math.PI); c.fill();
  // antennes
  for (const sd of [-1, 1]) {
    const bx = sd * 0.12, tx = sd * 0.2 - p.fx * (0.1 + p.lean * 0.25) + Math.sin(time * 3 + sd) * 0.02, ty = -0.52 - p.fy * (0.06 + p.lean * 0.15) + Math.cos(time * 2.3 + sd) * 0.02;
    c.strokeStyle = PAL.white; c.lineWidth = 0.05; c.lineCap = 'round';
    c.beginPath(); c.moveTo(bx, -0.24); c.quadraticCurveTo(bx + sd * 0.05, -0.42, tx, ty); c.stroke();
    c.fillStyle = p.color; c.beginPath(); c.arc(tx, ty, 0.065, 0, TAU); c.fill();
    if (night > 0.2) { c.globalAlpha = night; c.fillStyle = PAL.white; c.beginPath(); c.arc(tx, ty, 0.03, 0, TAU); c.fill(); c.globalAlpha = 1; }
  }
  // l'œil regarde où l'on va
  const ex = p.fx * 0.07, ey = -0.04 + p.fy * 0.06;
  if (p.blink > 0.92) { c.strokeStyle = PAL.ink; c.lineWidth = 0.04; c.beginPath(); c.moveTo(ex - 0.11, ey); c.lineTo(ex + 0.11, ey); c.stroke(); }
  else {
    c.fillStyle = PAL.ink; c.beginPath(); c.arc(ex, ey, 0.13, 0, TAU); c.fill();
    c.fillStyle = p.color; c.beginPath(); c.arc(ex + p.fx * 0.035, ey + p.fy * 0.035, 0.075, 0, TAU); c.fill();
    c.fillStyle = PAL.white; c.beginPath(); c.arc(ex + p.fx * 0.035 - 0.03, ey + p.fy * 0.035 - 0.035, 0.028, 0, TAU); c.fill();
  }
  // la pioche, le temps d'un coup
  if (p.swing > 0) {
    const a = Math.atan2(p.fy, p.fx) + (0.9 - Math.sin(p.swing * Math.PI) * 1.7);
    c.save(); c.translate(p.fx * 0.2, p.fy * 0.15); c.rotate(a);
    c.strokeStyle = PAL.trunk; c.lineWidth = 0.055; c.beginPath(); c.moveTo(0, 0); c.lineTo(0.5, 0); c.stroke();
    c.strokeStyle = PAL.steelHi; c.lineWidth = 0.07; c.beginPath(); c.moveTo(0.46, -0.17); c.quadraticCurveTo(0.58, 0, 0.46, 0.17); c.stroke();
    c.restore();
  }
  c.restore();
}
