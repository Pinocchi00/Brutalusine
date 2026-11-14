// Données du jeu : objets, gaz, recettes, bâtiments, quotas.
// Règle d'or : chaque recette est une équation chimique équilibrée (voir tests/chem.test.ts).

import { parseFormula, addAtoms, type Atoms } from './chem';

// ---------------------------------------------------------------- constantes
export const UPS = 60;                 // pas de simulation par seconde
export const TILE_U = 240;             // unités de convoyeur par case
export const SPACING = 80;             // écart minimal entre deux objets
export const BELT_SPEED = 8;           // unités par pas (2 cases/s)
export const CANOPY_UNIT = 32;         // densité (0-255) équivalant à 1 unité de biomasse
export const DAY_TICKS = UPS * 60 * 10; // un jour = 10 minutes
export const BRIDGE_MAX = 5;           // portée d'un pont (cases)

export type Dir = 0 | 1 | 2 | 3;       // 0 = est, 1 = sud, 2 = ouest, 3 = nord
export const DX = [1, 0, -1, 0];
export const DY = [0, 1, 0, -1];

// -------------------------------------------------------------------- objets
export type Shape = 'bloc' | 'boule' | 'gemme' | 'lingot' | 'bonbonne';

export interface ItemDef {
  key: string; name: string; formula: string; color: string; shape: Shape; desc: string;
  glow: boolean; id: number; atoms: Atoms;
}

const item = (key: string, name: string, formula: string, color: string, shape: Shape, desc: string, glow = false): ItemDef =>
  ({ key, name, formula, color, shape, desc, glow, id: 0, atoms: {} });

export const ITEMS: ItemDef[] = [
  item('hematite', 'Hématite', 'Fe2O3', '#C8502A', 'gemme', 'Oxyde de fer : la rouille de la planète. Se réduit en fer avec du charbon.'),
  item('calcaire', 'Calcaire', 'CaCO3', '#D9D2BF', 'bloc', 'Carbonate de calcium. Chauffé, il donne la chaux — et relâche son carbone.'),
  item('quartz', 'Quartz', 'SiO2', '#8FE6FF', 'gemme', 'Silice cristalline. Base du béton, du verre et du silicium.'),
  item('chalcopyrite', 'Chalcopyrite', 'CuFeS2', '#E0C040', 'gemme', 'Minerai de cuivre. Son soufre part en fumée si on ne le capte pas.'),
  item('biomasse', 'Biomasse', 'C6H10O5', '#7BC043', 'boule', 'Cellulose : la jungle, coupée. Combustible, et source de charbon.'),
  item('carbone', 'Charbon', 'C', '#17171A', 'bloc', 'Carbone presque pur. Il arrache l’oxygène aux minerais.'),
  item('fer', 'Fer', 'Fe', '#B8C0CC', 'lingot', 'Le métal de base : convoyeurs, machines, structures.'),
  item('chaux', 'Chaux vive', 'CaO', '#F2EEE4', 'boule', 'Oxyde de calcium. La moitié du béton.'),
  item('beton', 'Béton', 'Ca2SiO4', '#A7A59E', 'bloc', 'Silicate de calcium (bélite). La matière de l’usine.'),
  item('acier', 'Acier', 'Fe3C', '#5E8FC7', 'lingot', 'Fer carburé. Pour tout ce qui doit durer.'),
  item('verre', 'Verre', 'SiO2', '#BFF3F0', 'bloc', 'Silice fondue. Miroirs d’héliostats, serres, lampes.'),
  item('cuivre', 'Cuivre', 'Cu', '#E0763A', 'lingot', 'Conducteur. Le début de l’électricité sérieuse.'),
  item('scorie', 'Scorie', 'FeSiO3', '#6B4A4A', 'bloc', 'Silicate de fer : le déchet de la fusion du cuivre. Rien ne disparaît — il faut lui trouver une place.'),
  item('silicium', 'Silicium', 'Si', '#7C8CFF', 'gemme', 'Silicium métallurgique.'),
  item('composant', 'Composant', 'Cu2Si', '#F5D76E', 'lingot', 'Cuivre et silicium assemblés. Le cerveau des machines avancées.'),
  item('eau', 'Eau', 'H2O', '#3FA9F5', 'bonbonne', 'Bonbonne d’eau de la rivière.'),
  item('acide', 'Acide sulfurique', 'H2SO4', '#D4E157', 'bonbonne', 'Le soufre capté, rendu utile.'),
  item('platre', 'Plâtre', 'CaSO4', '#FFFFFF', 'bloc', 'Sulfate de calcium. Le soufre, fixé pour de bon dans la pierre.'),
  item('hydrogene', 'Hydrogène', 'H2', '#F48FB1', 'bonbonne', 'Combustible propre et réducteur sans carbone.'),
  item('ammoniac', 'Ammoniac', 'NH3', '#B39DDB', 'bonbonne', 'L’azote de l’air, fixé.'),
  item('engrais', 'Engrais', 'N2H8SO4', '#8D6E63', 'boule', 'Sulfate d’ammonium. Un Semeur le rend à la jungle.'),
  item('seve', 'Lueur', 'C6H12O6', '#7FF0D2', 'boule', 'Sève lumineuse d’un Éventail. L’usine ne sait pas la fabriquer : elle se mérite.', true),
  item('vertebre', 'Vertèbre', 'Fe12C10Cu4Si4Ca4O14H12', '#FFFFFF', 'gemme', 'Un os du Colosse.', true),
];
ITEMS.forEach((it, i) => { it.id = i; it.atoms = parseFormula(it.formula); });
export const NITEMS = ITEMS.length;
export const I: Record<string, number> = Object.fromEntries(ITEMS.map((it) => [it.key, it.id]));

// Espèces gazeuses : échangées avec l'atmosphère, jamais sur convoyeur.
export const GASES: Record<string, { name: string; formula: string }> = {
  O2: { name: 'Dioxygène', formula: 'O2' },
  N2: { name: 'Diazote', formula: 'N2' },
  CO2: { name: 'Dioxyde de carbone', formula: 'CO2' },
  H2O: { name: 'Vapeur d’eau', formula: 'H2O' },
  SO2: { name: 'Dioxyde de soufre', formula: 'SO2' },
};

// ------------------------------------------------------------------ recettes
export interface Recipe {
  key: string; name: string;
  inputs: [number, number][];      // [objet, quantité]
  outputs: [number, number][];
  gasIn: [string, number][];       // gaz prélevés (air, atmosphère, captage)
  gasOut: [string, number][];      // gaz rejetés
  time: number;                    // pas de simulation
  smoke: number;                   // fumée locale (particules)
  unlock: number;                  // quotas accomplis requis
  light: boolean;                  // ne tourne qu'à la lumière du jour
  note: string;
  id: number;
}

type Qty = Record<string, number>;
function recipe(
  key: string, name: string, inputs: Qty, outputs: Qty,
  o: { gasIn?: Qty; gasOut?: Qty; time: number; smoke?: number; unlock: number; light?: boolean; note: string },
): Recipe {
  const conv = (q: Qty): [number, number][] => Object.entries(q).map(([k, n]) => {
    if (!(k in I)) throw new Error(`Objet inconnu : ${k}`);
    return [I[k], n];
  });
  return {
    key, name, inputs: conv(inputs), outputs: conv(outputs),
    gasIn: Object.entries(o.gasIn ?? {}), gasOut: Object.entries(o.gasOut ?? {}),
    time: o.time, smoke: o.smoke ?? 0, unlock: o.unlock, light: o.light ?? false, note: o.note, id: 0,
  };
}

export const RECIPES: Recipe[] = [
  recipe('pyrolyse', 'Pyrolyse', { biomasse: 1 }, { carbone: 6 },
    { gasOut: { H2O: 5 }, time: 180, smoke: 1.5, unlock: 1, note: 'On chasse l’eau du bois : il reste le carbone.' }),
  recipe('reduction', 'Réduction du fer', { hematite: 2, carbone: 3 }, { fer: 4 },
    { gasOut: { CO2: 3 }, time: 240, smoke: 1, unlock: 2, note: 'Le carbone arrache l’oxygène au fer. C’est le geste fondateur de la métallurgie.' }),
  recipe('reduction_h2', 'Réduction à l’hydrogène', { hematite: 1, hydrogene: 3 }, { fer: 2 },
    { gasOut: { H2O: 3 }, time: 200, unlock: 8, note: 'Le même fer, sans une molécule de CO₂ : il ne sort que de la vapeur d’eau.' }),
  recipe('calcination', 'Calcination', { calcaire: 1 }, { chaux: 1 },
    { gasOut: { CO2: 1 }, time: 120, smoke: 0.3, unlock: 3, note: 'La pierre relâche le carbone qu’elle gardait depuis toujours.' }),
  recipe('beton', 'Frittage du béton', { chaux: 2, quartz: 1 }, { beton: 1 },
    { time: 150, unlock: 3, note: 'Chaux et silice fusionnent en bélite, le cœur du ciment.' }),
  recipe('acier', 'Cémentation', { fer: 3, carbone: 1 }, { acier: 1 },
    { time: 210, unlock: 4, note: 'Un peu de carbone dans le fer, et tout change.' }),
  recipe('verre', 'Fusion du verre', { quartz: 1 }, { verre: 1 },
    { time: 120, smoke: 0.2, unlock: 4, note: 'La silice fond puis fige sans cristalliser.' }),
  recipe('fusion_cuivre', 'Fusion du cuivre', { chalcopyrite: 2, quartz: 2 }, { cuivre: 2, scorie: 2 },
    { gasIn: { O2: 5 }, gasOut: { SO2: 4 }, time: 300, smoke: 1, unlock: 5, note: 'Le cuivre sort, la scorie reste, le soufre s’envole. Sans Épurateur, il retombe sur la jungle.' }),
  recipe('silicium', 'Réduction de la silice', { quartz: 1, carbone: 2 }, { silicium: 1 },
    { gasIn: { O2: 1 }, gasOut: { CO2: 2 }, time: 300, smoke: 1, unlock: 6, note: 'À l’arc électrique, le carbone prend l’oxygène du quartz.' }),
  recipe('composant', 'Assemblage', { cuivre: 2, silicium: 1 }, { composant: 1 },
    { time: 240, unlock: 6, note: 'Cuivre et silicium, gravés ensemble.' }),
  recipe('acide', 'Procédé de contact', { eau: 2 }, { acide: 2 },
    { gasIn: { SO2: 2, O2: 1 }, time: 180, unlock: 6, note: 'La fumée des fonderies devient une ressource.' }),
  recipe('platre', 'Neutralisation', { calcaire: 1, acide: 1 }, { platre: 1 },
    { gasOut: { H2O: 1, CO2: 1 }, time: 150, unlock: 7, note: 'L’acide ronge le calcaire : il reste du plâtre.' }),
  recipe('electrolyse', 'Électrolyse', { eau: 2 }, { hydrogene: 2 },
    { gasOut: { O2: 1 }, time: 120, unlock: 7, note: 'Le courant casse l’eau en deux. Gourmand en énergie.' }),
  recipe('haber', 'Procédé Haber', { hydrogene: 3 }, { ammoniac: 2 },
    { gasIn: { N2: 1 }, time: 240, unlock: 8, note: 'L’azote de l’air, forcé à se lier à l’hydrogène.' }),
  recipe('engrais', 'Synthèse d’engrais', { ammoniac: 2, acide: 1 }, { engrais: 1 },
    { time: 180, unlock: 8, note: 'Ammoniac et acide donnent un sel que les plantes adorent.' }),
  recipe('serre', 'Photosynthèse (serre)', { eau: 5 }, { biomasse: 1 },
    { gasIn: { CO2: 6 }, gasOut: { O2: 6 }, time: 300, unlock: 9, light: true, note: 'De l’eau, du CO₂ pris dans l’air, de la lumière : de la biomasse sans toucher à la jungle.' }),
  recipe('photosynthese', 'Photosynthèse (Éventail)', { eau: 6 }, { seve: 1 },
    { gasIn: { CO2: 6 }, gasOut: { O2: 6 }, time: 900, unlock: 9, light: true, note: 'L’arbre refait ce que l’usine défait. Il ne donne que si la jungle vit autour de lui.' }),
  recipe('vertebre', 'Ossification', { acier: 4, composant: 2, beton: 2, seve: 1 }, { vertebre: 1 },
    { time: 600, unlock: 10, note: 'Acier, cuivre, béton et sève : un fragment du Colosse.' }),
  // combustions (dans les générateurs)
  recipe('combustion_biomasse', 'Combustion de biomasse', { biomasse: 1 }, {},
    { gasIn: { O2: 6 }, gasOut: { CO2: 6, H2O: 5 }, time: 1, smoke: 1.2, unlock: 2, note: '2 800 kJ par unité.' }),
  recipe('combustion_carbone', 'Combustion de charbon', { carbone: 1 }, {},
    { gasIn: { O2: 1 }, gasOut: { CO2: 1 }, time: 1, smoke: 0.15, unlock: 2, note: '394 kJ par unité.' }),
  recipe('combustion_h2', 'Pile à hydrogène', { hydrogene: 2 }, {},
    { gasIn: { O2: 1 }, gasOut: { H2O: 2 }, time: 1, unlock: 8, note: '286 kJ par unité, et seulement de l’eau.' }),
];
RECIPES.forEach((r, i) => { r.id = i; });
export const R: Record<string, Recipe> = Object.fromEntries(RECIPES.map((r) => [r.key, r]));

/** Combustibles : énergie par unité (kJ/mol réels, joules en jeu), CO₂ et fumée rejetés. */
export const FUEL: Record<number, { energy: number; co2: number; smoke: number }> = {
  [I.biomasse]: { energy: 2800, co2: 6, smoke: 1.2 },
  [I.carbone]: { energy: 394, co2: 1, smoke: 0.15 },
  [I.hydrogene]: { energy: 286, co2: 0, smoke: 0 },
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
  { item: I.hematite, name: 'Gisement d’hématite', color: '#C8502A' },
  { item: I.calcaire, name: 'Banc de calcaire', color: '#D9D2BF' },
  { item: I.quartz, name: 'Filon de quartz', color: '#8FE6FF' },
  { item: I.chalcopyrite, name: 'Veine de chalcopyrite', color: '#E0C040' },
] as const;

// ----------------------------------------------------------------- bâtiments
export type Kind =
  | 'hub' | 'slab' | 'belt' | 'bridge' | 'splitter' | 'storage' | 'deco' | 'machine' | 'miner' | 'sawmill' | 'pump'
  | 'generator' | 'solar' | 'wind' | 'hydro' | 'battery' | 'scrubber' | 'ring' | 'seeder' | 'tree';

export type Category = 'logistique' | 'extraction' | 'fonte' | 'assemblage' | 'chimie' | 'energie' | 'vivant';
export const CATEGORIES: { key: Category; name: string }[] = [
  { key: 'logistique', name: 'Logistique' },
  { key: 'extraction', name: 'Extraction' },
  { key: 'fonte', name: 'Fonte' },
  { key: 'assemblage', name: 'Assemblage' },
  { key: 'chimie', name: 'Chimie' },
  { key: 'energie', name: 'Énergie' },
  { key: 'vivant', name: 'Vivant' },
];

export interface BuildingDef {
  key: string; name: string; kind: Kind; cat: Category | null; w: number; h: number;
  cost: [number, number][];
  height: number;       // hauteur (cases) : sert à l'ombre portée sur les héliostats
  power: number;        // W consommés en travail (ou produits pour les sources)
  unlock: number;       // quotas accomplis requis
  desc: string;         // une phrase : à quoi ça sert
  recipes: Recipe[];
  fuels: number[];
  speed: number;        // multiplicateur de cadence
  filter: boolean;      // aiguillage à filtre obligatoire
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
  building('tour', 'La Tour', 'hub', null, 3, 3, {}, { height: 4, power: 300, desc: 'Le cœur de l’usine. Tout ce qui y entre rejoint ton stock et compte pour le quota. Elle fournit 300 W.' }),
  building('eventail', 'Éventail', 'tree', null, 3, 3, {}, { height: 0, desc: 'L’arbre de la planète. Son cœur brille quand la jungle autour de lui est en bonne santé.' }),

  // --- logistique
  building('convoyeur', 'Convoyeur', 'belt', 'logistique', 1, 1, { fer: 1 }, { height: 0.1, desc: 'Transporte les objets. Clique et glisse pour tracer une ligne ; elle tourne toute seule.' }),
  building('aiguillage', 'Aiguillage', 'splitter', 'logistique', 1, 1, { fer: 2 }, { height: 0.4, unlock: 2, desc: 'Répartit un flux en trois : tout droit, à gauche, à droite.' }),
  building('trieur', 'Trieur', 'splitter', 'logistique', 1, 1, { fer: 2 }, { height: 0.4, unlock: 4, filter: true, desc: 'L’objet choisi passe tout droit, les autres partent sur les côtés. Clique dessus pour choisir.' }),
  building('pont', 'Pont', 'bridge', 'logistique', 1, 1, { fer: 3 }, { height: 0.5, unlock: 3, desc: 'Fait passer un convoyeur au-dessus d’un autre. Pose l’entrée, puis la sortie (5 cases max).' }),
  building('entrepot', 'Entrepôt', 'storage', 'logistique', 2, 2, { beton: 8, fer: 4 }, { height: 1.2, unlock: 3, desc: 'Garde jusqu’à 240 objets et les ressort par sa flèche. Un tampon entre deux étapes.' }),
  building('dalle', 'Dalle', 'slab', 'logistique', 1, 1, { beton: 1 }, { height: 0, unlock: 3, desc: 'Pave le sol : la jungle ne repousse pas sur le béton.' }),
  building('lampadaire', 'Lampadaire', 'deco', 'logistique', 1, 1, { fer: 2, verre: 1 }, { height: 1.4, unlock: 4, desc: 'Une flaque de lumière chaude dans la nuit.' }),

  // --- extraction
  building('puits', 'Puits', 'miner', 'extraction', 3, 3, { fer: 10 }, { height: 0.6, power: 60, desc: 'Extrait le gisement sous lui et juste autour : 1 minerai par seconde. À poser sur un gisement.' }),
  building('scierie', 'Scierie', 'sawmill', 'extraction', 2, 2, { fer: 6 }, { height: 0.9, power: 40, unlock: 1, desc: 'Coupe la jungle dans un rayon de 5 cases et sort de la biomasse. La jungle repousse si on lui en laisse.' }),
  building('pompe', 'Pompe', 'pump', 'extraction', 2, 2, { fer: 8, beton: 4 }, { height: 0.9, power: 30, unlock: 5, desc: 'Remplit des bonbonnes d’eau. À poser au bord de l’eau.' }),
  building('foreuse', 'Foreuse', 'miner', 'extraction', 3, 3, { acier: 20, composant: 4 }, { height: 1.6, power: 180, unlock: 6, speed: 3, desc: 'Un Puits trois fois plus rapide.' }),

  // --- fonte
  building('charbonniere', 'Charbonnière', 'machine', 'fonte', 2, 2, { fer: 8 }, { height: 1.1, power: 50, unlock: 1, recipes: ['pyrolyse'], desc: 'Cuit la biomasse en charbon : 1 biomasse donne 6 charbons.' }),
  building('haut_fourneau', 'Haut fourneau', 'machine', 'fonte', 3, 3, { fer: 14 }, { height: 2.2, power: 150, unlock: 2, recipes: ['reduction', 'reduction_h2'], desc: 'Hématite + charbon = fer. Il lui faut les deux : amène-les par deux convoyeurs.' }),
  building('four_chaux', 'Four à chaux', 'machine', 'fonte', 2, 2, { fer: 10 }, { height: 1.5, power: 100, unlock: 3, recipes: ['calcination'], desc: 'Cuit le calcaire en chaux vive.' }),
  building('verrerie', 'Verrerie', 'machine', 'fonte', 2, 2, { fer: 10, beton: 6 }, { height: 1.2, power: 120, unlock: 4, recipes: ['verre'], desc: 'Fond le quartz en verre.' }),
  building('fonderie', 'Fonderie de cuivre', 'machine', 'fonte', 3, 2, { acier: 10, beton: 10 }, { height: 1.5, power: 180, unlock: 5, recipes: ['fusion_cuivre'], desc: 'Chalcopyrite + quartz = cuivre + scorie. Rejette du SO₂ : prévois un Épurateur, et un Trieur pour la scorie.' }),
  building('four_arc', 'Four à arc', 'machine', 'fonte', 3, 3, { acier: 16, cuivre: 8 }, { height: 1.8, power: 300, unlock: 6, recipes: ['silicium'], desc: 'Quartz + charbon = silicium. Très gourmand en courant.' }),

  // --- assemblage
  building('presse', 'Presse à béton', 'machine', 'assemblage', 3, 2, { fer: 14 }, { height: 1.2, power: 100, unlock: 3, recipes: ['beton'], desc: '2 chaux + 1 quartz = 1 béton.' }),
  building('convertisseur', 'Convertisseur', 'machine', 'assemblage', 3, 3, { fer: 20, beton: 12 }, { height: 1.7, power: 150, unlock: 4, recipes: ['acier'], desc: '3 fers + 1 charbon = 1 acier.' }),
  building('atelier', 'Atelier', 'machine', 'assemblage', 3, 3, { acier: 14, cuivre: 8 }, { height: 1.3, power: 140, unlock: 6, recipes: ['composant'], desc: '2 cuivres + 1 silicium = 1 composant.' }),
  building('cloitre', 'Cloître', 'machine', 'assemblage', 3, 3, { acier: 30, composant: 12, beton: 30 }, { height: 1.6, power: 250, unlock: 10, recipes: ['vertebre'], desc: 'Assemble les Vertèbres du Colosse.' }),

  // --- chimie
  building('epurateur', 'Épurateur', 'scrubber', 'chimie', 2, 2, { acier: 10, cuivre: 6 }, { height: 2.4, power: 80, unlock: 6, recipes: ['acide'], desc: 'Capte le SO₂ des fonderies à 8 cases à la ronde. Avec de l’eau, il en fait de l’acide.' }),
  building('platriere', 'Plâtrière', 'machine', 'chimie', 2, 2, { acier: 8, beton: 8 }, { height: 1.2, power: 80, unlock: 7, recipes: ['platre'], desc: 'Calcaire + acide = plâtre.' }),
  building('electrolyseur', 'Électrolyseur', 'machine', 'chimie', 2, 2, { acier: 10, composant: 4 }, { height: 1.4, power: 400, unlock: 7, recipes: ['electrolyse'], desc: 'Casse l’eau en hydrogène. 400 W : il faut de l’énergie à revendre.' }),
  building('reacteur', 'Réacteur Haber', 'machine', 'chimie', 3, 3, { acier: 24, composant: 8 }, { height: 2.6, power: 300, unlock: 8, recipes: ['haber'], desc: 'Hydrogène + azote de l’air = ammoniac.' }),
  building('usine_engrais', 'Usine d’engrais', 'machine', 'chimie', 3, 2, { acier: 14, beton: 12 }, { height: 1.3, power: 100, unlock: 8, recipes: ['engrais'], desc: 'Ammoniac + acide = engrais.' }),

  // --- énergie
  building('amphi', 'Amphithéâtre', 'generator', 'energie', 2, 2, { fer: 16 }, { height: 1.3, power: 600, unlock: 2, fuels: ['biomasse', 'carbone'], desc: 'Brûle biomasse ou charbon : jusqu’à 600 W. Ne consomme que ce que l’usine demande.' }),
  building('heliostat', 'Héliostat', 'solar', 'energie', 1, 1, { fer: 3, verre: 1 }, { height: 0.3, power: 50, unlock: 4, desc: '50 W en plein soleil. Rien la nuit, rien à l’ombre d’un bâtiment.' }),
  building('eolienne', 'Éolienne', 'wind', 'energie', 2, 2, { acier: 8, cuivre: 2 }, { height: 3, power: 220, unlock: 5, desc: 'Jusqu’à 220 W selon le vent, jour et nuit.' }),
  building('turbine', 'Turbine', 'hydro', 'energie', 2, 2, { acier: 10, beton: 8 }, { height: 0.8, power: 350, unlock: 5, desc: '350 W constants. À poser au bord de l’eau.' }),
  building('accu', 'Accumulateur', 'battery', 'energie', 2, 2, { acier: 6, cuivre: 6, acide: 6 }, { height: 1, power: 300, unlock: 7, desc: 'Stocke le surplus (60 kJ) et le rend quand l’usine manque de courant. Le jour paie la nuit.' }),
  building('pile', 'Pile à hydrogène', 'generator', 'energie', 2, 2, { acier: 12, composant: 6 }, { height: 1.2, power: 900, unlock: 8, fuels: ['hydrogene'], desc: 'Brûle l’hydrogène : 900 W, zéro fumée.' }),

  // --- vivant
  building('serre', 'Serre', 'machine', 'vivant', 3, 3, { acier: 10, verre: 12 }, { height: 1.2, power: 40, unlock: 9, recipes: ['serre'], desc: 'Fait pousser de la biomasse avec de l’eau, le CO₂ de l’air et le soleil. Elle nettoie l’atmosphère.' }),
  building('semeur', 'Semeur', 'seeder', 'vivant', 2, 2, { acier: 8, composant: 2 }, { height: 1, power: 30, unlock: 9, desc: 'Répand de l’engrais : la jungle repousse vite dans un rayon de 6 cases.' }),
  building('cerclage', 'Cerclage', 'ring', 'vivant', 3, 3, { acier: 8, composant: 4 }, { height: 0.5, power: 20, unlock: 9, recipes: ['photosynthese'], desc: 'Se pose sur un Éventail. Avec de l’eau, il recueille sa Lueur — seulement si la jungle vit autour.' }),
];
export const B: Record<string, BuildingDef> = Object.fromEntries(BUILDINGS.map((b) => [b.key, b]));

// -------------------------------------------------------------------- quotas
/** Lieu que le jeu peut montrer au joueur (bouton « Y aller »). */
export type Place = 'hematite' | 'calcaire' | 'quartz' | 'chalcopyrite' | 'eau' | 'eventail';

/** Une étape guidée : le jeu sait vérifier seul si elle est faite. */
export type Step =
  | { t: 'tool'; key: string; text: string }       // sélectionner un outil
  | { t: 'build'; key: string; text: string; go?: Place }   // poser un bâtiment
  | { t: 'link'; key: string; text: string }       // relier sa sortie à quelque chose
  | { t: 'make'; item: number; text: string };     // en produire au moins un

export interface Quota {
  title: string; verb: string; need: [number, number][]; lore: string; why: string; steps: Step[];
}
const quota = (title: string, verb: string, need: Qty, lore: string, why: string, steps: Step[]): Quota =>
  ({ title, verb, need: Object.entries(need).map(([k, n]) => [I[k], n] as [number, number]), lore, why, steps });
const tool = (key: string, text: string): Step => ({ t: 'tool', key, text });
const build = (key: string, text: string, go?: Place): Step => ({ t: 'build', key, text, go });
const link = (key: string, text: string): Step => ({ t: 'link', key, text });
const make = (k: string, text: string): Step => ({ t: 'make', item: I[k], text });

export const QUOTAS: Quota[] = [
  quota('Réveil', 'Livrer de l’hématite à la Tour', { hematite: 20 },
    'Le module s’est posé. Une clairière, rien d’autre.',
    'Tout commence par un flux : un gisement, un convoyeur, la Tour.',
    [tool('puits', 'Choisis le Puits (Extraction, en bas)'),
     build('puits', 'Pose-le sur le gisement rouge', 'hematite'),
     link('puits', 'Trace un Convoyeur de la flèche du Puits jusqu’à la Tour')]),
  quota('Charbon', 'Transformer la jungle en charbon', { carbone: 60 },
    'La forêt est un réservoir de carbone.',
    'Le charbon ouvre le métal : sans lui, l’hématite reste de la rouille.',
    [build('scierie', 'Pose une Scierie au bord de la jungle'),
     build('charbonniere', 'Pose une Charbonnière'),
     link('scierie', 'Relie la Scierie à la Charbonnière'),
     link('charbonniere', 'Relie la Charbonnière à la Tour')]),
  quota('Fer', 'Réduire l’hématite en fer', { fer: 60 },
    'Le carbone arrache l’oxygène au métal.',
    'Le Haut fourneau a besoin de DEUX entrées : hématite et charbon. C’est ta première vraie chaîne.',
    [build('haut_fourneau', 'Pose un Haut fourneau'),
     make('fer', 'Amène-lui hématite ET charbon (deux convoyeurs)'),
     link('haut_fourneau', 'Relie sa sortie à la Tour'),
     build('amphi', 'Le courant manque ? Un Amphithéâtre brûle de la biomasse')]),
  quota('Béton', 'Couler le premier béton', { beton: 60 },
    'L’usine a besoin d’un squelette.',
    'Deux matières, deux étapes : le calcaire devient chaux, puis chaux + quartz deviennent béton.',
    [build('four_chaux', 'Un Puits sur le calcaire (gisement clair), puis un Four à chaux', 'calcaire'),
     build('presse', 'Un Puits sur le quartz (gisement bleu), puis une Presse à béton', 'quartz'),
     make('beton', 'Amène à la Presse la chaux ET le quartz')]),
  quota('Acier', 'Carburer le fer', { acier: 60 },
    'Regarde les ombres : elles tournent.',
    'L’acier ouvre l’énergie propre : héliostats le jour, mais rien la nuit.',
    [build('convertisseur', 'Convertisseur : 3 fers + 1 charbon'),
     build('verrerie', 'Verrerie : le verre sert aux héliostats'),
     build('heliostat', 'Pose des Héliostats, hors de l’ombre')]),
  quota('Cuivre', 'Fondre la chalcopyrite', { cuivre: 80 },
    'Rien ne disparaît. Tout se déplace.',
    'Première réaction sale : elle laisse un déchet solide (scorie) et un gaz toxique (SO₂).',
    [build('fonderie', 'Fonderie de cuivre : chalcopyrite (gisement jaune, plus loin) + quartz', 'chalcopyrite'),
     build('trieur', 'Un Trieur sépare le cuivre de la scorie'),
     make('cuivre', 'Envoie la scorie dans un Entrepôt ou à la Tour')]),
  quota('Composants', 'Assembler cuivre et silicium', { composant: 60 },
    'La fumée pèse sur la jungle. Elle s’en souviendra.',
    'Le Four à arc dévore le courant : c’est le moment de diversifier ton énergie.',
    [build('four_arc', 'Four à arc : quartz + charbon'),
     build('atelier', 'Atelier : 2 cuivres + 1 silicium'),
     build('epurateur', 'Un Épurateur près des fonderies capte le SO₂')]),
  quota('Soufre', 'Rendre la fumée utile', { acide: 40, platre: 40 },
    'Ce que tu rejetais, tu le vends.',
    'L’Épurateur a besoin d’eau : installe une Pompe au bord de la rivière.',
    [build('pompe', 'Pompe au bord de l’eau', 'eau'),
     make('acide', 'Amène l’eau à l’Épurateur'),
     build('platriere', 'Plâtrière : calcaire + acide')]),
  quota('Azote', 'Fabriquer de l’engrais', { engrais: 40 },
    'L’air lui-même devient matière.',
    'Eau → hydrogène → ammoniac → engrais : ta plus longue chaîne.',
    [build('electrolyseur', 'Électrolyseur : eau → hydrogène'),
     build('reacteur', 'Réacteur Haber : hydrogène → ammoniac'),
     build('usine_engrais', 'Usine d’engrais : ammoniac + acide')]),
  quota('Lueur', 'Recueillir la sève d’un Éventail', { seve: 20 },
    'Il y a une chose que l’usine ne sait pas fabriquer.',
    'L’Éventail ne donne que si la jungle est vivante autour de lui. Un Semeur et de l’engrais l’aident.',
    [build('cerclage', 'Pose un Cerclage sur un Éventail (grand arbre lumineux)', 'eventail'),
     make('seve', 'Amène-lui de l’eau, et garde la jungle en vie autour')]),
  quota('Première vertèbre', 'Ossifier', { vertebre: 10 },
    'Quelque chose, là-haut, attend un corps.',
    'Tout ce que tu as appris converge dans une seule machine.',
    [build('cloitre', 'Cloître : acier, composants, béton, Lueur')]),
];

/** Quotas infinis après le dernier quota écrit : la demande croît de 45 % par palier. */
export function quotaAt(index: number): Quota {
  if (index < QUOTAS.length) return QUOTAS[index];
  const k = index - QUOTAS.length;
  const n = Math.round(20 * Math.pow(1.45, k + 1));
  const extra = [['acier', 6], ['composant', 4], ['platre', 3], ['beton', 8], ['engrais', 2]][k % 5] as [string, number];
  return {
    title: `Palier ${k + 1}`,
    verb: 'Nourrir le Colosse',
    need: [[I.vertebre, n], [I[extra[0]], n * extra[1]]],
    lore: 'Encore.',
    why: 'La demande croît de 45 % à chaque palier. Chaque palier donne un Savoir à investir dans la Tour.',
    steps: [],
  };
}

// --------------------------------------------------------------- améliorations
export interface Upgrade { key: string; name: string; desc: string; per: number; }
export const UPGRADES: Upgrade[] = [
  { key: 'convoyeurs', name: 'Convoyeurs', desc: '+25 % de vitesse par niveau', per: 0.25 },
  { key: 'fours', name: 'Fonte', desc: '+15 % de cadence des fours par niveau', per: 0.15 },
  { key: 'ateliers', name: 'Assemblage et chimie', desc: '+15 % de cadence par niveau', per: 0.15 },
  { key: 'extraction', name: 'Extraction', desc: '+15 % de cadence des Puits, Scieries et Pompes', per: 0.15 },
];

export const START_STOCK: Qty = { fer: 160 };
