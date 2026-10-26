// Habillage FullDMD en partie (packages/core/src/fulldmdframe.ts, fulldmdtable.ts) : avant la
// partie, le cadre du DMD est cherché dans le média FullDMD de la table (une fois par média,
// gardé dans <racine>\data\cache\fulldmd-cadres.json), puis la fenêtre du DMD de VPX est posée
// dans ce cadre par le .ini de la table. La fenêtre du menu, restée derrière VPX, montre
// l'habillage autour.

import * as path from 'node:path';
import {
  agreeingFrame,
  applyOps,
  b2sCacheDir,
  b2sImages,
  cachedFrame,
  companion,
  detectDmdFrame,
  dressingMedia,
  dressingOps,
  dressScreen,
  frameCacheFile,
  fullDmdReasonLabel,
  mediaKind,
  pngFrame,
  storeFrame,
  tableDressing,
  VIDEO_FRAME_TIMES,
  type Cabinet,
  type FrameRecord,
  type ScriptFacts,
  type TableDressing,
  type TableEntry,
} from '@cyberpinball/core';
import type { Converter } from './media-convert';

/**
 * Cadre du DMD dans un média FullDMD : gardé d'une fois sur l'autre, sinon cherché (un PNG
 * directement, une autre image ou une vidéo par le convertisseur hors écran). undefined :
 * média illisible, ou vidéo sans convertisseur.
 */
export async function mediaFrame(media: string, dataDir: string, converter?: Pick<Converter, 'mediaFrames'>): Promise<FrameRecord | undefined> {
  const cacheFile = frameCacheFile(dataDir);
  const known = cachedFrame(cacheFile, media);
  if (known) return known;
  let record = pngFrame(media);
  if (!record && converter) {
    const video = mediaKind(media) === 'video';
    try {
      const got = await converter.mediaFrames(media, video ? VIDEO_FRAME_TIMES : [0]);
      if (got.images.length) {
        const frames = got.images.map((img) => detectDmdFrame(img));
        record = { frame: (video ? agreeingFrame(frames) : frames[0]) ?? null, width: got.width, height: got.height };
      }
    } catch (error) {
      console.log(`Habillage FullDMD : ${path.basename(media)} illisible (${(error as Error).message}).`);
    }
  }
  if (record) storeFrame(cacheFile, media, record);
  return record;
}

/** Le .directb2s de la table a une image FullDMD (DMDImage) : le plugin B2S habille lui-même la fenêtre du DMD. */
export async function b2sFullDmd(entry: TableEntry, dataDir: string): Promise<boolean> {
  const base = path.basename(entry.file).replace(/\.vpx$/i, '');
  const file = companion(entry.folder, base, entry.id.includes('/'), '.directb2s');
  if (!file) return false;
  try {
    return Boolean((await b2sImages(file, b2sCacheDir(dataDir))).dmd);
  } catch {
    return false;
  }
}

export interface DressContext {
  root: string;
  dataDir: string;
  cabinet: Cabinet | undefined;
  facts: ScriptFacts | undefined;
  converter?: Pick<Converter, 'mediaFrames'>;
}

/** Habillage de la table, médias analysés au besoin (pour la partie et le médecin). */
export async function analyseDressing(entry: TableEntry, ctx: DressContext): Promise<TableDressing> {
  const screen = dressScreen(ctx.cabinet);
  const media = dressingMedia(entry, screen, ctx.root, ctx.cabinet);
  const frame = media ? await mediaFrame(media, ctx.dataDir, ctx.converter) : undefined;
  return tableDressing(entry, {
    screen,
    root: ctx.root,
    cabinet: ctx.cabinet,
    facts: ctx.facts,
    b2sFullDmd: await b2sFullDmd(entry, ctx.dataDir),
    frameOf: () => frame,
  });
}

/**
 * Avant la partie : la fenêtre du DMD posée dans le cadre de l'habillage (ou rendue à la
 * disposition générale quand il n'y en a plus), sans toucher à une place réglée en partie
 * par l'utilisateur. Renvoie l'habillage, pour le fond de partie de l'écran du DMD.
 */
export async function prepareDressing(entry: TableEntry, ctx: DressContext & { trashDir: string }): Promise<TableDressing | undefined> {
  try {
    const dressing = await analyseDressing(entry, ctx);
    const { state, ops } = dressingOps(entry, dressing);
    if (ops.length) applyOps(ops, { trashDir: ctx.trashDir });
    const plan = dressing.plan;
    if (plan.dressed) {
      const w = plan.window;
      if (state === 'kept') console.log(`Habillage FullDMD (${entry.id}) : place du DMD réglée en partie, gardée.`);
      else console.log(`Habillage FullDMD (${entry.id}) : DMD ${state === 'placed' ? 'posé' : 'déjà'} dans le cadre (${w.width} × ${w.height} en ${w.x}, ${w.y}).`);
    } else {
      if (state === 'restored') console.log(`Habillage FullDMD (${entry.id}) : place du DMD rendue à la disposition générale.`);
      if (plan.reason !== 'notFullDmd') console.log(`Habillage FullDMD (${entry.id}) : aucun (${fullDmdReasonLabel(plan.reason)}).`);
    }
    return dressing;
  } catch (error) {
    console.log(`Habillage FullDMD (${entry.id}) : préparation impossible (${(error as Error).message}).`);
    return undefined;
  }
}
