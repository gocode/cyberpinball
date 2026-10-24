# Démonstration sans opérateur de « Quitter sans enregistrer » et des étapes de l'assistant
# refaites seules depuis le menu (Configuration de la borne). Bac à sable dans
# tmp\demo-sorties : un modèle de borne est d'abord fabriqué par l'assistant complet
# (écrans simulés, sorties audio fictives), puis copié pour chaque scénario.
#   Sorties (tmp\captures\sorties\sortie-*) : chaque mode de l'assistant, quitté par un
#   geste différent (touche maintenue 3 s pendant le relevé, Ctrl+Q, Échap ou Exit
#   maintenu 2 s, bouton à la souris, Exit à la première question). La démonstration
#   échoue si cabinet.json ou VPinballX.ini a changé, ou si la question n'a pas annoncé
#   ce qui serait perdu.
#   Étapes seules (tmp\captures\sorties\etape-*) : écrans et rôles, orientation et taille
#   du playfield, son, disposition, jusqu'à l'enregistrement. La démonstration échoue si
#   une clé de VPinballX.ini hors de l'étape a changé, ou un champ du modèle hors de l'étape.
#   « Placer librement… » au DMD : dans le scénario sortie-ecrans.
#   .\docs\demo-sorties.ps1 [-Ecrans pc-dev] [-Scenarios sortie-boutons,etape-son]
# Hors écran, sur un bureau Windows caché : rien n'apparaît sur les écrans du poste,
# aucun son n'est audible (sorties fictives, introuvables par Electron).
param(
  [string]$Ecrans = 'pc-dev',
  [string[]]$Scenarios = @()
)
$ErrorActionPreference = 'Stop'
$wt = Split-Path $PSScriptRoot -Parent
. "$PSScriptRoot\hors-ecran.ps1"
# Tout le reste tourne sur un bureau Windows caché : rien ne peut apparaître sur les écrans du poste.
if (Enter-BureauCache $PSCommandPath $PSBoundParameters) { exit $LASTEXITCODE }
Use-HorsEcran $Ecrans
$base = "$wt\tmp\demo-sorties"
$captures = "$wt\tmp\captures\sorties"
if (Test-Path $base) { Remove-Item -Recurse -Force $base }
New-Item -ItemType Directory -Force "$base\root\tables" | Out-Null
# Deux sorties fictives (introuvables par Electron : aucun son joué) : une stéréo pour le
# fronton, une 7.1 pour le plateau, qui ouvre le test des haut-parleurs.
@'
[
  { "endpointId": "{0.0.0.00000000}.{fictive-1}", "friendlyName": "Haut-parleurs (Fronton fictif)", "deviceDesc": "Haut-parleurs", "interfaceName": "Fronton fictif", "bus": "USB", "formFactor": 1, "channels": 2, "channelMask": 3 },
  { "endpointId": "{0.0.0.00000000}.{fictive-2}", "friendlyName": "Haut-parleurs (Carte 7.1 fictive)", "deviceDesc": "Haut-parleurs", "interfaceName": "Carte 7.1 fictive", "bus": "HDAUDIO", "formFactor": 1, "channels": 8, "channelMask": 1599 }
]
'@ | Set-Content -Path "$base\sorties-fictives.json" -Encoding UTF8
$env:CYBERPINBALL_ROOT = "$base\root"
$env:CYBERPINBALL_AUDIO_OUTPUTS = "$base\sorties-fictives.json"

$failures = @()
function Invoke-Wizard([string]$name, [string]$home_, [string[]]$codes, [string[]]$arguments) {
  $env:CYBERPINBALL_HOME = $home_
  $env:CYBERPINBALL_AUTOPILOT = $codes -join ','
  $env:CYBERPINBALL_CAPTURE = "$captures\$name"
  if (Test-Path $env:CYBERPINBALL_CAPTURE) { Remove-Item -Recurse -Force $env:CYBERPINBALL_CAPTURE }
  $log = npx electron app @arguments 2>&1 | ForEach-Object { "$_" }
  $log | Where-Object { $_ -match '^(Assistant|Mise en page)' } | ForEach-Object { Write-Host "   $_" }
  Assert-HorsEcran $env:CYBERPINBALL_CAPTURE
  $report = "$env:CYBERPINBALL_CAPTURE\mise-en-page.txt"
  if (-not (Test-Path $report)) { $script:failures += "$name : relevé de mise en page absent" }
  elseif ((Get-Content $report -Raw -Encoding UTF8) -notmatch '^Aucun problème') { $script:failures += "$name : mise en page, voir $report" }
  $log
}

function Copy-Home([string]$name) {
  $h = "$base\$name"
  Copy-Item -Recurse "$base\modele" $h
  $h
}

function Get-Hash([string]$file) { if (Test-Path $file) { (Get-FileHash $file).Hash } else { 'absent' } }

# Clés de VPinballX.ini : « Section.Clé » -> valeur.
function Read-Ini([string]$file) {
  $keys = @{}
  $section = ''
  if (-not (Test-Path $file)) { return $keys }
  foreach ($line in Get-Content $file -Encoding UTF8) {
    if ($line -match '^\s*\[(.+)\]\s*$') { $section = $Matches[1] }
    elseif ($line -match '^\s*([^;=][^=]*?)\s*=\s*(.*)$') { $keys["$section.$($Matches[1])"] = $Matches[2] }
  }
  $keys
}

function Changed-Keys($before, $after) {
  @($before.Keys + $after.Keys | Sort-Object -Unique | Where-Object { $before[$_] -ne $after[$_] })
}

# Clés de chaque étape seule (WIZARD_STEPS, packages\core\src\wizardsteps.ts).
$owns = @{
  'boutons'     = '^Input\.'
  'son'         = '^Player\.(SoundDevice|SoundDeviceBG|Sound3D)$'
  'ecrans'      = '^(Player\.Playfield|Backglass\.|ScoreView\.|Topper\.)|^Player\.(BGSet|ScreenWidth|ScreenHeight|CabinetAutofitMode)$'
  'playfield'   = '^(Player\.Playfield|Backglass\.|ScoreView\.|Topper\.)|^Player\.(BGSet|ScreenWidth|ScreenHeight|CabinetAutofitMode)$'
  'disposition' = '^(Player\.Playfield|Backglass\.|ScoreView\.|Topper\.)|^Player\.(BGSet|ScreenWidth|ScreenHeight|CabinetAutofitMode)$'
}
# Champs du modèle de chaque étape seule.
$fields = @{
  'boutons' = @('buttons'); 'son' = @('audio'); 'playfield' = @('screens', 'playfield')
  'ecrans' = @('screens', 'roles', 'zones', 'playfield'); 'disposition' = @('screens', 'roles', 'zones')
}

# Sortie sans enregistrer : rien d'écrit, la question a annoncé ce qui serait perdu.
function Test-Sortie([string]$name, [string[]]$codes, [string[]]$arguments, [string]$expected, [switch]$Neuve) {
  if ($Scenarios.Count -and $Scenarios -notcontains $name) { return }
  "== $name"
  $h = if ($Neuve) { New-Item -ItemType Directory -Force "$base\$name\sandbox" | Out-Null; "$base\$name" } else { Copy-Home $name }
  $files = "$h\cabinet.json", "$h\sandbox\VPinballX.ini", "$h\vpx-owned.json"
  $before = $files | ForEach-Object { Get-Hash $_ }
  $log = Invoke-Wizard $name $h $codes $arguments
  $after = $files | ForEach-Object { Get-Hash $_ }
  for ($i = 0; $i -lt $files.Count; $i++) { if ($before[$i] -ne $after[$i]) { $script:failures += "$name : $($files[$i]) a changé" } }
  if (-not ($log -match 'Assistant : quitté sans enregistrer')) { $script:failures += "$name : l'assistant n'a pas quitté sans enregistrer" }
  if ($expected -and -not ($log -match "Quitter sans enregistrer \? ».*$([regex]::Escape($expected))")) { $script:failures += "$name : la question n'annonce pas « $expected »" }
  '   rien d''écrit : cabinet.json, VPinballX.ini et vpx-owned.json identiques'
}

# Étape seule enregistrée : seulement ses clés de VPinballX.ini et ses champs du modèle.
function Test-Etape([string]$name, [string]$step, [string[]]$codes) {
  if ($Scenarios.Count -and $Scenarios -notcontains $name) { return }
  "== $name"
  $h = Copy-Home $name
  $ini = "$h\sandbox\VPinballX.ini"
  $iniBefore = Read-Ini $ini
  $modelBefore = Get-Content "$h\cabinet.json" -Raw | ConvertFrom-Json
  $log = Invoke-Wizard $name $h $codes @('--assistant', "--$step")
  $changed = Changed-Keys $iniBefore (Read-Ini $ini)
  $outside = $changed | Where-Object { $_ -notmatch $owns[$step] }
  if ($outside) { $script:failures += "$name : clés hors de l'étape changées : $($outside -join ', ')" }
  if (-not $changed) { $script:failures += "$name : aucune clé de l'étape écrite" }
  "   clés écrites : $($changed -join ', ')"
  $modelAfter = Get-Content "$h\cabinet.json" -Raw | ConvertFrom-Json
  $configBefore = $modelBefore.configurations[0]; $configAfter = $modelAfter.configurations[0]
  foreach ($f in 'buttons', 'roles', 'zones', 'playfield', 'audio', 'screens') {
    if ($fields[$step] -contains $f) { continue }
    if (($configBefore.$f | ConvertTo-Json -Depth 20 -Compress) -ne ($configAfter.$f | ConvertTo-Json -Depth 20 -Compress)) { $script:failures += "$name : champ « $f » du modèle changé" }
  }
}

# Éditeur de disposition : la ligne « Largeur » ouverte à la souris, trois crans de moins, Start.
$retrecir = @('click:.arrange-items li:nth-child(7)', 'ShiftLeft', 'ShiftLeft', 'ShiftLeft', 'Digit1')

Push-Location $wt
try {
  npm run build | Out-Null
  # Modèle de départ : l'assistant complet (délai des boutons passé, playfield sur l'écran 1,
  # flippers en bas, backglass, ni DMD ni topper, disposition gardée, son SSF), enregistré.
  New-Item -ItemType Directory -Force "$base\modele\sandbox" | Out-Null
  '== modèle de départ (assistant complet)'
  $null = Invoke-Wizard 'modele' "$base\modele" @(
    'SansBoutons', 'Digit1', 'Digit1', 'Digit1', 'Digit1', 'Escape', 'Escape', 'Digit1',
    'ShiftRight', 'ShiftLeft', 'Digit1', 'ShiftLeft', 'ShiftRight', 'Digit1'
  ) @('--assistant')
  if (-not (Test-Path "$base\modele\cabinet.json")) { throw 'Le modèle de départ n''a pas été enregistré.' }

  # Première borne, relevé des boutons : un bouton relevé, puis une touche maintenue 3 s (pas
  # relevée) ouvre la question ; Start (1) : oui. Cyber Pinball se ferme, en le disant.
  Test-Sortie 'sortie-premier-demarrage' @('KeyA', 'Maintenir3.5:KeyS', 'Digit1') @('--assistant') 'Flipper gauche sur A' -Neuve
  if (Test-Path "$base\sortie-premier-demarrage\cabinet.json") { $failures += 'sortie-premier-demarrage : cabinet.json créé' }
  # Boutons seuls : deux boutons relevés, touche maintenue 3 s (question), Échap : non (D n'est
  # pas relevé), puis Ctrl+Q deux fois.
  Test-Sortie 'sortie-boutons' @('KeyA', 'KeyS', 'Maintenir3.5:KeyD', 'Escape', 'CtrlQ', 'CtrlQ') @('--assistant', '--boutons') 'Flipper droit sur S'
  # Écrans et rôles seuls : playfield gardé (ni bord ni diagonale redemandés), backglass sur un
  # autre écran ; au DMD, « Placer librement… » ouvre l'éditeur, Exit y revient ; de nouveau,
  # puis « Revenir à l'assistant » ; topper ; bouton à la souris, « Continuer », Exit maintenu
  # 2 s (le topper passe sans écran, la question s'ouvre sur le récapitulatif), puis
  # « Quitter sans enregistrer » à la souris.
  Test-Sortie 'sortie-ecrans' @(
    'Digit1', 'ShiftRight', 'Digit1',
    'ShiftLeft', 'Digit1', 'Escape', 'Digit1', 'ShiftLeft', 'Digit1',
    'click:#quit', 'click:.quit-choices button:not(.primary)', 'Maintenir2.5:Escape', 'click:.quit-choices button.primary'
  ) @('--assistant', '--ecrans') 'Backglass'
  # Orientation seule : bord changé, puis Ctrl+Q ; Start : oui (orientation simulée remise).
  Test-Sortie 'sortie-playfield' @('ShiftRight', 'Digit1', 'CtrlQ', 'Digit1') @('--assistant', '--playfield') 'Écran du playfield : remis'
  # Son seul : une sortie répondue, Retour arrière jusqu'à la première (question), non, puis
  # Exit maintenu 2 s (qui passe aussi la sortie) et Entrée : oui.
  Test-Sortie 'sortie-son' @('ShiftRight', 'Backspace', 'Backspace', 'Escape', 'Maintenir2.5:Escape', 'Enter') @('--assistant', '--son') 'Son'
  # Disposition seule : le playfield rétréci (clic sur « Largeur », flipper gauche trois fois, Start),
  # Exit (question), non, bouton à la souris, Entrée.
  Test-Sortie 'sortie-disposition' @($retrecir + @('Escape', 'Escape', 'click:#quit', 'Enter')) @('--assistant', '--disposition') 'Playfield : nouvelle place'
  # Assistant complet : délai des boutons, playfield, bord changé, Ctrl+Q, Exit : non, souris : oui.
  Test-Sortie 'sortie-complet' @('SansBoutons', 'Digit1', 'ShiftRight', 'CtrlQ', 'Escape', 'click:#quit', 'click:.quit-choices button.primary') @('--assistant') 'Flippers à gauche'
  # Nouvelle configuration : Exit à la première question (le playfield est obligatoire), Start : oui.
  Test-Sortie 'sortie-nouvelle-configuration' @('SansBoutons', 'Escape', 'Digit1') @('--assistant', '--nouvelle-configuration') "rien n’a changé"

  # Étapes seules jusqu'à l'enregistrement.
  Test-Etape 'etape-ecrans' 'ecrans' @('Digit1', 'ShiftRight', 'Digit1', 'Escape', 'Escape', 'Digit1')
  Test-Etape 'etape-playfield' 'playfield' @('ShiftLeft', 'Digit1', 'ShiftRight', 'ShiftRight', 'Digit1', 'Digit1')
  # Son : la sortie du fronton devient aussi celle du plateau (Start), l'autre n'a plus de rôle (Exit).
  Test-Etape 'etape-son' 'son' @('Digit1', 'Escape', 'Digit1')
  Test-Etape 'etape-disposition' 'disposition' @($retrecir + @('click:.arrange-items li:last-child'))
} finally { Pop-Location }

if ($failures.Count) { throw "Échecs :`n$($failures -join "`n")" }
'Toutes les sorties sans écriture, et chaque étape seule limitée à ses clés.'
