# Habillage des vidéos de la chaîne YouTube (pages de video\habillage), rendu d'un seul geste,
# hors écran, sur un bureau Windows caché (rien n'apparaît sur les écrans du poste) :
# video\habillage\rendus\planche-*.jpg (toutes les maquettes, pour validation),
# miniature-presentation.png et miniature-07-il-manque.png (gabarit des miniatures, § 7 du plan),
# et dans apercus\ chaque image seule et les miniatures aux tailles d'affichage de YouTube.
# Composition : video\habillage\*.html (contrat de temps : habillage.js) ; liste des images et des
# planches : video\habillage\planche.json ; rendu : docs\demo-habillage.cjs.
#   .\docs\demo-habillage.ps1
#   .\docs\demo-habillage.ps1 -Seulement ident,chapitre   # quelques pages, sans planche
param([string]$Seulement = '')
$ErrorActionPreference = 'Stop'
$wt = Split-Path $PSScriptRoot -Parent
. "$PSScriptRoot\hors-ecran.ps1"
if (Enter-BureauCache $PSCommandPath $PSBoundParameters) { exit $LASTEXITCODE }

$electron = node -p "require('electron')"
$sortie = "$wt\video\habillage\rendus"
New-Item -ItemType Directory -Force $sortie | Out-Null
'== habillage des vidéos'
$arguments = @('docs\demo-habillage.cjs', $sortie)
if ($Seulement) { $arguments += $Seulement }
Push-Location $wt
try { & $electron @arguments 2>&1 | Where-Object { "$_" -match '^(Images|Miniature|Planche|Aperçus|.*impossible)' } | ForEach-Object { "   $_" } } finally { Pop-Location }
if ($LASTEXITCODE -ne 0) { throw 'Habillage des vidéos en échec.' }
