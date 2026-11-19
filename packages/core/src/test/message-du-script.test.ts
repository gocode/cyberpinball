// Tables UltraDMD qui ne se jouaient pas (19/11/2026, une borne reprise de PinUP Popper).
// Goldorak : le script UltraDMD le plus recopié affiche « UltraDMD userfiles directory '…' does not exist. No graphic
// images will be displayed on the DMD » par une MsgBox à un seul bouton OK, et Cyber Pinball arrêtait la partie comme
// pour une erreur. Ce dossier, nommé par une variable (« DirName = curDir & "\" & TableName & ".UltraDMD" »), restait
// inconnu : ni repris de l'ancienne installation, ni signalé absent par le médecin.
// Une table Champions League : « Objet requis: 'UltraDMD' » à chaque tour, sur tout le plateau.
// Invariants : un message du script à un seul bouton OK est validé et la partie continue (les questions et les boîtes
// de VPX restent fatales) ; le dossier du DMD nommé par une variable est connu, repris et signalé ; les erreurs du
// script répétées pendant la partie tiennent en une ligne du journal, avec leur nombre.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { diagnose, scriptFacts } from '../doctor';
import { findInstallation, tableCompanions } from '../installation';
import { scanTables } from '../tables';
import { scriptErrorsDuringGame, scriptErrorsJournal } from '../vpxfailure';
import { classifyVpxWindow } from '../vpxwindows';
import { vpxWithScript } from './fixtures';

const DMD_MISSING = "UltraDMD userfiles directory 'C:\\Cyber Pinball\\tables\\Goldorak (Original 2017)\\Goldorak.UltraDMD' does not exist.\r\nNo graphic images will be displayed on the DMD";

/** MsgBox de VBScript : titre « VBScript », un bouton OK (BS_DEFPUSHBUTTON), le texte dans un Static. */
function msgBox(text: string, buttons: string[], title = 'VBScript') {
  const controls = [
    ...buttons.map((b, i) => ({ className: 'Button', id: i + 1, style: i === 0 ? 0x50030001 : 0x50010000, text: b })),
    { className: 'Static', id: 65535, style: 0x50020080, text },
  ];
  return { title, className: '#32770', texts: controls.map((c) => c.text), controls };
}

test('message du script à un seul bouton OK : validé, la partie continue, le message au journal', () => {
  const verdict = classifyVpxWindow(msgBox(DMD_MISSING, ['OK']));
  assert.equal(verdict.kind, 'information');
  assert.equal(verdict.kind === 'information' && verdict.okId, 1);
  assert.match(verdict.kind === 'information' ? verdict.notice : '', /validé par OK, la partie continue : « UltraDMD userfiles directory/);
  // Titre donné par le script, « &OK » : pareil.
  assert.equal(classifyVpxWindow(msgBox('Incompatible Version of UltraDMD found.', ['&OK'], 'UltraDMD')).kind, 'information');
});

test('questions, boîtes de VPX et boîtes illisibles restent fatales', () => {
  for (const w of [
    msgBox('Voulez-vous continuer ?', ['&Oui', '&Non']),
    msgBox('Recommencer ?', ['OK', 'Annuler']),
    msgBox("Can't start game", ['OK'], 'Visual Pinball Error'),
    msgBox('VR mode activated but OpenXR initialization failed.', ['OK'], 'Visual Pinball Error'),
    { title: 'VBScript', className: '#32770', texts: ['OK', DMD_MISSING] },
  ]) {
    assert.equal(classifyVpxWindow(w).kind, 'dialog', `${w.title} : ${w.texts.join(' | ')}`);
  }
  // Un champ de saisie (InputBox) : une réponse est attendue.
  const input = msgBox('Votre nom ?', ['OK']);
  input.controls.push({ className: 'Edit', id: 3, style: 0x50810080, text: '' });
  assert.equal(classifyVpxWindow(input).kind, 'dialog');
});

/** Le chargement UltraDMD que des centaines de tables recopient. */
const ULTRADMD = [
  'Option Explicit',
  'Const TableName = "Goldorak"',
  'Dim UltraDMD',
  'Sub LoadUltraDMD',
  '  Set UltraDMD = CreateObject("UltraDMD.DMDObject")',
  '  UltraDMD.Init',
  '  Dim fso:Set fso = CreateObject("Scripting.FileSystemObject")',
  '  Dim curDir:curDir = fso.GetAbsolutePathName(".")',
  '  Dim DirName',
  '  DirName = curDir& "\\" &TableName& ".UltraDMD"',
  '  If Not fso.FolderExists(DirName) Then _',
  '    Msgbox "UltraDMD userfiles directory \'" & DirName & "\' does not exist." & CHR(13) & "No graphic images will be displayed on the DMD"',
  '  UltraDMD.SetProjectFolder DirName',
  'End Sub',
  '',
].join('\r\n');

test('dossier du DMD nommé par une variable : lu dans le script', () => {
  assert.equal(scriptFacts(ULTRADMD).dmdFolder, 'Goldorak.UltraDMD');
  // Variable égale à un texte (2001 de HAL9000), texte direct (GOTG), ProjectFolder de FlexDMD : comme avant.
  assert.equal(scriptFacts('Dim folderPath\r\nfolderPath = "\\HAL9000.UltraDMD"\r\nSub L\r\n  curDir = fso.GetAbsolutePathName(".")\r\n  UltraDMD.SetProjectFolder curDir & folderPath\r\nEnd Sub\r\n').dmdFolder, 'HAL9000.UltraDMD');
  assert.equal(scriptFacts('Sub L\r\n  UltraDMD.SetProjectFolder curDir & "\\GOTG.UltraDMD"\r\nEnd Sub\r\n').dmdFolder, 'GOTG.UltraDMD');
  assert.equal(scriptFacts('Sub L\r\n  FlexDMD.ProjectFolder = "./TheGooniesDMD/"\r\nEnd Sub\r\n').dmdFolder, 'TheGooniesDMD');
  // Nom calculé à l'exécution (Table1.Name) : inconnu, rien d'inventé.
  assert.equal(scriptFacts('Sub L\r\n  DirName = curDir & "\\" & Table1.Name & ".UltraDMD"\r\n  UltraDMD.SetProjectFolder DirName\r\nEnd Sub\r\n').dmdFolder, undefined);
});

test('médecin : le dossier du DMD absent est signalé ; reprise d’une installation : il suit la table', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-message-script-'));
  try {
    // Dans Cyber Pinball, sans le dossier : le médecin le dit.
    const tablesDir = path.join(root, 'tables');
    const name = 'Goldorak (Original 2017)';
    fs.mkdirSync(path.join(tablesDir, name), { recursive: true });
    fs.writeFileSync(path.join(tablesDir, name, `${name}.vpx`), vpxWithScript(ULTRADMD));
    const finding = diagnose(scanTables(tablesDir)[0]!, { tablesDir, script: scriptFacts(ULTRADMD) }).find((f) => f.code === 'dmdFolderMissing');
    assert.equal(finding?.title, 'Dossier « Goldorak.UltraDMD » absent');

    // Installation de Popper à plat : le dossier nommé par le script, et celui nommé comme la table, suivent la table.
    const vp = path.join(root, 'vPinball');
    const flat = path.join(vp, 'VisualPinball', 'Tables');
    fs.mkdirSync(path.join(vp, 'VisualPinball', 'VPinMAME'), { recursive: true });
    fs.mkdirSync(path.join(vp, 'PinUPSystem', 'PUPVideos'), { recursive: true });
    fs.mkdirSync(path.join(flat, 'Goldorak.UltraDMD'), { recursive: true });
    fs.writeFileSync(path.join(flat, 'Goldorak.UltraDMD', 'intro.png'), 'x');
    fs.mkdirSync(path.join(flat, 'Autre.FlexDMD'), { recursive: true });
    const vpx = path.join(flat, `${name}.vpx`);
    fs.writeFileSync(vpx, 'x');
    fs.writeFileSync(path.join(flat, 'Autre.vpx'), 'x');
    const layout = findInstallation(flat, [tablesDir])!;
    assert.ok(layout);
    const goldorak = tableCompanions(vpx, layout, { ...scriptFacts(ULTRADMD) });
    assert.ok(goldorak.found.some((c) => c.part === 'dmdFolder' && path.basename(c.path) === 'Goldorak.UltraDMD'), JSON.stringify(goldorak.found));
    // Script illisible : le dossier nommé comme la table suit quand même.
    const autre = tableCompanions(path.join(flat, 'Autre.vpx'), layout);
    assert.ok(autre.found.some((c) => c.part === 'dmdFolder' && path.basename(c.path) === 'Autre.FlexDMD'), JSON.stringify(autre.found));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('erreurs du script répétées pendant la partie : une ligne du journal, avec leur nombre', () => {
  const tick = "2026-11-19 10:20:01.123 ERROR [Main] [Player::OnScriptError@1235] Runtime error on line 812, col 4: Objet requis: 'UltraDMD'";
  const lines = [
    '2026-11-19 10:20:00.000 INFO [Main] Startup done',
    ...Array.from({ length: 240 }, () => tick),
    "2026-11-19 10:20:09.000 ERROR [Main] [Player::OnScriptError@1235] Runtime error on line 90, col 1: Type incompatible: 'x'",
  ];
  const script = Array.from({ length: 900 }, (_, i) => (i === 811 ? '    UltraDMD.DisplayScoreboard 1, 1, Score, 0, 0, 0, "", ""' : ''));
  const errors = scriptErrorsDuringGame(lines, script.join('\r\n'));
  assert.equal(errors.length, 2);
  assert.deepEqual({ line: errors[0]!.line, count: errors[0]!.count, message: errors[0]!.message }, { line: 812, count: 240, message: "Objet requis: 'UltraDMD'" });
  const journal = scriptErrorsJournal('Champions League', lines, script.join('\r\n'))!;
  assert.match(journal, /^Erreur du script répétée en boucle pendant la partie \(Champions League\) : ligne 812 \(UltraDMD\.DisplayScoreboard/);
  assert.match(journal, /« Objet requis: 'UltraDMD' », 240 fois ; ligne 90 : « Type incompatible: 'x' »\.$/);
  assert.equal(journal.split('\n').length, 1);
  assert.equal(scriptErrorsJournal('x', ['INFO rien']), undefined);
});
