// Services posés sur le réseau des amis (app/src/friend-content.ts, app/src/live-game.ts,
// compilés), entre deux bornes du même processus sur un réseau d'essai HyperDHT en 127.0.0.1 :
// la bibliothèque partagée (activée par défaut, seulement entre amis), le transfert d'un média
// vérifié à l'arrivée, celui d'une table entière partie par partie (jamais les sauvegardes ni un
// programme, la ROM seulement si on la prend), et une partie en direct de l'invitation aux résultats.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';
import { encodePng } from '../png';
import { scanTables, type TableEntry } from '../tables';
import { layoutOf } from '../locations';
import { tableContents } from '../tablecontents';
import { friendParts, type FriendLibrary, type LibraryMedia, type TableFile } from '../friendlibrary';
import type { LiveGame, LiveInvite, LiveRecord, LiveTableMatch } from '../livegame';
import type { SocialState } from '../social';

const APP_DIST = path.join(REPO_ROOT, 'app', 'dist');

interface Net {
  state(): SocialState;
  online(key: string): boolean;
  start(): Promise<void>;
  stop(): Promise<void>;
  rename(name: string): boolean;
  request(p: { key: string; name: string }): void;
  accept(key: string): void;
  setShareLibrary(on: boolean): void;
}
type LibraryState = { state: 'loading' } | { state: 'ready'; library: FriendLibrary } | { state: 'off' } | { state: 'offline' };
interface Content {
  library(key: string): LibraryState;
  refresh(key: string): void;
  fetch(key: string, tableId: string, medias: readonly LibraryMedia[]): Promise<{ received: { media: LibraryMedia; file: string }[]; failed: { reason: string }[] }>;
  tableFiles(key: string, tableId: string): Promise<TableFile[] | string>;
  fetchTable(key: string, tableId: string, folder: string, files: readonly TableFile[]): Promise<{ dir: string; received: TableFile[]; failed: { reason: string }[] }>;
  stop(): void;
}
interface Games {
  current(): LiveGame | undefined;
  invites(): LiveInvite[];
  create(table: TableEntry): Promise<LiveGame>;
  invite(key: string, name: string): boolean;
  accept(id: string): Promise<{ match: LiveTableMatch; table?: TableEntry }>;
  start(): boolean;
  stop(): void;
}
/* eslint-disable @typescript-eslint/no-require-imports */
const netModule = require(path.join(APP_DIST, 'social-net.js')) as { createSocialNet(o: object): Net };
const contentModule = require(path.join(APP_DIST, 'friend-content.js')) as { createFriendContent(o: object): Content };
const gamesModule = require(path.join(APP_DIST, 'live-game.js')) as { createLiveGames(o: object): Games };
const createTestnet = require(path.join(REPO_ROOT, 'node_modules', 'hyperdht', 'testnet.js')) as (n: number, o: { host: string }) => Promise<{ bootstrap: { host: string; port: number }[]; destroy(): Promise<void> }>;
/* eslint-enable @typescript-eslint/no-require-imports */

async function until(what: string, check: () => boolean, ms = 15_000): Promise<void> {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error(`attendu : ${what}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

/** Une borne : son dossier de données, une racine avec une table (même .vpx partout), et ses médias. */
function cabinet(name: string, bootstrap: { host: string; port: number }[], medias: boolean) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), `cp-amis-${name}-`));
  const root = path.join(base, 'borne');
  const folder = path.join(layoutOf(root).tables, 'Terminator 2 (Williams 1991)');
  fs.mkdirSync(path.join(folder, 'medias'), { recursive: true });
  fs.writeFileSync(path.join(folder, 'Terminator 2 (Williams 1991).vpx'), Buffer.alloc(300_000, 7));
  if (medias) {
    const img = { width: 64, height: 64, data: Buffer.alloc(64 * 64 * 4, 200) };
    fs.writeFileSync(path.join(folder, 'medias', '(Wheel) Terminator 2 (Williams 1991).png'), encodePng(img));
    // Une vidéo de plusieurs morceaux (plus de 64 Kio) : l'en-tête MP4 suffit au contrôle des premiers octets.
    const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom'), Buffer.alloc(12), Buffer.alloc(400_000, 3)]);
    fs.writeFileSync(path.join(folder, 'medias', '(Backglass) Terminator 2 (Williams 1991).mp4'), mp4);
    // Les autres parties de la table, et ce qui ne doit jamais partir : sauvegardes, records, programme.
    fs.writeFileSync(path.join(folder, 'Terminator 2 (Williams 1991).directb2s'), '<B2SBackglassData />');
    fs.mkdirSync(path.join(folder, 'pinmame', 'roms'), { recursive: true });
    fs.writeFileSync(path.join(folder, 'pinmame', 'roms', 't2_l8.zip'), Buffer.alloc(2000, 1));
    fs.mkdirSync(path.join(folder, 'pinmame', 'nvram'), { recursive: true });
    fs.writeFileSync(path.join(folder, 'pinmame', 'nvram', 't2_l8.nv'), 'records');
    fs.mkdirSync(path.join(folder, 'pupvideos', 't2_l8', 'Backglass'), { recursive: true });
    fs.writeFileSync(path.join(folder, 'pupvideos', 't2_l8', 'screens.pup'), 'ScreenNum,ScreenDes');
    fs.writeFileSync(path.join(folder, 'pupvideos', 't2_l8', 'Backglass', 'intro.mp4'), mp4);
    fs.mkdirSync(path.join(folder, 'user'), { recursive: true });
    fs.writeFileSync(path.join(folder, 'user', 'VPReg.stg'), 'scores');
    fs.writeFileSync(path.join(folder, 'outil.exe'), 'MZ');
  }
  const dataDir = path.join(base, 'donnees');
  const net = netModule.createSocialNet({ dataDir, mode: 'simulated', host: '127.0.0.1', bootstrap });
  assert.equal(net.rename(name), true);
  const tables = () => scanTables(layoutOf(root).tables);
  const content = contentModule.createFriendContent({
    net,
    dataDir,
    tables,
    root: () => root,
    contents: (table: TableEntry) => tableContents(table.file, { ownFolder: true, romLibrary: layoutOf(root).roms, script: { usesPinmame: true, roms: ['t2_l8'] } }),
  });
  const plays: string[] = [];
  const games = gamesModule.createLiveGames({
    net,
    dataDir,
    tables,
    busy: () => false,
    play: async (table: TableEntry, playing: () => void): Promise<{ ok: boolean; seconds: number; records: LiveRecord[] }> => {
      plays.push(table.title);
      playing();
      await new Promise((r) => setTimeout(r, 100));
      return { ok: true, seconds: name === 'Alice' ? 312 : 205, records: name === 'Alice' ? [{ score: 41_250_000, rank: 2, initials: 'ALI' }] : [] };
    },
  });
  return { net, content, games, tables, plays, dataDir, folder };
}

const keyOf = (n: Net) => n.state().key.publicKey;

test('bibliothèque partagée et partie en direct entre deux amis', async () => {
  const testnet = await createTestnet(3, { host: '127.0.0.1' });
  const a = cabinet('Alice', testnet.bootstrap, false);
  const b = cabinet('Bruno', testnet.bootstrap, true);
  try {
    await Promise.all([a.net.start(), b.net.start()]);
    await until('Bruno dans l’annuaire', () => a.net.state().directory.some((d) => d.profile.name === 'Bruno'));

    // Pas encore amis : rien ne passe, ni bibliothèque ni invitation.
    assert.equal(a.content.library(keyOf(b.net)).state, 'offline');
    a.net.request({ key: keyOf(b.net), name: 'Bruno' });
    await until('demande reçue', () => b.net.state().incoming.length === 1);
    b.net.accept(keyOf(a.net));
    await until('amis', () => a.net.state().friends.length === 1 && a.net.online(keyOf(b.net)));

    // Partagée par défaut entre amis ; coupée par Bruno : « off ».
    assert.equal(b.net.state().shareLibrary, true);
    b.net.setShareLibrary(false);
    assert.equal(a.content.library(keyOf(b.net)).state, 'loading');
    await until('bibliothèque refusée', () => a.content.library(keyOf(b.net)).state === 'off');

    // Partagée de nouveau : la liste des tables et leurs médias, sans aucun chemin.
    b.net.setShareLibrary(true);
    a.content.refresh(keyOf(b.net));
    await until('bibliothèque reçue', () => a.content.library(keyOf(b.net)).state === 'ready');
    const lib = (a.content.library(keyOf(b.net)) as { library: FriendLibrary }).library;
    assert.equal(lib.tables.length, 1);
    assert.equal(lib.tables[0]!.table.title, 'Terminator 2');
    assert.deepEqual(lib.tables[0]!.medias.map((m) => m.type).sort(), ['Backglass', 'Wheel']);
    assert.ok(!JSON.stringify(lib).includes(path.sep === '\\' ? 'borne\\\\tables' : 'borne/tables'), 'aucun chemin de la borne');

    // Les médias : reçus, vérifiés, identiques à l'octet près.
    const got = await a.content.fetch(keyOf(b.net), lib.tables[0]!.id, lib.tables[0]!.medias);
    assert.deepEqual(got.failed, []);
    assert.equal(got.received.length, 2);
    const original = path.join(b.tables()[0]!.folder, 'medias', '(Backglass) Terminator 2 (Williams 1991).mp4');
    const video = got.received.find((r) => r.media.type === 'Backglass')!;
    assert.equal(createHash('sha256').update(fs.readFileSync(video.file)).digest('hex'), createHash('sha256').update(fs.readFileSync(original)).digest('hex'));
    assert.ok(video.file.startsWith(path.join(a.dataDir, 'amis', 'recus')));

    // Un identifiant inconnu : refusé, rien n'est écrit.
    const forged = await a.content.fetch(keyOf(b.net), lib.tables[0]!.id, [{ ...lib.tables[0]!.medias[0]!, id: '0123456789abcdef' }]);
    assert.deepEqual(forged.failed.map((f) => f.reason), ['not-found']);

    // Toute la table, partie par partie : ni sauvegardes, ni records, ni programme.
    const files = await a.content.tableFiles(keyOf(b.net), lib.tables[0]!.id);
    assert.ok(Array.isArray(files), `fichiers de la table : ${String(files)}`);
    const list = files as TableFile[];
    assert.deepEqual(friendParts(list).map((p) => p.part), ['table', 'b2s', 'rom', 'pup', 'media']);
    assert.ok(!list.some((f) => /nvram|VPReg|\.exe$/i.test(f.rel)), 'jamais les sauvegardes, les records ni un programme');
    // La ROM laissée de côté (décochée d'office), le reste pris.
    const taken = list.filter((f) => f.part !== 'rom');
    const table = await a.content.fetchTable(keyOf(b.net), lib.tables[0]!.id, 'Terminator 2 (Williams 1991)', taken);
    assert.deepEqual(table.failed, []);
    assert.equal(table.received.length, taken.length);
    assert.equal(path.basename(table.dir), 'Terminator 2 (Williams 1991)');
    assert.ok(table.dir.startsWith(path.join(a.dataDir, 'amis', 'tables')));
    const sha = (f: string) => createHash('sha256').update(fs.readFileSync(f)).digest('hex');
    assert.equal(sha(path.join(table.dir, 'Terminator 2 (Williams 1991).vpx')), sha(path.join(b.folder, 'Terminator 2 (Williams 1991).vpx')));
    assert.equal(sha(path.join(table.dir, 'pupvideos', 't2_l8', 'Backglass', 'intro.mp4')), sha(path.join(b.folder, 'pupvideos', 't2_l8', 'Backglass', 'intro.mp4')));
    assert.ok(!fs.existsSync(path.join(table.dir, 'pinmame', 'roms', 't2_l8.zip')), 'la ROM pas prise n’est pas venue');
    // Un chemin piégé, même annoncé par un ami, n'écrit rien hors du dossier de la table.
    const trap = await a.content.fetchTable(keyOf(b.net), lib.tables[0]!.id, 'Piège', [{ ...taken[0]!, rel: '../../evil.vpx' }]);
    assert.deepEqual(trap.received, []);
    assert.ok(!fs.existsSync(path.join(path.dirname(path.dirname(trap.dir)), 'evil.vpx')));

    // Partie en direct : Alice invite Bruno sur la table qu'ils ont tous les deux.
    await a.games.create(a.tables()[0]!);
    assert.equal(a.games.invite(keyOf(b.net), 'Bruno'), true);
    await until('invitation reçue', () => b.games.invites().length === 1);
    const answer = await b.games.accept(b.games.invites()[0]!.id);
    assert.equal(answer.match, 'same');
    await until('Bruno prêt chez Alice', () => a.games.current()!.players.some((p) => p.key === keyOf(b.net) && p.state === 'accepted'));
    assert.equal(a.games.start(), true);
    await until('compte à rebours chez Bruno', () => b.games.current()?.phase === 'countdown');
    // Départ commun (5 s), parties jouées, résultats des deux côtés.
    await until('partie finie chez Alice', () => a.games.current()?.phase === 'finished', 20_000);
    await until('résultats chez Bruno', () => b.games.current()?.phase === 'finished');
    assert.deepEqual([a.plays, b.plays], [['Terminator 2'], ['Terminator 2']]);
    const alice = b.games.current()!.players.find((p) => p.key === keyOf(a.net))!;
    assert.equal(alice.state, 'done');
    assert.equal(alice.records?.[0]?.score, 41_250_000);
  } finally {
    a.content.stop();
    b.content.stop();
    a.games.stop();
    b.games.stop();
    await Promise.all([a.net.stop(), b.net.stop()]);
    await testnet.destroy();
  }
});
