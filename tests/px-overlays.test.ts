import { describe, expect, it, vi } from 'vitest';
import type { Pen } from '../src/render/px/pen';
import type { Sprite } from '../src/render/px/sprite';
import type { Ring, RouteView } from '../src/render/px/types';
import { Status } from '../src/sim/ent';
import { C } from '../src/render/px/palette';
import { drawCauseBubble, drawGhost, drawRange, drawRing, drawRoute } from '../src/render/px/overlays';

vi.mock('../src/render/px/surface', () => ({
  makeSurface: (w: number, h: number) => {
    const ctx = {
      drawImage: () => undefined,
      fillRect: () => undefined,
      fillStyle: '',
      globalAlpha: 1,
      globalCompositeOperation: 'source-over',
    };
    return { canvas: { width: w, height: h }, ctx };
  },
}));

interface Call {
  m: string;
  args: unknown[];
}

interface Recorder {
  P: Pen;
  calls: Call[];
}

function recorder(): Recorder {
  const calls: Call[] = [];
  const P: Pen = {
    r: (a, b, w, h, col) => calls.push({ m: 'r', args: [a, b, w, h, col] }),
    p: (a, b, col) => calls.push({ m: 'p', args: [a, b, col] }),
    line: (x0, y0, x1, y1, col, th) => calls.push({ m: 'line', args: [x0, y0, x1, y1, col, th] }),
    ell: (cx, cy, rx, ry, col) => calls.push({ m: 'ell', args: [cx, cy, rx, ry, col] }),
    disc: (cx, cy, rad, col) => calls.push({ m: 'disc', args: [cx, cy, rad, col] }),
  };
  return { P, calls };
}

function signature(calls: readonly Call[]): string {
  return JSON.stringify(calls);
}

function colors(calls: readonly Call[]): string[] {
  return calls.flatMap((c) => c.args.filter((a): a is string => typeof a === 'string'));
}

function fakeCtx(): { ctx: CanvasRenderingContext2D; calls: Call[] } {
  const calls: Call[] = [];
  const ctx = {
    drawImage: (...args: unknown[]) => calls.push({ m: 'drawImage', args }),
  } as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  col: string;
}

function fakeTarget(): { ctx: CanvasRenderingContext2D; draws: unknown[][]; rects: Rect[] } {
  let fillStyle = '';
  const draws: unknown[][] = [];
  const rects: Rect[] = [];
  const ctx = {
    save: () => undefined,
    restore: () => undefined,
    imageSmoothingEnabled: true,
    globalAlpha: 1,
    get fillStyle() { return fillStyle; },
    set fillStyle(value: string) { fillStyle = value; },
    drawImage: (...args: unknown[]) => draws.push(args),
    fillRect: (x: number, y: number, w: number, h: number) => rects.push({ x, y, w, h, col: fillStyle }),
  } as unknown as CanvasRenderingContext2D;
  return { ctx, draws, rects };
}

function fakeSprite(): Sprite {
  return {
    img: { width: 50, height: 62 } as unknown as HTMLCanvasElement,
    shadow: { width: 50, height: 62 } as unknown as HTMLCanvasElement,
    up: 18,
    lights: [],
  };
}

describe('aperçu de pose', () => {
  it('ne teinte ni ne croise un aperçu accepté', () => {
    const sprite = fakeSprite();
    const { ctx, draws, rects } = fakeTarget();
    drawGhost(ctx, sprite, 10, 20, true);
    expect(draws).toHaveLength(1);
    expect(draws[0][0]).toBe(sprite.img);
    expect(rects).toHaveLength(0);
  });

  it('teinte un refus et pose une croix de 5×5 à cœur rouge au centre de l’emprise', () => {
    const sprite = fakeSprite();
    const { ctx, draws, rects } = fakeTarget();
    drawGhost(ctx, sprite, 10, 20, false);
    expect(draws).toHaveLength(1);
    expect(draws[0][0]).not.toBe(sprite.img);
    const cx = 10 + sprite.img.width / 2;
    const cy = 20 + sprite.img.height / 2 + sprite.up / 2;
    expect(rects).toEqual(expect.arrayContaining([
      { x: cx, y: cy - 2, w: 1, h: 5, col: C.ink },
      { x: cx - 2, y: cy, w: 5, h: 1, col: C.ink },
      { x: cx, y: cy, w: 1, h: 1, col: C.red },
    ]));
  });
});

describe('bulles de cause', () => {
  it('dessine une marque différente pour chaque cause', () => {
    const cases: readonly [Status, number][] = [
      [Status.NoInput, 0],
      [Status.Blocked, -1],
      [Status.NoPower, -1],
      [Status.NoResource, -1],
    ];
    const signatures = cases.map(([status, missing]) => {
      const { P, calls } = recorder();
      const { ctx } = fakeCtx();
      drawCauseBubble(P, ctx, 1, 1, status, missing, 0);
      return signature(calls);
    });
    expect(new Set(signatures).size).toBe(cases.length);
  });

  it('dessine l’objet manquant par itemImg quand il est fourni', () => {
    const { P, calls } = recorder();
    const { ctx, calls: blits } = fakeCtx();
    const image = {} as CanvasImageSource;
    drawCauseBubble(P, ctx, 1, 1, Status.NoInput, 3, 0, () => image);
    expect(blits).toHaveLength(1);
    expect(blits[0].args[0]).toBe(image);
    const without = recorder();
    const { ctx: bare } = fakeCtx();
    drawCauseBubble(without.P, bare, 1, 1, Status.NoInput, 3, 0);
    expect(signature(calls)).not.toBe(signature(without.calls));
  });

  it('flotte d’un pixel par paliers', () => {
    const first = recorder();
    const second = recorder();
    const { ctx: a } = fakeCtx();
    const { ctx: b } = fakeCtx();
    drawCauseBubble(first.P, a, 1, 1, Status.NoPower, -1, 0);
    drawCauseBubble(second.P, b, 1, 1, Status.NoPower, -1, 0.5);
    const firstY = first.calls[0].args[1];
    const secondY = second.calls[0].args[1];
    expect(typeof firstY).toBe('number');
    expect(firstY).not.toBe(secondY);
  });
});

describe('tracé de convoyeur', () => {
  const route: RouteView[] = [
    { x: 0, y: 0, dir: 0, ok: true },
    { x: 1, y: 0, dir: 1, ok: true },
    { x: 1, y: 1, dir: 1, ok: true },
  ];

  it('colore les cases refusées autrement que les cases acceptées', () => {
    const accepted = recorder();
    drawRoute(accepted.P, route, true, 0);
    const refused = recorder();
    const broken = route.map((t, i) => (i === 1 ? { ...t, ok: false } : t));
    drawRoute(refused.P, broken, false, 0);

    expect(signature(refused.calls)).not.toBe(signature(accepted.calls));
    expect(colors(accepted.calls)).toContain(C.o1);
    expect(colors(accepted.calls)).not.toContain(C.red);
    expect(colors(refused.calls)).toContain(C.red);
  });

  it('ne dessine rien pour un tracé vide', () => {
    const { P, calls } = recorder();
    drawRoute(P, [], false, 0);
    expect(calls).toHaveLength(0);
  });

  it('pose un repère au bout quand le tapis se déverse dans une machine', () => {
    const into = recorder();
    drawRoute(into.P, route, true, 0);
    const dead = recorder();
    drawRoute(dead.P, route, false, 0);
    expect(into.calls.length).toBeGreaterThan(dead.calls.length);
  });
});

describe('onde', () => {
  const ring: Ring = { x: 4, y: 4, t0: 0, color: C.o1, size: 3, dur: 1 };

  it('s’élargit pendant sa durée', () => {
    const { P, calls } = recorder();
    drawRing(P, ring, 0.5);
    expect(calls.length).toBeGreaterThan(0);
  });

  it('ne dessine plus rien après sa durée', () => {
    const { P, calls } = recorder();
    drawRing(P, ring, 1.5);
    expect(calls).toHaveLength(0);
  });

  it('ne dessine rien avant son départ ni pour une durée nulle', () => {
    const before = recorder();
    drawRing(before.P, ring, -0.1);
    expect(before.calls).toHaveLength(0);
    const zero = recorder();
    drawRing(zero.P, { ...ring, dur: 0 }, 0);
    expect(zero.calls).toHaveLength(0);
  });
});

describe('portée', () => {
  it('ne dessine que pour une machine à portée', () => {
    const saw = recorder();
    drawRange(saw.P, 'scierie', 0, 0, 2, 2, 0);
    expect(saw.calls.length).toBeGreaterThan(0);
    const other = recorder();
    drawRange(other.P, 'tour', 0, 0, 3, 3, 0);
    drawRange(other.P, 'inconnu', 0, 0, 1, 1, 0);
    expect(other.calls).toHaveLength(0);
  });
});
