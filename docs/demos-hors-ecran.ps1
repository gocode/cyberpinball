# Toutes les démonstrations sans opérateur qui peuvent tourner hors écran, l'une après
# l'autre, en arrière-plan : rien n'apparaît sur les écrans du poste ni ne lui prend le
# focus (docs\hors-ecran.ps1). Sortie de chacune dans tmp\demos\<démo>.txt, bilan à la fin ;
# le script échoue si l'une d'elles échoue (mise en page, guet des fenêtres, vérifications).
#   .\docs\demos-hors-ecran.ps1 [-Demos zones, tables] [-Ecrans borne]
# Restent réservées aux écrans du poste ($env:CYBERPINBALL_A_L_ECRAN = '1') : demo-barre-taches,
# demo-fenetres (parties de VPX, captures du bureau entier), l'endurance.
param(
  [string[]]$Demos = @('boutons', 'medias', 'mise-en-page', 'plugins', 'pup', 'roms', 'tables', 'tilt', 'vps', 'zones'),
  [string]$Ecrans = 'pc-dev'
)
$ErrorActionPreference = 'Stop'
$wt = Split-Path $PSScriptRoot -Parent
. "$PSScriptRoot\hors-ecran.ps1"
if ($env:CYBERPINBALL_A_L_ECRAN -eq '1') { throw 'CYBERPINBALL_A_L_ECRAN=1 : ces démonstrations prendraient les écrans du poste. Retirer la variable pour les rejouer hors écran.' }
# Toute la série sur un bureau Windows caché (chaque démonstration s'y trouve déjà, sans relance).
if (Enter-BureauCache $PSCommandPath $PSBoundParameters) { exit $LASTEXITCODE }
$out = "$wt\tmp\demos"
New-Item -ItemType Directory -Force $out | Out-Null
$shell = (Get-Process -Id $PID).Path
Push-Location $wt
try { npm run build | Out-Null } finally { Pop-Location }

$results = foreach ($name in $Demos) {
  $script = $name -replace '-portrait$', ''
  $arguments = @('-NoProfile', '-File', "$PSScriptRoot\demo-$script.ps1")
  # medias : ses propres jeux d'écrans (borne type, poste à deux écrans).
  if ($script -ne 'medias') { $arguments += '-Ecrans', $Ecrans }
  if ($script -notin 'mise-en-page', 'zones', 'medias') { $arguments += '-Run' }
  $started = Get-Date
  Write-Host "== $name" -ForegroundColor Cyan
  # Une console à part par démonstration : leurs variables d'environnement ne se mêlent pas.
  & $shell @arguments *> "$out\$name.txt"
  $code = $LASTEXITCODE
  $seconds = [int]((Get-Date) - $started).TotalSeconds
  $text = Get-Content "$out\$name.txt" -Raw -Encoding UTF8
  # « Autopilote : aucun… » : une touche ou un clic rejoué n'a pas trouvé l'écran attendu (la
  # démonstration a tourné à vide, ses captures montrent un autre écran que celui annoncé).
  $ok = $code -eq 0 -and $text -notmatch 'ÉCHEC|Hors écran : fenêtre|Exception|Problèmes de mise en page|Autopilote : aucun'
  Write-Host ("   {0} en {1} s ({2})" -f $(if ($ok) { 'ok' } else { 'ÉCHEC' }), $seconds, "$out\$name.txt")
  [pscustomobject]@{ Demo = $name; Ok = $ok; Secondes = $seconds }
}
$results | Format-Table -AutoSize | Out-String | Write-Host
$failed = @($results | Where-Object { -not $_.Ok })
if ($failed.Count) { throw "Démonstrations en échec : $($failed.Demo -join ', ') (voir $out)." }
"Toutes les démonstrations hors écran ont réussi ($($results.Count))."
