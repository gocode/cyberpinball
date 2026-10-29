# Démonstration sans opérateur : aucune fenêtre d'éditeur ni d'audit de VPX pendant une
# partie lancée par Cyber Pinball, et message lisible quand un réglage de VPinballX.ini
# ferait poser une question à VPX. Prépare un bac à sable dans tmp\demo-fenetres (copie de
# Terminator 2 1.25, la table dont l'audit signale des erreurs, et copie de VPinballX.ini),
# puis (avec -Run) enchaîne trois parties par le test d'endurance du menu :
#   1. INI tel quel : Cyber Pinball écrit SecurityLevel = 0 et AskToTurnOn = 2, la partie se
#      déroule, aucune autre fenêtre de VPX ;
#   2. SecurityLevel = 1 mis à la main : repéré au démarrage, pas écrasé ; VPX demande la
#      permission pour un objet ActiveX, la partie s'arrête avec le réglage à remettre ;
#   3. AskToTurnOn = 0 mis à la main : VPX cherche un casque VR, même chose.
#   .\docs\demo-fenetres.ps1 -Run
# Nécessite les écrans du poste : refusée hors écran, ne se lance qu'avec
# $env:CYBERPINBALL_A_L_ECRAN = '1' (docs\hors-ecran.ps1).
# VPX occupe les écrans environ deux minutes. Ni les vraies tables ni le vrai
# VPinballX.ini ne sont touchés (vérifié à la fin).
param(
  [switch]$Run,
  [string]$Source = 'D:\CyberPinball'
)
$ErrorActionPreference = 'Stop'
$wt = Split-Path $PSScriptRoot -Parent
. "$PSScriptRoot\hors-ecran.ps1"
$base = "$wt\tmp\demo-fenetres"
$realIni = "$Source\config\VPinballX.ini"
$t2 = "$Source\tables\Terminator 2"

# La jonction d'abord, seule : un effacement récursif ne doit jamais descendre dans la vraie racine.
if (Test-Path "$base\root\emulators") { [IO.Directory]::Delete("$base\root\emulators") }
if (Test-Path $base) { Remove-Item -Recurse -Force $base }
$root = "$base\root"; $home_ = "$base\home"; $table = "$root\tables\Terminator 2"
New-Item -ItemType Directory -Force $table, "$home_\sandbox" | Out-Null
Copy-ModeleBorne "$Source\data\cabinet.json" $home_ | Out-Null
Copy-Item "$t2\Terminator 2 (Williams 1991) g5k 1.25.vpx" $table
Copy-Item "$t2\Terminator 2.directb2s" "$table\Terminator 2 (Williams 1991) g5k 1.25.directb2s"
Copy-Item -Recurse "$t2\pinmame" $table
# VPX lui-même est partagé (lecture seule) : jonction vers les émulateurs de la vraie racine.
New-Item -ItemType Junction -Path "$root\emulators" -Target "$Source\emulators" | Out-Null
$ini = "$home_\sandbox\VPinballX.ini"
Copy-Item $realIni $ini
$realHash = (Get-FileHash $realIni).Hash

if (-not $Run) { return }
Assert-EcransDuPoste 'La démonstration des fenêtres de VPX (trois parties de VPX)'

function Get-Key($section, $key) {
  $current = ''
  foreach ($line in Get-Content $ini) {
    if ($line -match '^\[(.+)\]') { $current = $Matches[1]; continue }
    if ($current -eq $section -and $line -match "^$key\s*=\s*(.*)$") { return $Matches[1] }
  }
}
function Set-Key($section, $key, $value) {
  $current = ''
  $lines = foreach ($line in Get-Content $ini) {
    if ($line -match '^\[(.+)\]') { $current = $Matches[1] }
    elseif ($current -eq $section -and $line -match "^$key\s*=") { $line = "$key = $value" }
    $line
  }
  Set-Content -Path $ini -Value $lines -Encoding UTF8
}
function Invoke-Game($label) {
  "`n=== $label"
  "Avant : [Player] SecurityLevel = $(Get-Key 'Player' 'SecurityLevel') ; [PlayerVR] AskToTurnOn = $(Get-Key 'PlayerVR' 'AskToTurnOn')"
  Push-Location $wt
  try { npx electron app 2>&1 | Where-Object { $_ -match '^#|^Bilan|^VPX \(|modifié|SecurityLevel|AskToTurnOn' } } finally { Pop-Location }
  "Après : [Player] SecurityLevel = $(Get-Key 'Player' 'SecurityLevel') ; [PlayerVR] AskToTurnOn = $(Get-Key 'PlayerVR' 'AskToTurnOn')"
}

$env:CYBERPINBALL_ROOT = $root; $env:CYBERPINBALL_HOME = $home_
$env:CYBERPINBALL_STRESS = '1,10'; $env:CYBERPINBALL_TABLE = '1.25'
Invoke-Game '1. VPinballX.ini tel quel'
Set-Key 'Player' 'SecurityLevel' '1'
Invoke-Game '2. SecurityLevel = 1 mis à la main'
Set-Key 'Player' 'SecurityLevel' '0'
Set-Key 'PlayerVR' 'AskToTurnOn' '0'
Invoke-Game '3. AskToTurnOn = 0 mis à la main'
Get-ChildItem "$home_\logs" -Filter 'stress-*.json' | ForEach-Object { "`n$($_.Name)"; Get-Content $_.FullName -Raw }
if ((Get-FileHash $realIni).Hash -eq $realHash) { "`nLe vrai VPinballX.ini n'a pas changé." } else { "`nATTENTION : le vrai VPinballX.ini a changé pendant la démonstration." }
# Jonction vers les vrais émulateurs retirée (docs\hors-ecran.ps1).
Remove-JonctionsSortantes
