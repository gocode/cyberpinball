// Zones des rôles : plusieurs rôles sur un même écran physique (backglass et DMD
// sur le moniteur du fronton), un rôle incrusté dans l'image du playfield, ou le
// playfield lui-même sur une partie de son écran (poste de bureau : la table d'un
// côté, le backglass de l'autre).
//
// VPX 10.8.1 le fait sans outil tiers (src/renderer/Window.cpp, Renderer.cpp) :
// - fenêtre « Windowed » : [Fenêtre] <Préfixe>WndX, WndY, Width, Height, relatifs à
//   l'écran choisi ; toutes ses fenêtres sont sans bordure (SDL_WINDOW_BORDERLESS) ;
// - « Embedded in playfield » (<Préfixe>Output = 2) : la fenêtre annexe est dessinée
//   dans l'image du playfield, au rectangle WndX, WndY, Width, Height de cette image,
//   sans rotation (RenderOutput::SetMode, Renderer::SetupAncillaryRenderTarget).
//
// Ordre de superposition : VPX n'a aucun réglage. Les incrustations sont dessinées
// dans l'ordre backglass, DMD, topper (Renderer.cpp), donc le topper par-dessus ;
// deux fenêtres qui se chevauchent sont empilées par Windows. Les zones se placent
// donc côte à côte, et un chevauchement est signalé.

import { formatNumber, t, tn } from './i18n';
import { currentFlipperEdge, EDGE_LABELS, type SizeCm } from './layout';
import { ROLES, type AncillaryRoleId, type Cabinet, type FlipperEdge, type ObservedDisplay, type Rect, type RoleId, type ScreenZone } from './model';
import type { SyncFinding } from './sync';

export const ANCILLARY_ROLES: readonly AncillaryRoleId[] = ['backglass', 'dmd', 'topper'];

export const FULL_ZONE: ScreenZone = { x: 0, y: 0, width: 1, height: 1 };

/** Ordre de dessin des incrustations dans VPX, du dessous vers le dessus. */
export const EMBEDDED_ORDER: readonly AncillaryRoleId[] = ['backglass', 'dmd', 'topper'];

/** Façon dont VPX affiche un rôle. */
export type ZonePlacement =
  /** Tout un écran à lui : fenêtre plein écran sans bordure. */
  | 'screen'
  /** Une partie d'un écran : fenêtre « Windowed » posée sur la zone. */
  | 'window'
  /** Dans la zone du playfield, sur son écran : incrustée dans son image. */
  | 'embedded';

type Size = { width: number; height: number };
type Zones = Partial<Record<RoleId, ScreenZone>>;

/** Zone utilisable : dans l'image et de taille non nulle. */
export function isValidZone(zone: ScreenZone): boolean {
  const values = [zone.x, zone.y, zone.width, zone.height];
  if (!values.every((v) => Number.isFinite(v))) return false;
  if (zone.aspect !== undefined && !(Number.isFinite(zone.aspect) && zone.aspect > 0)) return false;
  return zone.x >= 0 && zone.y >= 0 && zone.width > 0 && zone.height > 0 && zone.x + zone.width <= 1 + 1e-9 && zone.y + zone.height <= 1 + 1e-9;
}

export function isFullZone(zone: ScreenZone): boolean {
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
  return near(zone.x, 0) && near(zone.y, 0) && near(zone.width, 1) && near(zone.height, 1);
}

/** Même rectangle, aux arrondis près (une zone relue dans VPinballX.ini vient de pixels entiers). */
export function sameZone(a: ScreenZone, b: ScreenZone): boolean {
  const near = (u: number, v: number) => Math.abs(u - v) < 1e-3;
  return near(a.x, b.x) && near(a.y, b.y) && near(a.width, b.width) && near(a.height, b.height);
}

/** Zone enregistrée d'un rôle ; l'écran entier quand elle est absente ou invalide. */
export function roleZone(cabinet: Cabinet, role: RoleId): ScreenZone {
  const zone = cabinet.zones?.[role];
  return zone && isValidZone(zone) ? zone : FULL_ZONE;
}

/** Zones de tous les rôles (écran entier par défaut), à passer au générateur. */
export function cabinetZones(cabinet: Cabinet): Record<RoleId, ScreenZone> {
  return Object.fromEntries(ROLES.map((r) => [r.id, roleZone(cabinet, r.id)])) as Record<RoleId, ScreenZone>;
}

/**
 * Rectangle de la zone en pixels, relatif au coin de l'écran. Les bords sont
 * arrondis, pas les tailles : deux zones jointives le restent au pixel près.
 */
export function zoneRect(zone: ScreenZone, size: Size): Rect {
  const left = Math.round(zone.x * size.width);
  const top = Math.round(zone.y * size.height);
  const right = Math.round((zone.x + zone.width) * size.width);
  const bottom = Math.round((zone.y + zone.height) * size.height);
  return { x: left, y: top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
}

export function sameDisplay(a: ObservedDisplay | undefined, b: ObservedDisplay | undefined): boolean {
  return Boolean(a && b && (a.devicePath && b.devicePath ? a.devicePath === b.devicePath : a.gdiName === b.gdiName));
}

function contains(outer: ScreenZone, inner: ScreenZone): boolean {
  const eps = 1e-6;
  return inner.x >= outer.x - eps && inner.y >= outer.y - eps && inner.x + inner.width <= outer.x + outer.width + eps && inner.y + inner.height <= outer.y + outer.height + eps;
}

/**
 * Le playfield : plein écran, ou fenêtre sur sa zone. Un rôle annexe sur l'écran du
 * playfield et dans sa zone est incrusté dans son image ; à côté (poste de bureau,
 * playfield réduit), c'est une fenêtre à part. Ailleurs : plein écran ou fenêtre.
 */
export function zonePlacement(role: RoleId, assignments: Partial<Record<RoleId, ObservedDisplay>>, zones: Zones): ZonePlacement {
  const zone = zones[role] ?? FULL_ZONE;
  if (role !== 'playfield' && sameDisplay(assignments[role], assignments.playfield) && contains(zones.playfield ?? FULL_ZONE, zone)) return 'embedded';
  return isFullZone(zone) ? 'screen' : 'window';
}

/**
 * Rectangle que VPX attend pour le rôle : relatif à l'écran pour une fenêtre, à
 * l'image du playfield pour une incrustation.
 */
export function vpxRect(role: RoleId, assignments: Partial<Record<RoleId, ObservedDisplay>>, zones: Zones): Rect | undefined {
  const display = assignments[role];
  if (!display) return undefined;
  const rect = zoneRect(zones[role] ?? FULL_ZONE, display.bounds);
  if (zonePlacement(role, assignments, zones) !== 'embedded') return rect;
  const host = zoneRect(zones.playfield ?? FULL_ZONE, display.bounds);
  return { x: rect.x - host.x, y: rect.y - host.y, width: rect.width, height: rect.height };
}

/**
 * L'écran du playfield réduit à sa zone : la forme de la fenêtre que VPX ouvrira.
 * Le cadrage des tables (vue borne ou bureau, rotation automatique) en dépend.
 */
export function zoneDisplay(display: ObservedDisplay, zone: ScreenZone | undefined): ObservedDisplay {
  if (!zone || isFullZone(zone)) return display;
  const r = zoneRect(zone, display.bounds);
  return { ...display, bounds: { x: display.bounds.x + r.x, y: display.bounds.y + r.y, width: r.width, height: r.height } };
}

/** Taille réelle de la zone, à partir de celle de l'écran (grand côté en largeur, comme VPX). */
export function zoneSizeCm(size: SizeCm, display: ObservedDisplay, zone: ScreenZone | undefined): SizeCm {
  if (!zone || isFullZone(zone)) return size;
  // size est rangé grand côté d'abord ; on le remet dans le sens de l'image Windows.
  const landscape = display.bounds.width >= display.bounds.height;
  const imageW = landscape ? size.width : size.height;
  const imageH = landscape ? size.height : size.width;
  const w = Math.round(imageW * zone.width * 100) / 100;
  const h = Math.round(imageH * zone.height * 100) / 100;
  return w >= h ? { width: w, height: h } : { width: h, height: w };
}

/** Un écran physique de la borne et les rôles qu'il affiche. */
export interface ScreenSurface {
  /** Rôle qui nomme la fenêtre du menu : le playfield, sinon le premier rôle de l'écran (ordre de ROLES). */
  role: RoleId;
  display: ObservedDisplay;
  /** Zone du playfield quand il est sur cet écran. */
  playfield?: ScreenZone;
  /** Rôles annexes dessinés sur cet écran, chacun dans sa zone (dans le playfield : les incrustations). */
  parts: { role: AncillaryRoleId; zone: ScreenZone }[];
}

/**
 * Écrans à couvrir par le menu : une fenêtre par écran physique, pas par rôle.
 * Deux fenêtres posées sur un même écran se disputeraient le plein écran (celui
 * qui couvre la barre des tâches de Windows) ; une seule, découpée en zones, non.
 */
export function screenSurfaces(assignments: Partial<Record<RoleId, ObservedDisplay>>, zones: Zones = {}): ScreenSurface[] {
  const surfaces: ScreenSurface[] = [];
  for (const { id } of ROLES) {
    const display = assignments[id];
    if (!display) continue;
    let surface = surfaces.find((s) => sameDisplay(s.display, display));
    if (!surface) {
      surface = { role: id, display, parts: [] };
      surfaces.push(surface);
    }
    if (id === 'playfield') surface.playfield = zones.playfield ?? FULL_ZONE;
    else surface.parts.push({ role: id, zone: zones[id] ?? FULL_ZONE });
  }
  return surfaces;
}

/** Proportions lisibles : « 16:9 », « 9:16 », « 4:1 », sinon « 2,35:1 ». */
export function ratioLabel(widthOverHeight: number): string {
  const portrait = widthOverHeight < 1;
  const r = portrait ? 1 / widthOverHeight : widthOverHeight;
  const known: [number, number][] = [[1, 1], [5, 4], [4, 3], [3, 2], [16, 10], [16, 9], [2, 1], [21, 9], [3, 1], [4, 1]];
  const near = known.find(([w, h]) => Math.abs(Math.log(r / (w / h))) < 0.02);
  if (near) return portrait ? `${near[1]}:${near[0]}` : `${near[0]}:${near[1]}`;
  const value = formatNumber(r, { maximumFractionDigits: 2 });
  return portrait ? `1:${value}` : `${value}:1`;
}

/** Grand côté sur petit côté de la zone, en pixels de son écran. */
export function zoneRatio(zone: ScreenZone, size: Size): number | undefined {
  const w = zone.width * size.width;
  const h = zone.height * size.height;
  if (!(w > 0 && h > 0)) return undefined;
  return Math.max(w, h) / Math.min(w, h);
}

// ---------------------------------------------------------------------------
// Édition : toutes les opérations travaillent en pixels de l'écran, rendent une
// zone valide (dans l'écran, au moins MIN_PX de côté) et conservent le format
// verrouillé (`aspect`, largeur sur hauteur en pixels) quand il y en a un.

/** Plus petit côté d'une zone, en pixels. */
export const MIN_PX = 16;

/** Formats proposés ; « Libre » n'en impose aucun. */
export const ZONE_FORMATS: readonly { label: string; aspect?: number }[] = [
  { get label() { return t('Libre'); } },
  { label: '16:9', aspect: 16 / 9 },
  { label: '16:10', aspect: 16 / 10 },
  { label: '4:3', aspect: 4 / 3 },
  { label: '5:4', aspect: 5 / 4 },
  { label: '21:9', aspect: 21 / 9 },
  { label: '4:1 (DMD)', aspect: 4 },
  { label: '9:16', aspect: 9 / 16 },
  { label: '3:4', aspect: 3 / 4 },
];

/** Nom du format verrouillé : « 16:9 », ou « 1,85:1 » pour un format hors liste. */
export function formatLabel(aspect: number | undefined): string {
  if (aspect === undefined) return t('Libre');
  const known = ZONE_FORMATS.find((f) => f.aspect !== undefined && Math.abs(f.aspect - aspect) < 1e-3);
  return known?.label ?? `${formatNumber(Math.round(aspect * 100) / 100)}:1`;
}

interface PxRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function toPx(zone: ScreenZone, size: Size): PxRect {
  return { x: zone.x * size.width, y: zone.y * size.height, w: zone.width * size.width, h: zone.height * size.height };
}

/** Pixels entiers, ramenés dans l'écran ; le format verrouillé est gardé en réduisant les deux côtés. */
function fromPx(r: PxRect, size: Size, aspect: number | undefined): ScreenZone {
  let { w, h } = r;
  if (aspect) h = w / aspect;
  const scale = Math.min(1, size.width / w, size.height / h);
  w *= scale;
  h *= scale;
  const min = Math.min(MIN_PX, size.width, size.height);
  if (w < min || h < min) {
    const grow = Math.max(min / w, min / h);
    w = Math.min(size.width, w * grow);
    h = Math.min(size.height, h * grow);
  }
  w = Math.round(w);
  h = Math.round(h);
  const x = Math.round(Math.min(Math.max(0, r.x), size.width - w));
  const y = Math.round(Math.min(Math.max(0, r.y), size.height - h));
  return { x: x / size.width, y: y / size.height, width: w / size.width, height: h / size.height, ...(aspect && { aspect }) };
}

const center = (r: PxRect) => ({ cx: r.x + r.w / 2, cy: r.y + r.h / 2 });

/** Déplace de dx, dy pixels, sans sortir de l'écran. */
export function moveZone(zone: ScreenZone, size: Size, dx: number, dy: number): ScreenZone {
  const r = toPx(zone, size);
  return fromPx({ ...r, x: r.x + dx, y: r.y + dy }, size, zone.aspect);
}

/**
 * Agrandit ou réduit de `delta` pixels selon un axe, autour du centre. Avec un
 * format verrouillé, l'autre côté suit ; sans, seul cet axe change.
 */
export function resizeZone(zone: ScreenZone, size: Size, axis: 'width' | 'height', delta: number): ScreenZone {
  const r = toPx(zone, size);
  const { cx, cy } = center(r);
  let { w, h } = r;
  if (axis === 'width') w = Math.max(1, w + delta);
  else h = Math.max(1, h + delta);
  if (zone.aspect) {
    if (axis === 'height') w = h * zone.aspect;
    h = w / zone.aspect;
  }
  return fromPx({ x: cx - w / 2, y: cy - h / 2, w, h }, size, zone.aspect);
}

/**
 * Taille précise en pixels, centre gardé. Avec un format verrouillé, la largeur
 * décide (la hauteur en découle) ; une hauteur seule fixe la largeur.
 */
export function setZoneSize(zone: ScreenZone, size: Size, width: number | undefined, height: number | undefined): ScreenZone {
  const r = toPx(zone, size);
  const { cx, cy } = center(r);
  let w = width ?? r.w;
  let h = height ?? r.h;
  if (zone.aspect) {
    if (width === undefined && height !== undefined) w = h * zone.aspect;
    h = w / zone.aspect;
  }
  return fromPx({ x: cx - w / 2, y: cy - h / 2, w, h }, size, zone.aspect);
}

/**
 * Rectangle tiré à la souris (pixels de l'écran). Avec un format verrouillé, le
 * côté le plus tiré décide et le coin opposé à `anchor` reste en place.
 */
export function dragZone(zone: ScreenZone, size: Size, rect: { x: number; y: number; width: number; height: number }, anchor: 'move' | 'nw' | 'ne' | 'sw' | 'se'): ScreenZone {
  if (anchor === 'move') return fromPx({ x: rect.x, y: rect.y, w: rect.width, h: rect.height }, size, zone.aspect);
  let w = Math.max(1, rect.width);
  let h = Math.max(1, rect.height);
  if (zone.aspect) {
    if (w / h > zone.aspect) h = w / zone.aspect;
    else w = h * zone.aspect;
  }
  // Coin fixe : celui opposé à la poignée tirée.
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;
  const x = anchor === 'nw' || anchor === 'sw' ? right - w : rect.x;
  const y = anchor === 'nw' || anchor === 'ne' ? bottom - h : rect.y;
  return fromPx({ x, y, w, h }, size, zone.aspect);
}

/**
 * Verrouille un format (ou le libère : undefined). Le centre est gardé, la
 * largeur aussi tant que la hauteur tient dans l'écran.
 */
export function setZoneAspect(zone: ScreenZone, size: Size, aspect: number | undefined): ScreenZone {
  const r = toPx(zone, size);
  if (!aspect) return fromPx(r, size, undefined);
  const { cx, cy } = center(r);
  let w = r.w;
  let h = w / aspect;
  if (h > size.height) {
    h = size.height;
    w = h * aspect;
  }
  return fromPx({ x: cx - w / 2, y: cy - h / 2, w, h }, size, aspect);
}

/** Plein écran ; avec un format verrouillé, la plus grande zone à ce format, centrée. */
export function maximizeZone(zone: ScreenZone, size: Size): ScreenZone {
  if (!zone.aspect) return { ...FULL_ZONE };
  let w = size.width;
  let h = w / zone.aspect;
  if (h > size.height) {
    h = size.height;
    w = h * zone.aspect;
  }
  return fromPx({ x: (size.width - w) / 2, y: (size.height - h) / 2, w, h }, size, zone.aspect);
}

export type ZoneAlignment = 'top' | 'bottom' | 'left' | 'right' | 'centerX' | 'centerY';

/** Colle la zone à un bord de l'écran, ou la centre sur un axe. */
export function alignZone(zone: ScreenZone, size: Size, where: ZoneAlignment): ScreenZone {
  const r = toPx(zone, size);
  const x = where === 'left' ? 0 : where === 'right' ? size.width - r.w : where === 'centerX' ? (size.width - r.w) / 2 : r.x;
  const y = where === 'top' ? 0 : where === 'bottom' ? size.height - r.h : where === 'centerY' ? (size.height - r.h) / 2 : r.y;
  return fromPx({ ...r, x, y }, size, zone.aspect);
}

export type ZoneSide = 'above' | 'below' | 'left' | 'right';

/**
 * Place la zone contre une autre zone du même écran : au-dessus, en dessous, à
 * gauche ou à droite, centrée sur elle. S'il n'y a pas la place, la zone est
 * réduite (format gardé) ; undefined s'il ne reste pas MIN_PX.
 */
export function placeBeside(zone: ScreenZone, other: ScreenZone, size: Size, side: ZoneSide): ScreenZone | undefined {
  const r = toPx(zone, size);
  const o = toPx(other, size);
  const room = side === 'above' ? o.y : side === 'below' ? size.height - (o.y + o.h) : side === 'left' ? o.x : size.width - (o.x + o.w);
  if (room < MIN_PX) return undefined;
  let { w, h } = r;
  if (zone.aspect) h = w / zone.aspect;
  const vertical = side === 'above' || side === 'below';
  const limit = vertical ? h : w;
  if (limit > room) {
    const k = room / limit;
    if (zone.aspect) {
      w *= k;
      h *= k;
    } else if (vertical) h = room;
    else w = room;
  }
  const { cx, cy } = center(o);
  const x = vertical ? cx - w / 2 : side === 'left' ? o.x - w : o.x + o.w;
  const y = vertical ? (side === 'above' ? o.y - h : o.y + o.h) : cy - h / 2;
  return fromPx({ x, y, w, h }, size, zone.aspect);
}

/**
 * La zone sur un autre écran : même taille en pixels si elle y tient (sinon
 * réduite, format gardé), même position relative de son centre.
 */
export function moveZoneToScreen(zone: ScreenZone, from: Size, to: Size): ScreenZone {
  if (isFullZone(zone) && !zone.aspect) return { ...FULL_ZONE };
  const r = toPx(zone, from);
  const { cx, cy } = center(r);
  const k = Math.min(1, to.width / r.w, to.height / r.h);
  const w = r.w * k;
  const h = r.h * k;
  return fromPx({ x: (cx / from.width) * to.width - w / 2, y: (cy / from.height) * to.height - h / 2, w, h }, to, zone.aspect);
}

/** Distance, en pixels de l'écran, à partir de laquelle un bord tiré à la souris est aimanté. */
export const SNAP_PX = 12;

/**
 * Aimantation d'un rectangle tiré à la souris (pixels de l'écran) : les bords qui
 * bougent se collent, à SNAP_PX près, aux bords et au milieu de l'écran et aux bords
 * des autres zones du même écran. `handle` dit quels bords bougent : tous pour un
 * déplacement (la taille ne change pas), ceux du coin tiré sinon.
 */
export function snapRect(
  rect: { x: number; y: number; width: number; height: number },
  size: Size,
  others: readonly ScreenZone[],
  handle: 'move' | 'nw' | 'ne' | 'sw' | 'se',
  threshold = SNAP_PX,
): { x: number; y: number; width: number; height: number } {
  const xs = [0, size.width / 2, size.width];
  const ys = [0, size.height / 2, size.height];
  for (const o of others) {
    const p = toPx(o, size);
    xs.push(p.x, p.x + p.w);
    ys.push(p.y, p.y + p.h);
  }
  // Écart le plus court entre l'un des bords donnés et une cible, s'il est sous le seuil.
  const pull = (edges: number[], targets: number[]) => {
    let best = 0;
    let dist = threshold + 1;
    for (const e of edges) {
      for (const t of targets) {
        if (Math.abs(t - e) < dist) {
          dist = Math.abs(t - e);
          best = t - e;
        }
      }
    }
    return dist <= threshold ? best : 0;
  };
  let { x, y, width, height } = rect;
  if (handle === 'move') {
    x += pull([x, x + width / 2, x + width], xs);
    y += pull([y, y + height / 2, y + height], ys);
    return { x, y, width, height };
  }
  const west = handle === 'nw' || handle === 'sw';
  const north = handle === 'nw' || handle === 'ne';
  const dx = pull([west ? x : x + width], xs);
  const dy = pull([north ? y : y + height], ys);
  if (west) {
    x += dx;
    width -= dx;
  } else width += dx;
  if (north) {
    y += dy;
    height -= dy;
  } else height += dy;
  return { x, y, width, height };
}

type Handle = 'move' | 'nw' | 'ne' | 'sw' | 'se';

/** Écran dont les bornes (pixels physiques du bureau) contiennent ce point. */
export function displayAt(displays: readonly { bounds: Rect }[], point: { x: number; y: number }): number | undefined {
  const i = displays.findIndex((d) => point.x >= d.bounds.x && point.x < d.bounds.x + d.bounds.width && point.y >= d.bounds.y && point.y < d.bounds.y + d.bounds.height);
  return i >= 0 ? i : undefined;
}

export interface DragPlan {
  /** Écrans de la borne, bornes en pixels physiques. */
  displays: readonly { bounds: Rect }[];
  role: RoleId;
  /** Écran de la fenêtre qui a reçu le geste : celui où était la zone quand on l'a saisie. */
  origin: number;
  /** Écran et zone du rôle maintenant (déjà passée sur un autre écran pendant ce geste, peut-être). */
  current: number;
  zone: ScreenZone;
  handle: Handle;
  /** Rectangle tiré, en fractions de l'écran de départ. */
  rect: ScreenZone;
  /**
   * Pointeur en fractions de la fenêtre de départ (hors de 0..1 quand il l'a quittée : la
   * fenêtre garde le pointeur jusqu'au relâchement). Ni coordonnées du bureau en DIP ni
   * position de la fenêtre : rien qui dépende de la mise à l'échelle de Windows ou du rendu
   * hors écran.
   */
  pointer?: { x: number; y: number };
  snap: boolean;
  /** Zones des autres rôles d'un écran : cibles de l'aimantation. */
  others: (display: number) => ScreenZone[];
}

/**
 * Où va une zone tirée à la souris. Tant que le pointeur reste sur l'écran de départ,
 * c'est le rectangle tiré qui compte (aimanté si demandé). Déplacée au-dessus d'un autre
 * écran, la zone y passe, même taille en pixels si elle y tient, centrée sur le pointeur ;
 * revenue sur son écran, elle y revient. Un coin tiré ne change jamais d'écran, ni le
 * playfield (c'est l'étape des rôles qui décide de son écran).
 */
export function planDrag(p: DragPlan): { display: number; zone: ScreenZone } {
  const from = p.displays[p.origin]!.bounds;
  const point = p.pointer && { x: from.x + p.pointer.x * from.width, y: from.y + p.pointer.y * from.height };
  const target = p.handle === 'move' && p.role !== 'playfield' && point ? (displayAt(p.displays, point) ?? p.origin) : p.origin;
  const here = (display: number) => (p.current === display ? p.zone : moveZoneToScreen(p.zone, p.displays[p.current]!.bounds, p.displays[display]!.bounds));
  if (target !== p.origin) {
    const to = p.displays[target]!.bounds;
    const zone = here(target);
    const r = zoneRect(zone, to);
    const at = { x: point!.x - to.x - r.width / 2, y: point!.y - to.y - r.height / 2, width: r.width, height: r.height };
    return { display: target, zone: dragZone(zone, to, p.snap ? snapRect(at, to, p.others(target), 'move') : at, 'move') };
  }
  const zone = here(p.origin);
  const raw = { x: p.rect.x * from.width, y: p.rect.y * from.height, width: p.rect.width * from.width, height: p.rect.height * from.height };
  const rect = p.snap ? snapRect(raw, from, p.others(p.origin), p.handle) : raw;
  return { display: p.origin, zone: dragZone(zone, from, rect, p.handle) };
}

/**
 * Partage d'un écran entre backglass (en haut) et DMD (bande du bas, centrée).
 * `dmdRatio` est la forme de la fenêtre DMD : 4 pour un DMD 128×32 seul, 16/9
 * pour un FullDMD avec le DMD incrusté par-dessus. La bande ne prend jamais plus
 * de `maxShare` de la hauteur ; trop étroite, elle se réduit en largeur.
 */
export function splitBackglassDmd(size: Size, dmdRatio = 4, maxShare = 1 / 3): { backglass: ScreenZone; dmd: ScreenZone } {
  let h = size.width / dmdRatio;
  let w = size.width;
  if (h > size.height * maxShare) {
    h = size.height * maxShare;
    w = h * dmdRatio;
  }
  const height = h / size.height;
  const width = w / size.width;
  return {
    backglass: { x: 0, y: 0, width: 1, height: 1 - height },
    dmd: { x: (1 - width) / 2, y: 1 - height, width, height },
  };
}

/**
 * DMD 4:1 incrusté dans le playfield, au bord opposé aux flippers (le haut de la
 * table, loin du jeu), sur 40 % de la largeur de l'image. VPX ne tourne pas
 * l'incrustation : vue de côté, elle reste couchée (zoneFindings le signale).
 */
export function embeddedDmdZone(size: Size, edge: FlipperEdge = 'bottom'): ScreenZone {
  const margin = 0.02;
  const width = 0.4;
  const height = (width * size.width) / 4 / size.height;
  const x = edge === 'left' ? 1 - margin - width : edge === 'right' ? margin : (1 - width) / 2;
  const y = edge === 'bottom' ? margin : edge === 'top' ? 1 - margin - height : (1 - height) / 2;
  return { x, y, width, height };
}

export function zonesOverlap(a: ScreenZone, b: ScreenZone): boolean {
  const eps = 1e-6;
  return a.x < b.x + b.width - eps && b.x < a.x + a.width - eps && a.y < b.y + b.height - eps && b.y < a.y + a.height - eps;
}

function label(role: RoleId): string {
  return ROLES.find((r) => r.id === role)!.label;
}

/**
 * Ce qui ne va pas dans les zones, pour les écrans réellement branchés :
 * - zone enregistrée invalide (l'écran entier est utilisé à sa place) ;
 * - deux rôles qui se recouvrent sur un même écran (le cas de deux rôles affectés
 *   au même écran sans zone) : l'un cache l'autre, et VPX ne règle pas l'ordre ;
 *   une incrustation dans le playfield n'est pas un recouvrement ;
 * - rôle incrusté sur tout le playfield : la table disparaît derrière ;
 * - rôle incrusté alors que le joueur ne se tient pas au bas de l'image : VPX ne
 *   tourne pas l'incrustation, elle est couchée ou à l'envers pour lui.
 */
export function zoneFindings(cabinet: Cabinet, assignments: Partial<Record<RoleId, ObservedDisplay>>): SyncFinding[] {
  const findings: SyncFinding[] = [];
  const zones = cabinetZones(cabinet);
  const shown = ROLES.map((r) => r.id).filter((r) => assignments[r]);
  const placement = (r: RoleId) => zonePlacement(r, assignments, zones);

  for (const { id: role } of ROLES) {
    const zone = cabinet.zones?.[role];
    if (zone && !isValidZone(zone)) {
      findings.push({
        severity: 'warning',
        message: t("{role} : zone d'écran invalide dans cabinet.json ({zone}). L'écran entier est utilisé ; refaites la disposition des écrans.", { role: label(role), zone: JSON.stringify(zone) }),
      });
    }
  }

  for (let i = 0; i < shown.length; i++) {
    for (let j = i + 1; j < shown.length; j++) {
      const [a, b] = [shown[i]!, shown[j]!];
      if (!sameDisplay(assignments[a], assignments[b]) || !zonesOverlap(zones[a], zones[b])) continue;
      if (a === 'playfield' && placement(b) === 'embedded') continue;
      const screen = assignments[a]!.friendlyName || assignments[a]!.gdiName;
      const both = placement(a) === 'embedded' && placement(b) === 'embedded';
      const front = both
        ? t('VPX dessine le {role} par-dessus', { role: label(EMBEDDED_ORDER.indexOf(b as AncillaryRoleId) > EMBEDDED_ORDER.indexOf(a as AncillaryRoleId) ? b : a) })
        : t("Windows décide lequel passe devant (VPX n'a pas de réglage)");
      // Deux rôles sur un écran sans zone ni l'un ni l'autre : un oubli. Des zones posées qui se
      // chevauchent : peut-être voulu (un DMD sur le bas du backglass), seulement signalé.
      const accidental = !cabinet.zones?.[a] && !cabinet.zones?.[b];
      findings.push({
        severity: accidental ? 'warning' : 'info',
        message: accidental
          ? t("{first} et {second} se recouvrent sur l'écran « {screen} » : {front}. Refaites la disposition des écrans pour leur donner chacun sa zone.", { first: label(a), second: label(b), screen, front })
          : t("{first} et {second} se chevauchent sur l'écran « {screen} » : {front}.", { first: label(a), second: label(b), screen, front }),
      });
    }
  }

  const embedded = shown.filter((r) => r !== 'playfield' && placement(r) === 'embedded') as AncillaryRoleId[];
  for (const role of embedded) {
    if (sameZone(zones[role], zones.playfield)) {
      findings.push({
        severity: 'warning',
        message: t('{role} incrusté sur tout le playfield : la table sera cachée derrière. Refaites la disposition des écrans pour lui donner une zone.', { role: label(role) }),
      });
    }
  }
  const edge = embedded.length && assignments.playfield ? currentFlipperEdge(cabinet, assignments.playfield) : undefined;
  if (edge && edge !== 'bottom') {
    findings.push({
      severity: 'warning',
      message: tn(
        embedded.length,
        "{roles} incrusté dans le playfield, joueur {edge} de l'image : VPX ne tourne pas les incrustations, le joueur les verra {how}.",
        "{roles} incrustés dans le playfield, joueur {edge} de l'image : VPX ne tourne pas les incrustations, le joueur les verra {how}.",
        { roles: embedded.map(label).join(', '), edge: EDGE_LABELS[edge], how: edge === 'top' ? t("à l'envers") : t('couchées') },
      ),
    });
  }
  return findings;
}
