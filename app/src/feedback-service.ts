// Le service des retours vu de la borne (packages/core/src/feedback.ts, packages/service-telephone) :
// la liste des propositions (gardée en mémoire, relue à l'ouverture de « Avis et propositions »),
// proposer, voter, et les rapports privés scellés. Un rapport qui ne part pas (borne hors ligne,
// service injoignable) attend dans <données>\retours\attente et repart au démarrage, puis toutes les
// 30 minutes ; vingt au plus, oubliés après 30 jours.
//
// Essais (CYBERPINBALL_RETOURS_SIMULES = fichier JSON des propositions de départ) : un service en
// mémoire, rien ne sort ; les rapports « envoyés » sont écrits dans <données>\retours\envoyes pour
// que la démonstration les vérifie.

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  parseProposals,
  REPORT_SEALED_MAX,
  RELAY_ORIGIN,
  sealReport,
  signFeedback,
  writeFileAtomic,
  type FeedbackOp,
  type PlayerKey,
  type Proposal,
  type ProposalKind,
  type ReportEnvelope,
} from '@cyberpinball/core';

export type FeedbackNet = 'idle' | 'loading' | 'ok' | 'offline';

export interface FeedbackServiceOptions {
  dataDir: string;
  /** La clé du joueur de cette borne (réseau des amis) ; undefined : on ne peut ni proposer ni voter. */
  key(): PlayerKey | undefined;
  origin?: string;
  /** Service simulé (essais) : le fichier des propositions de départ, ou '' pour une liste vide ; rien ne sort sur le réseau. */
  simulated?: string;
  changed(): void;
  log(line: string): void;
}

type Outcome = { ok: true; id?: string } | { ok: false; why: 'offline' | 'key' | 'quota' | 'refused' };

const TIMEOUT_MS = 15_000;
const QUEUE_MAX = 20;
const QUEUE_AGE_MS = 30 * 86_400_000;

export function createFeedbackService(opts: FeedbackServiceOptions) {
  const origin = (opts.origin ?? RELAY_ORIGIN).replace(/\/+$/, '');
  const queueDir = path.join(opts.dataDir, 'retours', 'attente');
  let list: Proposal[] = [];
  let net: FeedbackNet = 'idle';
  let loadedAt = 0;
  let loading: Promise<void> | undefined;
  let lastT = 0;

  // ---------- Service simulé (essais) ----------
  const sim = opts.simulated !== undefined ? simulatedStore(opts.simulated, opts.dataDir) : undefined;

  async function call(method: string, route: string, body?: string | Uint8Array, type = 'application/json'): Promise<{ status: number; json?: unknown }> {
    if (sim) return sim.call(method, route, body, opts.key()?.publicKey);
    const res = await fetch(`${origin}${route}`, {
      method,
      headers: body === undefined ? {} : { 'Content-Type': type },
      ...(body === undefined ? {} : { body: typeof body === 'string' ? body : Buffer.from(body) }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      json = undefined;
    }
    return { status: res.status, json };
  }

  function refresh(): Promise<void> {
    loading ??= (async () => {
      net = list.length ? net : 'loading';
      opts.changed();
      try {
        const pk = opts.key()?.publicKey;
        const r = await call('GET', `/api/propositions${pk ? `?pk=${pk}` : ''}`);
        if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
        list = parseProposals(r.json);
        net = 'ok';
        loadedAt = Date.now();
      } catch (error) {
        net = 'offline';
        opts.log(`Retours : liste des propositions injoignable (${(error as Error).message}).`); // i18n-ignore : journal
      } finally {
        loading = undefined;
        opts.changed();
      }
    })();
    return loading;
  }

  async function signed(route: string, op: FeedbackOp): Promise<Outcome & { json?: unknown }> {
    const key = opts.key();
    if (!key) return { ok: false, why: 'key' };
    try {
      // Jamais deux requêtes à la même milliseconde : le service refuse une date déjà vue (rejeu).
      lastT = Math.max(Date.now(), lastT + 1);
      const r = await call('POST', route, JSON.stringify(signFeedback(key, op, lastT)));
      if (r.status === 200 || r.status === 201) return { ok: true, id: (r.json as { id?: string } | undefined)?.id, json: r.json };
      opts.log(`Retours : ${route} refusé (HTTP ${r.status}).`); // i18n-ignore : journal
      return { ok: false, why: r.status === 429 ? 'quota' : 'refused' };
    } catch (error) {
      opts.log(`Retours : ${route} injoignable (${(error as Error).message}).`); // i18n-ignore : journal
      return { ok: false, why: 'offline' };
    }
  }

  async function propose(kind: ProposalKind, title: string, text: string, lang: string): Promise<Outcome> {
    const r = await signed('/api/propositions', { op: 'propose', kind, title, text, lang });
    if (r.ok) {
      opts.log(`Retours : proposition publiée (${kind}).`); // i18n-ignore : journal
      await refresh();
    }
    return r;
  }

  async function vote(id: string, on: boolean): Promise<Outcome> {
    // Tout de suite à l'écran ; la réponse du service fait foi.
    const before = list;
    list = list.map((p) => (p.id === id && Boolean(p.voted) !== on ? { ...p, voted: on, votes: Math.max(0, p.votes + (on ? 1 : -1)) } : p));
    opts.changed();
    const r = await signed('/api/votes', { op: 'vote', id, on });
    if (!r.ok) list = before;
    else {
      const votes = (r.json as { votes?: number } | undefined)?.votes;
      if (typeof votes === 'number') list = list.map((p) => (p.id === id ? { ...p, votes } : p));
    }
    opts.changed();
    return r;
  }

  /**
   * Compte supprimé : le service efface les propositions de cette clé et ses votes. À appeler
   * avant d'effacer la clé (elle signe la demande). Hors ligne : `offline`, rien n'est effacé là-bas.
   */
  async function forgetMe(): Promise<Outcome> {
    const r = await signed('/api/oubli', { op: 'forget' });
    if (r.ok) {
      list = list.filter((p) => !p.mine).map((p) => (p.voted ? { ...p, voted: false, votes: Math.max(0, p.votes - 1) } : p));
      opts.changed();
    }
    return r;
  }

  // ---------- Rapports privés ----------

  /** Scelle et envoie ; hors ligne, le rapport attend et repartira. Vrai : parti tout de suite. */
  async function sendReport(envelope: ReportEnvelope, file?: Uint8Array): Promise<'sent' | 'queued' | 'failed'> {
    let sealed = sealReport(envelope, file);
    // Trop lourd pour le service : sans le fichier, l'enveloppe dit au moins ce qui s'est passé.
    if (sealed.length > REPORT_SEALED_MAX) sealed = sealReport({ ...envelope, text: `${envelope.text ?? ''}\n[rapport technique trop lourd, retiré]`.trim() }, undefined); // i18n-ignore : lu par l'équipe
    if (await post(sealed)) return 'sent';
    try {
      fs.mkdirSync(queueDir, { recursive: true });
      writeFileAtomic(path.join(queueDir, `${Date.now()}-${crypto.randomBytes(3).toString('hex')}.cpr`), sealed);
      trimQueue();
      return 'queued';
    } catch {
      return 'failed';
    }
  }

  async function post(sealed: Buffer): Promise<boolean> {
    try {
      const r = await call('POST', '/api/rapports', sealed, 'application/octet-stream');
      if (r.status === 201) {
        opts.log(`Retours : rapport envoyé (${Math.round(sealed.length / 1024)} Ko).`); // i18n-ignore : journal
        return true;
      }
      opts.log(`Retours : rapport refusé (HTTP ${r.status}).`); // i18n-ignore : journal
      return r.status === 400 || r.status === 413; // refus définitif : inutile de le garder
    } catch (error) {
      opts.log(`Retours : rapport en attente (${(error as Error).message}).`); // i18n-ignore : journal
      return false;
    }
  }

  function queued(): string[] {
    try {
      return fs.readdirSync(queueDir).filter((f) => f.endsWith('.cpr')).sort();
    } catch {
      return [];
    }
  }

  function trimQueue(): void {
    const files = queued();
    const now = Date.now();
    files.forEach((f, i) => {
      const at = Number(f.split('-')[0]);
      if (i < files.length - QUEUE_MAX || !(now - at < QUEUE_AGE_MS)) fs.rmSync(path.join(queueDir, f), { force: true });
    });
  }

  let flushing = false;
  async function flush(): Promise<void> {
    if (flushing) return;
    flushing = true;
    try {
      trimQueue();
      for (const f of queued()) {
        const file = path.join(queueDir, f);
        if (!(await post(fs.readFileSync(file)))) break;
        fs.rmSync(file, { force: true });
      }
    } catch {
      // Dossier illisible : on réessaiera.
    } finally {
      flushing = false;
    }
  }

  function watch(): void {
    setTimeout(() => void flush(), 40_000).unref?.();
    setInterval(() => void flush(), 30 * 60_000).unref?.();
  }

  return {
    refresh,
    /** Relue si la dernière lecture a plus de deux minutes (à l'ouverture de la page). */
    refreshIfOld: () => (Date.now() - loadedAt > 120_000 ? refresh() : Promise.resolve()),
    list: () => list,
    net: () => net,
    canWrite: () => Boolean(opts.key()),
    propose,
    vote,
    forgetMe,
    sendReport,
    queuedCount: () => queued().length,
    flush,
    watch,
  };
}

export type FeedbackService = ReturnType<typeof createFeedbackService>;

/**
 * Service en mémoire pour les essais : mêmes routes et mêmes réponses que worker.mjs, sans
 * signature vérifiée. Les rapports reçus sont écrits dans <données>\retours\envoyes.
 */
function simulatedStore(seedFile: string, dataDir: string) {
  type Row = Proposal & { voters: Set<string>; author?: string };
  let rows: Row[] = [];
  try {
    const seed = JSON.parse(fs.readFileSync(seedFile, 'utf8')) as { propositions?: unknown[] };
    rows = parseProposals(seed).map((p) => ({ ...p, voted: undefined, mine: undefined, voters: new Set(Array.from({ length: p.votes }, (_, i) => `v${i}`)) }));
  } catch {
    rows = [];
  }
  const sent = path.join(dataDir, 'retours', 'envoyes');
  return {
    async call(method: string, route: string, body: string | Uint8Array | undefined, pk: string | undefined): Promise<{ status: number; json?: unknown }> {
      await new Promise((r) => setTimeout(r, 120));
      if (method === 'GET' && route.startsWith('/api/propositions')) {
        const view = rows
          .map(({ voters, author, ...p }) => ({ ...p, votes: voters.size, ...(pk ? { voted: voters.has(pk), mine: author === pk } : {}) }));
        return { status: 200, json: { propositions: view } };
      }
      if (method === 'POST' && route === '/api/propositions' && typeof body === 'string') {
        const b = JSON.parse((JSON.parse(body) as { b: string }).b) as { kind: ProposalKind; title: string; text: string; lang: string; pk: string; t: number };
        const id = crypto.randomBytes(8).toString('base64url').slice(0, 10);
        rows.push({ id, kind: b.kind, title: b.title, text: b.text, lang: b.lang, votes: 1, status: 'new', at: b.t, updated: b.t, merged: 0, author: b.pk, voters: new Set([b.pk]) });
        return { status: 201, json: { id } };
      }
      if (method === 'POST' && route === '/api/votes' && typeof body === 'string') {
        const b = JSON.parse((JSON.parse(body) as { b: string }).b) as { id: string; on: boolean; pk: string };
        const row = rows.find((r) => r.id === b.id);
        if (!row) return { status: 404 };
        if (b.on) row.voters.add(b.pk);
        else row.voters.delete(b.pk);
        return { status: 200, json: { id: row.id, votes: row.voters.size, voted: b.on } };
      }
      if (method === 'POST' && route === '/api/oubli' && typeof body === 'string') {
        const b = JSON.parse((JSON.parse(body) as { b: string }).b) as { pk: string };
        const mine = rows.filter((r) => r.author === b.pk);
        rows = rows.filter((r) => r.author !== b.pk);
        for (const r of rows) r.voters.delete(b.pk);
        return { status: 200, json: { propositions: mine.length } };
      }
      if (method === 'POST' && route === '/api/rapports' && body instanceof Uint8Array) {
        fs.mkdirSync(sent, { recursive: true });
        const id = crypto.randomBytes(8).toString('base64url');
        fs.writeFileSync(path.join(sent, `${id}.cpr`), body);
        return { status: 201, json: { id } };
      }
      return { status: 404 };
    },
  };
}
