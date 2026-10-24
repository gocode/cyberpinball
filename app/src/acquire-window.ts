// Fenêtre « Récupérer » (docs/recherche/acquisition.md § 8.4, étape A4) : la page d'un
// fichier de VPS (forum, presque toujours avec un compte), où l'utilisateur se connecte
// et télécharge lui-même. Cyber Pinball ne clique rien, ne remplit rien et ne garde
// aucun mot de passe : les cookies vivent dans une session à part
// (« persist:acquisition »), comme dans un navigateur.
//
// En haut, un bandeau de Cyber Pinball rappelle ce qu'il faut télécharger (jeu, version,
// auteurs, nom de ROM) et donne Précédent, « Ouvrir dans mon navigateur » et Fermer.
// Chaque téléchargement de la session est rangé dans <racine>\downloads\acquisition, puis
// remis à l'application avec la chaîne de redirections : la fiche traversée dit à quel
// élément de la liste d'attente il revient.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { ipcMain, session, shell, WebContentsView, type BrowserWindow, type DownloadItem, type Session } from 'electron';
import { DIRECT_MAX_STEPS, DOWNLOAD_PROBES, type ProbeResult, type SiteCookie, type SourceSite } from '@cyberpinball/core';
import { coverDisplay, fillBelow } from './cover-display';
import { createWindow, OFFSCREEN, primaryRect } from './offscreen';

export const ACQUIRE_PARTITION = 'persist:acquisition';
/** Hauteur du bandeau de Cyber Pinball, en pixels. */
const BAR = 96;

export interface AcquireRequest {
  /** Page à ouvrir (lien de VPS). */
  url: string;
  /** « Terminator 2 - Judgment Day (Williams 1991) » */
  game: string;
  /** « Table : G5k, VPW 1.25 », « ROM t2_l8 » */
  expected: string;
  /** Message du bandeau à l'ouverture (repli d'un téléchargement direct, par exemple). */
  status?: string;
  /** Hôte, et s'il faut un compte : « vpuniverse.com, compte nécessaire » */
  host: string;
}

export interface AcquireEvents {
  /** Dossier où ranger les fichiers reçus (<racine>\downloads\acquisition). */
  dir(): string;
  /** Fichier reçu en entier, avec les adresses traversées. */
  received(file: string, facts: { urls: string[]; filename: string }): void;
  /** Progression d'un téléchargement (octets reçus, total s'il est connu). */
  progress(filename: string, received: number, total: number | undefined): void;
  /** Téléchargement interrompu ou annulé. */
  failed(filename: string, reason: string): void;
  /** La fenêtre s'est fermée. */
  closed(): void;
}

/** Fenêtre ouverte : la fenêtre, la page du site, ce qu’on y attend. */
export interface AcquireOpen {
  win: BrowserWindow;
  view: WebContentsView;
  request: AcquireRequest;
  status: string;
  /** Le message est un avertissement (repli d'un téléchargement direct, téléchargement interrompu, page morte). */
  warn?: boolean;
}

/** Nom libre dans `dir` : « table.zip », sinon « table (2).zip ». */
function freeName(dir: string, name: string): string {
  const safe = name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 180) || 'fichier';
  const ext = path.extname(safe);
  const base = safe.slice(0, safe.length - ext.length);
  let candidate = path.join(dir, safe);
  for (let n = 2; fs.existsSync(candidate) || fs.existsSync(`${candidate}.part`); n++) candidate = path.join(dir, `${base} (${n})${ext}`);
  return candidate;
}

export function createAcquirer(events: AcquireEvents) {
  let open: AcquireOpen | undefined;
  let prepared: Session | undefined;

  /** Session de la fenêtre : téléchargements interceptés, agent utilisateur de Chromium sans « Electron ». */
  function acquireSession(): Session {
    if (prepared) return prepared;
    const s = session.fromPartition(ACQUIRE_PARTITION);
    // Un navigateur ordinaire : sans les mentions de l'application et d'Electron, que des sites refusent.
    s.setUserAgent(s.getUserAgent().replace(/\s(cyberpinball|Electron)\/\S+/gi, ''));
    s.on('will-download', (_event, item, contents) => {
      // Téléchargement direct : la vue cachée qui l'a déclenché l'attend.
      directWaiters.get(contents?.id ?? -1)?.(item);
      const dir = events.dir();
      fs.mkdirSync(dir, { recursive: true });
      const target = freeName(dir, item.getFilename());
      item.setSavePath(target);
      const filename = path.basename(target);
      setStatus(`Téléchargement de ${filename}…`);
      item.on('updated', (_e, state) => {
        if (state === 'progressing') events.progress(filename, item.getReceivedBytes(), item.getTotalBytes() || undefined);
      });
      item.once('done', (_e, state) => {
        if (state === 'completed') {
          setStatus(`Reçu : ${filename}, rangé dans la liste d’attente. Fermer (Échap) pour revenir, ou téléchargez autre chose.`);
          events.received(target, { urls: item.getURLChain(), filename });
        } else {
          setStatus(`Téléchargement ${state === 'cancelled' ? 'annulé' : 'interrompu'} : ${filename}`, true);
          fs.rmSync(target, { force: true });
          events.failed(filename, state === 'cancelled' ? 'annulé' : 'interrompu');
        }
      });
    });
    prepared = s;
    return s;
  }

  function setStatus(status: string, warn = false): void {
    if (!open) return;
    open.status = status;
    open.warn = warn;
    sendBar();
  }

  function sendBar(): void {
    if (!open || open.win.isDestroyed()) return;
    const v = open.view.webContents;
    open.win.webContents.send('acquire:state', {
      ...open.request,
      status: open.status,
      warn: open.warn === true,
      address: v.getURL(),
      canGoBack: v.navigationHistory.canGoBack(),
    });
  }

  let ipcReady = false;
  function registerIpc(): void {
    if (ipcReady) return;
    ipcReady = true;
    ipcMain.on('acquire:ready', (e) => {
      if (open && e.sender === open.win.webContents) sendBar();
    });
    ipcMain.on('acquire:act', (e, action: unknown) => {
      if (!open || e.sender !== open.win.webContents) return;
      const v = open.view.webContents;
      if (action === 'back' && v.navigationHistory.canGoBack()) v.navigationHistory.goBack();
      else if (action === 'home') void v.loadURL(open.request.url);
      else if (action === 'browser') void shell.openExternal(v.getURL() || open.request.url);
      else if (action === 'close') close();
    });
  }

  /** Ouvre (ou réutilise) la fenêtre sur la page demandée. */
  function show(request: AcquireRequest): void {
    registerIpc();
    const s = acquireSession();
    if (open && !open.win.isDestroyed()) {
      open.request = request;
      open.status = request.status ?? 'Connectez-vous si le site le demande, puis téléchargez le fichier : il sera rangé tout seul.';
      open.warn = request.status !== undefined;
      void open.view.webContents.loadURL(request.url);
      sendBar();
      open.win.focus();
      return;
    }
    const win = createWindow({
      title: `Récupérer : ${request.game}`,
      show: false,
      frame: false,
      autoHideMenuBar: true,
      backgroundColor: '#030807',
      webPreferences: { preload: path.join(__dirname, 'acquire-preload.js'), contextIsolation: true, sandbox: true },
    });
    win.setMenuBarVisibility(false);
    win.on('page-title-updated', (e) => e.preventDefault());
    // Au-dessus des fenêtres plein écran du menu, sur l'écran principal de Windows.
    win.setAlwaysOnTop(true, 'floating');
    const view = new WebContentsView({
      webPreferences: { session: s, contextIsolation: true, sandbox: true, nodeIntegration: false, offscreen: OFFSCREEN },
    });
    win.contentView.addChildView(view);
    open = { win, view, request, status: request.status ?? 'Connectez-vous si le site le demande, puis téléchargez le fichier : il sera rangé tout seul.', warn: request.status !== undefined };
    const contents = view.webContents;
    // Une page qui ouvre un nouvel onglet (lien de téléchargement, MEGA) : dans la même vue.
    contents.setWindowOpenHandler(({ url }) => {
      if (/^https?:/i.test(url)) void contents.loadURL(url);
      return { action: 'deny' };
    });
    for (const event of ['did-navigate', 'did-navigate-in-page', 'did-stop-loading'] as const) contents.on(event as 'did-stop-loading', () => sendBar());
    contents.on('did-fail-load', (_e, code, description, url, isMainFrame) => {
      if (isMainFrame && code !== -3) setStatus(`Page inaccessible (${description}) : ${url}. Lien mort ? « Retour à la fiche » ou une autre source.`, true);
    });
    // Échap ferme, comme Exit partout ailleurs.
    const escape = (e: Electron.Event, input: Electron.Input) => {
      if (input.type === 'keyDown' && input.key === 'Escape') {
        e.preventDefault();
        close();
      }
    };
    contents.on('before-input-event', escape);
    win.webContents.on('before-input-event', escape);
    win.on('closed', () => {
      open = undefined;
      events.closed();
    });
    // Tout l'écran principal de Windows, comme les réglages : au-dessus du menu, jamais le bureau.
    coverDisplay(win, primaryRect());
    fillBelow(win, view, BAR);
    void win.loadFile(path.join(__dirname, '..', 'renderer', 'acquire.html'));
    void contents.loadURL(request.url);
    win.show();
    win.focus();
  }

  /** Vues cachées en cours de téléchargement direct : identifiant de leur page -> qui attend le fichier. */
  const directWaiters = new Map<number, (item: DownloadItem) => void>();

  /**
   * Téléchargement direct, sur demande de l'utilisateur déjà connecté : la fiche est
   * chargée dans une vue cachée de sa session, la sonde du site (sitesessions.ts) dit
   * quel lien suivre, au plus quatre pages. Résout dès que le téléchargement commence
   * (la suite passe par les événements habituels : progression, reçu, échec) ; sinon,
   * dit pourquoi il faut montrer la page.
   */
  async function direct(url: string, site: SourceSite, timeoutMs = 45_000): Promise<{ ok: true; filename: string } | { ok: false; reason: string; login?: boolean }> {
    const view = new WebContentsView({ webPreferences: { session: acquireSession(), contextIsolation: true, sandbox: true, nodeIntegration: false, offscreen: true } });
    const contents = view.webContents;
    contents.setAudioMuted(true);
    // Un nouvel onglet (lien de téléchargement) : dans la même vue.
    contents.setWindowOpenHandler(({ url: next }) => {
      if (/^https?:/i.test(next)) void contents.loadURL(next).catch(() => undefined);
      return { action: 'deny' };
    });
    let started: DownloadItem | undefined;
    let wake: (() => void) | undefined;
    directWaiters.set(contents.id, (item) => {
      started = item;
      wake?.();
    });
    const settle = () =>
      new Promise<void>((resolve) => {
        const done = () => {
          clearTimeout(timer);
          contents.off('did-stop-loading', done);
          contents.off('did-fail-load', failed);
          wake = undefined;
          resolve();
        };
        const failed = (_e: unknown, code: number, _d: string, _u: string, main: boolean) => {
          if (main && code !== -3) done();
        };
        const timer = setTimeout(done, timeoutMs);
        wake = done;
        contents.on('did-stop-loading', done);
        contents.on('did-fail-load', failed);
      });
    const finish = (item?: DownloadItem) => {
      directWaiters.delete(contents.id);
      // La vue reste ouverte jusqu'à la fin du téléchargement, puis se ferme.
      if (item && item.getState() === 'progressing') item.once('done', () => contents.close());
      else contents.close();
    };
    try {
      let next = url;
      for (let step = 0; step < DIRECT_MAX_STEPS; step++) {
        const loaded = settle();
        contents.loadURL(next).catch(() => undefined); // un téléchargement interrompt la navigation : normal
        await loaded;
        if (started) {
          finish(started);
          return { ok: true, filename: started.getFilename() };
        }
        let probe: ProbeResult;
        try {
          probe = (await contents.executeJavaScript(DOWNLOAD_PROBES[site.engine], true)) as ProbeResult;
        } catch {
          probe = { kind: 'show', reason: 'page illisible' };
        }
        if (probe.kind === 'login') {
          finish();
          return { ok: false, login: true, reason: `vous n’êtes plus connecté à ${site.label}` };
        }
        if (probe.kind === 'show') {
          finish();
          return { ok: false, reason: probe.reason };
        }
        next = probe.href;
      }
      finish(started);
      return started ? { ok: true, filename: started.getFilename() } : { ok: false, reason: 'trop de pages avant le fichier' };
    } catch (error) {
      finish(started);
      return { ok: false, reason: (error as Error).message };
    }
  }

  function close(): void {
    if (open && !open.win.isDestroyed()) open.win.close();
  }

  /**
   * Cookies de la session pour un domaine, www. et sous-domaines compris. Le filtre
   * « domain » d'Electron ne rend pas les cookies propres à un sous-domaine
   * (www.vpforums.org pour vpforums.org) : on les lit tous et on trie ici.
   */
  async function domainCookies(domain: string): Promise<Electron.Cookie[]> {
    const ofDomain = (c: Electron.Cookie) => {
      const d = (c.domain ?? '').replace(/^\./, '').toLowerCase();
      return d === domain || d.endsWith(`.${domain}`);
    };
    return (await acquireSession().cookies.get({})).filter(ofDomain);
  }

  /** Cookies de la session pour un site : pour dire si l'on y est connecté. */
  async function siteCookies(domain: string): Promise<SiteCookie[]> {
    return (await domainCookies(domain)).map((c) => ({ name: c.name, value: c.value, domain: c.domain, expirationDate: c.expirationDate }));
  }

  /** Se déconnecter d'un site : ses cookies sont effacés de la session, rien d'autre. */
  async function signOut(domain: string): Promise<void> {
    const s = acquireSession();
    for (const c of await domainCookies(domain)) {
      const host = (c.domain ?? domain).replace(/^\./, '');
      await s.cookies.remove(`http${c.secure ? 's' : ''}://${host}${c.path ?? '/'}`, c.name);
    }
    await s.cookies.flushStore();
  }

  return {
    show,
    close,
    siteCookies,
    signOut,
    direct,
    isOpen: () => Boolean(open && !open.win.isDestroyed()),
    /** Pour les essais : fenêtre et page affichées. */
    current: () => open,
  };
}

export type Acquirer = ReturnType<typeof createAcquirer>;
