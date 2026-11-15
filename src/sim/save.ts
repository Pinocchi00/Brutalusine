// Sauvegarde : un instantané complet et fidèle de la partie (tableaux typés conservés tels quels).

import { B, R, type Dir } from './data';
import { Game } from './game';

export interface SaveData {
  v: 2; seed: number; tick: number; nextId: number;
  stock: Float64Array; delivered: Float64Array;
  quota: number; quotaStart: number; gathered: number;
  atmo: { co2: number };
  made: Uint8Array; wind: number;
  records: Game['records'];
  chunks: { cx: number; cy: number; canopy: Uint8Array; deposit: Uint8Array; amount: Uint16Array; slab: Uint8Array; loot: Uint8Array; cap: Uint8Array }[];
  ents: EntSave[];
  extra?: unknown;
}

interface EntSave {
  id: number; key: string; x: number; y: number; rot: number;
  isOut?: boolean; held?: number; rr?: number; filter?: number; recipe?: string;
  buf?: number[]; out?: number[]; progress?: number; working?: boolean; outRR?: number;
  energy?: number; ptr?: number; level?: number; done?: number; light?: number;
  items?: number[];
}

export function serialize(g: Game, extra?: unknown): SaveData {
  // objets en transit, rangés par case (de la tête vers la queue)
  const items = new Map<number, number[]>();
  for (const p of g.paths) {
    let dist = 0;
    for (let i = p.head; i < p.types.length; i++) {
      dist += p.gaps[i];
      const pos = p.length - dist, k = p.tileIndex(pos), t = p.tiles[k];
      let a = items.get(t.id);
      if (!a) items.set(t.id, (a = []));
      a.push(p.types[i], (pos - p.starts[k]) / p.lens[k]);
    }
  }
  const ents: EntSave[] = [];
  for (const e of [...g.tickers, ...g.belts]) {
    if (e.dead) continue;
    const s: EntSave = { id: e.id, key: e.def.key, x: e.x, y: e.y, rot: e.rot };
    if (e.isOut) s.isOut = true;
    if (e.held >= 0) s.held = e.held;
    if (e.rr) s.rr = e.rr;
    if (e.filter >= 0) s.filter = e.filter;
    if (e.recipe) s.recipe = e.recipe.key;
    if (e.buf) { s.buf = Array.from(e.buf); s.out = Array.from(e.out!); }
    if (e.progress) s.progress = e.progress;
    if (e.working) s.working = true;
    if (e.outRR) s.outRR = e.outRR;
    if (e.energy) s.energy = e.energy;
    if (e.ptr) s.ptr = e.ptr;
    if (e.level) s.level = e.level;
    if (e.done) s.done = e.done;
    if (e.def.kind === 'solar') s.light = e.light;
    const it = items.get(e.id);
    if (it) s.items = it;
    ents.push(s);
  }
  return {
    v: 2, seed: g.seed, tick: g.tick, nextId: g.nextId,
    stock: g.stock.slice(), delivered: g.delivered.slice(),
    quota: g.quota, quotaStart: g.quotaStart, gathered: g.gathered,
    atmo: { ...g.atmo }, made: g.made.slice(), wind: g.wind, records: g.records.slice(),
    chunks: g.world.list.map((c) => ({ cx: c.cx, cy: c.cy, canopy: c.canopy.slice(), deposit: c.deposit.slice(), amount: c.amount.slice(), slab: c.slab.slice(), loot: c.loot.slice(), cap: c.cap.slice() })),
    ents, extra,
  };
}

export function deserialize(d: SaveData): Game {
  if (d.v !== 2) throw new Error('Sauvegarde d’une ancienne version');
  const g = new Game(d.seed, false);
  g.loading = true;
  for (const cd of d.chunks) {
    const c = g.world.chunk(cd.cx, cd.cy)!;
    c.canopy.set(cd.canopy); c.deposit.set(cd.deposit); c.amount.set(cd.amount); c.slab.set(cd.slab); c.loot.set(cd.loot); c.cap.set(cd.cap);
    c.slabCount = 0;
    for (let i = 0; i < c.slab.length; i++) if (c.slab[i]) c.slabCount++;
    c.version++;
  }
  for (const s of d.ents) {
    g.nextId = s.id;
    const e = g.spawn(B[s.key], s.x, s.y, s.rot as Dir);
    e.isOut = !!s.isOut; e.held = s.held ?? -1; e.rr = s.rr ?? 0; e.filter = s.filter ?? -1;
    e.recipe = s.recipe ? R[s.recipe] : e.recipe;
    if (s.buf && e.buf) { e.buf.set(s.buf); e.out!.set(s.out!); e.outCount = s.out!.reduce((a, b) => a + b, 0); }
    e.progress = s.progress ?? 0; e.working = !!s.working; e.outRR = s.outRR ?? 0;
    e.energy = s.energy ?? 0; e.ptr = s.ptr ?? 0; e.born = -999;
    e.level = s.level ?? 0; e.done = s.done ?? 0; e.light = s.light ?? 1;
    if (s.items) e.saved = s.items.slice();
    if (e.def.kind === 'hub') g.hub = e;
  }
  g.nextId = d.nextId; g.tick = d.tick;
  g.stock.set(d.stock); g.delivered.set(d.delivered);
  g.quota = d.quota; g.quotaStart = d.quotaStart; g.gathered = d.gathered;
  Object.assign(g.atmo, d.atmo); g.made.set(d.made); g.wind = d.wind; g.records = d.records.slice();
  g.loading = false;
  g.topoDirty = true;
  g.refresh();          // les objets en transit retrouvent leur convoyeur dès le chargement
  return g;
}

// ------------------------------------------------------------ stockage local
const DB = 'brutalusine', STORE = 'saves';

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const rq = indexedDB.open(DB, 1);
    rq.onupgradeneeded = () => rq.result.createObjectStore(STORE);
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => rej(rq.error);
  });
}

export async function writeSave(slot: string, data: SaveData): Promise<void> {
  const db = await open();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(data, slot);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
  db.close();
}

export async function readSave(slot: string): Promise<SaveData | null> {
  const db = await open();
  const out = await new Promise<SaveData | null>((res, rej) => {
    const rq = db.transaction(STORE, 'readonly').objectStore(STORE).get(slot);
    rq.onsuccess = () => res((rq.result as SaveData) ?? null);
    rq.onerror = () => rej(rq.error);
  });
  db.close();
  return out;
}
