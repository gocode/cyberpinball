// Le téléphone brut des démonstrations de la télécommande (démonstration interne telephone-brut.cjs)
// se comporte comme un navigateur face à la borne (websocket.ts).
//
// Incident du 26/11/2026 : saisie-robuste et telecommande tombaient sur une machine chargée. La
// borne envoie un ping toutes les 10 s et ferme sans un mot une liaison qui n'a rien dit entre deux
// ping ; le téléphone brut ignorait les ping. Une étape lente de la démonstration (plus de 10 à 20 s
// sans geste) suffisait : les gestes suivants partaient dans une liaison fermée. La démonstration du
// menu avait sa propre copie, avec le même défaut.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import * as path from 'node:path';
import { test } from 'node:test';
import { acceptWebSocket, type WebSocketLink } from '../websocket';
import { DEMOS, internalFiles, withoutInternal } from './interne';

const BRUT = path.join(DEMOS, 'telephone-brut.cjs');

test('le téléphone brut répond aux ping de la borne : la liaison tient sans geste', { skip: withoutInternal() }, async () => {
  const links: WebSocketLink[] = [];
  const server = http.createServer();
  server.on('upgrade', (req, socket, head) => {
    const link = acceptWebSocket(req, socket, { maxPayload: 1 << 20, pingMs: 30, head });
    if (link) links.push(link);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const { rawPhone } = require(BRUT) as { rawPhone(address: AddressInfo, key: string): { pongs: number; closed: boolean; inbox: unknown[]; close(): void } };
    const phone = rawPhone(server.address() as AddressInfo, Buffer.alloc(32).toString('base64'));
    // Plus de deux intervalles de ping sans un geste : sans réponse, la borne aurait fermé.
    while (phone.pongs < 4 && !phone.closed && !links[0]?.closed) await new Promise((r) => setTimeout(r, 10));
    assert.equal(links.length, 1);
    assert.equal(links[0]!.closed, false, 'la borne a fermé la liaison d’un téléphone muet qui répond aux ping');
    assert.equal(phone.closed, false);
    // Une trame de plus de 64 Ko (longueur sur 8 octets), puis une courte : les deux sont lues.
    links[0]!.send(JSON.stringify({ t: 'long', x: 'a'.repeat(70_000) }));
    links[0]!.send(JSON.stringify({ t: 'court' }));
    while (phone.inbox.length < 2 && !phone.closed) await new Promise((r) => setTimeout(r, 10));
    assert.deepEqual(
      phone.inbox.map((m) => (m as { t: string }).t),
      ['long', 'court'],
    );
    phone.close();
  } finally {
    for (const l of links) l.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('aucune démonstration ne garde sa propre copie du téléphone brut', { skip: withoutInternal() }, () => {
  // Une liaison WebSocket écrite à la main (trames lues octet par octet, /liaison) hors du module commun.
  const copies = internalFiles(DEMOS, /\.(cjs|js|mjs)$/).filter((f) => {
    if (f === 'telephone-brut.cjs') return false;
    const text = fs.readFileSync(path.join(DEMOS, f), 'utf8');
    return /function rawPhone\b/.test(text) || (/['`]\/liaison/.test(text) && /\[0\] & 15/.test(text));
  });
  assert.deepEqual(copies, [], 'prendre rawPhone de telephone-brut.cjs');
});
