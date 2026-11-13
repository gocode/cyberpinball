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
import { anchorHeight, buildDecor, cadenceWithoutScreens, COMPANION_KEY_FILE, CompanionCycle, companionKeyFolder, DECOR_TEXTURES, headsetPanels, headsetProtocol, headsetScene, isHeadsetProfile, parseControllerEvent, headAtWear, originResetAtWear, readCompanionKey, roomChangeGap, sceneProtocol, writeGlb, type CabinetPlace, type DecorTexture, type HeadsetProfile, type Point3, type VrGpu, type RoomBounds, type RoomKeeping, type HeadsetMenuState, type HeadsetPanel, type HeadsetSource, type RoleId, type Rotation } from '@cyberpinball/core';
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
const PROTOCOL = /^(pret|casque-absent|erreur|etat|centre|image|scene|decor|releve|reprise|instantane|porte|casque-perdu|cadence|profondeur|fini)\b/;

/**
 * Textures du décor (caisse et capsule, packages/core/src/decor.ts) : <application>\natif\decor une fois
 * l'application fabriquée, packages\casque-vr\decor en développement.
 */
export function decorTexturesDir(appDir: string): string | undefined {
  const candidates = [
    path.join(appDir, 'natif', 'decor'),
    path.join(appDir, '..', 'packages', 'casque-vr', 'decor'),
    path.join(appDir, '..', '..', 'packages', 'casque-vr', 'decor'),
  ];
  return candidates.find((d) => DECOR_TEXTURES.every((n) => fs.existsSync(path.join(d, n))));
}

/**
 * Le décor des panneaux en .glb dans `dir` (decor.glb), refait seulement si les panneaux changent ;
 * undefined sans textures ou si l'écriture échoue (le compagnon garde alors son sol simple).
 */
export function writeDecor(appDir: string, dir: string, panels: readonly HeadsetPanel[], log: (line: string) => void, lockbarWidth?: number): string | undefined {
  const textures = decorTexturesDir(appDir);
  if (!textures) {
    log('Casque : textures du décor absentes, sol simple.'); // i18n-ignore : journal
    return undefined;
  }
  try {
    const file = path.join(dir, 'decor.glb');
    const stamp = path.join(dir, 'decor.json');
    const key = JSON.stringify({ panels: panels.map((p) => [p.role, p.position, p.orientation, p.width, p.height]), lockbarWidth, textures: DECOR_TEXTURES.map((n) => fs.statSync(path.join(textures, n)).size) });
    if (fs.existsSync(file) && fs.existsSync(stamp) && fs.readFileSync(stamp, 'utf8') === key) return file;
    const decor = buildDecor(panels, { lockbarWidth });
    if (!decor) return undefined;
    const bytes = new Map<DecorTexture, Uint8Array>(DECOR_TEXTURES.map((n) => [n, new Uint8Array(fs.readFileSync(path.join(textures, n)))]));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, writeGlb(decor, bytes));
    fs.writeFileSync(stamp, key);
    return file;
  } catch (error) {
    log(`Casque : décor pas écrit (${(error as Error).message}), sol simple.`); // i18n-ignore : journal
    return undefined;
  }
}

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
  /**
   * Dossier de la VR (données) : le compagnon y part d'une copie dont le dossier change à chaque
   * recentrage du runtime (clé neuve, la pièce que reçoit VPX : COMPANION_KEY_FILE, calage.ts).
   */
  keyDir?: string;
  /** Tête de la borne aux proportions standard (STANDARD_HEAD) : au bureau, ou sans vraie borne calée. */
  standardHead?(): boolean;
  /**
   * Le contour courant de la limite du Quest (sonde LibOVR), gardé avec chaque place écrite : la place et son contour
   * sont toujours du même repère (ancrage, anchorPlace). undefined : contour inconnu, la place est gardée sans.
   */
  contour?(): [number, number][] | undefined;
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
  onButton?(button: string, down: boolean): void;
  /** Les manettes branchées (compagnon : « profil <nom> »). */
  onProfile?(profile: HeadsetProfile): void;
  /** Calage (calibrate) : le bout d'une manette touché, gâchette appuyée, dans la pièce (`room` faux : sans limite du Quest). */
  /** Calage : les points pris d'une gâchette (un, ou les deux manettes à la fois), et la tête à cet instant. */
  onPoints?(points: Point3[], room: boolean, head: { x: number; z: number } | undefined, pressed: 0 | 1, grips?: [Point3, Point3]): void;
  /** Casque remis après un retrait qui a arrêté la session (accueil de Link) : la pièce a pu être recentrée. */
  onPutBackOn?(): void;
  /** L'origine de la pièce remise sur la tête au port (originResetAtWear) : `afterRemoval` vrai après un retrait. */
  onOriginReset?(afterRemoval: boolean): void;
  /** Le Quest est en limite fixe (première fois dite par ce compagnon). */
  onStationary?(): void;
  /**
   * Casque éteint, Link coupé ou session perdue (compagnon : « casque-perdu ») : `inGame` vrai quand le
   * compagnon veillait sur une partie de VPX dans le casque. L'affichage revient aux écrans du PC.
   */
  onLost?(inGame: boolean): void;
  /**
   * Session neuve après un changement de pièce : sa hauteur des yeux, dans la pièce que VPX verra.
   * Hors de la plage plausible, le Quest donne encore l'ancienne pièce aux applications qui démarrent.
   */
  onRoomRestart?(eyes: number): void;
  /** Veille pendant une partie : la tête du joueur dans la pièce (compagnon : « tete x y z lacet », toutes les 5 s). */
  onHead?(head: HeadPose): void;
  /** La tête au menu, dans la pièce d'OpenXR (« tete-menu », toutes les 5 s) : à comparer à celle de la sonde. */
  onMenuHead?(head: HeadPose): void;
  /** Recentrage fait (sur demande) : la place donnée par le regard du joueur. */
  onCentre?(place: { x: number; z: number; yaw: number; eyes?: number }): void;
  /** Hauteur des yeux au-dessus du sol de la pièce (mètres), à chaque port du casque. */
  onEyes?(eyes: number): void;
  /** Limite du Quest au lancement du compagnon ; `changed` : le Quest a déplacé la pièce pendant la session. */
  onRoom?(room: RoomBounds | undefined, changed: boolean): void;
  log(line: string): void;
}

/** La tête du joueur dans la pièce du Quest : position (mètres) et lacet (radians, sens d'OpenXR). */
export interface HeadPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export class HeadsetMenu {
  private child: ChildProcessWithoutNullStreams | undefined;
  private retryAt = 0;
  private timer: NodeJS.Timeout | undefined;
  /** Panneaux et teinte de la scène envoyée au compagnon en cours. */
  private panels: HeadsetPanel[] = [];
  private sentTint: string | undefined;
  /** Décor envoyé au compagnon (decor.glb), ou undefined : son sol simple. */
  private decor: string | undefined;
  /** Relève en cours : le compagnon garde le casque jusqu'à ce que VPX le prenne, et part seul. */
  private handingOver = false;
  private snapshotTaken = false;
  /** Repères du calage montrés dans la scène (coins de la barre avant). */
  private marks: Point3[] = [];
  /** Limite du Quest donnée par le compagnon à son lancement (pièce), gardée avec le calage. */
  room: RoomBounds | undefined;
  /** Pièce gardée par le Quest quand le casque est remis (limite de pièce), ou recentrée sur la tête (limite fixe). */
  roomKeeping: RoomKeeping | undefined;
  /** Casque retiré (la session s'est arrêtée, accueil de Link) : à son retour, la pièce a pu bouger. */
  private takenOff = false;
  /** Le même retrait, pour dire au journal d'où vient le port suivant (« tete-au-port »). */
  private takenOffSeen = false;
  private shown: HeadsetMenuState = 'waiting';
  /** Textures d'Electron confiées au compagnon : rendues (release) quand il les a copiées. */
  private target: HandleTarget | undefined;
  private frames = new Map<string, { texture: OffscreenSharedTexture; child: ChildProcessWithoutNullStreams }>();
  /** Un seul compagnon à la fois : le suivant attend que l'ancien soit sorti (compagnon-cycle.ts). */
  private readonly cycle = new CompanionCycle<ChildProcessWithoutNullStreams>();
  /** Écrans rendus pour le casque ouverts pour ce compagnon (« source ») : leurs images sont attendues. */
  private viewsOpened = false;
  /** Écrans absents du casque dits une fois par compagnon. */
  private screensMissingSaid = false;
  private frameCount = 0;
  /** Casque porté, le menu dessiné dedans (compagnon : « porte 1 »). */
  worn = false;
  /** Porté au moins une fois depuis le lancement du compagnon : retiré ensuite, l'affichage reste au casque. */
  private wornOnce = false;
  /** Veille pendant une partie de VPX dans le casque (« releve … veille » jusqu'à « reprise »). */
  standby = false;
  /** Le compagnon a dit le casque perdu : il repartira plus tard, pas aussitôt. */
  private lost = false;
  /** Reprise sur une session neuve pour changement de pièce : sa première hauteur des yeux reste à dire. */
  private roomRestart = false;
  /** Session neuve à relancer aussitôt le compagnon parti, ou à la reprise après une partie. */
  private restartNow = false;
  private restartAfterGame = false;
  /** Manettes branchées (profil d'interaction), dites par le compagnon. */
  profile: HeadsetProfile | undefined;
  /** Carte graphique du casque, dite par le compagnon (gardée dans le dossier de la VR, carte.json). */
  gpu: VrGpu | undefined;
  /**
   * Première clé à lui pour le compagnon (mise à jour) : l'ancienne avait peut-être une pièce recentrée
   * par le runtime, que VPX ne reçoit pas ; la borne calée dedans est à vérifier.
   */
  keyRenewed = false;
  /** Dernière tête relevée pendant la veille d'une partie (pièce du Quest, mètres, lacet en radians). */
  lastHead: HeadPose | undefined;
  /** Au moins une image rendue pour le casque y est arrivée : les écrans du PC peuvent se reposer. */
  viewsFlowing = false;
  /** Pour le détail de l'entrée « Réalité virtuelle » : montré, en attente du casque, ou compagnon absent. */
  state: HeadsetMenuState = 'waiting';

  /**
   * Le menu est dans le casque : ses écrans y arrivent et il a été porté. Retiré de la tête (ou menu
   * de Meta ouvert), il le reste : pas d'allers-retours avec les écrans du PC. Seuls la fin du
   * compagnon (casque éteint, Link coupé) et la veille d'une partie de VPX rendent l'affichage au PC.
   */
  get inUse(): boolean {
    return Boolean(this.child) && this.viewsFlowing && this.wornOnce && !this.standby;
  }

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
    // Un ancien compagnon encore en train de sortir : le suivant attend (sa sortie fermerait ses écrans).
    if (this.child || !this.cycle.canStart() || Date.now() < this.retryAt) return;
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

  /**
   * Repartir sur une session neuve, tout de suite : elle prend le casque d'elle-même (environ 1 s le
   * 10 novembre 2026), dans la pièce d'origine du Quest, celle que VPX reçoit aussi.
   */
  restart(): void {
    this.restartAfterGame = false;
    if (!this.child) return;
    this.restartNow = true;
    this.handingOver = false;
    void this.stop();
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
    this.frames.set(frame, { texture, child });
    try {
      child.stdin.write(`texture ${surface} ${frame} ${shared} ${texture.textureInfo.codedSize.width} ${texture.textureInfo.codedSize.height}\n`);
    } catch {
      this.frames.delete(frame);
      texture.release();
    }
  }

  /** Rend à Electron les textures confiées à ce compagnon (toutes, sans compagnon précisé). */
  private releaseFrames(of?: ChildProcessWithoutNullStreams): void {
    for (const [frame, { texture, child }] of this.frames) {
      if (of && child !== of) continue;
      texture.release();
      this.frames.delete(frame);
    }
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
    // Calée sur une vraie barre avant : la caisse du décor en prend la largeur (refait et renvoyé).
    if (place && keep && this.child) this.sendDecor(this.child, place);
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
      for (const line of sceneProtocol(headsetScene(this.panels, tint, this.marks, { floor: !this.decor }))) child.stdin.write(`${line}\n`);
      // Lueurs du décor à la teinte de la table ; sans teinte, la sarcelle.
      if (this.decor) child.stdin.write(`teinte ${tint && /^#[0-9a-f]{6}$/i.test(tint) ? tint : ''}\n`);
    } catch {
      // Compagnon parti entre-temps : la scène suivra au prochain lancement.
    }
  }

  /**
   * Le compagnon sous sa clé de runtime : la copie de la génération en cours (dossier de la VR), refaite
   * si l'original a changé. Sans dossier, en essai ou si la copie échoue : l'original.
   */
  private keyedExe(source: string | undefined): string | undefined {
    const dir = this.opts.keyDir;
    if (!source || !dir || HEADSET_TRIAL_DIR) return source;
    try {
      const keyFile = path.join(dir, COMPANION_KEY_FILE);
      let generation = readCompanionKey(fs.existsSync(keyFile) ? fs.readFileSync(keyFile, 'utf8') : undefined);
      if (!generation) {
        generation = 1;
        this.writeKey(generation, 'première clé à lui'); // i18n-ignore : journal
        this.keyRenewed = Boolean(this.opts.placeFile && fs.existsSync(this.opts.placeFile));
      }
      const target = path.join(dir, companionKeyFolder(generation), EXE);
      const from = fs.statSync(source);
      const to = fs.existsSync(target) ? fs.statSync(target) : undefined;
      if (!to || to.size !== from.size || to.mtimeMs < from.mtimeMs) {
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(source, target);
      }
      // Les copies des clés d'avant ne servent plus.
      for (const old of fs.readdirSync(dir)) {
        const m = /^compagnon-(\d+)$/.exec(old);
        if (m && Number(m[1]) < generation) fs.rmSync(path.join(dir, old), { recursive: true, force: true });
      }
      return target;
    } catch (error) {
      this.opts.log(`Casque : copie du compagnon sous sa clé impossible (${(error as Error).message}) ; lancé depuis l’application.`); // i18n-ignore : journal
      return source;
    }
  }

  private writeKey(generation: number, why: string): void {
    const dir = this.opts.keyDir;
    if (!dir) return;
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, COMPANION_KEY_FILE), JSON.stringify({ generation, pourquoi: why }, null, 2) + '\n');
    this.opts.log(`Casque : compagnon sous la clé ${companionKeyFolder(generation)} (${why}) : une clé que le runtime n’a jamais recentrée, la même pièce que VPX.`); // i18n-ignore : journal
  }

  private start(): void {
    const exe = this.keyedExe(headsetExe(this.opts.appDir));
    const loader = HEADSET_TRIAL_DIR ? 'essai' : this.opts.loader();
    if (!exe || !loader) {
      if (this.state !== 'missing') this.opts.log(`Casque : ${!exe ? 'compagnon absent (npm run casque-vr)' : 'chargeur OpenXR de VPX introuvable'}.`); // i18n-ignore : journal
      this.state = 'missing';
      this.retryAt = Date.now() + RETRY_MS;
      return;
    }
    const panels = headsetPanels(this.opts.sources(), this.opts.playfieldRotation(), { standardHead: this.opts.standardHead?.() });
    if (!panels.length) return;
    const child = spawn(exe, HEADSET_TRIAL_DIR ? ['--essai-surfaces', HEADSET_TRIAL_DIR] : ['--chargeur', loader], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    this.child = child;
    this.cycle.started(child);
    this.viewsOpened = false;
    this.screensMissingSaid = false;
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
          this.frames.get(free[1]!)?.texture.release();
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
          // Chaque bouton (pas les directions des joysticks) au journal, brut : ce que Link remet au compagnon.
          if (!parseControllerEvent(button[1]!)?.direction) this.opts.log(`Casque, bouton brut : ${button[1]} ${button[2]}`); // i18n-ignore : journal
          if (parseControllerEvent(button[1]!)) this.opts.onButton?.(button[1]!, button[2] === '1');
          continue;
        }
        // Veille : la tête du joueur dans la pièce (au journal par Cyber Pinball, pas ici : toutes les 5 s).
        // Au menu, la tête dans la pièce (STAGE) toutes les 5 s, au journal : à comparer à la sonde LibOVR.
        if (line.startsWith('tete-menu ')) {
          this.opts.log(`Casque, tête (OpenXR, pièce) : ${line.slice(10)}`); // i18n-ignore : journal
          const [x, y, z, yaw] = line.slice(10).split(' ').map(Number);
          if ([x, y, z, yaw].every(Number.isFinite)) this.opts.onMenuHead?.({ x: x!, y: y!, z: z!, yaw: yaw! });
          continue;
        }
        const head = /^tete (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+)$/.exec(line);
        if (head) {
          this.opts.log(`Casque, tête en partie (OpenXR, pièce) : ${line.slice(5)}`); // i18n-ignore : journal
          this.lastHead = { x: Number(head[1]), y: Number(head[2]), z: Number(head[3]), yaw: Number(head[4]) };
          this.opts.onHead?.(this.lastHead);
          continue;
        }
        // « carte <Mo> batterie|secteur <nom> » : la carte du casque, pour le profil graphique des parties.
        const card = /^carte (\d+) (batterie|secteur) (.*)$/.exec(line);
        if (card) {
          this.gpu = { vramMb: Number(card[1]), laptop: card[2] === 'batterie', name: card[3]!.trim() };
          this.opts.log(`Casque : ${line}`); // i18n-ignore : journal
          if (this.opts.keyDir) {
            try {
              fs.mkdirSync(this.opts.keyDir, { recursive: true });
              fs.writeFileSync(path.join(this.opts.keyDir, 'carte.json'), JSON.stringify(this.gpu, null, 2) + '\n');
            } catch {
              // Dossier de la VR en lecture seule : la carte reste connue pour cette session.
            }
          }
          continue;
        }
        // « profil <nom> » : les manettes branchées, leur réglage.
        const profile = /^profil (\S+)/.exec(line);
        if (profile) {
          this.opts.log(`Casque : ${line}`); // i18n-ignore : journal
          if (isHeadsetProfile(profile[1]!)) {
            this.profile = profile[1];
            this.opts.onProfile?.(profile[1]);
          }
          continue;
        }
        // Calage : « pointes x y z x y z [tete x z] [sans-piece] [prises x y z x y z] » (les deux manettes), ou « pointe main x y z … ».
        const points = /^pointes? (gauche|droite) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+)(?: (-?[\d.]+) (-?[\d.]+) (-?[\d.]+))?(?: tete (-?[\d.]+) (-?[\d.]+))?( sans-piece)?(?: prises (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+))?$/.exec(line);
        if (points) {
          this.opts.log(`Casque : ${line}`); // i18n-ignore : journal
          const n = points.slice(2).map((v) => (v === undefined ? undefined : Number(v)));
          const list: Point3[] = [{ x: n[0]!, y: n[1]!, z: n[2]! }, ...(n[3] !== undefined ? [{ x: n[3], y: n[4]!, z: n[5]! }] : [])];
          const g = points.slice(11, 17).map(Number);
          const grips: [Point3, Point3] | undefined = points[11] !== undefined ? [{ x: g[0]!, y: g[1]!, z: g[2]! }, { x: g[3]!, y: g[4]!, z: g[5]! }] : undefined;
          this.opts.onPoints?.(list, !points[10], n[6] !== undefined ? { x: n[6], z: n[7]! } : undefined, points[1] === 'droite' ? 1 : 0, grips);
          continue;
        }
        // Hauteur des yeux, limite de la pièce, pièce déplacée par le Quest : au journal, puis au menu.
        const eyes = /^yeux (-?[\d.]+)$/.exec(line);
        if (eyes) {
          this.opts.log(`Casque : ${line}`); // i18n-ignore : journal
          // Première mesure de la session neuve d'après un changement de pièce : celle que VPX verra.
          if (this.roomRestart) {
            this.roomRestart = false;
            this.opts.onRoomRestart?.(Number(eyes[1]));
          }
          this.opts.onEyes?.(Number(eyes[1]));
          continue;
        }
        // La tête au port, mesurée sur la tête au calage (repère physique) ; le verdict vient des têtes de la partie.
        const atWear = headAtWear(line, this.readPlace());
        if (atWear) {
          // La pièce refaite par le Quest : la tête retombe sur l'origine même (au centimètre et au degré près).
          const reset = originResetAtWear(line);
          if (reset) {
            this.opts.log(`Casque : origine de la pièce remise sur la tête au port ${this.takenOffSeen ? 'après un retrait du casque' : 'au premier port de la session'} (tête à ${reset.cm.toFixed(1)} cm et ${reset.deg.toFixed(1)}° de l'origine) : le Quest a refait sa pièce, la borne calée n'est plus sur la vraie.`); // i18n-ignore : journal
            this.opts.onOriginReset?.(this.takenOffSeen);
          }
          const after = this.takenOffSeen ? 'après un retrait du casque' : 'au premier port de la session'; // i18n-ignore : journal
          const from = atWear.fromPlace ? 'de sa place au calage (un relevé, pris au port)' : 'de l’origine de la pièce (pas de tête gardée au calage : recalez pour mesurer)'; // i18n-ignore : journal
          this.opts.log(`Casque : tête au port ${after}, à ${atWear.cm.toFixed(0)} cm et ${atWear.deg.toFixed(0)}° ${from}.`); // i18n-ignore : journal
          this.takenOffSeen = false;
          continue;
        }
        if (line === 'piece aucune') { // i18n-ignore : protocole du compagnon
          if (this.roomKeeping !== 'recentred') this.opts.onStationary?.();
          if (this.roomKeeping !== 'recentred') this.opts.log('Casque : pièce du Quest sans limite (limite fixe ou désactivée) : le Quest la recentre sur la tête chaque fois que le casque est remis, sans le dire aux applications ; le calage sera proposé à chaque retour du casque.'); // i18n-ignore : journal
          this.roomKeeping = 'recentred';
          this.room = undefined;
          this.opts.onRoom?.(undefined, false);
          continue;
        }
        const room = /^piece ([\d.]+) ([\d.]+)$/.exec(line);
        if (room) {
          this.roomKeeping = 'kept';
          this.room = { width: Number(room[1]), depth: Number(room[2]) };
          this.opts.log(`Casque : limite du Quest ${this.room.width.toFixed(2)} × ${this.room.depth.toFixed(2)} m.`); // i18n-ignore : journal
          this.opts.onRoom?.(this.room, false);
          continue;
        }
        if (line.startsWith('piece-changee')) {
          // Le runtime a recentré la pièce du compagnon (« Réinitialiser la vue » de Link, casque remis,
          // sol refait). Il garde ce recentrage pour le compagnon, sous la clé de son exécutable, même
          // dans ses sessions neuves et après une reconnexion de Link ; VPX, jamais recentré, garde la
          // pièce d'origine (essai du 10 novembre 2026 : le même bord de bureau tourné de 163° entre deux
          // sessions neuves du compagnon autour de deux recentrages, puis la table de VPX derrière le
          // joueur). Le compagnon repart donc sur une session neuve sous une clé neuve : la pièce
          // d'origine, celle de VPX, où la borne calée est restée. Pendant une partie, à la reprise.
          const now = !this.standby && !this.handingOver;
          if (this.opts.keyDir) {
            const keyFile = path.join(this.opts.keyDir, COMPANION_KEY_FILE);
            const generation = readCompanionKey(fs.existsSync(keyFile) ? fs.readFileSync(keyFile, 'utf8') : undefined);
            this.writeKey(generation + 1, 'pièce recentrée par le runtime sous la session du compagnon'); // i18n-ignore : journal
          }
          const gap = roomChangeGap(line);
          this.opts.log(`Casque : ${line}${gap ? ` (origine de la pièce changée : écart ${gap.cm.toFixed(0)} cm, ${gap.deg.toFixed(0)}°)` : ''} ; le runtime a recentré la pièce du compagnon seul : correction, il repart ${now ? 'tout de suite' : 'à la fin de la partie'} sur une session neuve, sous une clé neuve, dans la pièce de VPX ; la borne reste où elle est.`); // i18n-ignore : journal
          this.roomRestart = true;
          if (now) this.restart();
          else this.restartAfterGame = true;
          continue;
        }
        // Session du compagnon perdue pendant sa veille (erreur du runtime, accueil de Link bloqué : essai du
        // 10 novembre 2026, 14:46) : ce n'est pas le casque perdu, VPX continue ; le compagnon repart après.
        if (line.startsWith('session-veille-perdue')) {
          this.opts.log(`Casque : ${line} ; seule la session en veille du compagnon est tombée : la partie continue, le compagnon repart à la fin.`); // i18n-ignore : journal
          continue;
        }
        // Casque retiré au menu : le compagnon garde sa session, qui reprend quand le casque revient (13 novembre
        // 2026 ; avant, une session neuve à chaque retrait, et l'accueil de Link restait à l'écran).
        if (line === 'session-suspendue') {
          this.opts.log('Casque : retiré au menu ; la même session attend son retour (pas de compagnon relancé).'); // i18n-ignore : journal
          if (!this.worn) this.takenOff = this.takenOffSeen = true;
          continue;
        }
        if (line.startsWith('session-reprise')) {
          this.opts.log(`Casque : ${line}.`); // i18n-ignore : journal
          continue;
        }
        // Session que le runtime n'a pas redonnée (ou ancien compagnon) : session neuve aussitôt.
        if (line.startsWith('session-arretee')) {
          this.opts.log(`Casque : ${line} ; le compagnon repart sur une session neuve.`); // i18n-ignore : journal
          this.restartNow = true;
          // Casque retiré (le menu de Meta ouvert n'arrête pas la session) : à son retour, la pièce a pu bouger.
          if (!this.worn) this.takenOff = this.takenOffSeen = true;
          continue;
        }
        if (!PROTOCOL.test(line)) continue;
        // Garde-fou : casque porté, écrans rendus pour lui ouverts, et pas une de leurs images arrivée
        // au compagnon depuis son lancement : le joueur verrait le décor sans les écrans.
        if (!this.screensMissingSaid && this.worn && this.child === child && cadenceWithoutScreens(line, this.viewsOpened && !this.viewsFlowing)) {
          this.screensMissingSaid = true;
          this.opts.log(`[avertissement] Casque : aucune image des écrans n’arrive au compagnon depuis son lancement (${this.target ? 'canal des textures ouvert' : 'canal des textures fermé'}, ${this.frames.size} en attente) : écrans absents du casque.`); // i18n-ignore : journal
        }
        if (line.startsWith('pret')) this.setState('shown');
        if (line.startsWith('porte ')) {
          this.worn = line === 'porte 1';
          this.wornOnce ||= this.worn;
          this.opts.onStateChange?.();
          if (this.worn && this.takenOff) {
            this.takenOff = false;
            this.opts.onPutBackOn?.();
          }
        }
        // Relève faite : le compagnon veille sur la partie ; VPX parti, il reprend le casque avec le menu.
        if (line.startsWith('releve') && line.endsWith('veille')) {
          this.standby = true;
          this.opts.onStateChange?.();
        }
        if (line === 'reprise') {
          this.standby = false;
          this.handingOver = false;
          if (this.restartAfterGame) this.restart();
          this.opts.onStateChange?.();
        }
        if (line.startsWith('casque-perdu')) {
          this.lost = true;
          this.opts.onLost?.(this.standby);
        }
        // « centre x z lacet yeux=… » : la nouvelle place de la borne, gardée (dans la pièce seulement).
        const centre = /^centre (-?[\d.]+) (-?[\d.]+) (-?[\d.]+)(?!.*sans-piece)/.exec(line);
        if (centre) {
          const gaze = { x: Number(centre[1]), z: Number(centre[2]), yaw: Number(centre[3]) };
          this.writePlace(gaze, true);
          const eyes = /yeux=(-?[\d.]+)/.exec(line);
          this.opts.onCentre?.({ ...gaze, ...(eyes && { eyes: Number(eyes[1]) }) });
        }
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
      const owner = this.cycle.exited(child);
      if (this.child === child) this.child = undefined;
      // Un autre compagnon est déjà en service : il garde ses écrans, ses textures et son canal ; seules
      // les textures confiées à l'ancien sont rendues.
      if (!owner) {
        this.releaseFrames(child);
        this.opts.log('Casque : un ancien compagnon est sorti après le lancement du suivant ; les écrans du suivant sont gardés.'); // i18n-ignore : journal
        return;
      }
      this.handingOver = false;
      this.worn = false;
      this.wornOnce = false;
      this.standby = false;
      this.viewsFlowing = false;
      this.releaseFrames();
      this.target?.close();
      this.target = undefined;
      this.opts.closeViews?.();
      this.opts.onStateChange?.();
      if (this.state === 'shown') this.setState('waiting');
      // Casque absent ou perdu (éteint, Link coupé) : nouvel essai plus tard ; arrêt demandé : rien.
      if (code !== 0 || this.lost) this.retryAt = Date.now() + RETRY_MS;
      this.lost = false;
      // Session neuve voulue (pièce changée, arrêt par le runtime, fin de partie) : relancée aussitôt.
      if (this.restartNow) {
        this.restartNow = false;
        this.retryAt = 0;
        setImmediate(() => this.check());
      }
    });
    this.panels = panels;
    this.target = child.pid ? openHandleTarget(child.pid) : undefined;
    for (const line of headsetProtocol(panels).filter((l) => l !== 'fin')) child.stdin.write(`${line}\n`);
    // Écrans rendus pour le casque (sans eux, ou sans droit sur le processus : duplication des écrans du PC).
    if (this.target) {
      try {
        const f = (v: number) => Math.max(0, Math.min(1, v)).toFixed(6);
        for (const s of this.opts.openViews?.() ?? []) {
          child.stdin.write(`source ${s.role} ${s.surface} ${f(s.fx)} ${f(s.fy)} ${f(s.fw)} ${f(s.fh)}\n`);
          this.viewsOpened = true;
        }
      } catch (error) {
        this.opts.log(`Casque : écrans pour le casque pas ouverts (${(error as Error).message}) ; duplication des écrans du PC.`); // i18n-ignore : journal
      }
    }
    const place = this.readPlace();
    if (place) child.stdin.write(anchorLine(place));
    // Le décor (caisse et capsule) autour des panneaux, au menu seulement (rien en partie).
    this.sendDecor(child, place);
    this.sendScene(child, this.opts.tint());
    child.stdin.write('fin\n');
    this.opts.log(`Casque : compagnon lancé, ${panels.map((p) => `${p.role} ${p.width.toFixed(2)}×${p.height.toFixed(2)} m`).join(', ')}.`); // i18n-ignore : journal
  }

  /**
   * Le décor (caisse et capsule) écrit d'après les panneaux et, borne calée sur une vraie barre avant,
   * sa largeur ; envoyé au compagnon. Sans dossier de la VR, en essai ou sans textures : le sol simple.
   */
  private sendDecor(child: ChildProcessWithoutNullStreams, place: CabinetPlace | undefined): void {
    const lockbarWidth = place && !place.free ? place.lockbarWidth : undefined;
    this.decor = this.opts.keyDir && !HEADSET_TRIAL_DIR ? writeDecor(this.opts.appDir, this.opts.keyDir, this.panels, this.opts.log, lockbarWidth) : undefined;
    try {
      if (this.decor) child.stdin.write(`decor ${this.decor}\n`);
    } catch {
      // Compagnon parti : le décor suivra au prochain lancement.
    }
  }

  private readPlace(): CabinetPlace | undefined {
    return this.opts.placeFile ? readCabinetPlace(this.opts.placeFile) : undefined;
  }

  /**
   * Garde la place (casque.json). Un recentrage (regard du joueur) ne donne que x, z et le cap : la
   * barre avant calée (hauteur, largeur), la limite du Quest et le placement libre restent ; la borne
   * n'est plus sur la vraie, mais garde sa taille et sa hauteur.
   */
  private writePlace(place: CabinetPlace, recentred = false): void {
    if (!this.opts.placeFile || ![place.x, place.z, place.yaw].every(Number.isFinite)) return;
    const { contour: _stale, rest: _gone, ...kept }: CabinetPlace & { rest?: unknown } = recentred ? { ...this.readPlace(), x: place.x, z: place.z, yaw: place.yaw } : place;
    // Le contour du repère de cette place : le courant, sinon aucun (un contour d'un autre repère la déplacerait à tort).
    const contour = this.opts.contour?.();
    try {
      fs.mkdirSync(path.dirname(this.opts.placeFile), { recursive: true });
      // Le contour (des centaines de points) sur une seule ligne.
      const text = JSON.stringify(contour?.length ? { ...kept, contour: '@contour' } : kept, null, 2).replace('"@contour"', JSON.stringify(contour ?? []));
      fs.writeFileSync(this.opts.placeFile, text + '\n');
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
    this.cycle.stopping(child);
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

/**
 * Place de la borne du casque gardée (casque.json) : la seule pose de la borne, pour le menu dans le
 * casque comme pour les parties de VPX (placeVpxSettings). Calée : la barre avant et la limite du Quest aussi.
 */
export function readCabinetPlace(file: string): CabinetPlace | undefined {
  try {
    const p = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
    const [x, z, yaw] = [num(p.x), num(p.z), num(p.yaw)];
    if (x === undefined || z === undefined || yaw === undefined) return undefined;
    const lockbarHeight = num(p.lockbarHeight);
    const lockbarWidth = num(p.lockbarWidth);
    const r = p.room as Record<string, unknown> | undefined;
    const room = r && num(r.width) !== undefined && num(r.depth) !== undefined ? { width: num(r.width)!, depth: num(r.depth)! } : undefined;
    // Écart prises-bouts des manettes (calage en partie par VPX), mesuré au calage du menu.
    const g = p.grip as Record<string, unknown> | undefined;
    const grip = g && num(g.up) !== undefined && num(g.back) !== undefined && num(g.widthRatio) !== undefined ? { up: num(g.up)!, back: num(g.back)!, widthRatio: num(g.widthRatio)! } : undefined;
    // Type de limite au calage (staleCalibration) et tête du joueur au calage (roomFromHeads).
    const boundary = p.boundary === 'fixe' || p.boundary === 'piece' ? p.boundary : undefined;
    const h = p.head as Record<string, unknown> | undefined;
    const head = h && num(h.x) !== undefined && num(h.z) !== undefined ? { x: num(h.x)!, z: num(h.z)! } : undefined;
    // Un ancien champ « rest » (recalage automatique, retiré le 13 novembre 2026) est ignoré, puis oublié à la prochaine écriture.
    // Contour de la limite du Quest au calage (ancrage, anchorPlace) : des couples [x, z], trois au moins.
    const c = Array.isArray(p.contour) ? p.contour : [];
    const contour = c.length >= 3 && c.every((q) => Array.isArray(q) && q.length === 2 && q.every((v) => num(v) !== undefined)) ? (c as [number, number][]) : undefined;
    return { x, z, yaw, ...(lockbarHeight !== undefined && { lockbarHeight }), ...(lockbarWidth !== undefined && { lockbarWidth }), ...(room && { room }), ...(grip && { grip }), ...(p.free === true && { free: true }), ...(boundary && { boundary }), ...(head && { head }), ...(contour && { contour }) };
  } catch {
    return undefined;
  }
}
