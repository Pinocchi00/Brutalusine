/**
 * La planche du sol : des scènes synthétiques peintes à ×2, avec une légende par cas.
 * La mesure d'un bloc est prise avant l'affichage pour ne pas subir la composition des vignettes.
 * Page de développement, hors du build de production.
 */
import { CHUNK } from '../sim/world';
import { TILE_PX } from '../render/px/view';
import { paintTiles, type GroundPathSegment, type GroundSource } from '../render/px/groundPaint';

declare global {
  interface Window {
    __sol?: { cases: number; ms: number };
  }
}

const CORNER = CHUNK + 1;
const SLAB_SIDE = CHUNK + 2;
const PX = TILE_PX;
const BLOCK = CHUNK * PX;

/** Une scène du monde, décrite par des fonctions pures. */
interface Scene {
  shore(cx: number, cy: number): number;
  ford?(cx: number, cy: number): number;
  slab(tx: number, ty: number): boolean;
  paths: readonly GroundPathSegment[];
  loot(tx: number, ty: number): boolean;
}

/** Construit la source d'un bloc à partir d'une scène globale. */
function blockSource(scene: Scene, originX: number, originY: number): GroundSource {
  const shore = new Float32Array(CORNER * CORNER);
  for (let j = 0; j < CORNER; j++) {
    for (let i = 0; i < CORNER; i++) shore[j * CORNER + i] = scene.shore(originX + i, originY + j);
  }
  const ford = new Float32Array(CORNER * CORNER);
  if (scene.ford) {
    for (let j = 0; j < CORNER; j++) {
      for (let i = 0; i < CORNER; i++) ford[j * CORNER + i] = scene.ford(originX + i, originY + j);
    }
  }
  const slab = new Uint8Array(SLAB_SIDE * SLAB_SIDE);
  for (let ly = -1; ly <= CHUNK; ly++) {
    for (let lx = -1; lx <= CHUNK; lx++) {
      slab[(ly + 1) * SLAB_SIDE + lx + 1] = scene.slab(originX + lx, originY + ly) ? 1 : 0;
    }
  }
  const loot = new Uint8Array(CHUNK * CHUNK);
  for (let ly = 0; ly < CHUNK; ly++) {
    for (let lx = 0; lx < CHUNK; lx++) {
      loot[ly * CHUNK + lx] = scene.loot(originX + lx, originY + ly) ? 1 : 0;
    }
  }
  return { seed: 7331, originX, originY, shore, ford, paths: scene.paths, slab, loot };
}

/** Peint un bloc entier dans un canevas neuf. */
function paintBlock(src: GroundSource): HTMLCanvasElement {
  const pixels = new Uint8ClampedArray(BLOCK * BLOCK * 4);
  paintTiles(src, pixels, src.originX, src.originY, src.originX + CHUNK, src.originY + CHUNK);
  const canvas = document.createElement('canvas');
  canvas.width = BLOCK;
  canvas.height = BLOCK;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Contexte 2D indisponible');
  const image = ctx.createImageData(BLOCK, BLOCK);
  image.data.set(pixels);
  ctx.putImageData(image, 0, 0);
  return canvas;
}

/** Peint deux blocs voisins côte à côte, sans le moindre interstice. */
function paintPair(scene: Scene, originX: number, originY: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = BLOCK * 2;
  canvas.height = BLOCK;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Contexte 2D indisponible');
  for (const shift of [0, CHUNK]) {
    const src = blockSource(scene, originX + shift, originY);
    const pixels = new Uint8ClampedArray(BLOCK * BLOCK * 4);
    paintTiles(src, pixels, originX + shift, originY, originX + shift + CHUNK, originY + CHUNK);
    const image = ctx.createImageData(BLOCK, BLOCK);
    image.data.set(pixels);
    ctx.putImageData(image, shift === 0 ? 0 : BLOCK, 0);
  }
  return canvas;
}

/** Une figure légendée, agrandie ×2 sans lissage. */
function figure(label: string, canvas: HTMLCanvasElement): HTMLElement {
  const box = document.createElement('figure');
  const caption = document.createElement('figcaption');
  caption.textContent = label;
  canvas.style.width = `${canvas.width * 2}px`;
  canvas.style.height = `${canvas.height * 2}px`;
  canvas.style.imageRendering = 'pixelated';
  box.append(caption, canvas);
  return box;
}

/** Une rive droite ancrée à l'origine du bloc. */
function rightShore(originX: number): (cx: number, cy: number) => number {
  return (cx) => originX + 16 - cx;
}

/** Mesure la peinture d'un bloc complet avec rive, sentier et dalles, puis affiche la planche. */
function main(): void {
  const root = document.getElementById('sol');
  if (!root) throw new Error('Page du sol incomplète');

  const bench = blockSource({
    shore: (cx, cy) => 12 - cx + 2.5 * Math.sin(cy * 0.21),
    slab: (tx, ty) => (tx >= 8 && tx <= 13 && ty >= 6 && ty <= 11) || (tx >= 14 && tx <= 22 && ty >= 8 && ty <= 9),
    paths: [{ ax: 4, ay: 22, bx: 20, by: 4 }, { ax: 26, ay: 2, bx: 10, by: 28 }],
    loot: (tx, ty) => tx === 5 && ty === 5,
  }, 0, 0);
  const target = new Uint8ClampedArray(BLOCK * BLOCK * 4);
  for (let i = 0; i < 8; i++) paintTiles(bench, target, 0, 0, CHUNK, CHUNK);
  const runs: number[] = [];
  for (let i = 0; i < 9; i++) {
    const start = performance.now();
    paintTiles(bench, target, 0, 0, CHUNK, CHUNK);
    runs.push(performance.now() - start);
  }
  runs.sort((a, b) => a - b);
  const ms = Math.round(runs[Math.floor(runs.length / 2)] * 100) / 100;

  const cases: HTMLElement[] = [];
  const right = rightShore(0);
  cases.push(figure('Rive droite', paintBlock(blockSource({
    shore: right,
    slab: () => false,
    paths: [],
    loot: () => false,
  }, 0, 0))));

  cases.push(figure('Méandre', paintBlock(blockSource({
    shore: (cx, cy) => 16 - cx + 4 * Math.sin(cy * 0.24),
    slab: () => false,
    paths: [],
    loot: () => false,
  }, 0, 0))));

  cases.push(figure('Chenal étroit de 4 cases', paintBlock(blockSource({
    shore: (cx) => Math.abs(cx - 16) - 2,
    slab: () => false,
    paths: [],
    loot: () => false,
  }, 0, 0))));

  cases.push(figure('Gué : rivière continue franchie à pied sec', paintBlock(blockSource({
    shore: right,
    ford: (cx, cy) => Math.max(0, Math.min(1, 1 - Math.abs(cy - 16) / 2.2)),
    slab: () => false,
    paths: [{ ax: 8, ay: 16, bx: 25, by: 16 }],
    loot: () => false,
  }, 0, 0))));

  cases.push(figure('Sentier qui traverse la berge', paintBlock(blockSource({
    shore: (cx, cy) => 16 - cx + cy * 0.18,
    slab: () => false,
    paths: [{ ax: 6, ay: 8, bx: 24, by: 24 }],
    loot: () => false,
  }, 0, 0))));

  cases.push(figure('Dalle sur prairie', paintBlock(blockSource({
    shore: () => 6,
    slab: (tx, ty) => tx >= 10 && tx <= 21 && ty >= 9 && ty <= 20,
    paths: [],
    loot: () => false,
  }, 0, 0))));

  cases.push(figure('Dalle sur sable', paintBlock(blockSource({
    shore: () => 1.2,
    slab: (tx, ty) => tx >= 11 && tx <= 20 && ty >= 10 && ty <= 19,
    paths: [],
    loot: () => false,
  }, 0, 0))));

  const seamScene: Scene = {
    shore: (cx, cy) => 16 - cx + 3 * Math.sin(cy * 0.2),
    slab: () => false,
    paths: [{ ax: 20, ay: 4, bx: 44, by: 30 }],
    loot: () => false,
  };
  cases.push(figure('Deux blocs voisins accolés (aucune couture)', paintPair(seamScene, 0, 0)));

  for (const item of cases) root.appendChild(item);

  const note = document.createElement('p');
  note.className = 'note';
  note.textContent = `${cases.length} cas. Un bloc complet (rive, sentier, dalles) : ${ms} ms (médiane de ${runs.length} peintures).`;
  root.prepend(note);
  window.__sol = { cases: cases.length, ms };
}

main();
