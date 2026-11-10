// Téléphones gardés par la borne (remote-kept.ts) : la liste dans data\telephones.json, relue au
// démarrage ; un fichier abîmé mis de côté ; une entrée douteuse écartée ; huit au plus, le plus
// anciennement vu cède sa place ; « Oublier » ; la dernière venue enregistrée au plus une fois
// par heure.

import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { createKeptPhones, KEPT_PHONES_FILE, parseKeptPhones } from '../remote-kept';
import { REMOTE_KEPT_MAX, toBase64Url } from '../remote';

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cp-telephones-'));
}

test('téléphones gardés : ajout, relecture, oubli', () => {
  const dir = tmp();
  try {
    let now = 1_700_000_000_000;
    const phones = createKeptPhones(dir, { now: () => now });
    assert.equal(phones.size(), 0);
    const key = crypto.randomBytes(32);
    const id = phones.add(key, 'Android · Chrome');
    assert.match(id, /^[0-9a-f]{16}$/);
    assert.equal(phones.add(key, 'Android · Chrome'), id, 'la même clé n’est gardée qu’une fois');
    const again = createKeptPhones(dir, { now: () => now });
    assert.deepEqual(again.list(), [{ id, device: 'Android · Chrome', added: now, seen: now }]);
    assert.ok(again.keys()[0]!.key.equals(key));
    // La dernière venue : enregistrée au plus une fois par heure.
    now += 60_000;
    again.seen(id);
    assert.equal(createKeptPhones(dir).list()[0]!.seen, now - 60_000);
    now += 3_600_001;
    again.seen(id);
    assert.equal(createKeptPhones(dir).list()[0]!.seen, now);
    assert.equal(again.forget(id), true);
    assert.equal(again.forget(id), false);
    assert.equal(createKeptPhones(dir).size(), 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('téléphones gardés : huit au plus, le plus anciennement vu cède sa place', () => {
  let now = 1_000;
  const phones = createKeptPhones(undefined, { now: () => now });
  const ids: string[] = [];
  for (let i = 0; i < REMOTE_KEPT_MAX; i++) {
    now += 10;
    ids.push(phones.add(crypto.randomBytes(32), `Téléphone ${i}`));
  }
  now += 3_600_000;
  phones.seen(ids[0]!);
  now += 10;
  phones.add(crypto.randomBytes(32), 'Nouveau');
  const left = phones.list().map((p) => p.id);
  assert.equal(left.length, REMOTE_KEPT_MAX);
  assert.ok(left.includes(ids[0]!), 'vu récemment : gardé');
  assert.ok(!left.includes(ids[1]!), 'le plus anciennement vu : oublié');
});

test('téléphones gardés : fichier abîmé mis de côté, entrées douteuses écartées', () => {
  const dir = tmp();
  try {
    const file = path.join(dir, KEPT_PHONES_FILE);
    fs.writeFileSync(file, '{ "phones": [ tronqué');
    const lines: string[] = [];
    const phones = createKeptPhones(dir, { log: (l) => lines.push(l) });
    assert.equal(phones.size(), 0);
    assert.match(lines.join('\n'), /illisible, mise de côté/);
    assert.ok(fs.readdirSync(dir).some((f) => f.startsWith("telephones.illisible-")));
    const good = toBase64Url(crypto.randomBytes(32));
    const parsed = parseKeptPhones({
      phones: [
        { id: 'aaaaaaaa11', key: good, device: '<b>Android</b>', added: 5 },
        { id: 'aaaaaaaa11', key: good, device: 'doublon' },
        { id: 'court', key: good },
        { id: 'bbbbbbbb22', key: 'pas-une-cle' },
        { id: 'cccccccc33', key: toBase64Url(crypto.randomBytes(16)) },
        null,
      ],
    });
    assert.deepEqual(parsed, [{ id: 'aaaaaaaa11', key: good, device: 'bAndroid/b', added: 5, seen: 5 }]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
