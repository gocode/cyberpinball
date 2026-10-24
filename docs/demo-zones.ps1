# Démonstration sans opérateur : plusieurs rôles sur un écran (zones). Bac à sable dans
# tmp\demo-zones (copie du modèle de borne et du VPinballX.ini réels, une table factice),
# puis le menu, quelques secondes, dans chaque disposition :
#   1. fronton : le DMD sur l'écran du backglass, bande 4:1 en bas (splitBackglassDmd) ;
#   2. incruste : le DMD incrusté en haut de l'image du playfield ;
#   3. assistant : l'assistant complet sur la borne copiée, qui parcourt les dispositions
#      proposées au DMD (écrans libres, bas de l'écran du backglass en 4:1 et en 16:9,
#      incrustation), retient la bande 4:1 sous le backglass et enregistre ;
#   4. editeur : la disposition seule (--assistant --disposition, comme depuis le menu) sur
#      le fronton partagé : DMD choisi, format 4:1 verrouillé, placé sous le backglass, coin
#      tiré à la souris (le format suit), tiré jusque sur l'écran du playfield (il y devient
#      incrusté), 960 px de large et position 100, 50 au clavier, aimantation coupée, enregistré ;
#   5. bureau : un seul écran, comme un poste de bureau : playfield en 9:16 à gauche (fenêtre),
#      backglass à droite (fenêtre à côté), DMD incrusté en haut du playfield.
# Pour chacune : les clés écrites dans VPinballX.ini par la synchronisation, et les captures
# des pages (tmp\captures\zones\<disposition>\pages, les autres écrans dans pages\ecrans).
# VPX n'est jamais lancé ; ni le vrai modèle ni le vrai VPinballX.ini ne sont touchés.
#   .\docs\demo-zones.ps1 [-Dispositions fronton] [-Secondes 3]
# Hors écran par défaut, sur les écrans simulés de docs\ecrans\<Ecrans>.json (-Ecrans) ;
# $env:CYBERPINBALL_A_L_ECRAN = '1' pour les vrais écrans du poste (docs\hors-ecran.ps1).
param(
  # « assistant » suppose les quatre écrans du PC de développement (nombre de dispositions proposées).
  [string[]]$Dispositions = @('fronton', 'incruste', 'editeur', 'bureau'),
  [string]$Source = 'D:\CyberPinball',
  [int]$Secondes = 3,
  [string]$Ecrans = 'pc-dev'
)
$ErrorActionPreference = 'Stop'
$wt = Split-Path $PSScriptRoot -Parent
. "$PSScriptRoot\hors-ecran.ps1"
# Tout le reste tourne sur un bureau Windows caché : rien ne peut apparaître sur les écrans du poste.
if (Enter-BureauCache $PSCommandPath $PSBoundParameters) { exit $LASTEXITCODE }
Use-HorsEcran $Ecrans
$base = "$wt\tmp\demo-zones"
$realHash = (Get-FileHash "$Source\config\VPinballX.ini").Hash
$realModel = (Get-FileHash "$Source\data\cabinet.json").Hash
$electron = node -p "require('electron')"

function Get-Keys($ini, $sections) {
  $current = ''
  foreach ($line in Get-Content $ini) {
    if ($line -match '^\[(.+)\]') { $current = $Matches[1]; continue }
    if ($sections -contains $current -and $line -match '^(\w+(Output|Display|FullScreen|WndX|WndY|Width|Height))\s*=\s*(.*)$') { "  [$current] $($Matches[1]) = $($Matches[3])" }
  }
}

foreach ($name in $Dispositions) {
  $dir = "$base\$name"
  $captures = "$wt\tmp\captures\zones\$name"
  foreach ($d in $dir, $captures) { if (Test-Path $d) { Remove-Item -Recurse -Force $d } }
  $root = "$dir\root"; $home_ = "$dir\home"
  New-Item -ItemType Directory -Force "$root\tables\Demo (Cyber Pinball 2026)", "$home_\sandbox", $captures | Out-Null
  Set-Content -Path "$root\tables\Demo (Cyber Pinball 2026)\Demo (Cyber Pinball 2026).vpx" -Value '' -Encoding ASCII
  Copy-Item "$Source\config\VPinballX.ini" "$home_\sandbox\VPinballX.ini"
  Set-Content -Path "$dir\sans-son.json" -Value '[]' -Encoding ASCII

  # Configuration active de la borne réelle (cabinet.json range plusieurs configurations), copiée seule.
  $model = Get-ModeleBorne "$Source\data\cabinet.json"
  $model.vpx.iniPath = "$home_\sandbox\VPinballX.ini"
  # Les écrans de la démonstration (simulés hors écran, sinon ceux branchés), pas ceux du modèle
  # copié : le backglass va sur le premier écran autre que celui du playfield (qui doit y être).
  $probe = node -e "const w = require('./packages/win-displays/dist/index.js'), c = require('./packages/core/dist/index.js'); const raw = process.env.CYBERPINBALL_DISPLAYS ? JSON.parse(require('fs').readFileSync(process.env.CYBERPINBALL_DISPLAYS, 'utf8').trim()) : w.probeDisplays(); const ds = Array.isArray(raw) ? raw : raw.displays; const i = ds.findIndex((d) => c.fingerprintOf(d).key !== '$($model.roles.playfield)'); const d = ds[i]; const pf = ds.find((x) => c.fingerprintOf(x).key === '$($model.roles.playfield)'); console.log(JSON.stringify({ ecran: i + 1, fp: c.fingerprintOf(d).key, width: d.bounds.width, height: d.bounds.height, screen: c.toPhysicalScreen(d), screens: ds.map((x) => c.toPhysicalScreen(x)), versPlayfield: pf ? Math.round(pf.bounds.x + pf.bounds.width / 2 - (d.bounds.x + d.bounds.width / 2)) : 0 }))" | ConvertFrom-Json
  $model.roles | Add-Member -Force -NotePropertyName backglass -NotePropertyValue $probe.fp
  # Les écrans du modèle sont ceux de la démonstration : sinon le menu, qui reconnaît la
  # configuration à ses écrans, demanderait laquelle prendre. Un rôle sur un écran absent est retiré.
  $model.screens = @($probe.screens)
  foreach ($r in @($model.roles.PSObject.Properties.Name)) {
    if (-not ($model.screens | Where-Object fingerprint -eq $model.roles.$r)) { $model.roles.PSObject.Properties.Remove($r) }
  }
  $arguments = @()
  $autopilot = "wait:$($Secondes * 1000)"
  if ($name -eq 'assistant') {
    # Touches de la borne copiée : flipper droit = suivant, gauche = précédent.
    $b = $model.buttons
    $next = $b.rightFlipper; $prev = $b.leftFlipper; $start = $b.start; $exit = $b.exit
    $arguments = @('--assistant')
    # Boutons gardés ; playfield, bord des flippers, diagonale, backglass : les écrans enregistrés.
    # DMD : quatre fois « suivant » pour voir chaque disposition, retour à la bande 4:1, Start.
    # Pas de topper (Exit), puis Start au récapitulatif : enregistrer.
    $autopilot = (@('SansBoutons', $start, $start, $start, $start, $next, $next, $next, $next, $prev, $prev, $start, $exit, $start) -join ',')
    $zones = $null
  } elseif ($name -eq 'editeur') {
    $b = $model.buttons
    $next = $b.rightFlipper; $prev = $b.leftFlipper; $start = $b.start
    $model.roles | Add-Member -Force -NotePropertyName dmd -NotePropertyValue $model.roles.backglass
    $zones = node -e "const z = require('./packages/core/dist/zones.js'); console.log(JSON.stringify(z.splitBackglassDmd({ width: $($probe.width), height: $($probe.height) })))" | ConvertFrom-Json
    $ecran = $probe.ecran
    $arguments = @('--assistant', '--disposition')
    # Lignes : 0 Zone (départ, en disposition seule), 1 Écran, 2 Format, 8 Taille précise,
    # 9 Position précise, 10 Placer, 12 Aimantation, 14 Enregistrer.
    # Le DMD est ensuite tiré jusque sur l'écran voisin, celui du playfield : il y devient incrusté.
    $autopilot = (@(
      $start, $next, $next, $start,                  # Zone : playfield -> backglass -> DMD
      $next, $next, $start,                          # Format conservé
      $next, $next, $next, $next, $next, $next, $start, # 4:1 (DMD)
      $next, $next, $next, $next, $next, $next, $next, $next, $start, $next, $start, # Placer : en dessous du backglass
      "drag:$($ecran):dmd:se:-120:-40", 'Attendre1', # coin tiré à la souris (aimanté)
      "drag:$($ecran):dmd:move:$($probe.versPlayfield):0", 'Attendre1', # jusque sur l'écran du playfield
      $prev, $prev, $start, 'Digit9', 'Digit6', 'Digit0', 'Enter', # Taille précise : 960 de large
      $next, $start, 'Digit1', 'Digit0', 'Digit0', 'Enter', 'Digit5', 'Digit0', 'Enter', # Position précise : 100, 50
      $next, $next, $next, $start,                   # Aimantation : non
      $next, $next, $start                           # Enregistrer
    ) -join ',')
  } elseif ($name -eq 'bureau') {
    $model.roles | Add-Member -Force -NotePropertyName backglass -NotePropertyValue $model.roles.playfield
    $model.roles | Add-Member -Force -NotePropertyName dmd -NotePropertyValue $model.roles.playfield
    # Bord des flippers connu : la vue (borne, d'après la fenêtre en hauteur) et la taille en cm sont écrites.
    $model | Add-Member -NotePropertyName playfield -NotePropertyValue ([pscustomobject]@{ flipperEdge = 'bottom' }) -Force
    $zones = [pscustomobject]@{
      playfield = [pscustomobject]@{ x = 0; y = 0; width = 0.3164; height = 1; aspect = 9 / 16 }
      backglass = [pscustomobject]@{ x = 0.36; y = 0.12; width = 0.6; height = 0.6 }
      dmd = [pscustomobject]@{ x = 0.04; y = 0.02; width = 0.24; height = 0.1067; aspect = 4 }
    }
  } elseif ($name -eq 'fronton') {
    $model.roles | Add-Member -Force -NotePropertyName dmd -NotePropertyValue $model.roles.backglass
    $zones = node -e "const z = require('./packages/core/dist/zones.js'); console.log(JSON.stringify(z.splitBackglassDmd({ width: $($probe.width), height: $($probe.height) })))" | ConvertFrom-Json
  } else {
    $model.roles | Add-Member -Force -NotePropertyName dmd -NotePropertyValue $model.roles.playfield
    $zones = [pscustomobject]@{ dmd = [pscustomobject]@{ x = 0.3; y = 0.02; width = 0.4; height = 0.1 } }
  }
  if ($zones) { $model | Add-Member -NotePropertyName zones -NotePropertyValue $zones -Force }
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

  # cabinet.json range les configurations de la borne : les zones sont dans celle qui sert.
  if ($name -in 'assistant', 'editeur') { $zones = node -e "console.log(JSON.stringify(require('./packages/core/dist/index.js').loadCabinet(process.argv[1]).zones ?? null))" "$home_" | ConvertFrom-Json }
  "`n=== $name : zones $($zones | ConvertTo-Json -Compress)"
  Get-Keys "$home_\sandbox\VPinballX.ini" @('Player', 'Backglass', 'ScoreView')
  Get-ChildItem "$captures\pages" -Recurse -Filter *.png | ForEach-Object { "  capture : $($_.FullName.Substring($captures.Length + 1))" }
  Select-String -Path "$captures\sortie.txt", "$captures\erreurs.txt" -Pattern 'ne couvre pas son écran|Error' | ForEach-Object { "  ATTENTION : $($_.Line)" }
}

if ((Get-FileHash "$Source\config\VPinballX.ini").Hash -ne $realHash) { throw 'Le vrai VPinballX.ini a changé !' }
if ((Get-FileHash "$Source\data\cabinet.json").Hash -ne $realModel) { throw 'Le vrai modèle de borne a changé !' }
"`nVrai VPinballX.ini et vrai modèle de borne inchangés."
