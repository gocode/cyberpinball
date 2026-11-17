// La ROM d'une table récupérée chez un ami, retour du 17/11/2026 à la borne : Monster Bash, reçue
// de la borne d'un ami, arrivait sans sa ROM (« ROM mb_106b : à faire »). Chez l'ami, la ROM était
// dans la bibliothèque commune (<racine>\pinmame\roms), sans lien dans le dossier de la table : le
// dossier commun de PinMAME la trouvait, la table jouait, mais l'inventaire de la table ne la
// listait pas et sa borne ne la proposait jamais.
//
// L'invariant, pour toute façon dont une table trouve sa ROM chez l'ami (dans son dossier, dans la
// bibliothèque commune, sous un alias de pinmame\alias.txt) : si la table joue chez lui, elle joue
// chez moi après réception de toutes ses parties et le plan d'ajout. Le transport est simulé (les
// fichiers annoncés copiés sous leur chemin relatif, comme friend-content.ts les range).

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { romBlockers } from '../doctor';
import { attestedTableFiles, shareableTableFiles } from '../friendlibrary';
import { layoutOf } from '../locations';
import { applyImport, applyRomImport, planImport } from '../tableimport';
import { tableContents } from '../tablecontents';

const NAME = 'Monster Bash (Williams 1998)';
const VPX = `${NAME}_Bigus(MOD)2.0.vpx`;

function write(file: string, content = 'x'): string {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
}

function borne(label: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `cyberpinball-rom-ami-${label}-`));
  const layout = layoutOf(root);
  fs.mkdirSync(layout.tables, { recursive: true });
  fs.mkdirSync(layout.roms, { recursive: true });
  return { root, layout };
}

/** La table chez l'ami, sa ROM rangée selon `ranger`. */
function tableChezLAmi(ranger: (folder: string, library: string) => void) {
  const ami = borne('ami');
  const folder = path.join(ami.layout.tables, NAME);
  write(path.join(folder, VPX), 'vpx');
  write(path.join(folder, 'vni', 'mb_106b', 'MB_1.2.pac'), 'pac');
  ranger(folder, ami.layout.roms);
  return { ami, folder };
}

/** Toutes ses parties reçues (ROM attestée), puis le plan d'ajout chez moi : le dossier de la table installée. */
function recevoirEtInstaller(folder: string, library: string, wanted: string[]): { installed: string; myLibrary: string; rels: string[]; done: () => void } {
  const moi = borne('moi');
  const contents = tableContents(path.join(folder, VPX), { ownFolder: true, romLibrary: library, script: { usesPinmame: true, roms: wanted } });
  const all = shareableTableFiles(contents, folder);
  const asked = new Set(attestedTableFiles(all.map((f) => ({ ...f, id: f.rel })), new Set(['rom', 'pup'])).map((f) => f.rel));
  const files = all.filter((f) => asked.has(f.rel));
  const received = path.join(moi.root, 'data', 'amis', 'tables', 'essai', NAME);
  for (const f of files) {
    const dest = path.join(received, ...f.rel.split('/'));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(f.file, dest);
  }
  const vpx = path.join(received, VPX);
  const plan = planImport([{ path: received, mode: 'move' }], {
    tablesDir: moi.layout.tables,
    scripts: new Map([[vpx.toLowerCase(), { usesPinmame: true, roms: wanted }]]),
    romLibrary: moi.layout.roms,
  });
  const ctx = { trashDir: path.join(moi.layout.trash, 'essai'), cleanupRoots: [path.dirname(received)] };
  for (const t of plan.tables) applyImport(t, ctx);
  for (const r of plan.roms) applyRomImport(r, ctx);
  const installed = plan.tables.find((t) => t.isNew)!.folder;
  return { installed, myLibrary: moi.layout.roms, rels: files.map((f) => f.rel), done: () => fs.rmSync(moi.root, { recursive: true, force: true }) };
}

const RANGEMENTS: { what: string; wanted: string[]; ranger: (folder: string, library: string) => void }[] = [
  {
    what: 'liée dans le dossier de la table',
    wanted: ['mb_106b'],
    ranger: (folder, library) => {
      write(path.join(library, 'mb_106b.zip'), 'ROM mb_106b');
      fs.mkdirSync(path.join(folder, 'pinmame', 'roms'), { recursive: true });
      fs.linkSync(path.join(library, 'mb_106b.zip'), path.join(folder, 'pinmame', 'roms', 'mb_106b.zip'));
    },
  },
  {
    what: 'dans la bibliothèque commune seulement (le cas de la borne, 17/11/2026)',
    wanted: ['mb_106b'],
    ranger: (_folder, library) => void write(path.join(library, 'mb_106b.zip'), 'ROM mb_106b'),
  },
  {
    what: 'propre à la table, chargée sous un alias de pinmame\\alias.txt',
    wanted: ['mb_106b'],
    ranger: (folder) => {
      write(path.join(folder, 'pinmame', 'roms', 'mb_106.zip'), 'ROM mb_106');
      write(path.join(folder, 'pinmame', 'alias.txt'), 'mb_106b,mb_106\r\n');
    },
  },
  {
    what: 'liée, chargée sous un alias, la ROM demandée absente',
    wanted: ['mb_106b', 'mb_106'],
    ranger: (folder, library) => {
      write(path.join(library, 'mb_106.zip'), 'ROM mb_106');
      fs.mkdirSync(path.join(folder, 'pinmame', 'roms'), { recursive: true });
      fs.linkSync(path.join(library, 'mb_106.zip'), path.join(folder, 'pinmame', 'roms', 'mb_106.zip'));
      write(path.join(folder, 'pinmame', 'alias.txt'), 'mb_106b,mb_106\r\n');
    },
  },
];

for (const r of RANGEMENTS) {
  test(`ROM ${r.what} : la table jouable chez l'ami l'est chez moi après réception`, () => {
    const { ami, folder } = tableChezLAmi(r.ranger);
    assert.deepEqual(romBlockers(folder, r.wanted, ami.layout.roms), [], 'la table joue chez l’ami');
    const got = recevoirEtInstaller(folder, ami.layout.roms, r.wanted);
    assert.ok(got.rels.some((rel) => rel.startsWith('pinmame/roms/')), `la ROM part avec la table (${got.rels.join(', ')})`);
    assert.deepEqual(
      romBlockers(got.installed, r.wanted, got.myLibrary).map((f) => f.title),
      [],
      `la table reçue joue chez moi (fichiers reçus : ${got.rels.join(', ')})`,
    );
    got.done();
    fs.rmSync(ami.root, { recursive: true, force: true });
  });
}

test('les alias de la table suivent sa ROM, jamais sans elle', () => {
  const { ami, folder } = tableChezLAmi((f) => {
    write(path.join(f, 'pinmame', 'roms', 'mb_106.zip'), 'ROM mb_106');
    write(path.join(f, 'pinmame', 'alias.txt'), 'mb_106b,mb_106\r\n');
  });
  const contents = tableContents(path.join(folder, VPX), { ownFolder: true, romLibrary: ami.layout.roms, script: { usesPinmame: true, roms: ['mb_106b'] } });
  const files = shareableTableFiles(contents, folder);
  assert.equal(files.find((f) => f.rel === 'pinmame/alias.txt')?.part, 'rom', 'alias.txt fait partie de la ROM');
  // ROM non attestée : ni la ROM, ni ses alias.
  const sans = attestedTableFiles(files.map((f) => ({ ...f, id: f.rel })), new Set());
  assert.ok(!sans.some((f) => f.rel.startsWith('pinmame/')), sans.map((f) => f.rel).join(', '));
  // Pas de ROM du tout chez l'ami : pas d'alias seul.
  fs.rmSync(path.join(folder, 'pinmame', 'roms', 'mb_106.zip'));
  const sansRom = shareableTableFiles(tableContents(path.join(folder, VPX), { ownFolder: true, romLibrary: ami.layout.roms, script: { usesPinmame: true, roms: ['mb_106b'] } }), folder);
  assert.ok(!sansRom.some((f) => f.rel === 'pinmame/alias.txt'), sansRom.map((f) => f.rel).join(', '));
  fs.rmSync(ami.root, { recursive: true, force: true });
});

test('la ROM de la bibliothèque n’est pas une entrée du dossier : la fiche « Fichiers » ne la montre pas absente', () => {
  const { ami, folder } = tableChezLAmi((_f, library) => void write(path.join(library, 'mb_106b.zip'), 'ROM mb_106b'));
  const contents = tableContents(path.join(folder, VPX), { ownFolder: true, romLibrary: ami.layout.roms, script: { usesPinmame: true, roms: ['mb_106b'] } });
  assert.ok(!contents.entries.some((e) => e.kind === 'rom'), 'aucune entrée de ROM, ni présente ni absente');
  assert.deepEqual(contents.libraryRoms, [{ rel: path.join('pinmame', 'roms', 'mb_106b.zip'), file: path.join(ami.layout.roms, 'mb_106b.zip') }]);
  fs.rmSync(ami.root, { recursive: true, force: true });
});
