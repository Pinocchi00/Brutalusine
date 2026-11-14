# AGENTS.md — Brutalusine

Jeu d'automatisation d'usine vu de haut, en maquette 3D, avec coop locale. « Béton contre canopée » : du béton
brut dans une jungle vivante. Lire d'abord `docs/CONCEPTION.md`.

## Commandes

- `npm run dev` : serveur de développement (port 5173)
- `npm test` : tests de simulation (Vitest, sans navigateur)
- `npm run typecheck` : vérification TypeScript
- `npm run build` : build de production dans `dist/`
- Console du navigateur en développement : `brutalusine.demo()` pose une usine de démonstration

## Architecture

- `src/sim/` : simulation pure, déterministe, à pas fixe (60 pas/s). **Aucun accès au DOM, aucun `Math.random`.**
  - `data.ts` : objets, recettes, bâtiments, quotas et leurs étapes guidées (tout le contenu est ici)
  - `game.ts` : `step()`, pose et démolition, machines, énergie, écologie, fumée, quotas, `ledger()`
  - `belts.ts` : convoyeurs par chemins (coût constant par chemin et par pas)
  - `world.ts` : monde infini par blocs de 32×32, généré depuis la graine
  - `sun.ts`, `chem.ts`, `rng.ts`, `save.ts`, `ent.ts`
- `src/render/` : rendu three.js
  - `models.ts` : maquettes des bâtiments, construites par code (boîtes, cylindres, anneaux)
  - `scene.ts` : terrain, jungle, lots d'instances, lumière jour/nuit, post-traitement, aides visuelles
  - `icons.ts` : vignettes des bâtiments pour l'interface
- `src/ui/` : interface DOM (`hud.ts`, `style.css`) ; le guide est dans `index.html`
- `src/audio/audio.ts` : musique générative et bruitages (Web Audio)
- `src/main.ts` : entrées souris, clavier et manettes, caméra, boucle
- `src/dev.ts` : outils de développement, jamais chargés en production

## Invariants à ne jamais casser

1. **Conservation** : chaque recette est une équation équilibrée atome par atome (`tests/chem.test.ts`). Rien
   ne disparaît : démolir rembourse, les objets en transit retournent au stock.
2. **Déterminisme** : même graine et mêmes commandes donnent la même partie. Le hasard passe par `rng.ts`.
3. **Montrer la cause** : tout refus et toute machine arrêtée disent pourquoi, en clair.
4. **Un bâtiment, une fonction**, dite en une phrase dans `desc`.
5. **Un quota, une idée nouvelle.** Ce qu'il demande doit être faisable avec ce qui est déjà débloqué (un test
   le vérifie).
6. Identifiants de code en anglais, textes du jeu et commentaires en français.

## Ajouter du contenu

- **Un objet, une recette, un bâtiment** : `src/sim/data.ts`. Les gaz échangés avec l'air vont dans `gasIn` /
  `gasOut`. Une machine à recettes n'a besoin d'aucun code : le type `machine` suffit.
- **Sa maquette** : une fonction dans `MODELS` de `src/render/models.ts` (groupes `body`, `lamp`, `rotor`).
- **Son déblocage** : champ `unlock` (nombre de quotas accomplis) et, si besoin, une étape dans `QUOTAS`.

## Vérifier un changement

1. `npm run typecheck` puis `npm test`.
2. Lancer le jeu et regarder : le rendu ne se teste pas autrement. `brutalusine.demo()` donne une usine
   complète ; `brutalusine.game.tick += 18000` avance d'une demi-journée.
3. Pour une modification d'interface, refaire le parcours du premier quota avec de vrais clics.

## Direction artistique

Béton gris contre vert saturé, un seul accent orange. Lumière rasante et ombres longues ; la nuit, une lumière
chaude par machine. Interface sombre, texte clair, icône et mot pour chaque bâtiment. Ne pas revenir à des
aplats 2D.

## État connu

- La musique n'a pas été écoutée par un humain ; les manettes n'ont pas été essayées sur du matériel réel.
- Le rendu n'a pas été mesuré à 60 images par seconde sur une très grande usine.
- Suite prévue : `docs/FEUILLE_DE_ROUTE.md`.
