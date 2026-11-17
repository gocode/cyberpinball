[English](../manual/community-credits.md) · Français · [Sommaire du manuel](../manuel.md)

## Crédits de la communauté

Les tables, les frontons, les PuP-Packs, les couleurs et les sons du DMD, les toppers, les médias et les règles sont l'œuvre de la communauté du flipper virtuel.
Cyber Pinball cite leurs auteurs sans encombrer le jeu ([packages/core/src/credits.ts](../../packages/core/src/credits.ts) ; à l'écran, [app/src/credits-menu.ts](../../app/src/credits-menu.ts)) :

- **La roue** : sous le titre, l'auteur principal de la recréation, comme l'auteur d'un livre : « Data East · 1990 · par TastyWasps ».
  Le premier auteur cité (VPS et les auteurs mettent l'équipe principale en tête) ; rien quand on ne le connaît pas.
- **La fiche d'une table** : l'entrée « Crédits », après « Prospectus et règles », résume (« Table de TastyWasps, JPSalas et 12 autres · fronton de HauntFreaks ») et ouvre la page **Crédits** : une ligne par rôle, dans une colonne commune à toute la page, groupées de la vraie machine aux règles : **La machine** (concepteurs et fabricant d'après la base VPS ; la ROM, jouée par PinMAME, reste au fabricant), **La table** (la recréation VPX), **L'habillage** (fronton, PuP-Pack, couleurs du DMD, sons remasterisés, musique, topper, point de vue), **Le front-end** (les médias dont la provenance est notée : VPinMediaDB, un site, la borne d'un ami ; les autres sur une ligne « Provenance non notée »), **Règles et explications** (guide du jeu, carte, texte de l'auteur, feuille de règles, vidéo).
  Une pièce présente dont on ne sait rien reste dite, grisée, « Auteur non renseigné » avec la raison : jamais un nom deviné.
- **Une ligne qui a une page** (celle d'où vient la pièce : VPUniverse, VPForums…) : tant qu'elle est choisie, son QR code est sous les actions, avec son titre (« Sa page sur VPUniverse ») et son adresse, à viser au téléphone (`Action.qr`, calculé pour l'élément choisi seulement).
  **Start l'ouvre directement** dans le navigateur intégré (fenêtre « Récupérer », sans destinataire : un fichier téléchargé va à la liste d'attente comme depuis une fiche de VPS) ; le bandeau dit la table, le rôle et tous ses auteurs, et rappelle qu'un merci fait plaisir.
  Fermer (Échap) revient aux crédits.
- **Une ligne sans page mais avec plus de quatre auteurs** : Start ouvre tous ses auteurs et ce qu'ils ont fait d'autre sur la borne.
- **La communauté** : Menu système > Cyber Pinball > « La communauté » (aussi depuis la page Crédits) : les auteurs de la borne, des plus présents aux moins présents (« HauntFreaks · 8 frontons · 4 tables » ; 40 au plus, puis « … et N autres »), chacun avec ses tables ; puis les logiciels et les sites sans lesquels rien ne marche (VPX, PinMAME, B2S, Serum, PinUP Player, DOF ; VPS, VPinMediaDB, VPUniverse, VPForums, IPDB, The Pinball Primer).
  Ce classement ne lit que les `.info` (pas les tables elles-mêmes), refait au plus toutes les 30 s.
- **Le mode attente** : la ligne discrète décrite dans [Mode attente](medias-des-jeux.md#mode-attente).

D'où viennent les noms, du plus sûr au moins sûr (`tableAuthors`) :

- **La provenance notée à l'installation** depuis le catalogue : `CyberPinball.source` du `.info` pour la table (le fichier VPS, ses auteurs, sa version, sa page), `CyberPinball.parts.<sorte>` pour chaque pièce de l'habillage (`b2s`, `pup`, `altcolor`, `altsound`, `music`, `topper`, `pov` : identifiant VPS, version, auteurs, page, précision de la base, date).
  Une pièce remplacée prend la place de l'ancienne.
- **Pour la table seule** : la recréation reconnue chez VPS d'après l'auteur et la version écrits dans la table par son auteur (l'auteur seul ne suffit que s'il n'a fait qu'une recréation de ce jeu), sinon `Info.Authors` du `.info` (rempli à l'import), sinon le texte de l'auteur tel quel.
- **Les médias** : l'auteur d'une fiche de VPUniverse ou de VPForums est noté avec la provenance du média (`MediaOrigin.author`).
- Une pièce installée avant cette version, ou à la main, n'a pas de provenance : « Auteur non renseigné ».
  La réinstaller depuis le catalogue (fiche > Gérer la table… > Parties du jeu) la note.

Mode invité : la page Crédits se lit (porte `sheet.credits`) ; le navigateur intégré reste fermé à l'invité (porte `sheet.credits-web` : on peut s'y connecter, y télécharger), Start sur une ligne qui a une page ouvre alors ses auteurs et son QR code (le bloc du QR de la télécommande, avec ses propres phrases : il n'appaire rien).
La communauté est au menu système, fermé à l'invité.

Tests : [credits.test.ts](../../packages/core/src/test/credits.test.ts) (provenance lue et écrite sans toucher au reste du `.info`, auteurs du plus sûr au moins sûr, aucun nom deviné, groupes de la page, résumé, ligne du mode attente, classement de la communauté), [uisounds.test.ts](../../packages/core/src/test/uisounds.test.ts) (écran « Mode attente » : chaque ligne revient sur elle-même).
