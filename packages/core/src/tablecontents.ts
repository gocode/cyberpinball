// Fichiers d'une table, un par un, pour la section « Fichiers » de la fiche : ce que
// contient le dossier de la table (organisation « un dossier par table » de VPX 10.8.1,
// tablefiles.ts), chaque fichier avec sa sorte, sa taille, son dossier et son état —
// chargé par VPX ou non, lien vers la bibliothèque de ROM, attendu mais absent.
// Les dossiers qu'on range d'un bloc (un PuP-Pack, des sons alternatifs, les médias)
// sont une seule entrée, avec leur nombre de fichiers.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { t } from './i18n';
import { isJunkName } from './puppack';
import { romFile, sameRomFile, storedRom } from './romlibrary';
import { classifyDir, classifyFile, companion, type FileKind } from './tablefiles';

export type TableFileState = 'ok' | 'info' | 'warning' | 'error' | 'quiet';

export interface TableFileEntry {
  kind: FileKind;
  /** Chemin relatif au dossier de la table : « pinmame\roms\t2_l8.zip ». */
  rel: string;
  name: string;
  /** Chemin complet (celui qu'aurait le fichier, pour une entrée absente). */
  path: string;
  dir: boolean;
  /** Octets (dossier : tout son contenu). */
  size: number;
  /** Dossier : nombre de fichiers dedans. */
  files?: number;
  mtimeMs?: number;
  state: TableFileState;
  /** Ce qu'il faut en savoir : « chargé par VPX avec cette table », « mal nommé : … ». */
  note: string;
  /** ROM : fichier de la bibliothèque qu'elle partage (lien physique) ou qu'elle double. */
  library?: string;
  /** Attendu (par le script) mais absent du dossier. */
  missing?: boolean;
}

export interface TableContents {
  entries: TableFileEntry[];
  /** Fichiers sur le disque (ceux des dossiers rangés d'un bloc compris). */
  files: number;
  size: number;
  /** Entrées à vérifier (état warning ou error). */
  problems: number;
}

export interface TableContentsOptions {
  /** La table a son propre dossier (sinon, seuls ses fichiers compagnons sont à elle). */
  ownFolder: boolean;
  /** Bibliothèque de ROM (<racine>\pinmame\roms). */
  romLibrary?: string;
  /** Script lu : ROM qu'il demande (au choix), s'il utilise PinMAME, dossier DMD qu'il charge. */
  script?: { usesPinmame: boolean; roms: string[]; dmdFolder?: string };
}

/** Ordre des sortes dans la liste : ce qui fait jouer la table d'abord. */
const ORDER: FileKind[] = ['table', 'backglass', 'rom', 'nvram', 'pinmame', 'pup', 'serum', 'vni', 'altsound', 'dmdFolder', 'music', 'pov', 'tableIni', 'scriptOverride', 'script', 'media', 'info', 'user', 'doc', 'other'];

export function tableContents(tableFile: string, opts: TableContentsOptions): TableContents {
  const folder = path.dirname(tableFile);
  const base = path.basename(tableFile).replace(/\.vpx$/i, '');
  const entries: TableFileEntry[] = [];
  const lower = (s: string) => s.toLowerCase();
  const backglass = companion(folder, base, opts.ownFolder, '.directb2s');
  const wanted = opts.script?.usesPinmame ? opts.script.roms : [];
  const versions = listDirents(folder).filter((d) => d.isFile() && lower(d.name).endsWith('.vpx')).map((d) => lower(d.name.replace(/\.vpx$/i, '')));
  const add = (e: Omit<TableFileEntry, 'name' | 'path'> & { name?: string }) => {
    const p = path.join(folder, e.rel);
    entries.push({ ...e, name: e.name ?? path.basename(e.rel), path: p });
  };
  const fileEntry = (rel: string, kind: FileKind, state: TableFileState, note: string, extra: Partial<TableFileEntry> = {}) => {
    const st = statSafe(path.join(folder, rel));
    add({ kind, rel, dir: false, size: st?.size ?? 0, mtimeMs: st?.mtimeMs, state, note, ...extra });
  };
  const dirEntry = (rel: string, kind: FileKind, state: TableFileState, note: string) => {
    const { files, size, mtimeMs } = dirStats(path.join(folder, rel));
    add({ kind, rel, dir: true, size, files, mtimeMs, state, note });
  };
  const sameBase = (name: string) => lower(name.replace(/\.[^.]+$/, '')) === lower(base);

  // Fichiers à la racine du dossier.
  for (const d of listDirents(folder)) {
    if (isJunkName(d.name)) continue;
    const name = d.name;
    if (!d.isFile()) continue;
    if (!opts.ownFolder && !sameBase(name)) continue;
    if (['crash.txt', 'crash.dmp'].includes(lower(name))) {
      fileEntry(name, 'other', 'warning', t('rapport de plantage laissé par VPX'));
      continue;
    }
    const kind = classifyFile(name);
    if (kind === 'ignored') continue;
    switch (kind) {
      case 'table':
        fileEntry(name, kind, sameBase(name) ? 'ok' : 'quiet', sameBase(name) ? t('cette table') : t('autre version du dossier'));
        break;
      case 'backglass':
        if (backglass && lower(path.basename(backglass)) === lower(name)) fileEntry(name, kind, 'ok', t('chargé par VPX avec cette table'));
        else if (versions.includes(lower(name.replace(/\.directb2s$/i, '')))) fileEntry(name, kind, 'quiet', t('fronton d’une autre version du dossier'));
        else fileEntry(name, kind, 'warning', t('mal nommé : VPX ne le chargera pas (il doit porter le nom de la table)'));
        break;
      case 'rom':
        fileEntry(name, kind, 'warning', t('ROM hors de pinmame\\roms : PinMAME ne la trouvera pas ici'));
        break;
      case 'tableIni':
        fileEntry(name, kind, sameBase(name) ? 'ok' : 'quiet', sameBase(name) ? t('réglages propres à cette table') : t('réglages d’une autre version'));
        break;
      case 'script':
        if (sameBase(name)) fileEntry(name, 'scriptOverride', 'warning', t('remplace le script écrit dans la table'));
        else fileEntry(name, kind, 'quiet', t('script complémentaire'));
        break;
      case 'pov':
        fileEntry(name, kind, 'ok', t('point de vue de la caméra'));
        break;
      case 'info':
        fileEntry(name, kind, 'quiet', t('informations notées par Cyber Pinball'));
        break;
      case 'music':
        fileEntry(name, kind, 'quiet', t('son hors du dossier music'));
        break;
      case 'serum':
      case 'vni':
        fileEntry(name, kind, 'warning', t('couleurs du DMD hors de leur dossier : elles ne seront pas chargées'));
        break;
      case 'doc':
        fileEntry(name, kind, 'quiet', t('documentation'));
        break;
      default:
        fileEntry(name, kind, 'quiet', t('autre fichier'));
    }
  }

  // Dossiers de la table.
  if (opts.ownFolder) {
    const dmd = opts.script?.dmdFolder;
    for (const d of listDirents(folder)) {
      if (!d.isDirectory() || isJunkName(d.name)) continue;
      const name = d.name;
      const ln = lower(name);
      const full = path.join(folder, name);
      if (ln === 'pinmame') {
        pinmame(full, name);
        continue;
      }
      if (['pupvideos', 'altsound', 'serum', 'vni'].includes(ln)) {
        const kind: FileKind = ln === 'pupvideos' ? 'pup' : (ln as FileKind);
        const note = ln === 'pupvideos' ? t('PuP-Pack') : ln === 'altsound' ? t('sons alternatifs') : t('couleurs du DMD');
        for (const sub of listDirents(full).filter((s) => s.isDirectory() && !isJunkName(s.name))) dirEntry(path.join(name, sub.name), kind, 'ok', note);
        continue;
      }
      if (ln === 'music') {
        for (const f of walkFiles(full)) fileEntry(path.join(name, f), 'music', 'ok', t('musique de la table'));
        continue;
      }
      const kind = classifyDir(name, full, [], dmd ? [dmd] : []);
      if (kind === 'ignored') continue;
      if (kind === 'dmdFolder') dirEntry(name, kind, 'ok', dmd && lower(dmd) === ln ? t('chargé par le script de la table') : t('contenu FlexDMD / UltraDMD'));
      else if (kind === 'media') dirEntry(name, kind, 'ok', t('médias du menu'));
      else if (kind === 'user') dirEntry(name, kind, 'quiet', t('données enregistrées par VPX'));
      else if (kind === 'pup') dirEntry(name, kind, 'warning', t('PuP-Pack hors de pupvideos : il ne sera pas chargé'));
      else if (kind === 'altsound') dirEntry(name, kind, 'warning', t('sons alternatifs hors de leur dossier : ils ne seront pas chargés'));
      else if (kind === 'music') dirEntry(name, kind, 'ok', t('musique de la table'));
      else if (kind === 'script') dirEntry(name, kind, 'quiet', t('scripts complémentaires'));
      else dirEntry(name, 'other', 'quiet', t('autre dossier'));
    }
    // Attendus par le script mais absents.
    if (dmd && !listDirents(folder).some((d) => d.isDirectory() && lower(d.name) === lower(dmd))) {
      add({ kind: 'dmdFolder', rel: dmd, dir: true, size: 0, state: 'error', note: t('absent : le script de la table le charge'), missing: true });
    }
  }
  const roms = entries.filter((e) => e.kind === 'rom' && !e.missing).map((e) => lower(e.name));
  if (opts.ownFolder && wanted.length && !wanted.some((r) => roms.includes(`${lower(r)}.zip`))) {
    add({ kind: 'rom', rel: path.join('pinmame', 'roms', `${wanted[0]}.zip`), dir: false, size: 0, state: 'error', note: t('absente : la table ne démarre pas sans elle'), missing: true });
  }

  function pinmame(dir: string, rel: string): void {
    for (const d of listDirents(dir)) {
      if (isJunkName(d.name)) continue;
      const sub = path.join(rel, d.name);
      const ln = lower(d.name);
      if (d.isDirectory() && ln === 'roms') {
        for (const f of listDirents(path.join(dir, d.name)).filter((x) => x.isFile() && !isJunkName(x.name))) rom(path.join(sub, f.name), f.name);
      } else if (d.isDirectory() && ln === 'nvram') {
        for (const f of walkFiles(path.join(dir, d.name))) fileEntry(path.join(sub, f), 'nvram', 'quiet', t('sauvegarde de PinMAME (scores, réglages du jeu)'));
      } else if (d.isDirectory()) dirEntry(sub, 'pinmame', 'quiet', t('réglages de PinMAME'));
      else fileEntry(sub, 'pinmame', 'quiet', t('réglages de PinMAME'));
    }
  }

  function rom(rel: string, name: string): void {
    if (!lower(name).endsWith('.zip')) return fileEntry(rel, 'pinmame', 'quiet', t('fichier de PinMAME'));
    const here = romFile(path.join(folder, rel));
    const stored = opts.romLibrary ? storedRom(opts.romLibrary, name) : undefined;
    const asked = wanted.some((r) => lower(`${r}.zip`) === lower(name));
    const why = asked ? t(' · demandée par le script') : '';
    if (here && stored && sameRomFile(here, stored)) return fileEntry(rel, 'rom', 'ok', t('lien vers la bibliothèque de ROM') + why, { library: stored.path });
    if (stored) return fileEntry(rel, 'rom', 'info', t('copie à part : la bibliothèque a aussi cette ROM') + why, { library: stored.path });
    return fileEntry(rel, 'rom', 'ok', t('propre à la table, pas dans la bibliothèque') + why);
  }

  const rank = (k: FileKind) => (ORDER.indexOf(k) < 0 ? ORDER.length : ORDER.indexOf(k));
  const weight = (e: TableFileEntry) => (e.missing ? 0 : e.state === 'ok' && e.kind === 'table' ? 1 : 2);
  entries.sort((a, b) => rank(a.kind) - rank(b.kind) || weight(a) - weight(b) || a.rel.localeCompare(b.rel, 'en', { numeric: true, sensitivity: 'base' }));
  return {
    entries,
    files: entries.reduce((n, e) => n + (e.missing ? 0 : e.dir ? (e.files ?? 0) : 1), 0),
    size: entries.reduce((n, e) => n + e.size, 0),
    problems: entries.filter((e) => e.state === 'warning' || e.state === 'error').length,
  };
}

function listDirents(dir: string): fs.Dirent[] {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

function statSafe(p: string): fs.Stats | undefined {
  try {
    return fs.statSync(p);
  } catch {
    return undefined;
  }
}

/** Fichiers d'un dossier et de ses sous-dossiers, en chemins relatifs à lui. */
function walkFiles(dir: string): string[] {
  try {
    return fs
      .readdirSync(dir, { recursive: true, withFileTypes: true })
      .filter((d) => d.isFile() && !isJunkName(d.name))
      .map((d) => path.relative(dir, path.join(d.parentPath, d.name)))
      .sort((a, b) => a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' }));
  } catch {
    return [];
  }
}

function dirStats(dir: string): { files: number; size: number; mtimeMs?: number } {
  let files = 0;
  let size = 0;
  let mtimeMs: number | undefined;
  try {
    for (const d of fs.readdirSync(dir, { recursive: true, withFileTypes: true })) {
      if (!d.isFile()) continue;
      const st = statSafe(path.join(d.parentPath, d.name));
      files++;
      size += st?.size ?? 0;
      if (st && (mtimeMs === undefined || st.mtimeMs > mtimeMs)) mtimeMs = st.mtimeMs;
    }
  } catch {
    // Dossier illisible : vide.
  }
  return { files, size, mtimeMs };
}
