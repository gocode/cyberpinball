# Démonstration sans opérateur de l'écran de chargement d'une table (demande du
# 26/10/2026), hors écran sur un bureau Windows caché. Tables et médias inventés
# (docs\demo-moments.cjs : vidéo de chargement en paysage, en portrait, table sans média au
# titre très long) ; docs\demo-chargement.cjs envoie à la vraie page du playfield l'état du
# chargement de chaque cas et le capture :
#   borne  : écran debout, ou couché avec la mise en page pivotée (90° et 270°) : le média de
#            chargement seul, plein écran ; sans média, le repli sans libellé ; réglage de
#            l'affichage : l'aide-mémoire du menu de VPX, seul texte permis ;
#   bureau : 1080p, 1366 × 768, 1280 × 720, 1280 × 1024, 1024 × 768, 2560 × 1080, 4K : le média
#            (ou son repli) dans le cadre 9:16, l'encart du titre, de l'état et des commandes à
#            sa droite ; commandes nombreuses aux noms longs (boutons de joystick).
# Le garde-fou de mise en page (layout-check.ts) doit rester muet : chevauchement, rognure,
# texte en borne, encart sur le cadre du média. Captures et relevé dans tmp\captures\chargement.
#   .\docs\demo-chargement.ps1
# VPX n'est jamais lancé ; ni le vrai modèle de borne ni le vrai VPinballX.ini ne sont lus.
$ErrorActionPreference = 'Stop'
$wt = Split-Path $PSScriptRoot -Parent
. "$PSScriptRoot\hors-ecran.ps1"
# Tout le reste tourne sur un bureau Windows caché : rien ne peut apparaître sur les écrans du poste.
if (Enter-BureauCache $PSCommandPath $PSBoundParameters) { exit $LASTEXITCODE }
$base = "$wt\tmp\demo-chargement"
$root = "$base\root"
$captures = "$wt\tmp\captures\chargement"
$electron = node -p "require('electron')"

Push-Location $wt
try { npm run build | Out-Null } finally { Pop-Location }

if (-not (Test-Path "$root\tables")) {
  '== tables inventées et leurs médias'
  Push-Location $wt
  try { & $electron docs\demo-moments.cjs $root 2>&1 | ForEach-Object { "   $_" } } finally { Pop-Location }
  if ($LASTEXITCODE -ne 0) { throw 'Génération des médias en échec.' }
}
if (Test-Path $captures) { Remove-Item -Recurse -Force $captures }
New-Item -ItemType Directory -Force $captures | Out-Null
@{ root = $root; out = $captures } | ConvertTo-Json | Set-Content -Path "$base\spec.json" -Encoding UTF8

Push-Location $wt
try { & $electron docs\demo-chargement.cjs "$base\spec.json" 2>&1 | ForEach-Object { "   $_" } } finally { Pop-Location }
$code = $LASTEXITCODE
Get-ChildItem $captures -Filter *.png | Measure-Object | ForEach-Object { "  $($_.Count) captures dans $captures" }
if ($code -ne 0) { throw "Écran de chargement : voir $captures\mise-en-page.txt" }
'Écran de chargement : aucun problème de mise en page.'
