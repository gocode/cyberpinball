// Fiche d'ajout d'une table de Zen (app/src/library.ts) : chaque média a tous ses choix, et le choix
// fait est celui qui arrive ; aperçus de VPinMediaDB lisibles dès leur réception (media-search.ts).
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';

const src = (file: string) => fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', file), 'utf8');
const body = (text: string, start: string) => {
  const at = text.indexOf(start);
  assert.ok(at >= 0, `introuvable : ${start}`);
  // Jusqu'à la fonction suivante du même niveau.
  const next = text.indexOf('\n  function ', at + start.length);
  const nextAsync = text.indexOf('\n  async function ', at + start.length);
  const end = [next, nextAsync].filter((n) => n > 0).reduce((a, b) => Math.min(a, b), text.length);
  return text.slice(at, end);
};

test('aperçus de VPinMediaDB : autorisés avant d’entrer dans la table que l’écran lit (302 vignettes refusées, 19-20/11/2026)', () => {
  const stage = body(src('media-search.ts'), 'async function stagePreviews(');
  const allow = stage.indexOf('allowPreview(');
  assert.ok(allow > 0, 'stagePreviews autorise chaque aperçu reçu');
  assert.ok(allow < stage.indexOf('into.set('), 'autorisé avant d’être visible des écrans');
});

test('fiche d’ajout de Zen : tous les choix de chaque média, Start les montre', () => {
  const lib = src('library.ts');
  const open = body(lib, 'function openPinballFxDetail(');
  assert.match(open, /offers\?\.variants/, 'chaque variante de VPinMediaDB, pas la seule par défaut');
  assert.match(open, /options\.set\(type, list\)/);
  // Plus de fiche de site retenue seule : reçues puis à télécharger, toutes proposées.
  assert.match(open, /list\.push\(\.\.\.received, \.\.\.toFetch\)/);
  const detail = body(lib, 'function buildPinballFxDetail(');
  assert.match(detail, /openCustom\(\(\) => buildPinballFxChoice\(e\.type\)/);
  const choice = body(lib, 'function buildPinballFxChoice(');
  assert.match(choice, /d\.elements = d\.elements\.map/, 'le choix remplace celui de la fiche');
  assert.match(choice, /Laisser ce média/);
});

test('ajout d’une table de Zen : ses médias s’ouvrent aussitôt, comme une table VPX, et se relisent à l’arrivée des fichiers', () => {
  const lib = src('library.ts');
  const add = body(lib, 'function addPinballFx(');
  // Plus de retour muet à la liste : les médias de la table, où chacun se remplace, se règle, s'enregistre.
  assert.match(add, /medias\.open\(table, \{/);
  assert.match(add, /sheetReturn = \(\) => openZen\(fx\.game, fx\.key\)/, 'la fiche, puis la liste du jeu au retour');
  const fetch = body(lib, 'async function fetchPinballFxMedias(');
  assert.ok((fetch.match(/medias\.refresh\(file/g) ?? []).length >= 2, 'relus quand VPinMediaDB et VPS ont donné, puis au bilan');
  const m = src('library-medias.ts');
  const refresh = body(m, 'function refresh(');
  assert.match(refresh, /ctx\.showing\?\.\(\) !== s\.shown/, 'jamais ramené sur ses médias depuis un autre écran');
  assert.match(body(m, 'function nav('), /s\.shown = build/);
});

test('fiche d’ajout de Zen : le fronton du catalogue de FX3 proposé en dernier, jamais pris d’office, et rangé s’il est choisi', () => {
  const lib = src('library.ts');
  const open = body(lib, 'function openPinballFxDetail(');
  assert.match(open, /source: 'catalog'/);
  assert.ok(open.indexOf("source: 'catalog'") > open.indexOf('list.push(...received, ...toFetch)'), 'après toutes les autres sources');
  assert.match(open, /e\.source !== 'catalog'/, 'pas coché d’office');
  const fetch = body(lib, 'async function fetchPinballFxMedias(');
  assert.match(fetch, /catalog\?\.source === 'catalog'/);
  assert.match(fetch, /placeMissingMedia\(table, [^;]*'Backglass', staged/);
});

test('ajout d’une table de Zen : le choix fait pour chaque média est celui qui arrive', () => {
  const lib = src('library.ts');
  const add = body(lib, 'function addPinballFx(');
  assert.match(add, /fetchPinballFxMedias\(fx, added\.file, ui\.flash, types, picks\)/);
  const fetch = body(lib, 'async function fetchPinballFxMedias(');
  // Chaque type de sa seule source choisie, la variante de VPinMediaDB et la fiche du site comprises.
  assert.match(fetch, /from\('local'\)/);
  assert.match(fetch, /from\('mediadb'\)/);
  assert.match(fetch, /variants/);
  assert.match(fetch, /from\('vps'\)/);
  assert.match(fetch, /from\('site'\)/);
  assert.match(fetch, /fillFromVpsSites\(now, vps, fx\.title, siteTypes, hits\)/);
  const sites = body(lib, 'async function fillFromVpsSites(');
  assert.match(sites, /chosen\?\.get\(type\)/, 'la fiche choisie avant la première venue');
  const download = src('media-download.ts');
  const fill = body(download, 'async function fillMissing(');
  assert.match(fill, /opts\.variants\?\.includes\(v\.file\.url\)/, 'la variante choisie de VPinMediaDB');
});
