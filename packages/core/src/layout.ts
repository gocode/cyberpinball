// Géométrie du playfield : où se tient le joueur, et taille réelle de l'image.
// Le cadrage des tables par VPX en dépend (ScreenWidth, ScreenHeight, vue borne).

import { t } from './i18n';
import { edgeRotation, type Cabinet, type EdidInfo, type FlipperEdge, type ObservedDisplay, type Rotation } from './model';

const CM_PER_INCH = 2.54;

/** Bords dans l'ordre des aiguilles d'une montre, vus sur l'image Windows. */
export const FLIPPER_EDGES: readonly FlipperEdge[] = ['bottom', 'left', 'top', 'right'];

export const EDGE_LABELS: Record<FlipperEdge, string> = {
  get bottom() { return t('en bas'); },
  get left() { return t('à gauche'); },
  get top() { return t('en haut'); },
  get right() { return t('à droite'); },
};

/**
 * Bord du joueur dans l'image après avoir tourné l'orientation Windows de `delta`
 * degrés (DMDO_90 et suivants). Le joueur ne bouge pas, l'image tourne sous lui :
 * chaque quart de tour fait avancer son bord d'un cran dans FLIPPER_EDGES, et un
 * retournement (180°) échange gauche et droite, haut et bas.
 */
export function edgeAfterRotation(edge: FlipperEdge, delta: Rotation): FlipperEdge {
  return FLIPPER_EDGES[(FLIPPER_EDGES.indexOf(edge) + delta / 90) % FLIPPER_EDGES.length]!;
}

/** Rotation horaire (degrés) qui mène de l'orientation Windows `from` à `to`. */
export function rotationDelta(to: Rotation, from: Rotation): Rotation {
  return ((to - from + 360) % 360) as Rotation;
}

/**
 * Bord du joueur dans l'image actuelle du playfield. Le bord enregistré vaut pour
 * l'orientation que Windows avait à l'enregistrement (`lastSeen`) ; si elle a changé
 * depuis hors de l'assistant (Paramètres > Affichage, pilote, retour de veille),
 * l'image a tourné sous le joueur et son bord avec. Sans orientation relevée à
 * l'enregistrement, le bord enregistré est gardé. undefined sans bord renseigné.
 */
export function currentFlipperEdge(cabinet: Cabinet, display: ObservedDisplay): FlipperEdge | undefined {
  const edge = cabinet.playfield?.flipperEdge;
  if (!edge) return undefined;
  const fp = cabinet.roles.playfield;
  const recorded = cabinet.screens.find((s) => s.fingerprint === fp)?.lastSeen?.rotation;
  return recorded === undefined ? edge : edgeAfterRotation(edge, rotationDelta(display.rotation, recorded));
}

/**
 * Rotation horaire à appliquer aux fenêtres de Cyber Pinball affichées sur le
 * playfield, d'après le bord actuel du joueur. Sans écran observé, le bord
 * enregistré ; sans modèle ni bord renseigné, flippers en bas.
 */
export function playfieldRotation(cabinet: Cabinet | undefined, display: ObservedDisplay | undefined): Rotation {
  const edge = cabinet && display ? currentFlipperEdge(cabinet, display) : cabinet?.playfield?.flipperEdge;
  return edgeRotation(edge ?? 'bottom');
}

/** L'écran tel que Windows le décrira après avoir tourné son orientation de `delta` degrés. */
export function rotatedDisplay(display: ObservedDisplay, delta: Rotation): ObservedDisplay {
  const { width, height } = display.bounds;
  const bounds = delta % 180 === 0 ? display.bounds : { ...display.bounds, width: height, height: width };
  return { ...display, bounds, rotation: ((display.rotation + delta) % 360) as Rotation };
}

export interface SizeCm {
  width: number;
  height: number;
}

/** Taille de l'image vue du joueur : largeur et hauteur échangées quand il se tient sur un côté. */
export function playerView(display: ObservedDisplay, edge: FlipperEdge): { width: number; height: number } {
  const { width, height } = display.bounds;
  return edge === 'left' || edge === 'right' ? { width: height, height: width } : { width, height };
}

/** Vue borne : l'image est plus haute que large pour le joueur, comme un vrai plateau. */
export function isCabinetView(display: ObservedDisplay, edge: FlipperEdge): boolean {
  const view = playerView(display, edge);
  return view.height > view.width;
}

/**
 * Taille fournie par l'EDID, si elle est plausible. Les projecteurs donnent
 * souvent 0, certains téléviseurs une taille fantaisiste : on la refuse quand
 * ses proportions ne collent pas à la définition en pixels ou qu'elle sort des
 * tailles d'écran courantes.
 */
export function edidSize(edid: EdidInfo | undefined, display: ObservedDisplay): SizeCm | undefined {
  if (!edid) return undefined;
  const fromMm = edid.imageMm && { width: edid.imageMm.width / 10, height: edid.imageMm.height / 10 };
  return plausible(fromMm, display) ?? plausible({ width: edid.widthCm, height: edid.heightCm }, display);
}

function plausible(raw: SizeCm | undefined, display: ObservedDisplay): SizeCm | undefined {
  if (!raw || raw.width <= 0 || raw.height <= 0) return undefined;
  const size = landscape(raw);
  const px = landscape(display.bounds);
  const ratioGap = Math.abs(size.width / size.height / (px.width / px.height) - 1);
  const diagonal = diagonalInches(size);
  if (ratioGap > 0.1 || diagonal < 10 || diagonal > 110) return undefined;
  return size;
}

/** Taille retenue pour le playfield : saisie dans l'assistant, sinon EDID plausible. */
export function playfieldSize(cabinet: Cabinet, display: ObservedDisplay): SizeCm | undefined {
  const manual = cabinet.playfield?.manualSizeCm;
  return manual ? landscape(manual) : edidSize(display.edid, display);
}

export function diagonalInches(size: SizeCm): number {
  return Math.hypot(size.width, size.height) / CM_PER_INCH;
}

/** Taille d'une image de cette diagonale, aux proportions de la définition de l'écran. */
export function sizeFromDiagonal(inches: number, display: ObservedDisplay): SizeCm {
  const px = landscape(display.bounds);
  const diagonalPx = Math.hypot(px.width, px.height);
  const cm = inches * CM_PER_INCH;
  return { width: round2((cm * px.width) / diagonalPx), height: round2((cm * px.height) / diagonalPx) };
}

/** VPX attend la largeur comme le côté le plus long (Settings_properties.inl). */
function landscape(size: { width: number; height: number }): SizeCm {
  return size.width >= size.height ? { width: size.width, height: size.height } : { width: size.height, height: size.width };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Écran où lire une page à la souris (fenêtre « Récupérer » d'un site) parmi ceux du menu :
 * le playfield si son image n'est pas tournée (bureau, ou borne dont Windows suit l'écran) ;
 * sinon le plus grand des autres, le fronton d'abord à taille égale, debout face au joueur.
 * Sur le playfield tourné, la page serait de travers et la souris irait à angle droit de sa
 * main. undefined : aucun écran (l'écran principal de Windows reste le repli).
 */
export function readingScreen<B extends { width: number; height: number }>(screens: { role: string; bounds: B }[], playfieldRotation: Rotation): B | undefined {
  const playfield = screens.find((s) => s.role === 'playfield');
  if (playfield && playfieldRotation === 0) return playfield.bounds;
  const area = (b: B) => b.width * b.height;
  const others = screens.filter((s) => s.role !== 'playfield').sort((a, b) => area(b.bounds) - area(a.bounds) || Number(b.role === 'backglass') - Number(a.role === 'backglass'));
  return others[0]?.bounds ?? playfield?.bounds;
}
