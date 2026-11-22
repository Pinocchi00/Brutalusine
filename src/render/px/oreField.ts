/**
 * Le regroupement des gisements par carré de 2 × 2 cases : un seul affleurement par carré, pour que
 * les sprites de 42 à 54 pixels ne s'empilent pas illisiblement sur des cases de 24.
 * Ce module est pur : aucun canevas, aucune dépendance à `src/sim/`.
 */
import { TILE_PX } from './view';

/** Une case de gisement, en coordonnées monde. */
export interface OrePoint {
  x: number;
  y: number;
}

/** Une case d'un autre type que le premier gisement du carré. */
export interface OreOther extends OrePoint {
  type: number;
}

/** Un carré 2 × 2 qui porte un affleurement, décrit par les cases de son type principal. */
export interface OreCell {
  /** Le type du premier gisement restant du carré, lu du nord au sud puis d'ouest en est. */
  type: number;
  /** Le nombre de cases de ce type dans le carré, de 1 à 4. */
  count: number;
  /** La moyenne des (tx + 0.5) de ces cases, en cases. */
  centerX: number;
  /** Le plus grand ty de ces cases, plus un, en cases. */
  footY: number;
  /** Les cases de ce type dans le carré. */
  tiles: readonly OrePoint[];
  /** Les cases du carré d'un autre type. */
  others: readonly OreOther[];
}

/**
 * Décrit le carré 2 × 2 d'indice (cellX, cellY) : il couvre tx = 2*cellX, 2*cellX+1 et
 * ty = 2*cellY, 2*cellY+1. `read` rend 0 pour une case sans gisement visible.
 */
export function oreCell(read: (tx: number, ty: number) => number, cellX: number, cellY: number): OreCell | null {
  const x0 = cellX * 2;
  const y0 = cellY * 2;
  const t0 = read(x0, y0);
  const t1 = read(x0 + 1, y0);
  const t2 = read(x0, y0 + 1);
  const t3 = read(x0 + 1, y0 + 1);
  const primary = t0 !== 0 ? t0 : t1 !== 0 ? t1 : t2 !== 0 ? t2 : t3;
  if (primary === 0) return null;
  const types: readonly number[] = [t0, t1, t2, t3];
  const points: readonly OrePoint[] = [
    { x: x0, y: y0 },
    { x: x0 + 1, y: y0 },
    { x: x0, y: y0 + 1 },
    { x: x0 + 1, y: y0 + 1 },
  ];
  const tiles: OrePoint[] = [];
  const others: OreOther[] = [];
  for (let i = 0; i < points.length; i++) {
    const type = types[i];
    const point = points[i];
    if (type === 0) continue;
    if (type === primary) tiles.push(point);
    else others.push({ x: point.x, y: point.y, type });
  }
  let sumX = 0;
  let foot = -Infinity;
  for (const tile of tiles) {
    sumX += tile.x + 0.5;
    if (tile.y > foot) foot = tile.y;
  }
  return {
    type: primary,
    count: tiles.length,
    centerX: sumX / tiles.length,
    footY: foot + 1,
    tiles,
    others,
  };
}

/** Un tas de cailloux posé devant une roche, avec la case qu'il faut viser. */
export interface OreFront {
  X: number;
  Y: number;
  width: number;
  height: number;
  solid: ArrayLike<number>;
  tile: OrePoint;
}

/** Une roche posée dans le monde, avec son masque de pixels pleins. */
export interface PlacedOre {
  X: number;
  Y: number;
  width: number;
  height: number;
  footPx: number;
  solid: ArrayLike<number>;
  tiles: readonly OrePoint[];
  front?: readonly OreFront[];
}

/** Vrai si le pixel (x, y) d'un masque de largeur `width` et hauteur `height` est plein. */
export function maskCovers(mask: ArrayLike<number>, width: number, height: number, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= width || y >= height) return false;
  return mask[y * width + x] !== 0;
}

/** Vrai si le pixel monde (px, py) tombe sur un pixel plein de cette roche. */
export function oreSolidAt(rock: PlacedOre, px: number, py: number): boolean {
  return maskCovers(rock.solid, rock.width, rock.height, Math.floor(px) - rock.X, Math.floor(py) - rock.Y);
}

/** La roche choisie sous un pixel : la plus au sud, puis la plus à l'est. */
function chooseOreRock(rocks: readonly PlacedOre[], px: number, py: number): PlacedOre | null {
  let best: PlacedOre | null = null;
  for (const rock of rocks) {
    if (!oreSolidAt(rock, px, py)) continue;
    if (!best || rock.footPx > best.footPx || (rock.footPx === best.footPx && rock.X > best.X)) best = rock;
  }
  return best;
}

/** La case d'une roche la plus proche d'un pixel. */
function nearestOreTile(rock: PlacedOre, px: number, py: number): OrePoint | null {
  const pointX = px / TILE_PX;
  const pointY = py / TILE_PX;
  let nearest: OrePoint | null = null;
  let bestDistance = Infinity;
  for (const tile of rock.tiles) {
    const dx = tile.x + 0.5 - pointX;
    const dy = tile.y + 0.5 - pointY;
    const distance = dx * dx + dy * dy;
    if (distance < bestDistance) {
      bestDistance = distance;
      nearest = tile;
    }
  }
  return nearest;
}

/** La case d'un caillou posé devant la roche sous ce pixel, du dernier dessiné au premier, ou `null`. */
function pickFrontTile(rock: PlacedOre, px: number, py: number): OrePoint | null {
  const front = rock.front;
  if (!front) return null;
  const x = Math.floor(px);
  const y = Math.floor(py);
  for (let i = front.length - 1; i >= 0; i--) {
    const item = front[i];
    if (maskCovers(item.solid, item.width, item.height, x - item.X, y - item.Y)) return item.tile;
  }
  return null;
}

/** La case de la roche visible sous ce pixel monde : la roche au pied le plus au sud gagne, puis sa case la plus proche du point. */
export function pickOreTile(rocks: readonly PlacedOre[], px: number, py: number): OrePoint | null {
  const best = chooseOreRock(rocks, px, py);
  if (!best) return null;
  return pickFrontTile(best, px, py) ?? nearestOreTile(best, px, py);
}

/** Un objet haut qui peut cacher une roche : son pied, son X de tri et le test de ses pixels. */
export interface OreBlocker {
  footPx: number;
  x: number;
  frontOnTie: boolean;
  covers(px: number, py: number): boolean;
}

/** Vrai si ce bloqueur passe devant une roche de pied `footPx` et de X `rockX`. */
function blockerInFront(blocker: OreBlocker, footPx: number, rockX: number): boolean {
  if (blocker.footPx > footPx) return true;
  if (blocker.footPx < footPx) return false;
  if (blocker.x > rockX) return true;
  return blocker.x === rockX && blocker.frontOnTie;
}

/** Comme `pickOreTile`, mais rend `null` si un objet devant la roche choisie couvre ce pixel. */
export function pickVisibleOreTile(
  rocks: readonly PlacedOre[],
  blockers: readonly OreBlocker[],
  px: number,
  py: number,
): OrePoint | null {
  const best = chooseOreRock(rocks, px, py);
  if (!best) return null;
  for (const blocker of blockers) {
    if (blockerInFront(blocker, best.footPx, best.X) && blocker.covers(px, py)) return null;
  }
  return pickFrontTile(best, px, py) ?? nearestOreTile(best, px, py);
}

/** Vrai si la roche recouvre au moins un pixel opaque d'un débris de 24 × 24. */
export function oreCoversScrap(rock: PlacedOre, scrap: ArrayLike<number>, tx: number, ty: number): boolean {
  const baseX = tx * TILE_PX;
  const baseY = ty * TILE_PX;
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) {
      if (scrap[(y * TILE_PX + x) * 4 + 3] === 0) continue;
      if (oreSolidAt(rock, baseX + x, baseY + y)) return true;
    }
  }
  return false;
}

/** Ce qu'un clic récolte, avec la case à viser. */
export interface HarvestPick {
  kind: 'loot' | 'tree' | 'ore';
  x: number;
  y: number;
}

/** Ce que la scène offre au clic, avant de choisir. */
export interface HarvestInput {
  loot: OrePoint | null;
  entity: boolean;
  visibleOre: OrePoint | null;
  direct: HarvestPick | null;
}

/** L'ordre du clic : débris, puis entité, puis roche visible, puis la case visée. */
export function chooseHarvest(input: HarvestInput): HarvestPick | null {
  if (input.loot) return { kind: 'loot', x: input.loot.x, y: input.loot.y };
  if (input.entity) return null;
  if (input.visibleOre) return { kind: 'ore', x: input.visibleOre.x, y: input.visibleOre.y };
  return input.direct;
}

/** Le petit décalage d'un tas de cailloux, en pixels, tiré de deux hashes. */
export function rubbleOffset(h1: number, h2: number): { x: number; y: number } {
  return {
    x: Math.round((h1 - 0.5) * 10),
    y: Math.round((h2 - 0.5) * 12) - 3,
  };
}

/** La variante d'affleurement selon le nombre de cases et un tirage `h` dans [0, 1[. */
export function oreVariant(count: number, h: number): number {
  if (count <= 1) return 0;
  if (count >= 4) return h < 0.5 ? 1 : 2;
  return h < 0.5 ? 0 : 1;
}

/** Le décalage d'un affleurement, en pixels : les rangées impaires partent du côté opposé. */
export function oreOffset(cellY: number, h1: number, h2: number): { x: number; y: number } {
  const side = Math.abs(cellY) % 2 === 1 ? 6 : -6;
  return {
    x: side + Math.round((h1 - 0.5) * 12),
    y: Math.round((h2 - 0.5) * 18),
  };
}
