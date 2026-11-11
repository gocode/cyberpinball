// Vue Scores de la page du téléphone (telephone.js) : le tableau des scores d'une table, tel que la
// borne le montre (app/src/remote-ranks.ts, scoreboard-menu.ts). La borne choisit, met en forme et
// traduit tout ; la page ne fait que dessiner. Elle demande (« ranks ») une portée, une période, et
// une table par son rang dans la liste reçue (« ranks-tables ») ; sans rang, la table choisie ou
// lancée à la borne, qu'elle suit tant qu'on n'en choisit pas une autre. Lecture seule.
//
// Le tableau : une grille commune (data-aligned, comme à la borne) où rang, drapeau, pastille, nom
// et score tombent dans les mêmes colonnes sur chaque ligne, au pixel près. Le rang et le score ont
// la largeur du plus long (en chiffres de même chasse) ; une ligne touchée dit le reste (quand, pays,
// présence) dans la feuille du bas.
//
// Chargé avant telephone.js : ses fonctions servent quand la page vit (send, state, entryRow,
// showEmpty, openSheet, view et syncLayout sont ceux de telephone.js).
'use strict';

const byId = (id) => document.getElementById(id);

/** Ce que montre la vue Scores ; `follow` : la table de la borne, sinon `pick` (rang et version de la liste). */
const ranks = {
  scope: 'cabinet',
  period: 'all',
  follow: true,
  pick: undefined,
  /** Liste des tables (« ranks-tables ») et tableau (« ranks ») reçus. */
  tables: undefined,
  shown: undefined,
  picking: false,
  /** La vue est ouverte à la borne (une demande est partie depuis l'ouverture de la liaison). */
  live: false,
};

/** Ouverture de la vue : la table de la borne d'abord, comme à la borne. */
function ranksEnter() {
  ranks.follow = true;
  ranks.pick = undefined;
  ranks.picking = false;
  ranks.shown = undefined;
  ranksAsk();
  renderRanks();
}

/** Sortie de la vue : la borne cesse de relire les classements pour le téléphone. */
function ranksLeave() {
  if (ranks.live) send({ t: 'ranks-off' });
  ranks.live = false;
  ranks.picking = false;
}

/** La demande à la borne : la portée, la période, et la table choisie si ce n'est pas celle de la borne. */
function ranksAsk() {
  const table = !ranks.follow && ranks.pick ? { v: ranks.pick.v, i: ranks.pick.i } : {};
  ranks.live = send({ t: 'ranks', scope: ranks.scope, period: ranks.period, ...table }) || ranks.live;
}

/** Messages de la borne pour la vue Scores. */
function ranksMessage(m) {
  if (m.t === 'ranks-tables') {
    ranks.tables = {
      v: Number(m.v),
      items: Array.isArray(m.items) ? m.items : [],
      current: Number.isInteger(m.current) ? m.current : -1,
      locked: typeof m.locked === 'string' ? m.locked : '',
    };
    if (ranks.picking) renderPicker();
    else renderRanks();
    return;
  }
  // Une réponse pour une portée ou une période déjà quittée : la suivante est en route.
  if (m.scope !== ranks.scope || m.period !== ranks.period) return;
  ranks.shown = { v: Number(m.v), i: Number.isInteger(m.i) ? m.i : -1, follow: m.follow === true, board: m.board, empty: m.empty };
  if (ranks.shown.follow) {
    ranks.follow = true;
    ranks.pick = undefined;
  }
  renderRanks();
}

/** Une ligne de la liste reçue, ou undefined. */
const rankItem = (i) => (ranks.tables && i >= 0 ? ranks.tables.items[i] : undefined);

/** Le bouton de la table, en tête : la table montrée, et ce qu'il fait (ouvrir ou refermer la liste). */
function renderRanksTable() {
  const b = ranks.shown?.board;
  const item = ranks.shown ? rankItem(ranks.shown.i) : ranks.follow ? rankItem(ranks.tables?.current ?? -1) : ranks.pick && rankItem(ranks.pick.i);
  const title = b?.table.title ?? item?.label ?? '';
  const detail = b?.table.detail ?? item?.detail ?? '';
  const button = byId('ranks-table');
  const atBorne = ranks.shown ? ranks.shown.i >= 0 && ranks.shown.i === ranks.tables?.current : ranks.follow;
  byId('ranks-table-mark').replaceChildren(cyberIcon('trophy'));
  byId('ranks-table-title').textContent = ranks.picking ? t('Choisir une table') : title || t('Tableau des scores');
  byId('ranks-table-detail').textContent = ranks.picking ? t('Toutes les tables de la borne') : [atBorne && title ? t('À la borne') : '', detail].filter(Boolean).join(' · ');
  byId('ranks-table-go').replaceChildren(cyberIcon(ranks.picking ? 'close' : 'chevron-right'));
  button.setAttribute('aria-expanded', String(ranks.picking));
  button.setAttribute('aria-label', ranks.picking ? t('Fermer la liste des tables') : t('Changer de table'));
  const many = (ranks.tables?.items.length ?? 0) > 1;
  button.disabled = !ranks.picking && (!many || Boolean(ranks.tables?.locked));
}

/** Les portées : grisée quand le classement est indisponible, sa raison dite quand on la choisit. */
function renderScopes(board) {
  const box = byId('ranks-scopes');
  box.setAttribute('aria-label', t('Portée du classement'));
  box.replaceChildren(
    ...(board?.scopes ?? []).map((sc) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `ranks-scope${sc.current ? ' current' : ''}${sc.reason ? ' off' : ''}`;
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(sc.current));
      if (sc.reason) b.setAttribute('aria-description', sc.reason);
      b.textContent = sc.label;
      b.addEventListener('click', () => {
        if (state !== 'paired' || sc.current) return;
        ranks.scope = sc.scope;
        ranksAsk();
      });
      return b;
    }),
  );
}

/** Les quatre périodes : le libellé, et le nombre de parties ou de joueurs. */
function renderPeriods(board) {
  const box = byId('ranks-periods');
  box.setAttribute('aria-label', t('Période'));
  box.replaceChildren(
    ...(board?.tabs ?? []).map((tab) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `ranks-period${tab.current ? ' current' : ''}`;
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(tab.current));
      const label = document.createElement('span');
      label.className = 'ranks-period-label';
      label.textContent = tab.label;
      const count = document.createElement('span');
      count.className = 'ranks-period-count';
      count.textContent = tab.count;
      b.append(label, count);
      b.addEventListener('click', () => {
        if (state !== 'paired' || tab.current) return;
        ranks.period = tab.period;
        ranksAsk();
      });
      return b;
    }),
  );
}

/** Drapeau d'un pays, dans un cadre 4:3 fixe ; sans image, son code dans le même cadre (comme à la borne). */
function rankFlag(l) {
  const node = document.createElement('span');
  // « flag » : une image pour le garde-fou de mise en page (layout-check.ts), centrée sur sa ligne.
  node.className = 'flag ranks-flag';
  if (!l.country) {
    node.classList.add('none');
    return node;
  }
  node.setAttribute('role', 'img');
  node.setAttribute('aria-label', l.countryName || l.country);
  const fallback = () => {
    node.classList.add('code');
    node.textContent = l.country;
  };
  if (!l.flag) {
    fallback();
    return node;
  }
  const img = document.createElement('img');
  img.alt = '';
  img.draggable = false;
  img.addEventListener('error', () => {
    img.remove();
    fallback();
  });
  img.src = l.flag;
  node.append(img);
  return node;
}

/** La pastille d'un joueur et sa marque de présence (en ligne, en partie, hors ligne), comme à la borne. */
function rankFace(l) {
  const presence = l.status ? (l.status.state === 'seen' ? 'offline' : l.status.state) : '';
  const face = document.createElement('span');
  face.className = `ranks-face${presence ? ` presence-${presence}` : ''}`;
  face.dataset.picture = '';
  if (!l.avatar) {
    face.classList.add('none');
    return face;
  }
  face.append(avatarNode(l.avatar, 'ranks-avatar'));
  if (l.status) {
    const dot = document.createElement('span');
    dot.className = 'presence-dot';
    face.append(dot);
    face.setAttribute('aria-label', l.status.label);
  }
  return face;
}

/** Une ligne touchée : ce que la colonne étroite ne dit pas (quand, pays, présence), dans la feuille du bas. */
function rankDetail(l) {
  const text = [t('Rang {rank} · score {score}', { rank: l.rank, score: l.score }), l.when, l.countryName || l.country || '', l.status?.label ?? ''].filter(Boolean).join('\n');
  openSheet(l.name, [{ id: 'ok', label: t('Fermer'), run: () => undefined }], { text, cancel: false });
}

/**
 * Le tableau : une ligne par joueur, cinq colonnes au plus (rang, drapeau, pastille, nom, score) de
 * même largeur sur toutes les lignes. Drapeau et pastille n'ont de colonne que si une ligne au moins
 * en a ; une ligne sans eux garde leur case, vide.
 */
function renderLines(board) {
  const list = byId('ranks-lines');
  const lines = board?.lines ?? [];
  if (!lines.length) {
    list.replaceChildren();
    return;
  }
  const flags = lines.some((l) => l.country);
  const faces = lines.some((l) => l.avatar);
  list.dataset.flags = String(flags);
  list.dataset.faces = String(faces);
  // Rang et score à la largeur du plus long, en chiffres de même chasse (une estimation en attendant la mesure, fitRankColumns).
  const widest = (key) => Math.max(...lines.map((l) => [...String(l[key])].length));
  list.style.setProperty('--ranks-cols', rankColumns(`${widest('rank') + 0.5}ch`, `${widest('score') + 0.5}ch`, flags, faces));
  list.setAttribute('aria-label', t('Tableau des scores'));
  list.replaceChildren(
    ...lines.map((l) => {
      const li = document.createElement('li');
      li.className = `ranks-line${l.first ? ' first' : ''}${l.mine ? ' mine' : ''}${l.apart ? ' apart' : ''}`;
      li.tabIndex = 0;
      li.setAttribute('role', 'button');
      li.setAttribute('aria-haspopup', 'dialog');
      const rank = document.createElement('span');
      rank.className = 'ranks-rank';
      rank.textContent = l.rank;
      li.append(rank);
      if (flags) li.append(rankFlag(l));
      if (faces) li.append(rankFace(l));
      const name = document.createElement('span');
      name.className = `ranks-name${l.anonymous ? ' anonymous' : ''}`;
      name.textContent = l.name;
      const score = document.createElement('span');
      score.className = 'ranks-score';
      score.textContent = l.score;
      li.append(name, score);
      li.addEventListener('click', () => state === 'paired' && rankDetail(l));
      li.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        rankDetail(l);
      });
      return li;
    }),
  );
}

/** Les colonnes de chaque ligne : rang, drapeau, pastille, nom (le reste), score. */
function rankColumns(rank, score, flags, faces) {
  return [rank, ...(flags ? ['var(--ranks-flag)'] : []), ...(faces ? ['var(--ranks-face)'] : []), 'minmax(0, 1fr)', score].join(' ');
}

/**
 * Rang et score à la largeur exacte du plus long texte de leur colonne, mesurée une fois dessinés
 * (les espaces fines des milliers sont plus étroites qu'un chiffre) : le nom garde toute la place
 * qui reste, même sur un écran de 320 px. Mesurée de nouveau quand la taille ou la police change.
 */
function fitRankColumns() {
  const list = byId('ranks-lines');
  if (!list.children.length) return;
  const widest = (selector) => {
    let max = 0;
    for (const el of list.querySelectorAll(selector)) {
      const range = document.createRange();
      range.selectNodeContents(el);
      max = Math.max(max, range.getBoundingClientRect().width);
    }
    return max;
  };
  const rank = widest('.ranks-rank');
  const score = widest('.ranks-score');
  // Vue masquée : rien à mesurer, l'estimation reste.
  if (!rank || !score) return;
  list.style.setProperty('--ranks-cols', rankColumns(`${Math.ceil(rank) + 1}px`, `${Math.ceil(score) + 1}px`, list.dataset.flags === 'true', list.dataset.faces === 'true'));
}

/** Sous le tableau : ma place, puis la note (ce qui se compare, le réseau) et la légende des marques de présence. */
function renderFoot(board) {
  const position = byId('ranks-position');
  position.hidden = !board?.position;
  position.textContent = board?.position ?? '';
  const foot = byId('ranks-foot');
  foot.hidden = !board?.note && !board?.legend?.length;
  byId('ranks-note').textContent = board?.note ?? '';
  byId('ranks-note').hidden = !board?.note;
  const legend = byId('ranks-legend');
  legend.hidden = !board?.legend?.length;
  legend.replaceChildren(
    ...(board?.legend ?? []).map((item) => {
      const entry = document.createElement('span');
      entry.className = `ranks-legend-item presence-${item.presence}`;
      const sample = document.createElement('span');
      sample.className = 'ranks-legend-face';
      const dot = document.createElement('span');
      dot.className = 'presence-dot';
      sample.append(dot);
      const label = document.createElement('span');
      label.textContent = item.label;
      entry.append(sample, label);
      return entry;
    }),
  );
}

/** Toute la vue : la table, puis le tableau, ou la liste des tables quand on en choisit une. */
function renderRanks() {
  renderRanksTable();
  byId('ranks-picker').hidden = !ranks.picking;
  byId('ranks-scroll').hidden = ranks.picking;
  if (ranks.picking) return renderPicker();
  const shown = ranks.shown;
  const board = shown?.board;
  renderScopes(board);
  renderPeriods(board);
  renderLines(board);
  fitRankColumns();
  renderFoot(board);
  // Chargement, classements fermés (mode invité), aucune table ; sinon, ce que dit la borne d'une période vide.
  const locked = ranks.tables?.locked;
  if (!shown) showEmpty('ranks', 'refresh', t('Chargement des classements…'), t('La borne envoie le tableau des scores.'));
  else if (shown.empty) showEmpty('ranks', locked ? 'lock' : 'info', shown.empty.title, shown.empty.detail);
  else if (board && !board.lines.length && board.empty) {
    const off = board.scopes.find((s) => s.current)?.reason;
    showEmpty('ranks', off ? 'network' : 'trophy', board.empty.title, board.empty.detail);
  } else showEmpty('ranks');
}

/** La liste des tables : la table montrée en vert, celle de la borne marquée ; un filtre au-delà de huit. */
function renderPicker() {
  renderRanksTable();
  const list = byId('ranks-tables');
  const items = ranks.tables?.items ?? [];
  const filter = byId('ranks-filter');
  filter.hidden = items.length <= 8;
  filter.placeholder = t('Chercher une table');
  filter.setAttribute('aria-label', t('Chercher une table'));
  const words = filter.hidden ? [] : filter.value.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/\s+/).filter(Boolean);
  const plain = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const shownAt = ranks.shown?.i ?? (ranks.follow ? (ranks.tables?.current ?? -1) : (ranks.pick?.i ?? -1));
  const rows = [];
  items.forEach((item, i) => {
    const text = plain(`${item.label} ${item.detail ?? ''}`);
    if (words.some((w) => !text.includes(w))) return;
    const atBorne = i === ranks.tables.current;
    rows.push(
      entryRow({ label: item.label, detail: item.detail, ...(atBorne ? { badge: t('À la borne') } : {}) }, {
        current: i === shownAt,
        run: () => pickRankTable(i),
      }),
    );
  });
  list.replaceChildren(...rows);
  if (!ranks.tables) showEmpty('ranks-tables', 'refresh', t('Chargement des tables…'));
  else if (!items.length) showEmpty('ranks-tables', 'info', t('Aucune table sur cette borne'));
  else if (!rows.length) showEmpty('ranks-tables', 'search', t('Aucune table ne correspond'), t('Essayez un autre mot du titre ou du fabricant.'));
  else showEmpty('ranks-tables');
  list.querySelector('.entry.current')?.scrollIntoView({ block: 'nearest' });
}

/** Une table choisie dans la liste : la sienne ; celle de la borne, et la page la suit de nouveau. */
function pickRankTable(i) {
  if (!ranks.tables) return;
  ranks.follow = i === ranks.tables.current;
  ranks.pick = ranks.follow ? undefined : { v: ranks.tables.v, i };
  ranks.picking = false;
  ranks.shown = undefined;
  ranksAsk();
  renderRanks();
}

byId('ranks-table').addEventListener('click', () => {
  if (state !== 'paired') return;
  ranks.picking = !ranks.picking;
  byId('ranks-filter').value = '';
  renderRanks();
  if (ranks.picking) byId('ranks-tables').scrollTop = 0;
});
byId('ranks-filter').addEventListener('input', () => renderPicker());
// La largeur des chiffres change avec l'écran (texte resserré sous 375 px) et à l'arrivée de la police.
window.addEventListener('resize', () => fitRankColumns());
document.fonts?.ready.then(() => fitRankColumns());
byId('ranks-filter').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') e.target.blur();
});
