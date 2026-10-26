// Borne dédiée : Cyber Pinball à la place de l'Explorateur comme shell de Windows, pour le
// compte de la borne seulement (Shell Launcher, Windows Entreprise, Éducation et IoT Enterprise).
// Le bureau ne se voit plus jamais, même pendant les 1 à 2 s du démarrage de l'application.
//
// Désactivée par défaut : rien n'est écrit dans Windows tant que l'utilisateur ne l'active pas
// lui-même (menu système > Borne > « Borne dédiée »). Toute écriture passe par UN script
// PowerShell, lancé avec l'autorisation de Windows (UAC), qui :
//   1. relève l'état de Windows (fonctions facultatives, réglages de Shell Launcher, valeur
//      Shell de Winlogon, que SetEnabled réécrit) ;
//   2. applique (activation) ou remet l'état d'avant (désactivation) ;
//   3. relève de nouveau l'état, que l'application compare à ce qu'elle attendait.
// Une activation qui échoue en route remet aussitôt l'état d'avant (même script).
//
// Ce module ne fait qu'écrire ce script et juger ses résultats. Les appels à Windows y sont
// regroupés dans une « couche système » (fonctions Sys-*) que les tests remplacent par une
// couche simulée en mémoire : la logique du script tourne pour de vrai, sans rien toucher.
// simulateRun rejoue la même logique en TypeScript, pour les démonstrations hors écran.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { readJsonFile } from './store';
import { t } from './i18n';

/** Fonctions facultatives de Windows, dans l'ordre d'activation (la seconde dépend de la première). */
export const SHELL_FEATURES = ['Client-DeviceLockdown', 'Client-EmbeddedShellLauncher'] as const;
export type ShellFeature = (typeof SHELL_FEATURES)[number];
/** État d'une fonction (Get-WindowsOptionalFeature) : Enabled, Disabled, EnablePending, DisablePending… ou Absent. */
export type FeatureState = string;

/** Option de la ligne de commande que Shell Launcher donne à Cyber Pinball : c'est lui qui le surveille. */
export const DEDICATED_FLAG = '--borne-dediee';
/** Variable d'environnement d'une session dont Cyber Pinball est le shell ; héritée par les relances. */
export const DEDICATED_SESSION_ENV = 'CYBERPINBALL_BORNE_DEDIEE';
/** Code de sortie pour lequel Shell Launcher ne relance rien : une mise à jour relance elle-même Cyber Pinball. */
export const HANDOVER_EXIT_CODE = 77;
/** Actions de Shell Launcher à la sortie du shell (WESL_UserSetting). */
export const SHELL_ACTION = { restartShell: 0, restartDevice: 1, shutdownDevice: 2, doNothing: 3 } as const;
export const EXPLORER = 'explorer.exe';
/** Shell de Winlogon que pose la simulation quand Shell Launcher est en service (le vrai dépend de Windows). */
export const SIMULATED_LAUNCHER_HOST = 'C:\\Windows\\System32\\eshell.exe'; // i18n-ignore : chemin

/** Réglage de Shell Launcher pour un compte (SetCustomShell). */
export interface ShellSetting {
  shell: string;
  defaultAction: number;
  returnCodes: number[];
  returnActions: number[];
}

export interface DefaultShell {
  shell: string;
  defaultAction: number;
}

/**
 * État de Windows relevé par le script. Les champs de Shell Launcher (enabled, defaultShell,
 * custom) n'existent que si sa classe WMI répond : fonctions activées, sans redémarrage attendu.
 */
export interface ShellSnapshot {
  features: Record<string, FeatureState>;
  /** Valeur Shell de HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon ; null : absente. */
  winlogonShell: string | null;
  enabled?: boolean;
  defaultShell?: DefaultShell | null;
  /** Réglage du compte ; null : aucun. */
  custom?: ShellSetting | null;
}

/** Ce que l'application demande au script élevé. */
export type ElevatedRun =
  | { kind: 'activate'; sid: string; setting: ShellSetting }
  | { kind: 'deactivate'; sid: string; reference: ShellSnapshot };

/** Ce que le script élevé rend (fichier JSON). */
export interface ElevatedOutcome {
  kind: 'activate' | 'deactivate';
  /** done : fait ; restart : fonctions activées, Windows doit redémarrer avant la suite ; failed : erreur. */
  status: 'done' | 'restart' | 'failed';
  before?: ShellSnapshot;
  /** Activation : réglages de Shell Launcher tels qu'ils étaient juste après l'activation des fonctions. */
  weslBefore?: ShellSnapshot;
  /** Désactivation : état une fois les réglages remis, avant de désactiver les fonctions (après quoi WMI ne répond plus). */
  settled?: ShellSnapshot;
  after?: ShellSnapshot;
  restartNeeded?: boolean;
  /** Code de l'erreur (absent-features…) ou message de Windows. */
  error?: string;
  /** L'activation a échoué en route : l'état d'avant a été remis. */
  rolledBack?: boolean;
  rollbackError?: string;
  log?: string[];
}

// ---------------------------------------------------------------------------
// Ligne de commande et session

/** Commande que Shell Launcher lance pour le compte : l'exécutable, puis l'option de la borne dédiée. */
export function shellSettingFor(command: string[]): ShellSetting {
  const quoted = command.map((part) => (/[\s"]/.test(part) ? `"${part.replace(/"/g, '\\"')}"` : part));
  return {
    shell: [...quoted, DEDICATED_FLAG].join(' '),
    defaultAction: SHELL_ACTION.restartShell,
    returnCodes: [HANDOVER_EXIT_CODE],
    returnActions: [SHELL_ACTION.doNothing],
  };
}

/** Retire l'option de la borne dédiée des arguments : les relances et les mises à jour ne la transmettent pas. */
export function takeDedicatedFlag(argv: string[]): { argv: string[]; launched: boolean } {
  return { argv: argv.filter((a) => a !== DEDICATED_FLAG), launched: argv.includes(DEDICATED_FLAG) };
}

/** Dossier de la borne dédiée dans les données : état, script de secours, résultats. */
export function dedicatedDir(dataDir: string): string {
  return path.join(dataDir, 'borne-dediee');
}

const RELAUNCH_FILE = 'relance.json';
/** Au-delà, une relance demandée n'est plus la nôtre (session rouverte bien plus tard). */
const RELAUNCH_FRESH_MS = 60_000;

/**
 * Relance d'un Cyber Pinball surveillé par Shell Launcher : il note ses arguments (assistant,
 * étape…) puis se ferme ; Shell Launcher le relance aussitôt, sous sa surveillance, et le
 * nouveau processus reprend ces arguments (takeShellRelaunch).
 */
export function writeShellRelaunch(dataDir: string, args: string[], now = Date.now()): void {
  fs.mkdirSync(dedicatedDir(dataDir), { recursive: true });
  fs.writeFileSync(path.join(dedicatedDir(dataDir), RELAUNCH_FILE), JSON.stringify({ args, at: now }) + '\n', 'utf8');
}

/** Arguments laissés par la relance précédente, s'ils sont récents ; le fichier est consommé. */
export function takeShellRelaunch(dataDir: string, now = Date.now()): string[] {
  const file = path.join(dedicatedDir(dataDir), RELAUNCH_FILE);
  if (!fs.existsSync(file)) return [];
  try {
    const { args, at } = readJsonFile(file) as { args?: unknown; at?: unknown };
    if (!Array.isArray(args) || typeof at !== 'number' || now - at > RELAUNCH_FRESH_MS || now < at) return [];
    return args.filter((a): a is string => typeof a === 'string' && a !== DEDICATED_FLAG);
  } catch {
    return [];
  } finally {
    fs.rmSync(file, { force: true });
  }
}

// ---------------------------------------------------------------------------
// Édition de Windows

/** Shell Launcher n'existe que dans les éditions Entreprise, Éducation et IoT Enterprise (EditionID). */
export function shellLauncherEdition(editionId: string): boolean {
  return /^(Enterprise|Education|IoTEnterprise)/i.test(editionId);
}

/** Nom lisible de l'édition (ProductName dit encore « Windows 10 » sous Windows 11). */
export function windowsEditionLabel(editionId: string, build: number): string {
  const version = build >= 22000 ? 'Windows 11' : 'Windows 10'; // i18n-ignore : nom de produit
  const names: [RegExp, string][] = [
    [/^IoTEnterpriseS/i, 'IoT Enterprise LTSC'],
    [/^IoTEnterprise/i, 'IoT Enterprise'],
    [/^EnterpriseS/i, 'Enterprise LTSC'],
    [/^Enterprise/i, 'Enterprise'],
    [/^Education/i, 'Education'],
    [/^ProfessionalWorkstation/i, 'Pro for Workstations'],
    [/^Professional/i, 'Pro'],
    [/^Core/i, 'Home'],
  ];
  const name = names.find(([pattern]) => pattern.test(editionId))?.[1] ?? editionId;
  return `${version} ${name}`.trim();
}

// ---------------------------------------------------------------------------
// État enregistré

/** Borne dédiée enregistrée par Cyber Pinball (dossier borne-dediee des données). */
export interface DedicatedRecord {
  version: 1;
  sid: string;
  user: string;
  setting: ShellSetting;
  /** active : en place ; restart : fonctions activées, Windows doit redémarrer avant la fin de l'activation. */
  state: 'active' | 'restart';
  /** État de Windows avant la première écriture : la désactivation le remet, puis le vérifie. */
  reference: ShellSnapshot;
  activatedAt: string;
}

const RECORD_FILE = 'etat.json';

export function loadDedicatedRecord(dataDir: string): DedicatedRecord | undefined {
  const file = path.join(dedicatedDir(dataDir), RECORD_FILE);
  if (!fs.existsSync(file)) return undefined;
  try {
    const record = readJsonFile(file) as DedicatedRecord;
    return record?.version === 1 && typeof record.sid === 'string' && record.reference ? record : undefined;
  } catch {
    return undefined;
  }
}

export function saveDedicatedRecord(dataDir: string, record: DedicatedRecord): void {
  fs.mkdirSync(dedicatedDir(dataDir), { recursive: true });
  fs.writeFileSync(path.join(dedicatedDir(dataDir), RECORD_FILE), JSON.stringify(record, null, 2) + '\n', 'utf8');
}

export function removeDedicatedRecord(dataDir: string): void {
  fs.rmSync(path.join(dedicatedDir(dataDir), RECORD_FILE), { force: true });
}

/** Script de secours, prêt à lancer depuis un compte administrateur : remet l'état d'avant. */
export function rescueScriptFile(dataDir: string): string {
  return path.join(dedicatedDir(dataDir), 'desactiver.ps1');
}

/** Résultat du script de secours : l'application le relit pour oublier l'activation. */
export function rescueResultFile(dataDir: string): string {
  return path.join(dedicatedDir(dataDir), 'resultat-secours.json');
}

/**
 * État de référence d'une activation : celui d'avant la première écriture. Les réglages de
 * Shell Launcher, illisibles tant que ses fonctions étaient désactivées, sont pris juste après
 * leur activation (weslBefore). Une activation reprise après un redémarrage garde la référence
 * de la première.
 */
export function referenceOf(outcome: ElevatedOutcome, previous?: ShellSnapshot): ShellSnapshot | undefined {
  const base = previous ?? outcome.before;
  if (!base) return undefined;
  if (base.enabled !== undefined) return base;
  const wesl = previous ? outcome.before?.enabled !== undefined ? outcome.before : outcome.weslBefore : outcome.weslBefore;
  if (!wesl || wesl.enabled === undefined) return base;
  return { ...base, enabled: wesl.enabled, defaultShell: wesl.defaultShell ?? null, custom: wesl.custom ?? null };
}

// ---------------------------------------------------------------------------
// Jugement des résultats

/** État d'une fonction une fois Windows redémarré. */
export function settledFeature(state: FeatureState | undefined): string {
  if (state === 'EnablePending') return 'Enabled';
  if (state === 'DisablePending') return 'Disabled';
  return state ?? 'Absent';
}

export function isExplorer(shell: string | undefined): boolean {
  return /(^|[\\/"\s])explorer(\.exe)?"?$/i.test((shell ?? '').trim());
}

export function sameSetting(a: ShellSetting | null | undefined, b: ShellSetting | null | undefined): boolean {
  if (!a || !b) return !a && !b;
  return (
    a.shell.toLowerCase() === b.shell.toLowerCase() &&
    a.defaultAction === b.defaultAction &&
    a.returnCodes.join(',') === b.returnCodes.join(',') &&
    a.returnActions.join(',') === b.returnActions.join(',')
  );
}

export type SnapshotItem = 'features' | 'enabled' | 'defaultShell' | 'custom' | 'winlogonShell';

export interface SnapshotDifference {
  item: SnapshotItem;
  expected: string;
  actual: string;
}

/** Ce que l'activation devait laisser : fonctions activées, Shell Launcher en service, le réglage du compte, l'Explorateur pour les autres. */
export function activationProblems(after: ShellSnapshot | undefined, setting: ShellSetting): SnapshotDifference[] {
  if (!after) return [{ item: 'features', expected: 'Enabled', actual: '?' }];
  const problems: SnapshotDifference[] = [];
  for (const f of SHELL_FEATURES) if (settledFeature(after.features[f]) !== 'Enabled') problems.push({ item: 'features', expected: `${f} Enabled`, actual: `${f} ${after.features[f] ?? 'Absent'}` });
  if (after.enabled !== true) problems.push({ item: 'enabled', expected: 'true', actual: String(after.enabled) });
  if (!sameSetting(after.custom, setting)) problems.push({ item: 'custom', expected: describeSetting(setting), actual: describeSetting(after.custom) });
  if (!isExplorer(after.defaultShell?.shell)) problems.push({ item: 'defaultShell', expected: EXPLORER, actual: after.defaultShell?.shell ?? '—' });
  return problems;
}

/**
 * Différences entre l'état de référence et l'état après la désactivation, point par point.
 * Les réglages de Shell Launcher sont lus avant la désactivation de ses fonctions (settled) ;
 * les fonctions et la valeur Shell de Winlogon, à la fin (after). Une fonction « en attente du
 * redémarrage » compte pour son état final.
 */
export function restoreDifferences(reference: ShellSnapshot, settled: ShellSnapshot | undefined, after: ShellSnapshot | undefined): SnapshotDifference[] {
  if (!after) return [{ item: 'features', expected: describeFeatures(reference), actual: '?' }];
  const differences: SnapshotDifference[] = [];
  const features = SHELL_FEATURES.filter((f) => settledFeature(reference.features[f]) !== settledFeature(after.features[f]));
  if (features.length) differences.push({ item: 'features', expected: describeFeatures(reference), actual: describeFeatures(after) });
  if ((reference.winlogonShell ?? '').toLowerCase() !== (after.winlogonShell ?? '').toLowerCase()) {
    differences.push({ item: 'winlogonShell', expected: reference.winlogonShell ?? '—', actual: after.winlogonShell ?? '—' });
  }
  if (reference.enabled === undefined) return differences;
  // Shell Launcher en service avant : ses réglages doivent avoir été relus une fois remis.
  if (!settled || settled.enabled === undefined) {
    differences.push({ item: 'enabled', expected: String(reference.enabled), actual: '?' });
    return differences;
  }
  if (settled.enabled !== reference.enabled) differences.push({ item: 'enabled', expected: String(reference.enabled), actual: String(settled.enabled) });
  if (!sameDefault(reference.defaultShell, settled.defaultShell)) differences.push({ item: 'defaultShell', expected: reference.defaultShell?.shell ?? '—', actual: settled.defaultShell?.shell ?? '—' });
  if (!sameSetting(reference.custom, settled.custom)) differences.push({ item: 'custom', expected: describeSetting(reference.custom), actual: describeSetting(settled.custom) });
  return differences;
}

function sameDefault(a: DefaultShell | null | undefined, b: DefaultShell | null | undefined): boolean {
  if (!a || !b) return !a && !b;
  return a.shell.toLowerCase() === b.shell.toLowerCase() && a.defaultAction === b.defaultAction;
}

function describeSetting(setting: ShellSetting | null | undefined): string {
  return setting ? setting.shell : '—';
}

function describeFeatures(snapshot: ShellSnapshot): string {
  return SHELL_FEATURES.map((f) => `${f} ${snapshot.features[f] ?? 'Absent'}`).join(', ');
}

/** Libellé d'un point de l'état de Windows, pour l'écran et le manuel. */
export function snapshotItemLabel(item: SnapshotItem, user: string): string {
  switch (item) {
    case 'features':
      return t('Fonctions de Windows « Shell Launcher »');
    case 'enabled':
      return t('Shell Launcher en service');
    case 'defaultShell':
      return t('Démarrage des autres comptes');
    case 'custom':
      return t('Démarrage du compte « {user} »', { user });
    case 'winlogonShell':
      return t('Réglage général de Windows (Winlogon)');
  }
}

/** Valeur d'un point de l'état de Windows, en clair. */
export function snapshotItemValue(snapshot: ShellSnapshot, item: SnapshotItem): string {
  switch (item) {
    case 'features':
      return SHELL_FEATURES.every((f) => settledFeature(snapshot.features[f]) === 'Enabled')
        ? t('activées')
        : SHELL_FEATURES.some((f) => settledFeature(snapshot.features[f]) === 'Enabled')
          ? t('en partie activées')
          : t('désactivées');
    case 'enabled':
      return snapshot.enabled === undefined ? t('fonctions désactivées') : snapshot.enabled ? t('oui') : t('non');
    case 'defaultShell':
      return snapshot.defaultShell === undefined ? t('fonctions désactivées') : snapshot.defaultShell ? programName(snapshot.defaultShell.shell) : t('aucun réglage');
    case 'custom':
      return snapshot.custom === undefined ? t('fonctions désactivées') : snapshot.custom ? programName(snapshot.custom.shell) : t('aucun réglage');
    case 'winlogonShell':
      return snapshot.winlogonShell ?? t('absent');
  }
}

/** Nom du programme d'une ligne de commande (« CyberPinball.exe », « explorer.exe »). */
export function programName(command: string): string {
  const exe = /^"([^"]+)"/.exec(command.trim())?.[1] ?? command.trim().split(/\s+/)[0] ?? command;
  return path.win32.basename(exe);
}

export const SNAPSHOT_ITEMS: readonly SnapshotItem[] = ['custom', 'enabled', 'defaultShell', 'winlogonShell', 'features'];

// ---------------------------------------------------------------------------
// Script élevé

/** Une valeur PowerShell entre apostrophes. */
function psString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** Un objet JSON relu par PowerShell (chaîne ici-même sur une ligne : jamais de '@ en tête de ligne). */
function psJson(value: unknown): string {
  return `(ConvertFrom-Json @'\n${JSON.stringify(value)}\n'@)`;
}

/**
 * Couche système réelle : les seuls appels du script qui lisent ou écrivent dans Windows.
 * Fonctions facultatives (DISM), classe WMI WESL_UserSetting de Shell Launcher, valeur Shell
 * de Winlogon.
 */
export const REAL_SYSTEM_LAYER = String.raw`# i18n-ignore : script PowerShell
$WeslPath = '\\localhost\root\standardcimv2\embedded:WESL_UserSetting'
$WinlogonKey = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon'
function Sys-Check($r, [string]$what) { if ($null -ne $r -and $null -ne $r.ReturnValue -and [int]$r.ReturnValue -ne 0) { throw "$what returned $($r.ReturnValue)" } }
function Sys-FeatureState([string]$name) { $f = Get-WindowsOptionalFeature -Online -FeatureName $name -ErrorAction SilentlyContinue; if ($f) { "$($f.State)" } else { 'Absent' } }
function Sys-EnableFeatures([string[]]$names) { $r = Enable-WindowsOptionalFeature -Online -FeatureName $names -All -NoRestart; [bool]$r.RestartNeeded }
function Sys-DisableFeature([string]$name) { $r = Disable-WindowsOptionalFeature -Online -FeatureName $name -NoRestart; [bool]$r.RestartNeeded }
function Sys-GetWinlogonShell { $v = Get-ItemProperty -Path $WinlogonKey -Name Shell -ErrorAction SilentlyContinue; if ($v) { "$($v.Shell)" } else { $null } }
function Sys-SetWinlogonShell($value) { if ($null -eq $value) { Remove-ItemProperty -Path $WinlogonKey -Name Shell } else { Set-ItemProperty -Path $WinlogonKey -Name Shell -Value ([string]$value) -Type String } }
function Sys-Wesl { try { [wmiclass]$WeslPath } catch { $null } }
function Sys-WeslAvailable { try { $c = Sys-Wesl; if ($null -eq $c) { return $false }; [void]$c.IsEnabled(); $true } catch { $false } }
function Sys-IsEnabled { [bool](Sys-Wesl).IsEnabled().Enabled }
function Sys-SetEnabled([bool]$on) { Sys-Check ((Sys-Wesl).SetEnabled($on)) 'SetEnabled' }
function Sys-GetDefaultShell { try { $d = (Sys-Wesl).GetDefaultShell(); if (-not $d.Shell) { return $null }; [ordered]@{ shell = "$($d.Shell)"; defaultAction = [int]$d.DefaultAction } } catch { $null } }
function Sys-SetDefaultShell([string]$shell, [int]$action) { Sys-Check ((Sys-Wesl).SetDefaultShell($shell, $action)) 'SetDefaultShell' }
function Sys-GetCustomShell([string]$sid) {
  $u = Get-CimInstance -Namespace 'root\standardcimv2\embedded' -ClassName WESL_UserSetting -ErrorAction SilentlyContinue | Where-Object { $_.Sid -eq $sid } | Select-Object -First 1
  if (-not $u) { return $null }
  [ordered]@{ shell = "$($u.Shell)"; defaultAction = [int]$u.DefaultAction; returnCodes = @(@($u.CustomReturnCodes) | Where-Object { $null -ne $_ } | ForEach-Object { [int]$_ }); returnActions = @(@($u.CustomReturnCodesAction) | Where-Object { $null -ne $_ } | ForEach-Object { [int]$_ }) }
}
function Sys-SetCustomShell([string]$sid, [string]$shell, [int[]]$codes, [int[]]$actions, [int]$action) {
  if (-not $codes -or $codes.Count -eq 0) { $codes = $null; $actions = $null }
  Sys-Check ((Sys-Wesl).SetCustomShell($sid, $shell, $codes, $actions, $action)) 'SetCustomShell'
}
function Sys-RemoveCustomShell([string]$sid) { Sys-Check ((Sys-Wesl).RemoveCustomShell($sid)) 'RemoveCustomShell' }
function Sys-End {}
`;

/**
 * Logique du script, la même quelle que soit la couche système : relevés, activation,
 * remise de l'état de référence. Ses notes vont au journal (en anglais, pour le développeur).
 */
const SCRIPT_LOGIC = String.raw`# i18n-ignore : script PowerShell
$Features = @('Client-DeviceLockdown', 'Client-EmbeddedShellLauncher')
$Log = New-Object System.Collections.Generic.List[string]
$Restart = $false
function Note([string]$text) { $Log.Add($text) }
function Settled([string]$state) { switch ($state) { 'EnablePending' { 'Enabled' } 'DisablePending' { 'Disabled' } default { $state } } }
function Has($o, [string]$name) { $null -ne $o -and ($o.PSObject.Properties.Name -contains $name) }
function IsExplorer([string]$shell) { $shell.Trim() -match '(^|[\\/"\s])explorer(\.exe)?"?$' }
function SameShell($a, $b) {
  if ($null -eq $a -or $null -eq $b) { return ($null -eq $a) -and ($null -eq $b) }
  ($a.shell -eq $b.shell) -and ([int]$a.defaultAction -eq [int]$b.defaultAction) -and ((@($a.returnCodes) -join ',') -eq (@($b.returnCodes) -join ',')) -and ((@($a.returnActions) -join ',') -eq (@($b.returnActions) -join ','))
}
function Snapshot {
  $s = [ordered]@{ features = [ordered]@{}; winlogonShell = (Sys-GetWinlogonShell) }
  foreach ($f in $Features) { $s.features[$f] = Sys-FeatureState $f }
  if (Sys-WeslAvailable) { $s.enabled = Sys-IsEnabled; $s.defaultShell = Sys-GetDefaultShell; $s.custom = Sys-GetCustomShell $Sid }
  $s | ConvertTo-Json -Depth 6 | ConvertFrom-Json
}
function Sync-Features($want) {
  $enable = @($Features | Where-Object { (Settled $want.$_) -eq 'Enabled' -and (Settled (Sys-FeatureState $_)) -ne 'Enabled' })
  if ($enable.Count) { if (Sys-EnableFeatures $enable) { $script:Restart = $true }; Note "features enabled: $($enable -join ', ')" }
  $reversed = @($Features); [array]::Reverse($reversed)
  foreach ($f in $reversed) {
    if ((Settled $want.$f) -ne 'Enabled' -and (Settled (Sys-FeatureState $f)) -eq 'Enabled') { if (Sys-DisableFeature $f) { $script:Restart = $true }; Note "feature disabled: $f" }
  }
}
function Sync-Wesl($want) {
  if ((Has $want 'defaultShell') -and $null -ne $want.defaultShell) {
    $d = Sys-GetDefaultShell
    if ($null -eq $d -or $d.shell -ne $want.defaultShell.shell -or [int]$d.defaultAction -ne [int]$want.defaultShell.defaultAction) { Sys-SetDefaultShell $want.defaultShell.shell ([int]$want.defaultShell.defaultAction); Note "default shell: $($want.defaultShell.shell)" }
  }
  if (Has $want 'custom') {
    $c = Sys-GetCustomShell $Sid
    if ($null -eq $want.custom) { if ($null -ne $c) { Sys-RemoveCustomShell $Sid; Note 'custom shell removed' } }
    elseif (-not (SameShell $c $want.custom)) { Sys-SetCustomShell $Sid $want.custom.shell ([int[]]@($want.custom.returnCodes)) ([int[]]@($want.custom.returnActions)) ([int]$want.custom.defaultAction); Note "custom shell: $($want.custom.shell)" }
  }
  if ((Has $want 'enabled') -and (Sys-IsEnabled) -ne [bool]$want.enabled) { Sys-SetEnabled ([bool]$want.enabled); Note "shell launcher enabled: $($want.enabled)" }
}
function Sync-Winlogon($want) {
  if (-not (Has $want 'winlogonShell')) { return }
  $now = Sys-GetWinlogonShell
  if ("$now" -ne "$($want.winlogonShell)") { Sys-SetWinlogonShell $want.winlogonShell; Note "winlogon shell: $($want.winlogonShell)" }
}
function Restore($ref) {
  if (Sys-WeslAvailable) {
    if (Has $ref 'enabled') { Sync-Wesl $ref }
    else { Sync-Wesl ([pscustomobject]@{ custom = $null; enabled = $false }) }
  } else { Note 'shell launcher unreachable: settings not restored' }
  Sync-Winlogon $ref
  $Outcome.settled = Snapshot
  Sync-Features $ref.features
}
function Reference {
  $ref = $Outcome.before
  if (-not (Has $ref 'enabled') -and (Has $Outcome.weslBefore 'enabled')) {
    $ref = $ref | ConvertTo-Json -Depth 6 | ConvertFrom-Json
    $ref | Add-Member -NotePropertyName enabled -NotePropertyValue $Outcome.weslBefore.enabled
    $ref | Add-Member -NotePropertyName defaultShell -NotePropertyValue $Outcome.weslBefore.defaultShell
    $ref | Add-Member -NotePropertyName custom -NotePropertyValue $Outcome.weslBefore.custom
  }
  $ref
}
function Activate {
  $absent = @($Features | Where-Object { (Sys-FeatureState $_) -eq 'Absent' })
  if ($absent.Count) { throw 'absent-features' }
  Sync-Features ([pscustomobject]@{ 'Client-DeviceLockdown' = 'Enabled'; 'Client-EmbeddedShellLauncher' = 'Enabled' })
  if (-not (Sys-WeslAvailable)) { $Outcome.status = 'restart'; return }
  $Outcome.weslBefore = Snapshot
  $d = Sys-GetDefaultShell
  if ($null -eq $d -or -not (IsExplorer $d.shell)) { Sys-SetDefaultShell 'explorer.exe' 0; Note 'default shell: explorer.exe' }
  Sync-Wesl ([pscustomobject]@{ custom = $Setting; enabled = $true })
  $Outcome.status = 'done'
}
$Outcome = [ordered]@{ kind = $Kind; status = 'failed'; log = $Log }
try {
  $Outcome.before = Snapshot
  if ($Kind -eq 'activate') { Activate } else { Restore $Reference; $Outcome.status = 'done' }
} catch {
  $Outcome.status = 'failed'
  $Outcome.error = "$($_.Exception.Message)"
  Note "error: $($Outcome.error)"
  if ($Kind -eq 'activate' -and $null -ne $Outcome.before) {
    try { Restore (Reference); $Outcome.rolledBack = $true; Note 'rolled back' } catch { $Outcome.rollbackError = "$($_.Exception.Message)"; Note "rollback error: $($Outcome.rollbackError)" }
  }
}
try { $Outcome.after = Snapshot } catch { Note "final snapshot: $($_.Exception.Message)" }
$Outcome.restartNeeded = $Restart
Sys-End
[System.IO.File]::WriteAllText($ResultFile, ($Outcome | ConvertTo-Json -Depth 8), (New-Object System.Text.UTF8Encoding $false))
`;

/**
 * Script PowerShell d'une activation ou d'une désactivation. `layer` : la couche système
 * (REAL_SYSTEM_LAYER ; les tests en donnent une simulée). Le résultat est écrit dans `resultFile`.
 */
export function elevatedScript(run: ElevatedRun, resultFile: string, layer = REAL_SYSTEM_LAYER): string {
  const values = [
    '# Cyber Pinball : borne dédiée (Shell Launcher). Script généré ; résultat dans le fichier ci-dessous.', // i18n-ignore : commentaire du script
    "$ErrorActionPreference = 'Stop'",
    `$Kind = ${psString(run.kind)}`,
    `$Sid = ${psString(run.sid)}`,
    `$ResultFile = ${psString(resultFile)}`,
    `$Setting = ${run.kind === 'activate' ? psJson(run.setting) : '$null'}`,
    `$Reference = ${run.kind === 'deactivate' ? psJson(run.reference) : '$null'}`,
  ];
  return [...values, layer.trim(), SCRIPT_LOGIC.trim(), ''].join('\r\n');
}

/** Résultat écrit par le script (BOM toléré) ; undefined s'il manque ou ne se lit pas. */
export function readElevatedOutcome(file: string): ElevatedOutcome | undefined {
  try {
    const outcome = readJsonFile(file) as ElevatedOutcome;
    return outcome && (outcome.kind === 'activate' || outcome.kind === 'deactivate') ? normalizeOutcome(outcome) : undefined;
  } catch {
    return undefined;
  }
}

/** ConvertTo-Json de Windows PowerShell rend un tableau d'un seul élément tel quel, mais un journal vide en {} : on remet les formes attendues. */
function normalizeOutcome(outcome: ElevatedOutcome): ElevatedOutcome {
  const fix = (s: ShellSnapshot | undefined) => {
    if (!s?.custom) return s;
    return { ...s, custom: { ...s.custom, returnCodes: arrayOf(s.custom.returnCodes), returnActions: arrayOf(s.custom.returnActions) } };
  };
  return { ...outcome, before: fix(outcome.before), weslBefore: fix(outcome.weslBefore), settled: fix(outcome.settled), after: fix(outcome.after), log: arrayOf<string>(outcome.log) };
}

function arrayOf<T = number>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value === null || value === undefined || (typeof value === 'object' && !Object.keys(value).length)) return [];
  return [value as T];
}

// ---------------------------------------------------------------------------
// Windows simulé (tests, démonstrations hors écran)

/** Ce que la simulation retient de Windows. */
export interface SimulatedWindows {
  features: Record<string, FeatureState>;
  /** Classe WMI de Shell Launcher joignable. */
  wesl: boolean;
  enabled: boolean;
  defaultShell: DefaultShell | null;
  customs: Record<string, ShellSetting>;
  winlogonShell: string | null;
  /** Activer les fonctions demande un redémarrage : la classe WMI reste injoignable jusque-là. */
  restartOnEnable?: boolean;
  /** Écriture qui échoue (essai du retour en arrière) : nom d'une fonction Sys-* sans le préfixe. */
  failOn?: string;
}

/** Un Windows IoT Enterprise LTSC tel que livré : Shell Launcher désactivé, l'Explorateur partout. */
export function freshWindows(): SimulatedWindows {
  return {
    features: { 'Client-DeviceLockdown': 'Disabled', 'Client-EmbeddedShellLauncher': 'Disabled' },
    wesl: false,
    enabled: false,
    defaultShell: { shell: 'cmd.exe', defaultAction: SHELL_ACTION.restartShell },
    customs: {},
    winlogonShell: EXPLORER,
  };
}

/**
 * Rejoue le script élevé sur un Windows simulé, la même logique que SCRIPT_LOGIC (vérifié par
 * dedicated.test.ts, qui fait tourner le vrai script sur la couche simulée de PowerShell).
 */
export function simulateRun(windows: SimulatedWindows, run: ElevatedRun): { windows: SimulatedWindows; outcome: ElevatedOutcome } {
  const w: SimulatedWindows = JSON.parse(JSON.stringify(windows));
  const log: string[] = [];
  let restart = false;
  const fail = (op: string) => {
    if (w.failOn === op) throw new Error(`${op} failed (simulated)`);
  };
  const sys = {
    featureState: (f: string) => w.features[f] ?? 'Absent',
    enableFeatures: (names: string[]) => {
      fail('EnableFeatures');
      for (const f of names) w.features[f] = w.restartOnEnable ? 'EnablePending' : 'Enabled';
      if (!w.restartOnEnable) w.wesl = true;
      return Boolean(w.restartOnEnable);
    },
    disableFeature: (f: string) => {
      fail('DisableFeature');
      w.features[f] = 'Disabled';
      if (f === 'Client-EmbeddedShellLauncher') w.wesl = false;
      return false;
    },
    setWinlogonShell: (value: string | null) => {
      fail('SetWinlogonShell');
      w.winlogonShell = value;
    },
    setEnabled: (on: boolean) => {
      fail('SetEnabled');
      w.enabled = on;
      w.winlogonShell = on ? SIMULATED_LAUNCHER_HOST : EXPLORER;
    },
    setDefaultShell: (shell: string, defaultAction: number) => {
      fail('SetDefaultShell');
      w.defaultShell = { shell, defaultAction };
    },
    setCustomShell: (setting: ShellSetting) => {
      fail('SetCustomShell');
      w.customs[run.sid] = { ...setting, returnCodes: [...setting.returnCodes], returnActions: [...setting.returnActions] };
    },
    removeCustomShell: () => {
      fail('RemoveCustomShell');
      delete w.customs[run.sid];
    },
  };
  const snapshot = (): ShellSnapshot => {
    const s: ShellSnapshot = { features: Object.fromEntries(SHELL_FEATURES.map((f) => [f, sys.featureState(f)])), winlogonShell: w.winlogonShell };
    if (w.wesl) Object.assign(s, { enabled: w.enabled, defaultShell: w.defaultShell ? { ...w.defaultShell } : null, custom: w.customs[run.sid] ? JSON.parse(JSON.stringify(w.customs[run.sid])) : null });
    return s;
  };
  const syncFeatures = (want: Record<string, FeatureState>) => {
    const enable = SHELL_FEATURES.filter((f) => settledFeature(want[f]) === 'Enabled' && settledFeature(sys.featureState(f)) !== 'Enabled');
    if (enable.length) {
      if (sys.enableFeatures(enable)) restart = true;
      log.push(`features enabled: ${enable.join(', ')}`);
    }
    for (const f of [...SHELL_FEATURES].reverse()) {
      if (settledFeature(want[f]) !== 'Enabled' && settledFeature(sys.featureState(f)) === 'Enabled') {
        if (sys.disableFeature(f)) restart = true;
        log.push(`feature disabled: ${f}`);
      }
    }
  };
  const syncWesl = (want: Pick<ShellSnapshot, 'enabled' | 'defaultShell' | 'custom'>) => {
    if (want.defaultShell && !sameDefault(w.defaultShell, want.defaultShell)) {
      sys.setDefaultShell(want.defaultShell.shell, want.defaultShell.defaultAction);
      log.push(`default shell: ${want.defaultShell.shell}`);
    }
    if ('custom' in want && want.custom !== undefined) {
      const current = w.customs[run.sid];
      if (want.custom === null) {
        if (current) {
          sys.removeCustomShell();
          log.push('custom shell removed');
        }
      } else if (!sameSetting(current, want.custom)) {
        sys.setCustomShell(want.custom);
        log.push(`custom shell: ${want.custom.shell}`);
      }
    }
    if (want.enabled !== undefined && w.enabled !== want.enabled) {
      sys.setEnabled(want.enabled);
      log.push(`shell launcher enabled: ${want.enabled ? 'True' : 'False'}`);
    }
  };
  const outcome: ElevatedOutcome = { kind: run.kind, status: 'failed', log };
  const restore = (ref: ShellSnapshot) => {
    if (w.wesl) syncWesl(ref.enabled !== undefined ? ref : { custom: null, enabled: false });
    else log.push('shell launcher unreachable: settings not restored');
    if ((w.winlogonShell ?? '').toLowerCase() !== (ref.winlogonShell ?? '').toLowerCase()) {
      sys.setWinlogonShell(ref.winlogonShell);
      log.push(`winlogon shell: ${ref.winlogonShell ?? ''}`);
    }
    outcome.settled = snapshot();
    syncFeatures(ref.features);
  };
  try {
    outcome.before = snapshot();
    if (run.kind === 'activate') {
      if (SHELL_FEATURES.some((f) => sys.featureState(f) === 'Absent')) throw new Error('absent-features');
      syncFeatures({ 'Client-DeviceLockdown': 'Enabled', 'Client-EmbeddedShellLauncher': 'Enabled' });
      if (!w.wesl) outcome.status = 'restart';
      else {
        outcome.weslBefore = snapshot();
        if (!isExplorer(w.defaultShell?.shell)) {
          sys.setDefaultShell(EXPLORER, SHELL_ACTION.restartShell);
          log.push('default shell: explorer.exe');
        }
        syncWesl({ custom: run.setting, enabled: true });
        outcome.status = 'done';
      }
    } else {
      restore(run.reference);
      outcome.status = 'done';
    }
  } catch (error) {
    outcome.status = 'failed';
    outcome.error = (error as Error).message;
    log.push(`error: ${outcome.error}`);
    if (run.kind === 'activate' && outcome.before) {
      try {
        restore(referenceOf(outcome)!);
        outcome.rolledBack = true;
        log.push('rolled back');
      } catch (rollback) {
        outcome.rollbackError = (rollback as Error).message;
        log.push(`rollback error: ${outcome.rollbackError}`);
      }
    }
  }
  outcome.after = snapshot();
  outcome.restartNeeded = restart;
  return { windows: w, outcome };
}
