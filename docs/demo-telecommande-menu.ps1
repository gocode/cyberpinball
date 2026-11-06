# Démonstration et essai hors écran de la télécommande du téléphone dans tout le menu
# (docs\demo-telecommande-menu.cjs) : l'écran Menu système > Borne > Télécommande du téléphone et
# son QR code, un téléphone simulé (la vraie page du téléphone, hors écran) accepté par Start, qui
# tient les boutons de la borne, tape à la place du clavier à l'écran et envoie un fichier dans le
# dossier d'import ; puis ce qui doit être refusé, une partie, le navigateur intégré, l'inactivité,
# Déconnecter, la fermeture. Tout sur 127.0.0.1, jamais le vrai réseau ; rien à l'écran (bureau
# Windows caché). Captures et relevé dans tmp\demo-telecommande-menu\captures.
#   .\docs\demo-telecommande-menu.ps1
#   .\docs\demo-telecommande-menu.ps1 -Langue en
param([ValidateSet('fr', 'en')][string]$Langue = 'fr')
$ErrorActionPreference = 'Stop'
$wt = Split-Path $PSScriptRoot -Parent
. "$PSScriptRoot\hors-ecran.ps1"
if (Enter-BureauCache $PSCommandPath $PSBoundParameters) { exit $LASTEXITCODE }
Use-HorsEcran
$captures = if ($Langue -eq 'fr') { "$wt\tmp\demo-telecommande-menu\captures" } else { "$wt\tmp\demo-telecommande-menu\captures-$Langue" }
$env:CYBERPINBALL_RESEAU = 'simule'
$env:CP_TELECOMMANDE_LANGUE = $Langue
$env:CP_TELECOMMANDE_OUT = $captures

Push-Location $wt
try {
  npm run build | Out-Null
  # Les avertissements de Chromium sur la sortie d'erreur ne sont pas des échecs : seul le code de sortie compte.
  $ErrorActionPreference = 'Continue'
  npx electron docs\demo-telecommande-menu.cjs "--user-data-dir=$wt\tmp\demo-telecommande-menu\chromium-$Langue" 2>&1 | ForEach-Object { "   $_" }
  $code = $LASTEXITCODE
  $ErrorActionPreference = 'Stop'
} finally { Pop-Location }

if ($code -ne 0) { throw "La démonstration a échoué : voir $captures\resultat.txt" }
"Captures : $captures"
