# Démonstration sans opérateur de la gestion des tables : prépare deux bacs à sable
# dans tmp\demo-tables à partir d'une table de test, puis (avec -Run) rejoue fiche,
# médecin, modification, ajout, glisser-déposer et lancement ; captures dans tmp\captures.
# Les gros fichiers sont des liens physiques vers la table de test : renommer, déplacer
# ou mettre à la corbeille ne touche que l'entrée du bac à sable, jamais l'original.
#   .\docs\demo-tables.ps1 -Run
# Hors écran par défaut, sur les écrans simulés de docs\ecrans\<Ecrans>.json (-Ecrans) ;
# $env:CYBERPINBALL_A_L_ECRAN = '1' pour les vrais écrans du poste (docs\hors-ecran.ps1).
# Hors écran, « Jouer » montre le refus (une partie de VPX nécessite les écrans du poste) ;
# à l'écran, la partie se déroule et le menu revient. Les racines ont une fausse installation
# de VPX (New-FauxVpx) ; à l'écran seulement, le temps de la partie, celle de l'ajout voit les
# vrais émulateurs par une jonction, retirée aussitôt (Remove-JonctionsSortantes).
param(
  [switch]$Run,
  # Table de test : deux .vpx de Terminator 2, deux .directb2s, pinmame\roms\t2_l8.zip, crash.txt.
  [string]$Table = 'D:\CyberPinball\tables\Terminator 2',
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
$src = $Table
$base = "$wt\tmp\demo-tables"

# Nettoyage : d'abord les jonctions d'une racine d'avant le 29/10/2026 ou d'une partie
# interrompue (sans /s, pour ne jamais descendre dans les émulateurs).
if (Test-Path $base) {
  Get-ChildItem -Directory -Recurse -Depth 2 $base -Attributes ReparsePoint | ForEach-Object { cmd /c rmdir "$($_.FullName)" }
  Remove-Item -Recurse -Force $base
}

function New-Root($name) {
  $root = "$base\$name\root"; $data = "$base\$name\home"
  New-Item -ItemType Directory -Force "$root\tables", "$root\import", $data | Out-Null
  New-FauxVpx $root
  Copy-ModeleBorne $Cabinet $data | Out-Null
  return $root
}

# A : ajout depuis le dossier d'import (archive zip + ROM en vrac).
$a = New-Root 'ajout'
$pack = "$base\ajout\pack\Terminator 2 (Williams 1991)"
New-Item -ItemType Directory -Force $pack | Out-Null
New-Item -ItemType HardLink -Path "$pack\1431544526_Terminator2(Williams1991)g5kv1.1d.vpx" -Target "$src\1431544526_Terminator2(Williams1991)g5kv1.1d.vpx" | Out-Null
New-Item -ItemType HardLink -Path "$pack\1492939964_Terminator2(Williams1991)g5kv1.0.directb2s" -Target "$src\1492939964_Terminator2(Williams1991)g5kv1.0.directb2s" | Out-Null
Set-Content -Path "$pack\Lisez-moi.txt" -Value 'Table g5k, ROM t2_l8.' -Encoding UTF8
Copy-Item "$src\crash.txt" $pack
Push-Location "$base\ajout\pack"
& "$env:SystemRoot\System32\tar.exe" -a -c -f "$a\import\Terminator2_g5k.zip" 'Terminator 2 (Williams 1991)'
Pop-Location
Copy-Item "$src\pinmame\roms\t2_l8.zip" "$a\import\t2_l8.zip"

# B : fiche et médecin sur une copie de la table de test en mauvais état.
$b = New-Root 'medecin'
$t2 = "$b\tables\Terminator 2"
New-Item -ItemType Directory -Force "$t2\roms" | Out-Null
foreach ($f in 'Terminator 2 (Williams 1991) g5k 1.25.vpx', '1431544526_Terminator2(Williams1991)g5kv1.1d.vpx', '1492939964_Terminator2(Williams1991)g5kv1.0.directb2s') {
  New-Item -ItemType HardLink -Path "$t2\$f" -Target "$src\$f" | Out-Null
}
Copy-Item "$src\pinmame\roms\t2_l8.zip" "$t2\roms\t2_l8.zip"
Set-Content -Path "$t2\Terminator 2 (Williams 1991) g5k 1.25.vbs" -Value "' script extrait" -Encoding ASCII
Copy-Item "$src\crash.txt" $t2
$fs = [IO.File]::Create("$t2\crash.dmp"); $fs.SetLength(48MB); $fs.Close()
(Get-Item "$t2\crash.dmp").LastWriteTime = (Get-Item "$src\crash.dmp").LastWriteTime
New-Item -ItemType HardLink -Path "$b\tables\Terminator 2 (Williams 1991) g5k 1.25.vpx" -Target "$src\Terminator 2 (Williams 1991) g5k 1.25.vpx" | Out-Null

if (-not $Run) { return }

function Invoke-Autopilot($name, $steps) {
  $env:CYBERPINBALL_ROOT = "$base\$name\root"; $env:CYBERPINBALL_HOME = "$base\$name\home"
  $env:CYBERPINBALL_CAPTURE = "$wt\tmp\captures\$name"; $env:CYBERPINBALL_AUTOPILOT = $steps -join ','
  if (Test-Path $env:CYBERPINBALL_CAPTURE) { Remove-Item -Recurse -Force $env:CYBERPINBALL_CAPTURE }
  Push-Location $wt
  try { npx electron app } finally { Pop-Location }
  Assert-HorsEcran $env:CYBERPINBALL_CAPTURE
}

Invoke-Autopilot 'medecin' @(
  'Escape', 'click:.lib-action:last-child',                                   # menu système, retour à la souris
  'Digit1', 'click:.lib-action[data-label="Diagnostiquer et réparer"]',     # fiche, Diagnostiquer à la souris
  'click:.lib-row.fixable',                                                   # répare la ROM en cliquant le constat
  'action:Tout réparer',                                                      # Tout réparer
  'action:Retour à la fiche',                                                 # retour à la fiche
  'action:Modifier les informations', 'Digit1', 'type:: Judgment Day', 'Enter', # titre au clavier
  'ShiftRight', 'Digit1', 'Escape',                                           # liste des fabricants
  'ShiftRight', 'Digit1', 'click:.key:nth-child(13)', 'Enter',                # année : + à la souris
  'ShiftRight', 'Digit1',                                                     # enregistrer
  'action:Supprimer la table', 'Escape', 'Escape',                            # suppression proposée puis annulée
  'ShiftLeft', 'Digit1', 'action:Diagnostiquer et réparer',                    # table en vrac : médecin
  'Digit1', 'Escape', 'Escape'                                                # rangée dans son dossier, ROM absente
)
# Jouer depuis la fiche : la partie puis le retour au menu, ou, hors écran, le refus (Start : menu).
$aLEcran = $env:CYBERPINBALL_A_L_ECRAN -eq '1'
$jouer = if ($aLEcran) { @('Digit1', 'Digit1', 'wait:30000') } else { @('Digit1', 'Digit1', 'Digit1') }
if ($aLEcran) {
  # La vraie partie a besoin du vrai VPX : la fausse installation cède la place à une jonction.
  Remove-Item -Recurse -Force "$a\emulators"
  New-Item -ItemType Junction -Path "$a\emulators" -Target $Emulators | Out-Null
}
try {
  Invoke-Autopilot 'ajout' (@(
    'Digit1', 'click:.lib-action:first-child', 'Digit1',                        # aucune table, import, plan, installer
    'ShiftRight', 'Digit1', 'Escape',                                           # fiche, menu
    "drop:$pack\1492939964_Terminator2(Williams1991)g5kv1.0.directb2s", 'Escape'  # glisser-déposer : remplacement proposé, annulé
  ) + $jouer)
} finally {
  # À l'écran, Enter-BureauCache ne passe pas : la jonction est retirée ici.
  Remove-JonctionsSortantes
}
