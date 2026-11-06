# Démonstration et essai hors écran de la télécommande du téléphone (docs\demo-telecommande.cjs) :
# le navigateur intégré sur une fausse page de connexion, un téléphone simulé (la vraie page du
# téléphone, hors écran) qui lit le QR code, est accepté par Start, pilote le pointeur, tape
# l'identifiant et le mot de passe, ouvre un lien par un appui long, revient en arrière, se
# déconnecte ; puis ce qui doit être refusé. Tout sur 127.0.0.1, jamais le vrai réseau ; rien à
# l'écran (bureau Windows caché). Captures et relevé dans tmp\demo-telecommande\captures.
#   .\docs\demo-telecommande.ps1
#   .\docs\demo-telecommande.ps1 -Vitrine   # et les images de « Toutes les fonctionnalités » (fr, en)
param([switch]$Vitrine)
$ErrorActionPreference = 'Stop'
$wt = Split-Path $PSScriptRoot -Parent
. "$PSScriptRoot\hors-ecran.ps1"
if (Enter-BureauCache $PSCommandPath $PSBoundParameters) { exit $LASTEXITCODE }
Use-HorsEcran
$captures = "$wt\tmp\demo-telecommande\captures"
$env:CYBERPINBALL_RESEAU = 'simule'

Push-Location $wt
try {
  npm run build | Out-Null
  $langues = if ($Vitrine) { @('fr', 'en') } else { @('fr') }
  foreach ($langue in $langues) {
    $env:CP_TELECOMMANDE_LANGUE = $langue
    $env:CP_TELECOMMANDE_OUT = if ($langue -eq 'fr') { $captures } else { "$wt\tmp\demo-telecommande\captures-$langue" }
    # Un profil Chromium par lancement. Les avertissements de Chromium sur la sortie d'erreur (cache
    # du lancement précédent encore tenu) ne sont pas des échecs : seul le code de sortie compte.
    $ErrorActionPreference = 'Continue'
    npx electron docs\demo-telecommande.cjs "--user-data-dir=$wt\tmp\demo-telecommande\chromium-$langue" 2>&1 | ForEach-Object { "   $_" }
    $code = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    if ($code -ne 0) { throw "La démonstration a échoué ($langue) : voir $env:CP_TELECOMMANDE_OUT\resultat.txt" }
    if ($Vitrine) {
      # La borne pilotée et le téléphone côte à côte, pour docs\fonctionnalites.md et docs\features.md.
      $electron = node -p "require('electron')"
      $spec = "$wt\tmp\demo-telecommande\planche-$langue.json"
      $edge = '#24504a'
      @{ out = "$wt\docs\images\$langue\features\telecommande.webp"; width = 1584; height = 723; background = '#030807'; quality = 0.86; layers = @(
          @{ src = "$env:CP_TELECOMMANDE_OUT\borne-4-mot-de-passe.png"; x = 24; y = 24; w = 1200; h = 675; radius = 10; border = $edge },
          @{ src = "$env:CP_TELECOMMANDE_OUT\telephone-3-identifiant.png"; x = 1248; y = 24; w = 312; h = 675; radius = 18; border = $edge }
        ) } | ConvertTo-Json -Depth 6 | Set-Content $spec -Encoding UTF8
      $ErrorActionPreference = 'Continue'
      & $electron docs\demo-captures.cjs --planche $spec "--user-data-dir=$wt\tmp\demo-telecommande\chromium-planche" 2>&1 | ForEach-Object { "   $_" }
      $code = $LASTEXITCODE
      $ErrorActionPreference = 'Stop'
      if ($code -ne 0) { throw "Image impossible : telecommande.webp ($langue)" }
    }
  }
  if ($Vitrine) { & "$PSScriptRoot\adresses-images.ps1" }
} finally { Pop-Location }

"Captures : $captures"
