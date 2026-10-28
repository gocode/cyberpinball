// Fichiers d'un PuP-Pack lus autrement par le plugin PUP de VPX 10.8.1 que par PinUP Player
// (28 octobre 2026). Game of Thrones LE (VPW) : les blasons des maisons (« Stark.mp4 ») sont des
// PNG ou des JPEG, le fond du fronton (« Backglass.mp4 ») un JPEG ; le plugin choisit d'après
// l'extension et les joue comme des vidéos d'une seule image, en boucle : fronton presque noir,
// éclairs du blason. Le pack nomme aussi « 9y10perro y montaña.mp4 » en UTF-8 : le plugin le lit
// avec la page de codes de Windows, ne le trouve pas et abandonne le déclencheur.
// Invariants : après les réparations d'avant-partie (et d'installation), chaque fichier que nomme
// un .pup actif se retrouve comme le plugin le cherche (nom ASCII, sans tenir compte de la casse),
// et chaque fichier d'une playlist porte l'extension de sa nature (une image n'est jamais en
// .mp4) ; les .pup des options restent identiques à ceux de la racine (l'option reste reconnue) ;
// un nom que le script cite ne change jamais ; un fichier absent est signalé.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { diagnose, repairPupForPlay, scriptFacts, type DoctorContext } from '../doctor';
import { PUP_HEALTH_FINDINGS } from '../health';
import { asciiName, mediaKind, missingPackFiles, packFileFixes } from '../pupfiles';
import type { PupCabinet } from '../puppack';
import { scanTables } from '../tables';
import { vpxWithScript } from './fixtures';

const PNG = Buffer.concat([Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'), Buffer.alloc(32)]);
const JPEG = Buffer.concat([Buffer.from('ffd8ffe000104a46494600', 'hex'), Buffer.alloc(32)]);
const MP4 = Buffer.concat([Buffer.from('000000146674797069736f6d', 'hex'), Buffer.alloc(32)]);

/** Script sans PuP, sans ROM (le .vbs de Cyber Pinball lance le pack). */
const SCRIPT = ['Const cGameName = "gameofthrones"', 'Sub Table1_Init()', '    LoadEM', 'End Sub', ''].join('\r\n');
const CABINET: PupCabinet = { backglass: true, dmd: true, topper: false, fullDmd: true, tableBackglass: false };

const SCREENS = ['ScreenNum,ScreenDes,PlayList,PlayFile,Loopit,Active,Priority,CustomPos', '2,Backglass,Backglass,,0,show,,', '5,"Full DMD",FullDMD,"Absent.mp4",0,show,,', '9,Other,Other,"Absent2.mp4",0,off,,', ''].join('\r\n');
/** triggers.pup en UTF-8, comme celui du pack : « montaña » sur deux octets. */
const TRIGGERS = Buffer.from(
  [
    'ID,Active,Descript,Trigger,ScreenNum,PlayList,PlayFile,Volume,Priority,Length,Counter,RestSeconds,Loop,Defaults',
    '4,1,Stark,D11,2,"Choose your House",Stark.mp4,,7,,,,SetBG,0',
    '5,1,Sigil,D12,2,"Choose your House",Sigil_Stark.mp4,,7,,,,,0',
    '6,1,Perro,D13,2,Battle_Stark,"9y10perro y montaña.mp4",,10,,,,,0',
    '7,1,Plein,D14,2,"Choose your House",STARK.MP4,,7,,,,SetBG,0',
    '',
  ].join('\r\n'),
  'utf8',
);
const PLAYLISTS = 'ScreenNum,Folder,Des,AlphaSort,RestSeconds,Volume,Priority\r\n0,Backglass,,0,0,100,0\r\n0,Choose your House,,0,0,100,0\r\n0,Battle_Stark,,0,0,100,0\r\n';
const OPTION = path.join('PuP-Pack_Options', 'Option 1 - PUP in BG');

function gameOfThrones(tablesDir: string, script = SCRIPT): { folder: string; root: string } {
  const folder = path.join(tablesDir, 'Game of Thrones LE (Stern 2015)');
  const root = path.join(folder, 'pupvideos', 'gameofthrones');
  for (const dir of ['Backglass', 'Choose your House', 'Battle_Stark', 'FullDMD', OPTION]) fs.mkdirSync(path.join(root, dir), { recursive: true });
  fs.writeFileSync(path.join(root, 'Backglass', 'Backglass.mp4'), JPEG);
  fs.writeFileSync(path.join(root, 'Choose your House', 'Stark.mp4'), PNG);
  fs.writeFileSync(path.join(root, 'Choose your House', 'Sigil_Stark.mp4'), MP4);
  fs.writeFileSync(path.join(root, 'Battle_Stark', '9y10perro y montaña.mp4'), MP4);
  for (const dir of ['', OPTION]) {
    fs.writeFileSync(path.join(root, dir, 'screens.pup'), SCREENS);
    fs.writeFileSync(path.join(root, dir, 'triggers.pup'), TRIGGERS);
    fs.writeFileSync(path.join(root, dir, 'playlists.pup'), PLAYLISTS);
  }
  fs.writeFileSync(path.join(root, 'Option 1 - PUP in BG.bat'), `xcopy /y "${OPTION}\\*.pup"\r\n`);
  fs.writeFileSync(path.join(folder, 'Game of Thrones LE (Stern 2015) VPW 1.2.1.vpx'), vpxWithScript(script));
  return { folder, root };
}

/**
 * Ce que le plugin trouvera : chaque fichier nommé par un déclencheur actif ou un écran allumé,
 * lu comme le plugin (octets du .pup en page de codes Windows : un nom non ASCII ne se retrouve
 * pas), sans tenir compte de la casse. Rend ce qui manque.
 */
function unresolved(root: string): string[] {
  const lost: string[] = [];
  for (const [file, playlistCol, fileCol] of [['triggers.pup', 5, 6], ['screens.pup', 2, 3]] as const) {
    const lines = fs.readFileSync(path.join(root, file), 'latin1').split(/\r?\n/).slice(1).filter(Boolean);
    for (const line of lines) {
      const cols = line.match(/("([^"]|"")*"|[^,]*)(,|$)/g)!.map((c) => c.replace(/,$/, '').replace(/^"|"$/g, ''));
      if (file === 'triggers.pup' && cols[1] !== '1') continue;
      if (file === 'screens.pup' && cols[5]?.toLowerCase() === 'off') continue;
      const want = cols[fileCol];
      if (!want) continue;
      const dir = fs.readdirSync(root).find((d) => d.toLowerCase() === cols[playlistCol]!.toLowerCase());
      const names = dir ? fs.readdirSync(path.join(root, dir)) : [];
      if (!names.some((n) => n.toLowerCase() === want.toLowerCase())) lost.push(`${cols[playlistCol]}\\${want}`);
    }
  }
  return lost;
}

/** Fichiers des playlists dont l'extension ment sur la nature. */
function disguised(root: string): string[] {
  const out: string[] = [];
  for (const dir of fs.readdirSync(root, { withFileTypes: true })) {
    if (!dir.isDirectory() || /option|pupcapture/i.test(dir.name)) continue;
    for (const f of fs.readdirSync(path.join(root, dir.name))) {
      const kind = mediaKind(fs.readFileSync(path.join(root, dir.name, f)));
      const video = /\.(mp4|avi|mkv|webm|mov)$/i.test(f);
      if (video && kind !== 'video') out.push(f);
      if (/\.(png|jpe?g|bmp)$/i.test(f) && kind === 'video') out.push(f);
    }
  }
  return out;
}

test('nature d’un fichier par ses premiers octets ; nom en ASCII', () => {
  assert.equal(mediaKind(PNG), 'png');
  assert.equal(mediaKind(JPEG), 'jpeg');
  assert.equal(mediaKind(MP4), 'video');
  assert.equal(mediaKind(Buffer.from('GIF89a')), 'gif');
  assert.equal(mediaKind(Buffer.alloc(12)), 'other');
  assert.equal(asciiName('9y10perro y montaña.mp4'), '9y10perro y montana.mp4');
  assert.equal(asciiName('Œuvre ☺.png'), '_uvre _.png');
});

test('Game of Thrones : images renommées à leur vraie extension, nom accentué en ASCII, .pup réécrits', () => {
  const { root } = gameOfThrones(fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-pupfiles-')));
  assert.deepEqual(unresolved(root), ['Battle_Stark\\9y10perro y montaÃ±a.mp4', 'FullDMD\\Absent.mp4']);
  const fixes = packFileFixes(root);
  assert.deepEqual(
    fixes.renames.map((r) => [r.from, r.to, r.why]).sort((a, b) => a[0]!.localeCompare(b[0]!)),
    [
      [path.join('Backglass', 'Backglass.mp4'), path.join('Backglass', 'Backglass.jpg'), 'image'],
      [path.join('Battle_Stark', '9y10perro y montaña.mp4'), path.join('Battle_Stark', '9y10perro y montana.mp4'), 'ascii'],
      [path.join('Choose your House', 'Stark.mp4'), path.join('Choose your House', 'Stark.png'), 'image'],
    ],
  );
  // Les trois triggers.pup (racine et option) ; screens.pup ne nomme aucun fichier renommé.
  assert.deepEqual(fixes.writes.map((w) => w.file).sort(), [path.join(OPTION, 'triggers.pup'), 'triggers.pup'].sort());
  const rewritten = fixes.writes.find((w) => w.file === 'triggers.pup')!.content;
  const before = TRIGGERS.toString('latin1').split('\r\n');
  const after = rewritten.split('\r\n');
  // Seuls les noms changent, octet pour octet ; « STARK.MP4 » (même fichier, autre casse) aussi.
  assert.deepEqual(after, [before[0], before[1]!.replace('Stark.mp4', 'Stark.png'), before[2], before[3]!.replace('montaÃ±a', 'montana'), before[4]!.replace('STARK.MP4', 'Stark.png'), '']);
});

test('médecin, avant la partie : la table joue ses images comme des images, ses noms se retrouvent, l’option reste reconnue', () => {
  const tablesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-pupfiles-'));
  const { root } = gameOfThrones(tablesDir);
  const ctx: DoctorContext = { tablesDir, script: scriptFacts(SCRIPT), cabinet: CABINET };
  const found = diagnose(scanTables(tablesDir)[0]!, ctx).find((f) => f.code === 'pupFileNames');
  assert.equal(found?.severity, 'warning');
  assert.match(found!.detail, /2 images nommées comme des vidéos/);
  assert.match(found!.detail, /Un nom accentué \(« 9y10perro y montaña\.mp4 »\)/);
  assert.ok((PUP_HEALTH_FINDINGS as readonly string[]).includes('pupFileNames'));
  const done = repairPupForPlay(scanTables(tablesDir)[0]!, ctx, { trashDir: `${tablesDir}-corbeille` });
  assert.ok(done.some((f) => f.code === 'pupFileNames'), done.map((f) => f.code).join(', '));
  assert.deepEqual(disguised(root), []);
  // Seul reste ce que le pack ne livre pas, signalé sans correction.
  assert.deepEqual(unresolved(root), ['FullDMD\\Absent.mp4']);
  assert.deepEqual(missingPackFiles(root), ['FullDMD\\Absent.mp4']);
  const after = diagnose(scanTables(tablesDir)[0]!, ctx);
  assert.deepEqual(after.filter((f) => ['pupFileNames', 'pupOptionNotApplied', 'pupOptionMismatch'].includes(f.code)).map((f) => f.code), []);
  const missing = after.find((f) => f.code === 'pupFilesMissing');
  assert.equal(missing?.severity, 'info');
  assert.equal(missing?.fix, undefined);
  assert.match(missing!.detail, /FullDMD\\Absent\.mp4/);
  // Les .pup de l'option sont restés ceux de la racine.
  assert.deepEqual(fs.readFileSync(path.join(root, OPTION, 'triggers.pup')), fs.readFileSync(path.join(root, 'triggers.pup')));
  assert.deepEqual(repairPupForPlay(scanTables(tablesDir)[0]!, ctx, { trashDir: `${tablesDir}-corbeille` }).map((f) => f.code), []);
});

test('un nom que le script cite reste tel quel', () => {
  const tablesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-pupfiles-'));
  const { root } = gameOfThrones(tablesDir);
  const script = 'Set PuPlayer = CreateObject("PinUpPlayer.PinDisplay")\r\nPuPlayer.playlistplayex 2, "Choose your House", "Stark.mp4", 100, 1\r\n';
  const fixes = packFileFixes(root, script);
  assert.ok(!fixes.renames.some((r) => r.from.endsWith('Stark.mp4')));
  assert.deepEqual(fixes.kept, [path.join('Choose your House', 'Stark.mp4')]);
  assert.ok(fixes.renames.some((r) => r.from.endsWith('Backglass.mp4')));
});

test('nom pris : le fichier renommé ne remplace jamais un autre', () => {
  const { root } = gameOfThrones(fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-pupfiles-')));
  fs.writeFileSync(path.join(root, 'Choose your House', 'stark.PNG'), PNG);
  const stark = packFileFixes(root).renames.find((r) => r.from.endsWith('Stark.mp4'));
  assert.equal(stark?.to, path.join('Choose your House', 'Stark (2).png'));
});
