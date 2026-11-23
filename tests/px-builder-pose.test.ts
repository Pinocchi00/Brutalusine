import { describe, expect, it } from 'vitest';
import {
  COMBO,
  COMBO_HITS,
  COMBO_T,
  HARVEST_BEAT,
  HARVEST_SEQUENCE,
  MOVES,
  PACE,
  comboPose,
  harvestContacts,
  harvestPose,
} from '../src/render/px/builderPose';
import type { BuilderPose, FistPoint } from '../src/render/px/builderTypes';

// ---- L'oracle : le bloc de la maquette, recopié tel quel (docs/maquettes/heure-doree.html, lignes 638 à 667).

const sm = (u: number): number => u * u * (3 - 2 * u);
const EASE_O = { io: sm, out: (u: number): number => 1 - (1 - u) ** 3, back: (u: number): number => 1 + 2.9 * (u - 1) ** 3 + 1.9 * (u - 1) ** 2 };

type Side = 'L' | 'R';
type Fist = FistPoint | 'g';
type EaseName = 'io' | 'out' | 'back';

interface KeyO {
  u: number;
  x: number;
  y: number;
  L: Fist;
  R: Fist;
  e: EaseName;
  up: number;
  tw: number;
  sq: number;
}

interface MoveO {
  d: number;
  hit?: [number, Side, number];
  k: KeyO[];
}

const G = 'g';
const KO = (u: number, o: Partial<KeyO> = {}): KeyO => ({ u, x: 0, y: 0, L: G, R: G, e: 'io', up: 0, tw: 0, sq: 0, ...o });
const MOVES_O: Record<string, MoveO> = {
  garde: { d: 0.9, k: [KO(0), KO(1)] },
  direct: { d: 0.4, hit: [0.4, 'L', 1], k: [KO(0), KO(0.16, { x: -1, L: [27, 22], tw: -1 }), KO(0.4, { x: 2, L: [37, 21], e: 'back', tw: 1 }), KO(0.56, { x: 2, L: [36, 21], tw: 1 }), KO(1)] },
  croise: { d: 0.5, hit: [0.44, 'R', 1.4], k: [KO(0), KO(0.2, { x: -2, y: 1, R: [24, 18], tw: -1, sq: 1 }), KO(0.44, { x: 3, R: [37, 20], e: 'back', tw: 2, sq: -1 }), KO(0.6, { x: 3, R: [36, 20], tw: 2 }), KO(1)] },
  crochet: { d: 0.56, hit: [0.5, 'L', 1.8], k: [KO(0), KO(0.24, { x: -2, L: [28, 12], up: 1, tw: -1 }), KO(0.5, { x: 2, L: [36, 18], e: 'back', up: 1, tw: 2 }), KO(0.64, { x: 2, L: [35, 18], up: 1, tw: 1 }), KO(1)] },
  uppercut: { d: 0.7, hit: [0.5, 'R', 2.2], k: [KO(0), KO(0.3, { x: -1, y: 3, R: [26, 30], tw: -1, sq: 1 }), KO(0.5, { x: 3, y: -2, R: [36, 13], e: 'back', tw: 2, sq: -1 }), KO(0.66, { x: 3, y: -2, R: [35, 14], tw: 2, sq: -1 }), KO(1)] },
  esquive: { d: 0.9, k: [KO(0), KO(0.36, { x: -2, y: 3, tw: -1, sq: 1 }), KO(0.7, { x: 1, y: 2, tw: 1, sq: 1 }), KO(1)] },
  retrait: { d: 0.62, k: [KO(0), KO(0.3, { x: -3, y: 1, tw: -1, e: 'out' }), KO(1)] },
};
const COMBO_O = ['garde', 'direct', 'direct', 'croise', 'garde', 'esquive', 'crochet', 'uppercut', 'garde', 'retrait', 'croise', 'crochet', 'garde',
  'direct', 'uppercut', 'esquive', 'direct', 'croise', 'crochet', 'garde', 'garde'];
const TL_O: { m: MoveO; t0: number; d: number }[] = [];
let COMBO_T_O = 0;
for (const name of COMBO_O) {
  const m = MOVES_O[name];
  const d = m.d * PACE;
  TL_O.push({ m, t0: COMBO_T_O, d });
  COMBO_T_O += d;
}
const HITS_O: { t: number; side: Side; pow: number }[] = [];
for (const s of TL_O) {
  const hit = s.m.hit;
  if (hit) HITS_O.push({ t: s.t0 + hit[0] * s.d, side: hit[1], pow: hit[2] });
}
const GUARD_L_O: FistPoint = [32, 19];
const GUARD_R_O: FistPoint = [29, 13];
function poseAt(t: number): BuilderPose {
  const tc = ((t % COMBO_T_O) + COMBO_T_O) % COMBO_T_O;
  let s = TL_O[TL_O.length - 1];
  for (const x of TL_O) if (tc >= x.t0 && tc < x.t0 + x.d) { s = x; break; }
  const u = (tc - s.t0) / s.d;
  const k = s.m.k;
  let i = 0;
  while (i < k.length - 2 && u > k[i + 1].u) i++;
  const a = k[i];
  const b = k[i + 1];
  const e = EASE_O[b.e](Math.min(1, Math.max(0, (u - a.u) / (b.u - a.u))));
  const bounce = 0.5 + 0.5 * Math.sin((t * Math.PI * 2) / (0.7 * PACE));
  const mix = (p: number, q: number): number => p + (q - p) * e;
  const at = (key: KeyO, f: Side, gd: FistPoint): FistPoint => (key[f] === G ? [gd[0] + key.x, gd[1] + key.y + key.sq + bounce] : key[f]);
  const pa = (f: Side, gd: FistPoint): FistPoint => {
    const p = at(a, f, gd);
    const q = at(b, f, gd);
    return [mix(p[0], q[0]), mix(p[1], q[1])];
  };
  return { tx: mix(a.x, b.x), ty: mix(a.y, b.y) + bounce, L: pa('L', GUARD_L_O), R: pa('R', GUARD_R_O), up: mix(a.up, b.up), tw: mix(a.tw, b.tw), sq: mix(a.sq, b.sq) };
}

// ---- Les attentes de récolte, indépendantes du module.

const SEQUENCE_HITS: readonly { h: number; side: Side; pow: number }[] = [
  { h: 0.4, side: 'L', pow: 1 },
  { h: 0.4, side: 'L', pow: 1 },
  { h: 0.44, side: 'R', pow: 1.4 },
  { h: 0.5, side: 'L', pow: 1.8 },
  { h: 0.5, side: 'R', pow: 2.2 },
];

/** L'instant attendu du contact du coup `n`, en secondes. */
function expectedContact(n: number): number {
  const beat = SEQUENCE_HITS[n % SEQUENCE_HITS.length];
  return (n + beat.h) * HARVEST_BEAT;
}

describe('poses de l’enchaînement', () => {
  it('égale l’oracle de la maquette sur 2000 instants et deux boucles, temps négatifs compris', () => {
    expect(COMBO).toHaveLength(COMBO_O.length);
    expect(COMBO_T).toBe(COMBO_T_O);
    expect(COMBO_HITS).toEqual(HITS_O.map((hit) => ({ t: hit.t, side: hit.side, pow: hit.pow })));
    for (let i = 0; i < 2000; i++) {
      const t = -COMBO_T + (2 * COMBO_T * i) / 1999;
      expect(comboPose(t), `t = ${t}`).toEqual(poseAt(t));
    }
  });

  it('égale l’oracle à des instants négatifs choisis', () => {
    for (const t of [-0.1, -1, -COMBO_T - 0.37, -3 * COMBO_T - 2.222]) {
      expect(comboPose(t), `t = ${t}`).toEqual(poseAt(t));
    }
  });
});

describe('rythme de récolte', () => {
  it('place chaque contact dans son battement, du bon côté et à la bonne puissance', () => {
    expect(HARVEST_SEQUENCE).toEqual(['direct', 'direct', 'croise', 'crochet', 'uppercut']);
    for (let n = 0; n < 5; n++) {
      const beat = SEQUENCE_HITS[n];
      const contact = expectedContact(n);
      expect(contact).toBeGreaterThanOrEqual(n * HARVEST_BEAT);
      expect(contact).toBeLessThan((n + 1) * HARVEST_BEAT);
      const found = harvestContacts(contact - 1e-9, contact);
      expect(found).toEqual([{ t: contact, side: beat.side, pow: beat.pow, index: n }]);
    }
  });

  it('suit la séquence au fil des battements', () => {
    const found = harvestContacts(-1, 5 * HARVEST_BEAT);
    expect(found.map((contact) => contact.index)).toEqual([0, 1, 2, 3, 4]);
    expect(found.map((contact) => contact.side)).toEqual(['L', 'L', 'R', 'L', 'R']);
    expect(found.map((contact) => contact.pow)).toEqual([1, 1, 1.4, 1.8, 2.2]);
  });

  it('découper le temps en pas réguliers donne exactement le même résultat', () => {
    const whole = harvestContacts(0, 30);
    const pieces = [];
    const step = 1 / 60;
    for (let i = 0; i < 30 * 60; i++) {
      pieces.push(...harvestContacts(i * step, (i + 1) * step));
    }
    expect(pieces).toEqual(whole);
  });

  it('découper le temps en pas irréguliers donne exactement le même résultat', () => {
    const whole = harvestContacts(0, 30);
    const boundaries: number[] = [0];
    const sizes = [0.003, 0.017, 0.05, 0.0007, 0.11, 0.0043];
    let cursor = 0;
    let k = 0;
    while (cursor < 30) {
      cursor = Math.min(30, cursor + sizes[k % sizes.length]);
      boundaries.push(cursor);
      k++;
    }
    const pieces = [];
    for (let i = 0; i + 1 < boundaries.length; i++) {
      pieces.push(...harvestContacts(boundaries[i], boundaries[i + 1]));
    }
    expect(pieces).toEqual(whole);
  });

  it('ne perd ni ne compte deux fois un contact à une frontière', () => {
    const found = harvestContacts(expectedContact(7) - 1e-9, expectedContact(7));
    expect(found.map((contact) => contact.index)).toEqual([7]);
    const split = [...harvestContacts(expectedContact(7) - 1e-9, expectedContact(7)), ...harvestContacts(expectedContact(7), expectedContact(8))];
    expect(split.map((contact) => contact.index)).toEqual([7, 8]);
  });

  it('répond juste à un temps très grand sans boucler depuis zéro', () => {
    const from = 1_000_000 - 1;
    const to = 1_000_000;
    const found = harvestContacts(from, to);
    const near = Math.floor(from / HARVEST_BEAT);
    const expected = [];
    for (let n = near - 5; n <= near + 5; n++) {
      const t = expectedContact(n);
      if (t > from && t <= to) {
        const beat = SEQUENCE_HITS[n % SEQUENCE_HITS.length];
        expected.push({ t, side: beat.side, pow: beat.pow, index: n });
      }
    }
    expect(found).toEqual(expected);
    for (let i = 1; i < found.length; i++) {
      expect(found[i].index).toBeGreaterThan(found[i - 1].index);
      expect(found[i].t).toBeGreaterThan(found[i - 1].t);
    }
  });

  it('renvoie un tableau vide quand l’intervalle est vide, inversé ou non fini', () => {
    expect(harvestContacts(1, 1)).toEqual([]);
    expect(harvestContacts(2, 1)).toEqual([]);
    expect(harvestContacts(0, 0)).toEqual([]);
    for (const bad of [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NaN]) {
      expect(harvestContacts(bad, 10)).toEqual([]);
      expect(harvestContacts(0, bad)).toEqual([]);
    }
  });
});

describe('continuité des poses', () => {
  it('ne fait pas sauter un poing de plus de 1,5 pixel à une frontière de battement', () => {
    for (let n = 1; n <= 200; n++) {
      const before = harvestPose(n * HARVEST_BEAT - 1e-7);
      const after = harvestPose(n * HARVEST_BEAT + 1e-7);
      expect(Math.hypot(before.L[0] - after.L[0], before.L[1] - after.L[1])).toBeLessThan(1.5);
      expect(Math.hypot(before.R[0] - after.R[0], before.R[1] - after.R[1])).toBeLessThan(1.5);
    }
  });
});

describe('entrées limites de la récolte', () => {
  it('traite un temps nul, négatif ou non fini comme zéro', () => {
    const base = harvestPose(0);
    expect(harvestPose(-5)).toEqual(base);
    expect(harvestPose(-0.001)).toEqual(base);
    expect(harvestPose(Number.NaN)).toEqual(base);
    expect(harvestPose(Number.POSITIVE_INFINITY)).toEqual(base);
    expect(harvestPose(Number.NEGATIVE_INFINITY)).toEqual(base);
    for (const value of [base.tx, base.ty, base.up, base.tw, base.sq, base.L[0], base.L[1], base.R[0], base.R[1]]) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });

  it('commence par la garde du premier coup', () => {
    expect(MOVES.direct.k[0].L).toBe('g');
    expect(harvestPose(0)).toEqual(poseAt(0));
  });
});
