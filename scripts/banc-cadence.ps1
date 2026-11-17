# Banc de la cadence des images d'une table (scripts\banc-cadence.mjs), sur le bureau caché : VPX y ouvre ses
# fenêtres, que personne ne voit, et rien ne prend le focus.
#   powershell -File scripts\banc-cadence.ps1 -Vpx <dossier de VPX 10.8.1> -Table <fichier.vpx> [-Fenetres 640x360,1920x1080] [-Duree <s>] [-Cadence <n>] [-Ini <Section.Clé=valeur;...>]
param(
  [Parameter(Mandatory = $true)][string]$Vpx,
  [Parameter(Mandatory = $true)][string]$Table,
  [string]$Fenetres,
  [string]$Duree,
  [string]$Cadence,
  [string]$Ini
)
. "$PSScriptRoot\bureau-cache.ps1"
if (Enter-BureauCache $PSCommandPath $PSBoundParameters) { exit $LASTEXITCODE }
Assert-Compile
$argsNode = @("$PSScriptRoot\banc-cadence.mjs", '--vpx', $Vpx, '--table', $Table)
if ($Fenetres) { $argsNode += @('--fenetres', $Fenetres) }
if ($Duree) { $argsNode += @('--duree', $Duree) }
if ($Cadence) { $argsNode += @('--cadence', $Cadence) }
if ($Ini) { $argsNode += @('--ini', $Ini) }
& node @argsNode
exit $LASTEXITCODE
