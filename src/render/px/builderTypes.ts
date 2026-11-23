/**
 * Le contrat entre les mouvements du bâtisseur et son dessin.
 * Les coordonnées sont en pixels, relatives au coin de référence du personnage (le `BUILDER` de la maquette).
 */

/** La position d'un poing. */
export type FistPoint = readonly [number, number];

/** Le décalage des deux pieds par rapport à leur place en garde, en pixels. */
export interface BuilderFeet {
  readonly rearX: number;
  readonly rearY: number;
  readonly frontX: number;
  readonly frontY: number;
}

/** Une pose du bâtisseur à un instant donné. */
export interface BuilderPose {
  /** Décalage horizontal de la coque. */
  readonly tx: number;
  /** Décalage vertical de la coque, sautillement compris. */
  readonly ty: number;
  /** Le poing avant. */
  readonly L: FistPoint;
  /** Le poing arrière. */
  readonly R: FistPoint;
  /** Coude avant levé, de 0 à 1 (crochet). */
  readonly up: number;
  /** Rotation de la coque vers la cible. */
  readonly tw: number;
  /** Tassement de la coque. */
  readonly sq: number;
  /** Le décalage des pieds ; absent, les pieds restent plantés. */
  readonly feet?: BuilderFeet;
}

/** Tout ce qu'il faut pour dessiner une image du bâtisseur. */
export interface BuilderFrame {
  /** La pose à l'instant dessiné. */
  readonly pose: BuilderPose;
  /** La pose 0,35 unité de temps plus tôt : les antennes la suivent avec retard. */
  readonly lagged: BuilderPose;
  /** La pose 0,1 unité de temps plus tôt : elle trace la traînée des poings. */
  readonly previous: BuilderPose;
  /** Vrai juste après un coup : le bout des antennes s'allume. */
  readonly flash: boolean;
}
