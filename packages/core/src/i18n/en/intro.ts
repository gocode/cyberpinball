// Catalogue anglais : ouverture au démarrage (animations de chaque écran, fichiers de l'utilisateur, musique de fond).
// Clé : le texte français tel qu'il est passé à t() ou tn().
export const messages: Record<string, string> = {
  // packages/core/src/intro.ts
  Topper: 'Topper',
  'Afficheur (DMD)': 'Display (DMD)',
  'Afficheur large (FullDMD)': 'Wide display (FullDMD)',
  'Musique de fond': 'Background music',
  'Une étincelle monte, s’embrase au cœur et déploie des fils de lumière, puis la marque se forme':
    'A spark rises, ignites at the core and unfolds threads of light, then the brand takes shape',
  'Le fronton s’allume comme ses lampes à la mise sous tension, puis la marque, lettre par lettre':
    'The backglass lights up like its lamps at power-on, then the brand, letter by letter',
  'Un trait de lumière traverse le topper et y laisse le logo et la marque': 'A streak of light crosses the topper and leaves the logo and the brand',
  'Les points s’allument, la bille traverse l’afficheur, puis la marque en points': 'The dots light up, the ball crosses the display, then the brand in dots',
  'Le cadre de lampes s’allume, la bille traverse l’afficheur, la marque, puis PRESS START': 'The lamp frame lights up, the ball crosses the display, the brand, then PRESS START',
  // app/src/frontend.ts
  'Appuyez sur un bouton pour revenir aux réglages': 'Press a button to go back to the settings',
  'Appuyez sur un bouton pour choisir une table': 'Press a button to choose a table',
  // app/src/menu-settings.ts
  'Ouverture au démarrage : {summary}': 'Startup intro: {summary}',
  'Une animation sur chaque écran, gardée sur sa dernière image jusqu’au premier bouton ; vos images, vidéos et musique de fond (Start : régler)':
    'An animation on each screen, held on its last frame until the first button; your images, videos and background music (Start: set)',
  // app/src/intro-menu.ts
  'votre vidéo « {name} »': 'your video “{name}”',
  'votre image « {name} »': 'your image “{name}”',
  'votre musique « {name} »': 'your music “{name}”',
  'animation de Cyber Pinball': 'Cyber Pinball animation',
  'Jouée en boucle jusqu’au premier bouton, au volume de la musique': 'Played in a loop until the first button, at the music volume',
  '« {name} » gardé, prêt à reprendre': '“{name}” kept, ready to use again',
  'Cette borne n’a pas cet écran : servira s’il est ajouté': 'This cabinet has no such screen: used if one is added',
  'Start : changer': 'Start: change',
  '{screen} : {value}': '{screen}: {value}',
  'Ouverture au démarrage : jouée': 'Startup intro: played',
  'Ouverture au démarrage : coupée': 'Startup intro: off',
  'Chaque écran joue son animation, puis garde sa dernière image ; le premier bouton affiche la roue (Start : couper)':
    'Each screen plays its animation, then holds its last frame; the first button shows the wheel (Start: turn off)',
  'Cyber Pinball s’ouvre droit sur la roue (Start : jouer l’ouverture)': 'Cyber Pinball opens straight on the wheel (Start: play the intro)',
  'Voir l’ouverture': 'Watch the intro',
  'Sur tous les écrans de la borne, tout de suite ; un bouton revient ici': 'On every screen of the cabinet, right now; a button comes back here',
  'Tout revenir aux animations de Cyber Pinball': 'Back to the Cyber Pinball animations everywhere',
  'Sans musique de fond ; vos fichiers restent dans le dossier media de la borne, prêts à reprendre':
    'No background music; your files stay in the cabinet media folder, ready to use again',
  'Animations de Cyber Pinball sur chaque écran, sans musique. Vos fichiers sont gardés.': 'Cyber Pinball animations on every screen, no music. Your files are kept.',
  'Ouverture au démarrage': 'Startup intro',
  'Quand Cyber Pinball s’ouvre, chaque écran joue son animation une fois et garde sa dernière image ; le premier bouton affiche la roue. Remplacez une animation par une image ou une vidéo : celles de Cyber Pinball ne sont jamais effacées.':
    'When Cyber Pinball opens, each screen plays its animation once and holds its last frame; the first button shows the wheel. Replace an animation with an image or a video: the Cyber Pinball ones are never deleted.',
  'Aucune musique de fond': 'No background music',
  'Animation de Cyber Pinball': 'Cyber Pinball animation',
  'Les animations de Cyber Pinball sont muettes ; une vidéo du plateau garde son son': 'The Cyber Pinball animations are silent; a playfield video keeps its sound',
  'Votre fichier : {name}': 'Your file: {name}',
  'gardé ; Start : le reprendre': 'kept; Start: use it again',
  'Choisir une musique…': 'Choose music…',
  'Choisir une image ou une vidéo…': 'Choose an image or a video…',
  'Clé USB, Téléchargements, Bureau, disques ; formats : {formats}': 'USB stick, Downloads, Desktop, drives; formats: {formats}',
  'Indisponible : Cyber Pinball n’a pas de dossier de borne': 'Unavailable: Cyber Pinball has no cabinet folder',
  'Ouverture : {screen}': 'Intro: {screen}',
  'Une musique jouée en boucle pendant l’ouverture, au volume de la musique, jusqu’au premier bouton ; indépendante des animations.':
    'Music played in a loop during the intro, at the music volume, until the first button; independent of the animations.',
  'Une image ou une vidéo, jouée une fois au démarrage ; sa dernière image reste jusqu’au premier bouton. Le fichier est copié dans le dossier media de la borne, sous « {name} ».':
    'An image or a video, played once at startup; its last frame stays until the first button. The file is copied to the cabinet media folder, as “{name}”.',
  'Musique de fond : choisir un fichier': 'Background music: choose a file',
  'Ouverture, {screen} : choisir un fichier': 'Intro, {screen}: choose a file',
  'Ouverture au démarrage : {screen}': 'Startup intro: {screen}',
  '{screen} : « {name} » choisi pour l’ouverture.': '{screen}: “{name}” chosen for the intro.',
  'Fichier non copié : {message}': 'File not copied: {message}',
  coupée: 'off',
  'jouée, {n} fichier à vous': 'played, {n} file of yours',
  'jouée, {n} fichiers à vous': 'played, {n} files of yours',
  jouée: 'played',
};
