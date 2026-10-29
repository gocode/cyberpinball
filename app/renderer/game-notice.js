// Notification pendant la partie (game-notice.ts) : l'invitation d'un ami, vue du joueur, tournée
// comme la mise en page du plateau. Carte entière, puis pastille ; ce qu'elle montre
// (gamenotice.ts, gameNoticeView) arrive du processus principal, textes déjà traduits.

const frame = document.getElementById('frame');
const notice = document.getElementById('notice');
const parts = Object.fromEntries(['title', 'table', 'left', 'hint'].map((id) => [id, document.getElementById(id)]));
document.getElementById('icon').append(cyberIcon('gamepad'));

function render(state) {
  const view = state?.view;
  if (!view || (view.mode !== 'full' && view.mode !== 'compact')) {
    notice.hidden = true;
    return;
  }
  const rotation = Number(state.rotation);
  // Accepte aussi -90 et 450 : mêmes dimensions que 270 et 90.
  const turn = Number.isFinite(rotation) ? ((rotation % 360) + 360) % 360 : 0;
  const quarter = turn === 90 || turn === 270;
  // Cadre vu du joueur : la fenêtre est couchée quand le plateau l'est ; la carte se pose dans son coin haut-gauche.
  frame.style.setProperty('--w', `${quarter ? window.innerHeight : window.innerWidth}px`);
  frame.style.setProperty('--h', `${quarter ? window.innerWidth : window.innerHeight}px`);
  frame.style.setProperty('--turn', `${turn}deg`);
  const className = `notice mode-${view.mode}`;
  if (notice.className !== className) notice.className = className;
  parts.title.textContent = view.mode === 'full' ? view.title : view.short;
  parts.table.textContent = view.table ?? '';
  parts.left.textContent = view.left ?? '';
  parts.hint.textContent = view.hint ?? '';
  const progress = Number(view.progress ?? 0);
  const bounded = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
  notice.style.setProperty('--progress', `${Math.round(bounded * 1000) / 10}%`);
  notice.hidden = false;
}

let last;
window.addEventListener('resize', () => render(last));
window.cyberNotice?.onState((state) => {
  last = state;
  render(state);
});
// Pour les démonstrations : ce que montre la notification.
window.cyberEtat = () => ({ notification: notice.hidden ? null : { mode: notice.className, texte: notice.innerText.replace(/\s+/g, ' ').trim() } });
