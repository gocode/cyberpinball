// Gestionnaire de téléchargements : fait tourner la file (downloadqueue.ts). Chaque source a son
// transport, fourni par l'application : un ami (réseau des bornes, friend-content.ts), une page
// de site (navigateur intégré, acquire-window.ts), une adresse directe (resumable.ts). Sans
// Electron ni réseau ici : les tests du cœur le font tourner avec des sources simulées.
//
// Règles :
// - un téléchargement à la fois par source (un ami n'envoie qu'un fichier à la fois), trois en
//   tout ; les autres attendent leur tour, dans l'ordre où ils ont été demandés ;
// - les fichiers d'un téléchargement arrivent l'un après l'autre ; chacun reprend là où son
//   partiel s'est arrêté (resumeOffset : la taille sur le disque) ;
// - une source qui disparaît (ami déconnecté, site muet) met le téléchargement en attente : il
//   repart seul quand elle revient (relevé toutes les quelques secondes : ami relié, heure du
//   prochain essai d'un site) ; « Réessayer maintenant » et « Reprendre » restent possibles ;
// - un fichier repris dont l'empreinte finale est fausse repart une fois de zéro (le début gardé
//   était abîmé), puis échoue ; jamais un fichier faux n'est rendu ;
// - la file est écrite à chaque changement d'état, et la progression au plus toutes les deux
//   secondes : un arrêt brutal ne perd que ce que le partiel n'a pas encore reçu.

import * as fs from 'node:fs';
import {
  isActive,
  loadDownloadQueue,
  reasonRetries,
  retryDelayMs,
  reviveQueue,
  saveDownloadQueue,
  shouldResume,
  trimQueue,
  type DownloadFile,
  type DownloadJob,
  type DownloadQueue,
  type DownloadReason,
  type DownloadSourceKind,
} from './downloadqueue';
import { createTransferMeter, type TransferMeter, type TransferProgress } from './transfer';
import { partSize, resumeOffset } from './resumable';

export interface TransportRun {
  job: Readonly<DownloadJob>;
  file: Readonly<DownloadFile>;
  /** Octets déjà dans le partiel : la source envoie la suite. */
  from: number;
  signal: AbortSignal;
  /** Octets du fichier reçus jusqu'ici (partiel compris). */
  progress(received: number, total?: number): void;
  /** La source a appris quelque chose pour reprendre (ETag, adresses traversées…) : gardé dans le fichier. */
  remember(meta: Record<string, unknown>): void;
}

export type TransportResult =
  | { ok: true; file: string; bytes?: number; sha256?: string }
  | { ok: false; reason: DownloadReason; detail?: string };

export interface DownloadTransport {
  /** La source est là (ami relié, réseau démarré). */
  available(job: Readonly<DownloadJob>): boolean;
  fetch(run: TransportRun): Promise<TransportResult>;
}

export interface DownloadManagerOptions {
  dataDir: string;
  transports: Partial<Record<DownloadSourceKind, DownloadTransport>>;
  /** Un téléchargement est fini (tous ses fichiers vérifiés) : son finisseur (l'application). */
  finished?(job: DownloadJob): void;
  /** Quelque chose a changé : redessiner. */
  onChange?(): void;
  now?(): Date;
  /** Relevé des sources en attente (3 s par défaut). */
  tickMs?: number;
  /** Au plus, téléchargements en cours en même temps. */
  parallel?: number;
  log?(line: string): void;
}

/** Ce qu'on donne pour ajouter un téléchargement : le reste (état, dates) est posé par le gestionnaire. */
export type DownloadSpec = Omit<DownloadJob, 'id' | 'state' | 'created' | 'updated' | 'tries'> & { id?: string };

/**
 * Poignée d'un téléchargement que quelqu'un d'autre fait tourner : l'écran qui l'a lancé
 * (attached : plan de VPinMediaDB, mise à jour…), ou le navigateur intégré pour une page de site
 * (attached: false : après une coupure, c'est le gestionnaire qui le reprend par son transport).
 */
export interface TrackedDownload {
  id: string;
  /** Arrêt demandé dans le gestionnaire (pause, annulation) : le propriétaire arrête son téléchargement. */
  signal: AbortSignal;
  progress(received: number, total?: number): void;
  /** Ce qu'il faudra pour reprendre (état du téléchargement du navigateur…), gardé dans le premier fichier. */
  remember(meta: Record<string, unknown>): void;
  done(files?: readonly { index: number; file: string }[]): void;
  /** Coupure ou refus : `retries` (coupure) le met en attente, sinon en échec. */
  fail(reason: DownloadReason, detail?: string): void;
  cancel(): void;
}

export interface DownloadManager {
  jobs(): readonly DownloadJob[];
  get(id: string): DownloadJob | undefined;
  /** Progression mesurée (débit, temps restant) d'un téléchargement qui tourne. */
  progress(id: string): TransferProgress | undefined;
  /** Ajoute un téléchargement et le lance si sa source est là ; rend son identifiant. */
  add(spec: DownloadSpec): DownloadJob;
  /**
   * Téléchargement que fait tourner un autre : son écran (attached, par défaut), ou le navigateur
   * intégré (`attached: false`) ; `relaunch` : relancer l'écran quand la source revient (tant qu'il est là).
   */
  track(spec: DownloadSpec, relaunch?: () => void): TrackedDownload;
  pause(id: string): void;
  /** Reprise demandée : tout de suite si la source est là, sinon dès son retour. */
  resume(id: string): void;
  pauseAll(): void;
  resumeAll(): void;
  /** Annule : le partiel part, le téléchargement reste dans la liste, « Annulé ». */
  cancel(id: string): void;
  /** Retire de la liste un téléchargement fini, annulé ou échoué (ses fichiers reçus restent). */
  remove(id: string): void;
  clearFinished(): number;
  /** Rendu à son écran (« Revenir à… ») ; vu dans le gestionnaire. */
  delivered(id: string): void;
  seen(id: string): void;
  /** Change les données d'un téléchargement (dossier reçu, médias rendus…). */
  patch(id: string, data: Record<string, unknown>): void;
  /** Ce fichier (partiel, destination, reçu) appartient à un téléchargement de la file : ne pas l'effacer. */
  owns(file: string): boolean;
  /** Relève les sources tout de suite (un ami vient de se relier). */
  poke(): void;
  /** Pose le transport d'une source, quand il existe plus tard que la file (réseau des bornes, navigateur intégré). */
  setTransport(kind: DownloadSourceKind, transport: DownloadTransport): void;
  /** Arrêt de Cyber Pinball : tout s'arrête, la file est écrite ; elle reprendra au prochain démarrage. */
  stop(): void;
}

const SAVE_EVERY_MS = 2000;

export function createDownloadManager(opts: DownloadManagerOptions): DownloadManager {
  const now = () => opts.now?.() ?? new Date();
  const log = (line: string) => opts.log?.(line);
  let queue: DownloadQueue = trimQueue(reviveQueue(loadDownloadQueue(opts.dataDir), now()));
  const running = new Map<string, { abort: AbortController; meter: TransferMeter; progress?: TransferProgress }>();
  const relaunchers = new Map<string, () => void>();
  let lastSave = 0;
  let saveTimer: NodeJS.Timeout | undefined;
  let stopped = false;
  let nextId = 1;

  const changed = () => opts.onChange?.();

  function save(): void {
    clearTimeout(saveTimer);
    saveTimer = undefined;
    lastSave = Date.now();
    try {
      saveDownloadQueue(opts.dataDir, queue);
    } catch (error) {
      log(`Téléchargements : file pas écrite (${(error as Error).message}).`); // i18n-ignore : journal
    }
  }

  /** Progression : écrite au plus toutes les deux secondes ; un changement d'état l'est aussitôt. */
  function saveSoon(): void {
    if (saveTimer) return;
    const wait = Math.max(0, SAVE_EVERY_MS - (Date.now() - lastSave));
    saveTimer = setTimeout(save, wait);
    saveTimer.unref?.();
  }

  const find = (id: string) => queue.jobs.find((j) => j.id === id);

  function update(id: string, change: Partial<DownloadJob>): DownloadJob | undefined {
    const i = queue.jobs.findIndex((j) => j.id === id);
    if (i < 0) return undefined;
    const job = { ...queue.jobs[i]!, ...change, updated: now().toISOString() };
    queue = { version: 1, jobs: queue.jobs.map((j, k) => (k === i ? job : j)) };
    return job;
  }

  function newId(): string {
    const stamp = now().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
    let id: string;
    do id = `${stamp}-${(nextId++).toString(36)}`;
    while (find(id));
    return id;
  }

  // ---------- Ordonnancement ----------

  const sourceOf = (j: DownloadJob) => `${j.source.kind}:${j.source.key ?? j.source.label}`;

  function pump(): void {
    if (stopped) return;
    const busy = new Set([...running.keys()].map((id) => find(id)).filter((j): j is DownloadJob => !!j).map(sourceOf));
    const ctx = {
      now: now(),
      // La présence d'un ami se lit par son transport (available), juste après.
      online: () => true,
      ready: (kind: DownloadSourceKind) => !!opts.transports[kind],
    };
    for (const job of queue.jobs) {
      if (running.size >= (opts.parallel ?? 3)) break;
      if (running.has(job.id) || busy.has(sourceOf(job))) continue;
      const transport = opts.transports[job.source.kind];
      // Suivi par son écran : celui-ci le relance quand la source revient (tant qu'il est là).
      if (job.attached) {
        if (job.state === 'waiting' && reasonRetries(job.reason) && (!job.retryAt || Date.parse(job.retryAt) <= ctx.now.getTime()) && relaunchers.has(job.id)) {
          const relaunch = relaunchers.get(job.id)!;
          relaunchers.delete(job.id);
          update(job.id, { state: 'running', reason: undefined, retryAt: undefined });
          busy.add(sourceOf(job));
          relaunch();
        }
        continue;
      }
      if (!transport || !shouldResume(job, ctx) || !transport.available(job)) continue;
      busy.add(sourceOf(job));
      void run(job.id, transport);
    }
  }

  async function run(id: string, transport: DownloadTransport): Promise<void> {
    const abort = new AbortController();
    const meter = createTransferMeter();
    const slot: { abort: AbortController; meter: TransferMeter; progress?: TransferProgress } = { abort, meter };
    running.set(id, slot);
    update(id, { state: 'running', reason: undefined, detail: undefined, retryAt: undefined });
    save();
    changed();
    /** Un fichier repris faux repart de zéro une seule fois. */
    const restarted = new Set<number>();
    try {
      for (;;) {
        const job = find(id);
        if (!job || abort.signal.aborted) return;
        const index = job.files.findIndex((f) => !f.done);
        if (index < 0) break;
        const file = job.files[index]!;
        const from = resumeOffset(file.part, file.bytes);
        if (from === 0 && partSize(file.part) > 0) fs.truncateSync(file.part, 0);
        const before = job.files.reduce((n, f, k) => (k < index ? n + (f.bytes ?? partSize(f.file ?? f.part)) : n), 0);
        const total = job.files.every((f) => f.bytes !== undefined) ? job.files.reduce((n, f) => n + f.bytes!, 0) : undefined;
        const result = await transport.fetch({
          job,
          file,
          from,
          signal: abort.signal,
          progress: (received) => {
            slot.progress = meter.update(before + received, total);
            saveSoon();
            changed();
          },
          remember: (meta) => {
            const j = find(id);
            if (j) update(id, { files: j.files.map((f, k) => (k === index ? { ...f, meta: { ...f.meta, ...meta } } : f)) });
            saveSoon();
          },
        }).catch((error: Error): TransportResult => ({ ok: false, reason: 'network', detail: error.message }));
        if (abort.signal.aborted) return;
        const current = find(id);
        if (!current) return;
        if (result.ok) {
          update(id, { files: current.files.map((f, k) => (k === index ? { ...f, done: true, file: result.file, ...(result.sha256 ? { sha256: result.sha256 } : {}), bytes: result.bytes ?? f.bytes ?? partSize(result.file) } : f)) });
          save();
          changed();
          continue;
        }
        // Empreinte ou taille fausse d'un fichier repris : le début gardé était abîmé, il repart de zéro, une fois.
        if ((result.reason === 'sha' || result.reason === 'size') && !restarted.has(index)) {
          restarted.add(index);
          fs.rmSync(file.part, { force: true });
          log(`Téléchargements : « ${file.name} » repris faux (${result.reason}), reçu de nouveau depuis le début.`); // i18n-ignore : journal
          continue;
        }
        if (reasonRetries(result.reason)) {
          const tries = current.tries + 1;
          const retryAt = current.source.kind === 'friend' && result.reason !== 'busy' ? undefined : new Date(now().getTime() + retryDelayMs(tries)).toISOString();
          update(id, { state: 'waiting', reason: result.reason, detail: result.detail, tries, since: current.since ?? now().toISOString(), ...(retryAt ? { retryAt } : { retryAt: undefined }) });
          log(`Téléchargements : « ${current.title} » en attente (${result.reason}${result.detail ? ` : ${result.detail}` : ''}).`); // i18n-ignore : journal
        } else {
          update(id, { state: 'failed', reason: result.reason, detail: result.detail, seen: false });
          log(`Téléchargements : « ${current.title} » en échec (${result.reason}${result.detail ? ` : ${result.detail}` : ''}).`); // i18n-ignore : journal
        }
        save();
        changed();
        return;
      }
      const done = update(id, { state: 'done', finished: now().toISOString(), reason: undefined, detail: undefined, since: undefined, seen: false, delivered: false });
      save();
      changed();
      if (done) {
        log(`Téléchargements : « ${done.title} » fini (${done.files.length} fichier(s)).`); // i18n-ignore : journal
        try {
          opts.finished?.(done);
        } catch (error) {
          log(`Téléchargements : fin de « ${done.title} » en erreur (${(error as Error).message}).`); // i18n-ignore : journal
        }
      }
    } finally {
      if (running.get(id) === slot) running.delete(id);
      changed();
      setImmediate(pump);
    }
  }

  /** Arrête ce qui tourne ; `reason` dit au propriétaire (navigateur intégré) s'il doit garder ses octets (« pause ») ou tout effacer (« cancel »). */
  function halt(id: string, reason: 'pause' | 'cancel' | 'stop' = 'pause'): void {
    const slot = running.get(id);
    if (!slot) return;
    slot.abort.abort(reason);
    running.delete(id);
  }

  const tick = setInterval(pump, opts.tickMs ?? 3000);
  tick.unref?.();
  setImmediate(pump);

  function spec(s: DownloadSpec, extra: Partial<DownloadJob>): DownloadJob {
    const at = now().toISOString();
    const job: DownloadJob = { ...s, id: s.id ?? newId(), state: 'queued', created: at, updated: at, tries: 0, ...extra };
    // Le même identifiant (un écran qui relance son téléchargement) garde sa place : la liste ne bouge pas.
    const i = queue.jobs.findIndex((j) => j.id === job.id);
    if (i >= 0) job.created = queue.jobs[i]!.created;
    queue = trimQueue({ version: 1, jobs: i >= 0 ? queue.jobs.map((j, k) => (k === i ? job : j)) : [...queue.jobs, job] });
    save();
    changed();
    return job;
  }

  return {
    jobs: () => queue.jobs,
    get: find,
    progress: (id) => running.get(id)?.progress,
    add(s) {
      const job = spec(s, {});
      setImmediate(pump);
      return job;
    },
    track(s, relaunch) {
      let job = spec({ ...s, attached: s.attached ?? true }, { state: 'running' });
      const id = job.id;
      const meter = createTransferMeter();
      const slot = { abort: new AbortController(), meter } as { abort: AbortController; meter: TransferMeter; progress?: TransferProgress };
      running.set(id, slot);
      const finish = () => {
        if (running.get(id) === slot) running.delete(id);
        save();
        changed();
        setImmediate(pump);
      };
      return {
        id,
        signal: slot.abort.signal,
        remember(meta) {
          const j = find(id);
          if (j?.files[0]) update(id, { files: j.files.map((f, k) => (k === 0 ? { ...f, meta: { ...f.meta, ...meta } } : f)) });
          saveSoon();
        },
        progress(received, total) {
          // Arrêté dans le gestionnaire (pause, annulation) : un dernier relevé du propriétaire ne le relance pas.
          if (slot.abort.signal.aborted) return;
          slot.progress = meter.update(received, total);
          job = find(id) ?? job;
          if (job.state !== 'running') update(id, { state: 'running', reason: undefined, retryAt: undefined });
          saveSoon();
          changed();
        },
        done(files) {
          const j = find(id);
          if (!j) return finish();
          const got = new Map((files ?? []).map((f) => [f.index, f.file]));
          update(id, {
            state: 'done',
            finished: now().toISOString(),
            reason: undefined,
            seen: false,
            delivered: true,
            files: j.files.map((f, k) => (got.has(k) || !files ? { ...f, done: true, file: got.get(k) ?? f.file ?? f.dest ?? f.part, bytes: f.bytes ?? partSize(got.get(k) ?? f.dest ?? f.part) } : f)),
          });
          relaunchers.delete(id);
          finish();
        },
        fail(reason, detail) {
          const j = find(id);
          if (!j || slot.abort.signal.aborted) return finish();
          // Une coupure attend sa source quand quelqu'un saura reprendre : le gestionnaire (navigateur
          // intégré), ou l'écran qui sait se relancer ; sinon elle attend qu'on rouvre cet écran (échec).
          if (reasonRetries(reason) && (!j.attached || relaunch)) {
            const tries = j.tries + 1;
            update(id, { state: 'waiting', reason, detail, tries, since: j.since ?? now().toISOString(), retryAt: new Date(now().getTime() + retryDelayMs(tries)).toISOString() });
            if (relaunch) relaunchers.set(id, relaunch);
          } else update(id, { state: 'failed', reason, detail, seen: false });
          finish();
        },
        cancel() {
          relaunchers.delete(id);
          update(id, { state: 'cancelled', reason: undefined });
          finish();
        },
      };
    },
    pause(id) {
      const j = find(id);
      if (!j || !isActive(j)) return;
      halt(id);
      relaunchers.delete(id);
      update(id, { state: 'paused', retryAt: undefined });
      save();
      changed();
      setImmediate(pump);
    },
    resume(id) {
      const j = find(id);
      if (!j || j.state === 'done' || j.state === 'running') return;
      if (j.attached && !relaunchers.has(id)) return;
      update(id, { state: j.attached ? 'waiting' : 'queued', reason: j.attached ? 'network' : undefined, retryAt: undefined, tries: 0 });
      save();
      changed();
      pump();
    },
    pauseAll() {
      for (const j of queue.jobs) if (isActive(j) && j.state !== 'paused' && !j.attached) this.pause(j.id);
    },
    resumeAll() {
      for (const j of queue.jobs) if (j.state === 'paused' || (j.state === 'waiting' && !j.attached)) this.resume(j.id);
    },
    cancel(id) {
      const j = find(id);
      if (!j || !isActive(j)) return;
      halt(id, 'cancel');
      relaunchers.delete(id);
      for (const f of j.files) {
        try {
          if (!f.done) fs.rmSync(f.part, { force: true });
        } catch {
          // encore ouvert par son propriétaire, qui l'efface en s'arrêtant
        }
      }
      update(id, { state: 'cancelled', reason: undefined, retryAt: undefined });
      save();
      changed();
      setImmediate(pump);
    },
    remove(id) {
      const j = find(id);
      if (!j || isActive(j)) return;
      queue = { version: 1, jobs: queue.jobs.filter((x) => x.id !== id) };
      save();
      changed();
    },
    clearFinished() {
      const before = queue.jobs.length;
      queue = { version: 1, jobs: queue.jobs.filter(isActive) };
      save();
      changed();
      return before - queue.jobs.length;
    },
    delivered(id) {
      if (update(id, { delivered: true, seen: true })) save();
      changed();
    },
    seen(id) {
      const j = find(id);
      if (j && !j.seen && !isActive(j)) {
        update(id, { seen: true });
        save();
      }
    },
    patch(id, data) {
      const j = find(id);
      if (j && update(id, { data: { ...j.data, ...data } })) save();
    },
    owns(file) {
      const k = file.toLowerCase().replace(/[\\/]+$/, '');
      return queue.jobs.some((j) =>
        j.files.some((f) => [f.part, f.dest, f.file].some((p) => p && (p.toLowerCase() === k || p.toLowerCase().startsWith(`${k}\\`) || p.toLowerCase().startsWith(`${k}/`)))),
      );
    },
    poke: () => setImmediate(pump),
    setTransport(kind, transport) {
      opts.transports[kind] = transport;
      setImmediate(pump);
    },
    stop() {
      stopped = true;
      clearInterval(tick);
      for (const slot of running.values()) slot.abort.abort('stop');
      running.clear();
      save();
    },
  };
}
