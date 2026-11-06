# Démonstration sans opérateur de la couleur de chaque table au menu (06/11/2026), hors écran sur
# un bureau Windows caché. docs\demo-couleur-table.cjs envoie aux vraies pages du playfield et du
# fronton un menu de tables inventées aux frontons très différents (docs\demo-captures-medias),
# avec la teinte que mesure le menu (packages\core\src\tabletint.ts), puis sans :
#   borne  : playfield debout et l'écran du fronton (une table sans fronton : son repli teinté) ;
#   bureau : 1080p, le fronton en fond à côté du plateau ;
#   pivote : playfield 4K couché, la mise en page pivotée.
# Le garde-fou de mise en page doit rester muet, les zones du menu ne pas bouger avec la couleur,
# l'anneau de la sélection rester au vert signal, et la teinte passer d'une table à l'autre en fondu.
# Captures, planches et relevés dans tmp\captures\couleur-table.
#   .\docs\demo-couleur-table.ps1 [-Seulement <borne|bureau|pivote>] [-Css <feuille ajoutée, pour une maquette>]
# VPX n'est jamais lancé ; ni le vrai modèle de borne ni le vrai VPinballX.ini ne sont lus.
param([string]$Seulement = '', [string]$Css = '')
$ErrorActionPreference = 'Stop'
$wt = Split-Path $PSScriptRoot -Parent
. "$PSScriptRoot\hors-ecran.ps1"
# Tout le reste tourne sur un bureau Windows caché : rien ne peut apparaître sur les écrans du poste.
if (Enter-BureauCache $PSCommandPath $PSBoundParameters) { exit $LASTEXITCODE }
$base = "$wt\tmp\demo-couleur-table"
$captures = "$wt\tmp\captures\couleur-table"
$electron = node -p "require('electron')"

Push-Location $wt
try { npm run build | Out-Null } finally { Pop-Location }

if (Test-Path $captures) { Remove-Item -Recurse -Force $captures }
New-Item -ItemType Directory -Force $base, $captures | Out-Null
$spec = @{ out = $captures; only = $Seulement }
if ($Css) { $spec.css = (Resolve-Path $Css).Path }
$spec | ConvertTo-Json | Set-Content -Path "$base\spec.json" -Encoding UTF8

Push-Location $wt
try { & $electron docs\demo-couleur-table.cjs "$base\spec.json" 2>&1 | ForEach-Object { "   $_" } } finally { Pop-Location }
$code = $LASTEXITCODE
Get-ChildItem $captures -Filter *.png | Measure-Object | ForEach-Object { "  $($_.Count) captures dans $captures" }
if ($code -ne 0) { throw "Couleur de chaque table : voir $captures\mise-en-page.txt" }
'Couleur de chaque table : mise en page stable, sélection au vert signal, teinte en fondu.'
