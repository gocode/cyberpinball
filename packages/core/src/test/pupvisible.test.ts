// PuP-Pack qu'on entend sans le voir (27 octobre 2026). The Goonies Never Say Die Pinball
// (VPW 2021) était bien rangé dans pupvideos\TheGoonies, son option faite pour la borne, le
// plugin PUP actif ; vpinball.log disait « Plugin PUP loaded », jamais « PUP path » : la table
// ne lance pas son pack. Son script livre « Const enablePupPack = False », puis
// « HasPup = enablePupPack » : l'interrupteur passe par une autre variable, que le médecin ne
// suivait pas. La PuP-DMD a le sien (« enablePupDMD ») ; éteinte, l'écran DMD du pack ne
// montre que son cadre, par-dessus le DMD de la table. Ce qu'on entendait : la musique de la
// table. Sur le même poste, le fronton et le DMD étaient deux écrans « PL2294H » : VPX 10.8.1
// les confond et ouvre ses deux fenêtres sur le premier.
// Invariants : un pack installé dont le script coupe le lancement ou la PuP-DMD est signalé,
// allumé avant la partie et à l'installation ; la santé de la borne dit, pour chaque PuP-Pack,
// pourquoi il ne se verra pas ; aucune fenêtre de Cyber Pinball ne reste au-dessus de VPX
// pendant la partie.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { diagnose, repairPupForPlay, scriptFacts, tablePupPacks, type DoctorContext } from '../doctor';
import { applyOps } from '../fileops';
import { fingerprintOf } from '../fingerprint';
import { healthLines, homonymousRoles, pupFacts, pupLines, PUP_HEALTH_FINDINGS, type HealthFacts } from '../health';
import type { ObservedDisplay, PhysicalScreen } from '../model';
import { pupDmdSwitch, pupScriptSwitch, pupSwitchesToEnable, type PupCabinet } from '../puppack';
import { buildScriptPatch, readScriptPatch } from '../scriptpatch';
import { applyImport, planImport } from '../tableimport';
import { scanTables } from '../tables';
import { scriptCode } from '../vbscript';
import { vpxWithScript } from './fixtures';

/** Script des Goonies réduit à ce qui compte : noms, valeurs et structure d'origine. */
const GOONIES = [
  'Option Explicit',
  "'*******************************************",
  "'  User Options",
  "'*******************************************",
  "' These will not be in the Tweak (F12) menu",
  'Const enablePupPack\t\t= False',
  "Const enablePupDMD      = False ' Enable PupPack must be true if this is set to true",
  'Const enableFlexDmd\t\t= True ',
  'Dim pGameName       : pGameName="TheGoonies"  \'pupvideos foldername, probably set to cGameName in realworld',
  'Sub Table1_Init',
  '\tIf HasPup Then',
  "\t\tPuPInit  'Initialize PUPSystem AFTER you init B2s if applicable",
  '\tEnd If',
  '\tif enableFlexDMD Then',
  '\t\tFlexDMDInit',
  '\tEnd If',
  'End Sub',
  'Dim HasPuP : HasPup = enablePupPack',
  'Dim PuPlayer',
  'Sub PuPInit',
  '\tSet PuPlayer = CreateObject("PinUpPlayer.PinDisplay")   ',
  '\tPuPlayer.B2SInit "", pGameName',
  '\tif enablePupDMD then',
  '\t\tPuPlayer.LabelInit pDMD',
  '\telse',
  '\t\tPuPlayer.SendMsg "{ ""mt"":301, ""SN"": 1, ""FN"":12}"',
  '\tend if',
  'End Sub',
  'Sub FlexDMDInit',
  'End Sub',
  '',
].join('\r\n');

const HEADER = 'ScreenNum,ScreenDes,PlayList,PlayFile,Loopit,Active,Priority,CustomPos';
/** Option « Option 5 - BG DMD No Topper » des Goonies : le cadre PuPFrames sur l'écran DMD. */
const SCREENS_DMD = [HEADER, '0,Topper,,,0,off,,', '1,DMD,PuPFrames,default.png,0,ForceBack,,', '2,Backglass,,,0,ForceBack,,', '3,PlayField,,,0,off,,', '4,Music,,,0,MusicOnly,80,', '13,Overlay,,,0,ForceOn,,"2,0,0,100,100,4"', ''].join('\r\n');
/** Une option sans écran DMD : le pack laisse la fenêtre du DMD à la table. */
const SCREENS_BG = SCREENS_DMD.replace('1,DMD,PuPFrames,default.png,0,ForceBack,,', '1,DMD,,,0,off,,');

const CABINET: PupCabinet = { backglass: true, dmd: true, topper: false, fullDmd: true, tableBackglass: true };

const VPX = 'The Goonies Never Say Die Pinball (VPW 2021) 1.5.vpx';

/** Table des Goonies installée, son pack rangé avec l'option `screens`. */
function goonies(tablesDir: string, screens = SCREENS_DMD): string {
  const folder = path.join(tablesDir, 'The Goonies Never Say Die Pinball (VPW 2021)');
  const pack = path.join(folder, 'pupvideos', 'TheGoonies');
  fs.mkdirSync(path.join(pack, 'PuPFrames'), { recursive: true });
  fs.writeFileSync(path.join(pack, 'screens.pup'), screens);
  fs.writeFileSync(path.join(pack, 'playlists.pup'), 'ScreenNum,Folder,Des,AlphaSort,RestSeconds,Volume,Priority\r\n1,PuPFrames,,0,0,100,1\r\n');
  fs.writeFileSync(path.join(pack, 'PuPFrames', 'default.png'), 'png');
  fs.writeFileSync(path.join(folder, VPX), vpxWithScript(GOONIES));
  return folder;
}

const code = scriptCode(GOONIES);

test('Goonies : l’interrupteur relayé par HasPup est retrouvé, la PuP-DMD a le sien', () => {
  assert.deepEqual(pupScriptSwitch(code), { variable: 'enablePupPack', value: 'False', enable: 'True', line: 5 });
  assert.deepEqual(pupDmdSwitch(code), { variable: 'enablePupDMD', value: 'False', enable: 'True', line: 6, kind: 'dmd' });
  const facts = scriptFacts(GOONIES);
  assert.deepEqual(facts.pup?.packNames, ['TheGoonies']);
  assert.equal(facts.pup?.disabledBy?.variable, 'enablePupPack');
  assert.equal(facts.pup?.dmdDisabledBy?.variable, 'enablePupDMD');
  // La PuP-DMD ne s'allume que si le pack occupe la fenêtre du DMD.
  assert.deepEqual(pupSwitchesToEnable(code, false).map((s) => s.variable), ['enablePupPack']);
  assert.deepEqual(pupSwitchesToEnable(code, true).map((s) => s.variable), ['enablePupPack', 'enablePupDMD']);
  // Pack allumé : plus rien ne l'empêche ; la PuP-DMD reste à allumer seule.
  const on = scriptCode(GOONIES.replace('enablePupPack\t\t= False', 'enablePupPack\t\t= True'));
  assert.equal(pupScriptSwitch(on), undefined);
  assert.deepEqual(pupSwitchesToEnable(on, true).map((s) => s.variable), ['enablePupDMD']);
  // Relais qu'une Sub change (réglage lu, option de la table) : on ne peut rien dire.
  const changed = scriptCode(GOONIES.replace('Sub FlexDMDInit', 'Sub FlexDMDInit\r\n\tHasPup = LoadValue("goonies", "pup")'));
  assert.equal(pupScriptSwitch(changed), undefined);
  // Deux variables qui se renvoient l'une à l'autre : pas de boucle, pas de constat.
  const loop = scriptCode(GOONIES.replace('Const enablePupPack\t\t= False', 'Dim enablePupPack : enablePupPack = HasPup'));
  assert.equal(pupScriptSwitch(loop), undefined);
});

test('Goonies : le .vbs ne change que les deux valeurs, octet pour octet', () => {
  const content = buildScriptPatch(GOONIES, pupSwitchesToEnable(code, true))!;
  const lines = content.split('\r\n');
  const original = GOONIES.split('\r\n');
  const changed = original.flatMap((l, i) => (l === lines[i] ? [] : [i]));
  // Les deux valeurs, et la ligne de Cyber Pinball ajoutée à la fin (là où était la fin du fichier).
  assert.deepEqual(changed, [5, 6, original.length - 1]);
  assert.equal(lines.length, original.length + 1);
  assert.equal(lines[5], 'Const enablePupPack\t\t= True');
  assert.equal(lines[6], "Const enablePupDMD      = True ' Enable PupPack must be true if this is set to true");
  assert.deepEqual(readScriptPatch(content)?.switches.map((s) => s.kind ?? 'pack'), ['pack', 'dmd']);
});

test('médecin : la cause est dite même avec une lecture du script gardée d’avant, la réparation allume les deux', () => {
  const tablesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-goonies-'));
  const folder = goonies(tablesDir);
  const entry = () => scanTables(tablesDir)[0]!;
  // Ce que le cache des scripts gardait : aucun interrupteur vu.
  const stale = { ...scriptFacts(GOONIES), pup: { packNames: ['TheGoonies'], playlistAdd: false, labels: true } };
  const ctx: DoctorContext = { tablesDir, script: stale, cabinet: CABINET };
  const found = diagnose(entry(), ctx).filter((f) => f.code.startsWith('pup'));
  assert.deepEqual(found.map((f) => f.code), ['pupDisabledByScript']);
  assert.match(found[0]!.detail, /enablePupPack = False/);
  assert.match(found[0]!.detail, /enablePupDMD = False/);
  assert.match(found[0]!.fix!.label, /enablePupPack = True, enablePupDMD = True/);
  const trashDir = `${tablesDir}-corbeille`;
  applyOps(found[0]!.fix!.ops, { trashDir });
  const vbs = fs.readFileSync(path.join(folder, VPX.replace(/\.vpx$/, '.vbs')), 'latin1');
  assert.match(vbs, /Const enablePupPack\t\t= True/);
  assert.match(vbs, /Const enablePupDMD {6}= True/);
  assert.ok(!diagnose(entry(), ctx).some((f) => f.code === 'pupDisabledByScript' || f.code === 'scriptOverride'));
  fs.rmSync(tablesDir, { recursive: true });
  fs.rmSync(trashDir, { recursive: true, force: true });
});

test('médecin : une option qui laisse la fenêtre du DMD n’allume que le pack ; une borne sans DMD aussi', () => {
  const tablesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-goonies-'));
  goonies(tablesDir, SCREENS_BG);
  const entry = scanTables(tablesDir)[0]!;
  const label = (cabinet: PupCabinet) => diagnose(entry, { tablesDir, script: scriptFacts(GOONIES), cabinet }).find((f) => f.code === 'pupDisabledByScript')?.fix?.label;
  assert.match(label(CABINET)!, /\(enablePupPack = True, dans /);
  fs.writeFileSync(path.join(tablesDir, 'The Goonies Never Say Die Pinball (VPW 2021)', 'pupvideos', 'TheGoonies', 'screens.pup'), SCREENS_DMD);
  assert.match(label({ ...CABINET, dmd: false })!, /\(enablePupPack = True, dans /);
  assert.match(label(CABINET)!, /enablePupDMD = True/);
  fs.rmSync(tablesDir, { recursive: true });
});

test('avant la partie : le pack des Goonies est allumé sans rien demander, puis plus rien à faire', () => {
  const tablesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-goonies-'));
  const folder = goonies(tablesDir);
  const entry = () => scanTables(tablesDir)[0]!;
  const trashDir = `${tablesDir}-corbeille`;
  const ctx = { tablesDir, cabinet: CABINET };
  assert.deepEqual(repairPupForPlay(entry(), ctx, { trashDir }).map((f) => f.code), ['pupDisabledByScript']);
  assert.ok(fs.existsSync(path.join(folder, VPX.replace(/\.vpx$/, '.vbs'))));
  assert.deepEqual(repairPupForPlay(entry(), ctx, { trashDir }), []);
  fs.rmSync(tablesDir, { recursive: true });
  fs.rmSync(trashDir, { recursive: true, force: true });
});

/** Les trois options du pack des Goonies, chacune avec son .bat, aucune appliquée. */
function gooniesOptions(pack: string): void {
  const options: Record<string, string> = {
    'Option 2 - DMD on BG': SCREENS_DMD,
    'Option 3 - BG Topper Separate': SCREENS_DMD.replace('0,Topper,,,0,off,,', '0,Topper,,,0,ForceBack,,'),
    'Option 5 - BG DMD No Topper': SCREENS_DMD,
  };
  for (const [name, screens] of Object.entries(options)) {
    const dir = path.join(pack, 'PuP-Pack_Options', name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'screens.pup'), screens);
    fs.writeFileSync(path.join(dir, 'triggers.pup'), `ID,Active,Descript
1,1,${name}
`);
    fs.writeFileSync(path.join(pack, `${name}.bat`), `rem echo off
xcopy /y "PuP-Pack_Options\${name}\*.pup"
`);
  }
}

test('disposition : l’option en place est celle des écrans de la borne, appliquée avant la partie', () => {
  for (const [cabinet, wanted] of [
    [CABINET, 'Option 5 - BG DMD No Topper'],
    [{ ...CABINET, topper: true }, 'Option 3 - BG Topper Separate'],
  ] as const) {
    const tablesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-goonies-'));
    const folder = goonies(tablesDir);
    const pack = path.join(folder, 'pupvideos', 'TheGoonies');
    for (const f of ['screens.pup', 'playlists.pup']) fs.rmSync(path.join(pack, f));
    gooniesOptions(pack);
    const entry = () => scanTables(tablesDir)[0]!;
    const trashDir = `${tablesDir}-corbeille`;
    const done = repairPupForPlay(entry(), { tablesDir, cabinet }, { trashDir }).map((f) => f.code);
    assert.ok(done.includes('pupOptionNotApplied') && done.includes('pupDisabledByScript'), done.join(', '));
    const [installed] = tablePupPacks(entry(), cabinet);
    assert.equal(installed!.applied?.label, wanted);
    assert.equal(installed!.recommended?.label, wanted);
    // L'option occupe la fenêtre du DMD : la PuP-DMD est allumée avec le pack.
    const vbs = fs.readFileSync(entry().file.replace(/\.vpx$/, '.vbs'), 'latin1');
    assert.deepEqual(readScriptPatch(vbs)?.switches.map((s) => s.variable), ['enablePupPack', 'enablePupDMD']);
    fs.rmSync(tablesDir, { recursive: true });
    fs.rmSync(trashDir, { recursive: true, force: true });
  }
});

test('import : la table des Goonies et son pack ensemble, les deux interrupteurs allumés dans un .vbs', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-importgoonies-'));
  const tablesDir = path.join(root, 'tables');
  fs.mkdirSync(tablesDir);
  const staging = path.join(root, 'staging', 'goonies');
  const vpx = path.join(staging, VPX);
  fs.mkdirSync(path.join(staging, 'TheGoonies'), { recursive: true });
  fs.writeFileSync(vpx, vpxWithScript(GOONIES));
  fs.writeFileSync(path.join(staging, 'TheGoonies', 'screens.pup'), SCREENS_DMD);
  // Lecture gardée sans interrupteur : l'import relit le script du .vpx.
  const plan = planImport([{ path: staging, label: 'goonies.zip', mode: 'copy', unpacked: true }], {
    tablesDir,
    cabinet: CABINET,
    scripts: new Map([[vpx.toLowerCase(), { ...scriptFacts(GOONIES), pup: { packNames: ['TheGoonies'], playlistAdd: false } }]]),
  });
  const t = plan.tables[0]!;
  assert.equal(t.scripts.length, 1);
  assert.ok(t.warnings.some((w) => w.includes('enablePupPack = False, enablePupDMD = False')));
  applyImport(t, { trashDir: path.join(root, 'trash'), cleanupRoots: [] });
  const entry = scanTables(tablesDir)[0]!;
  const vbs = fs.readFileSync(entry.file.replace(/\.vpx$/, '.vbs'), 'latin1');
  assert.deepEqual(readScriptPatch(vbs)?.switches.map((s) => s.variable), ['enablePupPack', 'enablePupDMD']);
  assert.ok(!diagnose(entry, { tablesDir, script: scriptFacts(GOONIES), cabinet: CABINET }).some((f) => f.code === 'pupDisabledByScript'));
  fs.rmSync(root, { recursive: true });
});

test('pack introuvable par son nom : signalé, renommé d’un geste au nom que cherche la table', () => {
  const tablesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-goonies-'));
  const folder = goonies(tablesDir);
  fs.renameSync(path.join(folder, 'pupvideos', 'TheGoonies'), path.join(folder, 'pupvideos', 'TheGoonies_v1.2'));
  const entry = () => scanTables(tablesDir)[0]!;
  const missing = diagnose(entry(), { tablesDir, script: scriptFacts(GOONIES), cabinet: CABINET }).find((f) => f.code === 'pupMissing')!;
  assert.match(missing.title, /TheGoonies/);
  const trashDir = `${tablesDir}-corbeille`;
  applyOps(missing.fix!.ops, { trashDir });
  assert.ok(fs.existsSync(path.join(folder, 'pupvideos', 'TheGoonies', 'screens.pup')));
  fs.rmSync(tablesDir, { recursive: true });
  fs.rmSync(trashDir, { recursive: true, force: true });
});

test('santé de la borne : chaque PuP-Pack qui ne se verra pas, avec sa cause, vers le médecin de sa table', () => {
  const tablesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-goonies-'));
  goonies(tablesDir);
  const entry = scanTables(tablesDir)[0]!;
  const findings = diagnose(entry, { tablesDir, script: scriptFacts(GOONIES), cabinet: CABINET });
  const facts = pupFacts(
    [
      { file: entry.file, title: 'The Goonies', hasPack: true, findings },
      { file: 'T2.vpx', title: 'Terminator 2', hasPack: false, findings: [] },
      { file: 'Matrix.vpx', title: 'The Matrix', hasPack: true, findings: [{ code: 'pupLog', severity: 'info', title: 'fonctions non prises en charge' }] },
    ],
    ['pupDisabledByScript'],
  );
  assert.equal(facts.packs, 2);
  assert.deepEqual(facts.flagged, [{ file: entry.file, title: 'The Goonies', reason: 'PuP-Pack coupé par le script de la table', auto: true }]);
  const lines = pupLines(facts);
  assert.deepEqual(lines.map((l) => [l.state, l.title]), [['check', 'The Goonies']]);
  assert.match(lines[0]!.detail!, /réparé de lui-même avant la prochaine partie/);
  assert.deepEqual(lines[0]!.target, { kind: 'doctor', file: entry.file });
  // Tous prêts : une ligne OK ; aucun pack : rien.
  assert.deepEqual(pupLines({ packs: 3, flagged: [] }).map((l) => l.state), ['ok']);
  assert.deepEqual(pupLines({ packs: 0, flagged: [] }), []);
  // La page les montre, sous leur intertitre.
  const page: HealthFacts = { at: '2026-10-27T20:00:00Z', disks: [], pup: facts, vpx: { installed: '10.8.1-5436', known: '10.8.1-5436' } };
  assert.ok(healthLines(page).some((l) => l.check === 'pup'));
  // Tout constat qui éteint un pack est un constat du médecin, et pupLog compte.
  assert.ok(PUP_HEALTH_FINDINGS.includes('pupDisabledByScript') && PUP_HEALTH_FINDINGS.includes('pupMissing'));
  fs.rmSync(tablesDir, { recursive: true });
});

/** Écran branché de ce modèle, à cette place du bureau. */
function display(gdi: string, name: string, x: number, serial: string): ObservedDisplay {
  return {
    gdiName: gdi,
    friendlyName: name,
    monitorDescription: 'Generic PnP Monitor',
    devicePath: `\\\\?\\DISPLAY#IVM563B#${serial}`,
    bounds: { x, y: 0, width: 1920, height: 1080 },
    rotation: 0,
    primary: x === 0,
    scale: 1,
    edid: { manufacturer: 'IVM', productCode: 0x563b, serialNumber: Number(serial), widthCm: 48, heightCm: 27, monitorName: name, serialText: serial },
  } as ObservedDisplay;
}

test('écrans que VPX confond : deux « PL2294H » pour le fronton et le DMD, signalés pour VPX 10.8.1 seulement', () => {
  const pf = display('\\\\.\\DISPLAY1', 'Laptop', 0, '1');
  const bg = display('\\\\.\\DISPLAY2', 'PL2294H', 1920, '1172903211084');
  const dmd = display('\\\\.\\DISPLAY3', 'PL2294H', 3840, '1172903211937');
  const observed = [pf, bg, dmd];
  const [fp0, fp1, fp2] = observed.map((d) => fingerprintOf(d).key);
  const saved = observed.map((d) => ({ fingerprint: fingerprintOf(d).key, strength: 'strong', label: d.friendlyName, widthPx: 1920, heightPx: 1080, widthCm: 48, heightCm: 27, lastSeen: d }) as PhysicalScreen);
  const roles = { playfield: fp0, backglass: fp1, dmd: fp2 };
  const found = homonymousRoles(roles, saved, observed, 'name');
  assert.deepEqual(found, [{ name: 'PL2294H', roles: ['backglass', 'dmd'] }]);
  // Une version qui repère aussi la position les distingue.
  assert.deepEqual(homonymousRoles(roles, saved, observed, 'name-position'), []);
  // Deux rôles sur le même écran (zones) : voulu.
  assert.deepEqual(homonymousRoles({ playfield: fp0, backglass: fp1, dmd: fp1 }, saved, observed, 'name'), []);
});

const SOURCES = path.join(__dirname, '..', '..', '..', '..', 'app', 'src');

test('pendant la partie, aucune fenêtre de Cyber Pinball ne reste au-dessus des fenêtres de VPX et du PuP-Pack', () => {
  // Une fenêtre « toujours au premier plan » passe devant les fenêtres où le plugin PUP dessine.
  const topmost = fs
    .readdirSync(SOURCES)
    .filter((f) => f.endsWith('.ts'))
    .filter((f) => /setAlwaysOnTop\(\s*true|alwaysOnTop:\s*true/.test(fs.readFileSync(path.join(SOURCES, f), 'utf8')));
  assert.deepEqual(topmost, ['acquire-window.ts', 'game-notice.ts', 'game-recording.ts'], 'toute fenêtre au premier plan doit être fermée par closeTopmostWindows avant la partie');
  // Seule exception : le témoin de l'enregistrement d'une partie, voulu au-dessus de VPX. Il ne couvre
  // qu'un coin du plateau (420 × 72 pour 1080 px), naît après closeTopmostWindows, ignore la souris,
  // n'apparaît pas dans la capture, et disparaît à la fin de l'enregistrement.
  const recording = fs.readFileSync(path.join(SOURCES, 'game-recording.ts'), 'utf8');
  assert.match(recording, /const WITNESS = \{ width: 420, height: 72, margin: 28 \};/);
  assert.match(recording, /setContentProtection\(true\)/);
  assert.match(recording, /setTimeout\(\(\) => witness\.close\(\), VERDICT_MS\)/);
  const front = fs.readFileSync(path.join(SOURCES, 'frontend.ts'), 'utf8');
  assert.ok(front.indexOf('  closeTopmostWindows();') < front.indexOf('armGameRecording(table, hooks.record'), 'le témoin naît après closeTopmostWindows');
  // Seconde exception : l'invitation d'un ami pendant la partie (game-notice.ts), même règle. Elle ne
  // couvre qu'un coin du plateau (560 × 172 pour 1080 px, l'autre coin que le témoin), ne naît que
  // la partie lancée (playing, posé après closeTopmostWindows), ignore la souris, n'apparaît pas dans
  // la capture, et disparaît à la fin de la partie.
  const notice = fs.readFileSync(path.join(SOURCES, 'game-notice.ts'), 'utf8');
  assert.match(notice, /setContentProtection\(true\)/);
  assert.match(notice, /setIgnoreMouseEvents\(true\)/);
  assert.match(front, /if \(playing\) gameNotices\.show\(invite\);/);
  assert.ok(front.indexOf('  closeTopmostWindows();') < front.indexOf('  playing = table;'), 'l’invitation ne naît qu’après closeTopmostWindows');
  assert.match(front, /const result = await game\.done;\r?\n\s+gameNotices\.close\(\);/);
  const frontend = fs.readFileSync(path.join(SOURCES, 'frontend.ts'), 'utf8');
  const close = frontend.indexOf('  closeTopmostWindows();');
  const launch = frontend.indexOf('launchVpx({');
  assert.ok(close > 0 && launch > close, 'closeTopmostWindows() est appelé avant launchVpx');
  assert.match(frontend, /function closeTopmostWindows\(\): void \{\s*for \(const win of BrowserWindow\.getAllWindows\(\)\) \{\s*if \(win\.isDestroyed\(\) \|\| !win\.isAlwaysOnTop\(\)\) continue;/);
});
