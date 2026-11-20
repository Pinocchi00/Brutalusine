# Les ères

Ce document décrit la progression de Brutalusine : les huit ères, les bâtiments, la façon de les améliorer et
les noyaux. Il a été décidé en discussion avec l'auteur du jeu. Les chiffres sont des **points de départ** à
régler en jouant ; ce qui est marqué « ouvert » n'est pas tranché.

Il remplace, dans `AGENTS.md` et `docs/CONCEPTION.md`, la règle « pas d'améliorations », les neuf quotas et la
liste des 24 bâtiments. Ces deux fichiers seront mis à jour quand on passera au code.

## L'idée en une phrase

On arrive avec une capsule et rien d'autre ; on bâtit en bois, puis on refait la Tour en pierre, puis chaque
bâtiment et chaque bout de tapis en pierre, un par un — et ainsi de suite jusqu'au verre, sans fin.

## Ce qui ne change pas

- **2D, vue de trois quarts, pixel art.** Un monde « absurdement beau », apaisant, aux couleurs sourdes, où
  chaque chose vit.
- **Le brut de l'automatisation** : extraire, transporter, transformer, livrer. Aucun système qui ne serve
  pas les flux.
- **Peu de mécaniques, très bien finies.**
- **Les bâtisseurs sont des robots de colonisation sans cœur.** Ils prennent tout froidement : le bois, la
  pierre, l'eau, les champignons, les animaux. Chaque chose prise sert à quelque chose dans la chaîne.
- **Rien ne disparaît** : démolir ou améliorer rend la matière. Pas de formules chimiques : il faut seulement
  que chaque transformation soit logique et fidèle à la réalité.

## Les règles de base

- **La Tour est l'inventaire.** Tout ce qu'on livre y entre. Poser ou améliorer un bâtiment se paie
  directement sur son stock, où que soit le bâtisseur : on ne porte rien.
- **On change d'ère en améliorant la Tour.** Sa version suivante coûte la matière de la nouvelle ère. Une fois
  la Tour refaite, on peut refaire chaque bâtiment dans cette matière, un par un.
- **Chaque ère va plus vite.** Un bâtiment refait travaille plus vite, mais consomme aussi plus de courant.
  Rien n'oblige à tout refaire : un four de pierre peut tourner à côté d'un silo de béton, et l'usine raconte
  son histoire.
- **Une seule idée nouvelle à la fois.**
- **Pas de fin.** Après la huitième ère, la Tour demande des livraisons sans fin ; on récolte, on automatise et
  on optimise à l'infini. La cible à terme : 50 à 100 heures de jeu.

## Les huit ères

| Ère | Matière des bâtiments | Ce qu'on découvre dans le monde | Énergie qui arrive | Tapis |
| --- | --- | --- | --- | --- |
| 1 · Bois | bois | arbres, roche, débris de la capsule, épaves | la capsule, puis le Brûleur | rondins |
| 2 · Pierre | pierre | animaux, argile des berges | Roue à eau | cuir |
| 3 · Brique | brique | lianes, eau | Moulin à vent | toile de liane |
| 4 · Béton | béton | champignons | — | caoutchouc de mycélium |
| 5 · Fer | fer | minerai de fer, loin | Chaudière à vapeur | chaîne de fer |
| 6 · Acier | acier | quartz | la Roue à eau devient Turbine | plaques d'acier |
| 7 · Cuivre | cuivre + un moteur | minerai de cuivre, très loin | Accumulateur | bande à moteurs |
| 8 · Verre | verre + un circuit | — | Héliostat | ouvert |

La Brique fait la transition entre la Pierre et le Béton, et le Fer entre le Béton et l'Acier.

### Les étapes de la Tour

Dans chaque ère, la Tour demande trois livraisons, une après l'autre. Chacune apporte une seule idée nouvelle
et débloque ce qu'il faut pour la suivante. La troisième demande la matière de l'ère suivante : la livrer
refait la Tour et ouvre l'ère.

| Ère | 1re livraison | 2e livraison | 3e livraison : ouvre l'ère suivante |
| --- | --- | --- | --- |
| 1 · Bois | **20 bois** — un flux : arbre, tapis, Tour | **40 charbons** — transformer | **60 pierres** — extraire un gisement |
| 2 · Pierre | **30 cuirs** — chasser, puis trier | **60 argiles** — prendre sur la berge | **100 briques** — deux entrées dans le Four |
| 3 · Brique | toile — une chaîne en deux étapes | chaux d'os — choisir une recette | **béton** — trois entrées, dont l'eau |
| 4 · Béton | résine — faire pousser plutôt que prendre | minerai de fer — une longue ligne | **fer** |
| 5 · Fer | courant de vapeur — une énergie qui consomme | charbon en masse | **acier** |
| 6 · Acier | verre | minerai de cuivre — un gisement très loin | **cuivre** |
| 7 · Cuivre | câbles | moteurs — trois lignes qui convergent | **verre et circuits** |
| 8 · Verre | puis des paliers sans fin | | |

Les quantités des ères 1 et 2 sont un premier jet. Celles des ères suivantes suivent la règle ci-dessous.

### Après la huitième ère : des paliers sans fin

La Tour continue de demander des livraisons, de plus en plus grosses. Chaque palier lui ajoute un étage
visible et donne un **éclat** (voir les noyaux). Optimiser l'usine sert ainsi à améliorer les noyaux : la
boucle « optimiser, explorer, surcharger » tourne à l'infini.

### L'équilibrage

| Ère | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Vitesse des machines et des tapis | ×1 | ×1,4 | ×2 | ×2,7 | ×3,8 | ×5,4 | ×7,5 | ×10,5 |
| Courant consommé par une machine | ×1 | ×1,5 | ×2,3 | ×3,4 | ×5,1 | ×7,6 | ×11,4 | ×17 |

- **Vitesse** : environ ×1,4 par ère. Le tapis de rondins avance d'une case par seconde.
- **Courant** : environ ×1,5 par ère. Il monte plus vite que la vitesse, si bien que chaque ère demande
  ses nouvelles sources d'énergie.
- **Livraisons de la Tour** : environ deux fois plus par ère.
- **Prix d'une amélioration** : la matière de l'ère, environ deux unités par case occupée (un Puits de 3×3
  coûte 18 pierres). Un convoyeur coûte une unité de sa bande par case. À partir de l'ère Cuivre, il faut en
  plus une pièce : un moteur, puis un circuit à l'ère Verre.
- **Durée visée** : de 45 minutes à 1 h 30 par ère, soit 10 à 15 heures pour les huit ères. Le reste se
  joue dans l'optimisation, l'exploration et les paliers.

## Améliorer un bâtiment

1. On choisit le **marteau** et on clique sur un bâtiment. Pour les convoyeurs et les dalles, on glisse le
   long de la ligne : chaque case est refaite.
2. La matière est prise dans la Tour. Le bâtiment passe directement à la version de l'ère en cours ; on peut
   sauter des ères.
3. Une animation simple et classique : le bâtiment se tasse, un nuage de poussière de la nouvelle matière,
   puis il rebondit dans sa nouvelle forme, en moins d'une seconde. Pas d'échafaudage.
4. Il ne s'arrête pas. Il garde sa place, son sens, ses tapis, son réglage et ce qu'il contient.
5. L'ancienne matière revient à la Tour.

Un bâtiment neuf se pose directement dans la version la plus récente qu'on peut payer.

## Le courant

- **Les machines qui chauffent** (Charbonnière, Four, Fonderie, Convertisseur, Four à arc) brûlent le
  charbon qu'on leur apporte. Elles n'ont pas besoin de courant.
- **Les machines qui tournent** (Scierie, Puits, Broyeur…) en ont besoin.
- Au cœur de chaque machine qui travaille, il y a un **noyau** : un petit moteur venu de la capsule. La
  matière de l'ère n'est que son corps, comme la Tour est bâtie autour de la capsule.
- Le courant passe par la Tour, **sans fils**. La capsule en fournit un peu ; chaque ère ajoute sa source
  quand l'usine en a besoin.

## Les noyaux

Le noyau se voit : une petite lueur orange au cœur de la machine, comme l'œil de la Tour dans la maquette.
Les tapis, dalles, ponts, répartiteurs, trieurs et stockages n'en ont pas.

1. **Un objet qui compte.** La capsule en apporte 6. On en trouve d'autres dans les **épaves** d'anciennes
   capsules, en explorant. On ne sait les fabriquer qu'à l'ère Cuivre, à l'Atelier. Démolir une machine rend
   son noyau. Au début, c'est donc l'exploration qui décide combien de machines on peut avoir.
2. **La surcharge.** Chaque machine a un réglage de 100 % à 250 %. La vitesse suit le réglage, le courant
   monte plus vite : deux fois plus à 150 %, environ quatre fois et demie plus à 250 %. Une machine en
   surcharge a une lueur plus vive, qui bat plus vite.
3. **Le niveau du noyau** fixe la surcharge permise : niveau I = 100 %, II = 150 %, III = 200 %,
   IV = 250 %. On le monte avec des **éclats**, trouvés dans les lieux remarquables du monde : géode, source
   chaude, arbre ancien, cercle de champignons géants. Chaque niveau ajoute un anneau autour de la lueur.
4. **Le monde est infini** : plus on va loin, plus les lieux sont rares et riches. L'exploration récompense
   toute la partie, pas seulement le début. Les paliers sans fin donnent aussi des éclats.

## Les petites améliorations : une entrée en plus

C'est une seule règle : une machine à qui on apporte un extra par un tapis va 1,5 fois plus vite, tant qu'elle
en reçoit. Cela se voit sur elle.

- **La graisse** (ère 2), pour les machines à rouages : une burette, des engrenages qui luisent.
- **L'eau** (ère 4), pour les machines qui chauffent : un tuyau qui fume.

La lampe à résine est retirée : la nuit ne ralentit aucune machine.

## Les ressources

| Ressource | D'où elle vient | À quoi elle sert |
| --- | --- | --- |
| Bois | arbres (poings, Scierie) | bâtiments de l'ère 1, charbon, champignons |
| Pierre | roche (poings, Puits) | bâtiments de l'ère 2, gravier |
| Charbon | bois cuit (Charbonnière) | chauffe tous les fours, Brûleur |
| Peau | animaux (poings, Piège) | cuir |
| Graisse | animaux | la burette des machines à rouages |
| Os | animaux | chaux |
| Cuir | peau tannée (Tannerie) | tapis de l'ère 2 |
| Argile | berges (Argilière) | brique |
| Brique | argile cuite (Four) | bâtiments de l'ère 3 |
| Fibre | lianes (Cueilleuse) | toile |
| Toile | fibre tressée (Corderie) | tapis de l'ère 3 |
| Chaux | os calcinés (Four) | béton |
| Gravier | pierre broyée (Broyeur) | béton |
| Eau | rive (Pompe), en tonneaux sur le tapis | béton, champignons, refroidir les fours, vapeur |
| Béton | chaux + gravier + eau (Bétonnière) | bâtiments de l'ère 4 |
| Résine | champignons (Champignonnière) | tapis de l'ère 4, isolant des câbles |
| Minerai de fer | gisement lointain (Puits) | fer |
| Fer | minerai + charbon (Fonderie) | bâtiments de l'ère 5, acier, moteurs |
| Acier | fer + charbon (Convertisseur) | bâtiments de l'ère 6, moteurs |
| Quartz | gisement (Puits) | verre, silicium |
| Verre | quartz + charbon (Four) | bâtiments de l'ère 8, Héliostats |
| Minerai de cuivre | gisement très lointain (Puits) | cuivre |
| Cuivre | minerai + charbon (Fonderie) | bâtiments de l'ère 7, câbles, circuits |
| Câble | cuivre + résine (Tréfilerie) | moteurs |
| Silicium | quartz + charbon (Four à arc) | circuits |
| Moteur | fer + câble + acier (Atelier) | améliorations de l'ère 7 |
| Circuit | cuivre + silicium (Atelier) | améliorations de l'ère 8 |
| Noyau | épaves, puis l'Atelier (ère 7) | un par machine qui travaille |
| Éclat | lieux remarquables, paliers | monter le niveau d'un noyau |

Le calcaire disparaît : la chaux vient des os.

## Les 31 bâtiments

L'ère indiquée est celle où le bâtiment apparaît. Il a ensuite une version par ère.

### Logistique

| Bâtiment | Ère | Rôle |
| --- | --- | --- |
| Tour | 1 | reçoit et garde tout ; donne le courant de la capsule ; on change d'ère en l'améliorant |
| Convoyeur | 1 | transporte ; sa bande change à chaque ère |
| Dalle | 1 | pave le sol ; la jungle n'y repousse pas |
| Stockage | 1 | garde ce qui attend son tour, le long d'une ligne |
| Répartiteur | 1 | partage un flux en trois |
| Trieur | 2 | l'objet choisi passe tout droit, les autres partent sur les côtés |
| Pont | 3 | fait passer un tapis au-dessus d'un autre |

### Prendre

| Bâtiment | Ère | Prend → donne |
| --- | --- | --- |
| Scierie | 1 | les arbres autour → bois |
| Puits | 1 | le gisement dessous → pierre, puis minerais ; la Foreuse devient sa version tardive |
| Piège | 2 | les animaux autour → peau, graisse et os, mélangés (d'où le Trieur) |
| Argilière | 2 | la berge → argile |
| Cueilleuse | 3 | les lianes autour → fibre |
| Pompe | 3 | la rive → eau |
| Champignonnière | 4 | bois + eau → résine |

### Transformer

| Bâtiment | Ère | Prend → donne |
| --- | --- | --- |
| Charbonnière | 1 | bois → charbon |
| Tannerie | 2 | peau → cuir |
| Four | 2 | argile + charbon → brique ; os + charbon → chaux (ère 3) ; quartz + charbon → verre (ère 6) |
| Corderie | 3 | fibre → toile |
| Broyeur | 3 | pierre → gravier |
| Bétonnière | 3 | chaux + gravier + eau → béton |
| Fonderie | 4 | minerai de fer + charbon → fer ; minerai de cuivre + charbon → cuivre (ère 6) |
| Convertisseur | 5 | fer + charbon → acier |
| Tréfilerie | 7 | cuivre + résine → câble |
| Four à arc | 7 | quartz + charbon → silicium |
| Atelier | 7 | fer + câble + acier → moteur ; cuivre + silicium → circuit ; noyaux |

### Énergie

| Bâtiment | Ère | Ce qu'il fait |
| --- | --- | --- |
| Brûleur | 1 | brûle du bois ou du charbon → courant |
| Roue à eau | 2 | posée sur la rive → courant constant ; sa version acier est la Turbine |
| Moulin | 3 | le vent → courant variable ; sa version acier est l'Éolienne |
| Chaudière | 5 | charbon + eau → beaucoup de courant |
| Accumulateur | 7 | garde le surplus et le rend quand il manque |
| Héliostat | 8 | le soleil → courant, le jour seulement |

### Par rapport aux 24 bâtiments actuels

- **Gardés** : Convoyeur, Dalle, Répartiteur, Trieur, Pont, Puits, Scierie, Charbonnière, Fonderie, Four, Four
  à arc, Bétonnière, Convertisseur, Atelier, Brûleur, Héliostat, Accumulateur.
- **Renommés** : l'Entrepôt devient le Stockage, la Presse devient la Tréfilerie.
- **Devenus une version tardive** : la Foreuse (du Puits), la Turbine (de la Roue à eau), l'Éolienne (du
  Moulin).
- **Retirés** : le Cloître et les Vertèbres, le Lampadaire, les plaques de fer.
- **Ajoutés** : Piège, Argilière, Tannerie, Cueilleuse, Corderie, Broyeur, Pompe, Champignonnière, Roue à eau,
  Moulin, Chaudière.

## L'allure des bâtiments

### Les ères 1 et 2 (la démo)

| Bâtiment | Ère 1 · Bois | Ère 2 · Pierre |
| --- | --- | --- |
| Tour | la capsule sur un plancher de rondins, un mât, un fanion *(maquette)* | un tambour de pierres taillées, un brasero *(maquette)* |
| Convoyeur | des rondins entre deux longrines *(maquette)* | des bandes de cuir cousues sur des rouleaux de bois *(maquette)* |
| Dalle | des rondins fendus posés à plat | des pavés irréguliers, de la mousse dans les joints |
| Stockage | des caisses, un tonneau, une corde *(maquette)* | une réserve en pierre, un toit de planches *(maquette)* |
| Répartiteur | un tourniquet de planches à trois bras | un socle de pierre, un volet qui bascule |
| Scierie | une scie de long sur un chevalet, sous un auvent de branches | un bâti de pierre, une lame ronde, un tas de sciure |
| Puits | un trou, un trépied de perches, un seau *(maquette)* | un anneau de pierres sèches, une grande roue *(maquette)* |
| Charbonnière | une meule de terre, des évents qui rougeoient *(maquette)* | une ruche de pierres sèches *(maquette)* |
| Brûleur | un foyer dans un cercle de bûches | un poêle voûté, une cheminée de pierre |
| Trieur | — | des murets en Y, un clapet de bois à contrepoids |
| Piège | — | une fosse bordée de pierres, un collet sur un arceau, des baies en appât |
| Argilière | — | une fosse sur la berge, une drague à godets, des mottes qui sèchent |
| Tannerie | — | des cuves de pierre, des peaux tendues sur des cadres |
| Four | — | un four carré à gueule rouge, une haute cheminée, des briques qui sèchent devant |
| Roue à eau | — | une roue à aubes dans un bief de pierre, l'eau qui écume |

La **Tour en brique**, qui termine la démo : un fût de briques rouge sourd, des arcades, la capsule dans une
niche.

La maquette `docs/maquettes/heure-doree.html` dessine déjà la Tour, le Puits, la Charbonnière et le Stockage
pour les ères Bois, Pierre, Béton et Acier, ainsi que quatre bandes de convoyeur. Ses versions béton et acier
restent la référence pour les ères 4 et 6.

### Le style des ères suivantes

On détaillera chaque bâtiment quand on y arrivera. Le fil conducteur :

- **Brique** : des voûtes, de la terre cuite rouge sourd, des arcades.
- **Béton** : du béton coffré gris clair, des joints, des formes trapues.
- **Fer** : des rivets, de la fonte noire, de la vapeur.
- **Acier** : des treillis peints, de la tôle ondulée, des ponts roulants.
- **Cuivre** : du vert-de-gris, des bobines, des câbles gainés.
- **Verre** : des serres, des lanternes, de la lumière.

## La démo jouable

On commence petit, et tout viendra peu à peu.

- **Les ères Bois et Pierre complètes.** La démo se termine quand la Tour passe en brique.
- **15 bâtiments** : Tour, Convoyeur, Dalle, Stockage, Répartiteur, Scierie, Puits, Charbonnière, Brûleur
  (ère 1) ; Trieur, Piège, Argilière, Tannerie, Four, Roue à eau (ère 2).
- **Les mécaniques** : la Tour comme inventaire, l'amélioration un par un au marteau, la chasse aux poings puis
  au Piège, la burette de graisse, les noyaux comptés et les épaves.
- **Plus tard** : la surcharge et les éclats.
- **25 dessins**, dont 10 existent déjà dans la maquette.

## Ce qui reste ouvert

- **Les quantités** : toutes les livraisons à partir de l'ère 3, les paliers sans fin, le prix exact de chaque
  amélioration. Elles se règlent en jouant.
- **La chasse** : à quoi ressemblent les animaux, comment ils vivent et reviennent, ce que donne un coup de
  poing, la portée du Piège.
- **Les épaves et les lieux** : leur distance au départ, combien de noyaux et d'éclats chacun contient. Il faut
  au moins une épave garantie assez près du départ, pour ne pas dépendre de la chance.
- **Quelles machines prennent la graisse**, et lesquelles prennent l'eau.
- **La surcharge des machines qui chauffent** : elles n'ont pas besoin de courant ; surchargées, elles
  brûleraient plutôt plus de charbon.
- **La vitesse du premier tapis** : une case par seconde, deux fois moins que le tapis actuel.
- **La recette du noyau** à l'Atelier.
- **La bande de convoyeur de l'ère Verre.**
- **L'aluminium** : une ère de plus, peut-être, après le Cuivre.
- **L'allure des ères 3 à 8**, bâtiment par bâtiment.
- **Les autres documents** : mettre à jour `AGENTS.md`, `docs/CONCEPTION.md` et `docs/FEUILLE_DE_ROUTE.md`.
  Dans le code, `src/sim/data.ts` sera réécrit, et le test d'équilibre des atomes (`tests/chem.test.ts`)
  disparaîtra avec les formules.
