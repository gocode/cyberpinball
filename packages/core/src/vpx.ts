// VPinballX.ini generator for the windows managed by VPX 10.8.1 (Player,
// Backglass, ScoreView, Topper) and the plugins that draw them. Key names
// taken from the VPX source code: src/core/Settings_properties.inl,
// src/renderer/Window.cpp, src/core/player.cpp and plugins/.

import { t } from './i18n';
import { IniDocument } from './ini';
import { edgeAfterRotation, isCabinetView, rotatedDisplay, type SizeCm } from './layout';
import type { DmdKind, FlipperEdge, ObservedDisplay, RoleId, Rotation, ScreenZone } from './model';
import { vpxRect, zonePlacement } from './zones';

interface VpxWindow {
  section: string;
  prefix: string;
  /** Playfield has no "Output" setting: it is always shown. */
  hasOutput: boolean;
}

export const VPX_WINDOWS: Record<RoleId, VpxWindow> = {
  playfield: { section: 'Player', prefix: 'Playfield', hasOutput: false },
  backglass: { section: 'Backglass', prefix: 'Backglass', hasOutput: true },
  dmd: { section: 'ScoreView', prefix: 'ScoreView', hasOutput: true },
  topper: { section: 'Topper', prefix: 'Topper', hasOutput: true },
};

// Values of the VPX enumerations.
const OUTPUT_DISABLED = '0';
const OUTPUT_FLOATING = '1';
const OUTPUT_EMBEDDED = '2';
const WINDOWED = '0';
const FULLSCREEN_BORDERLESS = '1';

export interface VpxSetting {
  section: string;
  key: string;
  value: string;
}

export interface VpxChange extends VpxSetting {
  before: string | undefined;
}

/**
 * How a version of VPX names a screen in VPinballX.ini:
 * - `name`: the SDL name alone (10.8.1-5436, checked in its log);
 * - `name-position`: `<SDL name> [x, y]` (main branch since then, Window::GetDisplays).
 */
export type VpxDisplayIdFormat = 'name' | 'name-position';

/** What changes from one version of VPX to another; described per version in the component manifest. */
export interface VpxProfile {
  displayIdFormat: VpxDisplayIdFormat;
  /** Plugins enabled by Cyber Pinball ([Plugin.<id>] Enable = 1); VPX disables them all by default. */
  enabledPlugins: string[];
  /**
   * Plugins this version no longer ships (10.9.0: B2SLegacy removed, ScoreView renamed Nixie):
   * never written, not even to turn them off (VPX_PLUGIN_CONFLICTS).
   */
  retiredPlugins?: string[];
  /**
   * VPX corrigé de Cyber Pinball (patched Cyber Pinball 2 et suivants) : « Ajuster la table » sait garder le haut de la
   * table ([Player] CabinetAutofitKeepTop, CabinetAutofitMaxStretch ; VPX_KEEP_TOP_FRAMING).
   */
  keepTopFraming?: boolean;
}

export const DEFAULT_VPX_PROFILE: VpxProfile = { displayIdFormat: 'name-position', enabledPlugins: [] };

/**
 * Plugins to turn off as long as another one is enabled. B2S and B2SLegacy both
 * claim the tables' B2S.Server object (B2SPlugin.cpp, B2SLegacyPlugin.cpp): the
 * last one loaded wins. B2SLegacy is off by default on Windows, but a
 * value left in VPinballX.ini is enough to turn it back on.
 */
export const VPX_PLUGIN_CONFLICTS: Record<string, string[]> = { B2S: ['B2SLegacy'] };

/** Ancillary windows: those where several plugins compete for the display. */
export type VpxAncillarySection = 'Backglass' | 'ScoreView' | 'Topper';

/**
 * [window] Priority.<renderer> (0 to 100, 0 by default). For each frame,
 * VPX tries the renderers in decreasing order of priority and keeps the first one
 * that draws (Player::OnAuxRendererChanged, Renderer.cpp). Without these keys, all
 * are 0 and the order depends on the loading of the plugins.
 * - PUP first: a PuP pack only draws when it has a video to show, the
 *   backglass of the .directb2s stays shown the rest of the time;
 * - B2S next: backglass and FullDMD of the .directb2s;
 * - ScoreView last: generic display of the DMD and the scores (plugin renamed Nixie in 10.9.0:
 *   both are listed, only the one the version enables is written, rendererPriorities).
 * The renderer bears the name of its plugin (PUPManager.cpp, B2SServer.cpp, ScoreViewPlugin.cpp, NixiePlugin.cpp).
 * DMD-only screen (4:1 strip): B2S goes to 0 there (DMD_ONLY_PRIORITIES), its FullDMD image
 * has no business in the strip; the DMD of the ROM is drawn there by ScoreView.
 */
export const VPX_RENDERER_PRIORITIES: Record<VpxAncillarySection, Record<string, number>> = {
  Backglass: { PUP: 100, B2S: 50 },
  ScoreView: { PUP: 100, B2S: 50, ScoreView: 10, Nixie: 10 },
  Topper: { PUP: 100 },
};

/** Priorities of the DMD window when the screen is a DMD alone: the FullDMD of the .directb2s after the DMD. */
export const DMD_ONLY_PRIORITIES: Record<string, number> = { ...VPX_RENDERER_PRIORITIES.ScoreView, B2S: 0 };

/**
 * Screen identifier expected by VPX. VPX compares this string character for
 * character; if it matches no screen, it falls back to the main screen.
 * That is the "the table starts on the wrong screen" failure.
 */
export function vpxDisplayId(display: ObservedDisplay, format: VpxDisplayIdFormat = 'name-position'): string {
  const name = vpxDisplayName(display);
  return format === 'name' ? name : `${name} [${display.bounds.x}, ${display.bounds.y}]`;
}

/**
 * Name SDL gives the screen (SDL_windowsmodes.c, WIN_AddDisplay): the DisplayConfig
 * friendly name, or failing that the EnumDisplayDevicesW description.
 */
export function vpxDisplayName(display: ObservedDisplay): string {
  return display.friendlyName || display.monitorDescription || display.gdiName;
}

/**
 * Keys owned by Cyber Pinball for a given assignment of the roles. A role
 * on a whole screen has a borderless fullscreen window; on a zone of a
 * screen, a "Windowed" window placed on the zone (WndX and WndY relative to the
 * screen); in the playfield's zone, an overlay in its image (WndX and
 * WndY relative to that image).
 *
 * `confused`: roles that VPX may open on another role's screen (confusableRoles: screens with the
 * same name). Their ancillary window is never fullscreen but windowed at the size of the
 * screen: SDL keeps only one fullscreen window per screen and minimises the previous one when another
 * goes fullscreen there (SDL_video.c, SDL_UpdateFullscreenMode: SDL_MinimizeWindow). With two
 * fullscreen windows open on the same PL2294H, the backglass was minimised for the whole game, and
 * Cyber Pinball could not bring it back to its screen (3-screen PC, The Matrix on
 * 30 October 2026, City Hunter on 6 November: PuP-Pack invisible on the backglass).
 */
export function vpxSettingsFor(
  assignments: Partial<Record<RoleId, ObservedDisplay>>,
  profile: VpxProfile = DEFAULT_VPX_PROFILE,
  zones: Partial<Record<RoleId, ScreenZone>> = {},
  dmdKind?: DmdKind,
  confused: readonly RoleId[] = [],
): VpxSetting[] {
  const settings: VpxSetting[] = [];
  for (const plugin of profile.enabledPlugins) {
    settings.push({ section: `Plugin.${plugin}`, key: 'Enable', value: '1' });
  }
  for (const plugin of disabledPlugins(profile)) settings.push({ section: `Plugin.${plugin}`, key: 'Enable', value: '0' });
  for (const role of Object.keys(VPX_WINDOWS) as RoleId[]) {
    const win = VPX_WINDOWS[role];
    const display = assignments[role];
    const put = (suffix: string, value: string | number) =>
      settings.push({ section: win.section, key: `${win.prefix}${suffix}`, value: String(value) });

    if (!display) {
      // Unassigned role: the window is disabled without touching its other settings.
      if (win.hasOutput) put('Output', OUTPUT_DISABLED);
      continue;
    }
    const placement = zonePlacement(role, assignments, zones);
    const rect = vpxRect(role, assignments, zones)!;
    if (placement === 'embedded') {
      // Overlaid: the window does not exist, only its rectangle in the playfield's image counts.
      put('Output', OUTPUT_EMBEDDED);
    } else {
      if (win.hasOutput) put('Output', OUTPUT_FLOATING);
      put('Display', vpxDisplayId(display, profile.displayIdFormat));
      put('FullScreen', placement === 'screen' && (role === 'playfield' || !confused.includes(role)) ? FULLSCREEN_BORDERLESS : WINDOWED);
    }
    put('WndX', rect.x);
    put('WndY', rect.y);
    put('Width', rect.width);
    put('Height', rect.height);
    for (const [renderer, priority] of rendererPriorities(win.section, profile, role === 'dmd' ? dmdKind : undefined)) {
      settings.push({ section: win.section, key: `Priority.${renderer}`, value: String(priority) });
    }
  }
  return settings;
}

/**
 * Settings that avoid any VPX dialog box during a game started with
 * -Play. With -Play, VPX 10.8.1 does not create its editor (PlayTableCommand,
 * AppCommands.cpp): no table audit, no script editor, no progress
 * window. Two questions asked because of a setting remain, and they block the
 * cabinet in the middle of loading:
 * - [Player] SecurityLevel: from 1 up, VPX asks permission for each
 *   ActiveX object the script creates (ScriptInterpreter::QueryCustomPolicy), even
 *   Scripting.Dictionary; at 4, it refuses them all and the script stops. 0 (default
 *   value): all allowed, no question.
 * - [PlayerVR] AskToTurnOn: at 0 ("Enabled"), with no headset plugged in, "Connection
 *   to VR headset failed / Retry connection ?" or "VR mode activated but OpenXR
 *   initialization failed." (Player::Player, the Windows build has ENABLE_XR).
 *   2 ("Disabled", default value): never VR on a cabinet.
 * Written explicitly so that a value changed by hand is noticed (manualEdits).
 */
export const VPX_PLAY_SETTINGS: readonly VpxSetting[] = [
  { section: 'Player', key: 'SecurityLevel', value: '0' },
  { section: 'PlayerVR', key: 'AskToTurnOn', value: '2' },
];

/** Fast start of WPC ROMs: the memory test skipped (vpxPluginDefaults). */
export const PINMAME_FAST_BOOT: VpxSetting = { section: 'Plugin.PinMAME', key: 'Cheat', value: '1' };

/** Plugins that Cyber Pinball turns off because an enabled plugin does the same job (VPX_PLUGIN_CONFLICTS). */
export function disabledPlugins(profile: VpxProfile): string[] {
  const off = profile.enabledPlugins.flatMap((p) => VPX_PLUGIN_CONFLICTS[p] ?? []);
  return [...new Set(off)].filter((p) => !profile.enabledPlugins.includes(p) && !profile.retiredPlugins?.includes(p));
}

/** Priorities written for a window: only those of the enabled plugins. */
export function rendererPriorities(section: string, profile: VpxProfile, dmdKind?: DmdKind): [string, number][] {
  const table = section === 'ScoreView' && dmdKind === 'dmd' ? DMD_ONLY_PRIORITIES : (VPX_RENDERER_PRIORITIES[section as VpxAncillarySection] ?? {});
  return Object.entries(table).filter(([renderer]) => profile.enabledPlugins.includes(renderer));
}

/**
 * Values offered to the plugins of the DMD window, written only when the key
 * is empty. The B2S plugin shows in ScoreView the DMD image (FullDMD) of a
 * .directb2s that has one, and goes ahead of ScoreView (VPX_RENDERER_PRIORITIES);
 * without overlay (ScoreViewDMDOverlay = 0 by default), the DMD of the ROM does not
 * appear there: only the frame would be seen. ScoreViewDMDAutoPos looks in
 * the image for the largest dark rectangle with the DMD's proportions (B2SDMDOverlay.cpp).
 * Nothing for a DMD-only screen: B2S does not draw there (DMD_ONLY_PRIORITIES).
 *
 * [Plugin.PinMAME] Cheat (PINMAME_FAST_BOOT): without it, a WPC ROM (Williams and Bally,
 * 1990-1999) redoes its memory test at every game, several seconds of "TESTING..."
 * before playing. Enabled, PinMAME skips this check (wpc.c, MACHINE_INIT: "speed up startup
 * by disable checksum"). The plugin sets it to off by default, whereas VPinMAME had it
 * on out of the box on most cabinets: a table that used to start fast began testing.
 * Neither the rules nor the scores depend on it.
 */
export function vpxPluginDefaults(assignments: Partial<Record<RoleId, ObservedDisplay>>, profile: VpxProfile, dmdKind?: DmdKind): VpxSetting[] {
  const defaults: VpxSetting[] = [];
  if (profile.enabledPlugins.includes('PinMAME')) defaults.push(PINMAME_FAST_BOOT);
  // L'incrustation du DMD dans l'image FullDMD n'existe plus dans le plugin B2S de 10.9.0 (avec ScoreView, devenu Nixie).
  if (assignments.dmd && dmdKind !== 'dmd' && profile.enabledPlugins.includes('B2S') && profile.enabledPlugins.includes('ScoreView')) {
    defaults.push({ section: 'Plugin.B2S', key: 'ScoreViewDMDOverlay', value: '1' });
    defaults.push({ section: 'Plugin.B2S', key: 'ScoreViewDMDAutoPos', value: '1' });
  }
  return defaults;
}

/** Boolean value read as VPX does (LayeredINIPropertyStore): a non-zero integer, true, on or enable. */
export function iniBool(raw: string | undefined): boolean | undefined {
  const text = raw?.trim();
  if (!text) return undefined;
  if (/^[-+]?\d+$/.test(text)) return Number(text) !== 0;
  if (/^(true|on|enable)$/i.test(text)) return true;
  if (/^(false|off|disable)$/i.test(text)) return false;
  return undefined;
}

// Table view (Player.BGSet) and automatic framing (CabinetAutofitMode).
const VIEW_DESKTOP = '0';
const VIEW_CABINET = '1';
const AUTOFIT_FIT_TABLE = '1';

/**
 * Cadrage des tables par défaut avec le VPX corrigé (21/11/2026) : sur un écran 16:9, une table est
 * 17 à 29 % trop étroite. « Ajuster la table » de VPX comble par un zoom qui peut couper le fond du plateau (Attack from Mars : la soucoupe),
 * « Remplir l'écran » en l'étirant d'autant. Avec CabinetAutofitKeepTop, le zoom s'arrête quand le fond du plateau
 * arrive près du haut de l'écran, les flippers à CabinetAutofitPos (l'apron, sous les flippers, et le vide sous la vitre sortent de l'écran),
 * et le reste de la largeur est comblé par un étirement plafonné à CabinetAutofitMaxStretch (bandes au-delà).
 * Valeurs proposées (écrites seulement quand la clé est vide) : le choix de l'utilisateur est gardé.
 */
export const VPX_KEEP_TOP_FRAMING: readonly VpxSetting[] = [
  { section: 'Player', key: 'CabinetAutofitKeepTop', value: '1' },
  { section: 'Player', key: 'CabinetAutofitMaxStretch', value: '0.15' },
];

/** Framing keys owned by Cyber Pinball: they follow from the playfield. */
export const VPX_LAYOUT_KEYS = ['BGSet', 'ScreenWidth', 'ScreenHeight'];

/** Labels of the BGSet and CabinetAutofitMode enumerations (Settings_properties.inl, l. 165-167). */
const BGSET_LABELS = ['Desktop / Full Single Screen', 'Cabinet', 'Full Single Screen'];
const AUTOFIT_LABELS = ['Manual', 'Fit Table', 'Fit Screen'];

/** Enumeration read as EnumPropertyDef::ParseEnum does: a label, or a number within bounds; else the default value. */
function vpxEnum(raw: string | undefined, labels: string[], fallback: number): number {
  const text = raw?.trim() ?? '';
  const index = labels.indexOf(text);
  if (index >= 0) return index;
  const n = /^[-+]?\d+$/.test(text) ? Number(text) : NaN;
  return n >= 0 && n < labels.length ? n : fallback;
}

/** CabinetAutofitMode that makes VPX frame the table: "Fit Table" (1) or "Fit Screen" (2), not "Manual" (0, VPX default). */
export function isVpxAutofit(raw: string | undefined): boolean {
  return vpxEnum(raw, AUTOFIT_LABELS, 0) !== 0;
}

/** CabinetAutofitMode as VPX reads it: 0 Manual, 1 Fit Table, 2 Fit Screen (a label or a number; else Manual). */
export function vpxAutofitMode(raw: string | undefined): 0 | 1 | 2 {
  return vpxEnum(raw, AUTOFIT_LABELS, 0) as 0 | 1 | 2;
}

/** BGSet as VPX reads it: cabinet view (1), or not (desktop, full single screen, missing). */
export function isVpxCabinetView(raw: string | undefined): boolean {
  return vpxEnum(raw, BGSET_LABELS, 0) === 1;
}

export interface VpxLayout {
  /** Owned settings, rewritten at each synchronisation. */
  settings: VpxSetting[];
  /**
   * Cabinet view: automatic framing required. The mode chosen by the user (1 or 2) is
   * kept; any other value, missing or "Manual", is replaced by this one.
   */
  autofit?: VpxSetting;
}

/**
 * Framing of the tables (taken from ViewSetup.cpp and player.cpp of VPX 10.8.1):
 * - ScreenWidth / ScreenHeight: actual size of the image in cm, the long side as
 *   width whatever the orientation; VPX never swaps them;
 * - BGSet = 1 (cabinet view) when the image is taller than wide for the player;
 * - CabinetAutofitMode 1 ("Fit Table") or 2 ("Fit Screen"): VPX recomputes the whole
 *   cabinet view of the table, including its rotation, deduced from the shape of the
 *   window. It is the only way to know which way the tables face in cabinet view
 *   (vpxPlayedFlipperEdge): so the mode is required, not just offered.
 */
export function vpxLayoutSettings(display: ObservedDisplay, edge: FlipperEdge, size: SizeCm | undefined): VpxLayout {
  const cabinet = isCabinetView(display, edge);
  const settings: VpxSetting[] = [{ section: 'Player', key: 'BGSet', value: cabinet ? VIEW_CABINET : VIEW_DESKTOP }];
  if (size) {
    settings.push({ section: 'Player', key: 'ScreenWidth', value: formatCm(size.width) });
    settings.push({ section: 'Player', key: 'ScreenHeight', value: formatCm(size.height) });
  }
  return { settings, ...(cabinet && { autofit: { section: 'Player', key: 'CabinetAutofitMode', value: AUTOFIT_FIT_TABLE } }) };
}

export interface VpxPlayedEdge {
  /** Edge of the playfield window where VPX will draw the flippers; undefined: the one each table plans. */
  edge?: FlipperEdge;
  /** desktop: desktop view; autofit: cabinet view framed by VPX; manual: cabinet view set in the table. */
  view: 'desktop' | 'autofit' | 'manual';
}

/**
 * Edge where VPX 10.8.1 will draw the flippers in the playfield window, from the
 * values it will read (`read`: the table's .ini over VPinballX.ini). VPX draws
 * in Windows coordinates: only the shape of the window counts, not the orientation
 * of the screen. A view rotation of r degrees puts the flippers at the edge whose edgeRotation
 * is r (0 at the bottom, 270 on the right: ViewSetup::ComputeMVP).
 * - Cabinet view (BGSet = 1) and automatic framing (CabinetAutofitMode 1 or 2): at each
 *   game, SetWindowAutofit resets the table's rotation to 0 (after its overrides:
 *   ViewCabRotation has no effect), and GetRotation adds 270° for a landscape
 *   window, 0° for a portrait window (`viewportWidth < viewportHeight ? 0 : 3`).
 *   ScreenWidth / ScreenHeight missing, VPX takes its default values and frames anyway.
 * - Cabinet view with manual framing: the cabinet view set in the table, with its rotation
 *   (often 270°, for a Windows in landscape): nothing guarantees the direction, unless the .ini
 *   gives the view and its rotation (manualCabRotation: correction made in VPX's menu).
 * - Desktop view (BGSet 0 or 2, PinTable::UpdateCurrentBGSet): the desktop or FSS view of
 *   the table, drawn with the flippers at the bottom.
 */
export function vpxPlayedFlipperEdge(read: (section: string, key: string) => string | undefined, window: ObservedDisplay): VpxPlayedEdge {
  if (vpxEnum(read('Player', 'BGSet'), BGSET_LABELS, 0) !== 1) return { edge: 'bottom', view: 'desktop' };
  if (!isVpxAutofit(read('Player', 'CabinetAutofitMode'))) {
    const rotation = manualCabRotation(read, window);
    return rotation === undefined ? { view: 'manual' } : { edge: ROTATION_EDGES[rotation], view: 'manual' };
  }
  return { edge: window.bounds.width < window.bounds.height ? 'bottom' : 'right', view: 'autofit' };
}

const VIEW_MODE_LABELS = ['Legacy', 'Camera', 'Window'];
const VLM_WINDOW = 2;
const ROTATION_EDGES: Record<Rotation, FlipperEdge> = { 0: 'bottom', 90: 'left', 180: 'top', 270: 'right' };

/**
 * Cabinet view with manual framing: rotation of the view when the .ini gives it in full, for
 * example after "Save as Table Override" in VPX's menu (ViewSetup::GetRotation):
 * in "Window" mode, ViewCabRotation is added to 270° for a landscape window, 0° for
 * a portrait window; in "Legacy" or "Camera", it stands alone. Without ViewCabMode
 * or ViewCabRotation, these are the values of the .vpx: undefined. Also outside quarter turns.
 */
function manualCabRotation(read: (section: string, key: string) => string | undefined, window: ObservedDisplay): Rotation | undefined {
  const rawMode = read('TableOverride', 'ViewCabMode')?.trim();
  const rawRotation = read('TableOverride', 'ViewCabRotation')?.trim();
  if (!rawMode || !rawRotation) return undefined;
  const mode = vpxEnum(rawMode, VIEW_MODE_LABELS, -1);
  const value = Number(rawRotation);
  if (mode < 0 || !Number.isFinite(value) || Math.abs(value % 90) > 1e-3) return undefined;
  const base = mode === VLM_WINDOW && window.bounds.width >= window.bounds.height ? 270 : 0;
  return ((((base + Math.round(value)) % 360) + 360) % 360) as Rotation;
}

/**
 * Edge where VPX will show the flippers with the framing written by Cyber Pinball
 * (vpxLayoutSettings, automatic framing in cabinet view): on the right of a landscape
 * window, at the bottom of a portrait window, with no setting possible; at the bottom in desktop view.
 */
export function vpxFlipperEdge(display: ObservedDisplay, edge: FlipperEdge): FlipperEdge {
  const layout = vpxLayoutSettings(display, edge, undefined);
  const values = [...layout.settings, ...(layout.autofit ? [layout.autofit] : [])];
  return vpxPlayedFlipperEdge((section, key) => values.find((s) => s.section === section && s.key === key)?.value, display).edge!;
}

export interface OrientationFix {
  /** Quarter turn(s) to add to the current Windows orientation. */
  delta: Rotation;
  /** Windows orientation to request (0 = landscape, 180 = landscape flipped...). */
  rotation: Rotation;
  /** Edge of the player in the new image. */
  edge: FlipperEdge;
}

/**
 * Windows orientation that puts VPX's flippers on the player's side, when VPX cannot
 * do it on its own; undefined if there is nothing to change. Flipping (180°) is
 * preferred: it keeps the image's resolution, hence the layout of the other
 * screens. The quarter turn only serves a Windows in portrait seen from the side.
 */
export function vpxOrientationFix(display: ObservedDisplay, edge: FlipperEdge): OrientationFix | undefined {
  if (vpxFlipperEdge(display, edge) === edge) return undefined;
  for (const delta of [180, 90, 270] as const) {
    const next = edgeAfterRotation(edge, delta);
    if (vpxFlipperEdge(rotatedDisplay(display, delta), next) === next) {
      return { delta, rotation: ((display.rotation + delta) % 360) as Rotation, edge: next };
    }
  }
  return undefined;
}

function formatCm(value: number): string {
  return String(Math.round(value * 10) / 10);
}

/** Writes each offered value where the key is missing or empty; returns what changed. */
export function applyVpxDefaults(doc: IniDocument, defaults: VpxSetting[]): VpxChange[] {
  return applyVpxSettings(
    doc,
    defaults.filter((s) => !doc.get(s.section, s.key)),
  );
}

/** Applies the settings to the document and returns only what actually changed. */
export function applyVpxSettings(doc: IniDocument, settings: VpxSetting[]): VpxChange[] {
  const changes: VpxChange[] = [];
  for (const s of settings) {
    const before = doc.get(s.section, s.key);
    if (before === s.value) continue;
    doc.set(s.section, s.key, s.value);
    changes.push({ ...s, before });
  }
  return changes;
}

/** Readable diff, one line per changed key. */
export function formatChanges(changes: VpxChange[]): string[] {
  return changes.map((c) => t('[{section}] {key} : {before} → {value}', { section: c.section, key: c.key, before: c.before ?? t('(absent)'), value: c.value }));
}
