# Démonstration sans opérateur de « DMD sur la roue » (menudmd.ts, app/src/menu-dmd.ts), hors écran
# sur un bureau Windows caché, écrans simulés du PinCab (FullDMD 16:9 sur son propre écran), tables
# inventées de docs\demo-captures.cjs, médias FullDMD inventés de docs\demo-dmd-roue.cjs :
#   Atlas Rising : média FullDMD au cadre de DMD dessiné : sur la roue, les points dans le cadre ;
#                  fiche > « Gérer la table… » > « DMD sur la roue » : le cadre du réglage et sa légende,
#                  la taille réduite et les points remontés aux flippers (maintenus : plus vite),
#                  « Enregistrer pour cette table » ; retour à la roue : les points à la place réglée ;
#   Copper Comet : média FullDMD sans cadre : la bande 4:1 centrée sur du noir ; « DMD sur la roue »
#                  masqué, enregistré : sur la roue, le média FullDMD seul, sans points ;
#   retour à Atlas Rising : sa place réglée est toujours là (réglage par table).
# Le réglage de la partie n'est jamais touché : positions-dmd.json reste absent. Le journal doit
# dire les deux réglages, dmd-roue.json les garder, l'état de l'écran du DMD (son.txt) suivre
# chaque étape, et le garde-fou de mise en page et le guet hors écran rester muets.
#   .\docs\demo-dmd-roue.ps1 [-Langues fr, en]
# Captures dans tmp\demo-dmd-roue\<langue>\captures (écran du DMD : captures\ecrans\*-dmd.png).
# VPX n'est jamais lancé ; ni le vrai modèle de borne ni le vrai VPinballX.ini ne sont lus ni touchés.
param([string[]]$Langues = @('fr', 'en'))
$ErrorActionPreference = 'Stop'
$wt = Split-Path $PSScriptRoot -Parent
. "$PSScriptRoot\hors-ecran.ps1"
# Tout le reste tourne sur un bureau Windows caché : rien ne peut apparaître sur les écrans du poste.
if (Enter-BureauCache $PSCommandPath $PSBoundParameters) { exit $LASTEXITCODE }
$base = "$wt\tmp\demo-dmd-roue"
$electron = node -p "require('electron')"
$failures = @()

Push-Location $wt
try { npm run build | Out-Null } finally { Pop-Location }

$Start = 'Digit1'; $Exit = 'Escape'; $Left = 'ShiftLeft'; $Right = 'ShiftRight'
$libelles = @{
  fr = @{ gerer = 'Gérer la table'; entree = 'DMD sur la roue'; taille = 'Taille'; vertical = 'Position verticale'; enregistrer = 'Enregistrer pour cette table' }
  en = @{ gerer = 'Manage the table'; entree = 'DMD on the wheel'; taille = 'Size'; vertical = 'Vertical position'; enregistrer = 'Save for this table' }
}

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
  $log | Where-Object { $_ -match '^(Autopilote|Mise en page|Traduction manquante|Hors écran|DMD sur la roue|Position du DMD)' } | ForEach-Object { Write-Host "   $_" }
  return $log
}

# État de l'écran du DMD après une étape (son.txt : ce que montre chaque écran, cyberEtat).
function Get-EtatDmd([string]$captures, [string]$etape) {
  $ligne = Get-Content "$captures\son.txt" -Encoding UTF8 | Where-Object { $_ -like "$etape*" } | Select-Object -First 1
  if (-not $ligne) { return $null }
  $json = $ligne.Substring($ligne.IndexOf(' : ') + 3) | ConvertFrom-Json
  return $json.ecrans.dmd.dmd
}

try {
  Use-HorsEcran 'pincab'
  foreach ($langue in $Langues) {
    "== pincab, $langue"
    $L = $libelles[$langue]
    $dossier = "$base\$langue"
    $root = "$dossier\root"
    if (Test-Path $root) { Remove-Item -Recurse -Force $root }
    Push-Location $wt
    try { & $electron docs\demo-captures.cjs $root 2>&1 | ForEach-Object { "   $_" } } finally { Pop-Location }
    if ($LASTEXITCODE -ne 0) { throw 'Génération des médias en échec.' }
    node "$PSScriptRoot\demo-dmd-roue.cjs" "$root\tables" | ForEach-Object { "   $_" }
    if ($LASTEXITCODE -ne 0) { throw 'Médias FullDMD impossibles.' }
    $home_ = "$dossier\home"
    if (Test-Path $home_) { Remove-Item -Recurse -Force $home_ }
    New-Item -ItemType Directory -Force "$home_\sandbox" | Out-Null
    Set-Content "$home_\sandbox\VPinballX.ini" '' -Encoding UTF8
    node "$PSScriptRoot\demo-medias.cjs" modele "$PSScriptRoot\ecrans\pincab.json" "$home_\cabinet.json" "$home_\sandbox\VPinballX.ini" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Modèle de borne des écrans simulés impossible.' }
    @{ music = $false } | ConvertTo-Json | Set-Content -Path "$home_\medias.json" -Encoding UTF8
    $env:CYBERPINBALL_HOME = $home_
    $env:CYBERPINBALL_ROOT = $root
    $env:CYBERPINBALL_LANGUE = $langue

    $etapes = @(
      # Le message « VPX n'est pas installé » (bac à sable) : Exit le ferme ; la roue, sur Atlas Rising.
      $Exit, 'wait:2500',
      $Start, 'wait:800', "action:$($L.gerer)", "action:$($L.entree)", 'wait:1200',
      "action:$($L.taille)", "repeat:$($Left):22", $Start,
      "action:$($L.vertical)", "repeat:$($Left):24", $Start,
      "action:$($L.enregistrer)", 'wait:600',
      $Exit, $Exit, 'wait:600', $Exit, 'wait:1800',
      # Copper Comet : la bande sur du noir, puis masqué.
      $Right, 'wait:2500',
      $Start, 'wait:800', "action:$($L.gerer)", "action:$($L.entree)", 'wait:800', "action:$($L.entree)", 'wait:800',
      "action:$($L.enregistrer)", 'wait:600',
      $Exit, $Exit, 'wait:600', $Exit, 'wait:1800',
      # Retour à Atlas Rising : sa place réglée.
      $Left, 'wait:1800'
    )
    $captures = "$dossier\captures"
    $log = Invoke-Menu $captures $etapes
    $id = "pincab/$langue"
    if ($log -match 'Autopilote : aucun') { $failures += "$id : une action rejouée n'a pas trouvé son écran" }
    if ($log -match 'Traduction manquante') { $failures += "$id : texte sans traduction" }
    Assert-HorsEcran $captures
    $report = "$captures\mise-en-page.txt"
    if (-not (Test-Path $report)) { $failures += "$id : relevé de mise en page absent" }
    elseif ((Get-Content $report -Raw -Encoding UTF8) -notmatch '^Aucun problème') { $failures += "$id : mise en page, voir $report" }

    # Sortie d'Electron lue dans la page de code de la console : pas d'accent dans ces motifs.
    if (-not ($log -match '^DMD sur la roue \(Atlas Rising.*\) : place r.+gl.+e\.$')) { $failures += "$id : la place d'Atlas Rising n'a pas été enregistrée" }
    if (-not ($log -match '^DMD sur la roue \(Copper Comet.*\) : masqu.+\.$')) { $failures += "$id : Copper Comet n'a pas été masqué" }
    if (Test-Path "$home_\positions-dmd.json") { $failures += "$id : le réglage de la partie (positions-dmd.json) a été écrit" }
    $fichier = Get-Content "$home_\dmd-roue.json" -Raw | ConvertFrom-Json
    $places = @($fichier.places.PSObject.Properties)[0].Value
    $atlas = @($places.PSObject.Properties | Where-Object { $_.Name -like 'Atlas Rising*' })[0].Value
    $copper = @($places.PSObject.Properties | Where-Object { $_.Name -like 'Copper Comet*' })[0].Value
    if (-not $atlas.zone -or $atlas.hidden) { $failures += "$id : Atlas Rising sans place réglée dans dmd-roue.json" }
    if (-not $copper.hidden -or $copper.zone) { $failures += "$id : Copper Comet devrait être masqué, sans place (dmd-roue.json)" }

    # L'écran du DMD à chaque moment clé (numéros d'étape de l'autopilote, « 00-depart » compris).
    # « visible » n'est exigé que pour le DMD masqué : ailleurs, l'alternance peut être sur la page du média.
    $noms = @(Get-Content "$captures\son.txt" -Encoding UTF8 | ForEach-Object { $_.Substring(0, $_.IndexOf(' : ')) })
    $attendus = @(
      @{ etape = $noms[2]; quoi = 'roue, Atlas Rising, cadre trouvé'; masque = $false; reglage = $false; cadre = $true },
      @{ etape = $noms[7]; quoi = 'réglage ouvert sur Atlas Rising'; masque = $false; reglage = $true; cadre = $true },
      @{ etape = $noms[20]; quoi = 'roue, Atlas Rising, place réglée'; masque = $false; reglage = $false; cadre = $true },
      @{ etape = $noms[22]; quoi = 'roue, Copper Comet, bande sur du noir'; masque = $false; reglage = $false; cadre = $false },
      @{ etape = $noms[36]; quoi = 'roue, Copper Comet masqué'; visible = $false; masque = $true; reglage = $false },
      @{ etape = $noms[38]; quoi = 'roue, retour à Atlas Rising'; masque = $false; reglage = $false; cadre = $true }
    )
    foreach ($a in $attendus) {
      $etat = Get-EtatDmd $captures $a.etape
      if (-not $etat) { $failures += "$id : $($a.quoi) ($($a.etape)) : pas d'afficheur à points"; continue }
      foreach ($k in 'visible', 'masque', 'reglage', 'cadre') {
        if ($a.ContainsKey($k) -and [bool]$etat.$k -ne $a[$k]) { $failures += "$id : $($a.quoi) ($($a.etape)) : $k = $($etat.$k) au lieu de $($a[$k])" }
      }
    }
  }
} finally {
  Remove-Item Env:CYBERPINBALL_LANGUE, Env:CYBERPINBALL_AUTOPILOT, Env:CYBERPINBALL_CAPTURE, Env:CYBERPINBALL_HOME, Env:CYBERPINBALL_ROOT -ErrorAction SilentlyContinue
}

if ($failures.Count) { throw "Démonstration de « DMD sur la roue » en échec :`n  $($failures -join "`n  ")" }
"DMD sur la roue : aucun problème. Captures dans $base\<langue>\captures (écran du DMD : ecrans\*-dmd.png)."
