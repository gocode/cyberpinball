# Revue sans opérateur du parcours « Ce qu'il manque pour jouer » : Terminator 2 installée
# sans sa ROM ; fiche, médecin et partie échouée mènent au parcours, qui trouve la ROM dans
# la vraie base VPS (copiée depuis D:\CyberPinball\downloads), ouvre sa page dans la fenêtre
# « Récupérer » (fausse fiche vpforums.org : aucune page des forums n'est chargée), voit
# arriver le fichier, le reprend depuis la liste d'attente, l'installe et propose « Jouer ».
# Captures en paysage et en portrait, relevé (resultat.txt) et contrôle de la mise en page
# dans tmp\demo-parcours\captures.
# -Accueil : l'image de la page du projet (README.md, README.fr.md),
# docs\images\<en|fr>\missing-to-play.webp : le même parcours sur les jeux inventés de la page
# (docs\demo-jeux.cjs), ROM et base VPS inventées (rien n'est lu dans D:\CyberPinball), en
# français et en anglais ; deux écrans de la borne côte à côte, la ROM absente puis « Jouer ».
# Captures dans tmp\demo-parcours-accueil\captures\<langue>.
# Le garde-fou de mise en page et le guet hors écran doivent rester muets, sinon le script échoue.
#   .\docs\demo-parcours.ps1 [-Accueil]
param([switch]$Accueil)
$ErrorActionPreference = 'Stop'
$wt = Split-Path $PSScriptRoot -Parent
. "$PSScriptRoot\hors-ecran.ps1"
# Tout le reste tourne sur un bureau Windows caché : rien ne peut apparaître sur les écrans du poste.
if (Enter-BureauCache $PSCommandPath $PSBoundParameters) { exit $LASTEXITCODE }
# La fenêtre « Récupérer » naît par createWindow : hors écran, écrans simulés.
Use-HorsEcran
$base = if ($Accueil) { "$wt\tmp\demo-parcours-accueil" } else { "$wt\tmp\demo-parcours" }
$captures = "$base\captures"
$arguments = @('docs\demo-parcours.cjs')
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

# Image de la page du projet : deux écrans de la borne (portrait), côte à côte, en WebP :
# le parcours à la ROM absente, puis prêt à jouer.
if ($Accueil) {
  $m = 28; $g = 20; $w = 720; $h = 1280
  foreach ($langue in @('en', 'fr')) {
    $c = "$captures\$langue"
    $layers = @()
    $x = $m
    # Captures numérotées dans l'ordre du parcours (« 04-parcours-rom-absente-borne.png ») : par leur nom.
    foreach ($shot in @('parcours-rom-absente-borne', 'parcours-pret-borne')) {
      $src = Get-ChildItem $c -Filter "*-$shot.png" | Select-Object -First 1
      if (-not $src) { throw "Capture absente : $c\*-$shot.png" }
      $layers += @{ src = $src.FullName; x = $x; y = $m; w = $w; h = $h; radius = 10; border = '#24504a' }
      $x += $w + $g
    }
    $out = "$wt\docs\images\$langue\missing-to-play.webp"
    $spec = "$base\planche-$langue.json"
    @{ out = $out; width = 2 * $w + $g + 2 * $m; height = $h + 2 * $m; background = '#030807'; quality = 0.84; layers = $layers } |
      ConvertTo-Json -Depth 6 | Set-Content $spec -Encoding UTF8
    Push-Location $wt
    try { npx electron docs\demo-captures.cjs --planche $spec 2>&1 | ForEach-Object { "   $_" } } finally { Pop-Location }
    if ($LASTEXITCODE -ne 0) { throw "Image impossible : $out" }
  }
}
"Captures : $captures"
