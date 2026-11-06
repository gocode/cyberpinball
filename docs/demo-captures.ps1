# Captures d'écran de la page du projet (README.md en anglais, README.fr.md en français),
# rangées dans docs\images. Tout est fabriqué ici, hors écran, sur un bureau Windows caché :
# des tables inventées (docs\demo-jeux.cjs) et leurs médias, illustrés ou dessinés par
# docs\demo-captures.cjs (aucune œuvre de tiers, aucun nom de jeu réel), une borne simulée
# (docs\ecrans\borne.json : playfield 4K couché, fronton, DMD, topper) et son modèle
# (docs\demo-medias.cjs modele), une version suivante annoncée par un site local, au flux signé
# par une clé d'essai.
# Étapes, pour chaque langue :
#   menu     : le menu des tables sur les quatre écrans, la fiche d'un jeu, le menu système,
#              « Mise à jour de Cyber Pinball » avec une version disponible ;
#   fiche    : « Médias du jeu » de Neon Abyss sur la borne ;
#   bureau   : le menu des tables sur un PC de bureau à deux écrans (plateau dans son cadre 9:16) ;
#   assistant: l'étape « Écrans et rôles » sur les quatre écrans ;
#   reglages : l'écran des réglages de VPX ;
#   fonctions: un écran par fonction de la page « Toutes les fonctionnalités » (docs\features.md,
#              docs\fonctionnalites.md), chacun dans sa propre ouverture (liste $Fonctions) ;
# puis, une fois pour les deux langues :
#   demonstrations : les démonstrations des autres fonctions, en mode accueil (-Accueil) : lancement
#              cinématique, DMD vivant, santé de la borne, « Ce qu'il manque pour jouer », amis ;
#   images   : assemblage et remise à l'endroit (playfield couché) dans docs\images, en WebP,
#              puis docs\demo-presentation.ps1 (fronton de la marque, dossier à partager) ;
#   images-fonctions : les écrans de l'étape fonctions, remis debout, dans docs\images\<langue>\features
#              (compris dans images) ; une capture que le garde-fou refuse n'est pas reprise.
# Le garde-fou de mise en page et le guet hors écran doivent rester muets, sinon le script échoue.
#   .\docs\demo-captures.ps1 [-Langues en, fr] [-Etapes medias, menu, fiche, bureau, assistant, reglages, fonctions, demonstrations, images, images-fonctions] [-Seulement doctor, tilt]
# Ni le vrai modèle de borne ni le vrai VPinballX.ini ne sont lus ni touchés ; VPX n'est jamais lancé.
param(
  [string[]]$Langues = @('en', 'fr'),
  [string[]]$Etapes = @('medias', 'menu', 'fiche', 'bureau', 'assistant', 'reglages', 'fonctions', 'demonstrations', 'images'),
  [int]$Port = 8766,
  # Étapes fonctions et images-fonctions : seulement ces écrans (noms de la liste des fonctions, plus bas), pour en refaire un.
  [string[]]$Seulement = @()
)
# Écrans de la page « Toutes les fonctionnalités » : nom de l'image, départ, puis les étapes.
#   S : menu système (Exit depuis la roue), F : fiche de Neon Abyss (Start quatre tables plus loin),
#       suivis des actions nommées en français (la clé du catalogue de textes) ; un libellé à
#       virgule s'écrit par sa fin (« son et attente »), les étapes étant séparées par des virgules,
#       et ce bout de libellé, qui n'est pas une clé du catalogue, a sa traduction dans $Bouts.
#   W : une étape de l'assistant ouverte seule, par son drapeau (packages/core/src/wizardsteps.ts),
#       image prise sur l'écran 1, le playfield, tourné pour le joueur comme les menus.
# Chacun part d'une ouverture neuve : une action introuvable ne gâte que son image. Écartés de la
# page : les écrans vides ou que le bac à sable trahit (téléchargements, bibliothèque de ROM, partage
# et réseau, trouver un joueur : réseau coupé ; lanceur : aucun joystick), et « Réglages de cette
# table », qui s'ouvre dans une autre fenêtre.
$Bouts = @{ 'son et attente' = @{ en = 'sound and attract mode' } }
$Fonctions = @(
  # M : depuis la roue ; MagnaSave droit (Ctrl droit) passe à la collection suivante, sa liste paraît 4 s :
  # l'appui juste avant la capture. Neon Abyss d'abord (quatre tables plus loin), la plus récente :
  # de Toutes à Récentes (Favoris, vide, est sauté), la même table et les mêmes sept tables, rien ne fond.
  @('collections', 'M', @('ShiftRight', 'ShiftRight', 'ShiftRight', 'ShiftRight', 'wait:2500', 'ControlRight')),
  @('all-tables', 'S', @('action:Toutes les tables')),
  @('add-table', 'S', @('action:Ajouter une table')),
  @('menu-settings', 'S', @('action:son et attente')),
  @('startup-show', 'S', @('action:son et attente', 'wait:800', 'action:Ouverture au démarrage')),
  @('arcade-hours', 'S', @('action:son et attente', 'wait:800', 'action:Horaire de la borne')),
  @('dmd-colour', 'S', @('action:son et attente', 'wait:800', 'action:Couleur du DMD')),
  @('friends-section', 'S', @('action:Amis')),
  @('live-scores-setting', 'S', @('action:Scores des amis pendant la partie')),
  @('badges', 'S', @('action:Mes badges')),
  @('cabinet-setup', 'S', @('action:Configuration de la borne')),
  @('dmd-screen', 'S', @('action:Configuration de la borne', 'wait:800', 'action:Écran du DMD')),
  @('configurations', 'S', @('action:Configuration de la borne', 'wait:800', 'action:Configurations de la borne')),
  @('controls', 'S', @('action:Commandes de la borne')),
  @('guest-mode', 'S', @('action:Mode invité')),
  @('dedicated', 'S', @('action:Borne dédiée')),
  @('language', 'S', @('action:Langue / Language')),
  @('doctor', 'F', @('action:Diagnostiquer et réparer')),
  @('game-parts', 'F', @('action:Parties du jeu')),
  @('flyer', 'F', @('action:Prospectus')),
  @('favorites', 'F', @('action:Ajouter aux favoris')),
  @('buttons', 'W', @('--boutons')),
  @('interface-buttons', 'W', @('--interface')),
  @('tilt', 'W', @('--tilt')),
  @('playfield', 'W', @('--playfield')),
  @('screen-layout', 'W', @('--disposition')),
  @('sound', 'W', @('--son'))
)
$ErrorActionPreference = 'Stop'
$wt = Split-Path $PSScriptRoot -Parent
. "$PSScriptRoot\hors-ecran.ps1"
# Tout le reste tourne sur un bureau Windows caché : rien ne peut apparaître sur les écrans du poste.
if (Enter-BureauCache $PSCommandPath $PSBoundParameters) { exit $LASTEXITCODE }
Use-HorsEcran 'borne'
$base = "$wt\tmp\demo-captures"
# Nommée comme une vraie racine de borne : certains écrans montrent son chemin (étape fonctions).
$root = "$base\CyberPinball"
$electron = node -p "require('electron')"
$failures = @()

Push-Location $wt
try { npm run build | Out-Null } finally { Pop-Location }

if ($Etapes -contains 'medias') {
  '== tables inventées et leurs médias'
  Push-Location $wt
  try { & $electron docs\demo-captures.cjs $root 2>&1 | ForEach-Object { "   $_" } } finally { Pop-Location }
  if ($LASTEXITCODE -ne 0) { throw 'Génération des médias en échec.' }
}

# Version suivante, annoncée par un flux signé avec une clé d'essai (CYBERPINBALL_MAJ_CLE, acceptée
# dans un bac à sable seulement) ; l'installeur n'est jamais téléchargé.
$site = "$base\site"
if (Test-Path $site) { Remove-Item -Recurse -Force $site }
New-Item -ItemType Directory -Force $site | Out-Null
$feed = @'
const [core, dir, current] = process.argv.slice(1);
const c = require(core);
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
fs.writeFileSync(path.join(dir, 'cle.pem'), publicKey.export({ type: 'spki', format: 'pem' }));
// Version suivante de la version stable (0.1.4-essai.22 → 0.2.0) : une préversion n'est jamais annoncée.
const v = current.replace(/[-+].*$/, '').split('.'); v[1] = String(Number(v[1]) + 1); v[2] = '0';
const manifest = {
  version: v.join('.'),
  date: '2026-11-02T10:00:00.000Z',
  notes: [
    'Interface en anglais ou en français : menu système > « Langue / Language ».',
    'Mode attente : une table au hasard toutes les quelques secondes, avec sa musique.',
    'Médecin des tables : ROM voisine proposée quand la version demandée manque.',
  ],
  notesByLanguage: {
    en: [
      'English or French interface: system menu > “Language / Langue”.',
      'Attract mode: a random table every few seconds, with its music.',
      'Table doctor: a neighbouring ROM is offered when the requested version is missing.',
    ],
  },
  // Taille d'un vrai installeur léger ; il n'est jamais téléchargé (lancé depuis les sources, la borne ne s'installe pas).
  installer: { name: 'CyberPinball-Setup.exe', url: 'http://127.0.0.1/CyberPinball-Setup.exe', size: 115_343_360, sha256: crypto.createHash('sha256').update('installeur fictif').digest('hex') },
};
fs.writeFileSync(path.join(dir, 'cyberpinball-maj.json'), JSON.stringify(c.signManifest(manifest, privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()), null, 2));
console.log(manifest.version);
'@
$version = (Get-Content "$wt\package.json" -Raw | ConvertFrom-Json).version
$next = node -e $feed "$wt\packages\core\dist\index.js" $site $version
if ($LASTEXITCODE -ne 0) { throw 'Flux de mise à jour d''essai impossible.' }
$journal = "$base\site.txt"; Remove-Item $journal -ErrorAction SilentlyContinue
$serveur = Start-Process node -ArgumentList "`"$PSScriptRoot\demo-mise-a-jour-serveur.cjs`"", "`"$site`"", $Port, "`"$journal`"" -NoNewWindow -PassThru

# Un passage de l'application : bac à sable, langue, touches rejouées, captures ; vérifie le guet
# hors écran et le garde-fou de mise en page.
function Invoke-Capture([string]$Langue, [string]$Nom, [string[]]$Touches, [string[]]$Arguments) {
  $env:CYBERPINBALL_LANGUE = $Langue
  $env:CYBERPINBALL_AUTOPILOT = $Touches -join ','
  $env:CYBERPINBALL_CAPTURE = "$base\$Langue\captures\$Nom"
  if (Test-Path $env:CYBERPINBALL_CAPTURE) { Remove-Item -Recurse -Force $env:CYBERPINBALL_CAPTURE }
  Push-Location $wt
  try { $log = & $electron app @Arguments 2>&1 | ForEach-Object { "$_" } } finally { Pop-Location }
  New-Item -ItemType Directory -Force $env:CYBERPINBALL_CAPTURE | Out-Null
  Set-Content "$env:CYBERPINBALL_CAPTURE\journal.txt" $log -Encoding UTF8
  $log | Where-Object { $_ -match '^(Autopilote|Mise en page|Traduction manquante|Hors écran)' } | ForEach-Object { Write-Host "   $_" }
  if ($log -match 'Autopilote : aucun') { $script:failures += "$Langue/$Nom : une action rejouée n'a pas trouvé son écran" }
  if ($log -match 'Traduction manquante') { $script:failures += "$Langue/$Nom : texte sans traduction" }
  Assert-HorsEcran $env:CYBERPINBALL_CAPTURE
  $report = "$env:CYBERPINBALL_CAPTURE\mise-en-page.txt"
  if (-not (Test-Path $report)) { $script:failures += "$Langue/$Nom : relevé de mise en page absent" }
  elseif ((Get-Content $report -Raw -Encoding UTF8) -notmatch '^Aucun problème') { $script:failures += "$Langue/$Nom : mise en page, voir $report" }
}

try {
  foreach ($langue in $Langues) {
    "== $langue"
    # « Ajouter aux favoris » (étape fonctions) écrit dans le .info d'une table de la racine partagée :
    # chaque langue repart sans favori, et aucune autre capture ne montre l'étoile par hasard.
    foreach ($info in Get-ChildItem "$root\tables" -Recurse -Filter *.info -ErrorAction SilentlyContinue) {
      $json = Get-Content $info.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
      if ($json.User -and $json.User.PSObject.Properties['Favorite']) {
        $json.User.PSObject.Properties.Remove('Favorite')
        [IO.File]::WriteAllText($info.FullName, ($json | ConvertTo-Json -Depth 8), [Text.UTF8Encoding]::new($false))
      }
    }
    $home_ = "$base\$langue\home"
    # Bac à sable neuf ; les captures des étapes non rejouées restent pour l'assemblage.
    if (Test-Path $home_) { Remove-Item -Recurse -Force $home_ }
    New-Item -ItemType Directory -Force "$home_\sandbox" | Out-Null
    Set-Content "$home_\sandbox\VPinballX.ini" '' -Encoding UTF8
    node "$PSScriptRoot\demo-medias.cjs" modele "$PSScriptRoot\ecrans\borne.json" "$home_\cabinet.json" "$home_\sandbox\VPinballX.ini" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Modèle de borne des écrans simulés impossible.' }
    $env:CYBERPINBALL_HOME = $home_
    $env:CYBERPINBALL_ROOT = $root
    $env:CYBERPINBALL_MAJ_URL = "http://127.0.0.1:$Port/cyberpinball-maj.json"
    $env:CYBERPINBALL_MAJ_CLE = "$site\cle.pem"
    # Lancé depuis les sources, mais montré comme sur une borne installée : « Update now ».
    $env:CYBERPINBALL_MAJ_INSTALLEE = '1'

    if ($Etapes -contains 'menu') {
      # VPX n'est pas installé : Exit (plus tard) ; quatre tables plus loin, « Neon Abyss ».
      Invoke-Capture $langue 'menu' @(
        'Escape', 'ShiftRight', 'ShiftRight', 'ShiftRight', 'ShiftRight', 'wait:2500',
        'Digit1', 'wait:1500', 'Escape', 'Escape', 'wait:800',
        'action:Mise à jour de Cyber Pinball', 'wait:2500'
      ) @()
    }
    if ($Etapes -contains 'fiche') {
      # « Médias du jeu » de Neon Abyss : chaque média de la table, tel que le menu le montre.
      Invoke-Capture $langue 'fiche' @(
        'Escape', 'ShiftRight', 'ShiftRight', 'ShiftRight', 'ShiftRight', 'wait:2000',
        'Digit1', 'wait:1200', 'action:Médias du jeu', 'wait:3000'
      ) @()
    }
    if ($Etapes -contains 'bureau') {
      # Le même menu sur un PC de bureau à deux écrans (docs\ecrans\poste-deux-ecrans.json) : le
      # plateau dans son cadre 9:16, la roue et les informations à côté, le fronton sur le second écran.
      $homeBureau = "$base\$langue\home-bureau"
      if (Test-Path $homeBureau) { Remove-Item -Recurse -Force $homeBureau }
      New-Item -ItemType Directory -Force "$homeBureau\sandbox" | Out-Null
      Set-Content "$homeBureau\sandbox\VPinballX.ini" '' -Encoding UTF8
      node "$PSScriptRoot\demo-medias.cjs" modele "$PSScriptRoot\ecrans\poste-deux-ecrans.json" "$homeBureau\cabinet.json" "$homeBureau\sandbox\VPinballX.ini" | Out-Null
      if ($LASTEXITCODE -ne 0) { throw 'Modèle du poste à deux écrans impossible.' }
      Use-HorsEcran 'poste-deux-ecrans'
      $env:CYBERPINBALL_HOME = $homeBureau
      try {
        Invoke-Capture $langue 'bureau' @(
          'Escape', 'ShiftRight', 'ShiftRight', 'ShiftRight', 'ShiftRight', 'wait:2500',
          'Digit1', 'wait:1500'
        ) @()
      } finally {
        Use-HorsEcran 'borne'
        $env:CYBERPINBALL_HOME = $home_
      }
    }
    if ($Etapes -contains 'assistant') {
      Invoke-Capture $langue 'assistant' @('wait:1500') @('--assistant', '--ecrans')
    }
    if ($Etapes -contains 'fonctions') {
      # VPX n'est pas installé : Exit (plus tard). Menu système : Exit depuis la roue. Fiche : Start
      # sur Neon Abyss, quatre tables plus loin. Un écran que le garde-fou refuse est noté à part
      # (fonctions-ecartees.txt) : l'assemblage ne le reprend pas, les autres continuent.
      $ecartees = @()
      # La racine montrée par « Ajouter une table » (dossier d'import) et d'autres écrans : un
      # lecteur court (subst), « P:\CyberPinball », plutôt que le chemin du dépôt sur ce poste.
      $lecteur = @('P:', 'Q:', 'R:', 'S:', 'T:', 'U:', 'V:', 'W:') | Where-Object { -not (Test-Path "$_\") } | Select-Object -First 1
      subst $lecteur $base
      $env:CYBERPINBALL_ROOT = "$lecteur\CyberPinball"
      try {
      foreach ($f in $Fonctions) {
        if ($Seulement.Count -and $Seulement -notcontains $f[0]) { continue }
        $avant = $script:failures.Count
        # Une ouverture qui échoue (guet sans bilan, application arrêtée) écarte son écran seulement.
        try {
          if ($f[1] -eq 'W') { Invoke-Capture $langue "fonctions\$($f[0])" @('wait:2500') $f[2] }
          else {
            $depart = if ($f[1] -eq 'S') { @('Escape', 'wait:600', 'Escape', 'wait:800') } elseif ($f[1] -eq 'M') { @('Escape', 'wait:1500') } else { @('Escape', 'ShiftRight', 'ShiftRight', 'ShiftRight', 'ShiftRight', 'wait:2000', 'Digit1', 'wait:1200') }
            $sequence = $f[2] | ForEach-Object { $b = $Bouts[$_ -replace '^action:', '']; if ($b -and $b[$langue]) { "action:$($b[$langue])" } else { $_ } }
            # La liste des collections (M) s'efface 4 s après le dernier MagnaSave : capturée aussitôt.
            $fin = if ($f[1] -eq 'M') { @() } else { @('wait:2500') }
            Invoke-Capture $langue "fonctions\$($f[0])" ($depart + $sequence + $fin) @()
          }
        } catch { $script:failures += "$langue/fonctions\$($f[0]) : $($_.Exception.Message) (journal.txt de l'écran)" }
        # Toujours des listes : un seul écart ne doit pas devenir une chaîne qu'on découperait en lettres.
        $nouveaux = @($script:failures | Select-Object -Skip $avant)
        if ($nouveaux.Count) {
          $ecartees = @($ecartees) + $nouveaux
          $script:failures = @($script:failures | Select-Object -First $avant)
        }
      }
      } finally {
        subst $lecteur /D
        $env:CYBERPINBALL_ROOT = $root
      }
      New-Item -ItemType Directory -Force "$base\$langue\captures\fonctions" | Out-Null
      Set-Content "$base\$langue\captures\fonctions\fonctions-ecartees.txt" ($ecartees -join "`n") -Encoding UTF8
      if ($ecartees.Count) { "   Écrans écartés ($($ecartees.Count)) :"; $ecartees | ForEach-Object { "     $_" } }
    }
    if ($Etapes -contains 'reglages') {
      # L'écran affiche le chemin de VPinballX.ini : celui d'une racine de borne courte (lecteur
      # subst sur le bac à sable, lu seulement), plutôt que celui du dossier du dépôt.
      $drive = @('P:', 'Q:', 'R:', 'S:', 'T:', 'U:', 'V:', 'W:') | Where-Object { -not (Test-Path "$_\") } | Select-Object -First 1
      New-Item -ItemType Directory -Force "$home_\borne\config" | Out-Null
      Copy-Item "$home_\sandbox\VPinballX.ini" "$home_\borne\config\VPinballX.ini"
      subst $drive "$home_\borne"
      $env:CYBERPINBALL_VPX_INI = "$drive\config\VPinballX.ini"
      try { Invoke-Capture $langue 'reglages' @('ArrowDown') @('--reglages') }
      finally {
        subst $drive /D
        Remove-Item Env:CYBERPINBALL_VPX_INI -ErrorAction SilentlyContinue
      }
    }
  }
} finally {
  Stop-Process -Id $serveur.Id -Force -ErrorAction SilentlyContinue
  Remove-Item Env:CYBERPINBALL_LANGUE, Env:CYBERPINBALL_AUTOPILOT, Env:CYBERPINBALL_CAPTURE, Env:CYBERPINBALL_HOME, Env:CYBERPINBALL_ROOT, Env:CYBERPINBALL_MAJ_URL, Env:CYBERPINBALL_MAJ_CLE, Env:CYBERPINBALL_MAJ_INSTALLEE -ErrorAction SilentlyContinue
}

if ($failures.Count) { throw "Captures en échec :`n  $($failures -join "`n  ")" }

# Les autres images de la page viennent des démonstrations de leur fonction, en mode accueil (les
# mêmes jeux inventés, docs\demo-jeux.cjs) : chacune écrit les siennes dans docs\images\<langue>.
if ($Etapes -contains 'demonstrations') {
  foreach ($demo in 'demo-cinema', 'demo-dmd-vivant', 'demo-sante', 'demo-parcours', 'demo-amis') {
    "== $demo -Accueil"
    & "$PSScriptRoot\$demo.ps1" -Accueil
    if (-not $?) { throw "Démonstration en échec : $demo -Accueil" }
  }
}

# Images de la page du projet : le playfield couché (joueur au bord gauche de l'image) est remis
# d'un quart de tour à l'endroit ; la borne entière est assemblée écran par écran.
$edge = '#24504a'
function Write-Planche([string]$Out, [int]$Width, [int]$Height, [object[]]$Layers) {
  $spec = "$base\planche.json"
  @{ out = $Out; width = $Width; height = $Height; background = '#030807'; quality = 0.84; layers = $Layers } | ConvertTo-Json -Depth 6 | Set-Content $spec -Encoding UTF8
  Push-Location $wt
  try { & $electron docs\demo-captures.cjs --planche $spec 2>&1 | ForEach-Object { "   $_" } } finally { Pop-Location }
  if ($LASTEXITCODE -ne 0) { throw "Image impossible : $Out" }
}
if ($Etapes -contains 'images' -or $Etapes -contains 'images-fonctions') {
  '== images de la page « Toutes les fonctionnalités » (docs\images\<langue>\features)'
  foreach ($langue in $Langues) {
    $dir = "$base\$langue\captures\fonctions"
    $out = "$wt\docs\images\$langue\features"
    New-Item -ItemType Directory -Force $out | Out-Null
    $refus = if (Test-Path "$dir\fonctions-ecartees.txt") { @(Get-Content "$dir\fonctions-ecartees.txt" -Encoding UTF8) } else { @() }
    foreach ($f in $Fonctions) {
      if ($Seulement.Count -and $Seulement -notcontains $f[0]) { continue }
      if ($refus | Where-Object { $_ -like "$langue/fonctions\$($f[0]) :*" }) { "   $langue/$($f[0]) : écarté par le garde-fou"; continue }
      # Le dernier écran de la séquence (après la dernière attente), playfield remis debout.
      $motif = if ($f[1] -eq 'W') { '*-ecran1.png' } else { '*.png' }
      $last = Get-ChildItem "$dir\$($f[0])\$motif" -ErrorAction SilentlyContinue | Sort-Object Name | Select-Object -Last 1
      if (-not $last) { "   $langue/$($f[0]) : pas de capture"; continue }
      Write-Planche "$out\$($f[0]).webp" 720 1280 @(@{ src = $last.FullName; x = 0; y = 0; w = 720; h = 1280; turn = -1 })
    }
  }
}
if ($Etapes -contains 'images') {
  '== images de docs\images'
  function Layer([string]$Src, [int]$X, [int]$Y, [int]$W, [int]$H, [int]$Turn = 0) {
    if (-not (Test-Path $Src)) { throw "Capture absente : $Src" }
    @{ src = $Src; x = $X; y = $Y; w = $W; h = $H; turn = $Turn; radius = 10; border = $edge }
  }
  foreach ($langue in $Langues) {
    $c = "$base\$langue\captures"
    $out = "$wt\docs\images\$langue"
    New-Item -ItemType Directory -Force $out | Out-Null
    # La borne : playfield (debout), et à côté le topper, le fronton et le DMD, dans l'ordre du meuble.
    $m = 28; $g = 20; $cw = 960; $pw = 613; $ph = 1090; $x2 = $m + $pw + $g
    Write-Planche "$out\cabinet.webp" ($x2 + $cw + $m) ($ph + 2 * $m) @(
      (Layer "$c\menu\06-wait_2500.png" $m $m $pw $ph -1),
      (Layer "$c\menu\ecrans\06-wait_2500-topper.png" $x2 $m $cw 270),
      (Layer "$c\menu\ecrans\06-wait_2500-backglass.png" $x2 ($m + 270 + $g) $cw 540),
      (Layer "$c\menu\ecrans\06-wait_2500-dmd.png" $x2 ($m + 810 + 2 * $g) $cw 240)
    )
    # Écrans du playfield, remis debout : fiche du jeu, menu système, mise à jour disponible.
    foreach ($shot in @(@('game-page', '08-wait_1500'), @('system-menu', '11-wait_800'), @('update', '13-wait_2500'))) {
      Write-Planche "$out\$($shot[0]).webp" 720 1280 @(@{ src = "$c\menu\$($shot[1]).png"; x = 0; y = 0; w = 720; h = 1280; turn = -1 })
    }
    # Assistant, étape « Écrans et rôles » : chaque écran affiche son numéro.
    $aw = 1120; $ah = 630; $sx = $m + $aw + $g; $sw = 480
    $top = $m + [int](($ah - (270 + 120 + 135 + 2 * $g)) / 2)
    Write-Planche "$out\wizard.webp" ($sx + $sw + $m) ($ah + 2 * $m) @(
      (Layer "$c\assistant\01-wait_1500-ecran1.png" $m $m $aw $ah),
      (Layer "$c\assistant\01-wait_1500-ecran2.png" $sx $top $sw 270),
      (Layer "$c\assistant\01-wait_1500-ecran3.png" $sx ($top + 270 + $g) $sw 120),
      (Layer "$c\assistant\01-wait_1500-ecran4.png" $sx ($top + 390 + 2 * $g) $sw 135)
    )
    Write-Planche "$out\vpx-settings.webp" 1600 900 @(@{ src = "$c\reglages\reglages-01-ArrowDown.png"; x = 0; y = 0; w = 1600; h = 900 })
    # « Médias du jeu » sur la borne (playfield remis debout), et le menu des tables d'un PC de bureau.
    if (Test-Path "$c\fiche") { Write-Planche "$out\game-media.webp" 720 1280 @(@{ src = "$c\fiche\10-wait_3000.png"; x = 0; y = 0; w = 720; h = 1280; turn = -1 }) }
    if (Test-Path "$c\bureau") { Write-Planche "$out\desktop.webp" 1600 900 @(@{ src = "$c\bureau\06-wait_2500.png"; x = 0; y = 0; w = 1600; h = 900 }) }
  }
  # Fronton de la marque en tête de la page, dossier docs\Design\presentation à partager, et
  # adresses des images de README.md et README.fr.md suivant leur contenu (?v=<empreinte>).
  & "$PSScriptRoot\demo-presentation.ps1"
  if (-not $?) { throw 'Images de présentation en échec.' }
}
"Captures dans $base\<langue>\captures (version annoncée : $next)."
