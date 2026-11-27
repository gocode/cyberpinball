// Plein écran de la page du téléphone : plus de barre d'adresse ni de barre d'onglets, pour que la
// télécommande prenne toute la place de l'écran. Fixé par telephone-plein-ecran.test.ts.
//
// Ce qui existe, et pourquoi, selon le téléphone :
//
// - iPhone (Safari) : aucun plein écran à la demande (l'API n'existe que pour les vidéos). Seul le
//   raccourci de l'écran d'accueil ouvre la page sans barres, grâce à apple-mobile-web-app-capable
//   (telephone.html). Pas de manifeste : avec lui, iOS lancerait son adresse de départ et non celle
//   du raccourci, qui porte la clé du téléphone gardé (#g=…) ; et l'application de l'écran d'accueil
//   a un stockage à part de Safari, que seule cette clé dans l'adresse alimente. La page ne peut
//   donc qu'expliquer comment faire (homeScreenHow).
// - Android (Chrome) : le raccourci d'une page HTTP s'ouvre dans un onglet, barre d'adresse comprise ;
//   seule une page HTTPS installable avec manifeste s'ouvre en vrai mode application, et la page de la
//   borne est en HTTP sur le réseau local (sans certificat que le téléphone accepte). Reste le plein
//   écran de l'API Fullscreen : demandé au premier toucher (elle exige un geste), et de nouveau après
//   une sortie subie (autre application, écran verrouillé : la page passe en arrière-plan). Quitté
//   exprès (le geste « glisser pour quitter » de Chrome, ou « Quitter le plein écran » du menu ⋮), il
//   n'est plus repris de lui-même : le menu ⋮ le rend. Chrome montre son propre avertissement à chaque
//   entrée, que la page ne peut ni masquer ni remplacer : d'où une demande aussi rare que possible.
//   Le toucher fait aussi ce qu'il touche : la demande part au relâchement, sans rien empêcher. Android
//   n'accorde le verrou d'orientation (miroir) qu'en plein écran : telephone-miroir.js le reprend à
//   chaque entrée (événement fullscreenchange).
// - Ailleurs (ordinateur, autre navigateur) : le plein écran à la demande, si le navigateur l'a.
//
// La hauteur suit la zone visible (fit, telephone.js) : rien ne saute, le clavier du téléphone et les
// feuilles restent utilisables. Jamais dans Electron (les essais chargent la vraie page dans des
// fenêtres hors écran : un vrai plein écran les montrerait), sauf essai qui le simule
// (window.cyberFullscreenTest).

const CyberScreen = (() => {
  /** Plein écran quitté exprès : plus repris au toucher (gardé d'une visite à l'autre). */
  const STORE = 'cyberpinball.plein-ecran';

  const read = () => {
    try {
      return localStorage.getItem(STORE) ?? '';
    } catch {
      return '';
    }
  };
  const write = (value) => {
    try {
      if (value) localStorage.setItem(STORE, value);
      else localStorage.removeItem(STORE);
    } catch {
      // Stockage refusé (navigation privée) : la préférence ne dure que cette visite.
    }
  };

  /** Le navigateur a refusé la demande (réglage, page sans geste) : plus redemandé pendant cette visite. */
  let refused = false;
  let off = read() === 'non';
  /** Sortie du plein écran : subie si la page passe en arrière-plan juste après (autre application), sinon voulue. */
  let leavingOnPurpose = false;
  let hiddenAfterExit = false;
  let exitTimer;

  /** 'ios' (iPhone, iPad), 'android' ou 'other'. */
  function platform() {
    const ua = navigator.userAgent ?? '';
    if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
    if (/Android/.test(ua)) return 'android';
    return 'other';
  }

  /** Ouverte depuis l'écran d'accueil (sans barres), plutôt que dans un onglet. */
  function standalone() {
    return window.matchMedia?.('(display-mode: standalone)').matches === true || navigator.standalone === true;
  }

  /** Le navigateur a l'API de plein écran, et rien n'en empêche l'usage (Electron : jamais, sauf essai). */
  function supported() {
    if (/Electron\//.test(navigator.userAgent) && !window.cyberFullscreenTest) return false;
    return Boolean(document.fullscreenEnabled && typeof document.documentElement.requestFullscreen === 'function');
  }

  /** Le plein écran est utile ici et possible (pas déjà sans barres, pas refusé). */
  function possible() {
    return !refused && !standalone() && supported();
  }

  const active = () => Boolean(document.fullscreenElement);

  /** Comment ajouter la page à l'écran d'accueil, selon le téléphone. */
  function homeScreenHow() {
    const kind = platform();
    if (kind === 'ios') return t('Dans Safari : touche Partager (ou ⋯), puis « Sur l’écran d’accueil ». Si Safari propose « Ouvrir comme app web », laisse-le activé : c’est ce qui enlève les barres.');
    if (kind === 'android') {
      const how = t('Dans le menu du navigateur (⋮) : « Ajouter à l’écran d’accueil ».');
      // Le raccourci s'ouvre dans un onglet : le plein écran vient au premier toucher.
      return supported() ? `${how} ${t('La télécommande passe en plein écran au premier toucher.')}` : how;
    }
    return t('Dans le menu du navigateur : « Ajouter à l’écran d’accueil ».');
  }

  function setOff(value) {
    off = value;
    write(value ? 'non' : '');
  }

  /** Reste à demander : pas quitté exprès, pas déjà en plein écran, possible. */
  const wanted = () => !off && !active() && possible();

  /** Demande le plein écran (au geste de l'utilisateur) ; le champ qui a le clavier le garde. */
  function ask() {
    if (!wanted()) return;
    const focused = document.activeElement;
    Promise.resolve(document.documentElement.requestFullscreen({ navigationUI: 'hide' }))
      .then(() => {
        if (focused instanceof HTMLElement && focused !== document.body && document.activeElement !== focused) focused.focus({ preventScroll: true });
      })
      .catch(() => {
        refused = true;
      });
  }

  /** Le menu ⋮ : entrer en plein écran (et le garder), ou le quitter (et ne plus le reprendre). */
  function toggle() {
    if (active()) {
      leavingOnPurpose = true;
      setOff(true);
      void Promise.resolve(document.exitFullscreen?.()).catch(() => undefined);
      return;
    }
    setOff(false);
    refused = false;
    ask();
  }

  document.addEventListener('fullscreenchange', () => {
    if (active()) return;
    clearTimeout(exitTimer);
    if (leavingOnPurpose || document.visibilityState === 'hidden') {
      leavingOnPurpose = false;
      return;
    }
    hiddenAfterExit = false;
    // Sortie sans que la page ait quitté l'écran : voulue (geste de Chrome), donc plus reprise.
    exitTimer = setTimeout(() => {
      if (!hiddenAfterExit) setOff(true);
    }, 700);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') hiddenAfterExit = true;
  });
  document.addEventListener('pointerup', ask, { capture: true, passive: true });

  return { platform, standalone, supported, possible, active, homeScreenHow, ask, toggle, isOff: () => off };
})();
