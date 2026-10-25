# Revue sans opérateur de l'écran « Téléchargements » et du sélecteur de fichiers de Cyber
# Pinball (entonnoir, clé USB simulée, médias d'une table, « Tout vider »), en paysage,
# couché (borne, menu tourné) et portrait, en français et en anglais.
# Captures, relevé (resultat.txt) et contrôle de la mise en page dans tmp\demo-telechargements\captures.
#   .\docs\demo-telechargements.ps1
$ErrorActionPreference = 'Stop'
$wt = Split-Path $PSScriptRoot -Parent
. "$PSScriptRoot\hors-ecran.ps1"
# Tout le reste tourne sur un bureau Windows caché : rien ne peut apparaître sur les écrans du poste.
if (Enter-BureauCache $PSCommandPath $PSBoundParameters) { exit $LASTEXITCODE }
Use-HorsEcran
$captures = "$wt\tmp\demo-telechargements\captures"

Push-Location $wt
try {
  npm run build | Out-Null
  npx electron docs\demo-telechargements.cjs 2>&1 | ForEach-Object { "   $_" }
  $code = $LASTEXITCODE
} finally { Pop-Location }

if ($code -ne 0) { throw "La démonstration a échoué : voir $captures\resultat.txt" }
"Captures : $captures"
