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
- **Livraison par livraison** (10 à 30 minutes) : la Tour demande une matière, la livrer débloque de nouveaux
  bâtiments, **une seule idée nouvelle** à la fois.
- **Ère par ère** : la troisième livraison d'une ère refait la Tour dans la matière suivante ; le marteau refait
  ensuite chaque bâtiment, un par un, plus rapide et plus gourmand en courant. Le détail : `docs/ERES.md`.
- **À long terme** : la place, l'énergie et les gisements qui s'épuisent deviennent les vraies limites.

### Les livraisons de la démo

| Ère | Livraison | Idée enseignée |
| --- | --- | --- |
| Bois | 20 bois | un flux : arbre, Scierie, tapis, Tour |
| Bois | 40 charbons | transformer : une machine prend une matière, en sort une autre |
| Bois | 60 pierres — la Tour passe en pierre | extraire un gisement |
| Pierre | 30 cuirs | chasser, puis trier |
| Pierre | 60 argiles | prendre sur la berge |
| Pierre | 100 briques — la Tour passe en brique | deux entrées dans le Four |

## Les bâtiments de la démo

- **Logistique** : Convoyeur, Dalle, Stockage, Répartiteur, Trieur
- **Extraction** : Scierie, Puits, Piège, Argilière
- **Fonte** : Charbonnière, Four (ils chauffent au charbon, sans courant)
- **Fabrication** : Tannerie
- **Énergie** : Brûleur, Roue à eau

Chaque bâtiment a une version par ère. Les 31 bâtiments prévus et leur allure ère par ère : `docs/ERES.md`.

## Le monde

- **La jungle** : chaque case porte un arbre ou rien. Un arbre déraciné donne du bois et repousse à sa place,
  le jour — sauf sous une dalle ou contre une dalle. Poser des dalles, c'est gagner du terrain pour de bon.
- **Les gisements** : la roche, près du départ, donne la pierre ; un Puits se pose dessus. Les autres rochers
  colorés (quartz, cuivre…) attendent leur ère. L'argile se prend sur la berge, à l'Argilière.
- **Les débris** : des morceaux de la capsule, autour du départ et, plus rarement, loin dans la jungle. Du bois
  pour qui explore.
- **L'eau** : lac et rivières. On y marche lentement ; une Roue à eau se pose sur la rive.
- **Le jour et la nuit** : dix minutes. La nuit, l'usine s'éclaire toute seule ; elle ne ralentit pas.

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

Pas de Savoir ni d'arbre de compétences, pas de formules chimiques, pas de gaz ni de fumée toxique, pas de santé de la jungle, pas de récompense
quotidienne, pas de hasard dans les récompenses.
