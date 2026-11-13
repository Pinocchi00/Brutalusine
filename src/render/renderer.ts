// Rendu d'une vue : terrain en cache, ombres portées, rivières de lumière, bâtiments, éclairage du jour.

import { B, DX, DY, ITEMS, NITEMS, TILE_U, DEPOSITS, BELT_SPEED, type Shape } from '../sim/data';
import type { Game, PlaceResult } from '../sim/game';
import { SCRUB_RANGE, ACCU_CAP } from '../sim/game';
import { Status, type Ent } from '../sim/ent';
import { itemPosition, outputPorts } from '../sim/belts';
import { CHUNK, SMOKE_RES } from '../sim/world';
import { PAL, TerrainCache } from './terrain';
import { drawSprite, IDLE_STATE, type SpriteState } from './sprites';

export interface Camera { x: number; y: number; zoom: number; }
export interface View { cam: Camera; clip: [number, number][] | null; }
export interface PlayerView {
  x: number; y: number; color: string; fx: number; fy: number;
  cx: number; cy: number; tool: string | null; rot: number;
  ghost: PlaceResult | null; inReach: boolean; clearing: boolean; removing: boolean;
}
export interface Ring { x: number; y: number; t0: number; color: string; size: number; dur: number; }
export interface RenderOpts {
  time: number; frame: number; dt: number; players: PlayerView[]; selected: Ent | null; rings: Ring[]; reach: number;
}

type Ctx = CanvasRenderingContext2D;
const TAU = Math.PI * 2;
const tmp = { x: 0, y: 0, z: 0 };

function shapePath(c: Ctx, shape: Shape, x: number, y: number, r: number): void {
  switch (shape) {
    case 'rond': c.moveTo(x + r, y); c.arc(x, y, r, 0, TAU); break;
    case 'carre': c.rect(x - r * 0.85, y - r * 0.85, r * 1.7, r * 1.7); break;
    case 'losange': c.moveTo(x, y - r * 1.15); c.lineTo(x + r * 1.15, y); c.lineTo(x, y + r * 1.15); c.lineTo(x - r * 1.15, y); c.closePath(); break;
    case 'triangle': c.moveTo(x, y - r * 1.1); c.lineTo(x + r * 1.1, y + r * 0.85); c.lineTo(x - r * 1.1, y + r * 0.85); c.closePath(); break;
    case 'hexa': for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; if (i === 0) c.moveTo(x + r * 1.05, y); else c.lineTo(x + Math.cos(a) * r * 1.05, y + Math.sin(a) * r * 1.05); } c.closePath(); break;
    case 'goutte': c.moveTo(x, y - r * 1.35); c.quadraticCurveTo(x + r * 1.3, y + r * 0.2, x, y + r); c.quadraticCurveTo(x - r * 1.3, y + r * 0.2, x, y - r * 1.35); break;
  }
}

export function itemShapePath(c: Ctx, shape: Shape, x: number, y: number, r: number): void { shapePath(c, shape, x, y, r); }

export class Renderer {
  terrain = new TerrainCache();
  ctx: Ctx;
  private lo: number[][] = Array.from({ length: NITEMS }, () => []);
  private hi: number[][] = Array.from({ length: NITEMS }, () => []);
  private state: SpriteState = { ...IDLE_STATE };

  constructor(public canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
  }

  begin(g: Game, o: RenderOpts): void {
    this.terrain.beginFrame(o.frame);
    // phases d'animation : une machine ne tourne que si elle travaille
    for (const e of g.tickers) if (e.status === Status.Working) e.anim += o.dt * (g.regions[e.region]?.sat ?? 1);
    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = '#081E28';
    c.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  renderView(g: Game, v: View, o: RenderOpts): void {
    const c = this.ctx, W = this.canvas.width, H = this.canvas.height;
    const z = v.cam.zoom;
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    if (v.clip) { c.beginPath(); v.clip.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); c.clip(); }
    c.setTransform(z, 0, 0, z, Math.round(W / 2 - v.cam.x * z), Math.round(H / 2 - v.cam.y * z));
    const x0 = v.cam.x - W / 2 / z - 1, x1 = v.cam.x + W / 2 / z + 1;
    const y0 = v.cam.y - H / 2 / z - 1, y1 = v.cam.y + H / 2 / z + 1;
    const vis = (e: Ent, m = 0) => e.x + e.w + m > x0 && e.x - m < x1 && e.y + e.h + m > y0 && e.y - m < y1;
    const sun = g.sun, w = g.world;
    const detail = z >= 9;

    // --- terrain
    c.imageSmoothingEnabled = true;
    const cx0 = Math.floor(x0) >> 5, cx1 = Math.floor(x1) >> 5, cy0 = Math.floor(y0) >> 5, cy1 = Math.floor(y1) >> 5;
    const entries = [];
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      const ch = w.chunk(cx, cy, false);
      if (!ch) continue;
      const en = this.terrain.get(ch, w, o.frame);
      if (!en) continue;
      c.drawImage(en.canvas as CanvasImageSource, cx * CHUNK, cy * CHUNK, CHUNK + 0.02, CHUNK + 0.02);
      entries.push(en, ch);
    }

    // --- ombres portées (un seul tracé : les ombres se fondent sans se cumuler)
    const sh = sun.shadow, ox = -sun.sx * sh, oy = -sun.sy * sh;
    if (sun.day && sh > 0) {
      c.beginPath();
      // tous les sous-tracés dans le même sens : sinon la règle « nonzero » creuse des trous
      const quad = (x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, x4: number, y4: number) => {
        const area = (x2 - x1) * (y3 - y1) - (y2 - y1) * (x3 - x1);
        if (area >= 0) { c.moveTo(x1, y1); c.lineTo(x2, y2); c.lineTo(x3, y3); c.lineTo(x4, y4); }
        else { c.moveTo(x4, y4); c.lineTo(x3, y3); c.lineTo(x2, y2); c.lineTo(x1, y1); }
        c.closePath();
      };
      const add = (e: Ent) => {
        const hgt = e.height;
        if (hgt <= 0.15 || !vis(e, hgt * sh + 1)) return;
        const dx = ox * hgt, dy = oy * hgt;
        if (e.def.round) {
          const r = Math.min(e.w, e.h) / 2 - 0.04, len = Math.hypot(dx, dy) || 1, px = (-dy / len) * r, py = (dx / len) * r;
          c.moveTo(e.cx + r, e.cy); c.arc(e.cx, e.cy, r, 0, TAU);
          c.moveTo(e.cx + dx + r, e.cy + dy); c.arc(e.cx + dx, e.cy + dy, r, 0, TAU);
          quad(e.cx + px, e.cy + py, e.cx + dx + px, e.cy + dy + py, e.cx + dx - px, e.cy + dy - py, e.cx - px, e.cy - py);
        } else {
          const m = 0.05, ax = e.x + m, ay = e.y + m, bx = e.x + e.w - m, by = e.y + e.h - m;
          const pts = [ax, ay, bx, ay, bx, by, ax, by];
          c.rect(ax + dx, ay + dy, bx - ax, by - ay);
          for (let i = 0; i < 4; i++) {
            const j = (i + 1) % 4;
            quad(pts[i * 2], pts[i * 2 + 1], pts[j * 2], pts[j * 2 + 1], pts[j * 2] + dx, pts[j * 2 + 1] + dy, pts[i * 2] + dx, pts[i * 2 + 1] + dy);
          }
        }
      };
      for (const e of g.tickers) add(e);
      c.fillStyle = `rgba(46,28,112,${(0.34 * Math.min(1, sun.elev * 5)).toFixed(3)})`;
      c.fill('nonzero');
    }

    // --- convoyeurs : un seul tracé pour tous les chemins visibles
    const paths = g.paths;
    c.beginPath();
    const spans: Ent[] = [];
    for (let i = 0; i < paths.length; i++) {
      const p = paths[i];
      if (p.maxx + 7 < x0 || p.minx - 7 > x1 || p.maxy + 7 < y0 || p.miny - 7 > y1) continue;
      p.mark = 2;
      const t0 = p.tiles[0];
      c.moveTo(t0.x + 0.5 - DX[t0.inDir] * 0.5, t0.y + 0.5 - DY[t0.inDir] * 0.5);
      for (let k = 0; k < p.tiles.length; k++) {
        const t = p.tiles[k];
        c.lineTo(t.x + 0.5, t.y + 0.5);
        if (t.def.kind === 'bridge' && !t.isOut && t.pair) { spans.push(t); c.moveTo(t.pair.x + 0.5 - DX[t.rot] * 0.5, t.pair.y + 0.5 - DY[t.rot] * 0.5); }
      }
      const tl = p.tiles[p.tiles.length - 1];
      if (!(tl.def.kind === 'bridge' && !tl.isOut)) c.lineTo(tl.x + 0.5 + DX[tl.rot] * 0.5, tl.y + 0.5 + DY[tl.rot] * 0.5);
    }
    c.lineJoin = 'round'; c.lineCap = 'butt';
    c.strokeStyle = PAL.belt; c.lineWidth = 0.72; c.stroke();
    c.strokeStyle = '#2C2670'; c.lineWidth = 0.5; c.stroke();
    if (detail) {
      const sp = (BELT_SPEED * g.upgradeMult('convoyeurs') * 60) / TILE_U;
      c.strokeStyle = PAL.beltHi; c.lineWidth = 0.07;
      c.setLineDash([0.1, 0.4]); c.lineDashOffset = -((o.time * sp) % 0.5);
      c.stroke(); c.setLineDash([]);
    }

    // --- objets : les rivières de lumière
    const lo = this.lo, hi = this.hi;
    for (let i = 0; i < NITEMS; i++) { lo[i].length = 0; hi[i].length = 0; }
    for (let i = 0; i < paths.length; i++) {
      const p = paths[i];
      if (p.mark !== 2) continue;
      p.mark = 1;
      let dist = 0;
      for (let k = p.head; k < p.types.length; k++) {
        dist += p.gaps[k];
        itemPosition(p, p.length - dist, tmp);
        if (tmp.x < x0 || tmp.x > x1 || tmp.y < y0 || tmp.y > y1) continue;
        (tmp.z > 0.05 ? hi : lo)[p.types[k]].push(tmp.x, tmp.y - tmp.z * 0.18);
      }
    }
    this.drawItems(c, lo, detail, 1);

    // --- ponts : une arche d'os par-dessus
    for (const t of spans) {
      const ax = t.x + 0.5, ay = t.y + 0.5, bx = t.pair!.x + 0.5, by = t.pair!.y + 0.5;
      c.lineCap = 'round';
      c.strokeStyle = 'rgba(46,28,112,0.25)'; c.lineWidth = 0.6;
      c.beginPath(); c.moveTo(ax + 0.12, ay + 0.16); c.lineTo(bx + 0.12, by + 0.16); c.stroke();
      c.strokeStyle = PAL.edge; c.lineWidth = 0.66; c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.stroke();
      c.strokeStyle = PAL.bone; c.lineWidth = 0.56; c.stroke();
      c.strokeStyle = PAL.belt; c.lineWidth = 0.34; c.stroke();
    }
    this.drawItems(c, hi, detail, 1.12);

    // --- bâtiments
    const st = this.state;
    st.night = sun.night;
    const drawEnt = (e: Ent) => {
      if (!vis(e, 1)) return;
      const k = e.def.kind;
      st.anim = k === 'tree' || k === 'ring' || k === 'hub' ? o.time + e.id : e.anim;
      st.active = e.status === Status.Working;
      st.progress = e.recipe && e.working ? e.progress / e.recipe.time : 0;
      st.color = PAL.gold; st.level = 0; st.mark = null; st.flag = e.isOut;
      if (e.recipe && e.recipe.outputs.length) st.color = ITEMS[e.recipe.outputs[0][0]].color;
      if (k === 'hub') st.level = e.level;
      else if (k === 'solar') st.level = e.light;
      else if (k === 'battery') st.level = e.energy / ACCU_CAP;
      else if (k === 'tree' || k === 'ring') st.level = e.health;
      else if (k === 'miner') { const cells = e.cells!; const i = (e.ptr % (cells.length >> 1)) * 2; const d = w.deposit(cells[i], cells[i + 1]); st.color = d ? DEPOSITS[d]!.color : '#5E2A14'; }
      else if (k === 'splitter') st.mark = e.filter >= 0 ? ITEMS[e.filter].color : null;
      c.save();
      c.translate(e.cx, e.cy);
      if (k !== 'hub' && k !== 'tree') c.rotate(e.rot * Math.PI / 2);
      drawSprite(c, e.def.key, st);
      c.restore();
    };
    for (const e of g.belts) if (e.def.kind === 'bridge') drawEnt(e);
    for (const e of g.trees) if (e.def.kind === 'tree') drawEnt(e);
    for (const e of g.tickers) drawEnt(e);

    // --- pictogrammes de cause : ce qui manque se voit sur la machine
    if (detail) {
      const pulse = 0.75 + 0.25 * Math.sin(o.time * 4);
      for (const e of g.tickers) {
        const s = e.status;
        if (s === Status.Working || s === Status.Idle || s === Status.Dark || !vis(e)) continue;
        if (e.def.kind === 'splitter' || e.def.kind === 'hub') continue;
        const bx = e.x + e.w - 0.3, by = e.y + 0.3;
        c.globalAlpha = pulse;
        c.fillStyle = PAL.ink; c.beginPath(); c.arc(bx, by, 0.3, 0, TAU); c.fill();
        c.strokeStyle = PAL.boneLight; c.lineWidth = 0.05; c.stroke();
        c.globalAlpha = 1;
        if (s === Status.NoInput && e.missing >= 0) {
          const it = ITEMS[e.missing];
          c.fillStyle = it.color; c.beginPath(); shapePath(c, it.shape, bx, by, 0.14); c.fill();
        } else if (s === Status.Blocked) {
          c.fillStyle = PAL.boneLight; c.fillRect(bx - 0.13, by - 0.13, 0.09, 0.26); c.fillRect(bx + 0.04, by - 0.13, 0.09, 0.26);
        } else if (s === Status.NoPower) {
          c.fillStyle = PAL.gold; c.beginPath();
          c.moveTo(bx + 0.04, by - 0.2); c.lineTo(bx - 0.12, by + 0.03); c.lineTo(bx - 0.01, by + 0.03); c.lineTo(bx - 0.05, by + 0.2); c.lineTo(bx + 0.12, by - 0.04); c.lineTo(bx + 0.01, by - 0.04); c.closePath(); c.fill();
        } else {
          c.strokeStyle = PAL.boneLight; c.lineWidth = 0.06; c.beginPath(); c.arc(bx, by, 0.12, 0, TAU); c.moveTo(bx - 0.1, by + 0.1); c.lineTo(bx + 0.1, by - 0.1); c.stroke();
        }
      }
    }

    // --- bâtisseurs
    for (const p of o.players) {
      c.fillStyle = 'rgba(27,20,70,0.35)'; c.beginPath(); c.ellipse(p.x + 0.08, p.y + 0.14, 0.34, 0.26, 0, 0, TAU); c.fill();
      c.fillStyle = PAL.boneLight; c.beginPath(); c.arc(p.x, p.y, 0.33, 0, TAU); c.fill();
      c.strokeStyle = p.color; c.lineWidth = 0.11; c.stroke();
      c.fillStyle = PAL.ink; c.beginPath(); c.arc(p.x + p.fx * 0.14, p.y + p.fy * 0.14, 0.1, 0, TAU); c.fill();
    }

    // --- fumée
    for (let i = 0; i < entries.length; i += 2) {
      const ch = entries[i + 1] as typeof w.list[number];
      const sm = ch.smoke;
      for (let k = 0; k < SMOKE_RES * SMOKE_RES; k++) {
        const s = sm[k];
        if (s < 0.4) continue;
        const sx = ch.cx * CHUNK + (k % SMOKE_RES) * 4 + 2 + Math.sin(o.time * 0.4 + k) * 0.6;
        const sy = ch.cy * CHUNK + ((k / SMOKE_RES) | 0) * 4 + 2 + Math.cos(o.time * 0.3 + k * 1.7) * 0.6;
        c.fillStyle = `rgba(70,58,120,${Math.min(0.42, s / 22).toFixed(3)})`;
        c.beginPath(); c.arc(sx, sy, 2.3 + Math.min(2.2, s / 10), 0, TAU); c.fill();
      }
    }

    // --- lumière du jour : dorée au matin et au soir, bleue la nuit
    const gold = sun.day ? Math.max(0, 1 - sun.elev / 0.55) : 1;
    const n = sun.night;
    const lr = Math.round((255 - 0 * gold) * (1 - n) + 86 * n), lg = Math.round((255 - 44 * gold) * (1 - n) + 108 * n), lb = Math.round((255 - 96 * gold) * (1 - n) + 208 * n);
    if (gold > 0.01 || n > 0.01) {
      c.globalCompositeOperation = 'multiply';
      c.fillStyle = `rgb(${lr},${lg},${lb})`;
      c.fillRect(x0, y0, x1 - x0, y1 - y0);
    }

    // --- lueurs
    c.globalCompositeOperation = 'lighter';
    if (n > 0.05 && detail) {
      c.globalAlpha = Math.min(1, n * 1.1);
      this.drawItems(c, lo, true, 1.25);
      this.drawItems(c, hi, true, 1.4);
    }
    for (const e of g.tickers) {
      if (!vis(e, 2)) continue;
      const k = e.def.kind;
      if (k === 'ring') this.halo(c, e.cx, e.cy, 2.2, PAL.glow, 0.3 * e.health * (0.4 + n));
      else if (e.status === Status.Working && (k === 'machine' || k === 'generator' || k === 'miner')) {
        const col = k === 'generator' ? '#FF7A2F' : e.recipe && e.recipe.outputs.length ? ITEMS[e.recipe.outputs[0][0]].color : PAL.ore;
        this.halo(c, e.cx, e.cy, Math.max(e.w, e.h) * 0.7, col, 0.1 + 0.3 * n);
      } else if (k === 'hub') {
        this.halo(c, e.cx, e.cy, 2.4, PAL.gold, 0.18 + 0.3 * n);
        if (n > 0.2) {                             // le phare de la Tour balaie la nuit
          const a = o.time * 0.35, L = 16 + e.level * 2;
          const gr = c.createRadialGradient(e.cx, e.cy, 0.5, e.cx, e.cy, L);
          gr.addColorStop(0, `rgba(255,220,150,${(0.3 * n).toFixed(3)})`); gr.addColorStop(1, 'rgba(255,220,150,0)');
          c.fillStyle = gr; c.globalAlpha = 1;
          c.beginPath(); c.moveTo(e.cx, e.cy); c.arc(e.cx, e.cy, L, a - 0.16, a + 0.16); c.closePath(); c.fill();
        }
      }
    }
    for (const e of g.trees) if (e.def.kind === 'tree' && vis(e, 2)) this.halo(c, e.cx, e.cy, 1.9, PAL.glow, 0.28 * e.health * (0.35 + n));
    if (n > 0.05 || g.bloom > 0) {
      for (let i = 0; i < entries.length; i += 2) {
        const en = entries[i] as ReturnType<TerrainCache['get']> & {};
        c.fillStyle = PAL.glow;
        c.globalAlpha = Math.min(1, n * 1.2);
        c.beginPath();
        for (let k = 0; k < en.glows.length; k += 2) {
          const tw = 0.1 + 0.05 * Math.sin(o.time * 1.5 + en.glows[k] * 3.1);
          c.moveTo(en.glows[k] + tw, en.glows[k + 1]); c.arc(en.glows[k], en.glows[k + 1], tw, 0, TAU);
          if (detail) { c.moveTo(en.glows[k] + 0.45, en.glows[k + 1]); c.arc(en.glows[k], en.glows[k + 1], 0.45, 0, TAU); }
        }
        c.globalAlpha = Math.min(1, n * 1.2) * 0.5; c.fill();
        if (g.bloom > 0.02) {                        // floraison : la jungle répond
          c.fillStyle = PAL.pink; c.globalAlpha = g.bloom * 0.9;
          c.beginPath();
          for (let k = 0; k < en.flowers.length; k += 2) {
            const r = 0.13 + 0.05 * Math.sin(o.time * 2 + en.flowers[k]);
            c.moveTo(en.flowers[k] + r, en.flowers[k + 1]); c.arc(en.flowers[k], en.flowers[k + 1], r, 0, TAU);
          }
          c.fill();
        }
      }
    }
    if (n > 0.1) for (const p of o.players) this.halo(c, p.x, p.y, 7, '#FFE9C0', 0.3 * n);
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';

    // --- ondes (quota, pose, démolition)
    for (const r of o.rings) {
      const t = (o.time - r.t0) / r.dur;
      if (t < 0 || t > 1) continue;
      const ease = 1 - (1 - t) * (1 - t);
      c.strokeStyle = r.color; c.globalAlpha = 1 - t; c.lineWidth = 0.08 + r.size * 0.02 * (1 - t);
      c.beginPath(); c.arc(r.x, r.y, 0.3 + r.size * ease, 0, TAU); c.stroke();
    }
    c.globalAlpha = 1;

    // --- sélection et aperçus de construction
    if (o.selected && !o.selected.dead) {
      const e = o.selected;
      c.strokeStyle = PAL.gold; c.lineWidth = 0.09; c.setLineDash([0.3, 0.2]); c.lineDashOffset = -o.time;
      c.strokeRect(e.x - 0.08, e.y - 0.08, e.w + 0.16, e.h + 0.16); c.setLineDash([]);
      this.ranges(c, g, e.def.key, e.x, e.y, e.w, e.h);
    }
    for (const p of o.players) this.ghost(c, g, p, o);
    c.restore();
  }

  private halo(c: Ctx, x: number, y: number, r: number, color: string, alpha: number): void {
    if (alpha <= 0.005) return;
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.globalAlpha = Math.min(1, alpha); c.fillStyle = g;
    c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
    c.globalAlpha = 1;
  }

  private drawItems(c: Ctx, buf: number[][], detail: boolean, scale: number): void {
    for (let t = 0; t < NITEMS; t++) {
      const a = buf[t];
      if (!a.length) continue;
      const it = ITEMS[t];
      c.fillStyle = it.color;
      c.beginPath();
      if (detail) for (let i = 0; i < a.length; i += 2) shapePath(c, it.shape, a[i], a[i + 1], 0.155 * scale);
      else for (let i = 0; i < a.length; i += 2) c.rect(a[i] - 0.17, a[i + 1] - 0.17, 0.34, 0.34);
      c.fill();
    }
  }

  /** Zones d'action : portée du puits, de la scierie, de l'épurateur. */
  private ranges(c: Ctx, g: Game, key: string, x: number, y: number, w: number, h: number): void {
    c.strokeStyle = 'rgba(251,245,234,0.8)'; c.lineWidth = 0.05; c.setLineDash([0.2, 0.2]);
    const kind = B[key].kind;
    if (kind === 'miner') c.strokeRect(x - 1, y - 1, w + 2, h + 2);
    else if (kind === 'sawmill') { c.beginPath(); c.arc(x + w / 2, y + h / 2, 5.3, 0, TAU); c.stroke(); }
    else if (kind === 'scrubber') c.strokeRect(x + w / 2 - SCRUB_RANGE, y + h / 2 - SCRUB_RANGE, SCRUB_RANGE * 2, SCRUB_RANGE * 2);
    else if (kind === 'ring' || kind === 'tree') { c.beginPath(); c.arc(x + w / 2, y + h / 2, 7.5, 0, TAU); c.stroke(); }
    c.setLineDash([]);
  }

  private ghost(c: Ctx, g: Game, p: PlayerView, o: RenderOpts): void {
    if (p.clearing) {
      c.strokeStyle = '#B9F24A'; c.lineWidth = 0.07; c.setLineDash([0.25, 0.15]); c.lineDashOffset = o.time * 2;
      c.beginPath(); c.arc(p.cx + 0.5, p.cy + 0.5, 1.6, 0, TAU); c.stroke(); c.setLineDash([]);
      return;
    }
    if (!p.tool) {
      c.strokeStyle = p.removing ? PAL.pink : 'rgba(251,245,234,0.55)'; c.lineWidth = 0.06;
      c.strokeRect(p.cx + 0.04, p.cy + 0.04, 0.92, 0.92);
      return;
    }
    const def = B[p.tool];
    const [fw, fh] = g.footprint(def, p.rot);
    const ok = !!p.ghost?.ok && p.inReach;
    c.fillStyle = ok ? 'rgba(140,251,232,0.22)' : 'rgba(240,85,154,0.3)';
    c.fillRect(p.cx, p.cy, fw, fh);
    c.strokeStyle = ok ? PAL.glow : PAL.pink; c.lineWidth = 0.07;
    c.strokeRect(p.cx, p.cy, fw, fh);
    c.save();
    c.globalAlpha = 0.7;
    c.translate(p.cx + fw / 2, p.cy + fh / 2);
    if (def.kind === 'belt') {
      c.rotate(p.rot * Math.PI / 2);
      c.fillStyle = PAL.belt; c.fillRect(-0.5, -0.34, 1, 0.68);
      c.fillStyle = PAL.boneLight; c.beginPath(); c.moveTo(-0.14, -0.2); c.lineTo(0.2, 0); c.lineTo(-0.14, 0.2); c.closePath(); c.fill();
    } else if (def.kind === 'slab') {
      c.fillStyle = PAL.bone; c.fillRect(-0.46, -0.46, 0.92, 0.92);
    } else {
      c.rotate(p.rot * Math.PI / 2);
      drawSprite(c, def.key, { ...IDLE_STATE, level: def.kind === 'ring' ? 1 : 0 });
    }
    c.restore();
    this.ranges(c, g, def.key, p.cx, p.cy, fw, fh);
    // la sortie de la machine, bien visible avant de poser
    const fake = { def, x: p.cx, y: p.cy, w: fw, h: fh, rot: p.rot } as Ent;
    for (const [px, py, d] of outputPorts(fake)) {
      if (def.kind === 'splitter') continue;
      c.fillStyle = PAL.gold;
      c.save(); c.translate(px + 0.5, py + 0.5); c.rotate(d * Math.PI / 2);
      c.beginPath(); c.moveTo(-0.3, -0.25); c.lineTo(0.15, 0); c.lineTo(-0.3, 0.25); c.closePath(); c.fill();
      c.restore();
    }
    if (!p.inReach) {
      c.strokeStyle = 'rgba(240,85,154,0.6)'; c.lineWidth = 0.05; c.setLineDash([0.3, 0.3]);
      c.beginPath(); c.arc(p.x, p.y, o.reach, 0, TAU); c.stroke(); c.setLineDash([]);
    }
  }
}
