// Classements au téléphone (vue Scores de la page du téléphone, phone-remote.ts) : le tableau des
// scores d'une table tel que la borne le montre (scoreboard-menu.ts, table-scores.ts,
// table-rankings.ts), sans rien recalculer à part. La borne choisit, met en forme et traduit ; le
// téléphone ne reçoit que ce qui s'affiche : titres, rangs, noms, scores, pays, statut, la pastille
// d'un joueur (initiales, teinte, et son image par une adresse de la borne). Jamais une clé de
// joueur, un chemin, ni un identifiant interne : une table est un rang dans la liste envoyée, une
// image un jeton tiré au hasard, valable tant que la télécommande vit (remote-images.ts).
//
// Lecture seule : « Masquer un score… » reste à la borne. La table ouverte par défaut est celle que
// la borne a choisie (roue) ou lancée (partie). En mode invité, les classements suivent la porte
// de la borne (« sheet.scores ») et la collection imposée.
//
// Sans electron à l'exécution : les tests du cœur le chargent avec un tableau d'essai.

import * as path from 'node:path';
import { isAvatarFileName, mediaPathFromUrl, REMOTE_ENTRIES_MAX, RANKING_SCOPES, t, type AvatarView, type RankingScope, type ScorePeriod, type TableEntry } from '@cyberpinball/core';
import { rankingScoreboardView, scoreboardView, type ScoreboardLineView, type ScoreboardView } from './scoreboard-menu';
import type { RemoteImages } from './remote-images';
import type { PlayerStatus, RankingView } from './table-rankings';
import type { TableBoard } from './table-scores';

export interface RemoteRanksHost {
  /** Les tables à proposer (en mode invité, celles de la collection imposée). */
  tables(): readonly TableEntry[];
  /** La table choisie (roue) ou lancée (partie) à la borne. */
  current(): TableEntry | undefined;
  scores(table: TableEntry, period: ScorePeriod): TableBoard;
  rankings(table: TableEntry, scope: Exclude<RankingScope, 'cabinet'>, period: ScorePeriod): RankingView;
  /** Pourquoi la borne ne montre pas les classements (porte du mode invité fermée) ; undefined : ouverts. */
  closed?(): string | undefined;
  /**
   * Les images sous jeton de la page du téléphone : celles du serveur du téléphone (phone-remote.ts,
   * `images`), le seul qui les sert. Un magasin à part donnerait des jetons que la borne ne sert pas.
   */
  images: RemoteImages;
  now?(): Date;
}

/** Une table de la liste du téléphone. */
export interface RanksTableItem {
  label: string;
  detail?: string;
}

/** La liste des tables, et celle de la borne (rang, -1 : aucune). */
export interface RanksTables {
  items: RanksTableItem[];
  current: number;
  /** Les classements ne se lisent pas au téléphone : pourquoi. */
  locked?: string;
}

/** Une ligne du tableau, telle que le téléphone l'affiche (ScoreboardLineView, la pastille en adresse de la borne). */
export interface RanksLine {
  rank: string;
  name: string;
  anonymous?: boolean;
  score: string;
  when: string;
  first?: boolean;
  country?: string;
  countryName?: string;
  flag?: string;
  apart?: boolean;
  avatar?: AvatarView;
  status?: PlayerStatus;
  mine?: boolean;
}

/** Le tableau d'une table pour une portée et une période, comme à la borne. */
export interface RanksBoard {
  table: { title: string; detail?: string };
  /** Les portées ; `reason` : le classement est indisponible (grisé), pourquoi. */
  scopes: { scope: RankingScope; label: string; current: boolean; reason?: string }[];
  tabs: { period: ScorePeriod; label: string; count: string; current: boolean }[];
  lines: RanksLine[];
  empty?: { title: string; detail: string };
  note?: string;
  position?: string;
  legend?: ScoreboardView['legend'];
}

export interface RemoteRanks {
  /** La liste des tables, et les fichiers dans le même ordre (gardés par la borne, jamais envoyés). */
  tables(): RanksTables & { files: string[] };
  /** Le tableau d'une table (son fichier ; absent : celle de la borne), ou pourquoi il n'y en a pas. */
  board(file: string | undefined, scope: RankingScope, period: ScorePeriod): { file: string; board: RanksBoard } | { file?: undefined; empty: { title: string; detail: string } };
  /** Le fichier d'une pastille d'après son jeton ; undefined pour un jeton inconnu. */
  avatar(token: string): string | undefined;
  /** La télécommande s'endort : les jetons ne valent plus rien. */
  reset(): void;
}

/** L'adresse d'une pastille pour le téléphone (un fichier d'avatar seulement, sous jeton), ou rien. */
export function remoteAvatarSrc(images: RemoteImages, src: string | undefined): string | undefined {
  const file = src ? mediaPathFromUrl(src) : undefined;
  return file && isAvatarFileName(path.basename(file)) ? images.src(file) : undefined;
}

/** La pastille d'un joueur telle qu'elle part au téléphone : initiales, teinte, image sous jeton. */
export function remoteAvatar(images: RemoteImages, avatar: AvatarView): AvatarView {
  const src = remoteAvatarSrc(images, avatar.src);
  return { initials: avatar.initials, hue: avatar.hue, ...(src ? { src } : {}) };
}

const tableDetail = (table: TableEntry) => [table.manufacturer, table.year, table.version].filter(Boolean).join(' · ') || undefined;

export function createRemoteRanks(host: RemoteRanksHost): RemoteRanks {
  const images = host.images;

  function line(l: ScoreboardLineView): RanksLine {
    const { avatar, ...rest } = l;
    return avatar ? { ...rest, avatar: remoteAvatar(images, avatar) } : rest;
  }

  function listed(): readonly TableEntry[] {
    return host.tables().slice(0, REMOTE_ENTRIES_MAX);
  }

  return {
    tables() {
      const list = listed();
      const current = host.current();
      const locked = host.closed?.();
      return {
        items: list.map((table) => ({ label: table.title, ...(tableDetail(table) ? { detail: tableDetail(table) } : {}) })),
        current: current ? list.findIndex((x) => x.file === current.file) : -1,
        ...(locked ? { locked } : {}),
        files: list.map((x) => x.file),
      };
    },
    board(file, scope, period) {
      const locked = host.closed?.();
      if (locked) return { empty: { title: t('Classements fermés'), detail: locked } };
      const list = listed();
      if (!list.length) return { empty: { title: t('Aucune table sur cette borne'), detail: t('Une table ajoutée à la borne a ici son tableau des scores.') } };
      const table = (file ? list.find((x) => x.file === file) : undefined) ?? list.find((x) => x.file === host.current()?.file) ?? list[0]!;
      const now = host.now?.() ?? new Date();
      // Chaque classement en réseau une fois par portée et par période, pour le tableau et la raison des portées grisées.
      const seen = new Map<string, RankingView>();
      const view = (s: Exclude<RankingScope, 'cabinet'>, p: ScorePeriod): RankingView => {
        const k = `${s}:${p}`;
        if (!seen.has(k)) seen.set(k, host.rankings(table, s, p));
        return seen.get(k)!;
      };
      const shown = scope === 'cabinet' ? scoreboardView((p) => host.scores(table, p), period, now) : rankingScoreboardView((p) => view(scope, p), scope, period, now);
      const board: RanksBoard = {
        table: { title: table.title, ...(tableDetail(table) ? { detail: tableDetail(table) } : {}) },
        scopes: (shown.scopes ?? []).map(({ scope: s, label, current }) => {
          const reason = s === 'cabinet' ? undefined : view(s, period).unavailable;
          return { scope: s, label, current, ...(reason ? { reason } : {}) };
        }),
        tabs: shown.tabs.map(({ period: p, label, count, current }) => ({ period: p, label, count, current })),
        lines: shown.lines.map(line),
        ...(shown.empty ? { empty: shown.empty } : {}),
        ...(shown.note ? { note: shown.note } : {}),
        ...(shown.position ? { position: shown.position } : {}),
        ...(shown.legend ? { legend: shown.legend } : {}),
      };
      // Les quatre portées, toujours dans l'ordre de la borne.
      if (board.scopes.length !== RANKING_SCOPES.length) throw new Error('portées du tableau des scores incomplètes'); // i18n-ignore : erreur interne
      return { file: table.file, board };
    },
    avatar: (token) => images.get(token)?.file,
    reset: () => images.reset(),
  };
}
