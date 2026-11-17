// Lectures allégées (17/11/2026) : le médecin, la fiche d'une table et le lancement relisaient des
// Go de fichiers sans en avoir besoin. Invariants :
// - les écrans d'un pack (packScreens) sans l'analyse complète, même résultat que analysePack ;
// - les fichiers d'une option comparés en entier jusqu'à 256 Kio, au-delà par extraits (début,
//   milieu, fin), jamais lus en entier ; une différence dans un extrait est vue ;
// - un .vpx lu par blocs de secteurs contigus, même texte qu'avant ; son script gardé tant que la
//   table ne change pas ;
// - les relevés du démarrage (VR, PuP-Packs) rendent la main entre deux tables et attendent la fin
//   d'une partie.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { analysePack, forgetFileComparisons, packScreens, variantDifferences } from '../puppack';
import { forgetVpxScripts, readVpxScript } from '../vpxinfo';
import { gotgPack, starTrekPack, vpxWithScript } from './fixtures';
import { frontendSource } from './frontend-source';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const nodeFs = require('node:fs') as { readFileSync: typeof fs.readFileSync; openSync: typeof fs.openSync };
const REPO = path.join(__dirname, '..', '..', '..', '..');

function tmp(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test('PuP-Pack : packScreens rend les écrans de analysePack, sans lire les .bat ni les options', () => {
  for (const make of [(root: string) => gotgPack(root, 2), (root: string) => gotgPack(root, 0), starTrekPack]) {
    const root = tmp('cp-pack-ecrans-');
    try {
      make(root);
      assert.deepEqual(packScreens(root), analysePack(root).screens);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
  const empty = tmp('cp-pack-vide-');
  try {
    assert.deepEqual(packScreens(empty), []);
    assert.deepEqual(packScreens(path.join(empty, 'absent')), []);
  } finally {
    fs.rmSync(empty, { recursive: true, force: true });
  }
});

test('PuP-Pack : une option de gros fichiers comparée par extraits, jamais lue en entier ; une différence au milieu est vue', () => {
  const root = tmp('cp-pack-comparaison-');
  const realRead = nodeFs.readFileSync;
  try {
    const size = 3 * 1024 * 1024;
    const video = Buffer.alloc(size);
    for (let i = 0; i < size; i++) video[i] = (i * 31 + (i >> 9)) & 0xff;
    fs.mkdirSync(path.join(root, 'Option 1'));
    fs.writeFileSync(path.join(root, 'Option 1', 'attract.mp4'), video);
    fs.writeFileSync(path.join(root, 'Option 1', 'screens.pup'), 'ScreenNum,ScreenDes\r\n2,Backglass\r\n');
    fs.writeFileSync(path.join(root, 'attract.mp4'), video);
    fs.writeFileSync(path.join(root, 'screens.pup'), 'ScreenNum,ScreenDes\r\n2,Backglass\r\n');
    const variant = { copies: [{ from: path.join('Option 1', 'attract.mp4'), to: 'attract.mp4' }, { from: path.join('Option 1', 'screens.pup'), to: 'screens.pup' }], deletes: [] };

    let bigReads = 0;
    nodeFs.readFileSync = ((p: fs.PathOrFileDescriptor, ...rest: unknown[]) => {
      if (typeof p === 'string' && p.endsWith('attract.mp4')) bigReads++;
      return (realRead as (...a: unknown[]) => unknown)(p, ...rest);
    }) as typeof fs.readFileSync;

    forgetFileComparisons();
    assert.deepEqual(variantDifferences(root, variant), [], 'option en place');
    assert.equal(bigReads, 0, 'la vidéo n’est jamais lue en entier');

    // Un octet changé au milieu : même taille, extrait du milieu différent.
    const changed = Buffer.from(video);
    changed[Math.floor(size / 2)] = (changed[Math.floor(size / 2)]! + 1) & 0xff;
    fs.writeFileSync(path.join(root, 'attract.mp4'), changed);
    const later = new Date(Date.now() + 5000);
    fs.utimesSync(path.join(root, 'attract.mp4'), later, later);
    assert.equal(variantDifferences(root, variant).length, 1, 'la vidéo différente est signalée');
    // Un octet changé à la fin.
    fs.writeFileSync(path.join(root, 'attract.mp4'), Buffer.concat([video.subarray(0, size - 1), Buffer.from([video[size - 1]! ^ 0xff])]));
    const later2 = new Date(Date.now() + 10_000);
    fs.utimesSync(path.join(root, 'attract.mp4'), later2, later2);
    assert.equal(variantDifferences(root, variant).length, 1);
    assert.equal(bigReads, 0);

    // Petit fichier : comparé octet par octet.
    fs.writeFileSync(path.join(root, 'attract.mp4'), video);
    fs.writeFileSync(path.join(root, 'screens.pup'), 'ScreenNum,ScreenDes\r\n2,Backglasz\r\n');
    assert.equal(variantDifferences(root, variant).length, 1);
  } finally {
    nodeFs.readFileSync = realRead;
    forgetFileComparisons();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('.vpx : un long script lu par blocs de secteurs donne le même texte, et n’est relu que si la table change', () => {
  const dir = tmp('cp-vpx-blocs-');
  const realOpen = nodeFs.openSync;
  try {
    const file = path.join(dir, 'Longue table.vpx');
    // Environ 45 Kio de script : une centaine de secteurs à la suite (le fichier d’essai tient sur une FAT).
    const script = Array.from({ length: 900 }, (_, i) => `Sub Ligne${i} : PlaySound "son_${i}" : End Sub\r\n`).join('');
    fs.writeFileSync(file, vpxWithScript(script));
    forgetVpxScripts();
    let opens = 0;
    nodeFs.openSync = ((p: fs.PathLike, ...rest: unknown[]) => {
      if (String(p) === file) opens++;
      return (realOpen as (...a: unknown[]) => number)(p, ...rest);
    }) as typeof fs.openSync;
    assert.equal(readVpxScript(file), script);
    assert.equal(readVpxScript(file), script);
    assert.equal(readVpxScript(file), script);
    assert.equal(opens, 1, 'trois lectures, une ouverture');

    const other = `${script}' fin\r\n`;
    fs.writeFileSync(file, vpxWithScript(other));
    const later = new Date(Date.now() + 5000);
    fs.utimesSync(file, later, later);
    // writeFileSync ouvre lui-même le fichier : seules comptent les ouvertures de la lecture.
    const before = opens;
    assert.equal(readVpxScript(file), other, 'table changée : relue');
    assert.equal(opens, before + 1);
  } finally {
    nodeFs.openSync = realOpen;
    forgetVpxScripts();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('relevés du démarrage : table par table, en rendant la main, jamais pendant une partie', () => {
  const frontend = frontendSource();
  for (const name of ['auditVrBackglass', 'auditPupPacks']) {
    const start = frontend.indexOf(`async function ${name}(): Promise<void> {`);
    assert.ok(start >= 0, `${name} est asynchrone`);
    const body = frontend.slice(start, frontend.indexOf('\n}\n', start));
    assert.match(body, /for \(const table of [^\n]+\) \{\n\s+await auditTurn\(\);/, `${name} : auditTurn() avant chaque table`);
  }
  const turn = frontend.slice(frontend.indexOf('async function auditTurn()'));
  assert.match(turn.slice(0, 400), /setImmediate/);
  assert.match(turn.slice(0, 400), /while \(auditWaits\(\)\)/);
  const waits = frontend.slice(frontend.indexOf('function auditWaits()'), frontend.indexOf('function auditWaits()') + 200);
  for (const phase of ['intro', 'loading', 'playing']) assert.ok(waits.includes(`'${phase}'`), `attend pendant « ${phase} »`);
  assert.match(frontend, /await auditVrBackglass\(\);\s*\n\s*await auditPupPacks\(\);/);
});
