// La simulation : déterministe, à pas fixe, sans aucune dépendance au navigateur.
// Trois lois gouvernent tout : conservation (rien ne disparaît), lumière, vivant.

import {
  B, BELT_SPEED, CANOPY_UNIT, DEPOSITS, FUEL, I, ITEMS, NITEMS, R, START_STOCK, UPGRADES,
  quotaAt, type BuildingDef, type Dir, type Recipe,
} from './data';
import { World, GROUND_WATER, CHUNK, SMOKE_RES, type Chunk } from './world';
import { Ent, Status } from './ent';
import { rebuildBelts, type BeltPath } from './belts';
import { sunAt, type Sun } from './sun';
import { hash01, valueNoise } from './rng';

export const ACCU_CAP = 60000;         // J
export const STORE_CAP = 240;
export const SCRUB_RANGE = 8;
export const SCRUB_CAP = 40;
export const SO2_TOX = 3;              // fumée équivalente par unité de SO₂
export const CO2_START = 200000;
export const SEED_RANGE = 6;

/** Le réseau électrique : un seul pour toute l'usine. */
export interface Power {
  demand: number; lastDemand: number; capacity: number; sat: number; stored: number; storeMax: number;
  base: number; solars: Ent[]; winds: Ent[]; hydros: Ent[]; gens: Ent[]; accus: Ent[];
}

export interface GameEvent { type: 'craft' | 'deliver' | 'quota' | 'place' | 'remove' | 'mine' | 'cut'; x: number; y: number; a: number; }
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
  trees: Ent[] = [];
  scrubbers: Ent[] = [];
  paths: BeltPath[] = [];
  topoDirty = true;
  power: Power = { demand: 0, lastDemand: 0, capacity: 0, sat: 1, stored: 0, storeMax: 0, base: 0, solars: [], winds: [], hydros: [], gens: [], accus: [] };
  wind = 0.6;
  stock = new Float64Array(NITEMS);
  quota = 0;
  delivered = new Float64Array(NITEMS);
  made = new Uint8Array(NITEMS);   // objets déjà produits au moins une fois (étapes guidées)
  quotaStart = 0;
  savoir = 0;
  upgrades: Record<string, number> = Object.fromEntries(UPGRADES.map((u) => [u.key, 0]));
  atmo = { co2: CO2_START, emitted: 0, fixed: 0 };
  sun: Sun = sunAt(0);
  bloom = 0;                 // floraison nocturne (0..1)
  jungleHealth = 1;
  stats = new Stats();
  events: GameEvent[] = [];
  records: { quota: number; ticks: number; buildings: number; co2: number }[] = [];
  hub!: Ent;
  loading = false;

  constructor(public seed: number, fresh = true) {
    this.world = new World(seed);
    this.world.onTree = (x, y) => { if (!this.loading) this.spawnTree(x, y); };
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

  /** Coule une dalle : la jungle dessous est défrichée (moitié biomasse, moitié CO₂). */
  private pave(x: number, y: number): void {
    const w = this.world;
    if (w.slab(x, y)) return;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const c = w.canopy(x + i, y + j);
      const keep = i === 0 && j === 0 ? 0 : 70;          // la lisière est éclaircie, pas rasée
      if (c <= keep) continue;
      this.stock[I.biomasse] += (c - keep) / (2 * CANOPY_UNIT);
      this.atmo.co2 += ((c - keep) * 6) / (2 * CANOPY_UNIT);
      w.setCanopy(x + i, y + j, keep);
    }
    w.setSlab(x, y, 1);
  }

  spawn(def: BuildingDef, x: number, y: number, rot: Dir): Ent {
    const swap = (rot & 1) === 1 && def.w !== def.h;
    const w = swap ? def.h : def.w, h = swap ? def.w : def.h;
    const e = new Ent(this.nextId++, def, x, y, rot, w, h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.world.setEnt(x + i, y + j, e.id);
    this.ents.set(e.id, e);
    const k = def.kind;
    if (k === 'belt' || k === 'bridge') this.belts.push(e);
    else if (k === 'tree') this.trees.push(e);
    else {
      this.tickers.push(e);
      if (k !== 'splitter' && k !== 'solar' && k !== 'wind' && k !== 'hydro' && k !== 'battery' && k !== 'hub' && k !== 'deco') {
        e.buf = new Int32Array(NITEMS); e.out = new Int32Array(NITEMS);
      }
      if (def.recipes.length) e.recipe = def.recipes[0];
      if (k === 'scrubber') this.scrubbers.push(e);
      if (k === 'ring') this.trees.push(e);
      if (k === 'miner') {
        e.cells = [];
        for (let j = -1; j <= h; j++) for (let i = -1; i <= w; i++) e.cells.push(x + i, y + j);
      }
    }
    this.topoDirty = true; this.version++;
    return e;
  }

  private spawnTree(x: number, y: number): void {
    const w = this.world;
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
      if (w.ground(x + i, y + j) === GROUND_WATER || w.deposit(x + i, y + j) || w.ent(x + i, y + j) || w.slab(x + i, y + j)) return;
    }
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) w.setCanopy(x + i, y + j, 0);
    this.spawn(B.eventail, x, y, 0);
  }

  footprint(def: BuildingDef, rot: number): [number, number] {
    return (rot & 1) === 1 && def.w !== def.h ? [def.h, def.w] : [def.w, def.h];
  }

  unlocked(def: BuildingDef): boolean { return this.quota >= def.unlock; }
  affordable(def: BuildingDef): boolean { return def.cost.every(([id, n]) => this.stock[id] >= n); }
  count(key: string): number { let n = 0; for (const e of this.tickers) if (e.def.key === key) n++; return n; }

  /** Peut-on poser ce bâtiment ici ? Donne la cause en clair si non (loi : montrer la cause). */
  canPlace(def: BuildingDef, x: number, y: number, rot: number, free = false): PlaceResult {
    const w = this.world;
    const [fw, fh] = this.footprint(def, rot);
    const res: PlaceResult = { ok: false, reason: '' };
    if (def.kind === 'ring') {
      const t = this.entAt(x, y);
      if (!t || t.def.kind !== 'tree' || t.x !== x || t.y !== y) { res.reason = 'Se pose sur un Éventail (grand arbre lumineux)'; return res; }
    }
    for (let j = 0; j < fh; j++) for (let i = 0; i < fw; i++) {
      const cx = x + i, cy = y + j;
      if (w.ground(cx, cy) === GROUND_WATER) { res.reason = 'Impossible sur l’eau'; return res; }
      const o = this.entAt(cx, cy);
      if (o) {
        const sameBelt = def.kind === 'belt' && o.def.kind === 'belt';
        const onTree = def.kind === 'ring' && o.def.kind === 'tree';
        if (!sameBelt && !onTree) { res.reason = o.def.kind === 'tree' ? 'Un Éventail pousse ici' : 'Case occupée'; return res; }
      }
      if (def.kind === 'slab' && w.slab(cx, cy)) { res.reason = 'Déjà dallé'; return res; }
    }
    const touches = (test: (cx: number, cy: number) => boolean): boolean => {
      for (let j = -1; j <= fh; j++) for (let i = -1; i <= fw; i++) if (test(x + i, y + j)) return true;
      return false;
    };
    if (def.kind === 'miner' && !touches((cx, cy) => w.amount(cx, cy) > 0)) { res.reason = 'À poser sur un gisement'; return res; }
    if ((def.kind === 'pump' || def.kind === 'hydro') && !touches((cx, cy) => w.ground(cx, cy) === GROUND_WATER)) { res.reason = 'À poser au bord de l’eau'; return res; }
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
    let tree: Ent | null = null;
    if (def.kind === 'ring') { tree = this.entAt(x, y); if (tree) this.destroy(tree); }
    const e = this.spawn(def, x, y, rot as Dir);
    if (tree) e.health = tree.health;
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
    if (k === 'tree' || k === 'ring') this.trees = this.trees.filter((t) => t !== e);
    if (k !== 'belt' && k !== 'bridge' && k !== 'tree') this.tickers = this.tickers.filter((t) => t !== e);
    if (k === 'scrubber') this.scrubbers = this.scrubbers.filter((t) => t !== e);
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
    if (e.def.kind === 'hub' || e.def.kind === 'tree') return null;
    for (const [id, n] of e.def.cost) this.stock[id] += n;
    if (e.buf) for (let i = 0; i < NITEMS; i++) this.stock[i] += e.buf[i] + e.out![i];
    if (e.working && e.recipe) for (const [id, n] of e.recipe.inputs) this.stock[id] += n;
    if (e.held >= 0) this.stock[e.held]++;
    const info: RemoveInfo = { key: e.def.key, x: e.x, y: e.y, rot: e.rot, recipe: e.recipe?.key, filter: e.filter, isOut: e.isOut };
    this.destroy(e);
    if (e.def.kind === 'ring') { const t = this.spawn(B.eventail, e.x, e.y, 0); t.health = e.health; }
    this.events.push({ type: 'remove', x: e.cx, y: e.cy, a: e.w * e.h });
    return info;
  }

  setRecipe(e: Ent, r: Recipe): void {
    if (!e.def.recipes.includes(r) || e.recipe === r) return;
    if (e.working && e.recipe) for (const [id, n] of e.recipe.inputs) this.stock[id] += n;
    for (let i = 0; i < NITEMS; i++) { this.stock[i] += e.buf![i] + e.out![i]; e.buf![i] = 0; e.out![i] = 0; }
    e.outCount = 0; e.recipe = r; e.working = false; e.progress = 0;
  }

  upgradeMult(key: string): number {
    const u = UPGRADES.find((x) => x.key === key)!;
    return 1 + u.per * (this.upgrades[key] ?? 0);
  }

  buyUpgrade(key: string): boolean {
    if (this.savoir < 1) return false;
    this.savoir--; this.upgrades[key] = (this.upgrades[key] ?? 0) + 1;
    return true;
  }

  // ========================================================== réception
  /** Une entité accepte-t-elle cet objet arrivant dans la direction dir ? */
  accept(e: Ent, type: number, dir: number): boolean {
    switch (e.def.kind) {
      case 'hub':
        this.stock[type]++; this.delivered[type]++; e.done++;
        if ((this.tick & 7) === 0) this.emit('deliver', e.cx, e.cy, type);
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
      case 'seeder':
        if (type !== I.engrais || e.buf![type] >= 8) return false;
        e.buf![type]++; return true;
      case 'machine': case 'scrubber': case 'ring': {
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
    if (this.events.length < 200) this.events.push({ type, x, y, a });
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
    const speed = Math.round(BELT_SPEED * this.upgradeMult('convoyeurs'));
    const paths = this.paths;
    for (let i = 0; i < paths.length; i++) paths[i].tick(speed, this);
    const ts = this.tickers;
    for (let i = 0; i < ts.length; i++) this.tickEnt(ts[i]);
    this.tickPower();
    this.tickEcology();
    if (this.tick % 30 === 0) this.tickSmoke();
    if (this.tick % 60 === 0) {
      this.stats.roll(); this.checkQuota(); this.tickHealth();
      this.wind = 0.35 + 0.65 * valueNoise(this.tick / 2400, 0.5, this.seed + 99);
    }
    this.tick++;
  }

  private tickEnt(e: Ent): void {
    switch (e.def.kind) {
      case 'splitter': this.tickSplitter(e); break;
      case 'machine': case 'scrubber': case 'ring': this.tickMachine(e); break;
      case 'miner': this.tickMiner(e); break;
      case 'sawmill': this.tickSawmill(e); break;
      case 'pump': this.tickPump(e); break;
      case 'storage': this.pushOut(e); e.status = e.outCount > 0 ? Status.Working : Status.Idle; break;
      case 'seeder': this.tickSeeder(e); break;
      case 'solar': if ((this.tick + e.id) % 20 === 0) this.updateLight(e); break;
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
      if (ok) { e.held = -1; e.rr = (idx + 1) % 3; return; }
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
      if (ok) { out[id]--; e.outCount--; e.outRR = (id + 1) % NITEMS; }
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
      if (e.def.kind === 'scrubber' && e.gas < 2) { e.status = Status.NoGas; return; }
      for (const [id, n] of r.inputs) { e.buf![id] -= n; this.stats.cons[id * Stats.WIN + this.stats.cur] += n; }
      if (e.def.kind === 'scrubber') e.gas -= 2;
      for (const [gas, n] of r.gasIn) if (gas === 'CO2') { this.atmo.co2 -= n; this.atmo.fixed += n; }
      e.working = true; e.progress = 0;
    }
    const cat = e.def.cat;
    let rate = e.def.speed * (cat === 'fonte' ? this.upgradeMult('fours') : cat === 'assemblage' || cat === 'chimie' ? this.upgradeMult('ateliers') : 1);
    if (r.light) {
      // le vivant travaille à la lumière — l'Éventail, les nuits de floraison, deux fois mieux
      const light = e.def.kind === 'ring' ? e.health * Math.max(this.sun.light, 2 * this.bloom) : this.sun.light;
      if (light <= 0.01) { e.status = Status.Dark; return; }
      rate *= light;
    }
    const sat = this.draw(e);
    e.status = sat < 0.02 ? Status.NoPower : Status.Working;
    e.progress += rate * sat;
    if (e.progress >= r.time) {
      e.working = false; e.progress = 0; e.done++;
      for (const [id, n] of r.outputs) { e.out![id] += n; e.outCount += n; this.produce(id, n); }
      this.release(r.gasOut, r.smoke, e.cx, e.cy);
      this.emit('craft', e.cx, e.cy, r.id);
    }
  }

  /** Rejets gazeux : CO₂ vers l'atmosphère, SO₂ vers un épurateur proche ou, à défaut, la fumée. */
  private release(gases: [string, number][], smoke: number, x: number, y: number): void {
    for (const [gas, n] of gases) {
      if (gas === 'CO2') { this.atmo.co2 += n; this.atmo.emitted += n; }
      else if (gas === 'SO2') {
        let left = n;
        for (const s of this.scrubbers) {
          if (left <= 0) break;
          if (Math.abs(s.cx - x) > SCRUB_RANGE || Math.abs(s.cy - y) > SCRUB_RANGE) continue;
          const take = Math.min(left, SCRUB_CAP - s.gas);
          if (take > 0) { s.gas += take; left -= take; }
        }
        smoke += left * SO2_TOX;
      }
    }
    if (smoke > 0) this.world.addSmoke(Math.floor(x), Math.floor(y), smoke);
  }

  private tickMiner(e: Ent): void {
    this.pushOut(e);
    if (e.outCount >= 4) { e.status = Status.Blocked; return; }
    const sat = this.draw(e);
    e.status = sat < 0.02 ? Status.NoPower : Status.Working;
    e.progress += sat * e.def.speed * this.upgradeMult('extraction');
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
    e.progress += sat * this.upgradeMult('extraction');
    if (e.progress < 90) return;
    e.progress = 0;
    // coupe la case la plus dense à portée
    const w = this.world, R0 = 5, cx = Math.floor(e.cx), cy = Math.floor(e.cy);
    let best = 0, bx = 0, by = 0;
    for (let j = -R0; j <= R0; j++) for (let i = -R0; i <= R0; i++) {
      if (i * i + j * j > R0 * R0 + 2) continue;
      const c = w.canopy(cx + i, cy + j);
      if (c > best) { best = c; bx = cx + i; by = cy + j; }
    }
    if (best < 2 * CANOPY_UNIT) { e.status = Status.NoResource; return; }
    w.setCanopy(bx, by, best - CANOPY_UNIT);
    e.out![I.biomasse]++; e.outCount++; e.done++;
    this.produce(I.biomasse, 1);
    this.emit('cut', bx + 0.5, by + 0.5, I.biomasse);
  }

  private tickPump(e: Ent): void {
    this.pushOut(e);
    if (e.outCount >= 4) { e.status = Status.Blocked; return; }
    const sat = this.draw(e);
    e.status = sat < 0.02 ? Status.NoPower : Status.Working;
    e.progress += sat * this.upgradeMult('extraction');
    if (e.progress < 30) return;
    e.progress = 0;
    e.out![I.eau]++; e.outCount++; e.done++;
    this.produce(I.eau, 1);
  }

  /** Le Semeur rend l'engrais à la jungle : la canopée la plus pauvre alentour reprend d'un coup. */
  private tickSeeder(e: Ent): void {
    if (e.buf![I.engrais] < 1) { e.status = Status.NoInput; e.missing = I.engrais; return; }
    const sat = this.draw(e);
    e.status = sat < 0.02 ? Status.NoPower : Status.Working;
    e.progress += sat;
    if (e.progress < 120) return;
    e.progress = 0; e.buf![I.engrais]--; e.done++;
    this.stats.cons[I.engrais * Stats.WIN + this.stats.cur]++;
    const w = this.world, cx = Math.floor(e.cx), cy = Math.floor(e.cy);
    let grown = 0;
    for (let k = 0; k < 14; k++) {
      const x = cx + Math.floor((hash01(k, this.tick, this.seed) - 0.5) * 2 * SEED_RANGE);
      const y = cy + Math.floor((hash01(this.tick, k, this.seed + 1) - 0.5) * 2 * SEED_RANGE);
      if (w.ground(x, y) === GROUND_WATER || w.slab(x, y) || w.ent(x, y) || w.deposit(x, y)) continue;
      const c = w.canopy(x, y);
      if (c > 215) continue;
      w.setCanopy(x, y, c + 40); grown += 40;
    }
    const carbon = (grown * 6) / CANOPY_UNIT;
    this.atmo.co2 -= carbon; this.atmo.fixed += carbon;
  }

  /** Un héliostat est-il à l'ombre ? On remonte le rayon vers le soleil. */
  shadowed(x: number, y: number): boolean {
    const s = this.sun;
    if (!s.day) return true;
    const maxD = Math.ceil((this.hub ? this.hub.height : 4) * s.shadow) + 1;
    for (let d = 1; d <= maxD; d++) {
      const e = this.entAt(Math.floor(x + 0.5 + s.sx * d), Math.floor(y + 0.5 + s.sy * d));
      if (e && e.height > 0.4 && e.height * s.shadow >= d - 0.5) return true;
    }
    return false;
  }

  private updateLight(e: Ent): void {
    const s = this.sun;
    if (!s.day) { e.light = 0; e.status = Status.Dark; return; }
    const sm = this.world.smokeAt(e.x, e.y);
    e.light = this.shadowed(e.x, e.y) ? 0 : s.light / (1 + sm / 6);
    e.status = e.light > 0.02 ? Status.Working : Status.Dark;
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
        if (f.co2) { this.atmo.co2 += f.co2; this.atmo.emitted += f.co2; }
        if (f.smoke) this.world.addSmoke(Math.floor(g.cx), Math.floor(g.cy), f.smoke);
        this.emit('craft', g.cx, g.cy, 0);
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

  // ============================================================ le vivant
  /** Croissance logistique de la canopée, bloc par bloc (un bloc toutes les 2 s, étalés). */
  private tickEcology(): void {
    const list = this.world.list;
    const phase = this.tick % 120;
    for (let i = phase; i < list.length; i += 120) this.growChunk(list[i]);
  }

  private growChunk(c: Chunk): void {
    const w = this.world;
    const light = this.sun.light;
    const co2 = Math.max(0, this.atmo.co2);
    const vigor = (2 * co2) / (co2 + CO2_START);          // fertilisation par le CO₂ (saturante)
    const k = 2 * light * vigor * 255;                     // dt = 2 s
    const RATE = 0.0026, SPREAD = 0.0035;
    const can = c.canopy;
    let dC = 0, changed = false;
    const bx = c.cx * CHUNK, by = c.cy * CHUNK;
    for (let ly = 0; ly < CHUNK; ly++) {
      for (let lx = 0; lx < CHUNK; lx++) {
        const i = (ly << 5) | lx;
        if (c.ground[i] === GROUND_WATER || c.slab[i] || c.ent[i]) continue;
        const c0 = can[i];
        const smoke = c.smoke[((ly >> 2) << 3) | (lx >> 2)];
        if (light <= 0 && smoke <= 2) continue;
        const l = lx > 0 ? can[i - 1] : w.at(bx - 1, by + ly, false)?.canopy[(ly << 5) | 31] ?? c0;
        const r = lx < 31 ? can[i + 1] : w.at(bx + 32, by + ly, false)?.canopy[ly << 5] ?? c0;
        const u = ly > 0 ? can[i - 32] : w.at(bx + lx, by - 1, false)?.canopy[(31 << 5) | lx] ?? c0;
        const d = ly < 31 ? can[i + 32] : w.at(bx + lx, by + 32, false)?.canopy[lx] ?? c0;
        const cn = c0 / 255, nb = (l + r + u + d) / 1020;
        let delta = (RATE * cn * (1 - cn) + SPREAD * Math.max(0, nb - cn) * (1 - cn)) * k;
        if (smoke > 2) delta -= Math.min(c0, 0.03 * (smoke - 2) * c0 + 1);   // la fumée tue
        let fl = Math.floor(delta);
        if (hash01(bx + lx + this.tick, by + ly, this.seed) < delta - fl) fl++;
        if (fl === 0) continue;
        const cap = c.deposit[i] ? 40 : 255;
        const nv = Math.max(0, Math.min(cap, c0 + fl));
        if (nv !== c0) { can[i] = nv; dC += nv - c0; changed = true; }
      }
    }
    if (changed) {
      c.version++;
      const carbon = (dC * 6) / CANOPY_UNIT;
      this.atmo.co2 -= carbon;
      if (carbon > 0) this.atmo.fixed += carbon;
    }
  }

  /** La fumée diffuse et retombe. */
  private tickSmoke(): void {
    const w = this.world;
    const N = SMOKE_RES;
    for (const c of w.list) {
      const s = c.smoke;
      const L = w.chunk(c.cx - 1, c.cy, false), Rr = w.chunk(c.cx + 1, c.cy, false);
      const U = w.chunk(c.cx, c.cy - 1, false), D = w.chunk(c.cx, c.cy + 1, false);
      if (c.smokeSum < 0.05 && !((L && L.smokeSum > 1) || (Rr && Rr.smokeSum > 1) || (U && U.smokeSum > 1) || (D && D.smokeSum > 1))) continue;
      const tmp = (c.next ??= new Float32Array(N * N));
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const i = y * N + x;
        const l = x > 0 ? s[i - 1] : L ? L.smoke[y * N + N - 1] : 0;
        const r = x < N - 1 ? s[i + 1] : Rr ? Rr.smoke[y * N] : 0;
        const u = y > 0 ? s[i - N] : U ? U.smoke[(N - 1) * N + x] : 0;
        const d = y < N - 1 ? s[i + N] : D ? D.smoke[x] : 0;
        tmp[i] = (s[i] + 0.12 * (l + r + u + d - 4 * s[i])) * 0.985;
      }
      c.pending = true;
    }
    for (const c of w.list) {
      if (!c.pending) continue;
      c.pending = false;
      c.smoke.set(c.next!);
      let sum = 0;
      for (let i = 0; i < N * N; i++) sum += c.smoke[i];
      c.smokeSum = sum;
    }
  }

  /** Santé des Éventails : densité de canopée alentour, moins la fumée. Décide aussi de la floraison. */
  private tickHealth(): void {
    const w = this.world;
    const n = this.trees.length;
    if (n > 0) {
      const t = this.trees[(this.tick / 60) % n | 0];
      let sum = 0, cnt = 0;
      const cx = Math.floor(t.cx), cy = Math.floor(t.cy);
      for (let j = -7; j <= 7; j += 2) for (let i = -7; i <= 7; i += 2) {
        if (Math.abs(i) <= 1 && Math.abs(j) <= 1) continue;
        const ch = w.at(cx + i, cy + j, false);
        if (!ch) continue;
        sum += ch.canopy[(((cy + j) & 31) << 5) | ((cx + i) & 31)]; cnt++;
      }
      const dens = cnt ? sum / cnt / 255 : 1;
      const smoke = w.smokeAt(cx, cy);
      t.health = Math.max(0, Math.min(1, (dens - 0.2) / 0.45)) * (1 / (1 + smoke / 3));
      let hs = 0;
      for (const tr of this.trees) hs += tr.health;
      this.jungleHealth = hs / n;
    }
    // floraison : les nuits où la jungle va bien, elle s'illumine — et les Éventails cerclés donnent encore
    const s = this.sun;
    const target = !s.day && this.jungleHealth > 0.7 ? Math.sin(Math.PI * ((s.t - 0.65) / 0.35)) : 0;
    this.bloom += (Math.max(0, target) - this.bloom) * 0.2;
    if (this.bloom < 0.01) this.bloom = 0;
  }

  // ============================================================== quotas
  private checkQuota(): void {
    const q = quotaAt(this.quota);
    for (const [id, n] of q.need) if (this.delivered[id] < n) return;
    this.records.push({ quota: this.quota, ticks: this.tick - this.quotaStart, buildings: this.tickers.length + this.belts.length, co2: Math.round(this.atmo.emitted) });
    this.quota++;
    this.quotaStart = this.tick;
    this.delivered.fill(0);
    this.hub.level++;
    this.savoir++;
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
      if (e.working && e.recipe) {
        for (const [id, n] of e.recipe.inputs) total += n * perItem[id];
        if (el === 'C') for (const [gas, n] of e.recipe.gasIn) if (gas === 'CO2') total += n;
        if (el === 'S' && e.def.kind === 'scrubber') total += 2;
      }
      if (e.held >= 0) total += perItem[e.held];
      if (el === 'S') total += e.gas;
    }
    for (const c of this.world.list) {
      for (let i = 0; i < CHUNK * CHUNK; i++) {
        if (c.deposit[i]) total += c.amount[i] * perItem[DEPOSITS[c.deposit[i]]!.item];
        if (el === 'C') total += (c.canopy[i] * 6) / CANOPY_UNIT;
      }
    }
    if (el === 'C') total += this.atmo.co2;
    return total;
  }

  ppm(): number { return (this.atmo.co2 / CO2_START) * 420; }
}
