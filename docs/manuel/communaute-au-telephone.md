[English](../manual/community-on-the-phone.md) · Français · [Sommaire du manuel](../manuel.md)

## Communauté au téléphone

L'onglet **Communauté** de la page du téléphone rassemble **Messages**, **Amis** et **Scores** (section précédente), en trois boutons sous la barre du haut.
Il garde le dernier ouvert.
La messagerie y est la même qu'à la borne (Menu système > Amis > Messages) : la borne choisit, met en forme et traduit tout (`app/src/chat-menu.ts`, `remoteCommunity`) ; la page ne fait que dessiner (`app/renderer/telephone/telephone-community.js`).

- **Messages** : les conversations dans l'ordre de la borne (la plus récente d'abord, puis les amis sans message, puis les anciens amis dont le fil reste lisible), avec la pastille de l'ami et sa marque de présence (verte en ligne, bleue en partie, creuse hors ligne), le dernier message (« Vous : … »), son moment, et le nombre de non-lus.
  Un refus ou des messages en attente s'écrivent sous la conversation, en ambre.
  La pastille rouge de l'onglet, et le nombre sur « Messages », comptent les non-lus de tous les amis.
- **Amis** : les mêmes amis, en ligne d'abord, avec leur présence en toutes lettres (« En partie : Neon Abyss », « Vu il y a 2 h »).
  Un toucher ouvre aussi le fil.
- **Le fil** : plein écran, sans les onglets (le clavier du téléphone y monte) ; l'ami, sa pastille et sa présence dans la barre du haut, avec le retour aux conversations.
  Les messages de l'ami à gauche, les miens à droite en vert, en pointillés tant qu'ils attendent sa connexion, en ambre s'ils n'ont pas été remis ; les jours et les évènements de l'ami (records, badges) au centre ; les réactions sous leur message.
  C'est le même fil qu'à la borne (`threadItems`, partagé par les deux).
  La ligne d'état dit ce qui arrivera à ce qu'on écrit (« Nova est en ligne », hors ligne, refus) ; au-dessus du champ, les réactions au dernier message reçu et les phrases toutes prêtes, d'un appui.
  **En train d'écrire** : sous le dernier message, qui écrit en ce moment, l'ami ou les membres d'un groupe (les pseudos, trois au plus puis « +2 », et trois points qui s'allument l'un après l'autre) ; de même sous le salon et la messagerie de la partie (voir « En train d'écrire » dans [Amis : le réseau des bornes](amis-le-reseau-des-bornes.md#messagerie)).
  Le champ du téléphone l'envoie à son tour (`typing`, une fois par seconde au plus tant qu'il reste du texte, la borne n'en relayant qu'un toutes les 3 s) et l'arrête quand il est vidé, le message envoyé ou le fil quitté ; la borne vérifie l'ami, le groupe ou le salon.
  Ouvert au téléphone, le fil est lu, comme à la borne.
- **Écrire** : dans le front-end, et pendant une partie si « Messagerie au téléphone pendant la partie » le permet.
  Le champ, 500 caractères au plus, part par la borne, qui vérifie l'ami, le texte et la réaction (`chat-send`, `chat-react`).
  Impossible d'écrire (partage coupé, messagerie désactivée, ancien ami) : le champ est grisé et la raison s'affiche à la place de la ligne d'état.
- **Indisponible** : partage coupé ou messagerie désactivée, Messages et Amis le disent (« Messagerie indisponible », avec la raison de la borne) ; en mode invité, la messagerie est fermée au téléphone (« Fermée en mode invité. »), comme à la borne.
- **Ce qui part au téléphone** : seulement ce qui s'affiche : noms, présence, textes, moments déjà mis en forme, et la clé publique de chaque ami (celle qui sert à lui écrire, comme pour le fil de la partie).
  Les pastilles sous jeton (`/images/<jeton>`).
  Le téléphone n'envoie que la clé du fil ouvert (`chat-open`, 64 caractères hexadécimaux, ou rien pour la liste), le texte et la réaction.
- **Mise à jour** : la borne envoie la liste et le fil ouvert quand ils changent (un message reçu, une présence), au plus toutes les 1,5 s (`MENUS_MS`), et aussitôt après un message envoyé.
- **Essais** : `telecommande.test.ts` rejoue la Communauté dans le scénario hors écran des classements (`demo-telephone-scores`) : la pastille et le nombre de non-lus, la barre du haut, l'ordre des amis, le fil ouvert (la borne ne reçoit que la clé de l'ami), les bulles des deux côtés en plein écran, une phrase rapide et un message écrit qui arrivent à la borne, le retour qui ferme le fil.
