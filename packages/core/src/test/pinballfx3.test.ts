// Pinball FX3 (packages/core/src/pinballfx3.ts) : catalogue, installation par Steam, tables
// installées, commande de lancement, fiche dans l'inventaire et message d'une partie trop courte.
// Sur un disque simulé : ni Steam, ni jeu réel.
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { namedMediaFiles, type ReceivedMedia } from '../mediasites';
import {
  findSteamPinballFx3,
  isPinballFx3WindowTitle,
  isWilliamsPinballFx3,
  PINBALLFX3_SHORT_GAME_S,
  PINBALLFX3_TABLES,
  pinballFx3Command,
  pinballFx3Getter,
  pinballFx3InstalledTables,
  pinballFx3ShortGameMessage,
  pinballFx3Table,
  steamPinballFx3Downloading,
} from '../pinballfx3';
import { addPinballFxTable, addZenTable, removalTargets, scanTables } from '../tables';
import { isZenEmulator, zenEntryKey, zenTable, zenTableOfEntry } from '../zen';

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-fx3-'));
}

test('catalogue : noms de fichiers uniques et valables, titres non vides, Williams et Bally repérés', () => {
  const names = PINBALLFX3_TABLES.map((t) => t.name.toLowerCase());
  assert.equal(new Set(names).size, names.length);
  for (const t of PINBALLFX3_TABLES) {
    assert.match(t.name, /^[A-Za-z0-9_-]+$/, t.name);
    assert.ok(t.title.trim() && t.manufacturer.trim(), t.name);
    assert.equal(t.known, true);
    assert.equal(t.williams, /^(WMS|BALLY)_/.test(t.name), t.name);
  }
  // Machine réelle : titre, fabricant, année et jeu VPS repris de la même table de Pinball FX.
  assert.deepEqual(pinballFx3Table('WMS_Fish_Tales'), { name: 'WMS_Fish_Tales', title: 'Fish Tales', manufacturer: 'Williams', year: 1992, vps: 'tV1GotAP', williams: true, known: true });
  // Noms peu parlants du jeu.
  assert.equal(pinballFx3Table('Citadel')?.title, 'Sorcerer\'s Lair');
  assert.equal(pinballFx3Table('SpaceBear1')?.title, 'Star Wars Pinball: The Last Jedi');
  assert.equal(pinballFx3Table('STARWARS_Light_VS_Dark')?.title, 'Star Wars Pinball: Masters of the Force');
  // Table propre à FX3 (pas dans Pinball FX) : son titre, Zen Studios.
  assert.deepEqual(pinballFx3Table('FamilyGuy'), { name: 'FamilyGuy', title: 'Family Guy Pinball', manufacturer: 'Zen Studios', williams: false, known: true });
  // Insensible à la casse ; « Mars » n'est pas « Attack from Mars ».
  assert.equal(pinballFx3Table('wms_fish_tales')?.title, 'Fish Tales');
  assert.equal(pinballFx3Table('Mars')?.title, 'Mars');
  // Fichier inconnu : décrit d'après son nom ; nom avec espace ou guillemet : refusé.
  assert.deepEqual(pinballFx3Table('WMS_New_Table'), { name: 'WMS_New_Table', title: 'WMS New Table', manufacturer: 'Williams', williams: true, known: false });
  assert.equal(pinballFx3Table('Fish Tales'), undefined);
  assert.equal(pinballFx3Table('a"b'), undefined);
  assert.equal(isWilliamsPinballFx3('BALLY_BlackRose'), true);
  assert.equal(isWilliamsPinballFx3('UNIVERSAL_BTTF'), false);
});

test('commande : steam.exe -applaunch 442120, -class pour Williams et Bally seulement, -table_<fichier>', () => {
  const install = { launcher: 'C:\\Steam\\steam.exe' };
  assert.deepEqual(pinballFx3Command(install, 'WMS_Fish_Tales'), { file: 'C:\\Steam\\steam.exe', args: ['-applaunch', '442120', '-class', '-table_WMS_Fish_Tales'] });
  assert.deepEqual(pinballFx3Command(install, 'BALLY_Attack_from_Mars').args, ['-applaunch', '442120', '-class', '-table_BALLY_Attack_from_Mars']);
  assert.deepEqual(pinballFx3Command(install, 'MARVEL_Ant-Man').args, ['-applaunch', '442120', '-table_MARVEL_Ant-Man']);
  assert.deepEqual(pinballFx3Command(install, 'WMS_Fish_Tales', { classic: false }).args, ['-applaunch', '442120', '-table_WMS_Fish_Tales']);
  // Un nom qui passerait mal (espace, guillemet, autre argument) n'est jamais lancé.
  for (const bad of ['Fish Tales', 'x" -offline', '', 'a/b']) assert.throws(() => pinballFx3Command(install, bad));
});

test('Steam : FX3 trouvé dans une bibliothèque secondaire, dossier des tables data\\steam', () => {
  const root = tempDir();
  const steam = path.join(root, 'Steam');
  const lib = path.join(root, 'SteamLibrary');
  fs.mkdirSync(path.join(steam, 'steamapps'), { recursive: true });
  fs.mkdirSync(path.join(lib, 'steamapps', 'common', 'Pinball FX3', 'data', 'steam'), { recursive: true });
  const esc = (p: string) => p.replace(/\\/g, '\\\\');
  fs.writeFileSync(path.join(steam, 'steamapps', 'libraryfolders.vdf'), `"libraryfolders" { "0" { "path" "${esc(steam)}" } "1" { "path" "${esc(lib)}" } }`);
  // Renommé « Pinball FX Classic » en avril 2026 : le dossier garde son nom d'installation.
  fs.writeFileSync(path.join(lib, 'steamapps', 'appmanifest_442120.acf'), `"AppState" { "appid" "442120" "name" "Pinball FX Classic" "installdir" "Pinball FX3" "StateFlags" "4" }`);
  const install = findSteamPinballFx3(steam);
  assert.ok(install);
  assert.equal(install.gameDir, path.join(lib, 'steamapps', 'common', 'Pinball FX3'));
  assert.equal(install.tablesDir, path.join(lib, 'steamapps', 'common', 'Pinball FX3', 'data', 'steam'));
  assert.equal(install.launcher, path.join(steam, 'steam.exe'));
  // Pinball FX (autre appid) n'est pas FX3, et inversement.
  assert.equal(findSteamPinballFx3(path.join(root, 'absent')), undefined);
  fs.rmSync(root, { recursive: true });
});

test('Steam : FX3 en téléchargement = pas encore installé ; sans Steam, rien à ouvrir', () => {
  const root = tempDir();
  fs.mkdirSync(path.join(root, 'steamapps', 'common', 'Pinball FX3'), { recursive: true });
  const manifest = path.join(root, 'steamapps', 'appmanifest_442120.acf');
  fs.writeFileSync(manifest, `"AppState" { "installdir" "Pinball FX3" "StateFlags" "1026" }`);
  assert.equal(findSteamPinballFx3(root), undefined);
  assert.equal(steamPinballFx3Downloading(root), true);
  assert.equal(pinballFx3Getter(root), undefined); // pas de steam.exe
  fs.writeFileSync(path.join(root, 'steam.exe'), '');
  assert.deepEqual(pinballFx3Getter(root), { store: 'steam', file: path.join(root, 'steam.exe'), args: ['steam://install/442120'] });
  assert.equal(pinballFx3Getter(undefined), undefined);
  fs.rmSync(root, { recursive: true });
});

test('tables installées : les .pxp de data\\steam, sans les fichiers du jeu ; toutes, achetées ou non', () => {
  const root = tempDir();
  for (const f of ['WMS_Fish_Tales.pxp', 'Citadel.pxp', 'gui.pxp', 'gui_cfg.pxp', 'gui_sfx.pxp', 'PTSData.pxp', 'game_cfg.pxp', 'preview.pxp', 'sfx.pxp', 'txt.pxp', 'WMS3Assets.pxp', 'STARWARS_Nouvelle.pxp', 'Mauvais nom.pxp', 'notes.txt'])
    fs.writeFileSync(path.join(root, f), '');
  const tables = pinballFx3InstalledTables({ tablesDir: root });
  assert.deepEqual(tables.map((t) => t.name), ['WMS_Fish_Tales', 'Citadel', 'STARWARS_Nouvelle']);
  assert.deepEqual(tables.map((t) => t.known), [true, true, false]);
  assert.equal(tables[2]!.title, 'STARWARS Nouvelle');
  // Dossier absent ou illisible : liste vide, sans erreur.
  assert.deepEqual(pinballFx3InstalledTables({ tablesDir: path.join(root, 'absent') }), []);
  fs.rmSync(root, { recursive: true });
});

test('inventaire : fiche .pinballfx3 dans son dossier, titre du catalogue, clé = fichier de la table', () => {
  const tables = tempDir();
  const fx3 = zenTable('pinballfx3', 'WMS_Medieval_Madness')!;
  const added = addZenTable(tables, fx3);
  assert.equal(added.emulator, 'pinballfx3');
  assert.equal(added.pinballFx3Table, 'WMS_Medieval_Madness');
  assert.equal(added.pinballFxTable, undefined);
  assert.equal(added.title, 'Medieval Madness');
  assert.equal(added.manufacturer, 'Williams');
  assert.equal(added.year, 1997);
  assert.equal(added.id, 'Medieval Madness (Williams 1997)/Medieval Madness (Williams 1997).pinballfx3');
  assert.deepEqual(JSON.parse(fs.readFileSync(added.file, 'utf8')), { PinballFX3: { Table: 'WMS_Medieval_Madness' } });
  assert.equal(isZenEmulator(added.emulator), true);
  assert.equal(zenEntryKey(added), 'WMS_Medieval_Madness');
  assert.equal(zenTableOfEntry(added)?.williams, true);
  // Ajout répété : la même table.
  assert.equal(addZenTable(tables, fx3).file, added.file);
  // Fiche illisible ou nom invalide : inventoriée sans clé (jamais lancée avec un nom deviné).
  fs.mkdirSync(path.join(tables, 'Casse'));
  fs.writeFileSync(path.join(tables, 'Casse', 'Casse.pinballfx3'), JSON.stringify({ PinballFX3: { Table: 'a b' } }));
  const broken = scanTables(tables).find((e) => e.title === 'Casse');
  assert.ok(broken);
  assert.equal(broken.emulator, 'pinballfx3');
  assert.equal(broken.pinballFx3Table, undefined);
  assert.equal(zenEntryKey(broken), undefined);
  fs.rmSync(tables, { recursive: true });
});

test('inventaire : même machine dans Pinball FX, FX3 et VPX, chacune son dossier (ni .info ni médias partagés)', () => {
  const tables = tempDir();
  const fx = addPinballFxTable(tables, 108);
  const fx3 = addZenTable(tables, zenTable('pinballfx3', 'WMS_Fish_Tales')!);
  assert.equal(path.basename(fx.folder), 'Fish Tales (Williams 1992)');
  assert.equal(path.basename(fx3.folder), 'Fish Tales (Williams 1992) Pinball FX3');
  assert.notEqual(fx.infoFile, fx3.infoFile);
  // Dans l'autre ordre : Pinball FX prend le dossier suffixé.
  const vpx = path.join(tables, 'Theatre of Magic (Bally 1995)');
  fs.mkdirSync(vpx);
  fs.writeFileSync(path.join(vpx, 'Theatre of Magic (Bally 1995).vpx'), '');
  const tom = addZenTable(tables, zenTable('pinballfx3', 'BALLY_TheatreOfMagic')!);
  assert.equal(path.basename(tom.folder), 'Theatre of Magic (Bally 1995) Pinball FX3');
  assert.deepEqual(removalTargets(tom, tables), { whole: true, paths: [tom.folder] });
  assert.deepEqual(scanTables(tables).map((e) => e.emulator).sort(), ['pinballfx', 'pinballfx3', 'pinballfx3', 'vpx']);
  fs.rmSync(tables, { recursive: true });
});

test('partie trop courte : causes possibles d’un jeu resté sur son écran d’accueil, sans code borne à demander', () => {
  assert.equal(pinballFx3ShortGameMessage(PINBALLFX3_SHORT_GAME_S, 'WMS_Fish_Tales'), undefined);
  assert.equal(pinballFx3ShortGameMessage(600, 'WMS_Fish_Tales'), undefined);
  // Table payante : l'achat manquant est une cause possible (Fish Tales, gratuite : pinballfx3-cabinet.test.ts).
  const short = pinballFx3ShortGameMessage(12, 'WMS_Medieval_Madness');
  assert.ok(short);
  assert.match(short.lines.join('\n'), /12 s/);
  assert.match(short.lines.join('\n'), /compte Steam/);
  assert.match(short.lines.join('\n'), /mode borne/);
  // Le code borne de Zen n'existe plus depuis le 4 novembre 2024 : jamais demandé au joueur.
  assert.doesNotMatch(short.lines.join('\n'), /demandez|formulaire/i);
  assert.match(short.lines.join('\n'), /Aucun code/);
  assert.doesNotMatch(short.lines.join('\n'), /Attack from Mars/);
  // « Mars » : le défaut connu du jeu dit en plus.
  assert.match(pinballFx3ShortGameMessage(5, 'Mars')!.lines.join('\n'), /Attack from Mars/);
  assert.equal(short.lines.at(-1), 'Start ou Exit : revenir au front-end.');
});

test('fenêtre de jeu : « Pinball FX Classic » ou « Pinball FX3 », jamais une page de Steam ni Pinball FX', () => {
  assert.equal(isPinballFx3WindowTitle('Pinball FX Classic'), true);
  assert.equal(isPinballFx3WindowTitle(' Pinball FX3 '), true);
  assert.equal(isPinballFx3WindowTitle('Pinball FX Classic - Steam'), false);
  assert.equal(isPinballFx3WindowTitle('PinballFX'), false);
  assert.equal(isPinballFx3WindowTitle('Pinball FX'), false);
});

test('packs de médias : le fichier nommé comme la table de FX3 (« WMS_Fish_Tales.png ») est pris', () => {
  const files: ReceivedMedia[] = ['WMS_Fish_Tales.png', 'WMS_Funhouse.png', 'Table_108.png'].map((f) => ({ file: path.join('pack', f), type: 'Wheel', kind: 'image' }));
  assert.deepEqual(namedMediaFiles(files, 'Wheel', { titles: [], pinballFx3: 'WMS_Fish_Tales' }).map((f) => path.basename(f.file)), ['WMS_Fish_Tales.png']);
  assert.deepEqual(namedMediaFiles(files, 'Wheel', { titles: [], pinballFx: 108 }).map((f) => path.basename(f.file)), ['Table_108.png']);
});
