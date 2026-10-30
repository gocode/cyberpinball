// La même version pour tous (30/10/2026) : une partie entre amis se joue sur le même .vpx et le même
// script joué, obligatoirement, pour un score sur lequel se défier (et plus tard des tournois).
// Le .vbs que Cyber Pinball pose lui-même (réparations PuP) ne compte pas ; un .vbs venu
// d'ailleurs, si. Sans la même version, pas d'« Accepter » : « Récupérer sa version chez … ».

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { vpxWithScript } from './fixtures';
import { REPO_ROOT } from './i18n-scan';
import { answerGame, buildScriptPatch, livePlayerStateLabel, matchLiveTable, newLiveGame, parseLiveMessage, type LiveInvite, type LiveMessage, type LiveTable, type TableEntry, type TableIdentity } from '../index';

const T2: TableIdentity = { title: 'Terminator 2', manufacturer: 'Williams', year: 1991 };
const A = 'a'.repeat(64), B = 'b'.repeat(64), S = 'c'.repeat(64);

test('même version : même .vpx et même script joué ; sinon une autre version, jamais acceptée', () => {
  const m = (theirs: Partial<LiveTable>, mine: { print?: string; script?: string; identity?: TableIdentity }[]) =>
    matchLiveTable({ table: T2, ...theirs }, mine.map((x, i) => ({ entry: i, identity: x.identity ?? T2, ...x })));
  assert.deepEqual(m({ print: A }, [{ print: A }]), { match: 'same', entry: 0 });
  assert.deepEqual(m({ print: A }, [{ print: A, script: S }]), { match: 'other-version', entry: 0, scriptDiffers: true }, 'mon .vbs remplace le script');
  assert.deepEqual(m({ print: A, script: S }, [{ print: A }]), { match: 'other-version', entry: 0, scriptDiffers: true }, 'son .vbs remplace le script');
  assert.deepEqual(m({ print: A, script: S }, [{ print: A, script: S }]), { match: 'same', entry: 0 }, 'le même .vbs des deux côtés');
  assert.deepEqual(m({ print: A }, [{ print: B }]), { match: 'other-version', entry: 0 });
  assert.deepEqual(m({}, [{ print: A }]), { match: 'other-version', entry: 0 }, 'sans empreinte, rien ne prouve la même version');
  assert.deepEqual(m({ print: A }, [{ print: B, identity: { title: 'Autre' } }]), { match: 'missing' });
  assert.deepEqual(m({ print: A }, [{ print: B }, { print: A, identity: { title: 'Autre nom' } }]), { match: 'same', entry: 1 }, 'le même fichier d’abord, quel que soit son nom');
});

test('réponse : accepter avec une autre version compte comme un refus ; le salon dit pourquoi', () => {
  let game = newLiveGame({ key: 'hote', name: 'Alice' }, { table: T2, print: A }, 'T2');
  game = { ...game, players: [...game.players, { key: 'bruno', name: 'Bruno', state: 'invited' }, { key: 'chloe', name: 'Chloé', state: 'invited' }] };
  game = answerGame(game, 'bruno', 'accept', 'other-version');
  game = answerGame(game, 'chloe', 'accept', 'same');
  assert.equal(game.players[1]!.state, 'declined', 'une borne d’avant le 30/10/2026 acceptait une autre version');
  assert.equal(livePlayerStateLabel(game.players[1]!), 'N’a pas la même version : il peut récupérer la vôtre');
  assert.equal(game.players[2]!.state, 'accepted');
  // Le script voyage avec l'invitation ; « version proche » n'existe plus.
  const invite = parseLiveMessage({ t: 'game-invite', game: { id: '0123456789abcdef', title: 'T2', players: [], table: { table: T2, print: A, script: S, id: B, rules: 'rom:t2_l8' } } }) as Extract<LiveMessage, { t: 'game-invite' }>;
  assert.deepEqual(invite.game.table, { table: T2, print: A, script: S });
  assert.equal((parseLiveMessage({ t: 'game-answer', game: '0123456789abcdef', answer: 'accept', match: 'same-rules' }) as { match?: string }).match, undefined);
});

// ---------------------------------------------------------------------------
// Service (app/src/live-game.ts, compilé), sur de vrais .vpx d'essai et leur .vbs.

/* eslint-disable @typescript-eslint/no-require-imports */
const { createLiveGames } = require(path.join(REPO_ROOT, 'app', 'dist', 'live-game.js')) as {
  createLiveGames(o: object): { create(table: TableEntry): Promise<{ table: LiveTable }>; accept(id: string): Promise<{ match: string; scriptDiffers?: boolean }>; stop(): void };
};
/* eslint-enable @typescript-eslint/no-require-imports */

const SCRIPT = 'Option Explicit\r\nConst usePUP = False\r\nSub Table1_Init : End Sub\r\n';

test('service : le .vbs de Cyber Pinball ne compte pas ; un .vbs venu d’ailleurs, si ; l’invité refuse et dit pourquoi', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-meme-version-'));
  const vpx = vpxWithScript(SCRIPT);
  let n = 0;
  const table = (vbs?: string) => {
    const folder = path.join(root, `t${n++}`);
    fs.mkdirSync(folder);
    const file = path.join(folder, 'Terminator 2 (Williams 1991).vpx');
    fs.writeFileSync(file, vpx);
    if (vbs !== undefined) fs.writeFileSync(path.join(folder, 'Terminator 2 (Williams 1991).vbs'), vbs, 'latin1');
    return { file, folder, title: 'Terminator 2', manufacturer: 'Williams', year: 1991, info: {} } as unknown as TableEntry;
  };
  const ours = buildScriptPatch(SCRIPT, [])!;
  const foreign = `${SCRIPT}' modifié à la main : 5 billes\r\n`;
  const invitation = async (hostVbs: string | undefined, guestVbs: string | undefined) => {
    const hostTable = table(hostVbs);
    const net = (key: string, out: LiveMessage[], deliver?: (cb: (k: string, m: unknown) => void) => void) => ({
      state: () => ({ key: { publicKey: key }, name: key, friends: [{ key: 'hote', name: 'Alice' }] }),
      online: () => true,
      send: (_k: string, m: LiveMessage) => (out.push(m), true),
      onMessage: (cb: (k: string, m: unknown) => void) => (deliver?.(cb), () => undefined),
    });
    const host = createLiveGames({ net: net('hote', []), dataDir: path.join(root, `h${n++}`), tables: () => [hostTable], play: async () => undefined });
    const sent = (await host.create(hostTable)).table;
    host.stop();
    const out: LiveMessage[] = [];
    let deliver: ((k: string, m: unknown) => void) | undefined;
    const guestTable = table(guestVbs);
    const guest = createLiveGames({ net: net('bruno', out, (cb) => (deliver = cb)), dataDir: path.join(root, `g${n++}`), tables: () => [guestTable], play: async () => undefined });
    try {
      deliver!('hote', { t: 'game-invite', game: { id: '0123456789abcdef', table: sent, title: 'Terminator 2 (Williams 1991)', players: [{ key: 'hote', name: 'Alice' }] } });
      const found = await guest.accept('0123456789abcdef');
      return { sent, found, answer: out.at(-1) };
    } finally {
      guest.stop();
    }
  };
  const same = await invitation(undefined, ours);
  assert.equal(same.sent.script, undefined);
  assert.equal(same.found.match, 'same', 'les réparations PuP de Cyber Pinball ne changent pas la version');
  assert.deepEqual(same.answer, { t: 'game-answer', game: '0123456789abcdef', answer: 'accept', match: 'same' });
  const modified = await invitation(undefined, foreign);
  assert.deepEqual([modified.found.match, modified.found.scriptDiffers], ['other-version', true]);
  assert.deepEqual(modified.answer, { t: 'game-answer', game: '0123456789abcdef', answer: 'decline', match: 'other-version' });
  const both = await invitation(foreign, foreign);
  assert.match(both.sent.script!, /^[0-9a-f]{64}$/);
  assert.equal(both.found.match, 'same', 'le même .vbs des deux côtés');
});

test('application : « Récupérer sa version » coche sa table d’office ; l’identifiant de table et « version proche » ont disparu', () => {
  const menu = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'live-game-menu.ts'), 'utf8');
  assert.match(menu, /host\.openFriendTable!\(invite\.host\.key, invite\.table\.table, \(\) => openInvite\(id, back\), \['table'\]\)/);
  assert.match(menu, /if \(match === 'same'\) \{\s+actions\.push\(\{\s+label: t\('Accepter'\)/);
  const library = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'friend-library-menu.ts'), 'utf8');
  assert.match(library, /job\.take\.set\(p\.part, want\.includes\(p\.part\) \|\| defaultPartChoice\(p\.part, have\.has\(p\.part\)\)\)/);
  for (const file of ['live-game.ts', 'live-game-menu.ts']) assert.doesNotMatch(fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', file), 'utf8'), /same-rules|readVpxKeys|rulesKey/, file);
  assert.ok(!fs.existsSync(path.join(REPO_ROOT, 'packages', 'core', 'src', 'vpxid.ts')));
});
