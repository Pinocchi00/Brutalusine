// Rendu 2D : terrain en cache, ombres, convoyeurs et leurs raccords, objets, bâtiments animés,
// arbres, bâtisseurs, particules, lumière du jour et de la nuit.

import { B, DX, DY, ITEMS, NITEMS, TILE_U, DEPOSITS, BELT_SPEED, TREE_MIN, type Shape } from '../sim/data';
import type { Game } from '../sim/game';
import { SAW_RANGE, ACCU_CAP, STORE_CAP } from '../sim/game';
import { Status, type Ent } from '../sim/ent';
import { outputPorts, type BeltPath } from '../sim/belts';
import { CHUNK, GROUND_WATER } from '../sim/world';
import { hash2 } from '../sim/rng';
import { PAL, TerrainCache, mix } from './terrain';
import { drawSprite, drawCritter, trees, plinthOf, IDLE, K, type SpriteState, type Critter } from './sprites';
import type { MotionResult } from './px/builderMotion';

export interface Camera { x: number; y: number; zoom: number; }
export interface PlayerView extends Critter {
  cx: number; cy: number;              // case visée
  tool: string | null; rot: number; ox: number; oy: number; ok: boolean;
  gx: number; gy: number; gprog: number;   // récolte en cours : case et avancement (0 = aucune)
  beam: number;                        // 0..1 : éclair de construction vers la case visée
  route: RouteView[] | null;           // tracé de convoyeur en cours (posé au relâchement)
  routeInto: boolean;                  // son bout se déverse dans une machine ou un tapis
  motion?: MotionResult | null;        // l'image du bâtisseur boxeur en rendu pixel
  strikeTile?: { readonly x: number; readonly y: number } | null;   // case frappée pendant un coup, pour rester devant sa cible
}
export interface RouteView { x: number; y: number; dir: number; ok: boolean; }
export interface Ring { x: number; y: number; t0: number; color: string; size: number; dur: number; }
export interface RenderOpts {
  time: number; frame: number; dt: number; players: PlayerView[];
  selected: Ent | null; hover: Ent | null; rings: Ring[]; marker: { x: number; y: number } | null;
}

type Ctx = CanvasRenderingContext2D;
const TAU = Math.PI * 2;
interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string; kind: number; rot: number; }
interface Felled { x: number; y: number; r: number; v: number; t0: number; dir: number; }

/** Où sort la fumée de chaque machine : [dx, dy, hauteur]. */
const STACKS: Record<string, [number, number, number][]> = {
  charbonniere: [[0, -0.14, 1.15]], fonderie: [[0.85, -0.75, 2.0], [0.85, -0.05, 1.6]], four: [[0.45, -0.4, 1.5]],
  bruleur: [[0.48, -0.42, 1.7]], convertisseur: [[0, 0.2, 1.1]],
};

function shapePath(c: Ctx, shape: Shape, x: number, y: number, r: number): void {
  switch (shape) {
    case 'boule': c.moveTo(x + r, y); c.arc(x, y, r, 0, TAU); break;
    case 'bloc': c.rect(x - r * 0.85, y - r * 0.85, r * 1.7, r * 1.7); break;
    case 'gemme': c.moveTo(x, y - r * 1.15); c.lineTo(x + r * 1.05, y); c.lineTo(x, y + r * 1.15); c.lineTo(x - r * 1.05, y); c.closePath(); break;
    case 'lingot': c.moveTo(x - r * 0.75, y - r * 0.6); c.lineTo(x + r * 0.75, y - r * 0.6); c.lineTo(x + r * 1.15, y + r * 0.6); c.lineTo(x - r * 1.15, y + r * 0.6); c.closePath(); break;
    case 'plaque': c.rect(x - r * 1.15, y - r * 0.55, r * 2.3, r * 1.1); break;
    case 'bobine': c.moveTo(x + r, y); c.arc(x, y, r, 0, TAU); c.moveTo(x + r * 0.4, y); c.arc(x, y, r * 0.4, 0, TAU, true); break;
    case 'rouage': for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; c.lineTo(x + Math.cos(a) * r * 1.15, y + Math.sin(a) * r * 1.15); c.lineTo(x + Math.cos(a + 0.39) * r * 0.8, y + Math.sin(a + 0.39) * r * 0.8); } c.closePath(); break;
  }
}

export class Renderer {
  terrain = new TerrainCache();
  ctx: Ctx;
  private lo: number[][] = Array.from({ length: NITEMS }, () => []);
  private hi: number[][] = Array.from({ length: NITEMS }, () => []);
  private st: SpriteState = { ...IDLE };
  private parts: Particle[] = [];
  private felled: Felled[] = [];
  private shake = new Map<number, number>();   // case → instant du dernier coup (les arbres tremblent)
  private treeBuf: number[] = [];
  private time = 0;

  constructor(public canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
  }

  reset(): void { this.terrain.clear(); this.parts.length = 0; this.felled.length = 0; this.shake.clear(); }

  // ------------------------------------------------------------ effets
  burst(kind: 'leaf' | 'dust' | 'spark' | 'chip' | 'star', x: number, y: number, color: string, n: number): void {
    for (let i = 0; i < n && this.parts.length < 1200; i++) {
      const a = Math.random() * TAU, sp = kind === 'spark' ? 2 + Math.random() * 4 : kind === 'star' ? 3 + Math.random() * 7 : 0.6 + Math.random() * 2.2;
      this.parts.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (kind === 'dust' ? 0.4 : 1.2),
        life: 0, max: kind === 'dust' ? 0.7 + Math.random() * 0.5 : kind === 'leaf' ? 0.8 + Math.random() * 0.7 : 0.35 + Math.random() * 0.4,
        size: kind === 'dust' ? 0.16 + Math.random() * 0.2 : kind === 'leaf' ? 0.08 + Math.random() * 0.07 : 0.05 + Math.random() * 0.05,
        color, kind: kind === 'dust' ? 0 : kind === 'leaf' ? 2 : kind === 'chip' ? 3 : 1, rot: Math.random() * TAU,
      });
    }
  }
  /** Un arbre tombe : sa couronne bascule, ses feuilles volent. */
  fell(g: Game, x: number, y: number, size: number): void {
    const h = hash2(Math.floor(x), Math.floor(y), g.seed + 5);
    this.felled.push({ x, y, r: (0.42 + 0.4 * (size / 255)) * treeScale(h), v: variant(h), t0: this.time, dir: (h % 628) / 100 });
    this.burst('leaf', x, y - 0.2, PAL.leaf[2 + (h % 3)], 12);
    this.burst('dust', x, y + 0.1, 'rgba(120,100,70,', 4);
  }
  /** Un coup porté à un arbre encore debout. */
  hit(x: number, y: number): void { this.shake.set(Math.floor(y) * 65536 + Math.floor(x), this.time); }

  // ------------------------------------------------------------- image
  render(g: Game, cam: Camera, o: RenderOpts): void {
    this.time = o.time;
    this.terrain.beginFrame(o.frame);
    const c = this.ctx, W = this.canvas.width, H = this.canvas.height, z = cam.zoom;
    const sun = g.sun, w = g.world, n = sun.night;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    c.fillStyle = '#0E2A24'; c.fillRect(0, 0, W, H);
    c.setTransform(z, 0, 0, z, Math.round(W / 2 - cam.x * z), Math.round(H / 2 - cam.y * z));
    const x0 = cam.x - W / 2 / z - 1, x1 = cam.x + W / 2 / z + 1, y0 = cam.y - H / 2 / z - 1, y1 = cam.y + H / 2 / z + 2;
    const vis = (e: Ent, m = 0) => e.x + e.w + m > x0 && e.x - m < x1 && e.y + e.h + m > y0 && e.y - m - 2 < y1;
    const detail = z >= 14;
    const tick = g.tick;

    // --- activité lissée : les machines démarrent et s'arrêtent en douceur
    for (const e of g.tickers) {
      const k = e.def.kind;
      const on = e.status === Status.Working && (k !== 'generator' || e.flow > 1) ? (k === 'wind' ? g.wind : k === 'machine' || k === 'miner' || k === 'sawmill' ? g.power.sat : 1) : 0;
      e.act += (on - e.act) * Math.min(1, o.dt * 4);
      e.anim += o.dt * e.act;
      if (e.done !== e.seen) { e.seen = e.done; e.pulse = 1; }
      e.pulse = Math.max(0, e.pulse - o.dt * 2.2);
    }

    // --- terrain
    c.imageSmoothingEnabled = true;
    const cx0 = Math.floor(x0) >> 5, cx1 = Math.floor(x1) >> 5, cy0 = Math.floor(y0) >> 5, cy1 = Math.floor(y1) >> 5;
    const tb = this.treeBuf; tb.length = 0;
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      const ch = w.chunk(cx, cy, false);
      if (!ch) continue;
      const en = this.terrain.get(ch, w, o.frame);
      if (en) c.drawImage(en.canvas as CanvasImageSource, cx * CHUNK, cy * CHUNK, CHUNK + 0.03, CHUNK + 0.03);
      const lx0 = Math.max(0, Math.floor(x0) - cx * CHUNK), lx1 = Math.min(31, Math.floor(x1) - cx * CHUNK);
      const ly0 = Math.max(0, Math.floor(y0) - cy * CHUNK), ly1 = Math.min(31, Math.floor(y1) + 1 - cy * CHUNK);
      // reflets qui glissent sur l'eau ; éclat des débris
      if (detail) {
        c.strokeStyle = PAL.ripple; c.lineWidth = 0.05; c.lineCap = 'round'; c.globalAlpha = 0.5; c.beginPath();
        for (let ly = ly0; ly <= ly1; ly++) for (let lx = lx0; lx <= lx1; lx++) {
          const i = (ly << 5) | lx;
          if (ch.ground[i] === GROUND_WATER) {
            const h = hash2(cx * CHUNK + lx, cy * CHUNK + ly, 7) % 100;
            if (h > 34) continue;
            const ph = (o.time * 0.25 + h * 0.13) % 1, wx = cx * CHUNK + lx + ph * 0.8, wy = cy * CHUNK + ly + 0.2 + (h % 7) * 0.1;
            const len = 0.35 * Math.sin(ph * Math.PI);
            c.moveTo(wx, wy); c.lineTo(wx + len, wy);
          }
        }
        c.stroke(); c.globalAlpha = 1;
      }
      for (let ly = ly0; ly <= ly1; ly++) for (let lx = lx0; lx <= lx1; lx++) {
        const i = (ly << 5) | lx;
        if (ch.loot[i] && detail) {
          const tw = (o.time * 0.7 + lx * 0.37 + ly * 0.61) % 2.2;
          if (tw < 0.5) { const s = Math.sin(tw * TAU) * 0.2, px = cx * CHUNK + lx + 0.62, py = cy * CHUNK + ly + 0.3; c.fillStyle = PAL.white; c.beginPath(); c.moveTo(px, py - s); c.lineTo(px + s * 0.25, py); c.lineTo(px, py + s); c.lineTo(px - s * 0.25, py); c.closePath(); c.moveTo(px - s, py); c.lineTo(px, py + s * 0.25); c.lineTo(px + s, py); c.lineTo(px, py - s * 0.25); c.closePath(); c.fill(); }
        }
      }
    }

    // --- arbres visibles, rangée par rangée (du nord au sud)
    for (let ty = Math.floor(y0) - 1; ty <= Math.floor(y1) + 1; ty++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const ch = w.chunk(cx, ty >> 5, false);
        if (!ch) continue;
        const rowI = (ty & 31) << 5, lx0 = Math.max(0, Math.floor(x0) - 1 - cx * CHUNK), lx1 = Math.min(31, Math.floor(x1) + 1 - cx * CHUNK);
        for (let lx = lx0; lx <= lx1; lx++) { const v = ch.canopy[rowI | lx]; if (v > 0) tb.push(cx * CHUNK + lx, ty, v); }
      }
    }

    // --- ombres portées : un seul tracé, elles se fondent sans se cumuler
    const sl = Math.min(1.5, sun.shadow) * 0.75, ox = -sun.sx * sl, oy = -sun.sy * sl + 0.08;
    if (sun.day) {
      c.beginPath();
      for (const e of g.tickers) {
        const hgt = e.height;
        if (hgt < 0.2 || !vis(e, 3)) continue;
        const dx = ox * hgt, dy = oy * hgt, m = 0.06, ax = e.x + m, ay = e.y + m, bx = e.x + e.w - m, by = e.y + e.h - m;
        // enveloppe convexe du pied et de son projeté : six sommets suffisent
        const sxp = dx >= 0, syp = dy >= 0;
        c.moveTo(sxp ? ax : bx, syp ? by : ay); c.lineTo(sxp ? ax : bx, syp ? ay : by); c.lineTo(sxp ? bx : ax, syp ? ay : by);
        c.lineTo((sxp ? bx : ax) + dx, (syp ? ay : by) + dy); c.lineTo((sxp ? bx : ax) + dx, (syp ? by : ay) + dy); c.lineTo((sxp ? ax : bx) + dx, (syp ? by : ay) + dy);
        c.closePath();
      }
      if (detail) for (let i = 0; i < tb.length; i += 3) {
        if (tb[i + 2] < TREE_MIN) continue;
        const r = 0.42 + 0.4 * (tb[i + 2] / 255), px = tb[i] + 0.5 + ox * 1.1, py = tb[i + 1] + 0.55 + oy * 1.1;
        c.moveTo(px + r * 0.95, py); c.ellipse(px, py, r * 0.95, r * 0.8, 0, 0, TAU);
      }
      c.fillStyle = `${PAL.shadow}${(0.3 * Math.min(1, sun.elev * 4)).toFixed(3)})`;
      c.fill('nonzero');
    }

    // --- convoyeurs
    this.belts(c, g, x0, y0, x1, y1, o, detail);

    // --- bâtiments, arbres et bâtisseurs, du nord au sud
    const ents: Ent[] = [];
    for (const e of g.tickers) if (vis(e, 2)) ents.push(e);
    ents.sort((a, b) => a.y + a.h - (b.y + b.h));
    const players = o.players.slice().sort((a, b) => a.y - b.y);
    const atlas = trees();
    let ei = 0, pi = 0, ti = 0;
    const wind = 0.5 + g.wind;
    for (let row = Math.floor(y0) - 1; row <= Math.floor(y1) + 2; row++) {
      // arbres de la rangée
      for (; ti < tb.length && tb[ti + 1] <= row; ti += 3) {
        if (tb[ti + 1] < row) continue;
        const tx = tb[ti], ty = tb[ti + 1], v = tb[ti + 2];
        const h = hash2(tx, ty, g.seed + 5);
        const px = tx + 0.5 + ((h & 255) / 255 - 0.5) * 0.36, py = ty + 0.5 + (((h >>> 8) & 255) / 255 - 0.5) * 0.3;
        if (v < TREE_MIN) {                                   // une pousse
          const r = 0.1 + 0.16 * (v / TREE_MIN);
          c.fillStyle = PAL.leaf[3]; c.beginPath(); c.ellipse(px - r * 0.5, py - r * 0.3, r * 0.75, r * 0.4, -0.6, 0, TAU); c.ellipse(px + r * 0.5, py - r * 0.3, r * 0.75, r * 0.4, 0.6, 0, TAU); c.fill();
          continue;
        }
        // tailles variées : des sous-bois, des couronnes moyennes, et de rares géants qui dominent la canopée
        const r = (0.42 + 0.4 * (v / 255)) * treeScale(h);
        const hitT = this.shake.get(ty * 65536 + tx);
        const sh = hitT !== undefined && o.time - hitT < 0.4 ? Math.sin((o.time - hitT) * 50) * 0.12 * (1 - (o.time - hitT) / 0.4) : 0;
        const sway = Math.sin(o.time * 0.9 + tx * 0.7 + ty * 0.45) * 0.035 * wind + sh;
        if (detail) { c.fillStyle = PAL.trunk; c.beginPath(); c.arc(px, py + 0.05, 0.1, 0, TAU); c.fill(); }
        const lift = r * 0.3;
        c.save(); c.translate(px + sway * 1.5, py - lift); c.rotate(sway);
        const sz = r * 2.4;
        c.drawImage(atlas[variant(h)], -sz / 2, -sz / 2, sz, sz);
        c.restore();
      }
      // bâtiments dont le pied est sur cette rangée
      for (; ei < ents.length && ents[ei].y + ents[ei].h <= row + 1; ei++) this.building(c, g, ents[ei], o, tick, detail);
      for (; pi < players.length && players[pi].y < row + 1; pi++) this.player(c, players[pi], o, n);
    }
    for (; ei < ents.length; ei++) this.building(c, g, ents[ei], o, tick, detail);
    for (; pi < players.length; pi++) this.player(c, players[pi], o, n);

    // --- arbres qui tombent
    for (const f of this.felled) {
      const t = (o.time - f.t0) / 0.55;
      if (t >= 1) continue;
      const e = t * t;
      c.save(); c.globalAlpha = 1 - e; c.translate(f.x + Math.cos(f.dir) * e * 0.9, f.y - f.r * 0.3 * (1 - e) + Math.sin(f.dir) * e * 0.5); c.rotate(e * 1.1 * (Math.cos(f.dir) > 0 ? 1 : -1)); c.scale(1 - e * 0.25, 1 - e * 0.5);
      c.drawImage(atlas[f.v], -f.r * 1.2, -f.r * 1.2, f.r * 2.4, f.r * 2.4);
      c.restore();
    }
    this.felled = this.felled.filter((f) => o.time - f.t0 < 0.55);
    if (this.shake.size > 40) for (const [k, t] of this.shake) if (o.time - t > 1) this.shake.delete(k);

    // --- pictogrammes de cause : ce qui manque se voit sur la machine
    if (detail) {
      const pulse = 0.8 + 0.2 * Math.sin(o.time * 4);
      for (const e of ents) {
        const s = e.status, k = e.def.kind;
        if (s === Status.Working || s === Status.Idle || s === Status.Dark || k === 'splitter' || k === 'hub' || k === 'storage') continue;
        if (tick - e.born < 90) continue;
        const bx = e.cx, by = e.y - e.def.height * K - 0.42 + Math.sin(o.time * 2.5 + e.id) * 0.05;
        c.globalAlpha = pulse;
        c.fillStyle = PAL.ink; c.beginPath(); c.arc(bx, by, 0.36, 0, TAU); c.moveTo(bx - 0.12, by + 0.3); c.lineTo(bx, by + 0.52); c.lineTo(bx + 0.12, by + 0.3); c.fill();
        c.strokeStyle = s === Status.NoInput ? PAL.white : PAL.signal; c.lineWidth = 0.05; c.beginPath(); c.arc(bx, by, 0.34, 0, TAU); c.stroke();
        c.globalAlpha = 1;
        if (s === Status.NoInput && e.missing >= 0) {
          const it = ITEMS[e.missing];
          c.fillStyle = it.color; c.beginPath(); shapePath(c, it.shape, bx, by, 0.17); c.fill('evenodd');
        } else if (s === Status.Blocked) {
          c.fillStyle = PAL.signal; c.fillRect(bx - 0.14, by - 0.15, 0.1, 0.3); c.fillRect(bx + 0.04, by - 0.15, 0.1, 0.3);
        } else if (s === Status.NoPower) {
          c.fillStyle = PAL.signalHi; c.beginPath();
          c.moveTo(bx + 0.05, by - 0.24); c.lineTo(bx - 0.14, by + 0.04); c.lineTo(bx - 0.01, by + 0.04); c.lineTo(bx - 0.06, by + 0.24); c.lineTo(bx + 0.14, by - 0.05); c.lineTo(bx + 0.01, by - 0.05); c.closePath(); c.fill();
        } else {
          c.strokeStyle = PAL.signal; c.lineWidth = 0.07; c.beginPath(); c.arc(bx, by, 0.15, 0, TAU); c.moveTo(bx - 0.11, by + 0.11); c.lineTo(bx + 0.11, by - 0.11); c.stroke();
        }
      }
    }

    // --- particules
    this.particles(c, o.dt, g.wind);

    // --- lumière du jour : dorée au matin et au soir, bleue la nuit
    const gold = sun.day ? Math.max(0, 1 - sun.elev / 0.5) : 1;
    const lr = Math.round(255 * (1 - n) + 70 * n), lg = Math.round((255 - 38 * gold) * (1 - n) + 92 * n), lb = Math.round((255 - 84 * gold) * (1 - n) + 190 * n);
    if (gold > 0.01 || n > 0.01) {
      c.globalCompositeOperation = 'multiply';
      c.fillStyle = `rgb(${lr},${lg},${lb})`;
      c.fillRect(x0, y0, x1 - x0, y1 - y0);
    }
    // --- lueurs : chaque machine qui travaille, la Tour, les lampadaires, les bâtisseurs
    c.globalCompositeOperation = 'lighter';
    if (n > 0.05 && detail) { c.globalAlpha = Math.min(1, n * 0.9); this.drawItems(c, this.lo, true, 1.15, false); this.drawItems(c, this.hi, true, 1.2, false); c.globalAlpha = 1; }
    for (const e of ents) {
      const k = e.def.kind;
      if (k === 'hub') this.halo(c, e.cx, e.cy - e.height * K, 3.2, PAL.signalHi, 0.14 + 0.45 * n + 0.3 * e.pulse);
      else if (k === 'deco') this.halo(c, e.cx, e.cy, 4.2, '#FFD9A0', 0.75 * n);
      else if (e.act > 0.05 && (k === 'machine' || k === 'generator')) this.halo(c, e.cx, e.cy - e.def.height * K * 0.5, Math.max(e.w, e.h) * 0.85, k === 'generator' ? PAL.hot : mix(PAL.hot, e.recipe && e.recipe.outputs.length ? ITEMS[e.recipe.outputs[0][0]].color : PAL.hot, 0.5), (0.1 + 0.4 * n) * e.act);
    }
    if (n > 0.1) for (const p of o.players) this.halo(c, p.x, p.y, 6.5, '#FFE9C0', 0.4 * n);
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';

    // --- ondes (quota, pose, démolition)
    for (const r of o.rings) {
      const t = (o.time - r.t0) / r.dur;
      if (t < 0 || t > 1) continue;
      const ease = 1 - (1 - t) * (1 - t);
      c.strokeStyle = r.color; c.globalAlpha = 1 - t; c.lineWidth = 0.07 + r.size * 0.02 * (1 - t);
      c.beginPath(); c.arc(r.x, r.y, 0.3 + r.size * ease, 0, TAU); c.stroke();
    }
    c.globalAlpha = 1;

    // --- sélection, survol, aperçus, repère du guide
    const frame = (e: Ent, col: string) => {
      const m = 0.1 + 0.03 * Math.sin(o.time * 5), L = 0.32;
      c.strokeStyle = col; c.lineWidth = 0.08; c.lineCap = 'square'; c.beginPath();
      for (const [px, py, sx, sy] of [[e.x - m, e.y - m, 1, 1], [e.x + e.w + m, e.y - m, -1, 1], [e.x - m, e.y + e.h + m, 1, -1], [e.x + e.w + m, e.y + e.h + m, -1, -1]]) { c.moveTo(px + sx * L, py); c.lineTo(px, py); c.lineTo(px, py + sy * L); }
      c.stroke();
    };
    if (o.hover && !o.hover.dead && o.hover !== o.selected) frame(o.hover, 'rgba(251,247,238,0.7)');
    if (o.selected && !o.selected.dead) { frame(o.selected, PAL.signal); this.ranges(c, o.selected.def.key, o.selected.x, o.selected.y, o.selected.w, o.selected.h); }
    for (const p of o.players) this.ghost(c, g, p, o);
    if (o.marker) {
      const b = Math.abs(Math.sin(o.time * 3.2)) * 0.4, mx = o.marker.x, my = o.marker.y - 0.9 - b;
      c.fillStyle = PAL.ink; c.beginPath(); c.moveTo(mx - 0.42, my - 0.5); c.lineTo(mx + 0.42, my - 0.5); c.lineTo(mx, my + 0.38); c.closePath(); c.fill();
      c.fillStyle = PAL.signal; c.beginPath(); c.moveTo(mx - 0.3, my - 0.43); c.lineTo(mx + 0.3, my - 0.43); c.lineTo(mx, my + 0.24); c.closePath(); c.fill();
      c.strokeStyle = PAL.signal; c.lineWidth = 0.06; c.globalAlpha = 0.5 + 0.5 * Math.sin(o.time * 3.2); c.beginPath(); c.ellipse(o.marker.x, o.marker.y, 0.7, 0.45, 0, 0, TAU); c.stroke(); c.globalAlpha = 1;
    }
  }

  // ------------------------------------------------------- convoyeurs
  private belts(c: Ctx, g: Game, x0: number, y0: number, x1: number, y1: number, o: RenderOpts, detail: boolean): void {
    const paths = g.paths, tick = g.tick;
    const spans: Ent[] = [], ends: number[] = [], starts: number[] = [], hoods: number[] = [];
    const seen: BeltPath[] = [];
    c.beginPath();
    for (let i = 0; i < paths.length; i++) {
      const p = paths[i];
      if (p.maxx + 7 < x0 || p.minx - 7 > x1 || p.maxy + 7 < y0 || p.miny - 7 > y1) continue;
      seen.push(p);
      const T = p.tiles, t0 = T[0];
      if (!(t0.def.kind === 'bridge' && t0.isOut)) {
        c.moveTo(t0.x + 0.5 - DX[t0.inDir] * 0.5, t0.y + 0.5 - DY[t0.inDir] * 0.5);
        if (t0.nfeed === 0) starts.push(t0.x + 0.5 - DX[t0.rot] * 0.5, t0.y + 0.5 - DY[t0.rot] * 0.5, t0.rot);
      }
      for (let k = 0; k < T.length; k++) {
        const t = T[k], cx = t.x + 0.5, cy = t.y + 0.5;
        if (t.def.kind === 'bridge') {
          if (!t.isOut) { c.lineTo(cx, cy); if (t.pair) spans.push(t); }
          else { c.moveTo(cx, cy); c.lineTo(cx + DX[t.rot] * 0.5, cy + DY[t.rot] * 0.5); }
          continue;
        }
        const ex = cx + DX[t.rot] * 0.5, ey = cy + DY[t.rot] * 0.5;
        if (t.inDir !== t.rot && t.inDir !== ((t.rot + 2) & 3)) c.arcTo(cx, cy, ex, ey, 0.5); else c.lineTo(ex, ey);
      }
      const tl = T[T.length - 1];
      if (tl.def.kind === 'bridge' && !tl.isOut) continue;
      const bx = tl.x + 0.5 + DX[tl.rot] * 0.5, by = tl.y + 0.5 + DY[tl.rot] * 0.5;
      if (p.target.path) c.lineTo(bx + DX[tl.rot] * 0.5, by + DY[tl.rot] * 0.5);        // raccord en T : le flux rejoint l'autre tapis
      else if (p.target.ent) { const k = p.target.ent.def.kind; if (k !== 'splitter') hoods.push(bx, by, tl.rot); else c.lineTo(bx + DX[tl.rot] * 0.5, by + DY[tl.rot] * 0.5); }
      else ends.push(bx, by, tl.rot);
    }
    // sorties des aiguillages : un court tronçon jusqu'au tapis voisin
    for (const e of g.tickers) {
      if (e.def.kind !== 'splitter' || e.x < x0 - 1 || e.x > x1 + 1 || e.y < y0 - 1 || e.y > y1 + 1) continue;
      for (let k = 0; k < e.outs.length; k++) if (e.outs[k].path || e.outs[k].ent) { const d = e.outs[k].dir; c.moveTo(e.x + 0.5, e.y + 0.5); c.lineTo(e.x + 0.5 + DX[d] * 0.6, e.y + 0.5 + DY[d] * 0.6); }
    }
    c.lineJoin = 'round'; c.lineCap = 'butt';
    c.strokeStyle = 'rgba(16,14,48,0.35)'; c.lineWidth = 0.96; c.stroke();     // ombre de contact
    c.strokeStyle = PAL.steelHi; c.lineWidth = 0.84; c.stroke();               // rives
    c.strokeStyle = PAL.dark; c.lineWidth = 0.68; c.stroke();                  // tapis
    if (detail) {
      const sp = (BELT_SPEED * 60) / TILE_U;
      c.strokeStyle = '#3B3F48'; c.lineWidth = 0.6; c.setLineDash([0.07, 0.18]); c.lineDashOffset = -((o.time * sp) % 0.25);
      c.stroke(); c.setLineDash([]);
    }
    // butoirs en bout de ligne morte, amorces en début de ligne
    for (let i = 0; i < ends.length; i += 3) { c.save(); c.translate(ends[i], ends[i + 1]); c.rotate(ends[i + 2] * Math.PI / 2); c.fillStyle = PAL.signal; c.fillRect(-0.1, -0.42, 0.1, 0.84); c.fillStyle = PAL.ink; c.fillRect(-0.1, -0.14, 0.1, 0.07); c.fillRect(-0.1, 0.07, 0.1, 0.07); c.restore(); }
    for (let i = 0; i < starts.length; i += 3) { c.save(); c.translate(starts[i], starts[i + 1]); c.rotate(starts[i + 2] * Math.PI / 2); c.fillStyle = PAL.steelHi; c.fillRect(0, -0.42, 0.08, 0.84); c.restore(); }

    // objets
    const lo = this.lo, hi = this.hi;
    for (let i = 0; i < NITEMS; i++) { lo[i].length = 0; hi[i].length = 0; }
    for (const p of seen) {
      let dist = 0;
      for (let k = p.head; k < p.types.length; k++) {
        dist += p.gaps[k];
        const pos = p.length - dist, ti = p.tileIndex(pos), t = p.tiles[ti], f = (pos - p.starts[ti]) / p.lens[ti];
        const cx = t.x + 0.5, cy = t.y + 0.5;
        let x: number, y: number, zz = 0;
        if (p.lens[ti] > TILE_U) { const span = p.lens[ti] / TILE_U; x = cx + DX[t.rot] * (f * span - 0.5); y = cy + DY[t.rot] * (f * span - 0.5); zz = 0.05 + Math.sin(Math.PI * Math.min(1, Math.max(0, (f * span - 0.5) / (span - 1)))) * 0.3; if (f * span < 0.5) zz = 0; }
        else if (t.inDir !== t.rot && t.inDir !== ((t.rot + 2) & 3)) {
          const a = f * Math.PI / 2, co = Math.cos(a) * 0.5, si = Math.sin(a) * 0.5;      // quart de cercle autour du coin
          x = cx - DX[t.inDir] * 0.5 + DX[t.rot] * 0.5 - DX[t.rot] * co + DX[t.inDir] * si;
          y = cy - DY[t.inDir] * 0.5 + DY[t.rot] * 0.5 - DY[t.rot] * co + DY[t.inDir] * si;
        } else { x = cx + DX[t.rot] * (f - 0.5); y = cy + DY[t.rot] * (f - 0.5); }
        if (x < x0 || x > x1 || y < y0 || y > y1) continue;
        (zz > 0 ? hi : lo)[p.types[k]].push(x, y - zz);
      }
    }
    this.drawItems(c, lo, detail, 1, true);

    // objets tenus par un aiguillage
    for (const e of g.tickers) if (e.def.kind === 'splitter' && e.held >= 0) { /* dessinés avec le bâtiment */ }

    // ponts : une passerelle par-dessus
    for (const t of spans) {
      const ax = t.x + 0.5, ay = t.y + 0.5, bx = t.pair!.x + 0.5, by = t.pair!.y + 0.5, up = 0.3;
      c.lineCap = 'butt';
      c.strokeStyle = 'rgba(16,14,48,0.3)'; c.lineWidth = 0.7; c.beginPath(); c.moveTo(ax + 0.1, ay + 0.12); c.lineTo(bx + 0.1, by + 0.12); c.stroke();
      c.beginPath(); c.moveTo(ax, ay); c.lineTo(ax + DX[t.rot] * 0.5, ay + DY[t.rot] * 0.5 - up); c.lineTo(bx - DX[t.rot] * 0.5, by - DY[t.rot] * 0.5 - up); c.lineTo(bx, by);
      c.lineJoin = 'round';
      c.strokeStyle = PAL.roof; c.lineWidth = 0.84; c.stroke();
      c.strokeStyle = PAL.dark; c.lineWidth = 0.6; c.stroke();
      if (detail) { c.strokeStyle = '#3B3F48'; c.lineWidth = 0.52; c.setLineDash([0.07, 0.18]); c.lineDashOffset = -((o.time * 2) % 0.25); c.stroke(); c.setLineDash([]); }
    }
    this.drawItems(c, hi, detail, 1.1, true);

    // raccords : bouche d'entrée là où un tapis nourrit une machine, goulotte là où elle sort
    for (let i = 0; i < hoods.length; i += 3) {
      c.save(); c.translate(hoods[i], hoods[i + 1]); c.rotate(hoods[i + 2] * Math.PI / 2);
      c.fillStyle = PAL.steel; c.fillRect(-0.3, -0.45, 0.34, 0.9);
      c.fillStyle = PAL.steelHi; c.fillRect(-0.3, -0.45, 0.34, 0.09); c.fillRect(-0.3, 0.36, 0.34, 0.09);
      c.fillStyle = PAL.ink; c.fillRect(-0.12, -0.33, 0.16, 0.66);
      c.restore();
    }
    for (const e of g.tickers) {
      const k = e.def.kind;
      if (k === 'splitter' || e.x + e.w < x0 - 1 || e.x > x1 + 1 || e.y + e.h < y0 - 1 || e.y > y1 + 1) continue;
      for (const [px, py, d] of outputPorts(e)) {
        const linked = e.outT.path !== null || e.outT.ent !== null;
        const flash = Math.max(0, 1 - (tick - e.pushed) / 12);
        c.save(); c.translate(px + 0.5 - DX[d] * 0.5, py + 0.5 - DY[d] * 0.5); c.rotate(d * Math.PI / 2);
        c.fillStyle = PAL.steel; c.fillRect(-0.06, -0.45, 0.36, 0.9);
        c.fillStyle = PAL.steelHi; c.fillRect(-0.06, -0.45, 0.36, 0.09); c.fillRect(-0.06, 0.36, 0.36, 0.09);
        c.fillStyle = PAL.ink; c.fillRect(-0.06, -0.33, 0.2, 0.66);
        c.fillStyle = flash > 0 ? mix(PAL.signal, PAL.white, flash) : PAL.signal;
        const b = linked ? 0 : 0.5 + Math.abs(Math.sin(o.time * 3.5)) * 0.22;
        c.beginPath(); c.moveTo(0.16 + b, -0.2); c.lineTo(0.4 + b, 0); c.lineTo(0.16 + b, 0.2); c.closePath(); c.fill();
        if (!linked) { c.strokeStyle = PAL.ink; c.lineWidth = 0.035; c.stroke(); }
        c.restore();
      }
    }
  }

  private drawItems(c: Ctx, buf: number[][], detail: boolean, scale: number, solid: boolean): void {
    if (solid && detail) {
      c.fillStyle = 'rgba(8,8,20,0.42)'; c.beginPath();
      for (let t = 0; t < NITEMS; t++) { const a = buf[t]; for (let i = 0; i < a.length; i += 2) { c.moveTo(a[i] + 0.21, a[i + 1] + 0.07); c.ellipse(a[i] + 0.02, a[i + 1] + 0.07, 0.19, 0.14, 0, 0, TAU); } }
      c.fill();
    }
    for (let t = 0; t < NITEMS; t++) {
      const a = buf[t];
      if (!a.length) continue;
      const it = ITEMS[t];
      c.fillStyle = it.color;
      c.beginPath();
      if (detail) for (let i = 0; i < a.length; i += 2) shapePath(c, it.shape, a[i], a[i + 1], 0.165 * scale);
      else for (let i = 0; i < a.length; i += 2) c.rect(a[i] - 0.2, a[i + 1] - 0.2, 0.4, 0.4);
      c.fill('evenodd');
      if (solid && detail) {
        c.strokeStyle = 'rgba(8,8,20,0.65)'; c.lineWidth = 0.035; c.stroke();
        c.fillStyle = 'rgba(255,255,255,0.45)'; c.beginPath();
        for (let i = 0; i < a.length; i += 2) c.rect(a[i] - 0.08, a[i + 1] - 0.1, 0.07, 0.05);
        c.fill();
      }
    }
  }

  // --------------------------------------------------------- bâtiments
  private building(c: Ctx, g: Game, e: Ent, o: RenderOpts, tick: number, detail: boolean): void {
    const st = this.st, k = e.def.kind;
    st.w = e.w; st.h = e.h; st.rot = e.rot; st.t = e.anim; st.act = e.act; st.time = o.time + e.id * 0.37; st.night = g.sun.night;
    st.prog = e.recipe && e.working ? e.progress / e.recipe.time : k === 'miner' ? e.progress / 60 : 0;
    st.color = PAL.signal; st.level = 0; st.mark = null; st.flag = e.isOut; st.pulse = e.pulse; st.aim = 0; st.plinth = plinthOf(e.def.key);
    if (e.recipe && e.recipe.outputs.length) st.color = ITEMS[e.recipe.outputs[0][0]].color;
    if (k === 'hub') st.level = e.level;
    else if (k === 'solar') { st.level = e.light; st.aim = g.sun.day ? Math.atan2(g.sun.sy, g.sun.sx) * 0.35 : 0; }
    else if (k === 'battery') st.level = e.energy / ACCU_CAP;
    else if (k === 'storage') st.level = e.outCount / STORE_CAP;
    else if (k === 'miner') { const cells = e.cells!; const i = (e.ptr % (cells.length >> 1)) * 2; const d = g.world.deposit(cells[i], cells[i + 1]); st.color = d ? DEPOSITS[d]!.color : '#6B5038'; }
    else if (k === 'sawmill') { const want = Math.atan2(e.ty - e.cy, e.tx - e.cx); e.aim += Math.atan2(Math.sin(want - e.aim), Math.cos(want - e.aim)) * Math.min(1, o.dt * 6); st.aim = e.aim; }
    else if (k === 'splitter') {
      if (e.def.filter) st.mark = e.filter >= 0 ? ITEMS[e.filter].color : null;
      const want = ((e.rot + [3, 0, 1][(e.rr + 2) % 3]) & 3) * Math.PI / 2;
      e.aim += Math.atan2(Math.sin(want - e.aim), Math.cos(want - e.aim)) * Math.min(1, o.dt * 14); st.aim = e.aim;
    }
    // apparition : le bâtiment tombe en place et rebondit
    const age = (tick - e.born) / 16;
    c.save();
    c.translate(e.cx, e.cy);
    if (age >= 0 && age < 1) { const b = 1 + 2.2 * Math.pow(age - 1, 3) + 1.2 * Math.pow(age - 1, 2); c.translate(0, e.h / 2); c.scale(0.9 + 0.1 * b, b); c.translate(0, -e.h / 2); }
    else if (e.pulse > 0.6 && (k === 'machine' || k === 'miner')) { const q = (e.pulse - 0.6) * 0.06; c.translate(0, e.h / 2); c.scale(1 + q, 1 - q); c.translate(0, -e.h / 2); }
    drawSprite(c, e.def.key, st);
    c.restore();
    // fumée
    const stacks = STACKS[e.def.key];
    if (stacks && e.act > 0.25 && detail && Math.random() < o.dt * 5 * e.act && this.parts.length < 1100) {
      const [dx, dy, zz] = stacks[(Math.random() * stacks.length) | 0];
      this.parts.push({ x: e.cx + dx, y: e.cy + dy - zz * K, vx: (g.wind - 0.3) * 0.9, vy: -0.9 - Math.random() * 0.4, life: 0, max: 1.8 + Math.random() * 1.2, size: 0.14 + Math.random() * 0.1, color: e.def.key === 'charbonniere' || e.def.key === 'bruleur' ? 'rgba(52,50,58,' : 'rgba(205,200,190,', kind: 0, rot: 0 });
    }
    if (e.def.key === 'puits' || e.def.key === 'foreuse') { if (e.act > 0.3 && detail && Math.random() < o.dt * 5) this.burst('chip', e.cx + (Math.random() - 0.5) * 1.4, e.cy + (Math.random() - 0.5) * 1.2, st.color, 1); }
  }

  private player(c: Ctx, p: PlayerView, o: RenderOpts, night: number): void {
    // l'éclair de construction : un trait du bâtisseur à ce qu'il vient de poser
    if (p.beam > 0.02) {
      c.strokeStyle = p.color; c.globalAlpha = p.beam; c.lineWidth = 0.05 + 0.12 * p.beam; c.lineCap = 'round';
      c.beginPath(); c.moveTo(p.x, p.y - 0.35); c.lineTo(p.cx + 0.5, p.cy + 0.5); c.stroke(); c.globalAlpha = 1;
    }
    drawCritter(c, p, o.time, night);
    if (p.gprog > 0) {
      const x = p.gx + 0.5, y = p.gy + 0.5;
      c.strokeStyle = PAL.ink; c.lineWidth = 0.16; c.beginPath(); c.arc(x, y, 0.52, 0, TAU); c.stroke();
      c.strokeStyle = p.color; c.lineWidth = 0.1; c.lineCap = 'butt'; c.beginPath(); c.arc(x, y, 0.52, -Math.PI / 2, -Math.PI / 2 + TAU * p.gprog); c.stroke();
    }
  }

  private particles(c: Ctx, dt: number, wind: number): void {
    const ps = this.parts;
    let j = 0;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      p.life += dt;
      if (p.life >= p.max) continue;
      const f = p.life / p.max;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.kind === 0) { p.vx += (wind * 0.6 - p.vx) * dt; p.vy *= 1 - dt * 0.6; c.fillStyle = `${p.color}${(0.3 * (1 - f) * Math.min(1, f * 8)).toFixed(3)})`; c.beginPath(); c.arc(p.x, p.y, p.size * (1 + f * 1.8), 0, TAU); c.fill(); }
      else {
        p.vy += dt * (p.kind === 2 ? 2.2 : 7); p.vx *= 1 - dt * 2;
        c.globalAlpha = 1 - f * f; c.fillStyle = p.color;
        if (p.kind === 2) { p.rot += dt * 7; c.beginPath(); c.ellipse(p.x, p.y, p.size, p.size * 0.45, p.rot, 0, TAU); c.fill(); }
        else c.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        c.globalAlpha = 1;
      }
      ps[j++] = p;
    }
    ps.length = j;
  }

  private halo(c: Ctx, x: number, y: number, r: number, color: string, alpha: number): void {
    if (alpha <= 0.01) return;
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.globalAlpha = Math.min(1, alpha); c.fillStyle = g;
    c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
    c.globalAlpha = 1;
  }

  /** Zone d'action de la scierie. */
  private ranges(c: Ctx, key: string, x: number, y: number, w: number, h: number): void {
    if (B[key].kind !== 'sawmill') return;
    c.strokeStyle = 'rgba(251,247,238,0.75)'; c.lineWidth = 0.05; c.setLineDash([0.22, 0.2]); c.lineDashOffset = -this.time * 0.6;
    c.beginPath(); c.arc(x + w / 2, y + h / 2, SAW_RANGE + 0.4, 0, TAU); c.stroke(); c.setLineDash([]);
  }

  /** Tracé de convoyeur avant la pose : chaque case et son sens ; au bout, la bouche s'il se raccorde. */
  private routeGhost(c: Ctx, p: PlayerView, o: RenderOpts): void {
    const r = p.route!;
    c.save();
    c.lineJoin = 'round'; c.lineCap = 'butt';
    for (const t of r) {
      c.fillStyle = t.ok ? 'rgba(127,240,210,0.16)' : 'rgba(255,90,70,0.3)';
      c.fillRect(t.x, t.y, 1, 1);
    }
    // le tapis, d'un seul trait, comme il sera
    c.globalAlpha = 0.75; c.beginPath();
    for (let i = 0; i < r.length; i++) {
      const t = r[i], cx = t.x + 0.5, cy = t.y + 0.5, inDir = i > 0 ? r[i - 1].dir : t.dir;
      if (i === 0) c.moveTo(cx - DX[t.dir] * 0.5, cy - DY[t.dir] * 0.5);
      const ex = cx + DX[t.dir] * 0.5, ey = cy + DY[t.dir] * 0.5;
      if (inDir !== t.dir && inDir !== ((t.dir + 2) & 3)) c.arcTo(cx, cy, ex, ey, 0.5); else c.lineTo(ex, ey);
    }
    c.strokeStyle = PAL.steelHi; c.lineWidth = 0.84; c.stroke();
    c.strokeStyle = PAL.dark; c.lineWidth = 0.68; c.stroke();
    c.globalAlpha = 1;
    // le sens de marche, une flèche par case
    for (const t of r) {
      c.save(); c.translate(t.x + 0.5, t.y + 0.5); c.rotate(t.dir * Math.PI / 2);
      c.fillStyle = t.ok ? PAL.signal : '#FF6A5A'; c.beginPath(); c.moveTo(-0.12, -0.17); c.lineTo(0.17, 0); c.lineTo(-0.12, 0.17); c.closePath(); c.fill();
      c.restore();
    }
    const last = r[r.length - 1];
    if (last) {
      c.save(); c.translate(last.x + 0.5 + DX[last.dir] * 0.5, last.y + 0.5 + DY[last.dir] * 0.5); c.rotate(last.dir * Math.PI / 2);
      if (p.routeInto) {
        // raccordé : une bouche verte qui bat
        const b = 0.85 + 0.15 * Math.sin(o.time * 6);
        c.fillStyle = PAL.glow; c.globalAlpha = b; c.fillRect(-0.08, -0.46, 0.16, 0.92); c.globalAlpha = 1;
        c.strokeStyle = PAL.ink; c.lineWidth = 0.04; c.strokeRect(-0.08, -0.46, 0.16, 0.92);
      } else {
        // ligne morte : un butoir
        c.fillStyle = PAL.signal; c.fillRect(-0.1, -0.42, 0.1, 0.84);
      }
      c.restore();
    }
    c.restore();
  }

  /** Convoyeur en main : les entrées de la Tour s'allument, on voit où viser. */
  private hubMouths(c: Ctx, g: Game, o: RenderOpts): void {
    const h = g.hub;
    if (!h) return;
    const b = Math.abs(Math.sin(o.time * 3.2)) * 0.18;
    for (let d = 0; d < 4; d++) {
      // milieu de chaque face, une case au-dehors, flèche vers l'intérieur
      const mx = h.x + (h.w - 1) / 2 + 0.5, my = h.y + (h.h - 1) / 2 + 0.5;
      const px = mx + DX[d] * (h.w / 2 + 0.5), py = my + DY[d] * (h.h / 2 + 0.5);
      // côté pris : un bâtiment, ou un tapis qui entre déjà ; un tapis qui passe à côté laisse l'entrée libre
      const occ = g.entAt(Math.floor(px), Math.floor(py));
      if (occ && (occ.def.kind !== 'belt' || occ.rot === ((d + 2) & 3))) continue;
      c.save(); c.translate(px, py); c.rotate(((d + 2) & 3) * Math.PI / 2);
      c.globalAlpha = 0.85;
      c.fillStyle = PAL.signal; c.strokeStyle = PAL.ink; c.lineWidth = 0.04;
      c.beginPath(); c.moveTo(-0.3 + b, -0.3); c.lineTo(0.18 + b, 0); c.lineTo(-0.3 + b, 0.3); c.closePath(); c.fill(); c.stroke();
      c.restore();
    }
    c.globalAlpha = 1;
  }

  private ghost(c: Ctx, g: Game, p: PlayerView, o: RenderOpts): void {
    if (!p.tool) return;
    if (p.tool === 'demolir') {
      const e = g.entAt(p.cx, p.cy);
      const x = e ? e.x : p.cx, y = e ? e.y : p.cy, w = e ? e.w : 1, h = e ? e.h : 1;
      c.fillStyle = 'rgba(255,90,70,0.28)'; c.fillRect(x, y, w, h);
      c.strokeStyle = '#FF6A5A'; c.lineWidth = 0.08; c.strokeRect(x, y, w, h);
      c.beginPath(); c.moveTo(x + 0.2, y + 0.2); c.lineTo(x + w - 0.2, y + h - 0.2); c.moveTo(x + w - 0.2, y + 0.2); c.lineTo(x + 0.2, y + h - 0.2); c.stroke();
      return;
    }
    const def = B[p.tool];
    if (def.kind === 'belt') this.hubMouths(c, g, o);
    if (def.kind === 'belt' && p.route) { this.routeGhost(c, p, o); return; }
    const [fw, fh] = g.footprint(def, p.rot);
    const ok = p.ok, col = ok ? PAL.glow : '#FF6A5A';
    c.fillStyle = ok ? 'rgba(127,240,210,0.2)' : 'rgba(255,90,70,0.28)';
    c.fillRect(p.ox, p.oy, fw, fh);
    c.strokeStyle = col; c.lineWidth = 0.06; c.setLineDash([0.2, 0.14]); c.lineDashOffset = -o.time; c.strokeRect(p.ox, p.oy, fw, fh); c.setLineDash([]);
    c.save();
    c.globalAlpha = 0.72;
    c.translate(p.ox + fw / 2, p.oy + fh / 2);
    if (def.kind === 'belt') {
      c.rotate(p.rot * Math.PI / 2);
      c.fillStyle = PAL.steelHi; c.fillRect(-0.5, -0.42, 1, 0.84); c.fillStyle = PAL.dark; c.fillRect(-0.5, -0.34, 1, 0.68);
      c.fillStyle = PAL.signal; c.beginPath(); c.moveTo(-0.14, -0.2); c.lineTo(0.2, 0); c.lineTo(-0.14, 0.2); c.closePath(); c.fill();
    } else if (def.kind === 'slab') { c.fillStyle = PAL.roof; c.fillRect(-0.47, -0.47, 0.94, 0.94); }
    else drawSprite(c, def.key, { ...IDLE, w: fw, h: fh, rot: p.rot, time: o.time, level: 0, plinth: plinthOf(def.key) });
    c.restore();
    this.ranges(c, def.key, p.ox, p.oy, fw, fh);
    // la sortie de la machine, bien visible avant de poser
    const fake = { def, x: p.ox, y: p.oy, w: fw, h: fh, rot: p.rot } as Ent;
    if (def.kind !== 'splitter') for (const [px, py, d] of outputPorts(fake)) {
      const b = Math.abs(Math.sin(o.time * 3.5)) * 0.15;
      c.save(); c.translate(px + 0.5, py + 0.5); c.rotate(d * Math.PI / 2);
      c.fillStyle = PAL.signal; c.strokeStyle = PAL.ink; c.lineWidth = 0.04;
      c.beginPath(); c.moveTo(-0.34 + b, -0.28); c.lineTo(0.14 + b, 0); c.lineTo(-0.34 + b, 0.28); c.closePath(); c.fill(); c.stroke();
      c.restore();
    }
  }
}

/** Taille d'un arbre selon sa case : 0,8 à 1,15 ; un sur seize est un géant (1,5). Rendu seulement. */
function treeScale(h: number): number {
  const u = (h >>> 20) & 15;
  return u === 0 ? 1.5 : 0.8 + 0.35 * (((h >>> 24) & 255) / 255);
}

/** Espèce d'arbre d'une case : surtout des feuillus, quelques palmes, de rares arbres à fleurs. */
function variant(h: number): number {
  const v = (h >>> 16) % 16;
  return v < 10 ? v % 4 : v === 10 ? 4 : v < 15 ? 5 + (v % 2) : 7;
}
