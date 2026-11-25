/**
 * Les icônes pixel de la barre de construction : une toile de 30 × 26 points passée par `finish`.
 * Les cinq icônes de la maquette sont portées à l'identique ; les neuf autres suivent les mêmes volumes,
 * la même lumière et les couleurs de `C` et `M`.
 */
import { C, M, STONE } from './palette';
import { rng } from './noise';
import { pen } from './pen';
import type { Pen } from './pen';
import { finish, fromRows } from './finish';
import { makeSurface } from './surface';
import { box, chev, crate, cyl } from './volumes';
import { ROCK, boulder } from './outcrops';

/** Les icônes dessinées pour le HUD. */
export type HudIconKey =
  | 'belt' | 'puits' | 'kiln' | 'crate' | 'fist'
  | 'slab' | 'splitter' | 'sorter' | 'sawmill' | 'furnace' | 'burner' | 'tower' | 'demolish' | 'hammer'
  | 'neutral';

/** Toutes les clés d'icône, dans l'ordre de la planche. */
export const HUD_ICON_KEYS: readonly HudIconKey[] = [
  'belt', 'puits', 'kiln', 'crate', 'fist',
  'slab', 'splitter', 'sorter', 'sawmill', 'furnace', 'burner', 'tower', 'demolish', 'hammer', 'neutral',
];

/** L'icône de chaque bâtiment du jeu ; tout le reste tombe sur `neutral`. */
const BUILDING_ICONS: Readonly<Record<string, HudIconKey>> = {
  convoyeur: 'belt',
  puits: 'puits',
  charbonniere: 'kiln',
  entrepot: 'crate',
  poings: 'fist',
  dalle: 'slab',
  aiguillage: 'splitter',
  trieur: 'sorter',
  scierie: 'sawmill',
  four: 'furnace',
  bruleur: 'burner',
  tour: 'tower',
  demolir: 'demolish',
  marteau: 'hammer',
};

/** L'icône d'un bâtiment du jeu (ou de `poings`, `demolir`) ; `neutral` s'il n'a pas encore de dessin. */
export function hudIconKey(buildingKey: string): HudIconKey {
  return BUILDING_ICONS[buildingKey] ?? 'neutral';
}

/** Les lignes de caractères du bois, du charbon de bois et du minerai de fer, partagées avec le banc. */
export const LOG_ROWS = ['..........', '.a11111112', 'abc2222223', 'ab22222223', 'abc2223333', '.a33333333'] as const;
export const LOG_PAL = { a: C.e0, b: C.e1, c: C.e2, 1: C.e1, 2: C.e2, 3: C.e3 } as const;
export const CHAR_ROWS = ['..aa1....', '.a1112...', '.1s12233.', '122223333', '.2223334.', '..33344..'] as const;
export const CHAR_PAL = { a: C.st1, 1: C.ch0, 2: C.ch1, 3: C.ch2, 4: '#141117', s: C.chs } as const;
export const OREI_ROWS = ['...0011...', '..011122..', '.01k2m223.', '0112k23333', '.12222333.', '..22333...'] as const;
export const OREI_PAL = { 0: '#dcc6b6', 1: '#ae9282', 2: '#866c60', 3: '#5f4b45', m: C.irm, k: C.ir1 } as const;

/** Les trois petits objets dessinés à partir de lignes de caractères. */
interface IconItems {
  LOG: HTMLCanvasElement;
  CHAR: HTMLCanvasElement;
  OREI: HTMLCanvasElement;
}

/** Les objets sont bâtis à la première icône qui en a besoin (le module reste importable sous Node). */
let ITEMS: IconItems | null = null;

/** Les trois petits objets, construits une seule fois. */
function iconItems(): IconItems {
  if (!ITEMS) {
    ITEMS = {
      LOG: fromRows(LOG_ROWS, LOG_PAL),
      CHAR: fromRows(CHAR_ROWS, CHAR_PAL),
      OREI: fromRows(OREI_ROWS, OREI_PAL),
    };
  }
  return ITEMS;
}

/** Dessine une icône sur son crayon ; `ctx` sert aux petits objets déjà rendus. */
type IconPainter = (P: Pen, ctx: CanvasRenderingContext2D, items: IconItems) => void;

/** Un bout de tapis sur ses pieds, une bûche et un minerai dessus, deux flèches sur le flanc. */
function paintBelt(P: Pen, ctx: CanvasRenderingContext2D, items: IconItems): void {
  P.r(4, 21, 2, 5, C.s3);
  P.r(24, 21, 2, 5, C.s3);
  P.p(4, 21, C.s2);
  P.p(24, 21, C.s2);
  P.r(0, 9, 30, 8, C.s4);
  P.r(0, 9, 30, 1, C.s1);
  P.r(0, 16, 30, 1, C.s3);
  for (let i = 2; i < 30; i += 4) P.r(i, 10, 1, 6, C.s3);
  P.r(0, 17, 30, 5, C.s3);
  P.r(0, 17, 30, 1, C.s2);
  P.r(0, 21, 30, 1, C.s4);
  chev(P, 12, 19, 0, C.o2);
  chev(P, 18, 19, 0, C.o2);
  chev(P, 24, 19, 0, C.o1);
  ctx.drawImage(items.LOG, 2, 6);
  ctx.drawImage(items.OREI, 16, 6);
}

/** Le symbole de la mine : un tas de minerai de fer, la pioche posée en travers. */
function paintPuits(P: Pen): void {
  const r = rng(5);
  boulder(P, 19, 16, 9, 6, r, ROCK.fe, false);
  boulder(P, 10, 19, 9, 6, r, ROCK.fe, true);
  for (const [a, b] of [[7, 18], [12, 20], [20, 14], [23, 17], [16, 21]]) {
    P.r(a, b, 2, 1, C.ir1);
    P.p(a, b - 1, C.irm);
  }
  P.line(4, 25, 20, 7, C.e2, 2);
  P.line(4, 24, 19, 7, C.e0);
  for (const [a, b] of [[13, 3], [15, 3], [17, 3], [19, 4], [21, 5], [23, 7], [24, 9], [25, 11], [26, 13]]) {
    P.r(a, b, 3, 3, C.s1);
  }
  for (const [a, b] of [[14, 3], [16, 3], [18, 3], [20, 4], [22, 5], [23, 7], [24, 9]]) P.p(a, b, C.s0);
  for (const [a, b] of [[15, 5], [17, 5], [19, 6], [21, 7], [23, 9], [24, 11], [25, 13]]) P.p(a, b, C.s2);
  P.r(18, 6, 4, 4, C.s2);
  P.p(19, 7, C.s0);
}

/** Le four de béton, sa cheminée qui fume, sa porte rougeoyante, le charbon qui en sort. */
function paintKiln(P: Pen, ctx: CanvasRenderingContext2D, items: IconItems): void {
  P.disc(21, 2, 1.5, C.st1);
  P.disc(24, 1, 1, C.st2);
  box(P, 1, 11, 22, 7, 8, M.conc, false);
  P.r(2, 12, 20, 2, C.c2);
  cyl(P, 17, 4, 3, 10, M.dark);
  P.r(5, 19, 10, 7, C.s3);
  P.r(6, 20, 8, 6, C.ink2);
  P.r(5, 19, 10, 1, C.s1);
  P.r(7, 22, 6, 4, C.o3);
  P.r(8, 23, 4, 3, C.o2);
  P.r(9, 24, 2, 2, C.o1);
  ctx.drawImage(items.CHAR, 21, 20);
}

/** La caisse de la scène, une bûche et un minerai posés dessus. */
function paintCrate(P: Pen, ctx: CanvasRenderingContext2D, items: IconItems): void {
  crate(P, 4, 8, 22, 7, 11);
  ctx.drawImage(items.LOG, 6, 4);
  ctx.drawImage(items.OREI, 15, 3);
}

/** Un poing d'acier fermé, vu de face, et l'étincelle du coup. */
function paintFist(P: Pen): void {
  const FIST = [
    '.KKK.KKK.KKK.KKK.',
    'KLLMKLLMKLLMKLLMK',
    'KLMMKLMMKLMMKLMMK',
    'KMMDKMMDKMMDKMMDK',
    'KMMDKMMDKMMDKMMDK',
    'KDDSKDDSKDDSKDDSK',
    'KKKKKKKKKKKKKMMDK',
    'KLLLLLLLLLLLKMMDK',
    'KMMMMMMMMMMDKMMDK',
    'KKKKKKKKKKKKKDDSK',
    '.KMMMMMMMMMMMMMK.',
    '.KDDDDDDDDDDDDDK.',
    '..KKKKKKKKKKKKK..',
    '...KSDSDSDSDSDK..',
    '...KKKKKKKKKKKK..',
  ];
  const pal = { K: C.ink, L: C.s0, M: C.s1, D: C.s2, S: C.s3 };
  FIST.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const col = pal[row[i] as keyof typeof pal];
      if (col) P.p(4 + i, 8 + j, col);
    }
  });
  P.line(23, 7, 27, 3, C.o1);
  P.r(24, 13, 5, 1, C.o1);
  P.line(23, 19, 27, 23, C.o1);
  P.p(23, 7, C.o0);
  P.p(24, 13, C.o0);
  P.p(23, 19, C.o0);
}

/** Quatre rondins fendus posés à plat, serrés, vus de trois quarts. */
function paintSlab(P: Pen): void {
  const r = rng(31);
  for (let n = 0; n < 4; n++) {
    const x = 2 + (n % 2);
    const y = 2 + n * 5;
    const w = 26 - (n % 2);
    P.r(x, y, w, 2, C.e1);
    P.r(x + 1, y + 1, w - 2, 2, C.e2);
    P.r(x, y, w, 1, C.e0);
    P.r(x, y + 3, w - 1, 1, C.e3);
    P.p(x, y + 1, C.e0);
    P.p(x + w - 1, y + 1, C.e3);
    P.p(x + Math.floor(w / 2), y + 1, C.e3);
    for (let k = 0; k < 2; k++) P.p(x + 3 + Math.floor(r() * (w - 6)), y + 2, C.e2);
  }
}

/** Un tourniquet de planches à trois bras sur un moyeu d'acier, une flèche orange. */
function paintSplitter(P: Pen): void {
  const cx = 15;
  const cy = 17;
  for (const [ex, ey] of [[cx, cy - 12], [cx - 10, cy + 6], [cx + 10, cy + 6]] as const) {
    P.line(cx, cy, ex, ey, C.e3, 4);
    P.line(cx, cy, ex, ey, C.e1, 2);
    P.p(ex, ey, C.e0);
  }
  P.disc(cx, cy, 4, C.s3);
  P.disc(cx, cy, 3, C.s1);
  P.disc(cx - 0.5, cy - 0.5, 1.6, C.s0);
  P.p(cx, cy, C.s3);
  chev(P, cx, 3, 3, C.o1);
}

/** Deux murets de pierre en Y, un clapet de bois, une flèche orange vers l'avant. */
function paintSorter(P: Pen): void {
  const wall = (x1: number, y1: number, x2: number, y2: number): void => {
    for (let k = 0; k <= 6; k++) {
      const t = k / 6;
      const x = Math.round(x1 + (x2 - x1) * t);
      const y = Math.round(y1 + (y2 - y1) * t);
      P.r(x - 1, y - 1, 3, 3, C.st2);
      P.r(x - 1, y - 1, 3, 1, C.st1);
      P.p(x + 1, y + 1, C.st3);
    }
  };
  wall(15, 21, 5, 6);
  wall(15, 21, 25, 6);
  P.r(11, 17, 8, 2, C.e3);
  P.r(11, 17, 8, 1, C.e1);
  P.line(15, 16, 15, 8, C.o2, 2);
  chev(P, 15, 6, 3, C.o1);
}

/** Une lame de scie dentée en acier sur un chevalet de bois, une bûche dessous. */
function paintSawmill(P: Pen, ctx: CanvasRenderingContext2D, items: IconItems): void {
  P.line(6, 25, 19, 11, C.e3, 3);
  P.line(24, 25, 11, 11, C.e3, 3);
  P.line(7, 25, 19, 12, C.e2, 1);
  P.line(23, 25, 12, 12, C.e2, 1);
  P.r(4, 13, 22, 2, C.e3);
  P.r(4, 13, 22, 1, C.e1);
  P.disc(15, 10, 6, C.s3);
  P.disc(15, 10, 5, C.s1);
  P.disc(15, 10, 2, C.s2);
  P.p(15, 10, C.s3);
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    P.p(15 + Math.round(Math.cos(a) * 7), 10 + Math.round(Math.sin(a) * 7), C.s0);
  }
  P.p(13, 8, C.s0);
  P.p(14, 8, C.s0);
  ctx.drawImage(items.LOG, 9, 18);
}

/** Un four carré de pierre, une gueule rouge et orange, une haute cheminée. */
function paintFurnace(P: Pen): void {
  box(P, 3, 8, 22, 7, 9, STONE, false);
  P.r(19, 0, 5, 9, C.st2);
  P.r(19, 0, 5, 1, C.st0);
  P.r(19, 1, 1, 8, C.st1);
  P.r(23, 1, 1, 8, C.st3);
  P.r(2, 7, 24, 2, C.st1);
  P.r(2, 7, 24, 1, C.st0);
  P.r(8, 17, 12, 7, C.s3);
  P.r(9, 18, 10, 6, C.ink2);
  P.r(10, 19, 8, 4, C.o3);
  P.r(11, 20, 6, 3, C.o2);
  P.r(12, 21, 4, 2, C.o1);
  P.p(13, 22, C.o0);
  P.p(16, 21, C.o0);
}

/** Un cercle de bûches, un foyer, une flamme orange et jaune. */
function paintBurner(P: Pen): void {
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const x = 15 + Math.cos(a) * 11;
    const y = 17 + Math.sin(a) * 6;
    P.disc(x, y, 2.5, C.e3);
    P.disc(x - 0.4, y - 0.4, 1.7, C.e1);
    P.p(x, y, C.e0);
  }
  P.ell(15, 17, 8, 4, C.ink2);
  P.ell(15, 17, 6.5, 3, C.s3);
  P.ell(15, 17, 4, 2, C.o4);
  P.ell(15, 11, 5.5, 9, C.o3);
  P.ell(15, 12, 4.5, 7.5, C.o2);
  P.ell(15, 14, 3, 5, C.o1);
  P.ell(15, 16, 1.6, 2.6, C.o0);
  P.p(10, 7, C.o1);
  P.p(20, 5, C.o1);
  P.p(15, 1, C.o2);
}

/** La capsule grise avec son œil orange sur un plancher de rondins, un mât, un fanion orange. */
function paintTower(P: Pen): void {
  for (let n = 0; n < 3; n++) {
    const x = 3 + (n % 2);
    const y = 20 + n * 2;
    const w = 24 - (n % 2);
    P.r(x, y, w, 1, C.e1);
    P.r(x, y + 1, w, 1, C.e2);
    P.p(x + 2, y + 1, C.e3);
    P.p(x + w - 3, y + 1, C.e3);
  }
  P.r(14, 1, 2, 10, C.s3);
  P.p(14, 1, C.s2);
  P.ell(15, 17, 7, 4, C.s3);
  P.r(8, 10, 14, 7, C.s3);
  P.ell(15, 10, 7, 4, C.s3);
  P.r(9, 9, 12, 8, C.s2);
  P.ell(15, 9, 6, 3, C.s1);
  P.r(8, 11, 1, 6, C.s0);
  P.r(21, 11, 1, 6, C.s4);
  P.disc(15, 14, 4, C.ink2);
  P.disc(15, 14, 3, C.o2);
  P.disc(15, 14, 1.6, C.o1);
  P.p(15, 14, C.o0);
  P.line(16, 2, 22, 3, C.o2);
  P.r(16, 1, 1, 4, C.o2);
  P.p(20, 3, C.o1);
}

/** Une masse d'acier à manche de bois en travers, un bloc de béton fendu, un éclat orange. */
function paintDemolish(P: Pen): void {
  box(P, 2, 16, 18, 5, 5, M.conc, true);
  P.line(10, 16, 12, 19, C.ink2);
  P.line(12, 19, 10, 22, C.ink2);
  P.line(10, 22, 13, 25, C.ink2);
  P.line(8, 20, 22, 7, C.e3, 3);
  P.line(8, 19, 21, 7, C.e1);
  P.r(18, 1, 10, 9, C.s3);
  P.r(18, 1, 10, 7, C.s1);
  P.r(18, 1, 10, 1, C.s0);
  P.r(18, 2, 2, 5, C.s0);
  P.r(26, 2, 2, 7, C.s2);
  P.p(6, 13, C.o1);
  P.p(9, 11, C.o0);
  P.p(12, 13, C.o1);
  P.p(4, 15, C.o2);
  P.p(15, 14, C.o2);
}

/** Un marteau de forgeron : tête d'acier, manche de bois, un éclat orange. */
function paintHammer(P: Pen): void {
  P.line(5, 24, 16, 12, C.e4, 4);
  P.line(5, 23, 16, 11, C.e2, 2);
  P.line(6, 22, 15, 11, C.e1);
  P.p(6, 24, C.e4);
  P.p(8, 21, C.e0);
  P.r(14, 3, 12, 8, C.s2);
  P.r(14, 3, 12, 2, C.s1);
  P.r(14, 3, 2, 8, C.s1);
  P.r(24, 3, 2, 8, C.s3);
  P.r(14, 9, 12, 2, C.s3);
  P.r(17, 5, 6, 3, C.s0);
  P.p(15, 4, C.o1);
  P.p(26, 2, C.o1);
  P.p(28, 6, C.o2);
  P.p(12, 8, C.o1);
}

/** Un engrenage d'acier à huit dents, un moyeu sombre. */
function paintNeutral(P: Pen): void {
  const cx = 15;
  const cy = 13;
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const x = Math.round(cx + Math.cos(a) * 8);
    const y = Math.round(cy + Math.sin(a) * 8);
    P.r(x - 1, y - 1, 3, 3, C.s1);
    P.p(x - 1, y - 1, C.s0);
  }
  P.disc(cx, cy, 7, C.s2);
  P.disc(cx, cy, 6, C.s1);
  P.disc(cx, cy, 3, C.s3);
  P.disc(cx, cy, 2, C.ink2);
  P.p(cx - 1, cy - 1, C.s0);
}

/** Le dessinateur de chaque clé. */
const PAINTERS: Readonly<Record<HudIconKey, IconPainter>> = {
  belt: paintBelt,
  puits: paintPuits,
  kiln: paintKiln,
  crate: paintCrate,
  fist: paintFist,
  slab: paintSlab,
  splitter: paintSplitter,
  sorter: paintSorter,
  sawmill: paintSawmill,
  furnace: paintFurnace,
  burner: paintBurner,
  tower: paintTower,
  demolish: paintDemolish,
  hammer: paintHammer,
  neutral: paintNeutral,
};

/** Le cache des icônes finies, par clé. */
const ICONS = new Map<HudIconKey, HTMLCanvasElement>();

/** Peint une icône : une toile de 30 × 26 points passée par `finish`, donc 32 × 28. Résultat en cache. */
export function paintHudIcon(key: HudIconKey): HTMLCanvasElement {
  const cached = ICONS.get(key);
  if (cached) return cached;
  const { canvas, ctx } = makeSurface(30, 26);
  PAINTERS[key](pen(ctx), ctx, iconItems());
  const img = finish(canvas);
  ICONS.set(key, img);
  return img;
}

/** Le cache des adresses `data:` des icônes. */
const URLS = new Map<HudIconKey, string>();

/** L'adresse `data:` PNG d'une icône de bâtiment, en cache, pour une balise `<img>`. */
export function hudIconUrl(buildingKey: string): string {
  const key = hudIconKey(buildingKey);
  const cached = URLS.get(key);
  if (cached) return cached;
  const url = paintHudIcon(key).toDataURL('image/png');
  URLS.set(key, url);
  return url;
}
