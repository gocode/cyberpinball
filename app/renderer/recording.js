// Témoin de l'enregistrement d'une partie (game-recording.ts) : la pastille vue du joueur, tournée
// comme la mise en page du plateau. L'état (gamerecording.ts, recordingIndicator) arrive du
// processus principal, textes déjà traduits.

const witness = document.getElementById('witness');
const sign = document.getElementById('sign');
const label = document.getElementById('label');
const time = document.getElementById('time');
const SIGNS = { waiting: '', recording: '', done: '✓', short: '!', failed: '!' };

function render(state) {
  const indicator = state?.indicator;
  if (!indicator || !Object.hasOwn(SIGNS, indicator.state)) {
    witness.hidden = true;
    return;
  }
  const rotation = Number(state.rotation);
  // Accepte aussi -90 et 450 : mêmes dimensions que 270 et 90.
  const turn = Number.isFinite(rotation) ? ((rotation % 360) + 360) % 360 : 0;
  const quarter = turn === 90 || turn === 270;
  // Taille vue du joueur : la fenêtre est couchée quand le plateau l'est.
  const w = quarter ? window.innerHeight : window.innerWidth;
  const h = quarter ? window.innerWidth : window.innerHeight;
  witness.style.setProperty('--w', `${w}px`);
  witness.style.setProperty('--h', `${h}px`);
  witness.style.setProperty('--turn', `${turn}deg`);
  const className = `witness state-${indicator.state}`;
  if (witness.className !== className) witness.className = className;
  sign.textContent = SIGNS[indicator.state];
  label.textContent = indicator.label ?? '';
  time.textContent = indicator.state === 'recording' ? (indicator.time ?? '') : '';
  const progress = Number(indicator.progress ?? 0);
  const bounded = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
  witness.style.setProperty('--progress', `${Math.round(bounded * 1000) / 10}%`);
  witness.hidden = false;
}

let last;
// La durée du verdict (3 s), la capture et le clic traversant restent gérés par le main.
window.addEventListener('resize', () => render(last));
window.cyberRecording?.onState((state) => {
  last = state;
  render(state);
});
window.cyberRecording?.ready();
// Pour les démonstrations : ce que montre le témoin.
window.cyberEtat = () => ({ temoin: witness.hidden ? null : { etat: witness.className, texte: witness.innerText.replace(/\s+/g, ' ').trim() } });
