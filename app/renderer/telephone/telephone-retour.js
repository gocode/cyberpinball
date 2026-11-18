// Le bouton Retour du téléphone (Android, le geste retour) : il remonte les écrans de la page, comme
// ses propres retours, au lieu de quitter la page. La page n'a qu'une adresse : sans rien, Retour
// sortait du navigateur ou fermait le raccourci de l'écran d'accueil.
//
// Principe : tant qu'il y a où revenir, la page garde une étape d'historique à elle (« garde »).
// Retour la consomme (popstate) : la page fait le retour du moment, puis remet la garde s'il reste
// où revenir. À l'écran de départ, plus de garde : Retour quitte la page, comme avant.
//
// Où revenir, dans l'ordre (le premier qui s'applique) :
// - une feuille ouverte (menu ⋮, réactions…) : elle se ferme ;
// - un fil, un profil, une page plein écran, le lecteur du Juke-box : le retour de la barre du haut ;
// - une rubrique ouverte dans la vue Menus : la rubrique parente ;
// - une playlist ouverte dans le Juke-box : la liste des playlists ;
// - le navigateur de la borne qui peut revenir : sa page précédente ;
// - un écran de la borne qui a son retour (vue Écran) : ce retour, comme si on le touchait ;
// - un autre onglet que l'Écran : l'Écran, l'onglet de départ.
//
// Chrome pour Android ne laisse pas une page piéger Retour : une étape ajoutée sans geste de
// l'utilisateur est sautée. La garde n'est posée qu'une fois la page touchée (liaison acceptée,
// onglet, rubrique), ce qui est toujours le cas ici avant qu'il y ait où revenir.
//
// Plein écran (Android) : Retour y fait d'abord sortir du plein écran, comme le geste « glisser pour
// quitter », dont la page ne peut le distinguer : c'est une sortie voulue (telephone.js), et le Retour
// suivant remonte les écrans.

/** La page est sur sa garde ; une garde est en train d'être retirée (history.back de la page). */
let retourGuarded = false;
let retourDropping = false;

/** Visible à l'écran (pas seulement présent) : un élément d'une vue cachée ne compte pas. */
function retourShown(el) {
  return Boolean(el && !el.hidden && !el.disabled && el.getClientRects().length);
}

/** Le retour du moment, ou undefined à l'écran de départ. */
function retourTarget() {
  const body = document.body;
  if (!document.getElementById('sheet').hidden) return () => closeSheet();
  if (body.dataset.state !== 'paired') return undefined;
  if (body.dataset.mode === 'browser') {
    const back = document.getElementById('nav-back');
    return back.disabled ? undefined : () => back.click();
  }
  const shown = body.dataset.view;
  const top = document.getElementById('top-back');
  if (!top.hidden && ['thread', 'profile', 'page', 'player'].includes(shown)) return () => top.click();
  const up = document.getElementById(shown === 'menus' ? 'menus-up' : shown === 'jukebox' ? 'jb-up' : '');
  if (retourShown(up)) return () => up.click();
  if (shown === 'list') {
    const row = [...document.querySelectorAll('#entries-list .entry.back')].find((b) => retourShown(b) && !b.classList.contains('sent'));
    return row ? () => row.click() : undefined;
  }
  return () => setView('list');
}

/** Pose la garde quand il y a où revenir, la retire sinon. */
function retourSync() {
  if (retourDropping) return;
  const wanted = Boolean(retourTarget());
  if (wanted && !retourGuarded) {
    history.pushState({ cyberRetour: 1 }, '', location.href);
    retourGuarded = true;
  } else if (!wanted && retourGuarded) {
    retourDropping = true;
    history.back();
  }
}

/** Fait le retour du moment (bouton Retour du téléphone). */
function retourGo() {
  const go = retourTarget();
  if (go) go();
}

// La page change son adresse sur l'étape où elle est (clé de session, téléphone gardé) : la garde,
// une fois consommée, laisse l'étape d'avant, dont l'adresse peut être ancienne (la clé du QR).
// L'adresse du moment est donc reportée sur l'étape où l'on revient, et la garde reste reconnaissable
// (page rechargée sur sa garde).
let retourAddress = location.href;
const retourReplace = history.replaceState.bind(history);
history.replaceState = (data, unused, url) => {
  retourReplace(retourGuarded ? { ...(data && typeof data === 'object' ? data : {}), cyberRetour: 1 } : data, unused, url);
  retourAddress = location.href;
};
// Rechargée sur sa garde (onglet rouvert par Android) : la page s'y retrouve.
if (history.state?.cyberRetour) retourGuarded = true;

window.addEventListener('popstate', () => {
  const was = retourGuarded;
  retourGuarded = Boolean(history.state?.cyberRetour);
  if (retourAddress !== location.href) retourReplace(history.state, '', retourAddress);
  if (retourDropping) {
    retourDropping = false;
    retourSync();
    return;
  }
  // Quittée depuis la garde : c'est Retour (même si l'étape d'avant est une ancienne garde, page rechargée).
  if (was) retourGo();
  retourSync();
});

// Tout ce qui ouvre ou ferme un niveau se voit sur ces éléments : la garde les suit.
let retourQueued = false;
const retourObserver = new MutationObserver(() => {
  if (retourQueued) return;
  retourQueued = true;
  queueMicrotask(() => {
    retourQueued = false;
    retourSync();
  });
});
retourObserver.observe(document.body, { attributes: true, attributeFilter: ['data-view', 'data-mode', 'data-state'] });
for (const id of ['sheet', 'top-back', 'menus-up', 'jb-up', 'nav-back']) {
  retourObserver.observe(document.getElementById(id), { attributes: true, attributeFilter: ['hidden', 'disabled'] });
}
retourObserver.observe(document.getElementById('entries-list'), { childList: true });
