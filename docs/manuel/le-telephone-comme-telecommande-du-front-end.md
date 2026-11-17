[English](../manual/the-phone-as-a-remote-for-the-menu.md) · Français · [Sommaire du manuel](../manuel.md)

## Le téléphone comme télécommande du front-end

Deuxième jalon : la liaison du navigateur intégré sert à tout le front-end.
Le téléphone tient les boutons de la borne, tape à la place du clavier à l'écran et envoie un fichier dans le dossier d'import.
Ce que pilote le téléphone suit ce que la borne montre (`RemoteMode`) : la page du site quand « Récupérer » est ouvert (pavé tactile, section précédente), **le front-end** sinon, rien pendant une partie.

- **Où vit le QR code** : **Menu système > Télécommande du téléphone**, à la racine du menu système et dans la rubrique Borne (`app/src/phone-remote-menu.ts`), un panneau avec le QR à gauche et l'état à droite (« Connecter un téléphone », puis le code de quatre chiffres et « Comparez les codes », puis « Téléphone connecté » et « Déconnecter le téléphone ») ; **sous le clavier à l'écran**, une bande « Taper au téléphone » avec un petit QR, puis le code, puis « Le téléphone connecté tape ici » (sa hauteur ne change pas d'un état à l'autre : les touches ne bougent pas) ; le bandeau de « Récupérer », comme avant.
  Le même appairage partout : QR de trois minutes à usage unique, code des deux côtés, **Start accepte, Exit refuse**.
  Sur ces écrans, tant qu'un téléphone attend, Start et Exit sont à lui, jamais à l'écran derrière (Start ne tape pas de touche au clavier à l'écran).
  Quand l'écran qui montrait le code se ferme, le téléphone qui attendait est refusé.
  Indisponible (pare-feu, pas de réseau local), le bloc reste, grisé avec la raison, sans QR lisible.
- **Durée de la liaison** : elle vit tant que le front-end de Cyber Pinball tourne, partie comprise.
  Ouvrir « Récupérer » fait passer le téléphone au pavé tactile, le fermer le ramène aux boutons, sans nouvelle acceptation.
  Elle se coupe quand le téléphone se déconnecte (« Plus » > « Déconnecter ce téléphone »), qu'on le déconnecte à la borne, **après 20 minutes sans geste dans le front-end** (`REMOTE_IDLE_MS`, le temps d'une partie ne compte pas), ou à la fermeture de Cyber Pinball (le téléphone dit « Cyber Pinball fermé »).
  Sans QR affiché ni téléphone, rien n'écoute.
- **Boutons** : Start (valider), flipper gauche (précédent), flipper droit (suivant), Exit (retour), MagnaSave (sur la roue, la collection suivante ; ailleurs, la liste ou les actions d'un écran ; le bouton du téléphone dit lequel).
  Chacun est envoyé appuyé puis relâché ; la borne le remet au **chemin des touches** de la borne (`frontend.ts`, `remoteButton` → `handleKey`), avec la touche de ce bouton sur cette borne (`interfaceKeys`, `zoneSwitchKeys`) : tout ce que fait un bouton de la borne, il le fait.
  Un flipper tenu se répète après 0,4 s, toutes les 70 ms (`isAutoRepeat`) : le front-end accélère comme sous un vrai bouton, le bouton du téléphone dit « Défilement rapide ».
  Un bouton tenu est relâché quand le doigt se lève ou sort du bouton, quand la page passe en arrière-plan, quand la liaison se coupe, après 20 s au plus.
  Tête de la page : l'écran affiché et ce qui y est choisi.
- **Saisie** : quand le front-end ouvre son clavier à l'écran (recherche d'un titre, nom du joueur, nom d'une configuration, adresse d'un nœud Art-Net, nombre de LED…), le téléphone ouvre son panneau de clavier **avec le texte de la borne** (ce n'est jamais un mot de passe : le front-end n'en demande pas) ; ce qu'on tape remplace ce texte (`library.ts`, `remoteSet`), un nombre garde ses chiffres.
  « Valider » est Entrée, « Annuler » est Exit.
  Si le texte change à la borne pendant ce temps, le téléphone le reprend.
  Rien de ce qui est tapé n'entre au journal.
- **Envoi d'un fichier** : « Envoyer » choisit un fichier du téléphone.
  La borne vérifie avant tout envoi : **2 Go au plus** (`REMOTE_UPLOAD_MAX`), un fichier non vide, la place sur le disque (512 Mo laissés libres), le mode invité (porte `phone.files`, fermée).
  Le nom est nettoyé (`cleanUploadName`) : le dernier élément seulement, rien d'un chemin, sans caractère interdit par Windows, sans point au début ni à la fin, jamais un nom de périphérique (`CON`, `NUL`…), 120 caractères au plus ; un nom déjà pris devient « (2) ».
  Les morceaux de 256 Kio partent l'un après l'autre en HTTP (`POST /envoi/<envoi>/<rang>`), scellés sous la clé de la liaison, liés à la connexion, à l'envoi et à leur rang (`uploadAad`) : un morceau rejoué, déplacé, d'une autre connexion ou adressé à un autre nom d'hôte est refusé et l'envoi abandonné.
  Le fichier s'écrit à part (`.envoi-<envoi>.part`, que le dossier d'import ignore), puis prend son nom dans le dossier d'import, jamais ailleurs ; abandonné (Annuler, liaison coupée, une minute sans morceau), il est effacé.
  Progression sur le téléphone (« 34 % · 12,4 Mo sur 36,2 Mo », « Envoi 34 % » sur le bouton) et sur la borne (bandeau « Réception depuis le téléphone · 34 % »), puis « Reçu du téléphone : <nom>, dans le dossier d'import » ; on le retrouve dans Menu système > Tables > Ajouter une table.
- **Chiffrement plus rapide** : ChaCha20 sans allocation par bloc, Poly1305 en dix membres de 13 bits (poly1305-donna 16 bits) au lieu de BigInt, des deux côtés : environ 70 Mo/s au lieu de 9, comparés à `node:crypto` par les tests.
  Un morceau de 256 Kio s'ouvre en quelques millisecondes dans le processus principal.
- **Partie** : VPX a les boutons ; la page dit « Partie en cours », Clavier et Envoyer sont grisés (« Après la partie »), les boutons ne font rien.
  Au retour, le téléphone pilote de nouveau le front-end.
- **Mode invité** : les boutons du téléphone passent par les mêmes portes que ceux de la borne (`GUEST_DOORS`) ; le téléphone **ne déverrouille jamais** le mode invité (ses appuis ne comptent pas dans la combinaison) ; l'envoi de fichiers est fermé (`phone.files`) ; l'écran de la télécommande est dans le menu système, fermé à l'invité.
- **Page du téléphone, mode menu** : `body[data-mode]`, un seul panneau détaillé à la fois (le clavier l'emporte, l'envoi continue et son pourcentage reste sur « Envoyer ») ; quand la hauteur visible tombe sous 680 px (clavier du téléphone ouvert), une vue de saisie remplace les boutons ; Start redevient sombre quand « Valider » est à l'écran ou qu'un flipper est tenu (un seul vert) ; un outil indisponible reste, grisé avec sa raison (« Aucun champ », « Après la partie »).
- **Essais** : `remote.test.ts` (boutons, texte, envoi : messages fermés, noms nettoyés, morceaux scellés et refusés d'ailleurs, gros morceaux justes et rapides) ; `telecommande.test.ts` rejoue le parcours de bout en bout : la vraie gestion des tables hors écran, le QR lu **sur la capture même de l'écran**, la vraie page du téléphone acceptée par Start, Exit et un flipper tenu au téléphone, la saisie et sa validation, un fichier envoyé octet pour octet, puis les refus (plus de 2 Go, mode invité, nom qui remonte les dossiers, morceau d'une autre connexion, morceau rejoué, autre hôte), une partie, « Récupérer » qui prend et rend le téléphone, le QR du clavier à l'écran, l'inactivité, Déconnecter, la fermeture ; le garde-fou de mise en page relit chaque écran.
  `guestmode.test.ts` fixe le passage par `handleKey` et la porte `phone.files`.
