# Démonstration sans opérateur de l'enregistrement d'une partie pour la roue (demande du 29/10/2026),
# hors écran sur un bureau Windows caché : le vrai menu, sur un bac à sable de tables aux médias
# générés (docs\demo-moments.cjs), lance une partie simulée de Neon Galaxy par « Jouer et
# enregistrer » (fiche de la table). VPX n'est jamais lancé et aucun écran n'est capturé :
# l'enregistreur dessine une fausse table dans le sens où VPX la dessinerait (bandeau rouge en
# haut, flippers verts en bas), tout le reste du chemin est le vrai.
#   duree   : début 5 s après l'apparition de la table (témoin « Enregistrement dans… »), fin à la
#             durée (15 s, témoin « REC », puis « Enregistré ») ; au retour, l'écran de
#             l'enregistrement montre le plateau et le fronton ; « Utiliser pour la roue », le plan,
#             « Confirmer » : la roue lit la nouvelle vidéo du plateau, l'ancienne est à la corbeille ;
#   sortie  : la table quittée au bout de 12 s, avant la fin des 30 s : fin par la sortie (la toute
#             fin est jetée), vidéo muette ; « Garder de côté » : la roue ne change pas, le fichier
#             attend dans <données>\enregistrements ;
#   pivotee : plateau couché flippers à gauche, fronton et DMD sur le même écran : les trois
#             filmés, le plateau rendu droit (portrait, flippers en bas), le DMD dans sa bande 4:1.
# Chaque vidéo est relue comme la roue la lit (docs\demo-enregistrement-partie.cjs) : taille, sens
# (rouge en haut, vert en bas), son. Le journal doit montrer l'événement de début et celui de fin.
# Captures (menu, autres écrans, témoin à chaque état, images des vidéos) et relevés dans
# tmp\captures\enregistrement\<scénario> ; le garde-fou de mise en page doit rester muet.
#   .\docs\demo-enregistrement-partie.ps1 [-Scenarios duree, sortie, pivotee]
# Ni le vrai modèle de borne ni le vrai VPinballX.ini ne sont touchés.
param(
  [string[]]$Scenarios = @('duree', 'sortie', 'pivotee'),
  [string]$Source = 'D:\CyberPinball',
  [string]$Ecrans = 'pc-dev'
)
$ErrorActionPreference = 'Stop'
$wt = Split-Path $PSScriptRoot -Parent
. "$PSScriptRoot\hors-ecran.ps1"
# Tout le reste tourne sur un bureau Windows caché : rien ne peut apparaître sur les écrans du poste.
if (Enter-BureauCache $PSCommandPath $PSBoundParameters) { exit $LASTEXITCODE }
Use-HorsEcran $Ecrans
$base = "$wt\tmp\demo-enregistrement"
$realHash = (Get-FileHash "$Source\config\VPinballX.ini").Hash
$realModel = (Get-FileHash "$Source\data\cabinet.json").Hash
$electron = node -p "require('electron')"

Push-Location $wt
try { npm run build | Out-Null } finally { Pop-Location }

$Start = 'Digit1'; $Down = 'ArrowDown'
$table = 'Neon Galaxy (Williams 1992)'
$jouer = @($Down, $Down, $Down, 'wait:1000', $Start, 'action:Jouer et enregistrer', 'action:Lancer et enregistrer', 'until:playing')
$scenes = [ordered]@{
  duree = @{
    Reglage = @{ roles = @('playfield', 'backglass'); delay = 5; duration = 15; sound = $true }
    Etapes = $jouer + @('wait:2000', 'wait:6000', 'until:library', 'action:Utiliser pour la roue', 'action:Confirmer', 'wait:2000')
    Fin = 'duration'
    Utilise = @('Playfield', 'Backglass')
    Son = $true
    Temoins = @('waiting', 'recording', 'done')
  }
  sortie = @{
    Reglage = @{ roles = @('playfield'); delay = 0; duration = 30; sound = $false }
    PartieMs = 12000
    Etapes = $jouer + @('wait:4000', 'until:library', 'action:Garder de côté', 'wait:1500')
    Fin = 'game-end'
    Utilise = @()
    Son = $false
    Temoins = @('recording', 'done')
  }
  pivotee = @{
    Reglage = @{ roles = @('playfield', 'backglass', 'dmd'); delay = 0; duration = 15; sound = $true }
    Flippers = 'left'
    Fronton = $true
    Etapes = $jouer + @('wait:4000', 'until:library', 'action:Utiliser pour la roue', 'action:Confirmer', 'wait:2000')
    Fin = 'duration'
    Utilise = @('Playfield', 'Backglass', 'DMD')
    Son = $true
    Temoins = @('recording', 'done')
  }
}

# Nettoyage : d'abord les jonctions d'une racine d'avant le 29/10/2026 (sans /s, pour ne jamais y descendre).
if (Test-Path $base) {
  Get-ChildItem -Directory -Recurse -Depth 3 $base -Attributes ReparsePoint | ForEach-Object { cmd /c rmdir "$($_.FullName)" }
  # Par Node : la table au titre très long dépasse les 260 caractères que Remove-Item sait atteindre.
  node -e "require('fs').rmSync(process.argv[1], { recursive: true, force: true })" $base
}

$failures = @()
foreach ($name in $Scenarios) {
  $scene = $scenes[$name]
  if (-not $scene) { throw "Scénario inconnu : $name ($($scenes.Keys -join ', '))." }
  $dir = "$base\$name"
  $root = "$dir\root"
  $captures = "$wt\tmp\captures\enregistrement\$name"
  if (Test-Path $captures) { Remove-Item -Recurse -Force $captures }
  $home_ = "$dir\home"
  New-Item -ItemType Directory -Force "$home_\sandbox", $captures | Out-Null
  "`n=== $name"
  Push-Location $wt
  try { & $electron docs\demo-moments.cjs $root 2>&1 | Out-Null } finally { Pop-Location }
  if ($LASTEXITCODE -ne 0) { throw 'Génération des médias en échec.' }
  # VPX « installé » (fausse installation, New-FauxVpx) : la partie est simulée.
  New-FauxVpx $root
  Copy-Item "$Source\config\VPinballX.ini" "$home_\sandbox\VPinballX.ini"
  $model = Get-ModeleBorne "$Source\data\cabinet.json"
  $model.vpx.iniPath = "$home_\sandbox\VPinballX.ini"
  if ($scene.Fronton) {
    # DMD en bande 4:1 sous le fronton, sur le même écran (comme demo-moments.ps1 -Scenarios pivotee).
    $screen = $model.screens | Where-Object fingerprint -eq $model.roles.backglass
    $model.roles.dmd = $model.roles.backglass
    $zones = node -e "const z = require('./packages/core/dist/zones.js'); console.log(JSON.stringify(z.splitBackglassDmd({ width: $($screen.widthPx), height: $($screen.heightPx) })))" | ConvertFrom-Json
    $model | Add-Member -NotePropertyName zones -NotePropertyValue $zones -Force
  }
  $model | ConvertTo-Json -Depth 20 | Set-Content -Path "$home_\cabinet.json" -Encoding UTF8
  @{ music = $false; game = 'still' } | ConvertTo-Json | Set-Content -Path "$home_\medias.json" -Encoding UTF8
  $scene.Reglage | ConvertTo-Json | Set-Content -Path "$home_\enregistrement.json" -Encoding UTF8
  $medias = "$root\tables\$table\medias"
  $before = @(Get-ChildItem $medias -File | Where-Object Name -match '^\((Playfield|Backglass|DMD)\)' | ForEach-Object Name)

  $env:CYBERPINBALL_ROOT = $root
  $env:CYBERPINBALL_HOME = $home_
  $env:CYBERPINBALL_AUTOPILOT = $scene.Etapes -join ','
  $env:CYBERPINBALL_CAPTURE = $captures
  # La fausse partie occupe l'écran du fronton (comme un .directb2s) ; une valeur vide effacerait la variable.
  $env:CYBERPINBALL_PARTIE_SIMULEE = 'backglass'
  if ($scene.PartieMs) { $env:CYBERPINBALL_PARTIE_MS = "$($scene.PartieMs)" } else { Remove-Item Env:CYBERPINBALL_PARTIE_MS -ErrorAction SilentlyContinue }
  if ($scene.Flippers) { $env:CYBERPINBALL_FLIPPERS = $scene.Flippers } else { Remove-Item Env:CYBERPINBALL_FLIPPERS -ErrorAction SilentlyContinue }
  $line = "`"$electron`" app --user-data-dir=`"$dir\chromium`" > `"$captures\sortie.txt`" 2> `"$captures\erreurs.txt`""
  Start-Process -FilePath cmd.exe -ArgumentList '/d', '/c', "`"$line`"" -WorkingDirectory $wt -NoNewWindow -Wait
  Assert-HorsEcran $captures
  $out = Get-Content "$captures\sortie.txt" -Encoding UTF8
  $out | Where-Object { $_ -match '^(Enregistrement|Témoin|Autopilote)' } | ForEach-Object { "  $_" }

  # Les deux événements, dans l'ordre, et la fin attendue.
  $start = @($out | Select-String -SimpleMatch 'événement de début').Count
  $end = @($out | Select-String -Pattern "événement de fin \($($scene.Fin)\)").Count
  if ($start -ne 1) { $failures += "$name : $start événement(s) de début au lieu d'un" }
  if ($end -ne 1) { $failures += "$name : pas d'événement de fin ($($scene.Fin))" }
  foreach ($line_ in $out | Select-String -Pattern '^Autopilote : ') { $failures += "$name : $($line_.Line)" }
  foreach ($state in $scene.Temoins) {
    if (-not (Test-Path "$captures\temoin-$state.png")) { $failures += "$name : témoin « $state » jamais affiché" }
  }
  foreach ($line_ in $out | Select-String -Pattern '^Témoin \(.*\) : (?!mise en page conforme)') { $failures += "$name : $($line_.Line)" }
  $layout = Get-Content "$captures\mise-en-page.txt" -Raw -Encoding UTF8
  if ($layout -notmatch '^Aucun problème') { $failures += "$name : mise en page`n$layout" }

  # Où sont les vidéos : dans medias\ (utilisées pour la roue) ou de côté.
  $kept = @(Get-ChildItem "$home_\enregistrements\$table" -File -ErrorAction SilentlyContinue)
  $now = @(Get-ChildItem $medias -File | Where-Object Name -match '^\((Playfield|Backglass|DMD)\)')
  $videos = @()
  foreach ($type in $scene.Utilise) {
    $file = $now | Where-Object Name -eq "($type) $table.mp4"
    if (-not $file) { $failures += "$name : ($type) $table.mp4 absent de medias\"; continue }
    $videos += $file.FullName
    $old = $before | Where-Object { $_ -match "^\($type\)" -and $_ -ne $file.Name }
    foreach ($o in $old) { if (Test-Path "$medias\$o") { $failures += "$name : l'ancien $o est resté dans medias\" } }
  }
  if ($scene.Utilise.Count) {
    if ($kept.Count) { $failures += "$name : $($kept.Count) fichier(s) restés de côté après « Utiliser pour la roue »" }
  } else {
    if ($kept.Count -ne 1) { $failures += "$name : $($kept.Count) enregistrement(s) de côté au lieu d'un" }
    $videos += $kept.FullName
    $after = @($now | ForEach-Object Name)
    if (($after -join '|') -ne ($before -join '|')) { $failures += "$name : medias\ a changé alors que l'enregistrement est gardé de côté" }
  }

  # La roue lit la nouvelle vidéo du plateau (dernière étape : retour aux tables).
  if ($scene.Utilise -contains 'Playfield') {
    $last = (Get-Content "$captures\son.txt" -Encoding UTF8 | Select-Object -Last 1) -replace '^\S+ : ', '' | ConvertFrom-Json
    $layer = @($last.ecrans.playfield.couches) | Where-Object role -eq 'playfield' | Select-Object -First 1
    "  roue : $($last.ecrans.playfield.phase), plateau $($layer.element) $($layer.lecture) $($layer.fichier)"
    if ($last.ecrans.playfield.phase -ne 'menu' -or $layer.fichier -ne "(Playfield) $table.mp4" -or $layer.element -ne 'vidéo') { $failures += "$name : la roue ne montre pas la nouvelle vidéo du plateau ($($layer.element) $($layer.fichier))" }
  }

  # Chaque vidéo relue comme la roue la lit : taille, sens, son.
  @{ files = $videos; out = "$captures\videos.json"; captures = $captures } | ConvertTo-Json | Set-Content -Path "$dir\videos.json" -Encoding UTF8
  Push-Location $wt
  try { & $electron docs\demo-enregistrement-partie.cjs "$dir\videos.json" 2>&1 | Out-Null } finally { Pop-Location }
  if (-not $videos.Count) { $failures += "$name : aucune vidéo produite" }
  # Affecté d'abord : PowerShell 5.1 rend un tableau JSON d'un seul bloc, que foreach n'énumère qu'ainsi.
  $checked = Get-Content "$captures\videos.json" -Raw -Encoding UTF8 | ConvertFrom-Json
  foreach ($v in $checked) {
    if (-not $v.file) { continue }
    $label = Split-Path $v.file -Leaf
    if ($v.erreur) { $failures += "$name : $label $($v.erreur)"; continue }
    "  $label : $($v.width) × $($v.height), $([math]::Round($v.bytes / 1KB)) Ko, haut $($v.haut -join '/'), bas $($v.bas -join '/'), son $(if ($v.son) { $v.son } else { 'aucun' })"
    if ($label -match '^\(Playfield\)') {
      if ($v.height -le $v.width) { $failures += "$name : $label n'est pas en portrait" }
      $redTop = $v.haut[0] -gt $v.haut[1] + 60
      $greenBottom = $v.bas[1] -gt $v.bas[0] + 60
      if (-not ($redTop -and $greenBottom)) { $failures += "$name : $label n'est pas droit (haut $($v.haut -join '/'), bas $($v.bas -join '/'))" }
      if ([bool]$v.son -ne $scene.Son) { $failures += "$name : $label son $($v.son), attendu $(if ($scene.Son) { 'présent' } else { 'aucun' })" }
    }
    if ($label -match '^\(DMD\)' -and [math]::Abs($v.width / $v.height - 4) -gt 0.2) { $failures += "$name : $label n'est pas en 4:1 ($($v.width) × $($v.height))" }
  }
  Get-ChildItem $captures -Recurse -Filter *.png | Measure-Object | ForEach-Object { "  $($_.Count) captures dans $captures" }
}

if ((Get-FileHash "$Source\config\VPinballX.ini").Hash -ne $realHash) { throw 'Le vrai VPinballX.ini a changé !' }
if ((Get-FileHash "$Source\data\cabinet.json").Hash -ne $realModel) { throw 'Le vrai modèle de borne a changé !' }
if ($failures.Count) { throw "Enregistrement d'une partie : $($failures.Count) échec(s)`n$($failures -join "`n")" }
"`nEnregistrement d'une partie : démarré, arrêté (à la durée et par la sortie de la table), repris par la roue. Vrai VPinballX.ini et vrai modèle de borne inchangés."
