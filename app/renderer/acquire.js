// Bandeau de la fenêtre « Récupérer » (app/src/acquire-window.ts) : ce qu'il faut
// télécharger, l'état du téléchargement, et quatre boutons.
const $ = (id) => document.getElementById(id);

window.cyberAcquire.onState((s) => {
  $('game').textContent = s.game;
  $('expected').textContent = s.expected;
  $('host').textContent = s.host;
  $('status').textContent = s.status;
  $('status').classList.toggle('warn', Boolean(s.warn));
  $('back').disabled = !s.canGoBack;
});

for (const action of ['back', 'home', 'browser', 'close']) $(action).addEventListener('click', () => window.cyberAcquire.act(action));
window.cyberAcquire.ready();
