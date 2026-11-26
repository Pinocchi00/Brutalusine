// La faune : des cabiais en petits groupes qui broutent et errent lentement.
// Tout est déterministe : la graine fixe les zones à troupeau, un générateur à état entier fait le reste.

import { hash01 } from './rng';
import { CHUNK, GROUND_WATER, type World } from './world';

/** Nombre de coups de poing pour abattre une bête. */
export const BEAST_HP = 3;
/** Vitesse d'une bête en marche, en cases par pas (0,6 case par seconde). */
export const BEAST_SPEED = 0.01;
/** Distance minimale du centre d'une zone à (0, 0) pour qu'elle porte un troupeau. */
export const HERD_MIN_DIST = 40;
/** Distance minimale à (0, 0) où une bête peut se tenir. */
export const SPAWN_MIN_DIST = 28;
/** Pas entre deux reconstitutions d'une bête dans une zone. */
export const RESPAWN_TICKS = 1200;
/** Une zone est un bloc de 32×32 ; ce rayon donne un carré de 8×8 zones autour du départ. */
export const ZONE_RANGE = 4;

const ZONES_PER_SIDE = ZONE_RANGE * 2;
const DRIFT_MIN = 40 * 60;
const DRIFT_MAX = 90 * 60;
const GRAZE_MIN = 3 * 60;
const GRAZE_MAX = 8 * 60;
const TARGET_RADIUS = 3;
const DRIFT_RADIUS = 6;
const RNG_SALT = 701;

/** L'état d'une bête, en marche ou en train de brouter. */
export type BeastState = 'graze' | 'walk';

/** Une bête : position continue en cases, au centre de l'animal. */
export interface Beast {
  id: number;
  x: number;
  y: number;
  zone: number;
  hp: number;
  state: BeastState;
  tx: number;
  ty: number;
  timer: number;
  face: -1 | 1;
  struck: number;
}

/** Une zone à troupeau : son ancre, sa dérive et sa reconstitution. */
export interface Zone {
  cx: number;
  cy: number;
  herd: boolean;
  cap: number;
  ax: number;
  ay: number;
  hasAnchor: boolean;
  drift: number;
  respawn: number;
  count: number;
}

interface Tile { x: number; y: number; }

/** L'indice d'une zone dans `Fauna.zones`. */
export function zoneIndex(cx: number, cy: number): number {
  return (cy + ZONE_RANGE) * ZONES_PER_SIDE + (cx + ZONE_RANGE);
}

/** Cette zone porte-t-elle un troupeau ? */
export function zoneHasHerd(seed: number, cx: number, cy: number): boolean {
  const x = (cx + 0.5) * CHUNK;
  const y = (cy + 0.5) * CHUNK;
  return Math.hypot(x, y) >= HERD_MIN_DIST && hash01(cx, cy, seed + 501) < 0.7;
}

/** Le plafond d'une zone : 2 à 4 bêtes, ou 0 sans troupeau. */
export function zoneHerdCap(seed: number, cx: number, cy: number): number {
  if (!zoneHasHerd(seed, cx, cy)) return 0;
  return 2 + Math.floor(hash01(cx, cy, seed + 502) * 3);
}

/** Générateur à état entier : même état et même graine donnent la même suite. */
export class Rng {
  constructor(public state: number, public seed: number) {}

  /** Un tirage dans [0, 1). */
  next(): number {
    this.state = (this.state + 1) >>> 0;
    return hash01(this.state, 0, this.seed + RNG_SALT);
  }

  /** Un entier dans [min, max], bornes comprises. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }
}

/** Une case praticable par une bête : ni eau, ni entité, ni dalle, et loin du départ. */
function passable(world: World, x: number, y: number): boolean {
  if (Math.hypot(x + 0.5, y + 0.5) < SPAWN_MIN_DIST) return false;
  if (world.ground(x, y) === GROUND_WATER) return false;
  if (world.ent(x, y) !== 0) return false;
  if (world.slab(x, y) !== 0) return false;
  return true;
}

/** La case porte-t-elle une entité ou une dalle ? L'eau et la distance ne changent jamais sous une bête. */
function occupied(world: World, x: number, y: number): boolean {
  const c = world.at(x, y, false);
  if (!c) return false;
  const m = CHUNK - 1;
  const i = ((y & m) << 5) | (x & m);
  return c.ent[i] !== 0 || c.slab[i] !== 0;
}

/** Les zones et les bêtes d'une partie. */
export class Fauna {
  rng: Rng;
  beasts: Beast[] = [];
  zones: Zone[] = [];
  nextId = 1;

  constructor(public seed: number) {
    this.rng = new Rng(0, seed);
    this.zones = buildZones(seed);
  }

  /** Peuple les zones à troupeau d'une partie neuve. */
  init(world: World): void {
    for (const z of this.zones) {
      if (!z.herd) continue;
      this.loadNeighbourhood(world, z);
      const a = this.pickAnchor(world, z);
      if (!a) {
        z.herd = false;
        z.cap = 0;
        continue;
      }
      z.ax = a.x;
      z.ay = a.y;
      z.hasAnchor = true;
      z.drift = this.rng.int(DRIFT_MIN, DRIFT_MAX);
      z.count = 0;
      for (let i = 0; i < z.cap; i++) {
        const p = this.nearTile(world, z.ax, z.ay, TARGET_RADIUS) ?? a;
        this.addBeast(z, p.x + 0.5, p.y + 0.5);
      }
    }
  }

  /** Un pas de faune : dérive des ancres, reconstitutions, puis comportement des bêtes. */
  step(world: World): void {
    for (const z of this.zones) {
      if (!z.herd) continue;
      z.drift--;
      if (z.drift <= 0) {
        this.moveAnchor(world, z);
        z.drift = this.rng.int(DRIFT_MIN, DRIFT_MAX);
      }
      z.respawn--;
      if (z.respawn <= 0) {
        z.respawn = RESPAWN_TICKS;
        if (z.count < z.cap) this.spawnNearAnchor(world, z);
      }
    }
    for (let i = 0; i < this.beasts.length; i++) this.tickBeast(world, this.beasts[i]);
  }

  /** La bête la plus proche du point à moins de `r` cases, ou null. */
  beastAt(x: number, y: number, r: number): Beast | null {
    let best: Beast | null = null;
    let bestD = r;
    for (const b of this.beasts) {
      const d = Math.hypot(b.x - x, b.y - y);
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    return best;
  }

  /** Retire une bête abattue de sa zone. */
  remove(b: Beast): void {
    const i = this.beasts.indexOf(b);
    if (i < 0) return;
    this.beasts.splice(i, 1);
    const z = this.zones[b.zone];
    if (z && z.count > 0) z.count--;
  }

  private grazeTicks(): number {
    return this.rng.int(GRAZE_MIN, GRAZE_MAX);
  }

  private addBeast(z: Zone, x: number, y: number): void {
    const b: Beast = {
      id: this.nextId++,
      x, y,
      zone: zoneIndex(z.cx, z.cy),
      hp: BEAST_HP,
      state: 'graze',
      tx: x,
      ty: y,
      timer: this.grazeTicks(),
      face: 1,
      struck: -1,
    };
    this.beasts.push(b);
    z.count++;
  }

  private spawnNearAnchor(world: World, z: Zone): void {
    const p = this.nearTile(world, z.ax, z.ay, TARGET_RADIUS);
    if (!p) return;
    this.addBeast(z, p.x + 0.5, p.y + 0.5);
  }

  private tickBeast(world: World, b: Beast): void {
    const cx = Math.floor(b.x);
    const cy = Math.floor(b.y);
    if (occupied(world, cx, cy)) {
      const p = this.nearestPassable(world, cx, cy, 4);
      if (p) {
        b.x = p.x + 0.5;
        b.y = p.y + 0.5;
        b.tx = b.x;
        b.ty = b.y;
        b.state = 'graze';
        b.timer = 60;
      }
      return;
    }
    if (b.state === 'graze') {
      b.timer--;
      if (b.timer > 0) return;
      const z = this.zones[b.zone];
      const t = z ? this.nearTile(world, z.ax, z.ay, TARGET_RADIUS) : null;
      if (!t) {
        b.timer = this.grazeTicks();
        return;
      }
      b.tx = t.x + 0.5;
      b.ty = t.y + 0.5;
      b.state = 'walk';
      return;
    }
    const dx = b.tx - b.x;
    const dy = b.ty - b.y;
    const d = Math.hypot(dx, dy);
    if (d <= BEAST_SPEED) {
      b.x = b.tx;
      b.y = b.ty;
      b.state = 'graze';
      b.timer = this.grazeTicks();
      return;
    }
    const nx = b.x + (dx / d) * BEAST_SPEED;
    const ny = b.y + (dy / d) * BEAST_SPEED;
    if (!passable(world, Math.floor(nx), Math.floor(ny))) {
      b.state = 'graze';
      b.timer = this.grazeTicks();
      return;
    }
    b.x = nx;
    b.y = ny;
    if (dx !== 0) b.face = dx > 0 ? 1 : -1;
  }

  /**
   * Charge les blocs voisins d'une zone : une bête peut viser à 3 cases au-delà de son bord.
   * Les charger dès le départ évite de découvrir de la matière en cours de partie.
   */
  private loadNeighbourhood(world: World, z: Zone): void {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) world.chunk(z.cx + dx, z.cy + dy);
    }
  }

  /** L'ancre d'une zone, tirée au hasard parmi ses cases praticables. */
  private pickAnchor(world: World, z: Zone): Tile | null {
    const x0 = z.cx * CHUNK;
    const y0 = z.cy * CHUNK;
    for (let i = 0; i < 80; i++) {
      const x = x0 + this.rng.int(0, CHUNK - 1);
      const y = y0 + this.rng.int(0, CHUNK - 1);
      if (passable(world, x, y)) return { x, y };
    }
    for (let y = y0; y < y0 + CHUNK; y++) {
      for (let x = x0; x < x0 + CHUNK; x++) if (passable(world, x, y)) return { x, y };
    }
    return null;
  }

  /** Une case praticable à `radius` cases au plus d'un point, ou null. */
  private nearTile(world: World, ax: number, ay: number, radius: number): Tile | null {
    for (let i = 0; i < 40; i++) {
      const dx = this.rng.int(-radius, radius);
      const dy = this.rng.int(-radius, radius);
      if (dx * dx + dy * dy > radius * radius) continue;
      if (passable(world, ax + dx, ay + dy)) return { x: ax + dx, y: ay + dy };
    }
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy > radius * radius) continue;
        if (passable(world, ax + dx, ay + dy)) return { x: ax + dx, y: ay + dy };
      }
    }
    return null;
  }

  /**
   * La case praticable la plus proche, à `max` cases au plus, en balayant dans un ordre fixe.
   * Sert quand une dalle ou un bâtiment est posé sous une bête : elle sort sans contrôle de chemin.
   */
  private nearestPassable(world: World, x: number, y: number, max: number): Tile | null {
    let best: Tile | null = null;
    let bestD = Infinity;
    for (let dy = -max; dy <= max; dy++) {
      for (let dx = -max; dx <= max; dx++) {
        const d = dx * dx + dy * dy;
        if (d > max * max || d >= bestD) continue;
        if (!passable(world, x + dx, y + dy)) continue;
        bestD = d;
        best = { x: x + dx, y: y + dy };
      }
    }
    return best;
  }

  /** Déplace l'ancre de quelques cases, sans sortir de sa zone. */
  private moveAnchor(world: World, z: Zone): void {
    const x0 = z.cx * CHUNK;
    const y0 = z.cy * CHUNK;
    const x1 = x0 + CHUNK - 1;
    const y1 = y0 + CHUNK - 1;
    const inside = (x: number, y: number) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
    for (let i = 0; i < 40; i++) {
      const dx = this.rng.int(-DRIFT_RADIUS, DRIFT_RADIUS);
      const dy = this.rng.int(-DRIFT_RADIUS, DRIFT_RADIUS);
      if (dx * dx + dy * dy > DRIFT_RADIUS * DRIFT_RADIUS) continue;
      const x = z.ax + dx;
      const y = z.ay + dy;
      if (!inside(x, y)) continue;
      if (passable(world, x, y)) {
        z.ax = x;
        z.ay = y;
        return;
      }
    }
    for (let dy = -DRIFT_RADIUS; dy <= DRIFT_RADIUS; dy++) {
      for (let dx = -DRIFT_RADIUS; dx <= DRIFT_RADIUS; dx++) {
        if (dx * dx + dy * dy > DRIFT_RADIUS * DRIFT_RADIUS) continue;
        const x = z.ax + dx;
        const y = z.ay + dy;
        if (!inside(x, y)) continue;
        if (passable(world, x, y)) {
          z.ax = x;
          z.ay = y;
          return;
        }
      }
    }
  }
}

/** Les 8×8 zones du carré de départ, avec leur troupeau et leur minuterie décalée. */
function buildZones(seed: number): Zone[] {
  const zones: Zone[] = [];
  for (let cy = -ZONE_RANGE; cy < ZONE_RANGE; cy++) {
    for (let cx = -ZONE_RANGE; cx < ZONE_RANGE; cx++) {
      const herd = zoneHasHerd(seed, cx, cy);
      const cap = herd ? zoneHerdCap(seed, cx, cy) : 0;
      const respawn = Math.floor(hash01(cx, cy, seed + 503) * RESPAWN_TICKS);
      zones.push({
        cx, cy, herd, cap,
        ax: cx * CHUNK, ay: cy * CHUNK, hasAnchor: false,
        drift: 0, respawn, count: 0,
      });
    }
  }
  return zones;
}
