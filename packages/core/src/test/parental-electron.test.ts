import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { ParentalControl, loadCabinet, saveCabinet, saveCollections, saveGuestMode } from '..';
import { cabinetIn, electron, GAME_BY_KEYBOARD, SCREENS } from './clavier-reel-outils';
import { REPO_ROOT } from './i18n-scan';
import { runElectron } from './electron-run';
import { removeTempDir } from './temp-dir';

type Trace = { phase: string; verrouParental?: boolean; table?: string; medias?: unknown };

test('contrôle parental : parcours Electron avec les flippers, annulation, mauvais PIN, partie et retour', { skip: !electron, timeout: 100_000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-parental-electron-'));
  try {
    const home = path.join(dir, 'home');
    const root = path.join(dir, 'root');
    const folder = path.join(root, 'tables', 'Ocean');
    const protectedId = 'mine:private';
    const tableId = 'Ocean/Ocean.fpt';
    cabinetIn(home, GAME_BY_KEYBOARD);
    const cabinet = loadCabinet(home)!;
    cabinet.roles.backglass = cabinet.screens[0]!.fingerprint;
    cabinet.roles.dmd = cabinet.screens[1]!.fingerprint;
    saveCabinet(home, cabinet);
    saveGuestMode(home, false);
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, 'Ocean.fpt'), 'neutral fixture, simulated game');
    const media = path.join(folder, 'medias');
    fs.mkdirSync(media);
    for (const type of ['Playfield', 'Backglass', 'FullDMD', 'Wheel']) {
      fs.writeFileSync(path.join(media, '(' + type + ') Ocean.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+XegAAAABJRU5ErkJggg==', 'base64'));
    }
    saveCollections(home, { active: 'all', mine: [{ id: protectedId, name: 'Private demo', tables: [tableId] }] });
    const policy = new ParentalControl({ dataDir: home, groups: () => [] });
    assert.equal(await policy.setPin('0001', '0001'), 'ok');
    assert.equal(policy.configure({ ...policy.settings, enabled: true, collections: [protectedId] }), true);
    const fp = path.join(dir, 'fp'), audio = path.join(dir, 'audio.json'), capture = path.join(dir, 'capture');
    fs.mkdirSync(fp);
    fs.writeFileSync(path.join(fp, 'Future Pinball.exe'), '');
    fs.writeFileSync(audio, '[]');
    const env: NodeJS.ProcessEnv = {
      ...process.env, CYBERPINBALL_HOME: home, CYBERPINBALL_ROOT: root,
      CYBERPINBALL_DISPLAYS: SCREENS, CYBERPINBALL_AUDIO_OUTPUTS: audio,
      CYBERPINBALL_LANGUE: 'fr', CYBERPINBALL_RESEAU: 'off', CYBERPINBALL_HORS_LIGNE: '1', CYBERPINBALL_HORS_ECRAN: '1',
      CYBERPINBALL_PARTIE_SIMULEE: '', CYBERPINBALL_PARTIE_MS: '4000', CYBERPINBALL_LOADING_MS: '1',
      CYBERPINBALL_FUTURE_PINBALL_SIMULE: fp, CYBERPINBALL_CAPTURE: capture, CYBERPINBALL_MOMENT_DEPART: '0',
      CYBERPINBALL_AUTOPILOT: [
        'KeyQ', 'Digit2', 'Digit2', 'KeyQ', 'Digit2',
        'Digit2', 'Digit2', 'Digit2', 'Digit2', 'wait:500',
        'Digit2', 'Digit2', 'Digit2', 'KeyS', 'Digit2', 'wait:500',
        'action:Jouer', 'until:playing', 'until:menu',
      ].join(','),
    };
    delete env.ELECTRON_RUN_AS_NODE;
    delete env.CYBERPINBALL_A_L_ECRAN;
    const entry = path.join(dir, 'entry.cjs');
    const nativeDependency = require.resolve('koffi', { paths: [REPO_ROOT] });
    fs.writeFileSync(entry, [
      'const { createRequire, registerHooks } = require("node:module");',
      'const dependencies = createRequire(' + JSON.stringify(nativeDependency) + ');',
      'let resolving = false;',
      'registerHooks({ resolve(id, context, next) {',
      '  try { return next(id, context); } catch (error) {',
      '    if (resolving || !/^[a-z@]/i.test(id) || error.code !== "MODULE_NOT_FOUND") throw error;',
      '    resolving = true;',
      '    try { return next(dependencies.resolve(id), context); } finally { resolving = false; }',
      '  }',
      '} });',
      'require("electron").app.setAppPath(' + JSON.stringify(path.join(REPO_ROOT, 'app')) + ');',
      'require(' + JSON.stringify(path.join(REPO_ROOT, 'app/dist/main.js')) + ');',
    ].join('\n'));
    const run = runElectron(electron!, [entry, '--user-data-dir=' + path.join(dir, 'chromium')], { dir, env, cwd: REPO_ROOT, timeout: 80_000 });
    const output = run.stdout + run.stderr;
    assert.equal(run.status, 0, output);
    assert.doesNotMatch(output, /ReferenceError|TypeError|jamais atteinte|aucune action « Jouer »/i, output);
    const views = fs.readFileSync(path.join(capture, 'son.txt'), 'utf8').trim().split('\n').map((line) => {
      const at = line.indexOf(' : ');
      return JSON.parse(line.slice(at + 3)).ecrans as Record<string, Trace>;
    });
    const before = views[3]!.playfield!;
    assert.equal(before.verrouParental, true);
    assert.equal(views[4]!.playfield!.verrouParental, false, 'Exit annule');
    assert.equal(views[10]!.playfield!.verrouParental, true, 'après mauvais code');
    assert.equal(views[16]!.playfield!.phase, 'library', 'fiche après bon code');
    assert.equal(views[18]!.playfield!.phase, 'playing');
    assert.equal(views[19]!.playfield!.phase, 'menu');
    for (const role of ['playfield', 'backglass', 'dmd']) {
      assert.ok(views[3]![role], role);
      assert.doesNotMatch(JSON.stringify(views[3]![role]), /Ocean/);
    }
    assert.match(JSON.stringify(views[16]), /Ocean\.png/, 'le jeu autorisé retrouve ses médias');
  } finally { removeTempDir(dir); }
});
