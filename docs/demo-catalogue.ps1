# Revue sans opérateur de l'acquisition des tables : catalogue de la vraie base VPS
# (copiée depuis D:\CyberPinball\downloads), fiche de Terminator 2, ce qu'il faut pour
# la borne, fenêtre « Récupérer » sur de fausses fiches (aucune page de vpuniverse.com
# ni de vpforums.org n'est chargée), liste d'attente, surveillance d'un dossier
# Téléchargements simulé, installation par le plan d'import, mises à jour. Les
# vignettes viennent de la base VPS (connexion à Internet nécessaire). Captures,
# relevé (resultat.txt) et contrôle de la mise en page dans tmp\demo-catalogue\captures.
#   .\docs\demo-catalogue.ps1
$ErrorActionPreference = 'Stop'
$wt = Split-Path $PSScriptRoot -Parent
. "$PSScriptRoot\hors-ecran.ps1"
# Tout le reste tourne sur un bureau Windows caché : rien ne peut apparaître sur les écrans du poste.
if (Enter-BureauCache $PSCommandPath $PSBoundParameters) { exit $LASTEXITCODE }
# La fenêtre « Récupérer » naît par createWindow : hors écran, écrans simulés.
Use-HorsEcran
$captures = "$wt\tmp\demo-catalogue\captures"

Push-Location $wt
try {
  npm run build | Out-Null
  npx electron docs\demo-catalogue.cjs 2>&1 | ForEach-Object { "   $_" }
  $code = $LASTEXITCODE
} finally { Pop-Location }

if ($code -ne 0) { throw "La démonstration a échoué : voir $captures\resultat.txt" }
"Captures : $captures"
