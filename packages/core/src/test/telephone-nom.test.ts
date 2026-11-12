// Téléphone gardé et adresse de la borne (incident du PinCab, 12/11/2026) : la borne redémarrée
// reçoit du DHCP une autre adresse (192.168.68.54 → .52) ; le raccourci du téléphone mène à
// l'ancienne, et le stockage du navigateur, rangé par adresse et port, ne suit pas : QR à rescanner.
//
// Ici : Cyber Pinball annonce son propre nom sur le réseau local (« cyberpinball.local », son
// répondeur mDNS ; « cyberpinball-2.local » si une autre borne le porte), jamais le nom de la machine
// Windows ; il le donne au téléphone gardé ; il répond sous ce nom ; il prouve, sous ce nom, garder la
// clé du téléphone (GET /nom) ; la page ne passe par le nom qu'avec cette preuve. Les navigateurs
// d'Android ne trouvent pas les noms en « .local » (essai sur le PinCab, Android et Brave) : la page le
// dit à la borne et à l'utilisateur, et reste sur l'adresse IP. Aucun paquet sur le vrai réseau : le
// répondeur passe par un transport simulé ; la page est servie sur 127.0.0.1.

import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import {
  createKeptPhones,
  healthLines,
  keptFingerprint,
  keptNameProof,
  mdnsAddresses,
  mdnsAnswer,
  mdnsQuery,
  mdnsQuestions,
  remoteMdnsName,
  remoteMdnsRank,
  remoteNameSummary,
  setLanguage,
  type RemoteNameFacts,
} from '../index';
import { REPO_ROOT } from './i18n-scan';

interface Remote {
  setMenu(menu: Record<string, unknown>): void;
  address(): { host: string; port: number } | undefined;
  nameFacts(): RemoteNameFacts | undefined;
  close(): void;
}
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createPhoneRemote } = require(path.join(REPO_ROOT, 'app', 'dist', 'phone-remote.js')) as { createPhoneRemote(opts: Record<string, unknown>): Remote };
interface Transport {
  send(message: Buffer, port: number, address: string): void;
  onMessage(listener: (message: Buffer, from: { address: string; port: number }) => void): void;
  close(): void;
}
interface Responder {
  start(host: string): Promise<void>;
  name(): string | undefined;
  facts(): RemoteNameFacts | undefined;
  phoneResult(result: string, device: string): void;
  close(): void;
}
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createMdnsResponder } = require(path.join(REPO_ROOT, 'app', 'dist', 'mdns-responder.js')) as { createMdnsResponder(opts: Record<string, unknown>): Responder };

/**
 * Un réseau local simulé : ce que la borne envoie (`sent`), et `others`, les autres appareils, qui
 * répondent aux questions sur leurs noms. Aucun paquet ne part.
 */
function lan(others: Record<string, string> = {}) {
  const sent: { message: Buffer; port: number; address: string }[] = [];
  let listener: ((message: Buffer, from: { address: string; port: number }) => void) | undefined;
  const transport: Transport = {
    send(message, port, address) {
      sent.push({ message, port, address });
      const q = mdnsQuestions(message);
      for (const question of q?.questions ?? []) {
        const ip = others[question.name];
        if (ip) setImmediate(() => listener?.(mdnsAnswer(question.name, ip), { address: ip, port: 5353 }));
      }
    },
    onMessage: (l) => (listener = l),
    close: () => (listener = undefined),
  };
  return { transport, sent, hear: (message: Buffer, from: { address: string; port: number }) => listener?.(message, from) };
}
interface PageCore {
  seal(key: Uint8Array, aad: Uint8Array, message: unknown): string;
  open(key: Uint8Array, aad: Uint8Array, text: string): Record<string, unknown> | null;
  toB64(b: Uint8Array): string;
  fromB64(s: string): Uint8Array | null;
  keptFingerprint(key: Uint8Array): string;
  nameProof(key: Uint8Array, nonce: Uint8Array): string;
  nameUrl(location: { hostname: string; port: string }, name: unknown): string | null;
  nameResult(status: number | undefined, proof?: unknown, expected?: string): string;
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

/**
 * Un téléphone gardé qui revient, par l'adresse : son « ready », et de quoi envoyer ensuite un
 * message scellé (comme la page, send).
 */
async function keptPhone(port: number, key: Buffer, device = 'Android · Chrome'): Promise<{ ready: Record<string, unknown>; send(m: Record<string, unknown>): void; close(): void }> {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/liaison`, { headers: { Origin: `http://127.0.0.1:${port}` } } as unknown as string[]);
  const mine = crypto.randomBytes(16);
  let theirs: Uint8Array | undefined;
  let sent = 1;
  const ready = await new Promise<Record<string, unknown>>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('pas de ready')), 5000);
    ws.onmessage = (e) => {
      const data = String(e.data);
      if (data.startsWith('{')) {
        const hello = JSON.parse(data) as { t: string; n: string };
        assert.equal(hello.t, 'challenge');
        theirs = page.fromB64(hello.n)!;
        ws.send(page.seal(key, theirs, { t: 'hello', c: page.toB64(mine), device, s: 1 }));
        return;
      }
      const m = page.open(key, mine, data);
      if (m?.t === 'ready') {
        clearTimeout(timer);
        resolve(m);
      }
    };
  });
  return { ready, send: (m) => ws.send(page.seal(key, theirs!, { ...m, s: ++sent })), close: () => ws.close() };
}

/** Un répondeur déjà annoncé sous `name` (essais de la page) ; il retient ce que les téléphones disent du nom. */
function fixedName(name: string | undefined): Responder {
  let phone: RemoteNameFacts['phone'];
  return {
    start: async () => undefined,
    name: () => name,
    facts: () => (name ? { name, ...(phone ? { phone } : {}) } : { error: 'port 5353 refusé' }),
    phoneResult: (result, device) => (phone = result === 'ok' ? undefined : { result: result as 'unreachable' | 'other', device, android: /^Android/.test(device) }),
    close: () => undefined,
  };
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

test('nom de la borne : celui de Cyber Pinball, jamais celui de la machine Windows', () => {
  assert.equal(remoteMdnsName(1), 'cyberpinball.local');
  assert.equal(remoteMdnsName(2), 'cyberpinball-2.local');
  assert.deepEqual(['cyberpinball.local', 'cyberpinball-2.local', 'cyberpinball-12.local'].map(remoteMdnsRank), [1, 2, 12]);
  for (const other of ['pinup.local', 'cyberpinball-1.local', 'cyberpinball-0.local', 'cyberpinball.lan', 'desktop-4f2k9qz.local', undefined]) assert.equal(remoteMdnsRank(other), undefined, String(other));
  // Le nom de la machine ne sert plus nulle part : ni l'application, ni la page.
  for (const file of ['phone-remote.ts', 'mdns-responder.ts', 'phone-remote-menu.ts']) assert.doesNotMatch(fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', file), 'utf8'), /os\.hostname|hostname\(\)|remoteLocalName/, file);
  // La page ne passe par le nom que depuis une adresse IP, au même port.
  assert.equal(page.nameUrl({ hostname: '192.168.68.52', port: '47820' }, 'cyberpinball.local'), 'http://cyberpinball.local:47820');
  assert.equal(page.nameUrl({ hostname: 'cyberpinball.local', port: '47820' }, 'cyberpinball.local'), null, 'déjà par le nom');
  for (const bad of ['evil.example', 'cyberpinball.local/x', 'CYBERPINBALL.local', undefined, 3]) assert.equal(page.nameUrl({ hostname: '192.168.68.52', port: '47820' }, bad), null, String(bad));
});

test('borne redémarrée sous une autre adresse : le téléphone gardé reçoit le nom, la borne y répond et prouve garder sa clé', { timeout: 20_000 }, async () => {
  const kept = createKeptPhones(undefined);
  const key = crypto.randomBytes(32);
  kept.add(key, 'Android · Chrome');
  const remote = createPhoneRemote({ mode: () => 'loopback', names: fixedName('cyberpinball.local'), kept, log: () => undefined });
  remote.setMenu(MENU);
  try {
    await until('écoute', () => Boolean(remote.address()));
    const port = remote.address()!.port;
    const name = `cyberpinball.local:${port}`;

    // 1. Le téléphone gardé revient (par l'adresse) : « ready » donne le nom local.
    const phone = await keptPhone(port, key);
    const ready = phone.ready;
    phone.close();
    assert.equal(ready.kept, true);
    assert.equal(ready.name, 'cyberpinball.local');
    const base = page.nameUrl({ hostname: '192.168.68.52', port: String(port) }, ready.name);
    assert.equal(base, `http://cyberpinball.local:${port}`);

    // 2. La page demandée sous ce nom : servie, et elle peut demander la preuve (CSP).
    const home = await get(port, '/', { Host: name });
    assert.equal(home.status, 200);
    assert.match(String(home.headers['content-security-policy']), new RegExp(`connect-src [^;]*http://cyberpinball\\.local:${port}`));
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
    // Clé inconnue (une autre borne au même nom) : refus que la page peut lire, pour le dire.
    const unknown = await ask(page.keptFingerprint(crypto.randomBytes(32)), `http://127.0.0.1:${port}`);
    assert.equal(unknown.status, 404, 'clé inconnue');
    assert.equal(unknown.headers['access-control-allow-origin'], `http://127.0.0.1:${port}`);
    assert.equal(page.nameResult(unknown.status, undefined, page.nameProof(key, nonce)), 'other');
    assert.equal(page.nameResult(proof.status, (JSON.parse(proof.body) as { p: string }).p, page.nameProof(key, nonce)), 'ok');
    assert.equal(page.nameResult(200, 'fausse', page.nameProof(key, nonce)), 'other', 'une preuve fausse : une autre machine');
    assert.equal(page.nameResult(undefined), 'unreachable', 'requête sans réponse : nom que le téléphone ne trouve pas');
    // L'onglet resté ouvert sur l'ancienne adresse (le DHCP l'a changée) peut encore demander la preuve.
    const old = await ask(page.keptFingerprint(key), `http://192.168.68.54:${port}`);
    assert.equal(old.status, 200);
    assert.equal(old.headers['access-control-allow-origin'], `http://192.168.68.54:${port}`);
    for (const origin of ['http://evil.example', `http://8.8.8.8:${port}`, 'http://192.168.68.54:1']) {
      const foreign = await ask(page.keptFingerprint(key), origin);
      assert.equal(foreign.status, 404, origin);
      assert.equal(foreign.headers['access-control-allow-origin'], undefined, origin);
    }
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

// ---------- Le répondeur mDNS de Cyber Pinball ----------

const HOST = '192.168.68.52';
const instant = { wait: () => new Promise<void>((resolve) => setImmediate(resolve)) };

test('répondeur : sonde, prend cyberpinball.local, ou cyberpinball-2.local si une autre borne le porte, et le retient', async () => {
  // Réseau libre : cyberpinball.local, sondé trois fois, puis annoncé.
  const free = lan();
  let remembered: string | undefined;
  const a = createMdnsResponder({ ...instant, transport: async () => free.transport, remember: (n: string) => (remembered = n) });
  await a.start(HOST);
  assert.equal(a.name(), 'cyberpinball.local');
  assert.equal(remembered, 'cyberpinball.local');
  const probes = free.sent.filter((x) => mdnsQuestions(x.message)?.questions[0]?.name === 'cyberpinball.local');
  assert.equal(probes.length, 3, 'trois sondes');
  assert.ok(probes.every((x) => x.address === '224.0.0.251' && x.port === 5353));
  assert.ok(free.sent.some((x) => mdnsAddresses(x.message, 'cyberpinball.local')[0] === HOST), 'annoncé par son adresse');
  a.close();

  // Une autre borne porte déjà cyberpinball.local : cyberpinball-2.local, et la Santé le dit.
  const busy = lan({ 'cyberpinball.local': '192.168.68.60' });
  const b = createMdnsResponder({ ...instant, transport: async () => busy.transport });
  await b.start(HOST);
  assert.equal(b.name(), 'cyberpinball-2.local');
  assert.deepEqual(b.facts()?.taken, [{ name: 'cyberpinball.local', by: '192.168.68.60' }]);
  assert.match(remoteNameSummary(b.facts()!).detail, /cyberpinball\.local : déjà pris par un autre appareil/);
  b.close();

  // Au démarrage suivant, le nom retenu est redemandé d'abord (le téléphone gardé le retrouve), même si le premier est libre.
  const again = lan();
  const c = createMdnsResponder({ ...instant, transport: async () => again.transport, preferred: () => 'cyberpinball-2.local' });
  await c.start(HOST);
  assert.equal(c.name(), 'cyberpinball-2.local');
  c.close();

  // Port 5353 refusé : pas de nom, la raison dans la Santé.
  const d = createMdnsResponder({ ...instant, transport: async () => { throw new Error('EADDRINUSE'); } });
  await d.start(HOST);
  assert.equal(d.name(), undefined);
  assert.equal(remoteNameSummary(d.facts()!).state, 'check');
  assert.match(remoteNameSummary(d.facts()!).detail, /EADDRINUSE/);
});

test('répondeur : ne répond qu’à son nom, par son adresse ; multidiffusion, unicast (QU) ou à l’ancienne', async () => {
  setLanguage('fr');
  const net = lan();
  const r = createMdnsResponder({ ...instant, transport: async () => net.transport });
  await r.start(HOST);
  const ask = (name: string, type = 1, unicast = false, id = 0) => {
    const q = mdnsQuery(name);
    q.writeUInt16BE(id, 0);
    if (type !== 1) q.writeUInt16BE(type, q.length - 4);
    if (!unicast) q[q.length - 2] = 0;
    return q;
  };
  const replies = (before: number) => net.sent.slice(before).filter((x) => mdnsAddresses(x.message, r.name()!).length);
  let n = net.sent.length;
  net.hear(ask('cyberpinball.local'), { address: '192.168.68.56', port: 5353 });
  assert.deepEqual(replies(n).map((x) => [x.address, x.port, mdnsAddresses(x.message, 'cyberpinball.local')[0]]), [['224.0.0.251', 5353, HOST]], 'multidiffusion');
  n = net.sent.length;
  net.hear(ask('CyberPinball.local', 1, true), { address: '192.168.68.56', port: 5353 });
  assert.deepEqual(replies(n).map((x) => [x.address, x.port]), [['192.168.68.56', 5353]], 'unicast demandé (QU), casse ignorée');
  n = net.sent.length;
  net.hear(ask('cyberpinball.local', 255, false, 4242), { address: '192.168.68.56', port: 53123 });
  const legacy = replies(n);
  assert.deepEqual(legacy.map((x) => [x.address, x.port, x.message.readUInt16BE(0)]), [['192.168.68.56', 53123, 4242]], 'question à l’ancienne : même identifiant, à son port');
  // Rien pour un autre nom, ni pour un autre type, ni pour nos propres paquets.
  n = net.sent.length;
  net.hear(ask('pinup.local'), { address: '192.168.68.56', port: 5353 });
  net.hear(ask('cyberpinball.local', 28), { address: '192.168.68.56', port: 5353 });
  net.hear(ask('cyberpinball.local'), { address: HOST, port: 5353 });
  assert.equal(net.sent.length, n);
  // Un autre appareil se met à répondre au même nom : la borne en prend un autre.
  net.hear(mdnsAnswer('cyberpinball.local', '192.168.68.77'), { address: '192.168.68.77', port: 5353 });
  await until('nouveau nom', () => r.name() === 'cyberpinball-2.local');
  r.close();
});

test('Android ne trouve pas les noms en « .local » : la page le dit, la borne le garde pour la Santé et le journal (une fois)', { timeout: 20_000 }, async () => {
  setLanguage('fr');
  const kept = createKeptPhones(undefined);
  const key = crypto.randomBytes(32);
  kept.add(key, 'Android · Chrome');
  const lines: string[] = [];
  const names = fixedName('cyberpinball.local');
  const remote = createPhoneRemote({ mode: () => 'loopback', names, kept, log: (l: string) => lines.push(l) });
  remote.setMenu(MENU);
  try {
    await until('écoute', () => Boolean(remote.address()));
    const phone = await keptPhone(remote.address()!.port, key);
    assert.equal(phone.ready.name, 'cyberpinball.local');
    phone.send({ t: 'name', r: 'unreachable' });
    phone.send({ t: 'name', r: 'unreachable' });
    await until('rapport du téléphone', () => remote.nameFacts()?.phone !== undefined);
    assert.deepEqual(remote.nameFacts()!.phone, { result: 'unreachable', device: 'Android · Chrome', android: true });
    await delay(100);
    assert.equal(lines.filter((l) => /ne joint pas la borne par son nom cyberpinball\.local/.test(l)).length, 1, 'dit une fois');
    const said = remoteNameSummary(remote.nameFacts()!);
    assert.equal(said.state, 'check');
    assert.match(said.detail, /les navigateurs d’Android ne trouvent pas les noms en « \.local »/);
    const lines2 = healthLines({ at: '', disks: [], remote: remote.nameFacts()!, vpx: {} }).filter((l) => l.check === 'remote');
    assert.deepEqual(lines2.map((l) => [l.state, l.target]), [['check', { kind: 'system', item: 'phone-remote' }]]);
    phone.close();
  } finally {
    remote.close();
  }
  // Sans nom (répondeur muet) : le téléphone gardé ne reçoit pas de nom, mais la raison.
  const k2 = createKeptPhones(undefined);
  const key2 = crypto.randomBytes(32);
  k2.add(key2, 'iPhone · Safari');
  const quiet = createPhoneRemote({ mode: () => 'loopback', names: fixedName(undefined), kept: k2, log: () => undefined });
  quiet.setMenu(MENU);
  try {
    await until('écoute', () => Boolean(quiet.address()));
    const phone = await keptPhone(quiet.address()!.port, key2, 'iPhone · Safari');
    phone.close();
    assert.equal(phone.ready.name, undefined);
    assert.equal(phone.ready.nameIssue, 'none');
  } finally {
    quiet.close();
  }
});

test('la page : pourquoi elle reste sur l’adresse IP, dit une fois et dans le menu ⋮ ; rapport à la borne', () => {
  const src = fs.readFileSync(path.join(REPO_ROOT, 'app', 'renderer', 'telephone', 'telephone.js'), 'utf8');
  // Le résultat du nom part à la borne, et la page le dit (une fois par cas).
  assert.match(src, /send\(\{ t: 'name', r \}\);\s*noteName\(r, m\.name\)/);
  assert.match(src, /typeof m\.nameIssue === 'string'\) noteName\(m\.nameIssue\)/);
  assert.match(src, /if \(stored\(NAME_NOTE_STORE\) === kind\) return;/);
  // Android : la raison est dite telle quelle.
  assert.match(src, /onAndroid\(\) \? t\('Les navigateurs d’Android ne trouvent pas la borne par son nom/);
  // Le menu ⋮ : « Adresse de la borne », et pourquoi (nameWhy).
  assert.match(src, /id: 'address', label: t\('Adresse de la borne : \{host\}'[^\n]*nameWhy\(nameStatus\)/);
  // Injoignable à son adresse : la page cherche la borne par le nom retenu (preuve à l'appui), de temps en temps.
  assert.match(src, /retry >= UNREACHABLE_AFTER[^\n]*stored\(NAME_STORE\)\) void moveToName\(stored\(NAME_STORE\), false\)/);
  // La clé ne part vers le nom qu'après la preuve.
  assert.match(src, /if \(result === 'ok' && kept\) location\.replace/);
});

test('mDNS : la requête de sondage, la réponse, et leur lecture', () => {
  const q = mdnsQuery('cyberpinball.local');
  assert.deepEqual([...q.subarray(0, 6)], [0, 0, 0, 0, 0, 1]);
  assert.deepEqual([...q.subarray(-4)], [0, 1, 0x80, 1], 'type A, réponse en unicast');
  assert.deepEqual(mdnsQuestions(q), { id: 0, questions: [{ name: 'cyberpinball.local', type: 1, unicast: true }] });
  // Réponse : cache-flush, 120 s ; à l'ancienne : la question répétée, sans cache-flush.
  const a = mdnsAnswer('cyberpinball.local', HOST);
  assert.equal(mdnsQuestions(a), undefined, 'une réponse n’est pas une question');
  assert.deepEqual(mdnsAddresses(a, 'cyberpinball.local'), [HOST]);
  const legacy = mdnsAnswer('cyberpinball.local', HOST, { id: 7 });
  assert.equal(legacy.readUInt16BE(0), 7);
  assert.equal(legacy.readUInt16BE(4), 1);
  assert.deepEqual(mdnsAddresses(legacy, 'cyberpinball.local'), [HOST]);
  // Lecture d'une réponse avec pointeur de compression, et d'un autre nom.
  const label = (n: string) => Buffer.concat(n.split('.').map((l) => Buffer.concat([Buffer.from([l.length]), Buffer.from(l)])).concat([Buffer.from([0])]));
  const rr = (name: Buffer, ip: number[]) => Buffer.concat([name, Buffer.from([0, 1, 0x80, 1, 0, 0, 0, 120, 0, 4, ...ip])]);
  const header = Buffer.from([0, 0, 0x84, 0, 0, 0, 0, 3, 0, 0, 0, 0]);
  const reply = Buffer.concat([header, rr(label('CyberPinball.local'), [192, 168, 68, 52]), rr(Buffer.from([0xc0, 12]), [192, 168, 68, 77]), rr(label('autre.local'), [10, 0, 0, 1])]);
  assert.deepEqual(mdnsAddresses(reply, 'cyberpinball.local'), ['192.168.68.52', '192.168.68.77']);
  assert.deepEqual(mdnsAddresses(Buffer.concat([Buffer.from([0, 0, 0x84, 0, 0, 0, 0, 1, 0, 0, 0, 0]), Buffer.from([0xc0, 12])]), 'cyberpinball.local'), [], 'pointeur qui boucle');
});
