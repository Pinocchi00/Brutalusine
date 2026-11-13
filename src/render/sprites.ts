// Bâtiments : dessinés en vectoriel, en unités de case, centrés sur l'origine, orientés vers l'est.
// Un seul langage de formes : os clair, arêtes sable, cours indigo, cœur de la couleur du flux.

import { PAL } from './terrain';

export interface SpriteState {
  anim: number;        // phase d'animation continue
  active: boolean;     // en marche
  progress: number;    // 0..1 du cycle en cours
  color: string;       // couleur du flux produit
  level: number;       // étages (Tour) ou charge 0..1 (accumulateur), lumière (héliostat), santé (arbre)
  night: number;       // 0..1
  mark: string | null; // couleur du filtre (aiguillage)
  flag: boolean;       // sortie de pont
}

export const IDLE_STATE: SpriteState = { anim: 0, active: false, progress: 0, color: PAL.gold, level: 0, night: 0, mark: null, flag: false };

type Ctx = CanvasRenderingContext2D;
const TAU = Math.PI * 2;

function disc(c: Ctx, x: number, y: number, r: number, fill: string): void {
  c.fillStyle = fill; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
}
function ring(c: Ctx, x: number, y: number, r: number, w: number, stroke: string): void {
  c.strokeStyle = stroke; c.lineWidth = w; c.beginPath(); c.arc(x, y, r, 0, TAU); c.stroke();
}
function box(c: Ctx, x: number, y: number, w: number, h: number, fill: string, r = 0.08): void {
  c.fillStyle = fill; c.beginPath(); c.roundRect(x, y, w, h, r); c.fill();
}
/** Petit chevron indiquant la sortie, sur le bord est. */
function port(c: Ctx, x: number, col: string): void {
  c.fillStyle = col;
  c.beginPath(); c.moveTo(x - 0.16, -0.16); c.lineTo(x + 0.04, 0); c.lineTo(x - 0.16, 0.16); c.closePath(); c.fill();
}

const S: Record<string, (c: Ctx, s: SpriteState) => void> = {
  tour(c, s) {
    // pyramide à degrés vue du dessus : chaque quota ajoute un étage
    const n = Math.min(9, 3 + s.level);
    for (let i = 0; i < n; i++) {
      const k = 1.44 * (1 - i / (n + 0.9));
      c.fillStyle = 'rgba(46,28,112,0.22)'; c.fillRect(-k + 0.05, -k + 0.08, k * 2, k * 2);
      box(c, -k, -k, k * 2, k * 2, i % 2 ? PAL.boneLight : PAL.bone, 0.03);
      c.strokeStyle = PAL.edgeDark; c.lineWidth = 0.045; c.strokeRect(-k, -k, k * 2, k * 2);
    }
    const pulse = 0.5 + 0.5 * Math.sin(s.anim * 2);
    disc(c, 0, 0, 0.34, PAL.ink);
    disc(c, 0, 0, 0.27, PAL.gold);
    disc(c, 0, 0, 0.12 + 0.06 * pulse, '#FFF1C9');
  },
  puits(c, s) {
    disc(c, 0, 0, 1.46, PAL.bone);
    ring(c, 0, 0, 1.43, 0.06, PAL.edge);
    disc(c, 0, 0, 1.28, '#B95A3E');
    disc(c, 0, 0, 1.02, '#A94F37');
    disc(c, 0, 0, 0.76, '#8E3F2D');
    disc(c, 0, 0, 0.5, '#5E2A14');
    c.save(); c.rotate(s.anim * 0.9);
    c.strokeStyle = PAL.boneLight; c.lineWidth = 0.13; c.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU;
      c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(a) * 1.08, Math.sin(a) * 1.08); c.stroke();
      disc(c, Math.cos(a) * 1.08, Math.sin(a) * 1.08, 0.11, PAL.boneLight);
    }
    c.restore();
    disc(c, 0, 0, 0.3, PAL.boneLight);
    disc(c, 0, 0, 0.19, s.color);
    if (s.active) disc(c, 0, 0, 0.09, '#FFF1C9');
    port(c, 1.5, PAL.shadow);
  },
  scierie(c, s) {
    disc(c, 0, 0, 0.96, PAL.bone);
    ring(c, 0, 0, 0.93, 0.05, PAL.edge);
    disc(c, 0, 0, 0.74, PAL.indigoDark);
    c.save(); c.rotate(s.anim * 3);
    c.fillStyle = PAL.edge;
    c.beginPath();
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * TAU;
      c.lineTo(Math.cos(a) * 0.66, Math.sin(a) * 0.66);
      c.lineTo(Math.cos(a + 0.26) * 0.5, Math.sin(a + 0.26) * 0.5);
    }
    c.closePath(); c.fill();
    c.restore();
    disc(c, 0, 0, 0.2, PAL.boneLight);
    disc(c, 0, 0, 0.1, s.active ? '#B9F24A' : PAL.edgeDark);
    port(c, 1.0, PAL.shadow);
  },
  four(c, s) {
    box(c, -1.44, -0.94, 2.88, 1.88, PAL.bone, 0.1);
    c.strokeStyle = PAL.edge; c.lineWidth = 0.05; c.beginPath(); c.roundRect(-1.44, -0.94, 2.88, 1.88, 0.1); c.stroke();
    box(c, -1.3, -0.8, 0.5, 1.6, PAL.boneDim, 0.06);
    disc(c, -1.05, 0, 0.2, PAL.ink);
    // trois canaux ouverts : la matière en fusion s'y voit couler
    for (let i = -1; i <= 1; i++) {
      const y = i * 0.5 - 0.11;
      box(c, -0.62, y, 1.86, 0.22, '#3A1E3A', 0.1);
      if (s.active) {
        const len = 1.86 * Math.max(0.08, s.progress);
        const g = c.createLinearGradient(-0.62, 0, -0.62 + len, 0);
        g.addColorStop(0, '#FF5A1F'); g.addColorStop(1, s.color);
        c.fillStyle = g; c.beginPath(); c.roundRect(-0.62, y, len, 0.22, 0.1); c.fill();
        disc(c, -0.62 + len, y + 0.11, 0.08, '#FFF1C9');
      }
    }
    port(c, 1.48, PAL.shadow);
  },
  cloitre(c, s) {
    disc(c, 0, 0, 1.46, PAL.bone);
    ring(c, 0, 0, 1.43, 0.06, PAL.edge);
    ring(c, 0, 0, 1.16, 0.04, PAL.edge);
    disc(c, 0, 0, 0.98, '#2A2468');
    ring(c, 0, 0, 0.98, 0.07, PAL.boneLight);
    c.fillStyle = '#4A47A8';
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; c.beginPath(); c.arc(Math.cos(a) * 0.8, Math.sin(a) * 0.8, 0.03, 0, TAU); c.fill(); }
    c.save(); c.rotate(s.anim * 1.4);
    c.strokeStyle = PAL.boneLight; c.lineWidth = 0.12; c.lineCap = 'round';
    c.beginPath(); c.moveTo(-0.72, 0); c.lineTo(0.72, 0); c.stroke();
    disc(c, 0.72, 0, 0.1, PAL.glow); disc(c, -0.72, 0, 0.1, PAL.glow);
    c.restore();
    disc(c, 0, 0, 0.2, PAL.boneLight);
    if (s.active) disc(c, 0, 0, 0.11, s.color);
    port(c, 1.5, PAL.shadow);
  },
  aiguillage(c, s) {
    c.fillStyle = PAL.bone; c.beginPath();
    c.moveTo(0, -0.47); c.lineTo(0.47, 0); c.lineTo(0, 0.47); c.lineTo(-0.47, 0); c.closePath(); c.fill();
    c.strokeStyle = PAL.edge; c.lineWidth = 0.05; c.stroke();
    c.strokeStyle = PAL.shadow; c.lineWidth = 0.07; c.lineCap = 'round';
    c.beginPath();
    c.moveTo(-0.22, 0); c.lineTo(0.24, 0); c.moveTo(0, 0); c.lineTo(0, -0.24); c.moveTo(0, 0); c.lineTo(0, 0.24);
    c.stroke();
    if (s.mark) { disc(c, 0, 0, 0.15, PAL.ink); disc(c, 0, 0, 0.1, s.mark); }
  },
  pont(c, s) {
    box(c, -0.46, -0.4, 0.92, 0.8, PAL.bone, 0.1);
    c.strokeStyle = PAL.edge; c.lineWidth = 0.05; c.beginPath(); c.roundRect(-0.46, -0.4, 0.92, 0.8, 0.1); c.stroke();
    c.fillStyle = PAL.shadow;
    const d = s.flag ? -1 : 1;   // la flèche monte à l'entrée, descend à la sortie
    c.beginPath(); c.moveTo(-0.16 * d, -0.2); c.lineTo(0.2 * d, 0); c.lineTo(-0.16 * d, 0.2); c.closePath(); c.fill();
    box(c, s.flag ? -0.46 : 0.3, -0.3, 0.16, 0.6, PAL.boneLight, 0.04);
  },
  amphi(c, s) {
    disc(c, 0, 0, 0.97, PAL.bone);
    for (let i = 0; i < 4; i++) ring(c, 0, 0, 0.9 - i * 0.16, 0.035, PAL.edge);
    disc(c, 0, 0, 0.36, PAL.ink);
    const flick = 0.75 + 0.25 * Math.sin(s.anim * 9);
    if (s.active) { disc(c, 0, 0, 0.3 * flick, '#FF5A1F'); disc(c, 0, 0, 0.17 * flick, '#FFC24A'); }
    else disc(c, 0, 0, 0.14, '#5E2A14');
  },
  heliostat(c, s) {
    box(c, -0.42, -0.42, 0.84, 0.84, PAL.bone, 0.06);
    box(c, -0.33, -0.33, 0.66, 0.66, s.level > 0.05 ? '#1E6A8C' : '#1A3A5C', 0.03);
    c.strokeStyle = s.level > 0.05 ? PAL.glow : '#3A6A8C'; c.lineWidth = 0.05; c.lineCap = 'round';
    c.beginPath(); c.moveTo(-0.22, 0.12); c.lineTo(0.12, -0.22); c.moveTo(-0.05, 0.2); c.lineTo(0.2, -0.05); c.stroke();
  },
  pompe(c, s) {
    disc(c, 0, 0, 0.96, PAL.bone);
    ring(c, 0, 0, 0.93, 0.05, PAL.edge);
    disc(c, 0, 0, 0.62, '#1A4A63');
    c.save(); c.rotate(s.anim * 2);
    c.strokeStyle = '#7FF0E0'; c.lineWidth = 0.09; c.lineCap = 'round';
    for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU; c.beginPath(); c.moveTo(Math.cos(a) * 0.15, Math.sin(a) * 0.15); c.lineTo(Math.cos(a) * 0.46, Math.sin(a) * 0.46); c.stroke(); }
    c.restore();
    disc(c, 0, 0, 0.13, PAL.boneLight);
    port(c, 1.0, PAL.shadow);
  },
  epurateur(c, s) {
    box(c, -0.95, -0.95, 1.9, 1.9, PAL.bone, 0.12);
    c.strokeStyle = PAL.edge; c.lineWidth = 0.05; c.beginPath(); c.roundRect(-0.95, -0.95, 1.9, 1.9, 0.12); c.stroke();
    for (const [x, y] of [[-0.42, -0.42], [0.42, -0.42], [-0.42, 0.42]]) { disc(c, x, y, 0.3, PAL.boneDim); disc(c, x, y, 0.2, PAL.ink); }
    disc(c, 0.42, 0.42, 0.3, PAL.ink);
    disc(c, 0.42, 0.42, 0.2, s.active ? '#E6F24A' : '#6B6E2A');
    port(c, 1.0, PAL.shadow);
  },
  accu(c, s) {
    disc(c, 0, 0, 0.95, PAL.bone);
    ring(c, 0, 0, 0.92, 0.05, PAL.edge);
    disc(c, 0, 0, 0.7, PAL.ink);
    c.strokeStyle = '#3FD0FF'; c.lineWidth = 0.2; c.lineCap = 'butt';
    c.beginPath(); c.arc(0, 0, 0.5, -Math.PI / 2, -Math.PI / 2 + TAU * Math.max(0.001, s.level)); c.stroke();
    disc(c, 0, 0, 0.2, PAL.boneLight);
  },
  eventail(c, s) {
    const h = s.level;
    c.fillStyle = h > 0.35 ? '#2FB08C' : '#3F7F78';
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * TAU + Math.sin(s.anim * 0.6 + i) * 0.04, c1 = Math.cos(a), s1 = Math.sin(a), L = 1.42;
      c.beginPath(); c.moveTo(0, 0);
      c.quadraticCurveTo(c1 * L * 0.55 - s1 * 0.3, s1 * L * 0.55 + c1 * 0.3, c1 * L, s1 * L);
      c.quadraticCurveTo(c1 * L * 0.55 + s1 * 0.3, s1 * L * 0.55 - c1 * 0.3, 0, 0);
      c.fill();
    }
    c.strokeStyle = h > 0.35 ? PAL.palm : '#5FA89C'; c.lineWidth = 0.035; c.beginPath();
    for (let i = 0; i < 11; i++) { const a = (i / 11) * TAU; c.moveTo(0, 0); c.lineTo(Math.cos(a) * 1.3, Math.sin(a) * 1.3); }
    c.stroke();
    // le cœur bat au rythme de la santé de la jungle
    const beat = 0.5 + 0.5 * Math.sin(s.anim * (1 + 2.2 * h));
    disc(c, 0, 0, 0.34, '#0F4C4E');
    disc(c, 0, 0, 0.16 + 0.1 * beat * h, h > 0.05 ? PAL.glow : '#4A7A78');
  },
  cerclage(c, s) {
    S.eventail(c, s);
    ring(c, 0, 0, 1.36, 0.2, PAL.bone);
    ring(c, 0, 0, 1.46, 0.04, PAL.edge);
    ring(c, 0, 0, 1.26, 0.04, PAL.edge);
    for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + 0.785; disc(c, Math.cos(a) * 1.36, Math.sin(a) * 1.36, 0.07, PAL.shadow); }
    port(c, 1.5, PAL.shadow);
  },
};

export function drawSprite(c: Ctx, key: string, s: SpriteState): void {
  const fn = S[key];
  if (fn) fn(c, s);
}

/** Icône d'un bâtiment pour l'interface (image mise en cache). */
const iconCache = new Map<string, string>();
export function buildingIcon(key: string, w: number, h: number): string {
  let url = iconCache.get(key);
  if (url) return url;
  const size = 72;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const c = cv.getContext('2d')!;
  const span = Math.max(w, h, 1.2);
  c.translate(size / 2, size / 2);
  const k = (size * 0.86) / span;
  c.scale(k, k);
  if (key === 'convoyeur') {
    c.strokeStyle = PAL.belt; c.lineWidth = 0.62; c.lineCap = 'butt';
    c.beginPath(); c.moveTo(-0.6, 0); c.lineTo(0.6, 0); c.stroke();
    for (const [x, col] of [[-0.36, '#FF5A1F'], [0, '#FFC24A'], [0.36, '#3FD0FF']] as [number, string][]) disc(c, x, 0, 0.13, col);
  } else if (key === 'dalle') {
    box(c, -0.5, -0.5, 1, 1, PAL.bone, 0.02);
    c.strokeStyle = PAL.edge; c.lineWidth = 0.05; c.strokeRect(-0.5, -0.5, 1, 1);
    c.beginPath(); c.moveTo(0, -0.5); c.lineTo(0, 0.5); c.moveTo(-0.5, 0); c.lineTo(0.5, 0); c.stroke();
  } else drawSprite(c, key, { ...IDLE_STATE, level: key === 'eventail' || key === 'cerclage' ? 1 : key === 'accu' ? 0.7 : 0, active: key === 'four' || key === 'amphi', progress: 0.7 });
  url = cv.toDataURL();
  iconCache.set(key, url);
  return url;
}
