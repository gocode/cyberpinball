// Garde-fou de mise en page, pour les essais sans opérateur : après chaque touche
// rejouée, chaque fenêtre est inspectée dans son rendu réel. Sont signalés :
// - deux textes ou commandes qui se chevauchent à l'écran (le compte à rebours
//   dessiné sur les boutons d'action, par exemple) ;
// - un texte ou une commande qui sort de la fenêtre ;
// - un texte coupé par un conteneur qui masque ce qui dépasse (overflow: hidden),
//   lui-même compris ;
// - une image ou une vidéo qui ne se charge pas (protocole des médias non branché,
//   fichier absent, format illisible) : l'aperçu montrerait une icône cassée ;
// - une image plus grande que sa boîte, qui en sort (logo du lancement en cinéma compris) ;
// - un texte ou une icône plus petits que 20 px (plancher du design system) tels qu'on les
//   voit, réduits par un transform compris (médaillons de la roue).
// Une superposition voulue (aide, menu par-dessus le menu des tables) n'est pas un
// chevauchement : le calque du dessus a un fond opaque qui cache celui du dessous.
// Une coupure voulue non plus : « … » posé par le texte ou par le conteneur qui le coupe
// (text-overflow n'est pas hérité), ou nombre de lignes limité (-webkit-line-clamp) ;
// seule la partie visible d'un texte compte alors (les lignes masquées ne chevauchent rien).
// Un texte limité en lignes qui coupe vraiment doit avoir un interligne d'au moins 1,2 :
// plus serré, l'accent d'une capitale de la ligne masquée dépasse sous la dernière ligne
// gardée (Saira dépasse sa ligne de 0,24 em vers le haut).
// Un voile décoratif (data-veil) ne doit jamais passer au-dessus d'un texte : le texte
// resterait là, mais assombri (menu en borne, octobre 2026).
// Enfin, les zones marquées data-stable (menu des tables) ne doivent pas bouger d'une
// touche à l'autre : même fenêtre, même taille, même présentation, même position au
// demi-pixel près. Changer de table ne change que leur contenu.
// Sur un écran sans playfield (fronton, DMD, topper), le fond du playfield ne doit pas se voir :
// seulement les zones des rôles, sur du noir.
// Les zones du menu (data-frame : cadre du plateau d'un côté, roue, fronton et informations de
// l'autre) ne se recouvrent pas et restent dans la zone du playfield.
// Au chargement d'une table : en borne, aucun texte de l'interface sur le média ; au bureau,
// l'encart du titre et des commandes ne recouvre pas le cadre du média.
// Une liste qui défile n'a jamais de fondu (mask-image), et son choix courant s'y voit en entier.
// Le lancement en cinéma traverse les écrans : le logo qui en sort n'est pas « coupé ».
// Une liste ne défile jamais sans geste de l'utilisateur (app/renderer/scroll-keeper.js) : un
// rendu qui la ramène ailleurs, un tic de progression par exemple, est signalé.
// Les problèmes vont dans la console et dans <captures>\mise-en-page.txt.

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { WebContents } from 'electron';

/** Exécuté dans la page : renvoie la liste des problèmes, en clair. */
const SCRIPT = /* i18n-ignore : script de page, du code ; ses constats vont au rapport du développeur */ String.raw`(() => {
  const T = 2;
  const vw = innerWidth, vh = innerHeight;
  const label = (el) => {
    const text = (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 50);
    const id = el.id ? '#' + el.id : '';
    const cls = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).join('.') : '';
    const icon = el.getAttribute('data-icon') ? '[' + el.getAttribute('data-icon') + ']' : '';
    return el.tagName.toLowerCase() + id + cls + icon + (text ? ' « ' + text + ' »' : '');
  };
  const shown = (el) => {
    for (let e = el; e; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) < 0.05) return false;
    }
    return true;
  };
  // Somme des rotations des ancêtres : un quart de tour couche le texte.
  const turn = (el) => {
    let angle = 0;
    for (let e = el; e; e = e.parentElement) {
      const m = getComputedStyle(e).transform.match(/^matrix\(([^)]+)\)/);
      if (m) {
        const [a, b] = m[1].split(',').map(Number);
        angle += Math.atan2(b, a);
      }
    }
    return angle;
  };
  const quarterTurned = (el) => Math.abs(Math.sin(turn(el))) > 0.7;
  // Ce qu'un conteneur laisse voir de ce qui dépasse : sa boîte s'il masque (overflow), ou celle de son
  // clip-path: inset() (la roue fait entrer et sortir ses logos par ses bords, pas par ceux de l'écran).
  // Les marges de inset() suivent la boîte de l'élément : dans une vue pivotée d'un quart de tour, son
  // haut est à droite (ou à gauche) de l'écran.
  const clipOf = (e) => {
    const s = getComputedStyle(e);
    const c = e.getBoundingClientRect();
    if (![s.overflowX, s.overflowY].every((o) => o === 'visible')) return { left: c.left, right: c.right, top: c.top, bottom: c.bottom };
    const m = /^inset\(([^)]*)\)/.exec(s.clipPath || '');
    if (!m) return undefined;
    const [t, r = t, b = t, l = r] = m[1].split(/\s+round\s+/)[0].trim().split(/\s+/);
    const len = (x, size) => (x.endsWith('%') ? (parseFloat(x) * size) / 100 : parseFloat(x));
    const local = [len(t, e.offsetHeight), len(r, e.offsetWidth), len(b, e.offsetHeight), len(l, e.offsetWidth)];
    const q = (((Math.round(turn(e) / (Math.PI / 2)) % 4) + 4) % 4);
    const side = [0, 1, 2, 3].map((i) => local[(i - q + 4) % 4]);
    return { left: c.left + side[3], right: c.right - side[1], top: c.top + side[0], bottom: c.bottom - side[2] };
  };
  const boxes = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n; (n = walker.nextNode()); ) {
    if (!n.textContent.trim()) continue;
    const el = n.parentElement;
    if (!el || !shown(el)) continue;
    const range = document.createRange();
    range.selectNodeContents(n);
    // La boîte d'un texte va de l'ascendante à la descendante de la police (environ
    // 1,33 fois sa taille) : avec un interligne serré, deux lignes voisines se
    // recouvrent sans que leurs lettres se touchent. On garde la hauteur de la police.
    // Dans une vue pivotée d'un quart de tour (playfield vu de côté), cette hauteur est horizontale.
    const size = parseFloat(getComputedStyle(el).fontSize);
    const sideways = quarterTurned(el);
    for (const r of range.getClientRects()) {
      if (r.width <= 1 || r.height <= 1) continue;
      if (sideways) {
        const inset = Math.max(0, (r.width - size) / 2);
        boxes.push({ el, text: true, r: { left: r.left + inset, right: r.right - inset, top: r.top, bottom: r.bottom } });
      } else {
        const inset = Math.max(0, (r.height - size) / 2);
        boxes.push({ el, text: true, r: { left: r.left, right: r.right, top: r.top + inset, bottom: r.bottom - inset } });
      }
    }
  }
  for (const el of document.querySelectorAll('button, [data-act], input, select, textarea, svg.icon')) {
    if (!shown(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width > 1 && r.height > 1) boxes.push({ el, r });
  }
  const problems = new Set();
  const opaque = (el) => {
    const c = getComputedStyle(el).backgroundColor.match(/[\d.]+/g);
    return c && (c.length < 4 ? true : Number(c[3]) >= 0.8);
  };
  // Le calque de « top » cache-t-il « bottom » par un fond opaque, entre eux deux ?
  const masked = (top, bottom, x, y) => {
    for (let e = top; e && !e.contains(bottom); e = e.parentElement) {
      const r = e.getBoundingClientRect();
      if (opaque(e) && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return true;
    }
    return false;
  };
  // Coupure voulue par ce conteneur : « … » en fin de ligne, ou lignes limitées.
  const truncates = (e) => {
    const s = getComputedStyle(e);
    return s.textOverflow === 'ellipsis' || (s.webkitLineClamp && s.webkitLineClamp !== 'none');
  };
  // Partie réellement visible de chaque boîte : un conteneur qui masque ce qui dépasse
  // la rogne (ce qui dépasse est signalé plus bas comme coupé, pas comme chevauchement).
  // Pour un texte, l'élément qui le porte compte aussi (lignes masquées par line-clamp).
  const seen = boxes.map(({ el, r, text }) => {
    let v = { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    for (let e = text ? el : el.parentElement; e && e !== document.body; e = e.parentElement) {
      const c = clipOf(e);
      if (!c) continue;
      v = { left: Math.max(v.left, c.left), right: Math.min(v.right, c.right), top: Math.max(v.top, c.top), bottom: Math.min(v.bottom, c.bottom) };
    }
    return v;
  });
  for (let i = 0; i < boxes.length; i++) {
    const a = boxes[i];
    for (let j = i + 1; j < boxes.length; j++) {
      const b = boxes[j];
      if (a.el === b.el || a.el.contains(b.el) || b.el.contains(a.el)) continue;
      const va = seen[i], vb = seen[j];
      const w = Math.min(va.right, vb.right) - Math.max(va.left, vb.left);
      const h = Math.min(va.bottom, vb.bottom) - Math.max(va.top, vb.top);
      if (w <= T || h <= T) continue;
      const x = Math.max(va.left, vb.left) + w / 2;
      const y = Math.max(va.top, vb.top) + h / 2;
      const hit = document.elementFromPoint(x, y);
      if (!hit) continue;
      const onA = a.el === hit || a.el.contains(hit) || hit.contains(a.el);
      const onB = b.el === hit || b.el.contains(hit) || hit.contains(b.el);
      if (!onA && !onB) continue; // un troisième élément couvre les deux
      const [top, bottom] = onA ? [a.el, b.el] : [b.el, a.el];
      if (masked(top, bottom, x, y)) continue;
      const at = (v) => '[' + [v.left, v.top, v.right, v.bottom].map(Math.round).join(', ') + ']';
      problems.add('chevauchement : ' + [label(a.el) + ' ' + at(va), label(b.el) + ' ' + at(vb)].sort().join(' et '));
    }
  }
  boxes.forEach(({ el, r }, i) => {
    // Lancement en cinéma : le logo (ou le titre de son médaillon) sort de son écran par le haut
    // et entre dans le fronton par le bas ; rogné par l'écran qu'il traverse, c'est voulu.
    if (el.closest('.cinema')) return;
    let scrolled = false;
    // Coupure voulue : « … » ou lignes limitées, par le texte lui-même ou par le premier
    // conteneur qui le coupe. Elle n'excuse que ce conteneur : ce qui en reste visible (les
    // lignes gardées) ne doit être rogné par aucun autre. Un titre limité à deux lignes dans
    // une zone haute d'une seule perdait sa première ligne sans être signalé (octobre 2026).
    let kept = { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    let excuse = truncates(el);
    for (let e = el; e && e !== document.body; e = e.parentElement) {
      const s = getComputedStyle(e);
      const clip = [s.overflowX, s.overflowY];
      if (clip.some((o) => o === 'auto' || o === 'scroll')) { scrolled = true; break; }
      if (!clip.some((o) => o === 'hidden' || o === 'clip')) continue;
      const c = e.getBoundingClientRect();
      if (excuse || truncates(e)) {
        kept = { left: Math.max(kept.left, c.left), right: Math.min(kept.right, c.right), top: Math.max(kept.top, c.top), bottom: Math.min(kept.bottom, c.bottom) };
        excuse = false;
        if (kept.right - kept.left <= T || kept.bottom - kept.top <= T) break; // ligne masquée par la coupure voulue
        continue;
      }
      if (kept.left < c.left - T || kept.right > c.right + T || kept.top < c.top - T || kept.bottom > c.bottom + T) {
        problems.add('coupé : ' + label(el) + ' par ' + label(e).slice(0, 60));
        break;
      }
    }
    // Hors de la fenêtre : la partie visible seulement (un texte coupé avec « … » reste dedans).
    const v = seen[i];
    if (!scrolled && v.right - v.left > T && v.bottom - v.top > T && (v.left < -T || v.top < -T || v.right > vw + T || v.bottom > vh + T)) problems.add('hors de la fenêtre : ' + label(el));
  });
  // Lignes limitées avec un interligne trop serré : l'encre de la ligne masquée dépasse.
  for (const el of document.querySelectorAll('*')) {
    const s = getComputedStyle(el);
    if (!s.webkitLineClamp || s.webkitLineClamp === 'none' || !shown(el)) continue;
    if (el.scrollHeight <= el.clientHeight + 1) continue;
    const ratio = parseFloat(s.lineHeight) / parseFloat(s.fontSize);
    if (ratio < 1.19) problems.add('interligne trop serré (' + ratio.toFixed(2) + ') pour des lignes limitées : ' + label(el));
  }
  // Voile décoratif (data-veil) dessiné au-dessus d'un texte : le texte est là mais
  // assombri. Le voile, sans pointeur, est rendu « touchable » le temps de la mesure.
  const veils = [...document.querySelectorAll('[data-veil]')];
  if (veils.length) {
    const saved = veils.map((v) => v.style.pointerEvents);
    veils.forEach((v) => (v.style.pointerEvents = 'auto'));
    boxes.forEach(({ el }, i) => {
      if (veils.some((v) => v.contains(el))) return;
      const s = seen[i];
      if (s.right - s.left <= T || s.bottom - s.top <= T) return;
      const stack = document.elementsFromPoint((s.left + s.right) / 2, (s.top + s.bottom) / 2);
      const veil = stack.findIndex((e) => veils.includes(e));
      const text = stack.findIndex((e) => e === el || el.contains(e) || e.contains(el));
      if (veil >= 0 && text >= 0 && veil < text) problems.add('sous un voile : ' + label(el));
    });
    veils.forEach((v, i) => (v.style.pointerEvents = saved[i]));
  }
  // Écran sans playfield (fronton, DMD, topper : html.annex) : rien du fond du playfield, seulement
  // les zones sur du noir (Poste à 3 écrans, octobre 2026 : le cadre 9:16 du plateau, celui du menu
  // au bureau, dessiné autour d'une bande DMD).
  if (document.documentElement.classList.contains('annex')) {
    const bg = document.getElementById('media-bg');
    if (bg && shown(bg) && bg.getBoundingClientRect().width > T) problems.add('fond du playfield sur un écran sans playfield : ' + label(bg));
  }
  // Écran de chargement d'une table (html.loading-phase, octobre 2026). En
  // borne, le média de chargement seul : aucun texte de l'interface sur le playfield, sauf le
  // repli du média (.cp-fb-loading : marque, titre, sans son libellé) et l'aide-mémoire du
  // réglage de l'affichage (.display-reminder). Au bureau, l'encart du titre et des commandes
  // ne recouvre pas le cadre du média, chants compris (20 sur un petit côté de 1080), et tient
  // dans la zone du playfield ; le repli du média est posé exactement dans le cadre.
  const page = document.documentElement;
  const zone = document.getElementById('root');
  if (page.classList.contains('loading-phase') && zone) {
    if (page.classList.contains('menu-cab')) {
      for (const { el, text } of boxes) {
        if (!text || !zone.contains(el) || el.closest('.display-reminder')) continue;
        if (el.closest('.cp-fb-loading') && !el.closest('.cp-ld-label')) continue;
        problems.add('texte sur le chargement en borne : ' + label(el));
      }
    } else {
      const card = zone.querySelector('.loading-card');
      const frame = document.getElementById('media-bg');
      const z = zone.getBoundingClientRect();
      const edge = (20 * Math.min(z.width, z.height)) / 1080;
      const grow = (r, d) => ({ left: r.left - d, right: r.right + d, top: r.top - d, bottom: r.bottom + d });
      if (!card || !shown(card)) problems.add('chargement au bureau sans l’encart du titre et des commandes');
      else if (frame) {
        const a = grow(card.getBoundingClientRect(), edge), b = grow(frame.getBoundingClientRect(), edge);
        if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > T && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > T) problems.add('encart du chargement sur le cadre du média : ' + label(card).slice(0, 60));
        if (a.left < z.left - T || a.top < z.top - T || a.right > z.right + T || a.bottom > z.bottom + T) problems.add('encart du chargement hors de la zone du playfield : ' + label(card).slice(0, 60));
        const standIn = zone.querySelector('.loading-fallback.in-frame');
        if (standIn && shown(standIn)) {
          const s = standIn.getBoundingClientRect(), f = frame.getBoundingClientRect();
          if (['left', 'top', 'right', 'bottom'].some((k) => Math.abs(s[k] - f[k]) > 1)) problems.add('repli du média de chargement hors du cadre : ' + label(standIn).slice(0, 60));
        }
      }
    }
  }
  // Zones du menu (data-frame : le nom de la zone de chaque cadre, « plateau » ou « menu ») : deux
  // zones différentes ne se recouvrent jamais, et aucun cadre ne sort de la zone du playfield. Au
  // bureau en 4:3 (octobre 2026), le fronton et le bandeau de la roue couvraient presque tout le
  // cadre 9:16 du plateau sans que rien ne le dise : aucun texte ne s'y chevauchait. Les cadres
  // d'une même zone peuvent se recouvrir (la roue mord sur le bas du fronton) ; un cadre qui
  // couvre toute la zone du playfield est un fond (le média du plateau en borne), pas un cadre.
  if (zone) {
    const z = zone.getBoundingClientRect();
    const frames = [...document.querySelectorAll('[data-frame]')].filter((el) => shown(el)).map((el) => ({ el, r: el.getBoundingClientRect() })).filter(({ r }) => r.width > T && r.height > T && !(r.width >= z.width - T && r.height >= z.height - T));
    const at = (r) => '[' + [r.left, r.top, r.right, r.bottom].map(Math.round).join(', ') + ']';
    const name = (el) => el.dataset.frame + ' ' + label(el).split(' « ')[0];
    frames.forEach((a, i) => {
      if (a.r.left < z.left - T || a.r.top < z.top - T || a.r.right > z.right + T || a.r.bottom > z.bottom + T) problems.add('cadre hors de la zone du playfield : ' + name(a.el) + ' ' + at(a.r));
      for (const b of frames.slice(i + 1)) {
        if (a.el.dataset.frame === b.el.dataset.frame) continue;
        const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
        const h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
        if (w > T && h > T) problems.add('cadres qui se recouvrent : ' + [name(a.el) + ' ' + at(a.r), name(b.el) + ' ' + at(b.r)].sort().join(' et '));
      }
    });
  }
  // Liste qui défile : jamais de fondu (mask-image) sur elle, il fait passer la ligne du bord
  // pour désactivée (menu système, octobre 2026 : « Écrans et rôles ») ; et le choix courant
  // s'y voit en entier : ni rogné par la liste, ni caché par ce qui y reste accroché (bilan de
  // la santé). Un calque posé par-dessus la liste (attente, dialogue) n'est pas compté, ni une
// liste que l'utilisateur a lui-même éloignée du choix à la molette (data-user-scroll).
  const scrollsY = (e) => /^(auto|scroll)$/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + T;
  for (const el of document.querySelectorAll('*')) {
    if (!scrollsY(el) || !shown(el)) continue;
    const s = getComputedStyle(el);
    if ([s.maskImage, s.webkitMaskImage].some((m) => m && m !== 'none')) problems.add('fondu sur une liste qui défile : ' + label(el).slice(0, 60));
  }
  for (const el of document.querySelectorAll('.lib-action.current, .lib-row.selected, .health-line.selected, .media-card.selected')) {
    if (!shown(el)) continue;
    let list = el.parentElement;
    while (list && list !== document.body && !scrollsY(list)) list = list.parentElement;
    // Liste éloignée du choix par l'utilisateur lui-même, à la molette (scroll-keeper.js) : voulu.
    if (!list || list === document.body || list.hasAttribute('data-user-scroll')) continue;
    const r = el.getBoundingClientRect(), c = list.getBoundingClientRect();
    let whole = r.left >= c.left - T && r.right <= c.right + T && r.top >= c.top - T && r.bottom <= c.bottom + T;
    const d = Math.min(4, r.width / 4, r.height / 4);
    const points = [[(r.left + r.right) / 2, r.top + d], [(r.left + r.right) / 2, r.bottom - d], [r.left + d, (r.top + r.bottom) / 2], [r.right - d, (r.top + r.bottom) / 2]];
    for (const [x, y] of whole ? points : []) {
      const hit = document.elementFromPoint(x, y);
      if (hit && list.contains(hit) && !el.contains(hit) && !hit.contains(el)) whole = false;
    }
    if (!whole) problems.add('choix pas entier dans sa liste : ' + label(el).slice(0, 60));
  }
  // Liste de contenu (cartes, lignes à choisir, lignes de la Santé) sur un écran qui a d'autres
  // actions : dans son cadre, avec son repère (listzones.ts, library.js zoneFrame). Sans lui, Exit
  // sort de la liste sans qu'on puisse le savoir.
  for (const body of document.querySelectorAll('.lib-body')) {
    if (!shown(body) || !body.querySelector('.lib-actions > .lib-action')) continue;
    const loose = [...body.querySelectorAll('.lib-row.pick[data-act], .media-card[data-act], .health-line[data-act]')].find((el) => !el.closest('.lib-section.options') && !el.closest('.lib-zone')?.querySelector(':scope > .lib-zone-bar .lib-zone-tag'));
    if (loose) problems.add('liste de contenu sans cadre ni repère : ' + label(loose).slice(0, 60));
  }
  // Texte qui défile sans rien à choisir dedans : les boutons doivent pouvoir le faire défiler
  // (packages/core/src/reading.ts), ce qu'il dit par data-reading (texte d'un écran du menu, détail
  // des réglages de VPX). Sans lui, seules la molette et la barre de défilement l'atteignent : les
  // nouveautés d'une mise à jour restaient hors d'atteinte sur le PinCab (30 octobre 2026). Une
  // liste de choix sans choix courant le dit par data-choices.
  for (const el of document.querySelectorAll('*')) {
    if (!scrollsY(el) || !shown(el) || el.closest('[data-reading], [data-choices]')) continue;
    if (el.querySelector('[data-act], .selected, .current')) continue;
    problems.add('texte qui défile hors d’atteinte des boutons : ' + label(el).slice(0, 60));
  }
  // Image chargée sans pixels, vidéo en erreur : l'écran montrerait un aperçu cassé.
  for (const img of document.images) if (img.complete && img.getAttribute('src') && img.naturalWidth === 0) problems.add('image non chargée : ' + img.getAttribute('src').slice(0, 120));
  for (const video of document.querySelectorAll('video')) if (video.error) problems.add('vidéo non chargée : ' + (video.getAttribute('src') || '').slice(0, 120));
  // Image sortie de sa boîte : une grille dont la rangée suit la hauteur native de l'image ne la
  // borne plus (max-height: 100 %, height: 100 %) ; le logo du lancement en cinéma, une roue de
  // 1000 px, sortait par le bas du fronton, rogné et jamais centré (29/10/2026). Le cinéma n'est
  // pas mis à part ici : le logo s'envole avec sa boîte.
  for (const img of document.images) {
    const box = img.parentElement;
    if (!box || !img.naturalWidth || !shown(img)) continue;
    const r = img.getBoundingClientRect(), c = box.getBoundingClientRect();
    if (r.width <= T || r.height <= T) continue;
    if (r.left < c.left - T || r.top < c.top - T || r.right > c.right + T || r.bottom > c.bottom + T) problems.add('image hors de sa boîte : ' + label(img) + ' ' + Math.round(r.width) + '×' + Math.round(r.height) + ' dans ' + label(box).slice(0, 60) + ' ' + Math.round(c.width) + '×' + Math.round(c.height));
  }
  const px =1080 / Math.min(vw, vh);
  // Plancher du design system : aucun texte sous 20 px à l'échelle d'un petit côté de 1 080 px.
  // Le corps qui compte est celui qu'on voit : la police multipliée par l'échelle de chaque
  // transform au-dessus du texte. Les noms des petits médaillons de la roue, réduits par
  // scale(--s), passaient à 14 px sans que rien ne le dise : ce garde-fou ne mesurait que les
  // icônes, et le test des feuilles ne lit que les corps en cqmin (revue de Codex, 29/10/2026).
  // Une animation qui tourne en boucle (pulsation) compte à son pas le plus petit : relevée à un
  // autre instant, elle passerait. Un glissement ou une animation qui s'arrête comptent tels
  // qu'à l'instant du relevé (les démonstrations en relèvent aussi en plein mouvement). Sont mis
  // à part : le lancement en cinéma, qui emporte le médaillon hors de l'écran ; les replis
  // (.cp-fb, fallback.js), médias dessinés à la place d'une image ou d'une vidéo du jeu, dont les
  // textes suivent la taille de leur zone comme ceux d'un média (le repli du chargement dans le
  // cadre 9:16 du bureau) ; un dernier recours voulu, déclaré par data-below-floor (encart du
  // chargement, frontend.js).
  const scaleOf = (transform) => {
    if (!transform || transform === 'none') return 1;
    let m;
    try {
      m = new DOMMatrix(transform);
    } catch {
      // Unités que DOMMatrix ne lit pas (cqh, %) : elles ne servent qu'aux translations.
      try {
        m = new DOMMatrix(transform.replace(/translate[XYZ3d]*\([^)]*\)/g, '').trim() || 'none');
      } catch {
        return 1;
      }
    }
    return Math.hypot(m.c, m.d);
  };
  const glyphScale = (el) => {
    let m = new DOMMatrix();
    let loop = 1;
    for (let e = el; e; e = e.parentElement) {
      const t = getComputedStyle(e).transform;
      if (t && t !== 'none') m = new DOMMatrix(t).multiply(m);
      for (const a of e.getAnimations()) {
        const timing = a.effect && a.effect.getComputedTiming();
        if (a.playState !== 'running' || !timing || timing.iterations !== Infinity || !a.effect.getKeyframes) continue;
        const now = scaleOf(t);
        for (const k of a.effect.getKeyframes()) if (k.transform && now > 0) loop = Math.min(loop, scaleOf(k.transform) / now);
      }
    }
    return Math.hypot(m.c, m.d) * loop;
  };
  const measured = new Set();
  for (const { el, text } of boxes) {
    if (!text || measured.has(el) || el.closest('.cinema, .cp-fb, [data-below-floor]')) continue;
    measured.add(el);
    const size = parseFloat(getComputedStyle(el).fontSize) * glyphScale(el) * px;
    if (size > 0 && size < 19.5) problems.add('texte plus petit que 20 px (' + size.toFixed(1) + ' px) : ' + label(el));
  }
  // Icônes du registre (icons.js) : nom inconnu, plus petite que 20 px à l'échelle d'un petit
  // côté de 1 080 px, ou la même pour deux entrées d'un menu (data-icon-menu) : elle ne
  // distinguerait plus rien.
  for (const icon of document.querySelectorAll('svg.icon')) {
    if (!shown(icon)) continue;
    if (icon.classList.contains('icon-unknown')) problems.add('icône inconnue : ' + icon.getAttribute('data-icon'));
    const r = icon.getBoundingClientRect();
    const side = Math.min(r.width, r.height) * px;
    if (side > 0 && side < 19.5) problems.add('icône plus petite que 20 px (' + side.toFixed(1) + ' px) : ' + label(icon));
  }
  for (const menu of document.querySelectorAll('[data-icon-menu]')) {
    const seenIcons = new Map();
    for (const entry of menu.children) {
      const name = entry.querySelector('svg.icon')?.getAttribute('data-icon');
      if (!name) continue;
      if (seenIcons.has(name)) problems.add('même icône pour deux entrées d’un menu (' + name + ') : ' + label(seenIcons.get(name)) + ' et ' + label(entry));
      else seenIcons.set(name, entry);
    }
  }
  return [...problems];
})()`;

/** Position des zones data-stable de la page, et ce qui doit être égal pour les comparer (taille, présentation). */
const STABLE = String.raw`(() => {
  const zones = {};
  for (const el of document.querySelectorAll('[data-stable]')) {
    const r = el.getBoundingClientRect();
    zones[el.dataset.stable] = [r.left, r.top, r.width, r.height].map((v) => Math.round(v * 2) / 2);
  }
  const shape = [innerWidth, innerHeight, ...[...document.querySelectorAll('[data-stable-shape]')].map((e) => e.dataset.stableShape)].join(' ');
  return { shape, zones };
})()`;

type Stable = { shape: string; zones: Record<string, number[]> };

/** Défilements sans geste relevés par la page depuis la dernière inspection (scroll-keeper.js). */
const DRIFTS = `(typeof CyberScroll === 'object' ? CyberScroll.takeDrifts() : [])`;

/** Zones data-stable qui ont bougé depuis le relevé précédent de la même page. */
function moved(before: Stable | undefined, now: Stable): string[] {
  if (!before || before.shape !== now.shape) return [];
  const out: string[] = [];
  for (const [name, box] of Object.entries(now.zones)) {
    const old = before.zones[name];
    if (old && old.some((v, i) => Math.abs(v - box[i]!) > 0.5)) out.push(`zone déplacée : ${name} [${old.join(', ')}] → [${box.join(', ')}]`); // i18n-ignore : rapport de mise en page, pour le développeur
  }
  return out;
}

/** Problèmes de mise en page de la page affichée ; vide si tout va bien (ou si la page n'a pas répondu). */
export async function checkLayout(contents: WebContents): Promise<string[]> {
  try {
    return (await contents.executeJavaScript(SCRIPT)) as string[];
  } catch {
    return [];
  }
}

/** Relevé des problèmes d'un essai sans opérateur, écrit dans <captures>\mise-en-page.txt. */
export class LayoutReport {
  private readonly lines: string[] = [];
  /** Dernier relevé des zones stables de chaque page (par identifiant de WebContents). */
  private readonly stable = new Map<number, Stable>();

  /** Erreurs non rattrapées de chaque page suivie, pas encore relevées. */
  private readonly errors = new Map<number, string[]>();

  constructor(private readonly captureDir: string | undefined) {}

  /**
   * Erreurs non rattrapées de la page : une page qui plante peut rester vide sans que la
   * mise en page y trouve rien à redire (catalogue de traduction absent, par exemple).
   */
  private watch(contents: WebContents): string[] {
    let list = this.errors.get(contents.id);
    if (list) return list;
    const errors: string[] = [];
    list = errors;
    this.errors.set(contents.id, errors);
    contents.on('console-message', (event) => {
      if (event.level === 'error' && /^Uncaught\b/.test(event.message)) errors.push(`erreur de la page : ${event.message}`); // i18n-ignore : rapport de mise en page, pour le développeur
    });
    return list;
  }

  async check(contents: WebContents, where: string): Promise<void> {
    const errors = this.watch(contents);
    let now: Stable | undefined;
    try {
      now = (await contents.executeJavaScript(STABLE)) as Stable;
    } catch {
      now = undefined;
    }
    const shifts = now ? moved(this.stable.get(contents.id), now) : [];
    if (now) this.stable.set(contents.id, now);
    let drifts: string[] = [];
    try {
      drifts = ((await contents.executeJavaScript(DRIFTS)) as string[]).map((d) => `défilement sans geste de l'utilisateur : ${d}`); // i18n-ignore : rapport de mise en page, pour le développeur
    } catch {
      drifts = [];
    }
    for (const problem of [...errors.splice(0), ...(await checkLayout(contents)), ...shifts, ...drifts]) {
      const line = `${where} : ${problem}`;
      console.log(`Mise en page : ${line}`);
      this.lines.push(line);
    }
  }

  /** Écrit le relevé (même vide : son absence voudrait dire que le contrôle n'a pas tourné). */
  save(): void {
    if (!this.captureDir) return;
    fs.mkdirSync(this.captureDir, { recursive: true });
    const text = this.lines.length ? this.lines.join('\n') : 'Aucun problème de mise en page.'; // i18n-ignore : rapport de mise en page, pour le développeur
    fs.writeFileSync(path.join(this.captureDir, 'mise-en-page.txt'), `${text}\n`, 'utf8');
    console.log(`Mise en page : ${this.lines.length} problème${this.lines.length > 1 ? 's' : ''}.`);
  }
}
