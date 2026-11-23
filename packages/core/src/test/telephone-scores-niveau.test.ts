// Scores, Mon niveau et Activité récente au téléphone, lot 5 (18/11/2026) : les messages du téléphone
// bornés par le cœur (ranks avec `all`, page-open, activity-act) ; Mon niveau et ses pages, les écrans
// mêmes de la borne (level-menu.ts, phone-pages.ts) ; l'Activité récente par jour, chaque ligne par sa
// référence, menée à son écran ; « Toutes les tables » du même calcul que l'écran « Tables »
// (rankings-menu.ts), chaque table par son rang dans la liste du téléphone (remote-ranks.ts). Le
// parcours dans la vraie page : la démonstration interne des Scores au téléphone (telecommande.test.ts).

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { setLanguage } from '../i18n';
import { emptyLevels } from '../levels';
import type { NoticeEvent, NoticeKind } from '../notices';
import { parsePhoneMessage } from '../remote';
import type { TableEntry } from '../tables';
import { fakeActivityFriends, fakeActivityLive, fakeMenuLibrary, fakeSocialNet } from './doublures';
import { REPO_ROOT } from './i18n-scan';

test('Scores et niveau au téléphone : ranks « toutes les tables », page-open et activity-act bornés par le cœur', () => {
  assert.deepEqual(parsePhoneMessage({ t: 'ranks', s: 2, scope: 'world', period: 'week', all: true }), { t: 'ranks', s: 2, scope: 'world', period: 'week', all: true });
  assert.equal(parsePhoneMessage({ t: 'ranks', s: 2, scope: 'world', period: 'week', all: true, v: 1, i: 0 }), undefined, 'toutes les tables : sans table');
  assert.equal(parsePhoneMessage({ t: 'ranks', s: 2, scope: 'world', period: 'week', all: 'oui' }), undefined);
  assert.deepEqual(parsePhoneMessage({ t: 'page-open', s: 3, page: 'badges' }), { t: 'page-open', s: 3, page: 'badges' });
  assert.deepEqual(parsePhoneMessage({ t: 'page-open', s: 3 }), { t: 'page-open', s: 3 }, 'aucune page');
  assert.equal(parsePhoneMessage({ t: 'page-open', s: 3, page: 'reglages' }), undefined, 'une page inconnue');
  assert.deepEqual(parsePhoneMessage({ t: 'activity-act', s: 4, a: 'open', ref: '0123456789abcdef' }), { t: 'activity-act', s: 4, a: 'open', ref: '0123456789abcdef' });
  assert.deepEqual(parsePhoneMessage({ t: 'activity-act', s: 4, a: 'clear' }), { t: 'activity-act', s: 4, a: 'clear' });
  assert.equal(parsePhoneMessage({ t: 'activity-act', s: 4, a: 'open', ref: 'friend-online|x|2026-11-18' }), undefined, 'une référence, jamais la clé d’une ligne');
  assert.equal(parsePhoneMessage({ t: 'activity-act', s: 4, a: 'clear', ref: '0123456789abcdef' }), undefined);
});

/* eslint-disable @typescript-eslint/no-require-imports */
type Page = { heading: string; lead?: string; sections: { title?: string; rows: { text: string; medal?: { rarity: string; earned: boolean }; progress?: number; aside?: string }[] }[] };
const { createLevelMenu } = require(path.join(REPO_ROOT, 'app', 'dist', 'level-menu.js')) as {
  createLevelMenu(host: object): { remoteSummary(): { level: number; title: string; xp: string; progress: number; week: string }; remotePage(page: string): Page };
};
const { createActivityMenu } = require(path.join(REPO_ROOT, 'app', 'dist', 'activity-menu.js')) as {
  createActivityMenu(host: object): {
    record(events: NoticeEvent[]): void;
    remote(full: boolean): { unread: number; days?: { title: string; rows: { ref: string; title: string; gone?: string; go?: { where: string; key?: string }; unread?: true }[] }[] };
    remoteOpen(ref: string, back: () => void): void;
    remoteClear(): void;
    unread(): number;
  };
};
const { createRankingsMenu } = require(path.join(REPO_ROOT, 'app', 'dist', 'rankings-menu.js')) as {
  createRankingsMenu(host: object): { remoteTables(scope: string, period: string): { unavailable?: string; scopes: { scope: string; reason?: string; current: boolean }[]; sections: { title: string; rows: { file: string; title: string; lead?: string; mine?: string; reason?: string }[] }[] } };
};
const { createRemoteRanks } = require(path.join(REPO_ROOT, 'app', 'dist', 'remote-ranks.js')) as {
  createRemoteRanks(host: object): { all(scope: string, period: string): { all?: { sections: { rows: { i: number; title: string }[] }[] }; empty?: { title: string } } };
};
/* eslint-enable @typescript-eslint/no-require-imports */

test('Mon niveau au téléphone : le résumé, et les écrans mêmes de la borne (sans leurs actions)', () => {
  setLanguage('fr');
  const menu = createLevelMenu({
    library: fakeMenuLibrary({ openCustom: () => undefined, openSystem: () => undefined }),
    net: fakeSocialNet({ state: () => ({ badges: [{ id: 'first-game', at: '2026-11-01T20:00:00.000Z' }], key: { publicKey: 'a'.repeat(64) }, name: 'Camille' }), avatarFile: () => undefined }),
    levels: { state: () => ({ ...emptyLevels(), xp: 1234 }), facts: () => ({ games: 3, tables: 2, seconds: 600, longestTable: 300, records: 0, championTables: 0 }) },
    openProfile: () => undefined,
    now: () => new Date('2026-11-18T20:00:00Z'),
  });
  const s = menu.remoteSummary();
  assert.ok(s.level >= 1 && s.title.startsWith('Mon niveau · ') && s.xp.endsWith('XP') && s.progress >= 0 && s.progress <= 1 && s.week.includes('cette semaine'), JSON.stringify(s));
  const level = menu.remotePage('level');
  assert.equal(level.heading, 'Mon niveau');
  assert.ok(level.sections.some((x) => x.title === 'Badges les plus proches' && x.rows.every((r) => r.medal && !r.medal.earned)), 'les badges les plus proches, dessinés (éteints)');
  assert.ok(level.sections[0]!.rows.some((r) => typeof r.progress === 'number'), 'la barre du niveau');
  const badges = menu.remotePage('badges');
  assert.equal(badges.heading, 'Mes badges');
  assert.ok(badges.sections.flatMap((x) => x.rows).some((r) => r.medal?.earned), 'Mes badges : le badge reçu brille');
  const rules = menu.remotePage('rules');
  assert.equal(rules.heading, 'Comment gagner des XP');
  assert.ok(rules.lead && rules.sections.length >= 4, 'le barème entier');
  assert.ok(!JSON.stringify([level, badges, rules]).includes('"run"'), 'jamais une action de la borne');
});

test('Activité récente au téléphone : par jour, chaque ligne par sa référence, menée à son écran', () => {
  setLanguage('fr');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-activite-tel-'));
  const T0 = new Date(2026, 10, 18, 20, 0, 0).getTime();
  const BRUNO = 'b'.repeat(64);
  const did: string[] = [];
  const menu = createActivityMenu({
    dataDir: dir,
    library: fakeMenuLibrary({ openCustom: () => undefined, openSystem: () => undefined, cursor: () => 0, isShowing: () => false, runSystemItem: () => undefined, hasSystemItem: () => true, openDownloads: () => undefined }),
    hasDownload: () => false,
    friends: fakeActivityFriends({ isFriend: (k: string) => k === BRUNO, online: () => true, openFriend: () => did.push('fiche') }),
    live: fakeActivityLive({ hasInvite: (id: string) => id === 'aaaaaaaaaaaaaaaa', openInvite: (id: string) => did.push(`invitation ${id.slice(0, 1)}`), inviteEnd: () => ({ why: 'expired', name: 'Bruno', title: 'Neon Abyss' }) }),
    now: () => T0 + 600_000,
  });
  const ev = (kind: NoticeKind, key: string, at: number): NoticeEvent => ({ kind, key, at, who: 'Bruno', player: BRUNO });
  menu.record([ev('friend-online', 'o1', T0), ev('live-invite', 'aaaaaaaaaaaaaaaa', T0 + 1000), ev('live-invite', 'eeeeeeeeeeeeeeee', T0 - 86_400_000)]);
  assert.deepEqual(menu.remote(false), { unread: menu.unread() }, 'la cloche seule tant que la feuille est fermée');
  const full = menu.remote(true);
  assert.deepEqual(full.days?.map((d) => d.title), ['Aujourd’hui', 'Hier']);
  const rows = full.days!.flatMap((d) => d.rows);
  assert.ok(rows.every((r) => /^[0-9a-f]{16}$/.test(r.ref)), 'une référence par ligne, jamais sa clé');
  assert.ok(!JSON.stringify(full).includes('aaaaaaaaaaaaaaaa'), 'aucune clé de ligne au téléphone');
  const invite = rows.find((r) => r.go?.where === 'borne');
  const online = rows.find((r) => r.go?.where === 'profile');
  const expired = rows.find((r) => r.gone);
  assert.ok(invite && online?.go?.key === BRUNO && expired && !expired.go, 'une invitation : à la borne ; un ami : son profil au téléphone ; expirée : grisée avec sa raison');
  menu.remoteOpen(online!.ref, () => undefined);
  assert.deepEqual(did, [], 'un profil s’ouvre au téléphone lui-même : rien à la borne');
  menu.remoteOpen(invite!.ref, () => undefined);
  menu.remoteOpen('ffffffffffffffff', () => undefined);
  assert.deepEqual(did, ['invitation a'], 'une invitation s’ouvre à la borne ; une référence inconnue : rien');
  assert.ok(!menu.remote(true).days!.flatMap((d) => d.rows).find((r) => r.ref === invite!.ref)?.unread, 'touchée, la ligne est lue');
  menu.remoteClear();
  assert.deepEqual(menu.remote(true).days, [], 'effacer');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('Toutes les tables au téléphone : le calcul de l’écran « Tables », chaque table par son rang dans la liste', () => {
  setLanguage('fr');
  const table = (title: string, file: string, lastRun?: string) =>
    ({ id: file, emulator: 'vpx', file: path.join('D:', 'Borne', 'tables', file), folder: path.join('D:', 'Borne', 'tables'), title, manufacturer: 'Studio Exemple', year: 2025, infoFile: '', info: lastRun ? { User: { LastRun: lastRun } } : {} }) as unknown as TableEntry;
  const TABLES = [table('Atlas Rising', 'atlas.vpx'), table('Copper Comet', 'copper.vpx'), table('Lunar Diner', 'lunar.vpx', '2026-11-16T21:00:00')];
  const line = (rank: number, name: string, score: number, mine = false) => ({ rank, key: name, name, country: 'FR', score, at: '2026-11-13T20:00:00Z', how: 'rom', id: `${name}-${score}`, ...(mine ? { mine: true } : {}), face: {} });
  let sharing = true;
  let clock = new Date('2026-11-18T20:00:00Z').getTime();
  const menu = createRankingsMenu({
    library: fakeMenuLibrary({ openCustom: () => undefined, openScores: () => undefined }),
    tables: () => TABLES,
    local: () => ({ lines: [], games: 0, tableBoard: false, everyGame: false, romWithoutMap: false }),
    network: (t: TableEntry) => {
      if (!sharing) return { lines: [], players: 0, unavailable: 'Partage désactivé : Communauté > Partage et réseau' };
      if (t.title === 'Atlas Rising') return { lines: [line(1, 'Kiko', 12_345_678), line(2, 'Moi', 9_000_000, true)], players: 14, me: { rank: 2 } };
      return { lines: [], players: 0 };
    },
    zoneKeys: () => [],
    openSharing: () => undefined,
    // Les classements se gardent deux secondes (rankings-menu.ts) : l'horloge avance entre deux lectures.
    now: () => (clock += 5000),
  });
  const all = menu.remoteTables('world', 'all');
  assert.deepEqual(all.sections.map((s) => s.title), ['Jouées récemment', 'Toutes les autres tables · A–Z']);
  const atlas = all.sections[1]!.rows.find((r) => r.title === 'Atlas Rising');
  assert.ok(atlas?.lead?.includes('Kiko') && atlas.mine === 'tu es 2ᵉ', `une ligne par table : le premier, ma place ${JSON.stringify(atlas)}`);
  assert.ok(all.sections[1]!.rows.find((r) => r.title === 'Copper Comet')?.reason, 'une table sans score : sa raison');
  // Au téléphone : la liste envoyée (ici deux tables seulement, comme en mode invité) ; jamais un fichier.
  const remote = createRemoteRanks({ tables: () => TABLES.slice(0, 2), current: () => undefined, scores: () => undefined, rankings: () => undefined, images: { src: () => undefined, get: () => undefined, reset: () => undefined }, all: (sc: string, p: string) => menu.remoteTables(sc, p) });
  const shown = remote.all('world', 'all');
  assert.deepEqual(shown.all?.sections.flatMap((s) => s.rows.map((r) => `${r.i}:${r.title}`)), ['0:Atlas Rising', '1:Copper Comet'], 'chaque table par son rang ; hors de la liste envoyée, pas montrée');
  assert.ok(!JSON.stringify(shown).includes('.vpx'), 'jamais le fichier d’une table');
  sharing = false;
  assert.ok(menu.remoteTables('world', 'all').unavailable, 'partage coupé : pourquoi rien');
});

test('Scores et niveau au téléphone : la page, son script servi par la borne', () => {
  const page = fs.readFileSync(path.join(REPO_ROOT, 'app', 'renderer', 'telephone', 'telephone.html'), 'utf8');
  const script = (name: string) => page.indexOf(`<script src="${name}"></script>`);
  assert.ok(script('telephone-groupes.js') < script('telephone-niveau.js') && script('telephone-niveau.js') < script('telephone.js'), 'telephone-niveau.js après les groupes, avant telephone.js');
  const remote = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'phone-remote.ts'), 'utf8');
  assert.match(remote, /'\/telephone-niveau\.js': 'telephone\/telephone-niveau\.js'/, 'servi au téléphone');
});
