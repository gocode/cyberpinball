// Reprise des médias de Popper : la base du menu (GameName → GameFileName) rattache les médias à la
// table reprise sous le nom de son .vpx, et un jeu dont la table est dans l'installation sans être
// encore dans Cyber Pinball est signalé comme tel, avec son .vpx à reprendre (signalé par un joueur
// le 20/11/2026 : 63 jeux « Sans table », « Aucune table installée ne porte ce nom »).
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { findInstallation, installationGameFiles } from '../installation';
import { installedTables, matchMediaGame, planInstallationMedias, scanInstallation } from '../mediaimport';
import { scanTables } from '../tables';

function write(file: string, content = 'x'): string {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
}

/** Base de Popper réduite à ce que la reprise lit (Emulators, Games). */
function popperDb(file: string, dirGames: string, dirMedia: string, games: { name: string; file: string }[]): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('create table Emulators (EMUID integer, EmuName text, DirGames text, DirMedia text, DirRoms text, GamesExt text)');
  db.exec('create table Games (GameID integer, EMUID integer, GameName text, GameFileName text, GameDisplay text, ROM text, Visible integer)');
  db.prepare('insert into Emulators values (1, ?, ?, ?, ?, ?)').run('Visual Pinball X', dirGames, dirMedia, '', 'vpx');
  games.forEach((g, i) => db.prepare('insert into Games values (?, 1, ?, ?, ?, null, 1)').run(i + 1, g.name, g.file, g.name));
  db.close();
}

const ACDC_VPX = 'AC-DC LUCI Premium (Stern 2013)';
const ACDC_FOLDER = 'AC-DC LUCI (Stern 2013)';

function installation() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-reprise-medias-'));
  const vp = path.join(root, 'vPinball');
  write(path.join(vp, 'VisualPinball', 'VPinballX64.exe'));
  const games = path.join(vp, 'VisualPinball', 'Tables');
  const acdc = write(path.join(games, `${ACDC_VPX}.vpx`));
  const batman = write(path.join(games, 'Batman66_1.1.0.vpx'));
  const pinup = path.join(vp, 'PinUPSystem');
  const media = path.join(pinup, 'POPMedia', 'Visual Pinball X');
  popperDb(path.join(pinup, 'PUPDatabase.db'), games, media, [
    { name: 'AC-DC Premium', file: `${ACDC_VPX}.vpx` },
    { name: 'Batman 66', file: 'Batman66_1.1.0.vpx' },
  ]);
  write(path.join(media, 'Wheel', 'AC-DC Premium.png'), 'logo acdc');
  write(path.join(media, 'Wheel', 'Batman 66.png'));
  write(path.join(media, 'Backglass', 'Batman 66.mp4'));
  write(path.join(media, 'Wheel', 'Funhouse (Williams 1990).png'));

  // Cyber Pinball : AC-DC reprise dans un dossier à son titre, sous le nom de son .vpx.
  const own = path.join(root, 'CyberPinball');
  const tables = path.join(own, 'tables');
  write(path.join(tables, ACDC_FOLDER, `${ACDC_VPX}.vpx`));
  return { root, own, tables, pinup, acdc, batman };
}

test('reprise des médias : la base de Popper rattache « AC-DC Premium » à la table reprise sous le nom de son .vpx', () => {
  const i = installation();
  const scan = scanInstallation(i.pinup);
  const tables = installedTables(scanTables(i.tables));

  // Sans la base : le nom des médias ne ressemble à aucune table (le défaut signalé).
  assert.equal(matchMediaGame('AC-DC Premium', tables), undefined);

  const layout = findInstallation(i.pinup, [i.own])!;
  assert.ok(layout, 'installation de Popper reconnue');
  const menu = installationGameFiles(layout);
  assert.deepEqual(menu.get('ac-dc premium'), [i.acdc]);
  assert.deepEqual(menu.get('batman 66'), [i.batman]);

  const plan = planInstallationMedias(scan, tables, { menu });
  assert.deepEqual(
    plan.tables.map((t) => [t.table.dest.name, t.how, t.planned.map((m) => m.target)]),
    [[ACDC_FOLDER, ['menu'], [`(Wheel) ${ACDC_FOLDER}.png`]]],
  );
  fs.rmSync(i.root, { recursive: true });
});

test('reprise des médias : un jeu dont la table est dans l’installation dit qu’elle n’est pas encore dans Cyber Pinball, avec son .vpx', () => {
  const i = installation();
  const scan = scanInstallation(i.pinup);
  const tables = installedTables(scanTables(i.tables));
  const menu = installationGameFiles(findInstallation(i.pinup, [i.own])!);

  const plan = planInstallationMedias(scan, tables, { menu });
  const byGame = Object.fromEntries(plan.unmatched.map((u) => [u.game, u]));
  assert.deepEqual(Object.keys(byGame).sort(), ['Batman 66', 'Funhouse (Williams 1990)']);
  assert.deepEqual(byGame['Batman 66']!.vpx, [i.batman]);
  assert.equal(byGame['Batman 66']!.sources.length, 2);
  assert.match(byGame['Batman 66']!.reason, /pas encore dans Cyber Pinball/);
  assert.equal(byGame['Funhouse (Williams 1990)']!.vpx, undefined);
  assert.match(byGame['Funhouse (Williams 1990)']!.reason, /Ni dans Cyber Pinball, ni parmi les tables de cette installation/);

  // Sans installation reconnue autour des médias : le message renvoie à la reprise des tables.
  const bare = planInstallationMedias(scan, tables);
  assert.ok(bare.unmatched.every((u) => !u.vpx && /Depuis une autre installation/.test(u.reason)), JSON.stringify(bare.unmatched));
  // Rien n'a changé dans l'installation d'origine.
  assert.equal(fs.readFileSync(path.join(i.pinup, 'POPMedia', 'Visual Pinball X', 'Wheel', 'AC-DC Premium.png'), 'utf8'), 'logo acdc');
  fs.rmSync(i.root, { recursive: true });
});

test('reprise des médias : plusieurs versions du jeu dans l’installation, une seule dans Cyber Pinball, rattachée sans ambiguïté', () => {
  const i = installation();
  const tables = installedTables(scanTables(i.tables));
  // Le menu donne deux .vpx au jeu ; seul le premier est dans Cyber Pinball.
  const r = matchMediaGame('AC-DC Premium', tables, undefined, [ACDC_VPX, 'AC-DC Pro (Stern 2012)']);
  assert.ok(r && 'table' in r && r.how === 'menu' && r.table.dest.name === ACDC_FOLDER, JSON.stringify(r));
  fs.rmSync(i.root, { recursive: true });
});
