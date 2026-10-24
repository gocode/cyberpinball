import assert from 'node:assert/strict';
import { test } from 'node:test';
import { edidFromHex, parseEdid } from '../edid';
import { makeEdid } from './fixtures';

test('lit fabricant, produit, série texte, nom et taille', () => {
  const info = parseEdid(
    makeEdid({ manufacturer: 'SAM', productCode: 0x0c8d, serialText: 'H4LN301501', monitorName: 'S22E450', widthCm: 48, heightCm: 27 }),
  );
  assert.deepEqual(info, {
    manufacturer: 'SAM',
    productCode: 0x0c8d,
    serialNumber: 0,
    serialText: 'H4LN301501',
    monitorName: 'S22E450',
    widthCm: 48,
    heightCm: 27,
  });
});

test('lit le numéro de série binaire en non signé', () => {
  const info = parseEdid(makeEdid({ manufacturer: 'DEL', productCode: 0xa0b1, serialNumber: 0xfedcba98, widthCm: 60, heightCm: 34 }));
  assert.equal(info?.serialNumber, 0xfedcba98);
  assert.equal(info?.serialText, undefined);
});

test("rejette un bloc sans l'en-tête EDID", () => {
  assert.equal(parseEdid(new Uint8Array(128)), undefined);
  assert.equal(parseEdid(new Uint8Array(10)), undefined);
});

test('convertit la sortie hexadécimale de reg query', () => {
  assert.deepEqual([...edidFromHex('00FFff10')], [0x00, 0xff, 0xff, 0x10]);
});

test('lit la taille de l’image au millimètre dans le timing détaillé', () => {
  const info = parseEdid(makeEdid({ manufacturer: 'IVM', productCode: 0x564c, widthCm: 48, heightCm: 26, imageMm: { width: 477, height: 268 } }));
  assert.deepEqual(info?.imageMm, { width: 477, height: 268 });
});
