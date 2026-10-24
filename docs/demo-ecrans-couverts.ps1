# Démonstration sans opérateur : aucun écran de la borne ne montre le bureau Windows (ni sa
# barre des tâches), du démarrage du menu à la fin d'une partie. Juste avant chaque scénario,
# une capture du bureau entier sert de référence ; pendant le scénario, le bureau entier est
# capturé en continu (CopyFromScreen, tous écrans compris) et chaque écran est comparé à la
# référence : un point identique au bureau d'avant le lancement est un point de bureau visible.
# Bac à sable dans tmp\demo-ecrans-couverts (copie du modèle de borne, du VPinballX.ini réel et
# de Terminator 2 1.25 ; VPX partagé en lecture par une jonction vers les émulateurs réels).
# Scénarios (-Scenarios) :
#   partie         : Start, Start (fiche puis Jouer), partie arrêtée seule après 10 s, retour au menu ;
#   endurance      : test d'endurance (CYBERPINBALL_STRESS = -Lancements,10) ;
#   vers-assistant : menu système > « Configuration de la borne » > « Assistant complet » (relance de l'application) ;
#   vers-menu      : étape « Boutons » seule, laissée sans bouton : l'assistant rend la main au menu ;
#   reglages       : réglages de VPX seuls (--reglages), sur l'écran principal.
# Captures dans tmp\captures\ecrans-couverts\<Etiquette>\<scénario> : reference.png, bureau-*.png
# (réduites au tiers : une sur huit, et toutes celles où un écran montre le bureau),
# couverture.txt (part de chaque écran identique au bureau, en %, et celle de sa bande du bas,
# où est la barre des tâches) et sortie.txt (console de Cyber Pinball, constats du gardien).
# Aucune autre instance de Cyber Pinball ne doit tourner, et rien ne doit bouger sur le bureau
# pendant ce temps (une fenêtre qui change n'est plus identique à la référence).
#   .\docs\demo-ecrans-couverts.ps1 -Etiquette apres [-Scenarios partie,endurance] [-Lancements 10]
param(
  [string]$Etiquette = 'apres',
  [string[]]$Scenarios = @('partie', 'vers-assistant', 'vers-menu', 'reglages', 'endurance'),
  [int]$Lancements = 10,
  [string]$Source = 'D:\CyberPinball'
)
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\hors-ecran.ps1"
Assert-EcransDuPoste 'La démonstration des écrans couverts (captures du bureau entier, vraie partie)'
$wt = Split-Path $PSScriptRoot -Parent
$base = "$wt\tmp\demo-ecrans-couverts"
$captures = "$wt\tmp\captures\ecrans-couverts\$Etiquette"
$utf8 = [Text.UTF8Encoding]::new($false)

# La jonction d'abord, seule : un effacement récursif ne doit jamais descendre dans la vraie racine.
if (Test-Path "$base\root\emulators") { [IO.Directory]::Delete("$base\root\emulators") }
if (Test-Path $base) { Remove-Item -Recurse -Force $base }
$root = "$base\root"; $home_ = "$base\home"
New-Item -ItemType Directory -Force "$root\tables", "$home_\sandbox", $captures | Out-Null
$model = Get-ModeleBorne "$Source\data\cabinet.json"
$model.vpx.iniPath = "$home_\sandbox\VPinballX.ini"
# Sans BOM : JSON.parse refuse le BOM qu'écrit Set-Content -Encoding UTF8 de Windows PowerShell.
[IO.File]::WriteAllText("$home_\cabinet.json", ($model | ConvertTo-Json -Depth 20), $utf8)
Copy-Item "$Source\config\VPinballX.ini" "$home_\sandbox\VPinballX.ini"
$t2 = "$Source\tables\Terminator 2"; $table = "$root\tables\Terminator 2"
New-Item -ItemType Directory -Force $table | Out-Null
Copy-Item "$t2\Terminator 2 (Williams 1991) g5k 1.25.vpx" $table
Copy-Item "$t2\Terminator 2.directb2s" "$table\Terminator 2 (Williams 1991) g5k 1.25.directb2s"
Copy-Item -Recurse "$t2\pinmame" $table
New-Item -ItemType Junction -Path "$root\emulators" -Target "$Source\emulators" | Out-Null
[IO.File]::WriteAllText("$base\sans-son.json", '[]', $utf8)

$env:CYBERPINBALL_ROOT = $root
$env:CYBERPINBALL_HOME = $home_
$env:CYBERPINBALL_AUDIO_OUTPUTS = "$base\sans-son.json"
$electron = node -p "require('electron')"
$autres = @(Get-Process CyberPinball -ErrorAction SilentlyContinue)
if ($autres.Count) { Write-Warning "Cyber Pinball installé tourne ($($autres[0].Path)) : ses fenêtres fausseraient les captures." }

# Comparaison rapide d'une capture à la référence, écran par écran.
$comparateur = @'
using System;
using System.Runtime.InteropServices;
public static class Couverture {
  // Part (en %) des points de la zone identiques à la référence, parmi ceux que la référence
  // ne montre pas noirs (un écran noir de Cyber Pinball sur un fond d'écran noir ne compte pas).
  // Deux images 32 bits verrouillées (LockBits) de même taille ; zone en pixels de l'image.
  public static double Identique(IntPtr reference, IntPtr shot, int stride, int left, int top, int width, int height, int step) {
    int eligible = 0, same = 0;
    for (int y = top; y < top + height; y += step)
      for (int x = left; x < left + width; x += step) {
        int a = Marshal.ReadInt32(reference, y * stride + x * 4), b = Marshal.ReadInt32(shot, y * stride + x * 4);
        int ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
        if (Math.Max(ar, Math.Max(ag, ab)) <= 16) continue;
        eligible++;
        if (Math.Abs(ar - ((b >> 16) & 255)) <= 6 && Math.Abs(ag - ((b >> 8) & 255)) <= 6 && Math.Abs(ab - (b & 255)) <= 6) same++;
      }
    return eligible == 0 ? 0 : 100.0 * same / eligible;
  }
}
'@

function Invoke-Scenario([string]$name, [hashtable]$vars, [string[]]$arguments, [int]$seconds) {
  $dir = "$captures\$name"
  if (Test-Path $dir) { Remove-Item -Recurse -Force $dir }
  New-Item -ItemType Directory -Force $dir | Out-Null
  foreach ($k in 'CYBERPINBALL_AUTOPILOT', 'CYBERPINBALL_STRESS', 'CYBERPINBALL_TABLE') { Remove-Item "env:$k" -ErrorAction SilentlyContinue }
  foreach ($k in $vars.Keys) { Set-Item "env:$k" $vars[$k] }
  # Une autre instance de Cyber Pinball (un autre dossier de travail) occuperait les écrans et la
  # référence : on attend qu'elle se termine, cinq minutes au plus.
  $others = { @(Get-CimInstance Win32_Process -Filter "Name='electron.exe' OR Name='CyberPinball.exe'" | Where-Object { $_.CommandLine -match 'cyberpinball' -and $_.CommandLine -notmatch '--type=' -and $_.CommandLine -notlike "*$wt*" }) }
  for ($t = 0; $t -lt 300 -and (& $others).Count; $t++) {
    if ($t -eq 0) { Write-Warning "Une autre instance de Cyber Pinball tourne ($((& $others)[0].CommandLine)) : attente de sa fin." }
    Start-Sleep -Seconds 1
  }
  if ((& $others).Count) { throw 'Une autre instance de Cyber Pinball occupe toujours les écrans.' }
  $shots = Start-Job -ArgumentList $dir, $seconds, $wt, $comparateur -ScriptBlock {
    param($dir, $seconds, $wt, $comparateur)
    Add-Type -AssemblyName System.Windows.Forms, System.Drawing
    Add-Type -TypeDefinition $comparateur
    $all = [System.Windows.Forms.SystemInformation]::VirtualScreen
    $screens = [System.Windows.Forms.Screen]::AllScreens
    $format = [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
    $full = [System.Drawing.Rectangle]::new(0, 0, $all.Width, $all.Height)
    function Capture {
      $bmp = [System.Drawing.Bitmap]::new($all.Width, $all.Height, $format)
      $g = [System.Drawing.Graphics]::FromImage($bmp)
      $g.CopyFromScreen($all.Left, $all.Top, 0, 0, $bmp.Size); $g.Dispose()
      $bmp
    }
    $reference = Capture
    $small = [System.Drawing.Bitmap]::new($reference, [int]($all.Width / 3), [int]($all.Height / 3))
    $small.Save((Join-Path $dir 'reference.png'), [System.Drawing.Imaging.ImageFormat]::Png); $small.Dispose()
    $refBits = $reference.LockBits($full, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, $format)
    [IO.File]::WriteAllText((Join-Path $dir 'pret'), '')
    $end = (Get-Date).AddSeconds($seconds)
    for ($i = 0; (Get-Date) -lt $end -and -not (Test-Path (Join-Path $dir 'fin')); $i++) {
      # Cyber Pinball tourne-t-il (Electron de ce dossier) ? Après sa fermeture, le bureau revient normalement.
      $electrons = @(Get-Process electron, CyberPinball -ErrorAction SilentlyContinue)
      $alive = @($electrons | Where-Object { $_.Path -like "$wt\*" }).Count -gt 0
      # Instance d'un autre dossier de travail (une autre session) : ses fenêtres faussent la capture.
      $other = @($electrons | Where-Object { $_.Path -match 'cyberpinball' -and $_.Path -notlike "$wt\*" }).Count -gt 0
      try { $shot = Capture }
      catch {
        # Poste verrouillé (écran de connexion) : plus rien à capturer jusqu'au déverrouillage.
        Add-Content -Path (Join-Path $dir 'couverture.txt') -Value ('{0:D4} {1:HH:mm:ss.fff} verrou  : capture impossible ({2})' -f $i, (Get-Date), $_.Exception.InnerException.Message)
        Start-Sleep -Seconds 1
        continue
      }
      $bits = $shot.LockBits($full, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, $format)
      $flag = $false
      $parts = foreach ($s in $screens) {
        $b = $s.Bounds
        $x = $b.Left - $all.Left; $y = $b.Top - $all.Top
        $screen = [Couverture]::Identique($refBits.Scan0, $bits.Scan0, $bits.Stride, $x, $y, $b.Width, $b.Height, 8)
        # Bande du bas : la barre des tâches.
        $bottom = [Couverture]::Identique($refBits.Scan0, $bits.Scan0, $bits.Stride, $x, $y + $b.Height - 60, $b.Width, 60, 4)
        if ($alive -and ($screen -gt 0.5 -or $bottom -gt 5)) { $flag = $true }
        '{0} {1:N1}/{2:N1}' -f $s.DeviceName.Replace('\\.\', ''), $screen, $bottom
      }
      $shot.UnlockBits($bits)
      $mark = if (-not $alive) { 'arrêté ' } elseif ($other) { 'autre  ' } elseif ($flag) { 'BUREAU ' } else { 'couvert' }
      Add-Content -Path (Join-Path $dir 'couverture.txt') -Value ('{0:D4} {1:HH:mm:ss.fff} {2} : {3}' -f $i, (Get-Date), $mark, ($parts -join ' · '))
      if ($flag -or $i % 8 -eq 0) {
        $small = [System.Drawing.Bitmap]::new($shot, [int]($all.Width / 3), [int]($all.Height / 3))
        $small.Save((Join-Path $dir ('bureau-{0:D4}.png' -f $i)), [System.Drawing.Imaging.ImageFormat]::Png); $small.Dispose()
      }
      $shot.Dispose()
      Start-Sleep -Milliseconds 150
    }
  }
  # Une tâche de fond met plusieurs secondes à démarrer : les captures commencent avant Cyber Pinball.
  while (-not (Test-Path "$dir\pret")) {
    if ($shots.State -eq 'Failed') { Receive-Job $shots; throw 'Captures impossibles' }
    Start-Sleep -Milliseconds 200
  }
  Remove-Item "$dir\pret"
  # Sortie d'Electron redirigée par cmd vers des fichiers ; cmd attend Electron (l'opérateur & n'attend
  # pas un programme graphique). Arguments en une seule chaîne : PowerShell 7 ne les requote pas.
  $all = @('app', "--user-data-dir=`"$base\chromium-$name`"") + $arguments
  $line = "`"$electron`" $($all -join ' ') > `"$dir\sortie.txt`" 2> `"$dir\erreurs.txt`""
  $shell = Start-Process -FilePath cmd.exe -ArgumentList "/d /c `"$line`"" -WorkingDirectory $wt -NoNewWindow -PassThru
  $shell.WaitForExit()
  # Une relance (assistant ↔ menu) laisse le nouveau processus seul : on attend aussi sa fin.
  for ($t = 0; $t -lt 600 -and @(Get-Process electron -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "$wt\*" }).Count; $t++) { Start-Sleep -Milliseconds 500 }
  Start-Sleep -Seconds 2
  [IO.File]::WriteAllText("$dir\fin", '')
  Wait-Job $shots -Timeout 30 | Out-Null; Receive-Job $shots; Remove-Job $shots -Force
  Remove-Item "$dir\fin" -ErrorAction SilentlyContinue

  # Bilan : le temps de démarrage (du lancement au premier instant où tout est couvert), puis
  # chaque capture où un écran montre le bureau alors que Cyber Pinball tourne.
  $rows = @(Get-Content "$dir\couverture.txt" -Encoding utf8)
  $alive = @($rows | Where-Object { $_ -notmatch ' arrêté  : ' })
  $others = @($rows | Where-Object { $_ -match ' autre   : ' }).Count
  $first = $alive | Select-Object -First 1
  $covered = $alive | Where-Object { $_ -match ' couvert : ' } | Select-Object -First 1
  $time = { param($row) [datetime]::ParseExact($row.Substring(5, 12), 'HH:mm:ss.fff', $null) }
  $startup = if ($first -and $covered) { ((& $time $covered) - (& $time $first)).TotalSeconds } else { $null }
  # Après la dernière capture couverte, l'application se ferme : le bureau revient, c'est voulu.
  $last = $alive | Where-Object { $_ -match ' couvert : ' } | Select-Object -Last 1
  $after = if ($covered) { $alive[[array]::IndexOf($alive, $covered)..[array]::IndexOf($alive, $last)] } else { @() }
  $closing = @($alive[([array]::IndexOf($alive, $last) + 1)..($alive.Count - 1)] | Where-Object { $_ -match ' BUREAU  : ' }).Count
  if ($closing) { "  fermeture : bureau revenu ($closing capture$(if ($closing -gt 1) { 's' }) avant la fin du processus)" }
  $bad = @($after | Where-Object { $_ -match ' BUREAU  : ' })
  "$name : $($rows.Count) captures, $($alive.Count) pendant que Cyber Pinball tourne$(if ($others) { ", dont $others ignorées (autre instance de Cyber Pinball)" })"
  $locked = @($rows | Where-Object { $_ -match ' verrou  : ' }).Count
  if ($locked) { "  POSTE VERROUILLÉ : $locked captures impossibles, scénario à rejouer" }
  if ($null -ne $startup) { '  démarrage : bureau visible au plus {0:N1} s (avant les premières fenêtres)' -f $startup }
  if ($bad.Count) { "  BUREAU VISIBLE sur $($bad.Count) captures ensuite :"; $bad | Select-Object -First 12 | ForEach-Object { "    $_" } }
  else { '  ensuite : tous les écrans couverts à chaque capture' }
  Select-String -Path "$dir\sortie.txt", "$dir\erreurs.txt" -Pattern 'Écran «|ne couvre pas|Bilan|Écrans :|^#\d+' -Encoding utf8 | ForEach-Object { "  console : $($_.Line)" }
}

$start = if ($model.buttons.start) { $model.buttons.start } else { 'Digit1' }
foreach ($scenario in $Scenarios) {
  switch ($scenario) {
    # Start ouvre la fiche, Start lance la partie (arrêtée seule après 10 s), puis le menu revient.
    'partie' { Invoke-Scenario 'partie' @{ CYBERPINBALL_AUTOPILOT = "$start,$start,wait:40000,wait:6000" } @() 100 }
    'endurance' { Invoke-Scenario 'endurance' @{ CYBERPINBALL_STRESS = "$Lancements,10"; CYBERPINBALL_TABLE = '1.25' } @() (60 + $Lancements * 40) }
    # Roue dentée, puis 4e entrée du menu système. Le menu veut ensuite se fermer (fin de son
    # autopilote, « Attendre12 » n'y est qu'une touche) : la relève doit le retenir jusqu'à ce que
    # l'assistant soit à l'écran. L'assistant relancé rejoue les mêmes étapes : les clics n'y
    # trouvent rien, il attend 12 s (« Attendre12 ») puis se ferme.
    'vers-assistant' { Invoke-Scenario 'vers-assistant' @{ CYBERPINBALL_AUTOPILOT = 'click:.gear,click:.lib-action[data-label="Configuration de la borne"],click:.lib-action[data-label="Assistant complet"],Attendre12' } @() 60 }
    # Étape « Boutons » sans bouton : l'assistant relance le menu, qui rejoue ces étapes (touches
    # sans effet), attend 6 s (wait:6000) et se ferme.
    'vers-menu' { Invoke-Scenario 'vers-menu' @{ CYBERPINBALL_AUTOPILOT = 'Attendre3,SansBoutons,Attendre20,wait:6000' } @('--assistant', '--boutons') 60 }
    # Une touche qui ne fait rien, répétée : l'écran reste affiché le temps des captures.
    'reglages' { Invoke-Scenario 'reglages' @{ CYBERPINBALL_AUTOPILOT = ((@('F24') * 12) -join ',') } @('--reglages') 40 }
  }
}
