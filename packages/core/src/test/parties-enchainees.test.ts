// Parties entre amis à la suite (essai réel du 04/11/2026, poste et borne, 0.1.6-essai.6) : une
// première partie sur Terminator 2 s'est bien passée ; puis sur The Goonies, et sur The Matrix juste
// après, « Chargement de la table… » sans fin pour les deux joueurs, tables pourtant chargées.
// Cause : ces deux tables originales (socle commun) ne posent joueur, nombre de joueurs et scores
// qu'au Start ; avant, le relevé les écrivait vides, sa ligne était illisible, et « prêt » ne se
// lisait jamais. T2 (une table à ROM) lit des nombres dans sa mémoire : elle partait.
// Fixés ici : le relevé écrit toujours des nombres, sa lecture accepte les vides d'avant la partie ;
// un garde-fou dit la table prête au bout de LIVE_READY_SIGNAL_MS, et le journal dit pourquoi ; une
// attente où nul n'est prêt finit quand même. Et l'invariant demandé : tout ce que le service retient
// d'une partie meurt avec elle ; plusieurs parties à la suite partent chacune, sans rien hériter.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';
import { LIVE_READY_SIGNAL_MS, LIVE_READY_WAIT_MS, liveGoDeadline, liveGoDue, liveReadyOverdue, liveStateHook, parseLiveState, type LiveGame, type TableEntry } from '../index';

// ---------------------------------------------------------------------------
// Le relevé d'une table qui ne pose ses valeurs qu'au Start

test('lecture du relevé : avant la partie, joueur, nombre de joueurs et score vides valent zéro, et « prêt » se lit', () => {
  // La ligne exacte écrite avant le correctif sur The Goonies et The Matrix (reproduite par cscript).
  const line = 'jeu=0;vu=0;joueurs=;joueur=;bille=4;billes=3;score=;pret=1';
  const st = parseLiveState(line);
  assert.ok(st, 'lisible');
  assert.equal(st.ready, true);
  assert.deepEqual([st.inGame, st.started, st.players, st.player, st.score], [false, false, 0, 0, 0]);
  assert.equal(parseLiveState(line.replace('pret=1', 'pret=0'))?.ready, false);
  // Pendant la partie, une valeur vide reste une ligne illisible : jamais un score de zéro inventé.
  assert.equal(parseLiveState('jeu=1;vu=1;joueurs=1;joueur=1;bille=1;billes=3;score=;pret=1'), undefined);
  // Une clé absente aussi : seule une valeur écrite et vide vaut zéro.
  assert.equal(parseLiveState('jeu=0;vu=0;joueur=;bille=4;billes=3;score=;pret=1'), undefined);
});

/** Le socle commun tel que The Goonies et The Matrix l'ont : rien n'est posé avant le Start. */
const UNSET = [
  'Option Explicit',
  'Const BallsPerGame = 3',
  'Dim PlayersPlayingGame, CurrentPlayer, bGameInPlay, CPKeys',
  'Dim Score(4)',
  'Dim BallsRemaining(4)',
  'Sub Table1_KeyDown(ByVal keycode)',
  '  CPKeys = CPKeys & "D" & keycode & " "',
  '  If keycode = StartGameKey Then bGameInPlay = True : CurrentPlayer = 1 : PlayersPlayingGame = 1 : Score(1) = 120 : BallsRemaining(1) = 3',
  'End Sub',
  'Sub Table1_KeyUp(ByVal keycode)',
  'End Sub',
].join('\r\n');

test('socle commun non initialisé, exécuté : la ligne dit « prêt » après trois secondes, des nombres partout ; puis la partie', { skip: process.platform !== 'win32' }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-socle-vide-'));
  const stateFile = path.join(dir, 'cyberpinball-etat.txt');
  const goFile = path.join(dir, 'cyberpinball-partez.txt');
  const hook = liveStateHook(UNSET, [{ type: 0, name: 'Wall1' }], stateFile, undefined, undefined, goFile);
  assert.ok(hook.ok);
  const prelude = [
    'Const AddCreditKey = 6, AddCreditKey2 = 4, StartGameKey = 2, LockBarKey = 29',
    'Class CPElement : Public TimerInterval, TimerEnabled : End Class',
    `Dim ${hook.element} : Set ${hook.element} = New CPElement`,
    'Dim CPFso : Set CPFso = CreateObject("Scripting.FileSystemObject")',
  ];
  const driver = Array.from({ length: 20 }, (_, i) => [...(i + 1 === 13 ? [`CPFso.CreateTextFile("${goFile}", True).Close`] : []), `${hook.element}_Timer`, `WScript.Echo CyberPinball_Last`]).flat();
  const file = path.join(dir, 'essai.vbs');
  fs.writeFileSync(file, hook.script.replace(/^Option Explicit\r\n/, `Option Explicit\r\n${prelude.join('\r\n')}\r\n`) + '\r\n' + driver.join('\r\n') + '\r\n', 'latin1');
  const run = spawnSync('cscript', ['//NoLogo', '//E:vbscript', file], { encoding: 'latin1', windowsHide: true, timeout: 60_000 });
  fs.rmSync(dir, { recursive: true, force: true });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  const lines = run.stdout.trim().split(/\r?\n/);
  assert.equal(lines[11], 'jeu=0;vu=0;joueurs=0;joueur=0;bille=4;billes=3;score=0;pret=1', 'trois secondes à l’écran : des nombres, et prête');
  assert.equal(parseLiveState(lines[11]!)?.ready, true);
  // « partez » au tour 13 : crédit, puis Start ; la partie part, ses vraies valeurs dans la ligne.
  const playing = lines.map((l) => parseLiveState(l)).find((s) => s?.inGame);
  assert.ok(playing, `la partie part : ${lines.slice(12).join(' | ')}`);
  assert.deepEqual([playing.players, playing.player, playing.ball, playing.score], [1, 1, 1, 120]);
});

// ---------------------------------------------------------------------------
// Le garde-fou, et une attente où nul n'est prêt

test('garde-fou : table à l’écran sans « prêt » du relevé, prête au bout de LIVE_READY_SIGNAL_MS ; nul prêt, « partez » quand même', () => {
  assert.equal(liveReadyOverdue(undefined, 1e9), false, 'pas encore à l’écran');
  assert.equal(liveReadyOverdue(1000, 1000 + LIVE_READY_SIGNAL_MS - 1), false);
  assert.equal(liveReadyOverdue(1000, 1000 + LIVE_READY_SIGNAL_MS), true);
  assert.ok(LIVE_READY_SIGNAL_MS <= 30_000, 'raisonnable : bien avant le délai des derniers');
  const start = Date.parse('2026-11-04T20:00:00.000Z');
  const game: LiveGame = {
    id: '0123456789abcdef',
    host: 'borne',
    table: { table: { title: 'The Goonies' } },
    title: 'The Goonies',
    phase: 'playing',
    createdAt: new Date(start - 60_000).toISOString(),
    startAt: new Date(start).toISOString(),
    players: [
      { key: 'borne', name: 'Borne', state: 'loading', host: true, proto: 4 },
      { key: 'poste', name: 'Poste', state: 'loading', settings: 'ok', proto: 4 },
    ],
  };
  // Personne ne s'est dit prêt : le délai se compte du lancement, au lieu de ne jamais commencer.
  assert.equal(liveGoDeadline(game), start + LIVE_READY_WAIT_MS + LIVE_READY_SIGNAL_MS);
  assert.equal(liveGoDue(game, new Date(start + LIVE_READY_WAIT_MS)), undefined);
  assert.equal(liveGoDue(game, new Date(start + LIVE_READY_WAIT_MS + LIVE_READY_SIGNAL_MS)), 'timeout');
  // Le premier prêt reprend la règle habituelle.
  assert.equal(liveGoDeadline({ ...game, firstReadyAt: new Date(start + 5000).toISOString() }), start + 5000 + LIVE_READY_WAIT_MS);
});

test('application : le garde-fou dit pourquoi au journal ; la partie simulée lit sa ligne comme une vraie table', () => {
  const front = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'frontend.ts'), 'utf8');
  assert.match(front, /if \(onScreen && hooks\.gate && !liveManual && !readySeen && !readyForced && liveReadyOverdue\(playingSince, Date\.now\(\)\)\) \{/);
  assert.match(front, /le relevé ne dit pas « prêt » \(\$\{why\}\) : prête quand même/);
  // La partie simulée des démonstrations écrit la ligne vide d'avant la partie, et la lit par parseLiveState.
  assert.match(front, /'joueurs=;joueur=;bille=4;billes=3;score='/);
  assert.match(front, /return parseLiveState\(`jeu=/);
  const doubles = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'table-double.ts'), 'utf8');
  assert.match(doubles, /return line === undefined \? undefined : parseLiveState\(line\);/);
  // Le service : l'état d'une partie rangé sous son identifiant, le lancement prévu pour sa seule partie.
  const live = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'live-game.ts'), 'utf8');
  assert.match(live, /if \(perGame\.id !== id\) perGame = freshGameState\(id\);/);
  assert.match(live, /launch = setTimeout\(\(\) => void \(game\?\.id === id && run\(\)\)/);
  assert.match(live, /key === game\.host && m\.game === game\.id && game\.phase === 'gathering'/);
  assert.doesNotMatch(live, /\blet (manualIn|lastStatus|roomSentAt)\b/, 'plus d’état de partie hors de perGame');
});

// ---------------------------------------------------------------------------
// Service (app/src/live-game.ts, compilé) : trois parties à la suite, sur un réseau d'essai en mémoire

type Gate = { ready(o?: { manual?: boolean }): void; go(): boolean };
type Games = {
  create(table: TableEntry): Promise<LiveGame>;
  invite(key: string, name: string): boolean;
  invites(): { id: string }[];
  accept(id: string): Promise<{ match: string }>;
  start(): boolean;
  current(): LiveGame | undefined;
  waitView(o?: { manual?: boolean }): { title: string } | undefined;
  history(): readonly unknown[];
  close(): void;
  stop(): void;
};
/* eslint-disable @typescript-eslint/no-require-imports */
const { createLiveGames } = require(path.join(REPO_ROOT, 'app', 'dist', 'live-game.js')) as { createLiveGames(o: object): Games };
/* eslint-enable @typescript-eslint/no-require-imports */

const until = async (what: string, ok: () => boolean, ms = 30_000) => {
  for (const end = Date.now() + ms; !ok(); ) {
    if (Date.now() > end) throw new Error(`attendu : ${what}`);
    await new Promise((r) => setTimeout(r, 20));
  }
};

test('service : trois parties à la suite (même table, puis une autre) ; chacune part, finit, et n’hérite de rien ; un message de la partie d’avant est ignoré', { timeout: 150_000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-enchainees-'));
  const tableOf = (name: string): TableEntry => {
    const vpx = path.join(dir, `${name}.vpx`);
    fs.writeFileSync(vpx, name);
    return { file: vpx, folder: dir, title: name, info: {} } as unknown as TableEntry;
  };
  const tables = [tableOf('Terminator 2'), tableOf('The Goonies'), tableOf('The Matrix')];
  const handlers: Record<string, (k: string, m: unknown) => void> = {};
  // Messages perdus en route (une liaison qui tombe) : l'expéditeur croit les avoir envoyés.
  const drops: { from: string; t: string; done?: boolean }[] = [];
  const lost: string[] = [];
  const net = (me: string, name: string, other: string, otherName: string) => ({
    state: () => ({ key: { publicKey: me }, name, friends: [{ key: other, name: otherName }] }),
    online: () => true,
    send: (to: string, m: { t: string }) => {
      const drop = drops.find((d) => !d.done && d.from === me && d.t === m.t);
      if (drop) return ((drop.done = true), lost.push(`${me} ${m.t}`), true);
      setImmediate(() => handlers[to]?.(me, JSON.parse(JSON.stringify(m))));
      return true;
    },
    onMessage: (cb: (k: string, m: unknown) => void) => ((handlers[me] = cb), () => undefined),
  });
  let stopped = false;
  const plays: Record<string, number> = { borne: 0, poste: 0 };
  const logs: string[] = [];
  // Chaque table charge, se dit prête, attend « partez », joue une seconde ; comme frontend.ts, sans VPX.
  const player = (who: string) => async (_t: TableEntry, playing: () => void, _s: unknown, _b: unknown, _p: unknown, gate: Gate) => {
    plays[who]!++;
    await new Promise((r) => setTimeout(r, who === 'poste' ? 600 : 100));
    playing();
    gate.ready();
    for (const end = Date.now() + 60_000; !gate.go() && !stopped && Date.now() < end; ) await new Promise((r) => setTimeout(r, 20));
    await new Promise((r) => setTimeout(r, 1000));
    return { ok: true, seconds: 61, records: [], score: who === 'borne' ? 1000 * plays[who]! : 2000 * plays[who]! };
  };
  const host = createLiveGames({ net: net('borne', 'Borne', 'poste', 'Poste'), dataDir: path.join(dir, 'a'), tables: () => tables, play: player('borne'), log: (l: string) => logs.push(`borne ${l}`) });
  const guest = createLiveGames({ net: net('poste', 'Poste', 'borne', 'Borne'), dataDir: path.join(dir, 'b'), tables: () => tables, play: player('poste'), log: (l: string) => logs.push(`poste ${l}`) });
  const ids: string[] = [];
  try {
    for (const [round, table] of [tables[0]!, tables[0]!, tables[1]!, tables[2]!].entries()) {
      // La partie d'avant fermée chez chacun, comme « Fermer » aux résultats.
      host.close();
      guest.close();
      // Deuxième partie : l'invitation se perd, puis la réponse ; renvoyées, elles arrivent.
      if (round === 1) drops.push({ from: 'borne', t: 'game-invite' }, { from: 'poste', t: 'game-answer' });
      await host.create(table);
      const id = host.current()!.id;
      assert.ok(!ids.includes(id), 'une partie neuve, un identifiant neuf');
      assert.ok(host.invite('poste', 'Poste'));
      await until(`invitation ${round + 1}`, () => guest.invites().some((i) => i.id === id));
      assert.equal((await guest.accept(id)).match, 'same');
      assert.equal(guest.current()!.goAt, undefined, 'rien de la partie d’avant : pas de « partez »');
      assert.equal(guest.current()!.firstReadyAt, undefined, 'ni de premier prêt');
      // Un départ, une salle et un état de la partie d'avant arrivent en retard : ignorés.
      if (ids.length) {
        const old = ids[ids.length - 1]!;
        handlers['poste']!('borne', { t: 'game-start', game: old, in: 0 });
        handlers['poste']!('borne', { t: 'game-room', game: old, phase: 'playing', players: [], go: { why: 'all-ready', late: [] } });
        handlers['borne']!('poste', { t: 'game-status', game: old, state: 'loading', ready: true });
        await new Promise((r) => setTimeout(r, 200));
        assert.equal(guest.current()!.phase, 'gathering', 'le départ d’avant ne lance pas celle-ci');
        assert.equal(guest.current()!.goAt, undefined);
        assert.equal(host.current()!.players.find((p) => p.key === 'poste')!.ready, undefined, 'le prêt d’avant ne compte pas');
      }
      await until(`acceptée ${round + 1}`, () => host.current()!.players[1]!.state === 'accepted');
      assert.ok(host.start());
      await until(`partez ${round + 1}`, () => !!host.current()!.goAt && !!guest.current()?.goAt, 20_000);
      assert.equal(host.current()!.goWhy, 'all-ready', `tous prêts, pas le délai (partie ${round + 1})`);
      await until(`résultats ${round + 1}`, () => host.current()!.phase === 'finished' && guest.current()?.phase === 'finished', 30_000);
      assert.deepEqual(host.current()!.players.map((p) => [p.key, p.state, p.score]), [['borne', 'done', 1000 * (round + 1)], ['poste', 'done', 2000 * (round + 1)]]);
      assert.equal(guest.waitView(), undefined, 'plus d’attente à montrer');
      ids.push(id);
    }
    assert.deepEqual(plays, { borne: 4, poste: 4 }, 'chaque partie lancée une fois, chez chacun');
    assert.deepEqual(lost, ['borne game-invite', 'poste game-answer'], 'les deux messages ont bien été perdus');
    assert.ok(logs.some((l) => l.startsWith('borne Partie en direct : invitation renvoyée à Poste')), logs.join('\n'));
    assert.ok(logs.some((l) => /^poste Partie en direct : invitation de Borne renvoyée, déjà répondue \(accept\)/.test(l)), logs.join('\n'));
    await until('historique', () => host.history().length === 4 && guest.history().length === 4);
    assert.ok(!logs.some((l) => /garde-fou|prête quand même/.test(l)), logs.join('\n'));
  } finally {
    stopped = true;
    host.stop();
    guest.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
