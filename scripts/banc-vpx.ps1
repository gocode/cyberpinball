# Banc d'essai de VPX dans le casque (scripts\banc-vpx.mjs), sur le bureau caché : VPX y ouvre sa fenêtre
# d'aperçu, que personne ne voit, et rien ne prend le focus.
#   powershell -File scripts\banc-vpx.ps1 -Vpx <dossier de VPX 10.8.1> -Table <fichier.vpx> [-Scenario <fichier>] [-Duree <ms>]
param(
  [Parameter(Mandatory = $true)][string]$Vpx,
  [Parameter(Mandatory = $true)][string]$Table,
  [string]$Scenario,
  [int]$Duree = 40000
)
. "$PSScriptRoot\bureau-cache.ps1"
if (Enter-BureauCache $PSCommandPath $PSBoundParameters) { exit $LASTEXITCODE }
Assert-Compile
$argsNode = @("$PSScriptRoot\banc-vpx.mjs", '--vpx', $Vpx, '--table', $Table, '--duree', $Duree)
if ($Scenario) { $argsNode += @('--scenario', $Scenario) }
& node @argsNode
exit $LASTEXITCODE
