// Téléphone gardé et port de la télécommande (incident du PinCab, 0.1.9-essai.72) : à une relève
// (mise à jour, relance), le nouveau Cyber Pinball démarre pendant que l'ancien tient encore le port
// 47820 ; il partait aussitôt sur un port au hasard, et le téléphone gardé, dont le navigateur range
// la clé par adresse et port, devait rescanner le QR — en ajoutant chaque fois une entrée de plus.
//
// Ici : le port pris le temps qu'un ancien processus sorte est attendu puis repris ; un port libre
// en dernier recours seulement, et le QR le dit ; une écoute dépassée ne laisse aucun serveur ; un
// téléphone déjà gardé qui repasse par le QR remplace son entrée (empreinte de son ancienne clé, la
// même calculée par la page et par la borne). Tout sur 127.0.0.1.

import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import * as net from 'node:net';
import * as path from 'node:path';
import { test } from 'node:test';
import { createKeptPhones, createRemotePairing, keptFingerprint } from '../index';
import { REPO_ROOT } from './i18n-scan';

interface Remote {
  setMenu(menu: Record<string, unknown>): void;
  show(surface: string, on: boolean): void;
  bar(): { phase: string; line: string } | undefined;
  address(): { host: string; port: number } | undefined;
  close(): void;
}
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createPhoneRemote } = require(path.join(REPO_ROOT, 'app', 'dist', 'phone-remote.js')) as { createPhoneRemote(opts: Record<string, unknown>): Remote };

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const MENU = { phase: () => 'menu', screen: () => ({ title: 'Menu' }), field: () => undefined, button: () => undefined, setText: () => undefined, enter: () => undefined, uploadDir: () => ({ refused: '' }), uploading: () => undefined, uploaded: () => undefined, changed: () => undefined };
// Un téléphone gardé : la télécommande écoute dès que le menu est là.
const KEPT = { size: () => 1, keys: () => [], list: () => [], seen: () => undefined, add: () => 'x', forget: () => false };

/** Un « ancien Cyber Pinball » qui tient le port ; son numéro. */
async function holder(): Promise<{ port: number; server: net.Server }> {
  const server = net.createServer();
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return { port: (server.address() as net.AddressInfo).port, server };
}
const closeServer = (s: net.Server) => new Promise<void>((r) => s.close(() => r()));
async function until(what: string, ok: () => boolean, ms = 6000): Promise<void> {
  const end = Date.now() + ms;
  while (!ok()) {
    if (Date.now() > end) throw new Error(`délai dépassé : ${what}`);
    await delay(100);
  }
}

test('relève : le port tenu par l’ancien processus est attendu puis repris, le téléphone gardé garde son adresse', { timeout: 20_000 }, async () => {
  const old = await holder();
  const lines: string[] = [];
  const remote = createPhoneRemote({ mode: () => 'loopback', port: old.port, kept: KEPT, log: (l: string) => lines.push(l) });
  remote.setMenu(MENU);
  try {
    await delay(2500);
    assert.equal(remote.address(), undefined, 'pas d’écoute ailleurs pendant que l’ancien processus finit de sortir');
    assert.ok(lines.some((l) => l.includes('attente de sa libération')), 'le journal dit qu’il attend');
    await closeServer(old.server);
    await until('port repris', () => remote.address()?.port === old.port);
    assert.ok(lines.some((l) => l.includes('libéré')), lines.join(' | '));
    assert.ok(!lines.some((l) => l.includes('port libre')), 'jamais de port au hasard');
  } finally {
    remote.close();
  }
});

test('port toujours pris par un autre programme : un port libre en dernier recours, et le QR le dit', { timeout: 20_000 }, async () => {
  const other = await holder();
  const lines: string[] = [];
  const remote = createPhoneRemote({ mode: () => 'loopback', port: other.port, portWaitMs: 1500, kept: KEPT, log: (l: string) => lines.push(l) });
  remote.setMenu(MENU);
  try {
    await until('port libre', () => Boolean(remote.address()));
    assert.notEqual(remote.address()!.port, other.port);
    assert.ok(lines.some((l) => l.includes('dernier recours')));
    remote.show('menu', true);
    assert.match(remote.bar()?.line ?? '', /Port habituel pris/);
  } finally {
    remote.close();
    await closeServer(other.server);
  }
});

test('écoute dépassée (fermée pendant l’attente du port) : aucun serveur ne reste ouvert', { timeout: 20_000 }, async () => {
  const old = await holder();
  const remote = createPhoneRemote({ mode: () => 'loopback', port: old.port, kept: KEPT, log: () => undefined });
  remote.setMenu(MENU);
  await delay(1500);
  remote.close();
  await closeServer(old.server);
  await delay(2500);
  assert.equal(remote.address(), undefined);
  // Le port est libre : rien de la télécommande ne le tient.
  const again = net.createServer();
  await new Promise<void>((resolve, reject) => {
    again.once('error', reject);
    again.listen(old.port, '127.0.0.1', resolve);
  });
  await closeServer(again);
});

test('téléphone déjà gardé qui repasse par le QR : son entrée est remplacée, jamais doublée', () => {
  const kept = createKeptPhones(undefined);
  const before = crypto.randomBytes(32);
  const other = crypto.randomBytes(32);
  kept.add(before, 'Android · Chrome');
  kept.add(other, 'iPhone · Safari');
  // Le même téléphone, nouvelle clé (nouveau QR), avec l'empreinte de l'ancienne.
  const now = crypto.randomBytes(32);
  kept.add(now, 'Android · Chrome', keptFingerprint(before));
  assert.equal(kept.size(), 2, 'l’ancienne entrée remplacée, l’autre téléphone gardé');
  assert.ok(kept.keys().some((k) => k.key.equals(now)) && !kept.keys().some((k) => k.key.equals(before)));
  // Sans empreinte (ou une empreinte inconnue) : une entrée de plus, rien d'effacé.
  kept.add(crypto.randomBytes(32), 'Android · Chrome', keptFingerprint(crypto.randomBytes(32)));
  assert.equal(kept.size(), 3);
});

test('empreinte : la même calculée par la page du téléphone et par la borne, transmise par l’appairage', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const page = require(path.join(REPO_ROOT, 'app', 'renderer', 'telephone', 'telephone-core.js')) as { aeadSeal(k: Uint8Array, n: Uint8Array, a: Uint8Array, p: Uint8Array): Uint8Array; toB64(b: Uint8Array): string };
  const key = crypto.randomBytes(32);
  const fromPage = page.toB64(page.aeadSeal(key, new Uint8Array(12), new TextEncoder().encode('cyberpinball:garde'), new Uint8Array(0)));
  assert.equal(fromPage, keptFingerprint(key));
  assert.match(fromPage, /^[A-Za-z0-9_-]{22}$/);
  // L'appairage la garde avec le téléphone accepté ; une valeur malformée est ignorée.
  for (const [prev, kept] of [
    [fromPage, fromPage],
    ['../../etc', undefined],
  ] as const) {
    const pairing = createRemotePairing({});
    const offer = pairing.view();
    assert.equal(offer.phase, 'offer');
    const offerKey = (offer as { key: Buffer }).key;
    const hello = pairing.hello((k) => (k.equals(offerKey) ? { t: 'hello', device: 'Android · Chrome', prev } : undefined));
    assert.equal(hello?.kind, 'claimed');
    assert.ok(pairing.accept());
    assert.equal(pairing.current()?.prev, kept);
  }
});
