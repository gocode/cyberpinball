# Démonstration sans opérateur du réseau des bornes (Menu système > Amis), hors écran sur un
# bureau Windows caché, avec des tables inventées (docs\demo-captures.cjs). Le réseau est le réseau
# simulé (CYBERPINBALL_RESEAU=simule) : un réseau d'essai HyperDHT et un réseau local en mémoire,
# sur 127.0.0.1 seulement, avec des bornes fictives (CYBERPINBALL_RESEAU_DEMO, app\src\social-demo.ts) :
# Bruno (ami, en partie, record battu, bibliothèque partagée), Chloé (demande d'ami), Dora (à
# proximité), Émile (ami hors ligne). Aucune borne réelle, aucun nœud d'amorçage public, aucune
# invite du pare-feu.
#   Parcours « amis » : la rubrique Amis, « Mes amis », la fiche de Bruno, « Trouver un joueur »
#   (à proximité, vus récemment), une recherche « chlo », « Demandes d'amis » et la demande de
#   Chloé, « Mes badges », « Partage et réseau », puis la bibliothèque de Bruno, sa table que la
#   borne n'a pas, prise tout entière jusqu'au plan d'ajout (jamais installée), puis celle que la
#   borne a aussi : ses parties au choix, et ses médias qui manquent, pris jusqu'au brouillon.
#   Parcours « partie » : Bruno invite la borne à une partie en direct ; l'invitation s'ouvre
#   d'elle-même sur le menu des tables ; accepter, le salon, le compte à rebours, la partie
#   (simulée : VPX n'est jamais lancé, CYBERPINBALL_PARTIE_SIMULEE), puis les résultats ; enfin
#   Menu système > Amis > « Historique des parties » (la partie qu'on vient de jouer, au-dessus de
#   deux soirées plus anciennes avec Émile) et le détail de cette partie. La racine a une fausse
#   installation de VPX (New-FauxVpx, docs\hors-ecran.ps1), jamais les vrais émulateurs.
#   Parcours « en-jeu » : Start lance une partie (simulée) ; Bruno invite la borne pendant qu'elle
#   joue : carillon, carte dans le coin du plateau (captures invitation-en-partie-full puis
#   -compact), puis, au retour au menu, l'invitation ouverte d'elle-même. Fausse installation de
#   VPX comme « partie ».
# Le garde-fou de mise en page (chevauchement, rognure, texte trop petit) et le guet hors écran
# doivent rester muets.
#   La bande de la partie entre amis, au parcours « partie » : sur la borne, les scores sur le DMD
#   (bande-partie-entre-amis-dmd.png) et les cartes sur le topper, que la partie simulée laisse
#   libre (bande-partie-entre-amis.png) ; au poste, le DMD seul (fronton occupé) ; sur un écran
#   (-Ecrans un-ecran), l'encart au bas du plateau. Jamais en haut du plateau.
#   .\docs\demo-amis.ps1 [-Parcours amis, partie, en-jeu] [-Langues fr, en] [-Ecrans borne, poste-deux-ecrans, un-ecran]
# Captures dans tmp\demo-amis\<parcours>\<écrans>\<langue>\captures.
#   .\docs\demo-amis.ps1 -Accueil [-Langues en, fr]
# Images de la rubrique Amis de la page d'accueil (README) : les deux parcours, sur l'écran
# « borne », tables et illustrations régénérées (docs\demo-captures.cjs, docs\demo-captures-medias),
# puis docs\images\<langue>\friends.webp (« Mes amis » et la fiche de Bruno), friends-library.webp
# (la bibliothèque de Bruno et sa table que la borne n'a pas) et live-game.webp (la partie en
# direct : l'invitation de Bruno, puis les résultats), playfield remis debout.
param(
  [string[]]$Parcours = @('amis', 'partie', 'en-jeu'),
  [string[]]$Langues = @('fr', 'en'),
  [string[]]$Ecrans = @('borne', 'poste-deux-ecrans'),
  [switch]$Accueil
)
$ErrorActionPreference = 'Stop'
$wt = Split-Path $PSScriptRoot -Parent
. "$PSScriptRoot\hors-ecran.ps1"
# Tout le reste tourne sur un bureau Windows caché : rien ne peut apparaître sur les écrans du poste.
if (Enter-BureauCache $PSCommandPath $PSBoundParameters) { exit $LASTEXITCODE }
# Parcours et écrans rejoués : -Accueil joue les deux parcours, sur l'écran « borne » seulement.
$parcoursJoues = $Parcours
$ecransJoues = $Ecrans
if ($Accueil) {
  if ($PSBoundParameters.ContainsKey('Ecrans') -and ($Ecrans -ne 'borne')) { throw '-Accueil : écrans « borne » seulement.' }
  $parcoursJoues = @('amis', 'partie')
  $ecransJoues = @('borne')
}
$base = "$wt\tmp\demo-amis"
$electron = node -p "require('electron')"
$failures = @()

Push-Location $wt
try { npm run build | Out-Null } finally { Pop-Location }

# Une racine par parcours ; celle de la partie a une fausse installation de VPX (New-FauxVpx).
# -Neuve : régénérée même si elle existe (illustrations de docs\demo-captures-medias ajoutées depuis).
function New-Racine([string]$Nom, [switch]$Vpx, [switch]$Neuve) {
  $root = "$base\racine-$Nom"
  # Une racine d'avant le 29/10/2026 voyait les vrais émulateurs par une jonction : retirée sans la
  # suivre, avant que la régénération (suppression récursive de la racine) ne passe.
  $emulators = "$root\emulators"
  if ((Test-Path $emulators) -and ((Get-Item $emulators -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { cmd /c rmdir "$emulators" }
  if ($Neuve -or -not (Test-Path "$root\tables")) {
    # Write-Host : la fonction ne rend que la racine.
    Write-Host "== tables inventées et leurs médias ($Nom)"
    Push-Location $wt
    try { & $electron docs\demo-captures.cjs $root 2>&1 | ForEach-Object { Write-Host "   $_" } } finally { Pop-Location }
    if ($LASTEXITCODE -ne 0) { throw 'Génération des médias en échec.' }
  }
  if ($Vpx) { New-FauxVpx $root }
  return $root
}

$Exit = 'Escape'
# Libellés : ceux de la langue de l'essai (l'autopilote choisit une action par son libellé).
$libelles = @{
  'fr' = @{ Plus = 'Répondre plus tard'; Amis = 'Amis'; MesAmis = 'Mes amis'; Historique = 'Historique des parties'; Trouver = 'Trouver un joueur'; Chercher = 'Chercher un nom'; Demandes = 'Demandes d'; Badges = 'Mes badges'; Partage = 'Partage et réseau'; Biblio = 'Voir sa bibliothèque'; Prendre = 'Récupérer le'; Toute = 'Récupérer toute la table'; Parties = 'Choisir les parties'; Accepter = 'Accepter'; Fermer = 'Fermer' }
  'en' = @{ Plus = 'Answer later'; Amis = 'Friends'; MesAmis = 'My friends'; Historique = 'Game history'; Trouver = 'Find a player'; Chercher = 'Search for a name'; Demandes = 'Friend requests'; Badges = 'My badges'; Partage = 'Sharing and network'; Biblio = 'See their library'; Prendre = 'Get the'; Toute = 'Get the whole table'; Parties = 'Choose parts'; Accepter = 'Accept'; Fermer = 'Close' }
}

function Get-Etapes([string]$Nom, $l) {
  if ($Nom -eq 'en-jeu') {
    # Le menu des tables, Start (la fiche, avec « Jouer avec un ami »), « Jouer » : la partie simulée
    # dure 24 s (CYBERPINBALL_PARTIE_MS). Bruno invite 1,5 s après l'avoir vue en partie : la carte,
    # puis la pastille après 12 s. Au retour au menu, l'invitation s'ouvre d'elle-même ; « Répondre
    # plus tard » la laisse.
    return @(
      'wait:1500', 'wait:7000', 'Enter', 'wait:800', 'action:Jouer',
      'until:playing', 'until:library', 'wait:2500',
      "action:$($l.Plus)", 'wait:800'
    )
  }
  if ($Nom -eq 'partie') {
    # Le menu des tables, puis l'invitation de Bruno (six secondes après l'amitié), ouverte d'elle-même ;
    # Bruno donne le départ peu après l'acceptation ; la partie simulée dure dix secondes. Puis
    # l'historique des parties (la partie jouée en tête, le curseur dessus) et son détail.
    return @(
      'wait:1500', 'wait:9000', 'wait:1000',
      "action:$($l.Accepter)", 'wait:1000', 'wait:4000',
      'until:playing', 'until:library', 'wait:2500',
      "action:$($l.Fermer)", 'wait:800',
      $Exit, 'wait:800', "action:$($l.Historique)", 'wait:800',
      'Enter', 'wait:800'
    )
  }
  # Au départ, le message « VPX n'est pas installé » (le bac à sable n'a pas VPX) : Exit le ferme,
  # Exit de nouveau ouvre le menu système ; les bornes fictives ont alors le temps de se relier.
  # L'apostrophe typographique par son code : Windows PowerShell la lit comme un guillemet.
  $ap = [char]0x2019
  return @(
    'wait:1500', $Exit, 'wait:800', $Exit, 'wait:4000',
    "action:$($l.Amis)", "action:$($l.MesAmis)", 'wait:1200',
    'action:Bruno', 'wait:400', $Exit, 'wait:300', $Exit,
    "action:$($l.Trouver)", 'wait:600',
    # Les résultats s'ouvrent dans la liste : Exit en sort, puis revient à « Trouver un joueur », puis à la rubrique.
    "action:$($l.Chercher)", 'type:chlo', 'Enter', 'wait:400', $Exit, 'wait:300', $Exit, 'wait:300', $Exit,
    "action:$($l.Demandes)", 'action:Chlo', 'wait:300', $Exit, 'wait:300', $Exit, 'wait:300', $Exit,
    "action:$($l.Badges)", $Exit,
    "action:$($l.Partage)", 'wait:800', $Exit,
    # Bibliothèque de Bruno : d'abord la table qu'on n'a pas, prise tout entière jusqu'au plan d'ajout
    # (jamais installée ici) ; puis celle qu'on a aussi (curseur dessus) : ses parties au choix, et ses médias.
    "action:$($l.MesAmis)", 'wait:400', 'action:Bruno', 'wait:400', "action:$($l.Biblio)", 'wait:2000',
    # La ROM ne se prend qu'après sa mention légale : « Prendre la ROM » sans l'attestation ne fait rien.
    'action:Glass Lagoon', 'wait:600', "action:$($l.Toute)", 'wait:2500',
    'action:ROM', 'wait:800', 'action:Prendre la ROM', 'wait:400', "action:J$($ap)atteste et je m$($ap)engage", 'wait:800', 'action:Prendre la ROM', 'wait:800',
    "action:$($l.Prendre)", 'wait:6000',
    $Exit, 'wait:800', $Exit, 'wait:800',
    'Enter', 'wait:600', "action:$($l.Parties)", 'wait:2500', $Exit, 'wait:600',
    "action:$($l.Prendre)", 'wait:4000'
  )
}

try {
  foreach ($nom in $parcoursJoues) {
    $root = New-Racine $nom -Vpx:($nom -in 'partie', 'en-jeu') -Neuve:$Accueil
    foreach ($jeu in $ecransJoues) {
      Use-HorsEcran $jeu
      foreach ($langue in $Langues) {
        "== $nom, $jeu, $langue"
        $l = $libelles[$langue]
        $dossier = "$base\$nom\$jeu\$langue"
        $home_ = "$dossier\home"
        if (Test-Path $home_) { Remove-Item -Recurse -Force $home_ }
        New-Item -ItemType Directory -Force "$home_\sandbox" | Out-Null
        Set-Content "$home_\sandbox\VPinballX.ini" '' -Encoding UTF8
        node "$PSScriptRoot\demo-medias.cjs" modele "$PSScriptRoot\ecrans\$jeu.json" "$home_\cabinet.json" "$home_\sandbox\VPinballX.ini" | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'Modèle de borne des écrans simulés impossible.' }
        $env:CYBERPINBALL_HOME = $home_
        $env:CYBERPINBALL_ROOT = $root
        $env:CYBERPINBALL_LANGUE = $langue
        $env:CYBERPINBALL_RESEAU = 'simule'
        $env:CYBERPINBALL_RESEAU_DEMO = if ($nom -in 'partie', 'en-jeu') { $nom } else { '1' }
        if ($nom -in 'partie', 'en-jeu') { $env:CYBERPINBALL_PARTIE_SIMULEE = 'backglass' } else { Remove-Item Env:CYBERPINBALL_PARTIE_SIMULEE -ErrorAction SilentlyContinue }
        if ($nom -eq 'en-jeu') { $env:CYBERPINBALL_PARTIE_MS = '24000' } else { Remove-Item Env:CYBERPINBALL_PARTIE_MS -ErrorAction SilentlyContinue }
        $env:CYBERPINBALL_AUTOPILOT = (Get-Etapes $nom $l) -join ','
        $env:CYBERPINBALL_CAPTURE = "$dossier\captures"
        if (Test-Path $env:CYBERPINBALL_CAPTURE) { Remove-Item -Recurse -Force $env:CYBERPINBALL_CAPTURE }
        Push-Location $wt
        try { $log = & $electron app 2>&1 | ForEach-Object { "$_" } } finally { Pop-Location }
        $log | Where-Object { $_ -match '^(Autopilote|Mise en page|Traduction manquante|Hors écran|Réseau|Partie en direct|Invitation pendant la partie|Bande de la partie|Bibliothèque partagée|Téléchargements)' } | ForEach-Object { Write-Host "   $_" }
        $id = "$nom/$jeu/$langue"
        if ($log -match 'Autopilote : (aucun|phase)') { $failures += "$id : une étape rejouée n'a pas trouvé son écran ou sa phase" }
        if ($log -match 'Traduction manquante') { $failures += "$id : texte sans traduction" }
        if (-not ($log -match 'Réseau des bornes : démarré \(simulated')) { $failures += "$id : le réseau simulé n'a pas démarré" }
        if ($log -match 'Réseau des bornes : démarré \(public') { $failures += "$id : le vrai réseau a démarré pendant l'essai" }
        # Deux réceptions (ses médias, puis toute sa table), chacune une ligne « fini » du gestionnaire (titre dans la langue de l'essai).
        if ($nom -eq 'amis' -and @($log | Select-String -Pattern 'Téléchargements : « .+ » fini \([1-9]\d* fichier\(s\)\)').Count -lt 2) { $failures += "$id : les médias ou la table de Bruno ne sont pas arrivés" }
        if ($nom -eq 'amis' -and ($log -match 'Téléchargements : .* en échec')) { $failures += "$id : une réception de Bruno a échoué" }
        # La partie finie est entrée à l'historique des parties, gardé sur la borne, après les deux soirées d'avant.
        if ($nom -eq 'partie') {
          if (-not ($log -match "Partie en direct : « .+ » à l'historique des parties")) { $failures += "$id : la partie n'est pas entrée à l'historique" }
          $parties = "$home_\amis\parties.json"
          if (-not (Test-Path $parties) -or @((Get-Content $parties -Raw -Encoding UTF8 | ConvertFrom-Json).games).Count -ne 3) { $failures += "$id : parties.json ne garde pas les trois parties" }
        }
        # La ROM attestée est arrivée avec la table ; le PuP-Pack, laissé sans attestation, jamais.
        if ($nom -eq 'amis') {
          $recus = @(Get-ChildItem -Recurse -File "$home_" -ErrorAction SilentlyContinue | Where-Object { $_.FullName -match '\\amis\\tables\\' })
          if (-not ($recus | Where-Object Name -eq 'glag_l1.zip')) { $failures += "$id : la ROM attestée de Bruno n'est pas arrivée" }
          if ($recus | Where-Object Name -eq 'screens.pup') { $failures += "$id : le PuP-Pack non attesté de Bruno est arrivé" }
        }
        if ($nom -eq 'partie') {
          # Où va la bande, selon les écrans : jamais sur le plateau quand le DMD ou un écran libre la porte.
          $bande = @{
            'borne' = @{ Place = 'topper \(cards'; Captures = @('bande-partie-entre-amis', 'bande-partie-entre-amis-dmd') }
            'poste-deux-ecrans' = @{ Place = 'aucune bande permanente, scores sur le DMD'; Captures = @('bande-partie-entre-amis-dmd') }
            'un-ecran' = @{ Place = 'playfield \(insert'; Captures = @('bande-partie-entre-amis') }
          }[$jeu]
          if ($bande) {
            if (-not ($log -match "Bande de la partie entre amis, place : $($bande.Place)")) { $failures += "$id : la bande n'est pas à sa place ($($bande.Place))" }
            foreach ($c in $bande.Captures) { if (-not (Test-Path "$env:CYBERPINBALL_CAPTURE\$c.png")) { $failures += "$id : pas de capture $c" } }
          }
          if ($log -match 'Bande de la partie entre amis( \(DMD\))? : (?!mise en page conforme)') { $failures += "$id : mise en page de la bande de la partie" }
        }
        if ($nom -eq 'en-jeu') {
          foreach ($etat in 'full', 'compact') {
            if (-not (Test-Path "$env:CYBERPINBALL_CAPTURE\invitation-en-partie-$etat.png")) { $failures += "$id : pas de capture de l'invitation pendant la partie ($etat)" }
          }
          if ($log -match 'Invitation pendant la partie \([a-z]+\) : (?!mise en page conforme)') { $failures += "$id : mise en page de l'invitation pendant la partie" }
        }
        Assert-HorsEcran $env:CYBERPINBALL_CAPTURE
        $report = "$env:CYBERPINBALL_CAPTURE\mise-en-page.txt"
        if (-not (Test-Path $report)) { $failures += "$id : relevé de mise en page absent" }
        elseif ((Get-Content $report -Raw -Encoding UTF8) -notmatch '^Aucun problème') { $failures += "$id : mise en page, voir $report" }
      }
    }
  }
} finally {
  Remove-Item Env:CYBERPINBALL_LANGUE, Env:CYBERPINBALL_AUTOPILOT, Env:CYBERPINBALL_CAPTURE, Env:CYBERPINBALL_HOME, Env:CYBERPINBALL_ROOT, Env:CYBERPINBALL_RESEAU, Env:CYBERPINBALL_RESEAU_DEMO, Env:CYBERPINBALL_PARTIE_SIMULEE, Env:CYBERPINBALL_PARTIE_MS -ErrorAction SilentlyContinue
}

if ($failures.Count) { throw "Démonstration du réseau des bornes en échec :`n  $($failures -join "`n  ")" }

# Images de la page d'accueil : deux écrans du playfield (couché, joueur au bord gauche de la
# capture) remis debout d'un quart de tour, côte à côte. Chaque capture est trouvée par l'étape
# du parcours qui la précède (NN-… : NN = rang de l'étape + 1, 00 étant le départ).
if ($Accueil) {
  '== images de docs\images (rubrique Amis)'
  function Find-Capture([string]$Captures, [string[]]$Etapes, [string]$Etape, [int]$Apres = 0) {
    $i = [array]::IndexOf($Etapes, $Etape)
    if ($i -lt 0) { throw "Étape absente du parcours : $Etape" }
    $file = Get-ChildItem $Captures -File -Filter ('{0:D2}-*.png' -f ($i + 1 + $Apres)) | Select-Object -First 1
    if (-not $file) { throw "Capture absente après l'étape $Etape ($Captures)." }
    return $file.FullName
  }
  function Write-Paire([string]$Out, [string]$Gauche, [string]$Droite) {
    $m = 28; $g = 24; $w = 720; $h = 1280
    $layer = { param($src, $x) @{ src = $src; x = $x; y = $m; w = $w; h = $h; turn = -1; radius = 10; border = '#24504a' } }
    $spec = "$base\planche.json"
    @{ out = $Out; width = 2 * $m + 2 * $w + $g; height = 2 * $m + $h; background = '#030807'; quality = 0.84; layers = @((& $layer $Gauche $m), (& $layer $Droite ($m + $w + $g))) } |
      ConvertTo-Json -Depth 6 | Set-Content $spec -Encoding UTF8
    Push-Location $wt
    try { & $electron docs\demo-captures.cjs --planche $spec 2>&1 | ForEach-Object { "   $_" } } finally { Pop-Location }
    if ($LASTEXITCODE -ne 0) { throw "Image impossible : $Out" }
  }
  foreach ($langue in $Langues) {
    $l = $libelles[$langue]
    $etapes = Get-Etapes 'amis' $l
    $c = "$base\amis\borne\$langue\captures"
    $out = "$wt\docs\images\$langue"
    New-Item -ItemType Directory -Force $out | Out-Null
    # « Mes amis » (Bruno en partie, son record ; Émile hors ligne) et la fiche de Bruno.
    Write-Paire "$out\friends.webp" (Find-Capture $c $etapes "action:$($l.MesAmis)" 1) (Find-Capture $c $etapes 'action:Bruno' 1)
    # La bibliothèque de Bruno, et sa table que la borne n'a pas : « Récupérer toute la table ».
    Write-Paire "$out\friends-library.webp" (Find-Capture $c $etapes "action:$($l.Biblio)" 1) (Find-Capture $c $etapes 'action:Glass Lagoon' 1)
    # Partie en direct : l'invitation de Bruno, ouverte d'elle-même, puis le départ commun (compte à rebours, joueurs prêts).
    $etapes = Get-Etapes 'partie' $l
    $c = "$base\partie\borne\$langue\captures"
    Write-Paire "$out\live-game.webp" (Find-Capture $c $etapes 'wait:9000' 1) (Find-Capture $c $etapes "action:$($l.Accepter)" 1)
  }
}
"Captures dans $base\<parcours>\<écrans>\<langue>\captures."
