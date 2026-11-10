// Plantages de la connexion YouTube relevés sur le PinCab le 10/11/2026 (préversion 0.1.9-essai.25),
// fixés ici pour qu'ils ne reviennent pas :
// 1. taper au téléphone dans la page de connexion de Google faisait tomber la page, puis tout restait
//    figé : webContents.insertText() plante le rendu dès qu'aucun élément n'a le focus dans la page
//    (app/src/page-input.ts). Il n'est plus employé nulle part ;
// 2. la proposition de Google de se connecter par une clé d'accès : WebAuthn est retiré des pages du
//    navigateur intégré, les autorisations et les choix de périphérique sont refusés sans fenêtre ;
// 3. « Utiliser la connexion de Firefox » : l'import passe l'état à « connecté », et un Firefox absent
//    ou pas connecté à YouTube le dit, avec la marche à suivre ;
// 4. écrans noirs sans issue : Exit ferme « Récupérer » sans focus, Exit tenu la ferme de force, une
//    fenêtre au rendu tombé est rechargée.
// De bout en bout dans un vrai Chromium hors écran : interne/demos/demo-saisie-robuste.cjs, sur des
// pages locales seulement (jamais Google), avec un téléphone brut ; aucune fenêtre n'apparaît.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { runElectron } from './electron-run';
import { REPO_ROOT } from './i18n-scan';
import { DEMOS, withoutInternal } from './interne';

const APP_SRC = path.join(REPO_ROOT, 'app', 'src');

function electronPath(): string | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require(require.resolve('electron', { paths: [REPO_ROOT] })) as string;
  } catch {
    return undefined;
  }
}
const electron = process.platform === 'win32' ? electronPath() : undefined;

test('aucun insertText dans l’application : il fait tomber la page qui n’a pas de champ actif', () => {
  const offenders = fs
    .readdirSync(APP_SRC)
    .filter((f) => f.endsWith('.ts'))
    .filter((f) => /\.insertText\s*\(/.test(fs.readFileSync(path.join(APP_SRC, f), 'utf8').replace(/\/\/.*$/gm, '')));
  assert.deepEqual(offenders, [], 'taper avec typeChars (app/src/page-input.ts)');
});

test('aucun menu d’application : ses raccourcis faisaient tomber la borne (Ctrl+A, rapport du PinCab)', () => {
  // Prouvé le 10/11/2026 (rapport de Crashpad du PinCab, symboles d'Electron 44.5.1) : un Ctrl+A non
  // traité par la page déclenchait « Tout sélectionner » du menu par défaut, qui appelait isFocused()
  // sur une vue cachée hors écran : pointeur nul, processus principal tombé (app-menu.ts).
  const main = fs.readFileSync(path.join(APP_SRC, 'main.ts'), 'utf8');
  const at = main.indexOf('noApplicationMenu();');
  assert.ok(at > 0 && at < main.indexOf('app.whenReady('), 'main.ts : noApplicationMenu() avant app.whenReady');
  const menus = fs.readdirSync(APP_SRC).filter((f) => f.endsWith('.ts') && /setApplicationMenu\((?!null\))/.test(fs.readFileSync(path.join(APP_SRC, f), 'utf8')));
  assert.deepEqual(menus, [], 'aucun menu d’application à raccourcis');
});

test('navigateur intégré : WebAuthn retiré de toutes ses pages, autorisations et périphériques refusés', () => {
  const source = fs.readFileSync(path.join(APP_SRC, 'acquire-window.ts'), 'utf8');
  // Toute vue de la session (fenêtre et vues cachées) naît sans WebAuthn.
  const views = [...source.matchAll(/new WebContentsView\(\{[\s\S]*?\}\s*\)/g)].map((m) => m[0]);
  assert.ok(views.length >= 2, `vues trouvées : ${views.length}`);
  for (const view of views) assert.match(view, /disableBlinkFeatures: NO_WEBAUTHN/, view);
  for (const guard of ['setPermissionRequestHandler', 'setPermissionCheckHandler', 'setDevicePermissionHandler', "'select-hid-device'", "'select-usb-device'", "'select-serial-port'", 'setBluetoothPairingHandler', "'select-bluetooth-device'", 'acquire-page-preload.js'])
    assert.ok(source.includes(guard), `${guard} manque dans acquire-window.ts`);
});

test('saisie du téléphone, clés d’accès, autorisations, import d’un navigateur : rien ne tombe, de bout en bout', { skip: (electron ? false : 'Electron sous Windows requis') || withoutInternal(), timeout: 240_000 }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-saisie-'));
  try {
    const env: NodeJS.ProcessEnv = { ...process.env, CYBERPINBALL_HORS_ECRAN: '1', CYBERPINBALL_RESEAU: 'simule', CP_SAISIE_OUT: dir, CYBERPINBALL_LANGUE: 'fr' };
    delete env.ELECTRON_RUN_AS_NODE;
    delete env.CYBERPINBALL_A_L_ECRAN;
    delete env.CP_SAISIE_PAS;
    const run = runElectron(electron!, [path.join(DEMOS, 'demo-saisie-robuste.cjs'), `--user-data-dir=${path.join(dir, 'chromium')}`], { dir, env, timeout: 220_000, cwd: REPO_ROOT });
    const result = fs.existsSync(path.join(dir, 'resultat.txt')) ? fs.readFileSync(path.join(dir, 'resultat.txt'), 'utf8') : `${run.stdout}\n${run.stderr}`;
    const progress = fs.existsSync(path.join(dir, 'progression.txt')) ? fs.readFileSync(path.join(dir, 'progression.txt'), 'utf8').split('\n').slice(-8).join('\n') : '';
    assert.equal(run.status, 0, `${result}\nDerniers pas :\n${progress}`);
    assert.doesNotMatch(result, /ÉCHEC/, result);
    assert.ok((result.match(/^OK /gm) ?? []).length >= 65, result);
    for (const step of [
      'champ d’adresse avec clés d’accès : l’application et la page répondent',
      'WebAuthn absent de la page de connexion',
      'navigation vers un autre site pendant la saisie : l’application et la page répondent',
      'WebAuthn absent aussi du cadre d’une autre origine',
      'clé d’accès (cle-connexion) : refusée sur-le-champ',
      'hid : refusé sans attendre',
      'aucune fenêtre ouverte par ces demandes',
      'un refus est une entrée claire de logs',
      'la page tombée est rechargée d’elle-même',
      'fermé pendant une rafale : rien ne plante',
      'Firefox connecté à YouTube : l’import passe l’état à « connecté »',
      'Firefox pas connecté à YouTube : l’écran le dit, avec la marche à suivre',
      'Firefox absent : la marche à suivre, sans lancer yt-dlp',
      'Exit ferme « Récupérer » même sans fenêtre de Cyber Pinball au premier plan',
      'Exit tenu deux secondes : « Récupérer » se ferme de force, page figée comprise',
      'fenêtre du menu au rendu tombé : rechargée d’elle-même',
      'aucun menu d’application : ses raccourcis ne peuvent rien déclencher',
      'Ctrl+A sélectionne tout le champ, sans menu',
      'Ctrl+C, Ctrl+X et Ctrl+V agissent dans le champ, sans menu',
      'Ctrl+Z annule la dernière frappe, sans menu',
      'texte complet de la télécommande : tout le champ remplacé, sans menu',
      'Ctrl+W, Ctrl+R, Ctrl+Maj+R, Ctrl+Maj+I, F11, Ctrl+Q, Ctrl+plus, Ctrl+moins, Ctrl+0, Ctrl+M : sans effet',
      'aucune requête n’est partie vers accounts.google.com',
      'Ctrl+A non traité pendant un chargement, vue cachée hors écran ouverte : l’application et la page répondent',
      'aucun processus de rendu arrêté',
    ])
      assert.match(result, new RegExp(`OK +${step.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), step);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});
