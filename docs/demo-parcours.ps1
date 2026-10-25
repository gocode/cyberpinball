# Revue sans opérateur du parcours « Ce qu'il manque pour jouer » : Terminator 2 installée
# sans sa ROM ; fiche, médecin et partie échouée mènent au parcours, qui trouve la ROM dans
# la vraie base VPS (copiée depuis D:\CyberPinball\downloads), ouvre sa page dans la fenêtre
# « Récupérer » (fausse fiche vpforums.org : aucune page des forums n'est chargée), voit
# arriver le fichier, le reprend depuis la liste d'attente, l'installe et propose « Jouer ».
# Captures en paysage et en portrait, relevé (resultat.txt) et contrôle de la mise en page
# dans tmp\demo-parcours\captures.
#   .\docs\demo-parcours.ps1
$ErrorActionPreference = 'Stop'
$wt = Split-Path $PSScriptRoot -Parent
. "$PSScriptRoot\hors-ecran.ps1"
# Tout le reste tourne sur un bureau Windows caché : rien ne peut apparaître sur les écrans du poste.
if (Enter-BureauCache $PSCommandPath $PSBoundParameters) { exit $LASTEXITCODE }
# La fenêtre « Récupérer » naît par createWindow : hors écran, écrans simulés.
Use-HorsEcran
$captures = "$wt\tmp\demo-parcours\captures"

Push-Location $wt
try {
  npm run build | Out-Null
  npx electron docs\demo-parcours.cjs 2>&1 | ForEach-Object { "   $_" }
  $code = $LASTEXITCODE
} finally { Pop-Location }

if ($code -ne 0) { throw "La démonstration a échoué : voir $captures\resultat.txt" }
"Captures : $captures"
