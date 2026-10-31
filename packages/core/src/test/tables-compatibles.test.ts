// Choix de la table d'une partie en direct d'après les tables des invités (retour du 31/10/2026 :
// l'invité apprenait seulement à l'invitation qu'il n'avait pas la même version). En tête les
// tables que chaque invité a dans la même version, au sens de matchLiveTable ; les autres restent
// visibles, grisées, avec qui bloque et pourquoi ; une borne qui ne dit pas ses versions est
// signalée, pas refusée. Le jugement d'avant l'invitation est celui de l'acceptation : un test le
// fixe pour toute combinaison. Puis les messages (la version des tables d'un ami, à sa demande)
// et le service (app/src/friend-content.ts, compilé) entre deux bornes d'un réseau en mémoire.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';
import {
  libraryMessages,
  liveChoiceDetail,
  liveFitLabel,
  liveFriendFit,
  liveTableChoices,
  matchLiveTable,
  parseLibraryMessage,
  scanTables,
  setLanguage,
  type FriendLibrary,
  type LibraryMessage,
  type LiveFriendTables,
  type LiveMineTable,
  type TableEntry,
  type TableIdentity,
} from '../index';

const P = (c: string) => c.repeat(64);
const id = (title: string, year = 1991): TableIdentity => ({ title, manufacturer: 'Williams', year });
const mine = (title: string, print: string | undefined, extra: Partial<LiveMineTable<string>> = {}): LiveMineTable<string> => ({ entry: title, title, identity: id(title), bytes: 1000 + title.length, ...(print ? { print } : {}), ...extra });

// Ici : quatre tables. Bruno : T2 à l'identique, Fish Tales dans une autre version, pas Medieval,
// et Addams Family sous un autre nom (le même .vpx). Émile : T2, Fish Tales et Medieval à l'identique.
const MINE = [mine('Terminator 2', P('a')), mine('Fish Tales', P('b')), mine('Medieval Madness', P('c')), mine('The Addams Family', P('d'))];
const BRUNO: LiveFriendTables = {
  key: 'bruno',
  name: 'Bruno',
  library: 'ready',
  tables: [
    { table: id('Terminator 2'), print: P('a') },
    { table: id('Fish Tales'), print: P('e') },
    // Le même fichier, nommé d'après VPS chez lui : reconnu à sa taille, puis à son empreinte.
    { table: { title: 'Addams Family, The', vpsId: 'xyz' }, bytes: MINE[3]!.bytes!, print: P('d') },
  ],
};
const EMILE: LiveFriendTables = { key: 'emile', name: 'Émile', library: 'ready', tables: ['Terminator 2', 'Fish Tales', 'Medieval Madness'].map((title, i) => ({ table: id(title), print: P('abc'[i]!) })) };

test('choix : en tête la même version chez tous, puis les indisponibles, une autre version avant une table absente', () => {
  setLanguage('fr');
  const choices = liveTableChoices(MINE, [BRUNO, EMILE]);
  assert.deepEqual(
    choices.map((c) => [c.entry, c.fit]),
    [
      ['Terminator 2', 'same'],
      ['Fish Tales', 'blocked'],
      ['Medieval Madness', 'blocked'],
      ['The Addams Family', 'blocked'],
    ],
  );
  // La raison nomme qui bloque, et seulement lui.
  assert.equal(liveChoiceDetail(choices[0]!), 'Même version chez Bruno, Émile');
  assert.equal(liveChoiceDetail(choices[1]!), 'Autre version chez Bruno');
  assert.equal(liveChoiceDetail(choices[2]!), 'Bruno n’a pas cette table');
  assert.equal(liveChoiceDetail(choices[3]!), 'Émile n’a pas cette table');
  // Avec Bruno seul : la table renommée chez lui est la même version, en tête.
  assert.deepEqual(liveTableChoices(MINE, [BRUNO]).filter((c) => c.fit === 'same').map((c) => c.entry), ['Terminator 2', 'The Addams Family']);
});

test('choix : une borne qui ne dit pas ses versions est signalée (« à vérifier »), pas refusée', () => {
  setLanguage('fr');
  const old: LiveFriendTables = { key: 'emile', name: 'Émile', library: 'old', tables: [{ table: id('Terminator 2') }] };
  const choices = liveTableChoices(MINE, [BRUNO, old]);
  assert.deepEqual(choices[0]!.fit, 'unknown', 'T2 : la même chez Bruno, inconnue chez Émile');
  assert.equal(liveChoiceDetail(choices[0]!), 'Bibliothèque de Émile inconnue (ancienne version de Cyber Pinball)');
  // Bruno bloque toujours là où il bloque.
  assert.equal(choices.find((c) => c.entry === 'Fish Tales')!.fit, 'blocked');
  for (const why of ['off', 'loading', 'offline'] as const) {
    const fit = liveFriendFit(MINE[0]!, { key: 'k', name: 'Bruno', library: why, tables: [] });
    assert.equal(fit.fit, 'unknown', why);
    assert.match(liveFitLabel(fit), /^Bibliothèque de Bruno/);
  }
  // Une empreinte encore en route (chez lui ou chez moi) : « en cours de vérification », jamais « autre version ».
  const pending: LiveFriendTables = { ...BRUNO, tables: [{ table: id('Fish Tales'), pending: true }] };
  assert.equal(liveFitLabel(liveFriendFit(MINE[1]!, pending)), 'Version de Bruno en cours de vérification…');
  assert.equal(liveFriendFit(mine('Fish Tales', undefined, { pending: true }), BRUNO).fit, 'unknown');
  // Mais une table qu'il n'a pas reste absente, même sa version en route ailleurs.
  assert.equal(liveFriendFit(MINE[2]!, pending).fit, 'missing');
});

test('choix : le même .vpx avec un autre script est une autre version, dite comme telle', () => {
  setLanguage('fr');
  const scripted: LiveFriendTables = { ...BRUNO, tables: [{ table: id('Terminator 2'), print: P('a'), script: P('f') }] };
  const fit = liveFriendFit(MINE[0]!, scripted);
  assert.deepEqual(fit, { key: 'bruno', name: 'Bruno', fit: 'other-version', scriptDiffers: true });
  assert.equal(liveFitLabel(fit), 'Même table, autre script chez Bruno');
});

test('invariant : le choix juge comme l’acceptation (matchLiveTable chez l’invité), pour toute combinaison', () => {
  const prints = [undefined, P('a'), P('b')];
  const scripts = [undefined, P('c')];
  const games = [id('Terminator 2'), id('Fish Tales'), { title: 'Autre nom', vpsId: 'v1' }];
  for (const myPrint of prints)
    for (const myScript of scripts)
      for (const game of games)
        for (const print of prints)
          for (const script of scripts)
            for (const sameBytes of [false, true]) {
              const me = mine('Terminator 2', myPrint, myScript ? { script: myScript } : {});
              const his = { table: game, ...(print ? { print } : {}), ...(script ? { script } : {}), ...(sameBytes ? { bytes: me.bytes! } : {}) };
              const fit = liveFriendFit(me, { key: 'b', name: 'Bruno', library: 'ready', tables: [his] }).fit;
              // À l'invitation, l'invité lit les tables du même jeu ou de la taille annoncée : la même chose.
              const candidate = matchLiveTable({ table: me.identity }, [{ entry: 0, identity: game }]).match !== 'missing' || sameBytes;
              const at = candidate ? matchLiveTable({ table: me.identity, ...(myPrint ? { print: myPrint } : {}), ...(myScript ? { script: myScript } : {}) }, [{ entry: 0, identity: game, ...(print ? { print } : {}), ...(script ? { script } : {}) }]).match : 'missing';
              assert.equal(fit, at, JSON.stringify({ myPrint, myScript, game, print, script, sameBytes }));
            }
});

test('messages : la bibliothèque annonce ses versions et la taille de ses .vpx ; la version d’une table se demande, vérifiée', () => {
  const library: FriendLibrary = { at: new Date().toISOString(), versions: true, tables: [{ id: '0123456789abcdef', table: id('Terminator 2'), bytes: 123_456, medias: [] }] };
  const [part] = libraryMessages(library);
  const back = parseLibraryMessage(JSON.parse(JSON.stringify(part)) as Record<string, unknown>) as Extract<LibraryMessage, { t: 'library' }>;
  assert.equal(back.versions, true);
  assert.equal(back.tables[0]!.bytes, 123_456);
  // Une borne d'avant : pas de `versions`, pas de taille.
  const old = parseLibraryMessage({ t: 'library', at: library.at, part: 0, parts: 1, tables: [{ id: '0123456789abcdef', table: id('Terminator 2'), medias: [] }] }) as Extract<LibraryMessage, { t: 'library' }>;
  assert.equal(old.versions, undefined);
  assert.equal(old.tables[0]!.bytes, undefined);
  for (const bytes of [-1, 0, 1.5, '12']) assert.equal((parseLibraryMessage({ ...back, tables: [{ ...back.tables[0], bytes }] }) as typeof back).tables[0]!.bytes, undefined, String(bytes));
  assert.deepEqual(parseLibraryMessage({ t: 'table-versions-get', tables: ['0123456789abcdef', '0123456789abcdef'] }), { t: 'table-versions-get', tables: ['0123456789abcdef'] });
  assert.equal(parseLibraryMessage({ t: 'table-versions-get', tables: ['../x'] }), undefined);
  assert.equal(parseLibraryMessage({ t: 'table-versions-get', tables: Array(201).fill('0123456789abcdef') }), undefined);
  assert.deepEqual(parseLibraryMessage({ t: 'table-versions', versions: [{ id: '0123456789abcdef', print: P('a'), script: 'pas une empreinte' }] }), { t: 'table-versions', versions: [{ id: '0123456789abcdef', print: P('a') }] });
  assert.equal(parseLibraryMessage({ t: 'table-versions', versions: [{ id: 'x' }] }), undefined);
});

// ---------------------------------------------------------------------------
// Service : deux bornes reliées en mémoire (les messages passent par le même contrôle que sur le réseau).

interface Content {
  library(key: string): { state: string; library?: FriendLibrary };
  tableVersions(key: string, ids: readonly string[]): Map<string, { id: string; print?: string; script?: string } | 'pending'>;
  stop(): void;
}
/* eslint-disable @typescript-eslint/no-require-imports */
const { createFriendContent } = require(path.join(REPO_ROOT, 'app', 'dist', 'friend-content.js')) as { createFriendContent(o: object): Content };
const { createTableVersions } = require(path.join(REPO_ROOT, 'app', 'dist', 'live-game.js')) as { createTableVersions(dataDir: string): { of(t: { file: string }): Promise<{ print?: string; script?: string }> } };
/* eslint-enable @typescript-eslint/no-require-imports */

type Listener = (key: string, m: LibraryMessage) => void;
function pair() {
  const ends = ['alice', 'bruno'].map((key) => ({ key, listeners: [] as Listener[], sent: [] as LibraryMessage[] }));
  const net = (i: number) => {
    const me = ends[i]!;
    const other = ends[1 - i]!;
    return {
      state: () => ({ key: { publicKey: me.key }, name: me.key, friends: [{ key: other.key, name: other.key }], shareLibrary: true }),
      online: () => true,
      send: (_key: string, m: LibraryMessage) => {
        me.sent.push(m);
        const parsed = parseLibraryMessage(JSON.parse(JSON.stringify(m)) as Record<string, unknown>);
        if (parsed) setImmediate(() => other.listeners.forEach((l) => l(me.key, parsed)));
        return true;
      },
      sendChunk: async () => true,
      onMessage: (l: Listener) => {
        me.listeners.push(l);
        return () => undefined;
      },
      onChunk: () => () => undefined,
    };
  };
  return { ends, net };
}

async function until(what: string, check: () => boolean, ms = 10_000): Promise<void> {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error(`attendu : ${what}`);
    await new Promise((r) => setTimeout(r, 20));
  }
}

test('service : la borne de l’ami donne la version de ses tables à la demande ; une borne d’avant ne l’annonce pas', async () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-tables-compatibles-'));
  const folder = path.join(base, 'tables', 'Terminator 2 (Williams 1991)');
  fs.mkdirSync(folder, { recursive: true });
  const vpx = path.join(folder, 'Terminator 2 (Williams 1991).vpx');
  fs.writeFileSync(vpx, Buffer.alloc(5000, 9));
  const [table] = scanTables(path.join(base, 'tables')) as [TableEntry];
  const { net } = pair();
  const versions = createTableVersions(path.join(base, 'bruno'));
  const bruno = createFriendContent({ net: net(1), dataDir: path.join(base, 'bruno'), tables: () => [table], root: () => base, contents: () => undefined, versionOf: (t: TableEntry) => versions.of(t) });
  const alice = createFriendContent({ net: net(0), dataDir: path.join(base, 'alice'), tables: () => [], root: () => base, contents: () => undefined });
  try {
    alice.library('bruno');
    await until('sa bibliothèque', () => alice.library('bruno').state === 'ready');
    const library = alice.library('bruno').library!;
    assert.equal(library.versions, true);
    assert.equal(library.tables[0]!.bytes, 5000);
    const tid = library.tables[0]!.id;
    assert.equal(alice.tableVersions('bruno', [tid]).get(tid), 'pending');
    await until('sa version', () => alice.tableVersions('bruno', [tid]).get(tid) !== 'pending');
    assert.deepEqual(alice.tableVersions('bruno', [tid]).get(tid), { id: tid, ...(await versions.of(table)) });
    assert.match((alice.tableVersions('bruno', [tid]).get(tid) as { print: string }).print, /^[0-9a-f]{64}$/);
    // Alice, sans versionOf (une borne d'avant) : sa bibliothèque ne promet pas de versions.
    bruno.library('alice');
    await until('la bibliothèque d’Alice', () => bruno.library('alice').state === 'ready');
    assert.equal(bruno.library('alice').library!.versions, undefined);
  } finally {
    alice.stop();
    bruno.stop();
  }
});
