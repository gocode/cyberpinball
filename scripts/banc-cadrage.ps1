# Banc du cadrage des tables (scripts\banc-cadrage.mjs), sur le bureau caché : VPX y ouvre sa fenêtre, que personne ne
# voit, et rien ne prend le focus.
#   powershell -File scripts\banc-cadrage.ps1 -Vpx <dossier de VPX 10.8.1-5436> -Table <fichier.vpx> [-Roms <dossier des ROM>] [-Sortie <planche.png>]
#     [-Etude] [-Images <dossier>]   (étude : cadrages candidats, une image et ses mesures par cadrage dans <dossier>)
param(
  [Parameter(Mandatory = $true)][string]$Vpx,
  [Parameter(Mandatory = $true)][string]$Table,
  [string]$Roms,
  [string]$Sortie,
  [switch]$Etude,
  [string]$Images
)
. "$PSScriptRoot\bureau-cache.ps1"
if (Enter-BureauCache $PSCommandPath $PSBoundParameters) { exit $LASTEXITCODE }
Assert-Compile
$argsNode = @("$PSScriptRoot\banc-cadrage.mjs", '--vpx', $Vpx, '--table', $Table)
if ($Roms) { $argsNode += @('--roms', $Roms) }
if ($Sortie) { $argsNode += @('--sortie', $Sortie) }
if ($Etude) { $argsNode += @('--etude', '1') }
if ($Images) { $argsNode += @('--images', $Images) }
& node @argsNode
exit $LASTEXITCODE
