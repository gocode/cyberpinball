// Parties d'un jeu : chaque fichier reçu va dans la partie que dit son contenu, quel que
// soit l'élément qu'on attendait ; un fichier d'une autre nature ne bloque jamais ce qui est
// prêt ; ce qu'une version précédente a mal rangé se répare seul ; une partie s'ajoute à une
// table installée choisie (plan d'ajout ciblé) ; la fiche voit les parties présentes.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import {
  addToWaitList,
  attachFile,
  classifyContent,
  contentParts,
  coveredBy,
  markReceived,
  PART_KINDS,
  partFits,
  placeDownload,
  repairWaitList,
  routeReceived,
  waitListProblems,
  type ContentKind,
  type NeedKind,
  type WaitList,
} from '../acquisition';
import { GAME_PARTS, installedParts, partLabel } from '../gameparts';
import { GUEST_DOORS } from '../guestmode';
import { tableContents } from '../tablecontents';
import { planImport, type KnownTable } from '../tableimport';
import { createVpsDb, type VpsGame, type VpsTableFile } from '../vps';

const page = (n: number, slug: string) => `https://vpuniverse.com/files/file/${n}-${slug}/`;
const download = (n: number, slug: string, r: number) => `${page(n, slug)}?do=download&r=${r}&confirm=1&t=1&csrfKey=abc`;
const vpsFile = (id: string, n: number, slug: string, extra: Partial<VpsTableFile> = {}): VpsTableFile => ({ id, tableFormat: 'VPX', urls: [{ url: page(n, slug) }], ...extra });

// The Matrix, comme dans la base VPS : deux versions de la table sur deux fiches, la seconde
// (« PuP-Pack w/Table ») proposant aussi le PuP-Pack, en deux fichiers.
const MATRIX: VpsGame = {
  id: 'OUvOEgWRhf',
  name: 'The Matrix',
  manufacturer: 'Original',
  year: 2023,
  type: 'SS',
  tableFiles: [
    vpsFile('Z6TQHOOYU-', 13658, 'vp_cooks-the-matrix', { authors: ['VP_Cooks', 'JPSalas'], version: '1.0.0', updatedAt: 1000 }),
    // Comme dans la vraie base : cette version fournit le PuP-Pack (« incl. PuP »), sur la même fiche.
    vpsFile('r5a2h31Gz8', 18478, 'the-matrix-pup-pack-wtable', { authors: ['Enthusiast', 'VP_Cooks', 'JPSalas', 'MerlinRTP'], version: '1.0.14', updatedAt: 2000, features: ['incl. PuP'] }),
  ],
  pupPackFiles: [vpsFile('pupMatrix', 18478, 'the-matrix-pup-pack-wtable', { authors: ['Enthusiast'], version: '1.0.14' })],
  b2sFiles: [vpsFile('b2sMatrix', 22480, 'the-matrix-full-dmd', { authors: ['Fabouh'] })],
};
const vps = createVpsDb([MATRIX]);
const PAGE = 'the-matrix-pup-pack-wtable';
const PUP_ZIP = ['TheMatrix/screens.pup', 'TheMatrix/playlists.pup', 'TheMatrix/Backglass/intro.mp4', 'TheMatrix/3 Screen - FullDMD.bat'];

/** La liste d'attente quand on vient d'ouvrir la page de la version 1.0.14 dans « Récupérer ». */
function waiting(): WaitList {
  const l: WaitList = { items: [] };
  addToWaitList(l, MATRIX, { kind: 'table' }, MATRIX.tableFiles![1]!, page(18478, PAGE), new Date('2026-10-27T15:28:18Z'));
  return l;
}

test('deux fichiers sur la même page : la table dans « Table », le PuP-Pack dans sa propre partie, du premier coup', () => {
  const l = waiting();
  const table = l.items[0]!;
  // Le .vpx : la table attendue.
  const vpx = placeDownload(l, { filename: 'VP_Cooks- The Matrix_PuPevents-v1.0.14.vpx', urls: [download(18478, PAGE, 187406)], content: 'table' }, vps, table.id);
  routeReceived(l, vpx, { file: 'D:\\acq\\VP_Cooks- The Matrix_PuPevents-v1.0.14.vpx', via: 'window', content: 'table' });
  assert.equal(table.state, 'received');
  // Le zip du PuP-Pack, reçu alors que la fenêtre est toujours celle de la table.
  const content = classifyContent('TheMatrixPupPackv1.0.14.zip', PUP_ZIP);
  const zip = placeDownload(l, { filename: 'TheMatrixPupPackv1.0.14.zip', urls: [download(18478, PAGE, 187407)], content }, vps, table.id);
  assert.equal(zip.verdict, 'fits');
  const routed = routeReceived(l, zip, { file: 'D:\\acq\\TheMatrixPupPackv1.0.14.zip', via: 'window', content });
  assert.ok(routed?.created, 'la partie PuP-Pack est ajoutée au jeu');
  assert.equal(routed.item.kind, 'pup');
  assert.equal(routed.item.fileId, 'pupMatrix', 'le fichier VPS de la même page');
  assert.equal(routed.item.label, 'Enthusiast 1.0.0'.replace('1.0.0', '1.0.14'));
  assert.equal(routed.item.page, page(18478, PAGE), 'la page, pas l’adresse de téléchargement');
  assert.equal(table.received?.file, 'D:\\acq\\VP_Cooks- The Matrix_PuPevents-v1.0.14.vpx', 'la table garde son .vpx');
  // Rien à corriger : les deux parties s'installent ensemble.
  assert.deepEqual(waitListProblems(l, () => undefined, () => true), []);
  assert.deepEqual(l.items.filter((i) => i.state === 'received').map((i) => i.kind), ['table', 'pup']);
  assert.equal(l.strays, undefined, 'rien n’est gardé de côté');
});

test('chaque nature trouve sa partie, quel que soit l’élément pour lequel la fenêtre était ouverte', () => {
  const samples: Record<Exclude<NeedKind, 'table'>, { name: string; entries?: string[] }> = {
    b2s: { name: 'Matrix.directb2s' },
    rom: { name: 'matrix_l1.zip', entries: ['u6-l1.rom', 'u18-l1.rom'] },
    pup: { name: 'pup.zip', entries: PUP_ZIP },
    altsound: { name: 'alt.zip', entries: ['altsound/matrix/altsound.csv', 'altsound/matrix/1.ogg'] },
    altcolor: { name: 'serum.zip', entries: ['matrix/matrix.cRZ'] },
    music: { name: 'music.zip', entries: ['music/1.mp3', 'music/2.mp3'] },
    pov: { name: 'Matrix.pov' },
    topper: { name: 'Matrix topper.mp4' },
    media: { name: 'Matrix media pack.zip', entries: ['Wheel/Matrix.png', 'Backglass/Matrix.mp4'] },
  };
  for (const [kind, s] of Object.entries(samples) as [NeedKind, { name: string; entries?: string[] }][]) {
    const l = waiting();
    const content = classifyContent(s.name, s.entries);
    assert.equal(content, kind, `${s.name} est reconnu`);
    const routed = routeReceived(l, placeDownload(l, { filename: s.name, urls: [download(18478, PAGE, 1)], content }, vps, l.items[0]!.id), { file: `D:\\acq\\${s.name}`, via: 'window', content });
    assert.equal(routed?.item.kind, kind, `${s.name} va dans « ${kind} »`);
    assert.equal(l.items[0]!.state, 'waiting', 'la table reste attendue');
  }
  assert.deepEqual([...PART_KINDS].sort(), [...Object.keys(samples), 'table'].sort(), 'toutes les parties sont essayées');
});

test('une archive complète remplit plusieurs parties en une fois : celles qu’elle apporte ne sont plus attendues à part', () => {
  const l = waiting();
  addToWaitList(l, MATRIX, { kind: 'b2s' }, MATRIX.b2sFiles![0]!, page(22480, 'the-matrix-full-dmd'));
  const entries = ['The Matrix.vpx', 'The Matrix.directb2s', 'pupvideos/TheMatrix/screens.pup', 'pinmame/roms/matrix_l1.zip'];
  const parts = contentParts('The Matrix complet.zip', entries);
  assert.deepEqual(parts, ['table', 'b2s', 'rom', 'pup']);
  const routed = routeReceived(l, placeDownload(l, { filename: 'The Matrix complet.zip', urls: [download(18478, PAGE, 2)], content: 'table' }, vps, l.items[0]!.id), { file: 'D:\\acq\\The Matrix complet.zip', via: 'window', content: 'table', parts });
  assert.equal(routed?.item.kind, 'table');
  assert.deepEqual(routed.covered.map((c) => c.kind), ['b2s'], 'le fronton n’est plus attendu à part');
  assert.equal(coveredBy(l, MATRIX.id, 'b2s'), routed.item);
  assert.equal(partFits('pup', routed.item.received), 'yes');
});

test('un fichier d’une autre nature ne bloque jamais : ce qu’une version précédente a rangé de travers se répare seul', () => {
  const l = waiting();
  const table = l.items[0]!;
  // Comme sur la borne le 27/10/2026 : le PuP-Pack rangé dans « Table ».
  markReceived(table, 'D:\\acq\\TheMatrixPupPackv1.0.14.zip', 'window', new Date(), download(18478, PAGE, 187407), { content: 'pup' });
  assert.deepEqual(waitListProblems(l, () => undefined, () => true).map((p) => p.problem), ['mismatch']);
  const repairs = repairWaitList(l, { exists: () => true, vps });
  assert.deepEqual(repairs.map((r) => [r.repair, r.to.kind]), [['moved', 'pup']]);
  assert.equal(table.state, 'waiting', 'la table redevient attendue');
  assert.deepEqual(waitListProblems(l, () => undefined, () => true), [], 'plus rien à corriger');
  // Rattaché quand même, à la demande de l'utilisateur : ni réparé, ni bloquant.
  const forced = waiting();
  attachFile(forced, forced.items[0]!, { file: 'D:\\acq\\pack.zip', via: 'manual', content: 'pup', forced: true });
  assert.deepEqual(repairWaitList(forced, { exists: () => true }), []);
  assert.deepEqual(waitListProblems(forced, () => undefined, () => true), []);
});

test('la borne du 27/10/2026 : The Matrix se range sans manipulation', () => {
  // acquisition.json tel que l'ont laissé les retouches à la main : le .vpx de la page 18478
  // rattaché à la version 1.0.0 (installée), la 1.0.14 attendue, le PuP-Pack gardé de côté.
  const l: WaitList = { items: [] };
  const v100 = addToWaitList(l, MATRIX, { kind: 'table' }, MATRIX.tableFiles![0]!, page(13658, 'vp_cooks-the-matrix'), new Date('2026-10-27T15:27:29Z'));
  const v114 = addToWaitList(l, MATRIX, { kind: 'table' }, MATRIX.tableFiles![1]!, page(18478, PAGE), new Date('2026-10-27T15:28:18Z'));
  markReceived(v100, 'D:\\acq\\VP_Cooks- The Matrix_PuPevents-v1.0.14.vpx', 'window', new Date('2026-10-27T15:30:02Z'), download(18478, PAGE, 187406), { content: 'table' });
  v100.state = 'installed';
  l.strays = [{ file: 'D:\\acq\\TheMatrixPupPackv1.0.14.zip', via: 'window', url: download(18478, PAGE, 187407), content: 'pup', summary: '18 fichiers .pup', at: '2026-10-27T15:33:17Z' }];
  const table = 'D:\\tables\\The Matrix (Original 2023)\\VP_Cooks- The Matrix_PuPevents-v1.0.14.vpx';
  const repairs = repairWaitList(l, { exists: () => true, vps, tableOf: (id) => (id === MATRIX.id ? { file: table, has: (k) => k === 'table' || k === 'pup' } : undefined) });
  assert.deepEqual(
    repairs.map((r) => r.repair),
    ['swapped', 'claimed'],
  );
  assert.equal(v114.state, 'installed', 'la 1.0.14 est celle qui est installée');
  assert.equal(v114.received?.file, 'D:\\acq\\VP_Cooks- The Matrix_PuPevents-v1.0.14.vpx');
  assert.equal(v100.state, 'waiting');
  const pup = l.items.find((i) => i.kind === 'pup')!;
  assert.equal(pup.state, 'installed', 'le PuP-Pack est déjà dans pupvideos : rien à installer');
  assert.equal(pup.table, table);
  assert.equal(v114.kind, 'table');
  assert.equal(v114.received?.content, 'table', 'la table garde son .vpx, le PuP-Pack ne la remplace pas');
  assert.equal(l.strays?.length ?? 0, 0, 'plus rien de côté');
  assert.deepEqual(waitListProblems(l, () => undefined, () => true), []);
  // Une seconde fois : rien ne bouge.
  assert.deepEqual(repairWaitList(l, { exists: () => true, vps }), []);
});

test('ce qui est gardé de côté exprès, ou d’un jeu inconnu, n’est pas rangé d’office', () => {
  const l = waiting();
  l.strays = [
    { file: 'D:\\acq\\gardé.zip', via: 'window', url: download(18478, PAGE, 9), content: 'pup', at: '2026-10-27T15:00:00Z', kept: true },
    { file: 'D:\\acq\\inconnu.zip', via: 'watch', content: 'pup', at: '2026-10-27T15:00:00Z' },
    { file: 'D:\\acq\\illisible.rar', via: 'window', url: download(18478, PAGE, 10), content: 'unknown', at: '2026-10-27T15:00:00Z' },
  ];
  assert.deepEqual(repairWaitList(l, { exists: () => true }), []);
  assert.equal(l.strays.length, 3);
});

test('plan d’ajout ciblé : tout revient à la table choisie, même un pack qui ne dit pas son jeu', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-parties-'));
  const tablesDir = path.join(root, 'tables');
  const folder = path.join(tablesDir, 'The Matrix (Original 2023)');
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, 'The Matrix.vpx'), 'x');
  const other = path.join(tablesDir, 'Star Trek (Stern 2013)');
  fs.mkdirSync(other, { recursive: true });
  fs.writeFileSync(path.join(other, 'Star Trek.vpx'), 'x');
  // Un PuP-Pack déballé, nommé de travers, et un .vpx (une autre version).
  const src = path.join(root, 'import', 'pack');
  fs.mkdirSync(path.join(src, 'Pack123'), { recursive: true });
  fs.writeFileSync(path.join(src, 'Pack123', 'screens.pup'), 'x');
  fs.writeFileSync(path.join(src, 'Pack123', 'intro.mp4'), 'x');
  fs.writeFileSync(path.join(src, 'Matrix v2.vpx'), 'x');
  const existing: KnownTable[] = [
    { folder, title: 'The Matrix', roms: [] },
    { folder: other, title: 'Star Trek', roms: [] },
  ];
  const sources = [{ path: src, mode: 'copy' as const, unpacked: true, label: 'pack.zip' }];
  const untargeted = planImport(sources, { tablesDir, existing });
  assert.ok(untargeted.tables.some((t) => t.isNew), 'sans cible : une nouvelle table');
  const plan = planImport(sources, { tablesDir, existing, target: folder });
  assert.deepEqual(plan.tables.map((t) => t.folder), [folder], 'tout va dans la table choisie');
  const steps = plan.tables[0]!.steps;
  assert.ok(steps.some((s) => s.kind === 'pup' && s.to.startsWith(path.join(folder, 'pupvideos'))), 'le PuP-Pack dans pupvideos de la table');
  assert.ok(steps.some((s) => s.kind === 'table' && path.dirname(s.to) === folder), 'le .vpx comme une version de la table');
  assert.deepEqual(plan.leftovers, []);
});

test('fiche : les parties présentes dans le dossier d’une table, et la porte fermée à l’invité', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-fiche-'));
  const folder = path.join(root, 'The Matrix (Original 2023)');
  fs.mkdirSync(path.join(folder, 'pupvideos', 'TheMatrix'), { recursive: true });
  fs.writeFileSync(path.join(folder, 'pupvideos', 'TheMatrix', 'screens.pup'), 'x');
  fs.writeFileSync(path.join(folder, 'The Matrix.vpx'), 'x');
  fs.writeFileSync(path.join(folder, 'The Matrix.directb2s'), 'x');
  fs.writeFileSync(path.join(folder, 'The Matrix.ini'), 'x');
  const parts = installedParts(tableContents(path.join(folder, 'The Matrix.vpx'), { ownFolder: true }));
  assert.deepEqual(
    GAME_PARTS.filter((p) => parts.has(p)),
    ['table', 'b2s', 'pup', 'ini'],
  );
  assert.equal(parts.get('pup')!.entries[0]!.rel, path.join('pupvideos', 'TheMatrix'));
  for (const p of GAME_PARTS) assert.ok(partLabel(p).length > 2, `libellé de ${p}`);
  assert.equal(GUEST_DOORS['sheet.parts'], false);
});

test('contenus : partFits accepte une partie apportée avec d’autres, pas une autre nature', () => {
  const seen = (content: ContentKind, parts?: NeedKind[]) => ({ content, parts });
  assert.equal(partFits('pup', seen('table', ['table', 'pup'])), 'yes');
  assert.equal(partFits('pup', seen('table')), 'no');
  assert.equal(partFits('pup', seen('unknown')), 'unknown');
  assert.deepEqual(contentParts('x.rar'), [], 'illisible : aucune partie');
});
