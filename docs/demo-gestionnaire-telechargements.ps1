# Démonstration sans opérateur du gestionnaire de téléchargements (Menu système > Téléchargements),
# hors écran sur un bureau Windows caché, avec des tables inventées (docs\demo-captures.cjs) et le
# réseau simulé (CYBERPINBALL_RESEAU=simule, 127.0.0.1 seulement, bornes fictives d'app\src\social-demo.ts).
# Aucune borne réelle, aucun nœud d'amorçage public, aucune invite du pare-feu.
#   Premier démarrage (CYBERPINBALL_RESEAU_DEMO=coupure) : la bibliothèque de Bruno, sa table que la
#   borne n'a pas (24 Mo, envoyée à débit bridé), « Récupérer toute la table » ; la réception, puis
#   « Continuer en arrière-plan » ; la racine du menu système (Téléchargements en tête) ; la liste.
#   Bruno se déconnecte en plein envoi : la ligne passe « En attente de Bruno », sa fiche le dit.
#   Puis Cyber Pinball se ferme (la file est écrite).
#   Second démarrage (=retour) : le menu des tables et sa pastille « En attente » ; un clic ouvre la
#   liste ; Bruno revient quelques secondes plus tard ; l'envoi reprend là où il s'était arrêté
#   (Bruno ne renvoie que la suite), le fichier est vérifié en entier ; la ligne passe « Prêt », sa
#   fiche, puis « Revenir à… » : le plan d'ajout de la table reçue (jamais installée ici).
# Vérifié : la coupure et la reprise dans les journaux, l'envoi repris à partir d'un octet non nul,
# l'empreinte du fichier reçu égale à celle de Bruno, le garde-fou de mise en page muet, le guet
# hors écran muet.
#   .\docs\demo-gestionnaire-telechargements.ps1 [-Langues fr, en] [-Ecrans borne, poste-deux-ecrans]
# Captures dans tmp\demo-gestionnaire-telechargements\<écrans>\<langue>\<démarrage>\captures.
param(
  [string[]]$Langues = @('fr'),
  [string[]]$Ecrans = @('borne', 'poste-deux-ecrans')
)
$ErrorActionPreference = 'Stop'
$wt = Split-Path $PSScriptRoot -Parent
. "$PSScriptRoot\hors-ecran.ps1"
# Tout le reste tourne sur un bureau Windows caché : rien ne peut apparaître sur les écrans du poste.
if (Enter-BureauCache $PSCommandPath $PSBoundParameters) { exit $LASTEXITCODE }
$base = "$wt\tmp\demo-gestionnaire-telechargements"
$electron = node -p "require('electron')"
$failures = @()

Push-Location $wt
try { npm run build | Out-Null } finally { Pop-Location }

$root = "$base\racine"
if (-not (Test-Path "$root\tables")) {
  '== tables inventées et leurs médias'
  Push-Location $wt
  try { & $electron docs\demo-captures.cjs $root 2>&1 | ForEach-Object { "   $_" } } finally { Pop-Location }
  if ($LASTEXITCODE -ne 0) { throw 'Génération des médias en échec.' }
}

$Exit = 'Escape'
# Libellés : ceux de la langue de l'essai (l'autopilote choisit une action par son libellé).
$libelles = @{
  'fr' = @{ Amis = 'Amis'; MesAmis = 'Mes amis'; Biblio = 'Voir sa bibliothèque'; Toute = 'Récupérer toute la table'; Prendre = 'Récupérer le'; Fond = 'Continuer en arrière-plan'; Telechargements = 'Téléchargements'; Travail = 'Toute la table'; Revenir = 'Revenir à' }
  'en' = @{ Amis = 'Friends'; MesAmis = 'My friends'; Biblio = 'See their library'; Toute = 'Get the whole table'; Prendre = 'Get the'; Fond = 'Carry on in the background'; Telechargements = 'Downloads'; Travail = 'Whole table'; Revenir = 'Go back to' }
}

function Get-Etapes([string]$Demarrage, $l) {
  if ($Demarrage -eq 'coupure') {
    # Le message « VPX n'est pas installé » (bac à sable sans VPX) : Exit le ferme, Exit ouvre le menu système.
    return @(
      'wait:1500', $Exit, 'wait:800', $Exit, 'wait:4000',
      "action:$($l.Amis)", "action:$($l.MesAmis)", 'wait:1200', 'action:Bruno', 'wait:400', "action:$($l.Biblio)", 'wait:2500',
      'action:Glass Lagoon', 'wait:600', "action:$($l.Toute)", 'wait:2500', "action:$($l.Prendre)", 'wait:2000',
      "action:$($l.Fond)", 'wait:400',
      'click:.gear', 'wait:800',
      "action:$($l.Telechargements)", 'wait:1500',
      # Bruno se déconnecte après 9 Mo (environ 4 s d'envoi) : la ligne passe en attente.
      'wait:4000', 'wait:2000',
      "action:$($l.Travail)", 'wait:800'
    )
  }
  # Retour : le menu des tables (pastille), la liste ; Bruno revient après 7 s, l'envoi reprend et finit.
  return @(
    'wait:1500', $Exit, 'wait:1500',
    'click:.downloads-pill', 'wait:1500',
    'wait:9000', 'wait:6000', 'wait:6000', 'wait:4000',
    "action:$($l.Travail)", 'wait:800',
    "action:$($l.Revenir)", 'wait:3000'
  )
}

try {
  foreach ($jeu in $Ecrans) {
    Use-HorsEcran $jeu
    foreach ($langue in $Langues) {
      $l = $libelles[$langue]
      $dossier = "$base\$jeu\$langue"
      $home_ = "$dossier\home"
      # Une borne neuve pour chaque essai ; le second démarrage reprend la même (sa file, ses amis).
      if (Test-Path $home_) { Remove-Item -Recurse -Force $home_ }
      New-Item -ItemType Directory -Force "$home_\sandbox" | Out-Null
      Set-Content "$home_\sandbox\VPinballX.ini" '' -Encoding UTF8
      node "$PSScriptRoot\demo-medias.cjs" modele "$PSScriptRoot\ecrans\$jeu.json" "$home_\cabinet.json" "$home_\sandbox\VPinballX.ini" | Out-Null
      if ($LASTEXITCODE -ne 0) { throw 'Modèle de borne des écrans simulés impossible.' }
      $logs = @{}
      foreach ($demarrage in @('coupure', 'retour')) {
        "== $jeu, $langue, $demarrage"
        $env:CYBERPINBALL_HOME = $home_
        $env:CYBERPINBALL_ROOT = $root
        $env:CYBERPINBALL_LANGUE = $langue
        $env:CYBERPINBALL_RESEAU = 'simule'
        $env:CYBERPINBALL_RESEAU_DEMO = $demarrage
        $env:CYBERPINBALL_AUTOPILOT = (Get-Etapes $demarrage $l) -join ','
        $env:CYBERPINBALL_CAPTURE = "$dossier\$demarrage\captures"
        if (Test-Path $env:CYBERPINBALL_CAPTURE) { Remove-Item -Recurse -Force $env:CYBERPINBALL_CAPTURE }
        Push-Location $wt
        # Un message de Chromium sur stderr (« GPU state invalid… ») ne doit pas arrêter la démonstration.
        $ErrorActionPreference = 'Continue'
        try { $log = & $electron app 2>&1 | ForEach-Object { "$_" } } finally { $ErrorActionPreference = 'Stop'; Pop-Location }
        $log | Where-Object { $_ -match '^(Autopilote|Mise en page|Traduction manquante|Hors écran|Réseau|Téléchargements|Bibliothèque partagée|Bruno)' } | ForEach-Object { Write-Host "   $_" }
        $logs[$demarrage] = $log
        $id = "$jeu/$langue/$demarrage"
        if ($log -match 'Autopilote : (aucun|phase)') { $failures += "$id : une étape rejouée n'a pas trouvé son écran ou sa phase" }
        if ($log -match 'Traduction manquante') { $failures += "$id : texte sans traduction" }
        if (-not ($log -match 'Réseau des bornes : démarré \(simulated')) { $failures += "$id : le réseau simulé n'a pas démarré" }
        if ($log -match 'Réseau des bornes : démarré \(public') { $failures += "$id : le vrai réseau a démarré pendant l'essai" }
        Assert-HorsEcran $env:CYBERPINBALL_CAPTURE
        $report = "$env:CYBERPINBALL_CAPTURE\mise-en-page.txt"
        if (-not (Test-Path $report)) { $failures += "$id : relevé de mise en page absent" }
        elseif ((Get-Content $report -Raw -Encoding UTF8) -notmatch '^Aucun problème') { $failures += "$id : mise en page, voir $report" }
      }
      $id = "$jeu/$langue"
      if (-not ($logs['coupure'] -match 'Réseau simulé : Bruno se déconnecte')) { $failures += "$id : Bruno ne s'est pas déconnecté" }
      if (-not ($logs['coupure'] -match 'Téléchargements : .* en attente \(offline')) { $failures += "$id : le téléchargement n'est pas passé en attente de Bruno" }
      if (-not ($logs['retour'] -match 'Bruno : Bibliothèque partagée : envoi repris à partir de [1-9]\d* octets')) { $failures += "$id : l'envoi n'a pas repris là où il s'était arrêté" }
      if (-not ($logs['retour'] -match 'Téléchargements : .* fini')) { $failures += "$id : le téléchargement n'a pas fini après le retour de Bruno" }
      # Le fichier reçu est celui de Bruno, à l'octet près.
      $recu = Get-ChildItem $home_ -Recurse -Filter 'Glass Lagoon (Gulfstream 1993).vpx' -ErrorAction SilentlyContinue | Where-Object { $_.FullName -match '\\amis\\tables\\' } | Select-Object -First 1
      $source = Get-ChildItem "$home_" -Recurse -Filter 'Glass Lagoon (Gulfstream 1993).vpx' -ErrorAction SilentlyContinue | Where-Object { $_.FullName -match '\\reseau-simule\\Bruno\\' } | Select-Object -First 1
      if (-not $recu -or -not $source) { $failures += "$id : fichier reçu ou fichier de Bruno introuvable" }
      elseif ((Get-FileHash $recu.FullName -Algorithm SHA256).Hash -ne (Get-FileHash $source.FullName -Algorithm SHA256).Hash) { $failures += "$id : le fichier reçu n'est pas celui de Bruno" }
      else { "   Fichier reçu identique à celui de Bruno ($([math]::Round($recu.Length / 1MB, 1)) Mo)." }
    }
  }
} finally {
  Remove-Item Env:CYBERPINBALL_LANGUE, Env:CYBERPINBALL_AUTOPILOT, Env:CYBERPINBALL_CAPTURE, Env:CYBERPINBALL_HOME, Env:CYBERPINBALL_ROOT, Env:CYBERPINBALL_RESEAU, Env:CYBERPINBALL_RESEAU_DEMO -ErrorAction SilentlyContinue
}

if ($failures.Count) { throw "Démonstration du gestionnaire de téléchargements en échec :`n  $($failures -join "`n  ")" }
"Captures dans $base\<écrans>\<langue>\<démarrage>\captures."
