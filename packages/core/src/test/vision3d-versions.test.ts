// Nos plugins VPX (packages/vpx-vision3d : Vision3D, CyberPinball, CyberPinballDmd) pour chaque API de plugins de VPX :
// 10.8.1 (révision 5436, installé par Cyber Pinball) et 10.9.0 (28919b5df, mode d'essai). Même source, un jeu
// d'en-têtes et un jeu de DLL par version (CMakeLists.txt, compat/vpx-compat.h), chaque VPX recevant le sien
// (app/src/vpx-plugins.ts, vpxPluginSet).

import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { defaultControllerSetting, vpxCalibrationActions, vpxMappingsFor } from '../manettes';
import { REPO_ROOT } from './i18n-scan';

const PLUGINS = path.join(REPO_ROOT, 'packages', 'vpx-vision3d');
const read = (...p: string[]) => fs.readFileSync(path.join(PLUGINS, ...p), 'utf8');
const HEADERS = ['MsgPlugin.h', 'VPXPlugin.h', 'ControllerPlugin.h', 'LoggingPlugin.h'];

/** Les jeux d'en-têtes de VPX (vendor/vpx-<version>). */
function headerSets(): string[] {
  return fs
    .readdirSync(path.join(PLUGINS, 'vendor'))
    .filter((d) => /^vpx-\d+\.\d+\.\d+$/.test(d))
    .map((d) => d.slice('vpx-'.length));
}

/** Les #define d'un jeu d'en-têtes : nom → valeur (texte brut, commentaire retiré). */
function defines(version: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const h of HEADERS)
    for (const m of read('vendor', `vpx-${version}`, h).matchAll(/^\s*#define\s+(\w+)(?:\s+([^\r\n]*))?$/gm)) out.set(m[1]!, (m[2] ?? '').replace(/\/\/.*$/, '').trim());
  return out;
}

/** Les sources de nos plugins et de leurs bancs qui parlent à VPX. */
function pluginSources(): { file: string; text: string }[] {
  const files = [
    ...fs.readdirSync(path.join(PLUGINS, 'src')).map((f) => path.join('src', f)),
    path.join('compat', 'vpx-compat.h'),
    path.join('test', 'banc.cpp'),
  ];
  return files.map((file) => ({ file, text: read(file) }));
}

test('plugins VPX : un jeu d’en-têtes par version, chacun construit (10.8.1 et 10.9.0)', () => {
  const sets = headerSets();
  assert.deepEqual(sets, ['10.8.1', '10.9.0']);
  const cmake = read('CMakeLists.txt');
  for (const v of sets) {
    for (const h of [...HEADERS, 'PROVENANCE.txt']) assert.ok(fs.existsSync(path.join(PLUGINS, 'vendor', `vpx-${v}`, h)), `vendor/vpx-${v}/${h}`);
    const [major, minor, patch] = v.split('.').map(Number) as [number, number, number];
    const api = major * 10000 + minor * 100 + patch; // CYBERPINBALL_VPX_API : 100801, 100900
    assert.match(cmake, new RegExp(`plugins_vpx_pour\\("${v.replace(/\./g, '\\.')}" ${api}\\)`), `CMakeLists.txt : jeu ${v} jamais construit`);
  }
  // 10.9.0 : pris au commit 28919b5df (jamais « master », qui bouge).
  assert.match(read('vendor', 'vpx-10.9.0', 'PROVENANCE.txt'), /commit 28919b5dfa0b1543338264fa89f9e8abe70ed6ec/);
  // Les en-têtes eux-mêmes disent leur version : FOLDER (réglages) et le champ version de l'API n'existent qu'en 10.9.0.
  assert.ok(!defines('10.8.1').has('MSGPI_SETTING_TYPE_FOLDER') && defines('10.9.0').has('MSGPI_SETTING_TYPE_FOLDER'));
  assert.doesNotMatch(read('vendor', 'vpx-10.8.1', 'VPXPlugin.h'), /int version;/);
  assert.match(read('vendor', 'vpx-10.9.0', 'VPXPlugin.h'), /typedef struct VPXPluginAPI\s*\{\s*int version;/);
  // La couche de compatibilité, commune aux trois plugins : hors de src/ (vpx-own-plugins.ts), sans réglage.
  const compat = read('compat', 'vpx-compat.h');
  assert.doesNotMatch(compat, /MSGPI_\w+_SETTING|RegisterSetting/);
  // Le décodage de CYBERPINBALL_VPX_API rend la version que la pause compare à l'exécutable de VPX (versionDeVpx).
  assert.match(compat, /API_MAJEURE = CYBERPINBALL_VPX_API \/ 10000;/);
  assert.match(compat, /API_MINEURE = \(CYBERPINBALL_VPX_API \/ 100\) % 100;/);
  assert.match(compat, /static_assert\(API_MAJEURE == 10 && \(API_MINEURE == 8 \|\| API_MINEURE == 9\)/);
  for (const s of ['vision3d.cpp', 'cyberpinball.cpp', 'dmd-suivi.cpp']) assert.match(read('src', s), /#include "vpx-compat\.h"/, s);
});

// Invariant : chaque message (et chaque constante de VPX) qu'emploient nos plugins existe dans les en-têtes de
// chaque version ; aucun nom de message écrit en dur (10.9.0 les suffixe d'une version, « OnGameStart:1 »).
test('plugins VPX : chaque message employé par nos plugins existe dans les en-têtes de chaque version', () => {
  const used = new Set<string>();
  for (const { file, text } of pluginSources()) {
    for (const m of text.matchAll(/\b((?:VPXPI|CTLPI|MSGPI_EVT|LOGPI|VPXWINDOW|VPXACTION|VPXTEXFMT|VPXDMDStyle)_\w+)\b/g)) used.add(m[1]!);
    // Un nom de message toujours par sa macro : jamais GetMsgID(…, "Nom").
    assert.doesNotMatch(text, /GetMsgID\([^,()]+,\s*"/, `${file} : nom de message écrit en dur`);
  }
  assert.ok(used.has('VPXPI_EVT_ON_GAME_START') && used.has('CTLPI_DISPLAY_GET_SRC_MSG') && used.has('VPXPI_MSG_GET_AUX_RENDERER'));
  for (const v of headerSets()) {
    const defs = defines(v);
    const enums = HEADERS.map((h) => read('vendor', `vpx-${v}`, h)).join('\n');
    for (const name of used) {
      const known = defs.has(name) || new RegExp(`\\b${name}\\b\\s*(?:=[^,\\n]*)?,`).test(enums);
      assert.ok(known, `${name} : absent des en-têtes de VPX ${v}`);
      // Messages : sans version en 10.8.1, « :1 » en 10.9.0 (convention de MsgPlugin.h).
      const value = defs.get(name);
      if (value && /^"/.test(value) && /_(MSG|EVT)_|_MSG$/.test(name)) assert.ok(v === '10.8.1' ? !value.includes(':') : /:\d+"$/.test(value), `${name} = ${value} (VPX ${v})`);
    }
  }
});

test('pause dans le casque : table des actions de chaque version, et les mêmes numéros dans Cyber Pinball', () => {
  const pause = read('src', 'pause.h');
  const table = (n: string) => {
    const body = new RegExp(`inline constexpr const char\\* ${n}\\[\\] = \\{([\\s\\S]*?)\\};`).exec(pause)?.[1] ?? '';
    return [...body.replace(/\/\/[^\n]*/g, '').matchAll(/"(\w+)"/g)].map((m) => m[1]!);
  };
  const tables = { '10.8.1': table('ACTIONS_VPX_1081'), '10.9.0': table('ACTIONS_VPX_1090') };
  // InputManager::CreateInputActions : 56 actions en 10.8.1 (5436), 58 en 10.9.0 (28919b5df).
  assert.equal(tables['10.8.1'].length, 56);
  assert.equal(tables['10.9.0'].length, 58);
  assert.deepEqual(tables['10.9.0'].slice(56), ['MouseLeft', 'MouseRight']);
  for (const [v, names] of Object.entries(tables)) {
    const ids = vpxCalibrationActions(v);
    assert.ok(ids, `vpxCalibrationActions(${v})`);
    assert.equal(names.indexOf('Custom1'), ids.Custom1, `Custom1 en ${v}`);
    assert.equal(names.indexOf('Custom2'), ids.Custom2, `Custom2 en ${v}`);
    // Chaque action que Cyber Pinball lie dans l'INI (« Mapping.<nom> ») existe dans cette version.
    for (const key of Object.keys(vpxMappingsFor(defaultControllerSetting('touch')))) assert.ok(names.includes(key), `Mapping.${key} : pas une action de VPX ${v}`);
  }
  // Même règle que la table d'origine (commandeVpx1081), par le nom : Pause, ExitGame, InGameUI aux mêmes rangs.
  for (const name of ['Pause', 'ExitGame', 'InGameUI', 'Credit1', 'Start']) assert.equal(tables['10.9.0'].indexOf(name), tables['10.8.1'].indexOf(name), name);
  // Les formes de version qu'emploie Cyber Pinball ; une version sans table : undefined (plugin passif).
  assert.deepEqual(vpxCalibrationActions('10.9.0-6948'), { Custom1: 52, Custom2: 53 });
  assert.deepEqual(vpxCalibrationActions('10.8.1.5436'), { Custom1: 52, Custom2: 53 });
  assert.deepEqual(vpxCalibrationActions(), { Custom1: 52, Custom2: 53 });
  assert.equal(vpxCalibrationActions('10.9.1'), undefined);
  assert.equal(vpxCalibrationActions('inconnue'), undefined);
  // Le plugin reconnaît les versions des tables, et elles seules (pause.h, versionVpx).
  assert.match(pause, /if \(majeure == 10 && mineure == 8 && correctif == 1\)\s*return VersionVpx::V10_8_1;/);
  assert.match(pause, /if \(majeure == 10 && mineure == 9 && correctif == 0\)\s*return VersionVpx::V10_9_0;/);
});

test('rendu des scores : « ScoreView » (10.8.1) et « Nixie » (10.9.0) valent l’un pour l’autre dans nos plugins', () => {
  const compat = read('compat', 'vpx-compat.h');
  assert.match(compat, /std::strcmp\(id, "ScoreView"\) == 0 \|\| std::strcmp\(id, "Nixie"\) == 0/);
  for (const s of ['cyberpinball.cpp', 'dmd-suivi.cpp']) assert.doesNotMatch(read('src', s), /strcmp\([^)]*"(ScoreView|Nixie)"/, `${s} : comparer par vpx::estRenduScores ou vpx::memeRendu`);
  assert.match(read('src', 'cyberpinball.cpp'), /vpx::memeRendu\(s\.id\.c_str\(\), entrees\[i\]\.id\)/);
});

test('copie des plugins : le jeu de DLL de la version de VPX visée', () => {
  type Spec = { folder: string; dll: string; cfg: string };
  const { vpxPluginSet, vpxPluginSetDir, vpxVersionOfDir, vpxPluginFiles, installVpxPlugin, VPX_PLUGIN_SETS, PAUSE_PLUGIN } = require(path.join(REPO_ROOT, 'app', 'dist', 'vpx-plugins.js')) as {
    vpxPluginSet(version: string | undefined): string;
    vpxPluginSetDir(set: string): string;
    vpxVersionOfDir(dir: string): string | undefined;
    vpxPluginFiles(spec: Spec, appDir: string, set?: string): { dll: string; cfg: string } | undefined;
    installVpxPlugin(spec: Spec, vpxDir: string, appDir: string, vpxVersion?: string): string;
    VPX_PLUGIN_SETS: readonly string[];
    PAUSE_PLUGIN: Spec;
  };
  assert.deepEqual([...VPX_PLUGIN_SETS], headerSets());
  for (const v of ['10.9.0-6948', '10.9.0.6948', '10.9', '10.9.3', ' 10.9.0', 'v10.9.0']) assert.equal(vpxPluginSet(v), '10.9.0', v);
  for (const v of ['10.8.1-5436', '10.8.1.5436', '10.8.0', '10.10.0', '10.90', '11.9.0', '', 'courant', undefined]) assert.equal(vpxPluginSet(v), '10.8.1', String(v));
  assert.equal(vpxPluginSetDir('10.8.1'), '');
  assert.equal(vpxPluginSetDir('10.9.0'), 'vpx-10.9.0');
  assert.equal(vpxVersionOfDir('D:\\CyberPinball\\emulators\\vpx\\10.9.0-6948'), '10.9.0');
  assert.equal(vpxVersionOfDir('D:\\CyberPinball\\emulators\\vpx\\10.8.1-5436'), '10.8.1');
  assert.equal(vpxVersionOfDir('D:\\CyberPinball\\emulators\\vpx\\current'), undefined);

  // Application fabriquée : natif\<dossier>\<dll> (10.8.1), natif\<dossier>\vpx-10.9.0\<dll>, un plugin.cfg commun.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-vpx-plugins-'));
  try {
    const app = path.join(root, 'app');
    const natif = path.join(app, 'natif', PAUSE_PLUGIN.folder);
    fs.mkdirSync(path.join(natif, 'vpx-10.9.0'), { recursive: true });
    fs.writeFileSync(path.join(natif, 'plugin.cfg'), 'cfg');
    fs.writeFileSync(path.join(natif, PAUSE_PLUGIN.dll), 'dll 10.8.1');
    fs.writeFileSync(path.join(natif, 'vpx-10.9.0', PAUSE_PLUGIN.dll), 'dll 10.9.0');
    assert.equal(vpxPluginFiles(PAUSE_PLUGIN, app)?.dll, path.join(natif, PAUSE_PLUGIN.dll));
    assert.equal(vpxPluginFiles(PAUSE_PLUGIN, app, '10.9.0')?.dll, path.join(natif, 'vpx-10.9.0', PAUSE_PLUGIN.dll));
    assert.equal(vpxPluginFiles(PAUSE_PLUGIN, app, '10.9.0')?.cfg, path.join(natif, 'plugin.cfg'));
    const installed = (vpxDir: string) => fs.readFileSync(path.join(vpxDir, 'plugins', PAUSE_PLUGIN.folder, PAUSE_PLUGIN.dll), 'utf8');
    // La version par le nom du dossier de VPX, ou donnée.
    const vpx109 = path.join(root, 'vpx', '10.9.0-6948');
    assert.equal(installVpxPlugin(PAUSE_PLUGIN, vpx109, app), 'installed');
    assert.equal(installed(vpx109), 'dll 10.9.0');
    assert.equal(installVpxPlugin(PAUSE_PLUGIN, vpx109, app), 'up-to-date');
    const vpx1081 = path.join(root, 'vpx', '10.8.1-5436');
    assert.equal(installVpxPlugin(PAUSE_PLUGIN, vpx1081, app), 'installed');
    assert.equal(installed(vpx1081), 'dll 10.8.1');
    const other = path.join(root, 'vpx', 'current');
    assert.equal(installVpxPlugin(PAUSE_PLUGIN, other, app, '10.9.0.6948'), 'installed');
    assert.equal(installed(other), 'dll 10.9.0');
    // Passé à l'autre version : l'autre DLL remplace la première.
    assert.equal(installVpxPlugin(PAUSE_PLUGIN, other, app, '10.8.1'), 'installed');
    assert.equal(installed(other), 'dll 10.8.1');
    // Jeu absent : jamais la DLL d'une autre API à sa place.
    fs.rmSync(path.join(natif, 'vpx-10.9.0'), { recursive: true });
    const vpx109bis = path.join(root, 'vpx2', '10.9.0-6948');
    assert.equal(installVpxPlugin(PAUSE_PLUGIN, vpx109bis, app), 'missing');
    assert.ok(!fs.existsSync(path.join(vpx109bis, 'plugins')));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }

  // Fabrication : chaque jeu de DLL construit est livré (scripts/fabriquer.mjs, scripts/vision3d.mjs).
  assert.match(fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'vision3d.mjs'), 'utf8'), /'10\.9\.0': path\.join\(build, 'Release', 'vpx-10\.9\.0'\)/);
  assert.match(fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'fabriquer.mjs'), 'utf8'), /for \(const \[version, built\] of Object\.entries\(VPX_PLUGIN_BUILDS\)\)/);
});

test('DLL construites : chaque jeu parle à sa version de VPX (noms des messages), s’il est construit', (t) => {
  const release = path.join(REPO_ROOT, 'build', 'vision3d', 'Release');
  const dlls = ['plugin-vision3d64.dll', 'plugin-cyberpinball64.dll', 'plugin-cyberpinballdmd64.dll'];
  if (!dlls.every((d) => fs.existsSync(path.join(release, d)) && fs.existsSync(path.join(release, 'vpx-10.9.0', d)))) return t.skip('plugins pas construits (node scripts/vision3d.mjs)');
  for (const d of dlls) {
    const old = fs.readFileSync(path.join(release, d)).toString('latin1');
    const neu = fs.readFileSync(path.join(release, 'vpx-10.9.0', d)).toString('latin1');
    assert.ok(old.includes('OnGameStart\0') && !old.includes('OnGameStart:1'), `${d} (10.8.1)`);
    assert.ok(neu.includes('OnGameStart:1\0'), `${d} (10.9.0)`);
  }
});
