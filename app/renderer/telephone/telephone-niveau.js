// Scores, Mon niveau et Activité récente de la page du téléphone (lot 5 de la Communauté au
// téléphone, 18/11/2026). La borne choisit, calcule et traduit tout ; la page dessine :
// - en tête de Scores, « Mon niveau » en résumé (level-menu.ts, remoteSummary) ; un toucher ouvre la
//   page plein écran : le palier, la barre, la semaine, les badges les plus proches (badges officiels,
//   niveau.js), puis « Mes badges » et « Comment gagner des XP », les écrans mêmes de la borne
//   (phone-pages.ts), demandés tant qu'ils sont ouverts (« page-open ») ;
// - la bascule « Une table / Toutes les tables » : toutes, une ligne par table (le premier, ma place),
//   du même calcul que l'écran « Tables » de la borne (rankings-menu.ts, remoteTables) ; une ligne
//   touchée ouvre son tableau (« Une table ») ;
// - la cloche de la barre du haut : l'Activité récente (activity-menu.ts, remote) dans une feuille du
//   bas, par jour ; chaque ligne mène à son écran : le fil, le profil, Joueurs ou le salon ici même, le
//   reste à la borne (« activity-act » : sa référence, jamais sa clé).
//
// Chargé après telephone-groupes.js et avant telephone.js : ses fonctions servent quand la page vit
// (send, state, setView, openSheet, ranks, ranksAsk, pickRankTable, communityOpenPage… sont ceux des
// autres pages).
'use strict';

const LEVEL_PAGES = ['level', 'badges', 'rules'];
const RANKS_MODE_STORE = 'cyberpinball.scores-mode';
const levels = {
  /** « one » : le tableau d'une table ; « all » : toutes les tables, gardé par ce téléphone. */
  mode: 'one',
  /** Toutes les tables reçues (« ranks » avec `every`), ou pourquoi rien. */
  all: undefined,
  /** La feuille de l'Activité récente est ouverte ; ce qu'elle montre (pour ne la redessiner qu'au changement). */
  bell: false,
  bellShown: '',
};
try {
  levels.mode = localStorage.getItem(RANKS_MODE_STORE) === 'all' ? 'all' : 'one';
} catch {
  // Stockage refusé : une table.
}

/** Vrai quand la vue Scores montre toutes les tables. */
function ranksAllMode() {
  return levels.mode === 'all';
}

/** Une barre de progression, de 0 à 1. */
function levelBar(progress) {
  const bar = document.createElement('span');
  bar.className = 'profile-bar';
  const fill = document.createElement('i');
  fill.style.width = `${Math.round(Math.max(0, Math.min(1, Number(progress) || 0)) * 100)}%`;
  bar.append(fill);
  return bar;
}

/** Le grand chiffre du niveau, dans son rond. */
function levelNumber(n) {
  const num = document.createElement('span');
  num.className = 'level-num';
  num.textContent = String(n);
  return num;
}

// ---------- En tête de Scores : Mon niveau, Une table / Toutes les tables ----------

function renderLevelCard() {
  const b = byId('ranks-level');
  const lv = community.data?.level;
  b.hidden = !lv;
  if (!lv) return;
  const text = document.createElement('span');
  text.className = 'level-card-text';
  // Une ligne de titre (et le gain de la semaine en pastille), la barre, les XP du niveau : rien ne passe à la ligne.
  const head = document.createElement('span');
  head.className = 'level-card-head';
  const title = document.createElement('span');
  title.className = 'level-card-title';
  title.textContent = lv.title;
  head.append(title);
  if (lv.gain) {
    const gain = document.createElement('span');
    gain.className = 'level-card-gain';
    gain.textContent = lv.gain;
    head.append(gain);
  }
  const line = document.createElement('span');
  line.className = 'level-card-detail';
  line.textContent = lv.xp;
  text.append(head, levelBar(lv.progress), line);
  b.replaceChildren(levelNumber(lv.level), text, cyberIcon('chevron-right', 'entry-go'));
  b.setAttribute('aria-label', [lv.title, lv.detail, lv.week].join(', '));
}
byId('ranks-level').addEventListener('click', () => {
  if (state !== 'paired') return;
  if (navigator.vibrate) navigator.vibrate(12);
  communityOpenPage('level');
});

function renderRanksMode() {
  const box = byId('ranks-mode');
  box.setAttribute('aria-label', t('Classements'));
  const tab = (mode, label) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.className = levels.mode === mode ? 'on' : '';
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(levels.mode === mode));
    b.addEventListener('click', () => {
      if (state !== 'paired' || levels.mode === mode) return;
      levels.mode = mode;
      try {
        localStorage.setItem(RANKS_MODE_STORE, mode);
      } catch {
        // Stockage refusé : le choix vaut pour cette page.
      }
      levels.all = undefined;
      ranks.shown = undefined;
      ranks.picking = false;
      ranksAsk();
      renderRanks();
    });
    return b;
  };
  box.replaceChildren(tab('one', t('Une table')), tab('all', t('Toutes les tables')));
}

// ---------- Toutes les tables ----------

/** « ranks » avec `every` : toutes les tables à cette portée et cette période. */
function allTablesMessage(m) {
  if (!ranksAllMode() || m.scope !== ranks.scope || m.period !== ranks.period) return;
  const world = m.all?.scopes?.find((sc) => sc.scope === 'world');
  // Le défaut sans classement mondial : Cette borne, comme pour une table.
  if (ranks.scopeDefault && ranks.scope === 'world' && world?.reason) {
    ranks.scopeDefault = false;
    ranks.scope = 'cabinet';
    ranksAsk();
    return;
  }
  if (m.all) ranks.scopeDefault = false;
  levels.all = { all: m.all, empty: m.empty };
  renderRanks();
}

/** Les portées et les périodes de toutes les tables : comme celles d'une table. */
function renderAllChoices(all) {
  renderScopes({ scopes: (all?.scopes ?? []).map((sc) => ({ ...sc, reason: sc.reason })) });
  const box = byId('ranks-periods');
  box.replaceChildren(
    ...(all?.periods ?? []).map((p) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `ranks-period${p.current ? ' current' : ''}`;
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(p.current));
      const label = document.createElement('span');
      label.className = 'ranks-period-label';
      label.textContent = p.label;
      b.append(label);
      b.addEventListener('click', () => {
        if (state !== 'paired' || p.current) return;
        ranks.period = p.period;
        ranksKeep();
        ranksAsk();
      });
      return b;
    }),
  );
}

/** Une table : son initiale, son nom, le premier (et son drapeau), ma place à droite ; ou pourquoi rien. */
function allTableRow(r) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `all-row${r.reason ? ' quiet' : ''}${r.first ? ' first' : ''}`;
  const medal = document.createElement('span');
  medal.className = 'entry-medal';
  medal.textContent = (r.title || '?').trim().charAt(0).toUpperCase();
  const text = document.createElement('span');
  text.className = 'all-text';
  const name = document.createElement('span');
  name.className = 'all-name';
  name.textContent = r.title;
  const lead = document.createElement('span');
  lead.className = 'all-lead';
  const flag = personFlag(r.flag);
  if (flag) lead.append(flag);
  lead.append([r.lead ?? r.reason, r.count].filter(Boolean).join(' · '));
  text.append(name, lead);
  const place = document.createElement('span');
  place.className = 'all-place';
  place.textContent = r.mine ?? r.aside ?? '';
  b.append(medal, text, place);
  b.setAttribute('aria-label', [r.title, r.lead ?? r.reason, r.count, r.mine].filter(Boolean).join(', '));
  b.addEventListener('click', () => {
    if (state !== 'paired' || !ranks.tables) return;
    if (navigator.vibrate) navigator.vibrate(12);
    // Son tableau des scores, à la même portée et à la même période.
    levels.mode = 'one';
    try {
      localStorage.setItem(RANKS_MODE_STORE, 'one');
    } catch {
      // Stockage refusé.
    }
    pickRankTable(r.i);
  });
  return b;
}

function renderAllTables() {
  const box = byId('ranks-all');
  const shown = levels.all;
  renderAllChoices(shown?.all);
  const parts = [];
  for (const sec of shown?.all?.sections ?? []) {
    const h = document.createElement('div');
    h.className = 'all-section';
    h.textContent = sec.title;
    parts.push(h, ...sec.rows.map(allTableRow));
  }
  box.replaceChildren(...parts);
  if (!shown) showEmpty('ranks', 'refresh', t('Chargement des classements…'), t('La borne envoie le classement de chaque table.'));
  else if (shown.empty) showEmpty('ranks', 'lock', shown.empty.title, shown.empty.detail);
  else if (shown.all?.unavailable) showEmpty('ranks', 'network', t('Classement indisponible'), shown.all.unavailable);
  else if (!parts.length) showEmpty('ranks', 'info', t('Aucune table sur cette borne'));
  else showEmpty('ranks');
}

/** La vue Scores selon la bascule : ce qui ne sert qu'à une table se cache sur « Toutes les tables ». */
function ranksModeLayout() {
  const all = ranksAllMode();
  byId('ranks-table').hidden = all;
  byId('ranks-lines').hidden = all;
  byId('ranks-all').hidden = !all;
  if (all) {
    byId('ranks-position').hidden = true;
    byId('ranks-foot').hidden = true;
    byId('ranks-picker').hidden = true;
    byId('ranks-scroll').hidden = false;
  }
}

// ---------- Les pages de niveau (plein écran) ----------

/** Une ligne d'un écran de la borne : son badge officiel ou son icône, le texte, la valeur à droite, sa barre. */
function levelRow(r) {
  const row = document.createElement('div');
  row.className = `level-row${r.tone ? ` tone-${r.tone}` : ''}`;
  if (r.medal) {
    const art = document.createElement('span');
    art.className = 'level-medal';
    if (window.CyberLevels) art.innerHTML = CyberLevels.badgeSvg(r.medal.icon, r.medal.rarity, r.medal.earned);
    else art.append(cyberIcon(r.medal.icon));
    row.append(art);
  } else row.append(r.icon ? cyberIcon(r.icon) : document.createElement('span'));
  const text = document.createElement('span');
  text.className = 'level-row-text';
  const main = document.createElement('span');
  main.className = 'level-row-main';
  main.textContent = r.text;
  text.append(main);
  if (r.detail) {
    const small = document.createElement('small');
    small.textContent = r.detail;
    text.append(small);
  }
  if (typeof r.progress === 'number') text.append(levelBar(r.progress));
  if (r.badges?.length) {
    const tags = document.createElement('span');
    tags.className = 'level-tags';
    tags.textContent = r.badges.join(' · ');
    text.append(tags);
  }
  row.append(text);
  const aside = document.createElement('span');
  aside.className = 'level-aside';
  aside.textContent = r.aside ?? '';
  row.append(aside);
  return row;
}

/** Un lien vers une autre page (Mes badges, Comment gagner des XP). */
function levelLink(icon, label, detail, kind) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'profile-line profile-group level-link';
  b.append(cyberIcon(icon));
  const text = document.createElement('span');
  text.className = 'profile-line-text';
  const main = document.createElement('span');
  main.textContent = label;
  text.append(main);
  if (detail) {
    const small = document.createElement('small');
    small.textContent = detail;
    text.append(small);
  }
  b.append(text, cyberIcon('chevron-right', 'entry-go'));
  b.addEventListener('click', () => {
    if (state !== 'paired') return;
    if (navigator.vibrate) navigator.vibrate(12);
    communityOpenPage(kind);
  });
  return b;
}

/** Mon niveau, Mes badges ou le barème : l'écran de la borne, en sections. */
function renderLevelPage(box, kind) {
  const page = community.data?.page;
  if (!page || page.kind !== kind) {
    box.replaceChildren(Object.assign(document.createElement('p'), { className: 'profile-wait', textContent: t('La borne envoie la page…') }));
    return;
  }
  const keep = box.dataset.kind === kind ? box.scrollTop : 0;
  box.dataset.kind = kind;
  const parts = [];
  const lv = community.data?.level;
  if (kind === 'level' && lv) {
    const hero = document.createElement('div');
    hero.className = 'level-hero';
    const who = document.createElement('div');
    who.className = 'profile-who';
    const name = document.createElement('div');
    name.className = 'profile-name';
    name.textContent = page.view.subheading ?? lv.title;
    const sub = document.createElement('div');
    sub.className = 'profile-sub';
    sub.textContent = lv.week;
    who.append(name, sub);
    hero.append(levelNumber(lv.level), who);
    parts.push(hero);
  }
  if (page.view.lead) parts.push(profileLine({ text: page.view.lead, tone: 'quiet' }, 'profile-reason'));
  for (const sec of page.view.sections) {
    if (sec.title) parts.push(profileSection(sec.title));
    const panel = document.createElement('div');
    panel.className = 'profile-panel level-panel';
    panel.append(...sec.rows.map(levelRow));
    parts.push(panel);
  }
  if (kind === 'level') {
    parts.push(levelLink('medal', t('Mes badges'), '', 'badges'), levelLink('info', t('Comment gagner des XP'), t('Le barème : parties, progrès, classements, badges, vie sociale'), 'rules'));
  }
  box.replaceChildren(...parts);
  box.scrollTop = keep;
}

// ---------- La cloche : l'Activité récente ----------

/** La cloche de la barre du haut, et le nombre de non-lus : dans les vues de la Communauté seulement. */
function renderBell() {
  const b = byId('top-bell');
  const shown = document.body.dataset.view;
  const act = community.data?.activity;
  b.hidden = !act || !COMMUNITY_VIEWS.includes(shown) || mode === 'browser';
  if (b.hidden) return;
  const n = act.unread ?? 0;
  const count = document.createElement('b');
  count.textContent = n > 99 ? '99+' : String(n);
  count.hidden = !n;
  b.replaceChildren(cyberIcon('bell'), count);
  b.setAttribute('aria-label', n ? tn(n, 'Activité récente : {n} non lue', 'Activité récente : {n} non lues') : t('Activité récente'));
}
byId('top-bell').addEventListener('click', () => {
  if (state !== 'paired') return;
  levels.bell = true;
  levels.bellShown = '';
  send({ t: 'page-open', page: 'activity' });
  openActivity();
});

/** Ce qu'une ligne ouvre : un fil, un profil, Joueurs, un salon ici même ; le reste à la borne (vue Écran). */
function activityGo(row) {
  send({ t: 'activity-act', a: 'open', ref: row.ref });
  const go = row.go;
  if (!go) return;
  if (go.where === 'thread') communityOpenThread(go.key);
  else if (go.where === 'profile') communityOpenProfile(go.key);
  else if (go.where === 'friends') setView('friends');
  else if (go.where === 'room') {
    communityPickRoom(go.room);
    setView('room');
  } else setView('list');
}

/** La feuille de l'Activité récente : par jour, chaque ligne avec son heure et ce qu'elle ouvre ; Effacer. */
function openActivity() {
  const days = community.data?.activity?.days;
  const text = JSON.stringify(days ?? null);
  if (!document.getElementById('sheet').hidden && levels.bellShown === text) return;
  levels.bellShown = text;
  const box = document.createElement('div');
  box.className = 'activity-list';
  if (!days) box.append(profileLine({ text: t('La borne envoie l’activité récente…'), tone: 'quiet' }));
  else if (!days.length) box.append(profileLine({ text: t('Aucune activité récente'), detail: t('Vos prochaines notifications apparaîtront ici.'), tone: 'info', icon: 'info' }));
  for (const day of days ?? []) {
    const h = document.createElement('div');
    h.className = 'activity-day';
    h.textContent = day.title;
    box.append(h);
    for (const r of day.rows) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `activity-row${r.gone ? ' quiet' : ''}${r.unread ? ' unread' : ''}`;
      const main = document.createElement('span');
      main.className = 'level-row-text';
      const title = document.createElement('span');
      title.className = 'level-row-main';
      title.textContent = r.title;
      const small = document.createElement('small');
      small.textContent = [r.time, r.status, r.gone ?? r.detail].filter(Boolean).join(' · ');
      main.append(title, small);
      const go = document.createElement('span');
      go.className = 'activity-go';
      go.textContent = r.gone ? '' : r.label ? t('Ouvrir') : '';
      b.append(cyberIcon(r.icon || 'bell'), main, go);
      if (r.gone || !r.go) b.setAttribute('aria-disabled', 'true');
      b.addEventListener('click', () => {
        if (state !== 'paired' || r.gone || !r.go) return;
        if (navigator.vibrate) navigator.vibrate(12);
        closeSheet();
        activityGo(r);
      });
      box.append(b);
    }
  }
  openSheet(
    t('Activité récente'),
    days?.length
      ? [
          {
            label: t('Effacer l’activité récente'),
            danger: true,
            run: () => openSheet(t('Effacer toute l’activité récente ?'), [{ label: t('Effacer'), danger: true, run: () => send({ t: 'activity-act', a: 'clear' }) }], { text: t('Vos amis, téléchargements et parties restent.') }),
          },
        ]
      : [],
    { top: [box], opener: byId('top-bell'), onClose: activityClosed },
  );
}

/** La feuille de l'Activité récente est fermée : la borne cesse d'en envoyer le journal. */
function activityClosed() {
  if (!levels.bell) return;
  levels.bell = false;
  levels.bellShown = '';
  send({ t: 'page-open' });
}

/** Un envoi de la borne : la cloche, et la feuille ouverte si son journal a changé. */
function levelsMessage() {
  renderBell();
  if (levels.bell && !document.getElementById('sheet').hidden && document.getElementById('sheet-title').textContent === t('Activité récente')) openActivity();
  if (document.body.dataset.view === 'ranks') {
    renderLevelCard();
  }
}
