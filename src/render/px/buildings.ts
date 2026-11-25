/**
 * Les vrais dessins des bâtiments, ère par ère, et le choix entre ce dessin et le volume provisoire.
 * La Tour, le Puits, la Charbonnière et l'Entrepôt ont désormais leur art de la maquette.
 */
import type { BuildingDef } from '../../sim/data';
import { BUILDINGS } from '../../sim/data';
import type { Pen } from './pen';
import { build, type Light, type Sprite } from './sprite';
import { placeholderSprite } from './placeholders';
import { towerE1, towerE2 } from './artTower';
import { kilnE1, kilnE2, puitsE1, puitsE2, storeE1, storeE2 } from './artWorks';
import {
  aiguillageE1,
  aiguillageE2,
  bruleurE1,
  bruleurE2,
  scierieE1,
  scierieE2,
} from './artFirst';
import { fourE2, trieurE2 } from './artStone';
import { eraFor, type Era } from './eras';

/** Un dessin d'ère : sa hauteur au-dessus de l'emprise et sa fonction. */
export interface EraArt {
  up: number;
  draw(P: Pen, U: number, L: Light[], lit?: boolean): void;
}

/** Les bâtiments dont le foyer peut s'éteindre. */
const EXTINGUISHABLE = new Set(['bruleur', 'four', 'charbonniere']);

/** Les dessins de la maquette, Bois puis Pierre, par clé de bâtiment. */
const ARTS: Record<string, readonly [EraArt, EraArt]> = {
  tour: [
    { up: 16, draw: towerE1 },
    { up: 30, draw: towerE2 },
  ],
  puits: [
    { up: 10, draw: (P, U, L) => puitsE1(P, U, L, false, true) },
    { up: 42, draw: (P, U, L) => puitsE2(P, U, L, false, true) },
  ],
  charbonniere: [
    { up: 2, draw: kilnE1 },
    { up: 4, draw: kilnE2 },
  ],
  entrepot: [
    { up: 2, draw: storeE1 },
    { up: 20, draw: storeE2 },
  ],
  scierie: [
    { up: 18, draw: scierieE1 },
    { up: 22, draw: scierieE2 },
  ],
  bruleur: [
    { up: 10, draw: bruleurE1 },
    { up: 40, draw: bruleurE2 },
  ],
  aiguillage: [
    { up: 6, draw: aiguillageE1 },
    { up: 6, draw: aiguillageE2 },
  ],
  four: [
    { up: 44, draw: fourE2 },
    { up: 44, draw: fourE2 },
  ],
  trieur: [
    { up: 8, draw: trieurE2 },
    { up: 8, draw: trieurE2 },
  ],
};

/** Les deux dessins d'un bâtiment, Bois puis Pierre, ou `null` s'il n'en a pas encore. */
export function eraArts(key: string): readonly [EraArt, EraArt] | null {
  return ARTS[key] ?? null;
}

/** Les sprites des vrais dessins, par clé de bâtiment et ère. */
const sprites = new Map<string, Sprite>();

/** Le sprite d'un bâtiment à cette ère : son vrai dessin, sinon son volume provisoire. */
export function buildingSprite(def: BuildingDef, w: number, h: number, era: Era, lit = true): Sprite | null {
  const arts = eraArts(def.key);
  if (!arts || w !== def.w || h !== def.h) return placeholderSprite(def, w, h);
  const version = eraFor(era, 1);
  const off = !lit && EXTINGUISHABLE.has(def.key);
  const key = `${def.key}#${version}${off ? '#off' : ''}`;
  const cached = sprites.get(key);
  if (cached) return cached;
  const art = arts[version - 1];
  const sprite = build(def.w * 24, def.h * 24, art.up, (P, U, L) => art.draw(P, U, off ? [] : L, !off));
  sprites.set(key, sprite);
  return sprite;
}

/** Le dessin complet d'un bâtiment pour son ombre et son aperçu : le Puits y garde sa corde et son seau. */
export function buildingSilhouette(def: BuildingDef, w: number, h: number, era: Era): Sprite | null {
  if (def.key !== 'puits' || w !== def.w || h !== def.h) return buildingSprite(def, w, h, era);
  const version = eraFor(era, 1);
  const key = `puits#${version}#silhouette`;
  const cached = sprites.get(key);
  if (cached) return cached;
  const arts = eraArts(def.key);
  if (!arts) return buildingSprite(def, w, h, era);
  const art = arts[version - 1];
  const draw = version === 1
    ? (P: Pen, U: number, L: Light[]): void => puitsE1(P, U, L, false, false)
    : (P: Pen, U: number, L: Light[]): void => puitsE2(P, U, L, false, false);
  const sprite = build(def.w * 24, def.h * 24, art.up, draw);
  sprites.set(key, sprite);
  return sprite;
}

/** Dessine à l'avance tous les bâtiments des deux ères, allumés et éteints. */
export function prepareBuildings(): void {
  for (const def of BUILDINGS) {
    if (!eraArts(def.key)) continue;
    for (const era of [1, 2] as const) {
      buildingSprite(def, def.w, def.h, era);
      buildingSprite(def, def.w, def.h, era, false);
    }
  }
}
