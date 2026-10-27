// Galerie des fichiers à choisir : toute liste de fichiers de la base VPS entre lesquels
// l'utilisateur choisit (versions d'une table, frontons, ROM, PuP-Packs, couleurs, sons,
// musique, dans le catalogue, les parties d'un jeu ou « Ce qu'il manque pour jouer ») passe
// par ici, jamais par une liste faite à la main : chaque fichier en grand aperçu au format de
// ce qu'il montre (FILE_PREVIEW_ASPECT), avec sa popularité sur son site (téléchargements,
// note), son auteur, sa version et sa date ; tri dans l'ordre de l'écran, par popularité
// ou par date. Le 27/10/2026, « Fronton (.directb2s) : au choix » de The Matrix n'était
// qu'une liste de noms. Test : packages/core/src/test/sitefiles.test.ts.
// Cœur : packages/core/src/sitefiles.ts ; fiches des sites : site-files.ts.

import * as fs from 'node:fs';
import { FILE_PREVIEW_ASPECT, fileRefOf, mediaUrl, sortWebFiles, t, webFileTile, type FileSort, type NeedKind, type VpsTableFile, type WebFileTile } from '@cyberpinball/core';
import type { Action, Built, Section } from './library';
import type { MediaCard, MediaThumb } from './library-medias';
import { allowPreview } from './media-protocol';
import type { SiteFiles } from './site-files';

export interface FileGalleryContext {
  siteFiles: SiteFiles;
  /** Vignette de la base VPS déjà reçue sur le disque (adresse de la base → fichier local). */
  vpsThumb(url: string): string | undefined;
  /** Redessiner l'écran (un clic redessine avant de lancer l'action). */
  redraw(): void;
}

/** Un écran de choix d'un fichier. */
export interface FileChoice {
  kind: NeedKind;
  /** Dans l'ordre de l'écran (conseillé). */
  files: VpsTableFile[];
  heading: string;
  subheading?: string;
  lead: string;
  /** Nom de l'ordre de l'écran (« écrans de la borne ») ; absent : l'écran est déjà par date. */
  advised?: string;
  pick(file: VpsTableFile): void;
  back(): void;
  /** État d'un fichier dans la tuile (« Installée », « Conseillée », « Reçu »). */
  state?(file: VpsTableFile): MediaCard['state'];
  /** Lignes du détail propres à l'écran (pourquoi une version est conseillée), avant celles de la fiche. */
  extra?(file: VpsTableFile): string[];
  /** Actions avant les fichiers (« Installation rapide ») et après (« Retour »). */
  before?: Action[];
  after?: Action[];
  sections?: Section[];
}

const SORT_NAMES = (advised?: string): Record<FileSort, string> => ({
  advised: advised ?? t('date'),
  popularity: t('popularité'),
  date: t('date'),
});

export function createFileGallery(ctx: FileGalleryContext) {
  /** Ordre choisi par l'utilisateur, gardé d'un écran à l'autre pendant la visite. */
  let sort: FileSort = 'advised';

  /** Aperçu d'une tuile : la vignette de la base VPS, sinon la capture de l'auteur, dès qu'elle est reçue. */
  function thumbOf(tile: WebFileTile, loading: boolean): MediaThumb {
    for (const url of tile.previews) {
      const local = /^https:\/\/virtualpinballspreadsheet\.github\.io\//.test(url) ? ctx.vpsThumb(url) : ctx.siteFiles.shot(url);
      if (local && fs.existsSync(local)) {
        allowPreview(local);
        return { kind: 'image', url: mediaUrl(local), rotation: 0 };
      }
    }
    const text = tile.previews.length || loading ? t('Aperçu en route…') : t('Pas d’aperçu sur son site');
    return { kind: 'fallback', rotation: 0, text };
  }

  function build(c: FileChoice): Built {
    // Les fiches se lisent une fois (gardées un jour) ; chacune redessine l'écran en arrivant.
    ctx.siteFiles.want(c.files.map((f) => fileRefOf(f)?.url));
    const states = c.files.map((f) => ctx.siteFiles.state(fileRefOf(f)?.url));
    const tiles = new Map(c.files.map((f, i) => [f, webFileTile(c.kind, f, states[i])] as const));
    // L'ordre de l'écran d'abord (sans ordre conseillé : la date), puis la popularité dès qu'un site la donne.
    const popular = states.some((s) => s === 'loading' || (typeof s === 'object' && s.downloads !== undefined));
    const modes: FileSort[] = c.advised ? ['advised', ...(popular ? (['popularity'] as const) : []), 'date'] : ['date', ...(popular ? (['popularity'] as const) : [])];
    const current = modes.includes(sort) ? sort : modes[0]!;
    const next = modes[(modes.indexOf(current) + 1) % modes.length]!;
    const files = sortWebFiles(c.files, current, (f) => tiles.get(f)!);
    const actions: Action[] = [...(c.before ?? [])];
    // Clé de chaque tuile, unique et indépendante du tri : deux ROM du même nom sans identifiant
    // dans la base VPS ne se confondent pas (le rang dans l'ordre de l'écran les départage).
    const keyOf = (f: VpsTableFile) => (c.files.filter((x) => x.id === f.id).length > 1 ? `file:${f.id}#${c.files.indexOf(f)}` : `file:${f.id}`);
    const cards: MediaCard[] = files.map((f) => {
      const tile = tiles.get(f)!;
      const action = actions.length;
      actions.push({ key: keyOf(f), label: tile.title, detail: tile.popularity ?? tile.facts, run: () => c.pick(f) });
      return {
        action,
        title: tile.title,
        state: c.state?.(f),
        flag: tile.gone ? { label: t('Retiré du site'), tone: 'warning' } : undefined,
        popularity: tile.popularity,
        facts: tile.facts,
        meta: tile.popularity ? tile.facts : undefined,
        tags: (f.features ?? []).filter((x) => !/^incl\./i.test(x)).slice(0, 2),
        extra: [...(c.extra?.(f) ?? []), ...tile.detail],
        thumb: thumbOf(tile, states[c.files.indexOf(f)] === 'loading'),
      };
    });
    if (modes.length > 1) {
      const names = SORT_NAMES(c.advised);
      actions.push({
        key: 'sort',
        label: t('Trier : {order}', { order: names[current] }),
        detail: t('Start : {order}', { order: names[next] }),
        run: () => {
          sort = next;
          ctx.redraw();
        },
      });
    }
    actions.push(...(c.after ?? []));
    return {
      heading: c.heading,
      subheading: c.subheading,
      lead: c.lead,
      sections: c.sections ?? [],
      actions,
      back: c.back,
      media: { cards, gallery: true, files: true, aspect: FILE_PREVIEW_ASPECT[c.kind] },
    };
  }

  return { build };
}

export type FileGallery = ReturnType<typeof createFileGallery>;
