// DMD sur la roue : pour chaque table, le DMD vivant du menu (livedmd.ts) affiché ou masqué sur
// l'écran du DMD, et sa place dans cet écran. Demande du 06/11/2026 : « Option sur la
// wheel jeu par jeu : activer ou non + position DMD » ; le réglage en partie (dmdplace.ts, les deux
// MagnaSave) reste à part : la roue et la partie ont chacune le leur, sans se mêler.
//
// Sans réglage, la place est automatique (liveDmdArea) : dans le cadre de DMD dessiné sur le média
// FullDMD, sinon une bande 4:1 centrée. Le réglage se fait sur la roue, en voyant l'écran du DMD :
// fiche de la table > « Gérer la table… » > « DMD sur la roue » ; les points bougent en direct.
// Il s'enregistre par configuration de la borne puis par table, dans <données>\dmd-roue.json,
// en fractions de la zone du DMD.
//
// Ici, rien que du calcul : l'écran de réglage est app/src/menu-dmd.ts, le dessin des points
// app/renderer/frontend.js (syncLiveDmd).

import * as fs from 'node:fs';
import * as path from 'node:path';
import { writeFileAtomic } from './atomicwrite';
import { t } from './i18n';
import type { ScreenZone } from './model';
import { formatLabel, moveZone, resizeZone, setZoneAspect, zoneRect, ZONE_FORMATS } from './zones';

// ---------------------------------------------------------------------------
// Réglages enregistrés

/** Réglage du DMD de la roue pour une table, dans une configuration de la borne. */
export interface MenuDmdPlace {
  /** Place des points, en fractions de la zone du DMD ; absente : place automatique. */
  zone?: ScreenZone;
  /** Points masqués : l'écran du DMD montre son fond seul (média FullDMD, ou noir). */
  hidden?: boolean;
  /** Date du réglage. */
  at: string;
}

/** Contenu de <données>\dmd-roue.json. */
export interface MenuDmdPlacesFile {
  version: 1;
  /** Identifiant de configuration -> identifiant de table -> réglage. */
  places: Record<string, Record<string, MenuDmdPlace>>;
}

export const MENU_DMD_FILE = 'dmd-roue.json';

const emptyFile = (): MenuDmdPlacesFile => ({ version: 1, places: {} });

/** Zone lisible et dans l'écran (à un dixième de pixel près sur un écran 4K). */
export function isMenuDmdZone(z: unknown): z is ScreenZone {
  if (!z || typeof z !== 'object') return false;
  const r = z as Record<string, unknown>;
  if (!['x', 'y', 'width', 'height'].every((k) => Number.isFinite(r[k]))) return false;
  const zone = z as ScreenZone;
  const eps = 1e-4;
  return zone.width > 0 && zone.height > 0 && zone.x >= -eps && zone.y >= -eps && zone.x + zone.width <= 1 + eps && zone.y + zone.height <= 1 + eps;
}

/** Lit dmd-roue.json ; un fichier absent ou illisible ne donne aucun réglage, une entrée abîmée est ignorée. */
export function readMenuDmdPlaces(dataDir: string): MenuDmdPlacesFile {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(dataDir, MENU_DMD_FILE), 'utf8')) as Partial<MenuDmdPlacesFile>;
    if (raw.version !== 1 || !raw.places || typeof raw.places !== 'object') return emptyFile();
    const places: MenuDmdPlacesFile['places'] = {};
    for (const [config, tables] of Object.entries(raw.places)) {
      for (const [table, place] of Object.entries(tables ?? {})) {
        if (!place || typeof place !== 'object') continue;
        const zone = isMenuDmdZone(place.zone) ? place.zone : undefined;
        if (!zone && place.hidden !== true) continue;
        (places[config] ??= {})[table] = { ...(zone && { zone }), ...(place.hidden === true && { hidden: true }), at: typeof place.at === 'string' ? place.at : '' };
      }
    }
    return { version: 1, places };
  } catch {
    return emptyFile();
  }
}

export function saveMenuDmdPlaces(dataDir: string, file: MenuDmdPlacesFile): void {
  writeFileAtomic(path.join(dataDir, MENU_DMD_FILE), JSON.stringify(file, null, 2) + '\n');
}

/** Réglage de la table dans cette configuration, s'il y en a un. */
export function menuDmdPlaceOf(file: MenuDmdPlacesFile, configuration: string | undefined, table: string): MenuDmdPlace | undefined {
  return configuration === undefined ? undefined : file.places[configuration]?.[table];
}

/** Le réglage de la table enregistré (undefined : retiré, la table revient à l'automatique). */
export function withMenuDmdPlace(file: MenuDmdPlacesFile, configuration: string, table: string, place: MenuDmdPlace | undefined): MenuDmdPlacesFile {
  const places = { ...file.places, [configuration]: { ...(file.places[configuration] ?? {}) } };
  if (place) places[configuration]![table] = place;
  else delete places[configuration]![table];
  if (!Object.keys(places[configuration]!).length) delete places[configuration];
  return { ...file, places };
}

// ---------------------------------------------------------------------------
// Ce que montre la roue

/** Où sont les points du DMD dans sa zone, et s'ils se montrent. */
export interface MenuDmdSpot {
  zone: ScreenZone;
  hidden: boolean;
}

/** Ce que la roue montre pour une table : son réglage, sinon la place automatique (liveDmdArea), affichée. */
export function menuDmdSpot(auto: ScreenZone, place: MenuDmdPlace | undefined): MenuDmdSpot & { own: boolean } {
  return { zone: place?.zone ?? auto, hidden: place?.hidden === true, own: Boolean(place) };
}

const sameZone = (a: ScreenZone, b: ScreenZone) => (['x', 'y', 'width', 'height'] as const).every((k) => Math.abs(a[k] - b[k]) < 1e-6);

/**
 * Réglage à enregistrer pour ce que montre l'écran de réglage : la place n'est gardée que si elle
 * n'est plus l'automatique (un autre média, un cadre trouvé plus tard la suivent encore) ;
 * undefined : rien à garder, la table revient à l'automatique.
 */
export function menuDmdPlaceFor(spot: MenuDmdSpot, auto: ScreenZone, at: string): MenuDmdPlace | undefined {
  const moved = !sameZone(spot.zone, auto);
  if (!moved && !spot.hidden) return undefined;
  return { ...(moved && { zone: { ...spot.zone } }), ...(spot.hidden && { hidden: true }), at };
}

// ---------------------------------------------------------------------------
// Écran de réglage (fiche > « DMD sur la roue »)

export type MenuDmdItemId = 'shown' | 'moveX' | 'moveY' | 'size' | 'format' | 'save' | 'auto' | 'back';

export const MENU_DMD_ITEMS: readonly MenuDmdItemId[] = ['shown', 'moveX', 'moveY', 'size', 'format', 'save', 'auto', 'back'];

/** Formats des points : 4:1 (128 × 32) d'abord, puis 3:1, 2:1, libre et les autres. */
const FORMATS = [ZONE_FORMATS.find((f) => f.aspect === 4)!, { label: '3:1', aspect: 3 }, { label: '2:1', aspect: 2 }, ...ZONE_FORMATS.filter((f) => f.aspect !== 4)];

/**
 * Pas aux boutons : le pixel ; un bouton maintenu accélère d'un pixel par répétition, jusqu'à
 * MAX_STEP (un écran de DMD fait souvent moins de 1080 pixels de haut : pas de saut d'un bord à
 * l'autre en une seconde). La taille va deux fois plus vite (la largeur, la hauteur suit).
 */
const STEP = 1;
const MAX_STEP = 24;
const SIZE_FACTOR = 2;
const nextStep = (step: number, repeat: boolean) => (repeat ? Math.min(MAX_STEP, step + 1) : STEP);

export interface MenuDmdEditorHost {
  /** Taille de la zone du DMD, en pixels (les pas se comptent en pixels de l'écran). */
  size: { width: number; height: number };
  /** Place automatique pour cette table (liveDmdArea). */
  auto: ScreenZone;
  /** La table a un réglage enregistré dans cette configuration. */
  ownPlace: boolean;
  /** Le réglage ne se voit pas sur la roue maintenant : pourquoi (DMD du menu « classique »…). */
  unseen?: string;
}

export interface MenuDmdEditor {
  /** Ligne ouverte (MENU_DMD_ITEMS), et comment : flippers qui déplacent, ou qui choisissent un format. */
  item?: MenuDmdItemId;
  mode?: 'adjust' | 'choice';
  choice: number;
  step: number;
  spot: MenuDmdSpot;
  /** Ce qui est enregistré (ou à l'ouverture) : « Abandonner » y revient. */
  saved: MenuDmdSpot;
  /** Place à l'ouverture de la ligne : Exit y revient. */
  undo?: MenuDmdSpot;
  /** Changements pas enregistrés au moment de quitter : la question. */
  leaving: boolean;
  notice?: string;
}

const copy = (s: MenuDmdSpot): MenuDmdSpot => ({ zone: { ...s.zone }, hidden: s.hidden });

export function startMenuDmdEditor(spot: MenuDmdSpot): MenuDmdEditor {
  return { choice: 0, step: STEP, spot: copy(spot), saved: copy(spot), leaving: false };
}

/** Ce qui est montré n'est pas ce qui est enregistré. */
export function menuDmdDirty(s: MenuDmdEditor): boolean {
  return s.spot.hidden !== s.saved.hidden || !sameZone(s.spot.zone, s.saved.zone);
}

export function markMenuDmdSaved(s: MenuDmdEditor, notice: string): void {
  s.saved = copy(s.spot);
  s.notice = notice;
}

/** Après « Revenir à la place automatique » : la place automatique, affichée. */
export function markMenuDmdAuto(host: MenuDmdEditorHost, s: MenuDmdEditor): void {
  s.spot = { zone: { ...host.auto }, hidden: false };
  s.saved = copy(s.spot);
  s.item = undefined;
  s.mode = undefined;
  s.notice = t('Cette table reprend la place automatique du DMD sur la roue.');
}

/** Pourquoi une ligne n'est pas disponible (grisée, la raison dite quand on la choisit). */
export function menuDmdBlocked(host: MenuDmdEditorHost, s: MenuDmdEditor, id: MenuDmdItemId): string | undefined {
  if (id === 'auto' && !host.ownPlace && !menuDmdDirty(s)) return t('Cette table suit déjà la place automatique.');
  if (['moveX', 'moveY', 'size', 'format'].includes(id) && s.spot.hidden) return t('DMD masqué : affichez-le d’abord (ligne « DMD sur la roue »).');
  return undefined;
}

export function menuDmdLabel(id: MenuDmdItemId): string {
  switch (id) {
    case 'shown':
      return t('DMD sur la roue');
    case 'moveX':
      return t('Position horizontale');
    case 'moveY':
      return t('Position verticale');
    case 'size':
      return t('Taille');
    case 'format':
      return t('Format');
    case 'save':
      return t('Enregistrer pour cette table');
    case 'auto':
      return t('Revenir à la place automatique');
    case 'back':
      return t('Retour');
  }
}

/** Valeur montrée à côté du libellé, en pixels de l'écran du DMD. */
export function menuDmdValue(host: MenuDmdEditorHost, s: MenuDmdEditor, id: MenuDmdItemId): string {
  const r = zoneRect(s.spot.zone, host.size);
  switch (id) {
    case 'shown':
      return s.spot.hidden ? t('masqué') : t('affiché');
    case 'moveX':
      return `${r.x} px`;
    case 'moveY':
      return `${r.y} px`;
    case 'size':
      return `${r.width} × ${r.height}`;
    case 'format':
      return formatLabel(s.spot.zone.aspect);
    default:
      return '';
  }
}

export function menuDmdFormats(): string[] {
  return FORMATS.map((f) => f.label);
}

function adjust(host: MenuDmdEditorHost, s: MenuDmdEditor, axis: 'x' | 'y' | 'size', delta: number): void {
  const size = host.size;
  if (axis === 'size') {
    // Format libre : la taille garde les proportions du moment.
    const zone = s.spot.zone.aspect ? s.spot.zone : { ...s.spot.zone, aspect: (s.spot.zone.width * size.width) / (s.spot.zone.height * size.height) };
    const resized = resizeZone(zone, size, 'width', delta);
    s.spot = { ...s.spot, zone: s.spot.zone.aspect ? resized : { x: resized.x, y: resized.y, width: resized.width, height: resized.height } };
  } else s.spot = { ...s.spot, zone: moveZone(s.spot.zone, size, axis === 'x' ? delta : 0, axis === 'y' ? delta : 0) };
}

function applyFormat(host: MenuDmdEditorHost, s: MenuDmdEditor, index: number): void {
  const base = s.undo ?? s.spot;
  s.spot = { ...s.spot, zone: setZoneAspect(base.zone, host.size, FORMATS[index]!.aspect) };
}

/** Fin d'un geste : ce que l'application doit faire. */
export type MenuDmdOutcome = 'handled' | 'unhandled' | 'save' | 'auto' | { back: true; save?: boolean };

/** Start sur une ligne de l'écran (ou un clic). */
export function openMenuDmdItem(host: MenuDmdEditorHost, s: MenuDmdEditor, id: MenuDmdItemId): MenuDmdOutcome {
  s.notice = menuDmdBlocked(host, s, id);
  if (s.notice) return 'handled';
  s.mode = undefined;
  s.undo = undefined;
  s.item = id;
  switch (id) {
    case 'shown':
      s.spot = { ...s.spot, hidden: !s.spot.hidden };
      s.item = undefined;
      return 'handled';
    case 'save':
      s.item = undefined;
      return 'save';
    case 'auto':
      s.item = undefined;
      return 'auto';
    case 'back':
      s.item = undefined;
      if (!menuDmdDirty(s)) return { back: true };
      s.leaving = true;
      return 'handled';
    case 'format': {
      s.undo = copy(s.spot);
      s.mode = 'choice';
      const label = formatLabel(s.spot.zone.aspect);
      s.choice = Math.max(0, FORMATS.findIndex((f) => f.label === label));
      return 'handled';
    }
    default:
      s.undo = copy(s.spot);
      s.mode = 'adjust';
      s.step = STEP;
      return 'handled';
  }
}

/** Réponse à « Enregistrer ? » en quittant : 0 enregistrer, 1 abandonner, 2 continuer le réglage. */
export function answerMenuDmdLeave(s: MenuDmdEditor, index: number): MenuDmdOutcome {
  s.leaving = false;
  if (index === 0) return { back: true, save: true };
  if (index === 1) {
    s.spot = copy(s.saved);
    return { back: true };
  }
  return 'handled';
}

export function menuDmdLeaveLabels(): string[] {
  return [t('Enregistrer pour cette table'), t('Abandonner les changements'), t('Continuer le réglage')];
}

export interface MenuDmdKeys {
  /** Flipper gauche : moins, format précédent. */
  previous: string[];
  /** Flipper droit : plus, format suivant. */
  next: string[];
  confirm: string[];
  exit: string[];
  /** MagnaSave gauche, droit : monter, descendre (lignes de position). */
  up: string[];
  down: string[];
}

/**
 * Touche ou bouton pendant l'écran de réglage. Une ligne ouverte prend les flippers (moins, plus ;
 * maintenus : plus vite), les MagnaSave (haut, bas), les flèches et + / − du clavier, Start
 * (valider) et Exit (annuler). Ligne fermée : tout revient à l'écran (choisir une ligne,
 * l'ouvrir, revenir) : 'unhandled'.
 */
export function menuDmdKey(host: MenuDmdEditorHost, s: MenuDmdEditor, keys: MenuDmdKeys, input: { code: string; isAutoRepeat?: boolean }): MenuDmdOutcome {
  const is = (group: string[]) => group.includes(input.code);
  if (s.leaving) return 'unhandled';
  const arrow = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<string, [number, number]>)[input.code];
  const sizeKey = ({ NumpadAdd: 1, Equal: 1, NumpadSubtract: -1, Minus: -1 } as Record<string, number>)[input.code];
  if (s.mode === 'adjust') {
    const axis = s.item === 'moveX' ? 'x' : s.item === 'moveY' ? 'y' : 'size';
    s.step = nextStep(s.step, Boolean(input.isAutoRepeat));
    if (arrow && axis !== 'size') adjust(host, s, arrow[0] ? 'x' : 'y', (arrow[0] || arrow[1]) * s.step);
    else if (sizeKey) adjust(host, s, 'size', sizeKey * s.step * SIZE_FACTOR);
    else if (is(keys.previous) || is(keys.next)) adjust(host, s, axis, (is(keys.next) ? 1 : -1) * s.step * (axis === 'size' ? SIZE_FACTOR : 1));
    // MagnaSave : la hauteur, dans les lignes de position (les points se promènent dans les deux sens sans changer de ligne).
    else if ((is(keys.up) || is(keys.down)) && axis !== 'size') adjust(host, s, 'y', (is(keys.down) ? 1 : -1) * s.step);
    else if (is(keys.confirm) || input.code === 'Enter') closeLine(s);
    else if (is(keys.exit) || input.code === 'Escape') cancelLine(s);
    // Une ligne ouverte garde les boutons : rien ne s'échappe vers l'écran.
    return 'handled';
  }
  if (s.mode === 'choice') {
    if (is(keys.previous) || is(keys.next) || is(keys.up) || is(keys.down) || arrow) {
      const forward = is(keys.next) || is(keys.down) || (arrow !== undefined && arrow[0] + arrow[1] > 0);
      s.choice = (s.choice + (forward ? 1 : -1) + FORMATS.length) % FORMATS.length;
      applyFormat(host, s, s.choice);
    } else if (is(keys.confirm) || input.code === 'Enter') closeLine(s);
    else if (is(keys.exit) || input.code === 'Escape') cancelLine(s);
    return 'handled';
  }
  return 'unhandled';
}

function closeLine(s: MenuDmdEditor): void {
  s.mode = undefined;
  s.undo = undefined;
  s.item = undefined;
}

function cancelLine(s: MenuDmdEditor): void {
  if (s.undo) s.spot = s.undo;
  closeLine(s);
}

/** Choix d'un format au clic (liste montrée sous la ligne ouverte). */
export function chooseMenuDmdFormat(host: MenuDmdEditorHost, s: MenuDmdEditor, index: number): void {
  if (s.mode !== 'choice' || !FORMATS[index]) return;
  s.choice = index;
  applyFormat(host, s, index);
}

/** Cadre et légende dessinés autour des points pendant le réglage (fractions de la zone du DMD). */
export function menuDmdFrameLabel(host: MenuDmdEditorHost, s: MenuDmdEditor): string {
  const r = zoneRect(s.spot.zone, host.size);
  return s.spot.hidden ? t('DMD masqué sur la roue') : t('DMD · {width} × {height} en {x}, {y}', { width: r.width, height: r.height, x: r.x, y: r.y });
}
