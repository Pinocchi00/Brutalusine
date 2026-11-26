/**
 * Les ères du rendu : la version de chaque chose, et celle qu'on force par l'adresse.
 * La logique est pure, sans aucune API du navigateur, donc testable sous Node.
 */

/** L'ère affichée : 1 pour le Bois, 2 pour la Pierre, 3 pour la Brique. */
export type Era = 1 | 2 | 3;

/** L'ère forcée par l'adresse : `?ere=1`, `?ere=2` ou `?ere=3`, sinon aucune. */
export function forcedEra(search: string): Era | null {
  const value = new URLSearchParams(search).get('ere');
  if (value === '1') return 1;
  if (value === '2') return 2;
  if (value === '3') return 3;
  return null;
}

/** L'ère dessinable d'une version de bâtiment : la Brique au-delà de la deuxième. */
export function versionEra(version: number): Era {
  if (version <= 1) return 1;
  if (version <= 2) return 2;
  return 3;
}

/** La version d'un bâtiment : l'ère courante, sans descendre sous l'ère où il apparaît. */
export function eraFor(era: Era, firstEra: Era): Era {
  return era < firstEra ? firstEra : era;
}
