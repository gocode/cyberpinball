# Revue sans opérateur des propositions de chaque média et de la recherche approfondie,
# avec le vrai VPinMediaDB et la vraie base VPS (connexion à Internet nécessaire), dans
# un bac à sable (tmp\demo-propositions) : table renommée « GOTG_2.1.1 », titre
# traduit, nom d'origine et images rangées dans le .vpx, PuP-Pack avec screens.pup et
# triggers.pup. Plan automatique et ses raisons, propositions du fronton, de la
# musique, du plateau, des règles, du logo et de l'afficheur large, jeux retenus, recherche d'un
# titre au clavier, enregistrement et provenance. Écrans paysage 1920 × 1080 et
# portrait 1080 × 1920 ; le garde-fou layout-check.ts cherche les textes qui se
# chevauchent, sortent ou sont coupés. Captures, relevé (resultat.txt) et problèmes de
# mise en page dans tmp\demo-propositions\captures.
#   .\docs\demo-propositions.ps1
$ErrorActionPreference = 'Stop'
$wt = Split-Path $PSScriptRoot -Parent
. "$PSScriptRoot\hors-ecran.ps1"
# Tout le reste tourne sur un bureau Windows caché : rien ne peut apparaître sur les écrans du poste.
if (Enter-BureauCache $PSCommandPath $PSBoundParameters) { exit $LASTEXITCODE }
$captures = "$wt\tmp\demo-propositions\captures"

Push-Location $wt
try {
  npm run build | Out-Null
  npx electron docs\demo-propositions.cjs 2>&1 | ForEach-Object { "   $_" }
  $code = $LASTEXITCODE
} finally { Pop-Location }

if ($code -ne 0) { throw "La démonstration a échoué : voir $captures\resultat.txt" }
"Captures : $captures"
