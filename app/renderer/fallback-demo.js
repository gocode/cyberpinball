// Page de démonstration des replis intégrés (fallback-demo.html).

/** Jeux d'exemple : titres très courts et très longs, accents, champs absents ; le dernier, aucun jeu (la marque). */
const SAMPLES = [
  { title: 'Ali', manufacturer: 'Stern', year: 1980 },
  { title: 'Terminator 2: Judgment Day', manufacturer: 'Williams', year: 1991 },
  { title: 'The Addams Family Special Collectors Edition', manufacturer: 'Bally', year: 1994 },
  { title: 'Le Bœuf à la mode : élégie pour un été très chaud', manufacturer: 'Société Française d’Électromécanique Ludique', year: 1978 },
  { title: 'Supercalifragilisticexpialidocious' },
  { title: 'Œil de Lynx', manufacturer: 'Gottlieb' },
  {},
];

const COMPONENTS = {
  backglass: 'Fronton',
  dmd: 'Afficheur 128 × 32',
  fulldmd: 'Afficheur large 16:9',
  topper: 'Topper',
  wheel: 'Logo (liste)',
  playfield: 'Fond du plateau',
  loading: 'Chargement',
  ingame: 'En partie',
};

const MOUNT = {
  backglass: CyberFallback.backglass,
  dmd: CyberFallback.dmd,
  fulldmd: CyberFallback.fullDmd,
  topper: CyberFallback.topper,
  wheel: CyberFallback.wheel,
  playfield: CyberFallback.playfield,
  loading: CyberFallback.loading,
  ingame: CyberFallback.inGame,
};

const params = new URLSearchParams(location.search);
const stage = document.getElementById('stage');
const handles = [];

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Commandes de la partie, comme les montre le menu, pour remplir l'emplacement du chargement. */
function sampleKeys() {
  const box = el('div', 'demo-keys');
  box.append(el('h2', '', 'Commandes de la partie'));
  const table = el('table');
  for (const [label, key] of [
    ['Flippers', 'Maj gauche · Maj droite'],
    ['Lancer la bille', 'Entrée'],
    ['Secouer la table', 'Espace'],
    ['Quitter la partie', 'Échap'],
  ]) {
    const tr = el('tr');
    tr.append(el('td', '', label), el('td', '', key));
    table.append(tr);
  }
  box.append(table);
  return box;
}

function mount(kind, target, game, options) {
  const handle = MOUNT[kind](target, game, options);
  if (kind === 'loading') handle.slot.append(sampleKeys());
  handles.push(handle);
  return handle;
}

/** Un composant plein cadre, pour les captures. */
function single(kind) {
  document.documentElement.dataset.rotation = params.get('rotation') ?? '0';
  document.body.classList.add('demo-single');
  const game = SAMPLES[Number(params.get('jeu') ?? 1)] ?? SAMPLES[1];
  // Couleur réglée des afficheurs à points (« Couleur du DMD »), en hexadécimal sans « # ».
  if (params.get('couleur')) CyberFallback.setDmdColor(`#${params.get('couleur')}`);
  mount(kind, stage, game, { animate: params.get('anime') !== '0', style: params.get('style') ?? undefined, page: Number(params.get('page') ?? 0) });
}

/** Galerie : chaque composant à plusieurs proportions, pour un jeu. */
function gallery() {
  let index = 1;
  let animate = true;
  const frames = [
    ['backglass', [[16, 9], [4, 3], [3, 1], [3, 4]]],
    ['dmd', [[4, 1], [16, 9]]],
    ['fulldmd', [[16, 9], [4, 3]]],
    ['topper', [[4, 1], [3, 1], [16, 9], [1, 1]]],
    ['wheel', [[3, 1], [2, 1], [4, 3]]],
    ['playfield', [[16, 9], [9, 16]]],
    ['loading', [[16, 9], [9, 16]]],
    ['ingame', [[16, 9], [4, 1], [9, 16]]],
  ];
  const draw = () => {
    for (const h of handles.splice(0)) h.destroy();
    const game = SAMPLES[index];
    const head = el('header', 'demo-head');
    head.append(
      el('h1', '', 'Replis intégrés'),
      el('p', '', `Exemple ${index + 1} / ${SAMPLES.length} : ${game.title ?? 'aucun jeu (la marque)'}${game.manufacturer ? `, ${game.manufacturer}` : ''}${game.year ? `, ${game.year}` : ''}`),
      el('p', 'demo-hint', `← → : autre exemple · A : ${animate ? 'figer' : 'animer'}`),
    );
    const grid = el('div', 'demo-grid');
    for (const [kind, ratios] of frames) {
      const row = el('section', 'demo-row');
      row.append(el('h2', '', COMPONENTS[kind]));
      const list = el('div', 'demo-frames');
      for (const [w, h] of ratios) {
        const figure = el('figure', 'demo-frame');
        const box = el('div', `demo-box${kind === 'wheel' ? ' demo-checker' : ''}`);
        box.style.aspectRatio = `${w} / ${h}`;
        box.style.width = `${Math.min(360, (200 * w) / h)}px`;
        figure.append(box, el('figcaption', '', `${w}:${h}`));
        list.append(figure);
        mount(kind, box, game, { animate });
      }
      row.append(list);
      grid.append(row);
    }
    stage.replaceChildren(head, grid);
  };
  addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') index = (index + 1) % SAMPLES.length;
    else if (e.key === 'ArrowLeft') index = (index + SAMPLES.length - 1) % SAMPLES.length;
    else if (e.key.toLowerCase() === 'a') animate = !animate;
    else return;
    draw();
  });
  draw();
}

const kind = params.get('composant');
if (kind && MOUNT[kind]) single(kind);
else gallery();

// Pour les captures sans opérateur (docs/demo-replis.mjs) : prêt une fois les polices
// chargées et deux images dessinées ; défauts relevés par les composants eux-mêmes.
window.demoProblems = () => handles.flatMap((h) => h.problems());
document.fonts.ready.then(() =>
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      document.body.dataset.ready = '1';
    }),
  ),
);
