// Fermeture de VPX qui ne se termine pas (PinCab, 28/11/2026, Back to the Future, trois sorties sur
// cinq) : Exit tenu quelques secondes, VPX écrit « Closing player… » puis « PUP Manager stop » et plus
// rien, ni déchargement des plugins ni fin de processus. Le fil principal reste bloqué dans l'arrêt du
// PuP-Pack, le son de la bille tourne en boucle sur le dernier tampon, l'écran reste figé et le
// front-end attend toujours la fin du processus : le joueur doit redémarrer la borne. Une fermeture
// normale prend moins de deux secondes (arrêt de DOF compris) ; passé VPX_SHUTDOWN_KILL_MS, Cyber
// Pinball ferme VPX (la partie a eu lieu, son score est relevé comme pour toute sortie).

/** Durée de fermeture au-delà de laquelle VPX est jugé bloqué. */
export const VPX_SHUTDOWN_KILL_MS = 10_000;

/** Heure locale d'une ligne du journal de VPX (« 2026-11-28 01:34:54.694 INFO … »), en ms, sinon undefined. */
export function vpxLogLineTime(line: string): number | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})\.(\d{3})\b/.exec(line);
  if (!m) return undefined;
  return new Date(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!, +m[6]!, +m[7]!).getTime();
}

/** La fin du journal de VPX dit-elle que la partie se ferme (« Closing player… »), depuis `since` ? */
export function vpxClosingLogged(tail: string, since: number): boolean {
  const lines = tail.split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]!;
    if (!line.includes('Closing player')) continue;
    const at = vpxLogLineTime(line);
    // Une partie précédente (journal cumulé) ne compte pas ; une ligne sans heure compte (journal reformaté).
    return at === undefined || at >= since - 1000;
  }
  return false;
}

/** VPX s'est tu en arrêtant le PuP-Pack : la dernière ligne utile du journal est « PUP Manager stop ». */
export function vpxStuckInPup(tail: string): boolean {
  const last = tail.split(/\r?\n/).filter((l) => l.trim()).pop() ?? '';
  return /PUP Manager stop/.test(last);
}

export interface ShutdownWatch {
  /** Depuis quand la fermeture dure ; undefined : la partie tourne. */
  since: number | undefined;
  /** La fermeture a trop duré : VPX est à fermer. */
  kill: boolean;
}

/**
 * Un tour du guet. `ending` : la fenêtre de jeu a disparu, ou ne répond plus pendant que le journal
 * dit « Closing player… ». Revenu à faux (fenêtre retrouvée), le compte repart de zéro.
 */
export function watchVpxShutdown(since: number | undefined, ending: boolean, now: number, limitMs = VPX_SHUTDOWN_KILL_MS): ShutdownWatch {
  if (!ending) return { since: undefined, kill: false };
  const start = since ?? now;
  return { since: start, kill: now - start > limitMs };
}
