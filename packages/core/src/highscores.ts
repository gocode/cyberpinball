// Records des tables : ce que la table elle-même a enregistré, jamais une valeur inventée.
//
// VPX 10.8.1 range ce qu'un script enregistre (SaveValue) dans <dossier de la table>\user\
// VPReg.stg : un fichier composé OLE, un stockage par nom choisi par le script (cGameName,
// « The_Goonies »…), un flux par clé, la valeur en texte UTF-16LE. Les tables de VPW et la
// plupart des tables originales y gardent leur tableau d'honneur sous la même convention :
// HighScore1..N (le score) et HighScore1Name..N (les initiales), et souvent Credits.
// Relevé sur la borne le 26/10/2026 : Guardians of the Galaxy, Game of Thrones, The Goonies.
//
// Pas couvert : les tables PinMAME qui laissent la ROM tenir ses records (nvram\<rom>.nv) ;
// leur lecture demande la carte mémoire de chaque ROM (projet pinmame-nvram-maps). Ces tables
// n'ont simplement pas de records ici.
//
// Partagé : le DMD du menu les affiche (livedmd.ts), les sons d'interface comparent avant et
// après une partie pour sonner le knocker (newRecords).

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { TableEntry } from './tables';
import { CompoundFile, type DirEntry } from './vpxinfo';

export interface HighScore {
  /** Place au tableau, à partir de 1 (HighScore1 : le meilleur, « Grand Champion » sur bien des jeux). */
  rank: number;
  /** Initiales enregistrées, en capitales ; absentes si la table n'en garde pas. */
  initials?: string;
  score: number;
}

export interface TableRecords {
  /** VPReg.stg lu. */
  file: string;
  /** Stockage de la table dans ce fichier (nom choisi par son script). */
  storage: string;
  /** Du meilleur au moins bon ; vide si la table n'a enregistré que ses crédits. */
  scores: HighScore[];
  /** Crédits enregistrés par la table (Credits), s'il y en a. */
  credits?: number;
}

/** Au-delà, un flux n'est pas lu : une valeur enregistrée est un nombre ou quelques lettres. */
const MAX_VALUE_BYTES = 256;
/** Places lues au plus (Game of Thrones en garde 16). */
const MAX_RANKS = 32;

/** <dossier de la table>\user\VPReg.stg */
export function vpRegFile(entry: Pick<TableEntry, 'folder'>): string {
  return path.join(entry.folder, 'user', 'VPReg.stg');
}

/** Valeurs de chaque stockage d'un VPReg.stg ; undefined s'il est absent ou illisible. */
export function readVpReg(file: string): Map<string, Map<string, string>> | undefined {
  let fd: number | undefined;
  try {
    fd = fs.openSync(file, 'r');
    const cfb = new CompoundFile(fd);
    const out = new Map<string, Map<string, string>>();
    for (const storage of cfb.children(cfb.entries[0]!)) {
      if (storage.type !== 1) continue;
      out.set(storage.name, values(cfb, storage));
    }
    return out;
  } catch {
    return undefined;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

function values(cfb: CompoundFile, storage: DirEntry): Map<string, string> {
  const map = new Map<string, string>();
  for (const e of cfb.children(storage)) {
    if (e.type !== 2 || e.size > MAX_VALUE_BYTES) continue;
    map.set(e.name, cfb.stream(e).toString('utf16le').replace(/\0+$/, '').trim());
  }
  return map;
}

/** Nombre enregistré (« 75000000 », « 1.5E+07 ») ; undefined si ce n'en est pas un, ou s'il est négatif. */
function count(text: string | undefined): number | undefined {
  if (!text || !/^[+]?\d+(\.\d+)?([eE][+]?\d+)?$/.test(text)) return undefined;
  const n = Math.round(Number(text));
  return Number.isSafeInteger(n) ? n : undefined;
}

/** Tableau d'honneur d'un stockage : HighScore1..N, les initiales de HighScoreNName. */
export function recordsOf(values: Map<string, string>): Pick<TableRecords, 'scores' | 'credits'> {
  const scores: HighScore[] = [];
  for (let rank = 1; rank <= MAX_RANKS; rank++) {
    const score = count(values.get(`HighScore${rank}`));
    if (score === undefined) break;
    const initials = values.get(`HighScore${rank}Name`)?.toUpperCase();
    scores.push({ rank, score, ...(initials ? { initials } : {}) });
  }
  const credits = count(values.get('Credits'));
  return { scores, ...(credits !== undefined ? { credits } : {}) };
}

const simple = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Records d'une table, d'après son VPReg.stg. Le fichier peut ranger plusieurs tables (même
 * dossier) : un seul stockage tenant des records est pris tel quel ; à plusieurs, celui dont
 * le nom se retrouve dans le nom du fichier ou le titre de la table, sinon aucun (on ne
 * devine pas). undefined : rien d'enregistré, ou rien qui soit sûrement à cette table.
 */
export function readTableRecords(entry: Pick<TableEntry, 'folder' | 'file' | 'title'>): TableRecords | undefined {
  const file = vpRegFile(entry);
  const reg = readVpReg(file);
  if (!reg) return undefined;
  const candidates = [...reg].map(([storage, vals]) => ({ storage, ...recordsOf(vals) })).filter((c) => c.scores.length || c.credits !== undefined);
  let chosen = candidates.length === 1 ? candidates[0] : undefined;
  if (candidates.length > 1) {
    const names = [simple(path.basename(entry.file, path.extname(entry.file))), simple(entry.title)];
    const matching = candidates.filter((c) => simple(c.storage).length >= 3 && names.some((n) => n.includes(simple(c.storage))));
    if (matching.length === 1) chosen = matching[0];
  }
  return chosen && { file, ...chosen };
}

/**
 * Scores entrés au tableau entre deux lectures (avant et après une partie) : ceux qui n'y
 * étaient pas, à leur place. Vide si rien n'a changé ou si l'une des lectures manque.
 */
export function newRecords(before: TableRecords | undefined, after: TableRecords | undefined): HighScore[] {
  if (!before || !after || before.storage !== after.storage) return [];
  const key = (s: HighScore) => `${s.score}:${s.initials ?? ''}`;
  const old = new Map<string, number>();
  for (const s of before.scores) old.set(key(s), (old.get(key(s)) ?? 0) + 1);
  return after.scores.filter((s) => {
    const left = old.get(key(s)) ?? 0;
    old.set(key(s), left - 1);
    return left <= 0;
  });
}

/** « 75,000,000 » : les chiffres groupés par trois, à la manière des DMD. */
export function dmdScore(score: number): string {
  return String(score).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
