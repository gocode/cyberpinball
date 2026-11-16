// Avatar public (décidé le 15/11/2026) : l'avatar de chaque joueur est visible de tous, ami ou non.
// Son empreinte voyage avec la présence publique (livepresence.ts) et la présence dans un salon
// (rooms.ts), signée à part pour que les bornes d'avant la vérifient toujours ; l'empreinte d'un
// joueur se choisit dans l'ordre de ses sources (publicAvatarHash). Le parcours entre bornes est
// dans social-net.test.ts (« avatar : public, vu par tout joueur relié, ami ou non »).

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { publicAvatarHash, signAvatarClaim, verifyAvatarClaim } from '../avatar';
import { signBeacon, verifyBeacon } from '../livepresence';
import { signRoomHere, verifyRoomHere } from '../rooms';
import { newSocialState, setName, type SocialState } from '../social';

const T0 = new Date('2026-11-15T21:00:00Z');
const soon = new Date(T0.getTime() + 1000);
const player = (name: string): SocialState => setName(newSocialState(T0), name)!;
const A = 'a'.repeat(64);
const B = 'b'.repeat(64);

test('avatar public : l’empreinte voyage avec la présence publique, signée ; retouchée, elle tombe, le signal reste', () => {
  const kiko = player('Kiko');
  const b = signBeacon(kiko, { status: 'online', country: 'FR', avatar: A }, T0);
  assert.equal(b.avatar, A);
  assert.deepEqual(verifyBeacon(JSON.parse(JSON.stringify(b)), soon), b);
  // Empreinte remplacée en route : le signal est gardé, sans avatar (ses initiales).
  const swapped = verifyBeacon({ ...b, avatar: B }, soon)!;
  assert.equal(swapped.key, kiko.key.publicKey);
  assert.equal(swapped.avatar, undefined);
  // Une borne d'avant les avatars publics relaie le signal sans l'empreinte : toujours valable.
  const { avatar: _a, asig: _s, ...old } = b;
  assert.deepEqual(verifyBeacon(old, soon), old);
  // Pas d'avatar : rien de joint.
  const plain = signBeacon(kiko, { status: 'playing' }, T0);
  assert.equal('avatar' in plain || 'asig' in plain, false);
  // La signature de l'empreinte d'un autre joueur ne passe pas.
  const other = player('Lou');
  assert.equal(verifyBeacon({ ...b, ...signAvatarClaim('live', other.key, b.at, B) }, soon)!.avatar, undefined);
});

test('avatar public : l’empreinte voyage avec la présence dans un salon, signée à part', () => {
  const kiko = player('Kiko');
  const h = signRoomHere(kiko, 'monde', 'FR', T0, A);
  assert.equal(verifyRoomHere(JSON.parse(JSON.stringify(h)), soon)?.avatar, A);
  assert.equal(verifyRoomHere({ ...h, avatar: B }, soon)?.avatar, undefined);
  // La signature d'un signal de présence publique ne vaut pas pour un salon (et inversement).
  const live = signAvatarClaim('live', kiko.key, h.at, A);
  assert.equal(verifyRoomHere({ ...h, ...live }, soon)?.avatar, undefined);
  assert.deepEqual(verifyAvatarClaim('room-here', kiko.key.publicKey, h.at, { avatar: 'pas-une-empreinte', asig: h.asig }), {});
});

test('avatar public : la source la plus sûre et la plus fraîche l’emporte, « aucun » annoncé par la borne compte', () => {
  // Borne reliée, présence publique, salon, carte, score.
  assert.equal(publicAvatarHash([undefined, undefined, undefined, A, B]), A, 'la carte avant le score');
  assert.equal(publicAvatarHash([B, A, A, A, A]), B, 'sa borne reliée avant tout');
  assert.equal(publicAvatarHash([undefined, undefined, undefined, undefined, B]), B, 'le score seul suffit');
  assert.equal(publicAvatarHash([null, A, A, A, A]), undefined, 'sa borne dit qu’il n’en a plus : ses initiales');
  assert.equal(publicAvatarHash([undefined, undefined, undefined, undefined, undefined]), undefined);
  assert.equal(publicAvatarHash(['../social.json', A]), undefined, 'pas une empreinte : rien');
});
