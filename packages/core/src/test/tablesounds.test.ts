import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { extractMp4Sound, mp4Sound } from '../mp4audio';
import { scanTables } from '../tables';
import { tableSounds } from '../tablesounds';

// --- MP4 factices : la vraie structure ISO BMFF, des échantillons reconnaissables. ---

function box(type: string, ...parts: Buffer[]): Buffer {
  const body = Buffer.concat(parts);
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length + 8, 0);
  head.write(type, 4, 'latin1');
  return Buffer.concat([head, body]);
}

const u32 = (...values: number[]) => {
  const b = Buffer.alloc(values.length * 4);
  values.forEach((v, i) => b.writeUInt32BE(v, i * 4));
  return b;
};

interface FakeTrack {
  handler: 'vide' | 'soun';
  codec: string;
  timescale: number;
  duration: number;
  /** Échantillons de chaque morceau. */
  chunks: Buffer[][];
  wide?: boolean;
}

/** Une piste : stsc ne note que les changements de nombre d'échantillons par morceau. */
function trak(t: FakeTrack, offsets: number[]): Buffer {
  const runs: number[] = [];
  t.chunks.forEach((c, i) => {
    if (i === 0 || c.length !== t.chunks[i - 1]!.length) runs.push(i + 1, c.length, 1);
  });
  const sizes = t.chunks.flat().map((s) => s.length);
  const table = t.wide
    ? box('co64', u32(0, offsets.length), ...offsets.map((o) => { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(o)); return b; }))
    : box('stco', u32(0, offsets.length, ...offsets));
  const stsd = box('stsd', u32(0, 1), box(t.codec, Buffer.alloc(28)));
  return box(
    'trak',
    box('tkhd', Buffer.alloc(84)),
    box(
      'mdia',
      box('mdhd', u32(0, 0, 0, t.timescale, t.duration, 0)),
      box('hdlr', u32(0, 0), Buffer.from(t.handler, 'latin1'), Buffer.alloc(13)),
      box('minf', box('stbl', stsd, box('stts', u32(0, 0)), box('stsc', u32(0, runs.length / 3, ...runs)), box('stsz', u32(0, 0, sizes.length, ...sizes)), table)),
    ),
  );
}

/** Fichier MP4 : moov devant (« faststart »), morceaux des pistes entrelacés dans mdat. */
function fakeMp4(tracks: FakeTrack[], moovFirst = true): Buffer {
  const ftyp = box('ftyp', Buffer.from('isom\0\0\0\0isommp42', 'latin1'));
  const order: { track: number; chunk: number }[] = [];
  const most = Math.max(...tracks.map((t) => t.chunks.length));
  for (let c = 0; c < most; c++) tracks.forEach((t, i) => c < t.chunks.length && order.push({ track: i, chunk: c }));
  const build = (moovSize: number) => {
    const start = ftyp.length + (moovFirst ? moovSize : 0) + 8;
    const offsets = tracks.map(() => [] as number[]);
    let at = start;
    const data: Buffer[] = [];
    for (const { track, chunk } of order) {
      offsets[track]!.push(at);
      const bytes = Buffer.concat(tracks[track]!.chunks[chunk]!);
      data.push(bytes);
      at += bytes.length;
    }
    const moov = box('moov', box('mvhd', Buffer.alloc(100)), ...tracks.map((t, i) => trak(t, offsets[i]!)));
    return { moov, mdat: box('mdat', ...data) };
  };
  const first = build(0);
  if (moovFirst) {
    const { moov, mdat } = build(first.moov.length);
    return Buffer.concat([ftyp, moov, mdat]);
  }
  // moov en fin de fichier : les positions ne dépendent pas de sa taille.
  return Buffer.concat([ftyp, first.mdat, first.moov]);
}

const samples = (tag: string, n: number, size = 7) => Array.from({ length: n }, (_, i) => Buffer.from(`${tag}${i}`.padEnd(size, '.'), 'latin1'));

/** Échantillons d'une piste son, relus d'après les tables du fichier (pour vérifier l'extraction). */
function readSoundSamples(file: string): { tracks: string[]; data: string } {
  const buf = fs.readFileSync(file);
  const find = (from: number, to: number, type: string): [number, number] | undefined => {
    for (let p = from; p + 8 <= to; ) {
      const size = buf.readUInt32BE(p);
      if (buf.toString('latin1', p + 4, p + 8) === type) return [p + 8, p + size];
      p += size;
    }
    return undefined;
  };
  const moov = find(0, buf.length, 'moov')!;
  const tracks: string[] = [];
  let data = '';
  for (let p = moov[0]; p + 8 <= moov[1]; ) {
    const size = buf.readUInt32BE(p);
    if (buf.toString('latin1', p + 4, p + 8) === 'trak') {
      const mdia = find(p + 8, p + size, 'mdia')!;
      const hdlr = find(mdia[0], mdia[1], 'hdlr')!;
      tracks.push(buf.toString('latin1', hdlr[0] + 8, hdlr[0] + 12));
      const minf = find(mdia[0], mdia[1], 'minf')!;
      const stbl = find(minf[0], minf[1], 'stbl')!;
      const stsc = find(stbl[0], stbl[1], 'stsc')!;
      const stsz = find(stbl[0], stbl[1], 'stsz')!;
      const stco = find(stbl[0], stbl[1], 'stco');
      const co64 = find(stbl[0], stbl[1], 'co64');
      const count = buf.readUInt32BE((stco ?? co64)![0] + 4);
      const runs = Array.from({ length: buf.readUInt32BE(stsc[0] + 4) }, (_, i) => ({ first: buf.readUInt32BE(stsc[0] + 8 + i * 12), per: buf.readUInt32BE(stsc[0] + 12 + i * 12) }));
      let sample = 0;
      for (let c = 1; c <= count; c++) {
        const per = [...runs].reverse().find((r) => r.first <= c)!.per;
        let at = stco ? buf.readUInt32BE(stco[0] + 8 + (c - 1) * 4) : Number(buf.readBigUInt64BE(co64![0] + 8 + (c - 1) * 8));
        for (let k = 0; k < per; k++) {
          const size = buf.readUInt32BE(stsz[0] + 12 + sample++ * 4);
          data += buf.toString('latin1', at, at + size);
          at += size;
        }
      }
    }
    p += size;
  }
  return { tracks, data };
}

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cp-sons-'));
}

test('mp4Sound : piste son d’une vidéo, sa durée et son codec ; rien sans piste son', () => {
  const dir = tmpDir();
  const video: FakeTrack = { handler: 'vide', codec: 'avc1', timescale: 1000, duration: 5000, chunks: [samples('V', 2)] };
  const sound: FakeTrack = { handler: 'soun', codec: 'mp4a', timescale: 44100, duration: 44100 * 12, chunks: [samples('A', 1)] };
  fs.writeFileSync(path.join(dir, 'avec.mp4'), fakeMp4([video, sound]));
  fs.writeFileSync(path.join(dir, 'sans.mp4'), fakeMp4([video]));
  fs.writeFileSync(path.join(dir, 'ac3.mp4'), fakeMp4([video, { ...sound, codec: 'ac-3' }]));
  fs.writeFileSync(path.join(dir, 'faux.mp4'), 'pas une vidéo');
  assert.deepEqual(mp4Sound(path.join(dir, 'avec.mp4')), { codec: 'mp4a', seconds: 12, playable: true });
  assert.equal(mp4Sound(path.join(dir, 'sans.mp4')), undefined, 'vidéo muette : pas de piste son');
  assert.equal(mp4Sound(path.join(dir, 'ac3.mp4'))?.playable, false, 'AC-3 : Chromium ne le lit pas');
  assert.equal(mp4Sound(path.join(dir, 'faux.mp4')), undefined);
  assert.equal(mp4Sound(path.join(dir, 'absent.mp4')), undefined);
});

test('extractMp4Sound : la piste son seule, ses échantillons intacts et dans l’ordre, quelle que soit la disposition', () => {
  const dir = tmpDir();
  // Morceaux de 3, 3, 2 puis 1 échantillons : stsc à plusieurs entrées ; tailles inégales.
  const audio = [samples('a', 3, 5), samples('b', 3, 9), samples('c', 2, 6), samples('d', 1, 11)];
  const expected = audio.flat().map((b) => b.toString('latin1')).join('');
  const cases: { name: string; tracks: FakeTrack[]; moovFirst?: boolean }[] = [
    { name: 'moov devant', tracks: [{ handler: 'vide', codec: 'avc1', timescale: 1000, duration: 4000, chunks: [samples('V', 2, 40), samples('W', 1, 40), samples('X', 2, 40)] }, { handler: 'soun', codec: 'mp4a', timescale: 48000, duration: 48000 * 4, chunks: audio }] },
    { name: 'moov derrière', moovFirst: false, tracks: [{ handler: 'soun', codec: '.mp3', timescale: 1000, duration: 4000, chunks: audio }, { handler: 'vide', codec: 'avc1', timescale: 1000, duration: 4000, chunks: [samples('V', 4, 30)] }] },
    { name: 'co64', tracks: [{ handler: 'vide', codec: 'avc1', timescale: 1000, duration: 1000, chunks: [samples('V', 1, 50)] }, { handler: 'soun', codec: 'Opus', timescale: 48000, duration: 48000, chunks: audio, wide: true }] },
  ];
  for (const c of cases) {
    const src = path.join(dir, `${c.name}.mp4`);
    fs.writeFileSync(src, fakeMp4(c.tracks, c.moovFirst !== false));
    const dest = path.join(dir, 'sortie', `${c.name}.m4a`);
    const r = extractMp4Sound(src, dest);
    assert.ok(r.ok, c.name);
    const got = readSoundSamples(dest);
    assert.deepEqual(got.tracks, ['soun'], `${c.name} : plus de piste vidéo`);
    assert.equal(got.data, expected, `${c.name} : échantillons recopiés`);
    assert.equal(fs.readFileSync(dest).toString('latin1', 8, 12), 'M4A ', `${c.name} : fichier son MP4`);
    assert.equal(r.bytes, fs.statSync(dest).size);
    assert.ok(!fs.existsSync(`${dest}.partiel`));
  }
  // Refus, sans fichier écrit.
  const mute = path.join(dir, 'muette.mp4');
  fs.writeFileSync(mute, fakeMp4([{ handler: 'vide', codec: 'avc1', timescale: 1000, duration: 1000, chunks: [samples('V', 1)] }]));
  assert.deepEqual(extractMp4Sound(mute, path.join(dir, 'x.m4a')), { ok: false, reason: 'no-sound' });
  const ac3 = path.join(dir, 'ac3.mp4');
  fs.writeFileSync(ac3, fakeMp4([{ handler: 'soun', codec: 'ac-3', timescale: 1000, duration: 1000, chunks: [samples('A', 1)] }]));
  assert.deepEqual(extractMp4Sound(ac3, path.join(dir, 'x.m4a')), { ok: false, reason: 'unplayable' });
  fs.writeFileSync(path.join(dir, 'faux.mp4'), 'texte');
  assert.deepEqual(extractMp4Sound(path.join(dir, 'faux.mp4'), path.join(dir, 'x.m4a')), { ok: false, reason: 'not-mp4' });
  assert.ok(!fs.existsSync(path.join(dir, 'x.m4a')));
});

test('tableSounds : sons et vidéos sonores du dossier de la table, par dossier, musique d’abord ; sans copies de sauvegarde ni fichiers vides', () => {
  const root = tmpDir();
  const folder = path.join(root, 'Gardiens (Stern 2017)');
  const pack = path.join(folder, 'pupvideos', 'gotg');
  for (const d of ['Topper', 'Topper.orig', 'DMDSplash', 'PupVideos', 'Blank', '_backup']) fs.mkdirSync(path.join(pack, d), { recursive: true });
  fs.mkdirSync(path.join(folder, 'medias'), { recursive: true });
  fs.writeFileSync(path.join(folder, 'Gardiens (Stern 2017).vpx'), '');
  const write = (rel: string, data: Buffer | string) => fs.writeFileSync(path.join(folder, rel), data);
  const sound: FakeTrack = { handler: 'soun', codec: 'mp4a', timescale: 1000, duration: 4500, chunks: [samples('A', 1)] };
  const video: FakeTrack = { handler: 'vide', codec: 'avc1', timescale: 1000, duration: 4500, chunks: [samples('V', 1)] };
  write('pupvideos/gotg/Topper/Song-10.mp3', 'x'.repeat(10));
  write('pupvideos/gotg/Topper/Song-2.mp3', 'x'.repeat(10));
  write('pupvideos/gotg/Topper.orig/Song-1.mp3', 'x');
  write('pupvideos/gotg/_backup/old.mp3', 'x');
  write('pupvideos/gotg/Blank/30 Second Blank Mp3.mp3', 'x');
  write('pupvideos/gotg/DMDSplash/@vidIntro2.mp4', fakeMp4([video, sound]));
  write('pupvideos/gotg/DMDSplash/@vidIntro.mp4', fakeMp4([video]));
  write('pupvideos/gotg/DMDSplash/@blank.mp4', fakeMp4([video, sound]));
  write('pupvideos/gotg/PupVideos/vide.mp3', '');
  write('medias/(FullDMD) Gardiens (Stern 2017).mp4', fakeMp4([video]));
  write('medias/(Audio) Gardiens (Stern 2017).ogg', 'x');
  const [table] = scanTables(root);
  const folders = tableSounds(table!, { tablesDir: root });
  const view = folders.map((f) => ({ rel: f.rel.split(path.sep).join('/'), music: f.music, medias: f.medias, files: f.files.map((s) => `${path.basename(s.file)}:${s.kind}${s.seconds ? `:${s.seconds}` : ''}`) }));
  assert.deepEqual(view, [
    { rel: 'pupvideos/gotg/Topper', music: true, medias: false, files: ['Song-2.mp3:audio', 'Song-10.mp3:audio'] },
    { rel: 'medias', music: false, medias: true, files: ['(Audio) Gardiens (Stern 2017).ogg:audio'] },
    { rel: 'pupvideos/gotg/DMDSplash', music: false, medias: false, files: ['@vidIntro2.mp4:video:4.5'] },
  ]);

  // Table du dossier commun : seulement ses médias à elle.
  const shared = tmpDir();
  fs.mkdirSync(path.join(shared, 'medias'));
  fs.mkdirSync(path.join(shared, 'pupvideos', 'autre'), { recursive: true });
  fs.writeFileSync(path.join(shared, 'Alpha.vpx'), '');
  fs.writeFileSync(path.join(shared, 'medias', '(Audio) Alpha.mp3'), 'x');
  fs.writeFileSync(path.join(shared, 'medias', '(Audio) Bravo.mp3'), 'x');
  fs.writeFileSync(path.join(shared, 'pupvideos', 'autre', 'musique.mp3'), 'x');
  const alpha = scanTables(shared).find((t) => t.file.endsWith('Alpha.vpx'))!;
  assert.deepEqual(
    tableSounds(alpha, { tablesDir: shared }).flatMap((f) => f.files.map((s) => path.basename(s.file))),
    ['(Audio) Alpha.mp3'],
  );
});
