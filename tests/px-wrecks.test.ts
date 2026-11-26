/**
 * Les épaves : lueur tant qu'elles gardent des noyaux, et hors-écran.
 * Tout est pur, sans navigateur.
 */
import { describe, expect, it } from 'vitest';
import { wreckLit, wreckVisible } from '../src/render/px/wrecks';

describe('wreckLit', () => {
  it('éclaire une épave intacte qui a des noyaux', () => {
    expect(wreckLit({ searched: false, cores: 4 })).toBe(true);
    expect(wreckLit({ searched: false, cores: 1 })).toBe(true);
  });

  it('éteint une épave fouillée', () => {
    expect(wreckLit({ searched: true, cores: 4 })).toBe(false);
  });

  it('éteint une épave vide', () => {
    expect(wreckLit({ searched: false, cores: 0 })).toBe(false);
  });
});

describe('wreckVisible', () => {
  it('garde une épave qui touche la fenêtre', () => {
    expect(wreckVisible(10, 10, 9, 9, 14, 14)).toBe(true);
  });

  it('écarte une épave entièrement dehors', () => {
    expect(wreckVisible(10, 10, 12, 12, 20, 20)).toBe(false);
    expect(wreckVisible(10, 10, 0, 0, 8, 8)).toBe(false);
  });
});
