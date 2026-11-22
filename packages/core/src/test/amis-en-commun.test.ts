// Amis en commun (22/11/2026, décision du mainteneur : la liste des amis jointe à la carte publique,
// réglable, montrée par défaut). Ces tests fixent :
// - la liste signée avec la carte : changée en route, la carte est refusée ; une carte d'avant (sans
//   liste) se vérifie toujours ;
// - une liste malformée (clé invalide, doublon, trop longue) fait refuser la carte ;
// - les amis en commun : mes amis que sa carte cite, rien si elle ne les cite pas ;
// - un ami en commun rapproche plus que tout dans les suggestions ;
// - qui voit mes amis : publics (dans la carte, le défaut), mes amis seulement (envoyée à chacun par sa
//   liaison, jamais dans la carte), privés (Ce que voient les autres).

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { createPlayerKey, emptyProfiles, FRIENDS_IN_CARD, makeCard, mutualFriends, newSocialState, parseSocialMessage, parseSocialState, setLanguage, suggestPlayers, verifyCard } from '../index';
import { REPO_ROOT } from './i18n-scan';

setLanguage('fr');

const NOW = new Date('2026-11-22T10:00:00Z');
const keys = () => Array.from({ length: 3 }, () => createPlayerKey().publicKey);

function card(friendKeys?: string[]) {
  const key = createPlayerKey();
  return makeCard({ key, name: 'Théo', events: [], badges: [] }, emptyProfiles(), { records: 0, friends: friendKeys?.length ?? 0, ...(friendKeys ? { friendKeys } : {}) }, NOW);
}

test('amis en commun : la liste est signée avec la carte ; une carte d’avant se vérifie toujours', () => {
  const friends = keys();
  const c = card(friends);
  assert.deepEqual(verifyCard(JSON.parse(JSON.stringify(c)), NOW)?.friendKeys, friends);
  // Changée en route : refusée.
  assert.equal(verifyCard({ ...c, friendKeys: [friends[0]] }, NOW), undefined);
  // Sans liste (caché, ou carte d'avant) : valable, sans amis cités.
  const old = card();
  assert.ok(verifyCard(JSON.parse(JSON.stringify(old)), NOW));
  assert.equal(verifyCard(old, NOW)?.friendKeys, undefined);
});

test('amis en commun : une liste malformée fait refuser la carte', () => {
  const [a] = keys();
  for (const bad of [['pas-une-clé'], [a, a], Array.from({ length: FRIENDS_IN_CARD + 1 }, () => createPlayerKey().publicKey)]) {
    const c = card();
    assert.equal(verifyCard({ ...c, friendKeys: bad }, NOW), undefined, String(bad.length));
  }
});

test('amis en commun : mes amis que sa carte cite ; rien si elle ne les cite pas', () => {
  const [a, b, c] = keys();
  assert.deepEqual(mutualFriends([a!, b!], { friendKeys: [b!, c!] }), [b]);
  assert.deepEqual(mutualFriends([a!], {}), []);
  assert.deepEqual(mutualFriends([a!], undefined), []);
});

test('suggestions : un ami en commun rapproche plus que des tables en commun', () => {
  const picks = suggestPlayers(
    [
      { key: 'tables', name: 'Tables', commonTables: 2, online: true },
      { key: 'amis', name: 'Amis', commonTables: 0, online: true, mutual: 2 },
    ],
    {},
    new Set(),
    2,
  );
  assert.deepEqual(picks.map((p) => [p.candidate.key, p.reason]), [['amis', 'mutual'], ['tables', 'tables']]);
});

test('qui voit mes amis : publics (carte), mes amis seulement (envoyée à chacun), privés ; publics par défaut', () => {
  // L'état : absent = publics ; seuls « friends » et « private » se gardent.
  const saved = (v: unknown) => parseSocialState(JSON.parse(JSON.stringify({ ...newSocialState(), friendsVisibility: v })))?.friendsVisibility;
  assert.equal(saved('friends'), 'friends');
  assert.equal(saved('private'), 'private');
  assert.equal(saved('n’importe quoi'), undefined);
  // Le message réservé aux amis : des clés valides, sans doublon ; sinon rien n'entre.
  const [a, b] = keys();
  assert.deepEqual(parseSocialMessage({ t: 'friends-of', keys: [a, b] }), { t: 'friends-of', keys: [a, b] });
  assert.deepEqual(parseSocialMessage({ t: 'friends-of', keys: [] }), { t: 'friends-of', keys: [] });
  assert.equal(parseSocialMessage({ t: 'friends-of', keys: [a, a] }), undefined);
  assert.equal(parseSocialMessage({ t: 'friends-of', keys: ['x'] }), undefined);
  // La carte ne joint la liste qu'en mode public ; mes amis la reçoivent sauf en privé ; seul un ami me confie la sienne.
  const net = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'social-net.ts'), 'utf8');
  assert.match(net, /state\.friendsVisibility \? \{\} : \{ friendKeys: state\.friends\.map\(\(f\) => f\.key\) \}/);
  assert.match(net, /keys: state\.friendsVisibility === 'private' \? \[\] : state\.friends\.map/);
  assert.match(net, /case 'friends-of':\s*\/\/[^\n]*\n\s*if \(relationOf\(state, key\) !== 'friend'\) return;/);
  // Le réglage, dans « Ce que voient les autres » : les trois choix tournent.
  const account = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'account-menu.ts'), 'utf8');
  for (const v of ['public', 'friends', 'private']) assert.match(account, new RegExp(`setFriendsVisibility\\('${v}'\\)`));
});