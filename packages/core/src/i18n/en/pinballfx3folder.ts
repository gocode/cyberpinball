// Catalogue anglais : Pinball FX3 depuis un dossier du jeu choisi à la main (packages/core/src/pinballfx3-folder.ts,
// app/src/pinballfx3-folder-ui.ts, branchements dans app/src/library.ts et app/src/frontend.ts).
// Clé : le texte français tel qu'il est passé à t() ou tn().
export const messages: Record<string, string> = {
  // packages/core/src/pinballfx3-folder.ts
  '« {dir} » est introuvable (disque débranché, dossier déplacé ?).': '"{dir}" can’t be found (drive unplugged, folder moved?).',
  '« {dir} » : ni « Pinball FX Classic.exe » ni « Pinball FX3.exe » ici. Choisissez le dossier qui contient l’exécutable de {game}.': '"{dir}": neither "Pinball FX Classic.exe" nor "Pinball FX3.exe" here. Choose the folder that holds the {game} executable.',
  '« {dir} » : l’exécutable est là, mais aucune table dans son dossier data\\steam.': '"{dir}": the executable is there, but there’s no table in its data\\steam folder.',
  'introuvable (disque débranché, dossier déplacé ?)': 'not found (drive unplugged, folder moved?)',
  'ni « Pinball FX Classic.exe » ni « Pinball FX3.exe » ici': 'neither "Pinball FX Classic.exe" nor "Pinball FX3.exe" here',
  'aucune table dans son dossier data\\steam': 'no table in its data\\steam folder',
  '{game} a été lancé depuis le dossier choisi ({dir}), sans passer par Steam. S’il exige Steam, il refuse de s’ouvrir ainsi : « Oublier ce dossier » (Ajouter une table > Tables de {game}) revient au jeu de Steam. Sinon, vérifiez que le mode borne est activé dans le jeu et que la table est achetée sur votre compte.':
    '{game} was started from the chosen folder ({dir}), without going through Steam. If it requires Steam, it refuses to open this way: "Forget this folder" (Add a table > {game} tables) goes back to the Steam game. Otherwise, check that cabinet mode is enabled in the game and that the table is bought on your account.',
  // app/src/frontend.ts
  '{game} est introuvable sur ce PC. Menu système > Tables > Ajouter une table > « Tables de {game} » : l’installer avec Steam, ou choisir le dossier du jeu.':
    '{game} can’t be found on this PC. System menu > Tables > Add a table > "{game} tables": install it with Steam, or choose the game folder.',
  // app/src/library.ts
  'Introuvable sur ce PC : l’installer avec Steam, ou choisir le dossier du jeu': 'Not found on this PC: install it with Steam, or choose the game folder',
  'Steam absent de ce PC : choisir le dossier du jeu, ou installer Steam puis {game}': 'No Steam on this PC: choose the game folder, or install Steam then {game}',
  'Dossier de Pinball FX3': 'Pinball FX3 folder',
  'Aucune table à lister': 'No table to list',
  'Installez {game} avec Steam, ou choisissez le dossier du jeu : ses tables apparaissent ici.': 'Install {game} with Steam, or choose the game folder: its tables show up here.',
  'Le dossier des tables du dossier choisi est vide ou illisible : {dir}.': 'The chosen folder’s table folder is empty or unreadable: {dir}.',
  // app/src/pinballfx3-folder-ui.ts
  'Dossier choisi à la main · les parties se lancent par son exécutable, sans passer par Steam': 'Folder chosen by hand · games start from its executable, without going through Steam',
  'Installé par Steam (c’est aussi le dossier choisi) · les parties passent par Steam': 'Installed by Steam (also the chosen folder) · games go through Steam',
  'Installé par Steam · les parties passent par Steam': 'Installed by Steam · games go through Steam',
  'Introuvable': 'Not found',
  'Ni dans Steam, ni dans un dossier choisi : l’installer avec Steam, ou choisir le dossier du jeu.': 'Neither in Steam nor in a chosen folder: install it with Steam, or choose the game folder.',
  'Dossier choisi, pas utilisé :': 'Chosen folder, not used:',
  'Changer le dossier du jeu…': 'Change the game folder…',
  'Choisir le dossier du jeu…': 'Choose the game folder…',
  'Celui de « Pinball FX Classic.exe » ou « Pinball FX3.exe », pour des tables rangées hors de Steam': 'The one with "Pinball FX Classic.exe" or "Pinball FX3.exe", for tables kept outside Steam',
  'Oublier ce dossier': 'Forget this folder',
  'Revenir au jeu installé par Steam': 'Go back to the game installed by Steam',
  'Cyber Pinball ne lancera plus le jeu depuis ce dossier': 'Cyber Pinball will no longer start the game from this folder',
  'Dossier oublié : les parties passent de nouveau par Steam.': 'Folder forgotten: games go through Steam again.',
  'Dossier oublié.': 'Folder forgotten.',
  'C’est le dossier du jeu de Steam : rien à changer, les parties passent par Steam.': 'That’s the Steam game folder: nothing to change, games go through Steam.',
  'Dossier gardé : {dir}.': 'Folder kept: {dir}.',
  'Dossier de {game} reconnu dans votre sélection : ses tables ne s’installent pas comme des tables VPX, elles se choisissent ici.': '{game} folder recognized in your selection: its tables aren’t installed like VPX tables, you choose them here.',
  '{n} table trouvée.': '{n} table found.',
  '{n} tables trouvées.': '{n} tables found.',
  'Les parties se lancent par « {exe} », sans passer par Steam ; si le jeu exige Steam, c’est lui qui refusera de s’ouvrir.': 'Games start from "{exe}", without going through Steam; if the game requires Steam, it’s the game that will refuse to open.',
};
