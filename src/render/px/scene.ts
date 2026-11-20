/**
 * La file de dessin d'une image : les couches dans l'ordre, et le tri nord-sud des objets hauts.
 * Aucune API du navigateur : la file est pure et se teste sous Node.
 */

/** Une fonction de dessin, sans argument. */
export type Draw = () => void;

/** Les couches, dans l'ordre de dessin. */
export type Layer = 'ground' | 'flat' | 'cast' | 'tall' | 'fx' | 'light';

const LAYERS: readonly Layer[] = ['ground', 'flat', 'cast', 'tall', 'fx', 'light'];

/**
 * Une file réutilisable : les couches gardent leurs tableaux d'une image à l'autre.
 * Les objets hauts vivent dans des tableaux parallèles (`footY`, `x`, `draw`) plus un tableau
 * d'indices à trier : aucun objet par entrée, et le tri se fait sur des nombres seulement.
 * L'ordre d'ajout sert de dernier critère, ce qui rend le tri stable et déterministe.
 */
export class DrawQueue {
  private readonly layers: Record<Layer, Draw[]> = {
    ground: [],
    flat: [],
    cast: [],
    tall: [],
    fx: [],
    light: [],
  };
  private readonly footY: number[] = [];
  private readonly tallX: number[] = [];
  private readonly tallDraw: Draw[] = [];
  private readonly tallOrder: number[] = [];
  private readonly byFoot = (a: number, b: number): number =>
    this.footY[a] - this.footY[b] || this.tallX[a] - this.tallX[b] || a - b;

  /** Le nombre de dessins en attente, objets hauts compris. */
  get size(): number {
    let total = this.tallDraw.length;
    for (const layer of LAYERS) {
      if (layer !== 'tall') total += this.layers[layer].length;
    }
    return total;
  }

  /** Ajoute un dessin à une couche à plat, dessiné dans l'ordre d'ajout. */
  add(layer: Layer, draw: Draw): void {
    if (layer === 'tall') {
      // Un objet haut sans pied ni x se range à l'origine, en fin d'ordre d'ajout.
      this.addTall(0, 0, draw);
      return;
    }
    this.layers[layer].push(draw);
  }

  /** Ajoute un objet haut, trié par pied, puis par x, puis par ordre d'ajout. */
  addTall(footY: number, x: number, draw: Draw): void {
    const index = this.tallDraw.length;
    this.footY.push(footY);
    this.tallX.push(x);
    this.tallDraw.push(draw);
    this.tallOrder.push(index);
  }

  /** Dessine toutes les couches dans l'ordre, vide la file, puis relance la première erreur. */
  flush(): void {
    let firstError: unknown = undefined;
    let failed = false;
    const run = (draw: Draw): void => {
      try {
        draw();
      } catch (error) {
        if (!failed) {
          failed = true;
          firstError = error;
        }
      }
    };
    for (const layer of LAYERS) {
      if (layer === 'tall') {
        this.flushTall(run);
        continue;
      }
      const list = this.layers[layer];
      for (let i = 0; i < list.length; i++) run(list[i]);
    }
    this.clear();
    if (failed) throw firstError;
  }

  /** Vide la file en gardant les tableaux alloués pour l'image suivante. */
  clear(): void {
    for (const layer of LAYERS) this.layers[layer].length = 0;
    this.footY.length = 0;
    this.tallX.length = 0;
    this.tallDraw.length = 0;
    this.tallOrder.length = 0;
  }

  private flushTall(run: (draw: Draw) => void): void {
    const order = this.tallOrder;
    order.sort(this.byFoot);
    for (let i = 0; i < order.length; i++) run(this.tallDraw[order[i]]);
  }
}
