// Classements au téléphone (app/src/remote-ranks.ts) : ce que la borne envoie à la vue Scores est
// ce que montre son tableau des scores (scoreboard-menu.ts), sans rien de plus. Ni clé de joueur, ni
// identifiant de score, ni chemin : une table est un rang de la liste, une pastille un jeton. Le
// parcours de bout en bout, avec la vraie page du téléphone, est dans telecommande.test.ts.

import assert from 'node:assert/strict';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';
import { avatarView, setLanguage, type RankingScope, type ScorePeriod, type TableEntry } from '../index';

interface Board {
  table: { title: string; detail?: string };
  scopes: { scope: RankingScope; label: string; current: boolean; reason?: string }[];
  tabs: { period: ScorePeriod; current: boolean }[];
  lines: { rank: string; name: string; score: string; avatar?: { src?: string; initials: string }; flag?: string; status?: { state: string } }[];
  empty?: { title: string };
}
interface RemoteRanks {
  tables(): { items: { label: string; detail?: string }[]; current: number; locked?: string; files: string[] };
  board(file: string | undefined, scope: RankingScope, period: ScorePeriod): { file: string; board: Board } | { empty: { title: string; detail: string } };
  avatar(token: string): string | undefined;
  reset(): void;
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createRemoteRanks } = require(path.join(REPO_ROOT, 'app', 'dist', 'remote-ranks.js')) as { createRemoteRanks(host: object): RemoteRanks };
const { createRemoteImages } = require(path.join(REPO_ROOT, 'app', 'dist', 'remote-images.js')) as { createRemoteImages(): object };

const NOW = new Date(2026, 10, 9, 21, 30);
const KEY = 'b'.repeat(64);
const SCORE_ID = 'c'.repeat(40);
const AVATAR = path.join('D:', 'Borne', 'data', 'avatars', `${'d'.repeat(64)}.png`);
const table = (title: string, file: string): TableEntry => ({ id: file, emulator: 'vpx', file: path.join('D:', 'Borne', 'tables', file), folder: path.join('D:', 'Borne', 'tables'), title, manufacturer: 'Studio Exemple', year: 2025, infoFile: '', info: {} }) as TableEntry;
const NEON = table('Neon Abyss', 'neon.vpx');
const ORBITE = table('Orbite Basse', 'orbite.vpx');

function host(over: Record<string, unknown> = {}) {
  return {
    tables: () => [NEON, ORBITE],
    current: () => ORBITE,
    scores: () => ({ lines: [{ rank: 1, score: 12_400_250, initials: 'CAM', at: NOW.toISOString() }], games: 1, tableBoard: false, everyGame: true, romWithoutMap: false }),
    rankings: (_t: TableEntry, scope: RankingScope) =>
      scope === 'country'
        ? { lines: [], players: 0, unavailable: 'Pays non choisi : Amis > Partage et réseau' }
        : {
            lines: [{ rank: 1, key: KEY, id: SCORE_ID, name: 'Bruno', country: 'FR', score: 952_100_000, at: NOW.toISOString(), how: 'rom', face: avatarView(KEY, 'Bruno', AVATAR), status: { state: 'playing', label: 'En partie' } }],
            players: 1,
            complete: true,
            note: 'Même version de la table que la vôtre',
          },
    now: () => NOW,
    images: createRemoteImages(),
    ...over,
  };
}

test('classements au téléphone : le tableau de la borne, rien d’autre (ni clé, ni identifiant, ni chemin)', () => {
  setLanguage('fr');
  const ranks = createRemoteRanks(host());
  const list = ranks.tables();
  assert.deepEqual(list.items.map((x) => x.label), ['Neon Abyss', 'Orbite Basse']);
  assert.equal(list.current, 1, 'la table de la borne');
  const shown = ranks.board(undefined, 'world', 'all');
  assert.ok('board' in shown);
  assert.equal(shown.file, ORBITE.file, 'sans table choisie : celle de la borne');
  const { board } = shown;
  assert.deepEqual(board.scopes.map((s) => s.scope), ['cabinet', 'friends', 'country', 'world']);
  assert.equal(board.scopes.find((s) => s.scope === 'country')?.reason, 'Pays non choisi : Amis > Partage et réseau', 'une portée indisponible, avec sa raison');
  assert.equal(board.scopes.find((s) => s.scope === 'world')?.reason, undefined);
  const line = board.lines[0]!;
  assert.equal(line.name, 'Bruno');
  assert.equal(line.flag, 'drapeaux/fr.svg');
  assert.equal(line.status?.state, 'playing');
  const token = line.avatar?.src?.slice('images/'.length) ?? '';
  assert.match(line.avatar?.src ?? '', /^images\/[A-Za-z0-9_-]{22}$/, 'une pastille sous un jeton');
  assert.equal(ranks.avatar(token), AVATAR, 'le jeton mène au fichier, gardé à la borne');
  assert.equal(ranks.avatar('A'.repeat(22)), undefined);
  const sent = JSON.stringify({ items: list.items, current: list.current, board });
  for (const secret of [KEY, SCORE_ID, AVATAR, 'cyber-media', NEON.file, ORBITE.file, 'D:']) assert.ok(!sent.includes(secret) && !sent.includes(JSON.stringify(secret).slice(1, -1)), secret);
  ranks.reset();
  assert.equal(ranks.avatar(token), undefined, 'la télécommande endormie : le jeton ne vaut plus rien');
  // Une table choisie au téléphone ; une table disparue : celle de la borne.
  const neon = ranks.board(NEON.file, 'cabinet', 'all');
  assert.ok('board' in neon && neon.board.table.title === 'Neon Abyss' && neon.board.lines[0]?.name === 'CAM');
  const gone = ranks.board('ailleurs.vpx', 'cabinet', 'all');
  assert.ok('board' in gone && gone.file === ORBITE.file);
});

test('classements au téléphone : fermés, ou aucune table, la page le dit', () => {
  setLanguage('fr');
  const closed = createRemoteRanks(host({ closed: () => 'Fermés en mode invité.' }));
  const a = closed.board(undefined, 'cabinet', 'all');
  assert.ok('empty' in a && a.empty.title === 'Classements fermés' && a.empty.detail === 'Fermés en mode invité.');
  assert.equal(closed.tables().locked, 'Fermés en mode invité.');
  const none = createRemoteRanks(host({ tables: () => [], current: () => undefined }));
  const b = none.board(undefined, 'world', 'all');
  assert.ok('empty' in b && b.empty.title === 'Aucune table sur cette borne');
  assert.equal(none.tables().current, -1);
});
