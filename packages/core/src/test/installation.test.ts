// Reprise d'une table d'une installation existante (PinUP Popper, PinballX) : le 05/11/2026,
// une table choisie dans le dossier Tables d'une installation de Popper est arrivée sans son
// PuP-Pack, rangé dans PinUPSystem\PUPVideos ; et « Parties du jeu » ne laissait choisir qu'un
// fichier, jamais le dossier du pack. Ici : chaque partie rangée ailleurs suit sa table (PuP-Pack,
// ROM, couleurs, sons, dossier DMD, fronton, médias), et le dossier d'une partie se choisit,
// réduit à celui de la table quand il en contient plusieurs.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import {
  alreadyInstalled,
  findInstallation,
  installationCompanions,
  knownTableInstallations,
  listInstallationTables,
  partFolderPick,
  type CompanionFacts,
} from '../installation';
import { buildZip } from '../romzip';
import { classifyDir } from '../tablefiles';
import { planImport } from '../tableimport';

const MATRIX = 'The Matrix (Original 2023)';
const T2 = 'Terminator 2 (Williams 1991)';

function write(file: string, data: string | Buffer = 'x'): string {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
  return file;
}

/** Une installation de Popper comme celle de l'installateur habituel (C:\vPinball). */
function installation() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-installation-'));
  const vp = path.join(root, 'vPinball');
  const tables = path.join(vp, 'VisualPinball', 'Tables');
  const vpm = path.join(vp, 'VisualPinball', 'VPinMAME');
  const pup = path.join(vp, 'PinUPSystem', 'PUPVideos');
  const media = path.join(vp, 'PinUPSystem', 'POPMedia', 'Visual Pinball X');
  const matrix = write(path.join(tables, `${MATRIX}.vpx`));
  write(path.join(tables, `${MATRIX}.directb2s`));
  write(path.join(tables, 'MatrixDMD', 'font.fnt'));
  const t2 = write(path.join(tables, `${T2}.vpx`));
  write(path.join(tables, `${T2}.ini`));
  write(path.join(tables, 'Autre table.vpx'));
  const chip = write(path.join(root, 'chips', 't2_l8.rom'), Buffer.alloc(64, 7));
  write(path.join(vpm, 'roms', 't2_l8.zip'), buildZip([{ from: chip, name: 't2_l8.rom' }]));
  write(path.join(vpm, 'altcolor', 't2_l8', 't2_l8.cRZ'));
  write(path.join(vpm, 'altsound', 't2_l8', 'altsound.csv'));
  write(path.join(pup, 'TheMatrix', 'screens.pup'));
  write(path.join(pup, 'TheMatrix', 'Backglass', 'intro.mp4'), Buffer.alloc(32, 1));
  write(path.join(pup, 'AutrePack', 'screens.pup'));
  write(path.join(media, 'Wheel', `${MATRIX}.png`));
  write(path.join(media, 'Backglass', `${MATRIX}.mp4`), Buffer.alloc(32, 1));
  write(path.join(media, 'Wheel', 'Autre table.png'));
  // Cyber Pinball, sur le même disque : jamais pris pour une autre installation.
  const own = path.join(root, 'CyberPinball');
  write(path.join(own, 'tables', 'Une table', 'Une table.vpx'));
  fs.mkdirSync(path.join(own, 'PinUPSystem', 'PUPVideos'), { recursive: true });
  return { root, vp, tables, vpm, pup, media, matrix, t2, own };
}

const MATRIX_FACTS: CompanionFacts = { usesPinmame: false, roms: [], pup: { packNames: ['TheMatrix'], playlistAdd: false }, dmdFolder: 'MatrixDMD' };
const T2_FACTS: CompanionFacts = { usesPinmame: true, roms: ['t2_l8'] };

test('installation : reconnue depuis son dossier Tables, sa racine ou PinUPSystem ; jamais celle de Cyber Pinball', () => {
  const i = installation();
  for (const from of [i.tables, i.vp, path.join(i.vp, 'PinUPSystem')]) {
    const layout = findInstallation(from, [i.own]);
    assert.ok(layout, from);
    assert.equal(layout.tables, i.tables, from);
    assert.equal(layout.pinmame, i.vpm, from);
    assert.equal(layout.pupVideos, i.pup, from);
    assert.equal(layout.root, i.vp, from);
    assert.deepEqual(layout.mediaRoots, [path.join(i.vp, 'PinUPSystem', 'POPMedia')], from);
  }
  assert.equal(findInstallation(path.join(i.own, 'tables', 'Une table'), [i.own]), undefined, 'Cyber Pinball lui-même');
  assert.equal(findInstallation(path.join(i.root, 'chips'), [i.own]), undefined, 'un dossier quelconque');
  assert.deepEqual(knownTableInstallations([path.join(i.root, 'rien')], [i.own]), []);
});

test('installation : une table choisie seule emporte son PuP-Pack, son fronton, son dossier DMD et ses médias', () => {
  const i = installation();
  const facts = new Map([[i.matrix.toLowerCase(), MATRIX_FACTS]]);
  const { sources, reports } = installationCompanions([{ path: i.matrix, mode: 'copy' }], (v) => facts.get(v.toLowerCase()), [i.own]);
  const parts = reports[0]!.found.map((c) => `${c.part}:${path.basename(c.path)}`).sort();
  assert.deepEqual(parts, ['backglass:The Matrix (Original 2023).directb2s', 'dmdFolder:MatrixDMD', 'media:The Matrix (Original 2023).mp4', 'media:The Matrix (Original 2023).png', 'pup:TheMatrix']);
  assert.deepEqual(reports[0]!.missing, []);
  assert.ok(sources.every((s) => s.mode === 'copy' && s.owner === i.matrix), 'copiés, rattachés à la table');
  assert.ok(!sources.some((s) => s.path.includes('AutrePack') || s.path.includes('Autre table')), 'rien d’une autre table');

  const tablesDir = path.join(i.own, 'tables');
  const plan = planImport([{ path: i.matrix, mode: 'copy' }, ...sources], { tablesDir, scripts: facts as never });
  assert.equal(plan.tables.length, 1);
  const tp = plan.tables[0]!;
  const steps = tp.steps.map((s) => `${s.kind}:${path.relative(tp.folder, s.to)}`).sort();
  assert.ok(steps.includes(`pup:${path.join('pupvideos', 'TheMatrix')}`), steps.join('\n'));
  assert.ok(steps.includes(`backglass:${MATRIX}.directb2s`), steps.join('\n'));
  assert.ok(steps.includes('dmdFolder:MatrixDMD'), steps.join('\n'));
  assert.equal(tp.steps.filter((s) => s.kind === 'media').length, 2, steps.join('\n'));
  assert.deepEqual(plan.leftovers, []);
});

test('installation : la ROM, ses couleurs et ses sons viennent de VPinMAME ; ce qui manque est dit', () => {
  const i = installation();
  const facts = new Map<string, CompanionFacts>([
    [i.t2.toLowerCase(), T2_FACTS],
    [i.matrix.toLowerCase(), { ...MATRIX_FACTS, pup: { packNames: ['MatrixPup'], playlistAdd: false }, dmdFolder: 'Absent' }],
  ]);
  const { sources, reports } = installationCompanions([{ path: i.t2, mode: 'copy' }, { path: i.matrix, mode: 'copy' }], (v) => facts.get(v.toLowerCase()), [i.own]);
  const t2 = reports.find((r) => r.vpx === i.t2)!;
  assert.deepEqual(t2.found.map((c) => c.part).sort(), ['altcolor', 'altsound', 'rom', 'tableIni']);
  // Le pack que le script charge n'existe pas sous ce nom : celui au titre de la table est repris, le dossier DMD absent est dit.
  const matrix = reports.find((r) => r.vpx === i.matrix)!;
  assert.ok(matrix.found.some((c) => c.part === 'pup' && path.basename(c.path) === 'TheMatrix'));
  assert.deepEqual(matrix.missing, ['dossier DMD « Absent »']);

  const library = path.join(i.own, 'pinmame', 'roms');
  const plan = planImport([{ path: i.t2, mode: 'copy' }, { path: i.matrix, mode: 'copy' }, ...sources], { tablesDir: path.join(i.own, 'tables'), scripts: facts as never, romLibrary: library });
  const tp = plan.tables.find((t) => t.steps.some((s) => s.kind === 'table' && s.from === i.t2))!;
  const steps = tp.steps.map((s) => `${s.kind}:${path.relative(tp.folder, s.to)}`);
  assert.ok(steps.includes(`serum:${path.join('serum', 't2_l8')}`), steps.join('\n'));
  assert.ok(steps.includes(`altsound:${path.join('altsound', 't2_l8')}`), steps.join('\n'));
  assert.deepEqual(plan.roms.map((r) => r.name), ['t2_l8.zip']);
  assert.ok(plan.roms[0]!.links.some((l) => l.folder === tp.folder), 'la ROM liée dans la table');
  assert.deepEqual(plan.leftovers, []);
});

test('installation : une archive déballée, le dossier d’import ou un fichier hors installation ne reçoivent rien de plus', () => {
  const i = installation();
  const facts = () => MATRIX_FACTS;
  assert.deepEqual(installationCompanions([{ path: i.matrix, mode: 'move' }], facts, [i.own]).sources, []);
  assert.deepEqual(installationCompanions([{ path: i.tables, mode: 'copy', unpacked: true }], facts, [i.own]).sources, []);
  const lone = write(path.join(i.root, 'Téléchargements', `${MATRIX}.vpx`));
  assert.deepEqual(installationCompanions([{ path: lone, mode: 'copy' }], facts, [i.own]).sources, []);
  // Téléchargé à côté de l'installation, hors de son dossier Tables : il n'y prend rien.
  const near = write(path.join(i.vp, 'Téléchargements', `${MATRIX}.vpx`));
  assert.deepEqual(installationCompanions([{ path: near, mode: 'copy' }], facts, [i.own]).sources, []);
  // Un PuP-Pack apporté par l'import (celui du téléchargement) : jamais doublé par celui de l'installation.
  const ownPack = path.join(i.root, 'Téléchargements', 'MatrixPup');
  write(path.join(ownPack, 'screens.pup'));
  const mine = installationCompanions([{ path: i.matrix, mode: 'copy' }, { path: ownPack, mode: 'copy' }], facts, [i.own]);
  assert.ok(!mine.sources.some((s) => s.path.endsWith('TheMatrix')), 'pas le pack de l’installation');
  assert.ok(mine.sources.some((s) => s.path.endsWith('.directb2s')), 'le reste, si');
  // Déjà choisi avec la table : pas deux fois.
  const both = installationCompanions([{ path: i.matrix, mode: 'copy' }, { path: path.join(i.pup, 'TheMatrix'), mode: 'copy' }], facts, [i.own]);
  assert.ok(!both.sources.some((s) => s.path.endsWith('TheMatrix')));
});

test('installation : liste de ses tables, une à une, et celles déjà dans la borne', () => {
  const i = installation();
  const layout = findInstallation(i.tables, [i.own])!;
  const tables = listInstallationTables(layout);
  assert.deepEqual(tables.map((t) => t.title), ['Autre table', 'Terminator 2', 'The Matrix']);
  const matrix = tables.find((t) => t.title === 'The Matrix')!;
  assert.equal(matrix.backglass, true);
  assert.equal(matrix.medias, 2);
  assert.equal(alreadyInstalled(matrix, [{ title: 'The Matrix', files: ['x.vpx'] }]), true);
  assert.equal(alreadyInstalled(tables[1]!, [{ title: 'The Matrix', files: ['x.vpx'] }]), false);
});

test('parties du jeu : le dossier d’une partie se choisit, réduit à celui de la table s’il en contient plusieurs', () => {
  const i = installation();
  const matrix = { packs: ['TheMatrix'], roms: [], title: 'The Matrix' };
  assert.deepEqual(partFolderPick(i.pup, 'pup', matrix), { use: [path.join(i.pup, 'TheMatrix')] }, 'PUPVideos entier : le pack de la table');
  assert.deepEqual(partFolderPick(path.join(i.pup, 'TheMatrix'), 'pup', matrix), { use: [path.join(i.pup, 'TheMatrix')] }, 'le pack lui-même');
  assert.deepEqual(partFolderPick(i.pup, 'pup', { packs: [], roms: [], title: 'Inconnue' }), { choose: [path.join(i.pup, 'AutrePack'), path.join(i.pup, 'TheMatrix')] }, 'aucun nom : la liste');
  const t2 = { packs: ['t2_l8'], roms: ['t2_l8'], title: 'Terminator 2' };
  assert.deepEqual(partFolderPick(i.vpm, 'altsound', t2), { use: [path.join(i.vpm, 'altsound', 't2_l8')] }, 'VPinMAME entier : ses sons');
  assert.deepEqual(partFolderPick(path.join(i.vpm, 'altcolor'), 'altcolor', t2), { use: [path.join(i.vpm, 'altcolor', 't2_l8')] });
  assert.deepEqual(partFolderPick(i.vpm, 'rom', t2), { use: [path.join(i.vpm, 'roms', 't2_l8.zip')] });
  // Choisis seuls, ils gardent leur sorte : le dossier au-dessus le dit.
  assert.equal(classifyDir('t2_l8', path.join(i.vpm, 'altcolor', 't2_l8'), ['altcolor']), 'serum');
  assert.equal(classifyDir('t2_l8', path.join(i.vpm, 'altsound', 't2_l8'), ['altsound']), 'altsound');
});
