/**
 * Le rendu pixel complet du jeu : sol en cache, tapis, ombres, objets hauts, effets, repères
 * et lumière. Il assemble les modules de `src/render/px/` et laisse l'ancien rendu intact.
 */
import type { Game } from '../../sim/game';
import type { Ent } from '../../sim/ent';
import { Status } from '../../sim/ent';
import { B, DX, DY, TREE_MIN } from '../../sim/data';
import { outputPorts } from '../../sim/belts';
import { CHUNK } from '../../sim/world';
import type { Camera, PlayerView, RenderOpts, Ring, RouteView } from '../renderer';
import { computeView, TILE_PX, type PixelView } from './view';
import { DrawQueue } from './scene';
import { C } from './palette';
import { hash } from './noise';
import { pen, type Pen } from './pen';
import { animTime } from './clock';
import { PixelFx, type BurstKind } from './fx';
import { GroundCache } from './ground';
import { drawBelts } from './belts';
import { drawLights } from './lights';
import {
  placeholderBuilder,
  placeholderDeposit,
  placeholderItem,
  placeholderSprite,
  placeholderTree,
  type DepositType,
} from './placeholders';
import { castShadow, type Sprite } from './sprite';
import {
  drawBrackets,
  drawCauseBubble,
  drawGhost,
  drawHubMouths,
  drawMarker,
  drawRange,
  drawRing,
  drawRoute,
} from './overlays';
import { chev } from './volumes';

/** Le rayon du houppier d'un arbre provisoire, en pixels, selon sa taille. */
const TREE_RADIUS: Record<1 | 2 | 3, number> = { 1: 10, 2: 14, 3: 18 };

/** Une entité visible et son volume provisoire, retenus pour les bulles de cause. */
interface Shown {
  e: Ent;
  sprite: Sprite;
}

/** Un bâtiment dont les lumières sont redessinées par-dessus le filtre de la nuit. */
interface LitBuilding {
  sprite: Sprite;
  X: number;
  Y: number;
}

/** Tout ce qu'une image a besoin de partager entre ses étapes. */
interface Frame {
  g: Game;
  opts: RenderOpts;
  view: PixelView;
  ctx: CanvasRenderingContext2D;
  P: Pen;
  now: number;
  shown: Shown[];
}

/** La taille de houppier à donner à un arbre selon sa canopée (0-255). */
function treeSize(canopy: number): 1 | 2 | 3 {
  return canopy < 100 ? 1 : canopy < 190 ? 2 : 3;
}

/** Une pousse d'arbre : deux feuilles de quelques pixels qui ondulent un peu. */
function drawSapling(P: Pen, tx: number, ty: number, now: number): void {
  const x = tx * TILE_PX + TILE_PX / 2;
  const y = ty * TILE_PX + TILE_PX * 0.78;
  const sway = Math.round(Math.sin(now * 1.2 + tx * 0.4 + ty * 0.3) * 0.6);
  P.ell(x - 3 + sway, y - 2, 4, 2, C.g3);
  P.ell(x + 3 + sway, y - 2, 4, 2, C.g3);
  P.ell(x - 2 + sway, y - 3, 3, 1.5, C.g2);
  P.ell(x + 4 + sway, y - 3, 3, 1.5, C.g2);
}

/** La goulotte de sortie : un chevron orange sur le bord du bâtiment, dans le sens de `rot`. */
function drawChute(P: Pen, e: Ent): void {
  const d = e.rot;
  const cx = (e.x + e.w / 2) * TILE_PX;
  const cy = (e.y + e.h / 2) * TILE_PX;
  const x = d === 0 ? (e.x + e.w) * TILE_PX - 4 : d === 2 ? e.x * TILE_PX + 4 : cx;
  const y = d === 1 ? (e.y + e.h) * TILE_PX - 4 : d === 3 ? e.y * TILE_PX + 4 : cy;
  chev(P, Math.round(x) + 1, Math.round(y) + 1, d, C.ink);
  chev(P, Math.round(x), Math.round(y), d, C.o1);
}

/** Le rendu pixel : mêmes méthodes publiques que l'ancien `Renderer`. */
export class PxRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly ground = new GroundCache();
  private readonly fx = new PixelFx();
  private readonly queue = new DrawQueue();
  private readonly lit: LitBuilding[] = [];
  private buffer: HTMLCanvasElement | null = null;
  private bufferCtx: CanvasRenderingContext2D | null = null;
  private bufW = 0;
  private bufH = 0;
  private now = 0;

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Contexte 2D indisponible');
    this.canvas = canvas;
    this.ctx = ctx;
  }

  /** Oublie le sol peint, les particules et les chutes. */
  reset(): void {
    this.queue.clear();
    this.ground.clear();
    this.fx.reset();
    this.lit.length = 0;
    this.now = 0;
  }

  /** Lance une rafale de particules autour d'une case. */
  burst(kind: BurstKind, x: number, y: number, color: string, n: number): void {
    this.fx.burst(kind, x, y, color, n);
  }

  /** Retient le coup porté à un arbre ; il tremblera à la prochaine image. */
  hit(x: number, y: number): void {
    this.fx.hit(x, y, this.now);
  }

  /** Lance un arbre abattu avec l'image de son houppier. */
  fell(g: Game, x: number, y: number, size: number): void {
    const sprite = placeholderTree(treeSize(size));
    this.fx.fell(x, y, size, this.now, sprite.img);
    this.fx.burst('leaf', x, y - 0.2, C.g2, 10);
    this.fx.burst('dust', x, y + 0.1, C.c3, 4);
  }

  /** Dessine une image complète : tampon à l'échelle entière, puis pose à l'écran sans lissage. */
  render(g: Game, cam: Camera, opts: RenderOpts): void {
    const scale = Math.max(1, Math.round(cam.zoom / TILE_PX));
    const view = computeView(cam.x, cam.y, scale, this.canvas.width, this.canvas.height, 4);
    const ctx = this.ensureBuffer(view.bufW, view.bufH);
    this.now = animTime(opts.time);
    this.fx.update(opts.dt, g.wind);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#0e2a24';
    ctx.fillRect(0, 0, view.bufW, view.bufH);
    ctx.setTransform(1, 0, 0, 1, -view.originX, -view.originY);

    const frame: Frame = { g, opts, view, ctx, P: pen(ctx), now: this.now, shown: [] };
    const fade = g.sun.day ? Math.min(1, g.sun.elev * 4) : 0;
    this.lit.length = 0;
    this.addGround(frame);
    this.addBelts(frame);
    this.queue.add('cast', () => { ctx.globalAlpha = fade; });
    this.addTrees(frame);
    this.addBuildings(frame);
    this.queue.add('cast', () => { ctx.globalAlpha = 1; });
    this.addPlayers(frame);
    this.addEffects(frame);
    this.addLight(frame);
    this.queue.flush();
    this.blit(view);
  }

  /** Ajoute les blocs de sol visibles à la file de dessin. */
  private addGround(f: Frame): void {
    const { view, ctx, g } = f;
    const cx0 = Math.floor(view.tileX0 / CHUNK);
    const cx1 = Math.floor(view.tileX1 / CHUNK);
    const cy0 = Math.floor(view.tileY0 / CHUNK);
    const cy1 = Math.floor(view.tileY1 / CHUNK);
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const chunk = g.world.chunk(cx, cy, false);
        if (!chunk) continue;
        const image = this.ground.get(chunk, g.world, f.opts.frame);
        const X = cx * CHUNK * TILE_PX;
        const Y = cy * CHUNK * TILE_PX;
        this.queue.add('ground', () => ctx.drawImage(image, X, Y));
      }
    }
  }

  /** Ajoute les tapis et les objets qui glissent dessus. */
  private addBelts(f: Frame): void {
    const { g, view, ctx } = f;
    this.queue.add('flat', () => drawBelts(ctx, g, view.tileX0, view.tileY0, view.tileX1, view.tileY1, placeholderItem));
  }

  /** Ajoute les arbres, les pousses et les gisements visibles. */
  private addTrees(f: Frame): void {
    const { g, view } = f;
    const cx0 = Math.floor(view.tileX0 / CHUNK);
    const cx1 = Math.floor(view.tileX1 / CHUNK);
    const cy0 = Math.floor(view.tileY0 / CHUNK);
    const cy1 = Math.floor(view.tileY1 / CHUNK);
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const chunk = g.world.chunk(cx, cy, false);
        if (!chunk) continue;
        const lx0 = Math.max(0, view.tileX0 - cx * CHUNK);
        const lx1 = Math.min(CHUNK - 1, view.tileX1 - cx * CHUNK);
        const ly0 = Math.max(0, view.tileY0 - cy * CHUNK);
        const ly1 = Math.min(CHUNK - 1, view.tileY1 - cy * CHUNK);
        for (let ly = ly0; ly <= ly1; ly++) {
          for (let lx = lx0; lx <= lx1; lx++) {
            const i = (ly << 5) | lx;
            const tx = cx * CHUNK + lx;
            const ty = cy * CHUNK + ly;
            const canopy = chunk.canopy[i];
            if (canopy >= TREE_MIN) this.addTree(f, tx, ty, canopy);
            else if (canopy > 0) this.queue.add('flat', () => drawSapling(f.P, tx, ty, f.now));
            const deposit = chunk.deposit[i];
            if (deposit && !chunk.slab[i]) this.addDeposit(f, tx, ty, deposit as DepositType);
          }
        }
      }
    }
  }

  /** Ajoute un arbre adulte : son ombre au sol et son houppier trié par le pied. */
  private addTree(f: Frame, tx: number, ty: number, canopy: number): void {
    const size = treeSize(canopy);
    const sprite = placeholderTree(size);
    const radius = TREE_RADIUS[size];
    const jitter = Math.round((hash(tx, ty, f.g.seed + 5) - 0.5) * 6);
    const sway = Math.round(Math.sin(f.now * 1.05 + tx * 0.07 + ty * 0.11) * 0.7);
    const shake = this.fx.shake(tx, ty, f.now);
    const base = (ty + 0.9) * TILE_PX;
    const X = Math.round((tx + 0.5) * TILE_PX - sprite.img.width / 2 + jitter + sway + shake);
    const Y = Math.round(base - sprite.img.height);
    const shadowX = (tx + 0.5) * TILE_PX + jitter;
    this.queue.add('cast', () => f.P.ell(shadowX + radius * 1.15, base + 2, radius * 1.6, radius * 0.34, C.shade));
    this.queue.addTall(base, X, () => f.ctx.drawImage(sprite.img, X, Y));
  }

  /** Ajoute un gisement, une seule fois par case, avec une position légèrement variée. */
  private addDeposit(f: Frame, tx: number, ty: number, type: DepositType): void {
    const sprite = placeholderDeposit(type);
    const hx = hash(tx, ty, f.g.seed + 7);
    const hy = hash(tx, ty, f.g.seed + 8);
    const base = (ty + 0.85) * TILE_PX;
    const X = Math.round((tx + 0.5) * TILE_PX - sprite.img.width / 2 + (hx - 0.5) * 8);
    const Y = Math.round(base - sprite.img.height + (hy - 0.5) * 4);
    this.queue.add('cast', () => f.P.ell((tx + 0.5) * TILE_PX, base - 2, sprite.img.width * 0.55, 4, C.shadeL));
    this.queue.addTall(base, X, () => f.ctx.drawImage(sprite.img, X, Y));
  }

  /** Ajoute les bâtiments visibles, leur ombre portée, leurs lumières et leur goulotte. */
  private addBuildings(f: Frame): void {
    const { g, ctx, P, now, view } = f;
    for (const e of g.tickers) {
      if (!this.visible(view, e)) continue;
      const sprite = placeholderSprite(e.def);
      if (!sprite) continue;
      const X = e.x * TILE_PX - 1;
      const Y = e.y * TILE_PX - sprite.up - 1;
      const foot = (e.y + e.h) * TILE_PX;
      this.queue.add('cast', () => castShadow(ctx, sprite, X, Y));
      if (sprite.lights.length) this.lit.push({ sprite, X, Y });
      this.queue.addTall(foot, X, () => {
        ctx.drawImage(sprite.img, X, Y);
        drawLights(P, sprite.lights, X + 1, Y + 1, now);
        if (outputPorts(e).length) drawChute(P, e);
      });
      f.shown.push({ e, sprite });
    }
  }

  /** Ajoute les bâtisseurs, triés avec le reste par leur pied. */
  private addPlayers(f: Frame): void {
    for (const p of f.opts.players) {
      const sprite = placeholderBuilder(p.color);
      const foot = p.y * TILE_PX;
      const bounce = Math.round(Math.abs(Math.sin(p.walk * Math.PI)) * Math.min(2, p.speed * 2.5));
      const X = Math.round(p.x * TILE_PX);
      this.queue.addTall(foot, X, () => {
        const ctx = f.ctx;
        ctx.save();
        ctx.translate(X, Math.round(foot - bounce));
        if (p.fx < 0) ctx.scale(-1, 1);
        ctx.drawImage(sprite.img, -Math.round(sprite.img.width / 2), -sprite.img.height);
        ctx.restore();
      });
    }
  }

  /** Ajoute les effets, les bulles de cause et tous les repères de chaque joueur. */
  private addEffects(f: Frame): void {
    const { g, opts, ctx, P, now } = f;
    this.queue.add('fx', () => this.fx.draw(P, ctx, now));

    const tick = g.tick;
    for (const { e, sprite } of f.shown) {
      const status = e.status;
      if (status === Status.Working || status === Status.Idle || status === Status.Dark) continue;
      const kind = e.def.kind;
      if (kind === 'splitter' || kind === 'hub' || kind === 'storage') continue;
      if (tick - e.born < 90) continue;
      const bx = e.cx;
      const by = e.y - sprite.up / TILE_PX - 0.5 + Math.sin(now * 1.25 + e.id) * 0.05;
      this.queue.add('fx', () => drawCauseBubble(P, ctx, bx, by, status, e.missing, now, placeholderItem));
    }

    const hover = opts.hover;
    if (hover && !hover.dead && hover !== opts.selected) {
      this.queue.add('fx', () => drawBrackets(P, hover.x, hover.y, hover.w, hover.h, C.c0, now));
    }
    const selected = opts.selected;
    if (selected && !selected.dead) {
      this.queue.add('fx', () => {
        drawBrackets(P, selected.x, selected.y, selected.w, selected.h, C.o1, now);
        drawRange(P, selected.def.key, selected.x, selected.y, selected.w, selected.h, now);
      });
    }

    let beltInHand = false;
    for (const p of opts.players) {
      if (p.tool === 'demolir') {
        this.addDemolish(f, p);
        continue;
      }
      if (!p.tool) continue;
      const def = B[p.tool];
      if (!def) continue;
      if (def.kind === 'belt') {
        beltInHand = true;
        if (p.route) {
          const route: readonly RouteView[] = p.route;
          const into = p.routeInto;
          this.queue.add('fx', () => drawRoute(P, route, into, now));
        }
        continue;
      }
      const [fw, fh] = g.footprint(def, p.rot);
      const sprite = placeholderSprite(def);
      if (sprite) {
        const X = p.ox * TILE_PX - 1;
        const Y = p.oy * TILE_PX - sprite.up - 1;
        this.queue.add('fx', () => drawGhost(ctx, sprite, X, Y, p.ok));
      } else if (def.kind === 'slab') {
        this.queue.add('fx', () => this.drawSlabGhost(f, p, fw, fh));
      }
      this.queue.add('fx', () => drawRange(P, def.key, p.ox, p.oy, fw, fh, now));
    }
    if (beltInHand) this.queue.add('fx', () => this.queueHubMouths(f));

    for (const ring of opts.rings) {
      const scaled: Ring = { ...ring, t0: animTime(ring.t0), dur: animTime(ring.dur) };
      this.queue.add('fx', () => drawRing(P, scaled, now));
    }
    if (opts.marker) {
      const marker = opts.marker;
      this.queue.add('fx', () => drawMarker(P, marker.x, marker.y, now));
    }
  }

  /** L'aperçu rouge de la démolition, au sol sous la case visée. */
  private addDemolish(f: Frame, p: PlayerView): void {
    const e = f.g.entAt(p.cx, p.cy);
    const x = e ? e.x : p.cx;
    const y = e ? e.y : p.cy;
    const w = e ? e.w : 1;
    const h = e ? e.h : 1;
    const ctx = f.ctx;
    const P = f.P;
    this.queue.add('fx', () => {
      ctx.save();
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = C.red;
      ctx.fillRect(x * TILE_PX, y * TILE_PX, w * TILE_PX, h * TILE_PX);
      ctx.restore();
      const X = x * TILE_PX;
      const Y = y * TILE_PX;
      const W = w * TILE_PX;
      const H = h * TILE_PX;
      P.r(X, Y, W, 1, C.red);
      P.r(X, Y + H - 1, W, 1, C.red);
      P.r(X, Y, 1, H, C.red);
      P.r(X + W - 1, Y, 1, H, C.red);
    });
  }

  /** L'aperçu d'une dalle, qui n'a pas de volume provisoire. */
  private drawSlabGhost(f: Frame, p: PlayerView, w: number, h: number): void {
    const X = p.ox * TILE_PX;
    const Y = p.oy * TILE_PX;
    const W = w * TILE_PX;
    const H = h * TILE_PX;
    const ctx = f.ctx;
    const P = f.P;
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = C.c1;
    ctx.fillRect(X, Y, W, H);
    ctx.restore();
    const col = p.ok ? C.q1 : C.red;
    P.r(X, Y, W, 1, col);
    P.r(X, Y + H - 1, W, 1, col);
    P.r(X, Y, 1, H, col);
    P.r(X + W - 1, Y, 1, H, col);
  }

  /** Les entrées libres de la Tour, quand un convoyeur est en main. */
  private queueHubMouths(f: Frame): void {
    const h = f.g.hub;
    if (!h) return;
    const open: boolean[] = [false, false, false, false];
    for (let d = 0; d < 4; d++) {
      const px = h.x + (h.w - 1) / 2 + 0.5 + DX[d] * (h.w / 2 + 0.5);
      const py = h.y + (h.h - 1) / 2 + 0.5 + DY[d] * (h.h / 2 + 0.5);
      const occ = f.g.entAt(Math.floor(px), Math.floor(py));
      open[d] = !occ || (occ.def.kind === 'belt' && occ.rot === ((d + 2) & 3));
    }
    drawHubMouths(f.P, h.x, h.y, h.w, h.h, open, f.now);
  }

  /** Le filtre chaud du jour, puis les lumières des bâtiments redessinées par-dessus la nuit. */
  private addLight(f: Frame): void {
    const night = Math.min(1, Math.max(0, f.g.sun.night));
    const gold = f.g.sun.day ? Math.max(0, 1 - f.g.sun.elev / 0.5) : 1;
    const cr = Math.round(255 * (1 - night) + 118 * night);
    const cg = Math.round((241 - 30 * gold) * (1 - night) + 128 * night);
    const cb = Math.round((220 - 60 * gold) * (1 - night) + 168 * night);
    this.queue.add('light', () => {
      const ctx = f.ctx;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = 1;
      ctx.fillStyle = `rgb(${cr},${cg},${cb})`;
      ctx.fillRect(0, 0, f.view.bufW, f.view.bufH);
      ctx.restore();
      if (night > 0.02 && this.lit.length) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = Math.min(1, night);
        const P = pen(ctx);
        for (const light of this.lit) drawLights(P, light.sprite.lights, light.X + 1, light.Y + 1, f.now);
        ctx.restore();
      }
    });
  }

  /** Une entité dont l'emprise touche la fenêtre visible, avec une marge. */
  private visible(view: PixelView, e: Ent): boolean {
    return e.x + e.w + 2 > view.tileX0 && e.x - 2 < view.tileX1 && e.y + e.h + 2 > view.tileY0 && e.y - 2 < view.tileY1;
  }

  /** Le tampon de dessin, recréé seulement quand sa taille change. */
  private ensureBuffer(w: number, h: number): CanvasRenderingContext2D {
    if (this.buffer && this.bufferCtx && this.bufW === w && this.bufH === h) return this.bufferCtx;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Contexte 2D indisponible');
    ctx.imageSmoothingEnabled = false;
    this.buffer = canvas;
    this.bufferCtx = ctx;
    this.bufW = w;
    this.bufH = h;
    return ctx;
  }

  /** Pose le tampon sur l'écran, agrandi à l'échelle entière et sans lissage. */
  private blit(view: PixelView): void {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#0e2a24';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    if (this.buffer) ctx.drawImage(this.buffer, view.blitX, view.blitY, view.bufW * view.scale, view.bufH * view.scale);
  }
}
