# Brutalusine

**Béton contre canopée.** Un jeu d'automatisation d'usine vu de haut, en maquette 3D : du béton brut dans une
jungle vivante. Chaque réaction est une vraie équation chimique, rien ne disparaît, le soleil tourne et les
ombres avec lui.

Version 0.2 — prototype jouable. Voir [la feuille de route](docs/FEUILLE_DE_ROUTE.md) pour le chemin vers la 1.0.

## Jouer

```bash
npm install
```

```bash
npm run dev
```

Puis ouvrir http://localhost:5173 dans un navigateur récent (Chrome, Edge, Firefox).

## Le jeu en une minute

1. **Le but** : la Tour, au centre, donne un quota (« livrer 20 hématites »). Tout ce qui y entre compte.
   Chaque quota accompli débloque des bâtiments et fait grandir la Tour. Onze quotas, puis des paliers infinis.
2. **Trois gestes** : poser (choisir en bas, cliquer), relier (Convoyeur : cliquer-glisser), regarder (cliquer
   sur un bâtiment). Démolir rembourse tout, Ctrl+Z annule.
3. **Les flux** : chaque machine sort par sa flèche orange et accepte ses entrées par tous les autres côtés.
4. **L'énergie** : demande / capacité en haut de l'écran. Si la demande dépasse, toute l'usine ralentit.
5. **La chimie** : 2 Fe₂O₃ + 3 C → 4 Fe + 3 CO₂. Les proportions du jeu sont celles de la nature, et les
   déchets (CO₂, SO₂, scorie) existent vraiment.
6. **La jungle** : elle repousse, la fumée la tue, et les Éventails ne donnent leur Lueur que si elle vit.

Le guide complet est dans le jeu (touche **H**), l'Atlas des objets et réactions sur **G**.

## Commandes

| Action | Souris / clavier | Manette |
| --- | --- | --- |
| Poser, tracer, inspecter | clic gauche (glisser pour tracer) | A |
| Déplacer la vue | glisser dans le vide, ZQSD, flèches, clic molette | stick droit |
| Zoom | molette | croix haut / bas |
| Lâcher l'outil, sinon démolir | clic droit | B |
| Pivoter, pipette, outil Démolir | R, E, X | X, Y |
| Bâtiment, catégorie suivante | 1…9, Tab | LB / RB |
| Annuler, pause | Ctrl+Z, Espace | Start |

Coop locale : appuyer sur **A** sur une manette pour rejoindre (jusqu'à 3 manettes en plus de la souris).

## Documentation

- [Conception](docs/CONCEPTION.md) : piliers, systèmes, direction artistique, règles d'interface
- [Science](docs/SCIENCE.md) : chimie, énergie, écologie, et ce qui rend le jeu prenant
- [Feuille de route](docs/FEUILLE_DE_ROUTE.md) : de la 0.2 à la 1.0
- [AGENTS.md](AGENTS.md) : guide pour les agents et contributeurs

## Développement

```bash
npm test
```

```bash
npm run build
```

Dans la console du navigateur en mode développement, `brutalusine.demo()` pose une usine de démonstration.
