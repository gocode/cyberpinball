// PuP-Pack désactivé, table par table (demande du 06/11/2026 : « retrouver la table dans sa
// situation la plus basique », sans PuP-Pack, puis pouvoir le remettre). Ces tests fixent
// l'invariant : un pack désactivé quitte pupvideos d'un seul renommage, la table se joue
// comme s'il n'était pas installé (aucun mécanisme ne le réclame, ne le rallume ni ne le
// relance), et la réactivation rend l'état d'avant à l'octet près, .vbs de Cyber Pinball compris.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import realFs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { mock, test } from 'node:test';
import { diagnose, pupPlayRepairs, repairPupForPlay, scriptFacts, tableDisabledPacks, type DoctorContext } from '../doctor';
import { shareableTableFiles } from '../friendlibrary';
import { installedParts } from '../gameparts';
import { planJourney } from '../journey';
import {
  activePacks,
  disabledPacks,
  disablePupPacks,
  enablePupPacks,
  globalPackCopies,
  isPupFolderName,
  PUP_DISABLED_FOLDER,
  tablePupSwitch,
} from '../pupdisabled';
import { readScriptPatch } from '../scriptpatch';
import { tableContents } from '../tablecontents';
import { folderChanges, folderPrint } from '../tabledouble';
import { inventory } from '../tablefiles';
import { applyImport, planImport } from '../tableimport';
import { scanTables, type TableEntry } from '../tables';
import { REPO_ROOT } from './i18n-scan';
import { vpxWithScript } from './fixtures';

const TABLE = 'Attack from Mars (Bally 1995)';
const ROM_SCRIPT = 'Const cGameName="afm_113b"\r\nLoadVPM "01560000", "WPC.VBS", 3.26\r\nController.GameName = cGameName\r\n';
/** Table à ROM dont le script lance le pack sous le nom de la ROM. */
const PUP_SCRIPT = `${ROM_SCRIPT}Set PuPlayer = CreateObject("PinUpPlayer.PinDisplay")\r\nPuPlayer.B2SInit "", cGameName\r\n`;
/** Même table, script qui coupe le pack et appelle vpmInit deux fois (core.vbs de VPX 10.8). */
const PUP_OFF_COMPAT_SCRIPT = `${ROM_SCRIPT}usePUP = False\r\nIf usePUP = True Then\r\n  Set PuPlayer = CreateObject("PinUpPlayer.PinDisplay")\r\n  PuPlayer.B2SInit "", cGameName\r\nEnd If\r\nSub Table1_Init\r\n  vpmInit Me\r\n  vpmInit Me\r\nEnd Sub\r\n`;
/** 2001 : A Space Odyssey (Original 2025), raccourci : pas de ROM, « usePUP = False », musique jouée seulement sans PuP. */
const SCRIPT_2001 = [
  'Option Explicit',
  "Dim usePUP: Dim cPuPPack: Dim PuPlayer: Dim PUPStatus: PUPStatus=false ' dont edit this line!!!",
  "usePUP   = False            ' enable Pinup Player functions for this table",
  'cPuPPack = "HAL9000"    \' name of the PuP-Pack / PuPVideos folder for this table',
  'Sub PuPStart(cPuPPack)',
  '    If PUPStatus=true then Exit Sub',
  '    If usePUP=true then',
  '        Set PuPlayer = CreateObject("PinUpPlayer.PinDisplay")',
  '        PuPlayer.B2SInit "",cPuPPack \'start the Pup-Pack',
  '        PUPStatus=true',
  '    End If',
  'End Sub',
  'PuPStart(cPuPPack)',
  'if usepup = false then',
  'PlaySound "2001_music", -1',
  'end if',
  '',
].join('\r\n');
const SCREENS = 'ScreenNum,ScreenDes,PlayList,PlayFile,Loopit,Active,Priority,CustomPos\r\n2,Backglass,Backglass,attract.mp4,1,ForceBack,,\r\n';

function write(file: string, content: string | Buffer = ''): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

/** Table à ROM installée dans son dossier, avec son pack rangé et son option retenue dans le .info. */
function romTable(tablesDir: string, script = PUP_SCRIPT): string {
  const folder = path.join(tablesDir, TABLE);
  write(path.join(folder, `${TABLE}.vpx`), vpxWithScript(script));
  write(path.join(folder, `${TABLE}.directb2s`), 'b2s');
  write(path.join(folder, 'pinmame', 'roms', 'afm_113b.zip'), 'rom');
  write(path.join(folder, `${TABLE}.info`), JSON.stringify({ CyberPinball: { pup: { afm_113b: { option: 'Option 1' } } } }, null, 2));
  const pack = path.join(folder, 'pupvideos', 'afm_113b');
  write(path.join(pack, 'screens.pup'), SCREENS);
  write(path.join(pack, 'triggers.pup'), 'ID,Active,Descript,Trigger,ScreenNum,PlayList\r\n');
  write(path.join(pack, 'Backglass', 'attract.mp4'), Buffer.from('vidéo du fronton'));
  write(path.join(pack, 'FONTS', 'police.ttf'), Buffer.from([0, 1, 2, 3]));
  return folder;
}

/** Session de la table dans vpinball.log, sans « PUP path » : aucun pack chargé à la dernière partie. */
function logWithoutPack(vpx: string): string {
  return [
    `2026-11-06 20:00:00.000 INFO  [Main] [PinTable::LoadGameFromFilename@1419] LoadGameFromFilename ${vpx}`,
    '2026-11-06 20:00:01.000 INFO  [Main] [MsgPI::MsgPlugin::Load@520] Plugin PUP loaded (library: plugin-pup64.dll) [id=13]',
    '2026-11-06 20:00:02.000 INFO  [Main] [Player::Player@727] Starting script',
    '2026-11-06 20:00:03.000 INFO  [Main] [Player::Player@832] Startup done',
  ].join('\r\n');
}

const entryOf = (tablesDir: string, base = TABLE): TableEntry => scanTables(tablesDir).find((e) => path.basename(e.file) === `${base}.vpx`)!;
/** Constats du PuP-Pack et du script (les autres règles du médecin ne regardent pas le pack). */
const pupCodes = (entry: TableEntry, ctx: DoctorContext) =>
  diagnose(entry, ctx)
    .map((f) => f.code)
    .filter((c) => c.startsWith('pup') || c.startsWith('script'))
    .sort();
/** Le dossier, sans le .vbs de Cyber Pinball (réécrit, donc d'une autre date ; son contenu est comparé à part). */
const printOf = (folder: string) => new Map([...folderPrint(folder, { full: true })].filter(([rel]) => !rel.toLowerCase().endsWith('.vbs')));

test('aller-retour : désactivé, la table est une table sans pack pour tous ; réactivé, tout revient à l’identique', () => {
  const tablesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-pupoff-'));
  const folder = romTable(tablesDir);
  const trashDir = `${tablesDir}-corbeille`;
  const vpx = path.join(folder, `${TABLE}.vpx`);
  const ctx: DoctorContext = { tablesDir, script: scriptFacts(PUP_SCRIPT), vpxLog: logWithoutPack(vpx) };
  const before = printOf(folder);
  const findingsBefore = pupCodes(entryOf(tablesDir), ctx);

  const done = disablePupPacks(folder, ['AFM_113B'], { trashDir });
  assert.deepEqual(done, { moved: ['afm_113b'], skipped: [] });
  assert.ok(!fs.existsSync(path.join(folder, 'pupvideos')), 'pupvideos vidé est retiré : le plugin ne trouve rien');
  assert.ok(fs.existsSync(path.join(folder, PUP_DISABLED_FOLDER, 'afm_113b', 'Backglass', 'attract.mp4')));
  assert.deepEqual(activePacks(folder), []);
  assert.deepEqual(disabledPacks(folder), ['afm_113b']);

  // Médecin : l'état, rien de réclamé (ni « introuvable », ni journal « pack non chargé »), rien à réparer avant la partie.
  const entry = entryOf(tablesDir);
  const found = diagnose(entry, ctx);
  assert.deepEqual(pupCodes(entry, ctx), ['pupPackDisabled']);
  assert.ok(found.every((f) => f.code === 'pupPackDisabled' || !f.detail.includes(PUP_DISABLED_FOLDER)), 'aucune autre règle ne voit le dossier des packs désactivés');
  assert.equal(found.find((f) => f.code === 'pupPackDisabled')!.severity, 'info');
  assert.deepEqual(pupPlayRepairs(entry, ctx), []);
  assert.deepEqual(repairPupForPlay(entry, ctx, { trashDir }), []);
  assert.deepEqual(tableDisabledPacks(entry, scriptFacts(PUP_SCRIPT)), ['afm_113b']);

  // Parcours « Ce qu'il manque pour jouer » : fait, rien à récupérer.
  const journey = planJourney({ file: entry.file, vpxInstalled: true, cabinetConfigured: true, screens: { backglass: true, dmd: 'small', topper: false }, script: scriptFacts(PUP_SCRIPT), findings: found, seen: ['pup'] });
  const step = journey.extras.find((s) => s.id === 'pup')!;
  assert.equal(step.state, 'done');
  assert.match(step.detail, /^Désactivé/);
  assert.deepEqual(step.choices, []);

  // Inventaire : à la table, désactivé, sans avertissement (ni « hors de pupvideos », ni « autre dossier »).
  const contents = tableContents(entry.file, { ownFolder: true });
  const off = contents.entries.filter((e) => e.disabled);
  assert.deepEqual(off.map((e) => [e.kind, e.state, e.rel]), [['pup', 'quiet', path.join(PUP_DISABLED_FOLDER, 'afm_113b')]]);
  assert.equal(contents.problems, 0);
  assert.equal(installedParts(contents).get('pup')?.disabled, true);
  // Partage entre amis : un pack qui ne se joue pas ici ne part pas.
  assert.ok(shareableTableFiles(contents, folder).every((f) => f.part !== 'pup' && !f.rel.startsWith(PUP_DISABLED_FOLDER)));

  // Réactivé : le dossier est celui d'avant, fichier pour fichier (contenu, taille, date), .info compris.
  assert.deepEqual(enablePupPacks(folder, ['afm_113b']), { moved: ['afm_113b'], skipped: [] });
  assert.ok(!fs.existsSync(path.join(folder, PUP_DISABLED_FOLDER)), 'le dossier des packs désactivés, vidé, est retiré');
  assert.deepEqual(folderChanges(before, printOf(folder)), []);
  assert.deepEqual(pupCodes(entryOf(tablesDir), ctx), findingsBefore);
  fs.rmSync(tablesDir, { recursive: true });
  fs.rmSync(trashDir, { recursive: true, force: true });
});

test('2001 : le .vbs qui allume le pack est retiré à la désactivation (même après un arrêt entre deux), refait à l’identique à la réactivation', () => {
  const tablesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-pupoff2001-'));
  const folder = path.join(tablesDir, '2001 - A Space Odyssey (Original 2025)');
  write(path.join(folder, '2001_SpaceOdyssey_v1.0.2.vpx'), vpxWithScript(SCRIPT_2001));
  write(path.join(folder, 'pupvideos', 'HAL9000', 'screens.pup'), SCREENS);
  const trashDir = `${tablesDir}-corbeille`;
  const entry = () => scanTables(tablesDir)[0]!;
  const ctx: DoctorContext = { tablesDir, script: scriptFacts(SCRIPT_2001) };
  const vbs = path.join(folder, '2001_SpaceOdyssey_v1.0.2.vbs');

  // Avant chaque partie, le médecin allume le pack (usePUP = True) dans le .vbs de Cyber Pinball.
  assert.deepEqual(repairPupForPlay(entry(), ctx, { trashDir }).map((f) => f.code), ['pupDisabledByScript']);
  const lit = fs.readFileSync(vbs);
  assert.match(lit.toString('latin1'), /usePUP {3}= True/);

  // Désactivé, puis l'application s'arrête avant d'avoir remis le script : l'état reste cohérent.
  disablePupPacks(folder, ['HAL9000'], { trashDir });
  const pending = diagnose(entry(), ctx);
  assert.deepEqual(pupCodes(entry(), ctx), ['pupPackDisabled', 'pupPackDisabledScript']);
  assert.ok(!pending.some((f) => f.code === 'pupDisabledByScript' || f.code === 'pupMissing' || f.code === 'scriptPatchStale'));
  // Au redémarrage, la préparation de la partie remet le script de la table : 2001 rejoue sa musique.
  assert.deepEqual(repairPupForPlay(entry(), ctx, { trashDir }).map((f) => f.code), ['pupPackDisabledScript']);
  assert.ok(!fs.existsSync(vbs), 'sans pack, VPX joue le script de la table tel quel');
  assert.equal(inventory(entry().file, true).scriptPatched, undefined);
  assert.deepEqual(pupCodes(entry(), ctx), ['pupPackDisabled']);
  // Et rien ne le rallume, partie après partie.
  assert.deepEqual(repairPupForPlay(entry(), ctx, { trashDir }), []);

  // Réactivé : le .vbs est refait octet pour octet.
  enablePupPacks(folder, ['HAL9000']);
  repairPupForPlay(entry(), ctx, { trashDir });
  assert.deepEqual(fs.readFileSync(vbs), lit);
  assert.deepEqual(pupCodes(entry(), ctx), []);
  fs.rmSync(tablesDir, { recursive: true });
  fs.rmSync(trashDir, { recursive: true, force: true });
});

test('désactivé : les correctifs du core.vbs restent dans le .vbs, seul le PuP en sort ; réactivé, le .vbs est celui d’avant', () => {
  const tablesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-pupoffcompat-'));
  const folder = romTable(tablesDir, PUP_OFF_COMPAT_SCRIPT);
  const trashDir = `${tablesDir}-corbeille`;
  const ctx: DoctorContext = { tablesDir, script: scriptFacts(PUP_OFF_COMPAT_SCRIPT) };
  const vbs = path.join(folder, `${TABLE}.vbs`);
  repairPupForPlay(entryOf(tablesDir), ctx, { trashDir });
  const before = fs.readFileSync(vbs);
  const patch = readScriptPatch(before.toString('latin1'))!;
  assert.equal(patch.switches.length, 1);
  assert.ok(patch.compat?.length);

  disablePupPacks(folder, ['afm_113b'], { trashDir });
  repairPupForPlay(entryOf(tablesDir), ctx, { trashDir });
  const without = fs.readFileSync(vbs, 'latin1');
  assert.deepEqual(readScriptPatch(without)?.switches, []);
  assert.deepEqual(readScriptPatch(without)?.compat, patch.compat);
  assert.match(without, /^usePUP = False\r$/m);

  enablePupPacks(folder, ['afm_113b']);
  repairPupForPlay(entryOf(tablesDir), ctx, { trashDir });
  assert.deepEqual(fs.readFileSync(vbs), before);
  fs.rmSync(tablesDir, { recursive: true });
  fs.rmSync(trashDir, { recursive: true, force: true });
});

test('pack partagé : les autres versions du dossier qui le chargent sont nommées, et se jouent aussi sans lui', () => {
  const tablesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-pupoffshared-'));
  const folder = romTable(tablesDir);
  write(path.join(folder, 'Attack from Mars VPW.vpx'), vpxWithScript(PUP_SCRIPT));
  write(path.join(folder, 'Attack from Mars Mod.vpx'), vpxWithScript(PUP_SCRIPT));
  const others = [
    { file: path.join(folder, 'Attack from Mars VPW.vpx'), title: 'VPW', expected: ['afm_113b'] },
    { file: path.join(folder, 'Attack from Mars Mod.vpx'), title: 'Mod', expected: ['autre_pack'] },
    { file: path.join(folder, 'Attack from Mars Old.vpx'), title: 'Old', expected: undefined },
  ];
  const sw = tablePupSwitch(folder, ['afm_113b'], others);
  assert.deepEqual(sw.active, ['afm_113b']);
  // VPW charge le même pack ; Old, script pas lu : peut-être. Mod en charge un autre.
  assert.deepEqual(sw.shared.map((o) => o.title), ['VPW', 'Old']);

  const trashDir = `${tablesDir}-corbeille`;
  disablePupPacks(folder, sw.active, { trashDir });
  const ctx: DoctorContext = { tablesDir, script: scriptFacts(PUP_SCRIPT), otherPackNames: ['afm_113b', 'afm_113b'] };
  for (const base of [TABLE, 'Attack from Mars VPW']) {
    assert.deepEqual(pupCodes(entryOf(tablesDir, base), ctx), ['pupPackDisabled'], base);
  }
  // Désactivé d'une version, il se réactive de l'autre.
  assert.deepEqual(tablePupSwitch(folder, ['afm_113b'], others.slice(1)).disabled, ['afm_113b']);
  // Une version qui charge son propre pack, actif, ne voit rien de désactivé ni d'orphelin.
  write(path.join(folder, 'pupvideos', 'autre_pack', 'screens.pup'), SCREENS);
  const mod = entryOf(tablesDir, 'Attack from Mars Mod');
  const modScript = scriptFacts(PUP_SCRIPT.replace('PuPlayer.B2SInit "", cGameName', 'PuPlayer.B2SInit "", "autre_pack"'));
  assert.deepEqual(tableDisabledPacks(mod, modScript), []);
  assert.ok(!diagnose(mod, { tablesDir, script: modScript, otherPackNames: ['afm_113b'] }).some((f) => f.code === 'pupOrphan' || f.code === 'pupMissing' || f.code === 'pupPackDisabled'));
  fs.rmSync(tablesDir, { recursive: true });
  fs.rmSync(trashDir, { recursive: true, force: true });
});

test('un renommage qui échoue (fichier ouvert) défait les précédents : rien n’est à moitié désactivé', () => {
  const tablesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-pupoffrollback-'));
  const folder = romTable(tablesDir);
  write(path.join(folder, 'pupvideos', 'afm_113b_topper', 'screens.pup'), SCREENS);
  const before = printOf(folder);
  const original = realFs.renameSync;
  // Le second pack reste verrouillé, même après les nouveaux essais de renameWithRetry.
  const rename = mock.method(realFs, 'renameSync', (from: fs.PathLike, to: fs.PathLike) => {
    if (String(from).endsWith('afm_113b_topper')) throw Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' });
    return original(from, to);
  });
  try {
    assert.throws(() => disablePupPacks(folder, ['afm_113b', 'afm_113b_topper'], { trashDir: `${tablesDir}-corbeille` }), /rien n’a changé/);
  } finally {
    rename.mock.restore();
  }
  assert.deepEqual(activePacks(folder).sort(), ['afm_113b', 'afm_113b_topper']);
  assert.deepEqual(disabledPacks(folder), []);
  assert.deepEqual(folderChanges(before, printOf(folder)), []);
  fs.rmSync(tablesDir, { recursive: true });
});

test('copies en double : le pack actif l’emporte ; une réactivation ne l’écrase jamais, une désactivation remplace l’ancienne copie', () => {
  const tablesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-pupofftwins-'));
  const folder = romTable(tablesDir);
  const trashDir = `${tablesDir}-corbeille`;
  write(path.join(folder, PUP_DISABLED_FOLDER, 'afm_113b', 'screens.pup'), 'ancienne copie');
  assert.deepEqual(disabledPacks(folder), [], 'le pack actif du même nom l’emporte : rien n’est désactivé');
  assert.deepEqual(tableDisabledPacks(entryOf(tablesDir), scriptFacts(PUP_SCRIPT)), []);
  const skipped = enablePupPacks(folder, ['afm_113b']);
  assert.deepEqual(skipped.moved, []);
  assert.match(skipped.skipped[0]!.reason, /déjà dans pupvideos/);
  assert.equal(fs.readFileSync(path.join(folder, 'pupvideos', 'afm_113b', 'screens.pup'), 'utf8'), SCREENS);
  disablePupPacks(folder, ['afm_113b'], { trashDir });
  assert.equal(fs.readFileSync(path.join(folder, PUP_DISABLED_FOLDER, 'afm_113b', 'screens.pup'), 'utf8'), SCREENS);
  assert.ok(fs.readdirSync(trashDir, { recursive: true }).some((f) => String(f).endsWith('screens.pup')), 'l’ancienne copie est à la corbeille');
  fs.rmSync(tablesDir, { recursive: true });
  fs.rmSync(trashDir, { recursive: true, force: true });
});

test('import : la mise à jour d’un pack désactivé se range avec lui, sans rien rallumer', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-pupoffimport-'));
  const tablesDir = path.join(root, 'tables');
  const folder = path.join(tablesDir, '2001 - A Space Odyssey (Original 2025)');
  const installed = path.join(folder, '2001_SpaceOdyssey_v1.0.2.vpx');
  write(installed, vpxWithScript(SCRIPT_2001));
  write(path.join(folder, PUP_DISABLED_FOLDER, 'HAL9000', 'screens.pup'), 'ancien');
  const pack = path.join(root, 'staging', 'HAL9000');
  write(path.join(pack, 'screens.pup'), SCREENS);
  const plan = planImport([{ path: pack, mode: 'copy' }], {
    tablesDir,
    existing: [{ folder, title: '2001 - A Space Odyssey', roms: [], pupNames: ['HAL9000'], pupOff: [installed] }],
  });
  const t = plan.tables.find((x) => x.steps.length)!;
  assert.deepEqual(t.steps.map((s) => s.target), [path.join(PUP_DISABLED_FOLDER, 'HAL9000')]);
  assert.equal(t.steps[0]!.pack?.disabled, true);
  assert.deepEqual(t.scripts, [], 'aucun .vbs pour allumer un pack désactivé');
  applyImport(t, { trashDir: path.join(root, 'trash'), cleanupRoots: [] });
  assert.equal(fs.readFileSync(path.join(folder, PUP_DISABLED_FOLDER, 'HAL9000', 'screens.pup'), 'utf8'), SCREENS);
  assert.ok(!fs.existsSync(path.join(folder, 'pupvideos')));
  assert.deepEqual(pupCodes(scanTables(tablesDir)[0]!, { tablesDir, script: scriptFacts(SCRIPT_2001) }), ['pupPackDisabled']);
  fs.rmSync(root, { recursive: true });
});

test('dossier PinUP Player de VPX ([Plugin.PUP] PUPFolder) : la copie que le plugin chargerait encore est trouvée', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-pupoffglobal-'));
  write(path.join(root, 'PinUPSystem', 'PUPVideos', 'AFM_113B', 'screens.pup'), SCREENS);
  assert.deepEqual(globalPackCopies(path.join(root, 'PinUPSystem'), ['afm_113b']), [path.join(root, 'PinUPSystem', 'PUPVideos', 'AFM_113B')]);
  assert.deepEqual(globalPackCopies('', ['afm_113b']), []);
  assert.deepEqual(globalPackCopies(path.join(root, 'PinUPSystem'), ['autre']), []);
  fs.rmSync(root, { recursive: true });
});

test('invariant : le dossier pupvideos d’une table n’est nommé que dans pupdisabled.ts, qui connaît les packs désactivés', () => {
  // Tout code qui liste les packs d'une table, ou qui saute les dossiers de PuP-Packs en parcourant
  // une table, passe par PUP_FOLDER, pupVideosDir ou isPupFolderName : un nouveau parcours qui
  // écrirait « 'pupvideos' » en dur prendrait le dossier des packs désactivés pour des médias, un
  // pack égaré ou un dossier inconnu, et le proposerait au rangement ou au partage.
  const offenders: string[] = [];
  const walk = (dir: string): void => {
    for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, d.name);
      if (d.isDirectory()) {
        if (!['test', 'i18n', 'node_modules', 'dist'].includes(d.name)) walk(p);
      } else if (/\.(ts|mjs|js)$/.test(d.name) && d.name !== 'pupdisabled.ts') {
        fs.readFileSync(p, 'utf8')
          .split(/\r?\n/)
          .forEach((line, i) => {
            if (/['"`]pupvideos['"`]/i.test(line)) offenders.push(`${path.relative(REPO_ROOT, p)}:${i + 1}`);
          });
      }
    }
  };
  for (const dir of ['packages/core/src', 'packages/installer/src', 'packages/win-displays/src', 'app/src']) walk(path.join(REPO_ROOT, dir));
  assert.deepEqual(offenders, []);
  assert.ok(isPupFolderName('PUPVideos') && isPupFolderName(PUP_DISABLED_FOLDER.toUpperCase()) && !isPupFolderName('medias'));
  // ASCII : nom choisi quand fs.cpSync de Node 22 abîmait les chemins accentués, déjà sur les bornes (copytree.ts).
  assert.match(PUP_DISABLED_FOLDER, /^[\x20-\x7e]+$/);
});
