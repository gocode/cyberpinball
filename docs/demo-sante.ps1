# Revue sans opérateur de « Santé de la borne » (Menu système > Borne) : le bilan et ses
# lignes (espace disque, tables, médias, écrans, VPX), la pastille jusqu'à la roue dentée,
# chaque réparation ouverte puis le retour à la page, « Vérifier maintenant ». Bac à sable
# inventé (docs\demo-sante.cjs), écrans simulés de la borne (playfield 4K couché, mise en
# page tournée) et du PC de développement (1920 × 1080 et 1366 × 768), en français et en
# anglais. VPX n'est jamais lancé, rien n'est téléchargé.
# Captures, relevé (resultat.txt) et contrôle de la mise en page dans tmp\demo-sante\captures.
# -Accueil : l'image de la page du projet (README.md, README.fr.md), docs\images\<en|fr>\health.webp :
# les jeux inventés de la page (docs\demo-jeux.cjs, ceux de docs\demo-captures.cjs), la page sur
# l'écran de la borne, remise debout (720 × 1280). Captures dans tmp\demo-sante-accueil\captures.
# Le garde-fou de mise en page et le guet hors écran doivent rester muets, sinon le script échoue.
#   .\docs\demo-sante.ps1 [-Accueil]
param([switch]$Accueil)
$ErrorActionPreference = 'Stop'
$wt = Split-Path $PSScriptRoot -Parent
. "$PSScriptRoot\hors-ecran.ps1"
# Tout le reste tourne sur un bureau Windows caché : rien ne peut apparaître sur les écrans du poste.
if (Enter-BureauCache $PSCommandPath $PSBoundParameters) { exit $LASTEXITCODE }
Use-HorsEcran
$base = if ($Accueil) { "$wt\tmp\demo-sante-accueil" } else { "$wt\tmp\demo-sante" }
$captures = "$base\captures"
$arguments = @('docs\demo-sante.cjs')
if ($Accueil) { $arguments += '--accueil' }

Push-Location $wt
try {
  npm run build | Out-Null
  # Bilan du guet hors écran (hors-ecran.txt) dans le dossier des captures.
  $env:CYBERPINBALL_CAPTURE = $captures
  npx electron @arguments 2>&1 | ForEach-Object { "   $_" }
  $code = $LASTEXITCODE
} finally {
  Pop-Location
  Remove-Item Env:CYBERPINBALL_CAPTURE -ErrorAction SilentlyContinue
}

if ($code -ne 0) { throw "La démonstration a échoué : voir $captures\resultat.txt" }
Assert-HorsEcran $captures

# Image de la page du projet : la page relevée sur la borne (playfield couché, page tournée
# d'un quart de tour), remise debout, en WebP.
if ($Accueil) {
  foreach ($langue in @('en', 'fr')) {
    $out = "$wt\docs\images\$langue\health.webp"
    $spec = "$base\planche-$langue.json"
    @{ out = $out; width = 720; height = 1280; background = '#030807'; quality = 0.84; layers = @(@{ src = "$captures\borne-$langue\01-sante.png"; x = 0; y = 0; w = 720; h = 1280; turn = -1 }) } |
      ConvertTo-Json -Depth 6 | Set-Content $spec -Encoding UTF8
    Push-Location $wt
    try { npx electron docs\demo-captures.cjs --planche $spec 2>&1 | ForEach-Object { "   $_" } } finally { Pop-Location }
    if ($LASTEXITCODE -ne 0) { throw "Image impossible : $out" }
  }
}
"Captures : $captures"
