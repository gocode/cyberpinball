// Dossier d'essai d'un lancement d'Electron : supprimé par removeTempDir (temp-dir.ts), qui attend
// que Windows relâche les fichiers de Chromium au lieu de faire échouer un essai réussi (21/11/2026 :
// EBUSY et EPERM sous charge dans focus-hors-ecran, assistant-clavier-souris, offscreen, clavier-reel…).

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { electronMarkers } from './electron-run';
import { REPO_ROOT } from './i18n-scan';
import { removeTempDir } from './temp-dir';

const busy = (code: string) => Object.assign(new Error(`${code}: resource busy or locked`), { code });

test('removeTempDir : réessaie tant que le fichier est tenu, puis supprime', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-suppression-'));
  let calls = 0;
  const done = removeTempDir(dir, {
    rm: (d) => {
      calls++;
      if (calls < 3) throw busy(calls === 1 ? 'EBUSY' : 'EPERM');
      fs.rmSync(d, { recursive: true, force: true });
    },
  });
  assert.equal(done, true);
  assert.equal(calls, 3);
  assert.equal(fs.existsSync(dir), false);
});

test('removeTempDir : toujours tenu après le délai, le dossier est laissé et dit, sans faire échouer l’essai', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-suppression-'));
  const said: string[] = [];
  try {
    const started = Date.now();
    const done = removeTempDir(dir, { waitMs: 400, rm: () => { throw busy('EBUSY'); }, warn: (m) => said.push(m) });
    assert.equal(done, false);
    assert.ok(Date.now() - started < 5000);
    assert.equal(said.length, 1);
    assert.match(said[0]!, /EBUSY/);
    assert.ok(said[0]!.includes(dir));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('removeTempDir : une autre erreur remonte, et un dossier hors du dossier temporaire est refusé', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-suppression-'));
  try {
    assert.throws(() => removeTempDir(dir, { rm: () => { throw busy('ENOSPC'); } }), /ENOSPC/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  assert.throws(() => removeTempDir(os.tmpdir()), /pas un dossier d’essai/);
  assert.throws(() => removeTempDir(REPO_ROOT), /pas un dossier d’essai/);
});

test('processus d’un lancement d’Electron : son --user-data-dir et le profil que l’application se donne dans le bac à sable', () => {
  const tmp = path.join(os.tmpdir(), 'cp-essai-xyz');
  const args = ['app', '--assistant', `--user-data-dir=${path.join(tmp, 'chromium')}`];
  assert.deepEqual(electronMarkers(args, { CYBERPINBALL_HOME: path.join(tmp, 'home') }), [path.join(tmp, 'chromium'), path.join(tmp, 'home', 'electron')]);
  // Un CYBERPINBALL_HOME hérité du poste, hors du dossier temporaire : jamais attendu ni tué.
  assert.deepEqual(electronMarkers(args, { CYBERPINBALL_HOME: 'D:\\Borne\\data' }), [path.join(tmp, 'chromium')]);
  assert.deepEqual(electronMarkers(args, {}), [path.join(tmp, 'chromium')]);
  // Le profil du bac à sable, tel que l'application le choisit.
  assert.match(fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'sandbox-profile.ts'), 'utf8'), /app\.setPath\('userData', path\.join\(process\.env\.CYBERPINBALL_HOME, 'electron'\)\)/);
});

test('tests qui lancent Electron : leur dossier d’essai se supprime par removeTempDir, jamais par fs.rmSync', () => {
  const dir = path.join(REPO_ROOT, 'packages', 'core', 'src', 'test');
  const fautifs: string[] = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.ts') || ['electron-run.ts', 'temp-dir.ts', 'temp-dir.test.ts'].includes(f)) continue;
    const text = fs.readFileSync(path.join(dir, f), 'utf8');
    if (!/\brunElectron\(|\brunWizard\(/.test(text)) continue;
    for (const m of text.matchAll(/fs\.rmSync\([^)]*recursive/g)) fautifs.push(`${f} : ${m[0]}`);
  }
  assert.deepEqual(fautifs, []);
});
