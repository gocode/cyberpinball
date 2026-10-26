# Démonstration sans opérateur : l'écran du DMD, FullDMD ou DMD seul. Bac à sable dans
# tmp\demo-fulldmd (copie du modèle de borne et du VPinballX.ini réels, une table avec ses
# médias FullDMD, fronton, plateau et logo copiés de <Source>\tables si elle y est), puis :
#   1. ambigu : la configuration du « Poste à 3 écrans 2 » (octobre 2026) : DMD seul sur un
#      écran 16:9, dans une bande 4,78:1, sans type dit. Bandeau « Écran du DMD à vérifier »,
#      noir autour de la bande, puis menu système > Configuration de la borne (pastille sur
#      « Écran du DMD ») > Écran du DMD ;
#   2. fulldmd : le même écran dit FullDMD : le média FullDMD sur tout l'écran, ScoreView plein écran ;
#   3. bande : le même écran dit DMD seul : la bande, du noir autour, B2S après ScoreView ;
#   4. assistant : « Écrans et rôles » refait seul : les réponses proposées au DMD (FullDMD, bande
#      4:1 au centre, sous le fronton…), sans rien enregistrer.
# Pour chacune : les clés de la fenêtre ScoreView écrites dans VPinballX.ini par la synchronisation,
# et les captures des pages (tmp\captures\fulldmd\<cas>\pages, les autres écrans dans pages\ecrans).
# VPX n'est jamais lancé ; ni le vrai modèle ni le vrai VPinballX.ini ne sont touchés.
#   .\docs\demo-fulldmd.ps1 [-Cas ambigu,fulldmd] [-Secondes 3]
# Hors écran par défaut, sur les écrans simulés de docs\ecrans\pc-dev.json (le Samsung, l'AUO,
# le Philips et le PLX2283HSU du poste de développement).
param(
  [string[]]$Cas = @('ambigu', 'fulldmd', 'bande', 'assistant'),
  [string]$Source = 'D:\CyberPinball',
  [int]$Secondes = 3
)
$ErrorActionPreference = 'Stop'
$wt = Split-Path $PSScriptRoot -Parent
. "$PSScriptRoot\hors-ecran.ps1"
# Tout le reste tourne sur un bureau Windows caché : rien ne peut apparaître sur les écrans du poste.
if (Enter-BureauCache $PSCommandPath $PSBoundParameters) { exit $LASTEXITCODE }
Use-HorsEcran 'pc-dev'
Assert-Compile
$base = "$wt\tmp\demo-fulldmd"
$realHash = (Get-FileHash "$Source\config\VPinballX.ini").Hash
$realModel = (Get-FileHash "$Source\data\cabinet.json").Hash
$electron = node -p "require('electron')"
$table = '2001 - A Space Odyssey (Original 2025)'
# Bande du « Poste à 3 écrans 2 » : 4,78:1 au milieu du PLX2283HSU.
$band = [pscustomobject]@{ x = 0.06041666666666667; y = 0.37962962962962965; width = 0.8796875; height = 0.32685185185185184 }

function Get-ScoreView($ini) {
  $current = ''
  foreach ($line in Get-Content $ini) {
    if ($line -match '^\[(.+)\]') { $current = $Matches[1]; continue }
    if ($current -eq 'ScoreView' -and $line -match '^(ScoreView(Output|Display|FullScreen|WndX|WndY|Width|Height)|Priority\.\w+)\s*=\s*(.*)$') { "  [ScoreView] $($Matches[1]) = $($Matches[3])" }
    if ($current -eq 'Plugin.B2S' -and $line -match '^(ScoreViewDMD\w+)\s*=\s*(.*)$') { "  [Plugin.B2S] $($Matches[1]) = $($Matches[2])" }
  }
}

foreach ($name in $Cas) {
  $dir = "$base\$name"
  $captures = "$wt\tmp\captures\fulldmd\$name"
  foreach ($d in $dir, $captures) { if (Test-Path $d) { Remove-Item -Recurse -Force $d } }
  $root = "$dir\root"; $home_ = "$dir\home"
  $folder = "$root\tables\$table"
  New-Item -ItemType Directory -Force "$folder\medias", "$home_\sandbox", $captures | Out-Null
  Set-Content -Path "$folder\$table.vpx" -Value '' -Encoding ASCII
  # Médias de la vraie table, s'il y en a (lecture seule) ; sinon la table montre ses replis.
  $real = "$Source\tables\$table\medias"
  if (Test-Path $real) { Get-ChildItem $real -File | Where-Object { $_.Name -match '^\((FullDMD|DMD|Backglass|Playfield|Wheel)\)' } | Copy-Item -Destination "$folder\medias" }
  Copy-Item "$Source\config\VPinballX.ini" "$home_\sandbox\VPinballX.ini"
  Set-Content -Path "$dir\sans-son.json" -Value '[]' -Encoding ASCII

  $model = Get-ModeleBorne "$Source\data\cabinet.json"
  $model.vpx.iniPath = "$home_\sandbox\VPinballX.ini"
  # Écrans simulés : ceux du modèle ; playfield sur l'AUO, fronton sur le Samsung, DMD sur le PLX.
  $probe = node -e "const c = require('./packages/core/dist/index.js'); const raw = JSON.parse(require('fs').readFileSync(process.env.CYBERPINBALL_DISPLAYS, 'utf8').trim()); const ds = Array.isArray(raw) ? raw : raw.displays; const fp = (n) => c.fingerprintOf(ds.find((d) => (d.friendlyName || '') === n)).key; console.log(JSON.stringify({ screens: ds.map((x) => c.toPhysicalScreen(x)), playfield: fp(''), backglass: fp('S22E450'), dmd: fp('PLX2283HSU') }))" | ConvertFrom-Json
  $model.screens = @($probe.screens)
  $model.roles = [pscustomobject]@{ playfield = $probe.playfield; backglass = $probe.backglass; dmd = $probe.dmd }
  foreach ($p in 'zones', 'dmdKind') { if ($model.PSObject.Properties[$p]) { $model.PSObject.Properties.Remove($p) } }
  $arguments = @()
  $wait = "wait:$($Secondes * 1000)"
  $autopilot = $wait
  if ($name -eq 'ambigu') {
    $model | Add-Member -NotePropertyName zones -NotePropertyValue ([pscustomobject]@{ dmd = $band }) -Force
    $autopilot = (@($wait, 'click:.gear', 'click:.lib-action[data-label="Borne"]', 'click:.lib-action[data-label="Configuration de la borne"]', 'click:.lib-action[data-label="Écran du DMD"]', 'wait:800') -join ',')
  } elseif ($name -eq 'fulldmd') {
    $model | Add-Member -NotePropertyName dmdKind -NotePropertyValue 'fulldmd' -Force
  } elseif ($name -eq 'bande') {
    $model | Add-Member -NotePropertyName zones -NotePropertyValue ([pscustomobject]@{ dmd = $band }) -Force
    $model | Add-Member -NotePropertyName dmdKind -NotePropertyValue 'dmd' -Force
  } else {
    # Étape « Écrans et rôles » seule, sur la configuration ambiguë : playfield et fronton gardés
    # (Start), puis chaque réponse proposée au DMD (suivant) ; Exit maintenu n'est pas rejoué : rien
    # n'est enregistré, l'essai s'arrête à la dernière capture.
    $model | Add-Member -NotePropertyName zones -NotePropertyValue ([pscustomobject]@{ dmd = $band }) -Force
    $b = $model.buttons
    $next = if ($b.rightFlipper) { $b.rightFlipper } else { 'ShiftRight' }
    $start = if ($b.start) { $b.start } else { 'Digit1' }
    $arguments = @('--assistant', '--ecrans')
    $autopilot = (@($start, $start, $next, $next, $next, $next, $next) -join ',')
  }
  $model | ConvertTo-Json -Depth 20 | Set-Content -Path "$home_\cabinet.json" -Encoding UTF8

  $env:CYBERPINBALL_ROOT = $root
  $env:CYBERPINBALL_HOME = $home_
  $env:CYBERPINBALL_AUDIO_OUTPUTS = "$dir\sans-son.json"
  $env:CYBERPINBALL_AUTOPILOT = $autopilot
  $env:CYBERPINBALL_CAPTURE = "$captures\pages"
  # cmd attend Electron et garde sa sortie (voir demo-barre-taches.ps1).
  $line = "`"$electron`" app $($arguments -join ' ') --user-data-dir=`"$dir\chromium`" > `"$captures\sortie.txt`" 2> `"$captures\erreurs.txt`""
  Start-Process -FilePath cmd.exe -ArgumentList '/d', '/c', "`"$line`"" -WorkingDirectory $wt -NoNewWindow -Wait
  Assert-HorsEcran "$captures\pages"

  "`n=== $name"
  Get-ScoreView "$home_\sandbox\VPinballX.ini"
  Get-ChildItem "$captures\pages" -Recurse -Filter *.png | ForEach-Object { "  capture : $($_.FullName.Substring($captures.Length + 1))" }
  Select-String -Path "$captures\sortie.txt", "$captures\erreurs.txt" -Pattern 'ne couvre pas son écran|Error|DMD' | ForEach-Object { "  sortie : $($_.Line)" }
}

if ((Get-FileHash "$Source\config\VPinballX.ini").Hash -ne $realHash) { throw 'Le vrai VPinballX.ini a changé !' }
if ((Get-FileHash "$Source\data\cabinet.json").Hash -ne $realModel) { throw 'Le vrai modèle de borne a changé !' }
"`nVrai VPinballX.ini et vrai modèle de borne inchangés."
