// Enregistrement d'une partie pour la présentation de la table sur la roue (demande du 29/10/2026).
// Le joueur l'arme depuis la fiche (« Jouer et enregistrer ») : pendant la partie, aucun bouton
// n'est demandé, chacun appartenant déjà à VPX (les deux MagnaSave ouvrent son menu, Start lance
// une bille, Exit quitte). Deux événements bornent l'enregistrement :
//   recording-start : la table est à l'écran (sa fenêtre de jeu tient le premier plan, launcher.ts)
//                     depuis le délai choisi, pour passer le fondu d'arrivée de VPX ;
//   recording-end   : la durée choisie est atteinte (fin propre, fondu au noir pour boucler), ou
//                     le joueur quitte la table avant (la fin est coupée avant la fermeture de VPX),
//                     ou la capture échoue.
// Le fichier produit est une vidéo MP4 (H.264), le format que la roue lit déjà ; celle du plateau
// est toujours en portrait, flippers en bas, quelle que soit l'orientation de l'écran : c'est le
// standard que la roue sait tourner (mediaFlipperEdge), et elle la montre comme le joueur la voyait.
// Il attend dans <données>\enregistrements jusqu'au choix du joueur, au retour : devenir le média
// de la roue (l'ancien à la corbeille, après le plan), rester de côté (il figure alors parmi les
// propositions de ce média), ou partir à la corbeille.
//
// Ici, tout ce qui se décide sur des données ; la capture est dans app/src/game-recording.ts
// (Electron : desktopCapturer et MediaRecorder dans une fenêtre invisible, app/renderer/recorder.js).

import * as fs from 'node:fs';
import * as path from 'node:path';
import { formatDateTime, t, tn } from './i18n';
import { dmdMediaType, type MediaType } from './medias';
import { edgeRotation, type Cabinet, type FlipperEdge, type Rect, type Rotation } from './model';
import { readJsonFile } from './store';
import type { TableEntry } from './tables';

// ---------------------------------------------------------------------------
// Réglages

/** Écrans qu'on peut filmer : ceux qui ont un média de présentation sur la roue. */
export type RecordedRole = 'playfield' | 'backglass' | 'dmd';
export const RECORDED_ROLES: readonly RecordedRole[] = ['playfield', 'backglass', 'dmd'];

/** Délais proposés entre l'apparition de la table et le début, en secondes. */
export const RECORDING_DELAYS: readonly number[] = [0, 5, 10, 20, 30, 60];
/** Durées proposées, en secondes : une boucle de roue dure d'ordinaire 20 à 60 s. */
export const RECORDING_DURATIONS: readonly number[] = [15, 30, 45, 60, 90];
/** En dessous, un enregistrement arrêté par la sortie de la table n'est pas gardé. */
export const MIN_RECORDING_SECONDS = 5;
/** Fondu d'entrée et de sortie d'une fin propre : la boucle passe par le noir sans à-coup. */
export const RECORDING_FADE_MS = 400;
/**
 * Images retenues avant d'être écrites : à la sortie de la table, elles sont jetées (VPX qui se
 * ferme, le menu qui revient) ; à la fin de la durée, elles reçoivent le fondu de sortie.
 */
export const RECORDING_TAIL_MS = 500;
/** Cadence de l'enregistrement. */
export const RECORDING_FPS = 30;

export interface RecordingSettings {
  /** Écrans filmés ; le plateau l'est toujours. */
  roles: RecordedRole[];
  /** Secondes entre l'apparition de la table et le début. */
  delay: number;
  /** Durée de l'enregistrement, en secondes. */
  duration: number;
  /** Son de la partie avec la vidéo du plateau (la roue le joue selon « Son des vidéos du menu »). */
  sound: boolean;
}

export const DEFAULT_RECORDING_SETTINGS: RecordingSettings = { roles: ['playfield'], delay: 10, duration: 30, sound: true };

/** <données>\enregistrement.json */
export function recordingSettingsFile(dataDir: string): string {
  return path.join(dataDir, 'enregistrement.json');
}

/** Réglages lus d'un objet quelconque : un champ absent ou hors des choix proposés prend sa valeur par défaut. */
export function normalizeRecordingSettings(raw: unknown): RecordingSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_RECORDING_SETTINGS;
  const roles = Array.isArray(r.roles) ? RECORDED_ROLES.filter((role) => role === 'playfield' || (r.roles as unknown[]).includes(role)) : d.roles;
  return {
    roles: roles.includes('playfield') ? roles : ['playfield', ...roles],
    delay: RECORDING_DELAYS.includes(r.delay as number) ? (r.delay as number) : d.delay,
    duration: RECORDING_DURATIONS.includes(r.duration as number) ? (r.duration as number) : d.duration,
    sound: typeof r.sound === 'boolean' ? r.sound : d.sound,
  };
}

export function loadRecordingSettings(dataDir: string): RecordingSettings {
  try {
    return normalizeRecordingSettings(readJsonFile(recordingSettingsFile(dataDir)));
  } catch {
    return { ...DEFAULT_RECORDING_SETTINGS, roles: [...DEFAULT_RECORDING_SETTINGS.roles] };
  }
}

export function saveRecordingSettings(dataDir: string, settings: RecordingSettings): void {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(recordingSettingsFile(dataDir), JSON.stringify(normalizeRecordingSettings(settings), null, 2) + '\n', 'utf8');
}

/** Écran filmé ou non : le plateau ne se retire pas. */
export function toggleRecordedRole(settings: RecordingSettings, role: RecordedRole): RecordingSettings {
  if (role === 'playfield') return settings;
  const on = settings.roles.includes(role);
  return { ...settings, roles: RECORDED_ROLES.filter((r) => (r === role ? !on : settings.roles.includes(r))) };
}

// ---------------------------------------------------------------------------
// Événements de début et de fin

export type RecordingEndReason =
  /** La durée choisie est atteinte : fin propre, avec fondu. */
  | 'duration'
  /** Le joueur a quitté la table (ou VPX s'est arrêté) avant la fin de la durée. */
  | 'game-end'
  /** La capture a échoué (écran introuvable, enregistreur arrêté). */
  | 'failed';

export type RecordingEvent = { type: 'recording-start'; at: number } | { type: 'recording-end'; at: number; reason: RecordingEndReason; seconds: number; error?: string };

export type RecordingPhase = 'armed' | 'waiting' | 'recording' | 'ended';

/** Où en est l'enregistrement d'une partie. Les instants sont en ms (horloge du processus). */
export interface RecordingClock {
  phase: RecordingPhase;
  /** La table est à l'écran : le délai court depuis cet instant. */
  shownAt?: number;
  startedAt?: number;
  endedAt?: number;
  reason?: RecordingEndReason;
  /** Secondes enregistrées. */
  seconds?: number;
  error?: string;
}

export type RecordingInput =
  /** La fenêtre de jeu de VPX tient le premier plan (onForeground du lanceur). */
  | { type: 'shown'; at: number }
  /** Battement régulier (toutes les 100 ms) : délai et durée s'y décident. */
  | { type: 'tick'; at: number }
  /** VPX s'est fermé (sortie de la table, arrêt brutal). */
  | { type: 'game-end'; at: number }
  | { type: 'failed'; at: number; error: string };

export const ARMED_RECORDING: RecordingClock = { phase: 'armed' };

/**
 * Étape suivante de l'enregistrement, et les événements qu'elle émet. Une fois fini, plus rien ne
 * change : un second « game-end » ou un battement tardif ne rouvre rien.
 */
export function advanceRecording(clock: RecordingClock, input: RecordingInput, settings: Pick<RecordingSettings, 'delay' | 'duration'>): { clock: RecordingClock; events: RecordingEvent[] } {
  if (clock.phase === 'ended') return { clock, events: [] };
  const end = (reason: RecordingEndReason, at: number, error?: string): { clock: RecordingClock; events: RecordingEvent[] } => {
    const seconds = clock.startedAt !== undefined ? Math.max(0, (at - clock.startedAt) / 1000) : 0;
    return {
      clock: { ...clock, phase: 'ended', endedAt: at, reason, seconds, ...(error && { error }) },
      events: [{ type: 'recording-end', at, reason, seconds, ...(error && { error }) }],
    };
  };
  if (input.type === 'failed') return end('failed', input.at, input.error);
  if (input.type === 'game-end') return end('game-end', input.at);
  let next = clock;
  const events: RecordingEvent[] = [];
  if (next.phase === 'armed' && input.type === 'shown') next = { ...next, phase: 'waiting', shownAt: input.at };
  if (next.phase === 'waiting' && input.at - next.shownAt! >= settings.delay * 1000) {
    next = { ...next, phase: 'recording', startedAt: input.at };
    events.push({ type: 'recording-start', at: input.at });
  }
  if (next.phase === 'recording' && input.at - next.startedAt! >= settings.duration * 1000) {
    const done = advanceRecording(next, { type: 'game-end', at: next.startedAt! + settings.duration * 1000 }, settings);
    return { clock: { ...done.clock, reason: 'duration' }, events: [...events, { ...(done.events[0] as Extract<RecordingEvent, { type: 'recording-end' }>), reason: 'duration' }] };
  }
  return { clock: next, events };
}

/** L'enregistrement fini vaut d'être proposé : assez long, et sans échec de la capture. */
export function recordingUsable(clock: RecordingClock): boolean {
  return clock.phase === 'ended' && clock.reason !== 'failed' && (clock.seconds ?? 0) >= MIN_RECORDING_SECONDS;
}

/** Secondes gardées : à la sortie de la table, la fin retenue est jetée (VPX qui se ferme). */
export function keptSeconds(clock: RecordingClock): number {
  const seconds = clock.seconds ?? 0;
  return clock.reason === 'game-end' ? Math.max(0, seconds - RECORDING_TAIL_MS / 1000) : seconds;
}

/** Ce que dit le témoin d'enregistrement, dans un coin du plateau (app/renderer/recording.js). */
export interface RecordingIndicator {
  state: 'waiting' | 'recording' | 'done' | 'short' | 'failed';
  label: string;
  /** « 0:12 / 0:30 » pendant l'enregistrement. */
  time?: string;
  /** Avancement de 0 à 1 (délai ou durée). */
  progress?: number;
}

/** « 1:05 » */
export function clockLabel(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function recordingIndicator(clock: RecordingClock, now: number, settings: Pick<RecordingSettings, 'delay' | 'duration'>): RecordingIndicator | undefined {
  switch (clock.phase) {
    case 'armed':
      return undefined;
    case 'waiting': {
      const waited = Math.min(settings.delay, (now - clock.shownAt!) / 1000);
      return { state: 'waiting', label: t('Enregistrement dans {n} s', { n: Math.ceil(settings.delay - waited) }), progress: settings.delay ? waited / settings.delay : 1 };
    }
    case 'recording': {
      const elapsed = Math.min(settings.duration, (now - clock.startedAt!) / 1000);
      return { state: 'recording', label: 'REC', time: `${clockLabel(elapsed)} / ${clockLabel(settings.duration)}`, progress: elapsed / settings.duration };
    }
    case 'ended':
      if (clock.reason === 'failed') return { state: 'failed', label: t('Enregistrement interrompu') };
      if (!recordingUsable(clock)) return { state: 'short', label: t('Trop court : pas gardé') };
      return { state: 'done', label: t('Enregistré · {time}', { time: clockLabel(keptSeconds(clock)) }) };
  }
}

/** Phrase de fin, pour l'écran du retour. */
export function recordingEndText(clock: RecordingClock, settings: Pick<RecordingSettings, 'delay' | 'duration'>): string {
  const kept = Math.round(keptSeconds(clock));
  switch (clock.reason) {
    case 'duration':
      return tn(kept, '{n} seconde enregistrée, la durée choisie : la boucle passe par un fondu au noir.', '{n} secondes enregistrées, la durée choisie : la boucle passe par un fondu au noir.');
    case 'game-end':
      if (clock.startedAt === undefined) return t('La table a été quittée avant le début de l’enregistrement ({delay} s après son apparition) : rien n’a été filmé.', { delay: settings.delay });
      if (!recordingUsable(clock)) return t('La table a été quittée au bout de {n} s : trop court pour la roue (au moins {min} s), rien n’a été gardé.', { n: kept, min: MIN_RECORDING_SECONDS });
      return tn(kept, '{n} seconde enregistrée : la table a été quittée avant la fin des {duration} s, la toute fin est coupée.', '{n} secondes enregistrées : la table a été quittée avant la fin des {duration} s, la toute fin est coupée.', { duration: settings.duration });
    case 'failed':
      return t('L’enregistrement s’est interrompu : {error}', { error: clock.error ?? t('erreur inconnue') });
    default:
      return '';
  }
}

/**
 * Niveau de l'image (0 : noir, 1 : telle quelle) à `ms` du début d'un enregistrement de `totalMs` :
 * fondu d'entrée toujours, fondu de sortie seulement quand la fin est connue (fin propre).
 */
export function fadeLevel(ms: number, totalMs: number | undefined, fadeMs = RECORDING_FADE_MS): number {
  const ramp = (x: number) => Math.max(0, Math.min(1, x / fadeMs));
  const into = ramp(ms);
  return totalMs === undefined ? into : Math.min(into, ramp(totalMs - ms));
}

// ---------------------------------------------------------------------------
// Géométrie : ce qui est pris de l'image de l'écran, et comment il est tourné

/** Grand côté de la vidéo produite, par écran (un 4K est réduit : la roue n'a pas besoin de plus). */
export const RECORDING_MAX_LONG: Record<RecordedRole, number> = { playfield: 1920, backglass: 1280, dmd: 1280 };

/** Rotation horaire qui amène les flippers, au bord `edge` de l'image de l'écran, en bas. */
export function uprightRotation(edge: FlipperEdge): Rotation {
  return ((360 - edgeRotation(edge)) % 360) as Rotation;
}

export interface CaptureGeometry {
  /** Partie de l'image de l'écran prise, en pixels de cette image. */
  crop: Rect;
  /** Rotation horaire appliquée à la partie prise. */
  rotation: Rotation;
  /** Taille de la vidéo produite (paire, comme l'exige H.264). */
  width: number;
  height: number;
}

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

/**
 * Ce que l'enregistreur prend d'une image d'écran de `source` pixels : la zone du rôle (en
 * pixels de l'écran, `screen`, ramenés à l'image), tournée de `rotation`, réduite à `maxLong` au
 * plus. `portrait` : un résultat en paysage est recadré au centre en 9:16 (plateau d'un poste de
 * bureau, flippers déjà en bas : la roue prendrait un paysage pour un plateau couché).
 */
export function captureGeometry(zone: Rect, screen: { width: number; height: number }, source: { width: number; height: number }, rotation: Rotation, options: { maxLong: number; portrait?: boolean }): CaptureGeometry {
  const sx = source.width / screen.width;
  const sy = source.height / screen.height;
  let crop: Rect = { x: Math.round(zone.x * sx), y: Math.round(zone.y * sy), width: Math.round(zone.width * sx), height: Math.round(zone.height * sy) };
  const quarter = rotation === 90 || rotation === 270;
  // Proportions après rotation : le recadrage au centre se fait dans l'image d'origine.
  const turnedW = quarter ? crop.height : crop.width;
  const turnedH = quarter ? crop.width : crop.height;
  if (options.portrait && turnedW > turnedH) {
    const wanted = Math.round((turnedH * 9) / 16);
    if (quarter) crop = { ...crop, y: crop.y + Math.round((crop.height - wanted) / 2), height: wanted };
    else crop = { ...crop, x: crop.x + Math.round((crop.width - wanted) / 2), width: wanted };
  }
  const outW = quarter ? crop.height : crop.width;
  const outH = quarter ? crop.width : crop.height;
  const scale = Math.min(1, options.maxLong / Math.max(outW, outH));
  return { crop, rotation, width: even(outW * scale), height: even(outH * scale) };
}

/** Média de la roue que remplit l'écran filmé : plateau, fronton, et pour le DMD celui de son écran. */
export function recordedMediaType(role: RecordedRole, cabinet?: Cabinet): MediaType {
  if (role === 'playfield') return 'Playfield';
  if (role === 'backglass') return 'Backglass';
  return (cabinet && dmdMediaType(cabinet)) ?? 'DMD';
}

/** Rôle filmé pour un type de média (inverse de recordedMediaType). */
export function recordedRoleOf(type: MediaType): RecordedRole | undefined {
  return type === 'Playfield' ? 'playfield' : type === 'Backglass' ? 'backglass' : type === 'DMD' || type === 'FullDMD' ? 'dmd' : undefined;
}

/**
 * Place du témoin, en pixels de l'écran : dans le coin du plateau en haut à droite pour le joueur
 * (loin des flippers et de la bille qu'on suit), quel que soit le sens de l'écran. `rotation` :
 * celle de la mise en page du plateau (menuRotation), `size` : la taille du témoin vu du joueur.
 */
export function indicatorBounds(zone: Rect, rotation: Rotation, size: { width: number; height: number }, margin: number): Rect {
  const quarter = rotation === 90 || rotation === 270;
  const w = quarter ? size.height : size.width;
  const h = quarter ? size.width : size.height;
  // Coin haut-droit du joueur, tourné dans le repère de l'écran : (x, y) → (-y, x) par quart de tour horaire.
  let cx = 1;
  let cy = -1;
  for (let r = 0; r < rotation; r += 90) [cx, cy] = [-cy, cx];
  const x = cx > 0 ? zone.x + zone.width - margin - w : zone.x + margin;
  const y = cy > 0 ? zone.y + zone.height - margin - h : zone.y + margin;
  return { x: Math.round(x), y: Math.round(y), width: Math.round(w), height: Math.round(h) };
}

// ---------------------------------------------------------------------------
// Fichiers : <données>\enregistrements\<nom du .vpx>\(Type) AAAA-MM-JJ HH-MM-SS.mp4

export const RECORDINGS_FOLDER = 'enregistrements';

export function recordingsRoot(dataDir: string): string {
  return path.join(dataDir, RECORDINGS_FOLDER);
}

/** Dossier des enregistrements d'une table : au nom de son .vpx, stable tant que la table l'est. */
export function recordingDir(dataDir: string, table: Pick<TableEntry, 'file'>): string {
  return path.join(recordingsRoot(dataDir), path.basename(table.file).replace(/\.vpx$/i, ''));
}

const pad = (n: number) => String(n).padStart(2, '0');

/** « (Playfield) 2026-10-29 21-14-03.mp4 », à l'heure locale (celle que l'utilisateur cherchera). */
export function recordingFileName(type: MediaType, date: Date, ext: string): string {
  const stamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
  return `(${type}) ${stamp}.${ext.replace(/^\./, '').toLowerCase()}`;
}

export interface SavedRecording {
  type: MediaType;
  file: string;
  date: Date;
  bytes: number;
}

const NAME = /^\((Playfield|Backglass|DMD|FullDMD)\) (\d{4})-(\d\d)-(\d\d) (\d\d)-(\d\d)-(\d\d)\.(mp4|webm)$/i;

/** Enregistrements gardés de côté pour une table, les plus récents d'abord. */
export function listRecordings(dataDir: string, table: Pick<TableEntry, 'file'>): SavedRecording[] {
  const dir = recordingDir(dataDir, table);
  let names: string[] = [];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const out: SavedRecording[] = [];
  for (const name of names) {
    const m = NAME.exec(name);
    if (!m) continue;
    const type = (['Playfield', 'Backglass', 'DMD', 'FullDMD'] as const).find((x) => x.toLowerCase() === m[1]!.toLowerCase())!;
    const file = path.join(dir, name);
    let bytes = 0;
    try {
      bytes = fs.statSync(file).size;
    } catch {
      continue;
    }
    // Un fichier vide (enregistreur arrêté avant la première image) n'est pas un enregistrement.
    if (!bytes) continue;
    const date = new Date(Number(m[2]), Number(m[3]) - 1, Number(m[4]), Number(m[5]), Number(m[6]), Number(m[7]));
    out.push({ type, file, date, bytes });
  }
  return out.sort((a, b) => b.date.getTime() - a.date.getTime() || a.file.localeCompare(b.file));
}

/** « Enregistré en partie : 29 octobre 2026 à 21:14 » */
export function recordingLabel(date: Date): string {
  return t('Enregistré en partie : {date}', { date: formatDateTime(date) });
}
