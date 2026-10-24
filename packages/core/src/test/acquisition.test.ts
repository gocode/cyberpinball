// Acquisition des tables (docs/recherche/acquisition.md, A3 à A7) : hôtes et fiches des
// liens, catalogue, version conseillée, ce qu'il faut pour une borne, liste d'attente,
// rattachement d'un téléchargement, provenance et mises à jour.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import {
  addToWaitList,
  cabinetScreens,
  catalog,
  compareVersions,
  installedGames,
  isPartialDownload,
  linkHost,
  loadWaitList,
  markReceived,
  matchDownload,
  pageKey,
  playableWithoutRom,
  recommendVersion,
  requirements,
  saveWaitList,
  setTableSource,
  tableSourceOf,
  tableUpdate,
  type CabinetScreens,
  type WaitList,
} from '../acquisition';
import { createVpsDb, type VpsGame, type VpsTableFile } from '../vps';

const vpu = (n: number, slug = 'fichier') => ({ url: `https://vpuniverse.com/files/file/${n}-${slug}/` });
const vpf = (n: number) => ({ url: `https://www.vpforums.org/index.php?app=downloads&showfile=${n}` });
const file = (id: string, extra: Partial<VpsTableFile> = {}): VpsTableFile => ({ id, tableFormat: 'VPX', urls: [vpu(Number(id.replace(/\D/g, '')) || 1)], ...extra });

const T2: VpsGame = {
  id: 'BunvWvh9',
  name: 'Terminator 2 - Judgment Day',
  manufacturer: 'Williams',
  year: 1991,
  type: 'SS',
  romFiles: [{ id: 'r1', version: 't2_l8', urls: [vpf(7318)] }],
  tableFiles: [
    file('t100', { authors: ['Bigus1', 'Hanibal'], version: '3.0', features: ['MOD'], updatedAt: 3000 }),
    file('t200', { authors: ['G5k', 'VPW'], version: '1.25', features: ['nFozzy', 'Fleep'], updatedAt: 2000 }),
    file('t300', { authors: ['Sixtoe'], version: '1.0', updatedAt: 1000, urls: [{ url: 'https://vpuniverse.com/files/file/300-x/', broken: true }] }),
    { id: 'fx', tableFormat: 'FX3', urls: [vpu(9)] },
  ],
  b2sFiles: [
    file('b1', { authors: ['Old'], features: ['2Screens'], updatedAt: 500 }),
    file('b2', { authors: ['HauntFreaks'], features: ['3Screens', 'FullDMD'], updatedAt: 100 }),
  ],
  pupPackFiles: [file('p1', { authors: ['LTek'], version: '3.0' })],
  altColorFiles: [file('c1', { authors: ['Malenko'] })],
  topperFiles: [file('top1')],
};
const EM: VpsGame = { id: 'em1', name: 'Fireball', manufacturer: 'Bally', year: 1972, type: 'EM', tableFiles: [file('e1', { authors: ['JPSalas'], version: '6.0', updatedAt: 10 })] };
const ORIGINAL: VpsGame = {
  id: 'orig', name: 'Mon Original', manufacturer: 'Original', year: 2024, type: 'SS',
  tableFiles: [file('o1', { authors: ['Moi'], version: '1.0', features: ['no ROM', 'incl. B2S', 'VR'], updatedAt: 5000 })],
};
const ZEN: VpsGame = { id: 'zen', name: 'Zen Seul', manufacturer: 'Zen Studios', tableFiles: [{ id: 'z', tableFormat: 'FX3' }] };
const db = createVpsDb([T2, EM, ORIGINAL, ZEN]);

test('liens : hôte, compte nécessaire, et clé de la fiche quelle que soit la forme de l’adresse', () => {
  assert.deepEqual(linkHost('https://vpuniverse.com/files/file/21723-t2/'), { id: 'vpuniverse', label: 'vpuniverse.com', account: true });
  assert.equal(linkHost('https://www.vpforums.org/index.php?showfile=1').account, true);
  assert.equal(linkHost('https://www.dropbox.com/s/x/a.mp3?dl=0').id, 'dropbox');
  assert.equal(linkHost('https://bit.ly/POVs').label, 'bit.ly');
  assert.equal(pageKey('https://vpuniverse.com/files/file/21723-terminator-2-altsound/'), 'vpu:21723');
  assert.equal(pageKey('https://vpuniverse.com/files/file/21723-terminator-2-altsound/?do=download&csrfKey=x'), 'vpu:21723');
  assert.equal(pageKey('https://www.vpforums.org/index.php?app=downloads&showfile=7318'), 'vpf:7318');
  assert.equal(pageKey('https://pinballnirvana.com/forums/resources/cheech-chong.4321/download'), 'pn:4321');
  assert.equal(pageKey('https://mega.nz/file/abc'), undefined);
  assert.equal(pageKey('pas une adresse'), undefined);
});

test('catalogue : jeux jouables en VPX, filtres par sorte et par état, tri par titre ou nouveautés', () => {
  const none = new Set<string>();
  assert.deepEqual(catalog(db, {}, none).map((g) => g.id), ['em1', 'orig', 'BunvWvh9'], 'par titre ; le jeu seulement chez Zen est écarté');
  assert.deepEqual(catalog(db, { kind: 'norom' }, none).map((g) => g.id), ['em1', 'orig']);
  assert.deepEqual(catalog(db, { kind: 'ss' }, none).map((g) => g.id), ['orig', 'BunvWvh9']);
  assert.deepEqual(catalog(db, { kind: 'em' }, none).map((g) => g.id), ['em1']);
  assert.deepEqual(catalog(db, { kind: 'original' }, none).map((g) => g.id), ['orig']);
  assert.deepEqual(catalog(db, { state: 'installed' }, new Set(['BunvWvh9'])).map((g) => g.id), ['BunvWvh9']);
  assert.deepEqual(catalog(db, { state: 'missing' }, new Set(['BunvWvh9'])).map((g) => g.id), ['em1', 'orig']);
  assert.deepEqual(catalog(db, { sort: 'recent' }, none).map((g) => g.id), ['orig', 'BunvWvh9', 'em1']);
  assert.deepEqual(catalog(db, { vr: true }, none).map((g) => g.id), ['orig']);
  assert.deepEqual(catalog(db, { pup: true }, none).map((g) => g.id), ['BunvWvh9']);
  assert.equal(catalog(db, { text: 'terminator' }, none)[0]!.id, 'BunvWvh9');
  assert.equal(playableWithoutRom(T2), false);
  assert.equal(playableWithoutRom(EM), true);
});

test('version conseillée : pas un MOD, VPW de préférence, avec un lien vivant ; raisons en clair', () => {
  const advice = recommendVersion(T2)!;
  assert.equal(advice.file.id, 't200');
  assert.ok(advice.reasons.includes('table de VPW (VPin Workshop), refaite à fond'));
  assert.ok(advice.reasons.includes('version d’origine, pas un MOD'));
  // Sans aucun lien vivant : rien à conseiller.
  assert.equal(recommendVersion({ ...EM, tableFiles: [file('e2', { urls: [{ url: 'https://x.org/', broken: true }] })] }), undefined);
});

test('ce qu’il faut : table, fronton adapté aux écrans, ROM absente ou déjà là, compléments facultatifs', () => {
  const screens: CabinetScreens = { backglass: true, dmd: 'full', topper: false };
  const needs = requirements(T2, T2.tableFiles![1]!, { screens, roms: new Set() });
  const by = Object.fromEntries(needs.map((n) => [n.kind, n]));
  assert.deepEqual(needs.map((n) => n.kind), ['table', 'b2s', 'rom', 'pup', 'altcolor']);
  assert.equal(by.table!.state, 'todo');
  assert.equal(by.b2s!.files[0]!.id, 'b2', 'le fronton 3 écrans avec afficheur large passe avant le plus récent');
  assert.equal(by.rom!.state, 'todo');
  assert.equal(by.rom!.required, true);
  assert.deepEqual(by.rom!.roms, ['t2_l8']);
  assert.equal(by.pup!.state, 'optional');
  // ROM dans la bibliothèque, borne sans fronton ni afficheur, avec topper.
  const other = requirements(T2, T2.tableFiles![1]!, { screens: { backglass: false, dmd: 'none', topper: true }, roms: new Set(['t2_l8']), installed: true });
  const o = Object.fromEntries(other.map((n) => [n.kind, n]));
  assert.equal(o.table!.state, 'have');
  assert.equal(o.b2s!.state, 'useless');
  assert.equal(o.rom!.state, 'have');
  assert.equal(o.altcolor, undefined, 'pas d’afficheur : pas de couleurs du DMD');
  assert.equal(o.topper!.state, 'optional');
  // Jeu original sans ROM, fronton fourni.
  const orig = requirements(ORIGINAL, ORIGINAL.tableFiles![0]!, { screens, roms: new Set() });
  assert.deepEqual(orig.map((n) => `${n.kind}:${n.state}`), ['table:todo', 'b2s:included']);
  // Version sans lien vivant.
  assert.equal(requirements(T2, T2.tableFiles![2]!, { screens, roms: new Set() })[0]!.state, 'unavailable');
});

test('écrans de la borne : fronton, afficheur étroit ou large, topper', () => {
  assert.deepEqual(cabinetScreens(undefined), { backglass: true, dmd: 'full', topper: false });
});

function list(): WaitList {
  const l: WaitList = { items: [] };
  const needs = requirements(T2, T2.tableFiles![1]!, { screens: { backglass: true, dmd: 'full', topper: false }, roms: new Set() });
  const need = (k: string) => needs.find((n) => n.kind === k)!;
  addToWaitList(l, T2, need('table'), T2.tableFiles![1]!, vpu(200, 't2-vpw').url, new Date('2026-10-22T10:00:00Z'));
  addToWaitList(l, T2, need('b2s'), T2.b2sFiles![1]!, vpu(2, 'b2s').url);
  addToWaitList(l, T2, need('rom'), need('rom').files[0]!, vpf(7318).url);
  addToWaitList(l, T2, need('pup'), T2.pupPackFiles![0]!, vpu(1, 'pup').url);
  return l;
}

test('liste d’attente : ajout sans doublon, gardée dans les données, relue telle quelle', () => {
  const l = list();
  assert.equal(l.items.length, 4);
  assert.deepEqual(l.items.map((i) => `${i.kind}:${i.label}:${i.pageKey}`), ['table:G5k, VPW 1.25:vpu:200', 'b2s:HauntFreaks:vpu:2', 'rom:t2_l8:vpf:7318', 'pup:LTek 3.0:vpu:1']);
  assert.equal(l.items[0]!.gameLabel, 'Terminator 2 - Judgment Day (Williams 1991)');
  // Le même fichier une deuxième fois : le même élément.
  const again = addToWaitList(l, T2, { kind: 'table', required: true, state: 'todo', detail: '', files: [] }, T2.tableFiles![1]!, vpu(200).url);
  assert.equal(again, l.items[0]);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-attente-'));
  l.watchDownloads = true;
  l.noticeAcceptedAt = '2026-10-22T10:00:00.000Z';
  saveWaitList(dir, l);
  assert.deepEqual(loadWaitList(dir), JSON.parse(JSON.stringify(l)));
  assert.deepEqual(loadWaitList(path.join(dir, 'absent')), { items: [] });
});

test('téléchargement reçu : par la fiche traversée, par le nom de la ROM, par l’extension, par le nom du jeu', () => {
  const l = list();
  // Fenêtre « Récupérer » : la chaîne de redirections passe par la fiche.
  const byPage = matchDownload(l, { filename: 'archive.zip', urls: ['https://vpuniverse.com/files/file/1-pup/?do=download', 'https://cdn.example/x.zip'] });
  assert.equal(byPage?.kind, 'pup');
  assert.equal(matchDownload(l, { filename: 't2_l8.zip' })?.kind, 'rom');
  assert.equal(matchDownload(l, { filename: 'Terminator 2 (Williams 1991) B2S.directb2s' })?.kind, 'b2s');
  assert.equal(matchDownload(l, { filename: 'Terminator 2 (Williams 1991) VPW 1.25.vpx' })?.kind, 'table');
  // Zip au nom du jeu : la table, pas le PuP-Pack ; un zip « PuP » : le PuP-Pack.
  assert.equal(matchDownload(l, { filename: 'Terminator 2 (Williams 1991) VPW 1.25.zip' }, db)?.kind, 'table');
  assert.equal(matchDownload(l, { filename: 'Terminator2 PuP-Pack 3.0.zip' }, db)?.kind, 'pup');
  // En cours d'écriture, sans rapport, ou déjà reçu.
  assert.equal(matchDownload(l, { filename: 't2_l8.zip.crdownload' }), undefined);
  assert.equal(matchDownload(l, { filename: 'facture.pdf' }), undefined);
  assert.equal(matchDownload(l, { filename: 'Fireball (Bally 1972).zip' }, db), undefined);
  markReceived(l.items[2]!, 'D:\\Téléchargements\\t2_l8.zip', 'watch');
  assert.equal(matchDownload(l, { filename: 't2_l8.zip' }), undefined);
  assert.ok(isPartialDownload('table.vpx.part') && isPartialDownload('x.tmp') && !isPartialDownload('table.vpx'));
});

test('provenance dans le .info, tables installées, mises à jour', () => {
  const info = setTableSource({ Info: { Title: 'Terminator 2' }, User: { StartCount: 3 } }, { origin: 'VPS', vpsGameId: 'BunvWvh9', vpsFileId: 't200', version: '1.2', updatedAt: 1500, installedAt: '2026-10-22T10:00:00Z' });
  assert.equal(info.Info?.VPSId, 'BunvWvh9');
  assert.equal(info.User?.StartCount, 3);
  assert.equal(tableSourceOf(info)?.vpsFileId, 't200');
  assert.deepEqual([...installedGames([info, { Info: { VPSId: 'em1' } }, {}])].sort(), ['BunvWvh9', 'em1']);
  // Version 1.2 installée, VPS donne 1.25 pour le même fichier.
  const up = tableUpdate(db, { source: tableSourceOf(info) })!;
  assert.equal(up.latest.id, 't200');
  assert.equal(up.reason, 'version 1.2 → 1.25');
  assert.equal(tableUpdate(db, { source: { ...tableSourceOf(info)!, version: '1.25' } }), undefined, 'à jour');
  // Sans provenance : la recréation reconnue (auteur) et la version écrite dans la table.
  assert.equal(tableUpdate(db, { vpsGameId: 'BunvWvh9', tableFileId: 't200', version: '1.1d' })?.reason, 'version 1.1d → 1.25');
  // Versions non comparables : la date de mise à jour chez VPS tranche.
  assert.match(tableUpdate(db, { source: { ...tableSourceOf(info)!, version: 'bêta', updatedAt: 100 } })?.reason ?? '', /mise à jour chez VPS le/);
  assert.ok(compareVersions('1.2.10', '1.2.9') > 0);
  assert.equal(compareVersions('2.0', '2'), 0);
  assert.ok(Number.isNaN(compareVersions('final', 'beta')));
});
