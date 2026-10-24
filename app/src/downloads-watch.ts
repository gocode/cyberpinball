// Surveillance du dossier Téléchargements de Windows (docs/recherche/acquisition.md
// § 8.3, étape A6), pour ce que l'utilisateur récupère dans son propre navigateur :
// seulement si l'utilisateur l'a activée, et seulement tant que la liste d'attente
// attend quelque chose. Un fichier en cours d'écriture (.crdownload, .part…) est
// ignoré ; un fichier fini est remis quand sa taille ne bouge plus. Rien n'est déplacé
// ni journalisé : l'application reçoit le chemin, rapproche le fichier de la liste
// d'attente, et ne garde que ce qui y correspond.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { isPartialDownload } from '@cyberpinball/core';

export interface DownloadsWatchOptions {
  /** Dossier surveillé (app.getPath('downloads')). */
  dir: string;
  /** Fichier fini, de taille stable. */
  arrived(file: string): void;
  /** Temps sans changement de taille avant de remettre un fichier (2 s par défaut). */
  settleMs?: number;
}

export function watchDownloads(opts: DownloadsWatchOptions): { stop(): void } {
  const settle = opts.settleMs ?? 2000;
  const timers = new Map<string, NodeJS.Timeout>();
  const sizes = new Map<string, number>();
  const seen = new Set<string>();

  const check = (file: string) => {
    let size: number;
    try {
      const stat = fs.statSync(file);
      if (!stat.isFile()) return;
      size = stat.size;
    } catch {
      return; // disparu (renommé à la fin du téléchargement) : l'autre nom suit
    }
    if (size > 0 && sizes.get(file) === size) {
      timers.delete(file);
      sizes.delete(file);
      if (!seen.has(file.toLowerCase())) {
        seen.add(file.toLowerCase());
        opts.arrived(file);
      }
      return;
    }
    sizes.set(file, size);
    timers.set(file, setTimeout(() => check(file), settle));
  };

  let watcher: fs.FSWatcher | undefined;
  try {
    watcher = fs.watch(opts.dir, (_event, name) => {
      if (!name || isPartialDownload(name)) return;
      const file = path.join(opts.dir, name.toString());
      clearTimeout(timers.get(file));
      timers.set(file, setTimeout(() => check(file), settle));
    });
    watcher.on('error', () => undefined);
  } catch {
    watcher = undefined; // dossier absent : rien à surveiller
  }
  return {
    stop() {
      watcher?.close();
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    },
  };
}

/**
 * Fichiers finis du dossier arrivés depuis `since` : pour retrouver ce qui a été
 * téléchargé avant que la surveillance ne tourne (« Chercher dans Téléchargements »).
 */
export function recentDownloads(dir: string, since: Date): string[] {
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  return names
    .filter((n) => !isPartialDownload(n))
    .map((n) => path.join(dir, n))
    .filter((f) => {
      try {
        const stat = fs.statSync(f);
        return stat.isFile() && stat.mtimeMs >= since.getTime() - 60_000;
      } catch {
        return false;
      }
    });
}
