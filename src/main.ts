// Brutalusine — boucle principale : le bâtisseur, ses gestes, la simulation à pas fixe, le rendu, le son.
// Prise en main : on marche (ZQSD), on clique. Clic sur un arbre : on le déracine. Sur un rocher : on pioche.
// Avec un bâtiment en main : on pose. Clic droit : on lâche l'outil, ou on démolit.

import './ui/style.css';
import './ui/px/theme.css';
import { B, BUILDINGS, BELT_SPEED, DEPOSITS, DX, DY, ERAS, ITEMS, LOOT_WOOD, R, TILE_U, TREE_MIN, CANOPY_UNIT, costOf, type Dir, type Place, type Step } from './sim/data';
import type { Ent } from './sim/ent';
import { CHUNK, GROUND_WATER, GROUND_BANK } from './sim/world';
import { serialize, deserialize, writeSave, readSave, SAVE_VERSION } from './sim/save';
import { Game, rotatable } from './sim/game';
import { beltRoute } from './sim/route';
import { Renderer, type Camera, type PlayerView, type RenderOpts, type Ring, type RouteView } from './render/renderer';
import { PxRenderer, coopScale } from './render/px/renderer';
import { chooseHarvest, type HarvestPick } from './render/px/oreField';
import { BuilderAnimator, type MotionResult } from './render/px/builderMotion';
import { PLAYER_COLORS } from './render/px/builderArt';
import { TILE_PX, pickScale, renderZoom, scaleBounds, stepScale } from './render/px/view';
import { PAL } from './render/terrain';
import { hexToRgb } from './render/px/noise';
import { Hud } from './ui/hud';
import { costText } from './ui/eraText';
import { AudioEngine } from './audio/audio';

interface UndoOp { type: 'place' | 'remove' | 'rotate'; key: string; x: number; y: number; rot: number; recipe?: string; filter?: number; isOut?: boolean; }
interface Task { kind: 'tree' | 'ore' | 'loot' | 'walk'; x: number; y: number; stuck: number; best: number; }
/** La cible d'un coup porté : un arbre ou un gisement, à sa case. */
interface StrikeTarget { kind: 'tree' | 'ore'; x: number; y: number; color: string }
/** Ce que la boucle attend d'un rendu, quel qu'il soit. */
interface WorldRenderer {
  render(g: Game, cam: Camera, opts: RenderOpts): void;
  reset(): void;
  burst(kind: 'leaf' | 'dust' | 'spark' | 'chip' | 'star', x: number, y: number, color: string, n: number): void;
  hit(x: number, y: number, power?: number): void;
  fell(g: Game, x: number, y: number, size: number): void;
  oreTileAt?(g: Game, x: number, y: number): { x: number; y: number } | null;
}

const COLORS = PLAYER_COLORS;
const NAMES = ['Orange', 'Cyan', 'Lime', 'Rose'];
const MIN_ZOOM = 16, MAX_ZOOM = 76, REACH = 2.1;
const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]!));

/** Un bâtisseur : clavier et souris (id 0) ou une manette. */
class Player implements PlayerView {
  x = 0.5; y = 3.6; vx = 0; vy = 0; fx = 0; fy = 1;
  walk = 0; speed = 0; swing = 0; lean = 0; blink = 0;
  tool: string | null = null; rot = 0;
  cx = 0; cy = 5; ox = 0; oy = 5; ok = false; reason = '';
  gx = 0; gy = 0; gprog = 0; beam = 0;
  task: Task | null = null;
  hitTimer = 0;
  animator = new BuilderAnimator();
  motion: MotionResult | null = null;
  strikeTile: { x: number; y: number } | null = null;
  aimX = 0; aimY = 1.6;
  dragLast: [number, number] | null = null;
  anchor: [number, number] | null = null;   // convoyeur : case où le tracé a commencé
  xFirst: boolean | null = null;            // convoyeur : le L part le long de x (sinon de y) ; décidé au premier pas
  elbowSet = false;                         // convoyeur : le joueur a choisi le coude (R) ; on ne le change plus pour lui
  elbowShown = true;                        // convoyeur : le coude du tracé affiché (xFirst, ou l'autre s'il seul se raccorde)
  routeKey = '';                            // convoyeur : ce dont dépend le tracé calculé (pour ne pas le refaire)
  routeOk = true; routeReason = '';         // convoyeur : verdict du tracé calculé
  route: RouteView[] | null = null;         // convoyeur : le tracé en cours, posé au relâchement
  routeInto = false;                        // le bout du tracé se déverse dans quelque chose
  gesture: UndoOp[] | null = null;
  undo: UndoOp[][] = [];
  lastRemove = '';
  recipeMem: Record<string, string> = {};
  filterMem = -1;
  prev: boolean[] = [];
  constructor(public id: number, public pad: number | null) {}
  get color(): string { return COLORS[this.id % 4]; }
}

class App {
  game: Game;
  renderer: WorldRenderer;
  private readonly pixel: boolean;
  private scale = 0;
  private loadMessage = 'Aucune sauvegarde';
  hud: Hud;
  audio = new AudioEngine();
  players: Player[] = [new Player(0, null)];
  keys = new Set<string>();
  cam: Camera = { x: 0.5, y: 2.5, zoom: 44 };
  zoom = 44;
  look = { x: 0, y: 0 };      // décalage de la caméra vers le curseur (en cases)
  mouse = { x: 0, y: 0, over: false, left: false, right: false };
  hover: Ent | null = null;
  rings: Ring[] = [];
  time = 0; frame = 0; acc = 0; last = performance.now();
  started = false; paused = false;
  hudTimer = 0; saveTimer = 0;
  canvas = document.getElementById('game') as HTMLCanvasElement;

  constructor() {
    this.game = new Game((Math.random() * 1e9) | 0);
    this.pixel = new URLSearchParams(location.search).get('rendu') === 'pixel';
    if (this.pixel) document.documentElement.dataset.rendu = 'pixel';
    this.renderer = this.pixel ? new PxRenderer(this.canvas) : new Renderer(this.canvas);
    this.hud = new Hud({
      game: () => this.game,
      tool: () => this.players[0].tool,
      selectTool: (k) => { const p = this.players[0]; p.tool = k; p.task = null; this.hud.select(null); this.audio.ui(); },
      stepDone: (s) => this.stepDone(s),
      locate: (pl) => this.locate(pl),
      setRecipe: (e, key) => { this.game.setRecipe(e, R[key]); this.players[0].recipeMem[e.def.key] = key; this.audio.ui(); },
      setFilter: (e, id) => { e.filter = id; this.players[0].filterMem = id; this.game.version++; this.audio.ui(); },
      feed: (e) => { const n = this.game.feed(e); if (n) this.audio.place(1); else { this.audio.deny(); this.hud.toast('Rien à donner : ton stock n’a pas ce qu’il lui faut'); } },
      take: (e) => { const n = this.game.take(e); if (n) { this.audio.place(1); this.hud.toast(`+${n} dans ton stock`); } },
      ping: (list) => {
        for (const e of list.slice(0, 6)) this.rings.push({ x: e.cx, y: e.cy, t0: this.time, color: PAL.signalHi, size: 4, dur: 1.6 });
        if (list[0]) this.players[0].task = { kind: 'walk', x: Math.floor(list[0].cx), y: Math.floor(list[0].y + list[0].h + 1), stuck: 0, best: 1e9 };
      },
      menu: (a, v) => this.menu(a, v),
      playerLines: () => this.players.map((p) => `<b style="color:${p.color}">●</b> ${NAMES[p.id % 4]} — ${p.pad === null ? 'clavier et souris' : `manette ${p.pad + 1}`}`),
    });
    this.bind();
    this.resize();
    void readSave('auto').then((s) => {
      if (!s) return;
      if (s.v === SAVE_VERSION) {
        document.getElementById('btn-continue')!.hidden = false;
        return;
      }
      const note = document.getElementById('save-note')!;
      note.textContent = 'Ta sauvegarde vient d’une ancienne version du monde et ne peut plus être chargée.';
      note.hidden = false;
    }).catch(() => undefined);
    requestAnimationFrame(() => this.loop());
  }

  // ================================================================ entrées
  private resize(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = window.innerWidth, h = window.innerHeight;
    if (w < 2 || h < 2) return;
    this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
    this.fitPixelScale();
  }
  private get dpr(): number { return this.canvas.width / Math.max(1, window.innerWidth); }

  /** Garde l'échelle pixel entière dans les bornes de l'écran et met `zoom` en accord. */
  private fitPixelScale(): void {
    if (!this.pixel) return;
    const b = scaleBounds(this.canvas.width, this.canvas.height);
    if (!this.scale) this.scale = pickScale(this.canvas.width, this.canvas.height);
    this.scale = Math.min(b.max, Math.max(b.min, this.scale));
    this.zoom = (TILE_PX * this.scale) / this.dpr;
  }

  /** Un cran d'échelle pixel, toujours ramené dans les bornes de l'écran. */
  private setPixelScale(scale: number): void {
    const b = scaleBounds(this.canvas.width, this.canvas.height);
    this.scale = Math.min(b.max, Math.max(b.min, scale));
    this.zoom = (TILE_PX * this.scale) / this.dpr;
  }

  /** Point du monde sous un point de l'écran. */
  private pick(sx: number, sy: number): { x: number; y: number } {
    const z = this.cam.zoom / this.dpr;
    return { x: this.cam.x + (sx - window.innerWidth / 2) / z, y: this.cam.y + (sy - window.innerHeight / 2) / z };
  }

  private bind(): void {
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('keydown', (ev) => this.onKey(ev));
    window.addEventListener('keyup', (ev) => this.keys.delete(ev.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.mouse.left = this.mouse.right = false; });
    const cv = this.canvas, m = this.mouse, p = this.players[0];
    cv.addEventListener('mouseenter', (ev) => { m.x = ev.clientX; m.y = ev.clientY; m.over = true; });   // la position d'abord : sinon l'infobulle part au coin
    cv.addEventListener('mouseleave', () => { m.over = false; });
    cv.addEventListener('mousemove', (ev) => {
      m.x = ev.clientX; m.y = ev.clientY; m.over = true;
      if (!this.started || this.paused) return;
      this.aim(p);
      if (m.left && p.tool === 'demolir') this.removeAt(p);
      else if (m.left && p.tool === 'marteau') this.upgradeAt(p);
      else if (m.left && p.tool && p.gesture && (!p.dragLast || p.dragLast[0] !== p.cx || p.dragLast[1] !== p.cy)) this.tryPlace(p, false);
      else if (m.right && p.gesture) this.removeAt(p);
    });
    cv.addEventListener('mousedown', (ev) => {
      this.audio.start();
      m.x = ev.clientX; m.y = ev.clientY;
      if (!this.started || this.paused) return;
      this.aim(p);
      if (ev.button === 0) { m.left = true; this.primaryDown(p); }
      else if (ev.button === 2) { m.right = true; this.secondaryDown(p); }
    });
    window.addEventListener('mouseup', (ev) => {
      if (ev.button === 0 && m.left) { m.left = false; this.endGesture(p); }
      if (ev.button === 2 && m.right) { m.right = false; this.endGesture(p); }
    });
    cv.addEventListener('contextmenu', (ev) => ev.preventDefault());
    cv.addEventListener('wheel', (ev) => {
      ev.preventDefault();
      if (!this.started) return;
      if (this.pixel) {
        const step = -Math.sign(ev.deltaY);
        if (step) this.setPixelScale(stepScale(this.scale, step, this.canvas.width, this.canvas.height));
      } else this.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, this.zoom * Math.exp(-ev.deltaY * 0.0011)));
    }, { passive: false });
    document.getElementById('btn-new')!.addEventListener('click', () => this.begin(true));
    document.getElementById('btn-continue')!.addEventListener('click', () => { void this.load().then((ok) => this.begin(!ok)); });
  }

  private onKey(ev: KeyboardEvent): void {
    const target = ev.target as HTMLElement;
    // Espace ou Entrée sur un bouton du HUD : la touche agit sur le bouton, pas sur le jeu
    if ((ev.code === 'Space' || ev.code === 'Enter') && target.closest?.('button')) return;
    const typing = target.tagName === 'INPUT';
    if (ev.code === 'Escape') { this.escape(); return; }
    if (typing || !this.started) return;
    const p = this.players[0], g = this.game;
    if (ev.ctrlKey && ev.code === 'KeyZ') { ev.preventDefault(); this.undo(p); return; }
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (ev.code.startsWith('Arrow') || ev.code === 'Space' || ev.code === 'Tab') ev.preventDefault();
    if (this.keys.has(ev.code)) return;
    this.keys.add(ev.code);
    switch (ev.code) {
      case 'KeyR': this.turn(p); break;
      case 'KeyE': this.pipette(p); break;
      case 'KeyX': p.tool = p.tool === 'demolir' ? null : 'demolir'; p.task = null; this.hud.select(null); this.audio.ui(); break;
      case 'KeyM':
        if (g.era < 2) { this.hud.toast('Le marteau sert à partir de l’ère de la Pierre'); break; }
        p.tool = p.tool === 'marteau' ? null : 'marteau'; p.task = null; this.hud.select(null); this.audio.ui();
        break;
      case 'Tab': this.hud.nextCategory(g, ev.shiftKey ? -1 : 1); this.audio.ui(); break;
      case 'KeyG': if (this.hud.codexOpen) this.hud.closeCodex(); else this.hud.openCodex(); break;
      case 'KeyH': this.hud.showGuide(!this.hud.guideOpen); break;
      case 'Space': this.paused = !this.paused; this.hud.toast(this.paused ? 'Pause — Espace pour reprendre' : 'Reprise'); break;
      default:
        if (ev.code.startsWith('Digit')) {
          const key = this.hud.toolsInCategory(g)[+ev.code.slice(5) - 1];
          if (key) { p.tool = p.tool === key ? null : key; p.task = null; this.hud.select(null); this.audio.ui(); }
        }
    }
  }

  private begin(fresh: boolean): void {
    this.started = true;
    if (fresh) for (const p of this.players) { p.x = 0.5 + p.id; p.y = 3.6; }
    this.cam.x = this.players[0].x; this.cam.y = this.players[0].y;
    document.getElementById('title')!.hidden = true;
    document.getElementById('hud')!.hidden = false;
    this.audio.start();
    this.hud.update(this.game);
    // on apprend en faisant : les étapes à gauche guident, le guide complet reste sur H
    if (fresh) this.hud.toast('Suis les étapes à gauche · H : comment jouer', 7000);
  }

  private escape(): void {
    const p = this.players[0];
    if (!this.started) return;
    if (this.hud.guideOpen) this.hud.showGuide(false);
    else if (this.hud.codexOpen) this.hud.closeCodex();
    else if (this.hud.menuOpen) { this.hud.toggleMenu(false); this.paused = false; }
    else if (p.tool) p.tool = null;
    else if (this.hud.selected) this.hud.select(null);
    else this.paused = this.hud.toggleMenu(true);
  }

  private menu(action: string, value?: string): void {
    switch (action) {
      case 'resume': this.hud.toggleMenu(false); this.paused = false; break;
      case 'pause': this.paused = this.hud.toggleMenu(true); break;
      case 'guide': this.hud.toggleMenu(false); this.paused = false; this.hud.showGuide(true); break;
      case 'atlas': this.hud.openCodex(); break;
      case 'save': void this.save().then(() => this.hud.toast('Partie sauvegardée')); break;
      case 'load': void this.load().then((ok) => { this.hud.toast(ok ? 'Partie chargée' : this.loadMessage); if (ok) { this.hud.toggleMenu(false); this.paused = false; } }); break;
      case 'new':
        this.game = new Game((Math.random() * 1e9) | 0); this.resetWorld();
        for (const p of this.players) { p.x = 0.5 + p.id; p.y = 3.6; }
        this.hud.toggleMenu(false); this.paused = false; this.hud.toast('Nouvelle planète');
        break;
      case 'music': this.audio.setMusic(parseFloat(value ?? '0.5')); break;
      case 'sfx': this.audio.setSfx(parseFloat(value ?? '0.6')); break;
      case 'codex-back': this.hud.codexBack(); break;
    }
  }

  private resetWorld(): void {
    this.renderer.reset();
    this.hud.select(null);
    this.rings.length = 0;
    for (const p of this.players) { p.undo.length = 0; p.tool = null; p.gesture = null; p.task = null; p.vx = p.vy = 0; p.animator = new BuilderAnimator(); p.motion = null; p.strikeTile = null; }
  }

  async save(): Promise<void> { await writeSave('auto', serialize(this.game, { players: this.players.map((p) => ({ x: p.x, y: p.y })), zoom: this.zoom })); }

  async load(): Promise<boolean> {
    const d = await readSave('auto').catch(() => null);
    if (!d) { this.loadMessage = 'Aucune sauvegarde'; return false; }
    if (d.v !== SAVE_VERSION) { this.loadMessage = 'Sauvegarde d’une ancienne version : commence une nouvelle partie'; return false; }
    this.game = deserialize(d);
    this.resetWorld();
    const ex = d.extra as { players?: { x: number; y: number }[]; zoom?: number } | undefined;
    ex?.players?.forEach((s, i) => { const p = this.players[i]; if (p) { p.x = s.x; p.y = s.y; } });
    if (ex?.zoom) this.zoom = ex.zoom;
    return true;
  }

  // ============================================================ tutoriel
  private stepDone(s: Step): boolean {
    const g = this.game;
    if (s.t === 'gather') return g.gathered > 0;
    if (s.t === 'tool') return this.players[0].tool === s.key || g.count(s.key) > 0;
    if (s.t === 'build') return g.count(s.key) > 0;
    if (s.t === 'link') return g.tickers.some((e) => e.def.key === s.key && (e.outT.path !== null || e.outT.ent !== null));
    return g.made[s.item] === 1;
  }

  private placeOf(pl: Place): { x: number; y: number } | null {
    const w = this.game.world, p = this.players[0];
    if (pl === 'eau') return w.river;
    if (pl === 'debris') {
      let best: { x: number; y: number } | null = null, bd = 1e9;
      for (let y = -11; y <= 11; y++) for (let x = -11; x <= 11; x++) if (w.loot(x, y)) { const d = Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y); if (d < bd) { bd = d; best = { x: x + 0.5, y: y + 0.5 }; } }
      return best;
    }
    if (pl === 'roche') {
      const b = w.blobs.find((q) => q.type === 1);
      return b ? { x: b.x + 0.5, y: b.y + 0.5 } : null;
    }
    if (pl === 'arbre') {
      let best: { x: number; y: number } | null = null, bd = 1e9;
      const px = Math.floor(p.x), py = Math.floor(p.y);
      for (let y = -20; y <= 20; y++) for (let x = -20; x <= 20; x++) {
        const cx = px + x, cy = py + y;
        if (w.canopy(cx, cy) < TREE_MIN || w.ent(cx, cy)) continue;
        const d = Math.hypot(cx + 0.5 - p.x, cy + 0.5 - p.y);
        if (d < bd) { bd = d; best = { x: cx + 0.5, y: cy + 0.5 }; }
      }
      return best;
    }
    let best: { x: number; y: number } | null = null, bd = 1e9;
    const px = Math.floor(p.x), py = Math.floor(p.y);
    for (let y = -40; y <= 40; y++) for (let x = -40; x <= 40; x++) {
      if (w.ground(px + x, py + y) !== GROUND_BANK) continue;
      const d = Math.hypot(px + x + 0.5 - p.x, py + y + 0.5 - p.y);
      if (d < bd) { bd = d; best = { x: px + x + 0.5, y: py + y + 0.5 }; }
    }
    return best ?? w.river;
  }

  /** « Y aller » : le bâtisseur s'y rend tout seul. */
  private locate(pl: Place): void {
    const t = this.placeOf(pl);
    if (!t) return;
    const p = this.players[0];
    // un débris : on s'arrête juste au sud, pour ne pas le cacher sous le bâtisseur (c'est à lui de cliquer dessus)
    const dy = pl === 'debris' ? 1 : 0;
    p.task = { kind: 'walk', x: Math.floor(t.x), y: Math.floor(t.y) + dy, stuck: 0, best: 1e9 };
    this.rings.push({ x: t.x, y: t.y, t0: this.time + 0.2, color: PAL.signalHi, size: 5, dur: 2 });
  }

  /** Où pointer la flèche du guide pour l'étape en cours (ramenée au bord de l'écran si c'est loin). */
  private marker(): { x: number; y: number } | null {
    const g = this.game, s = this.hud.currentStep(g);
    if (!s) return null;
    let t: { x: number; y: number } | null = null;
    if (s.t === 'gather') t = this.placeOf(s.go ?? 'debris');
    else if (s.t === 'build' && s.go) t = this.placeOf(s.go);
    else if (s.t === 'link') {
      const e = g.tickers.find((x) => x.def.key === s.key && !x.outT.path && !x.outT.ent);
      if (e) { const d = e.rot, mx = e.x + ((e.w - 1) >> 1), my = e.y + ((e.h - 1) >> 1); const c = d === 0 ? [e.x + e.w, my] : d === 1 ? [mx, e.y + e.h] : d === 2 ? [e.x - 1, my] : [mx, e.y - 1]; t = { x: c[0] + 0.5, y: c[1] + 0.5 }; }
    }
    if (!t) return null;
    const z = this.cam.zoom / this.dpr, hw = window.innerWidth / 2 / z - 2, hh = window.innerHeight / 2 / z - 3;
    return { x: Math.max(this.cam.x - hw, Math.min(this.cam.x + hw, t.x)), y: Math.max(this.cam.y - hh + 1.5, Math.min(this.cam.y + hh - 2, t.y)) };
  }

  // ============================================================== gestes
  /** Met à jour la case visée et l'aperçu de construction. */
  private aim(p: Player): void {
    const g = this.game;
    if (p.pad === null) { const w = this.pick(this.mouse.x, this.mouse.y); p.cx = Math.floor(w.x); p.cy = Math.floor(w.y); }
    else { p.cx = Math.floor(p.x + p.aimX); p.cy = Math.floor(p.y + p.aimY); }
    if (p.tool && p.tool !== 'demolir' && p.tool !== 'marteau') {
      const def = B[p.tool];
      const [fw, fh] = g.footprint(def, p.rot);
      p.ox = p.cx - ((fw - 1) >> 1); p.oy = p.cy - ((fh - 1) >> 1);
      const res = g.canPlace(def, p.ox, p.oy, p.rot);
      p.ok = res.ok; p.reason = res.reason;
    }
    if (p.anchor) {
      if (p.tool && p.tool !== 'demolir' && p.tool !== 'marteau' && B[p.tool].kind === 'belt') this.updateRoute(p);
      else this.clearRoute(p);   // outil lâché en plein tracé
    }
  }

  /** Ce qu'on peut récolter à la main sur une case. */
  private gatherable(x: number, y: number): Task['kind'] | null {
    const w = this.game.world;
    if (w.ent(x, y)) return null;
    if (w.loot(x, y)) return 'loot';
    if (w.canopy(x, y) >= TREE_MIN) return 'tree';
    const type = w.deposit(x, y);
    if (type && DEPOSITS[type] && DEPOSITS[type].item >= 0 && w.amount(x, y) > 0 && !w.slab(x, y)) return 'ore';
    return null;
  }

  /** Ce que le clic ou le bouton maintenu doit récolter : la case visée, sauf ce qui passe devant. */
  private harvestTarget(p: Player): HarvestPick | null {
    const aimed = this.gatherable(p.cx, p.cy);
    const loot = aimed === 'loot' ? { x: p.cx, y: p.cy } : null;
    const direct: HarvestPick | null = aimed === 'tree' || aimed === 'ore' ? { kind: aimed, x: p.cx, y: p.cy } : null;
    const entity = this.game.entAt(p.cx, p.cy) !== null;
    let visibleOre: { x: number; y: number } | null = null;
    if (!loot && !entity) {
      const point = p.pad === null ? this.pick(this.mouse.x, this.mouse.y) : { x: p.x + p.aimX, y: p.y + p.aimY };
      const tile = this.renderer.oreTileAt?.(this.game, point.x, point.y);
      if (tile && this.gatherable(tile.x, tile.y) === 'ore') visibleOre = tile;
    }
    return chooseHarvest({ loot, entity, visibleOre, direct });
  }

  private primaryDown(p: Player): void {
    if (p.tool === 'demolir') { p.gesture = []; p.lastRemove = ''; this.removeAt(p); return; }
    if (p.tool === 'marteau') { p.gesture = []; p.lastRemove = ''; this.upgradeAt(p); return; }
    if (p.tool) { p.gesture = []; p.dragLast = null; this.tryPlace(p, true); return; }
    const e = this.game.entAt(p.cx, p.cy);
    if (e) {
      const sel = e.def.kind !== 'belt' && e.def.kind !== 'bridge' ? e : null;
      this.hud.select(sel); if (sel) this.audio.ui();
      return;
    }
    this.hud.select(null);
    const target = this.harvestTarget(p);
    if (target) { p.task = { ...target, stuck: 0, best: 1e9 }; p.gprog = 0; }
    else p.task = { kind: 'walk', x: p.cx, y: p.cy, stuck: 0, best: 1e9 };       // clic dans le vide : on y va
  }

  private secondaryDown(p: Player): void {
    if (p.anchor) {                                   // clic droit en plein tracé : on l'abandonne, l'outil reste en main
      this.clearRoute(p); p.gesture = null;
      this.audio.ui(); return;
    }
    if (p.tool) { p.tool = null; this.audio.ui(); return; }
    if (p.task) { p.task = null; p.gprog = 0; return; }
    p.gesture = []; p.lastRemove = ''; this.removeAt(p);
  }

  private placeOne(p: Player, key: string, x: number, y: number, rot: number): boolean {
    const g = this.game;
    const existed = g.entAt(x, y) !== null || (key === 'dalle' && g.world.slab(x, y) !== 0);
    const res = g.place(key, x, y, rot, { recipe: p.recipeMem[key], filter: key === 'trieur' && p.filterMem >= 0 ? p.filterMem : undefined });
    if (res.ok && !existed) { p.gesture?.push({ type: 'place', key, x, y, rot }); p.beam = 1; }
    return res.ok;
  }

  private tryPlace(p: Player, first: boolean): void {
    if (!p.tool || p.tool === 'marteau') return;
    const g = this.game;
    const def = B[p.tool];
    if (def.kind === 'belt') {
      // le convoyeur se trace en L de la case de départ au curseur ; il n'est posé qu'au relâchement
      if (first || !p.anchor) { this.clearRoute(p); p.anchor = [p.cx, p.cy]; }
      this.updateRoute(p);
      p.dragLast = [p.cx, p.cy];
      return;
    }
    if (!first && def.kind !== 'slab' && (def.w > 1 || def.h > 1)) return;   // pas de pose en rafale pour les grands bâtiments
    const res = g.canPlace(def, p.ox, p.oy, p.rot);
    if (!res.ok) { if (first) { this.audio.deny(); this.hud.toast(res.reason); } }
    else this.placeOne(p, def.key, p.ox, p.oy, p.rot);
    p.dragLast = [p.cx, p.cy];
    this.aim(p);
  }

  private removeAt(p: Player): void {
    const key = `${p.cx},${p.cy}`;
    if (key === p.lastRemove || !p.gesture) return;
    p.lastRemove = key;
    const info = this.game.remove(p.cx, p.cy);
    if (info) { p.gesture.push({ type: 'remove', ...info }); p.beam = 1; }
  }

  /** Clic au marteau sur la case visée, une fois par case d'un glissé. Ne va pas dans la pile d'annulation : Ctrl+Z ne défait pas une amélioration. */
  private upgradeAt(p: Player): void {
    const key = `${p.cx},${p.cy}`;
    if (key === p.lastRemove || !p.gesture) return;
    const first = p.lastRemove === '';
    p.lastRemove = key;
    const res = this.game.upgrade(p.cx, p.cy);
    if (res.ok) { p.beam = 1; return; }
    if (first) { this.audio.deny(); this.hud.toast(res.reason); }   // un glissé ne répète pas les refus
  }

  private clearRoute(p: Player): void {
    p.anchor = null; p.route = null; p.xFirst = null; p.elbowSet = false; p.routeInto = false; p.routeKey = '';
  }

  /** Recalcule le tracé du convoyeur et ce qu'il coûtera, case par case. */
  private updateRoute(p: Player): void {
    const g = this.game, def = B.convoyeur;
    if (!p.anchor) { p.route = null; return; }
    const [ax, ay] = p.anchor, dx = p.cx - ax, dy = p.cy - ay;
    if (!dx && !dy) { p.xFirst = null; p.elbowSet = false; }              // revenu au départ : le coude se redécidera
    else if (p.xFirst === null) p.xFirst = Math.abs(dx) >= Math.abs(dy);  // le premier pas choisit le coude
    // le prix d'une case est celui de la version qui sera posée, pas celui de l'ère d'apparition
    const ver = g.versionFor(def);
    const unit = costOf(def, ver);
    // rien n'a changé depuis le dernier calcul : on garde le tracé (aim() tourne plusieurs fois par image)
    const key = `${ax},${ay},${p.cx},${p.cy},${p.xFirst},${p.elbowSet},${p.rot},${g.version},${ver},${unit.map(([id]) => Math.floor(g.stock[id])).join('/')}`;
    if (key === p.routeKey && p.route) { p.ok = p.routeOk; p.reason = p.routeReason; return; }
    p.routeKey = key;
    let r = beltRoute(g, ax, ay, p.cx, p.cy, p.xFirst ?? true, p.rot as Dir);
    p.elbowShown = p.xFirst ?? true;
    if (!r.into && dx && dy && !p.elbowSet) {
      // si seul l'autre coude se raccorde (à la Tour, à une machine, à un tapis), c'est lui qu'on voulait —
      // pour ce point-ci seulement : le coude choisi au premier pas reste la règle
      const alt = beltRoute(g, ax, ay, p.cx, p.cy, !p.xFirst, p.rot as Dir);
      if (alt.into) { r = alt; p.elbowShown = !p.xFirst; }
    }
    const left = unit.map(([id, n]) => [id, Math.floor(g.stock[id]), n]);
    p.ok = r.cells.length > 0; p.reason = r.cells.length ? '' : 'Case occupée';
    p.route = r.cells.map((c) => {
      const res = g.canPlace(def, c.x, c.y, c.dir, true);
      let ok = res.ok, why = res.reason;
      const exists = g.entAt(c.x, c.y)?.def.kind === 'belt';
      if (ok && !exists) {
        const short = left.find(([, have, n]) => have < n);
        if (short) { ok = false; why = `Il manque ${ITEMS[short[0]].name}`; }
        else for (const l of left) l[1] -= l[2];
      }
      if (!ok && p.ok) { p.ok = false; p.reason = why; }
      return { x: c.x, y: c.y, dir: c.dir, ok };
    });
    p.routeInto = r.into !== null;
    p.routeOk = p.ok; p.routeReason = p.reason;
  }

  private endGesture(p: Player): void {
    if (p.route && p.tool && p.tool !== 'marteau' && B[p.tool].kind === 'belt') {
      this.updateRoute(p);
      const route = p.route ?? [];
      let placed = 0;
      for (const c of route) {
        if (!c.ok) break;
        if (this.placeOne(p, 'convoyeur', c.x, c.y, c.dir)) placed++;
      }
      if (!route.length || placed < route.length) { this.audio.deny(); this.hud.toast(p.reason || 'Le tracé s’arrête ici'); }
      if (route.length) p.rot = route[route.length - 1].dir;
    }
    this.clearRoute(p);
    if (p.gesture?.length) p.undo.push(p.gesture);
    p.gesture = null; p.dragLast = null; p.lastRemove = '';
  }

  private pipette(p: Player): void {
    const e = this.game.entAt(p.cx, p.cy);
    if (e && e.def.cat) {
      p.tool = e.def.key; p.rot = e.rot;
      if (e.recipe) p.recipeMem[e.def.key] = e.recipe.key;
      if (e.def.filter) p.filterMem = e.filter;
      this.hud.select(null);
    } else p.tool = !e && this.game.world.slab(p.cx, p.cy) ? 'dalle' : null;
    this.audio.ui();
  }

  /**
   * R : pendant un tracé, le L change de coude ; outil en main, l'aperçu pivote ;
   * mains libres, le bâtiment visé pivote sur place.
   */
  private turn(p: Player): void {
    // R change le coude qu'on voit (qui peut être celui choisi automatiquement), et ce choix devient définitif
    if (p.anchor && p.xFirst !== null) { p.xFirst = !p.elbowShown; p.elbowSet = true; this.aim(p); this.audio.ui(); return; }
    if (p.tool && p.tool !== 'demolir' && p.tool !== 'marteau') { p.rot = (p.rot + 1) & 3; this.aim(p); this.audio.ui(); return; }
    if (p.tool) return;
    const e = this.game.entAt(p.cx, p.cy);
    if (!e) return;
    const res = this.game.rotate(p.cx, p.cy);
    if (!res.ok) { this.audio.deny(); this.hud.toast(res.reason); return; }
    if (res.from !== e.rot) p.undo.push([{ type: 'rotate', key: e.def.key, x: e.x, y: e.y, rot: res.from }]);
  }

  private undo(p: Player): void {
    const ops = p.undo.pop();
    if (!ops) { this.hud.toast('Rien à annuler'); return; }
    const g = this.game;
    for (let i = ops.length - 1; i >= 0; i--) {
      const op = ops[i];
      if (op.type === 'place') g.remove(op.x, op.y);
      else if (op.type === 'rotate') {
        // seulement si c'est bien le même bâtiment, au même coin
        const e = g.entAt(op.x, op.y);
        if (e && e.def.key === op.key && e.x === op.x && e.y === op.y) g.rotate(op.x, op.y, op.rot as Dir);
      }
      else g.place(op.key, op.x, op.y, op.rot, { recipe: op.recipe, filter: op.filter, isOut: op.isOut });
    }
    this.audio.remove();
    this.hud.toast('Annulé');
  }

  // ============================================================ bâtisseurs
  private pads(): (Gamepad | null)[] { return navigator.getGamepads ? Array.from(navigator.getGamepads()) : []; }

  private joinLeave(): void {
    const pads = this.pads();
    for (const gp of pads) {
      if (!gp) continue;
      const owner = this.players.find((p) => p.pad === gp.index);
      if (!owner && gp.buttons[0]?.pressed && this.players.length < 4) {
        const used = new Set(this.players.map((p) => p.id));
        let id = 1; while (used.has(id)) id++;
        const p = new Player(id, gp.index);
        p.x = this.players[0].x + 1; p.y = this.players[0].y; p.prev = gp.buttons.map((b) => b.pressed);
        this.players.push(p);
        this.audio.start(); this.hud.toast(`${NAMES[id % 4]} rejoint le chantier`);
      } else if (owner && gp.buttons[8]?.pressed) {
        this.players = this.players.filter((p) => p !== owner);
        this.hud.toast(`${NAMES[owner.id % 4]} quitte le chantier`);
      }
    }
    this.players = this.players.filter((p) => p.pad === null || pads[p.pad]);
  }

  /** Un bâtiment (hors convoyeurs) barre le passage. */
  private solid(x: number, y: number): boolean {
    const e = this.game.entAt(Math.floor(x), Math.floor(y));
    return !!e && e.def.kind !== 'belt' && e.def.kind !== 'bridge';
  }

  /** Les effets d'un coup porté : tremblement, éclats et son. */
  private strike(target: StrikeTarget, power: number): void {
    if (target.kind === 'tree') {
      this.renderer.hit(target.x, target.y, power);
      this.renderer.burst('leaf', target.x + 0.5, target.y + 0.2, PAL.leaf[3], 2);
      this.audio.cut(0.7, 0);
      return;
    }
    this.renderer.hit(target.x, target.y, power);
    this.renderer.burst('chip', target.x + 0.5, target.y + 0.5, target.color, 3);
    this.audio.machine(0.8, 0);
  }

  /** Ce que rapporte un geste à la main : un texte qui monte au-dessus de la case en rendu pixel, une bulle sinon. */
  private gain(text: string, x: number, y: number): void {
    if (!this.pixel) { this.hud.toast(text); return; }
    const z = this.cam.zoom / this.dpr;
    const sx = (x + 0.5 - this.cam.x) * z + window.innerWidth / 2;
    const sy = (y - 0.4 - this.cam.y) * z + window.innerHeight / 2;
    this.hud.float(text, sx, sy);
  }

  private updatePlayer(p: Player, dt: number): void {
    const g = this.game, w = g.world;
    let mx = 0, my = 0, sprint = false, hold = false;
    if (p.pad === null) {
      const k = this.keys;
      if (k.has('KeyW') || k.has('ArrowUp')) my -= 1;
      if (k.has('KeyS') || k.has('ArrowDown')) my += 1;
      if (k.has('KeyA') || k.has('ArrowLeft')) mx -= 1;
      if (k.has('KeyD') || k.has('ArrowRight')) mx += 1;
      sprint = k.has('ShiftLeft') || k.has('ShiftRight');
      hold = this.mouse.left && !p.tool;
      this.aim(p);
    } else {
      const gp = this.pads()[p.pad];
      if (!gp) return;
      const dz = (v: number) => (Math.abs(v) < 0.22 ? 0 : v);
      mx = dz(gp.axes[0] ?? 0); my = dz(gp.axes[1] ?? 0);
      const ax = dz(gp.axes[2] ?? 0), ay = dz(gp.axes[3] ?? 0);
      if (ax || ay) { p.aimX += ax * dt * 14; p.aimY += ay * dt * 14; const al = Math.hypot(p.aimX, p.aimY); if (al > 7) { p.aimX *= 7 / al; p.aimY *= 7 / al; } }
      else if (mx || my) { const l = Math.hypot(mx, my); p.aimX += ((mx / l) * 1.6 - p.aimX) * Math.min(1, dt * 8); p.aimY += ((my / l) * 1.6 - p.aimY) * Math.min(1, dt * 8); }
      const b = gp.buttons.map((x) => x.pressed), was = p.prev;
      const down = (i: number) => b[i] && !was[i], up = (i: number) => !b[i] && was[i];
      const moved = Math.floor(p.x + p.aimX) !== p.cx || Math.floor(p.y + p.aimY) !== p.cy;
      this.aim(p);
      sprint = b[7]; hold = b[0] && !p.tool;
      if (down(2)) this.turn(p);
      if (down(3)) this.pipette(p);
      if (down(4) || down(5)) {
        const tools: (string | null)[] = [null, ...BUILDINGS.filter((d) => d.cat && g.unlocked(d)).map((d) => d.key)];
        if (g.era >= 2) tools.push('marteau');
        p.tool = tools[(tools.indexOf(p.tool) + (down(5) ? 1 : -1) + tools.length) % tools.length];
        const name = p.tool === 'marteau' ? 'Marteau' : p.tool ? B[p.tool].name : 'mains libres';
        this.audio.ui(); this.hud.toast(`${NAMES[p.id % 4]} : ${name}`);
        this.aim(p);
      }
      if (down(0)) this.primaryDown(p);
      else if (b[0] && p.tool === 'marteau' && p.gesture && moved) this.upgradeAt(p);
      else if (b[0] && p.tool && p.tool !== 'demolir' && p.gesture && moved) this.tryPlace(p, false);
      if (up(0)) this.endGesture(p);
      if (down(1)) this.secondaryDown(p);
      else if (b[1] && p.gesture && moved) this.removeAt(p);
      if (up(1)) this.endGesture(p);
      if (down(12)) {
        if (this.pixel) this.setPixelScale(stepScale(this.scale, 1, this.canvas.width, this.canvas.height));
        else this.zoom = Math.min(MAX_ZOOM, this.zoom * 1.25);
      }
      if (down(13)) {
        if (this.pixel) this.setPixelScale(stepScale(this.scale, -1, this.canvas.width, this.canvas.height));
        else this.zoom = Math.max(MIN_ZOOM, this.zoom / 1.25);
      }
      if (down(9)) { if (this.hud.menuOpen) this.menu('resume'); else this.menu('pause'); }
      p.prev = b;
    }

    // --- la tâche en cours : y aller, puis agir
    let acting = false;
    let strikeTarget: StrikeTarget | null = null;
    if (mx || my) { if (p.task) { p.task = null; p.gprog = 0; } }
    else if (p.task) {
      const t = p.task, tx = t.x + 0.5, ty = t.y + 0.5, d = Math.hypot(tx - p.x, ty - p.y);
      const need = t.kind === 'walk' ? 0.25 : t.kind === 'loot' ? 1.1 : REACH;
      if (d > need) {
        mx = (tx - p.x) / d; my = (ty - p.y) / d;
        if (d < t.best - 0.05) { t.best = d; t.stuck = 0; } else if ((t.stuck += dt) > 0.9) { p.task = null; p.gprog = 0; if (t.kind !== 'walk') this.hud.toast('Le chemin est barré : fais le tour'); }
      } else if (t.kind === 'walk') p.task = null;
      else {
        acting = true;
        p.fx = (tx - p.x) / (d || 1); p.fy = (ty - p.y) / (d || 1);
        if (this.gatherable(t.x, t.y) !== t.kind) { p.task = null; p.gprog = 0; }
        else if (t.kind === 'loot') {
          g.pickLoot(t.x, t.y); p.task = null; this.gain(`+${LOOT_WOOD} Bois`, t.x, t.y);
        } else {
          const size = w.canopy(t.x, t.y);
          p.gx = t.x; p.gy = t.y;
          const color = t.kind === 'tree' ? PAL.leaf[3] : DEPOSITS[w.deposit(t.x, t.y)]!.color;
          strikeTarget = { kind: t.kind, x: t.x, y: t.y, color };
          p.gprog += dt / (t.kind === 'tree' ? 0.45 + 0.5 * (size / 255) : 0.5);
          p.swing = (p.swing + dt * 3.4) % 1 || 0.001;
          if (!this.pixel && (p.hitTimer -= dt) <= 0) {
            p.hitTimer = 0.29;
            this.strike(strikeTarget, 1);
          }
          if (p.gprog >= 1) {
            p.gprog = 0;
            if (t.kind === 'tree') { const n = g.uproot(t.x, t.y); this.gain(`+${n.toFixed(1).replace('.', ',')} Bois`, t.x, t.y); }
            else g.handMine(t.x, t.y);
            // bouton maintenu : on enchaîne sur ce que vise le curseur
            const nk = hold ? this.harvestTarget(p) : null;
            p.task = nk ? { ...nk, stuck: 0, best: 1e9 } : t.kind === 'ore' && hold ? t : null;
          }
        }
      }
    }
    if (!acting) { p.swing = 0; if (!p.task) p.gprog = 0; }

    // --- déplacement : l'eau et les arbres freinent, les convoyeurs emportent, les bâtiments arrêtent
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    if (len > 0.1 && !acting) { p.fx += (mx / len - p.fx) * Math.min(1, dt * 14); p.fy += (my / len - p.fy) * Math.min(1, dt * 14); const fl = Math.hypot(p.fx, p.fy) || 1; p.fx /= fl; p.fy /= fl; }
    const cellX = Math.floor(p.x), cellY = Math.floor(p.y);
    let speed = 7.2 * (sprint ? 1.5 : 1);
    if (w.ground(cellX, cellY) === GROUND_WATER) speed *= 0.5;
    else if (w.canopy(cellX, cellY) >= TREE_MIN) speed *= 0.72;
    let tx = mx * speed, ty = my * speed;
    const under = g.entAt(cellX, cellY);
    if (under && under.def.kind === 'belt') { const bs = ((under.path?.speed ?? BELT_SPEED) * 60) / TILE_U; tx += DX[under.rot] * bs; ty += DY[under.rot] * bs; }
    const a = Math.min(1, dt * 13);
    p.vx += (tx - p.vx) * a; p.vy += (ty - p.vy) * a;
    const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt;
    const inside = this.solid(p.x, p.y);
    if (inside || !this.solid(nx, p.y)) p.x = nx; else p.vx = 0;
    if (inside || !this.solid(p.x, ny)) p.y = ny; else p.vy = 0;
    const v = Math.hypot(p.vx, p.vy);
    p.speed += (Math.min(1, v / 5) - p.speed) * Math.min(1, dt * 10);
    p.walk += dt * (6 + v * 1.6) * (v > 0.3 ? 1 : 0);
    p.lean += (Math.min(1, v / 8) - p.lean) * Math.min(1, dt * 5);
    p.blink = (this.time * 0.31 + p.id * 0.37) % 1;
    p.beam = Math.max(0, p.beam - dt * 5);

    if (this.pixel) {
      const result = p.animator.step(dt, {
        walk: p.walk,
        speed: p.speed,
        fx: p.fx,
        acting: strikeTarget !== null,
        harvesting: p.task?.kind === 'tree' || p.task?.kind === 'ore',
        targetDx: strikeTarget ? (strikeTarget.x + 0.5 - p.x) * TILE_PX : 0,
        targetDy: strikeTarget ? (strikeTarget.y + (strikeTarget.kind === 'tree' ? 0.9 : 0.5) - p.y) * TILE_PX : 0,
        isFree: strikeTarget ? (ox, oy) => !this.solid(p.x + ox / TILE_PX, p.y + oy / TILE_PX) : undefined,
      });
      p.motion = result;
      p.strikeTile = strikeTarget ? { x: strikeTarget.x, y: strikeTarget.y } : null;
      if (strikeTarget) {
        for (const contact of result.contacts) this.strike(strikeTarget, contact.pow);
      }
    }
  }

  // ================================================================ boucle
  private loop(): void {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.time += dt; this.frame++;
    const g = this.game, p0 = this.players[0], m = this.mouse;

    if (this.started) {
      if (!this.paused) {
        this.joinLeave();
        for (const p of this.players) this.updatePlayer(p, dt);
        this.acc += dt;
        let n = 0;
        while (this.acc >= 1 / 60 && n++ < 5) { g.step(); this.acc -= 1 / 60; }
        if (this.acc > 0.2) this.acc = 0;
      }
      // la caméra suit le bâtisseur ; à plusieurs, elle recule pour garder tout le monde
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const p of this.players) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
      const fit = Math.max(MIN_ZOOM * 0.7, Math.min(this.zoom, window.innerWidth / (x1 - x0 + 12), window.innerHeight / (y1 - y0 + 10)));
      // un léger décalage vers le curseur : on voit plus loin là où l'on regarde
      // … figé tant qu'on a un outil en main ou un bouton enfoncé : le monde ne glisse pas sous le curseur pendant qu'on vise
      if (this.players.length > 1 || (!m.over && !p0.tool)) { this.look.x = 0; this.look.y = 0; }   // outil en main : figé, même au-dessus de l'interface
      else if (!p0.tool && !m.left) { this.look.x = 0.16 * (m.x - window.innerWidth / 2) / fit; this.look.y = 0.16 * (m.y - window.innerHeight / 2) / fit; }
      const tx = (x0 + x1) / 2 + this.look.x, ty = (y0 + y1) / 2 + this.look.y;
      const k = Math.min(1, dt * 6);
      this.cam.x += (tx - this.cam.x) * k; this.cam.y += (ty - this.cam.y) * k;
      if (this.pixel) {
        // échelle entière : le minimum de l'échelle choisie et de celle qui tient tout le monde
        const b = scaleBounds(this.canvas.width, this.canvas.height);
        let s: number;
        if (this.players.length > 1) {
          const fitPx = Math.min(window.innerWidth / (x1 - x0 + 12), window.innerHeight / (y1 - y0 + 10)) * this.dpr;
          s = coopScale(this.scale, fitPx / TILE_PX, b);
        } else {
          s = Math.round((this.zoom * this.dpr) / TILE_PX);
          this.scale = Math.max(b.min, Math.min(b.max, s));
          s = this.scale;
        }
        this.cam.zoom = TILE_PX * s;
      } else {
        this.cam.zoom += (fit * this.dpr - this.cam.zoom) * Math.min(1, dt * 9);
      }
      this.aim(p0);
      const e = m.over ? g.entAt(p0.cx, p0.cy) : null;
      this.hover = e && (!p0.tool || p0.tool === 'demolir' || p0.tool === 'marteau') ? e : null;
    } else {
      // écran-titre : la vue dérive lentement autour de la clairière
      this.cam.x = 0.5 + Math.cos(this.time * 0.05) * 6; this.cam.y = 2 + Math.sin(this.time * 0.07) * 4;
      this.cam.zoom = this.pixel ? TILE_PX * pickScale(this.canvas.width, this.canvas.height) : 38 * this.dpr;
      g.step();
    }

    this.drain();
    const zoom = this.pixel ? renderZoom(this.cam.zoom) : this.cam.zoom;
    const z = zoom / this.dpr, hw = window.innerWidth / 2 / z, hh = window.innerHeight / 2 / z;
    g.world.ensureArea(Math.floor(this.cam.x - hw) - 3, Math.floor(this.cam.y - hh) - 3, Math.ceil(this.cam.x + hw) + 3, Math.ceil(this.cam.y + hh) + 3);   // le monde se génère devant soi
    if (this.pixel) {
      // prépare un bloc manquant par image dans une marge de 32 cases, le plus proche de la vue d'abord
      const margin = 32;
      const cx0 = Math.floor((this.cam.x - hw - margin) / CHUNK);
      const cx1 = Math.floor((this.cam.x + hw + margin) / CHUNK);
      const cy0 = Math.floor((this.cam.y - hh - margin) / CHUNK);
      const cy1 = Math.floor((this.cam.y + hh + margin) / CHUNK);
      let best = Infinity, bestCx = 0, bestCy = 0;
      for (let cy = cy0; cy <= cy1; cy++) {
        for (let cx = cx0; cx <= cx1; cx++) {
          if (g.world.chunk(cx, cy, false)) continue;
          const dx = cx * CHUNK + CHUNK / 2 - this.cam.x;
          const dy = cy * CHUNK + CHUNK / 2 - this.cam.y;
          const d = dx * dx + dy * dy;
          if (d < best) { best = d; bestCx = cx; bestCy = cy; }
        }
      }
      if (best < Infinity) g.world.chunk(bestCx, bestCy);
    }
    // le rendu classique ne connaît pas le marteau : on lui cache l'outil (pas d'aperçu), la surbrillance reste
    const views = this.players.map((p) => (!this.pixel && p.tool === 'marteau' ? { ...p, color: p.color, tool: null } : p));
    this.renderer.render(g, this.cam, {
      time: this.time, frame: this.frame, dt, players: this.started ? views : [],
      selected: this.hud.selected, hover: this.hover, rings: this.rings, marker: this.started ? this.marker() : null,
    });
    this.rings = this.rings.filter((r) => this.time - r.t0 < r.dur);
    this.audio.update(g.sun.night);

    if (this.started) {
      this.updateTip();
      this.hudTimer -= dt;
      if (this.hudTimer <= 0) { this.hudTimer = 0.2; this.hud.update(g); }
      this.saveTimer += dt;
      if (this.saveTimer > 120 && !this.paused) { this.saveTimer = 0; void this.save().catch(() => undefined); }
    }
    requestAnimationFrame(() => this.loop());
  }

  /** Infobulle au curseur : ce qu'on vise et ce que fera le clic. */
  private updateTip(): void {
    const p = this.players[0], m = this.mouse, g = this.game, w = g.world;
    if (!m.over || this.paused) { this.hud.tip(null); return; }
    let html: string | null = null;
    if (p.tool === 'demolir') html = this.hover ? `<b>Démolir : ${this.hover.def.name}</b><span class="k">Tout est remboursé</span>` : null;
    else if (p.tool === 'marteau') {
      const res = g.checkUpgrade(p.cx, p.cy);
      if (!res.ok) html = `<b>Marteau</b><span class="no">${esc(res.reason)}</span>`;
      else {
        const name = g.entAt(p.cx, p.cy)?.def.name ?? 'Dalle';
        html = `<b>Refaire en ${esc(ERAS[res.to - 1].name)} : ${esc(name)}</b><span class="k">${esc(costText(res.cost))} · l’ancienne matière revient</span>`;
      }
    }
    else if (p.tool) {
      const def = B[p.tool];
      html = p.ok
        ? p.route
          ? `<b>${def.name} · ${p.route.length} case${p.route.length > 1 ? 's' : ''}</b><span class="${p.routeInto ? 'ok' : 'k'}">${p.routeInto ? 'Raccordé : le flux entrera au bout' : 'Relâche pour poser'}</span><br><span class="k">R : changer le coude · clic droit : annuler</span>`
          : `<b>${def.name}</b><span class="k">Clic : poser${def.kind === 'belt' || def.kind === 'slab' ? ' · glisser : tracer' : ''}${def.kind !== 'slab' ? ' · R : pivoter' : ''} · clic droit : lâcher</span>`
        : `<b>${def.name}</b><span class="no">${p.reason}</span>`;
    } else if (this.hover && (this.hover.def.kind === 'belt' || this.hover.def.kind === 'bridge')) {
      html = `<b>${this.hover.def.name}</b><span class="k">${this.hover.def.kind === 'belt' ? 'R : pivoter · ' : ''}Clic droit : démolir · E : copier</span>`;
    } else if (this.hover) {
      const st = this.hud.statusLine(g, this.hover);
      html = `<b>${this.hover.def.name}</b><span class="${st.cls === 'bad' ? 'warn' : st.cls === 'ok' ? 'ok' : ''}">${st.text}</span><br><span class="k">Clic : ouvrir${rotatable(this.hover.def) ? ' · R : pivoter' : ''}</span>`;
    } else {
      const target = this.harvestTarget(p);
      if (target?.kind === 'loot') html = `<b>Débris du module</b><span class="k">Clic : ramasser · +${LOOT_WOOD} Bois</span>`;
      else if (target?.kind === 'tree') html = `<b>Arbre</b><span class="k">Clic : déraciner · +${(w.canopy(target.x, target.y) / CANOPY_UNIT).toFixed(1).replace('.', ',')} Bois</span>`;
      else if (target?.kind === 'ore') { const d = DEPOSITS[w.deposit(target.x, target.y)]!; html = `<b>${d.name}</b><span class="k">Maintenir le clic : piocher à la main · ou pose un Puits dessus</span>`; }
      else {
        const type = w.deposit(p.cx, p.cy);
        const d = type ? DEPOSITS[type] : null;
        if (d && d.item < 0) html = `<b>${d.name}</b><span class="k">ne s’exploite pas encore</span>`;
      }
    }
    this.hud.tip(html, m.x, m.y);
  }

  /** Événements de la simulation → son, particules, ondes. */
  private drain(): void {
    const g = this.game, r = this.renderer;
    const span = (window.innerWidth / (this.cam.zoom / this.dpr)) * 0.6;
    for (const ev of g.events) {
      const d = Math.hypot(ev.x - this.cam.x, ev.y - this.cam.y);
      const near = this.started ? Math.max(0, 1 - d / span) : 0;
      const pan = Math.max(-1, Math.min(1, (ev.x - this.cam.x) / (span * 0.7)));
      switch (ev.type) {
        case 'craft': case 'mine': this.audio.machine(near, pan); break;
        case 'cut': r.hit(ev.x, ev.y); r.burst('leaf', ev.x, ev.y - 0.3, PAL.leaf[3], 3); this.audio.cut(near, pan); break;
        case 'fell': r.fell(g, ev.x, ev.y, ev.a); this.audio.cut(near, pan); break;
        case 'hand': r.burst('chip', ev.x, ev.y, ITEMS[ev.a].color, 6); break;
        case 'pick': r.burst('spark', ev.x, ev.y, PAL.signalHi, 10); this.rings.push({ x: ev.x, y: ev.y, t0: this.time, color: PAL.signalHi, size: 1.2, dur: 0.4 }); if (this.started) this.audio.place(1); break;
        case 'place': if (this.started) this.audio.place(ev.a); r.burst('dust', ev.x, ev.y + 0.3, 'rgba(190,180,160,', 3 + Math.min(8, ev.a)); break;
        case 'upgrade': {
          if (this.started) this.audio.place(2);
          const [cr, cg, cb] = hexToRgb(ITEMS[ERAS[ev.a - 1].material].color);
          r.burst('dust', ev.x, ev.y + 0.3, `rgba(${cr},${cg},${cb},`, 10);
          break;
        }
        case 'remove': if (this.started) this.audio.remove(); r.burst('dust', ev.x, ev.y, 'rgba(190,180,160,', 4 + Math.min(8, ev.a)); r.burst('chip', ev.x, ev.y, PAL.steelHi, 5); break;
        case 'quota':
          if (this.started) { this.audio.quota(); this.hud.banner(g); }
          for (let i = 0; i < 4; i++) this.rings.push({ x: ev.x, y: ev.y, t0: this.time + i * 0.25, color: i % 2 ? PAL.glow : PAL.signalHi, size: 22 + i * 18, dur: 2.6 });
          r.burst('star', ev.x, ev.y - 0.8, PAL.signalHi, 40); r.burst('star', ev.x, ev.y - 0.8, PAL.white, 25);
          break;
        default: break;
      }
    }
    g.events.length = 0;
    if (this.rings.length > 14) this.rings.splice(0, this.rings.length - 14);
  }
}

const app = new App();
(window as unknown as { brutalusine: App }).brutalusine = app;
if (import.meta.env.DEV) {
  void import('./dev').then((dev) => { (app as unknown as { demo: () => string[] }).demo = () => dev.buildDemo(app.game); });
}
