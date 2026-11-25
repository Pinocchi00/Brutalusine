/**
 * Les ères du rendu : la version de chaque chose, et celle qu'on force par l'adresse.
 * La logique est pure, sans aucune API du navigateur, donc testable sous Node.
 */

/** L'ère affichée : 1 pour le Bois, 2 pour la Pierre. */
export type Era = 1 | 2;

/** L'ère forcée par l'adresse : `?ere=1` ou `?ere=2`, sinon aucune. */
export function forcedEra(search: string): Era | null {
  const value = new URLSearchParams(search).get('ere');
  if (value === '1') return 1;
  if (value === '2') return 2;
  return null;
}

/** L'ère dessinable d'une version de bâtiment : la Pierre au-delà de la première, la démo s'arrête là. */
export function versionEra(version: number): Era {
  return version <= 1 ? 1 : 2;
}

/** La version d'un bâtiment : l'ère courante, sans descendre sous l'ère où il apparaît. */
export function eraFor(era: Era, firstEra: Era): Era {
  return era < firstEra ? firstEra : era;
}
