# Démonstration sans opérateur du sens des tables d'un démarrage à l'autre, hors écran sur un
# bureau Windows caché, écrans simulés de la borne (docs\ecrans\borne.json : playfield 4K couché,
# joueur au bord gauche de l'image) dont l'orientation est simulée (ecrans-simules-orientation.json
# du dossier des données). L'assistant y a retourné l'écran (180°) pour que VPX dessine les
# flippers du côté du joueur ; au redémarrage, Windows rend son réglage (0°), comme sur un PinCab
# réel. Aucun vrai écran n'est tourné.
#   redemarrages : borne configurée avant le 27/10/2026 (le modèle ne dit pas l'orientation de
#                  jeu), deux démarrages, Windows en 0° à chacun : la session redonne 180° avant
#                  la synchronisation de VPinballX.ini, sans avertissement « à l'envers » ;
#                  « Santé de la borne » dit « Tables dans votre sens » ;
#   recente      : borne configurée depuis (playfield.windowsRotation = 180) : de même ;
#   sans-remise  : l'assistant n'a pas retourné (retournement refusé, 0°) : rien n'est tourné, la
#                  synchronisation avertit et « Santé de la borne » dit « Tables à l'envers ».
#   .\docs\demo-sens-playfield.ps1 [-Scenarios redemarrages, recente, sans-remise] [-Langues fr, en]
# Captures dans tmp\demo-sens-playfield\<scénario>\<langue>\demarrage-<n>\captures. VPX n'est
# jamais lancé ; ni le vrai modèle de borne ni le vrai VPinballX.ini ne sont lus ni touchés.
param(
  [string[]]$Scenarios = @('redemarrages', 'recente', 'sans-remise'),
  [string[]]$Langues = @('fr', 'en')
)
$ErrorActionPreference = 'Stop'
$wt = Split-Path $PSScriptRoot -Parent
. "$PSScriptRoot\hors-ecran.ps1"
# Tout le reste tourne sur un bureau Windows caché : rien ne peut apparaître sur les écrans du poste.
if (Enter-BureauCache $PSCommandPath $PSBoundParameters) { exit $LASTEXITCODE }
$base = "$wt\tmp\demo-sens-playfield"
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

# Modèle de la borne après l'assistant : orientation du playfield à l'enregistrement, bord du
# joueur dans cette image, orientation de jeu notée dans le modèle (-1 : version d'avant le 27/10/2026).
function Set-Assistant([string]$cabinet, [int]$rotation, [string]$edge, [int]$windowsRotation) {
  $script = @'
const [file, rotation, edge, windowsRotation] = process.argv.slice(1);
const fs = require('fs');
const model = JSON.parse(fs.readFileSync(file, 'utf8'));
const fp = model.roles.playfield;
model.screens.find((s) => s.fingerprint === fp).lastSeen.rotation = Number(rotation);
model.playfield.flipperEdge = edge;
if (Number(windowsRotation) >= 0) model.playfield.windowsRotation = Number(windowsRotation);
else delete model.playfield.windowsRotation;
fs.writeFileSync(file, JSON.stringify(model, null, 2));
'@
  node -e $script $cabinet $rotation $edge $windowsRotation
  if ($LASTEXITCODE -ne 0) { throw 'Modèle de borne impossible.' }
}

$Exit = 'Escape'
# Au départ, le message « VPX n'est pas installé » (le bac à sable n'a pas VPX) : Exit le ferme ;
# Exit encore : le menu système, puis « Santé de la borne », le temps du relevé.
$etapes = @('wait:1500', $Exit, 'wait:800', $Exit, 'wait:1200', 'action:Santé de la borne', 'wait:6000')
# Windows rend toujours 0° (borne.json) ; Tournee : la session donne 180° au démarrage et rend 0° à la sortie.
$scenes = [ordered]@{
  redemarrages  = @{ Assistant = 180; Bord = 'right'; Jeu = -1; Demarrages = 2; Tournee = $true; Avertit = $false }
  recente       = @{ Assistant = 180; Bord = 'right'; Jeu = 180; Demarrages = 1; Tournee = $true; Avertit = $false }
  'sans-remise' = @{ Assistant = 0; Bord = 'left'; Jeu = -1; Demarrages = 1; Tournee = $false; Avertit = $true }
}

try {
  foreach ($scenario in $Scenarios) {
    if (-not $scenes.Contains($scenario)) { throw "Scénario inconnu : $scenario ($($scenes.Keys -join ', '))." }
    $scene = $scenes[$scenario]
    foreach ($langue in $Langues) {
      $dossier = "$base\$scenario\$langue"
      $home_ = "$dossier\home"
      if (Test-Path $dossier) { Remove-Item -Recurse -Force $dossier }
      New-Item -ItemType Directory -Force "$home_\sandbox" | Out-Null
      Set-Content "$home_\sandbox\VPinballX.ini" '' -Encoding UTF8
      Use-HorsEcran 'borne'
      node "$PSScriptRoot\demo-medias.cjs" modele "$PSScriptRoot\ecrans\borne.json" "$home_\cabinet.json" "$home_\sandbox\VPinballX.ini" | Out-Null
      if ($LASTEXITCODE -ne 0) { throw 'Modèle de borne des écrans simulés impossible.' }
      Set-Assistant "$home_\cabinet.json" $scene.Assistant $scene.Bord $scene.Jeu
      $env:CYBERPINBALL_HOME = $home_
      $env:CYBERPINBALL_ROOT = $root
      $env:CYBERPINBALL_LANGUE = $langue
      $env:CYBERPINBALL_AUTOPILOT = $etapes -join ','
      for ($n = 1; $n -le $scene.Demarrages; $n++) {
        $id = "$scenario/$langue/démarrage $n"
        "== $id (assistant en $($scene.Assistant)°, Windows en 0°)"
        $env:CYBERPINBALL_CAPTURE = "$dossier\demarrage-$n\captures"
        Push-Location $wt
        try { $log = & $electron app 2>&1 | ForEach-Object { "$_" } } finally { Pop-Location }
        $log | Where-Object { $_ -match '^(Autopilote|Mise en page|Traduction manquante|Hors écran|Orientation|Synchronisation)' } | ForEach-Object { Write-Host "   $_" }
        if ($log -match 'Autopilote : aucun') { $failures += "$id : une action rejouée n'a pas trouvé son écran" }
        if ($log -match 'Traduction manquante') { $failures += "$id : texte sans traduction" }
        $tournee = [bool]($log -match '^Orientation : démarrage, .*0° → 180°')
        if ($tournee -ne $scene.Tournee) { $failures += "$id : orientation de jeu $(if ($tournee) { 'donnée' } else { 'pas donnée' }) au démarrage" }
        $rendue = [bool]($log -match '^Orientation : sortie, .*180° → 0°')
        if ($rendue -ne $scene.Tournee) { $failures += "$id : orientation de Windows $(if ($rendue) { 'rendue' } else { 'pas rendue' }) à la sortie" }
        $avertit = [bool]($log -match "^Synchronisation : .*(l'envers|upside down)")
        if ($avertit -ne $scene.Avertit) { $failures += "$id : avertissement « à l'envers » $(if ($avertit) { 'donné' } else { 'absent' })" }
        Assert-HorsEcran $env:CYBERPINBALL_CAPTURE
        $report = "$env:CYBERPINBALL_CAPTURE\mise-en-page.txt"
        if (-not (Test-Path $report)) { $failures += "$id : relevé de mise en page absent" }
        elseif ((Get-Content $report -Raw -Encoding UTF8) -notmatch '^Aucun problème') { $failures += "$id : mise en page, voir $report" }
      }
    }
  }
} finally {
  Remove-Item Env:CYBERPINBALL_LANGUE, Env:CYBERPINBALL_AUTOPILOT, Env:CYBERPINBALL_CAPTURE, Env:CYBERPINBALL_HOME, Env:CYBERPINBALL_ROOT, Env:CYBERPINBALL_DISPLAYS, Env:CYBERPINBALL_HORS_ECRAN -ErrorAction SilentlyContinue
}

if ($failures.Count) { throw "Démonstration du sens des tables en échec :`n  $($failures -join "`n  ")" }
"Captures dans $base\<scénario>\<langue>\demarrage-<n>\captures."
