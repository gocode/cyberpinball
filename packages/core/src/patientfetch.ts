// Lecture HTTP d'un texte (JSON, page) qui supporte une connexion lente.
//
// Un délai global (AbortSignal.timeout) borne aussi la lecture du corps : à 4 Ko/s, la liste des
// publications GitHub (environ 1 Mo) ne passait jamais en 20 s, et une borne à faible débit ne
// trouvait jamais ses mises à jour (20/11/2026). Ici, le délai borne l'absence de progrès :
// connexion, premier octet, puis chaque morceau du corps relance le compte. Un site lent mais
// vivant aboutit, quelle que soit la durée totale ; un site muet échoue au bout du délai.
//
// Une erreur passagère (coupure, site muet, HTTP 429 ou 5xx) est réessayée, avec une attente qui
// double à chaque fois. Un abandon demandé par l'appelant (son signal) n'est jamais réessayé.
//
// Les fichiers écrits sur le disque passent, eux, par resumable.ts (même délai d'inactivité,
// reprise après coupure).

import { t } from './i18n';

export interface Patience {
  /** Sans un octet reçu pendant ce délai (connexion, en-têtes ou corps), l'essai s'arrête. */
  idleMs: number;
  /** Nombre d'essais en tout, sur une erreur passagère. */
  attempts: number;
  /** Attente avant le deuxième essai, doublée à chaque essai suivant. */
  retryDelayMs: number;
}

export const DEFAULT_PATIENCE: Readonly<Patience> = { idleMs: 20_000, attempts: 3, retryDelayMs: 1_000 };

/** Réponses réessayées : limite de débit et pannes passagères du serveur. */
const RETRIED_STATUS = new Set([429, 500, 502, 503, 504]);

export interface PatientFetchOptions extends Partial<Patience> {
  fetch?: typeof fetch;
  /** Méthode, en-têtes, redirection ; le signal se donne à part. */
  init?: Omit<RequestInit, 'signal'>;
  /** Abandon demandé par l'appelant : jamais réessayé. */
  signal?: AbortSignal;
}

/** Réponse lue en entier. */
export interface PatientResponse {
  status: number;
  ok: boolean;
  headers: Headers;
  text: string;
}

/** Erreur d'un site resté muet : nommée comme celle d'AbortSignal.timeout, que les appelants reconnaissent. */
function idleError(): Error {
  const error = new Error(t('plus rien ne vient du site'));
  error.name = 'TimeoutError';
  return error;
}

/**
 * Lit `url` en entier. Rend la réponse (même en erreur HTTP, après les essais) ; lève une erreur
 * si le site ne répond pas ou se tait, après les essais, ou si `signal` est abandonné.
 */
export async function fetchTextPatiently(url: string, opts: PatientFetchOptions = {}): Promise<PatientResponse> {
  const patience: Patience = {
    idleMs: opts.idleMs ?? DEFAULT_PATIENCE.idleMs,
    attempts: Math.max(1, opts.attempts ?? DEFAULT_PATIENCE.attempts),
    retryDelayMs: opts.retryDelayMs ?? DEFAULT_PATIENCE.retryDelayMs,
  };
  for (let attempt = 1; ; attempt++) {
    let response: PatientResponse;
    try {
      response = await readOnce(url, opts, patience.idleMs);
    } catch (error) {
      if (opts.signal?.aborted || attempt >= patience.attempts) throw error;
      await pause(patience.retryDelayMs * 2 ** (attempt - 1), opts.signal);
      continue;
    }
    if (!RETRIED_STATUS.has(response.status) || attempt >= patience.attempts) return response;
    await pause(patience.retryDelayMs * 2 ** (attempt - 1), opts.signal);
  }
}

async function readOnce(url: string, opts: PatientFetchOptions, idleMs: number): Promise<PatientResponse> {
  const idle = new AbortController();
  const signal = opts.signal ? AbortSignal.any([opts.signal, idle.signal]) : idle.signal;
  let timer: NodeJS.Timeout | undefined;
  const arm = () => {
    clearTimeout(timer);
    timer = setTimeout(() => idle.abort(idleError()), idleMs);
  };
  try {
    arm();
    const response = await (opts.fetch ?? fetch)(url, { ...opts.init, signal });
    arm();
    const chunks: Uint8Array[] = [];
    if (response.body) {
      const reader = response.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        arm();
        chunks.push(value);
      }
    }
    return { status: response.status, ok: response.ok, headers: response.headers, text: new TextDecoder().decode(Buffer.concat(chunks)) };
  } catch (error) {
    if (idle.signal.aborted && !opts.signal?.aborted) throw idle.signal.reason;
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function pause(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
