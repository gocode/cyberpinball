# Banc des pré-réglages de qualité (scripts\banc-qualite-vpx.mjs), sur le bureau caché : VPX y ouvre sa fenêtre, que
# personne ne voit, et rien ne prend le focus.
#   powershell -File scripts\banc-qualite-vpx.ps1 -Vpx <dossier de VPX 10.8.1-5436> -Table <fichier.vpx> [-Roms <dossier des ROM>] [-Duree 130000] [-Largeur 1920] [-Hauteur 1080] [-Modes performance,equilibre]
param(
  [Parameter(Mandatory = $true)][string]$Vpx,
  [Parameter(Mandatory = $true)][string]$Table,
  [string]$Roms,
  [string]$Duree,
  [string]$Largeur,
  [string]$Hauteur,
  [string]$Modes
)
. "$PSScriptRoot\bureau-cache.ps1"
if (Enter-BureauCache $PSCommandPath $PSBoundParameters) { exit $LASTEXITCODE }
Assert-Compile
$argsNode = @("$PSScriptRoot\banc-qualite-vpx.mjs", '--vpx', $Vpx, '--table', $Table)
if ($Roms) { $argsNode += @('--roms', $Roms) }
if ($Duree) { $argsNode += @('--duree', $Duree) }
if ($Largeur) { $argsNode += @('--largeur', $Largeur) }
if ($Hauteur) { $argsNode += @('--hauteur', $Hauteur) }
if ($Modes) { $argsNode += @('--modes', $Modes) }
& node @argsNode
exit $LASTEXITCODE