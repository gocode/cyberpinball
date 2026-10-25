// Fenêtre « Récupérer » (docs/recherche/acquisition.md § 8.4, étape A4) : la page d'un
// fichier de VPS (forum, presque toujours avec un compte), où l'utilisateur se connecte
// et télécharge lui-même. Cyber Pinball ne clique rien, ne remplit rien et ne garde
// aucun mot de passe : les cookies vivent dans une session à part
// (« persist:acquisition »), comme dans un navigateur.
//
// En haut, un bandeau de Cyber Pinball rappelle ce qu'il faut télécharger (jeu, version,
// auteurs, nom de ROM) et donne Précédent, « Ouvrir dans mon navigateur » et Fermer.
// Fermer (ou Échap, la touche qu'on presse par réflexe pour une image agrandie ou après
// une capture d'écran) ne perd rien : l'historique de la page est gardé, et la fenêtre
// rouverte pour la même page de départ reprend là où l'utilisateur en était.
// La fenêtre se lit à la souris : elle s'ouvre sur l'écran que donne le menu, celui choisi
// dans « Écran du navigateur intégré » (configuration de la borne), sinon automatique (le
// fronton quand le playfield est couché et tourné, où la souris irait de travers), et y amène
// le pointeur, qui pouvait être sur un écran qui le cache. Une ligne de plus dans le bandeau
// dit quand l'écran choisi n'est pas branché, ou que le playfield choisi est de travers.
// Exit de la borne la ferme, comme Échap.
// Chaque téléchargement de la session est rangé dans <racine>\downloads\acquisition, puis
// remis à l'application avec la chaîne de redirections : la fiche traversée dit à quel
// élément de la liste d'attente il revient.
// Tant qu'un téléchargement de la session est en cours (page visible, téléchargement direct
// ou média d'un site depuis une vue cachée), le bandeau lui donne une ligne : barre de
// progression, pourcentage, « 48,2 Mo sur 312 Mo · 3,1 Mo/s · environ 1 min » (transfer.ts)
// et Annuler. Les téléchargements sont relevés quatre fois par seconde, pas à chaque paquet.
// À la borne : Start désigne le dernier téléchargement, les flippers en choisissent un autre,
// Start de nouveau l'annule ; Exit (ou Échap) renonce sans fermer la fenêtre.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { app, BrowserWindow, ipcMain, screen, session, shell, WebContentsView, type DownloadItem, type Rectangle, type Session } from 'electron';
import {
  createTransferMeter,
  DIRECT_MAX_STEPS,
  expectedSizeFromPage,
  PAGE_SIZE_PROBE,
  type PageSizeHint,
  DOWNLOAD_PROBES,
  formatTransfer,
  probeReasonText,
  t,
  transferPercent,
  WAIT_PROBES,
  type NavigationKeys,
  type ProbeResult,
  type SiteCookie,
  type SourceSite,
  type TransferMeter,
  type TransferProgress,
} from '@cyberpinball/core';
import { setCursorPosition } from '@cyberpinball/win-displays';
import { coverDisplay, fillBelow } from './cover-display';
import { onJoystickInput } from './joystick-input';
import { createWindow, OFFSCREEN, primaryRect } from './offscreen';

export const ACQUIRE_PARTITION = 'persist:acquisition';
/** Message du bandeau quand la fenêtre reprend où l'utilisateur en était. */
const RESUMED = () => t('Repris là où vous en étiez. « Retour à la fiche » revient à la page de départ.');
/** Hauteur du bandeau de Cyber Pinball, en pixels ; avec la ligne sur l'écran retenu (écran choisi pas branché, playfield tourné). */
const BAR = 96;
const BAR_WITH_NOTE = 122;
/** Une ligne de téléchargement en cours sous le bandeau (acquire.css, .download), et la marge qui les suit. */
const DOWNLOAD_ROW = 34;
const DOWNLOAD_PAD = 8;
/** Au plus, lignes de téléchargement ; au-delà, la dernière résume les autres. */
const DOWNLOAD_ROWS = 3;
/** Relevé des téléchargements en cours (bandeau) ; un relevé sur REPORT_EVERY va aussi au menu. */
const SAMPLE_MS = 250;
const REPORT_EVERY = 2;
/** Annulation à la borne : Start désigne un téléchargement, puis l'annule s'il est pressé dans ce délai. */
const ARM_MS = 6000;
/** Touches qu'une page garde pour elle : jamais prises pour un bouton de la borne quand elle a le clavier. */
const PAGE_KEYS = new Set(['Enter', 'NumpadEnter', 'Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backspace']);

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
  /** Ce que la page téléchargera revient à ce destinataire (un média), pas à la liste d'attente. */
  claim?: DownloadClaim;
}

/**
 * Destinataire d'un téléchargement qui n'est pas pour la liste d'attente : un média
 * demandé depuis ses propositions. Il dit où ranger le fichier et reçoit la suite.
 */
export interface DownloadClaim {
  dir: string;
  /** Arrêt demandé par l'utilisateur : le téléchargement en cours est annulé. */
  signal?: AbortSignal;
  /** Progression, deux fois par seconde au plus (débit lissé, temps restant : transfer.ts). */
  progress?(progress: TransferProgress): void;
  done(result: { file: string; filename: string; urls: string[] } | { error: 'cancelled' | 'interrupted' }): void;
}

export interface AcquireEvents {
  /** Dossier où ranger les fichiers reçus (<racine>\downloads\acquisition). */
  dir(): string;
  /** Fichier reçu en entier, avec les adresses traversées. */
  received(file: string, facts: { urls: string[]; filename: string }): void;
  /** Progression d'un téléchargement, deux fois par seconde au plus (octets reçus, total s'il est connu, débit, temps restant). */
  progress(filename: string, progress: TransferProgress): void;
  /** Téléchargement interrompu ou annulé. */
  failed(filename: string, reason: 'cancelled' | 'interrupted'): void;
  /** La fenêtre s'est fermée. */
  closed(): void;
  /**
   * Écran à couvrir (coordonnées Electron) et ce que le bandeau en dit ; sans lui, l'écran
   * principal de Windows. Relu à chaque nouvelle fenêtre : un changement de réglage vaut
   * dès l'ouverture suivante.
   */
  screen?(): { bounds: Rectangle; notice?: string } | undefined;
  /** Touches qui ferment la fenêtre comme Échap : Exit de la borne (touche ou bouton de joystick). */
  exitKeys?(): string[];
  /** Boutons de l'interface qui annulent un téléchargement à la borne : Valider (Start), Précédent et Suivant (flippers). */
  navKeys?(): Pick<NavigationKeys, 'previous' | 'next' | 'confirm'>;
}

/** Ligne du bandeau pour un téléchargement en cours. */
export interface DownloadLine {
  id: number;
  filename: string;
  state: 'progressing' | 'paused' | 'interrupted';
  /** Absent quand la taille est inconnue : barre indéterminée. */
  percent?: number;
  /** « 48,2 Mo sur 312 Mo · 3,1 Mo/s · environ 1 min », précédé de l'état s'il n'avance pas. */
  text: string;
  /** Désigné à la borne : Start de nouveau l'annule. */
  armed?: boolean;
}

/** Fenêtre ouverte : la fenêtre, la page du site, ce qu’on y attend. */
export interface AcquireOpen {
  win: BrowserWindow;
  view: WebContentsView;
  request: AcquireRequest;
  status: string;
  /** Le message est un avertissement (repli d'un téléchargement direct, téléchargement interrompu, page morte). */
  warn?: boolean;
  /** Ligne du bandeau sur l'écran retenu, tant que la fenêtre est ouverte (écran choisi pas branché, playfield tourné). */
  screenNote?: string;
  /** Change la hauteur du bandeau (la page du site suit en dessous). */
  setBar?(height: number): void;
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

export interface DirectOptions {
  /** Le fichier revient à ce destinataire (un média), pas à la liste d'attente. */
  claim?: DownloadClaim;
  /**
   * Accepte d'attendre le minuteur du site (VPUniverse) : appelé chaque seconde avec
   * les secondes que la page affiche. Sans lui, un minuteur renvoie à la page visible.
   */
  onWait?(seconds: number): void;
  /** Arrêt demandé par l'utilisateur pendant l'attente. */
  signal?: AbortSignal;
}

/** Au plus, attente d'un minuteur de site avant d'abandonner (le site annonce environ 45 s). */
const WAIT_MAX_MS = 150_000;

export function createAcquirer(events: AcquireEvents) {
  let open: AcquireOpen | undefined;
  let prepared: Session | undefined;
  /** Historique de la dernière fenêtre fermée, et sa page de départ : la rouvrir dessus le reprend. */
  let kept: { url: string; entries: Electron.NavigationEntry[]; index: number } | undefined;

  /** Session de la fenêtre : téléchargements interceptés, agent utilisateur de Chromium sans « Electron ». */
  function acquireSession(): Session {
    if (prepared) return prepared;
    const s = session.fromPartition(ACQUIRE_PARTITION);
    // Un navigateur ordinaire : sans les mentions de l'application et d'Electron, que des sites refusent.
    s.setUserAgent(s.getUserAgent().replace(/\s(cyberpinball|Electron)\/\S+/gi, ''));
    s.on('will-download', (_event, item, contents) => {
      const id = contents?.id ?? -1;
      // Téléchargement direct : la vue cachée qui l'a déclenché l'attend.
      directWaiters.get(id)?.(item);
      // Un média demandé depuis ses propositions : rangé à part, rendu à qui l'a demandé.
      const claim = claims.get(id);
      const visible = Boolean(open && contents === open.view.webContents);
      const dir = claim?.dir ?? events.dir();
      fs.mkdirSync(dir, { recursive: true });
      const target = freeName(dir, item.getFilename());
      item.setSavePath(target);
      const filename = path.basename(target);
      if (!claim || visible) setStatus(t('Téléchargement de {file}…', { file: filename }));
      if (claim?.signal) {
        if (claim.signal.aborted) item.cancel();
        else claim.signal.addEventListener('abort', () => item.getState() === 'progressing' && item.cancel(), { once: true });
      }
      const tracked = track(item, filename, (progress) => (claim ? claim.progress?.(progress) : events.progress(filename, progress)));
      // Le site n'annonce pas la taille : celle qu'affiche sa page, à défaut.
      if (contents && !item.getTotalBytes()) void expectedFrom(contents, filename).then((bytes) => (tracked.expected = bytes));
      item.once('done', (_e, state) => {
        untrack(item);
        if (state === 'completed') {
          if (claim) {
            if (visible) setStatus(t('Reçu : {file}, rendu aux propositions du média. Fermer (Échap) pour revenir.', { file: filename }));
            claim.done({ file: target, filename, urls: item.getURLChain() });
            return;
          }
          setStatus(t('Reçu : {file}, rangé dans la liste d’attente. Fermer (Échap) pour revenir, ou téléchargez autre chose.', { file: filename }));
          events.received(target, { urls: item.getURLChain(), filename });
        } else {
          if (!claim || visible) setStatus(state === 'cancelled' ? t('Téléchargement annulé : {file}', { file: filename }) : t('Téléchargement interrompu : {file}', { file: filename }), true);
          fs.rmSync(target, { force: true });
          const error = state === 'cancelled' ? 'cancelled' : 'interrupted';
          if (claim) claim.done({ error });
          else events.failed(filename, error);
        }
      });
    });
    prepared = s;
    return s;
  }

  /** Téléchargements en cours de la session, par ordre d'arrivée. */
  /** Un téléchargement suivi ; `expected` : la taille lue sur sa page, quand le site ne l'annonce pas. */
  type Tracked = { id: number; item: DownloadItem; filename: string; meter: TransferMeter; progress: TransferProgress; report(p: TransferProgress): void; expected?: number };
  const downloads = new Map<number, Tracked>();

  /** Tailles affichées par la dernière page chargée de chaque vue (fenêtre visible, téléchargement direct). */
  const pageHints = new Map<number, PageSizeHint[]>();

  /** Relève les tailles que montre chaque page chargée : la page de téléchargement qui suit les montre rarement. */
  function watchSizes(contents: Electron.WebContents): void {
    const id = contents.id;
    contents.on('did-stop-loading', () => {
      void readSizes(contents).then((hints) => {
        if (hints.length) pageHints.set(id, hints);
      });
    });
    contents.once('destroyed', () => pageHints.delete(id));
  }

  async function readSizes(contents: Electron.WebContents): Promise<PageSizeHint[]> {
    try {
      if (contents.isDestroyed()) return [];
      const hints = (await contents.executeJavaScript(PAGE_SIZE_PROBE, true)) as unknown;
      return Array.isArray(hints) ? (hints as PageSizeHint[]).filter((h) => typeof h?.size === 'string' && typeof h?.context === 'string') : [];
    } catch {
      return [];
    }
  }

  /** Taille d'un fichier d'après la page d'où il part (celle-ci, sinon la précédente de la même vue). */
  async function expectedFrom(contents: Electron.WebContents, filename: string): Promise<number | undefined> {
    const now = await readSizes(contents);
    return expectedSizeFromPage(now, filename) ?? expectedSizeFromPage(pageHints.get(contents.id) ?? [], filename);
  }
  let nextDownload = 1;
  let sampler: NodeJS.Timeout | undefined;
  let samples = 0;
  /** Téléchargement désigné à la borne (Start), jusqu'à quand. */
  let armed: { id: number; until: number } | undefined;

  function track(item: DownloadItem, filename: string, report: (p: TransferProgress) => void) {
    const id = nextDownload++;
    const meter = createTransferMeter();
    const entry: Tracked = { id, item, filename, meter, progress: meter.update(item.getReceivedBytes(), item.getTotalBytes()), report };
    downloads.set(id, entry);
    sampler ??= setInterval(sample, SAMPLE_MS);
    sendBar();
    return entry;
  }

  function untrack(item: DownloadItem): void {
    for (const [id, d] of downloads) if (d.item === item) downloads.delete(id);
    if (armed && !downloads.has(armed.id)) armed = undefined;
    if (!downloads.size && sampler) {
      clearInterval(sampler);
      sampler = undefined;
    }
    sendBar();
  }

  /** Relevé des téléchargements en cours : le bandeau à chaque fois, le menu un relevé sur deux. */
  function sample(): void {
    const report = ++samples % REPORT_EVERY === 0;
    for (const d of downloads.values()) {
      // Taille annoncée par le site, sinon celle de sa page (approchée).
      const announced = d.item.getTotalBytes();
      const total = announced || d.expected;
      const approx = !announced && Boolean(d.expected);
      if (d.item.isPaused() || d.item.getState() !== 'progressing') {
        // En pause ou interrompu : pas de débit, la mesure repart à la reprise.
        d.meter.pause();
        d.progress = { received: d.item.getReceivedBytes(), ...(total ? { total } : {}), ...(total && approx ? { approx: true } : {}) };
        continue;
      }
      d.progress = d.meter.update(d.item.getReceivedBytes(), total, Date.now(), approx);
      if (report) d.report(d.progress);
    }
    if (armed && Date.now() > armed.until) armed = undefined;
    sendBar();
  }

  /** Lignes du bandeau : une par téléchargement, la dernière résume les autres au-delà de DOWNLOAD_ROWS. */
  function downloadLines(): { lines: DownloadLine[]; more?: string } {
    const all = [...downloads.values()].map((d): DownloadLine => {
      const state = d.item.isPaused() ? 'paused' : d.item.getState() === 'interrupted' ? 'interrupted' : 'progressing';
      const text = formatTransfer(d.progress);
      const percent = transferPercent(d.progress);
      return {
        id: d.id,
        filename: d.filename,
        state,
        ...(percent !== undefined ? { percent } : {}),
        text: state === 'paused' ? t('En pause · {progress}', { progress: text }) : state === 'interrupted' ? t('Interrompu · {progress}', { progress: text }) : text,
        ...(armed?.id === d.id ? { armed: true } : {}),
      };
    });
    if (all.length <= DOWNLOAD_ROWS) return { lines: all };
    // Le téléchargement désigné à la borne reste visible ; les autres se résument.
    const shown = all.slice(0, DOWNLOAD_ROWS - 1);
    const pick = all.find((l) => l.armed);
    if (pick && !shown.includes(pick)) shown[shown.length - 1] = pick;
    const rest = [...downloads.values()].filter((d) => !shown.some((l) => l.id === d.id));
    const sum: TransferProgress = { received: rest.reduce((n, d) => n + d.progress.received, 0) };
    if (rest.every((d) => d.progress.total)) sum.total = rest.reduce((n, d) => n + d.progress.total!, 0);
    if (sum.total && rest.some((d) => d.progress.approx)) sum.approx = true;
    const rate = rest.reduce((n, d) => n + (d.progress.rate ?? 0), 0);
    if (rate > 0) sum.rate = rate;
    return { lines: shown, more: t('Et {n} autres : {progress}', { n: rest.length, progress: formatTransfer(sum) }) };
  }

  /** Hauteur du bandeau : la base (avec la ligne sur l'écran retenu), plus une ligne par téléchargement. */
  function barHeight(rows: number): number {
    return (open?.screenNote ? BAR_WITH_NOTE : BAR) + (rows ? rows * DOWNLOAD_ROW + DOWNLOAD_PAD : 0);
  }

  /** Annule un téléchargement en cours (bouton Annuler, ou Start à la borne). */
  function cancelDownload(id: number): void {
    const d = downloads.get(id);
    armed = undefined;
    if (d && d.item.getState() !== 'completed') d.item.cancel();
  }

  /**
   * Boutons de la borne pour annuler : Start désigne le dernier téléchargement, les flippers
   * en choisissent un autre, Start de nouveau l'annule. Vrai si la touche a servi.
   */
  function cabinetKey(input: Electron.Input): boolean {
    if (input.type !== 'keyDown' || !downloads.size) return false;
    const keys = events.navKeys?.();
    if (!keys) return false;
    const ids = [...downloads.keys()];
    const now = Date.now();
    const current = armed && now <= armed.until && downloads.has(armed.id) ? armed.id : undefined;
    if (keys.confirm.includes(input.code)) {
      if (input.isAutoRepeat) return true;
      if (current !== undefined) cancelDownload(current);
      else armed = { id: ids[ids.length - 1]!, until: now + ARM_MS };
      sendBar();
      return true;
    }
    if (current === undefined) return false;
    const step = keys.previous.includes(input.code) ? -1 : keys.next.includes(input.code) ? 1 : 0;
    if (!step) return false;
    const at = ids.indexOf(current);
    armed = { id: ids[(at + step + ids.length) % ids.length]!, until: now + ARM_MS };
    sendBar();
    return true;
  }

  /** Exit ou Échap pendant qu'un téléchargement est désigné : on renonce, la fenêtre reste. */
  function disarm(): boolean {
    if (!armed || Date.now() > armed.until) return false;
    armed = undefined;
    sendBar();
    return true;
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
    // Le destinataire (fonctions, signal d'arrêt) ne passe pas l'IPC : le bandeau n'en a pas besoin.
    const { claim: _claim, ...request } = open.request;
    const { lines, more } = downloadLines();
    const height = barHeight(lines.length + (more ? 1 : 0));
    open.win.webContents.send('acquire:state', {
      ...request,
      status: open.status,
      warn: open.warn === true,
      screenNote: open.screenNote,
      address: v.getURL(),
      canGoBack: v.navigationHistory.canGoBack(),
      downloads: lines,
      more,
      barHeight: height,
    });
    open.setBar?.(height);
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
    ipcMain.on('acquire:cancel', (e, id: unknown) => {
      if (open && e.sender === open.win.webContents && typeof id === 'number') cancelDownload(id);
    });
  }

  /**
   * Ouvre (ou réutilise) la fenêtre sur la page demandée. Pour la même page de départ
   * que la fenêtre ouverte, ou que la dernière fermée, elle reprend là où l'utilisateur
   * en était, avec son historique (Précédent), sans repartir de la page de départ.
   */
  function show(request: AcquireRequest): void {
    registerIpc();
    const s = acquireSession();
    if (open && !open.win.isDestroyed()) {
      const contents = open.view.webContents;
      const resume = open.request.url === request.url && Boolean(contents.getURL()) && contents.getURL() !== 'about:blank';
      claimFor(contents.id, request.claim);
      open.request = request;
      if (resume) {
        open.status = RESUMED();
        open.warn = false;
      } else {
        open.status = request.status ?? t('Connectez-vous si le site le demande, puis téléchargez le fichier : il sera rangé tout seul.');
        open.warn = request.status !== undefined;
        void contents.loadURL(request.url);
      }
      sendBar();
      // Réduite (Windows+D, Windows+M) : focus() seul ne la rouvre pas.
      if (open.win.isMinimized()) open.win.restore();
      open.win.show();
      open.win.focus();
      bringPointer(open.win.getBounds());
      return;
    }
    const restore = kept?.url === request.url && kept.entries.length ? kept : undefined;
    kept = undefined;
    const win = createWindow({
      title: t('Récupérer : {game}', { game: request.game }),
      show: false,
      frame: false,
      autoHideMenuBar: true,
      backgroundColor: '#030807',
      webPreferences: { preload: path.join(__dirname, 'acquire-preload.js'), contextIsolation: true, sandbox: true },
    });
    win.setMenuBarVisibility(false);
    win.on('page-title-updated', (e) => e.preventDefault());
    // Au-dessus des fenêtres plein écran du menu, sur l'écran qu'elle couvre.
    win.setAlwaysOnTop(true, 'screen-saver');
    const view = new WebContentsView({
      webPreferences: { session: s, contextIsolation: true, sandbox: true, nodeIntegration: false, offscreen: OFFSCREEN },
    });
    win.contentView.addChildView(view);
    open = restore
      ? { win, view, request, status: RESUMED() }
      : { win, view, request, status: request.status ?? t('Connectez-vous si le site le demande, puis téléchargez le fichier : il sera rangé tout seul.'), warn: request.status !== undefined };
    const contents = view.webContents;
    claimFor(contents.id, request.claim);
    watchSizes(contents);
    // Une page qui ouvre un nouvel onglet (lien de téléchargement, MEGA) : dans la même vue.
    contents.setWindowOpenHandler(({ url }) => {
      if (/^https?:/i.test(url)) void contents.loadURL(url);
      return { action: 'deny' };
    });
    for (const event of ['did-navigate', 'did-navigate-in-page', 'did-stop-loading'] as const) contents.on(event as 'did-stop-loading', () => sendBar());
    contents.on('did-fail-load', (_e, code, description, url, isMainFrame) => {
      if (isMainFrame && code !== -3) setStatus(t('Page inaccessible ({error}) : {url}. Lien mort ? « Retour à la fiche » ou une autre source.', { error: description, url }), true);
    });
    // Une vidéo de la page en plein écran : Échap lui revient (elle en sort).
    let pageFullScreen = false;
    contents.on('enter-html-full-screen', () => (pageFullScreen = true));
    contents.on('leave-html-full-screen', () => (pageFullScreen = false));
    // Échap ferme, comme Exit partout ailleurs ; Exit de la borne aussi, même tapé dans un
    // champ (un encodeur envoie une touche, sans clavier pour la corriger).
    const closing = (input: Electron.Input) =>
      input.type === 'keyDown' && !pageFullScreen && (input.key === 'Escape' || Boolean(events.exitKeys?.().includes(input.code)));
    // Exit pendant qu'un téléchargement est désigné pour l'annulation : on renonce, sans fermer.
    const exit = () => disarm() || close();
    const escape = (e: Electron.Event, input: Electron.Input) => {
      if (!closing(input)) return;
      e.preventDefault();
      exit();
    };
    contents.on('before-input-event', escape);
    win.webContents.on('before-input-event', escape);
    // Le bandeau n'a pas de champ : les boutons de la borne y servent toujours.
    win.webContents.on('before-input-event', (e, input) => cabinetKey(input) && e.preventDefault());
    // La page garde ses touches (Entrée, flèches…) et ce qu'on tape dans un champ : Start n'y
    // désigne un téléchargement que hors d'un champ de saisie, sans retirer la touche à la page.
    contents.on('before-input-event', (_e, input) => {
      if (input.type !== 'keyDown' || !downloads.size || PAGE_KEYS.has(input.code)) return;
      void contents
        .executeJavaScript('(() => { const e = document.activeElement; return Boolean(e && (e.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.tagName))); })()', true)
        .then((typing) => typing || cabinetKey(input))
        .catch(() => undefined);
    });
    onJoystickInput(win, (input) => (closing(input) ? exit() : cabinetKey(input)));
    const viewId = contents.id;
    // Fermée de quelque façon que ce soit (Fermer, Échap, Alt+F4) : l'historique est gardé.
    win.on('close', () => {
      if (contents.isDestroyed()) return;
      const entries = contents.navigationHistory.getAllEntries();
      kept = entries.length ? { url: open?.request.url ?? request.url, entries, index: contents.navigationHistory.getActiveIndex() } : undefined;
    });
    keepInFront(win);
    win.on('closed', () => {
      claims.delete(viewId);
      open = undefined;
      armed = undefined;
      events.closed();
    });
    // Tout un écran, au-dessus du menu, jamais le bureau : celui que donne le menu (choisi ou
    // automatique), sinon l'écran principal de Windows.
    const place = events.screen?.();
    const bounds = place?.bounds ?? primaryRect();
    if (place?.notice) open.screenNote = place.notice;
    coverDisplay(win, bounds);
    open.setBar = fillBelow(win, view, barHeight(0));
    void win.loadFile(path.join(__dirname, '..', 'renderer', 'acquire.html'));
    if (restore) void contents.navigationHistory.restore({ entries: restore.entries, index: restore.index }).catch(() => contents.loadURL(request.url));
    else void contents.loadURL(request.url);
    win.show();
    win.focus();
    bringPointer(bounds);
  }

  /**
   * Tant que la fenêtre est ouverte, aucune autre fenêtre de Cyber Pinball ne passe devant :
   * vraie borne à Pinscape (0.1.3-essai.2), au premier clic dans la page, le fronton (fenêtre
   * du menu en plein écran sur le même écran) reprenait le focus et le premier plan, et la
   * fenêtre « Récupérer » disparaissait derrière. Toute fenêtre de l'application qui prend le
   * focus (clic, focus() d'une lecture de script, retour du bureau, bouton du joystick) le
   * rend donc aussitôt à « Récupérer », qui réaffirme son « toujours au-dessus » ; elle le
   * réaffirme aussi chaque fois qu'elle perd le focus au profit de l'application. Fermée,
   * les fenêtres du menu reprennent la main normalement (events.closed).
   */
  function keepInFront(win: BrowserWindow): void {
    const raise = () => {
      if (win.isDestroyed() || OFFSCREEN) return;
      win.setAlwaysOnTop(true, 'screen-saver');
      win.moveTop();
      if (!win.isFocused()) win.focus();
    };
    const otherFocused = (_e: Electron.Event, other: BrowserWindow) => {
      if (other !== win) setImmediate(raise);
    };
    app.on('browser-window-focus', otherFocused);
    win.on('blur', () => setImmediate(() => BrowserWindow.getFocusedWindow() && raise()));
    win.on('always-on-top-changed', (_e, onTop) => onTop || setImmediate(raise));
    win.once('closed', () => app.off('browser-window-focus', otherFocused));
  }

  /**
   * Amène le pointeur au milieu de l'écran de la fenêtre, s'il n'y est pas : sur une borne,
   * il était sur un autre écran, où le menu le cache, ou sur le playfield tourné, où il
   * irait de travers. Hors écran, le pointeur du poste n'est pas touché.
   */
  function bringPointer(bounds: Rectangle): void {
    if (OFFSCREEN) return;
    const at = screen.getCursorScreenPoint();
    if (at.x >= bounds.x && at.x < bounds.x + bounds.width && at.y >= bounds.y && at.y < bounds.y + bounds.height) return;
    const middle = screen.dipToScreenPoint({ x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 });
    try {
      setCursorPosition(middle.x, middle.y);
    } catch (error) {
      console.warn(`Fenêtre « Récupérer » : pointeur non déplacé (${(error as Error).message})`); // i18n-ignore : console
    }
  }

  /** Vues cachées en cours de téléchargement direct : identifiant de leur page -> qui attend le fichier. */
  const directWaiters = new Map<number, (item: DownloadItem) => void>();
  /** Pages dont les téléchargements reviennent à un média : identifiant de la page -> destinataire. */
  const claims = new Map<number, DownloadClaim>();

  function claimFor(id: number, claim: DownloadClaim | undefined): void {
    if (claim) claims.set(id, claim);
    else claims.delete(id);
  }

  /**
   * Vues cachées ouvertes. Une vue qu'aucune fenêtre ne porte et que plus rien ne
   * référence est détruite par le ramasse-miettes, sa page avec : au hasard d'un GC, un
   * minuteur perdait sa page et la fermeture d'une vue après son téléchargement levait
   * « Object has been destroyed », exception qui fige le processus principal derrière la
   * boîte modale d'Electron. Elles restent donc ici jusqu'à closeHidden.
   */
  const hiddenViews = new Set<WebContentsView>();

  /** Vue cachée de la session, sans son, qui ouvre les nouveaux onglets en elle-même. */
  function hiddenView(): WebContentsView {
    const view = new WebContentsView({ webPreferences: { session: acquireSession(), contextIsolation: true, sandbox: true, nodeIntegration: false, offscreen: true } });
    hiddenViews.add(view);
    const contents = view.webContents;
    contents.once('destroyed', () => hiddenViews.delete(view));
    contents.setAudioMuted(true);
    // Un nouvel onglet (lien de téléchargement) : dans la même vue.
    contents.setWindowOpenHandler(({ url: next }) => {
      if (/^https?:/i.test(next)) void contents.loadURL(next).catch(() => undefined);
      return { action: 'deny' };
    });
    return view;
  }

  /** Ferme une vue cachée (sa page, si elle vit encore) et la laisse partir. */
  function closeHidden(view: WebContentsView): void {
    hiddenViews.delete(view);
    if (!view.webContents.isDestroyed()) view.webContents.close();
  }

  /** Attend la fin du chargement de la page (ou le délai). */
  function settled(contents: Electron.WebContents, timeoutMs: number): Promise<void> {
    return new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer);
        contents.off('did-stop-loading', done);
        contents.off('did-fail-load', failed);
        resolve();
      };
      const failed = (_e: unknown, code: number, _d: string, _u: string, main: boolean) => {
        if (main && code !== -3) done();
      };
      const timer = setTimeout(done, timeoutMs);
      contents.on('did-stop-loading', done);
      contents.on('did-fail-load', failed);
    });
  }

  /**
   * Lit une page du site dans une vue cachée de la session de l'utilisateur, à sa
   * demande (une page de résultats de recherche) : le script dit ce que la page
   * montre. Rien n'est cliqué ni suivi.
   */
  async function readPage(url: string, script: string, timeoutMs = 30_000): Promise<unknown> {
    const view = hiddenView();
    const contents = view.webContents;
    try {
      const loaded = settled(contents, timeoutMs);
      contents.loadURL(url).catch(() => undefined);
      await loaded;
      return await contents.executeJavaScript(script, true);
    } finally {
      closeHidden(view);
    }
  }

  /**
   * Image d'une adresse du site (vignette d'un résultat), avec les cookies de la
   * session ; undefined si le site répond autre chose qu'une image.
   */
  async function fetchImage(url: string, file: string, timeoutMs = 20_000): Promise<string | undefined> {
    try {
      const response = await acquireSession().fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
      const type = response.headers.get('content-type') ?? '';
      if (!response.ok || !/^image\//i.test(type)) return undefined;
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, Buffer.from(await response.arrayBuffer()));
      return file;
    } catch {
      return undefined;
    }
  }

  /**
   * Téléchargement direct, sur demande de l'utilisateur déjà connecté : la fiche est
   * chargée dans une vue cachée de sa session, la sonde du site (sitesessions.ts) dit
   * quel lien suivre, au plus quatre pages. Résout dès que le téléchargement commence
   * (la suite passe par les événements habituels : progression, reçu, échec) ; sinon,
   * dit pourquoi il faut montrer la page.
   */
  async function direct(
    url: string,
    site: SourceSite,
    timeoutMs = 45_000,
    opts: DirectOptions = {},
  ): Promise<{ ok: true; filename: string } | { ok: false; reason: string; login?: boolean; quota?: boolean }> {
    const view = hiddenView();
    const contents = view.webContents;
    watchSizes(contents);
    if (opts.claim) claims.set(contents.id, opts.claim);
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
      // Le destinataire n'a servi qu'à l'événement will-download, déjà passé.
      claims.delete(contents.id);
      // La vue reste ouverte jusqu'à la fin du téléchargement, puis se ferme.
      if (item && item.getState() === 'progressing') item.once('done', () => closeHidden(view));
      else closeHidden(view);
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
          probe = { kind: 'show', reason: 'unreadable' };
        }
        if (probe.kind === 'login') {
          finish();
          return { ok: false, login: true, reason: t('vous n’êtes plus connecté à {site}', { site: site.label }) };
        }
        if (probe.kind === 'show' && probe.reason === 'delay' && opts.onWait && WAIT_PROBES[site.engine]) {
          // Minuteur du site : on clique comme un membre, la page décompte elle-même puis
          // lance le téléchargement. On attend ; on ne raccourcit rien.
          const wait = WAIT_PROBES[site.engine]!;
          let clicked = false;
          try {
            clicked = (await contents.executeJavaScript(wait.click, true)) === true;
          } catch {
            clicked = false;
          }
          if (clicked) {
            const deadline = Date.now() + WAIT_MAX_MS;
            while (!started && Date.now() < deadline && !opts.signal?.aborted) {
              await new Promise((r) => setTimeout(r, 1000));
              let left: unknown;
              try {
                left = await contents.executeJavaScript(wait.counter, true);
              } catch {
                left = undefined;
              }
              if (typeof left === 'number') opts.onWait(left);
            }
            // Commencé pendant l'attente (le rappel de will-download l'a posé).
            const item = started as DownloadItem | undefined;
            if (item) {
              finish(item);
              return { ok: true, filename: item.getFilename() };
            }
          }
          finish();
          return { ok: false, reason: opts.signal?.aborted ? t('arrêté') : probeReasonText(probe) };
        }
        if (probe.kind === 'show') {
          finish();
          return { ok: false, reason: probeReasonText(probe), quota: probe.reason === 'quota' };
        }
        next = probe.href;
      }
      finish(started);
      return started ? { ok: true, filename: started.getFilename() } : { ok: false, reason: t('trop de pages avant le fichier') };
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
    readPage,
    fetchImage,
    isOpen: () => Boolean(open && !open.win.isDestroyed()),
    /** Rouvrir la fenêtre sur cette page de départ reprendrait là où l'utilisateur en était. */
    resumable: (url: string) => Boolean((open && !open.win.isDestroyed() && open.request.url === url) || kept?.url === url),
    /** Pour les essais : fenêtre et page affichées. */
    current: () => open,
  };
}

export type Acquirer = ReturnType<typeof createAcquirer>;
