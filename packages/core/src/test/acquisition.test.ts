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
  attachFile,
  cabinetScreens,
  catalog,
  classifyContent,
  clearItem,
  compareVersions,
  contentFits,
  contentSummary,
  forgetStray,
  placeDownload,
  reassignFile,
  removeGame,
  removeItem,
  setAside,
  waitListProblems,
  type ContentKind,
  installedGames,
  isPartialDownload,
  linkHost,
  linkOnSite,
  quickNeeds,
  supportFiles,
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

test('catalogue : filtres « Fichiers » (genre proposé avec un lien vivant) et « Site », combinés aux autres', () => {
  const none = new Set<string>();
  const ids = (f: Parameters<typeof catalog>[1], extras?: Parameters<typeof catalog>[3]) => catalog(db, f, none, extras).map((g) => g.id);
  assert.deepEqual(ids({ support: 'any' }), ['em1', 'orig', 'BunvWvh9']);
  assert.deepEqual(ids({ support: 'b2s' }), ['BunvWvh9'], 'le fronton fourni avec la table (Mon Original) n’est pas un fichier à part');
  assert.deepEqual(ids({ support: 'rom' }), ['BunvWvh9']);
  assert.deepEqual(ids({ support: 'pup' }), ['BunvWvh9']);
  assert.deepEqual(ids({ support: 'altcolor' }), ['BunvWvh9']);
  assert.deepEqual(ids({ support: 'altsound' }), []);
  assert.deepEqual(ids({ support: 'vr' }), ['orig']);
  // PuP-Pack fourni avec la table : il compte.
  const withPup = createVpsDb([{ ...EM, tableFiles: [file('e9', { features: ['incl. PuP'] })] }]);
  assert.deepEqual(catalog(withPup, { support: 'pup' }, none).map((g) => g.id), ['em1']);
  // Seulement des liens morts : rien à récupérer.
  const dead = createVpsDb([{ ...T2, pupPackFiles: [file('p9', { urls: [{ url: 'https://vpuniverse.com/files/file/9-x/', broken: true }] })] }]);
  assert.deepEqual(catalog(dead, { support: 'pup' }, none).map((g) => g.id), []);
  // Médias de VPinMediaDB : d'après l'index, absent = rien.
  assert.deepEqual(ids({ support: 'media' }), []);
  assert.deepEqual(ids({ support: 'media' }, { media: new Set(['em1', 'zen']) }), ['em1'], 'le jeu sans version VPX reste écarté');
  // Site : celui de la table, ou des fichiers du filtre « Fichiers ».
  assert.deepEqual(ids({ site: 'vpuniverse' }), ['em1', 'orig', 'BunvWvh9']);
  assert.deepEqual(ids({ site: 'vpforums' }), []);
  assert.deepEqual(ids({ support: 'rom', site: 'vpforums' }), ['BunvWvh9'], 'la ROM de T2 est sur vpforums.org');
  assert.deepEqual(ids({ support: 'rom', site: 'vpuniverse' }), []);
  const drive = createVpsDb([{ ...EM, tableFiles: [file('e5', { urls: [{ url: 'https://drive.google.com/file/d/x' }, { url: 'https://www.youtube.com/watch?v=y' }] })] }, { ...ORIGINAL, tableFiles: [file('o5', { urls: [{ url: 'https://youtu.be/z' }] })] }]);
  assert.deepEqual(catalog(drive, { site: 'free' }, none).map((g) => g.id), ['em1'], 'sans compte : Google Drive oui, une vidéo YouTube non');
  assert.equal(linkOnSite('https://github.com/x/y/releases', 'free'), true);
  assert.equal(linkOnSite('https://vpuniverse.com/files/file/1-x/', 'free'), false);
  // Combinés : sorte, état, fichiers et site.
  assert.deepEqual(ids({ kind: 'ss', support: 'pup', site: 'vpuniverse' }), ['BunvWvh9']);
  assert.deepEqual(catalog(db, { state: 'missing', support: 'pup' }, new Set(['BunvWvh9'])).map((g) => g.id), []);
  assert.deepEqual(catalog(db, { text: 'terminator', support: 'vr' }, none).map((g) => g.id), []);
  assert.equal(supportFiles(T2, 'media'), undefined);
  assert.deepEqual(supportFiles(T2, 'rom')!.map((f) => f.id), ['r1']);
});

test('installation rapide : l’indispensable à récupérer et le fronton conseillé, ou ce qui l’empêche', () => {
  const screens: CabinetScreens = { backglass: true, dmd: 'full', topper: false };
  const q = quickNeeds(requirements(T2, T2.tableFiles![1]!, { screens, roms: new Set() }));
  assert.deepEqual(q.get.map((n) => `${n.kind}:${n.files[0]!.id}`), ['table:t200', 'b2s:b2', 'rom:r1'], 'ni PuP-Pack ni couleurs : facultatifs');
  assert.deepEqual(q.blocked, []);
  // ROM déjà là, borne sans fronton : la table seule.
  const solo = quickNeeds(requirements(T2, T2.tableFiles![1]!, { screens: { backglass: false, dmd: 'none', topper: false }, roms: new Set(['t2_l8']) }));
  assert.deepEqual(solo.get.map((n) => n.kind), ['table']);
  // Version sans lien vivant : bloquée.
  const dead = quickNeeds(requirements(T2, T2.tableFiles![2]!, { screens, roms: new Set() }));
  assert.deepEqual(dead.blocked.map((n) => n.kind), ['table']);
  assert.ok(!dead.get.some((n) => n.kind === 'table'));
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

// Contenus d'archives tels que les liste tar -tf.
const MEDIA_PACK = ['T2/', 'T2/Wheel/Terminator 2.png', 'T2/Backglass/Terminator 2.mp4', 'T2/Topper/Terminator 2.mp4', 'T2/Audio/launch.mp3', 'T2/DMD/Terminator 2.f4v'];
const TABLE_PACK = ['Terminator 2 VPW 1.25.vpx', 'Terminator 2 VPW 1.25.directb2s', 'pinmame/roms/t2_l8.zip'];
const ROM_ZIP = ['t2_u18.l3', 'u6-l8.rom', 't2_u15.l3'];
const PUP_PACK = ['t2/screens.pup', 't2/playlists.pup', 't2/Backglass/intro.mp4'];

test('contenu d’un fichier reçu : table, fronton, ROM, PuP-Pack, pack de médias, d’après ce que contient l’archive', () => {
  assert.equal(classifyContent('Terminator 2.vpx'), 'table');
  assert.equal(classifyContent('T2.directb2s'), 'b2s');
  assert.equal(classifyContent('T2 Media Pack.zip', MEDIA_PACK), 'media');
  assert.equal(classifyContent('T2 VPW.zip', TABLE_PACK), 'table', 'une table l’emporte sur le fronton et la ROM qu’elle fournit');
  assert.equal(classifyContent('t2_l8.zip', ROM_ZIP), 'rom');
  assert.equal(classifyContent('t2_l8.7z', ['t2_l8/', ...ROM_ZIP.map((c) => `t2_l8/${c}`)]), 'rom', 'ROM en 7z, puces dans un sous-dossier');
  assert.equal(classifyContent('T2 PuP.7z', PUP_PACK), 'pup', 'un PuP-Pack l’emporte sur ses vidéos');
  assert.equal(classifyContent('T2 altsound.zip', ['altsound/t2_l8/altsound.csv', 'altsound/t2_l8/jingle/1.ogg']), 'altsound');
  assert.equal(classifyContent('T2 serum.zip', ['t2_l8/t2_l8.cRZ']), 'altcolor');
  assert.equal(classifyContent('T2 topper.zip', ['topper.mp4']), 'topper');
  assert.equal(classifyContent('T2 music.zip', ['music/1.mp3', 'music/2.mp3']), 'music');
  assert.equal(classifyContent('archive.rar'), 'unknown', 'archive illisible : on ne sait pas');
  assert.equal(contentSummary('T2 Media Pack.zip', MEDIA_PACK), '1 image, 3 vidéos, 1 son, aucun .vpx');
  assert.equal(contentFits('table', 'media'), 'no');
  assert.equal(contentFits('table', 'table'), 'yes');
  assert.equal(contentFits('topper', 'media'), 'yes');
  assert.equal(contentFits('table', 'unknown'), 'unknown');
  assert.equal(contentFits('table', undefined), 'unknown');
});

test('rattachement vérifié : un pack de médias reçu pour la table demande confirmation et propose l’élément qui lui va', () => {
  const l = list();
  const [table, b2s, rom] = l.items;
  // Fenêtre ouverte pour la table, fiche qui propose aussi le pack de médias : refusé d'office.
  const media = { filename: 'Terminator 2 Media Pack.zip', urls: [vpu(200, 't2-vpw').url], content: classifyContent('T2.zip', MEDIA_PACK) };
  assert.equal(matchDownload(l, media), undefined, 'la fiche traversée ne suffit pas quand le contenu dit autre chose');
  const p = placeDownload(l, media, undefined, table!.id);
  assert.equal(p.verdict, 'mismatch');
  assert.equal(p.item, table);
  assert.equal(p.better, undefined, 'aucun élément n’attend de médias');
  // Un fronton reçu par la fenêtre de la table : confirmation, le fronton attendu proposé.
  const front = placeDownload(l, { filename: 'T2.zip', content: classifyContent('T2.zip', ['T2.directb2s']), urls: [vpu(200).url] }, undefined, table!.id);
  assert.deepEqual([front.verdict, front.item?.kind, front.better?.kind], ['mismatch', 'table', 'b2s']);
  // Sans fenêtre (dossier Téléchargements surveillé) : le seul fronton attendu, sans question.
  assert.deepEqual(placeDownload(l, { filename: 'T2.zip', content: 'b2s' }), { item: b2s, verdict: 'fits' });
  // La vraie table : rangée sans question.
  assert.deepEqual(placeDownload(l, { filename: 'T2 VPW 1.25.zip', content: classifyContent('x.zip', TABLE_PACK), urls: [vpu(200).url] }, undefined, table!.id), { item: table, verdict: 'fits' });
  // Archive illisible : prise sans vérification, signalée comme telle.
  assert.equal(placeDownload(l, { filename: 'T2.rar', urls: [vpu(200).url] }, undefined, table!.id).verdict, 'unknown');
  // Une ROM nommée comme attendu mais qui n'en est pas une n'est pas rangée comme ROM.
  assert.notEqual(matchDownload(l, { filename: 't2_l8.zip', content: 'media' })?.kind, 'rom');
  // Récupérer de nouveau un élément déjà reçu : la fenêtre ouverte pour lui le remplace.
  markReceived(table!, 'D:\\acq\\T2 Media Pack.zip', 'window', new Date(), undefined, { content: 'media' });
  const again = placeDownload(l, { filename: 'T2 VPW 1.25.vpx', urls: ['https://cdn.example/t2.vpx'] }, undefined, table!.id);
  assert.equal(again.item, table);
  assert.equal(again.verdict, 'fits');
  assert.equal(placeDownload(l, { filename: 'facture.pdf' }, undefined, table!.id).verdict, 'none');
  void rom;
});

test('liste d’attente : réaffecter, vider, remplacer, retirer, sans jamais perdre un fichier', () => {
  const l = list();
  const strays = () => (l.strays ?? []).map((s) => s.file);
  const [table, b2s, rom, pup] = l.items;
  markReceived(table!, 'D:\\acq\\T2 PuP.zip', 'window', new Date('2026-10-24T10:00:00Z'), undefined, { content: 'pup' });
  // Réaffecter : le PuP-Pack reçu pour la table va au PuP-Pack ; la table redevient attendue.
  reassignFile(l, table!, pup!);
  assert.equal(table!.state, 'waiting');
  assert.equal(table!.received, undefined);
  assert.equal(pup!.state, 'received');
  assert.equal(pup!.received!.file, 'D:\\acq\\T2 PuP.zip');
  assert.equal(pup!.received!.content, 'pup');
  assert.equal(pup!.received!.at, '2026-10-24T10:00:00.000Z', 'la date de réception suit le fichier');
  // Remplacer : un autre fichier pour le PuP-Pack ; l'ancien est gardé de côté, pas perdu.
  const replaced = attachFile(l, pup!, { file: 'D:\\acq\\T2 PuP 3.1.zip', via: 'manual', content: 'pup' });
  assert.equal(replaced, 'D:\\acq\\T2 PuP.zip');
  assert.deepEqual(strays(), ['D:\\acq\\T2 PuP.zip']);
  // Rattacher un fichier gardé de côté : il quitte les fichiers de côté ; ceux qui attendaient
  // l'élément (fichier refusé pour lui) ne sont plus une question.
  setAside(l, { file: 'D:\\acq\\media.zip', via: 'window', content: 'media', expected: table!.id });
  attachFile(l, table!, { file: 'd:\\ACQ\\t2 pup.zip', via: 'manual' });
  assert.deepEqual(strays(), ['D:\\acq\\media.zip']);
  assert.equal(l.strays?.[0]?.expected, undefined);
  forgetStray(l, 'D:\\acq\\media.zip');
  // Le même fichier ne remplit pas deux éléments.
  attachFile(l, rom!, { file: 'D:\\acq\\T2 PuP 3.1.zip', via: 'manual' });
  assert.equal(pup!.state, 'waiting');
  // Vider en gardant le fichier, puis en le renvoyant pour la corbeille.
  assert.equal(clearItem(l, rom!, true), 'D:\\acq\\T2 PuP 3.1.zip');
  assert.equal(rom!.state, 'waiting');
  assert.deepEqual(strays(), ['D:\\acq\\T2 PuP 3.1.zip']);
  assert.equal(clearItem(l, table!, false), 'd:\\ACQ\\t2 pup.zip');
  assert.deepEqual(strays(), ['D:\\acq\\T2 PuP 3.1.zip'], 'pour la corbeille : pas gardé de côté');
  forgetStray(l, 'D:\\acq\\T2 PuP 3.1.zip');
  assert.deepEqual(strays(), []);
  // Garder de côté avec l'élément refusé et celui qu'on propose ; retirer l'élément efface ces renvois.
  setAside(l, { file: 'D:\\acq\\media.zip', via: 'window', content: 'media', expected: table!.id, suggested: b2s!.id });
  assert.equal(removeItem(l, b2s!, true), undefined);
  assert.equal(l.strays?.[0]?.suggested, undefined);
  assert.equal(l.strays?.[0]?.expected, table!.id);
  // Retirer un jeu entier : ses éléments partent, ses fichiers reçus sont rendus à l'appelant.
  markReceived(rom!, 'D:\\acq\\t2_l8.zip', 'window');
  assert.deepEqual(removeGame(l, T2.id), ['D:\\acq\\t2_l8.zip']);
  assert.equal(l.items.length, 0);
  // Relu tel quel, fichiers gardés de côté compris.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-attente-'));
  saveWaitList(dir, l);
  assert.deepEqual(loadWaitList(dir), JSON.parse(JSON.stringify(l)));
});

test('réparer l’existant : un pack de médias déjà rangé comme table est détecté, avec l’élément qui lui irait', () => {
  const l = list();
  const [table, , rom, pup] = l.items;
  // Comme un acquisition.json réel en 0.1.3-essai.1 : rangé par une version qui ne vérifiait rien, sans contenu noté.
  markReceived(table!, 'D:\\acq\\Terminator 2 Media Pack.zip', 'window');
  markReceived(rom!, 'D:\\acq\\t2_l8.zip', 'window');
  markReceived(pup!, 'D:\\acq\\disparu.zip', 'watch', new Date(), undefined, { content: 'pup' });
  const contents: Record<string, ContentKind> = { 'D:\\acq\\Terminator 2 Media Pack.zip': 'media', 'D:\\acq\\t2_l8.zip': 'rom' };
  const exists = (f: string) => f !== 'D:\\acq\\disparu.zip';
  const problems = waitListProblems(l, (i) => contents[i.received!.file], exists);
  assert.deepEqual(problems.map((p) => `${p.item.kind}:${p.problem}:${p.content ?? ''}`), ['table:mismatch:media', 'pup:missing:']);
  // Un PuP-Pack rangé comme table : le PuP-Pack attendu est proposé.
  clearItem(l, pup!, false);
  contents['D:\\acq\\Terminator 2 Media Pack.zip'] = 'pup';
  assert.equal(waitListProblems(l, (i) => contents[i.received!.file], exists)[0]!.better, pup);
  // Contenu noté à la réception, rien à relire.
  assert.deepEqual(waitListProblems(l, () => undefined, exists).map((p) => p.item.kind), []);
  table!.received!.content = 'media';
  assert.deepEqual(waitListProblems(l, () => undefined, exists).map((p) => p.item.kind), ['table']);
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
