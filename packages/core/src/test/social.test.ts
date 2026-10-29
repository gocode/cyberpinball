// Réseau des bornes, partie sans réseau (social.ts, badges.ts) : noms, profils signés, messages
// reçus d'un pair (rien de faux n'entre), annuaire, règles d'amitié des deux côtés, badges, mode
// du réseau selon l'environnement (jamais le vrai réseau pendant un essai sans opérateur).

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { BADGES, grantBadges, playStats } from '../badges';
import { attestedTableFiles, defaultPartChoice, isSafeTableRel, rightsAttestation, RIGHTS_PARTS } from '../friendlibrary';
import {
  acceptRequest,
  blockPlayer,
  declineRequest,
  displayName,
  eventText,
  learnProfiles,
  loadSocial,
  mergeDirectory,
  nearbyPlayers,
  newSocialState,
  normalizeName,
  parseSocialMessage,
  parseSocialState,
  peerProfile,
  playerSeed,
  receiveReply,
  relationOf,
  requestFriend,
  searchDirectory,
  setName,
  signProfile,
  socialNetMode,
  syncReply,
  verifyProfile,
  type SocialState,
} from '../social';
import type { TableEntry } from '../tables';

function player(name: string): SocialState {
  return setName(newSocialState(), name)!;
}

test('noms : nettoyés, bornés, sans caractère de contrôle ni symbole', () => {
  assert.equal(normalizeName('  Alexis   le  Sorcier '), 'Alexis le Sorcier');
  assert.equal(normalizeName('Éloïse'), 'Éloïse');
  assert.equal(normalizeName('x'), undefined);
  assert.equal(normalizeName('a'.repeat(25)), undefined);
  assert.equal(normalizeName('Admin\u202e'), undefined);
  assert.equal(normalizeName('<script>'), undefined);
  assert.equal(normalizeName('-Alexis'), undefined);
  const s = player('Alexis');
  assert.match(displayName(s.name, s.key.publicKey), /^Alexis #[0-9A-F]{4}$/);
});

test('profil signé : vérifié, et refusé dès qu’on y touche', () => {
  const s = player('Alexis');
  const p = signProfile(s);
  assert.deepEqual(verifyProfile(p), p);
  assert.equal(verifyProfile({ ...p, name: 'Alexia' }), undefined);
  assert.equal(verifyProfile({ ...p, key: player('Autre').key.publicKey }), undefined);
  // Daté dans le futur : il gagnerait contre tous les profils suivants.
  const future = setName({ ...s, nameAt: new Date(Date.now() + 3600_000).toISOString() }, 'Alexis')!;
  assert.equal(verifyProfile(signProfile(future)), undefined);
  // La graine refait la même clé publique que celle du profil (HyperDHT : DHT.keyPair(seed)).
  assert.equal(playerSeed(s.key).length, 32);
});

test('messages reçus : forme vérifiée, profils faux retirés, taille bornée', () => {
  const a = player('Alice'), b = player('Bruno');
  const forged = { ...signProfile(b), name: 'Brunette' };
  const hello = parseSocialMessage({ t: 'hello', profile: signProfile(a), dir: [signProfile(b), forged, 42] });
  assert.equal(hello?.t, 'hello');
  assert.deepEqual(hello?.t === 'hello' && hello.dir.map((p) => p.name), ['Bruno']);
  assert.equal(parseSocialMessage({ t: 'hello', profile: forged, dir: [] }), undefined);
  assert.equal(parseSocialMessage({ t: 'exec', cmd: 'calc' }), undefined);
  assert.equal(parseSocialMessage({ t: 'presence', presence: { status: 'playing', since: new Date().toISOString() } }), undefined, 'en partie sans table');
  const events = parseSocialMessage({ t: 'events', events: [{ id: 'x', kind: 'record', at: new Date().toISOString(), table: { title: 'T' }, score: -5, rank: 1 }, { id: 'y', kind: 'badge', at: new Date().toISOString(), badge: 'first-game' }] });
  assert.deepEqual(events?.t === 'events' && events.events.map((e) => e.id), ['y']);
});

test('annuaire : le profil le plus récent l’emporte, recherche sans accents, étiquette, réseau local', () => {
  const me = player('Moi');
  const alexis = player('Alexis'), alexia = player('Alexia'), eloise = player('Éloïse');
  const now = new Date();
  let dir = mergeDirectory([], [signProfile(alexis), signProfile(alexia), signProfile(eloise), signProfile(me)], { self: me.key.publicKey, now });
  assert.equal(dir.length, 3, 'sa propre clé n’entre pas');
  const renamed = setName({ ...alexis, nameAt: new Date(now.getTime() + 1000).toISOString() }, 'Juju')!;
  dir = mergeDirectory(dir, [signProfile(renamed)], { self: me.key.publicKey, now });
  dir = mergeDirectory(dir, [signProfile(alexis)], { self: me.key.publicKey, now });
  assert.equal(dir.find((d) => d.profile.key === alexis.key.publicKey)!.profile.name, 'Juju', 'un profil plus ancien ne revient pas');
  const state = { ...me, directory: dir };
  assert.deepEqual(searchDirectory(state, 'ale').map((d) => d.profile.name), ['Alexia']);
  assert.deepEqual(searchDirectory(state, 'ELOISE').map((d) => d.profile.name), ['Éloïse']);
  const tag = displayName('', alexia.key.publicKey).split('#')[1]!;
  assert.deepEqual(searchDirectory(state, `#${tag}`).map((d) => d.profile.name), ['Alexia']);
  // Réseau local : à proximité tant que la balise est récente.
  const near = { ...me, directory: mergeDirectory(dir, [signProfile(eloise)], { self: me.key.publicKey, now, lan: true }) };
  assert.deepEqual(nearbyPlayers(near, now).map((d) => d.profile.name), ['Éloïse']);
  assert.deepEqual(nearbyPlayers(near, new Date(now.getTime() + 120_000)), []);
});

test('amitié : demande, acceptation, refus retenu, demandes croisées, blocage', () => {
  let a = player('Alice'), b = player('Bruno');
  const pa = { key: a.key.publicKey, name: a.name }, pb = { key: b.key.publicKey, name: b.name };
  const sent = requestFriend(a, pb);
  assert.equal(sent.send, 'request');
  a = sent.state;
  assert.equal(relationOf(a, pb.key), 'outgoing');
  b = receiveReply(b, pa, 'request').state;
  assert.equal(relationOf(b, pa.key), 'incoming');
  const accepted = acceptRequest(b, pa.key);
  assert.equal(accepted.send, 'accept');
  b = accepted.state;
  a = receiveReply(a, pb, 'accept').state;
  assert.equal(relationOf(a, pb.key), 'friend');
  assert.equal(relationOf(b, pa.key), 'friend');
  assert.equal(syncReply(a, pb.key), 'accept');

  // Retiré pendant que l'autre était éteint : à la reconnexion, son « accept » reçoit « unfriend ».
  const c = player('Chloé');
  const pc = { key: c.key.publicKey, name: c.name };
  assert.equal(receiveReply(c, pa, 'accept').send, 'unfriend');

  // Refus : retenu, une nouvelle demande reçoit « decline » sans revenir à l'écran.
  let d = receiveReply(player('Dora'), pc, 'request').state;
  d = declineRequest(d, pc.key).state;
  const again = receiveReply(d, pc, 'request');
  assert.equal(again.send, 'decline');
  assert.equal(again.state.incoming.length, 0);

  // Demandé des deux côtés : amis tout de suite.
  let e = requestFriend(player('Emma'), pc).state;
  e = receiveReply(e, pc, 'request').state;
  assert.equal(relationOf(e, pc.key), 'friend');

  // Bloqué : plus rien n'entre.
  const f = blockPlayer(player('Fred'), pc.key).state;
  assert.equal(receiveReply(f, pc, 'request').state.incoming.length, 0);
  assert.equal(relationOf(f, pc.key), 'blocked');
});

test('nom d’un pair : suit le profil le plus récent, d’où qu’il vienne, jamais vers un plus ancien', () => {
  const t0 = new Date('2026-10-28T10:00:00Z'), t1 = new Date('2026-10-28T11:00:00Z');
  const alice = player('Alice');
  const old = signProfile(setName(alice, 'Joueur A1', t0)!);
  const renamed = signProfile(setName(alice, 'Alicia', t1)!);
  let b = player('Bruno');
  // Le premier contact donne l'ancien nom ; puis le renommage arrive par l'annuaire (« dir »).
  b = learnProfiles(b, [old], { now: t0 });
  b = learnProfiles(b, [renamed], { now: t1 });
  // La demande qui suit prend le nom le plus récent connu, pas celui du premier contact.
  b = receiveReply(b, peerProfile(b, old.key)!, 'request', t1).state;
  assert.equal(b.incoming[0]!.name, 'Alicia');
  // Un profil relayé plus ancien ne ramène pas l'ancien nom, ni dans l'annuaire ni dans la demande.
  b = learnProfiles(b, [old], { now: t1 });
  assert.equal(b.incoming[0]!.name, 'Alicia');
  assert.equal(b.directory[0]!.profile.name, 'Alicia');
  // Devenus amis : le nom et sa date suivent ; relu du fichier, la date reste.
  b = acceptRequest(b, old.key, t1).state;
  assert.equal(b.friends[0]!.name, 'Alicia');
  const reread = parseSocialState(JSON.parse(JSON.stringify(b)))!;
  assert.equal(reread.friends[0]!.nameAt, renamed.at);
  // Annuaire oublié (60 jours) : la date gardée chez l'ami protège encore du vieux profil.
  const forgot = learnProfiles({ ...reread, directory: [] }, [old], { now: t1 });
  assert.equal(forgot.friends[0]!.name, 'Alicia');
});

test('bibliothèque partagée : activée par défaut, même relue d’un fichier d’avant ; un refus du joueur reste', () => {
  const fresh = newSocialState();
  assert.equal(fresh.shareLibrary, true);
  // Écrit avant le partage par défaut : « false » sans que le joueur l'ait choisi.
  assert.equal(parseSocialState({ ...fresh, shareLibrary: false })!.shareLibrary, true);
  // Le joueur l'a coupée lui-même : ça reste coupé.
  assert.equal(parseSocialState({ ...fresh, shareLibrary: false, shareLibraryChosen: true })!.shareLibrary, false);
});

test('fichiers d’une table reçus d’un ami : chemin sous le dossier de la table, jamais un programme', () => {
  for (const ok of ['Terminator 2.vpx', 'pupvideos/t2_l8/screens.pup', 'pinmame/roms/t2_l8.zip', 'medias/(Wheel) T2.png']) assert.equal(isSafeTableRel(ok), true, ok);
  for (const bad of ['../evil.vpx', 'a/../../b', 'C:/Windows/x', '/abs', 'a\\b', 'tool.exe', 'pupvideos/run.bat', 'x.ps1', 'con.txt', 'a//b', 'fin. ', '']) assert.equal(isSafeTableRel(bad), false, bad);
  // La ROM et le PuP-Pack jamais pris d'office (sous droits), ni une partie qu'on a déjà.
  assert.equal(defaultPartChoice('rom', false), false);
  assert.equal(defaultPartChoice('pup', false), false);
  assert.equal(defaultPartChoice('b2s', false), true);
  assert.equal(defaultPartChoice('b2s', true), false);
  // Chaque partie sous droits a sa mention légale ; une partie libre n'en a pas.
  for (const part of RIGHTS_PARTS) assert.match(rightsAttestation(part, 'Bruno')!.pledge, /^J’atteste avoir le droit/, part);
  assert.equal(rightsAttestation('b2s', 'Bruno'), undefined);
  // Dernier rempart : un fichier d'une partie sous droits ne part qu'attesté.
  const files = (['table', 'rom', 'pup'] as const).map((part, i) => ({ id: String(i), rel: `${part}.x`, bytes: 1, part }));
  assert.deepEqual(attestedTableFiles(files, new Set()).map((f) => f.part), ['table']);
  assert.deepEqual(attestedTableFiles(files, new Set(['pup'])).map((f) => f.part), ['table', 'pup']);
});

test('évènements : phrases du record, du badge, de la partie', () => {
  const at = new Date().toISOString();
  assert.equal(eventText({ id: '1', kind: 'record', at, table: { title: 'The Goonies' }, score: 12_345_670, rank: 1 }, (id) => id), 'Nouveau meilleur score sur The Goonies : 12,345,670');
  assert.match(eventText({ id: '2', kind: 'record', at, table: { title: 'T2' }, score: 5_000_000, rank: 3 }, (id) => id), /place 3/);
  assert.equal(eventText({ id: '3', kind: 'badge', at, badge: 'first-game' }, () => 'Première partie'), 'Badge reçu : Première partie');
  assert.match(eventText({ id: '4', kind: 'played', at, table: { title: 'T2' }, seconds: 4000 }, (id) => id), /1 h 07 min/);
});

test('badges : l’historique d’avant ne s’annonce pas, les suivants deviennent des évènements', () => {
  const table = (starts: number, run: number) => ({ info: { User: { StartCount: starts, RunTime: run } } }) as unknown as Pick<TableEntry, 'info'>;
  const old = playStats([table(3, 4000), table(0, 0)]);
  assert.deepEqual(old, { games: 3, tables: 1, seconds: 4000, longestTable: 4000 });
  let s = player('Alice');
  const first = grantBadges(s, old);
  assert.deepEqual(first.state.badges.map((b) => b.id), ['first-game', 'hour-on-table']);
  assert.equal(first.events.length, 0, 'premier calcul : aucun évènement');
  s = first.state;
  const later = grantBadges(s, playStats(Array.from({ length: 10 }, () => table(10, 100))));
  assert.deepEqual(later.events.map((e) => e.badge), ['ten-tables', 'hundred-games']);
  assert.equal(grantBadges(later.state, playStats([table(100, 100)])).events.length, 0, 'un badge ne se gagne qu’une fois');
  assert.equal(new Set(BADGES.map((b) => b.icon)).size, BADGES.length, 'une icône par badge');
});

test('mode du réseau : jamais le vrai réseau pendant un essai sans opérateur', () => {
  assert.equal(socialNetMode({}), 'public');
  assert.equal(socialNetMode({ CYBERPINBALL_HOME: 'C:\\bac' }), 'off');
  assert.equal(socialNetMode({ CYBERPINBALL_DISPLAYS: '2' }), 'off');
  assert.equal(socialNetMode({ CYBERPINBALL_AUTOPILOT: '1' }), 'off');
  assert.equal(socialNetMode({ CYBERPINBALL_AUTOPILOT: '1', CYBERPINBALL_RESEAU: 'simule' }), 'simulated');
  assert.equal(socialNetMode({ CYBERPINBALL_RESEAU: 'non' }), 'off');
});

test('fichier : créé partage activé, relu, et mis de côté s’il est illisible (jamais écrasé)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-social-'));
  const first = loadSocial(dir);
  assert.equal(first.enabled, true, 'partage activé par défaut');
  assert.equal(first.lan, true);
  assert.equal(loadSocial(dir).key.publicKey, first.key.publicKey);
  fs.writeFileSync(path.join(dir, 'social.json'), '{ abîmé');
  const again = loadSocial(dir);
  assert.notEqual(again.key.publicKey, first.key.publicKey);
  assert.equal(fs.readdirSync(dir).filter((f) => f.startsWith('social.json.illisible-')).length, 1);
});
