# Démonstration sans opérateur de l'étape « Boutons » de l'assistant : prépare un
# bac à sable dans tmp\demo-boutons (copie du modèle de borne et du VPinballX.ini
# réels), puis (avec -Run) :
#   1. --assistant --boutons sur la borne copiée : l'étape s'ouvre sur les touches en
#      vigueur, « Tout relever » à la souris, puis un encodeur réglé sur d'autres
#      touches : flippers sur A et S, Start sur 2, Exit sur Q, crédit sur 3, lanceur
#      sur W, Extra Ball sur D, les autres boutons facultatifs passés avec Exit. Une
#      touche déjà prise et la touche Windows sont refusées ; Exit relevé par erreur
#      est refait par Retour arrière ; au récapitulatif, Start sans essai est refusé,
#      un clic sur « Crédit » le refait, puis flippers, Exit et Start essayés
#      enregistrent. Captures dans tmp\captures\boutons\seul ; [Input] obtenu affiché ;
#   1b. --boutons sur une copie de cette borne : ses touches dès l'arrivée, le lanceur
#      choisi aux flippers et refait seul sur P, enregistré sans essai
#      (tmp\captures\boutons\lecture) ;
#   1c. --boutons sur une autre copie : « Touches par défaut » puis Start (1) enregistre
#      aussitôt, sans essai (tmp\captures\boutons\defauts) ;
#   2. assistant complet sur une borne neuve : personne ne touche à rien pendant 21 s,
#      les touches par défaut sont gardées et l'assistant passe aux écrans
#      (tmp\captures\boutons\delai) ;
#   3. assistant complet sur une borne neuve : « Touches par défaut » puis « Tout relever »
#      à la souris, puis les touches de l'étape 1 : la suite se pilote avec elles, le 1
#      ne valide plus rien (tmp\captures\boutons\complet) ;
#   4. menu des tables de la borne de l'étape 1 : aide-mémoire (H) avec ses touches, puis
#      menu système > « Touches par défaut des encodeurs » à la souris
#      (tmp\captures\boutons\menu) ;
#   5. réglages de VPX de cette borne : onglet Avancé, section Input, une touche gérée
#      (tmp\captures\boutons\reglages).
#   .\docs\demo-boutons.ps1 -Run
# Hors écran par défaut, sur les écrans simulés de docs\ecrans\<Ecrans>.json (-Ecrans) ;
# $env:CYBERPINBALL_A_L_ECRAN = '1' pour les vrais écrans du poste (docs\hors-ecran.ps1).
# Rien n'est écrit hors de tmp\demo-boutons : le vrai VPinballX.ini n'est que lu, et la
# démonstration échoue s'il a changé pendant qu'elle tournait.
param(
  [switch]$Run,
  [string]$Cabinet = 'D:\CyberPinball\data\cabinet.json',
  [string]$Ini = 'D:\CyberPinball\config\VPinballX.ini',
  [string]$Ecrans = 'pc-dev'
)
$ErrorActionPreference = 'Stop'
$wt = Split-Path $PSScriptRoot -Parent
. "$PSScriptRoot\hors-ecran.ps1"
# Tout le reste tourne sur un bureau Windows caché : rien ne peut apparaître sur les écrans du poste.
if (Enter-BureauCache $PSCommandPath $PSBoundParameters) { exit $LASTEXITCODE }
Use-HorsEcran $Ecrans
$base = "$wt\tmp\demo-boutons"
$captures = "$wt\tmp\captures\boutons"

if (Test-Path $base) { Remove-Item -Recurse -Force $base }
$root = "$base\root"; $borne = "$base\borne"; $neuve = "$base\neuve"; $neuve2 = "$base\neuve2"
$lecture = "$base\lecture"; $defauts = "$base\defauts"
New-Item -ItemType Directory -Force "$root\tables\Demo (Cyber Pinball 2026)", "$borne\sandbox", "$neuve\sandbox", "$neuve2\sandbox", "$lecture\sandbox", "$defauts\sandbox" | Out-Null
# Le modèle copié désigne le VPinballX.ini du bac à sable, jamais le vrai.
$model = Get-ModeleBorne $Cabinet
$model.vpx.iniPath = "$borne\sandbox\VPinballX.ini"
$model | ConvertTo-Json -Depth 20 | Set-Content -Path "$borne\cabinet.json" -Encoding UTF8
foreach ($h in $borne, $neuve, $neuve2) { if (Test-Path $Ini) { Copy-Item $Ini "$h\sandbox\VPinballX.ini" } }
# Une table factice, pour que le menu s'affiche (VPX n'est jamais lancé).
Set-Content -Path "$root\tables\Demo (Cyber Pinball 2026)\Demo (Cyber Pinball 2026).vpx" -Value '' -Encoding ASCII

if (-not $Run) { return }

function Invoke-Autopilot([string]$home_, [string[]]$codes, [string]$dir, [string[]]$arguments) {
  $env:CYBERPINBALL_HOME = $home_
  $env:CYBERPINBALL_AUTOPILOT = $codes -join ','
  $env:CYBERPINBALL_CAPTURE = "$captures\$dir"
  if (Test-Path $env:CYBERPINBALL_CAPTURE) { Remove-Item -Recurse -Force $env:CYBERPINBALL_CAPTURE }
  npx electron app @arguments
  Assert-HorsEcran $env:CYBERPINBALL_CAPTURE
  # Garde-fou de mise en page (layout-check.ts) : chevauchements, débordements, textes coupés.
  $report = "$env:CYBERPINBALL_CAPTURE\mise-en-page.txt"
  if (-not (Test-Path $report) -or (Get-Content $report -Raw) -notmatch '^Aucun problème') { $script:layoutFailures += "$dir : voir $report" }
}
$layoutFailures = @()

$env:CYBERPINBALL_ROOT = $root
# Pas de sortie audio : l'étape « Son » est passée, la démonstration reste centrée sur les boutons.
Set-Content -Path "$base\sans-son.json" -Value '[]' -Encoding ASCII
$env:CYBERPINBALL_AUDIO_OUTPUTS = "$base\sans-son.json"
$encodeur = @(
  'KeyA', 'KeyA',          # flipper gauche, puis A encore : refusé pour le flipper droit
  'KeyS', 'MetaLeft',      # flipper droit ; la touche Windows est refusée pour Start
  'Digit2', 'KeyQ',        # Start, Exit
  'Digit3', 'KeyW',        # crédit, lanceur
  'KeyQ', 'KeyQ',          # pas de MagnaSave
  'KeyD',                  # Extra Ball sur D : le débogueur de VPX perd sa touche
  'KeyQ', 'KeyQ', 'KeyQ', 'KeyQ', 'KeyQ', 'KeyQ' # ni tilt, ni tremblements, ni volume
)
# Récapitulatif : flippers, Exit puis Start essayés, Start valide.
$essai = @('KeyA', 'KeyS', 'KeyQ', 'Digit2')
# Erreurs corrigées sans les boutons : Exit relevé sur E par erreur, Retour arrière le refait ;
# au récapitulatif, Start pressé trop tôt (refusé : rien d'essayé), puis clic sur la ligne
# « Crédit » pour le refaire. L'étape s'ouvre sur les touches en vigueur : « Tout relever ».
$corrections = @(
  'click:#actions button:nth-child(4)', # Valider, Précédent, Touches par défaut, Tout relever
  'KeyA', 'KeyS', 'Digit2', 'KeyE', # Exit sur E par erreur
  'Backspace', 'KeyQ',              # Retour arrière : Exit refait sur Q
  'Digit3', 'KeyW', 'KeyQ', 'KeyQ', 'KeyD', 'KeyQ', 'KeyQ', 'KeyQ', 'KeyQ', 'KeyQ', 'KeyQ',
  'Digit2',                         # Start au récapitulatif sans essai : refusé
  'click:#buttons li:nth-child(5)', 'Digit5' # clic sur « Crédit », refait sur 5
)
$before = if (Test-Path $Ini) { (Get-FileHash $Ini).Hash }
Push-Location $wt
try {
  npm run build | Out-Null
  '== 1. Étape « Boutons » seule, encodeur sur d''autres touches'
  Invoke-Autopilot $borne (@($corrections) + @($essai)) 'seul' @('--assistant', '--boutons')
  '-- Boutons enregistrés dans cabinet.json'
  (Get-ModeleBorne "$borne\cabinet.json" -AvecBoutons).buttons | Format-List | Out-String
  '-- [Input] de VPinballX.ini'
  Select-String -Path "$borne\sandbox\VPinballX.ini" -Pattern '^Mapping\.(LeftFlipper|LeftStagedFlipper|UILeft|RightFlipper|Start|ExitGame|Credit1|Credit3|LaunchBall|LeftMagna|ExtraBall|Debugger|Pause) =' |
    ForEach-Object { $_.Line }

  # Copies de la borne de l'étape 1, chacune avec son propre VPinballX.ini.
  foreach ($h in $lecture, $defauts) {
    $copie = Get-ModeleBorne "$borne\cabinet.json" -AvecBoutons
    $copie.vpx.iniPath = "$h\sandbox\VPinballX.ini"
    $copie | ConvertTo-Json -Depth 20 | Set-Content -Path "$h\cabinet.json" -Encoding UTF8
    Copy-Item "$borne\sandbox\VPinballX.ini" "$h\sandbox\VPinballX.ini"
  }
  '== 1b. Étape « Boutons » seule : touches visibles à l''arrivée, le lanceur refait seul'
  # Flipper droit (S) : Valider, Précédent, Touches par défaut, Tout relever, puis les lignes ;
  # neuf crans jusqu'au Lanceur, Start (2) le refait, P, Start enregistre sans essai.
  Invoke-Autopilot $lecture (@('KeyS') * 9 + @('Digit2', 'KeyP', 'Digit2')) 'lecture' @('--assistant', '--boutons')
  (Get-ModeleBorne "$lecture\cabinet.json" -AvecBoutons).buttons | Format-List | Out-String

  '== 1c. Étape « Boutons » seule : touches par défaut, enregistrées sans essai'
  Invoke-Autopilot $defauts @('click:#actions button:nth-child(3)', 'Digit1') 'defauts' @('--assistant', '--boutons')
  (Get-ModeleBorne "$defauts\cabinet.json" -AvecBoutons).buttons | Format-List | Out-String

  '== 2. Assistant complet, personne ne touche à rien'
  Invoke-Autopilot $neuve @('Attendre21', 'ShiftRight', 'Digit1') 'delai' @('--assistant')

  '== 3. Assistant complet avec les touches de l''encodeur'
  # Touches par défaut à la souris, puis Tout relever, puis l'encodeur.
  $souris = @('click:#actions button:nth-child(2)', 'click:#actions button:nth-child(4)')
  Invoke-Autopilot $neuve2 (@($souris) + @($encodeur) + @($essai) + @('Digit1', 'KeyS', 'Digit2', 'Digit2', 'Digit2')) 'complet' @('--assistant')

  '== 4. Menu des tables de la borne de l''étape 1, puis touches par défaut à la souris'
  # « VPX n'est pas installé » : plus tard ; commandes ; menu système (Exit = Q) ; clic sur
  # « Configuration de la borne », puis sur « Touches par défaut des encodeurs » ; retour au
  # menu, commandes avec les touches par défaut. Les entrées sont désignées par leur libellé.
  # Roue dentée (clic) puis Tab pour se déplacer ; après la remise, Tab rouvre la configuration.
  $menu = @('Escape', 'KeyH', 'KeyH', 'click:.gear', 'Tab', 'Tab', 'click:.lib-action[data-label="Configuration de la borne"]', 'click:.lib-action[data-label="Touches par défaut des encodeurs"]', 'Escape', 'Tab', 'Escape', 'KeyH')
  Invoke-Autopilot $borne $menu 'menu' @()
  '-- Boutons de cabinet.json après la remise'
  (Get-ModeleBorne "$borne\cabinet.json" -AvecBoutons).buttons | Format-List | Out-String

  '== 5. Réglages de VPX : section Input'
  $sections = @('ArrowDown') * 8                  # Avancé : Version, Editor, Player… Input est la 8e section
  $mapping = @('ArrowDown') * 12                  # après Devices, les capteurs et les périphériques
  Invoke-Autopilot $borne (@('Tab') + $sections + 'Enter' + $mapping + 'Enter' + 'Escape' + @('ArrowDown') * 2 + 'Escape') 'reglages' @('--reglages')
} finally {
  Pop-Location
  $after = if (Test-Path $Ini) { (Get-FileHash $Ini).Hash }
  if ($before -ne $after) { throw "$Ini a changé pendant la démonstration : à vérifier." }
}
if ($layoutFailures.Count) { throw "Problèmes de mise en page :`n$($layoutFailures -join "`n")" }
