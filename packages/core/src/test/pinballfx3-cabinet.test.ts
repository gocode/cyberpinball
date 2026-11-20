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
  PINBALLFX3_ORIENTATION_NOTICE_FILE,
  PINBALLFX3_SYSTEM_CONFIG,
  pinballFx3FirstRunMessage,
  pinballFx3NeverOpened,
  pinballFx3Orientation,
  pinballFx3OrientationChange,
  pinballFx3PurchaseLine,
  takePinballFx3OrientationNotice,
} from '../pinballfx3-cabinet';
import { REPO_ROOT } from './i18n-scan';

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

// Essai sur un PinCab le 20/11/2026 : flippers au bord droit de l'image retournée à 180° pour VPX
// (Windows à 0°). Avant 0.2.2-essai.10, FX3 voulait 270° ; depuis, 270° est à l'envers et 90° juste.
test('orientation de FX3 : quart de tour vers le bord des flippers ; avant/après le retour à l’orientation de Windows', () => {
  assert.equal(pinballFx3Orientation('left'), 90);
  assert.equal(pinballFx3Orientation('right'), 270);
  assert.equal(pinballFx3Orientation('bottom'), 0);
  assert.deepEqual(pinballFx3OrientationChange('right', 180, 0), { before: 270, after: 90 }, 'le PinCab de l’essai');
  assert.equal(pinballFx3OrientationChange('right', undefined, 0), undefined, 'écran jamais tourné pour VPX : rien n’a changé');
  assert.equal(pinballFx3OrientationChange('right', 180, undefined), undefined, 'Windows a déjà l’orientation de jeu : rien n’a changé');
  assert.equal(pinballFx3OrientationChange('right', 90, 90), undefined);
  // Quart de tour : la valeur change aussi, d'un quart de tour.
  const quarter = pinballFx3OrientationChange('bottom', 90, 0)!;
  assert.ok(quarter && quarter.before === 0 && (quarter.after === 90 || quarter.after === 270), JSON.stringify(quarter));
});

test('avertissement du changement d’orientation : une seule fois, et seulement si FX3 a déjà été lancé par Cyber Pinball', () => {
  const change = { before: 270, after: 90 } as const;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-fx3-orientation-'));
  const notice = takePinballFx3OrientationNotice(dir, true, change);
  assert.ok(notice);
  assert.match(notice.title, /Pinball FX3 : orientation à changer/);
  assert.match(notice.lines.join('\n'), /passez Orientation de 270° à 90°/);
  assert.match(notice.lines.at(-1)!, /^Start : ouvrir Pinball FX3 · Exit : revenir au front-end$/);
  assert.ok(fs.existsSync(path.join(dir, PINBALLFX3_ORIENTATION_NOTICE_FILE)));
  assert.equal(takePinballFx3OrientationNotice(dir, true, change), undefined, 'montré une fois');
  // Borne qui n'avait jamais lancé FX3 : rien à dire, ni maintenant ni plus tard.
  const fresh = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-fx3-orientation-'));
  assert.equal(takePinballFx3OrientationNotice(fresh, false, change), undefined);
  assert.equal(takePinballFx3OrientationNotice(fresh, true, change), undefined, 'témoin posé à la première partie');
  // Orientation inchangée : rien, et témoin posé.
  const same = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-fx3-orientation-'));
  assert.equal(takePinballFx3OrientationNotice(same, true, undefined), undefined);
  assert.ok(fs.existsSync(path.join(same, PINBALLFX3_ORIENTATION_NOTICE_FILE)));
});

test('frontend.ts : l’avertissement d’orientation passe avant le lancement de FX3, avec Start pour ouvrir le jeu', () => {
  const src = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'frontend.ts'), 'utf8');
  const body = src.slice(src.indexOf('async function playPinballFx('));
  const notice = body.indexOf('takePinballFx3OrientationNotice(');
  assert.ok(notice > 0 && notice < body.indexOf('launchPinballFx('));
  assert.match(body.slice(notice, notice + 600), /StartCount/);
  assert.match(body.slice(notice), /action: 'zenFirstRun'/);
});

test('partie trop courte : une table gratuite ne fait pas soupçonner un achat manquant', () => {
  const paid = pinballFx3ShortGameMessage(10, 'UNIVERSAL_BTTF')!.lines.join('\n');
  assert.match(paid, /pas sur ce compte Steam/);
  const free = pinballFx3ShortGameMessage(10, 'WMS_Fish_Tales')!.lines.join('\n');
  assert.doesNotMatch(free, /pas sur ce compte Steam/);
  assert.match(free, /mode borne n’est pas activé/);
});
