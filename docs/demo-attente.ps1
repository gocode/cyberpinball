# Démonstration sans opérateur de l'horaire de la borne (Menu système > Médias > « Médias, son
# et attente » > « Horaire de la borne »), hors écran sur un bureau Windows caché, avec des
# tables inventées (docs\demo-captures.cjs) et une horloge simulée (CYBERPINBALL_HORLOGE : la
# borne croit qu'il est 23 h 30 ou 1 h 59). Rien n'est jamais éteint ni mis en veille : le
# pilote automatique rend l'alimentation simulée (packages\core\src\power.ts, powerSimulated),
# chaque arrêt est seulement journalisé (« Alimentation simulée : … »).
#   nuit       : 23 h 30, attente après 3 s : voile noir à 70 % sur chaque écran ; un bouton le
#                lève d'un coup et revient au menu (l'attente revient 3 s plus tard) ;
#   noir       : écrans noirs (voile à 100 %) : plus de table qui change dessous ;
#   veille     : 1 h 59 min 48 s, arrêt à 2 h : la borne en attente affiche 30 s de préavis
#                au-dessus du voile, puis l'écran noir de la veille, puis le menu et le constat
#                de l'essai ;
#   bouton     : même préavis, un bouton : préavis retiré, menu, rien ne s'arrête ;
#   extinction : arrêt par extinction : préavis, écran noir, shutdown.exe simulé ;
#   reglages   : l'écran « Horaire de la borne », la liste des heures d'arrêt, celle des voiles ;
#                réveil depuis la veille : deux périphériques autorisés (CYBERPINBALL_REVEIL).
# Le journal doit nommer chaque arrêt simulé une fois (aucun en « nuit », « noir », « bouton »,
# « reglages ») ; le garde-fou de mise en page et le guet hors écran doivent rester muets.
#   .\docs\demo-attente.ps1 [-Scenarios nuit, noir, veille, bouton, extinction, reglages] [-Langues fr, en] [-Ecrans borne, poste-deux-ecrans]
# Captures dans tmp\demo-attente\<scénario>\<écrans>\<langue>\captures (les autres écrans dans
# captures\ecrans). VPX n'est jamais lancé ; ni le vrai modèle de borne ni le vrai VPinballX.ini
# ne sont lus ni touchés.
param(
  [string[]]$Scenarios = @('nuit', 'noir', 'veille', 'bouton', 'extinction', 'reglages'),
  [string[]]$Langues = @('fr', 'en'),
  [string[]]$Ecrans = @('borne', 'poste-deux-ecrans')
)
$ErrorActionPreference = 'Stop'
$wt = Split-Path $PSScriptRoot -Parent
. "$PSScriptRoot\hors-ecran.ps1"
# Tout le reste tourne sur un bureau Windows caché : rien ne peut apparaître sur les écrans du poste.
if (Enter-BureauCache $PSCommandPath $PSBoundParameters) { exit $LASTEXITCODE }
$base = "$wt\tmp\demo-attente"
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

$Start = 'Digit1'; $Exit = 'Escape'; $Down = 'ArrowDown'
# Horaire suivi : nuit de 23 h à 8 h, arrêt à 2 h ; attente après 3 s sans bouton, une table toutes les 4 s.
function Get-Reglages([int]$voile = 70, [string]$arret = 'sleep', [int]$attente = 3) {
  @{ attractDelay = $attente; attractInterval = 4; music = $false; hours = @{ on = $true; nightFrom = 1380; nightTo = 480; nightDim = $voile; stopAt = 120; stopBy = $arret } }
}
# Au départ, le message « VPX n'est pas installé » (le bac à sable n'a pas VPX) : Exit le ferme.
# La borne arrive au menu vers 1 h 59 min 54 s, en attente 3 s plus tard ; 2 h : le préavis.
$preavis = @('wait:1500', $Exit, 'wait:9000')
# Réglages : « Médias, son et attente », deuxième entrée de la rubrique Médias (un libellé à virgule
# ne s'écrit pas dans une étape, et sa traduction ne se retrouve pas par un morceau).
$scenes = [ordered]@{
  nuit       = @{ Horloge = '2026-10-27T23:30:00'; Reglages = (Get-Reglages); Etapes = @('wait:1500', $Exit, 'wait:9000', $Down); Arrets = @()
                  # 02 en attente, voile à 70 % sur chaque écran ; 03 un bouton : menu, voile levé.
                  Attendu = @{ '03-wait_9000' = @{ attente = $true; nuit = 0.7 }; '04-ArrowDown' = @{ attente = $false; nuit = 0 } } }
  noir       = @{ Horloge = '2026-10-27T23:30:00'; Reglages = (Get-Reglages 100); Etapes = @('wait:1500', $Exit, 'wait:9000', 'wait:6000'); Arrets = @()
                  Attendu = @{ '03-wait_9000' = @{ attente = $true; nuit = 1 }; '04-wait_6000' = @{ attente = $true; nuit = 1; memeTable = '03-wait_9000' } } }
  veille     = @{ Horloge = '2026-10-27T01:59:48'; Reglages = (Get-Reglages); Etapes = ($preavis + @('until:message', 'until:menu')); Arrets = @('powrprof SetSuspendState(FALSE, FALSE, FALSE)')
                  Attendu = @{ '03-wait_9000' = @{ attente = $true; nuit = 0.7; preavis = 'sleep' }; '04-until_message' = @{ phase = 'message'; nuit = 0 }; '05-until_menu' = @{ phase = 'menu'; attente = $false } } }
  bouton     = @{ Horloge = '2026-10-27T01:59:48'; Reglages = (Get-Reglages); Etapes = ($preavis + @($Down)); Arrets = @()
                  Attendu = @{ '03-wait_9000' = @{ preavis = 'sleep' }; '04-ArrowDown' = @{ phase = 'menu'; attente = $false; nuit = 0; preavis = '' } } }
  extinction = @{ Horloge = '2026-10-27T01:59:48'; Reglages = (Get-Reglages 70 'shutdown'); Etapes = ($preavis + @('until:message', 'until:menu')); Arrets = @('shutdown.exe /s /t 0')
                  Attendu = @{ '03-wait_9000' = @{ preavis = 'shutdown' }; '04-until_message' = @{ phase = 'message' } } }
  reglages   = @{ Horloge = '2026-10-27T15:00:00'; Reglages = (Get-Reglages 70 'sleep' 0); Arrets = @()
                  Etapes = @('wait:1500', $Exit, 'wait:800', $Exit, 'wait:800', 'action:Médias', 'wait:300', $Down, $Start, 'action:Horaire de la borne', 'wait:800', 'action:Arrêt automatique', $Exit, "action:Écrans pendant l’attente nocturne", $Exit, "action:Mode d’arrêt", 'wait:400')
                  Attendu = @{} }
}

# Ce que montre chaque écran à une étape, d'après son.txt (cyberEtat de chaque fenêtre).
function Read-Etats([string]$captures) {
  $etats = @{}
  if (-not (Test-Path "$captures\son.txt")) { return $etats }
  foreach ($line in Get-Content "$captures\son.txt" -Encoding UTF8) {
    $i = $line.IndexOf(' : ')
    if ($i -gt 0) { $etats[$line.Substring(0, $i)] = $line.Substring($i + 3) | ConvertFrom-Json }
  }
  $etats
}

try {
  foreach ($scenario in $Scenarios) {
    if (-not $scenes.Contains($scenario)) { throw "Scénario inconnu : $scenario ($($scenes.Keys -join ', '))." }
    $scene = $scenes[$scenario]
    foreach ($jeu in $Ecrans) {
      Use-HorsEcran $jeu
      foreach ($langue in $Langues) {
        "== $scenario, $jeu, $langue"
        $dossier = "$base\$scenario\$jeu\$langue"
        $home_ = "$dossier\home"
        if (Test-Path $home_) { Remove-Item -Recurse -Force $home_ }
        New-Item -ItemType Directory -Force "$home_\sandbox" | Out-Null
        Set-Content "$home_\sandbox\VPinballX.ini" '' -Encoding UTF8
        node "$PSScriptRoot\demo-medias.cjs" modele "$PSScriptRoot\ecrans\$jeu.json" "$home_\cabinet.json" "$home_\sandbox\VPinballX.ini" | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'Modèle de borne des écrans simulés impossible.' }
        $scene.Reglages | ConvertTo-Json -Depth 4 | Set-Content -Path "$home_\medias.json" -Encoding UTF8
        $env:CYBERPINBALL_HOME = $home_
        $env:CYBERPINBALL_ROOT = $root
        $env:CYBERPINBALL_LANGUE = $langue
        $env:CYBERPINBALL_HORLOGE = $scene.Horloge
        $env:CYBERPINBALL_REVEIL = 'Pinscape Controller|Périphérique clavier HID'
        $env:CYBERPINBALL_AUTOPILOT = $scene.Etapes -join ','
        $env:CYBERPINBALL_CAPTURE = "$dossier\captures"
        if (Test-Path $env:CYBERPINBALL_CAPTURE) { Remove-Item -Recurse -Force $env:CYBERPINBALL_CAPTURE }
        Push-Location $wt
        try { $log = & $electron app 2>&1 | ForEach-Object { "$_" } } finally { Pop-Location }
        $log | Where-Object { $_ -match '^(Autopilote|Mise en page|Traduction manquante|Hors écran|Alimentation|Horaire)' } | ForEach-Object { Write-Host "   $_" }
        $id = "$scenario/$jeu/$langue"
        if ($log -match 'Autopilote : aucun|jamais atteinte') { $failures += "$id : une étape rejouée n'a pas trouvé son écran" }
        if ($log -match 'Traduction manquante') { $failures += "$id : texte sans traduction" }
        $simules = @($log | Where-Object { $_ -match '^Alimentation simulée : ' } | ForEach-Object { $_ -replace '^Alimentation simulée : ', '' })
        if (($simules -join ' | ') -ne ($scene.Arrets -join ' | ')) { $failures += "$id : arrêts simulés « $($simules -join ' | ') » au lieu de « $($scene.Arrets -join ' | ') »" }
        # Chaque écran dit la même chose : voile de nuit, préavis (dessiné par le seul plateau), table en attente.
        $etats = Read-Etats $env:CYBERPINBALL_CAPTURE
        foreach ($etape in $scene.Attendu.Keys) {
          $want = $scene.Attendu[$etape]
          $vu = $etats[$etape]
          if (-not $vu) { $failures += "$id : étape $etape non relevée"; continue }
          $pf = $vu.ecrans.playfield
          $problems = @()
          if ($want.ContainsKey('phase') -and $pf.phase -ne $want.phase) { $problems += "phase $($pf.phase)" }
          if ($want.ContainsKey('attente') -and [bool]$pf.attente -ne $want.attente) { $problems += "attente « $($pf.attente) »" }
          if ($want.ContainsKey('nuit')) {
            foreach ($role in $vu.ecrans.PSObject.Properties.Name) { if ([double]$vu.ecrans.$role.nuit -ne $want.nuit) { $problems += "voile $($vu.ecrans.$role.nuit) sur $role" } }
          }
          if ($want.ContainsKey('preavis')) {
            $action = if ($pf.preavis) { $pf.preavis.action } else { '' }
            if ($action -ne $want.preavis) { $problems += "préavis « $action »" }
            if ($want.preavis -and -not ($pf.preavis.secondes -ge 1 -and $pf.preavis.secondes -le 30)) { $problems += "compte $($pf.preavis.secondes) s" }
          }
          if ($want.ContainsKey('memeTable') -and $pf.attente -ne $etats[$want.memeTable].ecrans.playfield.attente) { $problems += "table changée sous les écrans noirs ($($etats[$want.memeTable].ecrans.playfield.attente) → $($pf.attente))" }
          if ($problems.Count) { $failures += "$id, $etape : $($problems -join ', ')" }
        }
        Assert-HorsEcran $env:CYBERPINBALL_CAPTURE
        $report = "$env:CYBERPINBALL_CAPTURE\mise-en-page.txt"
        if (-not (Test-Path $report)) { $failures += "$id : relevé de mise en page absent" }
        elseif ((Get-Content $report -Raw -Encoding UTF8) -notmatch '^Aucun problème') { $failures += "$id : mise en page, voir $report" }
      }
    }
  }
} finally {
  Remove-Item Env:CYBERPINBALL_LANGUE, Env:CYBERPINBALL_AUTOPILOT, Env:CYBERPINBALL_CAPTURE, Env:CYBERPINBALL_HOME, Env:CYBERPINBALL_ROOT, Env:CYBERPINBALL_HORLOGE, Env:CYBERPINBALL_REVEIL -ErrorAction SilentlyContinue
}

if ($failures.Count) { throw "Démonstration de l'horaire en échec :`n  $($failures -join "`n  ")" }
"Captures dans $base\<scénario>\<écrans>\<langue>\captures."
