// Images des tables de Zen (Pinball FX, Pinball FX3) avant leur ajout au front-end (20/11/2026) : un
// joueur voyait la moitié de ses tables sans vignette, alors qu'il avait une image pour chacune.
//
// - Jeu VPS : celui du catalogue, sinon le jeu de la base VPS au titre identique parmi ceux qui ont
//   une table de Zen (formats FX, FX3, FX2). Titre comparé sans casse, accents, ponctuation ni le mot
//   « Pinball » : « Portal Pinball » est « Portal », jamais « Mars » pour « Terraforming Mars Pinball ».
// - Image du dossier du jeu : des joueurs rangent une image par table à côté de son fichier .pxp
//   (« Archer.png », « Aliens.jpg » dans data\steam), nommée comme lui. Elle sert de vignette et se
//   prend comme média de la table. Son type vient de ses proportions, lues dans son en-tête : à peu
//   près carrée ou petite, un logo (Wheel) ; en largeur, le fronton (Backglass : c'est là que FX3
//   l'affiche) ; en hauteur, une image de la table (Playfield).

import * as fs from 'node:fs';
import * as path from 'node:path';
import { imageDimensions, sniffImage } from './avatar';
import type { VpsDb } from './vps';
import type { ZenTable } from './zen';

/** Formats de la base VPS qui sont des tables de Zen. */
const ZEN_VPS_FORMATS = new Set(['FX', 'FX3', 'FX2']);
/** Extensions d'une image rangée à côté d'une table. */
const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.webp'];

function normTitle(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .replace(/\bpinball\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Jeu VPS d'une table de Zen : celui du catalogue, sinon le seul jeu de Zen de la base VPS au titre
 * identique. Deux jeux au même titre : aucun (jamais deviné).
 */
export function zenVpsId(db: Pick<VpsDb, 'games'> | undefined, fx: Pick<ZenTable, 'vps' | 'title'>): string | undefined {
  if (fx.vps) return fx.vps;
  if (!db) return undefined;
  const want = normTitle(fx.title);
  if (!want) return undefined;
  const hits = db.games.filter((g) => (g.tableFiles ?? []).some((f) => ZEN_VPS_FORMATS.has(f.tableFormat ?? '')) && normTitle(g.name) === want);
  return hits.length === 1 ? hits[0]!.id : undefined;
}

/** La table avec son jeu VPS, quand le catalogue n'en donnait pas et que la base le reconnaît. */
export function withZenVps<T extends ZenTable>(db: Pick<VpsDb, 'games'> | undefined, fx: T): T {
  if (fx.vps) return fx;
  const vps = zenVpsId(db, fx);
  return vps ? { ...fx, vps } : fx;
}

/**
 * Images rangées à côté des tables dans un dossier (data\steam de FX3) : nom du fichier de la table
 * (sans extension, en minuscules) vers l'image. Lu une fois par ouverture de l'écran.
 */
export function zenLocalImages(dir: string | undefined): Map<string, string> {
  const out = new Map<string, string>();
  if (!dir) return out;
  let files: string[];
  try {
    files = fs.readdirSync(dir);
  } catch {
    return out;
  }
  for (const f of files) {
    const ext = path.extname(f).toLowerCase();
    if (!IMAGE_EXTS.includes(ext)) continue;
    const key = f.slice(0, -ext.length).toLowerCase();
    // Une seule par table : la première dans l'ordre des extensions (png, jpg, jpeg, webp).
    const prev = out.get(key);
    if (!prev || IMAGE_EXTS.indexOf(ext) < IMAGE_EXTS.indexOf(path.extname(prev).toLowerCase())) out.set(key, path.join(dir, f));
  }
  return out;
}

/**
 * Ce qu'est une image rangée à côté d'une table : à peu près carrée ou petite, son logo ; en largeur,
 * son fronton (FX3 montre data\steam\<table>.* dans sa fenêtre du fronton, et le catalogue des frontons
 * en est fait : 20/11/2026, ces images passaient pour des images du plateau) ; en hauteur, une image de
 * la table. undefined : illisible.
 */
export function zenLocalImageType(file: string): 'Wheel' | 'Backglass' | 'Playfield' | undefined {
  let bytes: Buffer;
  try {
    const fd = fs.openSync(file, 'r');
    try {
      // Les dimensions d'un JPEG peuvent suivre ses métadonnées (EXIF) : 256 Ko suffisent.
      const buf = Buffer.alloc(256 * 1024);
      bytes = buf.subarray(0, fs.readSync(fd, buf, 0, buf.length, 0));
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return undefined;
  }
  const ext = sniffImage(bytes);
  const size = ext ? imageDimensions(bytes, ext) : undefined;
  if (!size || !size.width || !size.height) return undefined;
  const ratio = size.width / size.height;
  if ((ratio >= 0.8 && ratio <= 1.25) || Math.max(size.width, size.height) <= 640) return 'Wheel';
  return ratio > 1.25 ? 'Backglass' : 'Playfield';
}
