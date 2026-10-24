// i18n-ignore-file : outil en ligne de commande, ses sorties restent en français.
// npm run vpx-schema -- [version] [--check] [--ini <VPinballX.ini>]
//
// Génère le schéma des réglages d'une version de VPX à partir de son code source :
// télécharge src/core/Settings_properties.inl au commit de cette version (champ
// sourceCommit du manifeste, déduit de l'URL de l'archive s'il manque, puis
// enregistré), ainsi que les en-têtes qui définissent les constantes utilisées
// comme valeurs par défaut, et écrit vpx-settings/<version>.json.
// S'y ajoutent les réglages que les plugins déclarent à leur chargement (dossier
// plugins/ du même commit : plugin.cfg, macros MSGPI_*_SETTING, moteurs de rendu
// des fenêtres annexes), absents de Settings_properties.inl.
//   --check  ne réécrit rien : échoue si le fichier committé diffère du résultat.
//   --ini    compare avec un VPinballX.ini écrit par cette version : VPX y écrit
//            toutes les clés qu'il connaît, chacune doit être dans le schéma.

import * as fs from 'node:fs';
import {
  extractConstants,
  IniDocument,
  parseAncillaryRenderers,
  parsePluginConfig,
  parsePluginSettings,
  parseSettingsProperties,
  pluginEnableSetting,
  rendererPrioritySetting,
  VPX_RENDERER_PRIORITIES,
  VPX_WINDOWS,
  type AncillaryRenderer,
  type AncillaryWindow,
  type PluginInfo,
  type SourceFile,
  type VpxSettingDef,
  type VpxSettingsSchema,
} from '@cyberpinball/core';
import { loadManifest, MANIFEST_FILE, type Component } from './manifest';
import { serializeVpxSettingsSchema, vpxSettingsSchemaFile } from './vpx-settings-schema';

const REPOSITORY = 'vpinball/vpinball';
const SETTINGS_FILE = 'src/core/Settings_properties.inl';

/** En-têtes où sont définies les constantes des valeurs par défaut (relevés au commit af26b2d93). */
const CONSTANT_HEADERS = [
  'src/core/stdafx.h', // DEFAULT_SECURITY_LEVEL, EDITOR_BG_WIDTH
  'src/core/def.h', // M_PI
  'src/physics/physconst.h', // DEFAULT_TABLE_*
  'src/core/vpinball.idl', // énumérations des éléments (GateWireW, DecalImage, TriggerWireA…)
];

const PLUGINS_DIR = 'plugins';

/**
 * Fenêtres sur lesquelles chaque moteur de rendu se propose : c'est le code de son
 * gestionnaire de GetAncillaryRenderer qui en décide (relevé au commit af26b2d93).
 * Un moteur trouvé dans le code mais absent d'ici fait échouer la génération.
 */
const RENDERER_WINDOWS: Record<string, AncillaryWindow[]> = {
  B2S: ['Backglass', 'ScoreView'], // plugins/b2s/B2SServer.cpp, B2SServer::OnGetRenderer
  B2SLegacy: ['Backglass'], // plugins/b2slegacy/Server.cpp, Server::OnGetRendererStatic
  B2SLegacyDMD: ['ScoreView'], // idem
  PUP: ['Backglass', 'ScoreView', 'Topper'], // plugins/pup/PUPManager.cpp, PUPManager::OnGetRenderer
  ScoreView: ['ScoreView'], // plugins/scoreview/ScoreViewPlugin.cpp, OnGetRenderer
};

/** VPX s'inscrit lui-même comme plugin « vpx » et reçoit donc [Plugin.vpx] Enable (src/core/VPXPluginAPIImpl.cpp). */
const CORE_PLUGIN: PluginInfo = { id: 'vpx', name: 'VPX' };

/** Téléchargements simultanés depuis raw.githubusercontent.com. */
const PARALLEL_DOWNLOADS = 16;

/** Le schéma décrit le build Windows de bureau : g_isMobile, g_isAndroid, g_isStandalone sont faux. */
const DESKTOP_FLAGS = { g_isMobile: 0, g_isAndroid: 0, g_isStandalone: 0 };

/** En dessous, l'analyse a sûrement raté une partie du fichier. */
const MIN_SETTINGS = 500;

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const iniIndex = args.indexOf('--ini');
  const iniFile = iniIndex >= 0 ? args[iniIndex + 1] : undefined;
  const wanted = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--ini');

  const components = loadManifest().filter((c) => c.id === 'vpx' && (!wanted || c.version === wanted));
  if (!components.length) throw new Error(`Aucune entrée VPX ${wanted ?? ''} dans le manifeste.`);

  let failures = 0;
  for (const component of components) {
    const commit = component.sourceCommit ?? commitOf(component);
    console.log(`VPX ${component.version} (${component.variant ?? 'standard'}) : code source au commit ${commit}`);
    const schema = await buildSchema(component, commit);
    const fromPlugins = schema.settings.filter((s) => s.plugin).length;
    console.log(`  ${schema.count} réglages dont ${fromPlugins} déclarés par les plugins, ${new Set(schema.settings.map((s) => s.section)).size} sections`);
    checkSchema(schema);
    if (iniFile) failures += compareWithIni(schema, iniFile);

    const file = vpxSettingsSchemaFile(component.version);
    const text = serializeVpxSettingsSchema(schema);
    if (check) {
      // git peut avoir converti les fins de ligne à l'extraction (core.autocrlf).
      const same = fs.existsSync(file) && fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n') === text;
      console.log(same ? `  ${file} est à jour.` : `  ${file} diffère du code source.`);
      if (!same) failures++;
    } else {
      fs.writeFileSync(file, text, 'utf8');
      console.log(`  écrit : ${file}`);
      if (!component.sourceCommit) recordCommit(component, commit);
    }
  }
  return failures ? 1 : 0;
}

/** Le commit figure dans le nom de l'archive (v10.8.1-5436-af26b2d93) ou dans l'URL du code source. */
function commitOf(component: Component): string {
  const m = /-([0-9a-f]{7,40})(?:[-/]|$)/.exec(component.url) ?? /\/tree\/([0-9a-f]{7,40})/.exec(component.source);
  if (!m) throw new Error(`Commit introuvable pour VPX ${component.version} : renseignez sourceCommit dans le manifeste.`);
  return m[1]!;
}

async function fetchSource(commit: string, file: string): Promise<string> {
  const url = `https://raw.githubusercontent.com/${REPOSITORY}/${commit}/${file}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Téléchargement impossible (HTTP ${response.status}) : ${url}`);
  return response.text();
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'cyberpinball-vpx-schema' } });
  if (!response.ok) throw new Error(`Lecture impossible (HTTP ${response.status}) : ${url}`);
  return (await response.json()) as T;
}

interface GitTree {
  tree: { path: string; type: string; sha: string }[];
  truncated: boolean;
}

/** Fichiers du dossier plugins/ au commit, par l'API des arbres git de GitHub (deux requêtes). */
async function listPluginFiles(commit: string): Promise<string[]> {
  const api = `https://api.github.com/repos/${REPOSITORY}/git/trees`;
  const root = await fetchJson<GitTree>(`${api}/${commit}`);
  const dir = root.tree.find((e) => e.path === PLUGINS_DIR && e.type === 'tree');
  if (!dir) throw new Error(`Dossier ${PLUGINS_DIR}/ introuvable au commit ${commit}.`);
  const tree = await fetchJson<GitTree>(`${api}/${dir.sha}?recursive=1`);
  if (tree.truncated) throw new Error(`Liste des fichiers de ${PLUGINS_DIR}/ tronquée par GitHub.`);
  return tree.tree.filter((e) => e.type === 'blob').map((e) => `${PLUGINS_DIR}/${e.path}`);
}

async function fetchAll(commit: string, files: string[]): Promise<SourceFile[]> {
  const out: SourceFile[] = [];
  for (let i = 0; i < files.length; i += PARALLEL_DOWNLOADS) {
    const batch = files.slice(i, i + PARALLEL_DOWNLOADS);
    out.push(...(await Promise.all(batch.map(async (file) => ({ path: file, text: await fetchSource(commit, file) })))));
  }
  return out;
}

/**
 * Réglages enregistrés à l'exécution : Enable de chaque plugin (sauf ceux déjà dans
 * Settings_properties.inl), réglages des plugins, puis Priority.<moteur> de chaque fenêtre.
 */
async function pluginSettings(commit: string, known: Set<string>): Promise<VpxSettingDef[]> {
  const files = await listPluginFiles(commit);
  const dirs = files.map((f) => /^plugins\/([^/]+)\/plugin\.cfg$/.exec(f)?.[1]).filter((d): d is string => d !== undefined);
  const wanted = files.filter((f) => dirs.some((d) => f.startsWith(`${PLUGINS_DIR}/${d}/`)) && /(\.cpp|\.h|\/plugin\.cfg)$/.test(f));
  console.log(`  plugins : ${dirs.length} dossiers, ${wanted.length} fichiers à lire`);
  const sources = await fetchAll(commit, wanted);
  const settings: VpxSettingDef[] = [];
  const add = (def: VpxSettingDef) => {
    const id = `${def.section}/${def.key}`.toLowerCase();
    if (known.has(id)) return;
    known.add(id);
    settings.push(def);
  };
  const byWindow = new Map<AncillaryWindow, AncillaryRenderer[]>();
  add(pluginEnableSetting(CORE_PLUGIN));
  for (const dir of [...dirs].sort((a, b) => a.localeCompare(b))) {
    const own = sources.filter((s) => s.path.startsWith(`${PLUGINS_DIR}/${dir}/`));
    const plugin = parsePluginConfig(own.find((s) => s.path.endsWith('/plugin.cfg'))!.text);
    if (!plugin) throw new Error(`${PLUGINS_DIR}/${dir}/plugin.cfg : identifiant introuvable.`);
    const code = own.filter((s) => !s.path.endsWith('/plugin.cfg'));
    add(pluginEnableSetting(plugin));
    for (const def of parsePluginSettings(plugin, code)) add(def);
    for (const renderer of parseAncillaryRenderers(plugin, code)) {
      const windows = RENDERER_WINDOWS[renderer.id];
      if (!windows) {
        throw new Error(`Moteur de rendu « ${renderer.id} » (plugin ${plugin.id}) : fenêtres inconnues, à relever dans son code et à ajouter à RENDERER_WINDOWS.`);
      }
      for (const w of windows) byWindow.set(w, [...(byWindow.get(w) ?? []), renderer]);
    }
  }
  const found = new Set([...byWindow.values()].flat().map((r) => r.id));
  const stale = Object.keys(RENDERER_WINDOWS).filter((id) => !found.has(id));
  if (stale.length) throw new Error(`Moteurs de rendu de RENDERER_WINDOWS absents du code : ${stale.join(', ')}`);
  for (const window of ['Backglass', 'ScoreView', 'Topper'] as const) {
    for (const renderer of byWindow.get(window) ?? []) add(rendererPrioritySetting(window, renderer));
  }
  return settings;
}

async function buildSchema(component: Component, commit: string): Promise<VpxSettingsSchema> {
  const [source, ...headers] = await Promise.all([SETTINGS_FILE, ...CONSTANT_HEADERS].map((f) => fetchSource(commit, f)));
  const defines = ['_WIN32', '_WIN64', '_MSC_VER'];
  if (component.variant === 'BGFX') defines.push('ENABLE_BGFX');
  const settings = parseSettingsProperties(source!, {
    defines,
    constants: extractConstants(headers, DESKTOP_FLAGS),
    strings: { VP_VERSION_STRING_DIGITS: versionDigits(component.version) },
  });
  settings.push(...(await pluginSettings(commit, new Set(settings.map((s) => `${s.section}/${s.key}`.toLowerCase())))));
  return {
    vpx: component.version,
    variant: component.variant,
    platform: component.platform,
    sourceCommit: commit,
    source: `https://github.com/${REPOSITORY}/blob/${commit}/${SETTINGS_FILE}`,
    count: settings.length,
    settings,
  };
}

/** VP_VERSION_STRING_DIGITS : 10.8.1-5436 -> « 10815436 » (src/core/vpversion.h). */
function versionDigits(version: string): string {
  return version.replace(/[^0-9]/g, '');
}

function checkSchema(schema: VpxSettingsSchema): void {
  if (schema.count < MIN_SETTINGS) throw new Error(`Seulement ${schema.count} réglages : l'analyse a sans doute raté une partie du fichier.`);
  // Les clés écrites par Cyber Pinball doivent exister dans cette version.
  const known = new Set(schema.settings.map((s) => `${s.section}/${s.key}`.toLowerCase()));
  const missing: string[] = [];
  for (const win of Object.values(VPX_WINDOWS)) {
    for (const suffix of ['Display', 'FullScreen', 'WndX', 'WndY', 'Width', 'Height', ...(win.hasOutput ? ['Output'] : [])]) {
      const id = `${win.section}/${win.prefix}${suffix}`;
      if (!known.has(id.toLowerCase())) missing.push(id);
    }
  }
  for (const [window, renderers] of Object.entries(VPX_RENDERER_PRIORITIES)) {
    for (const id of Object.keys(renderers)) {
      const id2 = `${window}/Priority.${id}`;
      if (!known.has(id2.toLowerCase())) missing.push(id2);
    }
  }
  if (missing.length) throw new Error(`Clés gérées par Cyber Pinball absentes de ce schéma : ${missing.join(', ')}`);
}

/**
 * Chaque réglage du schéma doit figurer dans un VPinballX.ini écrit par cette version,
 * sauf ceux des plugins que VPX n'a pas chargés. Les clés hors schéma restantes sont
 * les touches et les options déclarées par les tables.
 */
function compareWithIni(schema: VpxSettingsSchema, iniFile: string): number {
  const doc = IniDocument.parse(fs.readFileSync(iniFile, 'utf8'));
  const inIni = new Set(doc.entries().map((e) => `${e.section}/${e.key}`.toLowerCase()));
  const absent = schema.settings.filter((s) => !inIni.has(`${s.section}/${s.key}`.toLowerCase()));
  const known = new Set(schema.settings.map((s) => `${s.section}/${s.key}`.toLowerCase()));
  const extra = doc.entries().filter((e) => !known.has(`${e.section}/${e.key}`.toLowerCase()));
  const loaded = (s: VpxSettingDef) => !s.plugin || s.key === 'Enable' || /^(1|true|on)$/i.test(doc.get(`Plugin.${s.plugin}`, 'Enable')?.trim() ?? '');
  const missing = absent.filter(loaded);
  console.log(
    `  ${iniFile} : ${inIni.size} clés, ${missing.length} réglages du schéma absents (et ${absent.length - missing.length} de plugins non chargés), ${extra.length} clés hors schéma (touches, options de table).`,
  );
  for (const s of missing.slice(0, 20)) console.log(`    absent : [${s.section}] ${s.key}`);
  for (const e of extra.filter((e) => e.section !== 'TableOption').slice(0, 20)) console.log(`    hors schéma : [${e.section}] ${e.key}`);
  return missing.length ? 1 : 0;
}

/** Ajoute sourceCommit à l'entrée du manifeste en gardant la mise en forme du reste du fichier. */
function recordCommit(component: Component, commit: string): void {
  const text = fs.readFileSync(MANIFEST_FILE, 'utf8');
  const sourceLine = `"source": ${JSON.stringify(component.source)}`;
  const index = text.indexOf(sourceLine);
  if (index < 0) throw new Error(`Entrée VPX ${component.version} introuvable dans ${MANIFEST_FILE}.`);
  const lineStart = text.lastIndexOf('\n', index) + 1;
  const indent = text.slice(lineStart, index);
  const end = index + sourceLine.length;
  const next = `${sourceLine},\n${indent}"sourceCommit": ${JSON.stringify(commit)}`;
  fs.writeFileSync(MANIFEST_FILE, text.slice(0, index) + next + text.slice(end), 'utf8');
  console.log(`  manifeste : sourceCommit = ${commit}`);
}

main().then(
  (code) => process.exit(code),
  (err: Error) => {
    console.error(err.message);
    process.exit(1);
  },
);
