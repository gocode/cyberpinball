// Morceaux locaux du Juke-box lus hors du processus principal (19/11/2026). Servis par le protocole
// cyber-media, leurs octets attendaient un tour du processus principal à chaque lecture relancée par
// Chromium : une vidéo lourde et mal entrelacée s'arrêtait toutes les quelques secondes, son et image.
// Ici : le serveur du processus utilitaire (app/dist/jukebox-media-worker.js) sert les plages comme
// Chromium les demande, ne sert que les fichiers autorisés derrière son jeton ; le lecteur prend son
// adresse ; la page l'autorise ; les coupures vont au journal. Fichiers d'essai inventés.

import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import { REPO_ROOT } from './i18n-scan';

const TOKEN = '0123456789abcdef0123456789abcdef';

interface MediaServer {
  server: http.Server;
  allow(id: unknown, file: unknown): boolean;
}
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createMediaServer } = require(path.join(REPO_ROOT, 'app', 'dist', 'jukebox-media-worker.js')) as {
  createMediaServer(token: string, options?: { waitMs?: number }): MediaServer;
};

function get(port: number, url: string, headers: Record<string, string> = {}): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }> {
  return new Promise((resolve, reject) => {
    http
      .get({ host: '127.0.0.1', port, path: url, headers }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }));
      })
      .on('error', reject);
  });
}

async function withServer(fn: (port: number, s: MediaServer, file: string, bytes: Buffer) => Promise<void>): Promise<void> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-jukebox-serveur-'));
  const file = path.join(dir, 'Morceau essai.mp4');
  const bytes = Buffer.from(Array.from({ length: 5000 }, (_, i) => i % 251));
  fs.writeFileSync(file, bytes);
  const s = createMediaServer(TOKEN, { waitMs: 150 });
  await new Promise<void>((r) => s.server.listen(0, '127.0.0.1', () => r()));
  const port = (s.server.address() as { port: number }).port;
  try {
    await fn(port, s, file, bytes);
  } finally {
    await new Promise<void>((r) => s.server.close(() => r()));
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('serveur du Juke-box : plages demandées par Chromium, en-têtes de lecture et CORS', async () => {
  await withServer(async (port, s, file, bytes) => {
    assert.equal(s.allow('a1b2c3d4e5f6.mp4', file), true);
    const whole = await get(port, `/${TOKEN}/a1b2c3d4e5f6.mp4`);
    assert.equal(whole.status, 200);
    assert.deepEqual(whole.body, bytes);
    assert.equal(whole.headers['content-type'], 'video/mp4');
    assert.equal(whole.headers['accept-ranges'], 'bytes');
    assert.equal(whole.headers['access-control-allow-origin'], '*', 'le Juke-box lit ses sons en crossOrigin (niveaux du son)');
    const open = await get(port, `/${TOKEN}/a1b2c3d4e5f6.mp4`, { Range: 'bytes=4000-' });
    assert.equal(open.status, 206);
    assert.equal(open.headers['content-range'], 'bytes 4000-4999/5000');
    assert.deepEqual(open.body, bytes.subarray(4000));
    const middle = await get(port, `/${TOKEN}/a1b2c3d4e5f6.mp4`, { Range: 'bytes=10-19' });
    assert.deepEqual(middle.body, bytes.subarray(10, 20));
    const tail = await get(port, `/${TOKEN}/a1b2c3d4e5f6.mp4`, { Range: 'bytes=-100' });
    assert.deepEqual(tail.body, bytes.subarray(4900), "l'index d'un MP4 est souvent à la fin : la plage « fin » doit marcher");
    assert.equal((await get(port, `/${TOKEN}/a1b2c3d4e5f6.mp4`, { Range: 'bytes=6000-' })).status, 416);
  });
});

test('serveur du Juke-box : rien sans le jeton, rien qui ne soit autorisé', async () => {
  await withServer(async (port, s, file) => {
    s.allow('a1b2c3d4e5f6.mp4', file);
    assert.equal((await get(port, `/ffffffffffffffffffffffffffffffff/a1b2c3d4e5f6.mp4`)).status, 403);
    assert.equal((await get(port, `/a1b2c3d4e5f6.mp4`)).status, 403);
    assert.equal((await get(port, `/${TOKEN}/`)).status, 403);
    assert.equal((await get(port, `/${TOKEN}/../../Windows/win.ini`)).status, 403);
    assert.equal((await get(port, `/${TOKEN}/deadbeefdeadbeef.mp4`)).status, 404, 'identifiant jamais autorisé');
    assert.equal(s.allow('../x', file), false);
    assert.equal(s.allow('abcdefabcdef.mp4', 'relatif.mp4'), false);
  });
});

test('serveur du Juke-box : une requête arrivée avant son autorisation attend celle-ci', async () => {
  await withServer(async (port, s, file, bytes) => {
    const pending = get(port, `/${TOKEN}/0badc0ffee00.mp4`);
    setTimeout(() => s.allow('0badc0ffee00.mp4', file), 40);
    const res = await pending;
    assert.equal(res.status, 200);
    assert.equal(res.body.length, bytes.length);
  });
});

test("lecteur du Juke-box : sons et vidéos par le serveur hors du processus principal, page qui l'autorise", () => {
  const player = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'jukebox-player.ts'), 'utf8');
  assert.match(player, /function fileUrl\(file: string\): string \{[^}]*host\.streamUrl\?\.\(file\) \?\? mediaUrl\(file\)/s, 'fileUrl doit préférer le serveur local');
  const frontend = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'frontend.ts'), 'utf8');
  assert.match(frontend, /streamUrl: \(file\) => streamUrl\(file\)/);
  assert.match(frontend, /startJukeboxMedia\(/);
  const html = fs.readFileSync(path.join(REPO_ROOT, 'app', 'renderer', 'frontend.html'), 'utf8');
  assert.match(html, /media-src [^;]*http:\/\/127\.0\.0\.1:\*/, 'la page doit pouvoir lire le serveur local');
  assert.match(html, /<script src="jukebox-stalls\.js"><\/script>/, 'le guet des coupures doit être chargé');
  const renderer = fs.readFileSync(path.join(REPO_ROOT, 'app', 'renderer', 'jukebox.js'), 'utf8');
  assert.match(renderer, /CyberJukeboxStalls\?\.watch\(/, 'chaque lecture locale doit être guettée');
});
