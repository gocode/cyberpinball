# Banc hors écran des réglages en partie (retours du 01/11/2026 : déplacer le DMD en partie était
# compliqué), sur un bureau Windows caché. docs\demo-position-dmd.cjs rend la vraie page du menu que
# les deux MagnaSave ouvrent pendant une partie, « Position du DMD » en tête, sur chaque jeu d'écrans
# simulés (borne, poste à deux écrans, un écran), dans plusieurs sens du plateau et dans chaque état
# (menu ouvert, position ouverte, choix de l'écran, DMD masqué, question avant de quitter, partie sans
# fenêtre du DMD, enregistré). Le garde-fou de mise en page doit rester muet. Captures et planches
# (les écrans à l'échelle, le panneau et le cadre du DMD à leur place) dans
# tmp\captures\position-dmd\<langue>.
#   .\docs\demo-position-dmd.ps1 [-Langues fr, en]
# VPX n'est jamais lancé ; ni le vrai modèle de borne ni ses tables ne sont lus.
param([string[]]$Langues = @('fr', 'en'))
$ErrorActionPreference = 'Stop'
$wt = Split-Path $PSScriptRoot -Parent
. "$PSScriptRoot\hors-ecran.ps1"
# Tout le reste tourne sur un bureau Windows caché : rien ne peut apparaître sur les écrans du poste.
if (Enter-BureauCache $PSCommandPath $PSBoundParameters) { exit $LASTEXITCODE }
$electron = node -p "require('electron')"

Push-Location $wt
try { npm run build | Out-Null } finally { Pop-Location }

$failures = @()
foreach ($langue in $Langues) {
  $captures = "$wt\tmp\captures\position-dmd\$langue"
  if (Test-Path $captures) { Remove-Item -Recurse -Force $captures }
  New-Item -ItemType Directory -Force $captures | Out-Null
  @{ out = $captures; langue = $langue } | ConvertTo-Json | Set-Content -Path "$wt\tmp\demo-position-dmd.json" -Encoding UTF8
  Write-Host "== $langue"
  Push-Location $wt
  try { & $electron docs\demo-position-dmd.cjs "$wt\tmp\demo-position-dmd.json" 2>&1 | Where-Object { "$_" -notmatch 'disk_cache|gpu_disk_cache|Security Warning' } | ForEach-Object { "   $_" } } finally { Pop-Location }
  if ($LASTEXITCODE -ne 0) { $failures += "$langue : voir $captures\mise-en-page.txt" }
}
if ($failures.Count) { throw "Réglages en partie en échec :`n  $($failures -join "`n  ")" }
