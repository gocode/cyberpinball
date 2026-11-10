// La pause dans le casque (plugin VPX « CyberPinball ») et le fronton en VR (essai du 10 novembre 2026).

import * as assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { FALLBACK_RENDERER, pauseVrSettings, PAUSE_RENDERER, tableUsesPupCapture, vrNeedsVpxBackglass } from '../vr-profil';

const repo = path.join(__dirname, '..', '..', '..', '..');
const read = (...p: string[]) => fs.readFileSync(path.join(repo, ...p), 'utf8');

test('fronton : la pause en tête des rendus, le fond opaque en dernier, PuP à 100 descendu à 99', () => {
  const ini = '[Backglass]\nPriority.PUP = 100\nPriority.B2S = 50\n\n[ScoreView]\nPriority.PUP = 100\n';
  const settings = pauseVrSettings(ini, { pause: 'Pause', resume: 'Reprendre', quit: 'Quitter' });
  const get = (section: string, key: string) => settings.find((s) => s.section === section && s.key === key)?.value;
  assert.equal(get('Plugin.CyberPinball', 'Enable'), '1');
  assert.equal(get('Plugin.CyberPinball', 'Resume'), 'Reprendre');
  assert.equal(get('Backglass', `Priority.${PAUSE_RENDERER}`), '100');
  assert.equal(get('Backglass', `Priority.${FALLBACK_RENDERER}`), '0');
  assert.equal(get('Backglass', 'Priority.PUP'), '99');
  // B2S (50) et la section ScoreView restent comme ils sont.
  assert.equal(get('Backglass', 'Priority.B2S'), undefined);
  assert.equal(settings.filter((s) => s.section === 'ScoreView').length, 0);
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
  assert.match(cpp, /if \(!pause\.ouverte\(\) && !tenu\)\s*return 0;/);
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

test('plugin : banc de la pause (appui court, choix, appui tenu 1,5 s, annulation), s’il est construit', (t) => {
  const banc = path.join(repo, 'build', 'vision3d', 'Release', 'banc-pause.exe');
  if (!fs.existsSync(banc)) return t.skip('banc pas construit (node scripts/vision3d.mjs)');
  const run = spawnSync(banc, [], { encoding: 'utf8', windowsHide: true });
  assert.equal(run.status, 0, run.stdout);
  assert.match(run.stdout, /tout va bien/);
});
