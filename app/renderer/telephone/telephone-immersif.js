// Mode immersif de la télécommande, au navigateur : un bouton de la barre du haut masque la barre du
// haut et la barre d'outils pour donner tout l'écran au pavé ou au miroir ; une poignée au bas de
// l'écran les ramène. Rien n'est retenu : à chaque ouverture de la page, les barres sont là.
//
// Tout est dans le CSS (body.immersive, limité au navigateur une fois la liaison acceptée). Ce fichier ne fait
// que poser la classe, les libellés, et la retirer quand la page quitte le navigateur ou perd la liaison :
// au retour, les barres sont là. La taille du pavé ou du miroir change : le miroir redemande tout seul
// une image à la bonne taille (ResizeObserver de telephone-miroir.js).
//
// Chargé avant telephone.js : il n'utilise que t() et cyberIcon(), qui viennent de scripts plus anciens.
'use strict';

const immersive = {
  button: document.getElementById('top-immersive'),
  handle: document.getElementById('immersive-handle'),
};

/** Les barres sont masquées ? */
function immersiveOn() {
  return document.body.classList.contains('immersive');
}

/** Pose le mode (ou le retire) et met les boutons d'accord. */
function immersiveSet(on) {
  document.body.classList.toggle('immersive', on);
  immersive.button.setAttribute('aria-pressed', String(on));
}

/** Mode et liaison où le mode a un sens : le navigateur de la borne, liaison acceptée. */
function immersiveAllowed() {
  return document.body.dataset.mode === 'browser' && document.body.dataset.state === 'paired';
}

{
  const hide = t('Masquer les barres');
  immersive.button.replaceChildren(cyberIcon('frame'));
  immersive.button.title = hide;
  immersive.button.setAttribute('aria-label', hide);
  const show = t('Afficher les barres');
  immersive.handle.title = show;
  immersive.handle.setAttribute('aria-label', show);
}

immersive.button.addEventListener('click', () => immersiveSet(!immersiveOn()));
immersive.handle.addEventListener('click', () => immersiveSet(false));

// Hors navigateur, ou liaison perdue : les barres reviennent (le CSS ne masque rien ailleurs, mais la classe ne doit pas rester).
if (typeof MutationObserver === 'function') {
  new MutationObserver(() => {
    if (immersiveOn() && !immersiveAllowed()) immersiveSet(false);
  }).observe(document.body, { attributes: true, attributeFilter: ['data-mode', 'data-state'] });
}
