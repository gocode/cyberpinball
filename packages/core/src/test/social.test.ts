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
  directorySample,
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
  repairDirectorySeen,
  relationOf,
  requestFriend,
  playerId,
  searchDirectory,
  setName,
  signProfile,
  socialNetMode,
  syncReply,
  verifyProfile,
  type DirectoryEntry,
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
  assert.match(playerId(s.key.publicKey), /^[0-9A-F]{4}(-[0-9A-F]{4}){3}$/);
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
  // L'identifiant vu sur sa fiche : entier, son début (avec ou sans « # », tirets ou espaces), ou après le nom.
  const id = playerId(alexia.key.publicKey);
  for (const query of [id, id.slice(0, 9), `#${id.slice(0, 4)}`, id.slice(0, 9).replace('-', ' ').toLowerCase(), `ale #${id.slice(0, 4)}`]) {
    assert.deepEqual(searchDirectory(state, query).map((d) => d.profile.name), ['Alexia'], query);
  }
  // Réseau local : à proximité tant que la balise est récente.
  const near = { ...me, directory: mergeDirectory(dir, [signProfile(eloise)], { self: me.key.publicKey, now, lan: true }) };
  assert.deepEqual(nearbyPlayers(near, now).map((d) => d.profile.name), ['Éloïse']);
  assert.deepEqual(nearbyPlayers(near, new Date(now.getTime() + 120_000)), []);
});

test('annuaire : « vu » est la vraie dernière fois en ligne, jamais l’heure du dernier relais', () => {
  const me = player('Moi');
  const day = 24 * 3600_000;
  const t0 = new Date('2026-11-12T08:00:00.000Z');
  // Profils signés il y a quelques jours (date du nom).
  const signed = (name: string, ago: number) => setName({ ...player(name), nameAt: new Date(t0.getTime() - ago).toISOString() }, name, new Date(t0.getTime() - ago))!;
  const relay = signed('Relais', day);
  const ana = signed('Ana', 5 * day), ben = signed('Ben', 9 * day), cleo = signed('Cleo', 2 * day);
  // La borne relais a vu Ana il y a 2 h, Ben il y a 4 j ; Cleo, elle ne dit rien (borne d'avant la date relayée).
  const anaSeen = new Date(t0.getTime() - 2 * 3600_000).toISOString();
  const benSeen = new Date(t0.getTime() - 4 * day).toISOString();
  const relayState = { ...relay, directory: [{ profile: signProfile(ana), seen: anaSeen }, { profile: signProfile(ben), seen: benSeen }] };
  const sample = directorySample(relayState, t0);
  assert.equal(sample[0]!.seen, t0.toISOString(), 'la borne qui relaie : vue maintenant');
  // Le message passe par le réseau : la date relayée survit à la vérification.
  const hello = parseSocialMessage(JSON.parse(JSON.stringify({ t: 'hello', profile: signProfile(relay), dir: [...sample, signProfile(cleo)] })), t0);
  assert.ok(hello?.t === 'hello');
  const later = new Date(t0.getTime() + 3 * 3600_000);
  let s = learnProfiles(me, hello.dir, { now: later, relayed: true });
  const seenOf = (st: SocialState, p: SocialState) => st.directory.find((d) => d.profile.key === p.key.publicKey)?.seen;
  assert.equal(seenOf(s, relay), t0.toISOString(), 'le relais lui-même : vu quand il a envoyé');
  assert.equal(seenOf(s, ana), anaSeen);
  assert.equal(seenOf(s, ben), benSeen);
  assert.equal(seenOf(s, cleo), cleo.nameAt, 'sans date relayée : celle du profil signé, jamais « maintenant »');
  assert.ok(!s.directory.some((d) => 'seen' in d.profile), 'la date du relais ne se mêle pas au profil gardé');
  // Un second relais, plus tard, sans nouvelle de Ben : sa date ne bouge pas (le bogue : toutes à l'heure du relais).
  s = learnProfiles(s, [{ ...signProfile(ben), seen: benSeen }], { now: new Date(later.getTime() + 3600_000), relayed: true });
  assert.equal(seenOf(s, ben), benSeen);
  assert.equal(new Set(s.directory.map((d) => d.seen)).size, s.directory.length, 'chaque joueur garde sa propre date');
  // Une date plus ancienne ne recule pas une date connue ; une date dans l'avenir s'arrête à maintenant.
  s = learnProfiles(s, [{ ...signProfile(ana), seen: new Date(t0.getTime() - 3 * day).toISOString() }], { now: later, relayed: true });
  assert.equal(seenOf(s, ana), anaSeen);
  s = learnProfiles(s, [{ ...signProfile(ana), seen: new Date(later.getTime() + 30 * day).toISOString() }], { now: later, relayed: true });
  assert.equal(seenOf(s, ana), later.toISOString());
  // Vu directement (bonjour, balise) : maintenant.
  s = learnProfiles(s, [signProfile(ben)], { now: later });
  assert.equal(seenOf(s, ben), later.toISOString());
  // Les joueurs relayés ne se rajeunissent plus : passé le délai de l'annuaire, ils en sortent.
  s = learnProfiles(s, [{ ...signProfile(cleo) }], { now: new Date(t0.getTime() + 70 * day), relayed: true });
  assert.equal(seenOf(s, cleo), undefined);
});

test('annuaire : les dates « vu » faussées par l’ancien relais sont réparées à la relecture', () => {
  const me = player('Moi');
  const t0 = new Date('2026-11-12T08:00:00.000Z');
  const relayHour = new Date(t0.getTime() - 3 * 3600_000).toISOString();
  const named = (name: string, at: string) => setName({ ...player(name), nameAt: at }, name, new Date(at))!;
  const ana = named('Ana', '2026-11-01T10:00:00.000Z'), ben = named('Ben', '2026-11-02T10:00:00.000Z'), cleo = named('Cleo', '2026-11-03T10:00:00.000Z'), dan = named('Dan', '2026-11-04T10:00:00.000Z');
  // Tous « vus » à la même heure, celle du dernier relais (le bogue).
  const old = {
    ...me,
    directorySeenChecked: undefined,
    directory: [ana, ben, cleo, dan].map((p): DirectoryEntry => ({ profile: signProfile(p), seen: relayHour })),
    friends: [{ key: ben.key.publicKey, name: 'Ben', since: '2026-10-01T00:00:00.000Z', lastSeen: '2026-11-10T20:00:00.000Z', events: [] }],
    incoming: [{ key: cleo.key.publicKey, name: 'Cleo', at: '2026-11-11T09:00:00.000Z' }],
  };
  old.directory[3] = { ...old.directory[3]!, lanSeen: '2026-11-12T07:30:00.000Z' };
  const reread = parseSocialState(JSON.parse(JSON.stringify(old)))!;
  const seenOf = (p: SocialState) => reread.directory.find((d) => d.profile.key === p.key.publicKey)?.seen;
  assert.equal(seenOf(ana), ana.nameAt, 'sans autre preuve : la date du profil signé');
  assert.equal(seenOf(ben), '2026-11-10T20:00:00.000Z', 'ami : sa dernière présence');
  assert.equal(seenOf(cleo), '2026-11-11T09:00:00.000Z', 'demande reçue de lui');
  assert.equal(seenOf(dan), relayHour, 'jamais plus tard que la date gardée (balise plus récente que le relais)');
  assert.equal(reread.directorySeenChecked, true);
  // Une fois réparé, rien n'y retouche.
  const fresh = { ...reread, directory: [{ profile: signProfile(ana), seen: relayHour }] };
  assert.equal(parseSocialState(JSON.parse(JSON.stringify(fresh)))!.directory[0]!.seen, relayHour);
  assert.deepEqual(repairDirectorySeen([], { friends: [], incoming: [] }), []);
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
