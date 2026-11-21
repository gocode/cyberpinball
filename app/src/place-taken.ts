// Place prise (engagement, planche validée le 21/11/2026, `homeArene`) : à l'arrivée des scores relayés,
// un joueur passe devant moi au classement du jour, ou de tout temps, sur une version exacte que j'ai
// jouée (packages/core/src/overtakes.ts) → la notification « Léa vous a dépassé sur Attack from Mars ».
//
// - Une fois par table et par jour au plus : la clé de la notification porte la table et le jour, et le
//   journal d'Activité récente la garde d'un démarrage à l'autre.
// - Les règles des notifications (notices.ts) : partout, par-dessus VPX compris sauf si le réglage
//   « Masquer les notifications pendant les parties » le refuse ; rien en jeu local ni en mode invité.
// - « Reprendre ma place » lance directement la table (le clic sur la notification, Start sur sa ligne
//   d'Activité, le bouton de l'Arène) ; la table absente de la borne, la raison est dite.
// - Dans l'Arène, la place encore prise est l'action du moment et la première page de l'affiche.
//
// Sans electron à l'exécution : les tests chargent ce module avec des services d'essai.

import {
  laterNumber,
  placesTaken,
  placeTakenKey,
  placeTakenTable,
  say,
  stillTaken,
  t,
  tLater,
  type ActivityEntry,
  type NoticeEvent,
  type PlaceTaken,
  type RankedScore,
  type TableEntry,
  type TakenRef,
} from '@cyberpinball/core';
import type { DailyTablesService } from './daily-tables';

export interface PlaceTakenHost {
  daily: Pick<DailyTablesService, 'input' | 'localFor' | 'unavailable'>;
  /** La file des notifications (menu-notices.ts) : elle les consigne aussi au journal d'Activité. */
  push(events: readonly NoticeEvent[]): void;
  /** Le journal d'Activité récente : une place déjà annoncée aujourd'hui ne se redit pas, même après un redémarrage. */
  journal(): readonly Pick<ActivityEntry, 'kind' | 'key' | 'player' | 'who' | 'subject' | 'at'>[];
  /** Jeu local ou mode invité : rien ne s'annonce. */
  closed(): boolean;
  play(table: TableEntry): void;
  log(line: string): void;
  now?(): Date;
}

export interface PlaceTakenService {
  /** Des scores relayés tout juste gardés (social-net.ts, onScores). */
  scores(fresh: readonly RankedScore[]): void;
  /** Les places encore prises, la plus récente d'abord (l'Arène). */
  current(): PlaceTaken[];
  /** Start sur la ligne d'Activité, ou un clic sur la notification : lancer la table, ou pourquoi pas. */
  reach(key: string): { run?: () => void; gone?: string; status?: string };
  /** Ma table de cette version ; undefined : absente, ou une autre version seulement. */
  tableOf(taken: { board: string; balls?: number; title: string }): TableEntry | undefined;
}

/** Places gardées en mémoire au plus (les plus récentes). */
const KEPT_MAX = 20;
/** L'Arène relit les places au plus toutes les deux secondes (son affiche se redessine à chaque état). */
const TTL_MS = 2000;

export function createPlaceTaken(host: PlaceTakenHost): PlaceTakenService {
  const now = () => host.now?.() ?? new Date();
  /** Ce qui s'est annoncé depuis le démarrage (clé de la notification → de quoi la relire). */
  const kept = new Map<string, TakenRef>();
  let cache: { at: number; list: PlaceTaken[] } | undefined;

  /** Les places annoncées : celles de cette session, puis celles du journal (un redémarrage les garde). */
  function refs(): Map<string, TakenRef> {
    const out = new Map(kept);
    for (const e of host.journal()) {
      if (e.kind !== 'place-taken' || out.has(e.key) || !e.player) continue;
      const table = placeTakenTable(e.key);
      if (table) out.set(e.key, { ...table, title: say(e.subject) || '?', rival: e.player });
    }
    return out;
  }

  function said(key: string): boolean {
    return kept.has(key) || host.journal().some((e) => e.kind === 'place-taken' && e.key === key);
  }

  function off(): boolean {
    return host.closed() || host.daily.unavailable() !== undefined;
  }

  function scores(fresh: readonly RankedScore[]): void {
    if (off() || !fresh.length) return;
    const at = now();
    const taken = placesTaken(host.daily.input(), fresh, { now: at });
    const events: NoticeEvent[] = [];
    for (const p of taken) {
      const key = placeTakenKey(p, at);
      const already = said(key);
      kept.delete(key);
      kept.set(key, { board: p.board, ...(p.balls ? { balls: p.balls } : {}), title: p.title, rival: p.rival.key, period: p.period });
      if (already) {
        host.log(`Place prise : ${p.rival.name} sur ${p.title}, déjà annoncée aujourd'hui.`); // i18n-ignore : journal
        continue;
      }
      const params = { their: laterNumber(p.rival.score), mine: laterNumber(p.mine.score), rank: p.mine.rank };
      events.push({
        kind: 'place-taken',
        key,
        at: at.getTime(),
        who: p.rival.name,
        player: p.rival.key,
        subject: p.title,
        extra: p.period === 'today' ? tLater('{their} contre vos {mine} · vous êtes {rank}ᵉ du jour', params) : tLater('{their} contre vos {mine} · vous êtes {rank}ᵉ', params),
        place: { rank: p.mine.rank, of: p.players },
      });
      host.log(`Place prise : ${p.rival.name} passe devant sur ${p.title} (${p.period === 'today' ? 'jour' : 'tout temps'}, ${p.rival.score} contre ${p.mine.score}).`); // i18n-ignore : journal
    }
    while (kept.size > KEPT_MAX) kept.delete(kept.keys().next().value!);
    cache = undefined;
    if (events.length) host.push(events);
  }

  function current(): PlaceTaken[] {
    if (off()) return [];
    const at = now();
    if (cache && at.getTime() - cache.at >= 0 && at.getTime() - cache.at < TTL_MS) return cache.list;
    const input = host.daily.input();
    const seen = new Set<string>();
    const list: PlaceTaken[] = [];
    for (const ref of refs().values()) {
      const version = `${ref.board}|${ref.balls ?? ''}`;
      if (seen.has(version)) continue;
      const p = stillTaken(input, ref, at);
      if (!p) continue;
      seen.add(version);
      list.push(p);
    }
    list.sort((a, b) => Date.parse(b.rival.at) - Date.parse(a.rival.at));
    cache = { at: at.getTime(), list };
    return list;
  }

  function tableOf(taken: { board: string; balls?: number; title: string }): TableEntry | undefined {
    const local = host.daily.localFor(taken);
    return local.state === 'mine' ? local.table : undefined;
  }

  function reach(key: string): { run?: () => void; gone?: string; status?: string } {
    const table = placeTakenTable(key);
    const ref = refs().get(key);
    if (!table || !ref) return {};
    const local = host.daily.localFor({ ...table, title: ref.title });
    if (local.state === 'missing') return { gone: t('Table absente de cette borne') };
    if (local.state === 'other') return { gone: t('Vous n’avez plus cette version de la table') };
    if (local.state === 'pending') return { status: t('Version de la table en calcul') };
    const entry = local.table;
    const still = off() ? undefined : stillTaken(host.daily.input(), ref, now());
    return { run: () => host.play(entry), status: still ? t('Place encore prise') : t('Place reprise ou ancienne') };
  }

  return { scores, current, reach, tableOf };
}
