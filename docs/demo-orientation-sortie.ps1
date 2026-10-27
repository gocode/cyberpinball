# Démonstration sans opérateur de l'orientation du bureau à la sortie (signalement du 27/10/2026 :
# en quittant Cyber Pinball, le bureau de l'écran du playfield restait à l'envers). Hors écran, sur
# un bureau Windows caché, avec les écrans simulés de docs\ecrans\borne.json (CYBERPINBALL_DISPLAYS)
# dont l'orientation est simulée (ecrans-simules-orientation.json du dossier des données : réglage
# de Windows et changement dynamique de la session). Aucun vrai écran n'est tourné.
# Scénarios :
#   jeu       : le menu tourne le playfield pour la session, Quitter le rend ;
#   bureau    : Ctrl+Maj+D rend l'orientation de Windows au bureau, le retour reprend celle de jeu ;
#   plantage  : une session interrompue a laissé l'écran tourné ; le lancement suivant le reprend,
#               Quitter le rend ;
#   ancienne  : borne d'avant le 27/10/2026, l'orientation de jeu dans le réglage de Windows : le menu
#               le propose, Start rend son réglage à Windows (capture de la proposition) ;
#   perdue    : borne d'avant le 27/10/2026 dont Windows a perdu l'orientation (redémarrage) : le menu
#               la reprend sans question, Quitter la rend.
# Après chaque scénario, le bureau doit être dans l'orientation d'avant Cyber Pinball, sans fichier
# d'orientation laissé ; le réglage de Windows n'est changé que par la réparation (« ancienne »).
#   .\docs\demo-orientation-sortie.ps1 [-Langues fr, en] [-Scenarios jeu, bureau, plantage, ancienne, perdue]
# Captures dans tmp\demo-orientation-sortie\<scénario>\<langue>\captures. VPX n'est jamais lancé ; ni le
# vrai modèle de borne ni le vrai VPinballX.ini ne sont lus ni touchés.
param(
  [string[]]$Langues = @('fr', 'en'),
  [string[]]$Scenarios = @('jeu', 'bureau', 'plantage', 'ancienne', 'perdue')
)
$ErrorActionPreference = 'Stop'
$wt = Split-Path $PSScriptRoot -Parent
. "$PSScriptRoot\hors-ecran.ps1"
# Tout le reste tourne sur un bureau Windows caché : rien ne peut apparaître sur les écrans du poste.
if (Enter-BureauCache $PSCommandPath $PSBoundParameters) { exit $LASTEXITCODE }
$base = "$wt\tmp\demo-orientation-sortie"
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

# Touches de chaque scénario ; à la fin de l'autopilote, Cyber Pinball se ferme (Quitter).
$touches = @{
  jeu = @('wait:1500')
  bureau = @('wait:1200', 'Control+Shift+KeyD', 'wait:1500', 'Control+Shift+KeyD', 'wait:1500')
  plantage = @('wait:1500')
  ancienne = @('wait:1500', 'Enter', 'wait:2000')
  perdue = @('wait:1500')
}
# Lignes de journal attendues, dans l'ordre.
$attendu = @{
  jeu = @('^Orientation : démarrage, .* 0° → 180°', '^Orientation : sortie, .* 180° → 0°')
  bureau = @('^Orientation : démarrage, .* 0° → 180°', '^Orientation : mode bureau, .* 180° → 0°', '^Orientation : retour du bureau, .* 0° → 180°', '^Orientation : sortie, .* 180° → 0°')
  plantage = @('^Orientation : sortie, .* 180° → 0°')
  ancienne = @('^Orientation : orientation rendue à Windows, .* 180° → 0°', '^Orientation : sortie, .* 180° → 0°')
  perdue = @('^Orientation : borne configurée avant le 27/10/2026', '^Orientation : démarrage, .* 0° → 180°', '^Orientation : sortie, .* 180° → 0°')
}

try {
  Use-HorsEcran 'borne'
  foreach ($scenario in $Scenarios) {
    foreach ($langue in $Langues) {
      "== $scenario, $langue"
      $dossier = "$base\$scenario\$langue"
      $home_ = "$dossier\home"
      if (Test-Path $home_) { Remove-Item -Recurse -Force $home_ }
      New-Item -ItemType Directory -Force "$home_\sandbox" | Out-Null
      Set-Content "$home_\sandbox\VPinballX.ini" '' -Encoding UTF8
      node "$PSScriptRoot\demo-medias.cjs" modele "$PSScriptRoot\ecrans\borne.json" "$home_\cabinet.json" "$home_\sandbox\VPinballX.ini" | Out-Null
      if ($LASTEXITCODE -ne 0) { throw 'Modèle de borne des écrans simulés impossible.' }
      node "$PSScriptRoot\demo-orientation-sortie.cjs" preparer "$home_\cabinet.json" $home_ $scenario | ForEach-Object { "   $_" }
      if ($LASTEXITCODE -ne 0) { throw "Préparation du scénario $scenario impossible." }
      $env:CYBERPINBALL_HOME = $home_
      $env:CYBERPINBALL_ROOT = $root
      $env:CYBERPINBALL_LANGUE = $langue
      $env:CYBERPINBALL_AUTOPILOT = $touches[$scenario] -join ','
      $env:CYBERPINBALL_CAPTURE = "$dossier\captures"
      if (Test-Path $env:CYBERPINBALL_CAPTURE) { Remove-Item -Recurse -Force $env:CYBERPINBALL_CAPTURE }
      Push-Location $wt
      try { $log = & $electron app 2>&1 | ForEach-Object { "$_" } } finally { Pop-Location }
      $log | Where-Object { $_ -match '^(Autopilote|Mise en page|Traduction manquante|Hors écran|Mode bureau|Orientation)' } | ForEach-Object { Write-Host "   $_" }
      $id = "$scenario/$langue"
      if ($log -match 'Autopilote : aucun') { $failures += "$id : une action rejouée n'a pas trouvé son écran" }
      if ($log -match 'Traduction manquante') { $failures += "$id : texte sans traduction" }
      $lignes = @($log | Where-Object { $_ -match '^Orientation' })
      $at = 0
      foreach ($motif in $attendu[$scenario]) {
        $trouve = $false
        for (; $at -lt $lignes.Count; $at++) { if ($lignes[$at] -match $motif) { $trouve = $true; $at++; break } }
        if (-not $trouve) { $failures += "$id : ligne attendue absente ou dans le désordre : $motif" }
      }
      if ($log -match '^Orientation : .*(n.a pas|introuvable|débranché)') { $failures += "$id : orientation non rendue, voir le journal" }
      $bilan = node "$PSScriptRoot\demo-orientation-sortie.cjs" bilan "$home_\cabinet.json" $home_ | ConvertFrom-Json
      "   Après la sortie : bureau $($bilan.bureau)°, réglage de Windows $($bilan.reglageWindows)°, orientation de jeu du modèle $($bilan.orientationDeJeu)°, fichier d'orientation $(if ($bilan.fichierOrientation) { 'laissé' } else { 'absent' })."
      if ($bilan.bureau -ne 0) { $failures += "$id : bureau à $($bilan.bureau)° après la sortie au lieu de 0°" }
      if ($bilan.reglageWindows -ne 0) { $failures += "$id : réglage de Windows à $($bilan.reglageWindows)° au lieu de 0°" }
      if ($bilan.fichierOrientation) { $failures += "$id : fichier d'orientation laissé après une sortie propre" }
      if ($bilan.orientationDeJeu -ne 180) { $failures += "$id : le modèle ne dit pas l'orientation de jeu (180°)" }
      Assert-HorsEcran $env:CYBERPINBALL_CAPTURE
      $report = "$env:CYBERPINBALL_CAPTURE\mise-en-page.txt"
      if (-not (Test-Path $report)) { $failures += "$id : relevé de mise en page absent" }
      elseif ((Get-Content $report -Raw -Encoding UTF8) -notmatch '^Aucun problème') { $failures += "$id : mise en page, voir $report" }
    }
  }
} finally {
  Remove-Item Env:CYBERPINBALL_LANGUE, Env:CYBERPINBALL_AUTOPILOT, Env:CYBERPINBALL_CAPTURE, Env:CYBERPINBALL_HOME, Env:CYBERPINBALL_ROOT, Env:CYBERPINBALL_HORS_ECRAN, Env:CYBERPINBALL_DISPLAYS -ErrorAction SilentlyContinue
}

if ($failures.Count) { throw "Démonstration de l'orientation à la sortie en échec :`n  $($failures -join "`n  ")" }
"Captures dans $base\<scénario>\<langue>\captures."
