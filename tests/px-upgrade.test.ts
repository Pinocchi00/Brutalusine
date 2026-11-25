/**
 * L'animation d'amélioration du rendu pixel : la courbe de tassement et de rebond,
 * pure et testable sans navigateur.
 */
import { describe, expect, it } from 'vitest';
import { upgradeSquash } from '../src/render/px/renderer';

describe('upgradeSquash', () => {
  it('donne les repères de la courbe', () => {
    expect(upgradeSquash(0)).toBe(1);
    expect(upgradeSquash(12)).toBe(0.82);
    expect(upgradeSquash(30)).toBe(1.08);
    expect(upgradeSquash(48)).toBe(1);
    expect(upgradeSquash(100)).toBe(1);
    expect(upgradeSquash(-5)).toBe(1);
  });

  it('ne sort jamais de [0,82 ; 1,08]', () => {
    for (let since = -10; since <= 60; since += 0.25) {
      const scale = upgradeSquash(since);
      expect(scale).toBeGreaterThanOrEqual(0.82);
      expect(scale).toBeLessThanOrEqual(1.08);
    }
  });

  it('se tasse avant de rebondir', () => {
    expect(upgradeSquash(6)).toBeLessThan(1);
    expect(upgradeSquash(27)).toBeGreaterThan(1);
  });
});
