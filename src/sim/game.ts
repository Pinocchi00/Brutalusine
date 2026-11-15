// La simulation : déterministe, à pas fixe, sans aucune dépendance au navigateur.
// Le brut de l'automatisation : extraire, transporter, transformer, livrer. Rien ne disparaît.

import {
  B, BELT_SPEED, CANOPY_UNIT, DEPOSITS, FUEL, I, ITEMS, LOOT_FER, NITEMS, R, START_STOCK, TREE_MIN,
  quotaAt, type BuildingDef, type Dir, type Recipe,
} from './data';
import { World, GROUND_WATER, CHUNK, type Chunk } from './world';
import { Ent, Status } from './ent';
import { rebuildBelts, type BeltPath } from './belts';
import { sunAt, type Sun } from './sun';
import { valueNoise } from './rng';

export const ACCU_CAP = 60000;         // J
export const STORE_CAP = 240;
export const CO2_START = 200000;
export const SAW_RANGE = 5;

/** Le réseau électrique : un seul pour toute l'usine. */
export interface Power {
  demand: number; lastDemand: number; capacity: number; sat: number; stored: number; storeMax: number;
  base: number; solars: Ent[]; winds: Ent[]; hydros: Ent[]; gens: Ent[]; accus: Ent[];
}

export interface GameEvent {
  type: 'craft' | 'deliver' | 'quota' | 'place' | 'remove' | 'mine' | 'cut' | 'fell' | 'pick' | 'hand';
  x: number; y: number; a: number;
}
export interface PlaceResult { ok: boolean; reason: string; }
export interface PlaceOpts { recipe?: string; filter?: number; isOut?: boolean; free?: boolean; }
export interface RemoveInfo { key: string; x: number; y: number; rot: number; recipe?: string; filter?: number; isOut?: boolean; }

export class Stats {
  static WIN = 60;
  prod = new Float32Array(NITEMS * Stats.WIN);
  cons = new Float32Array(NITEMS * Stats.WIN);
  cur = 0;
  roll(): void {
    this.cur = (this.cur + 1) % Stats.WIN;
    for (let i = 0; i < NITEMS; i++) { this.prod[i * Stats.WIN + this.cur] = 0; this.cons[i * Stats.WIN + this.cur] = 0; }
  }
  /** Débit par minute sur la dernière minute. */
  rate(arr: Float32Array, id: number): number {
    let s = 0;
    for (let k = 0; k < Stats.WIN; k++) s += arr[id * Stats.WIN + k];
    return s;
  }
}

export class Game {
  world: World;
  tick = 0;
  nextId = 1;
  version = 1;               // incrémenté à chaque pose ou démolition (rendu)
  ents = new Map<number, Ent>();
  belts: Ent[] = [];
  tickers: Ent[] = [];       // tout ce qui agit à chaque pas (hors convoyeurs)
  paths: BeltPath[] = [];
  topoDirty = true;
  power: Power = { demand: 0, lastDemand: 0, capacity: 0, sat: 1, stored: 0, storeMax: 0, base: 0, solars: [], winds: [], hydros: [], gens: [], accus: [] };
  wind = 0.6;
  stock = new Float64Array(NITEMS);
  quota = 0;
  delivered = new Float64Array(NITEMS);
  made = new Uint8Array(NITEMS);   // objets déjà obtenus au moins une fois (étapes guidées, Atlas)
  gathered = 0;                    // gestes de récolte à la main (étapes guidées)
  quotaStart = 0;
  atmo = { co2: CO2_START };       // le carbone de l'air : il ferme le cycle, sans rien demander au joueur
  sun: Sun = sunAt(0);
  stats = new Stats();
  events: GameEvent[] = [];
  records: { quota: number; ticks: number; buildings: number }[] = [];
  hub!: Ent;
  loading = false;

  constructor(public seed: number, fresh = true) {
    this.world = new World(seed);
    if (fresh) this.init();
  }

  private init(): void {
    this.world.ensureArea(-48, -48, 48, 48);
    for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) this.pave(x, y);
    this.hub = this.spawn(B.tour, -1, -1, 3 as Dir);
    for (const k in START_STOCK) this.stock[I[k]] = START_STOCK[k];
  }

  // ============================================================== entités
  entAt(x: number, y: number): Ent | null {
    const id = this.world.ent(x, y);
    return id ? this.ents.get(id) ?? null : null;
  }

  /** Arrache ce qui pousse sur une case jusqu'à ne laisser que `keep`. Le bois rejoint le stock. */
  private clearTree(x: number, y: number, keep: number): number {
    const w = this.world;
    const c = w.canopy(x, y);
    if (c <= keep) return 0;
    w.setCanopy(x, y, keep);
    const wood = (c - keep) / CANOPY_UNIT;
    this.stock[I.bois] += wood;
    if (c >= TREE_MIN && keep < TREE_MIN) this.emit('fell', x + 0.5, y + 0.5, c);
    return wood;
  }

  /** Coule une dalle : l'arbre dessous et ceux qui la touchent sont arrachés. */
  private pave(x: number, y: number): void {
    const w = this.world;
    if (w.slab(x, y)) return;
    if (w.takeLoot(x, y)) this.stock[I.fer] += LOOT_FER;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) this.clearTree(x + i, y + j, 0);   // une case de lisière dégagée
    w.setSlab(x, y, 1);
  }

  spawn(def: BuildingDef, x: number, y: number, rot: Dir): Ent {
    const swap = (rot & 1) === 1 && def.w !== def.h;
    const w = swap ? def.h : def.w, h = swap ? def.w : def.h;
    const e = new Ent(this.nextId++, def, x, y, rot, w, h);
    e.born = this.tick;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.world.setEnt(x + i, y + j, e.id);
    this.ents.set(e.id, e);
    const k = def.kind;
    if (k === 'belt' || k === 'bridge') this.belts.push(e);
    else {
      this.tickers.push(e);
      if (k === 'machine' || k === 'miner' || k === 'sawmill' || k === 'storage' || k === 'generator') {
        e.buf = new Int32Array(NITEMS); e.out = new Int32Array(NITEMS);
      }
      if (def.recipes.length) e.recipe = def.recipes[0];
      if (k === 'miner') {
        e.cells = [];
        for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) e.cells.push(x + i, y + j);
      }
    }
    this.topoDirty = true; this.version++;
    return e;
  }

  footprint(def: BuildingDef, rot: number): [number, number] {
    return (rot & 1) === 1 && def.w !== def.h ? [def.h, def.w] : [def.w, def.h];
  }

  unlocked(def: BuildingDef): boolean { return this.quota >= def.unlock; }
  affordable(def: BuildingDef): boolean { return def.cost.every(([id, n]) => this.stock[id] >= n); }
  count(key: string): number { let n = 0; for (const e of this.tickers) if (e.def.key === key) n++; return n; }

  /** Peut-on poser ce bâtiment ici ? Donne la cause en clair si non. */
  canPlace(def: BuildingDef, x: number, y: number, rot: number, free = false): PlaceResult {
    const w = this.world;
    const [fw, fh] = this.footprint(def, rot);
    const res: PlaceResult = { ok: false, reason: '' };
    let ore = false, shore = false;
    for (let j = 0; j < fh; j++) for (let i = 0; i < fw; i++) {
      const cx = x + i, cy = y + j;
      if (w.ground(cx, cy) === GROUND_WATER) { res.reason = 'Impossible sur l’eau'; return res; }
      const o = this.entAt(cx, cy);
      if (o && !(def.kind === 'belt' && o.def.kind === 'belt')) { res.reason = 'Case occupée'; return res; }
      if (def.kind === 'slab' && w.slab(cx, cy)) { res.reason = 'Déjà dallé'; return res; }
      if (w.amount(cx, cy) > 0) ore = true;
    }
    for (let j = -1; j <= fh && !shore; j++) for (let i = -1; i <= fw; i++) if (w.ground(x + i, y + j) === GROUND_WATER) { shore = true; break; }
    if (def.kind === 'miner' && !ore) { res.reason = 'À poser sur un gisement (rochers colorés)'; return res; }
    if (def.kind === 'hydro' && !shore) { res.reason = 'À poser au bord de l’eau'; return res; }
    if (!free) {
      if (!this.unlocked(def)) { res.reason = 'Pas encore débloqué'; return res; }
      for (const [id, n] of def.cost) {
        if (this.stock[id] < n) { res.reason = `Il manque ${ITEMS[id].name} (${Math.floor(this.stock[id])}/${n})`; return res; }
      }
    }
    res.ok = true;
    return res;
  }

  place(key: string, x: number, y: number, rot: number, opts: PlaceOpts = {}): PlaceResult {
    const def = B[key];
    const res = this.canPlace(def, x, y, rot, opts.free);
    if (!res.ok) return res;
    const [fw, fh] = this.footprint(def, rot);
    if (def.kind === 'belt') {
      const o = this.entAt(x, y);
      if (o) {                                   // réorienter un convoyeur existant : gratuit
        if (o.rot !== rot) { o.rot = rot as Dir; this.topoDirty = true; this.version++; }
        return res;
      }
    }
    if (!opts.free) for (const [id, n] of def.cost) this.stock[id] -= n;
    for (let j = 0; j < fh; j++) for (let i = 0; i < fw; i++) this.pave(x + i, y + j);
    this.topoDirty = true; this.version++;
    if (def.kind === 'slab') { this.events.push({ type: 'place', x: x + 0.5, y: y + 0.5, a: 0 }); return res; }
    const e = this.spawn(def, x, y, rot as Dir);
    if (def.kind === 'bridge') e.isOut = opts.isOut ?? this.bridgeShouldBeExit(e);
    if (def.kind === 'splitter' && opts.filter !== undefined) e.filter = opts.filter;
    if (opts.recipe && def.recipes.includes(R[opts.recipe]) && this.quota >= R[opts.recipe].unlock) e.recipe = R[opts.recipe];
    this.events.push({ type: 'place', x: e.cx, y: e.cy, a: def.w * def.h });
    return res;
  }

  /** Une nouvelle bouche de pont devient une sortie s'il existe une entrée libre alignée derrière elle. */
  private bridgeShouldBeExit(e: Ent): boolean {
    for (let d = 1; d <= 5; d++) {
      const t = this.entAt(e.x - [1, 0, -1, 0][e.rot] * d, e.y - [0, 1, 0, -1][e.rot] * d);
      if (t && t.def.kind === 'bridge' && t.rot === e.rot) return !t.isOut;
    }
    return false;
  }

  private destroy(e: Ent): void {
    e.dead = true;
    for (let j = 0; j < e.h; j++) for (let i = 0; i < e.w; i++) this.world.setEnt(e.x + i, e.y + j, 0);
    this.ents.delete(e.id);
    const k = e.def.kind;
    if (k !== 'belt' && k !== 'bridge') this.tickers = this.tickers.filter((t) => t !== e);
    this.topoDirty = true; this.version++;
  }

  /** Démolit ce qui se trouve en (x, y). Tout est remboursé, le contenu retourne au stock. */
  remove(x: number, y: number): RemoveInfo | null {
    const e = this.entAt(x, y);
    if (!e) {
      if (this.world.slab(x, y)) {
        if (x >= -3 && x <= 3 && y >= -3 && y <= 3) return null;   // le socle de la Tour reste
        this.world.setSlab(x, y, 0); this.version++;
        this.events.push({ type: 'remove', x: x + 0.5, y: y + 0.5, a: 0 });
        return { key: 'dalle', x, y, rot: 0 };
      }
      return null;
    }
    if (e.def.kind === 'hub') return null;
    for (const [id, n] of e.def.cost) this.stock[id] += n;
    if (e.buf) for (let i = 0; i < NITEMS; i++) this.stock[i] += e.buf[i] + e.out![i];
    if (e.working && e.recipe) for (const [id, n] of e.recipe.inputs) this.stock[id] += n;
    if (e.held >= 0) this.stock[e.held]++;
    const info: RemoveInfo = { key: e.def.key, x: e.x, y: e.y, rot: e.rot, recipe: e.recipe?.key, filter: e.filter, isOut: e.isOut };
    this.destroy(e);
    this.events.push({ type: 'remove', x: e.cx, y: e.cy, a: e.w * e.h });
    return info;
  }

  setRecipe(e: Ent, r: Recipe): void {
    if (!e.def.recipes.includes(r) || e.recipe === r) return;
    if (e.working && e.recipe) for (const [id, n] of e.recipe.inputs) this.stock[id] += n;
    for (let i = 0; i < NITEMS; i++) { this.stock[i] += e.buf![i] + e.out![i]; e.buf![i] = 0; e.out![i] = 0; }
    e.outCount = 0; e.recipe = r; e.working = false; e.progress = 0;
  }

  // =================================================== récolte à la main
  /** Tout ce qui rejoint le stock compte pour le quota, que ce soit par convoyeur ou à la main. */
  private gain(id: number, n: number): void {
    this.stock[id] += n; this.delivered[id] += n; this.made[id] = 1;
    this.stats.prod[id * Stats.WIN + this.stats.cur] += n;
  }

  /** Déraciner l'arbre d'une case. Renvoie le bois obtenu. */
  uproot(x: number, y: number): number {
    if (this.world.canopy(x, y) < 1 || this.world.ent(x, y)) return 0;
    const before = this.stock[I.bois];
    const wood = this.clearTree(x, y, 0);
    this.stock[I.bois] = before;
    this.gain(I.bois, wood);
    this.gathered++;
    return wood;
  }

  /** Un coup de pioche sur un gisement. Renvoie l'objet obtenu, ou -1. */
  handMine(x: number, y: number): number {
    const w = this.world;
    const type = w.deposit(x, y);
    if (!type || this.world.ent(x, y) || !w.takeDeposit(x, y)) return -1;
    const id = DEPOSITS[type]!.item;
    this.gain(id, 1);
    this.gathered++;
    this.emit('hand', x + 0.5, y + 0.5, id);
    return id;
  }

  /** Ramasser un tas de débris. */
  pickLoot(x: number, y: number): boolean {
    if (!this.world.takeLoot(x, y)) return false;
    this.gain(I.fer, LOOT_FER);
    this.gathered++;
    this.emit('pick', x + 0.5, y + 0.5, I.fer);
    return true;
  }

  /** Verser dans une machine, depuis le stock, ce qu'elle accepte. Renvoie la quantité donnée. */
  feed(e: Ent): number {
    if (!e.buf) return 0;
    let given = 0;
    const put = (id: number, max: number) => {
      const n = Math.min(Math.floor(this.stock[id]), max - e.buf![id]);
      if (n > 0) { e.buf![id] += n; this.stock[id] -= n; given += n; }
    };
    if (e.def.kind === 'generator') { for (const id of e.def.fuels) { put(id, 8); if (given) break; } }
    else if (e.def.kind === 'machine' && e.recipe) for (const [id, n] of e.recipe.inputs) put(id, n * 2);
    return given;
  }

  /** Vider les sorties d'une machine ou d'un entrepôt dans le stock. */
  take(e: Ent): number {
    if (!e.out) return 0;
    let n = 0;
    for (let i = 0; i < NITEMS; i++) if (e.out[i] > 0) { this.gain(i, e.out[i]); n += e.out[i]; e.out[i] = 0; }
    e.outCount = 0;
    return n;
  }

  // ========================================================== réception
  /** Une entité accepte-t-elle cet objet arrivant dans la direction dir ? */
  accept(e: Ent, type: number, dir: number): boolean {
    switch (e.def.kind) {
      case 'hub':
        this.stock[type]++; this.delivered[type]++; this.made[type] = 1; e.done++;
        if ((this.tick & 3) === 0) this.emit('deliver', e.cx, e.cy, type);
        return true;
      case 'splitter':
        if (e.held >= 0 || dir !== e.rot) return false;
        e.held = type; return true;
      case 'storage':
        if (e.outCount >= STORE_CAP) return false;
        e.out![type]++; e.outCount++; return true;
      case 'generator':
        if (!e.def.fuels.includes(type) || e.buf![type] >= 8) return false;
        e.buf![type]++; return true;
      case 'machine': {
        const r = e.recipe;
        if (!r) return false;
        for (const [id, n] of r.inputs) {
          if (id === type) { if (e.buf![type] >= n * 2) return false; e.buf![type]++; return true; }
        }
        return false;
      }
      default: return false;
    }
  }

  private emit(type: GameEvent['type'], x: number, y: number, a: number): void {
    if (this.events.length < 300) this.events.push({ type, x, y, a });
  }

  // ======================================================== topologie
  private rebuildTopology(): void {
    this.topoDirty = false;
    rebuildBelts(this);
    const p = this.power;
    p.base = 0; p.solars = []; p.winds = []; p.hydros = []; p.gens = []; p.accus = [];
    for (const e of this.tickers) {
      const k = e.def.kind;
      if (k === 'hub') p.base += e.def.power;
      else if (k === 'solar') p.solars.push(e);
      else if (k === 'wind') p.winds.push(e);
      else if (k === 'hydro') p.hydros.push(e);
      else if (k === 'generator') p.gens.push(e);
      else if (k === 'battery') p.accus.push(e);
    }
  }

  /** Recalcule tout de suite chemins et réseau (après un chargement, par exemple). */
  refresh(): void { if (this.topoDirty) this.rebuildTopology(); }

  // ============================================================== le pas
  step(): void {
    if (this.topoDirty) this.rebuildTopology();
    sunAt(this.tick, this.sun);
    const paths = this.paths;
    for (let i = 0; i < paths.length; i++) paths[i].tick(BELT_SPEED, this);
    const ts = this.tickers;
    for (let i = 0; i < ts.length; i++) this.tickEnt(ts[i]);
    this.tickPower();
    this.tickGrowth();
    if (this.tick % 60 === 0) {
      this.stats.roll(); this.checkQuota();
      this.wind = 0.35 + 0.65 * valueNoise(this.tick / 2400, 0.5, this.seed + 99);
    }
    this.tick++;
  }

  private tickEnt(e: Ent): void {
    switch (e.def.kind) {
      case 'splitter': this.tickSplitter(e); break;
      case 'machine': this.tickMachine(e); break;
      case 'miner': this.tickMiner(e); break;
      case 'sawmill': this.tickSawmill(e); break;
      case 'storage': this.pushOut(e); e.status = e.outCount > 0 ? Status.Working : Status.Idle; break;
      case 'solar': e.light = this.sun.light; e.status = e.light > 0.02 ? Status.Working : Status.Dark; break;
      default: break;
    }
  }

  private tickSplitter(e: Ent): void {
    const type = e.held;
    if (type < 0) return;
    const outs = e.outs;
    if (outs.length < 3) return;
    const filtered = e.def.filter;
    for (let k = 0; k < 3; k++) {
      const idx = (e.rr + k) % 3;
      if (filtered && (type === e.filter) !== (idx === 1)) continue;   // trieur : l'élu va tout droit
      const t = outs[idx];
      const ok = t.path ? t.path.insertAtStart(type) : t.ent ? this.accept(t.ent, type, t.dir) : false;
      if (ok) { e.held = -1; e.rr = (idx + 1) % 3; e.done++; return; }
    }
  }

  /** Pousse un objet du tampon de sortie vers la cible du port. */
  private pushOut(e: Ent): void {
    if (e.outCount === 0) return;
    const t = e.outT;
    if (!t.path && !t.ent) return;
    const out = e.out!;
    for (let k = 0; k < NITEMS; k++) {
      const id = (e.outRR + k) % NITEMS;
      if (out[id] === 0) continue;
      const ok = t.path ? t.path.insertAtStart(id) : this.accept(t.ent!, id, t.dir);
      if (ok) { out[id]--; e.outCount--; e.outRR = (id + 1) % NITEMS; e.pushed = this.tick; }
      return;
    }
  }

  private draw(e: Ent): number { this.power.demand += e.def.power; return this.power.sat; }

  private produce(id: number, n: number): void {
    this.stats.prod[id * Stats.WIN + this.stats.cur] += n;
    this.made[id] = 1;
  }

  private tickMachine(e: Ent): void {
    this.pushOut(e);
    const r = e.recipe;
    if (!r) { e.status = Status.NoRecipe; return; }
    if (!e.working) {
      for (const [id, n] of r.outputs) if (e.out![id] > n) { e.status = Status.Blocked; return; }
      for (const [id, n] of r.inputs) if (e.buf![id] < n) { e.status = Status.NoInput; e.missing = id; return; }
      for (const [id, n] of r.inputs) { e.buf![id] -= n; this.stats.cons[id * Stats.WIN + this.stats.cur] += n; }
      e.working = true; e.progress = 0;
    }
    const sat = this.draw(e);
    e.status = sat < 0.02 ? Status.NoPower : Status.Working;
    e.progress += e.def.speed * sat;
    if (e.progress >= r.time) {
      e.working = false; e.progress = 0; e.done++;
      for (const [id, n] of r.outputs) { e.out![id] += n; e.outCount += n; this.produce(id, n); }
      for (const [gas, n] of r.gasOut) if (gas === 'CO2') this.atmo.co2 += n;
      this.emit('craft', e.cx, e.cy, r.id);
    }
  }

  private tickMiner(e: Ent): void {
    this.pushOut(e);
    if (e.outCount >= 4) { e.status = Status.Blocked; return; }
    const sat = this.draw(e);
    e.status = sat < 0.02 ? Status.NoPower : Status.Working;
    e.progress += sat * e.def.speed;
    if (e.progress < 60) return;
    e.progress = 0;
    const cells = e.cells!, n = cells.length >> 1, w = this.world;
    for (let k = 0; k < n; k++) {
      const idx = (e.ptr + k) % n;
      const x = cells[idx * 2], y = cells[idx * 2 + 1];
      const type = w.deposit(x, y);
      if (type && w.takeDeposit(x, y)) {
        const id = DEPOSITS[type]!.item;
        e.out![id]++; e.outCount++; e.ptr = (idx + 1) % n; e.done++;
        this.produce(id, 1);
        this.emit('mine', e.cx, e.cy, id);
        return;
      }
    }
    e.status = Status.NoResource;
  }

  private tickSawmill(e: Ent): void {
    this.pushOut(e);
    if (e.outCount >= 4) { e.status = Status.Blocked; return; }
    const sat = this.draw(e);
    e.status = sat < 0.02 ? Status.NoPower : Status.Working;
    e.progress += sat;
    if (e.progress < 90) return;
    e.progress = 0;
    // coupe le plus gros arbre à portée
    const w = this.world, R0 = SAW_RANGE, cx = Math.floor(e.cx), cy = Math.floor(e.cy);
    let best = 0, bx = 0, by = 0;
    for (let j = -R0; j <= R0; j++) for (let i = -R0; i <= R0; i++) {
      if (i * i + j * j > R0 * R0 + 2) continue;
      const c = w.canopy(cx + i, cy + j);
      if (c > best) { best = c; bx = cx + i; by = cy + j; }
    }
    if (best < TREE_MIN) { e.status = Status.NoResource; return; }
    const left = best - CANOPY_UNIT;
    w.setCanopy(bx, by, left);
    e.out![I.bois]++; e.outCount++; e.done++;
    e.tx = bx + 0.5; e.ty = by + 0.5;
    this.produce(I.bois, 1);
    this.emit(left < TREE_MIN ? 'fell' : 'cut', bx + 0.5, by + 0.5, best);
  }

  // ============================================================ énergie
  private tickPower(): void {
    const dt = 1 / 60, p = this.power;
    const demand = p.demand;
    p.demand = 0;
    let supply = p.base, capacity = p.base;
    for (const s of p.solars) { const w = s.def.power * s.light; s.flow = w; supply += w; capacity += w; }
    for (const s of p.winds) { const w = s.def.power * this.wind; s.flow = w; s.status = Status.Working; supply += w; capacity += w; }
    for (const s of p.hydros) { s.flow = s.def.power; s.status = Status.Working; supply += s.def.power; capacity += s.def.power; }
    let need = demand - supply;
    for (const g of p.gens) {
      g.flow = 0;
      let fuel = -1;
      for (const id of g.def.fuels) if (g.buf![id] > 0) { fuel = id; break; }
      if (g.energy <= 0 && fuel >= 0 && need > 0) {
        const f = FUEL[fuel];
        g.buf![fuel]--; g.energy += f.energy;
        this.stats.cons[fuel * Stats.WIN + this.stats.cur]++;
        this.atmo.co2 += f.co2;
      }
      const hasFuel = g.energy > 0 || fuel >= 0;
      if (hasFuel) capacity += g.def.power;
      g.status = !hasFuel ? Status.NoInput : need > 0 ? Status.Working : Status.Idle;
      g.missing = g.def.fuels[0];
      if (need > 0 && g.energy > 0) {
        const w = Math.min(g.def.power, need, g.energy / dt);
        g.energy -= w * dt; g.flow = w; need -= w; supply += w;
      }
    }
    let stored = 0;
    for (const a of p.accus) {
      a.flow = 0;
      if (need > 0 && a.energy > 0) {
        const w = Math.min(a.def.power, need, a.energy / dt);
        a.energy -= w * dt; a.flow = w; need -= w; supply += w;
      } else if (need < 0 && a.energy < ACCU_CAP) {
        const w = Math.min(a.def.power, -need, (ACCU_CAP - a.energy) / dt);
        a.energy += w * dt; a.flow = -w; need += w;
      }
      a.status = a.flow !== 0 ? Status.Working : Status.Idle;
      stored += a.energy;
      if (a.energy > 0) capacity += a.def.power;
    }
    p.stored = stored; p.storeMax = p.accus.length * ACCU_CAP;
    p.lastDemand = demand; p.capacity = capacity;
    p.sat = demand > 0 ? Math.min(1, supply / demand) : 1;
  }

  // ============================================================ la jungle
  /** Les arbres repoussent là où ils étaient, le jour, sauf sous les dalles (un bloc toutes les 2 s). */
  private tickGrowth(): void {
    const list = this.world.list;
    const phase = this.tick % 120;
    for (let i = phase; i < list.length; i += 120) this.growChunk(list[i]);
  }

  private growChunk(c: Chunk): void {
    const light = this.sun.light;
    if (light <= 0 || this.atmo.co2 <= 0) return;
    const step = Math.max(1, Math.round(1.6 * light));
    const can = c.canopy, cap = c.cap;
    let dC = 0;
    for (let i = 0; i < CHUNK * CHUNK; i++) {
      const c0 = can[i], top = cap[i];
      if (c0 >= top || c.slab[i] || c.ent[i]) continue;
      if (c0 === 0 && this.nearSlab(c, i)) continue;          // rien ne repousse contre une dalle
      const nv = Math.min(top, c0 + step);
      can[i] = nv; dC += nv - c0;
    }
    if (dC > 0) { c.version++; this.atmo.co2 -= (dC * 6) / CANOPY_UNIT; }
  }

  private nearSlab(c: Chunk, i: number): boolean {
    const x = c.cx * CHUNK + (i & 31), y = c.cy * CHUNK + (i >> 5), w = this.world;
    for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
      const o = w.at(x + k, y + j, false);
      if (o && o.slab[(((y + j) & 31) << 5) | ((x + k) & 31)]) return true;
    }
    return false;
  }

  // ============================================================== quotas
  private checkQuota(): void {
    const q = quotaAt(this.quota);
    for (const [id, n] of q.need) if (this.delivered[id] < n) return;
    this.records.push({ quota: this.quota, ticks: this.tick - this.quotaStart, buildings: this.tickers.length + this.belts.length });
    this.quota++;
    this.quotaStart = this.tick;
    this.delivered.fill(0);
    this.hub.level++;
    this.version++;
    this.events.push({ type: 'quota', x: this.hub.cx, y: this.hub.cy, a: this.quota });
  }

  // ============================================================= bilans
  /** Compte les atomes d'un élément présents dans tout le monde (pour les tests de conservation). */
  ledger(el: string): number {
    let total = 0;
    const perItem = ITEMS.map((it) => it.atoms[el] ?? 0);
    for (let i = 0; i < NITEMS; i++) total += this.stock[i] * perItem[i];
    for (const p of this.paths) for (let i = p.head; i < p.types.length; i++) total += perItem[p.types[i]];
    for (const e of this.tickers) {
      if (e.buf) for (let i = 0; i < NITEMS; i++) total += (e.buf[i] + (e.out ? e.out[i] : 0)) * perItem[i];
      if (e.working && e.recipe) for (const [id, n] of e.recipe.inputs) total += n * perItem[id];
      if (e.held >= 0) total += perItem[e.held];
    }
    for (const c of this.world.list) {
      for (let i = 0; i < CHUNK * CHUNK; i++) {
        if (c.deposit[i]) total += c.amount[i] * perItem[DEPOSITS[c.deposit[i]]!.item];
        if (c.loot[i]) total += LOOT_FER * perItem[I.fer];
        if (el === 'C') total += (c.canopy[i] * 6) / CANOPY_UNIT;
      }
    }
    if (el === 'C') total += this.atmo.co2;
    return total;
  }
}
