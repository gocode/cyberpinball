# Démonstration sans opérateur des collections du menu des tables (collections.ts), hors écran sur
# un bureau Windows caché, avec les tables inventées de docs\demo-captures.cjs : Neon Abyss en
# favori comme le laisse une installation reprise (User.Favorite du .info), Lunar Diner et Copper
# Comet jamais jouées. Pour chaque jeu d'écrans et chaque langue :
#   collections : MagnaSave droit, quatre fois : Favoris (1), Récentes, Jamais jouées (2), puis le
#                 premier fabricant (Avec mes amis en ligne, vide, sautée) ; la liste des
#                 collections paraît à chaque appui ; un flipper la ferme et change de table ;
#                 MagnaSave gauche ramène aux collections d'avant, à la table qu'on y avait ;
#   favoris     : Start sur une table de Toutes, « Ajouter aux favoris » (l'étoile près du titre),
#                 retour au menu : Favoris compte deux tables ;
#   invité      : Mode invité, « Tables proposées » sur Favoris, activé : le repère porte le cadenas,
#                 MagnaSave n'y fait rien (porte fermée une fois) ; la combinaison déverrouille :
#                 la collection d'avant (Toutes) revient ;
#   attente     : la borne redémarre sur Favoris (collection gardée), mode attente après 3 s :
#                 chaque table tirée est un favori.
# Le journal doit dire chaque changement de collection, le favori ajouté, une seule porte fermée,
# et le garde-fou de mise en page et le guet hors écran rester muets.
#   .\docs\demo-collections.ps1 [-Langues fr, en] [-Ecrans borne, poste-deux-ecrans, un-ecran]
# Captures dans tmp\demo-collections\<écrans>\<langue>\captures (puis captures-attente). VPX n'est
# jamais lancé ; ni le vrai modèle de borne ni le vrai VPinballX.ini ne sont lus ni touchés.
param(
  [string[]]$Langues = @('fr', 'en'),
  [string[]]$Ecrans = @('borne', 'poste-deux-ecrans', 'un-ecran')
)
$ErrorActionPreference = 'Stop'
$wt = Split-Path $PSScriptRoot -Parent
. "$PSScriptRoot\hors-ecran.ps1"
# Tout le reste tourne sur un bureau Windows caché : rien ne peut apparaître sur les écrans du poste.
if (Enter-BureauCache $PSCommandPath $PSBoundParameters) { exit $LASTEXITCODE }
$base = "$wt\tmp\demo-collections"
$electron = node -p "require('electron')"
$failures = @()

Push-Location $wt
try { npm run build | Out-Null } finally { Pop-Location }

$Start = 'Digit1'; $Exit = 'Escape'; $Right = 'ShiftRight'; $MagnaL = 'ControlLeft'; $MagnaR = 'ControlRight'
$hold = 'ShiftLeft', 'ControlLeft', 'ShiftRight', 'ControlRight'

# Les tables de chaque jeu d'écrans : refaites à chaque fois (la démonstration change leurs .info).
function New-Racine([string]$root) {
  if (Test-Path $root) { Remove-Item -Recurse -Force $root }
  Push-Location $wt
  try { & $electron docs\demo-captures.cjs $root 2>&1 | ForEach-Object { "   $_" } } finally { Pop-Location }
  if ($LASTEXITCODE -ne 0) { throw 'Génération des médias en échec.' }
  # Neon Abyss : favori venu d'une autre installation ; Lunar Diner et Copper Comet : jamais jouées.
  foreach ($t in Get-ChildItem "$root\tables" -Directory) {
    $info = Get-ChildItem $t.FullName -Filter *.info | Select-Object -First 1
    if (-not $info) { continue }
    $json = Get-Content $info.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($t.Name -like 'Neon Abyss*') { $json.User | Add-Member -NotePropertyName Favorite -NotePropertyValue 1 -Force }
    if ($t.Name -like 'Lunar Diner*' -or $t.Name -like 'Copper Comet*') { $json.PSObject.Properties.Remove('User') }
    [IO.File]::WriteAllText($info.FullName, ($json | ConvertTo-Json -Depth 6), [Text.UTF8Encoding]::new($false))
  }
}

$touches = @(
  # Le message « VPX n'est pas installé » (bac à sable) : Exit le ferme ; le menu, sur Toutes.
  $Exit, 'wait:1500',
  $MagnaR, 'wait:600', $MagnaR, 'wait:600', $MagnaR, 'wait:600', $MagnaR, 'wait:600',
  # Un flipper : la liste se ferme, la table change.
  $Right, 'wait:800',
  $MagnaL, 'wait:600', $MagnaL, 'wait:600', $MagnaL, 'wait:600', $MagnaL, 'wait:4800',
  # Favoris : depuis Toutes, Start sur une table, « Ajouter aux favoris », retour.
  $Start, 'wait:800', 'action:Ajouter aux favoris', 'wait:800', $Exit, 'wait:800', $MagnaR, 'wait:4800',
  $MagnaL, 'wait:4800',
  # Mode invité restreint aux favoris.
  $Exit, 'wait:800', 'action:Borne', 'wait:600', 'action:Mode invité', 'wait:800', 'action:Tables proposées', 'wait:600',
  'action:Activer le mode invité', 'wait:1200', $MagnaR, 'wait:3500'
) + @($hold | ForEach-Object { "hold:$_" }) + @('wait:1200', 'wait:2200') + @($hold | ForEach-Object { "release:$_" }) + @('wait:4500')

function Invoke-Menu([string]$captures, [string[]]$etapes) {
  $env:CYBERPINBALL_AUTOPILOT = $etapes -join ','
  $env:CYBERPINBALL_CAPTURE = $captures
  if (Test-Path $captures) { Remove-Item -Recurse -Force $captures }
  Push-Location $wt
  # Une ligne de Chromium sur la sortie d'erreur (cache partagé avec une autre démonstration) n'arrête rien : le journal juge.
  $ErrorActionPreference = 'Continue'
  try { $log = & $electron app 2>&1 | ForEach-Object { "$_" } } finally { Pop-Location; $ErrorActionPreference = 'Stop' }
  New-Item -ItemType Directory -Force $captures | Out-Null
  $log | Set-Content "$captures\journal.txt" -Encoding UTF8
  $log | Where-Object { $_ -match '^(Autopilote|Mise en page|Traduction manquante|Hors écran|Mode invité|Collections|Favoris|Mode attente)' } | ForEach-Object { Write-Host "   $_" }
  return $log
}

function Test-Captures([string]$id, [string]$captures, $log) {
  if ($log -match 'Autopilote : aucun') { $script:failures += "$id : une action rejouée n'a pas trouvé son écran" }
  if ($log -match 'Traduction manquante') { $script:failures += "$id : texte sans traduction" }
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
      $root = "$dossier\root"
      New-Racine $root
      $home_ = "$dossier\home"
      if (Test-Path $home_) { Remove-Item -Recurse -Force $home_ }
      New-Item -ItemType Directory -Force "$home_\sandbox" | Out-Null
      Set-Content "$home_\sandbox\VPinballX.ini" '' -Encoding UTF8
      node "$PSScriptRoot\demo-medias.cjs" modele "$PSScriptRoot\ecrans\$jeu.json" "$home_\cabinet.json" "$home_\sandbox\VPinballX.ini" | Out-Null
      if ($LASTEXITCODE -ne 0) { throw 'Modèle de borne des écrans simulés impossible.' }
      @{ music = $false } | ConvertTo-Json | Set-Content -Path "$home_\medias.json" -Encoding UTF8
      $env:CYBERPINBALL_HOME = $home_
      $env:CYBERPINBALL_ROOT = $root
      $env:CYBERPINBALL_LANGUE = $langue
      $id = "$jeu/$langue"

      $log = Invoke-Menu "$dossier\captures" $touches
      Test-Captures $id "$dossier\captures" $log
      $suite = @($log | Where-Object { $_ -match '^Collections : ' } | ForEach-Object { ($_ -replace '^Collections : ([^ ]+) .*$', '$1') })
      $attendu = @('favorites', 'recent', 'unplayed', 'maker:gulfstream', 'unplayed', 'recent', 'favorites', 'all', 'favorites', 'all')
      if (($suite -join ',') -ne ($attendu -join ',')) { $failures += "$id : collections parcourues « $($suite -join ', ') » au lieu de « $($attendu -join ', ') »" }
      if (-not ($log -match '^Favoris : .* ajoutée\.')) { $failures += "$id : le favori n'a pas été ajouté" }
      if (-not ($log -match '^Collections : favorites \(2\)')) { $failures += "$id : Favoris ne compte pas deux tables après l'ajout" }
      $refus = @($log | Where-Object { $_ -eq 'Mode invité : porte fermée (menu.collection-locked).' }).Count
      if ($refus -ne 1) { $failures += "$id : MagnaSave refusé $refus fois en mode invité au lieu d'une" }
      if (@($log | Where-Object { $_ -match '^Mode invité : porte fermée' }).Count -ne 1) { $failures += "$id : une autre porte s'est fermée" }
      if (-not ($log -match '^Mode invité : limité à la collection favorites\.')) { $failures += "$id : le mode invité n'a pas été limité aux favoris" }
      if (-not ($log -match '^Mode invité : déverrouillé')) { $failures += "$id : la combinaison n'a pas déverrouillé" }
      $collections = Get-Content "$home_\collections.json" -Raw | ConvertFrom-Json
      if ($collections.active -ne 'all') { $failures += "$id : après le déverrouillage, la collection gardée est « $($collections.active) » au lieu de Toutes" }

      # Redémarrage sur Favoris (deux tables), mode attente après 3 s : seuls des favoris sont tirés.
      Set-Content "$home_\collections.json" '{ "active": "favorites" }' -Encoding UTF8
      @{ music = $false; attractDelay = 3; attractInterval = 3 } | ConvertTo-Json | Set-Content -Path "$home_\medias.json" -Encoding UTF8
      $log = Invoke-Menu "$dossier\captures-attente" @($Exit, 'wait:12000')
      Test-Captures "$id (attente)" "$dossier\captures-attente" $log
      $tires = @($log | Where-Object { $_ -match '^Mode attente : ' })
      if ($tires.Count -lt 2) { $failures += "$id : le mode attente n'a tiré que $($tires.Count) table(s)" }
      foreach ($t in $tires) { if ($t -notmatch '\(collection favorites\)\.$') { $failures += "$id : attente hors de la collection Favoris : $t" } }
      $hors = @($tires | Where-Object { $_ -notmatch '^Mode attente : (Neon Abyss|Atlas Rising)' })
      if ($hors.Count) { $failures += "$id : tirée hors des favoris : $($hors -join ' ; ')" }
    }
  }
} finally {
  Remove-Item Env:CYBERPINBALL_LANGUE, Env:CYBERPINBALL_AUTOPILOT, Env:CYBERPINBALL_CAPTURE, Env:CYBERPINBALL_HOME, Env:CYBERPINBALL_ROOT -ErrorAction SilentlyContinue
}

if ($failures.Count) { throw "Démonstration des collections en échec :`n  $($failures -join "`n  ")" }
"Captures dans $base\<écrans>\<langue>\captures et captures-attente."
