/**
 * La page d'essai du bâtisseur boxeur : repos, marche, récolte et transitions, sur un pré agrandi ×3.
 * Page de développement seulement, hors du build.
 */
import { BuilderAnimator, BUILDER_ANCHOR, type MotionInput, type MotionResult } from '../render/px/builderMotion';
import { drawBuilderFrame } from '../render/px/builderArt';
import { C } from '../render/px/palette';
import { hash } from '../render/px/noise';
import { pen, type Pen } from '../render/px/pen';
import type { BuilderFrame } from '../render/px/builderTypes';

declare global {
  interface Window {
    __boxeur?: { done: boolean; frames: number };
  }
}

const ART_W = 128;
const ART_H = 96;
const ZOOM = 3;
const CENTER_X = 64;
const CENTER_Y = 56;
const STEP = 1 / 60;
const WALK_PHASES = 8;
const HARVEST_COUNT = 5;
const HARVEST_REACH = 50;

/** Une image fixe prête à être dessinée. */
interface Snapshot {
  readonly frame: BuilderFrame;
  readonly facing: 1 | -1;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly target: { readonly x: number; readonly y: number } | null;
  readonly label: string;
}

/** Le conteneur des sections de la page. */
function root(): HTMLElement {
  const host = document.getElementById('cases');
  if (!(host instanceof HTMLElement)) throw new Error('Conteneur des sections absent');
  return host;
}

/** Prépare un canevas à la taille du pixel art, agrandi sans lissage. */
function prepare(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  canvas.width = ART_W;
  canvas.height = ART_H;
  canvas.style.width = `${ART_W * ZOOM}px`;
  canvas.style.height = `${ART_H * ZOOM}px`;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Contexte 2D indisponible');
  ctx.imageSmoothingEnabled = false;
  return ctx;
}

/** Peint le pré : une herbe `C.m2` semée de touffes plus sombres. */
function grass(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = C.m2;
  ctx.fillRect(0, 0, ART_W, ART_H);
  for (let y = 0; y < ART_H; y += 3) {
    for (let x = 0; x < ART_W; x += 3) {
      if (hash(x, y, 17) < 0.22) {
        ctx.fillStyle = hash(x, y, 3) < 0.5 ? C.m3 : C.m1;
        ctx.fillRect(x + Math.floor(hash(x, y, 5) * 3), y, 1, 2);
      }
    }
  }
}

/** Dessine la cible de récolte : une petite croix orange. */
function cross(P: Pen, x: number, y: number): void {
  const px = Math.round(x);
  const py = Math.round(y);
  P.r(px - 3, py, 7, 1, C.o1);
  P.r(px, py - 3, 1, 7, C.o1);
}

/** Dessine une image du bâtisseur, en miroir s'il regarde à gauche. */
function drawSnapshot(ctx: CanvasRenderingContext2D, snapshot: Snapshot): void {
  const P = pen(ctx);
  const cornerX = CENTER_X - BUILDER_ANCHOR.x;
  const cornerY = CENTER_Y - BUILDER_ANCHOR.y;
  if (snapshot.facing === 1) {
    drawBuilderFrame(ctx, P, cornerX + snapshot.offsetX, cornerY + snapshot.offsetY, snapshot.frame);
    return;
  }
  ctx.save();
  ctx.translate(CENTER_X, CENTER_Y);
  ctx.scale(-1, 1);
  drawBuilderFrame(ctx, P, -BUILDER_ANCHOR.x - snapshot.offsetX, -BUILDER_ANCHOR.y + snapshot.offsetY, snapshot.frame);
  ctx.restore();
}

/** Peint une vignette et rend son canevas. */
function vignette(row: HTMLElement, snapshot: Snapshot): HTMLCanvasElement {
  const figure = document.createElement('figure');
  const caption = document.createElement('figcaption');
  caption.textContent = snapshot.label;
  const canvas = document.createElement('canvas');
  figure.appendChild(caption);
  figure.appendChild(canvas);
  row.appendChild(figure);
  const ctx = prepare(canvas);
  grass(ctx);
  if (snapshot.target) cross(pen(ctx), CENTER_X + snapshot.target.x, CENTER_Y + snapshot.target.y);
  drawSnapshot(ctx, snapshot);
  return canvas;
}

/** Ouvre une section légendée et rend la rangée où poser ses vignettes. */
function section(title: string): HTMLElement {
  const box = document.createElement('div');
  box.className = 'case';
  const heading = document.createElement('h2');
  heading.textContent = title;
  const row = document.createElement('div');
  row.className = 'row';
  box.appendChild(heading);
  box.appendChild(row);
  root().appendChild(box);
  return row;
}

/** Transforme un résultat d'animation en vignette immobile. */
function snapshotOf(result: MotionResult, label: string, target: Snapshot['target']): Snapshot {
  return {
    frame: result.frame,
    facing: result.facing,
    offsetX: result.offsetX,
    offsetY: result.offsetY,
    target,
    label,
  };
}

/** Fait avancer l'animateur d'un nombre de pas fixes. */
function advance(animator: BuilderAnimator, steps: number, input: MotionInput): MotionResult {
  let result = animator.step(0, input);
  for (let i = 0; i < steps; i++) {
    result = animator.step(STEP, input);
  }
  return result;
}

/** La section du repos : quatre instants du va-et-vient. */
function reposeSection(): number {
  const row = section('Repos');
  const animator = new BuilderAnimator();
  const input: MotionInput = { walk: 0, speed: 0, fx: 1, acting: false, targetDx: 0, targetDy: 0 };
  const times = [0, 0.4, 0.8, 1.2];
  let done = 0;
  for (const time of times) {
    const steps = Math.round(time / STEP) - done;
    const result = advance(animator, steps, input);
    vignette(row, snapshotOf(result, `t = ${time.toFixed(1)} s`, null));
    done += steps;
  }
  return times.length;
}

/** La section de marche, à droite puis en miroir. */
function walkSection(): number {
  const right = section('Marche à droite');
  const rightAnimator = new BuilderAnimator();
  const left = section('Marche à gauche');
  const leftAnimator = new BuilderAnimator();
  for (let i = 0; i < WALK_PHASES; i++) {
    const phase = (i / WALK_PHASES) * Math.PI * 2;
    const rightInput: MotionInput = { walk: phase, speed: 1, fx: 1, acting: false, targetDx: 0, targetDy: 0 };
    const leftInput: MotionInput = { walk: phase, speed: 1, fx: -1, acting: false, targetDx: 0, targetDy: 0 };
    const rightResult = advance(rightAnimator, 1, rightInput);
    const leftResult = advance(leftAnimator, 1, leftInput);
    vignette(right, snapshotOf(rightResult, `phase ${(i + 1)}/${WALK_PHASES}`, null));
    vignette(left, snapshotOf(leftResult, `phase ${(i + 1)}/${WALK_PHASES}`, null));
  }
  return WALK_PHASES * 2;
}

/** La section de récolte, à droite puis en miroir, aux cinq premiers contacts. */
function harvestSection(): number {
  const right = section('Récolte à droite, cible à 50 px');
  const left = section('Récolte à gauche, cible à 50 px');
  const rightAnimator = new BuilderAnimator();
  const leftAnimator = new BuilderAnimator();
  const rightInput: MotionInput = { walk: 0, speed: 0, fx: 1, acting: true, targetDx: HARVEST_REACH, targetDy: 0 };
  const leftInput: MotionInput = { walk: 0, speed: 0, fx: -1, acting: true, targetDx: -HARVEST_REACH, targetDy: 0 };
  const rightTarget = { x: HARVEST_REACH, y: 0 };
  const leftTarget = { x: -HARVEST_REACH, y: 0 };
  let rightFound = 0;
  let leftFound = 0;
  rightAnimator.step(0, rightInput);
  leftAnimator.step(0, leftInput);
  for (let i = 0; i < 600 && (rightFound < HARVEST_COUNT || leftFound < HARVEST_COUNT); i++) {
    if (rightFound < HARVEST_COUNT) {
      const result = rightAnimator.step(STEP, rightInput);
      if (result.contacts.length > 0) {
        rightFound++;
        vignette(right, snapshotOf(result, `coup ${result.contacts[0].index}`, rightTarget));
      }
    }
    if (leftFound < HARVEST_COUNT) {
      const result = leftAnimator.step(STEP, leftInput);
      if (result.contacts.length > 0) {
        leftFound++;
        vignette(left, snapshotOf(result, `coup ${result.contacts[0].index}`, leftTarget));
      }
    }
  }
  return rightFound + leftFound;
}

/** Une image capturée pendant la transition, avec son instant dans la boucle. */
interface TimedSnapshot {
  readonly result: MotionResult;
  readonly acting: boolean;
  readonly label: string;
}

/** Rejoue marche, récolte puis marche et capture huit images autour de chaque changement. */
function transitionSnapshots(): TimedSnapshot[] {
  const animator = new BuilderAnimator();
  const changeToHarvest = 0.5;
  const changeToWalk = 1.1;
  const captures = [
    0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7,
    0.95, 1.0, 1.05, 1.1, 1.15, 1.2, 1.25, 1.3,
  ];
  const out: TimedSnapshot[] = [];
  let next = 0;
  let sim = 0;
  animator.step(0, { walk: 0, speed: 1, fx: 1, acting: false, targetDx: 0, targetDy: 0 });
  while (next < captures.length) {
    const acting = sim >= changeToHarvest - 1e-9 && sim < changeToWalk - 1e-9;
    const input: MotionInput = { walk: sim * 10, speed: acting ? 0 : 1, fx: 1, acting, targetDx: HARVEST_REACH, targetDy: 0 };
    const result = animator.step(STEP, input);
    sim += STEP;
    while (next < captures.length && captures[next] <= sim + 1e-9) {
      out.push({ result, acting, label: `t = ${captures[next].toFixed(2)} s` });
      next++;
    }
  }
  return out;
}

/** La section des transitions entre marche et récolte. */
function transitionSection(): number {
  const row = section('Transition : marche, récolte, marche');
  const snapshots = transitionSnapshots();
  for (const timed of snapshots) {
    const target = timed.acting ? { x: HARVEST_REACH, y: 0 } : null;
    vignette(row, snapshotOf(timed.result, timed.label, target));
  }
  return snapshots.length;
}

/** Une image animée en boucle : 2 s de marche, 2 s de récolte, 1 s de repos. */
function animatedSection(): void {
  const row = section('En mouvement');
  const figure = document.createElement('figure');
  const caption = document.createElement('figcaption');
  caption.textContent = 'boucle : marche 2 s, récolte 2 s, repos 1 s';
  const canvas = document.createElement('canvas');
  figure.appendChild(caption);
  figure.appendChild(canvas);
  row.appendChild(figure);
  const ctx = prepare(canvas);
  const animator = new BuilderAnimator();
  const loop = 5;
  let sim = 0;
  let acc = 0;
  let last = 0;
  let result = animator.step(0, { walk: 0, speed: 1, fx: 1, acting: false, targetDx: 0, targetDy: 0 });

  const frame = (ts: number): void => {
    if (last === 0) last = ts;
    let dt = (ts - last) / 1000;
    last = ts;
    if (!Number.isFinite(dt) || dt < 0) dt = 0;
    acc += Math.min(dt, 0.05);
    while (acc >= STEP) {
      const phase = sim % loop;
      const acting = phase >= 2 && phase < 4;
      const speed = phase < 2 ? 1 : 0;
      const input: MotionInput = { walk: sim * 10, speed, fx: 1, acting, targetDx: HARVEST_REACH, targetDy: 0 };
      result = animator.step(STEP, input);
      sim += STEP;
      acc -= STEP;
    }
    const phase = sim % loop;
    const acting = phase >= 2 && phase < 4;
    grass(ctx);
    if (acting) {
      cross(pen(ctx), CENTER_X + HARVEST_REACH, CENTER_Y);
    }
    drawSnapshot(ctx, {
      frame: result.frame,
      facing: result.facing,
      offsetX: result.offsetX,
      offsetY: result.offsetY,
      target: null,
      label: '',
    });
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

/** Monte la page, dessine les sections fixes puis rend la main. */
function main(): void {
  let frames = 0;
  frames += reposeSection();
  frames += walkSection();
  frames += harvestSection();
  frames += transitionSection();
  animatedSection();
  window.__boxeur = { done: true, frames };
}

main();
