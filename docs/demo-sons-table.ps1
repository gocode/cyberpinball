# Revue sans opérateur de « Sons de la table » (fiche > Médias du jeu > Musique ou Son de
# lancement), dans un bac à sable (tmp\demo-sons-table) dont le PuP-Pack reprend de vrais
# fichiers de la borne (D:\CyberPinball\tables\GOTG_2.1.1). Dossiers du pack, écoute d'une
# musique et du son d'une vidéo (fenêtre muette : la lecture se vérifie à la position et
# aux octets décodés), musique et son de lancement choisis, enregistrement, relecture du
# .m4a extrait. Écrans paysage 1920 × 1080 et portrait 1080 × 1920 ; le garde-fou
# layout-check.ts cherche les textes qui se chevauchent, sortent ou sont coupés.
# Captures, relevé (resultat.txt) et problèmes de mise en page dans
# tmp\demo-sons-table\captures.
#   .\docs\demo-sons-table.ps1
$ErrorActionPreference = 'Stop'
$wt = Split-Path $PSScriptRoot -Parent
. "$PSScriptRoot\hors-ecran.ps1"
# Tout le reste tourne sur un bureau Windows caché : rien ne peut apparaître sur les écrans du poste.
if (Enter-BureauCache $PSCommandPath $PSBoundParameters) { exit $LASTEXITCODE }
$captures = "$wt\tmp\demo-sons-table\captures"

Push-Location $wt
try {
  npm run build | Out-Null
  npx electron docs\demo-sons-table.cjs 2>&1 | ForEach-Object { "   $_" }
  $code = $LASTEXITCODE
} finally { Pop-Location }

if ($code -ne 0) { throw "La démonstration a échoué : voir $captures\resultat.txt" }
"Captures : $captures"
