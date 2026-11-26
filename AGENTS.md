# AGENTS.md — Brutalusine

Jeu d'automatisation d'usine en 2D vue de dessus, avec un bâtisseur qu'on dirige et une coop locale.
« Le brut de l'automatisation » : extraire, transporter, transformer, livrer. Lire d'abord `docs/CONCEPTION.md`,
puis `docs/ERES.md` (la progression : les ères, la Tour, le marteau ; il fait foi).

## Commandes

- `npm run dev` : serveur de développement (port 5173 imposé : si un autre projet l'occupe, le lancement échoue
  clairement plutôt que d'ouvrir le mauvais jeu ; `npx vite --port 5174` pour en prendre un autre)
- `npm test` : tests de simulation (Vitest, sans navigateur)
- `npm run typecheck` : vérification TypeScript
- `npm run build` : build de production dans `dist/`
- Console du navigateur en développement : `brutalusine.demo()` pose une usine de démonstration à l'ère de la
  Pierre ; `brutalusine.leather()` prépare le rejeu « 30 cuirs » (Tour en pierre, stock de départ)
- Rendu pixel : `?ere=1`, `?ere=2` ou `?ere=3` force une ère pour tout le dessin (contrôle, banc)

## Architecture

- `src/sim/` : simulation pure, déterministe, à pas fixe (60 pas/s). **Aucun accès au DOM, aucun `Math.random`.**
  - `data.ts` : objets, recettes, bâtiments, ères (`ERAS`, `ERA_SPEED`, `ERA_POWER`, `costOf`), livraisons de la
    Tour (`QUOTAS`) et leurs étapes guidées (tout le contenu est ici)
  - `game.ts` : `step()`, pose (dans la version la plus récente payable) et démolition, amélioration au marteau
    (`upgrade`, `checkUpgrade`), récolte à la main, machines, énergie, repousse, livraisons, `ledger()`
  - `belts.ts` : convoyeurs par chemins (coût constant par chemin et par pas ; un chemin n'a qu'une ère)
  - `route.ts` : le tracé d'un convoyeur en L (un seul virage), utilisé par le geste et testé seul
  - `world.ts` : monde infini par blocs de 32×32 ; chaque case porte un arbre ou rien ; une dalle vaut son ère
  - `fauna.ts` : les cabiais, en troupeaux de 2 à 4 par zone de 32×32 ; ils broutent, dérivent et se reconstituent
  - `wrecks.ts` : les épaves d'anciennes capsules, une garantie près du départ, des rares plus loin ; leurs noyaux
  - `sun.ts`, `rng.ts`, `save.ts`, `ent.ts`
- `src/render/px/` : le seul rendu, en pixel art, fidèle à `docs/maquettes/heure-doree.html` ; chaque bâtiment,
  tapis et dalle se dessine dans sa version
  - `beasts.ts`, `wrecks.ts` : les cabiais et les épaves
- `src/ui/` : interface DOM (`hud.ts`, `gesture.ts`, `style.css`, `px/` pour le rendu pixel) ; le guide est dans
  `index.html`
- `src/audio/audio.ts` : musique générative et bruitages (Web Audio)
- `src/main.ts` : bâtisseurs (clavier-souris, manettes), gestes, caméra, boucle
- `src/dev.ts` : outils de développement, jamais chargés en production

## Ce que l'utilisateur a demandé (ne pas y revenir)

- **2D, pas de 3D.** Il a essayé une version 3D et a préféré la 2D.
- **Un bâtisseur qu'on dirige** (la petite créature à antennes), qui déracine, pioche et ramasse à la main.
- **Des ères, pas un arbre de compétences** (`docs/ERES.md`) : la Tour est l'inventaire ; sa troisième livraison
  la refait dans la matière de l'ère suivante ; le marteau refait chaque bâtiment un par un.
- **Pas de « Savoir », pas de formules chimiques, pas de gaz ni de pollution à gérer, pas de santé de la jungle.**
  Le plaisir doit venir des flux, pas de systèmes ajoutés.
- **Des raccords lisibles** : virages courbes, bouche d'entrée, goulotte de sortie, déversement en T.
- **Des animations de bâtiments et de convoyeurs soignées**, mais brutes : béton, acier, un accent orange.
- **Un geste de construction précis** : la caméra ne glisse pas quand on vise avec un outil ; le convoyeur se
  trace en L avec aperçu et se pose au relâchement ; R fait pivoter un bâtiment déjà posé.
- **PC uniquement** : pas de version mobile.

## Invariants

1. **Rien ne disparaît** : démolir ou améliorer rend la matière, les objets en transit retournent au stock, une
   dalle coulée sous un bâtiment est offerte (ère 1) et ne rend rien. `ledger(objet)` compte chaque objet dans tout
   le monde ; les tests de conservation (`livraisons`, `eres`, `marteau`, `epaves`, `cuirs`) le vérifient. Seules
   les recettes, la repousse, l'Argilière et les bêtes abattues ou prises transforment ou créent de la matière.
   C'est une règle interne ; l'interface n'en parle pas.
2. **Déterminisme** : même graine et mêmes commandes donnent la même partie, sauvegarde comprise. Le hasard passe
   par `rng.ts` (la faune et les épaves sont posées par la graine ; le rendu, lui, peut utiliser `Math.random`
   pour ses particules). Aucun état de simulation hors de la sauvegarde.
3. **Montrer la cause** : tout refus et toute machine arrêtée disent pourquoi, en clair. Une machine sans rien à
   faire ne prend pas de courant.
4. **Une livraison, une idée nouvelle.** Ce qu'elle demande doit être faisable avec ce qui est déjà débloqué, et le
   coût de chaque bâtiment payable au moment où il se débloque (`tests/livraisons.test.ts`).
5. Identifiants de code en anglais, textes du jeu et commentaires en français.

## Ajouter du contenu

- **Un objet, une recette, un bâtiment** : `src/sim/data.ts`. Une machine à recettes n'a besoin d'aucun code :
  le type `machine` suffit. Son prix se déduit de son ère (`costOf`) : 2 unités de la matière de l'ère par case.
- **Son dessin** : un dessin par ère dans `src/render/px/` (`buildings.ts` pour les bâtiments, `beasts.ts` pour les
  cabiais, `wrecks.ts` pour les épaves, `belts.ts` pour les tapis). Vue trois quarts : ce qui est haut est décalé
  vers le nord et montre sa face sud. Le dessin n'est **pas** tourné ; seule la goulotte de sortie suit `rot`.
- **Son déblocage** : champ `unlock` (nombre de livraisons accomplies) et, si besoin, une étape dans `QUOTAS`.

## Vérifier un changement

1. `npm run typecheck` puis `npm test`.
2. Lancer le jeu et regarder : le rendu ne se teste pas autrement. `brutalusine.demo()` donne une usine
   complète ; `brutalusine.game.tick += 18000` avance d'une demi-journée. Le banc (`banc.html`) doit rester à
   0 écart.
3. Pour une modification de prise en main, refaire la première livraison : déraciner des arbres, poser une
   Scierie au milieu des arbres, tracer un convoyeur de sa flèche jusqu'à la Tour, attendre 20 bois.
4. Pour la chasse et la graisse, rejouer « 30 cuirs » : `brutalusine.leather()` prépare la Tour en pierre et le
   stock de départ, puis abattre trois cabiais aux poings, poser un Piège et une Tannerie, et attendre 30 cuirs.

## État connu

- La musique et les bruits nouveaux n'ont pas été écoutés par un humain ; les manettes n'ont pas été essayées sur
  du matériel réel.
- La fluidité n'a pas été mesurée sur une très grande usine (seule la simulation l'a été).
- La démo va jusqu'à la Tour de brique. Restent la surcharge, les éclats et les ères suivantes.
- Suite prévue : `docs/FEUILLE_DE_ROUTE.md`.
