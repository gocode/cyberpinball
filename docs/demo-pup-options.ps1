# Revue sans opérateur de l'écran « PuP-Pack » d'une fiche (options d'un PuP-Pack) : option
# du bureau en place et option conseillée, liste longue parcourue jusqu'en bas, option
# appliquée (réussite relue sur le disque), échec (fichier introuvable), choix pas net ; en
# paysage, couché (borne, menu tourné) et portrait, en français et en anglais. Pack témoin
# de Guardians of the Galaxy (gotg_2020), borne du modèle (-Cabinet).
# Captures, relevé (resultat.txt) et contrôle de la mise en page dans tmp\demo-pup-options\captures.
#   .\docs\demo-pup-options.ps1
param([string]$Cabinet = 'D:\CyberPinball\data\cabinet.json')
$ErrorActionPreference = 'Stop'
$wt = Split-Path $PSScriptRoot -Parent
. "$PSScriptRoot\hors-ecran.ps1"
# Tout le reste tourne sur un bureau Windows caché : rien ne peut apparaître sur les écrans du poste.
if (Enter-BureauCache $PSCommandPath $PSBoundParameters) { exit $LASTEXITCODE }
Use-HorsEcran
$captures = "$wt\tmp\demo-pup-options\captures"

Push-Location $wt
try {
  npm run build | Out-Null
  $env:CYBERPINBALL_MODELE_BORNE = $Cabinet
  npx electron docs\demo-pup-options.cjs 2>&1 | ForEach-Object { "   $_" }
  $code = $LASTEXITCODE
} finally { Pop-Location }

if ($code -ne 0) { throw "La démonstration a échoué : voir $captures\resultat.txt" }
"Captures : $captures"
