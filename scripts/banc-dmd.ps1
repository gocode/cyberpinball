# Banc du DMD qui remplit sa fenêtre redimensionnée en partie (scripts\banc-dmd.mjs), sur le bureau caché : VPX y
# ouvre ses fenêtres, que personne ne voit, et rien ne prend le focus.
#   powershell -File scripts\banc-dmd.ps1 -Vpx <dossier de VPX 10.8.1> -Table <fichier.vpx> -Pinmame <dossier de PinMAME> [-Suivi 0|1|2|tous]
param(
  [Parameter(Mandatory = $true)][string]$Vpx,
  [Parameter(Mandatory = $true)][string]$Table,
  [Parameter(Mandatory = $true)][string]$Pinmame,
  [string]$Suivi,
  [string]$Tailles
)
. "$PSScriptRoot\bureau-cache.ps1"
if (Enter-BureauCache $PSCommandPath $PSBoundParameters) { exit $LASTEXITCODE }
Assert-Compile
$argsNode = @("$PSScriptRoot\banc-dmd.mjs", '--vpx', $Vpx, '--table', $Table, '--pinmame', $Pinmame)
if ($Suivi) { $argsNode += @('--suivi', $Suivi) }
if ($Tailles) { $argsNode += @('--tailles', $Tailles) }
& node @argsNode
exit $LASTEXITCODE
