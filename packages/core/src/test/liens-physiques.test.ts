// Liens physiques de l'import d'une installation reprise (hardlink.ts) : aucune place en plus sur le
// même disque, et l'installation d'origine reste octet pour octet identique, date comprise, quoi que
// Cyber Pinball fasse ensuite de ses propres noms (option de PuP-Pack, remplacement, désactivation
// du pack, corbeille, écriture sur place). Vrais liens NTFS sur le volume temporaire.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test, type TestContext } from 'node:test';
import { copyTree } from '../copytree';
import { applyOps, sameFile, sizeOf, type OpContext } from '../fileops';
import { detachHardLink, installHardLinkGuard, isLinkable, linkCount, linkOrCopy } from '../hardlink';
import { importLinks } from '../importlinks';
import { importSpace } from '../importspace';
import { disablePupPacks } from '../pupdisabled';
import { applyImport, planImport } from '../tableimport';

const REPO = path.join(__dirname, '..', '..', '..', '..');

installHardLinkGuard();

const OLD = new Date('2024-03-05T10:20:30Z');

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-liens-'));
}

/** Écrit un fichier de l'installation d'origine, daté d'avant. */
function original(file: string, content: string | Buffer): string {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  fs.utimesSync(file, OLD, OLD);
  return file;
}

/** Empreinte d'un fichier d'origine : ses octets et sa date. */
function snapshot(file: string): { bytes: string; mtime: number } {
  return { bytes: fs.readFileSync(file).toString('base64'), mtime: fs.statSync(file).mtimeMs };
}

function linksWork(t: TestContext, dir: string): boolean {
  const a = path.join(dir, 'essai-a');
  fs.writeFileSync(a, 'x');
  try {
    fs.linkSync(a, path.join(dir, 'essai-b'));
    return true;
  } catch {
    t.skip('volume temporaire sans liens physiques');
    return false;
  } finally {
    fs.rmSync(path.join(dir, 'essai-b'), { force: true });
    fs.rmSync(a, { force: true });
  }
}

function ctxIn(root: string): OpContext {
  return { trashDir: path.join(root, 'trash', 'essai') };
}

/** Installation d'origine factice : une table dans son dossier, et son PuP-Pack dans PUPVideos. */
function installation(root: string) {
  const tables = path.join(root, 'Popper', 'Tables', 'Terminator 2 (Williams 1991)');
  const pack = path.join(root, 'Popper', 'PUPVideos', 'T2');
  const files = {
    vpx: original(path.join(tables, 'Terminator 2 (Williams 1991).vpx'), Buffer.alloc(256 * 1024, 7)),
    b2s: original(path.join(tables, 'Terminator 2 (Williams 1991).directb2s'), 'fronton'),
    ini: original(path.join(tables, 'Terminator 2 (Williams 1991).ini'), '[Player]\nVolume=1\n'),
    screens: original(path.join(pack, 'screens.pup'), 'ScreenNum,ScreenDes\n2,Backglass\n'),
    video: original(path.join(pack, 'Backglass', 'intro.mp4'), Buffer.alloc(64 * 1024, 3)),
    option: original(path.join(pack, 'Option', 'Backglass', 'intro.mp4'), Buffer.alloc(32 * 1024, 9)),
  };
  return { tables, pack, files };
}

function importInstallation(root: string, src: ReturnType<typeof installation>) {
  const tablesDir = path.join(root, 'CyberPinball', 'Tables');
  const plan = planImport(
    [
      { path: src.tables, mode: 'copy', link: true },
      { path: src.pack, mode: 'copy', link: true, owner: src.files.vpx },
    ],
    { tablesDir },
  );
  assert.equal(plan.tables.length, 1);
  const table = plan.tables[0]!;
  applyImport(table, { ...ctxIn(path.join(root, 'CyberPinball')), cleanupRoots: [] });
  return { plan, table, folder: table.folder };
}

function find(dir: string, name: string): string {
  const hit = (fs.readdirSync(dir, { recursive: true }) as string[]).find((f) => path.basename(f).toLowerCase() === name.toLowerCase());
  assert.ok(hit, `${name} absent de ${dir}`);
  return path.join(dir, hit);
}

test('seuls les gros fichiers qui ne bougent pas sont liables', () => {
  for (const f of ['t.vpx', 'T.DirectB2S', 'a.mp4', 'b.png', 'c.mp3', 'rom.zip', 'x.cRZ']) assert.ok(isLinkable(f), f);
  for (const f of ['screens.pup', 't.ini', 't.vbs', 't.pov', 't.cfg', 'a.xml', 'b.txt', 't.res', 'nvram.nv', 'VPReg.stg', 't.info']) assert.ok(!isLinkable(f), f);
});

test('import d’une installation : gros fichiers liés, petits fichiers copiés, dossiers réels', (t) => {
  const root = tmp();
  if (!linksWork(t, root)) return;
  const src = installation(root);
  const before = Object.fromEntries(Object.entries(src.files).map(([k, f]) => [k, snapshot(f)]));
  const { plan, folder } = importInstallation(root, src);

  const vpx = find(folder, 'Terminator 2 (Williams 1991).vpx');
  assert.ok(sameFile(vpx, src.files.vpx), 'le .vpx est un lien physique');
  assert.ok(sameFile(find(folder, 'Terminator 2 (Williams 1991).directb2s'), src.files.b2s));
  const video = path.join(folder, 'pupvideos', 'T2', 'Backglass', 'intro.mp4');
  assert.ok(sameFile(video, src.files.video), 'la vidéo du pack est liée');
  const ini = find(folder, 'Terminator 2 (Williams 1991).ini');
  assert.ok(!sameFile(ini, src.files.ini), 'le .ini est copié');
  assert.equal(linkCount(ini), 1);
  const screens = path.join(folder, 'pupvideos', 'T2', 'screens.pup');
  assert.ok(!sameFile(screens, src.files.screens), 'screens.pup est copié');
  assert.ok(!fs.lstatSync(path.join(folder, 'pupvideos', 'T2')).isSymbolicLink(), 'un vrai dossier, jamais une jonction');

  // Le plan dit ce qui sera lié et copié (recalculé ici après coup : mêmes sources).
  const links = importLinks(plan)!;
  assert.equal(links.linkedFiles, 4);
  assert.equal(links.linked, 256 * 1024 + 'fronton'.length + 64 * 1024 + 32 * 1024);
  assert.equal(links.copiedFiles, 2);
  assert.equal(links.otherDisk, undefined);
  // La place demandée (importspace.ts) ne compte que les fichiers copiés.
  const space = importSpace(plan, { free: () => 1024 ** 4 });
  assert.equal(space.bytes, fs.statSync(src.files.ini).size + fs.statSync(src.files.screens).size);

  for (const [k, f] of Object.entries(src.files)) assert.deepEqual(snapshot(f), before[k], `${k} intact`);
});

test('après l’import, rien de ce que fait Cyber Pinball ne touche l’original', (t) => {
  const root = tmp();
  if (!linksWork(t, root)) return;
  const src = installation(root);
  const before = Object.fromEntries(Object.entries(src.files).map(([k, f]) => [k, snapshot(f)]));
  const { folder } = importInstallation(root, src);
  const ctx = ctxIn(path.join(root, 'CyberPinball'));
  const pack = path.join(folder, 'pupvideos', 'T2');
  const vpx = find(folder, 'Terminator 2 (Williams 1991).vpx');
  const intact = (why: string) => {
    for (const [k, f] of Object.entries(src.files)) assert.deepEqual(snapshot(f), before[k], `${k} intact après : ${why}`);
  };

  // Option de PuP-Pack appliquée (packOps, doctor) : la vidéo de l'option recopiée sur la vidéo liée.
  applyOps([{ op: 'copy', from: path.join(pack, 'Option', 'Backglass', 'intro.mp4'), to: path.join(pack, 'Backglass', 'intro.mp4') }], ctx);
  assert.equal(fs.readFileSync(path.join(pack, 'Backglass', 'intro.mp4')).length, 32 * 1024);
  intact('option de PuP-Pack');

  // Copie qui écrase (copyTree par défaut) une vidéo liée.
  fs.linkSync(src.files.video, path.join(pack, 'Backglass', 'again.mp4'));
  copyTree(path.join(pack, 'screens.pup'), path.join(pack, 'Backglass', 'again.mp4'));
  intact('copie par-dessus');

  // Remplacement d'une table : une nouvelle version arrive du dossier d'import.
  const incoming = path.join(root, 'import', 'Terminator 2 (Williams 1991).vpx');
  original(incoming, 'nouvelle version');
  applyOps([{ op: 'move', from: incoming, to: vpx }], ctx);
  assert.equal(fs.readFileSync(vpx, 'utf8'), 'nouvelle version');
  intact('remplacement de la table');

  // Écriture d'un texte par Cyber Pinball (writeReplacing) sur un fichier lié.
  const b2s = find(folder, 'Terminator 2 (Williams 1991).directb2s');
  applyOps([{ op: 'write', path: b2s, content: 'réécrit' }], ctx);
  intact('écriture de Cyber Pinball');

  // Désactivation du pack : son dossier change de place.
  const off = disablePupPacks(folder, ['T2'], ctx);
  assert.deepEqual(off.moved, ['T2']);
  intact('désactivation du pack');

  // Corbeille et suppression.
  const video = find(folder, 'intro.mp4');
  applyOps([{ op: 'trash', path: video }], ctx);
  applyOps([{ op: 'delete', path: path.join(folder, 'pupvideos (désactivés)') }], ctx);
  intact('corbeille et suppression');
  assert.ok(fs.existsSync(src.files.video), 'l’original reste après la corbeille');
});

test('garde : toute écriture sur place dans un fichier lié coupe le lien d’abord', async (t) => {
  const root = tmp();
  if (!linksWork(t, root)) return;
  const orig = original(path.join(root, 'origine', 'media.png'), 'octets d’origine');
  const before = snapshot(orig);
  let n = 0;
  const linked = () => {
    const p = path.join(root, 'nous', `lien-${n++}.png`);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.linkSync(orig, p);
    return p;
  };
  const writes: [string, (p: string) => unknown][] = [
    ['writeFileSync', (p) => fs.writeFileSync(p, 'nouveau')],
    ['writeFileSync flag a', (p) => fs.writeFileSync(p, ' ajout', { flag: 'a' })],
    ['appendFileSync', (p) => fs.appendFileSync(p, ' ajout')],
    ['copyFileSync (fronton du .directb2s, b2simage.ts)', (p) => fs.copyFileSync(path.join(root, 'nous', 'autre.png'), p)],
    ['openSync r+', (p) => {
      const fd = fs.openSync(p, 'r+');
      fs.writeSync(fd, 'XX', 0);
      fs.closeSync(fd);
    }],
    ['openSync w (drapeaux numériques)', (p) => fs.closeSync(fs.openSync(p, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_TRUNC))],
    ['openSync r+ (drapeaux numériques)', (p) => fs.closeSync(fs.openSync(p, fs.constants.O_RDWR))],
    ['truncateSync', (p) => fs.truncateSync(p, 2)],
    ['utimesSync', (p) => fs.utimesSync(p, new Date(), new Date())],
    ['promises.writeFile', (p) => fs.promises.writeFile(p, 'nouveau')],
    ['promises.copyFile', (p) => fs.promises.copyFile(path.join(root, 'nous', 'autre.png'), p)],
    ['promises.appendFile', (p) => fs.promises.appendFile(p, ' ajout')],
    ['promises.open r+', async (p) => {
      const h = await fs.promises.open(p, 'r+');
      await h.write('YY', 0);
      await h.close();
    }],
    ['copyFile à rappel', (p) => new Promise<void>((resolve, reject) => fs.copyFile(path.join(root, 'nous', 'autre.png'), p, (e) => (e ? reject(e) : resolve())))],
    ['createWriteStream', (p) => new Promise<void>((resolve, reject) => {
      const s = fs.createWriteStream(p);
      s.on('error', reject);
      s.end('flux', resolve);
    })],
  ];
  fs.mkdirSync(path.join(root, 'nous'), { recursive: true });
  fs.writeFileSync(path.join(root, 'nous', 'autre.png'), 'autre');
  for (const [name, write] of writes) {
    const p = linked();
    await write(p);
    assert.deepEqual(snapshot(orig), before, `${name} : l’original est intact`);
    assert.equal(linkCount(p), 1, `${name} : notre fichier est à lui seul`);
    assert.equal(linkCount(orig), 1 + fs.readdirSync(path.join(root, 'nous')).filter((f) => sameFile(path.join(root, 'nous', f), orig)).length);
  }
  // Ajout et écriture au milieu : le contenu d'avant est gardé.
  const kept = linked();
  fs.appendFileSync(kept, '!');
  assert.equal(fs.readFileSync(kept, 'utf8'), 'octets d’origine!');

  // Écriture qui échoue : notre nom revient tel qu'il était, toujours lié.
  const failing = linked();
  assert.throws(() => fs.copyFileSync(path.join(root, 'absent.png'), failing));
  assert.ok(sameFile(failing, orig), 'remis en place après l’échec');
  assert.deepEqual(snapshot(orig), before);

  // Ouverture exclusive : refusée comme avant sur un fichier existant.
  assert.throws(() => fs.writeFileSync(linked(), 'x', { flag: 'wx' }), { code: 'EEXIST' });
  assert.deepEqual(snapshot(orig), before);
});

test('place : un fichier présent sous deux noms dans un dossier ne compte qu’une fois', (t) => {
  const root = tmp();
  if (!linksWork(t, root)) return;
  const a = original(path.join(root, 'pack', 'a.mp4'), Buffer.alloc(1000, 1));
  fs.mkdirSync(path.join(root, 'pack', 'option'));
  fs.linkSync(a, path.join(root, 'pack', 'option', 'b.mp4'));
  original(path.join(root, 'pack', 'screens.pup'), 'x'.repeat(10));
  assert.equal(sizeOf(path.join(root, 'pack')), 1010);
});

test('detachHardLink : copie à elle, mêmes octets et même date ; rien sur un fichier seul', (t) => {
  const root = tmp();
  if (!linksWork(t, root)) return;
  const orig = original(path.join(root, 'a.vpx'), 'table');
  const ours = path.join(root, 'b.vpx');
  fs.linkSync(orig, ours);
  assert.equal(detachHardLink(ours), true);
  assert.ok(!sameFile(orig, ours));
  assert.equal(fs.readFileSync(ours, 'utf8'), 'table');
  assert.equal(fs.statSync(ours).mtimeMs, OLD.getTime());
  assert.equal(detachHardLink(ours), false);
  assert.equal(detachHardLink(path.join(root, 'absent')), false);
});

test('autre disque : copie fichier par fichier, sans erreur, et le plan le dit', (t) => {
  const here = tmp();
  if (!linksWork(t, here)) return;
  // Le dépôt et le dossier temporaire sont souvent sur deux disques (D: et C:) : vrai essai d'un volume à l'autre.
  const there = path.join(REPO, 'tmp', `liens-${process.pid}`);
  fs.mkdirSync(there, { recursive: true });
  try {
    if (fs.statSync(here).dev === fs.statSync(there).dev) return t.skip('un seul volume sur ce poste');
    const src = installation(here);
    assert.equal(linkOrCopy(src.files.vpx, path.join(there, 'copie.vpx')), 'copied');
    const plan = planImport([{ path: src.tables, mode: 'copy', link: true }], { tablesDir: path.join(there, 'Tables') });
    const links = importLinks(plan)!;
    assert.equal(links.linkedFiles, 0);
    assert.ok(links.otherDisk, 'autre disque signalé');
    assert.equal(links.otherDisk.linkable, 256 * 1024 + 'fronton'.length);
    applyImport(plan.tables[0]!, { ...ctxIn(there), cleanupRoots: [] });
    const vpx = find(plan.tables[0]!.folder, 'Terminator 2 (Williams 1991).vpx');
    assert.equal(linkCount(vpx), 1);
    assert.equal(fs.readFileSync(vpx).length, 256 * 1024);
  } finally {
    fs.rmSync(there, { recursive: true, force: true });
  }
});

test('la garde est branchée dans chaque point d’entrée, avant tout le reste', () => {
  for (const entry of ['main.ts', 'sync-cli.ts', 'fulldmd-cli.ts']) {
    const text = fs.readFileSync(path.join(REPO, 'app', 'src', entry), 'utf8');
    const guard = text.indexOf("import './hardlink-guard';");
    assert.ok(guard > 0, `${entry} : import './hardlink-guard' manquant`);
    const firstOther = [...text.matchAll(/^import .*$/gm)].find((m) => !/sandbox-guard|sandbox-profile|hardlink-guard/.test(m[0]));
    assert.ok(!firstOther || firstOther.index! > guard, `${entry} : la garde doit précéder ${firstOther?.[0]}`);
  }
});
