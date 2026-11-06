# Démonstration sans opérateur du retour d'une partie solo (idée du 06/11/2026), hors écran sur un
# bureau Windows caché, en deux temps :
#   images clés : docs\demo-retour-partie.cjs envoie aux vraies pages des fenêtres (plateau, fronton,
#                 DMD) l'état du menu avec la part de chaque fenêtre dans le retour, figée à un instant
#                 depuis le retour (120, 300, 520, 760, 1000, 1300, 3000 ms) et au départ de la carte
#                 (fondu à +120 ms) ; le DMD reçoit l'image du vrai moteur (NEW HIGH SCORE). Record à
#                 la première place, troisième place, premier score d'un tableau vide, durée seule
#                 (table sans relevé), badge ; borne (plateau debout, fronton et DMD), plateau couché
#                 et tourné, bureau (fronton sur un second écran), bureau 4:3, repli sans logo.
#                 Planches assemblées : planche-<montage>-<instant>.png ;
#   retour      : le vrai menu (docs\demo-moments.ps1 -Scenarios retour, retour-record, retour-arret)
#                 joue une partie simulée : la carte au retour, Start relance la table, Exit rend la
#                 roue, la carte s'efface seule ; un record entré au tableau pendant la partie
#                 (VPReg.stg remplacé) : la carte du record, le knocker ; un arrêt forcé : pas de carte.
# Captures et relevés dans tmp\captures\retour-partie (images clés) et tmp\captures\moments\retour…
# (retour dans le vrai menu). Le garde-fou de mise en page doit rester muet.
#   .\docs\demo-retour-partie.ps1 [-Montages borne-record, bureau] [-SansRetour]
# VPX n'est jamais lancé ; ni le vrai modèle de borne ni le vrai VPinballX.ini ne sont touchés.
param(
  [string[]]$Montages = @(),
  [switch]$SansRetour
)
$ErrorActionPreference = 'Stop'
$wt = Split-Path $PSScriptRoot -Parent
. "$PSScriptRoot\hors-ecran.ps1"
# Tout le reste tourne sur un bureau Windows caché : rien ne peut apparaître sur les écrans du poste.
if (Enter-BureauCache $PSCommandPath $PSBoundParameters) { exit $LASTEXITCODE }
$base = "$wt\tmp\demo-retour-partie"
$root = "$base\root"
$captures = "$wt\tmp\captures\retour-partie"
$electron = node -p "require('electron')"

Push-Location $wt
try { npm run build | Out-Null } finally { Pop-Location }

if (-not (Test-Path "$root\tables")) {
  '== tables inventées et leurs médias'
  Push-Location $wt
  try { & $electron docs\demo-moments.cjs $root 2>&1 | ForEach-Object { "   $_" } } finally { Pop-Location }
  if ($LASTEXITCODE -ne 0) { throw 'Génération des médias en échec.' }
}
if (Test-Path $captures) {
  Get-ChildItem $captures -File | Where-Object {
    $file = $_.Name
    -not $Montages -or ($Montages | Where-Object { $file -match "^(planche-)?$([regex]::Escape($_))-(\d{4}|fin)" })
  } | Remove-Item -Force
}
New-Item -ItemType Directory -Force $captures | Out-Null
@{ root = $root; out = $captures; montages = @($Montages) } | ConvertTo-Json | Set-Content -Path "$base\spec.json" -Encoding UTF8

'== images clés'
Push-Location $wt
try { & $electron docs\demo-retour-partie.cjs "$base\spec.json" 2>&1 | Where-Object { "$_" -notmatch 'disk_cache|gpu_disk_cache|Security Warning' } | ForEach-Object { "   $_" } } finally { Pop-Location }
$code = $LASTEXITCODE
Get-ChildItem $captures -Filter planche-*.png | Measure-Object | ForEach-Object { "  $($_.Count) planches dans $captures" }
if ($code -ne 0) { throw "Retour de partie : voir $captures\mise-en-page.txt" }

if ($SansRetour) { 'Retour de partie : images clés conformes.'; exit 0 }
'== retour dans le vrai menu : partie simulée, record, arrêt forcé'
& "$PSScriptRoot\demo-moments.ps1" -Scenarios retour, retour-record, retour-arret
if ($LASTEXITCODE) { throw 'Retour de partie : la partie simulée a échoué.' }
'Retour de partie : images clés et retour conformes.'
