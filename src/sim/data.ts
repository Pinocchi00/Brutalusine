// Données du jeu : objets, recettes, bâtiments, quotas.
// Règle d'or : chaque recette est une équation équilibrée, atome par atome (voir tests/chem.test.ts).
// Le joueur n'a pas à le savoir : il voit « 2 minerais + 3 charbons → 4 fers », et c'est tout.

import { parseFormula, addAtoms, type Atoms } from './chem';

// ---------------------------------------------------------------- constantes
export const UPS = 60;                 // pas de simulation par seconde
export const TILE_U = 240;             // unités de convoyeur par case
export const SPACING = 80;             // écart minimal entre deux objets
export const BELT_SPEED = 8;           // unités par pas (2 cases/s)
export const CANOPY_UNIT = 32;         // densité (0-255) équivalant à 1 bois
export const TREE_MIN = 60;            // en dessous, ce n'est qu'une pousse
export const DAY_TICKS = UPS * 60 * 10; // un jour = 10 minutes
export const BRIDGE_MAX = 5;           // portée d'un pont (cases)
export const LOOT_FER = 12;            // fer contenu dans un tas de débris

export type Dir = 0 | 1 | 2 | 3;       // 0 = est, 1 = sud, 2 = ouest, 3 = nord
export const DX = [1, 0, -1, 0];
export const DY = [0, 1, 0, -1];

// -------------------------------------------------------------------- objets
export type Shape = 'bloc' | 'boule' | 'gemme' | 'lingot' | 'plaque' | 'bobine' | 'rouage';

export interface ItemDef {
  key: string; name: string; formula: string; color: string; shape: Shape; desc: string;
  glow: boolean; id: number; atoms: Atoms;
}

const item = (key: string, name: string, formula: string, color: string, shape: Shape, desc: string, glow = false): ItemDef =>
  ({ key, name, formula, color, shape, desc, glow, id: 0, atoms: {} });

export const ITEMS: ItemDef[] = [
  item('hematite', 'Minerai de fer', 'Fe2O3', '#D4552B', 'gemme', 'De la rouille en cailloux. Fondu avec du charbon, il donne du fer.'),
  item('calcaire', 'Calcaire', 'CaCO3', '#E4DCC6', 'bloc', 'Pierre claire. Cuite, elle devient de la chaux.'),
  item('quartz', 'Quartz', 'SiO2', '#8FE6FF', 'gemme', 'Cristal bleu. Pour le béton, le verre et le silicium.'),
  item('malachite', 'Minerai de cuivre', 'Cu2CH2O5', '#2FD6A3', 'gemme', 'Pierre verte. Fondue avec du charbon, elle donne du cuivre.'),
  item('bois', 'Bois', 'C6H10O5', '#B9824A', 'boule', 'Un arbre déraciné. Se brûle, ou se cuit en charbon.'),
  item('carbone', 'Charbon', 'C', '#34343C', 'bloc', 'Carbone presque pur. Indispensable pour fondre les minerais.'),
  item('fer', 'Fer', 'Fe', '#C3CAD6', 'lingot', 'Le métal de base : convoyeurs, machines, structures.'),
  item('chaux', 'Chaux', 'CaO', '#F6F2E8', 'boule', 'La moitié du béton.'),
  item('beton', 'Béton', 'Ca2SiO4', '#A9A69C', 'bloc', 'La matière de l’usine.'),
  item('acier', 'Acier', 'Fe3C', '#5E8FC7', 'lingot', 'Du fer durci au charbon. Pour tout ce qui doit durer.'),
  item('verre', 'Verre', 'SiO2', '#C8F6F2', 'plaque', 'Quartz fondu. Miroirs et lampes.'),
  item('cuivre', 'Cuivre', 'Cu', '#E8793A', 'lingot', 'Le métal qui conduit le courant.'),
  item('silicium', 'Silicium', 'Si', '#7C8CFF', 'gemme', 'Quartz réduit à l’arc électrique.'),
  item('plaque', 'Plaque de fer', 'Fe2', '#9EA7B5', 'plaque', 'Deux fers pressés. La peau des grandes machines.'),
  item('cable', 'Câble', 'Cu2', '#F3A04B', 'bobine', 'Deux cuivres étirés et enroulés.'),
  item('composant', 'Circuit', 'Cu2Si', '#6FD08C', 'plaque', 'Cuivre gravé sur silicium. Le cerveau des machines.'),
  item('moteur', 'Moteur', 'Fe7Cu4C', '#F0C64C', 'rouage', 'Plaques, câbles et acier : ce qui fait tourner le monde.'),
  item('vertebre', 'Vertèbre', 'Fe19C5Cu8Si4Ca4O8', '#FFFFFF', 'gemme', 'Un os du Colosse. Tout ce que l’usine sait faire, dans une seule pièce.', true),
];
ITEMS.forEach((it, i) => { it.id = i; it.atoms = parseFormula(it.formula); });
export const NITEMS = ITEMS.length;
export const I: Record<string, number> = Object.fromEntries(ITEMS.map((it) => [it.key, it.id]));

// Gaz : ils équilibrent les équations mais ne se manipulent jamais.
export const GASES: Record<string, { name: string; formula: string }> = {
  O2: { name: 'Dioxygène', formula: 'O2' },
  CO2: { name: 'Dioxyde de carbone', formula: 'CO2' },
  H2O: { name: 'Vapeur d’eau', formula: 'H2O' },
};

// ------------------------------------------------------------------ recettes
export interface Recipe {
  key: string; name: string;
  inputs: [number, number][];      // [objet, quantité]
  outputs: [number, number][];
  gasIn: [string, number][];
  gasOut: [string, number][];
  time: number;                    // pas de simulation
  unlock: number;                  // quotas accomplis requis
  note: string;
  id: number;
}

type Qty = Record<string, number>;
function recipe(
  key: string, name: string, inputs: Qty, outputs: Qty,
  o: { gasIn?: Qty; gasOut?: Qty; time: number; unlock: number; note: string },
): Recipe {
  const conv = (q: Qty): [number, number][] => Object.entries(q).map(([k, n]) => {
    if (!(k in I)) throw new Error(`Objet inconnu : ${k}`);
    return [I[k], n];
  });
  return {
    key, name, inputs: conv(inputs), outputs: conv(outputs),
    gasIn: Object.entries(o.gasIn ?? {}), gasOut: Object.entries(o.gasOut ?? {}),
    time: o.time, unlock: o.unlock, note: o.note, id: 0,
  };
}

export const RECIPES: Recipe[] = [
  recipe('pyrolyse', 'Charbon de bois', { bois: 1 }, { carbone: 6 },
    { gasOut: { H2O: 5 }, time: 180, unlock: 1, note: 'On cuit le bois sans le brûler : il reste le charbon.' }),
  recipe('reduction', 'Fer', { hematite: 2, carbone: 3 }, { fer: 4 },
    { gasOut: { CO2: 3 }, time: 240, unlock: 2, note: 'Le charbon arrache l’oxygène au minerai.' }),
  recipe('cuivre', 'Cuivre', { malachite: 1, carbone: 1 }, { cuivre: 2 },
    { gasOut: { CO2: 2, H2O: 1 }, time: 200, unlock: 5, note: 'Même geste que pour le fer, avec la pierre verte.' }),
  recipe('calcination', 'Chaux', { calcaire: 1 }, { chaux: 1 },
    { gasOut: { CO2: 1 }, time: 120, unlock: 3, note: 'La pierre cuite devient poudre.' }),
  recipe('verre', 'Verre', { quartz: 1 }, { verre: 1 },
    { time: 120, unlock: 4, note: 'Le quartz fond puis fige.' }),
  recipe('beton', 'Béton', { chaux: 2, quartz: 1 }, { beton: 1 },
    { time: 150, unlock: 3, note: 'Chaux et quartz, malaxés.' }),
  recipe('plaque', 'Plaque de fer', { fer: 2 }, { plaque: 1 },
    { time: 90, unlock: 3, note: 'Un coup de presse.' }),
  recipe('cable', 'Câble', { cuivre: 2 }, { cable: 1 },
    { time: 90, unlock: 5, note: 'Le cuivre s’étire et s’enroule.' }),
  recipe('acier', 'Acier', { fer: 3, carbone: 1 }, { acier: 1 },
    { time: 210, unlock: 4, note: 'Un peu de charbon dans le fer, et tout change.' }),
  recipe('silicium', 'Silicium', { quartz: 1, carbone: 2 }, { silicium: 1 },
    { gasIn: { O2: 1 }, gasOut: { CO2: 2 }, time: 300, unlock: 6, note: 'À l’arc électrique. Très gourmand en courant.' }),
  recipe('composant', 'Circuit', { cuivre: 2, silicium: 1 }, { composant: 1 },
    { time: 240, unlock: 6, note: 'Cuivre et silicium, gravés ensemble.' }),
  recipe('moteur', 'Moteur', { plaque: 2, cable: 2, acier: 1 }, { moteur: 1 },
    { time: 360, unlock: 7, note: 'Trois lignes qui se rejoignent dans un seul Atelier.' }),
  recipe('vertebre', 'Vertèbre', { acier: 4, composant: 2, beton: 2, moteur: 1 }, { vertebre: 1 },
    { time: 600, unlock: 8, note: 'Tout converge.' }),
  // combustions (dans le Brûleur)
  recipe('combustion_bois', 'Brûler du bois', { bois: 1 }, {},
    { gasIn: { O2: 6 }, gasOut: { CO2: 6, H2O: 5 }, time: 1, unlock: 2, note: 'Un bois nourrit le Brûleur quelques secondes.' }),
  recipe('combustion_carbone', 'Brûler du charbon', { carbone: 1 }, {},
    { gasIn: { O2: 1 }, gasOut: { CO2: 1 }, time: 1, unlock: 2, note: 'Moins d’énergie par pièce que le bois, mais il y en a six par bûche.' }),
];
RECIPES.forEach((r, i) => { r.id = i; });
export const R: Record<string, Recipe> = Object.fromEntries(RECIPES.map((r) => [r.key, r]));

/** Combustibles : énergie par unité (joules en jeu) et CO₂ rejeté. */
export const FUEL: Record<number, { energy: number; co2: number }> = {
  [I.bois]: { energy: 2800, co2: 6 },
  [I.carbone]: { energy: 394, co2: 1 },
};

/** Bilan atomique d'une recette : entrées - sorties, par élément (tout doit valoir 0). */
export function recipeBalance(r: Recipe): Atoms {
  const bal: Atoms = {};
  for (const [id, n] of r.inputs) addAtoms(bal, ITEMS[id].atoms, n);
  for (const [g, n] of r.gasIn) addAtoms(bal, parseFormula(GASES[g].formula), n);
  for (const [id, n] of r.outputs) addAtoms(bal, ITEMS[id].atoms, -n);
  for (const [g, n] of r.gasOut) addAtoms(bal, parseFormula(GASES[g].formula), -n);
  return bal;
}

// ----------------------------------------------------------------- gisements
export const DEPOSITS = [
  null,
  { item: I.hematite, name: 'Gisement de fer', color: '#D4552B' },
  { item: I.calcaire, name: 'Banc de calcaire', color: '#E4DCC6' },
  { item: I.quartz, name: 'Filon de quartz', color: '#8FE6FF' },
  { item: I.malachite, name: 'Gisement de cuivre', color: '#2FD6A3' },
] as const;

// ----------------------------------------------------------------- bâtiments
export type Kind =
  | 'hub' | 'slab' | 'belt' | 'bridge' | 'splitter' | 'storage' | 'deco' | 'machine' | 'miner' | 'sawmill'
  | 'generator' | 'solar' | 'wind' | 'hydro' | 'battery';

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
  height: number;       // hauteur (cases) : ombre portée
  power: number;        // W consommés en travail (ou produits pour les sources)
  unlock: number;       // quotas accomplis requis
  desc: string;         // une phrase : à quoi ça sert
  recipes: Recipe[];
  fuels: number[];
  speed: number;        // multiplicateur de cadence
  filter: boolean;      // trieur
}

function building(
  key: string, name: string, kind: Kind, cat: Category | null, w: number, h: number, cost: Qty,
  o: { height?: number; power?: number; unlock?: number; desc: string; recipes?: string[]; fuels?: string[]; speed?: number; filter?: boolean },
): BuildingDef {
  return {
    key, name, kind, cat, w, h, cost: Object.entries(cost).map(([k, n]) => [I[k], n] as [number, number]),
    height: o.height ?? 1, power: o.power ?? 0, unlock: o.unlock ?? 0, desc: o.desc,
    recipes: (o.recipes ?? []).map((k) => R[k]), fuels: (o.fuels ?? []).map((k) => I[k]),
    speed: o.speed ?? 1, filter: o.filter ?? false,
  };
}

export const BUILDINGS: BuildingDef[] = [
  building('tour', 'La Tour', 'hub', null, 3, 3, {}, { height: 2.6, power: 300, desc: 'Le cœur de l’usine. Tout ce qui y entre rejoint ton stock et compte pour le quota. Elle fournit 300 W.' }),

  // --- logistique
  building('convoyeur', 'Convoyeur', 'belt', 'logistique', 1, 1, { fer: 1 }, { height: 0.1, desc: 'Transporte les objets. Clique et glisse pour tracer une ligne ; elle tourne toute seule.' }),
  building('dalle', 'Dalle', 'slab', 'logistique', 1, 1, {}, { height: 0, desc: 'Pave le sol. Gratuit. La jungle ne repousse pas sur une dalle.' }),
  building('aiguillage', 'Répartiteur', 'splitter', 'logistique', 1, 1, { fer: 2 }, { height: 0.4, unlock: 2, desc: 'Répartit un flux en trois : tout droit, à gauche, à droite.' }),
  building('pont', 'Pont', 'bridge', 'logistique', 1, 1, { fer: 3 }, { height: 0.5, unlock: 3, desc: 'Fait passer un convoyeur au-dessus d’un autre. Pose l’entrée, puis la sortie (5 cases max).' }),
  building('trieur', 'Trieur', 'splitter', 'logistique', 1, 1, { fer: 2 }, { height: 0.4, unlock: 4, filter: true, desc: 'L’objet choisi passe tout droit, les autres partent sur les côtés.' }),
  building('entrepot', 'Entrepôt', 'storage', 'logistique', 2, 2, { beton: 8, fer: 4 }, { height: 1.1, unlock: 4, desc: 'Garde jusqu’à 240 objets et les ressort par sa flèche.' }),
  building('lampadaire', 'Lampadaire', 'deco', 'logistique', 1, 1, { fer: 2, verre: 1 }, { height: 1.2, unlock: 4, desc: 'Une flaque de lumière dans la nuit.' }),

  // --- extraction
  building('puits', 'Puits', 'miner', 'extraction', 3, 3, { fer: 10 }, { height: 0.7, power: 60, desc: 'Extrait le gisement sous lui : 1 minerai par seconde. À poser sur un gisement.' }),
  building('scierie', 'Scierie', 'sawmill', 'extraction', 2, 2, { fer: 6 }, { height: 0.8, power: 40, unlock: 1, desc: 'Coupe les arbres à 5 cases à la ronde et sort du bois. Les arbres repoussent.' }),
  building('foreuse', 'Foreuse', 'miner', 'extraction', 3, 3, { acier: 20, composant: 4 }, { height: 1.5, power: 180, unlock: 6, speed: 3, desc: 'Un Puits trois fois plus rapide.' }),

  // --- fonte
  building('charbonniere', 'Charbonnière', 'machine', 'fonte', 2, 2, { fer: 8 }, { height: 1, power: 50, unlock: 1, recipes: ['pyrolyse'], desc: 'Cuit le bois en charbon : 1 bois donne 6 charbons.' }),
  building('fonderie', 'Fonderie', 'machine', 'fonte', 3, 3, { fer: 14 }, { height: 1.8, power: 150, unlock: 2, recipes: ['reduction', 'cuivre'], desc: 'Minerai + charbon = métal. Il lui faut les deux : amène-les par deux convoyeurs.' }),
  building('four', 'Four', 'machine', 'fonte', 2, 2, { fer: 10 }, { height: 1.2, power: 100, unlock: 3, recipes: ['calcination', 'verre'], desc: 'Cuit le calcaire en chaux, ou le quartz en verre.' }),
  building('four_arc', 'Four à arc', 'machine', 'fonte', 3, 3, { acier: 16, cuivre: 8 }, { height: 1.6, power: 300, unlock: 6, recipes: ['silicium'], desc: 'Quartz + charbon = silicium. 300 W : prévois du courant.' }),

  // --- fabrication
  building('presse', 'Presse', 'machine', 'fabrication', 2, 2, { fer: 12 }, { height: 1.1, power: 80, unlock: 3, recipes: ['plaque', 'cable'], desc: 'Presse le fer en plaques, ou étire le cuivre en câbles.' }),
  building('betonniere', 'Bétonnière', 'machine', 'fabrication', 3, 2, { fer: 14 }, { height: 1.1, power: 100, unlock: 3, recipes: ['beton'], desc: '2 chaux + 1 quartz = 1 béton.' }),
  building('convertisseur', 'Convertisseur', 'machine', 'fabrication', 3, 3, { plaque: 10, beton: 12 }, { height: 1.5, power: 150, unlock: 4, recipes: ['acier'], desc: '3 fers + 1 charbon = 1 acier.' }),
  building('atelier', 'Atelier', 'machine', 'fabrication', 3, 3, { acier: 14, cable: 8 }, { height: 1.2, power: 140, unlock: 6, recipes: ['composant', 'moteur'], desc: 'Assemble les circuits, puis les moteurs.' }),
  building('cloitre', 'Cloître', 'machine', 'fabrication', 3, 3, { acier: 30, composant: 12, beton: 30 }, { height: 1.4, power: 250, unlock: 8, recipes: ['vertebre'], desc: 'Assemble les Vertèbres du Colosse.' }),

  // --- énergie
  building('bruleur', 'Brûleur', 'generator', 'energie', 2, 2, { fer: 16 }, { height: 1.2, power: 600, unlock: 2, fuels: ['bois', 'carbone'], desc: 'Brûle du bois ou du charbon : jusqu’à 600 W. Ne consomme que ce que l’usine demande.' }),
  building('heliostat', 'Héliostat', 'solar', 'energie', 1, 1, { fer: 3, verre: 1 }, { height: 0.3, power: 50, unlock: 4, desc: '50 W en plein jour, rien la nuit.' }),
  building('eolienne', 'Éolienne', 'wind', 'energie', 2, 2, { acier: 8, cable: 4 }, { height: 2.4, power: 220, unlock: 5, desc: 'Jusqu’à 220 W selon le vent, jour et nuit.' }),
  building('turbine', 'Turbine', 'hydro', 'energie', 2, 2, { acier: 10, beton: 8 }, { height: 0.7, power: 350, unlock: 5, desc: '350 W constants. À poser au bord de l’eau.' }),
  building('accu', 'Accumulateur', 'battery', 'energie', 2, 2, { acier: 6, cable: 6 }, { height: 0.9, power: 300, unlock: 6, desc: 'Stocke le surplus et le rend quand le courant manque. Le jour paie la nuit.' }),
];
export const B: Record<string, BuildingDef> = Object.fromEntries(BUILDINGS.map((b) => [b.key, b]));

// -------------------------------------------------------------------- quotas
/** Lieu que le jeu peut montrer au joueur (bouton « Y aller »). */
export type Place = 'hematite' | 'calcaire' | 'quartz' | 'malachite' | 'eau' | 'debris';

/** Une étape guidée : le jeu sait vérifier seul si elle est faite. */
export type Step =
  | { t: 'gather'; text: string; go?: Place }      // ramasser quelque chose à la main
  | { t: 'tool'; key: string; text: string }       // sélectionner un outil
  | { t: 'build'; key: string; text: string; go?: Place }   // poser un bâtiment
  | { t: 'link'; key: string; text: string }       // relier sa sortie à quelque chose
  | { t: 'make'; item: number; text: string };     // en produire au moins un

export interface Quota {
  title: string; verb: string; need: [number, number][]; lore: string; why: string; steps: Step[];
}
const quota = (title: string, verb: string, need: Qty, lore: string, why: string, steps: Step[]): Quota =>
  ({ title, verb, need: Object.entries(need).map(([k, n]) => [I[k], n] as [number, number]), lore, why, steps });
const gather = (text: string, go?: Place): Step => ({ t: 'gather', text, go });
const tool = (key: string, text: string): Step => ({ t: 'tool', key, text });
const build = (key: string, text: string, go?: Place): Step => ({ t: 'build', key, text, go });
const link = (key: string, text: string): Step => ({ t: 'link', key, text });
const make = (k: string, text: string): Step => ({ t: 'make', item: I[k], text });

export const QUOTAS: Quota[] = [
  quota('Réveil', 'Livrer du minerai de fer', { hematite: 30 },
    'Le module s’est posé. Une clairière, des débris, rien d’autre.',
    'Un gisement, un convoyeur, la Tour : c’est toute l’automatisation, en petit.',
    [gather('Ramasse des débris autour de la Tour : clique dessus', 'debris'),
     tool('puits', 'Choisis le Puits (Extraction, en bas)'),
     build('puits', 'Pose-le sur les rochers rouges, flèche vers la Tour (R : pivoter)', 'hematite'),
     link('puits', 'Glisse un Convoyeur de la flèche du Puits jusqu’à une flèche de la Tour')]),
  quota('Charbon', 'Faire du charbon avec les arbres', { carbone: 60 },
    'Autour de toi, la jungle. Du bois à perte de vue.',
    'Première transformation : une machine prend une matière et en sort une autre.',
    [build('scierie', 'Pose une Scierie près des arbres'),
     build('charbonniere', 'Pose une Charbonnière'),
     link('scierie', 'Relie la flèche de la Scierie à la Charbonnière'),
     link('charbonniere', 'Relie la flèche de la Charbonnière à la Tour')]),
  quota('Fer', 'Fondre le minerai en fer', { fer: 60 },
    'Le fer, c’est ce qui te permet de construire tout le reste.',
    'La Fonderie veut DEUX entrées : minerai et charbon. Un Répartiteur partage un flux en plusieurs.',
    [build('fonderie', 'Pose une Fonderie'),
     make('fer', 'Amène-lui du minerai ET du charbon'),
     link('fonderie', 'Relie sa flèche à la Tour'),
     build('bruleur', 'Le courant manque ? Pose un Brûleur et nourris-le de bois')]),
  quota('Charpente', 'Couler du béton, presser des plaques', { beton: 40, plaque: 40 },
    'L’usine a besoin d’un squelette et d’une peau.',
    'Une chaîne en deux étapes : calcaire → chaux, puis chaux + quartz → béton.',
    [build('four', 'Un Puits sur le calcaire (rochers clairs), puis un Four', 'calcaire'),
     build('betonniere', 'Un Puits sur le quartz (cristaux bleus), puis une Bétonnière', 'quartz'),
     make('beton', 'Amène à la Bétonnière la chaux ET le quartz'),
     build('presse', 'Une Presse transforme le fer en plaques')]),
  quota('Acier', 'Durcir le fer', { acier: 60 },
    'Plus solide, plus haut, plus loin.',
    'L’acier ouvre le solaire : le Four fait aussi du verre, et le verre fait des Héliostats.',
    [build('convertisseur', 'Convertisseur : 3 fers + 1 charbon'),
     make('verre', 'Dans un Four, choisis la recette Verre'),
     build('heliostat', 'Pose des Héliostats : du courant gratuit, le jour')]),
  quota('Cuivre', 'Tirer des câbles', { cable: 60 },
    'Une pierre verte, plus loin dans la jungle.',
    'Le gisement est loin : c’est ta première vraie ligne longue distance.',
    [build('fonderie', 'Une Fonderie réglée sur Cuivre, près des rochers verts', 'malachite'),
     make('cuivre', 'Amène-lui minerai de cuivre ET charbon'),
     make('cable', 'Une Presse réglée sur Câble')]),
  quota('Circuits', 'Graver le silicium', { composant: 60 },
    'L’usine apprend à penser.',
    'Le Four à arc dévore le courant : Éoliennes, Turbines, Accumulateurs.',
    [build('four_arc', 'Four à arc : quartz + charbon'),
     build('atelier', 'Atelier : 2 cuivres + 1 silicium')]),
  quota('Moteurs', 'Assembler des moteurs', { moteur: 30 },
    'Trois lignes, une seule machine.',
    'Plaques, câbles et acier doivent arriver ensemble, dans les bonnes proportions.',
    [make('moteur', 'Un Atelier réglé sur Moteur : 2 plaques + 2 câbles + 1 acier')]),
  quota('Première vertèbre', 'Assembler une Vertèbre', { vertebre: 10 },
    'Quelque chose, là-haut, attend un corps.',
    'Tout ce que tu as construit converge dans le Cloître.',
    [build('cloitre', 'Cloître : acier, circuits, béton, moteur')]),
];

/** Quotas infinis après le dernier quota écrit : la demande croît de 45 % par palier. */
export function quotaAt(index: number): Quota {
  if (index < QUOTAS.length) return QUOTAS[index];
  const k = index - QUOTAS.length;
  const n = Math.round(20 * Math.pow(1.45, k + 1));
  const extra = [['acier', 6], ['composant', 4], ['moteur', 2], ['beton', 8], ['cable', 6]][k % 5] as [string, number];
  return {
    title: `Palier ${k + 1}`,
    verb: 'Nourrir le Colosse',
    need: [[I.vertebre, n], [I[extra[0]], n * extra[1]]],
    lore: 'Encore.',
    why: 'La demande croît de 45 % à chaque palier. À toi d’agrandir l’usine.',
    steps: [],
  };
}

export const START_STOCK: Qty = { fer: 40 };
