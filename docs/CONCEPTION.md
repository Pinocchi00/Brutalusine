# Conception

## L'idée en une phrase

Une petite créature, une clairière, une jungle : on déracine, on pioche, on pose une dalle, on trace un
convoyeur — et l'usine finit par tourner toute seule.

## Les piliers

1. **Le brut de l'automatisation.** Extraire, transporter, transformer, livrer. Aucun système qui ne serve pas
   les flux : pas d'arbre de compétences, pas de pollution à gérer, pas de monnaie.
2. **D'abord à la main, ensuite à la machine.** Le bâtisseur déracine un arbre, pioche un rocher, ramasse des
   débris. C'est lent exprès : chaque machine posée est un geste qu'on ne fera plus.
3. **Des raccords qui se lisent.** Un convoyeur tourne en courbe, entre dans une machine par une bouche, se
   déverse dans un autre par le côté. La sortie d'une machine est une goulotte orange qui clignote tant
   qu'elle n'est reliée à rien.
4. **Chaque machine montre ce qu'elle fait.** Le marteau de la Presse tombe, le creuset de la Fonderie se
   remplit puis coule, la lame de la Scierie tourne, les électrodes du Four à arc crachent des éclairs.
   Une machine arrêtée ne bouge plus, et une bulle dit ce qui lui manque.
5. **À plusieurs sur le même écran.** Chaque manette est un bâtisseur de plus.

## La boucle de jeu

- **Seconde par seconde** : marcher, cliquer, voir le résultat tout de suite.
- **Quota par quota** (10 à 30 minutes) : une nouvelle matière, de nouveaux bâtiments, **une seule idée
  nouvelle**.
- **À long terme** : les paliers croissent de 45 %. La place, l'énergie et les gisements qui s'épuisent
  deviennent les vraies limites.

### Les neuf quotas

| # | Quota | Idée enseignée |
| --- | --- | --- |
| 1 | Réveil — 30 minerais de fer | un flux : gisement, convoyeur, Tour |
| 2 | Charbon | transformer : une machine prend une matière, en sort une autre |
| 3 | Fer | deux entrées dans une machine ; le Répartiteur ; l'énergie |
| 4 | Charpente — béton et plaques | une chaîne en deux étapes |
| 5 | Acier | choisir une recette ; le solaire, le jour seulement |
| 6 | Cuivre — câbles | une ligne longue distance |
| 7 | Circuits | une machine très gourmande : diversifier l'énergie |
| 8 | Moteurs | trois lignes qui convergent dans les bonnes proportions |
| 9 | Première vertèbre | tout converge |

## Les 24 bâtiments

- **Logistique** : Convoyeur, Dalle, Répartiteur, Pont, Trieur, Entrepôt, Lampadaire
- **Extraction** : Puits, Scierie, Foreuse
- **Fonte** : Charbonnière, Fonderie (fer, cuivre), Four (chaux, verre), Four à arc
- **Fabrication** : Presse (plaques, câbles), Bétonnière, Convertisseur, Atelier (circuits, moteurs), Cloître
- **Énergie** : Brûleur, Héliostat, Éolienne, Turbine, Accumulateur

Peu de machines, plusieurs recettes par machine : on apprend une forme, on la réutilise.

## Le monde

- **La jungle** : chaque case porte un arbre ou rien. Un arbre déraciné donne du bois et repousse à sa place,
  le jour — sauf sous une dalle ou contre une dalle. Poser des dalles, c'est gagner du terrain pour de bon.
- **Les gisements** : des rochers de la couleur du minerai (rouge : fer ; clair : calcaire ; bleu : quartz ;
  vert : cuivre). Un Puits se pose dessus.
- **Les débris** : des morceaux du module, autour du départ et, plus rarement, loin dans la jungle. Du fer
  gratuit pour qui explore.
- **L'eau** : lac et rivières. On y marche lentement ; une Turbine se pose sur la rive.
- **Le jour et la nuit** : dix minutes. La nuit, l'usine s'éclaire toute seule ; les Héliostats s'arrêtent.

## Direction artistique

- **2D vue de dessus, trois quarts** : ce qui est haut montre sa face sud. Pas de 3D.
- **Béton clair, acier sombre, un seul accent orange.** Jungle en verts profonds, terre ocre dans les
  clairières.
- **Ombres portées** qui tournent avec le soleil, lumière dorée au matin et au soir, bleue la nuit.
- **Le mouvement dit la fonction** : démarrage et arrêt en douceur, rebond à la pose, fumée, étincelles,
  feuilles qui volent.

## Règles d'interface (issues du dossier UI/UX)

1. **Une décision avant un menu** : l'objectif et ses étapes sont toujours visibles ; l'étape en cours dispose
   d'un bouton « Y aller » (le bâtisseur s'y rend seul) et d'une flèche dans le monde.
2. **Conserver le monde visible** : aucun écran ne remplace la carte ; les panneaux sont latéraux.
3. **Reconnaître plutôt que se souvenir** : chaque bâtiment a une icône **et** son nom ; l'infobulle du
   curseur dit ce que fera le clic.
4. **Montrer la cause** : une bulle au-dessus de chaque machine arrêtée ; tout refus de pose dit pourquoi.
5. **Dévoiler par couches** : bulle → infobulle → panneau → Atlas.
6. **Erreur récupérable** : aperçu avant de poser, démolition remboursée à 100 %, Ctrl+Z.
7. **Rien d'essentiel par la couleur seule** : chaque objet a une forme.

## Ce qui n'est pas dans le jeu, volontairement

Pas de Savoir ni d'améliorations, pas de gaz ni de fumée toxique, pas de santé de la jungle, pas de récompense
quotidienne, pas de hasard dans les récompenses.
