# Démonstration sans opérateur de la bibliothèque de ROM : prépare un bac à sable dans
# tmp\demo-roms (huit tables, des ROM copiées dans chacune comme avant la bibliothèque),
# puis (avec -Run) rejoue la vue globale, le rangement (migration), la mise à la corbeille
# d'une ROM inutilisée et l'ajout d'une ROM absente ; captures dans tmp\captures\roms.
# La ROM de Terminator 2 est une vraie (copiée depuis la table de test) ; les autres sont
# des fichiers de même taille qu'une vraie ROM, remplis au hasard. Les scripts des tables
# sont déjà « lus » (cache data\cache\scripts.json) : VPX n'est jamais lancé.
#   .\docs\demo-roms.ps1 -Run
# Avec -Terminator2, le cas réel d'une borne : un zip de ROM dont les puces sont dans un
# sous-dossier (t2_l8.zip › t2_l8 › …), qu'un ancien import avait déballé à la racine de la
# table. Le médecin la répare (zip à plat dans la bibliothèque, lié, puces à la corbeille),
# puis le même zip, ajouté pour une autre table, est reconnu comme ROM et refait à plat ;
# captures dans tmp\captures\roms-t2-medecin et roms-t2-import.
#   .\docs\demo-roms.ps1 -Terminator2 -Run
# Hors écran par défaut, sur les écrans simulés de docs\ecrans\<Ecrans>.json (-Ecrans) ;
# $env:CYBERPINBALL_A_L_ECRAN = '1' pour les vrais écrans du poste (docs\hors-ecran.ps1).
param(
  [switch]$Run,
  [switch]$Terminator2,
  [string]$Rom = 'D:\CyberPinball\tables\Terminator 2\pinmame\roms\t2_l8.zip',
  [string]$Emulators = 'D:\CyberPinball\emulators',
  [string]$Cabinet = 'D:\CyberPinball\data\cabinet.json',
  [string]$Ecrans = 'pc-dev'
)
$ErrorActionPreference = 'Stop'
$wt = Split-Path $PSScriptRoot -Parent
. "$PSScriptRoot\hors-ecran.ps1"
# Tout le reste tourne sur un bureau Windows caché : rien ne peut apparaître sur les écrans du poste.
if (Enter-BureauCache $PSCommandPath $PSBoundParameters) { exit $LASTEXITCODE }
Use-HorsEcran $Ecrans
$base = if ($Terminator2) { "$wt\tmp\demo-roms-t2" } else { "$wt\tmp\demo-roms" }

if (Test-Path $base) {
  Get-ChildItem -Directory -Recurse -Depth 2 $base -Attributes ReparsePoint | ForEach-Object { cmd /c rmdir "$($_.FullName)" }
  Remove-Item -Recurse -Force $base
}
$root = "$base\root"; $home_ = "$base\home"
New-Item -ItemType Directory -Force "$root\tables", "$root\import", $home_ | Out-Null
New-Item -ItemType Junction -Path "$root\emulators" -Target $Emulators | Out-Null
if (Test-Path $Cabinet) { Copy-ModeleBorne $Cabinet $home_ | Out-Null }

$old = [datetime]::new(2024, 3, 1, 12, 0, 0, [DateTimeKind]::Utc)
$scripts = @{}

# Vraie archive zip (l'import lit son contenu), d'une puce remplie au hasard.
function New-Rom($path, [int]$size, [datetime]$date, [int]$seed) {
  New-Item -ItemType Directory -Force (Split-Path $path) | Out-Null
  $work = "$base\puce-$seed"
  New-Item -ItemType Directory -Force $work | Out-Null
  $bytes = [byte[]]::new($size); [Random]::new($seed).NextBytes($bytes)
  [IO.File]::WriteAllBytes("$work\$([IO.Path]::GetFileNameWithoutExtension($path))_u6.rom", $bytes)
  Compress-Archive -Path "$work\*" -DestinationPath $path -Force
  Remove-Item -Recurse -Force $work
  (Get-Item $path).LastWriteTimeUtc = $date
}

# Table au fichier .vpx factice, dont le script « demande » ces ROM.
function New-Table($name, [string[]]$roms, [string]$vpxName = $name) {
  $vpx = "$root\tables\$name\$vpxName.vpx"
  New-Item -ItemType Directory -Force (Split-Path $vpx) | Out-Null
  Set-Content -Path $vpx -Value "factice $name" -Encoding ASCII
  $date = [datetime]::new(2026, 1, 1, 0, 0, 0, [DateTimeKind]::Utc)
  (Get-Item $vpx).LastWriteTimeUtc = $date
  $scripts[$vpx.ToLower()] = [ordered]@{
    size = (Get-Item $vpx).Length
    mtimeMs = [DateTimeOffset]::new($date).ToUnixTimeMilliseconds()
    facts = [ordered]@{ usesPinmame = $true; roms = $roms }
    v = 3
  }
  return "$root\tables\$name"
}

if ($Terminator2) {
  # Les vraies puces de t2_l8, déballées de la ROM de la table de test.
  $puces = "$base\puces\t2_l8"
  New-Item -ItemType Directory -Force $puces | Out-Null
  & "$env:SystemRoot\System32\tar.exe" -xf $Rom -C $puces
  if ($LASTEXITCODE -ne 0) { throw "ROM illisible : $Rom" }
  # Deux chemins, chacun dans son bac à sable : le médecin d'abord (« Diagnostiquer et réparer »
  # sur la table abîmée, puis le même zip ajouté pour une autre table), ou le zip ajouté de
  # nouveau d'abord (la vérification qui suit nettoie les puces restées dans la table).
  foreach ($ordre in 'medecin', 'import') {
    $root = "$base\$ordre\root"; $home_ = "$base\$ordre\home"; $scripts = @{}
    New-Item -ItemType Directory -Force "$root\tables", "$root\import", "$root\pinmame\roms", $home_ | Out-Null
    New-Item -ItemType Junction -Path "$root\emulators" -Target $Emulators | Out-Null
    if (Test-Path $Cabinet) { Copy-ModeleBorne $Cabinet $home_ | Out-Null }
    # Terminator 2 telle qu'un ancien import l'a laissée : les puces de la ROM à la racine de la
    # table, à côté de ce qui doit y rester (réglages, journal de sons, enregistrement, cache).
    $t2 = New-Table 'Terminator 2 - Judgment Day (Williams 1991)' @('t2_l8') '1431544526_Terminator2(Williams1991)g5kv1.1d'
    New-Item -ItemType Directory -Force "$t2\cache", "$t2\medias" | Out-Null
    foreach ($f in '1431544526_Terminator2(Williams1991)g5kv1.1d.ini', 'altsound.log', 't2_l8_0.vgm') { Set-Content -Path "$t2\$f" -Value 'reste en place' -Encoding ASCII }
    [IO.File]::WriteAllText("$t2\Terminator 2 - Judgment Day (Williams 1991).info", '{ "Info": { "Title": "Terminator 2 - Judgment Day", "Manufacturer": "Williams", "Year": 1991 } }')
    Copy-Item "$puces\*" $t2
    # Une autre table qui joue la même ROM, sans l'avoir.
    $vr = New-Table 'Terminator 2 VR (Williams 1991)' @('t2_l8')
    # Le zip tel qu'on le télécharge : ses puces dans un sous-dossier du même nom.
    Compress-Archive -Path $puces -DestinationPath "$root\import\t2_l8.zip"
    (Get-Item "$root\import\t2_l8.zip").LastWriteTimeUtc = $old
    New-Item -ItemType Directory -Force "$home_\cache" | Out-Null
    $scripts | ConvertTo-Json -Depth 5 | Set-Content -Path "$home_\cache\scripts.json" -Encoding UTF8

    $show = {
      "  Terminator 2 : $((Get-ChildItem -Name $t2) -join ', ')"
      "  pinmame\roms de Terminator 2 : $((Get-ChildItem -Name "$t2\pinmame\roms" -ErrorAction SilentlyContinue) -join ', ')"
      "  bibliothèque : $((Get-ChildItem -Name "$root\pinmame\roms") -join ', ')"
      "  dossier d'import : $((Get-ChildItem -Name "$root\import") -join ', ')"
    }
    "[$ordre] Avant :"; & $show
    if (-not $Run) { continue }

    $env:CYBERPINBALL_ROOT = $root; $env:CYBERPINBALL_HOME = $home_
    $env:CYBERPINBALL_CAPTURE = "$wt\tmp\captures\roms-t2-$ordre"
    $steps = if ($ordre -eq 'medecin') {
      @(
        'Digit1',                                      # fiche de Terminator 2 (la première de la roue)
        'action:Diagnostiquer',                        # médecin : ROM t2_l8 en fichiers éparpillés à la racine
        'action:Refaire t2_l8.zip',                    # zip à plat dans la bibliothèque, lié, puces à la corbeille ; nouvelle analyse
        'action:Retour à la fiche', 'Escape',          # fiche, roue
        'Escape', 'action:Ajouter une table',          # menu système, Ajouter une table : t2_l8.zip à sous-dossier dans le dossier d'import
        'action:Importer le contenu du dossier',       # plan : ROM reconnue dans « t2_l8 », même contenu que la bibliothèque, liée dans Terminator 2 VR
        'action:Installer',                            # vérification de Terminator 2 VR
        'Escape', 'Escape',                            # fiche, roue
        'Escape', 'action:Bibliothèque de ROM',        # t2_l8 : une ROM, deux tables liées
        'Escape', 'Escape'
      )
    } else {
      @(
        'Escape', 'action:Ajouter une table',          # menu système, Ajouter une table
        'action:Importer le contenu du dossier',       # plan : ROM reconnue dans « t2_l8 », refaite à plat, entre dans la bibliothèque, liée dans 2 tables
        'action:Installer',                            # vérification de Terminator 2 : les puces restées ne servent plus
        'action:Mettre ces fichiers à la corbeille',   # nettoyage ; nouvelle analyse
        'action:Table suivante',                       # vérification de Terminator 2 VR
        'Escape', 'Escape',                            # fiche, roue
        'Escape', 'action:Bibliothèque de ROM',        # t2_l8 : une ROM, deux tables liées
        'Escape', 'Escape'
      )
    }
    $env:CYBERPINBALL_AUTOPILOT = $steps -join ','
    if (Test-Path $env:CYBERPINBALL_CAPTURE) { Remove-Item -Recurse -Force $env:CYBERPINBALL_CAPTURE }
    Push-Location $wt
    try { npx electron app } finally { Pop-Location }
    Assert-HorsEcran $env:CYBERPINBALL_CAPTURE
    "[$ordre] Après :"; & $show
    # Le zip refait est à plat, et c'est le même fichier que celui des deux tables.
    & "$env:SystemRoot\System32\tar.exe" -tf "$root\pinmame\roms\t2_l8.zip" | ForEach-Object { "  t2_l8.zip › $_" }
    $same = 'const fs = require("fs"); const [a, ...rest] = process.argv.slice(1).map((f) => fs.statSync(f, { bigint: true })); ' +
      'console.log(rest.every((b) => b.ino === a.ino && b.dev === a.dev) ? "  Liens : un seul fichier pour la bibliothèque et les deux tables" : "  Liens : ATTENTION, fichiers distincts");'
    node -e $same "$root\pinmame\roms\t2_l8.zip" "$t2\pinmame\roms\t2_l8.zip" "$vr\pinmame\roms\t2_l8.zip"
  }
  return
}

# Terminator 2 : trois tables avec la même ROM copiée, une avec une autre version plus
# ancienne (octets modifiés), une qui l'attend sans l'avoir.
foreach ($t in 'Terminator 2 (Williams 1991)', 'Terminator 2 Judgment Day (Williams 1991)', 'Terminator 2 g5k (Williams 1991)') {
  $f = New-Table $t @('t2_l8')
  New-Item -ItemType Directory -Force "$f\pinmame\roms" | Out-Null
  Copy-Item $Rom "$f\pinmame\roms\t2_l8.zip"
}
$f = New-Table 'Terminator 2 VPW (Williams 1991)' @('t2_l8')
New-Item -ItemType Directory -Force "$f\pinmame\roms" | Out-Null
$bytes = [IO.File]::ReadAllBytes($Rom); $bytes[100] = $bytes[100] -bxor 0xFF
[IO.File]::WriteAllBytes("$f\pinmame\roms\t2_l8.zip", $bytes)
(Get-Item "$f\pinmame\roms\t2_l8.zip").LastWriteTimeUtc = $old
New-Table 'Terminator 2 VR (Williams 1991)' @('t2_l8') | Out-Null

# Attack from Mars : la même ROM copiée dans deux tables.
$afm = New-Table 'Attack from Mars (Bally 1995)' @('afm_113b')
New-Rom "$afm\pinmame\roms\afm_113b.zip" 1048576 $old 1
$f = New-Table 'Attack from Mars Remake (Bally 1995)' @('afm_113b')
New-Item -ItemType Directory -Force "$f\pinmame\roms" | Out-Null
Copy-Item "$afm\pinmame\roms\afm_113b.zip" "$f\pinmame\roms\afm_113b.zip"
# Medieval Madness : seule, hors de la bibliothèque.
$f = New-Table 'Medieval Madness (Williams 1997)' @('mm_109c')
New-Rom "$f\pinmame\roms\mm_109c.zip" 1572864 $old 2
# Twilight Zone : ROM absente partout ; elle attend dans le dossier d'import.
New-Table 'Twilight Zone (Bally 1993)' @('tz_92') | Out-Null
New-Rom "$root\import\tz_92.zip" 1310720 $old 3
# Bibliothèque : une ROM qu'aucune table ne joue plus.
New-Rom "$root\pinmame\roms\fh_l9.zip" 786432 $old 4

New-Item -ItemType Directory -Force "$home_\cache" | Out-Null
$scripts | ConvertTo-Json -Depth 5 | Set-Content -Path "$home_\cache\scripts.json" -Encoding UTF8

# Place occupée par les fichiers .zip des dossiers pinmame\roms (bibliothèque et tables),
# chaque fichier physique (volume et numéro de fichier) compté une fois.
function Measure-Roms {
  $files = Get-ChildItem -Recurse -File -Filter *.zip "$root\tables", "$root\pinmame" -ErrorAction SilentlyContinue | Where-Object { $_.DirectoryName -like '*\pinmame\roms' }
  $measure = 'const fs = require("fs"); const seen = new Map(); let logical = 0; ' +
    'for (const f of process.argv.slice(1)) { const s = fs.statSync(f, { bigint: true }); logical += Number(s.size); seen.set(`${s.dev}:${s.ino}`, Number(s.size)); } ' +
    'const physical = [...seen.values()].reduce((a, b) => a + b, 0); ' +
    'console.log(`${process.argv.length - 1} fichiers .zip, ${logical.toLocaleString("fr-FR")} octets sans les liens, ${physical.toLocaleString("fr-FR")} octets sur le disque (${seen.size} fichiers physiques)`);'
  node -e $measure @($files.FullName)
}
"Avant : $(Measure-Roms)"

if (-not $Run) { return }

$env:CYBERPINBALL_ROOT = $root; $env:CYBERPINBALL_HOME = $home_
$env:CYBERPINBALL_CAPTURE = "$wt\tmp\captures\roms"
$env:CYBERPINBALL_AUTOPILOT = @(
  # Les entrées du menu système sont désignées par leur libellé : leur rang change quand le menu grandit.
  'Escape', 'action:Bibliothèque de ROM',           # menu système, Bibliothèque de ROM : la vue avant rangement
  'Digit1',                                         # Ranger les ROM : le plan
  'ShiftRight', 'ShiftRight', 'Digit1',             # Terminator 2 : garder l'ancienne version…
  'Digit1',                                         # … puis revenir à la plus récente
  'ShiftLeft', 'ShiftLeft', 'Digit1',               # Ranger : bilan mesuré, sur la vue après rangement
  'action:Mettre « fh_l9 »', 'action:Continuer',   # fh_l9 inutilisée à la corbeille, retour à la vue
  'action:Ajouter', 'action:Importer le contenu du dossier', # Ajouter : dossier d'import, plan (tz_92 → bibliothèque, liée)
  'action:Installer',                               # Installer : vérification de Twilight Zone
  'Escape', 'Escape',                               # fiche, menu
  'Escape', 'action:Bibliothèque de ROM',           # la vue finale
  'Escape', 'Escape'
) -join ','
if (Test-Path $env:CYBERPINBALL_CAPTURE) { Remove-Item -Recurse -Force $env:CYBERPINBALL_CAPTURE }
Push-Location $wt
try { npx electron app } finally { Pop-Location }
Assert-HorsEcran $env:CYBERPINBALL_CAPTURE
"Après : $(Measure-Roms)"
