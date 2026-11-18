// Vidéos du DMD d'une table ramenées à la taille du DMD avant la partie (dmdvideos.ts) : le plugin FlexDMD de VPX 10.8.1
// les décode en entier à chaque scène qui les montre, et la partie se fige une à plusieurs secondes. Le DMD n'a que
// 128 × 32 points : la vidéo réduite s'y affiche pareil. Chaque vidéo est réencodée par Chromium (media-convert.ts,
// shrinkVideo : VP8 dans un WebM, sous le même nom, que libav reconnaît au contenu) ; l'original part à la corbeille de
// Cyber Pinball. Une vidéo déjà réduite n'est plus grande : rien n'est refait. Une vidéo que Chromium ne lit pas (wmv,
// avi) reste telle quelle, et le constat le dit.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { applyOps, heavyDmdVideos, isShrinkableDmdVideo, renameWithRetry } from '@cyberpinball/core';
import type { Converter } from './media-convert';

/** Taille du DMD d'UltraDMD et de FlexDMD par défaut. */
const DMD_WIDTH = 128;
const DMD_HEIGHT = 32;

/** Réduit les vidéos trop grandes du dossier du DMD ; renvoie celles réduites (noms), pour le journal. */
export async function shrinkDmdVideos(opts: { tableFolder: string; dmdFolder: string; converter: Converter; trashDir: string; log: (line: string) => void }): Promise<string[]> {
  const dir = path.join(opts.tableFolder, opts.dmdFolder);
  const done: string[] = [];
  for (const video of heavyDmdVideos(dir).filter((v) => isShrinkableDmdVideo(v.file))) {
    const temp = `${video.file}.cyberpinball-reduite`;
    try {
      const started = Date.now();
      const got = await opts.converter.shrinkVideo(video.file, temp, DMD_WIDTH, DMD_HEIGHT);
      applyOps([{ op: 'trash', path: video.file }], { trashDir: opts.trashDir });
      renameWithRetry(temp, video.file);
      done.push(path.basename(video.file));
      opts.log(
        `Vidéos du DMD (${opts.dmdFolder}) : ${path.basename(video.file)} ramenée de ${video.width ?? '?'} × ${video.height ?? '?'} à ${DMD_WIDTH} × ${DMD_HEIGHT} (${got.frames} images, ${Math.round(got.bytes / 1024)} Ko, ${Date.now() - started} ms) ; l'original est à la corbeille.`, // i18n-ignore : journal
      );
    } catch (error) {
      try {
        fs.rmSync(temp, { force: true });
      } catch {
        // Rien à retirer.
      }
      opts.log(`Vidéos du DMD (${opts.dmdFolder}) : ${path.basename(video.file)} pas réduite (${(error as Error).message}) ; gardée telle quelle.`); // i18n-ignore : journal
    }
  }
  return done;
}
