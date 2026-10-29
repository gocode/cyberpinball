# Preuves du jalon « Habillage des écrans » (docs/recherche/medias.md, § 5.5, tâche T12) :
# le vrai menu, hors écran, sur un bac à sable de trois tables aux médias générés
# (docs\demo-medias.cjs) : une complète, une partielle, une sans aucun média.
# Pour chaque jeu d'écrans simulés (la borne type, puis le poste à deux écrans), une même
# séquence capture chaque écran à chaque moment :
#   navigation : les trois tables (vidéos, image du .directb2s, défaut de la borne, replis) ;
#   fiche      : prospectus page par page, carte des règles, puis leurs replis (fiche générée,
#                commandes de la partie) pour la table sans média ;
#   gestionnaire : « Médias du jeu » de la table complète (et ses pages) et de la table vide ;
#   chargement : vidéo de chargement et son de lancement, puis l'écran de chargement de secours ;
#   partie     : partie simulée (CYBERPINBALL_PARTIE_SIMULEE, VPX jamais lancé) qui occupe le
#                fronton : fronton figé, écrans libres animés (réglage « animés »), repli « en
#                partie » ; puis le retour au menu ;
#   attente    : mode attente (25 s sans bouton : une étape et ses captures durent jusqu'à 10 s),
#                une table au hasard toutes les 3 s, sortie par un flipper sans changer la sélection.
# Vérifié automatiquement : aucun écran vide (vides.txt), aucun texte qui chevauche, sort de
# l'écran ou est coupé (mise-en-page.txt, garde-fou layout-check sur chaque écran), les replis
# là où un média manque, le média attendu sur chaque écran et chaque moment (son.txt : couches
# relevées). Une planche par étape (tous les écrans côte à côte) dans <captures>\planches.
# Les fenêtres hors écran sont muettes : on ne voit et n'entend rien sur le poste.
#   .\docs\demo-medias.ps1 [-Ecrans borne, poste-deux-ecrans]
# Captures dans tmp\captures\medias\<écrans>. VPX n'est jamais lancé ; ni le vrai modèle de
# borne ni le vrai VPinballX.ini ne sont touchés (le second n'est que copié).
param(
  [string[]]$Ecrans = @('borne', 'poste-deux-ecrans'),
  [string]$Source = 'D:\CyberPinball'
)
$ErrorActionPreference = 'Stop'
$wt = Split-Path $PSScriptRoot -Parent
. "$PSScriptRoot\hors-ecran.ps1"
# Tout le reste tourne sur un bureau Windows caché : rien ne peut apparaître sur les écrans du poste.
if (Enter-BureauCache $PSCommandPath $PSBoundParameters) { exit $LASTEXITCODE }
$base = "$wt\tmp\demo-medias"
$realIni = "$Source\config\VPinballX.ini"
$realHash = (Get-FileHash $realIni).Hash
$electron = node -p "require('electron')"

Push-Location $wt
try { npm run build | Out-Null } finally { Pop-Location }

# Nettoyage : d'abord les jonctions d'une racine d'avant le 29/10/2026 (sans /s, pour ne jamais y descendre).
if (Test-Path $base) {
  Get-ChildItem -Directory -Recurse -Depth 2 $base -Attributes ReparsePoint | ForEach-Object { cmd /c rmdir "$($_.FullName)" }
  Remove-Item -Recurse -Force $base
}
$root = "$base\root"
Push-Location $wt
try { & $electron docs\demo-medias.cjs generer $root 2>&1 | ForEach-Object { "   $_" } } finally { Pop-Location }
if ($LASTEXITCODE -ne 0) { throw 'Génération des médias en échec.' }
# VPX est « installé » (fausse installation, New-FauxVpx : le menu propose Jouer), mais la partie est simulée.
New-FauxVpx $root

# Touches : celles des encodeurs par défaut (flèches, Start = 1, Exit = Échap) ; les actions
# de la fiche et du gestionnaire par leur libellé (étape action: de l'autopilote).
$Start = 'Digit1'; $Exit = 'Escape'; $Down = 'ArrowDown'; $Up = 'ArrowUp'
$etapes = @(
  'wait:1500',                  # 01 Astro Néon (complète) : vidéos du plateau, du fronton, du topper
  $Down, 'wait:1500',           # 03 Bayou d'Or (partielle) : plateau en image, fronton du .directb2s, topper de la borne, DMD en repli
  $Down, 'wait:1500',           # 05 Comète silencieuse (aucun média) : replis partout, topper de la borne
  $Down, $Start,                # 07 fiche d'Astro Néon
  'action:Prospectus',          # 08 prospectus, page 1 sur 2
  $Down,                        # 09 page 2 sur 2
  $Exit, 'action:Règles',       # 11 carte des règles
  $Exit, 'action:Médias du jeu', # 13 gestionnaire : chaque type, son état, son aperçu
  'action:Prospectus',          # 14 gestionnaire : les pages du prospectus
  $Exit, $Exit, $Exit,          # 17 retour au menu
  $Up, $Start,                  # 19 fiche de la table sans média
  'action:Prospectus',          # 20 prospectus généré depuis le .info
  $Exit, 'action:Règles',       # 22 commandes de la partie, faute de règles
  $Exit, 'action:Médias du jeu', # 24 gestionnaire : tout en repli
  $Exit, $Exit,                 # 26 menu
  # Chargement de 17,5 s (CYBERPINBALL_LOADING_MS, puis 1,5 s de la fausse partie), partie de 10 s.
  # La partie et le retour au menu s'attendent par leur phase (until:) : la durée des étapes varie
  # avec les écrans (jusqu'à 10 s sur la borne aux quatre écrans, captures 4K comprises), seul le
  # chargement doit durer plus que les étapes 29 et 30 (ou 35 et 36).
  $Down, $Start, 'action:Jouer', # 29 Astro Néon : vidéo de chargement, son de lancement
  'wait:1500',                  # 30 chargement
  'until:playing',              # 31 partie : fronton occupé (figé), écrans libres animés
  'until:menu',                 # 32 retour au menu
  $Up, $Start, 'action:Jouer',  # 35 table sans média : écran de chargement de secours
  'wait:1500',                  # 36 chargement
  'until:playing',              # 37 partie : replis « en partie »
  'until:menu',                 # 38 retour au menu
  'wait:30000',                 # 39 mode attente (25 s sans bouton) : une table au hasard
  'wait:4000',                  # 40 une autre table
  $Down,                        # 41 un flipper : retour au menu, sélection inchangée
  'wait:600'                    # 42 menu
)
$astro = 'Astro Néon (Williams 1992)'
# Attendu, par numéro d'étape : couches (rôle -> élément, et fichier si besoin), fiche, phase.
# L'élément d'une couche : « vidéo en lecture », « image », « image figée », « repli ».
$attendu = [ordered]@{
  '01' = @{ couches = @{ playfield = 'vidéo en lecture'; backglass = 'vidéo en lecture'; dmd = 'image'; topper = 'vidéo en lecture' } }
  '03' = @{ couches = @{ playfield = 'image'; backglass = 'image'; dmd = 'repli'; topper = 'image (Topper).png' } }
  '05' = @{ couches = @{ playfield = 'repli'; backglass = 'repli'; dmd = 'repli'; topper = 'image (Topper).png' } }
  '07' = @{ fiche = @{ ecran = 'sheet' } }
  '08' = @{ fiche = @{ ecran = 'pages'; sousTitre = 'Prospectus · page 1 sur 2'; element = 'image' } }
  '09' = @{ fiche = @{ ecran = 'pages'; sousTitre = 'Prospectus · page 2 sur 2'; element = 'image' } }
  '11' = @{ fiche = @{ ecran = 'pages'; sousTitre = 'Règles'; element = 'image' } }
  '13' = @{ fiche = @{ ecran = 'custom'; titre = 'Médias du jeu' } }
  '14' = @{ fiche = @{ ecran = 'custom'; titre = 'Prospectus' } }
  '20' = @{ fiche = @{ ecran = 'pages'; sousTitre = 'Prospectus'; element = 'repli'; repli = 'info-sheet' } }
  '22' = @{ fiche = @{ ecran = 'pages'; sousTitre = 'Règles'; element = 'repli'; repli = 'game-controls' } }
  '24' = @{ fiche = @{ ecran = 'custom'; titre = 'Médias du jeu' } }
  '29' = @{ phase = 'loading'; lancement = "(AudioLaunch) $astro.wav" }
  '30' = @{ phase = 'loading'; couches = @{ playfield = "vidéo en lecture (Loading) $astro.webm"; backglass = 'vidéo en lecture'; topper = 'vidéo en lecture' } }
  '31' = @{ phase = 'playing'; couches = @{ playfield = 'image figée'; backglass = 'image figée'; dmd = 'image'; topper = 'vidéo en lecture' } }
  '32' = @{ phase = 'menu'; position = 1 }
  '36' = @{ phase = 'loading'; couches = @{ playfield = 'repli'; backglass = 'repli'; dmd = 'repli' } }
  '37' = @{ phase = 'playing'; couches = @{ backglass = 'repli'; dmd = 'repli'; topper = 'image (Topper).png' } }
  '38' = @{ phase = 'menu'; position = 3 }
  '39' = @{ attente = $true }
  '40' = @{ attente = $true }
  '41' = @{ attente = $false; phase = 'menu'; position = 3 }
}
$reglages = @{ music = $true; musicVolume = 60; videoVolume = 40; launchVolume = 80; game = 'animated'; attractDelay = 25; attractInterval = 3; attractSound = 'reduced' }

$failures = @()
foreach ($name in $Ecrans) {
  Use-HorsEcran $name
  $home_ = "$base\$name\home"
  $captures = "$wt\tmp\captures\medias\$name"
  if (Test-Path $captures) { Remove-Item -Recurse -Force $captures }
  New-Item -ItemType Directory -Force "$home_\sandbox", $captures | Out-Null
  Copy-Item $realIni "$home_\sandbox\VPinballX.ini"
  node "$PSScriptRoot\demo-medias.cjs" modele "$PSScriptRoot\ecrans\$name.json" "$home_\cabinet.json" "$home_\sandbox\VPinballX.ini" | ForEach-Object { "   $_" }
  if ($LASTEXITCODE -ne 0) { throw "Modèle de borne pour $name en échec." }
  # Rotation du menu (bord des flippers), pour redresser le playfield sur les planches ; lue avant
  # que l'application ne réécrive cabinet.json dans son format à configurations.
  $rotation = node -p "require('./packages/core/dist/index.js').edgeRotation(require(process.argv[1]).playfield.flipperEdge)" "$home_\cabinet.json"
  if ($LASTEXITCODE -ne 0) { throw "Rotation du menu pour $name illisible." }
  $reglages | ConvertTo-Json | Set-Content -Path "$home_\medias.json" -Encoding UTF8

  $env:CYBERPINBALL_ROOT = $root
  $env:CYBERPINBALL_HOME = $home_
  $env:CYBERPINBALL_AUTOPILOT = $etapes -join ','
  $env:CYBERPINBALL_CAPTURE = $captures
  # La fausse partie occupe l'écran du fronton (comme un .directb2s) ; elle s'arrête seule après 10 s.
  $env:CYBERPINBALL_PARTIE_SIMULEE = 'backglass'
  # Chargement allongé : il couvre deux étapes et leurs captures (jusqu'à 10 s chacune sur la borne).
  $env:CYBERPINBALL_LOADING_MS = '16000'
  "`n=== $name"
  $line = "`"$electron`" app --user-data-dir=`"$base\$name\chromium`" > `"$captures\sortie.txt`" 2> `"$captures\erreurs.txt`""
  Start-Process -FilePath cmd.exe -ArgumentList '/d', '/c', "`"$line`"" -WorkingDirectory $wt -NoNewWindow -Wait
  Assert-HorsEcran $captures

  # Écrans vides et planches.
  Push-Location $wt
  try { & $electron docs\demo-medias.cjs verifier $captures $rotation 2>&1 | ForEach-Object { "   $_" } } finally { Pop-Location }
  $empty = Get-Content "$captures\vides.txt" -Raw -Encoding UTF8
  if ($empty -notmatch '^Aucun écran vide') { $failures += "$name : écrans vides`n$empty" }
  $layout = Get-Content "$captures\mise-en-page.txt" -Raw -Encoding UTF8
  if ($layout -notmatch '^Aucun problème') { $failures += "$name : mise en page`n$layout" }
  Select-String -Path "$captures\sortie.txt" -Pattern '^Autopilote : ' | ForEach-Object { $failures += "$name : $($_.Line)" }

  # Ce que montre chaque écran après chaque étape (son.txt : son et couches de chaque fenêtre).
  $releves = @{}
  foreach ($l in Get-Content "$captures\son.txt" -Encoding UTF8) {
    if ($l -match '^(\d\d)-\S* : (.+)$') { $releves[$Matches[1]] = $Matches[2] | ConvertFrom-Json }
  }
  foreach ($step in $attendu.Keys) {
    $want = $attendu[$step]
    $got = $releves[$step]
    if (-not $got) { $failures += "$name $step : aucun relevé"; continue }
    $menu = $got.ecrans.playfield
    $seen = @(); $ok = $true
    foreach ($role in ($want.couches.Keys | Sort-Object)) {
      # La couche du rôle, dans la fenêtre qui le dessine (sa fenêtre, ou une zone du fronton).
      $layer = @($got.ecrans.PSObject.Properties.Value | ForEach-Object { @($_.couches) } | Where-Object { $_.role -eq $role }) | Select-Object -First 1
      if (-not $layer) {
        # Pas d'écran pour ce rôle sur ce jeu d'écrans (le poste n'a pas de topper) : rien à vérifier.
        if ($role -eq 'topper' -and -not ($got.ecrans.PSObject.Properties.Name -contains 'topper')) { continue }
        $seen += "$role absente"; $ok = $false; continue
      }
      $text = (@($layer.element, $layer.lecture) | Where-Object { $_ }) -join ' '
      # « image (Topper).png » : l'élément, puis le fichier montré.
      $expected = $want.couches[$role]
      if ($expected -match '^(?<el>.+?) (?<file>\(.+)$') { $wantElement = $Matches.el; $wantFile = $Matches.file } else { $wantElement = $expected; $wantFile = $null }
      $good = $text -eq $wantElement -and (-not $wantFile -or $layer.fichier -eq $wantFile)
      $seen += "$role $text$(if ($wantFile) { " $($layer.fichier)" })$(if (-not $good) { " (attendu : $expected)" })"
      $ok = $ok -and $good
    }
    if ($want.fiche) {
      $f = $got.ecrans.playfield.fiche
      $page = $f.page
      $values = @{ ecran = $f.ecran; titre = $f.titre; sousTitre = $f.sousTitre; element = $page.element; repli = $page.repli }
      foreach ($k in $want.fiche.Keys) {
        $good = $values[$k] -eq $want.fiche[$k]
        $seen += "$k $($values[$k])$(if (-not $good) { " (attendu : $($want.fiche[$k]))" })"
        $ok = $ok -and $good
      }
    }
    if ($want.phase) { $good = $menu.phase -eq $want.phase; $seen += "phase $($menu.phase)$(if (-not $good) { " (attendu : $($want.phase))" })"; $ok = $ok -and $good }
    if ($want.position) { $good = $menu.position -eq $want.position; $seen += "table $($menu.position)$(if (-not $good) { " (attendue : $($want.position))" })"; $ok = $ok -and $good }
    if ($want.ContainsKey('attente')) { $good = [bool]$menu.attente -eq $want.attente; $seen += "attente : $(if ($menu.attente) { $menu.attente } else { 'non' })$(if (-not $good) { ' (inattendu)' })"; $ok = $ok -and $good }
    if ($want.lancement) {
      $launch = if ($got.lancement) { $got.lancement.fichier } else { 'aucun' }
      $good = $launch -eq $want.lancement; $seen += "lancement $launch"; $ok = $ok -and $good
    }
    "  $step  $(if ($ok) { 'ok' } else { 'ÉCHEC' })  $($seen -join ' · ')"
    if (-not $ok) { $failures += "$name $step : $($seen -join ' · ')" }
  }
  Get-ChildItem $captures -Recurse -Filter *.png | Where-Object { $_.DirectoryName -notlike '*planches' } | Measure-Object | ForEach-Object { "  $($_.Count) captures, planches dans $captures\planches" }
  Select-String -Path "$captures\sortie.txt", "$captures\erreurs.txt" -Pattern 'Médias :|Error' | ForEach-Object { "  ATTENTION : $($_.Line)" }
}

Remove-Item Env:CYBERPINBALL_PARTIE_SIMULEE, Env:CYBERPINBALL_LOADING_MS -ErrorAction SilentlyContinue
if ((Get-FileHash $realIni).Hash -ne $realHash) { throw 'Le vrai VPinballX.ini a changé !' }
if ($failures.Count) { throw "Médias des jeux : $($failures.Count) échec(s)`n$($failures -join "`n")" }
"`nMédias des jeux : tout est conforme sur $($Ecrans -join ' et '). Vrai VPinballX.ini inchangé."
