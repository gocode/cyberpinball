// Miroir du navigateur sur le téléphone (télécommande) : la borne capture la fenêtre d'Edge ouverte
// par Cyber Pinball (rubrique Applications, connexion YouTube du Juke-box) et en envoie des JPEG au
// téléphone, sur le WebSocket de la télécommande ; les appuis et glissements du téléphone reviennent
// en clic et en molette dans la fenêtre. Les calculs (conversion des points, taille de l'image,
// adaptation à la liaison) sont dans packages/core/src/remote-mirror.ts.
//
// Règles :
//  - rien n'est capturé tant que le téléphone n'a pas demandé le miroir, ni quand la télécommande
//    n'est pas en train de piloter cette fenêtre (live) ;
//  - une seule capture à la fois et une seule image en vol : la suivante ne part qu'à l'accusé du
//    téléphone (ce même accusé mesure la liaison et règle la taille et la qualité) ;
//  - rien d'automatique dans Edge : aucun port de débogage, aucun drapeau d'automatisation, seulement
//    une capture d'écran de la fenêtre (desktopCapturer) ;
//  - une image noire (vidéo protégée : Netflix, Prime, Disney+) est envoyée telle quelle.

import { mirrorAdapt, mirrorFit, mirrorPoint, mirrorWheel, MIRROR_LEVELS, MIRROR_ZOOM_STEPS_MAX, type MirrorMessage, type MirrorPace, type MirrorRect } from '@cyberpinball/core';

/** Une image capturée : le JPEG et sa taille réelle. */
export interface MirrorShot {
  jpeg: Buffer;
  width: number;
  height: number;
}

export interface MirrorHost {
  /** La télécommande est reliée, en mode navigateur, et pilote une fenêtre externe qui sait être capturée. */
  live(): boolean;
  /** Rectangle de la fenêtre (pixels physiques du bureau), undefined si elle n'existe plus. */
  rect(): MirrorRect | undefined;
  /** Capture de la fenêtre à cette taille ; undefined si elle a échoué. */
  capture(size: { width: number; height: number }, quality: number): Promise<MirrorShot | undefined>;
  /** Message vers le téléphone (scellé par la télécommande). */
  send(message: Record<string, unknown>): void;
  pointer(x: number, y: number): void;
  click(button: 'left' | 'right', count: number): void;
  wheel(dx: number, dy: number): void;
  /** Zoom de la page d'un pas : 1 agrandit, -1 rapetisse (Ctrl+ et Ctrl- dans la fenêtre). Absent : les boutons de zoom de la page ne font rien. */
  zoom?(dir: 1 | -1): void;
  /**
   * Un doigt sur l'écran de la fenêtre, en pixels physiques du bureau (injection tactile de Windows) : `down`, puis
   * des `move`, puis `up`. Rend faux quand la fenêtre n'en veut pas (site au rendu d'ordinateur, où la molette
   * suffit) ou que Windows refuse : le glissement passe alors par la molette.
   */
  touch?(phase: 'down' | 'move' | 'up', x: number, y: number): boolean;
  log?(line: string): void;
  /** Essais : horloge et minuterie remplaçables. `after` rend la fonction qui l'annule. */
  now?(): number;
  after?(ms: number, fn: () => void): () => void;
}

/** Une image restée sans accusé plus longtemps que cela est abandonnée (téléphone parti, page figée). */
export const MIRROR_FRAME_TIMEOUT_MS = 8000;
/** Échecs de capture de suite avant de le dire au téléphone. */
export const MIRROR_FAILS_BEFORE_NOTICE = 5;
/** Délai de la nouvelle tentative quand rien n'est capturable (fenêtre absente, capture en échec). */
const RETRY_MS = 500;
/** Un doigt resté posé sans nouvelle du téléphone (liaison coupée en plein geste) est levé après ce délai. */
export const MIRROR_TOUCH_IDLE_MS = 1500;

export interface PhoneMirror {
  /** Demande (on) ou fin (off) du miroir ; `box` : la place de l'image au téléphone, en pixels. */
  request(on: boolean, box: { w: number; h: number }): void;
  /** Accusé du téléphone pour l'image `n`. */
  ack(n: number): void;
  tap(message: Extract<MirrorMessage, { t: 'tap' }>): void;
  scroll(message: Extract<MirrorMessage, { t: 'mscroll' }>): void;
  /** Boutons de zoom de la page du téléphone : la page de la fenêtre est agrandie ou rapetissée de `steps` pas. */
  zoom(message: Extract<MirrorMessage, { t: 'mzoom' }>): void;
  /** Le miroir est demandé. */
  readonly active: boolean;
  /** Arrête tout : plus de capture, plus d'image attendue. */
  stop(): void;
}

export function createPhoneMirror(host: MirrorHost): PhoneMirror {
  const now = host.now ?? (() => Date.now());
  const after =
    host.after ??
    ((ms, fn) => {
      const t = setTimeout(fn, ms);
      t.unref?.();
      return () => clearTimeout(t);
    });
  let on = false;
  let box = { w: 1, h: 1 };
  /** Change à chaque arrêt : une capture commencée avant n'envoie plus rien. */
  let epoch = 0;
  let seq = 0;
  let capturing = false;
  let inFlight: { n: number; at: number } | undefined;
  let pace: MirrorPace = { level: 0, fast: 0 };
  let intervalMs = 125;
  let cancelTimer: (() => void) | undefined;
  let cancelWatchdog: (() => void) | undefined;
  let failures = 0;
  let noticed = false;
  /** Début de la dernière capture : le rythme (4 à 8 images par seconde) se compte d'un début à l'autre. */
  let startedAt = 0;
  /**
   * Glissement en cours. `touch` : un doigt est posé dans la fenêtre à (x, y) (injection tactile) ; sinon le
   * glissement passe par la molette. Une page qui attend un vrai glissement (TikTok au rendu mobile) ne
   * défile pas à la molette : elle reçoit un doigt, avec son élan à la levée.
   */
  let drag: { touch: boolean; x: number; y: number; cancel?: () => void } | undefined;

  /** Lève le doigt posé, s'il y en a un (fin du glissement, arrêt du miroir, silence du téléphone). */
  const liftTouch = () => {
    const d = drag;
    drag = undefined;
    d?.cancel?.();
    if (d?.touch) host.touch?.('up', d.x, d.y);
  };

  const clearTimer = () => {
    cancelTimer?.();
    cancelTimer = undefined;
  };
  const clearWatchdog = () => {
    cancelWatchdog?.();
    cancelWatchdog = undefined;
  };
  const schedule = (ms: number) => {
    clearTimer();
    cancelTimer = after(Math.max(0, ms), () => {
      cancelTimer = undefined;
      void pump();
    });
  };

  async function pump(): Promise<void> {
    if (!on || capturing || inFlight) return;
    if (!host.live()) return schedule(RETRY_MS);
    const rect = host.rect();
    if (!rect) return schedule(RETRY_MS);
    const level = MIRROR_LEVELS[pace.level]!;
    const size = mirrorFit(rect, box, level.scale);
    const mine = epoch;
    startedAt = now();
    capturing = true;
    let shot: MirrorShot | undefined;
    try {
      shot = await host.capture(size, level.quality);
    } catch (e) {
      host.log?.(`Miroir : capture impossible (${e instanceof Error ? e.message : String(e)})`); // i18n-ignore : journal
    }
    capturing = false;
    if (mine !== epoch || !on) {
      // Arrêté (ou arrêté puis redemandé) pendant la capture : rien ne part ; la demande en cours, s'il y en a une, reprend.
      if (on && !inFlight && !cancelTimer) schedule(0);
      return;
    }
    if (!host.live()) return schedule(RETRY_MS);
    if (!shot) {
      failures++;
      if (failures >= MIRROR_FAILS_BEFORE_NOTICE && !noticed) {
        noticed = true;
        host.send({ t: 'mirror-state', ok: false });
      }
      return schedule(failures >= MIRROR_FAILS_BEFORE_NOTICE ? 1000 : RETRY_MS / 2);
    }
    failures = 0;
    if (noticed) {
      noticed = false;
      host.send({ t: 'mirror-state', ok: true });
    }
    const n = ++seq;
    inFlight = { n, at: now() };
    host.send({ t: 'frame', n, w: shot.width, h: shot.height, d: shot.jpeg.toString('base64') });
    clearWatchdog();
    cancelWatchdog = after(MIRROR_FRAME_TIMEOUT_MS, () => {
      cancelWatchdog = undefined;
      if (inFlight?.n !== n) return;
      inFlight = undefined;
      host.log?.('Miroir : image sans accusé, reprise'); // i18n-ignore : journal
      pace = mirrorAdapt(pace, 10_000);
      schedule(0);
    });
  }

  function stop(): void {
    liftTouch();
    on = false;
    epoch++;
    inFlight = undefined;
    failures = 0;
    noticed = false;
    clearTimer();
    clearWatchdog();
  }

  return {
    get active() {
      return on;
    },
    request(wanted, size) {
      if (!wanted) return stop();
      const resized = size.w !== box.w || size.h !== box.h;
      box = { w: Math.max(1, size.w), h: Math.max(1, size.h) };
      if (on) {
        // Déjà en route (la place de l'image a changé, ou la demande est répétée) : on garde le fil.
        if (resized && !inFlight && !capturing) schedule(0);
        return;
      }
      stop();
      on = true;
      pace = { level: 0, fast: 0 };
      intervalMs = 125;
      schedule(0);
    },
    ack(n) {
      if (!on || !inFlight || n !== inFlight.n) return;
      const rtt = now() - inFlight.at;
      inFlight = undefined;
      clearWatchdog();
      const next = mirrorAdapt(pace, rtt);
      pace = { level: next.level, fast: next.fast };
      intervalMs = next.intervalMs;
      schedule(intervalMs - (now() - startedAt));
    },
    tap(m) {
      if (!on || !host.live()) return;
      const rect = host.rect();
      if (!rect) return;
      const p = mirrorPoint(rect, m.fx, m.fy);
      host.pointer(p.x, p.y);
      host.click(m.button, m.count);
    },
    scroll(m) {
      if (!on || !host.live()) return;
      const rect = host.rect();
      if (!rect) return;
      const p = mirrorPoint(rect, m.fx, m.fy);
      // Début de glissement : un doigt si la fenêtre en veut un, sinon la molette pour tout le glissement.
      if (!drag) {
        if (m.end && m.dx === 0 && m.dy === 0) return;
        drag = { touch: host.touch?.('down', p.x, p.y) === true, x: p.x, y: p.y };
      }
      const d = drag;
      if (!d.touch) {
        if (m.end) drag = undefined;
        const wheel = mirrorWheel(rect, m.dx, m.dy);
        if (wheel.deltaX === 0 && wheel.deltaY === 0) return;
        host.pointer(p.x, p.y);
        host.wheel(wheel.deltaX, wheel.deltaY);
        return;
      }
      // Le doigt suit le doigt du téléphone, sans sortir de la fenêtre.
      const right = Math.round(rect.x) + Math.max(1, Math.round(rect.width)) - 1;
      const bottom = Math.round(rect.y) + Math.max(1, Math.round(rect.height)) - 1;
      d.x = Math.min(right, Math.max(Math.round(rect.x), d.x + Math.round(m.dx * rect.width)));
      d.y = Math.min(bottom, Math.max(Math.round(rect.y), d.y + Math.round(m.dy * rect.height)));
      if (m.end) return liftTouch();
      host.touch?.('move', d.x, d.y);
      d.cancel?.();
      d.cancel = after(MIRROR_TOUCH_IDLE_MS, liftTouch);
    },
    zoom(m) {
      if (!on || !host.live() || !host.rect()) return;
      const dir = m.steps > 0 ? 1 : -1;
      for (let i = Math.min(MIRROR_ZOOM_STEPS_MAX, Math.abs(m.steps)); i > 0; i--) host.zoom?.(dir);
    },
    stop,
  };
}

/**
 * La méthode `capture` d'une session (Edge de la connexion YouTube, navigateur des Applications) :
 * présente seulement si les gestes de fenêtre savent capturer (`ops().capture`), pour que le téléphone
 * ne propose le miroir que là où il marche. `win` : la fenêtre trouvée, ou undefined tant qu'elle ne l'est pas.
 */
export function windowCapture(
  ops: () => { capture?(win: unknown, size: { width: number; height: number }, quality: number): Promise<MirrorShot | undefined> },
  win: () => unknown,
): { capture?: (size: { width: number; height: number }, quality: number) => Promise<MirrorShot | undefined> } {
  const o = ops();
  const capture = o.capture;
  if (!capture) return {};
  return {
    capture: (size, quality) => {
      const w = win();
      return w ? capture.call(o, w, size, quality) : Promise.resolve(undefined);
    },
  };
}

/**
 * Capture de la fenêtre dont le HWND (`handle`) est donné, à la taille demandée, en JPEG. Par
 * desktopCapturer (type « window ») : la capture d'écran de Chromium, rien dans Edge. La fenêtre est
 * retrouvée par son identifiant « window:<HWND>:… ». Electron est chargé à la demande : ce module
 * reste utilisable dans les essais, hors d'Electron.
 */
export async function captureWindow(handle: bigint | number, size: { width: number; height: number }, quality: number): Promise<MirrorShot | undefined> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { desktopCapturer } = require('electron') as typeof import('electron');
  const prefix = `window:${handle.toString()}:`;
  const sources = await desktopCapturer.getSources({ types: ['window'], thumbnailSize: size, fetchWindowIcons: false });
  const source = sources.find((s) => s.id.startsWith(prefix));
  if (!source || source.thumbnail.isEmpty()) return undefined;
  const real = source.thumbnail.getSize();
  return { jpeg: source.thumbnail.toJPEG(quality), width: real.width, height: real.height };
}
