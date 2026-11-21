/**
 * La planche de contrôle des affleurements : quatre roches × trois variantes sur un fond d'herbe,
 * puis une rangée animée qui montre la vie du minerai et un coup de pioche. Page de développement.
 */
import { C } from '../render/px/palette';
import { makeSurface } from '../render/px/surface';
import { pen } from '../render/px/pen';
import {
  OUTCROP_VARIANTS,
  drawOreLive,
  drawRockHit,
  outcropSprite,
  rockShake,
  type OutcropSprite,
  type RockKind,
} from '../render/px/outcrops';

declare global {
  interface Window {
    __roches?: { cases: number };
  }
}

const ZOOM = 3, PAD = 6, HIT_PERIOD = 2;
const KINDS: readonly RockKind[] = ['fe', 'st', 'qz', 'cu'];
const NAMES: Record<RockKind, string> = { fe: 'fer', st: 'pierre', qz: 'quartz', cu: 'cuivre' };

const grid = document.getElementById('grille');
const anime = document.getElementById('anime');
if (!grid || !anime) throw new Error('Page des roches incomplète');

/** Ajoute une vignette légendée, agrandie ×3 sans lissage. */
function figure(parent: HTMLElement, label: string, canvas: HTMLCanvasElement): void {
  const box = document.createElement('figure');
  const caption = document.createElement('figcaption');
  caption.textContent = label;
  canvas.style.width = `${canvas.width * ZOOM}px`;
  canvas.style.height = `${canvas.height * ZOOM}px`;
  box.append(canvas, caption);
  parent.append(box);
}

/** Compose une vignette d'herbe autour d'un affleurement déjà fini. */
function tile(sprite: OutcropSprite): HTMLCanvasElement {
  const { canvas, ctx } = makeSurface(sprite.img.width + PAD * 2, sprite.img.height + PAD * 2);
  ctx.fillStyle = C.m2;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(sprite.img, PAD, PAD);
  return canvas;
}

/** Anime un affleurement : la vie du minerai, puis un coup de pioche toutes les deux secondes. */
function animate(sprite: OutcropSprite, phase: number): HTMLCanvasElement {
  const { canvas, ctx } = makeSurface(sprite.img.width + PAD * 2, sprite.img.height + PAD * 2);
  const P = pen(ctx);
  const started = performance.now();
  const frame = (): void => {
    const now = (performance.now() - started) / 1000;
    const since = now % HIT_PERIOD;
    ctx.fillStyle = C.m2;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const x = PAD + rockShake(since);
    ctx.drawImage(sprite.img, x, PAD);
    drawOreLive(P, sprite, x, PAD, now, phase);
    drawRockHit(P, sprite, x, PAD, since);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  return canvas;
}

let cases = 0;
for (const kind of KINDS) {
  for (let variant = 0; variant < OUTCROP_VARIANTS; variant++) {
    const sprite = outcropSprite(kind, variant);
    figure(grid, `${NAMES[kind]} · variante ${variant}`, tile(sprite));
    cases++;
  }
}

KINDS.forEach((kind, index) => {
  figure(anime, `${NAMES[kind]} · vie et coup`, animate(outcropSprite(kind, 0), index * 0.7));
});

window.__roches = { cases };
