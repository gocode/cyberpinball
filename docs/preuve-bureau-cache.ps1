# Preuve que le bureau caché des démonstrations (docs\hors-ecran.ps1) ne montre rien à
# l'utilisateur : des processus y sont lancés pendant qu'un guet, depuis le bureau de
# l'utilisateur, relève toute fenêtre visible nouvelle et tout changement de premier plan.
# Côté bureau caché, une énumération des fenêtres confirme qu'elles existent bien, là-bas.
#   .\docs\preuve-bureau-cache.ps1 -Etape notepad    # processus inoffensif
#   .\docs\preuve-bureau-cache.ps1 -Etape console    # consoles (cmd, PowerShell) et leurs enfants
#   .\docs\preuve-bureau-cache.ps1 -Etape electron   # fenêtre Electron normale, plein écran, focus demandé
# Échoue si la moindre fenêtre de ces processus apparaît sur le bureau de l'utilisateur.
param([ValidateSet('notepad', 'console', 'electron')] [string]$Etape = 'notepad', [int]$Secondes = 6)
$ErrorActionPreference = 'Stop'
$wt = Split-Path $PSScriptRoot -Parent
. "$PSScriptRoot\hors-ecran.ps1"
if (Test-BureauCache) { throw 'À lancer depuis le bureau de l''utilisateur.' }

if (-not ('CyberPinball.Fenetres' -as [type])) {
  Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
namespace CyberPinball {
  public static class Fenetres {
    delegate bool EnumProc(IntPtr hwnd, IntPtr param);
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc proc, IntPtr param);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hwnd);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr hwnd, StringBuilder text, int max);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr hwnd, StringBuilder text, int max);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    static string Describe(IntPtr hwnd) {
      uint pid; GetWindowThreadProcessId(hwnd, out pid);
      var t = new StringBuilder(256); GetWindowText(hwnd, t, 256);
      var c = new StringBuilder(256); GetClassName(hwnd, c, 256);
      return hwnd.ToInt64() + "|" + pid + "|" + c + "|" + t;
    }
    /** Fenêtres visibles de premier niveau du bureau de ce processus : « hwnd|pid|classe|titre ». */
    public static List<string> Visible() {
      var list = new List<string>();
      EnumWindows((h, p) => { if (IsWindowVisible(h)) list.Add(Describe(h)); return true; }, IntPtr.Zero);
      return list;
    }
    public static string Foreground() { var h = GetForegroundWindow(); return h == IntPtr.Zero ? "" : Describe(h); }
  }
}
'@
}

$work = "$wt\tmp\preuve-bureau-cache"
if (Test-Path $work) { Remove-Item -Recurse -Force $work }
New-Item -ItemType Directory -Force $work | Out-Null
$seen = "$work\vu-sur-le-bureau-cache.txt"
# Côté bureau caché : lance les processus de l'étape, puis relève les fenêtres visibles de ce bureau-là.
$enumerate = "Add-Type -TypeDefinition (Get-Content -Raw '$work\fenetres.cs'); Start-Sleep -Seconds $([Math]::Max(2, $Secondes - 3)); [CyberPinball.Fenetres]::Visible() | Set-Content -Encoding UTF8 '$seen'; foreach (`$p in `$lances) { taskkill.exe /T /F /PID `$p.Id 2>&1 | Out-Null }; exit 0"
(Get-Content -Raw $PSCommandPath) -match "(?s)@'\r?\n(using System;.*?)\r?\n'@" | Out-Null
Set-Content -Path "$work\fenetres.cs" -Value $Matches[1] -Encoding UTF8
$launch = switch ($Etape) {
  'notepad' { "`$lances = @(Start-Process notepad.exe -PassThru)" }
  # Outils en ligne de commande lancés comme dans les démonstrations : ils héritent de la console
  # sans fenêtre du bureau caché. (Une NOUVELLE console, Start-Process sans -NoNewWindow ou
  # « start », serait confiée par Windows au Terminal, sur le bureau de l'utilisateur : interdit.)
  'console' { "`$lances = @(); cmd.exe /c 'echo enfant & ping -n 3 127.0.0.1 >nul'; powershell.exe -NoProfile -Command 'Write-Host petit-enfant'; node -e `"require('child_process').execFileSync('cmd', ['/c', 'echo arriere-petit-enfant'], { stdio: 'inherit' })`"; Start-Process cmd.exe -ArgumentList '/c', 'ping -n 3 127.0.0.1 >nul' -NoNewWindow -Wait" }
  'electron' {
    Set-Content -Path "$work\fenetre.js" -Encoding UTF8 -Value @'
const { app, BrowserWindow, screen } = require('electron');
app.whenReady().then(() => {
  const win = new BrowserWindow({ frame: false, backgroundColor: '#ff3d7f' });
  win.setBounds(screen.getPrimaryDisplay().bounds);
  win.setFullScreen(true);
  win.show(); win.focus(); win.moveTop();
  win.loadURL('data:text/html,<h1>Fenêtre de preuve du bureau caché</h1>');
  setTimeout(() => app.quit(), 5000);
});
'@
    "`$lances = @(Start-Process (node -p `"require('electron')`") -ArgumentList '`"$work\fenetre.js`"', '--user-data-dir=`"$work\chromium`"' -PassThru)"
  }
}
$command = "$launch; $enumerate"
$encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($command))
$shell = (Get-Process -Id $PID).Path

$before = @{}
foreach ($w in [CyberPinball.Fenetres]::Visible()) { $before[$w] = $true }
$foreground = [CyberPinball.Fenetres]::Foreground()
$known = @{}
foreach ($p in Get-Process) { $known[$p.Id] = $true }

# Le guet tourne pendant que le bureau caché travaille (tâche de fond : même bureau que ce script).
$watch = Start-Job -ArgumentList "$work\fenetres.cs", ($Secondes + 6), ($known.Keys -join ','), ($before.Keys -join "`n"), $foreground -ScriptBlock {
  param($cs, $seconds, $knownPids, $beforeText, $foreground)
  Add-Type -TypeDefinition (Get-Content -Raw $cs)
  $known = @{}; foreach ($p in $knownPids -split ',') { $known[[int]$p] = $true }
  $before = @{}; foreach ($w in $beforeText -split "`n") { $before[$w] = $true }
  $found = @{}
  $end = (Get-Date).AddSeconds($seconds)
  while ((Get-Date) -lt $end) {
    foreach ($w in [CyberPinball.Fenetres]::Visible()) {
      $pid_ = [int]($w -split '\|')[1]
      if (-not $before.ContainsKey($w) -and -not $known.ContainsKey($pid_)) { $found["visible : $w"] = $true }
    }
    $fg = [CyberPinball.Fenetres]::Foreground()
    if ($fg -and $fg -ne $foreground) {
      $pid_ = [int]($fg -split '\|')[1]
      if (-not $known.ContainsKey($pid_)) { $found["premier plan : $fg"] = $true }
    }
    Start-Sleep -Milliseconds 50
  }
  $found.Keys
}
Start-Sleep -Seconds 2   # le guet est prêt
$code = Invoke-BureauCache "`"$shell`" -NoProfile -ExecutionPolicy Bypass -EncodedCommand $encoded" $wt "$work\journal.txt"
$appeared = @(Receive-Job $watch -Wait -AutoRemoveJob)

$hidden = if (Test-Path $seen) { @(Get-Content $seen | Where-Object { $_ -match 'Notepad|ConsoleWindowClass|CASCADIA|Chrome_WidgetWin|Bloc-notes' }) } else { @() }
"Étape $Etape : code $code"
"Fenêtres de l'étape vues sur le bureau caché : $($hidden.Count)"
$hidden | ForEach-Object { "  $_" }
if ($appeared.Count) {
  "Fenêtres apparues sur le bureau de l'utilisateur : $($appeared.Count)"
  $appeared | ForEach-Object { "  $_" }
  throw "Le bureau caché a laissé passer des fenêtres ($Etape)."
}
"Aucune fenêtre nouvelle ni changement de premier plan sur le bureau de l'utilisateur."
