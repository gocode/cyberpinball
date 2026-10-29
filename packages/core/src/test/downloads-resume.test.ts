// Gestionnaire de téléchargements (downloadmanager.ts, downloadqueue.ts, resumable.ts ; transports
// de app/src/download-sources.ts, compilés). Ces tests fixent les invariants, pas un cas :
// - un téléchargement interrompu reprend sans perte ni doublon : chaque octet de la source est
//   envoyé une fois, la suite demandée à partir de la taille du partiel, que la coupure vienne
//   d'un site (connexion coupée), d'un ami qui se déconnecte puis revient, ou d'un redémarrage
//   de Cyber Pinball (nouvelle file relue sur le disque) ;
// - un fichier repris est vérifié en entier : un début gardé abîmé est détecté à la fin
//   (empreinte du fichier entier), le fichier repart de zéro, et rien de faux n'est rendu ;
// - chaque téléchargement garde un écran de retour valide, ou un repli quand cet écran n'existe
//   plus (table retirée, ami supprimé) ;
// - la file survit à l'arrêt : un téléchargement qui tournait attend sa source au démarrage
//   suivant et repart seul ; un téléchargement mis en pause par l'utilisateur ne repart jamais seul.
// Aucun réseau hors de 127.0.0.1 : un serveur HTTP local et le réseau d'essai HyperDHT.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import type { AddressInfo } from 'node:net';
import { REPO_ROOT } from './i18n-scan';
import { createDownloadManager, type DownloadManager, type DownloadTransport } from '../downloadmanager';
import { downloadClock, downloadQueueFile, downloadsPill, loadDownloadQueue, resolveReturn, reviveQueue, shouldResume, summarize, type DownloadJob } from '../downloadqueue';
import { fetchResumable, ResumableError } from '../resumable';
import { scanTables, type TableEntry } from '../tables';
import { layoutOf } from '../locations';
import { tableContents } from '../tablecontents';
import type { TableFile } from '../friendlibrary';
import type { SocialState } from '../social';

const APP_DIST = path.join(REPO_ROOT, 'app', 'dist');
/* eslint-disable @typescript-eslint/no-require-imports */
const sources = require(path.join(APP_DIST, 'download-sources.js')) as {
  httpTransport(fetchImpl?: typeof fetch): DownloadTransport;
  friendTransport(content: object, net: object): DownloadTransport;
};
/* eslint-enable @typescript-eslint/no-require-imports */

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const tmp = (name: string) => fs.mkdtempSync(path.join(os.tmpdir(), `cp-dl-${name}-`));

async function until(what: string, check: () => boolean, ms = 15_000): Promise<void> {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error(`attendu : ${what}`);
    await new Promise((r) => setTimeout(r, 10));
  }
}

/** Contenu reconnaissable : chaque octet dépend de sa position (un octet en double ou décalé se voit). */
function payload(size: number): Buffer {
  const b = Buffer.alloc(size);
  for (let i = 0; i < size; i++) b[i] = (i * 31 + (i >> 8)) & 0xff;
  return b;
}

/**
 * Site d'essai sur 127.0.0.1 : sert `body` avec Range et ETag ; `cutAfter` coupe la connexion
 * après tant d'octets envoyés dans la réponse (une fois chacun). Compte les octets envoyés.
 */
async function site(body: Buffer, opts: { cuts?: number[]; ranges?: boolean } = {}) {
  const cuts = [...(opts.cuts ?? [])];
  const seen: { range?: string; ifRange?: string; status: number }[] = [];
  let sent = 0;
  const server = http.createServer((req, res) => {
    const range = req.headers.range;
    const m = /^bytes=(\d+)-$/.exec(range ?? '');
    const start = m && opts.ranges !== false ? Number(m[1]) : 0;
    const status = start > 0 ? 206 : 200;
    seen.push({ range, ifRange: req.headers['if-range'] as string | undefined, status });
    const chunk = body.subarray(start);
    res.writeHead(status, {
      'Content-Length': String(chunk.length),
      ETag: '"v1"',
      'Accept-Ranges': 'bytes',
      ...(status === 206 ? { 'Content-Range': `bytes ${start}-${body.length - 1}/${body.length}` } : {}),
    });
    const cut = cuts.shift();
    if (cut !== undefined) {
      // Coupure : le début part, le client a le temps de le lire (200 ms, large même sous la charge de
      // npm test), puis la connexion tombe avant la fin annoncée. Plus tôt, des octets comptés envoyés
      // seraient encore dans le tampon du client, jetés à la coupure, et redemandés à juste titre.
      res.write(chunk.subarray(0, cut), () => {
        sent += cut;
        setTimeout(() => res.socket?.destroy(), 200);
      });
      return;
    }
    sent += chunk.length;
    res.end(chunk);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/table.vpx`;
  return { url, seen, sent: () => sent, close: () => new Promise<void>((r) => server.close(() => r())) };
}

function httpSpec(url: string, dir: string, body: Buffer, id = 'essai') {
  return {
    id,
    kind: 'site' as const,
    title: 'Table : Medieval Madness',
    source: { kind: 'http' as const, label: '127.0.0.1' },
    files: [{ ref: url, name: 'table.vpx', bytes: body.length, part: path.join(dir, 'table.vpx.part'), dest: path.join(dir, 'table.vpx'), meta: { sha256: sha(body) } }],
    back: { screen: 'wait-list' as const },
    resumable: true,
  };
}

/** Horloge d'essai : les délais entre deux essais d'un site passent d'un coup. */
function clock() {
  let at = Date.now();
  return { now: () => new Date(at), skip: (ms: number) => (at += ms) };
}

test('fetchResumable : la suite est demandée à partir du partiel, le fichier entier est haché', async () => {
  const body = payload(300_000);
  const s = await site(body, { cuts: [100_000] });
  const dir = tmp('http');
  const part = path.join(dir, 'f.part');
  try {
    await assert.rejects(fetchResumable({ url: s.url, part, hashes: ['sha256'] }), (e: unknown) => e instanceof ResumableError && e.kept && e.reason === 'network');
    const kept = fs.statSync(part).size;
    assert.ok(kept > 0 && kept < body.length, 'le partiel garde ce qui est arrivé');
    const got = await fetchResumable({ url: s.url, part, hashes: ['sha256'], validator: { etag: '"v1"' } });
    assert.equal(got.resumedFrom, kept);
    assert.equal(got.sha256, sha(body), 'empreinte du fichier entier, début repris compris');
    assert.deepEqual(fs.readFileSync(part), body);
    assert.equal(s.seen[1]!.range, `bytes=${kept}-`);
    assert.equal(s.seen[1]!.ifRange, '"v1"', 'la reprise ne recolle que le même fichier');
    assert.equal(s.sent(), body.length, 'chaque octet envoyé une fois');
  } finally {
    await s.close();
  }
});

test('fetchResumable : un site qui renvoie tout (200) fait repartir le partiel de zéro, sans doublon', async () => {
  const body = payload(200_000);
  const s = await site(body, { cuts: [50_000], ranges: false });
  const dir = tmp('http200');
  const part = path.join(dir, 'f.part');
  try {
    await assert.rejects(fetchResumable({ url: s.url, part }));
    const got = await fetchResumable({ url: s.url, part, hashes: ['sha256'] });
    assert.equal(got.resumedFrom, 0);
    assert.deepEqual(fs.readFileSync(part), body, 'pas de début en double');
  } finally {
    await s.close();
  }
});

test('gestionnaire : un site coupé attend, repart seul à l’heure de l’essai suivant, sans perte ni doublon', async () => {
  const body = payload(400_000);
  const s = await site(body, { cuts: [120_000, 90_000] });
  const dataDir = tmp('mgr');
  const c = clock();
  const finished: DownloadJob[] = [];
  const m = createDownloadManager({ dataDir, transports: { http: sources.httpTransport() }, now: c.now, tickMs: 15, finished: (j) => finished.push(j) });
  try {
    m.add(httpSpec(s.url, dataDir, body));
    await until('en attente du site', () => m.get('essai')?.state === 'waiting');
    const waiting = m.get('essai')!;
    assert.equal(waiting.reason, 'network');
    assert.ok(waiting.retryAt, 'heure du prochain essai');
    // Rien ne repart avant l'heure.
    await new Promise((r) => setTimeout(r, 80));
    assert.equal(s.seen.length, 1);
    c.skip(60_000);
    await until('nouvelle coupure', () => s.seen.length === 2 && m.get('essai')?.state === 'waiting');
    c.skip(5 * 60_000);
    await until('fini', () => m.get('essai')?.state === 'done');
    assert.deepEqual(fs.readFileSync(path.join(dataDir, 'table.vpx')), body);
    assert.equal(s.sent(), body.length, 'chaque octet envoyé une fois, malgré deux coupures');
    assert.deepEqual(
      s.seen.map((x) => x.status),
      [200, 206, 206],
    );
    assert.equal(finished.length, 1, 'le finisseur est appelé une fois');
    assert.ok(!fs.existsSync(path.join(dataDir, 'table.vpx.part')), 'plus de partiel');
  } finally {
    m.stop();
    await s.close();
  }
});

test('gestionnaire : la file survit à un redémarrage et repart seule là où elle en était', async () => {
  const body = payload(500_000);
  const s = await site(body, { cuts: [150_000] });
  const dataDir = tmp('restart');
  const c = clock();
  let m: DownloadManager = createDownloadManager({ dataDir, transports: { http: sources.httpTransport() }, now: c.now, tickMs: 15 });
  try {
    m.add(httpSpec(s.url, dataDir, body));
    await until('coupé', () => m.get('essai')?.state === 'waiting');
    const kept = fs.statSync(path.join(dataDir, 'table.vpx.part')).size;
    // Arrêt de Cyber Pinball pendant l'attente (et même pendant qu'il tournait : relu « en attente »).
    m.stop();
    const onDisk = loadDownloadQueue(dataDir).jobs[0]!;
    assert.equal(onDisk.files[0]!.meta?.validator && (onDisk.files[0]!.meta.validator as { etag?: string }).etag, '"v1"', 'le validateur est gardé sur le disque');
    const running = { ...onDisk, state: 'running' as const };
    fs.writeFileSync(downloadQueueFile(dataDir), JSON.stringify({ version: 1, jobs: [running] }));
    // Démarrage suivant : nouvelle file, relue.
    m = createDownloadManager({ dataDir, transports: { http: sources.httpTransport() }, now: c.now, tickMs: 15 });
    assert.equal(m.get('essai')?.state === 'waiting' || m.get('essai')?.state === 'running', true);
    await until('fini après le redémarrage', () => m.get('essai')?.state === 'done');
    assert.deepEqual(fs.readFileSync(path.join(dataDir, 'table.vpx')), body);
    assert.equal(s.seen.at(-1)!.range, `bytes=${kept}-`, 'repris à la taille du partiel');
    assert.equal(s.sent(), body.length, 'rien de retéléchargé');
  } finally {
    m.stop();
    await s.close();
  }
});

test('gestionnaire : un début gardé abîmé est vu à la fin, le fichier repart de zéro, rien de faux n’est rendu', async () => {
  const body = payload(300_000);
  const s = await site(body, { cuts: [100_000] });
  const dataDir = tmp('abime');
  const c = clock();
  const m = createDownloadManager({ dataDir, transports: { http: sources.httpTransport() }, now: c.now, tickMs: 15 });
  try {
    m.add(httpSpec(s.url, dataDir, body));
    await until('coupé', () => m.get('essai')?.state === 'waiting');
    m.pause('essai');
    // Un octet du partiel change pendant l'arrêt (disque, copie) : la reprise ne peut pas le voir, la fin si.
    const part = path.join(dataDir, 'table.vpx.part');
    const bytes = fs.readFileSync(part);
    bytes[10] = bytes[10]! ^ 0xff;
    fs.writeFileSync(part, bytes);
    m.resume('essai');
    await until('fini', () => m.get('essai')?.state === 'done');
    assert.deepEqual(fs.readFileSync(path.join(dataDir, 'table.vpx')), body, 'le fichier rendu est le bon');
    assert.equal(s.seen.at(-1)!.range, undefined, 'repris depuis le début après l’empreinte fausse');
  } finally {
    m.stop();
    await s.close();
  }
});

test('gestionnaire : en pause, rien ne repart seul ; reprise manuelle et annulation', async () => {
  const body = payload(200_000);
  const s = await site(body, { cuts: [60_000] });
  const dataDir = tmp('pause');
  const c = clock();
  const m = createDownloadManager({ dataDir, transports: { http: sources.httpTransport() }, now: c.now, tickMs: 15 });
  try {
    m.add(httpSpec(s.url, dataDir, body));
    await until('coupé', () => m.get('essai')?.state === 'waiting');
    m.pause('essai');
    c.skip(3600_000);
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(m.get('essai')?.state, 'paused');
    assert.equal(s.seen.length, 1, 'en pause : aucun essai, même longtemps après');
    // Après un redémarrage aussi.
    assert.equal(reviveQueue(loadDownloadQueue(dataDir)).jobs[0]!.state, 'paused');
    m.resume('essai');
    await until('fini', () => m.get('essai')?.state === 'done');
    assert.equal(s.sent(), body.length);
    // Annuler un autre : le partiel part, il reste dans la liste, « Annulé ».
    const s2 = await site(body, { cuts: [50_000] });
    m.add({ ...httpSpec(s2.url, path.join(dataDir, 'b'), body, 'deux') });
    await until('coupé', () => m.get('deux')?.state === 'waiting');
    m.cancel('deux');
    assert.equal(m.get('deux')?.state, 'cancelled');
    assert.ok(!fs.existsSync(path.join(dataDir, 'b', 'table.vpx.part')));
    await s2.close();
  } finally {
    m.stop();
    await s.close();
  }
});

test('retour à l’écran d’origine : valide, ou un repli toujours valide quand il n’existe plus', () => {
  const tables = new Set(['D:\\T\\mm.vpx']);
  const friends = new Set(['bruno']);
  const world = { hasTable: (f: string) => tables.has(f), hasFriend: (k: string) => friends.has(k), friendName: () => 'Bruno' };
  const fromFriend = { source: { kind: 'friend' as const, label: 'Bruno', key: 'bruno' } };
  const fromSite = { source: { kind: 'site' as const, label: 'vpuniverse.com' } };
  // Chaque écran de retour possible, avec et sans ce dont il dépend : jamais un écran qui n'existe pas.
  const backs = [
    { screen: 'table-medias', table: 'D:\\T\\mm.vpx' },
    { screen: 'table-medias', table: 'D:\\T\\retiree.vpx' },
    { screen: 'game-parts', table: 'D:\\T\\retiree.vpx' },
    { screen: 'table-sheet', table: 'D:\\T\\retiree.vpx' },
    { screen: 'friend-library', friend: 'bruno', table: 'x' },
    { screen: 'friend-library', friend: 'supprime' },
    { screen: 'wait-list' },
    { screen: 'updates' },
    { screen: 'downloads' },
  ] as DownloadJob['back'][];
  const valid = (to: DownloadJob['back']) =>
    'table' in to && to.screen !== 'friend-library' ? world.hasTable(to.table) : to.screen === 'friend-library' ? world.hasFriend(to.friend) : true;
  for (const back of backs) {
    for (const src of [fromFriend, fromSite]) {
      const r = resolveReturn({ back, ...src }, world);
      assert.ok(valid(r.to), `${back.screen} → ${r.to.screen} doit exister`);
      assert.equal(r.lost !== undefined, r.to !== back, `${back.screen} : la raison du repli est dite`);
    }
  }
  assert.deepEqual(resolveReturn({ back: { screen: 'table-medias', table: 'D:\\T\\mm.vpx' }, ...fromFriend }, world).to, { screen: 'table-medias', table: 'D:\\T\\mm.vpx' });
  // Table retirée : la bibliothèque de l'ami d'où venaient les médias ; d'un site : le gestionnaire.
  assert.deepEqual(resolveReturn({ back: { screen: 'table-medias', table: 'D:\\T\\retiree.vpx' }, ...fromFriend }, world).to, { screen: 'friend-library', friend: 'bruno' });
  assert.deepEqual(resolveReturn({ back: { screen: 'table-medias', table: 'D:\\T\\retiree.vpx' }, ...fromSite }, world).to, { screen: 'downloads' });
});

test('file : un téléchargement suivi par un écran fermé attend qu’on le relance ; une pause n’est jamais relancée', () => {
  const at = new Date('2026-10-29T22:00:00Z');
  const base: DownloadJob = { id: 'a', kind: 'mediadb', title: 'x', source: { kind: 'http', label: 'VPinMediaDB' }, files: [], state: 'running', back: { screen: 'downloads' }, created: at.toISOString(), updated: at.toISOString(), tries: 0, resumable: true };
  const revived = reviveQueue({ version: 1, jobs: [base, { ...base, id: 'b', attached: true }, { ...base, id: 'c', state: 'paused' }, { ...base, id: 'd', state: 'done', finished: '2026-09-01T00:00:00Z' }] }, at).jobs;
  assert.deepEqual(revived.map((j) => [j.id, j.state, j.reason]), [['a', 'waiting', 'closed'], ['b', 'failed', 'closed'], ['c', 'paused', undefined]]);
  const ctx = { now: at, online: () => true, ready: () => true };
  assert.equal(shouldResume(revived[0]!, ctx), true);
  assert.equal(shouldResume(revived[1]!, ctx), false);
  assert.equal(shouldResume(revived[2]!, ctx), false);
  // Un ami : seulement relié.
  const friend = { ...revived[0]!, source: { kind: 'friend' as const, label: 'Chloé', key: 'k' }, reason: 'offline' as const };
  assert.equal(shouldResume(friend, { ...ctx, online: () => false }), false);
  assert.equal(shouldResume(friend, ctx), true);
});

test('pastille et résumé : les compteurs disent exactement la liste', () => {
  const at = '2026-10-29T22:00:00Z';
  const job = (id: string, state: DownloadJob['state'], extra: Partial<DownloadJob> = {}): DownloadJob => ({ id, kind: 'site', title: id, source: { kind: 'site', label: 's' }, files: [], state, back: { screen: 'downloads' }, created: at, updated: at, tries: 0, resumable: true, ...extra });
  const s = summarize([job('a', 'running'), job('b', 'waiting'), job('c', 'paused'), job('d', 'done'), job('e', 'done', { delivered: true }), job('f', 'failed')]);
  assert.deepEqual([s.running, s.waiting, s.paused, s.ready, s.failed], [1, 1, 1, 1, 1]);
  assert.match(downloadsPill(s)!.label, /^1 en cours/);
  assert.equal(downloadsPill(summarize([job('d', 'done', { delivered: true })])), undefined, 'rien à suivre : pas de pastille');
});

// ---------------------------------------------------------------------------
// Un ami qui se déconnecte en plein envoi, puis revient

interface Net {
  state(): SocialState;
  online(key: string): boolean;
  start(): Promise<void>;
  stop(): Promise<void>;
  rename(name: string): boolean;
  request(p: { key: string; name: string }): void;
  accept(key: string): void;
  sendChunk(key: string, frame: Buffer): Promise<boolean>;
}
interface Content {
  library(key: string): { state: string; library?: { tables: { id: string }[] } };
  tableFiles(key: string, tableId: string): Promise<TableFile[] | string>;
  tableDir(folder: string): string;
  stop(): void;
}
/* eslint-disable @typescript-eslint/no-require-imports */
const netModule = require(path.join(APP_DIST, 'social-net.js')) as { createSocialNet(o: object): Net };
const contentModule = require(path.join(APP_DIST, 'friend-content.js')) as { createFriendContent(o: object): Content };
const createTestnet = require(path.join(REPO_ROOT, 'node_modules', 'hyperdht', 'testnet.js')) as (n: number, o: { host: string }) => Promise<{ bootstrap: { host: string; port: number }[]; destroy(): Promise<void> }>;
/* eslint-enable @typescript-eslint/no-require-imports */

const BIG = payload(6 * 1024 * 1024);

function cabinet(name: string, bootstrap: { host: string; port: number }[], base = tmp(`ami-${name}`)) {
  const root = path.join(base, 'borne');
  const folder = path.join(layoutOf(root).tables, 'Attack from Mars (Bally 1995)');
  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, 'Attack from Mars (Bally 1995).vpx'), name === 'Bruno' ? BIG : Buffer.alloc(10, 1));
  }
  const dataDir = path.join(base, 'donnees');
  const net = netModule.createSocialNet({ dataDir, mode: 'simulated', host: '127.0.0.1', bootstrap });
  net.rename(name);
  // Octets envoyés par cette borne (morceaux de fichiers), pour compter les doublons.
  let sent = 0;
  const counted = new Proxy(net, {
    get(target, prop) {
      if (prop === 'sendChunk') return (key: string, frame: Buffer) => ((sent += frame.length - 4), target.sendChunk(key, frame));
      const v = (target as unknown as Record<string | symbol, unknown>)[prop];
      return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(target) : v;
    },
  });
  const tables = () => scanTables(layoutOf(root).tables);
  const content = contentModule.createFriendContent({
    net: counted,
    dataDir,
    tables,
    root: () => root,
    contents: (table: TableEntry) => tableContents(table.file, { ownFolder: true, romLibrary: layoutOf(root).roms, script: { usesPinmame: false, roms: [] } }),
  });
  return { base, net, content, dataDir, sent: () => sent };
}

const keyOf = (n: Net) => n.state().key.publicKey;

async function befriend(a: ReturnType<typeof cabinet>, b: ReturnType<typeof cabinet>): Promise<void> {
  await Promise.all([a.net.start(), b.net.start()]);
  await until('Bruno dans l’annuaire', () => a.net.state().directory.some((d) => d.profile.name === 'Bruno'), 30_000);
  a.net.request({ key: keyOf(b.net), name: 'Bruno' });
  await until('demande reçue', () => b.net.state().incoming.length === 1, 30_000);
  b.net.accept(keyOf(a.net));
  await until('amis', () => a.net.state().friends.length === 1 && a.net.online(keyOf(b.net)), 30_000);
}

test('un ami se déconnecte en plein envoi d’une table, revient : reprise seule, au même octet, fichier vérifié en entier, même après un redémarrage', { timeout: 120_000 }, async () => {
  const testnet = await createTestnet(3, { host: '127.0.0.1' });
  const a = cabinet('Alice', testnet.bootstrap);
  let b = cabinet('Bruno', testnet.bootstrap);
  let m: DownloadManager | undefined;
  try {
    await befriend(a, b);
    const bruno = keyOf(b.net);
    await until('bibliothèque de Bruno', () => a.content.library(bruno).state === 'ready', 30_000);
    const tableId = a.content.library(bruno).library!.tables[0]!.id;
    const files = await a.content.tableFiles(bruno, tableId);
    assert.ok(Array.isArray(files));
    const vpx = (files as TableFile[]).find((f) => f.rel.endsWith('.vpx'))!;
    const dir = a.content.tableDir('Attack from Mars (Bally 1995)');
    const spec = {
      id: 'table',
      kind: 'friend-table' as const,
      title: 'Toute la table : Attack from Mars',
      source: { kind: 'friend' as const, label: 'Bruno', key: bruno },
      files: [{ ref: vpx.id, name: vpx.rel, bytes: vpx.bytes, dest: path.join(dir, vpx.rel), part: `${path.join(dir, vpx.rel)}.part` }],
      back: { screen: 'friend-library' as const, friend: bruno, table: tableId },
      data: { table: tableId, dir },
      resumable: true,
    };
    const transport = () => sources.friendTransport(a.content, a.net);
    m = createDownloadManager({ dataDir: a.dataDir, transports: { friend: transport() }, tickMs: 20 });
    m.add(spec);
    const part = spec.files[0]!.part;
    await until('une partie reçue', () => fs.existsSync(part) && fs.statSync(part).size > 512 * 1024, 30_000);
    // Bruno coupe sa connexion en plein envoi.
    await b.net.stop();
    await until('en attente de Bruno', () => m!.get('table')?.state === 'waiting', 40_000);
    assert.equal(m.get('table')!.reason, 'offline');
    const cut = fs.statSync(part).size;
    assert.ok(cut > 0 && cut < BIG.length, 'le partiel est gardé');
    // Cyber Pinball s'arrête pendant l'absence de Bruno (redémarrage du PC) ; la file est relue au démarrage.
    m.stop();
    m = createDownloadManager({ dataDir: a.dataDir, transports: { friend: transport() }, tickMs: 20 });
    assert.equal(m.get('table')?.state, 'waiting');
    const sentBefore = b.sent();
    // Bruno revient le lendemain : même borne, même clé.
    b.content.stop();
    b = cabinet('Bruno', testnet.bootstrap, b.base);
    await b.net.start();
    await until('Bruno relié', () => a.net.online(bruno), 40_000);
    await until('fini', () => m!.get('table')?.state === 'done', 60_000);
    const got = fs.readFileSync(path.join(dir, vpx.rel));
    assert.equal(sha(got), sha(BIG), 'le fichier repris est le bon, vérifié en entier');
    assert.equal(b.sent(), BIG.length - cut, 'Bruno n’envoie que la suite : aucun octet en double');
    assert.ok(sentBefore >= cut);
    assert.ok(!fs.existsSync(part));
  } finally {
    m?.stop();
    a.content.stop();
    b.content.stop();
    await Promise.allSettled([a.net.stop(), b.net.stop()]);
    await testnet.destroy();
  }
});

test('heure d’un évènement : seule le jour même, avec le jour sinon', () => {
  const now = new Date(2026, 9, 29, 22, 30);
  assert.equal(downloadClock(new Date(2026, 9, 29, 22, 14).toISOString(), now), '22:14');
  assert.match(downloadClock(new Date(2026, 9, 28, 22, 14).toISOString(), now), /28.*22:14/);
});
