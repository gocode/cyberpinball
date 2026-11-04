# Habillage de la chaîne YouTube officielle (https://www.youtube.com/@cyberpinball), refait d'un
# seul geste, hors écran, sur un bureau Windows caché (rien n'apparaît sur les écrans du poste) :
# docs\Design\presentation\youtube\banniere.png (2560 × 1440), profil.png (800 × 800) et, dans
# apercus\, la bannière avec ses zones d'affichage (télévision, ordinateur, téléphone) et la photo
# de profil en rond à 176, 98 et 40 px. Composition : docs\demo-youtube.html ; rendu :
# docs\demo-youtube.cjs. docs\demo-presentation.ps1 l'appelle aussi.
# Les descriptions de la chaîne (FR, EN) sont à côté : description-chaine.fr.txt, .en.txt.
#   .\docs\demo-youtube.ps1
$ErrorActionPreference = 'Stop'
$wt = Split-Path $PSScriptRoot -Parent
. "$PSScriptRoot\hors-ecran.ps1"
if (Enter-BureauCache $PSCommandPath $PSBoundParameters) { exit $LASTEXITCODE }

$electron = node -p "require('electron')"
$kit = "$wt\docs\Design\presentation\youtube"
New-Item -ItemType Directory -Force $kit | Out-Null
'== chaîne YouTube'
Push-Location $wt
try { & $electron docs\demo-youtube.cjs $kit 2>&1 | Where-Object { "$_" -match '^(Image|Aperçus|.*impossible)' } | ForEach-Object { "   $_" } } finally { Pop-Location }
if ($LASTEXITCODE -ne 0) { throw 'Habillage YouTube en échec.' }
