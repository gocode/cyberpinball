// Une opération sur les fichiers refusée par Windows, dite à l'écran en une phrase : quel fichier, pourquoi, et quoi
// faire. Le 19/11/2026, mettre une table à la corbeille pendant qu'un de ses fichiers était ouvert ailleurs (EPERM sur
// le renommage du dossier) laissait une vingtaine d'« exception non rattrapée » au journal, une par appui, et rien à
// l'écran. Toute action du front-end qui touche aux fichiers passe désormais par là (library.ts, runAction).

import * as path from 'node:path';
import { formatList, t } from './i18n';

/** Une erreur de Node sur un fichier (code, chemin). */
interface FsError {
  code?: string;
  path?: string;
  dest?: string;
  message?: string;
}

/** L'erreur vient-elle d'un fichier tenu par un autre programme (renommage, suppression refusés) ? */
export function isFileLocked(error: unknown): boolean {
  const code = (error as FsError | undefined)?.code;
  return code === 'EPERM' || code === 'EBUSY' || code === 'EACCES';
}

/**
 * Ce que l'écran dit d'une opération refusée. `holders` : les programmes qui tiennent le fichier, quand Windows sait le
 * dire (fileHolders de win-displays).
 */
export function fileErrorText(error: unknown, holders: readonly string[] = []): string {
  const e = (error ?? {}) as FsError;
  const name = e.path ? path.basename(e.path) : undefined;
  if (isFileLocked(error)) {
    if (holders.length) return t('« {name} » est ouvert dans {programs} : ferme-le, puis réessaie.', { name: name ?? '?', programs: formatList(holders) });
    return t('« {name} » est ouvert par un autre programme (VPX, un lecteur vidéo, l’Explorateur de fichiers…) : ferme-le, puis réessaie.', { name: name ?? '?' });
  }
  if (e.code === 'ENOSPC') return t('Le disque est plein : libère de la place, puis réessaie.');
  if (e.code === 'ENOENT') return t('« {name} » n’existe plus : la liste va se mettre à jour.', { name: name ?? '?' });
  return t('L’opération n’a pas pu se faire : {message}', { message: e.message ?? String(error) });
}
