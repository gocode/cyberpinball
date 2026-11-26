import assert from 'node:assert/strict';
import { runElectron } from './electron-run';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { removeTempDir } from './temp-dir';

// Essai réel du mode hors écran (Electron, ~100 s) : seul de son fichier. Les gardes de offscreen.test.ts, qui relisent
// les sources de tout le dépôt, restent ainsi rapides à passer à chaque vérification de branche (26/11/2026).
const REPO = path.join(__dirname, '..', '..', '..', '..');
const SCREENS = path.join(REPO, 'packages', 'core', 'ecrans-simules');

// Essai réel : l'assistant sur la borne simulée, quatre fenêtres rendues hors écran.
// Le guet de offscreen.ts relève toute fenêtre visible ou au premier plan (isVisible,
// isFocused, fenêtres natives du processus) dans hors-ecran.txt.
test('démo hors écran : aucune fenêtre visible ni au premier plan, captures à la taille des écrans simulés', { timeout: 120_000 }, (t) => {
  const electron = electronPath();
  if (process.platform !== 'win32' || !electron) return t.skip('Electron sous Windows requis');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-hors-ecran-'));
  try {
    const captures = path.join(dir, 'captures');
    const audio = path.join(dir, 'sans-son.json');
    fs.writeFileSync(audio, '[]');
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      CYBERPINBALL_HOME: path.join(dir, 'home'),
      CYBERPINBALL_ROOT: path.join(dir, 'root'),
      CYBERPINBALL_DISPLAYS: path.join(SCREENS, 'borne.json'),
      CYBERPINBALL_AUDIO_OUTPUTS: audio,
      // Délai des boutons passé, puis le playfield choisi.
      CYBERPINBALL_AUTOPILOT: 'SansBoutons,Digit1',
      CYBERPINBALL_CAPTURE: captures,
    };
    delete env.CYBERPINBALL_A_L_ECRAN;
    delete env.CYBERPINBALL_HORS_ECRAN;
    // Lancé sur le bureau de l'utilisateur, l'essai doit se relancer de lui-même sur le bureau
    // Windows caché : même si le mode hors écran cassait, rien n'apparaîtrait sur les écrans du
    // poste (le guet, lui, le signalerait).
    const run = runElectron(electron, ['app', '--assistant', `--user-data-dir=${path.join(dir, 'chromium')}`], { dir, cwd: REPO, env, timeout: 100_000 });
    const output = `${run.stdout}\n${run.stderr}`;
    assert.equal(run.status, 0, output);
    assert.match(output, /relancé sur le bureau Windows caché « CyberPinballEssais »/);
    assert.match(output, /Hors écran : Aucune fenêtre visible/, 'la sortie du bureau caché revient ici');
    const watch = fs.readFileSync(path.join(captures, 'hors-ecran.txt'), 'utf8');
    assert.match(watch, /^Aucune fenêtre visible ni au premier plan \(4 fenêtres/, watch);
    const sizes = fs
      .readdirSync(captures)
      .filter((f) => f.startsWith('00-start-'))
      .sort()
      .map((f) => pngSize(path.join(captures, f)));
    assert.deepEqual(sizes, ['3840×2160', '1920×1080', '1920×480', '1920×540']);
    assert.equal(fs.readdirSync(captures).filter((f) => f.endsWith('.png')).length, 3 * 4);
  } finally {
    removeTempDir(dir);
  }
});

function electronPath(): string | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require(require.resolve('electron', { paths: [REPO] })) as string;
  } catch {
    return undefined;
  }
}

function pngSize(file: string): string {
  const b = fs.readFileSync(file);
  return `${b.readUInt32BE(16)}×${b.readUInt32BE(20)}`;
}
