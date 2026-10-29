# Démonstration sans opérateur du gardien des barres des tâches (signalement du 29/10/2026 : par
# moments, au retour d'une partie, la barre des tâches de Windows restait devant le DMD, parfois
# devant le playfield). Aucune fenêtre n'est ouverte et aucune vraie barre des tâches n'est
# touchée : la borne (playfield 4K, fronton, DMD) tourne sur un Windows simulé dont l'Explorateur
# suit sa règle pour ses barres (packages\core\src\test\simulated-explorer.ts) :
#   avant   : le retour d'une partie d'avant le correctif ; le fronton et le DMD gardent leur barre devant ;
#   apres   : dix parties avec le retour d'aujourd'hui (barres rangées sous le menu avant d'être réaffichées) ;
#   filet   : l'ancien retour, rattrapé par le seul gardien des barres ;
#   zone    : zone de travail changée, les barres repassent devant puis derrière ;
#   vpx     : VPX au premier plan, le gardien ne touche à rien ;
#   tenace  : l'Explorateur remet chaque barre devant aussitôt, elle finit masquée.
# Chaque scénario écrit le journal des écrans tel que la borne l'écrit (<données>\logs\ecrans.txt).
#   .\docs\demo-barre-dessus.ps1 [-Scenarios avant, apres, filet, zone, vpx, tenace]
# Journaux dans tmp\demo-barre-dessus\<scénario>\ecrans.txt.
param(
  [string[]]$Scenarios = @('avant', 'apres', 'filet', 'zone', 'vpx', 'tenace')
)
$ErrorActionPreference = 'Stop'
$wt = Split-Path $PSScriptRoot -Parent
. "$PSScriptRoot\hors-ecran.ps1"
# Rien n'ouvre de fenêtre, mais tout tourne quand même sur un bureau Windows caché.
if (Enter-BureauCache $PSCommandPath $PSBoundParameters) { exit $LASTEXITCODE }
$base = "$wt\tmp\demo-barre-dessus"

Push-Location $wt
try {
  npm run build | Out-Null
  node docs\demo-barre-dessus.cjs $base @Scenarios
  $code = $LASTEXITCODE
} finally { Pop-Location }
if ($code -ne 0) { throw 'Un scénario du gardien des barres ne finit pas comme prévu.' }
'Tous les scénarios finissent comme prévu.'
