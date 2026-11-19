// Réponse du protocole cyber-media:// (media-protocol.ts) sans garder de fichier ouvert.
//
// Une vidéo de la roue ou du fronton se lit par plages, et Chromium la consomme au fil de la lecture :
// servie par un fs.createReadStream, le fichier restait ouvert par le processus principal tant que la
// vidéo tournait. Or Windows refuse de renommer un dossier dont un fichier est ouvert, même en lecture
// partagée : mettre à la corbeille la table affichée échouait en EPERM, à chaque essai (borne d'un
// joueur, 18 et 19/11/2026 : Pokemon Pinball, Medieval Madness, SpongeBob ; le dossier était tenu par
// Cyber Pinball lui-même). Ici, chaque morceau ouvre le fichier, le lit et le referme avant d'être
// rendu : entre deux morceaux, rien n'est tenu, et la table se déplace ou se renomme comme les autres.
// Test : medias-sans-verrou.test.ts.

import * as fs from 'node:fs';

/** Taille d'un morceau lu d'une traite : le fichier n'est ouvert que le temps de cette lecture. */
export const MEDIA_CHUNK_BYTES = 1024 * 1024;

/**
 * Les octets [start, end] de `file`, morceau par morceau, à la demande du lecteur. Un fichier déplacé ou
 * effacé entre deux morceaux arrête la réponse sur une erreur (la vidéo d'une table qu'on retire).
 */
export function fileChunks(file: string, start: number, end: number, chunk = MEDIA_CHUNK_BYTES): ReadableStream<Uint8Array> {
  let position = start;
  return new ReadableStream<Uint8Array>(
    {
      async pull(controller) {
        if (position > end) {
          controller.close();
          return;
        }
        const length = Math.min(chunk, end - position + 1);
        const bytes = Buffer.alloc(length);
        let read = 0;
        const handle = await fs.promises.open(file, 'r');
        try {
          while (read < length) {
            const got = await handle.read(bytes, read, length - read, position + read);
            if (got.bytesRead === 0) break;
            read += got.bytesRead;
          }
        } finally {
          await handle.close();
        }
        if (read === 0) {
          // Fichier raccourci depuis sa taille relevée : la réponse s'arrête là.
          controller.close();
          return;
        }
        position += read;
        controller.enqueue(new Uint8Array(bytes.buffer, bytes.byteOffset, read));
      },
    },
    // Rien d'avance : un morceau est lu quand le lecteur le demande.
    { highWaterMark: 0 },
  );
}

/** Réponse entière, ou la plage demandée (206) : Chromium lit les vidéos par morceaux. */
export function mediaResponse(file: string, size: number, range: string | null, type: string, chunk = MEDIA_CHUNK_BYTES): Response {
  // Lisible par les pages du menu en « crossOrigin » (niveaux du son du Juke-box) : les fichiers servis sont déjà ceux autorisés.
  const headers: Record<string, string> = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache', 'Access-Control-Allow-Origin': '*' };
  const m = range ? /^bytes=(\d*)-(\d*)$/.exec(range.trim()) : null;
  if (m && (m[1] || m[2])) {
    let start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
    let end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
    if (start >= size || start > end) {
      return new Response(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${size}` } });
    }
    start = Math.max(0, start);
    end = Math.max(start, end);
    return new Response(fileChunks(file, start, end, chunk), {
      status: 206,
      headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1) },
    });
  }
  return new Response(size ? fileChunks(file, 0, size - 1, chunk) : null, { status: 200, headers: { ...headers, 'Content-Length': String(size) } });
}
