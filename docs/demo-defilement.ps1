# Démonstration sans opérateur des listes qui défilent (écrans de gestion, .lib-actions),
# hors écran sur un bureau Windows caché, avec des tables inventées (docs\demo-captures.cjs).
# Pour chaque jeu d'écrans et chaque langue : les quatre rubriques du menu système (chaque
# liste part juste sous le titre, à la même hauteur), puis « Configuration de la borne »
# parcourue jusqu'en bas et remontée, une capture par touche : un filet marque le bord
# derrière lequel il reste des entrées, aucune ligne n'est effacée en fondu, l'entrée
# choisie est toujours entière. Le garde-fou de mise en page (fondu sur une liste qui
# défile, choix pas entier dans sa liste, chevauchement, rognure) et le guet hors écran
# doivent rester muets.
# Écrans simulés : borne (playfield 4K couché : rendu tourné d'un quart de tour) et
# poste-deux-ecrans (poste de bureau, playfield en paysage).
#   .\docs\demo-defilement.ps1 [-Langues fr, en] [-Ecrans borne, poste-deux-ecrans]
# Captures dans tmp\demo-defilement\<écrans>\<langue>\captures. VPX n'est jamais lancé ; ni le
# vrai modèle de borne ni le vrai VPinballX.ini ne sont lus ni touchés.
param(
  [string[]]$Langues = @('fr', 'en'),
  [string[]]$Ecrans = @('borne', 'poste-deux-ecrans')
)
$ErrorActionPreference = 'Stop'
$wt = Split-Path $PSScriptRoot -Parent
. "$PSScriptRoot\hors-ecran.ps1"
# Tout le reste tourne sur un bureau Windows caché : rien ne peut apparaître sur les écrans du poste.
if (Enter-BureauCache $PSCommandPath $PSBoundParameters) { exit $LASTEXITCODE }
$base = "$wt\tmp\demo-defilement"
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

function Invoke-Capture([string]$Dossier, [string]$Langue, [string]$Nom, [string[]]$Touches) {
  $env:CYBERPINBALL_LANGUE = $Langue
  $env:CYBERPINBALL_AUTOPILOT = $Touches -join ','
  $env:CYBERPINBALL_CAPTURE = "$Dossier\captures\$Nom"
  if (Test-Path $env:CYBERPINBALL_CAPTURE) { Remove-Item -Recurse -Force $env:CYBERPINBALL_CAPTURE }
  # Un message de Chromium sur stderr (« GPU state invalid… ») n'arrête pas la démonstration.
  Push-Location $wt
  $ErrorActionPreference = 'Continue'
  try { $log = & $electron app 2>&1 | ForEach-Object { "$_" } } finally { $ErrorActionPreference = 'Stop'; Pop-Location }
  $log | Where-Object { $_ -match '^(Autopilote|Mise en page|Traduction manquante|Hors écran)' } | ForEach-Object { Write-Host "   $_" }
  $id = "$(Split-Path (Split-Path $Dossier) -Leaf)/$Langue/$Nom"
  if ($log -match 'Autopilote : aucun') { $script:failures += "$id : une action rejouée n'a pas trouvé son écran" }
  if ($log -match 'Traduction manquante') { $script:failures += "$id : texte sans traduction" }
  Assert-HorsEcran $env:CYBERPINBALL_CAPTURE
  $report = "$env:CYBERPINBALL_CAPTURE\mise-en-page.txt"
  if (-not (Test-Path $report)) { $script:failures += "$id : relevé de mise en page absent" }
  elseif ((Get-Content $report -Raw -Encoding UTF8) -notmatch '^Aucun problème') { $script:failures += "$id : mise en page, voir $report" }
}

# Assez de touches pour aller au bout de la plus longue liste, et en revenir.
$bas = @(1..16 | ForEach-Object { 'ArrowDown' })
$haut = @(1..16 | ForEach-Object { 'ArrowUp' })

try {
  foreach ($jeu in $Ecrans) {
    Use-HorsEcran $jeu
    foreach ($langue in $Langues) {
      "== $jeu, $langue"
      $dossier = "$base\$jeu\$langue"
      $home_ = "$dossier\home"
      if (Test-Path $home_) { Remove-Item -Recurse -Force $home_ }
      New-Item -ItemType Directory -Force "$home_\sandbox" | Out-Null
      Set-Content "$home_\sandbox\VPinballX.ini" '' -Encoding UTF8
      node "$PSScriptRoot\demo-medias.cjs" modele "$PSScriptRoot\ecrans\$jeu.json" "$home_\cabinet.json" "$home_\sandbox\VPinballX.ini" | Out-Null
      if ($LASTEXITCODE -ne 0) { throw 'Modèle de borne des écrans simulés impossible.' }
      $env:CYBERPINBALL_HOME = $home_
      $env:CYBERPINBALL_ROOT = $root

      # VPX n'est pas installé : Exit (plus tard). Exit : le menu système ; chaque rubrique, Exit
      # remonte d'un cran. Puis « Configuration de la borne », jusqu'en bas et retour en haut.
      Invoke-Capture $dossier $langue 'defilement' (@(
          'Escape', 'wait:1500', 'Escape', 'wait:1500',
          'action:Tables', 'wait:600', 'Escape',
          'action:Médias', 'wait:600', 'Escape',
          'action:Borne', 'wait:600', 'Escape',
          'action:Cyber Pinball', 'wait:600', 'Escape',
          'action:Borne', 'wait:600', 'action:Configuration de la borne', 'wait:600'
        ) + $bas + $haut)
    }
  }
} finally {
  Remove-Item Env:CYBERPINBALL_LANGUE, Env:CYBERPINBALL_AUTOPILOT, Env:CYBERPINBALL_CAPTURE, Env:CYBERPINBALL_HOME, Env:CYBERPINBALL_ROOT -ErrorAction SilentlyContinue
}

if ($failures.Count) { throw "Démonstration des listes qui défilent en échec :`n  $($failures -join "`n  ")" }
"Captures dans $base\<écrans>\<langue>\captures."
