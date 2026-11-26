/**
 * Les vrais dessins des bâtiments, ère par ère, et le choix entre ce dessin et le volume provisoire.
 * La Tour, le Puits, la Charbonnière et l'Entrepôt ont désormais leur art de la maquette.
 */
import type { BuildingDef } from '../../sim/data';
import { BUILDINGS } from '../../sim/data';
import type { Pen } from './pen';
import { build, type Light, type Sprite } from './sprite';
import { placeholderSprite } from './placeholders';
import { towerE1, towerE2, towerE3 } from './artTower';
import { kilnE1, kilnE2, shaftE1, shaftE2, storeE1, storeE2 } from './artWorks';
import {
  splitterE1,
  splitterE2,
  burnerE1,
  burnerE2,
  sawmillE1,
  sawmillE2,
} from './artFirst';
import { clayPitE2, furnaceE2, sorterE2, tanneryE2, trapE2, waterWheelE2 } from './artStone';
import { eraFor, type Era } from './eras';

/** Un dessin d'ère : sa hauteur au-dessus de l'emprise et sa fonction. */
export interface EraArt {
  up: number;
  draw(P: Pen, U: number, L: Light[], lit?: boolean): void;
}

/** Les bâtiments dont le foyer peut s'éteindre. */
const EXTINGUISHABLE = new Set(['bruleur', 'four', 'charbonniere']);

/** Les dessins de la maquette, Bois puis Pierre, par clé de bâtiment. */
const ARTS: Record<string, readonly EraArt[]> = {
  tour: [
    { up: 16, draw: towerE1 },
    { up: 30, draw: towerE2 },
    { up: 72, draw: towerE3 },
  ],
  puits: [
    { up: 10, draw: (P, U, L) => shaftE1(P, U, L, false, true) },
    { up: 42, draw: (P, U, L) => shaftE2(P, U, L, false, true) },
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
    { up: 18, draw: sawmillE1 },
    { up: 22, draw: sawmillE2 },
  ],
  bruleur: [
    { up: 10, draw: burnerE1 },
    { up: 40, draw: burnerE2 },
  ],
  aiguillage: [
    { up: 6, draw: splitterE1 },
    { up: 6, draw: splitterE2 },
  ],
  four: [
    { up: 44, draw: furnaceE2 },
    { up: 44, draw: furnaceE2 },
  ],
  trieur: [
    { up: 8, draw: sorterE2 },
    { up: 8, draw: sorterE2 },
  ],
  piege: [
    { up: 16, draw: trapE2 },
    { up: 16, draw: trapE2 },
  ],
  tannerie: [
    { up: 20, draw: tanneryE2 },
    { up: 20, draw: tanneryE2 },
  ],
  argiliere: [
    { up: 24, draw: clayPitE2 },
    { up: 24, draw: clayPitE2 },
  ],
  roue: [
    { up: 26, draw: waterWheelE2 },
    { up: 26, draw: waterWheelE2 },
  ],
};

/** Les dessins d'un bâtiment, ère après ère, ou `null` s'il n'en a pas encore. */
export function eraArts(key: string): readonly EraArt[] | null {
  return ARTS[key] ?? null;
}

/** Les sprites des vrais dessins, par clé de bâtiment et ère. */
const sprites = new Map<string, Sprite>();

/** Le sprite d'un bâtiment à cette ère : son vrai dessin, sinon son volume provisoire. */
export function buildingSprite(def: BuildingDef, w: number, h: number, era: Era, lit = true): Sprite | null {
  const arts = eraArts(def.key);
  if (!arts || w !== def.w || h !== def.h) return placeholderSprite(def, w, h);
  const version = Math.min(eraFor(era, 1), arts.length);
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
  const version = Math.min(eraFor(era, 1), 2);
  const key = `puits#${version}#silhouette`;
  const cached = sprites.get(key);
  if (cached) return cached;
  const arts = eraArts(def.key);
  if (!arts) return buildingSprite(def, w, h, era);
  const art = arts[version - 1];
  const draw = version === 1
    ? (P: Pen, U: number, L: Light[]): void => shaftE1(P, U, L, false, false)
    : (P: Pen, U: number, L: Light[]): void => shaftE2(P, U, L, false, false);
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
    if (def.key === 'tour') {
      buildingSprite(def, def.w, def.h, 3);
      buildingSprite(def, def.w, def.h, 3, false);
    }
  }
}
