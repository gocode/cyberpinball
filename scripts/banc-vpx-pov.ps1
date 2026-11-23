# Automated native regression: legacy POV imports, entirely on the hidden desktop.
param(
  [Parameter(Mandatory = $true)][string]$Vpx,
  [string]$Exe
)
. "$PSScriptRoot\bureau-cache.ps1"
if (Enter-BureauCache $PSCommandPath $PSBoundParameters) { exit $LASTEXITCODE }
$env:CYBERPINBALL_BANC_POV_HIDDEN = '1'
$argsNode = @("$PSScriptRoot\banc-vpx-pov.mjs", '--vpx', $Vpx)
if ($Exe) { $argsNode += @('--exe', $Exe) }
& node @argsNode
exit $LASTEXITCODE
