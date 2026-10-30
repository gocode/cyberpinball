# Démonstration sans opérateur de la lecture aux boutons (packages/core/src/reading.ts) : l'écran
# « Mise à jour de Cyber Pinball » d'une version plus récente, dont les nouveautés (celles du
# CHANGELOG) dépassent de l'écran, parcouru aux seules touches des boutons, une capture par touche :
#   flipper gauche sur « Mettre à jour maintenant » (le texte), flipper droit page après page jusqu'en
#   bas puis sur la première action, retour dans le texte, Exit, MagnaSave (F6) aller et retour.
# Flux signé par une clé d'essai (docs\demo-lecture.cjs), servi par un site local ; la clé n'est
# acceptée que dans le bac à sable. Hors écran, sur un bureau Windows caché ; le garde-fou de mise
# en page (dont « texte qui défile hors d'atteinte des boutons ») et le guet hors écran doivent
# rester muets.
#   .\docs\demo-lecture.ps1 [-Langues fr, en] [-Ecrans borne, poste-deux-ecrans]
# Captures dans tmp\demo-lecture\<écrans>\<langue>\captures. VPX n'est jamais lancé ; ni le vrai
# modèle de borne ni le vrai VPinballX.ini ne sont lus ni touchés.
param(
  [string[]]$Langues = @('fr', 'en'),
  [string[]]$Ecrans = @('borne', 'poste-deux-ecrans'),
  [int]$Port = 8771
)
$ErrorActionPreference = 'Stop'
$wt = Split-Path $PSScriptRoot -Parent
. "$PSScriptRoot\hors-ecran.ps1"
# Tout le reste tourne sur un bureau Windows caché : rien ne peut apparaître sur les écrans du poste.
if (Enter-BureauCache $PSCommandPath $PSBoundParameters) { exit $LASTEXITCODE }
$base = "$wt\tmp\demo-lecture"
$root = "$base\root"
$site = "$base\site"
$electron = node -p "require('electron')"
$failures = @()

Push-Location $wt
try { npm run build | Out-Null } finally { Pop-Location }
if ($LASTEXITCODE -ne 0) { throw 'Compilation impossible.' }
foreach ($d in $site, "$root\tables") { New-Item -ItemType Directory -Force $d | Out-Null }
node "$PSScriptRoot\demo-lecture.cjs" $site
if ($LASTEXITCODE -ne 0) { throw 'Flux d''essai impossible.' }

$journal = "$base\site.txt"; Remove-Item $journal -ErrorAction SilentlyContinue
$serveur = Start-Process node -ArgumentList "`"$PSScriptRoot\demo-mise-a-jour-serveur.cjs`"", "`"$site`"", $Port, "`"$journal`"" -NoNewWindow -PassThru
for ($i = 0; $i -lt 50 -and -not (Test-Path $journal); $i++) { Start-Sleep -Milliseconds 100 }

function Invoke-Capture([string]$Dossier, [string]$Langue, [string]$Nom, [string[]]$Touches) {
  $env:CYBERPINBALL_LANGUE = $Langue
  $env:CYBERPINBALL_AUTOPILOT = $Touches -join ','
  $env:CYBERPINBALL_CAPTURE = "$Dossier\captures\$Nom"
  if (Test-Path $env:CYBERPINBALL_CAPTURE) { Remove-Item -Recurse -Force $env:CYBERPINBALL_CAPTURE }
  # Un message de Chromium sur stderr (« GPU state invalid… ») n'arrête pas la démonstration.
  Push-Location $wt
  $ErrorActionPreference = 'Continue'
  try { $log = & $electron app 2>&1 | ForEach-Object { "$_" } } finally { $ErrorActionPreference = 'Stop'; Pop-Location }
  $log | Where-Object { $_ -match '^(Autopilote|Mise en page|Mise à jour|Traduction manquante|Hors écran)' } | ForEach-Object { Write-Host "   $_" }
  $id = "$(Split-Path (Split-Path $Dossier) -Leaf)/$Langue/$Nom"
  if ($log -match 'Autopilote : aucun') { $script:failures += "$id : une action rejouée n'a pas trouvé son écran" }
  if ($log -match 'Traduction manquante') { $script:failures += "$id : texte sans traduction" }
  Assert-HorsEcran $env:CYBERPINBALL_CAPTURE
  $report = "$env:CYBERPINBALL_CAPTURE\mise-en-page.txt"
  if (-not (Test-Path $report)) { $script:failures += "$id : relevé de mise en page absent" }
  elseif ((Get-Content $report -Raw -Encoding UTF8) -notmatch '^Aucun problème') { $script:failures += "$id : mise en page, voir $report" }
}

# Flipper gauche, flipper droit (flèches au clavier), MagnaSave (F6), Exit (Échap).
$pages = @(1..18 | ForEach-Object { 'ArrowDown', 'wait:400' })

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
      $env:CYBERPINBALL_MAJ_URL = "http://127.0.0.1:$Port/cyberpinball-maj.json"
      $env:CYBERPINBALL_MAJ_CLE = "$site\cle.pem"
      # La racine du bac à sable passe pour une installation : « Mettre à jour maintenant » est là.
      $env:CYBERPINBALL_MAJ_INSTALLEE = '1'

      # VPX n'est pas installé : Exit (plus tard). Exit : le menu système.
      Invoke-Capture $dossier $langue 'lecture' (@(
          'Escape', 'wait:1500', 'Escape', 'wait:1500',
          'action:Cyber Pinball', 'wait:600', 'action:Mise à jour de Cyber Pinball', 'wait:3000',
          'ArrowUp', 'wait:400'
        ) + $pages + @('ArrowUp', 'wait:400', 'ArrowUp', 'wait:400', 'Escape', 'wait:400', 'F6', 'wait:400', 'F6', 'wait:400'))
    }
  }
} finally {
  Stop-Process -Id $serveur.Id -Force -ErrorAction SilentlyContinue
  Remove-Item Env:CYBERPINBALL_LANGUE, Env:CYBERPINBALL_AUTOPILOT, Env:CYBERPINBALL_CAPTURE, Env:CYBERPINBALL_HOME, Env:CYBERPINBALL_ROOT, Env:CYBERPINBALL_MAJ_URL, Env:CYBERPINBALL_MAJ_CLE, Env:CYBERPINBALL_MAJ_INSTALLEE -ErrorAction SilentlyContinue
}

if ($failures.Count) {
  "`nÉchecs :"
  $failures | ForEach-Object { " - $_" }
  exit 1
}
"`nCaptures : $base"
