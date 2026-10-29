# Démonstration sans opérateur du lancement en cinéma (demande du 26/10/2026), hors écran sur un
# bureau Windows caché, en deux temps :
#   images clés : docs\demo-cinema.cjs envoie aux vraies pages des fenêtres (plateau, fronton, DMD)
#                 l'état du chargement avec la part de chaque fenêtre, figée à un instant depuis le
#                 Start (120, 300, 520, 700, 1000, 1300, 3000 ms) et au passage de relais (fondu à
#                 +120 ms) ; le DMD reçoit l'image du vrai moteur. Borne (plateau debout, fronton et
#                 DMD), plateau couché et tourné, bureau (fronton sur un second écran), repli sans
#                 logo (médaillon), repli sans fronton, logo plus haut que sa boîte (Atlantis Deep). Planches assemblées : planche-<montage>-<instant>.png ;
#   lancement   : le vrai menu (docs\demo-moments.ps1 -Scenarios cinema, sans-cinema) lance une
#                 partie simulée de Neon Galaxy, avec et sans le réglage : chaque fenêtre montre sa
#                 scène, le coup de bobine sonne au passage de relais (pas sans le réglage), et VPX
#                 part dès l'écran de chargement et la préparation finis, dans les deux cas
#                 (« Lancement : VPX lancé … ms après le Start (écran de chargement …, préparation …) »).
# Captures et relevés dans tmp\captures\cinema (images clés) et tmp\captures\moments\cinema,
# sans-cinema (lancement). Le garde-fou de mise en page doit rester muet.
#   .\docs\demo-cinema.ps1 [-Montages borne, bureau] [-SansLancement]
#   (-Montages : seulement ces montages des images clés ; -SansLancement : sans la partie simulée)
#   .\docs\demo-cinema.ps1 -Accueil
#   (seulement l'animation de la page du projet : docs\images\en\launch.webp et fr\launch.webp,
#   la même image, sans texte traduit ; la borne entière, playfield debout, topper, fronton et
#   DMD, avec Neon Abyss, un jeu inventé aux illustrations de docs\demo-captures-medias, du Start
#   au relais, en WebP animé ; images clés dans tmp\captures\cinema-accueil ; sans partie simulée)
# VPX n'est jamais lancé ; ni le vrai modèle de borne ni le vrai VPinballX.ini ne sont touchés.
param(
  [string[]]$Montages = @(),
  [switch]$SansLancement,
  [switch]$Accueil
)
$ErrorActionPreference = 'Stop'
$wt = Split-Path $PSScriptRoot -Parent
. "$PSScriptRoot\hors-ecran.ps1"
# Tout le reste tourne sur un bureau Windows caché : rien ne peut apparaître sur les écrans du poste.
if (Enter-BureauCache $PSCommandPath $PSBoundParameters) { exit $LASTEXITCODE }
$base = "$wt\tmp\demo-cinema"
$root = "$base\root"
$captures = "$wt\tmp\captures\cinema"
$electron = node -p "require('electron')"

Push-Location $wt
try { npm run build | Out-Null } finally { Pop-Location }

if ($Accueil) {
  # Les jeux inventés de la page du projet, refaits à chaque fois : une illustration ajoutée dans
  # docs\demo-captures-medias passe dans l'animation.
  $accueilRoot = "$base\accueil\root"
  $accueilCaptures = "$wt\tmp\captures\cinema-accueil"
  '== jeux inventés de la page du projet et leurs médias'
  Push-Location $wt
  try { & $electron docs\demo-captures.cjs $accueilRoot 2>&1 | ForEach-Object { "   $_" } } finally { Pop-Location }
  if ($LASTEXITCODE -ne 0) { throw 'Génération des médias en échec.' }
  if (Test-Path $accueilCaptures) { Remove-Item -Recurse -Force $accueilCaptures }
  New-Item -ItemType Directory -Force $accueilCaptures | Out-Null
  $images = @("$wt\docs\images\en\launch.webp", "$wt\docs\images\fr\launch.webp")
  @{ root = $accueilRoot; out = $accueilCaptures; montages = @('accueil'); animation = $images } | ConvertTo-Json | Set-Content -Path "$base\accueil\spec.json" -Encoding UTF8
  '== animation de la page du projet'
  Push-Location $wt
  try { & $electron docs\demo-cinema.cjs "$base\accueil\spec.json" 2>&1 | Where-Object { "$_" -notmatch 'disk_cache|gpu_disk_cache|Security Warning' } | ForEach-Object { "   $_" } } finally { Pop-Location }
  if ($LASTEXITCODE -ne 0) { throw "Animation de la page du projet : voir $accueilCaptures\mise-en-page.txt" }
  "Lancement en cinéma : $($images -join ', ')."
  exit 0
}

if (-not (Test-Path "$root\tables")) {
  '== tables inventées et leurs médias'
  Push-Location $wt
  try { & $electron docs\demo-moments.cjs $root 2>&1 | ForEach-Object { "   $_" } } finally { Pop-Location }
  if ($LASTEXITCODE -ne 0) { throw 'Génération des médias en échec.' }
}
# Captures d'avant : toutes, ou seulement celles des montages rejoués.
if (Test-Path $captures) {
  Get-ChildItem $captures -File | Where-Object {
    $file = $_.Name
    -not $Montages -or ($Montages | Where-Object { $file -match "^(planche-)?$([regex]::Escape($_))-(\d{4}|relais)" })
  } | Remove-Item -Force
}
New-Item -ItemType Directory -Force $captures | Out-Null
@{ root = $root; out = $captures; montages = @($Montages) } | ConvertTo-Json | Set-Content -Path "$base\spec.json" -Encoding UTF8

'== images clés'
Push-Location $wt
try { & $electron docs\demo-cinema.cjs "$base\spec.json" 2>&1 | Where-Object { "$_" -notmatch 'disk_cache|gpu_disk_cache|Security Warning' } | ForEach-Object { "   $_" } } finally { Pop-Location }
$code = $LASTEXITCODE
Get-ChildItem $captures -Filter planche-*.png | Measure-Object | ForEach-Object { "  $($_.Count) planches dans $captures" }
if ($code -ne 0) { throw "Lancement en cinéma : voir $captures\mise-en-page.txt" }

if ($SansLancement) { 'Lancement en cinéma : images clés conformes.'; exit 0 }
'== lancement dans le vrai menu, avec et sans le réglage'
& "$PSScriptRoot\demo-moments.ps1" -Scenarios cinema, sans-cinema
if ($LASTEXITCODE) { throw 'Lancement en cinéma : la partie simulée a échoué.' }
'Lancement en cinéma : images clés et lancement conformes.'
