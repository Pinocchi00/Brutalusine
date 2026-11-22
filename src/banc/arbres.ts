/**
 * La planche des arbres : les 3 espèces × 3 tailles × 4 variantes, puis une rangée animée
 * (balancement, un coup toutes les deux secondes, entaille). Page de développement, hors production.
 */
import { C } from '../render/px/palette';
import { pen } from '../render/px/pen';
import { makeSurface } from '../render/px/surface';
import {
  TREE_RADIUS,
  TREE_VARIANTS,
  canopySprite,
  drawTree,
  type TreeDraw,
  type TreeKind,
  type TreeSize,
} from '../render/px/trees';

declare global {
  interface Window {
    __arbres?: { cases: number };
  }
}

const ZOOM = 3;
const KINDS: readonly TreeKind[] = ['leafy', 'palm', 'flower'];
const SIZES: readonly TreeSize[] = [1, 2, 3];

/** Peint le fond d'herbe de la maquette. */
function grass(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = C.m2;
  ctx.fillRect(0, 0, w, h);
}

/** Crée un canevas à la taille d'un arbre, son pied posé près du bas. */
function treeSurface(img: HTMLCanvasElement, kind: TreeKind): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const trunk = kind === 'palm' ? 24 : 16;
  const canopy = Math.ceil(img.height * 0.76);
  const { canvas, ctx } = makeSurface(img.width + 8, trunk + canopy + 6);
  return { canvas, ctx };
}

/** Dessine un arbre sur son canevas, fond d'herbe compris. */
function paintTree(ctx: CanvasRenderingContext2D, tree: TreeDraw, now: number): void {
  grass(ctx, ctx.canvas.width, ctx.canvas.height);
  drawTree(ctx, pen(ctx), tree, now);
}

/** Le tremblement et l'entaille de la maquette : un coup toutes les deux secondes. */
function chopState(now: number): { shake: number; chop: boolean } {
  const since = now % 2;
  const amp = 1;
  const shake = since < 0.35
    ? (Math.floor(since * 16) % 2 ? amp : -amp) * (since < 0.18 ? 1 : 0.5)
    : 0;
  return { shake, chop: since < 0.6 };
}

/** Ajoute une figure légendée à un conteneur. */
function figure(root: HTMLElement, label: string, canvas: HTMLCanvasElement): void {
  const box = document.createElement('figure');
  const caption = document.createElement('figcaption');
  caption.textContent = label;
  canvas.style.width = `${canvas.width * ZOOM}px`;
  canvas.style.height = `${canvas.height * ZOOM}px`;
  box.append(canvas, caption);
  root.appendChild(box);
}

/** Construit la grille, la rangée animée, puis anime la page. */
function main(): void {
  const grid = document.getElementById('grille');
  const animated = document.getElementById('anime');
  if (!grid || !animated) throw new Error('Page des arbres incomplète');

  let cases = 0;
  for (const kind of KINDS) {
    for (const size of SIZES) {
      const R = TREE_RADIUS[size];
      for (let variant = 0; variant < TREE_VARIANTS; variant++) {
        const img = canopySprite(kind, size, variant);
        const { canvas, ctx } = treeSurface(img, kind);
        const tree: TreeDraw = {
          x: Math.floor(canvas.width / 2),
          y: canvas.height - 3,
          kind,
          img,
          shake: 0,
          chop: false,
        };
        paintTree(ctx, tree, 0);
        figure(grid, `${kind} · taille ${size} · variante ${variant} · R ${R}`, canvas);
        cases++;
      }
    }
  }

  const animatedTrees = KINDS.map((kind) => {
    const img = canopySprite(kind, 3, 0);
    const { canvas, ctx } = treeSurface(img, kind);
    const tree: TreeDraw = {
      x: Math.floor(canvas.width / 2),
      y: canvas.height - 3,
      kind,
      img,
      shake: 0,
      chop: false,
    };
    figure(animated, `${kind} · animé`, canvas);
    return { ctx, tree };
  });

  window.__arbres = { cases };

  const frame = (time: number): void => {
    const now = time / 1000;
    const { shake, chop } = chopState(now);
    for (const { ctx, tree } of animatedTrees) {
      tree.shake = shake;
      tree.chop = chop;
      paintTree(ctx, tree, now);
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

main();
