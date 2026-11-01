# Démonstration sans opérateur du volume de la borne (app\src\cabinet-volume.ts), hors écran sur un
# bureau Windows caché, avec des tables inventées (docs\demo-captures.cjs). Le son de Windows n'est
# jamais touché : hors écran, le volume est simulé (une sortie à 50 %).
#   Volume + (=)            : 55 %, la pastille au milieu du haut du plateau, tournée vers le joueur ;
#   Volume − (-)            : 50 % ;
#   Volume − maintenu 1,3 s : 45 % à l'appui, puis son coupé au bout d'une seconde (« Son coupé »,
#                             comment le rétablir), le niveau d'avant l'appui gardé (50 %) ;
#   Volume +                : son rétabli, 55 %.
# Le journal doit dire chaque réglage dans cet ordre ; le garde-fou de mise en page et le guet hors
# écran doivent rester muets.
#   .\docs\demo-volume.ps1 [-Langues fr, en] [-Ecrans borne, poste-deux-ecrans]
# Captures dans tmp\demo-volume\<écrans>\<langue>\captures (volume-borne-niveau.png,
# volume-borne-coupe.png). VPX n'est jamais lancé ; ni le vrai modèle de borne ni le vrai
# VPinballX.ini ne sont lus ni touchés.
param(
  [string[]]$Langues = @('fr', 'en'),
  [string[]]$Ecrans = @('borne', 'poste-deux-ecrans')
)
$ErrorActionPreference = 'Stop'
$wt = Split-Path $PSScriptRoot -Parent
. "$PSScriptRoot\hors-ecran.ps1"
# Tout le reste tourne sur un bureau Windows caché : rien ne peut apparaître sur les écrans du poste.
if (Enter-BureauCache $PSCommandPath $PSBoundParameters) { exit $LASTEXITCODE }
$base = "$wt\tmp\demo-volume"
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

$Exit = 'Escape'
# Au départ, le message « VPX n'est pas installé » (le bac à sable n'a pas VPX) : Exit le ferme.
$etapes = @('wait:1500', $Exit, 'wait:800', 'Equal', 'wait:700', 'Minus', 'wait:700', 'hold:Minus', 'wait:1300', 'release:Minus', 'wait:900', 'Equal', 'wait:700')
$attendu = @(
  'Volume de la borne (Volume +) : 55 %.',
  'Volume de la borne (Volume −) : 50 %.',
  'Volume de la borne (Volume −) : 45 %.',
  'Volume de la borne (Volume − maintenu) : son coupé.',
  'Volume de la borne (Volume +) : 55 %.'
)

try {
  foreach ($jeu in $Ecrans) {
    Use-HorsEcran $jeu
    foreach ($langue in $Langues) {
      "== $jeu, $langue"
      $dossier = "$base\$jeu\$langue"
      $home_ = "$dossier\home"
      if (Test-Path $home_) { Remove-Item -Recurse -Force $home_ }
      New-Item -ItemType Directory -Force "$home_\sandbox" | Out-Null
      Set-Content "$home_\sandbox\VPinballX.ini" '' -Encoding UTF8
      node "$PSScriptRoot\demo-medias.cjs" modele "$PSScriptRoot\ecrans\$jeu.json" "$home_\cabinet.json" "$home_\sandbox\VPinballX.ini" | Out-Null
      if ($LASTEXITCODE -ne 0) { throw 'Modèle de borne des écrans simulés impossible.' }
      @{ attractDelay = 0; music = $false } | ConvertTo-Json | Set-Content -Path "$home_\medias.json" -Encoding UTF8
      $env:CYBERPINBALL_HOME = $home_
      $env:CYBERPINBALL_ROOT = $root
      $env:CYBERPINBALL_LANGUE = $langue
      $env:CYBERPINBALL_AUTOPILOT = $etapes -join ','
      $env:CYBERPINBALL_CAPTURE = "$dossier\captures"
      if (Test-Path $env:CYBERPINBALL_CAPTURE) { Remove-Item -Recurse -Force $env:CYBERPINBALL_CAPTURE }
      Push-Location $wt
      try { $log = & $electron app 2>&1 | ForEach-Object { "$_" } } finally { Pop-Location }
      $log | Where-Object { $_ -match '^(Autopilote|Mise en page|Traduction manquante|Hors écran|Volume de la borne|Pastille du volume)' } | ForEach-Object { Write-Host "   $_" }
      $id = "$jeu/$langue"
      if ($log -match 'Autopilote : aucun|jamais atteinte') { $failures += "$id : une étape rejouée n'a pas trouvé son écran" }
      if ($log -match 'Traduction manquante') { $failures += "$id : texte sans traduction" }
      $reglages = @($log | Where-Object { $_ -match '^Volume de la borne \(' })
      if (($reglages -join ' | ') -ne ($attendu -join ' | ')) { $failures += "$id : réglages « $($reglages -join ' | ') » au lieu de « $($attendu -join ' | ') »" }
      foreach ($etat in 'niveau', 'coupe') {
        if (-not (Test-Path "$env:CYBERPINBALL_CAPTURE\volume-borne-$etat.png")) { $failures += "$id : pastille « $etat » non capturée" }
        $ligne = $log | Where-Object { $_ -match "^Pastille du volume \($etat\)" }
        if ($ligne -notmatch 'mise en page conforme') { $failures += "$id : pastille « $etat » : $ligne" }
      }
      Assert-HorsEcran $env:CYBERPINBALL_CAPTURE
    }
  }
} finally {
  Remove-Item Env:CYBERPINBALL_LANGUE, Env:CYBERPINBALL_AUTOPILOT, Env:CYBERPINBALL_CAPTURE, Env:CYBERPINBALL_HOME, Env:CYBERPINBALL_ROOT -ErrorAction SilentlyContinue
}

if ($failures.Count) { throw "Démonstration du volume en échec :`n  $($failures -join "`n  ")" }
"Captures dans $base\<écrans>\<langue>\captures."
