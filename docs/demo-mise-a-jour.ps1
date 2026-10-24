# Démonstration sans opérateur de la mise à jour depuis l'application, de bout en bout et
# hors écran (bureau Windows caché, écrans simulés) :
#   1. fabrique l'installeur de la version du dépôt (l'« ancienne »), puis publie une version
#      suivante (patch + 1, CYBERPINBALL_VERSION_ESSAI) dans un dossier servi par un site
#      local (docs\demo-mise-a-jour-serveur.cjs), avec un flux signé par la vraie clé de
#      publication : c'est la clé livrée dans l'application qui le vérifie ;
#   2. installe l'ancienne version dans un bac à sable (lancement au démarrage, sans raccourci
#      sur le bureau) ;
#   3. un flux falsifié est d'abord refusé (« Signature … invalide »), rien n'est téléchargé ;
#   4. le vrai flux : menu système > « Mise à jour de Cyber Pinball » > « Mettre à jour
#      maintenant » ; l'application télécharge, vérifie, lance l'installeur (/MAJ /S) et se
#      ferme ; l'installeur remplace app\ et relance Cyber Pinball, qui annonce la nouvelle
#      version et se dit à jour.
# Vérifie : version installée, raccourcis gardés, app.precedente supprimé, suivi consommé,
# requêtes du site, captures (garde-fou de mise en page et guet hors écran).
# Captures dans tmp\demo-mise-a-jour\home\captures : dans le bac à sable, seul endroit où la
# version relancée par l'installeur a le droit d'écrire.
#   .\docs\demo-mise-a-jour.ps1                 # -SansFabrication : reprend les installeurs déjà faits
param(
  [switch]$SansFabrication,
  [int]$Port = 8765,
  [string]$Source = 'D:\CyberPinball'
)
$ErrorActionPreference = 'Stop'
$wt = Split-Path $PSScriptRoot -Parent
. "$PSScriptRoot\hors-ecran.ps1"
if (Enter-BureauCache $PSCommandPath $PSBoundParameters) { exit $LASTEXITCODE }
Use-HorsEcran 'borne'

$base = "$wt\tmp\demo-mise-a-jour"
$home_ = "$base\home"; $racine = "$base\racine"; $site = "$base\site"; $faux = "$base\site-falsifie"; $captures = "$home_\captures"
$ancien = "$base\installeurs\CyberPinball-Setup-ancien.exe"
$exe = "$racine\app\CyberPinball.exe"
function Stop-Borne { Get-Process CyberPinball -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "$base\*" } | Stop-Process -Force }
Stop-Borne
foreach ($d in $home_, $racine, $site, $faux, $captures, "$base\electron") { if (Test-Path $d) { Remove-Item -Recurse -Force $d } }
New-Item -ItemType Directory -Force $home_, $site, $faux, "$base\installeurs" | Out-Null
# Le modèle de borne ci-dessous se fabrique avec packages\core\dist : compilé d'abord (worktree neuf).
Push-Location $wt
try { npm run build | Out-Null } finally { Pop-Location }
if ($LASTEXITCODE -ne 0) { throw 'Compilation impossible.' }
# Modèle de borne fait pour les écrans simulés (comme demo-medias.ps1) : le menu s'ouvre sur les
# tables, sans demander quelle configuration est branchée. L'installeur le reprend du bac à sable.
New-Item -ItemType Directory -Force "$home_\sandbox" | Out-Null
Copy-Item "$Source\config\VPinballX.ini" "$home_\sandbox\VPinballX.ini"
node "$PSScriptRoot\demo-medias.cjs" modele "$PSScriptRoot\ecrans\borne.json" "$home_\cabinet.json" "$home_\sandbox\VPinballX.ini" | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Modèle de borne des écrans simulés impossible.' }

$ancienne = (Get-Content "$wt\package.json" -Raw | ConvertFrom-Json).version
$nouvelle = node -e "const v=process.argv[1].split('.');v[2]=String(Number(v[2])+1);console.log(v.join('.'))" $ancienne
"Versions : $ancienne installée, $nouvelle publiée"

Push-Location $wt
try {
  if (-not $SansFabrication -or -not (Test-Path $ancien)) {
    "`n=== Installeur $ancienne"
    node scripts\fabriquer.mjs --installeur --leger | Select-Object -Last 1
    if ($LASTEXITCODE -ne 0) { throw 'Fabrication de l''ancienne version impossible.' }
    Copy-Item "$wt\release\CyberPinball-Setup.exe" $ancien
  }
  "`n=== Publication locale de $nouvelle"
  Set-Content "$base\nouveautes.md" "- Version d'essai de la mise à jour`n- Deuxième point des nouveautés" -Encoding UTF8
  $env:CYBERPINBALL_VERSION_ESSAI = $nouvelle
  $publier = @('scripts\publier.mjs', '--leger', '--local', $site, '--url', "http://127.0.0.1:$Port/site", '--notes', "$base\nouveautes.md")
  if ($SansFabrication -and (Test-Path "$wt\release\cyberpinball-maj.json")) { $publier += '--sans-fabrication' }
  node @publier | Select-Object -Last 3
  if ($LASTEXITCODE -ne 0) { throw 'Publication locale impossible.' }
  Remove-Item Env:CYBERPINBALL_VERSION_ESSAI
} finally { Pop-Location }

# Flux falsifié : la version annoncée est changée après signature.
$feed = Get-Content "$site\cyberpinball-maj.json" -Raw | ConvertFrom-Json
$feed.manifest = $feed.manifest -replace "`"version`": `"$nouvelle`"", '"version": "99.0.0"'
$feed | ConvertTo-Json | Set-Content "$faux\cyberpinball-maj.json" -Encoding UTF8

"`n=== Installation de $ancienne dans le bac à sable"
$env:CYBERPINBALL_HOME = $home_
$p = Start-Process $ancien -ArgumentList '/S', '/DEMARRAGE', '/SANSBUREAU', "/D=$racine" -NoNewWindow -PassThru
# Sans ce handle gardé, PowerShell ne donne pas le code de sortie.
$null = $p.Handle
$p.WaitForExit()
if ($p.ExitCode -ne 0 -or -not (Test-Path $exe)) { throw "Installation de $ancienne impossible (code $($p.ExitCode))." }

# Le site : flux et installeur, chaque requête notée.
$journal = "$base\site.txt"; Remove-Item $journal -ErrorAction SilentlyContinue
$serveur = Start-Process node -ArgumentList "`"$PSScriptRoot\demo-mise-a-jour-serveur.cjs`"", "`"$base`"", $Port, "`"$journal`"" -NoNewWindow -PassThru
try {
  for ($i = 0; $i -lt 50 -and -not (Test-Path $journal); $i++) { Start-Sleep -Milliseconds 100 }

  $env:CYBERPINBALL_ROOT = $racine
  function Start-Borne([string]$Flux, [string]$Etapes, [string]$Dossier) {
    $env:CYBERPINBALL_MAJ_URL = "http://127.0.0.1:$Port/$Flux/cyberpinball-maj.json"
    $env:CYBERPINBALL_AUTOPILOT = $Etapes
    $env:CYBERPINBALL_CAPTURE = $Dossier
    $b = Start-Process $exe -ArgumentList "--user-data-dir=$base\electron" -WorkingDirectory $wt -NoNewWindow -PassThru
    if (-not $b.WaitForExit(180000)) { Stop-Borne; throw "Cyber Pinball ne s'est pas fermé ($Dossier)." }
  }

  "`n=== Flux falsifié"
  Start-Borne 'site-falsifie' 'Tab,action:Mise à jour de Cyber Pinball,wait:2500' "$captures\falsifie"

  "`n=== Version disponible"
  # Puis « Plus tard » : retour au menu système, pastille rouge sur l'entrée et sur la roue dentée.
  Start-Borne 'site' 'Tab,action:Mise à jour de Cyber Pinball,wait:2500,action:Plus tard,wait:800' "$captures\disponible"

  "`n=== Mise à jour $ancienne -> $nouvelle"
  # L'installeur relance Cyber Pinball avec le même autopilote, qui écrit dans le même dossier :
  # celui de l'ancienne version est mis de côté dès qu'elle se ferme.
  Start-Borne 'site' 'Tab,action:Mise à jour de Cyber Pinball,wait:2500,action:Mettre à jour maintenant,wait:20000' "$captures\en-cours"
  Rename-Item "$captures\en-cours" "$captures\ancienne"
  "Ancienne version fermée ; l'installeur prend la suite."
  $relance = $null
  for ($i = 0; $i -lt 240 -and -not $relance; $i++) {
    Start-Sleep -Milliseconds 500
    $relance = Get-Process CyberPinball -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $exe } | Select-Object -First 1
  }
  if (-not $relance) { throw 'Cyber Pinball n''a pas été relancé par l''installeur.' }
  "Relancé par l'installeur après $([math]::Round($i / 2)) s."
  if (-not $relance.WaitForExit(180000)) { Stop-Borne; throw 'La nouvelle version ne s''est pas fermée.' }
  Rename-Item "$captures\en-cours" "$captures\nouvelle"
} finally {
  Stop-Process -Id $serveur.Id -Force -ErrorAction SilentlyContinue
  Stop-Borne
}

"`n=== Vérifications"
$problemes = @()
$ini = Get-Content "$racine\app\installation.ini" -Encoding Unicode
$ver = ($ini | Select-String '^version=(.*)$').Matches.Groups[1].Value
if ($ver -ne $nouvelle) { $problemes += "installation.ini : version $ver, attendu $nouvelle" }
if (-not ($ini | Select-String '^demarrage=1$')) { $problemes += 'le lancement au démarrage n''a pas été gardé' }
if ($ini | Select-String '^bureau=1$') { $problemes += 'un raccourci sur le bureau a été ajouté' }
if (-not (Test-Path "$home_\Démarrage\Cyber Pinball.lnk")) { $problemes += 'raccourci du démarrage absent' }
if (Test-Path "$home_\Bureau\Cyber Pinball.lnk") { $problemes += 'raccourci du bureau créé' }
if (Test-Path "$racine\app.precedente") { $problemes += 'app.precedente n''a pas été supprimé' }
# En bac à sable, le dossier de données est celui du bac à sable (sur une borne : <racine>\data).
if (-not (Test-Path "$home_\cabinet.json")) { $problemes += 'dossier de données du bac à sable introuvable' }
if (Test-Path "$home_\mise-a-jour.json") { $problemes += 'suivi mise-a-jour.json non consommé par la nouvelle version' }
if (-not (Test-Path "$racine\downloads\cyberpinball\CyberPinball-Setup-$nouvelle.exe")) { $problemes += 'installeur téléchargé absent' }
$requetes = Get-Content $journal
$requetes | ForEach-Object { "  site : $_" }
if (($requetes | Select-String 'site-falsifie/cyberpinball-maj.json 200').Count -ne 1) { $problemes += 'flux falsifié non demandé' }
if ($requetes | Select-String 'site-falsifie/CyberPinball-Setup') { $problemes += 'installeur téléchargé malgré le flux falsifié' }
if (($requetes | Select-String '/site/CyberPinball-Setup.exe 200').Count -ne 1) { $problemes += 'installeur non téléchargé une fois' }
foreach ($d in 'falsifie', 'disponible', 'ancienne', 'nouvelle') {
  try { Assert-HorsEcran "$captures\$d" } catch { $problemes += "$d : $($_.Exception.Message)" }
  $mep = "$captures\$d\mise-en-page.txt"
  if ((Test-Path $mep) -and ((Get-Content $mep -Raw) -notmatch '^Aucun')) { $problemes += "$d : mise en page, voir $mep" }
}
"Captures : $captures (falsifie, disponible, ancienne, nouvelle)"
if ($problemes) { $problemes | ForEach-Object { "PROBLÈME : $_" }; throw "$($problemes.Count) problème(s)." }
"Mise à jour $ancienne -> $nouvelle : réussie, raccourcis gardés, rien d'autre touché."
