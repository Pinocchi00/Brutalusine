# Science

Le joueur n'a rien à savoir de ce qui suit. Mais les proportions du jeu ne sont pas inventées : chaque recette
est une équation équilibrée, atome par atome, et un test automatique (`tests/chem.test.ts`) le vérifie.
C'est ce qui rend les ratios cohérents entre eux d'un bout à l'autre de la chaîne.

## Les recettes

| Recette | Équation | Dans le jeu |
| --- | --- | --- |
| Charbon de bois | C₆H₁₀O₅ → 6 C + 5 H₂O | 1 bois → 6 charbons |
| Fer | 2 Fe₂O₃ + 3 C → 4 Fe + 3 CO₂ | 2 minerais + 3 charbons → 4 fers |
| Cuivre | Cu₂CO₃(OH)₂ + C → 2 Cu + 2 CO₂ + H₂O | 1 minerai + 1 charbon → 2 cuivres |
| Chaux | CaCO₃ → CaO + CO₂ | 1 calcaire → 1 chaux |
| Verre | SiO₂ → SiO₂ (fondu) | 1 quartz → 1 verre |
| Béton | 2 CaO + SiO₂ → Ca₂SiO₄ | 2 chaux + 1 quartz → 1 béton |
| Acier | 3 Fe + C → Fe₃C | 3 fers + 1 charbon → 1 acier |
| Silicium | SiO₂ + 2 C + O₂ → Si + 2 CO₂ | 1 quartz + 2 charbons → 1 silicium |

Le minerai de fer est l'hématite, celui de cuivre la malachite, le béton est de la bélite (le silicate du
ciment), l'acier de la cémentite. Les pièces assemblées (plaque, câble, circuit, moteur, vertèbre) sont la
somme exacte de leurs composants.

Les gaz (CO₂, vapeur d'eau, oxygène) équilibrent les équations mais ne se manipulent pas : ils partent dans
l'air ou en viennent.

## Le carbone tourne en rond

Le carbone des arbres devient bois, puis charbon, puis CO₂ dans l'air ; les arbres qui repoussent le
reprennent. Un compteur interne (`Game.ledger`) suit chaque atome, et un test vérifie que rien n'est créé ni
détruit sur toute une usine. Le joueur n'en voit rien, sinon que les arbres repoussent.

## L'énergie

- Un bois vaut 2 800 unités d'énergie, un charbon 394 (les enthalpies de combustion réelles, en kJ/mol).
  Six charbons valent donc moins qu'un bois : carboniser fait perdre de l'énergie, comme dans la réalité.
  On fait du charbon pour fondre le métal, pas pour se chauffer.
- Une machine ne consomme que lorsqu'elle travaille. Si la demande dépasse la capacité, tout ralentit dans
  la même proportion : jamais de panne brutale, toujours un signal lisible.

## Ce qui rend le jeu prenant, sans le rendre toxique

- **Compétence** : chaque quota enseigne une seule idée, et chaque machine montre ce qu'elle fait.
- **Autonomie** : aucune solution imposée ; démolir rembourse tout, Ctrl+Z annule.
- **Lien** : la coop locale, sur le même écran.

Pas de récompense quotidienne, pas de compte à rebours, pas de hasard dans les récompenses. Ce qui retient le
joueur doit être son propre projet.

Sources :

- [Factorio, Friday Facts #241 — New player experience](https://factorio.com/blog/post/fff-241)
- [Tyack et Mekler, Self-Determination Theory in HCI Games Research (CHI 2020)](https://acris.aalto.fi/ws/portalfiles/portal/40334523/CHI2020_SDT_in_Games_preprint.pdf)
