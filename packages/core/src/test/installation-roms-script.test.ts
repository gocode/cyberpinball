// La ROM d'une table se lit dans le script que VPX joue vraiment : le .vbs nommé comme la table, posé
// à côté d'elle, passe avant celui écrit dans le .vpx. Une installation PinUP en pose souvent (script
// corrigé, ROM changée) ; lire le .vpx seul cherchait une ROM que la table ne charge pas (17/11/2026).
// Et LoadVPMALT, variante de LoadVPM, charge une ROM comme lui.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { scriptFacts, type ScriptFacts } from '../doctor';
import { REPO_ROOT } from './i18n-scan';

const { withPlayedScript, readScript, forgetScriptCache } = require(path.join(REPO_ROOT, 'app', 'dist', 'vbs.js')) as {
  withPlayedScript: (table: string, facts: ScriptFacts) => ScriptFacts;
  readScript: (exe: string | undefined, table: string, dataDir: string) => Promise<ScriptFacts | { error: string }>;
  forgetScriptCache: () => void;
};

const SCRIPT = (rom: string) => `Option Explicit\r\nConst cGameName = "${rom}"\r\nLoadVPM "01560000", "WPC.VBS", 3.26\r\nSub Table1_Init\r\n  With Controller\r\n    .GameName = cGameName\r\n  End With\r\nEnd Sub\r\n`;

test('script joué : le .vbs posé à côté de la table dit sa ROM, pas le script du .vpx', () => {
  forgetScriptCache();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-vbs-'));
  const vpx = path.join(dir, 'Medieval Madness (Williams 1997).vpx');
  fs.writeFileSync(vpx, 'x');
  const embedded = scriptFacts(SCRIPT('mm_109'));
  assert.deepEqual(withPlayedScript(vpx, embedded), embedded, 'sans .vbs : le .vpx');
  fs.writeFileSync(path.join(dir, 'Medieval Madness (Williams 1997).vbs'), SCRIPT('mm_109c'), 'latin1');
  const played = withPlayedScript(vpx, embedded);
  assert.deepEqual(played.roms, ['mm_109c']);
  assert.equal(played.usesPinmame, true);
  // Nom de ROM calculé dans le .vbs : celui, clair, du .vpx.
  fs.writeFileSync(path.join(dir, 'Medieval Madness (Williams 1997).vbs'), 'LoadVPM "01560000", "WPC.VBS", 3.26\r\nController.GameName = Choix()\r\n', 'latin1');
  assert.deepEqual(withPlayedScript(vpx, embedded).roms, ['mm_109']);
  // Une table originale dont le .vbs ne charge plus de ROM : aucune.
  fs.writeFileSync(path.join(dir, 'Medieval Madness (Williams 1997).vbs'), 'Sub Table1_Init\r\nEnd Sub\r\n', 'latin1');
  assert.deepEqual(withPlayedScript(vpx, embedded).roms, []);
});

test('script joué : sans VPX installé, le script se lit quand même (le .vbs voisin d’un .vpx illisible compris)', async () => {
  forgetScriptCache();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-vbs-'));
  const vpx = path.join(dir, 'Attack from Mars (Bally 1995).vpx');
  fs.writeFileSync(vpx, 'pas un vrai fichier de VPX');
  const data = path.join(dir, 'data');
  assert.ok('error' in (await readScript(undefined, vpx, data)), 'rien à lire');
  fs.writeFileSync(path.join(dir, 'Attack from Mars (Bally 1995).vbs'), SCRIPT('afm_113b'), 'latin1');
  const facts = await readScript(undefined, vpx, data);
  assert.ok(!('error' in facts));
  assert.deepEqual((facts as ScriptFacts).roms, ['afm_113b']);
});

test('LoadVPMALT charge une ROM comme LoadVPM', () => {
  const facts = scriptFacts('Const cGameName = "jp_l3"\r\nLoadVPMALT "01560000", "S11.VBS", 3.26\r\nController.GameName = cGameName\r\n');
  assert.equal(facts.usesPinmame, true);
  assert.deepEqual(facts.roms, ['jp_l3']);
});
