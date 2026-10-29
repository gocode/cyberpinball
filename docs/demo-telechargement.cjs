// Démonstration hors écran de la progression des téléchargements dans le bandeau de la
// fenêtre « Récupérer » (app/src/acquire-window.ts), avec un petit serveur local lent :
//  1. un fichier de taille connue : barre, pourcentage, « 4,0 Mo sur 24 Mo · 1,6 Mo/s · environ 15 s » ;
//  2. un second, de taille inconnue (envoi par morceaux) : volume et débit, barre indéterminée ;
//  3. Start de la borne (touche par défaut, « 1 ») désigne le dernier, Start de nouveau l'annule ;
//  4. un clic de souris sur « Annuler » annule le premier ;
//  5. un petit fichier va au bout : « Reçu : … », la ligne disparaît ;
//  6. quatre à la fois, dont un lancé hors de la page visible (comme un téléchargement direct
//     ou un média d'un site) : deux lignes et un résumé des autres ;
//  7. sur un écran de 1366 × 768 : la ligne tient, rien ne déborde ;
//  8. sur un écran en portrait (avec la ligne sur l'écran retenu) et en 4:3 : les boutons passent
//     sous ce qu'il faut télécharger.
// À chaque capture, le bandeau suit l'écran : la page du site commence juste sous lui, et rien
// de ce qu'il montre ne descend plus bas.
// La notice du menu (events.progress) est relevée : même texte, deux fois par seconde au plus.
// Aucune fenêtre n'apparaît (rendu hors écran), lancé par docs\demo-telechargement.ps1 sur le
// bureau caché. Captures et relevé dans tmp\demo-telechargement\captures.
//   npm run build
//   .\docs\demo-telechargement.ps1

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { app, BrowserWindow, ipcMain, session } = require('electron');

const WT = path.resolve(__dirname, '..');
const BASE = path.join(WT, 'tmp', 'demo-telechargement');
const CAPTURES = path.join(BASE, 'captures');
const core = require(path.join(WT, 'packages', 'core', 'dist', 'index.js'));
const { createAcquirer, ACQUIRE_PARTITION } = require(path.join(WT, 'app', 'dist', 'acquire-window.js'));
const { LayoutReport } = require(path.join(WT, 'app', 'dist', 'layout-check.js'));
const LOG = [];
const MB = 1024 * 1024;

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Serveur lent : /connu/<nom>?mo=24&debit=1.6 (Content-Length donné), /inconnu/<nom>
 * (envoi par morceaux, sans taille ; avec &fin=1, il s'arrête à `mo`), /fiche (page de
 * départ), /fiche-taille (fiche à la manière de vpuniverse : la taille de chaque fichier
 * affichée sur la page, que le serveur, lui, n'annonce pas). Les réponses en cours sont
 * suivies : une annulation côté Cyber Pinball ferme la connexion, le relevé le dit.
 */
function slowServer() {
  const closed = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/fiche') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html><meta charset="utf-8"><title>Fiche simulée</title>
<style>html,body{margin:0;height:100%;background:#1b2530;color:#e8eef2;font:22px/1.5 Segoe UI,sans-serif}
main{max-width:900px;margin:60px auto;padding:24px 32px;background:#243241;border-radius:8px}a{color:#7cc4ff}</style>
<main><h1>Fiche simulée : serveur local lent</h1><p>Les téléchargements de cette démonstration viennent d'un petit serveur sur 127.0.0.1, volontairement lent.</p>
<ul><li><a href="/connu/Table-simulee-24Mo.zip?mo=24&debit=1.6">Table simulée (24 Mo, taille connue)</a></li><li><a href="/inconnu/Medias-sans-taille.zip">Médias (taille inconnue)</a></li></ul></main>`);
      return;
    }
    if (url.pathname === '/fiche-taille') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html><meta charset="utf-8"><title>Fiche avec tailles</title>
<style>html,body{margin:0;height:100%;background:#1b2530;color:#e8eef2;font:22px/1.5 Segoe UI,sans-serif}
main{max-width:900px;margin:60px auto;padding:24px 32px;background:#243241;border-radius:8px}li{margin:6px 0}</style>
<main><h1>Medieval Madness (Williams 1997)</h1><ul class="ipsDataList"><li><strong>Views</strong> <span>12 345</span></li><li><strong>Size</strong> <span>5.2 MB</span></li></ul>
<ul><li class="ipsDataItem"><h4>Table-sans-en-tete.zip</h4><p>4 MB</p></li><li class="ipsDataItem"><h4>Medieval Madness.directb2s</h4><p>1.2 MB</p></li></ul></main>`);
      return;
    }
    const m = /^\/(connu|inconnu)\/(.+)$/.exec(url.pathname);
    if (!m) {
      res.writeHead(404).end();
      return;
    }
    const known = m[1] === 'connu';
    const size = Math.round(Number(url.searchParams.get('mo') ?? 24) * MB);
    const rate = Number(url.searchParams.get('debit') ?? 1) * MB;
    const headers = { 'content-type': 'application/zip', 'content-disposition': `attachment; filename="${decodeURIComponent(m[2])}"` };
    if (known) headers['content-length'] = String(size);
    res.writeHead(200, headers);
    const chunk = Buffer.alloc(Math.round(rate / 20), 0x5a);
    let sent = 0;
    const timer = setInterval(() => {
      if ((known || url.searchParams.has('fin')) && sent >= size) {
        clearInterval(timer);
        res.end();
        return;
      }
      const piece = known || url.searchParams.has('fin') ? chunk.subarray(0, Math.min(chunk.length, size - sent)) : chunk;
      sent += piece.length;
      res.write(piece);
    }, 50);
    res.on('close', () => {
      clearInterval(timer);
      if (!res.writableFinished) closed.push(decodeURIComponent(m[2]));
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port, closed })));
}

async function run(report) {
  const { server, port, closed } = await slowServer();
  const origin = `http://127.0.0.1:${port}`;
  const dir = path.join(BASE, 'acquisition');
  const received = [];
  const failed = [];
  /** Notices du menu (catalog.ts les écrit avec le même formatTransfer) : texte et instant. */
  const notices = [];
  let screenBounds = { x: 0, y: 0, width: 1920, height: 1080 };
  /** Ligne du bandeau sur l'écran retenu (écran choisi pas branché) : absente, sauf pour le portrait. */
  let screenNotice;
  const KEYS = core.navigationKeys(core.DEFAULT_BUTTONS);
  const acquirer = createAcquirer({
    dir: () => dir,
    received: (file, facts) => received.push(facts.filename),
    progress: (filename, p) => notices.push({ at: Date.now(), text: core.t('Téléchargement de « {file} » : {progress}…', { file: filename, progress: core.formatTransfer(p) }) }),
    failed: (filename, reason) => failed.push(`${filename} (${reason})`),
    closed: () => {},
    screen: () => ({ bounds: screenBounds, notice: screenNotice }),
    exitKeys: () => KEYS.exit,
    navKeys: () => KEYS,
  });
  const acq = session.fromPartition(ACQUIRE_PARTITION);
  await acq.clearStorageData();

  fs.mkdirSync(CAPTURES, { recursive: true });
  let step = 0;
  let open;

  async function openWindow() {
    acquirer.show({ url: `${origin}/fiche`, game: 'Démonstration · téléchargements', expected: 'Table : serveur local lent', host: '127.0.0.1 · sans compte' });
    for (let i = 0; i < 50 && !(open = acquirer.current()); i++) await delay(100);
    if (!open) throw new Error('fenêtre « Récupérer » pas ouverte');
    for (let i = 0; i < 50 && open.view.webContents.isLoading(); i++) await delay(100);
    await delay(400);
  }

  /** État du bandeau, tel que le renderer l'affiche. */
  const barState = () =>
    open.win.webContents.executeJavaScript(`({
      height: getComputedStyle(document.documentElement).getPropertyValue('--bar-height').trim(),
      status: document.getElementById('status').textContent,
      rows: [...document.querySelectorAll('.download')].map((r) => ({
        name: r.querySelector('.dl-name').textContent,
        pct: r.querySelector('.dl-pct').textContent,
        text: r.querySelector('.dl-text').textContent,
        button: r.querySelector('.dl-cancel').textContent,
        unknown: r.classList.contains('unknown'),
        armed: r.classList.contains('armed'),
        fill: r.querySelector('.dl-fill').style.width,
      })),
      more: document.querySelector('.download-more')?.textContent ?? '',
    })`);

  /** Capture du bandeau seul (à sa hauteur) et de la fenêtre entière réduite de moitié. */
  async function shot(name) {
    await delay(300);
    const label = `${String(step++).padStart(2, '0')}-${name}`;
    const s = await barState();
    await report.check(open.win.webContents, `${label} (bandeau)`);
    const height = parseInt(s.height, 10) || 96;
    const { width } = open.win.getContentBounds();
    const bar = (await open.win.capturePage()).crop({ x: 0, y: 0, width, height });
    fs.writeFileSync(path.join(CAPTURES, `${label}-bandeau.png`), bar.toPNG());
    const page = await open.view.webContents.capturePage();
    const whole = new BrowserWindow({ show: false, width: width / 2, height: open.win.getContentBounds().height / 2, useContentSize: true, enableLargerThanScreen: true, webPreferences: { offscreen: true } });
    await whole.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html><style>body{margin:0;background:#000;overflow:hidden}img{display:block;width:100%}</style><img src="${bar.toDataURL()}"><img src="${page.toDataURL()}">`)}`,
    );
    await delay(250);
    fs.writeFileSync(path.join(CAPTURES, `${label}-fenetre.png`), (await whole.capturePage()).toPNG());
    whole.destroy();
    // Le bandeau suit l'écran (petit côté de 1 080 = 1 px de référence) : la page du site
    // commence juste sous lui, et rien de ce qu'il montre ne dépasse sa hauteur.
    const geometry = await open.win.webContents.executeJavaScript(`(() => {
      const kids = [...document.querySelector('.frame').children].filter((e) => e.getClientRects().length);
      return { bottom: Math.max(...kids.map((e) => e.getBoundingClientRect().bottom + parseFloat(getComputedStyle(e).marginBottom))), narrow: document.documentElement.classList.contains('narrow'), size: [innerWidth, innerHeight] };
    })()`);
    // Un téléchargement qui finit pendant le relevé change la hauteur : relue jusqu'à ce que le
    // bandeau et la page du site disent la même chose.
    let pageTop, barTop;
    for (let i = 0; i < 20; i++) {
      pageTop = open.view.getBounds().y;
      barTop = parseInt(await open.win.webContents.executeJavaScript(`getComputedStyle(document.documentElement).getPropertyValue('--bar-height')`), 10);
      if (pageTop === barTop) break;
      await delay(100);
    }
    if (pageTop !== barTop) fail(`${label} : la page du site commence à ${pageTop} px, sous un bandeau de ${barTop} px`);
    if (geometry.bottom > height + 0.5) fail(`${label} : le contenu du bandeau descend à ${geometry.bottom.toFixed(1)} px, plus bas que ses ${height} px`);
    LOG.push(`${label} : écran ${geometry.size.join(' × ')}${geometry.narrow ? ' (étroit : boutons dessous)' : ''} · bandeau ${s.height} (contenu jusqu'à ${geometry.bottom.toFixed(1)}) · statut « ${s.status} »`);
    for (const r of s.rows) LOG.push(`    ${r.armed ? '▶ ' : ''}${r.name} | ${r.pct || (r.unknown ? '(indéterminé)' : '')} | ${r.text} | [${r.button}]${r.fill ? ` barre ${r.fill}` : ''}`);
    if (s.more) LOG.push(`    ${s.more}`);
    return s;
  }

  const startDownload = (name, query = '') => open.view.webContents.downloadURL(`${origin}/${name}${query}`);
  const press = async (code, key) => {
    open.win.webContents.focus();
    open.win.webContents.sendInputEvent({ type: 'keyDown', keyCode: key });
    await delay(30);
    open.win.webContents.sendInputEvent({ type: 'keyUp', keyCode: key });
    LOG.push(`→ touche ${code} (${key})`);
    await delay(200);
  };
  const waitRows = async (n, timeout = 8000) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      if ((await barState()).rows.length === n) return;
      await delay(100);
    }
    throw new Error(`attendu ${n} ligne(s) de téléchargement, vu ${(await barState()).rows.length}`);
  };
  const fail = (why) => {
    throw new Error(why);
  };

  await openWindow();
  await shot('fiche');

  // 1. Taille connue.
  LOG.push('→ téléchargement de 24 Mo à 1,6 Mo/s');
  startDownload('connu/Table-simulee-24Mo.zip', '?mo=24&debit=1.6');
  await waitRows(1);
  await delay(2600);
  let s = await shot('taille-connue');
  if (!/^\d+ %$/.test(s.rows[0].pct) || !/ sur 24 Mo · .+ [kM]o\/s · environ /.test(s.rows[0].text)) fail(`ligne incomplète : ${JSON.stringify(s.rows[0])}`);

  // 2. Taille inconnue.
  LOG.push('→ téléchargement sans taille à 0,8 Mo/s');
  startDownload('inconnu/Medias-sans-taille.zip', '?debit=0.8');
  await waitRows(2);
  await delay(2200);
  s = await shot('taille-inconnue');
  const unknown = s.rows.find((r) => r.name.startsWith('Medias'));
  if (!unknown?.unknown || unknown.pct || / sur /.test(unknown.text) || !/[kM]o\/s/.test(unknown.text)) fail(`ligne sans taille incorrecte : ${JSON.stringify(unknown)}`);

  // 3. Start de la borne : désigne le dernier, puis l'annule.
  await press('Start', '1');
  s = await shot('borne-start-designe');
  if (!s.rows.find((r) => r.armed)?.name.startsWith('Medias')) fail('Start n’a pas désigné le dernier téléchargement');
  await press('Start', '1');
  await waitRows(1);
  s = await shot('borne-start-annule');
  if (!/annulé : Medias-sans-taille/.test(s.status)) fail(`annulation non dite : ${s.status}`);

  // 4. Souris : clic sur Annuler du premier.
  const box = await open.win.webContents.executeJavaScript(`(() => { const r = document.querySelector('.dl-cancel').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  open.win.webContents.sendInputEvent({ type: 'mouseDown', x: Math.round(box.x), y: Math.round(box.y), button: 'left', clickCount: 1 });
  open.win.webContents.sendInputEvent({ type: 'mouseUp', x: Math.round(box.x), y: Math.round(box.y), button: 'left', clickCount: 1 });
  LOG.push(`→ clic sur « Annuler » (${Math.round(box.x)}, ${Math.round(box.y)})`);
  await waitRows(0);
  s = await shot('souris-annule');
  if (!/annulé : Table-simulee-24Mo/.test(s.status)) fail(`annulation à la souris non dite : ${s.status}`);

  // 5. Un petit fichier va au bout.
  LOG.push('→ téléchargement de 3 Mo à 1,5 Mo/s, jusqu’au bout');
  startDownload('connu/Petit-fichier.zip', '?mo=3&debit=1.5');
  await waitRows(1);
  await delay(1300);
  await shot('petit-en-cours');
  await waitRows(0, 10_000);
  s = await shot('recu');
  if (!/^Reçu : Petit-fichier\.zip/.test(s.status)) fail(`fin non dite : ${s.status}`);

  // 5 bis. Le serveur n'annonce pas la taille, la page du site l'affiche : « sur environ 4 Mo »,
  // un pourcentage et une barre qui avance (jamais 100 % avant la fin), le bon fichier de la liste.
  LOG.push('→ fiche qui affiche la taille de chaque fichier ; serveur sans taille, 4 Mo à 1 Mo/s');
  await open.view.webContents.loadURL(`${origin}/fiche-taille`);
  await delay(500);
  startDownload('inconnu/Table-sans-en-tete.zip', '?mo=4&debit=1&fin=1');
  await waitRows(1);
  await delay(2000);
  s = await shot('taille-lue-sur-la-page');
  const approx = s.rows[0];
  if (!/^\d+ %$/.test(approx.pct) || !/ sur environ 4 Mo · .+ [kM]o\/s/.test(approx.text) || approx.unknown || !approx.fill) fail(`taille de la page non reprise : ${JSON.stringify(approx)}`);
  await waitRows(0, 10_000);
  s = await shot('taille-lue-recu');
  if (!/^Reçu : Table-sans-en-tete\.zip/.test(s.status)) fail(`fin non dite : ${s.status}`);
  await open.view.webContents.loadURL(`${origin}/fiche`);
  await delay(300);

  // 6. Quatre à la fois, dont un lancé hors de la page visible (session seule, comme une vue cachée).
  LOG.push('→ quatre téléchargements, dont un hors de la page visible');
  startDownload('connu/Table-A.zip', '?mo=40&debit=1.2');
  startDownload('connu/ROM-B.zip', '?mo=12&debit=0.6');
  startDownload('inconnu/Pack-C.zip', '?debit=0.5');
  acq.downloadURL(`${origin}/connu/Media-cache-D.zip?mo=20&debit=0.9`);
  await waitRows(2);
  await delay(2200);
  s = await shot('quatre-a-la-fois');
  if (!/^Et 2 autres : /.test(s.more)) fail(`résumé attendu : ${s.more}`);
  // Start désigne le dernier arrivé (l'ordre d'arrivée des quatre varie), qui était résumé :
  // il prend la place visible.
  const hidden = s.rows.map((r) => r.name);
  await press('Start', '1');
  s = await shot('quatre-designe');
  const first = s.rows.find((r) => r.armed)?.name;
  if (!first || hidden.includes(first)) fail(`le dernier, résumé, doit être désigné et montré : ${JSON.stringify(s.rows)}`);
  // Précédent (flipper gauche, ou flèche gauche du clavier de secours) ; Exit renonce sans fermer la fenêtre.
  await press('Précédent', 'Left');
  s = await barState();
  const second = s.rows.find((r) => r.armed)?.name;
  if (!second || second === first) fail(`Précédent n’a pas désigné le téléchargement d’avant : ${JSON.stringify(s.rows)}`);
  LOG.push(`    désigné : ${first}, puis ${second} (Précédent)`);
  await press('Exit', 'Escape');
  if (!acquirer.isOpen()) fail('Exit a fermé la fenêtre au lieu de renoncer');
  s = await shot('quatre-exit-renonce');
  if (s.rows.some((r) => r.armed)) fail('Exit n’a pas renoncé');

  // 7. Écran plus étroit : fermer, rouvrir sur 1366 × 768 (les téléchargements continuent).
  acquirer.close();
  for (let i = 0; i < 50 && acquirer.isOpen(); i++) await delay(100);
  LOG.push('→ fenêtre fermée puis rouverte sur un écran de 1366 × 768 : les téléchargements continuent');
  screenBounds = { x: 0, y: 0, width: 1366, height: 768 };
  await openWindow();
  await delay(600);
  s = await shot('ecran-1366');
  if (s.rows.length !== 2 || !s.more) fail('rouverte, la fenêtre doit montrer les téléchargements en cours');
  // 8. Écran étroit : un écran en portrait (1080 × 1920), avec la ligne sur l'écran retenu, puis
  // un 4:3 (1024 × 768) : les boutons passent sous ce qu'il faut télécharger.
  for (const [name, bounds, notice] of [
    ['ecran-portrait', { x: 0, y: 0, width: 1080, height: 1920 }, 'DMD n’est pas branché, ouvert sur Fronton (automatique)'],
    ['ecran-4-3', { x: 0, y: 0, width: 1024, height: 768 }, undefined],
  ]) {
    acquirer.close();
    for (let i = 0; i < 50 && acquirer.isOpen(); i++) await delay(100);
    LOG.push(`→ fenêtre rouverte sur un écran de ${bounds.width} × ${bounds.height}${notice ? ', avec la ligne sur l’écran retenu' : ''}`);
    screenBounds = bounds;
    screenNotice = notice;
    await openWindow();
    await delay(600);
    s = await shot(name);
    if (s.rows.length !== 2 || !s.more) fail(`${name} : la fenêtre doit montrer les téléchargements en cours`);
  }
  screenNotice = undefined;
  // Tout annuler, à la souris.
  for (let i = 0; i < 4; i++) {
    await open.win.webContents.executeJavaScript(`document.querySelector('.dl-cancel')?.click()`);
    await delay(400);
  }
  await waitRows(0, 4000);
  s = await shot('tout-annule');

  // Notices du menu : deux fois par seconde au plus, même texte que le bandeau.
  const gaps = notices.slice(1).map((n, i) => n.at - notices[i].at);
  LOG.push(`notices du menu : ${notices.length}, dernière : « ${notices.at(-1)?.text ?? ''} »`);
  const sample = notices.find((n) => / · .+ [kM]o\/s · environ /.test(n.text));
  LOG.push(`    exemple avec débit et temps restant : « ${sample?.text ?? '(aucun)'} »`);
  if (!sample) fail('aucune notice du menu avec débit et temps restant');
  // Plusieurs téléchargements à la fois : une notice chacun au même relevé, pas plus d'un relevé par 450 ms.
  const bursts = gaps.filter((g) => g > 20);
  if (bursts.some((g) => g < 450)) fail(`notices trop rapprochées : ${bursts.filter((g) => g < 450).join(', ')} ms`);
  LOG.push(`reçus : ${received.join(', ') || '(aucun)'} ; échecs : ${failed.join(', ') || '(aucun)'}`);
  LOG.push(`connexions fermées par une annulation, côté serveur : ${closed.join(', ') || '(aucune)'}`);
  const left = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
  LOG.push(`dossier de réception : ${left.join(', ') || '(vide)'}`);
  if (left.some((f) => !['Petit-fichier.zip', 'Table-sans-en-tete.zip'].includes(f))) fail('un fichier annulé est resté dans le dossier de réception');

  acquirer.close();
  for (let i = 0; i < 50 && acquirer.isOpen(); i++) await delay(100);
  await acq.clearStorageData();
  server.close();
}

app.on('window-all-closed', () => {});

app.whenReady().then(async () => {
  // Garde-temps : une démonstration ne reste jamais bloquée ; le relevé dit où elle en était.
  setTimeout(() => {
    LOG.push('ÉCHEC : plus de trois minutes, arrêt (dernière étape ci-dessus).');
    fs.mkdirSync(CAPTURES, { recursive: true });
    fs.writeFileSync(path.join(CAPTURES, 'resultat.txt'), LOG.join('\n') + '\n', 'utf8');
    console.log(LOG.join('\n'));
    app.exit(2);
  }, 180_000).unref();
  // Langue et catalogue des fenêtres (préchargement), comme language.ts dans l'application.
  ipcMain.on('i18n', (event) => {
    event.returnValue = { language: core.language(), locale: core.locale(), messages: core.messagesOf(core.language()) };
  });
  fs.rmSync(BASE, { recursive: true, force: true });
  const report = new LayoutReport(CAPTURES);
  try {
    await run(report);
  } catch (error) {
    LOG.push(`ÉCHEC : ${error.stack}`);
    process.exitCode = 1;
  }
  report.save();
  fs.writeFileSync(path.join(CAPTURES, 'resultat.txt'), LOG.join('\n') + '\n', 'utf8');
  console.log(LOG.join('\n'));
  // app.quit() rendrait 0 même en échec : le script PowerShell n'y verrait rien.
  app.exit(process.exitCode ?? 0);
});
