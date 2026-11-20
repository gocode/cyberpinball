// Pinball FX3 depuis un dossier du jeu choisi à la main (19/11/2026) : des joueurs ont leurs tables
// hors de la bibliothèque de Steam. Le jeu est alors lancé par son propre exécutable, sans
// « steam.exe -applaunch ». Sans dossier choisi, rien ne change : le jeu de Steam (pinballfx3.ts).
//
// Établi (relevé en lecture seule sur un PinCab, copie Steam du 19/11/2026) :
// - L'exécutable s'appelle « Pinball FX Classic.exe » depuis le renommage d'avril 2026 ; avant, et
//   dans les copies pas mises à jour, « Pinball FX3.exe ». Les deux sont reconnus.
// - Il connaît les arguments « -offline », « -table_ » et « -class » (chaînes de l'exécutable).
//   « -offline » : le jeu ne se connecte pas aux services de Zen (classements, nouvelles) ; il
//   vient des front-ends qui lancent l'exécutable directement.
// - Il n'importe pas SteamAPI_RestartAppIfNecessary : il ne demande pas à Steam de le relancer.
//   Il appelle SteamAPI_Init (steam_api.dll à côté de lui).
// Rapporté par les front-ends (forums GameEx 2020, LaunchBox 2021) : « -offline -class -table_<nom> »
// est la forme employée pour l'exécutable ; une copie Steam lancée ainsi fait demander par Steam
// « Allow game launch? », et ses scores ne vont plus aux classements. Le dossier de Steam choisi à
// la main passe donc toujours par Steam (pickPinballFx3Install). Pas encore essayé sur une borne :
// une autre copie peut exiger Steam et refuser de s'ouvrir ; c'est le jeu qui en décide.
//
// Limite tenue : Cyber Pinball lance l'exécutable tel qu'il est installé. Il n'écrit rien dans le
// dossier du jeu (ni steam_appid.txt, ni DLL), ne remplace ni ne modifie aucun fichier, et ne promet
// jamais qu'une table non achetée s'ouvrira.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { writeFileAtomic } from './atomicwrite';
import { samePath } from './fileops';
import { t } from './i18n';
import { isWilliamsPinballFx3, pinballFx3Command, pinballFx3InstalledTables, pinballFx3Table, type PinballFx3Install } from './pinballfx3';

/** Exécutables du jeu : le nom d'avril 2026 d'abord, puis l'ancien. */
export const PINBALLFX3_EXE_NAMES = ['Pinball FX Classic.exe', 'Pinball FX3.exe'] as const;
/** Dossier du jeu choisi à la main, dans le dossier des données de Cyber Pinball. */
export const PINBALLFX3_FOLDER_FILE = 'pinball-fx3.json';

const BOM = new RegExp(`^${String.fromCharCode(0xfeff)}`);

/** Pourquoi un dossier choisi ne convient pas. */
export type PinballFx3FolderProblem = 'absent' | 'no-exe' | 'no-tables';

export type PinballFx3FolderCheck = { ok: true; install: PinballFx3Install } | { ok: false; problem: PinballFx3FolderProblem; dir: string };

const isExeName = (name: string) => PINBALLFX3_EXE_NAMES.some((n) => n.toLowerCase() === name.toLowerCase());

function isDir(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/** Exécutable du jeu dans ce dossier, s'il y est. */
function exeIn(dir: string): string | undefined {
  for (const name of PINBALLFX3_EXE_NAMES) {
    const exe = path.join(dir, name);
    try {
      if (fs.statSync(exe).isFile()) return exe;
    } catch {
      // Pas ce nom-là.
    }
  }
  return undefined;
}

/**
 * Dossier du jeu à partir de ce que le joueur a choisi : l'exécutable, le dossier du jeu, son
 * dossier data ou data\steam, ou le dossier qui contient le jeu (un seul sous-dossier avec
 * l'exécutable, comme « Games\PinballFX3\<nom du jeu> »).
 */
function gameDirOf(chosen: string): string | undefined {
  const at = path.resolve(chosen);
  if (isExeName(path.basename(at))) return exeIn(path.dirname(at)) ? path.dirname(at) : undefined;
  if (exeIn(at)) return at;
  const base = path.basename(at).toLowerCase();
  const parent = path.dirname(at);
  if (base === 'data' && exeIn(parent)) return parent;
  if (base === 'steam' && path.basename(parent).toLowerCase() === 'data' && exeIn(path.dirname(parent))) return path.dirname(parent);
  let children: string[];
  try {
    children = fs.readdirSync(at, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => path.join(at, d.name));
  } catch {
    return undefined;
  }
  const found = children.filter((c) => exeIn(c));
  return found.length === 1 ? found[0] : undefined;
}

/**
 * Vérifie un dossier choisi : l'exécutable du jeu, et des tables dans data\steam. Rien n'est écrit,
 * ni ici ni dans le dossier du jeu.
 */
export function checkPinballFx3Folder(chosen: string): PinballFx3FolderCheck {
  const dir = path.resolve(chosen);
  if (!fs.existsSync(dir)) return { ok: false, problem: 'absent', dir };
  const gameDir = gameDirOf(dir);
  const exe = gameDir ? exeIn(gameDir) : undefined;
  if (!gameDir || !exe) return { ok: false, problem: 'no-exe', dir };
  const tablesDir = path.join(gameDir, 'data', 'steam');
  if (!isDir(tablesDir) || pinballFx3InstalledTables({ tablesDir }).length === 0) return { ok: false, problem: 'no-tables', dir: gameDir };
  return { ok: true, install: { store: 'folder', gameDir, launcher: exe, tablesDir } };
}

/** Dossier du jeu gardé, s'il y en a un (fichier absent ou illisible : aucun). */
export function readPinballFx3Folder(dataDir: string): string | undefined {
  try {
    // Un fichier retouché à la main (Bloc-notes, PowerShell 5.1) commence souvent par une marque d'ordre des octets.
    const text = fs.readFileSync(path.join(dataDir, PINBALLFX3_FOLDER_FILE), 'utf8').replace(BOM, '');
    const parsed = JSON.parse(text) as { gameDir?: unknown };
    return typeof parsed.gameDir === 'string' && parsed.gameDir.trim() ? parsed.gameDir : undefined;
  } catch {
    return undefined;
  }
}

/** Garde le dossier du jeu ; undefined : l'oublie (retour au jeu de Steam). */
export function writePinballFx3Folder(dataDir: string, gameDir: string | undefined): void {
  fs.mkdirSync(dataDir, { recursive: true });
  writeFileAtomic(path.join(dataDir, PINBALLFX3_FOLDER_FILE), JSON.stringify(gameDir ? { gameDir } : {}, null, 2) + '\n');
}

/** Le dossier choisi à la main et ce qu'il vaut aujourd'hui (un disque débranché depuis, par exemple). */
export interface PinballFx3Chosen {
  dir: string;
  install?: PinballFx3Install;
  problem?: PinballFx3FolderProblem;
}

/** Le dossier gardé, vérifié de nouveau à chaque appel ; undefined : aucun dossier choisi. */
export function chosenPinballFx3(dataDir: string): PinballFx3Chosen | undefined {
  const dir = readPinballFx3Folder(dataDir);
  if (!dir) return undefined;
  const check = checkPinballFx3Folder(dir);
  return check.ok ? { dir, install: check.install } : { dir, problem: check.problem };
}

/**
 * Jeu à lancer : le dossier choisi s'il convient, sauf s'il est celui de Steam (lancé directement,
 * Steam demanderait une confirmation à chaque partie) ; sinon le jeu de Steam. Sans dossier choisi,
 * exactement le jeu de Steam.
 */
export function pickPinballFx3Install(steam: PinballFx3Install | undefined, chosen: PinballFx3Chosen | undefined): PinballFx3Install | undefined {
  if (chosen?.install && !(steam && samePath(steam.gameDir, chosen.install.gameDir))) return chosen.install;
  return steam;
}

/**
 * Lancement direct par l'exécutable du dossier choisi : « -offline [-class] -table_<nom> », dans le
 * dossier du jeu. `-class` pour les tables Williams et Bally (mode classique), sauf `classic: false`.
 * Un nom qui passerait mal (espace, guillemet, autre argument) est refusé.
 */
export function pinballFx3DirectCommand(install: Pick<PinballFx3Install, 'launcher' | 'gameDir'>, name: string, opts: { classic?: boolean } = {}): { file: string; args: string[]; cwd: string } {
  if (!pinballFx3Table(name)) throw new Error(`Nom de table de Pinball FX3 refusé : « ${name} »`); // i18n-ignore : erreur interne
  const classic = (opts.classic ?? true) && isWilliamsPinballFx3(name);
  return { file: install.launcher, args: ['-offline', ...(classic ? ['-class'] : []), `-table_${name}`], cwd: install.gameDir };
}

/** Commande d'une partie : par Steam, ou par l'exécutable du dossier choisi. */
export function pinballFx3LaunchCommand(install: PinballFx3Install, name: string): { file: string; args: string[]; cwd?: string } {
  return install.store === 'folder' ? pinballFx3DirectCommand(install, name) : pinballFx3Command(install, name);
}

/** Ce qui ne va pas dans un dossier choisi, pour le joueur. */
export function pinballFx3FolderProblemText(problem: PinballFx3FolderProblem, dir: string): string {
  const game = 'Pinball FX3';
  switch (problem) {
    case 'absent':
      return t('« {dir} » est introuvable (disque débranché, dossier déplacé ?).', { dir });
    case 'no-exe':
      return t('« {dir} » : ni « Pinball FX Classic.exe » ni « Pinball FX3.exe » ici. Choisissez le dossier qui contient l’exécutable de {game}.', { dir, game });
    case 'no-tables':
      return t('« {dir} » : l’exécutable est là, mais aucune table dans son dossier data\\steam.', { dir });
  }
}

/** La raison seule, sous une ligne qui montre déjà le dossier. */
export function pinballFx3FolderProblemReason(problem: PinballFx3FolderProblem): string {
  switch (problem) {
    case 'absent':
      return t('introuvable (disque débranché, dossier déplacé ?)');
    case 'no-exe':
      return t('ni « Pinball FX Classic.exe » ni « Pinball FX3.exe » ici');
    case 'no-tables':
      return t('aucune table dans son dossier data\\steam');
  }
}

/**
 * Indication quand le jeu lancé depuis le dossier choisi n'a pas ouvert la table : le jeu décide
 * s'il demande Steam ; le mode borne et l'achat des tables restent nécessaires. Jamais de promesse.
 */
export function pinballFx3DirectFailureHint(gameDir: string): string {
  const game = 'Pinball FX3';
  return t('{game} a été lancé depuis le dossier choisi ({dir}), sans passer par Steam. S’il exige Steam, il refuse de s’ouvrir ainsi : « Oublier ce dossier » (Ajouter une table > Tables de {game}) revient au jeu de Steam. Sinon, vérifiez que le mode borne est activé dans le jeu et que la table est achetée sur votre compte.', { game, dir: gameDir });
}
