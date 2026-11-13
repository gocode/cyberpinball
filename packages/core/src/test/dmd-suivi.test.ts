// Le DMD qui remplit sa fenêtre redimensionnée en partie : le plugin VPX « CyberPinballDmd » (13 novembre 2026).

import * as assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';

const repo = path.join(__dirname, '..', '..', '..', '..');
const read = (...p: string[]) => fs.readFileSync(path.join(repo, ...p), 'utf8');

test('plugin du DMD : activé dans toutes les parties, installé avant chacune, fabriqué avec l’application', () => {
  const vpx = (JSON.parse(read('packages', 'installer', 'components.json')) as { components: { id: string; adapterSettings?: { enabledPlugins?: string[] } }[] }).components.find((c) => c.id === 'vpx')!;
  assert.ok(vpx.adapterSettings?.enabledPlugins?.includes('CyberPinballDmd'));
  assert.match(read('packages', 'vpx-vision3d', 'cyberpinball-dmd.cfg'), /id = "CyberPinballDmd"[\s\S]*windows\.x64 = "plugin-cyberpinballdmd64\.dll"/);
  assert.match(read('packages', 'vpx-vision3d', 'CMakeLists.txt'), /OUTPUT_NAME "plugin-cyberpinballdmd64"/);
  assert.match(read('app', 'src', 'vpx-plugins.ts'), /DMD_PLUGIN: VpxPluginSpec = \{ folder: 'cyberpinball-dmd', dll: 'plugin-cyberpinballdmd64\.dll', cfg: 'cyberpinball-dmd\.cfg' \}/);
  assert.match(read('app', 'src', 'frontend.ts'), /installVpxPlugin\(DMD_PLUGIN, path\.dirname\(install\.exe\)/);
  assert.match(read('scripts', 'fabriquer.mjs'), /copyFileSync\(path\.join\(VISION3D_SOURCE, 'cyberpinball-dmd\.cfg'\), path\.join\(dmdDir, 'plugin\.cfg'\)\)/);
});

test('plugin du DMD : la taille donnée à SDL, la diffusion, et rien d’autre (ni rendu sans la sonde du banc, ni touche, ni minuterie)', () => {
  const cpp = read('packages', 'vpx-vision3d', 'src', 'dmd-suivi.cpp');
  // Le message que ScoreView écoute pour rechoisir sa mise en page (ScoreView.cpp, OnResChanged).
  assert.match(cpp, /GetMsgID\(CTLPI_NAMESPACE, CTLPI_DISPLAY_ON_SRC_CHG_MSG\)/);
  assert.match(cpp, /msgApi->BroadcastMsg\(endpointId, displaysChangedId, nullptr\)/);
  // La fenêtre de son processus seulement, par son titre.
  assert.match(cpp, /pid != GetCurrentProcessId\(\)/);
  assert.match(cpp, /L"Visual Pinball Score View"/);
  // Aucun rendu annexe hors de la sonde : sans Probe, rien n'est ajouté à la liste de VPX.
  assert.match(cpp, /if \(!msg \|\| !sondeActive_Val \|\| msg->window != VPXWINDOW_ScoreView\)\s*return;/);
  assert.match(cpp, /MSGPI_INT_VAL_SETTING\(sondeActive, "Probe", [^;]*, 0, 1, 0\);/);
  for (const absent of ['VPXPI_EVT_ON_ACTION_CHANGED', 'timeBeginPeriod', 'PushNotification']) assert.ok(!cpp.includes(absent), absent);
  // La taille posée de l'extérieur, donnée à SDL (sa zone cliente ne suit pas seule : WM_NCCALCSIZE d'une fenêtre sans
  // bordure non redimensionnable) ; le seul SetWindowPos ne bouge ni ne redimensionne : il fait recalculer le cadre.
  assert.match(cpp, /sdl\.setWindowSize\(fenetre\.sdl, voulueL, voulueH\)/);
  assert.match(cpp, /"SDL\.window\.win32\.hwnd"/);
  assert.equal(cpp.match(/SetWindowPos\(/g)?.length, 1);
  assert.match(cpp, /SetWindowPos\(hwnd, nullptr, 0, 0, 0, 0, SWP_FRAMECHANGED \| SWP_NOMOVE \| SWP_NOSIZE \| SWP_NOZORDER \| SWP_NOOWNERZORDER \| SWP_NOACTIVATE\)/);
  // SDL n'est appelé que pour un cadre qui diffère de la zone cliente.
  assert.match(cpp, /\(cadreL == l && cadreH == h\)\)\s*return;/);
  // Jamais écrit par Cyber Pinball : la sonde et Follow ne servent qu'au banc.
  for (const file of [['app', 'src', 'frontend.ts'], ['packages', 'core', 'src', 'vpx.ts']]) assert.doesNotMatch(read(...file), /CyberPinballDmd', key: '(Probe|Follow)'/);
});

test('schéma de VPX : chaque source de packages/vpx-vision3d appartient à un seul plugin (ses réglages jamais rangés sous un autre)', () => {
  // Avant le 13 novembre 2026, le schéma lisait toutes les sources du dossier sous Vision3D : régénéré, il aurait
  // rangé les réglages de la pause dans le casque et du DMD sous Vision3D.
  const own = read('packages', 'installer', 'src', 'vpx-own-plugins.ts');
  const listed = [...own.matchAll(/\{ dir: 'vpx-vision3d', cfg: '([^']+)', sources: \[([^\]]*)\] \}/g)].map((m) => ({ cfg: m[1]!, sources: [...m[2]!.matchAll(/'([^']+)'/g)].map((s) => s[1]!) }));
  assert.deepEqual(listed.map((p) => p.cfg), ['plugin.cfg', 'cyberpinball-dmd.cfg']);
  // Hors schéma : la pause dans le casque (cyberpinball.cfg), activée dans l'INI des parties dans le casque seulement.
  const pause = ['src/cyberpinball.cpp', 'src/pause.h', 'src/minuterie.h'];
  const all = fs.readdirSync(path.join(repo, 'packages', 'vpx-vision3d', 'src')).map((f) => `src/${f}`);
  const owners = new Map<string, number>();
  for (const f of [...listed.flatMap((p) => p.sources), ...pause]) owners.set(f, (owners.get(f) ?? 0) + 1);
  for (const f of all) assert.equal(owners.get(f), 1, `${f} : à ranger dans un seul plugin de vpx-own-plugins.ts`);
  for (const f of owners.keys()) assert.ok(all.includes(f), `${f} : listé mais absent`);
});

test('plugin du DMD : banc du suivi (diffusion tout de suite, au plus tous les 0,1 s, confirmée à 0,3 s), s’il est construit', (t) => {
  const banc = path.join(repo, 'build', 'vision3d', 'Release', 'banc-suivi-dmd.exe');
  if (!fs.existsSync(banc)) return t.skip('banc pas construit (node scripts/vision3d.mjs)');
  const run = spawnSync(banc, [], { encoding: 'utf8', windowsHide: true });
  assert.equal(run.status, 0, run.stdout);
  assert.match(run.stdout, /tout va bien/);
});
