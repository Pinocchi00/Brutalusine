# Brutalusine

Un jeu d'automatisation d'usine en 2D, vu de dessus. Une petite créature, une clairière, une jungle : on
déracine, on pioche, on pose une dalle, on trace un convoyeur — et l'usine finit par tourner toute seule.

Version 0.3 — prototype jouable. Voir [la feuille de route](docs/FEUILLE_DE_ROUTE.md) pour le chemin vers la 1.0.

## Jouer

```bash
npm install
```

```bash
npm run dev
```

Puis ouvrir http://localhost:5173 dans un navigateur récent (Chrome, Edge, Firefox).

## Le jeu en une minute

1. **Le but** : la Tour, au centre, donne un quota (« 30 minerais de fer »). Tout ce qui rejoint ton stock
   compte. Chaque quota accompli débloque des bâtiments. Neuf quotas, puis des paliers infinis.
2. **Ton bâtisseur** : il marche (ZQSD ou clic sur le sol), déracine un arbre d'un clic, pioche un rocher
   en maintenant le clic, ramasse les débris.
3. **Construire** : choisir en bas, cliquer. Le Convoyeur se trace en glissant. Démolir rembourse tout,
   Ctrl+Z annule.
4. **Les raccords** : chaque machine sort par sa goulotte orange et accepte ses entrées par tous les autres
   côtés. Un convoyeur qui touche une machine y entre ; un convoyeur qui en touche un autre s'y déverse.
5. **L'énergie** : demande / capacité en haut de l'écran. Si la demande dépasse, toute l'usine ralentit.

Le guide est dans le jeu (touche **H**), l'Atlas des objets et recettes sur **G**.

## Commandes

| Action | Clavier / souris | Manette |
| --- | --- | --- |
| Marcher (courir) | ZQSD, flèches (Maj) — ou clic sur le sol | stick gauche (RT) |
| Poser, tracer, ouvrir, récolter | clic gauche (glisser pour tracer) | A |
| Viser | la souris | stick droit |
| Zoom | molette | croix haut / bas |
| Lâcher l'outil, sinon démolir | clic droit | B |
| Pivoter, copier, outil Démolir | R, E, X | X, Y |
| Bâtiment, catégorie suivante | 1…9, Tab | LB / RB |
| Annuler, pause | Ctrl+Z, Espace | Start |

Coop locale : appuyer sur **A** sur une manette pour rejoindre (jusqu'à 3 manettes en plus du clavier).

## Documentation

- [Conception](docs/CONCEPTION.md) : piliers, quotas, bâtiments, direction artistique, règles d'interface
- [Science](docs/SCIENCE.md) : les recettes sont de vraies équations, sans que le joueur ait à le savoir
- [Feuille de route](docs/FEUILLE_DE_ROUTE.md) : de la 0.3 à la 1.0
- [AGENTS.md](AGENTS.md) : guide pour les agents et contributeurs

## Développement

```bash
npm test
```

```bash
npm run build
```

Dans la console du navigateur en mode développement, `brutalusine.demo()` pose une usine de démonstration.
