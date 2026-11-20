// Fronton d'une table de Pinball FX (2023) déposé avant la partie (app/src/pinballfx-backglass.ts) :
// « Table_<numéro>.png » du dossier du mode borne, en PNG, jamais à la place d'une image existante.
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { applyPinballFxCabinet, IniDocument, PINBALLFX_CABINET_SETTINGS, pinballFxCabinetLayout, pinballFxSettingsWithCabinet } from '..';
import { REPO_ROOT } from './i18n-scan';

interface BackglassModule {
  placePinballFxBackglass(
    install: { cabinetDir: string },
    tableId: number,
    source: string | undefined,
    toPng?: (file: string) => Buffer,
  ): { result: 'placed' | 'present' | 'no-media' | 'failed'; target: string; reason?: string };
}

test('fronton de Pinball FX : Table_<numéro>.png déposé, converti en PNG, jamais remplacé', () => {
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

  // Image PNG de la table : copiée telle quelle, dossier du mode borne créé.
  const afm = app.placePinballFxBackglass({ cabinetDir }, 119, path.join(medias, '(Backglass) AFM.png'), toPng);
  assert.deepEqual([afm.result, path.basename(afm.target)], ['placed', 'Table_119.png']);
  assert.equal(fs.readFileSync(afm.target, 'utf8'), 'PNG-AFM');
  // Autre format : converti en PNG (le jeu ne lit que le PNG).
  const bttf = app.placePinballFxBackglass({ cabinetDir }, 97, path.join(medias, '(Backglass) BTTF.jpg'), toPng);
  assert.equal(bttf.result, 'placed');
  assert.equal(fs.readFileSync(bttf.target, 'utf8'), 'PNG-CONVERTI');
  assert.deepEqual(converted.map((f) => path.basename(f)), ['(Backglass) BTTF.jpg']);
  // Déjà là (le joueur, un pack, une partie précédente) : gardée.
  fs.writeFileSync(afm.target, 'IMAGE-DU-JOUEUR');
  assert.equal(app.placePinballFxBackglass({ cabinetDir }, 119, path.join(medias, '(Backglass) AFM.png'), toPng).result, 'present');
  assert.equal(fs.readFileSync(afm.target, 'utf8'), 'IMAGE-DU-JOUEUR');
  // Pas d'image de fronton dans Cyber Pinball, ou une vidéo : rien.
  assert.equal(app.placePinballFxBackglass({ cabinetDir }, 5, undefined, toPng).result, 'no-media');
  assert.equal(app.placePinballFxBackglass({ cabinetDir }, 6, path.join(medias, '(Backglass) Video.mp4'), toPng).result, 'no-media');
  assert.ok(!fs.existsSync(path.join(cabinetDir, 'Table_6.png')));
  // Conversion impossible : rien d'écrit.
  assert.equal(app.placePinballFxBackglass({ cabinetDir }, 7, path.join(medias, '(Backglass) BTTF.jpg'), () => Buffer.alloc(0)).result, 'failed');
  assert.ok(!fs.existsSync(path.join(cabinetDir, 'Table_7.png')));
});

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

test('mode borne de Pinball FX : activé, DMD sur la bande 4:1 du FullDMD, fronton sur son écran, le reste gardé', () => {
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
  assert.deepEqual(['PositionX', 'PositionY', 'Width', 'Height'].map((k) => doc.get('BackglassWindow', k)), ['5760', '101', '1920', '1080']);
  // Rien d'autre ne bouge : numéro d'écran, DMD externe, marges, mise en forme, fins de ligne.
  assert.equal(doc.get('DotMatrixWindow', 'MonitorNumber'), '0');
  assert.equal(doc.get('DotMatrixWindow', 'ExternalDevice'), 'True');
  assert.match(next, /\r\nPadding=\(Left=0\.000000,Top=0\.000000,Right=0\.000000,Bottom=0\.000000\)\r\n/);
  assert.match(next, /\r\nPositionX=3840\r\n/);
  assert.ok(!/[^\r]\n/.test(next), 'CRLF gardé');
  assert.equal(pinballFxSettingsWithCabinet(next, layout), undefined, 'déjà réglé : rien à écrire');
  assert.equal(pinballFxSettingsWithCabinet(SETTINGS, {}), undefined, 'borne sans DMD ni fronton : rien');
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
  assert.match(raw.subarray(2).toString('utf16le'), /\[BackglassWindow\][\s\S]*PositionX=1920/);
  assert.equal(applyPinballFxCabinet(dir, layout), undefined);
});

test('frontend.ts : le mode borne de Pinball FX est écrit avant le lancement, d’après les zones des écrans', () => {
  const src = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'frontend.ts'), 'utf8');
  const body = src.slice(src.indexOf('async function playPinballFx('));
  const at = body.indexOf('applyPinballFxCabinet(');
  assert.ok(at > 0 && at < body.indexOf('launchPinballFx('));
  assert.match(body.slice(at - 600, at), /roleRects\.find/);
});

test('frontend.ts : le fronton de Pinball FX est déposé avant le lancement, d’après le média de la table, pas l’affichage par défaut', () => {
  const src = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'frontend.ts'), 'utf8');
  const body = src.slice(src.indexOf('async function playPinballFx('));
  const at = body.indexOf('placePinballFxBackglass(');
  assert.ok(at > 0 && at < body.indexOf('launchPinballFx('));
  assert.match(body.slice(at - 400, at), /resolveMedia\(table, loc\.root, 'Backglass'\)/);
  assert.match(body.slice(at - 400, at), /source !== 'default'/);
});
