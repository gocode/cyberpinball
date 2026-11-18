// Vidéos du DMD ramenées à la taille du DMD (18/11/2026) : réencodées en VP8 par Chromium, rangées dans un WebM écrit
// ici (webmfile.ts), sous le même nom que l'original. Invariants : le fichier est un WebM que le cœur relit à la bonne
// définition, ses images gardent leur ordre et leurs images clés, une vidéo réduite n'est plus « trop grande » (la
// réduction ne se refait pas), et seules les vidéos que Chromium lit sont réduites.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { heavyDmdVideos, isShrinkableDmdVideo } from '../dmdvideos';
import { readMediaDimensions } from '../medias';
import { webmFile, type EncodedFrame } from '../webmfile';

/** Éléments EBML d'un niveau : identifiant (octets bruts), début et fin du contenu. */
function elements(buf: Buffer, start = 0, end = buf.length): { id: number; from: number; to: number }[] {
  const out: { id: number; from: number; to: number }[] = [];
  let at = start;
  while (at < end) {
    const first = buf[at]!;
    const idLen = first >= 0x80 ? 1 : first >= 0x40 ? 2 : first >= 0x20 ? 3 : 4;
    let id = 0;
    for (let i = 0; i < idLen; i++) id = id * 256 + buf[at + i]!;
    at += idLen;
    const b = buf[at]!;
    let len = 1;
    while (len <= 8 && !(b & (0x80 >> (len - 1)))) len++;
    let size = b & (0xff >> len);
    for (let i = 1; i < len; i++) size = size * 256 + buf[at + i]!;
    at += len;
    out.push({ id, from: at, to: at + size });
    at += size;
  }
  return out;
}

const frames = (n: number): EncodedFrame[] => Array.from({ length: n }, (_, i) => ({ data: new Uint8Array([i, i, i]), key: i % 30 === 0, timestampUs: Math.round((i * 1e6) / 30) }));

test('WebM : en-tête webm, piste V_VP8 à la taille du DMD, relu à 128 × 32 par le cœur', () => {
  const webm = webmFile({ width: 128, height: 32, frames: frames(90), durationMs: 3000 });
  const top = elements(webm);
  assert.deepEqual(top.map((e) => e.id), [0x1a45dfa3, 0x18538067]);
  assert.ok(webm.subarray(top[0]!.from, top[0]!.to).includes(Buffer.from('webm')));
  assert.ok(webm.includes(Buffer.from('V_VP8')));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-webm-'));
  const file = path.join(dir, 'intro.mp4');
  fs.writeFileSync(file, webm);
  assert.deepEqual(readMediaDimensions(file), { width: 128, height: 32, animated: true });
  fs.rmSync(dir, { recursive: true, force: true });
});

test('WebM : une grappe par image clé, les images dans l’ordre, temps relatifs et drapeau de clé', () => {
  const webm = webmFile({ width: 128, height: 32, frames: frames(90), durationMs: 3000 });
  const segment = elements(webm)[1]!;
  const clusters = elements(webm, segment.from, segment.to).filter((e) => e.id === 0x1f43b675);
  assert.equal(clusters.length, 3);
  const seen: number[] = [];
  for (const [c, cluster] of clusters.entries()) {
    const inner = elements(webm, cluster.from, cluster.to);
    assert.equal(inner[0]!.id, 0xe7);
    const blocks = inner.filter((e) => e.id === 0xa3);
    assert.equal(blocks.length, 30);
    for (const [i, b] of blocks.entries()) {
      assert.equal(webm[b.from], 0x81, 'piste 1');
      assert.equal(webm.readInt16BE(b.from + 1), Math.round(((c * 30 + i) * 1000) / 30) - Math.round((c * 30 * 1000) / 30));
      assert.equal(webm[b.from + 3], i === 0 ? 0x80 : 0, 'image clé en tête de grappe');
      seen.push(webm[b.from + 4]!);
    }
  }
  assert.deepEqual(seen, Array.from({ length: 90 }, (_, i) => i % 256));
});

test('vidéo réduite : plus « trop grande », donc jamais réduite deux fois ; wmv et avi laissées', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-webm-'));
  fs.writeFileSync(path.join(dir, 'intro.mp4'), webmFile({ width: 128, height: 32, frames: frames(30), durationMs: 1000 }));
  assert.deepEqual(heavyDmdVideos(dir), []);
  assert.equal(isShrinkableDmdVideo('intro.mp4'), true);
  assert.equal(isShrinkableDmdVideo('scene.MOV'), true);
  assert.equal(isShrinkableDmdVideo('vieille.wmv'), false);
  assert.equal(isShrinkableDmdVideo('vieille.avi'), false);
  fs.rmSync(dir, { recursive: true, force: true });
});
