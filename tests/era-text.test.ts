/**
 * Vérifie les textes des livraisons : l'étiquette de l'ère en cours, la bannière d'une Tour refaite
 * et le prix lisible d'une liste d'objets.
 */
import { describe, expect, it } from 'vitest';
import { bannerTitle, costText, deliveryLabel } from '../src/ui/eraText';
import { I } from '../src/sim/data';

describe('deliveryLabel', () => {
  it('nomme la première livraison du Bois', () => {
    expect(deliveryLabel(0)).toBe('Ère Bois · Livraison 1 / 3');
  });

  it('nomme la troisième livraison du Bois', () => {
    expect(deliveryLabel(2)).toBe('Ère Bois · Livraison 3 / 3');
  });

  it('passe à l’ère de la Pierre à la quatrième livraison', () => {
    expect(deliveryLabel(3)).toBe('Ère Pierre · Livraison 1 / 3');
  });

  it('annonce la fin de la démo au-delà des livraisons connues', () => {
    expect(deliveryLabel(6)).toBe('Fin de la démo');
  });

  it('traite une livraison négative comme la fin', () => {
    expect(deliveryLabel(-1)).toBe('Fin de la démo');
  });
});

describe('bannerTitle', () => {
  it('reste neutre pour une livraison qui ne refait pas la Tour', () => {
    expect(bannerTitle(0)).toBe('Livraison accomplie');
  });

  it('annonce la Tour de pierre après la troisième livraison', () => {
    expect(bannerTitle(2)).toBe('La Tour passe à l’ère de la Pierre');
  });

  it('annonce la Tour de brique après la sixième livraison', () => {
    expect(bannerTitle(5)).toBe('La Tour passe à l’ère de la Brique');
  });

  it('reste neutre au-delà des livraisons connues', () => {
    expect(bannerTitle(6)).toBe('Livraison accomplie');
  });
});

describe('costText', () => {
  it('dit gratuit quand la liste est vide', () => {
    expect(costText([])).toBe('gratuit');
  });

  it('écrit une matière et sa quantité', () => {
    expect(costText([[I.pierre, 8]])).toBe('8 Pierre');
  });

  it('sépare plusieurs matières par un point médian', () => {
    expect(costText([[I.pierre, 8], [I.bois, 2]])).toBe('8 Pierre · 2 Bois');
  });
});
