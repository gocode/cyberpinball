# Essai sans opérateur du bloqueur de publicités du navigateur intégré (app/src/ad-blocker.ts) :
# régie, bannière et scriptlet sur une fausse page vidéo, forum des tables jamais filtré,
# réglage coupé, listes gardées sur disque, premier démarrage hors ligne. Faux sites et
# fausses listes seulement, servis en local. Profil Electron à part. Captures et relevé dans
# tmp\demo-publicites\captures.
#   .\docs\demo-publicites.ps1
$ErrorActionPreference = 'Stop'
$wt = Split-Path $PSScriptRoot -Parent
. "$PSScriptRoot\hors-ecran.ps1"
# Tout le reste tourne sur un bureau Windows caché : rien ne peut apparaître sur les écrans du poste.
if (Enter-BureauCache $PSCommandPath $PSBoundParameters) { exit $LASTEXITCODE }
Use-HorsEcran
$captures = "$wt\tmp\demo-publicites\captures"

Push-Location $wt
try {
  npm run build | Out-Null
  npx electron docs\demo-publicites.cjs 2>&1 | ForEach-Object { "   $_" }
  $code = $LASTEXITCODE
} finally { Pop-Location }

# Le relevé aussi : un essai qui s'arrête en route (Electron quitté) ne laisse pas toujours un code d'erreur.
$releve = "$captures\resultat.txt"
if ($code -ne 0 -or -not (Test-Path $releve) -or (Select-String -Path $releve -Pattern '^ÉCHEC' -Quiet)) { throw "L'essai a échoué : voir $releve" }
"Captures : $captures"
