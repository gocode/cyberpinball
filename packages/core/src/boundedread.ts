// Lectures de fichiers de taille quelconque. Node refuse de lire d'un bloc un fichier de plus de
// 2 Gio (ERR_FS_FILE_TOO_LARGE : « File size (…) is greater than 2 GiB »), et un fichier moins gros
// mais lu en entier occupe autant de mémoire. Le 19/11/2026, un joueur qui reprenait son installation
// de plus de 600 tables a vu l'analyse s'arrêter sur ce message au bout d'une demi-heure : un .zip de
// 2,5 Go rangé avec ses tables, pris pour une ROM, était lu d'un bloc pour en tirer l'empreinte.
//
// Règle (lecture-bornee.test.ts) : un fichier que l'utilisateur a pu poser (table, archive, vidéo,
// image, fronton) ne se lit jamais d'un bloc. Son empreinte se calcule par morceaux (fileDigest), une
// partie se lit à sa place (readRange), et ce qui doit être lu en entier passe par readWholeFile,
// qui refuse au-delà d'une limite donnée avec un message clair. Une lecture d'un bloc qui reste
// (fichier de Cyber Pinball, toujours petit) dit pourquoi sa taille est bornée, en commentaire
// « lecture entière : <raison> » sur sa ligne ou celle du dessus.

import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { formatSize } from './fileops';
import { t } from './i18n';

/** Taille des morceaux lus pour une empreinte ou une comparaison. */
const CHUNK = 1024 * 1024;

/** Fichier trop gros pour ce qu'on voulait en faire (code EFBIG). */
export class FileTooBigError extends Error {
  readonly code = 'EFBIG';
  constructor(
    readonly file: string,
    readonly size: number,
    readonly max: number,
  ) {
    super(t('{file} pèse {size} : trop gros pour être lu en entier (au plus {max}).', { file: path.basename(file), size: formatSize(size), max: formatSize(max) }));
  }
}

/**
 * Le fichier entier, s'il ne dépasse pas `max` octets ; FileTooBigError sinon, avant toute lecture.
 * La limite est celle de ce qu'on lit (une image de fronton, une vidéo du DMD), jamais celle de Node.
 */
export function readWholeFile(file: string, max: number): Buffer {
  const size = fs.statSync(file).size;
  if (size > max) throw new FileTooBigError(file, size, max);
  // lecture entière : taille vérifiée juste au-dessus
  return fs.readFileSync(file);
}

/** `length` octets à partir de `start` (moins en fin de fichier). */
export function readRange(file: string, start: number, length: number): Buffer {
  const fd = fs.openSync(file, 'r');
  try {
    return readAt(fd, start, length);
  } finally {
    fs.closeSync(fd);
  }
}

/** `length` octets à partir de `start` dans un fichier ouvert (moins en fin de fichier). */
export function readAt(fd: number, start: number, length: number): Buffer {
  const buf = Buffer.alloc(length);
  let got = 0;
  while (got < length) {
    const n = fs.readSync(fd, buf, got, length - got, start + got);
    if (n === 0) break;
    got += n;
  }
  return got === length ? buf : buf.subarray(0, got);
}

/** Empreinte du contenu, lu par morceaux d'un Mo : n'importe quelle taille, mémoire constante. */
export function fileDigest(file: string, algorithm: 'md5' | 'sha1' | 'sha256'): string {
  const hash = createHash(algorithm);
  updateHash(hash, file);
  return hash.digest('hex');
}

/** Ajoute le contenu du fichier, lu par morceaux, à une empreinte en cours. */
export function updateHash(hash: { update(data: Buffer): unknown }, file: string): void {
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(CHUNK);
    for (let at = 0; ; ) {
      const n = fs.readSync(fd, buf, 0, CHUNK, at);
      if (n === 0) break;
      hash.update(buf.subarray(0, n));
      at += n;
    }
  } finally {
    fs.closeSync(fd);
  }
}
