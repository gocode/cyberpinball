// Relais des mises à jour : quand GitHub ne répond pas, les mêmes adresses se lisent par le service
// de Cyber Pinball (t.cyberpinball.com, routes /maj/… de packages/service-telephone), qui va les
// chercher sur GitHub à la place de la borne.
//
// Pourquoi : le 21/11/2026, une borne ne joignait plus GitHub depuis deux jours, alors que le service
// de Cyber Pinball lui répondait (rapport d'un joueur ; GitHub n'a pas d'IPv6, le service si). Le joueur
// ne doit rien avoir à régler : la borne essaie GitHub, puis le relais, sans rien lui demander.
//
// Rien n'y est à croire sur parole : le flux reste vérifié par sa signature, chaque fichier par son
// empreinte SHA-256 (update.ts), comme en direct. Seules les adresses publiques du dépôt de Cyber
// Pinball passent par le relais ; celles d'un canal d'essai privé (avec son jeton) jamais.

import { RELAY_ORIGIN } from './remote-relay';
import { describeNetworkError } from './netcause';
import { t } from './i18n';

/** Le même dépôt que UPDATE_REPOSITORY (update.ts) et que le service : vérifié par updaterelay.test.ts. */
const REPOSITORY = 'gocode/cyberpinball';

/** Sans réponse de GitHub (en-têtes) dans ce délai, le relais est essayé : un réseau qui ne répond pas du tout ne fait pas attendre l'échec complet. */
export const DIRECT_PATIENCE_MS = 8_000;

/** Adresse de la même ressource par le relais ; undefined si elle ne s'y lit pas (autre site, dépôt privé). */
export function relayedUpdateUrl(url: string, origin = RELAY_ORIGIN): string | undefined {
  const api = `https://api.github.com/repos/${REPOSITORY}/releases`;
  if (url === api || url.startsWith(`${api}?`)) return `${origin}/maj/api/releases${url.slice(api.length)}`;
  const site = `https://github.com/${REPOSITORY}/releases/`;
  if (url.startsWith(site)) return `${origin}/maj/github/releases/${url.slice(site.length)}`;
  return undefined;
}

export interface UpdateRelayOptions {
  /** fetch utilisé pour GitHub comme pour le relais (essais : un faux). */
  base?: typeof fetch;
  origin?: string;
  /** Le relais d'abord (« Installer automatiquement la dernière version ») ; sinon GitHub d'abord. */
  relayFirst?: boolean;
  directPatienceMs?: number;
  /** Journal : la première fois qu'un chemin sauve une lecture que l'autre ratait. */
  log?: (line: string) => void;
}

/**
 * fetch des mises à jour : GitHub, puis le relais si GitHub ne répond pas (erreur réseau, ou pas de
 * réponse dans DIRECT_PATIENCE_MS) ; l'inverse avec relayFirst. Le chemin qui a sauvé une lecture
 * passe en premier pour les suivantes. Une réponse HTTP, même en erreur, est rendue telle quelle :
 * seul un site muet ou injoignable fait changer de chemin. Un abandon de l'appelant n'est jamais
 * retenté.
 */
export function updateFetchWithRelay(opts: UpdateRelayOptions = {}): typeof fetch {
  const base = opts.base ?? ((input: string | URL | Request, init?: RequestInit) => fetch(input, init));
  const patience = opts.directPatienceMs ?? DIRECT_PATIENCE_MS;
  let relayFirst = Boolean(opts.relayFirst);

  /** Un essai ; `deadline` : sans en-têtes dans ce délai, il est abandonné (pas l'appelant). */
  async function attempt(url: string, init: RequestInit | undefined, deadline: number | undefined): Promise<Response> {
    if (deadline === undefined) return base(url, init);
    const own = new AbortController();
    const signal = init?.signal ? AbortSignal.any([init.signal, own.signal]) : own.signal;
    const timer = setTimeout(() => {
      const error = new Error(t('le site ne répond pas'));
      error.name = 'TimeoutError';
      own.abort(error);
    }, deadline);
    try {
      return await base(url, { ...init, signal });
    } catch (error) {
      throw own.signal.aborted && !init?.signal?.aborted ? own.signal.reason : error;
    } finally {
      clearTimeout(timer);
    }
  }

  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : undefined;
    const relayed = url && init?.redirect !== 'manual' ? relayedUpdateUrl(url, opts.origin) : undefined;
    if (!url || !relayed) return base(input, init);
    const routes = relayFirst ? [relayed, url] : [url, relayed];
    let first: unknown;
    try {
      // GitHub d'abord : borné, pour laisser au relais le temps de répondre dans la patience de l'appelant.
      return await attempt(routes[0]!, init, relayFirst ? undefined : patience);
    } catch (error) {
      if (init?.signal?.aborted) throw error;
      first = error;
    }
    try {
      const response = await attempt(routes[1]!, init, undefined);
      relayFirst = !relayFirst;
      opts.log?.(
        relayFirst
          ? `Mise à jour : GitHub injoignable (${describeNetworkError(first)}), lue par le relais de Cyber Pinball ; le relais d'abord pour la suite.` // i18n-ignore : journal
          : `Mise à jour : relais de Cyber Pinball injoignable (${describeNetworkError(first)}), GitHub répond ; GitHub d'abord pour la suite.`, // i18n-ignore : journal
      );
      return response;
    } catch (error) {
      if (init?.signal?.aborted) throw error;
      const [direct, relay] = relayFirst ? [error, first] : [first, error];
      throw new Error(t('{direct} ; par le relais de Cyber Pinball : {relay}', { direct: describeNetworkError(direct), relay: describeNetworkError(relay) }));
    }
  }) as typeof fetch;
}
