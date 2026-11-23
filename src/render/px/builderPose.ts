/**
 * Les mouvements du bâtisseur boxeur, sans canvas ni DOM : les poses de la maquette
 * et le rythme de récolte du jeu, calculés à partir du seul temps écoulé.
 */
import type { BuilderPose, FistPoint } from './builderTypes';
import { EASE } from './noise';

/** Le monde vit deux fois plus vite que l'horloge : vif, mais lisible. */
export const PACE = 2;

/** Les sept mouvements de la maquette. */
export type MoveName = 'garde' | 'direct' | 'croise' | 'crochet' | 'uppercut' | 'esquive' | 'retrait';

/** Les courbes qui mènent d'une clé à la suivante. */
type EaseName = 'io' | 'out' | 'back';

/** Un poing : sa position, ou la garde (`'g'`) qui suit la coque. */
type Fist = FistPoint | 'g';

/** La position de garde dans la maquette. */
const GUARD = 'g' as const;

/** Une clé de pose : les valeurs de la maquette, `u` étant sa place dans le mouvement. */
export interface MoveKey {
  readonly u: number;
  readonly x: number;
  readonly y: number;
  readonly L: Fist;
  readonly R: Fist;
  readonly e: EaseName;
  readonly up: number;
  readonly tw: number;
  readonly sq: number;
}

/** Un mouvement : sa durée, son éventuel coup, et ses clés de pose. */
export interface Move {
  readonly d: number;
  readonly hit?: readonly [number, 'L' | 'R', number];
  readonly k: readonly MoveKey[];
}

/** Un coup de l'enchaînement : son instant, son côté et sa puissance. */
export interface ComboHit {
  readonly t: number;
  readonly side: 'L' | 'R';
  readonly pow: number;
}

/** Un contact de récolte, avec son numéro de coup depuis 0 et son instant en secondes. */
export interface HarvestContact {
  readonly t: number;
  readonly side: 'L' | 'R';
  readonly pow: number;
  readonly index: number;
}

/** Construit une clé en complétant les valeurs par défaut de la maquette. */
function mk(u: number, o: Partial<Omit<MoveKey, 'u'>> = {}): MoveKey {
  return {
    u,
    x: o.x ?? 0,
    y: o.y ?? 0,
    L: o.L ?? GUARD,
    R: o.R ?? GUARD,
    e: o.e ?? 'io',
    up: o.up ?? 0,
    tw: o.tw ?? 0,
    sq: o.sq ?? 0,
  };
}

/** Les sept mouvements de la maquette, valeurs identiques. */
export const MOVES: Readonly<Record<MoveName, Move>> = {
  garde: { d: 0.9, k: [mk(0), mk(1)] },
  direct: {
    d: 0.4,
    hit: [0.4, 'L', 1],
    k: [
      mk(0),
      mk(0.16, { x: -1, L: [27, 22], tw: -1 }),
      mk(0.4, { x: 2, L: [37, 21], e: 'back', tw: 1 }),
      mk(0.56, { x: 2, L: [36, 21], tw: 1 }),
      mk(1),
    ],
  },
  croise: {
    d: 0.5,
    hit: [0.44, 'R', 1.4],
    k: [
      mk(0),
      mk(0.2, { x: -2, y: 1, R: [24, 18], tw: -1, sq: 1 }),
      mk(0.44, { x: 3, R: [37, 20], e: 'back', tw: 2, sq: -1 }),
      mk(0.6, { x: 3, R: [36, 20], tw: 2 }),
      mk(1),
    ],
  },
  crochet: {
    d: 0.56,
    hit: [0.5, 'L', 1.8],
    k: [
      mk(0),
      mk(0.24, { x: -2, L: [28, 12], up: 1, tw: -1 }),
      mk(0.5, { x: 2, L: [36, 18], e: 'back', up: 1, tw: 2 }),
      mk(0.64, { x: 2, L: [35, 18], up: 1, tw: 1 }),
      mk(1),
    ],
  },
  uppercut: {
    d: 0.7,
    hit: [0.5, 'R', 2.2],
    k: [
      mk(0),
      mk(0.3, { x: -1, y: 3, R: [26, 30], tw: -1, sq: 1 }),
      mk(0.5, { x: 3, y: -2, R: [36, 13], e: 'back', tw: 2, sq: -1 }),
      mk(0.66, { x: 3, y: -2, R: [35, 14], tw: 2, sq: -1 }),
      mk(1),
    ],
  },
  esquive: {
    d: 0.9,
    k: [mk(0), mk(0.36, { x: -2, y: 3, tw: -1, sq: 1 }), mk(0.7, { x: 1, y: 2, tw: 1, sq: 1 }), mk(1)],
  },
  retrait: { d: 0.62, k: [mk(0), mk(0.3, { x: -3, y: 1, tw: -1, e: 'out' }), mk(1)] },
};

/** L'enchaînement de la maquette, dans le même ordre. */
export const COMBO: readonly MoveName[] = [
  'garde', 'direct', 'direct', 'croise', 'garde', 'esquive', 'crochet', 'uppercut', 'garde', 'retrait',
  'croise', 'crochet', 'garde', 'direct', 'uppercut', 'esquive', 'direct', 'croise', 'crochet', 'garde', 'garde',
];

/** Une tranche de l'enchaînement : son mouvement, son début et sa durée. */
interface Timeline {
  readonly move: Move;
  readonly t0: number;
  readonly d: number;
}

/** Les tranches de l'enchaînement, mises bout à bout. */
const TL: readonly Timeline[] = (() => {
  const list: Timeline[] = [];
  let t0 = 0;
  for (const name of COMBO) {
    const move = MOVES[name];
    const d = move.d * PACE;
    list.push({ move, t0, d });
    t0 += d;
  }
  return list;
})();

/** La durée de l'enchaînement, en temps de maquette (somme des d × PACE). */
export const COMBO_T = TL.reduce((total, slice) => total + slice.d, 0);

/** Les coups de l'enchaînement : instant, côté et puissance. */
export const COMBO_HITS: readonly ComboHit[] = TL.flatMap((slice) => {
  const hit = slice.move.hit;
  if (hit === undefined) return [];
  return [{ t: slice.t0 + hit[0] * slice.d, side: hit[1], pow: hit[2] }];
});

/** La garde du poing avant et du poing arrière. */
const GUARD_L: FistPoint = [32, 19];
const GUARD_R: FistPoint = [29, 13];

/** Le sautillement du boxeur, sous tout le reste. */
function bounceAt(t: number): number {
  return 0.5 + 0.5 * Math.sin((t * Math.PI * 2) / (0.7 * PACE));
}

/** Calcule une pose à partir d'un mouvement, de sa progression et de l'instant. */
function poseFrom(move: Move, u: number, t: number): BuilderPose {
  const k = move.k;
  let i = 0;
  while (i < k.length - 2 && u > k[i + 1].u) i++;
  const a = k[i];
  const b = k[i + 1];
  const e = EASE[b.e](Math.min(1, Math.max(0, (u - a.u) / (b.u - a.u))));
  const bounce = bounceAt(t);

  const mix = (p: number, q: number): number => p + (q - p) * e;
  const at = (key: MoveKey, fist: 'L' | 'R', guard: FistPoint): FistPoint => {
    const point = key[fist];
    if (point !== GUARD) return point;
    return [guard[0] + key.x, guard[1] + key.y + key.sq + bounce];
  };
  const fist = (which: 'L' | 'R', guard: FistPoint): FistPoint => {
    const p = at(a, which, guard);
    const q = at(b, which, guard);
    return [mix(p[0], q[0]), mix(p[1], q[1])];
  };

  return {
    tx: mix(a.x, b.x),
    ty: mix(a.y, b.y) + bounce,
    L: fist('L', GUARD_L),
    R: fist('R', GUARD_R),
    up: mix(a.up, b.up),
    tw: mix(a.tw, b.tw),
    sq: mix(a.sq, b.sq),
  };
}

/** La pose de l'enchaînement à l'instant t (temps de maquette) : identique à poseAt. */
export function comboPose(t: number): BuilderPose {
  const tc = ((t % COMBO_T) + COMBO_T) % COMBO_T;
  let slice = TL[TL.length - 1];
  for (const candidate of TL) {
    if (tc >= candidate.t0 && tc < candidate.t0 + candidate.d) {
      slice = candidate;
      break;
    }
  }
  const u = (tc - slice.t0) / slice.d;
  return poseFrom(slice.move, u, t);
}

/** La période d'un coup de récolte dans le jeu, en secondes. */
export const HARVEST_BEAT = 0.29;

/** L'ordre des coups pendant la récolte. */
export const HARVEST_SEQUENCE: readonly MoveName[] = ['direct', 'direct', 'croise', 'crochet', 'uppercut'];

/** Un mouvement de récolte, accompagné de son contact obligatoire. */
interface HarvestMove {
  readonly move: Move;
  readonly hit: readonly [number, 'L' | 'R', number];
}

/** Lit le contact d'un mouvement de récolte, en refusant un mouvement sans coup. */
function harvestMove(name: MoveName): HarvestMove {
  const move = MOVES[name];
  const hit = move.hit;
  if (hit === undefined) {
    throw new Error(`Le mouvement « ${name} » n’a pas de contact de récolte.`);
  }
  return { move, hit };
}

/** Les mouvements de récolte, dans l'ordre de la séquence. */
const HARVEST_MOVES: readonly HarvestMove[] = HARVEST_SEQUENCE.map(harvestMove);

/** L'instant du contact du coup numéro n, en secondes. */
function contactTime(n: number): number {
  const { hit } = HARVEST_MOVES[n % HARVEST_MOVES.length];
  return (n + hit[0]) * HARVEST_BEAT;
}

/** Le plus petit numéro de coup dont le contact est strictement après `time`. */
function firstIndexAfter(time: number): number {
  if (contactTime(0) > time) return 0;
  let lo = 0;
  let hi = Math.max(1, Math.floor(time / HARVEST_BEAT) + 2);
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (contactTime(mid) > time) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

/** La pose de récolte après `elapsed` secondes d'action (elapsed >= 0). */
export function harvestPose(elapsed: number): BuilderPose {
  const seconds = Number.isFinite(elapsed) && elapsed > 0 ? elapsed : 0;
  const n = Math.floor(seconds / HARVEST_BEAT);
  const { move } = HARVEST_MOVES[n % HARVEST_MOVES.length];
  const u = seconds / HARVEST_BEAT - n;
  return poseFrom(move, u, seconds * PACE);
}

/** Les contacts dont l'instant est dans l'intervalle ]from, to], du plus ancien au plus récent. */
export function harvestContacts(from: number, to: number): readonly HarvestContact[] {
  if (!Number.isFinite(from) || !Number.isFinite(to)) return [];
  if (!(to > from)) return [];
  const first = firstIndexAfter(from);
  const last = firstIndexAfter(to) - 1;
  const contacts: HarvestContact[] = [];
  for (let n = first; n <= last; n++) {
    const { hit } = HARVEST_MOVES[n % HARVEST_MOVES.length];
    contacts.push({ t: contactTime(n), side: hit[1], pow: hit[2], index: n });
  }
  return contacts;
}
