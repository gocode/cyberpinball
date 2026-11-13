# Banc d'essai de VPX dans le casque (scripts\banc-vpx.mjs), sur le bureau caché : VPX y ouvre sa fenêtre
# d'aperçu, que personne ne voit, et rien ne prend le focus.
#   powershell -File scripts\banc-vpx.ps1 -Vpx <dossier de VPX 10.8.1> -Table <fichier.vpx> [-Scenario <fichier>] [-Duree <ms>]
# Cadence de VPX : -Scenario repos, -Cadence exacte, -Garde 0|1|2, -Plugin 0, -Captures 0, -Essai 1 (voir banc-vpx.mjs).
param(
  [Parameter(Mandatory = $true)][string]$Vpx,
  [Parameter(Mandatory = $true)][string]$Table,
  [string]$Scenario,
  [int]$Duree = 40000,
  [string]$ImageCalage,
  [string]$Cadence,
  [string]$Garde,
  [string]$Plugin,
  [string]$Captures,
  [string]$Essai
)
. "$PSScriptRoot\bureau-cache.ps1"
if (Enter-BureauCache $PSCommandPath $PSBoundParameters) { exit $LASTEXITCODE }
Assert-Compile
$argsNode = @("$PSScriptRoot\banc-vpx.mjs", '--vpx', $Vpx, '--table', $Table, '--duree', $Duree)
if ($Scenario) { $argsNode += @('--scenario', $Scenario) }
if ($ImageCalage) { $argsNode += @('--image-calage', $ImageCalage) }
if ($Cadence) { $argsNode += @('--cadence', $Cadence) }
if ($Garde) { $argsNode += @('--garde', $Garde) }
if ($Plugin) { $argsNode += @('--plugin', $Plugin) }
if ($Captures) { $argsNode += @('--captures', $Captures) }
if ($Essai) { $argsNode += @('--essai', $Essai) }
& node @argsNode
exit $LASTEXITCODE
