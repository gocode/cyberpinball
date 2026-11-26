// Root Access (root-access.ts) : le fronton de la borne pendant le jeu. À la place du média de la table (PuP-Pack,
// vidéo), une carte propre au jeu : le titre, la tour des étages (allumés jusqu'à l'étage joué) et le nom de
// l'étage. Le DMD, lui, est dessiné par le processus principal (packages/core/src/root-access-dmd.ts) ; ici, sa
// zone ne montre que le fond. Même principe que les Applications : zone() rend vrai quand la zone est prise.
(function () {
  'use strict';

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  };
  const cards = new Map();

  function build(v) {
    const card = el('div', 'ra-card');
    const tower = el('div', 'ra-tower');
    for (let i = v.floors; i >= 1; i--) tower.append(el('div', 'ra-floor'));
    card.append(
      el('div', 'ra-title', 'ROOT ACCESS'), // i18n-ignore : nom du jeu
      tower,
      el('div', 'ra-level'),
      el('div', 'ra-name'),
    );
    return card;
  }

  /** Les étages allumés : jusqu'à celui qu'on joue (tous à la victoire, aucun avant la partie). */
  function update(card, v) {
    const lit = v.screen === 'titre' ? 0 : v.screen === 'won' ? v.floors : v.floor;
    [...card.querySelectorAll('.ra-floor')].forEach((node, i) => {
      const n = v.floors - i;
      node.classList.toggle('ra-on', n <= lit);
      node.classList.toggle('now', v.screen !== 'titre' && v.screen !== 'won' && n === v.floor);
    });
    card.dataset.screen = v.screen;
    card.querySelector('.ra-level').textContent = v.screen === 'titre' ? '' : `${v.floor} / ${v.floors}`;
    card.querySelector('.ra-name').textContent = v.screen === 'titre' ? '' : v.name;
  }

  function zone(node, part, s) {
    const v = s.rootAccess;
    const old = cards.get(node);
    if (!v || (part !== 'backglass' && part !== 'dmd')) {
      if (old) {
        old.remove();
        cards.delete(node);
      }
      return false;
    }
    // Le DMD : ses points viennent du processus principal ; ici, rien d'autre que le fond de la zone.
    if (part === 'dmd') return true;
    let card = old;
    if (!card || card.dataset.floors !== String(v.floors)) {
      old?.remove();
      card = build(v);
      card.dataset.floors = String(v.floors);
      node.append(card);
      cards.set(node, card);
    }
    update(card, v);
    return true;
  }

  window.CyberRootAccess = { zone };
})();
