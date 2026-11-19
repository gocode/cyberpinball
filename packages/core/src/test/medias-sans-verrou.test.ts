// Médias des tables servis sans garder de fichier ouvert (media-response.ts, 19/11/2026). Une vidéo de la
// table affichée, lue par un fs.createReadStream, tenait son fichier tant qu'elle tournait : Windows refusait
// alors de renommer le dossier de la table (EPERM), et « Mettre à la corbeille » échouait à chaque essai.
// Invariant : pendant qu'une réponse est en cours, entre deux morceaux, le dossier se renomme. Fichiers
// d'essai inventés.

import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { REPO_ROOT } from './i18n-scan';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { mediaResponse, MEDIA_CHUNK_BYTES } = require(path.join(REPO_ROOT, 'app', 'dist', 'media-response.js')) as {
  mediaResponse(file: string, size: number, range: string | null, type: string): Response;
  MEDIA_CHUNK_BYTES: number;
};

function withTable(fn: (dir: string, file: string, bytes: Buffer) => Promise<void>): Promise<void> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-medias-verrou-'));
  const dir = path.join(root, 'Table essai (Original 2026)');
  const file = path.join(dir, 'medias', '(Playfield) Table essai (Original 2026).mp4');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const bytes = Buffer.from(Array.from({ length: MEDIA_CHUNK_BYTES * 3 + 1234 }, (_, i) => (i * 7) % 251));
  fs.writeFileSync(file, bytes);
  return fn(dir, file, bytes).finally(() => fs.rmSync(root, { recursive: true, force: true }));
}

async function body(res: Response): Promise<Buffer> {
  return Buffer.from(await res.arrayBuffer());
}

test('médias : le dossier de la table se renomme pendant qu’une vidéo est en cours de lecture', async () => {
  await withTable(async (dir, file, bytes) => {
    const res = mediaResponse(file, bytes.length, 'bytes=0-', 'video/mp4');
    assert.equal(res.status, 206);
    const reader = res.body!.getReader();
    const first = await reader.read();
    assert.equal(first.done, false);
    assert.deepEqual(Buffer.from(first.value!), bytes.subarray(0, MEDIA_CHUNK_BYTES));
    // La réponse n'est pas finie : c'est le moment où l'ancien protocole tenait encore le fichier.
    const moved = `${dir} (corbeille)`;
    fs.renameSync(dir, moved);
    assert.ok(fs.existsSync(moved));
    // Le morceau suivant ne trouve plus le fichier : la réponse s'arrête sur une erreur, sans rien bloquer.
    await assert.rejects(reader.read());
  });
});

test('médias : plages et fichier entier, octet pour octet', async () => {
  await withTable(async (_dir, file, bytes) => {
    const whole = mediaResponse(file, bytes.length, null, 'video/mp4');
    assert.equal(whole.status, 200);
    assert.equal(whole.headers.get('content-length'), String(bytes.length));
    assert.deepEqual(await body(whole), bytes);

    const part = mediaResponse(file, bytes.length, 'bytes=100-2500000', 'video/mp4');
    assert.equal(part.status, 206);
    assert.equal(part.headers.get('content-range'), `bytes 100-2500000/${bytes.length}`);
    assert.deepEqual(await body(part), bytes.subarray(100, 2500001));

    const tail = mediaResponse(file, bytes.length, 'bytes=-10', 'video/mp4');
    assert.deepEqual(await body(tail), bytes.subarray(bytes.length - 10));

    const beyond = mediaResponse(file, bytes.length, `bytes=${bytes.length}-`, 'video/mp4');
    assert.equal(beyond.status, 416);
  });
});

test('médias : le protocole passe par la réponse sans verrou (aucun flux de fichier gardé ouvert)', () => {
  const source = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'media-protocol.ts'), 'utf8');
  assert.match(source, /mediaResponse\(/);
  assert.doesNotMatch(source, /createReadStream/, 'un flux de fichier tient la vidéo ouverte : le dossier de la table ne se déplace plus');
});

test('médias : Windows refuse bien de renommer un dossier dont un fichier est ouvert (la cause)', { skip: process.platform !== 'win32' }, async () => {
  await withTable(async (dir, file) => {
    const fd = fs.openSync(file, 'r');
    try {
      assert.throws(() => fs.renameSync(dir, `${dir} (corbeille)`), (e: NodeJS.ErrnoException) => e.code === 'EPERM' || e.code === 'EACCES' || e.code === 'EBUSY');
    } finally {
      fs.closeSync(fd);
    }
  });
});
