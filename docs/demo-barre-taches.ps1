# Démonstration sans opérateur : la barre des tâches de Windows ne cache le bas d'aucune
# fenêtre de Cyber Pinball. capturePage ne voit que la page, jamais la barre des tâches :
# ces captures-ci sont celles du bureau entier (CopyFromScreen), tous écrans compris.
# Bac à sable dans tmp\demo-barre-taches (copie du modèle de borne et du VPinballX.ini
# réels, une table factice), puis trois lancements, chacun attendu jusqu'au bout :
#   1. menu des tables ;
#   2. réglages de VPX (--reglages) ;
#   3. assistant, étape « Boutons » (--assistant --boutons), sur tous les écrans ;
#   4. menu système > « Bureau Windows » : tout se réduit, puis le playfield est rouvert
#      comme par son bouton dans la barre des tâches ; le menu recouvre de nouveau tout.
# Avec -Partie (VPX réel, copie de Terminator 2, environ une minute) : le menu lance une
# partie arrêtée seule après 10 s, puis revient ; il doit couvrir encore son écran.
# Captures dans tmp\captures\barre-taches\<Etiquette>\<scénario> : bureau-*.png (tout le
# bureau, réduit au tiers), bas-*.png et haut-*.png (bas et haut de l'écran principal, en
# taille réelle : barre des tâches, liseré d'une fenêtre sans cadre) et bords.txt (luminosité
# de la première et de la dernière ligne de chaque écran, à chaque capture). La barre des tâches doit rester visible sur l'écran
# principal pendant les captures : rien d'autre ne doit être au premier plan, et aucune autre
# instance de Cyber Pinball ne doit tourner (ses fenêtres se mêleraient aux captures).
#   .\docs\demo-barre-taches.ps1 -Etiquette apres [-Scenarios bureau]
# Nécessite les écrans du poste : refusée hors écran, ne se lance qu'avec
# $env:CYBERPINBALL_A_L_ECRAN = '1' (docs\hors-ecran.ps1).
param(
  [string]$Etiquette = 'apres',
  [switch]$Partie,
  [string[]]$Scenarios = @('menu', 'reglages', 'assistant', 'bureau'),
  [string]$Source = 'D:\CyberPinball',
  [int]$Secondes = 6
)
$ErrorActionPreference = 'Stop'
$wt = Split-Path $PSScriptRoot -Parent
. "$PSScriptRoot\hors-ecran.ps1"
Assert-EcransDuPoste 'La démonstration de la barre des tâches (captures du bureau entier)'
$base = "$wt\tmp\demo-barre-taches"
$captures = "$wt\tmp\captures\barre-taches\$Etiquette"

# La jonction d'abord, seule : un effacement récursif ne doit jamais descendre dans la vraie racine.
if (Test-Path "$base\root\emulators") { [IO.Directory]::Delete("$base\root\emulators") }
if (Test-Path $base) { Remove-Item -Recurse -Force $base }
$root = "$base\root"; $home_ = "$base\home"
New-Item -ItemType Directory -Force "$root\tables", "$home_\sandbox", $captures | Out-Null
$model = Get-ModeleBorne "$Source\data\cabinet.json"
$model.vpx.iniPath = "$home_\sandbox\VPinballX.ini"
$model | ConvertTo-Json -Depth 20 | Set-Content -Path "$home_\cabinet.json" -Encoding UTF8
Copy-Item "$Source\config\VPinballX.ini" "$home_\sandbox\VPinballX.ini"
if ($Partie) {
  $t2 = "$Source\tables\Terminator 2"; $table = "$root\tables\Terminator 2"
  New-Item -ItemType Directory -Force $table | Out-Null
  Copy-Item "$t2\Terminator 2 (Williams 1991) g5k 1.25.vpx" $table
  Copy-Item "$t2\Terminator 2.directb2s" "$table\Terminator 2 (Williams 1991) g5k 1.25.directb2s"
  Copy-Item -Recurse "$t2\pinmame" $table
  # VPX lui-même est partagé (lecture seule) : jonction vers les émulateurs de la vraie racine.
  New-Item -ItemType Junction -Path "$root\emulators" -Target "$Source\emulators" | Out-Null
} else {
  # Une table factice, pour que le menu s'affiche (VPX n'est jamais lancé).
  New-Item -ItemType Directory -Force "$root\tables\Demo (Cyber Pinball 2026)" | Out-Null
  Set-Content -Path "$root\tables\Demo (Cyber Pinball 2026)\Demo (Cyber Pinball 2026).vpx" -Value '' -Encoding ASCII
}
Set-Content -Path "$base\sans-son.json" -Value '[]' -Encoding ASCII

$env:CYBERPINBALL_ROOT = $root
$env:CYBERPINBALL_HOME = $home_
$env:CYBERPINBALL_AUDIO_OUTPUTS = "$base\sans-son.json"
$electron = node -p "require('electron')"
$autres = @(Get-Process CyberPinball -ErrorAction SilentlyContinue)
if ($autres.Count) { Write-Warning "Cyber Pinball installé tourne ($($autres[0].Path)) : ses fenêtres peuvent passer devant celles de la démonstration." }

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class DemoFenetres {
  delegate bool EnumProc(IntPtr hwnd, IntPtr param);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc proc, IntPtr param);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr hwnd, StringBuilder text, int max);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hwnd, int command);
  public static IntPtr Find(int pid, string title) {
    IntPtr found = IntPtr.Zero;
    EnumWindows((hwnd, param) => {
      uint owner; GetWindowThreadProcessId(hwnd, out owner);
      var text = new StringBuilder(256); GetWindowText(hwnd, text, 256);
      if (owner == pid && text.ToString() == title) { found = hwnd; return false; }
      return true;
    }, IntPtr.Zero);
    return found;
  }
}
'@

function Invoke-Scenario([string]$name, [string[]]$codes, [string[]]$arguments, [int]$seconds, [scriptblock]$during) {
  $dir = "$captures\$name"
  if (Test-Path $dir) { Remove-Item -Recurse -Force $dir }
  New-Item -ItemType Directory -Force $dir | Out-Null
  $env:CYBERPINBALL_AUTOPILOT = $codes -join ','
  $env:CYBERPINBALL_CAPTURE = "$dir\pages"
  # Captures du bureau entier, en tâche de fond, pendant que Cyber Pinball tourne.
  $shots = Start-Job -ArgumentList $dir, $seconds -ScriptBlock {
    param($dir, $seconds)
    Add-Type -AssemblyName System.Windows.Forms, System.Drawing
    $all = [System.Windows.Forms.SystemInformation]::VirtualScreen
    $primary = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
    Set-Content -Path (Join-Path $dir 'pret') -Value ''
    $end = (Get-Date).AddSeconds($seconds)
    for ($i = 0; (Get-Date) -lt $end; $i++) {
      $bmp = [System.Drawing.Bitmap]::new($all.Width, $all.Height)
      $g = [System.Drawing.Graphics]::FromImage($bmp)
      $g.CopyFromScreen($all.Left, $all.Top, 0, 0, $bmp.Size)
      $small = [System.Drawing.Bitmap]::new($bmp, [int]($all.Width / 3), [int]($all.Height / 3))
      $small.Save((Join-Path $dir ('bureau-{0:D3}.png' -f $i)), [System.Drawing.Imaging.ImageFormat]::Png)
      # Bas de l'écran principal : 160 px, la barre des tâches comprise.
      $strip = [System.Drawing.Rectangle]::new($primary.Left - $all.Left, $primary.Bottom - 160 - $all.Top, $primary.Width, 160)
      $bas = $bmp.Clone($strip, $bmp.PixelFormat)
      $bas.Save((Join-Path $dir ('bas-{0:D3}.png' -f $i)), [System.Drawing.Imaging.ImageFormat]::Png)
      # Haut de l'écran principal : 40 px, là où une fenêtre sans cadre montre un liseré clair.
      $haut = $bmp.Clone([System.Drawing.Rectangle]::new($primary.Left - $all.Left, $primary.Top - $all.Top, $primary.Width, 40), $bmp.PixelFormat)
      $haut.Save((Join-Path $dir ('haut-{0:D3}.png' -f $i)), [System.Drawing.Imaging.ImageFormat]::Png)
      # Luminosité moyenne de la première et de la dernière ligne de chaque écran : un liseré
      # ou la barre des tâches les éclaircit (une page sombre reste sous 40).
      $lines = foreach ($s in [System.Windows.Forms.Screen]::AllScreens) {
        $b = $s.Bounds
        $rows = foreach ($y in $b.Top, ($b.Bottom - 1)) {
          $sum = 0; $n = 0
          for ($x = $b.Left; $x -lt $b.Right; $x += 8) { $c = $bmp.GetPixel($x - $all.Left, $y - $all.Top); $sum += ($c.R + $c.G + $c.B) / 3; $n++ }
          [int]($sum / $n)
        }
        "$($s.DeviceName) haut $($rows[0]) bas $($rows[1])"
      }
      Add-Content -Path (Join-Path $dir 'bords.txt') -Value ("{0:D3} : {1}" -f $i, ($lines -join ' · '))
      $g.Dispose(); $bmp.Dispose(); $small.Dispose(); $bas.Dispose(); $haut.Dispose()
      Start-Sleep -Milliseconds 1500
    }
  }
  # Une tâche de fond met plusieurs secondes à démarrer : les captures commencent avant Cyber Pinball.
  while (-not (Test-Path "$dir\pret")) { Start-Sleep -Milliseconds 200 }
  Remove-Item "$dir\pret"
  # Sortie d'Electron redirigée par cmd vers des fichiers : avec Start-Process -RedirectStandardOutput
  # sans -Wait, PowerShell ferme le tuyau et le premier console.log suivant plante (EPIPE).
  # cmd attend Electron : l'opérateur & n'attendrait pas la fin d'un programme graphique.
  $all = @('app', "--user-data-dir=`"$base\chromium-$name`"") + $arguments
  $line = "`"$electron`" $($all -join ' ') > `"$dir\sortie.txt`" 2> `"$dir\erreurs.txt`""
  $shell = Start-Process -FilePath cmd.exe -ArgumentList '/d', '/c', "`"$line`"" -WorkingDirectory $wt -NoNewWindow -PassThru
  if ($during) {
    $proc = $null
    for ($t = 0; $t -lt 100 -and -not $proc; $t++) {
      Start-Sleep -Milliseconds 100
      $proc = Get-CimInstance Win32_Process -Filter "ParentProcessId=$($shell.Id) AND Name='electron.exe'" | Select-Object -First 1 @{ n = 'Id'; e = { [int]$_.ProcessId } }
    }
    & $during $proc
  }
  $shell.WaitForExit()
  Stop-Job $shots; Remove-Job $shots
  "$name : $(@(Get-ChildItem $dir -Filter 'bureau-*.png').Count) captures du bureau dans $dir"
  Get-Content "$dir\bords.txt" | Select-Object -Skip 1 -First 3 | ForEach-Object { "  $_" }
  # coverDisplay signale toute fenêtre qui ne couvre pas son écran.
  Select-String -Path "$dir\sortie.txt", "$dir\erreurs.txt" -Pattern 'ne couvre pas son écran' | ForEach-Object { "  ATTENTION : $($_.Line)" }
}

$attente = $Secondes * 1000
# Touches de la borne copiée (celles du clavier par défaut sans relevé des boutons).
$start = if ($model.buttons.start) { $model.buttons.start } else { 'Digit1' }
$exit = if ($model.buttons.exit) { $model.buttons.exit } else { 'Escape' }
if ($Partie) {
  # Start ouvre la fiche, Start lance la partie (arrêtée seule après 10 s), puis le menu revient.
  Invoke-Scenario 'partie' @($start, $start, 'wait:45000', "wait:$attente") @() 90
} else {
  if ($Scenarios -contains 'menu') { Invoke-Scenario 'menu' @("wait:$attente") @() ($Secondes + 12) }
  # Une touche qui ne fait rien, répétée : l'écran reste affiché le temps des captures.
  if ($Scenarios -contains 'reglages') { Invoke-Scenario 'reglages' (@('F24') * ($Secondes * 2)) @('--reglages') ($Secondes + 12) }
  if ($Scenarios -contains 'assistant') { Invoke-Scenario 'assistant' @("Attendre$Secondes") @('--assistant', '--boutons') ($Secondes + 12) }
  # Exit : « plus tard » au message « VPX n'est pas installé », puis le menu système ;
  # 8e entrée : « Bureau Windows ».
  if ($Scenarios -contains 'bureau') { Invoke-Scenario 'bureau' @($exit, $exit, 'click:.lib-action[data-label="Bureau Windows"]', 'wait:12000') @() 30 {
    param($proc)
    $playfield = [IntPtr]::Zero
    for ($t = 0; $t -lt 100 -and ($playfield -eq [IntPtr]::Zero -or -not [DemoFenetres]::IsIconic($playfield)); $t++) {
      Start-Sleep -Milliseconds 200
      $playfield = [DemoFenetres]::Find($proc.Id, 'Cyber Pinball — Playfield')
    }
    if (-not [DemoFenetres]::IsIconic($playfield)) { '  ÉCHEC : le playfield ne s''est pas réduit'; return }
    "  $(Get-Date -Format HH:mm:ss) playfield réduit : le bureau est visible"
    Start-Sleep -Seconds 4
    # SW_RESTORE, comme un clic sur son bouton dans la barre des tâches.
    [void][DemoFenetres]::ShowWindowAsync($playfield, 9)
    "  $(Get-Date -Format HH:mm:ss) playfield rouvert"
  } }
}
