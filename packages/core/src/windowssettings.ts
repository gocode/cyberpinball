// Réglages de Windows de la borne, pour toutes les éditions (Pro et Famille comprises, où
// Shell Launcher n'existe pas) : deux façons d'ouvrir la session sur Cyber Pinball, au choix,
// toujours pour le compte de la borne seulement.
// - « shell » : Cyber Pinball à la place de l'Explorateur, par le réglage « Interface
//   utilisateur personnalisée » du compte (stratégie Shell, HKCU\…\Policies\System). Il lance
//   le surveillant (SUPERVISOR_FLAG), qui relance Cyber Pinball s'il se ferme, comme Shell
//   Launcher. Écrire une stratégie demande l'autorisation de Windows (UAC).
// - « startup » : un raccourci dans le dossier Démarrage du compte (le même que la case de
//   l'installeur), le bureau masqué derrière : fond noir uni, icônes cachées. Sans UAC.
//
// Sauvegarde : avant la première écriture, le script relève chaque réglage qu'il va changer ;
// ce relevé (la référence) est enregistré, et la désactivation le remet tel quel, valeur
// absente comprise, puis le vérifie. Une écriture qui échoue en route remet aussitôt l'état
// d'avant (même script). Le script de secours fait la même remise hors de Cyber Pinball.
//
// Comme dedicated.ts : ce module écrit le script et juge ses résultats ; les appels à Windows
// sont dans une couche système (Sys-*) que les tests remplacent par une couche simulée, et
// simulateSettingsRun rejoue la même logique en TypeScript pour les démonstrations hors écran.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { dedicatedDir, HANDOVER_EXIT_CODE } from './dedicated';
import { t } from './i18n';
import { readJsonFile } from './store';

/** Option du surveillant : c'est lui que Windows lance comme shell ; il lance Cyber Pinball avec DEDICATED_FLAG. */
export const SUPERVISOR_FLAG = '--borne-compte';
/** Nom du raccourci du dossier Démarrage, le même que celui de l'installeur (PRODUIT.lnk). */
export const STARTUP_SHORTCUT = 'Cyber Pinball.lnk'; // i18n-ignore : nom de fichier

/** Réglages que Cyber Pinball peut changer, dans l'ordre d'écriture. */
export const SETTING_KEYS = ['shell', 'startup', 'wallpaper', 'background', 'icons'] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];
/** Valeur d'un réglage ; null : absent (pas de valeur dans le registre, pas de raccourci). */
export type WindowsSettingValue = string | number | null;
export type SettingsSnapshot = Partial<Record<SettingKey, WindowsSettingValue>>;

export type CabinetMode = 'shell' | 'startup';

/** Une ligne de commande : l'exécutable entre guillemets s'il contient un espace, puis les arguments. */
export function commandLine(command: string[]): string {
  return command.map((part) => (/[\s"]/.test(part) ? `"${part.replace(/"/g, '\\"')}"` : part)).join(' ');
}

/** Ce que chaque façon écrit dans Windows. */
export function wantedSettings(mode: CabinetMode, command: string[]): SettingsSnapshot {
  if (mode === 'shell') return { shell: commandLine([...command, SUPERVISOR_FLAG]) };
  // Fond d'écran vide : Windows peint la couleur de fond (noir) ; icônes du bureau masquées.
  return { startup: commandLine(command), wallpaper: '', background: '0 0 0', icons: 1 };
}

/** Les deux façons, ce qu'il faut changer pour défaire ce qui est en place sans enregistrement. */
export function modeOf(snapshot: SettingsSnapshot): CabinetMode | undefined {
  if (typeof snapshot.shell === 'string' && /cyberpinball/i.test(snapshot.shell)) return 'shell';
  if (typeof snapshot.startup === 'string' && snapshot.startup) return 'startup';
  return undefined;
}

/** Sorties rapprochées au-delà desquelles le surveillant cesse de relancer Cyber Pinball. */
export const SUPERVISOR_LOOP_LIMIT = 5;
export const SUPERVISOR_LOOP_MS = 120_000;

/**
 * Ce que fait le surveillant à une sortie de Cyber Pinball : le relancer (fermeture, plantage),
 * s'arrêter (mise à jour : HANDOVER_EXIT_CODE), ou ouvrir l'Explorateur (plantages en boucle).
 * `exits` : heures des sorties, la dernière comprise.
 */
export function supervisorVerdict(code: number | null, exits: number[], now: number): 'relaunch' | 'stop' | 'explorer' {
  if (code === HANDOVER_EXIT_CODE) return 'stop';
  return exits.filter((at) => now - at < SUPERVISOR_LOOP_MS).length >= SUPERVISOR_LOOP_LIMIT ? 'explorer' : 'relaunch';
}

/** Ce que le script doit faire : relever, puis écrire `want` (rien s'il est vide). */
export interface SettingsRun {
  sid: string;
  /** Dossier Démarrage du compte de la borne (celui de la session, pas celui d'un administrateur). */
  startupDir: string;
  want: SettingsSnapshot;
}

/** Ce que rend le script (fichier JSON). */
export interface SettingsOutcome {
  status: 'done' | 'failed';
  before?: SettingsSnapshot;
  after?: SettingsSnapshot;
  error?: string;
  /** L'écriture a échoué en route : l'état d'avant a été remis. */
  rolledBack?: boolean;
  rollbackError?: string;
  log?: string[];
}

/** La stratégie Shell n'est modifiable qu'en administrateur : toute écriture qui la touche passe par l'UAC. */
export function needsElevation(want: SettingsSnapshot): boolean {
  return 'shell' in want;
}

// ---------------------------------------------------------------------------
// Jugement

function same(a: WindowsSettingValue | undefined, b: WindowsSettingValue | undefined): boolean {
  if (a === null || a === undefined || b === null || b === undefined) return (a ?? null) === (b ?? null);
  return String(a).toLowerCase() === String(b).toLowerCase();
}

export interface SettingDifference {
  key: SettingKey;
  expected: WindowsSettingValue;
  actual: WindowsSettingValue;
}

/** Réglages de `want` que `after` ne montre pas (tous si `after` manque). */
export function settingsDifferences(want: SettingsSnapshot, after: SettingsSnapshot | undefined): SettingDifference[] {
  return SETTING_KEYS.filter((k) => k in want && !same(want[k], after?.[k])).map((k) => ({ key: k, expected: want[k] ?? null, actual: after?.[k] ?? null }));
}

/** Référence d'une installation : l'état d'avant, pour les seuls réglages qu'elle change. */
export function referenceFor(want: SettingsSnapshot, before: SettingsSnapshot): SettingsSnapshot {
  return Object.fromEntries(SETTING_KEYS.filter((k) => k in want).map((k) => [k, before[k] ?? null]));
}

// ---------------------------------------------------------------------------
// Enregistrement : la sauvegarde

/** Réglages installés par Cyber Pinball (dossier borne-dediee des données). */
export interface SettingsRecord {
  version: 1;
  mode: CabinetMode;
  sid: string;
  user: string;
  /** Dossier Démarrage du compte, tel qu'à l'installation (le script élevé ne le retrouverait pas). */
  startupDir: string;
  want: SettingsSnapshot;
  /** La sauvegarde : chaque réglage changé, tel qu'il était avant. */
  reference: SettingsSnapshot;
  at: string;
}

const SETTINGS_FILE = 'reglages-windows.json';

export function loadSettingsRecord(dataDir: string): SettingsRecord | undefined {
  const file = path.join(dedicatedDir(dataDir), SETTINGS_FILE);
  if (!fs.existsSync(file)) return undefined;
  try {
    const record = readJsonFile(file) as SettingsRecord;
    return record?.version === 1 && (record.mode === 'shell' || record.mode === 'startup') && record.reference && record.want ? record : undefined;
  } catch {
    return undefined;
  }
}

export function saveSettingsRecord(dataDir: string, record: SettingsRecord): void {
  fs.mkdirSync(dedicatedDir(dataDir), { recursive: true });
  fs.writeFileSync(path.join(dedicatedDir(dataDir), SETTINGS_FILE), JSON.stringify(record, null, 2) + '\n', 'utf8');
}

export function removeSettingsRecord(dataDir: string): void {
  fs.rmSync(path.join(dedicatedDir(dataDir), SETTINGS_FILE), { force: true });
}

/** Script de secours : remet la sauvegarde, hors de Cyber Pinball. */
export function settingsRescueFile(dataDir: string): string {
  return path.join(dedicatedDir(dataDir), 'retablir-reglages.ps1');
}

/** Résultat du script de secours : l'application le relit pour oublier l'installation. */
export function settingsRescueResultFile(dataDir: string): string {
  return path.join(dedicatedDir(dataDir), 'resultat-retablir.json');
}

/** Témoin du surveillant : l'heure de son dernier départ (la session a bien démarré sur lui). */
export function supervisorMarkerFile(dataDir: string): string {
  return path.join(dedicatedDir(dataDir), 'surveillant.json');
}

// ---------------------------------------------------------------------------
// Libellés

export function settingLabel(key: SettingKey, user: string): string {
  switch (key) {
    case 'shell':
      return t('Interface utilisateur du compte « {user} »', { user });
    case 'startup':
      return t('Lancement au démarrage de Windows');
    case 'wallpaper':
      return t('Fond d’écran du bureau');
    case 'background':
      return t('Couleur de fond du bureau');
    case 'icons':
      return t('Icônes du bureau');
  }
}

export function settingValueLabel(key: SettingKey, value: WindowsSettingValue | undefined): string {
  if (value === null || value === undefined) {
    if (key === 'shell') return t('Explorateur Windows (aucun réglage)');
    if (key === 'startup') return t('non');
    if (key === 'icons') return t('affichées');
    return t('réglage de Windows');
  }
  switch (key) {
    case 'shell':
      return path.win32.basename(/^"([^"]+)"/.exec(String(value))?.[1] ?? String(value).split(/\s+/)[0] ?? String(value));
    case 'startup':
      return t('oui');
    case 'wallpaper':
      return value === '' ? t('aucun') : path.win32.basename(String(value));
    case 'background':
      return value === '0 0 0' ? t('noir') : String(value);
    case 'icons':
      return Number(value) ? t('masquées') : t('affichées');
  }
}

// ---------------------------------------------------------------------------
// Script

function psString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Couche système réelle : la stratégie Shell, le fond et les icônes du bureau dans la ruche du
 * compte (HKEY_USERS\<SID> : la même, que le script tourne dans la session ou en administrateur),
 * et le raccourci du dossier Démarrage.
 */
export const REAL_SETTINGS_LAYER = String.raw`# i18n-ignore : script PowerShell
$Hive = "Registry::HKEY_USERS\$Sid"
$Values = @{
  shell = @{ key = "$Hive\Software\Microsoft\Windows\CurrentVersion\Policies\System"; name = 'Shell'; kind = 'String' }
  wallpaper = @{ key = "$Hive\Control Panel\Desktop"; name = 'WallPaper'; kind = 'String' }
  background = @{ key = "$Hive\Control Panel\Colors"; name = 'Background'; kind = 'String' }
  icons = @{ key = "$Hive\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced"; name = 'HideIcons'; kind = 'DWord' }
}
$Shortcut = Join-Path $StartupDir 'Cyber Pinball.lnk'
function Sys-Get([string]$k) {
  if ($k -eq 'startup') {
    if (-not (Test-Path -LiteralPath $Shortcut)) { return $null }
    $l = (New-Object -ComObject WScript.Shell).CreateShortcut($Shortcut)
    $q = $(if ($l.TargetPath -match '\s') { '"' + $l.TargetPath + '"' } else { $l.TargetPath })
    if ($l.Arguments) { return "$q $($l.Arguments)" } else { return $q }
  }
  $v = $Values[$k]
  $p = Get-ItemProperty -LiteralPath $v.key -Name $v.name -ErrorAction SilentlyContinue
  if ($null -eq $p) { return $null }
  if ($v.kind -eq 'DWord') { [int]$p.($v.name) } else { "$($p.($v.name))" }
}
function Sys-Set([string]$k, $value) {
  if ($k -eq 'startup') {
    if ($null -eq $value) { Remove-Item -LiteralPath $Shortcut -Force; return }
    $m = [regex]::Match([string]$value, '^\s*(?:"([^"]+)"|(\S+))\s*(.*)$')
    $target = $(if ($m.Groups[1].Success) { $m.Groups[1].Value } else { $m.Groups[2].Value })
    New-Item -ItemType Directory -Force -Path $StartupDir | Out-Null
    $l = (New-Object -ComObject WScript.Shell).CreateShortcut($Shortcut)
    $l.TargetPath = $target; $l.Arguments = $m.Groups[3].Value; $l.WorkingDirectory = (Split-Path -Parent $target); $l.IconLocation = "$target,0"; $l.Save()
    return
  }
  $v = $Values[$k]
  if ($null -eq $value) { Remove-ItemProperty -LiteralPath $v.key -Name $v.name -ErrorAction SilentlyContinue; return }
  if (-not (Test-Path -LiteralPath $v.key)) { New-Item -Path $v.key -Force | Out-Null }
  $typed = $(if ($v.kind -eq 'DWord') { [int]$value } else { [string]$value })
  New-ItemProperty -LiteralPath $v.key -Name $v.name -Value $typed -PropertyType $v.kind -Force | Out-Null
}
function Sys-End {}
`;

/** Logique du script, la même quelle que soit la couche système. Journal en anglais. */
const SETTINGS_LOGIC = String.raw`# i18n-ignore : script PowerShell
$Keys = @('shell', 'startup', 'wallpaper', 'background', 'icons')
$Log = New-Object System.Collections.Generic.List[string]
function Note([string]$text) { $Log.Add($text) }
function Same($a, $b) { if ($null -eq $a -or $null -eq $b) { return ($null -eq $a) -and ($null -eq $b) }; "$a" -eq "$b" }
function Snapshot { $s = [ordered]@{}; foreach ($k in $Keys) { $s[$k] = Sys-Get $k }; $s }
function Apply($want, $from) {
  foreach ($k in $Keys) {
    if (-not ($want.PSObject.Properties.Name -contains $k)) { continue }
    $v = $want.$k
    if (Same (Sys-Get $k) $v) { continue }
    Sys-Set $k $v
    if ($null -eq $v) { Note "removed $k" } else { Note "set $($k): $v" }
  }
}
$Outcome = [ordered]@{ status = 'failed'; log = $Log }
try {
  $Outcome.before = Snapshot
  Apply $Want
  $Outcome.status = 'done'
} catch {
  $Outcome.error = "$($_.Exception.Message)"
  Note "error: $($Outcome.error)"
  if ($null -ne $Outcome.before) {
    try {
      $back = [pscustomobject]@{}
      foreach ($k in $Keys) { if ($Want.PSObject.Properties.Name -contains $k) { $back | Add-Member -NotePropertyName $k -NotePropertyValue $Outcome.before[$k] } }
      Apply $back
      $Outcome.rolledBack = $true; Note 'rolled back'
    } catch { $Outcome.rollbackError = "$($_.Exception.Message)"; Note "rollback error: $($Outcome.rollbackError)" }
  }
}
try { $Outcome.after = Snapshot } catch { Note "final snapshot: $($_.Exception.Message)" }
Sys-End
[System.IO.File]::WriteAllText($ResultFile, ($Outcome | ConvertTo-Json -Depth 6), (New-Object System.Text.UTF8Encoding $false))
`;

/** Script PowerShell d'un relevé (want vide), d'une installation ou d'une remise ; résultat dans `resultFile`. */
export function settingsScript(run: SettingsRun, resultFile: string, layer = REAL_SETTINGS_LAYER): string {
  const values = [
    '# Cyber Pinball : réglages de Windows de la borne. Script généré ; résultat dans le fichier ci-dessous.', // i18n-ignore : commentaire du script
    "$ErrorActionPreference = 'Stop'",
    `$Sid = ${psString(run.sid)}`,
    `$StartupDir = ${psString(run.startupDir)}`,
    `$ResultFile = ${psString(resultFile)}`,
    `$Want = (ConvertFrom-Json @'\n${JSON.stringify(run.want)}\n'@)`,
  ];
  return [...values, layer.trim(), SETTINGS_LOGIC.trim(), ''].join('\r\n');
}

/** Résultat écrit par le script ; undefined s'il manque ou ne se lit pas. */
export function readSettingsOutcome(file: string): SettingsOutcome | undefined {
  try {
    const outcome = readJsonFile(file) as SettingsOutcome;
    if (!outcome || (outcome.status !== 'done' && outcome.status !== 'failed')) return undefined;
    // ConvertTo-Json de Windows PowerShell : un journal vide sort en {}, une seule ligne en chaîne.
    const log = Array.isArray(outcome.log) ? outcome.log : typeof outcome.log === 'string' ? [outcome.log] : [];
    return { ...outcome, log };
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Windows simulé

export interface SimulatedSettings {
  values: Record<SettingKey, WindowsSettingValue>;
  /** Réglage dont l'écriture échoue (essai du retour en arrière). */
  failOn?: SettingKey;
}

/** Un compte tel que Windows le crée : rien de Cyber Pinball, fond d'écran de Windows, icônes affichées. */
export function freshSettings(): SimulatedSettings {
  return { values: { shell: null, startup: null, wallpaper: 'C:\\Windows\\web\\wallpaper\\Windows\\img0.jpg', background: '0 0 0', icons: null } }; // i18n-ignore : chemin
}

/** Rejoue le script sur un Windows simulé (même logique que SETTINGS_LOGIC, vérifié par windowssettings.test.ts). */
export function simulateSettingsRun(start: SimulatedSettings, run: SettingsRun): { windows: SimulatedSettings; outcome: SettingsOutcome } {
  const w: SimulatedSettings = JSON.parse(JSON.stringify(start));
  const log: string[] = [];
  const snapshot = (): SettingsSnapshot => Object.fromEntries(SETTING_KEYS.map((k) => [k, w.values[k] ?? null]));
  const apply = (want: SettingsSnapshot) => {
    for (const k of SETTING_KEYS) {
      if (!(k in want)) continue;
      const v = want[k] ?? null;
      if (same(w.values[k], v)) continue;
      if (w.failOn === k) throw new Error(`${k} failed (simulated)`);
      w.values[k] = v;
      log.push(v === null ? `removed ${k}` : `set ${k}: ${v}`);
    }
  };
  const outcome: SettingsOutcome = { status: 'failed', log };
  try {
    outcome.before = snapshot();
    apply(run.want);
    outcome.status = 'done';
  } catch (error) {
    outcome.error = (error as Error).message;
    log.push(`error: ${outcome.error}`);
    try {
      apply(referenceFor(run.want, outcome.before!));
      outcome.rolledBack = true;
      log.push('rolled back');
    } catch (rollback) {
      outcome.rollbackError = (rollback as Error).message;
      log.push(`rollback error: ${outcome.rollbackError}`);
    }
  }
  outcome.after = snapshot();
  return { windows: w, outcome };
}
