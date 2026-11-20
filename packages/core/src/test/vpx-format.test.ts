// Format des tables de VPX (vpx-format.ts, readVpxFileVersion) : une table enregistrée par un VPX plus récent que
// celui qui la joue (préversion 10.9, format 1090, et le VPX 10.8.1-5436 de Cyber Pinball, format 1081) est signalée
// par le médecin, la Santé de la borne, l'installation et avant la partie ; une table du même format ou plus
// ancienne ne l'est jamais. Le VPX proposé à sa place est un de la liste des autres VPX qui sait l'ouvrir.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { otherVpxLabel, tableTooNew, tooNewAdvice, tooNewReason, tooNewRefusal, vpxChoiceOf, type OtherVpx } from '../autres-vpx';
import { diagnose, scriptFacts } from '../doctor';
import { applyOps } from '../fileops';
import { HEALTH_CHECK_FINDINGS } from '../health';
import { setLanguage } from '../i18n';
import { scanTables } from '../tables';
import { vpxFormatName, vpxReadableFormat, vpxReadsFormat, vpxVersionName } from '../vpx-format';
import { readVpxFileVersion } from '../vpxinfo';
import { vpxSavedWith, vpxWithScript } from './fixtures';
import { frontendSource } from './frontend-source';
import { REPO_ROOT } from './i18n-scan';

const OWN = '10.8.1-5436';
const V1080: OtherVpx = { id: 'vpx-10.8.0-2051', exe: 'C:\\Visual Pinball\\VPinballX64.exe', version: '10.8.0.2051' };
const V1090: OtherVpx = { id: 'vpx-10.8.1-6012', exe: 'C:\\VPX 10.9\\VPinballX64.exe', version: '10.8.1.6012' };

function tableWith(content: Buffer): { tablesDir: string; file: string } {
  const tablesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-format-'));
  const folder = path.join(tablesDir, 'Table (Maker 2026)');
  fs.mkdirSync(folder);
  const file = path.join(folder, 'Table (Maker 2026).vpx');
  fs.writeFileSync(file, content);
  fs.writeFileSync(path.join(folder, 'Table (Maker 2026).info'), '{}');
  return { tablesDir, file };
}

test('readVpxFileVersion lit le flux GameStg/Version (entier de 4 octets) ; illisible ou absent : undefined', () => {
  for (const version of [1060, 1080, 1081, 1090]) {
    const { tablesDir, file } = tableWith(vpxSavedWith(version));
    assert.equal(readVpxFileVersion(file), version);
    fs.rmSync(tablesDir, { recursive: true });
  }
  const { tablesDir, file } = tableWith(vpxWithScript('Option Explicit'));
  assert.equal(readVpxFileVersion(file), undefined, 'table sans flux Version');
  fs.writeFileSync(file, 'pas une table');
  assert.equal(readVpxFileVersion(file), undefined, 'fichier qui n’est pas un fichier composé');
  assert.equal(readVpxFileVersion(path.join(tablesDir, 'absente.vpx')), undefined);
  fs.rmSync(tablesDir, { recursive: true });
});

test('format lu par chaque VPX : numéro de version, et préversions 10.9 numérotées 10.8.1 depuis la révision 5963', () => {
  assert.equal(vpxReadableFormat('10.8.0.2051'), 1080);
  assert.equal(vpxReadableFormat(OWN), 1081);
  assert.equal(vpxReadableFormat('10.8.1.5436'), 1081);
  assert.equal(vpxReadableFormat('10.8.1.5962'), 1081);
  assert.equal(vpxReadableFormat('10.8.1.5963'), 1090);
  assert.equal(vpxReadableFormat('10.9.0.7000'), 1090);
  assert.equal(vpxReadableFormat('10.7.4.433'), 1074);
  assert.equal(vpxReadableFormat('9.9.0'), undefined);
  assert.equal(vpxFormatName(1090), '10.9');
  assert.equal(vpxFormatName(1081), '10.8.1');
  assert.equal(vpxFormatName(1080), '10.8');
  // Format ou version inconnus : rien n'est refusé.
  assert.equal(vpxReadsFormat(OWN, undefined), true);
  assert.equal(vpxReadsFormat(undefined, 1090), true);
  assert.equal(vpxReadsFormat(OWN, 1090), false);
});

test('une préversion 10.9 garde sa révision dans son nom ; la 10.8.0 et la 10.8.1 non', () => {
  assert.equal(vpxVersionName('10.8.1.6012'), '10.8.1.6012');
  assert.equal(otherVpxLabel(V1090), 'VPX 10.8.1.6012');
  assert.equal(otherVpxLabel(V1080), 'VPX 10.8.0');
  assert.equal(otherVpxLabel({ version: '10.8.1.5436' }), 'VPX 10.8.1');
});

test('invariant : table plus récente que son VPX → signalée ; même format ou plus ancienne → rien', () => {
  setLanguage('fr');
  for (const format of [1060, 1072, 1080, 1081]) assert.equal(tableTooNew(format, {}, OWN, [V1080, V1090]), undefined, `format ${format}`);
  assert.equal(tableTooNew(undefined, {}, OWN, []), undefined, 'format inconnu');
  assert.equal(tableTooNew(1090, {}, undefined, []), undefined, 'VPX de Cyber Pinball absent');
  // Jouée avec la préversion qui sait l'ouvrir : rien.
  assert.equal(tableTooNew(1090, { CyberPinball: { vpx: V1090.id } }, OWN, [V1080, V1090]), undefined);

  const own = tableTooNew(1090, {}, OWN, [])!;
  assert.deepEqual(own, { table: '10.9', player: 'VPX 10.8.1 de Cyber Pinball', able: [] });
  assert.match(tooNewReason(own), /VPX 10\.8\.1 de Cyber Pinball ne sait pas ouvrir une table enregistrée par VPX 10\.9/);
  assert.match(tooNewAdvice(own), /Menu système > Ma borne > VPX > Autres versions de VPX/);

  // Un autre VPX assez récent dans la liste : proposé, la 10.8.0 non.
  const able = tableTooNew(1090, {}, OWN, [V1080, V1090])!;
  assert.deepEqual(able.able, [{ id: V1090.id, label: 'VPX 10.8.1.6012' }]);
  assert.match(tooNewAdvice(able), /^VPX 10\.8\.1\.6012 sait la jouer : Gérer la table, puis « Jouée avec »/);

  // Table de VPX 10.8.1 jouée avec la 10.8.0 : le VPX de Cyber Pinball la lit, il passe en premier.
  const old = tableTooNew(1081, { CyberPinball: { vpx: V1080.id } }, OWN, [V1080, V1090])!;
  assert.equal(old.player, 'VPX 10.8.0');
  assert.deepEqual(
    old.able.map((a) => a.id),
    [undefined, V1090.id],
  );

  const refusal = tooNewRefusal(own);
  assert.equal(refusal.title, 'VPX 10.8.1 de Cyber Pinball ne peut pas ouvrir cette table');
  assert.equal(refusal.lines.at(-1), 'Start ou Exit : revenir au front-end.');
});

test('médecin : la table de VPX 10.9 est signalée, la correction la fait jouer par le VPX qui sait l’ouvrir ; Santé de la borne', () => {
  setLanguage('fr');
  assert.ok((HEALTH_CHECK_FINDINGS as readonly string[]).includes('tableTooNew'));
  const { tablesDir, file } = tableWith(vpxSavedWith(1090));
  const script = scriptFacts('Option Explicit');
  const entry = () => scanTables(tablesDir).find((e) => e.file === file)!;

  // Sans autre VPX : signalée, où l'ajouter, pas de correction.
  const alone = diagnose(entry(), { tablesDir, script, vpx: { own: OWN, others: [] } }).find((f) => f.code === 'tableTooNew')!;
  assert.equal(alone.title, 'Table enregistrée par VPX 10.9');
  assert.match(alone.detail, /Menu système > Ma borne > VPX > Autres versions de VPX/);
  assert.equal(alone.fix, undefined);

  // Avec une préversion 10.9 dans la liste : « La jouer avec VPX 10.8.1.6012 », écrit dans le .info comme la fiche.
  const finding = diagnose(entry(), { tablesDir, script, vpx: { own: OWN, others: [V1080, V1090] } }).find((f) => f.code === 'tableTooNew')!;
  assert.equal(finding.fix?.label, 'La jouer avec VPX 10.8.1.6012');
  applyOps(finding.fix!.ops, { trashDir: path.join(tablesDir, '_corbeille') });
  assert.equal(vpxChoiceOf(entry().info), V1090.id);
  assert.ok(!diagnose(entry(), { tablesDir, script, vpx: { own: OWN, others: [V1080, V1090] } }).some((f) => f.code === 'tableTooNew'));

  // Sans contexte de VPX, ou table du format de Cyber Pinball : la règle se tait.
  assert.ok(!diagnose(entry(), { tablesDir, script }).some((f) => f.code === 'tableTooNew'));
  fs.writeFileSync(file, vpxSavedWith(1081));
  assert.ok(!diagnose(entry(), { tablesDir, script, vpx: { own: OWN, others: [] } }).some((f) => f.code === 'tableTooNew'));
  fs.rmSync(tablesDir, { recursive: true });
});

test('textes en anglais', () => {
  setLanguage('en');
  try {
    const c = tableTooNew(1090, {}, OWN, [])!;
    assert.equal(tooNewReason(c), 'Cyber Pinball’s VPX 10.8.1 cannot open a table saved with VPX 10.9: the game would fail.');
    assert.match(tooNewAdvice(c), /System menu > My cabinet > VPX > Other VPX versions/);
    assert.equal(tooNewRefusal(c).title, 'Cyber Pinball’s VPX 10.8.1 cannot open this table');
  } finally {
    setLanguage('fr');
  }
});

test('branchements : partie refusée avant VPX, plan d’installation, script lu sans lancer VPX, Santé de la borne', () => {
  const frontend = frontendSource();
  assert.match(frontend, /tableTooNew\(readVpxFileVersion\(table\.file\)/, 'play() vérifie le format avant de lancer VPX');
  assert.match(frontend, /tooNewRefusal\(tooNew\)/);
  const app = path.join(REPO_ROOT, 'app', 'src');
  const library = fs.readFileSync(path.join(app, 'library.ts'), 'utf8');
  assert.match(library, /vpx: \{ own: host\.vpxVersion\?\.\(\), others: otherVpxMenu\.list\(\) \}/, 'diagnostic de la fiche');
  assert.match(library, /const vpx = \{ own: host\.vpxVersion\?\.\(\), others: otherVpxMenu\.list\(\) \}/, 'Santé de la borne (quickDoctor)');
  assert.match(library, /planVpx\.tooNew\(/, 'plan d’installation');
  const vbs = fs.readFileSync(path.join(app, 'vbs.ts'), 'utf8');
  assert.match(vbs, /!vpxReadsFormat\(exeVersion\(exe\), format\)/, '-ExtractVBS évité pour une table trop récente');
});
