# Diagnostic de l'habillage FullDMD de toutes les tables (app\src\fulldmd-cli.ts), lancé par
# « npm run habillage ». Pour chaque table : le cadre trouvé dans son média FullDMD (images et
# vidéos), la place du DMD en partie, et les tables dont le DMD recouvrirait l'habillage.
# Electron lit les vidéos dans une page hors écran ; il tourne ici sur un bureau Windows caché :
# rien ne peut apparaître sur les écrans du poste. Rien n'est changé aux tables (seul le cache
# des cadres, <racine>\data\cache\fulldmd-cadres.json, est complété).
#   .\docs\diagnostic-habillage.ps1 [-Racine D:\CyberPinball]
# Codes de sortie : 0 aucune table touchée, 1 au moins une, 2 pas de borne ou pas de FullDMD, 3 erreur.
param([string]$Racine = '')
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\hors-ecran.ps1"
if (Enter-BureauCache $PSCommandPath $PSBoundParameters) { exit $LASTEXITCODE }
Assert-Compile
$wt = Split-Path $PSScriptRoot -Parent
$cli = Join-Path $wt 'app\dist\fulldmd-cli.js'
# Sans le fichier, Electron ouvrirait sa propre fenêtre d'erreur.
if (-not (Test-Path $cli)) { throw "Compilation incomplète : $cli absent (npm run build)." }
if ($Racine) { $env:CYBERPINBALL_ROOT = $Racine }
$electron = node -p "require('electron')"
$dir = Join-Path $wt 'tmp\diagnostic-habillage'
New-Item -ItemType Directory -Force $dir | Out-Null
# cmd attend Electron (application graphique) et garde sa sortie (voir demo-barre-taches.ps1).
$line = "`"$electron`" `"$cli`" --user-data-dir=`"$dir\chromium`" > `"$dir\sortie.txt`" 2> `"$dir\erreurs.txt`""
$run = Start-Process -FilePath cmd.exe -ArgumentList '/d', '/c', "`"$line`"" -WorkingDirectory $wt -NoNewWindow -Wait -PassThru
Get-Content "$dir\sortie.txt" -Encoding UTF8
Get-Content "$dir\erreurs.txt" -Encoding UTF8 | Where-Object { $_ -match 'Diagnostic interrompu|Error' }
exit $run.ExitCode
