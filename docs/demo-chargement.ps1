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
# texte en borne, encart sur le cadre du média. Chargement qui tarde : l'étape vue, le temps écoulé
# et l'arrêt dans l'encart du bureau ; en borne, toujours rien sur le média. En français puis en anglais.
# Captures et relevé dans tmp\captures\chargement\<langue>.
#   .\docs\demo-chargement.ps1 [-Langues fr, en]
# VPX n'est jamais lancé ; ni le vrai modèle de borne ni le vrai VPinballX.ini ne sont lus.
param([string[]]$Langues = @('fr', 'en'))
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
$failed = @()
foreach ($langue in $Langues) {
  "== $langue"
  $out = "$captures\$langue"
  New-Item -ItemType Directory -Force $out | Out-Null
  @{ root = $root; out = $out; lang = $langue } | ConvertTo-Json | Set-Content -Path "$base\spec-$langue.json" -Encoding UTF8
  Push-Location $wt
  try { & $electron docs\demo-chargement.cjs "$base\spec-$langue.json" 2>&1 | ForEach-Object { "   $_" } } finally { Pop-Location }
  if ($LASTEXITCODE -ne 0) { $failed += "$out\mise-en-page.txt" }
  Get-ChildItem $out -Filter *.png | Measure-Object | ForEach-Object { "  $($_.Count) captures dans $out" }
}
if ($failed.Count) { throw "Écran de chargement : voir $($failed -join ', ')" }
'Écran de chargement : aucun problème de mise en page.'
