# AGENTS.md — Brutalusine

Jeu d'automatisation vue du dessus, coop locale. « Une usine d'os dans une jungle qui respire. »
Direction artistique : « Os et canopée » (dalles couleur d'os, terre rasée terracotta, jungle turquoise,
ombres indigo, un flux = une couleur).

## Commandes

- `npm run dev` : serveur de développement (port 5173)
- `npm test` : tests de simulation (Vitest, sans navigateur)
- `npm run typecheck` : vérification TypeScript
- `npm run build` : build de production dans `dist/`

## Architecture

- `src/sim/` : simulation pure, déterministe, à pas fixe (60 pas/s). **Aucun accès au DOM, aucun `Math.random`.**
  - `data.ts` : objets, recettes, bâtiments, quotas (tout le contenu est ici)
  - `game.ts` : boucle `step()`, pose/démolition, machines, énergie, écologie, fumée, quotas
  - `belts.ts` : convoyeurs par chemins (coût O(1) par chemin et par pas)
  - `world.ts` : monde infini par blocs de 32×32, généré depuis la graine
  - `sun.ts`, `chem.ts`, `rng.ts`, `save.ts`, `ent.ts`
- `src/render/` : rendu Canvas 2D (`terrain.ts` cache par bloc, `sprites.ts` bâtiments, `renderer.ts` vue)
- `src/ui/` : interface DOM (`hud.ts`, `style.css`)
- `src/audio/` : son génératif (Web Audio)
- `src/main.ts` : joueurs, entrées clavier/souris/manettes, caméras, écran partagé, boucle

## Invariants à ne jamais casser

1. **Conservation** : chaque recette est une équation chimique équilibrée, atome par atome
   (`tests/chem.test.ts`). Rien ne disparaît : démolir rembourse, les objets en transit retournent au stock.
   Le carbone est suivi dans tout le monde (atmosphère, canopée, objets, gisements) : voir `Game.ledger()`.
2. **Déterminisme** : même graine + mêmes commandes = même partie. Le hasard passe par `rng.ts`.
3. **La dalle est tout** : fondation, réseau électrique (dalles contiguës = un réseau), frontière contre la jungle.
4. **Montrer la cause** : tout refus et toute alerte disent pourquoi, en clair, près de la donnée.
5. Identifiants de code en anglais, textes du jeu et commentaires en français.

## Ajouter du contenu

Un objet, une recette ou un bâtiment s'ajoute dans `src/sim/data.ts`. Une recette doit rester équilibrée
(les gaz échangés avec l'air vont dans `gasIn` / `gasOut`). Un nouveau bâtiment demande un dessin dans
`src/render/sprites.ts`.

## État connu (à reprendre)

- `tests/save.test.ts` : 2 tests échouent. Le test de performance a un défaut de mise en place
  (39 cases non constructibles dans la zone choisie). L'échec de l'aller-retour de sauvegarde n'est pas
  encore diagnostiqué.
- Le glisser-déposer à la souris et les manettes n'ont été vérifiés que par script, pas en jeu réel à 60 images/s.
- Pas encore de documentation de conception (`docs/`) ni de README.
