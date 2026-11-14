// Convoyeurs : des « chemins » (suites de cases) où les objets sont stockés par écarts.
// Coût par pas : O(1) par chemin, quel que soit le nombre d'objets transportés.

import { TILE_U, SPACING, BRIDGE_MAX, DX, DY } from './data';
import type { Ent } from './ent';
import type { Game } from './game';

export interface Target { path: BeltPath | null; ent: Ent | null; dir: number; }
export const NO_TARGET: Target = { path: null, ent: null, dir: 0 };

export class BeltPath {
  tiles: Ent[] = [];
  starts: number[] = [];      // décalage de début de chaque case
  lens: number[] = [];
  length = 0;
  uniform = true;
  types: number[] = [];       // objets, du premier (tête) au dernier
  gaps: number[] = [];        // gaps[i] = distance entre l'objet i et le précédent (ou la fin du chemin)
  head = 0;
  used = 0;                   // distance entre la fin du chemin et le dernier objet
  scan = 0;
  target: Target = NO_TARGET;
  minx = 0; miny = 0; maxx = 0; maxy = 0;
  mark = 0;

  get count(): number { return this.types.length - this.head; }

  insertAtStart(type: number): boolean {
    const free = this.length - this.used;
    if (free < SPACING) return false;
    this.types.push(type);
    this.gaps.push(free);
    this.used = this.length;
    return true;
  }

  tileIndex(pos: number): number {
    const n = this.tiles.length;
    if (this.uniform) { const k = (pos / TILE_U) | 0; return k < 0 ? 0 : k >= n ? n - 1 : k; }
    let lo = 0, hi = n - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (this.starts[mid] <= pos) lo = mid; else hi = mid - 1; }
    return lo;
  }

  tick(speed: number, g: Game): void {
    const n = this.types.length;
    const h = this.head;
    if (h >= n) return;
    const gaps = this.gaps;
    let gap = gaps[h];
    if (gap > 0) {
      const m = gap < speed ? gap : speed;
      gap -= m; gaps[h] = gap; this.used -= m;
      if (gap === 0) this.deliver(g);
    } else if (!this.deliver(g)) {
      // tête bloquée : la file se compresse derrière elle
      let j = this.scan > h ? this.scan : h + 1;
      while (j < n && gaps[j] <= SPACING) j++;
      this.scan = j;
      if (j < n) {
        const room = gaps[j] - SPACING;
        const m = room < speed ? room : speed;
        gaps[j] -= m; this.used -= m;
      }
    }
  }

  private deliver(g: Game): boolean {
    const t = this.target;
    const type = this.types[this.head];
    let ok = false;
    if (t.path) ok = t.path.insertAtStart(type);
    else if (t.ent) ok = g.accept(t.ent, type, t.dir);
    if (!ok) return false;
    this.head++;
    if (this.head > 48 && this.head * 2 > this.types.length) {
      this.types.splice(0, this.head); this.gaps.splice(0, this.head);
      this.scan = Math.max(0, this.scan - this.head); this.head = 0;
    }
    return true;
  }
}

const isBeltLike = (e: Ent | undefined | null): boolean => !!e && !e.dead && (e.def.kind === 'belt' || e.def.kind === 'bridge');

/** Un convoyeur accepte tout sauf de face ; une entrée de pont n'accepte que par l'arrière. */
function accepts(t: Ent, moveDir: number): boolean {
  if (t.def.kind === 'belt') return moveDir !== ((t.rot + 2) & 3);
  return !t.isOut && moveDir === t.rot;
}

function entAt(g: Game, x: number, y: number): Ent | null {
  const id = g.world.ent(x, y);
  return id ? g.ents.get(id) ?? null : null;
}

/** Résout la cible d'une sortie pointant vers la case (x, y) dans la direction dir. */
export function resolveTarget(g: Game, x: number, y: number, dir: number): Target {
  const t = entAt(g, x, y);
  if (!t || t.dead) return NO_TARGET;
  if (isBeltLike(t)) return accepts(t, dir) && t.path ? { path: t.path, ent: null, dir } : NO_TARGET;
  const k = t.def.kind;
  if (k === 'tree' || k === 'solar' || k === 'battery' || k === 'wind' || k === 'hydro' || k === 'deco') return NO_TARGET;
  return { path: null, ent: t, dir };
}

/** Sorties d'une entité : [x, y, direction]. Machines : un port ; aiguillage : gauche, avant, droite. */
export function outputPorts(e: Ent): [number, number, number][] {
  const k = e.def.kind;
  if (k === 'splitter') {
    return [3, 0, 1].map((turn) => { const d = (e.rot + turn) & 3; return [e.x + DX[d], e.y + DY[d], d] as [number, number, number]; });
  }
  if (k === 'machine' || k === 'miner' || k === 'sawmill' || k === 'pump' || k === 'scrubber' || k === 'ring' || k === 'storage') {
    const d = e.rot;
    const mx = e.x + ((e.w - 1) >> 1), my = e.y + ((e.h - 1) >> 1);
    if (d === 0) return [[e.x + e.w, my, d]];
    if (d === 1) return [[mx, e.y + e.h, d]];
    if (d === 2) return [[e.x - 1, my, d]];
    return [[mx, e.y - 1, d]];
  }
  return [];
}

/** Reconstruit tous les chemins en conservant les objets en transit. */
export function rebuildBelts(g: Game): void {
  // 1. mémoriser les objets, case par case (de la tête vers la queue)
  for (const p of g.paths) {
    let dist = 0;
    for (let i = p.head; i < p.types.length; i++) {
      dist += p.gaps[i];
      const pos = p.length - dist;
      const k = p.tileIndex(pos);
      const t = p.tiles[k];
      if (t.dead) { g.stock[p.types[i]]++; continue; }
      (t.saved ??= []).push(p.types[i], (pos - p.starts[k]) / p.lens[k]);
    }
  }
  g.belts = g.belts.filter((e) => !e.dead);
  const belts = g.belts;

  // 2. liens : appariement des ponts, successeurs, alimentations
  for (const e of belts) { e.path = null; e.next = null; e.feeder = null; e.nfeed = 0; e.feedDir = -1; e.pair = null; }
  for (const e of belts) {
    if (e.def.kind !== 'bridge' || e.isOut) continue;
    for (let d = 1; d <= BRIDGE_MAX; d++) {
      const t = entAt(g, e.x + DX[e.rot] * d, e.y + DY[e.rot] * d);
      if (t && !t.dead && t.def.kind === 'bridge' && t.rot === e.rot) {
        if (t.isOut && !t.pair) { e.pair = t; t.pair = e; }
        break;
      }
    }
  }
  for (const e of belts) {
    let n: Ent | null = null;
    if (e.def.kind === 'bridge' && !e.isOut) n = e.pair;
    else {
      const t = entAt(g, e.x + DX[e.rot], e.y + DY[e.rot]);
      if (t && isBeltLike(t) && accepts(t, e.rot)) n = t;
    }
    e.next = n;
    if (n) { n.nfeed++; n.feeder = e; n.feedDir = e.rot; }
  }
  for (const e of g.tickers) {
    for (const [x, y, d] of outputPorts(e)) {
      const t = entAt(g, x, y);
      if (t && isBeltLike(t) && accepts(t, d)) { t.nfeed++; t.feeder = null; t.feedDir = d; }
    }
  }

  // 3. chemins : une case prolonge son prédécesseur si celui-ci est son unique alimentation
  const continues = (e: Ent) => e.nfeed === 1 && e.feeder !== null;
  const paths: BeltPath[] = [];
  const build = (start: Ent) => {
    const p = new BeltPath();
    let cur: Ent | null = start;
    let prevDir = start.nfeed === 1 && start.feedDir >= 0 ? start.feedDir : start.rot;
    p.minx = p.maxx = start.x; p.miny = p.maxy = start.y;
    while (cur && !cur.path) {
      cur.path = p; cur.pidx = p.tiles.length; cur.inDir = prevDir;
      let len = TILE_U;
      if (cur.def.kind === 'bridge' && !cur.isOut && cur.pair) {
        len = TILE_U * (Math.abs(cur.pair.x - cur.x) + Math.abs(cur.pair.y - cur.y));
        p.uniform = false;
      }
      p.tiles.push(cur); p.starts.push(p.length); p.lens.push(len); p.length += len;
      if (cur.x < p.minx) p.minx = cur.x; if (cur.x > p.maxx) p.maxx = cur.x;
      if (cur.y < p.miny) p.miny = cur.y; if (cur.y > p.maxy) p.maxy = cur.y;
      prevDir = cur.rot;
      const nx: Ent | null = cur.next;
      if (!nx || !continues(nx)) break;
      cur = nx;
    }
    paths.push(p);
  };
  for (const e of belts) if (!continues(e)) build(e);
  for (const e of belts) if (!e.path) build(e);   // boucles fermées

  // 4. cibles en bout de chemin
  for (const p of paths) {
    const last = p.tiles[p.tiles.length - 1];
    if (last.next) p.target = last.next.path ? { path: last.next.path, ent: null, dir: last.rot } : NO_TARGET;
    else if (last.def.kind === 'bridge' && !last.isOut) p.target = NO_TARGET;
    else {
      const t = entAt(g, last.x + DX[last.rot], last.y + DY[last.rot]);
      p.target = t && !t.dead && !isBeltLike(t) && t.def.kind !== 'tree' ? { path: null, ent: t, dir: last.rot } : NO_TARGET;
    }
  }

  // 5. reposer les objets (les excédents retournent au stock : rien ne se perd)
  for (const p of paths) {
    let prev = -1;
    for (let k = p.tiles.length - 1; k >= 0; k--) {
      const t = p.tiles[k];
      const s = t.saved;
      if (!s) continue;
      t.saved = null;
      for (let i = 0; i < s.length; i += 2) {
        let dist = p.length - (p.starts[k] + Math.min(0.999, s[i + 1]) * p.lens[k]);
        dist = Math.max(0, Math.round(dist));
        if (prev >= 0 && dist < prev + SPACING) dist = prev + SPACING;
        if (dist > p.length) { g.stock[s[i]]++; continue; }
        p.types.push(s[i]); p.gaps.push(prev < 0 ? dist : dist - prev);
        prev = dist; p.used = dist;
      }
    }
  }

  // 6. ordre de mise à jour : l'aval avant l'amont (aucun débit perdu aux jonctions)
  const order: BeltPath[] = [];
  const visit = (p: BeltPath) => {
    const stack: BeltPath[] = [];
    let cur: BeltPath | null = p;
    while (cur && cur.mark === 0) { cur.mark = 1; stack.push(cur); cur = cur.target.path; }
    while (stack.length) order.push(stack.pop()!);
  };
  for (const p of paths) visit(p);
  g.paths = order;

  // 7. sorties des machines et aiguillages
  for (const e of g.tickers) {
    const ports = outputPorts(e);
    if (e.def.kind === 'splitter') e.outs = ports.map(([x, y, d]) => resolveTarget(g, x, y, d));
    else if (ports.length) e.outT = resolveTarget(g, ports[0][0], ports[0][1], ports[0][2]);
  }
}

/** Position monde (en cases) d'un objet situé à `pos` unités du début du chemin. z = hauteur sur un pont. */
export function itemPosition(p: BeltPath, pos: number, out: { x: number; y: number; z: number }): void {
  const k = p.tileIndex(pos);
  const t = p.tiles[k];
  const f = (pos - p.starts[k]) / p.lens[k];
  const cx = t.x + 0.5, cy = t.y + 0.5;
  if (p.lens[k] > TILE_U) {
    const span = p.lens[k] / TILE_U;
    out.x = cx + DX[t.rot] * (f * span - 0.5);
    out.y = cy + DY[t.rot] * (f * span - 0.5);
    out.z = Math.sin(Math.PI * f);
    return;
  }
  out.z = 0;
  if (f < 0.5) { out.x = cx - DX[t.inDir] * (0.5 - f); out.y = cy - DY[t.inDir] * (0.5 - f); }
  else { out.x = cx + DX[t.rot] * (f - 0.5); out.y = cy + DY[t.rot] * (f - 0.5); }
}
