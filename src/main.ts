// Brutalusine — boucle principale : entrées, simulation à pas fixe, scène 3D, interface, son.
// Prise en main : la souris fait tout. Clic = poser ou inspecter, glisser = tracer ou déplacer la vue.

import './ui/style.css';
import { B, BUILDINGS, DEPOSITS, DX, DY, ITEMS, R, type Dir, type Place, type Step } from './sim/data';
import { Game } from './sim/game';
import type { Ent } from './sim/ent';
import { serialize, deserialize, writeSave, readSave } from './sim/save';
import { Scene3D, type FxRing } from './render/scene';
import { Hud } from './ui/hud';
import { AudioEngine } from './audio/audio';

interface UndoOp { type: 'place' | 'remove'; key: string; x: number; y: number; rot: number; recipe?: string; filter?: number; isOut?: boolean; }

const COLORS = ['#F08A24', '#3FD0FF', '#B9F24A', '#F0559A'];
const NAMES = ['Orange', 'Cyan', 'Lime', 'Rose'];
const MIN_DIST = 12, MAX_DIST = 80;

/** Un bâtisseur : la souris (id 0) ou une manette. */
class Actor {
  tool: string | null = null;
  rot = 0;
  cellX = 0; cellY = 4; originX = 0; originY = 4;
  ok = false; reason = '';
  dragLast: [number, number] | null = null;
  gesture: UndoOp[] | null = null;
  undo: UndoOp[][] = [];
  lastRemove = '';
  recipeMem: Record<string, string> = {};
  filterMem = -1;
  x = 0.5; y = 5.5;             // curseur (manettes)
  prev: boolean[] = [];
  constructor(public id: number, public pad: number | null) {}
}

class App {
  game: Game;
  scene: Scene3D;
  hud: Hud;
  audio = new AudioEngine();
  actors: Actor[] = [new Actor(0, null)];
  keys = new Set<string>();
  cam = { x: 0.5, y: 1.5, dist: 30 };
  fly: { x: number; y: number } | null = null;
  mouse = { x: 0, y: 0, over: false, left: false, right: false, middle: false, pressX: 0, pressY: 0, panning: false, anchor: { x: 0, y: 0 } };
  hover: Ent | null = null;
  rings: FxRing[] = [];
  time = 0; frame = 0; acc = 0; last = performance.now();
  started = false; paused = false; tilt = true;
  hudTimer = 0; saveTimer = 0;
  canvas = document.getElementById('game') as HTMLCanvasElement;

  constructor() {
    this.game = new Game((Math.random() * 1e9) | 0);
    this.scene = new Scene3D(this.canvas);
    this.hud = new Hud({
      game: () => this.game,
      tool: () => this.actors[0].tool,
      selectTool: (k) => { this.actors[0].tool = k; this.hud.select(null); this.audio.ui(); },
      stepDone: (s) => this.stepDone(s),
      locate: (p) => this.locate(p),
      setRecipe: (e, key) => { this.game.setRecipe(e, R[key]); this.actors[0].recipeMem[e.def.key] = key; this.audio.ui(); },
      setFilter: (e, id) => { e.filter = id; this.actors[0].filterMem = id; this.game.version++; this.audio.ui(); },
      buyUpgrade: (k) => { if (this.game.buyUpgrade(k)) this.audio.quota(); },
      ping: (list) => {
        for (const e of list.slice(0, 6)) this.rings.push({ x: e.cx, y: e.cy, t0: this.time, color: '#ffc24a', size: 4, dur: 1.6 });
        if (list[0]) this.fly = { x: list[0].cx, y: list[0].cy };
      },
      menu: (a, v) => this.menu(a, v),
      playerLines: () => this.actors.map((p) => `<b style="color:${COLORS[p.id % 4]}">■</b> ${NAMES[p.id % 4]} — ${p.pad === null ? 'souris et clavier' : `manette ${p.pad + 1}`}`),
    });
    this.bind();
    void readSave('auto').then((s) => { if (s) document.getElementById('btn-continue')!.hidden = false; }).catch(() => undefined);
    requestAnimationFrame(() => this.loop());
  }

  // ================================================================ entrées
  private bind(): void {
    window.addEventListener('resize', () => this.scene.resize());
    window.addEventListener('keydown', (ev) => this.onKey(ev));
    window.addEventListener('keyup', (ev) => this.keys.delete(ev.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.mouse.left = this.mouse.right = this.mouse.middle = false; });
    const cv = this.canvas, m = this.mouse, a = this.actors[0];
    cv.addEventListener('mouseenter', () => { m.over = true; });
    cv.addEventListener('mouseleave', () => { m.over = false; });
    cv.addEventListener('mousemove', (ev) => {
      m.x = ev.clientX; m.y = ev.clientY; m.over = true;
      if (!this.started) return;
      this.aim(a);
      if (m.middle || (m.left && !a.tool)) {
        if (!m.panning && Math.hypot(m.x - m.pressX, m.y - m.pressY) > 6) m.panning = true;
        if (m.panning) {                       // le point saisi reste sous le curseur
          const p = this.scene.pick(m.x, m.y);
          this.cam.x += m.anchor.x - p.x; this.cam.y += m.anchor.y - p.y; this.fly = null;
          this.scene.placeCamera(this.cam.x, this.cam.y, this.cam.dist);
        }
      } else if (m.left && a.tool === 'demolir') this.removeAt(a);
      else if (m.left && a.tool && a.gesture && (!a.dragLast || a.dragLast[0] !== a.cellX || a.dragLast[1] !== a.cellY)) this.tryPlace(a, false);
      else if (m.right && a.gesture) this.removeAt(a);
    });
    cv.addEventListener('mousedown', (ev) => {
      this.audio.start();
      m.x = ev.clientX; m.y = ev.clientY;
      if (!this.started || this.paused) return;
      this.aim(a);
      m.pressX = m.x; m.pressY = m.y; m.panning = false; m.anchor = this.scene.pick(m.x, m.y);
      if (ev.button === 0) {
        m.left = true;
        if (a.tool === 'demolir') { a.gesture = []; a.lastRemove = ''; this.removeAt(a); }
        else if (a.tool) { a.gesture = []; a.dragLast = null; this.tryPlace(a, true); }
      } else if (ev.button === 2) {
        m.right = true;
        if (a.tool) { a.tool = null; this.audio.ui(); }
        else { a.gesture = []; a.lastRemove = ''; this.removeAt(a); }
      } else if (ev.button === 1) { m.middle = true; ev.preventDefault(); }
    });
    window.addEventListener('mouseup', (ev) => {
      if (ev.button === 0 && m.left) {
        m.left = false;
        if (a.tool) this.endGesture(a);
        else if (!m.panning && this.started && !this.paused) {
          const e = this.hover && this.hover.def.kind !== 'belt' && this.hover.def.kind !== 'bridge' && this.hover.def.kind !== 'deco' ? this.hover : null;
          this.hud.select(e); if (e) this.audio.ui();
        }
      }
      if (ev.button === 2 && m.right) { m.right = false; this.endGesture(a); }
      if (ev.button === 1) m.middle = false;
      m.panning = false;
    });
    cv.addEventListener('contextmenu', (ev) => ev.preventDefault());
    cv.addEventListener('wheel', (ev) => {
      ev.preventDefault();
      if (!this.started) return;
      // zoom vers le point visé
      const before = this.scene.pick(m.x, m.y);
      this.cam.dist = Math.max(MIN_DIST, Math.min(MAX_DIST, this.cam.dist * Math.exp(ev.deltaY * 0.0011)));
      this.scene.placeCamera(this.cam.x, this.cam.y, this.cam.dist);
      const after = this.scene.pick(m.x, m.y);
      this.cam.x += before.x - after.x; this.cam.y += before.y - after.y;
    }, { passive: false });
    document.getElementById('btn-new')!.addEventListener('click', () => this.begin(true));
    document.getElementById('btn-continue')!.addEventListener('click', () => { void this.load().then(() => this.begin(false)); });
  }

  private onKey(ev: KeyboardEvent): void {
    const typing = (ev.target as HTMLElement).tagName === 'INPUT';
    if (ev.code === 'Escape') { this.escape(); return; }
    if (typing || !this.started) return;
    const a = this.actors[0], g = this.game;
    if (ev.ctrlKey && ev.code === 'KeyZ') { ev.preventDefault(); this.undo(a); return; }
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (ev.code.startsWith('Arrow') || ev.code === 'Space' || ev.code === 'Tab') ev.preventDefault();
    if (this.keys.has(ev.code)) return;
    this.keys.add(ev.code);
    switch (ev.code) {
      case 'KeyR': a.rot = (a.rot + 1) & 3; this.aim(a); this.audio.ui(); break;
      case 'KeyE': this.pipette(a); break;
      case 'KeyX': a.tool = a.tool === 'demolir' ? null : 'demolir'; this.hud.select(null); this.audio.ui(); break;
      case 'Tab': this.hud.nextCategory(g, ev.shiftKey ? -1 : 1); this.audio.ui(); break;
      case 'KeyG': if (this.hud.codexOpen) this.hud.closeCodex(); else this.hud.openCodex(); break;
      case 'KeyH': this.hud.showGuide(!this.hud.guideOpen); break;
      case 'Space': this.paused = !this.paused; this.hud.toast(this.paused ? 'Pause — Espace pour reprendre' : 'Reprise'); break;
      default:
        if (ev.code.startsWith('Digit')) {
          const key = this.hud.toolsInCategory(g)[+ev.code.slice(5) - 1];
          if (key) { a.tool = a.tool === key ? null : key; this.hud.select(null); this.audio.ui(); }
        }
    }
  }

  private begin(fresh: boolean): void {
    this.started = true;
    this.cam = { x: 0.5, y: 2.5, dist: 30 };
    document.getElementById('title')!.hidden = true;
    document.getElementById('hud')!.hidden = false;
    this.audio.start();
    this.hud.update(this.game);
    let seen = false;
    try { seen = localStorage.getItem('brutalusine.guide') === '1'; localStorage.setItem('brutalusine.guide', '1'); } catch { /* stockage indisponible */ }
    if (fresh && !seen) this.hud.showGuide(true);
  }

  private escape(): void {
    const a = this.actors[0];
    if (!this.started) return;
    if (this.hud.guideOpen) this.hud.showGuide(false);
    else if (this.hud.codexOpen) this.hud.closeCodex();
    else if (this.hud.menuOpen) { this.hud.toggleMenu(false); this.paused = false; }
    else if (a.tool) a.tool = null;
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
      case 'load': void this.load().then((ok) => { this.hud.toast(ok ? 'Partie chargée' : 'Aucune sauvegarde'); if (ok) { this.hud.toggleMenu(false); this.paused = false; } }); break;
      case 'new':
        this.game = new Game((Math.random() * 1e9) | 0); this.resetWorld();
        this.hud.toggleMenu(false); this.paused = false; this.hud.toast('Nouvelle planète');
        break;
      case 'music': this.audio.setMusic(parseFloat(value ?? '0.5')); break;
      case 'sfx': this.audio.setSfx(parseFloat(value ?? '0.6')); break;
      case 'tilt': this.tilt = value === 'true'; break;
      case 'codex-back': this.hud.codexBack(); break;
      case 'savoir': this.hud.select(this.game.hub); this.fly = { x: this.game.hub.cx, y: this.game.hub.cy }; break;
    }
  }

  private resetWorld(): void {
    this.scene.reset();
    this.hud.select(null);
    this.rings.length = 0;
    this.cam = { x: 0.5, y: 2.5, dist: 30 };
    for (const a of this.actors) { a.undo.length = 0; a.tool = null; a.gesture = null; }
  }

  async save(): Promise<void> { await writeSave('auto', serialize(this.game, { cam: this.cam })); }

  async load(): Promise<boolean> {
    const d = await readSave('auto').catch(() => null);
    if (!d) return false;
    this.game = deserialize(d);
    this.resetWorld();
    const ex = d.extra as { cam?: { x: number; y: number; dist: number } } | undefined;
    if (ex?.cam) this.cam = { ...ex.cam };
    return true;
  }

  // ============================================================ tutoriel
  private stepDone(s: Step): boolean {
    const g = this.game;
    if (s.t === 'tool') return this.actors[0].tool === s.key || g.count(s.key) > 0;
    if (s.t === 'build') return g.count(s.key) > 0;
    if (s.t === 'link') return g.tickers.some((e) => e.def.key === s.key && (e.outT.path !== null || e.outT.ent !== null));
    return g.made[s.item] === 1;
  }

  private placeOf(p: Place): { x: number; y: number } {
    const w = this.game.world;
    if (p === 'eau') return w.lake;
    if (p === 'eventail') return { x: w.firstTree.x + 1.5, y: w.firstTree.y + 1.5 };
    const type = DEPOSITS.findIndex((d) => d && ITEMS[d.item].key === p);
    const b = w.blobs.find((q) => q.type === type) ?? w.blobs[0];
    return { x: b.x + 0.5, y: b.y + 0.5 };
  }

  private locate(p: Place): void {
    const t = this.placeOf(p);
    this.fly = t;
    this.rings.push({ x: t.x, y: t.y, t0: this.time + 0.4, color: '#ffa040', size: 6, dur: 2 });
  }

  /** Où pointer la flèche du tutoriel pour l'étape en cours. */
  private marker(): { x: number; y: number } | null {
    const g = this.game, s = this.hud.currentStep(g);
    if (!s) return null;
    if ((s.t === 'tool' || s.t === 'build') && s.key === 'puits' && g.quota === 0) return this.placeOf('hematite');
    if (s.t === 'build' && s.go) return this.placeOf(s.go);
    if (s.t === 'link') {
      const e = g.tickers.find((x) => x.def.key === s.key && !x.outT.path && !x.outT.ent);
      if (!e) return null;
      const d = e.rot, mx = e.x + ((e.w - 1) >> 1), my = e.y + ((e.h - 1) >> 1);
      const cell = d === 0 ? [e.x + e.w, my] : d === 1 ? [mx, e.y + e.h] : d === 2 ? [e.x - 1, my] : [mx, e.y - 1];
      return { x: cell[0] + 0.5, y: cell[1] + 0.5 };
    }
    return null;
  }

  // ============================================================== actions
  /** Met à jour la case visée et l'aperçu de construction. */
  private aim(a: Actor): void {
    const g = this.game;
    if (a.pad === null) { const p = this.scene.pick(this.mouse.x, this.mouse.y); a.cellX = Math.floor(p.x); a.cellY = Math.floor(p.y); }
    else { a.cellX = Math.floor(a.x); a.cellY = Math.floor(a.y); }
    if (a.tool && a.tool !== 'demolir') {
      const def = B[a.tool];
      const [fw, fh] = g.footprint(def, a.rot);
      a.originX = a.cellX - ((fw - 1) >> 1); a.originY = a.cellY - ((fh - 1) >> 1);
      if (def.kind === 'ring') { const t = g.entAt(a.cellX, a.cellY); if (t && t.def.kind === 'tree') { a.originX = t.x; a.originY = t.y; } }
      const res = g.canPlace(def, a.originX, a.originY, a.rot);
      a.ok = res.ok; a.reason = res.reason;
    }
  }

  private placeOne(a: Actor, key: string, x: number, y: number, rot: number): boolean {
    const g = this.game;
    const existed = g.entAt(x, y) !== null || (key === 'dalle' && g.world.slab(x, y) === 1);
    const res = g.place(key, x, y, rot, { recipe: a.recipeMem[key], filter: key === 'trieur' && a.filterMem >= 0 ? a.filterMem : undefined });
    if (res.ok && !existed) a.gesture?.push({ type: 'place', key, x, y, rot });
    return res.ok;
  }

  private tryPlace(a: Actor, first: boolean): void {
    const g = this.game;
    const def = B[a.tool!];
    if (def.kind === 'belt' && !first && a.dragLast) {
      // le convoyeur suit le curseur, case par case, et s'oriente tout seul
      let [lx, ly] = a.dragLast;
      let guard = 0;
      while ((lx !== a.cellX || ly !== a.cellY) && guard++ < 80) {
        const dx = a.cellX - lx, dy = a.cellY - ly;
        const dir = (Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 0 : 2) : dy > 0 ? 1 : 3) as Dir;
        const nx = lx + DX[dir], ny = ly + DY[dir];
        const prev = g.entAt(lx, ly);
        if (prev && prev.def.kind === 'belt') this.placeOne(a, 'convoyeur', lx, ly, dir);
        const next = g.entAt(nx, ny);
        if (next && next.def.kind !== 'belt') break;              // on s'arrête contre une machine : le flux y entre
        if (!this.placeOne(a, 'convoyeur', nx, ny, dir)) break;
        lx = nx; ly = ny; a.rot = dir;
      }
      a.dragLast = [lx, ly];
      return;
    }
    if (!first && def.kind !== 'slab' && def.kind !== 'belt' && (def.w > 1 || def.h > 1)) return;   // pas de pose en rafale pour les grands bâtiments
    const res = g.canPlace(def, a.originX, a.originY, a.rot);
    if (!res.ok) { if (first) { this.audio.deny(); this.hud.toast(res.reason); } }
    else this.placeOne(a, def.key, a.originX, a.originY, a.rot);
    a.dragLast = [a.cellX, a.cellY];
    this.aim(a);
  }

  private removeAt(a: Actor): void {
    const key = `${a.cellX},${a.cellY}`;
    if (key === a.lastRemove || !a.gesture) return;
    a.lastRemove = key;
    const info = this.game.remove(a.cellX, a.cellY);
    if (info) a.gesture.push({ type: 'remove', ...info });
  }

  private endGesture(a: Actor): void {
    if (a.gesture?.length) a.undo.push(a.gesture);
    a.gesture = null; a.dragLast = null; a.lastRemove = '';
  }

  private pipette(a: Actor): void {
    const e = this.game.entAt(a.cellX, a.cellY);
    if (e && e.def.cat) {
      a.tool = e.def.key; a.rot = e.rot;
      if (e.recipe) a.recipeMem[e.def.key] = e.recipe.key;
      if (e.def.filter) a.filterMem = e.filter;
      this.hud.select(null);
    } else a.tool = null;
    this.audio.ui();
  }

  private undo(a: Actor): void {
    const ops = a.undo.pop();
    if (!ops) { this.hud.toast('Rien à annuler'); return; }
    const g = this.game;
    for (let i = ops.length - 1; i >= 0; i--) {
      const op = ops[i];
      if (op.type === 'place') g.remove(op.x, op.y);
      else g.place(op.key, op.x, op.y, op.rot, { recipe: op.recipe, filter: op.filter, isOut: op.isOut });
    }
    this.audio.remove();
    this.hud.toast('Annulé');
  }

  // ============================================================== manettes
  private pads(): (Gamepad | null)[] { return navigator.getGamepads ? Array.from(navigator.getGamepads()) : []; }

  private updatePads(dt: number): void {
    const pads = this.pads(), g = this.game;
    for (const gp of pads) {
      if (!gp) continue;
      const owner = this.actors.find((p) => p.pad === gp.index);
      if (!owner && gp.buttons[0]?.pressed && this.actors.length < 4) {
        const used = new Set(this.actors.map((p) => p.id));
        let id = 1; while (used.has(id)) id++;
        const p = new Actor(id, gp.index);
        p.x = this.cam.x + id; p.y = this.cam.y; p.prev = gp.buttons.map((b) => b.pressed);
        this.actors.push(p);
        this.audio.start(); this.hud.toast(`${NAMES[id % 4]} rejoint le chantier`);
      } else if (owner && gp.buttons[8]?.pressed) {
        this.actors = this.actors.filter((p) => p !== owner);
        this.hud.toast(`${NAMES[owner.id % 4]} quitte le chantier`);
      }
    }
    this.actors = this.actors.filter((p) => p.pad === null || pads[p.pad]);
    const b = this.scene.bounds;
    for (const a of this.actors) {
      if (a.pad === null) continue;
      const gp = pads[a.pad]!;
      const dz = (v: number) => (Math.abs(v) < 0.2 ? 0 : v);
      const sp = this.cam.dist * 0.75;
      a.x += dz(gp.axes[0] ?? 0) * sp * dt; a.y += dz(gp.axes[1] ?? 0) * sp * dt;
      this.cam.x += dz(gp.axes[2] ?? 0) * sp * dt; this.cam.y += dz(gp.axes[3] ?? 0) * sp * dt;
      a.x = Math.max(b.x0 + 8, Math.min(b.x1 - 8, a.x)); a.y = Math.max(b.y0 + 10, Math.min(b.y1 - 8, a.y));
      const now = gp.buttons.map((x) => x.pressed), was = a.prev;
      const down = (i: number) => now[i] && !was[i], up = (i: number) => !now[i] && was[i];
      const moved = Math.floor(a.x) !== a.cellX || Math.floor(a.y) !== a.cellY;
      this.aim(a);
      if (down(2)) { a.rot = (a.rot + 1) & 3; this.aim(a); this.audio.ui(); }
      if (down(3)) this.pipette(a);
      if (down(4) || down(5)) {
        const tools: (string | null)[] = [null, ...BUILDINGS.filter((d) => d.cat && g.unlocked(d)).map((d) => d.key)];
        a.tool = tools[(tools.indexOf(a.tool) + (down(5) ? 1 : -1) + tools.length) % tools.length];
        this.audio.ui(); this.hud.toast(`${NAMES[a.id % 4]} : ${a.tool ? B[a.tool].name : 'aucun outil'}`);
        this.aim(a);
      }
      if (down(0) && a.tool) { a.gesture = []; a.dragLast = null; this.tryPlace(a, true); }
      else if (now[0] && a.tool && a.gesture && moved) this.tryPlace(a, false);
      if (up(0)) this.endGesture(a);
      if (down(1)) { a.gesture = []; a.lastRemove = ''; }
      if (now[1] && a.gesture) this.removeAt(a);
      if (up(1)) this.endGesture(a);
      if (down(12)) this.cam.dist = Math.max(MIN_DIST, this.cam.dist / 1.25);
      if (down(13)) this.cam.dist = Math.min(MAX_DIST, this.cam.dist * 1.25);
      if (down(9)) { if (this.hud.menuOpen) this.menu('resume'); else this.menu('pause'); }
      a.prev = now;
    }
  }

  // ================================================================ boucle
  private loop(): void {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.time += dt; this.frame++;
    const g = this.game, a = this.actors[0], m = this.mouse;

    if (this.started) {
      // déplacement de la vue au clavier
      const k = this.keys;
      let px = 0, py = 0;
      if (k.has('KeyW') || k.has('ArrowUp')) py -= 1;
      if (k.has('KeyS') || k.has('ArrowDown')) py += 1;
      if (k.has('KeyA') || k.has('ArrowLeft')) px -= 1;
      if (k.has('KeyD') || k.has('ArrowRight')) px += 1;
      if (px || py) { const sp = this.cam.dist * 0.95 * dt / Math.hypot(px, py); this.cam.x += px * sp; this.cam.y += py * sp; this.fly = null; }
      if (this.fly) {
        this.cam.x += (this.fly.x - this.cam.x) * Math.min(1, dt * 5); this.cam.y += (this.fly.y - this.cam.y) * Math.min(1, dt * 5);
        if (Math.hypot(this.fly.x - this.cam.x, this.fly.y - this.cam.y) < 0.2) this.fly = null;
      }
      if (!this.paused) {
        this.updatePads(dt);
        this.acc += dt;
        let n = 0;
        while (this.acc >= 1 / 60 && n++ < 5) { g.step(); this.acc -= 1 / 60; }
        if (this.acc > 0.2) this.acc = 0;
      }
      this.aim(a);
      const e = m.over ? g.entAt(a.cellX, a.cellY) : null;
      this.hover = e && (!a.tool || a.tool === 'demolir') ? e : null;
    } else {
      // écran-titre : la vue tourne lentement autour de la clairière
      this.cam.x = 0.5 + Math.cos(this.time * 0.05) * 5; this.cam.y = 2 + Math.sin(this.time * 0.07) * 4; this.cam.dist = 34;
      g.step();
    }

    this.drain();
    this.scene.placeCamera(this.cam.x, this.cam.y, this.cam.dist);
    const b = this.scene.bounds;
    g.world.ensureArea(b.x0, b.y0, b.x1, b.y1);     // le monde se génère devant la caméra : pas de bord
    const build = this.started && a.tool && a.tool !== 'demolir' ? a.tool : null;
    this.scene.render(g, {
      time: this.time, dt, frame: this.frame, camX: this.cam.x, camY: this.cam.y, dist: this.cam.dist,
      tool: build && m.over ? build : null, rot: a.rot, originX: a.originX, originY: a.originY, cellX: a.cellX, cellY: a.cellY,
      ghostOk: a.ok, demolish: a.tool === 'demolir', hover: this.hover, selected: this.hud.selected,
      cursors: this.actors.filter((p) => p.pad !== null).map((p) => ({ x: p.x, y: p.y, color: COLORS[p.id % 4] })),
      rings: this.rings, marker: this.started ? this.marker() : null, tilt: this.tilt,
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

  /** Infobulle au curseur : pourquoi on ne peut pas poser, ou ce qu'on survole. */
  private updateTip(): void {
    const a = this.actors[0], m = this.mouse, g = this.game;
    if (!m.over || m.panning || this.paused) { this.hud.tip(null); return; }
    let html: string | null = null;
    if (a.tool === 'demolir') html = this.hover ? `<b>Démolir : ${this.hover.def.name}</b><span class="k">Tout est remboursé</span>` : null;
    else if (a.tool) {
      const def = B[a.tool];
      html = a.ok
        ? `<b>${def.name}</b><span class="k">Clic : poser${def.kind === 'belt' ? ' · glisser : tracer' : ''}${def.w + def.h > 2 || def.kind === 'belt' || def.kind === 'splitter' || def.kind === 'bridge' ? ' · R : pivoter' : ''} · clic droit : lâcher</span>`
        : `<b>${def.name}</b><span class="no">${a.reason}</span>`;
    } else if (this.hover && (this.hover.def.kind === 'belt' || this.hover.def.kind === 'bridge' || this.hover.def.kind === 'deco')) {
      html = `<b>${this.hover.def.name}</b><span class="k">Clic droit : démolir · E : copier</span>`;
    } else if (this.hover) {
      const st = this.hud.statusLine(g, this.hover);
      html = `<b>${this.hover.def.name}</b><span class="${st.cls === 'bad' ? 'warn' : st.cls === 'ok' ? 'ok' : ''}">${st.text}</span><br><span class="k">Clic : détails</span>`;
    } else {
      const d = g.world.deposit(a.cellX, a.cellY);
      if (d) html = `<b>${DEPOSITS[d]!.name}</b><span class="k">${g.world.amount(a.cellX, a.cellY)} unités ici · pose un Puits dessus</span>`;
    }
    this.hud.tip(html, m.x, m.y);
  }

  /** Événements de la simulation → son et ondes visuelles. */
  private drain(): void {
    const g = this.game;
    for (const ev of g.events) {
      const d = Math.hypot(ev.x - this.cam.x, ev.y - this.cam.y);
      const near = this.started ? Math.max(0, 1 - d / (this.cam.dist * 0.9)) : 0;
      const pan = Math.max(-1, Math.min(1, (ev.x - this.cam.x) / (this.cam.dist * 0.6)));
      switch (ev.type) {
        case 'craft': case 'mine': this.audio.machine(near, pan); break;
        case 'cut': this.audio.cut(near, pan); break;
        case 'place': if (this.started) this.audio.place(ev.a); this.rings.push({ x: ev.x, y: ev.y, t0: this.time, color: '#f1efe8', size: 0.7 + Math.sqrt(ev.a) * 0.8, dur: 0.35 }); break;
        case 'remove': if (this.started) this.audio.remove(); this.rings.push({ x: ev.x, y: ev.y, t0: this.time, color: '#ff6a5a', size: 0.7 + Math.sqrt(ev.a) * 0.8, dur: 0.3 }); break;
        case 'quota':
          if (this.started) { this.audio.quota(); this.hud.banner(g); }
          for (let i = 0; i < 4; i++) this.rings.push({ x: ev.x, y: ev.y, t0: this.time + i * 0.25, color: i % 2 ? '#7ff0d2' : '#ffb050', size: 24 + i * 20, dur: 2.6 });
          break;
        default: break;
      }
    }
    g.events.length = 0;
    if (this.rings.length > 10) this.rings.splice(0, this.rings.length - 10);
  }
}

const app = new App();
(window as unknown as { brutalusine: App }).brutalusine = app;
if (import.meta.env.DEV) {
  void import('./dev').then((dev) => { (app as unknown as { demo: () => string[] }).demo = () => dev.buildDemo(app.game); });
}
