// Sauvegardes (backup.ts) : ce qui entre dans chaque niveau, copie dédoublonnée et vérifiée,
// sauvegarde interrompue, clé abîmée, restauration en deux temps (préparée l'application en marche,
// posée au démarrage), annulation, rangement des sauvegardes automatiques, échéances.
// Tout se passe dans des dossiers temporaires : aucune vraie racine, aucun lecteur du poste.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import {
  applyPendingRestore,
  autoBackupDue,
  canUndoLastRestore,
  estimateBackup,
  isSameCabinet,
  lastAutoSlot,
  nextAutoSlot,
  autoHour,
  autoWeekday,
  listBackups,
  loadBackupSettings,
  loadHashCache,
  loadLastRestore,
  loadPendingRestore,
  partOf,
  planRestore,
  prepareRestore,
  prepareUndoLastRestore,
  pruneBackups,
  runBackup,
  scanRoot,
  LEVEL_PARTS,
  type BackupLevel,
} from '../backup';

const CABINET = { id: 'borne-salon', name: 'Borne du salon' };

function tmp(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function write(root: string, rel: string, content: string | Buffer): void {
  const abs = path.join(root, ...rel.split('/'));
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}

function read(root: string, rel: string): string {
  return fs.readFileSync(path.join(root, ...rel.split('/')), 'utf8');
}

/** Une racine de borne avec un peu de tout, noms et contenus inventés. */
function fakeRoot(): string {
  const root = tmp('cp-sauvegarde-racine-');
  write(root, 'data/cabinet.json', '{"configurations":[]}');
  write(root, 'data/vpx-owned.json', '{}');
  write(root, 'data/medias.json', '{"choix":1}');
  write(root, 'data/social.json', '{"key":{"publicKey":"pub","privateKey":"priv"}}');
  write(root, 'data/amis/records.json', '{"records":[]}');
  write(root, 'data/logs/journal.txt', 'journal');
  write(root, 'data/cache/sante.json', '{}');
  write(root, 'data/backups/VPinballX.ini.2026-10-26', 'ancien');
  write(root, 'data/vpx-owned.json.tmp-52116', 'temporaire');
  write(root, 'data/enregistrements/partie.mp4', 'video');
  write(root, 'config/VPinballX.ini', '[Player]\nPlayfieldWidth=1080\n');
  write(root, 'tables/Medieval Madness/Medieval Madness.vpx', 'table-mm');
  write(root, 'tables/Medieval Madness/Medieval Madness.ini', '[TableOverride]\n');
  write(root, 'tables/Medieval Madness/pinmame/nvram/mm_109c.nv', 'scores-mm');
  write(root, 'tables/Medieval Madness/pinmame/cfg/mm_109c.cfg', 'cfg-mm');
  write(root, 'tables/Medieval Madness/pinmame/roms/mm_109c.zip', 'rom-mm');
  write(root, 'tables/Medieval Madness/cache/vignette.png', 'cache');
  write(root, 'tables/Medieval Madness/medias/playfield.mp4', 'video-mm');
  write(root, 'tables/Goonies/Goonies.vpx', 'table-goonies');
  write(root, 'tables/Goonies/user/VPReg.stg', 'scores-goonies');
  write(root, 'data/amis/recus/medias.zip', 'recu');
  write(root, 'data/orientation-ecrans.json', '{}');
  write(root, 'pinmame/roms/mm_109c.zip', 'rom-mm');
  write(root, 'media/logo.png', 'logo');
  write(root, 'emulators/vpx/10.8.1/VPinballX64.exe', 'exe');
  write(root, 'emulators/vpx/10.8.1/User/VPReg.stg', 'vpreg');
  write(root, 'downloads/vpx.zip', 'archive');
  write(root, 'trash/2026-10-20 vieux/x.vpx', 'corbeille');
  write(root, 'import/nouvelle.vpx', 'import');
  write(root, 'app/CyberPinball.exe', 'app');
  return root;
}

const dataOf = (root: string) => path.join(root, 'data');

async function backup(root: string, dest: string, level: BackupLevel, extra: { auto?: boolean; now?: Date; shouldStop?: () => boolean } = {}) {
  return runBackup({ root, dataDir: dataOf(root), dest, level, cabinet: CABINET, version: '0.1.6', auto: extra.auto, now: extra.now ? () => extra.now! : undefined, shouldStop: extra.shouldStop });
}

test('chaque fichier va dans sa partie, et ce qui ne se sauvegarde jamais en est exclu', () => {
  assert.equal(partOf('data/cabinet.json'), 'cabinet');
  assert.equal(partOf('config/VPinballX-poste.ini'), 'cabinet');
  assert.equal(partOf('data/medias.json'), 'settings');
  assert.equal(partOf('tables/T/T.ini'), 'settings');
  assert.equal(partOf('tables/T/pinmame/cfg/t.cfg'), 'settings');
  assert.equal(partOf('tables/T/pinmame/nvram/t.nv'), 'scores');
  assert.equal(partOf('emulators/vpx/10.8.1/User/VPReg.stg'), 'scores');
  assert.equal(partOf('tables/T/user/VPReg.stg'), 'scores');
  assert.equal(partOf('data/social.json'), 'friends');
  assert.equal(partOf('data/amis/records.json'), 'friends');
  assert.equal(partOf('tables/T/T.vpx'), 'tables');
  assert.equal(partOf('tables/T/pinmame/roms/t.zip'), 'tables');
  assert.equal(partOf('media/x.png'), 'tables');
  assert.equal(partOf('downloads/vpx.zip'), 'vpx');
  assert.equal(partOf('data/enregistrements/p.mp4'), 'vpx');
  for (const never of [
    'app/CyberPinball.exe',
    'trash/x/y.vpx',
    'import/n.vpx',
    'data/logs/journal.txt',
    'data/cache/sante.json',
    'data/backups/VPinballX.ini.1',
    'data/sauvegardes.json',
    'data/sauvegardes-empreintes.json',
    'data/sauvegardes/objets/ab/abc',
    'data/restauration/plan.json',
    'data/restauration-derniere.json',
    'data/telechargements.json',
    'data/vpx-owned.json.tmp-52116',
    'tables/T/cache/v.png',
    'parties/T/T.vpx',
    'data/amis/recus/m.zip',
    'data/amis/tables/T/T.vpx',
    'data/orientation-ecrans.json',
    'data/mise-a-jour.json',
    'data/borne-dediee/etat.json',
  ]) {
    assert.equal(partOf(never), undefined, never);
  }
});

test('chaque niveau contient le précédent, et le plus léger ne parcourt pas les tables', async () => {
  const root = fakeRoot();
  const settings = (await scanRoot(root, LEVEL_PARTS.settings)).map((e) => e.rel);
  assert.ok(settings.includes('tables/Medieval Madness/pinmame/nvram/mm_109c.nv'));
  assert.ok(settings.includes('emulators/vpx/10.8.1/User/VPReg.stg'));
  assert.ok(settings.includes('tables/Goonies/user/VPReg.stg'));
  assert.ok(!settings.includes('data/amis/recus/medias.zip'));
  assert.ok(!settings.some((r) => r.endsWith('.vpx') || r.endsWith('.mp4') || r.includes('/roms/')));
  const tables = (await scanRoot(root, LEVEL_PARTS.tables)).map((e) => e.rel);
  for (const r of settings) assert.ok(tables.includes(r), r);
  assert.ok(tables.includes('tables/Medieval Madness/Medieval Madness.vpx'));
  assert.ok(!tables.includes('downloads/vpx.zip'));
  const all = (await scanRoot(root, LEVEL_PARTS.all)).map((e) => e.rel);
  for (const r of tables) assert.ok(all.includes(r), r);
  assert.ok(all.includes('downloads/vpx.zip') && all.includes('emulators/vpx/10.8.1/VPinballX64.exe'));
  assert.ok(!all.some((r) => r.startsWith('app/') || r.startsWith('trash/') || r.includes('/cache/')));
});

test('une jonction n’est jamais suivie', async (t) => {
  const root = fakeRoot();
  const target = path.join(root, 'emulators', 'vpx', '10.8.1');
  try {
    fs.symlinkSync(target, path.join(root, 'emulators', 'vpx', 'current'), 'junction');
  } catch {
    t.skip('jonction impossible ici');
    return;
  }
  const all = (await scanRoot(root, LEVEL_PARTS.all)).map((e) => e.rel);
  assert.ok(!all.some((r) => r.includes('/current/')));
});

test('une sauvegarde copie chaque contenu une fois, relu et vérifié ; la suivante ne recopie que ce qui a changé', async () => {
  const root = fakeRoot();
  const dest = tmp('cp-sauvegarde-cle-');
  const first = await backup(root, dest, 'tables', { now: new Date('2026-11-01T04:00:00') });
  assert.ok(first.ok);
  assert.ok(first.info.manifest.complete && first.info.manifest.verifiedAt);
  assert.deepEqual(first.info.manifest.partsDone, ['cabinet', 'settings', 'scores', 'friends', 'tables']);
  // La ROM de la bibliothèque et celle de la table ont le même contenu : un seul objet.
  const roms = first.info.manifest.files.filter((f) => f.rel.endsWith('mm_109c.zip'));
  assert.equal(roms.length, 2);
  assert.equal(roms[0]!.sha256, roms[1]!.sha256);
  assert.ok(first.reused >= 1);

  write(root, 'tables/Medieval Madness/pinmame/nvram/mm_109c.nv', 'scores-mm-nouveau-record');
  const second = await backup(root, dest, 'tables', { now: new Date('2026-11-04T21:12:00') });
  assert.ok(second.ok);
  assert.equal(second.written, Buffer.byteLength('scores-mm-nouveau-record'));
  const listed = listBackups(dest);
  assert.equal(listed.length, 2);
  assert.equal(listed[0]!.manifest.createdAt, second.info.manifest.createdAt);
  assert.equal(listed[0]!.damaged, 0);
  assert.equal(listed[0]!.manifest.cabinet.name, 'Borne du salon');
});

test('l’estimation déduit ce qui est déjà sur la clé et signale les fichiers trop gros pour FAT32', async () => {
  const root = fakeRoot();
  const dest = tmp('cp-sauvegarde-cle-');
  const entries = await scanRoot(root, LEVEL_PARTS.tables);
  const before = estimateBackup(entries, dest, loadHashCache(dataOf(root)), 6);
  assert.equal(before.toWrite, before.totalBytes);
  assert.ok(before.tooBig.some((e) => e.rel.endsWith('.vpx')));
  await backup(root, dest, 'tables');
  const after = estimateBackup(await scanRoot(root, LEVEL_PARTS.tables), dest, loadHashCache(dataOf(root)));
  assert.equal(after.toWrite, 0);
  // La limite refuse la sauvegarde avant d'écrire.
  const refused = await runBackup({ root, dataDir: dataOf(root), dest: tmp('cp-fat32-'), level: 'tables', cabinet: CABINET, version: '0.1.6', maxFileSize: 6 });
  assert.equal(refused.ok, false);
});

test('une sauvegarde arrêtée garde ce qui est vérifié, marquée incomplète ; une complète du même niveau la range', async () => {
  const root = fakeRoot();
  const dest = tmp('cp-sauvegarde-cle-');
  let files = 0;
  const stopped = await backup(root, dest, 'tables', { now: new Date('2026-11-04T21:00:00'), shouldStop: () => ++files > 12 });
  assert.equal(stopped.ok, false);
  const partial = listBackups(dest)[0]!;
  assert.equal(partial.manifest.complete, false);
  assert.ok(partial.manifest.partsDone.includes('cabinet'));
  assert.ok(!partial.manifest.partsDone.includes('tables'));
  const done = await backup(root, dest, 'tables', { now: new Date('2026-11-04T21:10:00') });
  assert.ok(done.ok);
  pruneBackups(dest, CABINET.id);
  const left = listBackups(dest);
  assert.equal(left.length, 1);
  assert.ok(left[0]!.manifest.complete);
});

test('un objet manquant ou tronqué rend la sauvegarde endommagée', async () => {
  const root = fakeRoot();
  const dest = tmp('cp-sauvegarde-cle-');
  const done = await backup(root, dest, 'settings');
  assert.ok(done.ok);
  const victim = done.info.manifest.files[0]!;
  fs.writeFileSync(path.join(dest, 'objets', victim.sha256.slice(0, 2), victim.sha256), 'x');
  assert.equal(listBackups(dest)[0]!.damaged, 1);
});

test('restaurer : rien ne change avant le démarrage, puis chaque fichier remplacé passe par la corbeille', async () => {
  const root = fakeRoot();
  const dest = tmp('cp-sauvegarde-cle-');
  const done = await backup(root, dest, 'tables');
  assert.ok(done.ok);
  // Depuis la sauvegarde : un réglage changé, un score perdu, une table ajoutée.
  write(root, 'config/VPinballX.ini', '[Player]\nPlayfieldWidth=999\n');
  fs.rmSync(path.join(root, 'tables', 'Medieval Madness', 'pinmame', 'nvram', 'mm_109c.nv'));
  write(root, 'tables/Junk Yard/Junk Yard.vpx', 'table-jy');

  const info = listBackups(dest)[0]!;
  const plan = await planRestore(info, root, dataOf(root), ['cabinet', 'scores', 'tables']);
  const byPart = Object.fromEntries(plan.parts.map((p) => [p.part, p]));
  assert.equal(byPart.cabinet!.replace, 1);
  assert.equal(byPart.scores!.add, 1);
  assert.equal(byPart.tables!.replace + byPart.tables!.add, 0);

  const prepared = await prepareRestore(plan, dataOf(root));
  assert.ok(prepared.ok);
  assert.ok(loadPendingRestore(dataOf(root)));
  assert.match(read(root, 'config/VPinballX.ini'), /999/, 'rien n’est posé avant le redémarrage');

  const applied = applyPendingRestore(root, dataOf(root), path.join(root, 'trash'), new Date('2026-11-04T21:40:00'));
  assert.ok(applied);
  assert.equal(applied.failed.length, 0);
  assert.match(read(root, 'config/VPinballX.ini'), /1080/);
  assert.equal(read(root, 'tables/Medieval Madness/pinmame/nvram/mm_109c.nv'), 'scores-mm');
  assert.equal(read(root, 'tables/Junk Yard/Junk Yard.vpx'), 'table-jy', 'une table ajoutée depuis reste');
  assert.match(fs.readFileSync(path.join(applied.trashDir, 'config', 'VPinballX.ini'), 'utf8'), /999/);
  assert.equal(loadPendingRestore(dataOf(root)), undefined);
  assert.ok(canUndoLastRestore(dataOf(root)));

  // Annuler : l'état d'avant revient, le fichier ajouté par la restauration repart.
  assert.ok(prepareUndoLastRestore(dataOf(root)));
  const undone = applyPendingRestore(root, dataOf(root), path.join(root, 'trash'), new Date('2026-11-04T21:45:00'));
  assert.ok(undone && undone.kind === 'undo');
  assert.match(read(root, 'config/VPinballX.ini'), /999/);
  assert.ok(!fs.existsSync(path.join(root, 'tables', 'Medieval Madness', 'pinmame', 'nvram', 'mm_109c.nv')));
  assert.equal(loadLastRestore(dataOf(root))!.kind, 'undo');
  assert.equal(canUndoLastRestore(dataOf(root)), false);
});

test('sans les tables, les réglages et scores d’une table absente ici sont ignorés', async () => {
  const root = fakeRoot();
  const dest = tmp('cp-sauvegarde-cle-');
  assert.ok((await backup(root, dest, 'settings')).ok);
  const other = fakeRoot();
  fs.rmSync(path.join(other, 'tables', 'Medieval Madness'), { recursive: true });
  const plan = await planRestore(listBackups(dest)[0]!, other, dataOf(other), ['settings', 'scores']);
  assert.ok(plan.parts.every((p) => p.replace + p.add === 0 || !p.tables.includes('Medieval Madness')));
  assert.ok(plan.parts.some((p) => p.skipped > 0));
  assert.ok(!plan.files.some((f) => f.rel.startsWith('tables/Medieval Madness/')));
});

test('une préparation arrêtée ne laisse rien', async () => {
  const root = fakeRoot();
  const dest = tmp('cp-sauvegarde-cle-');
  assert.ok((await backup(root, dest, 'settings')).ok);
  fs.rmSync(path.join(root, 'config'), { recursive: true });
  const plan = await planRestore(listBackups(dest)[0]!, root, dataOf(root), ['cabinet']);
  const stopped = await prepareRestore(plan, dataOf(root), { shouldStop: () => true });
  assert.equal(stopped.ok, false);
  assert.equal(loadPendingRestore(dataOf(root)), undefined);
  assert.ok(!fs.existsSync(path.join(dataOf(root), 'restauration')));
});

test('une sauvegarde abîmée est refusée à la préparation, sans rien poser', async () => {
  const root = fakeRoot();
  const dest = tmp('cp-sauvegarde-cle-');
  const done = await backup(root, dest, 'settings');
  assert.ok(done.ok);
  write(root, 'config/VPinballX.ini', 'autre');
  const cfg = done.info.manifest.files.find((f) => f.rel === 'config/VPinballX.ini')!;
  fs.writeFileSync(path.join(dest, 'objets', cfg.sha256.slice(0, 2), cfg.sha256), 'abime!');
  const plan = await planRestore(listBackups(dest, false)[0]!, root, dataOf(root), ['cabinet']);
  const refused = await prepareRestore(plan, dataOf(root));
  assert.equal(refused.ok, false);
  assert.equal(read(root, 'config/VPinballX.ini'), 'autre');
});

test('reconnaître ses sauvegardes : même identité, ou installation neuve', () => {
  const root = fakeRoot();
  const manifest = { cabinet: { id: 'x', name: 'Borne' } } as Parameters<typeof isSameCabinet>[0];
  fs.writeFileSync(path.join(dataOf(root), 'borne.json'), JSON.stringify({ id: 'x' }));
  assert.equal(isSameCabinet(manifest, dataOf(root)), true);
  fs.writeFileSync(path.join(dataOf(root), 'borne.json'), JSON.stringify({ id: 'y' }));
  assert.equal(isSameCabinet(manifest, dataOf(root)), false);
  const fresh = tmp('cp-neuve-');
  assert.equal(isSameCabinet(manifest, fresh), true);
});

test('les sauvegardes automatiques au-delà des dix dernières sont rangées, jamais celles faites à la main', async () => {
  const root = fakeRoot();
  const dest = tmp('cp-sauvegarde-locale-');
  for (let i = 0; i < 12; i++) {
    write(root, 'data/medias.json', `{"n":${i}}`);
    assert.ok((await backup(root, dest, 'settings', { auto: true, now: new Date(2026, 9, 1 + i, 4, 0) })).ok);
  }
  assert.ok((await backup(root, dest, 'settings', { now: new Date(2026, 8, 1, 12, 0) })).ok);
  const { removed } = pruneBackups(dest, CABINET.id, 10);
  assert.equal(removed, 2);
  const left = listBackups(dest);
  assert.equal(left.filter((b) => b.manifest.auto).length, 10);
  assert.equal(left.filter((b) => !b.manifest.auto).length, 1);
  assert.ok(left.every((b) => b.damaged === 0), 'les objets encore cités restent');
});

test('échéances à heure fixe : l’heure et le jour choisis ; manquée, elle reste due', () => {
  // Mercredi 4 novembre 2026, 21 h : le dernier dimanche 4 h est le 1er novembre.
  const wed = new Date(2026, 10, 4, 21, 0);
  const weekly = { auto: 'weekly', moment: 'fixed' } as const;
  const slot = lastAutoSlot(weekly, wed)!;
  assert.equal(slot.getDay(), 0);
  assert.equal(slot.getDate(), 1);
  assert.equal(slot.getHours(), 4);
  assert.equal(lastAutoSlot({ auto: 'daily', moment: 'fixed' }, wed)!.getDate(), 4);
  assert.equal(lastAutoSlot({ auto: 'daily', moment: 'fixed' }, new Date(2026, 10, 4, 3, 0))!.getDate(), 3);
  // Heure et jour choisis : le mardi à 22 h ; à 21 h ce mercredi, le dernier est hier soir.
  const tue = lastAutoSlot({ auto: 'weekly', moment: 'fixed', hour: 22, weekday: 2 }, wed)!;
  assert.deepEqual([tue.getDate(), tue.getHours()], [3, 22]);
  const daily22 = lastAutoSlot({ auto: 'daily', moment: 'fixed', hour: 22 }, wed)!;
  assert.deepEqual([daily22.getDate(), daily22.getHours()], [3, 22]);
  assert.equal(nextAutoSlot({ auto: 'daily', moment: 'fixed', hour: 22 }, wed)!.getDate(), 4);
  assert.equal(lastAutoSlot({ auto: 'off' }, wed), undefined);
  assert.equal(autoBackupDue({ ...weekly, copyToDestination: true }, wed), true);
  assert.equal(autoBackupDue({ ...weekly, copyToDestination: true, lastAuto: new Date(2026, 10, 1, 4, 5).toISOString() }, wed), false);
  assert.equal(autoBackupDue({ ...weekly, copyToDestination: true, lastAuto: new Date(2026, 9, 31, 4, 5).toISOString() }, wed), true);
  assert.equal(autoBackupDue({ auto: 'off', copyToDestination: true }, wed), false);
  // Choisie ce mercredi : le dimanche passé n'est pas manqué, la première attend dimanche prochain.
  const chosen = { ...weekly, copyToDestination: true, autoSince: new Date(2026, 10, 4, 20, 0).toISOString() };
  assert.equal(autoBackupDue(chosen, wed), false);
  assert.equal(autoBackupDue(chosen, new Date(2026, 10, 8, 4, 1)), true, 'dimanche 4 h passé : due');
  assert.equal(autoBackupDue(chosen, new Date(2026, 10, 9, 18, 0)), true, 'PC éteint dimanche : rattrapée lundi');
  // Dès que possible : choisie maintenant, la première se fait aussitôt.
  assert.equal(autoBackupDue({ auto: 'daily', moment: 'asap', copyToDestination: true, autoSince: wed.toISOString() }, wed), true);
});

test('échéances dès que possible : une par jour ou par semaine (du lundi), à la première occasion', () => {
  const wed = new Date(2026, 10, 4, 21, 0);
  // Chaque jour : due tant qu'aucune n'est faite depuis 0 h, quelle que soit l'heure d'allumage.
  const daily = { auto: 'daily', moment: 'asap', copyToDestination: true } as const;
  assert.equal(lastAutoSlot(daily, wed)!.getHours(), 0);
  assert.equal(autoBackupDue({ ...daily, lastAuto: new Date(2026, 10, 3, 23, 30).toISOString() }, wed), true, 'faite hier soir : due aujourd’hui');
  assert.equal(autoBackupDue({ ...daily, lastAuto: new Date(2026, 10, 4, 0, 10).toISOString() }, wed), false, 'faite cette nuit : rien avant demain');
  assert.equal(nextAutoSlot(daily, wed)!.getDate(), 5);
  // Chaque semaine : la semaine commence le lundi 2 novembre.
  const weekly = { auto: 'weekly', moment: 'asap', copyToDestination: true } as const;
  const monday = lastAutoSlot(weekly, wed)!;
  assert.deepEqual([monday.getDay(), monday.getDate(), monday.getHours()], [1, 2, 0]);
  assert.equal(autoBackupDue({ ...weekly, lastAuto: new Date(2026, 10, 1, 20, 0).toISOString() }, wed), true, 'faite dimanche : semaine nouvelle, due');
  assert.equal(autoBackupDue({ ...weekly, lastAuto: new Date(2026, 10, 2, 19, 0).toISOString() }, wed), false, 'faite lundi : rien avant lundi prochain');
  assert.equal(nextAutoSlot(weekly, wed)!.getDate(), 9);
});

test('réglages : « chaque nuit » de la préversion devient chaque jour à heure fixe, valeurs hors bornes ignorées', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-sauv-reglages-'));
  try {
    fs.writeFileSync(path.join(dir, 'sauvegardes.json'), JSON.stringify({ auto: 'nightly', copyToDestination: true }));
    const legacy = loadBackupSettings(dir);
    assert.deepEqual([legacy.auto, legacy.moment, autoHour(legacy)], ['daily', 'fixed', 4]);
    fs.writeFileSync(path.join(dir, 'sauvegardes.json'), JSON.stringify({ auto: 'weekly', hour: 31, weekday: -1 }));
    const odd = loadBackupSettings(dir);
    assert.deepEqual([odd.moment, odd.hour, odd.weekday, autoHour(odd), autoWeekday(odd)], ['asap', undefined, undefined, 4, 0]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
test('un dossier des données hors de la racine (bac à sable) est sauvegardé et restauré à sa place', async () => {
  const root = fakeRoot();
  const home = tmp('cp-sauvegarde-home-');
  fs.cpSync(path.join(root, 'data'), home, { recursive: true });
  fs.rmSync(path.join(root, 'data'), { recursive: true });
  const dest = tmp('cp-sauvegarde-cle-');
  const done = await runBackup({ root, dataDir: home, dest, level: 'settings', cabinet: CABINET, version: '0.1.6' });
  assert.ok(done.ok);
  assert.ok(done.info.manifest.files.some((f) => f.rel === 'data/cabinet.json'));
  fs.writeFileSync(path.join(home, 'cabinet.json'), '{"change":1}');
  const plan = await planRestore(listBackups(dest)[0]!, root, home, ['cabinet']);
  assert.ok((await prepareRestore(plan, home)).ok);
  assert.ok(applyPendingRestore(root, home, path.join(root, 'trash')));
  assert.equal(fs.readFileSync(path.join(home, 'cabinet.json'), 'utf8'), '{"configurations":[]}');
  assert.ok(!fs.existsSync(path.join(root, 'data')), 'rien n’est posé dans <racine>\data');
});

test('un fichier qui ne peut être posé au démarrage reste en attente, puis est posé au nouvel essai, dans le même constat', async () => {
  const root = fakeRoot();
  const dest = tmp('cp-sauvegarde-cle-');
  assert.ok((await backup(root, dest, 'settings')).ok);
  // La NVRAM disparaît, et un fichier occupe la place de son dossier : la pose échouera.
  fs.rmSync(path.join(root, 'tables', 'Medieval Madness', 'pinmame', 'nvram'), { recursive: true });
  write(root, 'tables/Medieval Madness/pinmame/nvram', 'un fichier à la place du dossier');
  write(root, 'config/VPinballX.ini', 'change');
  const plan = await planRestore(listBackups(dest)[0]!, root, dataOf(root), ['cabinet', 'scores']);
  assert.ok((await prepareRestore(plan, dataOf(root))).ok);
  const first = applyPendingRestore(root, dataOf(root), path.join(root, 'trash'))!;
  assert.equal(first.failed.length, 1);
  assert.match(read(root, 'config/VPinballX.ini'), /1080/, 'le reste est posé');
  assert.equal(read(root, 'tables/Medieval Madness/pinmame/nvram'), 'un fichier à la place du dossier', 'rien n’est perdu');
  const waiting = loadPendingRestore(dataOf(root))!;
  assert.equal(waiting.items.length, 1);
  assert.equal(waiting.retry?.attempts, 1);
  // La place se libère : le nouvel essai pose le fichier et complète le même constat.
  fs.rmSync(path.join(root, 'tables', 'Medieval Madness', 'pinmame', 'nvram'));
  const second = applyPendingRestore(root, dataOf(root), path.join(root, 'trash'))!;
  assert.equal(second.failed.length, 0);
  assert.equal(second.trashDir, first.trashDir);
  assert.equal(read(root, 'tables/Medieval Madness/pinmame/nvram/mm_109c.nv'), 'scores-mm');
  assert.ok(second.put.includes('config/VPinballX.ini') && second.put.includes('tables/Medieval Madness/pinmame/nvram/mm_109c.nv'));
  assert.equal(loadPendingRestore(dataOf(root)), undefined);
});
