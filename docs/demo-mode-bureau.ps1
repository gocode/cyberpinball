# Démonstration sans opérateur du mode bureau (menu système > « Bureau Windows », Ctrl+Maj+D),
# hors écran sur un bureau Windows caché, avec des tables inventées (docs\demo-captures.cjs).
# Pour chaque jeu d'écrans et chaque langue :
#   menu système : « Réglages de VPX » (touche R) et « Commandes de la borne » (touche H) au
#                  repos, puis « Bureau Windows » choisi, son raccourci à droite (Ctrl Maj D) ;
#   bascule      : Ctrl+Maj+D depuis le menu, puis de nouveau (retour) ; l'entrée du menu
#                  système, puis Ctrl+Maj+D (retour) ;
#   aide-mémoire : H, la ligne « Bureau Windows » et son raccourci.
# Le journal doit dire deux fois « tous les écrans libres » et deux fois « retour au menu » ;
# le garde-fou de mise en page (chevauchement, rognure, texte trop petit) et le guet hors
# écran doivent rester muets. Les voiles du gardien des écrans n'existent pas hors écran :
# leur rangement, et le cas d'un seul écran, sont fixés par packages\core\src\test\mode-bureau.test.ts (1 à 4 écrans).
# Jeux d'écrans : ceux qui ont un modèle de borne dans docs\demo-medias.cjs.
#   .\docs\demo-mode-bureau.ps1 [-Langues fr, en] [-Ecrans borne, poste-deux-ecrans]
# Captures dans tmp\demo-mode-bureau\<écrans>\<langue>\captures. VPX n'est jamais lancé ; ni le
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
$base = "$wt\tmp\demo-mode-bureau"
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

# Menu système : « Bureau Windows » est la troisième entrée en partant du bas (avant « Quitter
# Cyber Pinball » et « Retour aux tables ») ; trois flèches haut depuis la première y mènent.
$touches = @(
  'Escape', 'wait:1500',
  'Escape', 'wait:1200', 'ArrowUp', 'ArrowUp', 'ArrowUp',
  'Control+Shift+KeyD', 'wait:1200', 'Control+Shift+KeyD', 'wait:1200',
  'Escape', 'wait:1200', 'click:.lib-action:has(svg[data-icon="desktop"])', 'wait:1200', 'Control+Shift+KeyD', 'wait:1200',
  'KeyH', 'wait:800'
)

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
      $env:CYBERPINBALL_LANGUE = $langue
      $env:CYBERPINBALL_AUTOPILOT = $touches -join ','
      $env:CYBERPINBALL_CAPTURE = "$dossier\captures"
      if (Test-Path $env:CYBERPINBALL_CAPTURE) { Remove-Item -Recurse -Force $env:CYBERPINBALL_CAPTURE }
      Push-Location $wt
      try { $log = & $electron app 2>&1 | ForEach-Object { "$_" } } finally { Pop-Location }
      $log | Where-Object { $_ -match '^(Autopilote|Mise en page|Traduction manquante|Hors écran|Mode bureau)' } | ForEach-Object { Write-Host "   $_" }
      $id = "$jeu/$langue"
      if ($log -match 'Autopilote : aucun') { $failures += "$id : une action rejouée n'a pas trouvé son écran" }
      if ($log -match 'Traduction manquante') { $failures += "$id : texte sans traduction" }
      $libres = @($log | Where-Object { $_ -match '^Mode bureau : .*tous les écrans libres' }).Count
      $retours = @($log | Where-Object { $_ -match '^Mode bureau : retour au menu' }).Count
      if ($libres -ne 2 -or $retours -ne 2) { $failures += "$id : $libres passage(s) au bureau et $retours retour(s) au lieu de 2 et 2" }
      if ($log -match '^Mode bureau : .*(encore couvert|revenue sur son écran)') { $failures += "$id : une fenêtre est restée sur un écran au bureau" }
      Assert-HorsEcran $env:CYBERPINBALL_CAPTURE
      $report = "$env:CYBERPINBALL_CAPTURE\mise-en-page.txt"
      if (-not (Test-Path $report)) { $failures += "$id : relevé de mise en page absent" }
      elseif ((Get-Content $report -Raw -Encoding UTF8) -notmatch '^Aucun problème') { $failures += "$id : mise en page, voir $report" }
    }
  }
} finally {
  Remove-Item Env:CYBERPINBALL_LANGUE, Env:CYBERPINBALL_AUTOPILOT, Env:CYBERPINBALL_CAPTURE, Env:CYBERPINBALL_HOME, Env:CYBERPINBALL_ROOT -ErrorAction SilentlyContinue
}

if ($failures.Count) { throw "Démonstration du mode bureau en échec :`n  $($failures -join "`n  ")" }
"Captures dans $base\<écrans>\<langue>\captures."
