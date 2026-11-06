# Lanceur Cyber Pinball : les commandes courantes du prototype dans un menu, par rubrique
# (borne, essais, fabrication et publication sur GitHub, dossiers).
#   .\lanceur.cmd              menu interactif
#   .\lanceur.cmd sync         une action directement (voir $Actions plus bas)

param([string]$Action)

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
[Console]::OutputEncoding = [Text.Encoding]::UTF8

$PointerFile = Join-Path $env:APPDATA 'CyberPinball\root.json'

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
  # node_modules peut ne contenir que les liens @cyberpinball\* (scripts/liens-espaces.mjs) : on teste une vraie dépendance.
  if (-not (Test-Path 'node_modules\typescript')) {
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

# Avant une publication : la version, ses nouveautés, et une confirmation (rien ne part sans « o »).
function Confirm-Publication {
  Build
  $version = (Get-Content (Join-Path $PSScriptRoot 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json).version
  Invoke-Checked { node scripts/version-suivante.mjs --verifier } "La vérification des nouveautés (action « version » pour les écrire)"
  $answer = Read-Host "Publier la version $version sur GitHub ? (o/N)"
  if ($answer -notmatch '^[oOyY]') { throw 'Publication annulée : rien n''est parti.' }
}

$Actions = [ordered]@{
  'jouer' = @{
    Section = 'Borne et réglages'
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
  'plunger' = @{
    Label = 'Lanceur analogique seulement (plunger à capteur du Pinscape, Ctrl+Q pour quitter)'
    Run   = { Build; Step 'Étape « Lanceur »'; npx electron app --assistant --lanceur }
  }
  'tilt' = @{
    Label = 'Tilt seulement (balancier de la borne ou balancier simulé par VPX, Ctrl+Q pour quitter)'
    Run   = { Build; Step 'Étape « Tilt »'; npx electron app --assistant --tilt }
  }
  'boutons-defaut' = @{
    Label = 'Remettre les touches par défaut des encodeurs (si les boutons ne pilotent plus rien)'
    Run   = { Build; Step 'Touches par défaut des encodeurs'; node app/dist/sync-cli.js --boutons-par-defaut }
  }
  'reglages' = @{
    Label = 'Réglages de VPX (écran seul ; Exit pour fermer)'
    Run   = { Build; Step 'Réglages de VPX'; npx electron app --reglages }
  }
  'sync' = @{
    Label = 'Synchroniser VPinballX.ini avec les écrans branchés'
    Run   = { Build; Step 'Synchronisation'; node app/dist/sync-cli.js }
  }
  'ini' = @{
    Label = 'Afficher le VPinballX.ini géré par Cyber Pinball'
    Run   = { Show-Ini }
  }
  'deployer' = @{
    Section = 'Fabrication et publication sur GitHub'
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
  'jeton' = @{
    Label = 'Ranger le jeton GitHub (une fois ; la publication le lit toute seule)'
    Run   = {
      $file = Join-Path $env:USERPROFILE '.cyberpinball\jeton-github.txt'
      Write-Host 'Jeton à grain fin, créé sur https://github.com/settings/personal-access-tokens/new :'
      Write-Host '  dépôt gocode/cyberpinball seulement ; Contents et Administration en lecture et écriture.'
      $secure = Read-Host 'Collez le jeton (il ne s''affiche pas)' -AsSecureString
      $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)).Trim()
      if ($token -notmatch '^(github_pat_|ghp_)') { throw 'Ce n''est pas un jeton GitHub (il commence par github_pat_) : rien n''est rangé.' }
      New-Item -ItemType Directory -Force (Split-Path $file) | Out-Null
      [IO.File]::WriteAllText($file, $token)
      Step "Jeton rangé dans $file, hors du dépôt. À refaire à son expiration."
    }
  }
  'version' = @{
    Label = 'Passer à la version suivante et écrire ses nouveautés (CHANGELOG), puis l''enregistrer'
    Run   = {
      $kind = Read-Host 'Correctif : Entrée ; sinon « mineure » ou « majeure »'
      Invoke-Checked { node scripts/version-suivante.mjs $kind } 'Le changement de version'
      Step 'Nouveautés en français, puis les mêmes en anglais : une ligne « - » par point sous la nouvelle version ; enregistrez, puis fermez le Bloc-notes'
      Start-Process notepad (Join-Path $PSScriptRoot 'CHANGELOG.md') -Wait
      Start-Process notepad (Join-Path $PSScriptRoot 'CHANGELOG.en.md') -Wait
      Invoke-Checked { node scripts/version-suivante.mjs --verifier } 'La vérification des nouveautés (relancez « version » pour les compléter)'
      $version = (Get-Content (Join-Path $PSScriptRoot 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json).version
      Invoke-Checked { git add package.json package-lock.json CHANGELOG.md CHANGELOG.en.md } 'git add'
      Invoke-Checked { git commit -m "Version $version" } "L'enregistrement (git commit)"
      Step "Version $version enregistrée. « Publier » la met en ligne."
    }
  }
  'verifier' = @{
    Label = 'Vérifier avant de publier (tests, contrôle de publication, nouveautés de la version)'
    Run   = {
      Invoke-Checked { npm test } 'Les tests'
      Invoke-Checked { node scripts/version-suivante.mjs --verifier } 'La vérification des nouveautés'
    }
  }
  'publier' = @{
    Label = 'Publier la version sur GitHub, avec les deux installeurs (15 à 20 min) : les bornes la voient'
    Run   = { Confirm-Publication; Invoke-Checked { node scripts/publier.mjs } 'La publication' }
  }
  'publier-leger' = @{
    Label = 'Publier avec l''installeur léger seulement (deux fois plus rapide ; sans la version complète avec VPX)'
    Run   = { Confirm-Publication; Invoke-Checked { node scripts/publier.mjs --leger } 'La publication' }
  }
  'publier-rapide' = @{
    Label = 'Publier sans refaire les installeurs (1 à 2 min) : les bornes reçoivent la mise à jour légère'
    Run   = { Confirm-Publication; Invoke-Checked { node scripts/publier.mjs --rapide } 'La publication' }
  }
  'preversion' = @{
    Label = 'Passer à la préversion d''essai suivante (0.1.3-essai.1…), pour les bornes qui acceptent les préversions'
    Run   = {
      Invoke-Checked { node scripts/version-suivante.mjs essai } 'Le changement de version'
      $version = (Get-Content (Join-Path $PSScriptRoot 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json).version
      Invoke-Checked { git add package.json package-lock.json CHANGELOG.md CHANGELOG.en.md } 'git add'
      Invoke-Checked { git commit -m "Version $version" } "L'enregistrement (git commit)"
      Step "Préversion $version enregistrée. « publier-rapide » la met en ligne : seules les bornes réglées sur « Préversions : reçues » la voient."
    }
  }
  'publier-brouillon' = @{
    Label = 'Publier en brouillon (invisible des bornes, à rendre public ensuite sur GitHub)'
    Run   = { Confirm-Publication; Invoke-Checked { node scripts/publier.mjs --brouillon } 'La publication' }
  }
  'envoyer' = @{
    Label = 'Envoyer seulement le code sur GitHub (instantané, sans nouvelle version)'
    Run   = { Build; Invoke-Checked { node scripts/envoyer-github.mjs } "L'envoi" }
  }
  'decrire' = @{
    Label = 'Appliquer la description et les sujets du dépôt GitHub (depuis package.json)'
    Run   = { Invoke-Checked { node scripts/decrire-github.mjs } 'La description du dépôt' }
  }
  'tests' = @{
    Section = 'Tests'
    Label = 'Tests automatiques du cœur'
    Run   = { Invoke-Checked { npm test } 'Les tests' }
  }
  'donnees' = @{
    Section = 'Dossiers'
    Label = 'Ouvrir le dossier de données (modèle de borne, sauvegardes)'
    Run   = {
      $dir = Get-DataDir; New-Item -ItemType Directory -Force $dir | Out-Null
      explorer.exe $dir
    }
  }
}

# Actions d'essai du développement (démonstrations hors écran, endurance, essais de mise à jour) :
# un complément du dépôt de travail, absent de la copie publique.
$Essais = Join-Path $PSScriptRoot 'interne\lanceur-essais.ps1'
if (Test-Path $Essais) { . $Essais }

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
    if ($Actions[$keys[$i]].Section) { Write-Host "`n  -- $($Actions[$keys[$i]].Section) --" -ForegroundColor DarkCyan }
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
