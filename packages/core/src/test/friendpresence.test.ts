// Présence des amis (friendpresence.ts) : les invariants, sur une horloge d'essai. Un ami est en
// ligne tant qu'une liaison saluée vit ; la chute de l'une ne le retire pas ; une reconnexion
// rapide ne le fait pas clignoter ; « vu » date la dernière liaison vivante ; la liste dit
// quand elle n'est pas sûre.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPresenceBook, friendsListLine, friendsListSync, offlineText, PRESENCE_GRACE_MS, PRESENCE_SEARCH_MS } from '../friendpresence';
import { setLanguage } from '../i18n';
import { friendsOnlineView, socialSnapshot } from '../notices';
import { newSocialState } from '../social';

const ALICE = 'a'.repeat(64);

test('présence : deux liaisons, l’une se ferme, l’ami reste en ligne sans tolérance', () => {
  const book = createPresenceBook(1_000);
  const internet = {};
  const lan = {};
  assert.equal(book.up(ALICE, internet, 0), true, 'première liaison : il apparaît');
  assert.equal(book.up(ALICE, lan, 10), false, 'seconde liaison : rien de nouveau');
  book.down(ALICE, internet, 20);
  assert.equal(book.online(ALICE), true);
  assert.equal(book.pending(ALICE), false, 'une liaison vit encore : pas de tolérance');
  assert.equal(book.links(ALICE), 1);
  assert.deepEqual(book.expire(10_000), []);
  assert.equal(book.online(ALICE), true);
});

test('présence : reconnexion pendant la tolérance, pas de clignotement ni d’apparition', () => {
  const book = createPresenceBook(1_000);
  const old = {};
  const fresh = {};
  book.up(ALICE, old, 0);
  // Hyperswarm remplace un doublon : l'ancienne se ferme avant que la nouvelle soit donnée.
  book.down(ALICE, old, 100);
  assert.equal(book.online(ALICE), true, 'en ligne pendant la tolérance');
  assert.equal(book.pending(ALICE), true);
  assert.equal(book.nextExpiry(), 1_100);
  assert.equal(book.up(ALICE, fresh, 600), false, 'revenu dans la tolérance : pas une nouvelle connexion');
  assert.equal(book.pending(ALICE), false);
  assert.deepEqual(book.expire(5_000), [], 'jamais hors ligne');
  assert.equal(book.online(ALICE), true);
});

test('présence : hors ligne passé la tolérance, vu à la chute de la dernière liaison', () => {
  const book = createPresenceBook(1_000);
  const link = {};
  book.up(ALICE, link, 0);
  book.down(ALICE, link, 4_000);
  assert.deepEqual(book.expire(4_999), []);
  assert.deepEqual(book.expire(5_200), [{ key: ALICE, lastAlive: 4_000 }]);
  assert.equal(book.online(ALICE), false);
  assert.equal(book.nextExpiry(), undefined);
  // Puis il revient : c'est une apparition.
  assert.equal(book.up(ALICE, {}, 9_000), true);
});

test('présence : une connexion jamais saluée ne compte pas, et ne date pas « vu »', () => {
  const book = createPresenceBook(1_000);
  // Ouverte puis fermée avant le bonjour (doublon refusé, borne qui plante) : jamais montée.
  book.down(ALICE, {}, 50);
  assert.equal(book.online(ALICE), false);
  assert.equal(book.pending(ALICE), false);
  assert.deepEqual(book.expire(10_000), [], 'rien à dater');
});

test('présence : la tolérance par défaut couvre une reconnexion de Hyperswarm', () => {
  // Hyperswarm réessaie un pair prouvé après ~1 s, puis ~5 s ; la balise locale passe toutes les 5 s.
  assert.ok(PRESENCE_GRACE_MS >= 10_000 && PRESENCE_GRACE_MS <= 30_000);
  assert.ok(PRESENCE_SEARCH_MS >= PRESENCE_GRACE_MS);
});

test('liste des amis : recherche, mise à jour, à jour', () => {
  const base = { enabled: true, running: true, startedAt: 0, friends: [ALICE], searchMs: 30_000, online: () => false, pending: () => false };
  assert.equal(friendsListSync({ ...base, enabled: false, now: 0 }), 'off');
  assert.equal(friendsListSync({ ...base, unavailable: true, now: 0 }), 'off');
  assert.equal(friendsListSync({ ...base, running: false, now: 0 }), 'searching', 'le réseau démarre');
  assert.equal(friendsListSync({ ...base, now: 10_000 }), 'searching', 'un ami absent, recherche en cours');
  assert.equal(friendsListSync({ ...base, now: 10_000, online: () => true }), 'settled', 'tous là : rien à chercher');
  assert.equal(friendsListSync({ ...base, now: 40_000 }), 'settled', 'recherche finie : absent pour de bon');
  assert.equal(friendsListSync({ ...base, now: 40_000, online: () => true, pending: () => true }), 'updating', 'liaison tombée, tolérance');
  assert.equal(friendsListSync({ ...base, friends: [], now: 0 }), 'settled', 'sans ami, rien à attendre');
});

test('liste des amis : ce qui s’affiche, en français et en anglais', () => {
  try {
    setLanguage('fr');
    assert.equal(friendsListLine('searching', 0)?.text, 'Recherche des amis…');
    assert.equal(friendsListLine('searching', 0)?.busy, true);
    assert.equal(friendsListLine('updating', 1)?.text, 'Mise à jour en cours…');
    assert.equal(friendsListLine('settled', 0)?.text, 'Liste à jour : 0 ami en ligne');
    assert.equal(friendsListLine('settled', 2)?.text, 'Liste à jour : 2 amis en ligne');
    assert.equal(friendsListLine('settled', 2)?.busy, false);
    assert.equal(friendsListLine('off', 0), undefined);
    // « Vu » d'un ami hors ligne : pendant la recherche, le libellé le dit.
    const now = new Date('2026-11-01T15:00:00Z');
    assert.equal(offlineText('settled', '2026-11-01T12:00:00Z', now), 'Vu il y a 3 h');
    assert.equal(offlineText('searching', '2026-11-01T12:00:00Z', now), 'Vu il y a 3 h · recherche en cours');
    assert.equal(offlineText('updating', undefined, now), 'Pas encore vu en ligne · recherche en cours');
    setLanguage('en');
    assert.equal(friendsListLine('searching', 0)?.text, 'Looking for friends…');
    assert.equal(friendsListLine('settled', 1)?.text, 'List up to date: 1 friend online');
    assert.equal(offlineText('searching', '2026-11-01T12:00:00Z', now), 'Seen 3 h ago · still looking');
  } finally {
    setLanguage('fr');
  }
});

test('pastille des amis : visible à zéro pendant la recherche, et le dit', () => {
  const state = { ...newSocialState(), friends: [{ key: ALICE, name: 'Ami', since: new Date().toISOString(), events: [] }] };
  const snap = socialSnapshot(state, () => false, () => undefined);
  assert.equal(friendsOnlineView(snap), undefined, 'liste à jour, personne : pas de pastille');
  const searching = friendsOnlineView(snap, 'searching');
  assert.equal(searching?.count, 0);
  assert.equal(searching?.searching, true);
  assert.match(searching!.title, /recherche en cours/);
  const online = friendsOnlineView(socialSnapshot(state, () => true, () => undefined), 'settled');
  assert.equal(online?.count, 1);
  assert.equal(online?.searching, undefined);
});
