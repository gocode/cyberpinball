# Revue sans opérateur de l'écran du navigateur intégré (fenêtre « Récupérer ») sur les
# écrans simulés de la borne (docs\ecrans\borne.json) : le choix dans le menu, avec son
# aperçu, puis la fenêtre ouverte sur chaque rôle choisi (Automatique, Playfield, Fronton,
# DMD, Topper), et le repli quand le DMD est débranché. Fausse page de connexion : aucun
# site n'est chargé. Captures et relevé dans tmp\demo-ecran-navigateur\captures.
#   .\docs\demo-ecran-navigateur.ps1
$ErrorActionPreference = 'Stop'
$wt = Split-Path $PSScriptRoot -Parent
. "$PSScriptRoot\hors-ecran.ps1"
# Tout le reste tourne sur un bureau Windows caché : rien ne peut apparaître sur les écrans du poste.
if (Enter-BureauCache $PSCommandPath $PSBoundParameters) { exit $LASTEXITCODE }
# La fenêtre « Récupérer » naît par createWindow : hors écran, sur les écrans simulés de la borne.
Use-HorsEcran 'borne'
$captures = "$wt\tmp\demo-ecran-navigateur\captures"

Push-Location $wt
try {
  npm run build | Out-Null
  npx electron docs\demo-ecran-navigateur.cjs 2>&1 | ForEach-Object { "   $_" }
  $code = $LASTEXITCODE
} finally { Pop-Location }

if ($code -ne 0) { throw "La démonstration a échoué : voir $captures\resultat.txt" }
"Captures : $captures"
