// Lecture HTTP patiente (patientfetch.ts) : le délai borne l'absence de progrès, jamais la durée
// totale d'un transfert ; une erreur passagère est réessayée, un abandon de l'appelant jamais.
// Constat du 20/11/2026 : à 4 Ko/s, la liste des publications GitHub ne passait jamais sous un
// délai total de 20 s, et la recherche des mises à jour échouait à chaque fois.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import * as path from 'node:path';
import { test } from 'node:test';
import { DEFAULT_PATIENCE, fetchTextPatiently } from '../patientfetch';

type Handler = (req: http.IncomingMessage, res: http.ServerResponse, hit: number) => void;

async function serve(handler: Handler): Promise<{ url: string; hits: () => number; close(): Promise<void> }> {
  let hits = 0;
  const sockets = new Set<import('node:net').Socket>();
  const server = http.createServer((req, res) => handler(req, res, ++hits));
  server.on('connection', (s) => {
    sockets.add(s);
    s.on('close', () => sockets.delete(s));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    hits: () => hits,
    close: () =>
      new Promise((resolve) => {
        for (const s of sockets) s.destroy();
        server.close(() => resolve());
      }),
  };
}

/** Corps livré par petits morceaux, un toutes les `everyMs`, sans silence plus long. */
function trickle(res: http.ServerResponse, body: string, pieces: number, everyMs: number): void {
  const data = Buffer.from(body);
  const size = Math.ceil(data.length / pieces);
  res.writeHead(200, { 'content-type': 'application/json', 'content-length': data.length });
  let at = 0;
  const timer = setInterval(() => {
    res.write(data.subarray(at, at + size));
    at += size;
    if (at >= data.length) {
      clearInterval(timer);
      res.end();
    }
  }, everyMs);
  res.on('close', () => clearInterval(timer));
}

test('site lent mais vivant : la lecture aboutit, bien au-delà du délai sans progrès', async () => {
  const body = JSON.stringify({ liste: 'é'.repeat(5_000) });
  // Un morceau toutes les 250 ms, délai sans progrès de 2 s : huit fois l'écart, que le retard de la
  // boucle d'évènements (site et lecteur dans le même processus) ne comble pas sous la charge
  // d'autres suites. Jusqu'au 21/11/2026 : 150 ms pour 400 ms, et la lecture tombait parfois.
  const site = await serve((_req, res) => trickle(res, body, 30, 250));
  try {
    const start = Date.now();
    const response = await fetchTextPatiently(site.url, { idleMs: 2000, attempts: 1 });
    const took = Date.now() - start;
    assert.equal(response.status, 200);
    assert.equal(response.text, body, 'les caractères coupés entre deux morceaux sont recollés');
    assert.ok(took > 3 * 2000, `transfert de ${took} ms : plus long que le délai, il aboutit quand même`);
    assert.equal(site.hits(), 1);
  } finally {
    await site.close();
  }
});

test('site muet : échec au bout du délai, réessayé, erreur nommée comme un délai dépassé', async () => {
  const site = await serve(() => undefined);
  try {
    const start = Date.now();
    await assert.rejects(fetchTextPatiently(site.url, { idleMs: 200, attempts: 2, retryDelayMs: 50 }), (error: Error) => {
      assert.equal(error.name, 'TimeoutError');
      assert.match(error.message, /plus rien ne vient du site/);
      return true;
    });
    assert.ok(Date.now() - start >= 2 * 200);
    assert.equal(site.hits(), 2);
  } finally {
    await site.close();
  }
});

test('site qui se tait au milieu du corps : échec, pas d’attente sans fin', async () => {
  const site = await serve((_req, res) => {
    res.writeHead(200, { 'content-length': 1000 });
    res.write('début');
  });
  try {
    await assert.rejects(fetchTextPatiently(site.url, { idleMs: 200, attempts: 1 }), /plus rien ne vient du site/);
  } finally {
    await site.close();
  }
});

test('erreur passagère réessayée avec une attente croissante ; erreur HTTP définitive rendue telle quelle', async () => {
  const seen = new Map<string, number>();
  const site = await serve((req, res) => {
    const hit = (seen.get(req.url ?? '') ?? 0) + 1;
    seen.set(req.url ?? '', hit);
    if (req.url === '/coupure' && hit === 1) return void req.socket.destroy();
    if (req.url === '/surcharge' && hit <= 2) return void res.writeHead(503).end();
    if (req.url === '/absent') return void res.writeHead(404).end('absent');
    res.writeHead(200).end('ok');
  });
  try {
    assert.equal((await fetchTextPatiently(`${site.url}/coupure`, { retryDelayMs: 10 })).text, 'ok');
    assert.equal(site.hits(), 2);

    const start = Date.now();
    assert.equal((await fetchTextPatiently(`${site.url}/surcharge`, { retryDelayMs: 100 })).status, 200);
    assert.ok(Date.now() - start >= 100 + 200, 'attente doublée entre deux essais');
    assert.equal(site.hits(), 5);

    const absent = await fetchTextPatiently(`${site.url}/absent`, { retryDelayMs: 10 });
    assert.equal(absent.status, 404);
    assert.equal(absent.text, 'absent');
    assert.equal(site.hits(), 6, 'une 404 n’est pas réessayée');
  } finally {
    await site.close();
  }
  // Rien n'écoute : refusé, réessayé, puis l'erreur de connexion.
  await assert.rejects(fetchTextPatiently('http://127.0.0.1:9/', { attempts: 2, retryDelayMs: 10 }), /fetch failed/);
});

test('abandon demandé par l’appelant : immédiat, jamais réessayé', async () => {
  const site = await serve(() => undefined);
  try {
    const stop = new AbortController();
    setTimeout(() => stop.abort(), 100);
    const start = Date.now();
    await assert.rejects(fetchTextPatiently(site.url, { idleMs: 5_000, signal: stop.signal }), (error: Error) => error.name === 'AbortError');
    assert.ok(Date.now() - start < 2_000);
    assert.equal(site.hits(), 1);
  } finally {
    await site.close();
  }
});

test('patience par défaut : une vingtaine de secondes sans un octet, trois essais', () => {
  assert.equal(DEFAULT_PATIENCE.idleMs, 20_000);
  assert.equal(DEFAULT_PATIENCE.attempts, 3);
});

// Garde : un corps lu sous un délai total (AbortSignal.timeout) échoue sur une connexion lente.
// Une lecture de texte passe par fetchTextPatiently, un fichier par fetchResumable ; ne restent que
// les appels sans corps à lire, ou au corps minuscule, chacun avec sa raison.
const TOTAL_TIMEOUT_ALLOWED: Record<string, { count: number; how: string }> = {
  'packages/core/src/mediadb.ts': { count: 1, how: 'requête HEAD : aucun corps à lire' },
  'app/src/acquire-window.ts': { count: 1, how: 'vignette d’un résultat : quelques Ko, abandonnée sans dommage' },
  'app/src/account-service.ts': { count: 1, how: 'POST au service du compte : réponse de quelques octets, jamais réessayé (non idempotent)' },
  'app/src/feedback-service.ts': { count: 1, how: 'POST d’un retour : réponse de quelques octets, jamais réessayé (non idempotent)' },
  'app/src/dmd-watch.ts': { count: 1, how: 'serveur local du DMD, sur la machine même' },
  'app/src/solo-score-watch.ts': { count: 1, how: 'inspector de VPX, sur la machine même : relevé de 800 ms répété chaque seconde' },
  'app/src/table-rules.ts': { count: 1, how: 'vignette YouTube : quelques Ko, abandonnée sans dommage' },
  'app/src/jukebox-library.ts': { count: 1, how: 'vignette YouTube : quelques Ko, abandonnée sans dommage' },
};

test('aucun texte lu sous un délai total : chaque AbortSignal.timeout restant a sa raison', () => {
  const repo = path.resolve(__dirname, '..', '..', '..', '..');
  const found: Record<string, number> = {};
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(path.join(repo, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (entry.name !== 'test' && entry.name !== 'node_modules') walk(rel);
      } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
        const n = fs.readFileSync(path.join(repo, rel), 'utf8').split('AbortSignal.timeout(').length - 1;
        if (n) found[rel] = n;
      }
    }
  };
  walk('packages/core/src');
  walk('app/src');
  const expected = Object.fromEntries(Object.entries(TOTAL_TIMEOUT_ALLOWED).map(([file, { count }]) => [file, count]));
  assert.deepEqual(found, expected, 'un délai total coupe une lecture lente : passer par fetchTextPatiently (texte) ou fetchResumable (fichier), ou ajouter ici la raison');
});
