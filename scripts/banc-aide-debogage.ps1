# Banc de l'aide de débogage de core.vbs (scripts\banc-aide-debogage.mjs), sur le bureau caché.
#   powershell -File scripts\banc-aide-debogage.ps1 -Table <table à ROM.vpx> [-Vpx <dossier de VPX 10.8.1>] [-Ini <VPinballX.ini>] [-Secondes 25]
param(
  [Parameter(Mandatory = $true)][string]$Table,
  [string]$Vpx = 'D:\CyberPinball\emulators\vpx\10.8.1-5436',
  [string]$Ini = 'D:\CyberPinball\config\VPinballX.ini',
  [int]$Secondes = 25
)
. "$PSScriptRoot\bureau-cache.ps1"
if (Enter-BureauCache $PSCommandPath $PSBoundParameters) { exit $LASTEXITCODE }
Assert-Compile
node "$PSScriptRoot\banc-aide-debogage.mjs" --vpx $Vpx --table $Table --ini $Ini --secondes $Secondes
exit $LASTEXITCODE
