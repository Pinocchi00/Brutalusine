/**
 * L'animateur du bâtisseur : repos, marche, élan et récolte, sans canvas ni DOM.
 * Les poses viennent de `builderPose` ; ici on ne calcule que le temps, les pieds et l'historique.
 */
import type { BuilderFeet, BuilderFrame, BuilderPose } from './builderTypes';
import type { HarvestContact } from './builderPose';
import { GUARD_L, GUARD_R, harvestContacts, harvestPose } from './builderPose';

/** Le point du dessin posé sur la position du joueur : le milieu des pieds. */
export const BUILDER_ANCHOR = { x: 17, y: 38 } as const;

/** La portée du poing depuis le milieu du corps, en pixels. */
export const FIST_REACH = 24;

/** Le pas d'élan maximal, en pixels. */
export const MAX_LUNGE = 26;

/** La période du va-et-vient du repos, en secondes. */
const IDLE_PERIOD = 1.6;

/** La durée du fondu entre deux états, en secondes. */
const TRANSITION = 0.1;

/** La durée d'allumage des antennes après un contact, en secondes. */
const FLASH_TIME = 0.15;

/** L'âge des poses conservées pour la traînée et le retard des antennes, en secondes. */
const PREVIOUS_AGE = 0.05;
const LAGGED_AGE = 0.175;

/** Le nombre maximal de poses gardées dans l'historique (couvre le retard à 240 images par seconde). */
const HISTORY_SIZE = 64;

/** Borne une valeur finie dans un intervalle, en traitant l'infini et `NaN` comme zéro. */
function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/** La pose de repos à l'instant `time` (secondes). */
export function idlePose(time: number): BuilderPose {
  const t = Number.isFinite(time) ? time : 0;
  const b = 0.5 + 0.5 * Math.sin((t * Math.PI * 2) / IDLE_PERIOD);
  return {
    tx: 0,
    ty: b,
    L: [GUARD_L[0], GUARD_L[1] + b],
    R: [GUARD_R[0], GUARD_R[1] + b],
    up: 0,
    tw: 0,
    sq: 0,
  };
}

/** Les pieds d'une marche à une phase donnée, avant mélange. */
function walkFeet(phase: number): BuilderFeet {
  const c = Math.cos(phase);
  const n = Math.sin(phase);
  return {
    rearX: 3 * c,
    rearY: -2 * Math.max(0, n),
    frontX: -3 * c,
    frontY: -2 * Math.max(0, -n),
  };
}

/** La pose de marche : `phase` est la phase du joueur, `speed` va de 0 (repos) à 1. */
export function walkPose(phase: number, speed: number, time: number): BuilderPose {
  const p = Number.isFinite(phase) ? phase : 0;
  const s = clamp(speed, 0, 1);
  const c = Math.cos(p);
  const ty = 0.5 + 0.5 * Math.cos(2 * p);
  const rest = idlePose(time);
  const target = {
    tx: 1,
    ty,
    L: [30 + 2 * c, 20 + ty] as const,
    R: [27 - 2 * c, 15 + ty] as const,
    up: 0,
    tw: 1,
    sq: 0,
    feet: walkFeet(p),
  };
  const mix = (a: number, b: number): number => a + (b - a) * s;
  return {
    tx: mix(rest.tx, target.tx),
    ty: mix(rest.ty, target.ty),
    L: [mix(rest.L[0], target.L[0]), mix(rest.L[1], target.L[1])],
    R: [mix(rest.R[0], target.R[0]), mix(rest.R[1], target.R[1])],
    up: mix(rest.up, target.up),
    tw: mix(rest.tw, target.tw),
    sq: mix(rest.sq, target.sq),
    feet: {
      rearX: mix(0, target.feet.rearX),
      rearY: mix(0, target.feet.rearY),
      frontX: mix(0, target.feet.frontX),
      frontY: mix(0, target.feet.frontY),
    },
  };
}

/** Le côté regardé (1 droite, -1 gauche), avec une marge pour ne pas clignoter. */
export function nextFacing(current: 1 | -1, fx: number): 1 | -1 {
  if (!Number.isFinite(fx)) return current;
  if (fx > 0.25) return 1;
  if (fx < -0.25) return -1;
  return current;
}

/** Le pas d'élan en pixels vers une cible située à (dx, dy) pixels du corps. */
export function lungeOffset(dx: number, dy: number): { readonly x: number; readonly y: number } {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return { x: 0, y: 0 };
  const d = Math.hypot(dx, dy);
  if (d === 0) return { x: 0, y: 0 };
  const step = Math.min(MAX_LUNGE, Math.max(0, d - FIST_REACH));
  return { x: (dx / d) * step, y: (dy / d) * step };
}

/** Mélange linéairement deux poses, pieds compris (`undefined` valant zéro). */
function mixPose(a: BuilderPose, b: BuilderPose, f: number): BuilderPose {
  const m = (p: number, q: number): number => p + (q - p) * f;
  return {
    tx: m(a.tx, b.tx),
    ty: m(a.ty, b.ty),
    L: [m(a.L[0], b.L[0]), m(a.L[1], b.L[1])],
    R: [m(a.R[0], b.R[0]), m(a.R[1], b.R[1])],
    up: m(a.up, b.up),
    tw: m(a.tw, b.tw),
    sq: m(a.sq, b.sq),
    feet: {
      rearX: m(a.feet?.rearX ?? 0, b.feet?.rearX ?? 0),
      rearY: m(a.feet?.rearY ?? 0, b.feet?.rearY ?? 0),
      frontX: m(a.feet?.frontX ?? 0, b.feet?.frontX ?? 0),
      frontY: m(a.feet?.frontY ?? 0, b.feet?.frontY ?? 0),
    },
  };
}

/** Une pose affichée et l'instant de l'horloge où elle l'a été. */
interface HistoryEntry {
  readonly t: number;
  readonly pose: BuilderPose;
}

/** Ce qu'il faut savoir du joueur pour animer le bâtisseur à un pas donné. */
export interface MotionInput {
  /** La phase de marche du joueur. */
  readonly walk: number;
  /** La vitesse de marche, de 0 à 1. */
  readonly speed: number;
  /** La direction du regard, composante x. */
  readonly fx: number;
  /** Vrai pendant une récolte. */
  readonly acting: boolean;
  /** La cible de la récolte, en pixels depuis le corps. */
  readonly targetDx: number;
  /** La cible de la récolte, en pixels depuis le corps. */
  readonly targetDy: number;
}

/** L'image et les événements d'un pas d'animation. */
export interface MotionResult {
  /** L'image à dessiner. */
  readonly frame: BuilderFrame;
  /** Le côté regardé. */
  readonly facing: 1 | -1;
  /** Le pas d'élan courant vers la droite, en pixels entiers. */
  readonly offsetX: number;
  /** Le pas d'élan courant vers le bas, en pixels entiers. */
  readonly offsetY: number;
  /** Les coups portés pendant ce pas. */
  readonly contacts: readonly HarvestContact[];
}

/** L'animation d'un bâtisseur : une instance par joueur. */
export class BuilderAnimator {
  private clock = 0;
  private elapsed = 0;
  private acting = false;
  private facing: 1 | -1 = 1;
  private offsetX = 0;
  private offsetY = 0;
  private flashUntil = 0;
  private blendT = TRANSITION;
  private fromPose: BuilderPose;
  private display: BuilderPose;
  private readonly history: HistoryEntry[];

  /** Crée l'animateur au repos, à l'instant zéro. */
  constructor() {
    this.fromPose = idlePose(0);
    this.display = this.fromPose;
    this.history = [{ t: 0, pose: this.display }];
  }

  /** Le nombre de poses conservées dans l'historique (au plus 64). */
  get historySize(): number {
    return this.history.length;
  }

  /** Fait avancer l'animation d'un pas `dt` et rend l'image correspondante. */
  step(dt: number, input: MotionInput): MotionResult {
    const d = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.1) : 0;
    this.clock += d;

    const changed = input.acting !== this.acting;
    this.acting = input.acting;

    let raw: BuilderPose;
    let contacts: readonly HarvestContact[] = [];
    if (input.acting) {
      const before = this.elapsed;
      this.elapsed += d;
      if (d > 0) contacts = harvestContacts(before, this.elapsed);
      if (contacts.length > 0) this.flashUntil = this.clock + FLASH_TIME;
      raw = harvestPose(this.elapsed);
    } else {
      this.elapsed = 0;
      raw = walkPose(input.walk, input.speed, this.clock);
    }

    if (changed) {
      this.fromPose = this.display;
      this.blendT = 0;
    }
    this.blendT = Math.min(TRANSITION, this.blendT + d);
    const f = this.blendT / TRANSITION;
    const pose = f >= 1 ? raw : mixPose(this.fromPose, raw, f);
    this.display = pose;

    const target = input.acting ? lungeOffset(input.targetDx, input.targetDy) : { x: 0, y: 0 };
    const approach = Math.min(1, d * 16);
    this.offsetX += (target.x - this.offsetX) * approach;
    this.offsetY += (target.y - this.offsetY) * approach;

    if (d > 0) {
      this.history.push({ t: this.clock, pose });
      if (this.history.length > HISTORY_SIZE) this.history.shift();
    }

    this.facing = nextFacing(this.facing, input.fx);

    const frame: BuilderFrame = {
      pose,
      previous: this.poseBack(PREVIOUS_AGE),
      lagged: this.poseBack(LAGGED_AGE),
      flash: this.clock < this.flashUntil,
    };
    return {
      frame,
      facing: this.facing,
      offsetX: Math.round(this.offsetX),
      offsetY: Math.round(this.offsetY),
      contacts,
    };
  }

  /** La pose affichée il y a `seconds` secondes, ou la plus ancienne connue. */
  private poseBack(seconds: number): BuilderPose {
    const target = this.clock - seconds + 1e-9;
    let best = this.history[0];
    for (const entry of this.history) {
      if (entry.t <= target) best = entry;
      else break;
    }
    return best.pose;
  }
}
