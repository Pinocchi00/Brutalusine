import { describe, expect, it } from 'vitest';
import { GroundCache, type GroundCacheDeps } from '../src/render/px/groundCache';

/** Le nombre de codes par côté, marge comprise. */
const CODES = 34;

/** Un faux bloc : ses codes et le coût d'une de ses peintures. */
interface FakeChunk {
  id: string;
  codes: Uint8Array;
  cost: number;
}

/** Une fausse surface hors écran. */
interface FakeSurface {
  id: number;
}

/** Un appel de peinture observé. */
interface PaintCall {
  chunk: FakeChunk;
  tx0: number;
  ty0: number;
  tx1: number;
  ty1: number;
  width: number;
  height: number;
}

/** Un appel de copie observé. */
interface BlitCall {
  surface: FakeSurface;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Une fausse horloge, un faux peintre et un faux créateur de surfaces. */
class Fake {
  time = 0;
  created = 0;
  paints: PaintCall[] = [];
  blits: BlitCall[] = [];
  onPaint: ((call: PaintCall) => void) | null = null;
  readonly deps: GroundCacheDeps<FakeChunk, FakeSurface> = {
    readCodes: (chunk, out) => {
      out.set(chunk.codes);
    },
    paint: (chunk, out, tx0, ty0, tx1, ty1) => {
      const width = (tx1 - tx0) * 24;
      const height = (ty1 - ty0) * 24;
      const call: PaintCall = { chunk, tx0, ty0, tx1, ty1, width, height };
      this.paints.push(call);
      out.fill(1, 0, Math.min(out.length, width * height * 4));
      this.time += chunk.cost;
      if (this.onPaint) this.onPaint(call);
    },
    createSurface: () => ({ id: ++this.created }),
    blit: (surface, data, x, y, w, h) => {
      this.blits.push({ surface, x, y, w, h });
    },
    now: () => this.time,
  };

  /** Fabrique un bloc sans code dessiné. */
  chunk(id: string, cost = 0): FakeChunk {
    return { id, codes: new Uint8Array(CODES * CODES), cost };
  }

  /** Ouvre un cache branché sur cette fausse horloge. */
  cache(budgetMs = 4, limit = 64): GroundCache<FakeChunk, FakeSurface> {
    return new GroundCache(this.deps, { budgetMs, limit });
  }
}

/** Change le code d'une case du bloc, marge comprise. */
function setCode(chunk: FakeChunk, lx: number, ly: number, value: number): void {
  chunk.codes[(ly + 1) * CODES + (lx + 1)] = value;
}

/** Les appels de peinture à partir d'un point. */
function after(fake: Fake, index: number): PaintCall[] {
  return fake.paints.slice(index);
}

describe('peinture par rangées', () => {
  it('demande 32 rangées et ne rend le bloc qu’à la dernière', () => {
    const fake = new Fake();
    const a = fake.chunk('a', 1);
    const cache = fake.cache();
    for (let frame = 0; frame < 8; frame++) {
      cache.update([a], [], frame);
      const rows = fake.paints.filter((call) => call.chunk === a).length;
      expect(rows).toBe(Math.min(32, (frame + 1) * 4));
      if (rows < 32) expect(cache.get(a)).toBeNull();
      else expect(cache.get(a)).not.toBeNull();
    }
    expect(fake.paints.length).toBe(32);
    expect(cache.get(a)).not.toBeNull();
  });

  it('peint chaque rangée en 32×1 cases et la copie en 768×24 pixels', () => {
    const fake = new Fake();
    const a = fake.chunk('a');
    const cache = fake.cache();
    cache.update([a], [], 0);
    expect(fake.paints.every((call) => call.tx0 === 0 && call.tx1 === 32 && call.ty1 - call.ty0 === 1)).toBe(true);
    expect(fake.blits.length).toBe(32);
    expect(fake.blits[5]).toMatchObject({ x: 0, y: 5 * 24, w: 768, h: 24 });
  });
});

describe('budget', () => {
  it('ne lance que quatre rangées à 1 ms par image', () => {
    const fake = new Fake();
    const a = fake.chunk('a', 1);
    const cache = fake.cache(4);
    cache.update([a], [], 0);
    expect(fake.paints.length).toBe(4);
  });

  it('ne lance qu’une rangée à 10 ms par image', () => {
    const fake = new Fake();
    const a = fake.chunk('a', 10);
    const cache = fake.cache(4);
    cache.update([a], [], 0);
    expect(fake.paints.length).toBe(1);
  });

  it('reste prudent quand le coût augmente puis baisse', () => {
    const fake = new Fake();
    const a = fake.chunk('a', 1);
    const cache = fake.cache(4);
    cache.update([a], [], 0);
    expect(fake.paints.length).toBe(4);
    a.cost = 10;
    let mark = fake.paints.length;
    cache.update([a], [], 1);
    expect(after(fake, mark).length).toBe(1);
    a.cost = 1;
    mark = fake.paints.length;
    cache.update([a], [], 2);
    expect(after(fake, mark).length).toBe(1);
  });
});

describe('priorité', () => {
  it('peint les blocs visibles avant les voisins', () => {
    const fake = new Fake();
    const a = fake.chunk('a');
    const b = fake.chunk('b');
    const cache = fake.cache();
    cache.update([a], [b], 0);
    expect(fake.paints[0].chunk).toBe(a);
    expect(fake.paints.findIndex((call) => call.chunk === b)).toBe(32);
  });

  it('applique les retouches avant de peindre un nouveau bloc', () => {
    const fake = new Fake();
    const a = fake.chunk('a');
    const b = fake.chunk('b');
    const cache = fake.cache();
    cache.update([a], [], 0);
    setCode(a, 10, 10, 7);
    const mark = fake.paints.length;
    cache.update([a, b], [], 1);
    const fresh = after(fake, mark);
    expect(fresh[0].chunk).toBe(a);
    expect(fresh[0]).toMatchObject({ tx0: 9, ty0: 9, tx1: 12, ty1: 12 });
    expect(fresh[1].chunk).toBe(b);
  });

  it('double un bloc sorti de la vue puis reprend sa rangée', () => {
    const fake = new Fake();
    const a = fake.chunk('a', 1);
    const b = fake.chunk('b', 1);
    const cache = fake.cache(1);
    cache.update([a], [], 0);
    cache.update([b], [], 1);
    cache.update([a], [], 2);
    const rows = fake.paints.filter((call) => call.chunk === a).map((call) => call.ty0);
    expect(rows).toEqual([0, 1]);
  });
});

describe('retouches', () => {
  /** Peint un bloc entier et rend le cache prêt pour une retouche. */
  function ready(): { fake: Fake; a: FakeChunk; cache: GroundCache<FakeChunk, FakeSurface> } {
    const fake = new Fake();
    const a = fake.chunk('a');
    const cache = fake.cache();
    cache.update([a], [], 0);
    expect(cache.get(a)).not.toBeNull();
    return { fake, a, cache };
  }

  it('repeint 3×3 cases pour une case au milieu', () => {
    const { fake, a, cache } = ready();
    setCode(a, 10, 10, 7);
    const mark = fake.paints.length;
    cache.update([a], [], 1);
    const rects = after(fake, mark);
    expect(rects.length).toBe(1);
    expect(rects[0]).toMatchObject({ tx0: 9, ty0: 9, tx1: 12, ty1: 12 });
  });

  it('limite la retouche au bloc quand la case est au bord', () => {
    const { fake, a, cache } = ready();
    setCode(a, 0, 0, 7);
    const mark = fake.paints.length;
    cache.update([a], [], 1);
    const rects = after(fake, mark);
    expect(rects.length).toBe(1);
    expect(rects[0]).toMatchObject({ tx0: 0, ty0: 0, tx1: 2, ty1: 2 });
  });

  it('repeint le bord quand le changement est dans la marge', () => {
    const { fake, a, cache } = ready();
    setCode(a, -1, 5, 7);
    const mark = fake.paints.length;
    cache.update([a], [], 1);
    const rects = after(fake, mark);
    expect(rects.length).toBe(1);
    expect(rects[0]).toMatchObject({ tx0: 0, ty0: 4, tx1: 1, ty1: 7 });
  });

  it('donne deux rectangles pour deux changements éloignés', () => {
    const { fake, a, cache } = ready();
    setCode(a, 5, 5, 7);
    setCode(a, 20, 20, 8);
    const mark = fake.paints.length;
    cache.update([a], [], 1);
    const rects = after(fake, mark);
    expect(rects.length).toBe(2);
    expect(rects[0]).toMatchObject({ tx0: 4, ty0: 4, tx1: 7, ty1: 7 });
    expect(rects[1]).toMatchObject({ tx0: 19, ty0: 19, tx1: 22, ty1: 22 });
  });

  it('rattrape un changement survenu pendant la peinture initiale', () => {
    const fake = new Fake();
    const a = fake.chunk('a');
    const cache = fake.cache();
    let changed = false;
    fake.onPaint = (call) => {
      if (call.chunk === a && call.ty0 === 3 && !changed) {
        changed = true;
        setCode(a, 10, 10, 9);
      }
    };
    cache.update([a], [], 0);
    expect(cache.get(a)).not.toBeNull();
    const mark = fake.paints.length;
    cache.update([a], [], 1);
    const rects = after(fake, mark);
    expect(rects.length).toBe(1);
    expect(rects[0]).toMatchObject({ tx0: 9, ty0: 9, tx1: 12, ty1: 12 });
  });
});

describe('mémoire', () => {
  it('garde tous les visibles même au-delà de la limite', () => {
    const fake = new Fake();
    const a = fake.chunk('a');
    const b = fake.chunk('b');
    const c = fake.chunk('c');
    const cache = fake.cache(4, 1);
    cache.update([a, b], [c], 0);
    expect(cache.get(a)).not.toBeNull();
    expect(cache.get(b)).not.toBeNull();
    expect(cache.get(c)).toBeNull();
    expect(fake.created).toBe(2);
  });

  it('ne garde qu’une surface hors visibles et la réutilise', () => {
    const fake = new Fake();
    const a = fake.chunk('a');
    const b = fake.chunk('b');
    const cache = fake.cache(4, 1);
    cache.update([], [a], 0);
    cache.update([], [b], 1);
    expect(fake.created).toBe(1);
    expect(cache.get(a)).toBeNull();
    expect(cache.get(b)).not.toBeNull();
  });

  it('libère les voisins les plus anciens sans toucher au visible', () => {
    const fake = new Fake();
    const a = fake.chunk('a');
    const b = fake.chunk('b');
    const c = fake.chunk('c');
    const d = fake.chunk('d');
    const cache = fake.cache(4, 2);
    cache.update([a], [b, c, d], 0);
    expect(cache.get(a)).not.toBeNull();
    expect(cache.get(b)).toBeNull();
    expect(cache.get(c)).toBeNull();
    expect(cache.get(d)).not.toBeNull();
    // A et B ouvrent deux surfaces ; C et D réutilisent celle de B.
    expect(fake.created).toBe(2);
  });
});

describe('clear', () => {
  it('oublie un bloc à moitié peint et repart de zéro', () => {
    const fake = new Fake();
    const a = fake.chunk('a', 1);
    const cache = fake.cache(1);
    cache.update([a], [], 0);
    expect(cache.get(a)).toBeNull();
    cache.clear();
    expect(cache.get(a)).toBeNull();
    const mark = fake.paints.length;
    cache.update([a], [], 1);
    expect(after(fake, mark)[0].ty0).toBe(0);
    expect(fake.created).toBe(2);
  });
});
