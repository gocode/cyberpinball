// Vidéos du DMD d'une table (dossier UltraDMD ou FlexDMD de son script) trop grandes pour le plugin FlexDMD de VPX 10.8.1.
//
// Le plugin (plugins/flexdmd/actors/Video.cpp, Video::Create, au commit af26b2d93) décode chaque vidéo en entier, d'un
// coup, image par image en mémoire, au moment où le script la demande (UltraDMD::ResolveImage, à chaque DisplayScene qui
// la montre, sans cache) : sur le fil du script, celui de VPX. Toute la partie se fige pendant ce temps, flippers
// compris, et VPX garde ces images en mémoire. Banc du 18/11/2026 (scripts/banc-cadence.mjs, scène UltraDMD toutes les
// 6 s) : vidéo de 1920 × 480 et 8 s, un arrêt de 1,1 à 2,3 s à chaque scène (jusqu'à 9,9 s), mémoire de VPX de 3,2 à
// 7,4 Go ; la même en 128 × 32, au plus 0,3 s. Relevé chez un joueur (17/11/2026) : tables originales (UltraDMD) qui
// s'arrêtent 1 à 2 s, la bille disparaît et revient. Le DMD n'a que 128 × 32 points (256 × 64 au plus) : une vidéo plus
// grande n'y gagne rien.

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Finding } from './doctor';
import { formatSize } from './fileops';
import { formatList, t, tn } from './i18n';
import { readMediaDimensions } from './medias';

const VIDEO = /\.(mp4|m4v|mov|avi|wmv|webm|mkv|f4v|flv|mpg|mpeg)$/i;
/** Au-delà de quatre fois le plus grand DMD (256 × 64) : décodée en entier, elle fige la partie. */
export const DMD_VIDEO_MAX_PIXELS = 4 * 256 * 64;
/** Taille de définition illisible (wmv, avi…) : jugée à son poids. */
export const DMD_VIDEO_MAX_BYTES = 3 * 1024 * 1024;

export interface HeavyDmdVideo {
  file: string;
  size: number;
  width?: number;
  height?: number;
}

function videosUnder(dir: string, depth = 3): string[] {
  let out: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory() && depth > 0) out = out.concat(videosUnder(full, depth - 1));
    else if (e.isFile() && VIDEO.test(e.name)) out.push(full);
  }
  return out;
}

/** Les vidéos du dossier du DMD trop grandes pour le plugin FlexDMD, les plus lourdes d'abord. */
export function heavyDmdVideos(dmdDir: string): HeavyDmdVideo[] {
  const heavy: HeavyDmdVideo[] = [];
  for (const file of videosUnder(dmdDir)) {
    let size = 0;
    try {
      size = fs.statSync(file).size;
    } catch {
      continue;
    }
    const dims = readMediaDimensions(file);
    if (dims ? dims.width * dims.height > DMD_VIDEO_MAX_PIXELS : size > DMD_VIDEO_MAX_BYTES) heavy.push({ file, size, ...(dims ? { width: dims.width, height: dims.height } : {}) });
  }
  return heavy.sort((a, b) => (b.width ?? 0) * (b.height ?? 0) - (a.width ?? 0) * (a.height ?? 0) || b.size - a.size);
}

/**
 * Vidéo que Chromium lit, donc que Cyber Pinball sait ramener à la taille du DMD avant la partie (dmd-video-shrink.ts,
 * dans l'application) ; wmv, avi ou flv restent tels quels.
 */
export function isShrinkableDmdVideo(file: string): boolean {
  return /\.(mp4|m4v|mov|webm)$/i.test(file);
}

/** Le constat : la partie se figera à chaque scène qui montre l'une de ces vidéos. */
export function heavyDmdVideosFinding(tableFolder: string, dmdFolder: string): Finding | undefined {
  const dir = path.join(tableFolder, dmdFolder);
  const heavy = heavyDmdVideos(dir);
  if (!heavy.length) return undefined;
  const first = heavy[0]!;
  const example = first.width ? t('{file}, {width} × {height}', { file: path.basename(first.file), width: first.width, height: first.height! }) : t('{file}, {size}', { file: path.basename(first.file), size: formatSize(first.size) });
  const names = formatList(heavy.slice(0, 3).map((v) => path.basename(v.file)));
  return {
    code: 'dmdVideosHeavy',
    severity: 'warning',
    title: t('Vidéos du DMD trop grandes : la partie se fige'),
    detail: [
      tn(heavy.length, '{n} vidéo de {folder} dépasse de loin la taille du DMD ({example}).', '{n} vidéos de {folder} dépassent de loin la taille du DMD ({example} ; {names}…).', { n: heavy.length, folder: dmdFolder, example, names }),
      t('Le plugin FlexDMD de VPX 10.8.1 décode chaque vidéo en entier, d’un coup, à chaque scène qui la montre : la partie se fige une à plusieurs secondes, flippers compris, et VPX prend de la mémoire à chaque fois.'),
      heavy.every((v) => isShrinkableDmdVideo(v.file))
        ? t('Le DMD n’a que 128 × 32 points : Cyber Pinball les ramène à cette taille avant la prochaine partie, où elles s’afficheront pareil, sans arrêt ; les originaux vont à sa corbeille.')
        : t('Le DMD n’a que 128 × 32 points : Cyber Pinball ramène à cette taille, avant la prochaine partie, celles qu’il sait lire (mp4, mov, webm) ; les autres (wmv, avi) restent telles quelles : remplacez-les par des mp4 à la taille du DMD.'),
    ].join(' '),
  };
}
