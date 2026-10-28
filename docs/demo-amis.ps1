# Démonstration sans opérateur du réseau des bornes (Menu système > Amis), hors écran sur un
# bureau Windows caché, avec des tables inventées (docs\demo-captures.cjs). Le réseau est le réseau
# simulé (CYBERPINBALL_RESEAU=simule) : un réseau d'essai HyperDHT et un réseau local en mémoire,
# sur 127.0.0.1 seulement, avec des bornes fictives (CYBERPINBALL_RESEAU_DEMO=1, app\src\social-demo.ts) :
# Bruno (ami, en partie, record battu), Chloé (demande d'ami), Dora (à proximité), Émile (ami hors
# ligne). Aucune borne réelle, aucun nœud d'amorçage public, aucune invite du pare-feu.
#   Parcours : la rubrique Amis, « Mes amis », la fiche de Bruno, « Trouver un joueur » (à
#   proximité, vus récemment), une recherche « chlo », « Demandes d'amis » et la demande de Chloé,
#   « Mes badges », « Partage et réseau ».
# Le garde-fou de mise en page (chevauchement, rognure, texte trop petit) et le guet hors écran
# doivent rester muets.
#   .\docs\demo-amis.ps1 [-Langues fr, en] [-Ecrans borne, poste-deux-ecrans]
# Captures dans tmp\demo-amis\<écrans>\<langue>\captures. VPX n'est jamais lancé.
param(
  [string[]]$Langues = @('fr', 'en'),
  [string[]]$Ecrans = @('borne', 'poste-deux-ecrans')
)
$ErrorActionPreference = 'Stop'
$wt = Split-Path $PSScriptRoot -Parent
. "$PSScriptRoot\hors-ecran.ps1"
# Tout le reste tourne sur un bureau Windows caché : rien ne peut apparaître sur les écrans du poste.
if (Enter-BureauCache $PSCommandPath $PSBoundParameters) { exit $LASTEXITCODE }
$base = "$wt\tmp\demo-amis"
$root = "$base\root"
$electron = node -p "require('electron')"
$failures = @()

Push-Location $wt
try { npm run build | Out-Null } finally { Pop-Location }

if (-not (Test-Path "$root\tables")) {
  '== tables inventées et leurs médias'
  Push-Location $wt
  try { & $electron docs\demo-captures.cjs $root 2>&1 | ForEach-Object { "   $_" } } finally { Pop-Location }
  if ($LASTEXITCODE -ne 0) { throw 'Génération des médias en échec.' }
}

$Exit = 'Escape'
# Libellés : ceux de la langue de l'essai (l'autopilote choisit une action par son libellé).
$libelles = @{
  'fr' = @{ Amis = 'Amis'; MesAmis = 'Mes amis'; Trouver = 'Trouver un joueur'; Chercher = 'Chercher un nom'; Demandes = 'Demandes d'; Badges = 'Mes badges'; Partage = 'Partage et réseau' }
  'en' = @{ Amis = 'Friends'; MesAmis = 'My friends'; Trouver = 'Find a player'; Chercher = 'Search for a name'; Demandes = 'Friend requests'; Badges = 'My badges'; Partage = 'Sharing and network' }
}

try {
  foreach ($jeu in $Ecrans) {
    Use-HorsEcran $jeu
    foreach ($langue in $Langues) {
      "== $jeu, $langue"
      $l = $libelles[$langue]
      # Au départ, le message « VPX n'est pas installé » (le bac à sable n'a pas VPX) : Exit le ferme,
      # Exit de nouveau ouvre le menu système ; les bornes fictives ont alors le temps de se relier.
      $etapes = @(
        'wait:1500', $Exit, 'wait:800', $Exit, 'wait:4000',
        "action:$($l.Amis)", "action:$($l.MesAmis)", 'wait:1200',
        'action:Bruno', 'wait:400', $Exit, 'wait:300', $Exit,
        "action:$($l.Trouver)", 'wait:600',
        "action:$($l.Chercher)", 'type:chlo', 'Enter', 'wait:400', $Exit, 'wait:300', $Exit,
        "action:$($l.Demandes)", 'action:Chlo', 'wait:300', $Exit, 'wait:300', $Exit,
        "action:$($l.Badges)", $Exit,
        "action:$($l.Partage)", 'wait:800'
      )
      $dossier = "$base\$jeu\$langue"
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
      $env:CYBERPINBALL_RESEAU_DEMO = '1'
      $env:CYBERPINBALL_AUTOPILOT = $etapes -join ','
      $env:CYBERPINBALL_CAPTURE = "$dossier\captures"
      if (Test-Path $env:CYBERPINBALL_CAPTURE) { Remove-Item -Recurse -Force $env:CYBERPINBALL_CAPTURE }
      Push-Location $wt
      try { $log = & $electron app 2>&1 | ForEach-Object { "$_" } } finally { Pop-Location }
      $log | Where-Object { $_ -match '^(Autopilote|Mise en page|Traduction manquante|Hors écran|Réseau)' } | ForEach-Object { Write-Host "   $_" }
      $id = "$jeu/$langue"
      if ($log -match 'Autopilote : aucun') { $failures += "$id : une action rejouée n'a pas trouvé son écran" }
      if ($log -match 'Traduction manquante') { $failures += "$id : texte sans traduction" }
      if (-not ($log -match 'Réseau des bornes : démarré \(simulated')) { $failures += "$id : le réseau simulé n'a pas démarré" }
      if ($log -match 'Réseau des bornes : démarré \(public') { $failures += "$id : le vrai réseau a démarré pendant l'essai" }
      Assert-HorsEcran $env:CYBERPINBALL_CAPTURE
      $report = "$env:CYBERPINBALL_CAPTURE\mise-en-page.txt"
      if (-not (Test-Path $report)) { $failures += "$id : relevé de mise en page absent" }
      elseif ((Get-Content $report -Raw -Encoding UTF8) -notmatch '^Aucun problème') { $failures += "$id : mise en page, voir $report" }
    }
  }
} finally {
  Remove-Item Env:CYBERPINBALL_LANGUE, Env:CYBERPINBALL_AUTOPILOT, Env:CYBERPINBALL_CAPTURE, Env:CYBERPINBALL_HOME, Env:CYBERPINBALL_ROOT, Env:CYBERPINBALL_RESEAU, Env:CYBERPINBALL_RESEAU_DEMO -ErrorAction SilentlyContinue
}

if ($failures.Count) { throw "Démonstration du réseau des bornes en échec :`n  $($failures -join "`n  ")" }
"Captures dans $base\<écrans>\<langue>\captures."
