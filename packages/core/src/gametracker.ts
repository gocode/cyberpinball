// Les parties d'une session de table, suivies en direct (essai du 25/11/2026 : seule la
// dernière partie d'une session était gardée, et une partie quittée à la 2e bille, parfois meilleure
// que le record, n'était pas relevée). Le suivi reçoit un échantillon par seconde environ (partie en
// cours ou non, bille, scores de chaque joueur), d'où qu'il vienne (inspector de VPX, relevé du double),
// et rend les parties : chacune avec son heure, ses scores, la bille atteinte, finie ou quittée.
//
// Une partie commence au premier échantillon « en cours » ; elle finit quand la table revient à
// l'attente et y reste (SETTLE_MS : un instant sans partie entre deux billes ou pendant la saisie des
// initiales ne la coupe pas) ; une autre partie commence sans retour à l'attente quand la bille repart
// de plus bas (redémarrage rapide) ou que les scores retombent à zéro. VPX quitté : la partie en cours
// est gardée avec son dernier score connu, non finie. Une partie sans aucun point n'est pas gardée.
//
// Pur : le temps vient des échantillons, aucune dépendance (tests du cœur).

/** Ce que la table dit à un instant. */
export interface GameSample {
  /** Millisecondes (horloge de l'appelant, croissante). */
  at: number;
  inGame: boolean;
  ball: number;
  /** Score de chaque joueur, du premier au dernier (un seul score : un tableau d'un élément). */
  scores: readonly number[];
}

export interface TrackedGame {
  /** Début et fin, en millisecondes de l'horloge des échantillons. */
  startedAt: number;
  endedAt?: number;
  /** Dernier score connu de chaque joueur (le plus haut vu : un score ne baisse pas). */
  scores: number[];
  /** Bille la plus haute atteinte. */
  ball: number;
  /** La partie est allée à son terme (la table est revenue à l'attente) ; faux : VPX quitté ou partie recommencée en cours. */
  finished: boolean;
}

/** Temps sans partie qu'il faut pour que la partie soit finie. */
export const GAME_SETTLE_MS = 3000;

export class GameTracker {
  private readonly done: TrackedGame[] = [];
  private current: TrackedGame | undefined;
  /** Premier échantillon « hors partie » de la série en cours. */
  private idleSince: number | undefined;

  /** Un échantillon ; rend la partie qu'il vient de terminer, s'il y en a une. */
  feed(s: GameSample): TrackedGame | undefined {
    let ended: TrackedGame | undefined;
    const total = (g: readonly number[]) => g.reduce((a, b) => a + b, 0);
    if (s.inGame) {
      this.idleSince = undefined;
      const c = this.current;
      // Redémarrage rapide : la bille repart de plus bas, ou les points retombent à zéro.
      if (c && (s.ball < c.ball || (total(c.scores) > 0 && total(s.scores) === 0))) {
        ended = this.close(c, s.at, false);
        this.current = undefined;
      }
      if (!this.current) this.current = { startedAt: s.at, scores: [], ball: 0, finished: false };
      const g = this.current;
      s.scores.forEach((v, i) => {
        if (Number.isSafeInteger(v) && v > (g.scores[i] ?? 0)) g.scores[i] = v;
      });
      for (let i = 0; i < g.scores.length; i++) g.scores[i] ??= 0;
      if (s.ball > g.ball) g.ball = s.ball;
      return ended;
    }
    const c = this.current;
    if (!c) return undefined;
    this.idleSince ??= s.at;
    // Les scores de la fin de partie se lisent encore à l'attente : gardés si plus hauts.
    s.scores.forEach((v, i) => {
      if (Number.isSafeInteger(v) && v > (c.scores[i] ?? 0)) c.scores[i] = v;
    });
    if (s.at - this.idleSince < GAME_SETTLE_MS) return undefined;
    ended = this.close(c, this.idleSince, true);
    this.current = undefined;
    this.idleSince = undefined;
    return ended;
  }

  /** VPX quitté (ou relevé perdu) : la partie en cours est gardée, non finie. */
  stop(at: number): TrackedGame | undefined {
    const c = this.current;
    if (!c) return undefined;
    this.current = undefined;
    this.idleSince = undefined;
    return this.close(c, at, false);
  }

  /** Parties terminées, dans l'ordre, la partie en cours comprise (non finie). */
  games(): TrackedGame[] {
    return [...this.done, ...(this.current && this.current.scores.some((v) => v > 0) ? [{ ...this.current, scores: [...this.current.scores] }] : [])];
  }

  private close(g: TrackedGame, at: number, finished: boolean): TrackedGame | undefined {
    g.endedAt = at;
    g.finished = finished;
    if (!g.scores.some((v) => v > 0)) return undefined;
    this.done.push(g);
    return g;
  }
}
