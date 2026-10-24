# « Essayer » de l'écran « Ajuster la vue », avec le vrai VPX : copie une table dans
# tmp\demo-vue-essai (jamais la table d'origine, ni son dossier), puis deux essais aux
# boutons, hauteur 0 % puis 20 %, chacun arrêté seul 10 s après l'apparition du jeu.
# Pendant ce temps, une capture de tous les écrans toutes les 2 s (tmp\captures\vue\essai\ecran-*.png) :
# le bas de la table doit être plus haut à l'écran au second essai. Les captures du menu
# sont dans tmp\captures\vue\essai\menu. VPX occupe les écrans environ une minute par essai.
#   .\docs\demo-vue-essai.ps1 -Table 'D:\CyberPinball\tables\Terminator 2\Terminator 2 (Williams 1991) g5k 1.25.vpx'
# Nécessite les écrans du poste : refusée hors écran, ne se lance qu'avec
# $env:CYBERPINBALL_A_L_ECRAN = '1' (docs\hors-ecran.ps1).
param(
  [Parameter(Mandatory)] [string]$Table,
  [string]$Emulators = 'D:\CyberPinball\emulators',
  [string]$Cabinet = 'D:\CyberPinball\data\cabinet.json',
  [int]$WaitSeconds = 60
)
$ErrorActionPreference = 'Stop'
$wt = Split-Path $PSScriptRoot -Parent
. "$PSScriptRoot\hors-ecran.ps1"
Assert-EcransDuPoste 'L''essai de la vue dans VPX (parties de VPX, captures du bureau entier)'
$base = "$wt\tmp\demo-vue-essai"
if (Test-Path $base) {
  Get-ChildItem -Directory -Recurse -Depth 2 $base -Attributes ReparsePoint | ForEach-Object { cmd /c rmdir "$($_.FullName)" }
  Remove-Item -Recurse -Force $base
}
$root = "$base\root"; $home_ = "$base\home"
$name = [IO.Path]::GetFileNameWithoutExtension($Table)
$folder = "$root\tables\$name"
New-Item -ItemType Directory -Force $folder, "$root\import", $home_ | Out-Null
New-Item -ItemType Junction -Path "$root\emulators" -Target $Emulators | Out-Null
# Copie (et non lien physique) : rien de ce que VPX ou PinMAME écrit ne peut atteindre l'original.
Copy-Item $Table "$folder\$name.vpx"
$source = Split-Path $Table
if (Test-Path "$source\pinmame\roms") { Copy-Item -Recurse "$source\pinmame\roms" "$folder\pinmame\roms" }
$b2s = Get-ChildItem $source -Filter *.directb2s | Select-Object -First 1
if ($b2s) { Copy-Item $b2s.FullName "$folder\$name.directb2s" }

$model = Get-ModeleBorne $Cabinet
# Joueur au bord droit du playfield : vue borne (BGSet = 1), donc cadrage automatique.
$model | Add-Member -Force -NotePropertyName playfield -NotePropertyValue ([pscustomobject]@{ flipperEdge = 'right' })
$model.vpx.iniPath = "$home_\sandbox\VPinballX.ini"
$model | ConvertTo-Json -Depth 20 | Set-Content -Path "$home_\cabinet.json" -Encoding UTF8

$captures = "$wt\tmp\captures\vue\essai"
if (Test-Path $captures) { Remove-Item -Recurse -Force $captures }
New-Item -ItemType Directory -Force $captures | Out-Null

# Captures de tous les écrans, en tâche de fond, pendant les deux essais.
$shots = Start-Job -ArgumentList $captures, ($WaitSeconds * 2 + 60) -ScriptBlock {
  param($dir, $seconds)
  Add-Type -AssemblyName System.Windows.Forms, System.Drawing
  $all = [System.Windows.Forms.SystemInformation]::VirtualScreen
  $end = (Get-Date).AddSeconds($seconds)
  for ($i = 0; (Get-Date) -lt $end; $i++) {
    $bmp = [System.Drawing.Bitmap]::new($all.Width, $all.Height)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.CopyFromScreen($all.Left, $all.Top, 0, 0, $bmp.Size)
    $small = [System.Drawing.Bitmap]::new($bmp, [int]($all.Width / 3), [int]($all.Height / 3))
    $small.Save((Join-Path $dir ('ecran-{0:D3}.png' -f $i)), [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose(); $small.Dispose()
    Start-Sleep -Seconds 2
  }
}

$env:CYBERPINBALL_ROOT = $root; $env:CYBERPINBALL_HOME = $home_
$env:CYBERPINBALL_CAPTURE = "$captures\menu"
$env:CYBERPINBALL_FLIPPERS = 'bottom'
$wait = "wait:$($WaitSeconds * 1000)"
$env:CYBERPINBALL_AUTOPILOT = @(
  'Digit1', 'action:Ajuster la vue',                # fiche, Ajuster la vue
  'ShiftLeft', 'ShiftLeft', 'ShiftLeft', 'ShiftLeft', 'ShiftLeft', # hauteur 0 %
  'Escape', 'ShiftRight', 'Digit1', $wait,           # Essayer, la partie, le retour sur l'écran
  'ShiftRight', 'ShiftRight', 'ShiftRight', 'ShiftRight', 'ShiftRight', 'ShiftRight', 'ShiftRight', 'ShiftRight', 'ShiftRight', 'ShiftRight',
  'ShiftRight', 'ShiftRight', 'ShiftRight', 'ShiftRight', 'ShiftRight', 'ShiftRight', 'ShiftRight', 'ShiftRight', 'ShiftRight', 'ShiftRight',
  'Escape', 'ShiftRight', 'Digit1', $wait,           # hauteur 20 %, Essayer
  'Escape', 'ShiftLeft', 'Digit1', 'Escape'          # Quitter sans enregistrer, menu
) -join ','
Push-Location $wt
try {
  Start-Process -FilePath (node -p "require('electron')") -ArgumentList 'app', "--user-data-dir=`"$base\chromium`"" -WorkingDirectory $wt -Wait
} finally { Pop-Location }
Stop-Job $shots; Remove-Job $shots

$left = @(Get-ChildItem "$home_\essais" -ErrorAction SilentlyContinue)
"Fichiers d'essai restants : $($left.Count)"
"Fichiers .ini à côté de la copie : $(@(Get-ChildItem $folder -Filter *.ini).Name -join ', ')"
"Captures : $captures"
