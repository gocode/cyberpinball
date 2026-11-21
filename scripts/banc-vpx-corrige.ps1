# Banc du VPX corrigé (scripts\banc-vpx-corrige.mjs), sur le bureau caché : VPX y ouvre ses fenêtres, que personne ne
# voit, et rien ne prend le focus.
#   powershell -File scripts\banc-vpx-corrige.ps1 -Vpx <dossier de VPX 10.8.1-5436> -Table <fichier.vpx> [-Roms <dossier des ROM>] [-Duree 75000]
param(
  [Parameter(Mandatory = $true)][string]$Vpx,
  [Parameter(Mandatory = $true)][string]$Table,
  [string]$Roms,
  [string]$Duree
)
. "$PSScriptRoot\bureau-cache.ps1"
if (Enter-BureauCache $PSCommandPath $PSBoundParameters) { exit $LASTEXITCODE }
Assert-Compile
$argsNode = @("$PSScriptRoot\banc-vpx-corrige.mjs", '--vpx', $Vpx, '--table', $Table)
if ($Roms) { $argsNode += @('--roms', $Roms) }
if ($Duree) { $argsNode += @('--duree', $Duree) }
& node @argsNode
exit $LASTEXITCODE
