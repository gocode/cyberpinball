// JP's Space Cadet, 17/11/2026 : la recherche ne proposait jamais la Galaxy Edition, et le PuP-Pack
// de la Galaxy Edition, installé sur la v7.0 de JPSalas, laissait le fronton noir. Le pack n'affiche
// rien que sur des déclencheurs « E » (E7 : fond du fronton) que seul le script de la Galaxy Edition
// envoie ; le script de la v7.0 n'envoie que ses effets DOF (E101 à E143, par B2S Server). Ces tests
// fixent les invariants : l'édition d'une version VPS se voit et se cherche, et un pack que le script
// de la table ne peut pas faire jouer est signalé comme fait pour une autre version.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { versionForText, versionLabel } from '../acquisition';
import { diagnose, scriptFacts } from '../doctor';
import { packDrivers, scriptB2sEvents } from '../puppack';
import { scanTables } from '../tables';
import { scriptCode } from '../vbscript';
import { createVpsDb, matchVps, searchVps, type VpsGame } from '../vps';
import { vpxWithScript } from './fixtures';

/** Le jeu de VPS, réduit à trois de ses versions (fiche du 17/11/2026). */
const SPACE_CADET: VpsGame = {
  id: 'fFQCNbNK',
  name: "JP's Space Cadet",
  manufacturer: 'Original',
  year: 2021,
  type: 'SS',
  tableFiles: [
    { id: 'sLvaS6Io', version: '7.0', authors: ['JPSalas', 'Mesterial', 'BadGuysGetDead'], features: ['FlexDMD', 'LUT'], tableFormat: 'VPX', updatedAt: 1794897790644, urls: [{ url: 'https://www.vpforums.org/index.php?app=downloads&showfile=16091' }] },
    {
      id: 'aHb-SNzjDs',
      version: '1.2',
      edition: 'Galaxy Edition',
      comment: 'This table uses PuPDMD. Pup Pack installation is REQUIRED.',
      authors: ['Funkatron101', 'JPSalas', 'Mesterial', 'BadGuysGetDead', 'Ext2k', 'Panasony'],
      features: ['Hybrid', 'VR', 'MOD', 'nFozzy', 'Fleep', 'incl. PuP'],
      tableFormat: 'VPX',
      updatedAt: 1751639193149,
      urls: [{ url: 'https://vpuniverse.com/files/file/24068-jps-space-cadet-galaxy-edition/' }],
    },
    { id: '0_w71Vkguo', version: '1.0.0', authors: ['LoadedWeapon', 'JPSalas'], features: ['MOD', 'nFozzy', 'Fleep'], tableFormat: 'VPX', updatedAt: 1751328000000, urls: [{ url: 'https://vpuniverse.com/files/file/23856-space-cadet-cabinet-nfozzy/' }] },
  ],
} as VpsGame;

test('version VPS : son édition passe devant ses auteurs', () => {
  assert.equal(versionLabel(SPACE_CADET.tableFiles![1]!), 'Galaxy Edition · Funkatron101, JPSalas, Mesterial… 1.2');
  assert.equal(versionLabel(SPACE_CADET.tableFiles![0]!), 'JPSalas, Mesterial, BadGuysGetDead 7.0');
});

test('recherche : « Space Cadet Galaxy Edition » trouve le jeu et désigne sa Galaxy Edition', () => {
  const db = createVpsDb([SPACE_CADET, { id: 'other', name: 'Space Station', manufacturer: 'Williams', year: 1987, tableFiles: [{ id: 'x', tableFormat: 'VPX' }] } as VpsGame]);
  for (const text of ['Space Cadet Galaxy Edition', "JP's Space Cadet Galaxy Edition", 'space cadet galaxy']) {
    assert.equal(searchVps(db, text)[0]?.game.id, 'fFQCNbNK', text);
    assert.equal(versionForText(SPACE_CADET, text)?.id, 'aHb-SNzjDs', text);
  }
  // Le titre seul ne désigne aucune édition : la version conseillée reste en tête.
  assert.equal(versionForText(SPACE_CADET, 'Space Cadet'), undefined);
  // Un fichier qui cite l'édition est reconnu comme cette version.
  const found = matchVps(db, { names: ["JP's Space Cadet Galaxy Edition 1.2"] }).candidates[0];
  assert.equal(found?.table?.id, 'aHb-SNzjDs');
});

test('événements E du script : DOF, SoundFXDOF et B2SSetData en toutes lettres, relais de Sub DOF ignoré', () => {
  const code = scriptCode(
    [
      'Sub DOF(DOFevent, State)',
      '  If B2SOn Then Controller.B2SSetData DOFevent, State',
      'End Sub',
      'Sub Kicker1_Hit : DOF 125, DOFOn : End Sub',
      'Sub Trigger1_Hit : PlaySound SoundFXDOF("fx_kicker", 122, DOFPulse, DOFKnocker) : End Sub',
      'Sub Light1 : Controller.B2SSetData 7, 1 : End Sub',
      "' DOF 999, DOFOn",
      '',
    ].join('\r\n'),
  );
  assert.deepEqual(scriptB2sEvents(code), [7, 122, 125]);
  // Un numéro calculé : on ne sait pas ce que le script envoie.
  assert.equal(scriptB2sEvents(scriptCode('For i = 1 To 3 : DOF 100 + i, DOFOn : Next\r\n')), undefined);
  assert.deepEqual(scriptB2sEvents(scriptCode('Sub Table1_Init : End Sub\r\n')), []);
});

const TABLE = 'Space Cadet (Cinematronics 1995) [jpsalas 2026 - v7]';
const V7 = 'Const cGameName = "jpspacecadet"\r\nSub Table1_Init\r\n  Set FlexDMD = CreateObject("FlexDMD.FlexDMD")\r\nEnd Sub\r\nSub Kicker1_Hit\r\n  DOF 125, DOFOn\r\n  DOF 143, DOFPulse\r\nEnd Sub\r\n';
const HEADER = 'ScreenNum,ScreenDes,PlayList,PlayFile,Loopit,Active,Priority,CustomPos';
const TRIGGERS = 'ID,Active,Descript,Trigger,ScreenNum,PlayList,PlayFile,Volume,Priority,Length,Counter,RestSeconds,Loop,Defaults\r\n357,1,"Start Backglass",E7,2,PuPOverlays,SCBackGlass-3scrn.png,,20,,,,normal,0\r\n1,1,Opener,E500,12,DMDSplash,@jp_present.mp4,,10,,,,normal,0\r\n';

function table(screens: string, triggers = TRIGGERS, script = V7): { tablesDir: string; pack: string } {
  const tablesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-notdriven-'));
  const folder = path.join(tablesDir, "JP's Space Cadet (Original 2021)");
  const pack = path.join(folder, 'pupvideos', 'jpspacecadet');
  fs.mkdirSync(path.join(pack, 'PuPOverlays'), { recursive: true });
  fs.mkdirSync(path.join(pack, 'BGDefault'));
  fs.writeFileSync(path.join(folder, `${TABLE}.vpx`), vpxWithScript(script));
  fs.writeFileSync(path.join(pack, 'screens.pup'), screens);
  fs.writeFileSync(path.join(pack, 'triggers.pup'), triggers);
  fs.writeFileSync(path.join(pack, 'PuPOverlays', 'SCBackGlass-3scrn.png'), 'png');
  return { tablesDir, pack };
}

const codes = (tablesDir: string, script = V7) => diagnose(scanTables(tablesDir)[0]!, { tablesDir, script: scriptFacts(script) }).map((f) => f.code);

test('pack d’une autre version : signalé quand le script n’envoie aucun de ses déclencheurs E', () => {
  const { tablesDir, pack } = table(`${HEADER}\r\n2,Backglass,BGDefault,,0,ForceBack,,\r\n5,FullDMD,,,0,ForceBack,,\r\n`);
  try {
    assert.deepEqual(packDrivers(pack), { events: [7, 500], capture: 0, defaults: 0 });
    const found = diagnose(scanTables(tablesDir)[0]!, { tablesDir, script: scriptFacts(V7) }).find((f) => f.code === 'pupNotDriven');
    assert.ok(found, 'constat attendu');
    assert.equal(found.fix, undefined, 'aucune correction : c’est le pack d’une autre version');
    assert.match(found.detail, /E7 à E500/);
    assert.match(found.detail, /E125 à E143/);
  } finally {
    fs.rmSync(tablesDir, { recursive: true, force: true });
  }
});

test('pack que la table fait jouer : jamais signalé', () => {
  // Le script envoie E7.
  let t = table(`${HEADER}\r\n2,Backglass,,,0,ForceBack,,\r\n`);
  const sends7 = `${V7}Sub Light1 : DOF 7, DOFOn : End Sub\r\n`;
  try {
    assert.ok(!codes(t.tablesDir, sends7).includes('pupNotDriven'));
  } finally {
    fs.rmSync(t.tablesDir, { recursive: true, force: true });
  }
  // Le fronton montre sa playlist par défaut sans déclencheur.
  t = table(`${HEADER}\r\n2,Backglass,BGDefault,,0,ForceBack,,\r\n`);
  try {
    fs.writeFileSync(path.join(t.pack, 'BGDefault', 'fond.mp4'), 'mp4');
    assert.equal(packDrivers(t.pack).defaults, 1);
    assert.ok(!codes(t.tablesDir).includes('pupNotDriven'));
  } finally {
    fs.rmSync(t.tablesDir, { recursive: true, force: true });
  }
  // Numéros calculés : on ne conclut pas.
  t = table(`${HEADER}\r\n2,Backglass,,,0,ForceBack,,\r\n`);
  const computed = `${V7}Sub Light2 : DOF 100 + Mode, DOFOn : End Sub\r\n`;
  try {
    assert.ok(!codes(t.tablesDir, computed).includes('pupNotDriven'));
  } finally {
    fs.rmSync(t.tablesDir, { recursive: true, force: true });
  }
  // Script qui pilote PuP lui-même : ce n'est pas un pack lancé par Cyber Pinball.
  t = table(`${HEADER}\r\n2,Backglass,,,0,ForceBack,,\r\n`);
  const own = `${V7}Sub PuPInit : Set PuPlayer = CreateObject("PinUpPlayer.PinDisplay") : PuPlayer.B2SInit "", "jpspacecadet" : End Sub\r\n`;
  try {
    assert.ok(!codes(t.tablesDir, own).includes('pupNotDriven'));
  } finally {
    fs.rmSync(t.tablesDir, { recursive: true, force: true });
  }
});
