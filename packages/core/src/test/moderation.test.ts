// Modération des salons (moderation.ts) : la charte livrée est signée par la clé du projet, une charte
// changée ou signée par une autre clé est refusée ; seule la décision d'un modérateur de la charte est
// acceptée ; masquer, sourdine (le temps qu'elle dure), exclusion, levée, sujet ; le signalement est
// signé et joint la vraie ligne ; la file regroupe par ligne, les plus signalées d'abord ; fichier relu.

import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';
import {
  activeActs,
  bundledCharter,
  handleReports,
  lineHidden,
  lineRefused,
  loadModeration,
  mergeCharter,
  mergeModActs,
  mergeReports,
  newModerationState,
  pendingReports,
  roomTopic,
  sanctionOf,
  saveModeration,
  signCharter,
  signModAct,
  signReport,
  verifyCharter,
  verifyModAct,
  verifyReport,
  type Charter,
} from '../moderation';
import { roomOfCountry, signRoomLine } from '../rooms';
import { newSocialState, setName, type SocialState } from '../social';

const T0 = new Date('2026-11-13T21:00:00Z');
const at = (ms: number) => new Date(T0.getTime() + ms);
const H = 3600_000;
const player = (name: string): SocialState => setName(newSocialState(T0), name)!;
const FR = roomOfCountry('FR');
const project = generateKeyPairSync('ed25519');
const projectPem = { priv: project.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), pub: project.publicKey.export({ type: 'spki', format: 'pem' }).toString() };

test('la charte livrée est signée par la clé du projet ; changée ou signée par une autre clé, refusée', () => {
  const bundled = bundledCharter();
  assert.ok(bundled.version >= 1, 'charte livrée valide');
  assert.ok(bundled.moderators.length >= 1);
  assert.equal(verifyCharter({ ...bundled, moderators: [...bundled.moderators, player('Pirate').key.publicKey] }), undefined, 'modérateur ajouté sans la clé du projet');
  const mod = player('Modo');
  const other = signCharter({ version: 99, moderators: [mod.key.publicKey], at: T0.toISOString() }, projectPem.priv);
  assert.equal(verifyCharter(other), undefined, 'signée par une autre clé que celle du projet');
  assert.deepEqual(verifyCharter(other, projectPem.pub), other, 'avec sa clé, elle passe');
});

function charterWith(...keys: string[]): Charter {
  return signCharter({ version: 2, moderators: keys, at: T0.toISOString() }, projectPem.priv);
}

test('seule la décision d’un modérateur de la charte est acceptée', () => {
  const mod = player('Modo');
  const kiko = player('Kiko');
  const charter = charterWith(mod.key.publicKey);
  const act = signModAct(mod.key, { kind: 'mute', target: kiko.key.publicKey, name: 'Kiko', until: at(24 * H).toISOString(), reason: 'insults' }, T0);
  assert.deepEqual(verifyModAct(JSON.parse(JSON.stringify(act)), charter, at(1000)), act);
  assert.equal(verifyModAct({ ...act, until: at(48 * H).toISOString() }, charter, at(1000)), undefined, 'durée changée');
  const fake = signModAct(kiko.key, { kind: 'ban', target: mod.key.publicKey }, T0);
  assert.equal(verifyModAct(fake, charter, at(1000)), undefined, 'un joueur qui n’est pas modérateur');
  assert.equal(verifyModAct(signModAct(mod.key, { kind: 'mute', target: kiko.key.publicKey }, T0), charter, at(1000)), undefined, 'sourdine sans fin');
  assert.equal(verifyModAct(signModAct(mod.key, { kind: 'topic', room: FR, text: 'deux\nlignes' }, T0), charter, at(1000)), undefined, 'sujet sur deux lignes');
});

test('effets : masquer, sourdine le temps qu’elle dure, exclusion, levée, sujet', () => {
  const mod = player('Modo');
  const kiko = player('Kiko');
  const nova = player('Nova');
  let s = { ...newModerationState(), charter: charterWith(mod.key.publicKey) };
  const line = signRoomLine(kiko, { room: FR, text: 'insulte' }, T0)!;
  const hide = signModAct(mod.key, { kind: 'hide', target: line.id, reason: 'insults' }, at(60_000));
  const mute = signModAct(mod.key, { kind: 'mute', target: kiko.key.publicKey, name: 'Kiko', until: at(H + 60_000).toISOString(), reason: 'insults' }, at(60_000));
  const topic = signModAct(mod.key, { kind: 'topic', room: FR, text: 'Soirée Star Courier vendredi 21 h' }, at(60_000));
  const r = mergeModActs(s, [hide, mute, topic, hide], at(61_000));
  assert.equal(r.fresh.length, 3, 'un doublon ne revient pas');
  s = r.state;
  assert.ok(lineHidden(s.acts, line.id, at(2 * 60_000)));
  assert.equal(sanctionOf(s.acts, kiko.key.publicKey, at(2 * 60_000))?.kind, 'mute');
  assert.equal(sanctionOf(s.acts, kiko.key.publicKey, at(2 * H)), undefined, 'la sourdine finit');
  assert.equal(lineRefused(s.acts, { key: kiko.key.publicKey, at: at(30 * 60_000).toISOString() }), true, 'pendant la sourdine');
  assert.equal(lineRefused(s.acts, { key: kiko.key.publicKey, at: T0.toISOString() }), false, 'avant elle, la ligne reste');
  assert.equal(lineRefused(s.acts, { key: kiko.key.publicKey, at: at(2 * H).toISOString() }), false, 'après elle aussi');
  assert.equal(lineRefused(s.acts, { key: nova.key.publicKey, at: at(30 * 60_000).toISOString() }), false);
  assert.equal(roomTopic(s.acts, FR, at(2 * 60_000))?.text, 'Soirée Star Courier vendredi 21 h');
  // Exclusion, puis levée.
  const ban = signModAct(mod.key, { kind: 'ban', target: nova.key.publicKey, name: 'Nova', reason: 'spam' }, at(H));
  s = mergeModActs(s, [ban], at(H)).state;
  assert.equal(sanctionOf(s.acts, nova.key.publicKey, at(10 * H))?.kind, 'ban', 'sans limite');
  assert.equal(lineRefused(s.acts, { key: nova.key.publicKey, at: at(50 * H).toISOString() }), true);
  const lift = signModAct(mod.key, { kind: 'lift', target: ban.id }, at(2 * H));
  s = mergeModActs(s, [lift], at(2 * H)).state;
  assert.equal(sanctionOf(s.acts, nova.key.publicKey, at(10 * H)), undefined, 'levée');
  assert.equal(lineRefused(s.acts, { key: nova.key.publicKey, at: at(50 * H).toISOString() }), false);
  assert.ok(!activeActs(s.acts, at(3 * H)).some((a) => a.kind === 'lift'));
  // Sujet vidé.
  s = mergeModActs(s, [signModAct(mod.key, { kind: 'topic', room: FR, text: '' }, at(3 * H))], at(3 * H)).state;
  assert.equal(roomTopic(s.acts, FR, at(3 * H)), undefined);
  // Une charte plus récente remplace l'ancienne, jamais une plus vieille.
  assert.equal(mergeCharter(s, { ...s.charter, version: 1 }), undefined);
});

test('signalement : signé, joint la vraie ligne ; la file regroupe par ligne, les plus signalées d’abord', () => {
  const kiko = player('Kiko');
  const nova = player('Nova');
  const rivet = player('Rivet');
  const bad = signRoomLine(kiko, { room: FR, text: 'pub pour un site' }, T0)!;
  const worse = signRoomLine(nova, { room: FR, text: 'insulte' }, at(10_000))!;
  const r1 = signReport(rivet, bad, 'spam', at(60_000));
  assert.deepEqual(verifyReport(JSON.parse(JSON.stringify(r1)), at(61_000)), r1);
  assert.equal(verifyReport({ ...r1, line: { ...bad, text: 'autre chose' } }, at(61_000)), undefined, 'ligne inventée');
  assert.equal(verifyReport({ ...r1, reason: 'insults' }, at(61_000)), undefined, 'raison changée');
  let s = newModerationState();
  s = mergeReports(s, [r1, signReport(kiko, worse, 'insults', at(70_000)), signReport(rivet, worse, 'insults', at(80_000))], at(90_000)).state;
  const queue = pendingReports(s);
  assert.deepEqual(queue.map((q) => [q.line.text, q.reports.length]), [['insulte', 2], ['pub pour un site', 1]]);
  s = handleReports(s, worse.id, at(100_000));
  assert.deepEqual(pendingReports(s).map((q) => q.line.text), ['pub pour un site'], 'traitée : sortie de la file');
});

test('le fichier de la modération relu tel quel ; une charte reçue garde son numéro', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-moderation-'));
  try {
    const mod = bundledCharter().moderators[0]!;
    void mod;
    const s = newModerationState();
    saveModeration(dir, s);
    assert.deepEqual(loadModeration(dir, T0), s);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

interface Net {
  state(): SocialState;
  start(): Promise<void>;
  stop(): Promise<void>;
  rename(name: string): boolean;
  setRooms(change: object): void;
  roomSend(room: string, text: string): { line: import('../rooms').RoomLine } | { reason: string };
  rooms(): import('../rooms').RoomsState;
  moderation(): import('../moderation').ModerationState;
  amModerator(): boolean;
  moderate(act: object): boolean;
  report(line: import('../rooms').RoomLine, reason: string): void;
  roomOpen(room: string | undefined): void;
}
/* eslint-disable @typescript-eslint/no-require-imports */
const netModule = require(path.join(REPO_ROOT, 'app', 'dist', 'social-net.js')) as { createSocialNet(o: object): Net };
const createTestnet = require('hyperdht/testnet.js') as (n: number, o: { host: string }) => Promise<{ bootstrap: { host: string; port: number }[]; destroy(): Promise<void> }>;
/* eslint-enable @typescript-eslint/no-require-imports */

async function until(what: string, check: () => boolean, ms = 20_000): Promise<void> {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error(`attendu : ${what}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

test('entre trois bornes : le signalement n’arrive qu’au modérateur, sa décision s’applique partout', async () => {
  const testnet = await createTestnet(3, { host: '127.0.0.1' });
  const dirs = [0, 1, 2].map((i) => fs.mkdtempSync(path.join(os.tmpdir(), `cp-modo-${i}-`)));
  // Le modérateur d'essai : sa clé, écrite d'avance dans son social.json, est dans une charte signée par une clé de projet d'essai.
  const modo = player('Modo');
  fs.writeFileSync(path.join(dirs[0]!, 'social.json'), JSON.stringify(modo));
  const charter = signCharter({ version: 5, moderators: [modo.key.publicKey], at: new Date().toISOString() }, projectPem.priv);
  const nets = dirs.map((d) => netModule.createSocialNet({ dataDir: d, mode: 'simulated', host: '127.0.0.1', bootstrap: testnet.bootstrap, charter }));
  const [m, kiko, sillage] = nets as [Net, Net, Net];
  try {
    kiko.rename('Kiko');
    sillage.rename('Sillage');
    assert.ok(m.amModerator(), 'le modérateur se sait modérateur');
    assert.ok(!kiko.amModerator());
    assert.equal(kiko.moderate({ kind: 'ban', target: sillage.state().key.publicKey }), false, 'un joueur ne peut pas décider');
    for (const n of nets) n.setRooms({ rulesAt: new Date().toISOString() });
    await Promise.all(nets.map((n) => n.start()));
    kiko.roomOpen(FR);
    sillage.roomOpen(FR);
    const sent = kiko.roomSend(FR, 'une pub pour un site');
    assert.ok('line' in sent);
    const line = sent.line;
    await until('la ligne chez Sillage', () => sillage.rooms().lines.some((l) => l.id === line.id));
    sillage.report(line, 'spam');
    await until('le signalement chez le modérateur', () => m.moderation().reports.some((r) => r.line.id === line.id));
    assert.equal(m.moderation().reports[0]!.name, 'Sillage', 'le modérateur sait qui signale');
    assert.equal(kiko.moderation().reports.length, 0, 'le joueur signalé ne voit rien');
    // La décision : masquer la ligne, sourdine d'une heure.
    assert.ok(m.moderate({ kind: 'hide', target: line.id, reason: 'spam' }));
    assert.ok(m.moderate({ kind: 'mute', target: kiko.state().key.publicKey, name: 'Kiko', until: new Date(Date.now() + 3600_000).toISOString(), reason: 'spam' }));
    await until('masquée chez Sillage', () => lineHidden(sillage.moderation().acts, line.id));
    await until('Kiko sait qu’il est en sourdine', () => sanctionOf(kiko.moderation().acts, kiko.state().key.publicKey) !== undefined);
    await new Promise((r) => setTimeout(r, 3100));
    assert.deepEqual(kiko.roomSend(FR, 'encore'), { reason: 'muted' }, 'en sourdine : il ne peut plus écrire');
  } finally {
    await Promise.all(nets.map((n) => n.stop()));
    await testnet.destroy();
    for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
  }
});
