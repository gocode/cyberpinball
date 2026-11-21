// Cause lisible d'une erreur réseau.
//
// Le fetch de Node ne dit que « fetch failed » : la vraie raison (adresse injoignable, nom introuvable,
// certificat refusé…) est dans error.cause, parfois dans un AggregateError (une erreur par adresse
// essayée). Chromium la met dans le message (net::ERR_…). Jusqu'au 21/11/2026, seul « fetch failed »
// s'affichait : une borne qui ne joignait plus GitHub depuis deux jours n'en disait pas plus
// (rapport d'un joueur).

import { t } from './i18n';

export type NetworkFailure = 'unreachable' | 'offline' | 'dns' | 'refused' | 'reset' | 'timeout' | 'certificate' | 'proxy';

/** Code de l'erreur réseau : celui de Node (cause, erreurs groupées) ou de Chromium (net::ERR_…). */
export function networkErrorCode(error: unknown): string | undefined {
  const seen = new Set<unknown>();
  const walk = (e: unknown, depth: number): string | undefined => {
    if (!e || typeof e !== 'object' || seen.has(e) || depth > 5) return undefined;
    seen.add(e);
    const x = e as { code?: unknown; message?: unknown; cause?: unknown; errors?: unknown };
    if (typeof x.code === 'string' && /^[A-Z][A-Z0-9_]+$/.test(x.code) && x.code !== 'ABORT_ERR') return x.code;
    const chromium = typeof x.message === 'string' ? /net::(ERR_[A-Z0-9_]+)/.exec(x.message) : null;
    if (chromium) return chromium[1];
    const fromCause = walk(x.cause, depth + 1);
    if (fromCause) return fromCause;
    for (const inner of Array.isArray(x.errors) ? x.errors : []) {
      const code = walk(inner, depth + 1);
      if (code) return code;
    }
    return undefined;
  };
  return walk(error, 0);
}

/** Famille d'une panne réseau d'après son code ; undefined pour un code inconnu. */
export function networkFailureOf(code: string | undefined): NetworkFailure | undefined {
  if (!code) return undefined;
  if (/^(ENETUNREACH|EHOSTUNREACH|EADDRNOTAVAIL|ERR_ADDRESS_UNREACHABLE|ERR_NETWORK_ACCESS_DENIED)$/.test(code)) return 'unreachable';
  if (/^(ERR_INTERNET_DISCONNECTED|ENETDOWN)$/.test(code)) return 'offline';
  if (/^(ENOTFOUND|EAI_AGAIN|EAI_FAIL|EAI_NONAME|ERR_NAME_NOT_RESOLVED|ERR_NAME_RESOLUTION_FAILED|ERR_DNS_[A-Z_]+)$/.test(code)) return 'dns';
  if (/^(ECONNREFUSED|ERR_CONNECTION_REFUSED)$/.test(code)) return 'refused';
  if (/^(ECONNRESET|EPIPE|ECONNABORTED|UND_ERR_SOCKET|ERR_CONNECTION_RESET|ERR_CONNECTION_CLOSED|ERR_CONNECTION_ABORTED|ERR_EMPTY_RESPONSE)$/.test(code)) return 'reset';
  if (/^(ETIMEDOUT|UND_ERR_CONNECT_TIMEOUT|UND_ERR_HEADERS_TIMEOUT|UND_ERR_BODY_TIMEOUT|ERR_CONNECTION_TIMED_OUT|ERR_TIMED_OUT)$/.test(code)) return 'timeout';
  if (/CERT|SELF_SIGNED|UNABLE_TO_(GET|VERIFY)|^ERR_SSL_|^EPROTO$|^ERR_TLS_/.test(code)) return 'certificate';
  if (/^ERR_(PROXY|TUNNEL)_/.test(code)) return 'proxy';
  return undefined;
}

function explanation(failure: NetworkFailure): string {
  switch (failure) {
    case 'unreachable':
      return t('adresse injoignable : le PC n’a plus de chemin vers ce site (box, Wi-Fi ou VPN)');
    case 'offline':
      return t('le PC n’est pas connecté à Internet');
    case 'dns':
      return t('nom du site introuvable : la box ou le DNS ne répond pas');
    case 'refused':
      return t('connexion refusée');
    case 'reset':
      return t('connexion coupée en route (pare-feu, antivirus ou VPN)');
    case 'timeout':
      return t('le site ne répond pas');
    case 'certificate':
      return t('certificat du site refusé (antivirus qui inspecte les connexions, proxy, ou horloge du PC fausse)');
    case 'proxy':
      return t('le proxy refuse la connexion');
  }
}

/**
 * La cause d'une erreur réseau, lisible : « adresse injoignable : … [ENETUNREACH] ». Une erreur
 * sans code connu garde son message (« plus rien ne vient du site », « HTTP 404 »…).
 */
export function describeNetworkError(error: unknown): string {
  const code = networkErrorCode(error);
  const failure = networkFailureOf(code);
  if (failure) return `${explanation(failure)} [${code}]`;
  const message = error instanceof Error ? error.message : String(error);
  return code && !message.includes(code) ? `${message} [${code}]` : message;
}
