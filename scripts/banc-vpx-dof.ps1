# Banc de la bibliothèque DOF corrigée (série 6) : table de démonstration jouée puis fermée, entièrement sur le bureau caché.
param(
  [Parameter(Mandatory = $true)][string]$Vpx,
  [string]$Table,
  [int]$Secondes = 12,
  [string]$Dll
)
. "$PSScriptRoot\bureau-cache.ps1"
if (Enter-BureauCache $PSCommandPath $PSBoundParameters) { exit $LASTEXITCODE }
$argsNode = @("$PSScriptRoot\banc-vpx-dof.mjs", '--vpx', $Vpx, '--secondes', $Secondes)
if ($Table) { $argsNode += @('--table', $Table) }
if ($Dll) { $argsNode += @('--dll', $Dll) }
& node @argsNode
exit $LASTEXITCODE
