// Relevé du score en direct d'une partie seul (packages/core/src/soloinspect.ts) : une fois par
// seconde, les valeurs de l'état de jeu que VPX publie par son inspector (127.0.0.1) ; le suivi
// (gametracker.ts) en tire les parties de la session, chacune avec son heure, et garde le dernier
// score connu si VPX est quitté en cours. La table n'est ni copiée ni modifiée.
//
// Aucun relevé n'est un échec : le relevé de la mémoire de la ROM, à la fermeture de VPX, reste.

import { GameTracker, inspectorIds, inspectorStates, type SoloInspectPlan, type TrackedGame } from '@cyberpinball/core';

/** La ROM, au démarrage, montre un instant la partie d'avant (livestate.ts) : ses échantillons « en partie » ne comptent pas. */
export const SOLO_WARMUP_MS = 6000;
const POLL_MS = 1000;

export interface SoloScoreWatch {
  /** Les parties relevées jusqu'ici, la partie en cours comprise (non finie). */
  games(): TrackedGame[];
  /** Au moins un relevé a répondu. */
  readable(): boolean;
  /** Arrêt de la lecture ; la partie en cours est gardée, non finie. */
  stop(): TrackedGame[];
}

export interface SoloScoreWatchOptions {
  port: number;
  plan: SoloInspectPlan;
  log?(line: string): void;
  /** Une partie vient de finir ou d'être quittée. */
  onGame?(game: TrackedGame, finished: boolean): void;
  /** La table passe en partie (une partie commence, ou reprend après un instant d'attente). */
  onPlay?(): void;
  now?(): number;
  fetch?: typeof fetch;
}

export function watchSoloScores(opts: SoloScoreWatchOptions): SoloScoreWatch {
  const now = opts.now ?? Date.now;
  const get = opts.fetch ?? fetch;
  const tracker = new GameTracker();
  const names = opts.plan.states.map((s) => s.name);
  let ids = new Map<string, string>();
  let firstRead: number | undefined;
  let stopped = false;
  let busy = false;
  let lastIn: boolean | undefined;
  let playing = false;

  const json = async (page: string): Promise<unknown> => (await get(`http://127.0.0.1:${opts.port}${page}`, { signal: AbortSignal.timeout(800) })).json();

  async function poll(): Promise<void> {
    if (stopped || busy) return;
    busy = true;
    try {
      if (ids.size < names.length) {
        ids = inspectorIds(await json('/api/tree'), names);
        if (ids.size < names.length) return;
      }
      const byId = inspectorStates(await json('/api/states'));
      const values = new Map<string, number>();
      for (const [name, id] of ids) {
        const v = byId.get(id);
        if (v !== undefined) values.set(name, v);
      }
      const at = now();
      const sample = opts.plan.decode(values);
      if (!sample) {
        ids = new Map();
        return;
      }
      firstRead ??= at;
      // Les premières secondes : la partie d'avant, que la ROM efface.
      const warm = at - firstRead < SOLO_WARMUP_MS;
      const ended = tracker.feed({ ...sample, at, inGame: sample.inGame && !warm });
      if (ended) opts.onGame?.(ended, ended.finished);
      const nowPlaying = sample.inGame && !warm;
      if (nowPlaying && !playing) opts.onPlay?.();
      playing = nowPlaying;
      const line = `${sample.inGame ? 'en partie' : 'attente'} bille ${sample.ball} scores ${sample.scores.join('/')}`; // i18n-ignore : journal
      if (sample.inGame !== lastIn) opts.log?.(`Relevé en direct : ${line}.`); // i18n-ignore : journal
      lastIn = sample.inGame;
    } catch {
      // VPX charge encore la table, ou l'inspector ne répond pas : au prochain tour.
    } finally {
      busy = false;
    }
  }

  const timer = setInterval(() => void poll(), POLL_MS);
  void poll();
  return {
    games: () => tracker.games(),
    readable: () => firstRead !== undefined,
    stop() {
      if (!stopped) {
        stopped = true;
        clearInterval(timer);
        const last = tracker.stop(now());
        if (last) opts.onGame?.(last, false);
      }
      return tracker.games();
    },
  };
}
