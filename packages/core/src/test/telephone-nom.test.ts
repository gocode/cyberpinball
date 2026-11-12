// Téléphone gardé et adresse de la borne (incident du PinCab, 12/11/2026) : la borne redémarrée
// reçoit du DHCP une autre adresse (192.168.68.54 → .52) ; le raccourci du téléphone mène à
// l'ancienne, et le stockage du navigateur, rangé par adresse et port, ne suit pas : QR à rescanner.
//
// Ici : la borne donne au téléphone gardé son nom local (« pinup.local », que Windows annonce en
// mDNS) ; elle répond sous ce nom ; elle prouve, sous ce nom, garder la clé du téléphone (GET /nom,
// défi tiré par la page, même calcul des deux côtés) ; la page ne passe par le nom qu'avec cette
// preuve. Et l'adresse qui change est détectée (journal, QR). Tout sur 127.0.0.1.

import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { createKeptPhones, keptFingerprint, keptNameProof, remoteLocalName } from '../index';
import { REPO_ROOT } from './i18n-scan';

interface Remote {
  setMenu(menu: Record<string, unknown>): void;
  address(): { host: string; port: number } | undefined;
  close(): void;
}
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createPhoneRemote } = require(path.join(REPO_ROOT, 'app', 'dist', 'phone-remote.js')) as { createPhoneRemote(opts: Record<string, unknown>): Remote };
interface PageCore {
  seal(key: Uint8Array, aad: Uint8Array, message: unknown): string;
  open(key: Uint8Array, aad: Uint8Array, text: string): Record<string, unknown> | null;
  toB64(b: Uint8Array): string;
  fromB64(s: string): Uint8Array | null;
  keptFingerprint(key: Uint8Array): string;
  nameProof(key: Uint8Array, nonce: Uint8Array): string;
  nameUrl(location: { hostname: string; port: string }, name: unknown): string | null;
}
// eslint-disable-next-line @typescript-eslint/no-require-imports
const page = require(path.join(REPO_ROOT, 'app', 'renderer', 'telephone', 'telephone-core.js')) as PageCore;

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const MENU = { phase: () => 'menu', screen: () => ({ title: 'Menu' }), field: () => undefined, button: () => undefined, setText: () => undefined, enter: () => undefined, uploadDir: () => ({ refused: '' }), uploading: () => undefined, uploaded: () => undefined, changed: () => undefined };

async function until(what: string, ok: () => boolean, ms = 6000): Promise<void> {
  const end = Date.now() + ms;
  while (!ok()) {
    if (Date.now() > end) throw new Error(`délai dépassé : ${what}`);
    await delay(50);
  }
}

/** Une requête à la borne, sous l'en-tête Host voulu (le nom que le téléphone a résolu). */
function get(port: number, url: string, headers: Record<string, string>): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: url, headers }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c: string) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('nom local : tiré du nom de la machine, seulement s’il en fait un', () => {
  assert.equal(remoteLocalName('PinUp'), 'pinup.local');
  assert.equal(remoteLocalName('DESKTOP-4F2K9QZ'), 'desktop-4f2k9qz.local');
  for (const bad of ['Ma borne', 'borne.maison', 'flipper-é', '-x', 'x-', '1234', '', 'a'.repeat(64)]) assert.equal(remoteLocalName(bad), undefined, bad);
  // La page ne passe par le nom que depuis une adresse IP, au même port.
  assert.equal(page.nameUrl({ hostname: '192.168.68.52', port: '47820' }, 'pinup.local'), 'http://pinup.local:47820');
  assert.equal(page.nameUrl({ hostname: 'pinup.local', port: '47820' }, 'pinup.local'), null, 'déjà par le nom');
  for (const bad of ['evil.example', 'pinup.local/x', 'PINUP.local', undefined, 3]) assert.equal(page.nameUrl({ hostname: '192.168.68.52', port: '47820' }, bad), null, String(bad));
});

test('borne redémarrée sous une autre adresse : le téléphone gardé reçoit le nom, la borne y répond et prouve garder sa clé', { timeout: 20_000 }, async () => {
  const kept = createKeptPhones(undefined);
  const key = crypto.randomBytes(32);
  kept.add(key, 'Android · Chrome');
  const remote = createPhoneRemote({ mode: () => 'loopback', hostname: () => 'TestBorne', kept, log: () => undefined });
  remote.setMenu(MENU);
  try {
    await until('écoute', () => Boolean(remote.address()));
    const port = remote.address()!.port;
    const name = `testborne.local:${port}`;

    // 1. Le téléphone gardé revient (par l'adresse) : « ready » donne le nom local.
    const ws = new WebSocket(`ws://127.0.0.1:${port}/liaison`, { headers: { Origin: `http://127.0.0.1:${port}` } } as unknown as string[]);
    const mine = crypto.randomBytes(16);
    const ready = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('pas de ready')), 5000);
      ws.onmessage = (e) => {
        const data = String(e.data);
        if (data.startsWith('{')) {
          const hello = JSON.parse(data) as { t: string; n: string };
          assert.equal(hello.t, 'challenge');
          ws.send(page.seal(key, page.fromB64(hello.n)!, { t: 'hello', c: page.toB64(mine), device: 'Android · Chrome', s: 1 }));
          return;
        }
        const m = page.open(key, mine, data);
        if (m?.t === 'ready') {
          clearTimeout(timer);
          resolve(m);
        }
      };
    });
    ws.close();
    assert.equal(ready.kept, true);
    assert.equal(ready.name, 'testborne.local');
    const base = page.nameUrl({ hostname: '192.168.68.52', port: String(port) }, ready.name);
    assert.equal(base, `http://testborne.local:${port}`);

    // 2. La page demandée sous ce nom : servie, et elle peut demander la preuve (CSP).
    const home = await get(port, '/', { Host: name });
    assert.equal(home.status, 200);
    assert.match(String(home.headers['content-security-policy']), new RegExp(`connect-src [^;]*http://testborne\\.local:${port}`));
    assert.equal((await get(port, '/', { Host: `autre.local:${port}` })).status, 403, 'un autre nom : refusé (rebond DNS)');

    // 3. La preuve : celle que la page attend, pour son défi et sa clé ; rien pour une autre clé ou une autre origine.
    const nonce = crypto.randomBytes(12);
    const ask = (f: string, origin: string) => get(port, `/nom?f=${f}&n=${page.toB64(nonce)}`, { Host: name, Origin: origin });
    const proof = await ask(page.keptFingerprint(key), `http://127.0.0.1:${port}`);
    assert.equal(proof.status, 200);
    assert.equal(proof.headers['access-control-allow-origin'], `http://127.0.0.1:${port}`);
    assert.equal((JSON.parse(proof.body) as { p: string }).p, page.nameProof(key, nonce));
    assert.equal(page.nameProof(key, nonce), keptNameProof(key, nonce), 'même calcul des deux côtés');
    assert.equal(page.keptFingerprint(key), keptFingerprint(key));
    assert.equal((await ask(page.keptFingerprint(crypto.randomBytes(32)), `http://127.0.0.1:${port}`)).status, 404, 'clé inconnue');
    const foreign = await ask(page.keptFingerprint(key), 'http://evil.example');
    assert.equal(foreign.status, 404, 'autre origine');
    assert.equal(foreign.headers['access-control-allow-origin'], undefined);
  } finally {
    remote.close();
  }
});

test('borne injoignable (autre Wi-Fi, borne éteinte) : la page réessaie seule et ne perd jamais sa clé', () => {
  const src = fs.readFileSync(path.join(REPO_ROOT, 'app', 'renderer', 'telephone', 'telephone.js'), 'utf8');
  // Wi-Fi retrouvé ou page revenue au premier plan : nouvel essai aussitôt, même si une connexion pend.
  assert.match(src, /window\.addEventListener\('online', reconnectNow\)/);
  assert.match(src, /visibilityState === 'visible'\) reconnectNow\(\)/);
  // Une connexion pendante vers une adresse injoignable est abandonnée, puis retentée.
  assert.match(src, /readyState === 0\) ws\.close\(\);\s*\}, CONNECT_MS\)/);
  // Après quelques essais : « Borne injoignable », sans état final (la reconnexion continue).
  assert.match(src, /unreachable: \{[^\n]*t\('Borne injoignable'\)/);
  assert.doesNotMatch(src.match(/unreachable: \{[^\n]*/)![0], /again: true/);
  // La clé n'est effacée que sur la parole de la borne (« unknown », ou « forgotten » scellé) : jamais sur un échec de liaison.
  const forgets = [...src.matchAll(/forgetKey\(\);/g)].map((m) => src.slice(Math.max(0, m.index - 200), m.index));
  assert.equal(forgets.length, 2);
  assert.match(forgets[0]!, /hello\?\.t === 'unknown'/);
  assert.match(forgets[1]!, /m\.why === 'forgotten'/);
  assert.equal([...src.matchAll(/store\(KEPT_STORE, ''\)/g)].length, 1, 'seulement dans forgetKey');
});

test('adresse de la borne changée : détectée et retenue d’un démarrage à l’autre', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-nom-'));
  try {
    const first = createKeptPhones(dir);
    assert.equal(first.noteAddress('192.168.68.54'), undefined, 'aucune adresse connue');
    first.add(crypto.randomBytes(32), 'Android · Chrome');
    assert.equal(first.noteAddress('192.168.68.54'), undefined, 'la même');
    // Redémarrage : le DHCP donne une autre adresse.
    const again = createKeptPhones(dir);
    assert.equal(again.noteAddress('192.168.68.52'), '192.168.68.54');
    assert.equal(createKeptPhones(dir).noteAddress('192.168.68.52'), undefined, 'retenue');
    assert.equal(createKeptPhones(dir).size(), 1, 'les téléphones gardés restent');
    // Sans téléphone gardé, rien à signaler.
    const empty = createKeptPhones(fs.mkdtempSync(path.join(dir, 'vide-')));
    empty.noteAddress('10.0.0.2');
    assert.equal(empty.noteAddress('10.0.0.3'), undefined);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
