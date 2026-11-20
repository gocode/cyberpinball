[English](../manual/direct-access-to-menus-from-the-phone.md) · Français · [Sommaire du manuel](../manuel.md)

## Accès direct aux menus depuis le téléphone

Dans le front-end, la page du téléphone a une seule barre en haut et cinq onglets en bas : **Écran**, **Menus**, **Juke-box**, **Communauté** (Messages, Joueurs, Salons et Scores) et **Boutons** (sections suivantes).
Elle s'ouvre sur Écran, puis garde la dernière vue choisie.
On n'a plus besoin de parcourir le front-end aux flèches : on touche ce qu'on veut.

- **Barre du haut** : l'icône de Cyber Pinball (celle du raccourci de l'écran d'accueil), l'écran ouvert à la borne et ce qui y est choisi (dans la Communauté, son titre et les messages non lus ; dans un fil, l'ami), le point de la liaison, dans la Communauté la cloche de l'Activité récente, puis **« Clavier »**, qui n'apparaît que quand la borne attend une saisie (il ouvre le clavier du téléphone), et le menu **⋮** : « Retours et propositions », « Nous suivre » (ses liens s'ouvrent directement sur le téléphone, sans QR code), « Envoyer un fichier à la borne », « Ajouter à l'écran d'accueil », « Déconnecter ce téléphone ».
  Les trois gros boutons du bas (Clavier, Envoyer, Plus) n'existent plus dans le front-end ; au navigateur intégré, la barre d'outils reste (Retour, Avancer, Clavier, Plus, Fermer).
- **Onglets du bas** : une barre fine, l'icône dans sa pastille (pleine, en vert signal, sur l'onglet ouvert) et le libellé dessous ; la pastille rouge de Communauté signale un message non lu.
  Pendant une partie, un onglet indisponible est grisé, sa raison (« Après la partie ») à la place du libellé.

- **Écran** : les entrées de l'écran ouvert à la borne, dans son ordre, avec leur icône, leur détail et leur pastille rouge.
  Le choix courant de la borne est en vert.
  Toucher une entrée fait ce que fait un clic sur la borne (`library.ts`, `remoteEntries` → `handleAction`) : la borne retrouve l'élément par son identité, même si la liste a bougé.
  Un flipper appuyé à la borne déplace le repère vert sans redessiner la liste.
  Sur l'écran des tables, la liste montre les tables de la collection affichée (et le médaillon du Juke-box) : on touche une table pour la choisir sur la roue, puis encore pour faire Start (sa fiche, ou la partie si Start joue directement).
  Une liste de choix du clavier à l'écran (le fabricant) se touche aussi.
  Une question (« Quitter Cyber Pinball ? ») ou un message ont leurs entrées Start et Exit.
  Une section que la borne dessine en badges (les phrases préparées de « Écrire dans le salon » et de « Répondre », les réactions) devient une bande de badges, les uns à côté des autres sur deux lignes au plus, qui défile vers la droite quand il y en a davantage ; les réactions sont sur une ligne à part, au-dessus des phrases.
- **Nouveautés** : la chronologie de la borne, resserrée en largeur : la date et la version en tête de chaque jour, le fil et le point de chaque ligne (vert tant qu'elle est nouvelle), son titre, ses badges « Nouveau » et « BÊTA », sa description, ses réactions en bref et son petit aperçu.
  Une nouveauté ouverte montre sa date et sa version, son aperçu, son texte entier et où la trouver.
  Ses sept réactions sont des badges côte à côte, chacun avec son emoji et le nombre de joueurs qui l'ont choisie, la vôtre repérée ; un toucher réagit, comme Start à la borne.
  Les aperçus sont ceux livrés avec l'application, servis sous leur nom (`nouveautes/<nom>-<langue>.webp`) : aucun autre fichier.
- **Menus** : tous les menus de la borne, rangés comme le menu système (`packages/core/src/remote-menus.ts`, `remoteMenuTree`) et précédés de « Écran des tables ».
  Une rubrique s'ouvre sur le téléphone (son chemin en tête, la flèche remonte) ; la borne ne bouge pas tant qu'on parcourt.
  Une entrée s'ouvre **directement à la borne**, comme si on l'avait choisie dans sa rubrique (son « Retour » y ramène), et le téléphone passe sur Écran pour montrer ce qui vient de s'ouvrir.
  L'arbre n'est pas recopié : il vient de celui du menu système, avec les entrées que la borne fournit vraiment, leur détail et leur indisponibilité.
  Un menu ajouté plus tard au menu système paraît donc tout seul sur le téléphone.
- **Écran des tables** : chaque table a le **médaillon de sa roue** à gauche, l'anneau vert sur la table choisie.
  Le bouton en tête dit la **collection** affichée et son nombre de tables ; touché, il ouvre la liste des collections (l'affichée en vert) et en choisit une à la borne, comme MagnaSave ou un clic dans la liste des collections (`collections.choose`).
  En mode invité, la collection imposée ne change pas : le bouton porte un cadenas et la feuille dit pourquoi.
  Le bouton d'à côté passe à la **grille** : deux colonnes, l'image du fronton de chaque table, son médaillon en coin (sans image du fronton, le médaillon en grand) ; le choix est gardé sur le téléphone.
- **Images des tables, toujours à jour** : rien n'est préparé à l'avance.
  À chaque envoi de l'écran, la borne lit les images dans les médias de chaque table, les mêmes que ceux de sa roue (`MenuMedias.wheel` pour le médaillon, `roleMedia(…, 'backglass')` pour le fronton) : une table ajoutée, un média téléchargé ou remplacé paraît sur le téléphone sans rien faire.
  Elles partent sous jeton (`/images/<jeton>`), réduites par la borne (médaillon 128 px, fronton 360 px ; PNG gardé en PNG pour la transparence d'un médaillon).
  L'image du fronton n'est lue que quand le téléphone montre la grille (message `grid`) : la liste ne déclenche pas l'extraction des `.directb2s` de toute la bibliothèque.
- **Boutons** : les boutons de la borne, comme avant (section « Le téléphone comme télécommande du front-end »).
- **Indisponible** : une entrée grisée garde sa raison sous son libellé.
  Elle se touche quand même et fait ce que ferait Start à la borne, qui le redit.
- **États** : « Chargement de l'écran… » en attendant la borne ; « Opération en cours » avec ce qui se passe, rien à toucher ; « Rien à toucher sur cet écran » avec quoi faire (le Juke-box se pilote avec les boutons) ; borne coupée ou Cyber Pinball fermé, le message de la liaison remplace tout.
- **Pendant une partie** : rien ne change, VPX a les boutons.
  Seuls les **réglages en partie** sont accessibles : « Ouvrir les réglages en partie » les ouvre comme les deux MagnaSave.
  La liste montre alors leurs lignes (une ligne bloquée est grisée avec sa raison), les boutons du téléphone les pilotent, et Menus est grisé (« Après la partie »), comme Boutons tant que les réglages sont fermés ; Scores reste ouvert.
  « Reprendre la partie » referme les réglages.
  Dans le casque, le bouton est grisé : les réglages s'y ouvrent dans le casque.
- **Mode invité** : la liste ne montre que ce que la borne montre à l'invité (les actions déjà filtrées par les portes, `GUEST_DOORS`), et chaque toucher passe par les mêmes portes.
  Menus est verrouillé avec sa raison, seul « Écran des tables » reste ; la borne refuse d'ouvrir une entrée du menu système, même demandée à la main.
  Les réglages en partie sont grisés (« Fermés en mode invité. »).
  Le téléphone ne déverrouille jamais rien.
- **Sécurité** : le téléphone n'envoie que des identifiants.
  Pour une entrée de l'écran, le rang et la version de l'écran qu'il a reçu (`pick`) : un rang d'un écran dépassé est ignoré.
  Pour un menu, son identifiant dans l'arbre (`open`) : lettres, chiffres et tirets seulement, 40 au plus, que la borne vérifie (`remoteMenuTarget`) ; un identifiant inconnu est ignoré, et tout ce qui ressemble à un chemin coupe la liaison.
  Ce qui part au téléphone est borné : libellés et détails raccourcis, icônes du registre, 1500 entrées au plus (`REMOTE_ENTRIES_MAX`), jamais un chemin ni une clé.
  Le journal ne note que l'identifiant des menus demandés.
- **Page du téléphone** : `body[data-view]` (`list`, `menus`, `buttons`, et pour la Communauté `messages`, `friends`, `room`, `ranks`, `thread`, `profile`, `page`) ; `body[data-ingame]` pendant les réglages en partie.
  Cibles de 48 px au moins ; textes de 15 px au moins, sauf les libellés des onglets du bas (12 px au moins, sous leur icône), comme le veulent les maquettes validées le 11/11/2026 ; jusqu'à 320 × 568.
- **Essais** : `remote-menus.test.ts` (l'arbre suit celui du menu système dans son ordre, une entrée non fournie n'y est pas, messages bornés, identifiants vérifiés, mêmes portes que la borne, toute section dessinée à part à la borne classée pour le téléphone, la chronologie et la page d'une nouveauté) ; `telecommande.test.ts` rejoue un scénario hors écran : la vraie gestion des tables et la vraie page du téléphone, les entrées touchées, le repère qui suit les flippers, une rubrique parcourue puis une entrée ouverte à la borne, les refus (rang dépassé, menu inconnu, chemin), la roue, le mode invité, une opération en cours, une partie et ses réglages, trois tailles d'écran, la borne coupée, aucune clé au journal.
