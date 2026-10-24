# Démonstration sans opérateur de l'ajout de tables avec la base VPS : prépare un bac à
# sable dans tmp\demo-vps (dossier d'import rempli de fichiers vides aux noms de vraies
# tables), puis (avec -Run) rejoue l'écran de choix du jeu, le plan et l'installation ;
# captures dans tmp\captures\vps. Aucune vraie table n'est touchée.
#   .\docs\demo-vps.ps1 -Run
# Hors écran par défaut, sur les écrans simulés de docs\ecrans\<Ecrans>.json (-Ecrans) ;
# $env:CYBERPINBALL_A_L_ECRAN = '1' pour les vrais écrans du poste (docs\hors-ecran.ps1).
# La base VPS (vpsdb.json) est téléchargée une fois dans tmp\vps si elle n'y est pas,
# puis copiée dans le dossier downloads du bac à sable : la démonstration ne dépend
# pas du réseau ensuite.
param(
  [switch]$Run,
  [string]$Cabinet = 'D:\CyberPinball\data\cabinet.json',
  [string]$Ecrans = 'pc-dev'
)
$ErrorActionPreference = 'Stop'
$wt = Split-Path $PSScriptRoot -Parent
. "$PSScriptRoot\hors-ecran.ps1"
# Tout le reste tourne sur un bureau Windows caché : rien ne peut apparaître sur les écrans du poste.
if (Enter-BureauCache $PSCommandPath $PSBoundParameters) { exit $LASTEXITCODE }
Use-HorsEcran $Ecrans
$base = "$wt\tmp\demo-vps"
$db = "$wt\tmp\vps\vpsdb.json"

if (Test-Path $base) { Remove-Item -Recurse -Force $base }
$root = "$base\root"; $home_ = "$base\home"
New-Item -ItemType Directory -Force "$root\tables", "$root\import", "$root\downloads", $home_ | Out-Null
if (Test-Path $Cabinet) { Copy-ModeleBorne $Cabinet $home_ | Out-Null }

if (-not (Test-Path $db)) {
  New-Item -ItemType Directory -Force (Split-Path $db) | Out-Null
  curl.exe -s -L 'https://raw.githubusercontent.com/VirtualPinballSpreadsheet/vps-db/main/db/vpsdb.json' -o $db
}
Copy-Item $db "$root\downloads\vpsdb.json"
# Vérifiée à l'instant : pas de mise à jour pendant la démonstration.
$now = (Get-Date).ToUniversalTime().ToString('o')
Set-Content -Path "$root\downloads\vpsdb.meta.json" -Value "{ `"checkedAt`": `"$now`", `"downloadedAt`": `"$now`" }" -Encoding UTF8

function New-Fake($path) {
  New-Item -ItemType Directory -Force (Split-Path $path) | Out-Null
  Set-Content -Path $path -Value 'factice' -Encoding ASCII
}
# Sûr : paquet VPUniverse à préfixes numériques, auteur et version collés au nom.
New-Fake "$root\import\Terminator 2 (Williams 1991)\1431544526_Terminator2(Williams1991)g5kv1.1d.vpx"
New-Fake "$root\import\Terminator 2 (Williams 1991)\1492939964_Terminator2(Williams1991)g5kv1.0.directb2s"
# Sûr : article omis, VPW et version.
New-Fake "$root\import\Addams Family (Bally 1992) VPW v2.4.41.vpx"
# Incertains : même titre chez plusieurs fabricants, sans fabricant ni année.
New-Fake "$root\import\Indiana Jones.vpx"
New-Fake "$root\import\Star Wars.vpx"
# Absent de la base.
New-Fake "$root\import\Mon Flipper Perso.vpx"
# Une table déjà installée : sans elle, « Exit : plus tard » laisse l'invite d'installation de VPX.
New-Fake "$root\tables\Black Knight (Williams 1980)\Black Knight (Williams 1980).vpx"

if (-not $Run) { return }

$env:CYBERPINBALL_ROOT = $root; $env:CYBERPINBALL_HOME = $home_; $env:CYBERPINBALL_FLIPPERS = 'bottom'
$env:CYBERPINBALL_CAPTURE = "$wt\tmp\captures\vps"
$env:CYBERPINBALL_AUTOPILOT = @(
  'Escape', 'Escape', 'Digit1',               # VPX : plus tard (sans VPX, pas de lecture des scripts), menu, Ajouter une table
  'click:.lib-action:first-child',             # importer le contenu du dossier d'import
  'ShiftRight', 'Digit1',                      # Indiana Jones : deuxième proposition (Williams 1993)
  'click:.lib-action:last-child',              # Star Wars : garder le nom des fichiers
  'click:.lib-row.fixable',                    # plan : clic sur la ligne VPS d'Addams Family (jeu sûr)
  'Escape',                                    # retour au plan sans changer
  'ShiftRight', 'ShiftRight', 'ShiftRight', 'ShiftRight', 'Digit1', # « Choisir le jeu » de Star Wars
  'ShiftRight', 'Digit1',                      # le curseur est sur le choix actuel : première proposition
  'Digit1',                                    # Installer
  'Escape', 'Escape', 'Escape', 'Escape', 'Escape', 'Escape' # vérifications après l'ajout, menu
) -join ','
if (Test-Path $env:CYBERPINBALL_CAPTURE) { Remove-Item -Recurse -Force $env:CYBERPINBALL_CAPTURE }
Push-Location $wt
try { npx electron app } finally { Pop-Location }
Assert-HorsEcran $env:CYBERPINBALL_CAPTURE
Get-ChildItem "$root\tables" | ForEach-Object {
  "== $($_.Name)"
  Get-ChildItem $_.FullName -Filter *.info | ForEach-Object { Get-Content $_.FullName -Raw }
}
