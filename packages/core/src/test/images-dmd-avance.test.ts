// Images du DMD chargées d'avance (18/11/2026). FlexDMD lit et décode chaque image « VPX.nom » à son premier affichage,
// sur le fil de VPX : chez un joueur, les arrêts de Hellboy et de Daredevil suivaient ce chargement. Invariants : les
// images que le script montre (noms « VPX.… » en entier, ou noms seuls quand il fabrique « "VPX." & nom », à la taille
// d'une image de DMD) sont demandées une fois juste après « FlexDMD.Run = True », lignes à leur place ; jamais les
// textures du plateau ; le .vbs se reconstruit à l'identique et garde ce chargement quand une autre réparation le refait ;
// le médecin le pose avant la partie, une seule fois.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { diagnose, pupPlayRepairs, repairPupForPlay, scriptFacts } from '../doctor';
import { addFlexPrewarm, flexPrewarmFor, hasFlexPrewarm, isFlexImageOptions } from '../flexprewarm';
import { buildScriptPatch, readScriptPatch, scriptPatchState } from '../scriptpatch';
import { scanTables } from '../tables';
import { vpxWithScript } from './fixtures';

/** Une table de JP : les noms viennent de chaînes, assemblés par « "VPX." & … & "&dmd=2" ». */
const JP = [
  'Dim FlexDMD, Chars(255), DMDScene',
  'Sub DMD_Init',
  '  Set FlexDMD = CreateObject("FlexDMD.FlexDMD")',
  '  FlexDMD.TableFile = Table1.Filename & ".vpx"',
  '  FlexDMD.Run = True \' le DMD tourne',
  '  Chars(65) = "d_a" : Chars(66) = "d_b"',
  '  Plastic.Image = "playfield_plastics"',
  'End Sub',
  'Sub DMDDisplayChar(achar, adigit)',
  '  DMDScene.GetImage("Dig" & adigit).Bitmap = FlexDMD.NewImage("", "VPX." & Chars(achar) & "&dmd=2").Bitmap',
  'End Sub',
  'Sub DMDUpdate : DMD "", "", "d_border", 1000 : End Sub',
  '',
].join('\r\n');

const IMAGES = [
  { name: 'd_a', width: 128, height: 32 },
  { name: 'd_b', width: 128, height: 32 },
  { name: 'd_border', width: 256, height: 64 },
  { name: 'playfield_plastics', width: 4096, height: 2048 },
  { name: 'd_unused', width: 128, height: 32 },
];

test('images relevées : chaînes du script qui sont des images de DMD de la table, avec leurs options ; jamais les textures', () => {
  const p = flexPrewarmFor(JP, IMAGES)!;
  assert.equal(p.variable, 'FlexDMD');
  assert.deepEqual(p.images, ['VPX.d_a', 'VPX.d_a&dmd=2', 'VPX.d_b', 'VPX.d_b&dmd=2', 'VPX.d_border', 'VPX.d_border&dmd=2']);
  // Noms écrits en entier : comptent quelle que soit leur taille (le script les montre lui-même).
  const full = 'Set F = CreateObject("FlexDMD.FlexDMD")\r\nF.Run = True\r\nF.NewImage "", "VPX.playfield_plastics&dmd=2"\r\n';
  assert.deepEqual(flexPrewarmFor(full, IMAGES)!.images, ['VPX.playfield_plastics', 'VPX.playfield_plastics&dmd=2']);
  // Sans « "VPX." & », les chaînes seules ne comptent pas (un script nomme aussi ses textures).
  assert.equal(flexPrewarmFor(full.replace('"VPX.playfield_plastics&dmd=2"', '"VPX.nulle"'), IMAGES), undefined);
  // Pas de FlexDMD, ou pas de « Run = True » où brancher le chargement : rien.
  assert.equal(flexPrewarmFor(JP.replace('CreateObject("FlexDMD.FlexDMD")', 'CreateObject("UltraDMD.DMDObject")'), IMAGES), undefined);
  assert.equal(flexPrewarmFor(JP.replace('FlexDMD.Run = True', 'FlexDMD.Run = False'), IMAGES), undefined);
});

test('noms fabriqués par le script (« "d_" & lettre ») : les images de DMD qui commencent ainsi, jamais les grandes', () => {
  // Hellboy (rapport du 18/11/2026) : d_h, d_5, d_1a… se chargeaient encore en partie, jamais écrits en entier.
  const built = [
    'Set FlexDMD = CreateObject("FlexDMD.FlexDMD")',
    'FlexDMD.Run = True',
    'Sub ShowChar(c, i)',
    '  DMDScene.GetImage("Dig" & i).Bitmap = FlexDMD.NewImage("", "VPX." & "d_" & LCase(c) & "&dmd=2&add").Bitmap',
    'End Sub',
    '',
  ].join('\r\n');
  const imgs = [
    { name: 'd_h', width: 128, height: 32 },
    { name: 'd_5', width: 16, height: 32 },
    { name: 'd_border10', width: 256, height: 64 },
    { name: 'd_big', width: 2048, height: 1024 },
    { name: 'playfield_x', width: 128, height: 32 },
  ];
  const p = flexPrewarmFor(built, imgs)!;
  assert.deepEqual(p.images, ['VPX.d_h', 'VPX.d_h&dmd=2&add', 'VPX.d_5', 'VPX.d_5&dmd=2&add', 'VPX.d_border10', 'VPX.d_border10&dmd=2&add']);
  // Sans « "VPX." & », rien n'est complété : les débuts de noms ne comptent pas.
  assert.equal(flexPrewarmFor(built.replace('"VPX." & "d_" & LCase(c) & "&dmd=2&add"', '"VPX.d_h"'), imgs)!.images.join(','), 'VPX.d_h');
});

test('options d’image : seules celles que FlexDMD reconnaît, écrites en entier', () => {
  for (const ok of ['&dmd=2', '&dmd2=3', '&add', '&dmd=2&add', '&region=0,0,128,32', '&pad=1,1,1,1&add']) assert.ok(isFlexImageOptions(ok), ok);
  // Paramètres d'une adresse web (Hellboy) ; « region= » incomplet : FlexDMD lirait des nombres absents.
  for (const no of ['&session_time=', '&H', '&installed=true', '&region=', '&region=0,0', '&pad=1', '&', 'dmd=2', '&dmd=x']) assert.ok(!isFlexImageOptions(no), no);
  const script = [
    'Set FlexDMD = CreateObject("FlexDMD.FlexDMD")',
    'FlexDMD.Run = True',
    'u = "https://example.com/?a=1" & "&session_time=" & t & "&H"',
    'Chars(65) = "d_a"',
    'FlexDMD.NewImage "", "VPX." & Chars(65) & "&dmd=2"',
    'FlexDMD.NewImage "", "VPX.d_b&region="',
    '',
  ].join('\r\n');
  assert.deepEqual(flexPrewarmFor(script, IMAGES)!.images, ['VPX.d_a', 'VPX.d_a&dmd=2', 'VPX.d_b']);
});

test('script adapté : appel au bout de la ligne qui lance FlexDMD (commentaire gardé), Sub en fin, lignes à leur place', () => {
  const p = flexPrewarmFor(JP, IMAGES)!;
  const out = addFlexPrewarm(JP, p)!;
  const before = JP.split('\r\n');
  const after = out.split('\r\n');
  assert.equal(after[4], "  FlexDMD.Run = True : CyberPinball_FlexPrewarm FlexDMD ' le DMD tourne");
  for (const i of before.keys()) if (i !== 4 && i < before.length - 1) assert.equal(after[i], before[i], `ligne ${i + 1}`);
  assert.ok(hasFlexPrewarm(out));
  assert.match(out, /Sub CyberPinball_FlexPrewarm\(f\)\r\n {2}On Error Resume Next\r\n {2}f\.NewImage "", "VPX\.d_a"\r\n/);
});

test('.vbs de Cyber Pinball : le chargement est mémorisé, se reconstruit à l’identique, passe à la version suivante de la table', () => {
  const p = flexPrewarmFor(JP, IMAGES)!;
  const vbs = buildScriptPatch(JP, [], undefined, undefined, [], p)!;
  assert.deepEqual(readScriptPatch(vbs)!.prewarm, p);
  assert.equal(scriptPatchState(vbs, JP).kind, 'ours');
  const v2 = JP.replace("' le DMD tourne", "' version 2");
  const stale = scriptPatchState(vbs, v2);
  assert.ok(stale.kind === 'stale' && stale.content && hasFlexPrewarm(stale.content));
});

function table(script: string) {
  const tablesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-images-dmd-'));
  const folder = path.join(tablesDir, 'Hellboy (Original 2021)');
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, 'Hellboy (Original 2021).vpx'), vpxWithScript(script));
  return { tablesDir, folder, vbs: path.join(folder, 'Hellboy (Original 2021).vbs'), ctx: { tablesDir, script: scriptFacts(script) } };
}

test('médecin : sans image dans la table, rien ; le constat ne réclame jamais deux fois la même chose', () => {
  // La table de l'essai n'a pas d'images (vpxWithScript) : rien à charger d'avance, aucun constat.
  const t = table(JP);
  assert.equal(diagnose(scanTables(t.tablesDir)[0]!, t.ctx).find((f) => f.code === 'flexImagesLate'), undefined);
  assert.deepEqual(pupPlayRepairs(scanTables(t.tablesDir)[0]!, t.ctx).map((f) => f.code), []);
  // Un .vbs de Cyber Pinball qui a déjà ce chargement : rien ne le refait, même s'il venait d'une autre réparation.
  fs.writeFileSync(t.vbs, buildScriptPatch(JP, [], undefined, undefined, [], flexPrewarmFor(JP, IMAGES))!, 'latin1');
  repairPupForPlay(scanTables(t.tablesDir)[0]!, t.ctx, { trashDir: `${t.tablesDir}-corbeille` });
  assert.ok(hasFlexPrewarm(fs.readFileSync(t.vbs, 'latin1')), 'les autres réparations gardent le chargement');
  fs.rmSync(t.tablesDir, { recursive: true, force: true });
  fs.rmSync(`${t.tablesDir}-corbeille`, { recursive: true, force: true });
});

test('médecin : constat pour une table de JP, posé avant la partie dans le .vbs, une seule fois, table jamais modifiée', () => {
  const { vpxWithScriptAndImages } = require('./fixtures') as typeof import('./fixtures');
  const tablesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-images-dmd-'));
  const folder = path.join(tablesDir, 'Hellboy (Original 2021)');
  fs.mkdirSync(folder, { recursive: true });
  const vpx = path.join(folder, 'Hellboy (Original 2021).vpx');
  const table = vpxWithScriptAndImages(JP, IMAGES);
  fs.writeFileSync(vpx, table);
  const ctx = { tablesDir, script: scriptFacts(JP) };
  const finding = diagnose(scanTables(tablesDir)[0]!, ctx).find((f) => f.code === 'flexImagesLate');
  assert.equal(finding?.title, 'Images du DMD chargées en pleine partie');
  assert.match(finding!.detail, /montre 3 images rangées dans la table/);
  const trashDir = `${tablesDir}-corbeille`;
  const done = repairPupForPlay(scanTables(tablesDir)[0]!, ctx, { trashDir });
  assert.ok(done.some((f) => f.code === 'flexImagesLate'));
  const vbs = fs.readFileSync(path.join(folder, 'Hellboy (Original 2021).vbs'), 'latin1');
  assert.ok(hasFlexPrewarm(vbs));
  assert.doesNotMatch(vbs, /NewImage "", "VPX\.playfield_plastics/, 'jamais une texture du plateau');
  assert.ok(fs.readFileSync(vpx).equals(table), 'table jamais modifiée');
  assert.deepEqual(repairPupForPlay(scanTables(tablesDir)[0]!, ctx, { trashDir }).map((f) => f.code), [], 'rien à refaire');
  assert.equal(diagnose(scanTables(tablesDir)[0]!, ctx).find((f) => f.code === 'flexImagesLate'), undefined);
  fs.rmSync(tablesDir, { recursive: true, force: true });
  fs.rmSync(trashDir, { recursive: true, force: true });
});
