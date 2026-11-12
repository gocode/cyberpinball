// Cycle de vie du compagnon du casque (app/src/casque.ts) : un seul compagnon à la fois, et la sortie
// d'un ancien ne touche jamais à ce qui appartient au suivant.
//
// Panne du 12/11/2026 (0.1.11-essai.19, sur la borne) : à la fin d'une partie, le compagnon repart sur
// une session neuve. Le nouveau était lancé avant que l'ancien soit sorti ; la sortie de l'ancien
// fermait alors les écrans rendus pour le casque et le canal des textures… du nouveau. Le menu
// répondait, mais plus aucun écran n'arrivait dans le casque, à chaque retour au menu.

/** Temps au bout duquel un compagnon qui ne sort pas n'empêche plus d'en lancer un autre (il a été tué). */
export const COMPANION_LEAVE_MS = 15_000;

export class CompanionCycle<T> {
  private current: T | undefined;
  private readonly leaving = new Map<T, number>();

  /** Le compagnon en service (lancé, pas encore arrêté). */
  get running(): T | undefined {
    return this.current;
  }

  /** Nombre de compagnons arrêtés qui ne sont pas encore sortis. */
  get leavingCount(): number {
    return this.leaving.size;
  }

  /** Un compagnon peut être lancé : aucun en service, et aucun ancien encore en train de sortir. */
  canStart(now: number = Date.now()): boolean {
    if (this.current !== undefined) return false;
    for (const [child, since] of this.leaving) if (now - since > COMPANION_LEAVE_MS) this.leaving.delete(child);
    return this.leaving.size === 0;
  }

  started(child: T): void {
    this.current = child;
  }

  /** Arrêt demandé : il n'est plus en service, mais il sort encore. */
  stopping(child: T, now: number = Date.now()): void {
    if (this.current === child) this.current = undefined;
    this.leaving.set(child, now);
  }

  /**
   * Le compagnon est sorti. Vrai si ce qui est partagé entre les compagnons successifs (écrans rendus
   * pour le casque, textures, canal des textures) est à lui et doit être fermé ; faux si un autre
   * compagnon est déjà en service : il garde tout.
   */
  exited(child: T): boolean {
    this.leaving.delete(child);
    if (this.current === child) {
      this.current = undefined;
      return true;
    }
    return this.current === undefined;
  }
}

/**
 * Ligne « cadence » du compagnon : vrai quand le casque est porté, que des écrans rendus pour lui sont
 * attendus, et qu'aucune de leurs images n'est arrivée pendant la période (écrans invisibles au casque).
 */
export function cadenceWithoutScreens(line: string, expected: boolean): boolean {
  const m = /^cadence .*, (\d+) images recues$/.exec(line.trim());
  return expected && m !== null && Number(m[1]) === 0;
}
