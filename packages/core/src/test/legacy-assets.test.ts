// Champions League - Season 2023 (retour du 23/11/2026) : muette, « Failed to stream music: ChampionsLeague\... » ; le
// dossier ChampionsLeague est dans le dossier Music de l'ancien Visual Pinball. Invariants : le Diagnostic retrouve le
// dossier de musique et le dossier UltraDMD/FlexDMD dans toute ancienne installation ou rangement possible (sans tenir
// compte de la casse), propose de les copier chez la table sans jamais remplacer un fichier, ne propose pas un dossier
// qui n'a pas ce que VPX réclame, et à défaut propose de choisir le dossier à la main.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { diagnose, scriptFacts } from '../doctor';
import { applyOps } from '../fileops';
import { dmdFolderNames, legacyBaseDirs, legacyPickOps } from '../legacy-assets';
import { scanTables } from '../tables';

const NAME = 'Champions League - Season 2023';
const CRLF = String.fromCharCode(13, 10);

function write(file: string, content: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function setup(): { root: string; tablesDir: string; vpx: string; folder: string; old: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-legacy-'));
  const tablesDir = path.join(root, 'tables');
  const folder = path.join(tablesDir, NAME);
  const vpx = path.join(folder, `${NAME}.vpx`);
  write(vpx, 'x');
  return { root, tablesDir, vpx, folder, old: path.join(root, 'Visual Pinball') };
}

const LOAD = (vpx: string) => `2026-11-23 10:16:00.000 INFO  [Main] [PinTable::LoadGameFromFilename@1419] LoadGameFromFilename ${vpx}`;
const MUSIC = (name: string) => `2026-11-23 10:16:03.000 ERROR [Main] [ScriptGlobalTable::PlayMusic@133] Failed to stream music: ${name}`;
const LOG = (vpx: string) => [LOAD(vpx), MUSIC('ChampionsLeague\\bgout_UEFACL - Intro.mp3'), MUSIC('ChampionsLeague\\bgout_UEFACL - Theme.mp3')].join(CRLF);

test('musique introuvable : retrouvée dans le Music de l’ancien Visual Pinball, copiée sans rien écraser', () => {
  const { root, tablesDir, vpx, folder, old } = setup();
  try {
    // Casse différente de celle du journal : la recherche l'ignore.
    write(path.join(old, 'Music', 'championsleague', 'bgout_UEFACL - Intro.mp3'), 'ancien');
    write(path.join(old, 'Music', 'championsleague', 'bgout_UEFACL - Theme.mp3'), 'theme');
    write(path.join(folder, 'music', 'ChampionsLeague', 'bgout_UEFACL - Intro.mp3'), 'déjà là');
    const entry = scanTables(tablesDir)[0]!;
    const finding = diagnose(entry, { tablesDir, vpxLog: LOG(vpx), legacyBases: [old] }).find((f) => f.code === 'musicMissing')!;
    assert.match(finding.fix?.label ?? '', /^Copier la musique trouvée dans .*Music$/);
    assert.equal(finding.pick, undefined);
    assert.doesNotMatch(finding.detail, /dossier d’import/);
    applyOps(finding.fix!.ops, { trashDir: path.join(root, 'corbeille') });
    const dest = path.join(folder, 'music', 'ChampionsLeague');
    assert.equal(fs.readFileSync(path.join(dest, 'bgout_UEFACL - Intro.mp3'), 'utf8'), 'déjà là');
    assert.equal(fs.readFileSync(path.join(dest, 'bgout_UEFACL - Theme.mp3'), 'utf8'), 'theme');
    assert.equal(fs.existsSync(path.join(root, 'corbeille')), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('musique introuvable, rien sur le PC : on propose de choisir le dossier, qui se retrouve dans un dossier plus grand', () => {
  const { root, tablesDir, vpx, folder } = setup();
  try {
    const finding = diagnose(scanTables(tablesDir)[0]!, { tablesDir, vpxLog: LOG(vpx), legacyBases: [] }).find((f) => f.code === 'musicMissing')!;
    assert.equal(finding.fix, undefined);
    assert.equal(finding.pick?.name, 'ChampionsLeague');
    assert.equal(finding.pick?.dest, path.join(folder, 'music', 'ChampionsLeague'));
    assert.match(finding.detail, /« ChampionsLeague\\bgout_UEFACL - Intro\.mp3 »/);
    assert.match(finding.detail, /« Music » de ton ancien Visual Pinball/);
    // La joueuse prend tout le dossier Music : on descend dans « ChampionsLeague ».
    const music = path.join(root, 'Music');
    write(path.join(music, 'ChampionsLeague', 'a.mp3'), 'a');
    const pick = finding.pick!;
    const expected = [{ op: 'copy', from: path.join(music, 'ChampionsLeague'), to: pick.dest, keep: true }];
    assert.deepEqual(legacyPickOps(music, pick), expected);
    assert.deepEqual(legacyPickOps(path.join(music, 'ChampionsLeague'), pick), expected);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('dossier UltraDMD absent : retrouvé dans le Tables de l’ancienne installation, sinon à choisir', () => {
  const { root, tablesDir, folder, old } = setup();
  try {
    const script = scriptFacts(`With FlexDMD${CRLF}  .ProjectFolder = "./ChampionsLeague2023.UltraDMD/"${CRLF}End With${CRLF}`);
    write(path.join(old, 'Tables', 'championsleague2023.ultradmd', 'intro.png'), 'img');
    const entry = scanTables(tablesDir)[0]!;
    const found = diagnose(entry, { tablesDir, script, legacyBases: [old] }).find((f) => f.code === 'dmdFolderMissing')!;
    assert.match(found.fix?.label ?? '', /^Copier « ChampionsLeague2023\.UltraDMD » trouvé dans /);
    applyOps(found.fix!.ops, { trashDir: path.join(root, 'corbeille') });
    assert.equal(fs.readFileSync(path.join(folder, 'ChampionsLeague2023.UltraDMD', 'intro.png'), 'utf8'), 'img');
    fs.rmSync(path.join(folder, 'ChampionsLeague2023.UltraDMD'), { recursive: true });
    const missing = diagnose(entry, { tablesDir, script, legacyBases: [] }).find((f) => f.code === 'dmdFolderMissing')!;
    assert.equal(missing.fix, undefined);
    assert.equal(missing.pick?.dest, path.join(folder, 'ChampionsLeague2023.UltraDMD'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('recherche bornée : emplacements habituels des disques et des dossiers de la joueuse, jamais la racine d’un disque', () => {
  const present = new Set(['C:\\Visual Pinball', 'D:\\Games\\VPX', 'D:\\Program Files (x86)\\PinballX', 'C:\\Maison\\x\\Downloads'].map((d) => d.toLowerCase()));
  const bases = legacyBaseDirs(['C:', 'D:'], (d) => present.has(d.toLowerCase()), 'C:\\Maison\\x');
  assert.deepEqual(bases.map((b) => b.toLowerCase()).sort(), [...present].sort());
  assert.deepEqual(legacyBaseDirs(['C:'], () => false, undefined), []);
});

test('toutes les installations : table dans son dossier, téléchargements, autre table de la bibliothèque, piste seule', () => {
  const { root, tablesDir, vpx, folder } = setup();
  try {
    // Un dossier du même nom sans la piste réclamée ne sert à rien : il n'est pas proposé.
    write(path.join(root, 'Pinball', 'Music', 'ChampionsLeague', 'autre.mp3'), 'x');
    const entry = scanTables(tablesDir)[0]!;
    const log = LOG(vpx);
    const none = diagnose(entry, { tablesDir, vpxLog: log, legacyBases: [path.join(root, 'Pinball')] }).find((f) => f.code === 'musicMissing')!;
    assert.equal(none.fix, undefined);
    // Table de l'ancienne installation rangée dans son propre dossier : Tables\<table>\music\ChampionsLeague.
    const old = path.join(root, 'VPX');
    write(path.join(old, 'Tables', 'Champions', 'music', 'ChampionsLeague', 'bgout_UEFACL - Intro.mp3'), 'i');
    assert.equal(diagnose(entry, { tablesDir, vpxLog: log, legacyBases: [old] }).find((f) => f.code === 'musicMissing')!.fix?.ops.length, 1);
    // Dossier déposé dans les téléchargements, un niveau sous la racine.
    const dl = path.join(root, 'Downloads');
    write(path.join(dl, 'Champions pack', 'ChampionsLeague', 'bgout_UEFACL - Theme.mp3'), 't');
    assert.equal(diagnose(entry, { tablesDir, vpxLog: log, legacyBases: [dl] }).find((f) => f.code === 'musicMissing')!.fix?.ops.length, 1);
    // Une autre table de la bibliothèque a déjà ce dossier de musique.
    const other = path.join(tablesDir, 'Autre version');
    write(path.join(other, 'Autre version.vpx'), 'y');
    write(path.join(other, 'music', 'ChampionsLeague', 'bgout_UEFACL - Intro.mp3'), 'o');
    const mine = scanTables(tablesDir).find((e) => e.folder === folder)!;
    assert.equal(diagnose(mine, { tablesDir, vpxLog: log, legacyBases: [] }).find((f) => f.code === 'musicMissing')!.fix?.ops.length, 1);
    // Piste nommée sans dossier : trouvée à la racine de Music, ou à choisir.
    const solo = [LOAD(vpx), MUSIC('Theme.MP3')].join(CRLF);
    write(path.join(old, 'Music', 'theme.mp3'), 'm');
    const file = diagnose(entry, { tablesDir, vpxLog: solo, legacyBases: [old] }).find((f) => f.code === 'musicMissing')!;
    assert.deepEqual(file.fix?.ops, [{ op: 'copy', from: path.join(old, 'Music', 'theme.mp3'), to: path.join(folder, 'music', 'Theme.MP3'), keep: true }]);
    const hand = diagnose(entry, { tablesDir, vpxLog: solo, legacyBases: [] }).find((f) => f.code === 'musicMissing')!;
    assert.equal(hand.pick?.file, true);
    assert.deepEqual(legacyPickOps(path.join(old, 'Music'), hand.pick!), [{ op: 'copy', from: path.join(old, 'Music', 'theme.mp3'), to: hand.pick!.dest, keep: true }]);
    assert.deepEqual(legacyPickOps(root, hand.pick!), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('DMD : FlexDMD ou UltraDMD, dossier incomplet complété sans rien écraser', () => {
  const { root, tablesDir, vpx, folder, old } = setup();
  try {
    assert.deepEqual(dmdFolderNames('X.UltraDMD'), ['X.UltraDMD', 'X.FlexDMD']);
    assert.deepEqual(dmdFolderNames('DMD'), ['DMD']);
    // Le script veut .UltraDMD, l'ancienne installation avait .FlexDMD.
    const script = scriptFacts(`With FlexDMD${CRLF}  .ProjectFolder = "./ChampionsLeague2023.UltraDMD/"${CRLF}End With${CRLF}`);
    write(path.join(old, 'Tables', 'ChampionsLeague2023.FlexDMD', 'intro.png'), 'img');
    const entry = scanTables(tablesDir)[0]!;
    assert.equal(diagnose(entry, { tablesDir, script, legacyBases: [old] }).find((f) => f.code === 'dmdFolderMissing')!.fix?.ops.length, 1);
    // Dossier présent mais images absentes (« Asset not loaded ») : l'ancien dossier les apporte sans écraser.
    const dmd = path.join(folder, 'ChampionsLeague2023.UltraDMD');
    write(path.join(dmd, 'garde.png'), 'garde');
    write(path.join(old, 'Tables', 'ChampionsLeague2023.UltraDMD', 'fond.png'), 'fond');
    write(path.join(old, 'Tables', 'ChampionsLeague2023.UltraDMD', 'garde.png'), 'ancien');
    const asset = (f: string) => `2026-11-23 10:16:02.000 ERROR [Main] [FlexDMD:Flex::AssetManager::Open@300] Asset not loaded: ${path.join(dmd, f)}`;
    const images = diagnose(entry, { tablesDir, vpxLog: [LOAD(vpx), asset('fond.png')].join(CRLF), legacyBases: [old] }).find((f) => f.code === 'dmdImagesMissing')!;
    applyOps(images.fix!.ops, { trashDir: path.join(root, 'corbeille') });
    assert.equal(fs.readFileSync(path.join(dmd, 'fond.png'), 'utf8'), 'fond');
    assert.equal(fs.readFileSync(path.join(dmd, 'garde.png'), 'utf8'), 'garde');
    // Aucune image équivalente sur le PC : à choisir.
    const lone = diagnose(entry, { tablesDir, vpxLog: [LOAD(vpx), asset('inconnu.png')].join(CRLF), legacyBases: [old] }).find((f) => f.code === 'dmdImagesMissing')!;
    assert.equal(lone.fix, undefined);
    assert.equal(lone.pick?.dest, dmd);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
