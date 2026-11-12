// Réseau des bornes (app/src/social-net.ts, compilé) entre deux ou trois bornes du même processus,
// sur un réseau d'essai HyperDHT et un réseau local simulé, tous deux sur 127.0.0.1 : aucune
// socket n'écoute ailleurs (pas d'invite du pare-feu, pas de borne réelle). Vérifie le parcours
// complet : annuaire, demande d'ami, acceptation (aussi quand l'une des bornes était éteinte),
// présence, évènements, retrait, blocage ; et que le mode « off » n'ouvre rien. Puis les
// invariants de la présence (friendpresence.ts) : une liaison qui tombe quand une autre vit,
// une reconnexion rapide, une balise qui ne passe que dans un sens, une borne arrêtée.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';
import { readAvatarImage, type AvatarImage } from '../avatar';
import { loadSocial, nearbyPlayers, newSocialState, searchDirectory, type Presence, type SocialEvent, type SocialNetMode, type SocialState } from '../social';

const APP_DIST = path.join(REPO_ROOT, 'app', 'dist');
/** Ce que le test utilise du service (app/src/social-net.ts). */
interface Net {
  state(): SocialState;
  status(): { running: boolean; internet: boolean; lan: boolean; error?: string; lanError?: string };
  online(key: string): boolean;
  presenceOf(key: string): Presence | undefined;
  listSync(): 'off' | 'searching' | 'updating' | 'settled';
  linksOf(key: string): ('internet' | 'lan')[];
  setLan(on: boolean): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  setEnabled(on: boolean): Promise<void>;
  rename(name: string): boolean;
  setPresence(p: Presence): void;
  publish(e: Omit<SocialEvent, 'id' | 'at'>): void;
  request(p: { key: string; name: string }): void;
  accept(key: string): void;
  remove(key: string): void;
  block(key: string): void;
}
/** Ce que le test des avatars utilise en plus. */
interface AvatarNet extends Net {
  setAvatar(image: AvatarImage | undefined): void;
  avatarFile(key: string): string | undefined;
  decline(key: string): void;
}
interface NetModule {
  createSocialNet(o: object): Net;
  memoryBeacons(bus: Set<unknown>): unknown;
  multicastBeacons(o: { interfaces?: () => string[]; host?: string; port?: number }): Beacons;
  NO_INTERFACE: string;
}
interface Beacons {
  start(onBeacon: () => void): Promise<void>;
  announce(beacon: object): void;
  stop(): Promise<void>;
  problem?(): string | undefined;
}
// eslint-disable-next-line @typescript-eslint/no-require-imports
const net = require(path.join(APP_DIST, 'social-net.js')) as NetModule;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const createTestnet = require('hyperdht/testnet.js') as (n: number, o: { host: string }) => Promise<{ bootstrap: { host: string; port: number }[]; destroy(): Promise<void> }>;


/** `detail` : ce qu'on sait au moment de l'échec (liaisons, journal), pour qu'un délai dépassé s'explique. */
async function until(what: string, check: () => boolean, ms = 15_000, detail?: () => string): Promise<void> {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error(`attendu : ${what}${detail ? `\n${detail()}` : ''}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

function cabinet(name: string, opts: { bootstrap?: { host: string; port: number }[]; bus?: Set<unknown>; mode?: SocialNetMode; lan?: boolean }): { net: Net; dir: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `cp-social-${name}-`));
  if (opts.lan === false) fs.writeFileSync(path.join(dir, 'social.json'), JSON.stringify({ ...fresh(), lan: false }));
  const n = net.createSocialNet({
    dataDir: dir,
    mode: opts.mode ?? 'simulated',
    host: '127.0.0.1',
    ...(opts.bootstrap ? { bootstrap: opts.bootstrap } : {}),
    ...(opts.bus ? { beacons: net.memoryBeacons(opts.bus) } : {}),
  });
  assert.equal(n.rename(name), true);
  return { net: n, dir };
}

const fresh = (): SocialState => newSocialState();

/** Adresses locales des sockets de ce processus (UDP, et TCP en écoute), relevées par Windows. */
function ownSockets(): string[] {
  const script = `@(Get-NetUDPEndpoint -OwningProcess ${process.pid} -ErrorAction SilentlyContinue | ForEach-Object { 'udp ' + $_.LocalAddress }) + @(Get-NetTCPConnection -OwningProcess ${process.pid} -State Listen -ErrorAction SilentlyContinue | ForEach-Object { 'tcp ' + $_.LocalAddress })`;
  return execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8' }).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

const profileOf = (n: Net) => ({ key: n.state().key.publicKey, name: n.state().name });

test('deux bornes par Internet : annuaire, demande, acceptation, présence, évènements, retrait', async () => {
  const testnet = await createTestnet(3, { host: '127.0.0.1' });
  const a = cabinet('Alice', { bootstrap: testnet.bootstrap, lan: false });
  const b = cabinet('Bruno', { bootstrap: testnet.bootstrap, lan: false });
  try {
    await Promise.all([a.net.start(), b.net.start()]);
    assert.equal(a.net.status().running, true);
    // L'annuaire : chacune trouve l'autre par son nom, sans code ni adresse.
    await until('Bruno dans l’annuaire d’Alice', () => a.net.state().directory.some((d) => d.profile.name === 'Bruno'));
    const found = searchDirectory(a.net.state(), 'bru');
    assert.equal(found[0]?.profile.key, profileOf(b.net).key);

    a.net.request(found[0]!.profile);
    await until('demande reçue par Bruno', () => b.net.state().incoming.some((r) => r.key === profileOf(a.net).key));
    assert.equal(b.net.state().incoming[0]!.name, 'Alice');
    b.net.accept(profileOf(a.net).key);
    await until('amis des deux côtés', () => a.net.state().friends.length === 1 && b.net.state().friends.length === 1);
    assert.equal(a.net.state().outgoing.length, 0);

    // Présence : la table en cours, en temps réel.
    b.net.setPresence({ status: 'playing', table: { title: 'The Goonies', manufacturer: 'Original', year: 2021 }, since: new Date().toISOString() });
    await until('Alice voit Bruno en partie', () => a.net.presenceOf(profileOf(b.net).key)?.status === 'playing');
    assert.equal(a.net.presenceOf(profileOf(b.net).key)?.table?.title, 'The Goonies');
    assert.equal(a.net.online(profileOf(b.net).key), true);
    // Rien n'écoute ailleurs que sur 127.0.0.1 : pas d'invite du pare-feu pendant les tests.
    const sockets = ownSockets();
    assert.ok(sockets.length > 0, 'sockets relevées');
    assert.deepEqual(sockets.filter((s) => !/ 127\.0\.0\.1$/.test(s)), []);

    // Évènement : un record, reçu une seule fois.
    b.net.publish({ kind: 'record', table: { title: 'The Goonies' }, score: 12_345_670, rank: 1, initials: 'BRU' });
    await until('Alice reçoit le record', () => a.net.state().friends[0]!.events.length === 1);
    assert.equal(a.net.state().friends[0]!.events[0]!.score, 12_345_670);

    // Retrait : l'autre borne l'apprend.
    b.net.remove(profileOf(a.net).key);
    await until('Alice n’a plus Bruno', () => a.net.state().friends.length === 0);
  } finally {
    await Promise.all([a.net.stop(), b.net.stop()]);
    await testnet.destroy();
  }
});

test('acceptée pendant que la borne qui demandait était éteinte : amis à la reconnexion', async () => {
  const testnet = await createTestnet(3, { host: '127.0.0.1' });
  const a = cabinet('Alice', { bootstrap: testnet.bootstrap, lan: false });
  const b = cabinet('Bruno', { bootstrap: testnet.bootstrap, lan: false });
  let a2: Net | undefined;
  try {
    await Promise.all([a.net.start(), b.net.start()]);
    await until('Bruno dans l’annuaire', () => a.net.state().directory.some((d) => d.profile.name === 'Bruno'));
    a.net.request(profileOf(b.net));
    await until('demande reçue', () => b.net.state().incoming.length === 1);
    await a.net.stop();
    b.net.accept(profileOf(a.net).key);
    assert.equal(b.net.state().friends.length, 1);
    // Alice redémarre (même dossier, même clé) : Bruno le lui confirme à la connexion.
    a2 = net.createSocialNet({ dataDir: a.dir, mode: 'simulated', host: '127.0.0.1', bootstrap: testnet.bootstrap });
    assert.equal(a2.state().outgoing.length, 1);
    await a2.start();
    await until('Alice amie de Bruno', () => a2!.state().friends.length === 1);
  } finally {
    await Promise.all([a.net.stop(), b.net.stop(), a2?.stop()]);
    await testnet.destroy();
  }
});

test('renommée juste avant de demander : la demande arrive sous le nouveau nom', async () => {
  const testnet = await createTestnet(3, { host: '127.0.0.1' });
  const a = cabinet('Alice', { bootstrap: testnet.bootstrap, lan: false });
  const b = cabinet('Bruno', { bootstrap: testnet.bootstrap, lan: false });
  try {
    await Promise.all([a.net.start(), b.net.start()]);
    // Déjà reliées : Bruno a reçu « Alice » au premier contact.
    await until('Alice dans l’annuaire de Bruno', () => b.net.state().directory.some((d) => d.profile.name === 'Alice'));
    assert.equal(a.net.rename('Alicia'), true);
    a.net.request(profileOf(b.net));
    await until('demande reçue par Bruno', () => b.net.state().incoming.length === 1);
    assert.equal(b.net.state().incoming[0]!.name, 'Alicia');
    b.net.accept(profileOf(a.net).key);
    await until('amis', () => a.net.state().friends.length === 1);
    assert.equal(b.net.state().friends[0]!.name, 'Alicia');
  } finally {
    await Promise.all([a.net.stop(), b.net.stop()]);
    await testnet.destroy();
  }
});

test('réseau local sans Internet : la borne voisine apparaît, demande et acceptation passent', async () => {
  const bus = new Set<unknown>();
  // Pas de nœud d'amorçage commun : seule la balise locale les relie.
  const a = cabinet('Alice', { bootstrap: [], bus });
  const b = cabinet('Bruno', { bootstrap: [], bus });
  try {
    await Promise.all([a.net.start(), b.net.start()]);
    await until('Bruno à proximité', () => nearbyPlayers(a.net.state()).some((d) => d.profile.name === 'Bruno'));
    a.net.request(profileOf(b.net));
    await until('demande reçue par le réseau local', () => b.net.state().incoming.length === 1);
    assert.equal(b.net.state().incoming[0]!.lan, true);
    b.net.accept(profileOf(a.net).key);
    await until('amis', () => a.net.state().friends.length === 1);
    assert.equal(a.net.online(profileOf(b.net).key), true);
    assert.deepEqual(ownSockets().filter((s) => !/ 127\.0\.0\.1$/.test(s)), []);
  } finally {
    await Promise.all([a.net.stop(), b.net.stop()]);
  }
});

test('bloqué : plus de demande, plus de connexion', async () => {
  const testnet = await createTestnet(3, { host: '127.0.0.1' });
  const a = cabinet('Alice', { bootstrap: testnet.bootstrap, lan: false });
  const b = cabinet('Bruno', { bootstrap: testnet.bootstrap, lan: false });
  try {
    await Promise.all([a.net.start(), b.net.start()]);
    await until('se voient', () => b.net.state().directory.length === 1);
    b.net.block(profileOf(a.net).key);
    a.net.request(profileOf(b.net));
    await new Promise((r) => setTimeout(r, 800));
    assert.equal(b.net.state().incoming.length, 0);
    assert.equal(b.net.state().directory.length, 0);
    assert.equal(b.net.online(profileOf(a.net).key), false);
  } finally {
    await Promise.all([a.net.stop(), b.net.stop()]);
    await testnet.destroy();
  }
});

test('mode « off » ou partage désactivé : rien ne s’ouvre', async () => {
  const off = cabinet('Alice', { mode: 'off' });
  await off.net.start();
  assert.equal(off.net.status().running, false);
  const disabled = cabinet('Bruno', { mode: 'simulated', bootstrap: [] });
  await disabled.net.setEnabled(false);
  await disabled.net.start();
  assert.equal(disabled.net.status().running, false);
  assert.equal(JSON.parse(fs.readFileSync(path.join(disabled.dir, 'social.json'), 'utf8')).enabled, false);
});

test('seul social-net.ts ouvre des sockets réseau, et Hyperswarm n’est chargé que par lui', () => {
  const dirs = [path.join(REPO_ROOT, 'app', 'src'), path.join(REPO_ROOT, 'packages', 'core', 'src'), path.join(REPO_ROOT, 'packages', 'win-displays', 'src'), path.join(REPO_ROOT, 'packages', 'installer', 'src')];
  const offenders: string[] = [];
  for (const dir of dirs) {
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith('.ts') || name === 'social-net.ts') continue;
      const text = fs.readFileSync(path.join(dir, name), 'utf8');
      // vpx-inspector.ts : une connexion de client à 127.0.0.1 seulement (un port libre pour l'inspector de VPX), jamais d'écoute.
      if (name === 'vpx-inspector.ts' && dir.endsWith(path.join('app', 'src'))) {
        const uses = [...text.matchAll(/\bnet\.(\w+)\(([^)]{0,40})/g)].map((m) => `${m[1]}(${m[2]}`);
        if (uses.length === 1 && uses[0] === "connect({ host: '127.0.0.1', port }" && !/\.listen\(|createServer|node:dgram/.test(text)) continue;
      }
      // vision3d.ts : envoi UDP au plugin VPX sur 127.0.0.1 seulement (format opentrack), jamais d'écoute ni de port ouvert.
      if (name === 'vision3d.ts' && dir.endsWith(path.join('app', 'src'))) {
        const sends = [...text.matchAll(/\.send\(([^;]*)\);/g)].map((m) => m[1]!);
        if (/dgram\.createSocket\('udp4'\)/.test(text) && sends.length === 1 && sends[0]!.endsWith("'127.0.0.1'") && !/\.bind\(|\.listen\(|createServer|node:net/.test(text)) continue;
      }
      // mdns-responder.ts : le nom de la borne (« cyberpinball.local ») sur UDP 5353, partagé avec Windows ;
      // il ne répond qu'à son nom, par son adresse, et n'ouvre ni serveur ni connexion.
      if (name === 'mdns-responder.ts' && dir.endsWith(path.join('app', 'src'))) {
        const binds = [...text.matchAll(/\.bind\(([^,)]*)/g)].map((m) => m[1]);
        if (binds.length === 1 && binds[0] === 'MDNS_PORT' && !/\.listen\(|createServer|node:net|\.connect\(/.test(text)) continue;
      }
      if (/node:(dgram|net)['"]|require\(['"](hyperswarm|hyperdht|protomux|@hyperswarm\/secret-stream)/.test(text) || /from ['"](hyperswarm|hyperdht|protomux|@hyperswarm\/secret-stream)['"]/.test(text)) offenders.push(path.relative(REPO_ROOT, path.join(dir, name)));
    }
  }
  assert.deepEqual(offenders, []);
});

// ---------- Présence : invariants (friendpresence.ts) ----------

type Beacon = { profile: { key: string }; port: number };
type BeaconListener = (beacon: Beacon, host: string) => void;

/**
 * Deux bornes déjà amies (social.json écrit d'avance, comme après une amitié faite) : ouvertes
 * avec les options données (tolérance, recherche courtes), pas encore démarrées.
 */
function friendsPair(opts: { bootstrap?: { host: string; port: number }[]; lan?: boolean; beacons?: (key: string) => unknown; graceMs?: number; searchMs?: number; refuseIncoming?: (i: number, keys: string[]) => boolean }) {
  const made = ['Alice', 'Bruno'].map((name) => cabinet(name, { bootstrap: [] }));
  const states = made.map((m) => m.net.state());
  const since = new Date().toISOString();
  made.forEach((m, i) => {
    const other = states[1 - i]!;
    const seeded: SocialState = { ...states[i]!, lan: opts.lan ?? true, friends: [{ key: other.key.publicKey, name: other.name, since, events: [] }] };
    fs.writeFileSync(path.join(m.dir, 'social.json'), JSON.stringify(seeded));
  });
  const logs: string[][] = [[], []];
  const open = (i: number) =>
    net.createSocialNet({
      dataDir: made[i]!.dir,
      mode: 'simulated',
      host: '127.0.0.1',
      bootstrap: opts.bootstrap ?? [],
      ...(opts.beacons ? { beacons: opts.beacons(states[i]!.key.publicKey) } : {}),
      ...(opts.graceMs !== undefined ? { graceMs: opts.graceMs } : {}),
      ...(opts.searchMs !== undefined ? { searchMs: opts.searchMs } : {}),
      ...(opts.refuseIncoming?.(i, states.map((st) => st.key.publicKey)) ? { refuseIncoming: true } : {}),
      log: (line: string) => logs[i]!.push(line),
    });
  return { a: open(0), b: open(1), keyA: states[0]!.key.publicKey, keyB: states[1]!.key.publicKey, dirs: made.map((m) => m.dir), logs, reopen: open };
}

/** Relève une condition toutes les 10 ms ; `misses` : combien de fois elle a manqué. */
function watch(check: () => boolean): { misses(): number; stop(): void } {
  let misses = 0;
  const timer = setInterval(() => {
    if (!check()) misses++;
  }, 10);
  return { misses: () => misses, stop: () => clearInterval(timer) };
}

const linkedBoth = (p: ReturnType<typeof friendsPair>, a: Net = p.a, b: Net = p.b) => a.linksOf(p.keyB).length > 0 && b.linksOf(p.keyA).length > 0;
/** Les liaisons de chaque côté et la fin de leur journal. */
const pairState = (p: ReturnType<typeof friendsPair>, a: Net = p.a, b: Net = p.b) => () =>
  [`Alice → Bruno : [${a.linksOf(p.keyB).join(', ')}], Bruno → Alice : [${b.linksOf(p.keyA).join(', ')}]`, ...p.logs.flatMap((l, i) => l.slice(-12).map((line) => `  ${i ? 'Bruno' : 'Alice'} : ${line}`))].join('\n');

test('présence : liaisons Internet et locale, la locale tombe, l’ami reste en ligne des deux côtés', async () => {
  const testnet = await createTestnet(3, { host: '127.0.0.1' });
  const bus = new Set<unknown>();
  // Tolérance très courte : seule l'autre liaison peut garder l'ami en ligne.
  const p = friendsPair({ bootstrap: testnet.bootstrap, beacons: () => net.memoryBeacons(bus), graceMs: 200 });
  try {
    await Promise.all([p.a.start(), p.b.start()]);
    const both = (n: Net, key: string) => n.linksOf(key).includes('internet') && n.linksOf(key).includes('lan');
    await until('reliées par Internet et le réseau local, des deux côtés', () => both(p.a, p.keyB) && both(p.b, p.keyA), 20_000, pairState(p));
    const seen = watch(() => p.a.online(p.keyB) && p.b.online(p.keyA));
    await p.a.setLan(false);
    await new Promise((r) => setTimeout(r, 1_200));
    seen.stop();
    assert.equal(seen.misses(), 0, 'jamais hors ligne, d’un côté comme de l’autre');
    assert.deepEqual(p.a.linksOf(p.keyB), ['internet']);
    assert.deepEqual(p.b.linksOf(p.keyA), ['internet']);
    assert.ok(!p.logs.flat().some((l) => / hors ligne \(/.test(l)), 'pas de passage hors ligne au journal');
    assert.ok(p.logs[0]!.some((l) => /liaison réseau local avec Bruno fermée .*1 autre\(s\) liaison\(s\)/.test(l)), 'la chute et ce qui reste sont au journal');
  } finally {
    await Promise.all([p.a.stop(), p.b.stop()]);
    await testnet.destroy();
  }
});

test('présence : reconnexion rapide sans clignotement, « vu » inchangé, « mise à jour » puis « à jour »', async () => {
  const bus = new Set<unknown>();
  const p = friendsPair({ beacons: () => net.memoryBeacons(bus), graceMs: 8_000, searchMs: 300 });
  try {
    assert.equal(p.a.listSync(), 'searching', 'pas encore démarrée : la liste se fait');
    await Promise.all([p.a.start(), p.b.start()]);
    await until('en ligne des deux côtés', () => linkedBoth(p), 15_000, pairState(p));
    await until('liste à jour', () => p.a.listSync() === 'settled' && p.b.listSync() === 'settled');
    const seenBefore = loadSocial(p.dirs[0]!).friends[0]!.lastSeen;
    const states = new Set<string>();
    const seen = watch(() => {
      states.add(p.a.listSync());
      return p.a.online(p.keyB) && p.b.online(p.keyA);
    });
    // La liaison tombe et se refait (réseau local coupé puis rétabli sur une borne).
    await p.a.setLan(false);
    await new Promise((r) => setTimeout(r, 200));
    await p.a.setLan(true);
    await until('reliées de nouveau', () => linkedBoth(p), 7_000, pairState(p));
    await until('liste à jour de nouveau', () => p.a.listSync() === 'settled');
    seen.stop();
    assert.equal(seen.misses(), 0, 'jamais hors ligne pendant la reconnexion');
    assert.ok(states.has('updating'), 'la liste a dit « mise à jour en cours »');
    assert.equal(loadSocial(p.dirs[0]!).friends[0]!.lastSeen, seenBefore, '« vu » n’est pas redaté par une liaison qui se refait');
    assert.ok(!p.logs.flat().some((l) => / hors ligne \(/.test(l)));
  } finally {
    await Promise.all([p.a.stop(), p.b.stop()]);
  }
});

test('présence : balise qui ne passe que dans un sens, les deux bornes convergent', async () => {
  // Réseau local simulé où la balise de la borne qui appelle d'habitude (la plus petite clé) se
  // perd : avant, aucune des deux n'appelait. L'autre appelle à son tour après deux balises.
  const listeners = new Map<string, BeaconListener>();
  let muted = '';
  const oneWay = (me: string) => ({
    async start(onBeacon: BeaconListener) {
      listeners.set(me, onBeacon);
    },
    announce(beacon: Beacon) {
      if (beacon.profile.key === muted) return;
      for (const [key, l] of listeners) if (key !== me) l(beacon, '127.0.0.1');
    },
    async stop() {
      listeners.delete(me);
    },
  });
  const p = friendsPair({ beacons: oneWay, graceMs: 2_000 });
  muted = p.keyA < p.keyB ? p.keyA : p.keyB;
  try {
    await Promise.all([p.a.start(), p.b.start()]);
    await until('en ligne des deux côtés malgré la balise perdue', () => linkedBoth(p), 20_000, pairState(p));
    assert.deepEqual(p.a.linksOf(p.keyB), ['lan']);
    assert.deepEqual(p.b.linksOf(p.keyA), ['lan']);
  } finally {
    await Promise.all([p.a.stop(), p.b.stop()]);
  }
});

test('présence : borne arrêtée, hors ligne après la tolérance, vue à l’arrêt ; redémarrée, les deux reconvergent', async () => {
  const bus = new Set<unknown>();
  const p = friendsPair({ beacons: () => net.memoryBeacons(bus), graceMs: 1_000, searchMs: 300 });
  let b2: Net | undefined;
  try {
    await Promise.all([p.a.start(), p.b.start()]);
    await until('en ligne des deux côtés', () => linkedBoth(p), 15_000, pairState(p));
    const stoppedAt = Date.now();
    await p.b.stop();
    assert.equal(p.a.online(p.keyB), true, 'pendant la tolérance, encore en ligne');
    assert.equal(p.a.listSync(), 'updating');
    await until('hors ligne', () => !p.a.online(p.keyB), 3_000);
    const offlineAt = Date.now();
    const lastSeen = Date.parse(p.a.state().friends[0]!.lastSeen!);
    // « Vu » : à la chute de la liaison, pas à la fin de la tolérance.
    assert.ok(lastSeen >= stoppedAt - 50 && lastSeen <= stoppedAt + 500, `vu ${lastSeen - stoppedAt} ms après l’arrêt`);
    assert.ok(offlineAt - lastSeen >= 900, 'hors ligne seulement passé la tolérance');
    assert.equal(p.a.listSync(), 'settled');
    assert.ok(p.logs[0]!.some((l) => /Bruno hors ligne \(dernière liaison fermée il y a \d+ s\)/.test(l)));
    // Bruno redémarre : chacun revoit l'autre.
    b2 = p.reopen(1);
    await b2.start();
    await until('en ligne de nouveau, des deux côtés', () => linkedBoth(p, p.a, b2!), 10_000, pairState(p, p.a, b2!));
  } finally {
    await Promise.all([p.a.stop(), p.b.stop(), b2?.stop()]);
  }
});

test('présence : entrant bloqué d’un côté (pare-feu), la liaison sortante suffit aux deux, sans clignotement', async (t) => {
  const testnet = await createTestnet(3, { host: '127.0.0.1' });
  // L'entrant est bloqué chez la plus petite clé : le pire cas. Les deux bornes s'appellent en même
  // temps, et Hyperswarm garde chez la plus grande son propre appel, que l'autre refuse, en coupant
  // celui qui aurait abouti. Sa balise sort, celle de l'autre ne lui arrive pas.
  const listeners = new Map<string, BeaconListener>();
  let deaf = '';
  const beacons = (me: string) => ({
    async start(onBeacon: BeaconListener) {
      listeners.set(me, onBeacon);
    },
    announce(beacon: Beacon) {
      for (const [key, l] of listeners) if (key !== me && key !== deaf) l(beacon, '127.0.0.1');
    },
    async stop() {
      listeners.delete(me);
    },
  });
  const p = friendsPair({ bootstrap: testnet.bootstrap, beacons, graceMs: 300, refuseIncoming: (i, keys) => keys[i]! < keys[1 - i]! });
  const r = p.keyA < p.keyB ? 0 : 1; // la borne qui refuse l'entrant
  const [refuser, other] = r === 0 ? [p.a, p.b] : [p.b, p.a];
  const [refuserKey, otherKey] = r === 0 ? [p.keyA, p.keyB] : [p.keyB, p.keyA];
  const [refuserName, otherName] = r === 0 ? ['Alice', 'Bruno'] : ['Bruno', 'Alice'];
  deaf = refuserKey;
  try {
    const begin = Date.now();
    await Promise.all([p.a.start(), p.b.start()]);
    // Relances tirées au hasard, appel coupé relancé vite : quelques secondes, même sous charge
    // (avant : jusqu'aux 1 s, 5 s puis 15 s de Hyperswarm, les deux bornes retombant ensemble).
    await until('en ligne des deux côtés par la liaison sortante de la borne qui refuse l’entrant', () => linkedBoth(p), 20_000, pairState(p));
    t.diagnostic(`liaison faite en ${Date.now() - begin} ms`);
    const seen = watch(() => p.a.online(p.keyB) && p.b.online(p.keyA));
    await new Promise((res) => setTimeout(res, 2_000));
    seen.stop();
    assert.equal(seen.misses(), 0, 'présence cohérente et stable des deux côtés');
    assert.deepEqual(refuser.linksOf(otherKey), ['internet']);
    assert.deepEqual(other.linksOf(refuserKey), ['internet']);
    const opened = new RegExp(`liaison Internet sortante avec ${otherName} ouverte \\(1 liaison\\(s\\)\\) : en ligne, \\d+\\.\\d s après le début de la recherche`);
    assert.ok(p.logs[r]!.some((l) => opened.test(l)), 'le sens et le délai sont au journal');
    assert.ok(p.logs[1 - r]!.some((l) => new RegExp(`liaison Internet entrante avec ${refuserName} ouverte`).test(l)));
  } finally {
    await Promise.all([p.a.stop(), p.b.stop()]);
    await testnet.destroy();
  }
});

test('avatar : reçu par les amis et les demandes en cours, jamais par l’annuaire ; changé, retiré, puis oublié', async () => {
  const testnet = await createTestnet(3, { host: '127.0.0.1' });
  const a = cabinet('Alice', { bootstrap: testnet.bootstrap, lan: false });
  const b = cabinet('Bruno', { bootstrap: testnet.bootstrap, lan: false });
  const c = cabinet('Chloe', { bootstrap: testnet.bootstrap, lan: false });
  const nets = [a, b, c].map((x) => x.net as AvatarNet);
  const [na, nb, nc] = nets as [AvatarNet, AvatarNet, AvatarNet];
  const keyA = profileOf(na).key;
  const keyC = profileOf(nc).key;
  /** Image d'essai : un en-tête PNG de 256 × 256 (le contrôle ne décode pas). */
  const image = (seed: number) => {
    const head = Buffer.alloc(40, seed);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(head, 0);
    head.writeUInt32BE(13, 8);
    head.write('IHDR', 12, 'latin1');
    head.writeUInt32BE(256, 16);
    head.writeUInt32BE(256, 20);
    return readAvatarImage(head)!;
  };
  const bytesOf = (file: string | undefined) => (file && fs.existsSync(file) ? fs.readFileSync(file) : undefined);
  try {
    na.setAvatar(image(1));
    nc.setAvatar(image(3));
    await Promise.all(nets.map((n) => n.start()));
    await until('Alice dans l’annuaire de Bruno et de Chloé', () => [nb, nc].every((n) => n.state().directory.some((d) => d.profile.key === keyA)));
    na.request(profileOf(nb));
    await until('demande reçue par Bruno', () => nb.state().incoming.some((r) => r.key === keyA));
    // Une demande en cours suffit : Bruno voit déjà la photo de celle qui le demande.
    await until('avatar d’Alice chez Bruno', () => bytesOf(nb.avatarFile(keyA))?.equals(image(1).bytes) === true);
    nb.accept(keyA);
    await until('amis', () => na.state().friends.length === 1 && nb.state().friends.length === 1);
    // Chloé ne connaît Alice que par l'annuaire : ses initiales, pas sa photo.
    assert.equal(nc.avatarFile(keyA), undefined);

    // Changé : le nouveau arrive, l'ancien fichier est rangé.
    const old = nb.avatarFile(keyA)!;
    na.setAvatar(image(2));
    await until('nouvel avatar d’Alice chez Bruno', () => bytesOf(nb.avatarFile(keyA))?.equals(image(2).bytes) === true);
    await until('ancien fichier rangé', () => !fs.existsSync(old));

    // Chloé demande Alice : Alice reçoit son avatar avec la demande.
    nc.request(profileOf(na));
    await until('avatar de Chloé chez Alice', () => bytesOf(na.avatarFile(keyC))?.equals(image(3).bytes) === true);
    // Refusée : son avatar sort de chez Alice.
    na.decline(keyC);
    await until('avatar de Chloé oublié', () => na.avatarFile(keyC) === undefined);

    // Retiré : Bruno voit de nouveau les initiales d'Alice.
    na.setAvatar(undefined);
    await until('avatar d’Alice retiré chez Bruno', () => nb.avatarFile(keyA) === undefined);
    assert.equal(na.avatarFile(keyA), undefined);
  } finally {
    await Promise.all(nets.map((n) => n.stop()));
    await testnet.destroy();
  }
});

test('réseau local en panne au démarrage (addMembership EHOSTUNREACH) : Internet tourne quand même, le local est réessayé et revient', async () => {
  const testnet = await createTestnet(3, { host: '127.0.0.1' });
  const bus = new Set<unknown>();
  const memory = net.memoryBeacons(bus) as Beacons;
  let failures = 2;
  const beacons: Beacons = {
    async start(onBeacon) {
      if (failures-- > 0) throw new Error('addMembership EHOSTUNREACH');
      await memory.start(onBeacon);
    },
    announce: (b) => memory.announce(b),
    stop: () => memory.stop(),
  };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-social-panne-'));
  const lines: string[] = [];
  const a = net.createSocialNet({ dataDir: dir, mode: 'simulated', host: '127.0.0.1', bootstrap: testnet.bootstrap, beacons, retryMs: 100, log: (l: string) => lines.push(l) });
  try {
    await a.start();
    const st = a.status();
    assert.deepEqual([st.running, st.internet, st.lan, st.error, st.lanError], [true, true, false, undefined, 'addMembership EHOSTUNREACH'], 'la panne locale ne bloque pas Internet');
    assert.ok(lines.some((l) => /réseau local indisponible \(addMembership EHOSTUNREACH\), Internet seul ; nouvel essai/.test(l)), lines.join(' | '));
    await until('réseau local revenu après deux échecs', () => a.status().lan && !a.status().lanError, 5_000, () => JSON.stringify(a.status()));
    assert.equal(failures, -1);
    // Coupé par l'utilisateur, puis arrêté : plus de nouvel essai en attente.
    await a.setLan(false);
    assert.equal(a.status().lanError, undefined);
  } finally {
    await a.stop();
    await testnet.destroy();
  }
});

test('balise multidiffusion : une carte refusée ou absente ne lève pas, la raison est dite ; un port refusé lève au lieu d’attendre', async () => {
  let cards = ['203.0.113.7'];
  const b = net.multicastBeacons({ interfaces: () => cards, host: '127.0.0.1', port: 0 });
  try {
    await b.start(() => undefined);
    assert.match(b.problem!() ?? '', /203\.0\.113\.7/, 'carte absente de la machine : refusée, dite');
    b.announce({ profile: {}, port: 1 });
    cards = [];
    b.announce({ profile: {}, port: 1 });
    assert.equal(b.problem!(), net.NO_INTERFACE, 'aucune carte : dite, sans lever');
  } finally {
    await b.stop();
  }
  // Adresse d'écoute qui n'est pas à la machine : l'ouverture échoue franchement (jamais une promesse sans fin).
  const bad = net.multicastBeacons({ interfaces: () => [], host: '203.0.113.7', port: 0 });
  await assert.rejects(bad.start(() => undefined), /EADDRNOTAVAIL|EINVAL/);
  await bad.stop();
});
