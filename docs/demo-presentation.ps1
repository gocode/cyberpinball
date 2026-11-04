# Images de présentation de Cyber Pinball, refaites d'un seul geste, hors écran, sur un bureau
# Windows caché (rien n'apparaît sur les écrans du poste) :
#   - le fronton de la marque, tel que la borne l'affiche par défaut (docs\demo-presentation.cjs) :
#     en tête de la page du projet, docs\images\<langue>\brand-backglass.webp ;
#   - la vie du groupe, pour la section « Jouer entre amis » : friends-notifications.webp (un ami
#     qui se connecte au menu, une invitation pendant une partie) et live-scores.webp (la bande des
#     scores sur le fronton, le DMD), composées à partir des bancs demo-notifications-partie et
#     demo-bande-partie (lancés s'il manque leurs captures) et des illustrations des tables fictives ;
#   - un dossier prêt à partager, docs\Design\presentation (document de travail, jamais publié) :
#     ce fronton en PNG 1920 × 1080, les frontons des tables fictives, et les images de la page du
#     projet en JPEG pour une messagerie (vitrine-fr, vitrine-en ; le lancement animé reste en WebP) ;
#   - l'adresse de chaque image de README.md et README.fr.md suit son contenu (?v=<empreinte>).
# docs\demo-captures.ps1 l'appelle à la fin de son étape « images ».
#   .\docs\demo-presentation.ps1
$ErrorActionPreference = 'Stop'
$wt = Split-Path $PSScriptRoot -Parent
. "$PSScriptRoot\hors-ecran.ps1"
if (Enter-BureauCache $PSCommandPath $PSBoundParameters) { exit $LASTEXITCODE }

$electron = node -p "require('electron')"
$tmp = "$wt\tmp\presentation"
$kit = "$wt\docs\Design\presentation"
New-Item -ItemType Directory -Force $tmp, $kit | Out-Null

function Invoke-Generateur([string[]]$Arguments) {
  Push-Location $wt
  try { & $electron docs\demo-presentation.cjs @Arguments 2>&1 | Where-Object { "$_" -match '^(Fronton|Image|.*impossible)' } | ForEach-Object { "   $_" } } finally { Pop-Location }
  if ($LASTEXITCODE -ne 0) { throw "Images de présentation en échec ($($Arguments[0]))." }
}

'== fronton de la marque'
$brand = "$kit\fronton-cyber-pinball.png"
Invoke-Generateur @($brand, '1920', '1080')

# Vie du groupe (section « Jouer entre amis ») : les vraies pages des notifications et de la bande
# des scores, rendues par leurs bancs hors écran, posées sur les illustrations des tables fictives.
$notifications = "$wt\tmp\captures\notifications-partie"
$bande = "$wt\tmp\captures\bande-partie"
if (-not (Test-Path "$notifications\fr\invitation-1120x344-0.png")) { & "$PSScriptRoot\demo-notifications-partie.ps1"; if (-not $?) { throw 'Notifications en échec.' } }
if (-not (Test-Path "$bande\fr\cards-872x260-0-2.png")) { & "$PSScriptRoot\demo-bande-partie.ps1"; if (-not $?) { throw 'Bande des scores en échec.' } }
$medias = "$PSScriptRoot\demo-captures-medias"
$edge = '#24504a'
function Write-Planche([string]$Out, [int]$Width, [int]$Height, [object[]]$Layers) {
  foreach ($layer in $Layers) { if (-not (Test-Path $layer.src)) { throw "Capture absente : $($layer.src)" } }
  $spec = "$tmp\planche.json"
  @{ out = $Out; width = $Width; height = $Height; background = '#030807'; quality = 0.86; layers = $Layers } | ConvertTo-Json -Depth 6 | Set-Content $spec -Encoding UTF8
  Push-Location $wt
  try { & $electron docs\demo-captures.cjs --planche $spec 2>&1 | ForEach-Object { "   $_" } } finally { Pop-Location }
  if ($LASTEXITCODE -ne 0) { throw "Image impossible : $Out" }
}
function Layer([string]$Src, [int]$X, [int]$Y, [int]$W, [int]$H, [int]$Radius = 10, [string]$Border = $edge) {
  $layer = @{ src = $Src; x = $X; y = $Y; w = $W; h = $H; radius = $Radius }
  if ($Border) { $layer.border = $Border }
  $layer
}
'== notifications et partie entre amis'
foreach ($langue in 'en', 'fr') {
  $n = "$notifications\$langue"; $b = "$bande\$langue"; $out = "$wt\docs\images\$langue"
  # Deux moments d'une partie, dans l'ordre : Bruno se connecte (Star Courier), puis il vous invite
  # (Neon Abyss) ; chaque fois en haut du plateau, par-dessus le jeu.
  $m = 28; $g = 20; $pw = 600; $ph = 900; $x2 = $m + $pw + $g
  Write-Planche "$out\friends-notifications.webp" ($x2 + $pw + $m) ($ph + 2 * $m) @(
    (Layer "$medias\star-courier-playfield.jpg" $m $m $pw $ph),
    (Layer "$n\en-partie-ami-connecte-1440x152-0.png" ($m + 30) ($m + 30) ($pw - 60) 57 8 ''),
    (Layer "$medias\neon-abyss-playfield.jpg" $x2 $m $pw $ph),
    (Layer "$n\invitation-1120x344-0.png" ($x2 + 30) ($m + 30) ($pw - 60) 166 14 '')
  )
  # Partie à deux : la bande des scores en bas du fronton (Atlas Rising), et le DMD aux moments calmes.
  Write-Planche "$out\live-scores.webp" (1200 + 2 * $m) (800 + 300 + $g + 2 * $m) @(
    (Layer "$medias\atlas-rising-backglass.jpg" $m $m 1200 800),
    (Layer "$b\cards-872x260-0-2.png" ($m + 339) ($m + 800 - 156 - 16) 523 156 10 ''),
    (Layer "$b\dmd-1920x480-0-2.png" $m ($m + 800 + $g) 1200 300)
  )
}

# Page du projet (WebP), puis le dossier à partager : vitrine en JPEG, frontons des tables.
$pairs = @()
foreach ($langue in 'en', 'fr') { $pairs += $brand, "$wt\docs\images\$langue\brand-backglass.webp" }
foreach ($langue in 'en', 'fr') {
  $dest = "$kit\vitrine-$langue"
  if (Test-Path $dest) { Remove-Item -Recurse -Force $dest }
  New-Item -ItemType Directory -Force $dest | Out-Null
  foreach ($image in Get-ChildItem "$wt\docs\images\$langue\*.webp") {
    # Le lancement est animé : une image fixe n'en garderait que la première vue.
    if ($image.BaseName -eq 'launch') { Copy-Item $image.FullName "$dest\launch.webp"; continue }
    if ($image.BaseName -eq 'brand-backglass') { continue }
    $pairs += $image.FullName, "$dest\$($image.BaseName).jpg"
  }
}
'== page du projet et vitrine en JPEG'
Invoke-Generateur (@('--convertir') + $pairs)

'== frontons des tables fictives'
$tables = "$kit\frontons-tables"
if (Test-Path $tables) { Remove-Item -Recurse -Force $tables }
New-Item -ItemType Directory -Force $tables | Out-Null
foreach ($file in Get-ChildItem "$PSScriptRoot\demo-captures-medias\*-backglass.*") {
  Copy-Item $file.FullName "$tables\$($file.Name -replace '-backglass', '')"
  "   $($file.Name -replace '-backglass', '')"
}

# Chaque image change d'adresse quand son contenu change (?v=<empreinte>) : un navigateur ou
# GitHub ne montre jamais l'ancienne image gardée en cache sous le même nom.
foreach ($pair in @(@('en', 'README.md'), @('fr', 'README.fr.md'))) {
  $readme = "$wt\$($pair[1])"
  $text = [IO.File]::ReadAllText($readme)
  $text = [regex]::Replace($text, "docs/images/$($pair[0])/([\w-]+)\.webp(\?v=[0-9a-f]+)?", {
      param($m)
      $file = "$wt\docs\images\$($pair[0])\$($m.Groups[1].Value).webp"
      $hash = (Get-FileHash $file -Algorithm SHA256).Hash.Substring(0, 10).ToLower()
      "docs/images/$($pair[0])/$($m.Groups[1].Value).webp?v=$hash"
    })
  [IO.File]::WriteAllText($readme, $text, [Text.UTF8Encoding]::new($false))
}
# Habillage de la chaîne YouTube (bannière, photo de profil), sur la même illustration.
& "$PSScriptRoot\demo-youtube.ps1"
if (-not $?) { throw 'Habillage YouTube en échec.' }
"Images de présentation dans $kit ; fronton de la page du projet dans docs\images\<langue>\brand-backglass.webp."
