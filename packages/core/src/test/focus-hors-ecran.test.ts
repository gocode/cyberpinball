// Plantage du 16/11/2026 (poste de développement, 0.1.14-essai.4) : « Mon avatar » > « Chercher une
// image sur le web… », clic droit sur une image, « Télécharger cette image », et tout Cyber Pinball se
// fermait. Rapport de Crashpad symbolisé (symboles d'Electron 44.5.1) : Menu::ExecuteCommand →
// webContents.getFocusedWebContents() → WebContents::IsFocused → aura::Window::GetToplevelWindow,
// pointeur nul. Un clic dans un menu natif cherche la page qui a le focus en interrogeant chaque page
// vivante ; une page hors écran (le convertisseur de media-convert.ts, les lectures cachées de
// « Récupérer ») n'a pas de fenêtre native et fait tomber le processus principal. Même famille que
// le Ctrl+A du PinCab le 10/11/2026 (saisie-robuste.test.ts) : la recherche est remplacée au
// démarrage (app-menu.ts, focusSafeLookup), pour tout menu natif présent et à venir.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { runElectron } from './electron-run';
import { REPO_ROOT } from './i18n-scan';
import { DEMOS, withoutInternal } from './interne';

const APP_SRC = path.join(REPO_ROOT, 'app', 'src');
const read = (file: string) => fs.readFileSync(path.join(APP_SRC, file), 'utf8');
const code = (file: string) => read(file).replace(/\/\/.*$/gm, '');

function electronPath(): string | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require(require.resolve('electron', { paths: [REPO_ROOT] })) as string;
  } catch {
    return undefined;
  }
}
const electron = process.platform === 'win32' ? electronPath() : undefined;
const built = fs.existsSync(path.join(REPO_ROOT, 'app', 'dist', 'app-menu.js'));

test('la recherche du focus d’Electron est remplacée au démarrage, avant tout menu', () => {
  const main = read('main.ts');
  const at = main.indexOf('focusSafeLookup();');
  assert.ok(at > 0 && at < main.indexOf('app.whenReady('), 'main.ts : focusSafeLookup() avant app.whenReady');
  const menu = code('app-menu.ts');
  assert.match(menu, /webContents\.getFocusedWebContents = \(\) => focusedWebContents\(webContents\.getAllWebContents\(\)\)/);
  // Une page détruite ou hors écran n'est jamais interrogée.
  assert.match(menu, /contents\.isDestroyed\(\) \|\| contents\.isOffscreen\(\) \|\| !contents\.isFocused\(\)/);
});

test('aucune autre recherche de la page qui a le focus dans l’application', () => {
  // getFocusedWebContents ou isFocused() sur toutes les pages : le même pointeur nul.
  const offenders = fs
    .readdirSync(APP_SRC)
    .filter((f) => f.endsWith('.ts') && f !== 'app-menu.ts')
    .filter((f) => /getFocusedWebContents\s*\(|getAllWebContents\(\)[^;]*isFocused\(/.test(code(f)));
  assert.deepEqual(offenders, [], 'passer par focusedWebContents (app-menu.ts)');
});

function bench(dir: string, extra: NodeJS.ProcessEnv = {}) {
  const env: NodeJS.ProcessEnv = { ...process.env, CYBERPINBALL_HORS_ECRAN: '1', CYBERPINBALL_RESEAU: 'simule', CP_BANC_OUT: dir, CYBERPINBALL_LANGUE: 'fr', ...extra };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.CYBERPINBALL_A_L_ECRAN;
  const run = runElectron(electron!, [path.join(DEMOS, 'banc-avatar-web.cjs'), `--user-data-dir=${path.join(dir, 'chromium')}`], { dir, env, timeout: 150_000, cwd: REPO_ROOT });
  const result = fs.existsSync(path.join(dir, 'resultat.txt')) ? fs.readFileSync(path.join(dir, 'resultat.txt'), 'utf8') : `${run.stdout}\n${run.stderr}`;
  return { run, result };
}

const skip = (electron ? false : 'Electron sous Windows requis') || (built ? false : 'npm run build requis') || withoutInternal();

test('avatar pris sur le web, convertisseur ouvert : le clic du menu ne fait plus tomber Cyber Pinball', { skip, timeout: 200_000 }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-focus-'));
  try {
    const { run, result } = bench(dir);
    assert.equal(run.status, 0, result);
    assert.match(result, /RÉUSSI : 2 tours/, result);
    assert.equal((result.match(/^processus principal vivant après le clic$/gm) ?? []).length, 2, result);
    assert.equal((result.match(/^image de travail : /gm) ?? []).length, 2, result);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('le banc voit le plantage sans le correctif (il prouve quelque chose)', { skip, timeout: 200_000 }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-focus-sans-'));
  try {
    const { run, result } = bench(dir, { BANC_SANS_CORRECTIF: '1' });
    assert.notEqual(run.status, 0, result);
    assert.match(result, /clic sur « Télécharger cette image »/, result);
    assert.doesNotMatch(result, /processus principal vivant après le clic/, result);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
