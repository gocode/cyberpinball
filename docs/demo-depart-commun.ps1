# Banc hors écran de l'attente du départ commun d'une partie entre amis (essai du 31/10/2026 : une
# borne partait seule, l'autre chargeait encore, et rien ne disait pourquoi), sur un bureau Windows
# caché. docs\demo-depart-commun.cjs pose la carte de l'attente (liveWaitBounds) sur chaque jeu
# d'écrans simulés (borne, poste à deux écrans, un écran), dans les quatre sens du plateau, de deux à
# quatre joueurs, à chaque moment (un joueur charge encore, le délai des derniers, un retardataire,
# « Partez ! », table sans relevé), et rend la vraie page à cette taille. Le garde-fou de mise en
# page doit rester muet. Captures et planches dans tmp\captures\depart-commun\<langue>.
#   .\docs\demo-depart-commun.ps1 [-Langues fr, en]
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
  $captures = "$wt\tmp\captures\depart-commun\$langue"
  if (Test-Path $captures) { Remove-Item -Recurse -Force $captures }
  New-Item -ItemType Directory -Force $captures | Out-Null
  @{ out = $captures; langue = $langue } | ConvertTo-Json | Set-Content -Path "$wt\tmp\demo-depart-commun.json" -Encoding UTF8
  Write-Host "== $langue"
  Push-Location $wt
  try { & $electron docs\demo-depart-commun.cjs "$wt\tmp\demo-depart-commun.json" 2>&1 | Where-Object { "$_" -notmatch 'disk_cache|gpu_disk_cache|Security Warning' } | ForEach-Object { "   $_" } } finally { Pop-Location }
  if ($LASTEXITCODE -ne 0) { $failures += "$langue : voir $captures\mise-en-page.txt" }
}
if ($failures.Count) { throw "Départ commun en échec :`n  $($failures -join "`n  ")" }
