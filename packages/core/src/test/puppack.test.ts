// PuP-Packs : nom attendu d'après le script, options des .bat lues sans être
// exécutées, choix d'après la borne, et rangement à l'import (pupvideos\<nom>).
// Les .bat reprennent la forme publiée des vrais packs (xcopy depuis
// PuP-Pack_Options\<option>, puis del des outils du mode classique).

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { pupMemory, scriptFacts } from '../doctor';
import {
  analysePack,
  appliedVariant,
  chooseVariant,
  expectedPackNames,
  findPackRoot,
  parseOptionBat,
  parseScreens,
  pupScriptFacts,
  type PupCabinet,
} from '../puppack';
import { applyImport, planImport } from '../tableimport';
import { readInfo } from '../tables';

function write(file: string, content: string | Buffer = ''): string {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
}

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-pup-'));
}

const HEADER = 'ScreenNum,ScreenDes,PlayList,PlayFile,Loopit,Active,Priority,CustomPos';
/** screens.pup d'une variante : topper, DMD séparé (5) ou dans le backglass (CustomPos « 2,… »). */
function screens(opts: { topper: boolean; dmd: 'separate' | 'backglass' | 'none'; playfield?: boolean }): string {
  return [
    HEADER,
    `0,Topper,,,0,${opts.topper ? 'ForceON' : 'Off'},0,`,
    '2,Backglass,Backglass,,0,ForceON,0,',
    opts.playfield ? '3,Playfield,,,0,ForcePoP,0,' : '3,Playfield,,,0,Off,0,',
    opts.dmd === 'none' ? '5,FullDMD,,,0,Off,0,' : `5,FullDMD,,,0,ForceON,0,${opts.dmd === 'backglass' ? '"2,0,60,100,40"' : ''}`,
  ].join('\r\n');
}

/** Pack « avec options » comme ceux de VPUniverse : .pup des variantes dans PuP-Pack_Options, .bat à la racine. */
function packWithOptions(root: string): void {
  const opt = (name: string, s: string) => {
    write(path.join(root, 'PuP-Pack_Options', name, 'screens.pup'), s);
    write(path.join(root, 'PuP-Pack_Options', name, 'playlists.pup'), `playlists ${name}`);
    write(path.join(root, 'PuP-Pack_Options', name, 'triggers.pup'), `triggers ${name}`);
  };
  opt('Option 1 - Backglass DMD Separate', screens({ topper: true, dmd: 'separate' }));
  opt('Option 2 - FullDMD on Backglass', screens({ topper: false, dmd: 'backglass' }));
  opt('Option 3 - Desktop', screens({ topper: false, dmd: 'backglass', playfield: true }));
  write(path.join(root, 'Option 1 - Backglass DMD Separate.bat'), 'rem echo off\r\nxcopy /y "PuP-Pack_Options\\Option 1 - Backglass DMD Separate\\*"\r\ndel /Q PuPDesktopPunch.exe\r\ndel /Q PuPInit.bat\r\n');
  write(path.join(root, 'Option 2 - FullDMD on Backglass.bat'), 'rem echo off\r\nxcopy /y "PuP-Pack_Options\\Option 2 - FullDMD on Backglass\\*"\r\ndel /Q PuPDesktopPunch.exe\r\ndel /Q PuPInit.bat\r\n');
  write(path.join(root, 'Option 3 - Desktop.bat'), '@echo off\r\ncd /d "%~dp0"\r\ncopy /y ".\\PuP-Pack_Options\\Option 3 - Desktop\\*.pup" . >nul\r\necho Option 3 OK\r\npause\r\n');
  // Outils du mode classique, lancés par PinUP Player : pas des options.
  write(path.join(root, 'PuPInit.bat'), 'start "" PuPDesktopPunch.exe\r\n');
  write(path.join(root, 'PuPDesktopPunch.exe'), 'exe');
  write(path.join(root, 'Backglass', 'intro.mp4'), 'video');
}

const CABINET_3: PupCabinet = { backglass: true, dmd: true, topper: true, dmdRatio: 4, backglassRatio: 16 / 9 };
const CABINET_2: PupCabinet = { backglass: true, dmd: false, topper: false, backglassRatio: 16 / 9 };

test('script : nom du pack passé à B2SInit (variable, constante, littéral), puis la ROM', () => {
  // Extrait de The Goonies (VPW 2021) : table originale, pack nommé par pGameName.
  const goonies = [
    'Const cGameName = "goonies"',
    'Dim pGameName       : pGameName="TheGoonies"  \'pupvideos foldername',
    'Sub PuPInit',
    '\tSet PuPlayer = CreateObject("PinUpPlayer.PinDisplay")',
    '\tPuPlayer.B2SInit "", pGameName',
    'End Sub',
  ].join('\r\n');
  const facts = scriptFacts(goonies);
  assert.deepEqual(facts.pup, { packNames: ['TheGoonies'], playlistAdd: false });
  assert.deepEqual(expectedPackNames(facts), ['TheGoonies']);

  const pinmame = [
    'Const cGameName = "mb_106b"',
    'Const cPuPPack = "mb_106b"',
    'LoadVPM "01560000", "WPC.VBS", 3.26',
    'Controller.GameName = cGameName',
    'Set PuP = CreateObject("PinUpPlayer.PinDisplay")',
    'PuP.Init pBackglass, cPuPPack',
    'PuP.playlistadd pBackglass, "Attract", 1, 0',
  ].join('\n');
  const mb = scriptFacts(pinmame);
  assert.deepEqual(mb.pup, { packNames: ['mb_106b'], playlistAdd: true });
  assert.deepEqual(expectedPackNames(mb), ['mb_106b']);
  // B2SInit d'abord, la ROM ensuite.
  assert.deepEqual(expectedPackNames({ usesPinmame: true, roms: ['afm_113b'], pup: { packNames: ['AFM PuP'], playlistAdd: false } }), ['AFM PuP', 'afm_113b']);
  // Une table PinMAME sans PuP dans le script : le plugin cherche quand même pupvideos\<rom>.
  assert.deepEqual(expectedPackNames(scriptFacts('LoadVPM "1", "WPC.VBS", 1\n.GameName = "t2_l8"')), ['t2_l8']);
  // Sans PuP, rien de plus dans les faits (le cache des scripts reste comparable).
  assert.equal(pupScriptFacts('Set Controller = CreateObject("B2S.Server")'), undefined);
  // Un appel commenté ne compte pas.
  assert.equal(scriptFacts("' PuPlayer.B2SInit \"\", \"vieux\"").pup, undefined);
});

test('screens.pup : 8 colonnes, CustomPos entre guillemets, en-tête sauté', () => {
  const s = parseScreens(`${HEADER}\r\n0,Topper,,,0,ForceON,0,\r\n5,FullDMD,,,0,ForcePoP,0,"2,0,60,100,40"\r\n2,Backglass,PuPFrames,Fond.png,0,ForceBack,,\r\nligne invalide\r\n\r\n`);
  assert.deepEqual(s, [
    { num: 0, description: 'Topper', mode: 'ForceON', parent: undefined, playlist: undefined, playFile: undefined },
    { num: 5, description: 'FullDMD', mode: 'ForcePoP', parent: 2, playlist: undefined, playFile: undefined },
    // Fichier montré par défaut sur l'écran : le fronton du pack.
    { num: 2, description: 'Backglass', mode: 'ForceBack', parent: undefined, playlist: 'PuPFrames', playFile: 'Fond.png' },
  ]);
});

test('.bat d’option : xcopy, copy, del et commandes sans effet ; le reste fait échouer l’analyse', () => {
  const root = tmp();
  packWithOptions(root);
  const one = parseOptionBat(root, 'Option 1 - Backglass DMD Separate.bat');
  assert.equal(one.option, true);
  assert.deepEqual(one.variant?.copies.map((c) => c.to).sort(), ['playlists.pup', 'screens.pup', 'triggers.pup']);
  assert.deepEqual(one.variant?.deletes, ['PuPDesktopPunch.exe', 'PuPInit.bat']);
  assert.equal(one.variant?.folder, path.join('PuP-Pack_Options', 'Option 1 - Backglass DMD Separate'));
  const three = parseOptionBat(root, 'Option 3 - Desktop.bat');
  assert.equal(three.variant?.copies.length, 3);
  // Outil du mode classique : pas une option, ignoré.
  assert.equal(parseOptionBat(root, 'PuPInit.bat').option, false);

  const cases: [string, RegExp][] = [
    ['xcopy /y "C:\\PinUPSystem\\PUPVideos\\x\\*"', /sort du dossier/],
    ['xcopy /y "..\\autre\\*"', /sort du dossier/],
    ['xcopy /y "%PUPDIR%\\*"', /sort du dossier/],
    ['start PuPDesktopPunch.exe', /commande « start »/],
    ['if exist screens.pup del screens.pup', /commande « if »/],
    ['xcopy /y "PuP-Pack_Options\\Option 9\\*"', /aucun fichier/],
    ['copy a.pup+b.pup screens.pup', /copie simple/],
    ['xcopy /y "PuP-Pack_Options\\Option 1 - Backglass DMD Separate\\*" & del x', /plusieurs commandes/],
    ['echo 1 > choix.txt', /écrit dans un fichier/],
  ];
  for (const [line, reason] of cases) {
    write(path.join(root, 'Option X.bat'), `@echo off\r\n${line}\r\n`);
    const r = parseOptionBat(root, 'Option X.bat');
    assert.equal(r.variant, undefined, line);
    assert.match(r.reason ?? '', reason, line);
  }
  fs.rmSync(root, { recursive: true });
});

test('variantes : une par .bat lisible, et les dossiers d’options qu’aucun .bat ne couvre', () => {
  const root = tmp();
  packWithOptions(root);
  write(path.join(root, 'Option 2 - FullDMD on Backglass.bat'), 'start "" "PuP-Pack_Options\\Option 2 - FullDMD on Backglass\\apply.exe"\r\n');
  const info = analysePack(root);
  assert.deepEqual(
    info.variants.map((v) => [v.label, v.bat ?? null]),
    [
      ['Option 1 - Backglass DMD Separate', 'Option 1 - Backglass DMD Separate.bat'],
      ['Option 3 - Desktop', 'Option 3 - Desktop.bat'],
      // Le .bat illisible est remplacé par son dossier : l'option reste proposée.
      ['Option 2 - FullDMD on Backglass', null],
    ],
  );
  assert.deepEqual(info.bats.filter((b) => !b.ok).map((b) => b.bat), ['Option 2 - FullDMD on Backglass.bat']);
  const traits = Object.fromEntries(info.variants.map((v) => [v.label.slice(0, 8), v.traits]));
  assert.equal(traits['Option 1']!.dmd, 'separate');
  assert.equal(traits['Option 1']!.topper, true);
  assert.equal(traits['Option 2']!.dmd, 'backglass');
  assert.equal(traits['Option 3']!.desktop, true);

  // Pack sans .bat (Pirates of the Caribbean, Batman 66) : les dossiers d'options suffisent.
  const bare = tmp();
  write(path.join(bare, 'PuP-Pack_Options', 'Option 1 - 3 Screen', 'screens.pup'), screens({ topper: true, dmd: 'separate' }));
  write(path.join(bare, 'PuP-Pack_Options', 'Option 2 - 2 Screen - 16x9', 'screens.pup'), screens({ topper: false, dmd: 'backglass' }));
  const two = analysePack(bare);
  assert.equal(two.variants.length, 2);
  assert.deepEqual(two.variants[1]!.traits.ratios, [16 / 9]);
  fs.rmSync(root, { recursive: true });
  fs.rmSync(bare, { recursive: true });
});

test('choix de l’option d’après la borne, ou celle de l’installation précédente', () => {
  const root = tmp();
  packWithOptions(root);
  const { variants } = analysePack(root);
  const three = chooseVariant(variants, CABINET_3);
  assert.equal(three.chosen?.label, 'Option 1 - Backglass DMD Separate');
  assert.equal(three.confident, true);
  const two = chooseVariant(variants, CABINET_2);
  assert.equal(two.chosen?.label, 'Option 2 - FullDMD on Backglass');
  assert.equal(two.confident, true);
  // Sans modèle de borne : la première option qui n'est pas pour un bureau, à vérifier.
  const none = chooseVariant(variants, undefined);
  assert.equal(none.chosen?.label, 'Option 1 - Backglass DMD Separate');
  assert.equal(none.confident, false);
  const kept = chooseVariant(variants, CABINET_3, 'option 2 - fulldmd on backglass');
  assert.deepEqual([kept.chosen?.label, kept.reason], ['Option 2 - FullDMD on Backglass', 'remembered']);
  fs.rmSync(root, { recursive: true });
});

test('racine du pack : rom\\rom et dossier d’archive en trop, mais jamais une table entière', () => {
  const root = tmp();
  write(path.join(root, 'mb_106b', 'mb_106b', 'screens.pup'), screens({ topper: false, dmd: 'separate' }));
  assert.equal(findPackRoot(path.join(root, 'mb_106b')), path.join(root, 'mb_106b', 'mb_106b'));
  write(path.join(root, 'Monster Bash PuP-Pack v2', 'Lisez-moi.txt'), 'doc');
  write(path.join(root, 'Monster Bash PuP-Pack v2', 'mb_106b', 'triggers.pup'), 'x');
  assert.equal(findPackRoot(path.join(root, 'Monster Bash PuP-Pack v2')), path.join(root, 'Monster Bash PuP-Pack v2', 'mb_106b'));
  write(path.join(root, 'Table', 'Monster Bash.vpx'), 'vpx');
  write(path.join(root, 'Table', 'pupvideos', 'mb_106b', 'screens.pup'), 'x');
  assert.equal(findPackRoot(path.join(root, 'Table')), undefined);
  fs.rmSync(root, { recursive: true });
});

test('import : pack renommé, aplati, nettoyé, option appliquée, ancien pack remplacé en entier', () => {
  const root = tmp();
  const tablesDir = path.join(root, 'tables');
  const table = path.join(tablesDir, 'Monster Bash (Williams 1998)');
  write(path.join(table, 'Monster Bash (Williams 1998).vpx'), 'vpx');
  // Ancien pack, nommé avec une autre casse : il part entier à la corbeille.
  write(path.join(table, 'pupvideos', 'MB_106B', 'screens.pup'), 'ancien');
  write(path.join(table, 'pupvideos', 'MB_106B', 'Ancienne playlist', 'vieux.mp4'), 'vieux');

  // Archive déballée : « Monster Bash PuP-Pack v2 » › « mb_106b » › « mb_106b » (imbrication).
  const staging = path.join(root, 'staging', 'MB');
  const pack = path.join(staging, 'Monster Bash PuP-Pack v2', 'mb_106b', 'mb_106b');
  packWithOptions(pack);
  write(path.join(pack, '._screens.pup'), 'mac');
  write(path.join(pack, '.DS_Store'), 'mac');
  write(path.join(pack, 'Backglass', 'vide.mp4'), '');
  write(path.join(pack, 'Backglass', '._intro.mp4'), 'mac');

  const existing = [{ folder: table, title: 'Monster Bash', roms: ['mb_106b'], pupNames: ['mb_106b'] }];
  const sources = [{ path: staging, label: 'Monster Bash PuP-Pack v2.zip', mode: 'move' as const, unpacked: true }];
  const plan = planImport(sources, { tablesDir, existing, cabinet: CABINET_2 });
  assert.equal(plan.tables.length, 1);
  const t = plan.tables[0]!;
  assert.equal(t.isNew, false);
  const step = t.steps.find((s) => s.kind === 'pup')!;
  assert.equal(step.target, path.join('pupvideos', 'mb_106b'));
  assert.equal(step.from, pack);
  const p = step.pack!;
  assert.equal(p.name, 'mb_106b');
  assert.equal(p.nameFrom, 'script');
  assert.equal(p.flattened, true);
  assert.equal(p.replaces, path.join(table, 'pupvideos', 'MB_106B'));
  assert.equal(p.choice.chosen?.label, 'Option 2 - FullDMD on Backglass');
  assert.equal(p.choice.reason, 'cabinet');
  assert.deepEqual(p.junk.sort(), ['.DS_Store', '._screens.pup', path.join('Backglass', '._intro.mp4'), path.join('Backglass', 'vide.mp4')].sort());
  assert.deepEqual(p.failedBats, []);

  const trashDir = path.join(root, 'trash');
  applyImport(t, { trashDir, cleanupRoots: [path.join(root, 'staging')] });
  const installed = path.join(table, 'pupvideos', 'mb_106b');
  assert.deepEqual(fs.readdirSync(path.join(table, 'pupvideos')), ['mb_106b']);
  assert.equal(fs.readFileSync(path.join(installed, 'playlists.pup'), 'utf8'), 'playlists Option 2 - FullDMD on Backglass');
  assert.ok(!fs.existsSync(path.join(installed, '._screens.pup')));
  assert.ok(!fs.existsSync(path.join(installed, '.DS_Store')));
  assert.ok(!fs.existsSync(path.join(installed, 'Backglass', 'vide.mp4')));
  assert.ok(fs.existsSync(path.join(installed, 'Backglass', 'intro.mp4')));
  // Ce que le .bat supprime part à la corbeille, comme l'ancien pack.
  assert.ok(!fs.existsSync(path.join(installed, 'PuPInit.bat')));
  assert.ok(fs.existsSync(path.join(trashDir, 'MB_106B', 'Ancienne playlist', 'vieux.mp4')));
  assert.ok(fs.existsSync(path.join(trashDir, 'PuPInit.bat')));
  assert.equal(appliedVariant(analysePack(installed))?.label, 'Option 2 - FullDMD on Backglass');
  const info = readInfo(path.join(table, 'Monster Bash (Williams 1998).info'));
  assert.deepEqual(pupMemory(info, 'mb_106b'), { option: 'Option 2 - FullDMD on Backglass', origin: 'mb_106b' });

  // Mise à jour du pack : l'option retenue est reprise, même sur une autre borne.
  const update = path.join(root, 'staging', 'MB2', 'mb_106b');
  packWithOptions(update);
  const again = planImport([{ path: path.join(root, 'staging', 'MB2'), label: 'mb_106b v3.zip', mode: 'copy', unpacked: true }], {
    tablesDir,
    existing,
    cabinet: CABINET_3,
  }).tables[0]!.steps.find((s) => s.kind === 'pup')!.pack!;
  assert.deepEqual([again.choice.chosen?.label, again.choice.reason, again.replaces], ['Option 2 - FullDMD on Backglass', 'remembered', installed]);
  fs.rmSync(root, { recursive: true });
});

test('import : pack d’une table originale nommé d’après B2SInit, choix de l’utilisateur', () => {
  const root = tmp();
  const tablesDir = path.join(root, 'tables');
  const src = path.join(root, 'source', 'The Goonies (VPW 2021)');
  const vpx = write(path.join(src, 'The Goonies Never Say Die (VPW 2021) v1.4.3.vpx'), 'vpx');
  // Pack livré à part, sous un autre nom que celui que le script charge.
  packWithOptions(path.join(src, 'Goonies PuP-Pack'));
  const scripts = new Map([[vpx.toLowerCase(), scriptFacts('Dim pGameName : pGameName="TheGoonies"\nSet PuPlayer = CreateObject("PinUpPlayer.PinDisplay")\nPuPlayer.B2SInit "", pGameName')]]);
  const plan = planImport([{ path: src, mode: 'copy' }], { tablesDir, scripts, cabinet: CABINET_3 });
  const step = plan.tables[0]!.steps.find((s) => s.kind === 'pup')!;
  assert.equal(step.target, path.join('pupvideos', 'TheGoonies'));
  assert.equal(step.renamed, true);
  assert.equal(step.pack!.origin, 'Goonies PuP-Pack');
  const picked = planImport([{ path: src, mode: 'copy' }], {
    tablesDir,
    scripts,
    cabinet: CABINET_3,
    pupChoices: new Map([[step.pack!.key, 'Option 3 - Desktop']]),
  }).tables[0]!.steps.find((s) => s.kind === 'pup')!.pack!;
  assert.deepEqual([picked.choice.chosen?.label, picked.decided], ['Option 3 - Desktop', true]);
  fs.rmSync(root, { recursive: true });
});
