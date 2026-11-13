// Reprise d'une table, quel que soit le rangement de l'installation d'origine. Le 13/11/2026, une
// installation de Popper dont chaque table était dans son propre sous-dossier de Tables
// (Tables\X-Files Siggis Mod\X-Files (Sega 1997).vpx) a été reprise sans rien : ni fronton, ni
// réglages, ni PuP-Pack, ni ROM, ni médias. Ici, chaque rangement rencontré chez les joueurs :
// un dossier par table (avec ce qu'on y trouve vraiment : journaux, rapports de plantage, archive
// d'origine, sauvegardes du fronton, ROM à part, autre version), un dossier qui regroupe plusieurs
// jeux, PinballX et ses descriptions, Popper et son dossier de tables à un autre nom, VPinMAME
// connu par le seul registre, la musique jouée par le script.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { scriptFacts } from '../doctor';
import { findInstallation, installationCompanions, listInstallationTables, type CompanionFacts } from '../installation';
import { buildZip } from '../romzip';
import { classifyFile } from '../tablefiles';
import { planImport } from '../tableimport';

function write(file: string, data: string | Buffer = 'x'): string {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
  return file;
}

function romZip(file: string, chip: string): string {
  const raw = write(path.join(path.dirname(file), '.chips', chip), Buffer.alloc(64, 3));
  write(file, buildZip([{ from: raw, name: chip }]));
  fs.rmSync(path.dirname(raw), { recursive: true });
  return file;
}

/** Base de Popper réduite à ce que la reprise lit (Emulators, Games). */
function popperDb(
  file: string,
  emulator: { dirGames: string; dirMedia: string; dirRoms?: string },
  games: { name: string; file: string; rom?: string; visible?: boolean }[],
  playlists?: { name: string; visible?: boolean; query?: string; games?: number[] }[],
): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('create table Emulators (EMUID integer, EmuName text, DirGames text, DirMedia text, DirRoms text, GamesExt text)');
  db.exec('create table Games (GameID integer, EMUID integer, GameName text, GameFileName text, GameDisplay text, ROM text, Visible integer)');
  db.prepare('insert into Emulators values (1, ?, ?, ?, ?, ?)').run('Visual Pinball X', emulator.dirGames, emulator.dirMedia, emulator.dirRoms ?? '', 'vpx');
  db.prepare('insert into Emulators values (2, ?, ?, ?, ?, ?)').run('Future Pinball', 'C:\\FP\\Tables', 'C:\\FP\\Media', '', 'fpt');
  games.forEach((g, i) => db.prepare('insert into Games values (?, 1, ?, ?, ?, ?, ?)').run(i + 1, g.name, g.file, g.name, g.rom ?? null, g.visible === false ? 0 : 1));
  if (playlists) {
    // Comme Popper : listes faites à la main (PlayListDetails) ou automatiques (requête sur Games).
    db.exec('create table PlayLists (PlayListID integer, PlayName text, PlayDisplay text, Visible integer, PlayListType integer, PlayListSQL text)');
    db.exec('create table PlayListDetails (UniqueID integer, PlayListID integer, GameID integer, Visible integer)');
    playlists.forEach((l, i) => {
      db.prepare('insert into PlayLists values (?, ?, ?, ?, ?, ?)').run(i + 1, l.name, l.name, l.visible === false ? 0 : 1, l.query ? 1 : 0, l.query ?? null);
      for (const g of l.games ?? []) db.prepare('insert into PlayListDetails values (null, ?, ?, 1)').run(i + 1, g);
    });
  }
  db.close();
}

const SPLIT = 'X-Files (Sega 1997)';
const LORD_NEW = 'TimeLord-4.0.2a-(OriginalGame2025)-RusstyT';
const LORD_OLD = 'TimeLord3.1.1b';

/** Installation de Popper, un dossier par table, comme celle d'un PinCab réel. */
function splitInstallation() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-dispositions-'));
  const vp = path.join(root, 'vPinball');
  const vpx = path.join(vp, 'VisualPinball');
  const tables = path.join(vpx, 'Tables');
  write(path.join(vpx, 'VPinballX64.exe'));
  const pinup = path.join(vp, 'PinUPSystem');
  const media = path.join(pinup, 'POPMedia', 'Visual Pinball X');

  // X-Files : son dossier, ce qu'il contient vraiment.
  const xdir = path.join(tables, 'X-Files Siggis Mod');
  const xfiles = write(path.join(xdir, `${SPLIT}.vpx`));
  for (const ext of ['.directb2s', '.ini', '.res']) write(path.join(xdir, `${SPLIT}${ext}`));
  write(path.join(xdir, 'B2STableSettings.xml'));
  write(path.join(xdir, 'X-Files_wheel.png'));
  write(path.join(xdir, 'altsound.log'));
  write(path.join(xdir, 'vpinball.log'));
  write(path.join(xdir, 'crash.dmp'));
  write(path.join(xdir, 'crash.txt'));
  write(path.join(xdir, 'cache', SPLIT, 'used_textures.xml'));
  write(path.join(xdir, 'Theme Tune.mp3'));
  // L'archive d'où vient la table : pas une ROM.
  write(path.join(xdir, `${SPLIT} full dmd.zip`), buildZip([{ from: write(path.join(root, 'tmp', 'a.directb2s')), name: 'a.directb2s' }]));
  write(path.join(xdir, 'bkp', `${SPLIT} (original).directb2s`));
  // Image d'un autre émulateur (Spike 2, VPinSPA) rangée avec la table : pas une ROM de PinMAME, mais à sa place.
  write(path.join(xdir, 'VPinMame', 'roms', 'spagb100.zip'), buildZip([{ from: write(path.join(root, 'tmp', 'SternGB.dll')), name: 'SternGB.dll' }]));
  write(path.join(pinup, 'PUPVideos', 'xfiles', 'screens.pup'));
  for (const type of ['Wheel', 'BackGlass', 'Loading', 'PlayField', 'AudioLaunch']) write(path.join(media, type, `${SPLIT}.${type === 'AudioLaunch' ? 'mp3' : type === 'Wheel' ? 'png' : 'mp4'}`), Buffer.alloc(16, 1));

  // TimeLord : deux versions dans son dossier ; Popper ne connaît que l'ancienne, ses médias portent son nom.
  const ldir = path.join(tables, 'Timelord');
  const lordNew = write(path.join(ldir, `${LORD_NEW}.vpx`));
  write(path.join(ldir, `${LORD_NEW}.directb2s`));
  const lordOld = write(path.join(ldir, `${LORD_OLD}.vpx`));
  write(path.join(ldir, `${LORD_OLD}.directb2s`));
  write(path.join(pinup, 'PUPVideos', 'TimeLord', 'screens.pup'));
  write(path.join(media, 'Loading', `${LORD_OLD}.mp4`), Buffer.alloc(16, 1));
  write(path.join(media, 'Wheel', `${LORD_OLD}.png`), Buffer.alloc(16, 1));

  // Stranger Things : pack au nom raccourci, ROM dans le dossier de la table.
  const sdir = path.join(tables, 'Stranger Things 4 LPE');
  const stranger = write(path.join(sdir, 'Stranger Things 4 LPE.vpx'));
  write(path.join(pinup, 'PUPVideos', 'STRANGERTHINGS4', 'screens.pup'));
  romZip(path.join(sdir, 'VPinMame', 'roms', 'st_162h.zip'), 'st_162h.bin');

  // Akira : à plat dans Tables, musique dans VisualPinball\Music.
  const akira = write(path.join(tables, 'Akira (Original 2021).vpx'));
  write(path.join(vpx, 'Music', 'Akira', 'track1.mp3'));
  write(path.join(vpx, 'Music', 'Autre', 'track1.mp3'));

  // Un dossier qui regroupe deux jeux : il n'appartient à aucun des deux.
  const wdir = path.join(tables, 'Williams');
  const t2 = write(path.join(wdir, 'Terminator 2 (Williams 1991).vpx'));
  write(path.join(wdir, 'Terminator 2 (Williams 1991).directb2s'));
  write(path.join(wdir, 'Taxi (Williams 1988).vpx'));
  write(path.join(wdir, 'Lisez-moi.txt'));

  // VPinMAME ailleurs, connu par le registre et par Popper.
  const vpm = path.join(root, 'Emulateurs', 'VPinMAME');
  romZip(path.join(vpm, 'roms', 't2_l8.zip'), 't2_l8.rom');
  write(path.join(vpm, 'nvram', 't2_l8.nv'));
  write(path.join(vpm, 'altsound', 't2_l8', 'altsound.csv'));

  popperDb(
    path.join(pinup, 'PUPDatabase.db'),
    { dirGames: tables, dirMedia: media, dirRoms: path.join(vpm, 'roms') },
    [
      { name: SPLIT, file: `X-Files Siggis Mod\\${SPLIT}.vpx` },
      { name: LORD_OLD, file: `Timelord\\${LORD_OLD}.vpx`, visible: false },
    ],
    [
      { name: 'Home', games: [1] },
      { name: 'Visual Pinball X', query: 'Select * from Games where EMUID=1 AND visible=1 Order BY GameDisplay' },
      { name: 'Jeux tests', games: [2] },
      { name: 'Just Added', query: 'Select * from Games where visible=1 order by dateAdded DESC LIMIT(15) ' },
      { name: 'Cachée', visible: false, games: [1, 2] },
    ],
  );
  const own = path.join(root, 'CyberPinball');
  fs.mkdirSync(path.join(own, 'tables'), { recursive: true });
  return { root, vp, vpx, tables, pinup, media, vpm, xdir, xfiles, ldir, lordNew, lordOld, sdir, stranger, akira, wdir, t2, own };
}

const hintsOf = (i: ReturnType<typeof splitInstallation>) => ({ roms: path.join(i.vpm, 'roms'), nvram: path.join(i.vpm, 'nvram'), vpx: i.vpx });

test('dispositions : une table dans son propre dossier arrive avec tout ce qu’il contient, sans journaux ni archive', () => {
  const i = splitInstallation();
  const { sources, reports } = installationCompanions([{ path: i.xfiles, mode: 'copy' }], () => ({ usesPinmame: false, roms: [] }), [i.own], hintsOf(i));
  assert.equal(sources[0]!.path, i.xdir, 'le dossier de la table remplace son .vpx');
  const parts = reports[0]!.found.map((c) => c.part).sort();
  assert.deepEqual([...new Set(parts)], ['folder', 'media', 'pup']);
  assert.equal(reports[0]!.found.filter((c) => c.part === 'media').length, 5, 'tous ses médias de Popper : Loading compris');

  const plan = planImport(sources, { tablesDir: path.join(i.own, 'tables') });
  assert.equal(plan.tables.length, 1);
  const tp = plan.tables[0]!;
  const to = tp.steps.map((s) => path.relative(tp.folder, s.to));
  for (const want of [`${SPLIT}.vpx`, `${SPLIT}.ini`, `${SPLIT}.res`, 'B2STableSettings.xml', path.join('music', 'Theme Tune.mp3'), path.join('pupvideos', 'xfiles'), path.join('VPinMame', 'roms', 'spagb100.zip')]) assert.ok(to.includes(want), `${want}\n${to.join('\n')}`);
  assert.ok(tp.steps.some((s) => s.kind === 'backglass' && path.basename(s.from) === `${SPLIT}.directb2s` && path.basename(s.to) === `${SPLIT}.directb2s`), to.join('\n'));
  assert.ok(tp.steps.some((s) => s.media?.type === 'Loading'), 'vidéo de chargement');
  assert.ok(!to.some((f) => /\.(log|dmp)$|crash\.txt|used_textures|full dmd\.zip/i.test(f)), to.join('\n'));
  assert.deepEqual(plan.roms, [], 'l’archive d’origine n’est pas une ROM');
  assert.ok(plan.ignored.some((s) => s.endsWith('full dmd.zip')), 'l’archive est dite ignorée');
});

test('dispositions : deux versions dans un dossier — la cochée seule, ses médias sous le nom que Popper donne à l’autre', () => {
  const i = splitInstallation();
  const { sources, reports } = installationCompanions([{ path: i.lordNew, mode: 'copy' }], () => undefined, [i.own], hintsOf(i));
  const folder = sources[0]!;
  assert.equal(folder.path, i.ldir);
  assert.ok(folder.exclude?.some((x) => x === i.lordOld), 'l’autre version, non cochée, reste où elle est');
  assert.ok(folder.exclude?.some((x) => x.endsWith(`${LORD_OLD}.directb2s`)), 'avec son fronton');
  const found = reports[0]!.found;
  assert.equal(found.filter((c) => c.part === 'media').length, 2, found.map((c) => c.path).join('\n'));
  assert.ok(found.some((c) => c.part === 'pup' && c.path.endsWith('TimeLord')));
  const plan = planImport(sources, { tablesDir: path.join(i.own, 'tables') });
  const tp = plan.tables[0]!;
  assert.deepEqual(tp.steps.filter((s) => s.kind === 'table').map((s) => path.basename(s.from)), [`${LORD_NEW}.vpx`]);

  // Les deux cochées : un seul dossier, une seule table, deux versions.
  const both = installationCompanions([{ path: i.lordNew, mode: 'copy' }, { path: i.lordOld, mode: 'copy' }], () => undefined, [i.own], hintsOf(i));
  assert.equal(both.sources.filter((s) => s.path === i.ldir).length, 1);
  assert.ok(!both.sources.some((s) => /\.vpx$/i.test(s.path)));
  assert.equal(both.sources.find((s) => s.path === i.ldir)!.exclude, undefined);
  const plan2 = planImport(both.sources, { tablesDir: path.join(i.own, 'tables') });
  assert.equal(plan2.tables.length, 1);
  assert.equal(plan2.tables[0]!.steps.filter((s) => s.kind === 'table').length, 2);
});

test('dispositions : pack au nom raccourci, ROM gardée dans le dossier de la table, rien n’est dit manquant', () => {
  const i = splitInstallation();
  const facts: CompanionFacts = { usesPinmame: true, roms: ['st_162h'] };
  const { reports } = installationCompanions([{ path: i.stranger, mode: 'copy' }], () => facts, [i.own], hintsOf(i));
  assert.ok(reports[0]!.found.some((c) => c.part === 'pup' && c.path.endsWith('STRANGERTHINGS4')), reports[0]!.found.map((c) => c.path).join('\n'));
  // Son VPinMame à lui n'est pas pris pour celui de l'installation : la table garde son dossier.
  assert.ok(reports[0]!.found.some((c) => c.part === 'folder' && c.path === i.sdir), reports[0]!.found.map((c) => c.path).join('\n'));
  assert.deepEqual(reports[0]!.missing, []);
  assert.equal(findInstallation(i.sdir, [i.own], hintsOf(i))!.pinmame, i.vpm, 'celui que dit le registre, pas celui de la table');
});

test('dispositions : ROM décompressée en dossier, ou rangée un niveau plus bas (_src)', () => {
  const i = splitInstallation();
  const roms = path.join(i.vpx, 'VPinMAME', 'roms');
  write(path.join(roms, 'xfiles', 'xfcpu.303'), Buffer.alloc(64, 1));
  write(path.join(roms, 'xfiles', 'xfsndu7.512'), Buffer.alloc(64, 2));
  romZip(path.join(roms, '_src', 'stwr_a14.zip'), 'stwr_a14.bin');
  const one = (rom: string) => installationCompanions([{ path: i.xfiles, mode: 'copy' }], () => ({ usesPinmame: true, roms: [rom] }), [i.own], hintsOf(i)).reports[0]!;
  const xf = one('xfiles');
  assert.ok(xf.found.some((c) => c.part === 'rom' && c.path === path.join(roms, 'xfiles')), xf.found.map((c) => c.path).join('\n'));
  assert.deepEqual(xf.missing, []);
  const sw = one('stwr_a14');
  assert.ok(sw.found.some((c) => c.part === 'rom' && c.path === path.join(roms, '_src', 'stwr_a14.zip')));
  // Le dossier de puces devient une ROM de la bibliothèque, refaite en zip.
  const { sources } = installationCompanions([{ path: i.xfiles, mode: 'copy' }], () => ({ usesPinmame: true, roms: ['xfiles'] }), [i.own], hintsOf(i));
  const library = path.join(i.own, 'pinmame', 'roms');
  const plan = planImport(sources, { tablesDir: path.join(i.own, 'tables'), romLibrary: library, scripts: new Map([[i.xfiles.toLowerCase(), { usesPinmame: true, roms: ['xfiles'] }]]) as never });
  assert.deepEqual(plan.roms.map((r) => r.name), ['xfiles.zip']);
  assert.ok(plan.roms[0]!.versions[plan.roms[0]!.keep]!.build, 'refaite à plat');
});

test('dispositions : un dossier qui regroupe plusieurs jeux n’appartient à aucun ; ROM, sauvegarde et sons de VPinMAME connu par le registre', () => {
  const i = splitInstallation();
  const facts: CompanionFacts = { usesPinmame: true, roms: ['t2_l8'] };
  const { sources, reports } = installationCompanions([{ path: i.t2, mode: 'copy' }], () => facts, [i.own], hintsOf(i));
  assert.equal(sources[0]!.path, i.t2, 'le .vpx seul, pas le dossier Williams');
  assert.ok(!sources.some((s) => s.path.endsWith('Lisez-moi.txt') || s.path.includes('Taxi')));
  assert.deepEqual(reports[0]!.found.map((c) => c.part).sort(), ['altsound', 'backglass', 'nvram', 'rom']);
  const plan = planImport(sources, { tablesDir: path.join(i.own, 'tables'), scripts: new Map([[i.t2.toLowerCase(), { ...facts }]]) as never });
  const to = plan.tables[0]!.steps.map((s) => path.relative(plan.tables[0]!.folder, s.to));
  assert.ok(to.includes(path.join('pinmame', 'nvram', 't2_l8.nv')), to.join('\n'));
  assert.ok(to.includes(path.join('pinmame', 'roms', 't2_l8.zip')), to.join('\n'));
});

test('dispositions : la musique que le script joue suit la table, dans son sous-dossier', () => {
  const i = splitInstallation();
  const facts = scriptFacts('Sub Table1_Init\r\n  PlayMusic "Akira\\" & track & ".mp3"\r\n  PlayMusic MusicVar\r\nEnd Sub');
  assert.deepEqual(facts.music, ['Akira\\']);
  const { sources, reports } = installationCompanions([{ path: i.akira, mode: 'copy' }], () => facts, [i.own], hintsOf(i));
  assert.deepEqual(reports[0]!.found.map((c) => `${c.part}:${path.basename(c.path)}`), ['music:Akira']);
  const plan = planImport(sources, { tablesDir: path.join(i.own, 'tables') });
  const tp = plan.tables[0]!;
  assert.ok(tp.steps.some((s) => s.kind === 'music' && path.relative(tp.folder, s.to) === path.join('music', 'Akira')), tp.steps.map((s) => s.to).join('\n'));
});

test('dispositions : la liste montre les tables à toute profondeur, chacune avec ses médias', () => {
  const i = splitInstallation();
  const layout = findInstallation(i.vp, [i.own], hintsOf(i))!;
  assert.equal(layout.tables, i.tables);
  assert.ok(layout.romDirs.some((d) => d === path.join(i.vpm, 'roms')), 'ROM du registre et de Popper');
  const list = listInstallationTables(layout);
  const names = list.map((tb) => path.basename(tb.vpx)).sort();
  assert.deepEqual(names, ['Akira (Original 2021).vpx', 'Stranger Things 4 LPE.vpx', 'Taxi (Williams 1988).vpx', 'Terminator 2 (Williams 1991).vpx', `${LORD_NEW}.vpx`, `${LORD_OLD}.vpx`, `${SPLIT}.vpx`].sort());
  assert.equal(list.find((tb) => tb.vpx === i.lordNew)!.medias, 2, 'les médias de l’autre version du même dossier');
  assert.ok(list.find((tb) => tb.vpx === i.xfiles)!.backglass);
  // Listes de lecture de Popper : faites à la main ou automatiques ; ni la liste masquée, ni celle des derniers ajouts.
  const of = (vpx: string) => list.find((tb) => tb.vpx === vpx)!;
  assert.deepEqual(of(i.xfiles).playlists, ['Home', 'Visual Pinball X']);
  assert.equal(of(i.xfiles).active, true);
  assert.deepEqual(of(i.lordOld).playlists, ['Jeux tests'], 'masquée dans Popper, mais dans une liste faite à la main');
  assert.equal(of(i.lordOld).active, true);
  assert.deepEqual(of(i.lordNew).playlists, []);
  assert.equal(of(i.lordNew).active, false, 'sur le disque seulement');
  assert.equal(of(i.akira).active, false);
});

test('dispositions : PinballX dit quelles tables il joue (enabled), Popper sans listes n’en dit rien', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-actives-'));
  const tables = path.join(root, 'Visual Pinball', 'Tables');
  write(path.join(tables, 'Jouee.vpx'));
  write(path.join(tables, 'Rangee.vpx'));
  write(path.join(tables, 'Inconnue.vpx'));
  write(path.join(root, 'PinballX', 'Databases', 'Visual Pinball', 'Visual Pinball.xml'), '<menu><game name="Jouee"><enabled>True</enabled></game><game name="Rangee"><enabled>False</enabled></game></menu>');
  const list = listInstallationTables(findInstallation(tables)!);
  const active = Object.fromEntries(list.map((tb) => [path.basename(tb.vpx), tb.active]));
  assert.deepEqual(active, { 'Inconnue.vpx': false, 'Jouee.vpx': true, 'Rangee.vpx': false });

  const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-sans-listes-'));
  const games = path.join(bare, 'VPX', 'Tables');
  write(path.join(games, 'Seule.vpx'));
  popperDb(path.join(bare, 'PinUPSystem', 'PUPDatabase.db'), { dirGames: games, dirMedia: path.join(bare, 'PinUPSystem', 'POPMedia') }, [{ name: 'Seule', file: 'Seule.vpx' }]);
  assert.equal(listInstallationTables(findInstallation(games)!)[0]!.active, undefined, 'aucune liste : rien n’est caché');
});

test('dispositions : PinballX, tables ailleurs (TablePath), médias rangés sous la description du jeu', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-pinballx-'));
  const pbx = path.join(root, 'PinballX');
  const tables = path.join(root, 'Jeux', 'Mes tables VPX');
  const vpx = write(path.join(tables, 'T2 VPW 1.3.vpx'));
  write(path.join(tables, 'T2 VPW 1.3.directb2s'));
  write(path.join(pbx, 'Config', 'PinballX.ini'), `[VisualPinball]\r\nEnabled=True\r\nTablePath=${tables}\r\n`);
  write(
    path.join(pbx, 'Databases', 'Visual Pinball', 'Visual Pinball.xml'),
    '<menu>\r\n<game name="T2 VPW 1.3">\r\n<description>Terminator 2 - Judgment Day (Williams 1991)</description>\r\n<rom>t2_l8</rom>\r\n</game>\r\n</menu>',
  );
  write(path.join(pbx, 'Media', 'Visual Pinball', 'Wheel Images', 'Terminator 2 - Judgment Day (Williams 1991).png'), Buffer.alloc(16, 1));
  write(path.join(pbx, 'Media', 'Visual Pinball', 'Loading Videos', 'Terminator 2 - Judgment Day (Williams 1991).mp4'), Buffer.alloc(16, 1));
  const vpm = path.join(root, 'VPinMAME');
  romZip(path.join(vpm, 'roms', 't2_l8.zip'), 't2_l8.rom');

  const layout = findInstallation(tables, [], { roms: path.join(vpm, 'roms') })!;
  assert.ok(layout, 'reconnue par PinballX');
  assert.equal(layout.tables, tables);
  // Script illisible (aucune lecture) : la ROM que dit PinballX.
  const { reports } = installationCompanions([{ path: vpx, mode: 'copy' }], () => undefined, [], { roms: path.join(vpm, 'roms') });
  const parts = reports[0]!.found.map((c) => c.part).sort();
  assert.deepEqual(parts, ['backglass', 'media', 'media', 'rom']);
});

test('dispositions : Popper, dossier des tables à un autre nom, ROM dite par Popper', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-popper-'));
  const games = path.join(root, 'Flippers', 'VPX');
  const vpx = write(path.join(games, 'Medieval Madness', 'MM VPW.vpx'));
  write(path.join(games, 'Medieval Madness', 'MM VPW.directb2s'));
  const media = path.join(root, 'PinUPSystem', 'POPMedia', 'Visual Pinball X');
  write(path.join(media, 'Topper', 'Medieval Madness.mp4'), Buffer.alloc(16, 1));
  const roms = path.join(root, 'Flippers', 'VPinMAME', 'roms');
  romZip(path.join(roms, 'mm_109c.zip'), 'mm_109c.bin');
  popperDb(path.join(root, 'PinUPSystem', 'PUPDatabase.db'), { dirGames: games, dirMedia: media, dirRoms: roms }, [{ name: 'Medieval Madness', file: 'Medieval Madness\\MM VPW.vpx', rom: 'mm_109c' }]);

  const layout = findInstallation(path.dirname(vpx))!;
  assert.equal(layout.tables, games);
  const { sources, reports } = installationCompanions([{ path: vpx, mode: 'copy' }], () => undefined);
  assert.equal(sources[0]!.path, path.dirname(vpx), 'son dossier');
  assert.deepEqual(reports[0]!.found.map((c) => c.part).sort(), ['folder', 'media', 'rom']);
});

test('dispositions : journaux et rapports de plantage ne sont jamais pris pour une partie de table', () => {
  for (const f of ['vpinball.log', 'DirectOutput.log', 'altsound.log', 'crash.dmp', 'crash.txt', 'B2SDebug.log']) assert.equal(classifyFile(f), 'ignored', f);
});
