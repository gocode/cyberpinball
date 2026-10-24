// Erreurs de lecture des médias : l'affichage (tâche T2 du jalon « Habillage des
// écrans ») les enregistre quand Chromium refuse un fichier, le médecin les lit et
// les signale table par table. Conception : docs/recherche/medias.md, § 5.5.
//
// Fichier : <données>\logs\medias-erreurs.json, écrit par le seul processus
// principal (le rendu lui envoie l'erreur). Format, version 1 :
//
//   {
//     "version": 1,
//     "errors": [
//       {
//         "file": "D:\\CyberPinball\\tables\\T2 (Williams 1991)\\medias\\(Backglass) T2 (Williams 1991).mp4",
//         "type": "Backglass",            facultatif : type du média demandé
//         "role": "backglass",            facultatif : rôle (ou « audio ») qui le montrait
//         "kind": "decode",               voir MediaErrorKind
//         "message": "PIPELINE_ERROR_DECODE: …",   facultatif : MediaError.message, 300 caractères au plus
//         "size": 48211763,               taille du fichier au moment de l'erreur
//         "mtimeMs": 1792500000000.123,   date de modification au moment de l'erreur
//         "first": "2026-10-21T20:14:03.512Z",
//         "last": "2026-10-21T20:31:40.007Z",
//         "count": 3                      nombre d'erreurs sur ce fichier inchangé
//       }
//     ]
//   }
//
// Une entrée vaut pour le fichier tel qu'il était : dès que sa taille ou sa date
// change (fichier remplacé ou réencodé), ou qu'il disparaît, elle est périmée,
// ignorée par le médecin et retirée au prochain enregistrement.

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { MediaTarget, MediaType } from './medias';

export const MEDIA_ERRORS_FILE = 'medias-erreurs.json';

/** Entrées gardées au plus : les plus récentes. */
export const MAX_MEDIA_ERRORS = 200;

/**
 * Nature de l'erreur. Pour une vidéo ou un son, d'après MediaError.code :
 * 2 network (fichier illisible sur le disque, verrouillé), 3 decode (fichier
 * abîmé, codec non pris en charge en cours de lecture), 4 unsupported (format ou
 * codec refusé d'emblée). Pour une image : « image » (événement error de <img>).
 * 1 (MEDIA_ERR_ABORTED, lecture interrompue parce qu'on a changé de table) n'est
 * pas une erreur du fichier : elle n'est jamais enregistrée.
 */
export type MediaErrorKind = 'network' | 'decode' | 'unsupported' | 'image' | 'other';

export interface MediaErrorEntry {
  file: string;
  type?: MediaType;
  role?: MediaTarget;
  kind: MediaErrorKind;
  message?: string;
  size: number;
  mtimeMs: number;
  /** Dates ISO 8601 de la première et de la dernière erreur. */
  first: string;
  last: string;
  count: number;
}

export interface MediaErrorLog {
  version: 1;
  errors: MediaErrorEntry[];
}

/** Ce que l'affichage envoie au processus principal pour une erreur. */
export interface MediaErrorReport {
  file: string;
  type?: MediaType;
  role?: MediaTarget;
  /** MediaError.code d'une vidéo ou d'un son ; absent pour une image. */
  code?: number;
  /** true pour une image (<img>). */
  image?: boolean;
  message?: string;
}

/** <données>\logs\medias-erreurs.json. */
export function mediaErrorsFile(logsDir: string): string {
  return path.join(logsDir, MEDIA_ERRORS_FILE);
}

/** Nature d'une erreur ; undefined pour une lecture interrompue (code 1), à ne pas enregistrer. */
export function mediaErrorKind(report: Pick<MediaErrorReport, 'code' | 'image'>): MediaErrorKind | undefined {
  if (report.image) return 'image';
  switch (report.code) {
    case 1:
      return undefined;
    case 2:
      return 'network';
    case 3:
      return 'decode';
    case 4:
      return 'unsupported';
    default:
      return 'other';
  }
}

/** Entrées du fichier ; liste vide s'il est absent ou abîmé. */
export function readMediaErrors(file: string): MediaErrorEntry[] {
  try {
    const log = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<MediaErrorLog>;
    if (log.version !== 1 || !Array.isArray(log.errors)) return [];
    return log.errors.filter((e) => e && typeof e.file === 'string' && typeof e.size === 'number' && typeof e.mtimeMs === 'number');
  } catch {
    return [];
  }
}

/** L'entrée vaut encore : le fichier existe, avec la même taille et la même date. */
export function isCurrentMediaError(entry: MediaErrorEntry): boolean {
  try {
    const stat = fs.statSync(entry.file);
    return stat.isFile() && stat.size === entry.size && Math.abs(stat.mtimeMs - entry.mtimeMs) < 1;
  } catch {
    return false;
  }
}

/**
 * Enregistre une erreur (appelé par le processus principal, à chaque erreur reçue
 * de l'affichage). Même fichier inchangé : le compteur augmente. Les entrées
 * périmées sont retirées. Renvoie l'entrée écrite, ou undefined si rien n'est
 * enregistré (lecture interrompue, fichier disparu).
 */
export function recordMediaError(logFile: string, report: MediaErrorReport, now = new Date()): MediaErrorEntry | undefined {
  const kind = mediaErrorKind(report);
  if (!kind) return undefined;
  let stat: fs.Stats;
  try {
    stat = fs.statSync(report.file);
  } catch {
    return undefined;
  }
  const key = path.resolve(report.file).toLowerCase();
  const errors = readMediaErrors(logFile).filter(isCurrentMediaError);
  const previous = errors.find((e) => path.resolve(e.file).toLowerCase() === key);
  const when = now.toISOString();
  const entry: MediaErrorEntry = {
    file: path.resolve(report.file),
    ...(report.type ? { type: report.type } : {}),
    ...(report.role ? { role: report.role } : {}),
    kind,
    ...(report.message ? { message: report.message.slice(0, 300) } : {}),
    size: stat.size,
    mtimeMs: stat.mtimeMs,
    first: previous?.first ?? when,
    last: when,
    count: (previous?.count ?? 0) + 1,
  };
  const next = [entry, ...errors.filter((e) => e !== previous)].sort((a, b) => b.last.localeCompare(a.last)).slice(0, MAX_MEDIA_ERRORS);
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  const tmp = `${logFile}.tmp-${process.pid}`;
  const log: MediaErrorLog = { version: 1, errors: next };
  fs.writeFileSync(tmp, JSON.stringify(log, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, logFile);
  return entry;
}
