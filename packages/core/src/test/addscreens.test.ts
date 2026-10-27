// Jamais enfermé : chaque écran d'ajout ou de choix a une issue vers le web (« Chercher sur
// le web… », navigateur intégré, recherche libre préremplie), une partie absente lance la
// pré-recherche sur toutes les sources, et le jeu d'une table se reconnaît même quand son
// .info ne le dit pas (The Goonies « VPW 2021 », jeu « Original » chez VPS, le 27/10/2026).

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import * as vm from 'node:vm';
import { parseHTML } from 'linkedom';
import { ADD_SCREENS, type AddScreenId } from '../addscreens';
import { hitPart, knownVpsId, PART_SITE_NODES, partOffers, partSearchUrl, partSources, partWebQuery, tableGame, GAME_PARTS } from '../gameparts';
import { PART_KINDS } from '../acquisition';
import { checkSiteSearch, siteSearchText, SITE_SEARCH_PROBES, type SiteHit } from '../mediasites';
import type { TableEntry } from '../tables';
import { createVpsDb, type VpsGame } from '../vps';

const APP = path.join(__dirname, '..', '..', '..', '..', 'app', 'src');
const sources = fs
  .readdirSync(APP)
  .filter((f) => f.endsWith('.ts'))
  .map((f) => ({ file: f, text: fs.readFileSync(path.join(APP, f), 'utf8') }));

/** Issues vers le web écrites dans le code : webAction('…'), ctx.web('…'), webForTable('…'), web: '…'. */
const EXITS = /(?:webAction|ctx\.web|webForTable)\('([a-z.]+)'|\bweb: '([a-z.]+)'/g;

test('chaque écran d’ajout ou de choix a son issue vers le web, une seule', () => {
  const seen = new Map<string, string[]>();
  for (const { file, text } of sources) {
    for (const m of text.matchAll(EXITS)) {
      const id = (m[1] ?? m[2])!;
      seen.set(id, [...(seen.get(id) ?? []), file]);
    }
  }
  for (const id of Object.keys(ADD_SCREENS) as AddScreenId[]) {
    assert.ok(seen.has(id), `${id} n'a pas de « Chercher sur le web… »`);
    assert.equal(seen.get(id)!.length, 1, `${id} : issue vers le web répétée (${seen.get(id)!.join(', ')})`);
  }
  for (const id of seen.keys()) assert.ok(Object.hasOwn(ADD_SCREENS, id), `${id} : écran absent d'ADD_SCREENS (packages/core/src/addscreens.ts)`);
});

test('aucun nouvel écran d’ajout ou de choix sans issue vers le web', () => {
  // Les titres qui disent qu'on ajoute, qu'on récupère ou qu'on choisit : la fonction qui
  // construit l'écran doit contenir son issue vers le web.
  const ADDING = /heading: t\('(Ajouter une table|Ajouter à un jeu|Trouver une table|Ce qu’il faut : |\{kind\} : au choix|\{part\} : au choix|Récupérés et attendus|Parties du jeu|Téléchargements|Bibliothèque de ROM|Médias du jeu|\{label\} : propositions|Rien sur VPinMediaDB|Remplacer : |Choisir un fichier : )/;
  for (const { file, text } of sources) {
    const lines = text.split('\n');
    lines.forEach((line, i) => {
      if (!ADDING.test(line) || /return \{ heading:/.test(line)) return;
      // La fonction englobante : de sa déclaration à la suivante, au même retrait.
      let start = i;
      while (start > 0 && !/^ {2}(?:async )?function /.test(lines[start]!)) start--;
      let end = i;
      while (end < lines.length - 1 && !/^ {2}(?:async )?function /.test(lines[end + 1]!)) end++;
      const body = lines.slice(start, end + 1).join('\n');
      // L'avertissement lu une fois avant le catalogue n'est pas un écran d'ajout : il y mène.
      if (body.includes('acquisitionNotice()')) return;
      assert.ok(/webAction\(|ctx\.web\(|webGame\(|webAction\(s, |\bweb: '/.test(body), `${file}:${i + 1} : écran d'ajout ou de choix sans « Chercher sur le web… »`);
    });
  }
});

test('une partie absente est cherchée d’office partout : VPS, Téléchargements, VPForums, VPUniverse, le web', () => {
  for (const part of GAME_PARTS) {
    const all = partSources(part);
    assert.ok(all.includes('web') && all.includes('downloads'), `${part} : le web et Téléchargements`);
    if (part !== 'ini') assert.deepEqual([...all].sort(), ['downloads', 'vpforums', 'vps', 'vpuniverse', 'web'], part);
  }
  for (const kind of PART_KINDS) {
    assert.ok(PART_SITE_NODES[kind].length, `${kind} : catégories de VPUniverse`);
    assert.match(partSearchUrl('vpuniverse', 'The Goonies Never Say Die Pinball', kind), new RegExp(`nodes=${PART_SITE_NODES[kind].join('%2C|,')}`));
  }
  assert.equal(partSearchUrl('vpuniverse', 'The Goonies Never Say Die Pinball', 'pup'), 'https://vpuniverse.com/search/?q=goonies%20never&type=downloads_file&nodes=120&search_and_or=and&sortby=relevancy');
  assert.equal(partWebQuery('The Goonies Never Say Die Pinball (VPW 2021)', 'pup'), 'The Goonies Never Say Die Pinball pup-pack vpinball');
});

const GOONIES: VpsGame = { id: '34pZqivK', name: 'The Goonies Never Say Die Pinball', manufacturer: 'Original', year: 2021, type: 'SS', tableFiles: [{ id: 'g1', tableFormat: 'VPX', authors: ['VPW'], version: '1.5', urls: [{ url: 'https://vpuniverse.com/files/file/1-goonies/' }] }] };
const ADVENTURE: VpsGame = { id: 'fpB2AtzH', name: 'The Goonies Pinball Adventure', manufacturer: 'Original', year: 2019, type: 'SS' };
const GOT: VpsGame = { id: 'got', name: 'Game of Thrones', manufacturer: 'Stern', year: 2015, type: 'SS' };
const GOT_LE: VpsGame = { id: 'gotle', name: 'Game of Thrones (Limited Edition)', manufacturer: 'Stern', year: 2015, type: 'SS' };
const vps = createVpsDb([GOONIES, ADVENTURE, GOT, GOT_LE]);

function table(title: string, file: string, info: TableEntry['info'] = {}): TableEntry {
  return { id: `${title}/${file}`, file: `D:\\tables\\${title}\\${file}`, folder: `D:\\tables\\${title}`, title, info: { Info: { Title: title }, ...info } } as unknown as TableEntry;
}

test('le jeu d’une table : son .info, sinon ses médias, sinon ce qu’elle dit d’elle-même', () => {
  // Comme sur la borne : fabricant « VPW », aucun identifiant dans le .info.
  const goonies = table('The Goonies Never Say Die Pinball (VPW 2021)', 'The Goonies Never Say Die Pinball (VPW 2021) 1.5.vpx', { Info: { Title: 'The Goonies Never Say Die Pinball', Manufacturer: 'VPW', Year: 2021 } });
  const found = tableGame(vps, goonies);
  assert.equal(found.game?.id, GOONIES.id, 'reconnue d’après son nom');
  assert.equal(found.how, 'search');
  // Les médias choisis disent le jeu, sans rien chercher.
  const withMedias = { ...goonies.info, CyberPinball: { medias: { sources: { Wheel: { vpsId: GOONIES.id } } } } };
  assert.equal(knownVpsId(withMedias), GOONIES.id);
  // Deux jeux aussi probables : à choisir, les pistes sont données.
  const got = tableGame(vps, table('Game of Thrones', 'Game of Thrones.vpx'));
  assert.ok(!got.game || got.game.id === GOT.id, 'jamais un jeu au hasard');
  assert.ok(got.leads.length >= 1);
  // Le .info l'emporte.
  assert.equal(tableGame(vps, table('X', 'X.vpx', { Info: { Title: 'X', VPSId: ADVENTURE.id } })).game?.id, ADVENTURE.id);
});

test('résultats des sites : la partie d’après la catégorie ou le titre, le jeu d’après le titre', () => {
  const hit = (title: string, extra: Partial<SiteHit> = {}): SiteHit => ({ site: 'vpuniverse', id: title, url: `https://vpuniverse.com/files/file/${title.length}-x/`, title, ...extra });
  assert.equal(hitPart(hit('Goonies', { category: { id: '120', label: 'PuP-Packs' } })), 'pup');
  assert.equal(hitPart({ ...hit('The Goonies Never Say Die PuP Pack'), site: 'vpforums' }), 'pup');
  assert.equal(hitPart({ ...hit('Goonies Never Say Die directB2S'), site: 'vpforums' }), 'b2s');
  const hits = [
    hit('The Goonies Never Say Die Pinball PuP-Pack', { category: { id: '120', label: 'PuP-Packs' }, downloads: 900 }),
    hit('The Goonies Pinball Adventure PuP-Pack', { category: { id: '120', label: 'PuP-Packs' }, downloads: 5000 }),
    hit('The Goonies Never Say Die directb2s', { category: { id: '33', label: 'B2S Backglass Downloads' } }),
  ];
  const offers = partOffers(hits, 'pup', GOONIES.name, GOONIES, vps);
  assert.equal(offers[0]!.hit.title, 'The Goonies Never Say Die Pinball PuP-Pack', 'le bon jeu d’abord');
  assert.ok(!offers.some((o) => o.hit.title.includes('directb2s')), 'un fronton n’est pas un PuP-Pack');
  assert.ok(offers.filter((o) => o.hit.title.includes('Adventure')).every((o) => o.other), 'un autre jeu est signalé, en dernier');
  // Sans base VPS : le titre du jeu dans celui du résultat.
  assert.deepEqual(partOffers(hits, 'pup', 'The Goonies Never Say Die Pinball').map((o) => o.hit.title), ['The Goonies Never Say Die Pinball PuP-Pack']);
});

test('page témoin de VPUniverse : la recherche d’un PuP-Pack de The Goonies propose le sien', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', '..', 'test-pages', 'vpuniverse-parties.html'), 'utf8');
  const { document } = parseHTML(html);
  if (document.body && !('innerText' in document.body)) Object.defineProperty(document.body, 'innerText', { get: () => document.body.textContent });
  const url = partSearchUrl('vpuniverse', GOONIES.name, 'pup');
  const raw = JSON.parse(JSON.stringify(vm.runInNewContext(SITE_SEARCH_PROBES.vpuniverse, { document, location: new URL(url), window: {}, URL })));
  const result = checkSiteSearch('vpuniverse', raw);
  assert.equal(result.kind, 'hits');
  if (result.kind !== 'hits') return;
  const hits = result.hits.map((h) => ({ ...h, site: 'vpuniverse' as const }));
  assert.ok(hits.every((h) => hitPart(h) === 'pup'), 'catégorie PuP-Packs');
  const offers = partOffers(hits, 'pup', GOONIES.name, GOONIES, vps);
  assert.ok(offers.length >= 1);
  assert.ok(offers.some((o) => o.hit.id === '6724' && !o.other), 'le PuP-Pack de The Goonies');
});

test('VPUniverse : mots de trois lettres retirés de la recherche, attente imposée reconnue (jamais « aucun résultat »)', () => {
  assert.equal(siteSearchText('vpuniverse', 'goonies never say die'), 'goonies never');
  assert.equal(siteSearchText('vpuniverse', 'the who'), 'the who', 'rien d’autre : on garde tout');
  assert.equal(siteSearchText('vpforums', 'goonies never say die'), 'goonies never say die');
  const html = fs.readFileSync(path.join(__dirname, '..', '..', 'test-pages', 'vpuniverse-attente.html'), 'utf8');
  const { document } = parseHTML(html);
  if (document.body && !('innerText' in document.body)) Object.defineProperty(document.body, 'innerText', { get: () => document.body.textContent });
  const raw = JSON.parse(JSON.stringify(vm.runInNewContext(SITE_SEARCH_PROBES.vpuniverse, { document, location: new URL('https://vpuniverse.com/search/?q=matrix'), window: {}, URL })));
  assert.deepEqual(checkSiteSearch('vpuniverse', raw), { kind: 'show', reason: 'flood', wait: 88 });
});
