// Serveur des fichiers du Juke-box, dans un processus utilitaire d'Electron (jukebox-media-server.ts).
//
// Pourquoi (19/11/2026) : servis par le protocole cyber-media, les octets d'un morceau passaient par
// le processus principal, celui qui fait tout le front-end. Une vidéo mal entrelacée (son et image à
// 25 Mo l'un de l'autre dans le fichier) fait relancer à Chromium plusieurs lectures par seconde ;
// chacune attendait un tour du processus principal, et quand il était occupé, le morceau s'arrêtait
// toutes les quelques secondes, son et image, comme une vidéo du web sur une ligne lente. Ici, rien
// d'autre ne tourne : chaque lecture répond tout de suite.
//
// Sûreté : écoute sur 127.0.0.1 seulement, sur un port choisi par le système ; chaque adresse porte
// le jeton aléatoire de 128 bits reçu au lancement ; seuls les fichiers autorisés un par un par le
// processus principal (message { id, file }) sont servis, en lecture, sans rien lister.

import * as fs from 'node:fs';
import * as http from 'node:http';
import * as path from 'node:path';

interface ParentPort {
  on(event: 'message', listener: (e: { data: unknown }) => void): void;
  postMessage(message: unknown): void;
}

const TYPES: Record<string, string> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  avi: 'video/x-msvideo',
  m4a: 'audio/mp4',
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  opus: 'audio/ogg',
  flac: 'audio/flac',
  wav: 'audio/wav',
  aac: 'audio/aac',
  wma: 'audio/x-ms-wma',
};

function contentType(file: string): string {
  return TYPES[path.extname(file).slice(1).toLowerCase()] ?? 'application/octet-stream';
}

const CORS = { 'Access-Control-Allow-Origin': '*' };

function refuse(res: http.ServerResponse, status: number): void {
  res.writeHead(status, CORS);
  res.end();
}

/**
 * Le serveur, sans l'écouter : `allow(id, fichier)` rend un fichier lisible à /<jeton>/<id>.
 * `waitMs` : temps laissé à une autorisation partie en même temps que la requête.
 */
export function createMediaServer(token: string, options: { waitMs?: number } = {}) {
  const waitMs = options.waitMs ?? 1000;
  /** Fichiers autorisés : identifiant d'adresse → chemin complet. */
  const files = new Map<string, string>();
  /** Requêtes arrivées avant l'autorisation de leur fichier (les deux partent ensemble du processus principal). */
  const waiting = new Map<string, Array<() => void>>();

  function lookup(id: string, done: (file: string | undefined) => void): void {
    const file = files.get(id);
    if (file) return done(file);
    const list = waiting.get(id) ?? [];
    waiting.set(id, list);
    const timer = setTimeout(() => {
      const i = list.indexOf(go);
      if (i >= 0) list.splice(i, 1);
      done(undefined);
    }, waitMs);
    function go(): void {
      clearTimeout(timer);
      done(files.get(id));
    }
    list.push(go);
  }

  function serve(req: http.IncomingMessage, res: http.ServerResponse, file: string): void {
    fs.stat(file, (error, stat) => {
      if (error || !stat.isFile()) return refuse(res, 404);
      const size = stat.size;
      const headers: Record<string, string> = {
        ...CORS,
        'Content-Type': contentType(file),
        'Accept-Ranges': 'bytes',
        // Même adresse, même fichier (identifiant neuf à chaque démarrage) : Chromium peut garder ce qu'il a lu.
        'Last-Modified': stat.mtime.toUTCString(),
        ETag: `"${stat.size.toString(36)}-${Math.round(stat.mtimeMs).toString(36)}"`,
        'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges',
      };
      const range = req.headers.range;
      const m = range ? /^bytes=(\d*)-(\d*)$/.exec(range.trim()) : null;
      let start = 0;
      let end = size - 1;
      let status = 200;
      if (m && (m[1] || m[2])) {
        start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
        end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
        if (start >= size || start > end) {
          res.writeHead(416, { ...headers, 'Content-Range': `bytes */${size}` });
          return res.end();
        }
        status = 206;
        headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
      }
      headers['Content-Length'] = String(size ? end - start + 1 : 0);
      res.writeHead(status, headers);
      if (req.method === 'HEAD' || !size) return res.end();
      // Grands morceaux lus d'un coup : moins d'allers-retours pour une vidéo lourde.
      const stream = fs.createReadStream(file, { start, end, highWaterMark: 1024 * 1024 });
      stream.on('error', () => res.destroy());
      res.on('close', () => stream.destroy());
      stream.pipe(res);
    });
  }

  const server = http.createServer((req, res) => {
    const parts = (req.url ?? '').replace(/\?.*$/, '').split('/');
    const id = parts[2];
    // /<jeton>/<identifiant>
    if (parts.length !== 3 || parts[1] !== token || !id) return refuse(res, 403);
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { ...CORS, 'Access-Control-Allow-Headers': 'Range', 'Access-Control-Allow-Methods': 'GET, HEAD' });
      return res.end();
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return refuse(res, 405);
    lookup(id, (file) => (file ? serve(req, res, file) : refuse(res, 404)));
  });

  function allow(id: unknown, file: unknown): boolean {
    if (typeof id !== 'string' || !/^[0-9a-f]{8,64}(\.[a-z0-9]{1,8})?$/.test(id)) return false;
    if (typeof file !== 'string' || !path.isAbsolute(file) || file.includes('\0')) return false;
    files.set(id, path.resolve(file));
    const list = waiting.get(id);
    waiting.delete(id);
    for (const go of list ?? []) go();
    return true;
  }

  return { server, allow };
}

// Lancé par utilityProcess.fork (jukebox-media-server.ts) : le jeton en argument, les autorisations par messages.
const parentPort = (process as unknown as { parentPort?: ParentPort }).parentPort;
const launchToken = process.argv.find((a) => /^[0-9a-f]{32}$/.test(a));
if (parentPort && launchToken) {
  const { server, allow } = createMediaServer(launchToken);
  parentPort.on('message', (e) => {
    const msg = e.data as { id?: unknown; file?: unknown };
    allow(msg?.id, msg?.file);
  });
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    if (address && typeof address === 'object') parentPort.postMessage({ port: address.port });
  });
  server.on('error', (error) => parentPort.postMessage({ failed: String(error?.message ?? error) }));
}
