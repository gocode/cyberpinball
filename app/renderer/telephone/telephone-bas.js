// Un fil de discussion du téléphone (messages privés, groupes, salons, fil en partie) se lit en bas :
// on y arrive sur les derniers messages, comme dans toute messagerie.
//
// Le 19/11/2026, les fils s'ouvraient tout en haut, sur les plus anciens. Chaque dessin mesurait
// alors « étais-je en bas ? » et ne descendait qu'au premier dessin d'un fil. Or un fil dessiné
// caché (l'onglet n'est pas encore montré, la borne envoie avant) n'a pas de hauteur : rien ne
// défile, et le dessin suivant se croit « en haut, voulu ». Un onglet quitté puis repris perd aussi
// sa position (le navigateur la remet à zéro sur un élément caché).
//
// La règle tient donc à l'état « je suis le bas », suivi aux gestes, pas à une mesure au moment du
// dessin : un fil nouveau, ou montré de nouveau, est en bas ; il y reste à chaque dessin et à chaque
// changement de taille (clavier ouvert, écran tourné) ; il cesse de suivre quand l'utilisateur
// remonte lire, et reprend quand il revient en bas. Fixé par fils-en-bas.test.ts.

const CyberBottom = (() => {
  /** Écart (px) sous lequel la liste est « en bas ». */
  const SLACK = 40;
  const states = new WeakMap();
  const atEnd = (list) => list.scrollHeight - list.scrollTop - list.clientHeight < SLACK;
  const toEnd = (list) => {
    list.scrollTop = list.scrollHeight;
  };

  /** L'état de `list`, posé au premier dessin avec ses écoutes. */
  function stateOf(list) {
    let s = states.get(list);
    if (s) return s;
    s = { key: undefined, follow: true, shown: list.clientHeight > 0 };
    states.set(list, s);
    // Un geste de l'utilisateur : remonté, le fil ne le ramène plus ; revenu en bas, il suit de nouveau.
    // Caché, la position retombe à zéro sans geste : ignorée.
    list.addEventListener(
      'scroll',
      () => {
        if (list.clientHeight > 0) s.follow = atEnd(list);
      },
      { passive: true },
    );
    // Montré de nouveau (onglet repris, retour d'un profil) : on y arrive, donc en bas. Taille changée
    // pendant qu'on suit (clavier, rotation) : toujours en bas.
    if (typeof ResizeObserver === 'function') {
      new ResizeObserver(() => {
        const shown = list.clientHeight > 0;
        if (shown && !s.shown) s.follow = true;
        s.shown = shown;
        if (shown && s.follow) toEnd(list);
      }).observe(list);
    }
    return s;
  }

  return {
    /** Après chaque dessin du fil `key` dans `list` : un autre fil s'ouvre en bas ; le même y reste s'il suivait. */
    settle(list, key) {
      const s = stateOf(list);
      if (s.key !== key) {
        s.key = key;
        s.follow = true;
      }
      if (s.follow) toEnd(list);
    },
    /** Le fil est rouvert (même clé) : en bas au prochain dessin. */
    reset(list) {
      const s = stateOf(list);
      s.key = undefined;
      s.follow = true;
    },
  };
})();

if (typeof module === 'object') module.exports = { CyberBottom };
