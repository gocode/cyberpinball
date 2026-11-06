// PuP-Pack désactivé, table par table : la table se joue exactement comme si son pack
// n'était pas installé, et la réactivation le rend à l'identique.
//
// Mécanisme : le dossier du pack quitte <table>\pupvideos pour un dossier frère réservé,
// <table>\pupvideos (off)\<pack>, par un seul renommage (renameWithRetry : fs.renameSync,
// réessayé tant que Windows répond « occupé ») dans le même dossier, donc sur le même volume :
// instantané même pour des Go, atomique, sans copie ni fusion (applyOps 'move' fusionnerait
// deux dossiers et recopierait d'un volume à l'autre).
// Le plugin PUP de VPX 10.8.1 ne cherche le pack que sous le nom exact <table>\pupvideos\<nom>
// puis <PUPFolder>\pupvideos\<nom> (PUPManager.cpp l. 120-159 au commit af26b2d93, casse
// ignorée) ; il ne liste jamais le dossier de la table. PinUP Popper ne lit que
// PinUPSystem\PUPVideos. Un pack rangé ailleurs n'est donc vu par personne : pour la partie,
// c'est un pack absent, cas que le plugin traite déjà (B2SInit ne trouve rien, le script
// continue, docs/recherche/pup-packs.md § 3.1).
//
// L'état n'est écrit nulle part ailleurs que sur le disque : un pack est désactivé quand son
// dossier est dans pupvideos (off) et pas dans pupvideos. Une application arrêtée entre
// deux renommages laisse chaque pack entier, d'un côté ou de l'autre ; le .vbs de Cyber Pinball
// est remis d'accord avant chaque partie par le médecin (PUP_PLAY_REPAIRS, pupPackDisabledScript).
//
// Tout code qui nomme le dossier pupvideos d'une table passe par ce module (PUP_FOLDER,
// pupVideosDir, isPupFolderName) : le test pupdisabled.test.ts le vérifie dans les sources.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { renameWithRetry } from './atomicwrite';
import { applyOps, type OpContext } from './fileops';
import { t } from './i18n';
import { isJunkName } from './puppack';

/** Dossier des PuP-Packs à côté de la table, celui que lit le plugin PUP. */
export const PUP_FOLDER = 'pupvideos';
/**
 * Dossier frère des packs désactivés : ni le plugin PUP ni PinUP Popper ne le lisent. Nom en
 * ASCII, choisi quand fs.cpSync de Node 22 écrivait encore un chemin accentué en « Ã© » (vu le
 * 06/11/2026) ; les copies passent désormais par copyTree (copytree.ts), saine, mais ce nom est
 * déjà sur les bornes et reste.
 */
export const PUP_DISABLED_FOLDER = 'pupvideos (off)'; // i18n-ignore : nom de dossier

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** Dossier de PuP-Packs d'une table, actif ou désactivé : jamais des médias, jamais un dossier égaré. */
export function isPupFolderName(name: string): boolean {
  return same(name, PUP_FOLDER) || same(name, PUP_DISABLED_FOLDER);
}

/** Dossier des packs désactivés. */
export function isDisabledPupFolderName(name: string): boolean {
  return same(name, PUP_DISABLED_FOLDER);
}

function dirents(dir: string): fs.Dirent[] {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

function child(folder: string, name: string): string | undefined {
  const found = dirents(folder).find((d) => d.isDirectory() && same(d.name, name));
  return found ? path.join(folder, found.name) : undefined;
}

function subdirs(dir: string | undefined): string[] {
  return dir ? dirents(dir).filter((d) => d.isDirectory() && !isJunkName(d.name)).map((d) => d.name) : [];
}

/** <table>\pupvideos tel qu'il est écrit sur le disque, s'il existe. */
export function pupVideosDir(folder: string): string | undefined {
  return child(folder, PUP_FOLDER);
}

/** <table>\pupvideos (off), s'il existe. */
export function disabledPupDir(folder: string): string | undefined {
  return child(folder, PUP_DISABLED_FOLDER);
}

/** Packs que le plugin peut charger : les dossiers de pupvideos. */
export function activePacks(folder: string): string[] {
  return subdirs(pupVideosDir(folder));
}

/** Packs désactivés : ceux de pupvideos (off) qu'aucun dossier du même nom ne remplace dans pupvideos. */
export function disabledPacks(folder: string): string[] {
  const active = activePacks(folder);
  return subdirs(disabledPupDir(folder)).filter((n) => !active.some((a) => same(a, n)));
}

/**
 * Packs d'une table parmi `names` (rangés dans son dossier) : tous si elle est seule dans son
 * dossier, ou si l'on ne sait pas lequel elle charge (script pas lu, pack lancé par Cyber
 * Pinball sans nom) ; sinon ceux qui portent un nom qu'elle charge (expectedPackNames).
 */
export function packsOfTable(names: readonly string[], expected: readonly string[] | undefined, alone: boolean): string[] {
  if (alone || !expected?.length) return [...names];
  return names.filter((n) => expected.some((e) => same(e, n)));
}

/** Une table du même dossier, et les noms de pack qu'elle charge ; undefined : son script n'est pas lu. */
export interface FolderTable {
  file: string;
  title: string;
  expected?: readonly string[];
}

/**
 * Autres tables du dossier que touche le changement de ces packs : pupvideos est commun à tout
 * le dossier. Celles qui chargent l'un d'eux, et celles dont on ne sait pas lequel elles chargent.
 */
export function tablesSharingPacks(packs: readonly string[], others: readonly FolderTable[]): FolderTable[] {
  return others.filter((o) => !o.expected?.length || o.expected.some((e) => packs.some((p) => same(p, e))));
}

/** Ce qu'on peut faire du PuP-Pack d'une table : ses packs actifs, ses packs désactivés, les tables qui les partagent. */
export interface TablePupSwitch {
  /** Packs de la table dans pupvideos : « Désactiver le PuP-Pack ». */
  active: string[];
  /** Packs de la table dans pupvideos (off) : « Réactiver le PuP-Pack ». */
  disabled: string[];
  /** Autres tables du dossier que le changement touche (pupvideos est commun au dossier). */
  shared: FolderTable[];
}

/**
 * Packs de la table, d'après ce que charge son script (`expected`, expectedPackNames ; undefined
 * s'il n'est pas lu) et les autres tables de son dossier.
 */
export function tablePupSwitch(folder: string, expected: readonly string[] | undefined, others: readonly FolderTable[]): TablePupSwitch {
  const alone = others.length === 0;
  const active = packsOfTable(activePacks(folder), expected, alone);
  const disabled = packsOfTable(disabledPacks(folder), expected, alone);
  return { active, disabled, shared: tablesSharingPacks([...active, ...disabled], others) };
}

/**
 * Copies d'un pack dans le dossier PinUP Player réglé dans VPX ([Plugin.PUP] PUPFolder) : le
 * plugin les charge quand la table n'a pas le sien. Un pack désactivé dans la table y reste.
 */
export function globalPackCopies(pupFolder: string | undefined, names: readonly string[]): string[] {
  if (!pupFolder?.trim()) return [];
  const root = child(pupFolder.trim(), PUP_FOLDER);
  if (!root) return [];
  return subdirs(root)
    .filter((n) => names.some((m) => same(m, n)))
    .map((n) => path.join(root, n));
}

/** Ce qu'un changement a fait. */
export interface PupSwitchResult {
  /** Packs déplacés. */
  moved: string[];
  /** Packs laissés où ils sont, et pourquoi. */
  skipped: { pack: string; reason: string }[];
}

/**
 * Renomme les dossiers un par un ; au premier échec (un fichier ouvert par VPX ou l'Explorateur),
 * ceux déjà déplacés reviennent à leur place et l'erreur remonte : rien n'est à moitié fait.
 */
function renameAll(moves: { pack: string; from: string; to: string }[]): void {
  const done: typeof moves = [];
  try {
    for (const m of moves) {
      renameWithRetry(m.from, m.to);
      done.push(m);
    }
  } catch (error) {
    for (const m of done.reverse()) {
      try {
        renameWithRetry(m.to, m.from);
      } catch {
        // Le renommage inverse a échoué aussi : le pack reste entier, de l'autre côté.
      }
    }
    const failed = moves[done.length];
    throw new Error(t('{pack} n’a pas pu être déplacé ({message}) : rien n’a changé. Un fichier du pack est peut-être ouvert (VPX, l’Explorateur).', { pack: failed?.pack ?? '', message: (error as Error).message }));
  }
}

function removeIfEmpty(dir: string | undefined): void {
  if (!dir) return;
  try {
    if (!fs.readdirSync(dir).length) fs.rmdirSync(dir);
  } catch {
    // Dossier ouvert ailleurs : il reste, vide, sans effet.
  }
}

/**
 * Désactive ces packs de la table : leur dossier passe de pupvideos à pupvideos (off),
 * tel quel. Une ancienne copie désactivée du même nom part à la corbeille de Cyber Pinball
 * (le pack actif est le plus récent). pupvideos, vidé, est retiré.
 */
export function disablePupPacks(folder: string, packs: readonly string[], ops: OpContext): PupSwitchResult {
  const from = pupVideosDir(folder);
  const result: PupSwitchResult = { moved: [], skipped: [] };
  const moves: { pack: string; from: string; to: string }[] = [];
  for (const pack of packs) {
    const name = activePacks(folder).find((n) => same(n, pack));
    if (!from || !name) {
      result.skipped.push({ pack, reason: t('absent de pupvideos') });
      continue;
    }
    moves.push({ pack: name, from: path.join(from, name), to: '' });
  }
  if (!moves.length) return result;
  const target = disabledPupDir(folder) ?? path.join(folder, PUP_DISABLED_FOLDER);
  fs.mkdirSync(target, { recursive: true });
  for (const m of moves) {
    const old = subdirs(target).find((n) => same(n, m.pack));
    if (old) applyOps([{ op: 'trash', path: path.join(target, old) }], ops);
    m.to = path.join(target, m.pack);
  }
  renameAll(moves);
  result.moved = moves.map((m) => m.pack);
  removeIfEmpty(from);
  return result;
}

/**
 * Réactive ces packs : leur dossier revient dans pupvideos, tel quel. Un pack du même nom déjà
 * dans pupvideos (copié à la main depuis) l'emporte : la copie désactivée reste où elle est.
 */
export function enablePupPacks(folder: string, packs: readonly string[]): PupSwitchResult {
  const from = disabledPupDir(folder);
  const result: PupSwitchResult = { moved: [], skipped: [] };
  const moves: { pack: string; from: string; to: string }[] = [];
  const target = pupVideosDir(folder) ?? path.join(folder, PUP_FOLDER);
  for (const pack of packs) {
    const name = subdirs(from).find((n) => same(n, pack));
    if (!from || !name) {
      result.skipped.push({ pack, reason: t('absent de {folder}', { folder: PUP_DISABLED_FOLDER }) });
      continue;
    }
    if (activePacks(folder).some((n) => same(n, name))) {
      result.skipped.push({ pack: name, reason: t('un autre {pack} est déjà dans pupvideos : c’est lui que charge le plugin', { pack: name }) });
      continue;
    }
    moves.push({ pack: name, from: path.join(from, name), to: path.join(target, name) });
  }
  if (!moves.length) return result;
  fs.mkdirSync(target, { recursive: true });
  renameAll(moves);
  result.moved = moves.map((m) => m.pack);
  removeIfEmpty(from);
  return result;
}
