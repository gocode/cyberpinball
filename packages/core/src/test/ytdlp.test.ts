// yt-dlp (ytdlp.ts, app/src/ytdlp-tool.ts) : la version lue sur GitHub, les deux empreintes
// qui doivent s'accorder, la recherche hebdomadaire d'une nouvelle version, les arguments
// (un fichier d'un seul tenant, sans ffmpeg ; Electron en moteur JavaScript), la sortie
// relevée ligne à ligne ; puis l'outil de l'application avec un faux GitHub et un faux
// yt-dlp : installation vérifiée, refus d'un fichier altéré, mise à jour, sans réseau,
// récupération, échec et annulation.

import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { setLanguage } from '../i18n';
import {
  parseYtDlpLine,
  parseYtDlpRelease,
  sumsFor,
  ytdlpArgs,
  ytdlpCheckDue,
  ytdlpErrorText,
  ytdlpRefusal,
  YTDLP_FILE_MARK,
  YTDLP_FORMATS,
  YTDLP_LATEST_URL,
  YTDLP_PROGRESS_MARK,
} from '../ytdlp';

setLanguage('fr');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'cp-ytdlp-'));
const sha = (data: Buffer | string) => crypto.createHash('sha256').update(data).digest('hex');
const TAG = '2026.10.21';
const DL = `https://github.com/yt-dlp/yt-dlp/releases/download/${TAG}/`;

/** Réponse de l'API de GitHub, réduite à ce que lit Cyber Pinball (relevée le 26/10/2026). */
function apiRelease(exe: Buffer, tag = TAG, digest = `sha256:${sha(exe)}`) {
  const base = `https://github.com/yt-dlp/yt-dlp/releases/download/${tag}/`;
  return {
    tag_name: tag,
    published_at: '2026-10-21T21:54:37Z',
    assets: [
      { name: 'yt-dlp', size: 3_000_000, browser_download_url: `${base}yt-dlp`, digest: `sha256:${'b'.repeat(64)}` },
      { name: 'SHA2-256SUMS', size: 1595, browser_download_url: `${base}SHA2-256SUMS`, digest: `sha256:${'e'.repeat(64)}` },
      { name: 'yt-dlp.exe', size: exe.length, browser_download_url: `${base}yt-dlp.exe`, digest },
    ],
  };
}
const sumsText = (exe: Buffer) => `${'b'.repeat(64)}  yt-dlp\n${sha(exe)}  yt-dlp.exe\n${'7'.repeat(64)}  yt-dlp_x86.exe\n`;

test('parseYtDlpRelease : version, fichier et empreinte de GitHub ; adresse hors du dépôt officiel refusée', () => {
  const exe = Buffer.from('MZ faux yt-dlp');
  assert.deepEqual(parseYtDlpRelease(apiRelease(exe)), { tag: TAG, url: `${DL}yt-dlp.exe`, size: exe.length, sha256: sha(exe), sumsUrl: `${DL}SHA2-256SUMS` });
  const noDigest = apiRelease(exe, TAG, '') as ReturnType<typeof apiRelease>;
  assert.equal(parseYtDlpRelease(noDigest)?.sha256, undefined, 'sans empreinte de l’API, SHA2-256SUMS seul');
  const moved = apiRelease(exe);
  moved.assets[2]!.browser_download_url = 'https://exemple.org/yt-dlp.exe';
  assert.equal(parseYtDlpRelease(moved), undefined, 'un fichier hors de github.com/yt-dlp/yt-dlp/releases n’est pas pris');
  const otherTag = apiRelease(exe);
  otherTag.assets[2]!.browser_download_url = `https://github.com/yt-dlp/yt-dlp/releases/download/2020.01.01/yt-dlp.exe`;
  assert.equal(parseYtDlpRelease(otherTag), undefined, 'le fichier doit être celui de la version annoncée');
  assert.equal(parseYtDlpRelease({ tag_name: TAG, assets: [] }), undefined);
  assert.equal(parseYtDlpRelease(undefined), undefined);
});

test('empreintes : la ligne de SHA2-256SUMS et celle de GitHub doivent s’accorder avec le fichier reçu', () => {
  const exe = Buffer.from('MZ faux yt-dlp');
  const release = parseYtDlpRelease(apiRelease(exe))!;
  const sums = sumsFor(sumsText(exe), 'yt-dlp.exe');
  assert.equal(sums, sha(exe));
  assert.equal(sumsFor(sumsText(exe), 'yt-dlp.ex'), undefined);
  assert.equal(ytdlpRefusal(sha(exe), release, sums), undefined);
  assert.match(ytdlpRefusal(sha('autre'), release, sums)!, /différente de SHA2-256SUMS/);
  assert.match(ytdlpRefusal(sha(exe), { ...release, sha256: 'a'.repeat(64) }, sums)!, /annoncée par GitHub/);
  assert.match(ytdlpRefusal(sha(exe), release, undefined)!, /absente de SHA2-256SUMS/, 'sans SHA2-256SUMS, pas d’installation');
});

test('nouvelle version : cherchée au plus une fois par semaine', () => {
  const now = new Date('2026-10-26T12:00:00Z');
  assert.equal(ytdlpCheckDue(undefined, now), true);
  assert.equal(ytdlpCheckDue({ version: TAG, sha256: '', installed: '', checked: '2026-10-22T12:00:00Z' }, now), false);
  assert.equal(ytdlpCheckDue({ version: TAG, sha256: '', installed: '', checked: '2026-10-18T12:00:00Z' }, now), true);
  assert.equal(ytdlpCheckDue({ version: TAG, sha256: '', installed: '', checked: 'illisible' }, now), true);
});

test('arguments : un seul fichier d’un seul tenant, jamais une liste, Electron en moteur JavaScript', () => {
  const args = ytdlpArgs({ url: 'https://www.youtube.com/watch?v=abcdefghijk&list=PL1', want: 'audio', dir: 'D:\\CP\\downloads\\sites\\web\\recu\\yt-dlp-1', node: 'D:\\CyberPinball\\app\\CyberPinball.exe' });
  for (const flag of ['--ignore-config', '--no-playlist', '--no-update', '--newline', '--windows-filenames']) assert.ok(args.includes(flag), flag);
  assert.equal(args[args.indexOf('-f') + 1], YTDLP_FORMATS.audio);
  assert.match(YTDLP_FORMATS.audio, /^bestaudio\[ext=m4a\]/, 'le son en M4A d’abord : le menu le lit tel quel');
  assert.match(YTDLP_FORMATS.video, /^bestvideo\[ext=mp4\]\[vcodec\^=avc1\]\[height<=1080\]/);
  assert.ok(!/\+/.test(YTDLP_FORMATS.audio + YTDLP_FORMATS.video), 'aucun format à assembler (« a+b » demanderait ffmpeg)');
  assert.equal(args[args.indexOf('-o') + 1], 'D:\\CP\\downloads\\sites\\web\\recu\\yt-dlp-1\\%(title).80B [%(id)s].%(ext)s');
  assert.deepEqual(args.slice(args.indexOf('--no-js-runtimes'), args.indexOf('--no-js-runtimes') + 3), ['--no-js-runtimes', '--js-runtimes', 'node:D:\\CyberPinball\\app\\CyberPinball.exe']);
  assert.deepEqual(args.slice(-2), ['--', 'https://www.youtube.com/watch?v=abcdefghijk&list=PL1'], 'l’adresse après « -- » : jamais prise pour une option');
  assert.ok(!ytdlpArgs({ url: 'u', want: 'video', dir: 'x' }).includes('--js-runtimes'));
});

test('sortie de yt-dlp : progression, chemin final, erreur ; raisons lisibles', () => {
  assert.deepEqual(parseYtDlpLine(`${YTDLP_PROGRESS_MARK}1048576|4194304|NA|524288.5|6`), { kind: 'progress', received: 1048576, total: 4194304, rate: 524288.5, eta: 6 });
  assert.deepEqual(parseYtDlpLine(`${YTDLP_PROGRESS_MARK}2048|NA|8000.7|NA|NA`), { kind: 'progress', received: 2048, total: 8001, approx: true });
  assert.deepEqual(parseYtDlpLine(`${YTDLP_PROGRESS_MARK}NA|NA|NA|NA|NA`), undefined);
  assert.deepEqual(parseYtDlpLine(`  ${YTDLP_FILE_MARK}D:\\x\\Guardians [abc].m4a\r`), { kind: 'file', path: 'D:\\x\\Guardians [abc].m4a' });
  assert.deepEqual(parseYtDlpLine('ERROR: [youtube] abc: Private video. Sign in if you\'ve been granted access'), { kind: 'error', message: '[youtube] abc: Private video. Sign in if you\'ve been granted access' });
  assert.equal(parseYtDlpLine('[youtube] abc: Downloading webpage'), undefined);
  assert.equal(ytdlpErrorText('[youtube] abc: Private video. Sign in'), 'vidéo privée');
  assert.match(ytdlpErrorText("[youtube] abc: Sign in to confirm you’re not a bot"), /robot/);
  assert.equal(ytdlpErrorText('[youtube] abc: Video unavailable'), 'vidéo indisponible');
  assert.equal(ytdlpErrorText('Unable to download webpage: <urlopen error [Errno 11001] getaddrinfo failed>'), 'réseau injoignable', 'pas « limite d’âge » pour « webpage »');
  assert.match(ytdlpErrorText('Requested format is not available'), /ffmpeg/);
  assert.equal(ytdlpErrorText(undefined), 'raison inconnue');
});

// ---------------------------------------------------------------------------
// L'outil de l'application (app/src/ytdlp-tool.ts, compilé), avec un faux GitHub et un faux yt-dlp

const APP_DIST = path.join(__dirname, '..', '..', '..', '..', 'app', 'dist');

interface Tool {
  installed(): boolean;
  version(): string | undefined;
  ensure(progress?: (p: { phase: string; received: number }) => void): Promise<string>;
  grab(request: { url: string; want: 'audio' | 'video'; out: string; signal?: AbortSignal; progress?: (p: { phase: string; received: number; total?: number }) => void }): Promise<{ ok: true; file: string } | { ok: false; reason: string; cancelled?: boolean }>;
}

/**
 * Faux yt-dlp (script Node) : relit les arguments, écrit la progression et le fichier comme
 * le vrai, ou échoue, ou attend (pour l'annulation), selon l'adresse demandée.
 */
const FAKE_YTDLP = `
const fs = require('node:fs'); const path = require('node:path');
const args = process.argv.slice(2);
const url = args[args.length - 1];
const out = args[args.indexOf('-o') + 1];
const want = args[args.indexOf('-f') + 1].startsWith('bestaudio') ? 'm4a' : 'mp4';
const mark = (name) => args.find((a) => a.includes(name)).split(':').slice(1).join(':').split('%')[0];
if (process.env.ELECTRON_RUN_AS_NODE !== '1') { console.error('ERROR: moteur JavaScript sans ELECTRON_RUN_AS_NODE'); process.exit(1); }
if (url.includes('privee')) { console.error('ERROR: [youtube] privee: Private video. Sign in if you have been granted access'); process.exit(1); }
if (url.includes('longue')) { setTimeout(() => {}, 60000); console.log('${YTDLP_PROGRESS_MARK}1000|100000|NA|500|200'); return; }
const file = out.replace('%(title).80B', 'Guardians of the Galaxy - Main Theme').replace('%(id)s', 'abcdefghijk').replace('%(ext)s', want);
for (const n of [25, 50, 100]) console.log('${YTDLP_PROGRESS_MARK}' + n * 1000 + '|100000|NA|50000|1');
fs.writeFileSync(file, want === 'm4a' ? Buffer.concat([Buffer.from('00000020', 'hex'), Buffer.from('ftypM4A ')]) : 'mp4');
console.log('${YTDLP_FILE_MARK}' + file);
`;

function toolWith(root: string, github: Map<string, () => Response>) {
  const { createYtDlp } = require(path.join(APP_DIST, 'ytdlp-tool.js')) as { createYtDlp(opts: object): Tool };
  const script = path.join(root, 'faux-yt-dlp.js');
  fs.writeFileSync(script, FAKE_YTDLP);
  const calls: string[] = [];
  const fetch = async (url: string) => {
    calls.push(url);
    const answer = github.get(url);
    if (!answer) throw new Error('réseau injoignable');
    return answer();
  };
  // Le faux yt-dlp est lancé par Node, le vrai serait yt-dlp.exe.
  const tool = createYtDlp({ root: () => root, fetch, node: process.execPath, command: (_exe: string, args: string[]) => ({ file: process.execPath, args: [script, ...args] }) });
  return { tool, calls };
}

function github(exe: Buffer, opts: { tag?: string; sums?: string } = {}) {
  const tag = opts.tag ?? TAG;
  const base = `https://github.com/yt-dlp/yt-dlp/releases/download/${tag}/`;
  return new Map<string, () => Response>([
    [YTDLP_LATEST_URL, () => Response.json(apiRelease(exe, tag))],
    [`${base}SHA2-256SUMS`, () => new Response(opts.sums ?? sumsText(exe))],
    [`${base}yt-dlp.exe`, () => new Response(exe, { headers: { 'content-length': String(exe.length) } })],
  ]);
}

test('outil : installé à la première demande, vérifié ; un fichier altéré est refusé et supprimé', async () => {
  const root = tmp();
  const exe = Buffer.alloc(300_000, 7);
  const { tool } = toolWith(root, github(exe));
  assert.equal(tool.installed(), false);
  const seen: number[] = [];
  const file = await tool.ensure((p) => seen.push(p.received));
  assert.equal(file, path.join(root, 'tools', 'yt-dlp', 'yt-dlp.exe'));
  assert.equal(sha(fs.readFileSync(file)), sha(exe));
  assert.equal(tool.installed(), true);
  assert.equal(tool.version(), TAG);
  assert.ok(seen.length && seen.at(-1) === exe.length, 'progression jusqu’à la taille du fichier');
  const state = JSON.parse(fs.readFileSync(path.join(root, 'tools', 'yt-dlp', 'version.json'), 'utf8'));
  assert.equal(state.sha256, sha(exe));

  const other = tmp();
  const { tool: bad } = toolWith(other, github(exe, { sums: `${'0'.repeat(64)}  yt-dlp.exe\n` }));
  await assert.rejects(bad.ensure(), /yt-dlp refusé : empreinte SHA-256 différente de SHA2-256SUMS ; fichier supprimé/);
  assert.equal(fs.existsSync(path.join(other, 'tools', 'yt-dlp', 'yt-dlp.exe')), false);
  assert.equal(fs.existsSync(path.join(other, 'tools', 'yt-dlp', 'yt-dlp.exe.part')), false);
});

test('outil : nouvelle version installée après une semaine ; sans réseau, l’outil installé sert', async () => {
  const root = tmp();
  const v1 = Buffer.alloc(1000, 1);
  const { tool } = toolWith(root, github(v1));
  await tool.ensure();
  const stateFile = path.join(root, 'tools', 'yt-dlp', 'version.json');
  // Revérifié il y a moins d'une semaine : aucune requête.
  const quiet = toolWith(root, new Map());
  await quiet.tool.ensure();
  assert.deepEqual(quiet.calls, []);
  // Une semaine plus tard, une nouvelle version : elle remplace l'ancienne.
  const old = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  fs.writeFileSync(stateFile, JSON.stringify({ ...old, checked: '2020-01-01T00:00:00Z' }));
  const v2 = Buffer.alloc(1200, 2);
  const next = toolWith(root, github(v2, { tag: '2026.11.02' }));
  await next.tool.ensure();
  assert.equal(next.tool.version(), '2026.11.02');
  assert.equal(sha(fs.readFileSync(path.join(root, 'tools', 'yt-dlp', 'yt-dlp.exe'))), sha(v2));
  // Sans réseau, au-delà d'une semaine : l'outil installé sert tel quel.
  fs.writeFileSync(stateFile, JSON.stringify({ ...JSON.parse(fs.readFileSync(stateFile, 'utf8')), checked: '2020-01-01T00:00:00Z' }));
  const offline = toolWith(root, new Map());
  assert.equal(await offline.tool.ensure(), path.join(root, 'tools', 'yt-dlp', 'yt-dlp.exe'));
  // Sans réseau et sans outil : une raison claire.
  const empty = toolWith(tmp(), new Map());
  await assert.rejects(empty.tool.ensure(), /yt-dlp introuvable sur GitHub/);
});

test('outil : le son récupéré, la progression relevée ; vidéo privée ; annulation sans rien garder', async () => {
  const root = tmp();
  const { tool } = toolWith(root, github(Buffer.alloc(500, 3)));
  const steps: string[] = [];
  const out = path.join(root, 'recu', 'yt-dlp-1');
  const got = await tool.grab({ url: 'https://www.youtube.com/watch?v=abcdefghijk', want: 'audio', out, progress: (p) => steps.push(`${p.phase} ${p.received}`) });
  assert.equal(got.ok, true);
  if (got.ok) assert.equal(path.basename(got.file), 'Guardians of the Galaxy - Main Theme [abcdefghijk].m4a');
  assert.ok(steps.includes('install 500'), 'installation d’abord');
  assert.deepEqual(steps.filter((s) => s.startsWith('download')), ['download 25000', 'download 50000', 'download 100000']);

  const video = await tool.grab({ url: 'https://www.youtube.com/watch?v=abcdefghijk', want: 'video', out: path.join(root, 'recu', 'yt-dlp-2') });
  assert.equal(video.ok && path.extname(video.file), '.mp4');

  const privee = await tool.grab({ url: 'https://www.youtube.com/watch?v=privee', want: 'audio', out: path.join(root, 'recu', 'yt-dlp-3') });
  assert.deepEqual(privee, { ok: false, reason: 'vidéo privée' });
  assert.equal(fs.existsSync(path.join(root, 'recu', 'yt-dlp-3')), false, 'rien n’est gardé');

  const stop = new AbortController();
  const pending = tool.grab({ url: 'https://www.youtube.com/watch?v=longue', want: 'audio', out: path.join(root, 'recu', 'yt-dlp-4'), signal: stop.signal, progress: () => stop.abort() });
  const cancelled = await pending;
  assert.deepEqual(cancelled, { ok: false, reason: 'arrêté', cancelled: true });
  assert.equal(fs.existsSync(path.join(root, 'recu', 'yt-dlp-4')), false);
});
