// Adresse stable du téléphone gardé (packages/core/src/remote-relay.ts) : la borne déclare au service
// du projet son adresse locale, chiffrée pour chacun de ses téléphones gardés, et signée. Le raccourci
// du téléphone, https://t.cyberpinball.com/b/<id>, la retrouve ainsi même quand le routeur change son
// adresse IP.
//
// Quand : dès que la télécommande écoute sur le réseau local (adresse connue) et garde au moins un
// téléphone ; de nouveau quand l'adresse, le port ou les téléphones changent, et au moins une fois par
// semaine (le service oublie une borne silencieuse après 60 jours). Fonction coupée à la borne, ou
// dernier téléphone oublié : une déclaration vide, que le service efface. Le service injoignable
// (pas d'Internet, panne) : nouvel essai de plus en plus espacé, jamais bloquant ; le téléphone garde
// la dernière adresse connue.
//
// Jamais pendant un essai sans réseau réel : seule une IPv4 privée se déclare (relayAddressOk), et
// la télécommande d'un essai écoute sur 127.0.0.1.

import { relayAddressOk, relayId, relayKeys, relayPhoneUrl, relayRecord, relaySum, RELAY_ORIGIN, RELAY_REFRESH_MS, type KeptPhones } from '@cyberpinball/core';

/** Délais avant un nouvel essai après un échec : une minute, cinq, trente, puis toutes les deux heures. */
export const RELAY_RETRY_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3_600_000];
/** Délai d'une déclaration (le service répond vite, une borne sans Internet ne doit pas attendre). */
export const RELAY_TIMEOUT_MS = 10_000;

export interface PhoneRelayOptions {
  kept: Pick<KeptPhones, 'keys' | 'relaySeed' | 'relayOn' | 'relayPublished' | 'noteRelayPublished'>;
  /** Le service ; par défaut RELAY_ORIGIN (CYBERPINBALL_RELAIS pendant un essai). */
  origin?: string;
  fetch?: typeof fetch;
  now?: () => number;
  log?: (line: string) => void;
}

export function createPhoneRelay(opts: PhoneRelayOptions) {
  const origin = (opts.origin ?? RELAY_ORIGIN).replace(/\/+$/, '');
  const host = origin.replace(/^https?:\/\//, '');
  const doFetch = opts.fetch ?? fetch;
  const now = opts.now ?? Date.now;
  const log = opts.log ?? (() => undefined);
  const kept = opts.kept;
  let busy = false;
  /** Une demande arrivée pendant un envoi : refaite à la fin. */
  let again: { host: string; port: number } | undefined | null = null;
  let failures = 0;
  let nextTry = 0;
  /** Ce que dit la dernière tentative, pour la Santé et le journal (une ligne par changement). */
  let lastError: string | undefined;
  let id: string | undefined;

  /** Ce que la borne doit déclarer maintenant : un résumé, ou undefined pour effacer. */
  function wanted(address: { host: string; port: number } | undefined): { sum: string; phones: Buffer[] } | undefined {
    const phones = kept.keys().map((k) => k.key);
    if (!kept.relayOn() || !phones.length || !address || !relayAddressOk(address.host, address.port)) return undefined;
    return { sum: relaySum(address.host, address.port, phones), phones };
  }

  async function put(address: { host: string; port: number } | undefined, phones: Buffer[]): Promise<number> {
    const at = now();
    const record = relayRecord({ seed: kept.relaySeed(), host: address?.host ?? '0.0.0.0', port: address?.port ?? 0, phones, now: at });
    id = record.id;
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), RELAY_TIMEOUT_MS);
    try {
      const r = await doFetch(`${origin}/api/b/${record.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(record.payload), signal: ctl.signal });
      return r.status;
    } finally {
      clearTimeout(timer);
    }
  }

  async function run(address: { host: string; port: number } | undefined): Promise<void> {
    const want = wanted(address);
    const published = kept.relayPublished();
    const t = now();
    // Rien à effacer : la borne n'a jamais rien déclaré, ou le service l'a déjà oubliée.
    if (!want && !published) return;
    // Pas d'adresse locale pour l'instant (réseau perdu) alors que la fonction est active et garde des
    // téléphones : la dernière déclaration reste, le téléphone garde la dernière adresse.
    if (!want && kept.relayOn() && kept.keys().length) return;
    if (want && published?.sum === want.sum && t - published.at < RELAY_REFRESH_MS) return;
    if (t < nextTry) return;
    let status: number | undefined;
    let error: string | undefined;
    try {
      status = await put(want ? address : undefined, want?.phones ?? []);
    } catch (e) {
      error = (e as Error).name === 'AbortError' ? 'délai dépassé' : (e as Error).message; // i18n-ignore : journal
    }
    if (status !== undefined && status >= 200 && status < 300) {
      kept.noteRelayPublished(want?.sum, now());
      failures = 0;
      nextTry = 0;
      lastError = undefined;
      log(want ? `Télécommande : adresse stable déclarée à ${host} (${want.phones.length} téléphone${want.phones.length > 1 ? 's' : ''}).` : `Télécommande : adresse stable effacée chez ${host}.`); // i18n-ignore : journal
      return;
    }
    const why = error ?? `réponse ${status}`; // i18n-ignore : journal
    const wait = RELAY_RETRY_MS[Math.min(failures++, RELAY_RETRY_MS.length - 1)]!;
    nextTry = now() + wait;
    if (why !== lastError) log(`Télécommande : adresse stable non déclarée à ${host} (${why}) ; nouvel essai dans ${Math.round(wait / 60_000)} min.`); // i18n-ignore : journal
    lastError = why;
  }

  return {
    /**
     * La télécommande écoute à `address` (ou n'a plus d'adresse locale) : déclare ce qui a changé.
     * Peut être appelé souvent (battement de la télécommande) : ne fait rien tant que rien ne change.
     */
    update(address: { host: string; port: number } | undefined): void {
      if (busy) {
        again = address;
        return;
      }
      busy = true;
      void run(address).finally(() => {
        busy = false;
        if (again !== null) {
          const next = again;
          again = null;
          this.update(next);
        }
      });
    },
    /**
     * L'entrée stable à donner au téléphone gardé : seulement si la fonction est active et que le
     * service a accepté une déclaration de cette borne (sinon le raccourci ne mènerait nulle part).
     */
    url(): string | undefined {
      if (!kept.relayOn() || !kept.relayPublished()) return undefined;
      id ??= relayId(relayKeys(kept.relaySeed()).publicKey);
      return relayPhoneUrl(origin, id);
    },
    /** La fonction est-elle active, déclarée, et sinon pourquoi (écran de la télécommande, Santé). */
    state: () => ({ on: kept.relayOn(), published: kept.relayPublished()?.at, error: lastError, host }),
    /** Pour les essais : un envoi est-il en cours ? */
    busy: () => busy,
  };
}

export type PhoneRelay = ReturnType<typeof createPhoneRelay>;
