// Vidéos du DMD trop grandes (18/11/2026). Le plugin FlexDMD de VPX 10.8.1 décode chaque vidéo en entier à chaque scène
// UltraDMD qui la montre, sur le fil de VPX : au banc, une vidéo de 1920 × 480 figeait la partie 1 à 2,3 s à chaque
// scène, la même en 128 × 32 au plus 0,3 s. Invariants : le médecin repère les vidéos plus grandes que quatre fois le plus
// grand DMD (ou, sans définition lisible, de plus de 3 Mo), jamais celles à la taille du DMD ; le constat le dit.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { DMD_VIDEO_MAX_BYTES, heavyDmdVideos, heavyDmdVideosFinding } from '../dmdvideos';

/** MP4 minimal (ftyp, moov > trak > tkhd) dont l'en-tête donne la définition, comme readMediaDimensions la lit. */
function mp4(width: number, height: number): Buffer {
  const box = (type: string, body: Buffer) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(8 + body.length, 0);
    head.write(type, 4, 'latin1');
    return Buffer.concat([head, body]);
  };
  const tkhd = Buffer.alloc(84);
  // Version 0 : matrice identité (a = d = 1.0 en 16.16, w = 1.0 en 2.30), puis largeur et hauteur en 16.16.
  tkhd.writeUInt32BE(0x00010000, 40);
  tkhd.writeUInt32BE(0x00010000, 56);
  tkhd.writeUInt32BE(0x40000000, 72);
  tkhd.writeUInt32BE(width << 16, 76);
  tkhd.writeUInt32BE(height << 16, 80);
  const ftyp = box('ftyp', Buffer.from('isom\0\0\0\0isomavc1', 'latin1'));
  return Buffer.concat([ftyp, box('moov', box('trak', box('tkhd', tkhd)))]);
}

function folder(files: Record<string, Buffer>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-dmd-videos-'));
  for (const [name, data] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, 'Hellboy.UltraDMD', name)), { recursive: true });
    fs.writeFileSync(path.join(dir, 'Hellboy.UltraDMD', name), data);
  }
  return dir;
}

test('vidéos du DMD : grandes repérées, à la taille du DMD laissées, wmv jugée à son poids', () => {
  const dir = folder({
    'intro.mp4': mp4(1920, 480),
    'scenes/boss.mp4': mp4(1280, 320),
    'petite.mp4': mp4(128, 32),
    'grande-dmd.mp4': mp4(256, 64),
    'ancienne.wmv': Buffer.alloc(DMD_VIDEO_MAX_BYTES + 1),
    'courte.wmv': Buffer.alloc(1024),
    'image.png': Buffer.alloc(10),
  });
  const heavy = heavyDmdVideos(path.join(dir, 'Hellboy.UltraDMD')).map((v) => path.basename(v.file));
  assert.deepEqual(heavy, ['intro.mp4', 'boss.mp4', 'ancienne.wmv']);
  const finding = heavyDmdVideosFinding(dir, 'Hellboy.UltraDMD')!;
  assert.equal(finding.code, 'dmdVideosHeavy');
  assert.equal(finding.severity, 'warning');
  assert.match(finding.detail, /3 vidéos de Hellboy\.UltraDMD dépassent de loin la taille du DMD \(intro\.mp4, 1920 × 480/);
  assert.match(finding.detail, /décode chaque vidéo en entier/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('vidéos du DMD : rien à dire quand toutes ont la taille du DMD, ou sans dossier', () => {
  const dir = folder({ 'a.mp4': mp4(128, 32), 'b.mp4': mp4(256, 64) });
  assert.equal(heavyDmdVideosFinding(dir, 'Hellboy.UltraDMD'), undefined);
  assert.equal(heavyDmdVideosFinding(dir, 'Absent.UltraDMD'), undefined);
  fs.rmSync(dir, { recursive: true, force: true });
});
