// Les épaves d'anciennes capsules : posées par la graine, elles gardent les noyaux de l'exploration.

import { TREE_MIN } from './data';
import { ZONE_RANGE } from './fauna';
import { hash01 } from './rng';
import { CHUNK, GROUND_WATER, type World } from './world';

/** Une épave de 2×2 cases, à fouiller une fois ; ses noyaux ne voyagent jamais sur un tapis. */
export interface Wreck {
  id: number;
  x: number;
  y: number;
  cores: number;
  searched: boolean;
}

/** Noyaux de l'épave garantie près du départ. */
export const GUARANTEED_CORES = 4;
/** Distance minimale d'une épave rare au départ, en cases. */
export const RARE_MIN_DIST = 60;
/** Écart minimal entre deux épaves, en cases vides. */
export const WRECK_GAP = 3;
/** Un bloc sur six environ porte une épave rare. */
export const RARE_CHANCE = 0.17;

const GUARANTEED_MIN = 25;
const GUARANTEED_MAX = 40;
const TAU = Math.PI * 2;

/** L'écart entre deux épaves, en cases vides (0 quand elles se touchent). */
export function wreckGap(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = Math.max(a.x - (b.x + 2), b.x - (a.x + 2), 0);
  const dy = Math.max(a.y - (b.y + 2), b.y - (a.y + 2), 0);
  return Math.max(dx, dy);
}

/** L'épave qui couvre cette case, ou null. */
export function wreckAt(list: readonly Wreck[], x: number, y: number): Wreck | null {
  for (const w of list) {
    if (x >= w.x && x < w.x + 2 && y >= w.y && y < w.y + 2) return w;
  }
  return null;
}

/** Une clé entière pour une case, utilisable dans un ensemble. */
function cellKey(x: number, y: number): number {
  return (x + 0x400000) * 0x800000 + (y + 0x400000);
}

/** L'ensemble des cases occupées par une bête au départ. */
function beastCells(beasts: readonly { x: number; y: number }[]): Set<number> {
  const set = new Set<number>();
  for (const b of beasts) set.add(cellKey(Math.floor(b.x), Math.floor(b.y)));
  return set;
}

/** Une case peut-elle porter une épave : terre ferme, sans arbre, gisement, débris ni bête ? */
function clearTile(world: World, blocked: ReadonlySet<number>, x: number, y: number): boolean {
  if (world.ground(x, y) === GROUND_WATER) return false;
  if (world.canopy(x, y) >= TREE_MIN) return false;
  if (world.deposit(x, y) !== 0) return false;
  if (world.loot(x, y) !== 0) return false;
  if (world.ent(x, y) !== 0) return false;
  return !blocked.has(cellKey(x, y));
}

/** Les 2×2 cases sont-elles libres et assez loin des autres épaves ? */
function fits(world: World, blocked: ReadonlySet<number>, wrecks: readonly Wreck[], x: number, y: number): boolean {
  for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
    if (!clearTile(world, blocked, x + i, y + j)) return false;
  }
  for (const w of wrecks) if (wreckGap({ x, y }, w) < WRECK_GAP) return false;
  return true;
}

/** Ajoute une épave et marque ses cases dans le monde. */
function add(world: World, wrecks: Wreck[], x: number, y: number, cores: number): void {
  const id = wrecks.length + 1;
  wrecks.push({ id, x, y, cores, searched: false });
  for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) world.setWreck(x + i, y + j, 1);
}

/** L'épave garantie : un tirage par la graine, puis un balayage de secours pour la garantir. */
function placeGuaranteed(world: World, seed: number, blocked: ReadonlySet<number>, wrecks: Wreck[]): void {
  for (let attempt = 0; attempt < 400; attempt++) {
    const a = hash01(attempt, 1, seed + 907) * TAU;
    const d = GUARANTEED_MIN + hash01(attempt, 2, seed + 907) * (GUARANTEED_MAX - GUARANTEED_MIN);
    const cx = Math.round(Math.cos(a) * d);
    const cy = Math.round(Math.sin(a) * d);
    if (Math.hypot(cx, cy) < GUARANTEED_MIN || Math.hypot(cx, cy) > GUARANTEED_MAX) continue;
    if (fits(world, blocked, wrecks, cx - 1, cy - 1)) {
      add(world, wrecks, cx - 1, cy - 1, GUARANTEED_CORES);
      return;
    }
  }
  for (let cy = -GUARANTEED_MAX; cy <= GUARANTEED_MAX; cy++) {
    for (let cx = -GUARANTEED_MAX; cx <= GUARANTEED_MAX; cx++) {
      const dist = Math.hypot(cx, cy);
      if (dist < GUARANTEED_MIN || dist > GUARANTEED_MAX) continue;
      if (!fits(world, blocked, wrecks, cx - 1, cy - 1)) continue;
      add(world, wrecks, cx - 1, cy - 1, GUARANTEED_CORES);
      return;
    }
  }
}

/** Les emplacements possibles d'une épave rare dans un bloc, à 60 cases au moins du départ. */
function rareSpots(world: World, blocked: ReadonlySet<number>, wrecks: readonly Wreck[], cx: number, cy: number): { x: number; y: number }[] {
  world.chunk(cx, cy);
  const x0 = cx * CHUNK;
  const y0 = cy * CHUNK;
  const out: { x: number; y: number }[] = [];
  for (let ly = 0; ly < CHUNK - 1; ly++) {
    for (let lx = 0; lx < CHUNK - 1; lx++) {
      const x = x0 + lx;
      const y = y0 + ly;
      if (Math.hypot(x + 1, y + 1) < RARE_MIN_DIST) continue;
      if (!fits(world, blocked, wrecks, x, y)) continue;
      out.push({ x, y });
    }
  }
  return out;
}

/** Les épaves rares : dans le carré de la faune, une par bloc, dans un bloc sur six environ. */
function placeRare(world: World, seed: number, blocked: ReadonlySet<number>, wrecks: Wreck[]): void {
  for (let cy = -ZONE_RANGE; cy < ZONE_RANGE; cy++) {
    for (let cx = -ZONE_RANGE; cx < ZONE_RANGE; cx++) {
      if (hash01(cx, cy, seed + 701) >= RARE_CHANCE) continue;
      const spots = rareSpots(world, blocked, wrecks, cx, cy);
      if (spots.length === 0) continue;
      const pick = spots[Math.floor(hash01(cx, cy, seed + 705) * spots.length)];
      const cores = 1 + Math.floor(hash01(cx, cy, seed + 706) * 2);
      add(world, wrecks, pick.x, pick.y, cores);
    }
  }
}

/** Pose les épaves d'une partie neuve, après la faune : une garantie, puis les rares. */
export function placeWrecks(world: World, seed: number, beasts: readonly { x: number; y: number }[]): Wreck[] {
  const wrecks: Wreck[] = [];
  const blocked = beastCells(beasts);
  placeGuaranteed(world, seed, blocked, wrecks);
  placeRare(world, seed, blocked, wrecks);
  return wrecks;
}
