// Terrain : chaque bloc de 32×32 cases est peint une fois dans un canevas hors écran,
// puis repeint seulement quand il change (dalle posée, gisement épuisé, débris ramassé).
// Les arbres n'en font pas partie : ils bougent, ils sont dessinés à chaque image.

import { hash01, hash2 } from '../sim/rng';
import { CHUNK, GROUND_WATER, type Chunk, type World } from '../sim/world';
import { DEPOSITS } from '../sim/data';

export const PX = 24;   // pixels par case dans le cache

export const PAL = {
  // béton
  roof: '#D6D1C6', roofHi: '#E9E5DC', roofLo: '#BDB8AC', wall: '#8E897E', wallLo: '#6C685F', joint: '#A8A398',
  // acier et signal
  steel: '#555B66', steelHi: '#7C838F', dark: '#25272D', ink: '#14161A',
  signal: '#F08A24', signalHi: '#FFB45E', hot: '#FF5A1F', glowHot: '#FFD27A',
  // monde
  moss: ['#1D4A3B', '#1C4839', '#1E4C3D', '#1B4638'], earth: ['#7A6248', '#776046', '#7D654A', '#755E45'],
  sand: '#C9B98C', water: ['#16506A', '#184F6B', '#145067'], shallow: '#2A7A8C', ripple: '#6FC3CF',
  rock: '#5E5A53', rockLo: '#45423D', rockHi: '#7A766D',
  leaf: ['#0E5743', '#157052', '#1F8A60', '#39A873', '#63C98A'], trunk: '#4B3524', bloom: '#F0559A',
  shadow: 'rgba(16,14,48,', glow: '#7FF0D2', white: '#FBF7EE',
};

export interface TerrainEntry {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  version: number;
  sig?: number;
  frame: number;
  used: number;
}

export function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t);
  const g = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t);
  const bl = Math.round((pa & 255) * (1 - t) + (pb & 255) * t);
  return `rgb(${r},${g},${bl})`;
}

type Ctx = CanvasRenderingContext2D;
const TAU = Math.PI * 2;

export class TerrainCache {
  private map = new Map<Chunk, TerrainEntry>();
  private budget = 0;

  beginFrame(frame = 0): void {
    this.budget = 2;
    if (frame % 240 === 0) for (const [c, e] of this.map) if (frame - e.used > 600) this.map.delete(c);
  }

  get(c: Chunk, world: World, frame: number): TerrainEntry | null {
    let e = this.map.get(c);
    if (!e) {
      if (this.budget <= 0 && frame > 2) return null;
      const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(CHUNK * PX, CHUNK * PX) : Object.assign(document.createElement('canvas'), { width: CHUNK * PX, height: CHUNK * PX });
      e = { canvas, version: -1, frame: 0, used: frame };
      this.map.set(c, e);
    }
    e.used = frame;
    if (e.sig !== sig(c)) {
      if (e.version < 0 || this.budget > 0 || c.urgent) {
        this.budget--;
        this.paint(e, c, world);
        e.sig = sig(c); e.version = 1; e.frame = frame; c.urgent = false;
      }
    }
    return e;
  }

  clear(): void { this.map.clear(); }

  private paint(e: TerrainEntry, c: Chunk, world: World): void {
    const ctx = e.canvas.getContext('2d') as Ctx;
    ctx.setTransform(PX, 0, 0, PX, 0, 0);
    const seed = world.seed;
    const bx = c.cx * CHUNK, by = c.cy * CHUNK;
    const idx = (x: number, y: number) => (((by + y) & 31) << 5) | ((bx + x) & 31);
    const nb = (x: number, y: number): Chunk | null => (x >= 0 && x < CHUNK && y >= 0 && y < CHUNK ? c : world.at(bx + x, by + y, false));
    const water = (x: number, y: number) => { const o = nb(x, y); return !!o && o.ground[idx(x, y)] === GROUND_WATER; };
    const slab = (x: number, y: number) => { const o = nb(x, y); return !!o && o.slab[idx(x, y)] === 1; };

    // --- 1. sol : terre dans les clairières, mousse sous la forêt (demi-cases pour casser la grille)
    for (let ly = 0; ly < CHUNK * 2; ly++) for (let lx = 0; lx < CHUNK * 2; lx++) {
      const wx = bx + lx / 2, wy = by + ly / 2;
      const h = hash2(bx * 2 + lx, by * 2 + ly, seed);
      const t = Math.max(0, Math.min(1, (world.density(wx, wy) - 0.12) / 0.45));
      ctx.fillStyle = mix(PAL.earth[h % 7 === 0 ? 1 : 0], PAL.moss[(h >>> 4) % 7 === 0 ? 1 : 0], t);
      ctx.fillRect(lx / 2, ly / 2, 0.52, 0.52);
    }
    // taches et brins d'herbe (une case de marge pour raccorder les blocs voisins)
    for (let ly = -1; ly <= CHUNK; ly++) for (let lx = -1; lx <= CHUNK; lx++) {
      const wx = bx + lx, wy = by + ly;
      const h = hash01(wx, wy, seed + 3), h2 = hash01(wx, wy, seed + 4);
      const t = Math.max(0, Math.min(1, (world.density(wx, wy) - 0.12) / 0.45));
      if (h < 0.3) {
        ctx.fillStyle = t > 0.5 ? 'rgba(10,40,30,0.28)' : 'rgba(60,44,30,0.22)';
        ctx.beginPath(); ctx.ellipse(lx + h2, ly + h * 3, 0.5 + h2 * 0.7, 0.3 + h * 0.8, h2 * 3, 0, TAU); ctx.fill();
      } else if (h > 0.72) {
        ctx.strokeStyle = t > 0.4 ? 'rgba(80,180,120,0.5)' : 'rgba(170,150,100,0.45)';
        ctx.lineWidth = 0.04; ctx.lineCap = 'round';
        ctx.beginPath();
        for (let k = 0; k < 3; k++) { const ox = lx + h2 + k * 0.09, oy = ly + (h - 0.72) * 3; ctx.moveTo(ox, oy); ctx.lineTo(ox + (k - 1) * 0.07, oy - 0.16); }
        ctx.stroke();
      }
    }

    // --- 2. rivage : sable sur la terre au bord de l'eau, puis l'eau aux bords arrondis
    ctx.fillStyle = PAL.sand;
    for (let ly = -1; ly <= CHUNK; ly++) for (let lx = -1; lx <= CHUNK; lx++) {
      if (water(lx, ly)) continue;
      if (!(water(lx + 1, ly) || water(lx - 1, ly) || water(lx, ly + 1) || water(lx, ly - 1))) continue;
      ctx.beginPath(); ctx.arc(lx + 0.5, ly + 0.5, 0.78, 0, TAU); ctx.fill();
    }
    for (let pass = 0; pass < 2; pass++) for (let ly = -1; ly <= CHUNK; ly++) for (let lx = -1; lx <= CHUNK; lx++) {
      if (!water(lx, ly)) continue;
      const edge = !(water(lx + 1, ly) && water(lx - 1, ly) && water(lx, ly + 1) && water(lx, ly - 1));
      if (pass === 0) { ctx.fillStyle = PAL.shallow; ctx.beginPath(); ctx.arc(lx + 0.5, ly + 0.5, 0.74, 0, TAU); ctx.fill(); }
      else if (!edge) { ctx.fillStyle = PAL.water[hash2(bx + lx, by + ly, seed) % 3]; ctx.beginPath(); ctx.arc(lx + 0.5, ly + 0.5, 0.8, 0, TAU); ctx.fill(); }
    }

    // --- 3. gisements : un socle de roche, des éclats de la couleur du minerai
    for (let pass = 0; pass < 2; pass++) for (let ly = 0; ly < CHUNK; ly++) for (let lx = 0; lx < CHUNK; lx++) {
      const i = (ly << 5) | lx, t = c.deposit[i];
      if (!t || c.slab[i]) continue;
      const wx = bx + lx, wy = by + ly;
      const h = hash01(wx, wy, seed + 11);
      if (pass === 0) {
        ctx.fillStyle = PAL.rockLo; blob(ctx, lx + 0.54, ly + 0.58, 0.66, h, 7);
        ctx.fillStyle = PAL.rock; blob(ctx, lx + 0.5, ly + 0.5, 0.62, h, 7);
        continue;
      }
      const col = DEPOSITS[t]!.color;
      const rich = Math.min(1, c.amount[i] / 800);
      const n = 2 + Math.round(rich * 2);
      for (let k = 0; k < n; k++) {
        const a = h * TAU + k * 2.4, d = 0.1 + 0.2 * hash01(wx + k, wy, seed + 12);
        const px = lx + 0.5 + Math.cos(a) * d, py = ly + 0.5 + Math.sin(a) * d, s = 0.13 + 0.1 * rich;
        ctx.fillStyle = mix(col, '#1a1410', 0.45); shard(ctx, px + 0.03, py + 0.05, s, t, a);
        ctx.fillStyle = col; shard(ctx, px, py, s, t, a);
        ctx.fillStyle = mix(col, '#ffffff', 0.55); shard(ctx, px - s * 0.25, py - s * 0.3, s * 0.38, t, a);
      }
    }

    // --- 4. débris du module
    for (let ly = 0; ly < CHUNK; ly++) for (let lx = 0; lx < CHUNK; lx++) {
      if (!c.loot[(ly << 5) | lx]) continue;
      const h = hash01(bx + lx, by + ly, seed + 13);
      ctx.save(); ctx.translate(lx + 0.5, ly + 0.5); ctx.rotate(h * TAU);
      ctx.fillStyle = 'rgba(16,14,48,0.3)'; ctx.fillRect(-0.3, -0.16, 0.7, 0.5);
      ctx.fillStyle = PAL.steel; ctx.fillRect(-0.36, -0.24, 0.62, 0.4);
      ctx.fillStyle = PAL.steelHi; ctx.fillRect(-0.36, -0.24, 0.62, 0.08);
      ctx.fillStyle = PAL.signal; ctx.fillRect(-0.1, -0.24, 0.12, 0.4);
      ctx.rotate(0.9); ctx.fillStyle = PAL.roofLo; ctx.fillRect(-0.05, -0.05, 0.42, 0.24);
      ctx.fillStyle = PAL.dark; ctx.fillRect(0.02, 0.02, 0.1, 0.1);
      ctx.restore();
    }

    // --- 5. dalles : béton, joints, chant visible au sud
    for (let ly = 0; ly < CHUNK; ly++) for (let lx = 0; lx < CHUNK; lx++) {
      if (!c.slab[(ly << 5) | lx]) continue;
      const h = hash2(bx + lx, by + ly, seed + 21);
      ctx.fillStyle = h % 9 === 0 ? PAL.roofHi : h % 4 === 0 ? PAL.roofLo : PAL.roof;
      ctx.fillRect(lx, ly, 1.02, 1.02);
      if (h % 13 === 0) { ctx.fillStyle = 'rgba(90,84,70,0.16)'; ctx.beginPath(); ctx.ellipse(lx + 0.5, ly + 0.5, 0.34, 0.2, h, 0, TAU); ctx.fill(); }
    }
    for (let ly = 0; ly < CHUNK; ly++) for (let lx = 0; lx < CHUNK; lx++) {
      if (!c.slab[(ly << 5) | lx]) continue;
      ctx.fillStyle = PAL.joint;
      ctx.fillRect(lx, ly, 1, 0.03); ctx.fillRect(lx, ly, 0.03, 1);
      if (!slab(lx, ly - 1)) { ctx.fillStyle = PAL.roofHi; ctx.fillRect(lx, ly, 1, 0.07); }
      if (!slab(lx - 1, ly)) { ctx.fillStyle = PAL.roofHi; ctx.fillRect(lx, ly, 0.06, 1); }
      if (!slab(lx + 1, ly)) { ctx.fillStyle = PAL.wall; ctx.fillRect(lx + 0.93, ly, 0.07, 1); }
      if (!slab(lx, ly + 1)) { ctx.fillStyle = PAL.wallLo; ctx.fillRect(lx, ly + 0.86, 1, 0.14); }
    }
  }
}

/** Signature de ce qui est peint dans le cache : dalles, gisements épuisés, débris (pas les arbres). */
function sig(c: Chunk): number {
  let s = c.slabCount * 7919;
  for (let i = 0; i < CHUNK * CHUNK; i += 1) if (c.deposit[i] || c.loot[i]) s = (s + i * (c.deposit[i] + 5 * c.loot[i])) | 0;
  return s;
}

function blob(c: Ctx, x: number, y: number, r: number, h: number, n: number): void {
  c.beginPath();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU, rr = r * (0.78 + 0.3 * (((h * 97 * (i + 1)) % 1 + 1) % 1));
    if (i === 0) c.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); else c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  c.closePath(); c.fill();
}

/** Éclat de minerai : pépite (fer), bloc (calcaire), aiguille (quartz), galet (cuivre). */
function shard(c: Ctx, x: number, y: number, s: number, type: number, a: number): void {
  c.beginPath();
  if (type === 2) { c.save(); c.translate(x, y); c.rotate(a); c.rect(-s, -s * 0.75, s * 2, s * 1.5); c.restore(); }
  else if (type === 3) { c.moveTo(x, y - s * 1.5); c.lineTo(x + s * 0.7, y); c.lineTo(x, y + s * 1.1); c.lineTo(x - s * 0.7, y); c.closePath(); }
  else if (type === 4) c.ellipse(x, y, s * 1.15, s * 0.85, a, 0, TAU);
  else for (let i = 0; i < 6; i++) { const b = a + (i / 6) * TAU, rr = s * (i % 2 ? 1.15 : 0.85); if (i === 0) c.moveTo(x + Math.cos(b) * rr, y + Math.sin(b) * rr); else c.lineTo(x + Math.cos(b) * rr, y + Math.sin(b) * rr); }
  c.fill();
}
