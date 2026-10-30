// Réseau des bornes (app/src/social-net.ts, compilé) entre deux ou trois bornes du même processus,
// sur un réseau d'essai HyperDHT et un réseau local simulé, tous deux sur 127.0.0.1 : aucune
// socket n'écoute ailleurs (pas d'invite du pare-feu, pas de borne réelle). Vérifie le parcours
// complet : annuaire, demande d'ami, acceptation (aussi quand l'une des bornes était éteinte),
// présence, évènements, retrait, blocage ; et que le mode « off » n'ouvre rien.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';
import { nearbyPlayers, newSocialState, searchDirectory, type Presence, type SocialEvent, type SocialNetMode, type SocialState } from '../social';

const APP_DIST = path.join(REPO_ROOT, 'app', 'dist');
/** Ce que le test utilise du service (app/src/social-net.ts). */
interface Net {
  state(): SocialState;
  status(): { running: boolean };
  online(key: string): boolean;
  presenceOf(key: string): Presence | undefined;
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
interface NetModule {
  createSocialNet(o: object): Net;
  memoryBeacons(bus: Set<unknown>): unknown;
}
// eslint-disable-next-line @typescript-eslint/no-require-imports
const net = require(path.join(APP_DIST, 'social-net.js')) as NetModule;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const createTestnet = require(path.join(REPO_ROOT, 'node_modules', 'hyperdht', 'testnet.js')) as (n: number, o: { host: string }) => Promise<{ bootstrap: { host: string; port: number }[]; destroy(): Promise<void> }>;


async function until(what: string, check: () => boolean, ms = 15_000): Promise<void> {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error(`attendu : ${what}`);
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
      if (/node:(dgram|net)['"]|require\(['"](hyperswarm|hyperdht|protomux|@hyperswarm\/secret-stream)/.test(text) || /from ['"](hyperswarm|hyperdht|protomux|@hyperswarm\/secret-stream)['"]/.test(text)) offenders.push(path.relative(REPO_ROOT, path.join(dir, name)));
    }
  }
  assert.deepEqual(offenders, []);
});
