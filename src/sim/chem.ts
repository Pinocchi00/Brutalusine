// Chimie : toutes les recettes du jeu sont de vraies équations équilibrées.
// Un « objet » du jeu = une unité de formule (une mole, à l'échelle près).

export type Atoms = Record<string, number>;

/** Analyse une formule brute simple, ex. "Ca2SiO4" -> { Ca: 2, Si: 1, O: 4 }. */
export function parseFormula(formula: string): Atoms {
  const atoms: Atoms = {};
  const re = /([A-Z][a-z]?)(\d*)/g;
  let m: RegExpExecArray | null;
  let consumed = 0;
  while ((m = re.exec(formula)) !== null) {
    if (m[0].length === 0) break;
    atoms[m[1]] = (atoms[m[1]] ?? 0) + (m[2] ? parseInt(m[2], 10) : 1);
    consumed += m[0].length;
  }
  if (consumed !== formula.length) throw new Error(`Formule invalide : ${formula}`);
  return atoms;
}

export function addAtoms(into: Atoms, a: Atoms, k = 1): Atoms {
  for (const el in a) into[el] = (into[el] ?? 0) + a[el] * k;
  return into;
}

/** Rend une formule avec indices typographiques : Fe2O3 -> Fe₂O₃. */
export function prettyFormula(formula: string): string {
  return formula.replace(/\d/g, (d) => '₀₁₂₃₄₅₆₇₈₉'[+d]);
}
