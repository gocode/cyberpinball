# Lanceur Cyber Pinball : les commandes courantes du prototype dans un menu.
#   .\lanceur.cmd              menu interactif
#   .\lanceur.cmd sync         une action directement (voir $Actions plus bas)

param([string]$Action)

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
[Console]::OutputEncoding = [Text.Encoding]::UTF8

$PointerFile = Join-Path $env:APPDATA 'CyberPinball\root.json'
$DemoDir = Join-Path $PSScriptRoot 'tmp\demo'
# Use-HorsEcran, Assert-EcransDuPoste : les démonstrations tournent hors écran (docs\hors-ecran.ps1).
. (Join-Path $PSScriptRoot 'docs\hors-ecran.ps1')
$HorsEcran = 'Env:CYBERPINBALL_HORS_ECRAN', 'Env:CYBERPINBALL_DISPLAYS'

# Racine choisie à l'installation (mémorisée dans root.json), ou rien si pas encore installé.
function Get-Root {
  if ($env:CYBERPINBALL_ROOT) { return $env:CYBERPINBALL_ROOT }
  if (Test-Path $PointerFile) { return (Get-Content $PointerFile -Raw -Encoding UTF8 | ConvertFrom-Json).root }
  return $null
}

function Get-DataDir {
  if ($env:CYBERPINBALL_HOME) { return $env:CYBERPINBALL_HOME }
  $root = Get-Root
  if ($root) { return Join-Path $root 'data' }
  return Join-Path $env:APPDATA 'CyberPinball'
}

function Step([string]$Text) { Write-Host "`n> $Text" -ForegroundColor Cyan }

function Invoke-Checked([scriptblock]$Command, [string]$What) {
  & $Command
  if ($LASTEXITCODE -ne 0) { throw "$What a échoué (code $LASTEXITCODE)." }
}

function Build {
  if (-not (Test-Path 'node_modules')) {
    Step 'Installation des dépendances'
    Invoke-Checked { npm install } 'npm install'
  }
  Step 'Compilation'
  Invoke-Checked { npx tsc -b } 'La compilation'
}

# Mêmes règles que resolveLocations (packages/core/src/locations.ts).
function Get-VpxIni {
  if ($env:CYBERPINBALL_VPX_INI) { return $env:CYBERPINBALL_VPX_INI }
  if ($env:CYBERPINBALL_HOME) { return Join-Path $env:CYBERPINBALL_HOME 'sandbox\VPinballX.ini' }
  $root = Get-Root
  if ($root) { return Join-Path $root 'config\VPinballX.ini' }
  return Join-Path $env:APPDATA 'CyberPinball\sandbox\VPinballX.ini'
}

function Show-Ini {
  $ini = Get-VpxIni
  Step $ini
  if (Test-Path $ini) { Get-Content $ini -Encoding UTF8 } else { Write-Host '(fichier pas encore écrit)' }
}

$Actions = [ordered]@{
  'jouer' = @{
    Label = 'Jouer : menu des tables (assistant au premier démarrage)'
    Run   = { Build; Step 'Cyber Pinball'; npx electron app }
  }
  'installer' = @{
    Label = "Installer ou mettre à jour (choix du dossier, VPX et autres composants)"
    Run   = {
      Build
      $current = Get-Root
      $default = if ($current) { $current } else { 'C:\CyberPinball' }
      $answer = Read-Host "Dossier d'installation [$default]"
      $root = if ($answer) { $answer.Trim('"', ' ') } else { $default }
      Step "Préparation de $root"
      Invoke-Checked { node packages/installer/dist/cli.js setup $root } 'Le choix du dossier'
      Step 'Installation des composants'
      Invoke-Checked { node packages/installer/dist/cli.js install } "L'installation"
    }
  }
  'vpx' = @{
    Label = 'Ouvrir VPX avec la configuration Cyber Pinball'
    Run   = {
      $root = Get-Root
      if (-not $root) { throw "Cyber Pinball n'est pas encore installé : choisissez d'abord « Installer »." }
      $exe = Get-ChildItem (Join-Path $root 'emulators\vpx\current') -Filter 'VPinballX*64.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
      if (-not $exe) { throw 'VPX est introuvable : relancez « Installer ».' }
      $ini = Join-Path $root 'config\VPinballX.ini'
      Step "$($exe.FullName) -Ini $ini"
      Start-Process -FilePath $exe.FullName -ArgumentList '-Ini', "`"$ini`"" -WorkingDirectory $exe.DirectoryName
    }
  }
  'ecrans' = @{
    Label = 'Détecter les écrans (empreinte, nom attendu par VPX)'
    Run   = { Build; Step 'Détection'; node packages/win-displays/dist/cli.js }
  }
  'assistant' = @{
    Label = "Assistant d'écrans (plein écran sur chaque écran, Ctrl+Q pour quitter)"
    Run   = { Build; Step 'Assistant'; npx electron app --assistant }
  }
  'boutons' = @{
    Label = 'Boutons de la borne seulement (liste cliquable, Ctrl+Q pour quitter)'
    Run   = { Build; Step 'Étape « Boutons »'; npx electron app --boutons }
  }
  'boutons-defaut' = @{
    Label = 'Remettre les touches par défaut des encodeurs (si les boutons ne pilotent plus rien)'
    Run   = { Build; Step 'Touches par défaut des encodeurs'; node app/dist/sync-cli.js --boutons-par-defaut }
  }
  'reglages' = @{
    Label = 'Réglages de VPX (écran seul ; Exit pour fermer)'
    Run   = { Build; Step 'Réglages de VPX'; npx electron app --reglages }
  }
  'demo-reglages' = @{
    Label = 'Démo sans opérateur des réglages, hors écran (bac à sable, captures dans tmp\demo-reglages)'
    Run   = {
      Build
      $dir = Join-Path $PSScriptRoot 'tmp\demo-reglages'
      # Sur un bureau Windows caché : rien n'apparaît sur les écrans du poste.
      if (Enter-BureauCache (Join-Path $PSScriptRoot 'lanceur.ps1') @{ Action = 'demo-reglages' }) { explorer.exe $dir; return }
      Use-HorsEcran 'pc-dev'
      if (Test-Path $dir) { Remove-Item $dir -Recurse -Force }
      $env:CYBERPINBALL_HOME = Join-Path $dir 'home'
      $sandboxIni = Join-Path $env:CYBERPINBALL_HOME 'sandbox\VPinballX.ini'
      New-Item -ItemType Directory -Force (Split-Path $sandboxIni) | Out-Null
      # La démo ne modifie qu'une copie du vrai VPinballX.ini, rangée dans le bac à sable.
      $root = Get-Root
      if ($root -and (Test-Path (Join-Path $root 'config\VPinballX.ini'))) { Copy-Item (Join-Path $root 'config\VPinballX.ini') $sandboxIni }
      try {
        Step 'Réglages généraux : volume du backglass à 80 %, puis onglet Avancé'
        $env:CYBERPINBALL_CAPTURE = Join-Path $dir 'general'
        $env:CYBERPINBALL_AUTOPILOT = ('ArrowDown,' * 8) + 'Enter,' + ('PageDown,' * 8) + 'ArrowDown,Enter,Tab,ArrowDown,ArrowDown,ArrowDown,Enter,' + ('ArrowDown,' * 5) + 'Enter,Escape,Escape'
        npx electron app --reglages
        Step 'Réglages de la première table : flippers à 0 % du bas de l''écran, difficulté à 80 %, liste des surcharges'
        $env:CYBERPINBALL_CAPTURE = Join-Path $dir 'table'
        $env:CYBERPINBALL_AUTOPILOT = 'ArrowDown,ArrowDown,Enter,ArrowDown,Enter,' + ('ArrowDown,' * 24) + 'Enter,' + ('PageDown,' * 8) + 'ArrowDown,Enter,Tab,ArrowDown,Enter,ArrowDown,Escape,Escape'
        npx electron app --reglages --table=.vpx
        Step "Fichiers écrits dans le bac à sable ($env:CYBERPINBALL_HOME)"
        Get-ChildItem (Join-Path $env:CYBERPINBALL_HOME 'sandbox') -Recurse -File | ForEach-Object { $_.FullName }
      } finally {
        Remove-Item (@('Env:CYBERPINBALL_HOME', 'Env:CYBERPINBALL_CAPTURE', 'Env:CYBERPINBALL_AUTOPILOT') + $HorsEcran) -ErrorAction SilentlyContinue
      }
      if (-not (Test-BureauCache)) { explorer.exe $dir }
    }
  }
  'sync' = @{
    Label = 'Synchroniser VPinballX.ini avec les écrans branchés'
    Run   = { Build; Step 'Synchronisation'; node app/dist/sync-cli.js }
  }
  'ini' = @{
    Label = 'Afficher le VPinballX.ini géré par Cyber Pinball'
    Run   = { Show-Ini }
  }
  'endurance' = @{
    Label = "Test d'endurance (nécessite les écrans du poste) : lancements répétés d'une table, avec retour du focus"
    Run   = {
      Build
      # De vraies parties de VPX : jamais hors écran, les écrans du poste sont pris pendant le test.
      $env:CYBERPINBALL_A_L_ECRAN = '1'
      $count = Read-Host 'Nombre de lancements [50]'
      $seconds = Read-Host 'Secondes de jeu par lancement [10]'
      $filter = Read-Host 'Morceau du nom de la table [première table]'
      $env:CYBERPINBALL_STRESS = "$(if ($count) { $count } else { 50 }),$(if ($seconds) { $seconds } else { 10 })"
      if ($filter) { $env:CYBERPINBALL_TABLE = $filter }
      try {
        Step "Endurance ($env:CYBERPINBALL_STRESS) : ne touchez à rien pendant le test"
        npx electron app
      } finally {
        Remove-Item Env:CYBERPINBALL_STRESS, Env:CYBERPINBALL_TABLE, Env:CYBERPINBALL_A_L_ECRAN -ErrorAction SilentlyContinue
      }
    }
  }
  'deployer' = @{
    Label = "Fabriquer l'exécutable et le déployer dans la racine (app\CyberPinball.exe)"
    Run   = { Invoke-Checked { node scripts/fabriquer.mjs --deployer } 'La fabrication' }
  }
  'installeur' = @{
    Label = "Fabriquer l'installeur (release\CyberPinball-Setup.exe, et -complet.exe avec VPX)"
    Run   = {
      Invoke-Checked { node scripts/fabriquer.mjs --installeur } 'La fabrication'
      explorer.exe (Join-Path $PSScriptRoot 'release')
    }
  }
  'tests' = @{
    Label = 'Tests automatiques du cœur'
    Run   = { Invoke-Checked { npm test } 'Les tests' }
  }
  'demo' = @{
    Label = 'Démo sans opérateur de l''assistant, hors écran (captures dans tmp\demo)'
    Run   = {
      # Sur un bureau Windows caché, hors écran sur les quatre écrans simulés du PC de développement.
      if (Enter-BureauCache (Join-Path $PSScriptRoot 'lanceur.ps1') @{ Action = 'demo' }) { explorer.exe (Join-Path $DemoDir 'captures'); return }
      Build
      Use-HorsEcran 'pc-dev'
      if (Test-Path $DemoDir) { Remove-Item $DemoDir -Recurse -Force }
      $env:CYBERPINBALL_HOME = Join-Path $DemoDir 'home'
      $env:CYBERPINBALL_CAPTURE = Join-Path $DemoDir 'captures'
      # Playfield sur l'écran le plus à droite (flippers en bas, diagonale proposée), backglass sur le premier,
      # DMD sur le suivant libre, pas de topper. Boutons : touches par défaut gardées (SansBoutons).
      $env:CYBERPINBALL_AUTOPILOT = 'SansBoutons,ShiftLeft,Digit1,Digit1,Digit1,Digit1,ShiftRight,Digit1,Escape,Digit1'
      # Aucune sortie audio simulée : l'étape « Son » est sautée, la séquence vaut sur tout PC.
      New-Item -ItemType Directory -Force $DemoDir | Out-Null
      $env:CYBERPINBALL_AUDIO_OUTPUTS = Join-Path $DemoDir 'sans-sortie-audio.json'
      Set-Content -Path $env:CYBERPINBALL_AUDIO_OUTPUTS -Value '[]' -Encoding ASCII
      try {
        Step 'Assistant en pilote automatique'
        npx electron app --assistant
        Step 'Synchronisation dans le bac à sable de la démo'
        node app/dist/sync-cli.js
        Show-Ini
      } finally {
        Remove-Item (@('Env:CYBERPINBALL_HOME', 'Env:CYBERPINBALL_CAPTURE', 'Env:CYBERPINBALL_AUTOPILOT', 'Env:CYBERPINBALL_AUDIO_OUTPUTS') + $HorsEcran) -ErrorAction SilentlyContinue
      }
      Assert-HorsEcran (Join-Path $DemoDir 'captures')
    }
  }
  'demos' = @{
    Label = 'Toutes les démonstrations sans opérateur, hors écran (en arrière-plan, bilan dans tmp\demos)'
    Run   = { Build; Step 'Démonstrations hors écran'; & (Join-Path $PSScriptRoot 'docs\demos-hors-ecran.ps1') }
  }
  'donnees' = @{
    Label = 'Ouvrir le dossier de données (modèle de borne, sauvegardes)'
    Run   = {
      $dir = Get-DataDir; New-Item -ItemType Directory -Force $dir | Out-Null
      explorer.exe $dir
    }
  }
}

function Invoke-Action([string]$Name) {
  if (-not $Actions.Contains($Name)) {
    Write-Host "Action inconnue : $Name. Actions possibles : $($Actions.Keys -join ', ')" -ForegroundColor Yellow
    return
  }
  try { & $Actions[$Name].Run }
  catch { Write-Host "`n$($_.Exception.Message)" -ForegroundColor Red }
}

if ($Action) {
  Invoke-Action $Action
  exit
}

$keys = @($Actions.Keys)
while ($true) {
  Write-Host "`n=== Cyber Pinball : lanceur du prototype ===" -ForegroundColor Magenta
  for ($i = 0; $i -lt $keys.Count; $i++) {
    Write-Host ("  {0}. {1}" -f ($i + 1), $Actions[$keys[$i]].Label)
  }
  Write-Host '  0. Quitter'
  $choice = Read-Host "`nVotre choix"
  if ($choice -eq '0' -or $choice -eq '') { break }
  $index = 0
  if ([int]::TryParse($choice, [ref]$index) -and $index -ge 1 -and $index -le $keys.Count) {
    Invoke-Action $keys[$index - 1]
  } else {
    Write-Host 'Choix invalide.' -ForegroundColor Yellow
  }
}
