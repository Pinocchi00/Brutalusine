/**
 * Le regroupement des gisements par carré de 2 × 2 cases : un seul affleurement par carré, pour que
 * les sprites de 42 à 54 pixels ne s'empilent pas illisiblement sur des cases de 24.
 * Ce module est pur : aucun canevas, aucune dépendance à `src/sim/`.
 */

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

/** La variante d'affleurement selon le nombre de cases et un tirage `h` dans [0, 1[. */
export function oreVariant(count: number, h: number): number {
  if (count <= 1) return 0;
  if (count >= 4) return h < 0.5 ? 1 : 2;
  return h < 0.5 ? 0 : 1;
}

/** Le décalage d'un affleurement, en pixels : les rangées impaires partent du côté opposé. */
export function oreOffset(cellX: number, cellY: number, h1: number, h2: number): { x: number; y: number } {
  const side = Math.abs(cellY) % 2 === 1 ? 6 : -6;
  return {
    x: side + Math.round((h1 - 0.5) * 8),
    y: Math.round((h2 - 0.5) * 6),
  };
}
