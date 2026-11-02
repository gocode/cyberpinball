// Essai hors écran du bloqueur de publicités du navigateur intégré (app/src/ad-blocker.ts) :
// une fausse page vidéo avec une régie, une bannière et un emplacement que seul un scriptlet
// retire, servie en local (toutes les adresses mènent à 127.0.0.1), et de fausses listes de
// filtres. Lancé par docs\demo-publicites.ps1 sur le bureau caché ; profil Electron à part
// (tmp\demo-publicites-profil). Aucun vrai site ni vraie liste : le bloqueur sur le vrai
// YouTube se vérifie dans les tests manuels. Captures et relevé dans tmp\demo-publicites\captures.
//   npm run build
//   .\docs\demo-publicites.ps1
//
// 1. Bloqueur en marche, listes reçues : la requête vers la régie est annulée, la bannière
//    masquée, le scriptlet de la page injecté avant son premier script (YouTube lit ses publicités
//    dès ce script) ; les listes sont gardées sur disque.
// 2. La même page sur un forum des tables (vpforums.org) : rien n'est filtré.
// 3. Réglage coupé (« Bloquer les publicités : non ») : la page telle quelle, dès la suivante.
// 4. Redémarrage hors ligne avec les listes gardées : bloqué sans rien recevoir.
// 5. Premier démarrage hors ligne, sans listes : rien de bloqué, le menu dit « pas encore reçues ».

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { app, BrowserWindow, session } = require('electron');

const WT = path.resolve(__dirname, '..');
const BASE = path.join(WT, 'tmp', 'demo-publicites');
const CAPTURES = path.join(BASE, 'captures');
const PROFILE = path.join(WT, 'tmp', 'demo-publicites-profil');
fs.rmSync(BASE, { recursive: true, force: true });
fs.rmSync(PROFILE, { recursive: true, force: true });
fs.mkdirSync(CAPTURES, { recursive: true });
app.setPath('userData', PROFILE);
// Toutes les adresses mènent au serveur local : video.example, ads.example, vpforums.org.
app.commandLine.appendSwitch('host-resolver-rules', 'MAP * 127.0.0.1');
// Sans quoi Chromium tente le https d'un vrai domaine (passage automatique en https) : refusé en local.
app.commandLine.appendSwitch('disable-features', 'HttpsUpgrades');
// Chaque visite ferme sa fenêtre : sans cet écouteur, Electron quitterait l'application (code 0)
// à la première, et la visite suivante échouerait sans que l'essai le dise.
app.on('window-all-closed', () => {});

const { createAdBlocker } = require(path.join(WT, 'app', 'dist', 'ad-blocker.js'));
const core = require(path.join(WT, 'packages', 'core', 'dist', 'index.js'));

const LOG = [];
const failures = [];
function check(ok, text) {
  LOG.push(`${ok ? 'OK  ' : 'ÉCHEC'} ${text}`);
  if (!ok) failures.push(text);
}
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// Régie : chaque requête reçue est comptée (un bloqueur qui marche n'en laisse passer aucune).
const adHits = [];
const PAGE = (port) => `<!doctype html><meta charset="utf-8"><title>Vidéo</title>
<style>body{margin:0;font:28px Segoe UI;background:#101418;color:#e8f0f0}div{margin:16px;padding:24px;border-radius:8px}
.pub-banniere{background:#c0392b;color:#fff}#emplacement{background:#d35400;color:#fff}#contenu{background:#0f5257}</style>
<div class="pub-banniere">PUBLICITÉ (bannière, masquée par la liste)</div>
<div id="emplacement">PUBLICITÉ (retirée par le scriptlet)</div>
<div id="contenu">La vidéo</div>
<script>document.documentElement.dataset.reseau = 'attente'; document.documentElement.dataset.avant = window.scriptletAvant ? 'oui' : 'non';</script>
<script src="http://ads.example:${port}/pub.js" onerror="document.documentElement.dataset.reseau = 'bloque'"></script>`;

function serve() {
  const server = http.createServer((req, res) => {
    const host = (req.headers.host || '').split(':')[0];
    if (host === 'ads.example') {
      adHits.push(req.url);
      res.writeHead(200, { 'content-type': 'application/javascript' });
      return res.end("document.documentElement.dataset.reseau = 'charge';");
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(PAGE(server.address().port));
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

// Fausses listes : la régie, la bannière, et un scriptlet propre à la page vidéo (et au forum,
// pour montrer que le forum n'est pas filtré même quand une règle le vise).
const FILTERS = ['||ads.example^', '##.pub-banniere', 'video.example,vpforums.org##+js(retirer-emplacement)'].join('\n');
const RESOURCES = JSON.stringify({
  scriptlets: [{ name: 'retirer-emplacement.js', aliases: ['retirer-emplacement'], body: "function retirerEmplacement() { window.scriptletAvant = true; const go = () => { const e = document.getElementById('emplacement'); if (e) { e.remove(); document.documentElement.dataset.scriptlet = 'ok'; } }; if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go(); }", dependencies: [], executionWorld: 'MAIN' }],
  redirects: [],
});
let fetches = 0;
const onlineFetch = async (url) => {
  fetches++;
  await delay(150);
  const u = String(url);
  if (u.endsWith('/resources.json')) return new Response(RESOURCES);
  if (u.endsWith('/pubs.txt')) return new Response(FILTERS);
  return new Response('', { status: 404 });
};
const offlineFetch = async () => {
  fetches++;
  throw new Error('hors ligne (essai)');
};

function blocker(name, fetchImpl, enabled) {
  return createAdBlocker({ cacheFile: () => path.join(BASE, name, 'adblock', 'filtres.bin'), enabled, fetch: fetchImpl, lists: ['https://listes.example/pubs.txt'] });
}

/** Charge la page dans une fenêtre hors écran de la session ; rend ce que la page dit d'elle-même. */
async function visit(ses, url, capture) {
  const win = new BrowserWindow({ show: false, width: 900, height: 420, useContentSize: true, webPreferences: { offscreen: true, session: ses, sandbox: true, contextIsolation: true, nodeIntegration: false } });
  try {
    await win.loadURL(url);
    await delay(1200);
    const seen = await win.webContents.executeJavaScript(`({
      reseau: document.documentElement.dataset.reseau,
      banniere: getComputedStyle(document.querySelector('.pub-banniere')).display,
      emplacement: Boolean(document.getElementById('emplacement')),
      scriptlet: document.documentElement.dataset.scriptlet || '',
      avant: document.documentElement.dataset.avant,
    })`);
    if (capture) fs.writeFileSync(path.join(CAPTURES, capture), (await win.webContents.capturePage()).toPNG());
    return seen;
  } finally {
    win.destroy();
  }
}

async function main() {
  const server = await serve();
  const port = server.address().port;
  const video = `http://video.example:${port}/watch`;
  const forum = `http://www.vpforums.org:${port}/index.php?app=downloads&showfile=1`;

  // 1. En marche, listes reçues.
  let enabled = true;
  const b1 = blocker('borne', onlineFetch, () => enabled);
  const s1 = session.fromPartition('demo-publicites-1');
  b1.attach(s1);
  check(b1.state() === 'loading', `pendant la réception, le menu dit « en cours » (${b1.state()})`);
  await b1.settled();
  check(b1.state() === 'ready', `listes reçues : prêt (${b1.state()})`);
  check(fs.existsSync(path.join(BASE, 'borne', 'adblock', 'filtres.bin')), 'listes gardées sur disque');
  let seen = await visit(s1, video, '1-bloque.png');
  check(seen.reseau === 'bloque', `régie : requête annulée (${seen.reseau})`);
  check(seen.banniere === 'none', `bannière masquée (${seen.banniere})`);
  check(!seen.emplacement && seen.scriptlet === 'ok', `scriptlet injecté, emplacement retiré (${seen.scriptlet || 'non'})`);
  // YouTube lit ses publicités dans le premier script de la page : le scriptlet doit passer avant.
  check(seen.avant === 'oui', `scriptlet exécuté avant le premier script de la page (${seen.avant})`);
  check(adHits.length === 0, `la régie n'a reçu aucune requête (${adHits.length})`);

  // 2. Forum des tables : jamais filtré.
  seen = await visit(s1, forum, '2-forum.png');
  check(seen.reseau === 'charge' && seen.banniere !== 'none' && seen.emplacement && seen.avant === 'non', `forum : page telle quelle (${JSON.stringify(seen)})`);

  // 3. Réglage coupé : dès la page suivante.
  enabled = false;
  check(b1.state() === 'off', `réglage coupé : le menu dit « non » (${b1.state()})`);
  seen = await visit(s1, video, '3-reglage-coupe.png');
  check(seen.reseau === 'charge' && seen.banniere !== 'none' && seen.emplacement, `réglage coupé : publicités montrées (${JSON.stringify(seen)})`);

  // 4. Redémarrage hors ligne, listes gardées (moins d'un jour) : rien n'est demandé.
  fetches = 0;
  const b2 = blocker('borne', offlineFetch, () => true);
  const s2 = session.fromPartition('demo-publicites-2');
  b2.attach(s2);
  check(b2.state() === 'ready' && fetches === 0, `redémarrage : listes du disque, aucune réception (${b2.state()}, ${fetches})`);
  seen = await visit(s2, video);
  check(seen.reseau === 'bloque' && seen.banniere === 'none', `redémarrage : bloqué (${JSON.stringify(seen)})`);

  // 5. Premier démarrage hors ligne : rien de bloqué, le menu le dit.
  const b3 = blocker('neuve', offlineFetch, () => true);
  const s3 = session.fromPartition('demo-publicites-3');
  b3.attach(s3);
  await b3.settled();
  check(b3.state() === 'unavailable', `hors ligne sans listes : « pas encore reçues » (${b3.state()})`);
  check(/hors ligne/.test(core.adBlockLabel(b3.state()).detail), 'le détail du menu parle de hors ligne');
  seen = await visit(s3, video);
  check(seen.reseau === 'charge', `sans listes, la page passe (${seen.reseau})`);

  server.close();
}

app.whenReady().then(async () => {
  try {
    await main();
  } catch (e) {
    failures.push(String(e && e.stack ? e.stack : e));
    LOG.push(`ÉCHEC ${e && e.stack ? e.stack : e}`);
  }
  fs.writeFileSync(path.join(CAPTURES, 'resultat.txt'), LOG.join('\n') + '\n');
  for (const line of LOG) console.log(line);
  app.exit(failures.length ? 1 : 0);
});
