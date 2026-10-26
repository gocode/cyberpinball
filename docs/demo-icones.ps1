# Démonstration sans opérateur des icônes des menus (registre app/renderer/icons.js), hors écran
# sur un bureau Windows caché, avec des tables inventées (docs\demo-captures.cjs) et une
# version suivante annoncée par un site local (pastille rouge sur « Mise à jour de Cyber
# Pinball » et sur la roue dentée). Pour chaque jeu d'écrans et chaque langue :
#   menu     : fiche d'un jeu (Jouer choisi, puis une autre action), rubriques du menu système
#              (choix sur celle à pastille, puis remonté en haut), chaque rubrique et « Migration », « Configuration de la borne »,
#              « Configurations de la borne », « Médias, son et attente », « Langue »,
#              « Mise à jour de Cyber Pinball » (version disponible), catalogue (titre hérité) ;
#   reglages : l'écran des réglages de VPX (onglets et groupes des Essentiels).
# Écrans simulés : borne (playfield 4K couché : rendu tourné d'un quart de tour) et
# poste-deux-ecrans (poste de bureau, playfield en paysage). Le garde-fou de mise en page (icône inconnue, répétée dans un menu,
# plus petite que 20 px, chevauchement, rognure) et le guet hors écran doivent rester muets.
#   .\docs\demo-icones.ps1 [-Langues fr, en] [-Ecrans borne, poste-deux-ecrans] [-Etapes menu, reglages]
# Captures dans tmp\demo-icones\<écrans>\<langue>\captures. VPX n'est jamais lancé ; ni le vrai
# modèle de borne ni le vrai VPinballX.ini ne sont lus ni touchés.
param(
  [string[]]$Langues = @('fr', 'en'),
  [string[]]$Ecrans = @('borne', 'poste-deux-ecrans'),
  [string[]]$Etapes = @('menu', 'reglages'),
  [int]$Port = 8767
)
$ErrorActionPreference = 'Stop'
$wt = Split-Path $PSScriptRoot -Parent
. "$PSScriptRoot\hors-ecran.ps1"
# Tout le reste tourne sur un bureau Windows caché : rien ne peut apparaître sur les écrans du poste.
if (Enter-BureauCache $PSCommandPath $PSBoundParameters) { exit $LASTEXITCODE }
$base = "$wt\tmp\demo-icones"
$root = "$base\root"
$electron = node -p "require('electron')"
$failures = @()

Push-Location $wt
try { npm run build | Out-Null } finally { Pop-Location }

if (-not (Test-Path "$root\tables")) {
  '== tables inventées et leurs médias'
  Push-Location $wt
  try { & $electron docs\demo-captures.cjs $root 2>&1 | ForEach-Object { "   $_" } } finally { Pop-Location }
  if ($LASTEXITCODE -ne 0) { throw 'Génération des médias en échec.' }
}

# Version suivante, annoncée par un flux signé avec une clé d'essai (comme docs\demo-captures.ps1).
$site = "$base\site"
if (Test-Path $site) { Remove-Item -Recurse -Force $site }
New-Item -ItemType Directory -Force $site | Out-Null
$feed = @'
const [core, dir, current] = process.argv.slice(1);
const c = require(core);
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
fs.writeFileSync(path.join(dir, 'cle.pem'), publicKey.export({ type: 'spki', format: 'pem' }));
const v = current.split('-')[0].split('.'); v[1] = String(Number(v[1]) + 1); v[2] = '0';
const manifest = {
  version: v.join('.'),
  date: '2026-11-02T10:00:00.000Z',
  notes: ['Une icône pour chaque entrée des menus.'],
  notesByLanguage: { en: ['An icon for every menu entry.'] },
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

function Invoke-Capture([string]$Dossier, [string]$Langue, [string]$Nom, [string[]]$Touches, [string[]]$Arguments) {
  $env:CYBERPINBALL_LANGUE = $Langue
  $env:CYBERPINBALL_AUTOPILOT = $Touches -join ','
  $env:CYBERPINBALL_CAPTURE = "$Dossier\captures\$Nom"
  if (Test-Path $env:CYBERPINBALL_CAPTURE) { Remove-Item -Recurse -Force $env:CYBERPINBALL_CAPTURE }
  Push-Location $wt
  try { $log = & $electron app @Arguments 2>&1 | ForEach-Object { "$_" } } finally { Pop-Location }
  $log | Where-Object { $_ -match '^(Autopilote|Mise en page|Traduction manquante|Hors écran)' } | ForEach-Object { Write-Host "   $_" }
  $id = "$(Split-Path (Split-Path $Dossier) -Leaf)/$Langue/$Nom"
  if ($log -match 'Autopilote : aucun') { $script:failures += "$id : une action rejouée n'a pas trouvé son écran" }
  if ($log -match 'Traduction manquante') { $script:failures += "$id : texte sans traduction" }
  Assert-HorsEcran $env:CYBERPINBALL_CAPTURE
  $report = "$env:CYBERPINBALL_CAPTURE\mise-en-page.txt"
  if (-not (Test-Path $report)) { $script:failures += "$id : relevé de mise en page absent" }
  elseif ((Get-Content $report -Raw -Encoding UTF8) -notmatch '^Aucun problème') { $script:failures += "$id : mise en page, voir $report" }
}

# Une entrée du menu désignée par son icône, quelle que soit la langue (un libellé à virgule
# ne s'écrit pas dans CYBERPINBALL_AUTOPILOT, dont les étapes sont séparées par des virgules).
$entree = { param($icon) "click:.lib-action:has(svg[data-icon=`"$icon`"])" }
# Remonter en haut du menu système : flèche haut, une fois par entrée.
$enHaut = @(1..18 | ForEach-Object { 'ArrowUp' })

try {
  foreach ($ecrans in $Ecrans) {
    Use-HorsEcran $ecrans
    foreach ($langue in $Langues) {
      "== $ecrans, $langue"
      $dossier = "$base\$ecrans\$langue"
      $home_ = "$dossier\home"
      if (Test-Path $home_) { Remove-Item -Recurse -Force $home_ }
      New-Item -ItemType Directory -Force "$home_\sandbox" | Out-Null
      Set-Content "$home_\sandbox\VPinballX.ini" '' -Encoding UTF8
      node "$PSScriptRoot\demo-medias.cjs" modele "$PSScriptRoot\ecrans\$ecrans.json" "$home_\cabinet.json" "$home_\sandbox\VPinballX.ini" | Out-Null
      if ($LASTEXITCODE -ne 0) { throw 'Modèle de borne des écrans simulés impossible.' }
      $env:CYBERPINBALL_HOME = $home_
      $env:CYBERPINBALL_ROOT = $root
      $env:CYBERPINBALL_MAJ_URL = "http://127.0.0.1:$Port/cyberpinball-maj.json"
      $env:CYBERPINBALL_MAJ_CLE = "$site\cle.pem"
      $env:CYBERPINBALL_MAJ_INSTALLEE = '1'

      if ($Etapes -contains 'menu') {
        # VPX n'est pas installé : Exit (plus tard). Start : la fiche du premier jeu ; trois
        # flippers : une autre action choisie. Exit, Exit : les rubriques du menu système, choix
        # sur celle à pastille (Cyber Pinball), puis remonté en haut. Chaque rubrique, et
        # « Migration » ; Exit remonte d'un cran.
        Invoke-Capture $dossier $langue 'menu' (@(
            'Escape', 'wait:1500', 'Digit1', 'wait:1500', 'ShiftRight', 'ShiftRight', 'ShiftRight',
            'Escape', 'Escape', 'wait:2500'
          ) + $enHaut + @(
            'action:Tables', 'wait:600', 'Escape',
            'action:Médias', 'wait:600', (& $entree 'music'), 'wait:600', 'Escape', 'Escape',
            'action:Borne', 'wait:600', 'action:Configuration de la borne', 'wait:600',
            'action:Configurations de la borne', 'wait:600', 'Escape', 'Escape', 'Escape',
            'action:Cyber Pinball', 'wait:600', 'action:Migration', 'wait:600', 'Escape',
            'action:Langue', 'wait:600', 'Escape',
            'action:Mise à jour de Cyber Pinball', 'wait:2500', 'Escape', 'Escape',
            'action:Ajouter une table', 'wait:1500', 'action:Trouver une table en ligne', 'wait:1500'
          )) @()
      }
      if ($Etapes -contains 'reglages') {
        $drive = @('P:', 'Q:', 'R:', 'S:', 'T:', 'U:', 'V:', 'W:') | Where-Object { -not (Test-Path "$_\") } | Select-Object -First 1
        New-Item -ItemType Directory -Force "$home_\borne\config" | Out-Null
        Copy-Item "$home_\sandbox\VPinballX.ini" "$home_\borne\config\VPinballX.ini"
        subst $drive "$home_\borne"
        $env:CYBERPINBALL_VPX_INI = "$drive\config\VPinballX.ini"
        try { Invoke-Capture $dossier $langue 'reglages' @('ArrowDown', 'ArrowUp', 'ArrowUp') @('--reglages') }
        finally {
          subst $drive /D
          Remove-Item Env:CYBERPINBALL_VPX_INI -ErrorAction SilentlyContinue
        }
      }
    }
  }
} finally {
  Stop-Process -Id $serveur.Id -Force -ErrorAction SilentlyContinue
  Remove-Item Env:CYBERPINBALL_LANGUE, Env:CYBERPINBALL_AUTOPILOT, Env:CYBERPINBALL_CAPTURE, Env:CYBERPINBALL_HOME, Env:CYBERPINBALL_ROOT, Env:CYBERPINBALL_MAJ_URL, Env:CYBERPINBALL_MAJ_CLE, Env:CYBERPINBALL_MAJ_INSTALLEE -ErrorAction SilentlyContinue
}

if ($failures.Count) { throw "Démonstration des icônes en échec :`n  $($failures -join "`n  ")" }
"Captures dans $base\<écrans>\<langue>\captures (version annoncée : $next)."
