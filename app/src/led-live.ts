// Pilote des LED adressables hors partie : lit la description des bandes (CabinetLeds, issue de
// Cabinet.xml) et allume réellement les LED, sans VPX ni DOF. Sert à l'outil de test de l'écran
// « LED et retours (DOF) » ; les animations du front-end (roue, écrans) passent par la même API.
//
// Règles :
// - Cyber Pinball est le seul propriétaire du port série pendant qu'il est ouvert, et il le rend
//   avant toute partie : `gameStarted()` éteint les LED, ferme le port et ne le rouvre plus tant que
//   `gameEnded()` n'a pas été appelé. DOF (dans VPX) retrouve ainsi un port libre.
// - Une image par 1/30 s au plus, jamais deux envois en même temps : si la carte est lente, des
//   images sont sautées, jamais empilées.
// - Les erreurs sont des `LedError` avec un code stable et un message déjà écrit pour l'utilisateur.
// - Mode simulé : un faux Teensy / Wemos D1 (`SimulatedStripDevice`) et un faux nœud Art-Net, sans
//   port ni réseau, pour les essais et les démonstrations hors écran.
//
// API (voir `LedService`) : configure(leds), start(), stop(), setColor(cible, couleur, couche),
// setEffect(cible, effet, couche), setFrame(cible, octets, couche), clearLayer(couche),
// blackout(), setMaster(0..1), gameStarted(), gameEnded(), status(), onStatus(rappel).
// Une cible est le nom d'une bande, ou LED_ALL (« * ») pour toutes. Deux couches : « ambient »
// (animations du front-end) et « test » (outil de configuration, passe devant).

import * as dgram from 'node:dgram';
import {
  ARTNET_PORT,
  LED_ALL,
  LED_BLACK,
  SimulatedStripDevice,
  STRIP_OFF_PACKETS,
  STRIP_PING,
  STRIP_QUERY_MAX,
  artnetFrames,
  artnetPacket,
  artnetTarget,
  createLedFrame,
  ledFramesEqual,
  ledTargetIndexes,
  ledWireOutputs,
  ledsOnBoard,
  ledProblems,
  renderLedEffect,
  stripFramePackets,
  stripSerialConfig,
  stripSetupPackets,
  t,
  type CabinetLeds,
  type LedEffect,
  type LedFrame,
  type LedStripSpec,
  type Rgb,
  type StripPacket,
  type StripSerialConfig,
} from '@cyberpinball/core';
import { DOF_CONTROLLERS } from '@cyberpinball/core';

// ---------------------------------------------------------------------------
// Types publics
// ---------------------------------------------------------------------------

export type LedLayer = 'ambient' | 'test';
const LAYER_ORDER: readonly LedLayer[] = ['ambient', 'test'];

export type LedErrorCode =
  | 'port-busy'
  | 'port-missing'
  | 'port-denied'
  | 'no-answer'
  | 'too-many-leds'
  | 'network'
  | 'on-board'
  | 'game-running'
  | 'not-configured'
  | 'unavailable'
  | 'io';

export class LedError extends Error {
  constructor(
    readonly code: LedErrorCode,
    message: string,
    /** Détail technique pour le journal (jamais montré tel quel). */
    readonly detail?: string,
  ) {
    super(message);
    this.name = 'LedError';
  }
}

export type LedState = 'closed' | 'connecting' | 'running' | 'paused-by-game' | 'error';

export interface LedStatus {
  state: LedState;
  /** Contrôleur décrit (TeensyStripController…), sans lui quand rien n'est configuré. */
  controller?: string;
  /** Port COM ou adresse du nœud, selon le contrôleur. */
  target?: string;
  simulated: boolean;
  /** Images envoyées depuis l'ouverture. */
  frames: number;
  error?: { code: LedErrorCode; message: string };
}

/** Port série ouvert (voir packages/win-displays/src/serial-port.ts). */
export interface LedSerialLink {
  write(data: Uint8Array): Promise<void>;
  read(n: number, timeoutMs: number): Promise<Uint8Array>;
  available(): Promise<number>;
  flushInput(): Promise<void>;
  close(): Promise<void>;
}

export interface LedUdpLink {
  send(data: Uint8Array, address: string, port: number): Promise<void>;
  close(): void;
}

export interface LedTransports {
  /** Ouvre le port ; lève un `LedError` (port-busy, port-missing, port-denied) ou toute autre erreur. */
  openSerial(config: StripSerialConfig): Promise<LedSerialLink>;
  openUdp(): Promise<LedUdpLink>;
}

export interface LedServiceOptions {
  transports?: LedTransports;
  /** Images par seconde (30 par défaut). */
  fps?: number;
  /** Attente (remplaçable : les essais n'attendent pas). */
  sleep?: (ms: number) => Promise<void>;
  /** Horloge des effets, en ms. */
  now?: () => number;
  /** Faux contrôleur et faux nœud, sans port ni réseau. */
  simulated?: boolean;
  /** Délai avant de rouvrir le port après une partie, pour laisser VPX le rendre. */
  resumeDelayMs?: number;
  /** Sans cela, les images partent au rythme de `fps` ; les essais appellent `step()` à la main. */
  manual?: boolean;
  /** Journal (une ligne). */
  log?: (line: string) => void;
}

export interface LedService {
  /** Décrit les bandes à piloter ; une description différente ferme la liaison ouverte. */
  configure(leds: CabinetLeds | undefined): void;
  readonly leds: CabinetLeds | undefined;
  /** Ouvre la liaison avec la carte. Lève un `LedError` explicite ; l'état passe à « error » aussi. */
  start(): Promise<LedStatus>;
  /** Éteint les LED et rend le port. */
  stop(): Promise<void>;
  setColor(target: string, color: Rgb, layer?: LedLayer): void;
  setEffect(target: string, effect: LedEffect | null, layer?: LedLayer): void;
  /** Image donnée telle quelle : 3 octets par LED (rouge, vert, bleu), la première LED d'abord. */
  setFrame(target: string, rgb: Uint8Array, layer?: LedLayer): void;
  clearLayer(layer: LedLayer): void;
  /** Éteint tout, toutes couches : les LED restent éteintes tant que rien n'est redemandé. */
  blackout(): void;
  /** Luminosité générale, de 0 à 1, par-dessus celle de chaque bande. */
  setMaster(level: number): void;
  /** À appeler dès qu'une partie se prépare : éteint, ferme le port, ne le rouvre plus. */
  gameStarted(): Promise<void>;
  /** À appeler au retour d'une partie : rouvre la liaison si elle était voulue. */
  gameEnded(): void;
  /**
   * Partie en cours dont DOF n'a finalement pas le port (table passée aux effets sans ROM) : `start()`
   * redevient possible tout de suite, sans la reprise différée de `gameEnded()`.
   */
  gameReleased(): void;
  status(): LedStatus;
  onStatus(listener: (status: LedStatus) => void): () => void;
  /** Une image : calcule, envoie, rend quand la carte a répondu. Appelée par la minuterie, ou à la main dans les essais. */
  step(): Promise<void>;
  /** Dernière image calculée (couleurs voulues, avant ordre des puces et luminosité). */
  readonly frame: LedFrame;
  /** Mode simulé : ce que montrent les faux contrôleurs. */
  readonly simulation: { device: SimulatedStripDevice; udp: { universe: number; data: Uint8Array }[] } | undefined;
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

function controllerName(leds: CabinetLeds): string {
  return DOF_CONTROLLERS[leds.controller].label;
}

function portBusyMessage(port: string): string {
  return t('{port} est déjà utilisé par un autre programme : une partie en cours (DOF), PinUP Popper, un moniteur série ou l’outil de la carte. Ferme-le, puis réessaie.', { port });
}

function portMissingMessage(port: string): string {
  return t('{port} n’existe pas : la carte est débranchée, ou son port a changé de numéro. Branche-la, puis choisis son port dans « Port série ».', { port });
}

function noAnswerMessage(leds: CabinetLeds, config: StripSerialConfig): string {
  return leds.controller === 'WemosD1MPStripController'
    ? t('La carte sur {port} ne répond pas. Vérifie que c’est bien celle des LED (pas le ZeDMD ou un autre port), son micrologiciel, et le débit : {baud} bauds.', { port: config.port, baud: config.baudRate })
    : t('La carte sur {port} ne répond pas. Vérifie que c’est bien celle des LED, son micrologiciel et le câble USB.', { port: config.port });
}

// ---------------------------------------------------------------------------
// Transports réels
// ---------------------------------------------------------------------------

export function realTransports(): LedTransports {
  return {
    async openSerial(config) {
      // Chargé à la demande : @cyberpinball/win-displays charge koffi, inutile hors Windows ou sans LED.
      const { openSerial, SerialOpenError } = (await import('@cyberpinball/win-displays')) as typeof import('@cyberpinball/win-displays');
      try {
        return openSerial(config.port, { baudRate: config.baudRate, dataBits: config.dataBits, timeoutMs: config.timeoutMs, dtr: config.dtr });
      } catch (error) {
        if (error instanceof SerialOpenError) {
          if (error.reason === 'busy') throw new LedError('port-busy', portBusyMessage(config.port), error.message);
          if (error.reason === 'missing') throw new LedError('port-missing', portMissingMessage(config.port), error.message);
        }
        throw new LedError('io', t('Impossible d’ouvrir {port}.', { port: config.port }), (error as Error).message);
      }
    },
    async openUdp() {
      const socket = dgram.createSocket('udp4');
      await new Promise<void>((resolve, reject) => {
        socket.once('error', reject);
        socket.bind(0, () => {
          socket.off('error', reject);
          try {
            socket.setBroadcast(true);
          } catch {
            // Sans diffusion, une adresse précise reste possible.
          }
          resolve();
        });
      });
      socket.on('error', () => undefined);
      return {
        send: (data, address, port) =>
          new Promise<void>((resolve, reject) => {
            socket.send(data, port, address, (error) => (error ? reject(error) : resolve()));
          }),
        close: () => {
          try {
            socket.close();
          } catch {
            // déjà fermé
          }
        },
      };
    },
  };
}

/** Faux port série devant un `SimulatedStripDevice`. */
function simulatedLink(device: SimulatedStripDevice): LedSerialLink {
  return {
    write: async (data) => device.write(data),
    read: async (n) => device.read(n),
    available: async () => device.available,
    flushInput: async () => void device.read(device.available),
    close: async () => undefined,
  };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Art-Net : le nœud repasse à ses propres effets sans paquet pendant ~2,5 s (WLED), on renvoie avant. */
const ARTNET_KEEPALIVE_MS = 800;
/** Au-delà, une carte série qui ne répond pas n'est plus attendue. */
const OFF_TIMEOUT_MS = 400;

interface Entry {
  effect: LedEffect;
}

export function createLedService(options: LedServiceOptions = {}): LedService {
  const fps = Math.max(1, Math.min(60, options.fps ?? 30));
  const now = options.now ?? (() => Date.now());
  const log = options.log ?? (() => undefined);
  const simulated = options.simulated === true;
  const sleep = options.sleep ?? (simulated ? async () => undefined : realSleep);
  const resumeDelayMs = options.resumeDelayMs ?? 1500;
  const device = simulated ? new SimulatedStripDevice() : undefined;
  const udpSent: { universe: number; data: Uint8Array }[] = [];
  const transports: LedTransports =
    options.transports ??
    (simulated
      ? {
          openSerial: async () => simulatedLink(device!),
          openUdp: async () => ({
            send: async (data) => void udpSent.push({ universe: data[14]! | (data[15]! << 8), data: data.slice(18) }),
            close: () => undefined,
          }),
        }
      : realTransports());

  let leds: CabinetLeds | undefined;
  let state: LedState = 'closed';
  let error: LedStatus['error'];
  let frames = 0;
  let wanted = false;
  let gameActive = false;
  let master = 1;
  let serial: LedSerialLink | undefined;
  let serialConfig: StripSerialConfig | undefined;
  let udp: LedUdpLink | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let sending = false;
  let resumeTimer: ReturnType<typeof setTimeout> | undefined;
  let generation = 0;
  let lastSent: LedFrame | undefined;
  let lastSentAt = 0;
  let sequence = 0;
  let frame: LedFrame = [];
  const listeners = new Set<(s: LedStatus) => void>();
  const layers: Record<LedLayer, Map<string, Entry>> = { ambient: new Map(), test: new Map() };
  let blackedOut = false;

  const status = (): LedStatus => ({
    state,
    ...(leds ? { controller: leds.controller, target: leds.controller === 'ArtNet' ? artnetTarget(leds) : leds.port.trim().toUpperCase() } : {}),
    simulated,
    frames,
    ...(error ? { error } : {}),
  });

  const emit = () => {
    const s = status();
    for (const l of [...listeners]) {
      try {
        l(s);
      } catch {
        // un auditeur fautif ne gêne pas les autres
      }
    }
  };

  const setState = (next: LedState, why?: LedStatus['error']) => {
    state = next;
    error = why;
    emit();
  };

  // --- Liaison ----------------------------------------------------------------

  /** Octets qu'une carte renvoie : `n` octets dans le délai, sinon une erreur d'absence de réponse. */
  async function expect(link: LedSerialLink, config: StripSerialConfig, n: number): Promise<Uint8Array> {
    const got = await link.read(n, config.timeoutMs);
    if (got.length !== n) throw new LedError('no-answer', noAnswerMessage(leds!, config), `expected ${n} bytes, got ${got.length}`);
    return got;
  }

  async function send(link: LedSerialLink, config: StripSerialConfig, packets: readonly StripPacket[]): Promise<void> {
    for (const p of packets) {
      await link.write(p.bytes);
      if (p.acks) {
        const answer = await expect(link, config, p.acks);
        if (answer[0] !== 0x41) throw new LedError('io', t('La carte sur {port} a répondu autre chose que « A » ({code}).', { port: config.port, code: answer[0]! }), 'unexpected answer');
      }
    }
  }

  async function connectSerial(current: CabinetLeds): Promise<void> {
    const config = stripSerialConfig(current);
    const link = await transports.openSerial(config);
    try {
      await sleep(config.openWaitMs);
      await link.flushInput();
      await sleep(simulated ? 0 : 500);
      let commandMode = false;
      for (let attempt = 0; attempt < 20 && !commandMode; attempt++) {
        await link.write(STRIP_PING);
        await sleep(config.handshakeStartWaitMs);
        if ((await link.available()) > 0) {
          const response = await link.read(1, config.timeoutMs);
          if (response.length === 1 && (response[0] === 0x41 || response[0] === 0x4e)) {
            commandMode = true;
            break;
          }
          await link.write(new Uint8Array(3000));
          await sleep(config.handshakeEndWaitMs);
          await link.flushInput();
        }
      }
      if (!commandMode) throw new LedError('no-answer', noAnswerMessage(current, config), 'handshake without answer');
      await link.write(STRIP_QUERY_MAX);
      const info = await expect(link, config, 3);
      if (info[2] !== 0x41) throw new LedError('no-answer', noAnswerMessage(current, config), 'no acknowledgement after M');
      const max = info[0]! * 256 + info[1]!;
      const wanted = Math.max(...config.ledsPerStrip);
      if (wanted > max) {
        throw new LedError('too-many-leds', t('Ta carte accepte {max} LED par sortie au plus, et tu en as décrit {n}. Réduis la bande la plus longue ou répartis-la sur une autre sortie.', { max, n: wanted }));
      }
      await send(link, config, stripSetupPackets(config));
    } catch (e) {
      await link.close().catch(() => undefined);
      throw e;
    }
    serial = link;
    serialConfig = config;
  }

  async function connectNetwork(current: CabinetLeds): Promise<void> {
    try {
      udp = await transports.openUdp();
      // Tout éteint d'abord, comme DOF à l'ouverture de l'univers.
      const blank = artnetFrames(current, ledWireOutputs(current, createLedFrame(current)));
      for (const f of blank) await udp.send(artnetPacket(f.universe, f.data, 0), artnetTarget(current), ARTNET_PORT);
    } catch (e) {
      udp?.close();
      udp = undefined;
      throw new LedError('network', t('Impossible d’envoyer des paquets Art-Net : vérifie que le PC est sur le même réseau que le nœud (Wi-Fi ou câble), et que le pare-feu laisse passer Cyber Pinball.'), (e as Error).message);
    }
  }

  async function start(): Promise<LedStatus> {
    wanted = true;
    if (!leds) {
      const e = new LedError('not-configured', t('Aucune bande de LED n’est décrite : ajoute-en une, puis enregistre.'));
      setState('error', { code: e.code, message: e.message });
      throw e;
    }
    if (gameActive) {
      const e = new LedError('game-running', t('Une partie est en cours : les LED sont à DOF. Reviens ici après la partie.'));
      setState('paused-by-game');
      throw e;
    }
    if (state === 'running') return status();
    const current = leds;
    const g = ++generation;
    const fail = (e: LedError): never => {
      setState('error', { code: e.code, message: e.message });
      log(`LED : ${e.code} : ${e.detail ?? e.message}`);
      throw e;
    };
    if (ledsOnBoard(current.controller)) {
      fail(
        new LedError(
          'on-board',
          t('{controller} : les bandes se décrivent dans l’outil de la carte, et seul DOF les pilote. L’essai se fait en jouant une table configurée.', { controller: controllerName(current) }),
        ),
      );
    }
    const problems = ledProblems(current);
    if (problems.length) fail(new LedError('not-configured', problems[0]!));
    setState('connecting');
    try {
      if (current.controller === 'ArtNet') await connectNetwork(current);
      else await connectSerial(current);
    } catch (e) {
      if (g !== generation) throw e;
      const led = e instanceof LedError ? e : new LedError('io', t('La liaison avec les LED a échoué : {reason}', { reason: (e as Error).message }), (e as Error).message);
      return fail(led);
    }
    if (g !== generation || gameActive) {
      await closeLink();
      throw new LedError('game-running', t('Une partie est en cours : les LED sont à DOF. Reviens ici après la partie.'));
    }
    frame = createLedFrame(current);
    lastSent = undefined;
    frames = 0;
    setState('running');
    if (!options.manual) timer = setInterval(() => void step(), Math.round(1000 / fps));
    await step();
    return status();
  }

  async function closeLink(): Promise<void> {
    if (timer) clearInterval(timer);
    timer = undefined;
    const link = serial;
    const socket = udp;
    serial = undefined;
    udp = undefined;
    lastSent = undefined;
    if (link) await link.close().catch(() => undefined);
    socket?.close();
  }

  /** Éteint les LED avec les paquets qu'il faut, sans attendre une carte muette. */
  async function switchOff(): Promise<void> {
    const current = leds;
    if (!current) return;
    try {
      if (serial && serialConfig) {
        const link = serial;
        const config = { ...serialConfig, timeoutMs: Math.min(serialConfig.timeoutMs, OFF_TIMEOUT_MS) };
        await Promise.race([send(link, config, STRIP_OFF_PACKETS), sleep(OFF_TIMEOUT_MS * 3)]);
      } else if (udp) {
        for (const f of artnetFrames(current, ledWireOutputs(current, createLedFrame(current)))) {
          await udp.send(artnetPacket(f.universe, f.data, sequence++ & 255), artnetTarget(current), ARTNET_PORT);
        }
      }
    } catch {
      // La carte ne répond plus : on rend le port quand même.
    }
  }

  async function stop(): Promise<void> {
    wanted = false;
    generation++;
    if (resumeTimer) clearTimeout(resumeTimer);
    resumeTimer = undefined;
    while (sending) await sleep(5);
    await switchOff();
    await closeLink();
    if (state !== 'closed') setState('closed');
  }

  // --- Images -----------------------------------------------------------------

  function entryFor(name: string, index: number): Entry | undefined {
    for (let i = LAYER_ORDER.length - 1; i >= 0; i--) {
      const map = layers[LAYER_ORDER[i]!];
      const own = map.get(name) ?? map.get(`#${index}`);
      if (own) return own;
      const all = map.get(LED_ALL);
      if (all) return all;
    }
    return undefined;
  }

  function compute(current: CabinetLeds, ms: number): LedFrame {
    const out = createLedFrame(current);
    current.strips.forEach((strip: LedStripSpec, i) => {
      const entry = blackedOut ? undefined : entryFor(strip.name.trim(), i);
      if (entry) out[i]!.set(renderLedEffect(entry.effect, { width: strip.width, height: strip.height, arrangement: strip.arrangement }, ms));
    });
    return out;
  }

  async function step(): Promise<void> {
    const current = leds;
    if (state !== 'running' || !current || sending || gameActive) return;
    const next = compute(current, now());
    frame = next;
    const dueKeepAlive = current.controller === 'ArtNet' && now() - lastSentAt >= ARTNET_KEEPALIVE_MS;
    if (lastSent && ledFramesEqual(lastSent, next) && !dueKeepAlive) return;
    sending = true;
    const g = generation;
    try {
      const outputs = ledWireOutputs(current, next, master);
      if (serial && serialConfig) await send(serial, serialConfig, stripFramePackets(serialConfig, outputs));
      else if (udp) {
        for (const f of artnetFrames(current, outputs)) await udp.send(artnetPacket(f.universe, f.data, sequence++ & 255), artnetTarget(current), ARTNET_PORT);
      }
      lastSent = next;
      lastSentAt = now();
      frames++;
    } catch (e) {
      if (g !== generation) return;
      const led = e instanceof LedError ? e : new LedError('io', t('La liaison avec les LED s’est interrompue : {reason}', { reason: (e as Error).message }), (e as Error).message);
      log(`LED : ${led.code} : ${led.detail ?? led.message}`);
      await closeLink();
      setState('error', { code: led.code, message: led.message });
    } finally {
      sending = false;
    }
  }

  // --- Parties ----------------------------------------------------------------

  async function gameStarted(): Promise<void> {
    gameActive = true;
    generation++;
    if (resumeTimer) clearTimeout(resumeTimer);
    resumeTimer = undefined;
    if (state === 'closed' && !wanted) return;
    if (timer) clearInterval(timer);
    timer = undefined;
    let waited = 0;
    while (sending && waited < 1000) {
      await sleep(5);
      waited += 5;
    }
    await switchOff();
    await closeLink();
    setState('paused-by-game');
  }

  function gameEnded(): void {
    gameActive = false;
    if (!wanted) {
      if (state === 'paused-by-game') setState('closed');
      return;
    }
    if (resumeTimer) clearTimeout(resumeTimer);
    resumeTimer = setTimeout(() => {
      resumeTimer = undefined;
      if (!gameActive && wanted) void start().catch(() => undefined);
    }, resumeDelayMs);
  }

  function gameReleased(): void {
    gameActive = false;
    if (resumeTimer) clearTimeout(resumeTimer);
    resumeTimer = undefined;
    if (state === 'paused-by-game') setState('closed');
  }

  const layerMap = (layer: LedLayer | undefined) => layers[layer ?? 'ambient'];

  return {
    configure(next) {
      const same = leds && next && JSON.stringify(leds) === JSON.stringify(next);
      if (same) return;
      leds = next ? (JSON.parse(JSON.stringify(next)) as CabinetLeds) : undefined;
      if (state === 'running' || state === 'connecting') {
        const again = wanted;
        void stop().then(() => again && void start().catch(() => undefined));
        wanted = again;
      } else if (state === 'error') {
        setState('closed');
      }
      frame = leds ? createLedFrame(leds) : [];
    },
    get leds() {
      return leds;
    },
    start,
    stop,
    setColor(target, color, layer) {
      layerMap(layer).set(target, { effect: { kind: 'solid', color } });
      blackedOut = false;
    },
    setEffect(target, effect, layer) {
      if (effect) layerMap(layer).set(target, { effect });
      else layerMap(layer).delete(target);
      blackedOut = false;
    },
    setFrame(target, rgb, layer) {
      layerMap(layer).set(target, { effect: { kind: 'frame', data: rgb } });
      blackedOut = false;
    },
    clearLayer(layer) {
      layers[layer].clear();
    },
    blackout() {
      blackedOut = true;
      layers.test.clear();
      layers.ambient.clear();
    },
    setMaster(level) {
      master = Math.max(0, Math.min(1, level));
      lastSent = undefined;
    },
    gameStarted,
    gameEnded,
    gameReleased,
    status,
    onStatus(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    step,
    get frame() {
      return frame;
    },
    get simulation() {
      return device ? { device, udp: udpSent } : undefined;
    },
  };
}

/** Couleur noire, pour qui éteint une bande sans passer par `blackout()`. */
export const LED_OFF: Rgb = LED_BLACK;
