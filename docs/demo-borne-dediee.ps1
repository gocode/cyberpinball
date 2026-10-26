# Démonstration sans opérateur de la borne dédiée (menu système > Borne > « Borne dédiée »),
# hors écran sur un bureau Windows caché, avec un Windows simulé (CYBERPINBALL_BORNE_SIMULEE) :
# rien n'est écrit dans le vrai Windows, aucun Explorateur n'est lancé. Pour chaque langue :
#   aller-retour : écran désactivé, secours, activation (simulée, vérifiée), écran activé,
#                  désactivation (état d'avant revenu et vérifié) ;
#   session      : activée, puis Cyber Pinball relancé comme par Shell Launcher (--borne-dediee) :
#                  rubrique Borne avec « Ouvrir l'Explorateur Windows » à la place de « Bureau
#                  Windows », écran « activée pour cette session », Explorateur (simulé) puis
#                  retour au menu par Ctrl+Maj+D, « Redémarrer Cyber Pinball » à la place de « Quitter » ;
#   refus        : autorisation de Windows refusée ; puis sans autre compte administrateur
#                  (Bloquant), puis Windows Pro (non disponible).
# Le Windows simulé, à la fin de l'aller-retour, doit être exactement celui du départ ; le
# garde-fou de mise en page et le guet hors écran doivent rester muets.
#   .\docs\demo-borne-dediee.ps1 [-Langues fr, en] [-Scenarios aller-retour, session, refus]
# Captures dans tmp\demo-borne-dediee\<scénario>\<langue>\captures.
param(
  [string[]]$Langues = @('fr', 'en'),
  [string[]]$Scenarios = @('aller-retour', 'session', 'refus')
)
$ErrorActionPreference = 'Stop'
$wt = Split-Path $PSScriptRoot -Parent
. "$PSScriptRoot\hors-ecran.ps1"
# Tout le reste tourne sur un bureau Windows caché : rien ne peut apparaître sur les écrans du poste.
if (Enter-BureauCache $PSCommandPath $PSBoundParameters) { exit $LASTEXITCODE }
$base = "$wt\tmp\demo-borne-dediee"
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

# Windows IoT Enterprise LTSC tel que livré (freshWindows du cœur) et ce que voit l'écran.
$livre = [ordered]@{
  features = [ordered]@{ 'Client-DeviceLockdown' = 'Disabled'; 'Client-EmbeddedShellLauncher' = 'Disabled' }
  wesl = $false; enabled = $false
  defaultShell = [ordered]@{ shell = 'cmd.exe'; defaultAction = 0 }
  customs = [ordered]@{}; winlogonShell = 'explorer.exe'
}
function New-Simulation([string]$Fichier, [hashtable]$Probe = @{}, [switch]$Refus) {
  $sim = [ordered]@{ windows = $livre; probe = $Probe; cancel = [bool]$Refus }
  [System.IO.File]::WriteAllText($Fichier, ($sim | ConvertTo-Json -Depth 8), (New-Object System.Text.UTF8Encoding $false))
}

# Une partie de Cyber Pinball sur le bureau caché, ces touches rejouées ; rend son journal.
function Invoke-Borne([string]$Dossier, [string[]]$Touches, [string[]]$Arguments = @()) {
  $env:CYBERPINBALL_AUTOPILOT = $Touches -join ','
  $env:CYBERPINBALL_CAPTURE = "$Dossier\captures"
  if (Test-Path $env:CYBERPINBALL_CAPTURE) { Remove-Item -Recurse -Force $env:CYBERPINBALL_CAPTURE }
  Push-Location $wt
  try { $log = & $electron app @Arguments 2>&1 | ForEach-Object { "$_" } } finally { Pop-Location }
  $log | Where-Object { $_ -match '^(Autopilote|Mise en page|Traduction manquante|Hors écran|Mode bureau|Borne dédiée)' } | ForEach-Object { Write-Host "   $_" }
  return $log
}

function Test-Partie([string]$Id, [string]$Dossier, [string[]]$Log) {
  if ($Log -match 'Autopilote : aucun') { $script:failures += "$Id : une action rejouée n'a pas trouvé son écran" }
  if ($Log -match 'Traduction manquante') { $script:failures += "$Id : texte sans traduction" }
  Assert-HorsEcran "$Dossier\captures"
  $report = "$Dossier\captures\mise-en-page.txt"
  if (-not (Test-Path $report)) { $script:failures += "$Id : relevé de mise en page absent" }
  elseif ((Get-Content $report -Raw -Encoding UTF8) -notmatch '^Aucun problème') { $script:failures += "$Id : mise en page, voir $report" }
}

$w = 'wait:1500'
try {
  Use-HorsEcran 'borne'
  foreach ($langue in $Langues) {
    $env:CYBERPINBALL_ROOT = $root
    $env:CYBERPINBALL_LANGUE = $langue
    foreach ($scenario in $Scenarios) {
      "== $scenario, $langue"
      $dossier = "$base\$scenario\$langue"
      $home_ = "$dossier\home"
      if (Test-Path $home_) { Remove-Item -Recurse -Force $home_ }
      New-Item -ItemType Directory -Force "$home_\sandbox" | Out-Null
      Set-Content "$home_\sandbox\VPinballX.ini" '' -Encoding UTF8
      node "$PSScriptRoot\demo-medias.cjs" modele "$PSScriptRoot\ecrans\borne.json" "$home_\cabinet.json" "$home_\sandbox\VPinballX.ini" | Out-Null
      if ($LASTEXITCODE -ne 0) { throw 'Modèle de borne des écrans simulés impossible.' }
      $env:CYBERPINBALL_HOME = $home_
      $sim = "$home_\windows-simule.json"
      $env:CYBERPINBALL_BORNE_SIMULEE = $sim
      $id = "$scenario/$langue"
      switch ($scenario) {
        'aller-retour' {
          New-Simulation $sim
          $log = Invoke-Borne $dossier @('Tab', 'wait:1200', 'action:Borne', 'wait:1000', 'action:Borne dédiée', $w,
            'action:Secours', 'wait:1000', 'action:Retour', 'wait:1000',
            'action:Activer pour ce compte', $w, 'action:Retour', 'wait:1000', 'action:Borne dédiée', $w,
            'action:Désactiver et rétablir le bureau', $w)
          Test-Partie $id $dossier $log
          $etat = Get-Content $sim -Raw -Encoding UTF8 | ConvertFrom-Json
          if (($etat.windows | ConvertTo-Json -Depth 8 -Compress) -ne ($livre | ConvertTo-Json -Depth 8 -Compress | ConvertFrom-Json | ConvertTo-Json -Depth 8 -Compress)) { $failures += "$id : Windows simulé différent de l'état d'avant" }
          if ((@($etat.journal | Where-Object { $_ }) -join '|') -notmatch '^activate : done\|deactivate : done$') { $failures += "$id : journal de la simulation inattendu ($(@($etat.journal | Where-Object { $_ }) -join ' | '))" }
          if (Test-Path "$home_\borne-dediee\etat.json") { $failures += "$id : état de la borne dédiée resté après la désactivation" }
        }
        'session' {
          New-Simulation $sim
          $log = Invoke-Borne "$dossier\activation" @('Tab', 'wait:1200', 'action:Borne', 'wait:1000', 'action:Borne dédiée', $w, 'action:Activer pour ce compte', $w)
          Test-Partie "$id (activation)" "$dossier\activation" $log
          # Ouverture de session : Shell Launcher lance Cyber Pinball avec son option.
          $log = Invoke-Borne $dossier @('Tab', 'wait:1200', 'action:Borne', 'wait:1000', 'action:Borne dédiée', $w,
            "action:Ouvrir l’Explorateur", 'wait:1500', 'Control+Shift+KeyD', 'wait:1500',
            'Tab', 'wait:1200', 'action:Cyber Pinball', 'wait:1000') @('--borne-dediee')
          Test-Partie $id $dossier $log
          if (-not ($log -match 'Borne dédiée \(simulée\) : Explorateur ouvert')) { $failures += "$id : l'Explorateur (simulé) ne s'est pas ouvert" }
          if (@($log | Where-Object { $_ -match '^Mode bureau : .*tous les écrans libres' }).Count -ne 1) { $failures += "$id : passage au bureau absent" }
          if (@($log | Where-Object { $_ -match '^Mode bureau : retour au menu' }).Count -ne 1) { $failures += "$id : retour au menu absent" }
        }
        'refus' {
          New-Simulation $sim -Refus
          $log = Invoke-Borne "$dossier\uac" @('Tab', 'wait:1200', 'action:Borne', 'wait:1000', 'action:Borne dédiée', $w, 'action:Activer pour ce compte', $w)
          Test-Partie "$id (uac)" "$dossier\uac" $log
          if (Test-Path "$home_\borne-dediee\etat.json") { $failures += "$id : activation enregistrée malgré le refus" }
          New-Simulation $sim -Probe @{ otherAdmins = @() }
          $log = Invoke-Borne "$dossier\administrateur" @('Tab', 'wait:1200', 'action:Borne', 'wait:1000', 'action:Borne dédiée', $w)
          Test-Partie "$id (administrateur)" "$dossier\administrateur" $log
          New-Simulation $sim -Probe @{ editionId = 'Professional'; build = 26100 }
          $log = Invoke-Borne "$dossier\pro" @('Tab', 'wait:1200', 'action:Borne', 'wait:1000', 'action:Borne dédiée', $w)
          Test-Partie "$id (pro)" "$dossier\pro" $log
          $etat = Get-Content $sim -Raw -Encoding UTF8 | ConvertFrom-Json
          if (@($etat.journal | Where-Object { $_ }).Count) { $failures += "$id : écriture simulée sans activation ($(@($etat.journal | Where-Object { $_ }) -join ' | '))" }
        }
      }
    }
  }
} finally {
  Remove-Item Env:CYBERPINBALL_LANGUE, Env:CYBERPINBALL_AUTOPILOT, Env:CYBERPINBALL_CAPTURE, Env:CYBERPINBALL_HOME, Env:CYBERPINBALL_ROOT, Env:CYBERPINBALL_BORNE_SIMULEE -ErrorAction SilentlyContinue
}

if ($failures.Count) { throw "Démonstration de la borne dédiée en échec :`n  $($failures -join "`n  ")" }
"Captures dans $base\<scénario>\<langue>\captures."
