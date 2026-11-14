// Entité : un bâtiment posé sur la grille. Une seule forme d'objet pour toutes les sortes
// (les champs inutilisés restent à leur valeur par défaut) : simple, rapide, sérialisable.

import type { BuildingDef, Dir, Recipe } from './data';
import { NO_TARGET, type BeltPath, type Target } from './belts';

export enum Status { Idle, Working, NoInput, Blocked, NoPower, NoResource, NoRecipe, Dark, NoGas }

export class Ent {
  dead = false;
  // convoyeurs et ponts
  path: BeltPath | null = null;
  pidx = 0;
  next: Ent | null = null;
  feeder: Ent | null = null;
  nfeed = 0;
  feedDir = -1;
  inDir = 0;
  isOut = false;
  pair: Ent | null = null;
  saved: number[] | null = null;
  // aiguillage
  held = -1;
  rr = 0;
  filter = -1;
  outs: Target[] = [];
  // machines
  recipe: Recipe | null = null;
  buf: Int32Array | null = null;     // entrées
  out: Int32Array | null = null;     // sorties
  outCount = 0;
  progress = 0;
  working = false;
  status: Status = Status.Idle;
  missing = -1;                      // objet manquant (si NoInput)
  outT: Target = NO_TARGET;
  outRR = 0;
  // énergie
  region = 0;
  energy = 0;                        // combustible entamé (générateur) ou charge (accumulateur), en J
  flow = 0;                          // W produits (+) ou absorbés (-) au dernier pas
  light = 1;                         // éclairement (héliostat)
  // divers
  cells: number[] | null = null;     // cases exploitables (puits)
  ptr = 0;
  health = 1;                        // santé de la jungle alentour (éventail, cerclage)
  gas = 0;                           // SO₂ capté (épurateur)
  level = 0;                         // étages gagnés (Tour)
  anim = 0;                          // phase d'animation (rendu)
  done = 0;                          // cycles terminés (statistiques, rendu)

  constructor(
    public id: number, public def: BuildingDef, public x: number, public y: number,
    public rot: Dir, public w: number, public h: number,
  ) {}

  get cx(): number { return this.x + this.w / 2; }
  get cy(): number { return this.y + this.h / 2; }
  /** Hauteur effective (la Tour grandit). */
  get height(): number { return this.def.kind === 'hub' ? this.def.height + this.level * 0.7 : this.def.height; }
}

export const STATUS_TEXT: Record<number, string> = {
  [Status.Idle]: 'En attente',
  [Status.Working]: 'En marche',
  [Status.NoInput]: 'Il manque',
  [Status.Blocked]: 'Sortie bloquée : relie sa flèche à un convoyeur qui avance',
  [Status.NoPower]: 'Pas de courant : construis une source d’énergie',
  [Status.NoResource]: 'Plus rien à extraire à portée',
  [Status.NoRecipe]: 'Aucune recette choisie',
  [Status.Dark]: 'Attend la lumière du jour',
  [Status.NoGas]: 'Aucun SO₂ à capter : il faut une Fonderie de cuivre à moins de 8 cases',
};
