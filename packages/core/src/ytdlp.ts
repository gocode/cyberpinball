// yt-dlp, l'outil qui récupère la vidéo ou le son d'une page YouTube, Vimeo, Dailymotion…
// (docs/recherche/sources-medias.md § 7.4, choix de l'utilisateur du 26/10/2026) : yt-dlp
// seul, sans ffmpeg, téléchargé depuis ses versions GitHub à la première utilisation, vérifié
// par deux empreintes SHA-256 publiées par GitHub (celle de l'API pour le fichier, et la
// ligne de SHA2-256SUMS de la même version), rangé dans <racine>\tools\yt-dlp, et remplacé par
// la version suivante quand il y en a une (relue au plus une fois par semaine).
//
// Sans ffmpeg, seuls des formats d'un seul tenant : le son seul en M4A (accepté tel quel par
// la musique du jeu), ou la vidéo seule en MP4 H.264 (suffisante pour un écran, muet au
// menu). Pour YouTube, yt-dlp demande un moteur JavaScript : Electron en tient lieu
// (ELECTRON_RUN_AS_NODE=1, Node 24 ; yt-dlp exige Node 22 au moins).
// Ce module ne fait rien sur le réseau ni sur le disque : app/src/ytdlp-tool.ts le fait.

import { t } from './i18n';

/** Dernière version publiée, lue par l'API de GitHub. */
export const YTDLP_LATEST_URL = 'https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest';
/** Seules adresses de téléchargement acceptées : les versions du dépôt officiel. */
export const YTDLP_DOWNLOAD_PREFIX = 'https://github.com/yt-dlp/yt-dlp/releases/download/';
export const YTDLP_ASSET = 'yt-dlp.exe';
export const YTDLP_SUMS = 'SHA2-256SUMS';
/** Intervalle entre deux recherches d'une nouvelle version. */
export const YTDLP_CHECK_DAYS = 7;
/** Taille annoncée avant le premier téléchargement (17,9 Mo pour 2026.10.21). */
export const YTDLP_SIZE_HINT = 18_000_000;

/** Ce qu'il faut pour installer une version de yt-dlp. */
export interface YtDlpRelease {
  /** « 2026.10.21 » */
  tag: string;
  url: string;
  size: number;
  /** Empreinte du fichier donnée par l'API de GitHub (« digest »), si elle y est. */
  sha256?: string;
  /** Adresse de SHA2-256SUMS de la même version. */
  sumsUrl: string;
}

const HEX64 = /^[0-9a-f]{64}$/;

/** Version et fichiers d'une réponse de l'API de GitHub ; undefined si elle ne tient pas debout. */
export function parseYtDlpRelease(json: unknown): YtDlpRelease | undefined {
  if (!json || typeof json !== 'object') return undefined;
  const r = json as { tag_name?: unknown; assets?: unknown };
  if (typeof r.tag_name !== 'string' || !/^[\w.-]{1,40}$/.test(r.tag_name) || !Array.isArray(r.assets)) return undefined;
  const asset = (name: string) => (r.assets as { name?: unknown; browser_download_url?: unknown; size?: unknown; digest?: unknown }[]).find((a) => a?.name === name);
  const exe = asset(YTDLP_ASSET);
  const sums = asset(YTDLP_SUMS);
  const official = (u: unknown): u is string => typeof u === 'string' && u.startsWith(`${YTDLP_DOWNLOAD_PREFIX}${r.tag_name}/`);
  if (!exe || !sums || !official(exe.browser_download_url) || !official(sums.browser_download_url)) return undefined;
  const digest = typeof exe.digest === 'string' ? /^sha256:([0-9a-f]{64})$/i.exec(exe.digest)?.[1]?.toLowerCase() : undefined;
  return {
    tag: r.tag_name,
    url: exe.browser_download_url,
    size: typeof exe.size === 'number' ? exe.size : YTDLP_SIZE_HINT,
    ...(digest ? { sha256: digest } : {}),
    sumsUrl: sums.browser_download_url,
  };
}

/** Empreinte d'un fichier dans un SHA2-256SUMS (« <empreinte>  <nom> » par ligne). */
export function sumsFor(text: string, name: string): string | undefined {
  for (const line of text.split(/\r?\n/)) {
    const m = /^([0-9a-fA-F]{64})\s+\*?(.+?)\s*$/.exec(line);
    if (m && m[2] === name) return m[1]!.toLowerCase();
  }
  return undefined;
}

/**
 * Le fichier reçu est-il bien celui publié ? Il doit correspondre à la ligne de
 * SHA2-256SUMS et, si l'API la donne, à l'empreinte de GitHub : deux sources qui doivent
 * s'accorder. Renvoie la raison du refus, ou undefined.
 */
export function ytdlpRefusal(actual: string, release: YtDlpRelease, sums: string | undefined): string | undefined {
  const got = actual.toLowerCase();
  if (!sums || !HEX64.test(sums)) return t('empreinte de {name} absente de {sums}', { name: YTDLP_ASSET, sums: YTDLP_SUMS });
  if (got !== sums) return t('empreinte SHA-256 différente de {sums}', { sums: YTDLP_SUMS });
  if (release.sha256 && got !== release.sha256) return t('empreinte SHA-256 différente de celle annoncée par GitHub');
  return undefined;
}

/** Ce que Cyber Pinball note de l'outil installé (<racine>\tools\yt-dlp\version.json). */
export interface YtDlpState {
  version: string;
  sha256: string;
  /** Installation et dernière recherche d'une nouvelle version (ISO). */
  installed: string;
  checked: string;
}

/** Faut-il chercher une nouvelle version avant de s'en servir ? */
export function ytdlpCheckDue(state: YtDlpState | undefined, now = new Date()): boolean {
  if (!state) return true;
  const checked = Date.parse(state.checked);
  return !Number.isFinite(checked) || now.getTime() - checked > YTDLP_CHECK_DAYS * 86_400_000;
}

/** Ce qu'on demande à yt-dlp : le son seul, ou la vidéo seule. */
export type GrabKind = 'audio' | 'video';

/**
 * Formats d'un seul tenant (rien à assembler sans ffmpeg) : le son en M4A d'abord (le menu
 * le lit tel quel), sinon le meilleur son (WebM Opus, converti en WAV ensuite) ; la vidéo en
 * MP4 H.264 jusqu'au 1080p, sinon un MP4 avec son, sinon ce qu'il y a de mieux jusqu'au 1080p.
 */
export const YTDLP_FORMATS: Record<GrabKind, string> = {
  audio: 'bestaudio[ext=m4a]/bestaudio[acodec^=mp4a]/bestaudio',
  video: 'bestvideo[ext=mp4][vcodec^=avc1][height<=1080]/best[ext=mp4][height<=1080]/bestvideo[ext=mp4][height<=1080]/best[height<=1080]/best',
};

/** Repères des lignes que Cyber Pinball demande à yt-dlp d'écrire. */
export const YTDLP_PROGRESS_MARK = 'cyberpinball-progres:';
export const YTDLP_FILE_MARK = 'cyberpinball-fichier:';

/**
 * Arguments de yt-dlp pour une page : un seul fichier (jamais une liste de lecture), rangé
 * dans `dir` sous son titre, la progression en lignes lisibles, le chemin final imprimé,
 * le moteur JavaScript donné (Node, ou Electron en mode Node), aucune mise à jour par
 * yt-dlp lui-même (Cyber Pinball vérifie et remplace le fichier).
 */
export function ytdlpArgs(opts: { url: string; want: GrabKind; dir: string; node?: string }): string[] {
  const sep = opts.dir.includes('\\') ? '\\' : '/';
  return [
    '--ignore-config',
    '--no-playlist',
    '--no-mtime',
    '--no-colors',
    '--no-update',
    '--windows-filenames',
    '--newline',
    '--progress',
    '--progress-template',
    `download:${YTDLP_PROGRESS_MARK}%(progress.downloaded_bytes)s|%(progress.total_bytes)s|%(progress.total_bytes_estimate)s|%(progress.speed)s|%(progress.eta)s`,
    '--print',
    `after_move:${YTDLP_FILE_MARK}%(filepath)s`,
    '-f',
    YTDLP_FORMATS[opts.want],
    '-o',
    `${opts.dir.replace(/[\\/]+$/, '')}${sep}%(title).80B [%(id)s].%(ext)s`,
    ...(opts.node ? ['--no-js-runtimes', '--js-runtimes', `node:${opts.node}`] : []),
    '--',
    opts.url,
  ];
}

/** Une ligne de la sortie de yt-dlp, comprise. */
export type YtDlpLine = { kind: 'progress'; received: number; total?: number; approx?: boolean; rate?: number; eta?: number } | { kind: 'file'; path: string } | { kind: 'error'; message: string };

const num = (s: string | undefined) => {
  const n = Number(s);
  return s && s !== 'NA' && Number.isFinite(n) && n >= 0 ? n : undefined;
};

export function parseYtDlpLine(raw: string): YtDlpLine | undefined {
  const line = raw.trim();
  if (line.startsWith(YTDLP_PROGRESS_MARK)) {
    const [received, total, estimate, rate, eta] = line.slice(YTDLP_PROGRESS_MARK.length).split('|');
    const got = num(received);
    if (got === undefined) return undefined;
    const exact = num(total);
    const approx = exact === undefined ? num(estimate) : undefined;
    const out: YtDlpLine = { kind: 'progress', received: got };
    if (exact !== undefined || approx !== undefined) out.total = Math.round((exact ?? approx)!);
    if (approx !== undefined) out.approx = true;
    if (num(rate) !== undefined) out.rate = num(rate);
    if (num(eta) !== undefined) out.eta = num(eta);
    return out;
  }
  if (line.startsWith(YTDLP_FILE_MARK)) {
    const p = line.slice(YTDLP_FILE_MARK.length).trim();
    return p ? { kind: 'file', path: p } : undefined;
  }
  if (/^ERROR:/.test(line)) return { kind: 'error', message: line.replace(/^ERROR:\s*/, '') };
  return undefined;
}

/** Raison lisible d'un échec de yt-dlp, d'après son message (anglais). */
export function ytdlpErrorText(message: string | undefined): string {
  const m = message ?? '';
  if (/not a bot|confirm you.re not|sign in to confirm/i.test(m)) return t('YouTube demande de prouver qu’on n’est pas un robot : réessayez plus tard, ou prenez un fichier proposé par un site');
  if (/private video/i.test(m)) return t('vidéo privée');
  if (/members|join this channel|premium/i.test(m)) return t('vidéo réservée aux abonnés de la chaîne');
  if (/age.restricted|confirm your age|inappropriate for some users/i.test(m)) return t('vidéo soumise à une limite d’âge');
  if (/not available in your country|geo.?restrict/i.test(m)) return t('vidéo indisponible dans votre pays');
  if (/video unavailable|has been removed|does not exist/i.test(m)) return t('vidéo indisponible');
  if (/unsupported url/i.test(m)) return t('page que yt-dlp ne sait pas lire');
  if (/requested format is not available|no video formats/i.test(m)) return t('aucun format d’un seul tenant pour cette vidéo (il faudrait ffmpeg)');
  if (/live event|is live|premieres in/i.test(m)) return t('vidéo en direct ou pas encore diffusée');
  if (/getaddrinfo|timed out|connection|network|unable to download webpage/i.test(m)) return t('réseau injoignable');
  if (/js runtime|javascript|n challenge|signature/i.test(m)) return t('YouTube a changé : yt-dlp doit être mis à jour');
  return m ? m.split('\n')[0]!.slice(0, 200) : t('raison inconnue');
}
