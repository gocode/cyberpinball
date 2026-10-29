// Téléchargement depuis VPinMediaDB (T10) : index au format réel, correspondance par
// identifiant VPS puis par titre, 1k ou 4k, MD5, téléchargement interrompu qui ne
// laisse rien, rangement « (Type) <dossier>.ext » et source notée dans le .info.
// Aucun accès au réseau : l'index et les fichiers sont servis par un serveur local.

import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { after, before, test } from 'node:test';
import {
  acceptMediaDbNotice,
  cleanMediaDbStaging,
  downloadMediaDbFile,
  installMediaDb,
  loadMediaDb,
  matchMediaDb,
  MEDIADB_INDEX_FILE,
  MEDIADB_NOTICE,
  MEDIADB_SOURCE,
  mediaDbNoticeAccepted,
  mediaDbOffers,
  mediaDbQuality,
  mediaDbSizes,
  mediaDbStagedFile,
  parseMediaDbIndex,
  proposeMediaDb,
  refreshMediaDb,
  type MediaDbSource,
} from '../mediadb';
import { mediaMemory, readMediaDimensions, resolveMedia } from '../medias';
import { DEFAULT_MENU_MEDIA_SETTINGS, normalizeMenuMediaSettings } from '../mediaview';
import type { Cabinet, PhysicalScreen } from '../model';
import { readInfo, scanTables, type TableEntry } from '../tables';
import { createVpsDb } from '../vps';

// ---------------------------------------------------------------------------
// Fichiers factices

/** PNG minimal : signature et en-tête IHDR, assez pour en lire les dimensions. */
function png(width: number, height: number, salt = ''): Buffer {
  const ihdr = Buffer.alloc(25);
  ihdr.writeUInt32BE(13, 0);
  ihdr.write('IHDR', 4, 'latin1');
  ihdr.writeUInt32BE(width, 8);
  ihdr.writeUInt32BE(height, 12);
  ihdr[16] = 8;
  ihdr[17] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), ihdr, Buffer.from(`IEND${salt}`, 'latin1')]);
}

const md5 = (b: Buffer | string) => crypto.createHash('md5').update(b).digest('hex');

/** Fichiers servis, par chemin (« /BunvWvh9/1k/table.png »). */
const FILES = new Map<string, Buffer>([
  ['/BunvWvh9/wheel.png', png(500, 500, 'wheel')],
  ['/BunvWvh9/flyer.png', png(850, 1104, 'flyer')],
  ['/BunvWvh9/audio.mp3', Buffer.from('ID3 musique factice')],
  ['/BunvWvh9/1k/bg.png', png(1920, 1080, 'bg')],
  ['/BunvWvh9/1k/dmd.png', png(1920, 1080, 'dmd')],
  ['/BunvWvh9/1k/table.png', png(1920, 1080, 'table1k')],
  ['/BunvWvh9/4k/table.png', png(3840, 2160, 'table4k')],
  ['/BunvWvh9/1k/table.mp4', Buffer.from('vidéo factice du plateau')],
  ['/BunvWvh9/1k/fss.png', png(1920, 1080, 'fss')],
  ['/025ojqP4/wheel.png', png(500, 500, 'autre')],
  ['/025ojqP4/1k/table.png', png(1920, 1080, 'autre-table')],
]);

let server: http.Server;
let base = '';
let source: MediaDbSource;
/** Réponses particulières, par chemin : coupure au milieu, silence, MD5 faux… */
const behaviour = new Map<string, 'cut' | 'stall' | 'missing'>();
let indexBody = '';
let indexHits = 0;
let headHits = 0;

/** Index au format réel (relevé le 21/10/2026), adresses vers le serveur local. */
function indexFor(overrides: Record<string, string> = {}): Record<string, unknown> {
  const url = (p: string) => `${base}${p}`;
  const sum = (p: string) => overrides[p] ?? md5(FILES.get(p)!);
  return {
    BunvWvh9: {
      '1k': {
        bg: url('/BunvWvh9/1k/bg.png'),
        bg_md5: sum('/BunvWvh9/1k/bg.png'),
        dmd: url('/BunvWvh9/1k/dmd.png'),
        dmd_md5: sum('/BunvWvh9/1k/dmd.png'),
        table: url('/BunvWvh9/1k/table.png'),
        table_md5: sum('/BunvWvh9/1k/table.png'),
        fss: url('/BunvWvh9/1k/fss.png'),
        fss_md5: sum('/BunvWvh9/1k/fss.png'),
        table_video: url('/BunvWvh9/1k/table.mp4'),
        table_video_md5: sum('/BunvWvh9/1k/table.mp4'),
      },
      '4k': { table: url('/BunvWvh9/4k/table.png'), table_md5: sum('/BunvWvh9/4k/table.png') },
      wheel: url('/BunvWvh9/wheel.png'),
      wheel_md5: sum('/BunvWvh9/wheel.png'),
      flyer: url('/BunvWvh9/flyer.png'),
      flyer_md5: sum('/BunvWvh9/flyer.png'),
      audio: url('/BunvWvh9/audio.mp3'),
      audio_md5: sum('/BunvWvh9/audio.mp3'),
      version: 'ba971b1f30ecf1a4dd2e6f1cb67240f9',
    },
    '025ojqP4': {
      '1k': { table: url('/025ojqP4/1k/table.png'), table_md5: sum('/025ojqP4/1k/table.png') },
      '4k': {},
      wheel: url('/025ojqP4/wheel.png'),
      wheel_md5: sum('/025ojqP4/wheel.png'),
      version: '8c0d8acc3f4b756d99e990c457c41eab',
    },
  };
}

before(async () => {
  server = http.createServer((req, res) => {
    const url = new URL(req.url!, 'http://local');
    if (url.pathname === '/vpinmdb.json') {
      indexHits++;
      const etag = `"${md5(indexBody)}"`;
      if (req.headers['if-none-match'] === etag) {
        res.writeHead(304).end();
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', ETag: etag }).end(indexBody);
      return;
    }
    // Comme github.com : une redirection vers le fichier brut.
    if (url.pathname.startsWith('/raw/')) {
      res.writeHead(302, { Location: url.pathname.slice(4) }).end();
      return;
    }
    const body = FILES.get(url.pathname);
    const how = behaviour.get(url.pathname);
    if (!body || how === 'missing') {
      res.writeHead(404).end('Not Found');
      return;
    }
    if (req.method === 'HEAD') headHits++;
    res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': String(body.length) });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    if (how === 'cut') {
      res.write(body.subarray(0, Math.floor(body.length / 2)));
      setTimeout(() => res.destroy(), 20);
      return;
    }
    if (how === 'stall') {
      res.write(body.subarray(0, 4));
      return;
    }
    res.end(body);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  source = { indexUrl: `${base}/vpinmdb.json`, filePrefixes: [`${base}/`] };
  indexBody = JSON.stringify(indexFor());
});

after(() => {
  server.closeAllConnections();
  server.close();
});

function tmp(name: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `cyberpinball-mediadb-${name}-`));
}

const FOLDER = 'Terminator 2 (Williams 1991)';

/** Racine de borne avec une table dans son dossier, .info au nom du dossier. */
function borne(info: Record<string, unknown> = { Info: { Title: 'Terminator 2', Manufacturer: 'Williams', Year: 1991, VPSId: 'BunvWvh9' }, User: { StartCount: 3 } }, name = FOLDER) {
  const root = tmp('borne');
  const folder = path.join(root, 'tables', name);
  fs.mkdirSync(path.join(folder, 'medias'), { recursive: true });
  fs.writeFileSync(path.join(folder, `${name} VPW 1.25.vpx`), '');
  const infoFile = path.join(folder, `${name}.info`);
  fs.writeFileSync(infoFile, JSON.stringify(info, null, 2));
  const downloads = path.join(root, 'downloads');
  const staging = path.join(downloads, 'vpinmediadb');
  const trash = path.join(root, 'trash', 'essai');
  return { root, folder, medias: path.join(folder, 'medias'), infoFile, downloads, staging, trash, table: (): TableEntry => scanTables(path.join(root, 'tables'))[0]! };
}

function cabinet(width: number, height: number, zone?: { x: number; y: number; width: number; height: number }): Cabinet {
  const screen: PhysicalScreen = { fingerprint: 'pf', strength: 'strong', label: 'Plateau', widthPx: width, heightPx: height, widthCm: 100, heightCm: 56 };
  return { version: 1, screens: [screen], roles: { playfield: 'pf' }, zones: zone ? { playfield: zone } : undefined, vpx: { iniPath: 'x' }, updatedAt: '2026-10-21' };
}

// ---------------------------------------------------------------------------
// Index

test('index : format réel lu (1k, 4k, fichiers à la racine, MD5), entrées et adresses douteuses écartées', () => {
  const raw = indexFor();
  Object.assign(raw, {
    '../evil': { wheel: `${base}/x.png` },
    Ailleurs01: { wheel: 'https://exemple.test/wheel.png', wheel_md5: md5('x') },
    MauvaisMd5: { wheel: `${base}/BunvWvh9/wheel.png`, wheel_md5: 'pas-un-md5' },
    Vide1234: { version: 'abc' },
  });
  const db = parseMediaDbIndex(raw, source)!;
  assert.deepEqual([...db.entries.keys()].sort(), ['025ojqP4', 'BunvWvh9', 'MauvaisMd5']);
  const t2 = db.entries.get('BunvWvh9')!;
  assert.equal(t2.version, 'ba971b1f30ecf1a4dd2e6f1cb67240f9');
  assert.deepEqual(Object.keys(t2.files).sort(), ['1k/bg', '1k/dmd', '1k/fss', '1k/table', '1k/table_video', '4k/table', 'audio', 'flyer', 'wheel']);
  assert.equal(t2.files['4k/table']!.md5, md5(FILES.get('/BunvWvh9/4k/table.png')!));
  assert.equal(db.entries.get('MauvaisMd5')!.files.wheel!.md5, undefined, 'MD5 mal formé : fichier gardé, sans vérification');
  // Avec la source par défaut, seules les adresses du dépôt superhac/vpinmediadb comptent.
  assert.equal(parseMediaDbIndex(raw), undefined);
  assert.ok(
    parseMediaDbIndex({ BunvWvh9: { wheel: 'https://github.com/superhac/vpinmediadb/raw/refs/heads/main/BunvWvh9/wheel.png', wheel_md5: md5('w') } }, MEDIADB_SOURCE),
  );
  assert.equal(parseMediaDbIndex([]), undefined);
  assert.equal(parseMediaDbIndex('texte'), undefined);
});

test('index : premier téléchargement dans downloads, puis rien avant 12 h, puis 304 avec l’ETag', async () => {
  const b = borne();
  indexHits = 0;
  const t0 = new Date('2026-10-21T08:00:00Z');
  assert.equal(loadMediaDb(b.downloads, source), undefined);
  assert.deepEqual(await refreshMediaDb(b.downloads, { source, now: t0 }), { status: 'updated' });
  assert.ok(fs.existsSync(path.join(b.downloads, MEDIADB_INDEX_FILE)));
  assert.equal(loadMediaDb(b.downloads, source)!.entries.size, 2);
  assert.deepEqual(await refreshMediaDb(b.downloads, { source, now: new Date('2026-10-21T19:00:00Z') }), { status: 'fresh' });
  assert.equal(indexHits, 1, 'moins de 12 h : GitHub n’est pas interrogé');
  assert.deepEqual(await refreshMediaDb(b.downloads, { source, now: new Date('2026-10-21T21:00:00Z') }), { status: 'unchanged' });
  assert.equal(indexHits, 2);
  // L'index change sur le dépôt : il est remplacé.
  const before = indexBody;
  indexBody = JSON.stringify({ ...indexFor(), Nouveau1: { wheel: `${base}/025ojqP4/wheel.png` } });
  try {
    assert.deepEqual(await refreshMediaDb(b.downloads, { source, force: true }), { status: 'updated' });
    assert.equal(loadMediaDb(b.downloads, source)!.entries.size, 3);
  } finally {
    indexBody = before;
  }
});

test('index : sans réseau ou réponse invalide, le cache reste et sert', async () => {
  const b = borne();
  await refreshMediaDb(b.downloads, { source });
  const offline: typeof fetch = async () => {
    throw new TypeError('fetch failed');
  };
  const r = await refreshMediaDb(b.downloads, { source, force: true, fetch: offline });
  assert.equal(r.status, 'offline');
  assert.match(r.message!, /fetch failed/);
  const broken: typeof fetch = async () => new Response('{"pas": "un index"', { status: 200 });
  assert.equal((await refreshMediaDb(b.downloads, { source, force: true, fetch: broken })).status, 'offline');
  assert.equal(loadMediaDb(b.downloads, source)!.entries.size, 2, 'le cache n’a pas été touché');
  // Jamais téléchargé et pas de réseau : rien, sans erreur.
  const empty = tmp('vide');
  assert.equal((await refreshMediaDb(empty, { source, fetch: offline })).status, 'offline');
  assert.equal(loadMediaDb(empty, source), undefined);
});

// ---------------------------------------------------------------------------
// 1k ou 4k

test('qualité : 4k pour un écran du plateau 4K, 1k pour un écran HD ou une demi-zone, ou imposée par le réglage', () => {
  assert.equal(mediaDbQuality('auto', cabinet(3840, 2160)).quality, '4k');
  assert.match(mediaDbQuality('auto', cabinet(3840, 2160)).reason, /3\s840 × 2\s160/);
  assert.equal(mediaDbQuality('auto', cabinet(1920, 1080)).quality, '1k');
  assert.equal(mediaDbQuality('auto', cabinet(2560, 1440)).quality, '1k', '2 560 points : le 1k suffit encore');
  // Poste de bureau : le plateau n'occupe que la moitié d'un écran 4K.
  assert.equal(mediaDbQuality('auto', cabinet(3840, 2160, { x: 0, y: 0, width: 0.5, height: 0.5 })).quality, '1k');
  assert.equal(mediaDbQuality('auto', undefined).quality, '1k');
  assert.equal(mediaDbQuality('4k', cabinet(1920, 1080)).quality, '4k');
  assert.equal(mediaDbQuality('1k', cabinet(3840, 2160)).quality, '1k');
  assert.match(mediaDbQuality('1k', cabinet(3840, 2160)).reason, /imposé/);
});

test('réglage « qualité téléchargée » : automatique par défaut, valeur inconnue remplacée', () => {
  assert.equal(DEFAULT_MENU_MEDIA_SETTINGS.downloadQuality, 'auto');
  assert.equal(normalizeMenuMediaSettings({ downloadQuality: '4k' }).downloadQuality, '4k');
  assert.equal(normalizeMenuMediaSettings({ downloadQuality: '8k' }).downloadQuality, 'auto');
});

test('offres : vidéo du plateau d’abord, image en 4k si demandée, fronton et afficheur en 1k seulement', () => {
  const db = parseMediaDbIndex(indexFor(), source)!;
  const t2 = db.entries.get('BunvWvh9')!;
  const k4 = mediaDbOffers(t2, '4k');
  assert.deepEqual(k4.map((o) => o.type), ['Wheel', 'Playfield', 'Backglass', 'FullDMD', 'GameInfo', 'Audio']);
  const playfield = k4.find((o) => o.type === 'Playfield')!.variants;
  assert.deepEqual(playfield.map((v) => v.key), ['1k/table_video', '4k/table']);
  assert.equal(playfield[1]!.quality, '4k');
  // Aperçu d'une vidéo ou d'une image 4k : l'image 1k du même plateau, plus légère.
  assert.equal(playfield[0]!.preview!.url, `${base}/BunvWvh9/1k/table.png`);
  assert.equal(playfield[1]!.preview!.url, `${base}/BunvWvh9/1k/table.png`);
  assert.deepEqual(k4.find((o) => o.type === 'Backglass')!.variants.map((v) => v.key), ['1k/bg']);
  assert.equal(k4.find((o) => o.type === 'Audio')!.variants[0]!.preview, undefined);
  assert.deepEqual(mediaDbOffers(t2, '1k').find((o) => o.type === 'Playfield')!.variants.map((v) => v.key), ['1k/table_video', '1k/table']);
  // Un jeu qui n'a qu'un plateau en 1k : on le prend même en 4k.
  assert.deepEqual(mediaDbOffers(db.entries.get('025ojqP4')!, '4k').find((o) => o.type === 'Playfield')!.variants.map((v) => v.key), ['1k/table']);
});

// ---------------------------------------------------------------------------
// Correspondance

test('correspondance : identifiant VPS du .info, sinon titre, fabricant et année par la base VPS', () => {
  const db = parseMediaDbIndex(indexFor(), source)!;
  const vps = createVpsDb([
    { id: 'BunvWvh9', name: 'Terminator 2 - Judgment Day', manufacturer: 'Williams', year: 1991, tableFiles: [{ id: 'a', tableFormat: 'VPX' }] },
    { id: 'Iwa8DTGr', name: 'The Terminator', manufacturer: 'Original', year: 2019, tableFiles: [{ id: 'b', tableFormat: 'VPX' }] },
    { id: 'aT_GONvw', name: 'The Addams Family', manufacturer: 'Bally', year: 1992, tableFiles: [{ id: 'c', tableFormat: 'VPX' }] },
  ]);
  const byId = matchMediaDb(db, borne().table());
  assert.equal(byId.how, 'vps-id');
  assert.equal(byId.confident, true);
  assert.equal(byId.candidates[0]!.entry.id, 'BunvWvh9');

  const noId = borne({ Info: { Title: 'Terminator 2', Manufacturer: 'Williams', Year: 1991 } }).table();
  assert.match(matchMediaDb(db, noId).reason!, /base VPS n’est pas disponible/);
  const byTitle = matchMediaDb(db, noId, vps);
  assert.equal(byTitle.how, 'vps-title');
  assert.equal(byTitle.candidates[0]!.entry.id, 'BunvWvh9');
  assert.equal(byTitle.candidates[0]!.game!.name, 'Terminator 2 - Judgment Day');
  assert.equal(byTitle.confident, true);

  // Identifiant VPS connu mais absent de VPinMediaDB : on ne cherche pas un autre jeu au titre.
  const absent = matchMediaDb(db, borne({ Info: { Title: 'Terminator 2', VPSId: 'aT_GONvw' } }).table(), vps);
  assert.deepEqual(absent.candidates, []);
  assert.match(absent.reason!, /aT_GONvw/);
  // Jeu reconnu dans VPS, mais sans médias sur VPinMediaDB.
  const addams = matchMediaDb(db, borne({ Info: { Title: 'The Addams Family', Manufacturer: 'Bally', Year: 1992 } }, 'The Addams Family (Bally 1992)').table(), vps);
  assert.match(addams.reason!, /The Addams Family \(Bally 1992\)/);
});

// ---------------------------------------------------------------------------
// Téléchargement vérifié

test('téléchargement : redirection suivie, MD5 vérifié, fichier renommé seulement une fois complet', async () => {
  const dir = tmp('dl');
  const dest = path.join(dir, 'wheel.png');
  const seen: number[] = [];
  const got = await downloadMediaDbFile({ url: `${base}/raw/BunvWvh9/wheel.png`, md5: md5(FILES.get('/BunvWvh9/wheel.png')!) }, dest, { onData: (n) => seen.push(n) });
  assert.equal(got.size, FILES.get('/BunvWvh9/wheel.png')!.length);
  assert.deepEqual(fs.readFileSync(dest), FILES.get('/BunvWvh9/wheel.png'));
  assert.ok(seen.length > 0);
  assert.deepEqual(fs.readdirSync(dir), ['wheel.png']);
});

test('téléchargement : MD5 faux, réponse 404, silence ou abandon : il ne reste rien ; une coupure garde de quoi reprendre', async () => {
  const dir = tmp('echecs');
  const file = (p: string, sum?: string) => ({ url: `${base}${p}`, md5: sum ?? md5(FILES.get(p)!) });
  await assert.rejects(downloadMediaDbFile(file('/BunvWvh9/wheel.png', md5('autre chose')), path.join(dir, 'a.png')), (e: Error & { reason?: string }) => e.reason === 'md5');
  await assert.rejects(downloadMediaDbFile(file('/BunvWvh9/absent.png', md5('x')), path.join(dir, 'b.png')), (e: Error & { reason?: string }) => e.reason === 'http');
  behaviour.set('/BunvWvh9/flyer.png', 'cut');
  behaviour.set('/BunvWvh9/1k/bg.png', 'stall');
  try {
    await assert.rejects(downloadMediaDbFile(file('/BunvWvh9/flyer.png'), path.join(dir, 'c.png')), (e: Error & { reason?: string }) => e.reason === 'network');
    await assert.rejects(downloadMediaDbFile(file('/BunvWvh9/1k/bg.png'), path.join(dir, 'd.png'), { stallMs: 150 }), (e: Error & { reason?: string }) => e.reason === 'network');
    const abort = new AbortController();
    const pending = downloadMediaDbFile(file('/BunvWvh9/1k/bg.png'), path.join(dir, 'e.png'), { signal: abort.signal });
    setTimeout(() => abort.abort(), 50);
    await assert.rejects(pending, (e: Error & { reason?: string }) => e.reason === 'aborted');
  } finally {
    behaviour.clear();
  }
  // La coupure et le silence (4 octets puis plus rien) ont laissé leur partiel ; l'abandon, le MD5 faux et la 404, rien.
  assert.deepEqual(fs.readdirSync(dir).sort(), ['c.png.part', 'd.png.part'], 'ni fichier invalide, ni partiel d’un abandon');
  assert.ok(fs.statSync(path.join(dir, 'c.png.part')).size > 0);
  // L'essai suivant le termine, vérifié en entier (ce serveur ne sait pas reprendre : il renvoie tout, sans doublon).
  const got = await downloadMediaDbFile(file('/BunvWvh9/flyer.png'), path.join(dir, 'c.png'));
  assert.equal(got.md5, md5(FILES.get('/BunvWvh9/flyer.png')!));
  assert.deepEqual(fs.readFileSync(path.join(dir, 'c.png')), FILES.get('/BunvWvh9/flyer.png'));
  assert.deepEqual(fs.readdirSync(dir).sort(), ['c.png', 'd.png.part']);
});

test('poids : requêtes HEAD, gardés par MD5 dans downloads pour la fois suivante ; inconnus sans réseau', async () => {
  const b = borne();
  const db = parseMediaDbIndex(indexFor(), source)!;
  const files = Object.values(db.entries.get('BunvWvh9')!.files);
  headHits = 0;
  const sizes = await mediaDbSizes(files, { downloadsDir: b.downloads });
  assert.equal(sizes.get(`${base}/BunvWvh9/4k/table.png`), FILES.get('/BunvWvh9/4k/table.png')!.length);
  assert.equal(headHits, files.length);
  const again = await mediaDbSizes(files, { downloadsDir: b.downloads });
  assert.equal(headHits, files.length, 'deuxième fois : rien n’est redemandé');
  assert.equal(again.size, files.length);
  const offline: typeof fetch = async () => {
    throw new TypeError('fetch failed');
  };
  assert.equal((await mediaDbSizes(files, { fetch: offline })).size, 0);
});

// ---------------------------------------------------------------------------
// Proposition et rangement

test('proposition : ce qui manque est retenu, un média mis par l’utilisateur est gardé sauf demande', () => {
  const b = borne();
  fs.writeFileSync(path.join(b.medias, `(Wheel) ${FOLDER}.png`), png(400, 400, 'à moi'));
  const db = parseMediaDbIndex(indexFor(), source)!;
  const proposals = proposeMediaDb(b.table(), db.entries.get('BunvWvh9')!, '1k', { root: b.root });
  const wheel = proposals.find((p) => p.type === 'Wheel')!;
  assert.equal(wheel.selected, undefined, 'logo de l’utilisateur : pas remplacé d’office');
  assert.deepEqual(wheel.replaces.map((f) => path.basename(f)), [`(Wheel) ${FOLDER}.png`]);
  assert.equal(proposals.find((p) => p.type === 'Playfield')!.selected, 0);
  assert.deepEqual(proposals.find((p) => p.type === 'Playfield')!.replaces, []);
  // Depuis le menu système : seulement ce qui manque.
  assert.deepEqual(
    proposeMediaDb(b.table(), db.entries.get('BunvWvh9')!, '1k', { root: b.root, missingOnly: true }).map((p) => p.type),
    ['Playfield', 'Backglass', 'FullDMD', 'GameInfo', 'Audio'],
  );
});

test('rangement : « (Type) <dossier>.ext », ancien média à la corbeille, source et date dans le .info, demi-tour du plateau retiré', async () => {
  const b = borne({ Info: { Title: 'Terminator 2', VPSId: 'BunvWvh9' }, User: { StartCount: 3 }, CyberPinball: { medias: { halfTurn: { Playfield: true }, volume: 50 } } });
  const old = path.join(b.medias, `(Playfield) ${FOLDER}.mp4`);
  fs.writeFileSync(old, 'ancienne vidéo, tournée à la main');
  const db = parseMediaDbIndex(indexFor(), source)!;
  const entry = db.entries.get('BunvWvh9')!;
  const proposals = proposeMediaDb(b.table(), entry, '4k', { root: b.root });
  const playfield = proposals.find((p) => p.type === 'Playfield')!;
  const wheel = proposals.find((p) => p.type === 'Wheel')!;
  const progress: string[] = [];
  const result = await installMediaDb(
    b.table(),
    [
      { offer: playfield.variants[1]!, replaces: playfield.replaces },
      { offer: wheel.variants[0]!, replaces: wheel.replaces },
    ],
    { infoFile: b.infoFile, trashDir: b.trash, stagingDir: b.staging, entry, now: new Date('2026-10-21T15:00:00Z'), onProgress: (p) => progress.push(`${p.index + 1}/${p.total} ${p.type}`) },
  );
  assert.deepEqual(result.failed, []);
  assert.deepEqual(fs.readdirSync(b.medias).sort(), [`(Playfield) ${FOLDER}.png`, `(Wheel) ${FOLDER}.png`]);
  assert.deepEqual(fs.readFileSync(path.join(b.medias, `(Playfield) ${FOLDER}.png`)), FILES.get('/BunvWvh9/4k/table.png'));
  assert.ok(fs.existsSync(path.join(b.trash, `(Playfield) ${FOLDER}.mp4`)), 'l’ancienne vidéo est dans la corbeille');
  assert.ok(progress.includes('1/2 Playfield') && progress.includes('2/2 Wheel'));
  const info = readInfo(b.infoFile);
  assert.equal(info.User?.StartCount, 3, 'les autres champs du .info sont gardés');
  const memory = mediaMemory(info);
  assert.equal(memory.volume, 50);
  assert.equal(memory.halfTurn, undefined, 'le nouveau plateau suit le standard : plus de demi-tour forcé');
  assert.deepEqual(memory.sources?.Playfield, {
    origin: 'VPinMediaDB',
    url: `${base}/BunvWvh9/4k/table.png`,
    date: '2026-10-21T15:00:00.000Z',
    vpsId: 'BunvWvh9',
    key: '4k/table',
    md5: md5(FILES.get('/BunvWvh9/4k/table.png')!),
    file: `(Playfield) ${FOLDER}.png`,
  });
  // Le menu tourne le plateau d'après ses proportions : paysage, flippers à droite.
  const resolved = resolveMedia(b.table(), b.root, 'Playfield', { flipperEdge: 'bottom' });
  assert.deepEqual(readMediaDimensions(resolved.file!), { width: 3840, height: 2160, animated: false });
  assert.equal(resolved.rotation, 90);
  assert.deepEqual(fs.readdirSync(b.staging), [], 'rien ne reste dans le dossier de réception');

  // Recherche suivante : à jour ; puis le dépôt change le logo : nouvelle version proposée d'office.
  const again = proposeMediaDb(b.table(), entry, '4k', { root: b.root });
  assert.equal(again.find((p) => p.type === 'Wheel')!.upToDate, true);
  assert.equal(again.find((p) => p.type === 'Wheel')!.selected, undefined);
  const changed = parseMediaDbIndex(indexFor({ '/BunvWvh9/wheel.png': md5('nouveau logo') }), source)!.entries.get('BunvWvh9')!;
  const update = proposeMediaDb(b.table(), changed, '4k', { root: b.root }).find((p) => p.type === 'Wheel')!;
  assert.equal(update.update, true);
  assert.equal(update.selected, 0);
});

test('rangement : un fichier qui échoue n’empêche pas les autres et ne laisse rien ; l’aperçu reçu sert au téléchargement', async () => {
  const b = borne();
  const db = parseMediaDbIndex(indexFor({ '/BunvWvh9/1k/bg.png': md5('somme fausse') }), source)!;
  const entry = db.entries.get('BunvWvh9')!;
  const proposals = proposeMediaDb(b.table(), entry, '1k', { root: b.root });
  const pick = (type: string) => {
    const p = proposals.find((x) => x.type === type)!;
    return { offer: p.variants[p.selected ?? 0]!, replaces: p.replaces };
  };
  // Aperçu du logo déjà reçu pour le plan : il n'est pas redemandé.
  const wheel = pick('Wheel');
  fs.mkdirSync(b.staging, { recursive: true });
  fs.writeFileSync(mediaDbStagedFile(b.staging, wheel.offer.file), FILES.get('/BunvWvh9/wheel.png')!);
  behaviour.set('/BunvWvh9/wheel.png', 'missing');
  try {
    const result = await installMediaDb(b.table(), [pick('Backglass'), wheel, pick('Audio')], { infoFile: b.infoFile, trashDir: b.trash, stagingDir: b.staging, entry });
    assert.deepEqual(result.installed.map((i) => i.type), ['Wheel', 'Audio']);
    assert.deepEqual(result.failed.map((f) => f.type), ['Backglass']);
    assert.match(result.failed[0]!.reason, /MD5/);
  } finally {
    behaviour.clear();
  }
  assert.deepEqual(fs.readdirSync(b.medias).sort(), [`(Audio) ${FOLDER}.mp3`, `(Wheel) ${FOLDER}.png`]);
  assert.deepEqual(fs.readdirSync(b.staging), []);
  const sources = mediaMemory(readInfo(b.infoFile)).sources!;
  assert.deepEqual(Object.keys(sources).sort(), ['Audio', 'Wheel']);
});

test('réception : vieux aperçus et vieux partiels effacés ; un partiel récent attend sa reprise', () => {
  const dir = tmp('reception');
  const now = new Date();
  fs.writeFileSync(path.join(dir, 'a.png.part'), 'x');
  fs.writeFileSync(path.join(dir, 'recent.png'), 'x');
  const old = path.join(dir, 'vieux.png');
  fs.writeFileSync(old, 'x');
  const oldPart = path.join(dir, 'vieux.png.part');
  fs.writeFileSync(oldPart, 'x');
  const yesterday = new Date(now.getTime() - 2 * 24 * 3600_000);
  fs.utimesSync(old, yesterday, yesterday);
  fs.utimesSync(oldPart, yesterday, yesterday);
  cleanMediaDbStaging(dir, { now });
  assert.deepEqual(fs.readdirSync(dir).sort(), ['a.png.part', 'recent.png']);
  fs.rmSync(path.join(dir, 'a.png.part'));
  cleanMediaDbStaging(dir, { now, remove: [path.join(dir, 'recent.png')] });
  assert.deepEqual(fs.readdirSync(dir), []);
});

test('avertissement : pas encore lu, puis accepté une fois avec sa date', () => {
  const dir = tmp('donnees');
  assert.equal(mediaDbNoticeAccepted(dir), undefined);
  acceptMediaDbNotice(dir, new Date('2026-10-21T10:00:00Z'));
  assert.equal(mediaDbNoticeAccepted(dir), '2026-10-21T10:00:00.000Z');
  assert.match(MEDIADB_NOTICE, /aucune licence/);
  assert.match(MEDIADB_NOTICE, /appartiennent à leurs auteurs/);
  assert.match(MEDIADB_NOTICE, /[Uu]sage personnel/);
});
