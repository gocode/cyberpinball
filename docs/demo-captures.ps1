# Captures d'écran de la page du projet (README.md en anglais, README.fr.md en français),
# rangées dans docs\images. Tout est fabriqué ici, hors écran, sur un bureau Windows caché :
# des tables inventées et leurs médias dessinés par docs\demo-captures.cjs (aucune œuvre de
# tiers, aucun nom de jeu réel), une borne simulée (docs\ecrans\borne.json : playfield 4K
# couché, fronton, DMD, topper) et son modèle (docs\demo-medias.cjs modele), une version
# suivante annoncée par un site local, au flux signé par une clé d'essai.
# Étapes, pour chaque langue :
#   menu     : le menu des tables sur les quatre écrans, la fiche d'un jeu, le menu système,
#              « Mise à jour de Cyber Pinball » avec une version disponible ;
#   assistant: l'étape « Écrans et rôles » sur les quatre écrans ;
#   reglages : l'écran des réglages de VPX ;
#   images   : assemblage et remise à l'endroit (playfield couché) dans docs\images, en WebP.
# Le garde-fou de mise en page et le guet hors écran doivent rester muets, sinon le script échoue.
#   .\docs\demo-captures.ps1 [-Langues en, fr] [-Etapes medias, menu, assistant, reglages, images]
# Ni le vrai modèle de borne ni le vrai VPinballX.ini ne sont lus ni touchés ; VPX n'est jamais lancé.
param(
  [string[]]$Langues = @('en', 'fr'),
  [string[]]$Etapes = @('medias', 'menu', 'assistant', 'reglages', 'images'),
  [int]$Port = 8766
)
$ErrorActionPreference = 'Stop'
$wt = Split-Path $PSScriptRoot -Parent
. "$PSScriptRoot\hors-ecran.ps1"
# Tout le reste tourne sur un bureau Windows caché : rien ne peut apparaître sur les écrans du poste.
if (Enter-BureauCache $PSCommandPath $PSBoundParameters) { exit $LASTEXITCODE }
Use-HorsEcran 'borne'
$base = "$wt\tmp\demo-captures"
$root = "$base\root"
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
const v = current.split('.'); v[1] = String(Number(v[1]) + 1); v[2] = '0';
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
    if ($Etapes -contains 'assistant') {
      Invoke-Capture $langue 'assistant' @('wait:1500') @('--assistant', '--ecrans')
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

# Images de la page du projet : le playfield couché (joueur au bord gauche de l'image) est remis
# d'un quart de tour à l'endroit ; la borne entière est assemblée écran par écran.
if ($Etapes -contains 'images') {
  '== images de docs\images'
  $edge = '#24504a'
  function Write-Planche([string]$Out, [int]$Width, [int]$Height, [object[]]$Layers) {
    $spec = "$base\planche.json"
    @{ out = $Out; width = $Width; height = $Height; background = '#030807'; quality = 0.84; layers = $Layers } | ConvertTo-Json -Depth 6 | Set-Content $spec -Encoding UTF8
    Push-Location $wt
    try { & $electron docs\demo-captures.cjs --planche $spec 2>&1 | ForEach-Object { "   $_" } } finally { Pop-Location }
    if ($LASTEXITCODE -ne 0) { throw "Image impossible : $Out" }
  }
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
}
"Captures dans $base\<langue>\captures (version annoncée : $next)."
