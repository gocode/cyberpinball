# Démonstration sans opérateur des sauvegardes (Menu système > Cyber Pinball > Sauvegardes), hors
# écran sur un bureau Windows caché, avec des tables inventées (docs\demo-captures.cjs) et deux clés
# simulées (CYBERPINBALL_LECTEURS : des dossiers du bac à sable). Pour chaque jeu d'écrans et chaque
# langue : l'écran sans destination, le choix d'un dossier précis de la clé (sélecteur de dossiers), le choix du niveau (focus sur le niveau),
# la copie puis « Sauvegarde terminée », la liste des sauvegardes, le plan (une partie exclue),
# la sauvegarde automatique (chaque jour, à heure fixe, l'heure et le jour choisis), puis une clé FAT32 presque pleine : niveaux bloqués avec leur raison.
# Le garde-fou de mise en page et le guet hors écran doivent rester muets ; la sauvegarde doit être
# dans le dossier choisi de la clé simulée, complète. Rien n'est restauré (le redémarrage quitterait la démonstration).
#   .\docs\demo-sauvegardes.ps1 [-Langues fr, en] [-Ecrans borne, poste-deux-ecrans]
# Captures dans tmp\demo-sauvegardes\<écrans>\<langue>\captures. VPX n'est jamais lancé ; ni le
# vrai modèle de borne, ni une vraie clé, ni le vrai VPinballX.ini ne sont lus ni touchés.
param(
  [string[]]$Langues = @('fr', 'en'),
  [string[]]$Ecrans = @('borne', 'poste-deux-ecrans')
)
$ErrorActionPreference = 'Stop'
$wt = Split-Path $PSScriptRoot -Parent
. "$PSScriptRoot\hors-ecran.ps1"
# Tout le reste tourne sur un bureau Windows caché : rien ne peut apparaître sur les écrans du poste.
if (Enter-BureauCache $PSCommandPath $PSBoundParameters) { exit $LASTEXITCODE }
$base = "$wt\tmp\demo-sauvegardes"
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

# Le premier Exit ferme le message de démarrage (VPX n'est pas installé dans le bac à sable), le
# second ouvre le menu système. Les clés se choisissent au bouton (la première est sous le
# curseur) : leur nom change avec la langue. La destination est d'abord un dossier de la clé E:
# (« Sauvegardes ») ; plus loin, la clé G: est à deux crans sous le dossier choisi.
$touches = @(
  'Escape', 'wait:1500', 'Escape', 'wait:800',
  'action:Sauvegardes', 'wait:1500',
  'action:Choisir une destination', 'wait:1200',
  'action:Choisir un dossier…', 'wait:1500',
  'action:Sauvegardes', 'wait:1000',
  'action:Prendre ce dossier entier', 'wait:1200',
  'action:Sauvegarder maintenant', 'wait:1500',
  'action:Avec les tables', 'wait:600',
  'action:Lancer la sauvegarde', 'wait:1500', 'wait:30000',
  'action:Revenir aux sauvegardes', 'wait:1000',
  'action:Restaurer une sauvegarde', 'wait:1500',
  'Digit1', 'wait:1500',
  'Digit1', 'wait:1500',
  'Escape', 'wait:800', 'Escape', 'wait:600', 'Escape', 'wait:800',
  'action:Automatique : désactivée', 'wait:800',
  'action:Chaque jour', 'wait:800', 'action:À heure fixe', 'wait:800', 'action:Chaque semaine', 'wait:800',
  'action:Heure :', 'wait:800', 'ShiftRight', 'ShiftRight', 'ShiftRight', 'wait:400', 'Digit1', 'wait:800',
  'action:Jour :', 'wait:800', 'ShiftRight', 'wait:400', 'Digit1', 'wait:800',
  'action:Dès que possible', 'wait:800', 'action:Désactivée', 'wait:800', 'Escape', 'wait:800',
  'action:Sauvegarder maintenant', 'wait:1500',
  'action:Changer de destination', 'wait:1200',
  'ShiftRight', 'ShiftRight', 'wait:400', 'Digit1', 'wait:1000',
  'action:Sauvegarder maintenant', 'wait:1500',
  'Escape', 'wait:800'
)

try {
  foreach ($jeu in $Ecrans) {
    Use-HorsEcran $jeu
    foreach ($langue in $Langues) {
      "== $jeu, $langue"
      $dossier = "$base\$jeu\$langue"
      $home_ = "$dossier\home"
      foreach ($d in @($home_, "$dossier\cle-e", "$dossier\cle-g")) { if (Test-Path $d) { Remove-Item -Recurse -Force $d } }
      New-Item -ItemType Directory -Force "$home_\sandbox", "$dossier\cle-e\Sauvegardes", "$dossier\cle-g" | Out-Null
      Set-Content "$home_\sandbox\VPinballX.ini" '' -Encoding UTF8
      # Une sauvegarde automatique déjà faite aujourd'hui : la programmer pendant la démonstration n'en lance pas d'autre.
      $faite = (Get-Date).ToUniversalTime().ToString('o')
      [IO.File]::WriteAllText("$home_\sauvegardes.json", (ConvertTo-Json -Compress @{ auto = 'off'; copyToDestination = $true; lastAuto = $faite; lastCopy = $faite }))
      node "$PSScriptRoot\demo-medias.cjs" modele "$PSScriptRoot\ecrans\$jeu.json" "$home_\cabinet.json" "$home_\sandbox\VPinballX.ini" | Out-Null
      if ($LASTEXITCODE -ne 0) { throw 'Modèle de borne des écrans simulés impossible.' }
      $lecteurs = @(
        @{ letter = 'E:'; name = 'SAUVEGARDE'; type = 'usb'; free = 62000000000; size = 64000000000; fs = 'exFAT'; serial = 'DEMO-E'; path = "$dossier\cle-e" },
        @{ letter = 'G:'; name = 'KINGSTON'; type = 'usb'; free = 4096; size = 8000000000; fs = 'FAT32'; serial = 'DEMO-G'; path = "$dossier\cle-g" }
      )
      $env:CYBERPINBALL_LECTEURS = ConvertTo-Json -Compress -InputObject $lecteurs
      $env:CYBERPINBALL_HOME = $home_
      $env:CYBERPINBALL_ROOT = $root
      $env:CYBERPINBALL_LANGUE = $langue
      $env:CYBERPINBALL_AUTOPILOT = $touches -join ','
      $captures = "$dossier\captures"
      $env:CYBERPINBALL_CAPTURE = $captures
      if (Test-Path $captures) { Remove-Item -Recurse -Force $captures }
      Push-Location $wt
      try { $log = & $electron app 2>&1 | ForEach-Object { "$_" } } finally { Pop-Location }
      $log | Where-Object { $_ -match '^(Autopilote|Mise en page|Traduction manquante|Hors écran|Garde-fou|Sauvegarde)' } | ForEach-Object { Write-Host "   $_" }
      $id = "$jeu/$langue"
      if ($log -match 'Autopilote : aucun') { $failures += "$id : une action rejouée n'a pas trouvé son écran" }
      if ($log -match 'Traduction manquante') { $failures += "$id : texte sans traduction" }
      if ($log -match 'Garde-fou') { $failures += "$id : écriture hors du bac à sable" }
      Assert-HorsEcran $captures
      $report = "$captures\mise-en-page.txt"
      if (-not (Test-Path $report)) { $failures += "$id : relevé de mise en page absent" }
      elseif ((Get-Content $report -Raw -Encoding UTF8) -notmatch '^Aucun problème') { $failures += "$id : mise en page, voir $report" }
      $liste = @(Get-ChildItem "$dossier\cle-e\Sauvegardes\CyberPinball-Sauvegardes" -Recurse -Filter 'sauvegarde.json' -ErrorAction SilentlyContinue)
      if ($liste.Count -ne 1) { $failures += "$id : $($liste.Count) sauvegarde(s) dans le dossier choisi de la clé simulée au lieu d'une" }
      if (Test-Path "$dossier\cle-e\CyberPinball-Sauvegardes") { $failures += "$id : sauvegarde à la racine de la clé au lieu du dossier choisi" }
      elseif (-not (Get-Content $liste[0].FullName -Raw -Encoding UTF8 | ConvertFrom-Json).complete) { $failures += "$id : la sauvegarde n'est pas complète" }
      if (@(Get-ChildItem "$dossier\cle-g" -Recurse -File -ErrorAction SilentlyContinue).Count) { $failures += "$id : la clé pleine a reçu des fichiers" }
    }
  }
} finally {
  Remove-Item Env:CYBERPINBALL_LANGUE, Env:CYBERPINBALL_AUTOPILOT, Env:CYBERPINBALL_CAPTURE, Env:CYBERPINBALL_HOME, Env:CYBERPINBALL_ROOT, Env:CYBERPINBALL_LECTEURS -ErrorAction SilentlyContinue
}

if ($failures.Count) { throw "Démonstration des sauvegardes en échec :`n  $($failures -join "`n  ")" }
"Captures dans $base\<écrans>\<langue>\captures."
