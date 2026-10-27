// Fiches des fichiers sur leur site (sitefiles.ts) et galerie des choix d'un fichier : une
// liste de frontons, tables, ROM, PuP-Packs, couleurs ou sons ne revient jamais à des noms
// seuls quand la source donne un aperçu et une popularité (« Fronton (.directb2s) : au
// choix » de The Matrix, 27/10/2026). Pages témoins relevées en visiteur le 27/10/2026.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { setLanguage } from '../i18n';
import { fileRefOf, parseSiteFile, siteFileRef, sortWebFiles, webFileTile, type SiteFileInfo } from '../sitefiles';
import type { VpsTableFile } from '../vps';

const PAGES = path.join(__dirname, '..', '..', 'test-pages');
const APP = path.join(__dirname, '..', '..', '..', '..', 'app', 'src');
const page = (name: string) => fs.readFileSync(path.join(PAGES, name), 'utf8');

setLanguage('fr');

const MATRIX_B2S: VpsTableFile = {
  id: 'b2s-burt',
  authors: ['BurtMacklin'],
  version: '1.0.0',
  updatedAt: Date.UTC(2023, 4, 7),
  imgUrl: 'https://virtualpinballspreadsheet.github.io/vps-db/img/b2s-burt.webp',
  urls: [{ url: 'https://vpuniverse.com/files/file/13671-matrix-2screen-b2s/' }],
};

test('adresse d’une fiche : VPUniverse et VPForums reconnus, sans session ; les autres liens non', () => {
  assert.deepEqual(siteFileRef('https://vpuniverse.com/files/file/13671-matrix-2screen-b2s/?tab=comments'), { site: 'vpuniverse', id: '13671', url: 'https://vpuniverse.com/files/file/13671-matrix-2screen-b2s/' });
  assert.deepEqual(siteFileRef('https://www.vpforums.org/index.php?s=abc&app=downloads&showfile=13911'), { site: 'vpforums', id: '13911', url: 'https://www.vpforums.org/index.php?app=downloads&showfile=13911' });
  assert.equal(siteFileRef('https://www.dropbox.com/s/x/music.zip'), undefined);
  assert.equal(siteFileRef('https://mega.nz/file/abc'), undefined);
  // Lien mort d'abord : la fiche est celle du premier lien vivant.
  assert.equal(fileRefOf({ urls: [{ url: 'https://vpuniverse.com/files/file/1-x/', broken: true }, { url: 'https://www.vpforums.org/index.php?app=downloads&showfile=7' }] })?.id, '7');
});

test('fiche de VPUniverse en visiteur : téléchargements, vues, note, auteur, version, date, taille, capture', () => {
  const ref = siteFileRef(MATRIX_B2S.urls![0]!.url)!;
  const info = parseSiteFile(ref, page('vpuniverse-fiche.html'))!;
  assert.ok(info, 'la page dit le fichier');
  assert.equal(info.title, 'Matrix 2screen b2s');
  assert.deepEqual(info.authors, ['BurtMacklin']);
  assert.equal(info.version, '1.0.0');
  assert.equal(info.category, 'B2S Alternate / Original');
  assert.equal(info.downloads, 298);
  assert.equal(info.views, 1862);
  assert.deepEqual(info.rating, { value: 5, count: 1 });
  assert.equal(info.size, '4.67 MB');
  assert.equal(info.date, '2023-03-21T15:12:12+0000');
  assert.match(info.screenshot ?? '', /^https:\/\/vpuniverse\.com\/screenshots\/.*Matrix2scr\.png/);
  assert.match(info.thumb ?? '', /Matrix2scr\.thumb\.png/);
  // Page sans description (connexion, erreur, autre forme) : rien d'inventé.
  assert.equal(parseSiteFile(ref, '<html><body><a id="elUserSignIn">Sign In</a></body></html>'), undefined);
});

test('fiche de VPForums en visiteur : téléchargements, vues, note des votes, auteurs, dates, capture du fichier seul', () => {
  const ref = siteFileRef('https://www.vpforums.org/index.php?app=downloads&showfile=13911')!;
  const info = parseSiteFile(ref, page('vpforums-fiche.html'))!;
  assert.ok(info, 'la page dit le fichier');
  assert.equal(info.title, 'WMS Medieval Madness FX3 1.0');
  assert.deepEqual(info.authors, ['DDH69', 'Dozer316']);
  assert.equal(info.downloads, 1435);
  assert.equal(info.views, 5504);
  assert.deepEqual(info.rating, { value: 5, count: 8 });
  assert.equal(info.size, '6.5MB');
  assert.equal(info.date, '2018-11-04T05:53:00.000Z');
  // La capture de ce fichier (id=13911), sans identifiant de session ; jamais la vignette d'un autre.
  assert.match(info.screenshot ?? '', /section=screenshot&record=65816&id=13911$/);
  assert.doesNotMatch(info.screenshot ?? '', /[?&]s=/);
  // Sans vote : pas de note ; trois étoiles sur cinq : 3/5.
  const unrated = page('vpforums-fiche.html').replace(/\s8 Votes/, ' 0 Votes');
  assert.equal(parseSiteFile(ref, unrated)!.rating, undefined);
  let n = 0;
  const three = page('vpforums-fiche.html').replace(/\/star\.png' alt='\*' class='rate_img'/g, (m) => (++n > 3 ? "/star_off.png' alt='-' class='rate_img'" : m));
  assert.deepEqual(parseSiteFile(ref, three)!.rating, { value: 3, count: 8 });
  // Formulaire de connexion seul : rien.
  assert.equal(parseSiteFile(ref, "<html><body><form id='login'></form></body></html>"), undefined);
});

test('tuile d’un fichier : aperçu, popularité, auteur, date et version dès que la source les donne', () => {
  const ref = siteFileRef(MATRIX_B2S.urls![0]!.url)!;
  const info = parseSiteFile(ref, page('vpuniverse-fiche.html'))!;
  const tile = webFileTile('b2s', MATRIX_B2S, info);
  assert.equal(tile.title, 'BurtMacklin 1.0.0');
  assert.equal(tile.popularity, '298 téléchargements · 5/5');
  assert.equal(tile.downloads, 298);
  // La vignette de la base VPS d'abord, puis la capture de l'auteur.
  assert.deepEqual(tile.previews.slice(0, 2), [MATRIX_B2S.imgUrl, info.thumb]);
  // Date de la base VPS (stable pendant la lecture des fiches), site ; le détail dit le reste, sans redire la tuile.
  assert.equal(tile.facts, 'le 07/05/2023 · vpuniverse.com');
  assert.equal(webFileTile('b2s', { ...MATRIX_B2S, updatedAt: undefined }, info).facts, 'le 21/03/2023 · vpuniverse.com');
  const detail = tile.detail.join('\n').replace(/ | /g, ' ');
  for (const said of ['par BurtMacklin', 'version 1.0.0', 'note 5/5 sur 1 avis', '1 862 vues', '4.67 MB', 'B2S Alternate / Original']) assert.ok(detail.includes(said), `détail : ${said}\n${detail}`);
  assert.ok(!detail.includes('téléchargements'), detail);
  // Sans vignette VPS (ROM, PuP-Pack, couleurs, sons) : la capture de l'auteur.
  const pup = webFileTile('pup', { ...MATRIX_B2S, imgUrl: undefined }, info);
  assert.deepEqual(pup.previews, [info.thumb, info.screenshot]);
  // Fiche en lecture : le détail le dit ; autre site : il dit qu'il ne donne rien.
  assert.match(webFileTile('b2s', MATRIX_B2S, 'loading').detail.join(' '), /lecture de sa fiche sur vpuniverse\.com/);
  const dropbox = webFileTile('music', { id: 'm', authors: ['X'], urls: [{ url: 'https://www.dropbox.com/s/a/b.zip' }] }, undefined);
  assert.equal(dropbox.popularity, undefined);
  assert.match(dropbox.detail.join(' '), /Dropbox ne dit ni téléchargements ni note/);
});

test('tri des fichiers : conseillé tel quel, popularité (inconnus à la fin), date ; stable', () => {
  const tiles = new Map<string, { date?: number; downloads?: number }>([
    ['a', { date: 3, downloads: 10 }],
    ['b', { date: 5 }],
    ['c', { date: 1, downloads: 300 }],
    ['d', { date: 5, downloads: 10 }],
  ]);
  const ids = ['a', 'b', 'c', 'd'];
  assert.deepEqual(sortWebFiles(ids, 'advised', (x) => tiles.get(x)!), ['a', 'b', 'c', 'd']);
  assert.deepEqual(sortWebFiles(ids, 'popularity', (x) => tiles.get(x)!), ['c', 'a', 'd', 'b']);
  assert.deepEqual(sortWebFiles(ids, 'date', (x) => tiles.get(x)!), ['b', 'd', 'a', 'c']);
});

/**
 * Écrans de l'application : toute liste de fichiers de la base VPS à choisir passe par la
 * galerie des fichiers (file-gallery.ts), qui montre l'aperçu et la popularité. Une liste
 * faite à la main (des actions par fichier, une ligne par fichier) les perdrait sans bruit.
 */
test('aucune liste de fichiers VPS à choisir hors de la galerie des fichiers', () => {
  const offenders: string[] = [];
  for (const name of fs.readdirSync(APP).filter((n) => n.endsWith('.ts') && n !== 'file-gallery.ts')) {
    const lines = fs.readFileSync(path.join(APP, name), 'utf8').split('\n');
    lines.forEach((line, i) => {
      // Une action par fichier d'une liste, qui le récupère : c'est une liste de choix.
      if (/\.map\(/.test(line) && /(fetchFor\(|\bget\(game,|fileTitle\(|versionLabel\()/.test(line) && /\brun:/.test(line)) offenders.push(`${name}:${i + 1}`);
    });
  }
  assert.deepEqual(offenders, [], 'listes de fichiers VPS à passer par fileGallery (app/src/file-gallery.ts)');
  const gallery = fs.readFileSync(path.join(APP, 'file-gallery.ts'), 'utf8');
  // La galerie lit les fiches, montre l'aperçu et la popularité, et dit ce qui manque.
  for (const needed of ['webFileTile(', 'gallery: true', 'popularity', 'FILE_PREVIEW_ASPECT', 'sortWebFiles(']) assert.ok(gallery.includes(needed), needed);
});

/** Une fiche sans rien : ni la popularité ni l'aperçu ne s'inventent. */
test('fiche muette : ni popularité ni aperçu inventés', () => {
  const bare: SiteFileInfo = { site: 'vpuniverse', id: '1', url: 'https://vpuniverse.com/files/file/1-x/' };
  const tile = webFileTile('rom', { id: 'r', version: 't2_l8', urls: [{ url: bare.url }] }, bare);
  assert.equal(tile.title, 't2_l8');
  assert.equal(tile.popularity, undefined);
  assert.deepEqual(tile.previews, []);
  assert.match(tile.detail.join(' '), /Sa fiche ne dit ni téléchargements ni note/);
});
