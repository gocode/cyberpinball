// Écrit components/<Nom>/README.md et preview.html pour chaque composant et chaque maquette.
import fs from 'node:fs';
import path from 'node:path';
import { FAMILIES } from './icones.mjs';
import { fileURLToPath } from 'node:url';
import { ecrans } from './ecrans.mjs';

const out = process.argv[2] || fileURLToPath(new URL('..',import.meta.url));
const i = (n) => `<i class="cp-i cp-i-${n}" aria-hidden="true"></i>`;
const page = (marker, body, extraCss = '') => `${marker}
<!doctype html>
<html lang="fr">
<head><meta charset="utf-8"><title>Cyber Pinball</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Saira:wdth,wght@50..125,100..900&family=Audiowide&family=Bebas+Neue&family=Orbitron:wght@400..900&family=Press+Start+2P&display=swap"><link rel="stylesheet" href="../../tokens.css"><link rel="stylesheet" href="../bundle.css">
<style>html,body{margin:0;background:var(--void)} body{padding:32px} ${extraCss}</style></head>
<body class="cp-root">
${body}
</body>
</html>
`;
const screen = (w, h, body, css = '') => page(`<!-- @dsCard group="Écrans" height=${h} width=${w} page="true" -->`,
  `<div class="scr" style="width:${w}px;height:${h}px">${body}</div>`,
  `body{padding:0} .scr{position:relative;overflow:hidden;background:var(--void)} ${css}`);

const C = {};

C.Marque = {
  readme: `La marque « CYBER PINBALL » en texte, très espacée, « PINBALL » en vert signal.

- Fournir : le texte seul, dans un élément \`.cp-wordmark\` avec deux \`<span>\` ; \`.pin\` sur le second.
- Deux tailles : \`wordmark\` (64 px) sur l'écran de départ et le menu système ; \`.small\` (22 px) en en-tête, sur une ligne (\`.inline\`).
- Ne pas dessiner de logo, ne pas changer l'espacement, ne pas mettre « CYBER » en vert.`,
  html: page('<!-- @dsCard group="Marque" height=340 width=1600 -->', `
<div style="display:grid;grid-template-columns:auto 1fr;gap:64px;align-items:center">
  <p class="cp-wordmark"><span>Cyber</span><span class="pin">Pinball</span></p>
  <div style="display:grid;gap:28px">
    <p class="cp-wordmark small inline"><span>Cyber</span><span class="pin">Pinball</span></p>
    <p class="cp-kicker">Frontend de borne de flipper virtuel</p>
  </div>
</div>`),
};

C.Icones = {
  readme: `Le jeu d'icônes de Cyber Pinball : un seul registre, \`app/renderer/icons.js\`, où chaque icône est dessinée une fois ; l'application et ce design system le lisent tous deux.

- Dessin : trait de 2 sur une grille de 24, bouts et joints arrondis, zone vive de 3 à 21 (2 à 22 pour les pointes), aucun remplissage. Une silhouette par fonction ; deux entrées d'un même menu n'ont jamais la même icône, une même fonction garde la sienne partout.
- Tailles (petit côté de 1 080 px) : entrée de menu 30 px (\`2.78cqmin\`), à 24 px du libellé, alignée sur sa première ligne ; titre d'écran 60 px ; roue dentée 38 px (zone cliquable de 72 px) ; onglets et groupes 22 à 26 px. Jamais sous 20 px.
- Couleur : celle du libellé. Au repos \`ink\` ; choisie \`on-signal\` sur l'aplat vert ; sans objet \`ink-faint\` ; destructrice \`danger\` au repos (icône et verbe), sombre sur l'aplat rouge une fois choisie.
- Pastille « attend l'utilisateur » : rond rouge de 12 px en haut à droite de l'icône, cerclé de noir ; la même sur la roue dentée.
- Pas d'icône devant une valeur, une ligne de statistiques, une table, une configuration ou un choix de liste : seulement devant ce qui ouvre ou fait quelque chose.
- Fournir, ici : \`<i class="cp-i cp-i-<nom>"></i>\` (masque, taille \`font-size\`, couleur \`color\`) ; dans l'application : \`cyberIcon('<nom>')\`, et un champ \`icon\` sur l'entrée de menu.`,
  html: page('<!-- @dsCard group="Marque" height=2790 width=1600 -->', `
<div class="cp-label" style="margin:0 0 18px">États</div>
<ul class="cp-menu" style="display:grid;grid-template-columns:repeat(5,1fr);gap:16px;margin-bottom:44px">
  <li class="cp-menu-item">${i('trash')}<span>Repos<small>ink</small></span></li>
  <li class="cp-menu-item is-focus">${i('trash')}<span>Choisie<small>on-signal</small></span></li>
  <li class="cp-menu-item is-disabled">${i('trash')}<span>Sans objet<small>ink-faint</small></span></li>
  <li class="cp-menu-item is-danger">${i('trash')}<span>Supprimer<small>danger</small></span></li>
  <li class="cp-menu-item"><span class="cp-glyph">${i('upgrade')}<span class="cp-dot"></span></span><span>À traiter<small>pastille</small></span></li>
</ul>
${FAMILIES.map(([title, names]) => `<div class="cp-label" style="margin:0 0 18px">${title}</div>
<div style="display:grid;grid-template-columns:repeat(8,1fr);gap:14px;margin-bottom:40px">
${names.map((n) => `  <div style="display:grid;justify-items:center;gap:10px;padding:18px 6px 14px;border:1px solid var(--line);border-radius:6px;color:var(--ink)"><span style="display:flex;align-items:end;gap:18px"><i class="cp-i cp-i-${n}" style="font-size:30px"></i><i class="cp-i cp-i-${n}" style="font-size:60px"></i></span><span style="font-size:20px;color:var(--ink-muted)">${n}</span></div>`).join('\n')}
</div>`).join('\n')}`),
};

C.LigneMenu = {
  readme: `Une entrée de menu, en capitales, avec son icône et, au besoin, un détail sur une ligne.

- Fournir : une liste \`.cp-menu\` d'éléments \`.cp-menu-item\` (icône, libellé, \`<small>\` facultatif). \`.is-focus\` sur l'entrée choisie, \`.is-quiet\` sur « Quitter », \`.is-danger\` sur une action destructrice.
- L'icône (30 px, couleur du libellé) est alignée sur la première ligne du libellé ; la pastille rouge d'une entrée qui attend l'utilisateur se pose en haut à droite de l'icône (\`.cp-glyph\` > icône + \`.cp-dot\`).
- L'entrée choisie est une barre opaque \`signal\`, texte et icône \`on-signal\`.
- Raccourci clavier qui fait la même chose sans passer par le menu : \`.cp-shortcut\` en dernier dans l'entrée, une \`.cp-cap\` par touche (« Ctrl », « Maj », « D ») séparées par « + », à droite de la première ligne. Les touches viennent de la définition du raccourci dans le code, jamais écrites à la main ; un bouton de joystick ne s'y montre pas.
- Pour : menu système, configuration de la borne, menus d'Exit. Pas pour les listes de tables (voir \`Roue\` et \`CarteTable\`).`,
  html: page('<!-- @dsCard group="Navigation" height=1060 width=920 -->', `
<ul class="cp-menu" style="width:840px">
  <li class="cp-menu-item is-focus">${i('table-add')}<span>Ajouter une table<small>Depuis le dossier d'import, une clé USB ou ce PC</small></span></li>
  <li class="cp-menu-item">${i('search')}<span>Trouver une table<small>Catalogue VPS : chaque jeu, ses versions, ce qu'il faut</small></span></li>
  <li class="cp-menu-item">${i('inbox')}<span>Liste d'attente</span></li>
  <li class="cp-menu-item">${i('chip')}<span>Bibliothèque de ROM</span></li>
  <li class="cp-menu-item">${i('sliders')}<span>Réglages de VPX</span><span class="cp-shortcut"><span class="cp-cap">R</span></span></li>
  <li class="cp-menu-item">${i('cabinet')}<span>Configuration de la borne</span></li>
  <li class="cp-menu-item"><span class="cp-glyph">${i('upgrade')}<span class="cp-dot"></span></span><span>Mise à jour de Cyber Pinball<small>0.2.0 disponible</small></span></li>
  <li class="cp-menu-item">${i('desktop')}<span>Bureau Windows<small>Libère tous les écrans du PC</small></span><span class="cp-shortcut"><span class="cp-cap">Ctrl</span>+<span class="cp-cap">Maj</span>+<span class="cp-cap">D</span></span></li>
  <li class="cp-menu-item is-quiet">${i('power')}<span>Quitter Cyber Pinball</span></li>
</ul>`),
};

C.Onglets = {
  readme: `Deux formes d'onglets : segmentés (texte) pour les filtres et les vues, à icônes pour les sections d'une fiche.

- Segmentés : \`.cp-tabs\` > \`.cp-tab\` ; \`.is-active\` = vue montrée (repère neutre), \`.is-focus\` = élément choisi. Le vert n’apparaît que sur le focus.
- À icônes : \`.cp-iconbar\` > éléments avec une icône et un mot en capitales ; \`.is-focus\` sur le choisi. Six au plus.
- Les flippers passent d'un onglet à l'autre ; Start ouvre ; Exit revient.`,
  html: page('<!-- @dsCard group="Navigation" height=420 width=1100 -->', `
<div style="display:grid;gap:40px">
  <div class="cp-tabs"><span class="cp-tab is-active is-focus">Infos</span><span class="cp-tab">Prospectus</span><span class="cp-tab">Règles</span></div>
  <div class="cp-iconbar" style="width:900px">
    <span>${i('info')}Infos</span><span>${i('book')}Prospectus</span><span>${i('rules')}Règles</span><span>${i('image')}Médias</span><span>${i('eye')}Vue</span><span>${i('pulse')}Diagnostic</span>
  </div>
</div>`),
};

const wheel = (focus = 'Medieval Madness') => `
<div class="cp-wheel">
  <span class="cp-arrow">${i('chevron-left')}</span>
  <div class="cp-wheel-track">
    <span class="cp-logo">TZ</span>
    <span class="cp-logo near">AFM</span>
    <span class="cp-logo is-focus">${focus}</span>
    <span class="cp-logo near">T2</span>
    <span class="cp-logo">BK</span>
  </div>
  <span class="cp-arrow">${i('chevron-right')}</span>
</div>`;

C.Roue = {
  readme: `La roue des tables : les logos ronds défilent, la table choisie grossit au centre dans un anneau vert.

- Fournir : le logo de chaque table (\`.cp-logo\`, image ronde ou repli dessiné), cinq visibles au plus ; \`.near\` sur les voisins, \`.is-focus\` au centre ; un compteur \`.cp-count\` dessous.
- Les flippers tournent la roue, Start ouvre la fiche. Les flèches sont cliquables à la souris.
- Le titre, le fabricant et l'année de la table choisie s'écrivent au-dessus de la roue en \`display\` et \`meta\`, jamais dans la roue.`,
  html: page('<!-- @dsCard group="Navigation" height=400 width=1080 -->', `${wheel()}
<p class="cp-count" style="margin-top:20px"><b>4</b> / 38</p>`),
};

const hints = `<div class="cp-hints">
  <span class="cp-hint"><span class="cp-cap">Flippers</span>choisir</span>
  <span class="cp-hint"><span class="cp-cap start">Start</span>fiche</span>
  <span class="cp-hint"><span class="cp-cap">H</span>commandes</span>
  <span class="cp-hint"><span class="cp-cap">R</span>réglages</span>
  <span class="cp-hint"><span class="cp-cap">Exit</span>menu</span>
</div>`;

C.BandeauAide = {
  readme: `Le bandeau d'aide, au pied de chaque écran : ce que fait chaque bouton de la borne ici.

- Fournir : une suite de \`.cp-hint\`, chacune une touche \`.cp-cap\` et un verbe à l'infinitif (« choisir », « valider », « revenir »). \`.start\` sur la touche Start.
- Les touches s'écrivent par le nom du bouton (Flippers, Start, Exit), une lettre pour le clavier (H, R).
- Cinq indications au plus ; toujours la même place, en bas, sur \`scrim\`.`,
  html: page('<!-- @dsCard group="Navigation" height=160 width=1080 -->', hints, 'body{padding:24px 0}'),
};

C.Panneau = {
  readme: `Le cadre d'un écran de gestion : fond \`surface\`, filet \`line-strong\`, lueur \`halo-panel\`, en-tête avec icône, surtitre et titre.

- Fournir : \`.cp-panel\` avec \`.cp-panel-head\` (une icône, \`.cp-kicker\` et \`.cp-title\`), puis le contenu : groupes de lignes sous un \`.cp-label\`.
- Un panneau par écran sur le playfield ; il laisse voir le média autour.
- Le surtitre dit où l'on est (« Cyber Pinball », le nom de la table, l'étape de l'assistant).`,
  html: page('<!-- @dsCard group="Structure" height=700 width=900 -->', `
<section class="cp-panel" style="width:820px">
  <header class="cp-panel-head">${i('gamepad')}<div><div class="cp-kicker">Cyber <span class="pin">Pinball</span></div><h2 class="cp-title">Commandes</h2></div></header>
  <p class="cp-label">Dans le menu</p>
  <div class="cp-rows" style="margin:16px 0 32px">
    <div class="cp-row">${i('flipper')}<span>Choisir une table</span><span class="cp-value">Flippers ${i('chevron-right')}</span></div>
    <div class="cp-row">${i('start')}<span>Fiche de la table</span><span class="cp-value">Start ${i('chevron-right')}</span></div>
  </div>
  <p class="cp-label">Pendant une partie</p>
  <div class="cp-rows" style="margin-top:16px">
    <div class="cp-row">${i('exit')}<span>Quitter la partie</span><span class="cp-value">Exit maintenu ${i('chevron-right')}</span></div>
  </div>
</section>`),
};

C.Ligne = {
  readme: `Une ligne : icône, libellé (et détail), valeur dans une pastille, chevron. La brique des réglages, des boutons et des plans.

- Fournir : \`.cp-row\` avec une icône, un \`<span>\` (libellé, \`.detail\` facultatif) et une \`.cp-value\`. \`.is-focus\` sur la ligne choisie ; \`.is-empty\` sur une valeur absente (« pas de bouton ») ; \`.is-locked\` sur une valeur imposée par Cyber Pinball.
- Grouper les lignes dans \`.cp-rows\` sous un \`.cp-label\`.
- La valeur dit l'état actuel, le chevron dit que Start la change.`,
  html: page('<!-- @dsCard group="Contenu" height=660 width=920 -->', `
<p class="cp-label">Boutons de la borne</p>
<div class="cp-rows" style="width:840px;margin-top:16px">
  <div class="cp-row">${i('flipper')}<span>Flipper gauche</span><span class="cp-value">Maj gauche ${i('chevron-right')}</span></div>
  <div class="cp-row is-focus">${i('flipper')}<span>Flipper droit<span class="detail">Appuyez sur le bouton de la borne</span></span><span class="cp-value">Maj droite ${i('chevron-right')}</span></div>
  <div class="cp-row">${i('start')}<span>Start</span><span class="cp-value">1 ${i('chevron-right')}</span></div>
  <div class="cp-row">${i('exit')}<span>Exit</span><span class="cp-value">Échap ${i('chevron-right')}</span></div>
  <div class="cp-row">${i('coin')}<span>Crédit</span><span class="cp-value">5 ${i('chevron-right')}</span></div>
  <div class="cp-row">${i('flipper')}<span>MagnaSave gauche<span class="detail">Facultatif</span></span><span class="cp-value is-empty">pas de bouton ${i('chevron-right')}</span></div>
</div>`),
};

C.Etat = {
  readme: `Une ligne d'état : ce qui a été vérifié, son état dit par un mot et un signe, et sa valeur.

- Fournir : \`.cp-status\` avec une icône, un libellé (\`.detail\` pour l'explication), un \`.cp-state\` (\`ok\`, \`warn\`, \`bad\`, \`info\`) et une valeur \`.num\` facultative.
- Mots : « OK », « À vérifier », « Bloquant », « Info ». Signes : check, alert, close, info.
- Pour : diagnostic d'une table, récapitulatif de l'assistant, ce qu'il faut pour une table du catalogue.`,
  html: page('<!-- @dsCard group="Contenu" height=600 width=1040 -->', `
<div style="width:960px">
  <p class="cp-label">Constats</p>
  <div class="cp-status">${i('image')}<span>Fronton<span class="detail">Terminator 2 (Williams 1991).directb2s</span></span><span class="cp-state ok">${i('check')}OK</span><span class="num">1920 × 1080</span></div>
  <div class="cp-status">${i('chip')}<span>ROM t2_l8<span class="detail">Dans la bibliothèque, pas liée dans la table</span></span><span class="cp-state warn">${i('alert')}À vérifier</span><span class="num">458 ko</span></div>
  <div class="cp-status">${i('folder')}<span>PuP-Pack<span class="detail">Introuvable : pupvideos\\t2_l8</span></span><span class="cp-state bad">${i('close')}Bloquant</span><span class="num"></span></div>
  <div class="cp-status">${i('monitor')}<span>Écran du playfield<span class="detail">LG TV SSCR2, flippers en bas</span></span><span class="cp-state info">${i('info')}Info</span><span class="num">3840 × 2160</span></div>
</div>`),
};

C.Bouton = {
  readme: `Bouton d'action : principal (vert), secondaire (filet), destructeur (mot explicite et icône, sans rouge).

- Fournir : \`.cp-btn\` avec une icône et un verbe en capitales ; \`.primary\` pour l'action que l'écran sert (une seule par écran) ; \`.danger\` pour supprimer ; \`.small\` dans une ligne.
- \`.is-focus\` sur le bouton choisi : un principal choisi devient un aplat \`signal\`.
- Verbe d'abord : « Jouer », « Installer », « Tout réparer », « Supprimer la table ».`,
  html: page('<!-- @dsCard group="Actions" height=330 width=1180 -->', `
<div style="display:flex;gap:20px;flex-wrap:wrap;align-items:center">
  <span class="cp-btn primary is-focus">${i('play')}Jouer</span>
  <span class="cp-btn primary">${i('download')}Installer</span>
  <span class="cp-btn">${i('book')}Prospectus</span>
  <span class="cp-btn">${i('eye')}Régler l’affichage</span>
  <span class="cp-btn danger">${i('trash')}Supprimer la table</span>
  <span class="cp-btn small">${i('refresh')}Analyser à nouveau</span>
</div>`),
};

const thumb = (label, cool) => `<div class="cp-thumb cp-art${cool ? ' cool' : ''}" data-label=""></div>`;
C.CarteTable = {
  readme: `Une table dans une liste de résultats : vignette, titre, fabricant · année, étiquettes.

- Fournir : \`.cp-card\` avec une \`.cp-thumb\` (capture du plateau ou vignette VPS), le titre \`.t\`, une \`.cp-meta\`, et des \`.cp-tag\` (\`ok\`, \`warn\`).
- Pour : recherche, catalogue, liste d'attente, mises à jour. Dans le menu des tables, préférer la \`Roue\`.
- Deux étiquettes au plus, en mots courts : « VPW 1.25 », « ROM à trouver ».`,
  html: page('<!-- @dsCard group="Contenu" height=520 width=920 -->', `
<div style="display:grid;gap:12px;width:840px">
  <div class="cp-card is-focus">${thumb()}<div><div class="t">Terminator 2 : Judgment Day</div><div class="cp-meta">Williams<span class="sep">·</span>1991</div><div class="tags"><span class="cp-tag">VPW 1.25</span><span class="cp-tag ok">ROM sur la borne</span></div></div></div>
  <div class="cp-card">${thumb('', true)}<div><div class="t">Medieval Madness</div><div class="cp-meta">Williams<span class="sep">·</span>1997</div><div class="tags"><span class="cp-tag">VPW 2.0</span><span class="cp-tag warn">ROM à trouver</span></div></div></div>
  <div class="cp-card">${thumb()}<div><div class="t">Attack from Mars</div><div class="cp-meta">Bally<span class="sep">·</span>1995</div><div class="tags"><span class="cp-tag">nFozzy</span></div></div></div>
</div>`),
};

const keys = [...'AZERTYUIOP', ...'QSDFGHJKLM', ...'WXCVBN', "'", '-', '.', '?'];
C.Clavier = {
  readme: `Saisie au clavier à l'écran : champ de recherche et touches AZERTY, pilotés aux flippers.

- Fournir : \`.cp-search\` (icône, texte \`.q\` avec \`.caret\`, croix d'effacement) et \`.cp-keys\` (\`.cp-key\`, \`.wide\` pour 123, Espace, Effacer).
- Les flippers déplacent la touche choisie (\`.is-focus\`), Start l'écrit, Exit annule ; un vrai clavier écrit directement.
- Pour : recherche d'un titre, renommer une configuration, modifier les informations.`,
  html: page('<!-- @dsCard group="Saisie" height=620 width=1020 -->', `
<div style="display:grid;gap:24px;width:940px">
  <div class="cp-search">${i('search')}<span class="q">medi<span class="caret"></span></span>${i('close')}</div>
  <div class="cp-keys">
${keys.map((k) => `    <span class="cp-key${k === 'E' ? ' is-focus' : ''}">${k}</span>`).join('\n')}
    <span class="cp-key wide">123</span><span class="cp-key wide">Espace</span><span class="cp-key wide">Effacer</span><span class="cp-key">${i('check')}</span>
  </div>
</div>`),
};

const question = `<div class="cp-scrim"><div class="cp-dialog">
  <h2>Quitter sans enregistrer ?</h2>
  <div class="lost"><b>Ce qui ne sera pas enregistré</b>Boutons : Flipper gauche sur A, Flipper droit sur S</div>
  <div class="cp-muted" style="font-size:22px">Retour au menu des tables, configuration enregistrée inchangée.</div>
  <div class="choices"><span class="cp-btn is-focus">${i('exit')}Quitter sans enregistrer</span><span class="cp-btn">Continuer</span></div>
  <div class="cp-timer"><i></i></div>
  <div class="cp-hints" style="background:none;border:0;padding:0"><span class="cp-hint"><span class="cp-cap start">Start</span>oui</span><span class="cp-hint"><span class="cp-cap">Exit</span>non</span><span class="cp-hint">sans réponse dans 20 s : on continue</span></div>
</div></div>`;
C.Question = {
  readme: `Une question qui bloque l'écran : ce qui serait perdu, où l'on va, deux réponses, un délai visible. Le délai de cette maquette poursuit la configuration ; il ne valide jamais la sortie.

- Fournir : \`.cp-scrim\` > \`.cp-dialog\` avec un titre (la question), le contenu, \`.choices\` (deux \`.cp-btn\`, la réponse choisie en \`.is-focus\`), \`.cp-timer\` si la question se ferme seule.
- Cadre sarcelle et texte neutre ; la réponse choisie seule porte le vert signal.
- Toujours dire ce qui serait perdu et où l'on revient.`,
  html: page('<!-- @dsCard group="Saisie" height=680 width=1300 -->', `<div style="position:relative;height:580px;border-radius:8px;overflow:hidden" class="cp-art" data-label="">${question}</div>`),
};

// Préavis d'arrêt de l'horaire et voile de nuit (app/renderer/frontend.css, « Horaire de la borne » ; maquette revue par Codex).
const preavisCss = `.pv-scene{position:relative;width:1080px;height:760px;overflow:hidden;border-radius:8px;background:linear-gradient(160deg,#16303a,#0a1416 60%,#2a1830)}
.pv-scene .pv-veil{position:absolute;inset:0;background:#000;opacity:.7}
.pv-scene .pv-attract{position:absolute;left:0;right:0;top:220px;text-align:center;font:600 64px var(--font-ui);color:var(--ink);letter-spacing:.06em}
.pv{position:absolute;left:50%;bottom:97px;transform:translateX(-50%);box-sizing:border-box;width:864px;display:grid;grid-template-columns:65px minmax(0,1fr);align-items:center;column-gap:32px;row-gap:13px;padding:32px 43px 35px;border:2px solid var(--line-strong);border-radius:9px;background:var(--surface);color:var(--ink)}
.pv .cp-i{grid-column:1;grid-row:1/3;font-size:65px;color:var(--ink-muted)}
.pv .lab{grid-column:2;font:600 24px/1.25 var(--font-ui);letter-spacing:.14em;text-transform:uppercase}
.pv .num{grid-column:2;font:600 97px/1 var(--font-ui);font-variant-numeric:tabular-nums}
.pv .num small{margin-left:6px;font-size:24px;font-weight:400;color:var(--ink-muted)}
.pv .bar{grid-column:1/-1;height:5px;margin-top:9px;border-radius:3px;background:var(--line-strong);overflow:hidden}
.pv .bar::after{content:'';display:block;height:100%;width:73%;background:var(--ink-muted)}
.pv .hint{grid-column:1/-1;font:500 24px/1.4 var(--font-ui);text-align:center}`;
C.Preavis = {
  readme: `Préavis d'arrêt de l'horaire de la borne, posé sur le plateau au-dessus du voile de nuit : ce qui va arriver, le temps restant, comment l'éviter. Le moindre bouton le retire.

- Fournir : \`.stop-notice\` (couche \`#stop\`, géométrie et rotation du plateau) avec l'icône de l'arrêt (\`moon\` pour la veille, \`power\` pour l'extinction), le libellé (« Mise en veille dans », « Extinction dans »), le compte (\`.stop-notice-count\`, secondes et « s »), la jauge (\`.stop-notice-bar\`, durée totale \`--stop-ms\`, temps écoulé négatif \`--stop-delay\`) et l'invite (« Appuyez sur un bouton pour garder la borne allumée »).
- Mesures (petit côté 1080) : largeur extérieure 864 px au plus, à 97 px du bas ; icône 65 px ; libellé et invite 24 px ; compte 97 px, chiffres tabulaires ; jauge 5 px.
- Sobre : fond \`surface\` opaque, filet \`line-strong\`, compte \`ink\` sans halo, pas de vert (ni choix ni réussite), pas d'ambre (un arrêt réglé n'est pas une anomalie), invite fixe, pas de pulsation ni de clignotement final. Pendant le préavis, l'invite du mode attente disparaît : une consigne à la fois.
- Voile de nuit (\`.night-veil\`) : noir sur toute la fenêtre, 50, 70 (défaut), 85 ou 100 % ; descend en 4 s (\`ease-in-out\`), se lève d'un coup. L'invite du mode attente reste dessous ; seul le préavis passe au-dessus. Ni le DMD ni un son ne répètent le préavis.`,
  html: page('<!-- @dsCard group="Contenu" height=840 width=1160 -->', `
<div class="pv-scene"><div class="pv-attract">NEON GALAXY</div><div class="pv-veil"></div>
  <div class="pv">${i('moon')}<div class="lab">Mise en veille dans</div><div class="num">22<small>s</small></div><div class="bar"></div><div class="hint">Appuyez sur un bouton pour garder la borne allumée</div></div>
</div>`, preavisCss),
};

Object.assign(C, ecrans({screen, i, wheel}));
// Couverture : l'image de la bannière est incorporée (data:), pour que l'aperçu tienne seul dans la page du design system.
const banniere = `data:image/webp;base64,${fs.readFileSync(new URL('../assets/fond-banniere.webp', import.meta.url)).toString('base64')}`;
C.Cover = { readme: 'Couverture 960 × 288. Image de la bannière à droite, marque espacée et accroche à gauche.', html: fs.readFileSync(new URL('./couverture.html',import.meta.url),'utf8').replace("url('../assets/fond-banniere.webp')", `url('${banniere}')`) };

for (const [name, c] of Object.entries(C)) {
  const dir = path.join(out, 'components', name);
  fs.mkdirSync(dir, { recursive: true });
  // La couverture reste nue : un README en ferait un composant ordinaire.
  if (name === 'Cover') fs.rmSync(path.join(dir, 'README.md'), { force: true }); else fs.writeFileSync(path.join(dir, 'README.md'), `# ${name}\n\n${c.readme}\n\nAperçu statique, sans logique de navigation. Dimensions de référence en pixels pour petit côté 1080. Texte minimum 20 px. Règles communes : ../../README.md.\n`);
  fs.writeFileSync(path.join(dir, 'preview.html'), c.html);
}
console.log(Object.keys(C).join(', '));
