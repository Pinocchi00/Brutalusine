import { describe, it, expect } from 'vitest';
import { RECIPES, ITEMS, recipeBalance, FUEL, I } from '../src/sim/data';
import { parseFormula } from '../src/sim/chem';

describe('chimie', () => {
  it('analyse les formules brutes', () => {
    expect(parseFormula('Ca2SiO4')).toEqual({ Ca: 2, Si: 1, O: 4 });
    expect(parseFormula('C6H10O5')).toEqual({ C: 6, H: 10, O: 5 });
    expect(() => parseFormula('xx')).toThrow();
  });

  // La loi de conservation : aucune recette ne crée ni ne détruit un atome.
  for (const r of RECIPES) {
    it(`${r.name} est équilibrée`, () => {
      const bal = recipeBalance(r);
      for (const el in bal) expect(bal[el], `${r.key} : ${el}`).toBe(0);
    });
  }

  it('la Vertèbre est la somme exacte de ses parties', () => {
    expect(ITEMS[I.vertebre].atoms).toEqual({ Fe: 19, C: 5, Cu: 8, Si: 4, Ca: 4, O: 8 });
  });

  it('carboniser le bois fait perdre de l’énergie (comme dans la réalité)', () => {
    expect(6 * FUEL[I.carbone].energy).toBeLessThan(FUEL[I.bois].energy);
  });
});
