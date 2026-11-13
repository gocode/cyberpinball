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

// Barres des tâches masquées pour toute la session : la borne lancée au démarrage de Windows

/**
 * Moment où Cyber Pinball rendrait les barres qu'il a masquées : fin d'une partie, écran noir
 * d'une action d'alimentation, démarrage après un arrêt brutal (témoin trouvé), relève par un
 * nouveau processus (menu ↔ assistant, langue), passage au bureau Windows, fermeture.
 */
export type TaskbarRestoreMoment = 'game-end' | 'power' | 'start' | 'relay' | 'desktop' | 'quit';

/**
 * Borne lancée au démarrage de Windows (« Lancer au démarrage », réglage enregistré ou raccourci
 * du dossier Démarrage posé par l'installeur), ou à la place du bureau : les barres des tâches
 * n'ont rien à faire à l'écran tant que le menu est là. Signalement du 06/11/2026 : au démarrage
 * en mode borne, les barres restaient visibles par-dessus le menu.
 */
export function cabinetHidesTaskbars(facts: { settingsMode?: 'shell' | 'startup'; dedicated: boolean; startupShortcut: boolean }): boolean {
  return facts.settingsMode !== undefined || facts.dedicated || facts.startupShortcut;
}

/**
 * Les barres masquées reviennent-elles à ce moment ? Hors borne, toujours (elles ne sont
 * masquées que le temps d'une partie). En borne, seulement quand l'utilisateur retourne sur
 * Windows : bureau (menu ou raccourci) ou fermeture de Cyber Pinball. À une relève ou au
 * démarrage après un arrêt brutal, le nouveau processus les reprend telles quelles, sans
 * qu'elles se montrent entre les deux.
 */
export function restoresTaskbarsAt(moment: TaskbarRestoreMoment, cabinet: boolean): boolean {
  if (!cabinet) return true;
  return moment === 'desktop' || moment === 'quit';
}

/** Ce que le secours des barres surveille : le processus, son exécutable, le témoin des barres masquées. */
export interface TaskbarRescue {
  pid: number;
  exe: string;
  marker: string;
}

/** Délai entre la fin de Cyber Pinball et le secours : le temps qu'une relève ou une mise à jour relance l'application. */
export const TASKBAR_RESCUE_DELAY_S = 8;

function psQuote(text: string): string {
  return `'${text.replace(/'/g, "''")}'`;
}

/**
 * Secours des barres des tâches (PowerShell caché, lancé au premier masquage) : quand Cyber
 * Pinball s'arrête sans les avoir rendues (plantage, arrêt forcé), et qu'aucun Cyber Pinball ne
 * l'a relayé, il réaffiche celles que désigne le témoin, puis le retire. Sans lui, une borne
 * lancée au démarrage (fond noir, icônes masquées) resterait sans barre des tâches jusqu'au
 * prochain lancement. Une fermeture normale retire le témoin : le secours n'a rien à faire.
 */
export function taskbarRescueScript(r: TaskbarRescue): string {
  return [
    "$ErrorActionPreference = 'SilentlyContinue'",
    `$p = Get-Process -Id ${Math.trunc(r.pid)}`,
    'if ($p) { $p.WaitForExit() }',
    `Start-Sleep -Seconds ${TASKBAR_RESCUE_DELAY_S}`,
    `$marker = ${psQuote(r.marker)}`,
    'if (-not (Test-Path -LiteralPath $marker)) { exit }',
    `$exe = ${psQuote(r.exe)}`,
    'if (Get-Process | Where-Object { $_.Path -eq $exe }) { exit }',
    "Add-Type -Namespace CyberPinball -Name Barres -MemberDefinition '[DllImport(\"user32.dll\")] public static extern bool ShowWindow(IntPtr h, int c); [DllImport(\"user32.dll\")] public static extern bool IsWindow(IntPtr h);'",
    // SW_SHOWNA (8) : réaffichée sans être activée.
    'foreach ($line in Get-Content -LiteralPath $marker) { if ($line -match \'^\\s*(\\d+)\\s\') { $h = [IntPtr][Int64]$Matches[1]; if ([CyberPinball.Barres]::IsWindow($h)) { [void][CyberPinball.Barres]::ShowWindow($h, 8) } } }',
    'Remove-Item -LiteralPath $marker -Force',
  ].join('\n');
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
  // Barres des tâches masquées pendant une partie, puis seulement celles-là réaffichées ; fenêtres de l’éditeur de VPX masquées. Seulement des fenêtres de VPX ou de l’Explorateur, rien d’enregistré. (La fenêtre du DMD de VPX n’est jamais masquée : VPX la remontrerait ; « Position du DMD » la range hors des écrans, in-game-menu.ts.)
  { call: 'hideWindow', files: ['app/src/screen-guard.ts', 'app/src/launcher.ts'] },
  // Réaffiche les barres des tâches que Cyber Pinball a masquées (taskbarsToRestore).
  { call: 'showWindowInactive', files: ['app/src/screen-guard.ts'] },
  // Borne lancée au démarrage de Windows (06/11/2026) : les barres des tâches restent masquées toute la session, rendues au bureau Windows (menu ou Ctrl+Maj+D) et à la fermeture (restoresTaskbarsAt). Si Cyber Pinball s’arrête sans les rendre, un PowerShell caché les réaffiche d’après le témoin (taskbarRescueScript) ; rien d’enregistré.
  { call: 'taskbarRescueScript', files: ['app/src/screen-guard.ts'] },
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
  // Réglages de Windows du compte de la borne (02/11/2026, windowssettings.ts), seulement à l’action choisie dans « Borne dédiée » ou « Lancement au démarrage », décochés par défaut : stratégie « Interface utilisateur personnalisée » (Shell) du compte, raccourci du dossier Démarrage, fond d’écran, couleur de fond, icônes du bureau masquées. Chacun est relevé avant d’être écrit (la sauvegarde) et remis tel quel à la désactivation, vérifié. Un autre menu lancé lui aussi à l’ouverture de session se disputerait les écrans : l’écran le signale avant d’activer.
  { call: 'Sys-Set', files: ['packages/core/src/windowssettings.ts'] },
  // Tâche planifiée « Cyber Pinball pare-feu » (01/11/2026) : enregistrée sous l’autorisation de Windows donnée dans « Partage et réseau », sans déclencheur (jamais à l’ouverture de session), elle ne fait que reposer les deux règles du pare-feu de Cyber Pinball (firewall.ts). Aucun effet sur un autre menu.
  { call: 'Register-ScheduledTask', files: ['packages/core/src/firewall.ts'] },
  // La même tâche : ses arguments (firewall.ts), cherchée et lancée par l’application quand une règle manque, retirée à la désinstallation.
  { call: 'schtasks', files: ['packages/core/src/firewall.ts', 'app/src/firewall-rule.ts', 'scripts/installeur/cyberpinball.nsi'] },
];

/**
 * Appels qui modifieraient Windows et n'ont aucune place dans Cyber Pinball : registre
 * (hors installeur), son par défaut, lancement à l'ouverture de session par l'application
 * (y compris par une tâche planifiée qui aurait un déclencheur), paramètres système, processus
 * arrêtés par leur nom.
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
  // Une tâche planifiée qui démarrerait quoi que ce soit d’elle-même (ouverture de session, horaire) : la seule permise n’a aucun déclencheur.
  'New-ScheduledTaskTrigger',
  '/sc onlogon',
  '/create /tn',
];
