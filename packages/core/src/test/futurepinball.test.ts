// Future Pinball, premier niveau (packages/core/src/futurepinball.ts) : détection simulée, tables du jeu,
// ligne de commande exacte, ajout d'un .fpt factice à l'inventaire, aucune alerte propre à VPX.
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import {
  addFuturePinballTable,
  createVpsDb,
  diagnose,
  findFuturePinball,
  FUTURE_PINBALL_EXE,
  futurePinballAt,
  futurePinballCandidates,
  futurePinballCommand,
  futurePinballCommandLine,
  futurePinballDmdMirror,
  futurePinballInstalledTables,
  futurePinballName,
  futurePinballPlacement,
  isVpxTable,
  matchVps,
  readFuturePinballConfig,
  scanTables,
  TABLE_ENGINES,
  tableBaseName,
  tableFileEmulator,
  tableFilter,
  matchesFilter,
  writeFuturePinballConfig,
  type VpsGame,
} from '../index';

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cp-fp-'));
}

/** Faux Future Pinball : l'exécutable (vide) et son dossier Tables. */
function fakeGame(root: string, tables: string[] = []): string {
  const dir = path.join(root, 'Future Pinball');
  fs.mkdirSync(path.join(dir, 'Tables'), { recursive: true });
  fs.writeFileSync(path.join(dir, FUTURE_PINBALL_EXE), '');
  for (const t of tables) {
    fs.mkdirSync(path.dirname(path.join(dir, 'Tables', t)), { recursive: true });
    fs.writeFileSync(path.join(dir, 'Tables', t), `FPT ${t}`);
  }
  return dir;
}

const VPS_GAMES: VpsGame[] = [
  { id: 'mm-game', name: 'Medieval Madness', manufacturer: 'Williams', year: 1997, tableFiles: [{ id: 'a', tableFormat: 'VPX' }, { id: 'b', tableFormat: 'FP' }] } as VpsGame,
  { id: 'fp-only', name: 'Space Station Adventure', manufacturer: 'Original', year: 2008, tableFiles: [{ id: 'c', tableFormat: 'FP' }] } as VpsGame,
  { id: 'vpx-only', name: 'Space Station', manufacturer: 'Williams', year: 1987, tableFiles: [{ id: 'd', tableFormat: 'VPX' }] } as VpsGame,
];

test('emplacements habituels : C:\\Games, racine et Program Files sur C:, D: et E:', () => {
  const list = futurePinballCandidates();
  for (const dir of ['C:\\Games\\Future Pinball', 'C:\\Future Pinball', 'D:\\Future Pinball', 'E:\\Games\\Future Pinball', 'C:\\Program Files (x86)\\Future Pinball']) assert.ok(list.includes(dir), dir);
});

test('détection simulée : premier emplacement qui a « Future Pinball.exe » ; dossier choisi gardé et préféré', () => {
  const root = tmp();
  const game = fakeGame(root);
  const other = fakeGame(path.join(root, 'autre'));
  const found = findFuturePinball({ candidates: [path.join(root, 'absent'), game] });
  assert.equal(found?.exe, path.join(game, FUTURE_PINBALL_EXE));
  assert.equal(found?.tablesDir, path.join(game, 'Tables'));
  assert.equal(found?.source, 'found');
  assert.equal(findFuturePinball({ candidates: [path.join(root, 'absent')] }), undefined);

  // Choisi à la main : son exécutable, son dossier ou son dossier Tables.
  assert.equal(futurePinballAt(path.join(other, FUTURE_PINBALL_EXE))?.gameDir, other);
  assert.equal(futurePinballAt(other)?.gameDir, other);
  assert.equal(futurePinballAt(path.join(other, 'Tables'))?.gameDir, other);
  assert.equal(futurePinballAt(root), undefined);

  const data = path.join(root, 'data');
  writeFuturePinballConfig(data, path.join(other, FUTURE_PINBALL_EXE));
  assert.deepEqual(readFuturePinballConfig(data), { exe: path.join(other, FUTURE_PINBALL_EXE) });
  const chosen = findFuturePinball({ dataDir: data, candidates: [game] });
  assert.equal(chosen?.gameDir, other);
  assert.equal(chosen?.source, 'chosen');
  // Le dossier choisi a disparu : retour aux emplacements habituels.
  fs.rmSync(other, { recursive: true });
  assert.equal(findFuturePinball({ dataDir: data, candidates: [game] })?.gameDir, game);
  writeFuturePinballConfig(data, undefined);
  assert.deepEqual(readFuturePinballConfig(data), {});
});

test('tables du jeu : les .fpt du dossier Tables et de ses sous-dossiers, triées', () => {
  const root = tmp();
  const game = fakeGame(root, ['Zebra.fpt', 'Medieval Madness (Williams 1997).fpt', 'Pack/Alien.FPT', 'notes.txt', 'Pack/Deep/Deeper/Hidden.fpt']);
  const found = futurePinballInstalledTables({ tablesDir: path.join(game, 'Tables') });
  assert.deepEqual(found.map((f) => path.basename(f)), ['Alien.FPT', 'Medieval Madness (Williams 1997).fpt', 'Zebra.fpt']);
  assert.deepEqual(futurePinballInstalledTables({ tablesDir: path.join(root, 'absent') }), []);
});

test('ligne de commande exacte : "Future Pinball.exe" /open "<table>.fpt" /play /exit, depuis le dossier du jeu', () => {
  const install = { exe: 'C:\\Games\\Future Pinball\\Future Pinball.exe', gameDir: 'C:\\Games\\Future Pinball' };
  const table = 'D:\\Cyber Pinball\\Tables\\Medieval Madness (Williams 1997)\\Medieval Madness.fpt';
  const command = futurePinballCommand(install, table);
  assert.deepEqual(command, { file: install.exe, args: ['/open', table, '/play', '/exit'], cwd: install.gameDir });
  assert.equal(futurePinballCommandLine(command!), `"C:\\Games\\Future Pinball\\Future Pinball.exe" /open "${table}" /play /exit`);
  // Un chemin que la ligne de commande ne saurait passer, ou pas une table : refusé, jamais lancé.
  assert.equal(futurePinballCommand(install, 'D:\\a"b.fpt'), undefined);
  assert.equal(futurePinballCommand(install, 'D:\\table.vpx'), undefined);
});

test('DMD recopié : dmdext du dossier du jeu, avec son DmdDevice.ini, la ligne de PinUP Popper ; sans .ini, rien', () => {
  const root = tmp();
  const game = fakeGame(root);
  const table = 'D:\\Cyber Pinball\\Tables\\Retroflair (Original 2012)\\Retroflair - BAM Edition.fpt';
  assert.equal(futurePinballDmdMirror({ gameDir: game }, table), undefined, 'pas de dmdext');
  fs.writeFileSync(path.join(game, 'dmdext.exe'), '');
  assert.equal(futurePinballDmdMirror({ gameDir: game }, table), undefined, 'dmdext sans son DmdDevice.ini : son DMD virtuel s’ouvrirait n’importe où');
  fs.writeFileSync(path.join(game, 'DmdDevice.ini'), '[virtualdmd]\nenabled = true\n');
  assert.deepEqual(futurePinballDmdMirror({ gameDir: game }, table), {
    file: path.join(game, 'dmdext.exe'),
    args: ['mirror', '--source=futurepinball', '-q', '--virtual-stay-on-top', '--fps', '60', '-g', 'Retroflair - BAM Edition', `--use-ini=${path.join(game, 'DmdDevice.ini')}`],
    cwd: game,
  });
  // Rangé dans un sous-dossier dmdext du jeu : trouvé aussi.
  const other = fakeGame(path.join(root, 'autre'));
  fs.mkdirSync(path.join(other, 'dmdext'));
  fs.writeFileSync(path.join(other, 'dmdext', 'dmdext.exe'), '');
  fs.writeFileSync(path.join(other, 'dmdext', 'DmdDevice.ini'), '');
  assert.equal(futurePinballDmdMirror({ gameDir: other }, table)?.cwd, path.join(other, 'dmdext'));
});

test('BAM installé : la partie passe par BAM\\FPLoader.exe, avec la ligne des autres front-ends, depuis le dossier BAM', () => {
  const root = tmp();
  const game = fakeGame(root);
  // Sans dossier BAM : pas de lanceur, le jeu seul.
  assert.equal(futurePinballAt(game)?.loader, undefined);
  fs.mkdirSync(path.join(game, 'BAM'));
  fs.writeFileSync(path.join(game, 'BAM', 'FPLoader.exe'), '');
  const install = futurePinballAt(game)!;
  assert.equal(install.loader, path.join(game, 'BAM', 'FPLoader.exe'));
  assert.equal(findFuturePinball({ candidates: [game] })?.loader, install.loader);
  const table = 'D:\\Cyber Pinball\\Tables\\Retroflair (Original 2012)\\Retroflair - BAM Edition.fpt';
  const command = futurePinballCommand(install, table);
  assert.deepEqual(command, { file: install.loader, args: ['/open', table, '/play', '/exit', '/arcaderender', '/STAYINRAM'], cwd: path.join(game, 'BAM'), bam: true });
  assert.equal(futurePinballCommandLine(command!), `"${install.loader}" /open "${table}" /play /exit /arcaderender /STAYINRAM`);
  assert.equal(futurePinballCommand(install, 'D:\\a"b.fpt'), undefined);
});

test('inventaire : un .fpt est une table de Future Pinball, avec son nom de logiciel', () => {
  assert.equal(tableFileEmulator('Medieval Madness.fpt'), 'futurepinball');
  assert.equal(tableFileEmulator('ALIEN.FPT'), 'futurepinball');
  assert.equal(tableFileEmulator('table.vpx'), 'vpx');
  assert.equal(tableBaseName('C:\\x\\Alien.fpt'), 'Alien');
  assert.equal(TABLE_ENGINES.futurepinball.short, 'Future Pinball');
  assert.equal(isVpxTable({ emulator: 'futurepinball' }), false);
  assert.equal(isVpxTable({ emulator: 'vpx' }), true);
  // « Choisir des fichiers… » d'Ajouter une table montre les .fpt.
  assert.equal(matchesFilter('Alien.fpt', tableFilter()), true);
});

test('nom : la base VPS (jeux qui existent en Future Pinball d’abord), sinon le nom du fichier', () => {
  const db = createVpsDb(VPS_GAMES);
  assert.deepEqual(futurePinballName('C:\\FP\\Tables\\Medieval Madness (Williams 1997) FizX 3.3.fpt', db), { title: 'Medieval Madness', manufacturer: 'Williams', year: 1997, vps: 'mm-game' });
  // Sans base, ou un nom qu'elle ne reconnaît pas : le nom du fichier.
  assert.deepEqual(futurePinballName('C:\\FP\\Tables\\Medieval Madness (Williams 1997) FizX 3.3.fpt'), { title: 'Medieval Madness', manufacturer: 'Williams', year: 1997 });
  assert.deepEqual(futurePinballName('C:\\FP\\Tables\\Zorglub Quest.fpt', db), { title: 'Zorglub Quest' });
  // Format FP : le jeu qui n'existe qu'en Future Pinball n'est plus relégué derrière celui de VPX.
  const fp = matchVps(db, { names: ['Space Station Adventure'], format: 'FP' }).candidates[0];
  assert.equal(fp?.game.id, 'fp-only');
  const vpx = matchVps(db, { names: ['Space Station Adventure'] }).candidates.find((c) => c.game.id === 'fp-only');
  assert.ok(vpx && fp && vpx.score < fp.score);
});

test('ajout d’un .fpt factice : son dossier, le fichier lié ou copié, son .info ; l’original intact ; pas deux fois', async () => {
  const root = tmp();
  const game = fakeGame(root, ['Medieval Madness (Williams 1997) FizX 3.3.fpt']);
  const source = path.join(game, 'Tables', 'Medieval Madness (Williams 1997) FizX 3.3.fpt');
  const tablesDir = path.join(root, 'Cyber Pinball', 'Tables');
  fs.mkdirSync(tablesDir, { recursive: true });
  // La même machine déjà là en VPX : la table de Future Pinball garde un dossier à elle.
  fs.mkdirSync(path.join(tablesDir, 'Medieval Madness (Williams 1997)'));
  fs.writeFileSync(path.join(tablesDir, 'Medieval Madness (Williams 1997)', 'Medieval Madness (Williams 1997).vpx'), 'VPX');

  const db = createVpsDb(VPS_GAMES);
  const added = await addFuturePinballTable(tablesDir, source, { db });
  assert.equal(added.already, false);
  assert.equal(added.entry.emulator, 'futurepinball');
  assert.equal(added.entry.title, 'Medieval Madness');
  assert.equal(added.entry.manufacturer, 'Williams');
  assert.equal(added.entry.year, 1997);
  assert.equal(added.entry.info.Info?.VPSId, 'mm-game');
  assert.equal(path.basename(added.entry.folder), 'Medieval Madness (Williams 1997) Future Pinball');
  assert.equal(fs.readFileSync(added.entry.file, 'utf8'), fs.readFileSync(source, 'utf8'));
  assert.ok(fs.existsSync(source), 'l’original reste dans Future Pinball');
  // Même disque : lien physique, aucune place en plus.
  assert.equal(added.linked, true);
  assert.ok(fs.statSync(source).nlink >= 2);

  const scanned = scanTables(tablesDir);
  assert.deepEqual(scanned.map((e) => e.emulator).sort(), ['futurepinball', 'vpx']);

  const again = await addFuturePinballTable(tablesDir, source, { db });
  assert.equal(again.already, true);
  assert.equal(scanTables(tablesDir).length, 2);

  // Sans lien (link: false), une copie ; sans base VPS, le nom du fichier.
  const other = path.join(root, 'usb', 'Zorglub Quest.fpt');
  fs.mkdirSync(path.dirname(other), { recursive: true });
  fs.writeFileSync(other, 'FPT Z');
  const copied = await addFuturePinballTable(tablesDir, other, { link: false });
  assert.equal(copied.linked, false);
  assert.equal(copied.entry.title, 'Zorglub Quest');
  assert.equal(fs.statSync(other).nlink, 1);
  await assert.rejects(addFuturePinballTable(tablesDir, path.join(root, 'absent.fpt')));
  await assert.rejects(addFuturePinballTable(tablesDir, path.join(root, 'x.vpx')));
});

test('aucune alerte propre à VPX sur une table de Future Pinball : ni ROM, ni PuP-Pack, ni fronton', async () => {
  const root = tmp();
  const tablesDir = path.join(root, 'Tables');
  const source = path.join(root, 'Terminator 2 (Williams 1991).fpt');
  fs.mkdirSync(tablesDir, { recursive: true });
  fs.writeFileSync(source, 'FPT');
  const { entry } = await addFuturePinballTable(tablesDir, source);
  // Même avec un script qui réclamerait une ROM (cache d'une autre table, erreur de lecture).
  const roms = { usesPinmame: true, roms: ['t2_l8'] } as never;
  assert.deepEqual(diagnose(entry, { tablesDir, script: roms, romLibrary: path.join(root, 'roms') }), []);
  assert.deepEqual(diagnose(entry, { tablesDir, script: { error: 'illisible' } }), []);
  assert.deepEqual(diagnose(entry, { tablesDir }), []);
});

test('fenêtre : posée sur le playfield quand elle s’ouvre ailleurs en fenêtre ; le plein écran reste où le jeu l’a mis', () => {
  const playfield = { x: 1920, y: 0, width: 1080, height: 1920 };
  const main = { x: 0, y: 0, width: 1920, height: 1080 };
  const displays = [main, playfield];
  assert.deepEqual(futurePinballPlacement({ x: 100, y: 100, width: 800, height: 600 }, playfield, displays), playfield);
  assert.equal(futurePinballPlacement({ ...main }, playfield, displays), undefined);
  assert.equal(futurePinballPlacement({ ...playfield }, playfield, displays), undefined);
  assert.equal(futurePinballPlacement({ x: 100, y: 100, width: 800, height: 600 }, undefined, displays), undefined);
});
