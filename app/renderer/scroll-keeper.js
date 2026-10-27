// Défilement des listes gardé d'un rendu à l'autre : le seul endroit qui fait défiler une liste
// (frontend.js et library.js pour le menu, settings.js pour les réglages de VPX).
//
// Chaque état reçu du processus principal redessine l'écran : les listes sont neuves et
// repartent en haut. Octobre 2026, « Chargement : propositions » de The Matrix : pendant un
// téléchargement, chaque tic de progression redessinait la liste, puis l'élément choisi y était
// ramené (scrollIntoView). Impossible de parcourir les autres propositions à la molette ;
// même chose sur tout écran qui se met à jour seul (Téléchargements, Récupérés et attendus…).
//
// La règle : la position d'une liste ne suit que les gestes de l'utilisateur. Un rendu remet
// chaque liste où elle était ; l'élément choisi n'est ramené dans la vue que lorsque le choix
// change (flippers, Tab, clic) ou qu'un autre écran s'ouvre. Une liste dont le contenu change
// de nature garde sa clé à elle (data-scroll-key) : elle repart alors du haut.
// Ce qu'on voit ne bouge pas non plus : l'élément choisi, s'il était dans la vue, reste au même
// endroit de sa liste quand une mise à jour insère quelque chose au-dessus (le bandeau « Non
// connecté » d'un site qui arrive en tête des propositions de GOTG poussait la tuile choisie
// hors de la galerie, octobre 2026) ; s'il y était entier et qu'il grandit (pastille « Choisi,
// à enregistrer »), la liste avance juste assez pour qu'il le reste.
//
// Une liste que l'utilisateur a éloignée du choix (molette, barre de défilement) porte
// data-user-scroll jusqu'au prochain changement de choix : le garde-fou de mise en page ne lui
// reproche pas un choix hors de la vue.
//
// Diagnostic : une liste qui défile sans geste de l'utilisateur (molette, pointeur, clavier dans
// la page) ni rendu d'ici est notée dans la console et relevée par le garde-fou de mise en page
// (app/src/layout-check.ts, « défilement sans geste »). Le test defilement.test.ts refuse tout
// scrollIntoView ou scrollTop posé ailleurs que dans ce fichier.

const CyberScroll = (() => {
  /** Un défilement dans ce délai après un geste de l'utilisateur est le sien. */
  const GESTURE_MS = 1500;
  let lastGesture = -Infinity;
  /** Position posée ici (ou suivie d'un geste) : un événement scroll qui l'atteint est attendu. */
  const expected = new WeakMap();
  const drifts = [];

  const gesture = () => {
    lastGesture = Date.now();
  };
  for (const type of ['wheel', 'pointerdown', 'mousedown', 'keydown', 'touchstart']) {
    document.addEventListener(type, gesture, { capture: true, passive: true });
  }

  const positionOf = (node) => [node.scrollTop || 0, node.scrollLeft || 0];
  const same = (a, b) => Boolean(a && b) && Math.abs(a[0] - b[0]) <= 1 && Math.abs(a[1] - b[1]) <= 1;

  /** Nom d'un élément dans sa clé : balise, classe de base, clé de contenu éventuelle. */
  const baseOf = (node) => `${node.tagName}.${typeof node.className === 'string' ? node.className.trim().split(/\s+/)[0] : ''}${node.dataset?.scrollKey ? `[${encodeURIComponent(node.dataset.scrollKey)}]` : ''}`;

  /** Chemin de l'élément depuis `root`, d'un rendu à l'autre : base et rang parmi les frères de même base. */
  function keyOf(node, root) {
    const parts = [];
    for (let n = node; n && n !== root; n = n.parentElement) {
      const base = baseOf(n);
      let rank = 0;
      for (let s = n.previousElementSibling; s; s = s.previousElementSibling) if (baseOf(s) === base) rank++;
      parts.push(`${base}:${rank}`);
    }
    return parts.reverse().join('>');
  }

  /** L'élément du nouveau rendu qui porte cette clé. */
  function find(root, key) {
    let node = root;
    for (const part of key.split('>')) {
      const at = part.lastIndexOf(':');
      const base = part.slice(0, at);
      let rank = Number(part.slice(at + 1));
      let next;
      for (let c = node.firstElementChild; c; c = c.nextElementSibling) {
        if (baseOf(c) === base && rank-- === 0) {
          next = c;
          break;
        }
      }
      if (!next) return undefined;
      node = next;
    }
    return node;
  }

  const byUser = (node) => node.dataset?.userScroll !== undefined;

  /** Éléments défilés sous `root` (ou éloignés du choix par l'utilisateur), avec leur position. */
  function scrolled(root) {
    const out = [];
    for (const node of root.querySelectorAll('*')) {
      const at = positionOf(node);
      if (at[0] || at[1] || byUser(node)) out.push([node, at]);
    }
    return out;
  }

  // Un défilement que ni un geste ni ce fichier n'explique : noté pour le diagnostic.
  document.addEventListener(
    'scroll',
    (event) => {
      const node = event.target;
      if (!node || node.nodeType !== 1 || !node.isConnected) return;
      const now = positionOf(node);
      if (same(expected.get(node), now)) return;
      if (Date.now() - lastGesture > GESTURE_MS) {
        const drift = `${keyOf(node, document.body)} → ${now[0]}`;
        drifts.push(drift);
        console.warn(`Défilement sans geste de l'utilisateur : ${drift}`);
      } else node.dataset.userScroll = '';
      expected.set(node, now);
    },
    { capture: true, passive: true },
  );

  /** La liste qui fait défiler `node` (sans mise en page, comme sous linkedom : aucune). */
  function listOf(node) {
    if (typeof getComputedStyle !== 'function') return undefined;
    for (let n = node.parentElement; n; n = n.parentElement) {
      if (/^(auto|scroll)$/.test(getComputedStyle(n).overflowY ?? '') && n.scrollHeight > n.clientHeight) return n;
    }
    return undefined;
  }

  /** Écart entre le haut de `node` et celui de sa liste, à l'écran. */
  const offsetIn = (node, list) => node.getBoundingClientRect().top - list.getBoundingClientRect().top;
  /** `node` entier dans la vue de sa liste. */
  const wholeIn = (node, list) => {
    const r = node.getBoundingClientRect();
    const c = list.getBoundingClientRect();
    return r.top >= c.top - 1 && r.bottom <= c.bottom + 1;
  };

  /**
   * Gardien d'une fenêtre : capture(root) juste avant de redessiner `root`, settle(root, screen)
   * juste après. `screen` nomme l'écran (un autre écran repart du haut). `reveal` donne les
   * éléments choisis à garder visibles, [sélecteur, block] (block de scrollIntoView).
   */
  function keeper(reveal) {
    let last;
    let captured = [];
    let anchors = [];
    const chosenIn = (root) => reveal.flatMap(([selector, block]) => [...root.querySelectorAll(selector)].map((node) => [node, block]));
    return {
      capture(root) {
        captured = scrolled(root).map(([node, at]) => [keyOf(node, root), at, byUser(node)]);
        // Élément choisi dans la vue de sa liste : il y restera à la même place.
        anchors = [];
        chosenIn(root).forEach(([node], rank) => {
          const list = listOf(node);
          if (!list || !root.contains(list)) return;
          const offset = offsetIn(node, list);
          if (offset + node.getBoundingClientRect().height > 0 && offset < list.clientHeight) anchors.push([rank, offset, wholeIn(node, list)]);
        });
      },
      settle(root, screen) {
        const chosen = chosenIn(root);
        const selection = chosen.map(([node]) => node.dataset?.act ?? keyOf(node, root)).join('|');
        const sameScreen = last !== undefined && last.screen === screen;
        // Listes déplacées ici, même revenues en haut : leurs événements scroll sont attendus.
        const moved = new Set();
        if (sameScreen) {
          for (const [key, [top, left], user] of captured) {
            const node = find(root, key);
            if (!node) continue;
            node.scrollTop = top;
            node.scrollLeft = left;
            if (user) node.dataset.userScroll = '';
            moved.add(node);
          }
        }
        if (sameScreen && selection === last.selection) {
          // Même choix : le rang parmi les éléments choisis désigne le même élément.
          for (const [rank, offset, whole] of anchors) {
            const node = chosen[rank]?.[0];
            const list = node && listOf(node);
            if (!list) continue;
            list.scrollTop += offsetIn(node, list) - offset;
            if (whole && !wholeIn(node, list)) node.scrollIntoView({ block: 'nearest', inline: 'nearest' });
            moved.add(list);
          }
        } else {
          for (const [node, block] of chosen) {
            node.scrollIntoView?.({ block, inline: 'nearest' });
            for (let n = node.parentElement; n; n = n.parentElement) {
              moved.add(n);
              delete n.dataset?.userScroll;
            }
          }
        }
        for (const node of moved) expected.set(node, positionOf(node));
        for (const [node, at] of scrolled(root)) expected.set(node, at);
        captured = [];
        anchors = [];
        last = { screen, selection };
      },
    };
  }

  return {
    keeper,
    /** Geste simulé (autopilote des essais) : le défilement qui suit est voulu. */
    gesture,
    /** Défilements sans geste relevés depuis le dernier appel (garde-fou de mise en page). */
    takeDrifts: () => drifts.splice(0),
  };
})();

if (typeof module === 'object') module.exports = { CyberScroll };
