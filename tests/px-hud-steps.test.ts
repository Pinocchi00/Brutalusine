/**
 * Vérifie le libellé du pli des étapes du HUD pixel : l'étape en cours, la dernière et le cas
 * où plus rien n'attend, y compris un quota sans étape.
 */
import { describe, expect, it } from 'vitest';
import { stepsToggleLabel } from '../src/ui/px/stepsLabel';

describe('libellé du pli des étapes', () => {
  it('annonce la première étape', () => {
    expect(stepsToggleLabel(0, 4)).toBe('Étape 1 / 4');
  });

  it('annonce la dernière étape', () => {
    expect(stepsToggleLabel(3, 4)).toBe('Étape 4 / 4');
  });

  it('annonce la fin quand aucune étape ne reste', () => {
    expect(stepsToggleLabel(-1, 4)).toBe('Étapes faites');
  });

  it('annonce la fin quand le rang dépasse le total', () => {
    expect(stepsToggleLabel(4, 4)).toBe('Étapes faites');
  });

  it('annonce la fin quand le rang est négatif', () => {
    expect(stepsToggleLabel(-2, 4)).toBe('Étapes faites');
  });

  it('gère une seule étape', () => {
    expect(stepsToggleLabel(0, 1)).toBe('Étape 1 / 1');
  });

  it('gère un quota sans étape', () => {
    expect(stepsToggleLabel(0, 0)).toBe('Étapes faites');
    expect(stepsToggleLabel(-1, 0)).toBe('Étapes faites');
  });
});
