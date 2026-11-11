// Relevé de la fiche technique (packages/core/src/techsheet.ts) : un script PowerShell sans fenêtre, en lecture seule,
// pour le PC et Windows (processeur, mémoire, carte graphique et son pilote, disques, réseau,
// redémarrage en attente, mode d'alimentation, mode Jeu, notifications, antivirus, langue),
// DisplayConfig pour la connexion et les fréquences des écrans (probeDisplayLinks), la
// configuration de la borne pour les rôles, les boutons et le lanceur, VPinballX.ini et le dossier
// des plugins de VPX pour les logiciels, l'hôte pour Cyber Pinball lui-même.
//
// Le relevé ne lance rien de visible, ne demande aucune autorisation (UAC) et ne bloque pas le
// menu : le script tourne à part, jusqu'à TECH_PROBE_MS. Une partie qui échoue reste absente.
// Hors Windows ou dans les essais (CYBERPINBALL_FICHE : un fichier JSON de TechFacts), rien n'est lu
// du système.

import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  IniDocument,
  journalErrors,
  matchScreens,
  parseTechProbe,
  readJsonFile,
  readTextIfExists,
  writeFileAtomic,
  type Cabinet,
  type ObservedDisplay,
  type RoleId,
  type TechDisplay,
  type TechFacts,
} from '@cyberpinball/core';

/** Le script ne dure jamais plus de 45 s (modules Storage et NetAdapter compris). */
export const TECH_PROBE_MS = 45_000;

/**
 * Le script de relevé (Windows PowerShell 5.1, sans profil) : un objet JSON, chaque partie dans son
 * propre try. Les dates sont écrites en ISO ; la sortie passe en UTF-8. Rien n'est modifié : ni registre
 * écrit, ni powercfg (coexistence.ts, FORBIDDEN_WINDOWS_CALLS).
 */
export const TECH_PROBE_SCRIPT = String.raw`# i18n-ignore : script PowerShell
$ErrorActionPreference = 'SilentlyContinue'
$ProgressPreference = 'SilentlyContinue'
$r = @{}
function D($v) { if ($v -is [datetime]) { $v.ToString('o') } else { $null } }
try { $r.cpu = @(Get-CimInstance Win32_Processor | ForEach-Object { @{ name = $_.Name; cores = $_.NumberOfCores; threads = $_.NumberOfLogicalProcessors; mhz = $_.MaxClockSpeed } }) } catch {}
try {
  $os = Get-CimInstance Win32_OperatingSystem
  $mods = @(Get-CimInstance Win32_PhysicalMemory | ForEach-Object { @{ capacity = [double]$_.Capacity; speed = $_.ConfiguredClockSpeed } })
  $installed = ($mods | Measure-Object -Property capacity -Sum).Sum
  $total = if ($installed -gt 0) { $installed } else { [double]$os.TotalVisibleMemorySize * 1024 }
  $r.mem = @{ total = $total; free = [double]$os.FreePhysicalMemory * 1024; modules = $mods }
  $cv = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion'
  $r.os = @{ name = $os.Caption; build = $os.BuildNumber; release = $cv.DisplayVersion; ubr = $cv.UBR; boot = (D $os.LastBootUpTime) }
} catch {}
try {
  $vram = @{}
  Get-ChildItem 'HKLM:\SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}' | ForEach-Object {
    $p = Get-ItemProperty $_.PSPath
    if ($p.DriverDesc -and $p.'HardwareInformation.qwMemorySize') { $vram[$p.DriverDesc] = [double]$p.'HardwareInformation.qwMemorySize' }
  }
  $r.gpu = @(Get-CimInstance Win32_VideoController | ForEach-Object { @{ name = $_.Name; driver = $_.DriverVersion; driverDate = (D $_.DriverDate); memory = $vram[$_.Name] } })
} catch {}
try { $b = Get-CimInstance Win32_BaseBoard; $bios = Get-CimInstance Win32_BIOS; $r.board = @{ maker = $b.Manufacturer; model = $b.Product; bios = $bios.SMBIOSBIOSVersion; biosDate = (D $bios.ReleaseDate) } } catch {}
try {
  $pds = @(Get-PhysicalDisk)
  $r.disks = @(Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' | ForEach-Object {
    $model = $null; $bus = $null; $media = $null
    try {
      $d = Get-Partition -DriveLetter $_.DeviceID.TrimEnd(':') | Get-Disk
      $model = $d.FriendlyName; $bus = [string]$d.BusType
      $pd = $pds | Where-Object { [string]$_.DeviceId -eq [string]$d.Number } | Select-Object -First 1
      if ($pd) { $media = [string]$pd.MediaType }
    } catch {}
    @{ root = $_.DeviceID + '\'; label = $_.VolumeName; size = [double]$_.Size; free = [double]$_.FreeSpace; model = $model; bus = $bus; media = $media }
  })
} catch {}
try { $r.net = @(Get-NetAdapter -Physical | Where-Object { $_.Status -eq 'Up' } | ForEach-Object { @{ name = $_.Name; desc = $_.InterfaceDescription; bps = [double]$_.ReceiveLinkSpeed; media = [string]$_.PhysicalMediaType } }) } catch {}
$r.reboot = (Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired') -or (Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending')
try {
  # Lecture seule : le mode actif dans le registre, ses délais dans CIM (powercfg n'est jamais lancé).
  $g = (Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\Power\User\PowerSchemes').ActivePowerScheme
  $n = [string](Get-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Control\Power\User\PowerSchemes\$g").FriendlyName
  if ($n -like '@*') { $n = ($n -split ',')[-1] }
  $idx = @(Get-CimInstance -Namespace root\cimv2\power -ClassName Win32_PowerSettingDataIndex | Where-Object { $_.InstanceID -like "*$g*\AC\*" })
  function Get-AcIndex($setting) { $i = $idx | Where-Object { $_.InstanceID -like "*$setting*" } | Select-Object -First 1; if ($i) { [double]$i.SettingIndexValue } else { $null } }
  $r.power = @{ guid = $g; name = $n; sleep = (Get-AcIndex '29f6c1db-86da-48c5-9fdb-f2b67b1f44da'); screen = (Get-AcIndex '3c0bc021-c8a8-4e07-a973-6b14cbcb2b7e') }
} catch {}
$r.gameMode = (Get-ItemProperty 'HKCU:\Software\Microsoft\GameBar').AutoGameModeEnabled
$r.hags = (Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\GraphicsDrivers').HwSchMode
$r.toast = (Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\PushNotifications').ToastEnabled
try { $r.av = @(Get-CimInstance -Namespace root/SecurityCenter2 -ClassName AntiVirusProduct | ForEach-Object { $_.displayName }) } catch {}
try { $r.culture = (Get-Culture).Name } catch {}
try { $r.keyboard = @((Get-WinUserLanguageList)[0].InputMethodTips)[0] } catch {}
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$r | ConvertTo-Json -Depth 5 -Compress
`;

/** Lance le script ; sa sortie JSON brute, ou undefined (PowerShell absent, délai dépassé, sortie illisible). */
export function runTechProbe(): Promise<unknown> {
  if (process.platform !== 'win32') return Promise.resolve(undefined);
  const encoded = Buffer.from(TECH_PROBE_SCRIPT, 'utf16le').toString('base64');
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
      { windowsHide: true, timeout: TECH_PROBE_MS, maxBuffer: 4 * 1024 * 1024, encoding: 'utf8' },
      (error, stdout) => {
        try {
          const text = stdout.trim().replace(/^﻿/, '');
          resolve(text ? JSON.parse(text.slice(text.indexOf('{'))) : undefined);
        } catch {
          if (error) console.warn(`Fiche technique : relevé de Windows impossible (${error.message}).`); // i18n-ignore : journal
          resolve(undefined);
        }
      },
    );
  });
}

/** Lien d'un écran (win-displays, probeDisplayLinks). */
export interface DisplayLinkFacts {
  gdiName: string;
  connection?: TechDisplay['connection'];
  hz?: number;
  offeredMaxHz?: number;
  edidMaxHz?: number;
}

/**
 * Écrans de la fiche : ceux que Windows voit, avec leur rôle dans la configuration retenue
 * (par l'empreinte, comme la santé), leur lien et leurs fréquences.
 */
export function techDisplays(observed: ObservedDisplay[], links: DisplayLinkFacts[], cabinet: Cabinet | undefined): TechDisplay[] {
  const roleOf = new Map<ObservedDisplay, RoleId>();
  if (cabinet) {
    const { matched } = matchScreens(cabinet.screens, observed);
    for (const [role, fingerprint] of Object.entries(cabinet.roles) as [RoleId, string][]) {
      const hit = matched.get(fingerprint);
      if (hit && !roleOf.has(hit)) roleOf.set(hit, role);
    }
  }
  return observed.map((d) => {
    const link = links.find((l) => l.gdiName === d.gdiName);
    const cm = d.edid && d.edid.widthCm && d.edid.heightCm ? Math.hypot(d.edid.widthCm, d.edid.heightCm) : undefined;
    const mm = d.edid?.imageMm ? Math.hypot(d.edid.imageMm.width, d.edid.imageMm.height) / 10 : undefined;
    const inches = (mm ?? cm) ? Math.round(((mm ?? cm)! / 2.54) * 10) / 10 : undefined;
    return {
      ...(roleOf.get(d) && { role: roleOf.get(d) }),
      name: d.edid?.monitorName || d.friendlyName || d.monitorDescription || d.gdiName,
      ...(inches && { inches }),
      width: d.bounds.width,
      height: d.bounds.height,
      ...(link?.hz && { hz: link.hz }),
      ...(link?.offeredMaxHz && { offeredMaxHz: link.offeredMaxHz }),
      ...(link?.edidMaxHz && { edidMaxHz: link.edidMaxHz }),
      ...(link?.connection && { connection: link.connection }),
      ...(d.scale && { scale: d.scale }),
      rotation: d.rotation,
      primary: d.primary,
    };
  });
}

/** Plugins de VPX : chaque dossier de plugins\ qui a un plugin.cfg, et son état dans VPinballX.ini. */
export function vpxPlugins(vpxDir: string | undefined, iniText: string): { id: string; name: string; enabled: boolean }[] {
  if (!vpxDir) return [];
  const dir = path.join(vpxDir, 'plugins');
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const ini = IniDocument.parse(iniText);
  const out: { id: string; name: string; enabled: boolean }[] = [];
  for (const name of names) {
    const cfg = readTextIfExists(path.join(dir, name, 'plugin.cfg'));
    const id = /^\s*id\s*=\s*"([^"]+)"/m.exec(cfg)?.[1];
    if (!id) continue;
    const label = /^\s*name\s*=\s*"([^"]+)"/m.exec(cfg)?.[1] ?? id;
    out.push({ id, name: label, enabled: ini.get(`Plugin.${id}`, 'Enable') === '1' });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Erreurs du journal de Cyber Pinball depuis 24 heures. */
export function recentErrors(dataDir: string, now = Date.now()): number {
  return journalErrors(readTextIfExists(path.join(dataDir, 'logs', 'journal.txt')), now - 24 * 3600_000);
}

/** Relevé gardé d'un lancement à l'autre : la fiche s'ouvre aussitôt sur le dernier. */
export function techCacheFile(dataDir: string): string {
  return path.join(dataDir, 'cache', 'fiche.json');
}

export function loadTechFacts(dataDir: string): TechFacts | undefined {
  try {
    const raw = readJsonFile(techCacheFile(dataDir)) as TechFacts | undefined;
    return raw && typeof raw.at === 'string' ? raw : undefined;
  } catch {
    return undefined;
  }
}

export function saveTechFacts(dataDir: string, facts: TechFacts): void {
  fs.mkdirSync(path.dirname(techCacheFile(dataDir)), { recursive: true });
  writeFileAtomic(techCacheFile(dataDir), JSON.stringify(facts));
}

/** Essais : un relevé tout fait (CYBERPINBALL_FICHE, fichier JSON de TechFacts) remplace celui du système. */
export function simulatedTechFacts(): TechFacts | undefined {
  const file = process.env.CYBERPINBALL_FICHE;
  if (!file) return undefined;
  try {
    return readJsonFile(file) as TechFacts;
  } catch {
    return undefined;
  }
}


/** Ce que le relevé demande à l'application. */
export interface TechCollectContext {
  /** Écrans vus par Windows (frontend.ts, probeDisplays). */
  displays?(): ObservedDisplay[];
  /** Connexion et fréquences de chaque écran (win-displays, probeDisplayLinks). */
  links?(): DisplayLinkFacts[];
  /** Configuration retenue de la borne (écrans, boutons, lanceur). */
  cabinet(): Cabinet | undefined;
  /** Son nom et ses écrans trouvés (santé : screens.active). */
  configuration(): TechFacts['configuration'];
  vpxDir(): string | undefined;
  vpxIniText(): string;
  vpxVersion(): string | undefined;
  vpxKnown(): string | undefined;
  vcRuntime(): { ok: boolean; detail?: string } | undefined;
  /** Périphériques USB branchés (Pinscape, contrôleurs DOF). */
  usbPinscape(): boolean;
  /** Contrôleurs DOF reconnus (santé : dof.controllers). */
  dof(): string[];
  pupPacks(): number | undefined;
  app(): TechFacts['app'];
  /** Relevé de Windows (runTechProbe) ; remplaçable dans les essais. */
  probe?(): Promise<unknown>;
}

/** Le relevé complet de la fiche ; un relevé simulé (CYBERPINBALL_FICHE) le remplace dans les essais. */
export async function collectTechFacts(ctx: TechCollectContext): Promise<TechFacts> {
  const simulated = simulatedTechFacts();
  if (simulated) return { ...simulated, at: new Date().toISOString() };
  const probed = parseTechProbe((await (ctx.probe ?? runTechProbe)()) ?? {});
  const vc = ctx.vcRuntime();
  const windows = { ...probed.windows, ...(vc && { vcRuntime: vc }) };
  let displays: TechDisplay[] | undefined;
  try {
    const observed = ctx.displays?.();
    if (observed) displays = techDisplays(observed, safe(() => ctx.links?.()) ?? [], ctx.cabinet());
  } catch (error) {
    console.warn(`Fiche technique : écrans non relevés (${(error as Error).message}).`); // i18n-ignore : journal
  }
  const cabinet = ctx.cabinet();
  // Un Pinscape branché (USB), ou nommé par le lanceur relevé à l'étape « Lanceur ».
  const pinscape = ctx.usbPinscape() || /pinscape/i.test(JSON.stringify(cabinet?.analog ?? {}));
  const controllers: TechFacts['controllers'] = {
    pinscape,
    buttons: Object.keys(cabinet?.buttons ?? {}).length,
    ...(cabinet?.analog?.plunger && { plunger: cabinet.analog.plunger.name ?? cabinet.analog.plunger.device.replace(/_[0-9a-f]{32}/i, '') }),
    ...(cabinet?.analog?.nudge && { nudge: cabinet.analog.nudge.name ?? cabinet.analog.nudge.device.replace(/_[0-9a-f]{32}/i, '') }),
    dof: ctx.dof(),
  };
  const iniText = ctx.vpxIniText();
  const software: TechFacts['software'] = {
    vpx: { version: ctx.vpxVersion(), known: ctx.vpxKnown() },
    plugins: vpxPlugins(ctx.vpxDir(), iniText),
    ...(ctx.pupPacks() !== undefined && { pupPacks: ctx.pupPacks() }),
  };
  return {
    at: new Date().toISOString(),
    pc: probed.pc,
    windows,
    ...(displays && { displays }),
    ...(ctx.configuration() && { configuration: ctx.configuration() }),
    controllers,
    software,
    app: ctx.app(),
  };
}

function safe<T>(read: () => T): T | undefined {
  try {
    return read();
  } catch {
    return undefined;
  }
}
