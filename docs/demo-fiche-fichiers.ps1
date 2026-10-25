# Revue sans opérateur de la fiche d’une table et de sa section « Fichiers » : une table à
# peu de fichiers, une autre à beaucoup (noms longs, ROM liées à la bibliothèque, fronton mal
# nommé), en paysage, couché (borne, menu tourné) et portrait, en français et en anglais.
# Captures, relevé (resultat.txt) et contrôle de la mise en page dans tmp\demo-fiche-fichiers\captures.
#   .\docs\demo-fiche-fichiers.ps1
$ErrorActionPreference = 'Stop'
$wt = Split-Path $PSScriptRoot -Parent
. "$PSScriptRoot\hors-ecran.ps1"
# Tout le reste tourne sur un bureau Windows caché : rien ne peut apparaître sur les écrans du poste.
if (Enter-BureauCache $PSCommandPath $PSBoundParameters) { exit $LASTEXITCODE }
# La fenêtre « Récupérer » naît par createWindow : hors écran, écrans simulés.
Use-HorsEcran
$captures = "$wt\tmp\demo-fiche-fichiers\captures"

Push-Location $wt
try {
  npm run build | Out-Null
  npx electron docs\demo-fiche-fichiers.cjs 2>&1 | ForEach-Object { "   $_" }
  $code = $LASTEXITCODE
} finally { Pop-Location }

if ($code -ne 0) { throw "La démonstration a échoué : voir $captures\resultat.txt" }
"Captures : $captures"
