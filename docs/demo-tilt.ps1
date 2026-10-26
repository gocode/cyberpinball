# Démonstration sans opérateur du tilt : balancier relevé à l'étape « Boutons », étape « Tilt »
# (balancier de la borne, puis balancier simulé par VPX et son essai aux secousses). Prépare un
# bac à sable dans tmp\demo-tilt (copie du modèle de borne sans ses boutons ni capteurs, et du
# VPinballX.ini réel), puis (avec -Run), avec un Pinscape virtuel de SDL (six axes, 32 boutons)
# lu par la bibliothèque SDL de VPX comme un vrai :
#   1. --lanceur : lanceur détecté sur Z, accéléromètre sur X et Y du Pinscape virtuel, Start
#      enregistre (tmp\captures\tilt\lanceur) ;
#   2. --boutons : « Tout relever » ; le balancier de tilt sur le bouton 9 du Pinscape (son entrée
#      câblée), le slam tilt sur la touche Origine du clavier ; [Input] Mapping.Tilt et
#      Mapping.SlamTilt (tmp\captures\tilt\boutons) ;
#   3. --tilt : « Balancier de la borne » proposé, un contact du balancier allume l'anneau, Start
#      enregistre : [Player] SimulatedPlumb = 0 (tmp\captures\tilt\balancier) ;
#      Avant, la force des secousses est remise à ×1 (borne réglée avant elle, comme la vraie en
#      octobre 2026) : l'étape propose ×2 et l'écrit (Mapping.Nudge0.X et .Y à l'échelle 2) ;
#   4. --tilt : « Balancier simulé par VPX » à la souris, contact à 0,50° aux flippers, une
#      secousse franche sur X (TILT), une douce vers l'avant ; force des secousses de ×2 à ×2,50,
#      une petite secousse (15 % de l'échelle, lue sous l'anneau) ; Enregistrer : SimulatedPlumb = 1,
#      PlumbThresholdAngle = 0.5, axes à l'échelle 2.5 (tmp\captures\tilt\simule).
#   .\docs\demo-tilt.ps1 -Run
# Hors écran par défaut, sur les écrans simulés de docs\ecrans\<Ecrans>.json (-Ecrans) ;
# $env:CYBERPINBALL_A_L_ECRAN = '1' pour les vrais écrans du poste (docs\hors-ecran.ps1).
# Rien n'est écrit hors de tmp\demo-tilt : le vrai VPinballX.ini n'est que lu, et la
# démonstration échoue s'il a changé pendant qu'elle tournait.
param(
  [switch]$Run,
  [string]$Cabinet = 'D:\CyberPinball\data\cabinet.json',
  [string]$Ini = 'D:\CyberPinball\config\VPinballX.ini',
  [string]$Ecrans = 'pc-dev',
  # Bibliothèque SDL de VPX : sans elle, pas de joystick, la démonstration ne peut rien montrer.
  [string]$Sdl = 'D:\CyberPinball\emulators\vpx\current\SDL364.dll'
)
$ErrorActionPreference = 'Stop'
$wt = Split-Path $PSScriptRoot -Parent
. "$PSScriptRoot\hors-ecran.ps1"
# Tout le reste tourne sur un bureau Windows caché : rien ne peut apparaître sur les écrans du poste.
if (Enter-BureauCache $PSCommandPath $PSBoundParameters) { exit $LASTEXITCODE }
Use-HorsEcran $Ecrans
$base = "$wt\tmp\demo-tilt"
$captures = "$wt\tmp\captures\tilt"

if (Test-Path $base) { Remove-Item -Recurse -Force $base }
$root = "$base\root"; $borne = "$base\borne"
New-Item -ItemType Directory -Force "$root\tables\Demo (Cyber Pinball 2026)", "$borne\sandbox" | Out-Null
# Le modèle copié désigne le VPinballX.ini du bac à sable, jamais le vrai.
$model = Get-ModeleBorne $Cabinet
$model.vpx.iniPath = "$borne\sandbox\VPinballX.ini"
$model | ConvertTo-Json -Depth 20 | Set-Content -Path "$borne\cabinet.json" -Encoding UTF8
if (Test-Path $Ini) { Copy-Item $Ini "$borne\sandbox\VPinballX.ini" } else { Set-Content -Path "$borne\sandbox\VPinballX.ini" -Value "[Player]`r`n[Input]" -Encoding UTF8 }
Set-Content -Path "$root\tables\Demo (Cyber Pinball 2026)\Demo (Cyber Pinball 2026).vpx" -Value '' -Encoding ASCII

if (-not $Run) { return }
if (-not (Test-Path $Sdl)) { throw "Pas de bibliothèque SDL de VPX ($Sdl) : aucun joystick lisible." }

function Invoke-Autopilot([string[]]$codes, [string]$dir, [string[]]$arguments) {
  $env:CYBERPINBALL_HOME = $borne
  $env:CYBERPINBALL_AUTOPILOT = $codes -join ','
  $env:CYBERPINBALL_CAPTURE = "$captures\$dir"
  if (Test-Path $env:CYBERPINBALL_CAPTURE) { Remove-Item -Recurse -Force $env:CYBERPINBALL_CAPTURE }
  npx electron app @arguments
  Assert-HorsEcran $env:CYBERPINBALL_CAPTURE
  # Garde-fou de mise en page (layout-check.ts) : chevauchements, débordements, textes coupés.
  $report = "$env:CYBERPINBALL_CAPTURE\mise-en-page.txt"
  if (-not (Test-Path $report) -or (Get-Content $report -Raw -Encoding UTF8) -notmatch '^Aucun problème') { $script:layoutFailures += "$dir : voir $report" }
}
$iniFile = "$borne\sandbox\VPinballX.ini"
function Get-Cle([string]$section, [string]$key) {
  $inSection = $false
  foreach ($line in Get-Content $iniFile -Encoding UTF8) {
    if ($line -match '^\[(.+)\]\s*$') { $inSection = $Matches[1] -eq $section; continue }
    if ($inSection -and $line -match "^$([regex]::Escape($key))\s*=\s*(.*)$") { return $Matches[1].Trim() }
  }
}
function Show-Tilt {
  foreach ($k in 'SimulatedPlumb', 'PlumbThresholdAngle', 'PlumbDamping') { "[Player] $k = $(Get-Cle 'Player' $k)" }
  foreach ($k in 'Mapping.Tilt', 'Mapping.SlamTilt', 'NudgeSensorCount', 'Mapping.Nudge0.X', 'Mapping.Nudge0.Y') { "[Input] $k = $(Get-Cle 'Input' $k)" }
}
$layoutFailures = @()
$env:CYBERPINBALL_ROOT = $root
$env:CYBERPINBALL_SDL = $Sdl

$before = if (Test-Path $Ini) { (Get-FileHash $Ini).Hash }
Push-Location $wt
try {
  npm run build | Out-Null
  '== 1. Étape « Lanceur » : lanceur et accéléromètre du Pinscape virtuel'
  Invoke-Autopilot @('Axe2:0', 'Axe2:0', 'Axe2:0', 'Axe2:0.5', 'Axe2:0.95', 'Axe2:0', 'Digit1') 'lanceur' @('--assistant', '--lanceur')
  $analog = (Get-ModeleBorne "$borne\cabinet.json" -AvecBoutons).analog
  # Force des secousses d'un Pinscape en « 1G » : ×2 (1 g mesuré = 1 g dans VPX).
  if ($analog.nudge.x -ne 0 -or $analog.nudge.y -ne 1 -or $analog.nudge.gain -ne 2) { throw "1 : accéléromètre non enregistré : $($analog | ConvertTo-Json -Compress -Depth 5)" }
  $pinscape = $analog.nudge.device

  '== 2. Étape « Boutons » : balancier sur le bouton 9 du Pinscape, slam tilt sur Origine'
  # « Tout relever » ; huit boutons aux touches des encodeurs ; Exit passe Extra Ball et Pause ; le
  # balancier touche son anneau (bouton 9 du Pinscape) ; Origine pour le slam tilt ; tremblements et volume ; essai des flippers et d'Exit, Start valide.
  $releve = @('click:#actions button:nth-child(4)', 'ShiftLeft', 'ShiftRight', 'Digit1', 'Escape', 'Digit5', 'Enter', 'ControlLeft', 'ControlRight', 'Escape', 'Escape', 'Pinscape9', 'Home', 'KeyZ', 'Slash', 'Space', 'Minus', 'Equal', 'ShiftLeft', 'ShiftRight', 'Escape', 'Digit1')
  Invoke-Autopilot $releve 'boutons' @('--assistant', '--boutons')
  $buttons = (Get-ModeleBorne "$borne\cabinet.json" -AvecBoutons).buttons
  $buttons | ConvertTo-Json -Compress
  if ($buttons.tilt -ne "$pinscape;9" -or $buttons.slamTilt -ne 'Home' -or $buttons.extraBall) { throw "2 : balancier ou slam tilt non relevés : $($buttons | ConvertTo-Json -Compress)" }
  Show-Tilt
  if ((Get-Cle 'Input' 'Mapping.Tilt') -ne "$pinscape;9 | Key;23") { throw '2 : [Input] Mapping.Tilt inattendu' }
  if ((Get-Cle 'Input' 'Mapping.SlamTilt') -ne 'Key;74') { throw '2 : [Input] Mapping.SlamTilt inattendu' }

  '== 3. Étape « Tilt » : balancier de la borne, essayé, enregistré ; force des secousses ×1 remise à ×2'
  # Borne réglée avant la force des secousses : ni force dans le modèle, échelle 1 dans VPX.
  $set = Get-Content "$borne\cabinet.json" -Raw -Encoding UTF8 | ConvertFrom-Json
  foreach ($c in @($set.configurations) + @($set)) { if ($c.analog.nudge.gain) { $c.analog.nudge.PSObject.Properties.Remove('gain') } }
  $set | ConvertTo-Json -Depth 30 | Set-Content -Path "$borne\cabinet.json" -Encoding UTF8
  (Get-Content $iniFile -Raw -Encoding UTF8) -replace '(?m)^(Mapping\.Nudge0\.[XY] = .*;A;0\.000000;)2\.000000(;1\.000000)', '${1}1.000000$2' | Set-Content -Path $iniFile -Encoding UTF8 -NoNewline
  if ((Get-Cle 'Input' 'Mapping.Nudge0.X') -notmatch ';1\.000000;1\.000000$') { throw '3 : échelle 1 non remise' }
  Invoke-Autopilot @('Pinscape9', 'Digit1') 'balancier' @('--assistant', '--tilt')
  (Get-ModeleBorne "$borne\cabinet.json" -AvecBoutons).tilt | ConvertTo-Json -Compress
  Show-Tilt
  if ((Get-ModeleBorne "$borne\cabinet.json" -AvecBoutons).tilt.mode -ne 'bob') { throw '3 : balancier de la borne non enregistré' }
  if ((Get-Cle 'Player' 'SimulatedPlumb') -ne '0') { throw '3 : le balancier simulé de VPX devait être éteint' }
  if ((Get-Cle 'Input' 'Mapping.Nudge0.X') -notmatch ';512;A;0\.000000;2\.000000;1\.000000$') { throw '3 : force des secousses ×2 non écrite' }

  '== 4. Étape « Tilt » : balancier simulé, contact à 0,50°, secousses, enregistré'
  # Clic sur « Tilt » (balancier simulé), clic sur le contact, dix crans de moins, Start pour finir ;
  # secousse franche sur X, repos ; secousse douce vers l'avant (Y négatif), repos ; clic sur la
  # force des secousses, deux crans de plus, Start ; petite secousse sur X, repos ; Enregistrer.
  $simule = @('click:#buttons li:nth-child(1)', 'click:#buttons li:nth-child(2)') + @('ShiftLeft') * 10 + @('Digit1', 'Axe0:1', 'Axe0:0', 'Axe1:-0.35', 'Axe1:0', 'click:#buttons li:nth-child(3)', 'ShiftRight', 'ShiftRight', 'Digit1', 'Axe0:0.15', 'Axe0:0', 'click:#actions button:nth-child(1)')
  Invoke-Autopilot $simule 'simule' @('--assistant', '--tilt')
  $tilt = (Get-ModeleBorne "$borne\cabinet.json" -AvecBoutons).tilt
  $tilt | ConvertTo-Json -Compress
  Show-Tilt
  if ($tilt.mode -ne 'simulated' -or [math]::Abs($tilt.threshold - 0.5) -gt 0.001) { throw "4 : balancier simulé non enregistré : $($tilt | ConvertTo-Json -Compress)" }
  if ((Get-Cle 'Player' 'SimulatedPlumb') -ne '1' -or (Get-Cle 'Player' 'PlumbThresholdAngle') -ne '0.5') { throw '4 : [Player] inattendu' }
  if ((Get-Cle 'Input' 'Mapping.Nudge0.X') -notmatch ';512;A;0\.000000;2\.500000;1\.000000$' -or (Get-Cle 'Input' 'Mapping.Nudge0.Y') -notmatch ';513;A;0\.000000;2\.500000;1\.000000$') { throw '4 : force des secousses ×2,50 non écrite' }
} finally {
  Pop-Location
  Remove-Item Env:CYBERPINBALL_SDL -ErrorAction SilentlyContinue
  $after = if (Test-Path $Ini) { (Get-FileHash $Ini).Hash }
  if ($before -ne $after) { throw "$Ini a changé pendant la démonstration : à vérifier." }
}
if ($layoutFailures.Count) { throw "Problèmes de mise en page :`n$($layoutFailures -join "`n")" }
