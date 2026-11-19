// Pinball FX3 sur une borne (packages/core/src/pinballfx3-cabinet.ts) : jeu jamais ouvert sur le PC
// reconnu avant la partie, tables gratuites, message d'une partie trop courte. Sur un disque simulé.
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { pinballFx3ShortGameMessage, pinballFx3Table } from '../pinballfx3';
import {
  isFreePinballFx3Table,
  PINBALLFX3_FREE_TABLES,
  PINBALLFX3_SYSTEM_CONFIG,
  pinballFx3FirstRunMessage,
  pinballFx3NeverOpened,
  pinballFx3PurchaseLine,
} from '../pinballfx3-cabinet';

function gameDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-fx3-borne-'));
  fs.mkdirSync(path.join(dir, 'data', 'steam'), { recursive: true });
  return dir;
}

test('jamais ouvert : dossier du jeu sans SystemConfigCache.dat ; dans le doute (dossier absent), rien à dire', () => {
  const dir = gameDir();
  assert.equal(pinballFx3NeverOpened(dir), true);
  fs.writeFileSync(path.join(dir, PINBALLFX3_SYSTEM_CONFIG), Buffer.from([2, 0x6f, 0x95]));
  assert.equal(pinballFx3NeverOpened(dir), false);
  assert.equal(pinballFx3NeverOpened(path.join(dir, 'absent')), false);
  // Un fichier à la place du dossier : pas un jeu installé, rien à dire.
  assert.equal(pinballFx3NeverOpened(path.join(dir, PINBALLFX3_SYSTEM_CONFIG)), false);
});

test('avant la partie : message seulement si le jeu n’a jamais été ouvert, avec Start pour l’ouvrir quand même', () => {
  const dir = gameDir();
  const first = pinballFx3FirstRunMessage(dir, 'UNIVERSAL_BTTF');
  assert.ok(first);
  assert.match(first.title, /Première ouverture de Pinball FX3/);
  const text = first.lines.join('\n');
  assert.match(text, /mode borne/);
  assert.match(text, /icône de borne à côté du profil/);
  assert.match(text, /chiffrés/);
  // Table payante : rappeler que seules deux tables sont gratuites.
  assert.match(text, /Seules Fish Tales et Sorcerer’s Lair sont gratuites/);
  assert.match(first.lines.at(-1)!, /^Start : ouvrir Pinball FX3 · Exit : revenir au front-end$/);
  // Table gratuite : pas de rappel d'achat.
  assert.doesNotMatch(pinballFx3FirstRunMessage(dir, 'WMS_Fish_Tales')!.lines.join('\n'), /gratuites/);
  // Jeu déjà ouvert sur ce PC : rien à dire avant la partie (le fichier ne dit pas si le mode borne est actif).
  fs.writeFileSync(path.join(dir, PINBALLFX3_SYSTEM_CONFIG), '');
  assert.equal(pinballFx3FirstRunMessage(dir, 'UNIVERSAL_BTTF'), undefined);
});

test('tables gratuites : des fichiers du catalogue, Fish Tales et Sorcerer’s Lair, sans tenir compte de la casse', () => {
  assert.deepEqual(PINBALLFX3_FREE_TABLES.map((n) => pinballFx3Table(n)?.title).sort(), ['Fish Tales', 'Sorcerer\'s Lair']);
  for (const n of PINBALLFX3_FREE_TABLES) assert.equal(pinballFx3Table(n)?.known, true, n);
  assert.equal(isFreePinballFx3Table('citadel'), true);
  assert.equal(isFreePinballFx3Table('UNIVERSAL_BTTF'), false);
  assert.equal(pinballFx3PurchaseLine('Citadel'), undefined);
  assert.ok(pinballFx3PurchaseLine('UNIVERSAL_BTTF'));
});

test('partie trop courte : une table gratuite ne fait pas soupçonner un achat manquant', () => {
  const paid = pinballFx3ShortGameMessage(10, 'UNIVERSAL_BTTF')!.lines.join('\n');
  assert.match(paid, /pas sur ce compte Steam/);
  const free = pinballFx3ShortGameMessage(10, 'WMS_Fish_Tales')!.lines.join('\n');
  assert.doesNotMatch(free, /pas sur ce compte Steam/);
  assert.match(free, /mode borne n’est pas activé/);
});
