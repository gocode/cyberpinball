// Chargement des extensions (packages/core/src/plugins.ts : vérification) et interface
// qui leur est offerte. Une extension est un module CommonJS qui exporte activate(api) ;
// elle ne voit que ce que cette interface lui donne. Chargées au démarrage, une fois ;
// une extension qui échoue est notée au journal et n'empêche rien d'autre.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { discoverPlugins, ensurePluginsDir, language, PLUGIN_API, PLUGINS_DIR, type PluginManifest } from '@cyberpinball/core';

export type PluginTone = 'ok' | 'warning' | 'info' | 'quiet';

/** Entrée ajoutée à un écran par une extension. */
export interface PluginAction {
  label: string;
  detail?: string;
  tone?: PluginTone;
  /** `refresh` réaffiche l'écran d'où l'action est partie. */
  run(refresh: () => void): void;
}

/** Une page de site que « Récupérer » s'apprête à ouvrir. */
export interface PluginFetch {
  url: string;
  site: { label: string; domain: string };
  /** Ce qui est attendu (« Table : … »). */
  expected: string;
  /** L'utilisateur est-il connecté à ce site dans le navigateur intégré ? */
  signedIn(): Promise<boolean>;
  /** Téléchargement dans une vue cachée de la session de l'utilisateur ; la page n'est pas montrée. */
  direct(): Promise<{ ok: true; filename: string } | { ok: false; reason: string }>;
  /** Montre la page dans la fenêtre « Récupérer », avec une raison en orange s'il y en a une. */
  showPage(status?: string): void;
  /** L'élément attendu est-il encore en attente (pas déjà reçu) ? */
  waiting(): boolean;
  /** Message du menu, puis réaffichage de l'écran d'où l'on vient. */
  notify(text: string, tone?: PluginTone): void;
  /** Tâche avec message d'attente (sablier du menu). */
  task(message: string, work: () => Promise<void> | void): Promise<void>;
}

export interface PluginApi {
  api: number;
  id: string;
  /** « fr » ou « en » : l'extension traduit ses propres textes. */
  language(): string;
  log(line: string): void;
  /** Réglages propres à l'extension (<données>\plugins-reglages\<id>.json). */
  settings: { read(): Record<string, unknown>; write(values: Record<string, unknown>): void };
  catalog: {
    /** Entrée de l'écran « Comptes des sites » ; undefined : rien à montrer. */
    addAccountsAction(build: () => PluginAction | undefined): void;
    /** Avant d'ouvrir la page de « Récupérer » : true si l'extension s'en charge. */
    interceptFetch(handler: (request: PluginFetch) => Promise<boolean> | boolean): void;
  };
}

interface Hooks {
  accountsActions: { plugin: string; build: () => PluginAction | undefined }[];
  fetchHandlers: { plugin: string; handle: (request: PluginFetch) => Promise<boolean> | boolean }[];
}

/** Points d'accroche remplis par les extensions chargées ; lus par les écrans concernés. */
export const pluginHooks: Hooks = { accountsActions: [], fetchHandlers: [] };

export interface LoadedPlugin {
  manifest: PluginManifest;
  dir: string;
}

const loaded: LoadedPlugin[] = [];

export function loadedPlugins(): readonly LoadedPlugin[] {
  return loaded;
}

function settingsFile(dataDir: string, id: string): string {
  return path.join(dataDir, `${PLUGINS_DIR}-reglages`, `${id}.json`);
}

/** Crée <données>\plugins s'il manque, puis charge ses extensions signées ; journal : une ligne par extension. */
export function loadPlugins(dataDir: string, log: (line: string) => void = (line) => console.log(line)): readonly LoadedPlugin[] {
  ensurePluginsDir(dataDir);
  for (const check of discoverPlugins(dataDir)) {
    const folder = path.basename(check.dir);
    if (!check.ok) {
      log(`Extension ${folder} ignorée : ${check.reason}.`); // i18n-ignore : journal
      continue;
    }
    const m = check.manifest;
    if (m.api !== PLUGIN_API) {
      log(`Extension ${m.id} ${m.version} ignorée : interface ${m.api}, celle de cette version est ${PLUGIN_API}.`); // i18n-ignore : journal
      continue;
    }
    const tag = (line: string) => log(`[${m.id}] ${line}`);
    const api: PluginApi = {
      api: PLUGIN_API,
      id: m.id,
      language: () => language(),
      log: tag,
      settings: {
        read: () => {
          try {
            const value = JSON.parse(fs.readFileSync(settingsFile(dataDir, m.id), 'utf8')) as unknown;
            return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
          } catch {
            return {};
          }
        },
        write: (values) => {
          const file = settingsFile(dataDir, m.id);
          fs.mkdirSync(path.dirname(file), { recursive: true });
          fs.writeFileSync(file, JSON.stringify(values, null, 2) + '\n', 'utf8');
        },
      },
      catalog: {
        addAccountsAction: (build) => void pluginHooks.accountsActions.push({ plugin: m.id, build }),
        interceptFetch: (handle) => void pluginHooks.fetchHandlers.push({ plugin: m.id, handle }),
      },
    };
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require(path.join(check.dir, ...m.main.split('/'))) as { activate?: (api: PluginApi) => void };
      if (typeof mod.activate !== 'function') throw new Error('no activate(api) export');
      mod.activate(api);
      loaded.push({ manifest: m, dir: check.dir });
      log(`Extension ${m.id} ${m.version} chargée.`); // i18n-ignore : journal
    } catch (error) {
      log(`Extension ${m.id} : échec au chargement (${(error as Error).message}).`); // i18n-ignore : journal
    }
  }
  return loaded;
}

/** Entrées des extensions pour un écran ; une extension qui échoue est sautée. */
export function pluginActions(list: Hooks['accountsActions'], log: (line: string) => void = (line) => console.log(line)): PluginAction[] {
  const out: PluginAction[] = [];
  for (const entry of list) {
    try {
      const action = entry.build();
      if (action) out.push(action);
    } catch (error) {
      log(`[${entry.plugin}] ${(error as Error).message}`); // i18n-ignore : journal
    }
  }
  return out;
}

/** Propose la page aux extensions, dans l'ordre ; true dès que l'une s'en charge. */
export async function pluginTakesFetch(request: PluginFetch, log: (line: string) => void = (line) => console.log(line)): Promise<boolean> {
  for (const entry of pluginHooks.fetchHandlers) {
    try {
      if (await entry.handle(request)) return true;
    } catch (error) {
      log(`[${entry.plugin}] ${(error as Error).message}`); // i18n-ignore : journal
    }
  }
  return false;
}
