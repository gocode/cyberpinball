// Bandeau de la fenêtre « Récupérer » (app/src/acquire-window.ts) : ce qu'il faut
// télécharger, l'état du téléchargement, et quatre boutons ; une ligne de plus sur l'écran
// retenu quand il y a quelque chose à en dire (écran choisi pas branché, playfield tourné) ;
// puis une ligne par téléchargement en cours : barre, pourcentage, volume, débit, temps
// restant et Annuler (le processus principal formate tout, transfer.ts).
const $ = (id) => document.getElementById(id);

/** Lignes affichées, par identifiant de téléchargement : mises à jour sur place, sans tout redessiner. */
const rows = new Map();

function downloadRow(id) {
  let row = rows.get(id);
  if (row) return row;
  const el = document.createElement('div');
  el.className = 'download';
  el.innerHTML =
    '<span class="dl-name"></span><span class="dl-track"><span class="dl-fill"></span></span><span class="dl-pct"></span><span class="dl-text"></span><button type="button" class="dl-cancel"></button>';
  el.querySelector('.dl-cancel').addEventListener('click', () => window.cyberAcquire.cancel(id));
  row = { el, name: el.querySelector('.dl-name'), fill: el.querySelector('.dl-fill'), pct: el.querySelector('.dl-pct'), text: el.querySelector('.dl-text'), cancel: el.querySelector('.dl-cancel') };
  rows.set(id, row);
  return row;
}

function showDownloads(list, more) {
  const box = $('downloads');
  const seen = new Set();
  for (const [index, d] of list.entries()) {
    seen.add(d.id);
    const row = downloadRow(d.id);
    row.name.textContent = d.filename;
    row.name.title = d.filename;
    const known = typeof d.percent === 'number';
    row.el.classList.toggle('unknown', !known);
    row.el.classList.toggle('stalled', d.state !== 'progressing');
    row.el.classList.toggle('armed', Boolean(d.armed));
    row.fill.style.width = known ? `${d.percent}%` : '';
    row.pct.textContent = known ? t('{pct} %', { pct: d.percent }) : '';
    row.text.textContent = d.armed ? t('Start de nouveau : annuler · flippers : un autre · Exit : garder') : d.text;
    row.text.title = d.text;
    row.cancel.textContent = d.armed ? t('Annuler ?') : t('Annuler');
    // Déplacée seulement si l'ordre change : un clic en cours sur Annuler n'est pas perdu.
    if (box.children[index] !== row.el) box.insertBefore(row.el, box.children[index] ?? null);
  }
  for (const [id, row] of rows) {
    if (seen.has(id)) continue;
    row.el.remove();
    rows.delete(id);
  }
  let summary = box.querySelector('.download-more');
  if (more) {
    if (!summary) {
      summary = document.createElement('div');
      summary.className = 'download-more';
    }
    summary.textContent = more;
    if (box.lastElementChild !== summary) box.appendChild(summary);
  } else summary?.remove();
  box.hidden = !list.length && !more;
}

window.cyberAcquire.onState((s) => {
  $('game').textContent = s.game;
  $('expected').textContent = s.expected;
  $('host').textContent = s.host;
  $('status').textContent = s.status;
  $('status').classList.toggle('warn', Boolean(s.warn));
  $('back').disabled = !s.canGoBack;
  $('screen-note').textContent = s.screenNote ?? '';
  $('screen-note').hidden = !s.screenNote;
  document.documentElement.classList.toggle('with-note', Boolean(s.screenNote));
  showDownloads(s.downloads ?? [], s.more);
  // Même hauteur que celle où le processus principal pose la page du site, en dessous.
  if (s.barHeight) document.documentElement.style.setProperty('--bar-height', `${s.barHeight}px`);
});

for (const action of ['back', 'home', 'browser', 'close']) $(action).addEventListener('click', () => window.cyberAcquire.act(action));
window.cyberAcquire.ready();
