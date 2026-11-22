import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHUNK, Chunk, World } from '../src/sim/world';
import { TREE_MIN } from '../src/sim/data';
import { GroundLayer, lifeFits, lifeGround, warmGroundSource } from '../src/render/px/groundLayer';
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
    chunk.loot[i] = 0;
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
    chunk.deposit[i] = 0;
    chunk.loot[i] = 1;
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

/** Une horloge factice qui rend les valeurs fournies, puis répète la dernière. */
class ScriptClock {
  private values: number[] = [];
  private index = 0;

  readonly now = (): number => {
    const last = Math.max(0, this.values.length - 1);
    const value = this.values[Math.min(this.index, last)] ?? 0;
    this.index++;
    return value;
  };

  script(values: number[]): void {
    this.values = values;
    this.index = 0;
  }
}

/** Ce que les tests observent de l'état interne de la couche. */
interface LayerInternals {
  life: Map<Chunk, { life: unknown; seen: number }>;
  lifeRecent: number[];
  lifeEstimate: number;
  preparedEstimate: number;
  lifeDeferred: number;
}

/** La couche vue par ses tests : mêmes objets, champs privés compris. */
function internalsOf(layer: GroundLayer): LayerInternals {
  return layer as unknown as LayerInternals;
}

/** Une couche peinte et prête, son horloge factice et ses entrailles. */
function preparedLayer(seed: number): {
  clock: ScriptClock;
  world: World;
  view: PixelView;
  layer: GroundLayer;
  internals: LayerInternals;
} {
  const clock = new ScriptClock();
  const world = new World(seed);
  const view = viewOf(0, 0, 31, 31);
  const layer = new GroundLayer({ now: clock.now });
  settle(layer, world, view, 0);
  return { clock, world, view, layer, internals: internalsOf(layer) };
}

describe('budget de la vie du sol', () => {
  it('lifeFits respecte les bornes, égalité comprise', () => {
    expect(lifeFits(0, 4)).toBe(true);
    expect(lifeFits(1, 3)).toBe(true);
    expect(lifeFits(2, 2)).toBe(true);
    expect(lifeFits(2, 2.001)).toBe(false);
    expect(lifeFits(3, 1, 5)).toBe(true);
    expect(lifeFits(3, 2.001, 5)).toBe(false);
  });

  it('reporte la vie quand la peinture a déjà consommé le temps, puis la prépare', () => {
    const { clock, world, view, layer, internals } = preparedLayer(51);
    internals.life.clear();
    internals.lifeEstimate = 2;
    clock.script([0, 0, 3, 9, 9, 9]);
    layer.update(world, view, 10);
    expect(internals.life.size).toBe(0);
    clock.script([0, 0, 0, 0, 0, 0]);
    layer.update(world, view, 11);
    expect(internals.life.size).toBe(1);
  });

  it('garde le maximum des huit derniers coûts et oublie les plus anciens', () => {
    const { clock, world, view, layer, internals } = preparedLayer(52);
    const costs = [50, 1, 2, 3, 4, 5, 6, 7, 8];
    for (let i = 0; i < costs.length; i++) {
      internals.life.clear();
      const cost = costs[i];
      clock.script([0, 0, 0, 10, 10 + cost, 10 + cost]);
      layer.update(world, view, 10 + i);
    }
    expect(internals.lifeRecent.length).toBe(8);
    expect(internals.lifeEstimate).toBe(8);
  });

  it('lance la vie malgré une estimation au-dessus du plafond quand rien n’a été peint', () => {
    const { clock, world, view, layer, internals } = preparedLayer(53);
    internals.life.clear();
    internals.lifeEstimate = 100;
    clock.script([5, 5, 5, 5, 5, 5]);
    layer.update(world, view, 10);
    expect(internals.life.size).toBe(1);
  });

  it('clear remet l’estimation à son état initial', () => {
    const { clock, world, view, layer, internals } = preparedLayer(54);
    internals.life.clear();
    clock.script([0, 0, 0, 20, 30, 30]);
    layer.update(world, view, 10);
    expect(internals.lifeEstimate).toBe(10);
    layer.clear();
    expect(internals.lifeEstimate).toBe(1);
    expect(internals.lifeRecent.length).toBe(0);
  });

  it('mesure groundMs avec l’horloge injectée', () => {
    const { clock, world, view, layer, internals } = preparedLayer(55);
    internals.life.clear();
    clock.script([10, 10, 10, 10, 10, 17]);
    layer.update(world, view, 10);
    expect(layer.groundMs).toBe(7);
  });

  it('continue de marquer les blocs vus quand le calcul est reporté', () => {
    const clock = new ScriptClock();
    const world = new World(56);
    world.chunk(1, 0);
    const view = viewOf(0, 0, 63, 31);
    const layer = new GroundLayer({ now: clock.now });
    settle(layer, world, view, 0);
    const internals = internalsOf(layer);
    for (let i = 0; i < 10 && internals.life.size < 2; i++) {
      clock.script([0]);
      layer.update(world, view, 10 + i);
    }
    expect(internals.life.size).toBe(2);
    const chunks = [...internals.life.keys()];
    internals.life.delete(chunks[0]);
    const kept = chunks[1];
    internals.lifeEstimate = 2;
    clock.script([0, 0, 3, 9, 9, 9]);
    layer.update(world, view, 100);
    expect(internals.life.has(chunks[0])).toBe(false);
    expect(internals.life.get(kept)?.seen).toBe(100);
  });
});

/** Une horloge factice dont chaque mesure coûte le budget fourni, dans l'ordre. */
class CostClock {
  private call = 0;
  private total = 0;

  constructor(private readonly costs: number[]) {}

  readonly now = (): number => {
    const measurement = Math.floor(this.call / 2);
    if (this.call % 2 === 0) {
      this.call++;
      return this.total;
    }
    this.total += this.costs[measurement] ?? 0;
    this.call++;
    return this.total;
  };
}

describe('préchauffage du sol', () => {
  it('décrit une source complète et déterministe', () => {
    const first = warmGroundSource();
    const second = warmGroundSource();
    expect(first.originX).toBe(0);
    expect(first.originY).toBe(0);
    expect(first.shore.length).toBe(33 * 33);
    expect(first.ford.length).toBe(33 * 33);
    expect(first.slab.length).toBe(34 * 34);
    expect(first.loot.length).toBe(32 * 32);
    expect(first.paths.length).toBeGreaterThan(0);
    expect(Array.from(first.shore)).toEqual(Array.from(second.shore));
    expect(Array.from(first.ford)).toEqual(Array.from(second.ford));
    expect(Array.from(first.slab)).toEqual(Array.from(second.slab));
    expect(Array.from(first.loot)).toEqual(Array.from(second.loot));
    expect(first.paths).toEqual(second.paths);
  });

  it('contient de l’eau, de la terre, un gué, une dalle, un débris et un sentier', () => {
    const source = warmGroundSource();
    const shore = Array.from(source.shore);
    const ford = Array.from(source.ford);
    expect(shore.some((value) => value < 0)).toBe(true);
    expect(shore.some((value) => value > 0)).toBe(true);
    expect(ford.some((value) => value > 0 && value < 1)).toBe(true);
    expect(ford.some((value) => value >= 1)).toBe(true);
    expect(Array.from(source.slab).some((value) => value !== 0)).toBe(true);
    expect(Array.from(source.loot).filter((value) => value !== 0).length).toBe(2);
    expect(source.paths.length).toBeGreaterThan(0);
  });

  it('prepare ne peint aucun bloc, ne crée aucune vie et laisse groundMs à 0', () => {
    const layer = new GroundLayer();
    const internals = internalsOf(layer);
    const beforeCreated = created.length;
    const beforeBlits = blits.length;
    layer.prepare();
    expect(created.length).toBe(beforeCreated);
    expect(blits.length).toBe(beforeBlits);
    expect(internals.life.size).toBe(0);
    expect(layer.groundMs).toBe(0);
  });

  it('prepare retient le maximum des trois derniers coûts, qui survit à clear', () => {
    const costs = new Array<number>(104).fill(0);
    costs[101] = 6;
    costs[102] = 11;
    costs[103] = 4;
    const clock = new CostClock(costs);
    const layer = new GroundLayer({ now: clock.now });
    const internals = internalsOf(layer);
    layer.prepare();
    expect(internals.preparedEstimate).toBe(11);
    layer.clear();
    expect(internals.preparedEstimate).toBe(11);
    expect(internals.lifeEstimate).toBe(11);
    expect(internals.lifeRecent.length).toBe(0);
  });
});

describe('reports bornés de la vie du sol', () => {
  it('finit par laisser passer un calcul malgré une estimation très haute', () => {
    const { clock, world, view, layer, internals } = preparedLayer(57);
    internals.life.clear();
    internals.lifeEstimate = 100;
    let frames = 0;
    while (internals.life.size === 0 && frames <= 60) {
      clock.script([0, 0, 3, 9, 9, 9]);
      layer.update(world, view, 10 + frames);
      frames++;
    }
    expect(internals.life.size).toBe(1);
    expect(frames).toBeLessThanOrEqual(60);
  });

  it('force un calcul au plus tard après soixante reports', () => {
    const { clock, world, view, layer, internals } = preparedLayer(58);
    internals.life.clear();
    internals.lifeEstimate = 100;
    for (let i = 0; i < 60; i++) {
      clock.script([0, 0, 3.9, 4, 4, 4]);
      layer.update(world, view, 10 + i);
    }
    expect(internals.life.size).toBe(0);
    expect(internals.lifeDeferred).toBe(60);
    clock.script([0, 0, 3.9, 4, 4, 4]);
    layer.update(world, view, 200);
    expect(internals.life.size).toBe(1);
    expect(internals.lifeDeferred).toBe(0);
  });

  it('ne laisse jamais l’estimation à zéro', () => {
    const constant = (): number => 7;
    const world = new World(59);
    const view = viewOf(0, 0, 31, 31);
    const layer = new GroundLayer({ now: constant });
    settle(layer, world, view, 0);
    expect(internalsOf(layer).lifeEstimate).toBe(0.5);
    const warm = new GroundLayer({ now: constant });
    warm.prepare();
    expect(internalsOf(warm).preparedEstimate).toBe(1);
    expect(internalsOf(warm).lifeEstimate).toBe(1);
  });
});

describe('codes de sol du préchauffage', () => {
  it('lifeGround produit les cinq codes 0, 1, 2, 3 et 4', () => {
    const ground = lifeGround(warmGroundSource());
    const codes = new Set(Array.from(ground));
    for (const code of [0, 1, 2, 3, 4]) {
      expect(codes.has(code)).toBe(true);
    }
  });
});
