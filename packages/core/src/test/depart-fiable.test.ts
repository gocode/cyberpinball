// Départ commun fiable (essai réel du 01/11/2026, « 2001 - A Space Odyssey (Original 2025) », la borne
// hôte et un poste invité, connexion instable) : « Partez ! » est resté 90 s chez l'invité et sans fin
// chez l'hôte, et aucun score n'a été compté. Causes : la carte de l'attente n'était redessinée que sur
// un événement de la partie (une table sans relevé n'en produit aucun), et rien ne portait la fin de
// la vue ; une erreur d'écriture après la partie interrompait le service avant d'envoyer le résultat.
// Fixés ici : la carte part toujours, même sans aucun message ; un message du départ perdu est renvoyé
// (« prêt », « partez », le départ lui-même) ; une table sans relevé est dite avant la partie, et ses
// résultats disent pourquoi le score manque ; le résultat part même si la fin de partie échoue.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';
import {
  applyRoom,
  gameStatus,
  giveGo,
  LIVE_GO_FALLBACK_MS,
  LIVE_GO_SHOW_MS,
  LIVE_PROTOCOL,
  LIVE_RESEND_MS,
  LIVE_WAIT_MAX_MS,
  liveManualLabel,
  liveManualScoreLabel,
  liveScore,
  liveStandings,
  liveStateSupport,
  liveStatusBehind,
  liveWaitCardEnd,
  liveWaitView,
  parseLiveMessage,
  roomMessage,
  type LiveGame,
  type LiveMessage,
  type TableEntry,
} from '../index';

const T0 = new Date('2026-11-01T14:59:00.000Z');
const at = (ms: number) => new Date(T0.getTime() + ms);

/** La partie du 01/11/2026 : la borne invite le poste, sur une table sans relevé. */
function launched(): LiveGame {
  return {
    id: '0123456789abcdef',
    host: 'borne',
    table: { table: { title: '2001 - A Space Odyssey' }, print: 'a'.repeat(64), manual: 'script' },
    title: '2001 - A Space Odyssey (Original 2025)',
    players: [
      { key: 'borne', name: 'Borne', state: 'accepted', host: true, proto: LIVE_PROTOCOL },
      { key: 'poste', name: 'Poste', state: 'accepted', settings: 'ok', proto: LIVE_PROTOCOL },
    ],
    phase: 'countdown',
    createdAt: T0.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// La carte part toujours

test('la carte part toujours : « Partez ! » lu, ou restée trop longtemps, sans attendre aucun message', () => {
  assert.equal(liveWaitCardEnd({}, 0), undefined, 'rien montré : rien à fermer');
  assert.equal(liveWaitCardEnd({ partez: 1000 }, 1000 + LIVE_GO_SHOW_MS - 1), undefined);
  assert.equal(liveWaitCardEnd({ partez: 1000 }, 1000 + LIVE_GO_SHOW_MS), 'partez-lu');
  // L'essai du 01/11/2026 : 90,6 s de « Partez ! » ; jamais plus de LIVE_GO_SHOW_MS désormais.
  assert.equal(liveWaitCardEnd({ partez: 0 }, 90_600), 'partez-lu');
  assert.equal(liveWaitCardEnd({ attente: 0 }, LIVE_WAIT_MAX_MS - 1), undefined, 'une attente légitime (jusqu’au départ sans l’hôte) reste');
  assert.equal(liveWaitCardEnd({ attente: 0 }, LIVE_WAIT_MAX_MS), 'trop-long');
  assert.ok(LIVE_WAIT_MAX_MS > LIVE_GO_FALLBACK_MS + LIVE_GO_SHOW_MS, 'au-delà du départ sans l’hôte et de « Partez ! »');
  // La vue elle-même expire : table sans relevé, « partez » à 0, ma table prête à 0.
  let game = gameStatus(gameStatus(launched(), 'borne', { state: 'loading', ready: true, manual: true }, at(0)), 'poste', { state: 'loading', ready: true, manual: true }, at(0));
  game = giveGo(game, 'all-ready', at(0));
  const go = liveWaitView(game, 'poste', at(1000), { manual: true, readyAt: at(0).getTime() });
  assert.equal(go?.title, 'Partez !');
  assert.match(go!.lead, /Appuyez sur Start/);
  assert.match(go!.note!, /Table sans relevé : quittez-la à la fin de votre partie/);
  assert.equal(liveWaitView(game, 'poste', at(LIVE_GO_SHOW_MS + 1), { manual: true, readyAt: at(0).getTime() }), undefined);
});

test('la carte part toujours : le service porte la fin de la vue, la carte se ferme seule (code de l’application)', () => {
  const read = (...p: string[]) => fs.readFileSync(path.join(REPO_ROOT, ...p), 'utf8');
  const live = read('app', 'src', 'live-game.ts');
  // Un tour de plus quand la vue n'a plus rien à montrer : c'est ce tour-là qui manquait (la vue « Partez ! » restait la dernière portée).
  assert.match(live, /const waiting = !!waitView\(\);\r?\n\s+if \(game\?\.phase === 'countdown' \|\| waiting \|\| waitWas\) changed\(\);\r?\n\s+waitWas = waiting;/);
  const notice = read('app', 'src', 'game-notice.ts');
  // La carte se ferme d'elle-même, sur son horloge, et ne se rouvre pas pour la même attente.
  assert.match(notice, /const end = liveWaitCardEnd\(waitSeen, Date\.now\(\)\);/);
  assert.match(notice, /if \(waitEnded\) return;/);
  // Le journal dit ce que la carte montre, et pourquoi elle part.
  assert.match(notice, /Départ commun, carte : « \$\{told\} »\./);
  assert.match(notice, /« Partez ! » \$\{s\(waitSeen\.partez, end\)\} ; partie : \$\{why\}\./);
  // Une fin de partie en erreur (EPERM sur social.json après la partie) ne perd plus le résultat.
  assert.match(live, /fin de partie en erreur .* mon retour part quand même/);
  const front = read('app', 'src', 'frontend.ts');
  // Les badges gagnés sont relevés pour la carte du retour (gamereturn.ts), dans le même try.
  assert.match(front, /for \(const e of socialNet\.checkBadges\(playStats\(tables\)\)\) if \(e\.kind === 'badge' && e\.badge\) earned\.push\(e\.badge\);\r?\n\s+\} catch \(error\) \{/);
});

// ---------------------------------------------------------------------------
// Messages perdus, connexion qui revient

test('messages perdus : l’invité renvoie son état tant que la salle ne le montre pas ; un état renvoyé ne fait pas reculer', () => {
  assert.equal(liveStatusBehind(undefined, { state: 'loading' }), true);
  assert.equal(liveStatusBehind({ state: 'accepted' }, { state: 'loading', ready: true }), true, '« chargement » perdu');
  assert.equal(liveStatusBehind({ state: 'loading' }, { state: 'loading', ready: true }), true, '« prêt » perdu');
  assert.equal(liveStatusBehind({ state: 'loading', ready: true }, { state: 'loading', ready: true }), false);
  assert.equal(liveStatusBehind({ state: 'playing', ready: true }, { state: 'loading', ready: true }), false, 'déjà plus loin chez l’hôte');
  assert.equal(liveStatusBehind({ state: 'playing' }, { state: 'done' }), true, 'le résultat perdu');
  assert.equal(liveStatusBehind({ state: 'done' }, { state: 'done' }), false);
  // L'hôte : un « prêt » renvoyé après « parti » ne le ramène pas au chargement.
  let game = gameStatus(launched(), 'poste', { state: 'playing' }, at(1000));
  game = gameStatus(game, 'poste', { state: 'loading', ready: true }, at(2000));
  assert.equal(game.players[1]!.state, 'playing');
  assert.equal(game.players[1]!.ready, true);
});

test('messages perdus : « game-start » perdu, la salle d’une partie lancée fait partir l’invité, au reste du compte à rebours', () => {
  const host: LiveGame = { ...launched(), startAt: at(5000).toISOString() };
  const room = roomMessage(host, at(2000));
  assert.equal(room.startIn, 3000);
  assert.equal((parseLiveMessage({ ...JSON.parse(JSON.stringify(room)), players: [] }) as Extract<LiveMessage, { t: 'game-room' }>).startIn, 3000, 'il voyage');
  const guest: LiveGame = { ...launched(), phase: 'gathering' };
  const started = applyRoom(guest, room, at(10_000), 'poste');
  assert.equal(started.phase, 'countdown');
  assert.equal(started.startAt, at(13_000).toISOString(), 'à l’horloge de l’invité');
  // Déjà partie chez l'hôte : tout de suite.
  const playing = applyRoom(guest, { ...room, phase: 'playing', startIn: undefined } as Extract<LiveMessage, { t: 'game-room' }>, at(10_000), 'poste');
  assert.deepEqual([playing.phase, playing.startAt], ['countdown', at(10_000).toISOString()]);
  // Une salle déjà en compte à rebours chez l'invité ne décale rien.
  const counting: LiveGame = { ...launched(), startAt: at(4000).toISOString() };
  assert.equal(applyRoom(counting, room, at(2000), 'poste').startAt, at(4000).toISOString());
  // Pas de la partie chez l'hôte (réponse arrivée après le départ : « expiré ») : rien ne se lance chez lui.
  const late = { ...room, players: room.players.map((p) => (p.key === 'poste' ? { ...p, state: 'expired' as const } : p)) };
  assert.equal(applyRoom(guest, late, at(10_000), 'poste').phase, 'gathering');
  assert.equal((parseLiveMessage({ ...JSON.parse(JSON.stringify(room)), startIn: 120_000 }) as Extract<LiveMessage, { t: 'game-room' }>).startIn, undefined, 'hors bornes : ignoré');
});

// ---------------------------------------------------------------------------
// Table sans relevé, dite avant la partie ; les résultats

const SOCLE = [
  'Dim PlayersPlayingGame, CurrentPlayer, BallsPerGame, bGameInPlay',
  'Dim Score(4)',
  'Dim BallsRemaining(4)',
  'Sub Table1_KeyDown(ByVal keycode)',
  'End Sub',
].join('\r\n');
/** Un script d'original hors du socle commun (2001 - A Space Odyssey). */
const HORS_SOCLE = ['Dim Points', 'Sub Table1_KeyDown(ByVal keycode)', '  If keycode = StartGameKey Then Points = 0', 'End Sub'].join('\r\n');
const ROM = ['Const cGameName = "xx_l1"', 'Sub Table1_KeyDown(ByVal keycode)', '  If vpmKeyDown(keycode) Then Exit Sub', 'End Sub', 'Sub Init : Controller.GameName = cGameName : End Sub'].join('\r\n');
const ELEMENTS = [{ type: 0, name: 'Wall9' }];

test('table sans relevé : dite avant la partie (choix, salon, invitation), avec sa raison', () => {
  assert.deepEqual(liveStateSupport(SOCLE, ELEMENTS), { live: true });
  const original = liveStateSupport(HORS_SOCLE, ELEMENTS);
  assert.equal(original.live, false);
  assert.equal(!original.live && original.reason, 'script');
  const rom = liveStateSupport(ROM, ELEMENTS, { roms: 1 });
  assert.equal(!rom.live && rom.reason, 'rom', 'table à ROM sans carte en cache : c’est la carte qui manque');
  assert.equal(liveStateSupport(undefined, []).live, false, 'script illisible : pas de relevé, et on le dit');
  const label = liveManualLabel('script');
  assert.equal(label.text, 'Départ manuel, pas de score en direct');
  assert.match(label.detail, /son script ne donne pas l’état de jeu/);
  assert.match(label.detail, /chacun appuie sur Start à « Partez ! »/);
  for (const r of ['rom', 'inspector', 'other'] as const) assert.ok(liveManualLabel(r).detail.length > 40, r);
  // L'invitation porte la marque de l'hôte ; une valeur inconnue est ignorée.
  const invite = parseLiveMessage({ t: 'game-invite', game: { id: '0123456789abcdef', title: '2001', table: { table: { title: '2001' }, manual: 'script' }, players: [] } }) as Extract<LiveMessage, { t: 'game-invite' }>;
  assert.equal(invite.game.table.manual, 'script');
  const odd = parseLiveMessage({ t: 'game-invite', game: { id: '0123456789abcdef', title: '2001', table: { table: { title: '2001' }, manual: 'peut-être' }, players: [] } }) as Extract<LiveMessage, { t: 'game-invite' }>;
  assert.equal(odd.game.table.manual, undefined);
  // Le menu : la marque dans le choix de la table, le salon et l'invitation, jamais cachée.
  const menu = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'live-game-menu.ts'), 'utf8');
  assert.match(menu, /\{ rows: \[tableRow\(game\), \.\.\.manualRows\(game\.table\.manual\)/);
  assert.match(menu, /\.\.\.manualRows\(found\?\.manual \?\? invite\.table\.manual\)/);
  assert.match(menu, /const manual = c\.fit !== 'blocked' \? manualOfMine\(c\.entry\) : undefined;/);
});

test('résultats d’une table sans relevé : le score du tableau d’honneur s’il y est entré, sinon la raison ; jamais classé inconnu', () => {
  let game = launched();
  game = { ...game, phase: 'playing' };
  game = gameStatus(game, 'borne', { state: 'done', seconds: 300, records: [{ score: 41_000_000, rank: 2 }], manual: true }, at(300_000));
  game = gameStatus(game, 'poste', { state: 'done', seconds: 280, records: [], manual: true }, at(310_000));
  assert.equal(game.phase, 'finished');
  const [first, second] = liveStandings(game);
  assert.deepEqual([first!.key, liveScore(first!)], ['borne', 41_000_000], 'lu au tableau d’honneur du double');
  assert.deepEqual([second!.key, liveScore(second!), second!.manual], ['poste', undefined, true]);
  assert.match(liveManualScoreLabel(), /table sans relevé/);
  const menu = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'live-game-menu.ts'), 'utf8');
  assert.match(menu, /const reason = p\.manual && score === undefined\r?\n\s+\? liveManualScoreLabel\(\)/);
});

// ---------------------------------------------------------------------------
// Service (app/src/live-game.ts, compilé) : deux bornes sur un réseau d'essai qui perd des messages

type Gate = { ready(o?: { manual?: boolean }): void; go(): boolean };
type Games = {
  create(table: TableEntry): Promise<LiveGame>;
  invite(key: string, name: string): boolean;
  invites(): { id: string; table: { manual?: string } }[];
  accept(id: string): Promise<{ match: string; manual?: string }>;
  start(): boolean;
  current(): LiveGame | undefined;
  waitView(o?: { manual?: boolean }): { title: string; lead: string; note?: string } | undefined;
  stop(): void;
};
/* eslint-disable @typescript-eslint/no-require-imports */
const { createLiveGames } = require(path.join(REPO_ROOT, 'app', 'dist', 'live-game.js')) as { createLiveGames(o: object): Games };
/* eslint-enable @typescript-eslint/no-require-imports */

/** Réseau d'essai : `drop` perd un message (une fois par règle), `cut` coupe tout, `offline` cache une borne à l'autre. */
function testNet() {
  const handlers: Record<string, (k: string, m: unknown) => void> = {};
  const rules: { from: string; when: (m: Record<string, unknown>) => boolean; done?: boolean }[] = [];
  const state = { cut: false, offline: new Set<string>(), sent: [] as string[], lost: [] as string[] };
  const make = (me: string, name: string, other: string, otherName: string) => ({
    state: () => ({ key: { publicKey: me }, name, friends: [{ key: other, name: otherName }] }),
    online: (key: string) => !state.cut && !state.offline.has(key) && !state.offline.has(me),
    send: (to: string, m: Record<string, unknown>) => {
      const label = `${me}→${to} ${String(m.t)}${m.ready ? ' prêt' : ''}${m.go ? ' partez' : ''}`;
      if (state.cut || state.offline.has(to) || state.offline.has(me)) return (state.lost.push(label), false);
      const rule = rules.find((r) => !r.done && r.from === me && r.when(m));
      if (rule) {
        rule.done = true;
        state.lost.push(label);
        return true; // parti, mais perdu en route : l'expéditeur n'en sait rien
      }
      state.sent.push(label);
      setImmediate(() => handlers[to]?.(me, JSON.parse(JSON.stringify(m))));
      return true;
    },
    onMessage: (cb: (k: string, m: unknown) => void) => ((handlers[me] = cb), () => undefined),
  });
  return { make, state, drop: (from: string, when: (m: Record<string, unknown>) => boolean) => rules.push({ from, when }) };
}

const until = async (what: string, ok: () => boolean, ms = 30_000) => {
  for (const end = Date.now() + ms; !ok(); ) {
    if (Date.now() > end) throw new Error(`attendu : ${what}`);
    await new Promise((r) => setTimeout(r, 20));
  }
};

function tableIn(dir: string): TableEntry {
  const vpx = path.join(dir, '2001.vpx');
  fs.writeFileSync(vpx, 'table');
  return { file: vpx, folder: dir, title: '2001 - A Space Odyssey', info: {} } as unknown as TableEntry;
}

test('service : départ perdu, « prêt » perdu, hôte hors ligne puis revenu, « partez » perdu : tout arrive, sans attendre le délai', { timeout: 90_000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-depart-fiable-'));
  const table = tableIn(dir);
  const net = testNet();
  const marks: Record<string, number> = {};
  let finish = false;
  const player = (who: string, loadMs: number) => async (_t: TableEntry, _playing: () => void, _s: unknown, _b: unknown, _p: unknown, gate: Gate) => {
    await new Promise((r) => setTimeout(r, loadMs));
    marks[`${who} prêt`] = Date.now();
    gate.ready();
    while (!gate.go() && !finish) await new Promise((r) => setTimeout(r, 20));
    marks[`${who} part`] = Date.now();
    while (!finish) await new Promise((r) => setTimeout(r, 20));
    return { ok: true, seconds: 60, records: [], score: who === 'borne' ? 1000 : 2000 };
  };
  const host = createLiveGames({ net: net.make('borne', 'Borne', 'poste', 'Poste'), dataDir: path.join(dir, 'a'), tables: () => [table], play: player('borne', 0) });
  const guest = createLiveGames({ net: net.make('poste', 'Poste', 'borne', 'Borne'), dataDir: path.join(dir, 'b'), tables: () => [table], play: player('poste', 1500) });
  try {
    await host.create(table);
    assert.ok(host.invite('poste', 'Poste'));
    await until('invitation reçue', () => guest.invites().length === 1);
    await guest.accept(guest.invites()[0]!.id);
    await until('acceptée', () => host.current()!.players[1]!.state === 'accepted');
    // Perdus en route : le départ (game-start), le « prêt » du poste, le premier « partez ».
    net.drop('borne', (m) => m.t === 'game-start');
    net.drop('poste', (m) => m.t === 'game-status' && m.ready === true);
    net.drop('borne', (m) => m.t === 'game-room' && !!m.go);
    assert.ok(host.start());
    await until('le poste part quand même (départ appris par la salle)', () => marks['poste prêt'] !== undefined, 20_000);
    // L'hôte disparaît deux secondes juste après le « prêt » (perdu) du poste, puis revient.
    net.state.offline.add('borne');
    await new Promise((r) => setTimeout(r, 2000));
    net.state.offline.delete('borne');
    await until('les deux partis', () => marks['borne part'] !== undefined && marks['poste part'] !== undefined, 20_000);
    assert.equal(host.current()!.goWhy, 'all-ready', `« prêt » renvoyé, pas le délai des derniers : ${net.state.lost.join(' ; ')}`);
    assert.ok(marks['poste part']! - marks['poste prêt']! < 2000 + 2 * LIVE_RESEND_MS + 3000, 'le poste n’attend pas le délai pour rien');
    assert.ok(net.state.lost.some((l) => l.includes('game-room') && l.includes('partez')), 'le premier « partez » a bien été perdu');
    finish = true;
    await until('résultats', () => host.current()!.phase === 'finished' && guest.current()?.phase === 'finished');
    assert.deepEqual(host.current()!.players.map((p) => [p.name, p.state, p.score]), [['Borne', 'done', 1000], ['Poste', 'done', 2000]]);
  } finally {
    finish = true;
    host.stop();
    guest.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('service : table sans relevé, réseau coupé après « partez » : la vue finit quand même ; fin de partie en erreur : le résultat part', { timeout: 90_000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-depart-manuel-'));
  const table = tableIn(dir);
  const net = testNet();
  let finish = false;
  const last: Record<string, { title: string } | undefined | 'rien'> = { borne: 'rien', poste: 'rien' };
  const games: Record<string, Games> = {};
  const player = (who: string, fails: boolean) => async (_t: TableEntry, playing: () => void, _s: unknown, _b: unknown, _p: unknown, gate: Gate) => {
    // Sans relevé : prête dès qu'elle est à l'écran (frontend.ts), le joueur appuie sur Start au signal.
    playing();
    gate.ready({ manual: true });
    while (!gate.go() && !finish) await new Promise((r) => setTimeout(r, 20));
    while (!finish) await new Promise((r) => setTimeout(r, 20));
    // L'essai du 01/11/2026 : EPERM sur social.json (badges) après la partie.
    if (fails) throw new Error("EPERM: operation not permitted, rename 'social.json.tmp' -> 'social.json'");
    return { ok: true, seconds: 120, records: [{ score: 41_000_000, rank: 2 }] };
  };
  const make = (me: string, name: string, other: string, otherName: string, fails: boolean) =>
    (games[me] = createLiveGames({
      net: net.make(me, name, other, otherName),
      dataDir: path.join(dir, me),
      tables: () => [table],
      manualOf: async () => 'script',
      play: player(me, fails),
      // Ce que la carte reçoit, à chaque changement porté (frontend.ts : showLiveBoard).
      onChange: () => (last[me] = games[me]?.waitView({ manual: true })),
    }));
  const host = make('borne', 'Borne', 'poste', 'Poste', false);
  const guest = make('poste', 'Poste', 'borne', 'Borne', true);
  try {
    await host.create(table);
    assert.equal(host.current()!.table.manual, 'script', 'l’hôte l’annonce dans la partie');
    assert.ok(host.invite('poste', 'Poste'));
    await until('invitation reçue', () => guest.invites().length === 1);
    assert.equal(guest.invites()[0]!.table.manual, 'script', 'l’invitation dit : départ manuel, pas de score en direct');
    assert.equal((await guest.accept(guest.invites()[0]!.id)).manual, 'script', 'ma table aussi');
    await until('acceptée', () => host.current()!.players[1]!.state === 'accepted');
    assert.ok(host.start());
    await until('« partez » reçu des deux côtés', () => !!host.current()!.goAt && !!guest.current()?.goAt, 20_000);
    assert.equal((last.poste as { title: string } | undefined)?.title ?? 'Partez !', 'Partez !');
    // Plus aucun message : ni salle, ni score (table sans relevé). La carte doit finir quand même.
    net.state.cut = true;
    await until('la fin de l’attente portée chez l’invité', () => last.poste === undefined, LIVE_GO_SHOW_MS + 4000);
    await until('la fin de l’attente portée chez l’hôte', () => last.borne === undefined, LIVE_GO_SHOW_MS + 4000);
    net.state.cut = false;
    finish = true;
    await until('résultats chez l’hôte', () => host.current()!.phase === 'finished', 20_000);
    const poste = host.current()!.players.find((p) => p.key === 'poste')!;
    assert.equal(poste.state, 'done', 'la partie jouée compte malgré l’erreur de fin de partie');
    assert.equal(poste.manual, true, 'l’hôte sait que sa table n’avait pas de relevé');
    assert.equal(host.current()!.players.find((p) => p.key === 'borne')!.manual, true);
  } finally {
    finish = true;
    host.stop();
    guest.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
