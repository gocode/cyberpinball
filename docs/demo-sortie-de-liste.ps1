# Démonstration sans opérateur des listes de contenu à deux zones (packages\core\src\listzones.ts),
# hors écran sur un bureau Windows caché, avec des tables inventées (docs\demo-captures.cjs) :
# « Ajouter à un jeu » (liste de jeux triée par nom), « Médias du jeu », la galerie de choix d'un
# fichier et la bibliothèque d'un ami. Dans chacune : la liste dans son cadre et son repère, Exit
# ramène aux actions de l'écran, MagnaSave (puis F6) ramène à la même place de la liste, un second
# Exit quitte l'écran ; un flipper tenu reste dans la liste, saute de lettre en lettre (liste triée
# par nom) ou de trois en trois, et s'arrête au bout. Borne (playfield couché) et poste, français et
# anglais. Le garde-fou de mise en page (chevauchement, rognure, texte trop petit, liste de contenu
# sans repère) et le guet hors écran doivent rester muets. Aucun réseau, VPX n'est jamais lancé.
#   .\docs\demo-sortie-de-liste.ps1
# Captures, relevé (resultat.txt) et mise-en-page.txt dans tmp\demo-sortie-de-liste\captures.
$ErrorActionPreference = 'Stop'
$wt = Split-Path $PSScriptRoot -Parent
. "$PSScriptRoot\hors-ecran.ps1"
# Tout le reste tourne sur un bureau Windows caché : rien ne peut apparaître sur les écrans du poste.
if (Enter-BureauCache $PSCommandPath $PSBoundParameters) { exit $LASTEXITCODE }
Use-HorsEcran
$base = "$wt\tmp\demo-sortie-de-liste"
$captures = "$base\captures"
$root = "$base\root"
$electron = node -p "require('electron')"

Push-Location $wt
try { npm run build | Out-Null } finally { Pop-Location }

if (-not (Test-Path "$root\tables")) {
  '== tables inventées et leurs médias'
  Push-Location $wt
  try { & $electron docs\demo-captures.cjs $root 2>&1 | ForEach-Object { "   $_" } } finally { Pop-Location }
  if ($LASTEXITCODE -ne 0) { throw 'Génération des médias en échec.' }
}

# Un message de Chromium sur stderr (« GPU state invalid… ») n'arrête pas la démonstration.
Push-Location $wt
$ErrorActionPreference = 'Continue'
try {
  & $electron docs\demo-sortie-de-liste.cjs $root 2>&1 | ForEach-Object { "   $_" }
  $code = $LASTEXITCODE
} finally { $ErrorActionPreference = 'Stop'; Pop-Location }
if ($code -ne 0) { throw "La démonstration a échoué : voir $captures\resultat.txt" }
if ((Get-Content "$captures\mise-en-page.txt" -Raw -Encoding UTF8) -notmatch '^Aucun problème') { throw "Mise en page : voir $captures\mise-en-page.txt" }
"Captures : $captures"
