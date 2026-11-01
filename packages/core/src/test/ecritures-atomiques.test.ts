// Écritures atomiques (atomicwrite.ts). Le 01/11/2026, un renommage de social.json.tmp-NNNN refusé
// par Windows (EPERM : fichier tenu un instant par l'antivirus ou l'indexation) a fait tomber
// l'application trois fois pendant une partie entre amis ; vpx-owned.json, le 26/10/2026, par un
// autre writeAtomic écrit à la main. Ce test fixe la classe, pas le cas :
// - plus aucun renommage de fichier hors d'atomicwrite.ts (renameWithRetry, writeFileAtomic et leurs
//   variantes asynchrones), sauf les exceptions inscrites ici avec leur raison ;
// - le renommage partagé réessaie sur EPERM, EBUSY ou EACCES, moins d'une seconde en tout, lève
//   toute autre erreur tout de suite, et un échec final laisse l'ancien fichier entier, sans
//   temporaire ;
// - saveOrWarn, pour les sauvegardes faites depuis un évènement, note l'échec sans le lever.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import {
  RENAME_RETRY_DELAYS_MS,
  renameWithRetry,
  renameWithRetryAsync,
  saveOrWarn,
  writeFileAtomic,
  writeFileAtomicAsync,
} from '../atomicwrite';
import { REPO_ROOT } from './i18n-scan';

/** Un renommage de fichier, synchrone ou non. */
const RENAME = /\brenameSync\s*\(|\bpromises\.rename\s*\(|\bfsp?\.rename\s*\(/;

/** Renommages directs admis hors d'atomicwrite.ts : fichier, extrait de la ligne, raison. */
const EXCEPTIONS: { file: string; line: string; why: string }[] = [
  {
    file: 'packages/core/src/update.ts',
    line: 'fs.renameSync(appDir, previous);',
    why: 'swapAppDir : dossier de l’application mis de côté dans sa propre boucle de 10 s (un processus de Chromium qui finit de se fermer), plus longue que celle de renameWithRetry',
  },
];

function* sources(dir: string): Generator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'test' && entry.name !== 'node_modules') yield* sources(full);
    } else if (/\.ts$/.test(entry.name) && !entry.name.endsWith('.d.ts')) yield full;
  }
}

test('aucun renommage de fichier hors de l’écriture partagée (atomicwrite.ts), sauf les exceptions inscrites', () => {
  const found: string[] = [];
  const used = new Set<string>();
  for (const top of ['app/src', 'packages/core/src']) {
    for (const file of sources(path.join(REPO_ROOT, top))) {
      const rel = path.relative(REPO_ROOT, file).replace(/\\/g, '/');
      if (rel === 'packages/core/src/atomicwrite.ts') continue;
      fs.readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (/^\s*(\/\/|\*|\/\*)/.test(line) || !RENAME.test(line)) return;
          const exception = EXCEPTIONS.find((e) => e.file === rel && line.includes(e.line));
          if (exception) used.add(`${exception.file} ${exception.line}`);
          else found.push(`${rel}:${i + 1} : ${line.trim()} (passer par renameWithRetry ou writeFileAtomic)`);
        });
    }
  }
  assert.deepEqual(found, []);
  // Une exception qui ne sert plus est retirée de la liste.
  assert.deepEqual(EXCEPTIONS.filter((e) => !used.has(`${e.file} ${e.line}`)).map((e) => e.file), []);
});

test('les attentes du renommage partagé restent sous une seconde en tout', () => {
  const total = RENAME_RETRY_DELAYS_MS.reduce((a, b) => a + b, 0);
  assert.ok(RENAME_RETRY_DELAYS_MS.length >= 3, 'quelques essais');
  assert.ok(total < 1000, `${total} ms`);
  assert.deepEqual([...RENAME_RETRY_DELAYS_MS].sort((a, b) => a - b), [...RENAME_RETRY_DELAYS_MS], 'délai croissant');
});

const busy = (code: string) => Object.assign(new Error(`${code}: operation not permitted, rename`), { code });

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cp-ecritures-'));
}

test('writeFileAtomic : deux EPERM puis un succès, le fichier est écrit et aucun temporaire ne reste', () => {
  const dir = tempDir();
  try {
    const file = path.join(dir, 'social.json');
    fs.writeFileSync(file, 'ancien');
    const slept: number[] = [];
    let calls = 0;
    writeFileAtomic(file, 'nouveau', {
      // Le vrai renommage peut lui aussi être refusé un instant (antivirus qui lit le temporaire tout
      // juste écrit, vu pendant ce test le 01/11/2026) : il est alors réessayé comme les autres.
      rename: (from, to) => {
        if (++calls <= 2) throw busy('EPERM');
        fs.renameSync(from, to);
      },
      sleep: (ms) => slept.push(ms),
    });
    assert.equal(fs.readFileSync(file, 'utf8'), 'nouveau');
    assert.ok(calls >= 3);
    assert.deepEqual(slept, RENAME_RETRY_DELAYS_MS.slice(0, calls - 1));
    assert.deepEqual(fs.readdirSync(dir), ['social.json']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('writeFileAtomic : EPERM jusqu’au bout, l’erreur est levée, l’ancien fichier reste entier, le temporaire est effacé', () => {
  const dir = tempDir();
  try {
    const file = path.join(dir, 'vpx-owned.json');
    fs.writeFileSync(file, 'ancien');
    const slept: number[] = [];
    let calls = 0;
    assert.throws(
      () =>
        writeFileAtomic(file, 'nouveau', {
          rename: () => {
            calls++;
            throw busy(calls % 2 ? 'EPERM' : 'EBUSY');
          },
          sleep: (ms) => slept.push(ms),
        }),
      (error: NodeJS.ErrnoException) => error.code === 'EPERM' || error.code === 'EBUSY',
    );
    assert.equal(calls, RENAME_RETRY_DELAYS_MS.length + 1);
    assert.deepEqual(slept, [...RENAME_RETRY_DELAYS_MS]);
    assert.equal(fs.readFileSync(file, 'utf8'), 'ancien');
    assert.deepEqual(fs.readdirSync(dir), ['vpx-owned.json']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('renameWithRetry : une autre erreur (EXDEV, ENOENT) est levée tout de suite, sans attente', () => {
  for (const code of ['EXDEV', 'ENOENT']) {
    const slept: number[] = [];
    let calls = 0;
    assert.throws(
      () =>
        renameWithRetry('a', 'b', {
          rename: () => {
            calls++;
            throw busy(code);
          },
          sleep: (ms) => slept.push(ms),
        }),
      { code },
    );
    assert.equal(calls, 1);
    assert.deepEqual(slept, []);
  }
});

test('renameWithRetry sans réglage : un vrai renommage, attente réelle comprise, passe au deuxième essai', () => {
  const dir = tempDir();
  try {
    const from = path.join(dir, 'a.json');
    const to = path.join(dir, 'b.json');
    fs.writeFileSync(from, 'x');
    let calls = 0;
    const started = Date.now();
    renameWithRetry(from, to, {
      rename: (a, b) => {
        if (++calls === 1) throw busy('EACCES');
        fs.renameSync(a, b);
      },
    });
    assert.ok(Date.now() - started >= RENAME_RETRY_DELAYS_MS[0]! - 5, 'l’attente synchrone a eu lieu');
    assert.equal(fs.readFileSync(to, 'utf8'), 'x');
    assert.equal(fs.existsSync(from), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('writeFileAtomicAsync et renameWithRetryAsync : EBUSY puis succès, puis échec final propre', async () => {
  const dir = tempDir();
  try {
    const file = path.join(dir, 'b2s.json');
    let calls = 0;
    await writeFileAtomicAsync(file, Buffer.from('png'), {
      rename: async (from, to) => {
        if (++calls === 1) throw busy('EBUSY');
        await fs.promises.rename(from, to);
      },
      sleep: async () => undefined,
    });
    assert.equal(fs.readFileSync(file, 'utf8'), 'png');
    assert.deepEqual(fs.readdirSync(dir), ['b2s.json']);
    await assert.rejects(
      writeFileAtomicAsync(file, 'autre', {
        rename: async () => {
          throw busy('EPERM');
        },
        sleep: async () => undefined,
      }),
      { code: 'EPERM' },
    );
    assert.equal(fs.readFileSync(file, 'utf8'), 'png');
    assert.deepEqual(fs.readdirSync(dir), ['b2s.json']);
    await assert.rejects(renameWithRetryAsync(path.join(dir, 'absent'), file, { sleep: async () => undefined }), { code: 'ENOENT' });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('saveOrWarn : un échec est noté au journal avec le fichier, jamais levé', () => {
  const warned: string[] = [];
  const original = console.warn;
  console.warn = (...parts: unknown[]) => warned.push(parts.join(' '));
  try {
    assert.equal(
      saveOrWarn('D:\\données\\social.json', () => {
        throw busy('EPERM');
      }),
      false,
    );
    assert.equal(saveOrWarn('D:\\données\\social.json', () => undefined), true);
  } finally {
    console.warn = original;
  }
  assert.equal(warned.length, 1);
  assert.match(warned[0]!, /social\.json/);
  assert.match(warned[0]!, /EPERM/);
});
