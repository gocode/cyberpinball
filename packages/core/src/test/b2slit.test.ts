// Fronton « tout allumé » d'un .directb2s : PNG lus et écrits sans dépendance (png.ts),
// ampoules relevées dans <Illumination>, posées sur l'image allumée et gardées en
// cache (b2sLitImages), copies d'un même .directb2s écartées, propositions de chaque
// fichier du dossier (mediachoices.ts).

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as zlib from 'node:zlib';
import { test } from 'node:test';
import { b2sCacheDir, b2sImages, b2sLitImages, distinctB2sFiles, pruneB2sCache, scanB2s } from '../b2simage';
import { localMediaChoices } from '../mediachoices';
import { decodePng, drawOver, encodePng, resizeRgba, type RgbaImage } from '../png';
import { scanTables } from '../tables';

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-b2slit-'));
}

/** Image unie. */
function solid(width: number, height: number, rgba: [number, number, number, number]): RgbaImage {
  const data = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) data.set(rgba, i * 4);
  return { width, height, data };
}

const pixel = (img: RgbaImage, x: number, y: number) => [...img.data.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 4)];

// ---------------------------------------------------------------------------
// PNG

test('PNG : écrit puis relu à l’identique ; palette, gris et RVB 16 bits lus en RVBA', () => {
  const img = solid(7, 5, [10, 20, 30, 255]);
  img.data.set([200, 100, 50, 128], (2 * 7 + 3) * 4);
  const back = decodePng(encodePng(img))!;
  assert.deepEqual([back.width, back.height], [7, 5]);
  assert.ok(back.data.equals(img.data));

  // PNG écrits à la main : un seul IDAT, filtres « Sub » et « Up » pour vérifier leur inversion.
  const make = (width: number, height: number, depth: number, color: number, rows: number[][], extra: Buffer[] = []) => {
    const crcless = (type: string, body: Buffer) => {
      const head = Buffer.alloc(8);
      head.writeUInt32BE(body.length, 0);
      head.write(type, 4, 'latin1');
      return Buffer.concat([head, body, Buffer.alloc(4)]);
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = depth;
    ihdr[9] = color;
    return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), crcless('IHDR', ihdr), ...extra.map((e, i) => crcless(i === 0 ? 'PLTE' : 'tRNS', e)), crcless('IDAT', zlib.deflateSync(Buffer.from(rows.flat()))), crcless('IEND', Buffer.alloc(0))]);
  };
  // Palette 2 bits : 4 pixels par octet, la couleur 1 transparente.
  const pal = decodePng(make(4, 1, 2, 3, [[0, 0b00011011]], [Buffer.from([255, 0, 0, 0, 255, 0, 0, 0, 255, 9, 9, 9]), Buffer.from([255, 0])]))!;
  assert.deepEqual([pixel(pal, 0, 0), pixel(pal, 1, 0), pixel(pal, 3, 0)], [[255, 0, 0, 255], [0, 255, 0, 0], [9, 9, 9, 255]]);
  // Gris 8 bits, filtre Sub (1) puis Up (2).
  const gray = decodePng(make(2, 2, 8, 0, [[1, 50, 10], [2, 5, 5]]))!;
  assert.deepEqual([pixel(gray, 0, 0)[0], pixel(gray, 1, 0)[0], pixel(gray, 0, 1)[0], pixel(gray, 1, 1)[0]], [50, 60, 55, 65]);
  // RVB 16 bits : l'octet fort de chaque composante.
  const deep = decodePng(make(1, 1, 16, 2, [[0, 0x12, 0x34, 0xab, 0xcd, 0xff, 0x00]]))!;
  assert.deepEqual(pixel(deep, 0, 0), [0x12, 0xab, 0xff, 255]);
  // Ce qui n'est pas un PNG lisible.
  assert.equal(decodePng(Buffer.from('pas une image')), undefined);
  assert.equal(decodePng(make(2, 2, 8, 0, [[9, 0, 0], [0, 0, 0]])), undefined, 'filtre inconnu');
});

test('PNG : agrandissement sans bavure d’une image unie, pose par-dessus coupée aux bords et teintée', () => {
  const big = resizeRgba(solid(2, 2, [40, 80, 120, 255]), 9, 5);
  assert.deepEqual([big.width, big.height], [9, 5]);
  assert.ok([...Array(45).keys()].every((i) => big.data[i * 4] === 40 && big.data[i * 4 + 3] === 255));

  const base = solid(10, 10, [0, 0, 100, 255]);
  drawOver(base, solid(4, 4, [255, 255, 255, 255]), 8, -2);
  assert.deepEqual(pixel(base, 9, 0), [255, 255, 255, 255], 'coin en haut à droite recouvert');
  assert.deepEqual(pixel(base, 9, 2), [0, 0, 100, 255], 'au-delà de la couche : intact');
  drawOver(base, solid(1, 1, [255, 255, 255, 128]), 0, 0, [255, 0, 0]);
  assert.deepEqual(pixel(base, 0, 0), [128, 0, 50, 255], 'lueur blanche teintée en rouge, à moitié transparente');
  drawOver(base, solid(1, 1, [0, 255, 0, 0]), 5, 5);
  assert.deepEqual(pixel(base, 5, 5), [0, 0, 100, 255], 'pixel transparent sans effet');
});

// ---------------------------------------------------------------------------
// .directb2s factice, écrit comme l'éditeur B2S (base64 coupé, sauts de ligne en entités)

const b64 = (data: Buffer) => (data.toString('base64').match(/.{1,76}/g) ?? []).join('&#xD;&#xA;');

interface FakeBulb {
  name: string;
  parent?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  image: RgbaImage;
  snippet?: boolean;
  visible?: boolean;
  color?: string;
  text?: string;
}

function directb2s(on: Buffer | undefined, bulbs: FakeBulb[], dmd?: Buffer): string {
  return [
    '<DirectB2SData Version="1.2">',
    '  <Illumination>',
    ...bulbs.map(
      (b, i) =>
        `    <Bulb Parent="${b.parent ?? 'Backglass'}" ID="${i + 1}" Name="${b.name}" RomID="${i}" RomIDType="2" Intensity="1" LightColor="${b.color ?? '255.255.255'}" Visible="${b.visible === false ? 0 : 1}" LocX="${b.x}" LocY="${b.y}" Width="${b.width}" Height="${b.height}" IsImageSnippit="${b.snippet === false ? 0 : 1}" Image="${b64(encodePng(b.image))}" Text="${b.text ?? ''}" />`,
    ),
    '  </Illumination>',
    '  <Images>',
    on ? `    <BackglassOnImage Value="${b64(on)}" />` : '',
    dmd ? `    <DMDImage Value="${b64(dmd)}" />` : '',
    '  </Images>',
    '</DirectB2SData>',
  ].join('\r\n');
}

function setup(content: string): { root: string; table: string; file: string; cache: string } {
  const root = tmp();
  const table = path.join(root, 'tables', 'Jeu');
  fs.mkdirSync(table, { recursive: true });
  const file = path.join(table, 'Jeu.directb2s');
  fs.writeFileSync(file, content);
  fs.writeFileSync(path.join(table, 'Jeu.vpx'), '');
  return { root, table, file, cache: b2sCacheDir(path.join(root, 'data')) };
}

const BULBS: FakeBulb[] = [
  // Morceau d'image allumée, écrit en 4 × 4 mais posé en 8 × 8.
  { name: 'Flasher &amp; tête', x: 2, y: 2, width: 8, height: 8, image: solid(4, 4, [255, 255, 0, 255]) },
  // Lueur blanche teintée par sa couleur.
  { name: 'Lueur', x: 30, y: 0, width: 4, height: 4, image: solid(4, 4, [255, 255, 255, 255]), snippet: false, color: '0.255.0' },
  { name: 'Éteinte', x: 0, y: 15, width: 5, height: 5, image: solid(5, 5, [255, 255, 255, 255]), visible: false },
  { name: 'Texte', x: 20, y: 15, width: 5, height: 5, image: solid(5, 5, [255, 255, 255, 255]), text: '100' },
  { name: 'Afficheur', parent: 'DMD', x: 0, y: 0, width: 2, height: 2, image: solid(2, 2, [255, 0, 255, 255]) },
];

test('ampoules : relevées dans <Illumination> avec leur place, leur couleur et leur image', async () => {
  const { file } = setup(directb2s(encodePng(solid(40, 20, [0, 0, 80, 255])), BULBS));
  const { bulbs } = await scanB2s(file);
  assert.deepEqual(
    bulbs.map((b) => [b.name, b.parent, b.visible, b.snippet, b.x, b.y, b.width, b.height, b.lightColor?.join('.'), b.text, Boolean(b.image)]),
    [
      ['Flasher & tête', 'Backglass', true, true, 2, 2, 8, 8, '255.255.255', '', true],
      ['Lueur', 'Backglass', true, false, 30, 0, 4, 4, '0.255.0', '', true],
      ['Éteinte', 'Backglass', false, true, 0, 15, 5, 5, '255.255.255', '', true],
      ['Texte', 'Backglass', true, true, 20, 15, 5, 5, '255.255.255', '100', true],
      ['Afficheur', 'DMD', true, true, 0, 0, 2, 2, '255.255.255', '', true],
    ],
  );
});

test('tout allumé : ampoules visibles posées sur l’image allumée et sur l’afficheur, gardé en cache', async () => {
  const { file, cache } = setup(directb2s(encodePng(solid(40, 20, [0, 0, 80, 255])), BULBS, encodePng(solid(16, 4, [10, 10, 10, 255]))));
  const lit = await b2sLitImages(file, cache);
  assert.equal(lit.problems, undefined);
  assert.equal(lit.backglass!.bulbs, 2, 'l’éteinte et celle à texte ne sont pas posées');
  assert.equal(lit.backglass!.base, 'BackglassOnImage');
  const img = decodePng(fs.readFileSync(lit.backglass!.file))!;
  assert.deepEqual([img.width, img.height], [40, 20]);
  assert.deepEqual(pixel(img, 9, 9), [255, 255, 0, 255], 'morceau agrandi à sa taille');
  assert.deepEqual(pixel(img, 10, 10), [0, 0, 80, 255]);
  assert.deepEqual(pixel(img, 31, 1), [0, 255, 0, 255], 'lueur teintée');
  assert.deepEqual(pixel(img, 1, 16), [0, 0, 80, 255], 'ampoule invisible : rien');
  assert.deepEqual(pixel(decodePng(fs.readFileSync(lit.dmd!.file))!, 1, 1), [255, 0, 255, 255]);
  // Le fichier du cache n'est pas à côté de la table, et il est relu tel quel.
  assert.ok(!lit.backglass!.file.startsWith(path.dirname(file)));
  const again = await b2sLitImages(file, cache);
  assert.deepEqual(again, lit);
  // Le .directb2s change : composé de nouveau, l'ancien est retiré à la prochaine extraction.
  fs.writeFileSync(file, directb2s(encodePng(solid(40, 20, [0, 0, 80, 255])), BULBS.slice(0, 1)));
  fs.utimesSync(file, new Date(), new Date(Date.now() + 5000));
  const changed = await b2sLitImages(file, cache);
  assert.equal(changed.backglass!.bulbs, 1);
  assert.equal(changed.dmd, undefined);
  assert.equal(fs.existsSync(lit.backglass!.file), false);
  // Le nettoyage garde ce qui sert, retire tout quand la table disparaît.
  assert.deepEqual((await pruneB2sCache(cache)).removed, []);
  fs.rmSync(file);
  const removed = (await pruneB2sCache(cache)).removed;
  assert.ok(removed.some((n) => n.endsWith('.lit.json')) && removed.some((n) => n.endsWith('.lit-backglass.png')), removed.join(', '));
  assert.deepEqual(fs.readdirSync(cache), []);
});

test('tout allumé : sans ampoule, ou fond qui n’est pas un PNG, rien n’est composé', async () => {
  const none = setup(directb2s(encodePng(solid(8, 8, [0, 0, 0, 255])), []));
  assert.deepEqual(await b2sLitImages(none.file, none.cache), {});
  // Fond JPEG (seul l'en-tête compte pour l'extraction) : les ampoules ne sont pas posées, la raison est dite.
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x08, 0x00, 0x08, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1, 0xff, 0xd9]);
  const j = setup(directb2s(jpeg, BULBS.slice(0, 1)));
  const r = await b2sLitImages(j.file, j.cache);
  assert.equal(r.backglass, undefined);
  assert.match(r.problems!.join(' '), /n'est pas un PNG lisible : ampoules non composées/);
  const absent = await b2sLitImages(path.join(j.table, 'absent.directb2s'), j.cache);
  assert.equal(absent.backglass, undefined);
  assert.match(absent.problems![0]!, /absent\.directb2s est illisible/);
});

// ---------------------------------------------------------------------------
// Second .directb2s du dossier

test('second .directb2s : une copie du même fichier est écartée, un autre fronton est proposé avec son nom', async () => {
  const { root, table, file, cache } = setup(directb2s(encodePng(solid(40, 20, [0, 0, 80, 255])), BULBS.slice(0, 1)));
  const copy = path.join(table, '1492939964_Jeu(Fabricant1990)v1.0.directb2s');
  fs.copyFileSync(file, copy);
  const other = path.join(table, 'Jeu autre fronton.directb2s');
  fs.writeFileSync(other, directb2s(encodePng(solid(30, 20, [90, 0, 0, 255])), []));
  assert.deepEqual(await distinctB2sFiles([file, copy, other, path.join(table, 'absent.directb2s')]), [file, other, path.join(table, 'absent.directb2s')]);

  const source = async (f: string, loaded: boolean) => ({ name: path.basename(f), loaded, images: await b2sImages(f, cache), lit: await b2sLitImages(f, cache) });
  const entry = scanTables(path.join(root, 'tables'))[0]!;
  // Même si la copie arrive jusqu'aux propositions, son image identique n'est montrée qu'une fois.
  const choices = localMediaChoices(entry, { b2s: [await source(copy, false), await source(file, true), await source(other, false)] });
  assert.deepEqual(
    choices.Backglass!.map((c) => c.label),
    [
      'Image allumée du fronton (Jeu.directb2s)',
      'Fronton tout allumé : 1 lampe posée sur l’image (Jeu.directb2s)',
      'Image allumée du fronton (Jeu autre fronton.directb2s, que VPX ne charge pas)',
    ],
  );
  // Un seul .directb2s : pas de nom de fichier dans le libellé.
  const single = localMediaChoices(entry, { b2s: [await source(file, true)] });
  assert.deepEqual(single.Backglass!.map((c) => c.label), ['Image allumée du fronton', 'Fronton tout allumé : 1 lampe posée sur l’image']);
});
