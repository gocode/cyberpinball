// Bandeau de la fenêtre « Récupérer » (app/src/acquire-window.ts) : ce qu'il faut
// télécharger, l'état du téléchargement, et quatre boutons ; une ligne de plus sur l'écran
// retenu quand il y a quelque chose à en dire (écran choisi pas branché, playfield tourné) ;
// puis une ligne par téléchargement en cours : barre, pourcentage, volume, débit, temps
// restant et Annuler (le processus principal formate tout, transfer.ts).
// Recherche libre : une ligne de recherche (moteurs, champ prérempli, Chercher) et, sur une
// page vidéo, une ligne qui la décrit, avec « Télécharger cette vidéo » quand c'est possible.
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

/** Moteur choisi dans le bandeau ; celui de la page affichée tant que l'utilisateur n'en a pas choisi d'autre. */
let engine = 'web';
let engineChosen = false;

function showSearch(search) {
  const form = $('search');
  form.hidden = !search;
  if (!search) return;
  if (!engineChosen) engine = search.engine;
  const box = $('engines');
  if (box.childElementCount !== search.engines.length) {
    box.replaceChildren(
      ...search.engines.map((e) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'engine';
        b.dataset.engine = e.id;
        b.textContent = e.label;
        b.setAttribute('role', 'radio');
        b.addEventListener('click', () => {
          engine = e.id;
          engineChosen = true;
          markEngine();
          // Le même texte, sur l'autre moteur.
          if ($('query').value.trim()) window.cyberAcquire.search($('query').value, engine);
        });
        return b;
      }),
    );
  }
  markEngine();
  // Le texte suit la page de résultats affichée, sauf pendant que l'utilisateur le tape.
  if (document.activeElement !== $('query')) $('query').value = search.query;
}

function markEngine() {
  for (const b of $('engines').children) {
    const on = b.dataset.engine === engine;
    b.classList.toggle('on', on);
    b.setAttribute('aria-checked', String(on));
  }
}

$('search').addEventListener('submit', (e) => {
  e.preventDefault();
  if ($('query').value.trim()) window.cyberAcquire.search($('query').value, engine);
  $('query').blur();
});
$('query').addEventListener('focus', () => window.cyberAcquire.typing(true));
$('query').addEventListener('blur', () => window.cyberAcquire.typing(false));
$('video-get').addEventListener('click', () => window.cyberAcquire.video());
// yt-dlp : le son seul ou la vidéo seule d'une page qui ne lit pas de fichier ordinaire.
$('grab-audio').addEventListener('click', () => window.cyberAcquire.grab('audio'));
$('grab-video').addEventListener('click', () => window.cyberAcquire.grab('video'));

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
  // Écran étroit (portrait, 4:3) : les boutons sous le reste, comme le compte le processus principal.
  document.documentElement.classList.toggle('narrow', Boolean(s.narrow));
  showSearch(s.search);
  $('home').textContent = s.search ? t('Retour à la recherche') : t('Retour à la fiche');
  $('home').title = s.search ? t('Retour à la recherche (première page de résultats)') : t('Retour à la fiche (page du fichier sur le site)');
  $('video').hidden = !s.video;
  document.documentElement.classList.toggle('with-search', Boolean(s.search));
  if (s.video) {
    $('video-text').textContent = s.video.text;
    $('video-text').title = s.video.text;
    $('video-hint').textContent = s.video.hint;
    $('video-hint').title = s.video.hint;
    $('video-get').hidden = !s.video.direct;
    const grab = s.video.grab;
    for (const want of ['audio', 'video']) {
      $(`grab-${want}`).hidden = !grab;
      // Le geste attendu pour ce média (le son pour une musique) passe en premier, allumé.
      $(`grab-${want}`).classList.toggle('primary', Boolean(grab && grab.preferred === want));
    }
    if (grab && grab.preferred === 'audio') $('video').insertBefore($('grab-audio'), $('grab-video'));
    else $('video').insertBefore($('grab-video'), $('grab-audio'));
  }
  showDownloads(s.downloads ?? [], s.more);

  // Même hauteur que celle où le processus principal pose la page du site, en dessous.
  if (s.barHeight) document.documentElement.style.setProperty('--bar-height', `${s.barHeight}px`);
});

for (const action of ['back', 'home', 'browser', 'close']) $(action).addEventListener('click', () => window.cyberAcquire.act(action));
window.cyberAcquire.ready();
