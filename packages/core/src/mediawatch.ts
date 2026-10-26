// Guet des dossiers des tables et des médias de la borne : tout changement de média
// (roue, plateau, fronton, FullDMD, topper, son, vidéo…) et tout ajout, renommage ou
// suppression de table se voit dans le menu sans redémarrer. Un seul mécanisme pour
// tous les chemins : « Médias du jeu », téléchargements, propositions, ajout de table
// par « Récupérer », fichier copié à la main dans un dossier medias\. Le menu relit
// alors les tables ou oublie ses médias résolus (MenuMedias.invalidate) et renvoie son
// état aux fenêtres ; les adresses des fichiers changent avec leur date et leur taille
// (mediaUrl), donc chaque écran affiche le nouveau fichier, jamais l'ancien en cache.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { SERVED_MEDIA_EXTENSIONS } from './mediaview';

/** Ce qu'un fichier changé demande au menu : relire ses médias, ou relire les tables. */
export type MediaChange = 'medias' | 'tables';

/** Attente après le dernier évènement : une copie de fichier en produit une rafale. */
export const MEDIA_WATCH_DEBOUNCE_MS = 400;

/**
 * Ce que demande un chemin changé (relatif au dossier guetté ou complet), ou undefined
 * s'il ne concerne pas le menu (réglages de la table écrits par VPX, journaux…).
 * Un .vpx : les tables. Un média ou un .directb2s : les médias. Un nom sans extension
 * (dossier d'une table ajouté, renommé ou supprimé) : les tables.
 */
export function mediaChangeOf(file: string | null | undefined): MediaChange | undefined {
  if (!file) return 'tables';
  const ext = path.extname(file).slice(1).toLowerCase();
  if (ext === 'vpx') return 'tables';
  if (ext === 'directb2s' || SERVED_MEDIA_EXTENSIONS.has(ext)) return 'medias';
  if (!ext) return 'tables';
  return undefined;
}

function isDirectory(file: string): boolean {
  try {
    return fs.statSync(file).isDirectory();
  } catch {
    return false;
  }
}

export interface MediaWatchOptions {
  /** Dossiers guettés avec leurs sous-dossiers (<racine>\tables, <racine>\media). */
  dirs: readonly string[];
  /** Appelé une fois la rafale passée, avec ce qu'elle demande. */
  onChange: (changes: ReadonlySet<MediaChange>) => void;
  debounceMs?: number;
  /** fs.watch, remplaçable pour les essais. */
  watch?: typeof fs.watch;
}

export interface MediaWatch {
  /** Dossiers effectivement guettés. */
  readonly watching: readonly string[];
  /** Reprend le guet des dossiers absents au départ ou perdus (créés depuis, disque revenu). */
  rearm(): void;
  close(): void;
}

/**
 * Guette `dirs` (fs.watch récursif, natif sous Windows). Un dossier absent n'est pas
 * créé : rearm() le reprend quand il existe. Sans guet possible (lecteur réseau, droits),
 * le menu garde son filet : la durée de vie des médias résolus (MenuMediaOptions.ttlMs).
 */
export function watchMediaChanges(opts: MediaWatchOptions): MediaWatch {
  const watchers = new Map<string, fs.FSWatcher>();
  const pending = new Set<MediaChange>();
  const debounce = opts.debounceMs ?? MEDIA_WATCH_DEBOUNCE_MS;
  const watch = opts.watch ?? fs.watch;
  let timer: NodeJS.Timeout | undefined;
  let closed = false;

  const flush = () => {
    timer = undefined;
    if (closed || !pending.size) return;
    const changes = new Set(pending);
    pending.clear();
    opts.onChange(changes);
  };

  const arm = (dir: string) => {
    if (closed || watchers.has(dir)) return;
    try {
      if (!fs.statSync(dir).isDirectory()) return;
      const watcher = watch(dir, { recursive: true, persistent: false }, (_event, name) => {
        const relative = name === null ? null : String(name);
        // Dossier dont le nom a un point (« … VPW 1.0 ») : reconnu à ce qu'il est un dossier.
        const change = mediaChangeOf(relative) ?? (relative && isDirectory(path.join(dir, relative)) ? 'tables' : undefined);
        if (!change) return;
        pending.add(change);
        clearTimeout(timer);
        timer = setTimeout(flush, debounce);
      });
      // Dossier supprimé, disque débranché : ce guet s'arrête, rearm() le reprendra.
      watcher.on('error', () => {
        watcher.close();
        watchers.delete(dir);
      });
      watchers.set(dir, watcher);
    } catch {
      // Dossier absent ou impossible à guetter : rearm() réessaiera.
    }
  };

  const rearm = () => {
    for (const dir of opts.dirs) arm(dir);
  };
  rearm();

  return {
    get watching() {
      return [...watchers.keys()];
    },
    rearm,
    close() {
      closed = true;
      clearTimeout(timer);
      for (const w of watchers.values()) w.close();
      watchers.clear();
    },
  };
}
