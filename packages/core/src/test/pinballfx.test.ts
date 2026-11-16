import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import {
  findEpicPinballFx,
  findPinballFx,
  findSteamPinballFx,
  parseVdf,
  PINBALLFX_TABLES,
  pinballFxBackglassFile,
  pinballFxCommand,
  pinballFxGetter,
  pinballFxEntryId,
  pinballFxTable,
  pinballFxTableId,
  pinballFxVpsImage,
  steamPinballFxDownloading,
} from '../pinballfx';
import { placeMissingMedia } from '../medias';
import { addPinballFxTable, pinballFxFolderName, removalTargets, scanTables } from '../tables';

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-pfx-'));
}

test('catalogue : numéros uniques, titres non vides', () => {
  const ids = PINBALLFX_TABLES.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const t of PINBALLFX_TABLES) {
    assert.ok(t.title.trim() && t.manufacturer.trim(), `table ${t.id}`);
    assert.ok(Number.isInteger(t.id) && t.id > 0);
  }
  assert.deepEqual(pinballFxTable(156), { id: 156, title: 'The Addams Family', manufacturer: 'Bally', year: 1992, vps: 'aT_GONvw' });
  assert.equal(pinballFxTable(9999), undefined);
});

test('identifiant d’inventaire : aller et retour', () => {
  assert.equal(pinballFxEntryId(75), 'pinballfx/75');
  assert.equal(pinballFxTableId('pinballfx/75'), 75);
  assert.equal(pinballFxTableId('Tables/AFM/AFM.vpx'), undefined);
  assert.equal(pinballFxTableId('pinballfx/abc'), undefined);
});

test('VDF : objets imbriqués, guillemets échappés, commentaires', () => {
  const root = parseVdf(`// en-tête
"libraryfolders"
{
  "0" { "path" "C:\\\\Program Files (x86)\\\\Steam" "apps" { "228980" "1" } }
  "1" { "path" "D:\\\\SteamLibrary" "label" "dit \\"jeux\\"" }
}`);
  const folders = root['libraryfolders'] as Record<string, Record<string, unknown>>;
  assert.equal(folders['0']!['path'], 'C:\\Program Files (x86)\\Steam');
  assert.equal(folders['1']!['label'], 'dit "jeux"');
});

test('Steam : jeu trouvé dans une bibliothèque secondaire', () => {
  const root = tempDir();
  const steam = path.join(root, 'Steam');
  const lib = path.join(root, 'SteamLibrary');
  fs.mkdirSync(path.join(steam, 'steamapps'), { recursive: true });
  fs.mkdirSync(path.join(lib, 'steamapps', 'common', 'Pinball FX'), { recursive: true });
  const esc = (p: string) => p.replace(/\\/g, '\\\\');
  fs.writeFileSync(
    path.join(steam, 'steamapps', 'libraryfolders.vdf'),
    `"libraryfolders" { "0" { "path" "${esc(steam)}" } "1" { "path" "${esc(lib)}" } }`,
  );
  fs.writeFileSync(
    path.join(lib, 'steamapps', 'appmanifest_2328760.acf'),
    `"AppState" { "appid" "2328760" "name" "Pinball FX" "installdir" "Pinball FX" }`,
  );
  const install = findSteamPinballFx(steam);
  assert.ok(install);
  assert.equal(install.store, 'steam');
  assert.equal(install.gameDir, path.join(lib, 'steamapps', 'common', 'Pinball FX'));
  assert.equal(install.launcher, path.join(steam, 'steam.exe'));
  assert.deepEqual(pinballFxCommand(install, 156), {
    file: path.join(steam, 'steam.exe'),
    args: ['-applaunch', '2328760', '-Table', '156', '-GameMode', 'Classic'],
  });
  assert.equal(
    pinballFxBackglassFile(install, 156),
    path.join(lib, 'steamapps', 'common', 'Pinball FX', 'PinballFX', 'Mods', 'Cabinet', 'Table_156.png'),
  );
  fs.rmSync(root, { recursive: true });
});

test('Steam : manifeste sans dossier du jeu = pas installé', () => {
  const root = tempDir();
  fs.mkdirSync(path.join(root, 'steamapps'), { recursive: true });
  fs.writeFileSync(path.join(root, 'steamapps', 'appmanifest_2328760.acf'), `"AppState" { "installdir" "Pinball FX" }`);
  assert.equal(findSteamPinballFx(root), undefined);
  assert.equal(findPinballFx({ steamDir: root, epicManifestsDir: path.join(root, 'absent') }), undefined);
  fs.rmSync(root, { recursive: true });
});

test('Steam : téléchargement en cours (StateFlags sans le drapeau 4) = pas encore installé', () => {
  const root = tempDir();
  fs.mkdirSync(path.join(root, 'steamapps', 'common', 'Pinball FX'), { recursive: true });
  const manifest = path.join(root, 'steamapps', 'appmanifest_2328760.acf');
  // 1026 = mise à jour requise + téléchargement : Steam écrit le manifeste dès le début.
  fs.writeFileSync(manifest, `"AppState" { "installdir" "Pinball FX" "StateFlags" "1026" }`);
  assert.equal(findSteamPinballFx(root), undefined);
  assert.equal(steamPinballFxDownloading(root), true);
  fs.writeFileSync(manifest, `"AppState" { "installdir" "Pinball FX" "StateFlags" "4" }`);
  assert.equal(findSteamPinballFx(root)?.store, 'steam');
  assert.equal(steamPinballFxDownloading(root), false);
  fs.rmSync(root, { recursive: true });
});

test('obtenir Pinball FX : Steam ouvert sur son installation, sinon Epic, sinon rien', () => {
  const root = tempDir();
  assert.equal(pinballFxGetter({ steamDir: root }), undefined); // dossier sans steam.exe
  assert.deepEqual(pinballFxGetter({ steamDir: root, epic: true }), { store: 'epic', url: 'com.epicgames.launcher://store/p/pinball-fx' });
  fs.writeFileSync(path.join(root, 'steam.exe'), '');
  assert.deepEqual(pinballFxGetter({ steamDir: root, epic: true }), { store: 'steam', file: path.join(root, 'steam.exe'), args: ['steam://install/2328760'] });
  assert.equal(pinballFxGetter({}), undefined);
  fs.rmSync(root, { recursive: true });
});

test('Epic : manifeste « Pinball FX », exécutable lancé avec les arguments du jeu', () => {
  const root = tempDir();
  const manifests = path.join(root, 'Manifests');
  const game = path.join(root, 'Epic Games', 'PinballFX');
  fs.mkdirSync(manifests, { recursive: true });
  fs.mkdirSync(game, { recursive: true });
  fs.writeFileSync(path.join(manifests, 'autre.item'), JSON.stringify({ DisplayName: 'Pinball FX3', InstallLocation: game, LaunchExecutable: 'x.exe' }));
  fs.writeFileSync(path.join(manifests, 'casse.item'), '{ pas du JSON');
  fs.writeFileSync(
    path.join(manifests, 'pfx.item'),
    JSON.stringify({ DisplayName: 'Pinball FX', InstallLocation: game, LaunchExecutable: 'PinballFX.exe' }),
  );
  const install = findEpicPinballFx(manifests);
  assert.ok(install);
  assert.equal(install.store, 'epic');
  assert.deepEqual(pinballFxCommand(install, 75, 'Practice'), {
    file: path.join(game, 'PinballFX.exe'),
    args: ['-Table', '75', '-GameMode', 'Practice'],
  });
  fs.rmSync(root, { recursive: true });
});

test('inventaire : fiche .pinballfx dans son dossier, titre du catalogue, .info partagé', () => {
  const tables = tempDir();
  const added = addPinballFxTable(tables, 156);
  assert.equal(added.emulator, 'pinballfx');
  assert.equal(added.pinballFxTable, 156);
  assert.equal(added.title, 'The Addams Family');
  assert.equal(added.manufacturer, 'Bally');
  assert.equal(added.year, 1992);
  assert.equal(added.version, undefined);
  assert.equal(path.basename(added.folder), 'The Addams Family (Bally 1992)');
  assert.equal(added.id, 'The Addams Family (Bally 1992)/The Addams Family (Bally 1992).pinballfx');
  // Ajout répété : la même table, pas de doublon.
  assert.equal(addPinballFxTable(tables, 156).file, added.file);
  // Création de Zen sans année : le titre ne reprend pas « (Zen Studios) ».
  const zen = addPinballFxTable(tables, 75);
  assert.equal(zen.title, 'Wild West Rampage');
  assert.equal(zen.year, undefined);
  const all = scanTables(tables);
  assert.deepEqual(all.map((e) => e.pinballFxTable), [156, 75]);
  // Fiche à la racine : ignorée ; fiche illisible : inventoriée sans numéro.
  fs.writeFileSync(path.join(tables, 'Perdue.pinballfx'), '{}');
  fs.mkdirSync(path.join(tables, 'Casse'));
  fs.writeFileSync(path.join(tables, 'Casse', 'Casse.pinballfx'), 'pas du JSON');
  const again = scanTables(tables);
  assert.equal(again.length, 3);
  const broken = again.find((e) => e.title === 'Casse');
  assert.ok(broken);
  assert.equal(broken.emulator, 'pinballfx');
  assert.equal(broken.pinballFxTable, undefined);
  fs.rmSync(tables, { recursive: true });
});

test('inventaire : même machine en VPX, la fiche de Pinball FX prend son propre dossier', () => {
  const tables = tempDir();
  const vpxFolder = path.join(tables, 'Twilight Zone (Bally 1993)');
  fs.mkdirSync(vpxFolder);
  fs.writeFileSync(path.join(vpxFolder, 'Twilight Zone (Bally 1993).vpx'), '');
  const fx = addPinballFxTable(tables, 162);
  assert.equal(path.basename(fx.folder), 'Twilight Zone (Bally 1993) Pinball FX');
  const all = scanTables(tables);
  assert.deepEqual(all.map((e) => e.emulator).sort(), ['pinballfx', 'vpx']);
  // Supprimer la table de Pinball FX n'emporte pas le dossier VPX.
  assert.deepEqual(removalTargets(fx, tables), { whole: true, paths: [fx.folder] });
  fs.rmSync(tables, { recursive: true });
});

test('base VPS : presque toutes les tables ont leur jeu, un jeu par table', () => {
  const ids = PINBALLFX_TABLES.flatMap((t) => (t.vps ? [t.vps] : []));
  // 133 sur 146 le 16/11/2026 : seules les tables trop récentes pour VPS n'en ont pas.
  assert.ok(ids.length >= 130, `${ids.length} tables reliées à VPS`);
  assert.equal(new Set(ids).size, ids.length, 'deux tables sur le même jeu VPS');
  for (const id of ids) assert.match(id, /^[\w-]{6,12}$/);
  assert.equal(pinballFxTable(156)?.vps, 'aT_GONvw');
  assert.equal(pinballFxTable(191)?.vps, undefined);
});

test('capture de VPS : version Pinball FX d’abord, puis FX3, puis une recréation ; jamais une image d’un autre site', () => {
  const img = (name: string) => `https://virtualpinballspreadsheet.github.io/vps-db/img/${name}.webp`;
  const table = { id: 1, title: 'T', manufacturer: 'Williams', vps: 'g1' };
  const vps = (files: { tableFormat?: string; imgUrl?: string }[]) => ({ games: [{ id: 'g1', name: 'T', tableFiles: files.map((f, i) => ({ id: `f${i}`, ...f })) }] });
  assert.equal(pinballFxVpsImage(vps([{ tableFormat: 'VPX', imgUrl: img('vpx') }, { tableFormat: 'FX3', imgUrl: img('fx3') }, { tableFormat: 'FX', imgUrl: img('fx') }]), table), img('fx'));
  assert.equal(pinballFxVpsImage(vps([{ tableFormat: 'VPX', imgUrl: img('vpx') }, { tableFormat: 'FX3', imgUrl: img('fx3') }]), table), img('fx3'));
  assert.equal(pinballFxVpsImage(vps([{ tableFormat: 'VPX', imgUrl: img('vpx') }]), table), img('vpx'));
  assert.equal(pinballFxVpsImage(vps([{ tableFormat: 'FX', imgUrl: 'https://exemple.example/fx.webp' }]), table), undefined);
  assert.equal(pinballFxVpsImage(vps([{ tableFormat: 'FX', imgUrl: img('fx') }]), { ...table, vps: undefined }), undefined);
});

test('fiche : le jeu VPS du catalogue, sauf si le .info en donne un ; tables déjà ajoutées comprises', () => {
  const tables = tempDir();
  const added = addPinballFxTable(tables, 156);
  assert.equal(added.info.Info?.VPSId, 'aT_GONvw');
  // Rien n'est écrit : le .info n'existe pas (le jeu vient du catalogue à chaque lecture).
  assert.equal(fs.existsSync(added.infoFile), false);
  fs.writeFileSync(added.infoFile, JSON.stringify({ Info: { VPSId: 'autreJeu' } }));
  assert.equal(scanTables(tables)[0]!.info.Info?.VPSId, 'autreJeu');
  const zen = addPinballFxTable(tables, 191);
  assert.equal(zen.info.Info?.VPSId, undefined);
  fs.rmSync(tables, { recursive: true });
});

test('média manquant rangé avec sa source ; un média déjà là n’est jamais remplacé', () => {
  const tables = tempDir();
  const added = addPinballFxTable(tables, 156);
  const staged = path.join(tables, 'capture.webp');
  fs.writeFileSync(staged, 'image');
  const origin = { origin: 'VPS', url: 'https://virtualpinballspreadsheet.github.io/vps-db/img/x.webp', vpsId: 'aT_GONvw' };
  const placed = placeMissingMedia(added, added.infoFile, 'Playfield', staged, origin, new Date('2026-11-16T12:00:00Z'));
  assert.ok(placed);
  assert.equal(path.basename(placed), '(Playfield) The Addams Family (Bally 1992).webp');
  assert.equal(path.basename(path.dirname(placed)), 'medias');
  const info = JSON.parse(fs.readFileSync(added.infoFile, 'utf8'));
  assert.deepEqual(info.CyberPinball.medias.sources.Playfield, { ...origin, date: '2026-11-16T12:00:00.000Z', file: path.basename(placed) });
  fs.writeFileSync(staged, 'autre image');
  assert.equal(placeMissingMedia(scanTables(tables)[0]!, added.infoFile, 'Playfield', staged, origin), undefined);
  assert.equal(fs.readFileSync(placed, 'utf8'), 'image');
  fs.rmSync(tables, { recursive: true });
});

test('nom de dossier : caractères interdits par Windows remplacés', () => {
  assert.equal(pinballFxFolderName(178), 'Exploding Kittens A Pinball Cat-astrophe (Zen Studios)');
  assert.equal(pinballFxFolderName(9999), 'Pinball FX 9999');
});
