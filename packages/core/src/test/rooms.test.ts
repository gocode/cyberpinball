// Salons par pays (rooms.ts) : la ligne est signée et refusée si on la change, trop vieille, du futur ou
// sur plusieurs lignes ; un doublon ne revient pas ; les limites d'envoi (3 s, 20 en 10 min) arrêtent
// l'excès ; l'historique donne les 100 dernières lignes des 24 h ; mentions, filtre de mots, ménage,
// fichier relu ; présents signés et frais cinq minutes.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';
import {
  cannotWrite,
  cleanRoomText,
  isRoomId,
  loadRooms,
  maskWords,
  mentions,
  mergeRoomLines,
  newRoomsState,
  roomBacklog,
  roomCountry,
  roomLines,
  roomOfCountry,
  ROOM_HERE_FRESH_MS,
  ROOM_KEEP_DAYS,
  ROOM_LINES_MAX,
  saveRooms,
  signRoomHere,
  signRoomLine,
  verifyRoomHere,
  verifyRoomLine,
  WORLD_ROOM,
  type RoomLine,
  type RoomsState,
} from '../rooms';
import { newSocialState, setName, type SocialState } from '../social';

const T0 = new Date('2026-11-13T20:00:00Z');
const at = (ms: number) => new Date(T0.getTime() + ms);
const player = (name: string): SocialState => setName(newSocialState(T0), name)!;
const FR = roomOfCountry('FR');

test('salons : identifiants, pays', () => {
  assert.equal(FR, 'pays-FR');
  assert.ok(isRoomId(FR) && isRoomId(WORLD_ROOM));
  assert.ok(!isRoomId('pays-fr') && !isRoomId('pays-FRA') && !isRoomId('../x'));
  assert.equal(roomCountry(FR), 'FR');
  assert.equal(roomCountry(WORLD_ROOM), undefined);
});

test('une ligne signée : changée, trop vieille, du futur ou sur plusieurs lignes, elle est refusée', () => {
  const kiko = player('Kiko');
  const l = signRoomLine(kiko, { room: FR, text: 'qui veut faire une partie ?', country: 'FR' }, T0)!;
  assert.deepEqual(verifyRoomLine(JSON.parse(JSON.stringify(l)), at(1000)), l);
  assert.equal(verifyRoomLine({ ...l, text: 'autre chose' }, at(1000)), undefined, 'texte changé');
  assert.equal(verifyRoomLine({ ...l, room: WORLD_ROOM }, at(1000)), undefined, 'salon changé');
  assert.equal(verifyRoomLine({ ...l, me: true }, at(1000)), undefined, 'action ajoutée');
  assert.equal(verifyRoomLine(l, at(ROOM_KEEP_DAYS * 86_400_000 + 1000)), undefined, 'trop vieille');
  assert.equal(verifyRoomLine(signRoomLine(kiko, { room: FR, text: 'x' }, at(5 * 60_000)), T0), undefined, 'du futur');
  assert.equal(verifyRoomLine({ ...l, text: 'deux\nlignes' }, at(1000)), undefined, 'retour à la ligne');
  assert.equal(signRoomLine(kiko, { room: FR, text: '   ' }, T0), undefined, 'vide');
  assert.equal(signRoomLine(kiko, { room: FR, text: 'x'.repeat(301) }, T0), undefined, 'trop longue');
  assert.equal(cleanRoomText('  une\nligne\tet  demie '), 'une ligne et demie');
  const action = signRoomLine(kiko, { room: FR, text: 'lance Comet Chaser', me: true }, T0)!;
  assert.equal(verifyRoomLine(action, at(1))?.me, true);
});

test('fusion : un doublon ne revient pas, les limites arrêtent l’excès', () => {
  const kiko = player('Kiko');
  const nova = player('Nova');
  let s = newRoomsState();
  const a = signRoomLine(kiko, { room: FR, text: 'un' }, T0)!;
  let r = mergeRoomLines(s, [a], T0);
  assert.deepEqual(r.fresh, [a]);
  s = r.state;
  assert.deepEqual(mergeRoomLines(s, [a], T0).fresh, [], 'déjà connue : pas de relais');
  // Une seconde plus tard : trop tôt (3 s) ; un autre joueur passe.
  const tooSoon = signRoomLine(kiko, { room: FR, text: 'deux' }, at(1000))!;
  const other = signRoomLine(nova, { room: FR, text: 'salut' }, at(1000))!;
  r = mergeRoomLines(s, [tooSoon, other], at(1000));
  assert.deepEqual(r.fresh.map((l) => l.text), ['salut']);
  s = r.state;
  // Vingt lignes en dix minutes au plus.
  let n = 1;
  for (let i = 1; i < 30; i++) {
    const l = signRoomLine(kiko, { room: FR, text: `ligne ${i}` }, at(i * 5000))!;
    const m = mergeRoomLines(s, [l], at(i * 5000));
    n += m.fresh.length;
    s = m.state;
  }
  assert.equal(n, 20, 'vingt en dix minutes');
  // Le salon Monde a ses propres limites.
  assert.equal(mergeRoomLines(s, [signRoomLine(kiko, { room: WORLD_ROOM, text: 'hello' }, at(146_000))!], at(146_000)).fresh.length, 1);
  assert.equal(cannotWrite(s, kiko.key.publicKey, FR, at(146_000)), 'rules', 'les règles d’abord');
  assert.equal(cannotWrite({ ...s, rulesAt: T0.toISOString() }, kiko.key.publicKey, FR, at(146_000)), 'burst');
  assert.equal(cannotWrite({ ...s, rulesAt: T0.toISOString() }, nova.key.publicKey, FR, at(146_000)), undefined);
  assert.equal(cannotWrite({ ...s, enabled: false }, nova.key.publicKey, FR, at(146_000)), 'disabled');
});

test('historique : les 100 dernières lignes des 24 h ; ménage à 300 par salon et 7 jours', () => {
  const people = Array.from({ length: 40 }, (_, i) => player(`Joueur ${i}`));
  let s = newRoomsState();
  const lines: RoomLine[] = [];
  for (let i = 0; i < 400; i++) lines.push(signRoomLine(people[i % 40]!, { room: FR, text: `n° ${i}` }, at(-30 * 3600_000 + i * 6 * 60_000))!);
  s = mergeRoomLines(s, lines, at(10 * 3600_000)).state;
  assert.equal(roomLines(s, FR).length, ROOM_LINES_MAX);
  const back = roomBacklog(s, FR, undefined, at(10 * 3600_000));
  assert.equal(back.length, 100);
  assert.equal(back.at(-1)!.text, 'n° 399');
  assert.ok(back.every((l) => Date.parse(l.at) > at(-14 * 3600_000).getTime()), 'rien d’avant les 24 h');
  assert.deepEqual(roomBacklog(s, FR, back.at(-2)!.at, at(10 * 3600_000)).map((l) => l.text), ['n° 399'], 'seulement après « since »');
  assert.deepEqual(roomBacklog(s, WORLD_ROOM, undefined, at(10 * 3600_000)), []);
});

test('mentions et filtre de mots', () => {
  assert.ok(mentions('@Sillage tu viens ?', 'Sillage'));
  assert.ok(mentions('tu viens @sillage', 'Sillage'), 'sans la casse');
  assert.ok(mentions('@Lune Rouge, ta partie ?', 'Lune Rouge'));
  assert.ok(!mentions('@Sillages tu viens', 'Sillage'), 'mot entier');
  assert.ok(!mentions('Sillage tu viens', 'Sillage'), 'sans @');
  assert.ok(mentions('salut @Émile !', 'Emile'), 'sans les accents');
  assert.equal(maskWords('quel con ce flipper'), 'quel *** ce flipper');
  assert.equal(maskWords('Ta gueule, enculé'), '** ******, ******');
  assert.equal(maskWords('les contrôleurs et la console'), 'les contrôleurs et la console', 'mot entier seulement');
  assert.equal(maskWords('What the FUCK'), 'What the ****');
});

test('le fichier des salons relu tel quel ; le vieux s’efface', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-salons-'));
  try {
    const kiko = player('Kiko');
    let s: RoomsState = { ...newRoomsState(), rulesAt: T0.toISOString(), ignored: [player('Zed').key.publicKey], defaultRoom: WORLD_ROOM, filter: false };
    s = mergeRoomLines(s, [signRoomLine(kiko, { room: FR, text: 'récent' }, T0)!, signRoomLine(kiko, { room: WORLD_ROOM, text: 'vieux' }, at(-6 * 86_400_000))!], T0).state;
    saveRooms(dir, s);
    assert.deepEqual(loadRooms(dir, T0), s);
    // Deux jours plus tard, la ligne de Monde a plus de 7 jours.
    assert.deepEqual(loadRooms(dir, at(2 * 86_400_000)).lines.map((l) => l.text), ['récent']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('présents : un signal signé, frais cinq minutes', () => {
  const kiko = player('Kiko');
  const h = signRoomHere(kiko, FR, 'FR', T0);
  assert.deepEqual(verifyRoomHere(JSON.parse(JSON.stringify(h)), at(1000)), h);
  assert.equal(verifyRoomHere({ ...h, room: WORLD_ROOM }, at(1000)), undefined);
  assert.equal(verifyRoomHere(h, at(ROOM_HERE_FRESH_MS + 1000)), undefined);
});

interface Net {
  state(): SocialState;
  start(): Promise<void>;
  stop(): Promise<void>;
  rename(name: string): boolean;
  setCountry(code: string | undefined): void;
  rooms(): RoomsState;
  roomSend(room: string, text: string, action?: boolean): { line: RoomLine } | { reason: string };
  roomOpen(room: string | undefined): void;
  roomPresent(room: string): { key: string; name: string }[];
  setRooms(change: Partial<RoomsState>): void;
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

test('entre deux bornes qui ne sont pas amies : la ligne arrive, l’historique est donné à qui entre, les présents se voient', async () => {
  const testnet = await createTestnet(3, { host: '127.0.0.1' });
  const dirs = [0, 1].map((i) => fs.mkdtempSync(path.join(os.tmpdir(), `cp-salon-${i}-`)));
  const a = netModule.createSocialNet({ dataDir: dirs[0], mode: 'simulated', host: '127.0.0.1', bootstrap: testnet.bootstrap });
  const b = netModule.createSocialNet({ dataDir: dirs[1], mode: 'simulated', host: '127.0.0.1', bootstrap: testnet.bootstrap });
  try {
    a.rename('Kiko');
    a.setCountry('FR');
    b.rename('Sillage');
    // Sans les règles acceptées, on ne peut pas écrire.
    assert.deepEqual(a.roomSend(FR, 'bonjour'), { reason: 'rules' });
    a.setRooms({ rulesAt: new Date().toISOString() });
    // Écrite avant que Sillage soit là : elle lui viendra par l'historique.
    const first = a.roomSend(FR, 'qui veut faire une partie ?');
    assert.ok('line' in first);
    assert.deepEqual(a.roomSend(FR, 'trop tôt'), { reason: 'gap' }, 'trois secondes entre deux lignes');
    await Promise.all([a.start(), b.start()]);
    a.roomOpen(FR);
    b.roomOpen(FR);
    await until('historique reçu par Sillage', () => roomLines(b.rooms(), FR).some((l) => l.text === 'qui veut faire une partie ?'));
    await until('Kiko présent chez Sillage', () => b.roomPresent(FR).some((h) => h.name === 'Kiko'));
    assert.ok(b.roomPresent(FR).some((h) => h.name === 'Sillage'), 'soi compris');
    // Une ligne écrite maintenant arrive tout de suite.
    b.setRooms({ rulesAt: new Date().toISOString() });
    assert.ok('line' in b.roomSend(FR, '@Kiko j’arrive'));
    await until('ligne de Sillage chez Kiko', () => roomLines(a.rooms(), FR).some((l) => l.text === '@Kiko j’arrive' && l.name === 'Sillage'));
    // Sillage quitte le salon : il n'en demande plus l'historique, il reçoit quand même les lignes (relais).
    b.roomOpen(undefined);
  } finally {
    await Promise.all([a.stop(), b.stop()]);
    await testnet.destroy();
    for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
  }
});
