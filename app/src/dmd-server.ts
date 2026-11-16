// Image du menu sur le DMD réel (bêta) : dmdserver de libdmdutil (cyberpinball-dmdserver, packages/dmdserver,
// construit sur le dmdutil64.dll de VPX lui-même), lancé caché par Cyber Pinball, tient le matériel ; le menu lui envoie le DMD vivant (packages/core/src/dmdserver.ts pour le
// protocole). Pendant une partie, le menu se déconnecte et VPX s'y connecte à son tour
// ([Plugin.DMDUtil] DMDServer = 1, écrit seulement quand le serveur répond : sinon VPX ouvre le DMD
// lui-même, comme sans l'image du menu). Rien ne s'affiche à l'écran : ni console, ni fenêtre.

import { spawn, type ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as path from 'node:path';
import { DMDSERVER_ADDR, DMDSERVER_PORT, dmdServerFrame, dmdServerIni, dmdServerWanted, loadCabinet, t, type DmdColors, type DmdDots } from '@cyberpinball/core';
import { locations, vpxInstall } from './paths';
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
}

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

  constructor(private readonly options: DmdServerOptions) {}

  /** Le serveur tient le DMD et le menu y est connecté : VPX peut lui envoyer ses images. */
  ready(): boolean {
    return this.running && this.connected && (this.external || (this.child !== undefined && this.child.exitCode === null));
  }

  /** Le serveur s'est arrêté pour de bon (DLL de VPX absente ou d'une autre version) : pourquoi. */
  problem(): string | undefined {
    return this.failure;
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
    fs.mkdirSync(path.dirname(this.options.iniPath), { recursive: true });
    fs.writeFileSync(this.options.iniPath, ini);
    void this.launch(program);
  }

  /** Arrête le serveur (quitter, image du menu coupée, aucun DMD allumé). */
  stop(): void {
    this.running = false;
    this.external = false;
    clearTimeout(this.restart);
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
    const child = spawn(program.exe, dmdServerArgs(program, this.options.iniPath), { cwd: program.dmdutilDir, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    this.child = child;
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
      this.options.log('dmdserver : le front-end tient l’afficheur.'); // i18n-ignore : journal
      if (this.last) this.write(this.last);
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

export function menuDmdServer(): DmdServerHost {
  shared ??= new DmdServerHost({
    program: () => {
      const p = dmdServerProgram();
      return 'problem' in p ? undefined : p;
    },
    iniPath: path.join(locations().dataDir, 'dmdserver.ini'),
    log: (line) => console.log(line),
  });
  return shared;
}

/** VPX peut-il passer par dmdserver ? Lu par la synchronisation avant chaque partie. */
export function dmdServerReady(): boolean {
  return shared?.ready() ?? false;
}

/** Pourquoi l'image du menu ne marche pas (programme absent, VPX d'une autre version…) ; undefined sinon. */
export function dmdServerProblem(): string | undefined {
  const p = dmdServerProgram();
  return 'problem' in p ? p.problem : shared?.problem();
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
}
