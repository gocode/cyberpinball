// Chronomètre de l'ouverture d'un écran de l'assistant : depuis le démarrage du processus
// (relancé par le menu, le joueur attend devant l'ancien écran) jusqu'à la première fenêtre
// montrée. Chaque étape du démarrage y laisse un repère ; le rapport va au journal, et le plafond
// (OUVERTURE_PLAFOND_MS) est ce que les essais sans opérateur contrôlent (avertissement du journal).

/** Au-delà, l'ouverture est jugée trop lente pour un joueur qui vient de valider une ligne du menu. */
export const OUVERTURE_PLAFOND_MS = 4000;

interface Repere {
  etape: string;
  /** Millisecondes depuis le démarrage du processus. */
  ms: number;
}

const reperes: Repere[] = [];

/** Millisecondes depuis le démarrage du processus (injectable pour les tests). */
let horloge: () => number = () => Math.round(process.uptime() * 1000);

export function reglerHorloge(f: (() => number) | undefined): void {
  horloge = f ?? (() => Math.round(process.uptime() * 1000));
  reperes.length = 0;
}

export function reperer(etape: string): void {
  reperes.push({ etape, ms: horloge() });
}

/** Durée de chaque étape (écart avec le repère d'avant), et le total au dernier repère. */
export function rapportOuverture(): { total: number; etapes: { etape: string; duree: number }[] } {
  let avant = 0;
  const etapes = reperes.map((r) => {
    const duree = r.ms - avant;
    avant = r.ms;
    return { etape: r.etape, duree };
  });
  return { total: avant, etapes };
}

/** Ligne de journal : « Ouverture de l'assistant : 2 310 ms (démarrage 900, écrans 120…) », avec avertissement au-delà du plafond. */
export function lignePourLeJournal(nom: string, plafond = OUVERTURE_PLAFOND_MS): { texte: string; lente: boolean } {
  const { total, etapes } = rapportOuverture();
  const detail = etapes.map((e) => `${e.etape} ${e.duree}`).join(', ');
  const lente = total > plafond;
  return { texte: `${nom} : ${total} ms jusqu'à l'écran montré (${detail})${lente ? ` ; plus que le plafond de ${plafond} ms` : ''}.`, lente }; // i18n-ignore : journal
}
