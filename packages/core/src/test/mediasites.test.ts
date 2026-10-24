// Médias des sites communautaires (mediasites.ts) : texte cherché, adresse de recherche,
// type de média d'un résultat, rapprochement avec les jeux retenus, fichiers reçus d'un
// pack, propositions dans l'ordre des sites. Titres et catégories relevés sur
// VPUniverse le 24/10/2026 (recherche « terminator 2 »).

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vm from 'node:vm';
import { test } from 'node:test';
import { hitGameName, hitTypes, MEDIA_SITES, receivedMedias, siteHitSummary, siteMediaChoices, siteOffers, siteQuery, siteSearchUrl, SITE_SEARCH_PROBES, webHost, webMediaChoices, webSearchUrl, type SiteHit, type SiteReceipt, type WebReceipt } from '../mediasites';
import { WAIT_PROBES } from '../sitesessions';
import { createVpsDb, type VpsGame } from '../vps';

const T2: VpsGame = { id: 'BunvWvh9', name: 'Terminator 2 - Judgment Day', manufacturer: 'Williams', year: 1991 };
const T3: VpsGame = { id: 'T3stern', name: 'Terminator 3 - Rise of the Machines', manufacturer: 'Stern', year: 2003 };
const SALVATION: VpsGame = { id: 'salv', name: 'Terminator Salvation', manufacturer: 'Original', year: 2015 };
const GOTG: VpsGame = { id: 'q86TI2sS', name: 'Guardians of the Galaxy (Pro)', manufacturer: 'Stern', year: 2017 };
const db = createVpsDb([T2, T3, SALVATION, GOTG]);

const vpu = (id: string, title: string, category?: [string, string]): SiteHit => ({
  site: 'vpuniverse',
  id,
  url: `https://vpuniverse.com/files/file/${id}-x/`,
  title,
  category: category ? { id: category[0], label: category[1] } : undefined,
});
const HITS: SiteHit[] = [
  vpu('27996', 'Terminator 2 - Judgment Day Chrome Edition Topper', ['160', 'Topper Videos']),
  vpu('29322', 'Terminator 2 (Williams 1991) Animated Wheel APNG', ['149', 'Animated Wheel Images (APNG)']),
  vpu('32046', 'Terminator 2 (Williams 1991) Instruction Card / Rules', ['91', 'Instruction Cards']),
  vpu('27660', 'Terminator 2 - Judgment Day (3)', ['127', 'Tarcisio Style Wheels']),
  vpu('28887', 'Terminator 3 (Stern 2003) Topper Video', ['160', 'Topper Videos']),
  vpu('31914', 'Terminator 3 (Stern 2003) Instruction Card / Rules', ['91', 'Instruction Cards']),
  vpu('27665', 'Terminator-salvation', ['127', 'Tarcisio Style Wheels']),
];

test('texte cherché : le titre sans sous-titre ni petits mots, quatre mots au plus', () => {
  assert.equal(siteQuery('Terminator 2 - Judgment Day'), 'terminator 2');
  assert.equal(siteQuery('Terminator 2: Judgment Day'), 'terminator 2');
  assert.equal(siteQuery('The Addams Family'), 'addams family');
  assert.equal(siteQuery('Guardians of the Galaxy (Pro)'), 'guardians galaxy');
  assert.equal(siteQuery('AC/DC (Premium)'), 'ac dc');
  assert.equal(siteQuery('The Who’s Tommy Pinball Wizard'), 'who s tommy pinball');
});

test('adresses de recherche : catégories des médias de menu sur VPUniverse, application des téléchargements sur VPForums', () => {
  const u = new URL(siteSearchUrl('vpuniverse', 'terminator 2'));
  assert.equal(u.hostname, 'vpuniverse.com');
  assert.equal(u.searchParams.get('q'), 'terminator 2');
  assert.equal(u.searchParams.get('type'), 'downloads_file');
  assert.ok(u.searchParams.get('nodes')!.split(',').includes('160'), 'vidéos du topper');
  const f = new URL(siteSearchUrl('vpforums', 'medieval madness'));
  assert.equal(f.searchParams.get('search_term'), 'medieval madness');
  assert.equal(f.searchParams.get('search_app'), 'downloads');
  // VPUniverse, lent, passe en dernier.
  assert.deepEqual(MEDIA_SITES.map((s) => s.id), ['vpforums', 'vpuniverse']);
  assert.equal(MEDIA_SITES.find((s) => s.id === 'vpuniverse')!.wait, 45);
  for (const script of Object.values(SITE_SEARCH_PROBES)) assert.doesNotThrow(() => new vm.Script(script), 'script de page valide');
  for (const p of Object.values(WAIT_PROBES)) for (const script of [p!.click, p!.counter]) assert.doesNotThrow(() => new vm.Script(script));
});

test('type de média d’un résultat : sa catégorie, sinon son titre ; un media pack les a tous', () => {
  assert.deepEqual(hitTypes(HITS[0]!), { types: ['Topper'], kind: 'video', pack: false });
  assert.deepEqual(hitTypes(HITS[2]!).types, ['GameHelp']);
  const video = (title: string): SiteHit => ({ site: 'vpforums', id: '1', url: 'u', title, category: { id: '33', label: 'Videos' } });
  assert.deepEqual(hitTypes(video('Medieval Madness Backglass Video')).types, ['Backglass']);
  assert.deepEqual(hitTypes(video('Medieval Madness FullDMD')).types, ['FullDMD']);
  assert.deepEqual(hitTypes(video('Medieval Madness Playfield')).types, ['Playfield']);
  const pack = hitTypes({ site: 'vpforums', id: '2', url: 'u', title: 'Airborne (Capcom 1996) [HP MEDIA PACK]', category: { id: '35', label: 'Complete Media Packs' } });
  assert.equal(pack.pack, true);
  assert.ok(pack.types.includes('Wheel') && pack.types.includes('Topper') && pack.types.includes('AudioLaunch'));
  assert.equal(hitGameName('Terminator 2 (Williams 1991) Animated Wheel APNG'), 'Terminator 2 (Williams 1991)');
});

test('rapprochement : un résultat de Terminator 3 ne passe pas pour Terminator 2 ; rangés par média', () => {
  const offers = siteOffers(HITS, [T2], db);
  assert.deepEqual(offers.Topper?.map((o) => o.hit.id), ['27996']);
  assert.deepEqual(offers.GameHelp?.map((o) => o.hit.id), ['32046']);
  assert.deepEqual(new Set(offers.Wheel?.map((o) => o.hit.id)), new Set(['29322', '27660']));
  for (const list of Object.values(offers)) for (const o of list!) assert.equal(o.game.id, T2.id);
  // Jeu retenu absent des résultats : rien.
  assert.deepEqual(siteOffers(HITS, [GOTG], db), {});
  // Sans base VPS : le nom du jeu doit être dans le titre.
  assert.deepEqual(siteOffers(HITS, [T3], undefined).Topper?.map((o) => o.hit.id), ['28887']);
});

test('propositions : VPForums puis VPUniverse ; une fiche reçue devient ses fichiers', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mediasites-'));
  const video = path.join(dir, 'T2 Chrome Topper.mp4');
  fs.writeFileSync(video, 'mp4');
  const vpf: SiteHit = { site: 'vpforums', id: '7', url: 'https://www.vpforums.org/index.php?app=downloads&showfile=7', title: 'Terminator 2 (Williams 1991) Topper Video', category: { id: '33', label: 'Videos' } };
  const results = [
    { site: 'vpuniverse' as const, hits: HITS },
    { site: 'vpforums' as const, hits: [vpf] },
  ];
  const none = () => undefined;
  const before = siteMediaChoices('Topper', results, [T2], db, none);
  assert.deepEqual(before.map((c) => c.source), ['vpforums', 'vpuniverse'], 'VPForums d’abord');
  assert.equal(before[1]!.site?.received, undefined);
  const receipt: SiteReceipt = { key: 'vpuniverse:27996', site: 'vpuniverse', title: HITS[0]!.title, url: HITS[0]!.url, type: 'Topper', date: '2026-10-24T00:00:00Z', files: [{ file: video, type: 'Topper', kind: 'video' }] };
  const after = siteMediaChoices('Topper', results, [T2], db, (key) => (key === receipt.key ? receipt : undefined));
  const got = after.find((c) => c.source === 'vpuniverse')!;
  assert.equal(got.site?.received, true);
  assert.equal(got.file, video);
  assert.equal(got.label, 'T2 Chrome Topper.mp4');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('fichiers reçus : un pack rangé à la manière de Popper dit le type de chaque fichier', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mediasites-'));
  const put = (rel: string) => {
    const p = path.join(dir, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, 'x');
    return p;
  };
  const wheel = put('POPMedia/Visual Pinball X/Wheel/Terminator 2.png');
  const topper = put('POPMedia/Visual Pinball X/Topper/Terminator 2.mp4');
  const loose = put('lisez-moi/photo.jpg');
  put('__MACOSX/._x.png');
  const pack = receivedMedias(dir, { types: ['Wheel', 'Topper', 'Backglass'] });
  assert.deepEqual(
    pack.map((m) => [path.relative(dir, m.file), m.type]),
    [
      [path.relative(dir, loose), undefined],
      [path.relative(dir, topper), 'Topper'],
      [path.relative(dir, wheel), 'Wheel'],
    ],
  );
  // Un seul type (catégorie « Topper Videos ») : le fichier le prend s'il en a le format.
  const single = receivedMedias(path.join(dir, 'POPMedia', 'Visual Pinball X', 'Topper'), { types: ['Topper'], kind: 'video' });
  assert.deepEqual(single.map((m) => m.type), ['Topper']);
  assert.deepEqual(receivedMedias(path.join(dir, 'lisez-moi'), { types: ['Topper'], kind: 'video' }).map((m) => m.type), [undefined], 'une image n’est pas une vidéo de topper');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('fenêtres sans catalogue de traduction (processus principal muet) : le texte français, pas une page vide', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', 'app', 'renderer', 'i18n.js'), 'utf8');
  for (const given of [undefined, {}, { language: 'en' }, { language: 'en', locale: 'en-GB', messages: { Bonjour: 'Hello' } }]) {
    const context = vm.createContext({ window: { cyberI18n: given }, document: { documentElement: {}, querySelectorAll: () => [] }, console });
    vm.runInContext(`${source}\nthis.result = t('Bonjour');`, context);
    assert.equal(context.result, given && 'messages' in given ? 'Hello' : 'Bonjour', JSON.stringify(given));
  }
  // Les préchargements n'inventent pas de catalogue : la page décide.
  for (const preload of ['preload.ts', 'settings-preload.ts', 'acquire-preload.ts']) {
    const text = fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', 'app', 'src', preload), 'utf8');
    assert.match(text, /sendSync\('i18n'\) \?\? \{\}/, preload);
  }
});

test('décompte : combien de résultats servent au média ouvert, et où vont les autres', () => {
  const sum = siteHitSummary(HITS, [T2], db);
  assert.deepEqual(sum.byType, { Topper: 1, Wheel: 2, GameHelp: 1 });
  assert.equal(sum.packs, 0);
  // Terminator 3 (deux fiches) et Salvation : d'autres jeux.
  assert.equal(sum.elsewhere, 3);
  // Un afficheur 4:1 sans fiche à côté de fiches FullDMD : le décompte le montre.
  const fulldmd = vpu('12517', 'Terminator 2 (Williams 1991) Full DMD animated', ['143', 'FullDMD Videos']);
  const got = siteHitSummary([fulldmd], [T2], db);
  assert.equal(got.byType.DMD, undefined);
  assert.equal(got.byType.FullDMD, 1);
  // Un pack complet se compte à part : il ne gonfle pas chaque écran.
  const pack: SiteHit = { site: 'vpforums', id: '7001', url: 'u', title: 'Terminator 2 (Williams 1991) (FS) (Media Pack)', category: { id: '35', label: 'Complete Media Packs' } };
  assert.deepEqual(siteHitSummary([pack, fulldmd], [T2], db), { byType: { FullDMD: 1 }, packs: 1, elsewhere: 0 });
});

test('recherche sur le web : le titre sans édition, l’écran en anglais, sur DuckDuckGo', () => {
  const u = new URL(webSearchUrl('Game of Thrones (Limited Edition)', 'FullDMD'));
  assert.equal(u.hostname, 'duckduckgo.com');
  assert.equal(u.searchParams.get('q'), 'Game of Thrones FullDMD video vpinball');
  assert.equal(new URL(webSearchUrl('Terminator 2 - Judgment Day', 'Wheel')).searchParams.get('q'), 'Terminator 2 wheel logo vpinball');
  assert.equal(webHost('https://www.vpforums.org/index.php?app=downloads'), 'vpforums.org');
});

test('fichiers reçus du web : proposés à leur table seulement, pour leur média, le plus récent d’abord', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mediasites-'));
  const put = (name: string) => {
    const p = path.join(dir, name);
    fs.writeFileSync(p, 'x');
    return p;
  };
  const old = put('ancien.mp4');
  const fresh = put('nouveau.mp4');
  const wheel = put('logo.png');
  const table = path.join(dir, 'GoT.vpx');
  const receipts: WebReceipt[] = [
    { key: 'web:1', table, type: 'FullDMD', url: 'https://vpuniverse.com/a', filename: 'a.zip', date: '2026-10-24T10:00:00Z', files: [{ file: old, kind: 'video' }] },
    { key: 'web:2', table, type: 'FullDMD', url: 'https://www.vpforums.org/b', filename: 'b.zip', date: '2026-10-24T11:00:00Z', files: [{ file: fresh, kind: 'video' }, { file: wheel, type: 'Wheel', kind: 'image' }] },
  ];
  assert.deepEqual(webMediaChoices('FullDMD', receipts, table).map((c) => path.basename(c.file!)), ['nouveau.mp4', 'ancien.mp4']);
  assert.deepEqual(webMediaChoices('Wheel', receipts, table).map((c) => path.basename(c.file!)), ['logo.png'], 'un type reconnu va à son média');
  assert.deepEqual(webMediaChoices('DMD', receipts, table), [], 'un fichier sans type ne sert qu’au média d’où on l’a cherché');
  assert.deepEqual(webMediaChoices('FullDMD', receipts, path.join(dir, 'T2.vpx')), [], 'pas pour une autre table');
  assert.equal(webMediaChoices('FullDMD', receipts, table)[0]!.source, 'web');
  fs.rmSync(dir, { recursive: true, force: true });
});
