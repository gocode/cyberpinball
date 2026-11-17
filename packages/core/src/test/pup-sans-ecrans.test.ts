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
