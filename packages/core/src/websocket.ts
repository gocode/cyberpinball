// Serveur WebSocket minimal (RFC 6455) pour la télécommande du téléphone (remote.ts,
// app/src/phone-remote.ts) : la page du téléphone envoie des trames texte courtes (un geste, un
// mot tapé) et en reçoit autant. Pas de dépendance : la poignée de main, et des trames texte
// entières, masquées comme l'exige un client, de REMOTE_MAX_FRAME octets au plus. Tout le reste
// (trame fragmentée, binaire, trop longue, non masquée) ferme la connexion : un téléphone qui suit
// la page n'en envoie jamais. Ping toutes les PING_MS : un téléphone qui ne répond plus (écran
// éteint, Wi-Fi perdu) est fermé, et son pointeur s'en va.

import * as crypto from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
export const WS_PING_MS = 10_000;

/** Clé d'acceptation de la poignée de main : SHA-1 de la clé du client et du GUID, en base64. */
export function websocketAccept(key: string): string {
  return crypto.createHash('sha1').update(key + GUID).digest('base64');
}

/** Trame : FIN, code, longueur, masque éventuel (un client masque, un serveur jamais). */
export function encodeFrame(opcode: number, payload: Buffer, mask?: Buffer): Buffer {
  const len = payload.length;
  const head = len < 126 ? 2 : len < 65_536 ? 4 : 10;
  const out = Buffer.alloc(head + (mask ? 4 : 0) + len);
  out[0] = 0x80 | opcode;
  out[1] = (mask ? 0x80 : 0) | (len < 126 ? len : len < 65_536 ? 126 : 127);
  if (head === 4) out.writeUInt16BE(len, 2);
  if (head === 10) out.writeBigUInt64BE(BigInt(len), 2);
  if (mask) {
    mask.copy(out, head);
    for (let i = 0; i < len; i++) out[head + 4 + i] = payload[i]! ^ mask[i % 4]!;
  } else payload.copy(out, head);
  return out;
}

export interface Frame {
  opcode: number;
  payload: Buffer;
}

/**
 * Lecteur de trames d'un client : rend les trames entières à mesure qu'elles arrivent, ou 'error'
 * pour une trame refusée (non masquée, fragmentée, réservée, trop longue).
 */
export function createFrameReader(maxPayload: number): { push(chunk: Buffer): Frame[] | 'error' } {
  let buffer: Buffer = Buffer.alloc(0);
  return {
    push(chunk) {
      buffer = buffer.length ? Buffer.concat([buffer, chunk]) : chunk;
      const frames: Frame[] = [];
      for (;;) {
        if (buffer.length < 2) return frames;
        const fin = (buffer[0]! & 0x80) !== 0;
        const reserved = buffer[0]! & 0x70;
        const opcode = buffer[0]! & 0x0f;
        const masked = (buffer[1]! & 0x80) !== 0;
        let len = buffer[1]! & 0x7f;
        let at = 2;
        if (!fin || reserved || !masked || opcode === 0) return 'error';
        if (len === 126) {
          if (buffer.length < 4) return frames;
          len = buffer.readUInt16BE(2);
          at = 4;
        } else if (len === 127) return 'error';
        if (len > maxPayload) return 'error';
        if (buffer.length < at + 4 + len) return frames;
        const mask = buffer.subarray(at, at + 4);
        const payload = Buffer.alloc(len);
        for (let i = 0; i < len; i++) payload[i] = buffer[at + 4 + i]! ^ mask[i % 4]!;
        frames.push({ opcode, payload });
        buffer = buffer.subarray(at + 4 + len);
      }
    },
  };
}

export interface WebSocketLink {
  /** Adresse du téléphone, telle que la voit la borne. */
  address: string;
  send(text: string): void;
  close(code?: number): void;
  onText(listener: (text: string) => void): void;
  onClose(listener: () => void): void;
  readonly closed: boolean;
}

/**
 * Termine la poignée de main d'une demande « Upgrade: websocket » ; undefined (connexion fermée)
 * si elle n'en est pas une valable.
 */
export function acceptWebSocket(req: IncomingMessage, socket: Duplex, opts: { maxPayload: number; pingMs?: number; head?: Buffer }): WebSocketLink | undefined {
  const key = req.headers['sec-websocket-key'];
  const valid = req.method === 'GET' && String(req.headers.upgrade).toLowerCase() === 'websocket' && req.headers['sec-websocket-version'] === '13' && typeof key === 'string' && /^[A-Za-z0-9+/]{22}==$/.test(key);
  if (!valid) {
    socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
    return undefined;
  }
  socket.write(['HTTP/1.1 101 Switching Protocols', 'Upgrade: websocket', 'Connection: Upgrade', `Sec-WebSocket-Accept: ${websocketAccept(key)}`, '', ''].join('\r\n'));
  const reader = createFrameReader(opts.maxPayload);
  const texts: ((text: string) => void)[] = [];
  const closes: (() => void)[] = [];
  let closed = false;
  let alive = true;
  const finish = () => {
    if (closed) return;
    closed = true;
    clearInterval(ping);
    socket.destroy();
    for (const l of closes) l();
  };
  const ping = setInterval(() => {
    if (!alive) return finish();
    alive = false;
    if (!socket.destroyed) socket.write(encodeFrame(0x9, Buffer.alloc(0)));
  }, opts.pingMs ?? WS_PING_MS);
  ping.unref?.();
  const onData = (chunk: Buffer) => {
    alive = true;
    const frames = reader.push(chunk);
    if (frames === 'error') {
      if (!socket.destroyed) socket.write(encodeFrame(0x8, Buffer.from([0x03, 0xf0])));
      return finish();
    }
    for (const f of frames) {
      if (closed) return;
      if (f.opcode === 0x1) for (const l of texts) l(f.payload.toString('utf8'));
      else if (f.opcode === 0x9) socket.write(encodeFrame(0xa, f.payload));
      else if (f.opcode === 0x8) {
        if (!socket.destroyed) socket.write(encodeFrame(0x8, Buffer.alloc(0)));
        return finish();
      } else if (f.opcode !== 0xa) return finish();
    }
  };
  socket.on('data', onData);
  // Ce que le client a envoyé juste après sa demande, lu avec elle par le serveur HTTP (« head »).
  if (opts.head?.length) setImmediate(() => onData(opts.head!));
  socket.on('close', finish);
  socket.on('error', finish);
  return {
    address: req.socket.remoteAddress ?? '',
    send(text) {
      if (!closed && !socket.destroyed) socket.write(encodeFrame(0x1, Buffer.from(text, 'utf8')));
    },
    close(code = 1000) {
      if (closed) return;
      const body = Buffer.alloc(2);
      body.writeUInt16BE(code, 0);
      if (!socket.destroyed) socket.write(encodeFrame(0x8, body));
      // Laissé un instant pour que la trame de fermeture parte.
      setTimeout(finish, 50).unref?.();
      socket.end();
    },
    onText: (l) => void texts.push(l),
    onClose: (l) => void closes.push(l),
    get closed() {
      return closed;
    },
  };
}
