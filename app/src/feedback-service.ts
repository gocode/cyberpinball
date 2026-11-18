// Le service des retours vu de la borne (packages/core/src/feedback.ts, packages/service-telephone) :
// la liste des propositions (gardée en mémoire, relue à l'ouverture de « Retours et propositions »),
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
  contributionsCount,
  loadContributions,
  noteProposals,
  noteReport,
  parseNewsReaction,
  parseNewsReactions,
  parseFeedbackPerson,
  parseProposals,
  parseSupporters,
  withMyNewsReaction,
  type FeedbackPerson,
  type ProposalSupporters,
  type NewsReactions,
  type Reaction,
  REPORT_SEALED_MAX,
  saveContributions,
  type Contributions,
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
  /** Son pseudo et son pays, signés avec ses propositions et ses votes : le tableau le nomme. */
  who?(): FeedbackPerson | undefined;
  origin?: string;
  /** Service simulé (essais) : le fichier des propositions de départ, ou '' pour une liste vide ; rien ne sort sur le réseau. */
  simulated?: string;
  changed(): void;
  log(line: string): void;
  /**
   * Mes contributions ont changé (badges de la famille Communauté) ; `shipped` : mes propositions qui
   * viennent de passer « fait », à annoncer au joueur.
   */
  contributed?(shipped: readonly Proposal[]): void;
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
        if (pk) noteContributions(noteProposals(contributions, list));
        if (pk) void sendName();
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

  // ---------- Contributions (badges de la famille Communauté) ----------

  let contributions: Contributions = loadContributions(opts.dataDir);

  function noteContributions(r: { contributions: Contributions; shipped: readonly Proposal[] }): void {
    const before = JSON.stringify(contributions);
    contributions = r.contributions;
    if (JSON.stringify(contributions) === before) return;
    try {
      saveContributions(opts.dataDir, contributions);
    } catch (error) {
      opts.log(`Retours : contributions non enregistrées (${(error as Error).message}).`); // i18n-ignore : journal
    }
    opts.contributed?.(r.shipped);
  }

  async function signed(route: string, op: FeedbackOp): Promise<Outcome & { json?: unknown }> {
    const key = opts.key();
    if (!key) return { ok: false, why: 'key' };
    try {
      // Jamais deux requêtes à la même milliseconde : le service refuse une date déjà vue (rejeu).
      lastT = Math.max(Date.now(), lastT + 1);
      const r = await call('POST', route, JSON.stringify(signFeedback(key, op, lastT)));
      if (r.status === 200 || r.status === 201 || r.status === 204) return { ok: true, id: (r.json as { id?: string } | undefined)?.id, json: r.json };
      opts.log(`Retours : ${route} refusé (HTTP ${r.status}).`); // i18n-ignore : journal
      return { ok: false, why: r.status === 429 ? 'quota' : 'refused' };
    } catch (error) {
      opts.log(`Retours : ${route} injoignable (${(error as Error).message}).`); // i18n-ignore : journal
      return { ok: false, why: 'offline' };
    }
  }

  /** Mon pseudo et mon pays, vérifiés comme le service les vérifiera ; rien s'il n'est pas valide. */
  function me(): { who?: FeedbackPerson } {
    const who = parseFeedbackPerson(opts.who?.());
    return who ? { who } : {};
  }

  // ---------- Mon pseudo sur le tableau ----------

  /** Dernier pseudo envoyé (et quand) : une fois par jour, ou dès qu'il change. */
  let nameSent: { key: string; at: number } | undefined;

  /**
   * Mon pseudo pour mes propositions et mes votes passés (ceux d'avant le 18/11/2026 n'en avaient pas) :
   * envoyé seulement si j'ai proposé ou voté, une fois par jour ou quand il change. Le service ne
   * l'inscrit pas pour une borne qui n'a rien sur le tableau.
   */
  async function sendName(): Promise<void> {
    const { who } = me();
    if (!who || !list.some((p) => p.mine || p.voted)) return;
    const stamp = JSON.stringify(who);
    if (nameSent?.key === stamp && Date.now() - nameSent.at < 86_400_000) return;
    nameSent = { key: stamp, at: Date.now() };
    const r = await signed('/api/noms', { op: 'name', who });
    if (!r.ok) nameSent = undefined;
  }

  // ---------- Soutiens d'une proposition (sa fiche) ----------

  /** Soutiens relus au plus toutes les minutes ; `state` : où en est la dernière lecture. */
  const backers = new Map<string, { at: number; value?: ProposalSupporters; state: 'loading' | 'ok' | 'offline' }>();
  const BACKERS_TTL_MS = 60_000;

  /** Ceux qui soutiennent cette proposition, tels que lus (et relus en fond s'ils datent) ; `changed()` à l'arrivée. */
  function supporters(id: string): { value?: ProposalSupporters; state: 'loading' | 'ok' | 'offline' } {
    const known = backers.get(id);
    if (!known || (known.state !== 'loading' && Date.now() - known.at > BACKERS_TTL_MS)) void loadSupporters(id);
    return backers.get(id)!;
  }

  async function loadSupporters(id: string): Promise<void> {
    const before = backers.get(id);
    backers.set(id, { at: Date.now(), ...(before?.value ? { value: before.value } : {}), state: 'loading' });
    try {
      const r = await call('GET', `/api/soutiens?id=${encodeURIComponent(id)}`);
      const value = r.status === 200 ? parseSupporters(r.json) : undefined;
      if (!value) throw new Error(`HTTP ${r.status}`);
      backers.set(id, { at: Date.now(), value, state: 'ok' });
    } catch (error) {
      backers.set(id, { at: Date.now(), ...(before?.value ? { value: before.value } : {}), state: 'offline' });
      opts.log(`Retours : soutiens injoignables (${(error as Error).message}).`); // i18n-ignore : journal
    }
    opts.changed();
  }

  async function propose(kind: ProposalKind, title: string, text: string, lang: string): Promise<Outcome> {
    const r = await signed('/api/propositions', { op: 'propose', kind, title, text, lang, ...me() });
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
    const r = await signed('/api/votes', { op: 'vote', id, on, ...(on ? me() : {}) });
    if (!r.ok) list = before;
    else {
      const votes = (r.json as { votes?: number } | undefined)?.votes;
      if (typeof votes === 'number') list = list.map((p) => (p.id === id ? { ...p, votes } : p));
      // Mon nom entre (ou sort) de ses soutiens : relus à la prochaine vue de sa fiche.
      backers.delete(id);
    }
    opts.changed();
    return r;
  }

  /**
   * Compte supprimé : le service efface les propositions de cette clé, ses votes et ses réactions. À
   * appeler avant d'effacer la clé (elle signe la demande). Hors ligne : `offline`, rien n'est effacé là-bas.
   */
  async function forgetMe(): Promise<Outcome> {
    const r = await signed('/api/oubli', { op: 'forget' });
    if (r.ok) {
      list = list.filter((p) => !p.mine).map((p) => (p.voted ? { ...p, voted: false, votes: Math.max(0, p.votes - 1) } : p));
      news = Object.fromEntries(Object.entries(news).map(([item, n]) => [item, n.mine ? withMyNewsReaction(n, null) : n]));
      opts.changed();
    }
    return r;
  }

  // ---------- Réactions aux Nouveautés (news.ts) ----------

  /** Les totaux de chaque nouveauté et ma réaction, relus à l'ouverture des Nouveautés. */
  let news: Record<string, NewsReactions> = {};
  let newsNet: FeedbackNet = 'idle';
  let newsLoading: Promise<void> | undefined;
  let newsAt = 0;

  function refreshNews(): Promise<void> {
    newsLoading ??= (async () => {
      if (newsNet !== 'ok') newsNet = 'loading';
      opts.changed();
      try {
        const pk = opts.key()?.publicKey;
        const r = await call('GET', `/api/nouveautes${pk ? `?pk=${pk}` : ''}`);
        if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
        news = parseNewsReactions(r.json);
        newsNet = 'ok';
        newsAt = Date.now();
      } catch (error) {
        newsNet = 'offline';
        opts.log(`Nouveautés : réactions injoignables (${(error as Error).message}).`); // i18n-ignore : journal
      } finally {
        newsLoading = undefined;
        opts.changed();
      }
    })();
    return newsLoading;
  }

  /** Pose, change ou retire (null) ma réaction : tout de suite à l'écran, la réponse du service fait foi. */
  async function reactNews(item: string, kind: Reaction | null): Promise<Outcome> {
    const before = news[item];
    news = { ...news, [item]: withMyNewsReaction(before, kind) };
    opts.changed();
    const r = await signed('/api/nouveautes', { op: 'news-react', item, kind });
    const after = r.ok ? parseNewsReaction(r.json) : undefined;
    news = { ...news, [item]: after ?? before ?? { counts: {} } };
    if (r.ok) opts.log(`Nouveautés : réaction ${kind ?? 'retirée'} sur ${item}.`); // i18n-ignore : journal
    opts.changed();
    return r;
  }

  // ---------- Rapports privés ----------

  /** Scelle et envoie ; hors ligne, le rapport attend et repartira. Vrai : parti tout de suite. */
  async function sendReport(envelope: ReportEnvelope, file?: Uint8Array): Promise<'sent' | 'queued' | 'failed'> {
    // Un rapport écrit par le joueur compte comme contribution (un par jour) ; un plantage automatique, non.
    if (envelope.kind === 'report') noteContributions({ contributions: noteReport(contributions), shipped: [] });
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
    // Mes propositions passées « fait » s'annoncent sans ouvrir « Retours et propositions » : la liste
    // est relue peu après le démarrage, puis deux fois par jour, seulement si j'en ai publié.
    const mineCheck = () => (contributions.proposals.length && Date.now() - loadedAt > 3600_000 ? void refresh() : undefined);
    setTimeout(mineCheck, 90_000).unref?.();
    setInterval(mineCheck, 12 * 3600_000).unref?.();
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
    supporters,
    forgetMe,
    /** Réactions aux Nouveautés : les totaux d'une nouveauté, l'état du service, relire, réagir. */
    news: {
      of: (item: string): NewsReactions => news[item] ?? { counts: {} },
      net: () => newsNet,
      refresh: refreshNews,
      refreshIfOld: () => (Date.now() - newsAt > 120_000 ? refreshNews() : Promise.resolve()),
      react: reactNews,
    },
    sendReport,
    queuedCount: () => queued().length,
    flush,
    watch,
    /** Mes contributions (badges) : envois comptés, et propositions passées « fait ». */
    contributions: () => ({ count: contributionsCount(contributions), shipped: contributions.shipped.length }),
  };
}

export type FeedbackService = ReturnType<typeof createFeedbackService>;

/**
 * Service en mémoire pour les essais : mêmes routes et mêmes réponses que worker.mjs, sans
 * signature vérifiée. Les rapports reçus sont écrits dans <données>\retours\envoyes.
 */
function simulatedStore(seedFile: string, dataDir: string) {
  // `authorKey` : la clé de l'auteur (v0 pour la graine) ; `voters` : les clés des votants, auteur compris.
  type Row = Proposal & { voters: Set<string>; authorKey?: string };
  let rows: Row[] = [];
  // Pseudo et pays de chaque clé, comme la table noms_retours du service.
  const names = new Map<string, FeedbackPerson>();
  try {
    // Graine : `author` (pseudo et pays de l'auteur) et `soutiens` (ceux qui la soutiennent, nommés,
    // les plus récents d'abord) ; les autres voix restent sans nom, comme les votes d'avant le 18/11/2026.
    const seed = JSON.parse(fs.readFileSync(seedFile, 'utf8')) as { propositions?: { id?: string; soutiens?: unknown[] }[] };
    const named = new Map((seed.propositions ?? []).map((r) => [r.id, (r.soutiens ?? []).map(parseFeedbackPerson).filter((x): x is FeedbackPerson => Boolean(x))]));
    rows = parseProposals(seed).map((p) => {
      const voters = new Set(Array.from({ length: Math.max(1, p.votes) }, (_, i) => `${p.id}:v${i}`));
      if (p.author) names.set(`${p.id}:v0`, p.author);
      (named.get(p.id) ?? []).slice(0, p.votes - 1).forEach((who, i) => names.set(`${p.id}:v${i + 1}`, who));
      return { ...p, voted: undefined, mine: undefined, voters, authorKey: `${p.id}:v0` };
    });
  } catch {
    rows = [];
  }
  const noteWho = (pk: string, raw: unknown) => {
    const who = parseFeedbackPerson(raw);
    if (who) names.set(pk, who);
  };
  const sent = path.join(dataDir, 'retours', 'envoyes');
  // Réactions aux Nouveautés : quelques joueurs inventés en ont déjà posé (graine du fichier, champ
  // « nouveautes » : { <id>: { <réaction>: nombre } }), puis celles de cette borne.
  const reactions = new Map<string, Map<string, string>>();
  try {
    const seed = JSON.parse(fs.readFileSync(seedFile, 'utf8')) as { nouveautes?: Record<string, Record<string, number>> };
    for (const [item, counts] of Object.entries(seed.nouveautes ?? {}))
      for (const [kind, n] of Object.entries(counts)) for (let i = 0; i < n; i++) (reactions.get(item) ?? reactions.set(item, new Map()).get(item)!).set(`${kind}${i}`, kind);
  } catch {
    // Pas de graine : aucune réaction.
  }
  const newsView = (item: string, pk: string | undefined) => {
    const who = reactions.get(item) ?? new Map<string, string>();
    const counts: Record<string, number> = {};
    for (const kind of who.values()) counts[kind] = (counts[kind] ?? 0) + 1;
    const mine = pk ? who.get(pk) : undefined;
    return { counts, ...(mine ? { mine } : {}) };
  };
  return {
    async call(method: string, route: string, body: string | Uint8Array | undefined, pk: string | undefined): Promise<{ status: number; json?: unknown }> {
      await new Promise((r) => setTimeout(r, 120));
      if (method === 'GET' && route.startsWith('/api/nouveautes')) {
        return { status: 200, json: { reactions: Object.fromEntries([...reactions.keys()].map((item) => [item, newsView(item, pk)])) } };
      }
      if (method === 'POST' && route === '/api/nouveautes' && typeof body === 'string') {
        const b = JSON.parse((JSON.parse(body) as { b: string }).b) as { item: string; kind: string | null; pk: string };
        const who = reactions.get(b.item) ?? reactions.set(b.item, new Map()).get(b.item)!;
        if (b.kind) who.set(b.pk, b.kind);
        else who.delete(b.pk);
        return { status: 200, json: { item: b.item, ...newsView(b.item, b.pk) } };
      }
      if (method === 'GET' && route.startsWith('/api/propositions')) {
        const view = rows.map(({ voters, authorKey, author: _seed, ...p }) => {
          const author = authorKey ? names.get(authorKey) : undefined;
          return { ...p, votes: voters.size, ...(author ? { author } : {}), ...(pk ? { voted: voters.has(pk), mine: authorKey === pk } : {}) };
        });
        return { status: 200, json: { propositions: view } };
      }
      if (method === 'GET' && route.startsWith('/api/soutiens')) {
        const id = new URLSearchParams(route.split('?')[1] ?? '').get('id');
        const row = rows.find((r) => r.id === id);
        if (!row) return { status: 404 };
        // Les plus récents d'abord : l'ordre d'arrivée, à l'envers.
        const others = [...row.voters].filter((v) => v !== row.authorKey).reverse();
        const soutiens = others.map((v) => names.get(v)).filter((x): x is FeedbackPerson => Boolean(x));
        return { status: 200, json: { id: row.id, soutiens, autres: others.length - soutiens.length } };
      }
      if (method === 'POST' && route === '/api/propositions' && typeof body === 'string') {
        const b = JSON.parse((JSON.parse(body) as { b: string }).b) as { kind: ProposalKind; title: string; text: string; lang: string; pk: string; t: number; who?: unknown };
        const id = crypto.randomBytes(8).toString('base64url').slice(0, 10);
        noteWho(b.pk, b.who);
        rows.push({ id, kind: b.kind, title: b.title, text: b.text, lang: b.lang, votes: 1, status: 'new', at: b.t, updated: b.t, merged: 0, authorKey: b.pk, voters: new Set([b.pk]) });
        return { status: 201, json: { id } };
      }
      if (method === 'POST' && route === '/api/votes' && typeof body === 'string') {
        const b = JSON.parse((JSON.parse(body) as { b: string }).b) as { id: string; on: boolean; pk: string; who?: unknown };
        const row = rows.find((r) => r.id === b.id);
        if (!row) return { status: 404 };
        if (b.on) noteWho(b.pk, b.who);
        // Un vote redonné passe en tête des soutiens, comme sa date dans le service.
        if (b.on) row.voters.delete(b.pk);
        if (b.on) row.voters.add(b.pk);
        else row.voters.delete(b.pk);
        return { status: 200, json: { id: row.id, votes: row.voters.size, voted: b.on } };
      }
      if (method === 'POST' && route === '/api/noms' && typeof body === 'string') {
        const b = JSON.parse((JSON.parse(body) as { b: string }).b) as { pk: string; who?: unknown };
        if (!rows.some((r) => r.authorKey === b.pk || r.voters.has(b.pk))) return { status: 204 };
        noteWho(b.pk, b.who);
        return { status: 200, json: { nom: parseFeedbackPerson(b.who)?.name } };
      }
      if (method === 'POST' && route === '/api/oubli' && typeof body === 'string') {
        const b = JSON.parse((JSON.parse(body) as { b: string }).b) as { pk: string };
        const mine = rows.filter((r) => r.authorKey === b.pk);
        rows = rows.filter((r) => r.authorKey !== b.pk);
        for (const r of rows) r.voters.delete(b.pk);
        names.delete(b.pk);
        for (const who of reactions.values()) who.delete(b.pk);
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
