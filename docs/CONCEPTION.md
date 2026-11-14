# Conception

## L'idée en une phrase

Une usine de béton brut posée dans une jungle vivante, où chaque réaction est vraie et où rien ne disparaît.

## Ce qui distingue Brutalusine

| | Factorio | Satisfactory | Brutalusine |
| --- | --- | --- | --- |
| Lisibilité | dense, austère | belle, en vue subjective | maquette vue de haut : tout se lit d'un regard |
| Recettes | inventées | inventées | **vraies équations équilibrées** |
| Déchets | pollution abstraite | aucun | **CO₂, SO₂ et scorie existent** et doivent aller quelque part |
| Nature | ennemis | décor | **système vivant** : repousse, meurt, nourrit |
| Temps | cycle cosmétique | cosmétique | **le soleil est une ressource**, les ombres comptent |

## Les piliers

1. **Lisible en cinq secondes, profond pendant des centaines d'heures.** Trois gestes suffisent (poser, relier,
   regarder). La profondeur vient des systèmes, jamais de la manipulation.
2. **La loi de conservation.** Chaque atome est suivi. Le carbone de la jungle devient charbon, puis CO₂, puis
   de nouveau jungle. Un test automatique vérifie que rien n'est créé ni détruit.
3. **Le vivant répond.** La jungle repousse plus vite quand l'air est chargé en CO₂ (elle se nourrit de ce que
   l'usine rejette), meurt sous la fumée, et garde pour elle la seule chose que l'usine ne sait pas fabriquer :
   la Lueur des Éventails.
4. **La lumière est une mécanique.** Jour de dix minutes, ombres portées réelles, héliostats muets la nuit et
   à l'ombre d'un bâtiment.
5. **À plusieurs sur le même écran.** Chaque manette est un bâtisseur de plus.

## La boucle de jeu

- **Minute par minute** : poser une machine, la relier, la voir tourner. Chaque geste a un retour immédiat.
- **Quota par quota** (10 à 30 minutes) : une nouvelle matière, une nouvelle contrainte, de nouveaux bâtiments.
  Chaque quota enseigne **une seule idée** : un flux, deux entrées, l'énergie, un déchet solide, un gaz…
- **À long terme** : les paliers croissent de 45 %. La place, l'énergie, les gisements qui s'épuisent et la
  santé de la jungle deviennent les vraies limites. Chaque palier donne un Savoir à investir.

### Les onze quotas

| # | Quota | Idée enseignée |
| --- | --- | --- |
| 1 | Réveil — hématite | un flux : gisement, convoyeur, Tour |
| 2 | Charbon | transformer : la jungle est un réservoir de carbone |
| 3 | Fer | deux entrées dans une machine ; l'énergie se gère |
| 4 | Béton | une chaîne en deux étapes |
| 5 | Acier | l'énergie solaire, le jour et l'ombre |
| 6 | Cuivre | un déchet solide (scorie) et un gaz toxique (SO₂) |
| 7 | Composants | une machine très gourmande : diversifier l'énergie |
| 8 | Soufre | le déchet devient ressource ; l'eau |
| 9 | Azote | la plus longue chaîne : eau → hydrogène → ammoniac → engrais |
| 10 | Lueur | cohabiter : l'arbre ne donne que si la jungle vit |
| 11 | Première vertèbre | tout converge dans une seule machine |

## Les 35 bâtiments

- **Logistique** : Convoyeur, Aiguillage, Trieur, Pont, Entrepôt, Dalle, Lampadaire
- **Extraction** : Puits, Scierie, Pompe, Foreuse
- **Fonte** : Charbonnière, Haut fourneau, Four à chaux, Verrerie, Fonderie de cuivre, Four à arc
- **Assemblage** : Presse à béton, Convertisseur, Atelier, Cloître
- **Chimie** : Épurateur, Plâtrière, Électrolyseur, Réacteur Haber, Usine d'engrais
- **Énergie** : Amphithéâtre, Héliostat, Éolienne, Turbine, Accumulateur, Pile à hydrogène
- **Vivant** : Serre, Semeur, Cerclage

Règle de conception : **un bâtiment = une fonction**, dite en une phrase dans son infobulle.

## Direction artistique

Tirée des six images d'inspiration, pas de la maquette plate :

- **Béton et jungle** : gris brut contre vert saturé, rien d'autre. Bâtiments en volumes simples, lames
  verticales, gradins, cylindres.
- **Maquette** : vraie 3D vue de haut avec flou de profondeur sur les bords (effet miniature).
- **Lumière douce** : soleil rasant et doré le matin et le soir, ombres longues qui tournent.
- **Échelle** : la nuit, une seule lumière chaude par machine dans le noir bleu ; la Tour éclaire sa clairière.
- **Fumée** : les fours fument, la fumée dérive avec le vent.
- **Mégastructure** : la Tour gagne un étage à chaque quota ; la fin de partie vise la densité.

Palette : béton `#B9B6AC` → `#615F5A`, acier `#4C5057`, signal orange `#F08A24`, flore lumineuse `#7FF0D2`.

## Règles d'interface (issues du dossier UI/UX)

1. **Une décision avant un menu** : l'objectif et ses étapes sont toujours visibles ; l'étape en cours est
   cochable et dispose d'un bouton « Y aller ».
2. **Conserver le monde visible** : aucun écran ne remplace la carte ; les panneaux sont latéraux.
3. **Reconnaître plutôt que se souvenir** : chaque bâtiment a une icône **et** son nom ; les raccourcis sont
   facultatifs.
4. **Montrer la cause** : un pictogramme au-dessus de chaque machine arrêtée (objet manquant, courant, sortie
   bloquée) ; tout refus de pose dit pourquoi, au curseur.
5. **Dévoiler par couches** : pictogramme → infobulle → panneau → Atlas.
6. **Retrouver au lieu de mémoriser** : Atlas avec recherche et liens dans les deux sens (d'où ça vient, à
   quoi ça sert).
7. **Erreur récupérable** : aperçu avant de poser, démolition remboursée à 100 %, Ctrl+Z.
8. **Rien d'essentiel par la couleur seule** : chaque objet a une forme ; les états ont couleur, icône et mot.
9. **Cibles d'au moins 36 px, texte d'au moins 13 px**.

## Ce qui n'est pas dans le jeu, volontairement

Pas de récompense quotidienne, pas de compte à rebours, pas de monnaie, pas de hasard dans les récompenses.
Ce qui retient le joueur doit être son propre projet.
