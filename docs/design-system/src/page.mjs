// Page HTML unique du design system : fondations, composants vivants (iframes), écrans.
// node src/page.mjs [dossier du design system] [page.html] ; par défaut ce dossier et son index.html.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const proj = process.argv[2] || fileURLToPath(new URL('..', import.meta.url));
const out = process.argv[3] || path.join(proj, 'index.html');
const read = (p) => fs.readFileSync(path.join(proj, p), 'utf8');
const tokens = JSON.parse(read('tokens.json'));
const tokensCss = read('tokens.css');
const bundleCss = read('components/bundle.css');
const FONTS = 'https://fonts.googleapis.com/css2?family=Saira:wdth,wght@50..125,100..900&family=Audiowide&family=Bebas+Neue&family=Orbitron:wght@400..900&family=Press+Start+2P&display=swap';
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const attr = (s) => esc(s).replace(/"/g, '&quot;');

// Markdown minimal des README de composants : paragraphes, listes, `code`, **gras**.
const inline = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
function md(text) {
  const out = []; let list = null;
  for (const line of text.split('\n')) {
    if (/^#\s/.test(line)) continue;
    const li = /^\s*[-*]\s+(.*)/.exec(line);
    if (li) { (list ??= []).push(`<li>${inline(li[1])}</li>`); continue; }
    if (list) { out.push(`<ul>${list.join('')}</ul>`); list = null; }
    if (line.trim() && !/^Aperçu statique/.test(line)) out.push(`<p>${inline(line)}</p>`);
  }
  if (list) out.push(`<ul>${list.join('')}</ul>`);
  return out.join('\n');
}

// Aperçu → document autonome pour srcdoc : feuilles du système incorporées, liens relatifs retirés.
function srcdoc(html) {
  let h = html.replace(/^<!--[^\n]*-->\n?/, '')
    .replace(/<link rel="stylesheet" href="\.\.\/[^"]*">/g, '');
  const inject = `<style>${tokensCss}\n${bundleCss}</style>`;
  h = h.includes('<head>') ? h.replace('<head>', `<head>${inject}`) : inject + h;
  if (!h.includes(FONTS.split('&')[0])) h = h.replace('<head>', `<head><link rel="stylesheet" href="${FONTS}">`);
  return h.replace('<html lang="fr">', '<html lang="fr" data-theme="borne">');
}
// Code HTML montré sous l'aperçu : le contenu du <body>, sans les scripts.
function snippet(html) {
  const b = /<body[^>]*>([\s\S]*?)<\/body>/.exec(html)?.[1] ?? '';
  return b.replace(/<script[\s\S]*?<\/script>/g, '').replace(/\n{3,}/g, '\n\n').trim();
}

const comps = fs.readdirSync(path.join(proj, 'components')).filter((d) => fs.existsSync(path.join(proj, 'components', d, 'preview.html')));
const info = comps.map((name) => {
  const html = read(`components/${name}/preview.html`);
  const marker = html.split('\n')[0];
  const get = (k) => new RegExp(`${k}="?([^"\\s]+)"?`).exec(marker)?.[1];
  const readme = fs.existsSync(path.join(proj, 'components', name, 'README.md')) ? read(`components/${name}/README.md`) : '';
  return { name, html, group: get('group') ?? '', w: Number(get('width') ?? (name === 'Cover' ? 960 : 1100)), h: Number(get('height') ?? 300), readme };
});
const NAMES = {
  Marque: 'Marque', Icones: 'Icônes', LigneMenu: 'Entrée de menu', ListeContenu: 'Liste de contenu', Onglets: 'Onglets', Roue: 'Roue des tables', BandeauAide: "Bandeau d'aide",
  Panneau: 'Panneau', Ligne: 'Ligne', Etat: "Ligne d'état", Bouton: 'Bouton', CarteTable: 'Carte de table', Clavier: 'Clavier à l’écran', Question: 'Question',
  EcranMenuCab: 'Menu des tables, borne', EcranFiche: 'Fiche d’une table, bureau', EcranMenuSysteme: 'Menu système, bureau', EcranDiagnostic: 'Diagnostic, borne', EcranAssistant: 'Assistant, relevé des boutons', EcranParcours: 'Ce qu’il manque pour jouer, borne', EcranParcoursBureau: 'Ce qu’il manque pour jouer, bureau', EcranTelechargements: 'Téléchargements, borne', EcranSelecteurBureau: 'Sélecteur de fichiers, bureau', EcranSelecteurBorne: 'Sélecteur de fichiers, borne',
};
const ORDER = ['Marque', 'Navigation', 'Structure', 'Contenu', 'Actions', 'Saisie'];
const cover = info.find((c) => c.name === 'Cover');
const screens = info.filter((c) => c.group === 'Écrans');
const parts = info.filter((c) => c !== cover && c.group !== 'Écrans').sort((a, b) => ORDER.indexOf(a.group) - ORDER.indexOf(b.group));

const frame = (c, cls = '') => `<div class="ds-frame ${cls}" data-w="${c.w}" data-h="${c.h}"><iframe title="${attr(NAMES[c.name] ?? c.name)}" loading="lazy" width="${c.w}" height="${c.h}" srcdoc="${attr(srcdoc(c.html))}"></iframe></div>`;

const colorRows = tokens.color.tokens.map((t) => {
  const v = typeof t.value === 'string' ? t.value : Object.values(t.value)[0];
  return `<div class="ds-swatch"><span class="chip" style="background:${attr(v)}"></span><div><b>${t.name}</b><code>${esc(v)}</code><p>${inline(t.usage ?? '')}</p></div></div>`;
}).join('\n');
const typeRows = tokens.type.groups.map((g) => `<h3>${esc(g.name)}</h3>` + g.styles.map((s) => `<div class="ds-type"><div class="spec"><b>${s.name}</b><code>${s.fontSize}${s.lineHeight ? ' / ' + s.lineHeight : ''} · ${s.fontWeight ?? 400}${s.letterSpacing ? ' · ' + s.letterSpacing : ''}</code><p>${inline(s.usage ?? '')}</p></div><div class="sample ${s.name}" style="${s.name === 'wordmark' ? 'font-stretch:125%;text-transform:uppercase;font-size:min(48px,5.4vw);overflow-wrap:normal' : ''}${['title', 'menu', 'label', 'kicker'].includes(s.name) ? 'text-transform:uppercase;font-stretch:112%;' : ''}${s.name === 'label' ? 'color:var(--signal);' : ''}">${esc(s.sample ?? s.name)}</div></div>`).join('')).join('\n');
const scale = (fam) => tokens[fam].tokens.map((t) => `<div class="ds-step"><span class="bar" style="${fam === 'spacing' ? `width:${t.value}` : `border-radius:${t.value}`}"></span><b>${t.name}</b><code>${t.value}</code><p>${inline(t.usage ?? '')}</p></div>`).join('');

const section = (c) => `<section class="ds-comp" id="${c.name}">
  <header><span class="ds-group">${esc(c.group)}</span><h3>${esc(NAMES[c.name] ?? c.name)}</h3><code class="ds-cls">${esc(c.name)}</code></header>
  <div class="ds-doc">${md(c.readme)}</div>
  ${frame(c)}
  <details><summary>Code HTML</summary><pre><code>${esc(snippet(c.html))}</code></pre></details>
</section>`;

const nav = [['fondations', 'Fondations'], ['couleurs', 'Couleurs'], ['typographie', 'Typographie'], ['espaces', 'Espaces et rayons'],
  ...parts.map((c) => [c.name, NAMES[c.name] ?? c.name]), ['ecrans', 'Écrans']];

const page = `<title>Cyber Pinball — design system</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="${FONTS}">
<style>
${tokensCss}
${bundleCss}
/* Page : un seul univers sombre, celui de la borne. */
:root { color-scheme: dark }
html, body { background: var(--void); color: var(--ink) }
body { margin: 0; font: 16px/1.55 var(--font-ui) }
.ds { display: grid; grid-template-columns: 250px minmax(0, 1fr); min-height: 100vh }
.ds-nav { position: sticky; top: env(safe-area-inset-top, 0px); align-self: start; height: 100vh; overflow-y: auto; padding: 28px 20px 40px max(20px, env(safe-area-inset-left, 0px)); border-right: 1px solid var(--line) }
.ds-nav .cp-wordmark { margin-bottom: 28px }
.ds-nav a { display: block; color: var(--ink-muted); text-decoration: none; padding: 6px 10px; border-radius: var(--radius-sm); font-size: 15px }
.ds-nav a:hover, .ds-nav a:focus-visible { color: var(--ink); background: var(--surface-raised); outline: none }
.ds-nav .sub { padding-left: 22px; font-size: 14px }
.ds-main { min-width: 0; padding: 32px max(16px, env(safe-area-inset-right, 0px)) 96px 40px; max-width: 1180px }
.ds-cover { border-radius: var(--radius-md); overflow: hidden; border: 1px solid var(--line-strong); margin-bottom: 40px }
h1.ds-h1 { font-size: 15px; font-weight: 600; letter-spacing: .3em; text-transform: uppercase; color: var(--signal); margin: 56px 0 8px }
h2.ds-h2 { font-size: 34px; font-weight: 500; font-stretch: 112%; letter-spacing: .08em; text-transform: uppercase; margin: 0 0 18px; scroll-margin-top: 24px }
.ds-main h3 { font-size: 22px; font-weight: 600; margin: 28px 0 12px }
.ds-main p, .ds-main li { color: var(--ink); max-width: 72ch }
.ds-main code { font: 500 13px/1.4 ui-monospace, Consolas, monospace; color: var(--meta) }
.ds-lead { font-size: 18px; color: var(--ink-muted) !important }
.ds-rules { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr)); gap: 16px }
.ds-rule { background: var(--surface); border: 1px solid var(--line-strong); border-radius: var(--radius-md); padding: 18px 20px }
.ds-rule b { display: block; font-stretch: 112%; letter-spacing: .08em; text-transform: uppercase; font-size: 15px; color: var(--signal); margin-bottom: 6px }
.ds-rule p { margin: 0; font-size: 15px; color: var(--ink-muted) }
.ds-swatches { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 340px), 1fr)); gap: 10px }
.ds-swatch { display: grid; grid-template-columns: 64px minmax(0, 1fr); gap: 14px; align-items: start; padding: 10px; border-radius: var(--radius-sm); background: var(--surface) }
.ds-swatch .chip { width: 64px; height: 64px; border-radius: var(--radius-sm); border: 1px solid var(--line-strong) }
.ds-swatch b { display: block; font-size: 15px } .ds-swatch code { display: block }
.ds-swatch p { margin: 4px 0 0; font-size: 13.5px; color: var(--ink-muted); line-height: 1.4 }
.ds-type { display: grid; grid-template-columns: 280px minmax(0, 1fr); gap: 24px; align-items: center; padding: 18px 0; border-bottom: 1px solid var(--line) }
.ds-type .spec b { display: block } .ds-type .spec p { margin: 4px 0 0; font-size: 13.5px; color: var(--ink-muted) }
.ds-type .sample { min-width: 0; overflow-wrap: anywhere }
.ds-steps { display: grid; gap: 8px }
.ds-step { display: grid; grid-template-columns: 90px 120px 70px minmax(0, 1fr); gap: 14px; align-items: center; font-size: 14px }
.ds-step .bar { display: block; height: 22px; min-width: 4px; background: var(--signal); }
.ds-step .bar[style*="radius"] { width: 64px; height: 40px; background: var(--surface-raised); border: 1.5px solid var(--signal) }
.ds-step p { margin: 0; color: var(--ink-muted) }
.ds-comp { padding: 28px 0 32px; border-top: 1px solid var(--line); scroll-margin-top: 16px }
.ds-comp header { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 14px }
.ds-comp header h3 { margin: 0; font-size: 26px }
.ds-group { font-size: 12px; font-weight: 600; letter-spacing: .24em; text-transform: uppercase; color: var(--ink-muted) }
.ds-doc { margin: 10px 0 18px } .ds-doc p, .ds-doc li { font-size: 15.5px } .ds-doc ul { padding-left: 20px; margin: 6px 0 }
.ds-frame { position: relative; overflow: hidden; border: 1px solid var(--line-strong); border-radius: var(--radius-md); background: var(--void) }
.ds-frame iframe { position: absolute; left: 0; top: 0; border: 0; transform-origin: 0 0; display: block }
details { margin-top: 10px } summary { cursor: pointer; color: var(--ink-muted); font-size: 14px; padding: 6px 0 }
summary:focus-visible { outline: 2px solid var(--signal); outline-offset: 2px }
details pre { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 14px; overflow-x: auto; max-height: 420px }
details pre code { color: var(--ink-muted); white-space: pre }
.ds-screens { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 520px), 1fr)); gap: 28px }
.ds-screens .ds-comp { border: 0; padding: 0 }
.ds-screens .tall { max-width: 420px }
@media (max-width: 860px) {
  .ds { grid-template-columns: 1fr } .ds-nav { position: static; height: auto; border-right: 0; border-bottom: 1px solid var(--line); padding: 20px max(16px, env(safe-area-inset-left, 0px)) }
  .ds-nav nav { display: flex; flex-wrap: wrap; gap: 4px } .ds-nav .sub { padding-left: 10px }
  .ds-main { padding: 24px max(16px, env(safe-area-inset-right, 0px)) 64px max(16px, env(safe-area-inset-left, 0px)) }
  .ds-type { grid-template-columns: 1fr } .ds-step { grid-template-columns: 70px 1fr; } .ds-step p, .ds-step code { grid-column: 2 }
}
</style>

<div class="ds">
  <aside class="ds-nav">
    <p class="cp-wordmark small"><span>Cyber</span><span class="pin">Pinball</span></p>
    <nav aria-label="Sommaire">
${nav.map(([id, label], i) => `      <a href="#${id}"${i > 3 && id !== 'ecrans' ? ' class="sub"' : ''}>${esc(label)}</a>`).join('\n')}
    </nav>
  </aside>
  <main class="ds-main">
    ${cover ? frame(cover, 'ds-cover') : ''}

    <h1 class="ds-h1">Design system</h1>
    <h2 class="ds-h2" id="fondations">Fondations</h2>
    <p class="ds-lead">Cyber Pinball habille une borne de flipper : playfield (souvent un téléviseur 4K en portrait), fronton, afficheur, topper, ou un simple écran de bureau. Le joueur est debout à un mètre et pilote tout avec six boutons. L'interface s'efface derrière les médias des jeux ; seul ce qui est choisi s'allume en vert.</p>
    <div class="ds-rules">
      <div class="ds-rule"><b>Une seule chose allumée</b><p>À tout moment, un seul élément porte le vert signal : celui que Start va activer. Les intertitres de groupe et l'état OK sont verts aussi, comme dans la DA ; rien d'autre.</p></div>
      <div class="ds-rule"><b>Lisible à un mètre</b><p>Aucun texte sous 20 px. Le texte qu'on lit en jouant fait 24 px ou plus.</p></div>
      <div class="ds-rule"><b>Piloté aux boutons</b><p>Chaque écran dit ce que font les boutons dans le bandeau d'aide. La souris marche partout, aucun écran n'en dépend.</p></div>
      <div class="ds-rule"><b>Les médias d'abord</b><p>Les panneaux sombres se posent sur la vidéo du plateau ou sur le fond « verre fumé ». Un média absent est nommé, jamais simulé.</p></div>
      <div class="ds-rule"><b>États : un mot et un signe</b><p>Coche + OK en vert, triangle + À vérifier en ambre, croix + Bloquant en rouge. Jamais la couleur seule.</p></div>
      <div class="ds-rule"><b>Échelle</b><p>Dimensions données pour un petit côté de 1 080 px. Dans l'application, n px s'écrivent n / 10,8 <code>cqmin</code>. Un écran 4K reçoit le double, sans changer la composition.</p></div>
      <div class="ds-rule"><b>Ce qui existe seulement</b><p>Pas de favoris, catégories, scores, notes ni horloge tant qu'ils ne sont pas décidés.</p></div>
      <div class="ds-rule"><b>Ton</b><p>Vouvoiement, verbe d'abord, capitales pour titres, menus, intertitres et boutons ; guillemets « », point médian entre fabricant et année.</p></div>
    </div>

    <h2 class="ds-h2" id="couleurs" style="margin-top:56px">Couleurs</h2>
    <div class="ds-swatches">${colorRows}</div>

    <h2 class="ds-h2" id="typographie" style="margin-top:56px">Typographie</h2>
    <p>Saira pour toute l'interface, avec son axe de largeur : 125 % pour la marque, 112 % pour titres, menus, boutons et intertitres, 100 % pour le texte courant. Les replis dessinés gardent leurs polices propres.</p>
    ${typeRows}

    <h2 class="ds-h2" id="espaces" style="margin-top:56px">Espaces et rayons</h2>
    <div class="ds-steps">${scale('spacing')}</div>
    <h3>Rayons</h3>
    <div class="ds-steps">${scale('radius')}</div>
    <h3>Lumière</h3>
    <p>La lumière remplace l'ombre : <code>halo-panel</code> (sarcelle) autour d'un panneau, <code>glow-signal</code> (vert) autour de ce qui est choisi.</p>

    <h1 class="ds-h1">Composants</h1>
${parts.map(section).join('\n')}

    <h1 class="ds-h1">Écrans</h1>
    <h2 class="ds-h2" id="ecrans">Écrans</h2>
    <p class="ds-lead">Les composants assemblés, avec les vrais contenus du prototype. Portrait 1 080 × 1 920 pour la borne, paysage 1 920 × 1 080 pour le bureau.</p>
    <div class="ds-screens">
${screens.map((c) => `      <section class="ds-comp" id="${c.name}"><header><h3>${esc(NAMES[c.name] ?? c.name)}</h3></header><div class="ds-doc">${md(c.readme)}</div>${frame(c, c.h > c.w ? 'tall' : '')}</section>`).join('\n')}
    </div>
  </main>
</div>
<script>
// Chaque aperçu garde sa taille de référence et se réduit à la largeur disponible.
function fit() {
  for (const f of document.querySelectorAll('.ds-frame')) {
    const w = +f.dataset.w, h = +f.dataset.h, s = Math.min(1, f.clientWidth / w);
    f.style.height = Math.round(h * s) + 'px';
    f.firstElementChild.style.transform = 'scale(' + s + ')';
  }
}
fit();
new ResizeObserver(fit).observe(document.querySelector('.ds-main'));
</script>
`;
fs.writeFileSync(out, page);
console.log(`${parts.length} composants, ${screens.length} écrans, ${Math.round(page.length / 1024)} ko`);
