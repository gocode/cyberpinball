// Limite de débit des téléchargements depuis les amis (Menu système > Amis > « Partage et
// réseau » > « Débit des téléchargements »), choisie par le joueur dans social.json.
//
// Règles :
// - c'est la borne qui envoie qui ralentit : elle seule pousse les morceaux, et freiner la
//   réception bloquerait aussi la présence et les messages, qui passent par le même canal ;
// - le receveur donne son débit dans la demande (file-get `rate`), puis le corrige en cours de
//   route (file-rate) quand la limite change ou qu'un autre ami se met à envoyer : la limite
//   vaut pour l'ensemble, partagée à parts égales entre les envois en cours (rateShare) ;
// - une borne d'avant ce réglage ignore `rate` et file-rate : elle envoie à pleine vitesse ;
// - le rythme est tenu en moyenne : un réveil en retard (minuteurs de Windows, environ 15 ms)
//   est rattrapé sur les morceaux suivants, dans la limite de RATE_BURST_MS d'avance.

import { formatNumber, t } from './i18n';
import { formatRate } from './transfer';

/** Octets par seconde ; 0 : sans limite. */
export type ByteRate = number;

const MO = 1024 * 1024;

/** Choix proposés, en octets par seconde ; 0 : sans limite (défaut). */
export const DOWNLOAD_RATE_CHOICES: readonly ByteRate[] = [0, MO / 4, MO / 2, MO, 2 * MO, 5 * MO, 10 * MO, 20 * MO];

/** Plus grand débit accepté d'un ami (1 Go/s) : au-delà, la valeur est invalide. */
export const RATE_MAX: ByteRate = 1024 * MO;
/**
 * Plus petit débit accepté (16 ko/s, un morceau de 64 ko toutes les 4 s) : un envoi ne s'endort
 * jamais assez longtemps pour garder la place d'un ami (un envoi à la fois) ni dépasser le délai
 * du receveur (30 s sans morceau).
 */
export const RATE_MIN: ByteRate = 16 * 1024;

/** Avance qu'un envoi peut prendre après un réveil en retard. */
export const RATE_BURST_MS = 250;

/** Débit lu d'un fichier ou d'un message : 0, ou un entier de RATE_MIN à RATE_MAX ; sinon undefined. */
export function parseRate(value: unknown): ByteRate | undefined {
  return typeof value === 'number' && Number.isInteger(value) && (value === 0 || (value >= RATE_MIN && value <= RATE_MAX)) ? value : undefined;
}

/** « 512 ko/s (4,2 Mbit/s) », « 2,0 Mo/s (17 Mbit/s) » : le débit du gestionnaire, et celui des box ; 0 : « sans limite ». */
export function rateLabel(rate: ByteRate): string {
  if (!rate) return t('sans limite');
  const mbit = (rate * 8) / 1_000_000;
  return t('{rate} ({bits} Mbit/s)', { rate: formatRate(rate), bits: formatNumber(mbit, { maximumFractionDigits: mbit >= 10 ? 0 : 1 }) });
}

/** La limite partagée entre `count` envois en cours ; 0 : sans limite. Jamais moins de RATE_MIN. */
export function rateShare(limit: ByteRate, count: number): ByteRate {
  if (!limit) return 0;
  return Math.max(RATE_MIN, Math.floor(limit / Math.max(1, count)));
}

export interface PacerClock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

const realClock: PacerClock = {
  now: () => performance.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

/** Rythme d'un envoi : take(n) attend que n octets puissent partir sans dépasser le débit. */
export class RatePacer {
  /** Instant (ms) où tout ce qui est parti aura été « payé » au débit voulu. */
  private paid: number | undefined;
  constructor(
    private rate: ByteRate,
    private readonly clock: PacerClock = realClock,
  ) {}

  get current(): ByteRate {
    return this.rate;
  }

  /** Nouveau débit, pour la suite de l'envoi (0 : sans limite). */
  setRate(rate: ByteRate): void {
    this.rate = rate;
  }

  async take(bytes: number): Promise<void> {
    if (!this.rate) {
      this.paid = undefined;
      return;
    }
    const now = this.clock.now();
    const from = Math.max(this.paid ?? now, now - RATE_BURST_MS);
    this.paid = from + (bytes * 1000) / this.rate;
    const wait = this.paid - now;
    if (wait > 0) await this.clock.sleep(wait);
  }
}
