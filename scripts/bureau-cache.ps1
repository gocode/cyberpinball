# Bureau Windows caché : un script PowerShell se relance tout entier sur un bureau à part, que
# l'utilisateur ne voit jamais (rien ne s'affiche sur ses écrans, rien ne lui prend le focus).
#   . "$PSScriptRoot\bureau-cache.ps1"
#   if (Enter-BureauCache $PSCommandPath $PSBoundParameters) { exit $LASTEXITCODE }
#   Assert-Compile                        # compile le dépôt s'il ne l'est pas encore
# Utilisé par scripts\diagnostic-habillage.ps1 (npm run habillage).

# Le code compilé (packages\*\dist, app\dist) : dans une copie neuve du dépôt, il n'existe pas
# encore. Tout script qui s'en sert passe par ici, ou compile lui-même (npm run build) ;
# packages\core\src\test\offscreen.test.ts le vérifie.
function Assert-Compile {
  $repo = Split-Path $PSScriptRoot -Parent
  if (Test-Path (Join-Path $repo 'packages\core\dist\index.js')) { return }
  Push-Location $repo
  try { npm run build | Out-Null } finally { Pop-Location }
  if ($LASTEXITCODE -ne 0) { throw 'Compilation impossible (npm run build).' }
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
  $code = Invoke-BureauCache "`"$shell`" -NoProfile -ExecutionPolicy Bypass -OutputFormat Text -EncodedCommand $encoded" (Get-Location).Path
  Remove-JonctionsSortantes
  $global:LASTEXITCODE = $code
  return $true
}

# Jonctions laissées dans tmp\ par un essai (vers des dossiers hors du dépôt) : retirées à la
# fin, les captures restent. Un rangement du disque qui suivrait les jonctions (Robocopy /MOVE)
# viderait leurs cibles. rmdir sur la jonction elle-même, sans /s : la cible n'est jamais parcourue.
function Remove-JonctionsSortantes {
  $repo = (Resolve-Path (Split-Path $PSScriptRoot -Parent)).Path
  $tmp = Join-Path $repo 'tmp'
  if (-not (Test-Path $tmp)) { return }
  Get-ChildItem $tmp -Directory -Recurse -Depth 4 -Force -Attributes ReparsePoint -ErrorAction SilentlyContinue | ForEach-Object {
    $target = "$($_.Target)"
    if ($target -and -not $target.StartsWith($repo, [StringComparison]::OrdinalIgnoreCase)) { cmd /c rmdir "$($_.FullName)" }
  }
}
