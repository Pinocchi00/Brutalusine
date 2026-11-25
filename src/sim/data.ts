// Données du jeu : objets, recettes, bâtiments, livraisons.
// Tout le contenu des ères Bois et Pierre vit ici ; les lots suivants y ajouteront les ères.

// ---------------------------------------------------------------- constantes
export const UPS = 60;                 // pas de simulation par seconde
export const TILE_U = 240;             // unités de convoyeur par case
export const SPACING = 80;             // écart minimal entre deux objets
export const BELT_SPEED = 4;           // unités par pas d'un tapis de rondins : une case par seconde
export const CANOPY_UNIT = 32;         // densité (0-255) équivalant à 1 bois
export const TREE_MIN = 60;            // en dessous, ce n'est qu'une pousse
export const DAY_TICKS = UPS * 60 * 10; // un jour = 10 minutes
export const BRIDGE_MAX = 5;           // portée d'un pont (cases)
export const LOOT_WOOD = 6;            // bois contenu dans un tas de débris

export type Dir = 0 | 1 | 2 | 3;       // 0 = est, 1 = sud, 2 = ouest, 3 = nord
export const DX = [1, 0, -1, 0];
export const DY = [0, 1, 0, -1];

// -------------------------------------------------------------------- objets
export type Shape = 'bloc' | 'boule' | 'gemme' | 'lingot' | 'plaque' | 'bobine' | 'rouage';

export interface ItemDef {
  key: string; name: string; color: string; shape: Shape; desc: string;
  glow: boolean; id: number;
}

const item = (key: string, name: string, color: string, shape: Shape, desc: string, glow = false): ItemDef =>
  ({ key, name, color, shape, desc, glow, id: 0 });

export const ITEMS: ItemDef[] = [
  item('bois', 'Bois', '#B9824A', 'boule', 'Un arbre abattu. Bâtit l’ère du Bois, se cuit en charbon, se brûle.'),
  item('pierre', 'Pierre', '#9C978E', 'bloc', 'De la roche taillée. Bâtit l’ère de la Pierre.'),
  item('carbone', 'Charbon', '#34343C', 'bloc', 'Du bois cuit sans flamme. Chauffe les fours et le Brûleur.'),
  item('argile', 'Argile', '#B5714A', 'boule', 'La terre grasse des berges. Cuite, elle donne la brique.'),
  item('brique', 'Brique', '#A4503A', 'bloc', 'De l’argile cuite au four.'),
  item('cuir', 'Cuir', '#8A5A36', 'plaque', 'Une peau tannée. La bande des tapis de l’ère de la Pierre.'),
];
ITEMS.forEach((it, i) => { it.id = i; });
export const NITEMS = ITEMS.length;
export const I: Record<string, number> = Object.fromEntries(ITEMS.map((it) => [it.key, it.id]));

// ------------------------------------------------------------------ recettes
export interface Recipe {
  key: string; name: string;
  inputs: [number, number][];      // [objet, quantité]
  outputs: [number, number][];
  time: number;                    // pas de simulation
  unlock: number;                  // livraisons accomplies requises
  note: string;
  id: number;
}

type Qty = Record<string, number>;
function recipe(
  key: string, name: string, inputs: Qty, outputs: Qty,
  o: { time: number; unlock: number; note: string },
): Recipe {
  const conv = (q: Qty): [number, number][] => Object.entries(q).map(([k, n]) => {
    if (!(k in I)) throw new Error(`Objet inconnu : ${k}`);
    return [I[k], n];
  });
  return {
    key, name, inputs: conv(inputs), outputs: conv(outputs),
    time: o.time, unlock: o.unlock, note: o.note, id: 0,
  };
}

export const RECIPES: Recipe[] = [
  recipe('charbon', 'Charbon de bois', { bois: 2 }, { carbone: 1 },
    { time: 240, unlock: 1, note: 'On cuit le bois sans flamme : il reste le charbon.' }),
  recipe('brique', 'Brique', { argile: 2, carbone: 1 }, { brique: 2 },
    { time: 300, unlock: 5, note: 'L’argile cuit au charbon.' }),
];
RECIPES.forEach((r, i) => { r.id = i; });
export const R: Record<string, Recipe> = Object.fromEntries(RECIPES.map((r) => [r.key, r]));

/** Combustibles : énergie par unité (joules en jeu). */
export const FUEL: Record<number, number> = {
  [I.bois]: 2800,
  [I.carbone]: 4000,
};

// ----------------------------------------------------------------- gisements
export const DEPOSITS = [
  null,
  { item: I.pierre, name: 'Roche', color: '#D4552B' },
  { item: -1, name: 'Banc de calcaire', color: '#E4DCC6' },
  { item: -1, name: 'Filon de quartz', color: '#8FE6FF' },
  { item: -1, name: 'Gisement de cuivre', color: '#2FD6A3' },
] as const;

// --------------------------------------------------------------------- ères
/** Une ère : la matière de ses bâtiments et la bande de ses convoyeurs. */
export interface EraDef { name: string; material: number; band: number; }

/** Les ères connues, indexées par ère − 1 (la Brique n'est encore que la cible de la démo). */
export const ERAS: EraDef[] = [
  { name: 'Bois', material: I.bois, band: I.bois },
  { name: 'Pierre', material: I.pierre, band: I.cuir },
  { name: 'Brique', material: I.brique, band: I.brique },
];

/** Vitesse des machines et des tapis, par ère (indice ère − 1). */
export const ERA_SPEED = [1, 1.4, 2, 2.7, 3.8, 5.4, 7.5, 10.5];
/** Courant consommé par une machine, par ère (indice ère − 1). */
export const ERA_POWER = [1, 1.5, 2.3, 3.4, 5.1, 7.6, 11.4, 17];

/** Unités par pas d'un tapis de cette ère : 4 en Bois (une case par seconde), arrondi à l'entier. */
export function beltSpeed(era: number): number {
  return Math.round(BELT_SPEED * ERA_SPEED[era - 1]);
}

/** Dernière ère dont les bâtiments sont conçus : la démo s'arrête à la Pierre. */
export const MAX_VERSION = 2;

/** Ce que coûte la version `era` d'un bâtiment. */
export function costOf(def: BuildingDef, era: number): [number, number][] {
  if (def.kind === 'hub') return [];
  const e = ERAS[Math.min(ERAS.length, Math.max(1, era)) - 1];
  if (def.kind === 'slab') return era <= 1 ? [] : [[e.material, 1]];
  if (def.kind === 'belt') return [[e.band, 1]];
  return [[e.material, 2 * def.w * def.h]];
}

// ----------------------------------------------------------------- bâtiments
export type Kind =
  | 'hub' | 'slab' | 'belt' | 'bridge' | 'splitter' | 'storage' | 'machine' | 'miner' | 'sawmill'
  | 'clay' | 'generator' | 'hydro';

export type Category = 'logistique' | 'extraction' | 'fonte' | 'fabrication' | 'energie';
export const CATEGORIES: { key: Category; name: string }[] = [
  { key: 'logistique', name: 'Logistique' },
  { key: 'extraction', name: 'Extraction' },
  { key: 'fonte', name: 'Fonte' },
  { key: 'fabrication', name: 'Fabrication' },
  { key: 'energie', name: 'Énergie' },
];

export interface BuildingDef {
  key: string; name: string; kind: Kind; cat: Category | null; w: number; h: number;
  cost: [number, number][];
  era: number;          // ère d'apparition
  height: number;       // hauteur (cases) : ombre portée
  power: number;        // W consommés en travail (ou produits pour les sources)
  unlock: number;       // livraisons accomplies requises
  heat: boolean;        // machine qui chauffe : charbon dans sa recette, pas de courant
  desc: string;         // une phrase : à quoi ça sert
  recipes: Recipe[];
  fuels: number[];
  filter: boolean;      // trieur
}

function building(
  key: string, name: string, kind: Kind, cat: Category | null, w: number, h: number,
  o: {
    era: number; height?: number; power?: number; unlock?: number; desc: string;
    recipes?: string[]; fuels?: string[]; filter?: boolean; heat?: boolean;
  },
): BuildingDef {
  const def: BuildingDef = {
    key, name, kind, cat, w, h, cost: [], era: o.era,
    height: o.height ?? 1, power: o.power ?? 0, unlock: o.unlock ?? 0, heat: o.heat ?? false, desc: o.desc,
    recipes: (o.recipes ?? []).map((k) => R[k]), fuels: (o.fuels ?? []).map((k) => I[k]),
    filter: o.filter ?? false,
  };
  def.cost = costOf(def, def.era);
  return def;
}

export const BUILDINGS: BuildingDef[] = [
  building('tour', 'La Tour', 'hub', null, 3, 3, { era: 1, height: 2.6, power: 300, desc: 'Le cœur de l’usine et ton inventaire : ce qui y entre par tapis est rangé, et tu bâtis avec. Elle fournit 300 W.' }),

  // --- logistique
  building('convoyeur', 'Convoyeur', 'belt', 'logistique', 1, 1, { era: 1, height: 0.1, desc: 'Transporte les objets. Clique et glisse pour tracer une ligne ; elle tourne toute seule.' }),
  building('dalle', 'Dalle', 'slab', 'logistique', 1, 1, { era: 1, height: 0, desc: 'Pave le sol. La jungle ne repousse pas sur une dalle.' }),
  building('entrepot', 'Stockage', 'storage', 'logistique', 2, 2, { era: 1, height: 1.1, unlock: 1, desc: 'Garde jusqu’à 240 objets et les ressort par sa flèche.' }),
  building('aiguillage', 'Répartiteur', 'splitter', 'logistique', 1, 1, { era: 1, height: 0.4, unlock: 1, desc: 'Répartit un flux en trois : tout droit, à gauche, à droite.' }),
  building('trieur', 'Trieur', 'splitter', 'logistique', 1, 1, { era: 2, height: 0.4, unlock: 3, filter: true, desc: 'L’objet choisi passe tout droit, les autres partent sur les côtés.' }),

  // --- extraction
  building('scierie', 'Scierie', 'sawmill', 'extraction', 2, 2, { era: 1, height: 0.8, power: 40, unlock: 0, desc: 'Coupe les arbres à 5 cases à la ronde et sort du bois. Les arbres repoussent.' }),
  building('puits', 'Puits', 'miner', 'extraction', 3, 3, { era: 1, height: 0.7, power: 60, unlock: 2, desc: 'Extrait la roche sous lui : 1 pierre par seconde. À poser sur des rochers.' }),
  building('argiliere', 'Argilière', 'clay', 'extraction', 2, 2, { era: 2, height: 0.6, power: 40, unlock: 3, desc: 'Drague la berge et sort de l’argile, sans jamais l’épuiser. À poser sur la berge.' }),

  // --- fonte
  building('charbonniere', 'Charbonnière', 'machine', 'fonte', 2, 2, { era: 1, height: 1, unlock: 1, heat: true, recipes: ['charbon'], desc: 'Cuit le bois sans flamme : 2 bois donnent 1 charbon. Pas besoin de courant.' }),
  building('four', 'Four', 'machine', 'fonte', 2, 2, { era: 2, height: 1.2, unlock: 5, heat: true, recipes: ['brique'], desc: 'Cuit l’argile au charbon : 2 argiles et 1 charbon donnent 2 briques. Pas besoin de courant.' }),

  // --- énergie
  building('bruleur', 'Brûleur', 'generator', 'energie', 2, 2, { era: 1, height: 1.2, power: 600, unlock: 2, fuels: ['bois', 'carbone'], desc: 'Brûle du bois ou du charbon : jusqu’à 600 W. Ne consomme que ce que l’usine demande.' }),
  building('roue', 'Roue à eau', 'hydro', 'energie', 2, 2, { era: 2, height: 0.7, power: 200, unlock: 3, desc: '200 W constants, jour et nuit. À poser au bord de l’eau.' }),
];
export const B: Record<string, BuildingDef> = Object.fromEntries(BUILDINGS.map((b) => [b.key, b]));

// ---------------------------------------------------------------- livraisons
/** Lieu que le jeu peut montrer au joueur (bouton « Y aller »). */
export type Place = 'roche' | 'berge' | 'eau' | 'debris' | 'arbre';

/** Une étape guidée : le jeu sait vérifier seul si elle est faite. */
export type Step =
  | { t: 'gather'; text: string; go?: Place }      // ramasser quelque chose à la main
  | { t: 'tool'; key: string; text: string }       // sélectionner un outil
  | { t: 'build'; key: string; text: string; go?: Place }   // poser un bâtiment
  | { t: 'link'; key: string; text: string }       // relier sa sortie à quelque chose
  | { t: 'make'; item: number; text: string };     // en produire au moins un

export interface Quota {
  title: string; verb: string; need: [number, number][]; lore: string; why: string; steps: Step[];
  era: number;         // ère où la livraison est demandée
  rebuild: boolean;    // la livrer refait la Tour et ouvre l'ère suivante
}

const quota = (
  title: string, verb: string, need: Qty, lore: string, why: string, steps: Step[],
  era: number, rebuild = false,
): Quota => ({
  title, verb, need: Object.entries(need).map(([k, n]) => [I[k], n] as [number, number]),
  lore, why, steps, era, rebuild,
});
const gather = (text: string, go?: Place): Step => ({ t: 'gather', text, go });
const tool = (key: string, text: string): Step => ({ t: 'tool', key, text });
const build = (key: string, text: string, go?: Place): Step => ({ t: 'build', key, text, go });
const link = (key: string, text: string): Step => ({ t: 'link', key, text });
const make = (k: string, text: string): Step => ({ t: 'make', item: I[k], text });

export const QUOTAS: Quota[] = [
  quota('Premier flux', 'Livrer du bois à la Tour', { bois: 20 },
    'La capsule s’est posée. Une clairière, la jungle, et rien d’autre.',
    'Un arbre, une Scierie, un tapis, la Tour : c’est toute l’automatisation, en petit.',
    [gather('Déracine un arbre : clique dessus', 'arbre'),
     tool('scierie', 'Choisis la Scierie (Extraction, en bas)'),
     build('scierie', 'Pose-la au milieu des arbres'),
     link('scierie', 'Glisse un Convoyeur de sa flèche jusqu’à la Tour')], 1),
  quota('Charbon', 'Cuire le bois en charbon', { carbone: 40 },
    'Le bois brûle vite. Cuit sans flamme, il chauffe mieux.',
    'Transformer : une machine prend une matière et en sort une autre.',
    [build('charbonniere', 'Pose une Charbonnière'),
     make('carbone', 'Amène-lui du bois par un tapis'),
     link('charbonniere', 'Relie sa flèche à la Tour')], 1),
  quota('Tour de pierre', 'Livrer de la pierre pour refaire la Tour', { pierre: 60 },
    'Au-delà des arbres, de la roche grise.',
    'Extraire un gisement. Livrée, la pierre refait la Tour et ouvre l’ère de la Pierre.',
    [tool('puits', 'Choisis le Puits'),
     build('puits', 'Pose-le sur des rochers', 'roche'),
     link('puits', 'Relie sa flèche à la Tour'),
     build('bruleur', 'Le courant manque ? Pose un Brûleur et nourris-le de bois')], 1, true),
  quota('Cuir', 'Livrer du cuir', { cuir: 30 },
    'La jungle est peuplée. Tout ce qui vit peut servir.',
    'Chasser, puis trier. La chasse arrive bientôt.',
    [], 2),
  quota('Argile', 'Prendre l’argile des berges', { argile: 60 },
    'Le long de l’eau, une terre grasse.',
    'Prendre sur la berge : une machine qui ne s’épuise pas.',
    [build('argiliere', 'Pose une Argilière sur la berge', 'berge'),
     link('argiliere', 'Relie sa flèche à la Tour')], 2),
  quota('Tour de brique', 'Livrer des briques pour refaire la Tour', { brique: 100 },
    'La pierre ne monte pas assez haut. L’argile cuite, si.',
    'Deux entrées dans le Four : argile et charbon.',
    [build('four', 'Pose un Four'),
     make('brique', 'Amène-lui argile ET charbon'),
     link('four', 'Relie sa flèche à la Tour')], 2, true),
];

/** La livraison `index`, ou la livraison de fin une fois la démo terminée. */
export function quotaAt(index: number): Quota {
  if (index < QUOTAS.length) return QUOTAS[index];
  return {
    title: 'Fin de la démo',
    verb: 'La Tour est en brique',
    need: [],
    lore: 'La suite s’écrira ère par ère.',
    why: 'Merci d’avoir joué.',
    steps: [],
    era: 3,
    rebuild: false,
  };
}
