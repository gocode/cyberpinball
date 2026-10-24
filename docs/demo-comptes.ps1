# Revue sans opérateur des comptes des sites et du téléchargement direct, sur de
# fausses fiches imitant vpuniverse.com et vpforums.org (aucune page des forums n'est
# chargée) : connexion gardée, téléchargement sans fenêtre, repli sur la page quand le
# site demande quelque chose, déconnexion. Captures et relevé dans
# tmp\demo-comptes\captures.
#   .\docs\demo-comptes.ps1
$ErrorActionPreference = 'Stop'
$wt = Split-Path $PSScriptRoot -Parent
. "$PSScriptRoot\hors-ecran.ps1"
# Tout le reste tourne sur un bureau Windows caché : rien ne peut apparaître sur les écrans du poste.
if (Enter-BureauCache $PSCommandPath $PSBoundParameters) { exit $LASTEXITCODE }
# La fenêtre « Récupérer » naît par createWindow : hors écran, écrans simulés.
Use-HorsEcran
$captures = "$wt\tmp\demo-comptes\captures"

Push-Location $wt
try {
  npm run build | Out-Null
  npx electron docs\demo-comptes.cjs 2>&1 | ForEach-Object { "   $_" }
  $code = $LASTEXITCODE
} finally { Pop-Location }

if ($code -ne 0) { throw "La démonstration a échoué : voir $captures\resultat.txt" }
"Captures : $captures"
