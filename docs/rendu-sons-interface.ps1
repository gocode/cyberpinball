# Sons de l'interface (app/renderer/ui-sounds.js) rendus en WAV, pour les écouter sans lancer
# le menu : tmp\sons-interface\solenoid.wav, coin.wav, knocker.wav (mono, 48 kHz, à pleine
# échelle du réglage : volume 100 %). Relève la crête, le niveau efficace et la durée audible
# de chacun ; échoue si un son écrête. Hors écran, sur un bureau Windows caché : rien ne
# s'affiche ni ne s'entend (OfflineAudioContext, docs\rendu-sons-interface.cjs).
#   .\docs\rendu-sons-interface.ps1
$ErrorActionPreference = 'Stop'
$wt = Split-Path $PSScriptRoot -Parent
. "$PSScriptRoot\hors-ecran.ps1"
if (Enter-BureauCache $PSCommandPath $PSBoundParameters) { exit $LASTEXITCODE }
Use-HorsEcran
$electron = node -p "require('electron')"

Push-Location $wt
try {
  npm run build | Out-Null
  & $electron docs\rendu-sons-interface.cjs "$wt\tmp\sons-interface" 2>&1 | ForEach-Object { "   $_" }
} finally { Pop-Location }
if ($LASTEXITCODE -ne 0) { throw 'Rendu des sons de l''interface en échec.' }
