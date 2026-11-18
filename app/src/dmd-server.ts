// Image du menu sur le DMD réel (bêta) : dmdserver de libdmdutil (cyberpinball-dmdserver, packages/dmdserver,
// construit sur le dmdutil64.dll de VPX lui-même), lancé caché par Cyber Pinball, tient le matériel ; le menu lui envoie le DMD vivant (packages/core/src/dmdserver.ts pour le
// protocole). Pendant une partie, le menu se déconnecte et VPX s'y connecte à son tour
// ([Plugin.DMDUtil] DMDServer = 1, écrit seulement quand le serveur répond : sinon VPX ouvre le DMD
// lui-même, comme sans l'image du menu). Rien ne s'affiche à l'écran : ni console, ni fenêtre.
//
// Un serveur qui ne répond pas ne doit jamais tenir la carte : avec -w, il relance FindDisplays chaque
// seconde, et PIN2DMDInit de libdmdutil (PIN2DMD.cpp) garde le PIN2DMD ouvert et réservé quand il le
// refuse ensuite (nom inconnu, nom illisible) ; VPX, qui ouvre alors le DMD lui-même, le trouvait pris et
// le DMD restait noir (borne d'un joueur, 18/11/2026). D'où : sans réponse en FIND_TIMEOUT_MS, le serveur
// est arrêté et la sonde du PIN2DMD dit pourquoi (pin2dmd-probe.ts) ; et avant une partie que VPX ne lui
// confie pas, il est arrêté et attendu (handDmdToVpx).

import { spawn, type ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as path from 'node:path';
import { DMDSERVER_ADDR, DMDSERVER_PORT, dmdServerFrame, dmdServerIni, dmdServerNotFoundProblem, dmdServerWanted, loadCabinet, t, type DmdColors, type DmdDots } from '@cyberpinball/core';
import { locations, vpxInstall } from './paths';
import { clearPin2dmdProbe, refreshPin2dmdProbe } from './pin2dmd-probe';
import { usbDevices } from './vpx-ini';

/** cyberpinball-dmdserver.exe (packages/dmdserver) et le dossier plugins\dmdutil de VPX qu'il charge. */
export interface DmdServerProgram {
  exe: string;
  dmdutilDir: string;
}

export interface DmdServerOptions {
  /** Le programme ; undefined : il manque quelque chose (dmdServerProgram dit quoi). */
  program(): DmdServerProgram | undefined;
  /** Où écrire dmdserver.ini. */
  iniPath: string;
  log(line: string): void;
  /** Port et adresse (essais : un faux serveur sur un autre port). */
  port?: number;
  host?: string;
  /** Délai entre deux tentatives de connexion, en ms. */
  retryMs?: number;
  /** Délai avant de relancer un serveur arrêté (DMD débranché, plantage), en ms. */
  restartMs?: number;
  /** Au-delà, un serveur qui n'a trouvé aucun afficheur est arrêté (FIND_TIMEOUT_MS). */
  findTimeoutMs?: number;
  /** Le serveur abandonné faute d'afficheur vient de se terminer : la carte est libre. */
  onGiveUp?(): void;
  /** Le front-end tient l'afficheur. */
  onReady?(): void;
  /** Arguments du programme (essais : un faux serveur) ; dmdServerArgs par défaut. */
  args?(program: DmdServerProgram, iniPath: string): string[];
}

/**
 * Délai pour trouver l'afficheur. Un DMD branché répond en moins d'une seconde (ZeDMD : quelques
 * secondes de poignée de main au plus, ZeDMD en wifi : le temps d'une connexion).
 */
export const FIND_TIMEOUT_MS = 20_000;

/** Attente de la fin du serveur arrêté avant une partie : le système rend la carte à sa sortie. */
const HALT_WAIT_MS = 3000;

/** Arguments du serveur : la DLL de VPX, l'ini, attendre le DMD, journal sur la sortie d'erreur. */
export function dmdServerArgs(program: DmdServerProgram, iniPath: string): string[] {
  return ['-d', program.dmdutilDir, '-c', iniPath, '-w', '-l'];
}

/**
 * Codes de sortie de packages/dmdserver/src/dmdserver.cpp qui ne se règlent pas en relançant : la DLL
 * de VPX absente ou d'une autre version. Les autres (DMD débranché, port pris un instant) : relancé.
 */
export function dmdServerExitProblem(code: number | null): string | undefined {
  if (code === 3) return t('Le module DMD de VPX ne se charge pas (Visual C++ 2015-2022 x64 manquant ?)');
  // 4 : une fonction manque ; 6 : empreinte inconnue (packages/dmdserver/src/empreintes.h), DLL jamais chargée.
  if (code === 4 || code === 6) return t('Version de VPX non prise en charge par le serveur du DMD (VPX 10.8.1 attendu)');
  if (code === 5) return t('Serveur du DMD lancé avec de mauvais arguments');
  return undefined;
}

/** Au-delà, une image est sautée plutôt que mise en file (le serveur ne suit plus). */
const MAX_PENDING_BYTES = 64 * 1024;

export class DmdServerHost {
  private child: ChildProcess | undefined;
  private socket: net.Socket | undefined;
  private connected = false;
  private paused = false;
  private running = false;
  private retry: NodeJS.Timeout | undefined;
  private ini = '';
  private last: Buffer | undefined;
  /** Le serveur lancé par une autre session de Cyber Pinball ou à la main : on s'y connecte sans le lancer. */
  private external = false;
  private restart: NodeJS.Timeout | undefined;
  /** Arrêt définitif du serveur (dmdServerExitProblem), jusqu'au prochain démarrage. */
  private failure: string | undefined;
  /** Les choix (dmdserver.ini) avec lesquels il s'est arrêté pour de bon. */
  private failedIni = '';
  /** Échéance de la recherche de l'afficheur (FIND_TIMEOUT_MS), jusqu'à la première connexion. */
  private giveUp: NodeJS.Timeout | undefined;
  /** Abandonné faute d'afficheur : au bout de combien de secondes. Réessayé au prochain applyMenuDmdServer. */
  private searchFailed: number | undefined;

  constructor(private readonly options: DmdServerOptions) {}

  /** Le serveur tient le DMD et le menu y est connecté : VPX peut lui envoyer ses images. */
  ready(): boolean {
    return this.running && this.connected && (this.external || (this.child !== undefined && this.child.exitCode === null));
  }

  /** Le serveur s'est arrêté pour de bon (DLL de VPX absente ou d'une autre version) : pourquoi. */
  problem(): string | undefined {
    return this.failure;
  }

  /** Abandonné faute d'afficheur (FIND_TIMEOUT_MS) : au bout de combien de secondes ; undefined sinon. */
  notFound(): number | undefined {
    return this.searchFailed;
  }

  /** Le serveur doit-il tourner ? Démarré, il suit les choix de « DMD réel » (dmdserver.ini). */
  active(): boolean {
    return this.running;
  }

  /**
   * Démarre (ou redémarre si les choix ont changé) le serveur avec ce dmdserver.ini. Sans le
   * programme, rien ne démarre : VPX garde le DMD en direct.
   */
  start(ini: string): void {
    const program = this.options.program();
    if (!program) return this.stop();
    if (this.running && ini === this.ini) return;
    // Arrêté pour de bon avec ces mêmes choix (DLL de VPX refusée) : pas de nouvel essai à chaque retour au menu.
    if (this.failure && ini === this.failedIni) return;
    this.stop();
    this.ini = ini;
    this.running = true;
    this.failure = undefined;
    this.searchFailed = undefined;
    fs.mkdirSync(path.dirname(this.options.iniPath), { recursive: true });
    fs.writeFileSync(this.options.iniPath, ini);
    void this.launch(program);
  }

  /** Arrête le serveur (quitter, image du menu coupée, aucun DMD allumé). */
  stop(): void {
    this.running = false;
    this.external = false;
    this.searchFailed = undefined;
    clearTimeout(this.restart);
    clearTimeout(this.giveUp);
    this.giveUp = undefined;
    this.disconnect();
    if (this.child && this.child.exitCode === null) this.child.kill();
    this.child = undefined;
    this.ini = '';
  }

  /** Avant une partie : le menu lâche l'afficheur, VPX le prendra. */
  pause(): void {
    this.paused = true;
    this.disconnect();
  }

  /**
   * Avant une partie. throughServer : VPX passera par le serveur ([Plugin.DMDUtil] DMDServer = 1, écrit
   * par la synchronisation) ; le menu lâche seulement l'afficheur. Sinon VPX ouvrira le DMD lui-même : le
   * serveur lancé par Cyber Pinball (qui cherche encore l'afficheur, ou ne répondait pas à la
   * synchronisation) est arrêté, et sa fin attendue : il pourrait tenir la carte. Relancé au retour
   * (applyMenuDmdServer).
   */
  async handOver(throughServer: boolean): Promise<void> {
    this.pause();
    const child = this.child;
    if (throughServer || this.external || !child) return;
    this.options.log('dmdserver : arrêté avant la partie (il ne tenait pas l’afficheur) : VPX ouvre le DMD lui-même.'); // i18n-ignore : journal
    this.stop();
    if (child.exitCode !== null) return;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, HALT_WAIT_MS);
      child.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  /** Aucun afficheur trouvé dans le délai : le serveur s'arrête et ne se relance pas de lui-même. */
  private giveUpSearch(timeoutMs: number): void {
    this.giveUp = undefined;
    if (!this.running || this.connected || this.external) return;
    const seconds = Math.round(timeoutMs / 1000);
    this.options.log(`dmdserver : aucun afficheur trouvé en ${seconds} s, arrêté ; VPX ouvre le DMD lui-même pendant les parties.`); // i18n-ignore : journal
    const child = this.child;
    this.running = false;
    this.searchFailed = seconds;
    clearTimeout(this.restart);
    this.disconnect();
    this.child = undefined;
    // La sonde attend que le serveur soit sorti : c'est alors que le système rend la carte.
    const done = () => this.options.onGiveUp?.();
    if (child && child.exitCode === null) {
      child.once('exit', done);
      child.kill();
    } else done();
  }

  /** Après une partie : le menu reprend l'afficheur et renvoie sa dernière image. */
  resume(): void {
    this.paused = false;
    if (this.running) this.connect();
  }

  /** Une image du DMD du menu. Sautée si le serveur ne suit pas, ou pendant une partie. */
  send(dots: DmdDots, color: string, colors?: DmdColors): void {
    this.last = dmdServerFrame(dots, color, colors);
    this.write(this.last);
  }

  private write(frame: Buffer): void {
    const s = this.socket;
    if (!s || !this.connected || this.paused || s.writableLength > MAX_PENDING_BYTES) return;
    s.write(frame);
  }

  private async launch(program: DmdServerProgram): Promise<void> {
    // Un serveur répond déjà sur le port (lancé par une session précédente, ou à la main) : on s'en sert.
    if (await this.listening()) {
      this.external = true;
      this.options.log('dmdserver : déjà à l’écoute, Cyber Pinball s’y connecte sans en lancer un autre.'); // i18n-ignore : journal
      return this.connect();
    }
    if (!this.running) return;
    // Dossier de travail : celui de la DLL de VPX (ses propres DLL à côté d'elle).
    const args = (this.options.args ?? dmdServerArgs)(program, this.options.iniPath);
    const child = spawn(program.exe, args, { cwd: program.dmdutilDir, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    this.child = child;
    // Une seule échéance depuis le premier lancement : un serveur qui plante et repart ne la repousse pas.
    if (!this.giveUp) {
      const timeoutMs = this.options.findTimeoutMs ?? FIND_TIMEOUT_MS;
      this.giveUp = setTimeout(() => this.giveUpSearch(timeoutMs), timeoutMs);
    }
    const relay = (data: Buffer) => {
      for (const line of data.toString('utf8').split(/\r?\n/)) if (line.trim()) this.options.log(`dmdserver : ${line.trim()}`);
    };
    child.stdout?.on('data', relay);
    child.stderr?.on('data', relay);
    child.on('error', (error) => this.options.log(`dmdserver : lancement impossible (${error.message}).`)); // i18n-ignore : journal
    child.on('exit', (code) => {
      this.options.log(`dmdserver : arrêté (code ${code ?? '?'}).`); // i18n-ignore : journal
      if (this.child !== child) return;
      this.child = undefined;
      this.disconnect();
      if (!this.running) return;
      // DLL de VPX absente ou d'une autre version : relancer n'y changerait rien.
      this.failure = dmdServerExitProblem(code);
      if (this.failure) {
        this.failedIni = this.ini;
        this.running = false;
        return;
      }
      // DMD débranché, plantage : le serveur repart et attend le DMD (-w).
      this.restart = setTimeout(() => {
        if (this.running && !this.child) void this.launch(program);
      }, this.options.restartMs ?? 2000);
    });
    this.options.log(`dmdserver : lancé (${program.exe}).`); // i18n-ignore : journal
    this.connect();
  }

  /** Le port répond-il déjà ? */
  private listening(): Promise<boolean> {
    return new Promise((resolve) => {
      const probe = net.connect({ host: this.options.host ?? DMDSERVER_ADDR, port: this.options.port ?? DMDSERVER_PORT });
      const done = (ok: boolean) => {
        probe.destroy();
        resolve(ok);
      };
      probe.once('connect', () => done(true));
      probe.once('error', () => done(false));
      probe.setTimeout(500, () => done(false));
    });
  }

  private connect(): void {
    if (!this.running || this.paused || this.socket) return;
    clearTimeout(this.retry);
    const socket = net.connect({ host: this.options.host ?? DMDSERVER_ADDR, port: this.options.port ?? DMDSERVER_PORT });
    socket.setNoDelay(true);
    this.socket = socket;
    socket.once('connect', () => {
      this.connected = true;
      clearTimeout(this.giveUp);
      this.giveUp = undefined;
      this.options.log('dmdserver : le front-end tient l’afficheur.'); // i18n-ignore : journal
      if (this.last) this.write(this.last);
      this.options.onReady?.();
    });
    socket.on('error', () => undefined);
    socket.once('close', () => {
      if (this.socket !== socket) return;
      this.socket = undefined;
      this.connected = false;
      // Le serveur attend encore le DMD (-w), vient de démarrer, ou a coupé le menu : on réessaie.
      if (this.running && !this.paused) this.retry = setTimeout(() => this.connect(), this.options.retryMs ?? 500);
    });
  }

  private disconnect(): void {
    clearTimeout(this.retry);
    const s = this.socket;
    this.socket = undefined;
    this.connected = false;
    s?.destroy();
  }
}

// ---------------------------------------------------------------------------
// Le serveur de la borne : un seul, partagé par le menu, l'écran « DMD réel » et la synchronisation.

const EXE = 'cyberpinball-dmdserver.exe';
let shared: DmdServerHost | undefined;

/** Le serveur fabriqué avec l'application (natif\dmdserver), ou construit en développement. */
export function dmdServerExe(appDir = path.join(__dirname, '..')): string | undefined {
  return [
    path.join(appDir, 'natif', 'dmdserver', EXE),
    path.join(appDir, '..', 'build', 'dmdserver', 'Release', EXE),
    path.join(appDir, '..', '..', 'build', 'dmdserver', 'Release', EXE),
  ].find((f) => fs.existsSync(f));
}

/**
 * Le serveur et le dmdutil64.dll de VPX qu'il charge ; sinon, pourquoi l'image du menu ne peut pas
 * marcher sur cette borne (l'écran « DMD réel » et la santé le disent).
 */
export function dmdServerProgram(): DmdServerProgram | { problem: string } {
  const exe = dmdServerExe();
  if (!exe) return { problem: t('Serveur du DMD absent de cette version de Cyber Pinball') };
  const vpx = vpxInstall(locations());
  if (!vpx) return { problem: t('VPX n’est pas installé : le serveur du DMD s’appuie sur ses fichiers') };
  const dmdutilDir = path.join(path.dirname(vpx.exe), 'plugins', 'dmdutil');
  if (!fs.existsSync(path.join(dmdutilDir, 'dmdutil64.dll'))) return { problem: t('VPX sans son module DMD (plugins\\dmdutil) : réinstallez VPX depuis Cyber Pinball') };
  return { exe, dmdutilDir };
}

const stateListeners: (() => void)[] = [];

/** Le serveur tient l'afficheur, ou vient d'être abandonné faute d'afficheur : la Santé et « DMD réel » se redessinent. */
export function onDmdServerState(listener: () => void): void {
  stateListeners.push(listener);
}

export function menuDmdServer(): DmdServerHost {
  shared ??= new DmdServerHost({
    program: () => {
      const p = dmdServerProgram();
      return 'problem' in p ? undefined : p;
    },
    iniPath: path.join(locations().dataDir, 'dmdserver.ini'),
    log: (line) => console.log(line),
    // La carte est libre : la sonde dit ce que VPX verra en l'ouvrant (nom refusé, carte prise…).
    onGiveUp: () => {
      refreshPin2dmdProbe(usbDevices() ?? []);
      for (const l of stateListeners) l();
    },
    // La carte est au serveur : une sonde la trouverait prise (par lui), la dernière ne vaut plus.
    onReady: () => {
      clearPin2dmdProbe();
      for (const l of stateListeners) l();
    },
  });
  return shared;
}

/** VPX peut-il passer par dmdserver ? (écran « DMD réel ») */
export function dmdServerReady(): boolean {
  return shared?.ready() ?? false;
}

/** Ce que la dernière synchronisation a écrit pour VPX : true, il passe par le serveur (DMDServer = 1). */
let vpxThroughServer = false;

/**
 * Lu par la synchronisation de VPinballX.ini (vpx-ini.ts) : VPX passe par le serveur seulement s'il
 * répond. La réponse est retenue pour handDmdToVpx, juste avant la partie.
 */
export function dmdServerForVpx(): boolean {
  vpxThroughServer = dmdServerReady();
  return vpxThroughServer;
}

/**
 * Juste avant de lancer VPX : le menu lâche l'afficheur ; si la synchronisation a fait ouvrir le DMD à
 * VPX lui-même, le serveur est arrêté, et sa fin attendue, avant que VPX ne parte (handOver).
 */
export function handDmdToVpx(): Promise<void> {
  return menuDmdServer().handOver(vpxThroughServer);
}

/**
 * Pourquoi l'image du menu ne marche pas (programme absent, VPX d'une autre version, aucun afficheur
 * trouvé) ; undefined sinon.
 */
export function dmdServerProblem(): string | undefined {
  const p = dmdServerProgram();
  if ('problem' in p) return p.problem;
  const failure = shared?.problem();
  if (failure) return failure;
  const seconds = shared?.notFound();
  if (seconds === undefined) return undefined;
  return dmdServerNotFoundProblem(usbDevices() ?? [], loadCabinet(locations().dataDir)?.hardwareDmd, seconds);
}

/**
 * Lance, relance ou arrête le serveur d'après les choix de « DMD réel » et les DMD branchés :
 * au démarrage du menu, après un changement de choix, au retour d'une partie.
 */
export function applyMenuDmdServer(): void {
  const setup = loadCabinet(locations().dataDir)?.hardwareDmd;
  const devices = usbDevices() ?? [];
  const server = menuDmdServer();
  if (dmdServerWanted(devices, setup)) server.start(dmdServerIni(devices, setup));
  else server.stop();
  // Serveur arrêté (jamais lancé, ou abandonné faute d'afficheur) : le PIN2DMD est sondé comme VPX
  // l'ouvrira à la prochaine partie (pin2dmd-probe.ts). Serveur lancé : pas de sonde, elle trouverait la
  // carte prise par lui ; la dernière reste dite tant qu'il ne tient pas l'afficheur (onReady l'efface),
  // puis la sonde repart s'il abandonne (onGiveUp).
  if (!server.active()) refreshPin2dmdProbe(devices);
  else if (server.ready()) clearPin2dmdProbe();
}
