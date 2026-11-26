// Fichiers de taille quelconque : jamais lus d'un bloc (boundedread.ts), et la place disque d'un
// import dite avant la copie (importspace.ts).
//
// Défaut du 19/11/2026 : un joueur reprend son installation existante (plus de 600 tables, avec leurs
// PuP-Packs). Au bout d'une demi-heure d'analyse, « Opération interrompue : File size (…) is greater
// than 2 GiB ». Un .zip de plusieurs Go rangé avec ses tables (l'archive téléchargée d'une table),
// illisible pour la lecture d'un bloc, était cru ROM sur son extension, puis lu d'un bloc pour en
// tirer l'empreinte : Node refuse tout fichier de plus de 2 Gio.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { fileDigest, readWholeFile, FileTooBigError } from '../boundedread';
import { installationCompanions } from '../installation';
import { importLinks } from '../importlinks';
import { importSpace, importSpaceProblems, IMPORT_SPACE_MARGIN } from '../importspace';
import { romFile, romHash } from '../romlibrary';
import { buildZip, isRomZip, readZipEntries, zipContentHash, ROM_ZIP_MAX } from '../romzip';
import { planImport, type ImportPlan } from '../tableimport';

const GIB = 1024 ** 3;

// La règle sur toutes les sources (aucune lecture d’un bloc sans borne) est dans
// lecture-bornee-garde.test.ts : un test rapide, passé à chaque branche, alors que celui-ci est lent
// (fsutil).

// ---------- Fichiers creux de plusieurs Go ----------

/**
 * Fichier creux (NTFS) de `size` octets : il ne prend presque aucune place sur le disque, mais se
 * présente comme un vrai fichier de cette taille. `tail` : ses derniers octets. undefined si le
 * disque ne sait pas en faire (le test est alors sauté).
 */
function sparse(file: string, size: number, tail?: Buffer): string | undefined {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '');
  try {
    execFileSync('fsutil', ['sparse', 'setflag', file], { stdio: 'ignore', windowsHide: true });
    execFileSync('fsutil', ['file', 'seteof', file, String(Math.round(size))], { stdio: 'ignore', windowsHide: true });
  } catch {
    return undefined;
  }
  if (tail) {
    const fd = fs.openSync(file, 'r+');
    fs.writeSync(fd, tail, 0, tail.length, size - tail.length);
    fs.closeSync(fd);
  }
  return file;
}

const canSparse = (() => {
  if (process.platform !== 'win32') return false;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-creux-'));
  try {
    return Boolean(sparse(path.join(dir, 'essai.bin'), 3 * GIB)) && fs.statSync(path.join(dir, 'essai.bin')).size === 3 * GIB;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
})();
const bigTest = canSparse ? test : test.skip;

const CHIPS: Record<string, string> = { 't2_l8.rom': 'programme t2 '.repeat(400), 't2_u14.l3': 'son u14 '.repeat(300) };

/** Une vraie ROM en zip, dont les positions sont décalées de `shift` : posée à la fin d'un fichier de `shift` octets de plus. */
function shiftedRomZip(work: string, shift: number): { data: Buffer; original: Buffer } {
  const members = Object.entries(CHIPS).map(([name, content]) => {
    const from = path.join(work, name);
    fs.writeFileSync(from, content);
    return { from, name };
  });
  const original = buildZip(members);
  const data = Buffer.from(original);
  const eocd = data.length - 22;
  const dirStart = data.readUInt32LE(eocd + 16);
  let p = dirStart;
  for (let i = 0; i < data.readUInt16LE(eocd + 10); i++) {
    data.writeUInt32LE(data.readUInt32LE(p + 42) + shift, p + 42);
    p += 46 + data.readUInt16LE(p + 28) + data.readUInt16LE(p + 30) + data.readUInt16LE(p + 32);
  }
  data.writeUInt32LE(dirStart + shift, eocd + 16);
  return { data, original };
}

bigTest('un zip de 2,5 Go se lit par son répertoire central : ROM reconnue, même empreinte que la petite', () => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-gros-zip-'));
  try {
    const size = 2.5 * GIB;
    const probe = shiftedRomZip(work, 0);
    const { data, original } = shiftedRomZip(work, size - probe.data.length);
    const big = sparse(path.join(work, 't2_l8.zip'), size, data)!;
    assert.deepEqual(
      readZipEntries(big)?.map((e) => e.name),
      Object.keys(CHIPS),
    );
    assert.equal(isRomZip(big), true);
    assert.equal(romHash(romFile(big)!), zipContentHash(original), 'même ROM, même empreinte, quelle que soit la taille du fichier');
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
});

bigTest('un fichier de plus de 2 Gio : empreinte par morceaux, lecture entière refusée avec un message clair', () => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-gros-'));
  try {
    const file = sparse(path.join(work, 'gros.bin'), 2 * GIB + 1024 * 1024)!;
    assert.match(fileDigest(file, 'sha1'), /^[0-9a-f]{40}$/);
    assert.throws(() => readWholeFile(file, 64 * 1024 ** 2), (e: unknown) => e instanceof FileTooBigError && e.code === 'EFBIG' && /gros\.bin/.test(e.message));
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
});

bigTest('reprise d’une installation avec des archives de plusieurs Go : le plan se fait, aucune n’est prise pour une ROM', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-reprise-grosse-'));
  try {
    const root = path.join(base, 'Visual Pinball');
    const tables = path.join(root, 'Tables');
    fs.mkdirSync(path.join(root, 'VPinMAME', 'roms'), { recursive: true });
    fs.mkdirSync(tables, { recursive: true });
    fs.writeFileSync(path.join(root, 'VPinballX.exe'), 'MZ');
    for (let i = 0; i < 40; i++) fs.writeFileSync(path.join(tables, `Table ${i} (Maker 19${70 + i}).vpx`), 'vpx'.padEnd(64, ' '));
    // L'archive téléchargée d'une table, gardée à côté d'elle ; une archive égarée dans les ROM ; un PuP-Pack géant.
    for (const [file, size] of [
      [path.join(tables, 'Table 0 (Maker 1970) avec PuP-Pack.zip'), 2.5 * GIB],
      [path.join(root, 'VPinMAME', 'roms', 'sauvegarde.zip'), 2.3 * GIB],
      [path.join(root, 'PinUPSystem', 'PUPVideos', 'Table 1', 'Backglass', 'intro.mp4'), 3 * GIB],
    ] as const) {
      assert.ok(sparse(file, size) && fs.statSync(file).size > 2 * GIB, file);
    }
    const cp = path.join(base, 'CyberPinball');
    const companions = installationCompanions([{ path: root, mode: 'copy' }], () => undefined, [cp]);
    const plan = planImport(companions.sources, { tablesDir: path.join(cp, 'tables'), romLibrary: path.join(cp, 'roms'), companions: companions.reports });
    assert.ok(plan.tables.length > 0);
    assert.deepEqual(plan.roms, [], 'ni l’archive de la table ni celle des ROM ne sont des ROM');
    assert.ok(ROM_ZIP_MAX < 2.3 * GIB);
    // La place du plan se mesure sans rien lire. Même disque : le PuP-Pack de 3 Go est lié (hardlink.ts),
    // il ne prend aucune place ; le plan le dit lié.
    assert.ok(importLinks(plan)!.linked >= 3 * GIB);
    assert.ok(importSpace(plan, { free: () => 1e15 }).bytes < GIB);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

// ---------- Zip64 ----------

/** Petit zip au format Zip64 (tailles et position dans le champ 0x0001), comme en écrivent les outils pour les archives de plus de 4 Go. */
function zip64(name: string, content: Buffer): Buffer {
  const n = Buffer.from(name, 'latin1');
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(45, 4);
  local.writeUInt32LE(0xffffffff, 18);
  local.writeUInt32LE(0xffffffff, 22);
  local.writeUInt16LE(n.length, 26);
  const extra = Buffer.alloc(4 + 24);
  extra.writeUInt16LE(0x0001, 0);
  extra.writeUInt16LE(24, 2);
  extra.writeBigUInt64LE(BigInt(content.length), 4);
  extra.writeBigUInt64LE(BigInt(content.length), 12);
  extra.writeBigUInt64LE(0n, 20);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(45, 4);
  central.writeUInt16LE(45, 6);
  central.writeUInt32LE(0xffffffff, 20);
  central.writeUInt32LE(0xffffffff, 24);
  central.writeUInt16LE(n.length, 28);
  central.writeUInt16LE(extra.length, 30);
  central.writeUInt32LE(0xffffffff, 42);
  const head = Buffer.concat([local, n, content]);
  const dir = Buffer.concat([central, n, extra]);
  const record = Buffer.alloc(56);
  record.writeUInt32LE(0x06064b50, 0);
  record.writeBigUInt64LE(44n, 4);
  record.writeBigUInt64LE(1n, 24);
  record.writeBigUInt64LE(1n, 32);
  record.writeBigUInt64LE(BigInt(dir.length), 40);
  record.writeBigUInt64LE(BigInt(head.length), 48);
  const locator = Buffer.alloc(20);
  locator.writeUInt32LE(0x07064b50, 0);
  locator.writeBigUInt64LE(BigInt(head.length + dir.length), 8);
  locator.writeUInt32LE(1, 16);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0xffff, 8);
  end.writeUInt16LE(0xffff, 10);
  end.writeUInt32LE(0xffffffff, 12);
  end.writeUInt32LE(0xffffffff, 16);
  return Buffer.concat([head, dir, record, locator, end]);
}

test('un zip au format Zip64 se lit : noms, tailles et positions venus du champ Zip64', () => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-zip64-'));
  try {
    const file = path.join(work, 'pack.zip');
    fs.writeFileSync(file, zip64('screens.pup', Buffer.from('ecran')));
    assert.deepEqual(
      readZipEntries(file)?.map((e) => [e.name, e.size, e.compressedSize, e.offset]),
      [['screens.pup', 5, 5, 0]],
    );
    assert.equal(isRomZip(file), false);
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
});

// ---------- Place disque du plan ----------

function planCopying(from: string, to: string, roms: ImportPlan['roms'] = []): ImportPlan {
  const step = { kind: 'pup', from, source: path.basename(from), to, target: 'pupvideos', mode: 'copy', isDir: true, renamed: false, replaces: false } as const;
  return { tables: [{ steps: [step] } as unknown as ImportPlan['tables'][number]], leftovers: [], ignored: [], roms };
}

test('place du plan : ce qui est copié compte sur le disque d’arrivée, un manque se dit avant la copie, en clair', () => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-place-'));
  try {
    const pack = path.join(work, 'source', 'Pack');
    fs.mkdirSync(pack, { recursive: true });
    fs.writeFileSync(path.join(pack, 'a.mp4'), Buffer.alloc(3000));
    fs.writeFileSync(path.join(pack, 'b.mp4'), Buffer.alloc(2000));
    const plan = planCopying(pack, path.join(work, 'tables', 'Table', 'pupvideos', 'Pack'));
    const root = path.parse(work).root.toUpperCase();

    const enough = importSpace(plan, { free: () => IMPORT_SPACE_MARGIN + 10_000 });
    assert.deepEqual(enough.disks, [{ root, need: 5000, free: IMPORT_SPACE_MARGIN + 10_000, short: false }]);
    assert.deepEqual(importSpaceProblems(enough), []);

    // La marge pour Windows compte : 5000 octets à copier, 1 Go + 4000 libres, c'est trop juste.
    const tight = importSpace(plan, { free: () => IMPORT_SPACE_MARGIN + 4000 });
    assert.equal(tight.disks[0]!.short, true);
    const [problem] = importSpaceProblems(tight);
    assert.match(problem!, new RegExp(`${root.replace(/\\/g, '\\\\')}.*il faut .*libres`));

    // Un déplacement sur le même disque n'est qu'un renommage.
    const moved = planCopying(pack, path.join(work, 'tables', 'Table', 'pupvideos', 'Pack'));
    (moved.tables[0]!.steps[0] as { mode: string }).mode = 'move';
    assert.deepEqual(importSpace(moved, { free: () => 0 }).disks, []);

    // Les tailles déjà mesurées servent d'un plan à l'autre (le plan se refait à chaque choix).
    const sizes = new Map<string, number>();
    importSpace(plan, { sizes, free: () => 1e12 });
    fs.writeFileSync(path.join(pack, 'c.mp4'), Buffer.alloc(1000));
    assert.equal(importSpace(plan, { sizes, free: () => 1e12 }).bytes, 5000);
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
});
