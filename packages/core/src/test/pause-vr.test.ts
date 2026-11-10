// La pause dans le casque (plugin VPX « CyberPinball ») et le fronton en VR (essai du 10 novembre 2026).

import * as assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { decodePng } from '../png';
import { FALLBACK_RENDERER, pauseVrSettings, PAUSE_RENDERER, tableUsesPupCapture, vrNeedsVpxBackglass, WATCH_RENDERER } from '../vr-profil';

const repo = path.join(__dirname, '..', '..', '..', '..');
const read = (...p: string[]) => fs.readFileSync(path.join(repo, ...p), 'utf8');

test('fronton : la pause en tête des rendus, le fond opaque en dernier, PuP à 100 descendu à 99', () => {
  const ini = '[Backglass]\nPriority.PUP = 100\nPriority.B2S = 50\n\n[ScoreView]\nPriority.PUP = 100\n';
  const settings = pauseVrSettings(ini, { pause: 'Pause', resume: 'Reprendre', quit: 'Quitter' });
  const get = (section: string, key: string) => settings.find((s) => s.section === section && s.key === key)?.value;
  assert.equal(get('Plugin.CyberPinball', 'Enable'), '1');
  assert.equal(get('Plugin.CyberPinball', 'Resume'), 'Reprendre');
  // Le rappel des touches et celui du bouton Pause, seulement s'ils sont donnés.
  assert.equal(get('Plugin.CyberPinball', 'Help'), undefined);
  const withHelp = pauseVrSettings('', { pause: 'Pause', resume: 'Reprendre', quit: 'Quitter', help: 'Joystick : choisir · A : valider', resumeHint: 'B : reprendre' });
  assert.equal(withHelp.find((s) => s.key === 'Help')?.value, 'Joystick : choisir · A : valider');
  assert.equal(withHelp.find((s) => s.key === 'ResumeHint')?.value, 'B : reprendre');
  assert.equal(get('Backglass', `Priority.${PAUSE_RENDERER}`), '100');
  assert.equal(get('Backglass', `Priority.${FALLBACK_RENDERER}`), '0');
  assert.equal(get('Backglass', 'Priority.PUP'), '99');
  // B2S (50) reste comme il est ; ScoreView : la veille en tête, PuP descendu à 99.
  assert.equal(get('Backglass', 'Priority.B2S'), undefined);
  assert.equal(get('ScoreView', `Priority.${WATCH_RENDERER}`), '100');
  assert.equal(get('ScoreView', 'Priority.PUP'), '99');
  assert.equal(get('Topper', `Priority.${WATCH_RENDERER}`), '100');
  // L'ordre des rendus que le plugin cadre : PuP (99) puis B2S (50).
  assert.equal(get('Plugin.CyberPinball', 'Order'), 'PUP,B2S');
});

test('fronton cadré : l’ordre des rendus suit les priorités de VPX, un rendu coupé (priorité négative) en est absent', () => {
  const order = (ini: string) => pauseVrSettings(ini, { pause: 'P', resume: 'R', quit: 'Q' }).find((s) => s.key === 'Order')?.value;
  // Aucune priorité réglée : toutes à 0, l'ordre de chargement des plugins de VPX (B2S avant PuP).
  assert.equal(order(''), 'B2S,PUP');
  assert.equal(order('[Backglass]\nPriority.B2S = -1\nPriority.PUP = 10\n'), 'PUP');
  assert.equal(order('[Backglass]\nPriority.B2S = 80\nPriority.PUP = 10\nPriority.ScoreView = 5\n'), 'B2S,PUP,ScoreView');
  // Nos propres rendus n'y sont jamais.
  assert.doesNotMatch(order('[Backglass]\nPriority.CyberPinball.Pause = 100\n') ?? '', /CyberPinball/);
});

test('plugin : fronton cadré (proportions gardées) et vidéos de PuP que VPX ne dessine pas en VR dessinées à vide', () => {
  const cpp = read('packages', 'vpx-vision3d', 'src', 'cyberpinball.cpp');
  // Hors de la pause, le rendu suivant passe par le cadre ; les coordonnées de sa surface y sont mises à l'échelle, centrées.
  assert.match(cpp, /if \(!pause\.affichee\(t\)\)\s*return dessinerCadre\(ctx, t\);/);
  assert.match(cpp, /const Rect r = cadrer\(cadre\.dedans\.srcWidth, cadre\.dedans\.srcHeight, cadre\.zone\.l, cadre\.zone\.h/);
  for (const fn of ['DrawImage = cadreImage', 'DrawDisplay = cadreAfficheur', 'DrawSegDisplay = cadreSegments']) assert.ok(cpp.includes(`cadre.dedans.${fn};`), fn);
  // PuP pose son écran sur toute sa surface : la forme de son fronton lui est donnée (16:9 par défaut).
  assert.match(cpp, /MSGPI_FLOAT_VAL_SETTING\(pupRatio, "PupRatio"[^;]*1\.7778f\);/);
  // Son de PuP : ScoreView et topper (et le fronton non demandé) dessinés à vide à chaque image, sauf si VPX les dessine.
  assert.match(cpp, /Pompe pompes\[\] = \{ \{ VPXWINDOW_Backglass \}, \{ VPXWINDOW_ScoreView \}, \{ VPXWINDOW_Topper \} \};/);
  assert.match(cpp, /appliquer\(pause\.image\(t, jeu\)\);\s*pomper\(t\);/);
  assert.match(cpp, /if \(t - demandee < 0\.3\)\s*continue;/);
});

test('fronton en VR : celui de VPX ajouté sans pièce VR, ou pour une pièce au fronton capté par PuP sans flasher', () => {
  // The Matrix : pièce VR, capture de PuP (VideoCapWidth), aucun flasher du fronton : vide sans correctif.
  assert.ok(tableUsesPupCapture('VRPupTopper.VideoCapWidth=400\nVRPupTopper.VideoCapHeight=100'));
  assert.ok(!tableUsesPupCapture('Sub Table1_Init : End Sub'));
  assert.equal(vrNeedsVpxBackglass({ room: true, backglassDisplays: 0, pupCapture: true }), true);
  // Pièce VR avec son propre fronton (image, ou flasher en rendu externe) : rien d'ajouté.
  assert.equal(vrNeedsVpxBackglass({ room: true, backglassDisplays: 0, pupCapture: false }), false);
  assert.equal(vrNeedsVpxBackglass({ room: true, backglassDisplays: 1, pupCapture: true }), false);
  // Sans pièce VR : toujours celui de VPX.
  assert.equal(vrNeedsVpxBackglass({ room: false, backglassDisplays: undefined, pupCapture: false }), true);
});

test('plugin : rien hors du casque (jamais en 2D, activé seulement dans l’INI de la partie dans le casque)', () => {
  const cpp = read('packages', 'vpx-vision3d', 'src', 'cyberpinball.cpp');
  // Fenêtre du fronton d'une borne (rendu 2D) : la pause comme le fond rendent la main.
  assert.match(cpp, /int MSGPIAPI dessinerPause\(VPXRenderContext2D\* ctx, void\*\)\s*\{[^}]*if \(!ctx \|\| ctx->is2D \|\| !vpxApi \|\| !enPartie\)\s*return 0;/);
  assert.match(cpp, /int MSGPIAPI dessinerFond\(VPXRenderContext2D\* ctx, void\*\)\s*\{[^}]*if \(!ctx \|\| ctx->is2D \|\| !vpxApi\)\s*return 0;/);
  // Hors de la pause et de l'appui tenu : il rend la main (B2S ou PuP dessinent le fronton).
  assert.match(cpp, /if \(!pause\.affichee\(t\)\)\s*return dessinerCadre\(ctx, t\);/);
  // Activé dans l'INI de la partie dans le casque seulement (prepareVr), jamais dans celui de la borne.
  const frontend = read('app', 'src', 'frontend.ts');
  assert.equal(frontend.match(/pauseSettingsFor\(/g)?.length, 1);
  const prepare = frontend.slice(frontend.indexOf('function prepareVr('), frontend.indexOf('function prepareVr(') + 4000);
  assert.match(prepare, /writeIniSettings\(vr\.ini, pauseSettingsFor\(readTextIfExists\(vr\.ini\)/);
  // Appui tenu de 1,5 s, le même dans le plugin et dans l'application.
  assert.match(read('packages', 'vpx-vision3d', 'src', 'pause.h'), /constexpr double QUIT_HOLD_S = 1\.5;/);
  assert.match(read('app', 'src', 'pause-vr.ts'), /export const QUIT_HOLD_S = 1\.5;/);
  // Fabriqué avec Vision 3D, installé comme lui.
  assert.match(read('scripts', 'fabriquer.mjs'), /copyFileSync\(path\.join\(VISION3D_SOURCE, 'cyberpinball\.cfg'\), path\.join\(pauseDir, 'plugin\.cfg'\)\)/);
  assert.match(read('packages', 'vpx-vision3d', 'cyberpinball.cfg'), /id = "CyberPinball"/);
});

test('plugin : banc de la pause (pause de VPX constatée, joystick, valider, appui tenu 1,5 s, jamais avalés), s’il est construit', (t) => {
  const banc = path.join(repo, 'build', 'vision3d', 'Release', 'banc-pause.exe');
  if (!fs.existsSync(banc)) return t.skip('banc pas construit (node scripts/vision3d.mjs)');
  // Le PNG des captures, écrit par le banc, relu par le décodeur de Cyber Pinball : 3 × 2, couleurs exactes.
  const png = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'banc-pause-')), 'banc.png');
  const run = spawnSync(banc, [png], { encoding: 'utf8', windowsHide: true });
  assert.equal(run.status, 0, run.stdout);
  assert.match(run.stdout, /tout va bien/);
  const image = decodePng(fs.readFileSync(png))!;
  assert.deepEqual([image.width, image.height], [3, 2]);
  assert.deepEqual([...image.data.subarray(0, 8)], [255, 0, 0, 255, 0, 255, 0, 255]);
});
