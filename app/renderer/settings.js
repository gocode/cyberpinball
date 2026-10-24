// Affiche l'état envoyé par settings.ts. Toute la logique reste côté principal :
// ici, on dessine et on renvoie les clics, la molette et la saisie.

const root = document.getElementById('root');
// Rotation de la mise en page pour un joueur au bord des flippers (settings.css).
document.documentElement.dataset.rotation = new URLSearchParams(location.search).get('rotation') ?? '0';
const act = (action) => window.cyberSettings.act(action);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

function badges(list) {
  const box = el('span', 'badges');
  for (const b of list ?? []) box.append(el('span', `badge ${b.tone}`, b.text));
  return box;
}

function header(s) {
  const head = el('header');
  const titles = el('div', 'titles');
  const brand = el('div', 'brand', 'CYBER ');
  brand.append(el('span', 'pin', 'PINBALL'));
  titles.append(brand, el('h1', '', s.title), el('div', 'scope', s.scope));
  const file = el('div', 'file', s.file);
  if (s.fileNote) file.append(el('span', 'file-note', s.fileNote));
  titles.append(file);
  const tabs = el('nav', `tabs${s.tabsFocused ? ' focused' : ''}`);
  for (const tab of s.tabs) {
    const b = el('button', `tab${tab.active ? ' active' : ''}`, tab.label);
    b.addEventListener('click', () => act({ type: 'tab', tab: tab.id }));
    tabs.append(b);
  }
  const side = el('div', 'head-side');
  side.append(tabs, el('div', 'vpx', s.vpx));
  head.append(titles, side);
  return head;
}

function list(s) {
  const box = el('section', 'list');
  if (s.breadcrumb) {
    const crumb = el('button', 'crumb', `‹ Sections  /  ${s.breadcrumb}`);
    crumb.addEventListener('click', () => act({ type: 'back' }));
    box.append(crumb);
  }
  const ul = el('ul');
  s.rows.forEach((row, index) => {
    if (row.kind === 'group') {
      ul.append(el('li', 'group', row.label));
      return;
    }
    const li = el('li', `row ${row.kind}${index === s.cursor ? ' selected' : ''}`);
    const name = el('div', 'name');
    name.append(el('span', 'label', row.label));
    if (row.sub) name.append(el('span', 'sub', row.sub));
    name.append(badges(row.badges));
    li.append(name, el('div', 'value', row.value ?? ''));
    li.addEventListener('click', () => act({ type: 'row', index }));
    ul.append(li);
  });
  if (!s.rows.length) ul.append(el('li', 'empty', t('Aucun réglage.')));
  box.append(ul);
  return box;
}

function detail(d) {
  const box = el('aside', 'detail');
  if (!d) return box;
  box.append(el('h2', '', d.title));
  if (d.help) box.append(el('p', 'help', d.help));
  for (const line of d.lines ?? []) box.append(el('p', 'help', line));
  if (d.owned) {
    const owned = el('p', 'owned-note');
    owned.append(el('strong', '', `${t('Gérée par Cyber Pinball.')} `), document.createTextNode(d.owned));
    box.append(owned);
  }
  if (d.facts) {
    const dl = el('dl');
    for (const [k, v] of d.facts) dl.append(el('dt', '', k), el('dd', '', v));
    box.append(dl);
  }
  if (d.original) {
    const orig = el('div', 'original');
    orig.append(el('div', 'original-title', t('Description d’origine (VPX)')));
    for (const line of d.original.split('\n')) orig.append(el('p', '', line));
    box.append(orig);
  }
  return box;
}

function panel(p) {
  const overlay = el('section', 'overlay');
  const box = el('div', `panel panel-${p.kind}`);
  box.append(el('h2', '', p.title));
  if (p.kind === 'info') {
    for (const line of p.lines) box.append(el('p', 'help', line));
    const ul = el('ul', 'choices');
    p.actions.forEach((label, index) => {
      const li = el('li', index === p.index ? 'selected' : '', label);
      li.addEventListener('click', () => act({ type: 'choice', index }));
      ul.append(li);
    });
    box.append(ul);
  } else if (p.kind === 'choices') {
    const ul = el('ul', 'choices wheel');
    p.choices.forEach((c, index) => {
      const li = el('li', index === p.index ? 'selected' : '');
      li.append(el('span', '', c.label));
      if (c.note) li.append(el('span', 'note', c.note));
      li.addEventListener('click', () => act({ type: 'choice', index }));
      ul.append(li);
    });
    ul.addEventListener('wheel', (e) => {
      e.preventDefault();
      act({ type: 'wheel', delta: e.deltaY });
    });
    box.append(ul);
  } else {
    const input = el('input', 'text');
    input.value = p.text;
    input.spellcheck = false;
    input.addEventListener('input', () => act({ type: 'text', text: input.value }));
    box.append(input, el('p', 'help', p.hint));
    const buttons = el('div', 'buttons');
    const ok = el('button', 'primary', t('Enregistrer'));
    ok.addEventListener('click', () => act({ type: 'text', text: input.value, submit: true }));
    const reset = el('button', '', t('Valeur par défaut'));
    reset.addEventListener('click', () => act({ type: 'reset' }));
    const cancel = el('button', '', t('Annuler'));
    cancel.addEventListener('click', () => act({ type: 'cancel' }));
    buttons.append(ok, reset, cancel);
    box.append(buttons);
  }
  overlay.append(box);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) act({ type: 'cancel' });
  });
  return overlay;
}

function render(s) {
  const previousScroll = root.querySelector('.list ul')?.scrollTop ?? 0;
  const frag = document.createDocumentFragment();
  frag.append(header(s));
  const body = el('div', 'body');
  body.append(list(s), detail(s.detail));
  frag.append(body);
  const foot = el('footer', '', s.hints);
  frag.append(foot);
  if (s.notice) frag.append(el('div', `notice ${s.notice.tone}`, s.notice.text));
  if (s.panel) frag.append(panel(s.panel));
  root.replaceChildren(frag);

  const ul = root.querySelector('.list ul');
  if (ul) {
    ul.scrollTop = previousScroll;
    ul.querySelector('.selected')?.scrollIntoView({ block: 'nearest' });
  }
  root.querySelector('.wheel .selected')?.scrollIntoView({ block: 'center' });
  const input = root.querySelector('input.text');
  if (input) {
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }
}

window.cyberSettings.onState(render);
window.cyberSettings.ready();
