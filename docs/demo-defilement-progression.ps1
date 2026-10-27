# Démonstration sans opérateur du défilement gardé pendant un téléchargement : écran de
# propositions de médias dans le vrai rendu du menu, liste remontée à la vraie molette, tics de
# progression (la liste ne bouge pas), flipper (la carte choisie revient dans la vue), autre
# écran (repart du haut), défilement posé sans geste (relevé par le diagnostic).
# Captures et relevé (resultat.txt) dans tmp\demo-defilement-progression.
#   .\docs\demo-defilement-progression.ps1
$ErrorActionPreference = 'Stop'
$wt = Split-Path $PSScriptRoot -Parent
. "$PSScriptRoot\hors-ecran.ps1"
# Tout le reste tourne sur un bureau Windows caché : rien ne peut apparaître sur les écrans du poste.
if (Enter-BureauCache $PSCommandPath $PSBoundParameters) { exit $LASTEXITCODE }
Use-HorsEcran
$electron = node -p "require('electron')"

Push-Location $wt
$ErrorActionPreference = 'Continue'
try { & $electron docs\demo-defilement-progression.cjs 2>&1 | ForEach-Object { "   $_" }; $code = $LASTEXITCODE } finally { $ErrorActionPreference = 'Stop'; Pop-Location }
if ($code -ne 0) { throw "La démonstration a échoué : voir $wt\tmp\demo-defilement-progression\resultat.txt" }
"Captures : $wt\tmp\demo-defilement-progression"
