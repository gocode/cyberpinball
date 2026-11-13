// Schéma des manettes du casque (maquette validée le 13 novembre 2026) :
// les deux manettes au trait blanc, la ou les commandes à actionner en vert signal ; les sticks à enfoncer ont une
// flèche d'enfoncement. Un seul composant, partout où une commande des manettes est demandée (calage, carte du
// geste, assistant des manettes, consignes). Profil Touch seulement : pour un autre, pas de dessin (un dessin faux
// tromperait), le texte suffit. Commandes : clic-joystick-gauche|droit, gachette-gauche|droite,
// poignee-gauche|droite, a, b, x, y, menu-gauche. Styles dans frontend.css (.schema-manettes) : la CSP interdit les
// styles en ligne.

/* exported schemaManettes, SCHEMA_PROFILES */
const SCHEMA_PROFILES = ['touch'];

/** Une manette (dessinée pour la gauche ; la droite en miroir, les lettres à l'endroit). */
function schemaManette(cote, vert) {
  const g = cote === 'gauche';
  const on = (nom) => vert.includes(nom);
  const piece = (nom) => `schema-piece${on(nom) ? ' schema-vert' : ''}`;
  const m = (x) => (g ? x : 240 - x);
  const stick = on(g ? 'clic-joystick-gauche' : 'clic-joystick-droit');
  const lettres = g ? [['y', 150, 126], ['x', 154, 162]] : [['b', 150, 126], ['a', 154, 162]];
  return `<g>
    <path d="M ${m(92)} 186 C ${m(86)} 232, ${m(96)} 282, ${m(120)} 290 C ${m(144)} 292, ${m(154)} 262, ${m(152)} 192 Z" class="schema-corps"/>
    <path d="M ${m(94)} 204 C ${m(76)} 218, ${m(78)} 250, ${m(96)} 262 C ${m(100)} 244, ${m(100)} 222, ${m(98)} 206 Z" class="${piece(`poignee-${cote}`)}"/>
    <path d="M ${m(168)} 178 C ${m(194)} 184, ${m(200)} 214, ${m(184)} 236 C ${m(172)} 228, ${m(166)} 208, ${m(160)} 194 Z" class="${piece(`gachette-${cote}`)}"/>
    <ellipse cx="${m(108)}" cy="92" rx="86" ry="70" class="schema-anneau"/>
    <ellipse cx="${m(120)}" cy="148" rx="70" ry="54" class="schema-corps"/>
    <circle cx="${m(100)}" cy="140" r="25" class="schema-corps"/>
    <circle cx="${m(100)}" cy="140" r="16" class="${piece(g ? 'clic-joystick-gauche' : 'clic-joystick-droit')}"/>
    ${lettres.map(([n, x, y]) => `<circle cx="${m(x)}" cy="${y}" r="12" class="${piece(n)}"/><text x="${m(x)}" y="${y + 6}" font-size="15" class="schema-lettre${on(n) ? ' schema-sur-vert' : ''}">${n.toUpperCase()}</text>`).join('')}
    ${g ? `<circle cx="${m(130)}" cy="186" r="6" class="${piece('menu-gauche')}"/>` : ''}
    ${stick ? `<path d="M ${m(100)} 58 L ${m(100)} 104" class="schema-fleche"/><path d="M ${m(88)} 92 L ${m(100)} 108 L ${m(112)} 92" class="schema-fleche"/><circle cx="${m(100)}" cy="140" r="32" class="schema-onde"/>` : ''}
  </g>`;
}

/**
 * La paire de manettes, `vert` : les commandes en vert ; `classe` : la taille, posée par la feuille de style
 * (schema-grand, schema-moyen, schema-petit). undefined pour un profil sans dessin.
 */
function schemaManettes(vert, classe, profile = 'touch') {
  if (!SCHEMA_PROFILES.includes(profile)) return undefined;
  const box = document.createElement('div');
  box.className = `schema-manettes ${classe}`;
  box.setAttribute('aria-hidden', 'true');
  // Les lettres A, B, X, Y sont du dessin, pas du texte à lire : la commande à presser est aussi écrite sous le
  // schéma. Le garde-fou de mise en page (layout-check.ts, 20 px au moins) ne les mesure donc pas.
  box.dataset.belowFloor = '';
  box.innerHTML = `<svg viewBox="0 0 520 300" xmlns="http://www.w3.org/2000/svg"><g transform="translate(10 0)">${schemaManette('gauche', vert)}</g><g transform="translate(270 0)">${schemaManette('droite', vert)}</g></svg>`;
  return box;
}
