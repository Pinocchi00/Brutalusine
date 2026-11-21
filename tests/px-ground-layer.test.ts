import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHUNK, Chunk, World } from '../src/sim/world';
import { TREE_MIN } from '../src/sim/data';
import { GroundLayer } from '../src/render/px/groundLayer';
import { paintTiles, type GroundSource } from '../src/render/px/groundPaint';
import type { PixelView } from '../src/render/px/view';

const TILE_PX = 24;
const BLOCK_PX = CHUNK * TILE_PX;
const CODES = CHUNK + 2;

/** Un appel de copie dans une surface observé par le faux canevas. */
interface Blit {
  canvas: FakeCanvas;
  data: Uint8ClampedArray;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Le strict nécessaire d'un contexte 2D pour la couche et le crayon. */
class FakeContext {
  fillStyle = '';
  imageSmoothingEnabled = true;
  rects = 0;

  constructor(private readonly canvas: FakeCanvas) {}

  putImageData(image: { data: Uint8ClampedArray; width: number; height: number }, x: number, y: number): void {
    blits.push({ canvas: this.canvas, data: Uint8ClampedArray.from(image.data), x, y, w: image.width, h: image.height });
  }

  fillRect(): void {
    this.rects++;
  }

  drawImage(): void {}
}

/** Une fausse surface de dessin. */
class FakeCanvas {
  width = 0;
  height = 0;
  readonly ctx = new FakeContext(this);

  getContext(): FakeContext {
    return this.ctx;
  }
}

/** Un faux `ImageData` qui garde ses données. */
class FakeImageData {
  constructor(
    public data: Uint8ClampedArray,
    public width: number,
    public height: number,
  ) {}
}

let blits: Blit[] = [];
let created: FakeCanvas[] = [];

beforeEach(() => {
  blits = [];
  created = [];
  vi.stubGlobal('ImageData', FakeImageData);
  vi.stubGlobal('document', {
    createElement: (): FakeCanvas => {
      const canvas = new FakeCanvas();
      created.push(canvas);
      return canvas;
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Une vue qui couvre exactement ces cases. */
function viewOf(tx0: number, ty0: number, tx1: number, ty1: number): PixelView {
  return {
    scale: 1,
    screenW: (tx1 - tx0 + 1) * TILE_PX,
    screenH: (ty1 - ty0 + 1) * TILE_PX,
    bufW: (tx1 - tx0 + 1) * TILE_PX,
    bufH: (ty1 - ty0 + 1) * TILE_PX,
    originX: tx0 * TILE_PX,
    originY: ty0 * TILE_PX,
    blitX: 0,
    blitY: 0,
    tileX0: tx0,
    tileY0: ty0,
    tileX1: tx1,
    tileY1: ty1,
  };
}

/** Avance jusqu'à ce qu'une image ne lance plus aucune copie. */
function settle(layer: GroundLayer, world: World, view: PixelView, frame: number): number {
  for (let i = 0; i < 400; i++) {
    const before = blits.length;
    layer.update(world, view, frame++);
    if (blits.length === before) return frame;
  }
  throw new Error('le sol ne finit pas');
}

/** Le nombre d'octets qui diffèrent entre deux peintures. */
function differences(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  let n = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) n++;
  }
  return n;
}

/** La peinture attendue d'un bloc, faite directement avec les cases monde. */
function expected(world: World, chunk: Chunk): Uint8ClampedArray {
  const out = new Uint8ClampedArray(BLOCK_PX * BLOCK_PX * 4);
  const slab = new Uint8Array(CODES * CODES);
  const bx = chunk.cx * CHUNK;
  const by = chunk.cy * CHUNK;
  for (let cy = 0; cy < CODES; cy++) {
    const y = by + cy - 1;
    for (let cx = 0; cx < CODES; cx++) {
      const x = bx + cx - 1;
      const c = world.at(x, y, false);
      slab[cy * CODES + cx] = c ? c.slab[((y & 31) << 5) | (x & 31)] : 0;
    }
  }
  const source: GroundSource = {
    seed: world.seed,
    originX: bx,
    originY: by,
    shore: chunk.shore,
    ford: chunk.ford,
    paths: world.pathSegments(chunk.cx, chunk.cy),
    slab,
    loot: chunk.loot,
  };
  paintTiles(source, out, bx, by, bx + CHUNK, by + CHUNK);
  return out;
}

/** Rassemble les rangées copiées dans la surface d'un bloc. */
function assemble(canvas: FakeCanvas): Uint8ClampedArray {
  const out = new Uint8ClampedArray(BLOCK_PX * BLOCK_PX * 4);
  for (const b of blits) {
    if (b.canvas !== canvas) continue;
    for (let row = 0; row < b.h; row++) {
      const from = row * b.w * 4;
      const to = ((b.y + row) * BLOCK_PX + b.x) * 4;
      out.set(b.data.subarray(from, from + b.w * 4), to);
    }
  }
  return out;
}

describe('coordonnées du sol', () => {
  it('peint un bloc en coordonnées négatives au bon endroit du monde', () => {
    const world = new World(4242);
    const chunk = world.chunk(-10, -10);
    expect(chunk).not.toBeNull();
    world.setSlab(-320, -320, 1);
    const layer = new GroundLayer();
    settle(layer, world, viewOf(-320, -320, -289, -289), 0);
    expect(created.length).toBe(1);
    expect(differences(assemble(created[0]), expected(world, chunk!))).toBe(0);
  });

  it('donne exactement la même peinture pour un même monde', () => {
    const world = new World(99);
    world.chunk(-10, -10);
    const view = viewOf(-320, -320, -289, -289);
    const first = new GroundLayer();
    settle(first, world, view, 0);
    const firstImage = assemble(created[0]);
    const second = new GroundLayer();
    settle(second, world, view, 0);
    expect(created.length).toBe(2);
    expect(differences(firstImage, assemble(created[1]))).toBe(0);
  });
});

describe('retouches du sol', () => {
  /** Peint un bloc complet et rend la couche prête pour une retouche. */
  function ready(seed: number): { world: World; view: PixelView; layer: GroundLayer } {
    const world = new World(seed);
    const view = viewOf(0, 0, 31, 31);
    const layer = new GroundLayer();
    settle(layer, world, view, 0);
    return { world, view, layer };
  }

  it('ne repeint rien quand seule la canopée change', () => {
    const { world, view, layer } = ready(11);
    const mark = blits.length;
    world.setCanopy(10, 10, 220);
    settle(layer, world, view, 100);
    expect(blits.length).toBe(mark);
  });

  it('ne repeint qu’autour d’une dalle posée', () => {
    const { world, view, layer } = ready(12);
    const mark = blits.length;
    world.setSlab(10, 10, 1);
    settle(layer, world, view, 100);
    const fresh = blits.slice(mark);
    expect(fresh.length).toBe(1);
    expect(fresh[0]).toMatchObject({ x: 9 * TILE_PX, y: 9 * TILE_PX, w: 3 * TILE_PX, h: 3 * TILE_PX });
  });

  it('ne repeint qu’autour d’un débris posé', () => {
    const { world, view, layer } = ready(13);
    const chunk = world.chunk(0, 0)!;
    const mark = blits.length;
    chunk.loot[(5 << 5) | 5] = 1;
    settle(layer, world, view, 100);
    const fresh = blits.slice(mark);
    expect(fresh.length).toBe(1);
    expect(fresh[0]).toMatchObject({ x: 4 * TILE_PX, y: 4 * TILE_PX, w: 3 * TILE_PX, h: 3 * TILE_PX });
  });

  it('retouche le bloc voisin quand une dalle est posée au bord', () => {
    const world = new World(21);
    world.chunk(1, 0);
    const view = viewOf(0, 0, 63, 31);
    const layer = new GroundLayer();
    settle(layer, world, view, 0);
    const mark = blits.length;
    world.setSlab(31, 5, 1);
    settle(layer, world, view, 100);
    const fresh = blits.slice(mark);
    expect(new Set(fresh.map((b) => b.canvas)).size).toBe(2);
    expect(fresh.some((b) => b.x === 0 && b.y === 4 * TILE_PX && b.w === TILE_PX)).toBe(true);
  });
});

describe('cases bloquées', () => {
  it('bloque une entité, une dalle, un gisement ou un arbre', () => {
    const world = new World(31);
    const layer = new GroundLayer();
    layer.update(world, viewOf(-100, -100, -100, -100), 0);
    const chunk = world.chunk(0, 0)!;
    const i = (5 << 5) | 5;
    chunk.ent[i] = 0;
    chunk.slab[i] = 0;
    chunk.deposit[i] = 0;
    chunk.canopy[i] = 0;
    expect(layer.blocked(5, 5)).toBe(false);
    chunk.canopy[i] = TREE_MIN - 1;
    expect(layer.blocked(5, 5)).toBe(false);
    chunk.canopy[i] = TREE_MIN;
    expect(layer.blocked(5, 5)).toBe(true);
    chunk.canopy[i] = 0;
    chunk.ent[i] = 7;
    expect(layer.blocked(5, 5)).toBe(true);
    chunk.ent[i] = 0;
    chunk.slab[i] = 1;
    expect(layer.blocked(5, 5)).toBe(true);
    chunk.slab[i] = 0;
    chunk.deposit[i] = 1;
    expect(layer.blocked(5, 5)).toBe(true);
  });
});

describe('vie du sol', () => {
  it('ne dessine pas la vie d’un bloc dont la surface a disparu du cache', () => {
    const world = new World(11);
    const view = viewOf(0, 0, 31, 31);
    const layer = new GroundLayer();
    settle(layer, world, view, 0);
    const ctx = new FakeCanvas().ctx as unknown as CanvasRenderingContext2D;
    const fake = ctx as unknown as FakeContext;
    layer.drawLife(ctx, view, 0);
    expect(fake.rects).toBeGreaterThan(0);
    const internals = layer as unknown as { cache: { clear(): void } };
    internals.cache.clear();
    fake.rects = 0;
    layer.drawLife(ctx, view, 0);
    expect(fake.rects).toBe(0);
  });
});

describe('blocs du monde', () => {
  it('ne crée aucun bloc pendant le rendu', () => {
    const world = new World(41);
    const before = world.chunks.size;
    expect(world.chunk(1, 0, false)).toBeNull();
    const view = viewOf(0, 0, 63, 31);
    const layer = new GroundLayer();
    settle(layer, world, view, 0);
    const ctx = new FakeCanvas().ctx as unknown as CanvasRenderingContext2D;
    layer.drawGround(ctx);
    layer.drawLife(ctx, view, 0);
    expect(world.chunk(1, 0, false)).toBeNull();
    expect(world.chunks.size).toBe(before);
  });

  it('ne crée aucun bloc dans une région entièrement vide', () => {
    const world = new World(42);
    const before = world.chunks.size;
    const layer = new GroundLayer();
    const view = viewOf(1000, 1000, 1063, 1031);
    settle(layer, world, view, 0);
    expect(world.chunks.size).toBe(before);
  });
});
