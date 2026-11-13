// Position du DMD en partie : le menu que les deux MagnaSave ouvrent pendant une partie (sans eux,
// Crédit et Start : inGameMenuButtons), « Position du DMD » en tête, puis « Tous les réglages de
// VPX » (son propre menu, comme avant) et « Reprendre la partie ».
//
// Le DMD est la fenêtre « Score View » de VPX 10.8.1 ([ScoreView] de VPinballX.ini). Pendant le
// réglage, Cyber Pinball la déplace et la redimensionne en direct (setWindowBounds) : le joueur voit
// le vrai DMD bouger, sur n'importe quel écran de la borne, VPX en pause (il perd le premier plan au
// profit du menu : Player::OnFocusChanged). Sa place s'enregistre pour la table et pour la
// configuration de la borne (décision du 01/11/2026 : « toujours table par table, sinon, c'est la
// config générale de la borne ») : <données>\positions-dmd.json, par configuration puis par table.
// Avant chaque partie, la place de la table pour la configuration branchée est écrite dans le .ini
// de la table ([ScoreView], que VPX lit par-dessus VPinballX.ini) ; une table sans place suit la
// disposition générale (zones de la configuration, écrites dans VPinballX.ini).
//
// Sur un écran FullDMD, l'image FullDMD reste autour : seuls les points du DMD sont posés à la place
// choisie (Priority.B2S = 0 dans la fenêtre : le plugin B2S n'y dessine plus l'image FullDMD du
// .directb2s, le fond de partie de Cyber Pinball montre le média FullDMD derrière).
//
// Ici, rien que du calcul : la fenêtre de VPX, les touches et les fenêtres du menu sont dans
// app/src/in-game-menu.ts.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { writeFileAtomic } from './atomicwrite';
import { buttonInfo } from './buttons';
import { t } from './i18n';
import { IniDocument } from './ini';
import type { ObservedDisplay, Rect, ScreenZone } from './model';
import { vpxDisplayId, type VpxDisplayIdFormat } from './vpx';
import { formatLabel, moveZone, moveZoneToScreen, planDrag, ratioLabel, resizeZone, setZoneAspect, zoneRect, ZONE_FORMATS } from './zones';

// ---------------------------------------------------------------------------
// Places enregistrées

/** Place du DMD pour une table, dans une configuration de la borne. */
export interface DmdPlace {
  /** Empreinte de l'écran physique (PhysicalScreen.fingerprint de la configuration). */
  screen: string;
  /** Zone sur cet écran, en fractions (format verrouillé compris). */
  zone: ScreenZone;
  /** DMD masqué pour cette table : VPX n'ouvre pas sa fenêtre. */
  hidden?: boolean;
  /** Date du réglage. */
  at: string;
}

/** Contenu de <données>\positions-dmd.json. */
export interface DmdPlacesFile {
  version: 1;
  /** Identifiant de configuration -> identifiant de table -> place. */
  places: Record<string, Record<string, DmdPlace>>;
  /**
   * Clés [ScoreView] écrites par Cyber Pinball dans le .ini de chaque table (chemin en minuscules),
   * avec leur valeur : retirées quand la table revient à la disposition générale, sauf celles
   * changées depuis (dans le menu de VPX, « Save as Table Override »).
   */
  written?: Record<string, Record<string, string>>;
}

export const DMD_PLACES_FILE = 'positions-dmd.json';

const emptyPlaces = (): DmdPlacesFile => ({ version: 1, places: {} });

const isZone = (z: unknown): z is ScreenZone =>
  !!z && typeof z === 'object' && ['x', 'y', 'width', 'height'].every((k) => Number.isFinite((z as Record<string, unknown>)[k])) && (z as ScreenZone).width > 0 && (z as ScreenZone).height > 0;

/** Lit positions-dmd.json ; un fichier absent ou illisible ne donne aucune place. */
export function readDmdPlaces(dataDir: string): DmdPlacesFile {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(dataDir, DMD_PLACES_FILE), 'utf8')) as Partial<DmdPlacesFile>;
    if (raw.version !== 1 || !raw.places || typeof raw.places !== 'object') return emptyPlaces();
    const places: DmdPlacesFile['places'] = {};
    for (const [config, tables] of Object.entries(raw.places)) {
      for (const [table, place] of Object.entries(tables ?? {})) {
        if (!place || typeof place.screen !== 'string' || !isZone(place.zone)) continue;
        (places[config] ??= {})[table] = place;
      }
    }
    return { version: 1, places, ...(raw.written && typeof raw.written === 'object' && { written: raw.written }) };
  } catch {
    return emptyPlaces();
  }
}

export function saveDmdPlaces(dataDir: string, file: DmdPlacesFile): void {
  writeFileAtomic(path.join(dataDir, DMD_PLACES_FILE), JSON.stringify(file, null, 2) + '\n');
}

/** Place de la table dans cette configuration, s'il y en a une. */
export function dmdPlaceOf(file: DmdPlacesFile, configuration: string, table: string): DmdPlace | undefined {
  return file.places[configuration]?.[table];
}

/** La place de la table enregistrée (undefined : retirée, la table suit la disposition générale). */
export function withDmdPlace(file: DmdPlacesFile, configuration: string, table: string, place: DmdPlace | undefined): DmdPlacesFile {
  const places = { ...file.places, [configuration]: { ...(file.places[configuration] ?? {}) } };
  if (place) places[configuration]![table] = place;
  else delete places[configuration]![table];
  if (!Object.keys(places[configuration]!).length) delete places[configuration];
  return { ...file, places };
}

// ---------------------------------------------------------------------------
// [ScoreView] du .ini de la table

const SECTION = 'ScoreView';

/**
 * Clés [ScoreView] qui posent le DMD de la table à sa place : une fenêtre (Output = 1) sur l'écran
 * choisi, jamais plein écran, à la position et à la taille réglées. Priority.B2S = 0 : seuls les
 * points du DMD y sont dessinés, jamais l'image FullDMD du .directb2s (l'écran FullDMD garde son
 * image autour, montrée par le fond de partie).
 *
 * Masqué : la fenêtre existe quand même (Output = 1), à sa place ; Cyber Pinball la range hors des
 * écrans dès que VPX la crée, avant son premier affichage (in-game-menu.ts, parkHiddenDmd). Avec
 * Output = 0, VPX n'ouvre aucune fenêtre : « DMD affiché » dans le menu en partie ne montrait rien
 * jusqu'au redémarrage de la table (13/11/2026). À sa vraie taille, et non réduite : le plugin
 * ScoreView choisit sa mise en page sur la taille de la fenêtre à son premier rendu.
 */
export function dmdPlaceSettings(place: DmdPlace, display: ObservedDisplay, format: VpxDisplayIdFormat): Record<string, string> {
  const rect = zoneRect(place.zone, display.bounds);
  return {
    ScoreViewOutput: '1',
    ScoreViewDisplay: vpxDisplayId(display, format),
    ScoreViewFullScreen: '0',
    ScoreViewWndX: String(rect.x),
    ScoreViewWndY: String(rect.y),
    ScoreViewWidth: String(rect.width),
    ScoreViewHeight: String(rect.height),
    'Priority.B2S': '0',
  };
}

/**
 * Où ranger la fenêtre du DMD de VPX masqué : hors de tout écran, à gauche du bureau, à sa taille.
 * Pas ShowWindow(SW_HIDE) : VPX 10.8.1 remontre à chaque image une fenêtre annexe cachée
 * (Renderer::RenderAncillaryWindow : « if (!IsVisible()) Show() ») ; elle ne bouge pas, elle.
 */
export function dmdParkedRect(displays: readonly Rect[], size: { width: number; height: number }): Rect {
  const left = displays.length ? Math.min(...displays.map((d) => d.x)) : 0;
  const top = displays.length ? Math.min(...displays.map((d) => d.y)) : 0;
  return { x: left - size.width - 256, y: top, width: size.width, height: size.height };
}

/** La fenêtre est rangée : le DMD ne se voit sur aucun écran. */
export function dmdWindowHidden(displays: readonly Rect[], rect: Rect): boolean {
  return !displays.some((d) => rect.x < d.x + d.width && rect.x + rect.width > d.x && rect.y < d.y + d.height && rect.y + rect.height > d.y);
}

export interface DmdIniUpdate {
  /** Nouveau contenu du .ini ; undefined : rien à écrire ; '' : le fichier n'a plus rien. */
  content?: string;
  /** Clés à retenir comme écrites par Cyber Pinball ; null : plus aucune. */
  written: Record<string, string> | null;
}

/**
 * Le .ini de la table avant la partie. Avec une place (`wanted`) : ses clés, écrites telles quelles.
 * Sans place : les clés écrites la dernière fois (`written`) sont retirées, sauf celles changées
 * depuis : une place réglée dans le menu de VPX (« Save as Table Override ») reste.
 */
export function dmdIniUpdate(iniText: string, wanted: Record<string, string> | undefined, written: Record<string, string> | undefined): DmdIniUpdate {
  const doc = IniDocument.parse(iniText);
  if (wanted) {
    const changed = Object.entries(wanted).filter(([key, value]) => doc.get(SECTION, key)?.trim() !== value);
    for (const [key, value] of changed) doc.set(SECTION, key, value);
    return { content: changed.length ? doc.toString() : undefined, written: wanted };
  }
  if (!written) return { written: null };
  let removed = 0;
  for (const [key, value] of Object.entries(written)) {
    if (doc.get(SECTION, key)?.trim() !== value) continue;
    doc.remove(SECTION, key);
    removed++;
  }
  if (!removed) return { written: null };
  return { content: doc.entries().length ? doc.toString() : '', written: null };
}

/** Clé du .ini d'une table dans DmdPlacesFile.written. */
export const writtenKey = (iniPath: string): string => path.resolve(iniPath).toLowerCase();

// ---------------------------------------------------------------------------
// Le menu en partie

/** Un écran de la borne, tel que le menu le propose. */
export interface DmdScreen {
  /** Empreinte de l'écran physique de la configuration. */
  fingerprint: string;
  /** « 2 · PL2294H (1920 × 1080) ». */
  label: string;
  /** Bornes en pixels physiques du bureau (ObservedDisplay.bounds). */
  bounds: Rect;
}

export interface DmdMenuKeys {
  /** Ligne précédente ; dans une ligne ouverte, moins (flipper gauche). */
  previous: string[];
  /** Ligne suivante ; dans une ligne ouverte, plus (flipper droit). */
  next: string[];
  /** Ouvrir une ligne, la valider (Start). */
  confirm: string[];
  /** Annuler une ligne ouverte, puis quitter le menu (Exit). */
  exit: string[];
  /** MagnaSave gauche : monter (dans une ligne de position), sinon ligne précédente. */
  up: string[];
  /** MagnaSave droit : descendre (dans une ligne de position), sinon ligne suivante. */
  down: string[];
}

export interface DmdMenuHost {
  screens: DmdScreen[];
  keys: DmdMenuKeys;
  /** Nom de la table en cours. */
  table: string;
  /** Nom de la configuration de la borne. */
  configuration: string;
  /** La table a sa propre place dans cette configuration. */
  ownPlace: boolean;
  /** Place générale de la configuration (zones de l'assistant) ; undefined : la configuration n'a pas de DMD. */
  general?: { screen: number; zone: ScreenZone; hidden: boolean };
  /** Le DMD a une fenêtre dans cette partie : le réglage se voit en direct. Sinon, pourquoi. */
  live: true | string;
  /** « Tous les réglages de VPX » impossible : pourquoi (aucune touche n'ouvre son menu). */
  vpxMenuBlocked?: string;
  /**
   * Vision 3D activée (vision3d.ts) : true, la tête est suivie et « Recentrer la vue 3D » est
   * possible ; un texte, pourquoi elle ne l'est pas. Absente : Vision 3D désactivée, ligne cachée.
   */
  vision3d?: true | string;
  /** Intensité de la Vision 3D, telle que la ligne la montre (« 75 % »). */
  vision3dIntensity?: string;
}

/** Lignes du menu, dans l'ordre. */
export type DmdItemId = 'screen' | 'moveX' | 'moveY' | 'width' | 'height' | 'format' | 'shown' | 'save' | 'general' | 'recenter3d' | 'intensity3d' | 'vpx' | 'resume';

const ITEMS: readonly { id: DmdItemId; label: () => string }[] = [
  { id: 'screen', label: () => t('Écran') },
  { id: 'moveX', label: () => t('Position horizontale') },
  { id: 'moveY', label: () => t('Position verticale') },
  { id: 'width', label: () => t('Largeur') },
  { id: 'height', label: () => t('Hauteur') },
  { id: 'format', label: () => t('Format') },
  { id: 'shown', label: () => t('DMD') },
  { id: 'save', label: () => t('Enregistrer pour cette table') },
  { id: 'general', label: () => t('Revenir à la position générale') },
  { id: 'recenter3d', label: () => t('Recentrer la vue 3D') },
  { id: 'intensity3d', label: () => t('Intensité de la vue 3D') },
  { id: 'vpx', label: () => t('Tous les réglages de VPX') },
  { id: 'resume', label: () => t('Reprendre la partie') },
];

/** Ligne montrée dans cette partie : « Recentrer la vue 3D » seulement quand la Vision 3D est activée. */
const shown = (host: DmdMenuHost, id: DmdItemId) => (id !== 'recenter3d' && id !== 'intensity3d') || host.vision3d !== undefined;

/** Lignes qui règlent la place du DMD (le reste : enregistrer, quitter). */
const PLACE_ITEMS: readonly DmdItemId[] = ['screen', 'moveX', 'moveY', 'width', 'height', 'format', 'shown'];

/**
 * Formats proposés pour le DMD : 4:1 (128 × 32) d'abord, puis libre (largeur et hauteur réglées
 * chacune seule : un flipper ramène au 4:1), et les autres.
 */
const FORMATS = [ZONE_FORMATS.find((f) => f.aspect === 4)!, ZONE_FORMATS.find((f) => !f.aspect)!, { label: '3:1', aspect: 3 }, { label: '2:1', aspect: 2 }, ...ZONE_FORMATS.filter((f) => f.aspect && f.aspect !== 4)];

/** Pas d'un réglage aux boutons : le pixel ; un bouton maintenu accélère jusqu'à MAX_STEP. */
const STEP = 1;
const MAX_STEP = 64;
const nextStep = (step: number, repeat: boolean) => (repeat ? Math.min(MAX_STEP, Math.max(step + 1, Math.round(step * 1.3))) : STEP);

/** Où est le DMD : un écran de la borne, une zone dessus, affiché ou masqué. */
export interface DmdSpot {
  screen: number;
  zone: ScreenZone;
  hidden: boolean;
}

/** Fin d'un geste sur le menu : ce que l'application doit faire. */
export type DmdMenuOutcome =
  | 'handled'
  | 'unhandled'
  /** Enregistrer la place pour la table, puis `then`. */
  | { save: true; then: 'stay' | 'resume' | 'vpx' }
  /** Retirer la place de la table (position générale), le menu reste ouvert. */
  | 'general'
  /** Fermer le menu et ouvrir celui de VPX ; `discard` : les changements sont abandonnés. */
  | { vpx: true; discard: boolean }
  /** Fermer le menu, la partie reprend ; `discard` : les changements sont abandonnés. */
  | { resume: true; discard: boolean }
  /** Vision 3D : remesurer la position de jeu sur la tête du joueur ; le menu reste ouvert. */
  | { recenter3d: true }
  /** Vision 3D : intensité suivante (25 à 150 %), effet immédiat ; le menu reste ouvert. */
  | { intensity3d: true };

export interface DmdMenuState {
  item: number;
  mode?: 'adjust' | 'choice';
  choice: number;
  step: number;
  spot: DmdSpot;
  /** Ce qui est en vigueur pour cette partie (enregistré, ou à l'ouverture) : « Annuler ». */
  saved: DmdSpot;
  /** Place à l'ouverture de la ligne : Exit y revient. */
  undo?: DmdSpot;
  /** Changements pas enregistrés au moment de quitter : la question, et vers quoi on allait. */
  leaving?: { to: 'resume' | 'vpx'; choice: number };
  /** Aimantation des bords tirés à la souris. */
  snap: boolean;
  /** Geste de souris en cours : l'écran où le DMD a été saisi. */
  grab?: number;
  notice?: string;
}

/** Menu ouvert sur la place actuelle du DMD, la ligne « Écran » choisie. */
export function startDmdMenu(spot: DmdSpot): DmdMenuState {
  return { item: 0, choice: 0, step: STEP, spot: { ...spot, zone: { ...spot.zone } }, saved: { ...spot, zone: { ...spot.zone } }, snap: true };
}

const sameSpot = (a: DmdSpot, b: DmdSpot) =>
  a.screen === b.screen && a.hidden === b.hidden && ['x', 'y', 'width', 'height'].every((k) => Math.abs(a.zone[k as keyof Rect] - b.zone[k as keyof Rect]) < 1e-6);

/** La place a changé depuis l'ouverture du menu (ou le dernier enregistrement). */
export function dmdMenuDirty(s: DmdMenuState): boolean {
  return !sameSpot(s.spot, s.saved);
}

/** Après un enregistrement : ce qui est en vigueur est la place montrée. */
export function markDmdSaved(s: DmdMenuState, notice: string): void {
  s.saved = { ...s.spot, zone: { ...s.spot.zone } };
  s.notice = notice;
}

/** Après « Revenir à la position générale » : la place générale, en vigueur pour la prochaine partie. */
export function markDmdGeneral(host: DmdMenuHost, s: DmdMenuState): void {
  if (host.general) s.spot = { ...host.general, zone: { ...host.general.zone } };
  s.saved = { ...s.spot, zone: { ...s.spot.zone } };
  s.notice = t('Cette table suit de nouveau la position générale de la configuration « {name} ».', { name: host.configuration });
}

const boundsOf = (host: DmdMenuHost, s: DmdMenuState) => host.screens[s.spot.screen]!.bounds;

function itemBlocked(host: DmdMenuHost, s: DmdMenuState, id: DmdItemId): string | undefined {
  if (id === 'general' && !host.ownPlace) return t('Cette table n’a pas de position à elle : elle suit déjà la position générale.');
  if (id === 'vpx') return host.vpxMenuBlocked;
  if (id === 'recenter3d' && typeof host.vision3d === 'string') return host.vision3d;
  if (id === 'screen' && host.screens.length < 2) return t('Un seul écran branché.');
  if (['moveX', 'moveY', 'width', 'height', 'format'].includes(id) && s.spot.hidden) return t('DMD masqué : affichez-le d’abord (ligne « DMD »).');
  return undefined;
}

interface Choice {
  label: string;
  apply: (host: DmdMenuHost, s: DmdMenuState) => void;
}

function choicesFor(host: DmdMenuHost, s: DmdMenuState, id: DmdItemId): Choice[] {
  const base = () => s.undo ?? s.spot;
  if (id === 'screen')
    return host.screens.map((screen, i) => ({
      label: screen.label,
      apply: (h, st) => {
        const from = base();
        st.spot = { ...st.spot, screen: i, zone: from.screen === i ? from.zone : moveZoneToScreen(from.zone, h.screens[from.screen]!.bounds, screen.bounds) };
      },
    }));
  if (id === 'format')
    return FORMATS.map((f) => ({
      label: f.label,
      apply: (h, st) => {
        st.spot = { ...st.spot, zone: setZoneAspect(base().zone, h.screens[st.spot.screen]!.bounds, f.aspect) };
      },
    }));
  return [];
}

function valueOf(host: DmdMenuHost, s: DmdMenuState, id: DmdItemId): string {
  const r = zoneRect(s.spot.zone, boundsOf(host, s));
  switch (id) {
    case 'screen':
      return host.screens[s.spot.screen]!.label;
    case 'moveX':
      return `${r.x} px`;
    case 'moveY':
      return `${r.y} px`;
    case 'width':
      return `${r.width} px`;
    case 'height':
      return `${r.height} px`;
    case 'format':
      // Largeur ou hauteur réglée seule : « Libre », avec les proportions du moment.
      return s.spot.zone.aspect || !(r.width > 0 && r.height > 0) ? formatLabel(s.spot.zone.aspect) : `${formatLabel(undefined)} · ${ratioLabel(r.width / r.height)}`;
    case 'shown':
      return s.spot.hidden ? t('masqué') : t('affiché');
    case 'intensity3d':
      return host.vision3dIntensity ?? '';
    default:
      return '';
  }
}

/**
 * Pas courant selon l'axe : position, largeur ou hauteur seule (le format se libère, « Format » y
 * revient ; demande du 12/11/2026), ou les deux ensemble (+ et − du clavier : proportions gardées).
 */
function adjust(host: DmdMenuHost, s: DmdMenuState, axis: 'x' | 'y' | 'width' | 'height' | 'size', delta: number): void {
  const size = boundsOf(host, s);
  if (axis === 'width' || axis === 'height') {
    const { aspect: _free, ...zone } = s.spot.zone;
    s.spot = { ...s.spot, zone: resizeZone(zone, size, axis, delta) };
  } else if (axis === 'size') {
    // Format libre : la taille garde les proportions du moment.
    const zone = s.spot.zone.aspect ? s.spot.zone : { ...s.spot.zone, aspect: (s.spot.zone.width * size.width) / (s.spot.zone.height * size.height) };
    const resized = resizeZone(zone, size, 'width', delta);
    s.spot = { ...s.spot, zone: s.spot.zone.aspect ? resized : { x: resized.x, y: resized.y, width: resized.width, height: resized.height } };
  } else s.spot = { ...s.spot, zone: moveZone(s.spot.zone, size, axis === 'x' ? delta : 0, axis === 'y' ? delta : 0) };
}

function open(host: DmdMenuHost, s: DmdMenuState): DmdMenuOutcome {
  const id = ITEMS[s.item]!.id;
  s.notice = itemBlocked(host, s, id);
  if (s.notice) return 'handled';
  switch (id) {
    case 'shown':
      s.spot = { ...s.spot, hidden: !s.spot.hidden };
      return 'handled';
    case 'save':
      return { save: true, then: 'stay' };
    case 'general':
      return 'general';
    case 'recenter3d':
      return { recenter3d: true };
    case 'intensity3d':
      return { intensity3d: true };
    case 'vpx':
      return leave(s, 'vpx');
    case 'resume':
      return leave(s, 'resume');
    case 'moveX':
    case 'moveY':
    case 'width':
    case 'height':
      s.undo = { ...s.spot };
      s.mode = 'adjust';
      s.step = STEP;
      return 'handled';
    default: {
      s.undo = { ...s.spot };
      s.mode = 'choice';
      const choices = choicesFor(host, s, id);
      const current = id === 'screen' ? s.spot.screen : choices.findIndex((c) => c.label === formatLabel(s.spot.zone.aspect));
      s.choice = Math.max(0, current);
      return 'handled';
    }
  }
}

/** Quitter : directement sans changement, sinon la question « Enregistrer ? ». */
function leave(s: DmdMenuState, to: 'resume' | 'vpx'): DmdMenuOutcome {
  if (!dmdMenuDirty(s)) return to === 'vpx' ? { vpx: true, discard: false } : { resume: true, discard: false };
  s.leaving = { to, choice: 0 };
  return 'handled';
}

const LEAVE_CHOICES = ['save', 'discard', 'stay'] as const;

function leaveLabels(): string[] {
  return [t('Enregistrer pour cette table'), t('Abandonner les changements'), t('Continuer le réglage')];
}

function answerLeave(s: DmdMenuState, index: number): DmdMenuOutcome {
  const to = s.leaving!.to;
  s.leaving = undefined;
  switch (LEAVE_CHOICES[index]) {
    case 'save':
      return { save: true, then: to };
    case 'discard':
      return to === 'vpx' ? { vpx: true, discard: true } : { resume: true, discard: true };
    default:
      return 'handled';
  }
}

function close(s: DmdMenuState): void {
  s.mode = undefined;
  s.undo = undefined;
}

function cancel(s: DmdMenuState): void {
  if (s.undo) s.spot = s.undo;
  close(s);
}

const ADJUST_AXIS: Partial<Record<DmdItemId, 'x' | 'y' | 'width' | 'height'>> = { moveX: 'x', moveY: 'y', width: 'width', height: 'height' };

/** Touche ou bouton (KeyboardEvent.code, ou jeton de joystick) pendant le menu. */
export function dmdMenuKey(host: DmdMenuHost, s: DmdMenuState, input: { code: string; isAutoRepeat?: boolean }): DmdMenuOutcome {
  const is = (group: string[]) => group.includes(input.code);
  const k = host.keys;
  if (s.leaving) {
    if (is(k.previous) || is(k.up)) s.leaving.choice = (s.leaving.choice + LEAVE_CHOICES.length - 1) % LEAVE_CHOICES.length;
    else if (is(k.next) || is(k.down)) s.leaving.choice = (s.leaving.choice + 1) % LEAVE_CHOICES.length;
    else if (is(k.confirm) || input.code === 'Enter') return answerLeave(s, s.leaving.choice);
    else if (is(k.exit) || input.code === 'Escape') s.leaving = undefined;
    else return 'unhandled';
    return 'handled';
  }
  const id = ITEMS[s.item]!.id;
  const arrow = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<string, [number, number]>)[input.code];
  const sizeKey = ({ NumpadAdd: 1, Equal: 1, NumpadSubtract: -1, Minus: -1 } as Record<string, number>)[input.code];
  // Flèches du clavier et + / − : la place du DMD, quelle que soit la ligne (DMD affiché) ; sur la
  // largeur ou la hauteur ouverte, ← → la largeur, ↑ ↓ la hauteur.
  if ((arrow || sizeKey) && s.mode !== 'choice' && !s.spot.hidden) {
    s.step = nextStep(s.step, Boolean(input.isAutoRepeat));
    const sizing = s.mode === 'adjust' && (id === 'width' || id === 'height');
    if (arrow && sizing) adjust(host, s, arrow[0] ? 'width' : 'height', (arrow[0] || -arrow[1]) * s.step);
    else if (arrow) adjust(host, s, arrow[0] ? 'x' : 'y', (arrow[0] || arrow[1]) * s.step);
    else adjust(host, s, 'size', sizeKey! * s.step * 4);
    return 'handled';
  }
  if (s.mode === 'adjust') {
    s.step = nextStep(s.step, Boolean(input.isAutoRepeat));
    const axis = ADJUST_AXIS[id]!;
    const moving = axis === 'x' || axis === 'y';
    if (is(k.previous) || is(k.next)) adjust(host, s, axis, (is(k.next) ? 1 : -1) * s.step);
    // MagnaSave : la hauteur, dans les lignes de position (le DMD se promène dans les deux sens sans changer de ligne).
    else if ((is(k.up) || is(k.down)) && moving) adjust(host, s, 'y', (is(k.down) ? 1 : -1) * s.step);
    else if (is(k.confirm) || input.code === 'Enter') close(s);
    else if (is(k.exit) || input.code === 'Escape') cancel(s);
    else return 'unhandled';
    return 'handled';
  }
  if (s.mode === 'choice') {
    const choices = choicesFor(host, s, id);
    if (is(k.previous) || is(k.next) || is(k.up) || is(k.down) || arrow) {
      const forward = is(k.next) || is(k.down) || (arrow !== undefined && arrow[0] + arrow[1] > 0);
      s.choice = (s.choice + (forward ? 1 : -1) + choices.length) % choices.length;
      choices[s.choice]!.apply(host, s);
    } else if (is(k.confirm) || input.code === 'Enter') close(s);
    else if (is(k.exit) || input.code === 'Escape') cancel(s);
    else return 'unhandled';
    return 'handled';
  }
  s.notice = undefined;
  if (is(k.previous) || is(k.up) || is(k.next) || is(k.down)) {
    const step = is(k.previous) || is(k.up) ? -1 : 1;
    do s.item = (s.item + step + ITEMS.length) % ITEMS.length;
    while (!shown(host, ITEMS[s.item]!.id));
  }
  else if (is(k.confirm) || input.code === 'Enter') return open(host, s);
  else if (is(k.exit) || input.code === 'Escape') return leave(s, 'resume');
  else return 'unhandled';
  return 'handled';
}

/** Geste de la souris, envoyé par la page du menu ou par celle d'un écran. */
export type DmdMenuAction =
  | { op: 'item'; index: number }
  | { op: 'step'; delta: number }
  | { op: 'confirm' | 'cancel' }
  | { op: 'leave'; index: number }
  | { op: 'grab'; screen: number }
  | {
      op: 'drag';
      handle: 'move' | 'nw' | 'ne' | 'sw' | 'se';
      /** Rectangle tiré, en fractions de l'écran où le geste a commencé. */
      rect: ScreenZone;
      /** Pointeur en fractions de la fenêtre du geste, hors de 0..1 s'il l'a quittée. */
      pointer?: { x: number; y: number };
      /** Alt maintenu : pas d'aimantation. */
      free?: boolean;
    };

export function dmdMenuAction(host: DmdMenuHost, s: DmdMenuState, action: DmdMenuAction): DmdMenuOutcome {
  switch (action.op) {
    case 'item':
      if (!ITEMS[action.index] || !shown(host, ITEMS[action.index]!.id) || s.leaving) return 'handled';
      if (s.mode) close(s);
      s.item = action.index;
      return open(host, s);
    case 'step': {
      const id = ITEMS[s.item]!.id;
      if (s.mode === 'choice') {
        const choices = choicesFor(host, s, id);
        s.choice = (s.choice + action.delta + choices.length) % choices.length;
        choices[s.choice]!.apply(host, s);
      } else if (s.mode === 'adjust') adjust(host, s, ADJUST_AXIS[id]!, action.delta * 10);
      return 'handled';
    }
    case 'confirm':
      if (s.mode) close(s);
      return 'handled';
    case 'cancel':
      cancel(s);
      return 'handled';
    case 'leave':
      return s.leaving ? answerLeave(s, action.index) : 'handled';
    case 'grab':
      if (s.mode) close(s);
      s.grab = s.spot.screen;
      return 'handled';
    case 'drag': {
      if (s.spot.hidden) return 'handled';
      const origin = s.grab ?? s.spot.screen;
      const plan = planDrag({
        displays: host.screens,
        role: 'dmd',
        origin,
        current: s.spot.screen,
        zone: s.spot.zone,
        handle: action.handle,
        rect: action.rect,
        pointer: action.pointer,
        snap: s.snap && !action.free,
        others: () => [],
      });
      s.spot = { ...s.spot, screen: plan.display, zone: plan.zone };
      s.notice = plan.display !== origin ? t('DMD sur l’écran {n} : relâchez pour l’y laisser.', { n: plan.display + 1 }) : undefined;
      return 'handled';
    }
  }
}

/** Ce que montre le panneau du menu (page in-game-menu.html). */
export interface DmdMenuPanel {
  title: string;
  detail: string;
  sections: { title: string; items: { index: number; label: string; value: string; selected: boolean; open: boolean; disabled?: string }[] }[];
  choices?: { label: string; selected: boolean }[];
  leaving?: { title: string; choices: { label: string; selected: boolean }[] };
  hint: string;
  notice?: string;
  live?: string;
  mouse: string;
}

/**
 * Nom montré d'un groupe de touches du menu : le bouton de la borne (« Flipper gauche », « MagnaSave
 * droit », « Start », « Exit »), jamais la touche de l'encodeur ni le numéro d'un bouton de joystick.
 */
export function dmdMenuKeyNames(keys: DmdMenuKeys): (codes: string[]) => string {
  const names = new Map<string[], string>([
    [keys.previous, buttonInfo('leftFlipper').label],
    [keys.next, buttonInfo('rightFlipper').label],
    [keys.up, buttonInfo('leftMagna').label],
    [keys.down, buttonInfo('rightMagna').label],
    [keys.confirm, buttonInfo('start').label],
    [keys.exit, buttonInfo('exit').label],
  ]);
  return (codes) => (codes.length ? (names.get(codes) ?? codes.join(' / ')) : '');
}

/** Panneau du menu, sur l'écran du playfield. `keyLabel` : nom montré d'un groupe de touches (dmdMenuKeyNames). */
export function dmdMenuPanel(host: DmdMenuHost, s: DmdMenuState, keyLabel: (codes: string[]) => string): DmdMenuPanel {
  const id = ITEMS[s.item]!.id;
  const line = (index: number) => {
    const it = ITEMS[index]!;
    const disabled = itemBlocked(host, s, it.id);
    return { index, label: it.label(), value: valueOf(host, s, it.id), selected: index === s.item && !s.leaving, open: index === s.item && Boolean(s.mode), ...(disabled && { disabled }) };
  };
  const indices = (ids: readonly DmdItemId[]) => ITEMS.map((it, i) => (ids.includes(it.id) ? i : -1)).filter((i) => i >= 0);
  const prev = keyLabel(host.keys.previous);
  const next = keyLabel(host.keys.next);
  const up = keyLabel(host.keys.up);
  const down = keyLabel(host.keys.down);
  const ok = keyLabel(host.keys.confirm);
  const no = keyLabel(host.keys.exit);
  const choices = s.mode === 'choice' ? choicesFor(host, s, id) : [];
  const hint = s.leaving
    ? t('{previous} / {next} : choisir · {confirm} : valider · {exit} : continuer le réglage', { previous: prev, next, confirm: ok, exit: no })
    : s.mode === 'adjust'
      ? id === 'width' || id === 'height'
        ? t('{previous} / {next} : réduire ou agrandir (maintenir pour aller vite) · {confirm} : valider · {exit} : annuler', { previous: prev, next, confirm: ok, exit: no })
        : up && down
          ? t('{previous} / {next} : gauche, droite · {up} / {down} : haut, bas (maintenir pour aller vite) · {confirm} : valider · {exit} : annuler', { previous: prev, next, up, down, confirm: ok, exit: no })
          : t('{previous} / {next} : déplacer (maintenir pour aller vite) · {confirm} : valider · {exit} : annuler', { previous: prev, next, confirm: ok, exit: no })
      : s.mode === 'choice'
        ? t('{previous} / {next} : {choice} · {confirm} : valider · {exit} : annuler', { previous: prev, next, choice: choices[s.choice]?.label ?? '', confirm: ok, exit: no })
        : t('{previous} / {next} : choisir une ligne · {confirm} : l’ouvrir · {exit} : reprendre la partie', { previous: prev, next, confirm: ok, exit: no });
  return {
    title: t('Réglages en partie'),
    detail: t('{table} · configuration « {configuration} »', { table: host.table, configuration: host.configuration }),
    sections: [
      {
        title: host.ownPlace ? t('Position du DMD · réglée pour cette table') : t('Position du DMD · position générale'),
        items: indices(PLACE_ITEMS).map(line),
      },
      { title: '', items: indices(['save', 'general']).map(line) },
      { title: t('Partie'), items: indices(shown(host, 'recenter3d') ? ['recenter3d', 'intensity3d', 'vpx', 'resume'] : ['vpx', 'resume']).map(line) },
    ],
    ...(s.mode === 'choice' && { choices: choices.map((c, i) => ({ label: c.label, selected: i === s.choice })) }),
    ...(s.leaving && {
      leaving: {
        title: t('La position du DMD a changé sans être enregistrée.'),
        choices: leaveLabels().map((label, i) => ({ label, selected: i === s.leaving!.choice })),
      },
    }),
    hint,
    ...(s.notice && { notice: s.notice }),
    ...(host.live !== true && { live: host.live }),
    mouse: t('Souris : tirez le DMD pour le déplacer, jusque sur un autre écran ; tirez un coin pour le redimensionner ; Alt maintenu : sans aimantation.'),
  };
}

/** Cadre du DMD sur un écran (fenêtre de cet écran par-dessus VPX) : fractions de l'écran. */
export interface DmdMenuFrame {
  zone: ScreenZone;
  label: string;
  hidden: boolean;
  /**
   * Aucune fenêtre du DMD de VPX dans cette partie : le cadre se remplit d'un aperçu (points du DMD),
   * pour voir la place qu'il prendra à la prochaine partie.
   */
  preview: boolean;
}

/** Cadre à dessiner sur l'écran `index`, s'il porte le DMD. */
export function dmdMenuFrame(host: DmdMenuHost, s: DmdMenuState, index: number): DmdMenuFrame | undefined {
  if (s.spot.screen !== index) return undefined;
  const r = zoneRect(s.spot.zone, host.screens[index]!.bounds);
  return {
    zone: s.spot.zone,
    label: s.spot.hidden ? t('DMD masqué · {width} × {height}', { width: r.width, height: r.height }) : t('DMD · {width} × {height} en {x}, {y}', { width: r.width, height: r.height, x: r.x, y: r.y }),
    hidden: s.spot.hidden,
    preview: host.live !== true && !s.spot.hidden,
  };
}

/** Rectangle du DMD en pixels physiques du bureau (pour la fenêtre de VPX). */
export function dmdSpotRect(host: { screens: readonly DmdScreen[] }, spot: DmdSpot): Rect {
  const bounds = host.screens[spot.screen]!.bounds;
  const r = zoneRect(spot.zone, bounds);
  return { x: bounds.x + r.x, y: bounds.y + r.y, width: r.width, height: r.height };
}

/**
 * Place du DMD lue sur sa fenêtre (pixels physiques du bureau) : l'écran qui contient son centre, et
 * la zone qu'elle y occupe (format 4:1 verrouillé quand elle l'a, à un pixel près) ; undefined hors
 * de tout écran.
 */
export function dmdSpotOfRect(screens: readonly DmdScreen[], rect: Rect, hidden = false): DmdSpot | undefined {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const screen = screens.findIndex((s) => cx >= s.bounds.x && cx < s.bounds.x + s.bounds.width && cy >= s.bounds.y && cy < s.bounds.y + s.bounds.height);
  if (screen < 0) return undefined;
  const b = screens[screen]!.bounds;
  const x = Math.max(0, rect.x - b.x);
  const y = Math.max(0, rect.y - b.y);
  const width = Math.min(rect.width, b.width - x);
  const height = Math.min(rect.height, b.height - y);
  const aspect = Math.abs(width - height * 4) <= 1 ? 4 : undefined;
  return { screen, hidden, zone: { x: x / b.width, y: y / b.height, width: width / b.width, height: height / b.height, ...(aspect && { aspect }) } };
}
