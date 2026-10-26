# Revue sans opérateur de la recherche libre d'un média (« Chercher moi-même sur le web… ») :
# la fenêtre « Récupérer » sur une recherche préremplie que le bandeau laisse changer, une
# page vidéo (YouTube imité, puis une vidéo lue directement), un téléchargement en cours,
# puis chaque écran « Reçu » : son à extraire en WAV et à découper, logo JPEG à convertir en
# PNG, page web sauvée en .mp3 (refusée), pack de plusieurs fichiers, fichier arrivé dans
# Téléchargements de Windows ; chaque affectation écrite aussitôt. Faux sites seulement :
# rien n'est téléchargé sur un vrai site. Profil Electron à part. Captures et relevé dans
# tmp\demo-recherche-libre\captures.
#   .\docs\demo-recherche-libre.ps1
$ErrorActionPreference = 'Stop'
$wt = Split-Path $PSScriptRoot -Parent
. "$PSScriptRoot\hors-ecran.ps1"
# Tout le reste tourne sur un bureau Windows caché : rien ne peut apparaître sur les écrans du poste.
if (Enter-BureauCache $PSCommandPath $PSBoundParameters) { exit $LASTEXITCODE }
# La fenêtre « Récupérer » naît par createWindow : hors écran, écrans simulés.
Use-HorsEcran
$captures = "$wt\tmp\demo-recherche-libre\captures"

Push-Location $wt
try {
  npm run build | Out-Null
  npx electron docs\demo-recherche-libre.cjs 2>&1 | ForEach-Object { "   $_" }
  $code = $LASTEXITCODE
} finally { Pop-Location }

if ($code -ne 0) { throw "La démonstration a échoué : voir $captures\resultat.txt" }
"Captures : $captures"
