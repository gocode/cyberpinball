// Catalogue anglais : compte YouTube du Juke-box (connexion dans Microsoft Edge, playlists du compte, recherche, lien tapé au clavier). Clé : le texte français tel qu'il est passé à t() ou tn().
export const messages: Record<string, string> = {
  // packages/core/src/youtube-account.ts
  'Vidéos « J’aime »': 'Liked videos',
  'À regarder plus tard': 'Watch later',

  // app/src/youtube-account.ts
  'Compte YouTube': 'YouTube account',
  'Ouvrez une playlist ou une vidéo, puis « Ajouter au Juke-box »': 'Open a playlist or a video, then “Add to the Juke-box”',
  'Ouvrez une playlist ou une vidéo, puis « Ajouter au Juke-box » : l’import du Juke-box s’ouvre sur ce lien.': 'Open a playlist or a video, then “Add to the Juke-box”: the Juke-box import opens on that link.',

  // app/src/catalog.ts
  'YouTube (Juke-box)': 'YouTube (Juke-box)',

  // app/src/library.ts
  'Effacer encore une fois pour retirer le début du lien': 'Delete once more to remove the start of the link',

  // app/src/jukebox-menu.ts
  'Taper ou coller un lien': 'Type or paste a link',
  'Au clavier, on ne tape que l’identifiant de la playlist ; au téléphone, collez le lien entier': 'On the keyboard, type only the playlist ID; on the phone, paste the whole link',
  'Mes playlists YouTube': 'My YouTube playlists',
  'Chercher sur YouTube': 'Search YouTube',
  'Dans « Récupérer », puis « Ajouter au Juke-box » sur la playlist ou la vidéo': 'In “Get”, then “Add to the Juke-box” on the playlist or video',
  'Tapez l’identifiant de la playlist (PL…, OLAK5uy_…), ou collez le lien entier avec Ctrl+V. Dans YouTube : Partager, puis Copier le lien.': 'Type the playlist ID (PL…, OLAK5uy_…), or paste the whole link with Ctrl+V. In YouTube: Share, then Copy link.',
  'Playlists à chercher': 'Playlists to look for',
  '« Récupérer » est ouvert sur YouTube : « Ajouter au Juke-box » sur une playlist ou une vidéo ramène à l’import.': '“Get” is open on YouTube: “Add to the Juke-box” on a playlist or a video brings you back to the import.',
  'Un artiste, un genre, une ambiance. Les résultats ne montrent que des playlists.': 'An artist, a genre, a mood. The results show playlists only.',
  'Lien YouTube, ou identifiant de la playlist': 'YouTube link, or playlist ID',
  'Vos playlists, privées comprises': 'Your playlists, private ones included',
  'Lecture de vos playlists…': 'Reading your playlists…',
  'Playlist personnelle': 'Personal playlist',
  'Playlist de votre compte YouTube': 'Playlist from your YouTube account',
  'Lien tapé ou collé au clavier': 'Link typed or pasted on the keyboard',
  'importer': 'import',

  // Connexion dans Microsoft Edge (packages/core/src/youtube-account.ts, app/src/youtube-account.ts)
  'Google refuse la connexion dans le navigateur intégré : connectez-vous dans Microsoft Edge (gestion du Juke-box > « Compte YouTube » > « Se connecter à YouTube »).':
    'Google refuses sign-in in the built-in browser: sign in with Microsoft Edge (Juke-box management > “YouTube account” > “Sign in to YouTube”).',
  'Microsoft Edge est introuvable sur ce PC : il sert à se connecter à YouTube. Installez-le depuis microsoft.com/edge, puis réessayez.':
    'Microsoft Edge cannot be found on this PC: it is used to sign in to YouTube. Install it from microsoft.com/edge, then try again.',
  'Compte YouTube pas connecté': 'YouTube account not signed in',
  'YouTube ne reconnaît plus la connexion : reconnectez-vous dans Edge': 'YouTube no longer recognises the sign-in: sign in again in Edge',
  'Edge refermé sans connexion à YouTube : rien n’a été gardé.': 'Edge closed without a YouTube sign-in: nothing was kept.',
  'Playlist personnelle de votre compte YouTube : connectez le compte (Gestion du Juke-box, Compte YouTube)': 'Personal playlist of your YouTube account: sign the account in (Juke-box management, YouTube account)',
  'Playlist privée : connectez le compte YouTube qui la possède, ou rendez-la publique ou non répertoriée': 'Private playlist: sign in the YouTube account that owns it, or make it public or unlisted',

  // app/src/jukebox-menu.ts : écrans du compte
  'Connexion en cours dans Microsoft Edge': 'Signing in with Microsoft Edge',
  'Vérification de la connexion…': 'Checking the sign-in…',
  'Connecté : vos playlists privées, « J’aime » et « À regarder plus tard » sont accessibles': 'Signed in: your private playlists, “Liked videos” and “Watch later” are available',
  'Pas connecté : vos playlists privées, « J’aime » et « À regarder plus tard » restent inaccessibles': 'Not signed in: your private playlists, “Liked videos” and “Watch later” stay out of reach',
  'Pas de connexion à YouTube': 'No YouTube sign-in',
  'Compte YouTube connecté': 'YouTube account signed in',
  'Se reconnecter': 'Sign in again',
  'Rouvre Microsoft Edge, si YouTube ne reconnaît plus la connexion ou pour changer de compte': 'Opens Microsoft Edge again, if YouTube no longer recognises the sign-in or to switch accounts',
  'Se déconnecter': 'Sign out',
  'Efface la connexion gardée par Cyber Pinball (le profil d’Edge du Juke-box)': 'Erases the sign-in kept by Cyber Pinball (the Juke-box’s Edge profile)',
  'Se connecter à YouTube': 'Sign in to YouTube',
  'Microsoft Edge s’ouvre sur l’écran des navigateurs : connectez-vous, puis fermez-le': 'Microsoft Edge opens on the browser screen: sign in, then close it',
  'La connexion se fait dans Microsoft Edge, comme sur n’importe quel PC : Cyber Pinball ne voit jamais votre mot de passe et ne garde que la connexion.':
    'You sign in with Microsoft Edge, as on any PC: Cyber Pinball never sees your password and only keeps the sign-in.',
  'Déconnecté : la connexion gardée par Cyber Pinball est effacée.': 'Signed out: the sign-in kept by Cyber Pinball is erased.',
  'Edge est ouvert sur l’écran « {screen} ».': 'Edge is open on the “{screen}” screen.',
  'Edge est ouvert sur l’écran des navigateurs.': 'Edge is open on the browser screen.',
  'Fermeture d’Edge et lecture de la connexion…': 'Closing Edge and reading the sign-in…',
  'Connectez-vous à YouTube avec votre compte Google, puis fermez Edge.': 'Sign in to YouTube with your Google account, then close Edge.',
  'Au téléphone': 'On the phone',
  'Le pavé tactile est la souris d’Edge, le clavier y tape.': 'The touchpad is Edge’s mouse, the keyboard types into it.',
  'Avec les boutons de la borne': 'With the cabinet buttons',
  'Flippers : champ précédent ou suivant · Start : Entrée · Exit : fermer Edge': 'Flippers: previous or next field · Start: Enter · Exit: close Edge',
  'J’ai fini': 'I’m done',
  'Ferme Edge et garde la connexion': 'Closes Edge and keeps the sign-in',
  'Ramener Edge devant': 'Bring Edge to the front',
  'Dans Microsoft Edge': 'With Microsoft Edge',
  'Compte YouTube connecté.': 'YouTube account signed in.',
  'Avec la connexion gardée, en lecture seule. Rien n’est téléchargé.': 'With the kept sign-in, read-only. Nothing is downloaded.',

  'Compte YouTube pas connecté : « Compte YouTube », puis « Se connecter à YouTube »': 'YouTube account not signed in: “YouTube account”, then “Sign in to YouTube”',
  'Privées, « J’aime » et « À regarder plus tard » comprises': 'Private ones, “Liked videos” and “Watch later” included',

  // app/src/library.ts : la télécommande dans Edge
  'Connexion à YouTube': 'YouTube sign-in',
  'J’ai fini : fermer Edge': 'I’m done: close Edge',

  // app/src/catalog.ts, app/src/acquire-window.ts
  'connecté dans Edge': 'signed in with Edge',
  'Ses playlists, ou se déconnecter': 'Its playlists, or sign out',
  'Se connecter dans Microsoft Edge, sur l’écran des navigateurs': 'Sign in with Microsoft Edge, on the browser screen',
  'Compte YouTube (Juke-box)': 'YouTube account (Juke-box)',
  'Vos playlists YouTube, privées comprises : connectez-vous dans Microsoft Edge, depuis le compte YouTube du Juke-box.': 'Your YouTube playlists, private ones included: sign in with Microsoft Edge, from the Juke-box YouTube account.',
};
