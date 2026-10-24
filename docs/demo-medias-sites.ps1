# Revue sans opérateur des médias des sites communautaires (VPForums, puis VPUniverse en
# dernier recours) dans les propositions de chaque média : d'abord les vrais sites en
# visiteur et en lecture seule (une page de résultats chacun, une vignette), puis de
# fausses fiches imitant les deux moteurs pour la connexion, la file, le minuteur de
# VPUniverse déroulé dans la page, la réception, le pack complet et la reprise de la
# page web après Échap. Profil Electron à part : la session de l'utilisateur n'est
# jamais touchée. Captures et relevé dans
# tmp\demo-medias-sites\captures.
#   .\docs\demo-medias-sites.ps1
$ErrorActionPreference = 'Stop'
$wt = Split-Path $PSScriptRoot -Parent
. "$PSScriptRoot\hors-ecran.ps1"
# Tout le reste tourne sur un bureau Windows caché : rien ne peut apparaître sur les écrans du poste.
if (Enter-BureauCache $PSCommandPath $PSBoundParameters) { exit $LASTEXITCODE }
# La fenêtre « Récupérer » naît par createWindow : hors écran, écrans simulés.
Use-HorsEcran
$captures = "$wt\tmp\demo-medias-sites\captures"

Push-Location $wt
try {
  npm run build | Out-Null
  npx electron docs\demo-medias-sites.cjs 2>&1 | ForEach-Object { "   $_" }
  $code = $LASTEXITCODE
} finally { Pop-Location }

if ($code -ne 0) { throw "La démonstration a échoué : voir $captures\resultat.txt" }
"Captures : $captures"
