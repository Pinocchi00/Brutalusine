// Terrain : chaque bloc de 32×32 cases est peint une fois dans un canevas hors écran,
// puis repeint seulement quand il change. « Os et canopée » : dalles d'os, terre rasée, jungle turquoise.

import { hash01, hash2 } from '../sim/rng';
import { CHUNK, GROUND_WATER, type Chunk, type World } from '../sim/world';
import { DEPOSITS } from '../sim/data';

export const PX = 24;   // pixels par case dans le cache

export const PAL = {
  bone: '#EFE5D3', boneLight: '#FBF5EA', boneDim: '#E6DAC4', edge: '#C7B79C', edgeDark: '#A9987A',
  earth: ['#B95A3E', '#A94F37', '#B4583C', '#9C4832'], earthDark: '#8E3F2D',
  soil: ['#0B3440', '#0C3A44', '#0A303C'],
  water: ['#163F5C', '#1A4A63', '#17445F'], ripple: '#2B6C86',
  canopy: ['#0F4C4E', '#12585A', '#126462', '#14705F', '#16786A', '#178066'],
  canopyHi: ['#1F9478', '#2A9A80', '#2FA585', '#3BB58E', '#2FB08C'],
  palm: '#4FD3A8', indigo: '#3D3C92', indigoHi: '#6563C4', indigoDark: '#2E2D74',
  pink: '#F0559A', pinkHi: '#FF8BC0', glow: '#8CFBE8', glowSoft: '#6FF5DC',
  shadow: '#2E1C70', ink: '#1B1446', gold: '#FFC24A', ore: '#FF5A1F',
  belt: '#231A5C', beltHi: '#3A3492',
};

export interface TerrainEntry {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  version: number;
  frame: number;
  used: number;
  glows: number[];     // points lumineux de la flore (x, y) en cases monde
  flowers: number[];   // fleurs de floraison nocturne
}

function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t);
  const g = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t);
  const bl = Math.round((pa & 255) * (1 - t) + (pb & 255) * t);
  return `rgb(${r},${g},${bl})`;
}

export class TerrainCache {
  private map = new Map<Chunk, TerrainEntry>();
  private budget = 0;

  beginFrame(frame = 0): void {
    this.budget = 3;
    // on libère les blocs qui n'ont pas été vus depuis 10 secondes
    if (frame % 240 === 0) for (const [c, e] of this.map) if (frame - e.used > 600) this.map.delete(c);
  }

  /** Renvoie l'image du bloc, en la repeignant si nécessaire (au plus quelques blocs par image). */
  get(c: Chunk, world: World, frame: number): TerrainEntry | null {
    let e = this.map.get(c);
    if (!e) {
      if (this.budget <= 0 && frame > 2) return null;
      const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(CHUNK * PX, CHUNK * PX) : Object.assign(document.createElement('canvas'), { width: CHUNK * PX, height: CHUNK * PX });
      e = { canvas, version: -1, frame: 0, used: frame, glows: [], flowers: [] };
      this.map.set(c, e);
    }
    e.used = frame;
    if (e.version !== c.version) {
      const stale = frame - e.frame > 150;
      if (e.version < 0 || ((c.urgent || stale) && this.budget > 0)) {
        this.budget--;
        this.paint(e, c, world);
        e.version = c.version; e.frame = frame; c.urgent = false;
      }
    }
    return e;
  }

  clear(): void { this.map.clear(); }

  private paint(e: TerrainEntry, c: Chunk, world: World): void {
    const ctx = e.canvas.getContext('2d') as CanvasRenderingContext2D;
    ctx.setTransform(PX, 0, 0, PX, 0, 0);
    const seed = world.seed;
    const bx = c.cx * CHUNK, by = c.cy * CHUNK;
    const slabAt = (x: number, y: number): number => {
      if (x >= 0 && x < CHUNK && y >= 0 && y < CHUNK) return c.slab[(y << 5) | x];
      const o = world.at(bx + x, by + y, false);
      return o ? o.slab[(((by + y) & 31) << 5) | ((bx + x) & 31)] : 0;
    };

    // --- 1. sol
    for (let ly = 0; ly < CHUNK; ly++) for (let lx = 0; lx < CHUNK; lx++) {
      const i = (ly << 5) | lx, wx = bx + lx, wy = by + ly;
      const h = hash2(wx, wy, seed);
      if (c.ground[i] === GROUND_WATER) ctx.fillStyle = PAL.water[h % 3];
      else {
        const t = Math.max(0, Math.min(1, (c.canopy[i] - 24) / 70));
        ctx.fillStyle = mix(PAL.earth[h % 4], PAL.soil[h % 3], t);
      }
      ctx.fillRect(lx, ly, 1.03, 1.03);
    }
    // reflets sur l'eau
    ctx.strokeStyle = PAL.ripple; ctx.lineWidth = 0.06; ctx.lineCap = 'round';
    ctx.beginPath();
    for (let ly = 0; ly < CHUNK; ly++) for (let lx = 0; lx < CHUNK; lx++) {
      if (c.ground[(ly << 5) | lx] !== GROUND_WATER) continue;
      const h = hash01(bx + lx, by + ly, seed + 3);
      if (h > 0.35) continue;
      const ox = lx + h * 2, oy = ly + 0.2 + ((h * 97) % 1) * 0.6;
      ctx.moveTo(ox, oy); ctx.lineTo(ox + 0.25 + h, oy);
    }
    ctx.stroke();
    // gisements : éclats de roche colorés
    for (let ly = 0; ly < CHUNK; ly++) for (let lx = 0; lx < CHUNK; lx++) {
      const i = (ly << 5) | lx;
      const t = c.deposit[i];
      if (!t || c.slab[i]) continue;
      const col = DEPOSITS[t]!.color;
      const h = hash01(bx + lx, by + ly, seed + 11);
      const rich = Math.min(1, c.amount[i] / 900);
      ctx.fillStyle = mix(col, '#3A1E1A', 0.45);
      ctx.beginPath(); ctx.arc(lx + 0.5, ly + 0.5, 0.36 + 0.14 * rich, 0, 6.3); ctx.fill();
      ctx.fillStyle = col;
      const n = 2 + ((h * 3) | 0);
      for (let k = 0; k < n; k++) {
        const a = h * 6.28 + k * 2.3, d = 0.08 + 0.2 * ((h * (k + 3) * 7.1) % 1);
        const px = lx + 0.5 + Math.cos(a) * d, py = ly + 0.5 + Math.sin(a) * d, s = 0.1 + 0.1 * rich;
        ctx.beginPath(); ctx.moveTo(px, py - s); ctx.lineTo(px + s, py); ctx.lineTo(px, py + s); ctx.lineTo(px - s, py); ctx.closePath(); ctx.fill();
      }
    }

    // --- 2. dalles
    for (let ly = 0; ly < CHUNK; ly++) for (let lx = 0; lx < CHUNK; lx++) {
      if (!c.slab[(ly << 5) | lx]) continue;
      const h = hash2(bx + lx, by + ly, seed + 21);
      ctx.fillStyle = h % 11 === 0 ? PAL.boneLight : h % 5 === 0 ? PAL.boneDim : PAL.bone;
      ctx.fillRect(lx, ly, 1.03, 1.03);
    }
    ctx.fillStyle = PAL.edge;
    for (let ly = 0; ly < CHUNK; ly++) for (let lx = 0; lx < CHUNK; lx++) {
      if (!c.slab[(ly << 5) | lx]) continue;
      // joints fins ; bord épais là où l'os s'arrête
      ctx.fillRect(lx, ly, 1, 0.04); ctx.fillRect(lx, ly, 0.04, 1);
      if (!slabAt(lx, ly + 1)) { ctx.fillStyle = PAL.edgeDark; ctx.fillRect(lx, ly + 0.86, 1, 0.14); ctx.fillStyle = PAL.edge; }
      if (!slabAt(lx + 1, ly)) ctx.fillRect(lx + 0.92, ly, 0.08, 1);
      if (!slabAt(lx, ly - 1)) ctx.fillRect(lx, ly, 1, 0.08);
      if (!slabAt(lx - 1, ly)) ctx.fillRect(lx, ly, 0.08, 1);
    }
    // mousse dans les angles (jamais au milieu)
    for (let ly = 0; ly < CHUNK; ly++) for (let lx = 0; lx < CHUNK; lx++) {
      if (!c.slab[(ly << 5) | lx]) continue;
      const h = hash01(bx + lx, by + ly, seed + 23);
      if (h > 0.09) continue;
      const ex = !slabAt(lx + 1, ly) ? 1 : !slabAt(lx - 1, ly) ? 0 : -1;
      const ey = !slabAt(lx, ly + 1) ? 1 : !slabAt(lx, ly - 1) ? 0 : -1;
      if (ex < 0 && ey < 0) continue;
      const mx = lx + (ex < 0 ? 0.5 : ex * 0.9 + 0.05), my = ly + (ey < 0 ? 0.5 : ey * 0.9 + 0.05);
      ctx.fillStyle = '#2FA585'; ctx.beginPath(); ctx.arc(mx, my, 0.16, 0, 6.3); ctx.fill();
      ctx.fillStyle = '#3BB58E'; ctx.beginPath(); ctx.arc(mx + 0.1, my - 0.08, 0.09, 0, 6.3); ctx.fill();
    }

    // --- 3. canopée (avec une case de marge pour raccorder les blocs voisins)
    e.glows.length = 0; e.flowers.length = 0;
    const canAt = (x: number, y: number): number => {
      if (x >= 0 && x < CHUNK && y >= 0 && y < CHUNK) return c.canopy[(y << 5) | x];
      const o = world.at(bx + x, by + y, false);
      return o ? o.canopy[(((by + y) & 31) << 5) | ((bx + x) & 31)] : 0;
    };
    for (let pass = 0; pass < 2; pass++) {
      for (let ly = -1; ly <= CHUNK; ly++) for (let lx = -1; lx <= CHUNK; lx++) {
        const cv = canAt(lx, ly);
        if (cv < 28) continue;
        const wx = bx + lx, wy = by + ly;
        const h = hash2(wx, wy, seed + 5), f = h / 4294967296;
        const d = cv / 255;
        const px = lx + 0.5 + ((h & 255) / 255 - 0.5) * 0.5, py = ly + 0.5 + (((h >>> 8) & 255) / 255 - 0.5) * 0.5;
        const r = 0.3 + 0.5 * d;
        const kind = d > 0.55 && f < 0.07 ? 1 : d > 0.7 && f > 0.975 ? 2 : 0;   // 1 = buisson indigo, 2 = palme
        if (pass === 0) {
          ctx.fillStyle = kind === 1 ? PAL.indigoDark : PAL.canopy[(h >>> 16) % (d > 0.5 ? 6 : 3)];
          ctx.beginPath(); ctx.arc(px, py, r, 0, 6.3); ctx.fill();
        } else {
          if (kind === 2) {
            ctx.fillStyle = PAL.palm;
            for (let k = 0; k < 9; k++) {
              const a = (k / 9) * 6.283 + f * 9, c1 = Math.cos(a), s1 = Math.sin(a), L = 0.78;
              ctx.beginPath(); ctx.moveTo(px, py);
              ctx.quadraticCurveTo(px + c1 * L * 0.5 - s1 * 0.13, py + s1 * L * 0.5 + c1 * 0.13, px + c1 * L, py + s1 * L);
              ctx.quadraticCurveTo(px + c1 * L * 0.5 + s1 * 0.13, py + s1 * L * 0.5 - c1 * 0.13, px, py);
              ctx.fill();
            }
            ctx.fillStyle = PAL.glowSoft; ctx.beginPath(); ctx.arc(px, py, 0.1, 0, 6.3); ctx.fill();
            if (lx >= 0 && lx < CHUNK && ly >= 0 && ly < CHUNK) e.glows.push(wx + px - lx, wy + py - ly);
            continue;
          }
          ctx.fillStyle = kind === 1 ? PAL.indigo : PAL.canopyHi[(h >>> 20) % 5];
          ctx.globalAlpha = kind === 1 ? 1 : 0.35 + 0.5 * d;
          ctx.beginPath(); ctx.arc(px - 0.1 * r, py - 0.16 * r, r * 0.62, 0, 6.3); ctx.fill();
          ctx.globalAlpha = 1;
          if (kind === 1) { ctx.fillStyle = PAL.indigoHi; ctx.beginPath(); ctx.arc(px - 0.16 * r, py - 0.24 * r, r * 0.3, 0, 6.3); ctx.fill(); }
          const inside = lx >= 0 && lx < CHUNK && ly >= 0 && ly < CHUNK;
          const f2 = hash01(wx, wy, seed + 6);
          if (f2 < 0.045 && d > 0.4) {
            ctx.fillStyle = PAL.pink; ctx.beginPath(); ctx.arc(px + 0.15, py + 0.1, 0.1, 0, 6.3); ctx.fill();
            ctx.fillStyle = PAL.pinkHi; ctx.beginPath(); ctx.arc(px + 0.15, py + 0.1, 0.045, 0, 6.3); ctx.fill();
          } else if (f2 > 0.965 && d > 0.45) {
            ctx.fillStyle = PAL.glow; ctx.beginPath(); ctx.arc(px - 0.1, py + 0.12, 0.06, 0, 6.3); ctx.fill();
            if (inside) e.glows.push(wx + px - lx - 0.1, wy + py - ly + 0.12);
          }
          if (inside && f2 > 0.3 && f2 < 0.42 && d > 0.5) e.flowers.push(wx + px - lx + 0.1, wy + py - ly - 0.1);
        }
      }
    }
  }
}
