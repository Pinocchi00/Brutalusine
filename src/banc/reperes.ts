/**
 * Page de développement des repères pixel : chaque overlay sur un fond d'herbe, ×4,
 * animé, avec son nom. La page n'entre pas dans le build de production.
 */
import { C, M } from '../render/px/palette';
import { pen } from '../render/px/pen';
import { hash } from '../render/px/noise';
import { makeSurface } from '../render/px/surface';
import { build } from '../render/px/sprite';
import { box, cyl } from '../render/px/volumes';
import { finish } from '../render/px/finish';
import { Status } from '../sim/ent';
import { I } from '../sim/data';
import type { Ring, RouteView } from '../render/px/types';
import {
  drawBrackets,
  drawCauseBubble,
  drawGhost,
  drawHubMouths,
  drawMarker,
  drawRange,
  drawRing,
  drawRoute,
} from '../render/px/overlays';

declare global {
  interface Window {
    __reperes?: { done: boolean };
  }
}

/** Une planche : son nom, son canevas et son dessin animé. */
interface Board {
  name: string;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  draw(now: number): void;
}

const T = 24;
const ZOOM = 4;

/** Peint un fond d'herbe déterministe, sans lissage. */
function paintGrass(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = C.m2;
  ctx.fillRect(0, 0, w, h);
  const P = pen(ctx);
  for (let gy = 0; gy < h; gy += 12) {
    for (let gx = 0; gx < w; gx += 12) {
      const r = hash(gx >> 4, gy >> 4, 11);
      if (r < 0.42) {
        P.p(gx + 3, gy + 5, C.m3);
        P.p(gx + 4, gy + 5, C.m3);
        P.p(gx + 3, gy + 4, C.m1);
      } else if (r < 0.78) {
        P.p(gx + 8, gy + 9, C.m4);
        P.p(gx + 9, gy + 9, C.m3);
      }
    }
  }
}

/** Crée une planche de `w × h` cases sur fond d'herbe. */
function board(name: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D, now: number) => void): Board {
  const { canvas, ctx } = makeSurface(w * T, h * T);
  return {
    name,
    canvas,
    ctx,
    draw: (now) => {
      paintGrass(ctx, canvas.width, canvas.height);
      draw(ctx, now);
    },
  };
}

/** Un sprite provisoire de bâtiment, en attendant `placeholders.ts`. */
function demoSprite() {
  return build(48, 42, 18, (P, up) => {
    box(P, 6, up + 10, 32, 14, 12, M.conc);
    cyl(P, 34, up + 2, 5, 18, M.steel);
  });
}

/** Une petite image d'objet pour la bulle « il manque ». */
function itemImage(): CanvasImageSource {
  const { canvas, ctx } = makeSurface(14, 14);
  const P = pen(ctx);
  P.ell(7, 7, 5, 4, C.az);
  P.p(5, 5, C.q0);
  P.p(8, 8, C.az2);
  return finish(canvas);
}

const L_ROUTE: RouteView[] = [
  { x: 1, y: 1, dir: 0, ok: true },
  { x: 2, y: 1, dir: 1, ok: true },
  { x: 2, y: 2, dir: 1, ok: true },
  { x: 2, y: 3, dir: 1, ok: true },
];

/** Construit toutes les planches et les accroche à la page, puis les anime. */
function main(): void {
  const root = document.getElementById('boards');
  if (!root) throw new Error('Page des repères incomplète');

  const ghost = demoSprite();
  const item = itemImage();
  const boards: Board[] = [
    board('Cadres — survol et sélection', 6, 4, (ctx, now) => {
      const P = pen(ctx);
      drawBrackets(P, 0.5, 0.5, 2, 2, C.white, now);
      drawBrackets(P, 3.5, 0.5, 2, 2, C.o1, now);
    }),
    board('Portée — la scierie', 14, 12, (ctx, now) => {
      const P = pen(ctx);
      box(P, 6 * T, 5 * T, 48, 20, 18, M.conc);
      drawRange(P, 'scierie', 6, 5, 2, 2, now);
    }),
    board('Aperçu — pose acceptée', 4, 4, (ctx) => {
      drawGhost(ctx, ghost, (ctx.canvas.width - ghost.img.width) / 2, (ctx.canvas.height - ghost.img.height) / 2, true);
    }),
    board('Aperçu — pose refusée', 4, 4, (ctx) => {
      drawGhost(ctx, ghost, (ctx.canvas.width - ghost.img.width) / 2, (ctx.canvas.height - ghost.img.height) / 2, false);
    }),
    board('Tracé en L — accepté', 5, 5, (ctx, now) => {
      drawRoute(pen(ctx), L_ROUTE, true, now);
    }),
    board('Tracé en L — refusé', 5, 5, (ctx, now) => {
      const broken = L_ROUTE.map((t, i) => (i === 2 ? { ...t, ok: false } : t));
      drawRoute(pen(ctx), broken, false, now);
    }),
    board('Entrées de la Tour', 7, 7, (ctx, now) => {
      const P = pen(ctx);
      box(P, 2 * T, 2 * T, 72, 28, 32, M.conc);
      drawHubMouths(P, 2, 2, 3, 3, [true, true, true, true], now);
    }),
    board('Repère du guide', 3, 3, (ctx, now) => {
      drawMarker(pen(ctx), 1.5, 2, now);
    }),
    board('Onde — quota ou pose', 8, 8, (ctx, now) => {
      const dur = 1.4;
      const local = now % dur;
      const ring: Ring = { x: 4, y: 4, t0: now - local, color: C.o1, size: 2.6, dur };
      drawRing(pen(ctx), ring, now);
    }),
    board('Bulle — objet manquant (image)', 3, 3, (ctx, now) => {
      const P = pen(ctx);
      drawCauseBubble(P, ctx, 1.5, 1.5, Status.NoInput, I.pierre, now, () => item);
    }),
    board('Bulle — objet manquant (couleur)', 3, 3, (ctx, now) => {
      drawCauseBubble(pen(ctx), ctx, 1.5, 1.5, Status.NoInput, I.carbone, now);
    }),
    board('Bulle — sortie bloquée', 3, 3, (ctx, now) => {
      drawCauseBubble(pen(ctx), ctx, 1.5, 1.5, Status.Blocked, -1, now);
    }),
    board('Bulle — pas de courant', 3, 3, (ctx, now) => {
      drawCauseBubble(pen(ctx), ctx, 1.5, 1.5, Status.NoPower, -1, now);
    }),
    board('Bulle — rien à récolter', 3, 3, (ctx, now) => {
      drawCauseBubble(pen(ctx), ctx, 1.5, 1.5, Status.NoResource, -1, now);
    }),
    board('Bulle — aucune recette', 3, 3, (ctx, now) => {
      drawCauseBubble(pen(ctx), ctx, 1.5, 1.5, Status.NoRecipe, -1, now);
    }),
    board('Bulle — attend le jour', 3, 3, (ctx, now) => {
      drawCauseBubble(pen(ctx), ctx, 1.5, 1.5, Status.Dark, -1, now);
    }),
  ];

  for (const b of boards) {
    const figure = document.createElement('figure');
    const caption = document.createElement('figcaption');
    caption.textContent = b.name;
    b.canvas.style.width = `${b.canvas.width * ZOOM}px`;
    b.canvas.style.height = `${b.canvas.height * ZOOM}px`;
    figure.append(caption, b.canvas);
    root.appendChild(figure);
  }

  let done = false;
  const frame = (time: number): void => {
    const now = (time / 1000) * 2;
    for (const b of boards) b.draw(now);
    if (!done) {
      done = true;
      window.__reperes = { done: true };
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

main();
