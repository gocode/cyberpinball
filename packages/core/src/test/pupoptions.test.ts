// Options d'un PuP-Pack : laquelle est en place, laquelle convient à la borne, et ce que
// devient le pack quand on en applique une. Signalement du 26 octobre 2026 (Guardians of
// the Galaxy, gotg_2020) : « j'ai beau valider l'option 2, ça reste toujours sur l'option 0 ».
// L'option 2 était bien en place ; ses .pup sont ceux de l'option 0, et la reconnaissance
// par les seuls .pup prenait la première. Chaque option apparaissait aussi deux fois (son
// .bat et son dossier), et l'égalité entre jumelles cachait la recommandation.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { diagnose, pupMemory, pupOptionOps, repairPupForPlay, scriptFacts, tablePupPacks } from '../doctor';
import { applyOps } from '../fileops';
import { analysePack, appliedOption, checkAppliedOption, chooseVariant, isBackupName, missingSources, variantDifferences, type PupCabinet } from '../puppack';
import { readInfo, scanTables } from '../tables';
import { gotgPack, vpxWithScript } from './fixtures';

const OPTION_0 = 'Option 0 - 3 Screen Desktop';
const OPTION_2 = 'Option 2 - 3 Screen FullDMD';
const OPTION_4 = 'Option 4 - Backbox AIO - 4x3 and 5x4 - Speaker Panel, Full DMD, Backglass';

/** Borne du signalement : fronton 16:9, FullDMD 16:9, sans topper. */
const BORNE: PupCabinet = { backglass: true, dmd: true, topper: false, fullDmd: true, dmdRatio: 16 / 9, backglassRatio: 16 / 9 };

const SCRIPT = 'Set PuPlayer = CreateObject("PinUpPlayer.PinDisplay")\r\nPuPlayer.B2SInit "", "gotg_2020"\r\n';

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-pupopt-'));
}

/** Table GOTG installée : le pack dans pupvideos\gotg_2020, le .info avec la mémoire donnée. */
function gotgTable(applied: 0 | 2, memory?: object): { tablesDir: string; root: string; infoFile: string } {
  const tablesDir = tmp();
  const folder = path.join(tablesDir, 'GOTG_2.1.1');
  const root = path.join(folder, 'pupvideos', 'gotg_2020');
  fs.mkdirSync(root, { recursive: true });
  gotgPack(root, applied);
  fs.writeFileSync(path.join(folder, 'GOTG_2.1.1.vpx'), vpxWithScript(SCRIPT));
  const infoFile = path.join(folder, 'GOTG_2.1.1.info');
  fs.writeFileSync(infoFile, JSON.stringify({ Info: { Title: 'Gardiens de la galaxie 2.1.1' }, ...(memory && { CyberPinball: { pup: { gotg_2020: memory } } }) }));
  return { tablesDir, root, infoFile };
}

test('GOTG : une option par .bat, l’option 4 par son dossier, aucun doublon, la copie de sauvegarde ignorée', () => {
  const root = tmp();
  gotgPack(root);
  const info = analysePack(root);
  assert.deepEqual(
    info.variants.map((v) => [v.label, v.bat ?? null]),
    [
      [OPTION_0, `${OPTION_0}.bat`],
      ['Option 1 - 2 Screen NoDMD', 'Option 1 - 2 Screen NoDMD.bat'],
      [OPTION_2, `${OPTION_2}.bat`],
      ['Option 3 - 2 Screen 5x4', 'Option 3 - 2 Screen 5x4.bat'],
      [OPTION_4, null],
    ],
  );
  // Le dossier d'une option est celui de ses .pup, pas « PuP-Pack_Options » (l'aperçu est un cran plus haut).
  assert.equal(info.variants[2]!.folder, path.join('PuP-Pack_Options', OPTION_2));
  // « del Option*.jpg » puis « xcopy Option 2.JPG » : l'aperçu de l'option reste en place.
  assert.deepEqual(info.variants[2]!.deletes, []);
  assert.deepEqual(info.variants[0]!.deletes, ['Option 2.JPG']);
  assert.equal(info.variants[1]!.traits.dmd, 'none', '« NoDMD » attaché se lit aussi');
  for (const name of ['PuP-Pack_Options - Copy', '_backup', 'Topper.orig', 'Options.bak', 'PuP-Pack_Options (copie)']) assert.ok(isBackupName(name), name);
  for (const name of ['PuP-Pack_Options', 'Option 2 - 3 Screen FullDMD', 'Topper', 'Copyright']) assert.ok(!isBackupName(name), name);
  fs.rmSync(root, { recursive: true });
});

test('GOTG : l’option en place est reconnue par tous ses fichiers, pas par ses seuls .pup', () => {
  for (const applied of [2, 0] as const) {
    const root = tmp();
    gotgPack(root, applied);
    const info = analysePack(root);
    const now = appliedOption(info);
    assert.equal(now?.variant.label, applied === 2 ? OPTION_2 : OPTION_0);
    assert.equal(now?.complete, true);
    assert.deepEqual(now?.twins, []);
    // Ce qui distingue l'autre : les outils du bureau et « Option Selected.txt ».
    const other = info.variants.find((v) => v.label === (applied === 2 ? OPTION_0 : OPTION_2))!;
    const diffs = variantDifferences(root, other).map((d) => d.text);
    assert.ok(diffs.some((d) => /Option Selected\.txt/.test(d)), diffs.join(' | '));
    if (applied === 2) assert.ok(diffs.includes('PuPDesktopPunch.exe absent'), diffs.join(' | '));
    else assert.ok(diffs.some((d) => /PuPInit\.bat encore là/.test(d)), diffs.join(' | '));
    fs.rmSync(root, { recursive: true });
  }
});

test('GOTG : pour une borne à FullDMD 16:9, l’option 2 est conseillée sans hésiter', () => {
  const root = tmp();
  gotgPack(root, 0);
  const choice = chooseVariant(analysePack(root).variants, BORNE);
  assert.deepEqual([choice.chosen?.label, choice.confident], [OPTION_2, true]);
  // Avant, chaque option comptait deux fois : deux « Option 2 » à égalité, pas de choix net.
  assert.equal(choice.runnerUp, undefined);
  fs.rmSync(root, { recursive: true });
});

test('GOTG : appliquer l’option 2 depuis l’option 0 la met vraiment en place ; l’état d’avant reste à la corbeille', () => {
  const { tablesDir, root, infoFile } = gotgTable(0);
  const entry = () => scanTables(tablesDir)[0]!;
  const [pack] = tablePupPacks(entry(), BORNE);
  assert.deepEqual([pack!.applied?.label, pack!.recommended?.label, pack!.variants.length], [OPTION_0, OPTION_2, 5]);
  const trashDir = `${tablesDir}-corbeille`;
  const two = pack!.variants.find((v) => v.label === OPTION_2)!;
  applyOps(pupOptionOps(entry(), pack!.root, pack!.pack, two, { chosen: 'user' }), { trashDir });

  const [after] = tablePupPacks(entry(), BORNE);
  assert.deepEqual([after!.applied?.label, after!.incomplete, after!.twins], [OPTION_2, undefined, []]);
  assert.equal(fs.readFileSync(path.join(root, 'Option Selected.txt'), 'utf8'), '2');
  assert.ok(!fs.existsSync(path.join(root, 'PuPDesktopPunch.exe')));
  assert.ok(!fs.existsSync(path.join(root, 'Option 0.JPG')));
  assert.ok(fs.existsSync(path.join(root, 'Option 2.JPG')));
  assert.deepEqual(pupMemory(readInfo(infoFile), 'gotg_2020'), { chosen: 'user', option: OPTION_2 });
  // L'état d'avant : outils du bureau, .pup et .info remplacés, tout est à la corbeille.
  for (const f of ['PuPDesktopPunch.exe', 'PuPInit.bat', 'screens.pup', 'Option Selected.txt', 'Option 0.JPG', 'GOTG_2.1.1.info']) {
    assert.ok(fs.existsSync(path.join(trashDir, f)), `${f} à la corbeille`);
  }
  // Réappliquée : l'aperçu n'est pas emporté par « del Option*.jpg » (copie, puis corbeille).
  const again = tablePupPacks(entry(), BORNE)[0]!;
  applyOps(pupOptionOps(entry(), again.root, again.pack, again.applied!, { chosen: 'user' }), { trashDir: `${trashDir}-2` });
  assert.ok(fs.existsSync(path.join(root, 'Option 2.JPG')));
  assert.equal(tablePupPacks(entry(), BORNE)[0]!.applied?.label, OPTION_2);
  // Retour à l'option 0 : reconnue à son tour.
  const zero = again.variants.find((v) => v.label === OPTION_0)!;
  applyOps(pupOptionOps(entry(), again.root, again.pack, zero, { chosen: 'user' }), { trashDir: `${trashDir}-3` });
  assert.equal(tablePupPacks(entry(), BORNE)[0]!.applied?.label, OPTION_0);
  assert.ok(fs.existsSync(path.join(root, 'PuPDesktopPunch.exe')));
  for (const dir of [tablesDir, trashDir, `${trashDir}-2`, `${trashDir}-3`]) fs.rmSync(dir, { recursive: true, force: true });
});

test('médecin : option retenue différente de celle en place, ou en place à moitié ; réparée avant la partie', () => {
  const ctx = (tablesDir: string) => ({ tablesDir, script: scriptFacts(SCRIPT), cabinet: BORNE });
  // Choisie dans la fiche (option 2), fichiers de l'option 0 : réappliquée.
  {
    const { tablesDir, infoFile } = gotgTable(0, { option: OPTION_2, chosen: 'user' });
    const entry = () => scanTables(tablesDir)[0]!;
    const finding = diagnose(entry(), ctx(tablesDir)).find((f) => f.code === 'pupOptionMismatch')!;
    assert.ok(finding, 'constat attendu');
    assert.equal(finding.severity, 'warning');
    assert.match(finding.detail, /« Option 2 - 3 Screen FullDMD » est l’option retenue \(choisie dans la fiche\), mais les fichiers en place sont ceux de « Option 0 - 3 Screen Desktop »/);
    assert.equal(finding.fix?.label, `Réappliquer « ${OPTION_2} »`);
    const trashDir = `${tablesDir}-corbeille`;
    const done = repairPupForPlay(entry(), ctx(tablesDir), { trashDir });
    assert.deepEqual(done.map((f) => f.code), ['pupOptionMismatch']);
    assert.equal(tablePupPacks(entry(), BORNE)[0]!.applied?.label, OPTION_2);
    assert.deepEqual(pupMemory(readInfo(infoFile), 'gotg_2020'), { option: OPTION_2, chosen: 'user' });
    assert.ok(!diagnose(entry(), ctx(tablesDir)).some((f) => f.code.startsWith('pupOption')));
    for (const dir of [tablesDir, trashDir]) fs.rmSync(dir, { recursive: true, force: true });
  }
  // Retenue d'office à l'installation (option 2), l'option 0 lancée à la main depuis : la mémoire suit les fichiers.
  {
    const { tablesDir, infoFile } = gotgTable(0, { option: OPTION_2, origin: 'gotg_2020' });
    const entry = () => scanTables(tablesDir)[0]!;
    const finding = diagnose(entry(), ctx(tablesDir)).find((f) => f.code === 'pupOptionMismatch')!;
    assert.equal(finding.severity, 'info');
    assert.equal(finding.fix?.label, `Retenir « ${OPTION_0} », l’option en place`);
    const trashDir = `${tablesDir}-corbeille`;
    applyOps(finding.fix!.ops, { trashDir });
    assert.equal(pupMemory(readInfo(infoFile), 'gotg_2020')?.option, OPTION_0);
    assert.ok(!diagnose(entry(), ctx(tablesDir)).some((f) => f.code === 'pupOptionMismatch'));
    for (const dir of [tablesDir, trashDir]) fs.rmSync(dir, { recursive: true, force: true });
  }
  // Option 2 à moitié en place (PuPInit.bat du bureau resté là) : incomplète, réappliquée.
  {
    const { tablesDir, root } = gotgTable(2, { option: OPTION_2, chosen: 'user' });
    fs.writeFileSync(path.join(root, 'PuPInit.bat'), 'start PuPDesktopPunch.exe');
    const entry = () => scanTables(tablesDir)[0]!;
    const [pack] = tablePupPacks(entry(), BORNE);
    assert.equal(pack!.applied?.label, OPTION_2);
    assert.deepEqual(pack!.incomplete, ['PuPInit.bat encore là (l’option le supprime)']);
    const finding = diagnose(entry(), ctx(tablesDir)).find((f) => f.code === 'pupOptionMismatch')!;
    assert.equal(finding.title, 'Option du PuP-Pack incomplète');
    const trashDir = `${tablesDir}-corbeille`;
    applyOps(finding.fix!.ops, { trashDir });
    assert.ok(!fs.existsSync(path.join(root, 'PuPInit.bat')));
    assert.equal(tablePupPacks(entry(), BORNE)[0]!.incomplete, undefined);
    for (const dir of [tablesDir, trashDir]) fs.rmSync(dir, { recursive: true, force: true });
  }
  // État cohérent (celui de la borne du signalement) : rien à dire.
  {
    const { tablesDir } = gotgTable(2, { option: OPTION_2, chosen: 'user' });
    assert.ok(!diagnose(scanTables(tablesDir)[0]!, ctx(tablesDir)).some((f) => f.code.startsWith('pupOption')));
    fs.rmSync(tablesDir, { recursive: true });
  }
});

test('après « Appliquer » : la réussite relue sur le disque ; un fichier manquant arrête tout avant de commencer', () => {
  const root = tmp();
  gotgPack(root, 2);
  const info = analysePack(root);
  assert.deepEqual(checkAppliedOption(root, OPTION_2), { ok: true });
  // Copie partie de travers (outil du bureau revenu, ou supprimé à la main) : l'échec dit pourquoi.
  fs.writeFileSync(path.join(root, 'PuPInit.bat'), 'start PuPDesktopPunch.exe');
  assert.deepEqual(checkAppliedOption(root, OPTION_2), { ok: false, reasons: ['PuPInit.bat encore là (l’option le supprime)'] });
  const zero = checkAppliedOption(root, OPTION_0);
  assert.equal(zero.ok, false);
  assert.ok(!zero.ok && zero.reasons.includes('PuPDesktopPunch.exe absent'));
  // Pack incomplet : la source manque, l'option n'est pas appliquée du tout.
  const three = info.variants.find((v) => v.label === 'Option 3 - 2 Screen 5x4')!;
  assert.deepEqual(missingSources(root, three), []);
  fs.rmSync(path.join(root, 'PuP-Pack_Options', 'Option 3 - 2 Screen 5x4', 'triggers.pup'));
  assert.deepEqual(missingSources(root, three), [path.join('PuP-Pack_Options', 'Option 3 - 2 Screen 5x4', 'triggers.pup')]);
  fs.rmSync(root, { recursive: true });
});

test('options aux fichiers identiques : signalées jumelles, celle retenue dans le .info l’emporte', () => {
  const root = tmp();
  for (const name of ['Option 1 - Cabinet', 'Option 2 - Cabinet copy of 1']) {
    fs.mkdirSync(path.join(root, 'PuP-Pack_Options', name), { recursive: true });
    fs.writeFileSync(path.join(root, 'PuP-Pack_Options', name, 'screens.pup'), 'ScreenNum\r\n2,Backglass,,,0,ForceBack,,\r\n');
  }
  fs.copyFileSync(path.join(root, 'PuP-Pack_Options', 'Option 1 - Cabinet', 'screens.pup'), path.join(root, 'screens.pup'));
  const info = analysePack(root);
  const first = appliedOption(info);
  assert.deepEqual([first?.variant.label, first?.twins.map((v) => v.label)], ['Option 1 - Cabinet', ['Option 2 - Cabinet copy of 1']]);
  assert.equal(appliedOption(info, 'option 2 - cabinet copy of 1')?.variant.label, 'Option 2 - Cabinet copy of 1');
  fs.rmSync(root, { recursive: true });
});
