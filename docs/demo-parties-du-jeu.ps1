# Revue sans opérateur des parties d'un jeu : liste d'attente rangée seule (la borne du
# 27/10/2026), plan d'ajout ciblé, fiche > « Parties du jeu », Téléchargements > « Ajouter à
# un jeu », en paysage et portrait en français, couché en anglais.
# Captures, relevé (resultat.txt) et contrôle de la mise en page dans tmp\demo-parties-du-jeu\captures.
#   .\docs\demo-parties-du-jeu.ps1
$ErrorActionPreference = 'Stop'
$wt = Split-Path $PSScriptRoot -Parent
. "$PSScriptRoot\hors-ecran.ps1"
# Tout le reste tourne sur un bureau Windows caché : rien ne peut apparaître sur les écrans du poste.
if (Enter-BureauCache $PSCommandPath $PSBoundParameters) { exit $LASTEXITCODE }
Use-HorsEcran
$captures = "$wt\tmp\demo-parties-du-jeu\captures"

Push-Location $wt
try {
  npm run build | Out-Null
  npx electron docs\demo-parties-du-jeu.cjs 2>&1 | ForEach-Object { "   $_" }
  $code = $LASTEXITCODE
} finally { Pop-Location }

if ($code -ne 0) { throw "La démonstration a échoué : voir $captures\resultat.txt" }
"Captures : $captures"
