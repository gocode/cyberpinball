// Notifications de la partie entre amis (essai réel du 31/10/2026) : quand on n'est pas sur
// l'écran de la partie, une notification d'une ligne dit tout de suite qu'un invité accepte ou
// décline (et pourquoi), qu'un joueur quitte, que la partie est annulée ou finie (le gagnant, ma
// place, où sont les résultats). Ces tests fixent la classe de comportement :
// - le relevé (livenotices.ts) tire chaque nouvelle du changement de la partie, quel que soit le
//   message qui l'a causé, jamais de l'état trouvé ni d'une partie à une autre ;
// - la file (notices.ts) les regroupe (« Bruno et Léa ont accepté »), ne les recouvre jamais, les
//   montre avant tout le reste, seules, même notifications coupées, et aussi hors du menu des
//   tables (liveOnly), où les autres attendent ;
// - chaque texte tient sur sa ligne, dans les deux langues, quels que soient les noms ;
// - le service réel (app/src/live-game.ts) et le menu (app/src/menu-notices.ts) les produisent
//   à partir des vrais messages ; rien sur l'écran de la partie, qui le dit déjà ;
// - pendant la partie d'une autre table, la ligne se pose dans le coin du joueur, sous
//   l'invitation, dans les quatre sens ; les résultats pas encore vus s'ouvrent au retour.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';
import { GAME_NOTICE_LINE, GAME_NOTICE_SIZE, gameNoticeBounds } from '../gamenotice';
import { setLanguage } from '../i18n';
import { answerGame, expireInvites, gameStatus, inviteToGame, newLiveGame, roomMessage, settingsReceived, startGame, applyRoom, guestGame, liveInvite, LIVE_INVITE_MS, type LiveGame, type LiveMessage } from '../livegame';
import { liveNotices, liveOutcome, liveSnapshot } from '../livenotices';
import {
  NOTICE_DETAIL_MAX,
  NOTICE_GATHER_MS,
  NOTICE_LIVE_SHOW_MS,
  NOTICE_RULES,
  NOTICE_SHOW_MS,
  NOTICE_TITLE_MAX,
  createNoticeCenter,
  isLiveNotice,
  noticeText,
  type NoticeEvent,
  type NoticeKind,
  type NoticeView,
} from '../notices';
import type { Rect, Rotation } from '../model';
import type { TableEntry } from '../tables';

const read = (...parts: string[]) => fs.readFileSync(path.join(REPO_ROOT, ...parts), 'utf8');
const len = (s: string | undefined) => [...(s ?? '')].length;
const ME = 'moi';
const table = { table: { title: 'Glass Lagoon', roms: [] } };
const at = (s: number) => new Date(Date.parse('2026-10-31T20:00:00Z') + s * 1000);

/** Un salon de la borne, Bruno, Léa et David invités. */
function salon(): LiveGame {
  let g = newLiveGame({ key: ME, name: 'Moi' }, table, 'Glass Lagoon (Inventé 1987)', at(0));
  for (const [key, name] of [['bruno', 'Bruno'], ['lea', 'Léa'], ['david', 'David']] as const) g = inviteToGame(g, { key, name }, at(1))!;
  return g;
}

const events = (before: LiveGame | undefined, after: LiveGame | undefined, me = ME, now = 5000) => liveNotices(liveSnapshot(before, me), liveSnapshot(after, me), after, me, now);
const kinds = (list: readonly NoticeEvent[]) => list.map((e) => `${e.kind}:${e.who ?? ''}${e.reason ? `:${e.reason}` : ''}`);

// ---------------------------------------------------------------------------
// Le relevé

test('relevé : rien au premier relevé ni d’une partie à une autre ; l’hôte apprend chaque réponse, avec sa raison', () => {
  const g0 = salon();
  assert.deepEqual(events(undefined, g0), [], 'le salon qui s’ouvre n’est pas une nouvelle');
  assert.deepEqual(events(g0, { ...g0, id: 'ffffffffffffffff' }), [], 'une autre partie non plus');
  let g1 = answerGame(g0, 'bruno', 'accept', 'same');
  g1 = answerGame(g1, 'lea', 'accept', 'same');
  g1 = answerGame(g1, 'david', 'decline', 'missing');
  assert.deepEqual(kinds(events(g0, g1)), ['live-accepted:Bruno', 'live-accepted:Léa', 'live-declined:David:missing']);
  // Occupé, autre version, sans réponse : chacun sa raison ; un refus simple, sans.
  assert.deepEqual(kinds(events(g0, answerGame(g0, 'bruno', 'busy'))), ['live-declined:Bruno:busy']);
  assert.deepEqual(kinds(events(g0, answerGame(g0, 'bruno', 'accept', 'other-version'))), ['live-declined:Bruno:other-version']);
  assert.deepEqual(kinds(events(g0, answerGame(g0, 'bruno', 'decline'))), ['live-declined:Bruno']);
  assert.deepEqual(kinds(events(g0, expireInvites(g0, at(1 + LIVE_INVITE_MS / 1000 + 1)))), ['live-declined:Bruno:expired', 'live-declined:Léa:expired', 'live-declined:David:expired']);
  // Le même évènement a la même clé ; une nouvelle invitation en donne une autre (une nouvelle réponse se redit).
  const again = inviteToGame(answerGame(g0, 'bruno', 'decline'), { key: 'bruno', name: 'Bruno' }, at(30))!;
  const first = events(g0, answerGame(g0, 'bruno', 'decline'))[0]!;
  const second = events(again, answerGame(again, 'bruno', 'accept', 'same'))[0]!;
  assert.notEqual(first.key, second.key);
  assert.ok(first.key.startsWith(`${g0.id}|`), 'la clé commence par la partie : elle tombe quand la partie s’en va');
});

test('relevé : un joueur qui quitte ou ne démarre pas ; l’annulation, côté invité seulement', () => {
  let g = answerGame(answerGame(salon(), 'bruno', 'accept', 'same'), 'lea', 'accept', 'same');
  g = startGame(g, at(10));
  g = gameStatus(g, 'bruno', { state: 'playing' }, at(16));
  g = gameStatus(g, 'lea', { state: 'playing' }, at(16));
  g = gameStatus(g, ME, { state: 'playing' }, at(16));
  const left = gameStatus(g, 'bruno', { state: 'left' }, at(60));
  assert.deepEqual(kinds(events(g, left)), ['live-left:Bruno']);
  assert.deepEqual(kinds(events(g, gameStatus(g, 'lea', { state: 'failed' }, at(60)))), ['live-left:Léa:failed']);
  // Un invité quitte le salon avant le départ : l'hôte le sait.
  const accepted = answerGame(salon(), 'bruno', 'accept', 'same');
  assert.deepEqual(kinds(events(accepted, gameStatus(accepted, 'bruno', { state: 'left' }, at(20)))), ['live-left:Bruno']);
  // Côté invité : l'hôte annule. L'hôte, lui, l'a décidé : rien.
  const invite = liveInvite({ t: 'game-invite', game: { id: '0123456789abcdef', table, title: 'Glass Lagoon', players: [] } }, { key: 'bruno', name: 'Bruno' }, at(0));
  const guest = guestGame(invite, { key: ME, name: 'Moi' }, 'same');
  assert.deepEqual(kinds(events(guest, { ...guest, phase: 'cancelled' })), ['live-cancelled:Bruno']);
  assert.deepEqual(events(accepted, { ...accepted, phase: 'cancelled' }), []);
  // Côté invité : les réponses des autres ne sont pas les siennes à attendre.
  const room = roomMessage(answerGame(inviteToGame({ ...guest, host: 'bruno' }, { key: 'lea', name: 'Léa' }, at(1))!, 'lea', 'accept', 'same'));
  assert.deepEqual(events(guest, applyRoom(guest, room)), []);
});

test('relevé : la partie finie se dit seulement si j’étais déjà revenu (sinon ses résultats s’ouvrent à mon retour)', () => {
  let g = answerGame(answerGame(salon(), 'bruno', 'accept', 'same'), 'lea', 'accept', 'same');
  // Réglages de l'hôte reçus : leurs scores comptent au classement.
  g = settingsReceived(settingsReceived(g, 'bruno', true), 'lea', true);
  g = startGame(g, at(10));
  for (const key of [ME, 'bruno', 'lea']) g = gameStatus(g, key, { state: 'playing' }, at(16));
  // Je finis le premier, bien avant les autres.
  g = gameStatus(g, ME, { state: 'done', seconds: 120, score: 1_240_500 }, at(140));
  g = gameStatus(g, 'lea', { state: 'done', seconds: 300, score: 980_120 }, at(320));
  const before = g;
  g = gameStatus(g, 'bruno', { state: 'done', seconds: 600, score: 2_418_300 }, at(620));
  assert.equal(g.phase, 'finished');
  const finished = events(before, g);
  assert.deepEqual(kinds(finished), ['live-finished:Bruno']);
  assert.deepEqual(finished[0]!.place, { rank: 2, of: 3 });
  assert.equal(finished[0]!.key, g.id);
  // C'est moi qui reviens le dernier : rien, les résultats s'ouvrent d'eux-mêmes.
  let h = answerGame(salon(), 'bruno', 'accept', 'same');
  h = startGame(h, at(10));
  h = gameStatus(gameStatus(h, ME, { state: 'playing' }, at(16)), 'bruno', { state: 'done', score: 5 }, at(100));
  const last = gameStatus(h, ME, { state: 'done', score: 9 }, at(200));
  assert.equal(last.phase, 'finished');
  assert.deepEqual(events(h, last), []);
});

test('relevé : le gagnant parmi les scores classés, ou moi ; aucun score, aucune place', () => {
  const base = startGame(answerGame(answerGame(salon(), 'bruno', 'accept', 'same'), 'lea', 'accept', 'same'), at(10));
  const ended = (scores: Record<string, number | undefined>) => ({
    ...base,
    phase: 'finished' as const,
    players: base.players.map((p) => (p.key in scores ? { ...p, state: 'done' as const, ...(scores[p.key] !== undefined ? { score: scores[p.key] } : {}), ...(p.host ? {} : { settings: 'ok' as const }) } : p)),
  });
  assert.deepEqual(liveOutcome(ended({ [ME]: 900, bruno: 500, lea: 100 }), ME), { won: true });
  assert.deepEqual(liveOutcome(ended({ [ME]: 300, bruno: 500, lea: 100 }), ME), { who: 'Bruno', place: { rank: 2, of: 3 } });
  assert.deepEqual(liveOutcome(ended({ [ME]: undefined, bruno: undefined, lea: undefined }), ME), {});
  // Léa a joué sans les réglages de l'hôte : hors classement, elle ne gagne pas.
  const offRanked = ended({ [ME]: 300, bruno: 200, lea: 9_999 });
  offRanked.players = offRanked.players.map((p) => (p.key === 'lea' ? { ...p, settings: 'failed' } : p));
  assert.deepEqual(liveOutcome(offRanked, ME), { won: true });
});

// ---------------------------------------------------------------------------
// Textes

const ev = (kind: NoticeKind, who: string, extra: Partial<NoticeEvent> = {}): NoticeEvent => ({ kind, key: `0123456789abcdef|${who}`, at: 0, who, subject: 'Glass Lagoon (Inventé 1987)', ...extra });

test('textes : regroupés par genre, avec les noms ; la raison ; le gagnant, ma place et le chemin des résultats', () => {
  assert.deepEqual(noticeText('live-accepted', [ev('live-accepted', 'Bruno')]), { title: 'Bruno a accepté votre invitation', detail: 'Pour lancer : Menu système > Amis > Mes amis' });
  assert.equal(noticeText('live-accepted', [ev('live-accepted', 'Bruno'), ev('live-accepted', 'Léa')]).title, 'Bruno et Léa ont accepté');
  assert.equal(noticeText('live-accepted', ['Bruno', 'Léa', 'David'].map((n) => ev('live-accepted', n))).title, 'Bruno, Léa et David ont accepté');
  assert.equal(noticeText('live-accepted', ['Maximilien-Alexandre', 'Léa', 'Anne-Charlotte'].map((n) => ev('live-accepted', n))).title, '3 invités ont accepté', 'un nom ne se coupe pas : le nombre');
  assert.deepEqual(noticeText('live-declined', [ev('live-declined', 'David', { reason: 'missing' })]), { title: 'David a décliné votre invitation', detail: 'N’a pas cette table' });
  assert.deepEqual(noticeText('live-declined', [ev('live-declined', 'David', { reason: 'expired' })]), { title: 'Pas de réponse de David' });
  assert.deepEqual(noticeText('live-declined', [ev('live-declined', 'David', { reason: 'missing' }), ev('live-declined', 'Zoé', { reason: 'busy' })]), {
    title: 'David et Zoé ont décliné',
    detail: 'David : pas la table · Zoé : occupé',
  });
  assert.equal(noticeText('live-left', [ev('live-left', 'Bruno')]).title, 'Bruno a quitté la partie');
  assert.equal(noticeText('live-left', [ev('live-left', 'Léa', { reason: 'failed' })]).title, 'La partie de Léa n’a pas démarré');
  assert.equal(noticeText('live-cancelled', [ev('live-cancelled', 'Bruno')]).title, 'Bruno a annulé la partie');
  assert.deepEqual(noticeText('live-finished', [ev('live-finished', 'Bruno', { place: { rank: 2, of: 3 } })]), {
    title: 'Partie entre amis : Bruno gagne',
    detail: 'Résultats : Menu système > Amis · vous : place 2 sur 3',
  });
  assert.equal(noticeText('live-finished', [{ ...ev('live-finished', ''), who: undefined, won: true }]).title, 'Partie entre amis : vous gagnez !');
  assert.equal(noticeText('live-finished', [{ ...ev('live-finished', ''), who: undefined }]).title, 'Partie entre amis terminée');
  setLanguage('en');
  try {
    assert.equal(noticeText('live-accepted', [ev('live-accepted', 'Bruno'), ev('live-accepted', 'Léa')]).title, 'Bruno and Léa accepted');
    assert.equal(noticeText('live-finished', [ev('live-finished', 'Bruno', { place: { rank: 2, of: 3 } })]).detail, 'Results: System menu > Friends · you: rank 2 of 3');
  } finally {
    setLanguage('fr');
  }
});

test('textes : chaque genre de la partie tient sur sa ligne, dans les deux langues, quels que soient les noms et le nombre', () => {
  const long = 'Maximilien-Alexandre de la Tour';
  const live = (Object.keys(NOTICE_RULES) as NoticeKind[]).filter(isLiveNotice);
  assert.deepEqual(live.sort(), ['live-accepted', 'live-cancelled', 'live-declined', 'live-finished', 'live-left']);
  for (const lang of ['fr', 'en'] as const) {
    setLanguage(lang);
    try {
      for (const kind of live) {
        for (const reason of [undefined, 'missing', 'other-version', 'busy', 'expired', 'failed'] as const) {
          for (const n of [1, 2, 4]) {
            const list = Array.from({ length: n }, (_, i) => ev(kind, `${long} ${i}`, { ...(reason ? { reason } : {}), place: { rank: 3, of: 4 } }));
            const text = noticeText(kind, list);
            const what = `${lang} ${kind} ${reason ?? '-'} × ${n}`;
            assert.ok(len(text.title) <= NOTICE_TITLE_MAX, `${what} : titre trop long « ${text.title} »`);
            assert.ok(len(text.detail) <= NOTICE_DETAIL_MAX, `${what} : précision trop longue « ${text.detail} »`);
            // Les noms entiers, ou leur nombre : jamais un nom coupé dans un regroupement.
            if (n > 1 && kind !== 'live-finished' && kind !== 'live-cancelled') assert.match(text.title, /^\d+ /, `${what} : le nombre quand les noms ne tiennent pas`);
          }
        }
      }
    } finally {
      setLanguage('fr');
    }
  }
});

// ---------------------------------------------------------------------------
// La file

const on = { canShow: true };

test('file : la partie entre amis passe avant tout, seule, plus longtemps ; regroupée quand les réponses arrivent ensemble', () => {
  const c = createNoticeCenter();
  // Trois genres ordinaires en attente (un résumé) et deux réponses dans la foulée.
  c.push([
    { kind: 'friend-online', key: 'x', at: 0, who: 'Chloé' },
    { kind: 'download-done', key: 'j', at: 0, subject: 'Medieval Madness' },
    { kind: 'friend-request', key: 'z', at: 0, who: 'Zoé' },
    ev('live-accepted', 'Bruno', { at: 100 }),
    ev('live-accepted', 'Léa', { at: 900 }),
    ev('live-declined', 'David', { at: 950, reason: 'busy' }),
  ]);
  const first = c.tick(2000, on).view;
  assert.equal(first?.title, 'Bruno et Léa ont accepté');
  assert.equal(first?.live, true);
  assert.equal(first?.act?.type, 'live-game');
  assert.equal(c.tick(2000 + NOTICE_SHOW_MS + 100, on).view?.leaving, undefined, 'encore là après la durée ordinaire');
  assert.equal(c.tick(2000 + NOTICE_LIVE_SHOW_MS, on).view?.leaving, true);
  // Puis le refus, seul : jamais fondu dans un résumé.
  const second = c.tick(2000 + NOTICE_LIVE_SHOW_MS + 5000, on).view;
  assert.equal(second?.title, 'David a décliné votre invitation');
  assert.equal(second?.detail, 'Occupé pour l’instant');
  // Enfin le résumé des autres.
  const third = c.tick(2000 + 2 * NOTICE_LIVE_SHOW_MS + 10_000, on).view;
  assert.equal(third?.title, '3 nouveautés');
  assert.equal(third?.live, undefined);
});

test('file : hors du menu des tables, seule la partie entre amis se montre ; les autres attendent, celle qui se montrait part', () => {
  const c = createNoticeCenter();
  c.push([{ kind: 'friend-online', key: 'x', at: 0, who: 'Chloé' }]);
  assert.equal(c.tick(NOTICE_GATHER_MS, on).view?.title, 'Chloé vient de se connecter');
  // Le menu système s'ouvre : elle part ; une réponse arrive, elle se montre là.
  assert.equal(c.tick(NOTICE_GATHER_MS + 500, { canShow: true, liveOnly: true }).view, undefined);
  c.push([ev('live-accepted', 'Bruno', { at: 10_000 })]);
  const shown = c.tick(10_000 + NOTICE_GATHER_MS, { canShow: true, liveOnly: true }).view;
  assert.equal(shown?.title, 'Bruno a accepté votre invitation');
  c.push([{ kind: 'friend-request', key: 'z', at: 11_000, who: 'Zoé' }]);
  assert.equal(c.tick(30_000, { canShow: true, liveOnly: true }).view, undefined, 'la demande d’ami attend le menu des tables');
  assert.equal(c.tick(31_000, on).view?.title, 'Demande d’ami : Zoé');
  // Notifications coupées : la partie entre amis reste.
  c.push([ev('live-left', 'Léa', { at: 40_000 }), { kind: 'friend-online', key: 'y', at: 40_000, who: 'Émile' }]);
  c.clear((e) => isLiveNotice(e.kind));
  assert.deepEqual(c.pending().map((e) => e.kind), ['live-left']);
});

// ---------------------------------------------------------------------------
// Service réel et menu (compilés), sur un réseau d'essai en mémoire.

/* eslint-disable @typescript-eslint/no-require-imports */
const { createLiveGames } = require(path.join(REPO_ROOT, 'app', 'dist', 'live-game.js')) as {
  createLiveGames(o: object): { current(): LiveGame | undefined; create(table: TableEntry): Promise<LiveGame>; invite(key: string, name: string): boolean; stop(): void };
};
type MenuView = { notice?: NoticeView };
const { createMenuNotices } = require(path.join(REPO_ROOT, 'app', 'dist', 'menu-notices.js')) as {
  createMenuNotices(host: object): { observe(): void; view(): MenuView; stop(): void };
};
/* eslint-enable @typescript-eslint/no-require-imports */

test('service et menu : les vraies réponses deviennent une notification regroupée, aussi dans le menu système, même coupées ; rien sur l’écran de la partie', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-notifications-partie-'));
  const vpx = path.join(dir, 'Glass Lagoon.vpx');
  fs.writeFileSync(vpx, 'table');
  const entry = { file: vpx, folder: dir, title: 'Glass Lagoon', info: {} } as unknown as TableEntry;
  let deliver: ((key: string, m: unknown) => void) | undefined;
  const friends = [['bruno', 'Bruno'], ['lea', 'Léa'], ['david', 'David']].map(([key, name]) => ({ key, name, events: [] }));
  const net = {
    state: () => ({ key: { publicKey: ME }, name: 'Moi', friends, enabled: true, incoming: [], outgoing: [] }),
    online: () => true,
    send: () => true,
    onMessage: (cb: (key: string, m: unknown) => void) => ((deliver = cb), () => (deliver = undefined)),
  };
  let changes = 0;
  const games = createLiveGames({ net, dataDir: dir, tables: () => [entry], play: async () => undefined, onChange: () => changes++ });
  let clock = 1_000_000;
  let where: 'menu' | 'library' | 'screen' | 'game' = 'menu';
  let mode: 'all' | 'off' = 'all';
  const chimes: string[] = [];
  const menu = createMenuNotices({
    social: { state: net.state, online: () => false, presenceOf: () => undefined },
    jobs: () => [],
    mode: () => mode,
    canShow: () => where === 'menu',
    redraw: () => undefined,
    now: () => clock,
    live: { game: () => games.current(), me: () => ME, onScreen: () => where === 'screen', canShow: () => where !== 'screen', shown: (v: NoticeView) => chimes.push(v.title) },
  });
  try {
    const game = await games.create(entry);
    for (const [key, name] of [['bruno', 'Bruno'], ['lea', 'Léa'], ['david', 'David']]) assert.ok(games.invite(key!, name!));
    menu.observe();
    // On est sorti du salon, dans le menu système ; notifications coupées : les réponses se montrent quand même.
    where = 'library';
    mode = 'off';
    clock += 20_000;
    const answer = (key: string, a: 'accept' | 'decline', match?: 'same' | 'missing') => deliver!(key, { t: 'game-answer', game: game.id, answer: a, ...(match ? { match } : {}) } satisfies LiveMessage);
    answer('bruno', 'accept', 'same');
    menu.observe();
    clock += 400;
    answer('lea', 'accept', 'same');
    menu.observe();
    clock += NOTICE_GATHER_MS;
    const v = menu.view();
    assert.equal(v.notice?.title, 'Bruno et Léa ont accepté');
    assert.deepEqual(chimes, ['Bruno et Léa ont accepté'], 'un tintement à son entrée');
    menu.view();
    assert.equal(chimes.length, 1, 'un seul, pas à chaque rendu');
    // David décline pendant que l'écran de la partie est ouvert : il le dit déjà, rien ne suit.
    where = 'screen';
    clock += 1000;
    answer('david', 'decline', 'missing');
    menu.observe();
    clock += NOTICE_LIVE_SHOW_MS + 5000;
    assert.equal(menu.view().notice, undefined);
    where = 'library';
    clock += 5000;
    assert.equal(menu.view().notice, undefined, 'vu sur l’écran de la partie : pas redit en sortant');
    assert.ok(changes > 0);
  } finally {
    menu.stop();
    games.stop();
  }
});

// ---------------------------------------------------------------------------
// Pendant la partie d'une autre table

const ROTATIONS: Rotation[] = [0, 90, 180, 270];
const overlap = (a: Rect, b: Rect) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const inside = (r: Rect, z: Rect) => r.x >= z.x && r.y >= z.y && r.x + r.width <= z.x + z.width && r.y + r.height <= z.y + z.height;

test('en partie : la ligne dans le coin du joueur, sous l’invitation sans la toucher, dans la zone, quel que soit le sens', () => {
  for (const zone of [
    { x: 0, y: 0, width: 1920, height: 1080 },
    { x: -1080, y: 200, width: 1080, height: 1920 },
    { x: 1920, y: 0, width: 3840, height: 2160 },
  ]) {
    for (const rotation of ROTATIONS) {
      const unit = Math.min(zone.width, zone.height) / 1080;
      const size = (s: { width: number; height: number }) => ({ width: Math.round(s.width * unit), height: Math.round(s.height * unit) });
      const margin = Math.round(GAME_NOTICE_SIZE.margin * unit);
      const card = gameNoticeBounds(zone, rotation, size(GAME_NOTICE_SIZE.full), margin);
      const alone = gameNoticeBounds(zone, rotation, size(GAME_NOTICE_LINE), margin);
      const under = gameNoticeBounds(zone, rotation, size(GAME_NOTICE_LINE), margin, 'top-left', Math.round((GAME_NOTICE_SIZE.full.height + GAME_NOTICE_LINE.gap) * unit));
      const what = `${zone.width}×${zone.height}, ${rotation}°`;
      assert.ok(inside(alone, zone) && inside(under, zone), `${what} : dans la zone`);
      assert.ok(overlap(alone, card), `${what} : seule, elle prend le coin de l’invitation`);
      assert.ok(!overlap(under, card), `${what} : sous l’invitation, sans la toucher`);
      // Couchée quand le plateau l'est.
      const quarter = rotation === 90 || rotation === 270;
      assert.deepEqual([under.width, under.height], quarter ? [size(GAME_NOTICE_LINE).height, size(GAME_NOTICE_LINE).width] : [size(GAME_NOTICE_LINE).width, size(GAME_NOTICE_LINE).height], what);
    }
  }
});

test('branchements : la ligne par-dessus VPX hors de la bande, le menu système, le clic, le tintement, les résultats au retour', () => {
  const main = read('app', 'src', 'frontend.ts');
  const notices = main.slice(main.indexOf('const menuNotices = createMenuNotices({'), main.indexOf('const liveCanShow'));
  assert.match(notices, /live: \{[\s\S]*onScreen: \(\) => friendsMenu\.live\.onScreen\(\)/);
  assert.match(notices, /state\.phase === 'library' \|\| \(state\.phase === 'playing' && !!playing && !liveBoardUp\(\)\)/, 'par-dessus VPX seulement sans la bande de la partie');
  assert.match(notices, /canShow: \(\) =>[^;]*!friendsMenu\.live\.onScreen\(\)/, 'jamais par-dessus l’écran de la partie');
  assert.match(notices, /shown: \(\) => playUiSound\('news'\)/);
  const corner = main.slice(main.indexOf('function menuCorner('), main.indexOf('function cinemaFor('));
  assert.match(corner, /gameNotices\.line\(state\.phase === 'playing' && playing && corner\.notice\?\.live \? corner\.notice : undefined\)/);
  assert.match(corner, /if \(state\.phase === 'library'\) return corner\.notice\?\.live \? \{ notice: corner\.notice \} : \{\};/);
  assert.match(main, /action\.type === 'live-game'[\s\S]{0,200}friendsMenu\.live\.open\(/);
  const start = main.indexOf('async function play(');
  const play = main.slice(start, start + main.slice(start).search(/\r?\n\}\r?\n/));
  assert.match(play, /!hooks\.double && state\.phase === 'menu' && friendsMenu\.live\.unseenResults\(\)\) friendsMenu\.live\.open\(/, 'résultats pas encore vus : ouverts au retour d’une autre table');
  // Le rendu : la ligne dans la fenêtre de la partie, le coin dans le menu système.
  const notice = read('app', 'renderer', 'game-notice.js');
  assert.match(notice, /view\?\.mode === 'line'/);
  const renderer = read('app', 'renderer', 'frontend.js');
  assert.match(renderer, /s\.phase === 'library' && s\.notice\?\.live \? cornerBox\(s\)/);
  // Textes de la ligne au plancher de 20 px (sur une fenêtre de 76 px de haut à 1 080 px).
  const css = read('app', 'renderer', 'game-notice.css');
  for (const sel of ['.line-title', '.line-detail']) {
    const size = Number(css.match(new RegExp(`\\n${sel.replace('.', '\\.')} \\{[^}]*font-size: calc\\(([\\d.]+) \\* var\\(--l\\)\\)`))?.[1]);
    assert.ok(size >= 20, `${sel} : ${size} px`);
  }
  // Le son : au menu, jamais pendant une partie (pas un appel).
  assert.doesNotMatch(read('packages', 'core', 'src', 'uisounds.ts').slice(read('packages', 'core', 'src', 'uisounds.ts').indexOf('  news: {')), /call: true/);
});
