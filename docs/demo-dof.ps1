# Démonstration sans opérateur de « LED et retours (DOF) » (Menu système > Borne), hors écran
# sur un bureau Windows caché, avec des tables inventées (docs\demo-captures.cjs) et des
# contrôleurs USB simulés (CYBERPINBALL_USB_DEVICES) : la KL25Z d'une vraie borne (Pinscape en
# émulation LedWiz, unité 1) et un Teensy sur COM7, ce qui arrive quand des bandes WS2812 sont
# branchées sans configuration. Pour chaque jeu d'écrans et chaque langue :
#   page          : contrôleurs reconnus, « La KL25Z ne pilote pas de LED adressables », points à vérifier ;
#   éditeur       : « LED adressables », les bandes de la borne de référence (2 verticales, 2 anneaux), enregistrées :
#                   Cabinet.xml et GlobalConfig_B2SServer.xml écrits dans le dossier de DOF du bac à sable ;
#   cartes        : en français, Art-Net puis DudesCab (rien à écrire), puis retour au Teensy ;
#   page relue    : le Teensy n'est plus « non déclaré » ;
#   santé         : le contrôle « LED et retours (DOF) ».
# Le garde-fou de mise en page et le guet hors écran doivent rester muets, sinon le script échoue.
#   .\docs\demo-dof.ps1 [-Langues fr, en] [-Ecrans borne, poste-deux-ecrans]
# Captures dans tmp\demo-dof\<écrans>\<langue>\captures. VPX n'est jamais lancé, aucun port n'est
# ouvert ; ni le vrai dossier de DOF (%APPDATA%) ni le vrai modèle de borne ne sont lus ni touchés.
param(
  [string[]]$Langues = @('fr', 'en'),
  [string[]]$Ecrans = @('borne', 'poste-deux-ecrans')
)
$ErrorActionPreference = 'Stop'
$wt = Split-Path $PSScriptRoot -Parent
. "$PSScriptRoot\hors-ecran.ps1"
# Tout le reste tourne sur un bureau Windows caché : rien ne peut apparaître sur les écrans du poste.
if (Enter-BureauCache $PSCommandPath $PSBoundParameters) { exit $LASTEXITCODE }
$base = "$wt\tmp\demo-dof"
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

New-Item -ItemType Directory -Force $base | Out-Null
$usb = @'
[
  { "instanceId": "USB\\VID_FAFA&PID_00F0\\6&2d1e0c&0&2", "vid": 64250, "pid": 240, "name": "USB Input Device" },
  { "instanceId": "USB\\VID_16C0&PID_0483\\12345670", "vid": 5824, "pid": 1155, "name": "USB Serial Device (COM7)", "port": "COM7" }
]
'@
Set-Content -Path "$base\usb-dof.json" -Value $usb -Encoding UTF8

$touches = @(
  # Le premier Exit ferme le message de démarrage (VPX n'est pas installé dans le bac à sable).
  'Escape', 'wait:1500', 'Escape', 'wait:800', 'action:Borne', 'wait:600', 'action:LED et retours (DOF)', 'wait:1200',
  'action:Bandes de LED adressables…', 'wait:800'
)
# La borne réelle de référence (05/11/2026) : deux bandes verticales de part et d'autre du
# playfield, deux anneaux autour des haut-parleurs du fronton, chacun sur sa sortie.
foreach ($modele in @('Bande verticale à gauche du playfield', 'Bande verticale à droite du playfield', 'Anneau du haut-parleur gauche', 'Anneau du haut-parleur droit')) {
  $touches += @('action:Ajouter une bande', 'wait:600', "action:$modele", 'wait:600', 'Escape', 'wait:600')
}
$touches += @(
  'action:Enregistrer', 'wait:1200', 'Escape', 'wait:1000',
  'Escape', 'wait:600', 'action:Santé de la borne', 'wait:4000', 'Escape', 'wait:600'
)

try {
  foreach ($jeu in $Ecrans) {
    Use-HorsEcran $jeu
    foreach ($langue in $Langues) {
      "== $jeu, $langue"
      $dossier = "$base\$jeu\$langue"
      $home_ = "$dossier\home"
      $captures = "$dossier\captures"
      if (Test-Path $home_) { Remove-Item -Recurse -Force $home_ }
      New-Item -ItemType Directory -Force "$home_\sandbox" | Out-Null
      Set-Content "$home_\sandbox\VPinballX.ini" '' -Encoding UTF8
      node "$PSScriptRoot\demo-medias.cjs" modele "$PSScriptRoot\ecrans\$jeu.json" "$home_\cabinet.json" "$home_\sandbox\VPinballX.ini" | Out-Null
      if ($LASTEXITCODE -ne 0) { throw 'Modèle de borne des écrans simulés impossible.' }
      $env:CYBERPINBALL_HOME = $home_
      $env:CYBERPINBALL_ROOT = $root
      $env:CYBERPINBALL_LANGUE = $langue
      $env:CYBERPINBALL_USB_DEVICES = "$base\usb-dof.json"
      # En français, le choix de la carte d'abord : Art-Net (adresse, univers), DudesCab (bandes décrites
      # dans l'outil de la carte, rien à écrire), puis retour au Teensy (les libellés « Contrôleur : … »
      # n'ont pas de clé seule à traduire pour l'autopilote).
      $cartes = @()
      if ($langue -eq 'fr') {
        foreach ($carte in @('Art-Net (DMX)', 'DudesCab', 'Teensy (TeensyStripController)')) {
          $cartes += @('action:Contrôleur', 'wait:600', "action:$carte", 'wait:800')
          # Art-Net : une bande, pour la section « Dans WLED (LED Preferences) » et ses « Start », puis on la retire.
          if ($carte -eq 'Art-Net (DMX)') {
            $cartes += @('action:Ajouter une bande', 'wait:600', 'action:Bande verticale à gauche du playfield', 'wait:600', 'Escape', 'wait:800', 'action:Côté gauche', 'wait:600', 'action:Supprimer cette bande', 'wait:600')
          }
        }
      }
      $avantBandes = [array]::IndexOf($touches, 'action:Bandes de LED adressables…') + 2
      $suite = @($touches[0..($avantBandes - 1)]) + $cartes + @($touches[$avantBandes..($touches.Count - 1)])
      $env:CYBERPINBALL_AUTOPILOT = $suite -join ','
      $env:CYBERPINBALL_CAPTURE = $captures
      if (Test-Path $captures) { Remove-Item -Recurse -Force $captures }
      $id = "$jeu/$langue"
      Push-Location $wt
      # La sortie d'erreur d'Electron est relevée, pas fatale : une erreur JavaScript fait échouer la démonstration plus bas.
      $avant = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
      try { $log = & $electron --trace-warnings app 2>&1 | ForEach-Object { "$_" } } finally { $ErrorActionPreference = $avant; Pop-Location }
      $erreurs = @($log | Where-Object { $_ -match 'UnhandledPromiseRejection|TypeError|ReferenceError|^\s+at ' })
      if ($erreurs.Count) { $erreurs | ForEach-Object { Write-Host "   $_" }; $failures += "$id : erreur JavaScript, voir ci-dessus" }
      $log | Where-Object { $_ -match '^(Autopilote|Mise en page|Traduction manquante|Hors écran)' } | ForEach-Object { Write-Host "   $_" }

      if ($log -match 'Autopilote : aucun') { $failures += "$id : une action rejouée n'a pas trouvé son écran" }
      if ($log -match 'Traduction manquante') { $failures += "$id : texte sans traduction" }
      Assert-HorsEcran $captures
      $report = "$captures\mise-en-page.txt"
      if (-not (Test-Path $report)) { $failures += "$id : relevé de mise en page absent" }
      elseif ((Get-Content $report -Raw -Encoding UTF8) -notmatch '^Aucun problème') { $failures += "$id : mise en page, voir $report" }
      $dof = "$home_\sandbox\directoutputconfig"
      if (-not (Test-Path "$dof\Cabinet.xml")) { $failures += "$id : Cabinet.xml non écrit" }
      elseif (-not ((Get-Content "$dof\Cabinet.xml" -Raw -Encoding UTF8) -match '<NumberOfLedsStrip1>120</NumberOfLedsStrip1>[\s\S]*<NumberOfLedsStrip2>120</NumberOfLedsStrip2>[\s\S]*<NumberOfLedsStrip3>24</NumberOfLedsStrip3>[\s\S]*<NumberOfLedsStrip4>24</NumberOfLedsStrip4>' -and (Get-Content "$dof\Cabinet.xml" -Raw -Encoding UTF8) -match '<ComPortName>COM7</ComPortName>')) { $failures += "$id : Cabinet.xml sans les 4 bandes de la borne (120, 120, 24, 24) sur COM7" }
      if (-not (Test-Path "$dof\GlobalConfig_B2SServer.xml")) { $failures += "$id : GlobalConfig_B2SServer.xml non écrit" }
    }
  }
} finally {
  Remove-Item Env:CYBERPINBALL_LANGUE, Env:CYBERPINBALL_AUTOPILOT, Env:CYBERPINBALL_CAPTURE, Env:CYBERPINBALL_HOME, Env:CYBERPINBALL_ROOT, Env:CYBERPINBALL_USB_DEVICES -ErrorAction SilentlyContinue
}

if ($failures.Count) { throw "Démonstration de LED et retours (DOF) en échec :`n  $($failures -join "`n  ")" }
"Captures dans $base\<écrans>\<langue>\captures."
