# Démonstration sans opérateur de l'étape « Lanceur » de l'assistant (plunger à capteur lu
# par un Pinscape) : prépare un bac à sable dans tmp\demo-lanceur (copie du modèle de borne
# et du VPinballX.ini réels), puis (avec -Run), avec un Pinscape virtuel de SDL (six axes,
# « X/Y/Z + RX/RY/RZ ») lu par la bibliothèque SDL de VPX comme un vrai :
#   1. --assistant --lanceur sur la borne copiée : détection (lanceur tiré sur Z puis lâché),
#      réglage proposé (vitesse sur RZ, accéléromètre sur X et Y), un tir à 80 %, la zone
#      morte montée de 2 % à la souris et aux flippers, Enregistrer ; [Input] obtenu affiché
#      (tmp\captures\lanceur\seul) ;
#   2. --lanceur sur la même borne : le réglage enregistré dès l'arrivée, « Pas de lanceur
#      analogique » à la souris : PlungerSensorCount et NudgeSensorCount à 0
#      (tmp\captures\lanceur\aucun) ;
#   3. --lanceur sur une borne dont VPX a déjà un lanceur (réglé dans son menu) : « Réglage
#      trouvé dans VPX », Start l'enregistre tel quel (tmp\captures\lanceur\vpx).
#   .\docs\demo-lanceur.ps1 -Run
# Hors écran par défaut, sur les écrans simulés de docs\ecrans\<Ecrans>.json (-Ecrans) ;
# $env:CYBERPINBALL_A_L_ECRAN = '1' pour les vrais écrans du poste (docs\hors-ecran.ps1).
# Rien n'est écrit hors de tmp\demo-lanceur : le vrai VPinballX.ini n'est que lu, et la
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
$base = "$wt\tmp\demo-lanceur"
$captures = "$wt\tmp\captures\lanceur"

if (Test-Path $base) { Remove-Item -Recurse -Force $base }
$root = "$base\root"; $borne = "$base\borne"; $vpx = "$base\vpx"
New-Item -ItemType Directory -Force "$root\tables\Demo (Cyber Pinball 2026)", "$borne\sandbox", "$vpx\sandbox" | Out-Null
foreach ($h in $borne, $vpx) {
  # Le modèle copié désigne le VPinballX.ini du bac à sable, jamais le vrai.
  $model = Get-ModeleBorne $Cabinet
  $model.vpx.iniPath = "$h\sandbox\VPinballX.ini"
  $model | ConvertTo-Json -Depth 20 | Set-Content -Path "$h\cabinet.json" -Encoding UTF8
  if (Test-Path $Ini) { Copy-Item $Ini "$h\sandbox\VPinballX.ini" } else { Set-Content -Path "$h\sandbox\VPinballX.ini" -Value '[Input]' -Encoding UTF8 }
}
Set-Content -Path "$root\tables\Demo (Cyber Pinball 2026)\Demo (Cyber Pinball 2026).vpx" -Value '' -Encoding ASCII

if (-not $Run) { return }
if (-not (Test-Path $Sdl)) { throw "Pas de bibliothèque SDL de VPX ($Sdl) : aucun joystick lisible." }

function Invoke-Autopilot([string]$home_, [string[]]$codes, [string]$dir, [string[]]$arguments) {
  $env:CYBERPINBALL_HOME = $home_
  $env:CYBERPINBALL_AUTOPILOT = $codes -join ','
  $env:CYBERPINBALL_CAPTURE = "$captures\$dir"
  if (Test-Path $env:CYBERPINBALL_CAPTURE) { Remove-Item -Recurse -Force $env:CYBERPINBALL_CAPTURE }
  npx electron app @arguments
  Assert-HorsEcran $env:CYBERPINBALL_CAPTURE
  # Garde-fou de mise en page (layout-check.ts) : chevauchements, débordements, textes coupés.
  $report = "$env:CYBERPINBALL_CAPTURE\mise-en-page.txt"
  if (-not (Test-Path $report) -or (Get-Content $report -Raw -Encoding UTF8) -notmatch '^Aucun problème') { $script:layoutFailures += "$dir : voir $report" }
}
function Show-Capteurs([string]$ini) {
  Select-String -Path $ini -Pattern '^(PlungerSensorCount|NudgeSensorCount|Mapping\.(Plunger|Nudge)0\.\w+|Device\.SDLJoy_\w+\.NoAutoLayout) =' | ForEach-Object { $_.Line }
}
$layoutFailures = @()
$env:CYBERPINBALL_ROOT = $root
$env:CYBERPINBALL_SDL = $Sdl

$before = if (Test-Path $Ini) { (Get-FileHash $Ini).Hash }
Push-Location $wt
try {
  npm run build | Out-Null
  '== 1. Étape « Lanceur » seule : détection, essai, réglage, enregistrement'
  # Axe2 (Z) au repos (le Pinscape virtuel apparaît), tiré à fond, lâché : détecté.
  $detection = @('Axe2:0', 'Axe2:0', 'Axe2:0.5', 'Axe2:0.95', 'Axe2:0')
  # Un tir à 80 % ; clic sur « Zone morte », deux crans de plus aux flippers, Start pour finir ;
  # trois crans vers « Enregistrer » (vitesse, accéléromètre, Enregistrer), Start.
  $reglage = @('Axe2:0.8', 'Axe2:0', 'click:#buttons li:nth-child(3)', 'ShiftRight', 'ShiftRight', 'Digit1', 'ShiftRight', 'ShiftRight', 'ShiftRight', 'Digit1')
  Invoke-Autopilot $borne (@($detection) + @($reglage)) 'seul' @('--assistant', '--lanceur')
  '-- analog de cabinet.json'
  (Get-ModeleBorne "$borne\cabinet.json" -AvecBoutons).analog | ConvertTo-Json -Depth 5
  '-- [Input] de VPinballX.ini'
  Show-Capteurs "$borne\sandbox\VPinballX.ini"
  $saved = (Get-ModeleBorne "$borne\cabinet.json" -AvecBoutons).analog
  if ($saved.plunger.axis -ne 2 -or $saved.plunger.speedAxis -ne 5 -or $saved.nudge.x -ne 0 -or [math]::Abs($saved.plunger.deadZone - 0.02) -gt 0.001) { throw "1 : lanceur non enregistré comme attendu : $($saved | ConvertTo-Json -Compress -Depth 5)" }

  # Copie pour l'étape 3 : un VPX qui a déjà ce lanceur, sans étape « Lanceur » faite.
  $line = (Select-String -Path "$borne\sandbox\VPinballX.ini" -Pattern '^Mapping\.Plunger0\.Position = (.*)$').Matches[0].Groups[1].Value
  # Dans la section [Input] existante (une seconde section ne serait pas lue).
  $text = Get-Content "$vpx\sandbox\VPinballX.ini" -Raw -Encoding UTF8
  if ($text -notmatch '(?m)^PlungerSensorCount =.*$') { throw '3 : pas de PlungerSensorCount dans le VPinballX.ini copié' }
  $text = $text -replace '(?m)^PlungerSensorCount =.*$', "PlungerSensorCount = 1`r`nMapping.Plunger0.Position = $line"
  Set-Content -Path "$vpx\sandbox\VPinballX.ini" -Value $text -Encoding UTF8 -NoNewline

  '== 2. Étape « Lanceur » seule : pas de lanceur analogique'
  Invoke-Autopilot $borne @('Axe2:0', 'click:#actions button:nth-child(2)') 'aucun' @('--assistant', '--lanceur')
  Show-Capteurs "$borne\sandbox\VPinballX.ini"
  if ((Select-String -Path "$borne\sandbox\VPinballX.ini" -Pattern '^PlungerSensorCount = 0$').Count -ne 1) { throw '2 : PlungerSensorCount devait passer à 0' }

  '== 3. Étape « Lanceur » seule : réglage déjà fait dans VPX'
  Invoke-Autopilot $vpx @('Axe2:0', 'Digit1') 'vpx' @('--assistant', '--lanceur')
  (Get-ModeleBorne "$vpx\cabinet.json" -AvecBoutons).analog | ConvertTo-Json -Depth 5
  Show-Capteurs "$vpx\sandbox\VPinballX.ini"
  if ((Get-ModeleBorne "$vpx\cabinet.json" -AvecBoutons).analog.plunger.axis -ne 2) { throw '3 : le lanceur trouvé dans VPX devait être gardé' }
} finally {
  Pop-Location
  Remove-Item Env:CYBERPINBALL_SDL -ErrorAction SilentlyContinue
  $after = if (Test-Path $Ini) { (Get-FileHash $Ini).Hash }
  if ($before -ne $after) { throw "$Ini a changé pendant la démonstration : à vérifier." }
}
if ($layoutFailures.Count) { throw "Problèmes de mise en page :`n$($layoutFailures -join "`n")" }
