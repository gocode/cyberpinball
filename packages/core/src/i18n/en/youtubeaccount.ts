// Catalogue anglais : compte YouTube du Juke-box (connexion, playlists du compte, recherche, lien tapé au clavier). Clé : le texte français tel qu'il est passé à t() ou tn().
export const messages: Record<string, string> = {
  // packages/core/src/youtube-account.ts
  'Vidéos « J’aime »': 'Liked videos',
  'À regarder plus tard': 'Watch later',
  '{browser} garde ses cookies tant qu’il est ouvert : fermez-le complètement, puis réessayez': '{browser} keeps its cookies locked while it is open: close it completely, then try again',
  '{browser} chiffre ses cookies d’une façon que yt-dlp ne sait pas lire : prenez Firefox, ou connectez-vous dans « Récupérer »': '{browser} encrypts its cookies in a way yt-dlp cannot read: use Firefox, or sign in from “Get”',
  '{browser} n’est pas installé sur ce PC, ou n’a pas encore de profil': '{browser} is not installed on this PC, or has no profile yet',
  '{browser} n’a rien donné': '{browser} gave nothing',

  // app/src/youtube-account.ts
  'Compte YouTube pas connecté': 'YouTube account not signed in',
  'YouTube ne reconnaît plus la connexion : reconnectez le compte': 'YouTube no longer recognises the sign-in: sign the account in again',
  'Pas de connexion à YouTube dans {browser} : connectez-vous à YouTube dans {browser}, fermez-le, puis réessayez': 'No YouTube sign-in found in {browser}: sign in to YouTube in {browser}, close it, then try again',
  'Compte YouTube': 'YouTube account',
  'Connectez-vous à votre compte Google, puis Fermer (Échap) : le Juke-box lit vos playlists': 'Sign in to your Google account, then Close (Esc): the Juke-box reads your playlists',
  'youtube.com · votre propre compte': 'youtube.com · your own account',
  'Ouvrez une playlist ou une vidéo, puis « Ajouter au Juke-box »': 'Open a playlist or a video, then “Add to the Juke-box”',
  'Ouvrez une playlist ou une vidéo, puis « Ajouter au Juke-box » : l’import du Juke-box s’ouvre sur ce lien.': 'Open a playlist or a video, then “Add to the Juke-box”: the Juke-box import opens on that link.',

  // app/src/jukebox-library.ts
  'Playlist personnelle de votre compte YouTube : connectez le compte (Gestion du Juke-box, Compte YouTube)': 'Personal playlist of your YouTube account: sign the account in (Juke-box management, YouTube account)',
  'Playlist privée : connectez le compte YouTube qui la possède, ou rendez-la publique ou non répertoriée': 'Private playlist: sign in the YouTube account that owns it, or make it public or unlisted',

  // app/src/catalog.ts
  'YouTube (Juke-box)': 'YouTube (Juke-box)',
  'connecté': 'signed in',
  'Efface la connexion à YouTube et à Google gardée par Cyber Pinball': 'Clears the YouTube and Google sign-in kept by Cyber Pinball',
  'Pour importer vos playlists dans le Juke-box, privées comprises': 'To import your playlists into the Juke-box, private ones included',

  // app/src/library.ts
  'Effacer encore une fois pour retirer le début du lien': 'Delete once more to remove the start of the link',

  // app/src/jukebox-menu.ts
  'Taper ou coller un lien': 'Type or paste a link',
  'Au clavier, on ne tape que l’identifiant de la playlist ; au téléphone, collez le lien entier': 'On the keyboard, type only the playlist ID; on the phone, paste the whole link',
  'Mes playlists YouTube': 'My YouTube playlists',
  'Privées, « J’aime » et « À regarder plus tard » comprises': 'Private ones, “Liked videos” and “Watch later” included',
  'Chercher sur YouTube': 'Search YouTube',
  'Dans « Récupérer », puis « Ajouter au Juke-box » sur la playlist ou la vidéo': 'In “Get”, then “Add to the Juke-box” on the playlist or video',
  'Tapez l’identifiant de la playlist (PL…, OLAK5uy_…), ou collez le lien entier avec Ctrl+V. Dans YouTube : Partager, puis Copier le lien.': 'Type the playlist ID (PL…, OLAK5uy_…), or paste the whole link with Ctrl+V. In YouTube: Share, then Copy link.',
  'Playlists à chercher': 'Playlists to look for',
  '« Récupérer » est ouvert sur YouTube : « Ajouter au Juke-box » sur une playlist ou une vidéo ramène à l’import.': '“Get” is open on YouTube: “Add to the Juke-box” on a playlist or a video brings you back to the import.',
  'Un artiste, un genre, une ambiance. Les résultats ne montrent que des playlists.': 'An artist, a genre, a mood. The results show playlists only.',
  'Pas connecté : vos playlists privées, « J’aime » et « À regarder plus tard » restent inaccessibles': 'Not signed in: your private playlists, “Liked videos” and “Watch later” stay out of reach',
  'Connecté : {name}': 'Signed in: {name}',
  '{who} · connexion gardée jusqu’au {date}': '{who} · sign-in kept until {date}',
  'Compte YouTube connecté': 'YouTube account signed in',
  'Se déconnecter': 'Sign out',
  'Se connecter à YouTube': 'Sign in to YouTube',
  'La page de Google s’ouvre dans « Récupérer » : fermez-la une fois connecté': 'Google’s page opens in “Get”: close it once signed in',
  'Lien YouTube, ou identifiant de la playlist': 'YouTube link, or playlist ID',
  'Choisir un navigateur': 'Choose a browser',
  'Utiliser la connexion d’un navigateur': 'Use a browser’s sign-in',
  'Si Google refuse la connexion : un navigateur de ce PC déjà connecté à YouTube': 'If Google refuses the sign-in: a browser on this PC already signed in to YouTube',
  'Vos playlists, privées comprises': 'Your playlists, private ones included',
  'Cyber Pinball ne voit ni ne garde votre mot de passe : la connexion reste dans le navigateur intégré, comme pour les sites des tables.': 'Cyber Pinball neither sees nor keeps your password: the sign-in stays in the built-in browser, as for the table sites.',
  'Connexion ouverte dans « Récupérer » : fermez la fenêtre une fois connecté, l’état se met à jour.': 'Sign-in open in “Get”: close the window once signed in, the status updates.',
  'Compte YouTube déconnecté : ses cookies sont effacés de Cyber Pinball.': 'YouTube account signed out: its cookies are cleared from Cyber Pinball.',
  'Connecté à YouTube : {name}.': 'Signed in to YouTube: {name}.',
  'Connecté à YouTube.': 'Signed in to YouTube.',
  'Lecture de la connexion…': 'Reading the sign-in…',
  'Conseillé : celui dont yt-dlp lit le plus sûrement les cookies': 'Recommended: the one whose cookies yt-dlp reads most reliably',
  'Fermez-le d’abord complètement': 'Close it completely first',
  'Connexion pas reprise': 'Sign-in not taken',
  'Navigateur où vous êtes connecté à YouTube': 'Browser where you are signed in to YouTube',
  'Seuls les cookies de YouTube et de Google sont repris, dans la session du navigateur intégré ; aucun mot de passe. Le fichier intermédiaire est effacé aussitôt.': 'Only the YouTube and Google cookies are taken, into the built-in browser’s session; no password. The intermediate file is deleted at once.',
  'Lecture de vos playlists…': 'Reading your playlists…',
  'Par yt-dlp, avec la connexion du compte. Rien n’est téléchargé.': 'By yt-dlp, with the account’s sign-in. Nothing is downloaded.',
  'Playlist personnelle': 'Personal playlist',
  'Playlist de votre compte YouTube': 'Playlist from your YouTube account',
  'Lien tapé ou collé au clavier': 'Link typed or pasted on the keyboard',
  'importer': 'import',
};
