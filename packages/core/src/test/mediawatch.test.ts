// Changements de médias et de tables vus sans redémarrer (signalement : logo ajouté à un
// nouveau jeu, absent de la roue jusqu'au redémarrage). Trois maillons : le guet des
// dossiers (mediawatch.ts) prévient le menu ; MenuMedias oublie ce qu'il avait résolu, et
// relit les .directb2s sans faire clignoter le fronton ; la roue du rendu (frontend.js)
// refait le contenu d'une table restée en place quand son logo change.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { MEDIA_WATCH_DEBOUNCE_MS, mediaChangeOf, watchMediaChanges, type MediaChange } from '../mediawatch';
import { MenuMedias, mediaPathFromUrl, mediaUrl } from '../mediaview';
import { scanTables } from '../tables';
import { APP, menuRenderer, menuState } from './menu-renderer';


function png(width: number, height: number): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    return Buffer.concat([len, Buffer.from(type, 'latin1'), data, Buffer.alloc(4)]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IEND', Buffer.alloc(0))]);
}

function directb2s(image: Buffer): string {
  const b64 = (image.toString('base64').match(/.{1,76}/g) ?? []).join('&#xD;&#xA;');
  return `<DirectB2SData Version="1.2">\r\n  <Images>\r\n    <BackglassOnImage Value="${b64}" />\r\n  </Images>\r\n</DirectB2SData>\r\n`;
}

/** Racine de borne avec une table dans son dossier (Alpha), sans aucun média. */
function borne() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-mediawatch-'));
  const folder = path.join(root, 'tables', 'Alpha (Williams 1991)');
  fs.mkdirSync(path.join(folder, 'medias'), { recursive: true });
  fs.writeFileSync(path.join(folder, 'Alpha (Williams 1991).vpx'), Buffer.alloc(8));
  const dataDir = path.join(root, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  return { root, dataDir, folder, medias: path.join(folder, 'medias'), tables: () => scanTables(path.join(root, 'tables')) };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Attend un appel de onChange (le guet est asynchrone), au plus `ms`. */
async function nextChange(seen: ReadonlySet<MediaChange>[], before: number, ms = 5000): Promise<ReadonlySet<MediaChange> | undefined> {
  for (let waited = 0; waited < ms && seen.length <= before; waited += 25) await wait(25);
  return seen[before];
}

test('fichiers changés : ce que chacun demande au menu', () => {
  assert.equal(mediaChangeOf('Alpha\\medias\\(Wheel) Alpha (Williams 1991).png'), 'medias');
  assert.equal(mediaChangeOf('Alpha\\medias\\(Playfield) Alpha.mp4'), 'medias');
  assert.equal(mediaChangeOf('Alpha\\medias\\(Audio) Alpha.mp3'), 'medias');
  assert.equal(mediaChangeOf('Alpha\\Alpha (Williams 1991).directb2s'), 'medias');
  assert.equal(mediaChangeOf('Alpha\\Alpha (Williams 1991).vpx'), 'tables');
  assert.equal(mediaChangeOf('Bravo (Bally 1980)'), 'tables', 'dossier de table ajouté ou renommé');
  assert.equal(mediaChangeOf(null), 'tables', 'évènement sans nom : tout est relu');
  // Ce que VPX écrit à côté de la table pendant la partie ne relance rien.
  assert.equal(mediaChangeOf('Alpha\\Alpha (Williams 1991).ini'), undefined);
  assert.equal(mediaChangeOf('Alpha\\vpx.log'), undefined);
});

test('guet des dossiers : un logo posé dans medias\\ prévient le menu, une rafale ne compte qu’une fois', async () => {
  const b = borne();
  const seen: ReadonlySet<MediaChange>[] = [];
  const watch = watchMediaChanges({ dirs: [path.join(b.root, 'tables'), path.join(b.root, 'media')], onChange: (c) => seen.push(c), debounceMs: 100 });
  try {
    assert.deepEqual(watch.watching, [path.join(b.root, 'tables')], 'dossier absent : pas guetté, pas créé');
    assert.equal(fs.existsSync(path.join(b.root, 'media')), false);
    const wheel = path.join(b.medias, '(Wheel) Alpha (Williams 1991).png');
    // Copie en plusieurs écritures : un seul rendu redemandé.
    fs.writeFileSync(wheel, png(4, 4));
    fs.appendFileSync(wheel, Buffer.alloc(16));
    const first = await nextChange(seen, 0);
    assert.ok(first, 'le guet a vu le logo');
    assert.deepEqual([...first], ['medias']);
    await wait(300);
    assert.equal(seen.length, 1, 'une rafale, un seul appel');

    // Réglages écrits par VPX à côté de la table : rien.
    fs.writeFileSync(path.join(b.folder, 'Alpha (Williams 1991).ini'), '[TableOverride]\n');
    await wait(400);
    assert.equal(seen.length, 1);

    // Nouvelle table : les tables sont relues.
    const bravo = path.join(b.root, 'tables', 'Bravo (Bally 1980)');
    fs.mkdirSync(bravo);
    fs.writeFileSync(path.join(bravo, 'Bravo (Bally 1980).vpx'), Buffer.alloc(8));
    const second = await nextChange(seen, 1);
    assert.ok(second?.has('tables'), 'table ajoutée vue');

    // Dossier des défauts de la borne créé après le démarrage : repris par rearm().
    fs.mkdirSync(path.join(b.root, 'media'));
    watch.rearm();
    assert.equal(watch.watching.length, 2);
    const count = seen.length;
    fs.writeFileSync(path.join(b.root, 'media', '(Topper) defaut.png'), png(4, 4));
    assert.ok((await nextChange(seen, count))?.has('medias'), 'défaut de la borne vu');
  } finally {
    watch.close();
  }
  assert.ok(MEDIA_WATCH_DEBOUNCE_MS <= 1000, 'le menu suit en moins d’une seconde');
});

test('après un changement de média, le menu donne le nouveau fichier (adresse nouvelle), de chaque type', () => {
  const b = borne();
  const m = new MenuMedias({ root: b.root, dataDir: b.dataDir, rotation: 0, b2s: false });
  const [alpha] = b.tables();
  assert.equal(m.wheel(alpha!), undefined, 'pas encore de logo : le titre');
  assert.equal(m.roleMedia(alpha!, 'backglass').url, undefined);
  const wheel = path.join(b.medias, '(Wheel) Alpha (Williams 1991).png');
  fs.writeFileSync(wheel, png(4, 4));
  fs.writeFileSync(path.join(b.medias, '(Backglass) Alpha (Williams 1991).png'), png(8, 6));
  fs.writeFileSync(path.join(b.medias, '(Audio) Alpha (Williams 1991).mp3'), Buffer.alloc(8));
  // Ce que fait le menu à l'appel du guet.
  m.invalidate();
  const first = m.wheel(alpha!);
  assert.ok(first, 'logo ajouté : dans la roue sans redémarrer');
  assert.equal(mediaPathFromUrl(first), path.resolve(wheel));
  assert.ok(m.roleMedia(alpha!, 'backglass').url, 'fronton ajouté');
  assert.ok(m.sound(alpha!, 'Audio'), 'musique ajoutée');
  // Remplacé sous le même nom : nouvelle adresse, le cache de Chromium ne rend pas l'ancien.
  fs.writeFileSync(wheel, png(6, 6));
  fs.utimesSync(wheel, new Date(), new Date(Date.now() + 5000));
  m.invalidate();
  const replaced = m.wheel(alpha!);
  assert.notEqual(replaced, first);
  assert.equal(replaced, mediaUrl(wheel));
  // Supprimé : de nouveau le titre.
  fs.rmSync(wheel);
  m.invalidate();
  assert.equal(m.wheel(alpha!), undefined);
});

test('.directb2s ajouté après le démarrage : trouvé après invalidate ; relu sans repli intercalé', async () => {
  const b = borne();
  let changes = 0;
  const m = new MenuMedias({ root: b.root, dataDir: b.dataDir, rotation: 0, onChange: () => changes++ });
  const [alpha] = b.tables();
  assert.equal(m.roleMedia(alpha!, 'backglass').source, 'fallback');
  await wait(50);
  const b2s = path.join(b.folder, 'Alpha (Williams 1991).directb2s');
  fs.writeFileSync(b2s, directb2s(png(1280, 1024)));
  m.invalidate();
  m.roleMedia(alpha!, 'backglass');
  for (let i = 0; i < 200 && m.pendingB2s; i++) await wait(10);
  assert.equal(changes, 1, 'image extraite : rendu redemandé');
  const extracted = m.roleMedia(alpha!, 'backglass');
  assert.equal(extracted.source, 'b2s');

  // Autre média changé : le .directb2s est relu, l'image reste montrée pendant la relecture.
  m.invalidate();
  assert.equal(m.roleMedia(alpha!, 'backglass').source, 'b2s', 'pas de repli pendant la relecture');
  for (let i = 0; i < 200 && m.pendingB2s; i++) await wait(10);
  assert.equal(changes, 1, 'même image : aucun rendu de plus');

  // .directb2s remplacé : nouvelle image.
  fs.writeFileSync(b2s, directb2s(png(1024, 768)));
  fs.utimesSync(b2s, new Date(), new Date(Date.now() + 5000));
  m.invalidate();
  m.roleMedia(alpha!, 'backglass');
  for (let i = 0; i < 200 && m.pendingB2s; i++) await wait(10);
  assert.equal(changes, 2);
  assert.notEqual(m.roleMedia(alpha!, 'backglass').url, extracted.url);
});

test('roue : le logo ajouté à une table déjà dans la roue s’affiche aussitôt, à la même place', async () => {
  const { document, send } = menuRenderer();
  const item = (title: string) =>
    [...document.querySelectorAll('.wheel-item')].find((n) => n.querySelector('.wheel-name')?.textContent === title || n.querySelector('img')?.getAttribute('src')?.includes(encodeURIComponent(title)));
  const url = (name: string, v: string) => `cyber-media://fichier/${encodeURIComponent(`D:\\T\\${name}\\medias\\(Wheel) ${name}.png`)}?v=${v}`;

  send(menuState({ 'A.vpx': undefined, 'Nouveau.vpx': undefined, 'C.vpx': url('C', '1') }));
  const before = item('Nouveau.vpx');
  assert.ok(before, 'la nouvelle table est dans la roue, avec son titre');
  assert.equal(before.querySelector('img'), null);
  const place = before.getAttribute('style');

  // Logo affecté dans « Médias du jeu » : le menu renvoie le même état, avec l'adresse du logo.
  send(menuState({ 'A.vpx': undefined, 'Nouveau.vpx': url('Nouveau', '1'), 'C.vpx': url('C', '1') }));
  await wait(10);
  const after = [...document.querySelectorAll('.wheel-item')];
  assert.equal(after.length, 3, 'aucune place ajoutée ni retirée');
  assert.ok(after.includes(before), 'même élément : la roue ne saute pas');
  assert.equal(before.querySelector('img.wheel-img')?.getAttribute('src'), url('Nouveau', '1'), 'logo affiché sans redémarrer');
  assert.equal(before.querySelector('.wheel-name'), null, 'le titre a laissé la place au logo');
  assert.equal(before.getAttribute('style'), place, 'même place dans la roue');

  // Logo remplacé (nouvelle adresse), puis retiré : suivi aussi.
  send(menuState({ 'A.vpx': undefined, 'Nouveau.vpx': url('Nouveau', '2'), 'C.vpx': url('C', '1') }));
  await wait(10);
  assert.equal(before.querySelector('img.wheel-img')?.getAttribute('src'), url('Nouveau', '2'));
  send(menuState({ 'A.vpx': undefined, 'Nouveau.vpx': undefined, 'C.vpx': url('C', '1') }, { 'Nouveau.vpx': 'Nouveau nom' }));
  await wait(10);
  assert.equal(before.querySelector('img'), null);
  assert.equal(before.querySelector('.wheel-name')?.textContent, 'Nouveau nom', 'table renommée : nouveau titre');
});

test('menu : le guet des dossiers est branché sur la relecture des tables et des médias', () => {
  const source = fs.readFileSync(path.join(APP, 'src', 'frontend.ts'), 'utf8');
  assert.match(source, /watchMediaChanges\(\{[\s\S]*?dirs: \[layout\.tables, layout\.media\][\s\S]*?reloadTables\(\)[\s\S]*?medias\?\.invalidate\(\)[\s\S]*?broadcast\(\)/);
  assert.match(source, /function reloadTables[\s\S]*?mediaWatch\?\.rearm\(\)/, 'dossiers créés depuis le démarrage : guettés');
  assert.match(source, /before-quit[\s\S]*?mediaWatch\?\.close\(\)/);
});
