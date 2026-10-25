# Revue sans opérateur de la progression des téléchargements dans le bandeau de la fenêtre
# « Récupérer » : un petit serveur local lent envoie des fichiers de taille connue puis
# inconnue ; le bandeau montre barre, pourcentage, volume, débit et temps restant ; Start de
# la borne et la souris annulent ; un petit fichier va au bout ; quatre à la fois se
# résument ; puis un écran de 1366 × 768. Aucun site n'est chargé.
# Captures et relevé dans tmp\demo-telechargement\captures.
#   .\docs\demo-telechargement.ps1
$ErrorActionPreference = 'Stop'
$wt = Split-Path $PSScriptRoot -Parent
. "$PSScriptRoot\hors-ecran.ps1"
# Tout le reste tourne sur un bureau Windows caché : rien ne peut apparaître sur les écrans du poste.
if (Enter-BureauCache $PSCommandPath $PSBoundParameters) { exit $LASTEXITCODE }
# La fenêtre « Récupérer » naît par createWindow : hors écran, sur les écrans simulés du poste de développement.
Use-HorsEcran 'pc-dev'
$captures = "$wt\tmp\demo-telechargement\captures"

Push-Location $wt
try {
  npm run build | Out-Null
  npx electron docs\demo-telechargement.cjs 2>&1 | ForEach-Object { "   $_" }
  $code = $LASTEXITCODE
} finally { Pop-Location }

if ($code -ne 0) { throw "La démonstration a échoué : voir $captures\resultat.txt" }
"Captures : $captures"
