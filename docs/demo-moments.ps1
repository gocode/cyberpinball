# Démonstration sans opérateur des moments du menu (docs/recherche/medias.md, § 5.2) : le
# vrai menu, hors écran, sur un bac à sable de tables aux médias générés (docs\demo-moments.cjs).
#   navigation : musique de chaque jeu, volume relatif d'un jeu, son de la vidéo du plateau
#                quand le jeu n'a pas de musique, écran « Médias, son et attente » et ses listes ;
#   silence    : réglages par défaut (musique coupée, vidéos muettes) : rien ne joue ;
#   menus      : hors du menu des tables (aide, menu système, ses réglages), chaque écran montre
#                l'affichage par défaut de Cyber Pinball (couches « marque »), en silence ; au
#                retour à la roue, les médias et la musique de la table reviennent ; sa fiche les garde ;
#   reglage    : fiche > « Régler l'affichage en partie » : chargement avec les boutons du menu
#                de VPX, partie simulée, retour sur la fiche ;
#   partie     : partie simulée (CYBERPINBALL_PARTIE_SIMULEE, VPX jamais lancé) de trois tables :
#                vidéo de chargement et son de lancement, écran de chargement de secours au
#                titre très long, vidéo de chargement en portrait avec son ; pendant la partie,
#                fronton « occupé par VPX » figé, topper animé (réglage « animés »), silence ;
#                au retour, la musique reprend ;
#   pivotee    : la même partie, playfield tourné (flippers à gauche) et DMD en bande sous le
#                fronton (zones) : chargement et fond de partie dans la bonne orientation, puis
#                le mode attente tourné ;
#   habillage  : FullDMD habillé (signalement du 26/10/2026, The Walking Dead) : Neon Galaxy reçoit
#                un média FullDMD avec un cadre de DMD ; avant la partie simulée, la fenêtre du
#                DMD de VPX est posée dans ce cadre par le .ini de la table ; pendant la partie,
#                médias « éteints », l'écran du DMD garde l'habillage ; au retour, le menu ;
#   interface  : sons de l'interface (ui-sounds.js) : clic de solénoïde à chaque table, pièce
#                au Start, rien pendant la partie simulée (fenêtre muette) ; un record entré au
#                tableau pendant la partie (VPReg.stg remplacé) : knocker au retour ; écran
#                « Médias, son et attente » : couper, rétablir (clic), volume (pièce) ;
#   cinema     : lancement en cinéma (cinema.ts) d'une partie simulée de Neon Galaxy : au
#                chargement, le plateau montre le départ du logo et le fronton son arrivée ; le
#                coup de bobine sonne au passage de relais ; le journal dit quand VPX est parti ;
#   sans-cinema: la même partie, le réglage coupé : aucune scène, pas de coup de bobine, et VPX
#                part au même moment qu'avec le cinéma (docs\demo-cinema.ps1 lance les deux) ;
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
# La partie et le retour au menu s'attendent par leur phase (étape until: de l'autopilote).
#   .\docs\demo-moments.ps1 [-Scenarios navigation, silence, partie] [-Ecrans pc-dev]
# VPX n'est jamais lancé ; ni le vrai modèle de borne ni le vrai VPinballX.ini ne sont touchés.
param(
  [string[]]$Scenarios = @('navigation', 'silence', 'menus', 'liste', 'bandeau', 'minimal', 'arche', 'partie', 'reglage', 'pivotee', 'habillage', 'interface', 'cinema', 'sans-cinema', 'attente'),
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

# Nettoyage : d'abord les jonctions d'une racine d'avant le 29/10/2026 (sans /s, pour ne jamais y descendre).
if (Test-Path $base) {
  Get-ChildItem -Directory -Recurse -Depth 2 $base -Attributes ReparsePoint | ForEach-Object { cmd /c rmdir "$($_.FullName)" }
  Remove-Item -Recurse -Force $base
}
$root = "$base\root"
# Table au titre très long (docs\demo-moments.cjs) : celle que joue le scénario « interface ».
$tableLongue = "$root\tables\Le très long titre d’une table imaginaire pour vérifier les débordements du chargement et des écrans (Stern 2020)"
Push-Location $wt
try { & $electron docs\demo-moments.cjs $root 2>&1 | ForEach-Object { "   $_" } } finally { Pop-Location }
if ($LASTEXITCODE -ne 0) { throw 'Génération des médias en échec.' }
# VPX « installé » (fausse installation, New-FauxVpx) : les parties sont simulées ou refusées hors écran.
New-FauxVpx $root

# Sortie audio du fronton : la première sortie active du poste (lecture seule du registre),
# pour que la musique soit envoyée sur une vraie sortie (setSinkId), muette hors écran.
$probe = node "$wt\packages\win-displays\dist\cli.js" --json | ConvertFrom-Json
$output = @($probe.audio)[0]

# Touches : celles des encodeurs par défaut (flèches, Start = 1, Exit = Échap).
$Start = 'Digit1'; $Exit = 'Escape'; $Down = 'ArrowDown'; $Up = 'ArrowUp'; $Help = 'KeyH'
# Écrans de la borne hors du menu des tables : affichage par défaut (scénario « menus »).
$marque = @{ 'playfield/playfield' = 'marque'; 'backglass/backglass' = 'marque'; 'dmd/dmd' = 'marque'; 'topper/topper' = 'marque' }
$neon = @{ 'playfield/playfield' = 'vidéo en lecture'; 'backglass/backglass' = 'vidéo en lecture'; 'topper/topper' = 'vidéo en lecture' }
$scenes = @{
  navigation = @{
    Reglages = @{ music = $true; musicVolume = 60; videoVolume = 40; launchVolume = 80 }
    Etapes = @(
      'wait:1500',                # 01 Atlantis Deep : ni musique ni vidéo
      $Down, $Down, $Down, 'wait:1500', # 05 Neon Galaxy : sa musique à 60 %
      $Down, 'wait:1500',         # 07 Pharaoh's Gold : sa musique à 30 % (volume du jeu : 50 %)
      $Down, 'wait:1500',         # 09 Rocket Rally : pas de musique, le son de sa vidéo à 40 %
      # Menu système et réglages désignés par leur libellé : leur rang change quand l'écran
      # gagne une ligne (« son et attente » : pas de virgule dans une étape, elles en sont séparées).
      # Les attentes gardent à chaque étape son numéro (captures attendues ci-dessous).
      $Exit, 'wait:200', 'wait:200', 'wait:200', 'wait:200', # 14 menu système
      'action:son et attente',    # 15 l'écran « Médias, son et attente »
      'action:Musique des jeux', 'wait:1000',     # 17 musique coupée ; menu système : rien d'une table ne s'entend
      'wait:200', 'wait:200', 'action:Son des vidéos du menu', # 20 liste « Son des vidéos du menu », sur 40 %
      $Down, $Start, 'wait:1000', # 23 50 %, toujours en silence
      $Exit, $Exit, 'wait:1500',  # 26 retour aux tables : la vidéo de Rocket Rally s'entend à 50 %
      $Exit, 'wait:200', 'wait:200', 'wait:200', 'wait:200', 'action:son et attente', # 32 de nouveau l'écran des réglages
      'action:Présentation du menu', # 33 la liste des roues et de la liste, sur Médaillons
      'action:Roue Arche', 'wait:800', # 35 Arche choisie, retour aux réglages
      $Exit, $Exit, 'wait:1500'   # 38 les tables, sur la roue Arche
    )
    Attendu = @{
      '01-wait_1500' = @{ musique = $null; video = 0.4 }
      '05-wait_1500' = @{ musique = '(Audio) Neon Galaxy (Williams 1992).wav'; volume = 0.6; video = 0 }
      '07-wait_1500' = @{ musique = "(Audio) Pharaoh's Gold (Gottlieb 1979).wav"; volume = 0.3; video = 0 }
      '09-wait_1500' = @{ musique = $null; video = 0.4 }
      '17-wait_1000' = @{ musique = $null; video = 0; couches = $marque }
      '23-wait_1000' = @{ musique = $null; video = 0; couches = $marque }
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
  # Hors du menu des tables (signalement du 26/10/2026) : aide, menu système et ses réglages
  # montrent l'affichage par défaut sur tous les écrans, sans musique ni vidéo de la table ;
  # le retour à la roue rend ses médias à la table choisie, et sa fiche les garde.
  menus = @{
    Reglages = @{ music = $true; musicVolume = 60; videoVolume = 40 }
    Etapes = @(
      $Down, $Down, $Down, 'wait:1500', # 04 Neon Galaxy : ses vidéos, sa musique
      $Help, 'wait:1000',         # 06 aide des commandes : affichage par défaut
      $Help, 'wait:1500',         # 08 aide fermée : Neon Galaxy revient
      $Exit, 'wait:1000',         # 10 menu système : affichage par défaut, silence
      'action:son et attente', 'wait:1000', # 12 ses réglages : toujours l'affichage par défaut
      $Exit, $Exit, 'wait:1500',  # 15 retour à la roue : Neon Galaxy revient
      $Start, 'wait:1000',        # 17 sa fiche : elle parle de Neon Galaxy, qui reste
      $Exit, 'wait:1000'          # 19 retour à la roue
    )
    Attendu = @{
      '04-wait_1500' = @{ musique = '(Audio) Neon Galaxy (Williams 1992).wav'; volume = 0.6; video = 0; phase = 'menu'; couches = $neon }
      '06-wait_1000' = @{ musique = $null; video = 0; phase = 'menu'; couches = $marque }
      '08-wait_1500' = @{ musique = '(Audio) Neon Galaxy (Williams 1992).wav'; volume = 0.6; video = 0; phase = 'menu'; couches = $neon }
      '10-wait_1000' = @{ musique = $null; video = 0; phase = 'library'; couches = $marque }
      '12-wait_1000' = @{ musique = $null; video = 0; phase = 'library'; couches = $marque }
      '15-wait_1500' = @{ musique = '(Audio) Neon Galaxy (Williams 1992).wav'; volume = 0.6; video = 0; phase = 'menu'; couches = $neon }
      # Fiche : le fond du playfield, caché par l'écran, est en pause.
      '17-wait_1000' = @{ musique = '(Audio) Neon Galaxy (Williams 1992).wav'; volume = 0.6; video = 0; pause = $true; phase = 'library'; couches = @{ 'backglass/backglass' = 'vidéo en lecture'; 'topper/topper' = 'vidéo en lecture' } }
      '19-wait_1000' = @{ musique = '(Audio) Neon Galaxy (Williams 1992).wav'; volume = 0.6; video = 0; phase = 'menu'; couches = $neon }
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
    # La partie et le retour au menu s'attendent par leur phase (until:) ; seul le chargement
    # parie sur la durée des étapes (voir CYBERPINBALL_LOADING_MS plus bas).
    Simulee = 'backglass'
    Etapes = @(
      $Down, $Down, $Down, 'wait:1000', # 04 Neon Galaxy : sa musique
      $Start, $Start,             # 06 Jouer : vidéo de chargement, son de lancement, musique éteinte
      'wait:1500',                # 07 toujours le chargement
      'until:playing',            # 08 partie : silence, fronton figé (occupé), topper animé
      'until:menu',               # 09 retour au menu : la musique reprend
      $Up, $Start, $Start,        # 12 titre très long, sans média : écran de chargement de secours
      'until:playing',            # 13 partie : repli « en partie » sur les écrans libres
      'until:menu',               # 14 retour
      $Down, $Down, $Down, $Start, $Start, # 19 Rocket Rally : vidéo de chargement en portrait, avec son
      'wait:1500',                # 20 chargement
      'until:menu'                # 21 retour
    )
    Attendu = @{
      '04-wait_1000' = @{ musique = '(Audio) Neon Galaxy (Williams 1992).wav'; volume = 0.6; video = 0; phase = 'menu' }
      '06-Digit1' = @{ musique = $null; video = 0; lancement = '(AudioLaunch) Neon Galaxy (Williams 1992).wav'; phase = 'loading' }
      '07-wait_1500' = @{ musique = $null; video = 0; phase = 'loading'; commandes = 'Commandes de la partie'; couches = @{ 'playfield/playfield' = 'vidéo en lecture'; 'backglass/backglass' = 'vidéo en lecture'; 'topper/topper' = 'vidéo en lecture' } }
      '08-until_playing' = @{ musique = $null; video = 0; lancement = $null; phase = 'playing'; couches = @{ 'playfield/playfield' = 'image figée'; 'backglass/backglass' = 'image figée'; 'topper/topper' = 'vidéo en lecture'; 'dmd/dmd' = 'image' } }
      '09-until_menu' = @{ musique = '(Audio) Neon Galaxy (Williams 1992).wav'; volume = 0.6; video = 0; phase = 'menu' }
      '12-Digit1' = @{ phase = 'loading' }
      '13-until_playing' = @{ musique = $null; video = 0; phase = 'playing'; couches = @{ 'backglass/backglass' = 'repli'; 'topper/topper' = 'image' } }
      '14-until_menu' = @{ phase = 'menu' }
      '19-Digit1' = @{ musique = $null; video = 0.8; lancement = $null; phase = 'loading' }
      '20-wait_1500' = @{ phase = 'loading' }
      '21-until_menu' = @{ musique = $null; video = 0; phase = 'menu' }
    }
  }
  # Fiche > « Régler l'affichage en partie » : chargement avec les boutons du menu de VPX
  # (« Réglage de l'affichage »), partie simulée, puis retour sur la fiche, pas au menu.
  reglage = @{
    Reglages = @{ music = $false; game = 'still' }
    Simulee = 'backglass'
    Etapes = @(
      $Down, $Down, $Down, 'wait:1000', # 04 Neon Galaxy
      $Start,                     # 05 sa fiche
      'action:affichage en partie', # 06 réglage de l'affichage : chargement
      'wait:1500',                # 07 toujours le chargement, boutons du menu de VPX
      'until:playing',            # 08 partie simulée
      'until:library'             # 09 retour sur la fiche
    )
    Attendu = @{
      '07-wait_1500' = @{ phase = 'loading'; commandes = "Réglage de l’affichage" }
      '08-until_playing' = @{ phase = 'playing' }
      '09-until_library' = @{ phase = 'library' }
    }
  }
  # Sons de l'interface : relevés dans son.txt (champ « interface » : sons déjà joués, muet).
  # Records de la table jouée (la troisième, au titre très long) : VPReg.stg d'avant la partie,
  # remplacé pendant la partie par un tableau où JUL est entré premier (highscores.ts).
  interface = @{
    Reglages = @{ music = $false; game = 'still' }
    Simulee = 'backglass'
    Avant = {
      param($root)
      $folder = (Get-ChildItem -LiteralPath "$root\tables" -Directory | Where-Object Name -like 'Le tr*').FullName
      node -e "const f = require('./packages/core/dist/test/fixtures.js'); const fs = require('fs'); const [user, after] = process.argv.slice(1); fs.mkdirSync(user, { recursive: true }); fs.writeFileSync(user + '/VPReg.stg', f.cfb({ HighScore1: '5000000', HighScore1Name: 'AAA', HighScore2: '3000000', HighScore2Name: 'BBB' }, {}, { info: 'Imaginaire' })); fs.writeFileSync(after, f.cfb({ HighScore1: '7500000', HighScore1Name: 'JUL', HighScore2: '5000000', HighScore2Name: 'AAA' }, {}, { info: 'Imaginaire' }))" "$folder\user" "$root\VPReg-apres.stg"
    }
    Apres = {
      param($root, $captures)
      $folder = (Get-ChildItem -LiteralPath "$root\tables" -Directory | Where-Object Name -like 'Le tr*').FullName
      Remove-Item -LiteralPath "$folder\user" -Recurse -Force -ErrorAction SilentlyContinue
      Remove-Item -LiteralPath "$root\VPReg-apres.stg" -Force -ErrorAction SilentlyContinue
      if (-not (Select-String -Path "$captures\sortie.txt" -Pattern 'Record \(.*\) : 7500000 \(JUL\), place 1\.' -Quiet)) { 'journal : record de JUL non relevé' }
    }
    Etapes = @(
      'wait:1000',                # 01 aucun son de l'interface
      $Down, $Down,               # 03 deux tables : deux clics de solénoïde
      $Start, $Start,             # 05 fiche, puis « Jouer » : la pièce tombe au chargement
      'until:playing',            # 06 partie : fenêtre muette, plus rien ne part que le coup de bobine du relais
      "copy:$root\VPReg-apres.stg|$tableLongue\user\VPReg.stg", # 07 la table enregistre un record
      'until:menu',               # 08 retour : le knocker, et les sons reviennent
      $Down,                      # 09 un clic
      $Exit, 'wait:200', 'wait:200', # 12 menu système
      'action:son et attente',    # 13 l'écran « Médias, son et attente » et ses deux lignes
      "action:Sons de l’interface", # 14 coupés : aucun son
      "action:Sons de l’interface", # 15 rétablis : le clic de confirmation
      'action:Volume des sons',   # 16 la liste des volumes, sur 50 %
      $Up, $Start                 # 18 40 % : la pièce à ce volume, retour sur la ligne du volume
    )
    Attendu = @{
      '01-wait_1000' = @{ interface = ''; phase = 'menu' }
      '03-ArrowDown' = @{ interface = 'solenoid,solenoid'; phase = 'menu' }
      '05-Digit1' = @{ interface = 'solenoid,solenoid,coin'; phase = 'loading' }
      '06-until_playing' = @{ interface = 'solenoid,solenoid,coin,coil'; muet = $true; phase = 'playing' }
      '08-until_menu' = @{ interface = 'solenoid,solenoid,coin,coil,knocker'; muet = $false; phase = 'menu' }
      '09-ArrowDown' = @{ interface = 'solenoid,solenoid,coin,coil,knocker,solenoid'; phase = 'menu' }
      '14-action_Sons_de_l_interface' = @{ interface = 'solenoid,solenoid,coin,coil,knocker,solenoid'; phase = 'library' }
      '15-action_Sons_de_l_interface' = @{ interface = 'solenoid,solenoid,coin,coil,knocker,solenoid,solenoid'; phase = 'library' }
      '18-Digit1' = @{ interface = 'solenoid,solenoid,coin,coil,knocker,solenoid,solenoid,coin'; dernier = 0.4; phase = 'library' }
    }
  }
  # Lancement en cinéma : la part de chaque fenêtre (cyberEtat : scènes posées, sans celles qui
  # s'effacent), le coup de bobine au relais, et le moment où VPX part, comparé sans le cinéma.
  cinema = @{
    Reglages = @{ music = $false; game = 'still'; cinema = $true }
    Simulee = 'backglass'
    Etapes = @(
      $Down, $Down, $Down, 'wait:1000', # 04 Neon Galaxy : trois clics
      $Start, $Start,             # 06 fiche, puis « Jouer » : la pièce, la chorégraphie part
      'wait:1500',                # 07 chargement : le logo est passé du plateau au fronton
      'until:playing',            # 08 VPX prend la main : coup de bobine, plus aucune scène
      'until:menu'                # 09 retour au menu
    )
    Apres = { param($root, $captures) Test-Lancement $captures 'joué' }
    Attendu = @{
      '07-wait_1500' = @{ phase = 'loading'; interface = 'solenoid,solenoid,solenoid,coin'; cinema = @{ playfield = 'depart'; backglass = 'arrivee'; dmd = ''; topper = '' } }
      '08-until_playing' = @{ phase = 'playing'; interface = 'solenoid,solenoid,solenoid,coin,coil'; muet = $true; cinema = @{ playfield = ''; backglass = ''; dmd = ''; topper = '' } }
      '09-until_menu' = @{ phase = 'menu'; interface = 'solenoid,solenoid,solenoid,coin,coil'; cinema = @{ playfield = ''; backglass = '' } }
    }
  }
  'sans-cinema' = @{
    Reglages = @{ music = $false; game = 'still'; cinema = $false }
    Simulee = 'backglass'
    Etapes = @($Down, $Down, $Down, 'wait:1000', $Start, $Start, 'wait:1500', 'until:playing', 'until:menu')
    Apres = { param($root, $captures) Test-Lancement $captures 'coupé' }
    Attendu = @{
      '07-wait_1500' = @{ phase = 'loading'; interface = 'solenoid,solenoid,solenoid,coin'; cinema = @{ playfield = ''; backglass = ''; dmd = ''; topper = '' } }
      '08-until_playing' = @{ phase = 'playing'; interface = 'solenoid,solenoid,solenoid,coin'; muet = $true }
      '09-until_menu' = @{ phase = 'menu'; interface = 'solenoid,solenoid,solenoid,coin' }
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
      'until:playing',            # 08 partie : tout figé (réglage par défaut)
      'until:menu',               # 09 retour
      $Up, $Start, $Start, 'wait:1500', # 13 chargement de secours, titre très long, tourné
      'until:menu',               # 14 retour : le délai du mode attente part du retour au menu
      'wait:7000',                # 15 mode attente tourné (6 s sans bouton, comptées depuis 14)
      $Up                         # 16 un flipper : retour au menu, sélection inchangée
    )
    Attendu = @{
      '04-wait_1000' = @{ musique = '(Audio) Neon Galaxy (Williams 1992).wav'; volume = 0.6; video = 0; phase = 'menu' }
      '07-wait_1500' = @{ musique = $null; video = 0; phase = 'loading'; couches = @{ 'playfield/playfield' = 'vidéo en lecture'; 'backglass/backglass' = 'vidéo en lecture'; 'backglass/dmd' = 'image' } }
      '08-until_playing' = @{ musique = $null; video = 0; phase = 'playing'; couches = @{ 'playfield/playfield' = 'image figée'; 'backglass/backglass' = 'image figée'; 'backglass/dmd' = 'image figée'; 'topper/topper' = 'image figée' } }
      '09-until_menu' = @{ musique = '(Audio) Neon Galaxy (Williams 1992).wav'; volume = 0.6; video = 0; phase = 'menu' }
      '13-wait_1500' = @{ phase = 'loading' }
      '14-until_menu' = @{ etat = @{ attente = $false; phase = 'menu'; position = 3 } }
      '15-wait_7000' = @{ etat = @{ attente = $true; phase = 'menu'; position = 3 } }
      '16-ArrowUp' = @{ etat = @{ attente = $false; phase = 'menu'; position = 3 } }
    }
  }
  habillage = @{
    Reglages = @{ music = $false; game = 'off' }
    Simulee = 'backglass'
    # Média FullDMD habillé (illustration, cadre, DMD figé : framedFullDmd des essais) pour Neon Galaxy.
    Avant = {
      param($root)
      $folder = "$root\tables\Neon Galaxy (Williams 1992)"
      $info = "$folder\Neon Galaxy (Williams 1992).info"
      if (Test-Path -LiteralPath $info) { Copy-Item -LiteralPath $info "$folder\info.avant" -Force }
      node -e "const f = require('./packages/core/dist/test/fixtures.js'); const p = require('./packages/core/dist/png.js'); require('fs').writeFileSync(process.argv[1], p.encodePng(f.framedFullDmd({ width: 1920, height: 1080 }).image))" "$folder\medias\(FullDMD) Neon Galaxy (Williams 1992).png"
    }
    # La fenêtre du DMD posée dans le cadre pour cette table seule ; puis la table rendue telle quelle aux autres scénarios.
    Apres = {
      param($root, $captures)
      $folder = "$root\tables\Neon Galaxy (Williams 1992)"
      $ini = "$folder\Neon Galaxy (Williams 1992).ini"
      $problems = @()
      $text = if (Test-Path $ini) { Get-Content $ini -Raw } else { '' }
      if ($text -notmatch 'ScoreViewFullScreen = 0' -or $text -notmatch 'ScoreViewWndX = \d+' -or $text -notmatch 'ScoreViewHeight = \d+') { $problems += "fenêtre du DMD absente du .ini de la table : $text" }
      else { Write-Host "  .ini de la table : $(($text -split "`r?`n" | Where-Object { $_ -match '^ScoreView' }) -join ' · ')" }
      if (-not (Select-String -Path "$captures\sortie.txt" -Pattern 'Habillage FullDMD .* DMD posé dans le cadre' -Quiet)) { $problems += 'journal : DMD non posé dans le cadre' }
      Remove-Item $ini, "$folder\medias\(FullDMD) Neon Galaxy (Williams 1992).png" -ErrorAction SilentlyContinue
      # Le .info retient la place écrite (CyberPinball.fullDmd) : rendu tel qu'il était.
      $info = "$folder\Neon Galaxy (Williams 1992).info"
      if (Test-Path -LiteralPath "$folder\info.avant") { Move-Item -LiteralPath "$folder\info.avant" $info -Force } else { Remove-Item -LiteralPath $info -ErrorAction SilentlyContinue }
      $problems
    }
    Etapes = @(
      $Down, $Down, $Down, 'wait:1000', # 04 Neon Galaxy : son média FullDMD habillé sur l'écran du DMD
      $Start, $Start, 'wait:1500', # 07 chargement
      'until:playing',            # 08 partie, médias éteints : l'habillage reste sur l'écran du DMD
      'until:menu'                # 09 retour au menu
    )
    Attendu = @{
      '04-wait_1000' = @{ phase = 'menu'; couches = @{ 'dmd/dmd' = 'image' } }
      '08-until_playing' = @{ phase = 'playing'; couches = @{ 'dmd/dmd' = 'image figée' } }
      '09-until_menu' = @{ phase = 'menu'; couches = @{ 'dmd/dmd' = 'image' } }
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

# Lancement en cinéma : le menu dit quand VPX est parti (frontend.ts, play). Avec et sans le
# cinéma, ce doit être le même moment : après l'écran de chargement (CYBERPINBALL_LOADING_MS), jamais
# plus tard. Le premier relevé est gardé pour le comparer au second.
$script:lancements = @{}
function Test-Lancement([string]$Captures, [string]$Mode) {
  $line = Select-String -Path "$Captures\sortie.txt" -Pattern 'Lancement : VPX lancé (\d+) ms après le Start \(écran de chargement (\d+) ms(?:, captures des essais (\d+) ms)?, préparation (\d+) ms ; lancement en cinéma (\S+)\)' | Select-Object -First 1
  if (-not $line) { return 'journal : moment du lancement de VPX non relevé' }
  $g = $line.Matches[0].Groups
  $total = [int]$g[1].Value; $loading = [int]$g[2].Value; $shots = [int]('0' + $g[3].Value); $prep = [int]$g[4].Value; $seen = $g[5].Value
  # Ce qui n'est ni l'écran de chargement, ni les captures des essais, ni la préparation (écrans,
  # PuP-Pack, habillage) : rien ne doit attendre, à la gigue des minuteurs près.
  $other = $total - $loading - $shots - $prep
  "  VPX lancé $total ms après le Start : écran de chargement $loading ms, captures $shots ms, préparation $prep ms, reste $other ms (lancement en cinéma $seen)" | Write-Host
  $script:lancements[$Mode] = $other
  if ($seen -ne $Mode) { "journal : lancement en cinéma $seen au lieu de $Mode" }
  if ($loading -ne [int]$env:CYBERPINBALL_LOADING_MS) { "écran de chargement de $loading ms au lieu de $($env:CYBERPINBALL_LOADING_MS)" }
  if ($other -gt 150) { "VPX lancé $other ms après l'écran de chargement et la préparation : quelque chose l'a fait attendre" }
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
  if ($scene.Avant) { Push-Location $wt; try { & $scene.Avant $root } finally { Pop-Location } }

  $env:CYBERPINBALL_ROOT = $root
  $env:CYBERPINBALL_HOME = $home_
  $env:CYBERPINBALL_AUTOPILOT = $scene.Etapes -join ','
  $env:CYBERPINBALL_CAPTURE = $captures
  if ($scene.Simulee) { $env:CYBERPINBALL_PARTIE_SIMULEE = $scene.Simulee } else { Remove-Item Env:CYBERPINBALL_PARTIE_SIMULEE -ErrorAction SilentlyContinue }
  # Chargement de 16 s (2,5 s par défaut) puis 1,5 s avant la partie simulée : il couvre les deux
  # étapes qui le vérifient (Start, puis wait:1500) et leurs captures, jusqu'à 10 s chacune sur la
  # borne aux quatre écrans 4K. La partie et le retour au menu s'attendent par leur phase (until:).
  if ($scene.Simulee) { $env:CYBERPINBALL_LOADING_MS = '16000' } else { Remove-Item Env:CYBERPINBALL_LOADING_MS -ErrorAction SilentlyContinue }
  if ($scene.Flippers) { $env:CYBERPINBALL_FLIPPERS = $scene.Flippers } else { Remove-Item Env:CYBERPINBALL_FLIPPERS -ErrorAction SilentlyContinue }
  "`n=== $name"
  $line = "`"$electron`" app --user-data-dir=`"$dir\chromium`" > `"$captures\sortie.txt`" 2> `"$captures\erreurs.txt`""
  Start-Process -FilePath cmd.exe -ArgumentList '/d', '/c', "`"$line`"" -WorkingDirectory $wt -NoNewWindow -Wait
  Assert-HorsEcran $captures
  if ($scene.Apres) { foreach ($p in @(& $scene.Apres $root $captures)) { if ($p) { $failures += "$name : $p" } } }

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
    # Phase du menu attendue (loading, playing, menu) : une étape tombée dans la phase voisine
    # se voit ici, et non par une couche ou un son qui ne correspond pas.
    if ($want.phase) { $ok = $ok -and $menu.phase -eq $want.phase; if ($menu.phase -ne $want.phase) { $state += " (phase attendue : $($want.phase))" } }
    # Sons de l'interface joués jusque-là (ui-sounds.js), muets pendant la partie.
    if ($want.ContainsKey('interface')) {
      $played = @($got.interface.joues | ForEach-Object { $_.son }) -join ','
      $ok = $ok -and $played -eq $want.interface
      if ($want.ContainsKey('muet')) { $ok = $ok -and [bool]$got.interface.muet -eq $want.muet }
      if ($want.dernier) { $ok = $ok -and [math]::Abs(@($got.interface.joues)[-1].volume - $want.dernier) -lt 0.001 }
      $state += " · sons de l'interface : $(if ($played) { $played } else { 'aucun' })$(if ($got.interface.muet) { ' (muets)' })"
    }
    if ($want.commandes) { $ok = $ok -and $menu.commandes -eq $want.commandes; $state += " · aide-mémoire : $($menu.commandes)" }
    # Lancement en cinéma : scènes posées dans chaque fenêtre (sans celles qui s'effacent au relais).
    if ($want.cinema) {
      $cinemaParts = @()
      foreach ($win in ($want.cinema.Keys | Sort-Object)) {
        $shown = @($got.ecrans.$win.cinema | Where-Object { $_ -and -not $_.fin } | ForEach-Object { $_.scene }) -join ','
        $cinemaParts += "$win $(if ($shown) { $shown } else { 'aucune' })"
        if ($shown -ne $want.cinema[$win]) { $ok = $false; $cinemaParts[-1] += " (attendu : $(if ($want.cinema[$win]) { $want.cinema[$win] } else { 'aucune' }))" }
      }
      $state += " · cinéma : $($cinemaParts -join ', ')"
    }
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
  # Une étape until: dont la phase n'est jamais venue, une action introuvable : échec.
  Select-String -Path "$captures\sortie.txt" -Pattern '^Autopilote : ' | ForEach-Object { $failures += "$name : $($_.Line)" }
  Select-String -Path "$captures\sortie.txt" -Pattern '^Partie :' | ForEach-Object { "  $($_.Line)" }
}

if ((Get-FileHash "$Source\config\VPinballX.ini").Hash -ne $realHash) { throw 'Le vrai VPinballX.ini a changé !' }
if ((Get-FileHash "$Source\data\cabinet.json").Hash -ne $realModel) { throw 'Le vrai modèle de borne a changé !' }
if ($failures.Count) { throw "Moments du menu : $($failures.Count) échec(s)`n$($failures -join "`n")" }
"`nMoments du menu : tout est conforme. Vrai VPinballX.ini et vrai modèle de borne inchangés."
