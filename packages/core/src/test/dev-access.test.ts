import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { DEV_ACCESS_FILE, cabinetPublicKey, devOptionOpen, normalizeFingerprint, openDevAccess, signDevAccess, type DevAccess } from '../dev-access';
import { createPlayerKey, playerFingerprint } from '../sharing';
import { SOCIAL_FILE } from '../social';
import { UPDATE_PUBLIC_KEY } from '../update-key';

function keys() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return { priv: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), pub: publicKey.export({ type: 'spki', format: 'pem' }).toString() };
}

function cabinet(): { dir: string; key: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-acces-'));
  const key = createPlayerKey().publicKey;
  fs.writeFileSync(path.join(dir, SOCIAL_FILE), JSON.stringify({ key: { publicKey: key } }));
  return { dir, key };
}

const access = (extra: Partial<DevAccess> = {}): DevAccess => ({ name: 'Essai', options: ['telechargement-direct'], date: '2026-11-09T12:00:00.000Z', ...extra });

test('accès développeur : sans fichier, le réglage reste masqué', () => {
  const { dir } = cabinet();
  assert.equal(devOptionOpen(dir, 'telechargement-direct'), false);
});

test('accès développeur : un fichier signé par la clé de publication ouvre le réglage, sur toute borne ou sur les bornes nommées', () => {
  const k = keys();
  const { dir, key } = cabinet();
  fs.writeFileSync(path.join(dir, DEV_ACCESS_FILE), signDevAccess(access(), k.priv));
  assert.equal(devOptionOpen(dir, 'telechargement-direct', k.pub), true);
  fs.writeFileSync(path.join(dir, DEV_ACCESS_FILE), signDevAccess(access({ cabinets: ['0000-0000-0000-0000', playerFingerprint(key)] }), k.priv));
  assert.equal(devOptionOpen(dir, 'telechargement-direct', k.pub), true);
});

test('accès développeur : une autre borne, une signature fausse ou un texte retouché n’ouvrent rien', () => {
  const k = keys();
  const other = keys();
  const { dir } = cabinet();
  const file = path.join(dir, DEV_ACCESS_FILE);
  fs.writeFileSync(file, signDevAccess(access({ cabinets: ['0000-0000-0000-0000'] }), k.priv));
  assert.equal(devOptionOpen(dir, 'telechargement-direct', k.pub), false);
  fs.writeFileSync(file, signDevAccess(access(), other.priv));
  assert.equal(devOptionOpen(dir, 'telechargement-direct', k.pub), false);
  const envelope = JSON.parse(signDevAccess(access({ cabinets: ['0000-0000-0000-0000'] }), k.priv)) as { access: string };
  envelope.access = envelope.access.replace(/,\s*"cabinets": \[[^\]]*\]/, '');
  fs.writeFileSync(file, JSON.stringify(envelope));
  assert.equal(devOptionOpen(dir, 'telechargement-direct', k.pub), false);
  fs.writeFileSync(file, 'pas du JSON');
  assert.equal(devOptionOpen(dir, 'telechargement-direct', k.pub), false);
});

test('accès développeur : un accès limité à des bornes ne vaut rien sans clé de borne, et la clé n’est jamais créée', () => {
  const k = keys();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-acces-'));
  fs.writeFileSync(path.join(dir, DEV_ACCESS_FILE), signDevAccess(access({ cabinets: ['0000-0000-0000-0000'] }), k.priv));
  assert.equal(cabinetPublicKey(dir), undefined);
  assert.equal(devOptionOpen(dir, 'telechargement-direct', k.pub), false);
  assert.equal(fs.existsSync(path.join(dir, SOCIAL_FILE)), false);
});

test('accès développeur : la vérification se fait par défaut avec la clé publique des mises à jour', () => {
  const k = keys();
  assert.equal(openDevAccess(signDevAccess(access(), k.priv)), undefined);
  assert.notEqual(openDevAccess(signDevAccess(access(), k.priv), k.pub), undefined);
  assert.ok(UPDATE_PUBLIC_KEY.includes('BEGIN PUBLIC KEY'));
});

test('accès développeur : options inconnues et empreintes illisibles refusées à la signature', () => {
  const k = keys();
  assert.throws(() => signDevAccess(access({ options: ['autre' as 'telechargement-direct'] }), k.priv));
  assert.throws(() => signDevAccess(access({ cabinets: ['a3f9'] }), k.priv));
  assert.equal(normalizeFingerprint('A3F9 12C0 7BE4 55D1'), 'a3f9-12c0-7be4-55d1');
  assert.equal(normalizeFingerprint('a3f9-12c0'), undefined);
});
