// Télécommande du téléphone (remote.ts, websocket.ts, app/renderer/telephone/telephone-core.js,
// app/src/phone-remote.ts) : le chiffrement du téléphone, écrit en JavaScript pour une page servie
// en HTTP, est comparé à celui de node:crypto ; l'appairage (QR à usage unique et périmé, code,
// acceptation, refus, un seul téléphone, reprise) ; les adresses du réseau local ; ce que le
// téléphone peut demander ; le pointeur ; le WebSocket minimal ; le QR code, décodé. Deuxième
// jalon (tout le menu) : boutons, texte du clavier à l'écran, envoi d'un fichier (noms nettoyés,
// morceaux scellés, de gros morceaux aussi vite que juste). Aucun test n'ouvre de socket hors de
// 127.0.0.1. L'injection dans une vraie page et dans le menu : telecommande.test.ts.

import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as path from 'node:path';
import { test } from 'node:test';
import {
  cleanUploadName,
  createRemotePairing,
  deviceLabel,
  freeUploadName,
  openRemoteBytes,
  REMOTE_CHUNK,
  REMOTE_UPLOAD_MAX,
  sealRemoteBytes,
  uploadAad,
  fromBase64Url,
  isLocalNetworkAddress,
  movePointer,
  openRemote,
  parsePhoneMessage,
  pickLanAddress,
  readRemoteField,
  REMOTE_ACCEPT_MS,
  REMOTE_PAIRING_MS,
  remoteUrl,
  sealRemote,
  toBase64Url,
  wheelFor,
} from '../remote';
import { aeadOpen, aeadSeal } from '../chacha';
import { acceptWebSocket, createFrameReader, encodeFrame, websocketAccept } from '../websocket';
import { REPO_ROOT } from './i18n-scan';

interface PhoneCore {
  chachaBlock(key: Uint8Array, counter: number, nonce: Uint8Array): Uint8Array;
  poly1305(key: Uint8Array, msg: Uint8Array): Uint8Array;
  aeadSeal(key: Uint8Array, nonce: Uint8Array, aad: Uint8Array, plain: Uint8Array): Uint8Array;
  aeadOpen(key: Uint8Array, nonce: Uint8Array, aad: Uint8Array, sealed: Uint8Array): Uint8Array | null;
  toB64(bytes: Uint8Array): string;
  fromB64(text: string): Uint8Array | null;
  seal(key: Uint8Array, aad: Uint8Array, message: unknown, random?: (n: number) => Uint8Array): string;
  sealBytes(key: Uint8Array, aad: Uint8Array, plain: Uint8Array, random?: (n: number) => Uint8Array): Uint8Array;
  open(key: Uint8Array, aad: Uint8Array, frame: string): unknown;
  textDiff(before: string, after: string): { del: number; ins: string };
  deviceName(ua: string): string;
}
// eslint-disable-next-line @typescript-eslint/no-require-imports
const phone = require(path.join(REPO_ROOT, 'app', 'renderer', 'telephone', 'telephone-core.js')) as PhoneCore;
const hex = (s: string) => Buffer.from(s.replace(/\s+/g, ''), 'hex');

test('chiffrement du téléphone : les vecteurs de la RFC 8439 (ChaCha20, Poly1305, AEAD)', () => {
  // § 2.3.2 : un bloc de ChaCha20.
  const block = phone.chachaBlock(hex('000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f'), 1, hex('000000090000004a00000000'));
  assert.equal(Buffer.from(block).toString('hex').slice(0, 32), '10f1e7e4d13b5915500fdd1fa32071c4');
  // § 2.5.2 : Poly1305.
  const tag = phone.poly1305(hex('85d6be7857556d337f4452fe42d506a80103808afb0db2fd4abff6af4149f51b'), Buffer.from('Cryptographic Forum Research Group'));
  assert.equal(Buffer.from(tag).toString('hex'), 'a8061dc1305136c6c22b8baf0c0127a9');
  // § 2.8.2 : chiffrement authentifié.
  const plain = Buffer.from("Ladies and Gentlemen of the class of '99: If I could offer you only one tip for the future, sunscreen would be it.");
  const key = hex('808182838485868788898a8b8c8d8e8f909192939495969798999a9b9c9d9e9f');
  const sealed = Buffer.from(phone.aeadSeal(key, hex('070000004041424344454647'), hex('50515253c0c1c2c3c4c5c6c7'), plain));
  assert.equal(sealed.subarray(sealed.length - 16).toString('hex'), '1ae10b594f09e26a7e902ecbd0600691');
  assert.equal(sealed.subarray(0, 16).toString('hex'), 'd31a8d34648e60db7b86afbc53ef7ec2');
});

test('chiffrement du téléphone : identique à node:crypto, dans les deux sens, sur 400 messages au hasard', () => {
  for (let i = 0; i < 400; i++) {
    const key = crypto.randomBytes(32);
    const nonce = crypto.randomBytes(12);
    const aad = crypto.randomBytes(i % 37);
    const plain = crypto.randomBytes(i);
    const c = crypto.createCipheriv('chacha20-poly1305', key, nonce, { authTagLength: 16 });
    c.setAAD(aad, { plaintextLength: plain.length });
    const reference = Buffer.concat([c.update(plain), c.final(), c.getAuthTag()]);
    assert.ok(Buffer.from(phone.aeadSeal(key, nonce, aad, plain)).equals(reference), `message ${i}`);
    assert.ok(Buffer.from(phone.aeadOpen(key, nonce, aad, reference) ?? []).equals(plain));
    // Un octet changé, d'autres données associées : refusé.
    const bad = Buffer.from(reference);
    bad[i % bad.length]! ^= 1;
    assert.equal(phone.aeadOpen(key, nonce, aad, bad), null);
    assert.equal(phone.aeadOpen(key, nonce, Buffer.concat([aad, Buffer.from([1])]), reference), null);
    assert.equal(phone.toB64(plain), plain.toString('base64url'));
    assert.ok(Buffer.from(phone.fromB64(plain.toString('base64url')) ?? []).equals(plain));
  }
});

test('chiffrement de la borne (chacha.ts) : identique à node:crypto et à celui du téléphone', () => {
  for (let i = 0; i < 300; i++) {
    const key = crypto.randomBytes(32);
    const nonce = crypto.randomBytes(12);
    const aad = crypto.randomBytes(i % 23);
    const plain = crypto.randomBytes(i * 3);
    const c = crypto.createCipheriv('chacha20-poly1305', key, nonce, { authTagLength: 16 });
    c.setAAD(aad, { plaintextLength: plain.length });
    const reference = Buffer.concat([c.update(plain), c.final(), c.getAuthTag()]);
    assert.ok(Buffer.from(aeadSeal(key, nonce, aad, plain)).equals(reference), `message ${i}`);
    assert.ok(Buffer.from(aeadOpen(key, nonce, aad, reference) ?? []).equals(plain));
    assert.ok(Buffer.from(phone.aeadSeal(key, nonce, aad, plain)).equals(reference));
    const bad = Buffer.from(reference);
    bad[i % bad.length]! ^= 0x80;
    assert.equal(aeadOpen(key, nonce, aad, bad), undefined);
  }
});

test('trames : scellées par le téléphone, ouvertes par la borne, et l’inverse ; une autre clé ou une autre connexion n’ouvre rien', () => {
  const key = crypto.randomBytes(32);
  const aad = crypto.randomBytes(16);
  const message = { t: 'text', s: 3, del: 1, ins: 'Bille d’Été ✓ 🎉' };
  assert.deepEqual(openRemote(key, aad, phone.seal(key, aad, message)), message);
  assert.deepEqual(phone.open(key, aad, sealRemote(key, aad, message)), message);
  assert.equal(openRemote(crypto.randomBytes(32), aad, phone.seal(key, aad, message)), undefined, 'autre clé');
  assert.equal(openRemote(key, crypto.randomBytes(16), phone.seal(key, aad, message)), undefined, 'autre connexion (défi)');
  assert.equal(openRemote(key, aad, 'pas une trame'), undefined);
  assert.equal(openRemote(key, aad, 'A'.repeat(9000)), undefined, 'trop longue');
  assert.equal(phone.open(key, aad, '{"t":"challenge"}'), null);
  // Deux scellés du même message diffèrent (nonce au hasard).
  assert.notEqual(sealRemote(key, aad, message), sealRemote(key, aad, message));
});

test('base64url strict', () => {
  assert.equal(fromBase64Url('abc+'), undefined);
  assert.equal(fromBase64Url('a'), undefined);
  assert.equal(fromBase64Url(42), undefined);
  assert.equal(fromBase64Url(toBase64Url(Buffer.alloc(32, 7)), 32)?.length, 32);
  assert.equal(fromBase64Url(toBase64Url(Buffer.alloc(31, 7)), 32), undefined);
});

/** Un téléphone : il scelle son premier message avec une clé ; la borne essaie les siennes. */
function hello(pairing: ReturnType<typeof createRemotePairing>, key: Buffer, device = 'Android · Chrome') {
  const aad = crypto.randomBytes(16);
  const frame = phone.seal(key, aad, { t: 'hello', s: 1, c: toBase64Url(crypto.randomBytes(16)), device });
  return pairing.hello((k) => openRemote(k, aad, frame));
}

test('appairage : QR à usage unique, code, acceptation, reprise, déconnexion', () => {
  const pairing = createRemotePairing();
  const offer = pairing.view();
  assert.equal(offer.phase, 'offer');
  if (offer.phase !== 'offer') return;
  assert.equal(pairing.view().phase === 'offer' && pairing.view().phase, 'offer');
  // Le même QR tant qu'il est valable.
  const again = pairing.view();
  assert.ok(again.phase === 'offer' && again.key.equals(offer.key));
  const claimed = hello(pairing, offer.key);
  assert.equal(claimed?.kind, 'claimed');
  if (claimed?.kind !== 'claimed') return;
  assert.match(claimed.code, /^\d{4}$/);
  assert.ok(!claimed.session.equals(offer.key), 'clé de session neuve');
  const pending = pairing.view();
  assert.deepEqual(pending.phase === 'pending' && [pending.code, pending.device], [claimed.code, 'Android · Chrome']);
  // Un seul téléphone, et le QR ne sert qu'une fois.
  const twice = hello(pairing, offer.key, 'iPhone · Safari');
  assert.deepEqual(twice && [twice.kind, twice.kind === 'stale' && twice.why], ['stale', 'used']);
  assert.equal(hello(pairing, crypto.randomBytes(32)), undefined, 'clé inconnue');
  // La page rechargée revient avec sa clé de session, toujours en attente.
  const reload = hello(pairing, claimed.session);
  assert.deepEqual(reload && reload.kind === 'resumed' && [reload.phase, reload.code], ['pending', claimed.code]);
  assert.equal(pairing.accept(), true);
  assert.equal(pairing.accept(), false, 'déjà accepté');
  assert.equal(pairing.view().phase, 'paired');
  const resumed = hello(pairing, claimed.session);
  assert.deepEqual(resumed && resumed.kind === 'resumed' && resumed.phase, 'paired');
  // Déconnecté : la clé de session ne vaut plus rien, un QR neuf.
  assert.equal(pairing.end(), true);
  const next = pairing.view();
  assert.ok(next.phase === 'offer' && !next.key.equals(offer.key));
  assert.equal(hello(pairing, claimed.session), undefined, 'ancienne clé de session');
  assert.deepEqual(hello(pairing, offer.key)?.kind, 'stale', 'ancien QR : dit déjà servi');
});

test('appairage : un QR périmé se renouvelle ; un téléphone pas accepté à temps est refusé', () => {
  let now = 1_000_000;
  const pairing = createRemotePairing({ now: () => now });
  const first = pairing.view();
  assert.equal(first.phase, 'offer');
  if (first.phase !== 'offer') return;
  assert.equal(first.until, now + REMOTE_PAIRING_MS);
  now += REMOTE_PAIRING_MS + 1;
  const second = pairing.view();
  assert.ok(second.phase === 'offer' && !second.key.equals(first.key), 'QR renouvelé');
  const stale = hello(pairing, first.key);
  assert.deepEqual(stale && stale.kind === 'stale' && stale.why, 'expired');
  if (second.phase !== 'offer') return;
  assert.equal(hello(pairing, second.key)?.kind, 'claimed');
  now += REMOTE_ACCEPT_MS + 1;
  assert.equal(pairing.view().phase, 'offer', 'délai d’acceptation passé : refusé, un QR neuf');
  assert.equal(pairing.accept(), false);
});

test('appairage : refusé à la borne, la clé de session ne sert plus', () => {
  const pairing = createRemotePairing();
  const offer = pairing.view();
  if (offer.phase !== 'offer') return assert.fail();
  const claimed = hello(pairing, offer.key);
  if (claimed?.kind !== 'claimed') return assert.fail();
  assert.equal(pairing.end(), true);
  assert.equal(pairing.view().phase, 'offer');
  assert.equal(hello(pairing, claimed.session), undefined);
});

test('nom du téléphone : texte court, sans balise ni caractère de contrôle', () => {
  assert.equal(deviceLabel('Android · Chrome'), 'Android · Chrome');
  assert.equal(deviceLabel('<img src=x onerror=alert(1)>\u0007'.repeat(3)).includes('<'), false);
  assert.ok(deviceLabel('x'.repeat(200)).length <= 40);
  assert.equal(deviceLabel(undefined), 'Téléphone');
  assert.equal(phone.deviceName('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36'), 'Android · Chrome');
  assert.equal(phone.deviceName('Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1'), 'iPhone · Safari');
});

test('réseau local : adresses privées seulement, et la bonne carte pour le QR', () => {
  for (const ip of ['192.168.1.20', '10.0.0.5', '172.16.0.1', '172.31.255.255', '169.254.3.4', '127.0.0.1', '::1', 'fe80::1%12', 'fd12:3456::1', '::ffff:192.168.0.12']) assert.ok(isLocalNetworkAddress(ip), ip);
  for (const ip of ['8.8.8.8', '172.32.0.1', '172.15.0.1', '192.169.1.1', '2a01:cb00::1', '::ffff:8.8.8.8', '', undefined, '256.1.1.1']) assert.ok(!isLocalNetworkAddress(ip), String(ip));
  const v4 = (address: string) => ({ address, family: 'IPv4', internal: false });
  assert.equal(
    pickLanAddress({
      'vEthernet (WSL)': [v4('172.22.80.1')],
      Ethernet: [v4('10.0.0.12')],
      'Wi-Fi': [v4('192.168.1.42'), { address: 'fe80::1', family: 'IPv6', internal: false }],
      'Loopback Pseudo-Interface 1': [{ address: '127.0.0.1', family: 'IPv4', internal: true }],
    }),
    '192.168.1.42',
  );
  assert.equal(pickLanAddress({ 'vEthernet (WSL)': [v4('172.22.80.1')], Ethernet: [v4('10.0.0.12')] }), '10.0.0.12', 'carte virtuelle en dernier');
  assert.equal(pickLanAddress({ Ethernet: [v4('169.254.10.10')], 'Wi-Fi': [v4('8.8.4.4')] }), undefined, 'pas de box : rien');
  assert.equal(remoteUrl('192.168.1.42', 51873, Buffer.alloc(32, 1)), `http://192.168.1.42:51873/#k=${Buffer.alloc(32, 1).toString('base64url')}`);
});

test('messages du téléphone : seulement les gestes prévus, bornés ; jamais Échap', () => {
  assert.deepEqual(parsePhoneMessage({ t: 'move', s: 2, dx: 3.5, dy: -4, ms: 16 }), { t: 'move', s: 2, dx: 3.5, dy: -4, ms: 16 });
  assert.deepEqual(parsePhoneMessage({ t: 'click', s: 2, button: 'left' }), { t: 'click', s: 2, button: 'left', count: 1 });
  assert.deepEqual(parsePhoneMessage({ t: 'text', s: 2, del: 2, ins: 'é\u0000\n' }), { t: 'text', s: 2, del: 2, ins: 'é\n' });
  assert.deepEqual(parsePhoneMessage({ t: 'key', s: 2, key: 'Tab', shift: true }), { t: 'key', s: 2, key: 'Tab', shift: true });
  for (const bad of [
    { t: 'key', s: 2, key: 'Escape' },
    { t: 'key', s: 2, key: 'F12' },
    { t: 'click', s: 2, button: 'middle' },
    { t: 'move', s: 2, dx: Infinity, dy: 0 },
    { t: 'move', s: 2, dx: 1e6, dy: 0 },
    { t: 'text', s: 2, del: -1, ins: '' },
    { t: 'text', s: 2, del: 0, ins: 'x'.repeat(513) },
    { t: 'text', s: 2, del: 0, ins: '' },
    { t: 'nav', s: 2, action: 'devtools' },
    { t: 'act', s: 2, id: '../../x' },
    { t: 'eval', s: 2, code: 'x' },
    { t: 'move', s: 0, dx: 1, dy: 1 },
    { t: 'move', s: 1.5, dx: 1, dy: 1 },
    [],
    'move',
  ])
    assert.equal(parsePhoneMessage(bad), undefined, JSON.stringify(bad));
});

test('pointeur : jamais hors de la page ; un glissé rapide va plus loin qu’un glissé lent', () => {
  const area = { width: 1920, height: 948 };
  const at = { x: 960, y: 474 };
  const slow = movePointer(at, { dx: 100, dy: 0, ms: 800 }, area);
  const fast = movePointer(at, { dx: 100, dy: 0, ms: 60 }, area);
  assert.ok(slow.x > at.x && fast.x - at.x > 2 * (slow.x - at.x), `${slow.x} ${fast.x}`);
  // Un glissé lent d'un bord à l'autre du pavé (environ 350 px) : un tiers de l'écran environ.
  const across = movePointer(at, { dx: 350, dy: 0, ms: 2000 }, area).x - at.x;
  assert.ok(across > 500 && across < 700, String(across));
  assert.deepEqual(movePointer(at, { dx: -10_000, dy: 10_000, ms: 10 }, area), { x: 0, y: 947 });
  assert.deepEqual(wheelFor({ dx: 0, dy: -100 }), { deltaX: 0, deltaY: -220 });
});

test('saisie : ce qui change dans le champ du téléphone, en effacements puis ajouts', () => {
  assert.deepEqual(phone.textDiff('', 'Bille d’Été'), { del: 0, ins: 'Bille d’Été' });
  assert.deepEqual(phone.textDiff('Bille d’Été', 'Bille d’É'), { del: 2, ins: '' });
  // Le clavier corrige le dernier mot : il est effacé puis retapé.
  assert.deepEqual(phone.textDiff('bonjour tout le mnde', 'bonjour tout le monde'), { del: 3, ins: 'onde' });
  assert.deepEqual(phone.textDiff('ok 🎉', 'ok '), { del: 1, ins: '' }, 'un émoji, une touche');
  assert.deepEqual(phone.textDiff('abc', 'abc'), { del: 0, ins: '' });
});

test('champ de la page : nature et libellé seulement, jamais la valeur', () => {
  assert.deepEqual(readRemoteField({ kind: 'password', label: 'Mot de passe', value: 'secret', focused: true }), { kind: 'password', label: 'Mot de passe', focused: true });
  assert.equal(readRemoteField({ kind: 'button' }), undefined);
  assert.equal(readRemoteField(null), undefined);
  const probe = fs.readFileSync(path.join(REPO_ROOT, 'packages', 'core', 'src', 'remote.ts'), 'utf8').split('export const REMOTE_FOCUS_PROBE')[1]!.split('})()`;')[0]!;
  assert.doesNotMatch(probe, /\.value\b/, 'la sonde ne lit pas la valeur du champ');
});

test('WebSocket : poignée de main, trames du client masquées et entières, le reste refusé', () => {
  // RFC 6455 § 1.3.
  assert.equal(websocketAccept('dGhlIHNhbXBsZSBub25jZQ=='), 's3pPLMBiTxaQ9kYGzzhZRbK+xOo=');
  const mask = Buffer.from([1, 2, 3, 4]);
  const reader = createFrameReader(4096);
  const frame = encodeFrame(1, Buffer.from('bonjour é'), mask);
  // En deux morceaux, puis deux trames d'un coup.
  assert.deepEqual(reader.push(frame.subarray(0, 5)), []);
  const got = reader.push(Buffer.concat([frame.subarray(5), encodeFrame(9, Buffer.alloc(0), mask)]));
  assert.ok(Array.isArray(got));
  assert.deepEqual((got as { opcode: number; payload: Buffer }[]).map((f) => [f.opcode, f.payload.toString()]), [
    [1, 'bonjour é'],
    [9, ''],
  ]);
  assert.equal(createFrameReader(4096).push(encodeFrame(1, Buffer.from('x'))), 'error', 'non masquée');
  assert.equal(createFrameReader(16).push(encodeFrame(1, Buffer.alloc(200), mask)), 'error', 'trop longue');
  const fragment = encodeFrame(1, Buffer.from('x'), mask);
  fragment[0] = 0x01;
  assert.equal(createFrameReader(4096).push(fragment), 'error', 'fragmentée');
  assert.equal(encodeFrame(1, Buffer.alloc(300))[1], 126);
});

test('WebSocket : un vrai échange sur 127.0.0.1', async () => {
  const server = http.createServer();
  const texts: string[] = [];
  server.on('upgrade', (req, socket) => {
    const ws = acceptWebSocket(req, socket, { maxPayload: 4096 });
    ws?.onText((text) => {
      texts.push(text);
      ws.send(`écho : ${text}`);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  try {
    const reply = await new Promise<string>((resolve, reject) => {
      const req = http.request({ host: '127.0.0.1', port, headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': crypto.randomBytes(16).toString('base64') } });
      req.on('upgrade', (res, socket) => {
        assert.equal(res.headers['sec-websocket-accept'], websocketAccept(String(req.getHeader('Sec-WebSocket-Key'))));
        socket.write(encodeFrame(1, Buffer.from('Bille d’Été'), crypto.randomBytes(4)));
        socket.once('data', (chunk: Buffer) => {
          socket.destroy();
          resolve(chunk.subarray(2).toString('utf8'));
        });
      });
      req.on('error', reject);
      req.end();
    });
    assert.equal(reply, 'écho : Bille d’Été');
    assert.deepEqual(texts, ['Bille d’Été']);
    // Une demande qui n'est pas une poignée de main valable : 400.
    const bad = await new Promise<number>((resolve) => {
      const req = http.request({ host: '127.0.0.1', port, headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Version': '8', 'Sec-WebSocket-Key': 'court' } });
      req.on('upgrade', () => resolve(101));
      req.on('response', (res) => resolve(res.statusCode ?? 0));
      req.on('error', () => resolve(0));
      req.end();
    });
    assert.notEqual(bad, 101);
  } finally {
    server.close();
  }
});

test('QR code : la matrice se décode et rend l’adresse', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { qrRows } = require(path.join(REPO_ROOT, 'app', 'dist', 'remote-qr.js')) as { qrRows(text: string): string[] };
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const jsQR = require(require.resolve('jsqr', { paths: [REPO_ROOT] })) as (data: Uint8ClampedArray, w: number, h: number) => { data: string } | null;
  for (const host of ['127.0.0.1', '192.168.100.200', '10.0.0.5']) {
    const url = remoteUrl(host, 65_535, crypto.randomBytes(32));
    const rows = qrRows(url);
    const scale = 4;
    const n = rows.length + 8;
    const rgba = new Uint8ClampedArray(n * scale * n * scale * 4).fill(255);
    rows.forEach((row, y) =>
      [...row].forEach((bit, x) => {
        if (bit !== '1') return;
        for (let dy = 0; dy < scale; dy++)
          for (let dx = 0; dx < scale; dx++) {
            const i = (((y + 4) * scale + dy) * n * scale + (x + 4) * scale + dx) * 4;
            rgba[i] = rgba[i + 1] = rgba[i + 2] = 0;
          }
      }),
    );
    assert.equal(jsQR(rgba, n * scale, n * scale)?.data, url, host);
    assert.ok(rows.length <= 41, `QR assez petit pour le bandeau (${rows.length} modules)`);
  }
});

test('page du téléphone : rien de chargé d’ailleurs, ni script dans la page', () => {
  const html = fs.readFileSync(path.join(REPO_ROOT, 'app', 'renderer', 'telephone', 'telephone.html'), 'utf8');
  for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) assert.doesNotMatch(m[1]!, /^(https?:)?\/\//, m[1]);
  assert.doesNotMatch(html, /<script>|\son\w+="/, 'aucun script en ligne (la politique de sécurité les refuse)');
  const served = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'phone-remote.ts'), 'utf8');
  for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) assert.ok(m[1] === 'catalogue.js' || served.includes(`'/${m[1]}'`), `${m[1]} servi par phone-remote.ts`);
});

test('télécommande du menu : boutons de la borne, texte du clavier à l’écran, envoi ; rien d’autre', () => {
  assert.deepEqual(parsePhoneMessage({ t: 'btn', s: 3, b: 'next', down: true }), { t: 'btn', s: 3, b: 'next', down: true });
  assert.deepEqual(parsePhoneMessage({ t: 'btn', s: 3, b: 'zone', down: false }), { t: 'btn', s: 3, b: 'zone', down: false });
  // Une ligne : saut de ligne et caractères de contrôle deviennent des espaces.
  assert.deepEqual(parsePhoneMessage({ t: 'set', s: 3, value: 'Bille\nd’Été\u0007' }), { t: 'set', s: 3, value: 'Bille d’Été ' });
  assert.deepEqual(parsePhoneMessage({ t: 'set', s: 3, value: '' }), { t: 'set', s: 3, value: '' });
  assert.deepEqual(parsePhoneMessage({ t: 'up', s: 3, name: 'table.zip', size: 12 }), { t: 'up', s: 3, name: 'table.zip', size: 12 });
  // Trop grand : lu quand même, la borne répond pourquoi (la liaison n'est pas coupée).
  assert.deepEqual(parsePhoneMessage({ t: 'up', s: 3, name: 'x.7z', size: REMOTE_UPLOAD_MAX + 1 }), { t: 'up', s: 3, name: 'x.7z', size: REMOTE_UPLOAD_MAX + 1 });
  assert.deepEqual(parsePhoneMessage({ t: 'up-cancel', s: 3 }), { t: 'up-cancel', s: 3 });
  for (const bad of [
    { t: 'btn', s: 3, b: 'tilt', down: true },
    { t: 'btn', s: 3, b: 'help', down: true },
    { t: 'btn', s: 3, b: 'next', down: 1 },
    { t: 'btn', s: 3, b: 'next' },
    { t: 'set', s: 3, value: 'x'.repeat(513) },
    { t: 'set', s: 3, value: 42 },
    { t: 'up', s: 3, name: 'x', size: -1 },
    { t: 'up', s: 3, name: 'x', size: 1.5 },
    { t: 'up', s: 3, name: 'x'.repeat(1025), size: 1 },
    { t: 'up', s: 3, size: 1 },
    { t: 'path', s: 3, dir: 'C:\\Windows' },
  ])
    assert.equal(parsePhoneMessage(bad), undefined, JSON.stringify(bad));
});

test('envoi : le nom du fichier, nettoyé, ne sort jamais du dossier d’import', () => {
  const cases: [unknown, string | undefined][] = [
    ['Neon Abyss 1.2 (VPW).zip', 'Neon Abyss 1.2 (VPW).zip'],
    ['../../Windows/System32/evil.dll', 'evil.dll'],
    ['..\\..\\autoexec.bat', 'autoexec.bat'],
    ['D:\\Tables\\x\\table.vpx', 'table.vpx'],
    ['a<b>c:d"e|f?g*.zip', 'a b c d e f g .zip'],
    ['  .cache.zip  ', 'cache.zip'],
    ['...', undefined],
    ['', undefined],
    ['nom.  ', 'nom'],
    ['CON', '_CON'],
    ['nul.txt', '_nul.txt'],
    ['com1.zip', '_com1.zip'],
    ['Bille\u0000\u001f.vpx', 'Bille .vpx'],
    [42, undefined],
  ];
  const dir = path.resolve('import');
  for (const [input, expected] of cases) {
    const out = cleanUploadName(input);
    assert.equal(out, expected, JSON.stringify(input));
    if (!out) continue;
    assert.doesNotMatch(out, /[\\/:*?"<>|\u0000-\u001f]/, out);
    assert.ok(!out.startsWith('.') && !/[. ]$/.test(out), out);
    assert.equal(path.dirname(path.resolve(dir, out)), dir, out);
  }
  // 120 caractères au plus, l'extension gardée.
  const long = cleanUploadName(`${'é'.repeat(300)}.vpx`)!;
  assert.ok([...long].length <= 120 && long.endsWith('.vpx'), long);
  // Un nom pris : « (2) », « (3) »…
  const taken = new Set(['table.zip', 'table (2).zip']);
  assert.equal(freeUploadName('table.zip', (n) => taken.has(n)), 'table (3).zip');
  assert.equal(freeUploadName('autre.zip', (n) => taken.has(n)), 'autre.zip');
});

test('envoi : morceaux scellés par le téléphone, ouverts par la borne ; un autre rang, envoi ou connexion n’ouvre rien', () => {
  const key = crypto.randomBytes(32);
  const challenge = crypto.randomBytes(16);
  const plain = crypto.randomBytes(REMOTE_CHUNK);
  const sealed = phone.sealBytes(key, uploadAad(challenge, 'abcdefghijk', 4), plain);
  assert.equal(sealed.length, REMOTE_CHUNK + 28);
  assert.deepEqual(Buffer.from(openRemoteBytes(key, uploadAad(challenge, 'abcdefghijk', 4), sealed)!), plain);
  assert.equal(openRemoteBytes(key, uploadAad(challenge, 'abcdefghijk', 5), sealed), undefined, 'autre rang (morceau déplacé)');
  assert.equal(openRemoteBytes(key, uploadAad(challenge, 'abcdefghijX', 4), sealed), undefined, 'autre envoi');
  assert.equal(openRemoteBytes(key, uploadAad(crypto.randomBytes(16), 'abcdefghijk', 4), sealed), undefined, 'autre connexion');
  assert.equal(openRemoteBytes(crypto.randomBytes(32), uploadAad(challenge, 'abcdefghijk', 4), sealed), undefined, 'autre clé');
  const tampered = Buffer.from(sealed);
  tampered[100] = tampered[100]! ^ 1;
  assert.equal(openRemoteBytes(key, uploadAad(challenge, 'abcdefghijk', 4), tampered), undefined, 'morceau modifié');
  assert.equal(openRemoteBytes(key, uploadAad(challenge, 'abcdefghijk', 4), Buffer.alloc(REMOTE_CHUNK + 29)), undefined, 'trop long');
  // Et l'inverse : scellé par la borne, ouvert par le calcul du téléphone.
  const back = sealRemoteBytes(key, Buffer.from('x'), plain);
  assert.deepEqual(Buffer.from(phone.aeadOpen(key, back.subarray(0, 12), Buffer.from('x'), back.subarray(12))!), plain);
});

test('chiffrement : de gros morceaux, juste et assez vite (borne et téléphone, comparés à node:crypto)', () => {
  for (const n of [REMOTE_CHUNK, REMOTE_CHUNK - 1, 1_000_003]) {
    const key = crypto.randomBytes(32);
    const nonce = crypto.randomBytes(12);
    const aad = crypto.randomBytes(27);
    const plain = crypto.randomBytes(n);
    const c = crypto.createCipheriv('chacha20-poly1305', key, nonce, { authTagLength: 16 });
    c.setAAD(aad, { plaintextLength: n });
    const expected = Buffer.concat([c.update(plain), c.final(), c.getAuthTag()]);
    assert.deepEqual(Buffer.from(aeadSeal(key, nonce, aad, plain)), expected, `borne, ${n} octets`);
    assert.deepEqual(Buffer.from(phone.aeadSeal(key, nonce, aad, plain)), expected, `téléphone, ${n} octets`);
  }
  // 16 Mo scellés et ouverts en moins de 4 s (environ 0,4 s sur un PC de borne) : un envoi de 2 Go ne fige pas la borne.
  const big = crypto.randomBytes(8 * 1024 * 1024);
  const start = Date.now();
  aeadOpen(crypto.randomBytes(32), crypto.randomBytes(12), Buffer.alloc(0), Buffer.concat([big, Buffer.alloc(16)]));
  aeadSeal(crypto.randomBytes(32), crypto.randomBytes(12), Buffer.alloc(0), big);
  assert.ok(Date.now() - start < 4000, `${Date.now() - start} ms pour 16 Mo`);
});
