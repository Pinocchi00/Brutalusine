# Science

Ce document dit ce qui est vrai dans le jeu, ce qui est simplifié, et pourquoi.

## Chimie

Un objet du jeu représente **une unité de formule** (une mole, à l'échelle près). Les coefficients des recettes
sont donc les vrais coefficients stœchiométriques. `tests/chem.test.ts` vérifie, atome par atome, que chaque
recette est équilibrée.

| Procédé | Équation | Dans la réalité |
| --- | --- | --- |
| Pyrolyse | C₆H₁₀O₅ → 6 C + 5 H₂O | carbonisation idéale de la cellulose |
| Réduction du fer | 2 Fe₂O₃ + 3 C → 4 Fe + 3 CO₂ | bilan global du haut fourneau |
| Réduction à l'hydrogène | Fe₂O₃ + 3 H₂ → 2 Fe + 3 H₂O | sidérurgie « verte » (réduction directe) |
| Calcination | CaCO₃ → CaO + CO₂ | four à chaux, vers 900 °C |
| Béton | 2 CaO + SiO₂ → Ca₂SiO₄ | la bélite, une des phases du ciment |
| Cémentation | 3 Fe + C → Fe₃C | la cémentite sert ici de modèle de l'acier |
| Verre | SiO₂ → SiO₂ (fondu) | verre de silice ; le verre courant contient aussi du sodium |
| Fusion du cuivre | 2 CuFeS₂ + 2 SiO₂ + 5 O₂ → 2 Cu + 2 FeSiO₃ + 4 SO₂ | bilan global avec fondant siliceux |
| Silicium | SiO₂ + 2 C + O₂ → Si + 2 CO₂ | four à arc ; le CO formé est brûlé |
| Composant | 2 Cu + Si → Cu₂Si | assemblage, pas une vraie réaction |
| Procédé de contact | 2 SO₂ + O₂ + 2 H₂O → 2 H₂SO₄ | fabrication industrielle de l'acide sulfurique |
| Plâtre | CaCO₃ + H₂SO₄ → CaSO₄ + H₂O + CO₂ | neutralisation |
| Électrolyse | 2 H₂O → 2 H₂ + O₂ | |
| Procédé Haber | N₂ + 3 H₂ → 2 NH₃ | synthèse de l'ammoniac |
| Engrais | 2 NH₃ + H₂SO₄ → (NH₄)₂SO₄ | sulfate d'ammonium |
| Photosynthèse | 6 CO₂ + 5 H₂O → C₆H₁₀O₅ + 6 O₂ | serre et jungle |
| Sève | 6 CO₂ + 6 H₂O → C₆H₁₂O₆ + 6 O₂ | photosynthèse du glucose |

**Simplifications assumées** : les fluides et les gaz voyagent en bonbonnes sur les convoyeurs ; les
températures et les rendements ne sont pas simulés ; l'oxygène et l'azote de l'air sont supposés illimités ;
l'eau de pluie de la jungle n'est pas comptée.

## Conservation

Le carbone est suivi partout : atmosphère, canopée, objets, gisements (le calcaire en contient). `Game.ledger()`
compte les atomes d'un élément dans tout le monde, et un test vérifie que carbone, fer, calcium, silicium,
cuivre et soufre sont conservés sur une usine complète.

Conséquence de jeu : brûler de la biomasse est neutre à long terme (la jungle refixe ce carbone), alors que
calciner du calcaire libère un carbone qui dormait dans la roche. C'est exactement la distinction réelle entre
carbone biogénique et carbone fossile.

## Énergie

Les énergies de combustion sont les valeurs réelles, en kJ par mole, utilisées comme joules de jeu :

| Combustible | Énergie | Remarque |
| --- | --- | --- |
| Biomasse (cellulose) | 2 800 | |
| Charbon (carbone) | 394 | une biomasse donne 6 charbons, soit 2 364 : carboniser fait perdre de l'énergie, comme en vrai |
| Hydrogène | 286 | |

Un seul réseau pour toute l'usine. Si la demande dépasse la capacité, toutes les machines ralentissent dans la
même proportion. Les générateurs ne brûlent que ce qui est demandé.

## Soleil

Jour de 10 minutes dont 65 % de lumière. L'élévation suit un sinus ; l'azimut va de l'est à l'ouest en passant
par le sud. Un héliostat remonte un rayon vers le soleil : s'il rencontre un bâtiment assez haut, il est à
l'ombre. La longueur d'ombre par unité de hauteur vaut 1 / tan(élévation), plafonnée à 5.

## Écologie

Chaque case porte une densité de canopée *c* entre 0 et 1. Toutes les deux secondes :

    dc/dt = [ r · c · (1 − c) + s · max(0, c̄ − c) · (1 − c) ] · lumière · vigueur − mortalité(fumée)

- **Croissance logistique** `r·c·(1−c)` : maximale à mi-densité. Une Scierie récolte donc le plus durablement
  une forêt à moitié pleine — c'est le rendement maximal soutenable de l'écologie réelle.
- **Recolonisation** `s·(c̄ − c)` : une case nue est réensemencée par ses voisines.
- **Vigueur** `2·CO₂ / (CO₂ + CO₂ initial)` : l'effet fertilisant du CO₂, réel et saturant. Plus l'usine émet,
  plus la jungle repousse vite.
- **Fumée** : champ de diffusion à basse résolution (cellules de 4 cases), avec décroissance. Au-delà d'un
  seuil, la canopée meurt et rend son carbone à l'air. Le SO₂ non capté compte triple.

La santé d'un Éventail est la densité moyenne de canopée dans un rayon de 7 cases, diminuée par la fumée. Les
nuits où la santé moyenne dépasse 70 %, la jungle fleurit et les Éventails cerclés produisent deux fois plus.

## Convoyeurs

Les cases contiguës forment des chemins. Chaque chemin stocke ses objets par écarts successifs : à chaque pas,
un seul écart change, quel que soit le nombre d'objets. Le coût est constant par chemin. Mesure :
20 000 convoyeurs chargés de 60 000 objets coûtent moins de 4 ms par pas (test de performance).

## Ce qui rend le jeu prenant

Sources et limites d'abord : la théorie de l'autodétermination (compétence, autonomie, lien social) et la
notion de *flow* sont les cadres les plus utilisés pour expliquer l'engagement dans les jeux, mais leur
application aux jeux est souvent superficielle dans la littérature (Tyack et Mekler, CHI 2020, puis leur
critique de 2024). Ce qui suit est donc une hypothèse de conception, pas un résultat démontré.

| Levier | Dans le jeu |
| --- | --- |
| **Compétence** : progrès visible et attribuable à soi | le quota affiche sa progression ; chaque machine montre ce qui lui manque ; records personnels par quota (durée, bâtiments, CO₂) |
| **Autonomie** : le projet appartient au joueur | aucune disposition imposée ; plusieurs chemins (charbon ou hydrogène, brûler ou capter) |
| **Lien** | coop locale sur le même écran |
| **Défi ajusté** | un quota = une idée nouvelle ; la contrainte suivante naît de la solution précédente |
| **Boucles ouvertes** (effet Zeigarnik) | il y a toujours une étape cochable, une machine qui attend, un bâtiment tout juste débloqué |
| **Échec sans punition** | une usine mal conçue est seulement lente ; démolir rembourse tout |

L'équipe de Factorio a tiré de ses propres tests une leçon appliquée ici : un tutoriel trop contraint apprend
à réussir le tutoriel, pas le jeu ; et commencer par du travail manuel donne une fausse image du jeu
(Friday Facts n° 241). Brutalusine n'a donc ni extraction à la main ni niveau tutoriel séparé : les étapes
guidées se font dans la vraie partie, et la première action est d'automatiser.

Aucun mécanisme de rétention artificiel : pas de récompense quotidienne, pas de hasard dans les gains.

## Sources

- Tyack et Mekler, *Self-Determination Theory in HCI Games Research*, CHI 2020 :
  https://acris.aalto.fi/ws/portalfiles/portal/40334523/CHI2020_SDT_in_Games_preprint.pdf
- Tyack et Mekler, *Self-Determination Theory and HCI Games Research*, 2024 : https://arxiv.org/html/2405.12639v1
- Factorio, *Friday Facts #241 — New player experience* : https://factorio.com/blog/post/fff-241
- Dossier « Les meilleures interfaces des jeux de gestion », parties I et II (novembre 2026), fourni par l'auteur du projet
