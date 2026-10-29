// File des téléchargements (Menu système > Téléchargements) : tout ce qui arrive, d'un site ou
// d'un ami, au même endroit, à la manière d'une console de jeu. Ce module décrit la file et ses
// règles, sans réseau ni Electron ; le gestionnaire (downloadmanager.ts) la fait tourner.
//
// Chaque téléchargement retient :
// - sa source : un ami (sa clé), une page d'un site ouverte dans le navigateur intégré, ou une
//   adresse directe (VPinMediaDB, mise à jour, VPX) ;
// - ses fichiers, chacun avec son fichier partiel, gardé d'une session à l'autre : une coupure ne
//   perd rien, et ce qui est repris l'est à l'octet près (la taille du partiel sur le disque fait
//   foi, jamais un compteur gardé à part : pas de doublon) ;
// - l'écran d'où il a été demandé (`back`) : une fois fini, on y revient d'un geste ; si cet écran
//   n'existe plus (table retirée, ami supprimé), un repli le dit (resolveReturn).
//
// La file est écrite dans <données>\telechargements.json à chaque changement d'état (progression
// comprise, au plus toutes les deux secondes) : elle survit à la fermeture de Cyber Pinball et au
// redémarrage du PC. À la relecture, un téléchargement qui tournait attend sa source (reviveQueue)
// et reprend seul ; celui que suivait un écran fermé depuis (plan de VPinMediaDB, mise à jour)
// attend qu'on le relance depuis son écran.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { formatSize } from './fileops';
import { formatDateTime, formatNumber, t, tn } from './i18n';
import { partSize } from './resumable';
import { readJsonFile } from './store';

/** D'où il vient : un ami, une page de site (navigateur intégré), une adresse directe. */
export type DownloadSourceKind = 'friend' | 'site' | 'http';

export interface DownloadSource {
  kind: DownloadSourceKind;
  /** « Bruno », « vpuniverse.com », « VPinMediaDB ». */
  label: string;
  /** Clé de l'ami. */
  key?: string;
}

/** Ce que c'est, et donc ce qu'on en fait à la fin (le finisseur de l'application). */
export type DownloadJobKind =
  /** Médias d'une table d'un ami, jusqu'au brouillon de « Médias du jeu ». */
  | 'friend-media'
  /** Fichiers d'une table d'un ami (toute la table, ou des parties), jusqu'au plan d'ajout. */
  | 'friend-table'
  /** Fichier d'une page de site, pour la liste d'attente ou un média. */
  | 'site'
  /** Médias de VPinMediaDB. */
  | 'mediadb'
  /** Installeur de Cyber Pinball. */
  | 'update'
  /** Archive de VPX. */
  | 'component'
  /** yt-dlp, ou une vidéo qu'il récupère. */
  | 'tool';

export type DownloadState = 'queued' | 'running' | 'waiting' | 'paused' | 'done' | 'failed' | 'cancelled';

/** Pourquoi il attend ou a échoué. */
export type DownloadReason =
  /** L'ami n'est plus relié. */
  | 'offline'
  /** Le site ne répond plus, ou la connexion a sauté. */
  | 'network'
  /** L'ami envoie déjà un autre fichier : il attend son tour. */
  | 'busy'
  /** Cyber Pinball a été fermé pendant le téléchargement. */
  | 'closed'
  /** Le site répond une erreur (page retirée, accès refusé). */
  | 'http'
  /** Le fichier ne fait pas la taille annoncée. */
  | 'size'
  /** Empreinte différente de celle annoncée : fichier abîmé ou changé. */
  | 'sha'
  /** Le contenu ne dit pas ce qu'il devait être (un média qui n'en est pas un). */
  | 'check'
  /** La source refuse (plus partagé, introuvable). */
  | 'refused'
  /** La page demande de se reconnecter, ou le lien a expiré : il faut rouvrir la page. */
  | 'login'
  /** Plus de place sur le disque. */
  | 'disk';

export interface DownloadFile {
  /** Identifiant chez la source : celui du fichier chez l'ami, l'adresse pour un site. */
  ref: string;
  /** Nom montré : « Medieval Madness.vpx », « Plateau (vidéo) ». */
  name: string;
  /** Taille annoncée par la source, si elle la donne. */
  bytes?: number;
  /** Fichier partiel : les octets reçus s'y accumulent, gardés entre deux sessions. */
  part: string;
  /** Où il va une fois vérifié ; absent : la source le dit (un média nommé par son empreinte). */
  dest?: string;
  /** Fichier reçu et vérifié. */
  file?: string;
  done?: boolean;
  sha256?: string;
  /** Ce que la source doit savoir pour reprendre (adresses traversées, ETag, type d'un média…). */
  meta?: Record<string, unknown>;
}

/**
 * Écran d'où le téléchargement a été demandé, où l'on revient quand il est fini. Rien qu'une
 * donnée : il survit au redémarrage, et l'application le rouvre (library.ts, openReturn).
 */
export type DownloadReturn =
  /** « Médias du jeu » d'une table installée (son fichier .vpx). */
  | { screen: 'table-medias'; table: string }
  /** « Parties du jeu » d'une table installée. */
  | { screen: 'game-parts'; table: string }
  /** Fiche d'une table installée. */
  | { screen: 'table-sheet'; table: string }
  /** Bibliothèque d'un ami, sur une de ses tables si `table` (identifiant dans sa bibliothèque). */
  | { screen: 'friend-library'; friend: string; table?: string }
  /** Liste d'attente (« Ajouter une table » > récupérés). */
  | { screen: 'wait-list' }
  /** « Mise à jour de Cyber Pinball ». */
  | { screen: 'updates' }
  /** Le gestionnaire lui-même : le repli de tous les autres. */
  | { screen: 'downloads' };

export type DownloadScreen = DownloadReturn['screen'];

export interface DownloadJob {
  id: string;
  kind: DownloadJobKind;
  /** « 4 médias de Medieval Madness », « Toute la table : Attack from Mars ». */
  title: string;
  source: DownloadSource;
  files: DownloadFile[];
  state: DownloadState;
  reason?: DownloadReason;
  /** Précision de la raison (« HTTP 404 », message du site). */
  detail?: string;
  back: DownloadReturn;
  /** Données de la sorte, pour son finisseur (table de l'ami, dossier reçu, table de la borne…). */
  data?: Record<string, unknown>;
  created: string;
  updated: string;
  /** Depuis quand il attend sa source (pour « Chloé s'est déconnectée à 22:14 »). */
  since?: string;
  finished?: string;
  /** Essais après une coupure d'un site, et l'heure du prochain. */
  tries: number;
  retryAt?: string;
  /** La source sait reprendre au milieu d'un fichier. */
  resumable: boolean;
  /**
   * Suivi par l'écran qui l'a lancé (plan de VPinMediaDB, mise à jour, VPX) : c'est lui qui
   * télécharge ; le gestionnaire le montre, le relance tant que l'écran est là, et après un
   * redémarrage attend qu'on le relance depuis cet écran.
   */
  attached?: boolean;
  /** Vu dans le gestionnaire depuis sa fin (sinon « Prêt » sur la pastille du menu). */
  seen?: boolean;
  /** Rendu à son écran (« Revenir à… » fait, ou ouvert de lui-même à la fin). */
  delivered?: boolean;
}

export interface DownloadQueue {
  version: 1;
  jobs: DownloadJob[];
}

export const DOWNLOAD_QUEUE_FILE = 'telechargements.json';

/** Finis, annulés ou échoués gardés dans la liste au plus ce temps (les fichiers, eux, restent où ils sont). */
export const FINISHED_KEEP_MS = 14 * 24 * 3600_000;
/** Au plus, téléchargements gardés dans la liste (les plus anciens finis partent d'abord). */
export const QUEUE_MAX = 200;

export function downloadQueueFile(dataDir: string): string {
  return path.join(dataDir, DOWNLOAD_QUEUE_FILE);
}

const STATES: readonly DownloadState[] = ['queued', 'running', 'waiting', 'paused', 'done', 'failed', 'cancelled'];
const SCREENS: readonly DownloadScreen[] = ['table-medias', 'game-parts', 'table-sheet', 'friend-library', 'wait-list', 'updates', 'downloads'];

function validJob(j: unknown): j is DownloadJob {
  if (!j || typeof j !== 'object') return false;
  const r = j as Partial<DownloadJob>;
  return (
    typeof r.id === 'string' &&
    typeof r.title === 'string' &&
    typeof r.kind === 'string' &&
    STATES.includes(r.state as DownloadState) &&
    !!r.source &&
    typeof r.source.label === 'string' &&
    Array.isArray(r.files) &&
    r.files.every((f) => f && typeof f.ref === 'string' && typeof f.part === 'string' && typeof f.name === 'string') &&
    !!r.back &&
    SCREENS.includes(r.back.screen)
  );
}

/** La file écrite ; vide si absente ou illisible (un téléchargement illisible est oublié, jamais une erreur). */
export function loadDownloadQueue(dataDir: string): DownloadQueue {
  const file = downloadQueueFile(dataDir);
  try {
    if (!fs.existsSync(file)) return { version: 1, jobs: [] };
    const raw = readJsonFile(file) as { jobs?: unknown };
    return { version: 1, jobs: Array.isArray(raw.jobs) ? raw.jobs.filter(validJob).map((j) => ({ ...j, tries: j.tries ?? 0 })) : [] };
  } catch {
    return { version: 1, jobs: [] };
  }
}

/** Écrit la file d'un coup (fichier temporaire puis renommé) : une coupure de courant ne la tronque pas. */
export function saveDownloadQueue(dataDir: string, queue: DownloadQueue): void {
  fs.mkdirSync(dataDir, { recursive: true });
  const file = downloadQueueFile(dataDir);
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify({ version: 1, jobs: queue.jobs }, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, file);
}

export const isActive = (j: DownloadJob) => j.state === 'queued' || j.state === 'running' || j.state === 'waiting' || j.state === 'paused';
export const isFinished = (j: DownloadJob) => !isActive(j);

/**
 * La file relue au démarrage : un téléchargement qui tournait attend sa source (il reprendra
 * seul) ; celui que suivait un écran fermé depuis attend qu'on le relance ; les finis trop anciens
 * sont oubliés. Les fichiers déjà reçus et disparus depuis font revenir leur fichier à recevoir.
 */
export function reviveQueue(queue: DownloadQueue, now = new Date()): DownloadQueue {
  const jobs = queue.jobs
    .filter((j) => isActive(j) || now.getTime() - Date.parse(j.finished ?? j.updated) < FINISHED_KEEP_MS)
    .map((j): DownloadJob => {
      if (j.state !== 'running' && j.state !== 'queued') return j;
      if (j.attached) return { ...j, state: 'failed', reason: 'closed', updated: now.toISOString() };
      return { ...j, state: 'waiting', reason: 'closed', since: j.since ?? now.toISOString(), updated: now.toISOString(), retryAt: undefined };
    });
  return { version: 1, jobs };
}

/** Garde la file à sa taille : les finis les plus anciens partent d'abord, jamais un actif. */
export function trimQueue(queue: DownloadQueue): DownloadQueue {
  if (queue.jobs.length <= QUEUE_MAX) return queue;
  const finished = queue.jobs.filter(isFinished).sort((a, b) => Date.parse(a.finished ?? a.updated) - Date.parse(b.finished ?? b.updated));
  const drop = new Set(finished.slice(0, queue.jobs.length - QUEUE_MAX).map((j) => j.id));
  return { version: 1, jobs: queue.jobs.filter((j) => !drop.has(j.id)) };
}

// ---------------------------------------------------------------------------
// Octets

/** Octets reçus d'un fichier : sa taille s'il est fini, sinon celle de son partiel sur le disque. */
export function fileReceived(f: DownloadFile): number {
  if (f.done) return f.bytes ?? (f.file ? partSize(f.file) : 0);
  const have = partSize(f.part);
  return f.bytes !== undefined ? Math.min(have, f.bytes) : have;
}

/** Octets reçus et attendus du téléchargement ; `total` absent si un fichier n'a pas de taille connue. */
export function jobBytes(j: DownloadJob): { received: number; total?: number } {
  const received = j.files.reduce((n, f) => n + fileReceived(f), 0);
  const known = j.files.every((f) => f.bytes !== undefined || f.done);
  const total = known ? j.files.reduce((n, f) => n + (f.bytes ?? fileReceived(f)), 0) : undefined;
  return { received, ...(total !== undefined ? { total } : {}) };
}

/** Rang du fichier en cours (de 1 à n) : le premier pas fini. */
export function currentFile(j: DownloadJob): { index: number; count: number; file?: DownloadFile } {
  const i = j.files.findIndex((f) => !f.done);
  return { index: i < 0 ? j.files.length : i + 1, count: j.files.length, file: i < 0 ? undefined : j.files[i] };
}

// ---------------------------------------------------------------------------
// Reprise

/** Délai avant le prochain essai d'un site coupé : vite d'abord, puis toutes les quinze minutes. */
export function retryDelayMs(tries: number): number {
  const steps = [15_000, 30_000, 60_000, 2 * 60_000, 5 * 60_000, 10 * 60_000];
  return steps[Math.min(Math.max(0, tries - 1), steps.length - 1)] ?? 15 * 60_000;
}

/** Raisons qui se règlent seules : la source revient, le réseau revient, l'ami finit son envoi. */
export function reasonRetries(reason: DownloadReason | undefined): boolean {
  return reason === 'offline' || reason === 'network' || reason === 'busy' || reason === 'closed';
}

export interface ResumeContext {
  now: Date;
  /** L'ami est relié. */
  online(key: string): boolean;
  /** Un transport existe pour cette source (le réseau des bornes est démarré…). */
  ready(kind: DownloadSourceKind): boolean;
}

/**
 * Le téléchargement doit-il repartir de lui-même ? Seulement s'il attend sa source (jamais un
 * téléchargement mis en pause par l'utilisateur) : un ami dès qu'il est relié ; un site à l'heure
 * de son prochain essai. Un téléchargement suivi par un écran n'est relancé que par lui.
 */
export function shouldResume(j: DownloadJob, ctx: ResumeContext): boolean {
  if (j.attached) return false;
  if (j.state === 'queued') return ctx.ready(j.source.kind) && (j.source.kind !== 'friend' || ctx.online(j.source.key ?? ''));
  if (j.state !== 'waiting' || !reasonRetries(j.reason) || !ctx.ready(j.source.kind)) return false;
  if (j.source.kind === 'friend') return ctx.online(j.source.key ?? '') && (j.reason !== 'busy' || !j.retryAt || Date.parse(j.retryAt) <= ctx.now.getTime());
  return !j.retryAt || Date.parse(j.retryAt) <= ctx.now.getTime();
}

// ---------------------------------------------------------------------------
// Retour à l'écran d'origine

export interface ReturnWorld {
  /** Une table installée a ce fichier .vpx. */
  hasTable(file: string): boolean;
  /** Cet ami est (encore) un ami. */
  hasFriend(key: string): boolean;
  /** Titre d'une table installée, pour le dire. */
  tableTitle?(file: string): string | undefined;
  friendName?(key: string): string | undefined;
}

export interface ResolvedReturn {
  /** L'écran où l'on revient : celui d'origine, ou son repli. */
  to: DownloadReturn;
  /** L'écran d'origine n'existe plus : pourquoi, dit au retour. */
  lost?: string;
}

/**
 * Où ramène « Revenir à… » : l'écran d'origine s'il existe encore ; sinon son repli, toujours
 * valide, avec la raison. Une table retirée : la bibliothèque de l'ami d'où venait le
 * téléchargement s'il y en a un, sinon le gestionnaire. Un ami supprimé : le gestionnaire.
 */
export function resolveReturn(j: Pick<DownloadJob, 'back' | 'source'>, world: ReturnWorld): ResolvedReturn {
  const back = j.back;
  const friendBack = (lost: string): ResolvedReturn => (j.source.kind === 'friend' && j.source.key && world.hasFriend(j.source.key) ? { to: { screen: 'friend-library', friend: j.source.key }, lost } : { to: { screen: 'downloads' }, lost });
  switch (back.screen) {
    case 'table-medias':
    case 'game-parts':
    case 'table-sheet':
      return world.hasTable(back.table) ? { to: back } : friendBack(t('La table n’est plus sur la borne.'));
    case 'friend-library':
      return world.hasFriend(back.friend) ? { to: back } : { to: { screen: 'downloads' }, lost: t('{name} n’est plus dans vos amis.', { name: world.friendName?.(back.friend) ?? t('Cet ami') }) };
    default:
      return { to: back };
  }
}

/** Nom de l'écran de retour : « Médias du jeu · Medieval Madness ». */
export function returnLabel(back: DownloadReturn, world: Pick<ReturnWorld, 'tableTitle' | 'friendName'>): string {
  const table = (file: string) => world.tableTitle?.(file) ?? path.basename(file, path.extname(file));
  switch (back.screen) {
    case 'table-medias':
      return t('Médias du jeu · {table}', { table: table(back.table) });
    case 'game-parts':
      return t('Parties du jeu · {table}', { table: table(back.table) });
    case 'table-sheet':
      return t('Fiche · {table}', { table: table(back.table) });
    case 'friend-library':
      return t('Bibliothèque de {name}', { name: world.friendName?.(back.friend) ?? t('votre ami') });
    case 'wait-list':
      return t('Liste d’attente');
    case 'updates':
      return t('Mise à jour de Cyber Pinball');
    case 'downloads':
      return t('Téléchargements');
  }
}

// ---------------------------------------------------------------------------
// Textes

/** Heure d'un évènement : « 22:14 » le jour même, sinon « 28 oct. 22:14 ». */
export function downloadClock(iso: string, now = new Date()): string {
  const at = new Date(iso);
  const sameDay = at.toDateString() === now.toDateString();
  // formatDateTime : toLocaleDateString ajouterait toujours la date.
  return formatDateTime(at, sameDay ? { hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** Mot de l'état, pour son badge : jamais la couleur seule. */
export function downloadStateLabel(j: DownloadJob, sourceName = j.source.label): string {
  switch (j.state) {
    case 'queued':
      return t('À suivre');
    case 'running':
      return t('En cours');
    case 'paused':
      return t('En pause');
    case 'cancelled':
      return t('Annulé');
    case 'failed':
      return t('Échec');
    case 'done':
      return j.delivered ? t('Fini') : t('Prêt');
    case 'waiting':
      if (j.source.kind === 'friend' && (j.reason === 'offline' || j.reason === 'closed')) return t('En attente de {name}', { name: sourceName });
      if (j.reason === 'busy') return t('Son tour vient');
      if (j.retryAt) return t('Nouvel essai à {time}', { time: downloadClock(j.retryAt) });
      return t('En attente');
  }
}

/** Ton de l'état : bleu en cours, ambre en attente, vert prêt, rouge échec, gris en pause ou annulé. */
export function downloadTone(j: DownloadJob): 'info' | 'warning' | 'ok' | 'error' | 'quiet' {
  if (j.state === 'running' || j.state === 'queued') return 'info';
  if (j.state === 'waiting') return 'warning';
  if (j.state === 'done') return 'ok';
  if (j.state === 'failed') return 'error';
  return 'quiet';
}

/** Raison dite à l'utilisateur. */
export function downloadReasonText(j: Pick<DownloadJob, 'reason' | 'detail' | 'source' | 'since'>): string | undefined {
  const name = j.source.label;
  const at = j.since ? downloadClock(j.since) : undefined;
  switch (j.reason) {
    case 'offline':
      return at ? t('La borne de {name} s’est déconnectée à {time}', { name, time: at }) : t('{name} n’est pas en ligne', { name });
    case 'closed':
      return t('Cyber Pinball a été fermé pendant le téléchargement');
    case 'network':
      return t('le site ne répond plus');
    case 'busy':
      return t('{name} envoie déjà un autre fichier', { name });
    case 'http':
      return j.detail ? t('le site refuse ({detail})', { detail: j.detail }) : t('le site refuse le fichier');
    case 'size':
      return t('le fichier ne fait pas la taille annoncée');
    case 'sha':
      return t('empreinte différente : fichier abîmé ou changé');
    case 'check':
      return t('le contenu ne correspond pas à ce qui était annoncé');
    case 'refused':
      return t('{name} ne le partage plus', { name });
    case 'login':
      return t('la page demande de se reconnecter');
    case 'disk':
      return t('plus de place sur le disque');
    default:
      return j.detail;
  }
}

/** Volume : « 412 Mo sur 1,2 Go », « 14 Mo reçus, taille non annoncée », « 38 Mo ». */
export function downloadVolume(j: DownloadJob): string {
  const { received, total } = jobBytes(j);
  if (j.state === 'done') return formatSize(total ?? received);
  if (total === undefined) return t('{got} reçus, taille non annoncée', { got: formatSize(received, true) });
  return t('{got} sur {total}', { got: formatSize(received, true), total: formatSize(total) });
}

/** Part reçue, de 0 à 1 ; undefined sans taille connue. Jamais 1 avant la fin. */
export function downloadFraction(j: DownloadJob): number | undefined {
  if (j.state === 'done') return 1;
  const { received, total } = jobBytes(j);
  if (!total) return undefined;
  return Math.min(0.999, received / total);
}

/** Ce que la liste dit en une ligne du rang du fichier : « fichier 3 sur 7 » (plusieurs fichiers seulement). */
export function fileRank(j: DownloadJob): string | undefined {
  if (j.files.length < 2 || j.state === 'done') return undefined;
  const { index, count } = currentFile(j);
  return t('fichier {i} sur {n}', { i: formatNumber(index), n: formatNumber(count) });
}

export interface DownloadSummary {
  running: number;
  waiting: number;
  paused: number;
  /** Finis pas encore rendus à leur écran. */
  ready: number;
  failed: number;
  /** Part reçue de ce qui tourne ou attend (0 à 1), si les tailles sont connues. */
  fraction?: number;
  /** Octets qui restent à recevoir (tailles connues). */
  left: number;
}

export function summarize(jobs: readonly DownloadJob[]): DownloadSummary {
  const out: DownloadSummary = { running: 0, waiting: 0, paused: 0, ready: 0, failed: 0, left: 0 };
  let got = 0;
  let all = 0;
  let unknown = false;
  for (const j of jobs) {
    if (j.state === 'running' || j.state === 'queued') out.running++;
    else if (j.state === 'waiting') out.waiting++;
    else if (j.state === 'paused') out.paused++;
    else if (j.state === 'done' && !j.delivered) out.ready++;
    else if (j.state === 'failed' && !j.seen) out.failed++;
    if (j.state === 'running' || j.state === 'queued' || j.state === 'waiting') {
      const b = jobBytes(j);
      if (b.total === undefined) unknown = true;
      else {
        got += b.received;
        all += b.total;
        out.left += b.total - b.received;
      }
    }
  }
  if (!unknown && all > 0) out.fraction = Math.min(0.999, got / all);
  return out;
}

/** « 2 en cours · 2 en attente · 1 prêt » ; rien : « Rien en cours ». */
export function summaryText(s: DownloadSummary): string {
  const parts = [
    s.running ? tn(s.running, '{n} en cours', '{n} en cours') : '',
    s.waiting ? tn(s.waiting, '{n} en attente', '{n} en attente') : '',
    s.paused ? tn(s.paused, '{n} en pause', '{n} en pause') : '',
    s.ready ? tn(s.ready, '{n} prêt', '{n} prêts') : '',
    s.failed ? tn(s.failed, '{n} bloqué', '{n} bloqués') : '',
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : t('Rien en cours');
}

/**
 * Pastille du menu des tables, un seul texte à la fois, par priorité (jamais d'alternance) :
 * « 2 en cours · 45 % », sinon « En attente », sinon « 1 bloqué », sinon « 1 prêt » ; undefined
 * quand il n'y a rien à suivre (la pastille n'est pas dessinée). Le pourcentage porte sur les
 * octets de taille connue ; une taille inconnue ne compte pas pour zéro : il n'est pas dit.
 */
export function downloadsPill(s: DownloadSummary): { label: string; value?: number; tone: 'info' | 'warning' | 'ok' | 'error'; icon: 'download' | 'refresh' | 'check' | 'alert'; title: string } | undefined {
  const title = t('Téléchargements : {summary}', { summary: summaryText(s) });
  const value = s.fraction !== undefined ? { value: s.fraction } : {};
  if (s.running) {
    const count = tn(s.running, '{n} en cours', '{n} en cours');
    const label = s.fraction !== undefined ? t('{count} · {pct} %', { count, pct: formatNumber(Math.floor(s.fraction * 100)) }) : count;
    return { label, ...value, tone: 'info', icon: 'download', title };
  }
  if (s.waiting) return { label: t('En attente'), ...value, tone: 'warning', icon: 'refresh', title };
  if (s.failed) return { label: tn(s.failed, '{n} bloqué', '{n} bloqués'), tone: 'error', icon: 'alert', title };
  if (s.ready) return { label: tn(s.ready, '{n} prêt', '{n} prêts'), tone: 'ok', icon: 'check', title };
  return undefined;
}
