/** Le vrai menu Electron dans un bac à sable sans moteurs, ROM, plugins ni sorties matérielles. */
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { cabinetIn, electron, GAME_BY_KEYBOARD, SCREENS } from './clavier-reel-outils';
import { runElectron } from './electron-run';
import { REPO_ROOT } from './i18n-scan';
import { removeTempDir } from './temp-dir';
import { saveGuestMode } from '../guestmode';

for (const admitted of [false, true]) test(`menu natif isolé : deux flips, ${admitted ? 'lanceur FP simulé et retour' : 'table exclue et message'}`, { timeout: 90_000 }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-surprise-menu-'));
  try {
    const home = path.join(dir, 'home'), root = path.join(dir, 'root');
    cabinetIn(home, GAME_BY_KEYBOARD);
    saveGuestMode(home, true, 'all');
    fs.mkdirSync(path.join(root, 'tables', 'Ocean'), { recursive: true });
    fs.writeFileSync(path.join(root, 'tables', 'Ocean', 'Ocean.fpt'), 'fictional, never launched');
    const fp = path.join(dir, 'fake-fp');
    fs.mkdirSync(fp);
    fs.writeFileSync(path.join(fp, 'Future Pinball.exe'), 'not a Windows executable');
    // Par défaut, toute table jouable entre dans le tirage ; la seule de la collection, exclue, n'en laisse aucune.
    const exclusions = JSON.stringify({ tables: admitted ? [] : ['Ocean/Ocean.fpt'], collections: [] });
    fs.writeFileSync(path.join(home, 'table-surprise.json'), exclusions);
    const audio = path.join(dir, 'audio.json'); fs.writeFileSync(audio, '[]');
    const capture = path.join(dir, 'captures');
    const env: NodeJS.ProcessEnv = { ...process.env, CYBERPINBALL_HOME: home, CYBERPINBALL_ROOT: root, CYBERPINBALL_DISPLAYS: SCREENS, CYBERPINBALL_AUDIO_OUTPUTS: audio, CYBERPINBALL_LANGUE: 'fr', CYBERPINBALL_RESEAU: 'off', CYBERPINBALL_HORS_ECRAN: '1', CYBERPINBALL_PARTIE_SIMULEE: '', CYBERPINBALL_PARTIE_MS: '5000', CYBERPINBALL_LOADING_MS: '1', CYBERPINBALL_FUTURE_PINBALL_SIMULE: fp, CYBERPINBALL_CAPTURE: capture, CYBERPINBALL_AUTOPILOT: `KeyQ,hold:KeyA,hold:KeyS,wait:1700,release:KeyA,release:KeyS,${admitted ? 'until:playing,until:menu' : 'KeyQ'}` };
    delete env.ELECTRON_RUN_AS_NODE; delete env.CYBERPINBALL_A_L_ECRAN;
    const run = runElectron(electron!, ['app', `--user-data-dir=${path.join(dir, 'chromium')}`], { dir, env, cwd: REPO_ROOT, timeout: 80_000 });
    const output = run.stdout + run.stderr;
    assert.equal(run.status, 0, output);
    assert.doesNotMatch(output, /buttonsSummary|jamais atteinte|ReferenceError|TypeError|écriture refusée hors du bac|Partie \(/, output);
    const states = fs.readFileSync(path.join(capture, 'son.txt'), 'utf8').trim().split('\n').map((line) => ({ name: line.slice(0, line.indexOf(' : ')), view: JSON.parse(line.slice(line.indexOf(' : ') + 3)) }));
    const phase = (name: string) => states.find((s) => s.name === name)?.view.ecrans.playfield.phase;
    assert.equal(phase('01-KeyQ'), 'menu', 'the native wheel is reached before the gesture');
    if (!admitted) {
      assert.equal(phase('04-wait_1700'), 'message', 'the only table is excluded: native message');
      assert.equal(phase('07-KeyQ'), 'menu', 'Exit returns to the native wheel');
      assert.equal(fs.readFileSync(path.join(home, 'table-surprise.json'), 'utf8'), exclusions, 'the gesture never changes the exclusions');
    } else {
      assert.equal(phase('04-wait_1700'), 'menu', 'the overlay retains the native menu phase');
      assert.equal(phase('07-until_playing'), 'playing', 'the existing launcher reaches simulated play');
      assert.equal(phase('08-until_menu'), 'menu', 'the existing launcher returns to the wheel');
    }
  } finally { removeTempDir(dir); }
});
