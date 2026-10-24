# Démonstration sans opérateur des moments du menu (docs/recherche/medias.md, § 5.2) : le
# vrai menu, hors écran, sur un bac à sable de tables aux médias générés (docs\demo-moments.cjs).
#   navigation : musique de chaque jeu, volume relatif d'un jeu, son de la vidéo du plateau
#                quand le jeu n'a pas de musique, écran « Médias, son et attente » et ses listes ;
#   silence    : réglages par défaut (musique coupée, vidéos muettes) : rien ne joue ;
#   partie     : partie simulée (CYBERPINBALL_PARTIE_SIMULEE, VPX jamais lancé) de trois tables :
#                vidéo de chargement et son de lancement, écran de chargement de secours au
#                titre très long, vidéo de chargement en portrait avec son ; pendant la partie,
#                fronton « occupé par VPX » figé, topper animé (réglage « animés »), silence ;
#                au retour, la musique reprend ;
#   pivotee    : la même partie, playfield tourné (flippers à gauche) et DMD en bande sous le
#                fronton (zones) : chargement et fond de partie dans la bonne orientation, puis
#                le mode attente tourné ;
#   attente    : mode attente après 5 s sans bouton, une table au hasard toutes les 3 s avec
#                ses médias et sa musique au volume réduit ; un flipper, Start puis Exit en
#                sortent sans changer la sélection, sans ouvrir la fiche ni le menu système.
# Ce que montre chaque écran (couches de médias : vidéo en lecture, image figée, repli) est
# relevé avec le son et comparé aux attentes.
# Les fenêtres hors écran sont muettes : on ne voit et n'entend rien sur le poste. Ce qui
# aurait joué est relevé après chaque étape dans son.txt (fichier, volume, lecture, sortie).
# Captures, son.txt et mise-en-page.txt (garde-fou layout-check : doit être vide) dans
# tmp\captures\moments\<scénario>. Le script échoue sur un problème de mise en page ou
# si le son relevé n'est pas celui attendu.
#   .\docs\demo-moments.ps1 [-Scenarios navigation, silence, partie] [-Ecrans pc-dev]
# VPX n'est jamais lancé ; ni le vrai modèle de borne ni le vrai VPinballX.ini ne sont touchés.
param(
  [string[]]$Scenarios = @('navigation', 'silence', 'liste', 'bandeau', 'minimal', 'arche', 'partie', 'pivotee', 'attente'),
  [string]$Source = 'D:\CyberPinball',
  [string]$Ecrans = 'pc-dev'
)
$ErrorActionPreference = 'Stop'
$wt = Split-Path $PSScriptRoot -Parent
. "$PSScriptRoot\hors-ecran.ps1"
# Tout le reste tourne sur un bureau Windows caché : rien ne peut apparaître sur les écrans du poste.
if (Enter-BureauCache $PSCommandPath $PSBoundParameters) { exit $LASTEXITCODE }
Use-HorsEcran $Ecrans
$base = "$wt\tmp\demo-moments"
$realHash = (Get-FileHash "$Source\config\VPinballX.ini").Hash
$realModel = (Get-FileHash "$Source\data\cabinet.json").Hash
$electron = node -p "require('electron')"

Push-Location $wt
try { npm run build | Out-Null } finally { Pop-Location }

# Nettoyage : d'abord la jonction des émulateurs (sans /s, pour ne jamais y descendre).
if (Test-Path $base) {
  Get-ChildItem -Directory -Recurse -Depth 2 $base -Attributes ReparsePoint | ForEach-Object { cmd /c rmdir "$($_.FullName)" }
  Remove-Item -Recurse -Force $base
}
$root = "$base\root"
Push-Location $wt
try { & $electron docs\demo-moments.cjs $root 2>&1 | ForEach-Object { "   $_" } } finally { Pop-Location }
if ($LASTEXITCODE -ne 0) { throw 'Génération des médias en échec.' }
New-Item -ItemType Junction -Path "$root\emulators" -Target "$Source\emulators" | Out-Null

# Sortie audio du fronton : la première sortie active du poste (lecture seule du registre),
# pour que la musique soit envoyée sur une vraie sortie (setSinkId), muette hors écran.
$probe = node "$wt\packages\win-displays\dist\cli.js" --json | ConvertFrom-Json
$output = @($probe.audio)[0]

# Touches : celles des encodeurs par défaut (flèches, Start = 1, Exit = Échap).
$Start = 'Digit1'; $Exit = 'Escape'; $Down = 'ArrowDown'; $Up = 'ArrowUp'
$scenes = @{
  navigation = @{
    Reglages = @{ music = $true; musicVolume = 60; videoVolume = 40; launchVolume = 80 }
    Etapes = @(
      'wait:1500',                # 01 Atlantis Deep : ni musique ni vidéo
      $Down, $Down, $Down, 'wait:1500', # 05 Neon Galaxy : sa musique à 60 %
      $Down, 'wait:1500',         # 07 Pharaoh's Gold : sa musique à 30 % (volume du jeu : 50 %)
      $Down, 'wait:1500',         # 09 Rocket Rally : pas de musique, le son de sa vidéo à 40 %
      $Exit, $Up, $Up, $Up, $Up,  # 14 menu système, sur « Médias, son et attente »
      $Start,                     # 15 l'écran des réglages
      # Réglages désignés par leur libellé : leur rang change quand l'écran gagne une ligne.
      # Les attentes gardent à chaque étape son numéro (captures attendues ci-dessous).
      'action:Musique des jeux', 'wait:1000',     # 17 musique coupée (le fond du menu, caché par l'écran, est en pause)
      'wait:200', 'wait:200', 'action:Son des vidéos du menu', # 20 liste « Son des vidéos du menu », sur 40 %
      $Down, $Start, 'wait:1000', # 23 50 %
      $Exit, $Exit, 'wait:1500',  # 26 retour aux tables : la vidéo de Rocket Rally s'entend à 50 %
      $Exit, $Up, $Up, $Up, $Up, $Start, # 32 de nouveau l'écran des réglages
      'action:Présentation du menu', # 33 la liste des roues et de la liste, sur Médaillons
      'action:Roue Arche', 'wait:800', # 35 Arche choisie, retour aux réglages
      $Exit, $Exit, 'wait:1500'   # 38 les tables, sur la roue Arche
    )
    Attendu = @{
      '01-wait_1500' = @{ musique = $null; video = 0.4 }
      '05-wait_1500' = @{ musique = '(Audio) Neon Galaxy (Williams 1992).wav'; volume = 0.6; video = 0 }
      '07-wait_1500' = @{ musique = "(Audio) Pharaoh's Gold (Gottlieb 1979).wav"; volume = 0.3; video = 0 }
      '09-wait_1500' = @{ musique = $null; video = 0.4 }
      '17-wait_1000' = @{ musique = $null; video = 0.4; pause = $true }
      '23-wait_1000' = @{ musique = $null; video = 0.5; pause = $true }
      '26-wait_1500' = @{ musique = $null; video = 0.5 }
    }
  }
  silence = @{
    Reglages = $null
    Etapes = @('wait:1500', $Down, $Down, $Down, 'wait:1500', $Down, $Down, 'wait:1500') # 05 Neon Galaxy, 08 Rocket Rally
    Attendu = @{
      '05-wait_1500' = @{ musique = $null; video = 0 }
      '08-wait_1500' = @{ musique = $null; video = 0 }
    }
  }
  # Présentation en liste (réglage « Présentation du menu : liste ») : sept lignes fixes, la
  # table choisie au milieu ; le garde-fou vérifie que rien ne bouge d'une table à l'autre.
  liste = @{
    Reglages = @{ menuLayout = 'list' }
    Etapes = @('wait:1500', $Down, $Down, $Down, 'wait:1500', $Up, 'wait:1500') # 05 Neon Galaxy, 07 retour
    Attendu = @{
      '05-wait_1500' = @{ musique = $null; video = 0 }
    }
  }
  # Les autres roues (Médaillons, par défaut, est celle des autres scénarios) : mêmes
  # zones fixes, logos posés à leur place une fois le glissement fini.
  bandeau = @{
    Reglages = @{ menuLayout = 'bandeau' }
    Etapes = @('wait:1500', $Down, $Down, $Down, 'wait:1500', $Up, 'wait:1500')
    Attendu = @{ '05-wait_1500' = @{ musique = $null; video = 0 } }
  }
  minimal = @{
    Reglages = @{ menuLayout = 'minimal' }
    Etapes = @('wait:1500', $Down, $Down, $Down, 'wait:1500', $Up, 'wait:1500')
    Attendu = @{ '05-wait_1500' = @{ musique = $null; video = 0 } }
  }
  arche = @{
    Reglages = @{ menuLayout = 'arche' }
    Etapes = @('wait:1500', $Down, $Down, $Down, 'wait:1500', $Up, 'wait:1500')
    Attendu = @{ '05-wait_1500' = @{ musique = $null; video = 0 } }
  }
  partie = @{
    Reglages = @{ music = $true; musicVolume = 60; videoVolume = 0; launchVolume = 80; game = 'animated' }
    # La fausse partie occupe l'écran du fronton (comme un .directb2s) ; elle s'arrête seule après 10 s.
    Simulee = 'backglass'
    Etapes = @(
      $Down, $Down, $Down, 'wait:1000', # 04 Neon Galaxy : sa musique
      $Start, $Start,             # 06 Jouer : vidéo de chargement, son de lancement, musique éteinte
      'wait:1500',                # 07 toujours le chargement
      'wait:4000',                # 08 partie : silence, fronton figé (occupé), topper animé
      'wait:11000',               # 09 retour au menu : la musique reprend
      $Up, $Start, $Start,        # 12 titre très long, sans média : écran de chargement de secours
      'wait:6000',                # 13 partie : repli « en partie » sur les écrans libres
      'wait:10000',               # 14 retour
      $Down, $Down, $Down, $Start, $Start, # 19 Rocket Rally : vidéo de chargement en portrait, avec son
      'wait:1500',                # 20 chargement
      'wait:15000'                # 21 retour
    )
    Attendu = @{
      '04-wait_1000' = @{ musique = '(Audio) Neon Galaxy (Williams 1992).wav'; volume = 0.6; video = 0 }
      '06-Digit1' = @{ musique = $null; video = 0; lancement = '(AudioLaunch) Neon Galaxy (Williams 1992).wav' }
      '07-wait_1500' = @{ musique = $null; video = 0; couches = @{ 'playfield/playfield' = 'vidéo en lecture'; 'backglass/backglass' = 'vidéo en lecture'; 'topper/topper' = 'vidéo en lecture' } }
      '08-wait_4000' = @{ musique = $null; video = 0; lancement = $null; couches = @{ 'playfield/playfield' = 'image figée'; 'backglass/backglass' = 'image figée'; 'topper/topper' = 'vidéo en lecture'; 'dmd/dmd' = 'image' } }
      '09-wait_11000' = @{ musique = '(Audio) Neon Galaxy (Williams 1992).wav'; volume = 0.6; video = 0 }
      '13-wait_6000' = @{ musique = $null; video = 0; couches = @{ 'backglass/backglass' = 'repli'; 'topper/topper' = 'image' } }
      '19-Digit1' = @{ musique = $null; video = 0.8; lancement = $null }
      '21-wait_15000' = @{ musique = $null; video = 0 }
    }
  }
  pivotee = @{
    Reglages = @{ music = $true; musicVolume = 60; videoVolume = 0; launchVolume = 80; game = 'still'; attractDelay = 6; attractInterval = 30 }
    Simulee = 'backglass'
    Flippers = 'left'
    Fronton = $true
    Etapes = @(
      $Down, $Down, $Down, 'wait:1000', # 04 Neon Galaxy, menu tourné
      $Start, $Start, 'wait:1500', # 07 chargement : vidéo tournée, bandeau des commandes
      'wait:4000',                # 08 partie : tout figé (réglage par défaut)
      'wait:11000',               # 09 retour
      $Up, $Start, $Start, 'wait:1500', # 13 chargement de secours, titre très long, tourné
      'wait:24000',               # 14 retour, puis mode attente tourné (6 s sans bouton)
      $Up                         # 15 un flipper : retour au menu, sélection inchangée
    )
    Attendu = @{
      '04-wait_1000' = @{ musique = '(Audio) Neon Galaxy (Williams 1992).wav'; volume = 0.6; video = 0 }
      '07-wait_1500' = @{ musique = $null; video = 0; couches = @{ 'playfield/playfield' = 'vidéo en lecture'; 'backglass/backglass' = 'vidéo en lecture'; 'backglass/dmd' = 'image' } }
      '08-wait_4000' = @{ musique = $null; video = 0; couches = @{ 'playfield/playfield' = 'image figée'; 'backglass/backglass' = 'image figée'; 'backglass/dmd' = 'image figée'; 'topper/topper' = 'image figée' } }
      '09-wait_11000' = @{ musique = '(Audio) Neon Galaxy (Williams 1992).wav'; volume = 0.6; video = 0 }
      '14-wait_24000' = @{ etat = @{ attente = $true; phase = 'menu'; position = 3 } }
      '15-ArrowUp' = @{ etat = @{ attente = $false; phase = 'menu'; position = 3 } }
    }
  }
  attente = @{
    Reglages = @{ music = $true; musicVolume = 60; videoVolume = 50; launchVolume = 80; attractDelay = 5; attractInterval = 3; attractSound = 'reduced' }
    Etapes = @(
      'wait:6000',                # 01 mode attente : une table au hasard
      'wait:3500',                # 02 une autre table
      $Down,                      # 03 un flipper : retour au menu, toujours la première table
      'wait:6000',                # 04 de nouveau en attente
      $Start,                     # 05 Start : retour au menu, sans ouvrir la fiche
      'wait:6000',                # 06 en attente
      $Exit,                      # 07 Exit : retour au menu, sans ouvrir le menu système
      'wait:500'                  # 08 compte reparti du dernier bouton : pas encore en attente
    )
    # Son en attente : musique ou vidéo à 30 % de leur volume (jeu au volume de 50 % : 15 %).
    MaxAttente = 0.18
    Attendu = @{
      '01-wait_6000' = @{ etat = @{ attente = $true; phase = 'menu'; position = 1 } }
      '02-wait_3500' = @{ etat = @{ attente = $true; phase = 'menu'; position = 1 } }
      '03-ArrowDown' = @{ etat = @{ attente = $false; phase = 'menu'; position = 1 } }
      '04-wait_6000' = @{ etat = @{ attente = $true; phase = 'menu'; position = 1 } }
      '05-Digit1' = @{ etat = @{ attente = $false; phase = 'menu'; position = 1 } }
      '06-wait_6000' = @{ etat = @{ attente = $true; phase = 'menu'; position = 1 } }
      '07-Escape' = @{ etat = @{ attente = $false; phase = 'menu'; position = 1 } }
      '08-wait_500' = @{ etat = @{ attente = $false; phase = 'menu'; position = 1 } }
    }
  }
}

$failures = @()
foreach ($name in $Scenarios) {
  $scene = $scenes[$name]
  if (-not $scene) { throw "Scénario inconnu : $name ($($scenes.Keys -join ', '))." }
  $dir = "$base\$name"
  $captures = "$wt\tmp\captures\moments\$name"
  foreach ($d in $dir, $captures) { if (Test-Path $d) { Remove-Item -Recurse -Force $d } }
  $home_ = "$dir\home"
  New-Item -ItemType Directory -Force "$home_\sandbox", $captures | Out-Null
  Copy-Item "$Source\config\VPinballX.ini" "$home_\sandbox\VPinballX.ini"
  $model = Get-ModeleBorne "$Source\data\cabinet.json"
  $model.vpx.iniPath = "$home_\sandbox\VPinballX.ini"
  $model.PSObject.Properties.Remove('buttons')
  if ($scene.Fronton) {
    # DMD en bande 4:1 sous le fronton, sur le même écran (comme demo-zones.ps1).
    $screen = $model.screens | Where-Object fingerprint -eq $model.roles.backglass
    $model.roles.dmd = $model.roles.backglass
    $zones = node -e "const z = require('./packages/core/dist/zones.js'); console.log(JSON.stringify(z.splitBackglassDmd({ width: $($screen.widthPx), height: $($screen.heightPx) })))" | ConvertFrom-Json
    $model | Add-Member -NotePropertyName zones -NotePropertyValue $zones -Force
  }
  if ($output) {
    $audio = [pscustomobject]@{
      outputs = @([pscustomobject]@{ endpointId = $output.endpointId; label = $output.friendlyName; lastSeen = $output })
      roles = [pscustomobject]@{ backglass = $output.endpointId }
      playfieldMode = 'stereo'
    }
    $model | Add-Member -NotePropertyName audio -NotePropertyValue $audio -Force
  }
  $model | ConvertTo-Json -Depth 20 | Set-Content -Path "$home_\cabinet.json" -Encoding UTF8
  if ($scene.Reglages) { $scene.Reglages | ConvertTo-Json | Set-Content -Path "$home_\medias.json" -Encoding UTF8 }

  $env:CYBERPINBALL_ROOT = $root
  $env:CYBERPINBALL_HOME = $home_
  $env:CYBERPINBALL_AUTOPILOT = $scene.Etapes -join ','
  $env:CYBERPINBALL_CAPTURE = $captures
  if ($scene.Simulee) { $env:CYBERPINBALL_PARTIE_SIMULEE = $scene.Simulee } else { Remove-Item Env:CYBERPINBALL_PARTIE_SIMULEE -ErrorAction SilentlyContinue }
  # Chargement de 6 s (2,5 s par défaut) puis 1,5 s avant la partie simulée : une étape avec
  # ses captures prend déjà 3 s ou plus ; « toujours le chargement » (07, 20) et « partie »
  # (08, 13) tombaient sinon d'un côté ou de l'autre selon la charge du poste.
  if ($scene.Simulee) { $env:CYBERPINBALL_LOADING_MS = '6000' } else { Remove-Item Env:CYBERPINBALL_LOADING_MS -ErrorAction SilentlyContinue }
  if ($scene.Flippers) { $env:CYBERPINBALL_FLIPPERS = $scene.Flippers } else { Remove-Item Env:CYBERPINBALL_FLIPPERS -ErrorAction SilentlyContinue }
  "`n=== $name"
  $line = "`"$electron`" app --user-data-dir=`"$dir\chromium`" > `"$captures\sortie.txt`" 2> `"$captures\erreurs.txt`""
  Start-Process -FilePath cmd.exe -ArgumentList '/d', '/c', "`"$line`"" -WorkingDirectory $wt -NoNewWindow -Wait
  Assert-HorsEcran $captures

  $layout = Get-Content "$captures\mise-en-page.txt" -Raw -Encoding UTF8
  if ($layout -notmatch '^Aucun problème') { $failures += "$name : mise en page`n$layout" }
  $sounds = @{}
  if (Test-Path "$captures\son.txt") {
    foreach ($l in Get-Content "$captures\son.txt" -Encoding UTF8) {
      if ($l -match '^(\S+) : (.+)$') { $sounds[$Matches[1]] = $Matches[2] | ConvertFrom-Json }
    }
  }
  foreach ($step in $scene.Attendu.Keys | Sort-Object) {
    $want = $scene.Attendu[$step]
    $got = $sounds[$step]
    if (-not $got) { $failures += "$name $step : aucun relevé du son"; continue }
    $music = if ($got.musique) { $got.musique.fichier } else { $null }
    $video = if ($got.video) { $got.video.volume } else { 0 }
    $ok = $true
    if ($want.ContainsKey('musique')) { $ok = $music -eq $want.musique }
    if ($want.ContainsKey('video')) { $ok = $ok -and [math]::Abs($video - $want.video) -lt 0.001 }
    $menu = $got.ecrans.playfield
    $state = "attente : $(if ($menu.attente) { $menu.attente } else { 'non' }) · $($menu.phase) · table $($menu.position)"
    if ($want.etat) {
      $ok = $ok -and [bool]$menu.attente -eq $want.etat.attente -and $menu.phase -eq $want.etat.phase -and $menu.position -eq $want.etat.position
    }
    # Mode attente : jamais plus fort que le volume réduit.
    if ($scene.MaxAttente -and $menu.attente) {
      $loudest = [math]::Max($(if ($got.musique) { $got.musique.volume } else { 0 }), $video)
      if ($loudest -gt $scene.MaxAttente + 0.001) { $ok = $false; $state += " (trop fort : $loudest)" }
    }
    # Une vidéo qui doit s'entendre joue sans être coupée ; sinon elle reste muette.
    if ($ok -and $got.video.video -and $want.ContainsKey('video')) { $ok = $got.video.video.muted -eq ($want.video -eq 0) -and [bool]$got.video.video.paused -eq [bool]$want.pause }
    if ($ok -and $want.volume) { $ok = [math]::Abs($got.musique.volume - $want.volume) -lt 0.001 -and $got.musique.lecture -eq 'en lecture' }
    $launch = if ($got.lancement) { $got.lancement.fichier } else { $null }
    if ($ok -and $want.ContainsKey('lancement')) { $ok = $launch -eq $want.lancement }
    # Couches attendues : « fenêtre/rôle » -> « élément[ lecture] ».
    $layers = @()
    foreach ($key in ($want.couches.Keys | Sort-Object)) {
      $win, $part = $key -split '/'
      $layer = @($got.ecrans.$win.couches) | Where-Object role -eq $part | Select-Object -First 1
      $seen = if ($layer) { (@($layer.element, $layer.lecture) | Where-Object { $_ }) -join ' ' } else { 'absente' }
      $layers += "$key $seen"
      if ($seen -ne $want.couches[$key]) { $ok = $false; $layers[-1] += " (attendu : $($want.couches[$key]))" }
    }
    $text = "musique : $(if ($music) { "$music à $($got.musique.volume) ($($got.musique.lecture))" } else { 'aucune' }) · lancement : $(if ($launch) { $launch } else { 'aucun' }) · vidéo : $video · sortie : $($got.sortie) · $state$(if ($layers) { "`n      écrans : $($layers -join ' · ')" })"
    "  $step  $(if ($ok) { 'ok' } else { 'ÉCHEC' })  $text"
    if (-not $ok) { $failures += "$name $step : attendu musique $($want.musique) $($want.volume), vidéo $($want.video) ; relevé $text" }
  }
  Get-ChildItem $captures -Recurse -Filter *.png | Measure-Object | ForEach-Object { "  $($_.Count) captures dans $captures" }
  Select-String -Path "$captures\sortie.txt", "$captures\erreurs.txt" -Pattern 'Médias :|Error' | ForEach-Object { "  ATTENTION : $($_.Line)" }
  Select-String -Path "$captures\sortie.txt" -Pattern '^Partie :' | ForEach-Object { "  $($_.Line)" }
}

if ((Get-FileHash "$Source\config\VPinballX.ini").Hash -ne $realHash) { throw 'Le vrai VPinballX.ini a changé !' }
if ((Get-FileHash "$Source\data\cabinet.json").Hash -ne $realModel) { throw 'Le vrai modèle de borne a changé !' }
if ($failures.Count) { throw "Moments du menu : $($failures.Count) échec(s)`n$($failures -join "`n")" }
"`nMoments du menu : tout est conforme. Vrai VPinballX.ini et vrai modèle de borne inchangés."
