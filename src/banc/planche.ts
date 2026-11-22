/**
 * La planche des volumes provisoires : tous les bâtiments, arbres, gisements, objets et bâtisseurs
 * sur un fond d'herbe, agrandis ×3 sans lissage. Page de développement, hors du build de production.
 */
import { BUILDINGS, DEPOSITS, ITEMS } from '../sim/data';
import { C } from '../render/px/palette';
import { build, castShadow, type Sprite } from '../render/px/sprite';
import { towerE1, towerE2 } from '../render/px/artTower';
import { kilnE1, kilnE2, puitsE1, puitsE2, storeE1, storeE2 } from '../render/px/artWorks';
import { scierieE1 } from '../render/px/artFirst';
import { fourE2 } from '../render/px/artStone';
import {
  placeholderBuilder,
  placeholderItem,
  placeholderSprite,
  type DepositType,
} from '../render/px/placeholders';
import { TREE_VARIANTS, canopySprite, type TreeKind } from '../render/px/trees';
import { OUTCROP_VARIANTS, outcropSprite, rockKind } from '../render/px/outcrops';

declare global {
  interface Window {
    __planche?: { done: boolean; count: number };
  }
}

const ZOOM = 3, PAD = 16;
const page = document.getElementById('planche');
if (!page) throw new Error('Page de la planche incomplète');
const root: HTMLElement = page;

/** Peint un fond d'herbe uni, comme celui de la maquette. */
function grass(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = C.m2;
  ctx.fillRect(0, 0, w, h);
}

/** Compose une vignette d'herbe autour d'un sprite, ombre portée comprise. */
function spriteTile(sprite: Sprite): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = sprite.img.width + PAD * 2;
  canvas.height = sprite.img.height + PAD;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Contexte 2D indisponible');
  ctx.imageSmoothingEnabled = false;
  grass(ctx, canvas.width, canvas.height);
  castShadow(ctx, sprite, PAD, PAD / 2);
  ctx.drawImage(sprite.img, PAD, PAD / 2);
  return canvas;
}

/** Compose une vignette d'herbe autour d'une image déjà dessinée, sans ombre. */
function imageTile(img: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = img.width + PAD * 2;
  canvas.height = img.height + PAD;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Contexte 2D indisponible');
  ctx.imageSmoothingEnabled = false;
  grass(ctx, canvas.width, canvas.height);
  ctx.drawImage(img, PAD, PAD / 2);
  return canvas;
}

/** Une case de sol nue, pour la dalle qui n'a justement aucun volume. */
function groundTile(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 24 + PAD * 2;
  canvas.height = 24 + PAD;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Contexte 2D indisponible');
  ctx.imageSmoothingEnabled = false;
  grass(ctx, canvas.width, canvas.height);
  ctx.fillStyle = C.m3;
  for (let j = 0; j < 24; j += 8) ctx.fillRect(PAD, PAD / 2 + j, 24, 1);
  for (let i = 0; i < 24; i += 8) ctx.fillRect(PAD + i, PAD / 2, 1, 24);
  return canvas;
}

/** Ajoute une vignette légendée à la planche et renvoie vrai pour compter le volume. */
function figure(section: HTMLElement, label: string, canvas: HTMLCanvasElement, counted = true): boolean {
  const box = document.createElement('figure');
  const caption = document.createElement('figcaption');
  caption.textContent = label;
  canvas.style.width = `${canvas.width * ZOOM}px`;
  canvas.style.height = `${canvas.height * ZOOM}px`;
  box.append(canvas, caption);
  section.appendChild(box);
  return counted;
}

/** Ajoute une section titrée et renvoie son conteneur. */
function section(title: string): HTMLElement {
  const block = document.createElement('section');
  const heading = document.createElement('h2');
  heading.textContent = title;
  block.appendChild(heading);
  const grid = document.createElement('div');
  grid.className = 'grid';
  block.appendChild(grid);
  root.appendChild(block);
  return grid;
}

let count = 0;

const buildings = section('Bâtiments provisoires');
for (const def of BUILDINGS) {
  const sprite = placeholderSprite(def);
  const canvas = sprite ? spriteTile(sprite) : groundTile();
  if (figure(buildings, def.name, canvas, sprite !== null)) count++;
}

const ERAS = section('Bâtiments Bois et Pierre');
for (const [label, footprint, up, draw] of [
  ['Tour · Bois', 72, 16, towerE1],
  ['Tour · Pierre', 72, 30, towerE2],
  ['Puits · Bois', 72, 10, puitsE1],
  ['Puits · Pierre', 72, 42, puitsE2],
  ['Charbonnière · Bois', 48, 2, kilnE1],
  ['Charbonnière · Pierre', 48, 4, kilnE2],
  ['Stockage · Bois', 48, 2, storeE1],
  ['Stockage · Pierre', 48, 20, storeE2],
] as const) {
  const sprite = build(footprint, footprint, up, draw);
  if (figure(ERAS, label, spriteTile(sprite))) count++;
}

const TEMOINS = section('Témoins');
for (const [label, up, draw] of [
  ['Scierie · Bois', 18, scierieE1],
  ['Four · Pierre', 44, fourE2],
] as const) {
  const sprite = build(48, 48, up, draw);
  if (figure(TEMOINS, label, spriteTile(sprite))) count++;
}

const KIND_NAMES: Record<TreeKind, string> = { leafy: 'Feuillu', palm: 'Palmier', flower: 'Fleuri' };
const trees = section('Houppiers des arbres');
for (const kind of ['leafy', 'palm', 'flower'] as const) {
  for (const size of [1, 2, 3] as const) {
    for (let variant = 0; variant < TREE_VARIANTS; variant++) {
      const img = canopySprite(kind, size, variant);
      if (figure(trees, `${KIND_NAMES[kind]} ${size} · ${variant}`, imageTile(img))) count++;
    }
  }
}

const deposits = section('Affleurements');
for (const type of [1, 2, 3, 4] as const) {
  const deposit = DEPOSITS[type as DepositType];
  for (let variant = 0; variant < OUTCROP_VARIANTS; variant++) {
    const sprite = outcropSprite(rockKind(type as 1 | 2 | 3 | 4), variant);
    if (figure(deposits, `${deposit.name} · ${variant}`, imageTile(sprite.img))) count++;
  }
}

const objects = section('Objets provisoires');
for (const item of ITEMS) {
  if (figure(objects, item.name, imageTile(placeholderItem(item.id)))) count++;
}

const builders = section('Bâtisseurs provisoires');
for (const [label, color] of [
  ['Orange', C.o2],
  ['Bleu', C.blue],
  ['Vert', C.good],
  ['Rose', C.pink],
] as const) {
  if (figure(builders, `Bâtisseur ${label.toLowerCase()}`, spriteTile(placeholderBuilder(color)))) count++;
}

window.__planche = { done: true, count };
