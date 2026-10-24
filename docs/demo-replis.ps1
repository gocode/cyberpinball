# Revue sans opérateur des replis intégrés (app/renderer/fallback.js) : fronton, afficheur
# 128 × 32, afficheur large, topper, logo (trois styles), fond du plateau, chargement et
# écran « en partie », chacun pour six jeux d'exemple (titres très courts et très longs,
# accents, fabricant ou année absents) à huit tailles : 16:9, 4:3, 3:1, 4:1, 9:16, 3:4,
# petit 4:1 et petit 16:9, plus des variantes figées et une vue pivotée. Sur chaque rendu,
# le garde-fou layout-check.ts cherche les textes qui se chevauchent, sortent ou sont
# coupés. Le script vérifie aussi que l'afficheur cesse de dessiner fenêtre cachée.
# Il échoue s'il trouve un problème. Captures, planches par composant (planche-*.png),
# relevé (releve.txt) et problèmes (mise-en-page.txt) dans tmp\captures\replis.
#   .\docs\demo-replis.ps1
$ErrorActionPreference = 'Stop'
$wt = Split-Path $PSScriptRoot -Parent
. "$PSScriptRoot\hors-ecran.ps1"
# Tout le reste tourne sur un bureau Windows caché : rien ne peut apparaître sur les écrans du poste.
if (Enter-BureauCache $PSCommandPath $PSBoundParameters) { exit $LASTEXITCODE }
$captures = "$wt\tmp\captures\replis"
if (Test-Path $captures) { Remove-Item -Recurse -Force $captures }

Push-Location $wt
try {
  npm run build | Out-Null
  npx electron docs\demo-replis.mjs $captures 2>&1 | Where-Object { "$_" -match '^(Replis|Mise en page)' } | ForEach-Object { "   $_" }
  $code = $LASTEXITCODE
} finally { Pop-Location }

if ($code -ne 0) { throw "Problèmes de mise en page : voir $captures\mise-en-page.txt" }
"Aucun problème de mise en page. Planches : $captures\planche-*.png"
