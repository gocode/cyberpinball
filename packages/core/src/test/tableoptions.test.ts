// DMD réglé pour le mode bureau par une option de table : JP's Space Cadet v7.0 (JPSalas), jouée le
// 17/11/2026 sur une borne à trois écrans, sans DMD. Son script déclare
// Table1.Option("DMD Type", 0, 1, 1, 0, 0, Array("Desktop DMD", "FlexDMD")) : par défaut, un DMD de
// flashers dans le décor du mode bureau, invisible en mode cabinet ; FlexDMD n'est jamais créé et
// VPX ne montre jamais la fenêtre du DMD (il attend une première image pour l'afficher), que le menu
// en partie prenait pour un DMD masqué. Ces tests fixent l'invariant : sur une borne qui a un DMD,
// toute option de table de ce genre passe sur le DMD de la borne dans le .ini de la table, sans
// jamais écraser un choix du joueur, et une fenêtre de DMD vide n'est jamais dite masquée.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { diagnose, repairPupForPlay, scriptFacts } from '../doctor';
import { applyOps } from '../fileops';
import { vpxDmdWindowState } from '../dmdplace';
import type { PupCabinet } from '../puppack';
import { cabinetDmdIni, cabinetDmdOptions, tableOptionKey, tableOptions, TABLE_OPTION_SECTION } from '../tableoptions';
import { scanTables } from '../tables';
import { vpxWithScript } from './fixtures';
import { IniDocument } from '../ini';

/** Bloc des options de JP's Space Cadet v7.0, tel que la table le livre (raccourci, mêmes formes). */
const SPACE_CADET = [
  "' Table Options F12 User Options",
  'Dim LUTImage, BallsPerGame, UseFlexDMD, OldUseFlex, FlexDMDHighQuality, SongVolume',
  "UseFlexDMD = False 'initialize variable",
  'Sub Table1_OptionEvent(ByVal eventId)',
  '    Dim x, y',
  "    'LUT",
  '    x = Table1.Option("Select LUT", 0, 3, 1, 0, 0, Array("Normal 0", "Normal 1", _',
  '        "Warm 0", "Warm 1") )',
  '    table1.ColorGradeImage =  LUTImage(x)',
  "    ' Desktop DMD",
  '    x = Table1.Option("DMD Type", 0, 1, 1, 0, 0, Array("Desktop DMD", "FlexDMD") )',
  '    If UseFlexDMD AND x = 0 Then FlexDMD.Run = False',
  '    If X then UseFlexDMD = True Else UseFlexDMD = False',
  "    ' FlexDMD Quality",
  '    x = Table1.Option("FlexDMD Quality", 0, 1, 1, 1, 0, Array("Low", "High") )',
  '    x = Table1.Option("Cabinet Rails", 0, 1, 1, 1, 0, Array("Hide", "Show") )',
  '    SongVolume = Table1.Option("Music Volume", 0, 1, 0.1, 0.2, 0)',
  'End Sub',
  'Sub DMD_Init()',
  '    If UseFlexDMD Then',
  '        Set FlexDMD = CreateObject("FlexDMD.FlexDMD")',
  '    End If',
  'End Sub',
  '',
].join('\r\n');

const option = (call: string) => cabinetDmdOptions(`Sub Table1_OptionEvent(ByVal e)\r\n  x = ${call}\r\nEnd Sub\r\n`);

test('clé de VPX : nom sans espaces autour, ni lettre ni chiffre devient « _ » (PinTable::Option)', () => {
  assert.equal(tableOptionKey('DMD Type'), 'DMD_Type');
  assert.equal(tableOptionKey('  Ball/Trail-1.5 '), 'Ball_Trail_1_5');
});

test('options de table : lues en toutes lettres, lignes continuées comprises, une fois chacune', () => {
  const found = tableOptions(SPACE_CADET + SPACE_CADET);
  assert.deepEqual(
    found.map((o) => o.key),
    ['Select_LUT', 'DMD_Type', 'FlexDMD_Quality', 'Cabinet_Rails', 'Music_Volume'],
  );
  assert.deepEqual(found[0]!.values, ['Normal 0', 'Normal 1', 'Warm 0', 'Warm 1']);
  assert.equal(found[4]!.values, undefined);
  // Commentée, ou dont un argument est calculé : ignorée.
  assert.deepEqual(tableOptions('\' x = Table1.Option("DMD Type", 0, 1, 1, 0, 0, Array("Desktop DMD", "FlexDMD"))\r\n'), []);
  assert.deepEqual(tableOptions('x = Table1.Option("DMD Type", 0, 1, 1, dflt, 0, Array("Desktop DMD", "FlexDMD"))\r\n'), []);
});

test('JP’s Space Cadet : « DMD Type » passe de « Desktop DMD » à « FlexDMD », rien d’autre', () => {
  assert.deepEqual(cabinetDmdOptions(SPACE_CADET), [{ name: 'DMD Type', key: 'DMD_Type', from: 'Desktop DMD', to: 'FlexDMD', value: '1' }]);
  assert.deepEqual(scriptFacts(SPACE_CADET).dmdOptions?.map((o) => o.key), ['DMD_Type']);
});

test('formes voisines : la valeur écrite est celle que VPX relit', () => {
  // Entier = min + rang du libellé.
  assert.equal(option('Table1.Option("DMD", 1, 3, 1, 1, 0, Array("Internal", "UltraDMD", "FlexDMD"))')[0]?.value, '3');
  // Faute de FlexDMD, UltraDMD (fourni aussi par le plugin FlexDMD de VPX).
  assert.equal(option('Table1.Option("DMD mode", 0, 1, 1, 0, 0, Array("DT DMD", "UltraDMD"))')[0]?.to, 'UltraDMD');
  // Interrupteurs éteints par défaut : booléen Off/On de VPX, ou 0/1 sans libellés.
  assert.equal(option('Table1.Option("Use FlexDMD", 0, 1, 1, 0, 0, Array("Off", "On"))')[0]?.value, '1');
  assert.equal(option('Me.Option("FlexDMD", 0, 1, 1, 0, 0)')[0]?.value, '1');
  // Déjà sur un DMD de borne, ou sur un DMD externe (PinMAME) : rien.
  assert.deepEqual(option('Table1.Option("DMD Type", 0, 1, 1, 1, 0, Array("Desktop DMD", "FlexDMD"))'), []);
  assert.deepEqual(option('Table1.Option("DMD", 0, 1, 1, 0, 0, Array("External DMD (PinMAME)", "FlexDMD"))'), []);
  // Sans rapport avec le DMD, ou qui l'éteint : rien.
  assert.deepEqual(option('Table1.Option("Sound", 0, 1, 1, 0, 0, Array("Desktop", "Cabinet"))'), []);
  assert.deepEqual(option('Table1.Option("Disable FlexDMD", 0, 1, 1, 0, 0, Array("Off", "On"))'), []);
  // Liste qui ne couvre pas min..max : VPX refuse l'option, on n'écrit rien.
  assert.deepEqual(option('Table1.Option("DMD Type", 0, 2, 1, 0, 0, Array("Desktop DMD", "FlexDMD"))'), []);
});

test('.ini de la table : l’option réglée seulement si le joueur n’a rien choisi, le reste intact', () => {
  const options = cabinetDmdOptions(SPACE_CADET);
  const ini = '[TableOverride]\r\nViewCabMode = 2\r\n\r\n[ScoreView]\r\nScoreViewOutput = 1\r\n';
  const first = cabinetDmdIni(ini, options)!;
  assert.equal(IniDocument.parse(first.content).get(TABLE_OPTION_SECTION, 'DMD_Type'), '1');
  assert.ok(first.content.startsWith(ini.trimEnd()), first.content);
  assert.equal(cabinetDmdIni(first.content, options), undefined, 'déjà réglée');
  // Valeur vide (VPX l'écrit ainsi pour « pas de choix ») : réglée.
  assert.equal(IniDocument.parse(cabinetDmdIni('[TableOption]\r\nDMD_Type = \r\n', options)!.content).get(TABLE_OPTION_SECTION, 'DMD_Type'), '1');
  // Choix du joueur dans le menu F12 : jamais écrasé.
  assert.equal(cabinetDmdIni('[TableOption]\r\nDMD_Type = 0\r\n', options), undefined);
  assert.equal(cabinetDmdIni('', options)!.content.trim(), '[TableOption]\r\nDMD_Type = 1');
});

const CABINET: PupCabinet = { backglass: true, dmd: true, topper: false, dmdRatio: 16 / 9, backglassRatio: 16 / 9, aspects: { playfield: 16 / 9 } };

test('médecin : constat sur une borne à DMD, réglé avant la partie, jamais sur un poste sans DMD', () => {
  const tablesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-tableoptions-'));
  const folder = path.join(tablesDir, "JP's Space Cadet (Original 2021)");
  fs.mkdirSync(folder);
  const vpx = path.join(folder, 'Space Cadet (Cinematronics 1995) [jpsalas 2026 - v7].vpx');
  fs.writeFileSync(vpx, vpxWithScript(SPACE_CADET));
  const ini = vpx.replace(/\.vpx$/, '.ini');
  fs.writeFileSync(ini, '[ScoreView]\r\nScoreViewOutput = 1\r\n');
  const entry = () => scanTables(tablesDir)[0]!;
  const script = scriptFacts(SPACE_CADET);
  try {
    assert.ok(!diagnose(entry(), { tablesDir, script, cabinet: { ...CABINET, dmd: false } }).some((f) => f.code === 'dmdDesktopOption'), 'sans DMD : rien');
    const finding = diagnose(entry(), { tablesDir, script, cabinet: CABINET }).find((f) => f.code === 'dmdDesktopOption');
    assert.ok(finding?.fix, 'constat et correction attendus');
    assert.match(finding.detail, /DMD Type/);
    // Avant la partie, sans rien demander : le .ini est réglé, la table n'est pas touchée.
    const before = fs.readFileSync(vpx);
    const done = repairPupForPlay(entry(), { tablesDir, script, cabinet: CABINET }, { trashDir: `${tablesDir}-corbeille` });
    assert.deepEqual(done.map((f) => f.code), ['dmdDesktopOption']);
    const doc = IniDocument.parse(fs.readFileSync(ini, 'latin1'));
    assert.equal(doc.get(TABLE_OPTION_SECTION, 'DMD_Type'), '1');
    assert.equal(doc.get('ScoreView', 'ScoreViewOutput'), '1');
    assert.ok(fs.readFileSync(vpx).equals(before));
    assert.ok(!diagnose(entry(), { tablesDir, script, cabinet: CABINET }).some((f) => f.code === 'dmdDesktopOption'), 'réglé : plus de constat');
    // Le joueur revient au DMD de bureau dans le menu F12 : son choix reste.
    fs.writeFileSync(ini, '[TableOption]\r\nDMD_Type = 0\r\n');
    assert.deepEqual(repairPupForPlay(entry(), { tablesDir, script, cabinet: CABINET }, { trashDir: `${tablesDir}-corbeille` }), []);
    // Sans .ini : il est créé.
    fs.rmSync(ini);
    const created = diagnose(entry(), { tablesDir, script, cabinet: CABINET }).find((f) => f.code === 'dmdDesktopOption')!;
    applyOps(created.fix!.ops, { trashDir: `${tablesDir}-corbeille` });
    assert.equal(IniDocument.parse(fs.readFileSync(ini, 'latin1')).get(TABLE_OPTION_SECTION, 'DMD_Type'), '1');
  } finally {
    fs.rmSync(tablesDir, { recursive: true, force: true });
    fs.rmSync(`${tablesDir}-corbeille`, { recursive: true, force: true });
  }
});

test('fenêtre du DMD de VPX : vide (jamais dessinée) n’est pas masquée', () => {
  const screens = [
    { x: 0, y: 0, width: 3840, height: 2160 },
    { x: 3840, y: 90, width: 1920, height: 1080 },
  ];
  const onDmd = { x: 3840, y: 90, width: 1920, height: 1080 };
  assert.equal(vpxDmdWindowState(screens, undefined), 'none');
  assert.equal(vpxDmdWindowState(screens, { rect: onDmd, visible: true }), 'shown');
  // VPX ne montre la fenêtre qu'à sa première image : sans DMD envoyé par la table, elle reste invisible.
  assert.equal(vpxDmdWindowState(screens, { rect: onDmd, visible: false }), 'empty');
  // Rangée hors des écrans par Cyber Pinball : masquée, visible ou non.
  assert.equal(vpxDmdWindowState(screens, { rect: { x: -20000, y: 0, width: 1920, height: 1080 }, visible: true }), 'parked');
  assert.equal(vpxDmdWindowState(screens, { rect: { x: -20000, y: 0, width: 1920, height: 1080 }, visible: false }), 'parked');
});
