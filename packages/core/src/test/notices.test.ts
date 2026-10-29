// Notifications du menu des tables (notices.ts, app/src/menu-notices.ts). Ces tests fixent la
// classe de comportement, pas seulement les cas d'aujourd'hui :
// - une seule notification à la fois, à son heure (rassemblement, durée, départ, pause) ;
// - un même genre arrivé ensemble n'en fait qu'une, trois genres ou plus un résumé : jamais
//   d'empilement, même au retour d'une longue partie ;
// - rien quand l'écran ne s'y prête pas ; ce qui attend expire, ou tombe quand ça n'a plus lieu
//   d'être ; le même évènement n'est pas redit avant son délai ;
// - les relevés du réseau et des téléchargements ne disent que ce qui est nouveau (jamais l'état
//   trouvé au démarrage, ni les vieux records qu'un ami renvoie en se reconnectant) ;
// - chaque genre a sa règle, son texte et sa part du résumé, dans les deux langues, et chaque
//   texte tient sur sa ligne quels que soient les noms ;
// - le menu des tables ne montre rien pendant une partie, en attente, en mode invité, sous un
//   écran plein ou un constat : la condition de app/src/frontend.ts est relevée.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import type { DownloadJob } from '../downloadqueue';
import { setLanguage } from '../i18n';
import {
  NOTICE_DETAIL_MAX,
  NOTICE_GAP_MS,
  NOTICE_GATHER_MS,
  NOTICE_LEAVE_MS,
  NOTICE_RULES,
  NOTICE_SHOW_MS,
  NOTICE_TITLE_MAX,
  createNoticeCenter,
  digestText,
  downloadNotices,
  downloadSnapshot,
  friendsOnlineView,
  nameList,
  noticeText,
  shortened,
  socialNotices,
  socialSnapshot,
  type NoticeEvent,
  type NoticeKind,
} from '../notices';
import { newSocialState, type Presence, type SocialEvent, type SocialState } from '../social';
import { REPO_ROOT } from './i18n-scan';

const KINDS = Object.keys(NOTICE_RULES) as NoticeKind[];
const on = { canShow: true };
const ev = (kind: NoticeKind, key: string, at: number, extra: Partial<NoticeEvent> = {}): NoticeEvent => ({ kind, key, at, who: key, ...extra });
const len = (s: string | undefined) => [...(s ?? '')].length;

test('notifications : une seule à la fois, après le rassemblement, puis son départ et une pause', () => {
  const c = createNoticeCenter();
  c.push([ev('friend-online', 'Bruno', 1000)]);
  // Rassemblement : rien tout de suite, la file dit quand repasser.
  assert.deepEqual(c.tick(1000, on), { nextAt: 1000 + NOTICE_GATHER_MS });
  const shown = c.tick(1000 + NOTICE_GATHER_MS, on);
  assert.equal(shown.view?.title, 'Bruno vient de se connecter');
  assert.equal(shown.view?.act?.type, 'friends');
  const start = 1000 + NOTICE_GATHER_MS;
  // Même id à chaque rendu tant qu'elle est là (son entrée ne rejoue pas).
  assert.equal(c.tick(start + 3000, on).view?.id, shown.view?.id);
  assert.equal(c.tick(start + NOTICE_SHOW_MS, on).view?.leaving, true);
  assert.deepEqual(c.tick(start + NOTICE_SHOW_MS + NOTICE_LEAVE_MS, on), {});
  // La suivante attend la pause.
  c.push([ev('download-done', 'j1', start + NOTICE_SHOW_MS + NOTICE_LEAVE_MS, { subject: 'Attack from Mars' })]);
  const gone = start + NOTICE_SHOW_MS + NOTICE_LEAVE_MS;
  assert.equal(c.tick(gone + NOTICE_GATHER_MS - 1, on).view, undefined);
  const next = c.tick(Math.max(gone + NOTICE_GAP_MS, gone + NOTICE_GATHER_MS), on).view;
  assert.equal(next?.title, 'Téléchargement fini');
  assert.equal(next?.detail, 'Attack from Mars');
  assert.notEqual(next?.id, shown.view?.id);
});

test('notifications : un même genre arrivé ensemble en fait une, la plus urgente passe d’abord', () => {
  const c = createNoticeCenter();
  c.push([ev('friend-online', 'Bruno', 0), ev('friend-online', 'Chloé', 300), ev('friend-online', 'David', 900), ev('friend-request', 'Zoé', 1000)]);
  const first = c.tick(5000, on).view;
  assert.equal(first?.title, 'Demande d’ami : Zoé', 'la demande d’ami avant les connexions');
  assert.equal(first?.tone, 'warning');
  assert.equal(first?.act?.type, 'friend-requests');
  const second = c.tick(5000 + NOTICE_SHOW_MS + NOTICE_LEAVE_MS + NOTICE_GAP_MS, on).view;
  assert.equal(second?.title, '3 amis viennent de se connecter');
  assert.equal(second?.detail, 'Bruno, Chloé et David');
  assert.equal(c.pending().length, 0);
});

test('notifications : trois genres ou plus qui attendent font un seul résumé', () => {
  const c = createNoticeCenter();
  // Pendant une partie : rien ne se montre, tout attend.
  c.push([ev('friend-online', 'Bruno', 0), ev('friend-online', 'Chloé', 10), ev('download-done', 'j1', 20, { subject: 'Medieval Madness' }), ev('friend-request', 'Zoé', 30)]);
  assert.equal(c.tick(60_000, { canShow: false }).view, undefined);
  const digest = c.tick(61_000, on).view;
  assert.equal(digest?.title, '4 nouveautés');
  assert.equal(digest?.detail, '1 demande d’ami · 1 téléchargement fini · …', 'du plus urgent au moins urgent, dans sa longueur');
  assert.equal(digest?.act?.type, 'friend-requests', 'un clic mène au plus urgent');
  assert.equal(c.pending().length, 0);
});

test('notifications : rien quand l’écran ne s’y prête pas ; ce qui attend expire ou tombe', () => {
  const c = createNoticeCenter();
  c.push([ev('friend-online', 'Bruno', 0)]);
  const view = c.tick(NOTICE_GATHER_MS, on).view;
  assert.ok(view);
  // Une partie commence : elle part aussitôt, et ne revient pas.
  assert.equal(c.tick(NOTICE_GATHER_MS + 1000, { canShow: false }).view, undefined);
  assert.equal(c.tick(NOTICE_GATHER_MS + 2000, on).view, undefined);
  // Un ami connecté pendant la partie, reparti avant la fin : rien à dire au retour.
  c.push([ev('friend-online', 'Chloé', 10_000)]);
  assert.equal(c.tick(20_000, { canShow: false }).view, undefined);
  assert.equal(c.tick(30_000, { canShow: true, still: () => false }).view, undefined);
  assert.equal(c.pending().length, 0);
  // Au-delà de son ttl, oublié.
  c.push([ev('friend-playing', 'David|t', 40_000)]);
  assert.equal(c.tick(40_000 + NOTICE_RULES['friend-playing'].ttlMs + 1, on).view, undefined);
  assert.equal(c.pending().length, 0);
});

test('notifications : le même évènement n’est pas redit avant son délai', () => {
  const c = createNoticeCenter();
  c.push([ev('friend-online', 'Bruno', 0)]);
  c.tick(NOTICE_GATHER_MS, on);
  // Bruno se reconnecte une minute plus tard (connexion qui va et vient) : pas de seconde notification.
  c.push([ev('friend-online', 'Bruno', 60_000)]);
  assert.equal(c.pending().length, 0);
  c.push([ev('friend-online', 'Bruno', NOTICE_RULES['friend-online'].quietMs + 1)]);
  assert.equal(c.pending().length, 1);
  // Dit ailleurs (le bandeau d'un écran plein) : retiré s'il attendait, pas redit ensuite.
  c.push([ev('download-done', 'j1', 100)]);
  c.said('download-done', 'j1', 100);
  c.push([ev('download-done', 'j1', 200)]);
  assert.deepEqual(c.pending().map((e) => e.kind), ['friend-online']);
});

test('téléchargement fini : un seul mécanisme, la notification au menu des tables, le bandeau ailleurs sans redite', () => {
  const lib = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'library.ts'), 'utf8');
  const front = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'frontend.ts'), 'utf8');
  // Chaque bandeau d'un téléchargement fini passe le téléchargement : le menu sait ce qu'il annonce.
  for (const call of lib.matchAll(/host\.notify\?\.\(([\s\S]*?)\);\n/g)) assert.match(call[1]!, /, job$/, `host.notify sans le téléchargement : ${call[1]}`);
  const notify = front.match(/notify: \(text, job\) => \{([\s\S]*?)\n  \},/)?.[1];
  assert.ok(notify, 'frontend.ts reçoit notify(text, job)');
  assert.match(notify, /if \(job && state\.phase === 'menu'\) return;/, 'au menu des tables, pas de bandeau : la notification le dit');
  assert.match(notify, /menuNotices\.said\('download-done', job\.id\)/, 'ailleurs, le bandeau, et la notification ne le redit pas');
});

test('notifications : chaque genre a sa règle, son texte et sa part du résumé, dans les deux langues, sur une ligne', () => {
  const long = 'Maximilien-Alexandre de la Tour';
  const title = 'The Addams Family Special Collector’s Edition (Bally 1994)';
  for (const lang of ['fr', 'en'] as const) {
    setLanguage(lang);
    try {
      for (const kind of KINDS) {
        const rule = NOTICE_RULES[kind];
        assert.ok(rule.ttlMs > 0 && rule.quietMs > 0, `${kind} : délais`);
        for (const n of [1, 2, 7]) {
          const events = Array.from({ length: n }, (_, i) => ev(kind, `${long} ${i}`, i, { who: `${long} ${i}`, subject: title, extra: '84 520 310' }));
          const text = noticeText(kind, events);
          assert.ok(text.title, `${lang} ${kind} × ${n} : un titre`);
          assert.ok(len(text.title) <= NOTICE_TITLE_MAX, `${lang} ${kind} × ${n} : titre trop long « ${text.title} »`);
          assert.ok(len(text.detail) <= NOTICE_DETAIL_MAX, `${lang} ${kind} × ${n} : précision trop longue « ${text.detail} »`);
        }
      }
      const digest = digestText(KINDS.map((kind) => ({ kind, events: [ev(kind, 'a', 0), ev(kind, 'b', 0)] })));
      assert.ok(len(digest.detail) <= NOTICE_DETAIL_MAX, digest.detail);
    } finally {
      setLanguage('fr');
    }
  }
  setLanguage('en');
  try {
    assert.equal(noticeText('friend-online', [ev('friend-online', 'Bruno', 0)]).title, 'Bruno just came online');
    assert.equal(noticeText('download-done', [ev('download-done', 'a', 0), ev('download-done', 'b', 0)]).title, '2 downloads finished');
  } finally {
    setLanguage('fr');
  }
});

test('notifications : noms et titres raccourcis au mot près, liste de noms dans sa longueur', () => {
  assert.equal(shortened('Bruno', 16), 'Bruno');
  assert.equal(len(shortened('Maximilien-Alexandre', 16)), 16);
  assert.ok(shortened('Maximilien-Alexandre', 16).endsWith('…'));
  assert.equal(nameList(['Bruno']), 'Bruno');
  assert.equal(nameList(['Bruno', 'Chloé']), 'Bruno et Chloé');
  const many = nameList(Array.from({ length: 12 }, (_, i) => `Joueur numéro ${i}`));
  assert.ok(len(many) <= NOTICE_DETAIL_MAX, many);
  assert.match(many, /et \d+ autres$/);
});

// ---------------------------------------------------------------------------
// Relevés

const key = (c: string) => c.repeat(64);
function social(extra: Partial<SocialState> = {}): SocialState {
  return { ...newSocialState(new Date(0)), ...extra };
}
const friend = (k: string, name: string, events: SocialEvent[] = []) => ({ key: key(k), name, since: new Date(0).toISOString(), events });

test('relevé du réseau : rien au premier relevé, puis connexions, parties, demandes et réponses', () => {
  const now = Date.parse('2026-10-29T20:00:00Z');
  const s1 = social({ friends: [friend('a', 'Bruno'), friend('b', 'Chloé')], outgoing: [{ key: key('c'), name: 'David', at: new Date(0).toISOString() }] });
  const online1 = new Map<string, Presence | undefined>([[key('a'), { status: 'menu', since: '2026-10-29T19:00:00Z' }]]);
  const snap1 = socialSnapshot(s1, (k) => online1.has(k), (k) => online1.get(k));
  assert.deepEqual(socialNotices(undefined, snap1, s1, now), [], 'l’état trouvé au démarrage n’est pas une nouvelle');

  // Chloé arrive, Bruno lance une partie, Zoé demande, David accepte.
  const s2 = social({ friends: [friend('a', 'Bruno'), friend('b', 'Chloé'), friend('c', 'David')], incoming: [{ key: key('z'), name: 'Zoé', at: new Date(now).toISOString() }] });
  const online2 = new Map<string, Presence | undefined>([
    [key('a'), { status: 'playing', table: { title: 'Theatre of Magic' }, since: '2026-10-29T19:59:00Z' }],
    [key('b'), { status: 'playing', table: { title: 'Twilight Zone' }, since: '2026-10-29T19:59:30Z' }],
  ]);
  const snap2 = socialSnapshot(s2, (k) => online2.has(k), (k) => online2.get(k));
  const got = socialNotices(snap1, snap2, s2, now);
  const kinds = got.map((e) => `${e.kind}:${e.who}${e.subject ? `:${e.subject}` : ''}`).sort();
  // Chloé arrive déjà en partie : sa connexion seulement (pas « lance une partie »).
  assert.deepEqual(kinds, ['friend-accepted:David', 'friend-online:Chloé', 'friend-playing:Bruno:Theatre of Magic', 'friend-request:Zoé']);
});

test('relevé du réseau : un record frais d’un ami se dit, un vieux renvoyé à la connexion non', () => {
  const now = Date.parse('2026-10-29T20:00:00Z');
  const fresh: SocialEvent = { id: 'a-1', kind: 'record', at: '2026-10-29T19:58:00Z', table: { title: 'Medieval Madness' }, score: 84_520_310, rank: 1 };
  const old: SocialEvent = { id: 'a-0', kind: 'record', at: '2026-10-28T19:58:00Z', table: { title: 'Medieval Madness' }, score: 1, rank: 3 };
  const badge: SocialEvent = { id: 'a-2', kind: 'badge', at: '2026-10-29T19:59:00Z', badge: 'first-game' };
  const s1 = social({ friends: [friend('a', 'Bruno')] });
  const snap1 = socialSnapshot(s1, () => true, () => undefined);
  const s2 = social({ friends: [friend('a', 'Bruno', [badge, fresh, old])] });
  const got = socialNotices(snap1, socialSnapshot(s2, () => true, () => undefined), s2, now, (id) => `« ${id} »`);
  assert.deepEqual(
    got.map((e) => [e.kind, e.subject, e.extra]),
    [
      ['friend-badge', undefined, '« first-game »'],
      ['friend-record', 'Medieval Madness', (84_520_310).toLocaleString('fr-FR')],
    ],
  );
  // Un ami tout juste accepté envoie ses derniers évènements : seule l’amitié est annoncée.
  const s3 = social({ friends: [friend('a', 'Bruno', [badge, fresh, old]), friend('b', 'Chloé', [{ ...fresh, id: 'b-1' }])], outgoing: [] });
  const prev = socialSnapshot(social({ friends: [friend('a', 'Bruno', [badge, fresh, old])], outgoing: [{ key: key('b'), name: 'Chloé', at: new Date(0).toISOString() }] }), () => true, () => undefined);
  const got3 = socialNotices(prev, socialSnapshot(s3, () => true, () => undefined), s3, now);
  assert.deepEqual(got3.map((e) => e.kind), ['friend-accepted'], 'ni « vient de se connecter » ni ses vieux évènements');
  // Partage coupé : rien.
  const off = social({ enabled: false, friends: [friend('a', 'Bruno')] });
  assert.deepEqual(socialNotices(snap1, socialSnapshot(off, () => true, () => undefined), off, now), []);
});

test('pastille des amis : le nombre en ligne, rien à zéro ni partage coupé', () => {
  const s = social({ friends: [friend('a', 'Bruno'), friend('b', 'Chloé'), friend('c', 'David')] });
  const online = new Set([key('a'), key('c')]);
  assert.deepEqual(friendsOnlineView(socialSnapshot(s, (k) => online.has(k), () => undefined)), { count: 2, title: '2 amis en ligne : Bruno et David' });
  assert.equal(friendsOnlineView(socialSnapshot(s, () => false, () => undefined)), undefined);
  assert.equal(friendsOnlineView(socialSnapshot({ ...s, enabled: false }, () => true, () => undefined)), undefined);
});

function job(id: string, state: DownloadJob['state'], extra: Partial<DownloadJob> = {}): DownloadJob {
  const at = new Date(0).toISOString();
  return { id, kind: 'friend-table', title: `Toute la table : ${id}`, source: { kind: 'friend', id: 'x', label: 'Bruno' }, files: [], state, back: { screen: 'downloads' }, created: at, updated: at, tries: 0, resumable: true, ...extra } as DownloadJob;
}

test('relevé des téléchargements : fini et bloqué seulement, sans les écrans suivis ni l’état du démarrage', () => {
  const jobs1 = [job('a', 'running'), job('b', 'running'), job('c', 'running', { attached: true }), job('d', 'done')];
  assert.deepEqual(downloadNotices(undefined, jobs1, 0), [], 'rien au premier relevé');
  const snap = downloadSnapshot(jobs1);
  const jobs2 = [job('a', 'done'), job('b', 'failed'), job('c', 'done', { attached: true }), job('d', 'done'), job('e', 'done')];
  const got = downloadNotices(snap, jobs2, 5, () => 'plus de place');
  assert.deepEqual(
    got.map((e) => [e.kind, e.key, e.extra]),
    [
      ['download-done', 'a', undefined],
      ['download-failed', 'b', 'plus de place'],
    ],
  );
});

test('menu des tables : rien pendant une partie, en attente, en mode invité, sous un écran plein ou un constat', () => {
  const src = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'frontend.ts'), 'utf8');
  const line = src.split('\n').find((l) => /^\s*canShow: \(\) =>/.test(l));
  assert.ok(line, 'createMenuNotices reçoit canShow dans frontend.ts');
  for (const need of ["state.phase === 'menu'", '!state.help', '!state.banner', '!attract.active', '!guest.active', '!stopNotice', '!desktop.active'])
    assert.ok(line.includes(need), `canShow doit tenir compte de ${need}`);
  // La pastille et la notification ne sont jamais dessinées en mode invité (le rendu le redit).
  const renderer = fs.readFileSync(path.join(REPO_ROOT, 'app', 'renderer', 'frontend.js'), 'utf8');
  assert.match(renderer, /s\.phase === 'menu' && !s\.guest \? cornerBox\(s\)/);
  // Le réglage se lit dans les réglages du menu, et coupe aussi le compteur.
  assert.match(src, /mode: \(\) => mediaSettings\.notices/);
});

test('notifications : textes du rendu au plancher de 20 px', () => {
  const css = fs.readFileSync(path.join(REPO_ROOT, 'app', 'renderer', 'frontend.css'), 'utf8');
  for (const sel of ['.notice-title', '.notice-detail', '.friends-pill']) {
    const body = css.match(new RegExp(`\\n${sel.replace('.', '\\.')} \\{([^}]*)\\}`))?.[1];
    assert.ok(body, `${sel} dans frontend.css`);
    const size = Number(body.match(/font-size: ([\d.]+)cqmin/)?.[1]);
    assert.ok(size * 10.8 >= 20 - 0.01, `${sel} : ${size}cqmin, soit ${(size * 10.8).toFixed(1)} px sur un petit côté de 1 080`);
  }
});

test('menu des tables (menu-notices.ts) : silence au démarrage, réglage suivi, rendu seulement quand la notification change', () => {
  type View = { notice?: { title: string }; friendsOnline?: { count: number; title: string } };
  type Host = {
    social: { state(): SocialState; online(k: string): boolean; presenceOf(k: string): Presence | undefined };
    jobs(): DownloadJob[];
    mode(): 'all' | 'count' | 'off';
    canShow(): boolean;
    redraw(): void;
    now(): number;
  };
  const { createMenuNotices } = require(path.join(REPO_ROOT, 'app', 'dist', 'menu-notices.js')) as { createMenuNotices(host: Host): { observe(): void; view(): View; stop(): void } };
  let clock = 1_000_000;
  let state = social({ friends: [friend('a', 'Bruno'), friend('b', 'Chloé')] });
  const online = new Set<string>();
  let mode: 'all' | 'count' | 'off' = 'all';
  let redraws = 0;
  const notices = createMenuNotices({
    social: { state: () => state, online: (k) => online.has(k), presenceOf: () => undefined },
    jobs: () => [],
    mode: () => mode,
    canShow: () => true,
    redraw: () => redraws++,
    now: () => clock,
  });
  try {
    // Bruno se relie juste après le démarrage : compté, pas annoncé.
    online.add(key('a'));
    notices.observe();
    assert.deepEqual(notices.view(), { friendsOnline: { count: 1, title: '1 ami en ligne : Bruno' } });
    // Plus tard, Chloé arrive : annoncée après le rassemblement, un seul rendu pour son entrée.
    clock += 20_000;
    online.add(key('b'));
    notices.observe();
    assert.equal(notices.view().notice, undefined, 'pas avant le rassemblement');
    clock += NOTICE_GATHER_MS;
    const before = redraws;
    const v = notices.view();
    assert.equal(v.notice?.title, 'Chloé vient de se connecter');
    assert.equal(v.friendsOnline?.count, 2);
    notices.view();
    assert.equal(redraws, before, 'un rendu de plus ne redessine pas');
    // Compteur seul : la notification part, le compteur reste ; rien : ni l'un ni l'autre.
    mode = 'count';
    assert.deepEqual(notices.view(), { friendsOnline: { count: 2, title: '2 amis en ligne : Bruno et Chloé' } });
    mode = 'off';
    assert.deepEqual(notices.view(), {});
    // Réglage coupé : une demande reçue n'est pas gardée pour plus tard.
    state = { ...state, incoming: [{ key: key('z'), name: 'Zoé', at: new Date(clock).toISOString() }] };
    notices.observe();
    mode = 'all';
    clock += 5_000;
    assert.equal(notices.view().notice, undefined);
  } finally {
    notices.stop();
  }
});
