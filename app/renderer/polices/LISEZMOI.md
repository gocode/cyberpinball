# Polices embarquées

Saira, police de toute l'interface, est embarquée par `../theme.css` (design system :
`docs/design-system`). Les autres sont celles des écrans de repli, embarquées par
`../fallback.css` (fronton, afficheur, topper, logo, chargement). Toutes sont sous **SIL Open Font License 1.1** : le texte de
la licence de chaque police est dans son dossier (`OFL.txt`) et doit l'accompagner à
chaque redistribution. Les fichiers ne sont pas modifiés ; seul leur nom de fichier
change (sans crochets, pour les URL).

Source : dépôt [google/fonts](https://github.com/google/fonts), dossier `ofl/`, révision
`47d54ca1ebb14fd864695f1d39dc734f39017c33` (21 octobre 2026).

| Dossier | Fichier | Police (nom réservé) | Auteurs | Usage |
|---|---|---|---|---|
| `saira/` | `Saira-wdth-wght.ttf` (variable, graisses 100 à 900, largeurs 50 à 125 %) | Saira | The Saira Project Authors (Omnibus-Type) | toute l'interface : menus, fiches, assistant, réglages, bandeau « Récupérer » (révision `47d54ca…`, téléchargée le 23 octobre 2026) |
| `orbitron/` | `Orbitron-wght.ttf` (variable, graisses 400 à 900) | Orbitron | The Orbitron Project Authors | marque « CYBER PINBALL » (topper, chargement, partie) ; style « arcade » du logo |
| `bebas-neue/` | `BebasNeue-Regular.ttf` | Bebas Neue | Dharma Type | titres du fronton et du chargement ; titres dessinés sur l'afficheur |
| `press-start-2p/` | `PressStart2P-Regular.ttf` | Press Start 2P | The Press Start 2P Project Authors | petits textes de l'afficheur (fabricant, année), dessinés point par point |
| `audiowide/` | `Audiowide-Regular.ttf` | Audiowide | Astigmatic (Brian J. Bonislawsky) | plaque du fabricant et de l'année ; style « néon » du logo |

Couverture vérifiée pour le français (capitales et minuscules accentuées, Œ, Æ, Ÿ,
guillemets « », apostrophe typographique, tirets) : complète, sauf Orbitron, à qui
manquent « » et ·. Orbitron ne sert donc qu'à la marque et au style « arcade », où le
navigateur prend une police de secours pour ces seuls signes. Saira couvre tout ce qui
précède, plus le point médian, les guillemets anglais, les tirets, « … », « € » et
« × » ; seul « ✓ » vient d'une police de secours.

Empreintes SHA-256 :

```
9d050fc5a01c85f74c4257c207d50b55d1e40c37308c642f974a2c5003231dde  saira/Saira-wdth-wght.ttf
f42db2dd16e642258e35782916eceb1dcdbea06fb958d77ad71dc5963587e8fd  orbitron/Orbitron-wght.ttf
08e4623805102d819f58601e46e345648846075e363b2ceb23313c2d1c83ec73  bebas-neue/BebasNeue-Regular.ttf
034c77f1f05ec89421e4a63f0e3a4ca1ecf852cc6d2bf611f126f275728e017d  press-start-2p/PressStart2P-Regular.ttf
c7c0f2b0f6fad8c623e31772ce79f94a4edb9321ffce9fce978ea892d20ae730  audiowide/Audiowide-Regular.ttf
```
