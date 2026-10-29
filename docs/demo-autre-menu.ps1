# Démonstration sans opérateur de la cohabitation avec un autre menu de borne (PinUP Popper
# simulé par CYBERPINBALL_AUTRES_MENUS : aucun vrai processus n'est cherché hors écran).
#   demarrage : PinUP Popper « ouvert » au démarrage : l'écran d'attente s'affiche seul, sur
#               l'écran principal ; on « ferme » Popper (le fichier témoin disparaît) : le menu
#               démarre de lui-même ;
#   partie    : Popper « ouvert » pendant que le menu tourne : avant la partie, « PinUP Popper
#               est ouvert » (Start : jouer quand même) ; Start : la partie simulée se joue ;
#   assistant : orientation du playfield avec Popper installé (CYBERPINBALL_AUTRES_MENUS_INSTALLES) : le premier Start avertit au
#               lieu de retourner l'écran, Exit garde l'orientation de Windows ;
#   retourner : même étape, Start une deuxième fois : l'écran est retourné (simulé), Exit
#               remet l'orientation d'origine.
# Captures et garde-fou de mise en page (mise-en-page.txt, doit être vide) dans
# tmp\captures\autre-menu\<scénario> ; l'écran d'attente dans son sous-dossier autre-menu.
#   .\docs\demo-autre-menu.ps1 [-Scenarios demarrage, partie] [-Ecrans pc-dev]
# VPX n'est jamais lancé ; ni le vrai modèle de borne ni le vrai VPinballX.ini ne sont touchés.
param(
  [string[]]$Scenarios = @('demarrage', 'partie', 'assistant', 'retourner'),
  [string]$Source = 'D:\CyberPinball',
  [string]$Ecrans = 'pc-dev'
)
$ErrorActionPreference = 'Stop'
$wt = Split-Path $PSScriptRoot -Parent
. "$PSScriptRoot\hors-ecran.ps1"
# Tout le reste tourne sur un bureau Windows caché : rien ne peut apparaître sur les écrans du poste.
if (Enter-BureauCache $PSCommandPath $PSBoundParameters) { exit $LASTEXITCODE }
Use-HorsEcran $Ecrans
$base = "$wt\tmp\demo-autre-menu"
$electron = node -p "require('electron')"

Push-Location $wt
try { npm run build | Out-Null } finally { Pop-Location }

# Nettoyage : d'abord les jonctions d'une racine d'avant le 29/10/2026 (sans /s, pour ne jamais y descendre).
if (Test-Path $base) {
  Get-ChildItem -Directory -Recurse -Depth 2 $base -Attributes ReparsePoint | ForEach-Object { cmd /c rmdir "$($_.FullName)" }
  Remove-Item -Recurse -Force $base
}
if (Test-Path "$wt\tmp\captures\autre-menu") { Remove-Item -Recurse -Force "$wt\tmp\captures\autre-menu" }
# Des tables aux médias générés (comme demo-moments.ps1), et une fausse installation de VPX
# (New-FauxVpx) pour que le menu propose de jouer : la partie est simulée.
$root = "$base\root"
Push-Location $wt
try { & $electron docs\demo-moments.cjs $root 2>&1 | Out-Null } finally { Pop-Location }
if ($LASTEXITCODE -ne 0) { throw 'Génération des tables en échec.' }
New-FauxVpx $root
Set-Content -Path "$base\sans-son.json" -Value '[]' -Encoding ASCII

$Start = 'Digit1'; $Exit = 'Escape'
$failures = @()

function New-Home([string]$name) {
  $h = "$base\$name"
  New-Item -ItemType Directory -Force "$h\sandbox" | Out-Null
  Copy-Item "$Source\config\VPinballX.ini" "$h\sandbox\VPinballX.ini"
  $model = Get-ModeleBorne "$Source\data\cabinet.json"
  $model.vpx.iniPath = "$h\sandbox\VPinballX.ini"
  $model | ConvertTo-Json -Depth 20 | Set-Content -Path "$h\cabinet.json" -Encoding UTF8
  $h
}

# Lance Cyber Pinball en arrière-plan ; $pendant reçoit le dossier des captures et agit sur le fichier témoin.
function Invoke-Scenario([string]$name, [string[]]$etapes, [string[]]$arguments, [scriptblock]$pendant, [string]$temoin, [switch]$Installe) {
  $captures = "$wt\tmp\captures\autre-menu\$name"
  New-Item -ItemType Directory -Force $captures | Out-Null
  $env:CYBERPINBALL_ROOT = $root
  $env:CYBERPINBALL_HOME = New-Home $name
  $env:CYBERPINBALL_AUDIO_OUTPUTS = "$base\sans-son.json"
  $env:CYBERPINBALL_AUTOPILOT = $etapes -join ','
  $env:CYBERPINBALL_CAPTURE = $captures
  # Ouvert (écran d'attente, message avant la partie) ou seulement installé (avertissement de l'assistant).
  if ($Installe) {
    $env:CYBERPINBALL_AUTRES_MENUS_INSTALLES = 'PinUpMenu.exe'
    Remove-Item Env:CYBERPINBALL_AUTRES_MENUS -ErrorAction SilentlyContinue
  } else {
    $env:CYBERPINBALL_AUTRES_MENUS = 'PinUpMenu.exe,PinUpDisplay.exe'
    Remove-Item Env:CYBERPINBALL_AUTRES_MENUS_INSTALLES -ErrorAction SilentlyContinue
  }
  if ($temoin) { $env:CYBERPINBALL_AUTRES_MENUS_FICHIER = $temoin } else { Remove-Item Env:CYBERPINBALL_AUTRES_MENUS_FICHIER -ErrorAction SilentlyContinue }
  $env:CYBERPINBALL_PARTIE_SIMULEE = 'backglass'
  $env:CYBERPINBALL_LOADING_MS = '1500'
  Write-Host "`n=== $name"
  $line = "`"$electron`" app --user-data-dir=`"$base\$name\chromium`" $($arguments -join ' ') > `"$captures\sortie.txt`" 2> `"$captures\erreurs.txt`""
  $process = Start-Process -FilePath cmd.exe -ArgumentList '/d', '/c', "`"$line`"" -WorkingDirectory $wt -NoNewWindow -PassThru
  if ($pendant) { & $pendant $captures }
  if (-not $process.WaitForExit(180000)) {
    # Arrête aussi Electron, lancé par cmd.exe sur le bureau caché.
    Get-CimInstance Win32_Process -Filter "Name='electron.exe'" | Where-Object { $_.CommandLine -match [regex]::Escape("$base\$name\chromium") } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
    $process.Kill()
    $script:failures += "$name : toujours ouvert après 3 minutes"
  }
  Assert-HorsEcran $captures
  foreach ($report in Get-ChildItem -Recurse $captures -Filter mise-en-page.txt) {
    if ((Get-Content $report.FullName -Raw -Encoding UTF8) -notmatch '^Aucun problème') { $script:failures += "$name : mise en page, voir $($report.FullName)" }
  }
  Get-Content "$captures\sortie.txt" -Encoding UTF8 | Where-Object { $_ -match 'PinUP Popper|Autopilote' } | ForEach-Object { Write-Host "   $_" }
  $captures
}

function Wait-File([string]$file, [int]$seconds = 60) {
  for ($i = 0; $i -lt $seconds * 10 -and -not (Test-Path $file); $i++) { Start-Sleep -Milliseconds 100 }
  Test-Path $file
}

function Assert-Text([string]$name, [string]$captures, [string]$pattern) {
  $text = Get-Content "$captures\sortie.txt" -Raw -Encoding UTF8
  if ($text -notmatch $pattern) { $script:failures += "$name : « $pattern » absent de la console" }
}

if ($Scenarios -contains 'demarrage') {
  $temoin = "$base\popper-ouvert"
  Set-Content -Path $temoin -Value 'ouvert' -Encoding ASCII
  $c = Invoke-Scenario 'demarrage' @('wait:500') @() {
    param($captures)
    if (-not (Wait-File "$captures\autre-menu\autre-menu-ouvert.png")) { $script:failures += 'demarrage : écran d''attente jamais capturé' }
    Start-Sleep -Seconds 2
    Remove-Item $temoin   # PinUP Popper « fermé »
  } $temoin
  Assert-Text 'demarrage' $c 'PinUP Popper ouvert : Cyber Pinball attend'
  Assert-Text 'demarrage' $c 'PinUP Popper fermé : Cyber Pinball démarre'
  if (-not (Test-Path "$c\00-depart.png")) { $failures += 'demarrage : le menu n''a pas démarré après la fermeture' }
}

if ($Scenarios -contains 'partie') {
  $temoin = "$base\popper-ouvert-ensuite"
  Remove-Item $temoin -ErrorAction SilentlyContinue
  # Popper « s'ouvre » une fois le menu affiché ; Start, Start : la fiche, puis Jouer.
  $c = Invoke-Scenario 'partie' @('wait:3000', $Start, $Start, 'wait:300', $Start, 'until:playing', 'until:menu') @() {
    param($captures)
    if (Wait-File "$captures\00-depart.png") { Set-Content -Path $temoin -Value 'ouvert' -Encoding ASCII }
  } $temoin
  $message = Get-ChildItem $c -Filter '03-*.png' | Select-Object -First 1
  if (-not $message) { $failures += 'partie : capture du message absente' }
  if (-not (Get-ChildItem $c -Filter '*until_playing.png')) { $failures += 'partie : la partie n''a pas commencé après « jouer quand même »' }
}

if ($Scenarios -contains 'assistant') {
  # Flippers changés jusqu'au bord que VPX ne sait pas afficher : Start avertit, Exit garde l'orientation, Start : la diagonale.
  $c = Invoke-Scenario 'assistant' @('ShiftRight', $Start, $Exit, $Start) @('--assistant', '--playfield') $null $null -Installe
}

if ($Scenarios -contains 'retourner') {
  $c = Invoke-Scenario 'retourner' @('ShiftRight', $Start, $Start, $Exit) @('--assistant', '--playfield') $null $null -Installe
}

if ($failures.Count) { throw "Cohabitation :`n$($failures -join "`n")" }
"`nCohabitation : captures dans tmp\captures\autre-menu."
