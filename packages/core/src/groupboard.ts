// Tableau des records du groupe (décision du 30/10/2026) : les scores des parties en direct classées,
// par version exacte de la table (même .vpx, même script joué : livegame.ts), gardés par chaque borne
// qui a joué (<données>\amis\records.json). On s'y défie d'une soirée à l'autre ; les tournois en
// auront un à eux, sur le même modèle.
//
// Dans la partie, le tableau de la table montre les records du groupe : avant le lancement, ils sont
// posés dans le VPReg.stg du double (tabledouble.ts), à la place de ceux de l'hôte, la dernière place
// laissée à zéro ; le score de chaque joueur y entre donc toujours, et se lit au retour. Seulement
// les valeurs : le fichier est modifié sur place (patchVpRegValues), sa structure jamais touchée.
// Une table qui garde ses records dans la mémoire de sa ROM (PinMAME) n'a pas encore de score lisible :
// rien n'y est posé, rien n'entre au tableau du groupe.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { CompoundFile } from './vpxinfo';
import { readVpReg } from './highscores';
import { liveRanked, liveScore, type LiveGame, type LiveTable } from './livegame';

export interface GroupRecord {
  /** Clé publique du joueur, son nom. */
  player: string;
  name: string;
  score: number;
  /** Initiales entrées au tableau de la table. */
  initials?: string;
  /** Joué le (ISO). */
  at: string;
  /** La partie en direct. */
  game: string;
}

export type GroupBoards = Record<string, GroupRecord[]>;

/** Places gardées par version de table. */
export const GROUP_BOARD_MAX = 20;

/** La version exacte d'une table : son .vpx et son script joué ; undefined sans empreinte. */
export function boardKey(table: Pick<LiveTable, 'print' | 'script'>): string | undefined {
  return table.print ? `${table.print}:${table.script ?? ''}` : undefined;
}

export function loadBoards(file: string): GroupBoards {
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
    return raw && typeof raw === 'object' ? (raw as GroupBoards) : {};
  } catch {
    return {};
  }
}

export function saveBoards(file: string, boards: GroupBoards): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(`${file}.part`, JSON.stringify(boards, null, 1) + '\n', 'utf8');
  fs.renameSync(`${file}.part`, file);
}

/**
 * Une partie finie entre au tableau : le meilleur record de chaque joueur classé (liveRanked :
 * réglages de l'hôte reçus, même nombre de billes). Rien deux fois pour la même partie ; vrai si
 * le tableau a changé.
 */
export function addGameToBoard(boards: GroupBoards, game: LiveGame, now = new Date()): boolean {
  const key = boardKey(game.table);
  if (!key || game.phase !== 'finished') return false;
  const board = boards[key] ?? [];
  if (board.some((r) => r.game === game.id)) return false;
  const added: GroupRecord[] = [];
  for (const p of game.players) {
    // Le score lu en direct d'abord (il ne dépend pas des initiales saisies), sinon le meilleur record entré.
    const best = [...(p.records ?? [])].sort((a, b) => b.score - a.score)[0];
    const score = liveScore(p);
    if (score === undefined || !liveRanked(p, game.table.balls)) continue;
    const initials = best && best.score === score ? best.initials : undefined;
    added.push({ player: p.key, name: p.name, score, ...(initials ? { initials } : {}), at: now.toISOString(), game: game.id });
  }
  if (!added.length) return false;
  boards[key] = [...board, ...added].sort((a, b) => b.score - a.score).slice(0, GROUP_BOARD_MAX);
  return true;
}

/** Le tableau d'une version de table, du meilleur score au moins bon. */
export function boardFor(boards: GroupBoards, table: Pick<LiveTable, 'print' | 'script'>): GroupRecord[] {
  const key = boardKey(table);
  return key ? [...(boards[key] ?? [])].sort((a, b) => b.score - a.score) : [];
}

/** Les initiales montrées par la table : celles entrées, sinon les trois premières lettres du nom. */
export function groupInitials(r: Pick<GroupRecord, 'initials' | 'name'>): string {
  return (r.initials ?? r.name.normalize('NFD').replace(/[^A-Za-z0-9]/g, '').slice(0, 3)).toUpperCase() || '???';
}

/**
 * Pose les records du groupe dans un VPReg.stg (celui du double) : le stockage qui tient un tableau
 * (HighScore1..N), les N - 1 meilleurs du groupe, la dernière place (et les suivantes) à zéro, pour
 * que le score du joueur y entre toujours. Seules les valeurs existantes sont réécrites, sur place.
 * undefined : pas de tableau dans le fichier (une table à ROM, ou sans VPReg), ou plusieurs.
 */
export function injectGroupRecords(file: string, records: readonly GroupRecord[]): { storage: string; places: number } | undefined {
  const reg = readVpReg(file);
  if (!reg) return undefined;
  const tables = [...reg].filter(([, values]) => values.has('HighScore1'));
  if (tables.length !== 1) return undefined;
  const [storage, values] = tables[0]!;
  let places = 0;
  while (values.has(`HighScore${places + 1}`)) places++;
  if (places < 2) return undefined;
  const best = [...records].sort((a, b) => b.score - a.score).slice(0, places - 1);
  const patch = new Map<string, string>();
  for (let rank = 1; rank <= places; rank++) {
    const r = best[rank - 1];
    patch.set(`HighScore${rank}`, r ? String(r.score) : '0');
    if (values.has(`HighScore${rank}Name`)) patch.set(`HighScore${rank}Name`, r ? groupInitials(r) : '');
  }
  patchVpRegValues(file, storage, patch);
  return { storage, places };
}

/**
 * Réécrit sur place des valeurs d'un VPReg.stg (texte UTF-16LE, sans zéro final, comme VPX les
 * écrit) : les octets dans la place déjà allouée au flux, et sa taille dans le répertoire. Une valeur
 * qui ne tient pas dans sa place est laissée telle quelle (rendue dans `skipped`).
 */
export function patchVpRegValues(file: string, storage: string, values: ReadonlyMap<string, string>): { skipped: string[] } {
  const skipped: string[] = [];
  const fd = fs.openSync(file, 'r+');
  try {
    const cfb = new CompoundFile(fd);
    const store = cfb.children(cfb.entries[0]!).find((e) => e.type === 1 && e.name === storage);
    if (!store) throw new Error(`stockage absent : ${storage}`); // i18n-ignore : erreur interne, journal
    const streams = cfb.children(store);
    for (const [key, value] of values) {
      const entry = streams.find((e) => e.type === 2 && e.name === key);
      const bytes = Buffer.from(value, 'utf16le');
      const spans = entry ? cfb.spans(entry) : [];
      const room = spans.reduce((n, s) => n + s.length, 0);
      // Seulement les petits flux (mini-flux) : une valeur enregistrée est un nombre ou quelques lettres.
      if (!entry || entry.size >= 4096 || bytes.length >= 4096 || bytes.length > room) {
        skipped.push(key);
        continue;
      }
      let done = 0;
      for (const span of spans) {
        const chunk = Buffer.alloc(span.length);
        bytes.copy(chunk, 0, done, Math.min(bytes.length, done + span.length));
        fs.writeSync(fd, chunk, 0, chunk.length, span.offset);
        done += span.length;
      }
      const size = Buffer.alloc(4);
      size.writeUInt32LE(bytes.length, 0);
      fs.writeSync(fd, size, 0, 4, cfb.entryOffset(entry) + 0x78);
    }
  } finally {
    fs.closeSync(fd);
  }
  return { skipped };
}
