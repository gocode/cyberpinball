// PuP-Pack sans screens.pup (defaultScreensPup, puppack.ts) : PinUP Player prenait ses écrans par
// défaut, le plugin PUP de VPX 10.8.1 n'en crée aucun et tout le pack reste éteint. Relevé le
// 17/11/2026 sur quatre tables reprises de PinUP Popper (24, Black Knight, Daredevil, World Cup
// Soccer). Invariant : un pack dont les playlists ou les déclencheurs visent des écrans reçoit un
// screens.pup qui déclare chacun d'eux visible, lu par le plugin comme ses propres écrans par défaut.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { defaultScreensPup, parseCsvLine, parseScreens, pupWindows } from '../puppack';

function pack(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-pup-ecrans-'));
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(root, name), content);
  return root;
}

const PLAYLISTS = 'ScreenNum,Folder,Des,AlphaSort,RestSeconds,Volume,Priority\r\n2,Backglass,,0,0,100,1\r\n5,"FullDMD",,0,0,100,1\r\n';
const TRIGGERS = 'ID,Active,Descript,Trigger,ScreenNum,PlayList,PlayFile,Volume,Priority,Length,Counter,RestSeconds,Loop,Defaults\r\n1,1,Attract,D1,0,Topper,a.mp4,100,1,0,0,0,1,\r\n2,1,Musique,W5,4,Music,m.mp3,100,1,0,0,0,0,\r\n';

test('pack sans screens.pup : chaque écran visé est déclaré visible, comme le plugin le ferait', () => {
  const root = pack({ 'playlists.pup': PLAYLISTS, 'triggers.pup': TRIGGERS });
  const text = defaultScreensPup(root)!;
  const screens = parseScreens(text);
  assert.deepEqual(
    screens.map((s) => [s.num, s.description, s.mode]),
    [
      [0, 'Topper', 'Show'],
      [2, 'Backglass', 'Show'],
      [4, 'Music', 'Show'],
      [5, 'FullDMD', 'Show'],
    ],
  );
  // Huit colonnes par ligne (PUPScreen::CreateFromCSV refuse les autres), volume laissé au défaut (colonne vide).
  for (const line of text.split('\r\n').slice(1).filter(Boolean)) {
    const parts = parseCsvLine(line);
    assert.equal(parts.length, 8, line);
    assert.equal(parts[6], '', line);
  }
  assert.deepEqual(pupWindows(screens), { topper: true, backglass: true, dmd: true });
  fs.rmSync(root, { recursive: true });
});

test('pack qui a son screens.pup, ou qui ne vise aucun écran : rien à écrire', () => {
  const complete = pack({ 'screens.pup': 'ScreenNum,ScreenDes\r\n2,Backglass,,,0,Show,,\r\n', 'playlists.pup': PLAYLISTS });
  assert.equal(defaultScreensPup(complete), undefined);
  // Pack piloté par le script (PuPlayer.Init crée ses écrans) : ni playlists.pup ni triggers.pup.
  const scripted = pack({ 'readme.txt': 'pack' });
  assert.equal(defaultScreensPup(scripted), undefined);
  for (const dir of [complete, scripted]) fs.rmSync(dir, { recursive: true });
});

test('pack à options dont l’option en place n’a pas de screens.pup : écrans déclarés avant la partie, une seule fois (Hellboy, 18/11/2026)', () => {
  const { diagnose, repairPupForPlay, scriptFacts } = require('../doctor') as typeof import('../doctor');
  const { scanTables } = require('../tables') as typeof import('../tables');
  const { vpxWithScript } = require('./fixtures') as typeof import('./fixtures');
  const tablesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-pup-options-'));
  const folder = path.join(tablesDir, 'Hellboy (Original 2021)');
  const script = 'Set PuPlayer = CreateObject("PinUpPlayer.PinDisplay")\r\nPuPlayer.B2SInit "", "HELLBOY"\r\n';
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, 'Hellboy (Original 2021).vpx'), vpxWithScript(script));
  const root = path.join(folder, 'pupvideos', 'HELLBOY');
  // Deux options faites seulement de déclencheurs et de playlists, sans screens.pup ; la première est en place.
  for (const option of ['Option 1', 'Option 2']) {
    fs.mkdirSync(path.join(root, 'PuP-Pack_Options', option), { recursive: true });
    fs.writeFileSync(path.join(root, 'PuP-Pack_Options', option, 'playlists.pup'), PLAYLISTS);
    fs.writeFileSync(path.join(root, 'PuP-Pack_Options', option, 'triggers.pup'), option === 'Option 1' ? TRIGGERS : TRIGGERS.replace('a.mp4', 'b.mp4'));
    fs.writeFileSync(path.join(root, `${option}.bat`), `copy /y "PuP-Pack_Options\\${option}\\*.pup" .\r\n`);
  }
  fs.writeFileSync(path.join(root, 'playlists.pup'), PLAYLISTS);
  fs.writeFileSync(path.join(root, 'triggers.pup'), TRIGGERS);
  for (const name of ['Backglass', 'FullDMD', 'Topper', 'Music']) fs.mkdirSync(path.join(root, name));
  const ctx = { tablesDir, script: scriptFacts(script) };
  const codes = () => diagnose(scanTables(tablesDir)[0]!, ctx).map((f) => f.code);
  assert.ok(codes().includes('pupNoScreens'), codes().join(', '));
  const trashDir = `${tablesDir}-corbeille`;
  const first = repairPupForPlay(scanTables(tablesDir)[0]!, ctx, { trashDir });
  assert.ok(first.some((f) => f.code === 'pupNoScreens'));
  assert.ok(fs.existsSync(path.join(root, 'screens.pup')));
  // Partie suivante : rien à refaire, et l'option n'est pas réappliquée par-dessus (pas de va-et-vient).
  assert.deepEqual(repairPupForPlay(scanTables(tablesDir)[0]!, ctx, { trashDir }).map((f) => f.code), []);
  assert.ok(fs.existsSync(path.join(root, 'screens.pup')));
  assert.ok(!codes().includes('pupNoScreens'));
  fs.rmSync(tablesDir, { recursive: true, force: true });
  fs.rmSync(trashDir, { recursive: true, force: true });
});
