// Identités communes à toutes les bornes (docs/recherche/partage-medias.md, § 2) : deux bornes
// disent « c'est la même table » sans se concerter, un média se reconnaît à son contenu, un
// joueur signe ce qu'il partage.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import {
  checkShareable,
  createPlayerKey,
  isShareableType,
  MEDIA_TYPES,
  mediaIdentity,
  parseTableIdentity,
  playerFingerprint,
  sameTable,
  signText,
  tableIdentity,
  tableShareKeys,
  verifyText,
  type TableEntry,
} from '../index';

const PNG = Buffer.concat([Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'), Buffer.alloc(200, 7)]);
const MP4 = Buffer.concat([Buffer.from('0000001866747970', 'hex'), Buffer.from('isom'), Buffer.alloc(200, 3)]);
const EXE = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(200, 1)]);
const HTML = Buffer.from('<!DOCTYPE html><html><head><title>Error</title></head></html>');

function entry(info: TableEntry['info'], title = 'Terminator 2'): TableEntry {
  return { id: 'T2/T2.vpx', emulator: 'vpx', file: 'T2.vpx', folder: 'T2', title, infoFile: 'T2.info', info };
}

test('identité d’une table : VPS, ROM, titre et année, depuis le .info', () => {
  const id = tableIdentity(entry({ Info: { VPSId: 'Mdu-NoeR', Title: 'Terminator 2 - Judgment Day', Manufacturer: 'Williams', Year: 1991 } }), ['T2_L8', 't2_l8', '../evil']);
  assert.deepEqual(id, { vpsId: 'Mdu-NoeR', roms: ['t2_l8'], title: 'Terminator 2 - Judgment Day', manufacturer: 'Williams', year: 1991 });
  assert.deepEqual(tableShareKeys(id), ['vps:Mdu-NoeR', 'rom:t2_l8', 'title:terminator2judgmentday:1991']);
});

test('même table : l’identifiant VPS tranche, puis la ROM, puis le titre et l’année', () => {
  const t2 = { vpsId: 'Mdu-NoeR', roms: ['t2_l8'], title: 'Terminator 2', year: 1991 };
  assert.equal(sameTable(t2, { vpsId: 'Mdu-NoeR', title: 'T2' }), 'vps');
  // Deux jeux VPS différents restent différents, même avec la même ROM.
  assert.equal(sameTable(t2, { vpsId: 'autre', roms: ['t2_l8'], title: 'Terminator 2', year: 1991 }), undefined);
  assert.equal(sameTable(t2, { roms: ['t2_l8'], title: 'Autre nom' }), 'rom');
  assert.equal(sameTable({ title: 'Términator 2!', year: 1991 }, { title: 'terminator 2', year: 1991 }), 'title');
  assert.equal(sameTable({ title: 'Terminator 2', year: 1991 }, { title: 'Terminator 2', year: 1992 }), undefined);
  assert.equal(sameTable({ title: 'Terminator 2', year: 1991 }, { title: 'Terminator 2' }), undefined);
});

test('identité reçue d’ailleurs : nettoyée, ou refusée si elle ne désigne rien', () => {
  assert.equal(parseTableIdentity(null), undefined);
  assert.equal(parseTableIdentity({ title: '  ' }), undefined);
  assert.deepEqual(parseTableIdentity({ vpsId: 'a/../b', title: 'X\u0000Y', year: '1991', roms: ['ok_1', 5] }), { roms: ['ok_1'], title: 'X Y' });
});

test('ne circulent que les médias que le menu montre, contrôlés sur leurs octets', () => {
  // Types sans rôle (Other, RealDMD) : jamais partagés.
  const shareable = MEDIA_TYPES.filter((m) => isShareableType(m.type)).map((m) => m.type);
  assert.ok(shareable.includes('Backglass') && shareable.includes('Audio') && !shareable.includes('Other') && !shareable.includes('RealDMD'));
  assert.deepEqual(checkShareable('Backglass', 'a.png', PNG, PNG.length), { ok: true, kind: 'image', format: 'png' });
  assert.deepEqual(checkShareable('Backglass', 'a.mp4', MP4, MP4.length), { ok: true, kind: 'video', format: 'mp4' });
  // Exécutable ou page web déguisés, archive, ROM, table : refusés.
  for (const [name, head] of [['a.png', EXE], ['a.mp4', HTML], ['a.exe', EXE], ['t2_l8.zip', Buffer.from('PK\x03\x04')], ['T2.vpx', PNG], ['a.png', MP4]] as const) {
    assert.equal(checkShareable('Backglass', name, head, 100).ok, false, name);
  }
  assert.equal(checkShareable('Other', 'a.png', PNG, PNG.length).ok, false);
  assert.equal(checkShareable('Wheel', 'a.png', PNG, 65 * 2 ** 20).ok, false, 'image trop grosse');
});

test('identité d’un média : SHA-256 du contenu, format et nature', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-partage-'));
  const file = path.join(dir, '(Wheel) T2.png');
  fs.writeFileSync(file, PNG);
  const id = mediaIdentity(file, 'Wheel');
  assert.ok(id.ok);
  assert.deepEqual(id.media, { type: 'Wheel', kind: 'image', format: 'png', bytes: PNG.length, sha256: createHash('sha256').update(PNG).digest('hex') });
  assert.equal(mediaIdentity(path.join(dir, 'absent.png'), 'Wheel').ok, false);
  fs.rmSync(dir, { recursive: true });
});

test('clé du joueur : la signature vaut pour ce texte et cette clé seulement', () => {
  const key = createPlayerKey();
  const other = createPlayerKey();
  assert.match(key.publicKey, /^[0-9a-f]{64}$/);
  assert.match(playerFingerprint(key.publicKey), /^[0-9a-f]{4}(-[0-9a-f]{4}){3}$/);
  assert.notEqual(playerFingerprint(key.publicKey), playerFingerprint(other.publicKey));
  const sig = signText('manifeste', key);
  assert.equal(verifyText('manifeste', sig, key.publicKey), true);
  assert.equal(verifyText('manifeste modifié', sig, key.publicKey), false);
  assert.equal(verifyText('manifeste', sig, other.publicKey), false);
  assert.equal(verifyText('manifeste', sig, 'pas une clé'), false);
});
