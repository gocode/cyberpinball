// Frontons des jeux de Zen autour de la partie (app/src/frontend.ts, playPinballFx) : mode borne de Pinball FX
// (Settings.ini), DMD virtuel de dmdext, image de la table de FX3. Pinball FX ne reçoit plus d'image de fronton
// (décision du 20/11/2026 : sa fenêtre du fronton est fermée, celle de Cyber Pinball montre le média de la table).
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { applyPinballFxCabinet, IniDocument, PINBALLFX_CABINET_SETTINGS, pinballFxCabinetLayout, pinballFxSettingsWithCabinet } from '..';
import { REPO_ROOT } from './i18n-scan';

// Settings.ini relevé sur un PinCab le 20/11/2026 (mode borne jamais réglé : désactivé, fenêtres par défaut).
const SETTINGS = [
  '[DotMatrixWindow]',
  'Enabled=True',
  'Priority=2',
  'MonitorNumber=0',
  'PositionX=25',
  'PositionY=25',
  'Width=512',
  'Height=128',
  'ExternalDevice=True',
  'DotMatrixSize=Medium',
  'Rotated=False',
  'Padding=(Left=0.000000,Top=0.000000,Right=0.000000,Bottom=0.000000)',
  '',
  '[BackglassWindow]',
  'Enabled=True',
  'Priority=1',
  'MonitorNumber=1',
  'PositionX=0',
  'PositionY=0',
  'Width=1920',
  'Height=1080',
  'ExternalDevice=False',
  'ScaleType=BestFit',
  '',
  '[General]',
  'CabinetEnabled=False',
  '',
].join('\r\n');

test('mode borne de Pinball FX : activé, DMD sur la bande 4:1 du FullDMD, fronton du jeu éteint, le reste gardé', () => {
  // Borne de l'essai : FullDMD 1920 × 1080 en (3840, 90), fronton en (5760, 101).
  const layout = pinballFxCabinetLayout({ dmd: { x: 3840, y: 90, width: 1920, height: 1080 }, backglass: { x: 5760, y: 101, width: 1920, height: 1080 } }, 'fulldmd');
  assert.deepEqual(layout.dmd, { x: 3840, y: 390, width: 1920, height: 480 }, 'les valeurs validées sur le PinCab pour FX3');
  assert.deepEqual(layout.backglass, { x: 5760, y: 101, width: 1920, height: 1080 });
  // DMD seul (écran 4:1) : toute sa zone.
  assert.deepEqual(pinballFxCabinetLayout({ dmd: { x: 0, y: -300, width: 1280, height: 320 } }, 'dmd').dmd, { x: 0, y: -300, width: 1280, height: 320 });
  const next = pinballFxSettingsWithCabinet(SETTINGS, layout)!;
  assert.ok(next);
  const doc = IniDocument.parse(next);
  assert.equal(doc.get('General', 'CabinetEnabled'), 'True');
  assert.deepEqual(['PositionX', 'PositionY', 'Width', 'Height'].map((k) => doc.get('DotMatrixWindow', k)), ['3840', '390', '1920', '480']);
  // Une seule image sur le fronton, le média choisi à l'ajout de la table (retour d'un joueur, 20/11/2026) :
  // la fenêtre du fronton du jeu ne se superpose plus à celle de Cyber Pinball.
  assert.equal(doc.get('BackglassWindow', 'Enabled'), 'False');
  assert.equal(pinballFxSettingsWithCabinet(SETTINGS, { backglass: layout.backglass! })?.includes('[BackglassWindow]'), true);
  assert.equal(IniDocument.parse(pinballFxSettingsWithCabinet(SETTINGS, { backglass: layout.backglass! })!).get('BackglassWindow', 'Enabled'), 'False', 'même sans DMD');
  // Rien d'autre ne bouge : numéro d'écran, DMD externe, marges, mise en forme, fins de ligne.
  assert.equal(doc.get('DotMatrixWindow', 'MonitorNumber'), '0');
  assert.equal(doc.get('DotMatrixWindow', 'ExternalDevice'), 'True');
  assert.match(next, /\r\nPadding=\(Left=0\.000000,Top=0\.000000,Right=0\.000000,Bottom=0\.000000\)\r\n/);
  assert.match(next, /\r\nPositionX=3840\r\n/);
  assert.ok(!/[^\r]\n/.test(next), 'CRLF gardé');
  assert.equal(pinballFxSettingsWithCabinet(next, layout), undefined, 'déjà réglé : rien à écrire');
  assert.equal(pinballFxSettingsWithCabinet(SETTINGS, {}), undefined, 'borne sans DMD ni fronton : rien');
});

test('DMD virtuel de dmdext chargé par Pinball FX : posé sur l’écran DMD, reconnu à son titre, pas le plateau', () => {
  // Essai du 20/11/2026 : DmdDevice.ini le plaçait sur le fronton (5828, 322), par-dessus son image.
  const app = require(path.join(REPO_ROOT, 'app', 'dist', 'futurepinball-play.js')) as {
    placeVirtualDmd(dmd: { x: number; y: number; width: number; height: number } | undefined, windows: () => object[], set: (w: { title: string }, r: object) => boolean): { x: number; y: number; width: number; height: number } | undefined;
  };
  const win = (title: string, rect: object) => ({ title, visible: true, pid: 7548, rect });
  const fullDmd = { x: 3840, y: 90, width: 1920, height: 1080 };
  const moved: [string, object][] = [];
  const set = (w: { title: string }, r: object) => (moved.push([w.title, r]), true);
  const placed = app.placeVirtualDmd(fullDmd, () => [win('PinballFX  ', { x: 0, y: 0, width: 3840, height: 2160 }), win('Virtual DMD', { x: 5828, y: 322, width: 1788, height: 436 })], set);
  assert.deepEqual(placed, { x: 3840, y: 390, width: 1920, height: 480 }, 'la bande 4:1 du FullDMD, comme le DMD de VPX');
  assert.deepEqual(moved.map(([t]) => t), ['Virtual DMD'], 'jamais le plateau du jeu');
  // Déjà sur l'écran DMD (réglage du joueur) : gardé ; pas de DMD virtuel, ou pas d'écran DMD : rien.
  moved.length = 0;
  assert.equal(app.placeVirtualDmd(fullDmd, () => [win('Virtual DMD', { x: 3900, y: 400, width: 1500, height: 375 })], set), undefined);
  assert.equal(app.placeVirtualDmd(fullDmd, () => [win('PinballFX  ', { x: 0, y: 0, width: 3840, height: 2160 })], set), undefined);
  assert.equal(app.placeVirtualDmd(undefined, () => [win('Virtual DMD', { x: 5828, y: 322, width: 1788, height: 436 })], set), undefined);
  assert.deepEqual(moved, []);
});

test('mode borne de Pinball FX : fichier écrit seulement s’il existe, UTF-16 gardé', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-pfx-ini-'));
  const layout = { backglass: { x: 1920, y: 0, width: 1920, height: 1080 } };
  assert.equal(applyPinballFxCabinet(dir, layout), undefined, 'pas de Settings.ini : le jeu le crée, on ne l’invente pas');
  assert.ok(!fs.existsSync(path.join(dir, PINBALLFX_CABINET_SETTINGS)));
  const file = path.join(dir, PINBALLFX_CABINET_SETTINGS);
  fs.writeFileSync(file, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(SETTINGS, 'utf16le')]));
  assert.equal(applyPinballFxCabinet(dir, layout), file);
  const raw = fs.readFileSync(file);
  assert.deepEqual([...raw.subarray(0, 2)], [0xff, 0xfe]);
  assert.match(raw.subarray(2).toString('utf16le'), /\[BackglassWindow\]\r\nEnabled=False\r\n/);
  assert.equal(applyPinballFxCabinet(dir, layout), undefined);
});

test('frontend.ts : le mode borne de Pinball FX est écrit avant le lancement, d’après les zones des écrans', () => {
  const src = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'frontend.ts'), 'utf8');
  const body = src.slice(src.indexOf('async function playPinballFx('));
  const at = body.indexOf('applyPinballFxCabinet(');
  assert.ok(at > 0 && at < body.indexOf('launchPinballFx('));
  assert.match(body.slice(at - 1500, at), /roleRects\.find/);
  // Pendant la partie : le DMD virtuel de dmdext suivi et posé sur l'écran DMD.
  const watch = body.indexOf('placeVirtualDmd(');
  assert.ok(watch > 0 && body.slice(watch - 400, watch).includes("zenKey === 'pinballfx'"));
  assert.match(body, /clearInterval\(virtualDmdWatch\)/, 'arrêté à la fin de la partie');
});

test('frontend.ts : l’image de la table de FX3 est posée avant le lancement, et devient le fronton de la table s’il lui manque', () => {
  const src = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'frontend.ts'), 'utf8');
  const body = src.slice(src.indexOf('async function playPinballFx('));
  const at = body.indexOf('preparePinballFx3Backglass(');
  assert.ok(at > 0 && at < body.indexOf('launchPinballFx('), 'avant le lancement');
  assert.match(body.slice(at - 400, at), /resolveMedia\(table, loc\.root, 'Backglass'\)/);
  assert.match(body.slice(at, at + 1500), /placeMissingMedia\(table, .*'Backglass', ready\.image/);
  // Après la partie, en arrière-plan : les images de toutes les tables installées (FX3 en montre
  // d'autres pendant ses transitions).
  const after = body.indexOf('await game.done');
  const all = body.indexOf('fetchAllPinballFx3Backglasses(');
  assert.ok(all > after && after > 0, 'après la partie, jamais avant');
  assert.match(body.slice(all, all + 200), /downloads: library\.downloads\.manager/, 'suivi dans les téléchargements');
});

test('Pinball FX : plus d’image de fronton déposée pour le jeu (Table_<n>.png, PFX.png), celle de Cyber Pinball reste', () => {
  // 20/11/2026 : une table choisie dans le jeu restait sans image et le jeu écrivait le chemin cherché.
  const src = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'frontend.ts'), 'utf8');
  assert.ok(!/placePinballFx(Home)?Backglass\(/.test(src));
  const mod = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'pinballfx-backglass.ts'), 'utf8');
  assert.ok(!/Table_|PFX\.png['"]/.test(mod.replace(/^\/\/.*$/gm, '')), 'plus de nom de fichier de Pinball FX hors des commentaires');
});
