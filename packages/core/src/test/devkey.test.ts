// Clé développeur (devkey.ts, scripts/cle-developpeur.mjs) : signée par la clé de publication, liée à une
// machine, impossible à fabriquer ou à déplacer.

import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import { test } from 'node:test';
import { checkDevKey, devKeyFile, devMachineTag, signDevKey } from '../devkey';
import { UPDATE_PUBLIC_KEY } from '../update-key';

const pair = () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
  return { priv: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), pub: publicKey.export({ type: 'spki', format: 'pem' }).toString() };
};
const PC = '0f1e2d3c-4b5a-6978-8a9b-0c1d2e3f4a5b';
const PINCAB = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

test('valable sur sa machine, avec la clé publique de publication', () => {
  const k = pair();
  const key = signDevKey(PC, 'PC de développement', k.priv, new Date('2026-11-20T12:00:00Z'));
  assert.deepEqual(checkDevKey(JSON.stringify(key), PC, k.pub), { nom: 'PC de développement' });
  assert.deepEqual(checkDevKey(JSON.stringify(key), PC.toUpperCase(), k.pub), { nom: 'PC de développement' }, 'MachineGuid sans égard à la casse');
});

test('copiée sur une autre machine : n’ouvre rien', () => {
  const k = pair();
  const key = signDevKey(PC, 'PC de développement', k.priv);
  assert.equal(checkDevKey(JSON.stringify(key), PINCAB, k.pub), undefined);
});

test('fabriquée ou retouchée sans la clé privée : refusée', () => {
  const k = pair();
  const other = pair();
  assert.equal(checkDevKey(JSON.stringify(signDevKey(PINCAB, 'Faux', other.priv)), PINCAB, k.pub), undefined, 'signée par une autre clé');
  const key = signDevKey(PC, 'PC', k.priv);
  assert.equal(checkDevKey(JSON.stringify({ ...key, machine: devMachineTag(PINCAB) }), PINCAB, k.pub), undefined, 'machine changée');
  assert.equal(checkDevKey(JSON.stringify({ ...key, nom: 'Autre' }), PC, k.pub), undefined, 'nom changé');
  assert.equal(checkDevKey(JSON.stringify({ ...key, signature: '' }), PC, k.pub), undefined);
  assert.equal(checkDevKey('{ cassé', PC, k.pub), undefined);
  assert.equal(checkDevKey(undefined, PC, k.pub), undefined);
  assert.equal(checkDevKey(JSON.stringify(key), undefined, k.pub), undefined, 'MachineGuid illisible : rien n’est ouvert');
});

test('l’empreinte ne laisse pas lire le MachineGuid, et la clé ne le contient pas', () => {
  const k = pair();
  const text = JSON.stringify(signDevKey(PC, 'PC', k.priv));
  assert.ok(!text.toLowerCase().includes(PC));
  assert.match(devMachineTag(PC), /^[0-9a-f]{32}$/);
});

test('vérifiée avec la clé publique livrée, et rangée hors des données de la borne', () => {
  assert.match(UPDATE_PUBLIC_KEY, /BEGIN PUBLIC KEY/);
  assert.match(devKeyFile({}) ?? '', /[\\/]\.cyberpinball[\\/]developpeur\.json$/);
  assert.equal(devKeyFile({ CYBERPINBALL_CLE_DEV: 'x.json' }), 'x.json');
  assert.equal(devKeyFile({ CYBERPINBALL_HOME: 'bac' }), undefined, 'bac à sable : la vraie clé du poste n’entre jamais dans les essais');
  assert.equal(devKeyFile({ CYBERPINBALL_HOME: 'bac', CYBERPINBALL_CLE_DEV: 'x.json' }), 'x.json');
});
