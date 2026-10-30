// Historique des parties entre amis (demande du 30/10/2026) : chaque partie en direct finie est
// gardée sur la borne (<données>\amis\parties.json), une seule fois, avec la table, la date, et
// chaque joueur (clé, nom, score, rang, hors classement et pourquoi, durée) ; elle survit au
// redémarrage ; un fichier abîmé est mis de côté, jamais écrasé (le tableau du groupe aussi). L'écran
// « Historique des parties » (app/src/game-history-menu.ts) les montre de la plus récente à la plus
// ancienne, la table en titre et les joueurs dessous ; une partie s'ouvre pour revoir son détail.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';
import {
  addToHistory,
  emptyHistory,
  HISTORY_VERSION,
  historyEntry,
  historyStateLabel,
  liveOffReason,
  liveRanked,
  loadBoards,
  loadHistory,
  newSocialState,
  saveHistory,
  setLanguage,
  type GameHistory,
  type HistoryGame,
  type LiveGame,
  type LiveMessage,
  type LivePlayer,
  type TableEntry,
} from '../index';

const key = () => newSocialState().key.publicKey;
const ALEXIS = key();
const BRUNO = key();
const CHLOE = key();
const DORA = key();
const EMILE = key();
const PRINT = 'a'.repeat(64);

function finished(id: string, players: LivePlayer[], extra: Partial<LiveGame> = {}): LiveGame {
  return {
    id,
    host: players[0]!.key,
    table: { table: { title: 'Game of Thrones LE', manufacturer: 'Stern', year: 2015 }, version: 'VPW 1.0', print: PRINT, bytes: 123_456, balls: 3 },
    title: 'Game of Thrones LE (Stern 2015)',
    players,
    phase: 'finished',
    createdAt: '2026-10-30T19:55:00.000Z',
    startAt: '2026-10-30T20:00:00.000Z',
    ...extra,
  };
}

/** La soirée du 30/10/2026 : tous les cas d'un coup. */
const evening = () =>
  finished('0123456789abcdef', [
    { key: ALEXIS, name: 'Alexis', state: 'done', host: true, score: 1_000_000, seconds: 600, balls: 3 },
    { key: BRUNO, name: 'Bruno', state: 'done', settings: 'ok', score: 2_841_350_120, seconds: 720, records: [{ score: 2_841_350_120, rank: 1, initials: 'BRU' }] },
    { key: CHLOE, name: 'Chloé', state: 'done', score: 9_999 },
    { key: DORA, name: 'Dora', state: 'done', settings: 'ok', balls: 5, score: 8_888 },
    { key: EMILE, name: 'Émile', state: 'failed', settings: 'ok' },
  ]);

test('format : chaque joueur, son rang, son score, et pourquoi il est hors classement', () => {
  const entry = historyEntry(evening(), BRUNO, new Date('2026-10-30T20:20:00.000Z'))!;
  assert.deepEqual(entry, {
    id: '0123456789abcdef',
    at: '2026-10-30T20:00:00.000Z',
    endedAt: '2026-10-30T20:20:00.000Z',
    title: 'Game of Thrones LE (Stern 2015)',
    // Sans la taille du .vpx : elle ne sert qu'à l'invitation.
    table: { table: { title: 'Game of Thrones LE', manufacturer: 'Stern', year: 2015 }, version: 'VPW 1.0', print: PRINT, balls: 3 },
    board: `${PRINT}:`,
    host: ALEXIS,
    me: BRUNO,
    players: [
      { key: BRUNO, name: 'Bruno', state: 'done', score: 2_841_350_120, rank: 1, seconds: 720, record: { rank: 1, initials: 'BRU' } },
      { key: ALEXIS, name: 'Alexis', host: true, state: 'done', score: 1_000_000, rank: 2, seconds: 600, balls: 3 },
      { key: CHLOE, name: 'Chloé', state: 'done', score: 9_999, off: 'settings' },
      { key: DORA, name: 'Dora', state: 'done', score: 8_888, off: 'balls', balls: 5 },
      { key: EMILE, name: 'Émile', state: 'failed' },
    ],
  } satisfies HistoryGame);
  // Ex aequo : la même place ; le suivant après eux.
  const tie = historyEntry(finished('1111111111111111', [
    { key: ALEXIS, name: 'Alexis', state: 'done', host: true, score: 500 },
    { key: BRUNO, name: 'Bruno', state: 'done', settings: 'ok', score: 500 },
    { key: CHLOE, name: 'Chloé', state: 'done', settings: 'ok', score: 100, multi: true },
    { key: DORA, name: 'Dora', state: 'done', settings: 'ok', score: 40 },
  ]), ALEXIS)!;
  assert.deepEqual(tie.players.map((p) => [p.name, p.rank, p.off]), [['Alexis', 1, undefined], ['Bruno', 1, undefined], ['Dora', 3, undefined], ['Chloé', undefined, 'multi']]);
  assert.equal(historyEntry({ ...evening(), phase: 'playing' }, BRUNO), undefined, 'seulement une partie finie');
  assert.equal(historyEntry({ ...evening(), startAt: undefined }, BRUNO)!.at, '2026-10-30T19:55:00.000Z', 'sans départ commun : l’ouverture du salon');
  // La version de chaque borne est gardée : un score absent chez une borne en retard s'explique.
  const late = historyEntry(finished('5555555555555555', [
    { key: ALEXIS, name: 'Alexis', state: 'done', host: true, score: 500, proto: 3, app: '0.1.5-essai.15' },
    { key: BRUNO, name: 'Bruno', state: 'done', settings: 'ok', proto: 2, app: '0.1.5-essai.10' },
  ]), ALEXIS)!;
  assert.deepEqual(late.players.map((p) => [p.name, p.proto, p.app]), [['Alexis', 3, '0.1.5-essai.15'], ['Bruno', 2, '0.1.5-essai.10']]);
  setLanguage('fr');
  assert.equal(historyStateLabel(late.players[1]!), 'Cyber Pinball 0.1.5-essai.10 sur sa borne : ni départ automatique ni score en direct, à mettre à jour');
  assert.equal(historyStateLabel(late.players[0]!), undefined);
});

test('hors classement : la raison dit exactement ce que liveRanked refuse', () => {
  for (const host of [true, false])
    for (const settings of [undefined, 'ok', 'failed'] as const)
      for (const balls of [undefined, 3, 5])
        for (const multi of [undefined, true] as const) {
          const p = { ...(host ? { host } : {}), ...(settings ? { settings } : {}), ...(balls ? { balls } : {}), ...(multi ? { multi } : {}) };
          assert.equal(liveOffReason(p, 3) === undefined, liveRanked(p, 3), JSON.stringify(p));
        }
});

test('ajout : une fois par partie, à sa place par date ; une partie pas finie n’entre pas', () => {
  const history = emptyHistory();
  assert.ok(addToHistory(history, evening(), BRUNO));
  assert.equal(addToHistory(history, evening(), BRUNO), false, 'la même partie une seule fois');
  assert.equal(addToHistory(history, { ...evening(), id: 'fedcba9876543210', phase: 'playing' }, BRUNO), false);
  addToHistory(history, finished('2222222222222222', [{ key: ALEXIS, name: 'Alexis', state: 'done', host: true, score: 1 }], { startAt: '2026-10-29T21:00:00.000Z' }), BRUNO);
  addToHistory(history, finished('3333333333333333', [{ key: ALEXIS, name: 'Alexis', state: 'done', host: true, score: 2 }], { startAt: '2026-10-30T22:00:00.000Z' }), BRUNO);
  assert.deepEqual(history.games.map((g) => g.id), ['3333333333333333', '0123456789abcdef', '2222222222222222'], 'de la plus récente à la plus ancienne');
  // Un historique d'un format plus récent n'est pas complété : on ne réécrit pas ce qu'on ne comprend pas.
  assert.equal(addToHistory({ v: HISTORY_VERSION + 1, games: [] }, evening(), BRUNO), false);
});

test('fichier : relu tel qu’écrit ; une partie abîmée laissée de côté ; un fichier illisible mis de côté, jamais écrasé', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-historique-'));
  const file = path.join(dir, 'amis', 'parties.json');
  assert.deepEqual(loadHistory(file), { history: emptyHistory() }, 'pas encore de fichier');
  const history = emptyHistory();
  addToHistory(history, evening(), BRUNO, new Date('2026-10-30T20:20:00.000Z'));
  saveHistory(file, history);
  assert.deepEqual(loadHistory(file).history, history);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')).v, HISTORY_VERSION);
  // Une partie abîmée à la main (sans joueur valable, une clé qui n'en est pas une) : seule elle part.
  const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as GameHistory;
  raw.games.push({ ...raw.games[0]!, id: '4444444444444444', players: [{ key: 'pas-une-cle', name: 'X', state: 'done' }] });
  raw.games.push({ ...raw.games[0]!, id: 'pas-un-id' });
  fs.writeFileSync(file, JSON.stringify(raw));
  assert.deepEqual(loadHistory(file).history.games.map((g) => g.id), ['0123456789abcdef']);
  // Un champ ajouté plus tard (un pays, un tournoi) n'empêche pas la lecture.
  fs.writeFileSync(file, JSON.stringify({ v: HISTORY_VERSION, games: [{ ...raw.games[0], tournament: 'x', players: raw.games[0]!.players.map((p) => ({ ...p, country: 'FR' })) }] }));
  assert.equal(loadHistory(file).history.games[0]!.players.length, 5);
  // Fichier tronqué : mis de côté à côté, l'historique repart vide.
  fs.writeFileSync(file, '{"v":1,"games":[{"id":"0123');
  const loaded = loadHistory(file, new Date('2026-10-31T08:00:00.000Z'));
  assert.equal(loaded.setAside, path.join(dir, 'amis', 'parties.illisible-20261031T080000.json'));
  assert.equal(fs.readFileSync(loaded.setAside!, 'utf8'), '{"v":1,"games":[{"id":"0123');
  assert.equal(fs.existsSync(file), false);
  // Même règle pour le tableau du groupe : un records.json illisible n'est pas écrasé au prochain enregistrement.
  const boards = path.join(dir, 'amis', 'records.json');
  fs.writeFileSync(boards, 'pas du json');
  const aside: string[] = [];
  assert.deepEqual(loadBoards(boards, (where) => aside.push(where)), {});
  assert.equal(aside.length, 1);
  assert.equal(fs.readFileSync(aside[0]!, 'utf8'), 'pas du json');
});

// ---------------------------------------------------------------------------
// Le service (app/src/live-game.ts) et l'écran (app/src/game-history-menu.ts), compilés.

/* eslint-disable @typescript-eslint/no-require-imports */
const { createLiveGames } = require(path.join(REPO_ROOT, 'app', 'dist', 'live-game.js')) as {
  createLiveGames(o: object): { accept(id: string): Promise<{ match: string }>; history(): readonly HistoryGame[]; stop(): void };
};
interface Built {
  heading: string;
  subheading?: string;
  sections: { title?: string; rows: { text: string; detail?: string; badges?: string[]; action?: number }[] }[];
  actions: { label: string; icon?: string; run: () => void }[];
}
const { createGameHistoryMenu } = require(path.join(REPO_ROOT, 'app', 'dist', 'game-history-menu.js')) as {
  createGameHistoryMenu(o: object): { open(at?: number): void; detail(): string };
};
/* eslint-enable @typescript-eslint/no-require-imports */

test('service : une partie finie entre à l’historique de l’invité, et y reste après un redémarrage', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-historique-service-'));
  const folder = path.join(root, 'tables', 'GoT');
  fs.mkdirSync(folder, { recursive: true });
  const table = { id: 'got', file: path.join(folder, 'GoT.vpx'), folder, title: 'Game of Thrones LE', manufacturer: 'Stern', year: 2015, info: {} } as unknown as TableEntry;
  fs.writeFileSync(table.file, 'table');
  const { createHash } = await import('node:crypto');
  const print = createHash('sha256').update('table').digest('hex');
  const id = '0123456789abcdef';
  let deliver: ((k: string, m: unknown) => void) | undefined;
  const make = () =>
    createLiveGames({
      net: { state: () => ({ key: { publicKey: BRUNO }, name: 'Bruno', friends: [{ key: ALEXIS, name: 'Alexis' }] }), online: () => true, send: () => true, onMessage: (cb: typeof deliver) => ((deliver = cb), () => undefined) },
      dataDir: path.join(root, 'data'),
      tables: () => [table],
      play: async () => undefined,
    });
  const guest = make();
  try {
    deliver!(ALEXIS, { t: 'game-invite', game: { id, table: { table: { title: 'Game of Thrones LE', manufacturer: 'Stern', year: 2015 }, print }, title: 'Game of Thrones LE (Stern 2015)', players: [{ key: ALEXIS, name: 'Alexis' }] } });
    assert.equal((await guest.accept(id)).match, 'same');
    assert.deepEqual(guest.history(), []);
    const room: LiveMessage = {
      t: 'game-room',
      game: id,
      phase: 'finished',
      players: [
        { key: ALEXIS, name: 'Alexis', state: 'done', host: true, score: 1_000 },
        { key: BRUNO, name: 'Bruno', state: 'done', settings: 'ok', score: 2_000 },
      ],
    };
    deliver!(ALEXIS, room);
    // L'hôte renvoie la salle finie plusieurs fois : la partie n'entre qu'une fois.
    deliver!(ALEXIS, room);
    assert.deepEqual(guest.history().map((g) => [g.title, g.me, g.players.map((p) => [p.name, p.rank, p.score])]), [['Game of Thrones LE (Stern 2015)', BRUNO, [['Bruno', 1, 2000], ['Alexis', 2, 1000]]]]);
  } finally {
    guest.stop();
  }
  // Redémarrage de la borne : un nouveau service relit parties.json.
  const again = make();
  try {
    assert.deepEqual(again.history().map((g) => g.id), [id]);
  } finally {
    again.stop();
  }
});

function screens(history: readonly HistoryGame[]) {
  const opened: { build: () => Built; at?: number }[] = [];
  let backs = 0;
  const menu = createGameHistoryMenu({ library: { openCustom: (build: () => Built, at?: number) => opened.push({ build, at }) }, history: () => history, back: () => backs++ });
  return { menu, last: () => opened.at(-1)!, backs: () => backs };
}

test('écran : de la plus récente à la plus ancienne, par jour ; la table en titre, les joueurs dessous ; une partie s’ouvre', () => {
  setLanguage('fr');
  const history = emptyHistory();
  addToHistory(history, evening(), BRUNO);
  addToHistory(history, finished('2222222222222222', [{ key: ALEXIS, name: 'Alexis', state: 'done', host: true, score: 1 }, { key: BRUNO, name: 'Bruno', state: 'left', settings: 'ok' }], { title: 'The Goonies (Original 2024)', startAt: '2026-10-29T21:00:00.000Z' }), BRUNO);
  const { menu, last, backs } = screens(history.games);
  assert.match(menu.detail(), /^Dernière : Game of Thrones LE \(Stern 2015\), 30\/10\/2026$/);
  menu.open();
  const list = last().build();
  assert.equal(list.heading, 'Historique des parties');
  assert.equal(list.subheading, '2 parties entre amis sur cette borne');
  assert.deepEqual(list.sections.map((s) => s.title), ['Vendredi 30 octobre 2026', 'Jeudi 29 octobre 2026']);
  const [got] = list.sections[0]!.rows;
  assert.equal(got!.text, 'Game of Thrones LE (Stern 2015)');
  assert.equal(
    got!.detail!.replace(/\u202f|\u00a0/g, ' '),
    '1. Bruno (vous) 2 841 350 120 · 2. Alexis 1 000 000 · Chloé 9 999, hors classement · Dora 8 888, hors classement · Émile, score inconnu',
  );
  assert.equal(got!.badges!.length, 1, 'l’heure');
  assert.deepEqual(list.actions.map((a) => a.label), ['Game of Thrones LE (Stern 2015)', 'The Goonies (Original 2024)', 'Retour']);
  assert.equal(new Set(list.actions.map((a) => a.icon)).size, 2, 'les parties à choisir, puis Retour');
  // Le détail d'une partie.
  list.actions[0]!.run();
  const detail = last().build();
  assert.equal(detail.heading, 'Game of Thrones LE (Stern 2015)');
  assert.match(detail.subheading!, /^Vendredi 30 octobre 2026, \d\d:\d\d$/);
  const texts = detail.sections.flatMap((s) => s.rows.map((r) => `${r.text} | ${r.detail ?? ''}`.replace(/\u202f|\u00a0/g, ' ')));
  assert.deepEqual(texts, [
    'Version : VPW 1.0 | 3 billes par partie',
    'Hôte : Alexis | 5 joueurs',
    '1. Bruno (vous) — 2 841 350 120 | Record enregistré, place 1 du tableau · 12 min',
    '2. Alexis — 1 000 000 | 10 min',
    'Chloé — 9 999 | Hors classement : réglages de l’hôte non reçus',
    'Dora — 8 888 | Hors classement : 5 billes au lieu de 3',
    'Émile — Score non disponible | La partie n’a pas démarré de son côté',
    '2 scores hors classement | Gardé ici, il ne compte ni au classement de la partie ni aux records du groupe',
  ]);
  // Retour : la liste, le curseur sur la partie ouverte ; puis la rubrique Amis.
  detail.actions.at(-1)!.run();
  assert.equal(last().at, 0);
  last().build().actions.at(-1)!.run();
  assert.equal(backs(), 1);
});

test('écran : sans partie, il le dit, et en anglais aussi', () => {
  setLanguage('fr');
  const { menu, last } = screens([]);
  assert.equal(menu.detail(), 'Les parties entre amis jouées sur cette borne');
  menu.open();
  assert.equal(last().build().sections[0]!.rows[0]!.text, 'Aucune partie entre amis pour l’instant');
  setLanguage('en');
  try {
    const history = emptyHistory();
    addToHistory(history, evening(), BRUNO);
    const { menu: en, last: lastEn } = screens(history.games);
    en.open();
    const built = lastEn().build();
    assert.equal(built.heading, 'Game history');
    assert.deepEqual(built.sections.map((s) => s.title), ['Friday, 30 October 2026']);
    assert.match(built.sections[0]!.rows[0]!.detail!, /Chloé 9,999, not ranked/);
  } finally {
    setLanguage('fr');
  }
});
