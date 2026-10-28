// Fronton resté sur une image fixe avec le PuP-Pack de 2001 - A Space Odyssey (26 octobre
// 2026). L'option retenue, « (3 Screens) B2S Users, … Pup on Fulldmd », pose l'écran 2
// (Backglass) dans l'écran 5 (« 5,12.7,13.5,74.8,74.6 ») : le plugin PUP ne dessine rien
// dans la fenêtre du fronton, qu'il laisse au .directb2s. La table n'en avait pas.
// Invariants : le choix d'une option sait ce que le plugin dessine dans chaque fenêtre
// (pupWindows, comme PUPManager::Render) et si la table a son fronton ; avant chaque
// partie, le menu applique seul les réparations du pack (repairPupForPlay).

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { diagnose, pupMemory, repairPupForPlay, scriptFacts, tablePupPacks } from '../doctor';
import { applyOps } from '../fileops';
import { analysePack, chooseVariant, parseScreens, playlistRenames, pupWindows, type PupCabinet } from '../puppack';
import { readInfo, scanTables } from '../tables';
import { vpxWithScript } from './fixtures';

const HEADER = 'ScreenNum,ScreenDes,PlayList,PlayFile,Loopit,Active,Priority,CustomPos';

/** screens.pup des options de HAL9000 (2001), réduits aux écrans qui comptent ; `parent` : où sont posés 2 et ses voisins. */
function screens2001(parent: 2 | 5, topper: 'ForceOn' | 'off', fullDmd: 'ForceBack' | 'off'): string {
  return [
    HEADER,
    `0,"Default Location Topper",Backglass,PLACEHOLDER3.mp4,,${topper},,"0,0,0,100,100"`,
    '1,DMD,,,,off,0,',
    `2,Backglass,Backglass,"Backglass4 by Guet35 TY (1).mp4",1,ForceBack,,"${parent},12.7,13.5,74.8,74.6"`,
    `5,FullDMD,FullDMD,"2001 FullDMD by Hursty TY.mp4",,${fullDmd},,"5,0,0,100,100"`,
    '6,,,,,off,,',
    `10,Overlay,PupAlphas,"Overlay12 by Dr Nobody TY.png",,ForceBack,,"${parent},0,0,100,100"`,
    `13,"MainScreen Vids",,,0,ForcePopBack,,"${parent},12.7,13.5,74.8,74.6"`,
    `14,Callouts,PupAlphas,,1,ForcePop,,"${parent},21,57,57.8,11.8"`,
    '17,,,"2,18.2,47.9,63.6,12.5",,off,,',
    '19,Music,Music,,1,MusicOnly,,',
    '',
  ].join('\r\n');
}

const B2S_USERS = '(3 Screens) B2S Users, Overlay13, Pup on Fulldmd, DMD on Fulldmd, Default Locale Topper Off';
const B2S_USERS_TOPPER = '(4 Screens) B2S Users, Overlay12, Pup on Fulldmd, DMD wherever, Default Locale Topper ON';
const ON_BACKGLASS = '(4 Screens) Overlay12, Pup on Backglass, DMD on Fulldmd';

test('fenêtres remplies par le plugin PUP : écran 2 posé dans le 5, fronton vide', () => {
  assert.deepEqual(pupWindows(parseScreens(screens2001(5, 'off', 'off'))), { topper: false, backglass: false, dmd: true });
  assert.deepEqual(pupWindows(parseScreens(screens2001(5, 'ForceOn', 'off'))), { topper: true, backglass: false, dmd: true });
  // CustomPos sur lui-même : l'écran 2 est une racine, ses voisins s'y posent.
  assert.deepEqual(pupWindows(parseScreens(screens2001(2, 'ForceOn', 'ForceBack'))), { topper: true, backglass: true, dmd: true });
  // Écran 2 éteint sans enfant : repli sur l'écran 6 (Backglass 4:3), éteint aussi.
  assert.deepEqual(pupWindows(parseScreens(`${HEADER}\n2,Backglass,,,,off,,\n6,BG43,,,,off,,\n5,FullDMD,,,,ForceBack,,\n`)), { topper: false, backglass: false, dmd: true });
  // Parent absent du fichier : créé d'office (ForceBack) ; ici l'écran 6 devient la racine du fronton.
  assert.equal(pupWindows(parseScreens(`${HEADER}\n11,Vid,,,,ForceBack,,"6,0,0,100,100"\n`)).backglass, true);
});

/** Pack HAL9000 réduit : trois options, un .bat chacune, comme le vrai. */
function pack2001(dir: string): string {
  const root = path.join(dir, 'HAL9000');
  const options: [string, string][] = [
    [B2S_USERS, screens2001(5, 'off', 'off')],
    [B2S_USERS_TOPPER, screens2001(5, 'ForceOn', 'off')],
    [ON_BACKGLASS, screens2001(2, 'ForceOn', 'ForceBack')],
  ];
  for (const [label, screens] of options) {
    fs.mkdirSync(path.join(root, 'PuP-Pack_Options', label), { recursive: true });
    fs.writeFileSync(path.join(root, 'PuP-Pack_Options', label, 'screens.pup'), screens);
    fs.writeFileSync(path.join(root, 'PuP-Pack_Options', label, 'triggers.pup'), 'ID,Active\r\n');
    fs.writeFileSync(path.join(root, `${label}.bat`), `rem echo off\r\nxcopy /y "PuP-Pack_Options\\${label}\\*.pup"\r\n`);
  }
  // Option appliquée à l'installation : la première (« B2S Users »).
  for (const f of ['screens.pup', 'triggers.pup']) fs.copyFileSync(path.join(root, 'PuP-Pack_Options', B2S_USERS, f), path.join(root, f));
  fs.mkdirSync(path.join(root, 'Backglass'));
  return root;
}

/** Borne de ce PC : fronton 16:9, FullDMD 16:9, topper. */
const PC: PupCabinet = { backglass: true, dmd: true, topper: true, dmdRatio: 16 / 9, backglassRatio: 16 / 9 };

test('option : le fronton laissé au .directb2s n’est retenu que si la table en a un ; le topper lu dans screens.pup', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-pupwin-'));
  const info = analysePack(pack2001(dir));
  const traits = Object.fromEntries(info.variants.map((v) => [v.label, v.traits]));
  // « Default Locale Topper Off » : la fenêtre du topper reste vide, malgré le mot « Topper ».
  assert.equal(traits[B2S_USERS]!.topper, false);
  assert.equal(traits[B2S_USERS_TOPPER]!.topper, true);
  assert.deepEqual(traits[B2S_USERS]!.windows, { topper: false, backglass: false, dmd: true });
  // Table sans .directb2s : le pack sur le fronton, sans hésiter.
  const without = chooseVariant(info.variants, { ...PC, tableBackglass: false });
  assert.deepEqual([without.chosen?.label, without.confident], [ON_BACKGLASS, true]);
  // On ne sait pas : le pack sur le fronton d'abord aussi.
  assert.equal(chooseVariant(info.variants, PC).chosen?.label, ON_BACKGLASS);
  // Avec un .directb2s, « B2S Users » redevient possible, sans l'emporter d'office.
  const withB2s = chooseVariant(info.variants, { ...PC, tableBackglass: true });
  assert.notEqual(withB2s.chosen?.label, B2S_USERS);
  fs.rmSync(dir, { recursive: true });
});

/** Script de 2001 réduit : usePUP = False, pack HAL9000. */
const SCRIPT = [
  "usePUP   = False            ' enable Pinup Player functions for this table",
  'cPuPPack = "HAL9000"',
  'Sub PuPStart(cPuPPack)',
  '    If usePUP=true then',
  '        Set PuPlayer = CreateObject("PinUpPlayer.PinDisplay")',
  '        PuPlayer.B2SInit "",cPuPPack',
  '    End If',
  'End Sub',
  'PuPStart(cPuPPack)',
  '',
].join('\r\n');

test('avant la partie : le pack est allumé et mis sur le fronton, sans rien demander ; un choix fait dans la fiche est gardé', () => {
  const tablesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-pupplay-'));
  const folder = path.join(tablesDir, '2001 - A Space Odyssey (Original 2025)');
  fs.mkdirSync(path.join(folder, 'pupvideos'), { recursive: true });
  pack2001(path.join(folder, 'pupvideos'));
  fs.writeFileSync(path.join(folder, '2001_SpaceOdyssey_v1.0.2.vpx'), vpxWithScript(SCRIPT));
  const infoFile = path.join(folder, '2001 - A Space Odyssey (Original 2025).info');
  // Comme sur ce PC : l'option retenue à l'installation, sans choix de l'utilisateur.
  fs.writeFileSync(infoFile, JSON.stringify({ CyberPinball: { pup: { HAL9000: { option: B2S_USERS, origin: 'HAL9000' } } } }));
  const entry = () => scanTables(tablesDir)[0]!;
  const trashDir = `${tablesDir}-corbeille`;
  // Sans script en cache (cache périmé après une mise à jour) : lu dans le .vpx.
  const done = repairPupForPlay(entry(), { tablesDir, cabinet: PC }, { trashDir });
  assert.deepEqual(done.map((f) => f.code), ['pupDisabledByScript', 'pupOptionUnsuited']);
  assert.ok(fs.existsSync(path.join(folder, '2001_SpaceOdyssey_v1.0.2.vbs')));
  assert.equal(tablePupPacks(entry(), PC)[0]!.applied?.label, ON_BACKGLASS);
  assert.equal(pupMemory(readInfo(infoFile), 'HAL9000')?.option, ON_BACKGLASS);
  // Rien de plus à faire, ni pour le menu ni pour le médecin.
  assert.deepEqual(repairPupForPlay(entry(), { tablesDir, cabinet: PC }, { trashDir }), []);
  // Le pack de test ne livre pas les vidéos que nomment ses .pup (« Fichiers du PuP-Pack absents »).
  assert.deepEqual(
    diagnose(entry(), { tablesDir, cabinet: PC, script: scriptFacts(SCRIPT) })
      .map((f) => f.code)
      .filter((c) => c !== 'pupFilesMissing'),
    ['backglassMissing'],
  );
  // Option choisie dans la fiche : le menu la respecte.
  fs.writeFileSync(infoFile, JSON.stringify({ CyberPinball: { pup: { HAL9000: { option: B2S_USERS, origin: 'HAL9000', chosen: 'user' } } } }));
  for (const f of ['screens.pup', 'triggers.pup']) fs.copyFileSync(path.join(folder, 'pupvideos', 'HAL9000', 'PuP-Pack_Options', B2S_USERS, f), path.join(folder, 'pupvideos', 'HAL9000', f));
  assert.deepEqual(repairPupForPlay(entry(), { tablesDir, cabinet: PC }, { trashDir }), []);
  fs.rmSync(tablesDir, { recursive: true });
  fs.rmSync(trashDir, { recursive: true, force: true });
});

test('pack dans la fenêtre du DMD d’une table qui dessine son DMD : le DMD reste devant, pour cette table', () => {
  const tablesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-pupdmd-'));
  const folder = path.join(tablesDir, '2001 - A Space Odyssey (Original 2025)');
  fs.mkdirSync(path.join(folder, 'pupvideos'), { recursive: true });
  const root = pack2001(path.join(folder, 'pupvideos'));
  // Option choisie dans la fiche : le pack sur le fronton et sur le FullDMD.
  for (const f of ['screens.pup', 'triggers.pup']) fs.copyFileSync(path.join(root, 'PuP-Pack_Options', ON_BACKGLASS, f), path.join(root, f));
  const ultra = `${SCRIPT.replace('usePUP   = False', 'usePUP   = True')}Set UltraDMD = CreateObject("UltraDMD.DMDObject")\r\n`;
  fs.writeFileSync(path.join(folder, '2001_SpaceOdyssey_v1.0.2.vpx'), vpxWithScript(ultra));
  fs.writeFileSync(path.join(folder, '2001_SpaceOdyssey_v1.0.2.ini'), '[Player]\r\nScreenPlayerY = -2.27\r\n');
  fs.writeFileSync(path.join(folder, '2001 - A Space Odyssey (Original 2025).info'), JSON.stringify({ CyberPinball: { pup: { HAL9000: { option: ON_BACKGLASS, chosen: 'user' } } } }));
  const entry = () => scanTables(tablesDir)[0]!;
  const trashDir = `${tablesDir}-corbeille`;
  const ctx = { tablesDir, cabinet: PC, script: scriptFacts(ultra) };
  assert.equal(scriptFacts(ultra).drawsDmd, true);
  assert.deepEqual(repairPupForPlay(entry(), ctx, { trashDir }).map((f) => f.code), ['pupHidesDmd']);
  // Le .ini de la table garde ses réglages et gagne la priorité.
  assert.equal(fs.readFileSync(path.join(folder, '2001_SpaceOdyssey_v1.0.2.ini'), 'utf8'), '[Player]\r\nScreenPlayerY = -2.27\r\n\r\n[ScoreView]\r\nPriority.PUP = 0\r\n');
  assert.deepEqual(repairPupForPlay(entry(), ctx, { trashDir }), []);
  // Valeur réglée pour la table dans le menu de VPX : respectée.
  fs.writeFileSync(path.join(folder, '2001_SpaceOdyssey_v1.0.2.ini'), '[ScoreView]\r\nPriority.PUP = 100\r\n');
  assert.ok(!diagnose(entry(), ctx).some((f) => f.code === 'pupHidesDmd'));
  // Score écrit par le pack lui-même (PuP-DMD) : le pack garde la fenêtre du DMD.
  fs.rmSync(path.join(folder, '2001_SpaceOdyssey_v1.0.2.ini'));
  const labels = scriptFacts(`${ultra}PuPlayer.LabelNew 5, "Score", "Arial", 10, 0, 0, 0, 0, 0, 0, 0, 1\r\n`);
  assert.ok(!diagnose(entry(), { ...ctx, script: labels }).some((f) => f.code === 'pupHidesDmd'));
  // Option qui laisse la fenêtre du DMD : rien à faire.
  for (const f of ['screens.pup', 'triggers.pup']) fs.copyFileSync(path.join(root, 'PuP-Pack_Options', B2S_USERS, f), path.join(root, f));
  fs.writeFileSync(path.join(root, 'screens.pup'), `${HEADER}\r\n2,Backglass,Backglass,bg.mp4,1,ForceBack,,\r\n`);
  assert.ok(!diagnose(entry(), ctx).some((f) => f.code === 'pupHidesDmd'));
  fs.rmSync(tablesDir, { recursive: true });
  fs.rmSync(trashDir, { recursive: true, force: true });
});

test('playlists : le fichier que PinUP Player joue en premier passe aussi en premier pour le plugin PUP', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-puporder-'));
  const root = path.join(dir, 'HAL9000');
  const files: [string, string][] = [
    ['PupAlphas', 'aaclear.png'],
    ['PupAlphas', 'Overlay1 by Dr Nobody TY.png'],
    ['PupAlphas', 'Overlay12 by Dr Nobody TY.png'],
    ['Music', 'Altrack1.mp3'],
    ['Music', 'AMBIENTSTARTSHIPAUDIO1.mp3'],
    // Même ordre dans les deux tris : rien à faire.
    ['Backglass', 'Backglass4.mp4'],
    ['Backglass', 'Backglass5.mp4'],
    // Les dossiers d'options ne sont pas des playlists.
    [path.join('PuP-Pack_Options', 'Option 1'), 'screens.pup'],
  ];
  for (const [folder, name] of files) {
    fs.mkdirSync(path.join(root, folder), { recursive: true });
    fs.writeFileSync(path.join(root, folder, name), name);
  }
  const renames = playlistRenames(root);
  assert.deepEqual(
    renames.map((r) => [r.playlist, r.wrong, path.basename(r.to)]),
    [
      ['Music', 'AMBIENTSTARTSHIPAUDIO1.mp3', 'ALTRACK1.mp3'],
      ['PupAlphas', 'Overlay1 by Dr Nobody TY.png', 'AACLEAR.png'],
    ],
  );
  // Renommé (seule la casse change, sur un disque qui l'ignore) : plus rien à faire, contenu intact.
  applyOps(
    renames.map((r) => ({ op: 'move' as const, from: path.join(root, r.from), to: path.join(root, r.to) })),
    { trashDir: `${dir}-corbeille` },
  );
  assert.deepEqual(playlistRenames(root), []);
  assert.ok(fs.readdirSync(path.join(root, 'PupAlphas')).includes('AACLEAR.png'));
  assert.equal(fs.readFileSync(path.join(root, 'PupAlphas', 'AACLEAR.png'), 'utf8'), 'aaclear.png');
  assert.ok(!fs.existsSync(`${dir}-corbeille`), 'rien à la corbeille');
  fs.rmSync(dir, { recursive: true });
});
