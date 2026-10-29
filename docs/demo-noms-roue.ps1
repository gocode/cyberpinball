# Démonstration sans opérateur des noms de la roue (revue de Codex du 29/10/2026 : les noms des
# petits médaillons passaient sous le plancher de 20 px), hors écran sur un bureau Windows caché.
# docs\demo-noms-roue.cjs envoie à la vraie page du playfield un menu de dix tables sans logo
# (noms courts, longs, d'un seul mot, accentués) pour chacune des quatre roues et pour la liste :
#   borne  : playfield 4K couché, la mise en page pivotée ; écran debout ;
#   bureau : 1080p, 1366 × 768, 1280 × 1024, 1024 × 768, 4K.
# Au repos, en plein glissement (un flipper vient d'être pressé) et à l'arrivée, le corps rendu de
# ce que montre chaque médaillon (police × échelle de la roue : le nom au centre, l'initiale
# ailleurs) est relevé dans corps.txt ; rien ne doit passer sous 20 px, et le garde-fou de mise en
# page (layout-check.ts) doit rester muet. Captures et relevés dans tmp\captures\noms-roue.
#   .\docs\demo-noms-roue.ps1 [-Seulement <expression des cas, bureau-1080p par exemple>]
# VPX n'est jamais lancé ; ni le vrai modèle de borne ni le vrai VPinballX.ini ne sont lus.
param([string]$Seulement = '')
$ErrorActionPreference = 'Stop'
$wt = Split-Path $PSScriptRoot -Parent
. "$PSScriptRoot\hors-ecran.ps1"
# Tout le reste tourne sur un bureau Windows caché : rien ne peut apparaître sur les écrans du poste.
if (Enter-BureauCache $PSCommandPath $PSBoundParameters) { exit $LASTEXITCODE }
$base = "$wt\tmp\demo-noms-roue"
$captures = "$wt\tmp\captures\noms-roue"
$electron = node -p "require('electron')"

Push-Location $wt
try { npm run build | Out-Null } finally { Pop-Location }

if (Test-Path $captures) { Remove-Item -Recurse -Force $captures }
New-Item -ItemType Directory -Force $base, $captures | Out-Null
@{ out = $captures; only = $Seulement } | ConvertTo-Json | Set-Content -Path "$base\spec.json" -Encoding UTF8

Push-Location $wt
try { & $electron docs\demo-noms-roue.cjs "$base\spec.json" 2>&1 | ForEach-Object { "   $_" } } finally { Pop-Location }
$code = $LASTEXITCODE
Get-ChildItem $captures -Filter *.png | Measure-Object | ForEach-Object { "  $($_.Count) captures dans $captures" }
if ($code -ne 0) { throw "Noms de la roue : voir $captures\mise-en-page.txt" }
'Noms de la roue : aucun nom sous 20 px, aucun problème de mise en page.'
