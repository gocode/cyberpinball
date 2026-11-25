// Suppressions synchrones qui gèlent le front-end.
//
// Le 25/11/2026, la borne restait figée environ une minute à chaque lancement : removePreviousApp
// appelait fs.rmSync(…, { maxRetries: 20, retryDelay: 250 }) sur un dossier tenu par le veilleur de
// la relance par Start. Node attend retryDelay × numéro de l'essai, en synchrone : 52 s, pas les
// 5 s que le commentaire annonçait. Ce test borne l'attente de tout rmSync du code de l'application,
// et vérifie que le reste d'une mise à jour légère se retire sans bloquer.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { recordPendingUpdate, removePreviousApp, removePreviousAppSoon, takeUpdateOutcome, updatePending } from '../index';

const REPO = path.join(__dirname, '..', '..', '..', '..');
/** Attente cumulée qu'un rmSync peut s'accorder (processus principal : tout est gelé pendant ce temps). */
const MAX_SYNC_WAIT_MS = 2_000;

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'test') out.push(...sources(full));
    } else if (entry.name.endsWith('.ts')) out.push(full);
  }
  return out;
}

test('rmSync : jamais plus de 2 s d’attente synchrone cumulée (maxRetries × retryDelay croissant)', () => {
  const files = [path.join(REPO, 'app', 'src'), path.join(REPO, 'packages', 'core', 'src')].flatMap(sources);
  assert.ok(files.length > 50, 'sources lues');
  const bad: string[] = [];
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    for (const match of text.matchAll(/rmSync\([^;]*?\{([^}]*maxRetries[^}]*)\}/g)) {
      const options = match[1] ?? '';
      const retries = Number(/maxRetries:\s*(\d+)/.exec(options)?.[1] ?? 0);
      const delay = Number(/retryDelay:\s*(\d+)/.exec(options)?.[1] ?? 100);
      // Node : le n-ième nouvel essai attend n × retryDelay.
      const wait = (delay * retries * (retries + 1)) / 2;
      if (wait > MAX_SYNC_WAIT_MS) bad.push(`${path.relative(REPO, file)} : ${retries} essais × ${delay} ms = ${wait} ms`);
    }
  }
  assert.deepEqual(bad, [], 'utiliser fs.promises.rm (removePreviousAppSoon) plutôt qu’une longue attente synchrone');
});

test('reste d’une mise à jour légère : retiré en un essai, ou sans bloquer', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rm-synchrone-'));
  try {
    const appDir = path.join(dir, 'app');
    const previous = `${appDir}.precedente`;
    fs.mkdirSync(path.join(previous, 'modules', 'koffi'), { recursive: true });
    fs.writeFileSync(path.join(previous, 'modules', 'koffi', 'koffi.node'), 'x');
    const start = Date.now();
    assert.equal(removePreviousApp(appDir), true);
    assert.ok(Date.now() - start < 1_000, 'un seul essai, aussitôt');
    assert.equal(removePreviousApp(appDir), true, 'rien à retirer : vrai');

    fs.mkdirSync(path.join(previous, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(previous, 'dist', 'main.js'), 'x');
    assert.equal(await removePreviousAppSoon(appDir, { retryMs: 2_000, delayMs: 50 }), true);
    assert.ok(!fs.existsSync(previous));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('mise à jour en attente : lue sans être consommée', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rm-synchrone-'));
  try {
    assert.equal(updatePending(dir), false);
    recordPendingUpdate(dir, { from: '1.0.0', to: '1.0.1', started: new Date().toISOString(), installer: 'x' });
    assert.equal(updatePending(dir), true, 'veilleur pas relancé pendant la mise à jour');
    assert.equal(updatePending(dir), true, 'lire ne consomme pas');
    takeUpdateOutcome(dir, '1.0.1');
    assert.equal(updatePending(dir), false, 'lu au démarrage de la nouvelle version : le veilleur peut repartir');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
