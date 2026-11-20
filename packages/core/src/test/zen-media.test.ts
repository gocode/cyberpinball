// Images des tables de Zen avant leur ajout (packages/core/src/zen-media.ts) et jeu VPS de chaque table
// des catalogues : un joueur voyait Aliens, Archer, American Dad… sans vignette ni médias (20/11/2026).
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { PINBALLFX3_TABLES } from '../pinballfx3';
import { zenCatalog, type ZenTable } from '../zen';
import { withZenVps, zenLocalImages, zenLocalImageType, zenVpsId } from '../zen-media';

test('catalogue FX3 : chaque table a son jeu VPS (sinon ni vignette ni médias) ; Pinball FX : seules les tables absentes de VPS en manquent', () => {
  assert.deepEqual(PINBALLFX3_TABLES.filter((t) => !t.vps).map((t) => t.name), []);
  // Tables propres à FX3 reliées le 20/11/2026 (titres de la base VPS au format FX3).
  const byName = new Map(PINBALLFX3_TABLES.map((t) => [t.name, t]));
  assert.equal(byName.get('Archer')?.vps, 'kyx3Helo');
  assert.equal(byName.get('Alien_Isolation')?.vps, 'sO_RrYyX');
  assert.equal(byName.get('Aliens')?.vps, 'GNXfb2HW');
  // « Mars » est la table de Zen, jamais « Attack from Mars » (Bally).
  assert.equal(byName.get('Mars')?.vps, 'lzQr2axU');
  assert.equal(byName.get('Mars')?.manufacturer, 'Zen Studios');
  assert.notEqual(byName.get('Mars')?.vps, byName.get('BALLY_Attack_from_Mars')?.vps);
  // Pinball FX : les tables encore absentes de la base VPS (relevé du 20/11/2026), et elles seules.
  // Une table ajoutée au catalogue sans jeu VPS doit être vérifiée dans la base, puis listée ici.
  const missing = zenCatalog('pinballfx').filter((t) => !t.vps).map((t) => Number(t.key)).sort((a, b) => a - b);
  assert.deepEqual(missing, [166, 169, 172, 173, 178, 179, 181, 182, 183, 184, 187, 191, 192]);
});

const game = (id: string, name: string, formats: string[]) => ({ id, name, tableFiles: formats.map((tableFormat) => ({ tableFormat })) });
const db = {
  games: [
    game('SQ0gMY8e', 'Portal', ['FX3']),
    game('lzQr2axU', 'Mars', ['FX3']),
    game('9Paf7-CL', 'Attack from Mars', ['VPX', 'FX', 'FX3']),
    game('vpx1', 'Gloomhaven', ['VPX']),
    game('fx-a', 'Doublon', ['FX']),
    game('fx-b', 'Doublon Pinball', ['FX3']),
    game('fx-c', 'Café Crème', ['FX']),
  ],
} as never;

test('jeu VPS par le titre : identique sans casse, accents, ponctuation ni « Pinball », parmi les tables de Zen seulement, jamais deviné', () => {
  // Le catalogue d'abord.
  assert.equal(zenVpsId(db, { vps: 'X', title: 'Portal Pinball' }), 'X');
  assert.equal(zenVpsId(db, { title: 'Portal Pinball' }), 'SQ0gMY8e');
  assert.equal(zenVpsId(db, { title: 'cafe creme!' }), 'fx-c');
  // Un titre qui contient celui d'un autre jeu n'est pas ce jeu.
  assert.equal(zenVpsId(db, { title: 'Terraforming Mars Pinball' }), undefined);
  // Un jeu de la base sans table de Zen ne compte pas.
  assert.equal(zenVpsId(db, { title: 'Gloomhaven Pinball' }), undefined);
  // Deux jeux de Zen au même titre : aucun.
  assert.equal(zenVpsId(db, { title: 'Doublon' }), undefined);
  assert.equal(zenVpsId(undefined, { title: 'Portal' }), undefined);
  const fx: ZenTable = { game: 'pinballfx', key: '190', title: 'Portal', manufacturer: 'Zen Studios' };
  assert.equal(withZenVps(db, fx).vps, 'SQ0gMY8e');
  assert.equal(withZenVps(undefined, fx), fx);
});

/** En-tête PNG minimal : signature, bloc IHDR avec largeur et hauteur (le reste n'est pas lu). */
function png(width: number, height: number): Buffer {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12, 'latin1');
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  return b;
}

test('images rangées à côté des tables : nommées comme le fichier de la table, type tiré des proportions', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-zen-img-'));
  fs.writeFileSync(path.join(dir, 'Archer.png'), png(1920, 1080));
  fs.writeFileSync(path.join(dir, 'Aliens.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0x00, 0x01, 0x00]));
  fs.writeFileSync(path.join(dir, 'Archer.jpg'), Buffer.from([0xff, 0xd8, 0xff]));
  fs.writeFileSync(path.join(dir, 'Logo.png'), png(512, 500));
  fs.writeFileSync(path.join(dir, 'Bandeau.webp'), Buffer.from('RIFF'));
  fs.writeFileSync(path.join(dir, 'Archer.pxp'), '');
  fs.writeFileSync(path.join(dir, 'notes.txt'), '');
  const images = zenLocalImages(dir);
  // Clé : le nom du fichier de la table en minuscules ; le .png passe avant le .jpg du même nom.
  assert.equal(images.get('archer'), path.join(dir, 'Archer.png'));
  assert.equal(images.get('aliens'), path.join(dir, 'Aliens.jpg'));
  assert.equal(images.has('notes'), false);
  // En largeur : le fronton (FX3 l'affiche dans sa fenêtre du fronton) ; en hauteur : une image de la
  // table ; à peu près carrée : un logo ; illisible : rien.
  assert.equal(zenLocalImageType(path.join(dir, 'Archer.png')), 'Backglass');
  fs.writeFileSync(path.join(dir, 'Debout.png'), png(1080, 1920));
  assert.equal(zenLocalImageType(path.join(dir, 'Debout.png')), 'Playfield');
  assert.equal(zenLocalImageType(path.join(dir, 'Logo.png')), 'Wheel');
  assert.equal(zenLocalImageType(path.join(dir, 'Aliens.jpg')), 'Wheel'); // 256 × 256
  assert.equal(zenLocalImageType(path.join(dir, 'Bandeau.webp')), undefined);
  assert.equal(zenLocalImageType(path.join(dir, 'absente.png')), undefined);
  // Dossier absent : aucune image, sans erreur.
  assert.equal(zenLocalImages(path.join(dir, 'absent')).size, 0);
  assert.equal(zenLocalImages(undefined).size, 0);
  fs.rmSync(dir, { recursive: true });
});
