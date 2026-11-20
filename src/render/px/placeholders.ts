/**
 * Les volumes provisoires du rendu pixel : ce qui n'a pas encore son vrai dessin reçoit une
 * silhouette dans le style de la maquette. La spécification est pure ; le dessin passe par `build`.
 */
import type { BuildingDef, Shape } from '../../sim/data';
import { ITEMS } from '../../sim/data';
import type { Material } from './palette';
import { C, M } from './palette';
import { makeSurface } from './surface';
import { pen } from './pen';
import type { Pen } from './pen';
import { outline } from './finish';
import { build, type Light, type Sprite } from './sprite';
import { box, cyl } from './volumes';

/** Le pictogramme de famille posé sur le toit d'un volume provisoire. */
export type FamilyIcon = 'arrows' | 'pick' | 'flame' | 'gear' | 'bolt' | 'eye';

/** La description pure d'un volume provisoire, sans aucune API du navigateur. */
export interface PlaceholderSpec {
  key: string;
  w: number;
  h: number;
  up: number;
  matKey: keyof typeof M;
  mat: Material;
  chimney: boolean;
  icon: FamilyIcon;
  plinth: boolean;
  flat: boolean;
}

/** Les quatre gisements minables, de 1 à 4 comme dans `DEPOSITS`. */
export type DepositType = 1 | 2 | 3 | 4;

const ICON_ROWS: Record<FamilyIcon, readonly string[]> = {
  arrows: [
    '.......',
    '.#...#.',
    '.##.##.',
    '..###..',
    '.##.##.',
    '.#...#.',
    '.......',
  ],
  pick: [
    '....##.',
    '...#.#.',
    '..#.#..',
    '.#o#...',
    '..#....',
    '.#.....',
    '.......',
  ],
  flame: [
    '...#...',
    '..#o#..',
    '.##o##.',
    '.##o##.',
    '.#####.',
    '..###..',
    '.......',
  ],
  gear: [
    '.#.#.#.',
    '.#####.',
    '##ooo##',
    '##ooo##',
    '##ooo##',
    '.#####.',
    '.#.#.#.',
  ],
  bolt: [
    '...##..',
    '..##...',
    '.##o#..',
    '..##...',
    '.##....',
    '##.....',
    '.......',
  ],
  eye: [
    '.......',
    '..###..',
    '.#ooo#.',
    '#ooooo#',
    '.#ooo#.',
    '..###..',
    '.......',
  ],
};

const ROCK: Record<DepositType, readonly [string, string, string, string, string]> = {
  1: ['#dcc6b6', '#ae9282', '#866c60', '#5f4b45', '#41332f'],
  2: [C.st0, C.st1, C.st2, C.st3, C.st4],
  3: ['#efebe2', '#cbc5b9', '#a29c92', '#77716a', '#4f4a45'],
  4: ['#dedcce', '#b1b0a0', '#888a7a', '#5f6258', '#41443d'],
};

const DEPOSIT_TINT: Record<DepositType, readonly [string, string]> = {
  1: [C.ir1, C.ir2],
  2: [C.st1, C.st2],
  3: [C.qz1, C.qz2],
  4: [C.ma2, C.ma3],
};

const sprites = new Map<string, Sprite | null>();
const items = new Map<number, HTMLCanvasElement>();

/** Une couleur mêlée à une autre : `t` = 0 garde `a`, `t` = 1 garde `b`. */
function mixColor(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ar = (pa >> 16) & 255, ag = (pa >> 8) & 255, ab = pa & 255;
  const br = (pb >> 16) & 255, bg = (pb >> 8) & 255, bb = pb & 255;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `#${((r << 16) | (g << 8) | bl).toString(16).padStart(6, '0')}`;
}

/** La teinte sourde d'un objet : sa couleur mêlée à moitié avec le sable `C.c3`. */
export function dullColor(hex: string): string {
  return mixColor(hex, C.c3, 0.5);
}

/** La matière d'une famille de bâtiments ; la Tour n'a pas de famille et prend le béton clair. */
function materialFor(def: BuildingDef): keyof typeof M {
  if (def.kind === 'hub') return 'conc';
  if (def.cat === 'fonte') return 'concD';
  if (def.cat === 'extraction') return 'dark';
  if (def.cat === 'fabrication') return 'conc';
  return 'steel';
}

/** Le pictogramme d'une famille ; la Tour montre l'œil de sa capsule. */
function iconFor(def: BuildingDef): FamilyIcon {
  if (def.kind === 'hub') return 'eye';
  if (def.cat === 'extraction') return 'pick';
  if (def.cat === 'fonte') return 'flame';
  if (def.cat === 'fabrication') return 'gear';
  if (def.cat === 'energie') return 'bolt';
  return 'arrows';
}

/** Décrit le volume provisoire d'un bâtiment ; la dalle est le sol et renvoie `null`. */
export function placeholderSpec(def: BuildingDef): PlaceholderSpec | null {
  if (def.kind === 'slab') return null;
  const flat = def.kind === 'belt';
  const raw = Math.round(def.height * 24);
  const matKey = materialFor(def);
  return {
    key: def.key,
    w: def.w * 24,
    h: def.h * 24,
    up: flat ? raw : Math.max(6, raw),
    matKey,
    mat: M[matKey],
    chimney: def.cat === 'fonte' || def.key === 'bruleur',
    icon: iconFor(def),
    plinth: def.w >= 2 && def.h >= 2,
    flat,
  };
}

/** Dessine un pictogramme de famille de 7 × 7 au plus, à l'encre avec son cœur orange. */
function pictogram(P: Pen, icon: FamilyIcon, x: number, y: number): void {
  ICON_ROWS[icon].forEach((row, j) => {
    [...row].forEach((ch, i) => {
      if (ch === '#') P.p(x + i, y + j, C.ink);
      else if (ch === 'o') P.p(x + i, y + j, C.o2);
    });
  });
}

/** Dessine la bande d'acier d'un convoyeur vue de dessus, sur une case. */
function drawBelt(P: Pen, spec: PlaceholderSpec, lights: Light[]): void {
  const { w, h } = spec;
  P.r(1, 2, w - 2, h - 4, M.steel.f);
  P.r(1, 2, w - 2, 1, M.steel.hi);
  P.r(2, 4, w - 4, h - 8, C.s3);
  for (let i = 4; i < w - 3; i += 4) P.r(i, 5, 1, h - 10, C.s4);
  P.r(2, 5, w - 4, 1, C.s2);
  P.r(2, h - 6, w - 4, 1, C.s4);
  P.r(w / 2 - 3, h / 2 - 1, 2, 3, C.o1);
  P.r(w / 2 - 1, h / 2 - 2, 2, 5, C.o2);
  lights.push({ k: 'blink', x: Math.round(w - 5), y: Math.round(h / 2), per: 2.4, c: C.o2 });
}

/** Dessine le volume provisoire d'un bâtiment, son socle, sa cheminée et son repère. */
function drawPlaceholder(P: Pen, spec: PlaceholderSpec, lights: Light[]): void {
  if (spec.flat) {
    drawBelt(P, spec, lights);
    return;
  }
  const { w, h, up, mat, plinth, chimney, icon } = spec;
  let roofY: number, roofD: number, bodyW: number, bodyX: number;
  if (plinth) {
    const foot = 4, inset = 3;
    box(P, 1, up - 2, w - 2, h - 4, foot, mat);
    bodyX = inset;
    bodyW = w - inset * 2;
    roofY = 8;
    roofD = h - 10;
    box(P, bodyX, roofY, bodyW, roofD, Math.max(3, up - 4), mat);
  } else {
    bodyX = 2;
    bodyW = w - 4;
    roofY = 3;
    roofD = h - 6;
    box(P, bodyX, roofY, bodyW, roofD, up, mat);
  }
  if (chimney) {
    const rad = Math.max(3, Math.min(6, Math.round(w / 10)));
    cyl(P, w - rad - 6, Math.max(3, roofY - 2), rad, Math.max(5, Math.round(up * 0.34)), M.dark);
  }
  const iconX = Math.round(bodyX + (bodyW - 7) / 2);
  const iconY = Math.round(roofY + roofD / 2 - 3);
  pictogram(P, icon, iconX, iconY);
  lights.push({
    k: 'blink',
    x: Math.round(w - 7),
    y: Math.round(roofY + roofD + Math.max(4, up * 0.5)),
    per: 2.4,
    c: C.o2,
  });
}

/** Dessine une fois le volume provisoire d'un bâtiment et le garde en cache ; la dalle renvoie `null`. */
export function placeholderSprite(def: BuildingDef): Sprite | null {
  if (sprites.has(def.key)) return sprites.get(def.key) ?? null;
  const spec = placeholderSpec(def);
  if (!spec) {
    sprites.set(def.key, null);
    return null;
  }
  const sprite = build(spec.w, spec.h, spec.up, (P, _up, lights) => drawPlaceholder(P, spec, lights));
  sprites.set(def.key, sprite);
  return sprite;
}

/** Dessine un rocher de trois quarts : pied sombre, face, dessus éclairé et facette. */
function boulder(P: Pen, cx: number, cy: number, w: number, h: number, pal: readonly [string, string, string, string, string]): void {
  const [hi, t1, t2, f, ft] = pal;
  const fh = Math.max(3, Math.round(h * 0.9));
  P.ell(cx, cy + fh * 0.5, w, h * 0.85, ft);
  P.r(cx - w + 1, cy, w * 2 - 2, fh * 0.6, f);
  P.ell(cx, cy, w, h * 0.8, f);
  P.ell(cx - 0.6, cy - 1, w * 0.92, h * 0.72, t2);
  P.ell(cx - w * 0.25, cy - h * 0.3, w * 0.55, h * 0.42, t1);
  P.r(cx - w * 0.55, cy - h * 0.5, Math.max(2, w * 0.3), 1, hi);
  P.line(cx - w * 0.2, cy + h * 0.1, cx + w * 0.35, cy - h * 0.25, f);
}

/** Un arbre provisoire : un tronc et un houppier rond, verts de la maquette (taille 1 à 3). */
export function placeholderTree(size: 1 | 2 | 3): Sprite {
  const key = `tree:${size}`;
  const cached = sprites.get(key);
  if (cached) return cached;
  const w = 16 + size * 8, h = 8 + size * 3, up = 8 + size * 6;
  const sprite = build(w, h, up, (P) => {
    const cx = w / 2;
    P.r(cx - 2, h + up - 12, 4, 10, C.e3);
    P.r(cx - 1, h + up - 12, 1, 9, C.e2);
    P.p(cx + 2, h + up - 3, C.e4);
    const cy = h + up - up * 0.7 - 2;
    const rad = 4 + size * 2.4;
    P.disc(cx, cy, rad, C.g5);
    P.disc(cx - 1, cy - 1, rad - 1, C.g4);
    P.disc(cx - 2, cy - 2, rad - 2, C.g3);
    P.disc(cx - 3, cy - 3, rad - 4, C.g2);
    P.disc(cx - 4, cy - 4, Math.max(1, rad - 7), C.g1);
    for (let k = 0; k < size * 4; k++) {
      const a = (k / (size * 4)) * Math.PI * 2;
      const px = Math.round(cx - 2 + Math.cos(a) * rad * 0.72);
      const py = Math.round(cy - 2 + Math.sin(a) * rad * 0.6);
      P.p(px, py, k % 3 === 0 ? C.g1 : C.g4);
    }
  });
  sprites.set(key, sprite);
  return sprite;
}

/** Un tas de roche provisoire pour un gisement, aux teintes de pierre de la maquette. */
export function placeholderDeposit(type: DepositType): Sprite {
  const key = `deposit:${type}`;
  const cached = sprites.get(key);
  if (cached) return cached;
  const pal = ROCK[type];
  const tint = DEPOSIT_TINT[type];
  const sprite = build(42, 26, 14, (P) => {
    boulder(P, 16, 33, 11, 7, pal);
    boulder(P, 28, 30, 9, 6, pal);
    boulder(P, 21, 23, 8, 5, pal);
    P.p(17, 31, tint[0]);
    P.p(24, 28, tint[0]);
    P.p(29, 29, tint[1]);
    P.p(12, 36, C.ink2);
    P.p(33, 35, C.ink2);
  });
  sprites.set(key, sprite);
  return sprite;
}

/** Dessine la forme d'un objet dans un carré de 8 × 8 pixels. */
function drawItemShape(P: Pen, shape: Shape, col: string): void {
  const hi = mixColor(col, C.c0, 0.45), lo = mixColor(col, C.ink, 0.35);
  if (shape === 'boule') {
    P.disc(3.5, 3.5, 3.5, col);
    P.disc(2.5, 2.5, 1.5, hi);
    P.p(5, 5, lo);
  } else if (shape === 'gemme') {
    P.r(2, 1, 4, 1, hi);
    P.r(1, 2, 6, 3, col);
    P.r(2, 5, 4, 1, lo);
    P.r(3, 6, 2, 1, lo);
    P.p(3, 2, hi);
  } else if (shape === 'lingot') {
    P.r(1, 3, 6, 3, col);
    P.r(2, 2, 4, 1, hi);
    P.r(1, 5, 6, 1, lo);
    P.p(2, 3, hi);
  } else if (shape === 'plaque') {
    P.r(1, 1, 6, 6, lo);
    P.r(1, 1, 5, 5, col);
    P.r(1, 1, 5, 1, hi);
    P.p(5, 5, lo);
  } else if (shape === 'bobine') {
    P.r(1, 1, 2, 6, lo);
    P.r(5, 1, 2, 6, lo);
    P.r(3, 2, 2, 4, col);
    P.p(1, 1, hi);
    P.p(6, 1, hi);
  } else if (shape === 'rouage') {
    P.disc(3.5, 3.5, 3.4, col);
    for (const [a, b] of [[3, 0], [3, 6], [0, 3], [6, 3], [1, 1], [5, 5], [1, 5], [5, 1]]) P.r(a, b, 1, 1, col);
    P.r(3, 3, 1, 1, lo);
    P.p(2, 2, hi);
  } else {
    P.r(1, 1, 6, 5, col);
    P.r(1, 1, 6, 1, hi);
    P.r(1, 5, 6, 1, lo);
    P.p(2, 2, hi);
    P.p(5, 4, lo);
  }
}

/** Un objet provisoire de 8 × 8 au plus, dans une teinte sourde dérivée de sa couleur. */
export function placeholderItem(itemId: number): HTMLCanvasElement {
  const cached = items.get(itemId);
  if (cached) return cached;
  const def = ITEMS[itemId];
  if (!def) throw new RangeError(`Objet inconnu : ${itemId}`);
  const { canvas, ctx } = makeSurface(8, 8);
  drawItemShape(pen(ctx), def.shape, dullColor(def.color));
  const out = outline(canvas, C.ink);
  items.set(itemId, out);
  return out;
}

/** Un petit bâtisseur provisoire : robot debout de 28 pixels, sa lentille de la couleur du joueur. */
export function placeholderBuilder(color: string): Sprite {
  const key = `builder:${color}`;
  const cached = sprites.get(key);
  if (cached) return cached;
  const sprite = build(16, 8, 20, (P) => {
    P.r(4, 21, 3, 5, C.s2);
    P.r(10, 21, 3, 5, C.s2);
    P.r(3, 25, 4, 2, C.s3);
    P.r(10, 25, 4, 2, C.s3);
    P.r(3, 11, 11, 11, C.c2);
    P.r(4, 12, 9, 8, C.c1);
    P.r(4, 12, 9, 1, C.c0);
    P.r(2, 13, 2, 5, C.c2);
    P.r(13, 13, 2, 5, C.c2);
    P.r(1, 17, 2, 2, C.s2);
    P.r(14, 17, 2, 2, C.s2);
    P.r(3, 4, 11, 9, C.c2);
    P.r(4, 5, 9, 7, C.c1);
    P.r(5, 7, 7, 3, C.s4);
    P.r(6, 8, 2, 2, color);
    P.r(8, 8, 1, 1, C.c0);
    P.r(7, 1, 1, 3, C.s2);
    P.r(10, 1, 1, 3, C.s2);
    P.p(7, 1, C.o2);
    P.p(10, 1, C.o2);
  });
  sprites.set(key, sprite);
  return sprite;
}
