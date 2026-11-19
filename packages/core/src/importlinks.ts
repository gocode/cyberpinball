// Ce que le plan d'ajout liera (liens physiques, aucune place en plus) et ce qu'il copiera, pour
// une installation reprise (ImportSource.link, hardlink.ts). Dit dans le plan, avant « Installer ».

import * as fs from 'node:fs';
import * as path from 'node:path';
import { sameVolume } from './fileops';
import { isLinkable } from './hardlink';
import type { ImportPlan } from './tableimport';

/** Fichiers d'une source, une fois parcourus : liables ou non. Ne dépend pas de la destination. */
export interface SourceFiles {
  linkable: number;
  linkableFiles: number;
  other: number;
  otherFiles: number;
}

export interface ImportLinks {
  /** Octets liés : aucune place en plus. */
  linked: number;
  linkedFiles: number;
  /** Octets copiés par les copies liées (petits fichiers modifiables, ou autre disque). */
  copied: number;
  copiedFiles: number;
  /**
   * Installation d'origine sur un autre disque que la destination : rien ne peut s'y lier, tout est
   * copié. bytes : ce que la copie prendra en tout ; from et to : les racines des deux disques.
   */
  otherDisk?: { from: string; to: string; bytes: number; linkable: number };
}

/** Parcourt une source (fichier ou dossier) : taille des fichiers liables et des autres. */
export function sourceFiles(from: string): SourceFiles {
  const out: SourceFiles = { linkable: 0, linkableFiles: 0, other: 0, otherFiles: 0 };
  const visit = (p: string) => {
    let st: fs.Stats;
    try {
      st = fs.lstatSync(p);
    } catch {
      return;
    }
    if (st.isDirectory()) {
      let names: string[] = [];
      try {
        names = fs.readdirSync(p);
      } catch {
        return;
      }
      for (const name of names) visit(path.join(p, name));
    } else if (st.isFile()) {
      if (isLinkable(p)) {
        out.linkable += st.size;
        out.linkableFiles++;
      } else {
        out.other += st.size;
        out.otherFiles++;
      }
    }
  };
  visit(from);
  return out;
}

/**
 * Liens et copies des éléments liés du plan (tables, parties, ROM d'une installation reprise).
 * `cache` : parcours gardés d'un calcul à l'autre (le plan se refait à chaque choix). undefined :
 * aucune copie liée dans ce plan.
 */
export function importLinks(plan: ImportPlan, cache = new Map<string, SourceFiles>()): ImportLinks | undefined {
  const files = (p: string) => {
    const key = p.toLowerCase();
    let f = cache.get(key);
    if (!f) cache.set(key, (f = sourceFiles(p)));
    return f;
  };
  const moves: { from: string; to: string }[] = [];
  for (const table of plan.tables) for (const s of table.steps) if (s.link && s.mode === 'copy' && !s.zip) moves.push({ from: s.from, to: s.to });
  for (const r of plan.roms) {
    const kept = r.versions[r.keep];
    if (kept && !kept.inLibrary && !kept.build && kept.link && kept.mode === 'copy' && kept.from) moves.push({ from: kept.from, to: r.to });
  }
  if (!moves.length) return undefined;
  const out: ImportLinks = { linked: 0, linkedFiles: 0, copied: 0, copiedFiles: 0 };
  for (const m of moves) {
    const f = files(m.from);
    if (sameVolume(m.from, m.to)) {
      out.linked += f.linkable;
      out.linkedFiles += f.linkableFiles;
      out.copied += f.other;
      out.copiedFiles += f.otherFiles;
    } else {
      out.copied += f.linkable + f.other;
      out.copiedFiles += f.linkableFiles + f.otherFiles;
      const root = (p: string) => path.parse(path.resolve(p)).root.toUpperCase();
      out.otherDisk ??= { from: root(m.from), to: root(m.to), bytes: 0, linkable: 0 };
      out.otherDisk.bytes += f.linkable + f.other;
      out.otherDisk.linkable += f.linkable;
    }
  }
  return out;
}
