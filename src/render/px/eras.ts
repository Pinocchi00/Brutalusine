/**
 * Les ères du rendu : Bois tant qu'on ne demande pas la Pierre par l'adresse.
 * La logique est pure, sans aucune API du navigateur, donc testable sous Node.
 */

/** L'ère affichée : 1 pour le Bois, 2 pour la Pierre. */
export type Era = 1 | 2;

/** L'ère à afficher d'après l'adresse : `?ere=2` donne la Pierre, tout le reste le Bois. */
export function readEra(search: string): Era {
  const value = new URLSearchParams(search).get('ere');
  return value === '2' ? 2 : 1;
}

/** La version d'un bâtiment : l'ère courante, sans descendre sous l'ère où il apparaît. */
export function eraFor(era: Era, firstEra: Era): Era {
  return era < firstEra ? firstEra : era;
}
