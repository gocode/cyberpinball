// Téléchargements de Cyber Pinball et sélecteur de fichiers intégré : inventaire de la zone
// (provenance, rattachement à la liste d'attente, aux relevés des sites, à VPinMediaDB, au
// journal), fichiers internes jamais listés, corbeille et liste d'attente qui suit ; filtres,
// contenu d'un dossier, remontée, lecteurs et emplacements du sélecteur, sur une arborescence
// de test.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { saveWaitList, type WaitList } from '../acquisition';
import {
  downloadInventory,
  downloadLine,
  emptiableDownloads,
  forgetDownloads,
  isInternalDownload,
  noteDownloadUse,
  sortDownloads,
  trashDownloads,
} from '../downloads';
import {
  driveLabel,
  filterExtensions,
  hiddenName,
  listFolder,
  matchesFilter,
  parentFolder,
  parentWithin,
  parseDrives,
  pickerPlaces,
  shortPath,
  tableFilter,
  toggleSelection,
} from '../filepicker';
import { setLanguage } from '../i18n';
import { parseMediaDbIndex } from '../mediadb';

const MD5 = '0123456789abcdef0123456789abcdef';

function put(file: string, data = 'x', ageDays = 0): string {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
  const when = new Date(Date.now() - ageDays * 24 * 3600_000);
  fs.utimesSync(file, when, when);
  return file;
}

function sandbox() {
  setLanguage('fr');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-telechargements-'));
  const dl = path.join(root, 'downloads');
  const data = path.join(root, 'data');
  const windows = path.join(root, 'Windows Downloads');
  const files = {
    rom: put(path.join(dl, 'acquisition', 'mm_109c.zip'), 'rom', 0),
    table: put(path.join(dl, 'acquisition', 'Medieval Madness VPW 2.0.vpx'), 'vpx'.repeat(50), 1),
    stray: put(path.join(dl, 'acquisition', 'fronton.directb2s'), 'b2s', 2),
    orphan: put(path.join(dl, 'acquisition', 'inconnu.7z'), '7z', 3),
    partial: put(path.join(dl, 'acquisition', 'gros.vpx.crdownload'), 'x', 0),
    site: put(path.join(dl, 'sites', 'vpforums-123', 'fichiers', 'Wheel', 'T2 Wheel.png'), 'png', 4),
    siteIncoming: put(path.join(dl, 'sites', 'vpforums-124', 'recu', 'pack.zip'), 'zip', 0),
    thumb: put(path.join(dl, 'sites', 'apercus', 'abc.jpg'), 'jpg', 0),
    receipts: put(path.join(dl, 'sites', 'recus.json'), '[]'),
    web: put(path.join(dl, 'sites', 'web', 'k1', 'fichiers', 'backglass.mp4'), 'mp4', 5),
    mediadb: put(path.join(dl, 'vpinmediadb', `${MD5}.png`), 'png', 0.5),
    update: put(path.join(dl, 'cyberpinball', 'CyberPinball-Setup-0.1.1.exe'), 'exe', 6),
    vpx: put(path.join(dl, 'VPinballX_BGFX-10.8.1-windows-x64.zip'), 'zip'.repeat(100), 7),
    index: put(path.join(dl, 'vpsdb.json'), '{}'),
    winRecent: put(path.join(windows, 't2_l8.zip'), 'rom', 2),
    winOld: put(path.join(windows, 'vieux.zip'), 'rom', 60),
    winPartial: put(path.join(windows, 'encours.zip.part'), 'rom', 0),
  };
  fs.writeFileSync(
    files.receipts,
    JSON.stringify([{ key: 'vpforums:123', site: 'vpforums', title: 'T2 wheel pack', url: 'https://www.vpforums.org/index.php?app=downloads&showfile=123', type: 'Wheel', date: '2026-10-21T10:00:00Z', files: [{ file: files.site, type: 'Wheel', kind: 'image' }] }]),
  );
  put(
    path.join(dl, 'sites', 'web.json'),
    JSON.stringify([{ key: 'web:k1', table: path.join(root, 'tables', 'Fireball', 'Fireball (Bally 1972).vpx'), type: 'Backglass', url: 'https://example.org/bg.mp4', filename: 'backglass.mp4', date: '2026-10-20T10:00:00Z', files: [{ file: files.web, type: 'Backglass', kind: 'video' }] }]),
  );
  const list: WaitList = {
    items: [
      { id: 'g1:rom', gameId: 'g1', gameLabel: 'Medieval Madness (Williams 1997)', kind: 'rom', fileId: 'rom', label: 'mm_109c', page: 'https://www.vpforums.org/index.php?showfile=1', addedAt: '2026-10-24T10:00:00Z', state: 'received', received: { file: files.rom, at: '2026-10-25T10:00:00Z', via: 'window', url: 'https://www.vpforums.org/index.php?showfile=1', content: 'rom' } },
      { id: 'g1:table', gameId: 'g1', gameLabel: 'Medieval Madness (Williams 1997)', kind: 'table', fileId: 'tbl', label: 'VPW 2.0', page: 'https://vpuniverse.com/files/file/1-mm/', addedAt: '2026-10-23T10:00:00Z', state: 'installed', table: path.join(root, 'tables', 'Medieval Madness', 'Medieval Madness VPW 2.0.vpx'), received: { file: files.table, at: '2026-10-24T10:00:00Z', via: 'window', content: 'table' } },
    ],
    strays: [{ file: files.stray, at: '2026-10-23T10:00:00Z', via: 'window', url: 'https://vpuniverse.com/files/file/2-x/', content: 'b2s' }],
  };
  saveWaitList(data, list);
  return { root, dl, data, windows, files, list };
}

test('téléchargements : la zone de Cyber Pinball, sans ses index, aperçus ni réceptions en cours', () => {
  assert.equal(isInternalDownload('vpsdb.json'), true);
  assert.equal(isInternalDownload('vpinmdb.meta.json'), true);
  assert.equal(isInternalDownload('journal.json'), true);
  assert.equal(isInternalDownload(path.join('sites', 'recus.json')), true);
  assert.equal(isInternalDownload(path.join('sites', 'apercus', 'a.jpg')), true);
  assert.equal(isInternalDownload(path.join('sites', 'vpforums-1', 'recu', 'a.zip')), true);
  assert.equal(isInternalDownload(path.join('acquisition', 'a.vpx.crdownload')), true);
  assert.equal(isInternalDownload(path.join('vpinmediadb', 'a.png.part')), true);
  assert.equal(isInternalDownload(path.join('acquisition', 'a.vpx')), false);
  assert.equal(isInternalDownload('VPinballX.zip'), false);
  assert.equal(isInternalDownload(path.join('sites', 'vpforums-1', 'fichiers', 'a.png')), false);

  const s = sandbox();
  const entries = downloadInventory({ downloadsDir: s.dl, dataDir: s.data });
  const names = entries.map((e) => e.name);
  // Du plus récent au plus ancien ; rien d'interne, rien de Windows sans le demander.
  assert.deepEqual(names, ['mm_109c.zip', `${MD5}.png`, 'Medieval Madness VPW 2.0.vpx', 'fronton.directb2s', 'inconnu.7z', 'T2 Wheel.png', 'backglass.mp4', 'CyberPinball-Setup-0.1.1.exe', 'VPinballX_BGFX-10.8.1-windows-x64.zip']);
  assert.ok(entries.every((e) => !e.outside));
});

test('téléchargements : d’où vient chaque fichier, et à quoi il sert', () => {
  const s = sandbox();
  const db = parseMediaDbIndex({ g9: { wheel: 'https://github.com/superhac/vpinmediadb/raw/main/g9/wheel.png', wheel_md5: MD5 } });
  const entries = downloadInventory({ downloadsDir: s.dl, dataDir: s.data, mediaDb: db, gameName: (id) => (id === 'g9' ? 'Fireball (Bally 1972)' : undefined), tableName: (f) => path.basename(path.dirname(f)) });
  const by = (name: string) => entries.find((e) => e.name === name)!;

  const rom = by('mm_109c.zip');
  assert.equal(rom.origin, 'acquisition');
  assert.equal(rom.kind, 'rom');
  assert.equal(rom.source, 'vpforums.org');
  assert.equal(rom.waitItem, 'g1:rom');
  assert.deepEqual(rom.use, { state: 'waiting', text: 'À installer : ROM de Medieval Madness (Williams 1997)' });
  assert.match(downloadLine(rom), /^vpforums\.org · « Récupérer » · .+ · 3 octets$/);

  const table = by('Medieval Madness VPW 2.0.vpx');
  assert.equal(table.kind, 'table');
  assert.deepEqual(table.use, { state: 'installed', text: 'Installé avec Medieval Madness' });
  assert.equal(table.source, 'vpuniverse.com', 'sans adresse de réception, la page de l’élément');

  assert.deepEqual(by('fronton.directb2s').use, { state: 'aside', text: 'Gardé de côté : un fronton (.directb2s)' });
  assert.deepEqual(by('inconnu.7z').use, { state: 'none', text: 'Sans usage connu' });
  assert.equal(by('inconnu.7z').kind, 'archive');

  const site = by('T2 Wheel.png');
  assert.equal(site.origin, 'site');
  assert.equal(site.source, 'VPForums');
  assert.equal(site.kind, 'image');
  assert.deepEqual(site.use, { state: 'kept', text: 'Reçu pour : Logo · T2 wheel pack' });

  const web = by('backglass.mp4');
  assert.equal(web.origin, 'web');
  assert.equal(web.source, 'example.org');
  assert.match(web.use.text, /^Cherché pour : .+ de Fireball$/);

  const media = by(`${MD5}.png`);
  assert.equal(media.origin, 'vpinmediadb');
  assert.equal(media.label, 'Logo · Fireball (Bally 1972)');
  assert.match(media.use.text, /VPinMediaDB pour Fireball \(Bally 1972\), effacé après un jour/);

  assert.equal(by('CyberPinball-Setup-0.1.1.exe').origin, 'update');
  assert.equal(by('CyberPinball-Setup-0.1.1.exe').kind, 'installer');
  assert.equal(by('VPinballX_BGFX-10.8.1-windows-x64.zip').origin, 'component');
  assert.equal(by('VPinballX_BGFX-10.8.1-windows-x64.zip').use.text, 'Gardée pour réinstaller VPX sans réseau');
});

test('téléchargements : le journal dit ce qu’on a fait d’un fichier repris', () => {
  const s = sandbox();
  noteDownloadUse(s.dl, s.files.orphan, 'Ajout d’une table : Attack from Mars');
  noteDownloadUse(s.dl, s.files.rom, 'Ajout d’une table');
  const entries = downloadInventory({ downloadsDir: s.dl, dataDir: s.data });
  assert.deepEqual(entries.find((e) => e.name === 'inconnu.7z')!.use, { state: 'used', text: 'Ajout d’une table : Attack from Mars' });
  // Attendu par la liste d'attente : c'est ce qui compte d'abord.
  assert.equal(entries.find((e) => e.name === 'mm_109c.zip')!.use.state, 'waiting');
  // Le journal lui-même est interne.
  assert.ok(!entries.some((e) => e.name === 'journal.json'));
});

test('téléchargements : ceux de Windows en option, récents seulement, jamais vidés', () => {
  const s = sandbox();
  const entries = downloadInventory({ downloadsDir: s.dl, dataDir: s.data, windows: { dir: s.windows, since: new Date(Date.now() - 30 * 24 * 3600_000) } });
  const win = entries.filter((e) => e.outside);
  assert.deepEqual(win.map((e) => e.name), ['t2_l8.zip']);
  assert.equal(win[0]!.origin, 'windows');
  assert.ok(!emptiableDownloads(entries).some((e) => e.outside));
  assert.equal(emptiableDownloads(entries).length, entries.length - 1);
});

test('téléchargements : tri par date, nom ou taille', () => {
  const s = sandbox();
  const entries = downloadInventory({ downloadsDir: s.dl, dataDir: s.data });
  assert.equal(sortDownloads(entries, 'size')[0]!.name, 'VPinballX_BGFX-10.8.1-windows-x64.zip');
  assert.equal(sortDownloads(entries, 'name')[0]!.name, `${MD5}.png`);
  assert.equal(sortDownloads(entries, 'date')[0]!.name, 'mm_109c.zip');
});

test('téléchargements : la corbeille, et la liste d’attente qui suit', () => {
  const s = sandbox();
  const trash = path.join(s.root, 'trash');
  const moved = trashDownloads([s.files.rom, s.files.site, s.files.stray, s.files.table], { downloadsDir: s.dl, trashRoot: trash, label: 'Téléchargements', now: new Date(2026, 9, 25, 14, 5, 0) });
  assert.equal(moved.length, 4);
  const bin = path.join(trash, '2026-10-25 14-05-00 Téléchargements');
  assert.deepEqual(fs.readdirSync(bin).sort(), ['Medieval Madness VPW 2.0.vpx', 'T2 Wheel.png', 'fronton.directb2s', 'mm_109c.zip']);
  // L'envoi déballé du site ne laisse pas de dossiers vides ; les dossiers de la zone restent.
  assert.equal(fs.existsSync(path.join(s.dl, 'sites', 'vpforums-123')), false);
  assert.equal(fs.existsSync(path.join(s.dl, 'sites')), true);
  assert.equal(fs.existsSync(path.join(s.dl, 'acquisition')), true);

  const { waiting } = forgetDownloads(s.list, moved);
  assert.deepEqual(waiting, ['g1:rom'], 'la ROM reçue redevient attendue');
  assert.equal(s.list.items[0]!.state, 'waiting');
  assert.equal(s.list.items[0]!.received, undefined);
  assert.equal(s.list.items[1]!.state, 'installed', 'une table installée n’a plus besoin de son fichier');
  assert.equal(s.list.strays, undefined, 'le fichier gardé de côté est oublié');
});

test('sélecteur : filtres et extensions', () => {
  setLanguage('fr');
  const f = tableFilter();
  assert.ok(matchesFilter('Attack from Mars.VPX', f));
  assert.ok(matchesFilter('afm_113b.zip', f));
  assert.ok(matchesFilter('wheel.png', f));
  assert.ok(!matchesFilter('Lisez-moi.txt', f));
  assert.ok(matchesFilter('Lisez-moi.txt', undefined));
  assert.ok(matchesFilter('Lisez-moi.txt', { label: 'Tous', extensions: [] }));
  assert.equal(filterExtensions({ label: 'Fronton', extensions: ['png', 'jpg', 'mp4'] }), '.png, .jpg, .mp4');
  assert.equal(filterExtensions({ label: 'x', extensions: ['a', 'b', 'c'] }, 2), '.a, .b…');
});

test('sélecteur : contenu d’un dossier, filtré, dossiers d’abord, fichiers système cachés', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-selecteur-'));
  const usb = path.join(root, 'E');
  const williams = path.join(usb, 'Flippers', 'Williams');
  put(path.join(williams, 'Attack from Mars (Bally 1995) 2.1.vpx'), 'vpx', 1);
  put(path.join(williams, 'Attack from Mars.directb2s'), 'b2s', 0);
  put(path.join(williams, 'afm_113b.zip'), 'rom', 400);
  put(path.join(williams, 'Lisez-moi.txt'), 'txt', 401);
  put(path.join(williams, 'desktop.ini'), 'ini');
  put(path.join(williams, '.cache'), 'x');
  put(path.join(williams, 'Medieval Madness', 'mm.vpx'), 'vpx');
  fs.mkdirSync(path.join(williams, 'System Volume Information'), { recursive: true });

  const filtered = listFolder(williams, { filter: tableFilter() });
  assert.deepEqual(filtered.entries.map((e) => e.name), ['Medieval Madness', 'afm_113b.zip', 'Attack from Mars (Bally 1995) 2.1.vpx', 'Attack from Mars.directb2s']);
  assert.equal(filtered.hidden, 1, 'Lisez-moi.txt, caché par le filtre (desktop.ini n’est pas compté : système)');
  assert.equal(filtered.entries[0]!.dir, true);
  assert.equal(filtered.entries[2]!.kind, 'table');

  const all = listFolder(williams, { filter: tableFilter(), showAll: true, sort: 'date' });
  assert.equal(all.hidden, 0);
  assert.deepEqual(all.entries.map((e) => e.name), ['Medieval Madness', 'Attack from Mars.directb2s', 'Attack from Mars (Bally 1995) 2.1.vpx', 'afm_113b.zip', 'Lisez-moi.txt']);
  assert.equal(all.entries.find((e) => e.name === 'Lisez-moi.txt')!.matches, false);

  const folders = listFolder(williams, { foldersOnly: true });
  assert.deepEqual(folders.entries.map((e) => e.name), ['Medieval Madness']);

  assert.match(listFolder(path.join(root, 'absent')).error ?? '', /n’existe plus/);
  assert.ok(hiddenName('$RECYCLE.BIN') && hiddenName('Thumbs.db') && !hiddenName('Tables'));

  // Remontée : jusqu'à la racine du lecteur ; d'un emplacement (Téléchargements), pas au-delà.
  assert.equal(parentFolder(williams), path.join(usb, 'Flippers'));
  assert.equal(parentFolder(path.parse(root).root), undefined);
  assert.equal(parentWithin(williams, williams), undefined);
  assert.equal(parentWithin(path.join(williams, 'Medieval Madness'), williams), williams);
  assert.equal(parentWithin(williams, undefined), path.join(usb, 'Flippers'));
});

test('sélecteur : lecteurs, emplacements, sélection, chemin raccourci', () => {
  setLanguage('fr');
  const drives = parseDrives([
    { DeviceID: 'C:', DriveType: 3, VolumeName: 'Windows', FreeSpace: 88e9, Size: 500e9 },
    { DeviceID: 'E:', DriveType: 2, VolumeName: 'KINGSTON', FreeSpace: 12 * 1024 ** 3, Size: 16e9 },
    { DeviceID: 'F:', DriveType: 2, VolumeName: '', Size: null },
    { DeviceID: 'D:', DriveType: 3, VolumeName: '', FreeSpace: 420e9, Size: 1e12 },
    { DeviceID: 'Z:', DriveType: 4, VolumeName: 'NAS', Size: 1e12 },
    { DeviceID: 'bad', DriveType: 3 },
  ]);
  assert.deepEqual(drives.map((d) => d.letter), ['E:', 'C:', 'D:', 'Z:'], 'clé USB d’abord, lecteur de cartes vide ignoré');
  assert.equal(driveLabel(drives[0]!), 'KINGSTON (E:)');
  assert.equal(driveLabel(drives[2]!), 'Disque (D:)');
  assert.equal(parseDrives({ DeviceID: 'C:', DriveType: 3, Size: 1 }).length, 1, 'un seul lecteur : un objet, pas un tableau');

  const places = pickerPlaces({ cpDownloads: { count: 11 }, windowsDownloads: 'D:\\Profil\\Downloads', importDir: 'D:\\CyberPinball\\import', desktop: 'D:\\Profil\\Desktop', drives });
  assert.deepEqual(places.map((p) => p.kind), ['cp-downloads', 'windows-downloads', 'import', 'desktop', 'drive', 'drive', 'drive', 'drive']);
  assert.equal(places[0]!.label, 'Cyber Pinball');
  assert.equal(places[0]!.detail, 'Téléchargements · 11 fichiers');
  assert.equal(places[0]!.path, undefined, 'les téléchargements de Cyber Pinball sont une liste, pas un dossier');
  assert.equal(places[4]!.icon, 'usb');
  assert.equal(places[5]!.icon, 'drive');
  assert.equal(places[4]!.path, 'E:\\');
  assert.match(places[4]!.detail!, /^Clé USB · 12 Go libres$/);
  assert.equal(new Set(places.map((p) => p.id)).size, places.length);
  // Avant l'installation : pas de zone de téléchargements.
  assert.equal(pickerPlaces({ drives: [] }).length, 0);

  assert.deepEqual(toggleSelection([], 'E:\\a.vpx', true), ['E:\\a.vpx']);
  assert.deepEqual(toggleSelection(['E:\\a.vpx'], 'e:\\A.vpx', true), []);
  assert.deepEqual(toggleSelection(['E:\\a.vpx'], 'E:\\b.vpx', true), ['E:\\a.vpx', 'E:\\b.vpx']);
  assert.deepEqual(toggleSelection(['E:\\a.vpx'], 'E:\\b.vpx', false), ['E:\\b.vpx']);

  assert.equal(shortPath('E:\\Flippers\\Williams', 60), 'E:\\Flippers\\Williams');
  assert.equal(shortPath('E:\\un dossier très long\\un autre dossier très long\\Flippers\\Williams', 30), '…\\Flippers\\Williams');
});

test('aucune boîte de dialogue de fichiers de Windows dans l’application : le sélecteur de Cyber Pinball partout', () => {
  // Une boîte native s'ouvre sur l'écran principal, ne se pilote pas aux boutons de la borne
  // et ne propose pas les téléchargements déjà reçus : app/src/file-picker.ts la remplace.
  const dir = path.join(__dirname, '..', '..', '..', '..', 'app', 'src');
  const found: string[] = [];
  for (const name of fs.readdirSync(dir).filter((n) => n.endsWith('.ts'))) {
    fs.readFileSync(path.join(dir, name), 'utf8')
      .split(/\r?\n/)
      .forEach((line, i) => {
        if (/\b(showOpenDialog|showSaveDialog)(Sync)?\b/.test(line)) found.push(`${name}:${i + 1}`);
      });
  }
  assert.deepEqual(found, []);
});
