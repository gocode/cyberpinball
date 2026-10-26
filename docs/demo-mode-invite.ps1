# Démonstration sans opérateur du mode invité (Menu système > Borne > Mode invité), hors écran
# sur un bureau Windows caché, avec des tables inventées (docs\demo-captures.cjs).
# Pour chaque jeu d'écrans et chaque langue :
#   entrée        : Menu système > Borne > Mode invité, l'écran et sa combinaison, puis
#                   « Activer le mode invité » : le menu des tables, verrouillé (cadenas, « Invité ») ;
#   portes closes : Exit, Tab, clic sur le cadenas, Ctrl+Maj+D, R, Ctrl+Q, fichiers glissés :
#                   rien ne s'ouvre, l'indice « Verrouillé » paraît ;
#   portes ouvertes : Start (la fiche, réduite à Jouer, Prospectus, Règles, Retour), le prospectus,
#                   l'aide-mémoire (H) sans les lignes fermées ;
#   déverrouillage : les deux flippers et les deux MagnaSave tenus (Maj et Ctrl, gauche et droite) :
#                   l'anneau se remplit, « Mode invité désactivé », puis Exit ouvre le menu système.
# Puis l'application redémarre, mode invité réactivé dans son réglage : toujours verrouillée.
# Le journal doit dire chaque porte fermée une fois (le menu système trois fois), le
# déverrouillage une fois, et jamais « Mode bureau » ; le garde-fou de mise en page et le guet
# hors écran doivent rester muets.
#   .\docs\demo-mode-invite.ps1 [-Langues fr, en] [-Ecrans borne, poste-deux-ecrans]
# Captures dans tmp\demo-mode-invite\<écrans>\<langue>\captures (puis captures-redemarrage). VPX
# n'est jamais lancé ; ni le vrai modèle de borne ni le vrai VPinballX.ini ne sont lus ni touchés.
param(
  [string[]]$Langues = @('fr', 'en'),
  [string[]]$Ecrans = @('borne', 'poste-deux-ecrans')
)
$ErrorActionPreference = 'Stop'
$wt = Split-Path $PSScriptRoot -Parent
. "$PSScriptRoot\hors-ecran.ps1"
# Tout le reste tourne sur un bureau Windows caché : rien ne peut apparaître sur les écrans du poste.
if (Enter-BureauCache $PSCommandPath $PSBoundParameters) { exit $LASTEXITCODE }
$base = "$wt\tmp\demo-mode-invite"
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

# Les combinaisons de touches (Ctrl+Maj+D, Ctrl+Q) passent par les mêmes portes que les boutons.
$hold = 'ShiftLeft', 'ControlLeft', 'ShiftRight', 'ControlRight'
function Get-Touches([string]$absent) {
  @(
    # Le premier Exit ferme le message de démarrage (VPX n'est pas installé dans le bac à sable).
    'Escape', 'wait:1500', 'Escape', 'wait:800', 'action:Borne', 'wait:600', 'action:Mode invité', 'wait:800',
    'action:Activer le mode invité', 'wait:800',
    'Escape', 'wait:400', 'Tab', 'wait:400', 'click:.guest-lock', 'wait:400',
    'Control+Shift+KeyD', 'wait:600', 'KeyR', 'wait:600', 'Control+KeyQ', 'wait:600', "drop:$absent", 'wait:600',
    'Digit1', 'wait:800', 'action:Prospectus', 'wait:800', 'Escape', 'wait:600', 'Escape', 'wait:600',
    'KeyH', 'wait:600', 'Escape', 'wait:3500'
  ) + @($hold | ForEach-Object { "hold:$_" }) + @('wait:1200', 'wait:2200') + @($hold | ForEach-Object { "release:$_" }) + @('Escape', 'wait:800')
}
# Porte -> nombre de refus attendus pendant la première partie de la démonstration.
$refus = [ordered]@{ 'menu.system' = 3; 'shortcut.desktop' = 1; 'menu.vpx-settings' = 1; 'shortcut.quit' = 1; 'files.drop' = 1 }

function Invoke-Menu([string]$dossier, [string]$captures, [string[]]$touches) {
  $env:CYBERPINBALL_AUTOPILOT = $touches -join ','
  $env:CYBERPINBALL_CAPTURE = $captures
  if (Test-Path $captures) { Remove-Item -Recurse -Force $captures }
  Push-Location $wt
  try { $log = & $electron app 2>&1 | ForEach-Object { "$_" } } finally { Pop-Location }
  $log | Where-Object { $_ -match '^(Autopilote|Mise en page|Traduction manquante|Hors écran|Mode bureau|Mode invité)' } | ForEach-Object { Write-Host "   $_" }
  return $log
}

function Test-Captures([string]$id, [string]$captures, $log) {
  if ($log -match 'Autopilote : aucun') { $script:failures += "$id : une action rejouée n'a pas trouvé son écran" }
  if ($log -match 'Traduction manquante') { $script:failures += "$id : texte sans traduction" }
  if ($log -match '^Mode bureau : ') { $script:failures += "$id : le mode bureau s'est ouvert en mode invité" }
  Assert-HorsEcran $captures
  $report = "$captures\mise-en-page.txt"
  if (-not (Test-Path $report)) { $script:failures += "$id : relevé de mise en page absent" }
  elseif ((Get-Content $report -Raw -Encoding UTF8) -notmatch '^Aucun problème') { $script:failures += "$id : mise en page, voir $report" }
}

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
      $id = "$jeu/$langue"

      $log = Invoke-Menu $dossier "$dossier\captures" (Get-Touches "$dossier\absent.vpx")
      Test-Captures $id "$dossier\captures" $log
      foreach ($porte in $refus.Keys) {
        $n = @($log | Where-Object { $_ -eq "Mode invité : porte fermée ($porte)." }).Count
        if ($n -ne $refus[$porte]) { $failures += "$id : porte $porte refusée $n fois au lieu de $($refus[$porte])" }
      }
      $autres = @($log | Where-Object { $_ -match '^Mode invité : porte fermée' }).Count
      $attendus = ($refus.Values | Measure-Object -Sum).Sum
      if ($autres -ne $attendus) { $failures += "$id : $autres refus au lieu de $attendus (Exit après le déverrouillage doit ouvrir le menu système)" }
      if (@($log | Where-Object { $_ -match '^Mode invité : déverrouillé' }).Count -ne 1) { $failures += "$id : la combinaison n'a pas déverrouillé" }

      # Redémarrage, le mode invité réactivé dans son réglage : le menu démarre verrouillé.
      Set-Content "$home_\mode-invite.json" '{ "active": true }' -Encoding UTF8
      $log = Invoke-Menu $dossier "$dossier\captures-redemarrage" @('Escape', 'wait:1500', 'Escape', 'wait:600')
      Test-Captures "$id (redémarrage)" "$dossier\captures-redemarrage" $log
      if (-not ($log -match '^Mode invité : actif')) { $failures += "$id : au redémarrage, le mode invité n'est pas actif" }
      if (-not ($log -match '^Mode invité : porte fermée \(menu\.system\)')) { $failures += "$id : au redémarrage, Exit a ouvert le menu système" }
    }
  }
} finally {
  Remove-Item Env:CYBERPINBALL_LANGUE, Env:CYBERPINBALL_AUTOPILOT, Env:CYBERPINBALL_CAPTURE, Env:CYBERPINBALL_HOME, Env:CYBERPINBALL_ROOT -ErrorAction SilentlyContinue
}

if ($failures.Count) { throw "Démonstration du mode invité en échec :`n  $($failures -join "`n  ")" }
"Captures dans $base\<écrans>\<langue>\captures et captures-redemarrage."
