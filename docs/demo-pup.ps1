# Démonstration sans opérateur des PuP-Packs : prépare un bac à sable dans tmp\demo-pup
# avec deux tables factices et un pack factice, puis (avec -Run) rejoue l'ajout du pack
# (choix de l'option, plan, installation, vérification), le médecin sur une table dont
# le pack est mal rangé, puis fiche > « PuP-Pack » (options, une autre appliquée) ; captures dans tmp\captures\pup (et tmp\captures\pup-deux-ecrans :
# le même ajout sur une borne simulée à deux écrans). Aucune vraie table n'est touchée,
# aucun .bat n'est exécuté : les packs sont faits de petits fichiers texte.
#   .\docs\demo-pup.ps1 -Run
# Hors écran par défaut, sur les écrans simulés de docs\ecrans\<Ecrans>.json (-Ecrans) ;
# $env:CYBERPINBALL_A_L_ECRAN = '1' pour les vrais écrans du poste (docs\hors-ecran.ps1).
# Le script de chaque table factice est pré-enregistré dans le cache de Cyber Pinball :
# VPX n'est jamais lancé sur ces fichiers.
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
$base = "$wt\tmp\demo-pup"

if (Test-Path $base) {
  Get-ChildItem -Directory -Recurse -Depth 2 $base -Attributes ReparsePoint | ForEach-Object { cmd /c rmdir "$($_.FullName)" }
  Remove-Item -Recurse -Force $base
}
$root = "$base\root"; $home_ = "$base\home"
New-Item -ItemType Directory -Force "$root\tables", "$root\import", $home_ | Out-Null
# VPX « installé » : une fausse installation (New-FauxVpx), jamais les vrais émulateurs.
New-FauxVpx $root
if (Test-Path $Cabinet) { Copy-ModeleBorne $Cabinet $home_ | Out-Null }

function New-File($path, $text = 'factice') {
  New-Item -ItemType Directory -Force (Split-Path $path) | Out-Null
  [IO.File]::WriteAllText($path, $text)
}
$header = 'ScreenNum,ScreenDes,PlayList,PlayFile,Loopit,Active,Priority,CustomPos'
function Screens($topper, $dmd, $playfield = $false) {
  $t = if ($topper) { 'ForceON' } else { 'Off' }
  $p = if ($playfield) { 'ForcePoP' } else { 'Off' }
  $d = switch ($dmd) { 'separate' { '5,FullDMD,,,0,ForceON,0,' } 'backglass' { '5,FullDMD,,,0,ForceON,0,"2,0,60,100,40"' } default { '5,FullDMD,,,0,Off,0,' } }
  "$header`r`n0,Topper,Topper,,0,$t,0,`r`n2,Backglass,Backglass,,0,ForceON,0,`r`n3,Playfield,,,0,$p,0,`r`n$d`r`n"
}
# Pack « avec options » à la manière des packs publiés : variantes dans PuP-Pack_Options,
# un .bat par option à la racine (xcopy puis del des outils du mode classique).
function New-Pack($dir, [switch]$Unreadable, [switch]$Playfield) {
  $options = [ordered]@{
    'Option 1 - Backglass and Topper' = (Screens $true 'separate' $Playfield)
    'Option 2 - FullDMD on Backglass' = (Screens $false 'backglass' $Playfield)
    'Option 3 - Desktop'              = (Screens $false 'backglass' $true)
  }
  foreach ($name in $options.Keys) {
    New-File "$dir\PuP-Pack_Options\$name\screens.pup" $options[$name]
    New-File "$dir\PuP-Pack_Options\$name\playlists.pup" "ScreenNum,Folder,Des,AlphaSort,RestSeconds,Volume,Priority`r`n2,Backglass,$name,0,0,100,1`r`n"
    New-File "$dir\PuP-Pack_Options\$name\triggers.pup" "ID,Active,Descript,Trigger,ScreenNum,PlayList,PlayFile,Volume,Priority,Length,Counter,RestSeconds,Loop`r`n"
    New-File "$dir\$name.bat" "rem echo off`r`nxcopy /y `"PuP-Pack_Options\$name\*`"`r`ndel /Q PuPDesktopPunch.exe`r`ndel /Q PuPInit.bat`r`n"
  }
  if ($Unreadable) {
    New-File "$dir\Option 3 - Desktop.bat" "@echo off`r`nif exist PuPDesktopPunch.exe start PuPDesktopPunch.exe`r`nxcopy /y `"PuP-Pack_Options\Option 3 - Desktop\*`"`r`n"
  }
  New-File "$dir\PuPInit.bat" "start `"`" PuPDesktopPunch.exe`r`n"
  New-File "$dir\PuPDesktopPunch.exe" 'exe factice'
  New-File "$dir\Backglass\attract.mp4" 'video factice'
  New-File "$dir\Topper\topper.mp4" 'video factice'
  New-File "$dir\FONTS\police.ttf" 'police factice'
}

# Monster Bash : table installée sans son pack (ROM mb_106b).
$mb = "$root\tables\Monster Bash (Williams 1998)"
New-File "$mb\Monster Bash (Williams 1998) VPW 1.1.vpx"
New-File "$mb\Monster Bash (Williams 1998).directb2s"
New-File "$mb\pinmame\roms\mb_106b.zip"
New-File "$mb\Monster Bash (Williams 1998).info" '{ "Info": { "Title": "Monster Bash", "Manufacturer": "Williams", "Year": 1998 } }'

# Le pack arrive dans une archive, un dossier trop bas, avec des restes de macOS.
$pack = "$base\pack\Monster Bash PuP-Pack v2"
New-Pack "$pack\mb_106b\mb_106b" -Unreadable
New-File "$pack\Lisez-moi.txt" 'Copier mb_106b dans PUPVideos puis lancer le .bat de son option.'
New-File "$pack\mb_106b\mb_106b\._screens.pup" 'resource fork'
New-File "$pack\mb_106b\mb_106b\.DS_Store" 'mac'
New-File "$pack\mb_106b\mb_106b\Backglass\vide.mp4" ''
Push-Location "$base\pack"
& "$env:SystemRoot\System32\tar.exe" -a -c -f "$root\import\Monster Bash PuP-Pack v2.zip" 'Monster Bash PuP-Pack v2'
Pop-Location

# Attack from Mars : pack déjà là, mais rangé un dossier trop bas, option jamais appliquée,
# et un ancien pack resté à côté.
$afm = "$root\tables\Attack from Mars (Bally 1995)"
New-File "$afm\Attack from Mars (Bally 1995) VPW 2.0.vpx"
New-File "$afm\Attack from Mars (Bally 1995).directb2s"
New-File "$afm\pinmame\roms\afm_113b.zip"
New-File "$afm\Attack from Mars (Bally 1995).info" '{ "Info": { "Title": "Attack from Mars", "Manufacturer": "Bally", "Year": 1995 } }'
New-Pack "$afm\pupvideos\afm_113b\afm_113b" -Playfield
New-File "$afm\pupvideos\AFM PuP-Pack v1\screens.pup" (Screens $true 'separate')

# Scripts des tables : ROM et pack chargé par B2SInit, comme VPinballX -ExtractVBS les aurait lus.
$seed = "$base\seed-scripts.mjs"
@'
import * as fs from 'node:fs';
import * as path from 'node:path';
const [home, ...pairs] = process.argv.slice(2);
const cache = {};
for (let i = 0; i < pairs.length; i += 2) {
  const stat = fs.statSync(pairs[i]);
  const rom = pairs[i + 1];
  cache[pairs[i].toLowerCase()] = { size: stat.size, mtimeMs: stat.mtimeMs, v: 7, facts: { usesPinmame: true, roms: [rom], pup: { packNames: [rom], playlistAdd: false } } };
}
fs.mkdirSync(path.join(home, 'cache'), { recursive: true });
fs.writeFileSync(path.join(home, 'cache', 'scripts.json'), JSON.stringify(cache, null, 2) + '\n');
'@ | Set-Content -Path $seed -Encoding UTF8
node $seed $home_ "$mb\Monster Bash (Williams 1998) VPW 1.1.vpx" 'mb_106b' "$afm\Attack from Mars (Bally 1995) VPW 2.0.vpx" 'afm_113b'

# Second bac à sable : la même table et le même pack, sans .bat illisible, sur une borne
# à deux écrans (ni DMD ni topper) : l'option « FullDMD on Backglass » est retenue d'office.
$root2 = "$base\deux-ecrans\root"; $home2 = "$base\deux-ecrans\home"
New-Item -ItemType Directory -Force "$root2\tables", "$root2\import", $home2 | Out-Null
New-FauxVpx $root2
if (Test-Path $Cabinet) {
  $cab = Get-ModeleBorne $Cabinet
  $cab.roles.PSObject.Properties.Remove('dmd'); $cab.roles.PSObject.Properties.Remove('topper')
  $cab | ConvertTo-Json -Depth 20 | Set-Content -Path "$home2\cabinet.json" -Encoding UTF8
}
$mb2 = "$root2\tables\Monster Bash (Williams 1998)"
Copy-Item -Recurse $mb (Split-Path $mb2)
$pack2 = "$base\pack2\Monster Bash PuP-Pack v2"
New-Pack "$pack2\mb_106b"
Push-Location "$base\pack2"
& "$env:SystemRoot\System32\tar.exe" -a -c -f "$root2\import\Monster Bash PuP-Pack v2.zip" 'Monster Bash PuP-Pack v2'
Pop-Location
node $seed $home2 "$mb2\Monster Bash (Williams 1998) VPW 1.1.vpx" 'mb_106b'

if (-not $Run) { return }

function Invoke-Autopilot($r, $h, $captures, $steps) {
  $env:CYBERPINBALL_ROOT = $r; $env:CYBERPINBALL_HOME = $h
  $env:CYBERPINBALL_CAPTURE = $captures; $env:CYBERPINBALL_AUTOPILOT = $steps -join ','
  if (Test-Path $captures) { Remove-Item -Recurse -Force $captures }
  Push-Location $wt
  try { npx electron app } finally { Pop-Location }
  Assert-HorsEcran $captures
}

Invoke-Autopilot $root $home_ "$wt\tmp\captures\pup" @(
  'Escape', 'action:Ajouter une table',        # menu système, Ajouter une table
  'click:.lib-action:first-child',             # importer le dossier d'import : un .bat illisible, l'option est demandée
  'Digit1',                                    # option proposée d'après la borne
  'Digit1',                                    # plan : Installer
  'Escape',                                    # vérification après l'ajout, puis la fiche
  'Escape', 'ShiftLeft', 'Digit1',             # menu, Attack from Mars, fiche
  'action:Diagnostiquer',                      # Diagnostiquer et réparer (par son libellé : la fiche gagne des actions)
  'action:Tout réparer',                       # pack remonté, ancien pack à la corbeille
  'action:Appliquer',                          # l'analyse suivante propose l'option : l'appliquer
  'Escape',                                    # retour à la fiche : « PuP-Pack » montre l'option appliquée
  'action:PuP-Pack',                           # les options du pack, l'appliquée et la conseillée
  'action:Option 2 - FullDMD on Backglass',    # une autre option, choisie ici : appliquée et retenue
  'Escape', 'Escape'
)
Invoke-Autopilot $root2 $home2 "$wt\tmp\captures\pup-deux-ecrans" @(
  'Escape', 'action:Ajouter une table', 'click:.lib-action:first-child', # plan : option retenue d'office, sans question
  'Escape'                                             # Annuler
)
foreach ($t in $mb, $afm) {
  "== $(Split-Path $t -Leaf)"
  Get-ChildItem -Recurse "$t\pupvideos" -Depth 1 | ForEach-Object { $_.FullName.Substring($t.Length + 1) }
  Get-Content "$t\*.info" -Raw
}
