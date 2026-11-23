import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { toPhysicalScreen } from '../fingerprint';
import { parseSimulatedDisplays } from '../offscreen';
import { loadCabinet, saveCabinet } from '../store';
import { emptyCabinet } from './fixtures';
import { keyboard, runWizard, skip } from './clavier-reel-outils';
import { REPO_ROOT } from './i18n-scan';
import { removeTempDir } from './temp-dir';

test('assistant sur un seul écran : sans backglass, le DMD incrusté est proposé puis enregistré', { skip, timeout: 290_000 }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-un-ecran-'));
  try {
    const home = path.join(dir, 'home');
    const screens = path.join(REPO_ROOT, 'packages', 'core', 'ecrans-simules', 'un-ecran.json');
    const displays = parseSimulatedDisplays(JSON.parse(fs.readFileSync(screens, 'utf8')), screens);
    const cabinet = emptyCabinet();
    cabinet.screens = displays.map(toPhysicalScreen);
    cabinet.roles = { playfield: cabinet.screens[0]!.fingerprint };
    cabinet.playfield = { flipperEdge: 'bottom' };
    cabinet.vpx = { iniPath: path.join(dir, 'sandbox', 'VPinballX.ini') };
    fs.mkdirSync(path.join(dir, 'sandbox'), { recursive: true });
    saveCabinet(home, cabinet);
    const output = runWizard(home, keyboard('Enter', 'Enter', 'Enter'), ['--ecrans'], { CYBERPINBALL_DISPLAYS: screens });
    assert.match(output, /Autopilote : Clavier:Enter → assign/);
    assert.match(output, /Autopilote : Clavier:Enter → done/);
    const saved = loadCabinet(home)!;
    assert.equal(saved.roles.dmd, saved.roles.playfield);
    assert.ok(saved.zones?.dmd, output);
    assert.equal(saved.roles.backglass, undefined);
    assert.equal(saved.roles.topper, undefined);
  } finally {
    removeTempDir(dir);
  }
});
