[English](../manual/community-on-the-phone.md) · Français · [Sommaire du manuel](../manuel.md)

## Communauté au téléphone

L'onglet **Communauté** de la page du téléphone a quatre onglets sous la barre du haut : **Messages**, **Joueurs**, **Salons** et **Scores** (section précédente).
Il garde le dernier ouvert.
Le nombre de messages non lus est une capsule au coin de « Messages », dont le libellé n'est jamais coupé ; la pastille rouge de l'onglet Communauté compte les mêmes.
La Communauté y est la même qu'à la borne (Menu système > Communauté) : la borne choisit, met en forme et traduit tout (`app/src/chat-menu.ts`, `community-menu.ts`, `groups-menu.ts`, `instant-menu.ts`, `rooms-menu.ts`, `phone-community.ts`) ; la page ne fait que dessiner (`app/renderer/telephone/telephone-community.js`, `telephone-groupes.js`, `telephone-niveau.js`).

- **La cloche** : dans la barre du haut des quatre onglets, avec le nombre de notifications non lues (« 99+ » au-delà).
  Elle ouvre l'Activité récente de la borne dans une feuille, jour par jour, chaque ligne avec son heure, l'état de l'ami et son texte entier ; une ligne qui ne vaut plus est grisée avec sa raison (voir [Activité récente](activite-recente.md#activité-récente)).
  Une ligne touchée mène à son écran : le fil d'un ami ou d'un groupe, un profil, Joueurs (une demande d'ami reçue) ou un salon s'ouvrent au téléphone ; le reste s'ouvre à la borne, et le téléphone passe sur Écran.
  « Effacer l'activité récente » vide le journal après une confirmation au téléphone ; vos amis, téléchargements et parties restent.
- **Messages** : en tête, « Créer un groupe » et « Groupes publics » ; puis les invitations de groupe reçues (qui invite, le groupe, Accepter, Refuser) ; puis les conversations.
  Créer un groupe s'ouvre à la borne, et le téléphone passe sur Écran : le nom s'y tape au clavier du téléphone.
  Vos groupes viennent en tête des conversations (leur pastille porte les initiales du groupe), puis les amis dans l'ordre de la borne (la plus récente d'abord, puis les amis sans message, puis les anciens amis dont le fil reste lisible), avec la pastille de l'ami et sa marque de présence (verte en ligne, bleue en partie, creuse hors ligne), le dernier message (« Vous : … »), son moment, et le nombre de non-lus.
  Un refus ou des messages en attente s'écrivent sous la conversation, en ambre.
- **Groupes publics** : plein écran, le nombre de groupes dans la barre du haut.
  Un champ cherche un groupe par son nom ; chaque groupe a son nom, ses membres en pastilles, « Rejoindre » et « Aperçu » (sa table de la semaine, ses membres).
  Vos propres groupes publics sont marqués « Déjà membre » ; un groupe plein, ou dont on vous a retiré, est grisé avec sa raison.
  L'annuaire se demande aux bornes reliées à l'ouverture de la page, et se remplit en quelques secondes.
- **Le fil** : plein écran, sans les onglets (le clavier du téléphone y monte) ; l'ami, sa pastille et sa présence dans la barre du haut, avec le retour aux conversations.
  Les messages de l'ami à gauche, les miens à droite en vert, en pointillés tant qu'ils attendent sa connexion, en ambre s'ils n'ont pas été remis ; les jours et les évènements de l'ami (records, badges) au centre ; les réactions sous leur message.
  C'est le même fil qu'à la borne (`threadItems`, partagé par les deux).
  La ligne d'état dit ce qui arrivera à ce qu'on écrit (« Nova est en ligne », hors ligne, refus) ; au-dessus du champ, les réactions au dernier message reçu et les phrases toutes prêtes, d'un appui.
  **En train d'écrire** : sous le dernier message, qui écrit en ce moment, l'ami ou les membres d'un groupe (les pseudos, trois au plus puis « +2 », et trois points qui s'allument l'un après l'autre) ; de même sous le salon et la messagerie de la partie (voir « En train d'écrire » dans [Communauté : le réseau des bornes](amis-le-reseau-des-bornes.md#messagerie)).
  Le champ du téléphone l'envoie à son tour (`typing`, une fois par seconde au plus tant qu'il reste du texte, la borne n'en relayant qu'un toutes les 3 s) et l'arrête quand il est vidé, le message envoyé ou le fil quitté ; la borne vérifie l'ami, le groupe ou le salon.
  Ouvert au téléphone, le fil est lu, comme à la borne.
  Il s'ouvre en bas, sur les derniers messages, et y revient quand on le retrouve après un autre onglet ou un profil.
  Il y reste quand un message arrive, que le clavier s'ouvre ou que l'écran tourne, sauf si l'on est remonté lire les anciens ; revenu en bas, il suit de nouveau.
  Le fil d'un groupe, le salon et la messagerie de la partie font de même (`telephone-bas.js`).
- **Le fil d'un groupe** : en tête, sa table de la semaine (« Jouer » la lance à la borne ; grisée avec sa raison si elle n'est pas dans votre borne) et son classement (les cinq premiers, votre ligne marquée).
  Le pseudo de l'auteur est au-dessus de chaque message.
  Le menu ⋮ de la barre du haut donne les membres (un toucher ouvre leur profil), « Inviter des amis » (grisé avec sa raison quand personne ne peut l'être), « Notifications du groupe » (activées ou coupées) et « Quitter le groupe », après une confirmation.
- **Joueurs** : la liste de la borne (Communauté > Joueurs en ligne).
  En tête, les demandes d'ami reçues (Accepter, Refuser, Profil).
  Puis les parties instantanées ouvertes : la table, son hôte, les joueurs en pastilles et « Rejoindre » ; une partie sur une autre version de la table, ou sur une table que vous n'avez pas, reste grisée avec sa raison.
  Rejoindre se passe à la borne (la table y est vérifiée, puis le salon de l'hôte s'ouvre), et le téléphone passe sur Écran.
  Puis « Ouvrir une partie instantanée » : la table choisie sur la roue par défaut, « Changer » pour une autre (les tables VPX de la borne), le nombre de joueurs, vous compris, de 2 à 4, puis « Ouvrir la partie ».
  Puis les filtres en badges (Tous, Mon pays, À proximité, Mêmes tables, avec leur nombre ; un filtre qui ne peut rien montrer est grisé), gardés par le téléphone, et les joueurs groupés comme à la borne, chacun avec sa pastille, son drapeau devant son nom et ce qu'il fait.
- **Votre partie** : une partie ouverte ou rejointe a sa carte en tête de Joueurs ; « Voir » l'ouvre en plein écran.
  Les places prises (pastille et pseudo) et libres, le départ, l'heure à laquelle elle se ferme si elle n'est pas complète, « Inviter des amis » en ligne (seul l'hôte invite : sinon grisé avec sa raison), puis « Annuler la partie » (« Quitter la partie » pour qui l'a rejointe), après une confirmation.
  Le départ, la partie et les résultats se passent à la borne.
- **Profil d'un joueur** : un toucher sur un joueur (dans Joueurs, une demande, les membres d'un groupe, une ligne de salon) ouvre son profil en plein écran, le même qu'à la borne : sa pastille, son drapeau, son nom, son niveau et sa barre, ses badges officiels dessinés comme à la borne, son activité avec les « J'aime » (un toucher sur l'étoile aime ou n'aime plus), ses groupes publics, et ce qui reste réservé à ses amis.
  Les actions principales en boutons, la première en vert : envoyer une demande d'ami, écrire à un ami (le fil s'ouvre au téléphone), l'inviter à une partie ou voir sa bibliothèque (à la borne, le téléphone passe sur Écran) ; une action grisée dit sa raison dessous.
  Sous « Plus » : masquer son activité, le retirer de vos amis, le bloquer ; retirer et bloquer se confirment au téléphone.
  Le retour ramène à la vue d'où le profil a été ouvert.
- **Salons** : le salon se choisit en tête, en badges : le vôtre, Monde, ceux où l'on parle (avec leurs présents au-delà de cinq), et « Autres pays… », qui ouvre la liste des pays par leur nom.
  Ce choix est celui du téléphone, indépendant du salon ouvert à la borne ; écrire et les phrases préparées partent dans le salon choisi.
  Les 60 dernières lignes, à l'ancienne : l'heure, le pseudo à la teinte de sa clé, le texte, ses réactions dessous ; la barre du haut dit le salon et ses présents.
  Une ligne touchée ouvre ses options, comme à la borne : les sept réactions en badges (la vôtre repérée, la retoucher la retire), « Répondre à @… » (le champ commence par @pseudo), « Voir son profil », « Envoyer une demande d'ami » (sauf à un ami), « Ignorer … dans les salons », « Signaler ce message » avec sa raison, « Bloquer … » ; sur votre ligne, « Supprimer ma ligne… ».
  Bloquer et supprimer se confirment au téléphone ; la borne vérifie que la ligne est bien de ce salon, et la ligne d'état dit ce qui a été fait (« Signalement envoyé aux modérateurs »).
  Une ligne masquée par la modération l'est aussi au téléphone (« message masqué par la modération »), sans ses réactions ni ses options.
  Les règles des salons s'acceptent à la borne (« Écrire dans le salon ») ; d'ici là, le champ est grisé avec cette raison.
- **Phrases et réactions en badges** : dans le fil d'un ami ou d'un groupe, le salon et la messagerie de la partie, les réactions au dernier message reçu sont sur une ligne à part, au-dessus des phrases préparées en badges, les uns à côté des autres sur deux lignes au plus.
  Quand il y en a davantage, la bande défile vers la droite (un fondu au bord le signale) ; chaque badge se touche sur 48 px.
- **Pendant une partie** : la Communauté reste ouverte.
  Ce que le téléphone ne peut pas faire tant qu'une partie tourne (créer un groupe, jouer la table de la semaine d'un groupe, rejoindre ou ouvrir une partie instantanée) reste visible, grisé, avec sa raison (« Pendant une partie : à la fin de celle-ci »).
- **Écrire** : dans le front-end, et pendant une partie si « Messagerie au téléphone pendant la partie » le permet.
  Le champ, 500 caractères au plus, part par la borne, qui vérifie l'ami, le texte et la réaction (`chat-send`, `chat-react`).
  Impossible d'écrire (partage coupé, messagerie désactivée, ancien ami) : le champ est grisé et la raison s'affiche à la place de la ligne d'état.
- **Indisponible** : partage coupé ou messagerie désactivée, Messages et Joueurs le disent (« Messagerie indisponible », avec la raison de la borne) ; en mode invité, la messagerie est fermée au téléphone (« Fermée en mode invité. »), comme à la borne.
  Sur une borne qui joue en local, la Communauté du téléphone est retirée (« Retirée : la borne joue en local (Menu système › Communauté › Réglages de la communauté › Jouer en local). »).
- **Ce qui part au téléphone** : seulement ce qui s'affiche : noms, présence, textes, moments déjà mis en forme, et la clé publique de chaque ami (celle qui sert à lui écrire, comme pour le fil de la partie).
  Les pastilles sous jeton (`/images/<jeton>`).
  Le téléphone n'envoie que la clé du fil ouvert (`chat-open`, 64 caractères hexadécimaux, ou rien pour la liste), le texte et la réaction.
  Pour le reste, il ne renvoie que des identités, que la borne vérifie avant d'agir : la clé d'un joueur (`profile-open`, `profile-act`, `friend-answer`), un groupe (`group-act`), une partie instantanée (`instant-act`), une ligne d'un salon (`room-open`, `room-act`), la référence d'une ligne d'Activité récente (`activity-act`) ; une table est une référence, jamais un chemin.
- **Mise à jour** : la borne envoie la liste et le fil ouvert quand ils changent (un message reçu, une présence), au plus toutes les 1,5 s (`MENUS_MS`), et aussitôt après un message envoyé ; de même le profil, le salon, l'Activité récente et une page plein écran, tant qu'ils sont ouverts.
- **Essais** : `telecommande.test.ts` rejoue la Communauté dans le scénario hors écran des classements (`demo-telephone-scores`) : la capsule des non-lus, la barre du haut, l'ordre des amis, le fil ouvert (la borne ne reçoit que la clé de l'ami), les bulles des deux côtés en plein écran, une phrase rapide et un message écrit qui arrivent à la borne, le retour qui ferme le fil, et les libellés coupés détectés.
  `telephone-communaute.test.ts` (Joueurs et le profil, ses actions retrouvées par leur identité), `telephone-groupes.test.ts` (groupes, groupes publics, parties instantanées), `telephone-salons.test.ts` (le salon choisi, les gestes vérifiés sur une ligne de ce salon, la ligne masquée) et `telephone-scores-niveau.test.ts` (l'Activité récente par jour, chaque ligne menée à son écran) fixent ce que la borne envoie et ce qu'elle accepte.
