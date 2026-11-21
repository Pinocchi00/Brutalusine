/**
 * La vie du sol, vérifiée hors navigateur : mêmes pixels que la maquette pour une touffe,
 * un roseau et un nénuphar, clapotis le long de la ligne zéro, placements et plafond d'appels.
 */
import { describe, expect, it } from 'vitest';
import { C } from '../src/render/px/palette';
import { pen, type Pen } from '../src/render/px/pen';
import {
  contourSegments,
  drawGroundLife,
  layoutLife,
  type GroundLife,
  type GroundLily,
  type GroundReed,
  type GroundTuft,
  type LifeSource,
} from '../src/render/px/groundLife';

const T = 24;

type Call = ['style', string] | ['rect', number, number, number, number];

/** Un faux contexte 2D qui note chaque appel dans l'ordre. */
function recorder(): { ctx: { fillStyle: string; fillRect(x: number, y: number, w: number, h: number): void }; calls: Call[] } {
  const calls: Call[] = [];
  const ctx = {
    _style: '',
    get fillStyle(): string { return this._style; },
    set fillStyle(v: string) {
      this._style = v;
      calls.push(["style", v]);
    },
    fillRect(x: number, y: number, w: number, h: number): void { calls.push(['rect', x, y, w, h]); },
  };
  return { ctx, calls };
}

/** Un crayon qui rastérise les pixels dans une table : les appels groupés se comparent aux appels isolés. */
function rasterPen(): { P: Pen; pixels: Map<string, string> } {
  const pixels = new Map<string, string>();
  const put = (a: number, b: number, col: string): void => {
    pixels.set(`${a},${b}`, col);
  };
  const r = (a: number, b: number, w: number, h: number, col: string): void => {
    a = Math.round(a);
    b = Math.round(b);
    w = Math.round(w);
    h = Math.round(h);
    if (w <= 0 || h <= 0) return;
    for (let y = b; y < b + h; y++) {
      for (let x = a; x < a + w; x++) put(x, y, col);
    }
  };
  const p = (a: number, b: number, col: string): void => r(a, b, 1, 1, col);
  const line = (x0: number, y0: number, x1: number, y1: number, col: string, th = 1): void => {
    x0 = Math.round(x0);
    y0 = Math.round(y0);
    x1 = Math.round(x1);
    y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let e = dx + dy;
    for (let g = 0; g < 800; g++) {
      r(x0, y0, th, th, col);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * e;
      if (e2 >= dy) {
        e += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        e += dx;
        y0 += sy;
      }
    }
  };
  const ell = (cx: number, cy: number, rx: number, ry: number, col: string): void => {
    for (let yy = Math.floor(cy - ry); yy < Math.ceil(cy + ry); yy++) {
      const dy = (yy + 0.5 - cy) / ry;
      if (Math.abs(dy) > 1) continue;
      const hw = rx * Math.sqrt(1 - dy * dy);
      const a = Math.round(cx - hw);
      const b = Math.round(cx + hw);
      if (b > a) r(a, yy, b - a, 1, col);
    }
  };
  const disc = (cx: number, cy: number, rad: number, col: string): void => ell(cx, cy, rad, rad, col);
  return { P: { r, p, line, ell, disc }, pixels };
}

/** Compare deux rasterisations pixel par pixel. */
function samePixels(a: Map<string, string>, b: Map<string, string>): void {
  expect([...a.keys()].sort()).toEqual([...b.keys()].sort());
  for (const [key, col] of a) expect(b.get(key)).toBe(col);
}

// =====================================================================================
// ORACLE — copié de docs/maquettes/heure-doree.html (lignes 1050, 1052 et 1056-1059).
// Ne pas modifier : c'est la référence.
// =====================================================================================
function oracleGust(x: number, y: number, now: number): number {
  const front = ((now % 10) / 3) * 900 - 120, d = x + y * 0.4 - front;
  return d > -40 && d < 0 ? 1 : 0;
}
function oracleTuft(P: Pen, x: number, y: number, now: number): void {
  const s = oracleGust(x, y, now);
  P.r(x - 3, y, 7, 1, C.m5);
  for (const [bx, h] of [[-3, 3], [-1, 5], [1, 6], [3, 4]] as const) for (let j = 1; j <= h; j++) { const lean = Math.round((bx > 0 ? 1 : -1) * j / 4) + (j > 2 ? s : 0); P.p(x + bx + lean, y - j, j === h ? C.m1 : j > h - 2 ? C.m2 : C.m4); }
}
function oracleReed(P: Pen, x: number, y: number, h: number, ph: number, now: number): void {
  const s = Math.sin(now * Math.PI * 2 / 4.5 + ph) * 1.5;
  for (let j = 0; j < h; j++) P.p(x + Math.round(s * j / h), y - j, j < 3 ? C.reed2 : C.reed);
  P.r(x + Math.round(s), y - h - 3, 2, 4, C.e3);
  P.p(x + Math.round(s), y - h - 3, C.e2);
}
function oracleLily(P: Pen, lx: number, ly: number, fl: boolean, now: number): void {
  const bob = Math.round(Math.sin(now * Math.PI * 2 / 5 + lx) * 0.6);
  P.ell(lx, ly + bob, 8, 4, C.ink2);
  P.ell(lx, ly + bob - 0.5, 7, 3.3, C.g3);
  P.ell(lx - 1.5, ly + bob - 1, 4, 1.6, C.g2);
  P.r(lx, ly + bob - 3, 5, 1, C.q4);
  P.r(lx + 1, ly + bob - 2, 3, 1, C.q4);
  if (fl) {
    P.r(lx - 3, ly + bob - 5, 5, 3, C.pink);
    P.r(lx - 2, ly + bob - 6, 3, 1, C.pink);
    P.p(lx - 1, ly + bob - 5, C.white);
    P.p(lx - 1, ly + bob - 4, C.o1);
  }
}

/** Une vie réduite à une seule catégorie d'éléments. */
function lifeWith(parts: Partial<Pick<GroundLife, 'shore' | 'glints' | 'lilies' | 'reeds' | 'tufts' | 'flowers'>>, originX = 0, originY = 0): GroundLife {
  return { originX, originY, seed: 0, shore: [], glints: [], lilies: [], reeds: [], tufts: [], flowers: [], ...parts };
}

/** Construit une source de test : un champ analytique et des cases classées comme le monde. */
function makeSource(seed: number, originX: number, originY: number, field: (i: number, j: number) => number, path?: (lx: number, ly: number) => boolean): LifeSource {
  const shore = new Float32Array(33 * 33);
  for (let j = 0; j < 33; j++) {
    for (let i = 0; i < 33; i++) shore[j * 33 + i] = field(i, j);
  }
  const ground = new Uint8Array(32 * 32);
  for (let ly = 0; ly < 32; ly++) {
    for (let lx = 0; lx < 32; lx++) {
      const m = (shore[ly * 33 + lx] + shore[ly * 33 + lx + 1] + shore[(ly + 1) * 33 + lx] + shore[(ly + 1) * 33 + lx + 1]) / 4;
      let code = m < 0 ? 1 : m < 1.6 ? 2 : 0;
      if (code === 0 && path !== undefined && path(lx, ly)) code = 3;
      ground[ly * 32 + lx] = code;
    }
  }
  return { seed, originX, originY, shore, ground };
}

/** Dessine une vie en comptant les `fillRect`. */
function countRects(life: GroundLife, now: number, x0: number, y0: number, x1: number, y1: number): Call[] {
  const rec = recorder();
  drawGroundLife(pen(rec.ctx), life, now, x0, y0, x1, y1, () => false);
  return rec.calls;
}

describe('oracle de la maquette', () => {
  it('une touffe, mêmes pixels, avec et sans coup de vent', () => {
    for (const [x, y, now] of [[200, 200, 0], [-150, 40, 0], [81, 131, 6.2]]) {
      const tuft: GroundTuft = { x, y, tx: Math.floor(x / T), ty: Math.floor(y / T) };
      const mine = rasterPen();
      const ref = rasterPen();
      drawGroundLife(mine.P, lifeWith({ tufts: [tuft] }), now, -1000, -1000, 1000, 1000, () => false);
      oracleTuft(ref.P, tuft.x, tuft.y, now);
      samePixels(mine.pixels, ref.pixels);
    }
  });

  it('un roseau, mêmes pixels, toutes hauteurs', () => {
    for (const h of [8, 11, 15]) {
      for (const ph of [0, 1.7, 4.9]) {
        const reed: GroundReed = { x: 120, y: 140, h, ph, tx: 5, ty: 5 };
        const mine = rasterPen();
      const ref = rasterPen();
        drawGroundLife(mine.P, lifeWith({ reeds: [reed] }), 3.7, -1000, -1000, 1000, 1000, () => false);
        oracleReed(ref.P, reed.x, reed.y, reed.h, reed.ph, 3.7);
        samePixels(mine.pixels, ref.pixels);
      }
    }
  });

  it('un nénuphar avec et sans fleur, mêmes pixels', () => {
    for (const fl of [true, false]) {
      for (const now of [0, 4.2, 12.6]) {
        const lily: GroundLily = { x: 300, y: 260, fl, tx: 12, ty: 10 };
        const mine = rasterPen();
      const ref = rasterPen();
        drawGroundLife(mine.P, lifeWith({ lilies: [lily] }), now, -1000, -1000, 1000, 1000, () => false);
        oracleLily(ref.P, lily.x, lily.y, lily.fl, now);
        samePixels(mine.pixels, ref.pixels);
      }
    }
  });
});

describe('déterminisme', () => {
  it('mêmes appels pour une même source et un même now, coordonnées négatives comprises', () => {
    const src = makeSource(4242, -3, -5, (i, j) => i - 0.7 * j - 12);
    const a = layoutLife(src);
    const b = layoutLife(src);
    const ra = recorder();
    const rb = recorder();
    const x0 = -3 * T, y0 = -5 * T, x1 = x0 + 32 * T, y1 = y0 + 32 * T;
    drawGroundLife(pen(ra.ctx), a, 1.234, x0, y0, x1, y1, () => false);
    drawGroundLife(pen(rb.ctx), b, 1.234, x0, y0, x1, y1, () => false);
    expect(ra.calls.length).toBeGreaterThan(0);
    expect(ra.calls).toEqual(rb.calls);
  });
});

describe('clapotis le long de la ligne zéro', () => {
  const check = (field: (i: number, j: number) => number, axis: 'x' | 'y', zero: number, side: -1 | 1): void => {
    const life = layoutLife(makeSource(7, 0, 0, field));
    const calls = countRects(life, 0.73, 0, 0, 32 * T, 32 * T);
    const q1: number[] = [], foam: number[] = [], sand: number[] = [];
    for (let i = 0; i < calls.length; i++) {
      const c = calls[i];
      if (c[0] !== 'rect') continue;
      const prev = calls[i - 1];
      const col = prev !== undefined && prev[0] === 'style' ? prev[1] : '';
      const pos = axis === 'x' ? c[1] : c[2];
      if (col === C.q1) q1.push(pos);
      else if (col === C.q0) foam.push(pos);
      else if (col === C.sd3) sand.push(pos);
    }
    const inWater = (p: number, slack: number): boolean => side < 0 ? p < zero + slack : p > zero - slack;
    expect(q1.length).toBeGreaterThan(0);
    expect(foam.length).toBeGreaterThan(0);
    // q1 et l'écume restent du côté de l'eau, à moins de dix pixels de la ligne.
    for (const p of q1) {
      expect(inWater(p, 3)).toBe(true);
      expect(Math.abs(p - zero)).toBeLessThan(10);
    }
    for (const p of foam) {
      expect(inWater(p, 2)).toBe(true);
      expect(Math.abs(p - zero)).toBeLessThan(9);
    }
    // Le sable mouillé reste du côté terre de la ligne.
    for (const p of sand) expect(side < 0 ? p > zero - 2 : p < zero + 2).toBe(true);
  };

  it('rive verticale, eau à gauche', () => check((i) => i - 12, 'x', 12 * T, -1));
  it('rive verticale, eau à droite', () => check((i) => 12 - i, 'x', 12 * T, 1));
  it('rive horizontale, eau au-dessus', () => check((_, j) => j - 12, 'y', 12 * T, -1));
  it('rive horizontale, eau en dessous', () => check((_, j) => 12 - j, 'y', 12 * T, 1));
});

describe('placement', () => {
  it('rien sur l’eau, la berge ou un chemin ; rien hors du bloc', () => {
    let tufts = 0;
    let flowers = 0;
    let reeds = 0;
    let lilies = 0;
    let glints = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const src = makeSource(seed, 0, 0, (i) => i - 20, (_lx, ly) => ly >= 4 && ly < 7);
      const life = layoutLife(src);
      tufts += life.tufts.length;
      flowers += life.flowers.length;
      reeds += life.reeds.length;
      lilies += life.lilies.length;
      glints += life.glints.length;
      const code = (x: number, y: number): number => {
        const lx = Math.floor(x / T);
        const ly = Math.floor(y / T);
        return lx >= 0 && lx < 32 && ly >= 0 && ly < 32 ? src.ground[ly * 32 + lx] : -1;
      };
      // Le champ vaut (i - 20) : la profondeur dans l'eau, en pixels, au centre de la case.
      const depthPx = (x: number, y: number): number => -(Math.floor(x / T) + 0.5 - 20) * T;
      for (const e of life.tufts) {
        for (const [dx, dy] of [[0, 0], [-3, 0], [3, 0], [-3, -6], [0, -6], [3, -6]] as const) expect(code(e.x + dx, e.y + dy)).toBe(0);
      }
      for (const e of life.flowers) {
        for (const [dx, dy] of [[0, 0], [-2, 0], [2, 0], [-2, -4], [0, -4], [2, -4]] as const) expect(code(e.x + dx, e.y + dy)).toBe(0);
      }
      for (const e of life.reeds) {
        expect(code(e.x, e.y)).toBe(1);
        expect(depthPx(e.x, e.y)).toBeGreaterThanOrEqual(1);
        expect(depthPx(e.x, e.y)).toBeLessThanOrEqual(18);
      }
      for (const e of life.lilies) {
        expect(code(e.x, e.y)).toBe(1);
        expect(depthPx(e.x, e.y)).toBeGreaterThanOrEqual(15);
      }
      for (const e of life.glints) expect(code(e.x, e.y)).toBe(1);
      for (const e of [...life.tufts, ...life.flowers, ...life.reeds, ...life.lilies, ...life.glints]) {
        expect(e.x).toBeGreaterThanOrEqual(0);
        expect(e.x).toBeLessThan(32 * T);
        expect(e.y).toBeGreaterThanOrEqual(0);
        expect(e.y).toBeLessThan(32 * T);
      }
    }
    expect(tufts).toBeGreaterThan(0);
    expect(flowers).toBeGreaterThan(0);
    expect(reeds).toBeGreaterThan(0);
    expect(lilies).toBeGreaterThan(0);
    expect(glints).toBeGreaterThan(0);
  });

  it('blocked supprime tout, et un élément loin du rectangle n’est pas dessiné', () => {
    const src = makeSource(31, 0, 0, (i) => i - 12);
    const life = layoutLife(src);
    expect(countRects(life, 1, 0, 0, 32 * T, 32 * T).length).toBeGreaterThan(0);
    const rec = recorder();
    drawGroundLife(pen(rec.ctx), life, 1, 0, 0, 32 * T, 32 * T, () => true);
    expect(rec.calls.length).toBe(0);

    const inner: GroundLife = lifeWith({ tufts: [{ x: 80, y: 80, tx: 3, ty: 3 }, { x: 400, y: 400, tx: 16, ty: 16 }] });
    const far = countRects(inner, 0, 0, 0, 160, 160);
    expect(far.length).toBeGreaterThan(0);
    for (const c of far) {
      if (c[0] !== 'rect') continue;
      expect(c[1]).toBeGreaterThanOrEqual(-30);
      expect(c[1]).toBeLessThan(190);
      expect(c[2]).toBeGreaterThanOrEqual(-30);
      expect(c[2]).toBeLessThan(190);
    }
  });
});

describe('le coup de vent', () => {
  it('revient toutes les dix secondes', () => {
    const tuft: GroundTuft = { x: 200, y: 200, tx: 8, ty: 8 };
    const life = lifeWith({ tufts: [tuft] });
    const draw = (now: number): Map<string, string> => {
      const r = rasterPen();
      drawGroundLife(r.P, life, now, -1000, -1000, 1000, 1000, () => false);
      return r.pixels;
    };
    const calm = draw(0);
    let windy = calm;
    let first = -1;
    for (let t = 0; t < 10; t += 0.05) {
      const p = draw(t);
      if ([...p.entries()].some(([k, v]) => calm.get(k) !== v)) {
        windy = p;
        first = t;
        break;
      }
    }
    // La période est bien de dix secondes, à l'identique.
    for (let t = 0; t < 10; t += 0.5) samePixels(draw(t), draw(t + 10));
    samePixels(windy, draw(11.35));
    expect(first).toBeGreaterThanOrEqual(0);
    // Un seul passage par décade : trois secondes plus loin, l'herbe est retombée.
    samePixels(calm, draw((first + 3) % 10));
    expect([...windy.keys()].sort()).not.toEqual([...calm.keys()].sort());
  });
});

describe('plafond de dessin', () => {
  it('moins de 2 500 fillRect pour une vue de 640×360 traversée par une rivière', () => {
    const src = makeSource(99, 0, 0, (i, j) => i - 1.778 * j);
    const life = layoutLife(src);
    const calls = countRects(life, 5.5, 0, 0, 640, 360);
    const rects = calls.filter((c) => c[0] === 'rect').length;
    expect(rects).toBeGreaterThan(0);
    expect(rects).toBeLessThanOrEqual(2500);
  });
});

describe('ligne zéro', () => {
  it('les 14 configurations de signes donnent le bon nombre de segments', () => {
    const cell = 10;
    const lo = cell * T;
    const hi = (cell + 1) * T;
    for (let mask = 1; mask < 15; mask++) {
      const water = [0, 1, 2, 3].map((k) => (mask & (1 << k)) !== 0);
      const countWater = water.filter(Boolean).length;
      const shore = new Float32Array(33 * 33).fill(10);
      const values = water.map((w) => {
        if (countWater === 1 && w) return -50;
        if (countWater === 3 && !w) return 50;
        return w ? -10 : 10;
      });
      shore[cell * 33 + cell] = values[0];
      shore[cell * 33 + cell + 1] = values[1];
      shore[(cell + 1) * 33 + cell + 1] = values[2];
      shore[(cell + 1) * 33 + cell] = values[3];
      const crossings = [
        water[0] !== water[1],
        water[1] !== water[2],
        water[2] !== water[3],
        water[3] !== water[0],
      ].filter(Boolean).length;
      const inside = contourSegments(shore, 0, 0).filter((s) =>
        [s.a, s.b].every((p) =>
          p.x >= lo - 0.001 && p.x <= hi + 0.001 && p.y >= lo - 0.001 && p.y <= hi + 0.001));
      expect({ mask, n: inside.length }).toEqual({ mask, n: crossings === 4 ? 2 : 1 });
    }
  });
});

describe('phase du clapotis', () => {
  it('deux blocs voisins suivent la même phase monde à leur frontière', () => {
    const field = (ox: number) => (i: number, j: number): number => ox + i - 1.5 * j - 20;
    const a = layoutLife(makeSource(41, 0, 0, field(0)));
    const b = layoutLife(makeSource(41, 32, 0, field(32)));
    const nearest = (life: GroundLife): GroundLife['shore'][number] => {
      let best = life.shore[0];
      for (const s of life.shore) if (Math.abs(s.x - 32 * T) < Math.abs(best.x - 32 * T)) best = s;
      return best;
    };
    const sa = nearest(a), sb = nearest(b);
    expect(Math.abs(sa.x - sb.x)).toBeLessThan(2);
    for (const now of [0.3, 1.7, 4.2]) {
      for (const s of [sa, sb]) {
        const life = lifeWith({ shore: [s] });
        const calls = countRects(life, now, -100, -100, 1700, 1000);
        const q1: number[][] = [];
        for (let i = 0; i < calls.length; i++) {
          const c = calls[i];
          const prev = calls[i - 1];
          if (c[0] === 'rect' && prev !== undefined && prev[0] === 'style' && prev[1] === C.q1) q1.push([c[1], c[2], c[3], c[4]]);
        }
        const lap = Math.sin(now * Math.PI * 2 / 6 + (s.x + s.y) * 0.025) * 2.5;
        const lx = -s.nx, ly = -s.ny, mid = lap - 4.5;
        if (Math.abs(s.nx) >= Math.abs(s.ny)) {
          const start = lx >= 0 ? Math.round(s.x + lx * (lap - 5)) : Math.round(s.x + lx * (lap - 4));
          expect(q1).toContainEqual([start, Math.round(s.y + ly * mid), 2, 1]);
        } else {
          const start = ly >= 0 ? Math.round(s.y + ly * (lap - 5)) : Math.round(s.y + ly * (lap - 4));
          expect(q1).toContainEqual([Math.round(s.x + lx * mid), start, 1, 2]);
        }
      }
    }
  });

});

describe('débordement sur une dalle', () => {
  it('une dalle voisine de la rive ne reçoit aucun pixel', () => {
    const point = { x: 12 * T, y: 100, nx: -1, ny: 0, tx: 11, ty: 4 };
    const life = lifeWith({ shore: [point] });
    const rec = recorder();
    drawGroundLife(pen(rec.ctx), life, 4.23, 0, 0, 32 * T, 32 * T, (tx) => tx === 12);
    for (const c of rec.calls) {
      if (c[0] !== 'rect') continue;
      const overlaps = c[1] < 13 * T && c[1] + c[3] > 12 * T;
      expect(overlaps).toBe(false);
    }
  });

  it('une touffe dont la case au nord est bloquée disparaît', () => {
    const tuft: GroundTuft = { x: 100, y: 100, tx: 4, ty: 4 };
    const life = lifeWith({ tufts: [tuft] });
    const rec = recorder();
    drawGroundLife(pen(rec.ctx), life, 0, 0, 0, 500, 500, (_tx, ty) => ty === 3);
    expect(rec.calls.length).toBe(0);
  });
});

describe('reflets du soleil', () => {
  it('toujours un trait horizontal, quelle que soit la rive', () => {
    const life = layoutLife(makeSource(3, 0, 0, (_i, j) => j - 12));
    const glints = lifeWith({ glints: life.glints });
    const rects: number[][] = [];
    for (let n = 0; n < 60; n++) {
      const calls = countRects(glints, n * 0.31, 0, 0, 32 * T, 32 * T);
      for (let i = 0; i < calls.length; i++) {
        const c = calls[i];
        const prev = calls[i - 1];
        if (c[0] === 'rect' && prev !== undefined && prev[0] === 'style' && (prev[1] === C.o0 || prev[1] === C.o1)) {
          rects.push([c[1], c[2], c[3], c[4]]);
        }
      }
    }
    expect(rects.length).toBeGreaterThan(0);
    for (const r of rects) {
      expect(r[3]).toBe(1);
      expect(r[2] === 2 || r[2] === 4).toBe(true);
    }
  });

  it('environ 0,13 reflet par case d’eau éligible', () => {
    let glints = 0;
    let eligible = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const src = makeSource(seed, 0, 0, (i) => i - 20);
      for (let ly = 0; ly < 32; ly++) {
        for (let lx = 0; lx < 32; lx++) {
          if (src.ground[ly * 32 + lx] !== 1) continue;
          const depth = -(lx + 0.5 - 20) * T;
          if (depth >= 16 && depth <= 90) eligible++;
        }
      }
      glints += layoutLife(src).glints.length;
    }
    expect(glints / eligible).toBeGreaterThan(0.05);
    expect(glints / eligible).toBeLessThan(0.22);
  });
});

describe('roseaux et nénuphars au pixel près', () => {
  it('respecte la profondeur interpolée exacte sur une rive diagonale', () => {
    let reeds = 0;
    let lilies = 0;
    for (let seed = 1; seed <= 16; seed++) {
      const life = layoutLife(makeSource(seed, 0, 0, (i, j) => i - 1.3 * j - 14));
      for (const e of life.reeds) {
        const dd = -(e.x / T - 1.3 * (e.y / T) - 14) * T;
        expect(dd).toBeGreaterThanOrEqual(3 - 0.001);
        expect(dd).toBeLessThanOrEqual(12 + 0.001);
        reeds++;
      }
      for (const e of life.lilies) {
        const dd = -(e.x / T - 1.3 * (e.y / T) - 14) * T;
        expect(dd).toBeGreaterThanOrEqual(18 - 0.001);
        expect(dd).toBeLessThanOrEqual(60 + 0.001);
        lilies++;
      }
    }
    expect(reeds).toBeGreaterThan(0);
    expect(lilies).toBeGreaterThan(0);
  });
});

describe('tronçons de roseaux', () => {
  it('environ un quart de la rive en porte, avec de longues pauses', () => {
    const rows = 32 * 24;
    const wet = new Set<number>();
    for (let n = 0; n < 24; n++) {
      const life = layoutLife(makeSource(7, 0, n * 32, (i) => i - 20));
      for (const r of life.reeds) wet.add(Math.floor(r.y / T));
    }
    const fraction = wet.size / rows;
    expect(fraction).toBeGreaterThan(0.12);
    expect(fraction).toBeLessThan(0.4);
    let gap = 0;
    let maxGap = 0;
    for (let row = 0; row < rows; row++) {
      if (wet.has(row)) gap = 0;
      else {
        gap++;
        if (gap > maxGap) maxGap = gap;
      }
    }
    expect(maxGap).toBeGreaterThanOrEqual(20);
  });
});
