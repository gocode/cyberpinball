# Démonstration sans opérateur du DMD du menu vivant (demande du 26/10/2026), hors écran sur un
# bureau Windows caché. docs\demo-dmd-vivant.cjs envoie à la vraie page de l'écran du DMD l'état
# du menu et les images du vrai programme, page par page, et capture chaque cas :
#   DMD seul    : écran 4:1 (titre, titre long qui défile, PRESS START, record, horloge, crédits,
#                 page du média DMD, animation « chargement »), bande 4:1 sur un écran 16:9 ;
#   FullDMD     : média au cadre dessiné (les points dans le cadre, puis la page du média seul),
#                 sans média (la bande 4:1 sur du noir), sans table (la marque sur toute la grille du repli, sans bande).
# Le garde-fou de mise en page (layout-check.ts) doit rester muet, et chaque cas montrer ce qu'il
# doit (points allumés, média sur sa page, cadre pris ou non). Captures dans tmp\captures\dmd-vivant.
#   .\docs\demo-dmd-vivant.ps1 [-Accueil]
#   (-Accueil : seulement l'image de la page du projet, docs\images\en\live-dmd.webp et
#   fr\live-dmd.webp, la même image, sans texte traduit : titre, PRESS START, record et horloge de
#   Neon Abyss, un jeu inventé, en deux rangées ; captures dans tmp\captures\dmd-vivant-accueil)
# VPX n'est jamais lancé ; ni le vrai modèle de borne ni ses tables ne sont lus.
param([switch]$Accueil)
$ErrorActionPreference = 'Stop'
$wt = Split-Path $PSScriptRoot -Parent
. "$PSScriptRoot\hors-ecran.ps1"
# Tout le reste tourne sur un bureau Windows caché : rien ne peut apparaître sur les écrans du poste.
if (Enter-BureauCache $PSCommandPath $PSBoundParameters) { exit $LASTEXITCODE }
$captures = if ($Accueil) { "$wt\tmp\captures\dmd-vivant-accueil" } else { "$wt\tmp\captures\dmd-vivant" }
$electron = node -p "require('electron')"

Push-Location $wt
try { npm run build | Out-Null } finally { Pop-Location }

if (Test-Path $captures) { Remove-Item -Recurse -Force $captures }
New-Item -ItemType Directory -Force $captures | Out-Null
@{ out = $captures; accueil = [bool]$Accueil } | ConvertTo-Json | Set-Content -Path "$wt\tmp\demo-dmd-vivant.json" -Encoding UTF8

Push-Location $wt
try { & $electron docs\demo-dmd-vivant.cjs "$wt\tmp\demo-dmd-vivant.json" 2>&1 | Where-Object { "$_" -notmatch 'disk_cache|gpu_disk_cache|Security Warning' } | ForEach-Object { "   $_" } } finally { Pop-Location }
$code = $LASTEXITCODE
Get-ChildItem $captures -Filter *.png | Measure-Object | ForEach-Object { "  $($_.Count) captures dans $captures" }
if ($code -ne 0) { throw "DMD vivant : voir $captures\mise-en-page.txt" }

if ($Accueil) {
  # Deux rangées de deux pages, chaque DMD 4:1 posé comme sur docs\images\<langue>\cabinet.webp.
  $m = 24; $g = 16; $w = 768; $h = 192
  $places = @(@('accueil-titre', 0, 0), @('accueil-press-start', 1, 0), @('accueil-record', 0, 1), @('accueil-horloge', 1, 1))
  $layers = foreach ($p in $places) {
    @{ src = "$captures\$($p[0]).png"; x = $m + $p[1] * ($w + $g); y = $m + $p[2] * ($h + $g); w = $w; h = $h; radius = 8; border = '#24504a' }
  }
  foreach ($langue in @('en', 'fr')) {
    $spec = "$captures\planche-$langue.json"
    @{ out = "$wt\docs\images\$langue\live-dmd.webp"; width = 2 * $m + 2 * $w + $g; height = 2 * $m + 2 * $h + $g; background = '#030807'; quality = 0.86; layers = @($layers) } | ConvertTo-Json -Depth 6 | Set-Content $spec -Encoding UTF8
    Push-Location $wt
    try { & $electron docs\demo-captures.cjs --planche $spec 2>&1 | Where-Object { "$_" -notmatch 'disk_cache|gpu_disk_cache|Security Warning' } | ForEach-Object { "   $_" } } finally { Pop-Location }
    if ($LASTEXITCODE -ne 0) { throw "Image impossible : docs\images\$langue\live-dmd.webp" }
  }
}
'DMD vivant : aucun problème.'
