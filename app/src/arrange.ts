// Disposition des écrans : la zone de chaque rôle sur son écran, réglée aux
// boutons de la borne, au clavier ou à la souris. Étape de l'assistant après
// l'affectation des rôles, ou seule (--assistant --disposition) depuis le menu.
//
// Aux boutons : les flippers choisissent une ligne, Start l'ouvre, les flippers
// règlent au pixel près (aperçu immédiat sur l'écran ; maintenus, ils accélèrent),
// Start valide, Exit annule. Au clavier, les flèches déplacent ou redimensionnent
// dans les deux sens et les chiffres donnent une taille ou une position précise. À
// la souris : clic sur une ligne, sur une zone pour la choisir, zone tirée pour la
// déplacer (jusque sur un autre écran), coin tiré pour la redimensionner ; les bords
// s'aimantent à ceux de l'écran et des autres zones (ligne « Aimantation », ou Alt
// maintenu pendant le geste). Rien n'empêche deux zones de se chevaucher.
// Pas de rotation par zone : VPX 10.8.1 n'en a aucun réglage pour ses fenêtres
// annexes (seulement la vue de la table, et la VR).
// Toute la géométrie est dans packages/core/src/zones.ts.

import type { Input } from 'electron';
import {
  EMBEDDED_ORDER,
  FULL_ZONE,
  ROLES,
  ZONE_FORMATS,
  alignZone,
  dragZone,
  formatLabel,
  isFullZone,
  maximizeZone,
  moveZone,
  moveZoneToScreen,
  placeBeside,
  resizeZone,
  sameDisplay,
  setZoneAspect,
  setZoneSize,
  planDrag,
  t,
  zonePlacement,
  zoneRect,
  type ObservedDisplay,
  type RoleId,
  type ScreenZone,
  type ZoneAlignment,
  type ZoneSide,
} from '@cyberpinball/core';

export interface ArrangeKeys {
  previous: string[];
  next: string[];
  confirm: string[];
  exit: string[];
  back: string[];
}

/** Ce que l'éditeur lit et modifie dans l'assistant. */
export interface ArrangeHost {
  displays: ObservedDisplay[];
  /** Rôle -> indice dans displays. */
  assignments: Partial<Record<RoleId, number>>;
  zones: Partial<Record<RoleId, ScreenZone>>;
  keys: ArrangeKeys;
  /** Nom montré d'un rôle, s'il dépend de la borne (FullDMD ou DMD) ; sinon celui de ROLES. */
  roleLabel?: (role: RoleId) => string;
}

type ItemId = 'role' | 'screen' | 'format' | 'full' | 'moveX' | 'moveY' | 'width' | 'height' | 'exact' | 'exactPos' | 'place' | 'align' | 'snap' | 'reset' | 'done';

const ITEMS: readonly { id: ItemId; label: string }[] = [
  { id: 'role', get label() { return t('Zone'); } },
  { id: 'screen', get label() { return t('Écran'); } },
  { id: 'format', get label() { return t('Format conservé'); } },
  { id: 'full', get label() { return t('Plein écran'); } },
  { id: 'moveX', get label() { return t('Position horizontale'); } },
  { id: 'moveY', get label() { return t('Position verticale'); } },
  { id: 'width', get label() { return t('Largeur'); } },
  { id: 'height', get label() { return t('Hauteur'); } },
  { id: 'exact', get label() { return t('Taille précise'); } },
  { id: 'exactPos', get label() { return t('Position précise'); } },
  { id: 'place', get label() { return t('Placer'); } },
  { id: 'align', get label() { return t('Aligner'); } },
  { id: 'snap', get label() { return t('Aimantation'); } },
  { id: 'reset', get label() { return t('Annuler les changements'); } },
  { id: 'done', get label() { return t('Terminer'); } },
];

const ALIGNMENTS: readonly { id: ZoneAlignment; label: string }[] = [
  { id: 'top', get label() { return t('En haut de l’écran'); } },
  { id: 'bottom', get label() { return t('En bas de l’écran'); } },
  { id: 'left', get label() { return t('À gauche de l’écran'); } },
  { id: 'right', get label() { return t('À droite de l’écran'); } },
  { id: 'centerX', get label() { return t('Centrée horizontalement'); } },
  { id: 'centerY', get label() { return t('Centrée verticalement'); } },
];

/** Côtés où placer une zone contre une autre : le choix, et le constat quand la place manque. */
const SIDES: readonly { id: ZoneSide; label: (role: string) => string; noRoom: (role: string) => string }[] = [
  { id: 'above', label: (role) => t('Au-dessus du {role}', { role }), noRoom: (role) => t('Pas la place au-dessus du {role} sur cet écran.', { role }) },
  { id: 'below', label: (role) => t('En dessous du {role}', { role }), noRoom: (role) => t('Pas la place en dessous du {role} sur cet écran.', { role }) },
  { id: 'left', label: (role) => t('À gauche du {role}', { role }), noRoom: (role) => t('Pas la place à gauche du {role} sur cet écran.', { role }) },
  { id: 'right', label: (role) => t('À droite du {role}', { role }), noRoom: (role) => t('Pas la place à droite du {role} sur cet écran.', { role }) },
];

/** Pas d'un réglage aux boutons : le pixel ; un bouton maintenu accélère jusqu'à MAX_STEP. */
const STEP = 1;
const MAX_STEP = 64;

/** Pas suivant pendant un appui maintenu (répétition du clavier ou de l'encodeur). */
const nextStep = (step: number, repeat: boolean) => (repeat ? Math.min(MAX_STEP, Math.max(step + 1, Math.round(step * 1.3))) : STEP);

type Mode = 'choice' | 'adjust' | 'type';

export interface ArrangeState {
  role: RoleId;
  item: number;
  mode?: Mode;
  /** Choix en cours (mode « choice »), dans la liste de la ligne ouverte. */
  choice: number;
  /** Taille ou position précise en cours de saisie (mode « type ») : largeur puis hauteur, ou X puis Y. */
  typed: string;
  typedWidth?: number;
  typing: 'size' | 'position';
  /** Aimantation des bords tirés à la souris. */
  snap: boolean;
  /** Geste de la souris en cours : le rôle saisi et l'écran où il était (celui de la fenêtre du geste). */
  grab?: { role: RoleId; display: number };
  /** Pas courant (mode « adjust »). */
  step: number;
  /** Rôle tel qu'à l'ouverture de la ligne : Exit y revient. */
  undo?: { role: RoleId; display: number | undefined; zone: ScreenZone | undefined };
  /** Disposition à l'ouverture de l'éditeur : « Annuler les changements ». */
  entry: { assignments: Partial<Record<RoleId, number>>; zones: Partial<Record<RoleId, ScreenZone>> };
  notice?: string;
  /** Dernier libellé de bouton « Terminer » (« Enregistrer » en disposition seule). */
  doneLabel: string;
}

export type ArrangeOutcome = 'handled' | 'unhandled' | 'done' | 'back';

/** Action de la souris, envoyée par screen.js. */
export type ArrangeAction =
  | { type: 'arrange'; op: 'item'; index: number }
  | { type: 'arrange'; op: 'step'; delta: number }
  | { type: 'arrange'; op: 'confirm' | 'cancel' }
  | { type: 'arrange'; op: 'select'; role: RoleId }
  | {
      type: 'arrange';
      op: 'drag';
      role: RoleId;
      handle: 'move' | 'nw' | 'ne' | 'sw' | 'se';
      /** Rectangle tiré, en fractions de l'écran où le geste a commencé. */
      rect: ScreenZone;
      /** Pointeur en fractions de la fenêtre du geste, hors de 0..1 s'il l'a quittée : une zone tirée hors de son écran passe sur l'écran visé. */
      pointer?: { x: number; y: number };
      /** Alt maintenu : pas d'aimantation pour ce geste. */
      free?: boolean;
      end?: boolean;
    };

/**
 * `doneLabel` : libellé de la dernière ligne, « Terminer » sans lui (au fil de l'assistant).
 * `start` : le rôle à régler d'abord et la ligne de départ. Par défaut « Terminer »,
 * pour qu'un Start garde la disposition telle quelle au fil de l'assistant ; depuis
 * le menu, plutôt la ligne « Zone » sur le rôle à placer.
 */
export function startArrange(host: ArrangeHost, doneLabel?: string, start: { role?: RoleId; item?: 'role' | 'done' } = {}): ArrangeState {
  const role = start.role ?? ROLES.find((r) => host.assignments[r.id] !== undefined)?.id ?? 'playfield';
  return {
    role,
    // Dans l'assistant (sans libellé), « Terminer » ; seule (« Enregistrer », depuis le menu), la ligne « Zone ».
    item: ITEMS.findIndex((it) => it.id === (start.item ?? (doneLabel === undefined ? 'done' : 'role'))),
    choice: 0,
    typed: '',
    typing: 'size',
    snap: true,
    step: STEP,
    entry: { assignments: { ...host.assignments }, zones: structuredClone(host.zones) },
    doneLabel: doneLabel ?? t('Terminer'),
  };
}

/** Nom du rôle sur cette borne : « FullDMD » pour le DMD d'un écran FullDMD (ArrangeHost.roleLabel). */
const labelOf = (host: ArrangeHost, role: RoleId) => host.roleLabel?.(role) ?? ROLES.find((r) => r.id === role)!.label;
const screenLabel = (d: ObservedDisplay, i: number) => `${i + 1} · ${d.friendlyName || d.monitorDescription || d.gdiName} (${d.bounds.width} × ${d.bounds.height})`;
const assignedRoles = (host: ArrangeHost) => ROLES.map((r) => r.id).filter((r) => host.assignments[r] !== undefined);
const displayOf = (host: ArrangeHost, role: RoleId) => {
  const i = host.assignments[role];
  return i === undefined ? undefined : host.displays[i];
};
const sizeOf = (host: ArrangeHost, role: RoleId) => displayOf(host, role)!.bounds;
const zoneOf = (host: ArrangeHost, role: RoleId) => host.zones[role] ?? FULL_ZONE;

function setZone(host: ArrangeHost, role: RoleId, zone: ScreenZone): void {
  // Écran entier sans format : rien à enregistrer, comme avant les zones.
  if (isFullZone(zone) && !zone.aspect) delete host.zones[role];
  else host.zones[role] = zone;
}

function observed(host: ArrangeHost): Partial<Record<RoleId, ObservedDisplay>> {
  const out: Partial<Record<RoleId, ObservedDisplay>> = {};
  for (const r of assignedRoles(host)) out[r] = displayOf(host, r)!;
  return out;
}

/** Rôles qui partagent l'écran du rôle choisi. */
function neighbours(host: ArrangeHost, role: RoleId): RoleId[] {
  const display = displayOf(host, role);
  return assignedRoles(host).filter((r) => r !== role && sameDisplay(displayOf(host, r), display));
}

interface Choice {
  label: string;
  apply: (host: ArrangeHost, s: ArrangeState) => string | undefined;
}

/** Valeurs proposées par une ligne à choix ; chacune s'applique depuis l'état d'ouverture (undo). */
function choicesFor(host: ArrangeHost, s: ArrangeState, item: ItemId): Choice[] {
  const base = () => s.undo?.zone ?? zoneOf(host, s.role);
  switch (item) {
    case 'role':
      return ROLES.map((r) => ({ label: labelOf(host, r.id), apply: (_h, st) => void (st.role = r.id) }));
    case 'screen': {
      // Un rôle annexe peut n'avoir aucun écran (borne sans topper, par exemple).
      const none: Choice = {
        label: t('Aucun écran'),
        apply: (h, st) => {
          delete h.assignments[st.role];
          delete h.zones[st.role];
          return undefined;
        },
      };
      const screens = host.displays.map((d, i) => ({
        label: screenLabel(d, i),
        apply: (h: ArrangeHost, st: ArrangeState) => {
          const from = st.undo!.display;
          h.assignments[st.role] = i;
          if (from === i) setZone(h, st.role, base());
          else if (from !== undefined) setZone(h, st.role, moveZoneToScreen(base(), h.displays[from]!.bounds, d.bounds));
          // Nouveau venu sur un écran déjà pris : une zone au centre, pour ne pas tout recouvrir.
          else setZone(h, st.role, neighbours(h, st.role).length ? { x: 0.25, y: 0.25, width: 0.5, height: 0.5 } : FULL_ZONE);
          return undefined;
        },
      }));
      return [none, ...screens];
    }
    case 'format':
      return ZONE_FORMATS.map((f) => ({ label: f.label, apply: (h, st) => void setZone(h, st.role, setZoneAspect(base(), sizeOf(h, st.role), f.aspect)) }));
    case 'align':
      return ALIGNMENTS.map((a) => ({ label: a.label, apply: (h, st) => void setZone(h, st.role, alignZone(base(), sizeOf(h, st.role), a.id)) }));
    case 'place':
      return neighbours(host, s.role).flatMap((other) =>
        SIDES.map((side) => ({
          label: side.label(labelOf(host, other)),
          apply: (h: ArrangeHost, st: ArrangeState) => {
            const placed = placeBeside(base(), zoneOf(h, other), sizeOf(h, st.role), side.id);
            setZone(h, st.role, placed ?? base());
            return placed ? undefined : side.noRoom(labelOf(host, other));
          },
        })),
      );
    default:
      return [];
  }
}

/** Valeur affichée en face de chaque ligne. */
function valueOf(host: ArrangeHost, s: ArrangeState, item: ItemId): string {
  const display = displayOf(host, s.role);
  if (!display) return item === 'role' ? labelOf(host, s.role) : item === 'screen' ? t('aucun écran') : '';
  const zone = zoneOf(host, s.role);
  const r = zoneRect(zone, display.bounds);
  switch (item) {
    case 'role':
      return labelOf(host, s.role);
    case 'screen':
      return screenLabel(display, host.assignments[s.role]!);
    case 'format':
      return formatLabel(zone.aspect);
    case 'full':
      return isFullZone(zone) ? t('oui') : '';
    case 'moveX':
      return `${r.x} px`;
    case 'moveY':
      return `${r.y} px`;
    case 'width':
      return `${r.width} px`;
    case 'height':
      return `${r.height} px`;
    case 'exact':
      return `${r.width} × ${r.height}`;
    case 'exactPos':
      return `${r.x}, ${r.y}`;
    default:
      return '';
  }
}

function itemDisabled(host: ArrangeHost, s: ArrangeState, item: ItemId): string | undefined {
  if (item === 'snap') return undefined;
  if (item === 'screen' && s.role === 'playfield') return t("Le playfield change d'écran à l'étape des rôles.");
  if (!displayOf(host, s.role) && !['role', 'screen', 'reset', 'done'].includes(item)) return t("Le {role} n'a pas d'écran : choisissez-en un à la ligne « Écran ».", { role: labelOf(host, s.role) });
  if (item === 'place' && neighbours(host, s.role).length === 0) return t("Aucun autre rôle sur l'écran du {role}.", { role: labelOf(host, s.role) });
  return undefined;
}

function open(host: ArrangeHost, s: ArrangeState): ArrangeOutcome {
  const id = ITEMS[s.item]!.id;
  s.notice = itemDisabled(host, s, id);
  if (s.notice) return 'handled';
  s.undo = { role: s.role, display: host.assignments[s.role], zone: host.zones[s.role] };
  switch (id) {
    case 'full': {
      const zone = zoneOf(host, s.role);
      setZone(host, s.role, maximizeZone(zone, sizeOf(host, s.role)));
      s.notice = zone.aspect ? t("Plus grande zone au format {format} ; format « Libre » pour tout l'écran.", { format: formatLabel(zone.aspect) }) : undefined;
      s.undo = undefined;
      return 'handled';
    }
    case 'snap':
      s.snap = !s.snap;
      s.undo = undefined;
      s.notice = s.snap ? t('Aimantation : les bords tirés à la souris se collent à ceux de l’écran et des autres zones.') : t('Aimantation coupée : la souris place les zones au pixel près.');
      return 'handled';
    case 'reset':
      for (const k of Object.keys(host.assignments) as RoleId[]) delete host.assignments[k];
      Object.assign(host.assignments, s.entry.assignments);
      for (const k of Object.keys(host.zones) as RoleId[]) delete host.zones[k];
      Object.assign(host.zones, structuredClone(s.entry.zones));
      s.undo = undefined;
      s.notice = t('Disposition remise comme à l’ouverture.');
      return 'handled';
    case 'done':
      s.undo = undefined;
      return 'done';
    case 'moveX':
    case 'moveY':
    case 'width':
    case 'height':
      s.mode = 'adjust';
      s.step = STEP;
      return 'handled';
    case 'exact':
    case 'exactPos':
      s.mode = 'type';
      s.typing = id === 'exact' ? 'size' : 'position';
      s.typed = '';
      s.typedWidth = undefined;
      return 'handled';
    default: {
      const choices = choicesFor(host, s, id);
      s.mode = 'choice';
      // Choix de départ : la valeur actuelle quand on la reconnaît.
      const current = valueOf(host, s, id);
      const assigned = host.assignments[s.role];
      const at = id === 'screen' ? (assigned === undefined ? 0 : assigned + 1) : choices.findIndex((c) => c.label === current);
      s.choice = Math.max(0, at);
      return 'handled';
    }
  }
}

function close(s: ArrangeState): void {
  s.mode = undefined;
  s.undo = undefined;
}

function cancel(host: ArrangeHost, s: ArrangeState): void {
  const u = s.undo;
  if (u) {
    s.role = u.role;
    if (u.display === undefined) delete host.assignments[u.role];
    else host.assignments[u.role] = u.display;
    if (u.zone) host.zones[u.role] = u.zone;
    else delete host.zones[u.role];
  }
  close(s);
}

function stepChoice(host: ArrangeHost, s: ArrangeState, delta: number): void {
  const choices = choicesFor(host, s, ITEMS[s.item]!.id);
  if (!choices.length) return;
  s.choice = (s.choice + delta + choices.length) % choices.length;
  s.notice = choices[s.choice]!.apply(host, s);
}

/** Un cran de réglage : position ou taille, dans le sens demandé. */
function adjust(host: ArrangeHost, s: ArrangeState, axis: 'x' | 'y' | 'width' | 'height', delta: number): void {
  const size = sizeOf(host, s.role);
  const zone = zoneOf(host, s.role);
  if (axis === 'x' || axis === 'y') setZone(host, s.role, moveZone(zone, size, axis === 'x' ? delta : 0, axis === 'y' ? delta : 0));
  else setZone(host, s.role, resizeZone(zone, size, axis, delta));
}

const ADJUST_AXIS: Partial<Record<ItemId, 'x' | 'y' | 'width' | 'height'>> = { moveX: 'x', moveY: 'y', width: 'width', height: 'height' };

function typeKey(host: ArrangeHost, s: ArrangeState, input: Input, is: (g: string[]) => boolean): ArrangeOutcome {
  const digit = /^(?:Digit|Numpad)(\d)$/.exec(input.code)?.[1];
  if (digit !== undefined) {
    if (s.typed.length < 5) s.typed += digit;
    return 'handled';
  }
  if (input.code === 'Backspace') {
    s.typed = s.typed.slice(0, -1);
    return 'handled';
  }
  if (input.code === 'Enter' || input.code === 'NumpadEnter' || is(host.keys.confirm)) {
    const value = Number(s.typed);
    const zone = zoneOf(host, s.role);
    const size = sizeOf(host, s.role);
    if (s.typing === 'position') {
      if (s.typed === '') return 'handled';
      if (s.typedWidth === undefined) {
        s.typedWidth = value;
        s.typed = '';
        return 'handled';
      }
      const r = zoneRect(zone, size);
      const moved = dragZone(zone, size, { x: s.typedWidth, y: value, width: r.width, height: r.height }, 'move');
      setZone(host, s.role, moved);
      const m = zoneRect(moved, size);
      s.notice = m.x !== s.typedWidth || m.y !== value ? t("{x}, {y} sortirait de l'écran : {placedX}, {placedY}.", { x: s.typedWidth, y: value, placedX: m.x, placedY: m.y }) : undefined;
      close(s);
      return 'handled';
    }
    if (!value) return 'handled';
    if (s.typedWidth === undefined && !zone.aspect) {
      s.typedWidth = value;
      s.typed = '';
      return 'handled';
    }
    const result = s.typedWidth === undefined ? setZoneSize(zone, size, value, undefined) : setZoneSize(zone, size, s.typedWidth, value);
    setZone(host, s.role, result);
    const r = zoneRect(result, size);
    const asked = s.typedWidth === undefined ? t('{n} px de large', { n: value }) : `${s.typedWidth} × ${value}`;
    s.notice = r.width !== (s.typedWidth ?? value) || (s.typedWidth !== undefined && r.height !== value) ? t("{asked} ne tient pas sur l'écran : {width} × {height}.", { asked, width: r.width, height: r.height }) : undefined;
    close(s);
    return 'handled';
  }
  if (is(host.keys.exit)) {
    cancel(host, s);
    return 'handled';
  }
  return 'handled';
}

/** Touche pendant l'étape « Disposition ». */
export function arrangeKey(host: ArrangeHost, s: ArrangeState, input: Input): ArrangeOutcome {
  const is = (group: string[]) => group.includes(input.code);
  const id = ITEMS[s.item]!.id;
  if (s.mode === 'type') return typeKey(host, s, input, is);

  const arrow = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<string, [number, number]>)[input.code];
  if (s.mode === 'adjust') {
    s.step = nextStep(s.step, Boolean(input.isAutoRepeat));
    const resizing = id === 'width' || id === 'height';
    if (arrow) {
      // Flèches : les deux sens à la fois (largeur à gauche et à droite, hauteur en haut et en bas).
      const [dx, dy] = arrow;
      if (dx) adjust(host, s, resizing ? 'width' : 'x', dx * s.step);
      if (dy) adjust(host, s, resizing ? 'height' : 'y', (resizing ? -dy : dy) * s.step);
    } else if (is(host.keys.previous) || is(host.keys.next)) adjust(host, s, ADJUST_AXIS[id]!, (is(host.keys.next) ? 1 : -1) * s.step);
    else if (is(host.keys.confirm)) close(s);
    else if (is(host.keys.exit) || is(host.keys.back)) cancel(host, s);
    else return 'unhandled';
    return 'handled';
  }
  if (s.mode === 'choice') {
    if (is(host.keys.previous)) stepChoice(host, s, -1);
    else if (is(host.keys.next)) stepChoice(host, s, 1);
    else if (is(host.keys.confirm)) close(s);
    else if (is(host.keys.exit) || is(host.keys.back)) cancel(host, s);
    else return 'unhandled';
    return 'handled';
  }

  s.notice = undefined;
  if (is(host.keys.previous)) s.item = (s.item - 1 + ITEMS.length) % ITEMS.length;
  else if (is(host.keys.next)) s.item = (s.item + 1) % ITEMS.length;
  else if (is(host.keys.confirm)) return open(host, s);
  else if (is(host.keys.exit) || is(host.keys.back)) return 'back';
  else if (arrow) {
    // Sans ligne ouverte, les flèches déplacent la zone choisie.
    s.step = nextStep(s.step, Boolean(input.isAutoRepeat));
    adjust(host, s, arrow[0] ? 'x' : 'y', (arrow[0] || arrow[1]) * s.step);
  } else return 'unhandled';
  return 'handled';
}

/** Action de la souris pendant l'étape « Disposition ». */
export function arrangeAction(host: ArrangeHost, s: ArrangeState, action: ArrangeAction): ArrangeOutcome {
  switch (action.op) {
    case 'item':
      if (!ITEMS[action.index]) return 'handled';
      if (s.mode) close(s);
      s.item = action.index;
      return open(host, s);
    case 'step':
      if (s.mode === 'choice') stepChoice(host, s, action.delta);
      // À la souris, un clic sur − ou + vaut dix pixels.
      else if (s.mode === 'adjust') adjust(host, s, ADJUST_AXIS[ITEMS[s.item]!.id]!, action.delta * 10);
      return 'handled';
    case 'confirm':
      if (s.mode) close(s);
      return 'handled';
    case 'cancel':
      cancel(host, s);
      return 'handled';
    case 'select':
      if (s.mode) close(s);
      if (host.assignments[action.role] !== undefined) {
        s.role = action.role;
        // Début d'un geste : la zone est saisie dans la fenêtre de son écran.
        s.grab = { role: action.role, display: host.assignments[action.role]! };
      }
      return 'handled';
    case 'drag':
      return drag(host, s, action);
  }
}

/**
 * Zone tirée à la souris (géométrie : planDrag, packages/core/src/zones.ts). L'écran de
 * départ est celui où la zone était saisie (« select » au début du geste), jamais déduit
 * de coordonnées du bureau : en DIP dans la page, en pixels physiques ici, et sans
 * rapport avec les écrans simulés hors écran.
 */
function drag(host: ArrangeHost, s: ArrangeState, action: Extract<ArrangeAction, { op: 'drag' }>): ArrangeOutcome {
  const current = host.assignments[action.role];
  if (current === undefined) return 'handled';
  if (s.mode) close(s);
  s.role = action.role;
  const origin = s.grab?.role === action.role ? s.grab.display : current;
  const plan = planDrag({
    displays: host.displays,
    role: action.role,
    origin,
    current,
    zone: zoneOf(host, action.role),
    handle: action.handle,
    rect: action.rect,
    pointer: action.pointer,
    snap: s.snap && !action.free,
    others: (display) => othersOn(host, action.role, display),
  });
  host.assignments[action.role] = plan.display;
  setZone(host, action.role, plan.zone);
  s.notice = plan.display !== origin ? t("{role} sur l'écran {n} : relâchez pour l'y laisser.", { role: labelOf(host, action.role), n: plan.display + 1 }) : undefined;
  return 'handled';
}

/** Zones des autres rôles sur cet écran : cibles de l'aimantation. */
function othersOn(host: ArrangeHost, role: RoleId, index: number): ScreenZone[] {
  return assignedRoles(host)
    .filter((r) => r !== role && host.assignments[r] === index)
    .map((r) => zoneOf(host, r));
}

/** Zones à dessiner sur un écran pendant l'étape « Disposition ». */
export function arrangeZones(host: ArrangeHost, s: ArrangeState, index: number) {
  const display = host.displays[index]!;
  const assignments = observed(host);
  return assignedRoles(host)
    .filter((r) => host.assignments[r] === index)
    .map((r) => {
      const zone = zoneOf(host, r);
      const rect = zoneRect(zone, display.bounds);
      const placement = zonePlacement(r, assignments, host.zones);
      const how = placement === 'embedded' ? t('incrusté') : placement === 'window' ? t('fenêtre') : t('plein écran');
      return { role: r, label: `${labelOf(host, r)} · ${rect.width} × ${rect.height} · ${how}`, zone, selected: r === s.role, editable: true };
    });
}

/** Panneau de l'étape, sur l'écran que le joueur regarde. */
export function arrangePanel(host: ArrangeHost, s: ArrangeState, keyLabel: (codes: string[]) => string) {
  const id = ITEMS[s.item]!.id;
  const items = ITEMS.map((it, index) => ({
    label: it.id === 'done' ? s.doneLabel : it.label,
    value: it.id === 'snap' ? (s.snap ? t('oui') : t('non')) : valueOf(host, s, it.id),
    selected: index === s.item,
    open: index === s.item && Boolean(s.mode),
    disabled: Boolean(itemDisabled(host, s, it.id)),
  }));
  const choices = s.mode === 'choice' ? choicesFor(host, s, id) : [];
  const display = displayOf(host, s.role);
  const zone = zoneOf(host, s.role);
  const rect = display && zoneRect(zone, display.bounds);
  const placement = display && zonePlacement(s.role, observed(host), host.zones);
  const where = placement === 'embedded' ? t('incrusté dans le playfield') : placement === 'window' ? t('fenêtre sur une partie de l’écran') : t('plein écran');
  const prev = keyLabel(host.keys.previous);
  const next = keyLabel(host.keys.next);
  const ok = keyLabel(host.keys.confirm);
  const no = keyLabel(host.keys.exit);
  const asked = () =>
    s.typing === 'position'
      ? s.typedWidth === undefined
        ? t('X (depuis la gauche de l’écran)')
        : t('Y (depuis le haut), X = {x}', { x: s.typedWidth })
      : s.typedWidth === undefined
        ? zone.aspect
          ? t('Largeur (la hauteur suit le format)')
          : t('Largeur')
        : t('Hauteur, largeur = {width}', { width: s.typedWidth });
  const hint =
    s.mode === 'choice'
      ? t('{previous} / {next} : {choice} · {confirm} : valider · {exit} : annuler', { previous: prev, next, choice: choices[s.choice]?.label ?? '', confirm: ok, exit: no })
      : s.mode === 'adjust'
        ? t('{previous} / {next} : {action} (maintenir pour aller vite) · flèches du clavier : dans les deux sens · {confirm} : valider · {exit} : annuler', {
            previous: prev,
            next,
            action: id === 'moveX' || id === 'moveY' ? t('déplacer') : t('réduire ou agrandir'),
            confirm: ok,
            exit: no,
          })
        : s.mode === 'type'
          ? t('{asked} : {typed} px · chiffres du clavier, Entrée : valider · {exit} : annuler', { asked: asked(), typed: s.typed || '…', exit: no })
          : t("{previous} / {next} : choisir une ligne · {confirm} : l'ouvrir · {exit} : étape précédente", { previous: prev, next, confirm: ok, exit: no });
  // Zone choisie sur l'écran du panneau : le panneau se range du côté opposé pour la laisser voir.
  const here = display && host.assignments[s.role] === (host.assignments.playfield ?? 0);
  const dock = here ? (zone.y + zone.height / 2 < 0.5 ? 'bottom' : 'top') : undefined;
  return {
    dock,
    title: t('Disposition · {role}', { role: labelOf(host, s.role) }),
    detail: rect
      ? t('{width} × {height} px en {x}, {y} · {where} · format {format}', { width: rect.width, height: rect.height, x: rect.x, y: rect.y, where, format: formatLabel(zone.aspect) })
      : t('Aucun écran'),
    items,
    choices: s.mode === 'choice' ? choices.map((c, i) => ({ label: c.label, selected: i === s.choice })) : undefined,
    hint,
    notice: s.notice,
    mouse: s.snap
      ? t('Souris : tirez une zone pour la déplacer, jusque sur un autre écran ; tirez un coin pour la redimensionner ; Alt maintenu : sans aimantation. Flèches du clavier : la déplacer au pixel.')
      : t('Souris : tirez une zone pour la déplacer, jusque sur un autre écran ; tirez un coin pour la redimensionner. Flèches du clavier : la déplacer au pixel.'),
    order: t("Les zones peuvent se chevaucher. Superposition : {order} pour les incrustations ; Windows décide pour deux fenêtres. Pas de rotation par zone : VPX n'en a pas de réglage.", {
      order: EMBEDDED_ORDER.map((r) => labelOf(host, r)).join(t(' sous ')),
    }),
  };
}
