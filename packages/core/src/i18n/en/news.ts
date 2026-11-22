// Catalogue anglais : Nouveautés (Menu système > Aide et infos > Nouveautés : packages/core/src/news.ts,
// app/src/news-menu.ts). Clé : le texte français. Les noms déjà traduits ailleurs (Nouveautés,
// Parties instantanées, Groupes privés, Retours et propositions…) ne sont pas répétés ici.
export const messages: Record<string, string> = {
  // packages/core/src/systemmenu.ts

  // packages/core/src/news.ts : les nouveautés
  'Pré-réglages de qualité': 'Quality presets',
  'Une belle image sans régler VPX : le mode Auto choisit la qualité qui convient à votre machine.': 'A beautiful image without tuning VPX: Auto mode picks the quality that suits your machine.',
  'Auto part de votre carte graphique et de votre playfield, puis s’ajuste après chaque partie d’après le temps que la carte graphique met à dessiner une image : plus beau s’il reste de la marge, plus léger si elle peine.':
    'Auto starts from your graphics card and your playfield, then adjusts after each game from how long the graphics card takes to draw a frame: more beautiful when there is headroom, lighter when it struggles.',
  'Ou choisissez vous-même : Performance, Équilibré, Qualité ou Ultra. Un réglage changé à la main dans Réglages de VPX passe en Personnalisé : Cyber Pinball n’y touche plus.':
    'Or choose yourself: Performance, Balanced, Quality or Ultra. A setting changed by hand in VPX settings switches to Custom: Cyber Pinball leaves it alone.',
  'Menu système › Ma borne › VPX › Pré-réglages': 'System menu › My cabinet › VPX › Presets',
  'Un échange avec l’équipe': 'A conversation with the team',
  'Envoyez un rapport : l’équipe vous répond sur la borne, et vous pouvez lui répondre.': 'Send a report: the team replies on your cabinet, and you can reply back.',
  'Chaque rapport, plantage automatique compris, ouvre un échange. La réponse de l’équipe arrive avec une notification, dans vos messages en attente.':
    'Every report, automatic crash reports included, opens a conversation. The team’s reply comes with a notification, in your waiting messages.',
  'Vos rapports partent avec votre pseudo, ou anonymement si vous le choisissez : l’équipe peut vous répondre dans les deux cas. Tout reste chiffré entre la borne et l’équipe.':
    'Your reports go with your nickname, or anonymously if you choose: the team can reply either way. Everything stays encrypted between the cabinet and the team.',
  'Menu système › Aide et infos › Retours et propositions › Mes échanges avec l’équipe': 'System menu › Help and info › Feedback and ideas › My conversations with the team',
  'Le Menu système, plus court': 'A shorter System menu',
  'Huit lignes au plus par écran, neuf à l’ouverture, rangées dans l’ordre où l’on s’en sert.': 'Eight lines at most per screen, nine when it opens, in the order you use them.',
  'Neuf rubriques dans l’ordre de l’usage : Tables, Ma borne, Téléchargements, Activité récente, Communauté, Arène, Juke-box, Aide et infos, Quitter ou éteindre. Les autres écrans n’ont pas plus de huit lignes.':
    'Nine sections in the order you use them: Tables, My cabinet, Downloads, Recent activity, Community, Arena, Jukebox, Help and info, Quit or shut down. The other screens have no more than eight lines.',
  'Ma borne réunit ce qui dépend de la borne : écrans, boutons, son, VPX, DMD et LED, VR. La Communauté est celle de la roue, et le Menu système rouvre la dernière rubrique choisie.':
    'My cabinet gathers what depends on the cabinet: screens, buttons, sound, VPX, DMD and LEDs, VR. Community is the same as on the wheel, and the System menu reopens the last section you chose.',
  'Le son de la borne se règle presque seul': 'Cabinet sound almost sets itself up',
  'Cyber Pinball regarde ce qui est branché, propose la configuration du son et la vérifie avec vous.':
    'Cyber Pinball looks at what is plugged in, suggests the sound setup and checks it with you.',
  'L’étape « Son de la borne » lit les prises de la carte son et les haut-parleurs de vos écrans, puis propose quelques configurations, la plus probable en tête, avec un schéma de la borne.':
    'The “Cabinet sound” step reads the sound card’s jacks and your screens’ speakers, then suggests a few setups, the most likely first, with a drawing of the cabinet.',
  'Essayer une configuration la vérifie paire par paire. Carte en stéréo dans Windows : le panneau Son s’ouvre et l’assistant attend le 5.1 ou le 7.1. Sinon, « Régler pas à pas » reste là.':
    'Trying a setup checks it pair by pair. Card in stereo in Windows: the Sound panel opens and the wizard waits for 5.1 or 7.1. Otherwise, “Step by step” is still there.',
  'Menu système › Ma borne › Configuration de la borne › Son de la borne': 'System menu › My cabinet › Cabinet setup › Cabinet sound',
  'Future Pinball sur la roue': 'Future Pinball on the wheel',
  'Vos tables Future Pinball (.fpt) à côté de vos tables VPX, lancées en un appui.': 'Your Future Pinball tables (.fpt) next to your VPX tables, started with one press.',
  'Cyber Pinball trouve Future Pinball sur ce PC et liste les tables de son dossier Tables ; Start en ajoute une, avec son nom et ses médias.':
    'Cyber Pinball finds Future Pinball on this PC and lists the tables in its Tables folder; Start adds one, with its name and media.',
  'La partie passe par BAM s’il est installé et revient à la roue quand vous quittez la table ; un appui long sur Exit la ferme.':
    'The game goes through BAM when it’s installed and comes back to the wheel when you leave the table; holding Exit closes it.',
  '« Trouver une table en ligne » propose aussi ses tables : l’archive reçue est rangée dans le jeu, sans rien écraser.':
    '"Find a table online" offers its tables too: the received archive is put into the game, without overwriting anything.',
  'Menu système › Tables › Ajouter une table › Tables de Future Pinball': 'System menu › Tables › Add a table › Future Pinball tables',
  'Reprendre vos tables sans les dupliquer': 'Bring your tables over without duplicating them',
  'Les tables de PinUP Popper, PinballX ou PinballY rejoignent la roue sans être dupliquées sur le disque.':
    'Tables from PinUP Popper, PinballX or PinballY join the wheel without being duplicated on disk.',
  'Sur le même disque, tables, frontons, vidéos, PuP-Packs et ROM sont liés au lieu d’être copiés : aucune place en plus, et l’installation d’origine reste telle quelle.':
    'On the same drive, tables, backglasses, videos, PuP-Packs and ROMs are linked instead of copied: no extra space, and the original installation stays as it is.',
  'Chaque table arrive avec son PuP-Pack, sa ROM et ses médias. Avant d’installer, le plan d’ajout dit ce qui sera lié, ce qui sera copié et la place qu’il faut.':
    'Each table comes with its PuP-Pack, ROM and media. Before installing, the add plan shows what will be linked, what will be copied and the space needed.',
  'Votre compte vous suit': 'Your account follows you',
  'Pseudo, niveau, badges et amis : vous retrouvez tout sur un autre PC ou après une réinstallation.': 'Nickname, level, badges and friends: you get it all back on another PC or after reinstalling.',
  'Cyber Pinball garde d’office une copie de secours de votre compte sur ce PC, hors de son dossier : une réinstallation la retrouve et vous propose de la reprendre.':
    'Cyber Pinball automatically keeps a backup copy of your account on this PC, outside its folder: a reinstall finds it and offers to take it back.',
  'Notez votre code de récupération, 24 mots ou leur QR à photographier, pour retrouver votre compte sur n’importe quel PC. Un mot de passe est possible aussi : votre pseudo devient votre identifiant, et le serveur ne garde qu’une copie chiffrée qu’il ne peut pas ouvrir.':
    'Write down your recovery code, 24 words or their QR code to photograph, to get your account back on any PC. A password works too: your nickname becomes your ID, and the server only keeps an encrypted copy it cannot open.',
  'Menu système › Communauté › Mon profil › Mon compte': 'System menu › Community › My profile › My account',
  'Votre configuration DOF reprise': 'Your DOF setup carried over',
  'Une borne venue d’un autre front-end retrouve ses LED et ses toys, sans rien refaire dans le configtool.':
    'A cabinet coming from another front-end gets its LEDs and toys back, without redoing anything in the configtool.',
  'Cyber Pinball cherche l’ancien DOF sur les disques et montre ce qu’il a trouvé. « Reprendre la configuration de l’ancien DOF » copie ses fichiers du configtool et, s’il est cohérent, son Cabinet.xml, en sauvegardant ce qui était en place.':
    'Cyber Pinball looks for the old DOF on the drives and shows what it found. “Reuse the old DOF configuration” copies its configtool files and, if it is consistent, its Cabinet.xml, backing up whatever was in place.',
  'Des LED adressables sans Cabinet.xml sont signalées avec le port probable de leur contrôleur, et des bandes pilotées par une Wemos D1 reçoivent d’office les réglages qu’attend son micrologiciel.':
    'Addressable LEDs without a Cabinet.xml are flagged with the likely port of their controller, and strips driven by a Wemos D1 automatically get the settings its firmware expects.',
  'Menu système › Ma borne › DMD et LED › LED et retours (DOF)': 'System menu › My cabinet › DMD and LEDs › LED and feedback (DOF)',
  'Niveaux': 'Levels',
  'Vos parties, vos progrès, vos badges et la vie entre joueurs vous font monter de niveau.': 'Your games, your progress, your badges and life among players raise your level.',
  'Chaque partie, chaque record battu, chaque classement de la semaine, chaque badge reçu et la vie entre joueurs rapportent des XP. Votre niveau monte et ne baisse jamais ; votre carte de joueur, en haut de l’écran des tables, le montre avec sa barre.':
    'Every game, every record beaten, every weekly ranking, every badge earned and life among players bring XP. Your level goes up and never goes down; your player card, at the top of the tables screen, shows it with its bar.',
  'Un badge reçu a son moment au retour de la partie, avec son animation et sa musique, et le passage de niveau a ses rayons. « Mon niveau » dit ce qui rapporte des XP et quels badges sont les plus proches.':
    'A badge earned gets its moment when you come back from the game, with its animation and music, and reaching a new level has its rays. “My level” tells you what brings XP and which badges are closest.',
  'Communauté › Mon niveau': 'Community › My level',

  'Une partie en direct ouverte à tous, qui part d’elle-même dès qu’elle est complète.': 'A live game open to everyone, which starts by itself as soon as it is full.',
  'Choisissez une table et le nombre de joueurs, de 2 à 4 : votre partie s’affiche chez tous les joueurs en ligne, et part toute seule dès qu’elle est complète.':
    'Pick a table and the number of players, from 2 to 4: your game shows up for every player online, and starts by itself as soon as it is full.',
  'Amis ou non, il suffit d’avoir la même version de la table. Vous êtes prévenu de chaque arrivée, et une partie s’ouvre aussi depuis la fiche d’une table.':
    'Friends or not, all it takes is the same version of the table. You are told whenever someone joins, and a game can also be opened from a table’s page.',
  'Communauté › Parties instantanées': 'Community › Instant games',

  'Vos cercles, publics ou privés : une discussion et une table de la semaine, avec son classement.': 'Your circles, public or private: a chat and a table of the week, with its leaderboard.',
  'Créez un groupe avec vos amis : privé, il ne paraît nulle part et l’on y entre sur invitation ; public, n’importe quel joueur le rejoint d’un appui. Chaque semaine, une table choisie pour tous : Start la lance, et le classement du groupe se remplit tout seul.':
    'Create a group with your friends: private, it appears nowhere and you get in by invitation; public, any player joins it in one press. Every week, a table chosen for everyone: Start launches it, and the group’s leaderboard fills itself.',
  'Communauté › Groupes': 'Community › Groups',
  'Chaque membre peut inviter ses amis. Tout passe d’une borne à l’autre, sans serveur : un membre absent reçoit les messages à son retour.':
    'Every member can invite their friends. Everything goes from cabinet to cabinet, with no server: a member who is away gets the messages when they are back.',

  'Pinball FX sur la roue': 'Pinball FX on the wheel',
  'Vos tables Pinball FX, achetées sur Steam ou Epic, à côté de vos tables VPX.': 'Your Pinball FX tables, bought on Steam or Epic, next to your VPX tables.',
  'Choisissez les tables que vous possédez : elles rejoignent la roue avec leurs médias, vos collections, vos favoris et vos statistiques.':
    'Pick the tables you own: they join the wheel with their media, your collections, your favourites and your statistics.',
  'Un appui long sur Exit ferme le jeu et ramène au front-end. Ce que Pinball FX ne fournit pas (scores, partie avec un ami, réalité virtuelle) reste grisé sur la fiche, avec la raison.':
    'A long press on Exit closes the game and brings you back to the front-end. What Pinball FX does not provide (scores, playing with a friend, virtual reality) stays greyed out on the table’s page, with the reason.',
  'Menu système › Tables › Ajouter une table › Tables de Pinball FX': 'System menu › Tables › Add a table › Pinball FX tables',

  'Les idées des joueurs, les plus demandées en tête : votez, ou proposez la vôtre.': 'Players’ ideas, the most wanted first: vote, or suggest your own.',
  'Un tableau public des idées et des problèmes signalés par les joueurs. Votez pour une proposition, ou publiez la vôtre au clavier à l’écran ou au téléphone : les propositions proches s’affichent pendant que vous écrivez.':
    'A public board of the ideas and problems reported by players. Vote for an idea, or post your own with the on-screen keyboard or your phone: similar ideas show up while you type.',
  'Un problème se signale aussi depuis l’écran d’une partie qui n’a pas pu se dérouler, avec un rapport technique lu par l’équipe seule.':
    'A problem can also be reported from the screen of a game that could not run, with a technical report read by the team only.',
  'Menu système › Aide et infos › Retours et propositions': 'System menu › Help and info › Feedback and ideas',

  'La Communauté': 'The Community',
  'Les joueurs en ligne du monde entier, et un salon de discussion par pays.': 'Players online from all over the world, and a chat room for each country.',
  'Un médaillon de la roue ouvre la Communauté : les joueurs en ligne, amis ou non, avec leur drapeau ; vos messages ; les classements de toutes vos tables.':
    'A medallion on the wheel opens the Community: players online, friends or not, with their flag; your messages; the leaderboards of all your tables.',
  'Chaque pays a son salon, plus « Monde » : une ligne par message, avec l’heure, le drapeau et le pseudo de chacun. On écrit avec des phrases d’un appui, le clavier à l’écran ou le téléphone.':
    'Each country has its room, plus “World”: one line per message, with each player’s time, flag and nickname. You write with one-press phrases, the on-screen keyboard or your phone.',
  'Roue › Communauté': 'Wheel › Community',

  'Les crédits de vos tables': 'Your tables’ credits',
  'Qui a fait la table, son fronton, son PuP-Pack, ses médias : chaque auteur cité.': 'Who made the table, its backglass, its PuP-Pack, its media: every author credited.',
  'La fiche de chaque table a ses crédits, d’après la base VPS : la table, le fronton, le PuP-Pack, les couleurs et les sons, les médias et les règles. Start sur une ligne montre tous ses auteurs et la page d’où vient la pièce, en QR code à viser au téléphone.':
    'Every table’s page has its credits, from the VPS database: the table, the backglass, the PuP-Pack, colours and sounds, media and rules. Start on a line shows all its authors and the page the piece comes from, as a QR code to scan with your phone.',
  'La roue cite l’auteur principal de chaque table, et « La communauté » rassemble les auteurs de toutes vos tables.':
    'The wheel credits each table’s main author, and “The community” gathers the authors of all your tables.',
  'Fiche d’une table › Crédits': 'Table page › Credits',

  'Le Juke-box': 'The Juke-box',
  'Vos playlists YouTube et vos fichiers sur la borne, le clip au fronton, le spectre au DMD.': 'Your YouTube playlists and your own files on the cabinet, the video on the backglass, the spectrum on the DMD.',
  'Un médaillon en tête de la roue joue vos playlists : importées de YouTube, ou vos propres fichiers. Le fronton montre le clip ou la pochette, le DMD un spectre aux couleurs de la pochette.':
    'A medallion at the head of the wheel plays your playlists: imported from YouTube, or your own files. The backglass shows the video or the cover, the DMD a spectrum in the cover’s colours.',
  'Tout se pilote aux boutons de la borne, ou au téléphone. Le son peut sortir sur plusieurs haut-parleurs à la fois, chacun avec son volume.':
    'Everything is driven with the cabinet’s buttons, or your phone. Sound can play on several speakers at once, each with its own volume.',
  'Roue › Juke-box': 'Wheel › Juke-box',

  'Classements jusqu’au mondial': 'Leaderboards, all the way to worldwide',
  'Le tableau des scores de chaque table : votre borne, vos amis, votre pays, le monde.': 'Each table’s leaderboard: your cabinet, your friends, your country, the world.',
  'Chaque partie laisse ses scores sur la fiche de la table. Les MagnaSave passent de « Cette borne » à « Amis », « National » et « Mondial » ; les flippers changent de période, de tout temps à aujourd’hui.':
    'Every game leaves its scores on the table’s page. The MagnaSave buttons switch from “This cabinet” to “Friends”, “National” and “Worldwide”; the flippers change the period, from all time to today.',
  'Un score n’est comparé qu’avec ceux de la même version de la table, jouée avec le même nombre de billes. Il passe de borne en borne, signé par son joueur, sans serveur.':
    'A score is only compared with those of the same version of the table, played with the same number of balls. It goes from cabinet to cabinet, signed by its player, with no server.',
  'Fiche d’une table › Tableau des scores': 'Table page › Leaderboard',

  'Vos tables et le front-end dans un casque, la borne calée sur la vraie.': 'Your tables and the front-end in a headset, the cabinet lined up with the real one.',
  'Avec un casque (Meta Quest par Link ou Virtual Desktop, SteamVR), le front-end s’affiche dans une borne habillée, et chaque table se joue en grand devant vous.':
    'With a headset (Meta Quest through Link or Virtual Desktop, SteamVR), the front-end shows up in a decorated cabinet, and each table plays full size in front of you.',
  '« Caler la borne » pose la borne du casque exactement sur la vraie : vous jouez avec les boutons de votre borne, sous vos mains.':
    '“Line up the cabinet” sets the headset’s cabinet exactly on the real one: you play with your cabinet’s buttons, under your hands.',
  'Menu système › Ma borne › Réalité virtuelle et vision 3D': 'System menu › My cabinet › Virtual reality and 3D vision',

  'Menu système › Ma borne › Télécommande du téléphone': 'System menu › My cabinet › Phone remote',

  'La table en relief avec de simples lunettes rouge et cyan, et avec la Vision 3D si vous voulez.': 'The table in 3D with simple red and cyan glasses, and with 3D vision if you like.',
  'Mettez des lunettes à filtres colorés : rouge / cyan, vert / magenta ou ambre / bleu. Le plateau sort de l’écran ; avec la Vision 3D, le relief suit aussi votre tête.':
    'Put on colour filter glasses: red / cyan, green / magenta or amber / blue. The playfield comes out of the screen; with 3D vision, the depth follows your head too.',
  'Calibrez vos lunettes aux boutons de la borne, un œil fermé à chaque fois : moins d’images fantômes, des couleurs plus justes.':
    'Calibrate your glasses with the cabinet buttons, one eye closed each time: less ghosting, truer colours.',
  'Menu système › Ma borne › Réalité virtuelle et vision 3D › Lunettes 3D': 'System menu › My cabinet › Virtual reality and 3D vision › 3D glasses',

  'Les tables du jour': 'Tables of the day',
  'Les tables les plus jouées aujourd’hui, le record du jour et le joueur juste devant vous.': 'The most played tables today, the record of the day and the player just ahead of you.',
  'Dans le monde, votre pays ou entre amis : chaque table montre son record du jour, votre place et ce qu’il vous manque. Start lance la table.':
    'Worldwide, in your country or among friends: each table shows its record of the day, your place and what you are missing. Start launches the table.',
  'La fiche d’une table dit qui battre, qui y joue en ce moment, et regroupe les parties à plusieurs dans « Jouer ensemble… ». Sans vidéo de chargement, l’objectif s’affiche aussi au lancement.':
    'A table’s page says who to beat and who is playing it right now, and groups multiplayer games under “Play together…”. Without a loading video, the goal also shows at launch.',
  'Arène › Du jour': 'Arena › Daily',
  'Menu système › Tables › Ajouter une table › Depuis une autre installation': 'System menu › Tables › Add a table › From another installation',


  // app/src/news-menu.ts : l'écran
  'Les grandes nouveautés de Cyber Pinball, une ligne chacune': 'The big new things in Cyber Pinball, one line each',
  '{n} nouvelle depuis votre dernière visite': '{n} new since your last visit',
  '{n} nouvelles depuis votre dernière visite': '{n} new since your last visit',
  '{n} nouvelle : {titles}': '{n} new: {titles}',
  '{n} nouvelles : {titles}': '{n} new: {titles}',
  'Dernière le {date} : {title}': 'Latest on {date}: {title}',
  'Nouveau': 'New',
  'voir en grand': 'see it full size',
  'voir en grand et lire la suite': 'see it full size and read on',
  '{date} · version {version}': '{date} · version {version}',
  'Essayer : {where}': 'Try it: {where}',
  'Où : {where}': 'Where: {where}',
  '‹ Précédente': '‹ Previous',
  'Suivante ›': 'Next ›',
  'Retour à la liste': 'Back to the list',
  'Flippers : choisir · Start : valider · Exit : retour à la liste': 'Flippers: choose · Start: confirm · Exit: back to the list',
  // Réagir à une nouveauté (les sept réactions des messages)
  'Réactions hors ligne : elles reviennent dès que le service répond': 'Reactions offline: they come back as soon as the service answers',
  'Lecture des réactions…': 'Reading reactions…',
  'Votre réaction : {reaction} · Start sur elle la retire': 'Your reaction: {reaction} · Start on it removes it',
  '{n} joueur a réagi': '{n} player reacted',
  '{n} joueurs ont réagi': '{n} players reacted',
  'Soyez le premier à réagir': 'Be the first to react',
  '{n} réaction': '{n} reaction',
  '{n} réactions': '{n} reactions',
  '{n} réaction, dont la vôtre': '{n} reaction, including yours',
  '{n} réactions, dont la vôtre': '{n} reactions, including yours',
  'Réagir est fermé en mode invité': 'Reacting is closed in guest mode',
  'Choisissez d’abord une table sur la roue': 'Choose a table on the wheel first',
  'Indisponible en mode invité': 'Not available in guest mode',
  'Indisponible sur cette borne': 'Not available on this cabinet',
  // La Communauté dans votre téléphone (18/11/2026)
  "La Communauté dans votre téléphone": "The Community on your phone",
  "Joueurs, profils, groupes, parties instantanées, salons, classements et niveau, comme à la borne.": "Players, profiles, groups, instant games, rooms, rankings and level, as on the cabinet.",
  "L’onglet Communauté du téléphone reprend celle de la borne : ouvrez le profil d’un joueur, répondez à une demande d’ami, rejoignez un groupe public, ouvrez une partie instantanée, choisissez votre salon.": "The phone’s Community tab mirrors the cabinet’s: open a player’s profile, answer a friend request, join a public group, open an instant game, pick your room.",
  "Dans Scores : votre niveau et vos badges, les classements de toutes vos tables, et la cloche de l’Activité récente en haut.": "In Scores: your level and badges, the rankings of all your tables, and the recent activity bell at the top.",
};
