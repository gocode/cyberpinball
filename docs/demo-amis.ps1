# Démonstration sans opérateur du réseau des bornes (Menu système > Amis), hors écran sur un
# bureau Windows caché, avec des tables inventées (docs\demo-captures.cjs). Le réseau est le réseau
# simulé (CYBERPINBALL_RESEAU=simule) : un réseau d'essai HyperDHT et un réseau local en mémoire,
# sur 127.0.0.1 seulement, avec des bornes fictives (CYBERPINBALL_RESEAU_DEMO, app\src\social-demo.ts) :
# Bruno (ami, en partie, record battu, bibliothèque partagée), Chloé (demande d'ami), Dora (à
# proximité), Émile (ami hors ligne). Aucune borne réelle, aucun nœud d'amorçage public, aucune
# invite du pare-feu.
#   Parcours « amis » : Menu système > Tables > « Toutes les tables » et la fiche d'une table, l'ordre
#   des tables et la table au démarrage ; la rubrique Amis, « Mes amis », la fiche de Bruno, « Trouver un joueur »
#   (à proximité, vus récemment), une recherche « chlo », « Demandes d'amis » et la demande de
#   Chloé, « Mes badges », « Partage et réseau » (le débit des téléchargements limité puis levé), puis la bibliothèque de Bruno, sa table que la
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
#   Parcours « partie-coupure » : la partie de « partie », mais la liaison de Bruno tombe douze
#   secondes pendant l'attente du départ commun : le « prêt » de la borne se perd ; elle le renvoie
#   et part avec Bruno (« tous prêts »), sans attendre le délai des derniers (essai du 01/11/2026).
#   Parcours « partie-sans-releve » : la partie sur une table sans relevé de l'état de jeu (départ
#   manuel, pas de score en direct) : marquée dans l'invitation, « Partez ! » qui part seul au bout
#   de 4 s sans aucun événement de la partie, le score inconnu de la borne expliqué aux résultats.
#   Parcours « parties-enchainees » : trois parties à la suite avec Bruno, la même table deux fois
#   puis une autre (essai du 04/11/2026 : la deuxième ne finissait pas de charger). Chacune doit
#   partir (« tous prêts »), montrer « Partez ! » 4 s, et finir à l'historique ; jamais le garde-fou.
# Le garde-fou de mise en page (chevauchement, rognure, texte trop petit) et le guet hors écran
# doivent rester muets.
#   La bande de la partie entre amis, au parcours « partie » : les scores sur le DMD
#   (bande-partie-entre-amis-dmd.png) ; sur la borne, au poste et sur le PinCab (-Ecrans pincab : fronton pris par le B2S, FullDMD,
#   sans topper), les cartes sur le fronton, devant la table (bande-partie-entre-amis.png), et les
#   scores sur le DMD ; sur un écran (-Ecrans un-ecran), l'encart au bas du plateau. Jamais en haut du
#   plateau, jamais rien d'invisible. Puis le réglage
#   « Scores des amis pendant la partie ».
#   .\docs\demo-amis.ps1 [-Parcours amis, partie, en-jeu, partie-coupure, partie-sans-releve, parties-enchainees] [-Langues fr, en] [-Ecrans borne, poste-deux-ecrans, pincab, un-ecran]
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
  'fr' = @{ Plus = 'Répondre plus tard'; Amis = 'Amis'; MesAmis = 'Mes amis'; Historique = 'Historique des parties'; Trouver = 'Trouver un joueur'; Chercher = 'Chercher un nom'; Demandes = 'Demandes d'; Badges = 'Mes badges'; Partage = 'Partage et réseau'; Biblio = 'Voir sa bibliothèque'; Prendre = 'Récupérer le'; Toute = 'Récupérer toute la table'; Parties = 'Choisir les parties'; Accepter = 'Accepter'; Fermer = 'Fermer'; Retour = 'Retour'; Scores = 'Scores des amis'; Topper = 'Sur le topper'; Auto = 'Automatique'; Annee = 'Par année' }
  'en' = @{ Plus = 'Answer later'; Amis = 'Friends'; MesAmis = 'My friends'; Historique = 'Game history'; Trouver = 'Find a player'; Chercher = 'Search for a name'; Demandes = 'Friend requests'; Badges = 'My badges'; Partage = 'Sharing and network'; Biblio = 'See their library'; Prendre = 'Get the'; Toute = 'Get the whole table'; Parties = 'Choose parts'; Accepter = 'Accept'; Fermer = 'Close'; Retour = 'Back'; Scores = 'Friends'; Topper = 'On the topper'; Auto = 'Automatic'; Annee = 'By year' }
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
  if ($Nom -eq 'parties-enchainees') {
    # Trois fois : l'invitation de Bruno (attendue, il réinvite neuf secondes après chaque partie),
    # accepter, la partie simulée, ses résultats fermés.
    $une = @(
      "until-action:$($l.Accepter)", 'wait:1000',
      "action:$($l.Accepter)", 'wait:1000',
      'until:playing', 'until:library', 'wait:2500',
      "action:$($l.Fermer)", 'wait:800'
    )
    return @('wait:1500') + $une + $une + $une
  }
  if ($Nom -in 'partie-coupure', 'partie-sans-releve') {
    # La partie de « partie », jusqu'aux résultats : accepter l'invitation, le départ commun (sa
    # coupure, ou sa table sans relevé), la partie simulée, puis les résultats fermés.
    return @(
      'wait:1500', "until-action:$($l.Accepter)", 'wait:1000',
      "action:$($l.Accepter)", 'wait:1000', 'wait:4000',
      'until:playing', 'until:library', 'wait:2500',
      "action:$($l.Fermer)", 'wait:800'
    )
  }
  if ($Nom -eq 'partie') {
    # Le menu des tables, puis l'invitation de Bruno (six secondes après l'amitié, attendue tant que sa
    # liaison avec la borne se fait : until-action), ouverte d'elle-même ;
    # Bruno donne le départ peu après l'acceptation ; sa table charge six secondes (la borne l'attend :
    # départ commun), puis la partie simulée dure dix secondes. Puis l'historique des parties (la
    # partie jouée en tête, le curseur dessus) et son détail ; puis « Scores des amis pendant la
    # partie » (le DMD grisé : pas d'inspector de VPX ici), le topper choisi, et l'automatique remis.
    return @(
      'wait:1500', "until-action:$($l.Accepter)", 'wait:1000',
      "action:$($l.Accepter)", 'wait:1000', 'wait:4000',
      'until:playing', 'until:library', 'wait:2500',
      "action:$($l.Fermer)", 'wait:800',
      $Exit, 'wait:800', "action:$($l.Historique)", 'wait:800',
      'Enter', 'wait:800',
      "action:$($l.Retour)", 'wait:600', "action:$($l.Retour)", 'wait:800', "action:$($l.Scores)", 'wait:800',
      "action:$($l.Topper)", 'wait:800', "action:$($l.Auto)", 'wait:800'
    )
  }
  # Au départ, le message « VPX n'est pas installé » (le bac à sable n'a pas VPX) : Exit le ferme,
  # Exit de nouveau ouvre le menu système ; les bornes fictives ont alors le temps de se relier.
  # L'apostrophe typographique par son code : Windows PowerShell la lit comme un guillemet.
  $ap = [char]0x2019
  return @(
    'wait:1500', $Exit, 'wait:800', $Exit, 'wait:4000',
    # Menu système > Tables > « Toutes les tables » : la fiche d'une table (Start), Exit y ramène la
    # liste ; puis l'ordre des tables et la table au démarrage (Médias, son et attente).
    'action:Toutes les tables', 'wait:600', 'Enter', 'wait:600', $Exit, 'wait:600', 'action:Retour', 'wait:400',
    # Les étapes se séparent par des virgules : « Médias, son et attente » s'atteint par la rubrique Médias, puis son entrée « Médias… ».
    'action:Médias', 'wait:400', 'action:Médias', 'wait:400', 'action:Ordre des tables', 'wait:400', "action:$($l.Annee)", 'wait:400',
    'action:Table au démarrage', 'wait:400', 'action:Retour', 'wait:400',
    "action:$($l.Amis)", "action:$($l.MesAmis)", 'wait:1200',
    'action:Bruno', 'wait:400', $Exit, 'wait:300', $Exit,
    "action:$($l.Trouver)", 'wait:600',
    # Les résultats s'ouvrent dans la liste : Exit en sort, puis revient à « Trouver un joueur », puis à la rubrique.
    "action:$($l.Chercher)", 'type:chlo', 'Enter', 'wait:400', $Exit, 'wait:300', $Exit, 'wait:300', $Exit,
    "action:$($l.Demandes)", 'action:Chlo', 'wait:300', $Exit, 'wait:300', $Exit, 'wait:300', $Exit,
    "action:$($l.Badges)", $Exit,
    # La limite du débit des téléchargements : choisie, puis levée (la suite reçoit à pleine vitesse).
    "action:$($l.Partage)", 'wait:800', 'action:Limiter le débit des téléchargements', 'wait:600', 'action:1', 'wait:800',
    'action:Limiter le débit des téléchargements', 'wait:400', 'action:Sans limite', 'wait:600', $Exit,
    # Bibliothèque de Bruno : d'abord la table qu'on n'a pas, prise tout entière jusqu'au plan d'ajout
    # (jamais installée ici) ; puis celle qu'on a aussi (curseur dessus) : ses parties au choix, et ses médias.
    "action:$($l.MesAmis)", 'wait:400', 'action:Bruno', 'wait:400', "action:$($l.Biblio)", 'wait:2000',
    # La ROM ne se prend qu'après sa mention légale : « Prendre la ROM » sans l'attestation ne fait rien.
    'action:Glass Lagoon', 'wait:600', "action:$($l.Toute)", 'wait:2500',
    'action:ROM', 'wait:800', 'action:Prendre la ROM', 'wait:400', "action:J$($ap)atteste et je m$($ap)engage", 'wait:800', 'action:Prendre la ROM', 'wait:800',
    "action:$($l.Prendre)", 'wait:6000',
    $Exit, 'wait:800', $Exit, 'wait:800',
    # L'écran des parties s'ouvre dans sa liste : un Exit passe aux actions, le second en sort.
    'Enter', 'wait:600', "action:$($l.Parties)", 'wait:2500', $Exit, 'wait:600', $Exit, 'wait:600',
    "action:$($l.Prendre)", 'wait:4000'
  )
}

try {
  foreach ($nom in $parcoursJoues) {
    $partie = $nom -in 'partie', 'en-jeu', 'partie-coupure', 'partie-sans-releve', 'parties-enchainees'
    $root = New-Racine $nom -Vpx:$partie -Neuve:$Accueil
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
        $env:CYBERPINBALL_RESEAU_DEMO = if ($partie) { $nom } else { '1' }
        if ($partie) { $env:CYBERPINBALL_PARTIE_SIMULEE = 'backglass' } else { Remove-Item Env:CYBERPINBALL_PARTIE_SIMULEE -ErrorAction SilentlyContinue }
        # Table sans relevé : la partie simulée n'écrit aucun état de jeu (frontend.ts, SIMULATED_MANUAL).
        if ($nom -eq 'partie-sans-releve') { $env:CYBERPINBALL_PARTIE_SIMULEE_SANS_RELEVE = '1' } else { Remove-Item Env:CYBERPINBALL_PARTIE_SIMULEE_SANS_RELEVE -ErrorAction SilentlyContinue }
        if ($nom -eq 'en-jeu') { $env:CYBERPINBALL_PARTIE_MS = '24000' } else { Remove-Item Env:CYBERPINBALL_PARTIE_MS -ErrorAction SilentlyContinue }
        $env:CYBERPINBALL_AUTOPILOT = (Get-Etapes $nom $l) -join ','
        $env:CYBERPINBALL_CAPTURE = "$dossier\captures"
        if (Test-Path $env:CYBERPINBALL_CAPTURE) { Remove-Item -Recurse -Force $env:CYBERPINBALL_CAPTURE }
        Push-Location $wt
        # Son propre dossier Chromium, comme les autres démonstrations : une autre session qui fait tourner
        # Cyber Pinball en même temps ne lui prend pas son cache ; et une ligne de Chromium sur sa sortie
        # d'erreur reste une ligne du journal, pas une erreur du script.
        $ErrorActionPreference = 'Continue'
        try { $log = & $electron app "--user-data-dir=$dossier\chromium" 2>&1 | ForEach-Object { "$_" } } finally { $ErrorActionPreference = 'Stop'; Pop-Location }
        $log | Where-Object { $_ -match '^(Autopilote|Mise en page|Traduction manquante|Hors écran|Réseau|Partie en direct|Invitation pendant la partie|Bande de la partie|Départ commun|Bibliothèque partagée|Téléchargements)' } | ForEach-Object { Write-Host "   $_" }
        $id = "$nom/$jeu/$langue"
        if ($log -match 'Autopilote : (aucun|phase|action)') { $failures += "$id : une étape rejouée n'a pas trouvé son écran ou sa phase" }
        if ($log -match 'Traduction manquante') { $failures += "$id : texte sans traduction" }
        if (-not ($log -match 'Réseau des bornes : démarré \(simulated')) { $failures += "$id : le réseau simulé n'a pas démarré" }
        if ($log -match 'Réseau des bornes : démarré \(public') { $failures += "$id : le vrai réseau a démarré pendant l'essai" }
        # Deux réceptions (ses médias, puis toute sa table), chacune une ligne « fini » du gestionnaire (titre dans la langue de l'essai).
        if ($nom -eq 'amis' -and @($log | Select-String -Pattern 'Téléchargements : « .+ » fini \([1-9]\d* fichier\(s\)\)').Count -lt 2) { $failures += "$id : les médias ou la table de Bruno ne sont pas arrivés" }
        if ($nom -eq 'amis' -and ($log -match 'Téléchargements : .* en échec')) { $failures += "$id : une réception de Bruno a échoué" }
        # La partie finie est entrée à l'historique des parties, gardé sur la borne, après les deux soirées d'avant.
        if ($nom -in 'partie', 'partie-coupure', 'partie-sans-releve') {
          if (-not ($log -match "Partie en direct : « .+ » à l'historique des parties")) { $failures += "$id : la partie n'est pas entrée à l'historique" }
          $parties = "$home_\amis\parties.json"
          if (-not (Test-Path $parties) -or @((Get-Content $parties -Raw -Encoding UTF8 | ConvertFrom-Json).games).Count -ne 3) { $failures += "$id : parties.json ne garde pas les trois parties" }
        }
        if ($nom -eq 'parties-enchainees') {
          # Trois parties, chacune partie « tous prêts », « Partez ! » lisible et parti, à l'historique ;
          # aucune n'a eu besoin du garde-fou (le relevé simulé écrit la ligne vide d'avant la partie).
          $vus = @($log | Where-Object { $_ -match "^Départ commun : carte montrée [\d.]+ s en attente, « Partez ! » ([\d.]+) s ; partie : " })
          if ($vus.Count -ne 3) { $failures += "$id : $($vus.Count) départs montrés sur 3 parties" }
          foreach ($v in $vus) {
            if ($v -match '« Partez ! » ([\d.]+) s' -and ([double]$Matches[1] -lt 3.9 -or [double]$Matches[1] -gt 6)) { $failures += "$id : « Partez ! » montré $($Matches[1]) s (4 s attendues)" }
          }
          $tous = @($log | Where-Object { $_ -match "^Départ commun : « partez » reçu de l'hôte \(tous prêts\)" }).Count
          if ($tous -ne 3) { $failures += "$id : « partez » « tous prêts » reçu $tous fois sur 3" }
          if ($log -match 'prête quand même') { $failures += "$id : le garde-fou a dû dire une table prête (le relevé ne l'a pas dit)" }
          $parties = "$home_\amis\parties.json"
          if (-not (Test-Path $parties) -or @((Get-Content $parties -Raw -Encoding UTF8 | ConvertFrom-Json).games).Count -ne 5) { $failures += "$id : parties.json ne garde pas les cinq parties (deux d'avant, trois jouées)" }
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
            # Le fronton, même pris par la table (B2S simulé) : la bande y passe devant (essai du 04/11/2026).
            'borne' = @{ Place = 'backglass \(cards.*pourquoi : automatique : fronton \(pris par la table'; Captures = @('bande-partie-entre-amis', 'bande-partie-entre-amis-dmd') }
            'poste-deux-ecrans' = @{ Place = 'backglass \(cards.*scores sur le DMD'; Captures = @('bande-partie-entre-amis', 'bande-partie-entre-amis-dmd') }
            # Le PinCab : fronton pris par le B2S, FullDMD lu, pas de topper (essais des 02 et 04/11/2026).
            'pincab' = @{ Place = 'backglass \(cards.*scores sur le DMD.*pourquoi : automatique : fronton \(pris par la table, la bande passe devant\)'; Captures = @('bande-partie-entre-amis', 'bande-partie-entre-amis-dmd') }
            'un-ecran' = @{ Place = 'playfield \(insert'; Captures = @('bande-partie-entre-amis') }
          }[$jeu]
          if ($bande) {
            if (-not ($log -match "Bande de la partie entre amis, place : $($bande.Place)")) { $failures += "$id : la bande n'est pas à sa place ($($bande.Place))" }
            foreach ($c in $bande.Captures) { if (-not (Test-Path "$env:CYBERPINBALL_CAPTURE\$c.png")) { $failures += "$id : pas de capture $c" } }
          }
          if ($log -match 'Bande de la partie entre amis( \(DMD\))? : (?!mise en page conforme)') { $failures += "$id : mise en page de la bande de la partie" }
        }
        if ($nom -eq 'partie-coupure') {
          # La coupure a eu lieu, le « prêt » perdu a été renvoyé, et le départ s'est fait « tous prêts ».
          if (-not ($log -match "Réseau simulé : liaison de Bruno coupée")) { $failures += "$id : la liaison de Bruno n'a pas été coupée" }
          if (-not ($log -match "Départ commun : mon état « prêt » renvoyé à l'hôte")) { $failures += "$id : le « prêt » perdu n'a pas été renvoyé" }
          if (-not ($log -match "Départ commun : « partez » reçu de l'hôte \(tous prêts\)")) { $failures += "$id : « partez » pas reçu, ou par le délai des derniers" }
        }
        if ($nom -eq 'partie-sans-releve') {
          # La table sans relevé est dite avant la partie, prête à l'écran, et la partie finit quand même.
          if (-not ($log -match "Invitation de Bruno : ma table n'aura pas de relevé")) { $failures += "$id : l'invitation ne dit pas : départ manuel, pas de score en direct" }
          if (-not ($log -match "Partie en direct : ma table est prête \(sans relevé")) { $failures += "$id : la table sans relevé ne s'est pas dite prête" }
          if (-not ($log -match "Départ commun : mon état « done » envoyé à l'hôte")) { $failures += "$id : le retour de la borne n'est pas parti" }
        }
        if ($nom -in 'partie', 'partie-coupure', 'partie-sans-releve') {
          # Le départ commun : la borne prête attend Bruno (prêt cinq secondes après elle). Ce qui compte : le
          # joueur a vu l'attente, puis « Partez ! » assez longtemps pour le lire (le journal le mesure à l'écran,
          # pas à l'heure du signal), mise en page conforme ; et les deux captures.
          $vu = $log | Where-Object { $_ -match "^Départ commun : carte montrée ([\d.]+) s en attente, « Partez ! » ([\d.]+) s ; partie : " } | Select-Object -First 1
          if (-not $vu) { $failures += "$id : l'attente du départ commun n'a pas été montrée (attente et « Partez ! »)" }
          elseif ($vu -match 'montrée ([\d.]+) s en attente, « Partez ! » ([\d.]+) s') {
            if ([double]$Matches[1] -lt 1) { $failures += "$id : attente montrée $($Matches[1]) s seulement (Bruno est prêt cinq secondes après la borne)" }
            if ([double]$Matches[2] -lt 3.9) { $failures += "$id : « Partez ! » montré $($Matches[2]) s seulement (4 s attendues)" }
            # Essai réel du 01/11/2026 : « Partez ! » resté 90 s. La carte part d'elle-même, quoi qu'il arrive.
            if ([double]$Matches[2] -gt 6) { $failures += "$id : « Partez ! » resté $($Matches[2]) s (4 s attendues : la carte doit partir seule)" }
          }
          foreach ($c in 'depart-attente-commun', 'depart-partez-commun') { if (-not (Test-Path "$env:CYBERPINBALL_CAPTURE\$c.png")) { $failures += "$id : pas de capture $c" } }
          if ($log -match 'Départ commun \((attente|partez)\) : (?!mise en page conforme)') { $failures += "$id : mise en page de l'attente du départ commun" }
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
