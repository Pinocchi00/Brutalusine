/**
 * L'horloge des animations pixel.
 *
 * La maquette fait vivre le monde deux fois plus vite que l'horloge réelle : `now` y vaut
 * `tick / FPS * PACE`. Ce rythme a été validé par l'utilisateur ; toutes les animations
 * pixel reçoivent donc ce temps-là, jamais les secondes réelles.
 */

/** Le facteur d'accélération du temps d'animation (la `PACE` de la maquette). */
export const PACE = 2;

/** Le temps d'animation de la maquette pour un temps réel en secondes. */
export function animTime(seconds: number): number {
  return seconds * PACE;
}
