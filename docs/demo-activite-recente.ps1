# Démonstration sans opérateur d'« Activité récente » (Menu système > Activité récente), hors écran
# sur un bureau Windows caché, avec des tables inventées (docs\demo-captures.cjs) et le réseau
# simulé (CYBERPINBALL_RESEAU=simule, 127.0.0.1 seulement, bornes fictives d'app\src\social-demo.ts,
# mode CYBERPINBALL_RESEAU_DEMO=notifications). Aucune borne réelle, aucun nœud d'amorçage public,
# aucune invite du pare-feu.
#   La borne a déjà un journal (activite.json préparé : hier, une invitation de Bruno expirée, un
#   téléchargement bloqué retiré depuis de la liste ; avant-hier, Cyber Pinball 0.1.9 disponible).
#   Le message du départ fermé, on ouvre aussitôt le menu système et on y reste : les bornes
#   fictives envoient leurs nouvelles (la demande d'ami de Chloé, Bruno qui lance une partie et bat
#   son record ; David et Fanny se connectent aussi, mais pendant que la borne cherche encore ses
#   amis : ce n'est pas une nouvelle, menu-notices.ts). Dans le menu système, rien de cela ne se
#   montre : tout attend. « Activité récente », en tête et à pastille rouge, montre tout en entier,
#   par jour : ce qui n'a pas été dit marqué « Non lu », les lignes d'hier grisées avec leur raison. Le curseur
#   descend ligne par ligne (chacune devient lue), puis Retour au menu des tables.
# Vérifié : le réseau simulé seul ; chaque nouvelle consignée ; l'écran ouvert avec ses lignes et du
# non lu ; plus rien de non lu une fois toutes parcourues (le journal relu après la fermeture) ; le
# garde-fou de mise en page muet à chaque étape (rien ne chevauche, rien n'est rogné, aucun texte
# sous 20 px) ; le guet hors écran muet.
#   .\docs\demo-activite-recente.ps1 [-Langues fr, en] [-Ecrans borne, poste-deux-ecrans, pivote]
#   borne : la borne debout (plateau en portrait) ; poste-deux-ecrans : le bureau ; pivote : le
#   plateau couché, flippers à gauche (mise en page tournée pour le joueur).
# Captures dans tmp\demo-activite-recente\<écrans>\<langue>\captures.
param(
  [string[]]$Langues = @('fr', 'en'),
  [string[]]$Ecrans = @('borne', 'poste-deux-ecrans', 'pivote')
)
$ErrorActionPreference = 'Stop'
$wt = Split-Path $PSScriptRoot -Parent
. "$PSScriptRoot\hors-ecran.ps1"
# Tout le reste tourne sur un bureau Windows caché : rien ne peut apparaître sur les écrans du poste.
if (Enter-BureauCache $PSCommandPath $PSBoundParameters) { exit $LASTEXITCODE }
$base = "$wt\tmp\demo-activite-recente"
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
$Bas = 'ShiftRight'
$libelles = @{
  'fr' = @{ Activite = 'Activité récente' }
  'en' = @{ Activite = 'Recent activity' }
}

# Le journal d'avant : des lignes d'hier et d'avant-hier, dont les actions ne valent plus.
function Write-JournalAncien([string]$dir, [string]$langue) {
  # La cause d'un blocage est écrite dans la langue du moment où il arrive (downloadReasonText) : celle de l'essai.
  $cause = if ($langue -eq 'en') { 'the page asks you to sign in again' } else { 'la page demande de se reconnecter' }
  $now = [DateTimeOffset]::Now
  $jour = { param($d) $d.LocalDateTime.ToString('yyyy-MM-dd') }
  $hier = $now.AddDays(-1).Date.AddHours(21).AddMinutes(12)
  $hier = [DateTimeOffset]::new($hier)
  $bloque = [DateTimeOffset]::new($now.AddDays(-1).Date.AddHours(15).AddMinutes(44))
  $avant = [DateTimeOffset]::new($now.AddDays(-2).Date.AddHours(18).AddMinutes(5))
  $bruno = 'b' * 64
  $entries = @(
    [ordered]@{ id = "live-invite|eeeeeeeeeeeeeeee|0|$(& $jour $hier)"; kind = 'live-invite'; key = 'eeeeeeeeeeeeeeee|0'; at = $hier.ToUnixTimeMilliseconds(); count = 1; times = @($hier.ToUnixTimeMilliseconds()); read = $true; who = 'Bruno'; player = $bruno; subject = 'Glass Lagoon (Original 2026)' },
    [ordered]@{ id = "download-failed|ancien|$(& $jour $bloque)"; kind = 'download-failed'; key = 'ancien'; at = $bloque.ToUnixTimeMilliseconds(); count = 1; times = @($bloque.ToUnixTimeMilliseconds()); read = $false; subject = 'cv_20h'; extra = $cause; from = 'vpforums.org' },
    [ordered]@{ id = "update-available|0.1.9|$(& $jour $avant)"; kind = 'update-available'; key = '0.1.9'; at = $avant.ToUnixTimeMilliseconds(); count = 1; times = @($avant.ToUnixTimeMilliseconds()); read = $true; version = '0.1.9'; previous = '0.1.8' }
  )
  [ordered]@{ v = 1; entries = $entries } | ConvertTo-Json -Depth 6 | Set-Content "$dir\activite.json" -Encoding UTF8
}

function Get-Etapes($l) {
  $regarder = { param([int]$n) @(1..$n | ForEach-Object { 'wait:2000' }) }
  return @(
    # Le message « VPX n'est pas installé » (bac à sable sans VPX) : Exit le ferme ; puis le menu système, où l'on reste.
    'wait:1500', $Exit, 'wait:600', $Exit
  ) + (& $regarder 19) + @(
    "action:$($l.Activite)", 'wait:1200', $Bas, $Bas, $Bas, $Bas, $Bas, $Bas, $Bas, $Bas, 'wait:600',
    'leave', 'until:menu'
  ) + (& $regarder 3)
}

try {
  foreach ($scene in $Ecrans) {
    $jeu = if ($scene -eq 'pivote') { 'poste-deux-ecrans' } else { $scene }
    Use-HorsEcran $jeu
    if ($scene -eq 'pivote') { $env:CYBERPINBALL_FLIPPERS = 'left' } else { Remove-Item Env:CYBERPINBALL_FLIPPERS -ErrorAction SilentlyContinue }
    foreach ($langue in $Langues) {
      $l = $libelles[$langue]
      $dossier = "$base\$scene\$langue"
      $home_ = "$dossier\home"
      # Une borne neuve pour chaque essai.
      if (Test-Path $home_) { Remove-Item -Recurse -Force $home_ }
      New-Item -ItemType Directory -Force "$home_\sandbox" | Out-Null
      Set-Content "$home_\sandbox\VPinballX.ini" '' -Encoding UTF8
      node "$PSScriptRoot\demo-medias.cjs" modele "$PSScriptRoot\ecrans\$jeu.json" "$home_\cabinet.json" "$home_\sandbox\VPinballX.ini" | Out-Null
      if ($LASTEXITCODE -ne 0) { throw 'Modèle de borne des écrans simulés impossible.' }
      Write-JournalAncien $home_ $langue
      "== $scene, $langue"
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
      $log | Where-Object { $_ -match '^(Autopilote|Mise en page|Traduction manquante|Hors écran|Réseau|Activité récente)' } | ForEach-Object { Write-Host "   $_" }
      $id = "$scene/$langue"
      if ($log -match 'Autopilote : (aucun|phase|action)') { $failures += "$id : une étape rejouée n'a pas trouvé son écran ou sa phase" }
      if ($log -match 'Traduction manquante') { $failures += "$id : texte sans traduction" }
      if (-not ($log -match 'Réseau des bornes : démarré \(simulated')) { $failures += "$id : le réseau simulé n'a pas démarré" }
      if ($log -match 'Réseau des bornes : démarré \(public') { $failures += "$id : le vrai réseau a démarré pendant l'essai" }
      # Les connexions de David et Fanny, arrivées pendant la recherche des amis, ne sont pas des nouvelles : pas exigées.
      foreach ($kind in 'friend-request', 'friend-playing', 'friend-record') {
        if (-not ($log -match "Activité récente : $kind consigné")) { $failures += "$id : $kind jamais consigné" }
      }
      $ouverte = $log | Where-Object { $_ -match 'Activité récente : ouverte, (\d+) lignes, (\d+) non lues' } | Select-Object -First 1
      if (-not $ouverte) { $failures += "$id : l'écran Activité récente ne s'est pas ouvert" }
      # Au moins les 3 lignes d'avant et 3 nouvelles ; le blocage d'hier, jamais vu, toujours non lu (les nouvelles dites au menu avant son ouverture sont lues).
      elseif ([int]$Matches[1] -lt 6 -or [int]$Matches[2] -lt 1) { $failures += "$id : écran ouvert avec trop peu de lignes ou de non lu ($ouverte)" }
      # Toutes parcourues : plus rien de non lu (le journal relu après la fermeture).
      $journal = Get-Content "$home_\activite.json" -Raw -Encoding UTF8 | ConvertFrom-Json
      $restent = @($journal.entries | Where-Object { -not $_.read })
      if ($restent.Count) { $failures += "$id : $($restent.Count) ligne(s) encore non lue(s) après les avoir toutes parcourues : $(($restent | ForEach-Object kind) -join ', ')" }
      Assert-HorsEcran $env:CYBERPINBALL_CAPTURE
      $report = "$env:CYBERPINBALL_CAPTURE\mise-en-page.txt"
      if (-not (Test-Path $report)) { $failures += "$id : relevé de mise en page absent" }
      elseif ((Get-Content $report -Raw -Encoding UTF8) -notmatch '^Aucun problème') { $failures += "$id : mise en page, voir $report" }
    }
  }
} finally {
  Remove-Item Env:CYBERPINBALL_LANGUE, Env:CYBERPINBALL_AUTOPILOT, Env:CYBERPINBALL_CAPTURE, Env:CYBERPINBALL_HOME, Env:CYBERPINBALL_ROOT, Env:CYBERPINBALL_RESEAU, Env:CYBERPINBALL_RESEAU_DEMO, Env:CYBERPINBALL_FLIPPERS -ErrorAction SilentlyContinue
}

if ($failures.Count) { throw "Démonstration d'Activité récente en échec :`n  $($failures -join "`n  ")" }
"Captures dans $base\<écrans>\<langue>\captures."
