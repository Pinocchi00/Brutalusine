// Brutalusine — boucle principale : entrées des joueurs, simulation à pas fixe, rendu, interface, son.

import './ui/style.css';
import { B, BUILD_BAR, BELT_SPEED, TILE_U, DX, DY, type Dir } from './sim/data';
import { Game, type PlaceResult } from './sim/game';
import type { Ent } from './sim/ent';
import { GROUND_WATER } from './sim/world';
import { serialize, deserialize, writeSave, readSave } from './sim/save';
import { Renderer, type Camera, type PlayerView, type Ring, type View } from './render/renderer';
import { PAL } from './render/terrain';
import { Hud } from './ui/hud';
import { AudioEngine } from './audio/audio';

interface UndoOp { type: 'place' | 'remove'; key: string; x: number; y: number; rot: number; recipe?: string; filter?: number; isOut?: boolean; }

const COLORS = ['#FF5A1F', '#3FD0FF', '#B9F24A', '#F0559A'];
const NAMES = ['Orange', 'Cyan', 'Lime', 'Rose'];

class Player implements PlayerView {
  x = 0.5; y = 3.6; vx = 0; vy = 0; fx = 0; fy = 1;
  tool: string | null = null; rot = 0; cx = 0; cy = 5;
  aimX = 0; aimY = 2;
  dragLast: [number, number] | null = null;
  removing = false; clearing = false; lastRemove = '';
  recipeMem: Record<string, string> = {};
  filterMem = -1;
  undo: UndoOp[][] = [];
  gesture: UndoOp[] | null = null;
  cam: Camera = { x: 0.5, y: 2, zoom: 34 };
  ghost: PlaceResult | null = null; inReach = true;
  ox = 0; oy = 0;                       // origine de l'empreinte de l'outil
  prev: boolean[] = [];
  constructor(public id: number, public pad: number | null) {}
  get color(): string { return COLORS[this.id % 4]; }
}

class App {
  game: Game;
  renderer: Renderer;
  hud: Hud;
  audio = new AudioEngine();
  players: Player[] = [new Player(0, null)];
  keys = new Set<string>();
  pressed = new Set<string>();
  mouse = { x: 0, y: 0, left: false, right: false, leftDown: false, leftUp: false, rightUp: false };
  zoom = 34; zoomBack = 34;
  rings: Ring[] = [];
  time = 0; frame = 0; acc = 0; last = performance.now();
  started = false; paused = false;
  hudTimer = 0; saveTimer = 0;
  canvas = document.getElementById('game') as HTMLCanvasElement;

  constructor() {
    this.game = new Game((Math.random() * 1e9) | 0);
    this.renderer = new Renderer(this.canvas);
    this.hud = new Hud({
      game: () => this.game,
      selectTool: (k) => { this.players[0].tool = k; this.audio.ui(); },
      currentTool: () => this.players[0].tool,
      setRecipe: (e, key) => { this.game.setRecipe(e, this.game.quota >= 0 ? (awaitRecipe(key)) : null); this.players[0].recipeMem[e.def.key] = key; this.audio.ui(); },
      setFilter: (e, id) => { e.filter = id; this.players[0].filterMem = id; this.audio.ui(); },
      buyUpgrade: (k) => { if (this.game.buyUpgrade(k)) this.audio.quota(); },
      ping: (list) => { for (const e of list) this.rings.push({ x: e.cx, y: e.cy, t0: this.time, color: PAL.gold, size: 3, dur: 1.4 }); if (list[0]) this.hud.toast(`${list.length} à voir — suis les ondes dorées`); },
      menu: (a, v) => this.menu(a, v),
      playerLines: () => this.players.map((p) => `<b style="color:${p.color};-webkit-text-stroke:.5px #1B1446">●</b> ${NAMES[p.id % 4]} — ${p.pad === null ? 'clavier + souris' : `manette ${p.pad + 1}`}`),
    });
    this.bind();
    this.resize();
    void readSave('auto').then((s) => { if (s) document.getElementById('btn-continue')!.hidden = false; });
    requestAnimationFrame(() => this.loop());
  }

  // ================================================================ entrées
  private bind(): void {
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('keydown', (ev) => {
      const typing = (ev.target as HTMLElement).tagName === 'INPUT';
      if (ev.code === 'Escape') { this.escape(); return; }
      if (typing) return;
      if (ev.code === 'Tab') { ev.preventDefault(); if (this.started) { if (this.hud.codexOpen) this.hud.closeCodex(); else this.hud.openCodex(); } return; }
      if (ev.ctrlKey && ev.code === 'KeyZ') { ev.preventDefault(); this.undo(this.players[0]); return; }
      if (ev.ctrlKey || ev.metaKey) return;
      if (!this.keys.has(ev.code)) this.pressed.add(ev.code);
      this.keys.add(ev.code);
      if (ev.code.startsWith('Arrow') || ev.code === 'Space') ev.preventDefault();
    });
    window.addEventListener('keyup', (ev) => this.keys.delete(ev.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.mouse.left = this.mouse.right = false; });
    const cv = this.canvas;
    cv.addEventListener('mousemove', (ev) => { this.mouse.x = ev.clientX; this.mouse.y = ev.clientY; });
    cv.addEventListener('mousedown', (ev) => {
      this.audio.start();
      this.mouse.x = ev.clientX; this.mouse.y = ev.clientY;
      if (ev.button === 0) { this.mouse.left = true; this.mouse.leftDown = true; }
      if (ev.button === 2) this.mouse.right = true;
    });
    window.addEventListener('mouseup', (ev) => {
      if (ev.button === 0 && this.mouse.left) { this.mouse.left = false; this.mouse.leftUp = true; }
      if (ev.button === 2 && this.mouse.right) { this.mouse.right = false; this.mouse.rightUp = true; }
    });
    cv.addEventListener('contextmenu', (ev) => ev.preventDefault());
    cv.addEventListener('wheel', (ev) => { ev.preventDefault(); this.zoom = Math.max(9, Math.min(72, this.zoom * Math.exp(-ev.deltaY * 0.0012))); }, { passive: false });
    document.getElementById('btn-new')!.addEventListener('click', () => this.begin());
    document.getElementById('btn-continue')!.addEventListener('click', () => { void this.load().then(() => this.begin()); });
  }

  private begin(): void {
    this.started = true;
    for (const p of this.players) { p.x = 0.5 + p.id; p.y = 3.6; p.cam.x = p.x; p.cam.y = p.y; }
    document.getElementById('title')!.hidden = true;
    document.getElementById('hud')!.hidden = false;
    this.audio.start();
    this.hud.update(this.game);
  }

  private escape(): void {
    const p = this.players[0];
    if (!this.started) return;
    if (this.hud.codexOpen) this.hud.closeCodex();
    else if (this.hud.menuOpen) { this.hud.toggleMenu(false); this.paused = false; }
    else if (p.tool) p.tool = null;
    else if (this.hud.selected) this.hud.select(null);
    else { this.paused = this.hud.toggleMenu(true); }
  }

  private menu(action: string, value?: string): void {
    switch (action) {
      case 'resume': this.hud.toggleMenu(false); this.paused = false; break;
      case 'save': void this.save().then(() => this.hud.toast('Partie sauvegardée')); break;
      case 'load': void this.load().then((ok) => { this.hud.toast(ok ? 'Partie chargée' : 'Aucune sauvegarde'); if (ok) { this.hud.toggleMenu(false); this.paused = false; } }); break;
      case 'new':
        this.game = new Game((Math.random() * 1e9) | 0); this.resetWorld();
        this.hud.toggleMenu(false); this.paused = false; this.hud.toast('Nouvelle planète');
        break;
      case 'volume': this.audio.setVolume(parseFloat(value ?? '0.7')); break;
      case 'tilt': document.body.classList.toggle('no-tilt', value !== 'true'); break;
      case 'codex-back': this.hud.codexBack(); break;
      case 'savoir': this.hud.select(this.game.hub); break;
    }
  }

  private resetWorld(): void {
    this.renderer.terrain.clear();
    this.hud.select(null);
    this.rings.length = 0;
    for (const p of this.players) { p.x = 0.5 + p.id; p.y = 3.6; p.undo.length = 0; p.tool = null; p.cam.x = p.x; p.cam.y = p.y; }
  }

  async save(): Promise<void> {
    await writeSave('auto', serialize(this.game, { players: this.players.map((p) => ({ x: p.x, y: p.y })) }));
  }

  async load(): Promise<boolean> {
    const d = await readSave('auto');
    if (!d) return false;
    this.game = deserialize(d);
    this.resetWorld();
    const ex = d.extra as { players?: { x: number; y: number }[] } | undefined;
    ex?.players?.forEach((s, i) => { const p = this.players[i]; if (p) { p.x = s.x; p.y = s.y; p.cam.x = s.x; p.cam.y = s.y; } });
    return true;
  }

  private resize(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(window.innerWidth * dpr);
    this.canvas.height = Math.round(window.innerHeight * dpr);
  }

  // ================================================================ joueurs
  private pads(): (Gamepad | null)[] { return navigator.getGamepads ? Array.from(navigator.getGamepads()) : []; }

  private joinLeave(): void {
    const pads = this.pads();
    for (const gp of pads) {
      if (!gp) continue;
      const owner = this.players.find((p) => p.pad === gp.index);
      if (!owner && gp.buttons[0]?.pressed && this.players.length < 4 && this.started) {
        const used = new Set(this.players.map((p) => p.id));
        let id = 1; while (used.has(id)) id++;
        const p = new Player(id, gp.index);
        p.x = this.players[0].x + 1; p.y = this.players[0].y; p.cam = { ...this.players[0].cam };
        p.prev = gp.buttons.map((b) => b.pressed);
        this.players.push(p);
        this.audio.start(); this.audio.quota();
        this.hud.toast(`${NAMES[id % 4]} rejoint le chantier`);
      } else if (owner && gp.buttons[8]?.pressed && owner.pad !== null) {
        this.players = this.players.filter((p) => p !== owner);
        this.hud.toast(`${NAMES[owner.id % 4]} quitte le chantier`);
      }
    }
    this.players = this.players.filter((p) => p.pad === null || pads[p.pad]);
  }

  private updatePlayer(p: Player, dt: number): void {
    const g = this.game, w = g.world;
    const W = window.innerWidth, H = window.innerHeight;
    let mx = 0, my = 0, primary = false, primaryDown = false, primaryUp = false, secondary = false, secondaryUp = false;
    let rotate = false, pipette = false, clear = false, cycle = 0, sprint = false;
    if (p.pad === null) {
      const k = this.keys, pr = this.pressed;
      if (k.has('KeyW') || k.has('ArrowUp')) my -= 1;
      if (k.has('KeyS') || k.has('ArrowDown')) my += 1;
      if (k.has('KeyA') || k.has('ArrowLeft')) mx -= 1;
      if (k.has('KeyD') || k.has('ArrowRight')) mx += 1;
      sprint = k.has('ShiftLeft');
      primary = this.mouse.left; primaryDown = this.mouse.leftDown; primaryUp = this.mouse.leftUp;
      secondary = this.mouse.right; secondaryUp = this.mouse.rightUp;
      rotate = pr.has('KeyR'); pipette = pr.has('KeyE'); clear = k.has('KeyF');
      const wx = p.cam.x + (this.mouse.x - W / 2) / p.cam.zoom, wy = p.cam.y + (this.mouse.y - H / 2) / p.cam.zoom;
      p.cx = Math.floor(wx); p.cy = Math.floor(wy);
      const tools = BUILD_BAR.filter((key) => g.unlocked(B[key]));
      for (let i = 0; i < 10; i++) if (pr.has(i === 9 ? 'Digit0' : `Digit${i + 1}`) && tools[i]) { p.tool = p.tool === tools[i] ? null : tools[i]; this.audio.ui(); }
      if (pr.has('KeyM')) { if (this.zoom > 13) { this.zoomBack = this.zoom; this.zoom = 11; } else this.zoom = this.zoomBack; }
    } else {
      const gp = this.pads()[p.pad];
      if (!gp) return;
      const dz = (v: number) => (Math.abs(v) < 0.22 ? 0 : v);
      mx = dz(gp.axes[0] ?? 0); my = dz(gp.axes[1] ?? 0);
      const ax = dz(gp.axes[2] ?? 0), ay = dz(gp.axes[3] ?? 0);
      p.aimX += ax * dt * 16; p.aimY += ay * dt * 16;
      const al = Math.hypot(p.aimX, p.aimY), maxAim = g.reach - 1;
      if (al > maxAim) { p.aimX *= maxAim / al; p.aimY *= maxAim / al; }
      p.cx = Math.floor(p.x + p.aimX); p.cy = Math.floor(p.y + p.aimY);
      const b = gp.buttons.map((x) => x.pressed), was = p.prev;
      const down = (i: number) => b[i] && !was[i], up = (i: number) => !b[i] && was[i];
      primary = b[0]; primaryDown = down(0); primaryUp = up(0);
      secondary = b[1]; secondaryUp = up(1);
      rotate = down(2); pipette = down(3); clear = b[6]; sprint = b[7];
      cycle = down(5) ? 1 : down(4) ? -1 : 0;
      if (down(12)) this.zoom = Math.min(72, this.zoom * 1.25);
      if (down(13)) this.zoom = Math.max(9, this.zoom / 1.25);
      if (down(9)) { if (this.hud.menuOpen) this.menu('resume'); else this.paused = this.hud.toggleMenu(true); }
      p.prev = b;
    }
    if (this.paused) return;

    // --- déplacement : la canopée freine, l'eau aussi, les convoyeurs emportent
    const cellX = Math.floor(p.x), cellY = Math.floor(p.y);
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    if (len > 0.1) { p.fx = mx / Math.max(len, 1e-6) * Math.min(1, len); p.fy = my / Math.max(len, 1e-6) * Math.min(1, len); const fl = Math.hypot(p.fx, p.fy); p.fx /= fl; p.fy /= fl; }
    let speed = 8.5 * (sprint ? 1.5 : 1);
    if (w.ground(cellX, cellY) === GROUND_WATER) speed *= 0.45;
    else if (!w.slab(cellX, cellY)) speed *= 1 - 0.5 * Math.min(1, w.canopy(cellX, cellY) / 200);
    let tx = mx * speed, ty = my * speed;
    const under = g.entAt(cellX, cellY);
    if (under && under.def.kind === 'belt') {
      const bs = (BELT_SPEED * g.upgradeMult('convoyeurs') * 60) / TILE_U;
      tx += DX[under.rot] * bs; ty += DY[under.rot] * bs;
    }
    const a = Math.min(1, dt * 14);
    p.vx += (tx - p.vx) * a; p.vy += (ty - p.vy) * a;
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (this.frame % 30 === p.id) w.ensureArea(Math.floor(p.x) - 44, Math.floor(p.y) - 34, Math.floor(p.x) + 44, Math.floor(p.y) + 34);

    // --- outil
    if (cycle) {
      const tools: (string | null)[] = [null, ...BUILD_BAR.filter((key) => g.unlocked(B[key]))];
      p.tool = tools[(tools.indexOf(p.tool) + cycle + tools.length) % tools.length];
      this.audio.ui();
      if (p.tool) this.hud.toast(`${NAMES[p.id % 4]} : ${B[p.tool].name}`);
    }
    if (rotate) { p.rot = (p.rot + 1) & 3; this.audio.ui(); }
    if (pipette) {
      const e = g.entAt(p.cx, p.cy);
      if (e && BUILD_BAR.includes(e.def.key)) {
        p.tool = e.def.key; p.rot = e.rot;
        if (e.recipe) p.recipeMem[e.def.key] = e.recipe.key;
        if (e.def.kind === 'splitter') p.filterMem = e.filter;
      } else p.tool = !e && w.slab(p.cx, p.cy) ? 'dalle' : null;
      this.audio.ui();
    }
    p.clearing = clear;
    p.removing = secondary;
    const reach = g.reach;
    p.inReach = Math.hypot(p.cx + 0.5 - p.x, p.cy + 0.5 - p.y) <= reach;
    if (p.tool) {
      const def = B[p.tool];
      const [fw, fh] = g.footprint(def, p.rot);
      p.ox = p.cx - ((fw - 1) >> 1); p.oy = p.cy - ((fh - 1) >> 1);
      if (def.kind === 'ring') { const t = g.entAt(p.cx, p.cy); if (t && t.def.kind === 'tree') { p.ox = t.x; p.oy = t.y; } }
      p.ghost = g.canPlace(def, p.ox, p.oy, p.rot);
    } else p.ghost = null;

    if (clear && p.inReach) {
      let cut = 0;
      for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) if (i * i + j * j <= 3) cut += g.clearCanopy(p.cx + i, p.cy + j, 5);
      if (cut > 0 && this.frame % 8 === 0) this.audio.cut(0.6, 0);
      return;
    }
    if (primaryDown) {
      if (p.tool) { p.gesture = []; p.dragLast = null; this.tryPlace(p, true); }
      else { const e = g.entAt(p.cx, p.cy); this.hud.select(e); if (e) this.audio.ui(); }
    } else if (primary && p.tool && p.gesture && (!p.dragLast || p.dragLast[0] !== p.cx || p.dragLast[1] !== p.cy)) this.tryPlace(p, false);
    if (primaryUp && p.gesture) { if (p.gesture.length) p.undo.push(p.gesture); p.gesture = null; p.dragLast = null; }

    if (secondary) {
      const key = `${p.cx},${p.cy}`;
      if (key !== p.lastRemove && p.inReach) {
        p.lastRemove = key;
        if (!p.gesture) p.gesture = [];
        const info = g.remove(p.cx, p.cy);
        if (info) p.gesture.push({ type: 'remove', ...info });
      }
    }
    if (secondaryUp) { p.lastRemove = ''; if (p.gesture && !primary) { if (p.gesture.length) p.undo.push(p.gesture); p.gesture = null; } }
  }

  private deny(reason: string): void { this.audio.deny(); this.hud.toast(reason); }

  private placeOne(p: Player, key: string, x: number, y: number, rot: number): PlaceResult {
    const g = this.game;
    const existed = g.entAt(x, y) !== null || (key === 'dalle' && g.world.slab(x, y) === 1);
    const res = g.place(key, x, y, rot, { recipe: p.recipeMem[key], filter: key === 'aiguillage' && p.filterMem >= 0 ? p.filterMem : undefined });
    if (res.ok && !existed) p.gesture?.push({ type: 'place', key, x, y, rot });
    return res;
  }

  /** Taille la canopée sous une empreinte : construire dans la jungle, c'est s'y frayer un chemin. */
  private hack(x: number, y: number, w: number, h: number): void {
    let cut = 0;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) cut += this.game.clearCanopy(x + i, y + j, 12);
    if (cut > 0 && this.frame % 6 === 0) this.audio.cut(0.7, 0);
  }

  private tryPlace(p: Player, first: boolean): void {
    const g = this.game;
    const def = B[p.tool!];
    if (!p.inReach) { if (first) this.deny('Hors de portée — approche-toi'); return; }
    if (def.kind === 'belt' && !first && p.dragLast) {
      // le convoyeur suit le curseur, case par case
      let [lx, ly] = p.dragLast;
      let guard = 0;
      while ((lx !== p.cx || ly !== p.cy) && guard++ < 64) {
        const dx = p.cx - lx, dy = p.cy - ly;
        const dir = (Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 0 : 2) : dy > 0 ? 1 : 3) as Dir;
        const nx = lx + DX[dir], ny = ly + DY[dir];
        const prev = g.entAt(lx, ly);
        if (prev && prev.def.kind === 'belt') this.placeOne(p, 'convoyeur', lx, ly, dir);
        const res = this.placeOne(p, 'convoyeur', nx, ny, dir);
        if (!res.ok) { if (res.canopy) this.hack(nx, ny, 1, 1); break; }
        lx = nx; ly = ny; p.rot = dir;
      }
      p.dragLast = [lx, ly];
      return;
    }
    const res = g.canPlace(def, p.ox, p.oy, p.rot);
    if (!res.ok) {
      // la canopée résiste : on taille, et on retentera à l'image suivante
      if (res.canopy) { const [fw, fh] = g.footprint(def, p.rot); this.hack(p.ox, p.oy, fw, fh); return; }
      if (first) this.deny(res.reason);
    } else this.placeOne(p, def.key, p.ox, p.oy, p.rot);
    p.dragLast = [p.cx, p.cy];
  }

  private undo(p: Player): void {
    const ops = p.undo.pop();
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

  // ================================================================== vues
  private views(dt: number): View[] {
    const ps = this.players;
    const dpr = this.canvas.width / window.innerWidth;
    const W = this.canvas.width, H = this.canvas.height;
    const k = Math.min(1, dt * 7);
    const follow = (p: Player, x: number, y: number, zoom: number) => { p.cam.x += (x - p.cam.x) * k; p.cam.y += (y - p.cam.y) * k; p.cam.zoom += (zoom - p.cam.zoom) * Math.min(1, dt * 10); };
    const dev = (c: Camera): Camera => ({ x: c.x, y: c.y, zoom: c.zoom * dpr });
    if (ps.length === 1) { follow(ps[0], ps[0].x, ps[0].y, this.zoom); return [{ cam: dev(ps[0].cam), clip: null }]; }
    if (ps.length === 2) {
      const [a, b] = ps;
      const dx = b.x - a.x, dy = b.y - a.y, dist = Math.hypot(dx, dy);
      const R = (0.27 * Math.min(window.innerWidth, window.innerHeight)) / this.zoom;   // en cases
      if (dist <= 2 * R) {
        follow(a, (a.x + b.x) / 2, (a.y + b.y) / 2, this.zoom); b.cam = { ...a.cam };
        return [{ cam: dev(a.cam), clip: null }];
      }
      // écran partagé dynamique : la ligne de partage est perpendiculaire à l'axe entre les deux bâtisseurs
      const ux = dx / dist, uy = dy / dist;
      follow(a, a.x + ux * R, a.y + uy * R, this.zoom);
      follow(b, b.x - ux * R, b.y - uy * R, this.zoom);
      const cx = W / 2, cy = H / 2, L = W + H;
      const half = (s: number): [number, number][] => [
        [cx - uy * L, cy + ux * L], [cx + uy * L, cy - ux * L],
        [cx + uy * L + ux * L * s, cy - ux * L + uy * L * s], [cx - uy * L + ux * L * s, cy + ux * L + uy * L * s],
      ];
      return [{ cam: dev(a.cam), clip: half(-1) }, { cam: dev(b.cam), clip: half(1) }];
    }
    // trois ou quatre : une seule vue qui recule pour garder tout le monde à l'écran
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of ps) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
    const fit = Math.max(9, Math.min(this.zoom, window.innerWidth / (x1 - x0 + 14), window.innerHeight / (y1 - y0 + 12)));
    follow(ps[0], (x0 + x1) / 2, (y0 + y1) / 2, fit);
    for (const p of ps) p.cam = { ...ps[0].cam };
    return [{ cam: dev(ps[0].cam), clip: null }];
  }

  // ================================================================ boucle
  private loop(): void {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.time += dt; this.frame++;
    const g = this.game;

    if (this.started) {
      this.joinLeave();
      for (const p of this.players) this.updatePlayer(p, dt);
      if (!this.paused) {
        this.acc += dt;
        let n = 0;
        while (this.acc >= 1 / 60 && n++ < 5) { g.step(); this.acc -= 1 / 60; }
        if (this.acc > 0.2) this.acc = 0;
      }
    } else {
      // écran-titre : la caméra dérive lentement autour de la clairière
      const p = this.players[0];
      p.x = 0.5 + Math.cos(this.time * 0.07) * 7; p.y = 1.5 + Math.sin(this.time * 0.09) * 5;
      g.step();
    }
    this.pressed.clear();
    this.mouse.leftDown = this.mouse.leftUp = this.mouse.rightUp = false;

    // premier pas : une onde dorée désigne le gisement tant qu'aucun puits n'est posé
    if (this.started && g.quota === 0 && this.frame % 150 === 0 && !g.tickers.some((e) => e.def.kind === 'miner')) {
      const b = g.world.blobs[0];
      this.rings.push({ x: b.x + 0.5, y: b.y + 0.5, t0: this.time, color: PAL.gold, size: 4.5, dur: 1.8 });
    }
    this.drain();
    const views = this.views(dt);
    const opts = { time: this.time, frame: this.frame, dt, players: this.started ? this.players : [], selected: this.hud.selected, rings: this.rings, reach: g.reach };
    this.renderer.begin(g, opts);
    for (const v of views) this.renderer.renderView(g, v, opts);
    if (views.length === 2) this.splitLine();
    this.rings = this.rings.filter((r) => this.time - r.t0 < r.dur);
    this.audio.ambience(g.sun.night, g.sun.light);

    if (this.started) {
      this.hudTimer -= dt;
      if (this.hudTimer <= 0) { this.hudTimer = 0.2; this.hud.update(g); this.updateHint(); }
      this.saveTimer += dt;
      if (this.saveTimer > 120 && !this.paused) { this.saveTimer = 0; void this.save(); }
    }
    requestAnimationFrame(() => this.loop());
  }

  private splitLine(): void {
    const [a, b] = this.players;
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
    const c = this.renderer.ctx, W = this.canvas.width, H = this.canvas.height, L = W + H;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.beginPath(); c.moveTo(W / 2 - (-dy / d) * L, H / 2 - (dx / d) * L); c.lineTo(W / 2 + (-dy / d) * L, H / 2 + (dx / d) * L);
    c.strokeStyle = PAL.ink; c.lineWidth = 8; c.stroke();
    c.strokeStyle = PAL.bone; c.lineWidth = 4; c.stroke();
  }

  /** Événements de la simulation → son et ondes visuelles. */
  private drain(): void {
    const g = this.game;
    const cams = this.players.map((p) => p.cam);
    for (const ev of g.events) {
      let near = 0, pan = 0;
      for (const c of cams) {
        const d2 = (ev.x - c.x) ** 2 + (ev.y - c.y) ** 2;
        const n = 1 / (1 + d2 / 320);
        if (n > near) { near = n; pan = Math.max(-1, Math.min(1, (ev.x - c.x) / 22)); }
      }
      if (!this.started) near *= 0;
      switch (ev.type) {
        case 'craft': this.audio.craft(ev.a, near, pan, g.sun.night); break;
        case 'mine': this.audio.mine(near, pan); break;
        case 'cut': this.audio.cut(near, pan); break;
        case 'deliver': this.audio.deliver(ev.a, near, pan); break;
        case 'place': this.audio.place(ev.a); this.rings.push({ x: ev.x, y: ev.y, t0: this.time, color: PAL.boneLight, size: 0.6 + Math.sqrt(ev.a) * 0.7, dur: 0.35 }); break;
        case 'remove': this.audio.remove(); this.rings.push({ x: ev.x, y: ev.y, t0: this.time, color: PAL.pink, size: 0.6 + Math.sqrt(ev.a) * 0.7, dur: 0.3 }); break;
        case 'quota':
          this.audio.quota();
          for (let i = 0; i < 4; i++) this.rings.push({ x: ev.x, y: ev.y, t0: this.time + i * 0.25, color: i % 2 ? PAL.glow : PAL.gold, size: 26 + i * 22, dur: 2.6 });
          if (this.started) this.hud.banner(g);
          break;
      }
    }
    g.events.length = 0;
  }

  private updateHint(): void {
    const p = this.players[0];
    if (p.tool) {
      const def = B[p.tool];
      const why = p.ghost && !p.ghost.ok ? ` — ${p.ghost.reason}` : !p.inReach ? ' — hors de portée' : '';
      this.hud.hint(`${def.name}${why} · clic : poser${def.kind === 'belt' || def.kind === 'slab' ? ' (glisser pour tracer)' : ''} · maintenir dans la jungle : tailler · R : pivoter · Échap : lâcher`);
    } else this.hud.hint('Clic : inspecter · 1–9 : construire · clic droit : démolir · F : défricher · E : pipette · Tab : Atlas');
  }
}

import { R } from './sim/data';
function awaitRecipe(key: string) { return R[key] ?? null; }

const app = new App();
(window as unknown as { brutalusine: App }).brutalusine = app;
export type { Ent };
