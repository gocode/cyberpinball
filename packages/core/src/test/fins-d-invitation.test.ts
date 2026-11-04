// Fins d'invitation aux deux bornes (essai réel du 04/11/2026, essai.8 sur les deux bornes) :
//   « Quand l'invité refuse, celui qui a invité n'a pas l'impression d'en être informé : il peut
//   attendre longtemps » ; « Quand celui qui invite annule avant la réponse, l'invité resté sur
//   l'écran Accepter / Refuser n'apprend pas que l'invitation est annulée. »
//
// L'invariant : chaque fin d'invitation (acceptée, refusée, annulée, partie lancée sans lui, changée
// de table, expirée, un ami passé hors ligne) arrive aux deux côtés, même quand le message qui la dit
// se perd une fois en route. Le service réel (app/src/live-game.ts, compilé) sur deux bornes reliées
// par un réseau d'essai en mémoire, jamais le vrai réseau.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';
import { setLanguage } from '../i18n';
import { LIVE_INVITE_MS, lateAnswerEnd, livePlayerStateLabel, parseLiveMessage, type LiveGame, type LiveInviteEnd } from '../livegame';
import { inviteNotices } from '../livenotices';
import { NOTICE_DETAIL_MAX, NOTICE_RULES, NOTICE_TITLE_MAX, noticeText } from '../notices';
import type { TableEntry } from '../tables';

type Ended = { why: LiveInviteEnd | 'answered'; name: string; title: string; next?: string };
type Games = {
  create(table: TableEntry): Promise<LiveGame>;
  invite(key: string, name: string): boolean;
  invites(): { id: string }[];
  inviteEnd(id: string): Ended | undefined;
  accept(id: string): Promise<{ match: string; gone?: true }>;
  decline(id: string): void;
  start(): boolean;
  leave(opts?: { replacedFor?: readonly string[] }): void;
  current(): LiveGame | undefined;
  stop(): void;
};
/* eslint-disable @typescript-eslint/no-require-imports */
const { createLiveGames } = require(path.join(REPO_ROOT, 'app', 'dist', 'live-game.js')) as { createLiveGames(o: object): Games };
/* eslint-enable @typescript-eslint/no-require-imports */

/** Réseau d'essai : `drop` perd un message une fois, `offline` cache une borne (après la tolérance de présence). */
function testNet() {
  const handlers: Record<string, (k: string, m: unknown) => void> = {};
  const rules: { from: string; when: (m: Record<string, unknown>) => boolean; done?: boolean }[] = [];
  const state = { offline: new Set<string>(), sent: [] as string[], lost: [] as string[] };
  const make = (me: string, name: string, other: string, otherName: string) => ({
    state: () => ({ key: { publicKey: me }, name, friends: [{ key: other, name: otherName }] }),
    online: (key: string) => !state.offline.has(key) && !state.offline.has(me),
    send: (to: string, m: Record<string, unknown>) => {
      const label = `${me}→${to} ${String(m.t)}${m.why ? ` ${String(m.why)}` : ''}${m.answer ? ` ${String(m.answer)}` : ''}`;
      if (state.offline.has(to) || state.offline.has(me)) return (state.lost.push(label), false);
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

/** Deux bornes amies, la même table ; `skew` avance leur horloge (l'expiration des deux minutes). */
async function cabinets(name: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `cp-fins-${name}-`));
  const vpx = path.join(dir, 'Glass Lagoon.vpx');
  fs.writeFileSync(vpx, 'table');
  const table = { file: vpx, folder: dir, title: 'Glass Lagoon', info: {} } as unknown as TableEntry;
  const net = testNet();
  const clock = { skew: 0 };
  const logs: string[] = [];
  const make = (me: string, myName: string, other: string, otherName: string) =>
    createLiveGames({
      net: net.make(me, myName, other, otherName),
      dataDir: path.join(dir, me),
      tables: () => [table],
      play: async () => undefined,
      now: () => new Date(Date.now() + clock.skew),
      log: (l: string) => logs.push(`${me} ${l}`),
    });
  const host = make('borne', 'Borne', 'poste', 'Poste');
  const guest = make('poste', 'Poste', 'borne', 'Borne');
  await host.create(table);
  const invite = async () => {
    assert.ok(host.invite('poste', 'Poste'));
    await until('invitation reçue', () => guest.invites().length === 1);
    return guest.invites()[0]!.id;
  };
  return {
    host,
    guest,
    net,
    clock,
    logs,
    table,
    invite,
    seat: () => host.current()?.players.find((p) => p.key === 'poste'),
    close: () => {
      host.stop();
      guest.stop();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

test('fins d’invitation : refusée, même la réponse perdue une fois : l’hôte le sait (salon), l’invité aussi', { timeout: 60_000 }, async () => {
  const c = await cabinets('refus');
  try {
    const id = await c.invite();
    // Le refus se perd : l'invitation renvoyée par l'hôte (10 s) fait repartir la même réponse.
    c.net.drop('poste', (m) => m.t === 'game-answer');
    c.guest.decline(id);
    assert.equal(c.guest.inviteEnd(id)?.why, 'answered', 'chez l’invité : répondue, pas une nouvelle à annoncer');
    await until('l’hôte voit le refus', () => c.seat()?.state === 'declined', 25_000);
    assert.ok(c.seat()?.answeredAt, 'le salon le met en tête (answeredAt)');
    assert.ok(c.net.state.lost.some((l) => l.includes('game-answer decline')), 'le premier refus a bien été perdu');
  } finally {
    c.close();
  }
});

test('fins d’invitation : acceptée : l’hôte le sait, l’invité est dans la partie', { timeout: 30_000 }, async () => {
  const c = await cabinets('accord');
  try {
    const id = await c.invite();
    await c.guest.accept(id);
    await until('acceptée chez l’hôte', () => c.seat()?.state === 'accepted');
    assert.equal(c.guest.current()?.id, id);
    assert.equal(c.guest.inviteEnd(id)?.why, 'answered');
  } finally {
    c.close();
  }
});

test('fins d’invitation : annulée par l’hôte, l’annulation perdue une fois : renvoyée jusqu’à l’accusé, l’invité la voit', { timeout: 30_000 }, async () => {
  const c = await cabinets('annulee');
  try {
    const id = await c.invite();
    c.net.drop('borne', (m) => m.t === 'game-cancel');
    c.host.leave();
    await until('l’invité apprend l’annulation', () => c.guest.inviteEnd(id)?.why === 'cancelled', 15_000);
    assert.equal(c.guest.invites().length, 0);
    await until('l’hôte a l’accusé de réception', () => c.logs.some((l) => l.startsWith('borne') && l.includes('fin de l\'invitation reçue par Poste')), 10_000);
    assert.ok(c.net.state.lost.some((l) => l.includes('game-cancel cancelled')), 'la première annulation a bien été perdue');
  } finally {
    c.close();
  }
});

test('fins d’invitation : changée de table : l’ancienne invitation dit « changée de table » et mène à la nouvelle', { timeout: 30_000 }, async () => {
  const c = await cabinets('changee');
  try {
    const first = await c.invite();
    // Ce que fait « Changer de table » (live-game-menu.ts, inviteAll) : le salon fermé, un autre, la même invitée.
    c.host.leave({ replacedFor: ['poste'] });
    await c.host.create(c.table);
    assert.ok(c.host.invite('poste', 'Poste'));
    await until('la nouvelle invitation', () => c.guest.invites().some((i) => i.id !== first));
    const second = c.guest.invites()[0]!.id;
    await until('l’ancienne a sa fin', () => c.guest.inviteEnd(first)?.why === 'replaced');
    assert.equal(c.guest.inviteEnd(first)?.next, second);
  } finally {
    c.close();
  }
});

test('fins d’invitation : la partie lancée sans lui ; sa réponse trop tardive lui revient', { timeout: 30_000 }, async () => {
  const c = await cabinets('lancee');
  try {
    // Un deuxième invité accepte, la partie part ; le poste n'a pas encore répondu.
    const id = await c.invite();
    const game = c.host.current()!;
    c.host.current()!.players.push({ key: 'zoe', name: 'Zoé', state: 'accepted', settings: 'ok' });
    assert.ok(c.host.start());
    assert.equal(c.seat()?.state, 'expired');
    await until('l’invité apprend le départ sans lui', () => c.guest.inviteEnd(id)?.why === 'started');
    assert.equal(lateAnswerEnd({ ...game, phase: 'countdown', players: game.players.map((p) => (p.key === 'poste' ? { ...p, state: 'expired' } : p)) }, game.id, 'poste'), 'started');
  } finally {
    c.close();
  }
});

test('fins d’invitation : expirée (deux minutes) : chacun le constate, l’invité l’apprend aussi de l’hôte', { timeout: 30_000 }, async () => {
  const c = await cabinets('expiree');
  try {
    const id = await c.invite();
    c.clock.skew = LIVE_INVITE_MS + 2000;
    await until('expirée chez l’hôte', () => c.seat()?.state === 'expired' && !c.seat()?.offline, 5000);
    await until('expirée chez l’invité', () => c.guest.inviteEnd(id)?.why === 'expired', 5000);
    assert.equal(c.guest.invites().length, 0, 'son écran ne propose plus « Accepter »');
  } finally {
    c.close();
  }
});

test('fins d’invitation : l’invité passe hors ligne : sa place est libérée chez l’hôte ; revenu, il l’apprend', { timeout: 30_000 }, async () => {
  const c = await cabinets('invite-hors-ligne');
  try {
    const id = await c.invite();
    c.net.state.offline.add('poste');
    await until('retirée chez l’hôte', () => c.seat()?.state === 'expired' && c.seat()?.offline === true, 5000);
    assert.equal(livePlayerStateLabel(c.seat()!), 'Passé hors ligne : invitation retirée');
    // Chez lui, l'hôte semblait parti aussi (la liaison est tombée des deux côtés) : sa fin vient de là.
    await until('retirée chez l’invité', () => c.guest.inviteEnd(id) !== undefined, 5000);
    assert.equal(c.guest.inviteEnd(id)?.why, 'host-offline');
    c.net.state.offline.delete('poste');
    // La fin dite par l'hôte arrive à son retour (renvoyée tant qu'elle vaut), avec son accusé.
    await until('l’hôte a l’accusé de réception', () => c.logs.some((l) => l.startsWith('borne') && l.includes('fin de l\'invitation reçue par Poste')), 10_000);
  } finally {
    c.close();
  }
});

test('fins d’invitation : réinvité aussitôt revenu en ligne : la fin d’avant, encore en renvoi, n’annule pas la nouvelle', { timeout: 30_000 }, async () => {
  const c = await cabinets('reinvite');
  try {
    await c.invite();
    c.net.state.offline.add('poste');
    await until('retirée chez l’hôte', () => c.seat()?.offline === true, 5000);
    c.net.state.offline.delete('poste');
    // Tout de suite, avant que la fin « hors ligne » ne reparte : une nouvelle invitation, dans le même salon.
    assert.ok(c.host.invite('poste', 'Poste'));
    await until('la nouvelle invitation', () => c.guest.invites().length === 1);
    await new Promise((r) => setTimeout(r, 4500));
    assert.equal(c.guest.invites().length, 1, `toujours là : ${c.net.state.sent.filter((l) => l.includes('game-cancel')).join(' ; ')}`);
  } finally {
    c.close();
  }
});

test('fins d’invitation : l’hôte passe hors ligne : l’invitation est retirée chez l’invité ; une acceptation trop tardive revient « annulée »', { timeout: 30_000 }, async () => {
  const c = await cabinets('hote-hors-ligne');
  try {
    const id = await c.invite();
    c.net.state.offline.add('borne');
    await until('retirée chez l’invité', () => c.guest.inviteEnd(id)?.why === 'host-offline', 5000);
    await until('retirée chez l’hôte', () => c.seat()?.state === 'expired', 5000);
    c.net.state.offline.delete('borne');
    // Une réponse arrivée après coup (borne d'avant, message en route) : l'hôte dit pourquoi elle ne vaut plus.
    const game = c.host.current()!;
    assert.equal(lateAnswerEnd(game, game.id, 'poste'), 'offline');
    assert.equal(lateAnswerEnd(undefined, game.id, 'poste'), 'cancelled');
    assert.equal(lateAnswerEnd({ ...game, players: game.players.map((p) => (p.key === 'poste' ? { ...p, state: 'invited' } : p)) }, game.id, 'poste'), undefined, 'encore valable');
  } finally {
    c.close();
  }
});

test('fins d’invitation : le message voyage (why, accusé), une borne d’avant reste comprise ; textes dans les deux langues, sur une ligne', () => {
  assert.deepEqual(parseLiveMessage({ t: 'game-cancel', game: '0123456789abcdef', why: 'started' }), { t: 'game-cancel', game: '0123456789abcdef', why: 'started' });
  assert.deepEqual(parseLiveMessage({ t: 'game-cancel', game: '0123456789abcdef' }), { t: 'game-cancel', game: '0123456789abcdef' }, 'une borne d’avant : annulée');
  assert.deepEqual(parseLiveMessage({ t: 'game-cancel', game: '0123456789abcdef', why: 'host-offline' }), { t: 'game-cancel', game: '0123456789abcdef' }, '« hôte hors ligne » ne se dit que chez soi');
  assert.deepEqual(parseLiveMessage({ t: 'game-cancel-ok', game: '0123456789abcdef' }), { t: 'game-cancel-ok', game: '0123456789abcdef' });
  // La fin d'une invitation vue s'annonce ; ma propre réponse ou un changement de table, non.
  const ends: Record<string, Ended> = { a: { why: 'cancelled', name: 'Bruno', title: 'Glass Lagoon' }, b: { why: 'answered', name: 'Bruno', title: 'X' }, c: { why: 'replaced', name: 'Bruno', title: 'X' } };
  const said = inviteNotices(new Set(['a|1', 'b|1', 'c|1']), [], 0, (id) => ends[id]);
  assert.deepEqual(said.map((e) => [e.kind, e.key, e.end]), [['live-invite-ended', 'a|1', 'cancelled']]);
  // Réinvité dans la même partie après un refus (un autre numéro) : une nouvelle invitation, annoncée.
  const again = { id: 'b', host: { key: 'bruno', name: 'Bruno' }, table: { table: { title: 'X' } }, title: 'X', players: [], receivedAt: new Date(0).toISOString(), round: 2 };
  assert.deepEqual(inviteNotices(new Set(['b|1']), [again], 0, (id) => ends[id]).map((e) => [e.kind, e.key]), [['live-invite', 'b|2']]);
  assert.equal(NOTICE_RULES['live-invite-ended'].gatherMs, 0, 'tout de suite');
  assert.equal(NOTICE_RULES['live-invite-ended'].away, true, 'partout, pendant les parties aussi');
  const all: LiveInviteEnd[] = ['cancelled', 'started', 'replaced', 'expired', 'offline', 'host-offline'];
  for (const lang of ['fr', 'en'] as const) {
    setLanguage(lang);
    try {
      for (const end of all) {
        const text = noticeText('live-invite-ended', [{ kind: 'live-invite-ended', key: 'a', at: 0, who: 'Maximilien-Alexandre de la Tour', subject: 'Glass Lagoon (Inventé 1987)', end }]);
        assert.ok([...text.title].length <= NOTICE_TITLE_MAX && [...(text.detail ?? '')].length <= NOTICE_DETAIL_MAX, `${lang} ${end} : « ${text.title} » / « ${text.detail} »`);
      }
    } finally {
      setLanguage('fr');
    }
  }
  assert.equal(noticeText('live-invite-ended', [{ kind: 'live-invite-ended', key: 'a', at: 0, who: 'Bruno', subject: 'Glass Lagoon', end: 'cancelled' }]).title, 'Bruno a annulé son invitation');
  assert.equal(noticeText('live-declined', [{ kind: 'live-declined', key: 'a', at: 0, who: 'David', reason: 'offline' }]).title, 'David est passé hors ligne');
});

test('fins d’invitation : les écrans s’y adaptent (code de l’application)', () => {
  const read = (...p: string[]) => fs.readFileSync(path.join(REPO_ROOT, ...p), 'utf8');
  const menu = read('app', 'src', 'live-game-menu.ts');
  // L'écran de décision passe à « Invitation annulée par … » (ou expirée, retirée…), avec un retour.
  assert.match(menu, /if \(!invite\) return buildInviteEnded\(id, back\);/);
  assert.match(menu, /cancelled: \{ text: t\('Invitation annulée par \{name\}', \{ name \}\) \}/);
  assert.match(menu, /label: t\('Voir la nouvelle invitation'\)/);
  // Annulée pendant la vérification de la table : rien ne part, l'écran dit pourquoi.
  assert.match(menu, /if \(r\.gone\) return;/);
  // Le salon met en tête chaque réponse récente, et le dit d'une place libérée.
  assert.match(menu, /\.\.\.\(hosting && answerRows\(game\)\.length \? \[\{ rows: answerRows\(game\) \}\] : \[\]\)/);
  const live = read('app', 'src', 'live-game.ts');
  // Tout ce qui finit une invitation chez l'hôte le dit à l'invité, et le redit jusqu'à l'accusé.
  assert.match(live, /tellEnds\(before, expired, \(p\) => \(p\.offline \? 'offline' : 'expired'\)\);/);
  assert.match(live, /tellEnds\(game, next, \(\) => 'started'\);/);
  assert.match(live, /cancelAsHost\(game, opts\?\.replacedFor \?\? \[\]\);/);
  assert.match(live, /case 'game-cancel-ok':/);
  // La notification d'invitation déjà affichée part (still), celle de sa fin la remplace ; dans la partie, la carte se ferme (game-notice.ts, refresh).
  const notices = read('app', 'src', 'menu-notices.ts');
  assert.match(notices, /case 'live-invite-ended':\s+\/\/[^\n]*\n\s+return !host\.live\?\.inviteOnScreen\?\.\(tagId\(e\.key\)\);/);
  assert.match(read('app', 'src', 'game-notice.ts'), /const now = current\(\);\s+if \(!now\) return closeNotice\(\);/);
});
