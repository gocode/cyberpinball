# Démonstration sans opérateur des clés des plugins de VPX 10.8.1 (B2S, PuP, DMDUtil) :
# prépare un bac à sable dans tmp\demo-plugins (copie du modèle de borne et du
# VPinballX.ini réels, dossier pinmame commun, ZeDMD simulé), puis (avec -Run) :
#   1. synchronise VPinballX.ini (npm run sync) ;
#   2. rallume B2SLegacy à la main et resynchronise : modification signalée, constat
#      « B2S et B2SLegacy activés ensemble » ;
#   3. remet les valeurs de Cyber Pinball (--reecrire) ;
#   4. ouvre l'écran des réglages et le parcourt (Essentiels, puis sections Backglass,
#      ScoreView, Plugin.DMDUtil et Plugin.B2S de l'onglet Avancé) ; captures dans
#      tmp\captures\plugins.
#   .\docs\demo-plugins.ps1 -Run
# Hors écran par défaut, sur les écrans simulés de docs\ecrans\<Ecrans>.json (-Ecrans) ;
# $env:CYBERPINBALL_A_L_ECRAN = '1' pour les vrais écrans du poste (docs\hors-ecran.ps1).
# Rien n'est écrit hors de tmp\demo-plugins : le vrai VPinballX.ini n'est que lu.
param(
  [switch]$Run,
  [string]$Cabinet = 'D:\CyberPinball\data\cabinet.json',
  [string]$Ini = 'D:\CyberPinball\config\VPinballX.ini',
  [string]$Ecrans = 'pc-dev'
)
$ErrorActionPreference = 'Stop'
$wt = Split-Path $PSScriptRoot -Parent
. "$PSScriptRoot\hors-ecran.ps1"
# Tout le reste tourne sur un bureau Windows caché : rien ne peut apparaître sur les écrans du poste.
if (Enter-BureauCache $PSCommandPath $PSBoundParameters) { exit $LASTEXITCODE }
Use-HorsEcran $Ecrans
$base = "$wt\tmp\demo-plugins"

if (Test-Path $base) { Remove-Item -Recurse -Force $base }
$root = "$base\root"; $home_ = "$base\home"
New-Item -ItemType Directory -Force "$root\tables", "$root\pinmame\roms", "$root\pinmame\altcolor\t2_l8", "$home_\sandbox" | Out-Null
Copy-ModeleBorne $Cabinet $home_ | Out-Null
if (Test-Path $Ini) { Copy-Item $Ini "$home_\sandbox\VPinballX.ini" }
# Colorisation Serum commune (fichier vide : seul son nom compte pour la proposition).
Set-Content -Path "$root\pinmame\altcolor\t2_l8\t2_l8.cRZ" -Value '' -Encoding ASCII
# ZeDMD HD sur ESP32-S3 (USB natif, périphérique composite), tel que le gestionnaire de configuration le liste.
$usb = @'
[
  { "instanceId": "USB\\VID_8087&PID_0029\\5&2d88c2ec&0&14", "vid": 32903, "pid": 41, "name": "Intel(R) Wireless Bluetooth(R)" },
  { "instanceId": "USB\\VID_303A&PID_1001\\DC:54:75:C1:2A:30", "vid": 12346, "pid": 4097, "name": "Périphérique USB composite" },
  { "instanceId": "USB\\VID_303A&PID_1001&MI_00\\7&1a2b3c&0&0000", "vid": 12346, "pid": 4097, "name": "Périphérique série USB (COM5)", "port": "COM5" },
  { "instanceId": "USB\\VID_303A&PID_1001&MI_02\\7&1a2b3c&0&0002", "vid": 12346, "pid": 4097, "name": "USB JTAG/serial debug unit" }
]
'@
Set-Content -Path "$base\usb-zedmd.json" -Value $usb -Encoding UTF8

if (-not $Run) { return }

$env:CYBERPINBALL_ROOT = $root; $env:CYBERPINBALL_HOME = $home_; $env:CYBERPINBALL_USB_DEVICES = "$base\usb-zedmd.json"
$ini_ = "$home_\sandbox\VPinballX.ini"
Push-Location $wt
try {
  npm run build | Out-Null
  '== 1. Synchronisation'
  node app\dist\sync-cli.js
  '== 2. B2SLegacy rallumé à la main'
  (Get-Content $ini_ -Raw) -replace '(\[Plugin\.B2SLegacy\]\r?\nEnable = )0', '${1}1' | Set-Content $ini_ -NoNewline
  node app\dist\sync-cli.js
  '== 3. Valeurs de Cyber Pinball remises'
  node app\dist\sync-cli.js --reecrire
  '== Clés des plugins dans VPinballX.ini'
  Select-String -Path $ini_ -Pattern '^\[(Backglass|ScoreView|Topper|Plugin\.(B2S|B2SLegacy|DMDUtil|PinMAME|Serum|VNI))\]|^Priority\.|^(Enable|ZeDMD|PIN2DMD|Pixelcade|ScoreViewDMDOverlay|ScoreViewDMDAutoPos|PinMAMEPath|SerumPath|VniPath) =' |
    ForEach-Object { $_.Line }

  '== 4. Écran des réglages'
  $env:CYBERPINBALL_FLIPPERS = 'bottom'
  $env:CYBERPINBALL_CAPTURE = "$wt\tmp\captures\plugins"
  $env:CYBERPINBALL_AUTOPILOT = @(
    'PageDown', 'PageDown', 'PageDown',          # Essentiels : groupe « Backglass, PuP et DMD réel »
    'PageDown',                                   # groupe « Dossiers communs à toutes les tables »
    'Tab', 'ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowDown', 'Digit1', # Avancé : section Backglass
    'PageDown', 'PageDown', 'Escape',             # ses priorités, retour aux sections
    'ArrowDown', 'Digit1', 'PageDown', 'PageDown', 'Escape', # section ScoreView
    'PageDown', 'PageDown', 'PageDown', 'ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowDown', 'Digit1', # Plugin.DMDUtil
    'Escape', 'PageDown', 'ArrowDown', 'ArrowDown', 'Digit1', # Plugin.B2S
    'Escape', 'Escape'
  ) -join ','
  if (Test-Path $env:CYBERPINBALL_CAPTURE) { Remove-Item -Recurse -Force $env:CYBERPINBALL_CAPTURE }
  npx electron app --reglages
  Assert-HorsEcran $env:CYBERPINBALL_CAPTURE
} finally { Pop-Location }
