// Générateur VPinballX.ini pour les fenêtres gérées par VPX 10.8.1 (Player,
// Backglass, ScoreView, Topper) et les plugins qui les dessinent. Noms de clés
// relevés dans le code source de VPX : src/core/Settings_properties.inl,
// src/renderer/Window.cpp, src/core/player.cpp et plugins/.

import { t } from './i18n';
import { IniDocument } from './ini';
import { edgeAfterRotation, isCabinetView, rotatedDisplay, type SizeCm } from './layout';
import type { DmdKind, FlipperEdge, ObservedDisplay, RoleId, Rotation, ScreenZone } from './model';
import { vpxRect, zonePlacement } from './zones';

interface VpxWindow {
  section: string;
  prefix: string;
  /** Playfield n'a pas de réglage « Output » : il est toujours affiché. */
  hasOutput: boolean;
}

export const VPX_WINDOWS: Record<RoleId, VpxWindow> = {
  playfield: { section: 'Player', prefix: 'Playfield', hasOutput: false },
  backglass: { section: 'Backglass', prefix: 'Backglass', hasOutput: true },
  dmd: { section: 'ScoreView', prefix: 'ScoreView', hasOutput: true },
  topper: { section: 'Topper', prefix: 'Topper', hasOutput: true },
};

// Valeurs des énumérations VPX.
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
 * Façon dont une version de VPX désigne un écran dans VPinballX.ini :
 * - `name` : le nom SDL seul (10.8.1-5436, vérifié dans son journal) ;
 * - `name-position` : `<nom SDL> [x, y]` (branche principale depuis, Window::GetDisplays).
 */
export type VpxDisplayIdFormat = 'name' | 'name-position';

/** Ce qui change d'une version de VPX à l'autre ; décrit par version dans le manifeste des composants. */
export interface VpxProfile {
  displayIdFormat: VpxDisplayIdFormat;
  /** Plugins activés par Cyber Pinball ([Plugin.<id>] Enable = 1) ; VPX les désactive tous par défaut. */
  enabledPlugins: string[];
}

export const DEFAULT_VPX_PROFILE: VpxProfile = { displayIdFormat: 'name-position', enabledPlugins: [] };

/**
 * Plugins à éteindre tant qu'un autre est activé. B2S et B2SLegacy réclament tous
 * deux l'objet B2S.Server des tables (B2SPlugin.cpp, B2SLegacyPlugin.cpp) : le
 * dernier chargé l'emporte. B2SLegacy est éteint par défaut sous Windows, mais une
 * valeur laissée dans VPinballX.ini suffit à le rallumer.
 */
export const VPX_PLUGIN_CONFLICTS: Record<string, string[]> = { B2S: ['B2SLegacy'] };

/** Fenêtres annexes : celles où plusieurs plugins se disputent l'affichage. */
export type VpxAncillarySection = 'Backglass' | 'ScoreView' | 'Topper';

/**
 * [fenêtre] Priority.<moteur de rendu> (0 à 100, 0 par défaut). Pour chaque image,
 * VPX essaie les moteurs dans l'ordre décroissant de priorité et garde le premier
 * qui dessine (Player::OnAuxRendererChanged, Renderer.cpp). Sans ces clés, tous
 * valent 0 et l'ordre dépend du chargement des plugins.
 * - PUP d'abord : un pack PuP ne dessine que quand il a une vidéo à montrer, le
 *   backglass du .directb2s reste affiché le reste du temps ;
 * - B2S ensuite : backglass et FullDMD du .directb2s ;
 * - ScoreView en dernier : affichage générique du DMD et des scores.
 * Le moteur porte le nom de son plugin (PUPManager.cpp, B2SServer.cpp, ScoreViewPlugin.cpp).
 * Écran DMD seul (bande 4:1) : B2S y passe à 0 (DMD_ONLY_PRIORITIES), son image FullDMD
 * n'a rien à faire dans la bande ; le DMD de la ROM y est dessiné par ScoreView.
 */
export const VPX_RENDERER_PRIORITIES: Record<VpxAncillarySection, Record<string, number>> = {
  Backglass: { PUP: 100, B2S: 50 },
  ScoreView: { PUP: 100, B2S: 50, ScoreView: 10 },
  Topper: { PUP: 100 },
};

/** Priorités de la fenêtre du DMD quand l'écran est un DMD seul : le FullDMD du .directb2s après le DMD. */
export const DMD_ONLY_PRIORITIES: Record<string, number> = { ...VPX_RENDERER_PRIORITIES.ScoreView, B2S: 0 };

/**
 * Identifiant d'écran attendu par VPX. VPX compare cette chaîne au caractère
 * près ; si elle ne correspond à aucun écran, il se rabat sur l'écran principal.
 * C'est la panne « la table se lance sur le mauvais écran ».
 */
export function vpxDisplayId(display: ObservedDisplay, format: VpxDisplayIdFormat = 'name-position'): string {
  const name = vpxDisplayName(display);
  return format === 'name' ? name : `${name} [${display.bounds.x}, ${display.bounds.y}]`;
}

/**
 * Nom que SDL donne à l'écran (SDL_windowsmodes.c, WIN_AddDisplay) : le nom
 * convivial DisplayConfig, ou à défaut la description EnumDisplayDevicesW.
 */
export function vpxDisplayName(display: ObservedDisplay): string {
  return display.friendlyName || display.monitorDescription || display.gdiName;
}

/**
 * Clés possédées par Cyber Pinball pour une affectation donnée des rôles. Un rôle
 * sur tout un écran a une fenêtre plein écran sans bordure ; sur une zone d'un
 * écran, une fenêtre « Windowed » posée sur la zone (WndX et WndY relatifs à
 * l'écran) ; dans la zone du playfield, une incrustation dans son image (WndX et
 * WndY relatifs à cette image).
 */
export function vpxSettingsFor(
  assignments: Partial<Record<RoleId, ObservedDisplay>>,
  profile: VpxProfile = DEFAULT_VPX_PROFILE,
  zones: Partial<Record<RoleId, ScreenZone>> = {},
  dmdKind?: DmdKind,
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
      // Rôle non affecté : on désactive la fenêtre sans toucher à ses autres réglages.
      if (win.hasOutput) put('Output', OUTPUT_DISABLED);
      continue;
    }
    const placement = zonePlacement(role, assignments, zones);
    const rect = vpxRect(role, assignments, zones)!;
    if (placement === 'embedded') {
      // Incrustée : la fenêtre n'existe pas, seul compte son rectangle dans l'image du playfield.
      put('Output', OUTPUT_EMBEDDED);
    } else {
      if (win.hasOutput) put('Output', OUTPUT_FLOATING);
      put('Display', vpxDisplayId(display, profile.displayIdFormat));
      put('FullScreen', placement === 'screen' ? FULLSCREEN_BORDERLESS : WINDOWED);
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
 * Réglages qui évitent toute boîte de dialogue de VPX pendant une partie lancée en
 * -Play. En -Play, VPX 10.8.1 ne crée pas son éditeur (PlayTableCommand,
 * AppCommands.cpp) : ni audit de la table, ni éditeur de script, ni fenêtre de
 * progression. Il lui reste deux questions posées par un réglage, qui bloquent la
 * borne en plein chargement :
 * - [Player] SecurityLevel : à partir de 1, VPX demande la permission pour chaque
 *   objet ActiveX que le script crée (ScriptInterpreter::QueryCustomPolicy), même
 *   Scripting.Dictionary ; à 4, il les refuse tous et le script s'arrête. 0 (valeur
 *   par défaut) : tous autorisés, sans question.
 * - [PlayerVR] AskToTurnOn : à 0 (« Enabled »), sans casque branché, « Connection
 *   to VR headset failed / Retry connection ? » ou « VR mode activated but OpenXR
 *   initialization failed. » (Player::Player, la version Windows a ENABLE_XR).
 *   2 (« Disabled », valeur par défaut) : jamais de VR sur une borne.
 * Écrites explicitement pour qu'une valeur changée à la main soit repérée (manualEdits).
 */
export const VPX_PLAY_SETTINGS: readonly VpxSetting[] = [
  { section: 'Player', key: 'SecurityLevel', value: '0' },
  { section: 'PlayerVR', key: 'AskToTurnOn', value: '2' },
];

/** Plugins que Cyber Pinball éteint parce qu'un plugin activé fait le même travail (VPX_PLUGIN_CONFLICTS). */
export function disabledPlugins(profile: VpxProfile): string[] {
  const off = profile.enabledPlugins.flatMap((p) => VPX_PLUGIN_CONFLICTS[p] ?? []);
  return [...new Set(off)].filter((p) => !profile.enabledPlugins.includes(p));
}

/** Priorités écrites pour une fenêtre : seulement celles des plugins activés. */
export function rendererPriorities(section: string, profile: VpxProfile, dmdKind?: DmdKind): [string, number][] {
  const table = section === 'ScoreView' && dmdKind === 'dmd' ? DMD_ONLY_PRIORITIES : (VPX_RENDERER_PRIORITIES[section as VpxAncillarySection] ?? {});
  return Object.entries(table).filter(([renderer]) => profile.enabledPlugins.includes(renderer));
}

/**
 * Valeurs proposées aux plugins de la fenêtre DMD, écrites seulement quand la clé
 * est vide. Le plugin B2S affiche dans ScoreView l'image DMD (FullDMD) d'un
 * .directb2s qui en a une, et passe devant ScoreView (VPX_RENDERER_PRIORITIES) ;
 * sans incrustation (ScoreViewDMDOverlay = 0 par défaut), le DMD de la ROM n'y
 * apparaît pas : on ne verrait que le cadre. ScoreViewDMDAutoPos cherche dans
 * l'image le plus grand rectangle sombre aux proportions du DMD (B2SDMDOverlay.cpp).
 * Rien pour un écran DMD seul : B2S n'y dessine pas (DMD_ONLY_PRIORITIES).
 */
export function vpxPluginDefaults(assignments: Partial<Record<RoleId, ObservedDisplay>>, profile: VpxProfile, dmdKind?: DmdKind): VpxSetting[] {
  const defaults: VpxSetting[] = [];
  if (assignments.dmd && dmdKind !== 'dmd' && profile.enabledPlugins.includes('B2S')) {
    defaults.push({ section: 'Plugin.B2S', key: 'ScoreViewDMDOverlay', value: '1' });
    defaults.push({ section: 'Plugin.B2S', key: 'ScoreViewDMDAutoPos', value: '1' });
  }
  return defaults;
}

/** Valeur booléenne lue comme VPX (LayeredINIPropertyStore) : un entier non nul, true, on ou enable. */
export function iniBool(raw: string | undefined): boolean | undefined {
  const text = raw?.trim();
  if (!text) return undefined;
  if (/^[-+]?\d+$/.test(text)) return Number(text) !== 0;
  if (/^(true|on|enable)$/i.test(text)) return true;
  if (/^(false|off|disable)$/i.test(text)) return false;
  return undefined;
}

// Vue de la table (Player.BGSet) et cadrage automatique (CabinetAutofitMode).
const VIEW_DESKTOP = '0';
const VIEW_CABINET = '1';
const AUTOFIT_FIT_TABLE = '1';

/** Clés de cadrage possédées par Cyber Pinball : elles découlent du playfield. */
export const VPX_LAYOUT_KEYS = ['BGSet', 'ScreenWidth', 'ScreenHeight'];

/** Libellés des énumérations BGSet et CabinetAutofitMode (Settings_properties.inl, l. 165-167). */
const BGSET_LABELS = ['Desktop / Full Single Screen', 'Cabinet', 'Full Single Screen'];
const AUTOFIT_LABELS = ['Manual', 'Fit Table', 'Fit Screen'];

/** Énumération lue comme EnumPropertyDef::ParseEnum : un libellé, ou un nombre dans les bornes ; sinon la valeur par défaut. */
function vpxEnum(raw: string | undefined, labels: string[], fallback: number): number {
  const text = raw?.trim() ?? '';
  const index = labels.indexOf(text);
  if (index >= 0) return index;
  const n = /^[-+]?\d+$/.test(text) ? Number(text) : NaN;
  return n >= 0 && n < labels.length ? n : fallback;
}

/** CabinetAutofitMode qui fait cadrer la table par VPX : « Fit Table » (1) ou « Fit Screen » (2), pas « Manual » (0, défaut de VPX). */
export function isVpxAutofit(raw: string | undefined): boolean {
  return vpxEnum(raw, AUTOFIT_LABELS, 0) !== 0;
}

export interface VpxLayout {
  /** Réglages possédés, réécrits à chaque synchronisation. */
  settings: VpxSetting[];
  /**
   * Vue borne : cadrage automatique exigé. Le mode choisi par l'utilisateur (1 ou 2) est
   * gardé ; toute autre valeur, absente ou « Manual », est remplacée par celle-ci.
   */
  autofit?: VpxSetting;
}

/**
 * Cadrage des tables (relevé dans ViewSetup.cpp et player.cpp de VPX 10.8.1) :
 * - ScreenWidth / ScreenHeight : taille réelle de l'image en cm, le grand côté en
 *   largeur quelle que soit l'orientation ; VPX ne les échange jamais ;
 * - BGSet = 1 (vue borne) quand l'image est plus haute que large pour le joueur ;
 * - CabinetAutofitMode 1 (« Fit Table ») ou 2 (« Fit Screen ») : VPX recalcule toute
 *   la vue borne de la table, y compris sa rotation, déduite de la forme de la
 *   fenêtre. C'est la seule façon de connaître le sens des tables en vue borne
 *   (vpxPlayedFlipperEdge) : le mode est donc exigé, pas seulement proposé.
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
  /** Bord de la fenêtre du playfield où VPX dessinera les flippers ; undefined : celui que prévoit chaque table. */
  edge?: FlipperEdge;
  /** desktop : vue bureau ; autofit : vue borne cadrée par VPX ; manual : vue borne réglée dans la table. */
  view: 'desktop' | 'autofit' | 'manual';
}

/**
 * Bord où VPX 10.8.1 dessinera les flippers dans la fenêtre du playfield, d'après les
 * valeurs qu'il lira (`read` : le .ini de la table par-dessus VPinballX.ini). VPX dessine
 * dans les coordonnées de Windows : seule compte la forme de la fenêtre, pas l'orientation
 * de l'écran. Une rotation de vue de r degrés met les flippers au bord dont edgeRotation
 * vaut r (0 en bas, 270 à droite : ViewSetup::ComputeMVP).
 * - Vue borne (BGSet = 1) et cadrage automatique (CabinetAutofitMode 1 ou 2) : à chaque
 *   partie, SetWindowAutofit remet la rotation de la table à 0 (après ses surcharges :
 *   ViewCabRotation n'y fait rien), et GetRotation y ajoute 270° pour une fenêtre
 *   paysage, 0° pour une fenêtre portrait (`viewportWidth < viewportHeight ? 0 : 3`).
 *   ScreenWidth / ScreenHeight absents, VPX prend ses valeurs par défaut et cadre quand même.
 * - Vue borne en cadrage manuel : la vue borne réglée dans la table, avec sa rotation
 *   (souvent 270°, pour un Windows en paysage) : rien ne garantit le sens, sauf si le .ini
 *   donne la vue et sa rotation (manualCabRotation : correction faite dans le menu de VPX).
 * - Vue bureau (BGSet 0 ou 2, PinTable::UpdateCurrentBGSet) : la vue bureau ou FSS de
 *   la table, dessinée flippers en bas.
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
 * Vue borne en cadrage manuel : rotation de la vue quand le .ini la donne en entier, par
 * exemple après « Save as Table Override » dans le menu de VPX (ViewSetup::GetRotation) :
 * en mode « Window », ViewCabRotation s'ajoute à 270° pour une fenêtre paysage, 0° pour
 * une fenêtre portrait ; en « Legacy » ou « Camera », elle vaut seule. Sans ViewCabMode
 * ni ViewCabRotation, ce sont les valeurs du .vpx : undefined. Hors quart de tour aussi.
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
 * Bord où VPX affichera les flippers avec le cadrage écrit par Cyber Pinball
 * (vpxLayoutSettings, cadrage automatique en vue borne) : à droite d'une fenêtre
 * paysage, en bas d'une fenêtre portrait, sans réglage possible ; en bas en vue bureau.
 */
export function vpxFlipperEdge(display: ObservedDisplay, edge: FlipperEdge): FlipperEdge {
  const layout = vpxLayoutSettings(display, edge, undefined);
  const values = [...layout.settings, ...(layout.autofit ? [layout.autofit] : [])];
  return vpxPlayedFlipperEdge((section, key) => values.find((s) => s.section === section && s.key === key)?.value, display).edge!;
}

export interface OrientationFix {
  /** Quart(s) de tour à ajouter à l'orientation Windows actuelle. */
  delta: Rotation;
  /** Orientation Windows à demander (0 = paysage, 180 = paysage retourné…). */
  rotation: Rotation;
  /** Bord du joueur dans la nouvelle image. */
  edge: FlipperEdge;
}

/**
 * Orientation Windows qui met les flippers de VPX du côté du joueur, quand VPX ne
 * sait pas le faire seul ; undefined si rien à changer. Le retournement (180°) est
 * préféré : il garde la définition de l'image, donc la disposition des autres
 * écrans. Le quart de tour ne sert qu'à un Windows en portrait vu de côté.
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

/** Écrit chaque valeur proposée là où la clé est absente ou vide ; renvoie ce qui a changé. */
export function applyVpxDefaults(doc: IniDocument, defaults: VpxSetting[]): VpxChange[] {
  return applyVpxSettings(
    doc,
    defaults.filter((s) => !doc.get(s.section, s.key)),
  );
}

/** Applique les réglages au document et renvoie uniquement ce qui a réellement changé. */
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

/** Diff lisible, une ligne par clé modifiée. */
export function formatChanges(changes: VpxChange[]): string[] {
  return changes.map((c) => t('[{section}] {key} : {before} → {value}', { section: c.section, key: c.key, before: c.before ?? t('(absent)'), value: c.value }));
}
