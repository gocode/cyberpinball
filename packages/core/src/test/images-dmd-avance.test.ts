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
import { addFlexPrewarm, flexPrewarmFor, hasFlexPrewarm } from '../flexprewarm';
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
