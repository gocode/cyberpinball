// Catalogue anglais : autres versions de VPX (autres-vpx.ts, autres-vpx-menu.ts, fiche et installation d'une table).
// Clé : le texte français tel qu'il est passé à t() ou tn().
export const messages: Record<string, string> = {
  // Ce que Cyber Pinball ne fait pas pour une table jouée avec un autre VPX
  'réalité virtuelle': 'virtual reality',
  'réglage de l’affichage en partie': 'in-game display adjustment',
  'partie entre amis': 'games with friends',
  'Vision 3D': '3D vision',
  'réglages de VPX de Cyber Pinball (écrans, DMD réel, boutons)': 'Cyber Pinball’s VPX settings (screens, real DMD, buttons)',
  'préparation des PuP-Packs': 'PuP-Pack preparation',
  'Pas de {limits} pour ces tables.': 'No {limits} for these tables.',
  // Exécutable proposé
  'Ce n’est pas l’exécutable de VPX (VPinballX64.exe, VPinballX.exe…).': 'This is not the VPX executable (VPinballX64.exe, VPinballX.exe…).',
  'Fichier illisible.': 'Unreadable file.',
  'Version de VPX introuvable dans ce fichier : seul VPX 10 se lance depuis Cyber Pinball.': 'No VPX version found in this file: only VPX 10 can be launched from Cyber Pinball.',
  'C’est la version que Cyber Pinball utilise déjà : ses tables n’y perdraient que les fonctions de Cyber Pinball.':
    'This is the version Cyber Pinball already uses: its tables would only lose Cyber Pinball’s features.',
  // Partie refusée
  '{vpx} introuvable': '{vpx} not found',
  'Il a été déplacé ou désinstallé. Pour jouer cette table avec le VPX de Cyber Pinball : Gérer la table, puis « Jouée avec {vpx} ».':
    'It was moved or uninstalled. To play this table with Cyber Pinball’s VPX: Manage table, then “Played with {vpx}”.',
  'Réglage de l’affichage impossible avec {vpx}': 'Display adjustment not available with {vpx}',
  'Cette table est jouée avec {vpx}, réglé hors de Cyber Pinball : son affichage se règle dans ce VPX.': 'This table is played with {vpx}, set up outside Cyber Pinball: its display is adjusted in that VPX.',
  'Partie entre amis impossible avec {vpx}': 'Game with friends not available with {vpx}',
  'Une partie entre amis se joue avec le VPX de Cyber Pinball : Gérer la table, puis « Jouée avec {vpx} », pour le choisir.':
    'Games with friends are played with Cyber Pinball’s VPX: Manage table, then “Played with {vpx}”, to choose it.',
  // Menu système > Ma borne > VPX > Autres versions de VPX
  'Autres versions de VPX': 'Other VPX versions',
  '{exe} · {tables} (Start : retirer)': '{exe} · {tables} (Start: remove)',
  'aucune table': 'no table',
  'Ajouter {vpx}': 'Add {vpx}',
  'Trouvé sur ce PC : {exe}': 'Found on this PC: {exe}',
  'Ajouter un autre VPX…': 'Add another VPX…',
  'Choisir son exécutable (VPinballX64.exe…) sur ce PC': 'Choose its executable (VPinballX64.exe…) on this PC',
  'Un VPX déjà installé sur ce PC, pour les tables qui tournent mieux avec lui : il se choisit dans la fiche de chaque table (Gérer la table, « Jouée avec ») et quand une table s’installe.':
    'A VPX already installed on this PC, for the tables that run better with it: it is chosen on each table’s sheet (Manage table, “Played with”) and when a table is installed.',
  'Cyber Pinball le lance avec ses propres réglages (écrans, fronton, DMD). {limits}': 'Cyber Pinball launches it with its own settings (screens, backglass, DMD). {limits}',
  'Retirer {vpx} ?': 'Remove {vpx}?',
  'La table qui l’a choisi sera jouée avec le VPX de Cyber Pinball ; elle le retrouvera s’il est ajouté de nouveau. Rien n’est effacé de ce PC.':
    'The table that chose it will be played with Cyber Pinball’s VPX; it will get it back if it is added again. Nothing is deleted from this PC.',
  'Les {n} tables qui l’ont choisi seront jouées avec le VPX de Cyber Pinball ; elles le retrouveront s’il est ajouté de nouveau. Rien n’est effacé de ce PC.':
    'The {n} tables that chose it will be played with Cyber Pinball’s VPX; they will get it back if it is added again. Nothing is deleted from this PC.',
  'Aucune table ne l’a choisi. Rien n’est effacé de ce PC.': 'No table chose it. Nothing is deleted from this PC.',
  'Autre VPX : choisir son exécutable': 'Other VPX: choose its executable',
  'Ajout d’une autre version de VPX': 'Adding another VPX version',
  'Exécutable de VPX': 'VPX executable',
  'Ce VPX ne peut pas être ajouté': 'This VPX cannot be added',
  'Aucune : toutes les tables sont jouées avec le VPX de Cyber Pinball': 'None: all tables are played with Cyber Pinball’s VPX',
  'Recherche des VPX installés sur ce PC…': 'Looking for VPX installed on this PC…',
  // Fiche de la table et plan d'installation
  'VPX {version} de Cyber Pinball': 'Cyber Pinball’s VPX {version}',
  'VPX de Cyber Pinball': 'Cyber Pinball’s VPX',
  'Jouée avec {vpx}': 'Played with {vpx}',
  '{limits} (Start : choisir)': '{limits} (Start: choose)',
  'Avec toutes les fonctions de Cyber Pinball (Start : choisir)': 'With all of Cyber Pinball’s features (Start: choose)',
  'VPX de cette table': 'This table’s VPX',
  'Le VPX qui joue cette table. Un autre VPX est lancé avec ses propres réglages (écrans, fronton, DMD). {limits}':
    'The VPX that plays this table. Another VPX is launched with its own settings (screens, backglass, DMD). {limits}',
  'Le VPX qui jouera cette table. Un autre VPX est lancé avec ses propres réglages (écrans, fronton, DMD). {limits}':
    'The VPX that will play this table. Another VPX is launched with its own settings (screens, backglass, DMD). {limits}',
  'Avec toutes les fonctions de Cyber Pinball': 'With all of Cyber Pinball’s features',
  'Avec toutes les fonctions de Cyber Pinball · choix actuel': 'With all of Cyber Pinball’s features · current choice',
  '{exe} · choix actuel': '{exe} · current choice',
  'Changer le VPX': 'Change the VPX',
  // Table enregistrée par un VPX plus récent (vpx-format.ts) : médecin, Santé de la borne, installation, partie refusée
  'Table enregistrée par VPX {table}': 'Table saved with VPX {table}',
  '{vpx} ne sait pas ouvrir une table enregistrée par VPX {table} : la partie échouerait.': '{vpx} cannot open a table saved with VPX {table}: the game would fail.',
  '{vpx} sait la jouer : Gérer la table, puis « Jouée avec », pour le choisir.': '{vpx} can play it: Manage table, then “Played with”, to choose it.',
  'Ajoutez un VPX {table} ou plus récent (Menu système > Ma borne > VPX > Autres versions de VPX), puis choisissez-le dans Gérer la table, « Jouée avec ».':
    'Add a VPX {table} or newer (System menu > My cabinet > VPX > Other VPX versions), then choose it in Manage table, “Played with”.',
  '{vpx} ne peut pas ouvrir cette table': '{vpx} cannot open this table',
  'Elle a été enregistrée par VPX {table}, plus récent.': 'It was saved with VPX {table}, a newer version.',
  'La jouer avec {vpx}': 'Play it with {vpx}',
  'Table enregistrée par VPX {table}, que ce VPX ne sait pas ouvrir : le script n’a pas pu être lu.': 'Table saved with VPX {table}, which this VPX cannot open: the script could not be read.',
  // Nouveautés du front-end (news.ts)
  'Les tables qui tournent mieux avec VPX 10.8.0 se jouent avec lui, table par table.': 'Tables that run better with VPX 10.8.0 are played with it, table by table.',
  'Ajoutez un VPX déjà installé sur ce PC (ceux des autres installations sont proposés d’office), puis choisissez-le dans la fiche d’une table ou quand elle s’installe. Une table reprise d’une autre installation garde le VPX qui la jouait.':
    'Add a VPX already installed on this PC (those of other installations are offered right away), then choose it on a table’s sheet or when it is installed. A table taken over from another installation keeps the VPX that played it.',
  'Cyber Pinball le lance avec ses propres réglages ; la réalité virtuelle, le réglage de l’affichage et les parties entre amis restent avec le VPX de Cyber Pinball.':
    'Cyber Pinball launches it with its own settings; virtual reality, display adjustment and games with friends stay with Cyber Pinball’s VPX.',
  'Menu système › Ma borne › VPX › Autres versions de VPX': 'System menu › My cabinet › VPX › Other VPX versions',
  // Menu système > Ma borne > VPX > VPX d’essai (vpx-essai-menu.ts)
  'VPX d’essai': 'Trial VPX',
  'VPX {number} (essai {build})': 'VPX {number} (trial {build})',
  'VPX {number} (essai)': 'VPX {number} (trial)',
  'VPX {number} de Cyber Pinball': 'Cyber Pinball’s VPX {number}',
  'Mode d’essai : {vpx}': 'Trial mode: {vpx}',
  'Retour à {vpx}': 'Back to {vpx}',
  'Cyber Pinball redémarre pour lancer les parties avec cette version.': 'Cyber Pinball restarts to launch games with this version.',
  'Pas de racine Cyber Pinball : rien à installer.': 'No Cyber Pinball root folder: nothing to install.',
  'Archive de {vpx} introuvable': '{vpx} archive not found',
  'Téléchargez-la depuis GitHub, connecté à un compte : {url}': 'Download it from GitHub, signed in to an account: {url}',
  'Puis posez-la dans les Téléchargements, sans la décompresser ({size} Mo).': 'Then put it in Downloads, without unzipping it ({size} MB).',
  'Toutes les fonctions de Cyber Pinball, réglages habituels': 'All Cyber Pinball features, usual settings',
  'Toutes les fonctions de Cyber Pinball · choix actuel': 'All Cyber Pinball features · current choice',
  'Réglages de VPX à part · choix actuel': 'Separate VPX settings · current choice',
  'Installé à côté · réglages de VPX à part': 'Installed alongside · separate VPX settings',
  'À installer depuis son archive (Téléchargements)': 'To install from its archive (Downloads)',
  'Installation de {vpx}…': 'Installing {vpx}…',
  '{vpx} non installé': '{vpx} not installed',
  'La préversion suivante de VPX, sur cette installation, pour l’essayer avant qu’elle ne devienne celle de Cyber Pinball.':
    'The next VPX pre-release, on this installation, to try it before it becomes Cyber Pinball’s.',
  'Elle a ses propres réglages de VPX ; tables, médias et ROM restent partagés. Les scores faits avec elle restent sur la borne.':
    'It has its own VPX settings; tables, media and ROMs stay shared. Scores made with it stay on the cabinet.',
  'Parties lancées avec {vpx}': 'Games launched with {vpx}',
  'Empreinte SHA-256 incorrecte pour {name} : attendu {expected}, obtenu {actual}.': 'Wrong SHA-256 checksum for {name}: expected {expected}, got {actual}.',
};
