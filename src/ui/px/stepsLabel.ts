/** Le libellé du pli des étapes : « Étape n / total », ou « Étapes faites » quand plus rien n'attend. */
export function stepsToggleLabel(index: number, total: number): string {
  if (index < 0 || index >= total) return 'Étapes faites';
  return `Étape ${index + 1} / ${total}`;
}
