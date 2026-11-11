// Juke-box de la page du téléphone (telephone.js) : le lecteur de la borne, comme à la borne. La
// borne (app/src/jukebox-player.ts, remoteView ; frontend.ts, remoteJukebox) envoie toute la liste du
// niveau affiché, mise en forme et traduite : les playlists (mosaïque de pochettes, nombre de
// morceaux, sources), ou les morceaux de la playlist ouverte (pochette, artiste, durée, la raison
// d'un morceau pas encore lisible), et le morceau en cours. Les images arrivent sous jeton, réduites
// par la borne. La page ne fait que dessiner et renvoyer des commandes (« jb ») : une ligne touchée,
// lire, remonter, pause, aléatoire, répétition, avancer dans le morceau, précédent, suivant, la
// gestion. Parcourir ici déplace aussi la sélection à la borne : c'est le même lecteur.
//
// « Gérer » ouvre la gestion à la borne ; ses écrans se touchent dans l'onglet Écran. Le mini-lecteur
// suit le morceau en cours au-dessus des onglets et ouvre le lecteur déplié. Le temps du morceau
// arrive à part (« jb-time ») : la page l'avance seule, la borne ne le renvoie qu'en cas d'écart.
//
// Chargé avant telephone.js : ses fonctions servent quand la page vit (send, setView, showEmpty,
// renderTop, state et mode sont ceux de telephone.js).
'use strict';

const jb = {
  data: undefined,
  /** Le temps du morceau en cours, et quand il a été reçu. */
  time: undefined,
  /** Le curseur de la barre de progression est tenu : il ne suit plus le temps. */
  seeking: false,
};

const jbEl = (id) => document.getElementById(id);
jbEl('jb-listen').replaceChildren(Object.assign(document.createElement('span'), { className: 'seg-label', textContent: t('Écouter') }));
jbEl('jb-manage').replaceChildren(Object.assign(document.createElement('span'), { className: 'seg-label', textContent: t('Gérer') }));
jbEl('jb-up').replaceChildren(cyberIcon('chevron-left'));
jbEl('jb-up').setAttribute('aria-label', t('Retour aux playlists'));
jbEl('jb-open').replaceChildren(cyberIcon('jukebox'), document.createTextNode(t('Ouvrir le Juke-box')));
for (const [id, icon, label] of [
  ['jb-prev', 'chevron-left', () => t('Morceau précédent')],
  ['jb-next', 'chevron-right', () => t('Morceau suivant')],
  ['jb-mini-next', 'chevron-right', () => t('Morceau suivant')],
  ['jb-shuffle', 'shuffle', () => t('Lecture aléatoire')],
]) {
  jbEl(id).replaceChildren(cyberIcon(icon));
  jbEl(id).setAttribute('aria-label', label());
}

/** Une commande du lecteur de la borne. */
function jbSend(op, key) {
  if (state !== 'paired') return;
  if (navigator.vibrate) navigator.vibrate(12);
  send({ t: 'jb', op, ...(key ? { key } : {}) });
}

/** « 3:48 » d'une durée en secondes. */
function jbClock(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Le temps du morceau maintenant (avancé depuis sa réception, sauf en pause). */
function jbPosition() {
  const tm = jb.time;
  if (!tm) return 0;
  return tm.position + (tm.paused ? 0 : (Date.now() - tm.at) / 1000);
}

/** Une pochette (ou une mosaïque de quatre) ; sans image, le disque du Juke-box. */
function jbArt(row, className) {
  const box = document.createElement('span');
  box.className = className;
  const tiles = row.mosaic?.length ? row.mosaic.slice(0, 4) : row.image ? [row.image] : [];
  if (tiles.length > 1) box.classList.add('mosaic');
  if (!tiles.length) box.append(cyberIcon('jukebox'));
  for (const src of tiles) {
    const img = document.createElement('img');
    img.alt = '';
    img.draggable = false;
    img.addEventListener('error', () => img.remove());
    img.src = src;
    box.append(img);
  }
  return box;
}

/** L'égaliseur du morceau qui joue (immobile en pause). */
function jbEq(paused) {
  const eq = document.createElement('span');
  eq.className = `jb-eq${paused ? ' paused' : ''}`;
  eq.setAttribute('aria-label', paused ? t('En pause') : t('En lecture'));
  eq.append(document.createElement('i'), document.createElement('i'), document.createElement('i'));
  return eq;
}

/** Une playlist ou un morceau : pochette, titre, ligne (artiste, ou la raison en ambre), durée ou égaliseur. */
function jbRow(row, playlists) {
  const li = document.createElement('li');
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `entry jb-row${row.disabled ? ' off' : ''}${row.playing ? ' playing' : ''}`;
  const text = document.createElement('span');
  text.className = 'entry-text';
  const label = document.createElement('span');
  label.className = 'entry-label';
  label.textContent = row.title;
  const line = document.createElement('span');
  line.className = 'entry-detail';
  line.textContent = row.percent !== undefined && row.disabled ? `${row.line} · ${row.percent} %` : row.line;
  text.append(label, line);
  b.append(jbArt(row, playlists ? 'jb-art mosaic-box' : 'jb-art'), text);
  if (row.playing) b.append(jbEq(row.playing === 'pause'));
  else if (playlists) b.append(cyberIcon('chevron-right', 'entry-go'));
  else if (row.duration) {
    const d = document.createElement('span');
    d.className = 'jb-duration';
    d.textContent = row.duration;
    b.append(d);
  }
  b.addEventListener('click', () => jbSend(playlists ? 'row' : 'play', row.key));
  li.append(b);
  return li;
}

/** Les lignes fixes d'une playlist ouverte (Tout lire, Lecture aléatoire, Répétition) : des boutons, pas des morceaux. */
function jbActions(rows) {
  return rows.map((row) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `jb-act${row.action === 'play' ? ' primary' : ''}${row.on && row.action !== 'play' ? ' on' : ''}`;
    if (row.action !== 'play') b.setAttribute('aria-pressed', String(Boolean(row.on)));
    b.append(cyberIcon(row.action), document.createTextNode(row.title));
    b.addEventListener('click', () => jbSend('row', row.key));
    return b;
  });
}

/** L'onglet Juke-box : fermé (l'ouvrir), les playlists, ou les morceaux de la playlist ouverte. */
function renderJukebox() {
  const d = jb.data;
  const list = jbEl('jb-list');
  const acts = jbEl('jb-acts');
  const open = jbEl('jb-open');
  const tracks = d?.open && d.level === 'tracks';
  jbEl('jb-seg').hidden = !d?.open;
  // Le nom de la playlist ouverte et son retour ; au niveau des playlists, la barre du haut dit déjà où l'on est.
  jbEl('jb-head').hidden = !tracks;
  jbEl('jb-up').hidden = !tracks;
  open.hidden = true;
  if (!d || !d.open) {
    list.replaceChildren();
    acts.replaceChildren();
    if (!d) showEmpty('jb', 'refresh', t('Chargement du Juke-box…'), t('La borne envoie ses playlists.'));
    else {
      showEmpty('jb', d.reason ? 'lock' : 'jukebox', d.title, d.reason ?? d.detail ?? '');
      // Fermé à la borne : l'ouvrir d'ici, comme Start sur son médaillon ; indisponible, la raison seule.
      open.hidden = Boolean(d.reason);
    }
    renderMini();
    return;
  }
  jbEl('jb-title').textContent = d.header?.title ?? '';
  jbEl('jb-label').textContent = d.header?.label ?? '';
  const rows = Array.isArray(d.rows) ? d.rows : [];
  // La gestion est sous « Gérer » ; les lignes fixes d'une playlist sont des boutons.
  const songs = rows.filter((r) => !r.manage && !r.action);
  acts.replaceChildren(...(tracks ? jbActions(rows.filter((r) => r.action)) : []));
  acts.hidden = !tracks;
  list.replaceChildren(...songs.map((r) => jbRow(r, !tracks)));
  if (!songs.length) showEmpty('jb', 'jukebox', d.empty === 'library' ? t('Aucune playlist') : t('Playlist vide'), t('« Gérer » : importer de YouTube ou ajouter des fichiers.'));
  else showEmpty('jb');
  list.querySelector('.jb-row.playing')?.scrollIntoView({ block: 'nearest' });
  renderMini();
  renderPlayer();
}

/** Le mini-lecteur au-dessus des onglets : le morceau en cours, pause et suivant ; il ouvre le lecteur. */
function renderMini() {
  const now = jb.data?.open ? jb.data.now : undefined;
  const shown = document.body.dataset.view;
  const on = Boolean(now) && mode !== 'browser' && state === 'paired' && shown !== 'player' && shown !== 'thread';
  document.body.dataset.mini = String(on);
  if (!now) return;
  jbEl('jb-mini-cover').replaceChildren(jbArt(now, 'jb-art small'));
  jbEl('jb-mini-title').textContent = now.title;
  jbEl('jb-mini-label').textContent = now.label;
  jbEl('jb-mini-pause').replaceChildren(cyberIcon(now.paused ? 'play' : 'pause'));
  jbEl('jb-mini-pause').setAttribute('aria-label', now.paused ? t('Lecture') : t('Pause'));
  jbEl('jb-mini-next').disabled = Boolean(now.ad);
  jbProgress();
}

/** Le lecteur déplié : pochette, titre, temps, commandes et modes de lecture. */
function renderPlayer() {
  const now = jb.data?.open ? jb.data.now : undefined;
  if (!now) {
    if (document.body.dataset.view === 'player') setView('jukebox');
    return;
  }
  jbEl('jb-cover').replaceChildren(jbArt(now, 'jb-art big'));
  jbEl('jb-now-title').textContent = now.title;
  jbEl('jb-now-artist').textContent = [now.artist, now.album].filter(Boolean).join(' · ') || now.origin || '';
  jbEl('jb-pause').replaceChildren(cyberIcon(now.paused ? 'play' : 'pause'));
  jbEl('jb-pause').setAttribute('aria-label', now.paused ? t('Lecture') : t('Pause'));
  // Pendant une publicité YouTube, le morceau suit : ni suivant ni avance.
  jbEl('jb-next').disabled = Boolean(now.ad);
  jbEl('jb-seek').disabled = Boolean(now.ad) || !jbDuration();
  const shuffle = jbEl('jb-shuffle');
  shuffle.classList.toggle('on', Boolean(now.mode?.shuffle));
  shuffle.setAttribute('aria-pressed', String(Boolean(now.mode?.shuffle)));
  const repeat = now.mode?.repeat ?? 'none';
  const r = jbEl('jb-repeat');
  r.replaceChildren(cyberIcon(repeat === 'track' ? 'repeat-one' : 'repeat'));
  r.classList.toggle('on', repeat !== 'none');
  r.setAttribute('aria-label', repeat === 'track' ? t('Répétition : morceau') : repeat === 'playlist' ? t('Répétition : playlist') : t('Répétition : aucune'));
  jbProgress();
}

const jbDuration = () => jb.time?.duration ?? jb.data?.now?.duration;

/** Le temps écoulé : la barre du mini-lecteur, le curseur et les temps du lecteur. */
function jbProgress() {
  const duration = jbDuration();
  const pos = Math.min(jbPosition(), duration ?? Infinity);
  const frac = duration ? pos / duration : 0;
  jbEl('jb-mini-bar').style.width = `${(frac * 100).toFixed(1)}%`;
  if (!jb.seeking) jbEl('jb-seek').value = String(Math.round(frac * 1000));
  jbEl('jb-elapsed').textContent = jbClock(pos);
  jbEl('jb-total').textContent = duration ? jbClock(duration) : '';
}
setInterval(() => {
  if (jb.data?.now && !jb.time?.paused && document.visibilityState === 'visible') jbProgress();
}, 500);

/** Messages de la borne : le lecteur (« jukebox »), le temps du morceau (« jb-time »). */
function jukeboxMessage(m) {
  if (m.t === 'jb-time') {
    jb.time = typeof m.key === 'string' && Number.isFinite(m.position) ? { key: m.key, position: m.position, duration: Number.isFinite(m.duration) ? m.duration : undefined, paused: m.paused === true, at: Date.now() } : undefined;
    jbProgress();
    return;
  }
  jb.data = { ...m, open: m.open === true, rows: Array.isArray(m.rows) ? m.rows : [] };
  if (jb.time && jb.data.now?.key !== jb.time.key) jb.time = undefined;
  renderJukebox();
  renderTop();
}

/** Ce que dit la barre du haut dans le Juke-box : où l'on est, ou le morceau du lecteur déplié. */
function jukeboxTop(shown) {
  if (shown === 'player') {
    const now = jb.data?.now;
    return { title: t('En lecture'), detail: now ? `${now.playlist} · ${now.position}` : '' };
  }
  if (shown !== 'jukebox') return undefined;
  return { title: t('Juke-box'), detail: jb.data?.open && jb.data.level !== 'tracks' ? (jb.data.header?.label ?? '') : (jb.data?.detail ?? '') };
}

jbEl('jb-up').addEventListener('click', () => jbSend('up'));
jbEl('jb-open').addEventListener('click', () => jbSend('open'));
// « Gérer » : la gestion s'ouvre à la borne ; ses écrans se touchent dans l'onglet Écran.
jbEl('jb-manage').addEventListener('click', () => {
  jbSend('manage');
  setView('list');
});
jbEl('jb-mini-open').addEventListener('click', () => setView('player'));
jbEl('jb-mini-pause').addEventListener('click', () => jbSend('pause'));
jbEl('jb-mini-next').addEventListener('click', () => jbSend('next'));
jbEl('jb-pause').addEventListener('click', () => jbSend('pause'));
jbEl('jb-prev').addEventListener('click', () => jbSend('prev'));
jbEl('jb-next').addEventListener('click', () => jbSend('next'));
jbEl('jb-shuffle').addEventListener('click', () => jbSend('shuffle'));
jbEl('jb-repeat').addEventListener('click', () => jbSend('repeat'));
const seek = jbEl('jb-seek');
seek.setAttribute('aria-label', t('Avancer dans le morceau'));
seek.addEventListener('input', () => {
  jb.seeking = true;
  const duration = jbDuration();
  if (duration) jbEl('jb-elapsed').textContent = jbClock((Number(seek.value) / 1000) * duration);
});
seek.addEventListener('change', () => {
  jb.seeking = false;
  if (state === 'paired') send({ t: 'jb', op: 'seek', fraction: Number(seek.value) / 1000 });
});
