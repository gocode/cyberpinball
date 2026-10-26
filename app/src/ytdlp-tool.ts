// yt-dlp sur la borne (packages/core/src/ytdlp.ts) : installé à la première demande depuis
// ses versions GitHub, vérifié (empreinte de l'API et SHA2-256SUMS), rangé dans
// <racine>\tools\yt-dlp avec version.json, remplacé par une version plus récente quand il y en
// a une (recherche au plus une fois par semaine ; sans réseau, l'outil installé sert). Puis
// lancé pour une page : le son seul ou la vidéo seule, dans un dossier à lui, sa progression
// relevée ligne à ligne, arrêté (avec ses processus) si l'utilisateur annule.
// Pour YouTube, yt-dlp a besoin d'un moteur JavaScript : l'exécutable de Cyber Pinball en
// tient lieu (ELECTRON_RUN_AS_NODE=1).

import { spawn, execFile } from 'node:child_process';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  parseYtDlpLine,
  parseYtDlpRelease,
  sumsFor,
  t,
  ytdlpArgs,
  ytdlpCheckDue,
  ytdlpErrorText,
  ytdlpRefusal,
  YTDLP_ASSET,
  YTDLP_LATEST_URL,
  type GrabKind,
  type YtDlpRelease,
  type YtDlpState,
} from '@cyberpinball/core';

export interface YtDlpOptions {
  /** Racine de Cyber Pinball ; undefined avant l'installation. */
  root(): string | undefined;
  /** Requêtes réseau (fetch de Node par défaut ; un faux GitHub dans les essais). */
  fetch?: typeof fetch;
  /** Moteur JavaScript pour YouTube : l'exécutable de Cyber Pinball, en mode Node. */
  node?: string;
  /** Pour les essais : la commande à lancer à la place de yt-dlp.exe. */
  command?: (exe: string, args: string[]) => { file: string; args: string[] };
  /**
   * Pour les essais : l'outil à utiliser tel quel, sans installation (CYBERPINBALL_YTDLP),
   * relu à chaque demande ; un script .js est lancé par Node (l'exécutable en mode Node).
   */
  override?: () => string | undefined;
}

/** Avancement : installation de l'outil, puis téléchargement de la page. */
export interface GrabProgress {
  phase: 'install' | 'download';
  received: number;
  total?: number;
  approx?: boolean;
  rate?: number;
}

export type GrabResult = { ok: true; file: string } | { ok: false; reason: string; cancelled?: boolean };

function sha256(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    fs.createReadStream(file)
      .on('data', (chunk) => hash.update(chunk))
      .on('error', reject)
      .on('end', () => resolve(hash.digest('hex')));
  });
}

export function createYtDlp(opts: YtDlpOptions) {
  const get = opts.fetch ?? fetch;
  const dir = () => (opts.root() ? path.join(opts.root()!, 'tools', 'yt-dlp') : undefined);
  const exePath = () => (dir() ? path.join(dir()!, YTDLP_ASSET) : undefined);
  const stateFile = () => (dir() ? path.join(dir()!, 'version.json') : undefined);

  function state(): YtDlpState | undefined {
    try {
      const s = JSON.parse(fs.readFileSync(stateFile()!, 'utf8')) as YtDlpState;
      return fs.existsSync(exePath()!) ? s : undefined;
    } catch {
      return undefined;
    }
  }

  function saveState(s: YtDlpState): void {
    fs.writeFileSync(stateFile()!, `${JSON.stringify(s, null, 2)}\n`, 'utf8');
  }

  /** L'outil est-il déjà là (sinon la première demande le télécharge) ? */
  const installed = () => Boolean(opts.override?.() || state());

  async function latest(signal?: AbortSignal): Promise<YtDlpRelease> {
    const response = await get(YTDLP_LATEST_URL, { headers: { accept: 'application/vnd.github+json', 'user-agent': 'CyberPinball' }, signal });
    if (!response.ok) throw new Error(t('GitHub a répondu {status}', { status: response.status }));
    const release = parseYtDlpRelease(await response.json());
    if (!release) throw new Error(t('version de yt-dlp illisible sur GitHub'));
    return release;
  }

  /** Télécharge et vérifie une version, puis la met à la place de l'ancienne. */
  async function install(release: YtDlpRelease, progress?: (p: GrabProgress) => void, signal?: AbortSignal): Promise<void> {
    const folder = dir()!;
    fs.mkdirSync(folder, { recursive: true });
    const sumsResponse = await get(release.sumsUrl, { redirect: 'follow', signal });
    const sums = sumsResponse.ok ? sumsFor(await sumsResponse.text(), YTDLP_ASSET) : undefined;
    const part = path.join(folder, `${YTDLP_ASSET}.part`);
    const response = await get(release.url, { redirect: 'follow', signal });
    if (!response.ok || !response.body) throw new Error(t('téléchargement de yt-dlp impossible (HTTP {status})', { status: response.status }));
    const total = Number(response.headers.get('content-length')) || release.size;
    let received = 0;
    const body = Readable.fromWeb(response.body as import('node:stream/web').ReadableStream);
    body.on('data', (chunk: Buffer) => {
      received += chunk.length;
      progress?.({ phase: 'install', received, total });
    });
    try {
      await pipeline(body, fs.createWriteStream(part));
    } catch (error) {
      fs.rmSync(part, { force: true });
      throw error;
    }
    const actual = await sha256(part);
    const refusal = ytdlpRefusal(actual, release, sums);
    if (refusal) {
      fs.rmSync(part, { force: true });
      throw new Error(t('yt-dlp refusé : {reason} ; fichier supprimé', { reason: refusal }));
    }
    fs.rmSync(exePath()!, { force: true });
    fs.renameSync(part, exePath()!);
    const now = new Date().toISOString();
    saveState({ version: release.tag, sha256: actual, installed: now, checked: now });
  }

  /**
   * L'outil prêt à servir : installé à la première demande ; une version plus récente
   * remplace l'ancienne (au plus une recherche par semaine). Sans réseau, l'outil installé
   * sert tel quel.
   */
  async function ensure(progress?: (p: GrabProgress) => void, signal?: AbortSignal): Promise<string> {
    const override = opts.override?.();
    if (override) return override;
    if (!dir()) throw new Error(t('Cyber Pinball n’est pas installé'));
    const now = state();
    if (now && !ytdlpCheckDue(now)) return exePath()!;
    let release: YtDlpRelease;
    try {
      release = await latest(signal);
    } catch (error) {
      if (now) return exePath()!;
      throw new Error(t('yt-dlp introuvable sur GitHub : {error}', { error: (error as Error).message }));
    }
    if (now && now.version === release.tag) {
      saveState({ ...now, checked: new Date().toISOString() });
      return exePath()!;
    }
    try {
      await install(release, progress, signal);
    } catch (error) {
      // La nouvelle version n'a pas pu s'installer : l'ancienne sert encore.
      if (now && !signal?.aborted) return exePath()!;
      throw error;
    }
    return exePath()!;
  }

  /** Arrête yt-dlp et le moteur JavaScript qu'il a lancé. */
  function stop(pid: number | undefined): void {
    if (!pid) return;
    if (process.platform === 'win32') execFile('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true }, () => undefined);
    else process.kill(pid);
  }

  /**
   * Le son seul ou la vidéo seule d'une page, dans `out` (un dossier à lui) : installe
   * l'outil si besoin, relève la progression, rend le fichier final ou la raison de l'échec.
   */
  async function grab(request: { url: string; want: GrabKind; out: string; signal?: AbortSignal; progress?: (p: GrabProgress) => void }): Promise<GrabResult> {
    const { signal } = request;
    let exe: string;
    try {
      exe = await ensure(request.progress, signal);
    } catch (error) {
      return signal?.aborted ? { ok: false, reason: t('arrêté'), cancelled: true } : { ok: false, reason: (error as Error).message };
    }
    fs.mkdirSync(request.out, { recursive: true });
    const args = ytdlpArgs({ url: request.url, want: request.want, dir: request.out, node: opts.node });
    const command = opts.command?.(exe, args) ?? (exe.endsWith('.js') ? { file: opts.node ?? process.execPath, args: [exe, ...args] } : { file: exe, args });
    return new Promise<GrabResult>((resolve) => {
      const child = spawn(command.file, command.args, {
        windowsHide: true,
        cwd: request.out,
        // Le moteur JavaScript que yt-dlp lance : l'exécutable de Cyber Pinball, en mode Node.
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
      });
      let file: string | undefined;
      let error: string | undefined;
      let rest = '';
      const read = (chunk: Buffer) => {
        const lines = (rest + chunk.toString('utf8')).split(/\r?\n/);
        rest = lines.pop() ?? '';
        for (const line of lines) {
          const parsed = parseYtDlpLine(line);
          if (!parsed) continue;
          if (parsed.kind === 'progress') request.progress?.({ phase: 'download', received: parsed.received, total: parsed.total, approx: parsed.approx, rate: parsed.rate });
          else if (parsed.kind === 'file') file = parsed.path;
          else error ??= parsed.message;
        }
      };
      child.stdout.on('data', read);
      child.stderr.on('data', read);
      const abort = () => stop(child.pid);
      signal?.addEventListener('abort', abort, { once: true });
      child.on('error', (e) => {
        signal?.removeEventListener('abort', abort);
        resolve({ ok: false, reason: t('yt-dlp ne démarre pas : {error}', { error: e.message }) });
      });
      child.on('close', (code) => {
        signal?.removeEventListener('abort', abort);
        if (rest) read(Buffer.from('\n'));
        if (signal?.aborted) {
          fs.rmSync(request.out, { recursive: true, force: true });
          return resolve({ ok: false, reason: t('arrêté'), cancelled: true });
        }
        // Le chemin imprimé, sinon le seul fichier fini du dossier.
        const done = file && fs.existsSync(file) ? file : finished(request.out);
        if (code === 0 && done) return resolve({ ok: true, file: done });
        fs.rmSync(request.out, { recursive: true, force: true });
        resolve({ ok: false, reason: ytdlpErrorText(error) });
      });
    });
  }

  return { installed, ensure, grab, version: () => state()?.version };
}

/** Le fichier fini le plus récent d'un dossier (ni .part, ni .ytdl). */
function finished(dir: string): string | undefined {
  try {
    return fs
      .readdirSync(dir)
      .filter((n) => !/\.(part|ytdl|temp)$/i.test(n) && !/\.part-Frag\d+$/i.test(n))
      .map((n) => path.join(dir, n))
      .filter((p) => fs.statSync(p).isFile())
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
  } catch {
    return undefined;
  }
}

export type YtDlp = ReturnType<typeof createYtDlp>;
