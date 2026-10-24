# Mode hors écran des démonstrations sans opérateur, chargé par chaque docs\demo-*.ps1 :
#   . "$PSScriptRoot\hors-ecran.ps1"
#   if (Enter-BureauCache $PSCommandPath $PSBoundParameters) { exit $LASTEXITCODE }
#                                         # tout le script se relance sur un bureau Windows caché
#   Use-HorsEcran $Ecrans                 # par défaut : hors écran, écrans de docs\ecrans\<Ecrans>.json
#   Assert-EcransDuPoste 'Une partie de VPX'  # ce qui a besoin des vrais écrans
#   Assert-HorsEcran $captures            # le guet n'a vu aucune fenêtre sur les écrans du poste
# Hors écran, les fenêtres de Cyber Pinball sont rendues en mémoire : rien n'apparaît sur les
# écrans du poste, rien ne prend le focus, la démonstration ne dépend pas des écrans branchés.
# $env:CYBERPINBALL_A_L_ECRAN = '1' rend les fenêtres sur les vrais écrans (seul moyen de
# lancer ce qui en a besoin : une partie de VPX, l'endurance, les captures du bureau entier).
# Une démonstration ne dépend pas du poste : elle tourne depuis la racine du dépôt, quel que
# soit le dossier d'où on la lance (les `node -e` y chargent ./packages/…/dist), et le modèle
# de borne qu'elle copie garde les touches par défaut des encodeurs, celles qu'elle rejoue
# (Get-ModeleBorne, Copy-ModeleBorne), quels que soient les boutons relevés sur la vraie borne.

Set-Location (Split-Path $PSScriptRoot -Parent)
# Les démonstrations choisissent leurs actions par leur libellé français (action:…) : l'interface
# est donc en français, quelle que soit la langue de Windows (sauf langue imposée par le script).
if (-not $env:CYBERPINBALL_LANGUE) { $env:CYBERPINBALL_LANGUE = 'fr' }

# Le code compilé (packages\*\dist, app\dist) que lisent les démonstrations : dans un worktree
# neuf, il n'existe pas encore. Toute démonstration qui s'en sert passe par ici, ou compile
# elle-même (npm run build) ; packages\core\src\test\offscreen.test.ts le vérifie.
function Assert-Compile {
  $repo = Split-Path $PSScriptRoot -Parent
  if (Test-Path (Join-Path $repo 'packages\core\dist\index.js')) { return }
  Push-Location $repo
  try { npm run build | Out-Null } finally { Pop-Location }
  if ($LASTEXITCODE -ne 0) { throw 'Compilation impossible (npm run build).' }
}

function Use-HorsEcran([string]$Ecrans = 'pc-dev') {
  if ($env:CYBERPINBALL_A_L_ECRAN -eq '1') {
    Remove-Item Env:CYBERPINBALL_HORS_ECRAN, Env:CYBERPINBALL_DISPLAYS -ErrorAction SilentlyContinue
    Write-Host 'À l''écran (CYBERPINBALL_A_L_ECRAN=1) : les fenêtres s''ouvrent sur les écrans du poste.' -ForegroundColor Yellow
    return
  }
  $file = Join-Path $PSScriptRoot "ecrans\$Ecrans.json"
  if (-not (Test-Path $file)) {
    $known = (Get-ChildItem (Join-Path $PSScriptRoot 'ecrans') -Filter *.json).BaseName -join ', '
    throw "Jeu d'écrans inconnu : $Ecrans (docs\ecrans : $known)."
  }
  $env:CYBERPINBALL_HORS_ECRAN = '1'
  $env:CYBERPINBALL_DISPLAYS = $file
  Write-Host "Hors écran, écrans simulés : docs\ecrans\$Ecrans.json"
}

# Modèle de borne d'un cabinet.json, au format d'un seul modèle (celui qu'on écrit dans un
# bac à sable). Depuis les configurations de la borne, cabinet.json en range plusieurs
# (version 2) : avec des écrans simulés (CYBERPINBALL_DISPLAYS), c'est la configuration que
# l'application reconnaîtrait pour ces écrans, sinon la plus proche (même règle,
# chooseConfiguration) ; sans écrans simulés, la configuration active. Sinon le menu de la
# démonstration demanderait laquelle prendre : la configuration active désigne les écrans
# branchés sur le poste aujourd'hui, pas ceux que la démonstration simule.
# Sans -AvecBoutons, les boutons relevés sont retirés : les touches par défaut des encodeurs
# (Start sur 1, Exit sur Échap…) sont celles que les démonstrations rejouent.
function Get-ModeleBorne([string]$Fichier, [switch]$AvecBoutons) {
  $core = Join-Path (Split-Path $PSScriptRoot -Parent) 'packages\core\dist\index.js'
  Assert-Compile
  $script = @'
const [core, file, displaysFile, keep] = process.argv.slice(1);
const fs = require('fs');
const read = (f) => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, ''));
const raw = read(file);
if (!raw.configurations) {
  if (keep !== '1') delete raw.buttons;
  console.log(JSON.stringify(raw));
  process.exit(0);
}
const c = require(core);
const set = c.toCabinetSet(raw).set;
let pick = c.activeConfiguration(set) ?? set.configurations[0];
if (displaysFile) {
  const d = read(displaysFile);
  const displays = Array.isArray(d) ? d : d.displays;
  const choice = c.chooseConfiguration(set, displays);
  const best = [...choice.scores].sort((a, b) => b.points - a.points)[0];
  const id = c.chosenId(choice) ?? best?.id;
  pick = set.configurations.find((x) => x.id === id) ?? pick;
}
const { id, name, iniFile, ...cabinet } = pick;
if (keep !== '1') delete cabinet.buttons;
console.log(JSON.stringify(cabinet));
'@
  $json = node -e $script $core $Fichier "$env:CYBERPINBALL_DISPLAYS" $(if ($AvecBoutons) { '1' } else { '0' })
  if ($LASTEXITCODE -ne 0) { throw "Modèle de borne illisible : $Fichier" }
  return $json | ConvertFrom-Json
}

# Copie d'un cabinet.json dans le dossier d'un bac à sable, toutes configurations gardées,
# sans les boutons relevés (même règle que Get-ModeleBorne). Renvoie le fichier écrit.
function Copy-ModeleBorne([string]$Fichier, [string]$Dossier) {
  $dest = Join-Path $Dossier 'cabinet.json'
  $script = @'
const [file, dest] = process.argv.slice(1);
const fs = require('fs');
const raw = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
delete raw.buttons;
for (const c of raw.configurations ?? []) delete c.buttons;
fs.writeFileSync(dest, JSON.stringify(raw, null, 2));
'@
  node -e $script $Fichier $dest
  if ($LASTEXITCODE -ne 0) { throw "Modèle de borne illisible : $Fichier" }
  return $dest
}

function Assert-EcransDuPoste([string]$Quoi) {
  if ($env:CYBERPINBALL_A_L_ECRAN -ne '1') {
    throw "$Quoi nécessite les écrans du poste : impossible hors écran. Relancer avec `$env:CYBERPINBALL_A_L_ECRAN = '1' (les fenêtres prennent alors les écrans et le focus)."
  }
  Remove-Item Env:CYBERPINBALL_HORS_ECRAN, Env:CYBERPINBALL_DISPLAYS -ErrorAction SilentlyContinue
}

# ---------------------------------------------------------------------------
# Bureau caché : une démonstration se relance tout entière (PowerShell, node, Electron,
# outils en ligne de commande, consoles comprises) sur un bureau Windows à part, que
# l'utilisateur ne voit jamais. Quoi qu'il arrive (fenêtre montrée par erreur, boîte de
# dialogue, console), rien ne peut apparaître sur ses écrans ni lui prendre le focus.
# La sortie de la démonstration revient dans la console d'origine.

$BureauCache = 'CyberPinballEssais'

if (-not ('CyberPinball.BureauCache' -as [type])) {
  Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Runtime.InteropServices;
namespace CyberPinball {
  public static class BureauCache {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct STARTUPINFO { public int cb; public string lpReserved; public string lpDesktop; public string lpTitle; public int dwX, dwY, dwXSize, dwYSize, dwXCountChars, dwYCountChars, dwFillAttribute, dwFlags; public short wShowWindow, cbReserved2; public IntPtr lpReserved2, hStdInput, hStdOutput, hStdError; }
    [StructLayout(LayoutKind.Sequential)]
    struct PROCESS_INFORMATION { public IntPtr hProcess, hThread; public int dwProcessId, dwThreadId; }
    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern IntPtr CreateDesktop(string name, IntPtr device, IntPtr mode, int flags, uint access, IntPtr sa);
    [DllImport("user32.dll")] static extern bool CloseDesktop(IntPtr desktop);
    [DllImport("user32.dll")] static extern IntPtr GetThreadDesktop(int threadId);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern bool GetUserObjectInformation(IntPtr obj, int index, [Out] char[] info, int length, out int needed);
    [DllImport("kernel32.dll")] static extern int GetCurrentThreadId();
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool CreateProcess(string app, string cmd, IntPtr pa, IntPtr ta, bool inherit, uint flags, IntPtr env, string dir, ref STARTUPINFO si, out PROCESS_INFORMATION pi);
    [DllImport("kernel32.dll")] static extern bool SetHandleInformation(IntPtr handle, int mask, int flags);
    [DllImport("kernel32.dll")] public static extern uint WaitForSingleObject(IntPtr handle, uint ms);
    [DllImport("kernel32.dll")] static extern bool GetExitCodeProcess(IntPtr process, out int code);
    [DllImport("kernel32.dll")] public static extern bool TerminateProcess(IntPtr process, int code);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);

    /** Nom du bureau de ce processus (« Default » : celui de l'utilisateur). */
    public static string Current() {
      var name = new char[256]; int needed;
      return GetUserObjectInformation(GetThreadDesktop(GetCurrentThreadId()), 2, name, name.Length * 2, out needed) ? new string(name).TrimEnd('\0') : "";
    }

    public class Run { public IntPtr Desktop, Process; public int Pid; }

    /** Lance la ligne de commande sur le bureau caché, sortie et erreurs dans le journal. */
    public static Run Start(string desktop, string commandLine, string directory, string log) {
      IntPtr d = CreateDesktop(desktop, IntPtr.Zero, IntPtr.Zero, 0, 0x10000000u, IntPtr.Zero);
      if (d == IntPtr.Zero) throw new Exception("CreateDesktop a échoué (code " + Marshal.GetLastWin32Error() + ").");
      using (var file = new FileStream(log, FileMode.Create, FileAccess.Write, FileShare.ReadWrite)) {
        IntPtr h = file.SafeFileHandle.DangerousGetHandle();
        SetHandleInformation(h, 1, 1);
        var si = new STARTUPINFO();
        si.cb = Marshal.SizeOf(si);
        si.lpDesktop = desktop;
        si.dwFlags = 0x100 | 0x1;  // STARTF_USESTDHANDLES | STARTF_USESHOWWINDOW
        si.wShowWindow = 0;        // SW_HIDE
        si.hStdOutput = h; si.hStdError = h;
        PROCESS_INFORMATION pi;
        // CREATE_NO_WINDOW : une console sans fenêtre, que les outils lancés ensuite partagent.
        if (!CreateProcess(null, commandLine, IntPtr.Zero, IntPtr.Zero, true, 0x08000000u, IntPtr.Zero, directory, ref si, out pi)) {
          int error = Marshal.GetLastWin32Error();
          CloseDesktop(d);
          throw new Exception("CreateProcess a échoué (code " + error + ").");
        }
        CloseHandle(pi.hThread);
        return new Run { Desktop = d, Process = pi.hProcess, Pid = pi.dwProcessId };
      }
    }

    public static int Finish(Run run) {
      int code; GetExitCodeProcess(run.Process, out code);
      CloseHandle(run.Process);
      CloseDesktop(run.Desktop);
      return code;
    }
  }
}
'@
}

function Test-BureauCache { [CyberPinball.BureauCache]::Current() -eq $BureauCache }

# Lance une ligne de commande sur le bureau caché, recopie sa sortie ici au fil de l'eau,
# et renvoie son code de sortie.
function Invoke-BureauCache([string]$Ligne, [string]$Dossier = (Get-Location).Path, [string]$Journal) {
  if (-not $Journal) { $Journal = Join-Path ([IO.Path]::GetTempPath()) "cyberpinball-bureau-cache-$PID-$(Get-Random).txt" }
  $run = [CyberPinball.BureauCache]::Start($BureauCache, $Ligne, $Dossier, $Journal)
  $state = @{ read = 0L }
  $copy = {
    $stream = [IO.File]::Open($Journal, 'Open', 'Read', 'ReadWrite')
    try {
      if ($stream.Length -gt $state.read) {
        $stream.Position = $state.read
        $bytes = [byte[]]::new($stream.Length - $state.read)
        $n = $stream.Read($bytes, 0, $bytes.Length)
        $state.read += $n
        [Console]::Out.Write([Text.Encoding]::UTF8.GetString($bytes, 0, $n))
      }
    } finally { $stream.Dispose() }
  }
  try {
    while ([CyberPinball.BureauCache]::WaitForSingleObject($run.Process, 500) -ne 0) { & $copy }
    & $copy
  } finally {
    # Interrompu (Ctrl+C) : rien ne doit rester à tourner sur le bureau caché.
    if ([CyberPinball.BureauCache]::WaitForSingleObject($run.Process, 0) -ne 0) {
      & taskkill.exe /PID $run.Pid /T /F | Out-Null
    }
  }
  return [CyberPinball.BureauCache]::Finish($run)
}

# Au début d'une démonstration : relance le script, avec les mêmes paramètres, sur le bureau
# caché, puis renvoie $true ($LASTEXITCODE : son code de sortie). $false quand le script y est
# déjà, ou à l'écran (CYBERPINBALL_A_L_ECRAN=1) : il continue alors normalement.
function Enter-BureauCache([string]$Script, [System.Collections.IDictionary]$Parametres = @{}) {
  if ($env:CYBERPINBALL_A_L_ECRAN -eq '1' -or (Test-BureauCache)) { return $false }
  $quote = { param($v) "'" + ("$v" -replace "'", "''") + "'" }
  $args_ = foreach ($k in $Parametres.Keys) {
    $v = $Parametres[$k]
    if ($v -is [switch] -or $v -is [bool]) { if ($v) { "-$k" } }
    elseif ($v -is [array]) { "-$k " + (($v | ForEach-Object { & $quote $_ }) -join ',') }
    else { "-$k " + (& $quote $v) }
  }
  $command = "[Console]::OutputEncoding = [Text.Encoding]::UTF8; `$global:LASTEXITCODE = 0; & $(& $quote $Script) $($args_ -join ' '); exit `$LASTEXITCODE"
  $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($command))
  $shell = (Get-Process -Id $PID).Path
  Write-Host "Sur un bureau Windows caché : $(Split-Path $Script -Leaf) (rien n'apparaît sur les écrans du poste)." -ForegroundColor DarkGray
  $global:LASTEXITCODE = Invoke-BureauCache "`"$shell`" -NoProfile -ExecutionPolicy Bypass -OutputFormat Text -EncodedCommand $encoded" (Get-Location).Path
  return $true
}

# Bilan du guet de app\src\offscreen.ts (hors-ecran.txt dans le dossier des captures).
function Assert-HorsEcran([string]$Captures) {
  if ($env:CYBERPINBALL_A_L_ECRAN -eq '1') { return }
  $report = Join-Path $Captures 'hors-ecran.txt'
  if (-not (Test-Path $report)) { throw "Hors écran : bilan du guet absent ($report)." }
  $text = Get-Content $report -Raw -Encoding UTF8
  if ($text -notmatch '^Aucune fenêtre visible') { throw "Hors écran : des fenêtres sont apparues sur les écrans du poste :`n$text" }
}
