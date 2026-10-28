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
#   borne a aussi, et ses médias qui manquent, pris jusqu'au brouillon des médias.
#   Parcours « partie » : Bruno invite la borne à une partie en direct ; l'invitation s'ouvre
#   d'elle-même sur le menu des tables ; accepter, le salon, le compte à rebours, la partie
#   (simulée : VPX n'est jamais lancé, CYBERPINBALL_PARTIE_SIMULEE), puis les résultats. Les
#   émulateurs de la borne réelle (-Source) sont vus par une jonction, en lecture seule.
# Le garde-fou de mise en page (chevauchement, rognure, texte trop petit) et le guet hors écran
# doivent rester muets.
#   .\docs\demo-amis.ps1 [-Parcours amis, partie] [-Langues fr, en] [-Ecrans borne, poste-deux-ecrans]
# Captures dans tmp\demo-amis\<parcours>\<écrans>\<langue>\captures.
param(
  [string[]]$Parcours = @('amis', 'partie'),
  [string[]]$Langues = @('fr', 'en'),
  [string[]]$Ecrans = @('borne', 'poste-deux-ecrans'),
  [string]$Source = 'D:\CyberPinball'
)
$ErrorActionPreference = 'Stop'
$wt = Split-Path $PSScriptRoot -Parent
. "$PSScriptRoot\hors-ecran.ps1"
# Tout le reste tourne sur un bureau Windows caché : rien ne peut apparaître sur les écrans du poste.
if (Enter-BureauCache $PSCommandPath $PSBoundParameters) { exit $LASTEXITCODE }
$base = "$wt\tmp\demo-amis"
$electron = node -p "require('electron')"
$failures = @()

Push-Location $wt
try { npm run build | Out-Null } finally { Pop-Location }

# Une racine par parcours : celle de la partie voit les émulateurs de la borne réelle (jonction).
function New-Racine([string]$Nom, [switch]$Emulateurs) {
  $root = "$base\racine-$Nom"
  if (-not (Test-Path "$root\tables")) {
    # Write-Host : la fonction ne rend que la racine.
    Write-Host "== tables inventées et leurs médias ($Nom)"
    Push-Location $wt
    try { & $electron docs\demo-captures.cjs $root 2>&1 | ForEach-Object { Write-Host "   $_" } } finally { Pop-Location }
    if ($LASTEXITCODE -ne 0) { throw 'Génération des médias en échec.' }
  }
  if ($Emulateurs -and -not (Test-Path "$root\emulators")) {
    if (-not (Test-Path "$Source\emulators")) { throw "Émulateurs introuvables : $Source\emulators (-Source)." }
    New-Item -ItemType Junction -Path "$root\emulators" -Target "$Source\emulators" | Out-Null
  }
  return $root
}

$Exit = 'Escape'
# Libellés : ceux de la langue de l'essai (l'autopilote choisit une action par son libellé).
$libelles = @{
  'fr' = @{ Amis = 'Amis'; MesAmis = 'Mes amis'; Trouver = 'Trouver un joueur'; Chercher = 'Chercher un nom'; Demandes = 'Demandes d'; Badges = 'Mes badges'; Partage = 'Partage et réseau'; Biblio = 'Voir sa bibliothèque'; Prendre = 'Récupérer le'; Accepter = 'Accepter'; Fermer = 'Fermer' }
  'en' = @{ Amis = 'Friends'; MesAmis = 'My friends'; Trouver = 'Find a player'; Chercher = 'Search for a name'; Demandes = 'Friend requests'; Badges = 'My badges'; Partage = 'Sharing and network'; Biblio = 'See their library'; Prendre = 'Get the'; Accepter = 'Accept'; Fermer = 'Close' }
}

function Get-Etapes([string]$Nom, $l) {
  if ($Nom -eq 'partie') {
    # Le menu des tables, puis l'invitation de Bruno (six secondes après l'amitié), ouverte d'elle-même ;
    # Bruno donne le départ peu après l'acceptation ; la partie simulée dure dix secondes.
    return @(
      'wait:1500', 'wait:9000', 'wait:1000',
      "action:$($l.Accepter)", 'wait:1000', 'wait:4000',
      'until:playing', 'until:library', 'wait:2500',
      "action:$($l.Fermer)"
    )
  }
  # Au départ, le message « VPX n'est pas installé » (le bac à sable n'a pas VPX) : Exit le ferme,
  # Exit de nouveau ouvre le menu système ; les bornes fictives ont alors le temps de se relier.
  return @(
    'wait:1500', $Exit, 'wait:800', $Exit, 'wait:4000',
    "action:$($l.Amis)", "action:$($l.MesAmis)", 'wait:1200',
    'action:Bruno', 'wait:400', $Exit, 'wait:300', $Exit,
    "action:$($l.Trouver)", 'wait:600',
    "action:$($l.Chercher)", 'type:chlo', 'Enter', 'wait:400', $Exit, 'wait:300', $Exit,
    "action:$($l.Demandes)", 'action:Chlo', 'wait:300', $Exit, 'wait:300', $Exit,
    "action:$($l.Badges)", $Exit,
    "action:$($l.Partage)", 'wait:800', $Exit,
    # Bibliothèque de Bruno : la table qu'on a aussi vient en tête (curseur dessus), puis ses médias.
    "action:$($l.MesAmis)", 'wait:400', 'action:Bruno', 'wait:400', "action:$($l.Biblio)", 'wait:2000',
    'Enter', 'wait:600', "action:$($l.Prendre)", 'wait:4000'
  )
}

try {
  foreach ($nom in $Parcours) {
    $root = if ($nom -eq 'partie') { New-Racine $nom -Emulateurs } else { New-Racine $nom }
    foreach ($jeu in $Ecrans) {
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
        $env:CYBERPINBALL_RESEAU_DEMO = if ($nom -eq 'partie') { 'partie' } else { '1' }
        if ($nom -eq 'partie') { $env:CYBERPINBALL_PARTIE_SIMULEE = 'backglass' } else { Remove-Item Env:CYBERPINBALL_PARTIE_SIMULEE -ErrorAction SilentlyContinue }
        $env:CYBERPINBALL_AUTOPILOT = (Get-Etapes $nom $l) -join ','
        $env:CYBERPINBALL_CAPTURE = "$dossier\captures"
        if (Test-Path $env:CYBERPINBALL_CAPTURE) { Remove-Item -Recurse -Force $env:CYBERPINBALL_CAPTURE }
        Push-Location $wt
        try { $log = & $electron app 2>&1 | ForEach-Object { "$_" } } finally { Pop-Location }
        $log | Where-Object { $_ -match '^(Autopilote|Mise en page|Traduction manquante|Hors écran|Réseau|Partie en direct|Bibliothèque partagée)' } | ForEach-Object { Write-Host "   $_" }
        $id = "$nom/$jeu/$langue"
        if ($log -match 'Autopilote : (aucun|phase)') { $failures += "$id : une étape rejouée n'a pas trouvé son écran ou sa phase" }
        if ($log -match 'Traduction manquante') { $failures += "$id : texte sans traduction" }
        if (-not ($log -match 'Réseau des bornes : démarré \(simulated')) { $failures += "$id : le réseau simulé n'a pas démarré" }
        if ($log -match 'Réseau des bornes : démarré \(public') { $failures += "$id : le vrai réseau a démarré pendant l'essai" }
        if ($nom -eq 'amis' -and -not ($log -match 'Bibliothèque partagée : [1-9]')) { $failures += "$id : les médias de Bruno ne sont pas arrivés" }
        Assert-HorsEcran $env:CYBERPINBALL_CAPTURE
        $report = "$env:CYBERPINBALL_CAPTURE\mise-en-page.txt"
        if (-not (Test-Path $report)) { $failures += "$id : relevé de mise en page absent" }
        elseif ((Get-Content $report -Raw -Encoding UTF8) -notmatch '^Aucun problème') { $failures += "$id : mise en page, voir $report" }
      }
    }
  }
} finally {
  Remove-Item Env:CYBERPINBALL_LANGUE, Env:CYBERPINBALL_AUTOPILOT, Env:CYBERPINBALL_CAPTURE, Env:CYBERPINBALL_HOME, Env:CYBERPINBALL_ROOT, Env:CYBERPINBALL_RESEAU, Env:CYBERPINBALL_RESEAU_DEMO, Env:CYBERPINBALL_PARTIE_SIMULEE -ErrorAction SilentlyContinue
}

if ($failures.Count) { throw "Démonstration du réseau des bornes en échec :`n  $($failures -join "`n  ")" }
"Captures dans $base\<parcours>\<écrans>\<langue>\captures."
