// Progression d'un téléchargement, dite partout de la même façon : bandeau de la fenêtre
// « Récupérer », notice du menu et de la liste d'attente, propositions de médias.
// « 48,2 Mo sur 312 Mo · 3,1 Mo/s · environ 1 min » ; taille inconnue : « 48,2 Mo · 3,1 Mo/s ».
//
// Le débit est lissé (moyenne simple les trois premières secondes, puis moyenne
// exponentielle) : un paquet en retard ou une rafale ne font pas sauter le temps restant
// d'une minute à une heure. Il n'est dit qu'après une seconde de mesure ; avant, il ne
// voudrait rien dire.

import { formatSize } from './fileops';
import { formatNumber, t } from './i18n';

/** Où en est un téléchargement : octets reçus, total s'il est connu, débit et temps restant s'ils sont mesurés. */
export interface TransferProgress {
  received: number;
  /** Absent quand le site ne donne pas la taille. */
  total?: number;
  /** Octets par seconde, lissé. */
  rate?: number;
  /** Secondes restantes, au débit lissé (taille connue seulement). */
  remaining?: number;
}

/** Constante de temps du lissage du débit, en millisecondes. */
const SMOOTHING_MS = 3000;
/** Mesure nécessaire avant de dire un débit. */
const FIRST_RATE_MS = 1000;

/**
 * Compteur d'un téléchargement : à chaque relevé (octets reçus à l'instant `at`), rend
 * la progression avec le débit lissé et le temps restant. Un relevé sans octet nouveau
 * fait baisser le débit : un téléchargement qui cale le montre.
 */
export function createTransferMeter(start = Date.now()) {
  let lastAt = start;
  let lastReceived: number | undefined;
  let firstReceived = 0;
  let rate: number | undefined;
  let measured = 0;
  return {
    update(received: number, total?: number, at = Date.now()): TransferProgress {
      if (lastReceived === undefined || received < lastReceived) {
        // Premier relevé (ou reprise depuis zéro) : rien à mesurer encore.
        lastReceived = firstReceived = received;
        lastAt = at;
      } else if (at > lastAt) {
        const dt = at - lastAt;
        measured += dt;
        if (measured <= SMOOTHING_MS) {
          // Les premières secondes : la moyenne depuis le début, que le lissage partant de
          // zéro sous-estimerait longtemps.
          rate = ((received - firstReceived) * 1000) / measured;
        } else {
          const instant = ((received - lastReceived) * 1000) / dt;
          rate = rate! + (1 - Math.exp(-dt / SMOOTHING_MS)) * (instant - rate!);
        }
        lastReceived = received;
        lastAt = at;
      }
      const known = total !== undefined && total > 0 ? total : undefined;
      const shown = measured >= FIRST_RATE_MS ? rate : undefined;
      const left = known !== undefined ? Math.max(0, known - received) : undefined;
      return {
        received,
        ...(known !== undefined ? { total: known } : {}),
        ...(shown !== undefined ? { rate: shown } : {}),
        ...(left !== undefined && shown !== undefined && shown > 0 ? { remaining: left / shown } : {}),
      };
    },
    /** En pause : la mesure repart de zéro à la reprise, sans compter l'arrêt comme un débit nul. */
    pause(): void {
      lastReceived = undefined;
      firstReceived = 0;
      rate = undefined;
      measured = 0;
    },
  };
}

export type TransferMeter = ReturnType<typeof createTransferMeter>;

/** Pourcentage reçu, entier de 0 à 100 ; undefined quand la taille est inconnue. */
export function transferPercent(p: Pick<TransferProgress, 'received' | 'total'>): number | undefined {
  if (!p.total) return undefined;
  return Math.max(0, Math.min(100, Math.floor((p.received / p.total) * 100)));
}

/** « 3,1 Mo/s ». */
export function formatRate(bytesPerSecond: number): string {
  return t('{size}/s', { size: formatSize(Math.max(0, Math.round(bytesPerSecond)), true) });
}

/**
 * Temps restant, arrondi pour ne pas trembler : « quelques secondes », « environ 25 s »,
 * « environ 4 min », « environ 1 h 20 min » ; undefined au-delà de quatre jours (ou sans débit).
 */
export function formatRemaining(seconds: number): string | undefined {
  if (!Number.isFinite(seconds) || seconds < 0 || seconds > 4 * 24 * 3600) return undefined;
  if (seconds < 10) return t('quelques secondes');
  if (seconds < 60) return t('environ {n} s', { n: formatNumber(Math.max(10, Math.round(seconds / 5) * 5)) });
  if (seconds < 3600 - 30) return t('environ {n} min', { n: formatNumber(Math.max(1, Math.round(seconds / 60))) });
  const minutes = Math.round(seconds / 300) * 5;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? t('environ {h} h {m} min', { h: formatNumber(h), m: formatNumber(m) }) : t('environ {h} h', { h: formatNumber(h) });
}

/** Volume reçu : « 48,2 Mo sur 312 Mo », ou « 48,2 Mo » quand la taille est inconnue. */
export function formatReceived(p: Pick<TransferProgress, 'received' | 'total'>): string {
  return p.total ? t('{got} sur {total}', { got: formatSize(p.received, true), total: formatSize(p.total) }) : formatSize(p.received, true);
}

/**
 * Progression en une ligne : « 48,2 Mo sur 312 Mo · 3,1 Mo/s · environ 1 min » ; sans
 * taille connue, « 48,2 Mo · 3,1 Mo/s » ; débit et temps restant dits dès qu'ils sont mesurés.
 */
export function formatTransfer(p: TransferProgress): string {
  const parts = [formatReceived(p)];
  if (p.rate !== undefined) parts.push(formatRate(p.rate));
  const left = p.remaining !== undefined ? formatRemaining(p.remaining) : undefined;
  if (left) parts.push(left);
  return parts.join(' · ');
}
