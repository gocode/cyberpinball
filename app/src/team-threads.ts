// Les fils avec l'équipe, vus de la borne (packages/core/src/feedback-threads.ts, 21/11/2026) : chaque
// rapport envoyé ouvre un fil (stamp), l'équipe y répond, la borne relève ses fils peu après le
// démarrage puis toutes les 20 minutes (et à l'ouverture des Messages en attente), annonce chaque
// réponse (notification, pastille des messages) et envoie ce que le joueur écrit en retour (write),
// scellé pour l'équipe comme un rapport. Une réponse publique de l'équipe sur une proposition du
// joueur entre aussi dans un fil (noteProposals), relu à chaque liste des propositions.
//
// Sans electron à l'exécution : les tests chargent ce module avec un service en mémoire.

import * as crypto from 'node:crypto';
import {
  addMyLine,
  addThread,
  loadThreads,
  markLineSent,
  markTeamThreadRead,
  mergeTeamReplies,
  newThread,
  noteProposalReplies,
  saveThreads,
  threadAnswerKey,
  threadPollDelay,
  threadsToPoll,
  threadsUnread,
  visibleThreads,
  cleanThreadText,
  type FeedbackPerson,
  type FeedbackThread,
  type Proposal,
  type ReportEnvelope,
  type TeamReplyBox,
  type ThreadLine,
  type ThreadOrigin,
  type ThreadStore,
} from '@cyberpinball/core';

export interface TeamThreadsOptions {
  dataDir: string;
  service: {
    replies(fils: readonly { fil: string; since: number }[]): Promise<TeamReplyBox[] | undefined>;
    sendReport(envelope: ReportEnvelope, file?: Uint8Array): Promise<'sent' | 'queued' | 'failed'>;
    queuedCount(): number;
    list(): readonly Proposal[];
  };
  version: string;
  language(): string;
  /** Le numéro de borne des rapports (FeedbackState.borne). */
  borne(): string;
  /** Rapports anonymes (FeedbackState.anonymous) : ni pseudo ni pays. */
  anonymous(): boolean;
  /** Le pseudo et le pays du joueur. */
  who(): FeedbackPerson | undefined;
  /** Les fils ont changé (une réponse lue, un message écrit) : la pastille et l'écran se redessinent. */
  changed(): void;
  /** Des réponses de l'équipe viennent d'arriver : à annoncer. */
  arrived(added: readonly { thread: FeedbackThread; line: ThreadLine }[]): void;
  log(line: string): void;
  now?(): number;
}

/**
 * Relève des fils : la première peu après le démarrage, puis à la cadence de threadPollDelay (chaque
 * minute pendant une conversation, toutes les 20 minutes sinon), vérifiée chaque minute.
 */
const FIRST_POLL_MS = 60_000;
const TICK_MS = 60_000;
/** À l'ouverture d'un écran des échanges : pas plus d'une relève toutes les dix secondes. */
const POLL_AGAIN_MS = 10_000;

export function createTeamThreads(opts: TeamThreadsOptions) {
  const now = () => opts.now?.() ?? Date.now();
  let store: ThreadStore = loadThreads(opts.dataDir);
  let polling: Promise<void> | undefined;
  let polledAt = 0;

  function set(next: ThreadStore): void {
    if (next === store) return;
    store = next;
    try {
      saveThreads(opts.dataDir, store);
    } catch (error) {
      opts.log(`Retours : fils non enregistrés (${(error as Error).message}).`); // i18n-ignore : journal
    }
    opts.changed();
  }

  /** Le pseudo s'il part : jamais pour un rapport anonyme. */
  const signature = (): { who?: FeedbackPerson } => {
    if (opts.anonymous()) return {};
    const who = opts.who();
    return who?.name ? { who } : {};
  };

  /**
   * Un rapport qui part : son fil est ouvert (clé gardée ici), l'enveloppe reçoit le fil, sa clé de
   * réponse et le pseudo (sauf anonymat). Ce que le joueur a écrit devient le premier message du fil ;
   * un plantage automatique n'en a pas, son fil ne se montre qu'à la première réponse.
   */
  function stamp(envelope: ReportEnvelope, title: string): ReportEnvelope {
    if (envelope.kind === 'message' || envelope.fil) return envelope;
    const origin: ThreadOrigin = envelope.kind === 'crash' ? 'crash' : 'report';
    const anonymous = opts.anonymous();
    const { thread, answer } = newThread(origin, title, envelope.at, { ...(envelope.table ? { table: envelope.table } : {}), ...(envelope.proposal ? { proposal: envelope.proposal } : {}), ...(anonymous ? { anonymous: true } : {}) });
    let next = addThread(store, thread);
    if (origin === 'report' && envelope.text) next = addMyLine(next, thread.fil, { id: `rapport:${thread.fil}`, text: envelope.text, at: envelope.at });
    set(next);
    // Un fil neuf n'a jamais été relevé : la prochaine ouverture des échanges le relève, quelle que soit la dernière relève.
    polledAt = 0;
    return { ...envelope, fil: thread.fil, answer, ...signature() };
  }

  /** Le joueur écrit dans un fil : scellé pour l'équipe, parti tout de suite ou à la prochaine connexion. */
  async function write(fil: string, raw: string): Promise<'sent' | 'queued' | 'failed'> {
    const thread = store.threads.find((x) => x.fil === fil);
    const text = cleanThreadText(raw);
    if (!thread || !text) return 'failed';
    const at = now();
    const id = `moi:${crypto.randomBytes(6).toString('base64url')}`;
    set(addMyLine(store, fil, { id, text, at, queued: true }));
    const envelope: ReportEnvelope = {
      v: 1,
      kind: 'message',
      text,
      ...(thread.table ? { table: thread.table } : {}),
      ...(thread.proposal ? { proposal: thread.proposal } : {}),
      version: opts.version,
      lang: opts.language(),
      borne: opts.borne(),
      at,
      fil,
      answer: threadAnswerKey(thread),
      ...signature(),
    };
    const sent = await opts.service.sendReport(envelope);
    if (sent === 'sent') set(markLineSent(store, fil, id));
    polledAt = 0;
    opts.log(`Retours : message dans un fil avec l'équipe : ${sent}.`); // i18n-ignore : journal
    return sent;
  }

  /** Les réponses publiques sur mes propositions (la liste vient d'être relue). */
  function noteProposals(list: readonly Proposal[] = opts.service.list()): void {
    const r = noteProposalReplies(store, list, now());
    if (!r.added.length) return;
    set(r.store);
    opts.arrived(r.added);
  }

  /** Relève les fils récents ; les réponses nouvelles sont rangées et annoncées. */
  function poll(): Promise<void> {
    polling ??= (async () => {
      // Céder d'abord la main : une relève sans rien à faire finirait sinon avant que `polling` ne la
      // retienne, et sa promesse déjà finie resterait là, toutes les relèves suivantes bloquées.
      await Promise.resolve();
      try {
        polledAt = now();
        noteProposals();
        // Les messages partis avec la file d'attente des rapports : plus « en attente ».
        if (opts.service.queuedCount() === 0 && store.threads.some((x) => x.lines.some((l) => l.queued)))
          set({ v: 1, threads: store.threads.map((x) => ({ ...x, lines: x.lines.map((l) => (l.queued ? { id: l.id, from: l.from, text: l.text, at: l.at } : l)) })) });
        const asked = threadsToPoll(store, now());
        if (!asked.length) return;
        const boxes = await opts.service.replies(asked);
        if (!boxes?.length) return;
        const r = mergeTeamReplies(store, boxes);
        set(r.store);
        if (r.added.length) {
          opts.log(`Retours : ${r.added.length} réponse(s) de l'équipe.`); // i18n-ignore : journal
          opts.arrived(r.added);
        }
      } finally {
        polling = undefined;
      }
    })();
    return polling;
  }

  function watch(): void {
    setTimeout(() => void poll(), FIRST_POLL_MS).unref?.();
    setInterval(() => void tick(), TICK_MS).unref?.();
  }

  /** Relève si la cadence du moment est échue (conversation en cours : chaque minute). */
  function tick(): Promise<void> {
    // Une marge de deux secondes : les minuteries ne tombent jamais pile.
    return now() - polledAt >= threadPollDelay(store, now()) - 2_000 ? poll() : Promise.resolve();
  }

  return {
    stamp,
    write,
    poll,
    tick,
    /** Relève si la dernière date de plus de dix secondes (ouverture de la liste des échanges, d'un fil). */
    pollIfOld: () => (now() - polledAt > POLL_AGAIN_MS ? poll() : Promise.resolve()),
    noteProposals,
    watch,
    read(fil: string): void {
      set(markTeamThreadRead(store, fil));
    },
    thread: (fil: string): FeedbackThread | undefined => store.threads.find((x) => x.fil === fil),
    /** Les fils où quelqu'un a écrit, ceux qui attendent une lecture d'abord. */
    visible: () => visibleThreads(store),
    unread: () => threadsUnread(store),
  };
}

export type TeamThreads = ReturnType<typeof createTeamThreads>;
