// Image d'un .directb2s : choix de l'image allumée, du DMD, décodage en flux,
// cache invalidé par taille et date, fichiers abîmés, nettoyage. Les .directb2s
// sont construits ici comme les écrit l'éditeur B2S : base64 coupé tous les
// 76 caractères, sauts de ligne échappés en « &#xD;&#xA; » dans l'attribut.

import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { b2sCacheDir, b2sImages, pruneB2sCache, scanB2s } from '../b2simage';

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-b2s-'));
}

function chunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'latin1');
  return Buffer.concat([head, data, Buffer.alloc(4)]);
}

/** PNG dont seul l'en-tête compte ; extra grossit le fichier (chunk privé). */
function png(width: number, height: number, extra = 0): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const parts = [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr)];
  if (extra) parts.push(chunk('prVt', randomBytes(extra)));
  parts.push(chunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(parts);
}

/** JPEG avec un gros segment APP1 avant le SOF, pour vérifier le parcours des segments. */
function jpeg(width: number, height: number): Buffer {
  const segment = (marker: number, data: Buffer) => {
    const head = Buffer.from([0xff, marker, 0, 0]);
    head.writeUInt16BE(data.length + 2, 2);
    return Buffer.concat([head, data]);
  };
  const sof = Buffer.alloc(15);
  sof[0] = 8;
  sof.writeUInt16BE(height, 1);
  sof.writeUInt16BE(width, 3);
  sof[5] = 3;
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    segment(0xe0, Buffer.from('JFIF\0\x01\x01\0\0\x01\0\x01\0\0', 'latin1')),
    segment(0xe1, randomBytes(60000)),
    segment(0xc0, sof),
    Buffer.from([0xff, 0xd9]),
  ]);
}

type Breaks = 'entities' | 'decimal' | 'newlines' | 'none';

function b64(data: Buffer, breaks: Breaks = 'entities'): string {
  const lines = data.toString('base64').match(/.{1,76}/g) ?? [];
  if (breaks === 'none') return lines.join('');
  return lines.join({ entities: '&#xD;&#xA;', decimal: '&#13;&#10;', newlines: '\r\n' }[breaks]);
}

interface Fake {
  on?: Buffer;
  off?: Buffer;
  plain?: Buffer;
  dmd?: Buffer;
  breaks?: Breaks;
  quote?: '"' | "'";
  /** Ampoules en base64 avant <Images>, pour grossir le fichier comme les vrais. */
  bulbs?: number;
}

/** .directb2s dans l'ordre du vrai fichier de T2 : ampoules, puis Off, On, DMD, vignette. */
function directb2s(f: Fake): string {
  const q = f.quote ?? '"';
  const value = (data: Buffer) => `Value=${q}${b64(data, f.breaks)}${q}`;
  const bulbs = Array.from({ length: f.bulbs ?? 2 }, (_, i) =>
    `    <Bulb Parent="Backglass" ID="${i + 1}" Name="b${i}" Visible="1" Image="${b64(png(10, 10, 2000))}" />`,
  ).join('\r\n');
  const images = [
    f.off ? `    <BackglassOffImage ${value(f.off)} />` : '',
    f.on ? `    <BackglassOnImage RomID="0" RomIDType="0" ${value(f.on)} FileName="on.png" />` : '',
    f.plain ? `    <BackglassImage ${value(f.plain)} />` : '',
    f.dmd ? `    <DMDImage ${value(f.dmd)} />` : '',
    `    <ThumbnailImage Value="${b64(png(32, 32))}" />`,
  ].filter(Boolean);
  return [
    '<DirectB2SData Version="1.2">',
    '  <Name Value="Jeu factice" />',
    '  <DMDType Value="2" />',
    '  <Illumination>',
    bulbs,
    '  </Illumination>',
    '  <Images>',
    ...images,
    '  </Images>',
    '</DirectB2SData>',
  ].join('\r\n');
}

/** Table rangée comme dans <racine>\tables\<dossier>\, et cache sous <racine>\data. */
function setup(content: string | Buffer): { table: string; file: string; cache: string } {
  const root = tmp();
  const table = path.join(root, 'tables', 'Jeu (Fabricant 1990)');
  fs.mkdirSync(table, { recursive: true });
  const file = path.join(table, 'Jeu (Fabricant 1990).directb2s');
  fs.writeFileSync(file, content);
  return { table, file, cache: b2sCacheDir(path.join(root, 'data')) };
}

test("l'image allumée l'emporte sur l'éteinte ; le DMD est extrait à part ; rien n'est écrit à côté de la table", async () => {
  const on = png(1920, 1080);
  const off = png(1920, 1081);
  const dmd = png(1280, 390);
  const { table, file, cache } = setup(directb2s({ on, off, dmd }));
  const r = await b2sImages(file, cache);
  assert.equal(r.problems, undefined);
  assert.equal(r.backglass?.element, 'BackglassOnImage');
  assert.deepEqual([r.backglass?.width, r.backglass?.height, r.backglass?.format], [1920, 1080, 'png']);
  assert.ok(r.backglass!.file.startsWith(cache + path.sep) && r.backglass!.file.endsWith('.backglass.png'));
  assert.deepEqual(fs.readFileSync(r.backglass!.file), on);
  assert.equal(r.backglass?.bytes, on.length);
  assert.equal(r.dmd?.element, 'DMDImage');
  assert.deepEqual([r.dmd?.width, r.dmd?.height], [1280, 390]);
  assert.deepEqual(fs.readFileSync(r.dmd!.file), dmd);
  assert.deepEqual(fs.readdirSync(table), ['Jeu (Fabricant 1990).directb2s']);
});

test("sans image allumée : BackglassImage (ancien format), sinon l'image éteinte", async () => {
  const plain = png(800, 600);
  const off = png(801, 600);
  let s = setup(directb2s({ plain, off }));
  let r = await b2sImages(s.file, s.cache);
  assert.equal(r.backglass?.element, 'BackglassImage');
  assert.equal(r.backglass?.width, 800);
  assert.equal(r.dmd, undefined);
  s = setup(directb2s({ off }));
  r = await b2sImages(s.file, s.cache);
  assert.equal(r.backglass?.element, 'BackglassOffImage');
  assert.deepEqual(fs.readFileSync(r.backglass!.file), off);
});

test('toutes les façons de couper le base64, guillemets simples, JPEG au format d’origine', async () => {
  for (const breaks of ['entities', 'decimal', 'newlines', 'none'] as const) {
    const on = jpeg(1024, 768);
    const { file, cache } = setup(directb2s({ on, breaks, quote: breaks === 'decimal' ? "'" : '"' }));
    const r = await b2sImages(file, cache);
    assert.equal(r.problems, undefined, breaks);
    assert.deepEqual([r.backglass?.format, r.backglass?.width, r.backglass?.height], ['jpeg', 1024, 768], breaks);
    assert.ok(r.backglass!.file.endsWith('.jpg'), breaks);
    assert.deepEqual(fs.readFileSync(r.backglass!.file), on, breaks);
  }
});

test('grande image décodée en flux : entités et groupes base64 coupés entre deux morceaux de lecture', async () => {
  // Plus de 3 Mo de base64 : plusieurs morceaux de 1 Mo, des coupures à toutes les positions.
  const on = png(4000, 3000, 2_500_000);
  const { file, cache } = setup(directb2s({ on, bulbs: 300 }));
  assert.ok(fs.statSync(file).size > 4_000_000);
  const r = await b2sImages(file, cache);
  assert.equal(r.problems, undefined);
  assert.deepEqual(fs.readFileSync(r.backglass!.file), on);
});

test('cache : relu tant que taille et date ne changent pas, refait sinon, ancienne image retirée', async () => {
  const { file, cache } = setup(directb2s({ on: png(100, 50) }));
  // Date à la seconde : utimes ne rend pas les fractions de milliseconde de NTFS.
  const when = new Date('2026-01-02T03:04:05Z');
  fs.utimesSync(file, when, when);
  const first = await b2sImages(file, cache);
  const stat = fs.statSync(file);

  // Même taille, même date : le cache répond sans relire (le contenu modifié n'est pas vu).
  const sameSize = directb2s({ on: png(100, 51) });
  assert.equal(Buffer.byteLength(sameSize), stat.size);
  fs.writeFileSync(file, sameSize);
  fs.utimesSync(file, when, when);
  const cached = await b2sImages(file, cache);
  assert.deepEqual(cached, first);

  // Fichier remplacé : nouvelle extraction, nouveau nom de fichier, l'ancien disparaît.
  fs.writeFileSync(file, directb2s({ on: png(300, 200), dmd: png(128, 32) }));
  fs.utimesSync(file, when, new Date(when.getTime() + 5000));
  const fresh = await b2sImages(file, cache);
  assert.equal(fresh.backglass?.width, 300);
  assert.equal(fresh.dmd?.width, 128);
  assert.notEqual(fresh.backglass?.file, first.backglass?.file);
  assert.equal(fs.existsSync(first.backglass!.file), false);

  // Image effacée du cache à la main : refaite.
  fs.rmSync(fresh.backglass!.file);
  const again = await b2sImages(file, cache);
  assert.deepEqual(fs.readFileSync(again.backglass!.file).length, fresh.backglass!.bytes);
});

test('appels simultanés sur le même fichier : une seule extraction', async () => {
  const { file, cache } = setup(directb2s({ on: png(640, 480, 200_000) }));
  const results = await Promise.all([b2sImages(file, cache), b2sImages(file, cache), b2sImages(file, cache)]);
  assert.deepEqual(results[1], results[0]);
  assert.deepEqual(results[2], results[0]);
  assert.equal(fs.readdirSync(cache).filter((n) => n.includes('.tmp-')).length, 0);
});

test('fichier tronqué dans l’image allumée : repli sur l’éteinte, problème signalé', async () => {
  const off = png(500, 400);
  const full = directb2s({ off, on: png(500, 401, 50_000) });
  const cut = full.slice(0, full.indexOf('<BackglassOnImage') + 30_000);
  const { file, cache } = setup(cut);
  const r = await b2sImages(file, cache);
  assert.equal(r.backglass?.element, 'BackglassOffImage');
  assert.match(r.problems?.join('\n') ?? '', /BackglassOnImage est tronqué/);
});

test('guillemet fermant absent : la valeur est refusée au lieu de décoder du XML', async () => {
  const full = directb2s({ on: png(500, 400), dmd: png(128, 32) });
  const start = full.indexOf('Value="', full.indexOf('<DMDImage')) + 'Value="'.length;
  const end = full.indexOf('"', start);
  const broken = full.slice(0, end) + full.slice(end + 1);
  const { file, cache } = setup(broken);
  const r = await b2sImages(file, cache);
  assert.equal(r.backglass?.width, 500);
  assert.equal(r.dmd, undefined);
  assert.match(r.problems?.join('\n') ?? '', /DMDImage .* mal fermée/);
});

test("valeur qui n'est pas une image, image vide, base64 invalide : signalés, rien d'autre", async () => {
  const text = Buffer.from('Ceci est un texte et pas une image, même en base64.');
  let s = setup(directb2s({ on: text, dmd: png(128, 32) }));
  let r = await b2sImages(s.file, s.cache);
  assert.equal(r.backglass, undefined);
  assert.equal(r.dmd?.width, 128);
  assert.match(r.problems?.join('\n') ?? '', /ni PNG/);

  s = setup(directb2s({}).replace('  <Images>', '  <Images>\r\n    <BackglassOnImage Value="" />'));
  r = await b2sImages(s.file, s.cache);
  assert.match(r.problems?.join('\n') ?? '', /BackglassOnImage .* est vide/);

  // PNG coupé avant la fin de l'en-tête : dimensions illisibles.
  s = setup(directb2s({ on: png(10, 10).subarray(0, 20) }));
  r = await b2sImages(s.file, s.cache);
  assert.match(r.problems?.join('\n') ?? '', /dimensions sont illisibles/);
  assert.deepEqual(fs.readdirSync(s.cache).filter((n) => !n.endsWith('.b2s.json')), []);
});

test('sans <Images>, XML illisible, fichier absent : résultat vide sans exception, résultat négatif en cache', async () => {
  let s = setup(directb2s({}).replace(/<ThumbnailImage[^>]*>/, ''));
  let r = await b2sImages(s.file, s.cache);
  assert.deepEqual(Object.keys(r), ['problems']);
  assert.match(r.problems![0]!, /aucune image de fronton/);
  assert.equal(fs.readdirSync(s.cache).filter((n) => n.endsWith('.b2s.json')).length, 1);

  s = setup(randomBytes(300_000));
  r = await b2sImages(s.file, s.cache);
  assert.equal(r.backglass, undefined);

  s = setup(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(directb2s({ on: png(1, 1) }), 'utf16le')]));
  r = await b2sImages(s.file, s.cache);
  assert.match(r.problems?.join('\n') ?? '', /UTF-16/);

  r = await b2sImages(path.join(s.table, 'absent.directb2s'), s.cache);
  assert.match(r.problems?.join('\n') ?? '', /illisible/);
});

test('le cache ne peut pas être le dossier de la table', async () => {
  const { table, file } = setup(directb2s({ on: png(10, 10) }));
  const r = await b2sImages(file, path.join(table, 'cache'));
  assert.equal(r.backglass, undefined);
  assert.match(r.problems?.join('\n') ?? '', /à côté d'une table/);
  assert.deepEqual(fs.readdirSync(table), ['Jeu (Fabricant 1990).directb2s']);
});

test('premier passage : positions des valeurs, arrêt à </Images>', async () => {
  const xml = directb2s({ on: png(10, 10), off: png(11, 11) }) + '\r\n<DMDImage Value="iVBORw0KGgo=" />';
  const { file } = setup(xml);
  const { values, problems } = await scanB2s(file);
  assert.deepEqual(problems, []);
  assert.deepEqual([...values.keys()].sort(), ['BackglassOffImage', 'BackglassOnImage']);
  const on = values.get('BackglassOnImage')!;
  assert.equal(xml.slice(on.start, on.end), b64(png(10, 10)));
});

test('nettoyage : source disparue ou modifiée, liste des tables gardées, temporaires, fichiers étrangers épargnés', async () => {
  const a = setup(directb2s({ on: png(10, 10) }));
  const cache = a.cache;
  const b = { file: path.join(path.dirname(a.table), 'Autre', 'Autre.directb2s') };
  const c = { file: path.join(path.dirname(a.table), 'Troisième', 'Troisième.directb2s') };
  for (const f of [b.file, c.file]) {
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, directb2s({ on: png(20, 20), dmd: png(128, 32) }));
  }
  const ra = await b2sImages(a.file, cache);
  const rb = await b2sImages(b.file, cache);
  const rc = await b2sImages(c.file, cache);
  fs.writeFileSync(path.join(cache, 'lisez-moi.txt'), 'pas à nous');
  const oldTemp = path.join(cache, '0123456789abcdef-01234567.backglass.tmp-1-abc');
  fs.writeFileSync(oldTemp, 'x');
  fs.utimesSync(oldTemp, new Date(0), new Date(0));
  const freshTemp = path.join(cache, '0123456789abcdef-01234567.dmd.tmp-1-abc');
  fs.writeFileSync(freshTemp, 'x');

  assert.deepEqual((await pruneB2sCache(cache)).removed.sort(), [path.basename(oldTemp)]);

  fs.rmSync(b.file);
  const removed = (await pruneB2sCache(cache, [a.file])).removed;
  assert.equal(removed.length, 6, removed.join(', ')); // b et c : fiche, fronton, DMD
  assert.ok(fs.existsSync(ra.backglass!.file));
  for (const image of [rb.backglass, rb.dmd, rc.backglass, rc.dmd]) assert.equal(fs.existsSync(image!.file), false);
  assert.ok(fs.existsSync(path.join(cache, 'lisez-moi.txt')));
  assert.ok(fs.existsSync(freshTemp));
  assert.deepEqual(await pruneB2sCache(path.join(cache, 'absent')), { removed: [] });
});
