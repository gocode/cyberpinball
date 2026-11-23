// L'empreinte du travail d'une branche (certificat de vérification verte) ne dépend que du contenu de
// son diff : un décalage de lignes venu de proto/ecrans ne l'invalide pas (23/11/2026).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fingerprintOfDiff } from './coordination.mjs';

const diff = (index, header, ligne = "+  return fichier ?? 'aucun';") => [
  'diff --git a/scripts/outil.mjs b/scripts/outil.mjs',
  `index ${index} 100644`,
  '--- a/scripts/outil.mjs',
  '+++ b/scripts/outil.mjs',
  header,
  "-  return fichier;",
  ligne,
  '',
].join('\n');

test('empreinte : mêmes lignes changées plus bas dans le fichier, même empreinte', () => {
  const avant = fingerprintOfDiff(diff('1a2b3c4..5d6e7f8', '@@ -12 +12 @@ export function lire() {'));
  assert.equal(fingerprintOfDiff(diff('9a8b7c6..5d4e3f2', '@@ -40 +40 @@ export function lire() {')), avant, 'numéros de ligne et index');
  assert.equal(fingerprintOfDiff(diff('9a8b7c6..5d4e3f2', '@@ -40,1 +41,1 @@ function autre(x) {')), avant, 'compteurs et fonction citée');
});

test('empreinte : un contenu différent change l’empreinte', () => {
  const avant = fingerprintOfDiff(diff('1a2b3c4..5d6e7f8', '@@ -12 +12 @@'));
  assert.notEqual(fingerprintOfDiff(diff('1a2b3c4..5d6e7f8', '@@ -12 +12 @@', "+  return fichier ?? 'rien';")), avant);
  assert.notEqual(fingerprintOfDiff(diff('1a2b3c4..5d6e7f8', '@@ -12 +12 @@').replace(/outil/g, 'autre')), avant, 'autre fichier');
});
