// Sons qu'une table a déjà, pour en faire sa musique ou son son de lancement (fiche >
// « Médias du jeu » > Musique ou Son de lancement > « Sons de la table ») : fichiers son
// et vidéos qui ont une piste son, rangés par dossier. Le PuP-Pack en a souvent des
// dizaines (musiques, annonces, vidéos d'introduction), que VPinMediaDB n'a pas.
//
// Une table dans son propre dossier : tout le dossier, sauf les copies de sauvegarde et
// les options d'un pack (SPARE_FOLDER). Une table du dossier commun des tables : seulement
// ses médias (medias\, fichiers à son nom), le reste du dossier est aux autres tables.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { MUSIC_FOLDER, SPARE_FOLDER } from './mediachoices';
import { mediaKind, tableMediaDir } from './medias';
import { MP4_VIDEO_EXTENSIONS, mp4Sound } from './mp4audio';
import { isJunkName } from './puppack';
import type { TableEntry } from './tables';

export interface TableSound {
  file: string;
  /** Fichier son, ou vidéo dont seul le son servira. */
  kind: 'audio' | 'video';
  bytes: number;
  /** Durée de la piste son d'une vidéo, en secondes (inconnue pour un fichier son). */
  seconds?: number;
}

export interface TableSoundFolder {
  dir: string;
  /** Chemin dans le dossier de la table (« pupvideos\gotg_2020\Topper ») ; vide : le dossier lui-même. */
  rel: string;
  /** Nom de dossier de musique (Music, Songs, Topper…) : montré en premier. */
  music: boolean;
  /** Dossier des médias du menu (medias\). */
  medias: boolean;
  files: TableSound[];
}

export interface TableSoundsOptions {
  /** Dossier commun des tables : une table qui y est rangée n'a pas de dossier à elle. */
  tablesDir: string;
  /** Profondeur des sous-dossiers parcourus. */
  depth?: number;
  /** Au-delà, le parcours s'arrête : un dossier de table ordinaire en a bien moins. */
  maxEntries?: number;
}

/** Fichier vide de PuP-Pack (« @blank.mp4 », « 30 Second Blank Mp3.mp3 ») : rien à entendre. */
const BLANK = /(^|[^a-z])blank([^a-z]|$)/i;

const compare = (a: string, b: string) => a.localeCompare(b, 'fr', { numeric: true, sensitivity: 'base' });

/** Sons de la table, par dossier : dossiers de musique d'abord, puis medias\, puis les autres. */
export function tableSounds(table: TableEntry, opts: TableSoundsOptions): TableSoundFolder[] {
  const own = path.resolve(table.folder).toLowerCase() !== path.resolve(opts.tablesDir).toLowerCase();
  const mediaDir = path.resolve(tableMediaDir(table)).toLowerCase();
  const base = path.basename(table.file).replace(/\.vpx$/i, '').toLowerCase();
  const maxDepth = opts.depth ?? 5;
  let budget = opts.maxEntries ?? 20_000;
  const folders = new Map<string, TableSoundFolder>();

  const visit = (dir: string, depth: number) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const d of entries.sort((a, b) => compare(a.name, b.name))) {
      if (--budget < 0) return;
      if (isJunkName(d.name) || d.name.startsWith('.')) continue;
      const file = path.join(dir, d.name);
      if (d.isDirectory()) {
        if (depth < maxDepth && !SPARE_FOLDER.test(d.name)) visit(file, depth + 1);
        continue;
      }
      if (!d.isFile() || BLANK.test(d.name.replace(/\.[^.]+$/, ''))) continue;
      if (!own && !d.name.toLowerCase().includes(base)) continue;
      const sound = soundFile(file);
      if (!sound) continue;
      const rel = path.relative(table.folder, dir);
      let folder = folders.get(dir.toLowerCase());
      if (!folder) {
        folder = { dir, rel, music: MUSIC_FOLDER.test(path.basename(dir)) && rel !== '', medias: path.resolve(dir).toLowerCase() === mediaDir, files: [] };
        folders.set(dir.toLowerCase(), folder);
      }
      folder.files.push(sound);
    }
  };
  visit(own ? table.folder : tableMediaDir(table), 0);
  const rank = (f: TableSoundFolder) => (f.music ? 0 : f.medias ? 1 : 2);
  return [...folders.values()].sort((a, b) => rank(a) - rank(b) || compare(a.rel, b.rel));
}

/** Un fichier son, ou une vidéo MP4 dont la piste son est lisible par le menu. */
function soundFile(file: string): TableSound | undefined {
  let bytes: number;
  try {
    bytes = fs.statSync(file).size;
  } catch {
    return undefined;
  }
  if (!bytes) return undefined;
  if (mediaKind(file) === 'audio') return { file, kind: 'audio', bytes };
  const ext = path.extname(file).slice(1).toLowerCase();
  if (!(MP4_VIDEO_EXTENSIONS as readonly string[]).includes(ext)) return undefined;
  const sound = mp4Sound(file);
  return sound?.playable ? { file, kind: 'video', bytes, seconds: sound.seconds } : undefined;
}
