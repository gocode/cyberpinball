// Cohabitation avec un autre menu de borne (PinUP Popper, PinballX, PinballY) installé
// sur le même PC. Cyber Pinball garde tout dans sa racine et lance sa propre copie de
// VPX avec son propre VPinballX.ini ; ce qui reste commun, ce sont quelques réglages de
// Windows (orientation d'un écran, barres des tâches) et les écrans eux-mêmes. Règles :
// 1. ne remettre que ce que Cyber Pinball a lui-même changé (barres des tâches) ;
// 2. prévenir avant de changer un réglage que l'autre menu utilise aussi (orientation) ;
// 3. ne pas se disputer les écrans, le DMD et les boutons avec un menu déjà ouvert.
// La liste des réglages de Windows que Cyber Pinball modifie est WINDOWS_CHANGES ; un
// test refuse tout autre appel qui en modifierait un.

import * as fs from 'node:fs';
import { formatList } from './i18n';
import { knownInstallations } from './mediaimport';

export type OtherFrontendId = 'popper' | 'pinballx' | 'pinbally';

export interface OtherFrontend {
  id: OtherFrontendId;
  name: string;
  /** Exécutables qui, ouverts, montrent que ce menu tourne (sans casse). */
  processes: string[];
}

/**
 * Menus de borne connus. PinUpPlayer.exe n'y est pas : c'est le lecteur des PuP-Packs,
 * lancé par les tables en mode classique, pas le menu.
 */
export const OTHER_FRONTENDS: OtherFrontend[] = [
  { id: 'popper', name: 'PinUP Popper', processes: ['PinUpMenu.exe', 'PinUpDisplay.exe'] },
  { id: 'pinballx', name: 'PinballX', processes: ['PinballX.exe'] },
  { id: 'pinbally', name: 'PinballY', processes: ['PinballY.exe'] },
];

/** Menus ouverts, d'après les noms des processus en cours. */
export function runningFrontends(processNames: string[]): OtherFrontend[] {
  const open = new Set(processNames.map((n) => n.toLowerCase()));
  return OTHER_FRONTENDS.filter((f) => f.processes.some((p) => open.has(p.toLowerCase())));
}

/**
 * Menus simulés pour les essais sans opérateur : CYBERPINBALL_AUTRES_MENUS, noms
 * d'exécutables séparés par des virgules (« PinUpMenu.exe »). Fichier présent à côté,
 * CYBERPINBALL_AUTRES_MENUS_FICHIER : le menu se ferme quand on supprime le fichier.
 */
export function simulatedProcessNames(env: NodeJS.ProcessEnv, exists: (file: string) => boolean): string[] | undefined {
  const names = env.CYBERPINBALL_AUTRES_MENUS;
  if (names === undefined) return undefined;
  const file = env.CYBERPINBALL_AUTRES_MENUS_FICHIER;
  if (file && !exists(file)) return [];
  return names.split(',').map((n) => n.trim()).filter(Boolean);
}

/**
 * Menus simulés comme installés (pas ouverts) : CYBERPINBALL_AUTRES_MENUS_INSTALLES, noms
 * d'exécutables séparés par des virgules. undefined : pas de simulation.
 */
export function simulatedInstalledFrontends(env: NodeJS.ProcessEnv): OtherFrontend[] | undefined {
  const names = env.CYBERPINBALL_AUTRES_MENUS_INSTALLES;
  return names === undefined ? undefined : runningFrontends(names.split(',').map((n) => n.trim()));
}

/** « PinUP Popper », « PinUP Popper et PinballX » (« and » en anglais). */
export function frontendNames(frontends: { name: string }[]): string {
  return formatList([...new Set(frontends.map((f) => f.name))]);
}

/** Exécutables des menus à leurs emplacements par défaut, par lecteur. */
const INSTALLED_EXES: Record<OtherFrontendId, string[]> = {
  popper: ['vPinball\\PinUPSystem\\PinUpMenu.exe', 'PinUPSystem\\PinUpMenu.exe', 'Visual Pinball\\PinUPSystem\\PinUpMenu.exe'],
  pinballx: ['PinballX\\PinballX.exe', 'Program Files (x86)\\PinballX\\PinballX.exe', 'Games\\PinballX\\PinballX.exe'],
  pinbally: ['PinballY\\PinballY.exe', 'Program Files\\PinballY\\PinballY.exe', 'vPinball\\PinballY\\PinballY.exe'],
};

/**
 * Menus installés sur ce PC, d'après leurs emplacements par défaut : l'exécutable, ou les
 * médias que reprend « Reprendre les médias de PinUP Popper / PinballX ».
 */
export function installedFrontends(drives = ['C:', 'D:', 'E:'], exists: (file: string) => boolean = fs.existsSync): OtherFrontend[] {
  const ids = new Set<string>(knownInstallations(drives).map((i) => i.frontend));
  for (const [id, exes] of Object.entries(INSTALLED_EXES)) {
    if (drives.some((d) => exes.some((exe) => exists(`${d}\\${exe}`)))) ids.add(id);
  }
  return OTHER_FRONTENDS.filter((f) => ids.has(f.id));
}

// Barres des tâches masquées pendant une partie

/** Barre des tâches telle que Windows la donne (FindWindowEx). */
export interface TaskbarState {
  handle: bigint;
  className: string;
  visible: boolean;
}

/** Barre masquée par Cyber Pinball. Sans `handle` : témoin d'une version précédente, rangé par classe. */
export interface HiddenTaskbar {
  handle?: bigint;
  className: string;
}

/** Témoin écrit avant de masquer : une ligne « HWND classe » par barre masquée. */
export function taskbarMarkerText(hidden: HiddenTaskbar[]): string {
  return hidden.map((t) => (t.handle === undefined ? t.className : `${t.handle} ${t.className}`)).join('\n');
}

export function parseTaskbarMarker(text: string): HiddenTaskbar[] {
  const found: HiddenTaskbar[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*(?:(\d+)\s+)?(\S+)\s*$/.exec(line);
    if (m) found.push(m[1] ? { handle: BigInt(m[1]), className: m[2]! } : { className: m[2]! });
  }
  return found;
}

/**
 * Barres à réafficher : celles que Cyber Pinball a masquées et qui le sont encore. Une
 * barre déjà masquée avant la partie (par l'autre menu, ou par un réglage de Windows)
 * le reste. Une barre recréée depuis (Explorateur relancé) a un autre HWND : elle est
 * déjà visible. Un témoin sans HWND (version précédente) désigne les barres par classe.
 */
export function taskbarsToRestore(hidden: HiddenTaskbar[], current: TaskbarState[]): TaskbarState[] {
  return current.filter(
    (t) => !t.visible && hidden.some((h) => (h.handle === undefined ? h.className === t.className : h.handle === t.handle)),
  );
}

// Réglages de Windows que Cyber Pinball modifie

export interface WindowsChange {
  /** Ce qui est modifié, tel qu'on le cherche dans le code (appel ou fonction). */
  call: string;
  /** Fichiers (depuis la racine du dépôt) où l'appel est permis. */
  files: string[];
}

/**
 * Tout ce que Cyber Pinball change dans Windows hors de sa racine, et ce que cela fait à un
 * autre menu installé (en commentaire de chaque entrée). Le test de cohabitation
 * cherche ces appels (et ceux de WINDOWS_CHANGE_CALLS) dans le code : un appel ailleurs que
 * dans ses fichiers, ou un nouvel appel qui modifie Windows, le fait échouer.
 */
export const WINDOWS_CHANGES: WindowsChange[] = [
  // Orientation de l’écran du playfield pour la session seulement (rien dans le réglage de Windows) : décidée dans l’assistant, sur Start, confirmée en 15 s, après un avertissement si un autre menu est installé ; redonnée au démarrage, rendue à chaque sortie et au mode bureau (sessionorientation.ts). Le réglage de Windows n’est écrit que pour lui rendre l’orientation qu’une version d’avant le 27/10/2026 y avait laissée, sur Start.
  { call: 'setDisplayOrientation', files: ['app/src/display-orientation.ts'] },
  // Appel Windows de setDisplayOrientation.
  { call: 'ChangeDisplaySettingsExW', files: ['packages/win-displays/src/orientation.ts'] },
  // Barres des tâches masquées pendant une partie, puis seulement celles-là réaffichées ; fenêtres de l’éditeur de VPX masquées.
  { call: 'hideWindow', files: ['app/src/screen-guard.ts', 'app/src/launcher.ts'] },
  // Réaffiche les barres des tâches que Cyber Pinball a masquées (taskbarsToRestore).
  { call: 'showWindowInactive', files: ['app/src/screen-guard.ts'] },
  // Barre des tâches passée devant une fenêtre du menu : rangée juste sous elle, comme l’Explorateur le fait devant une fenêtre plein écran active (taskbarguard.ts). Seulement l’ordre des fenêtres, jamais quand un autre programme a le premier plan ; l’Explorateur la remet devant à la bascule suivante, rien n’est enregistré.
  { call: 'placeWindowBelow', files: ['app/src/screen-guard.ts'] },
  // Raccourcis globaux (SHORTCUTS) : Ctrl+Maj+K pendant une partie, Ctrl+Maj+D en mode bureau ; chacun rendu à la fin.
  { call: 'globalShortcut.register', files: ['app/src/frontend.ts'] },
  // Entrée de « Programmes et fonctionnalités » (HKCU), retirée à la désinstallation.
  { call: 'WriteRegStr', files: ['scripts/installeur/cyberpinball.nsi'] },
  // Même entrée (taille, pas de modification ni de réparation).
  { call: 'WriteRegDWORD', files: ['scripts/installeur/cyberpinball.nsi'] },
  // Raccourci dans le dossier Démarrage de la session, seulement si l’option est cochée (décochée par défaut) ; deux menus lancés à l’ouverture de session se disputeraient les écrans.
  { call: '$DemarrageDir', files: ['scripts/installeur/cyberpinball.nsi'] },
  // Retrait de cette entrée à la désinstallation.
  { call: 'DeleteRegKey', files: ['scripts/installeur/cyberpinball.nsi'] },
];

/**
 * Appels qui modifieraient Windows et n'ont aucune place dans Cyber Pinball : registre
 * (hors installeur), son par défaut, lancement à l'ouverture de session par l'application,
 * paramètres système, processus arrêtés par leur nom.
 */
export const FORBIDDEN_WINDOWS_CALLS: string[] = [
  'RegSetValue',
  'RegCreateKey',
  'RegDeleteKey',
  'RegDeleteValue',
  'reg add',
  'reg delete',
  'SetDefaultEndpoint',
  'IPolicyConfig',
  'setLoginItemSettings',
  'SystemParametersInfo',
  'SetDisplayConfig',
  'taskkill /IM',
  "'/IM'",
  'powercfg',
  'bcdedit',
  'schtasks',
];
