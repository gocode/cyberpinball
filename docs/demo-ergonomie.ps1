# Démonstration sans opérateur des améliorations d'ergonomie du 06/11/2026, hors écran sur un
# bureau Windows caché, avec des tables inventées (docs\demo-captures.cjs). Pour chaque jeu
# d'écrans (borne au playfield couché et pivoté, poste de bureau à deux écrans) et chaque langue :
#   menus      : « Start sur la roue : jouer directement » (medias.json) : la ligne d'aide « Start :
#                jouer · Start tenu : fiche », Start maintenu qui ouvre la fiche, l'aide-mémoire (H) ;
#                F6 : la fiche resserrée (Jouer, Prospectus et règles, Gérer la table…) ;
#                « Gérer la table », « Médias du jeu » et sa liste (« Exit : actions » en tête), les
#                retours nommés (« ‹ Gérer la table », « ‹ Neon Abyss », « ‹ Menu des tables »), le
#                livret « Prospectus et règles », la fiche ouverte depuis « Toutes les tables » ;
#   chargement : un Start court lance la table ; la partie simulée tarde (90 s) : passé 8 s, le
#                chargement du bureau dit l'étape vue (VPX lancé, puis ses fenêtres), le temps écoulé et
#                l'arrêt ; en borne, rien sur le média ;
#                Exit l'arrête, la roue revient, rien n'est compté.
# Le garde-fou de mise en page, le guet hors écran et le parcours des retours (aucun retour qui
# arrive ailleurs que là où il l'annonçait) doivent rester muets.
#   .\docs\demo-ergonomie.ps1 [-Langues fr, en] [-Ecrans borne, poste-deux-ecrans] [-Etapes menus, chargement]
# Captures dans tmp\demo-ergonomie\<écrans>\<langue>\<étape>. VPX n'est jamais lancé (fausse
# installation, partie simulée) ; ni le vrai modèle de borne ni le vrai VPinballX.ini ne sont lus ni touchés.
param(
  [string[]]$Langues = @('fr', 'en'),
  [string[]]$Ecrans = @('borne', 'poste-deux-ecrans'),
  [string[]]$Etapes = @('menus', 'chargement')
)
$ErrorActionPreference = 'Stop'
$wt = Split-Path $PSScriptRoot -Parent
. "$PSScriptRoot\hors-ecran.ps1"
# Tout le reste tourne sur un bureau Windows caché : rien ne peut apparaître sur les écrans du poste.
if (Enter-BureauCache $PSCommandPath $PSBoundParameters) { exit $LASTEXITCODE }
$base = "$wt\tmp\demo-ergonomie"
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
# VPX « installé » (fausse installation) : les parties sont simulées, jamais lancées.
New-FauxVpx $root

$Start = 'Digit1'; $Exit = 'Escape'; $Next = 'ShiftRight'; $Magna = 'F6'
$sequences = @{
  menus = @(
    'wait:1500',                                          # roue : « Start : jouer · Start tenu : fiche »
    $Next, $Next, $Next, $Next, 'wait:1500',              # Neon Abyss
    "hold:$Start", 'wait:1100',                           # Start maintenu : la fiche, sans attendre le relâchement
    "release:$Start", 'wait:500',                         # relâché : rien d'autre (pas de partie)
    $Exit, 'wait:800', 'KeyH', 'wait:800', 'KeyH',        # aide-mémoire : Start, Start maintenu ou F6
    $Magna, 'wait:1200',                                  # F6 : la fiche resserrée
    'action:Gérer la table', 'wait:900',                  # « ‹ Neon Abyss »
    'action:Médias du jeu', 'wait:2200',                  # le choix dans la liste des médias : « Exit : actions »
    $Magna, 'wait:700',                                   # F6 : les actions, « ‹ Gérer la table », « Retour : Gérer la table »
    $Exit, 'wait:800', $Exit, 'wait:800',                 # Gérer la table, la fiche
    'action:Prospectus et règles', 'wait:900', $Next, 'wait:600', $Next, 'wait:600', # le livret, du prospectus aux règles
    $Exit, 'wait:600', $Exit, 'wait:800',                 # la fiche, la roue
    $Exit, 'wait:900',                                    # menu système : « ‹ Menu des tables »
    'action:Toutes les tables', 'wait:900', $Start, 'wait:1000', # la fiche : « ‹ Toutes les tables »
    $Exit, 'wait:600', $Exit, 'wait:600', $Exit, 'wait:800'
  )
  chargement = @(
    'wait:1200', $Next, $Next, $Next, $Next, 'wait:1200',
    $Start, 'wait:9000',                                  # Start court : la partie ; passé 8 s, le cartouche (VPX lancé)
    'wait:6000',                                          # ses fenêtres ouvertes (8 s après le lancement de la partie simulée)
    $Exit, 'wait:3000'                                    # Exit : arrêté, la roue
  )
}

function Invoke-Menu([string]$captures, [string[]]$touches) {
  $env:CYBERPINBALL_AUTOPILOT = $touches -join ','
  $env:CYBERPINBALL_CAPTURE = $captures
  if (Test-Path $captures) { Remove-Item -Recurse -Force $captures }
  Push-Location $wt
  try { $log = & $electron app 2>&1 | ForEach-Object { "$_" } } finally { Pop-Location }
  $log | Where-Object { $_ -match '^(Autopilote|Mise en page|Traduction manquante|Hors écran|Retour de|Lancement)' } | ForEach-Object { Write-Host "   $_" }
  Set-Content "$captures\journal.txt" $log -Encoding UTF8
  return $log
}

function Test-Captures([string]$id, [string]$captures, $log) {
  if ($log -match 'Autopilote : aucun') { $script:failures += "$id : une action rejouée n'a pas trouvé son écran" }
  if ($log -match 'Traduction manquante') { $script:failures += "$id : texte sans traduction" }
  if ($log -match '^Retour de « ') { $script:failures += "$id : un retour est arrivé ailleurs que là où son bouton l'annonçait" }
  Assert-HorsEcran $captures
  $report = "$captures\mise-en-page.txt"
  if (-not (Test-Path $report)) { $script:failures += "$id : relevé de mise en page absent" }
  elseif ((Get-Content $report -Raw -Encoding UTF8) -notmatch '^Aucun problème') { $script:failures += "$id : mise en page, voir $report" }
}

try {
  foreach ($jeu in $Ecrans) {
    Use-HorsEcran $jeu
    foreach ($langue in $Langues) {
      $dossier = "$base\$jeu\$langue"
      $home_ = "$dossier\home"
      foreach ($etape in $Etapes) {
        "== $jeu, $langue, $etape"
        if (Test-Path $home_) { Remove-Item -Recurse -Force $home_ }
        New-Item -ItemType Directory -Force "$home_\sandbox" | Out-Null
        Set-Content "$home_\sandbox\VPinballX.ini" '' -Encoding UTF8
        node "$PSScriptRoot\demo-medias.cjs" modele "$PSScriptRoot\ecrans\$jeu.json" "$home_\cabinet.json" "$home_\sandbox\VPinballX.ini" | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'Modèle de borne des écrans simulés impossible.' }
        # Le réglage étudié : Start sur la roue joue directement ; la fiche passe à Start maintenu et à F6.
        [IO.File]::WriteAllText("$home_\medias.json", '{ "wheelStart": "play" }')
        $env:CYBERPINBALL_HOME = $home_
        $env:CYBERPINBALL_ROOT = $root
        $env:CYBERPINBALL_LANGUE = $langue
        if ($etape -eq 'chargement') {
          $env:CYBERPINBALL_PARTIE_SIMULEE = 'backglass'
          $env:CYBERPINBALL_PARTIE_SIMULEE_CHARGEMENT_MS = '90000'
        } else {
          Remove-Item Env:CYBERPINBALL_PARTIE_SIMULEE, Env:CYBERPINBALL_PARTIE_SIMULEE_CHARGEMENT_MS -ErrorAction SilentlyContinue
        }
        $id = "$jeu/$langue/$etape"
        $log = Invoke-Menu "$dossier\$etape" $sequences[$etape]
        Test-Captures $id "$dossier\$etape" $log
        if ($etape -eq 'menus') {
          # Start maintenu : la fiche, jamais une partie.
          if ($log -match '^Lancement : VPX lancé') { $failures += "$id : Start maintenu a lancé une partie" }
        } else {
          if (-not ($log -match "^Lancement : la table n'est pas à l'écran 8 s")) { $failures += "$id : le chargement qui tarde n'a pas été dit" }
          if (-not ($log -match '^Lancement : arrêté pendant le chargement')) { $failures += "$id : Exit n'a pas arrêté le lancement" }
          if ($log -match '^Record|^Partie \(') { $failures += "$id : le lancement arrêté a compté une partie" }
        }
      }
    }
  }
} finally {
  Remove-Item Env:CYBERPINBALL_LANGUE, Env:CYBERPINBALL_AUTOPILOT, Env:CYBERPINBALL_CAPTURE, Env:CYBERPINBALL_HOME, Env:CYBERPINBALL_ROOT, Env:CYBERPINBALL_PARTIE_SIMULEE, Env:CYBERPINBALL_PARTIE_SIMULEE_CHARGEMENT_MS -ErrorAction SilentlyContinue
}

if ($failures.Count) { throw "Démonstration de l'ergonomie en échec :`n  $($failures -join "`n  ")" }
"Captures dans $base\<écrans>\<langue>\<étape>."
