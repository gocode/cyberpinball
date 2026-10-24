# Revue sans opérateur de la mise en page de l'assistant : chaque état est rejoué sur
# tous les écrans de la borne simulée (pc-dev : 1920 × 1080 et 1366 × 768), en paysage puis avec le
# playfield pivoté (joueur à gauche ou à droite : mise en page en hauteur). Après chaque
# touche, le garde-fou layout-check.ts cherche dans le rendu réel les textes ou
# commandes qui se chevauchent, sortent de l'écran ou sont coupés. Le script échoue
# s'il en trouve ; captures et relevés (mise-en-page.txt) dans tmp\captures\mise-en-page.
#   .\docs\demo-mise-en-page.ps1 [-Ecrans borne]
# Hors écran par défaut, sur les écrans simulés de docs\ecrans\<Ecrans>.json (-Ecrans) ;
# $env:CYBERPINBALL_A_L_ECRAN = '1' pour les vrais écrans du poste (docs\hors-ecran.ps1).
# Bac à sable dans tmp\demo-mise-en-page : le vrai modèle de borne n'est que lu.
param(
  [string]$Cabinet = 'D:\CyberPinball\data\cabinet.json',
  [string]$Ecrans = 'pc-dev'
)
$ErrorActionPreference = 'Stop'
$wt = Split-Path $PSScriptRoot -Parent
. "$PSScriptRoot\hors-ecran.ps1"
# Tout le reste tourne sur un bureau Windows caché : rien ne peut apparaître sur les écrans du poste.
if (Enter-BureauCache $PSCommandPath $PSBoundParameters) { exit $LASTEXITCODE }
Use-HorsEcran $Ecrans
$base = "$wt\tmp\demo-mise-en-page"
$captures = "$wt\tmp\captures\mise-en-page"
if (Test-Path $base) { Remove-Item -Recurse -Force $base }
if (Test-Path $captures) { Remove-Item -Recurse -Force $captures }
New-Item -ItemType Directory -Force "$base\root\tables" | Out-Null
Set-Content -Path "$base\sans-son.json" -Value '[]' -Encoding ASCII
# Deux sorties fictives (introuvables par Electron : aucun son joué, message à l'écran) :
# une stéréo pour le fronton, une 7.1 pour le plateau, qui ouvre le test des haut-parleurs.
@'
[
  { "endpointId": "{0.0.0.00000000}.{fictive-1}", "friendlyName": "Haut-parleurs (Fronton fictif)", "deviceDesc": "Haut-parleurs", "interfaceName": "Fronton fictif", "bus": "USB", "formFactor": 1, "channels": 2, "channelMask": 3 },
  { "endpointId": "{0.0.0.00000000}.{fictive-2}", "friendlyName": "Haut-parleurs (Carte 7.1 fictive)", "deviceDesc": "Haut-parleurs", "interfaceName": "Carte 7.1 fictive", "bus": "HDAUDIO", "formFactor": 1, "channels": 8, "channelMask": 1599 }
]
'@ | Set-Content -Path "$base\sorties-fictives.json" -Encoding UTF8

# Borne copiée, bord des flippers imposé : le playfield s'affiche pivoté pour le joueur.
function New-Home([string]$name, [string]$edge) {
  $h = "$base\$name"
  New-Item -ItemType Directory -Force "$h\sandbox" | Out-Null
  if ($edge) {
    $model = Get-ModeleBorne $Cabinet
    $model.vpx.iniPath = "$h\sandbox\VPinballX.ini"
    $model | Add-Member -Force -NotePropertyName playfield -NotePropertyValue ([pscustomobject]@{ flipperEdge = $edge })
    $model.PSObject.Properties.Remove('buttons')
    $model | ConvertTo-Json -Depth 20 | Set-Content -Path "$h\cabinet.json" -Encoding UTF8
  }
  $h
}

$failures = @()
function Invoke-Review([string]$name, [string]$home_, [string[]]$codes, [string[]]$arguments, [string]$audio) {
  $env:CYBERPINBALL_HOME = $home_
  $env:CYBERPINBALL_ROOT = "$base\root"
  $env:CYBERPINBALL_AUDIO_OUTPUTS = $audio
  $env:CYBERPINBALL_AUTOPILOT = $codes -join ','
  $env:CYBERPINBALL_CAPTURE = "$captures\$name"
  "== $name"
  npx electron app @arguments 2>&1 | Where-Object { "$_" -match '^Mise en page' } | ForEach-Object { "   $_" }
  $report = "$captures\$name\mise-en-page.txt"
  if (-not (Test-Path $report)) { $script:failures += "$name : relevé absent" }
  elseif ((Get-Content $report -Raw -Encoding UTF8) -notmatch '^Aucun problème') { $script:failures += "$name : voir $report" }
  Assert-HorsEcran "$captures\$name"
}

$encodeur = @('KeyA', 'KeyA', 'KeyS', 'MetaLeft', 'Digit2', 'KeyQ', 'Digit3', 'KeyW', 'KeyQ', 'KeyQ', 'KeyD', 'KeyQ', 'KeyQ', 'KeyQ', 'KeyQ', 'KeyQ', 'KeyQ')
$essai = @('Digit2', 'KeyA', 'KeyS', 'KeyQ', 'Digit2')
Push-Location $wt
try {
  npm run build | Out-Null
  # Étape « Boutons » : compte à rebours, refus, facultatifs, essai refusé puis validé, écrans.
  Invoke-Review 'boutons-paysage' (New-Home 'neuve' $null) (@($encodeur) + @($essai) + @('KeyS', 'Digit2')) @('--assistant') "$base\sans-son.json"
  # Étape seule sur une borne au playfield pivoté (joueur à gauche, puis à droite), jusqu'à « Boutons enregistrés ».
  foreach ($edge in 'left', 'right') {
    Invoke-Review "boutons-seuls-$edge" (New-Home "borne-$edge" $edge) (@('KeyA', 'KeyA') + @($encodeur | Select-Object -Skip 2) + @('click:#actions button:nth-child(3)') + @('ShiftLeft', 'ShiftRight', 'Escape', 'Digit1')) @('--assistant', '--boutons') "$base\sans-son.json"
  }
  # Écrans, orientation, retournement proposé puis annulé, diagonale, son (sorties fictives), récapitulatif, enregistrement.
  $etapesEcrans = @(
    'SansBoutons', 'Digit1',            # délai passé ; playfield sur l'écran 1
    'ShiftRight', 'Digit1', 'Escape',   # joueur à gauche : retournement proposé (simulé), annulé
    'ShiftLeft', 'Digit1', 'Digit1',    # flippers en bas, diagonale
    'Digit1', 'Escape', 'Escape',       # backglass, ni DMD ni topper
    'Digit1',                           # disposition des écrans : « Terminer »
    'ShiftRight', 'ShiftLeft',          # son : la carte 7.1 au plateau, l'autre au fronton
    'Digit1', 'ShiftLeft', 'ShiftRight', # paires avant, arrière, côtés : SSF
    'Digit1'                            # récapitulatif : enregistrer
  )
  Invoke-Review 'ecrans-son' (New-Home 'ecrans' $null) $etapesEcrans @('--assistant') "$base\sorties-fictives.json"
} finally { Pop-Location }

if ($failures.Count) { throw "Problèmes de mise en page :`n$($failures -join "`n")" }
'Aucun problème de mise en page.'
