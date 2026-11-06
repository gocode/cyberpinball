// Avatar des joueurs (avatar.ts, et ses messages dans social.ts) : le contrôle d'une image reçue
// d'une autre borne (type lu dans ses octets, taille et dimensions bornées, empreinte), le
// cadrage aux boutons (jamais hors de l'image, zoom borné), les initiales et la teinte, le
// rangement du dossier, et la règle de partage : l'avatar ne circule qu'entre amis et demandes
// en cours (l'annuaire n'en porte pas).

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import {
  AVATAR_MAX_BYTES,
  avatarHue,
  avatarInitials,
  avatarView,
  clampCrop,
  cropBox,
  cropLimits,
  cropRect,
  decodeAvatarData,
  imageDimensions,
  initialCrop,
  moveCrop,
  pruneAvatarFiles,
  readAvatarFile,
  readAvatarImage,
  sniffImage,
  writeAvatarFile,
  zoomCrop,
} from '../avatar';
import { avatarFileOf, avatarPeers, keepAvatars, newSocialState, parseSocialMessage, parseSocialState, setOwnAvatar, setPeerAvatar } from '../social';
import { createPlayerKey } from '../sharing';

/** En-tête PNG d'une image `w` × `h` (IHDR), suivi de quelques octets : assez pour le contrôle, qui ne décode pas. */
function png(w: number, h: number, extra = 16): Buffer {
  const head = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(head, 0);
  head.writeUInt32BE(13, 8);
  head.write('IHDR', 12, 'latin1');
  head.writeUInt32BE(w, 16);
  head.writeUInt32BE(h, 20);
  return Buffer.concat([head, Buffer.alloc(extra, 7)]);
}

/** JPEG minimal : SOI, un segment APP0, puis la trame (SOF0) qui porte les dimensions. */
function jpeg(w: number, h: number): Buffer {
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x10, ...Buffer.from('JFIF\0'), 1, 1, 0, 0, 1, 0, 1, 0, 0]);
  const sof = Buffer.alloc(19);
  sof.writeUInt16BE(0xffc0, 0);
  sof.writeUInt16BE(17, 2);
  sof[4] = 8;
  sof.writeUInt16BE(h, 5);
  sof.writeUInt16BE(w, 7);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof, Buffer.from([0xff, 0xd9])]);
}

/** WebP étendu (VP8X) : largeur et hauteur moins un, sur 24 bits. */
function webp(w: number, h: number): Buffer {
  const b = Buffer.alloc(30);
  b.write('RIFF', 0, 'latin1');
  b.writeUInt32LE(22, 4);
  b.write('WEBP', 8, 'latin1');
  b.write('VP8X', 12, 'latin1');
  b.writeUInt32LE(10, 16);
  b.writeUIntLE(w - 1, 24, 3);
  b.writeUIntLE(h - 1, 27, 3);
  return b;
}

test('avatar : le type d’une image se lit dans ses octets, avec ses dimensions', () => {
  assert.equal(sniffImage(png(256, 256)), 'png');
  assert.equal(sniffImage(jpeg(256, 200)), 'jpg');
  assert.equal(sniffImage(webp(300, 300)), 'webp');
  assert.equal(sniffImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')), undefined);
  assert.equal(sniffImage(Buffer.from('GIF89a')), undefined);
  assert.deepEqual(imageDimensions(png(256, 128), 'png'), { width: 256, height: 128 });
  assert.deepEqual(imageDimensions(jpeg(320, 240), 'jpg'), { width: 320, height: 240 });
  assert.deepEqual(imageDimensions(webp(512, 400), 'webp'), { width: 512, height: 400 });
  // Un JPEG sans trame, ou tronqué : illisible, jamais accepté.
  assert.equal(imageDimensions(Buffer.from([0xff, 0xd8, 0xff, 0xd9]), 'jpg'), undefined);
  assert.equal(imageDimensions(jpeg(10, 10).subarray(0, 25), 'jpg'), undefined);
});

test('avatar : une image reçue est refusée trop lourde, trop grande, ou d’une autre empreinte', () => {
  const ok = readAvatarImage(png(256, 256));
  assert.ok(ok);
  assert.equal(ok.ext, 'png');
  assert.match(ok.hash, /^[0-9a-f]{64}$/);
  // L'empreinte annoncée doit être celle du contenu.
  assert.ok(readAvatarImage(png(256, 256), ok.hash));
  assert.equal(readAvatarImage(png(256, 255), ok.hash), undefined);
  // Une image immense, même légère (bombe de décompression) : refusée sans être décodée.
  assert.equal(readAvatarImage(png(20_000, 20_000)), undefined);
  // Trop lourde.
  assert.equal(readAvatarImage(png(256, 256, AVATAR_MAX_BYTES)), undefined);
  // En base64, de même ; et rien qui ne soit du base64.
  const data = png(128, 128).toString('base64');
  const hash = readAvatarImage(png(128, 128))!.hash;
  assert.ok(decodeAvatarData(data, hash));
  assert.equal(decodeAvatarData(`${data}<script>`, hash), undefined);
  assert.equal(decodeAvatarData(data, '0'.repeat(64)), undefined);
  assert.equal(decodeAvatarData(42, hash), undefined);
});

test('avatar : le cadrage reste dans l’image, le zoom est borné, le portrait part plus haut', () => {
  const w = 1600;
  const h = 1200;
  const start = initialCrop(w, h);
  assert.deepEqual(start, { cx: 800, cy: 600, side: 1200 });
  assert.deepEqual(cropLimits(start, w, h), { closest: false, widest: true });
  // Le plus grand carré ne bouge pas en hauteur ; vers la gauche, il va jusqu'au bord, pas au-delà.
  assert.equal(moveCrop(start, 0, -1, w, h).cy, 600);
  let crop = start;
  for (let i = 0; i < 20; i++) crop = moveCrop(crop, -1, 0, w, h);
  assert.equal(crop.cx, 600);
  assert.deepEqual(cropRect(crop, w, h), { x: 0, y: 0, side: 1200 });
  // Zoom avant : le carré rétrécit autour de son centre, jusqu'à un dixième du petit côté.
  crop = zoomCrop(start, 1, w, h);
  assert.equal(crop.side, 960);
  for (let i = 0; i < 30; i++) crop = zoomCrop(crop, 1, w, h);
  assert.equal(crop.side, 120);
  assert.equal(cropLimits(crop, w, h).closest, true);
  // Puis il peut aller dans un coin, toujours dans l'image.
  for (let i = 0; i < 100; i++) crop = moveCrop(crop, 1, 1, w, h);
  const r = cropRect(crop, w, h);
  assert.ok(r.x + r.side <= w && r.y + r.side <= h && r.x >= 0 && r.y >= 0);
  // Un cadrage absurde (relu d'un fichier abîmé) est ramené dans l'image.
  assert.deepEqual(clampCrop({ cx: -50, cy: 9_999, side: 5_000 }, w, h), { cx: 600, cy: 600, side: 1200 });
  // Portrait : le visage est plutôt en haut.
  const portrait = initialCrop(900, 1600);
  assert.equal(portrait.side, 900);
  assert.equal(portrait.cy, 640);
  const box = cropBox(portrait, 900, 1600);
  assert.equal(box.width, 1);
  assert.equal(box.left, 0);
  assert.ok(Math.abs(box.top - 190 / 1600) < 1e-9);
});

test('avatar : initiales et teinte, les mêmes sur toutes les bornes', () => {
  assert.equal(avatarInitials('Alexis Martin'), 'AM');
  assert.equal(avatarInitials('joueur A1B2'), 'JA');
  assert.equal(avatarInitials('élodie'), 'É');
  assert.equal(avatarInitials('4ever_pin'), '4P');
  assert.equal(avatarInitials(''), '?');
  const key = createPlayerKey().publicKey;
  assert.equal(avatarHue(key), avatarHue(key));
  assert.ok(avatarHue(key) >= 0 && avatarHue(key) < 360);
  // Sans fichier : les initiales seules ; avec : l'adresse du protocole des médias.
  assert.deepEqual(Object.keys(avatarView(key, 'Bruno')).sort(), ['hue', 'initials']);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-avatar-'));
  try {
    const name = writeAvatarFile(dir, readAvatarImage(png(64, 64))!);
    assert.match(avatarView(key, 'Bruno', path.join(dir, 'avatars', name)).src!, /^cyber-media:\/\//);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('avatar : fichiers nommés par leur empreinte, relus contrôlés, rangés sans toucher au recadrage', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-avatar-'));
  try {
    const a = writeAvatarFile(dir, readAvatarImage(png(64, 64))!);
    const b = writeAvatarFile(dir, readAvatarImage(jpeg(100, 100))!);
    assert.match(a, /^[0-9a-f]{64}\.png$/);
    assert.match(b, /^[0-9a-f]{64}\.jpg$/);
    assert.ok(readAvatarFile(dir, a));
    // Un fichier changé sous son nom ne passe plus.
    fs.writeFileSync(path.join(dir, 'avatars', b), png(10, 10));
    assert.equal(readAvatarFile(dir, b), undefined);
    assert.equal(readAvatarFile(dir, '../social.json'), undefined);
    fs.mkdirSync(path.join(dir, 'avatars', 'recadrage'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'avatars', 'recadrage', 'image.jpg'), 'x');
    fs.writeFileSync(path.join(dir, 'avatars', 'lisez-moi.txt'), 'x');
    assert.deepEqual(pruneAvatarFiles(dir, [a]), [b]);
    assert.deepEqual(fs.readdirSync(path.join(dir, 'avatars')).sort(), [a, 'lisez-moi.txt', 'recadrage'].sort());
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('avatar : messages entre bornes, contrôlés à la réception', () => {
  const image = readAvatarImage(png(256, 256))!;
  const profile = (() => {
    const s = newSocialState();
    return { s, hello: parseSocialMessage({ t: 'hello', profile: { key: s.key.publicKey, name: s.name, at: s.nameAt, sig: '' }, dir: [] }) };
  })();
  // (profil non signé : refusé ; on vérifie l'avatar sur un vrai bonjour plus bas)
  assert.equal(profile.hello, undefined);
  assert.deepEqual(parseSocialMessage({ t: 'avatar', avatar: image.hash }), { t: 'avatar', avatar: image.hash });
  assert.deepEqual(parseSocialMessage({ t: 'avatar' }), { t: 'avatar' });
  assert.equal(parseSocialMessage({ t: 'avatar', avatar: 'pas une empreinte' }), undefined);
  assert.deepEqual(parseSocialMessage({ t: 'avatar-get', avatar: image.hash }), { t: 'avatar-get', avatar: image.hash });
  const data = image.bytes.toString('base64');
  assert.deepEqual(parseSocialMessage({ t: 'avatar-data', avatar: image.hash, data }), { t: 'avatar-data', avatar: image.hash, data });
  // L'image d'une autre empreinte, ou qui n'en est pas une : le message entier est ignoré.
  assert.equal(parseSocialMessage({ t: 'avatar-data', avatar: image.hash, data: png(255, 256).toString('base64') }), undefined);
  assert.equal(parseSocialMessage({ t: 'avatar-data', avatar: image.hash, data: Buffer.from('bonjour').toString('base64') }), undefined);
});

test('avatar : ne circule qu’entre amis et demandes en cours ; l’état le garde, et l’oublie avec eux', () => {
  const friend = createPlayerKey().publicKey;
  const stranger = createPlayerKey().publicKey;
  const now = new Date().toISOString();
  const file = `${'a'.repeat(64)}.jpg`;
  let s = newSocialState();
  s = { ...s, friends: [{ key: friend, name: 'Bruno', since: now, events: [] }] };
  assert.deepEqual([...avatarPeers(s)], [friend]);
  s = setOwnAvatar(s, file);
  s = setPeerAvatar(s, friend, `${'b'.repeat(64)}.png`);
  s = setPeerAvatar(s, stranger, `${'c'.repeat(64)}.png`);
  assert.equal(avatarFileOf(s, s.key.publicKey), file);
  assert.equal(avatarFileOf(s, friend), `${'b'.repeat(64)}.png`);
  // Le joueur de l'annuaire n'en garde pas ; les fichiers restants sont le mien et celui de l'ami.
  const kept = keepAvatars(s);
  assert.equal(avatarFileOf(kept.state, stranger), undefined);
  assert.deepEqual(kept.files.sort(), [file, `${'b'.repeat(64)}.png`].sort());
  // Relu d'un fichier : gardé ; un nom de fichier qui n'en est pas un (chemin) : retiré.
  const back = parseSocialState(JSON.parse(JSON.stringify({ ...kept.state, peerAvatars: { ...kept.state.peerAvatars, [stranger]: '..\\social.json' } })))!;
  assert.equal(back.avatar, file);
  assert.deepEqual(back.peerAvatars, { [friend]: `${'b'.repeat(64)}.png` });
  // Retiré : plus d'avatar, plus de clé vide dans l'état.
  const none = setPeerAvatar(setOwnAvatar(back, undefined), friend, undefined);
  assert.equal(none.avatar, undefined);
  assert.equal(none.peerAvatars, undefined);
});
