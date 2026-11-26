// La simulation : déterministe, à pas fixe, sans aucune dépendance au navigateur.
// Le brut de l'automatisation : extraire, transporter, transformer, livrer. Rien ne disparaît.

import {
  B, CANOPY_UNIT, DEPOSITS, ERAS, ERA_POWER, ERA_SPEED, FUEL, I, ITEMS, LOOT_WOOD, MAX_VERSION, NITEMS, R, QUOTAS, TREE_MIN,
  costOf, quotaAt, type BuildingDef, type Dir, type Recipe,
} from './data';
import { World, GROUND_WATER, GROUND_BANK, CHUNK, type Chunk } from './world';
import { Ent, Status } from './ent';
import { rebuildBelts, type BeltPath } from './belts';
import { sunAt, type Sun } from './sun';
import { valueNoise } from './rng';
import { Fauna, TRAP_OUT_MAX, TRAP_TICKS, type Beast, type TrapBait } from './fauna';

export const STORE_CAP = 240;
export const SAW_RANGE = 5;

/** Le réseau électrique : un seul pour toute l'usine. */
export interface Power {
  demand: number; lastDemand: number; capacity: number; sat: number;
  base: number; hydros: Ent[]; gens: Ent[];
}

export interface GameEvent {
  type: 'craft' | 'deliver' | 'quota' | 'place' | 'remove' | 'mine' | 'cut' | 'fell' | 'pick' | 'hand' | 'upgrade'
    | 'strike' | 'kill' | 'catch';
  x: number; y: number; a: number;
}
export interface PlaceResult { ok: boolean; reason: string; }
export interface PlaceOpts { recipe?: string; filter?: number; isOut?: boolean; free?: boolean; }
export interface RemoveInfo { key: string; x: number; y: number; rot: number; recipe?: string; filter?: number; isOut?: boolean; }

/** Ce qui a une direction : une sortie (machines, puits, argilière, entrepôt), un sens (convoyeur, répartiteur). */
export function rotatable(def: BuildingDef): boolean {
  const k = def.kind;
  return k === 'machine' || k === 'miner' || k === 'sawmill' || k === 'clay' || k === 'trap' || k === 'storage' || k === 'splitter' || k === 'belt';
}

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
  power: Power = { demand: 0, lastDemand: 0, capacity: 0, sat: 1, base: 0, hydros: [], gens: [] };
  wind = 0.6;
  stock = new Float64Array(NITEMS);
  quota = 0;                 // nombre de livraisons accomplies
  delivered = new Float64Array(NITEMS);
  made = new Uint8Array(NITEMS);   // objets déjà obtenus au moins une fois (étapes guidées, Atlas)
  gathered = 0;                    // gestes de récolte à la main (étapes guidées)
  quotaStart = 0;
  sun: Sun = sunAt(0);
  fauna: Fauna;
  stats = new Stats();
  events: GameEvent[] = [];
  records: { quota: number; ticks: number; buildings: number }[] = [];
  hub!: Ent;
  loading = false;

  constructor(public seed: number, fresh = true) {
    this.world = new World(seed);
    this.fauna = new Fauna(seed);
    if (fresh) this.init();
  }

  /** L'ère en cours : une ère dure trois livraisons. */
  get era(): number { return 1 + Math.floor(Math.min(this.quota, QUOTAS.length) / 3); }

  private init(): void {
    this.world.ensureArea(-48, -48, 48, 48);
    for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) this.pave(x, y, 1);
    this.hub = this.spawn(B.tour, -1, -1, 3 as Dir);
    this.fauna.init(this.world);
  }

  // ================================================================ faune
  /** Les bêtes vivantes, en lecture seule. */
  get beasts(): readonly Beast[] { return this.fauna.beasts; }

  /** La bête la plus proche du point à moins de `r` cases, ou null. */
  beastAt(x: number, y: number, r: number): Beast | null { return this.fauna.beastAt(x, y, r); }

  /** Les Pièges posés, tels que la faune les voit pour suivre l'appât. */
  private trapBaits(): TrapBait[] {
    const out: TrapBait[] = [];
    for (const e of this.tickers) if (e.def.kind === 'trap') out.push({ x: e.x, y: e.y, w: e.w, h: e.h });
    return out;
  }

  /** Un coup de poing sur une bête : elle perd 1 point de vie, et la matière entre au stock si elle tombe. */
  strikeBeast(id: number): { ok: boolean; reason: string; killed: boolean } {
    const b = this.fauna.beasts.find((q) => q.id === id);
    if (!b) return { ok: false, reason: 'Plus de bête ici', killed: false };
    b.hp--;
    b.state = 'graze';
    b.timer = 60;
    b.struck = this.tick;
    this.emit('strike', b.x, b.y, b.hp);
    if (b.hp > 0) return { ok: true, reason: '', killed: false };
    const x = b.x, y = b.y;
    this.fauna.remove(b);
    this.gain(I.peau, 1);
    this.gain(I.graisse, 1);
    this.gain(I.os, 1);
    this.gathered++;
    this.emit('kill', x, y, id);
    return { ok: true, reason: '', killed: true };
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

  /** Coule une dalle de cette ère : l'arbre dessous et ceux qui la touchent sont arrachés. */
  private pave(x: number, y: number, era: number): void {
    const w = this.world;
    if (w.slab(x, y)) return;
    if (w.takeLoot(x, y)) this.stock[I.bois] += LOOT_WOOD;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) this.clearTree(x + i, y + j, 0);   // une case de lisière dégagée
    w.setSlab(x, y, era);
  }

  spawn(def: BuildingDef, x: number, y: number, rot: Dir, era = def.era): Ent {
    const swap = (rot & 1) === 1 && def.w !== def.h;
    const w = swap ? def.h : def.w, h = swap ? def.w : def.h;
    const e = new Ent(this.nextId++, def, x, y, rot, w, h);
    e.era = era;
    e.born = this.tick;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.world.setEnt(x + i, y + j, e.id);
    this.ents.set(e.id, e);
    const k = def.kind;
    if (k === 'belt' || k === 'bridge') this.belts.push(e);
    else {
      this.tickers.push(e);
      if (k === 'machine' || k === 'miner' || k === 'sawmill' || k === 'clay' || k === 'trap' || k === 'storage' || k === 'generator') {
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
  affordable(def: BuildingDef): boolean { return this.anyVersionPayable(def); }
  count(key: string): number { let n = 0; for (const e of this.tickers) if (e.def.key === key) n++; return n; }

  /** Au moins une version entre l'ère d'apparition et l'ère en cours est-elle payable ? */
  private anyVersionPayable(def: BuildingDef): boolean {
    const top = Math.min(Math.max(def.era, this.era), MAX_VERSION);
    for (let v = def.era; v <= top; v++) {
      if (costOf(def, v).every(([id, n]) => this.stock[id] >= n)) return true;
    }
    return false;
  }

  /** La version d'un bâtiment neuf : la plus récente payable, ou la plus grande si la pose est gratuite. */
  versionFor(def: BuildingDef, free = false): number {
    const top = Math.min(Math.max(def.era, this.era), MAX_VERSION);
    if (free) return top;
    for (let v = top; v >= def.era; v--) {
      if (costOf(def, v).every(([id, n]) => this.stock[id] >= n)) return v;
    }
    return def.era;
  }

  /** Peut-on poser ce bâtiment ici ? Donne la cause en clair si non. */
  canPlace(def: BuildingDef, x: number, y: number, rot: number, free = false): PlaceResult {
    const w = this.world;
    const [fw, fh] = this.footprint(def, rot);
    const res: PlaceResult = { ok: false, reason: '' };
    let ore = false, deadOre = false, shore = false, bank = false;
    for (let j = 0; j < fh; j++) for (let i = 0; i < fw; i++) {
      const cx = x + i, cy = y + j;
      if (w.ground(cx, cy) === GROUND_WATER) { res.reason = 'Impossible sur l’eau'; return res; }
      const o = this.entAt(cx, cy);
      if (o && !(def.kind === 'belt' && o.def.kind === 'belt')) { res.reason = 'Case occupée'; return res; }
      if (def.kind === 'slab' && w.slab(cx, cy)) { res.reason = 'Déjà dallé'; return res; }
      const type = w.deposit(cx, cy);
      if (type && w.amount(cx, cy) > 0) {
        const d = DEPOSITS[type];
        if (d && d.item >= 0) ore = true;
        else deadOre = true;
      }
      if (w.ground(cx, cy) === GROUND_BANK) bank = true;
    }
    for (let j = -1; j <= fh && !shore; j++) for (let i = -1; i <= fw; i++) if (w.ground(x + i, y + j) === GROUND_WATER) { shore = true; break; }
    if (def.kind === 'miner' && !ore) { res.reason = deadOre ? 'Ce gisement ne s’exploite pas encore' : 'À poser sur un gisement (rochers colorés)'; return res; }
    if (def.kind === 'clay' && !bank) { res.reason = 'À poser sur la berge (la terre humide au bord de l’eau)'; return res; }
    if (def.kind === 'hydro' && !shore) { res.reason = 'À poser au bord de l’eau'; return res; }
    if (!free) {
      if (!this.unlocked(def)) { res.reason = 'Pas encore débloqué'; return res; }
      if (!this.anyVersionPayable(def)) {
        for (const [id, n] of def.cost) {
          if (this.stock[id] < n) { res.reason = `Il manque ${ITEMS[id].name} (${Math.floor(this.stock[id])}/${n})`; return res; }
        }
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
    const v = this.versionFor(def, opts.free);
    if (!opts.free) for (const [id, n] of costOf(def, v)) this.stock[id] -= n;
    const slabEra = def.kind === 'slab' ? v : 1;      // seule une Dalle posée prend son ère ; le reste est offert en Bois
    for (let j = 0; j < fh; j++) for (let i = 0; i < fw; i++) this.pave(x + i, y + j, slabEra);
    this.topoDirty = true; this.version++;
    if (def.kind === 'slab') { this.events.push({ type: 'place', x: x + 0.5, y: y + 0.5, a: 0 }); return res; }
    const e = this.spawn(def, x, y, rot as Dir, v);
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
      const era = this.world.slab(x, y);
      if (era) {
        if (x >= -3 && x <= 3 && y >= -3 && y <= 3) return null;   // le socle de la Tour reste
        this.world.setSlab(x, y, 0); this.version++;
        for (const [id, n] of costOf(B.dalle, era)) this.stock[id] += n;
        this.events.push({ type: 'remove', x: x + 0.5, y: y + 0.5, a: 0 });
        return { key: 'dalle', x, y, rot: 0 };
      }
      return null;
    }
    if (e.def.kind === 'hub') return null;
    for (const [id, n] of costOf(e.def, e.era)) this.stock[id] += n;
    if (e.buf) for (let i = 0; i < NITEMS; i++) this.stock[i] += e.buf[i] + e.out![i];
    if (e.working && e.recipe) for (const [id, n] of e.recipe.inputs) this.stock[id] += n;
    if (e.held >= 0) this.stock[e.held]++;
    const info: RemoveInfo = { key: e.def.key, x: e.x, y: e.y, rot: e.rot, recipe: e.recipe?.key, filter: e.filter, isOut: e.isOut };
    this.destroy(e);
    this.events.push({ type: 'remove', x: e.cx, y: e.cy, a: e.w * e.h });
    return info;
  }

  /**
   * Fait pivoter sur place le bâtiment posé en (x, y) : d'un quart de tour, ou jusqu'à `to`. Gratuit.
   * Le coin nord-ouest reste fixe ; un bâtiment non carré doit avoir la place de se tourner.
   */
  rotate(x: number, y: number, to?: Dir): PlaceResult & { from: Dir } {
    const e = this.entAt(x, y);
    const res = { ok: false, reason: '', from: (e?.rot ?? 0) as Dir };
    if (!e) { res.reason = 'Rien à pivoter ici'; return res; }
    if (!rotatable(e.def)) {
      res.reason = e.def.kind === 'hub' ? 'La Tour ne pivote pas'
        : e.def.kind === 'bridge' ? 'Un pont ne pivote pas : démolis-le et repose-le'
        : `${e.def.name} n’a pas de sortie à orienter`;
      return res;
    }
    const rot = (to ?? ((e.rot + 1) & 3)) as Dir;
    if (rot === e.rot) { res.ok = true; return res; }
    const [fw, fh] = this.footprint(e.def, rot);
    const w = this.world;
    for (let j = 0; j < fh; j++) for (let i = 0; i < fw; i++) {
      const cx = e.x + i, cy = e.y + j;
      const o = w.ent(cx, cy);
      if (o === e.id) continue;
      if (o) { res.reason = 'Pas la place pour pivoter'; return res; }
      if (w.ground(cx, cy) === GROUND_WATER) { res.reason = 'Impossible sur l’eau'; return res; }
    }
    for (let j = 0; j < e.h; j++) for (let i = 0; i < e.w; i++) w.setEnt(e.x + i, e.y + j, 0);
    e.rot = rot; e.w = fw; e.h = fh;
    for (let j = 0; j < fh; j++) for (let i = 0; i < fw; i++) { this.pave(e.x + i, e.y + j, 1); w.setEnt(e.x + i, e.y + j, e.id); }
    if (e.cells) { e.cells = []; for (let j = 0; j < fh; j++) for (let i = 0; i < fw; i++) e.cells.push(e.x + i, e.y + j); }
    this.topoDirty = true; this.version++;
    this.events.push({ type: 'place', x: e.cx, y: e.cy, a: 1 });
    res.ok = true;
    return res;
  }

  /** Ce que ferait le marteau sur cette case, sans rien changer : refus en clair, ou le prix et la version visée. */
  checkUpgrade(x: number, y: number): PlaceResult & { from: number; to: number; cost: [number, number][] } {
    const to = Math.min(this.era, MAX_VERSION);
    const e = this.entAt(x, y);
    if (e) {
      const res = { ok: false, reason: '', from: e.era, to, cost: [] as [number, number][] };
      if (e.def.kind === 'hub') {
        res.reason = 'La Tour se refait par ses livraisons';
        return res;
      }
      if (e.era >= to) {
        res.reason = `Déjà à l’ère ${ERAS[e.era - 1].name}`;
        return res;
      }
      const cost = costOf(e.def, to);
      for (const [id, n] of cost) {
        if (this.stock[id] < n) {
          res.reason = `Il manque ${ITEMS[id].name} (${Math.floor(this.stock[id])}/${n})`;
          return res;
        }
      }
      res.ok = true;
      res.cost = cost;
      return res;
    }
    const v = this.world.slab(x, y);
    const res = { ok: false, reason: '', from: v, to, cost: [] as [number, number][] };
    if (!v) {
      res.reason = 'Rien à améliorer ici';
      return res;
    }
    if (v >= to) {
      res.reason = `Déjà à l’ère ${ERAS[v - 1].name}`;
      return res;
    }
    const cost = costOf(B.dalle, to);
    for (const [id, n] of cost) {
      if (this.stock[id] < n) {
        res.reason = `Il manque ${ITEMS[id].name} (${Math.floor(this.stock[id])}/${n})`;
        return res;
      }
    }
    res.ok = true;
    res.cost = cost;
    return res;
  }

  /** Refait au marteau le bâtiment ou la dalle de la case dans la version de l'ère en cours. La cause en clair si non. */
  upgrade(x: number, y: number): PlaceResult & { from: number; to: number } {
    const res = this.checkUpgrade(x, y);
    if (!res.ok) return res;
    const to = res.to;
    const e = this.entAt(x, y);
    if (e) {
      for (const [id, n] of costOf(e.def, to)) this.stock[id] -= n;
      for (const [id, n] of costOf(e.def, res.from)) this.stock[id] += n;
      e.era = to;
      e.upgraded = this.tick;
      this.topoDirty = true;
      this.version++;
      this.events.push({ type: 'upgrade', x: e.cx, y: e.cy, a: to });
      return res;
    }
    for (const [id, n] of costOf(B.dalle, to)) this.stock[id] -= n;
    for (const [id, n] of costOf(B.dalle, res.from)) this.stock[id] += n;
    this.world.setSlab(x, y, to);
    this.version++;
    this.events.push({ type: 'upgrade', x: x + 0.5, y: y + 0.5, a: to });
    return res;
  }

  setRecipe(e: Ent, r: Recipe): void {
    if (!e.def.recipes.includes(r) || e.recipe === r) return;
    if (e.working && e.recipe) for (const [id, n] of e.recipe.inputs) this.stock[id] += n;
    for (let i = 0; i < NITEMS; i++) { this.stock[i] += e.buf![i] + e.out![i]; e.buf![i] = 0; e.out![i] = 0; }
    e.outCount = 0; e.recipe = r; e.working = false; e.progress = 0;
  }

  // =================================================== récolte à la main
  /** Tout gain rejoint le stock ; seule l'entrée dans la Tour compte pour la livraison. */
  private gain(id: number, n: number): void {
    this.stock[id] += n; this.made[id] = 1;
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
    if (!type || this.world.ent(x, y)) return -1;
    const d = DEPOSITS[type];
    if (!d || d.item < 0) return -1;
    if (!w.takeDeposit(x, y)) return -1;
    this.gain(d.item, 1);
    this.gathered++;
    this.emit('hand', x + 0.5, y + 0.5, d.item);
    return d.item;
  }

  /** Ramasser un tas de débris. */
  pickLoot(x: number, y: number): boolean {
    if (!this.world.takeLoot(x, y)) return false;
    this.gain(I.bois, LOOT_WOOD);
    this.gathered++;
    this.emit('pick', x + 0.5, y + 0.5, I.bois);
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

  /** Cette entité prendrait-elle un objet arrivant dans la direction dir ? Mêmes règles que `accept`, sans effet. */
  takesFrom(e: Ent, dir: number): boolean {
    switch (e.def.kind) {
      case 'hub': case 'storage': case 'generator': return true;
      case 'splitter': return dir === e.rot;
      case 'machine': return e.recipe !== null;
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
    p.base = 0; p.hydros = []; p.gens = [];
    for (const e of this.tickers) {
      const k = e.def.kind;
      if (k === 'hub') p.base += e.def.power;
      else if (k === 'hydro') p.hydros.push(e);
      else if (k === 'generator') p.gens.push(e);
    }
  }

  /** Recalcule tout de suite chemins et réseau (après un chargement, par exemple). */
  refresh(): void { if (this.topoDirty) this.rebuildTopology(); }

  // ============================================================== le pas
  step(): void {
    if (this.topoDirty) this.rebuildTopology();
    sunAt(this.tick, this.sun);
    const paths = this.paths;
    for (let i = 0; i < paths.length; i++) paths[i].tick(paths[i].speed, this);
    const ts = this.tickers;
    for (let i = 0; i < ts.length; i++) this.tickEnt(ts[i]);
    this.tickPower();
    this.tickGrowth();
    this.fauna.step(this.world, this.trapBaits());
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
      case 'clay': this.tickClay(e); break;
      case 'trap': this.tickTrap(e); break;
      case 'sawmill': this.tickSawmill(e); break;
      case 'storage': this.pushOut(e); e.status = e.outCount > 0 ? Status.Working : Status.Idle; break;
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

  private draw(e: Ent): number { this.power.demand += e.def.power * ERA_POWER[e.era - 1]; return this.power.sat; }

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
    const sat = e.def.heat ? 1 : this.draw(e);
    e.status = e.def.heat || sat >= 0.02 ? Status.Working : Status.NoPower;
    e.progress += sat * ERA_SPEED[e.era - 1];
    if (e.progress >= r.time) {
      e.working = false; e.progress = 0; e.done++;
      for (const [id, n] of r.outputs) { e.out![id] += n; e.outCount += n; this.produce(id, n); }
      this.emit('craft', e.cx, e.cy, r.id);
    }
  }

  /** Le Puits a-t-il encore une case exploitable sous lui ? */
  private minerHasOre(e: Ent): boolean {
    const cells = e.cells!, w = this.world;
    for (let k = 0; k < cells.length; k += 2) {
      const type = w.deposit(cells[k], cells[k + 1]);
      if (!type) continue;
      const d = DEPOSITS[type];
      if (d && d.item >= 0 && w.amount(cells[k], cells[k + 1]) > 0) return true;
    }
    return false;
  }

  private tickMiner(e: Ent): void {
    this.pushOut(e);
    if (e.outCount >= 4) { e.status = Status.Blocked; return; }
    if (!this.minerHasOre(e)) { e.status = Status.NoResource; return; }
    const sat = this.draw(e);
    e.status = sat < 0.02 ? Status.NoPower : Status.Working;
    e.progress += sat * ERA_SPEED[e.era - 1];
    if (e.progress < 60) return;
    e.progress = 0;
    const cells = e.cells!, n = cells.length >> 1, w = this.world;
    for (let k = 0; k < n; k++) {
      const idx = (e.ptr + k) % n;
      const x = cells[idx * 2], y = cells[idx * 2 + 1];
      const type = w.deposit(x, y);
      if (!type) continue;
      const d = DEPOSITS[type];
      if (!d || d.item < 0) continue;                 // gisement pas encore exploitable : case suivante
      if (!w.takeDeposit(x, y)) continue;
      e.out![d.item]++; e.outCount++; e.ptr = (idx + 1) % n; e.done++;
      this.produce(d.item, 1);
      this.emit('mine', e.cx, e.cy, d.item);
      return;
    }
    e.status = Status.NoResource;
  }

  private tickClay(e: Ent): void {
    this.pushOut(e);
    if (e.outCount >= 4) { e.status = Status.Blocked; return; }
    const sat = this.draw(e);
    e.status = sat < 0.02 ? Status.NoPower : Status.Working;
    e.progress += sat * ERA_SPEED[e.era - 1];
    if (e.progress < 120) return;
    e.progress = 0;
    e.out![I.argile]++; e.outCount++; e.done++;
    this.produce(I.argile, 1);
    this.emit('mine', e.cx, e.cy, I.argile);
  }

  /** Un Piège : il pousse sa sortie, attire une bête par seconde et la prend quand son compte est plein. */
  private tickTrap(e: Ent): void {
    this.pushOut(e);
    if (e.outCount >= TRAP_OUT_MAX) { e.status = Status.Blocked; return; }
    const due = (this.tick + e.id) % 60 === 0;
    const res = due
      ? this.fauna.attract(this.world, e.x, e.y, e.w, e.h)
      : this.fauna.reachability(this.world, e.x, e.y, e.w, e.h);
    const waiting = e.progress > 0 && e.progress < TRAP_TICKS;
    if (waiting || res.reachable > 0) e.status = Status.Working;
    else if (res.noPath > 0) e.status = Status.NoPath;
    else e.status = Status.NoBeast;
    if (e.progress < TRAP_TICKS) e.progress = Math.min(TRAP_TICKS, e.progress + ERA_SPEED[e.era - 1]);
    if (e.progress >= TRAP_TICKS) this.trapCatch(e);
  }

  /** Prend la bête collée au bord du Piège : sa sortie reçoit 1 peau, 1 graisse et 1 os. */
  private trapCatch(e: Ent): void {
    const b = this.fauna.beastNearRect(e.x, e.y, e.w, e.h, 1.2);
    if (!b) return;
    const x = b.x, y = b.y, id = b.id;
    this.fauna.remove(b);
    for (const item of [I.peau, I.graisse, I.os]) {
      e.out![item]++;
      e.outCount++;
      this.produce(item, 1);
    }
    e.done++;
    e.progress = 0;
    this.emit('catch', x, y, id);
  }

  /** Le plus gros arbre à portée de la Scierie, ou null s'il n'y a que des pousses. */
  private biggestTree(e: Ent): { x: number; y: number; canopy: number } | null {
    const w = this.world, R0 = SAW_RANGE, cx = Math.floor(e.cx), cy = Math.floor(e.cy);
    let best = 0, bx = 0, by = 0;
    for (let j = -R0; j <= R0; j++) for (let i = -R0; i <= R0; i++) {
      if (i * i + j * j > R0 * R0 + 2) continue;
      const c = w.canopy(cx + i, cy + j);
      if (c > best) { best = c; bx = cx + i; by = cy + j; }
    }
    return best >= TREE_MIN ? { x: bx, y: by, canopy: best } : null;
  }

  private tickSawmill(e: Ent): void {
    this.pushOut(e);
    if (e.outCount >= 4) { e.status = Status.Blocked; return; }
    if (e.progress < 0) {                          // en attente d'un arbre : on ne sonde qu'une fois par seconde
      if ((this.tick + e.id) % 60 !== 0 || !this.biggestTree(e)) { e.status = Status.NoResource; return; }
      e.progress = 0;                              // trouvé : le cycle démarre dans le même pas
    } else if (e.progress === 0 && !this.biggestTree(e)) {
      e.progress = -1;                             // plus rien à couper : on attend une repousse
      e.status = Status.NoResource;
      return;
    }
    const sat = this.draw(e);
    e.status = sat < 0.02 ? Status.NoPower : Status.Working;
    e.progress += sat * ERA_SPEED[e.era - 1];
    if (e.progress < 90) return;
    e.progress = 0;
    const best = this.biggestTree(e);
    if (!best) { e.progress = -1; e.status = Status.NoResource; return; }
    const left = best.canopy - CANOPY_UNIT;
    this.world.setCanopy(best.x, best.y, left);
    e.out![I.bois]++; e.outCount++; e.done++;
    e.tx = best.x + 0.5; e.ty = best.y + 0.5;
    this.produce(I.bois, 1);
    this.emit(left < TREE_MIN ? 'fell' : 'cut', best.x + 0.5, best.y + 0.5, best.canopy);
  }

  // ============================================================ énergie
  private tickPower(): void {
    // Les sources d'énergie (Tour, Brûleur, Roue à eau) gardent leur puissance : docs/ERES.md ne la fait pas varier.
    const dt = 1 / 60, p = this.power;
    const demand = p.demand;
    p.demand = 0;
    let supply = p.base, capacity = p.base;
    for (const s of p.hydros) { s.flow = s.def.power; s.status = Status.Working; supply += s.def.power; capacity += s.def.power; }
    let need = demand - supply;
    for (const g of p.gens) {
      g.flow = 0;
      let fuel = -1;
      for (const id of g.def.fuels) if (g.buf![id] > 0) { fuel = id; break; }
      if (g.energy <= 0 && fuel >= 0 && need > 0) {
        g.buf![fuel]--; g.energy += FUEL[fuel];
        this.stats.cons[fuel * Stats.WIN + this.stats.cur]++;
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
    p.lastDemand = demand; p.capacity = capacity;
    p.sat = demand > 0 ? Math.min(1, supply / demand) : 1;
  }

  // ============================================================ la jungle
  /** Les arbres repoussent là où ils étaient, le jour, sauf sous les dalles (un bloc toutes les 2 s). */
  private tickGrowth(): void {
    const blocks = this.world.phases[this.tick % 120];
    for (const c of blocks) this.growChunk(c);
  }

  private growChunk(c: Chunk): void {
    const light = this.sun.light;
    if (light <= 0) return;
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
    if (dC > 0) c.version++;
  }

  private nearSlab(c: Chunk, i: number): boolean {
    const x = c.cx * CHUNK + (i & 31), y = c.cy * CHUNK + (i >> 5), w = this.world;
    for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
      const o = w.at(x + k, y + j, false);
      if (o && o.slab[(((y + j) & 31) << 5) | ((x + k) & 31)]) return true;
    }
    return false;
  }

  // ========================================================== livraisons
  private checkQuota(): void {
    const q = quotaAt(this.quota);
    if (q.need.length === 0) return;
    if (q.rebuild) {
      for (const [id, n] of q.need) if (this.delivered[id] < n || this.stock[id] < n) return;
      for (const [id, n] of q.need) this.stock[id] -= n;
    } else {
      for (const [id, n] of q.need) if (this.delivered[id] < n) return;
    }
    this.records.push({ quota: this.quota, ticks: this.tick - this.quotaStart, buildings: this.tickers.length + this.belts.length });
    this.quota++;
    this.quotaStart = this.tick;
    this.delivered.fill(0);
    this.hub.level++;
    this.version++;
    this.events.push({ type: 'quota', x: this.hub.cx, y: this.hub.cy, a: this.quota });
  }

  // ============================================================= bilans
  /** Compte les objets d'une sorte présents dans tout le monde (pour les tests de conservation). */
  ledger(item: number): number {
    let total = this.stock[item];
    for (const p of this.paths) for (let i = p.head; i < p.types.length; i++) if (p.types[i] === item) total++;
    for (const e of this.tickers) {
      if (e.buf && e.out) total += e.buf[item] + e.out[item];
      if (e.working && e.recipe) for (const [id, n] of e.recipe.inputs) if (id === item) total += n;
      if (e.held === item) total++;
    }
    for (const e of [...this.tickers, ...this.belts]) {
      if (e.dead) continue;
      for (const [id, n] of costOf(e.def, e.era)) if (id === item) total += n;
    }
    for (const c of this.world.list) {
      for (let i = 0; i < CHUNK * CHUNK; i++) {
        if (c.slab[i]) for (const [id, n] of costOf(B.dalle, c.slab[i])) if (id === item) total += n;
        if (c.deposit[i]) {
          const d = DEPOSITS[c.deposit[i]];
          if (d && d.item === item) total += c.amount[i];
        }
        if (c.loot[i] && item === I.bois) total += LOOT_WOOD;
        if (item === I.bois) total += c.canopy[i] / CANOPY_UNIT;
      }
    }
    for (let k = 0; k < Math.min(this.quota, QUOTAS.length); k++) {
      const q = QUOTAS[k];
      if (!q.rebuild) continue;
      for (const [id, n] of q.need) if (id === item) total += n;
    }
    return total;
  }
}
