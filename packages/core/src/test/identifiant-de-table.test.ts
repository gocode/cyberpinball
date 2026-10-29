// Identifiant de table et règles de score (29/10/2026) : jouer ensemble avec des versions
// différentes. Personne n'est refusé ; la même table (même .vpx ou même identifiant : objets et
// physique, sans images, sons ni script) et une version proche (mêmes règles de score : même ROM,
// ou même script hors options) sont classées ; une autre version joue hors classement.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { biff, biffStr, cfb, u32 } from './fixtures';
import { REPO_ROOT } from './i18n-scan';
import { liveRanked, liveStandings, matchLiveTable, parseLiveMessage, readVpxKeys, rulesKey, scriptRulesPrint, type LiveInvite, type LiveMessage, type LivePlayer, type LiveTable, type TableEntry, type TableIdentity } from '../index';

const SCRIPT = [
  "' Game of Thrones, options",
  'Option Explicit',
  'Const VRRoom = 0',
  "Dim LUTset : LUTset = 3 ' couleurs",
  'Public Const BallShadow = True',
  'Sub Table1_Init',
  '  AddScore 1000',
  'End Sub',
].join('\r\n');

/** Un .vpx d'essai : GameData (nom, script), des objets, une image, un son ; TableInfo. */
function vpx(opts: { script?: string; items?: string[]; image?: string; sound?: string; name?: string; locked?: boolean } = {}): Buffer {
  const text = Buffer.from(opts.script ?? SCRIPT, 'latin1');
  const secb = Buffer.alloc(52);
  secb.writeUInt32LE(0x00000002, 32);
  const gameData = Buffer.concat([...(opts.locked ? [biff('SECB', secb)] : []), biff('NAME', biffStr('Table1')), biff('CODE'), u32(text.length), text, biff('ENDB')]);
  const items = Object.fromEntries((opts.items ?? ['mur', 'flipper']).map((item, i) => [`GameItem${i}`, biff('NAME', biffStr(item))]));
  return cfb(
    { TableName: opts.name ?? 'Game of Thrones', TableSaveRev: String(Math.random()) },
    { GameData: gameData, ...items, Image0: Buffer.from(opts.image ?? 'image'), Sound0: Buffer.from(opts.sound ?? 'son'), Version: u32(1080), MAC: Buffer.from(String(Math.random())) },
  );
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-identifiant-'));
let n = 0;
const write = (data: Buffer) => {
  const file = path.join(dir, `t${n++}.vpx`);
  fs.writeFileSync(file, data);
  return file;
};

test('identifiant : le même pour un renommage, des images, des sons, une option du script ; un autre si un objet change', async () => {
  const base = await readVpxKeys(write(vpx()));
  assert.match(base.id!, /^[0-9a-f]{64}$/);
  assert.match(base.script!, /^[0-9a-f]{64}$/);
  const same = await readVpxKeys(write(vpx({ name: 'GoT LE', image: 'image 4K', sound: 'autre son', script: SCRIPT.replace('VRRoom = 0', 'VRRoom = 1').replace('LUTset = 3', 'LUTset = 7') })));
  assert.equal(same.id, base.id);
  assert.equal(same.script, base.script, 'options changées : mêmes règles');
  const rules = await readVpxKeys(write(vpx({ script: SCRIPT.replace('AddScore 1000', 'AddScore 5000') })));
  assert.equal(rules.id, base.id, 'le script ne fait pas l’identifiant');
  assert.notEqual(rules.script, base.script, 'une procédure changée : d’autres règles');
  const geometry = await readVpxKeys(write(vpx({ items: ['mur', 'flipper', 'rampe'] })));
  assert.notEqual(geometry.id, base.id);
  // Script protégé : l'identifiant, sans règles lisibles ; un fichier qui n'est pas un .vpx : rien.
  const locked = await readVpxKeys(write(vpx({ locked: true })));
  assert.ok(locked.id && !locked.script);
  assert.deepEqual(await readVpxKeys(write(Buffer.from('pas un vpx'))), {});
  assert.deepEqual(await readVpxKeys(path.join(dir, 'absent.vpx')), {});
});

test('règles du script : commentaires, casse, espaces et valeurs hors procédures ignorés', () => {
  const print = scriptRulesPrint(SCRIPT);
  assert.equal(scriptRulesPrint(SCRIPT.toUpperCase().replace(/ +/g, '   ').replace("' couleurs", "' colours")), print);
  assert.equal(scriptRulesPrint(SCRIPT.replace('Const VRRoom = 0', 'Const VRRoom = -1').replace('BallShadow = True', 'BallShadow = False')), print);
  assert.equal(scriptRulesPrint(`REM en tête\r\n${SCRIPT}`), print);
  assert.notEqual(scriptRulesPrint(SCRIPT.replace('AddScore 1000', 'AddScore 1001')), print, 'une valeur dans une procédure compte');
  assert.notEqual(scriptRulesPrint(SCRIPT.replace('Const VRRoom = 0', 'Const VRRoom = Table1.Width')), print, 'une expression n’est pas une option');
  assert.notEqual(scriptRulesPrint(`${SCRIPT}\r\nSub Drain_Hit : AddScore 10 : End Sub`), print);
  assert.equal(scriptRulesPrint('x = "a \' b"'), scriptRulesPrint('x = "autre"'), 'une apostrophe dans une chaîne n’ouvre pas de commentaire');
  assert.equal(rulesKey(['T2_L8', 't2_l8', ' '], 'f'.repeat(64)), 'rom:t2_l8');
  assert.equal(rulesKey(['b', 'a'], undefined), 'rom:a,b');
  assert.equal(rulesKey([], 'f'.repeat(64)), `vbs:${'f'.repeat(64)}`);
  assert.equal(rulesKey([], undefined), undefined);
});

const GOT: TableIdentity = { title: 'Game of Thrones LE', manufacturer: 'Stern', year: 2015 };
const A = 'a'.repeat(64), B = 'b'.repeat(64), C = 'c'.repeat(64);

test('trois niveaux : même table (fichier ou identifiant), version proche (règles), autre version ; jamais refusé faute de version', () => {
  const theirs: LiveTable = { table: GOT, print: A, id: B, rules: 'rom:got_l3' };
  const m = (mine: { print?: string; id?: string; rules?: string; identity?: TableIdentity }[]) => matchLiveTable(theirs, mine.map((x, i) => ({ entry: i, identity: x.identity ?? GOT, ...x }))).match;
  assert.equal(m([{ print: A }]), 'same');
  assert.equal(m([{ print: C, id: B, identity: { title: 'Autre nom' } }]), 'same', 'même identifiant, même renommée');
  assert.equal(m([{ print: C, id: C, rules: 'rom:got_l3' }]), 'same-rules');
  assert.equal(m([{ print: C, id: C, rules: 'rom:got_l2' }]), 'other-version');
  assert.equal(m([{ print: C, id: C, rules: 'rom:got_l3' }, { print: A }]), 'same', 'la même table d’abord');
  assert.equal(m([{}]), 'same', 'rien pour comparer (borne d’avant) : le même jeu passe pour la même table');
  assert.equal(m([{ identity: { title: 'Autre' }, print: C }]), 'missing');
});

test('classement : même table et version proche classées ; autre version hors classement, même avec un record', () => {
  const p = (name: string, match: LivePlayer['match'], score?: number): LivePlayer => ({ key: name, name, state: 'done', match, ...(score ? { records: [{ score, rank: 1 }] } : {}) });
  assert.ok(liveRanked({ host: true }) && liveRanked({ match: 'same' }) && liveRanked({ match: 'same-rules' }) && liveRanked({}));
  assert.ok(!liveRanked({ match: 'other-version' }));
  const order = liveStandings({ players: [p('autre', 'other-version', 9_000_000), p('sans', 'same'), p('proche', 'same-rules', 2_000_000), { ...p('hote', 'same', 1_000_000), host: true }] }).map((x) => x.name);
  assert.deepEqual(order, ['proche', 'hote', 'autre', 'sans']);
});

test('message : identifiant et règles voyagent avec l’invitation, vérifiés', () => {
  const table = (extra: object) => {
    const m = parseLiveMessage({ t: 'game-invite', game: { id: '0123456789abcdef', title: 'GoT', players: [], table: { table: GOT, ...extra } } }) as Extract<LiveMessage, { t: 'game-invite' }> | undefined;
    return m?.game.table;
  };
  assert.deepEqual(table({ id: B, rules: 'rom:got_l3,got_l4' }), { table: GOT, id: B, rules: 'rom:got_l3,got_l4' });
  assert.deepEqual(table({ rules: `vbs:${C}` })?.rules, `vbs:${C}`);
  for (const rules of ['rom:', 'rom:../x', 'vbs:123', 'autre:x', 42]) assert.equal(table({ rules })?.rules, undefined, String(rules));
  assert.equal(table({ id: 'court' })?.id, undefined);
  const answer = parseLiveMessage({ t: 'game-answer', game: '0123456789abcdef', answer: 'accept', match: 'same-rules' });
  assert.equal(answer?.t === 'game-answer' && answer.match, 'same-rules');
});

// ---------------------------------------------------------------------------
// Service (app/src/live-game.ts, compilé), sur de vrais .vpx d'essai.

/* eslint-disable @typescript-eslint/no-require-imports */
const { createLiveGames } = require(path.join(REPO_ROOT, 'app', 'dist', 'live-game.js')) as {
  createLiveGames(o: object): { create(table: TableEntry): Promise<{ table: LiveTable }>; matchFor(invite: LiveInvite): Promise<{ match: string; table?: TableEntry }>; stop(): void };
};
/* eslint-enable @typescript-eslint/no-require-imports */

const net = { state: () => ({ key: { publicKey: 'moi' }, name: 'Moi', friends: [] }), online: () => true, send: () => true, onMessage: () => () => undefined };

test('service : l’invitation porte identifiant et règles ; l’invité dit même table, version proche ou autre version', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-niveaux-'));
  const table = (name: string, data: Buffer) => {
    fs.mkdirSync(path.join(root, name), { recursive: true });
    const file = path.join(root, name, `${name}.vpx`);
    fs.writeFileSync(file, data);
    return { file, folder: path.join(root, name), title: 'Game of Thrones LE', manufacturer: 'Stern', year: 2015, info: {} } as unknown as TableEntry;
  };
  const host = table('hote', vpx());
  const lines: string[] = [];
  const games = createLiveGames({ net, dataDir: path.join(root, 'hote-data'), tables: () => [host], play: async () => undefined });
  const sent = (await games.create(host)).table;
  games.stop();
  assert.match(sent.id!, /^[0-9a-f]{64}$/);
  assert.match(sent.rules!, /^vbs:[0-9a-f]{64}$/);
  const invite: LiveInvite = { id: '0123456789abcdef', host: { key: 'hote', name: 'Bruno' }, table: sent, title: 'Game of Thrones LE (Stern 2015)', players: [], receivedAt: new Date().toISOString() };
  const guest = async (data: Buffer, romsOf?: () => string[], hostRules = sent.rules) => {
    const mine = table(`invite-${n++}`, data);
    const g = createLiveGames({ net, dataDir: path.join(root, `data-${n++}`), tables: () => [mine], romsOf, play: async () => undefined, log: (l: string) => lines.push(l) });
    try {
      return (await g.matchFor({ ...invite, table: { ...sent, rules: hostRules } })).match;
    } finally {
      g.stop();
    }
  };
  assert.equal(await guest(vpx({ image: 'textures 4K', script: SCRIPT.replace('VRRoom = 0', 'VRRoom = 1') })), 'same');
  assert.match(lines.at(-1)!, /: la même table, ici « Game of Thrones LE »/);
  assert.equal(await guest(vpx({ items: ['mur', 'flipper', 'rampe'], script: SCRIPT.replace('VRRoom = 0', 'VRRoom = 1') })), 'same-rules');
  assert.equal(await guest(vpx({ items: ['mur', 'flipper', 'rampe'], script: SCRIPT.replace('AddScore 1000', 'AddScore 5') })), 'other-version');
  assert.match(lines.at(-1)!, /: une autre version, hors classement/);
  // Une table à ROM : la ROM fait les règles, quel que soit le script autour.
  assert.equal(await guest(vpx({ items: ['autre'], script: 'Sub X : End Sub' }), () => ['got_l3'], 'rom:got_l3'), 'same-rules');
});
