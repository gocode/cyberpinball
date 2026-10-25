// Fichiers d'une table, un par un (section « Fichiers » de la fiche) : sorte, dossier,
// taille, état ; lien vers la bibliothèque de ROM ; attendus absents ; tout le dossier,
// même quand il y a beaucoup de fichiers.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { tableContents } from '../tablecontents';

function put(file: string, data = 'x'): string {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
  return file;
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-fichiers-'));
  const library = path.join(root, 'pinmame', 'roms');
  const folder = path.join(root, 'tables', 'Terminator 2 (Williams 1991)');
  const table = put(path.join(folder, 'Terminator 2 (Williams 1991) VPW 2.1.vpx'), 'vpx'.repeat(100));
  put(path.join(folder, 'Terminator 2 (Williams 1991) VPW 2.0.vpx'));
  put(path.join(folder, 'Terminator 2 (Williams 1991) VPW 2.1.directb2s'));
  put(path.join(folder, 'T2 3screens.directb2s'));
  put(path.join(folder, 'Terminator 2 (Williams 1991) VPW 2.1.ini'));
  put(path.join(folder, 'Terminator 2 (Williams 1991) VPW 2.1.vbs'));
  put(path.join(folder, 'crash.txt'));
  put(path.join(folder, 'Thumbs.db'));
  put(path.join(library, 't2_l8.zip'), 'rom');
  fs.mkdirSync(path.join(folder, 'pinmame', 'roms'), { recursive: true });
  fs.linkSync(path.join(library, 't2_l8.zip'), path.join(folder, 'pinmame', 'roms', 't2_l8.zip'));
  put(path.join(library, 't2_l6.zip'), 'rom6');
  put(path.join(folder, 'pinmame', 'roms', 't2_l6.zip'), 'rom6');
  put(path.join(folder, 'pinmame', 'roms', 't2_l4.zip'), 'rom4');
  put(path.join(folder, 'pinmame', 'nvram', 't2_l8.nv'));
  put(path.join(folder, 'pinmame', 'cfg', 't2_l8.cfg'));
  put(path.join(folder, 'pupvideos', 't2', 'screens.pup'));
  put(path.join(folder, 'pupvideos', 't2', 'Backglass', 'intro.mp4'), 'video'.repeat(10));
  put(path.join(folder, 'serum', 't2_l8', 't2_l8.cRZ'));
  for (let i = 1; i <= 31; i++) put(path.join(folder, 'music', `Piste ${i} - un titre assez long pour passer à la ligne.mp3`));
  put(path.join(folder, 'medias', 'Wheel.png'));
  put(path.join(folder, 'medias', 'Backglass.mp4'));
  return { root, library, folder, table };
}

test('fichiers de la table : chaque fichier avec sa sorte, son dossier, sa taille et son état', () => {
  const { library, folder, table } = fixture();
  const c = tableContents(table, { ownFolder: true, romLibrary: library, script: { usesPinmame: true, roms: ['t2_l8'] } });
  const by = (rel: string) => c.entries.find((e) => e.rel === rel)!;
  // Ordre : la table, ses frontons, ses ROM, puis le reste.
  assert.deepEqual([...new Set(c.entries.map((e) => e.kind))].slice(0, 4), ['table', 'backglass', 'rom', 'nvram']);
  assert.equal(c.entries[0]!.name, 'Terminator 2 (Williams 1991) VPW 2.1.vpx', 'cette table d’abord');
  assert.equal(c.entries[0]!.size, 300);
  assert.equal(by('Terminator 2 (Williams 1991) VPW 2.0.vpx').note, 'autre version du dossier');
  assert.equal(by('Terminator 2 (Williams 1991) VPW 2.1.directb2s').state, 'ok');
  assert.equal(by('T2 3screens.directb2s').state, 'warning', 'mal nommé : VPX ne le charge pas');
  // ROM : lien vers la bibliothèque, copie à part, propre à la table.
  const l8 = by(path.join('pinmame', 'roms', 't2_l8.zip'));
  assert.equal(l8.library, path.join(library, 't2_l8.zip'));
  assert.match(l8.note, /^lien vers la bibliothèque de ROM · demandée par le script$/);
  assert.equal(by(path.join('pinmame', 'roms', 't2_l6.zip')).state, 'info');
  assert.match(by(path.join('pinmame', 'roms', 't2_l4.zip')).note, /propre à la table/);
  // Dossiers rangés d'un bloc : une entrée, avec leur nombre de fichiers.
  const pup = by(path.join('pupvideos', 't2'));
  assert.deepEqual([pup.kind, pup.dir, pup.files, pup.size], ['pup', true, 2, 51]);
  assert.equal(by('medias').files, 2);
  assert.equal(by(path.join('pinmame', 'cfg')).kind, 'pinmame');
  // La musique, fichier par fichier : 31 entrées, rien n'est tronqué.
  assert.equal(c.entries.filter((e) => e.kind === 'music').length, 31);
  // Script de remplacement, rapport de plantage : à vérifier ; Thumbs.db : ignoré.
  assert.equal(by('Terminator 2 (Williams 1991) VPW 2.1.vbs').kind, 'scriptOverride');
  assert.equal(by('crash.txt').state, 'warning');
  assert.equal(c.entries.some((e) => e.name === 'Thumbs.db'), false);
  assert.equal(c.problems, 3);
  assert.equal(c.files, c.entries.reduce((n, e) => n + (e.dir ? e.files! : 1), 0));
  assert.ok(c.entries.length > 40, 'beaucoup de fichiers : tous listés');
  assert.ok(c.entries.every((e) => e.path === path.join(folder, e.rel)));
});

test('fichiers de la table : ROM et dossier DMD attendus par le script mais absents (le DMD, facultatif)', () => {
  const { folder, table } = fixture();
  fs.rmSync(path.join(folder, 'pinmame'), { recursive: true });
  const c = tableContents(table, { ownFolder: true, script: { usesPinmame: true, roms: ['t2_l8', 't2_l6'], dmdFolder: 'T2DMD' } });
  const missing = c.entries.filter((e) => e.missing);
  assert.deepEqual(missing.map((e) => [e.kind, e.rel, e.state]), [
    ['rom', path.join('pinmame', 'roms', 't2_l8.zip'), 'error'],
    ['dmdFolder', 'T2DMD', 'warning'],
  ]);
  assert.equal(c.entries.find((e) => e.kind === 'rom'), missing[0], 'la ROM absente en tête de ses semblables');
});

test('fichiers de la table : ROM trouvée par le dossier commun de PinMAME, pas « absente » (playable.ts)', () => {
  const { folder, table } = fixture();
  fs.rmSync(path.join(folder, 'pinmame'), { recursive: true });
  const library = path.join(path.dirname(path.dirname(folder)), 'pinmame', 'roms');
  const c = tableContents(table, { ownFolder: true, romLibrary: library, script: { usesPinmame: true, roms: ['t2_l8'] } });
  assert.deepEqual(c.entries.filter((e) => e.missing), []);
});

test('fichiers de la table : dans le dossier commun, seuls ses fichiers compagnons', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-fichiers-'));
  const table = put(path.join(root, 'Cosmic.vpx'));
  put(path.join(root, 'Cosmic.directb2s'));
  put(path.join(root, 'Autre.vpx'));
  put(path.join(root, 'Autre.directb2s'));
  fs.mkdirSync(path.join(root, 'pupvideos', 'autre'), { recursive: true });
  const c = tableContents(table, { ownFolder: false });
  assert.deepEqual(c.entries.map((e) => e.name), ['Cosmic.vpx', 'Cosmic.directb2s']);
});
