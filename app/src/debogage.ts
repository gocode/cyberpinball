// Mode débogage (packages/core/src/debogage.ts, Menu système > Ma borne > Santé et sauvegardes > Mode débogage) :
// la collecte et la fenêtre. Une mesure par seconde, seulement quand le mode est allumé (éteint, rien ne tourne :
// pas de minuterie, pas de fenêtre, les pages ne comptent plus leurs images) :
//   - la cadence de chaque fenêtre du front-end, comptée par les pages (renderer/debogage-cadence.js) ;
//   - la cadence de VPX en partie, lue dans vpinball.log (la ligne « Cadence live » du plugin du DMD, que
//     VPX écrit seulement quand on le lui demande : env()) ;
//   - le processeur et la mémoire (de tout le PC, de Cyber Pinball, de VPX), les écrans (définition, fréquence) ;
//   - les étapes du lancement et le temps de chargement des médias de la table choisie.
// Ce que la fenêtre montre est calculé par buildDebugView (core), la page (renderer/debogage.js) le dessine.
//
// La fenêtre est celle des notifications pendant la partie (game-notice.ts, overlay) : transparente, sans focus,
// les clics la traversent, hors des captures ; elle ne prend jamais la main à VPX. Posée dans le coin haut droit du
// joueur de l'écran choisi (le coin haut gauche est celui des invitations), la bande du DMD en bas de son écran.
// Closes au lancement de la partie comme toute fenêtre au premier plan (closeTopmostWindows) : la minuterie la
// recrée aussitôt, elle ne dépend d'aucun événement.

import * as fs from 'node:fs';
import * as os from 'node:os';
import {
  buildDebugView,
  chooseDebugRole,
  debugLayout,
  DebugRing,
  debugReportJson,
  gameNoticeBounds,
  parseLiveCadence,
  parseStallLine,
  readDebugSettings,
  readScreenCap,
  readVpxTargetFps,
  readVpxWindows,
  ROLES,
  stallCause,
  t,
  writeDebugSettings,
  type DebugInput,
  type DebugLaunchStep,
  type DebugLayout,
  type DebugMediaTime,
  type DebugPhase,
  type DebugSample,
  type DebugScreenSample,
  type DebugSettings,
  type DebugView,
  type LiveCadence,
  type ObservedDisplay,
  type Rect,
  type RoleId,
  type Rotation,
  type VpxCadence,
} from '@cyberpinball/core';
import { displayRefresh, processCpuMs } from '@cyberpinball/win-displays';
import { app, ipcMain, type BrowserWindow } from 'electron';
import { alive, dispose, overlay, raise, type Overlay } from './game-notice';
import { isShown } from './offscreen';

/** Ce que le mode débogage demande au front-end. */
export interface DebugHost {
  dataDir: string;
  version: string;
  /** Place d'un rôle sur le bureau (pixels physiques) et le sens de sa mise en page ; undefined : pas d'écran. */
  place(role: RoleId): { zone: Rect; rotation: Rotation } | undefined;
  displays(): ObservedDisplay[];
  /** Où en est le front-end. */
  phase(): DebugPhase;
  /** Une partie dans le casque : rien à montrer sur les écrans. */
  vr(): boolean;
  /**
   * Le mode bureau (Bureau Windows) est ouvert : aucune fenêtre de Cyber Pinball ne doit revenir sur un écran.
   * Sans cela (signalement du 24/11/2026), la mesure à la seconde remettait la fenêtre devant (raise), et le mode
   * bureau y voyait une fenêtre rouverte par le joueur : retour immédiat au front-end, le bureau était inaccessible.
   */
  desktop?(): boolean;
  /** Les fenêtres du front-end, une par écran. */
  windows(): ReadonlyMap<RoleId, BrowserWindow>;
  /** La table que la roue montre, ou que la partie joue. */
  table(): string | undefined;
  gpu(): { name: string; vramMb?: number } | undefined;
  /** La fenêtre étrangère (VPX, PuP…) qui passe devant la nôtre, décrite pour le journal ; undefined : rien devant. */
  coveredBy?(win: BrowserWindow): string | undefined;
  /** Essais sans opérateur : capture de ce que la fenêtre montre. */
  captureDir?: string;
  log(line: string): void;
}

export interface DebugController {
  settings(): DebugSettings;
  update(change: Partial<DebugSettings>): void;
  /** Une partie VPX commence : son journal est suivi. */
  gameBegin(game: { pid: number | undefined; vpxLog: string | undefined }): void;
  /** La table est à l'écran. */
  playing(): void;
  gameEnd(): void;
  /** Le Start vient d'être pressé : l'heure de départ des étapes du lancement. */
  launchBegin(): void;
  launchStep(step: 'prepare' | 'rom' | 'launched' | 'windows'): void;
  /** Ce qu'il faut ajouter à l'environnement de VPX pour qu'il dise sa cadence chaque seconde. */
  env(): Record<string, string>;
  /** Les mesures des dernières minutes, pour le rapport ; undefined : aucune. */
  report(): string | undefined;
  /** La fenêtre se retire d'elle-même, avant que la partie ferme toute fenêtre au premier plan (closeTopmostWindows) : sans bruit au journal ; la mesure suivante la recrée. */
  releaseWindow(): void;
  /** Une seconde de plus, tout de suite (essais). */
  tick(): void;
  /** La vue montrée en ce moment (essais). */
  view(): DebugView | undefined;
  close(): void;
}

const TICK_MS = 1000;
/** Une mesure d'une page plus vieille que cela n'est plus montrée. */
const PACE_FRESH_MS = 3500;
/** Au plus ce qu'on lit d'un coup dans vpinball.log. */
const LOG_READ_MAX = 512 * 1024;
const RING_SECONDS = 600;
/** Variable d'environnement qui prie le plugin du DMD de VPX de dire sa cadence chaque seconde (dmd-suivi.cpp). */
const LIVE_ENV = 'CYBERPINBALL_CADENCE_DIRECTE';

/** Taille vue du joueur, sur un petit côté de 1 080 px : le cadre de la fenêtre (le panneau et la marge de son halo). */
const DESIGN: Record<Exclude<DebugLayout, 'bar'>, { width: number; height: number }> = {
  compact: { width: 920, height: 104 },
  detailed: { width: 648, height: 880 },
  reduced: { width: 608, height: 640 },
};
/** Marge du halo : le panneau est posé à 24 + 24 de l'angle. */
const HALO = 24;
/** Sur le plateau, hors partie : sous la barre du joueur et de son niveau. */
const BELOW_TOP_BAR = 100;
/** Bande du DMD : sa hauteur dans l'unité du DMD (390 de haut). */
const BAR_DESIGN_HEIGHT = 124;
const DMD_REFERENCE = 390;

const num = (v: unknown, max: number): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.min(v, max) : undefined);

export function createDebug(host: DebugHost): DebugController {
  let setting = readDebugSettings(host.dataDir);
  const ring = new DebugRing(RING_SECONDS);
  let timer: NodeJS.Timeout | undefined;
  let win: Overlay | undefined;
  let winKey = '';
  let shownView: DebugView | undefined;
  let shownLayout: DebugLayout | undefined;
  let capturedKey = '';
  /** Ce qu'il faut montrer maintenant : envoyé dès que la page est chargée (une fenêtre neuve met un instant à se charger, la vue a changé depuis). */
  let current: { view: DebugView; unit: number; rotation: Rotation; design: { width: number; height: number } } | undefined;
  let pagesNotified: boolean | undefined;

  // Processeur de tout le PC : l'écart de deux relevés de os.cpus().
  let cpuLast: { idle: number; total: number } | undefined;
  const cpuNow = () => {
    let idle = 0;
    let total = 0;
    for (const c of os.cpus()) {
      idle += c.times.idle;
      total += c.times.user + c.times.nice + c.times.sys + c.times.irq + c.times.idle;
    }
    return { idle, total };
  };
  // Processeur de VPX : son temps depuis son départ, relevé à chaque seconde.
  let vpxCpuLast: { ms: number; at: number } | undefined;

  // Mesures des pages (front-end hors partie).
  const pace = new Map<RoleId, { fps: number; worst: number; at: number }>();
  const hzCache = new Map<string, { hz: number; at: number }>();

  // La partie : son journal, ce qu'il en reste à lire.
  let game: { pid: number | undefined; vpxLog: string | undefined; offset: number; since: number } | undefined;
  let live: LiveCadence | undefined;
  let liveAt = 0;
  let stall: { ms: number; at: number; cause?: string } | undefined;
  const head: string[] = [];
  const lineTail: LiveCadence[] = [];
  /** Les lignes « Cadence live » lues et pas encore mises en échantillon : une seconde de partie chacune, jamais comptée deux fois ni perdue si deux arrivent entre deux mesures. */
  const liveQueue: LiveCadence[] = [];
  let cap: { name: string; hz: number } | undefined;
  let target: number | undefined;

  // Lancement et phases.
  let launchAt = 0;
  const steps = new Map<string, number>();
  let playingAt = 0;
  let phaseKey = '';
  let phaseSince = Date.now();
  const previousLaunch = new Map<string, number>();

  // Médias de la table choisie (chargés par les fenêtres du front-end).
  let media: { table: string; rows: Map<RoleId, DebugMediaTime> } | undefined;

  const enabled = () => setting.mode !== 'off';
  /**
   * VPX hérite de l'environnement de Cyber Pinball au lancement : la variable est posée dès que le mode est allumé pour les parties,
   * et retirée sinon. Elle ne change qu'avec le réglage, jamais pendant un lancement ; une partie sans le plugin à jour l'ignore.
   */
  const applyEnv = () => {
    if (enabled() && setting.inGame) process.env[LIVE_ENV] = '1';
    else delete process.env[LIVE_ENV];
  };
  applyEnv();

  // ----- Ce que les pages envoient
  ipcMain.on('debug-pace', (_event, raw: unknown) => {
    if (!enabled()) return;
    const r = (raw ?? {}) as Record<string, unknown>;
    const role = ROLES.find((x) => x.id === r.role)?.id;
    const fps = num(r.fps, 1000);
    const worst = num(r.worst, 60_000);
    if (role && fps !== undefined) pace.set(role, { fps, worst: worst ?? 0, at: Date.now() });
  });
  ipcMain.on('debug-media', (_event, raw: unknown) => {
    if (!enabled() || host.phase() !== 'menu') return;
    const r = (raw ?? {}) as Record<string, unknown>;
    const role = ROLES.find((x) => x.id === r.role)?.id;
    const ms = num(r.ms, 600_000);
    const table = host.table();
    if (!role || ms === undefined || !table) return;
    if (media?.table !== table) media = { table, rows: new Map() };
    media.rows.set(role, { role, ms, kind: r.kind === 'video' ? t('vidéo') : t('image') });
  });

  // ----- Écrans
  function displayOf(zone: Rect): ObservedDisplay | undefined {
    const cx = zone.x + zone.width / 2;
    const cy = zone.y + zone.height / 2;
    return host.displays().find((d) => cx >= d.bounds.x && cx < d.bounds.x + d.bounds.width && cy >= d.bounds.y && cy < d.bounds.y + d.bounds.height);
  }
  function hzOf(display: ObservedDisplay | undefined): number | undefined {
    if (!display) return undefined;
    const cached = hzCache.get(display.gdiName);
    if (cached && Date.now() - cached.at < 10_000) return cached.hz || undefined;
    let hz = 0;
    try {
      hz = displayRefresh(display.gdiName)?.hz ?? 0;
    } catch {
      hz = 0;
    }
    hzCache.set(display.gdiName, { hz, at: Date.now() });
    return hz || undefined;
  }
  /** La place d'un rôle, lue une fois par seconde (le plateau relit la borne sur le disque) : le même relevé pour toute la mesure. */
  let places: Map<RoleId, ReturnType<DebugHost['place']>> | undefined;
  function placeOf(role: RoleId): ReturnType<DebugHost['place']> {
    if (!places) return host.place(role);
    if (!places.has(role)) places.set(role, host.place(role));
    return places.get(role);
  }
  const rolesAvailable = () => ROLES.map((r) => r.id).filter((id) => placeOf(id));

  // ----- Journal de VPX
  function readLog(): void {
    if (!game?.vpxLog) return;
    let size = 0;
    try {
      size = fs.statSync(game.vpxLog).size;
    } catch {
      return;
    }
    if (size < game.offset) game.offset = 0;
    if (size === game.offset) return;
    const from = Math.max(game.offset, size - LOG_READ_MAX);
    let text = '';
    try {
      const fd = fs.openSync(game.vpxLog, 'r');
      try {
        const buffer = Buffer.alloc(size - from);
        fs.readSync(fd, buffer, 0, buffer.length, from);
        text = buffer.toString('utf8');
      } finally {
        fs.closeSync(fd);
      }
    } catch {
      return;
    }
    game.offset = size;
    for (const line of text.split(/\r?\n/)) {
      if (!line) continue;
      // Le début de la partie : les écrans que VPX a ouverts et la cadence qu'il vise (relus pour savoir qui bride).
      if (head.length < 600 && /Window #|Synchronization mode/.test(line)) head.push(line);
      const c = line.includes('Cadence live:') ? parseLiveCadence(line) : undefined;
      if (c) {
        live = c;
        liveAt = Date.now();
        lineTail.push(c);
        liveQueue.push(c);
        if (liveQueue.length > 120) liveQueue.shift();
        if (lineTail.length > 60) lineTail.shift();
        continue;
      }
      const s = line.includes('Cadence: stall of') ? parseStallLine(line) : undefined;
      if (s) stall = { ms: s.ms, at: Date.now(), ...(stallCause(s.module) ? { cause: stallCause(s.module)! } : {}) };
    }
    target = readVpxTargetFps(head) ?? target;
  }

  /** La partie calée sur un écran annexe plus lent : le critère de la fiche technique, sur les secondes mesurées. */
  function capOf(): { name: string; hz: number } | undefined {
    if (lineTail.length < 10 || !target) return undefined;
    const sorted = lineTail.map((c) => c.p50).sort((a, b) => a - b);
    const fps = lineTail.reduce((n, c) => n + c.fps, 0) / lineTail.length;
    const asked: VpxCadence = { phase: 'running', frames: 0, durationS: 0, fps, p50: sorted[Math.floor(sorted.length / 2)]!, p95: 0, p99: 0, max: 0, late: 0, stalls: 0 };
    const found = readScreenCap(head, asked, target);
    if (!found) return undefined;
    const windows = readVpxWindows(head);
    const slow = windows.find((w) => w.display === found.display);
    const role = slow ? rolesAvailable().find((id) => id !== 'playfield' && displayOf(placeOf(id)!.zone)?.friendlyName === slow.display) : undefined;
    return { name: role ? (ROLES.find((r) => r.id === role)?.label ?? found.display) : found.display, hz: found.hz };
  }

  // ----- Une seconde
  function sample(phase: DebugPhase): DebugSample {
    const now = Date.now();
    const before = cpuLast;
    cpuLast = cpuNow();
    const cpu = before ? Math.max(0, Math.min(100, (1 - (cpuLast.idle - before.idle) / Math.max(1, cpuLast.total - before.total)) * 100)) : undefined;
    const total = os.totalmem() / 1048576;
    const used = total - os.freemem() / 1048576;
    const cores = Math.max(1, os.cpus().length);
    let appCpu: number | undefined;
    let appMem: number | undefined;
    try {
      const metrics = app.getAppMetrics();
      appCpu = Math.min(100, metrics.reduce((n, m) => n + m.cpu.percentCPUUsage, 0) / cores);
      appMem = Math.round(metrics.reduce((n, m) => n + (m.memory.workingSetSize ?? 0), 0) / 1024);
    } catch {
      // Pas de mesure : la ligne reste sans sa part.
    }
    let vpx: DebugSample['vpx'];
    if (game?.pid && phase !== 'menu') {
      const ms = processCpuMs(game.pid);
      if (ms !== undefined) {
        if (vpxCpuLast && now > vpxCpuLast.at) vpx = { cpu: Math.min(100, Math.max(0, ((ms - vpxCpuLast.ms) / (now - vpxCpuLast.at) / cores) * 100)) };
        vpxCpuLast = { ms, at: now };
      }
    }
    if (live?.memMb !== undefined && now - liveAt <= PACE_FRESH_MS) vpx = { ...vpx, memMb: live.memMb };
    const screens: Partial<Record<RoleId, DebugScreenSample>> = {};
    for (const role of rolesAvailable()) {
      const place = placeOf(role)!;
      const p = pace.get(role);
      const fresh = p && now - p.at <= PACE_FRESH_MS ? p : undefined;
      const hz = hzOf(displayOf(place.zone));
      screens[role] = { width: place.zone.width, height: place.zone.height, ...(hz ? { hz } : {}), ...(fresh && phase === 'menu' ? { fps: fresh.fps, worstMs: fresh.worst } : {}) };
    }
    return { at: now, phase, ...(host.table() ? { table: host.table() } : {}), ...(cpu !== undefined ? { cpu } : {}), ramUsedMb: Math.round(used), ramTotalMb: Math.round(total), ...(appCpu !== undefined || appMem !== undefined ? { app: { ...(appCpu !== undefined ? { cpu: appCpu } : {}), ...(appMem !== undefined ? { memMb: appMem } : {}) } } : {}), ...(vpx ? { vpx } : {}), screens };
  }

  /** Les pages comptent leurs images seulement quand le mode est allumé et le front-end à l'écran. */
  function notifyPages(on: boolean): void {
    if (pagesNotified === on && !on) return;
    pagesNotified = on;
    for (const w of host.windows().values()) if (!w.isDestroyed()) w.webContents.send('debug-pace', on);
  }

  /** Les étapes du lancement : chacune dure de la fin de la précédente (le Start au départ) à son propre repère. */
  function launchSteps(): DebugLaunchStep[] {
    const now = Date.now();
    const defs: [string, string, string][] = [
      ['launched', t('Préparation'), t('INI, ROM, DMD')],
      ['windows', t('VPX charge la table'), t('jusqu’à l’ouverture de ses fenêtres')],
      ['playing', t('VPX finit de charger'), t('jusqu’à la table à l’écran')],
    ];
    const out: DebugLaunchStep[] = [];
    let from = launchAt;
    let waiting = false;
    for (const [id, label, detail] of defs) {
      const at = steps.get(id);
      if (at !== undefined) {
        out.push({ label, detail, ms: Math.max(0, at - from) });
        from = at;
      } else {
        out.push({ label, detail, ...(waiting ? {} : { current: true, ms: Math.max(0, now - from) }) });
        waiting = true;
      }
    }
    return out;
  }
  function input(phase: DebugPhase, role: RoleId): DebugInput {
    const now = Date.now();
    const screens = rolesAvailable().map((id) => {
      const place = placeOf(id)!;
      return { role: id, width: place.zone.width, height: place.zone.height, ...(hzOf(displayOf(place.zone)) ? { hz: hzOf(displayOf(place.zone))! } : {}) };
    });
    const table = host.table();
    const gpu = host.gpu();
    const previousMs = table ? previousLaunch.get(table) : undefined;
    return {
      mode: setting.mode,
      role,
      phase,
      inGame: phase !== 'menu',
      now,
      since: phase === 'loading' ? launchAt : phase === 'playing' ? playingAt || phaseSince : phaseSince,
      ...(table ? { table } : {}),
      samples: ring.samples(),
      screens,
      ...(gpu ? { gpu } : {}),
      ...(target ? { target } : {}),
      ...(cap ? { cap } : {}),
      ...(stall ? { stall } : {}),
      ...(phase === 'loading' ? { launch: { steps: launchSteps(), ...(previousMs ? { previousMs } : {}) } } : {}),
      ...(phase === 'menu' && media && media.table === table ? { media: { table: media.table, rows: [...media.rows.values()] } } : {}),
    };
  }

  // ----- La fenêtre
  function boundsFor(role: RoleId, layout: DebugLayout, phase: DebugPhase): { bounds: Rect; unit: number; rotation: Rotation; design: { width: number; height: number } } | undefined {
    const place = placeOf(role);
    if (!place) return undefined;
    if (layout === 'bar') {
      const unit = place.zone.height / DMD_REFERENCE;
      const height = Math.round(BAR_DESIGN_HEIGHT * unit);
      return { bounds: { x: place.zone.x, y: place.zone.y + place.zone.height - height, width: place.zone.width, height }, unit, rotation: 0, design: { width: Math.round(place.zone.width / unit), height: BAR_DESIGN_HEIGHT } };
    }
    const unit = Math.min(place.zone.width, place.zone.height) / 1080;
    const design = DESIGN[layout];
    const size = { width: Math.round(design.width * unit), height: Math.round(design.height * unit) };
    // Hors partie, le plateau garde sa barre du joueur en haut : la ligne se pose dessous.
    const below = role === 'playfield' && phase === 'menu' ? Math.round(BELOW_TOP_BAR * unit) : 0;
    return { bounds: gameNoticeBounds(place.zone, place.rotation, size, Math.round(HALO * unit), 'top-right', below), unit, rotation: place.rotation, design };
  }

  function closeWindow(): void {
    dispose(win);
    win = undefined;
    winKey = '';
    shownView = undefined;
    shownLayout = undefined;
  }

  function present(view: DebugView, role: RoleId, phase: DebugPhase): void {
    const at = boundsFor(role, view.layout, phase);
    if (!at) return closeWindow();
    const key = `${role}|${view.layout}|${at.bounds.x},${at.bounds.y},${at.bounds.width},${at.bounds.height}|${at.rotation}`;
    if (alive(win) && winKey !== key) closeWindow();
    if (!alive(win)) {
      win = overlay(at.bounds, key, () => void 0, 'debogage.html');
      win.win.webContents.once('did-finish-load', () => current && send(current.view, current.unit, current.rotation, current.design));
      winKey = key;
    }
    shownView = view;
    shownLayout = view.layout;
    current = { view, unit: at.unit, rotation: at.rotation, design: at.design };
    send(view, at.unit, at.rotation, at.design);
    // Hors partie : à sa place sans rien faire. En partie : par-dessus VPX, et de nouveau devant quand une fenêtre étrangère (PuP…) passe devant.
    const o = win!;
    if (o.loaded) {
      if (!isShown(o.win)) raise(o);
      else if (phase !== 'menu' && host.coveredBy?.(o.win)) raise(o);
    }
  }

  function send(view: DebugView, unit: number, rotation: Rotation, design: { width: number; height: number }): void {
    const o = win;
    if (!alive(o) || !o.loaded) return;
    const state = { view, unit, rotation, design };
    const key = JSON.stringify(state);
    if (key === o.last) return;
    o.last = key;
    o.win.webContents.send('notice:state', state);
    if (host.captureDir && capturedKey !== `${view.layout}|${view.head.context}`) {
      capturedKey = `${view.layout}|${view.head.context}`;
      const dir = host.captureDir;
      const name = `debogage-${view.layout}-${view.head.context.split(' ')[0]!.toLowerCase()}`;
      setTimeout(() => {
        if (!alive(o)) return;
        void o.win.webContents.capturePage().then((image) => {
          fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(`${dir}/${name}.png`, image.toPNG());
        });
      }, 300);
    }
  }

  function tick(): void {
    if (!enabled()) return stop();
    places = new Map();
    try {
      measure();
    } finally {
      places = undefined;
    }
  }

  function measure(): void {
    const phase = host.phase();
    // Revenu au front-end : la partie est finie, son journal n'est plus suivi (la fin de partie n'a pas de crochet de plus dans frontend.ts).
    if (phase === 'menu' && game) controller.gameEnd();
    const key = phase;
    if (key !== phaseKey) {
      phaseKey = key;
      phaseSince = Date.now();
    }
    readLog();
    const s = sample(phase);
    // Chaque seconde de la partie lue dans le journal est un échantillon (le plus souvent une par mesure) ; sans ligne neuve, un échantillon sans cadence.
    const lives = phase === 'playing' ? liveQueue.splice(0) : liveQueue.splice(0, liveQueue.length).slice(0, 0);
    if (lives.length) for (const g of lives) ring.push({ ...s, game: g });
    else ring.push(s);
    if (phase === 'playing') cap = capOf();
    notifyPages(phase === 'menu');
    // La vue : rien en partie dans le casque, ni si le joueur a retiré les parties du mode.
    const hidden = host.vr() || host.desktop?.() === true || (phase !== 'menu' && !setting.inGame);
    const role = chooseDebugRole(setting.screen, rolesAvailable());
    const layout = role ? debugLayout(setting.mode, role, phase !== 'menu') : undefined;
    if (hidden || !role || !layout) return closeWindow();
    const view = buildDebugView(input(phase, role));
    if (!view) return closeWindow();
    present(view, role, phase);
  }

  // Une mesure du mode débogage ne fait jamais tomber le front-end : une erreur (un état pas encore prêt, une
  // fenêtre fermée entre-temps) est dite une fois au journal, la mesure suivante réessaie. Sans cela, elle
  // devenait « A JavaScript error occurred in the main process » et bloquait le démarrage de la borne (24/11/2026).
  let lastFailure = '';
  function safeTick(): void {
    try {
      tick();
      lastFailure = '';
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message !== lastFailure) host.log(`Mode débogage : mesure en échec (${message}), nouvel essai à la seconde suivante.`); // i18n-ignore : journal
      lastFailure = message;
    }
  }

  function start(): void {
    if (timer) return;
    timer = setInterval(safeTick, TICK_MS);
    timer.unref?.();
    // Pas de mesure pendant l'initialisation de l'appelant : frontend.ts crée le mode débogage avant d'autres
    // blocs (la réalité virtuelle, entre autres) dont les rappels de l'hôte dépendent ; dans l'application
    // assemblée (esbuild : const devenu var) ils lisaient `undefined`. La première mesure suit tout de suite, au tour d'après.
    setImmediate(safeTick);
  }

  function stop(): void {
    if (timer) clearInterval(timer);
    timer = undefined;
    closeWindow();
    notifyPages(false);
    ring.clear();
    pace.clear();
    cpuLast = undefined;
    vpxCpuLast = undefined;
  }

  if (enabled()) start();

  const controller: DebugController = {
    settings: () => ({ ...setting }),
    update(change) {
      setting = { ...setting, ...change };
      writeDebugSettings(host.dataDir, setting);
      applyEnv();
      host.log(`Mode débogage : ${setting.mode}, écran ${setting.screen}, ${setting.inGame ? 'aussi en partie' : 'hors partie seulement'}, ${setting.attach ? 'joint aux rapports' : 'pas joint aux rapports'}.`); // i18n-ignore : journal
      if (enabled()) {
        start();
        tick();
      } else stop();
    },
    gameBegin(g) {
      game = { pid: g.pid, vpxLog: g.vpxLog, offset: g.vpxLog && fs.existsSync(g.vpxLog) ? fs.statSync(g.vpxLog).size : 0, since: Date.now() };
      live = undefined;
      liveQueue.length = 0;
      stall = undefined;
      cap = undefined;
      target = undefined;
      head.length = 0;
      lineTail.length = 0;
      vpxCpuLast = undefined;
      playingAt = 0;
    },
    playing() {
      playingAt = Date.now();
      steps.set('playing', playingAt);
      const table = host.table();
      if (table && launchAt) previousLaunch.set(table, playingAt - launchAt);
    },
    gameEnd() {
      game = undefined;
      live = undefined;
      vpxCpuLast = undefined;
    },
    launchBegin() {
      launchAt = Date.now();
      steps.clear();
    },
    launchStep(step) {
      if (!steps.has(step)) steps.set(step, Date.now());
    },
    env: (): Record<string, string> => (enabled() && setting.inGame ? { [LIVE_ENV]: '1' } : {}),
    report: () => (setting.attach ? debugReportJson(ring, { version: host.version, at: Date.now() }) : undefined),
    tick,
    releaseWindow: closeWindow,
    view: () => shownView,
    close() {
      stop();
    },
  };
  return controller;
}

