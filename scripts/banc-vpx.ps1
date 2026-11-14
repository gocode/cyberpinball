# Banc d'essai de VPX dans le casque (scripts\banc-vpx.mjs), sur le bureau caché : VPX y ouvre sa fenêtre
# d'aperçu, que personne ne voit, et rien ne prend le focus.
#   powershell -File scripts\banc-vpx.ps1 -Vpx <dossier de VPX 10.8.1> -Table <fichier.vpx> [-Scenario <fichier>] [-Duree <ms>]
# Cadence de VPX : -Scenario repos, -Cadence exacte, -Garde 0|1|2, -Plugin 0, -Captures 0, -Essai 1 (voir banc-vpx.mjs).
# Couche du repère de la pièce : -Repere 1 (preuve : trois remises d'origine en partie), -Couche 0 (la même sans elle),
# -GardeCouche 1 (VPX qui tombe avec la couche : écartée, la partie suivante sans elle),
# -Calage 1 (calage en partie fait et vérifié après une correction non nulle, cinq gâchettes de suite).
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
  [string]$Essai,
  [string]$Repere,
  [string]$Couche,
  [string]$GardeCouche,
  [string]$Calage
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
if ($Repere) { $argsNode += @('--repere', $Repere) }
if ($Couche) { $argsNode += @('--couche', $Couche) }
if ($GardeCouche) { $argsNode += @('--garde-couche', $GardeCouche) }
if ($Calage) { $argsNode += @('--calage', $Calage) }
& node @argsNode
exit $LASTEXITCODE
