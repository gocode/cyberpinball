import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import {
  MEDIA_TYPES,
  MediaDimensionCache,
  dmdMediaType,
  dmdTypeForRatio,
  mediaFileName,
  mediaMemory,
  mediaNames,
  mediaTypeFromFolder,
  mediaTypeFromVpinfe,
  mediaTypeInfo,
  parseMediaType,
  playfieldMediaRotation,
  readMediaDimensions,
  resolveMedia,
  resolveRoleMedia,
  saveHalfTurn,
  scanTableMedias,
  type B2sImageKind,
} from '../medias';
import type { Cabinet, PhysicalScreen } from '../model';
import { readInfo, scanTables, type TableEntry } from '../tables';

// --- Fichiers factices : de vrais en-têtes, le reste vide. ---

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  return Buffer.concat([len, Buffer.from(type, 'latin1'), data, Buffer.alloc(4)]);
}

function png(width: number, height: number, animated = false): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const parts = [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr)];
  if (animated) parts.push(chunk('acTL', Buffer.alloc(8)));
  parts.push(chunk('IDAT', Buffer.alloc(10)), chunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(parts);
}

function jpeg(width: number, height: number, orientation?: number): Buffer {
  const parts = [Buffer.from([0xff, 0xd8])];
  if (orientation) {
    const tiff = Buffer.alloc(26);
    tiff.write('MM', 0, 'latin1');
    tiff.writeUInt16BE(42, 2);
    tiff.writeUInt32BE(8, 4);
    tiff.writeUInt16BE(1, 8);
    tiff.writeUInt16BE(0x0112, 10);
    tiff.writeUInt16BE(3, 12);
    tiff.writeUInt32BE(1, 14);
    tiff.writeUInt16BE(orientation, 18);
    const body = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]);
    const head = Buffer.from([0xff, 0xe1, 0, 0]);
    head.writeUInt16BE(body.length + 2, 2);
    parts.push(head, body);
  }
  const sof = Buffer.from([0xff, 0xc0, 0, 17, 8, 0, 0, 0, 0, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
  sof.writeUInt16BE(height, 5);
  sof.writeUInt16BE(width, 7);
  parts.push(sof, Buffer.from([0xff, 0xd9]));
  return Buffer.concat(parts);
}

function riff(kind: string, data: Buffer): Buffer {
  const head = Buffer.alloc(20);
  head.write('RIFF', 0, 'latin1');
  head.writeUInt32LE(12 + data.length, 4);
  head.write('WEBP', 8, 'latin1');
  head.write(kind, 12, 'latin1');
  head.writeUInt32LE(data.length, 16);
  return Buffer.concat([head, data]);
}

function webpVp8x(width: number, height: number, animated: boolean): Buffer {
  const d = Buffer.alloc(10);
  d[0] = animated ? 0x02 : 0;
  d.writeUIntLE(width - 1, 4, 3);
  d.writeUIntLE(height - 1, 7, 3);
  return riff('VP8X', d);
}

function webpVp8(width: number, height: number): Buffer {
  const d = Buffer.from([0, 0, 0, 0x9d, 0x01, 0x2a, 0, 0, 0, 0]);
  d.writeUInt16LE(width, 6);
  d.writeUInt16LE(height, 8);
  return riff('VP8 ', d);
}

function webpVp8l(width: number, height: number): Buffer {
  const d = Buffer.alloc(5);
  d[0] = 0x2f;
  d.writeUInt32LE(((width - 1) | ((height - 1) << 14)) >>> 0, 1);
  return riff('VP8L', d);
}

function gif(width: number, height: number, animated: boolean): Buffer {
  const head = Buffer.alloc(13);
  head.write('GIF89a', 0, 'latin1');
  head.writeUInt16LE(width, 6);
  head.writeUInt16LE(height, 8);
  return Buffer.concat([head, animated ? Buffer.from('!\xff\x0bNETSCAPE2.0', 'latin1') : Buffer.alloc(0), Buffer.from(';')]);
}

function box(type: string, ...payload: Buffer[]): Buffer {
  const body = Buffer.concat(payload);
  const head = Buffer.alloc(8);
  head.writeUInt32BE(8 + body.length);
  head.write(type, 4, 'latin1');
  return Buffer.concat([head, body]);
}

function tkhd(width: number, height: number, opts: { version?: 0 | 1; quarter?: boolean } = {}): Buffer {
  const v1 = opts.version === 1;
  const matrix = v1 ? 52 : 40;
  const t = Buffer.alloc(matrix + 44);
  t[0] = v1 ? 1 : 0;
  // Matrice identité, ou quart de tour (a = 0, b = 1, c = -1, d = 0).
  t.writeInt32BE(opts.quarter ? 0 : 0x10000, matrix);
  t.writeInt32BE(opts.quarter ? 0x10000 : 0, matrix + 4);
  t.writeInt32BE(opts.quarter ? -0x10000 : 0, matrix + 12);
  t.writeInt32BE(opts.quarter ? 0 : 0x10000, matrix + 16);
  t.writeInt32BE(0x40000000, matrix + 32);
  t.writeUInt32BE(width * 65536, matrix + 36);
  t.writeUInt32BE(height * 65536, matrix + 40);
  return box('tkhd', t);
}

/** moov à la fin, après les données, avec une piste audio avant la vidéo. */
function mp4(width: number, height: number, opts: { version?: 0 | 1; quarter?: boolean } = {}): Buffer {
  return Buffer.concat([
    box('ftyp', Buffer.from('isom\0\0\0\0isomavc1', 'latin1')),
    box('mdat', Buffer.alloc(4096)),
    box('moov', box('mvhd', Buffer.alloc(100)), box('trak', tkhd(0, 0)), box('trak', tkhd(width, height, opts), box('mdia', Buffer.alloc(8)))),
  ]);
}

function ebml(id: number[], payload: Buffer): Buffer {
  const size = payload.length < 127 ? Buffer.from([0x80 | payload.length]) : Buffer.from([0x40 | (payload.length >> 8), payload.length & 0xff]);
  return Buffer.concat([Buffer.from(id), size, payload]);
}

function webm(width: number, height: number): Buffer {
  const u16 = (n: number) => Buffer.from([n >> 8, n & 0xff]);
  const header = ebml([0x1a, 0x45, 0xdf, 0xa3], ebml([0x42, 0x82], Buffer.from('webm')));
  const video = ebml([0xe0], Buffer.concat([ebml([0xb0], u16(width)), ebml([0xba], u16(height))]));
  const tracks = ebml([0x16, 0x54, 0xae, 0x6b], ebml([0xae], Buffer.concat([ebml([0xd7], Buffer.from([1])), video])));
  const info = ebml([0x15, 0x49, 0xa9, 0x66], Buffer.alloc(20));
  // Segment de taille inconnue, comme dans un enregistrement en direct.
  const segment = Buffer.concat([Buffer.from([0x18, 0x53, 0x80, 0x67, 0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]), info, tracks]);
  return Buffer.concat([header, segment]);
}

// --- Borne factice ---

const T2 = 'Terminator 2 (Williams 1991)';

interface Fixture {
  root: string;
  tables: string;
  t2: TableEntry;
  medias: string;
  defaults: string;
  put: (name: string, data?: Buffer) => string;
  putDefault: (name: string, data?: Buffer) => string;
}

function fixture(): Fixture {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-medias-'));
  const tables = path.join(root, 'tables');
  const folder = path.join(tables, T2);
  const medias = path.join(folder, 'medias');
  const defaults = path.join(root, 'media');
  fs.mkdirSync(medias, { recursive: true });
  fs.mkdirSync(defaults, { recursive: true });
  fs.writeFileSync(path.join(folder, 'T2 g5k.vpx'), '');
  const put = (dir: string) => (name: string, data: Buffer = png(10, 10)) => {
    const file = path.join(dir, name);
    fs.writeFileSync(file, data);
    return file;
  };
  return { root, tables, t2: scanTables(tables)[0]!, medias, defaults, put: put(medias), putDefault: put(defaults) };
}

function screen(fingerprint: string, widthPx: number, heightPx: number): PhysicalScreen {
  return { fingerprint, strength: 'strong', label: fingerprint, widthPx, heightPx, widthCm: 0, heightCm: 0 };
}

function cabinet(dmd: { width: number; height: number } | undefined, extra: Partial<Cabinet> = {}): Cabinet {
  const screens = [screen('pf', 3840, 2160), screen('bg', 1920, 1080)];
  const roles: Cabinet['roles'] = { playfield: 'pf', backglass: 'bg' };
  if (dmd) {
    screens.push(screen('dmd', dmd.width, dmd.height));
    roles.dmd = 'dmd';
  }
  return { version: 1, screens, roles, vpx: { iniPath: '' }, updatedAt: '', ...extra };
}

// --- Catalogue ---

test('catalogue : chaque type a un libellé, une fonction en une phrase, des formats et un repli', () => {
  const types = MEDIA_TYPES.map((t) => t.type);
  assert.deepEqual(types, [
    'Wheel', 'Playfield', 'Backglass', 'DMD', 'FullDMD', 'Topper', 'Loading',
    'Audio', 'AudioLaunch', 'GameInfo', 'GameHelp', 'Other', 'RealDMD', 'RealColorDMD',
  ]);
  for (const t of MEDIA_TYPES) {
    assert.ok(t.label.length > 0, t.type);
    assert.match(t.description, /^\p{Lu}.*\.$/u, `${t.type} : une phrase`);
    assert.ok(t.formats.length > 0, t.type);
    assert.equal(t.formats.some((f) => ['flv', 'f4v', 'avi', 'mov'].includes(f)), false, t.type);
  }
  // Un seul libellé par type, partout.
  assert.equal(new Set(MEDIA_TYPES.map((t) => t.label)).size, MEDIA_TYPES.length);
  assert.equal(mediaTypeInfo('Wheel').label, 'Logo');
  assert.equal(mediaTypeInfo('GameInfo').label, 'Prospectus');
  assert.equal(mediaTypeInfo('Backglass').target, 'backglass');
  assert.equal(mediaTypeInfo('Audio').target, 'audio');
  assert.equal(mediaTypeInfo('RealDMD').target, undefined);
  assert.deepEqual(mediaTypeInfo('Loading').formats, ['mp4', 'webm', 'm4v']);
  assert.deepEqual(
    MEDIA_TYPES.filter((t) => t.pages).map((t) => t.type),
    ['GameInfo', 'GameHelp'],
  );
  assert.deepEqual(
    MEDIA_TYPES.filter((t) => t.orientable).map((t) => t.type),
    ['Playfield', 'Loading'],
  );
  assert.equal(parseMediaType(' gamehelp '), 'GameHelp');
  assert.equal(parseMediaType('Flyer'), undefined);
});

test('alias : dossiers de Popper et de PinballX, noms fixes de VPinFE', () => {
  assert.equal(mediaTypeFromFolder('popper', 'Menu'), 'FullDMD');
  assert.equal(mediaTypeFromFolder('popper', 'playfield'), 'Playfield');
  assert.equal(mediaTypeFromFolder('popper', 'Other2'), 'Other');
  assert.equal(mediaTypeFromFolder('pinballx', 'Wheel Images'), 'Wheel');
  assert.equal(mediaTypeFromFolder('pinballx', 'Instruction Cards'), 'GameHelp');
  assert.equal(mediaTypeFromFolder('pinballx', 'Launch Audio'), 'AudioLaunch');
  assert.equal(mediaTypeFromFolder('pinballx', 'Inconnu'), undefined);
  assert.equal(mediaTypeFromVpinfe('BG.png'), 'Backglass');
  assert.equal(mediaTypeFromVpinfe('dmd.png'), 'FullDMD');
  assert.equal(mediaTypeFromVpinfe('fss.png'), 'Playfield');
  assert.equal(mediaTypeFromVpinfe('flyer.png'), 'GameInfo');
  assert.equal(mediaTypeFromVpinfe('cab.png'), undefined);
});

// --- Résolution ---

test('ordre de recherche : .vpx, dossier, VPinFE, .directb2s, défaut de la borne, repli intégré', () => {
  const f = fixture();
  const b2s = f.put('b2s-cache.png');
  const asked: B2sImageKind[] = [];
  const b2sImage = (_t: TableEntry, kind: B2sImageKind) => (asked.push(kind), b2s);
  const steps = [
    ['vpx-name', f.put('(Backglass) T2 g5k.png')],
    ['folder-name', f.put(`(Backglass) ${T2}.png`)],
    ['vpinfe', f.put('bg.png')],
    ['b2s', b2s],
    ['default', f.putDefault('(Backglass).png')],
  ] as const;
  for (const [source, file] of steps) {
    const r = resolveMedia(f.t2, f.root, 'Backglass', { b2sImage });
    assert.equal(r.source, source);
    assert.equal(r.file, file);
    assert.deepEqual(r.files, [file]);
    assert.equal(r.kind, 'image');
    assert.equal(r.fit, 'contain');
    if (source !== 'b2s') fs.rmSync(file);
    else fs.renameSync(path.join(f.medias, 'b2s-cache.png'), path.join(f.root, 'ailleurs.png'));
  }
  // Consulté seulement quand les médias du jeu manquent : aux étapes « b2s » et « default ».
  assert.deepEqual(asked, ['backglass', 'backglass']);
  const none = resolveMedia(f.t2, f.root, 'Backglass', { b2sImage });
  assert.deepEqual(
    { source: none.source, files: none.files, fallback: none.fallback, rotation: none.rotation },
    { source: 'fallback', files: [], fallback: 'backglass-card', rotation: 0 },
  );
  // Sans point d'accroche, l'étape 4 est sautée ; le .directb2s ne sert qu'au fronton et à l'afficheur.
  asked.length = 0;
  resolveMedia(f.t2, f.root, 'Topper', { b2sImage });
  resolveMedia(f.t2, f.root, 'DMD', { b2sImage });
  assert.deepEqual(asked, ['dmd']);
  fs.rmSync(f.root, { recursive: true });
});

test('noms : le .vpx puis le dossier, sans confondre un nom plus long ; casse ignorée', () => {
  const f = fixture();
  assert.deepEqual(mediaNames(f.t2), ['T2 g5k', T2]);
  // « T2 g5k » est le début d'un autre nom : ce n'est pas le média du .vpx.
  f.put('(Wheel) T2 g5k (autre).png');
  const wheel = f.put(`(wheel) ${T2.toUpperCase()}.PNG`);
  const r = resolveMedia(f.t2, f.root, 'Wheel');
  assert.equal(r.source, 'folder-name');
  assert.equal(r.file, wheel);
  // Une table en vrac à la racine n'a que le nom du .vpx.
  fs.writeFileSync(path.join(f.tables, 'Vrac.vpx'), '');
  const vrac = scanTables(f.tables).find((t) => t.id === 'Vrac.vpx')!;
  assert.deepEqual(mediaNames(vrac), ['Vrac']);
  fs.rmSync(f.root, { recursive: true });
});

test('formats : préférence du catalogue, formats illisibles mis de côté et signalés', () => {
  const f = fixture();
  f.put(`(Playfield) ${T2}.png`);
  const video = f.put(`(Playfield) ${T2}.mp4`, mp4(1920, 1080));
  const mov = f.put(`(Playfield) ${T2}.mov`);
  let r = resolveMedia(f.t2, f.root, 'Playfield');
  assert.equal(r.file, video);
  assert.equal(r.kind, 'video');
  assert.deepEqual(r.skipped, [mov]);
  // Seul un .mov porte le bon nom : la recherche passe à l'étape suivante.
  const flv = f.put('(Loading) T2 g5k.flv');
  const loading = f.put(`(Loading) ${T2}.webm`, webm(1080, 1920));
  r = resolveMedia(f.t2, f.root, 'Loading');
  assert.equal(r.source, 'folder-name');
  assert.equal(r.file, loading);
  assert.deepEqual(r.skipped, [flv]);
  // Une image n'est pas une vidéo de chargement.
  fs.rmSync(loading);
  f.put(`(Loading) ${T2}.png`);
  assert.equal(resolveMedia(f.t2, f.root, 'Loading').fallback, 'loading-screen');
  fs.rmSync(f.root, { recursive: true });
});

test('pages : prospectus et règles triés, page sans suffixe en premier ; une seule page ailleurs', () => {
  const f = fixture();
  const p10 = f.put(`(GameHelp) ${T2} 10.png`);
  const p2 = f.put(`(GameHelp) ${T2} 2.png`);
  const p1 = f.put(`(GameHelp) ${T2}.png`);
  const p3 = f.put(`(GameHelp) ${T2}_03.mp4`);
  f.put(`(GameHelp) ${T2} (bis).png`);
  const r = resolveMedia(f.t2, f.root, 'GameHelp');
  assert.deepEqual(r.files, [p1, p2, p3, p10]);
  assert.equal(r.file, p1);
  // Pages à la Popper, collées au nom (« elvis01 »).
  const i1 = f.put('(GameInfo) T2 g5k01.png');
  const i0 = f.put('(GameInfo) T2 g5k.png');
  assert.deepEqual(resolveMedia(f.t2, f.root, 'GameInfo').files, [i0, i1]);
  // Le fronton n'a qu'une page : « … 2.png » seul ne suffit pas.
  f.put(`(Backglass) ${T2} 2.png`);
  assert.equal(resolveMedia(f.t2, f.root, 'Backglass').source, 'fallback');
  // Défauts de la borne en plusieurs pages.
  const d2 = f.putDefault('(GameHelp) 2.png');
  const d1 = f.putDefault('(GameHelp).png');
  fs.rmSync(f.medias, { recursive: true });
  const def = resolveMedia(f.t2, f.root, 'GameHelp');
  assert.equal(def.source, 'default');
  assert.deepEqual(def.files, [d1, d2]);
  fs.rmSync(f.root, { recursive: true });
});

test('DMD ou FullDMD selon les proportions réelles de la zone du rôle dmd', () => {
  assert.equal(dmdTypeForRatio(4), 'DMD');
  assert.equal(dmdTypeForRatio(16 / 9), 'FullDMD');
  assert.equal(dmdTypeForRatio(3), 'DMD');
  assert.equal(dmdTypeForRatio(2.4), 'FullDMD');
  assert.equal(dmdMediaType(cabinet({ width: 1280, height: 320 })), 'DMD');
  assert.equal(dmdMediaType(cabinet({ width: 1920, height: 1080 })), 'FullDMD');
  // Écran couché : seules les proportions comptent.
  assert.equal(dmdMediaType(cabinet({ width: 320, height: 1280 })), 'DMD');
  assert.equal(dmdMediaType(cabinet(undefined)), undefined);
  // Bande sous le fronton, sur l'écran 16:9 du backglass : 1536×216, proche du 4:1.
  const shared = cabinet(undefined, {
    roles: { playfield: 'pf', backglass: 'bg', dmd: 'bg' },
    zones: { backglass: { x: 0, y: 0, width: 1, height: 0.8 }, dmd: { x: 0.1, y: 0.8, width: 0.8, height: 0.2 } },
  });
  assert.equal(dmdMediaType(shared), 'DMD');
});

test('afficheur : le type qui colle à l’écran, puis l’autre, avant l’image du .directb2s et les défauts', () => {
  const f = fixture();
  const wide = cabinet({ width: 1920, height: 1080 });
  const narrow = cabinet({ width: 1280, height: 320 });
  const full = f.put(`(FullDMD) ${T2}.mp4`, mp4(1920, 1080));
  let r = resolveRoleMedia(f.t2, f.root, 'dmd', { cabinet: wide });
  assert.deepEqual([r.type, r.foundType, r.file], ['FullDMD', 'FullDMD', full]);
  // Écran 4:1 sans (DMD) : le (FullDMD) du jeu, réduit, plutôt qu'un défaut.
  f.putDefault('(DMD).png');
  r = resolveRoleMedia(f.t2, f.root, 'dmd', { cabinet: narrow });
  assert.deepEqual([r.type, r.foundType, r.source], ['DMD', 'FullDMD', 'folder-name']);
  const dmd = f.put('(DMD) T2 g5k.webm', webm(512, 128));
  r = resolveRoleMedia(f.t2, f.root, 'dmd', { cabinet: narrow });
  assert.deepEqual([r.foundType, r.file], ['DMD', dmd]);
  // Plus rien dans le jeu : DMDImage du .directb2s, puis le défaut.
  fs.rmSync(f.medias, { recursive: true });
  const cached = path.join(f.root, 'dmdimage.png');
  fs.writeFileSync(cached, png(1920, 1080));
  r = resolveRoleMedia(f.t2, f.root, 'dmd', { cabinet: narrow, b2sImage: (_t, kind) => (kind === 'dmd' ? cached : undefined) });
  assert.deepEqual([r.source, r.file], ['b2s', cached]);
  r = resolveRoleMedia(f.t2, f.root, 'dmd', { cabinet: wide });
  assert.deepEqual([r.type, r.foundType, r.source], ['FullDMD', 'DMD', 'default']);
  fs.rmSync(path.join(f.defaults, '(DMD).png'));
  assert.equal(resolveRoleMedia(f.t2, f.root, 'dmd', { cabinet: wide }).fallback, 'dmd-dots');
  // Les autres rôles.
  assert.equal(resolveRoleMedia(f.t2, f.root, 'topper').fallback, 'topper-logo');
  assert.equal(resolveRoleMedia(f.t2, f.root, 'playfield').fallback, 'playfield-gradient');
  fs.rmSync(f.root, { recursive: true });
});

test('orientation : portrait flippers en bas, paysage flippers à droite, tourné d’après flipperEdge', () => {
  const portrait = { width: 1080, height: 1920 };
  const landscape = { width: 1920, height: 1080 };
  assert.equal(playfieldMediaRotation(portrait, 'bottom'), 0);
  assert.equal(playfieldMediaRotation(landscape, 'bottom'), 90);
  assert.equal(playfieldMediaRotation(landscape, 'right'), 0);
  assert.equal(playfieldMediaRotation(portrait, 'right'), 270);
  assert.equal(playfieldMediaRotation(portrait, 'left'), 90);
  assert.equal(playfieldMediaRotation(landscape, 'left'), 180);
  assert.equal(playfieldMediaRotation(portrait, 'top'), 180);
  assert.equal(playfieldMediaRotation(landscape, 'right', true), 180);
  assert.equal(playfieldMediaRotation(undefined, 'bottom'), 0);

  const f = fixture();
  f.put(`(Playfield) ${T2}.png`, png(1920, 1080));
  f.put(`(Backglass) ${T2}.png`, png(1920, 1080));
  // Borne : écran couché, flippers au bord droit de l'image Windows, comme le fichier.
  const cab = cabinet(undefined, { playfield: { flipperEdge: 'right' } });
  let r = resolveMedia(f.t2, f.root, 'Playfield', { cabinet: cab });
  assert.deepEqual(r.dimensions, { width: 1920, height: 1080, animated: false });
  assert.equal(r.rotation, 0);
  assert.equal(resolveMedia(f.t2, f.root, 'Playfield').rotation, 90);
  assert.equal(resolveMedia(f.t2, f.root, 'Playfield', { cabinet: cab, flipperEdge: 'bottom' }).rotation, 90);
  // Les médias non orientables ne tournent pas et ne sont pas mesurés sans le demander.
  const bg = resolveMedia(f.t2, f.root, 'Backglass', { cabinet: cab });
  assert.equal(bg.rotation, 0);
  assert.equal(bg.dimensions, undefined);
  assert.equal(resolveMedia(f.t2, f.root, 'Backglass', { measure: true }).dimensions?.width, 1920);
  fs.rmSync(f.root, { recursive: true });
});

test('demi-tour mémorisé dans le .info (CyberPinball.medias), sans perdre les autres champs', () => {
  const f = fixture();
  const infoFile = path.join(f.t2.folder, `${T2}.info`);
  fs.writeFileSync(infoFile, JSON.stringify({ Info: { Title: 'Terminator 2' }, CyberPinball: { pup: { t2: { option: 'A' } } } }));
  f.put(`(Playfield) ${T2}.png`, png(1080, 1920));
  saveHalfTurn(infoFile, 'Playfield', true);
  const info = readInfo(infoFile);
  assert.deepEqual(info.Info, { Title: 'Terminator 2' });
  assert.deepEqual(info.CyberPinball, { pup: { t2: { option: 'A' } }, medias: { halfTurn: { Playfield: true } } });
  const t2 = scanTables(f.tables)[0]!;
  assert.deepEqual(mediaMemory(t2.info), { halfTurn: { Playfield: true } });
  assert.equal(resolveMedia(t2, f.root, 'Playfield').rotation, 180);
  // La mémoire passée en option prime sur celle lue à l'inventaire.
  assert.equal(resolveMedia(t2, f.root, 'Playfield', { memory: {} }).rotation, 0);
  saveHalfTurn(infoFile, 'Playfield', false);
  assert.deepEqual(readInfo(infoFile).CyberPinball, { pup: { t2: { option: 'A' } }, medias: {} });
  assert.deepEqual(mediaMemory({}), {});
  fs.rmSync(f.root, { recursive: true });
});

test('écriture : « (Type) <nom du dossier>.ext », retrouvé par la recherche', () => {
  const f = fixture();
  assert.equal(mediaFileName(f.t2, 'GameHelp', '.PNG'), `(GameHelp) ${T2}.png`);
  assert.equal(mediaFileName(f.t2, 'GameHelp', 'png', 2), `(GameHelp) ${T2} 2.png`);
  fs.writeFileSync(path.join(f.tables, 'Vrac.vpx'), '');
  const vrac = scanTables(f.tables).find((t) => t.id === 'Vrac.vpx')!;
  assert.equal(mediaFileName(vrac, 'Wheel', 'png'), '(Wheel) Vrac.png');
  f.put(mediaFileName(f.t2, 'GameHelp', 'png', 2));
  f.put(mediaFileName(f.t2, 'GameHelp', 'png'));
  assert.deepEqual(
    resolveMedia(f.t2, f.root, 'GameHelp').files.map((x) => path.basename(x)),
    [`(GameHelp) ${T2}.png`, `(GameHelp) ${T2} 2.png`],
  );
  fs.rmSync(f.root, { recursive: true });
});

test('inventaire de medias\\ : type, nom reconnu, page, format lu', () => {
  const f = fixture();
  f.put('(Wheel) T2 g5k.png');
  f.put(`(GameHelp) ${T2} 2.png`);
  f.put('(Backglass) Terminator 2.png');
  f.put('(Topper) T2 g5k.mov');
  f.put('bg.mp4');
  f.put('notes.txt');
  const rows = scanTableMedias(f.t2).map((m) => [path.basename(m.file), m.type, m.match, m.page, m.accepted]);
  assert.deepEqual(rows, [
    ['(Backglass) Terminator 2.png', 'Backglass', 'other-name', 1, true],
    [`(GameHelp) ${T2} 2.png`, 'GameHelp', 'folder-name', 2, true],
    ['(Topper) T2 g5k.mov', 'Topper', 'vpx-name', 1, false],
    ['(Wheel) T2 g5k.png', 'Wheel', 'vpx-name', 1, true],
    ['bg.mp4', 'Backglass', 'vpinfe', 1, true],
    ['notes.txt', undefined, undefined, undefined, false],
  ]);
  fs.rmSync(f.root, { recursive: true });
});

// --- Dimensions ---

test('dimensions lues dans l’en-tête : PNG, APNG, JPEG (EXIF), WebP, GIF, MP4, WebM', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-dims-'));
  const cases: [string, Buffer, unknown][] = [
    ['a.png', png(1920, 1080), { width: 1920, height: 1080, animated: false }],
    ['b.png', png(500, 500, true), { width: 500, height: 500, animated: true }],
    ['c.jpg', jpeg(850, 1104), { width: 850, height: 1104, animated: false }],
    ['d.jpg', jpeg(1104, 850, 6), { width: 850, height: 1104, animated: false }],
    ['e.webp', webpVp8x(402, 302, true), { width: 402, height: 302, animated: true }],
    ['f.webp', webpVp8(352, 626), { width: 352, height: 626, animated: false }],
    ['g.webp', webpVp8l(128, 32), { width: 128, height: 32, animated: false }],
    ['h.gif', gif(128, 32, true), { width: 128, height: 32, animated: true }],
    ['i.gif', gif(64, 16, false), { width: 64, height: 16, animated: false }],
    ['j.mp4', mp4(1920, 1080), { width: 1920, height: 1080, animated: true }],
    ['k.mp4', mp4(1920, 1080, { version: 1 }), { width: 1920, height: 1080, animated: true }],
    ['l.mp4', mp4(1920, 1080, { quarter: true }), { width: 1080, height: 1920, animated: true }],
    ['m.webm', webm(1280, 320), { width: 1280, height: 320, animated: true }],
    ['n.png', Buffer.from('pas une image'), undefined],
    ['o.mp4', box('ftyp', Buffer.alloc(8)), undefined],
  ];
  for (const [name, data, expected] of cases) {
    const file = path.join(dir, name);
    fs.writeFileSync(file, data);
    assert.deepEqual(readMediaDimensions(file), expected, name);
  }
  assert.equal(readMediaDimensions(path.join(dir, 'absent.png')), undefined);
  fs.rmSync(dir, { recursive: true });
});

test('cache des dimensions : gardé tant que date et taille ne changent pas, et survit au redémarrage', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-dimcache-'));
  const file = path.join(root, 'a.png');
  fs.writeFileSync(file, png(1920, 1080));
  const when = new Date('2026-10-21T10:00:00Z');
  fs.utimesSync(file, when, when);
  const store = MediaDimensionCache.fileFor(root);
  assert.equal(store, path.join(root, 'data', 'cache', 'medias', 'dimensions.json'));
  const cache = new MediaDimensionCache(store);
  assert.equal(cache.get(file)?.width, 1920);
  // Même taille, même date : l'en-tête n'est pas relu.
  fs.writeFileSync(file, png(1080, 1920));
  fs.utimesSync(file, when, when);
  assert.equal(cache.get(file)?.width, 1920);
  cache.save();
  assert.equal(new MediaDimensionCache(store).get(file)?.width, 1920);
  // Date changée : remesuré.
  const later = new Date('2026-10-21T11:00:00Z');
  fs.utimesSync(file, later, later);
  assert.equal(new MediaDimensionCache(store).get(file)?.width, 1080);
  // Taille changée : remesuré.
  fs.writeFileSync(file, png(640, 480, true));
  fs.utimesSync(file, when, when);
  assert.equal(cache.get(file)?.width, 640);
  // Cache abîmé : ignoré.
  fs.writeFileSync(store, '{');
  assert.equal(new MediaDimensionCache(store).get(file)?.width, 640);
  assert.equal(cache.get(path.join(root, 'absent.png')), undefined);
  fs.rmSync(root, { recursive: true });
});
