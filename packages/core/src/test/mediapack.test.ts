// Paquet de médias (docs/recherche/partage-medias.md, § 5 et § 10) : ce qu'une borne exporte,
// une autre le relit et l'extrait sans rien croire sur parole. Invariant : rien d'autre qu'un
// média vérifié (type, format, octets, taille, SHA-256) ne sort jamais d'un paquet, et rien
// n'est écrit hors du dossier d'attente.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import * as zlib from 'node:zlib';
import {
  buildZip,
  readZipEntries,
  createPlayerKey,
  extractMediaPack,
  isSafePackPath,
  PACK_MANIFEST,
  playerFingerprint,
  readMediaPack,
  writeMediaPack,
  type MediaPack,
  type PackRead,
} from '../index';

const PNG = Buffer.concat([Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'), Buffer.alloc(300, 7)]);
const MP4 = Buffer.concat([Buffer.from('0000001866747970', 'hex'), Buffer.from('isom'), Buffer.alloc(400, 3)]);
const MP3 = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(250, 9)]);
const EXE = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(300, 1)]);
const T2 = { vpsId: 'Mdu-NoeR', roms: ['t2_l8'], title: 'Terminator 2 - Judgment Day', manufacturer: 'Williams', year: 1991 };
const MM = { vpsId: 'MMx', title: 'Medieval Madness', manufacturer: 'Williams', year: 1997 };

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-paquet-'));
}

function write(file: string, content: Buffer | string): string {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
}

function ok(read: PackRead): MediaPack {
  assert.ok(read.ok, read.ok ? '' : read.reason);
  return read.pack;
}

/** Paquet fait à la main, comme pourrait le faire n'importe qui : manifeste et fichiers choisis. */
function craft(to: string, manifest: object | string, files: Record<string, Buffer>, signature?: string): string {
  const work = tmpDir();
  const text = typeof manifest === 'string' ? manifest : JSON.stringify(manifest);
  const all: Record<string, Buffer> = { ...files, [PACK_MANIFEST]: Buffer.from(JSON.stringify({ manifest: text, ...(signature ? { signature } : {}) })) };
  const members = Object.entries(all).map(([name, content], i) => ({ from: write(path.join(work, String(i)), content), name }));
  write(to, buildZip(members));
  fs.rmSync(work, { recursive: true });
  return to;
}

/** Contenu d'un fichier d'un zip. */
function entryOf(file: string, name: string): Buffer {
  const e = readZipEntries(file)!.find((x) => x.name === name)!;
  const data = fs.readFileSync(file);
  const start = e.offset + 30 + data.readUInt16LE(e.offset + 26) + data.readUInt16LE(e.offset + 28);
  const body = data.subarray(start, start + e.compressedSize);
  return e.method === 8 ? zlib.inflateRawSync(body) : body;
}

function media(p: string, type: string, content: Buffer, extra: object = {}) {
  return { path: p, type, sha256: sha(content), bytes: content.length, ...extra };
}

test('aller-retour : exporté, signé, relu, extrait octet pour octet', async () => {
  const dir = tmpDir();
  const wheel = write(path.join(dir, 'borne', '(Wheel) T2.png'), PNG);
  const bg = write(path.join(dir, 'borne', '(Backglass) T2.mp4'), MP4);
  const music = write(path.join(dir, 'borne', '(Audio) MM.mp3'), MP3);
  const key = createPlayerKey();
  const to = path.join(dir, 'partage', 'medias.zip');
  const result = await writeMediaPack(
    to,
    [
      { table: T2, medias: [{ file: wheel, type: 'Wheel', origin: { origin: 'VPinMediaDB', url: 'https://example.org/wheel.png' } }, { file: bg, type: 'Backglass', credit: 'Fait par moi' }] },
      { table: MM, medias: [{ file: music, type: 'Audio', origin: { origin: 'Dossier local', url: 'file:///D:/Medias/x' } }] },
    ],
    { author: { name: 'Alexis', key }, note: 'Ma borne', app: 'Cyber Pinball 0.1.3', now: new Date('2026-10-26T15:00:00Z') },
  );
  assert.deepEqual(result.refused, []);
  assert.equal(result.written, 3);
  assert.equal(fs.statSync(to).size, result.bytes);
  // Rien de la borne dans le manifeste : ni chemin local, ni adresse « file: ».
  const text = JSON.stringify(result.manifest);
  assert.ok(!text.includes(dir.replace(/\\/g, '\\\\')) && !text.includes('file:'), text);

  const pack = ok(readMediaPack(to));
  assert.equal(pack.signature, 'valid');
  assert.equal(playerFingerprint(pack.manifest.author!.publicKey), playerFingerprint(key.publicKey));
  assert.equal(pack.manifest.author!.name, 'Alexis');
  assert.deepEqual(pack.extras, []);
  assert.deepEqual(pack.items.map((i) => [i.status, i.media.path]), [
    ['ok', 'Terminator 2 - Judgment Day (Williams 1991)/(Wheel) Terminator 2 - Judgment Day (Williams 1991).png'],
    ['ok', 'Terminator 2 - Judgment Day (Williams 1991)/(Backglass) Terminator 2 - Judgment Day (Williams 1991).mp4'],
    ['ok', 'Medieval Madness (Williams 1997)/(Audio) Medieval Madness (Williams 1997).mp3'],
  ]);
  assert.deepEqual(pack.manifest.tables[0]!.table, T2);
  assert.deepEqual(pack.items[0]!.media.origin, { origin: 'VPinMediaDB', url: 'https://example.org/wheel.png' });
  assert.equal(pack.items[1]!.media.credit, 'Fait par moi');

  const waiting = path.join(dir, 'attente');
  const extracted = await extractMediaPack(pack, waiting);
  assert.deepEqual(extracted.map((e) => e.reason), [undefined, undefined, undefined]);
  for (const [i, content] of [PNG, MP4, MP3].entries()) {
    assert.equal(path.basename(extracted[i]!.file!), `${sha(content)}.${['png', 'mp4', 'mp3'][i]}`);
    assert.deepEqual(fs.readFileSync(extracted[i]!.file!), content);
  }
  // Un zip ordinaire : la lecture de romzip le comprend aussi.
  assert.deepEqual(fs.readdirSync(waiting).sort(), [`${sha(MP3)}.mp3`, `${sha(MP4)}.mp4`, `${sha(PNG)}.png`].sort());
  fs.rmSync(dir, { recursive: true });
});

test('export : seuls des médias vérifiés entrent dans un paquet', async () => {
  const dir = tmpDir();
  const disguised = write(path.join(dir, '(Backglass) T2.png'), EXE);
  const table = write(path.join(dir, 'T2.vpx'), PNG);
  const other = write(path.join(dir, '(Other) T2.png'), PNG);
  const wheel = write(path.join(dir, '(Wheel) T2.png'), PNG);
  const copy = write(path.join(dir, '(Wheel) copie.png'), PNG);
  const to = path.join(dir, 'paquet.zip');
  const result = await writeMediaPack(to, [
    {
      table: T2,
      medias: [
        { file: disguised, type: 'Backglass' },
        { file: table, type: 'Playfield' },
        { file: other, type: 'Other' },
        { file: path.join(dir, 'absent.png'), type: 'Wheel' },
        { file: wheel, type: 'Wheel' },
        { file: copy, type: 'Wheel' },
      ],
    },
  ]);
  assert.equal(result.written, 1);
  assert.deepEqual(result.refused.map((r) => path.basename(r.file)), ['(Backglass) T2.png', 'T2.vpx', '(Other) T2.png', 'absent.png', '(Wheel) copie.png']);
  const pack = ok(readMediaPack(to));
  assert.equal(pack.signature, 'none');
  assert.deepEqual(pack.items.map((i) => i.status), ['ok']);

  // Rien d'acceptable : aucun fichier n'est créé.
  const empty = path.join(dir, 'vide.zip');
  assert.equal((await writeMediaPack(empty, [{ table: T2, medias: [{ file: disguised, type: 'Backglass' }] }])).written, 0);
  assert.equal(fs.existsSync(empty), false);
  assert.deepEqual(fs.readdirSync(dir).filter((f) => f.includes('.tmp-')), []);
  fs.rmSync(dir, { recursive: true });
});

test('signature : un paquet modifié après sa signature est refusé en entier', async () => {
  const dir = tmpDir();
  const wheel = write(path.join(dir, '(Wheel) T2.png'), PNG);
  const signed = path.join(dir, 'signe.zip');
  await writeMediaPack(signed, [{ table: T2, medias: [{ file: wheel, type: 'Wheel' }] }], { author: { name: 'A', key: createPlayerKey() } });
  const pack = ok(readMediaPack(signed));
  const envelope = JSON.parse(entryOf(signed, PACK_MANIFEST).toString('utf8')) as { manifest: string; signature: string };
  assert.equal(typeof envelope.signature, 'string');
  const altered = (envelope.manifest as string).replace('"Terminator 2 - Judgment Day"', '"Autre jeu"');
  const name = pack.items[0]!.media.path;
  const forged = craft(path.join(dir, 'modifie.zip'), altered, { [name]: PNG }, envelope.signature);
  const read = readMediaPack(forged);
  assert.equal(read.ok, false);
  assert.match(read.ok ? '' : read.reason, /signature/);
  // Une clé annoncée sans signature, ou une signature sans clé : refusées aussi.
  const noSig = craft(path.join(dir, 'sans.zip'), envelope.manifest, { [name]: PNG });
  assert.equal(readMediaPack(noSig).ok, false);
  fs.rmSync(dir, { recursive: true });
});

test('lecture : noms piégés, types interdits, fichiers en trop ou absents sont refusés', () => {
  const dir = tmpDir();
  const good = 'T2/(Wheel) T2.png';
  const file = craft(
    path.join(dir, 'piege.zip'),
    {
      format: 'cyberpinball-medias',
      version: 1,
      createdAt: '2026-10-26T15:00:00Z',
      tables: [
        {
          table: T2,
          medias: [
            media(good, 'Wheel', PNG),
            media('../evil.png', 'Wheel', PNG),
            media('C:/Windows/evil.png', 'Wheel', PNG),
            media('T2\\evil.png', 'Wheel', PNG),
            media('a/b/c.png', 'Wheel', PNG),
            media('T2/CON.png', 'Wheel', PNG),
            media('T2/(Other) T2.png', 'Other', PNG),
            media('T2/script.vbs', 'Wheel', PNG),
            media('T2/(Wheel) faux.png', 'Wheel', PNG, { bytes: PNG.length + 1 }),
            media('T2/(Wheel) sans.png', 'Wheel', PNG, { sha256: 'abc' }),
            media('T2/(Wheel) absent.png', 'Wheel', PNG),
            media(good, 'Wheel', PNG),
          ],
        },
        { table: { title: '' }, medias: [media('X/(Wheel) X.png', 'Wheel', PNG)] },
      ],
    },
    { [good]: PNG, '../evil.png': PNG, 'T2/(Wheel) faux.png': PNG, 'X/(Wheel) X.png': PNG, 'T2/virus.exe': EXE, 'autorun.inf': Buffer.from('[autorun]') },
  );
  const pack = ok(readMediaPack(file));
  assert.equal(pack.signature, 'none');
  assert.deepEqual(
    pack.items.filter((i) => i.status === 'ok').map((i) => i.media.path),
    [good],
  );
  assert.equal(pack.items.filter((i) => i.status === 'refused').length, 12);
  assert.ok(pack.items.every((i) => i.status === 'ok' || i.reason));
  assert.deepEqual(pack.extras.map((e) => e.name).sort(), ['../evil.png', 'T2/virus.exe', 'autorun.inf'].sort());
  for (const name of ['../evil.png', '/evil.png', 'C:/evil.png', 'a\\b.png', 'a/b/c.png', 'T2/nul', 'T2/x.png ', '', 'T2/./x.png']) assert.equal(isSafePackPath(name), false, name);
  assert.equal(isSafePackPath('Terminator 2 (Williams 1991)/(Wheel) Terminator 2 (Williams 1991).png'), true);
  fs.rmSync(dir, { recursive: true });
});

test('extraction : le contenu est vérifié, et rien ne reste de ce qui est refusé', async () => {
  const dir = tmpDir();
  const exe = 'T2/(Backglass) T2.png';
  const lie = 'T2/(Wheel) T2.png';
  const fine = 'T2/(Backglass) T2.mp4';
  const file = craft(
    path.join(dir, 'contenu.zip'),
    {
      format: 'cyberpinball-medias',
      version: 1,
      createdAt: '2026-10-26T15:00:00Z',
      tables: [{ table: T2, medias: [media(exe, 'Backglass', EXE), { ...media(lie, 'Wheel', PNG), sha256: sha(MP4) }, media(fine, 'Backglass', MP4)] }],
    },
    { [exe]: EXE, [lie]: PNG, [fine]: MP4 },
  );
  const pack = ok(readMediaPack(file));
  assert.deepEqual(pack.items.map((i) => i.status), ['ok', 'ok', 'ok']);
  const waiting = path.join(dir, 'attente');
  const extracted = await extractMediaPack(pack, waiting);
  assert.match(extracted[0]!.reason ?? '', /contenu/);
  assert.match(extracted[1]!.reason ?? '', /empreinte/);
  assert.equal(extracted[2]!.reason, undefined);
  assert.deepEqual(fs.readdirSync(waiting), [`${sha(MP4)}.mp4`]);
  fs.rmSync(dir, { recursive: true });
});

test('bombe zip : la décompression s’arrête au premier octet de trop', async () => {
  const dir = tmpDir();
  const name = 'T2/(Wheel) T2.png';
  const huge = Buffer.concat([PNG, Buffer.alloc(4 * 2 ** 20)]);
  const small = PNG.length;
  const file = craft(
    path.join(dir, 'bombe.zip'),
    { format: 'cyberpinball-medias', version: 1, createdAt: '', tables: [{ table: T2, medias: [{ path: name, type: 'Wheel', sha256: sha(PNG), bytes: small }] }] },
    { [name]: huge },
  );
  // Le zip annonce la petite taille : le répertoire central et l'en-tête local sont réécrits.
  const zip = fs.readFileSync(file);
  for (let i = 0; i + 4 <= zip.length; i++) {
    const sig = zip.readUInt32LE(i);
    if (sig === 0x02014b50 && zip.subarray(i + 46, i + 46 + zip.readUInt16LE(i + 28)).toString() === name) zip.writeUInt32LE(small, i + 24);
    if (sig === 0x04034b50 && zip.subarray(i + 30, i + 30 + zip.readUInt16LE(i + 26)).toString() === name) zip.writeUInt32LE(small, i + 22);
  }
  fs.writeFileSync(file, zip);
  const pack = ok(readMediaPack(file));
  assert.equal(pack.items[0]!.status, 'ok');
  assert.equal(pack.items[0]!.entry!.method, 8);
  const waiting = path.join(dir, 'attente');
  const [result] = await extractMediaPack(pack, waiting);
  assert.match(result!.reason ?? '', /octets/);
  assert.deepEqual(fs.readdirSync(waiting), []);
  fs.rmSync(dir, { recursive: true });
});

test('ce qui n’est pas un paquet est dit tel quel', () => {
  const dir = tmpDir();
  const notZip = write(path.join(dir, 'a.zip'), 'bonjour');
  const plain = path.join(dir, 'b.zip');
  write(plain, buildZip([{ from: write(path.join(dir, 'x.png'), PNG), name: 'x.png' }]));
  const newer = craft(path.join(dir, 'c.zip'), { format: 'cyberpinball-medias', version: 2, tables: [] }, {});
  const garbage = craft(path.join(dir, 'd.zip'), '{pas du json', {});
  for (const [file, re] of [[notZip, /zip/], [plain, /paquet/], [newer, /récente/], [garbage, /illisible/], [path.join(dir, 'absent.zip'), /illisible/]] as const) {
    const read = readMediaPack(file);
    assert.equal(read.ok, false, file);
    assert.match(read.ok ? '' : read.reason, re);
  }
  fs.rmSync(dir, { recursive: true });
});
