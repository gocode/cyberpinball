// Fiches des fichiers de la base VPS sur leur site (VPUniverse, VPForums), pour la galerie
// des fichiers à choisir (file-gallery.ts) : téléchargements, note, vues, taille, capture de
// l'auteur. Cœur : packages/core/src/sitefiles.ts (lecture de la page).
//
// - Lecture : la page de la fiche, reçue avec les cookies de la session « Récupérer », sans
//   l'afficher ni exécuter ses scripts ; quatre à la fois, à l'ouverture d'un écran de choix.
//   Chaque fiche lue redessine l'écran : la popularité arrive tuile par tuile.
// - Gardée un jour (<téléchargements>\sites\fiches.json) : revenir sur l'écran ne relit
//   rien ; une fiche disparue (404) est gardée comme telle, une page muette ou un échec de
//   réseau se relit une heure plus tard.
// - Captures : l'image que l'auteur a déposée, reçue une fois dans <téléchargements>\sites\apercus.

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseSiteFile, siteFileRef, type SiteFileInfo, type SiteFileState } from '@cyberpinball/core';
import type { Acquirer } from './acquire-window';

export interface SiteFilesContext {
  acquirer: Pick<Acquirer, 'fetchText' | 'fetchImage'>;
  /** Dossier des téléchargements de Cyber Pinball ; undefined avant l'installation. */
  downloadsDir(): string | undefined;
  /** Une fiche ou une capture est arrivée : redessiner l'écran. */
  changed(): void;
}

/** Ce qu'une fiche a donné : lue, disparue du site, ou rien (page muette, pas de réseau). */
interface Kept {
  at: number;
  info?: SiteFileInfo;
  gone?: boolean;
}

const DAY_MS = 24 * 3600_000;
const RETRY_MS = 3600_000;
/** Fiches lues en même temps : assez pour remplir un écran vite, sans assaillir le site. */
const PARALLEL = 4;

export function createSiteFiles(ctx: SiteFilesContext) {
  let kept: Map<string, Kept> | undefined;
  const reading = new Set<string>();
  const queue: string[] = [];
  let active = 0;
  const shots = new Map<string, string>();
  const fetchingShots = new Set<string>();

  const root = () => {
    const dir = ctx.downloadsDir();
    return dir ? path.join(dir, 'sites') : undefined;
  };
  const file = () => (root() ? path.join(root()!, 'fiches.json') : undefined);

  function load(): Map<string, Kept> {
    if (kept) return kept;
    kept = new Map();
    try {
      const f = file();
      if (f && fs.existsSync(f)) for (const [url, k] of Object.entries(JSON.parse(fs.readFileSync(f, 'utf8')) as Record<string, Kept>)) kept.set(url, k);
    } catch {
      // Relevé illisible : les fiches se relisent.
    }
    return kept;
  }

  function save(): void {
    const f = file();
    if (!f || !kept) return;
    try {
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, `${JSON.stringify(Object.fromEntries(kept), null, 1)}\n`, 'utf8');
    } catch {
      // Disque plein, dossier en lecture seule : la fiche reste en mémoire.
    }
  }

  const fresh = (k: Kept | undefined) => Boolean(k && Date.now() - k.at < (k.info || k.gone ? DAY_MS : RETRY_MS));

  /** État de la fiche d'un lien : lue, en lecture, disparue, ou rien à lire. */
  function state(url: string | undefined): SiteFileState {
    const ref = url ? siteFileRef(url) : undefined;
    if (!ref) return undefined;
    const k = load().get(ref.url);
    if (k?.gone) return 'gone';
    if (k?.info) return k.info;
    return reading.has(ref.url) ? 'loading' : undefined;
  }

  async function read(url: string): Promise<void> {
    const ref = siteFileRef(url)!;
    const page = await ctx.acquirer.fetchText(ref.url);
    const k: Kept = { at: Date.now() };
    if (page?.status === 404 || page?.status === 410) k.gone = true;
    else if (page?.text) k.info = parseSiteFile(ref, page.text);
    // Page reçue mais muette : la forme du site a peut-être changé ; le journal le dit.
    if (page?.text && !k.info) console.warn(`Fiche de ${ref.site} illisible : ${ref.url} (lecture à revoir dans sitefiles.ts).`); // i18n-ignore : journal
    load().set(ref.url, k);
    save();
  }

  function pump(): void {
    while (active < PARALLEL && queue.length) {
      const url = queue.shift()!;
      active++;
      void read(url)
        .catch(() => undefined)
        .finally(() => {
          active--;
          reading.delete(url);
          ctx.changed();
          pump();
        });
    }
  }

  /** Lire, si ce n'est fait depuis peu, les fiches de ces liens (les autres sites sont ignorés). */
  function want(urls: (string | undefined)[]): void {
    let added = false;
    for (const url of urls) {
      const ref = url ? siteFileRef(url) : undefined;
      if (!ref || reading.has(ref.url) || fresh(load().get(ref.url))) continue;
      reading.add(ref.url);
      queue.push(ref.url);
      added = true;
    }
    if (added) pump();
  }

  /** Image d'aperçu reçue sur le disque (capture de l'auteur) ; la demande si elle manque. */
  function shot(url: string): string | undefined {
    const local = shots.get(url);
    if (local && fs.existsSync(local)) return local;
    const dir = root();
    if (!dir) return undefined;
    const ext = /\.(png|jpe?g|gif|webp)(?:[.?#]|$)/i.exec(url)?.[1]?.toLowerCase() ?? 'jpg';
    const target = path.join(dir, 'apercus', `${crypto.createHash('sha1').update(url).digest('hex').slice(0, 20)}.${ext}`);
    if (fs.existsSync(target)) {
      shots.set(url, target);
      return target;
    }
    if (!fetchingShots.has(url)) {
      fetchingShots.add(url);
      void ctx.acquirer.fetchImage(url, target).then((got) => {
        if (got) shots.set(url, got);
        ctx.changed();
      });
    }
    return undefined;
  }

  return { state, want, shot };
}

export type SiteFiles = ReturnType<typeof createSiteFiles>;
