// Le menu dans le casque (packages/core/src/casque.ts) : quand la réalité virtuelle est activée et
// le casque prêt, le compagnon natif (packages/casque-vr) montre les écrans de la borne dans le
// casque, posés en borne. Cyber Pinball garde le premier plan : on navigue avec les boutons de la
// borne comme d'habitude. Avant une partie, le compagnon rend le casque à VPX (fin propre de sa
// session OpenXR) ; il le reprend au retour au menu.
//
// Le compagnon : <application>\natif\cyberpinball-casque.exe une fois l'application fabriquée,
// build\casque-vr\Release\ en développement (npm run casque-vr). Le chargeur OpenXR est celui de la
// copie de VPX. Casque absent (Link pas lancé) : nouvel essai toutes les 15 s.

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { anchorHeight, headsetPanels, headsetProtocol, headsetScene, isHeadsetButton, sceneProtocol, type CabinetPlace, type HeadsetButton, type Point3, type HeadsetMenuState, type HeadsetPanel, type HeadsetSource, type RoleId, type Rotation } from '@cyberpinball/core';
import { openHandleTarget, type HandleTarget } from '@cyberpinball/win-displays';
import type { OffscreenSharedTexture } from 'electron';
import { OFFSCREEN } from './offscreen';

const EXE = 'cyberpinball-casque.exe';
/**
 * Essai sans casque (CYBERPINBALL_CASQUE_ESSAI : un dossier) : le compagnon tourne en
 * --essai-surfaces, même hors écran, et écrit dans ce dossier ce que le casque recevrait.
 */
export const HEADSET_TRIAL_DIR = process.env.CYBERPINBALL_CASQUE_ESSAI?.trim() || undefined;
const RETRY_MS = 15_000;
const STOP_TIMEOUT_MS = 4_000;
/** Messages du compagnon gardés dans le journal (packages/casque-vr/src/casque.cpp). */
const PROTOCOL = /^(pret|casque-absent|erreur|centre|image|scene|releve|instantane|porte|fini)\b/;

/** Le compagnon, s'il est là : fabriqué avec l'application, ou construit en développement. */
export function headsetExe(appDir: string): string | undefined {
  const candidates = [
    path.join(appDir, 'natif', EXE),
    path.join(appDir, '..', 'build', 'casque-vr', 'Release', EXE),
    path.join(appDir, '..', '..', 'build', 'casque-vr', 'Release', EXE),
  ];
  return candidates.find((f) => fs.existsSync(f));
}

export interface HeadsetMenuOptions {
  appDir: string;
  /** Doit-il tourner maintenant ? (réalité virtuelle activée, runtime présent, pas de partie en cours) */
  wanted(): boolean;
  /** Chargeur OpenXR de la copie de VPX. */
  loader(): string | undefined;
  /** Ce qu'il faut montrer : chaque rôle, son rectangle et la taille de son écran. */
  sources(): HeadsetSource[];
  playfieldRotation(): Rotation;
  /** Teinte de la table choisie (#rrggbb), pour le halo des cadres ; undefined : la sarcelle. */
  tint(): string | undefined;
  /**
   * Dossier de l'instantané des panneaux (l'image de chaque écran telle qu'envoyée au casque), pris
   * une fois par démarrage de Cyber Pinball, quelques secondes après les premières images : de quoi
   * voir, après un essai, si un défaut vu dans le casque vient de l'image envoyée ou d'après.
   */
  snapshotDir?: string;
  /**
   * Fichier où garder la place de la borne dans la pièce (position au sol et cap), pour qu'elle
   * y reste d'une session à l'autre, comme un objet ; sans place gardée, elle se pose devant le
   * joueur au premier regard suivi.
   */
  placeFile?: string;
  /** L'état a changé (montré, en attente, absent ; casque porté ou non) : le menu se renvoie. */
  onStateChange?(): void;
  /**
   * Le compagnon démarre : les écrans rendus pour lui hors écran (casque-vues.ts) s'ouvrent ; pour
   * chaque rôle, la page qui le porte et sa place dedans. Sans eux, il duplique les écrans du PC.
   */
  openViews?(): { role: RoleId; surface: RoleId; fx: number; fy: number; fw: number; fh: number }[];
  /** Le compagnon s'arrête : ces écrans se ferment. */
  closeViews?(): void;
  /** Un bouton des manettes appuyé (true) ou relâché, tant que le menu est dans le casque. */
  onButton?(button: HeadsetButton, down: boolean): void;
  /** Calage (calibrate) : le bout d'une manette touché, gâchette appuyée, dans la pièce (`room` faux : sans limite du Quest). */
  onPoint?(hand: 'gauche' | 'droite', point: Point3, room: boolean): void;
  /** Les deux poignées tenues 3 s : ouvrir le calage de la borne. */
  onGesture?(): void;
  log(line: string): void;
}

export class HeadsetMenu {
  private child: ChildProcessWithoutNullStreams | undefined;
  private retryAt = 0;
  private timer: NodeJS.Timeout | undefined;
  /** Panneaux et teinte de la scène envoyée au compagnon en cours. */
  private panels: HeadsetPanel[] = [];
  private sentTint: string | undefined;
  /** Relève en cours : le compagnon garde le casque jusqu'à ce que VPX le prenne, et part seul. */
  private handingOver = false;
  private snapshotTaken = false;
  /** Repères du calage montrés dans la scène (coins de la barre avant). */
  private marks: Point3[] = [];
  private shown: HeadsetMenuState = 'waiting';
  /** Textures d'Electron confiées au compagnon : rendues (release) quand il les a copiées. */
  private target: HandleTarget | undefined;
  private frames = new Map<string, OffscreenSharedTexture>();
  private frameCount = 0;
  /** Casque porté, le menu dessiné dedans (compagnon : « porte 1 »). */
  worn = false;
  /** Au moins une image rendue pour le casque y est arrivée : les écrans du PC peuvent se reposer. */
  viewsFlowing = false;
  /** Pour le détail de l'entrée « Réalité virtuelle » : montré, en attente du casque, ou compagnon absent. */
  state: HeadsetMenuState = 'waiting';

  constructor(private readonly opts: HeadsetMenuOptions) {}

  /** Vérifie toutes les 2 s s'il faut le lancer ou l'arrêter. */
  watch(): void {
    if ((OFFSCREEN && !HEADSET_TRIAL_DIR) || this.timer) return;
    this.timer = setInterval(() => this.check(), 2_000);
    this.check();
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    void this.stop();
  }

  get running(): boolean {
    return Boolean(this.child);
  }

  check(): void {
    if (OFFSCREEN && !HEADSET_TRIAL_DIR) return;
    if (!this.opts.wanted()) {
      if (this.child && !this.handingOver) void this.stop();
      return;
    }
    if (this.child || Date.now() < this.retryAt) return;
    this.start();
  }

  /**
   * Une partie de VPX démarre : le compagnon garde le casque (borne, puis écran de chargement)
   * jusqu'à ce que VPX le prenne, fond au noir et s'arrête de lui-même ; deux minutes au plus. Pas
   * d'écran de Meta entre le menu et la table.
   */
  handOver(): void {
    if (!this.child) return;
    this.handingOver = true;
    try {
      this.child.stdin.write('releve\n');
    } catch {
      // Compagnon déjà parti.
    }
  }

  recenter(): void {
    this.child?.stdin.write('recentrer\n');
  }

  /**
   * Une image d'un écran rendu pour le casque : son NT HANDLE est dupliqué dans le compagnon, puis
   * la texture attend sa réponse « libre ». Un handle neuf à chaque image : Electron en ouvre un
   * par image et Windows en recycle les numéros (26 numéros pour 120 images, mesuré) ; un même
   * numéro ne désigne donc pas toujours la même texture.
   */
  relay(surface: RoleId, texture: OffscreenSharedTexture): void {
    const child = this.child;
    const nt = texture.textureInfo.handle?.ntHandle;
    if (!child || !this.target || !nt || this.frames.size > 16) return texture.release();
    const shared = this.target.share(nt.readBigUInt64LE(0));
    if (shared === undefined) return texture.release();
    const frame = String(++this.frameCount);
    this.frames.set(frame, texture);
    try {
      child.stdin.write(`texture ${surface} ${frame} ${shared} ${texture.textureInfo.codedSize.width} ${texture.textureInfo.codedSize.height}\n`);
    } catch {
      this.frames.delete(frame);
      texture.release();
    }
  }

  private releaseFrames(): void {
    for (const texture of this.frames.values()) texture.release();
    this.frames.clear();
  }

  /** La table choisie a changé de teinte : la scène est renvoyée avec le nouveau halo (borne en volume, casque-scene.ts). */
  tintChanged(): void {
    const tint = this.opts.tint();
    if (!this.child || tint === this.sentTint) return;
    this.sendScene(this.child, tint);
  }

  /** Calage de la borne : le compagnon envoie les points touchés et montre le bout des manettes (true), ou plus (false). */
  calibrate(on: boolean): void {
    try {
      this.child?.stdin.write(`calage ${on ? 1 : 0}\n`);
    } catch {
      // Compagnon parti : le calage s'arrête avec lui.
    }
  }

  /** Repères du calage (coins de la barre avant, espace de la borne) : la scène est renvoyée avec eux. */
  setMarks(marks: Point3[]): void {
    this.marks = marks;
    if (this.child) this.sendScene(this.child, this.opts.tint());
  }

  /** Place gardée (casque.json), barre avant comprise si la borne a été calée. */
  place(): CabinetPlace | undefined {
    return this.readPlace();
  }

  /** Pose la borne à `place` dans le casque ; `keep` : la garde aussi (casque.json). Sans place : celle gardée. */
  showPlace(place: CabinetPlace | undefined, keep = false): void {
    if (place && keep) this.writePlace(place);
    const shown = place ?? this.readPlace();
    try {
      if (shown) this.child?.stdin.write(anchorLine(shown));
      else this.child?.stdin.write('recentrer\n');
    } catch {
      // Compagnon parti : la place gardée servira au prochain lancement.
    }
  }

  private sendScene(child: ChildProcessWithoutNullStreams, tint: string | undefined): void {
    this.sentTint = tint;
    try {
      for (const line of sceneProtocol(headsetScene(this.panels, tint, this.marks))) child.stdin.write(`${line}\n`);
    } catch {
      // Compagnon parti entre-temps : la scène suivra au prochain lancement.
    }
  }

  private start(): void {
    const exe = headsetExe(this.opts.appDir);
    const loader = HEADSET_TRIAL_DIR ? 'essai' : this.opts.loader();
    if (!exe || !loader) {
      if (this.state !== 'missing') this.opts.log(`Casque : ${!exe ? 'compagnon absent (npm run casque-vr)' : 'chargeur OpenXR de VPX introuvable'}.`); // i18n-ignore : journal
      this.state = 'missing';
      this.retryAt = Date.now() + RETRY_MS;
      return;
    }
    const panels = headsetPanels(this.opts.sources(), this.opts.playfieldRotation());
    if (!panels.length) return;
    const child = spawn(exe, HEADSET_TRIAL_DIR ? ['--essai-surfaces', HEADSET_TRIAL_DIR] : ['--chargeur', loader], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    this.child = child;
    this.state = 'waiting';
    let buffer = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      buffer += chunk;
      let nl;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        // Seulement les messages du compagnon : le runtime de Meta écrit aussi sur sa sortie, des
        // dizaines de lignes à chaque session (RipcClient, RuntimeIPC…).
        // « libre <image> » : le compagnon a copié l'image, Electron reprend sa texture (pas au journal).
        const free = /^libre (\S+)/.exec(line);
        if (free) {
          this.frames.get(free[1]!)?.release();
          this.frames.delete(free[1]!);
          if (!this.viewsFlowing) {
            this.viewsFlowing = true;
            this.opts.onStateChange?.();
          }
          continue;
        }
        // « bouton <nom> 1|0 » : un bouton des manettes, remis au menu comme un bouton de la borne (pas au journal).
        const button = /^bouton (\S+) ([01])$/.exec(line);
        if (button) {
          if (isHeadsetButton(button[1]!)) this.opts.onButton?.(button[1], button[2] === '1');
          continue;
        }
        // Calage : « pointe gauche|droite x y z [sans-piece] », puis le geste des deux poignées.
        const point = /^pointe (gauche|droite) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+)( sans-piece)?$/.exec(line);
        if (point) {
          this.opts.log(`Casque : ${line}`); // i18n-ignore : journal
          this.opts.onPoint?.(point[1] as 'gauche' | 'droite', { x: Number(point[2]), y: Number(point[3]), z: Number(point[4]) }, !point[5]);
          continue;
        }
        if (line === 'geste caler') {
          this.opts.log('Casque : les deux poignées tenues 3 s, calage de la borne.'); // i18n-ignore : journal
          this.opts.onGesture?.();
          continue;
        }
        if (!PROTOCOL.test(line)) continue;
        if (line.startsWith('pret')) this.setState('shown');
        if (line.startsWith('porte ')) {
          this.worn = line === 'porte 1';
          this.opts.onStateChange?.();
        }
        // « centre x z lacet yeux=… » : la nouvelle place de la borne, gardée (dans la pièce seulement).
        const centre = /^centre (-?[\d.]+) (-?[\d.]+) (-?[\d.]+)(?!.*sans-piece)/.exec(line);
        if (centre) this.writePlace({ x: Number(centre[1]), z: Number(centre[2]), yaw: Number(centre[3]) });
        if (line.startsWith('casque-absent')) this.setState('waiting');
        if (line.startsWith('image') && !this.snapshotTaken && this.opts.snapshotDir) {
          this.snapshotTaken = true;
          const dir = this.opts.snapshotDir;
          setTimeout(() => {
            try {
              child.stdin.write(`instantane ${dir}\n`);
            } catch {
              // Compagnon parti entre-temps.
            }
          }, 8_000);
        }
        this.opts.log(`Casque : ${line}`); // i18n-ignore : journal
      }
    });
    child.stderr.on('data', () => undefined);
    child.on('error', (error) => this.opts.log(`Casque : lancement impossible (${error.message}).`)); // i18n-ignore : journal
    child.on('exit', (code) => {
      if (this.child === child) this.child = undefined;
      this.handingOver = false;
      this.worn = false;
      this.viewsFlowing = false;
      this.releaseFrames();
      this.target?.close();
      this.target = undefined;
      this.opts.closeViews?.();
      this.opts.onStateChange?.();
      if (this.state === 'shown') this.setState('waiting');
      // Casque absent ou session perdue : nouvel essai plus tard ; arrêt demandé : rien.
      if (code !== 0) this.retryAt = Date.now() + RETRY_MS;
    });
    this.panels = panels;
    this.target = child.pid ? openHandleTarget(child.pid) : undefined;
    for (const line of headsetProtocol(panels).filter((l) => l !== 'fin')) child.stdin.write(`${line}\n`);
    // Écrans rendus pour le casque (sans eux, ou sans droit sur le processus : duplication des écrans du PC).
    if (this.target) {
      try {
        const f = (v: number) => Math.max(0, Math.min(1, v)).toFixed(6);
        for (const s of this.opts.openViews?.() ?? []) child.stdin.write(`source ${s.role} ${s.surface} ${f(s.fx)} ${f(s.fy)} ${f(s.fw)} ${f(s.fh)}\n`);
      } catch (error) {
        this.opts.log(`Casque : écrans pour le casque pas ouverts (${(error as Error).message}) ; duplication des écrans du PC.`); // i18n-ignore : journal
      }
    }
    const place = this.readPlace();
    if (place) child.stdin.write(anchorLine(place));
    this.sendScene(child, this.opts.tint());
    child.stdin.write('fin\n');
    this.opts.log(`Casque : compagnon lancé, ${panels.map((p) => `${p.role} ${p.width.toFixed(2)}×${p.height.toFixed(2)} m`).join(', ')}.`); // i18n-ignore : journal
  }

  private readPlace(): CabinetPlace | undefined {
    if (!this.opts.placeFile) return undefined;
    try {
      const p = JSON.parse(fs.readFileSync(this.opts.placeFile, 'utf8')) as Record<string, unknown>;
      const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
      const [x, z, yaw] = [num(p.x), num(p.z), num(p.yaw)];
      if (x === undefined || z === undefined || yaw === undefined) return undefined;
      const lockbarHeight = num(p.lockbarHeight);
      const lockbarWidth = num(p.lockbarWidth);
      return { x, z, yaw, ...(lockbarHeight !== undefined && { lockbarHeight }), ...(lockbarWidth !== undefined && { lockbarWidth }) };
    } catch {
      return undefined;
    }
  }

  /**
   * Garde la place (casque.json). Un recentrage (regard du joueur) ne donne que x, z et le cap : la
   * hauteur de la barre avant calée reste, la borne n'est plus sur la vraie mais à la bonne hauteur.
   */
  private writePlace(place: CabinetPlace): void {
    if (!this.opts.placeFile || ![place.x, place.z, place.yaw].every(Number.isFinite)) return;
    const before = this.readPlace();
    const kept: CabinetPlace = { ...(before?.lockbarHeight !== undefined && { lockbarHeight: before.lockbarHeight }), ...place };
    try {
      fs.mkdirSync(path.dirname(this.opts.placeFile), { recursive: true });
      fs.writeFileSync(this.opts.placeFile, JSON.stringify(kept, null, 2) + '\n');
    } catch {
      // Place pas gardée : la borne se reposera devant le joueur à la prochaine session.
    }
  }

  private setState(state: HeadsetMenuState): void {
    if (state === this.shown && state === this.state) return;
    this.state = state;
    this.shown = state;
    this.opts.onStateChange?.();
  }

  /** Rend le casque : fin propre de la session OpenXR, ou arrêt forcé après 4 s. */
  async stop(): Promise<void> {
    const child = this.child;
    if (!child) return;
    this.child = undefined;
    await new Promise<void>((resolve) => {
      const kill = setTimeout(() => {
        child.kill();
        resolve();
      }, STOP_TIMEOUT_MS);
      child.once('exit', () => {
        clearTimeout(kill);
        resolve();
      });
      try {
        child.stdin.end('quitter\n');
      } catch {
        child.kill();
      }
    });
  }
}

/** Commande « ancre » du compagnon : la place de la borne dans la pièce, à la hauteur de la barre avant calée. */
function anchorLine(place: CabinetPlace): string {
  return `ancre ${place.x} ${place.z} ${place.yaw} ${anchorHeight(place)}\n`;
}
