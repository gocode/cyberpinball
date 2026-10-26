# Revue sans opérateur de « Santé de la borne » (Menu système > Borne) : le bilan et ses
# lignes (espace disque, tables, médias, écrans, VPX), la pastille jusqu'à la roue dentée,
# chaque réparation ouverte puis le retour à la page, « Vérifier maintenant ». Bac à sable
# inventé (docs\demo-sante.cjs), écrans simulés de la borne (playfield 4K couché, mise en
# page tournée) et du PC de développement (1920 × 1080 et 1366 × 768), en français et en
# anglais. VPX n'est jamais lancé, rien n'est téléchargé.
# Captures, relevé (resultat.txt) et contrôle de la mise en page dans tmp\demo-sante\captures.
#   .\docs\demo-sante.ps1
$ErrorActionPreference = 'Stop'
$wt = Split-Path $PSScriptRoot -Parent
. "$PSScriptRoot\hors-ecran.ps1"
# Tout le reste tourne sur un bureau Windows caché : rien ne peut apparaître sur les écrans du poste.
if (Enter-BureauCache $PSCommandPath $PSBoundParameters) { exit $LASTEXITCODE }
Use-HorsEcran
$captures = "$wt\tmp\demo-sante\captures"

Push-Location $wt
try {
  npm run build | Out-Null
  npx electron docs\demo-sante.cjs 2>&1 | ForEach-Object { "   $_" }
  $code = $LASTEXITCODE
} finally { Pop-Location }

if ($code -ne 0) { throw "La démonstration a échoué : voir $captures\resultat.txt" }
"Captures : $captures"
