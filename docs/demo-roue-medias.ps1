# Démonstration sans opérateur : un média ajouté, remplacé ou retiré, une table ajoutée,
# pendant que le menu tourne, se voient aussitôt sur chaque écran, sans redémarrer
# (guet des dossiers, packages\core\src\mediawatch.ts). Le vrai menu, hors écran, sur le bac
# à sable de docs\demo-medias.cjs (trois tables) dont le logo de Bayou d'Or est d'abord mis
# de côté ; les fichiers sont posés et retirés par l'autopilote (étapes copy: et remove:),
# comme à la main ou par « Médias du jeu » :
#   02 Bayou d'Or choisie, sans logo : son titre dans la roue ;
#   04 son logo posé dans medias\ : affiché dans la roue, à la même place ;
#   06 un fronton (Backglass) posé : affiché sur l'écran du fronton ;
#   08 le logo d'Astro Néon remplacé sous le même nom : nouvelle adresse (version), nouvelle image ;
#   10 le logo de Bayou d'Or retiré : de nouveau son titre ;
#   12 une table ajoutée (dossier et .vpx) : quatre tables, la nouvelle dans la roue, la
#      sélection inchangée.
#   .\docs\demo-roue-medias.ps1 [-Ecrans borne]
# Captures dans tmp\captures\roue-medias. VPX n'est jamais lancé ; le vrai VPinballX.ini n'est que copié.
param(
  [string]$Ecrans = 'borne',
  [string]$Source = 'D:\CyberPinball'
)
$ErrorActionPreference = 'Stop'
$wt = Split-Path $PSScriptRoot -Parent
. "$PSScriptRoot\hors-ecran.ps1"
# Tout le reste tourne sur un bureau Windows caché : rien ne peut apparaître sur les écrans du poste.
if (Enter-BureauCache $PSCommandPath $PSBoundParameters) { exit $LASTEXITCODE }
Use-HorsEcran $Ecrans
$base = "$wt\tmp\demo-roue-medias"
$captures = "$wt\tmp\captures\roue-medias"
$realIni = "$Source\config\VPinballX.ini"
$realHash = (Get-FileHash $realIni).Hash
$electron = node -p "require('electron')"

Push-Location $wt
try { npm run build | Out-Null } finally { Pop-Location }

# Nettoyage : d'abord la jonction des émulateurs (sans /s, pour ne jamais y descendre).
if (Test-Path $base) {
  Get-ChildItem -Directory -Recurse -Depth 2 $base -Attributes ReparsePoint | ForEach-Object { cmd /c rmdir "$($_.FullName)" }
  Remove-Item -Recurse -Force $base
}
if (Test-Path $captures) { Remove-Item -Recurse -Force $captures }
$root = "$base\root"; $home_ = "$base\home"; $sources = "$base\sources"
Push-Location $wt
try { & $electron docs\demo-medias.cjs generer $root 2>&1 | ForEach-Object { "   $_" } } finally { Pop-Location }
if ($LASTEXITCODE -ne 0) { throw 'Génération des médias en échec.' }
# VPX est « installé » (sinon le menu s'ouvre sur son installation), jamais lancé.
New-Item -ItemType Junction -Path "$root\emulators" -Target "$Source\emulators" | Out-Null
New-Item -ItemType Directory -Force "$home_\sandbox", $captures, $sources | Out-Null
Copy-Item $realIni "$home_\sandbox\VPinballX.ini"
node "$PSScriptRoot\demo-medias.cjs" modele "$PSScriptRoot\ecrans\$Ecrans.json" "$home_\cabinet.json" "$home_\sandbox\VPinballX.ini" | ForEach-Object { "   $_" }
if ($LASTEXITCODE -ne 0) { throw "Modèle de borne pour $Ecrans en échec." }

$astro = 'Astro Néon (Williams 1992)'; $bayou = "Bayou d'Or (Gottlieb 1979)"
$bayouMedias = "$root\tables\$bayou\medias"
# Le logo de Bayou d'Or attend de côté ; un fronton et un nouveau logo pour Astro Néon aussi.
Move-Item "$bayouMedias\(Wheel) $bayou.png" "$sources\logo-bayou.png"
Copy-Item "$root\tables\$astro\medias\(GameHelp) $astro.png" "$sources\fronton-bayou.png"
Copy-Item "$sources\logo-bayou.png" "$sources\logo-astro.png"
$delta = 'Delta (Gottlieb 1980)'

# Touches des encodeurs par défaut ; entre chaque fichier posé et sa capture, le temps du guet.
$etapes = @(
  'wait:1000',                                                         # 01 Astro Néon
  'ArrowDown',                                                         # 02 Bayou d'Or, sans logo
  "copy:$sources\logo-bayou.png|$bayouMedias\(Wheel) $bayou.png",      # 03
  'wait:1500',                                                         # 04 son logo dans la roue
  "copy:$sources\fronton-bayou.png|$bayouMedias\(Backglass) $bayou.png", # 05
  'wait:1500',                                                         # 06 son fronton
  "copy:$sources\logo-astro.png|$root\tables\$astro\medias\(Wheel) $astro.png", # 07
  'wait:1500',                                                         # 08 logo d'Astro Néon remplacé
  "remove:$bayouMedias\(Wheel) $bayou.png",                            # 09
  'wait:1500',                                                         # 10 de nouveau le titre
  "copy:$root\tables\$astro\$astro.vpx|$root\tables\$delta\$delta.vpx", # 11
  'wait:1500'                                                          # 12 quatre tables
)
@{ menuLayout = 'medaillons' } | ConvertTo-Json | Set-Content -Path "$home_\medias.json" -Encoding UTF8
$env:CYBERPINBALL_ROOT = $root
$env:CYBERPINBALL_HOME = $home_
$env:CYBERPINBALL_AUTOPILOT = $etapes -join ','
$env:CYBERPINBALL_CAPTURE = $captures
$line = "`"$electron`" app --user-data-dir=`"$base\chromium`" > `"$captures\sortie.txt`" 2> `"$captures\erreurs.txt`""
Start-Process -FilePath cmd.exe -ArgumentList '/d', '/c', "`"$line`"" -WorkingDirectory $wt -NoNewWindow -Wait
Assert-HorsEcran $captures

$releves = @{}
foreach ($l in Get-Content "$captures\son.txt" -Encoding UTF8) {
  if ($l -match '^(\d\d)-\S* : (.+)$') { $releves[$Matches[1]] = $Matches[2] | ConvertFrom-Json }
}
$failures = @()
function Check([string]$Step, [string]$What, [bool]$Ok, [string]$Seen) {
  "  $Step  $(if ($Ok) { 'ok' } else { 'ÉCHEC' })  $What : $Seen"
  if (-not $Ok) { $script:failures += "$Step : $What ($Seen)" }
}
$roue = { param($s) @($releves[$s].ecrans.playfield.roue) }
$logo = { param($s, $name) @(& $roue $s | Where-Object { $_ -like "(Wheel) $name.png*" }) | Select-Object -First 1 }
$fronton = { param($s) $layer = @($releves[$s].ecrans.PSObject.Properties.Value | ForEach-Object { @($_.couches) } | Where-Object { $_.role -eq 'backglass' }) | Select-Object -First 1; "$($layer.element) $($layer.fichier)" }

Check '02' 'Bayou d''Or sans logo : son titre' (@(& $roue '02' | Where-Object { $_ -like 'titre : Bayou*' }).Count -eq 1) ((& $roue '02') -join ' | ')
Check '04' 'logo posé, dans la roue' ([bool](& $logo '04' $bayou)) ((& $roue '04') -join ' | ')
Check '04' 'même nombre de places' ((& $roue '04').Count -eq (& $roue '02').Count) "$((& $roue '02').Count) puis $((& $roue '04').Count)"
Check '06' 'fronton posé, affiché' ((& $fronton '06') -eq "image (Backglass) $bayou.png") (& $fronton '06')
$avant = & $logo '06' $astro; $apres = & $logo '08' $astro
Check '08' 'logo d''Astro Néon remplacé : nouvelle adresse' ($avant -and $apres -and $avant -ne $apres) "$avant -> $apres"
Check '10' 'logo retiré : le titre' (-not (& $logo '10' $bayou) -and @(& $roue '10' | Where-Object { $_ -like 'titre : Bayou*' }).Count -eq 1) ((& $roue '10') -join ' | ')
Check '12' 'table ajoutée' ($releves['12'].ecrans.playfield.tables -eq 4 -and @(& $roue '12' | Where-Object { $_ -like 'titre : Delta*' }).Count -eq 1) "$($releves['12'].ecrans.playfield.tables) tables · $((& $roue '12') -join ' | ')"
Check '12' 'sélection inchangée' ($releves['12'].ecrans.playfield.position -eq 2) "table $($releves['12'].ecrans.playfield.position)"
Select-String -Path "$captures\sortie.txt" -Pattern '^Autopilote : ' | ForEach-Object { $failures += $_.Line }
Select-String -Path "$captures\sortie.txt", "$captures\erreurs.txt" -Pattern 'Médias :|Error' | ForEach-Object { "  ATTENTION : $($_.Line)" }

if ((Get-FileHash $realIni).Hash -ne $realHash) { throw 'Le vrai VPinballX.ini a changé !' }
if ($failures.Count) { throw "Roue et médias en direct : $($failures.Count) échec(s)`n$($failures -join "`n")" }
"`nRoue et médias en direct : tout se voit sans redémarrer. Captures dans $captures."
