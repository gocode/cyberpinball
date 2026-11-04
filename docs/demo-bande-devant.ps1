# Banc de la bande d'une partie entre amis au-dessus d'un B2S ou d'un PuP-Pack (essai du 04/11/2026 :
# en automatique, la bande va sur le fronton même quand la table s'en sert, et y reste devant), sur un
# bureau Windows caché : rien n'apparaît sur les écrans du poste. docs\demo-bande-devant.cjs pose la
# vraie bande sur un fronton simulé, qu'une fenêtre d'un autre processus couvre au premier plan
# permanent (B2S), puis réaffirmé toutes les 100 ms (PuP insistant), et mesure qui est devant.
# Rapport dans tmp\captures\bande-devant\rapport.txt.
#   .\docs\demo-bande-devant.ps1
# VPX n'est jamais lancé ; ni le vrai modèle de borne ni ses tables ne sont lus.
$ErrorActionPreference = 'Stop'
$wt = Split-Path $PSScriptRoot -Parent
. "$PSScriptRoot\hors-ecran.ps1"
# Tout le reste tourne sur un bureau Windows caché : rien ne peut apparaître sur les écrans du poste.
if (Enter-BureauCache $PSCommandPath $PSBoundParameters) { exit $LASTEXITCODE }
$electron = node -p "require('electron')"

Push-Location $wt
try { npm run build | Out-Null } finally { Pop-Location }

$out = "$wt\tmp\captures\bande-devant"
if (Test-Path $out) { Remove-Item -Recurse -Force $out }
New-Item -ItemType Directory -Force $out | Out-Null
@{ out = $out } | ConvertTo-Json | Set-Content -Path "$wt\tmp\demo-bande-devant.json" -Encoding UTF8
Push-Location $wt
try { & $electron docs\demo-bande-devant.cjs "$wt\tmp\demo-bande-devant.json" 2>&1 | Where-Object { "$_" -notmatch 'disk_cache|gpu_disk_cache|Security Warning' } | ForEach-Object { "   $_" } } finally { Pop-Location }
if ($LASTEXITCODE -ne 0) { throw "Bande devant le B2S et le PuP : voir $out\rapport.txt" }
