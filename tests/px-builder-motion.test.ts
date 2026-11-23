import { describe, expect, it } from 'vitest';
import {
  BUILDER_ANCHOR,
  BuilderAnimator,
  MAX_LUNGE,
  FIST_REACH,
  idlePose,
  lungeOffset,
  nextFacing,
  walkPose,
  type MotionInput,
} from '../src/render/px/builderMotion';
import { harvestContacts } from '../src/render/px/builderPose';
import type { BuilderPose } from '../src/render/px/builderTypes';

/** Les sept champs de pose communs au repos et à la marche. */
function core(p: BuilderPose): Omit<BuilderPose, 'feet'> {
  return { tx: p.tx, ty: p.ty, L: p.L, R: p.R, up: p.up, tw: p.tw, sq: p.sq };
}

/** Vérifie qu'aucune valeur d'une pose n'est `NaN` ni infinie. */
function expectFinite(p: BuilderPose): void {
  const values = [p.tx, p.ty, p.L[0], p.L[1], p.R[0], p.R[1], p.up, p.tw, p.sq];
  if (p.feet !== undefined) {
    values.push(p.feet.rearX, p.feet.rearY, p.feet.frontX, p.feet.frontY);
  }
  for (const value of values) {
    expect(Number.isFinite(value)).toBe(true);
  }
}

/** Une entrée de récolte immobile, cible à 50 px vers la droite. */
function harvestInput(fx = 1, targetDx = 50): MotionInput {
  return { walk: 0, speed: 0, fx, acting: true, targetDx, targetDy: 0 };
}

describe('walkPose', () => {
  it('à speed = 0, égale le repos et les pieds restent à zéro', () => {
    const idle = idlePose(1.234);
    const walk = walkPose(0.7, 0, 1.234);
    expect(core(walk)).toEqual(core(idle));
    expect(walk.feet).toEqual({ rearX: 0, rearY: 0, frontX: 0, frontY: 0 });
  });

  it('hors bornes ou NaN, ne produit aucun NaN', () => {
    for (const speed of [-5, 2, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expectFinite(walkPose(1.1, speed, 0.3));
    }
    expectFinite(walkPose(Number.NaN, 1, 0.3));
  });
});

describe('pieds de marche', () => {
  it('un seul pied levé à la fois, jamais sous le sol', () => {
    for (let i = 0; i < 400; i++) {
      const feet = walkPose((i / 400) * Math.PI * 4, 1, 0).feet;
      expect(feet).toBeDefined();
      if (feet === undefined) return;
      expect(feet.rearY).toBeLessThanOrEqual(0);
      expect(feet.frontY).toBeLessThanOrEqual(0);
      expect(feet.rearY < 0 && feet.frontY < 0).toBe(false);
    }
  });
});

describe('nextFacing', () => {
  it('ne clignote pas quand fx oscille dans la marge', () => {
    let facing: 1 | -1 = 1;
    for (let i = 0; i < 200; i++) {
      const fx = i % 2 === 0 ? -0.2 : 0.2;
      facing = nextFacing(facing, fx);
      expect(facing).toBe(1);
    }
    let left: 1 | -1 = -1;
    for (let i = 0; i < 200; i++) {
      left = nextFacing(left, i % 2 === 0 ? 0.2 : -0.2);
      expect(left).toBe(-1);
    }
  });

  it('bascule au-delà de la marge', () => {
    expect(nextFacing(-1, 0.3)).toBe(1);
    expect(nextFacing(1, -0.3)).toBe(-1);
    expect(nextFacing(1, 0.25)).toBe(1);
    expect(nextFacing(-1, -0.25)).toBe(-1);
  });

  it('NaN ou une entrée non finie conserve le côté', () => {
    expect(nextFacing(1, Number.NaN)).toBe(1);
    expect(nextFacing(-1, Number.NaN)).toBe(-1);
    expect(nextFacing(1, Number.POSITIVE_INFINITY)).toBe(1);
  });
});

describe('lungeOffset', () => {
  it('est nul à portée ou plus près', () => {
    expect(lungeOffset(0, 0)).toEqual({ x: 0, y: 0 });
    expect(lungeOffset(FIST_REACH, 0)).toEqual({ x: 0, y: 0 });
    expect(lungeOffset(10, 10)).toEqual({ x: 0, y: 0 });
  });

  it('plafonne à MAX_LUNGE dans la bonne direction', () => {
    expect(lungeOffset(1000, 0)).toEqual({ x: MAX_LUNGE, y: 0 });
    expect(lungeOffset(-1000, 0)).toEqual({ x: -MAX_LUNGE, y: 0 });
    const offset = lungeOffset(30, 40);
    expect(offset.x).toBeCloseTo(12, 12);
    expect(offset.y).toBeCloseTo(16, 12);
    expect(Math.hypot(offset.x, offset.y)).toBeCloseTo(MAX_LUNGE, 12);
  });

  it('annule les entrées nulles ou non finies', () => {
    expect(lungeOffset(Number.NaN, 10)).toEqual({ x: 0, y: 0 });
    expect(lungeOffset(10, Number.POSITIVE_INFINITY)).toEqual({ x: 0, y: 0 });
  });

  it('vise le milieu des pieds', () => {
    expect(BUILDER_ANCHOR).toEqual({ x: 17, y: 38 });
  });
});

describe('contacts de récolte', () => {
  it('même découpage en pas réguliers ou irréguliers, sans doublon ni manque', () => {
    const expected = harvestContacts(0, 10).map((contact) => contact.index);

    const regular = new BuilderAnimator();
    const regularFound: number[] = [];
    for (let i = 0; i < 600; i++) {
      const result = regular.step(1 / 60, harvestInput());
      for (const contact of result.contacts) regularFound.push(contact.index);
    }

    const irregular = new BuilderAnimator();
    const irregularFound: number[] = [];
    const sizes = [0.003, 0.017, 0.05, 0.0007, 0.09, 0.0043];
    let cursor = 0;
    let k = 0;
    while (cursor < 10) {
      const dt = Math.min(sizes[k % sizes.length], 10 - cursor);
      const result = irregular.step(dt, harvestInput());
      for (const contact of result.contacts) irregularFound.push(contact.index);
      cursor += dt;
      k++;
    }

    expect(regularFound).toEqual(expected);
    expect(irregularFound).toEqual(expected);
    for (let i = 1; i < regularFound.length; i++) {
      expect(regularFound[i]).toBeGreaterThan(regularFound[i - 1]);
    }
  });

  it('arrêter puis reprendre une récolte repart du coup 0', () => {
    const animator = new BuilderAnimator();
    for (let i = 0; i < 20; i++) animator.step(1 / 60, harvestInput());
    animator.step(1 / 60, { ...harvestInput(), acting: false, speed: 0, walk: 0 });
    let first = -1;
    for (let i = 0; i < 60 && first < 0; i++) {
      const result = animator.step(1 / 60, harvestInput());
      if (result.contacts.length > 0) first = result.contacts[0].index;
    }
    expect(first).toBe(0);
  });
});

describe('transition', () => {
  it('aucun saut de poing de plus de 6 pixels au changement d’état', () => {
    const animator = new BuilderAnimator();
    let previous = idlePose(0);
    for (let i = 0; i < 18; i++) {
      const result = animator.step(1 / 60, { walk: (i / 18) * Math.PI * 2, speed: 1, fx: 1, acting: false, targetDx: 0, targetDy: 0 });
      previous = result.frame.pose;
    }
    let result = animator.step(1 / 60, harvestInput());
    expect(Math.hypot(result.frame.pose.L[0] - previous.L[0], result.frame.pose.L[1] - previous.L[1])).toBeLessThan(6);
    expect(Math.hypot(result.frame.pose.R[0] - previous.R[0], result.frame.pose.R[1] - previous.R[1])).toBeLessThan(6);

    for (let i = 0; i < 30; i++) {
      result = animator.step(1 / 60, harvestInput());
      previous = result.frame.pose;
    }
    result = animator.step(1 / 60, { walk: 0.4, speed: 1, fx: 1, acting: false, targetDx: 0, targetDy: 0 });
    expect(Math.hypot(result.frame.pose.L[0] - previous.L[0], result.frame.pose.L[1] - previous.L[1])).toBeLessThan(6);
    expect(Math.hypot(result.frame.pose.R[0] - previous.R[0], result.frame.pose.R[1] - previous.R[1])).toBeLessThan(6);
  });
});

describe('entrées limites', () => {
  it('dt à 0, négatif, NaN ou infini ne produit aucun NaN ni contact', () => {
    for (const dt of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const animator = new BuilderAnimator();
      const result = animator.step(dt, harvestInput());
      expectFinite(result.frame.pose);
      expectFinite(result.frame.previous);
      expectFinite(result.frame.lagged);
      expect(result.contacts).toEqual([]);
      expect(Number.isFinite(result.offsetX)).toBe(true);
      expect(Number.isFinite(result.offsetY)).toBe(true);
    }
  });

  it('avec dt = 0, la pose reste stable', () => {
    const animator = new BuilderAnimator();
    const first = animator.step(0, { walk: 0, speed: 0, fx: 1, acting: false, targetDx: 0, targetDy: 0 });
    const second = animator.step(0, { walk: 0, speed: 0, fx: 1, acting: false, targetDx: 0, targetDy: 0 });
    expect(core(second.frame.pose)).toEqual(core(first.frame.pose));
  });
});

describe('historique et flash', () => {
  it('l’historique reste borné après 100 000 pas', () => {
    const animator = new BuilderAnimator();
    for (let i = 0; i < 100_000; i++) {
      animator.step(1 / 60, { walk: i * 0.1, speed: 1, fx: 1, acting: false, targetDx: 0, targetDy: 0 });
    }
    expect(animator.historySize).toBeLessThanOrEqual(32);
    expect(animator.historySize).toBeGreaterThan(0);
  });

  it('le flash s’allume juste après un contact et s’éteint 0,2 s plus tard', () => {
    const animator = new BuilderAnimator();
    let flashFrame = false;
    for (let i = 0; i < 120 && !flashFrame; i++) {
      const result = animator.step(1 / 60, harvestInput());
      if (result.contacts.length > 0) {
        expect(result.frame.flash).toBe(true);
        flashFrame = true;
      }
    }
    expect(flashFrame).toBe(true);
    for (let i = 0; i < 12; i++) animator.step(1 / 60, harvestInput());
    const late = animator.step(1 / 60, harvestInput());
    expect(late.frame.flash).toBe(false);
  });
});
