# Démonstration sans opérateur du choix de la table d'une partie en direct (packages\core\src\livechoice.ts),
# hors écran sur un bureau Windows caché : avec deux amis (Bruno et Émile), la table que tous deux ont
# dans la même version en tête, puis celle à vérifier, puis les indisponibles, grisées avec qui bloque ;
# puis Bruno seul. Tables inventées, bibliothèques des amis simulées : aucun réseau, VPX n'est jamais
# lancé. Borne (playfield couché) et poste, français et anglais. Le garde-fou de mise en page
# (chevauchement, rognure, texte trop petit) doit rester muet.
#   .\docs\demo-tables-compatibles.ps1
# Captures, relevé (resultat.txt) et mise-en-page.txt dans tmp\demo-tables-compatibles\captures.
$ErrorActionPreference = 'Stop'
$wt = Split-Path $PSScriptRoot -Parent
. "$PSScriptRoot\hors-ecran.ps1"
# Tout le reste tourne sur un bureau Windows caché : rien ne peut apparaître sur les écrans du poste.
if (Enter-BureauCache $PSCommandPath $PSBoundParameters) { exit $LASTEXITCODE }
Use-HorsEcran
$captures = "$wt\tmp\demo-tables-compatibles\captures"
$electron = node -p "require('electron')"

Push-Location $wt
try { npm run build | Out-Null } finally { Pop-Location }

# Un message de Chromium sur stderr (« GPU state invalid… ») n'arrête pas la démonstration.
Push-Location $wt
$ErrorActionPreference = 'Continue'
try {
  & $electron docs\demo-tables-compatibles.cjs 2>&1 | ForEach-Object { "   $_" }
  $code = $LASTEXITCODE
} finally { $ErrorActionPreference = 'Stop'; Pop-Location }
if ($code -ne 0) { throw "La démonstration a échoué : voir $captures\resultat.txt" }
if ((Get-Content "$captures\mise-en-page.txt" -Raw -Encoding UTF8) -notmatch '^Aucun problème') { throw "Mise en page : voir $captures\mise-en-page.txt" }
"Captures : $captures"
