// Données du jeu : objets, gaz, recettes, bâtiments, quotas.
// Règle d'or : chaque recette est une équation chimique équilibrée (voir tests/chem.test.ts).

import { parseFormula, addAtoms, type Atoms } from './chem';

// ---------------------------------------------------------------- constantes
export const UPS = 60;                 // pas de simulation par seconde
export const TILE_U = 240;             // unités de convoyeur par case
export const SPACING = 80;             // écart minimal entre deux objets
export const BELT_SPEED = 8;           // unités par pas (2 cases/s)
export const CANOPY_UNIT = 32;         // densité (0-255) équivalant à 1 unité de biomasse
export const DAY_TICKS = UPS * 60 * 8; // un jour = 8 minutes
export const REACH = 14;               // portée de construction (cases)
export const BRIDGE_MAX = 5;           // portée d'un pont (cases)

export type Dir = 0 | 1 | 2 | 3;       // 0 = est, 1 = sud, 2 = ouest, 3 = nord
export const DX = [1, 0, -1, 0];
export const DY = [0, 1, 0, -1];

// -------------------------------------------------------------------- objets
export type Shape = 'rond' | 'carre' | 'losange' | 'triangle' | 'hexa' | 'goutte';

export interface ItemDef {
  key: string; name: string; formula: string; color: string; shape: Shape; desc: string;
  id: number; atoms: Atoms;
}

const item = (key: string, name: string, formula: string, color: string, shape: Shape, desc: string) =>
  ({ key, name, formula, color, shape, desc, id: 0, atoms: {} as Atoms });

export const ITEMS: ItemDef[] = [
  item('hematite', 'Hématite', 'Fe2O3', '#FF5A1F', 'losange', 'Oxyde de fer. La rouille de la planète.'),
  item('calcaire', 'Calcaire', 'CaCO3', '#D9C9A8', 'carre', 'Carbonate de calcium. Du carbone endormi dans la pierre.'),
  item('quartz', 'Quartz', 'SiO2', '#3FD0FF', 'hexa', 'Silice cristalline.'),
  item('chalcopyrite', 'Chalcopyrite', 'CuFeS2', '#E3C23C', 'losange', 'Minerai de cuivre. Son soufre ne demande qu’à s’envoler.'),
  item('biomasse', 'Biomasse', 'C6H10O5', '#B9F24A', 'rond', 'Cellulose. La canopée, coupée.'),
  item('carbone', 'Charbon', 'C', '#9A8FD6', 'carre', 'Carbone presque pur. Réducteur et combustible.'),
  item('fer', 'Fer', 'Fe', '#FFC24A', 'carre', 'Lingot de fer.'),
  item('chaux', 'Chaux vive', 'CaO', '#FBF5EA', 'rond', 'Oxyde de calcium. La base de l’os.'),
  item('dalle', 'Dalle', 'Ca2SiO4', '#EFE5D3', 'carre', 'Silicate de calcium. Fondation, réseau, frontière.'),
  item('acier', 'Acier', 'Fe3C', '#B8C8E8', 'hexa', 'Fer carburé (cémentite).'),
  item('cuivre', 'Cuivre', 'Cu', '#FF9166', 'rond', 'Cuivre métallique.'),
  item('scorie', 'Scorie', 'FeSiO3', '#8E6F86', 'triangle', 'Silicate de fer. Le déchet qui ne disparaît pas.'),
  item('silicium', 'Silicium', 'Si', '#9FB4FF', 'triangle', 'Silicium métallurgique.'),
  item('composant', 'Composant', 'Cu2Si', '#FFF1C9', 'hexa', 'Cuivre et silicium assemblés.'),
  item('eau', 'Eau', 'H2O', '#7FF0E0', 'goutte', 'Eau de la rivière.'),
  item('acide', 'Acide sulfurique', 'H2SO4', '#E6F24A', 'goutte', 'Le soufre capturé, rendu utile.'),
  item('seve', 'Lueur', 'C6H12O6', '#8CFBE8', 'goutte', 'Sève lumineuse d’un Éventail. Ne se fabrique pas : se mérite.'),
  item('vertebre', 'Vertèbre', 'Fe12C10Cu4Si4Ca4O14H12', '#FFFFFF', 'hexa', 'Un os du Colosse.'),
];
ITEMS.forEach((it, i) => { it.id = i; it.atoms = parseFormula(it.formula); });
export const NITEMS = ITEMS.length;
export const I: Record<string, number> = Object.fromEntries(ITEMS.map((it) => [it.key, it.id]));

// Espèces gazeuses : échangées avec l'atmosphère, jamais sur convoyeur.
export const GASES: Record<string, { name: string; formula: string }> = {
  O2: { name: 'Dioxygène', formula: 'O2' },
  CO2: { name: 'Dioxyde de carbone', formula: 'CO2' },
  H2O: { name: 'Vapeur d’eau', formula: 'H2O' },
  SO2: { name: 'Dioxyde de soufre', formula: 'SO2' },
};

// ------------------------------------------------------------------ recettes
export interface Recipe {
  key: string; name: string; machine: string;
  inputs: [number, number][];      // [objet, quantité]
  outputs: [number, number][];
  gasIn: [string, number][];       // gaz prélevés (air, atmosphère, captage)
  gasOut: [string, number][];      // gaz rejetés
  time: number;                    // pas de simulation
  smoke: number;                   // fumée locale (particules)
  unlock: number;                  // quotas accomplis requis
  note: string;
  id: number;
}

type Qty = Record<string, number>;
function recipe(
  key: string, name: string, machine: string, inputs: Qty, outputs: Qty,
  o: { gasIn?: Qty; gasOut?: Qty; time: number; smoke?: number; unlock: number; note: string },
): Recipe {
  const conv = (q: Qty): [number, number][] => Object.entries(q).map(([k, n]) => {
    if (!(k in I)) throw new Error(`Objet inconnu : ${k}`);
    return [I[k], n];
  });
  return {
    key, name, machine, inputs: conv(inputs), outputs: conv(outputs),
    gasIn: Object.entries(o.gasIn ?? {}), gasOut: Object.entries(o.gasOut ?? {}),
    time: o.time, smoke: o.smoke ?? 0, unlock: o.unlock, note: o.note, id: 0,
  };
}

export const RECIPES: Recipe[] = [
  recipe('pyrolyse', 'Pyrolyse', 'four', { biomasse: 1 }, { carbone: 6 },
    { gasOut: { H2O: 5 }, time: 180, smoke: 1.5, unlock: 1, note: 'C₆H₁₀O₅ → 6 C + 5 H₂O — on chasse l’eau du bois, il reste le carbone.' }),
  recipe('reduction', 'Réduction du fer', 'four', { hematite: 2, carbone: 3 }, { fer: 4 },
    { gasOut: { CO2: 3 }, time: 240, smoke: 1, unlock: 1, note: '2 Fe₂O₃ + 3 C → 4 Fe + 3 CO₂ — le carbone arrache l’oxygène au fer.' }),
  recipe('calcination', 'Calcination', 'four', { calcaire: 1 }, { chaux: 1 },
    { gasOut: { CO2: 1 }, time: 120, smoke: 0.3, unlock: 2, note: 'CaCO₃ → CaO + CO₂ — la pierre relâche son carbone.' }),
  recipe('silicium', 'Réduction de la silice', 'four', { quartz: 1, carbone: 2 }, { silicium: 1 },
    { gasIn: { O2: 1 }, gasOut: { CO2: 2 }, time: 300, smoke: 1, unlock: 5, note: 'SiO₂ + 2 C + O₂ → Si + 2 CO₂.' }),
  recipe('fusion_cuivre', 'Fusion du cuivre', 'four', { chalcopyrite: 2, quartz: 2 }, { cuivre: 2, scorie: 2 },
    { gasIn: { O2: 5 }, gasOut: { SO2: 4 }, time: 300, smoke: 1, unlock: 4, note: '2 CuFeS₂ + 2 SiO₂ + 5 O₂ → 2 Cu + 2 FeSiO₃ + 4 SO₂ — le soufre s’échappe, la scorie reste.' }),
  recipe('dalle', 'Frittage des dalles', 'cloitre', { chaux: 2, quartz: 1 }, { dalle: 1 },
    { time: 150, unlock: 2, note: '2 CaO + SiO₂ → Ca₂SiO₄ — la bélite : l’os de l’usine.' }),
  recipe('acier', 'Cémentation', 'cloitre', { fer: 3, carbone: 1 }, { acier: 1 },
    { time: 210, unlock: 3, note: '3 Fe + C → Fe₃C.' }),
  recipe('composant', 'Assemblage', 'cloitre', { cuivre: 2, silicium: 1 }, { composant: 1 },
    { time: 240, unlock: 5, note: '2 Cu + Si → Cu₂Si.' }),
  recipe('vertebre', 'Ossification', 'cloitre', { acier: 4, composant: 2, dalle: 2, seve: 1 }, { vertebre: 1 },
    { time: 600, unlock: 7, note: 'Acier, cuivre, os et sève : un fragment du Colosse.' }),
  recipe('acide', 'Procédé de contact', 'epurateur', { eau: 2 }, { acide: 2 },
    { gasIn: { SO2: 2, O2: 1 }, time: 180, unlock: 6, note: '2 SO₂ + O₂ + 2 H₂O → 2 H₂SO₄ — la fumée devient ressource.' }),
  recipe('photosynthese', 'Photosynthèse', 'cerclage', { eau: 6 }, { seve: 1 },
    { gasIn: { CO2: 6 }, gasOut: { O2: 6 }, time: 900, unlock: 6, note: '6 CO₂ + 6 H₂O → C₆H₁₂O₆ + 6 O₂ — l’arbre refait ce que l’usine défait.' }),
  recipe('combustion_biomasse', 'Combustion de biomasse', 'amphi', { biomasse: 1 }, {},
    { gasIn: { O2: 6 }, gasOut: { CO2: 6, H2O: 5 }, time: 1, smoke: 1.2, unlock: 1, note: 'C₆H₁₀O₅ + 6 O₂ → 6 CO₂ + 5 H₂O — 2 800 kJ.' }),
  recipe('combustion_carbone', 'Combustion de charbon', 'amphi', { carbone: 1 }, {},
    { gasIn: { O2: 1 }, gasOut: { CO2: 1 }, time: 1, smoke: 0.15, unlock: 1, note: 'C + O₂ → CO₂ — 394 kJ.' }),
];
RECIPES.forEach((r, i) => { r.id = i; });
export const R: Record<string, Recipe> = Object.fromEntries(RECIPES.map((r) => [r.key, r]));

/** Énergie libérée par la combustion d'une unité (kJ/mol réels, joules en jeu). */
export const FUEL: Record<number, { energy: number; recipe: Recipe }> = {
  [I.biomasse]: { energy: 2800, recipe: R.combustion_biomasse },
  [I.carbone]: { energy: 394, recipe: R.combustion_carbone },
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
  { item: I.hematite, name: 'Gisement d’hématite', color: '#FF5A1F' },
  { item: I.calcaire, name: 'Banc de calcaire', color: '#E9DDBE' },
  { item: I.quartz, name: 'Filon de quartz', color: '#3FD0FF' },
  { item: I.chalcopyrite, name: 'Veine de chalcopyrite', color: '#E3C23C' },
] as const;

// ----------------------------------------------------------------- bâtiments
export type Kind =
  | 'hub' | 'slab' | 'belt' | 'bridge' | 'splitter' | 'machine' | 'miner' | 'sawmill' | 'pump'
  | 'generator' | 'solar' | 'battery' | 'scrubber' | 'ring' | 'tree';

export interface BuildingDef {
  key: string; name: string; kind: Kind; w: number; h: number;
  cost: [number, number][];
  height: number;       // hauteur (cases) : longueur de l'ombre portée
  power: number;        // W consommés en travail (ou produits pour les sources)
  unlock: number;       // quotas accomplis requis
  desc: string;
  round: boolean;       // empreinte ronde (ombre et dessin)
  speed: number;        // multiplicateur de cadence de base
}

function building(
  key: string, name: string, kind: Kind, w: number, h: number, cost: Qty,
  o: { height?: number; power?: number; unlock?: number; desc: string; round?: boolean; speed?: number },
): BuildingDef {
  return {
    key, name, kind, w, h, cost: Object.entries(cost).map(([k, n]) => [I[k], n] as [number, number]),
    height: o.height ?? 1, power: o.power ?? 0, unlock: o.unlock ?? 0, desc: o.desc,
    round: o.round ?? false, speed: o.speed ?? 1,
  };
}

export const BUILDINGS: BuildingDef[] = [
  building('tour', 'La Tour', 'hub', 3, 3, {}, { height: 3, power: 250, desc: 'Reçoit tout. Chaque quota la fait grandir — et son ombre avec elle.' }),
  building('dalle', 'Dalle', 'slab', 1, 1, { dalle: 1 }, { height: 0, desc: 'Fondation, réseau électrique et frontière. La jungle ne pousse pas sur l’os.' }),
  building('convoyeur', 'Convoyeur', 'belt', 1, 1, { fer: 1 }, { height: 0.1, desc: 'Transporte. 6 objets par seconde. Glisser pour tracer.' }),
  building('puits', 'Puits', 'miner', 3, 3, { fer: 10 }, { height: 0.4, power: 60, round: true, desc: 'Fosse en amphithéâtre. Extrait le gisement sous lui et autour.' }),
  building('scierie', 'Scierie', 'sawmill', 2, 2, { fer: 6 }, { height: 0.8, power: 40, round: true, unlock: 0, desc: 'Coupe la canopée la plus dense à sa portée. La jungle repousse — si on lui en laisse.' }),
  building('four', 'Fonderie', 'machine', 3, 2, { fer: 12 }, { height: 1.4, power: 150, unlock: 1, desc: 'Canaux ouverts : on voit la matière changer. Réactions à chaud.' }),
  building('cloitre', 'Cloître', 'machine', 3, 3, { fer: 16 }, { height: 1.2, power: 100, round: true, unlock: 2, desc: 'Assembleur circulaire. Un bras tourne dans la cour.' }),
  building('aiguillage', 'Aiguillage', 'splitter', 1, 1, { fer: 3 }, { height: 0.4, unlock: 2, desc: 'Répartit vers l’avant et les côtés. Avec un filtre : l’objet choisi va tout droit, le reste sur les côtés.' }),
  building('pont', 'Pont', 'bridge', 1, 1, { fer: 3 }, { height: 0.5, unlock: 2, desc: 'Poser l’entrée puis la sortie (jusqu’à 5 cases). Les objets passent au-dessus.' }),
  building('amphi', 'Amphithéâtre', 'generator', 2, 2, { fer: 20 }, { height: 1, power: 600, round: true, unlock: 1, desc: 'Brûle biomasse ou charbon. 600 W à pleine charge, rien à vide.' }),
  building('heliostat', 'Héliostat', 'solar', 1, 1, { fer: 4, quartz: 1 }, { height: 0.2, power: 45, unlock: 3, desc: '45 W en plein soleil. Rien dans l’ombre, rien la nuit, moins sous la fumée.' }),
  building('pompe', 'Pompe', 'pump', 2, 2, { acier: 10 }, { height: 0.8, power: 30, round: true, unlock: 4, desc: 'À poser au bord de l’eau.' }),
  building('epurateur', 'Épurateur', 'scrubber', 2, 2, { acier: 10, cuivre: 6 }, { height: 2, power: 80, unlock: 6, desc: 'Capte le SO₂ des fonderies voisines (8 cases) et en fait de l’acide.' }),
  building('accu', 'Accumulateur', 'battery', 2, 2, { acier: 4, cuivre: 4, acide: 6 }, { height: 0.8, power: 300, round: true, unlock: 6, desc: 'Stocke 40 kJ. Le jour paie la nuit.' }),
  building('cerclage', 'Cerclage', 'ring', 3, 3, { acier: 8, composant: 4 }, { height: 0.5, power: 20, round: true, unlock: 6, desc: 'Cercle un Éventail et recueille sa Lueur. Le rendement suit la santé de la jungle alentour.' }),
  building('eventail', 'Éventail', 'tree', 3, 3, {}, { height: 0, round: true, desc: 'L’arbre de la planète. Son cœur bat avec la canopée.' }),
];
export const B: Record<string, BuildingDef> = Object.fromEntries(BUILDINGS.map((b) => [b.key, b]));
/** Ordre de la barre de construction. */
export const BUILD_BAR = ['convoyeur', 'dalle', 'puits', 'scierie', 'four', 'cloitre', 'aiguillage', 'pont', 'amphi', 'heliostat', 'pompe', 'epurateur', 'accu', 'cerclage'];

export const MACHINE_RECIPES: Record<string, Recipe[]> = {};
for (const r of RECIPES) (MACHINE_RECIPES[r.machine] ??= []).push(r);

// -------------------------------------------------------------------- quotas
export interface Quota {
  title: string; verb: string; hint: string; need: [number, number][]; lore: string;
}
const quota = (title: string, verb: string, hint: string, need: Qty, lore: string): Quota =>
  ({ title, verb, hint, need: Object.entries(need).map(([k, n]) => [I[k], n] as [number, number]), lore });

export const QUOTAS: Quota[] = [
  quota('Réveil', 'Livrer de l’hématite à la Tour',
    'Pose un Puits sur le gisement orange, puis trace des convoyeurs jusqu’à la Tour.',
    { hematite: 20 }, 'Le module s’est posé. Une clairière, rien d’autre.'),
  quota('Charbon', 'Transformer la canopée en fer',
    'Une Scierie donne de la biomasse. Une Fonderie en tire du charbon, une autre réduit l’hématite (clique dessus pour choisir sa réaction). Si le courant manque, un Amphithéâtre brûle de la biomasse.',
    { fer: 40 }, 'La forêt est un réservoir de carbone. Le carbone ouvre le métal.'),
  quota('Os', 'Couler les premières dalles',
    'Calcine le calcaire en chaux, puis fritte chaux et quartz dans un Cloître.',
    { dalle: 60 }, 'L’usine a besoin d’un squelette.'),
  quota('Acier', 'Carburer le fer',
    'Un Cloître : 3 Fer + 1 Charbon. Les Héliostats donnent du courant sans rien brûler — le jour, hors de l’ombre.',
    { acier: 60 }, 'Écoute. Chaque machine a sa note.'),
  quota('Cuivre', 'Fondre la chalcopyrite',
    'Le cuivre libère du SO₂ et laisse de la scorie. Trie-la avec un Aiguillage filtré.',
    { cuivre: 80 }, 'Rien ne disparaît. Tout se déplace.'),
  quota('Composants', 'Assembler cuivre et silicium',
    'Réduis le quartz en silicium, puis assemble.',
    { composant: 60 }, 'La fumée pèse sur la canopée. Elle s’en souviendra.'),
  quota('Lueur', 'Recueillir la sève d’un Éventail',
    'Cercle un Éventail et amène-lui de l’eau. Il ne donne que si la jungle vit autour de lui.',
    { seve: 20, acide: 20 }, 'Il y a une chose que l’usine ne sait pas fabriquer.'),
  quota('Première vertèbre', 'Ossifier',
    'Acier, composants, dalles et Lueur dans un Cloître.',
    { vertebre: 10 }, 'Quelque chose, là-haut, attend un corps.'),
];

/** Quotas infinis après le dernier quota écrit : la demande croît de 45 % par palier. */
export function quotaAt(index: number): Quota {
  if (index < QUOTAS.length) return QUOTAS[index];
  const k = index - QUOTAS.length;
  const n = Math.round(20 * Math.pow(1.45, k + 1));
  const extra = [['acier', 6], ['composant', 4], ['acide', 3], ['dalle', 8], ['cuivre', 6]][k % 5] as [string, number];
  return {
    title: `Palier ${k + 1}`,
    verb: 'Nourrir le Colosse',
    hint: 'La demande croît de 45 % à chaque palier. Chaque palier accompli donne un Savoir à investir.',
    need: [[I.vertebre, n], [I[extra[0]], n * extra[1]]],
    lore: 'Encore.',
  };
}

// --------------------------------------------------------------- améliorations
export interface Upgrade { key: string; name: string; desc: string; per: number; }
export const UPGRADES: Upgrade[] = [
  { key: 'convoyeurs', name: 'Convoyeurs', desc: '+25 % de vitesse par niveau', per: 0.25 },
  { key: 'fours', name: 'Fonderies', desc: '+15 % de cadence par niveau', per: 0.15 },
  { key: 'cloitres', name: 'Cloîtres', desc: '+15 % de cadence par niveau', per: 0.15 },
  { key: 'extraction', name: 'Extraction', desc: '+15 % de cadence des Puits et Scieries', per: 0.15 },
  { key: 'portee', name: 'Portée', desc: '+4 cases de portée de construction', per: 4 },
];

export const START_STOCK: Qty = { dalle: 120, fer: 220 };
