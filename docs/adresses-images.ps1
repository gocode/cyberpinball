# Adresse de chaque image des pages publiques suivant son contenu (?v=<empreinte>) : un navigateur
# ou GitHub ne montre jamais l'ancienne image gardée en cache sous le même nom. Pages traitées :
# README.md et README.fr.md (docs/images/<langue>/…), docs\features.md et docs\fonctionnalites.md
# (images/<langue>/…, sous-dossier features compris). Une image citée mais absente fait échouer.
# Appelé par docs\demo-presentation.ps1 (et donc par l'étape « images » de demo-captures.ps1) ;
# se lance aussi seul, sans rien afficher : .\docs\adresses-images.ps1
$ErrorActionPreference = 'Stop'
$wt = Split-Path $PSScriptRoot -Parent
$pages = @(
  @('en', 'README.md', 'docs/images'),
  @('fr', 'README.fr.md', 'docs/images'),
  @('en', 'docs\features.md', 'images'),
  @('fr', 'docs\fonctionnalites.md', 'images')
)
foreach ($page in $pages) {
  $file = "$wt\$($page[1])"
  if (-not (Test-Path $file)) { continue }
  $langue = $page[0]
  $prefix = [regex]::Escape("$($page[2])/$langue/")
  $text = [IO.File]::ReadAllText($file)
  $text = [regex]::Replace($text, "(?<!/)$prefix((?:features/)?[\w-]+)\.webp(\?v=[0-9a-f]+)?", {
      param($m)
      $image = "$wt\docs\images\$langue\$($m.Groups[1].Value -replace '/', '\').webp"
      if (-not (Test-Path $image)) { throw "$($page[1]) : image absente, $image" }
      $hash = (Get-FileHash $image -Algorithm SHA256).Hash.Substring(0, 10).ToLower()
      "$($page[2])/$langue/$($m.Groups[1].Value).webp?v=$hash"
    })
  [IO.File]::WriteAllText($file, $text, [Text.UTF8Encoding]::new($false))
}
"Adresses des images à jour : $(($pages | ForEach-Object { $_[1] }) -join ', ')."
