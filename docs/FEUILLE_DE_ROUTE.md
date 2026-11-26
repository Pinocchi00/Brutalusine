# Feuille de route vers la 1.0

## Où en est-on

Le jeu passe des quotas aux **ères** (`docs/ERES.md`). **La démo est terminée** : les ères Bois et Pierre se
jouent jusqu'à la Tour de brique, avec 15 bâtiments, la Tour comme inventaire, ses livraisons, le marteau qui
refait un bâtiment dans la matière de l'ère, et un seul rendu, en pixel art, où chaque bâtiment se dessine dans sa
version. La chasse aux cabiais, le Piège, la Tannerie, les épaves et les noyaux comptés, la burette de graisse et
la sauvegarde v5 sont en place.

Retirés : le Savoir, les formules chimiques et le CO₂, les gaz et la fumée toxique, la santé de la jungle, les neuf
quotas et le Colosse, le Lampadaire, les plaques de fer, l'ancien rendu.

**Non vérifié à ce jour** : la musique et les sons nouveaux n'ont pas été écoutés par un humain ; les manettes
n'ont pas été essayées sur du matériel réel ; la fluidité sur une grande usine n'a pas été mesurée (seule la
simulation l'a été).

## Étape 8 — finir la démo : faite

La démo se termine quand la Tour passe en brique. Elle comprend la chasse aux cabiais, le Piège, la Tannerie, les
épaves et les noyaux comptés, la burette de graisse, et les dessins qui manquaient.

Ensuite vient le confort de construction (section 0.4) ; la surcharge des noyaux et les éclats viendront avec les
ères suivantes.

## 0.4 — Confort de construction

- Copier-coller de zones et plans enregistrés (« gabarits »)
- Démolition par rectangle, remplacement en place d'un bâtiment par un autre
- Convoyeurs de niveaux supérieurs, fusion et priorité aux aiguillages
- Surcouches : énergie, débit des convoyeurs
- Mini-carte et repères posés par le joueur

## 0.5 — Profondeur

- Canaux et tuyaux : l'eau comme ressource
- Logique : capteurs et conditions (arrêter une machine quand un entrepôt est plein)
- Transport longue distance (rail ou téléphérique) pour les gisements lointains
- Gisements qui s'épuisent visiblement, fosses qui se creusent

## 0.6 — Le monde

- Autres biomes : marais, plateau calcaire, côte
- Météo : pluie, vent variable par zone
- Faune discrète dans la jungle
- Événements rares et lisibles : floraisons, brumes, éclipses

## 0.7 — Coop

- Écran partagé dynamique quand les bâtisseurs s'éloignent
- Inventaire porté par chaque bâtisseur
- Outils complémentaires, repères et messages rapides entre joueurs
- Partie en réseau

## 0.8 — Les ères suivantes

- Brique, Béton, Fer, Acier, Cuivre, Verre (`docs/ERES.md`), puis des paliers sans fin
- La surcharge des noyaux et les éclats des lieux remarquables
- Statistiques complètes : graphiques de production, comparaison avec ses propres records

## 0.9 — Finition

- Musique composée et bruitages enregistrés, mixage
- Réglages d'accessibilité : échelle d'interface, contraste renforcé, touches remappables, mode daltonien
- Traductions
- Tests avec des joueurs débutants et habitués, sur les parcours du dossier UI/UX

## 1.0

- Version installable pour PC, sauvegardes en fichiers, succès
- Optimisation du rendu pour les très grandes usines
