# Banc hors écran de la bande d'une partie entre amis (essai du 30/10/2026 : en haut du plateau, elle
# cachait la bille), sur un bureau Windows caché. docs\demo-bande-partie.cjs calcule sa place
# (liveBoardPlacement) sur chaque jeu d'écrans simulés (borne, poste à deux écrans, un écran), dans
# les quatre sens du plateau, de un à quatre joueurs, fronton libre ou pris par VPX, et rend la vraie
# page de la bande à cette taille : cartes d'un écran libre, encart au bas du plateau, points du DMD.
# Le garde-fou de mise en page doit rester muet. Captures et planches (les écrans à l'échelle, chaque
# forme à sa place) dans tmp\captures\bande-partie\<langue>.
#   .\docs\demo-bande-partie.ps1 [-Langues fr, en]
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
  $captures = "$wt\tmp\captures\bande-partie\$langue"
  if (Test-Path $captures) { Remove-Item -Recurse -Force $captures }
  New-Item -ItemType Directory -Force $captures | Out-Null
  @{ out = $captures; langue = $langue } | ConvertTo-Json | Set-Content -Path "$wt\tmp\demo-bande-partie.json" -Encoding UTF8
  Write-Host "== $langue"
  Push-Location $wt
  try { & $electron docs\demo-bande-partie.cjs "$wt\tmp\demo-bande-partie.json" 2>&1 | Where-Object { "$_" -notmatch 'disk_cache|gpu_disk_cache|Security Warning' } | ForEach-Object { "   $_" } } finally { Pop-Location }
  if ($LASTEXITCODE -ne 0) { $failures += "$langue : voir $captures\mise-en-page.txt" }
}
if ($failures.Count) { throw "Bande de la partie en échec :`n  $($failures -join "`n  ")" }
