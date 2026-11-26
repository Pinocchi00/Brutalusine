/**
 * Le cabiai du rendu : choix de l'image (pose, pas, tressaillement, sens) et hors-écran.
 * Tout est pur, sans navigateur.
 */
import { describe, expect, it } from 'vitest';
import { FLINCH_TICKS, beastFrame, beastVisible } from '../src/render/px/beasts';

describe('beastFrame', () => {
  it('broute sans pas de marche quand la bête broute', () => {
    const frame = beastFrame('graze', 120, 4, 1, -1);
    expect(frame.pose).toBe('graze');
    expect(frame.step).toBe(0);
    expect(frame.flinch).toBe(false);
  });

  it('alterne trois pas de marche', () => {
    const steps = new Set<number>();
    for (let tick = 0; tick < 30; tick++) steps.add(beastFrame('walk', tick, 4, 1, -1).step);
    expect([...steps].sort()).toEqual([0, 1, 2]);
  });

  it('démarre les bêtes sur des pas différents', () => {
    expect(beastFrame('walk', 0, 0, 1, -1).step).not.toBe(beastFrame('walk', 0, 1, 1, -1).step);
  });

  it('garde le sens reçu', () => {
    expect(beastFrame('walk', 0, 1, -1, -1).face).toBe(-1);
    expect(beastFrame('walk', 0, 1, 1, -1).face).toBe(1);
  });

  it('tressaille pendant douze pas après un coup', () => {
    expect(beastFrame('walk', 10, 1, 1, 0).flinch).toBe(true);
    expect(beastFrame('walk', FLINCH_TICKS - 1, 1, 1, 0).flinch).toBe(true);
    expect(beastFrame('walk', FLINCH_TICKS, 1, 1, 0).flinch).toBe(false);
  });

  it('ne tressaille jamais sans coup reçu', () => {
    for (const tick of [0, 1, 11, 100]) {
      expect(beastFrame('walk', tick, 1, 1, -1).flinch).toBe(false);
    }
  });
});

describe('beastVisible', () => {
  it('garde une bête dont le corps touche la fenêtre', () => {
    expect(beastVisible(10, 10, 8, 8, 12, 12)).toBe(true);
  });

  it('écarte une bête au-delà de la marge', () => {
    expect(beastVisible(10, 10, 12, 12, 20, 20)).toBe(false);
    expect(beastVisible(10, 10, 0, 0, 8, 8)).toBe(false);
  });
});
