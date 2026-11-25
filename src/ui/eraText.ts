import { ERAS, ITEMS, QUOTAS } from '../sim/data';

/** L'étiquette de la livraison en cours : « Ère Bois · Livraison 2 / 3 », ou « Fin de la démo » au-delà. */
export function deliveryLabel(quota: number): string {
  if (quota < 0 || quota >= QUOTAS.length) return 'Fin de la démo';
  const era = ERAS[QUOTAS[quota].era - 1];
  return `Ère ${era.name} · Livraison ${(quota % 3) + 1} / 3`;
}

/** Le titre de la bannière d'une livraison accomplie : « Livraison accomplie », ou « La Tour passe à l’ère de la Pierre »
 *  (de la Brique) quand la livraison refaisait la Tour. */
export function bannerTitle(doneQuota: number): string {
  if (doneQuota < 0 || doneQuota >= QUOTAS.length) return 'Livraison accomplie';
  const q = QUOTAS[doneQuota];
  if (!q.rebuild) return 'Livraison accomplie';
  return `La Tour passe à l’ère de la ${ERAS[q.era].name}`;
}

/** Le prix lisible d'une liste [objet, quantité] : « 8 Pierre · 2 Bois », ou « gratuit ». */
export function costText(cost: [number, number][]): string {
  if (!cost.length) return 'gratuit';
  return cost.map(([id, n]) => `${n} ${ITEMS[id].name}`).join(' · ');
}
