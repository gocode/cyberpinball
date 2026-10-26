// Moments du menu (docs/recherche/medias.md, § 5.2) : ce que montre chaque écran et ce
// qu'on entend à la navigation, au chargement, pendant la partie et en mode attente
// (tâches T5, T6 et T7). Tout se décide ici, sans Electron : app/src/frontend.ts
// construit l'état de chaque fenêtre avec ces fonctions, app/renderer/menu-audio.js
// et media.js jouent ce qu'elles décident.

import { t } from './i18n';
import type { AudioRole, Cabinet, RoleId } from './model';
import type { GameMediaMode, MenuMediaSettings } from './mediaview';
import { mediaMemory } from './medias';
import { TASKBAR_CLASSES, type CoverRect, type StackedWindow } from './screencover';
import type { TableEntry } from './tables';

/** Moment du menu : navigation (fiche et messages compris), chargement, partie, attente. */
export type MenuMoment = 'browse' | 'loading' | 'game' | 'attract';

// ---------------------------------------------------------------------------
// Écrans

/** Lecture d'un média : animé, première image figée, ou rien (noir, titre discret). */
export type MediaPlay = 'animated' | 'still' | 'off';

export interface MomentScreen {
  /** Média du rôle (Playfield, Backglass, DMD ou FullDMD, Topper), ou la vidéo de chargement. */
  media: 'role' | 'Loading';
  play: MediaPlay;
}

/**
 * Ce qu'affiche un rôle à un moment (§ 5.2) :
 * - navigation et attente : le média du rôle, animé ;
 * - chargement : la vidéo Loading sur le playfield (sous les commandes de la partie), les
 *   médias du jeu, animés, sur les autres écrans jusqu'à ce que VPX les prenne ;
 * - partie : le playfield est sous VPX, figé ; un écran que VPX occupe aussi (fronton du
 *   .directb2s, DMD de PinMAME…), figé : il ne se voit pas, il ne doit rien coûter ; les
 *   écrans libres suivent le réglage « médias pendant la partie » (figés par défaut) ; le
 *   FullDMD habillé (le DMD de VPX dans le cadre du média) montre toujours son habillage,
 *   figé, ou animé si les médias le sont.
 */
export function momentScreen(moment: MenuMoment, role: RoleId, opts: { game: GameMediaMode; occupied?: boolean; dressed?: boolean }): MomentScreen {
  if (moment === 'loading') return { media: role === 'playfield' ? 'Loading' : 'role', play: 'animated' };
  if (moment !== 'game') return { media: 'role', play: 'animated' };
  // Habillage FullDMD (fulldmdframe.ts) : le DMD de VPX est posé dans le cadre du média, qui reste
  // visible autour ; jamais éteint, puisqu'il fait partie de l'afficheur.
  if (role === 'dmd' && opts.dressed) return { media: 'role', play: opts.game === 'animated' ? 'animated' : 'still' };
  if (opts.game === 'off') return { media: 'role', play: 'off' };
  if (role === 'playfield' || opts.occupied) return { media: 'role', play: 'still' };
  return { media: 'role', play: opts.game };
}

/** Phase du menu (app/src/frontend.ts) : tables, chargement, partie, message, confirmation de sortie, menu système. */
export type MenuPhase = 'menu' | 'loading' | 'playing' | 'message' | 'confirmQuit' | 'library';

export const MENU_PHASES: readonly MenuPhase[] = ['menu', 'loading', 'playing', 'message', 'confirmQuit', 'library'];

/** Ce qui est ouvert, pour savoir de quelle table parlent les écrans de la borne. */
export interface ScreensContext {
  phase: MenuPhase;
  /** Aide des commandes ouverte par-dessus le menu des tables. */
  help: boolean;
  /** Table choisie dans la roue, ou montrée par le mode attente. */
  selected?: TableEntry;
  /** Table de la partie lancée (chargement, partie). */
  playing?: TableEntry;
  /**
   * Table dont parle l'écran ouvert, s'il en parle : sa fiche, ses médias, ses fichiers, son
   * parcours (menu système, view().table de library.ts), une partie échouée (message).
   */
  about?: TableEntry;
  /** Fenêtre ouverte par-dessus le menu (réglages de VPX) ; `about` : la table qu'elle règle. */
  overlay?: { about?: TableEntry };
}

/**
 * Table dont chaque phase montre les médias sur les écrans de la borne. Le menu des tables
 * montre la table choisie, le chargement et la partie celle qu'on joue ; tout autre écran ne
 * garde une table que s'il parle d'elle. Une phase qui ne déclare rien prend l'affichage par
 * défaut : l'enregistrement est exhaustif, une nouvelle phase doit dire de quelle table elle parle.
 */
const PHASE_TABLE: Record<MenuPhase, (s: ScreensContext) => TableEntry | undefined> = {
  menu: (s) => (s.help ? undefined : s.selected),
  loading: (s) => s.playing ?? s.selected,
  playing: (s) => s.playing ?? s.selected,
  message: (s) => s.about,
  confirmQuit: () => undefined,
  library: (s) => s.about,
};

/**
 * Table dont les écrans de la borne (fronton, DMD ou FullDMD, topper, et le fond du playfield)
 * montrent les médias, et dont on entend la musique ; undefined : l'affichage par défaut de
 * Cyber Pinball (defaultMediaView) et le silence. Hors du menu des tables, rien de la dernière
 * table de la roue ne reste à l'écran : menu système, réglages, aide, messages, confirmation de
 * sortie montrent l'affichage par défaut ; la fiche d'une table, ses médias, ses fichiers, son
 * parcours et ses réglages gardent les médias de cette table, celle dont on parle.
 */
export function screensTable(s: ScreensContext): TableEntry | undefined {
  if (s.overlay && s.phase !== 'loading' && s.phase !== 'playing') return s.overlay.about;
  return PHASE_TABLE[s.phase](s);
}

/** Zone d'un rôle à l'écran, en pixels physiques (l'écran entier, ou sa part d'un écran partagé). */
export interface RoleRect {
  role: RoleId;
  rect: CoverRect;
}

function overlapArea(a: CoverRect, b: CoverRect): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/** Part d'une zone qu'une fenêtre doit couvrir pour l'occuper (une fenêtre de B2S, un DMD de PinMAME). */
export const OCCUPIED_SHARE = 0.5;

/**
 * Rôles que VPX occupe pendant la partie : en descendant la pile des fenêtres (la plus
 * haute d'abord), une fenêtre d'un autre processus qui couvre au moins la moitié de la
 * zone avant toute fenêtre de Cyber Pinball (`ownPid`) qui la couvre entièrement. Les
 * fenêtres réduites et les barres des tâches ne comptent pas.
 */
export function occupiedRoles(zones: RoleRect[], stack: StackedWindow[], ownPid: number): RoleId[] {
  const occupied = new Set<RoleId>();
  for (const zone of zones) {
    const area = zone.rect.width * zone.rect.height;
    if (area <= 0) continue;
    for (const w of stack) {
      if (w.minimized || (TASKBAR_CLASSES as readonly string[]).includes(w.className)) continue;
      const share = overlapArea(w.rect, zone.rect) / area;
      if (w.pid === ownPid) {
        if (share >= 0.99) break;
        continue;
      }
      if (share >= OCCUPIED_SHARE) {
        occupied.add(zone.role);
        break;
      }
    }
  }
  return [...occupied];
}

// ---------------------------------------------------------------------------
// Son

/** En mode attente « réduit », part du volume normal. */
export const ATTRACT_SOUND_FACTOR = 0.3;

/** Volume relatif du jeu (gestionnaire des médias, CyberPinball.medias.volume), en pour cent ; 100 par défaut. */
export function tableMediaVolume(table: Pick<TableEntry, 'info'> | undefined): number {
  const volume = table ? mediaMemory(table.info).volume : undefined;
  return typeof volume === 'number' && Number.isFinite(volume) && volume >= 0 ? volume : 100;
}

/** Volume de lecture (0 à 1) : réglage général en pour cent, multiplié par le volume relatif du jeu. */
export function playVolume(percent: number, tableVolume = 100): number {
  const v = (Math.max(0, percent) / 100) * (Math.max(0, tableVolume) / 100);
  return Math.round(Math.min(1, v) * 1000) / 1000;
}

export interface SoundTrack {
  url: string;
  /** 0 à 1. */
  volume: number;
}

/** Ce qu'on entend à un moment ; tout ce qui manque se tait (en fondu). */
export interface MenuSoundPlan {
  /** Musique du jeu (Audio), en boucle. */
  music?: SoundTrack;
  /** Son de lancement (AudioLaunch), joué une fois. */
  launch?: SoundTrack;
  /** Volume du son de la vidéo du playfield (fond du menu, ou vidéo de chargement) ; 0 : muette. */
  video: number;
}

/**
 * Son du menu à un moment (§ 5.2, § 5.4) :
 * - navigation : la musique du jeu si elle est activée (coupée par défaut), sinon le son de
 *   la vidéo du plateau à son volume (muette par défaut) ; jamais les deux à la fois ;
 * - chargement : le son de lancement, sinon le son de la vidéo de chargement ;
 * - partie : rien, VPX a la parole ;
 * - attente : comme la navigation, au volume réduit, ou rien (défaut).
 * Chaque volume est multiplié par le volume relatif du jeu (`tableVolume`, en pour cent).
 */
export function menuSound(
  moment: MenuMoment,
  settings: MenuMediaSettings,
  sources: { music?: string; launch?: string },
  tableVolume = 100,
): MenuSoundPlan {
  const at = (percent: number, factor = 1) => playVolume(percent * factor, tableVolume);
  if (moment === 'game') return { video: 0 };
  if (moment === 'loading') {
    const launch = sources.launch ? { url: sources.launch, volume: at(settings.launchVolume) } : undefined;
    if (launch && launch.volume > 0) return { launch, video: 0 };
    return { video: launch ? 0 : at(settings.launchVolume) };
  }
  const factor = moment === 'attract' ? (settings.attractSound === 'reduced' ? ATTRACT_SOUND_FACTOR : 0) : 1;
  if (settings.music && sources.music) {
    const volume = at(settings.musicVolume, factor);
    // Musique activée pour ce jeu : la vidéo reste muette, même si la musique est à zéro.
    return volume > 0 ? { music: { url: sources.music, volume }, video: 0 } : { video: 0 };
  }
  return { video: at(settings.videoVolume, factor) };
}

/**
 * Sortie audio du menu : celle du fronton dans le modèle de la borne (la sortie de la
 * musique et des sons de la ROM dans VPX, SoundDeviceBG), sinon celle du plateau. Nom
 * Windows, que le rendu retrouve parmi les sorties de Chromium ; undefined : la sortie
 * par défaut de Windows (pas de son affecté par l'assistant).
 */
export function menuAudioOutput(cabinet: Pick<Cabinet, 'audio'> | undefined): { role: AudioRole; friendlyName: string } | undefined {
  const audio = cabinet?.audio;
  if (!audio) return undefined;
  for (const role of ['backglass', 'playfield'] as const) {
    const id = audio.roles[role];
    const output = id ? audio.outputs.find((o) => o.endpointId.toLowerCase() === id.toLowerCase()) : undefined;
    const friendlyName = output?.lastSeen?.friendlyName ?? output?.label;
    if (friendlyName) return { role, friendlyName };
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Mode attente

/**
 * Table à montrer ensuite en mode attente, tirée au hasard parmi `count`, en évitant
 * celles de `recent` (la table choisie dans le menu, les dernières montrées). Si toutes
 * sont récentes, seule la dernière montrée est évitée.
 */
export function pickAttractTable(count: number, recent: readonly number[], random: () => number = Math.random): number {
  if (count <= 1) return 0;
  const avoid = new Set(recent.filter((i) => i >= 0 && i < count));
  let pool = [...Array(count).keys()].filter((i) => !avoid.has(i));
  if (pool.length === 0) {
    const last = recent.at(-1);
    pool = [...Array(count).keys()].filter((i) => i !== last);
  }
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))]!;
}

/** Combien de tables récentes éviter : environ un tiers, sans jamais les éviter toutes. */
export function attractMemory(count: number): number {
  return Math.max(1, Math.min(count - 1, Math.floor(count / 3)));
}

export interface AttractTimers {
  now(): number;
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

const REAL_TIMERS: AttractTimers = {
  now: () => Date.now(),
  set: (fn, ms) => {
    const timer = setTimeout(fn, ms);
    timer.unref?.();
    return timer;
  },
  clear: (h) => clearTimeout(h as NodeJS.Timeout),
};

export interface AttractOptions {
  /** Délai d'inactivité avant l'attente, en ms ; 0 : jamais. Relu à chaque programmation. */
  delayMs: () => number;
  /** Temps entre deux tables en attente, en ms. */
  intervalMs: () => number;
  onEnter: () => void;
  onNext: () => void;
  timers?: AttractTimers;
}

/**
 * Minuterie du mode attente. Le menu la prévient de chaque bouton ou clic (`activity`) et
 * lui dit quand l'attente est permise (`allow` : menu des tables affiché, sans aide ni
 * fiche ni message). Après `delayMs` sans activité, elle appelle `onEnter`, puis `onNext`
 * toutes les `intervalMs`. Le premier bouton y met fin : `activity` renvoie alors vrai, et
 * le bouton ne doit rien faire d'autre (ni changer la sélection, ni lancer une table).
 */
export class AttractMode {
  private timer: unknown;
  private idleSince: number;
  private allowed = false;
  private on = false;
  private readonly timers: AttractTimers;

  constructor(private readonly opts: AttractOptions) {
    this.timers = opts.timers ?? REAL_TIMERS;
    this.idleSince = this.timers.now();
  }

  get active(): boolean {
    return this.on;
  }

  /** Bouton, clic, souris : remet le compte à zéro ; vrai si cela met fin à l'attente. */
  activity(): boolean {
    const ended = this.on;
    this.on = false;
    this.idleSince = this.timers.now();
    this.schedule();
    return ended;
  }

  /** L'attente est-elle permise maintenant ? Le compte repart quand elle le redevient. */
  allow(on: boolean): void {
    if (on === this.allowed) return;
    this.allowed = on;
    if (!on) this.on = false;
    else this.idleSince = this.timers.now();
    this.schedule();
  }

  /** Réglages changés : délai et intervalle relus. */
  reschedule(): void {
    this.schedule();
  }

  /** Arrête tout (fermeture du menu). */
  dispose(): void {
    this.allowed = false;
    this.on = false;
    this.cancel();
  }

  private cancel(): void {
    if (this.timer !== undefined) this.timers.clear(this.timer);
    this.timer = undefined;
  }

  private schedule(): void {
    this.cancel();
    if (!this.allowed) return;
    if (this.on) {
      this.timer = this.timers.set(() => this.next(), Math.max(1000, this.opts.intervalMs()));
      return;
    }
    const delay = this.opts.delayMs();
    if (!(delay > 0)) return;
    this.timer = this.timers.set(() => this.enter(), Math.max(0, this.idleSince + delay - this.timers.now()));
  }

  private enter(): void {
    this.timer = undefined;
    if (!this.allowed || this.on) return;
    this.on = true;
    this.opts.onEnter();
    this.schedule();
  }

  private next(): void {
    this.timer = undefined;
    if (!this.on) return;
    this.opts.onNext();
    this.schedule();
  }
}

// ---------------------------------------------------------------------------
// Choix proposés à l'écran « Médias, son et attente »

export const VOLUME_CHOICES: readonly number[] = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
/** Délais du mode attente, en secondes (0 : jamais). */
export const ATTRACT_DELAY_CHOICES: readonly number[] = [0, 60, 120, 180, 300, 600, 900, 1800];
/** Temps entre deux tables en attente, en secondes. */
export const ATTRACT_INTERVAL_CHOICES: readonly number[] = [10, 15, 20, 30, 45, 60, 120];

/** « 45 s », « 5 min », « 1 min 30 s ». */
export function durationLabel(seconds: number): string {
  if (seconds < 60) return `${seconds} s`;
  const min = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `${min} min ${s} s` : `${min} min`;
}

export function attractDelayLabel(seconds: number): string {
  return seconds > 0 ? t('après {duration} sans bouton', { duration: durationLabel(seconds) }) : t('jamais');
}

export function volumeLabel(percent: number): string {
  return percent === 0 ? t('0 % : muet') : t('{percent} %', { percent });
}

/** Valeur la plus proche parmi les choix, pour placer le curseur sur une valeur écrite à la main. */
export function nearestChoice(choices: readonly number[], value: number): number {
  return choices.reduce((best, c) => (Math.abs(c - value) < Math.abs(best - value) ? c : best), choices[0]!);
}
