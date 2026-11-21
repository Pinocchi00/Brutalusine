/**
 * Les arbres de la maquette « heure dorée » : le houppier dessiné au crayon puis fini, le tronc,
 * l'entaille et le balancement. Le dessin suit la maquette sans l'interpréter.
 */
import { C } from './palette';
import { hash, rng } from './noise';
import type { Pen } from './pen';
import { pen } from './pen';
import { finish } from './finish';
import { makeSurface } from './surface';

/** Les trois espèces d'arbre : le feuillu, le palmier et l'arbre à fleurs. */
export type TreeKind = 'leafy' | 'palm' | 'flower';

/** Les trois tailles d'arbre du jeu. */
export type TreeSize = 1 | 2 | 3;

/** Le rayon du houppier pour chaque taille. */
export const TREE_RADIUS: Readonly<Record<TreeSize, number>> = { 1: 13, 2: 16, 3: 20 };

/** Le nombre de variantes de houppier par espèce et par taille. */
export const TREE_VARIANTS = 4;

/** Ce qu'il faut pour dessiner un arbre à un instant donné. */
export interface TreeDraw {
  /** Le pied, en pixels monde, entier. */
  x: number;
  /** Le pied, en pixels monde, entier. */
  y: number;
  /** L'espèce de l'arbre. */
  kind: TreeKind;
  /** Le houppier, venu de `canopySprite`. */
  img: HTMLCanvasElement;
  /** Le décalage horizontal du coup reçu, calculé ailleurs. */
  shake: number;
  /** L'entaille de hache. */
  chop: boolean;
}

/** Les sels qui séparent les tirages de l'espèce, de la variante et du houppier. */
const KIND_SALT: Readonly<Record<TreeKind, number>> = { leafy: 1, palm: 2, flower: 3 };

/** Le cache des houppiers finis, par espèce, taille et variante. */
const canopies = new Map<string, HTMLCanvasElement>();

/** L'espèce d'un arbre selon sa case et la graine : pur et déterministe. */
export function treeKindAt(tx: number, ty: number, seed: number): TreeKind {
  const h = hash(tx, ty, seed + 211);
  if (h < 0.74) return 'leafy';
  if (h < 0.9) return 'palm';
  return 'flower';
}

/** La variante 0 à TREE_VARIANTS - 1 selon sa case et la graine. */
export function treeVariantAt(tx: number, ty: number, seed: number): number {
  return Math.min(TREE_VARIANTS - 1, Math.floor(hash(tx, ty, seed + 212) * TREE_VARIANTS));
}

/** Le balancement de la maquette : Math.round(Math.sin(now * 1.05 + x * 0.07) * 0.7). */
export function treeSway(now: number, x: number): number {
  return Math.round(Math.sin(now * 1.05 + x * 0.07) * 0.7);
}

/** Le côté du carré du houppier : Math.ceil(R * 2 + 8). */
export function canopySize(R: number): number {
  return Math.ceil(R * 2 + 8);
}

/** Dessine le houppier non fini sur un carré de côté canopySize(R), centré. Toute la logique de dessin est ici. */
export function paintCanopy(P: Pen, R: number, seed: number, kind: TreeKind): void {
  const S = canopySize(R);
  const r = rng(seed);
  const cx = S / 2;
  const cy = S / 2;
  if (kind === 'palm') {
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * 6.283 + r() * 0.35;
      const len = R * (0.85 + r() * 0.2);
      for (let s = 1; s < len; s++) {
        const px = cx + Math.cos(a) * s;
        const py = cy + Math.sin(a) * s * 0.8 + (s / len) * (s / len) * 4;
        P.r(px, py, 2, 2, s < len * 0.4 ? C.g4 : C.g3);
        P.p(px, py, C.g2);
        if (s % 3 === 0) {
          P.r(px + Math.sin(a) * 2.4, py - Math.cos(a) * 2.4, 2, 1, C.g2);
          P.r(px - Math.sin(a) * 2.4, py + Math.cos(a) * 2.4, 2, 1, C.g4);
        }
      }
    }
    P.disc(cx, cy, 3, C.e2);
    P.p(cx - 1, cy - 1, C.e1);
    return;
  }
  const blob = (ox: number, oy: number, rr: number, col: string, n: number): void => {
    P.disc(cx + ox, cy + oy, rr, col);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * 6.283 + r() * 0.5;
      P.disc(cx + ox + Math.cos(a) * rr * 0.85, cy + oy + Math.sin(a) * rr * 0.85, rr * (0.26 + r() * 0.12), col);
    }
  };
  blob(0, 0, R * 0.92, C.g5, 14);
  blob(-0.5, -1.2, R * 0.8, C.g4, 12);
  blob(-1.4, -2.6, R * 0.6, C.g3, 10);
  blob(-2.6, -3.8, R * 0.38, C.g2, 8);
  blob(-3.4, -4.6, R * 0.17, C.g1, 5);
  for (let k = 0; k < R * 2.2; k++) {
    const a = r() * 6.283;
    const d = Math.sqrt(r()) * R * 0.78;
    const px = cx + Math.cos(a) * d;
    const py = cy + Math.sin(a) * d * 0.9;
    const lit = px - cx + (py - cy) < -R * 0.2;
    P.r(px, py, 3, 2, lit ? C.g1 : C.g4);
    P.p(px, py, lit ? C.g0 : C.g3);
    P.p(px + 1, py + 2, C.g5);
  }
  if (kind === 'flower') {
    for (let k = 0; k < 12; k++) {
      const a = r() * 6.283;
      const d = R * (0.25 + r() * 0.55);
      const px = cx + Math.cos(a) * d;
      const py = cy + Math.sin(a) * d - 1;
      P.r(px, py, 3, 2, C.pink);
      P.p(px + 1, py - 1, C.pink);
      P.p(px + 1, py, C.white);
      P.p(px + 2, py + 1, C.pink2);
    }
  }
}

/** Les trois espèces, dans l'ordre de préparation des houppiers. */
const TREE_KINDS: readonly TreeKind[] = ['leafy', 'palm', 'flower'];

/** Les trois tailles, dans l'ordre de préparation des houppiers. */
const TREE_SIZES: readonly TreeSize[] = [1, 2, 3];

/** Les espèces, tailles et variantes possibles d'un houppier. */
export function treeSpriteKeys(): readonly { kind: TreeKind; size: TreeSize; variant: number }[] {
  const keys: { kind: TreeKind; size: TreeSize; variant: number }[] = [];
  for (const kind of TREE_KINDS) {
    for (const size of TREE_SIZES) {
      for (let variant = 0; variant < TREE_VARIANTS; variant++) keys.push({ kind, size, variant });
    }
  }
  return keys;
}

/** Prépare tous les houppiers à l'avance, pour ne rien dessiner en pleine partie. */
export function prepareTrees(): void {
  for (const key of treeSpriteKeys()) canopySprite(key.kind, key.size, key.variant);
}

/** La graine du houppier, dérivée de l'espèce, de la taille et de la variante. */
function canopySeed(kind: TreeKind, size: TreeSize, variant: number): number {
  const h = hash(size * TREE_VARIANTS + variant, KIND_SALT[kind], 907);
  return Math.floor(h * 4294967296) >>> 0;
}

/** Le houppier fini (`finish`), mis en cache par espèce, taille et variante. */
export function canopySprite(kind: TreeKind, size: TreeSize, variant: number): HTMLCanvasElement {
  const key = `${kind}:${size}:${variant}`;
  const cached = canopies.get(key);
  if (cached) return cached;
  const R = TREE_RADIUS[size];
  const { canvas, ctx } = makeSurface(canopySize(R), canopySize(R));
  paintCanopy(pen(ctx), R, canopySeed(kind, size, variant), kind);
  const img = finish(canvas);
  canopies.set(key, img);
  return img;
}

/** Dessine le tronc puis le houppier, comme `drawTree` de la maquette. */
export function drawTree(ctx: CanvasRenderingContext2D, P: Pen, tree: TreeDraw, now: number): void {
  const { x, y } = tree;
  if (tree.kind === 'palm') {
    for (let j = 0; j < 24; j++) {
      const xo = Math.round(Math.sin(j / 9) * 3);
      P.r(x - 3 + xo, y - j, 6, 1, C.ink);
      P.r(x - 2 + xo, y - j, 4, 1, j % 4 < 2 ? C.e2 : C.e3);
      P.p(x - 2 + xo, y - j, C.e1);
    }
  } else {
    const th = 16;
    P.r(x - 4, y - th, 8, th + 1, C.ink);
    P.r(x - 3, y - th, 6, th, C.e3);
    P.r(x - 3, y - th, 2, th, C.e2);
    P.p(x - 3, y - th + 3, C.e1);
    P.r(x + 2, y - th, 1, th, C.e4);
    for (let j = y - th + 2; j < y; j += 4) P.p(x, j, C.e4);
    P.r(x - 6, y, 3, 1, C.e3);
    P.r(x + 3, y, 3, 1, C.e4);
    P.p(x - 7, y + 1, C.e3);
    if (tree.chop) {
      P.r(x - 4, y - 9, 3, 4, C.e0);
      P.p(x - 3, y - 8, C.c1);
      P.p(x - 2, y - 7, C.e1);
    }
  }
  const top = tree.kind === 'palm' ? y - 24 : y - 16;
  const sway = treeSway(now, x);
  ctx.drawImage(tree.img, Math.round(x - tree.img.width / 2 + tree.shake + sway), Math.round(top - tree.img.height * 0.76));
}
