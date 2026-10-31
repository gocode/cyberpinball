# Banc hors écran des notifications de la partie entre amis (essai réel du 31/10/2026), sur un
# bureau Windows caché. docs\demo-notifications-partie.cjs tire les nouvelles du vrai relevé et de
# la vraie file (un invité accepte, deux ensemble, un refus avec sa raison, pas de réponse, des noms
# trop longs, un joueur qui quitte, la partie finie gagnée ou perdue), puis les dessine dans les
# vraies pages : au menu des tables et dans le menu système (frontend.html : borne, borne pivotée,
# bureau, bureau 4:3), et pendant la partie d'une autre table (game-notice.html : chaque jeu
# d'écrans simulés, les quatre sens du plateau, seule ou sous la carte d'une invitation). Le garde-fou
# de mise en page doit rester muet. Captures, planches et relevé dans
# tmp\captures\notifications-partie\<langue>.
#   .\docs\demo-notifications-partie.ps1 [-Langues fr, en]
# VPX n'est jamais lancé ; ni le vrai réseau, ni le vrai modèle de borne, ni ses tables ne sont lus.
param([string[]]$Langues = @('fr', 'en'))
$ErrorActionPreference = 'Stop'
$wt = Split-Path $PSScriptRoot -Parent
. "$PSScriptRoot\hors-ecran.ps1"
# Tout le reste tourne sur un bureau Windows caché : rien ne peut apparaître sur les écrans du poste.
if (Enter-BureauCache $PSCommandPath $PSBoundParameters) { exit $LASTEXITCODE }
Use-HorsEcran
$electron = node -p "require('electron')"

Push-Location $wt
try { npm run build | Out-Null } finally { Pop-Location }

$failures = @()
foreach ($langue in $Langues) {
  $captures = "$wt\tmp\captures\notifications-partie\$langue"
  if (Test-Path $captures) { Remove-Item -Recurse -Force $captures }
  New-Item -ItemType Directory -Force $captures | Out-Null
  @{ out = $captures; langue = $langue } | ConvertTo-Json | Set-Content -Path "$wt\tmp\demo-notifications-partie.json" -Encoding UTF8
  Write-Host "== $langue"
  Push-Location $wt
  $ErrorActionPreference = 'Continue'
  try { & $electron docs\demo-notifications-partie.cjs "$wt\tmp\demo-notifications-partie.json" 2>&1 | Where-Object { "$_" -notmatch 'disk_cache|gpu_disk_cache|Security Warning' } | ForEach-Object { "   $_" }; $code = $LASTEXITCODE } finally { $ErrorActionPreference = 'Stop'; Pop-Location }
  if ($code -ne 0) { $failures += "$langue : voir $captures\mise-en-page.txt" }
}
if ($failures.Count) { throw "Notifications de la partie entre amis en échec :`n  $($failures -join "`n  ")" }
"Captures : $wt\tmp\captures\notifications-partie"
