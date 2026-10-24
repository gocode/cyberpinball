# Démonstration sans opérateur de l'écran « Ajuster la vue » : prépare un bac à sable dans
# tmp\demo-vue, avec deux tables factices :
# - Attack from Mars, dont le .ini a le bas de la table tronqué (CabinetAutofitPos = 0.02),
#   une difficulté et une ancienne vue manuelle (ViewCabVOfs) qui doivent survivre ;
# - Medieval Madness, livrée avec un cadrage manuel (CabinetAutofitMode = 0), que le médecin signale.
# Avec -Run : réglage aux boutons puis « Enregistrer », médecin, puis une seconde session
# « Revenir au réglage général » ; les fichiers écrits sont vérifiés. Captures dans
# tmp\captures\vue\1-reglage et 2-retour (-Portrait : joueur au bord droit, menu pivoté,
# dans tmp\captures\vue\portrait). VPX n'est jamais lancé : « Essayer » n'est pas pressé
# et les scripts des tables sont déjà « lus » (data\cache\scripts.json).
#   .\docs\demo-vue.ps1 -Run
# Hors écran par défaut, sur les écrans simulés de docs\ecrans\<Ecrans>.json (-Ecrans) ;
# $env:CYBERPINBALL_A_L_ECRAN = '1' pour les vrais écrans du poste (docs\hors-ecran.ps1).
param(
  [switch]$Run,
  [switch]$Portrait,
  [string]$Emulators = 'D:\CyberPinball\emulators',
  [string]$Cabinet = 'D:\CyberPinball\data\cabinet.json',
  [string]$RealIni = 'D:\CyberPinball\config\VPinballX.ini',
  [string]$Ecrans = 'pc-dev'
)
$ErrorActionPreference = 'Stop'
$wt = Split-Path $PSScriptRoot -Parent
. "$PSScriptRoot\hors-ecran.ps1"
# Tout le reste tourne sur un bureau Windows caché : rien ne peut apparaître sur les écrans du poste.
if (Enter-BureauCache $PSCommandPath $PSBoundParameters) { exit $LASTEXITCODE }
Use-HorsEcran $Ecrans
$base = "$wt\tmp\demo-vue"

if (Test-Path $base) {
  Get-ChildItem -Directory -Recurse -Depth 2 $base -Attributes ReparsePoint | ForEach-Object { cmd /c rmdir "$($_.FullName)" }
  Remove-Item -Recurse -Force $base
}
$root = "$base\root"; $home_ = "$base\home"
New-Item -ItemType Directory -Force "$root\tables", "$root\import", "$home_\cache" | Out-Null
New-Item -ItemType Junction -Path "$root\emulators" -Target $Emulators | Out-Null

# Modèle de borne : celui de ce PC, joueur au bord droit du playfield (vue borne pour VPX,
# BGSet = 1), et le .ini de VPX du bac à sable.
$model = Get-ModeleBorne $Cabinet
$model | Add-Member -Force -NotePropertyName playfield -NotePropertyValue ([pscustomobject]@{ flipperEdge = 'right' })
$model.vpx.iniPath = "$home_\sandbox\VPinballX.ini"
$model | ConvertTo-Json -Depth 20 | Set-Content -Path "$home_\cabinet.json" -Encoding UTF8

$scripts = [ordered]@{}
function New-Table($name, [string]$ini) {
  $vpx = "$root\tables\$name\$name.vpx"
  New-Item -ItemType Directory -Force (Split-Path $vpx) | Out-Null
  Set-Content -Path $vpx -Value "factice $name" -Encoding ASCII
  $date = [datetime]::new(2026, 1, 1, 0, 0, 0, [DateTimeKind]::Utc)
  (Get-Item $vpx).LastWriteTimeUtc = $date
  $scripts[$vpx.ToLower()] = [ordered]@{
    size = (Get-Item $vpx).Length
    mtimeMs = [DateTimeOffset]::new($date).ToUnixTimeMilliseconds()
    facts = [ordered]@{ usesPinmame = $false; roms = @() }
    v = 3
  }
  [IO.File]::WriteAllText("$root\tables\$name\$name.ini", $ini)
  return "$root\tables\$name\$name.ini"
}
$afm = 'Attack from Mars (Bally 1995)'
$afmIni = New-Table $afm "[Player]`r`nCabinetAutofitPos = 0.02`r`n`r`n[TableOverride]`r`nDifficulty = 0.8`r`nViewCabVOfs = 12`r`n"
$mmIni = New-Table 'Medieval Madness (Williams 1997)' "[Player]`r`nCabinetAutofitMode = 0`r`nSoundVolume = 60`r`n`r`n[TableOverride]`r`nViewCabVOfs = 18`r`n"
$scripts | ConvertTo-Json -Depth 5 | Set-Content -Path "$home_\cache\scripts.json" -Encoding UTF8

if (-not $Run) { "Bac à sable prêt : $base"; return }

# Le .ini de la table dans le bac à sable : <données>\sandbox\tables\<dossier de la table>\.
$copy = "$home_\sandbox\tables\$afm\$afm.ini"
$afmHash = (Get-FileHash $afmIni).Hash
$realHash = if (Test-Path $RealIni) { (Get-FileHash $RealIni).Hash }
$failed = $false
$captures = "$wt\tmp\captures\vue"

function Assert($ok, $message) { if ($ok) { "  ok : $message" } else { "  ÉCHEC : $message"; $script:failed = $true } }
function Ini($file) { if (Test-Path $file) { (Get-Content $file -Raw) -replace "`r", '' } else { '(absent)' } }
function Start-Demo($capture, [string[]]$steps) {
  $env:CYBERPINBALL_ROOT = $root; $env:CYBERPINBALL_HOME = $home_
  $env:CYBERPINBALL_CAPTURE = $capture
  $env:CYBERPINBALL_AUTOPILOT = $steps -join ','
  if ($Portrait) { Remove-Item Env:CYBERPINBALL_FLIPPERS -ErrorAction SilentlyContinue } else { $env:CYBERPINBALL_FLIPPERS = 'bottom' }
  if (Test-Path $capture) { Remove-Item -Recurse -Force $capture }
  Push-Location $wt
  # Electron du dépôt (le worktree n'a pas son propre node_modules complet). Start-Process -Wait :
  # l'opérateur & n'attend pas la fin d'un programme graphique. Données de Chromium dans tmp\.
  try {
    Start-Process -FilePath (node -p "require('electron')") -ArgumentList 'app', "--user-data-dir=`"$base\chromium`"" -WorkingDirectory $wt -Wait
  } finally { Pop-Location }
  Assert-HorsEcran $capture
  # Une capture par étape, plus celle du départ : sinon la session s'est arrêtée en route.
  $count = @(Get-ChildItem $capture -Filter *.png -ErrorAction SilentlyContinue).Count
  Assert ($count -eq $steps.Count + 1) "session complète ($count captures sur $($steps.Count + 1))"
}

if ($Portrait) {
  Start-Demo "$captures\portrait" @(
    'Digit1', 'action:Ajuster la vue',                # fiche, Ajuster la vue
    'ShiftRight', 'Digit1', 'ShiftRight',             # hauteur 3 %, cadrage : Remplir
    'Escape', 'ShiftLeft', 'Digit1', 'Escape'         # menu d'Exit, Quitter sans enregistrer, menu des tables
  )
  return
}

"1. Réglage aux boutons, Enregistrer, médecin de la table au cadrage manuel"
Start-Demo "$captures\1-reglage" @(
  'Digit1',                                          # fiche d'Attack from Mars
  'action:Ajuster la vue',                           # « Ajuster la vue » : hauteur 2 % (propre à la table)
  'ShiftRight', 'ShiftRight', 'ShiftRight', 'ShiftRight', 'ShiftRight',   # hauteur 7 %
  'Digit1', 'ShiftRight',                            # cadrage : Remplir l'écran (hauteur sans effet)
  'ShiftLeft',                                       # … retour à Ajuster la table
  'Digit1', 'ShiftLeft', 'ShiftLeft',                # hauteur des yeux : 60 cm
  'Escape',                                          # menu d'Exit
  'Digit1',                                          # Enregistrer : retour à la fiche
  'Escape', 'ShiftRight', 'Digit1',                  # fiche de Medieval Madness
  'action:Diagnostiquer et réparer',                 # Diagnostiquer et réparer
  'Escape', 'Escape'
)
$saved = Ini $copy
Assert ($saved -match 'CabinetAutofitPos = 0\.07') 'hauteur 7 % enregistrée'
Assert ($saved -match 'ScreenPlayerZ = 60') 'hauteur des yeux 60 cm enregistrée'
Assert ($saved -notmatch 'CabinetAutofitMode') 'cadrage égal au réglage général : non écrit'
Assert ($saved -match 'Difficulty = 0\.8' -and $saved -match 'ViewCabVOfs = 12') 'autres réglages de la table gardés'
Assert ((Get-FileHash $afmIni).Hash -eq $afmHash) 'le .ini à côté du .vpx n''est pas touché (bac à sable)'
Assert ((Ini $mmIni) -match 'CabinetAutofitMode = 0') 'médecin : constat seulement, rien réparé sans Start'
"   $copy :"; $saved -split "`n" | Where-Object { $_ } | ForEach-Object { "     $_" }

"2. Revenir au réglage général"
Start-Demo "$captures\2-retour" @(
  'Digit1', 'action:Ajuster la vue',                 # Ajuster la vue : 7 % et 60 cm, propres à la table
  'Escape', 'ShiftRight', 'ShiftRight', 'Digit1',    # menu d'Exit, Revenir au réglage général
  'Escape', 'ShiftLeft', 'Digit1',                   # menu d'Exit, Retour à la fiche
  'Escape'
)
$back = Ini $copy
Assert ($back -notmatch 'CabinetAutofitPos|ScreenPlayerZ|CabinetAutofitMode') 'plus aucune clé de vue'
Assert ($back -match 'Difficulty = 0\.8') 'la difficulté reste'
Assert (@(Get-ChildItem "$home_\backups\tables" -Filter "$afm.ini.*" -ErrorAction SilentlyContinue).Count -ge 1) 'sauvegarde avant réécriture'
if ($realHash) { Assert ((Get-FileHash $RealIni).Hash -eq $realHash) "$RealIni inchangé" }
"   $copy :"; $back -split "`n" | Where-Object { $_ } | ForEach-Object { "     $_" }
if ($failed) { exit 1 }
