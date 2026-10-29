# Démonstration sans opérateur des notifications du menu des tables (pastille des amis en ligne,
# une notification discrète à la fois), hors écran sur un bureau Windows caché, avec des tables
# inventées (docs\demo-captures.cjs) et le réseau simulé (CYBERPINBALL_RESEAU=simule, 127.0.0.1
# seulement, bornes fictives d'app\src\social-demo.ts, mode CYBERPINBALL_RESEAU_DEMO=notifications).
# Aucune borne réelle, aucun nœud d'amorçage public, aucune invite du pare-feu.
#   Au menu des tables : la demande d'ami de Chloé (attendue derrière le message du départ) ; la
#   pastille des amis ; David et Fanny, amis hors ligne, se connectent ensemble : une seule
#   notification pour les deux, la pastille passe à 3 ; Bruno lance une partie, puis bat son record.
#   Puis la table de Bruno (24 Mo, à débit bridé) : « Récupérer toute la table » ; pendant que
#   l'écran de réception est ouvert, Émile se connecte, Bruno gagne un badge et lance une autre
#   partie : rien ne s'y montre ; « Continuer en arrière-plan », retour au menu des tables : un seul
#   résumé ; la table finit pendant qu'on y est : « Téléchargement fini ».
# Vérifié : chaque notification attendue dessinée une fois (relevé de chaque capture, son.txt),
# aucune dans le menu système, le résumé à la première capture du retour, le garde-fou de mise en page muet à chaque étape (rien ne chevauche, rien n'est rogné,
# aucun texte sous 20 px), le guet hors écran muet.
#   .\docs\demo-notifications-roue.ps1 [-Langues fr, en] [-Ecrans borne, poste-deux-ecrans]
# Captures dans tmp\demo-notifications-roue\<écrans>\<langue>\captures.
param(
  [string[]]$Langues = @('fr'),
  [string[]]$Ecrans = @('borne', 'poste-deux-ecrans')
)
$ErrorActionPreference = 'Stop'
$wt = Split-Path $PSScriptRoot -Parent
. "$PSScriptRoot\hors-ecran.ps1"
# Tout le reste tourne sur un bureau Windows caché : rien ne peut apparaître sur les écrans du poste.
if (Enter-BureauCache $PSCommandPath $PSBoundParameters) { exit $LASTEXITCODE }
$base = "$wt\tmp\demo-notifications-roue"
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
# Libellés : ceux de la langue de l'essai (l'autopilote choisit une action par son libellé), et
# les notifications attendues dans le journal, dans l'ordre.
$libelles = @{
  'fr' = @{
    Amis = 'Amis'; MesAmis = 'Mes amis'; Biblio = 'Voir sa bibliothèque'; Toute = 'Récupérer toute la table'; Prendre = 'Récupérer le'; Fond = 'Continuer en arrière-plan'
    Attendues = @("Demande d’ami : Chloé", "2 amis viennent de se connecter", "Bruno lance une partie", "Nouveau record de Bruno", "3 nouveautés", "Téléchargement fini")
  }
  'en' = @{
    Amis = 'Friends'; MesAmis = 'My friends'; Biblio = 'See their library'; Toute = 'Get the whole table'; Prendre = 'Get the'; Fond = 'Carry on in the background'
    Attendues = @('Friend request: Chloé', '2 friends just came online', 'Bruno is starting a game', 'New record by Bruno', '3 new notifications', 'Download finished')
  }
}

# Horaire : celui des bornes fictives (social-demo.ts, NOTIFICATIONS_SCRIPT), à quelques secondes près.
function Get-Etapes($l) {
  $regarder = { param([int]$n) @(1..$n | ForEach-Object { 'wait:2000' }) }
  return @(
    # Le message « VPX n'est pas installé » (bac à sable sans VPX) : Exit le ferme ; la demande de Chloé attendait.
    'wait:1500', $Exit
  ) + (& $regarder 17) + @(
    # La table de Bruno, en arrière-plan, puis retour au menu des tables (elle y finit une trentaine de secondes plus tard).
    $Exit, 'wait:800', "action:$($l.Amis)", "action:$($l.MesAmis)", 'wait:1200', 'action:Bruno', 'wait:400', "action:$($l.Biblio)", 'wait:2500',
    'action:Glass Lagoon', 'wait:600', "action:$($l.Toute)", 'wait:2500', "action:$($l.Prendre)", 'wait:2000', "action:$($l.Fond)", 'wait:400',
    'leave', 'until:menu'
  ) + (& $regarder 18)
}

try {
  foreach ($jeu in $Ecrans) {
    Use-HorsEcran $jeu
    foreach ($langue in $Langues) {
      $l = $libelles[$langue]
      $dossier = "$base\$jeu\$langue"
      $home_ = "$dossier\home"
      # Une borne neuve pour chaque essai.
      if (Test-Path $home_) { Remove-Item -Recurse -Force $home_ }
      New-Item -ItemType Directory -Force "$home_\sandbox" | Out-Null
      Set-Content "$home_\sandbox\VPinballX.ini" '' -Encoding UTF8
      node "$PSScriptRoot\demo-medias.cjs" modele "$PSScriptRoot\ecrans\$jeu.json" "$home_\cabinet.json" "$home_\sandbox\VPinballX.ini" | Out-Null
      if ($LASTEXITCODE -ne 0) { throw 'Modèle de borne des écrans simulés impossible.' }
      "== $jeu, $langue"
      $env:CYBERPINBALL_HOME = $home_
      $env:CYBERPINBALL_ROOT = $root
      $env:CYBERPINBALL_LANGUE = $langue
      $env:CYBERPINBALL_RESEAU = 'simule'
      $env:CYBERPINBALL_RESEAU_DEMO = 'notifications'
      $env:CYBERPINBALL_AUTOPILOT = (Get-Etapes $l) -join ','
      $env:CYBERPINBALL_CAPTURE = "$dossier\captures"
      if (Test-Path $env:CYBERPINBALL_CAPTURE) { Remove-Item -Recurse -Force $env:CYBERPINBALL_CAPTURE }
      Push-Location $wt
      # Un message de Chromium sur stderr (« GPU state invalid… ») ne doit pas arrêter la démonstration.
      $ErrorActionPreference = 'Continue'
      try { $log = & $electron app 2>&1 | ForEach-Object { "$_" } } finally { $ErrorActionPreference = 'Stop'; Pop-Location }
      $log | Where-Object { $_ -match '^(Autopilote|Mise en page|Traduction manquante|Hors écran|Réseau|Notifications|Téléchargements)' } | ForEach-Object { Write-Host "   $_" }
      $id = "$jeu/$langue"
      if ($log -match 'Autopilote : (aucun|phase)') { $failures += "$id : une étape rejouée n'a pas trouvé son écran ou sa phase" }
      if ($log -match 'Traduction manquante') { $failures += "$id : texte sans traduction" }
      if (-not ($log -match 'Réseau des bornes : démarré \(simulated')) { $failures += "$id : le réseau simulé n'a pas démarré" }
      if ($log -match 'Réseau des bornes : démarré \(public') { $failures += "$id : le vrai réseau a démarré pendant l'essai" }
      # Ce que chaque capture montre vraiment (window.cyberEtat, relevé dans son.txt) : chaque
      # notification attendue dessinée ; rien dans le menu système ; le résumé dès le retour.
      $etapes = @(Get-Content "$env:CYBERPINBALL_CAPTURE\son.txt" -Encoding UTF8 | ForEach-Object {
        $nom, $json = $_ -split ' : ', 2
        $pf = ($json | ConvertFrom-Json).ecrans.playfield
        [pscustomobject]@{ Nom = $nom; Phase = $pf.phase; Titre = $pf.notification.titre; Amis = $pf.amisEnLigne }
      })
      # L'ordre des premières dépend de la vitesse du réseau simulé (le retour du couple) : comparées sans ordre.
      $vus = @($etapes | Where-Object Titre | ForEach-Object Titre | Select-Object -Unique)
      if ((($vus | Sort-Object) -join ' | ') -ne (($l.Attendues | Sort-Object) -join ' | ')) { $failures += "$id : notifications dessinées « $($vus -join ' | ') », attendues « $($l.Attendues -join ' | ') »" }
      if (@($etapes | Where-Object { $_.Phase -ne 'menu' -and $_.Titre }).Count) { $failures += "$id : une notification dessinée hors du menu des tables" }
      $retour = $etapes | Where-Object { $_.Nom -match '-leave$' } | Select-Object -First 1
      if (-not $retour -or $retour.Titre -ne $l.Attendues[-2]) { $failures += "$id : pas de résumé au retour au menu des tables ($($retour.Titre))" }
      if (-not ($etapes | Where-Object { $_.Amis -ge 3 })) { $failures += "$id : la pastille des amis n'a jamais compté 3 amis en ligne" }
      Assert-HorsEcran $env:CYBERPINBALL_CAPTURE
      $report = "$env:CYBERPINBALL_CAPTURE\mise-en-page.txt"
      if (-not (Test-Path $report)) { $failures += "$id : relevé de mise en page absent" }
      elseif ((Get-Content $report -Raw -Encoding UTF8) -notmatch '^Aucun problème') { $failures += "$id : mise en page, voir $report" }
      # Le téléchargement de la table de Bruno a fini en arrière-plan.
      if (-not ($log -match 'Téléchargements : .* fini')) { $failures += "$id : la table de Bruno n'a pas fini de se télécharger" }
    }
  }
} finally {
  Remove-Item Env:CYBERPINBALL_LANGUE, Env:CYBERPINBALL_AUTOPILOT, Env:CYBERPINBALL_CAPTURE, Env:CYBERPINBALL_HOME, Env:CYBERPINBALL_ROOT, Env:CYBERPINBALL_RESEAU, Env:CYBERPINBALL_RESEAU_DEMO -ErrorAction SilentlyContinue
}

if ($failures.Count) { throw "Démonstration des notifications en échec :`n  $($failures -join "`n  ")" }
"Captures dans $base\<écrans>\<langue>\captures."
