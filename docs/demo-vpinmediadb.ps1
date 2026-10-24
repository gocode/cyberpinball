# Revue sans opérateur de « Chercher les médias » (T10, VPinMediaDB) avec le vrai dépôt :
# l'index, les aperçus et les fichiers viennent de GitHub (connexion à Internet
# nécessaire), rangés dans un bac à sable (tmp\demo-vpinmediadb). Gestionnaire d'un jeu
# (avertissement du premier usage, plan avec aperçus, remplacement d'un logo, vidéo ou
# image du plateau, progression, source sur la fiche du média), puis menu système
# (médias manquants de toutes les tables). Écrans paysage 1920 × 1080 et portrait
# 1080 × 1920 ; le garde-fou layout-check.ts cherche les textes qui se chevauchent,
# sortent ou sont coupés. Captures, relevé (resultat.txt) et problèmes de mise en page
# dans tmp\demo-vpinmediadb\captures.
#   .\docs\demo-vpinmediadb.ps1
$ErrorActionPreference = 'Stop'
$wt = Split-Path $PSScriptRoot -Parent
. "$PSScriptRoot\hors-ecran.ps1"
# Tout le reste tourne sur un bureau Windows caché : rien ne peut apparaître sur les écrans du poste.
if (Enter-BureauCache $PSCommandPath $PSBoundParameters) { exit $LASTEXITCODE }
$captures = "$wt\tmp\demo-vpinmediadb\captures"

Push-Location $wt
try {
  npm run build | Out-Null
  npx electron docs\demo-vpinmediadb.cjs 2>&1 | ForEach-Object { "   $_" }
  $code = $LASTEXITCODE
} finally { Pop-Location }

if ($code -ne 0) { throw "La démonstration a échoué : voir $captures\resultat.txt" }
"Captures : $captures"
