# Banc de la fermeture de VPX avec un DMD réel (scripts\banc-fermeture.mjs), sur le bureau caché : VPX y ouvre ses
# fenêtres, que personne ne voit, et rien ne prend le focus.
#   powershell -File scripts\banc-fermeture.ps1 -Vpx <dossier de VPX 10.8.1> -Table <fichier.vpx> [-Plugin 0|1] [-Wifi <adresse>] [-Attente <ms>] [-Fois <n>] [-FauxZedmd <ms>]
param(
  [Parameter(Mandatory = $true)][string]$Vpx,
  [Parameter(Mandatory = $true)][string]$Table,
  [string]$Plugin,
  [string]$Wifi,
  [string]$Attente,
  [string]$Fois,
  [string]$FauxZedmd
)
. "$PSScriptRoot\bureau-cache.ps1"
if (Enter-BureauCache $PSCommandPath $PSBoundParameters) { exit $LASTEXITCODE }
Assert-Compile
$argsNode = @("$PSScriptRoot\banc-fermeture.mjs", '--vpx', $Vpx, '--table', $Table)
if ($Plugin) { $argsNode += @('--plugin', $Plugin) }
if ($Wifi) { $argsNode += @('--wifi', $Wifi) }
if ($Attente) { $argsNode += @('--attente', $Attente) }
if ($Fois) { $argsNode += @('--fois', $Fois) }
if ($FauxZedmd) { $argsNode += @('--faux-zedmd', $FauxZedmd) }
& node @argsNode
exit $LASTEXITCODE
