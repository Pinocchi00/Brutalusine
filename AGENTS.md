# AGENTS.md — Brutalusine

Jeu d'automatisation d'usine en 2D vue de dessus, avec un bâtisseur qu'on dirige et une coop locale.
« Le brut de l'automatisation » : extraire, transporter, transformer, livrer. Lire d'abord `docs/CONCEPTION.md`.

## Commandes

- `npm run dev` : serveur de développement (port 5173)
- `npm test` : tests de simulation (Vitest, sans navigateur)
- `npm run typecheck` : vérification TypeScript
- `npm run build` : build de production dans `dist/`
- Console du navigateur en développement : `brutalusine.demo()` pose une usine de démonstration

## Architecture

- `src/sim/` : simulation pure, déterministe, à pas fixe (60 pas/s). **Aucun accès au DOM, aucun `Math.random`.**
  - `data.ts` : objets, recettes, bâtiments, quotas et leurs étapes guidées (tout le contenu est ici)
  - `game.ts` : `step()`, pose et démolition, récolte à la main, machines, énergie, repousse, quotas, `ledger()`
  - `belts.ts` : convoyeurs par chemins (coût constant par chemin et par pas)
  - `world.ts` : monde infini par blocs de 32×32 ; chaque case porte un arbre ou rien
  - `sun.ts`, `chem.ts`, `rng.ts`, `save.ts`, `ent.ts`
- `src/render/` : rendu Canvas 2D
  - `terrain.ts` : sol, rivage, gisements, débris, dalles — peints une fois par bloc, en cache
  - `sprites.ts` : un dessin animé par bâtiment, les planches d'arbres, le bâtisseur
  - `renderer.ts` : ombres, convoyeurs et raccords, objets, tri nord-sud, particules, jour et nuit
- `src/ui/` : interface DOM (`hud.ts`, `style.css`) ; le guide est dans `index.html`
- `src/audio/audio.ts` : musique générative et bruitages (Web Audio)
- `src/main.ts` : bâtisseurs (clavier-souris, manettes), gestes, caméra, boucle
- `src/dev.ts` : outils de développement, jamais chargés en production

## Ce que l'utilisateur a demandé (ne pas y revenir)

- **2D, pas de 3D.** Il a essayé une version 3D et a préféré la 2D.
- **Un bâtisseur qu'on dirige** (la petite créature à antennes), qui déracine, pioche et ramasse à la main.
- **Pas de « Savoir », pas d'améliorations, pas de gaz ni de pollution à gérer, pas de santé de la jungle.**
  Le plaisir doit venir des flux, pas de systèmes ajoutés.
- **Des raccords lisibles** : virages courbes, bouche d'entrée, goulotte de sortie, déversement en T.
- **Des animations de bâtiments et de convoyeurs soignées**, mais brutes : béton, acier, un accent orange.

## Invariants

1. **Conservation** : chaque recette est équilibrée atome par atome (`tests/chem.test.ts`). Rien ne disparaît :
   démolir rembourse, les objets en transit retournent au stock. C'est une règle interne ; l'interface n'en
   parle pas.
2. **Déterminisme** : même graine et mêmes commandes donnent la même partie. Le hasard passe par `rng.ts`
   (le rendu, lui, peut utiliser `Math.random` pour ses particules).
3. **Montrer la cause** : tout refus et toute machine arrêtée disent pourquoi, en clair.
4. **Un quota, une idée nouvelle.** Ce qu'il demande doit être faisable avec ce qui est déjà débloqué, et le
   coût de chaque bâtiment payable au moment où il se débloque (un test le vérifie).
5. Identifiants de code en anglais, textes du jeu et commentaires en français.

## Ajouter du contenu

- **Un objet, une recette, un bâtiment** : `src/sim/data.ts`. Une machine à recettes n'a besoin d'aucun code :
  le type `machine` suffit.
- **Son dessin** : une fonction dans `S` de `src/render/sprites.ts`. Vue trois quarts : ce qui est haut est
  décalé vers le nord (`K` par unité de hauteur) et montre sa face sud. Utiliser `block`, `cyl`, `stack`.
  Le dessin n'est **pas** tourné avec le bâtiment ; seule la goulotte de sortie suit `rot`.
- **Sa fumée** : une entrée dans `STACKS` de `renderer.ts`.
- **Son déblocage** : champ `unlock` (nombre de quotas accomplis) et, si besoin, une étape dans `QUOTAS`.

## Vérifier un changement

1. `npm run typecheck` puis `npm test`.
2. Lancer le jeu et regarder : le rendu ne se teste pas autrement. `brutalusine.demo()` donne une usine
   complète ; `brutalusine.game.tick += 18000` avance d'une demi-journée.
3. Pour une modification de prise en main, refaire le premier quota : ramasser un débris, déraciner un arbre,
   poser un Puits, tracer un convoyeur jusqu'à la Tour.

## État connu

- La musique n'a pas été écoutée par un humain ; les manettes n'ont pas été essayées sur du matériel réel.
- La fluidité n'a pas été mesurée sur une très grande usine (seule la simulation l'a été).
- Suite prévue : `docs/FEUILLE_DE_ROUTE.md`.
