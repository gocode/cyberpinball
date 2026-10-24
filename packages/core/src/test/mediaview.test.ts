// Médias dans les fenêtres du menu (T2) : adresses du protocole et dossiers
// autorisés, média de chaque rôle (rotation, DMD ou FullDMD, image du .directb2s
// extraite en tâche de fond), réglage « médias pendant la partie », journal des
// erreurs de lecture, et branchements du rendu (CSP, composant, preload).

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import {
  DEFAULT_MENU_MEDIA_SETTINGS,
  GAME_MEDIA_MODES,
  MenuMedias,
  SHEET_PAGE_TYPES,
  allowedMediaDirs,
  edgeOfRotation,
  isServedMedia,
  loadMenuMediaSettings,
  mediaContentType,
  mediaPathFromUrl,
  mediaUrl,
  menuMediaSettingsFile,
  nextGameMediaMode,
  normalizeMenuMediaSettings,
  saveMenuMediaSettings,
  sheetPages,
} from '../mediaview';
import { MEDIA_TYPES } from '../medias';
import { b2sCacheDir } from '../b2simage';
import type { Cabinet, PhysicalScreen } from '../model';
import { scanTables, type TableEntry } from '../tables';

const APP = path.join(__dirname, '..', '..', '..', '..', 'app');

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  return Buffer.concat([len, Buffer.from(type, 'latin1'), data, Buffer.alloc(4)]);
}

function png(width: number, height: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IEND', Buffer.alloc(0))]);
}

/** .directb2s minimal : une image allumée en base64, coupée comme l'écrit l'éditeur B2S. */
function directb2s(image: Buffer): string {
  const b64 = (image.toString('base64').match(/.{1,76}/g) ?? []).join('&#xD;&#xA;');
  return `<DirectB2SData Version="1.2">\r\n  <Images>\r\n    <BackglassOnImage Value="${b64}" />\r\n  </Images>\r\n</DirectB2SData>\r\n`;
}

interface Borne {
  root: string;
  dataDir: string;
  tables: TableEntry[];
  medias: (table: TableEntry) => string;
}

/** Borne factice : trois tables dans leurs dossiers, des défauts dans <racine>\media. */
function borne(): Borne {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-mediaview-'));
  for (const name of ['Alpha (Williams 1991)', 'Bravo (Bally 1980)', 'Charlie (Stern 2016)']) {
    const folder = path.join(root, 'tables', name);
    fs.mkdirSync(path.join(folder, 'medias'), { recursive: true });
    fs.writeFileSync(path.join(folder, `${name}.vpx`), '');
  }
  fs.mkdirSync(path.join(root, 'media'), { recursive: true });
  const dataDir = path.join(root, 'data');
  return { root, dataDir, tables: scanTables(path.join(root, 'tables')), medias: (t) => path.join(t.folder, 'medias') };
}

function screen(fingerprint: string, widthPx: number, heightPx: number): PhysicalScreen {
  return { fingerprint, strength: 'strong', label: fingerprint, widthPx, heightPx, widthCm: 0, heightCm: 0 };
}

function cabinet(dmd: [number, number]): Cabinet {
  return {
    version: 1,
    screens: [screen('pf', 3840, 2160), screen('bg', 1920, 1080), screen('dmd', ...dmd)],
    roles: { playfield: 'pf', backglass: 'bg', dmd: 'dmd' },
    vpx: { iniPath: '' },
    updatedAt: '',
  };
}

// ---------------------------------------------------------------------------

test('adresse du protocole : aller-retour fidèle, même avec accents, espaces, # et %', () => {
  const b = borne();
  const dir = b.medias(b.tables[0]!);
  const file = path.join(dir, '(Backglass) Été #1 100% (Williams 1991).png');
  fs.writeFileSync(file, png(4, 3));
  const url = mediaUrl(file);
  assert.match(url, /^cyber-media:\/\/fichier\/[^/]+\?v=/);
  assert.equal(mediaPathFromUrl(url), path.resolve(file));
  // Autre protocole, autre hôte, chemin relatif : pas une adresse de média.
  assert.equal(mediaPathFromUrl(url.replace('cyber-media:', 'file:')), undefined);
  assert.equal(mediaPathFromUrl(url.replace('//fichier/', '//autre/')), undefined);
  assert.equal(mediaPathFromUrl(`cyber-media://fichier/${encodeURIComponent('medias\\x.png')}`), undefined);
  assert.equal(mediaPathFromUrl('pas une adresse'), undefined);
});

test("l'adresse change quand le fichier est remplacé : pas d'image périmée gardée par Chromium", () => {
  const b = borne();
  const file = path.join(b.medias(b.tables[0]!), '(Wheel) Alpha (Williams 1991).png');
  fs.writeFileSync(file, png(4, 3));
  const before = mediaUrl(file);
  fs.writeFileSync(file, png(40, 30));
  fs.utimesSync(file, new Date(), new Date(Date.now() + 5000));
  assert.notEqual(mediaUrl(file), before);
});

test('protocole : seulement des médias, directement dans un dossier autorisé', () => {
  const b = borne();
  const allowed = allowedMediaDirs({ root: b.root, dataDir: b.dataDir, tables: b.tables });
  const medias = b.medias(b.tables[1]!);
  assert.ok(isServedMedia(path.join(medias, '(Playfield) Bravo (Bally 1980).mp4'), allowed));
  assert.ok(isServedMedia(path.join(b.root, 'media', '(Topper).webm'), allowed));
  assert.ok(isServedMedia(path.join(b2sCacheDir(b.dataDir), 'abc-on.png'), allowed));
  // Windows ignore la casse des chemins.
  if (process.platform === 'win32') assert.ok(isServedMedia(path.join(medias.toUpperCase(), 'X.PNG'), allowed));

  const refused = [
    path.join(b.tables[1]!.folder, 'Bravo (Bally 1980).vpx'), // la table elle-même
    path.join(b.tables[1]!.folder, 'x.png'), // à côté de la table, pas dans medias\
    path.join(medias, 'sous-dossier', 'x.png'), // la recherche n'y descend jamais
    `${medias}${path.sep}..${path.sep}..${path.sep}..${path.sep}secret.png`, // sortie par ..
    path.join(medias, 'notes.txt'),
    path.join(medias, 'script.vbs'),
    path.join(medias, 'x.png:flux'), // flux de données alternatif
    path.join(`${medias}2`, 'x.png'), // dossier voisin au nom qui commence pareil
    path.join(b.root, 'data', 'cabinet.json'),
    path.join(b.root, 'app', 'ressources', 'medias', 'logo.png'), // l'application : rien à y servir
    path.join(os.homedir(), 'Pictures', 'photo.jpg'),
    'medias\\x.png',
    '',
  ];
  for (const file of refused) assert.equal(isServedMedia(file, allowed), false, file);
});

test('types de contenu des formats lus', () => {
  assert.equal(mediaContentType('a.MP4'), 'video/mp4');
  assert.equal(mediaContentType('a.webm'), 'video/webm');
  assert.equal(mediaContentType('a.apng'), 'image/apng');
  assert.equal(mediaContentType('a.jpg'), 'image/jpeg');
  assert.equal(mediaContentType('a.xyz'), 'application/octet-stream');
});

test('fond du playfield : cover, tourné pour que les flippers du média tombent sur ceux de la borne', () => {
  const b = borne();
  const [alpha, bravo] = b.tables;
  // Alpha : paysage (flippers à droite, comme VPinMediaDB) ; Bravo : portrait (flippers en bas).
  fs.writeFileSync(path.join(b.medias(alpha!), '(Playfield) Alpha (Williams 1991).png'), png(1920, 1080));
  fs.writeFileSync(path.join(b.medias(bravo!), '(Playfield) Bravo (Bally 1980).png'), png(1080, 1920));
  const expected: [0 | 90 | 180 | 270, number, number][] = [
    // rotation du menu (bord des flippers), paysage, portrait
    [0, 90, 0],
    [90, 180, 90],
    [180, 270, 180],
    [270, 0, 270],
  ];
  for (const [rotation, landscape, portrait] of expected) {
    const m = new MenuMedias({ root: b.root, dataDir: b.dataDir, rotation, b2s: false });
    const a = m.roleMedia(alpha!, 'playfield');
    assert.equal(a.fit, 'cover');
    assert.equal(a.kind, 'image');
    assert.equal(a.rotation, landscape, `paysage, flippers ${edgeOfRotation(rotation)}`);
    assert.equal(a.orient, undefined, 'dimensions lues : rien à recalculer dans le rendu');
    assert.equal(m.roleMedia(bravo!, 'playfield').rotation, portrait, `portrait, flippers ${edgeOfRotation(rotation)}`);
  }
});

test('média du playfield aux dimensions illisibles : le rendu recalcule la rotation', () => {
  const b = borne();
  const alpha = b.tables[0]!;
  fs.writeFileSync(path.join(b.medias(alpha), '(Playfield) Alpha (Williams 1991).mp4'), Buffer.from('pas une vidéo'));
  const view = new MenuMedias({ root: b.root, dataDir: b.dataDir, rotation: 90, b2s: false }).roleMedia(alpha, 'playfield');
  assert.equal(view.kind, 'video');
  assert.deepEqual(view.orient, { edge: 'left', halfTurn: false });
});

test('écrans annexes : contain, jamais tournés ; DMD ou FullDMD selon les proportions de son écran', () => {
  const b = borne();
  const alpha = b.tables[0]!;
  fs.writeFileSync(path.join(b.medias(alpha), '(Backglass) Alpha (Williams 1991).mp4'), Buffer.alloc(16));
  fs.writeFileSync(path.join(b.medias(alpha), '(DMD) Alpha (Williams 1991).png'), png(512, 128));
  fs.writeFileSync(path.join(b.medias(alpha), '(FullDMD) Alpha (Williams 1991).png'), png(1920, 1080));
  const wide = new MenuMedias({ root: b.root, dataDir: b.dataDir, rotation: 90, cabinet: cabinet([1920, 1080]), b2s: false });
  const back = wide.roleMedia(alpha, 'backglass');
  assert.deepEqual([back.kind, back.fit, back.rotation, back.source], ['video', 'contain', 0, 'vpx-name']);
  assert.equal(wide.roleMedia(alpha, 'dmd').type, 'FullDMD');
  const narrow = new MenuMedias({ root: b.root, dataDir: b.dataDir, rotation: 0, cabinet: cabinet([1024, 256]), b2s: false });
  assert.equal(narrow.roleMedia(alpha, 'dmd').type, 'DMD');
  assert.match(narrow.roleMedia(alpha, 'dmd').url ?? '', /\(DMD\)%20Alpha/);
});

test('sans média : le repli intégré du catalogue, avec titre, fabricant et année pour le dessiner', () => {
  const b = borne();
  const charlie = b.tables[2]!;
  const m = new MenuMedias({ root: b.root, dataDir: b.dataDir, rotation: 0, b2s: false });
  const views = (['playfield', 'backglass', 'dmd', 'topper'] as const).map((r) => m.roleMedia(charlie, r));
  assert.deepEqual(
    views.map((v) => [v.source, v.fallback, v.url]),
    [
      ['fallback', 'playfield-gradient', undefined],
      ['fallback', 'backglass-card', undefined],
      ['fallback', 'dmd-dots', undefined],
      ['fallback', 'topper-logo', undefined],
    ],
  );
  assert.deepEqual(views[1]!.card, { title: 'Charlie', manufacturer: 'Stern', year: 2016 });
  assert.equal(m.wheel(charlie), undefined);
});

test('défauts de la borne dans <racine>\\media, et logo du jeu pour la liste', () => {
  const b = borne();
  const [alpha, bravo] = b.tables;
  fs.writeFileSync(path.join(b.root, 'media', '(Topper).png'), png(1920, 540));
  fs.writeFileSync(path.join(b.medias(alpha!), '(Wheel) Alpha (Williams 1991).png'), png(500, 500));
  // Un son n'a rien à afficher.
  fs.writeFileSync(path.join(b.medias(bravo!), '(Wheel) Bravo (Bally 1980).mp3'), Buffer.alloc(8));
  const m = new MenuMedias({ root: b.root, dataDir: b.dataDir, rotation: 0, b2s: false });
  assert.equal(m.roleMedia(bravo!, 'topper').source, 'default');
  assert.match(m.wheel(alpha!) ?? '', /\(Wheel\)%20Alpha/);
  assert.equal(m.wheel(bravo!), undefined);
});

test('médias ajoutés : visibles après invalidate (tables relues) ou après la durée de vie', () => {
  const b = borne();
  const alpha = b.tables[0]!;
  let now = 0;
  const m = new MenuMedias({ root: b.root, dataDir: b.dataDir, rotation: 0, b2s: false, now: () => now, ttlMs: 10_000 });
  assert.equal(m.roleMedia(alpha, 'backglass').source, 'fallback');
  fs.writeFileSync(path.join(b.medias(alpha), '(Backglass) Alpha (Williams 1991).png'), png(10, 10));
  assert.equal(m.roleMedia(alpha, 'backglass').source, 'fallback', 'mémorisé');
  m.invalidate();
  assert.equal(m.roleMedia(alpha, 'backglass').source, 'vpx-name');
  fs.rmSync(path.join(b.medias(alpha), '(Backglass) Alpha (Williams 1991).png'));
  now = 10_001;
  assert.equal(m.roleMedia(alpha, 'backglass').source, 'fallback');
});

test("image du .directb2s : extraite en tâche de fond, une table à la fois, puis montrée sur le fronton", async () => {
  const b = borne();
  const [alpha, bravo] = b.tables;
  fs.writeFileSync(path.join(alpha!.folder, 'Alpha (Williams 1991).directb2s'), directb2s(png(1280, 1024)));
  fs.writeFileSync(path.join(bravo!.folder, 'Bravo (Bally 1980).directb2s'), directb2s(png(1024, 768)));
  let changes = 0;
  const m = new MenuMedias({ root: b.root, dataDir: b.dataDir, rotation: 0, onChange: () => changes++ });
  assert.equal(m.roleMedia(alpha!, 'backglass').source, 'fallback', "pas encore extraite : le repli d'abord");
  m.roleMedia(bravo!, 'backglass');
  assert.equal(m.pendingB2s, 2);
  for (let i = 0; i < 200 && m.pendingB2s; i++) await new Promise((r) => setTimeout(r, 10));
  assert.equal(m.pendingB2s, 0);
  assert.equal(changes, 2, 'chaque image extraite redemande un rendu');
  const view = m.roleMedia(alpha!, 'backglass');
  assert.equal(view.source, 'b2s');
  const file = mediaPathFromUrl(view.url!)!;
  assert.ok(isServedMedia(file, m.allowedDirs(b.tables)), "l'image en cache est servie par le protocole");
  // Une table sans .directb2s ne déclenche rien.
  m.roleMedia(b.tables[2]!, 'backglass');
  assert.equal(m.pendingB2s, 0);
});

test('prospectus et règles : pages dans l’ordre, servies par le protocole ; sans fichier, aucune (la fiche dessine le repli)', () => {
  const b = borne();
  const [alpha, bravo] = b.tables;
  const dir = b.medias(alpha!);
  fs.writeFileSync(path.join(dir, '(GameInfo) Alpha (Williams 1991) 2.png'), png(10, 10));
  fs.writeFileSync(path.join(dir, '(GameInfo) Alpha (Williams 1991).png'), png(10, 10));
  fs.writeFileSync(path.join(dir, '(GameHelp) Alpha (Williams 1991).mp4'), Buffer.alloc(8));
  // Un son n'est pas une page.
  fs.writeFileSync(path.join(dir, '(GameHelp) Alpha (Williams 1991) 2.mp3'), Buffer.alloc(8));
  const info = sheetPages(alpha!, b.root, b.dataDir, 'GameInfo');
  assert.deepEqual(
    info.map((p) => [p.kind, path.basename(mediaPathFromUrl(p.url)!)]),
    [
      ['image', '(GameInfo) Alpha (Williams 1991).png'],
      ['image', '(GameInfo) Alpha (Williams 1991) 2.png'],
    ],
  );
  const dirs = allowedMediaDirs({ root: b.root, dataDir: b.dataDir, tables: b.tables });
  assert.ok(info.every((p) => isServedMedia(mediaPathFromUrl(p.url)!, dirs)));
  assert.deepEqual(sheetPages(alpha!, b.root, b.dataDir, 'GameHelp').map((p) => p.kind), ['video']);
  assert.deepEqual(sheetPages(bravo!, b.root, b.dataDir, 'GameInfo'), []);
});

// Le catalogue dit « depuis la fiche » (moment sheet) : la fiche doit l'offrir. Ce test fixe
// l'invariant qui manquait quand le gestionnaire annonçait des pages que rien ne montrait.
test('tout type montré sur la fiche y a son écran : Prospectus et Règles', () => {
  assert.deepEqual([...SHEET_PAGE_TYPES].sort(), MEDIA_TYPES.filter((t) => t.moments.includes('sheet')).map((t) => t.type).sort());
  const library = fs.readFileSync(path.join(APP, 'src', 'library.ts'), 'utf8');
  assert.match(library, /\.\.\.SHEET_PAGE_TYPES\.map\(\(type\) => pagesAction\(table, type\)\)/, 'actions de la fiche');
  assert.match(fs.readFileSync(path.join(APP, 'renderer', 'library.js'), 'utf8'), /function renderPages\(/, 'rendu des pages');
});

test('médias pendant la partie : figés par défaut, enregistrés, valeur inconnue ignorée', () => {
  const b = borne();
  assert.deepEqual(loadMenuMediaSettings(b.dataDir), DEFAULT_MENU_MEDIA_SETTINGS);
  assert.equal(DEFAULT_MENU_MEDIA_SETTINGS.game, 'still');
  // Présentation du menu : roue Médaillons par défaut, chaque roue ou la liste si choisie,
  // l'ancienne roue unique (« wheel ») devient la roue par défaut, une valeur inconnue aussi.
  assert.equal(DEFAULT_MENU_MEDIA_SETTINGS.menuLayout, 'medaillons');
  for (const layout of ['medaillons', 'bandeau', 'minimal', 'arche', 'list'] as const) {
    assert.equal(normalizeMenuMediaSettings({ menuLayout: layout }).menuLayout, layout);
  }
  // Roues retirées (versions précédentes) : la roue par défaut.
  for (const old of ['wheel', 'reflet', 'ruban', 'orbite-haut', 'orbite-bas']) assert.equal(normalizeMenuMediaSettings({ menuLayout: old }).menuLayout, 'medaillons');
  assert.equal(normalizeMenuMediaSettings({ menuLayout: 'carrousel' }).menuLayout, 'medaillons');
  saveMenuMediaSettings(b.dataDir, { ...DEFAULT_MENU_MEDIA_SETTINGS, game: 'animated' });
  assert.equal(loadMenuMediaSettings(b.dataDir).game, 'animated');
  fs.writeFileSync(menuMediaSettingsFile(b.dataDir), '﻿{"game":"clignotant"}');
  assert.equal(loadMenuMediaSettings(b.dataDir).game, 'still');
  // Start fait le tour des trois choix.
  let mode = GAME_MEDIA_MODES[0]!;
  const seen = new Set<string>();
  for (let i = 0; i < GAME_MEDIA_MODES.length; i++) seen.add((mode = nextGameMediaMode(mode)));
  assert.deepEqual([...seen].sort(), ['animated', 'off', 'still']);
});

test('rendu : CSP ouverte au seul protocole des médias, composant chargé, erreurs remontées', () => {
  const html = fs.readFileSync(path.join(APP, 'renderer', 'frontend.html'), 'utf8');
  const csp = /Content-Security-Policy" content="([^"]+)"/.exec(html)?.[1] ?? '';
  assert.match(csp, /img-src 'self' cyber-media:/);
  assert.match(csp, /media-src cyber-media:(;|$)/);
  assert.doesNotMatch(csp, /file:|\*/, 'aucun accès direct au disque');
  assert.ok(html.indexOf('media.js') > 0 && html.indexOf('media.js') < html.indexOf('frontend.js'), 'media.js avant frontend.js');
  // Replis intégrés (T3) : sans eux, un écran sans média n'affiche que le titre.
  assert.ok(html.indexOf('fallback.js') > 0 && html.indexOf('fallback.js') < html.indexOf('frontend.js'), 'fallback.js avant frontend.js');
  assert.ok(html.indexOf('fallback.css') > 0, 'fallback.css chargé');
  const media = fs.readFileSync(path.join(APP, 'renderer', 'media.js'), 'utf8');
  assert.match(media, /window\.cyber\?\.mediaError/);
  const preload = fs.readFileSync(path.join(APP, 'src', 'preload.ts'), 'utf8');
  assert.match(preload, /mediaError: .*ipcRenderer\.send\('media-error'/);
  // Aucun fichier du rendu ne lit le disque par file:// (tout passe par le protocole).
  for (const name of fs.readdirSync(path.join(APP, 'renderer')).filter((f) => f.endsWith('.js'))) {
    assert.doesNotMatch(fs.readFileSync(path.join(APP, 'renderer', name), 'utf8'), /file:\/\//, name);
  }
  // Ni adresse file:// fabriquée par le processus principal : les aperçus de « Médias du jeu »
  // en file:// étaient noirs pour les vidéos (media-src cyber-media: seulement).
  for (const name of fs.readdirSync(path.join(APP, 'src')).filter((f) => f.endsWith('.ts'))) {
    assert.doesNotMatch(fs.readFileSync(path.join(APP, 'src', name), 'utf8'), /pathToFileURL|file:\/\//, name);
  }
});
