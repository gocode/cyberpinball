// Frontons des jeux de Zen autour de la partie (app/src/frontend.ts, playPinballFx) : mode borne de Pinball FX
// (Settings.ini), DMD virtuel de dmdext, image de la table de FX3. Pinball FX reçoit Table_<n>.png, le fronton de
// la table, et sa fenêtre du fronton est allumée sur l'écran du fronton quand l'image existe (27/11/2026).
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

test('mode borne de Pinball FX : activé, DMD sur la bande 4:1 du FullDMD, fronton du jeu sur l’écran du fronton, le reste gardé', () => {
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
  // Pendant la partie, le jeu affiche son propre fronton, comme tous les jeux (décision du 27/11/2026) : sa fenêtre
  // du fronton allumée et posée sur l'écran du fronton. Éteinte, l'écran ne montrait que la carte texte de la table.
  assert.equal(doc.get('BackglassWindow', 'Enabled'), 'True');
  assert.deepEqual(['PositionX', 'PositionY', 'Width', 'Height'].map((k) => doc.get('BackglassWindow', k)), ['5760', '101', '1920', '1080']);
  const alone = IniDocument.parse(pinballFxSettingsWithCabinet(SETTINGS, { backglass: layout.backglass! })!);
  assert.equal(alone.get('BackglassWindow', 'Enabled'), 'True', 'même sans DMD');
  assert.equal(alone.get('BackglassWindow', 'PositionX'), '5760');
  // Borne sans écran du fronton : la fenêtre du jeu éteinte, jamais posée au hasard.
  const noBackglass = IniDocument.parse(pinballFxSettingsWithCabinet(SETTINGS, { dmd: layout.dmd! })!);
  assert.equal(noBackglass.get('BackglassWindow', 'Enabled'), 'False');
  assert.equal(noBackglass.get('BackglassWindow', 'PositionX'), '0', 'position non touchée');
  // Rien d'autre ne bouge : numéro d'écran, DMD externe, mise à l'échelle, marges, mise en forme, fins de ligne.
  assert.equal(doc.get('BackglassWindow', 'MonitorNumber'), '1');
  assert.equal(doc.get('BackglassWindow', 'ExternalDevice'), 'False');
  assert.equal(doc.get('BackglassWindow', 'ScaleType'), 'BestFit');
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
  assert.match(raw.subarray(2).toString('utf16le'), /\[BackglassWindow\]\r\nEnabled=True\r\nPriority=1\r\nMonitorNumber=1\r\nPositionX=1920\r\n/);
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
  // Les écrans où le jeu dessine (fronton, DMD) lui sont laissés : son processus est suivi par watchOccupied.
  assert.match(body, /watchOccupied\([^;]*pids: \(\) => \[game\.pid/);
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

interface BackglassModule {
  placePinballFxBackglass(install: { cabinetDir: string }, tableId: number, source: string | undefined, toPng?: (file: string) => Buffer): { result: 'placed' | 'present' | 'no-media' | 'failed'; target: string; reason?: string };
  placePinballFxHomeBackglass(install: { cabinetDir: string }, source: string | undefined, toPng?: (f: string) => Buffer, blank?: () => Buffer): { result: string; target: string };
}

test('fronton de Pinball FX : Table_<numéro>.png déposé, converti en PNG, jamais remplacé', () => {
  // Le jeu n'a pas de fronton à lui : sans cette image, sa fenêtre écrit le chemin cherché (PinCab, 27/11/2026).
  const app = require(path.join(REPO_ROOT, 'app', 'dist', 'pinballfx-backglass.js')) as BackglassModule;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-pfx-fronton-'));
  const cabinetDir = path.join(root, 'PinballFX', 'Mods', 'Cabinet');
  const medias = path.join(root, 'medias');
  fs.mkdirSync(medias, { recursive: true });
  fs.writeFileSync(path.join(medias, '(Backglass) AFM.png'), 'PNG-AFM');
  fs.writeFileSync(path.join(medias, '(Backglass) BTTF.jpg'), 'JPG-BTTF');
  fs.writeFileSync(path.join(medias, '(Backglass) Video.mp4'), 'MP4');
  const converted: string[] = [];
  const toPng = (file: string) => (converted.push(file), Buffer.from('PNG-CONVERTI'));
  const afm = app.placePinballFxBackglass({ cabinetDir }, 119, path.join(medias, '(Backglass) AFM.png'), toPng);
  assert.deepEqual([afm.result, path.basename(afm.target)], ['placed', 'Table_119.png']);
  assert.equal(fs.readFileSync(afm.target, 'utf8'), 'PNG-AFM', 'un PNG copié tel quel');
  const bttf = app.placePinballFxBackglass({ cabinetDir }, 97, path.join(medias, '(Backglass) BTTF.jpg'), toPng);
  assert.equal(fs.readFileSync(bttf.target, 'utf8'), 'PNG-CONVERTI', 'autre format converti : le jeu ne lit que le PNG');
  assert.deepEqual(converted.map((f) => path.basename(f)), ['(Backglass) BTTF.jpg']);
  fs.writeFileSync(afm.target, 'IMAGE-DU-JOUEUR');
  assert.equal(app.placePinballFxBackglass({ cabinetDir }, 119, path.join(medias, '(Backglass) AFM.png'), toPng).result, 'present');
  assert.equal(fs.readFileSync(afm.target, 'utf8'), 'IMAGE-DU-JOUEUR', 'jamais remplacée');
  assert.equal(app.placePinballFxBackglass({ cabinetDir }, 5, undefined, toPng).result, 'no-media');
  assert.equal(app.placePinballFxBackglass({ cabinetDir }, 6, path.join(medias, '(Backglass) Video.mp4'), toPng).result, 'no-media');
  assert.equal(app.placePinballFxBackglass({ cabinetDir }, 7, path.join(medias, '(Backglass) BTTF.jpg'), () => Buffer.alloc(0)).result, 'failed');
  assert.ok(!fs.existsSync(path.join(cabinetDir, 'Table_6.png')) && !fs.existsSync(path.join(cabinetDir, 'Table_7.png')));
});

test('fronton des menus de Pinball FX (PFX.png) : défaut de la borne, sinon noir, jamais remplacé', () => {
  const app = require(path.join(REPO_ROOT, 'app', 'dist', 'pinballfx-backglass.js')) as BackglassModule;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-pfx-menus-'));
  const cabinetDir = path.join(root, 'PinballFX', 'Mods', 'Cabinet');
  const black = () => Buffer.from('PNG-NOIR');
  const first = app.placePinballFxHomeBackglass({ cabinetDir }, undefined, undefined, black);
  assert.deepEqual([first.result, path.basename(first.target)], ['placed', 'PFX.png']);
  assert.equal(fs.readFileSync(first.target, 'utf8'), 'PNG-NOIR');
  fs.writeFileSync(first.target, 'IMAGE-DU-JOUEUR');
  assert.equal(app.placePinballFxHomeBackglass({ cabinetDir }, undefined, undefined, black).result, 'present');
  fs.rmSync(first.target);
  const def = path.join(root, '(Backglass).png');
  fs.writeFileSync(def, 'PNG-DEFAUT');
  app.placePinballFxHomeBackglass({ cabinetDir }, def, undefined, black);
  assert.equal(fs.readFileSync(first.target, 'utf8'), 'PNG-DEFAUT');
});

test('frontend.ts : fronton de Pinball FX déposé d’après le média de la table, fenêtre du jeu allumée seulement avec son image', () => {
  const src = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'frontend.ts'), 'utf8');
  const body = src.slice(src.indexOf('async function playPinballFx('));
  const at = body.indexOf('placePinballFxBackglass(');
  assert.ok(at > 0 && at < body.indexOf('applyPinballFxCabinet(') && at < body.indexOf('launchPinballFx('), 'avant les réglages et le lancement');
  assert.match(body.slice(at - 400, at), /resolveMedia\(table, loc\.root, 'Backglass'\)/);
  assert.match(body.slice(at - 400, at), /source !== 'default'/, 'le média de la table, pas l’affichage par défaut');
  // Sans image de la table, pas de zone du fronton donnée au mode borne : la fenêtre du jeu reste éteinte.
  assert.match(body, /tableImage = placed\.result === 'placed' \|\| placed\.result === 'present'/);
  assert.match(body, /const backglassRect = tableImage \? rectOf\('backglass'\) : undefined/);
});
