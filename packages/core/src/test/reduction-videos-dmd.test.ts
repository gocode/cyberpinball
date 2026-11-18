// Réduction des vidéos du DMD avant la partie (18/11/2026). Le plugin FlexDMD de VPX 10.8.1 décode chaque vidéo en
// entier à chaque scène UltraDMD ; Cyber Pinball ramène les trop grandes à 128 × 32 (VP8 dans un WebM, sous le même nom),
// l'original à sa corbeille. Invariants : la piste H.264 d'un MP4 est lue juste (positions, instants, images clés,
// configuration du décodeur) ; la réduction remplace la vidéo à sa place, met l'original à la corbeille, ne se refait
// pas, laisse les vidéos que Chromium ne lit pas, et garde l'original quand la conversion échoue.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { mp4VideoTrack } from '../mp4track';
import { webmFile } from '../webmfile';

const repo = path.join(__dirname, '..', '..', '..', '..');

function box(type: string, ...body: Buffer[]): Buffer {
  const b = Buffer.concat(body);
  const head = Buffer.alloc(8);
  head.writeUInt32BE(8 + b.length);
  head.write(type, 4, 'latin1');
  return Buffer.concat([head, b]);
}
const u32 = (...values: number[]) => Buffer.concat(values.map((v) => { const b = Buffer.alloc(4); b.writeUInt32BE(v >>> 0); return b; }));
const full = (type: string, ...body: Buffer[]) => box(type, Buffer.alloc(4), ...body);

/** MP4 H.264 de 4 images (tailles 10, 20, 30, 40), deux blocs de deux, image clé la première et la troisième. */
function tinyMp4(width: number, height: number): { file: Buffer; mdatAt: number } {
  const avcC = box('avcC', Buffer.from([1, 0x64, 0x00, 0x1f, 0xff, 0xe1]));
  const visual = Buffer.alloc(78);
  visual.writeUInt16BE(1, 6);
  visual.writeUInt16BE(width, 24);
  visual.writeUInt16BE(height, 26);
  const stsd = full('stsd', u32(1), box('avc1', visual, avcC));
  const stts = full('stts', u32(1, 4, 1000));
  const stss = full('stss', u32(2, 1, 3));
  const stsz = full('stsz', u32(0, 4, 10, 20, 30, 40));
  const stsc = full('stsc', u32(1, 1, 2, 1));
  const mdhd = full('mdhd', u32(0, 0, 30000, 4000), Buffer.alloc(4));
  const hdlr = full('hdlr', u32(0), Buffer.from('vide'), Buffer.alloc(13));
  const tkhd = Buffer.alloc(84);
  tkhd.writeInt32BE(0x10000, 40);
  tkhd.writeInt32BE(0x10000, 56);
  tkhd.writeInt32BE(0x40000000, 72);
  tkhd.writeUInt32BE(width * 65536, 76);
  tkhd.writeUInt32BE(height * 65536, 80);
  const build = (chunk1: number, chunk2: number) =>
    box('moov', box('trak', box('tkhd', tkhd), box('mdia', mdhd, hdlr, box('minf', box('stbl', stsd, stts, stss, stsz, stsc, full('stco', u32(2, chunk1, chunk2)))))));
  const ftyp = box('ftyp', Buffer.from('isom\0\0\0\0isomavc1', 'latin1'));
  const moovSize = build(0, 0).length;
  const mdatAt = ftyp.length + moovSize + 8;
  const data = Buffer.alloc(100, 7);
  return { file: Buffer.concat([ftyp, build(mdatAt, mdatAt + 30), box('mdat', data)]), mdatAt };
}

test('piste H.264 : codec, définition, positions par bloc, instants et images clés', () => {
  const { file, mdatAt } = tinyMp4(1920, 480);
  const track = mp4VideoTrack(file)!;
  assert.equal(track.codec, 'avc1.64001f');
  assert.deepEqual([track.width, track.height], [1920, 480]);
  assert.deepEqual([...track.description.subarray(0, 4)], [1, 0x64, 0x00, 0x1f]);
  assert.deepEqual(track.samples.map((s) => s.offset), [mdatAt, mdatAt + 10, mdatAt + 30, mdatAt + 60]);
  assert.deepEqual(track.samples.map((s) => s.size), [10, 20, 30, 40]);
  assert.deepEqual(track.samples.map((s) => s.key), [true, false, true, false]);
  assert.deepEqual(track.samples.map((s) => s.dtsUs), [0, 33333, 66667, 100000]);
  assert.equal(track.durationUs, 133333);
  // Autre chose qu'un MP4 H.264 : rien.
  assert.equal(mp4VideoTrack(Buffer.from('pas une vidéo')), undefined);
});

/** Un dossier de DMD : une grande vidéo MP4, une WMV lourde, une vidéo déjà à la taille du DMD. */
function dmdFolder(): { table: string; dir: string; trash: string } {
  const table = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-reduction-'));
  const dir = path.join(table, 'Hellboy.UltraDMD');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'intro.mp4'), tinyMp4(1920, 480).file);
  fs.writeFileSync(path.join(dir, 'ancienne.wmv'), Buffer.alloc(4 * 1024 * 1024));
  fs.writeFileSync(path.join(dir, 'petite.mp4'), tinyMp4(128, 32).file);
  return { table, dir, trash: `${table}-corbeille` };
}

/** Convertisseur factice : écrit un WebM à la taille demandée, comme shrinkVideo (media-convert.ts). */
const fakeConverter = (calls: string[], fail = false) => ({
  shrinkVideo: async (file: string, out: string, width: number, height: number) => {
    calls.push(path.basename(file));
    if (fail) throw new Error('décodeur indisponible');
    fs.writeFileSync(out, webmFile({ width, height, frames: [{ data: new Uint8Array([1]), key: true, timestampUs: 0 }], durationMs: 1000 }));
    return { frames: 1, bytes: 10 };
  },
});

test('réduction avant la partie : remplacée à sa place, original à la corbeille, jamais refaite, wmv laissée', async () => {
  const { shrinkDmdVideos } = require(path.join(repo, 'app', 'dist', 'dmd-video-shrink.js'));
  const { table, dir, trash } = dmdFolder();
  const calls: string[] = [];
  const lines: string[] = [];
  const done = await shrinkDmdVideos({ tableFolder: table, dmdFolder: 'Hellboy.UltraDMD', converter: fakeConverter(calls), trashDir: trash, log: (l: string) => lines.push(l) });
  assert.deepEqual(done, ['intro.mp4']);
  assert.deepEqual(calls, ['intro.mp4'], 'ni la wmv (Chromium ne la lit pas), ni celle déjà à la taille du DMD');
  assert.equal(fs.readFileSync(path.join(dir, 'intro.mp4')).readUInt32BE(0), 0x1a45dfa3, 'un WebM, sous le même nom');
  assert.ok(fs.existsSync(path.join(dir, 'ancienne.wmv')));
  assert.ok(fs.readdirSync(trash, { recursive: true }).some((f) => String(f).endsWith('intro.mp4')), 'original à la corbeille');
  assert.ok(!fs.readdirSync(dir).some((f) => f.includes('cyberpinball-reduite')), 'aucun fichier de travail laissé');
  assert.match(lines[0]!, /intro\.mp4 ramenée de 1920 × 480 à 128 × 32/);
  // Partie suivante : rien à refaire.
  assert.deepEqual(await shrinkDmdVideos({ tableFolder: table, dmdFolder: 'Hellboy.UltraDMD', converter: fakeConverter(calls), trashDir: trash, log: () => {} }), []);
  assert.equal(calls.length, 1);
  fs.rmSync(table, { recursive: true, force: true });
  fs.rmSync(trash, { recursive: true, force: true });
});

test('réduction qui échoue : l’original reste en place, rien à la corbeille, le journal le dit', async () => {
  const { shrinkDmdVideos } = require(path.join(repo, 'app', 'dist', 'dmd-video-shrink.js'));
  const { table, dir, trash } = dmdFolder();
  const before = fs.readFileSync(path.join(dir, 'intro.mp4'));
  const lines: string[] = [];
  assert.deepEqual(await shrinkDmdVideos({ tableFolder: table, dmdFolder: 'Hellboy.UltraDMD', converter: fakeConverter([], true), trashDir: trash, log: (l: string) => lines.push(l) }), []);
  assert.ok(fs.readFileSync(path.join(dir, 'intro.mp4')).equals(before));
  assert.ok(!fs.existsSync(trash));
  assert.match(lines[0]!, /intro\.mp4 pas réduite \(décodeur indisponible\) ; gardée telle quelle/);
  fs.rmSync(table, { recursive: true, force: true });
});

test('lancement : la réduction passe avant chaque partie, après la remise en ordre du PuP-Pack', () => {
  const front = fs.readFileSync(path.join(repo, 'app', 'src', 'frontend.ts'), 'utf8');
  assert.match(front, /if \(!otherVpx\) preparePupPack\(table\);\r?\n[^\n]*\r?\n\s*if \(!otherVpx\) await shrinkTableDmdVideos\(table\);/);
});
