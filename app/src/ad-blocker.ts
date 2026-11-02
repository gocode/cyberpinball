// Bloqueur de publicités du navigateur intégré (fenêtre « Récupérer », sa session à part,
// acquire-window.ts) : le moteur de Ghostery (@ghostery/adblocker, listes d'uBlock Origin et
// d'EasyList), branché sur la session. Trois niveaux, comme uBlock : les requêtes vers les
// régies sont annulées, les emplacements de publicité masqués (feuille de style injectée), et
// les petits scripts des listes (« scriptlets ») injectés dans la page, seul moyen d'ôter les
// publicités de YouTube, servies par ses propres serveurs. Les scriptlets passent par notre
// propre script préchargé (adblock-scriptlets-preload.ts), synchrone, avant les scripts de la
// page : par le canal asynchrone de Ghostery, ils arrivaient après que YouTube a lu ses publicités.
//
// Le branchement reprend celui de @ghostery/adblocker-electron (MPL-2.0), qu'on n'importe pas :
// il cherche son script préchargé par require.resolve, dans un node_modules que l'application
// regroupée par esbuild n'a pas. Le script préchargé de Ghostery (il ne requiert qu'electron,
// donc il tourne dans les pages en bac à sable) est copié à côté de main.js par
// scripts/fabriquer.mjs ; en développement, il est pris dans node_modules.
//
// Les listes sont gardées sur disque (<données>\adblock\filtres.bin, le moteur sérialisé) et
// rafraîchies une fois par jour, en arrière-plan : les anciennes servent en attendant. Sans
// listes (premier démarrage hors ligne), rien n'est bloqué et le menu le dit. Les pages des
// sites sources ne sont jamais filtrées (adBlockExempt), et le réglage se relit à chaque
// requête : le changer vaut dès la page suivante.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { ipcMain, net, type IpcMainInvokeEvent, type Session } from 'electron';
import { adsLists, FiltersEngine, Request, type RequestType } from '@ghostery/adblocker';
import { parse } from 'tldts-experimental';
import { adBlockExempt, adListsStale, combineScriptlets, writeFileAtomic, type AdBlockState } from '@cyberpinball/core';

/** Canaux du script préchargé de Ghostery (@ghostery/adblocker-electron-preload), et du nôtre (scriptlets). */
const INJECT_CHANNEL = '@ghostery/adblocker/inject-cosmetic-filters';
const OBSERVER_CHANNEL = '@ghostery/adblocker/is-mutation-observer-enabled';
const SCRIPTLETS_CHANNEL = 'cyberpinball/adblock/scriptlets';

/** Bloqueur de chaque session : les canaux sont communs à toute l'application, on aiguille par la session de la page. */
interface CosmeticsHandler {
  inject(event: IpcMainInvokeEvent, url: string, msg?: CosmeticsUpdate): Promise<void>;
  observer(): boolean;
  /** Scriptlets d'un cadre (`url`) de la page `top`, pour le début de son document. */
  scriptlets(top: string, url: string): string[];
}
interface CosmeticsUpdate {
  classes?: string[];
  hrefs?: string[];
  ids?: string[];
  lifecycle?: string;
}
const handlers = new Map<Session, CosmeticsHandler>();
function registerChannels(): void {
  if (handlers.size) return;
  ipcMain.handle(INJECT_CHANNEL, (event, url: string, msg?: CosmeticsUpdate) => handlers.get(event.sender.session)?.inject(event, url, msg));
  ipcMain.handle(OBSERVER_CHANNEL, (event) => handlers.get(event.sender.session)?.observer() ?? false);
  ipcMain.on(SCRIPTLETS_CHANNEL, (event, url: unknown) => {
    let scripts: string[] = [];
    try {
      scripts = typeof url === 'string' ? (handlers.get(event.sender.session)?.scriptlets(event.sender.getURL(), url) ?? []) : [];
    } catch {
      // Une page qui se ferme pendant la demande : rien à injecter.
    }
    event.returnValue = scripts;
  });
}

export interface AdBlockerOptions {
  /** Fichier des listes gardées ; absent tant que la racine n'est pas connue. */
  cacheFile(): string | undefined;
  /** Le réglage de l'utilisateur : bloquer (true) ou montrer les publicités. */
  enabled(): boolean;
  /** Réception des listes (essais : un faux serveur) ; par défaut, net.fetch d'Electron. */
  fetch?: typeof fetch;
  /** Listes à recevoir ; par défaut, celles des publicités que Ghostery sert (adsLists). */
  lists?: readonly string[];
}

export function createAdBlocker(opts: AdBlockerOptions) {
  let engine: FiltersEngine | undefined;
  let savedAt: number | undefined;
  let loading: Promise<void> | undefined;
  let diskRead = false;
  /** La dernière réception a échoué (hors ligne) : le menu le dit, sans relancer à chaque affichage. */
  let failed = false;
  const attached = new WeakSet<Session>();

  /** Les listes gardées sur disque, une fois ; un moteur d'une autre version (mise à jour) est ignoré. */
  function readDisk(): void {
    if (diskRead) return;
    const file = opts.cacheFile();
    if (!file) return;
    diskRead = true;
    try {
      const data = fs.readFileSync(file);
      engine = FiltersEngine.deserialize(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
      savedAt = fs.statSync(file).mtimeMs;
    } catch {
      // Pas encore de listes, ou d'une autre version du moteur : on les recevra.
    }
  }

  /** Listes reçues de nouveau si elles manquent ou datent de plus d'un jour ; une seule réception à la fois, rien si le réglage est coupé. */
  function refresh(): void {
    readDisk();
    if (loading || !opts.enabled() || !adListsStale(savedAt, Date.now())) return;
    const file = opts.cacheFile();
    if (!file) return;
    const fetchImpl = opts.fetch ?? ((url: RequestInfo | URL, init?: RequestInit) => net.fetch(url instanceof URL ? url.href : (url as string), init));
    loading = FiltersEngine.fromLists(fetchImpl as typeof fetch, [...(opts.lists ?? adsLists)])
      .then((fresh) => {
        engine = fresh;
        savedAt = Date.now();
        failed = false;
        writeFileAtomic(file, fresh.serialize());
        console.log(`Bloqueur de publicités : listes reçues (${file})`);
      })
      .catch((e: unknown) => {
        failed = true;
        console.warn(`Bloqueur de publicités : listes non reçues (${e instanceof Error ? e.message : String(e)})`);
      })
      .finally(() => {
        loading = undefined;
      });
  }

  /** Moteur à appliquer à une page : aucun quand le réglage est coupé, les listes absentes ou la page exemptée. */
  function engineFor(pageUrl: string | undefined): FiltersEngine | undefined {
    if (!engine || !opts.enabled() || adBlockExempt(pageUrl)) return undefined;
    return engine;
  }

  /** Page d'où vient une requête : celle du cadre principal, à défaut celle de la vue. */
  function pageOf(details: Electron.OnBeforeRequestListenerDetails | Electron.OnHeadersReceivedListenerDetails): string | undefined {
    try {
      return details.frame?.top?.url || details.webContents?.getURL() || undefined;
    } catch {
      return undefined;
    }
  }

  function requestOf(details: Electron.OnBeforeRequestListenerDetails | Electron.OnHeadersReceivedListenerDetails): Request {
    return Request.fromRawDetails({
      requestId: `${details.id}`,
      sourceUrl: details.referrer,
      ...(details.webContentsId ? { tabId: details.webContentsId } : {}),
      type: (details.resourceType || 'other') as RequestType,
      url: details.url,
    });
  }

  async function injectCosmetics(event: IpcMainInvokeEvent, url: string, msg?: CosmeticsUpdate): Promise<void> {
    const e = engineFor(url);
    if (!e) return;
    const parsed = parse(url);
    const first = msg === undefined;
    const { active, styles } = e.getCosmeticsFilters({
      domain: parsed.domain || '',
      hostname: parsed.hostname || '',
      url,
      classes: msg?.classes,
      hrefs: msg?.hrefs,
      ids: msg?.ids,
      getBaseRules: first,
      // Les scriptlets sont déjà là : injectés au début du document (adblock-scriptlets-preload.ts).
      getInjectionRules: false,
      getExtendedRules: false,
      getRulesFromHostname: first,
      getRulesFromDOM: !first,
      callerContext: { frameId: event.frameId, processId: event.processId, lifecycle: msg?.lifecycle },
    });
    if (active === false || !styles.length) return;
    await event.sender.insertCSS(styles, { cssOrigin: 'user' }).catch(() => undefined);
  }

  function scriptlets(top: string, url: string): string[] {
    const e = engineFor(top);
    if (!e || !/^https?:\/\//i.test(url)) return [];
    const parsed = parse(url);
    const { active, scripts } = e.getCosmeticsFilters({
      domain: parsed.domain || '',
      hostname: parsed.hostname || '',
      url,
      getBaseRules: false,
      getInjectionRules: true,
      getExtendedRules: false,
      getRulesFromHostname: true,
      getRulesFromDOM: false,
    });
    const combined = active === false ? undefined : combineScriptlets(scripts);
    return combined ? [combined] : [];
  }

  /** Script préchargé de Ghostery (masquage) : copié à côté de main.js à la construction, sinon pris dans node_modules. */
  function cosmeticsPreload(): string {
    const shipped = path.join(__dirname, 'adblock-preload.js');
    return fs.existsSync(shipped) ? shipped : require.resolve('@ghostery/adblocker-electron-preload');
  }

  /** Branche le bloqueur sur une session (une fois) : requêtes, en-têtes CSP, script préchargé. */
  function attach(session: Session): void {
    refresh();
    if (attached.has(session)) return;
    attached.add(session);
    session.registerPreloadScript({ type: 'frame', filePath: path.join(__dirname, 'adblock-scriptlets-preload.js') });
    session.registerPreloadScript({ type: 'frame', filePath: cosmeticsPreload() });
    registerChannels();
    handlers.set(session, { inject: injectCosmetics, observer: () => engine?.config.enableMutationObserver ?? false, scriptlets });
    session.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
      // La page elle-même n'est jamais bloquée (ni un téléchargement, qui en est une).
      const e = details.resourceType === 'mainFrame' ? undefined : engineFor(pageOf(details));
      if (!e) return callback({});
      const request = requestOf(details);
      if (request.type === 'other') request.guessTypeOfRequest();
      const { redirect, match } = e.match(request);
      if (redirect) callback({ redirectURL: redirect.dataUrl });
      else callback(match ? { cancel: true } : {});
    });
    session.webRequest.onHeadersReceived({ urls: ['<all_urls>'] }, (details, callback) => {
      const frame = details.resourceType === 'mainFrame' || details.resourceType === 'subFrame';
      const e = frame ? engineFor(details.resourceType === 'mainFrame' ? details.url : pageOf(details)) : undefined;
      const csp = e?.getCSPDirectives(requestOf(details));
      if (!csp) return callback({});
      const headers = { ...details.responseHeaders };
      const policies = csp.split(';').map((p) => p.trim());
      for (const name of Object.keys(headers)) {
        if (name.toLowerCase() !== 'content-security-policy') continue;
        policies.push(...(headers[name] ?? []));
        delete headers[name];
      }
      headers['content-security-policy'] = [policies.join(';')];
      callback({ responseHeaders: headers });
    });
  }

  /** État pour le menu. */
  function state(): AdBlockState {
    readDisk();
    if (!opts.enabled()) return 'off';
    // Jamais demandées depuis le démarrage : elles le sont maintenant.
    if (!engine && !failed) refresh();
    if (engine) return 'ready';
    return loading ? 'loading' : 'unavailable';
  }

  /** Attend la réception en cours (essais). */
  function settled(): Promise<void> {
    return loading ?? Promise.resolve();
  }

  return { attach, refresh, state, settled };
}

export type AdBlocker = ReturnType<typeof createAdBlocker>;
