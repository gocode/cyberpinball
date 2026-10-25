// Médias des sites communautaires, pour les propositions de chaque média (docs/recherche/
// sources-medias.md § 6) : VPForums, puis VPUniverse en dernier recours. Cœur :
// packages/core/src/mediasites.ts.
//
// - Recherche : les pages de résultats d'un site pour un titre (trois au plus), lues
//   dans une vue cachée de la session « Récupérer », quand l'utilisateur ouvre les
//   propositions d'un média ; sur VPUniverse, dans les seules catégories de ce média.
//   Gardée une demi-heure : revenir sur un média ne relance rien.
// - Vignettes : l'image fixe que l'auteur a déposée, reçue avec les cookies de la session.
// - File : un fichier à la fois par site, chaque site de son côté. Le minuteur de
//   VPUniverse (environ 45 s) se déroule dans la page, les secondes restantes sont
//   montrées sur la carte ; un plafond de téléchargements arrête la file de ce site.
// - Reçus : rangés dans <téléchargements>\sites\<site>-<fiche>\, archive déballée, et
//   notés dans sites\recus.json : un fichier reçu reste proposé aux visites suivantes,
//   pour ce média comme pour les autres écrans d'un pack.
// - Web : « Chercher sur le web… » ouvre la fenêtre « Récupérer » sur une recherche ;
//   ce que l'utilisateur y télécharge est rangé dans <téléchargements>\sites\web\, noté
//   dans sites\web.json avec la table et le média d'où il l'a cherché, et revient à ses
//   propositions.

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  checkSiteSearch,
  formatTransfer,
  hitTypes,
  mediaSite,
  receivedMedias,
  siteSearchByType,
  siteSearchUrl,
  siteState,
  siteHitKey,
  sourceSite,
  SITE_SEARCH_PAGES,
  SITE_SEARCH_PROBES,
  t,
  type MediaSiteId,
  type MediaType,
  type SiteHit,
  type SiteReceipt,
  type SiteSearchResult,
  type SiteState,
  type TransferProgress,
  type WebReceipt,
} from '@cyberpinball/core';
import type { Acquirer } from './acquire-window';
import { unpackArchive } from './archives';

export interface MediaSitesContext {
  acquirer: Acquirer;
  /** Dossier des téléchargements de Cyber Pinball ; undefined avant l'installation. */
  downloadsDir(): string | undefined;
  /** Quelque chose a changé (attente, progression, reçu) : redessiner l'écran. */
  changed(): void;
}

/** Champs d'un SiteJob pour une progression (chacun écrit, même absent : pas de débit d'un relevé précédent). */
function progressOf(p: TransferProgress): Pick<SiteJob, 'received' | 'total' | 'approx' | 'rate' | 'remaining'> {
  return { received: p.received, total: p.total, approx: p.approx, rate: p.rate, remaining: p.remaining };
}

export type SiteJobState ='queued' | 'waiting' | 'downloading' | 'unpacking' | 'received' | 'failed';

/** Un téléchargement demandé depuis les propositions d'un média. */
export interface SiteJob {
  /** « vpuniverse:27996 » */
  key: string;
  hit: SiteHit;
  /** Média d'où on l'a demandé : un fichier sans type reconnu ne sera proposé que pour lui. */
  type: MediaType;
  state: SiteJobState;
  /** Secondes que le site affiche avant de lancer le fichier. */
  seconds?: number;
  received?: number;
  total?: number;
  /** Taille lue sur la page du site (il ne l'annonce pas) : approchée. */
  approx?: boolean;
  /** Débit lissé (octets par seconde) et secondes restantes, dès qu'ils sont mesurés (transfer.ts). */
  rate?: number;
  remaining?: number;
  error?: string;
  /** Le site demande une connexion. */
  login?: boolean;
  /** Retiré par l'utilisateur pendant l'attente ou le téléchargement : il quitte la file au lieu d'échouer. */
  cancelled?: boolean;
}

/** Résultat de recherche gardé : par site et par texte cherché. */
interface Cached {
  at: number;
  result: SiteSearchResult;
}

const SEARCH_TTL_MS = 30 * 60 * 1000;

export const jobKey = siteHitKey;

export function createMediaSites(ctx: MediaSitesContext) {
  const searches = new Map<string, Cached>();
  const thumbs = new Map<string, string>();
  const jobs = new Map<string, SiteJob>();
  const running = new Set<MediaSiteId>();
  const listeners: ((job: SiteJob) => void)[] = [];
  const stops = new Map<MediaSiteId, AbortController>();
  let receipts: Map<string, SiteReceipt> | undefined;
  let webReceipts: WebReceipt[] | undefined;
  const webListeners: ((receipt: WebReceipt) => void)[] = [];

  const root = () => {
    const dir = ctx.downloadsDir();
    return dir ? path.join(dir, 'sites') : undefined;
  };

  // ---------- Comptes ----------

  async function state(site: MediaSiteId): Promise<SiteState> {
    const source = sourceSite(site)!;
    return siteState(source, await ctx.acquirer.siteCookies(source.domain));
  }

  /** Fenêtre de connexion du site ; `then` quand elle se ferme n'est pas suivi : l'état se relit à la visite suivante. */
  function signIn(site: MediaSiteId): void {
    const source = sourceSite(site)!;
    ctx.acquirer.show({
      url: source.login,
      game: t('Compte {site}', { site: mediaSite(site).name }),
      expected: t('Connectez-vous, cochez « Se souvenir de moi », puis Fermer (Échap)'),
      host: t('{site} · votre propre compte', { site: source.label }),
    });
  }

  // ---------- Recherche ----------

  /** Une page de résultats, lue et vérifiée (checkSiteSearch). */
  async function searchPage(site: MediaSiteId, query: string, type: MediaType | undefined, page: number): Promise<SiteSearchResult> {
    let raw: unknown;
    try {
      raw = await ctx.acquirer.readPage(siteSearchUrl(site, query, type, page), SITE_SEARCH_PROBES[site], 20_000);
    } catch {
      raw = undefined;
    }
    const checked = checkSiteSearch(site, raw);
    // Fiches sans titre : la page a changé de forme. L'écran ne le dit que si la plupart le sont.
    if (checked.untitled) console.warn(`${site} : ${checked.untitled} résultat(s) sans titre pour « ${query} » (page ${page}) : script de recherche à revoir.`); // i18n-ignore : journal
    return checked;
  }

  /**
   * Résultats d'un site pour un texte et un média : de la demi-heure passée, sinon lus
   * maintenant, jusqu'à SITE_SEARCH_PAGES pages. VPUniverse cherche dans les seules
   * catégories du média ; VPForums, partout (une recherche sert à tous les médias).
   */
  async function search(site: MediaSiteId, query: string, type?: MediaType): Promise<SiteSearchResult> {
    const own = siteSearchByType(site) ? type : undefined;
    const key = `${site}:${own ?? '*'}:${query.toLowerCase()}`;
    const cached = searches.get(key);
    if (cached && Date.now() - cached.at < SEARCH_TTL_MS) return cached.result;
    const first = await searchPage(site, query, own, 1);
    let result = first;
    if (first.kind === 'hits') {
      const hits = [...first.hits];
      for (let page = 2; page <= Math.min(first.pages ?? 1, SITE_SEARCH_PAGES); page++) {
        const next = await searchPage(site, query, own, page);
        if (next.kind !== 'hits') break;
        hits.push(...next.hits.filter((h) => !hits.some((k) => k.id === h.id)));
      }
      result = { kind: 'hits', hits, pages: first.pages };
    }
    // Seuls des résultats se gardent : après un échec ou une connexion, la visite suivante relit la page.
    if (result.kind === 'hits') searches.set(key, { at: Date.now(), result });
    return result;
  }

  /** Vignettes de ces résultats, reçues une fois dans <téléchargements>\sites\apercus. */
  async function stageThumbs(hits: SiteHit[]): Promise<void> {
    const dir = root();
    if (!dir) return;
    const todo = hits.filter((h) => h.thumb && !thumbs.has(h.thumb));
    await Promise.all(
      todo.map(async (h) => {
        const url = h.thumb!;
        const ext = /\.(png|jpe?g|gif|webp)(?:[.?#]|$)/i.exec(url)?.[1]?.toLowerCase() ?? 'jpg';
        const file = path.join(dir, 'apercus', `${crypto.createHash('sha1').update(url).digest('hex').slice(0, 20)}.${ext}`);
        const got = fs.existsSync(file) ? file : await ctx.acquirer.fetchImage(url, file);
        if (got) thumbs.set(url, got);
      }),
    );
  }

  // ---------- Reçus ----------

  const receiptsFile = () => (root() ? path.join(root()!, 'recus.json') : undefined);

  function loadReceipts(): Map<string, SiteReceipt> {
    if (receipts) return receipts;
    receipts = new Map();
    const file = receiptsFile();
    try {
      if (file && fs.existsSync(file)) {
        for (const r of JSON.parse(fs.readFileSync(file, 'utf8')) as SiteReceipt[]) {
          // Un fichier effacé depuis n'est plus proposé.
          const files = r.files.filter((f) => fs.existsSync(f.file));
          if (files.length) receipts.set(r.key, { ...r, files });
        }
      }
    } catch {
      // Relevé illisible : on repart de rien, les fichiers restent sur le disque.
    }
    return receipts;
  }

  function saveReceipts(): void {
    const file = receiptsFile();
    if (!file || !receipts) return;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify([...receipts.values()], null, 2)}\n`, 'utf8');
  }

  // ---------- File ----------

  /** Ajoute un résultat à la file de son site ; rien si déjà en file ou reçu. */
  function enqueue(hit: SiteHit, type: MediaType): SiteJob {
    const key = jobKey(hit);
    const known = jobs.get(key);
    if (known && known.state !== 'failed') return known;
    const job: SiteJob = { key, hit, type, state: 'queued' };
    jobs.set(key, job);
    ctx.changed();
    void pump(hit.site);
    return job;
  }

  /** Retire un fichier de la file ; celui en cours s'arrête (rien n'est gardé). */
  function cancel(key: string): void {
    const job = jobs.get(key);
    if (!job) return;
    if (job.state === 'queued') jobs.delete(key);
    else if (job.state === 'waiting' || job.state === 'downloading') {
      job.cancelled = true;
      stops.get(job.hit.site)?.abort();
    }
    ctx.changed();
  }

  /** Arrête la file d'un site, ou de tous : le fichier en cours et ceux en attente. */
  function stopAll(site?: MediaSiteId): void {
    for (const [key, job] of jobs) {
      if (site && job.hit.site !== site) continue;
      if (job.state === 'queued') jobs.delete(key);
      else if (job.state === 'waiting' || job.state === 'downloading') job.cancelled = true;
    }
    for (const [s, c] of stops) if (!site || s === site) c.abort();
    ctx.changed();
  }

  async function pump(site: MediaSiteId): Promise<void> {
    if (running.has(site)) return;
    running.add(site);
    try {
      for (;;) {
        const job = [...jobs.values()].find((j) => j.hit.site === site && j.state === 'queued');
        if (!job) break;
        await run(job);
      }
    } finally {
      running.delete(site);
      stops.delete(site);
    }
  }

  async function run(job: SiteJob): Promise<void> {
    const dir = root();
    const source = sourceSite(job.hit.site)!;
    const fail = (error: string, extra: Partial<SiteJob> = {}) => {
      // Retiré par l'utilisateur : il quitte la file, rien n'est gardé.
      if (job.cancelled) {
        jobs.delete(job.key);
        if (dir) fs.rmSync(folder, { recursive: true, force: true });
      } else Object.assign(job, { state: 'failed', error, seconds: undefined }, extra);
      ctx.changed();
    };
    const folder = path.join(dir ?? '', `${job.hit.site}-${job.hit.id}`);
    if (!dir) return fail(t('Cyber Pinball n’est pas installé'));
    if (!(await state(job.hit.site)).connected)
      return fail(
        t('connexion à {site} nécessaire', {
          site: mediaSite(job.hit.site).name,
        }),
        { login: true },
      );
    const stop = new AbortController();
    stops.set(job.hit.site, stop);
    const incoming = path.join(folder, 'recu');
    fs.rmSync(folder, { recursive: true, force: true });
    let resolveDone!: (r: { file: string } | { error: string }) => void;
    const done = new Promise<{ file: string } | { error: string }>((r) => (resolveDone = r));
    job.state = mediaSite(job.hit.site).wait ? 'waiting' : 'downloading';
    ctx.changed();
    const result = await ctx.acquirer.direct(job.hit.url, source, 60_000, {
      signal: stop.signal,
      onWait: (seconds) => {
        job.state = 'waiting';
        job.seconds = seconds;
        ctx.changed();
      },
      claim: {
        dir: incoming,
        signal: stop.signal,
        progress: (p) => {
          Object.assign(job, {
            state: 'downloading',
            seconds: undefined,
            ...progressOf(p),
          });
          ctx.changed();
        },
        done: (r) =>
          resolveDone(
            'error' in r
              ? {
                  error: r.error === 'cancelled' ? t('téléchargement annulé') : t('téléchargement interrompu'),
                }
              : { file: r.file },
          ),
      },
    });
    if (!result.ok) {
      // Plafond du compte : inutile d'essayer les suivants de ce site aujourd'hui.
      if (result.quota)
        for (const other of jobs.values())
          if (other !== job && other.hit.site === job.hit.site && other.state === 'queued') Object.assign(other, { state: 'failed', error: result.reason });
      return fail(result.reason, { login: result.login });
    }
    job.state = 'downloading';
    ctx.changed();
    const got = await Promise.race([
      done,
      new Promise<{ error: string }>((r) =>
        stop.signal.addEventListener('abort', () => r({ error: t('arrêté') }), {
          once: true,
        }),
      ),
    ]);
    if ('error' in got) {
      fs.rmSync(folder, { recursive: true, force: true });
      return fail(got.error);
    }
    await complete(job, got.file, folder);
  }

  /** Fichier reçu : déballé, ses médias relevés et notés, la carte prévenue. */
  async function complete(job: SiteJob, file: string, folder: string): Promise<void> {
    const fail = (error: string) => {
      Object.assign(job, { state: 'failed', error, seconds: undefined });
      ctx.changed();
    };
    const incoming = path.dirname(file);
    job.state = 'unpacking';
    ctx.changed();
    const files = path.join(folder, 'fichiers');
    fs.rmSync(files, { recursive: true, force: true });
    try {
      if (await unpackArchive(file, files)) fs.rmSync(file, { force: true });
      else {
        fs.mkdirSync(files, { recursive: true });
        fs.renameSync(file, path.join(files, path.basename(file)));
      }
    } catch (error) {
      return fail(
        t('archive illisible ({error})', {
          error: (error as Error).message.split('\n')[0]!,
        }),
      );
    }
    fs.rmSync(incoming, { recursive: true, force: true });
    const medias = receivedMedias(files, hitTypes(job.hit));
    if (!medias.length) return fail(t('aucun média dans ce qu’a envoyé le site'));
    loadReceipts().set(job.key, {
      key: job.key,
      site: job.hit.site,
      title: job.hit.title,
      url: job.hit.url,
      author: job.hit.author,
      type: job.type,
      date: new Date().toISOString(),
      files: medias,
    });
    saveReceipts();
    Object.assign(job, { state: 'received', seconds: undefined });
    for (const listener of listeners) listener(job);
    ctx.changed();
  }

  /**
   * Page de la fiche dans la fenêtre visible, quand le site demande quelque chose que
   * l'utilisateur doit faire lui-même (choix entre plusieurs fichiers, conditions,
   * vérification) : ce qu'il y télécharge revient à ce média, comme par la file.
   */
  function openPage(hit: SiteHit, type: MediaType, reason?: string): void {
    const dir = root();
    if (!dir) return;
    const key = jobKey(hit);
    const job: SiteJob = jobs.get(key) ?? { key, hit, type, state: 'queued' };
    Object.assign(job, {
      type,
      state: 'downloading',
      error: undefined,
      login: undefined,
      seconds: undefined,
      received: undefined,
      total: undefined,
      rate: undefined,
      remaining: undefined,
    });
    jobs.set(key, job);
    const folder = path.join(dir, `${hit.site}-${hit.id}`);
    const source = sourceSite(hit.site)!;
    ctx.acquirer.show({
      url: hit.url,
      game: hit.title,
      expected: t('Média : {title}', { title: hit.title }),
      host: t('{site} · votre propre compte', { site: source.label }),
      status: reason ? t('À faire vous-même : {reason}. Le fichier téléchargé revient aux propositions du média.', { reason }) : undefined,
      claim: {
        dir: path.join(folder, 'recu'),
        progress: (p) => {
          Object.assign(job, { state: 'downloading', ...progressOf(p) });
          ctx.changed();
        },
        done: (r) => {
          if ('error' in r) {
            Object.assign(job, {
              state: 'failed',
              error: r.error === 'cancelled' ? t('téléchargement annulé') : t('téléchargement interrompu'),
            });
            ctx.changed();
          } else void complete(job, r.file, folder);
        },
      },
    });
    ctx.changed();
  }

  // ---------- Web ----------

  const webFile = () => (root() ? path.join(root()!, 'web.json') : undefined);

  function loadWeb(): WebReceipt[] {
    if (webReceipts) return webReceipts;
    webReceipts = [];
    const file = webFile();
    try {
      if (file && fs.existsSync(file)) {
        for (const r of JSON.parse(fs.readFileSync(file, 'utf8')) as WebReceipt[]) {
          // Un fichier effacé depuis n'est plus proposé.
          const files = r.files.filter((f) => fs.existsSync(f.file));
          if (files.length) webReceipts.push({ ...r, files });
        }
      }
    } catch {
      // Relevé illisible : on repart de rien, les fichiers restent sur le disque.
    }
    return webReceipts;
  }

  function saveWeb(): void {
    const file = webFile();
    if (!file || !webReceipts) return;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(webReceipts, null, 2)}\n`, 'utf8');
  }

  /** Téléchargement en cours depuis la recherche web (octets reçus, total, débit, temps restant). */
  let webProgress: TransferProgress | undefined;

  /**
   * Fenêtre « Récupérer » sur une recherche web, quand les sources branchées n'ont pas
   * ce qu'il faut : l'utilisateur cherche, se connecte si le site le demande et
   * télécharge lui-même. Chaque fichier reçu est déballé et revient à ce média.
   */
  function openWeb(request: { url: string; table: string; title: string; type: MediaType; label: string }): void {
    const dir = root();
    if (!dir) return;
    const web = path.join(dir, 'web');
    const incoming = path.join(web, 'recu');
    ctx.acquirer.show({
      url: request.url,
      game: request.title,
      expected: t('Média : {label}', { label: request.label }),
      host: t('Recherche sur le web · fichiers que vous choisissez'),
      status: t('Cherchez, ouvrez une page, téléchargez : le fichier revient aux propositions ({label}). Fermer (Échap) pour revenir.', { label: request.label }),
      claim: {
        dir: incoming,
        progress: (p) => {
          webProgress = p;
          ctx.changed();
        },
        done: (r) => {
          webProgress = undefined;
          if ('error' in r) return ctx.changed();
          void completeWeb(r.file, r.filename, r.urls, request, web);
        },
      },
    });
  }

  async function completeWeb(file: string, filename: string, urls: string[], request: { table: string; type: MediaType }, web: string): Promise<void> {
    const stamp = new Date();
    const key = `web:${stamp.getTime().toString(36)}`;
    const files = path.join(web, key.slice(4), 'fichiers');
    fs.rmSync(files, { recursive: true, force: true });
    try {
      if (await unpackArchive(file, files)) fs.rmSync(file, { force: true });
      else {
        fs.mkdirSync(files, { recursive: true });
        fs.renameSync(file, path.join(files, path.basename(file)));
      }
    } catch {
      // Archive illisible : rien à proposer ; l'utilisateur voit que rien n'est arrivé.
      fs.rmSync(file, { force: true });
      return ctx.changed();
    }
    const medias = receivedMedias(files, { types: [request.type] });
    const receipt: WebReceipt = { key, table: request.table, type: request.type, url: urls[0] ?? '', filename, date: stamp.toISOString(), files: medias };
    if (medias.length) {
      loadWeb().push(receipt);
      saveWeb();
    } else fs.rmSync(path.dirname(files), { recursive: true, force: true });
    for (const listener of webListeners) listener(receipt);
    ctx.changed();
  }

  /** « 18,4 Mo sur 40 Mo · 2,1 Mo/s · environ 10 s » (transfer.ts). */
  function progressText(job: SiteJob): string | undefined {
    if (job.received === undefined) return undefined;
    return formatTransfer({ received: job.received, total: job.total, approx: job.approx, rate: job.rate, remaining: job.remaining });
  }

  return {
    /** Des fichiers reçus sont partis (écran « Téléchargements ») : les relevés seront relus. */
    forget: () => {
      receipts = undefined;
      webReceipts = undefined;
    },
    state,
    signIn,
    search,
    stageThumbs,
    thumb: (url: string | undefined) => (url ? thumbs.get(url) : undefined),
    enqueue,
    openPage,
    /** Appelé à chaque fichier reçu (la carte qui l'a demandé le met dans le brouillon). */
    onReceived: (listener: (job: SiteJob) => void) => void listeners.push(listener),
    cancel,
    stopAll,
    job: (key: string) => jobs.get(key),
    jobs: () => [...jobs.values()],
    receipt: (key: string) => loadReceipts().get(key),
    progressText,
    openWeb,
    /** Rouvrir la fenêtre « Récupérer » sur cette page de départ reprendrait la page où l'utilisateur en était. */
    resumable: (url: string) => ctx.acquirer.resumable(url),
    webReceipts: () => loadWeb(),
    webProgress: () => webProgress,
    /** Appelé à chaque fichier reçu de la recherche web (sans média dedans : `files` vide). */
    onWebReceived: (listener: (receipt: WebReceipt) => void) => void webListeners.push(listener),
  };
}

export type MediaSites = ReturnType<typeof createMediaSites>;
