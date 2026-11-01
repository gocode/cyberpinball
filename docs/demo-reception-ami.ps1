# Démonstration sans opérateur de la récupération d'une table chez un ami (app\src\friend-library-menu.ts),
# hors écran sur un bureau Windows caché, aux boutons seulement : l'écran des parties ouvert dans la
# liste, « Cochée » ou « Non cochée », la ROM par Start et l'attestation ; la réception lancée une fois,
# visible sur la fiche de la table et dans la bibliothèque de l'ami, Start qui y mène sans la relancer,
# l'ami qui se déconnecte puis revient, la table reçue. Tables inventées, ami et fichiers simulés :
# aucun réseau, VPX n'est jamais lancé. Borne (playfield couché) et poste, français et anglais. Le
# garde-fou de mise en page (chevauchement, rognure, texte trop petit) doit rester muet.
#   .\docs\demo-reception-ami.ps1
# Captures, relevé (resultat.txt) et mise-en-page.txt dans tmp\demo-reception-ami\captures.
$ErrorActionPreference = 'Stop'
$wt = Split-Path $PSScriptRoot -Parent
. "$PSScriptRoot\hors-ecran.ps1"
# Tout le reste tourne sur un bureau Windows caché : rien ne peut apparaître sur les écrans du poste.
if (Enter-BureauCache $PSCommandPath $PSBoundParameters) { exit $LASTEXITCODE }
Use-HorsEcran
$captures = "$wt\tmp\demo-reception-ami\captures"
$electron = node -p "require('electron')"

Push-Location $wt
try { npm run build | Out-Null } finally { Pop-Location }

# Un message de Chromium sur stderr (« GPU state invalid… ») n'arrête pas la démonstration.
Push-Location $wt
$ErrorActionPreference = 'Continue'
try {
  & $electron docs\demo-reception-ami.cjs 2>&1 | ForEach-Object { "   $_" }
  $code = $LASTEXITCODE
} finally { $ErrorActionPreference = 'Stop'; Pop-Location }
if ($code -ne 0) { throw "La démonstration a échoué : voir $captures\resultat.txt" }
if ((Get-Content "$captures\mise-en-page.txt" -Raw -Encoding UTF8) -notmatch '^Aucun problème') { throw "Mise en page : voir $captures\mise-en-page.txt" }
"Captures : $captures"
