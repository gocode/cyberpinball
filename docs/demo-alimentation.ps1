# Démonstration sans opérateur de l'alimentation de la borne (menu système > Borne : « Mettre
# en veille », « Redémarrer la borne », « Éteindre la borne »), hors écran sur un bureau Windows
# caché, avec des tables inventées (docs\demo-captures.cjs). Rien n'est jamais éteint : le
# pilote automatique rend l'alimentation simulée (packages\core\src\power.ts, powerSimulated),
# chaque action est seulement journalisée (« Alimentation simulée : … »).
#   confirmations : pour chaque action, l'entrée choisie dans la rubrique Borne, son écran de
#                   confirmation, Exit (annuler : retour à la rubrique), puis de nouveau la
#                   confirmation et Start : l'écran noir de l'action, puis le menu avec le
#                   constat de l'essai ;
#   sans-veille   : PC à veille moderne seulement (CYBERPINBALL_ALIMENTATION_SANS_VEILLE=1) :
#                   l'entrée dit « Indisponible », son écran l'explique, rien n'est demandé à Windows.
# Le journal doit nommer chaque action simulée une fois (aucune en « sans-veille ») ; le
# garde-fou de mise en page (chevauchement, rognure, texte trop petit) et le guet hors écran
# doivent rester muets.
#   .\docs\demo-alimentation.ps1 [-Scenarios confirmations, sans-veille] [-Langues fr, en] [-Ecrans borne, poste-deux-ecrans]
# Captures dans tmp\demo-alimentation\<scénario>\<écrans>\<langue>\captures. VPX n'est jamais
# lancé ; ni le vrai modèle de borne ni le vrai VPinballX.ini ne sont lus ni touchés.
param(
  [string[]]$Scenarios = @('confirmations', 'sans-veille'),
  [string[]]$Langues = @('fr', 'en'),
  [string[]]$Ecrans = @('borne', 'poste-deux-ecrans')
)
$ErrorActionPreference = 'Stop'
$wt = Split-Path $PSScriptRoot -Parent
. "$PSScriptRoot\hors-ecran.ps1"
# Tout le reste tourne sur un bureau Windows caché : rien ne peut apparaître sur les écrans du poste.
if (Enter-BureauCache $PSCommandPath $PSBoundParameters) { exit $LASTEXITCODE }
$base = "$wt\tmp\demo-alimentation"
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

$Start = 'Digit1'; $Exit = 'Escape'
# Une action : depuis la racine du menu système, l'autopilote ouvre la rubrique Borne et l'entrée
# (son écran de confirmation) ; Exit annule (retour à la rubrique, la sélection sur l'entrée) ;
# l'entrée de nouveau, Start : l'écran noir, puis le menu et le constat de l'essai.
function Get-Etapes([string]$libelle) {
  @($Exit, 'wait:1200', "action:$libelle", $Exit, "action:$libelle", $Start, 'wait:3200')
}
# Au départ, le message « VPX n'est pas installé » (le bac à sable n'a pas VPX) : Exit le ferme.
$parcours = @{
  'confirmations' = @('wait:1500', $Exit, 'wait:800') + (Get-Etapes 'Mettre en veille') + (Get-Etapes 'Redémarrer la borne') + (Get-Etapes 'Éteindre la borne')
  'sans-veille'   = @('wait:1500', $Exit, 'wait:800', $Exit, 'wait:1200', 'action:Mettre en veille', $Start, 'wait:1200', $Exit)
}
$attendues = @{
  'confirmations' = @('powrprof SetSuspendState(FALSE, FALSE, FALSE)', 'shutdown.exe /r /t 0', 'shutdown.exe /s /t 0')
  'sans-veille'   = @()
}

try {
  foreach ($scenario in $Scenarios) {
    if (-not $parcours.ContainsKey($scenario)) { throw "Scénario inconnu : $scenario (confirmations, sans-veille)." }
    foreach ($jeu in $Ecrans) {
      Use-HorsEcran $jeu
      foreach ($langue in $Langues) {
        "== $scenario, $jeu, $langue"
        $dossier = "$base\$scenario\$jeu\$langue"
        $home_ = "$dossier\home"
        if (Test-Path $home_) { Remove-Item -Recurse -Force $home_ }
        New-Item -ItemType Directory -Force "$home_\sandbox" | Out-Null
        Set-Content "$home_\sandbox\VPinballX.ini" '' -Encoding UTF8
        node "$PSScriptRoot\demo-medias.cjs" modele "$PSScriptRoot\ecrans\$jeu.json" "$home_\cabinet.json" "$home_\sandbox\VPinballX.ini" | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'Modèle de borne des écrans simulés impossible.' }
        $env:CYBERPINBALL_HOME = $home_
        $env:CYBERPINBALL_ROOT = $root
        $env:CYBERPINBALL_LANGUE = $langue
        $env:CYBERPINBALL_AUTOPILOT = $parcours[$scenario] -join ','
        $env:CYBERPINBALL_CAPTURE = "$dossier\captures"
        if ($scenario -eq 'sans-veille') { $env:CYBERPINBALL_ALIMENTATION_SANS_VEILLE = '1' } else { Remove-Item Env:CYBERPINBALL_ALIMENTATION_SANS_VEILLE -ErrorAction SilentlyContinue }
        if (Test-Path $env:CYBERPINBALL_CAPTURE) { Remove-Item -Recurse -Force $env:CYBERPINBALL_CAPTURE }
        Push-Location $wt
        try { $log = & $electron app 2>&1 | ForEach-Object { "$_" } } finally { Pop-Location }
        $log | Where-Object { $_ -match '^(Autopilote|Mise en page|Traduction manquante|Hors écran|Alimentation)' } | ForEach-Object { Write-Host "   $_" }
        $id = "$scenario/$jeu/$langue"
        if ($log -match 'Autopilote : aucun') { $failures += "$id : une action rejouée n'a pas trouvé son écran" }
        if ($log -match 'Traduction manquante') { $failures += "$id : texte sans traduction" }
        $simulees = @($log | Where-Object { $_ -match '^Alimentation simulée : ' } | ForEach-Object { $_ -replace '^Alimentation simulée : ', '' })
        if (($simulees -join ' | ') -ne ($attendues[$scenario] -join ' | ')) { $failures += "$id : actions simulées « $($simulees -join ' | ') » au lieu de « $($attendues[$scenario] -join ' | ') »" }
        Assert-HorsEcran $env:CYBERPINBALL_CAPTURE
        $report = "$env:CYBERPINBALL_CAPTURE\mise-en-page.txt"
        if (-not (Test-Path $report)) { $failures += "$id : relevé de mise en page absent" }
        elseif ((Get-Content $report -Raw -Encoding UTF8) -notmatch '^Aucun problème') { $failures += "$id : mise en page, voir $report" }
      }
    }
  }
} finally {
  Remove-Item Env:CYBERPINBALL_LANGUE, Env:CYBERPINBALL_AUTOPILOT, Env:CYBERPINBALL_CAPTURE, Env:CYBERPINBALL_HOME, Env:CYBERPINBALL_ROOT, Env:CYBERPINBALL_ALIMENTATION_SANS_VEILLE -ErrorAction SilentlyContinue
}

if ($failures.Count) { throw "Démonstration de l'alimentation en échec :`n  $($failures -join "`n  ")" }
"Captures dans $base\<scénario>\<écrans>\<langue>\captures."
