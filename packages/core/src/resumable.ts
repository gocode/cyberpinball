// Téléchargement HTTP qui reprend là où il s'était arrêté : le seul endroit de Cyber Pinball qui
// écrit sur le disque le corps d'une réponse HTTP (VPinMediaDB, mises à jour, composants de VPX,
// yt-dlp). Les pages des sites passent, elles, par le navigateur intégré (acquire-window.ts), et
// les amis par le réseau des bornes (friend-content.ts) ; tous trois passent par le gestionnaire
// de téléchargements (downloadmanager.ts).
//
// Les octets reçus s'accumulent dans un fichier partiel gardé d'un essai à l'autre (et d'une
// session à l'autre) : une coupure ne perd rien. L'essai suivant demande la suite (Range: bytes=N-),
// avec le validateur de la première réponse (If-Range : ETag ou Last-Modified) pour ne recoller que
// le même fichier. Le site répond 206 à partir de N : la suite est ajoutée ; il répond 200 (il ne
// sait pas reprendre, ou le fichier a changé) : on repart de zéro, le partiel est tronqué. Jamais un
// octet en double : la vérité est la taille du partiel sur le disque, pas un compteur gardé à part.
//
// Les empreintes (SHA-256, MD5) portent sur le fichier entier : le début déjà reçu est relu et
// haché avant la suite. L'appelant les compare à celles qu'il attend (manifeste, index) ; un
// fichier repris est ainsi vérifié en entier, comme un fichier reçu d'une traite.

import { createHash, type Hash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { t } from './i18n';

export type ResumableHash = 'sha256' | 'md5';

/** Validateur de la première réponse : la reprise ne recolle que le même fichier. */
export interface ResumableValidator {
  etag?: string;
  lastModified?: string;
}

export interface ResumableFetchOptions {
  url: string;
  /** Fichier partiel, gardé entre deux essais. */
  part: string;
  fetch?: typeof fetch;
  signal?: AbortSignal;
  headers?: Record<string, string>;
  /** Taille attendue (manifeste, index) : un partiel plus gros est faux, il repart de zéro. */
  size?: number;
  /** Validateur d'un essai précédent (gardé par le gestionnaire). */
  validator?: ResumableValidator;
  /** Sans octet reçu pendant ce délai, l'essai s'arrête, le partiel gardé (30 s par défaut). */
  stallMs?: number;
  /** Empreintes à calculer sur tout le fichier. */
  hashes?: readonly ResumableHash[];
  onData?(received: number, total: number | undefined): void;
  /** Validateur de la réponse, dès qu'elle arrive : à garder pour l'essai suivant, même si celui-ci est coupé. */
  onValidator?(validator: ResumableValidator): void;
}

export interface ResumableResult {
  /** Octets du fichier (le partiel complet). */
  received: number;
  total?: number;
  /** Octets déjà là au début de cet essai (0 : reçu d'une traite). */
  resumedFrom: number;
  validator: ResumableValidator;
  sha256?: string;
  md5?: string;
}

export type ResumableFailure = 'network' | 'http' | 'size' | 'aborted';

export class ResumableError extends Error {
  constructor(
    message: string,
    readonly reason: ResumableFailure,
    /** Le partiel est gardé : l'essai suivant reprendra là. */
    readonly kept: boolean,
    readonly status?: number,
  ) {
    super(message);
  }
}

const STALL_MS = 30_000;
const READ_CHUNK = 1024 * 1024;

/** Taille du partiel sur le disque (0 s'il n'existe pas). */
export function partSize(part: string): number {
  try {
    return fs.statSync(part).size;
  } catch {
    return 0;
  }
}

/** Ce qui sera repris : la taille du partiel, sauf s'il dépasse la taille attendue (alors 0). */
export function resumeOffset(part: string, size?: number): number {
  const have = partSize(part);
  return size !== undefined && have > size ? 0 : have;
}

/** Empreintes du début du fichier déjà reçu : la suite s'y ajoute, le tout porte sur le fichier entier. */
export function hashPrefix(part: string, bytes: number, kinds: readonly ResumableHash[]): Map<ResumableHash, Hash> {
  const hashes = new Map(kinds.map((k) => [k, createHash(k)] as const));
  if (!bytes || !hashes.size) return hashes;
  const fd = fs.openSync(part, 'r');
  try {
    const buf = Buffer.alloc(READ_CHUNK);
    for (let at = 0; at < bytes; ) {
      const n = fs.readSync(fd, buf, 0, Math.min(READ_CHUNK, bytes - at), at);
      if (n <= 0) break;
      for (const h of hashes.values()) h.update(buf.subarray(0, n));
      at += n;
    }
  } finally {
    fs.closeSync(fd);
  }
  return hashes;
}

/** « bytes 100-999/1000 » : premier octet et taille totale. */
function contentRange(header: string | null): { start: number; total?: number } | undefined {
  const m = /^bytes\s+(\d+)-\d+\/(\d+|\*)$/i.exec(header?.trim() ?? '');
  if (!m) return undefined;
  return { start: Number(m[1]), ...(m[2] !== '*' ? { total: Number(m[2]) } : {}) };
}

/**
 * Télécharge `url` dans `part`, en reprenant ce qui y est déjà. Rend la taille reçue et les
 * empreintes du fichier entier ; ne renomme rien (l'appelant vérifie, puis range). Une coupure,
 * un abandon ou un site muet lèvent une ResumableError, le partiel gardé ; une réponse HTTP en
 * erreur aussi (le partiel reste, l'essai suivant le reprendra peut-être).
 */
export async function fetchResumable(opts: ResumableFetchOptions): Promise<ResumableResult> {
  const doFetch = opts.fetch ?? fetch;
  const kinds = opts.hashes ?? [];
  fs.mkdirSync(path.dirname(opts.part), { recursive: true });
  let from = resumeOffset(opts.part, opts.size);
  if (from === 0 && partSize(opts.part) > 0) fs.truncateSync(opts.part, 0);
  // Déjà complet (taille attendue atteinte) : rien à demander.
  if (opts.size !== undefined && from === opts.size && from > 0) {
    const hashes = hashPrefix(opts.part, from, kinds);
    opts.onData?.(from, opts.size);
    return { received: from, total: opts.size, resumedFrom: from, validator: opts.validator ?? {}, ...digests(hashes) };
  }

  const stall = new AbortController();
  const signal = opts.signal ? AbortSignal.any([opts.signal, stall.signal]) : stall.signal;
  let timer: NodeJS.Timeout | undefined;
  const arm = () => {
    clearTimeout(timer);
    timer = setTimeout(() => stall.abort(new ResumableError(t('plus rien ne vient du site'), 'network', true)), opts.stallMs ?? STALL_MS);
  };
  const failure = (error: unknown): ResumableError => {
    if (error instanceof ResumableError) return error;
    if (signal.aborted && signal.reason instanceof ResumableError) return signal.reason;
    if (opts.signal?.aborted) return new ResumableError(t('téléchargement annulé'), 'aborted', true);
    return new ResumableError((error as Error)?.message ?? String(error), 'network', true);
  };

  let handle: fs.promises.FileHandle | undefined;
  try {
    arm();
    const headers: Record<string, string> = { ...opts.headers };
    if (from > 0) {
      headers.Range = `bytes=${from}-`;
      const v = opts.validator?.etag ?? opts.validator?.lastModified;
      if (v) headers['If-Range'] = v;
    }
    let response: Response;
    try {
      response = await doFetch(opts.url, { redirect: 'follow', signal, headers });
    } catch (error) {
      throw failure(error);
    }
    // Reprise demandée au-delà de la fin : le partiel est faux (le fichier a rétréci), tout est repris.
    if (response.status === 416 && from > 0) {
      await response.body?.cancel().catch(() => undefined);
      fs.truncateSync(opts.part, 0);
      return fetchResumable({ ...opts, validator: undefined });
    }
    if (!(response.status === 200 || response.status === 206) || !response.body) throw new ResumableError(`HTTP ${response.status}`, 'http', true, response.status);
    const range = response.status === 206 ? contentRange(response.headers.get('content-range')) : undefined;
    // 206 qui ne commence pas là où l'on en est : on ne recolle rien, on repart de zéro.
    if (response.status === 206 && range?.start !== from) {
      await response.body.cancel().catch(() => undefined);
      fs.truncateSync(opts.part, 0);
      return fetchResumable({ ...opts, validator: undefined });
    }
    if (response.status === 200 && from > 0) {
      // Le site renvoie tout : le début gardé ne sert pas, le fichier repart de zéro.
      fs.truncateSync(opts.part, 0);
      from = 0;
    }
    const validator: ResumableValidator = {
      ...(response.headers.get('etag') ? { etag: response.headers.get('etag')! } : {}),
      ...(response.headers.get('last-modified') ? { lastModified: response.headers.get('last-modified')! } : {}),
    };
    opts.onValidator?.(validator);
    const length = Number(response.headers.get('content-length'));
    const total = range?.total ?? (Number.isFinite(length) && length > 0 ? from + length : opts.size);
    const hashes = hashPrefix(opts.part, from, kinds);
    handle = await fs.promises.open(opts.part, from > 0 ? 'a' : 'w');
    let received = from;
    opts.onData?.(received, total);
    const reader = response.body.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        arm();
        for (const h of hashes.values()) h.update(value);
        await handle.write(value);
        received += value.byteLength;
        opts.onData?.(received, total);
      }
    } catch (error) {
      throw failure(error);
    }
    await handle.close();
    handle = undefined;
    if (total !== undefined && received !== total) {
      // Moins que prévu : coupure, la suite viendra ; plus que prévu : fichier faux, effacé.
      if (received > total) fs.rmSync(opts.part, { force: true });
      throw new ResumableError(t('reçu {received} octets sur {total}', { received, total }), received < total ? 'network' : 'size', received < total);
    }
    return { received, ...(total !== undefined ? { total } : {}), resumedFrom: from, validator, ...digests(hashes) };
  } catch (error) {
    await handle?.close().catch(() => undefined);
    throw failure(error);
  } finally {
    clearTimeout(timer);
  }
}

function digests(hashes: Map<ResumableHash, Hash>): { sha256?: string; md5?: string } {
  const out: { sha256?: string; md5?: string } = {};
  for (const [k, h] of hashes) out[k] = h.digest('hex');
  return out;
}
