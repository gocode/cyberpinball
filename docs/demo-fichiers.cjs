// Fichiers factices des démonstrations hors écran : .vpx minimal (fichier composé OLE
// avec les stockages TableInfo et GameStg, comme VPX l'écrit) et zip sans compression.

/**
 * .vpx factice : un fichier composé OLE avec le stockage TableInfo (champs en UTF-16LE),
 * et, si on lui en donne, le stockage GameStg (GameData, ImageN : voir vpxGameData et
 * vpxImage), comme VPX l'écrit. Les petits flux vont dans le mini-flux, les gros en
 * secteurs ; la FAT prend autant de secteurs qu'il faut (109 au plus, environ 7 Mo).
 */
function vpxWithInfo(fields, game = {}) {
  const SECTOR = 512;
  const FREE = 0xffffffff;
  const END = 0xfffffffe;
  const infoNames = Object.keys(fields);
  const gameNames = Object.keys(game);
  const data = [...infoNames.map((n) => Buffer.from(fields[n], 'utf16le')), ...gameNames.map((n) => game[n])];
  const gameAt = 2 + infoNames.length;
  const entries = gameAt + (gameNames.length ? 1 + gameNames.length : 0);
  const dirSectors = Math.ceil((entries * 128) / SECTOR);
  const mini = [];
  const miniFat = [];
  const big = [];
  const starts = [];
  let bigSectors = 0;
  for (const d of data) {
    if (d.length < 4096) {
      const first = miniFat.length;
      const count = Math.max(1, Math.ceil(d.length / 64));
      for (let i = 0; i < count; i++) miniFat.push(i === count - 1 ? END : first + i + 1);
      mini.push(Buffer.concat([d, Buffer.alloc(count * 64 - d.length)]));
      starts.push(first);
    } else {
      const count = Math.ceil(d.length / SECTOR);
      starts.push(-1 - bigSectors);
      big.push(Buffer.concat([d, Buffer.alloc(count * SECTOR - d.length)]));
      bigSectors += count;
    }
  }
  const miniStream = Buffer.concat(mini);
  const miniStreamSectors = Math.ceil(miniStream.length / SECTOR);
  const miniFatSectors = Math.max(1, Math.ceil((miniFat.length * 4) / SECTOR));
  // Secteurs : la FAT, puis répertoire, mini-FAT, mini-flux, gros flux.
  const rest = dirSectors + miniFatSectors + miniStreamSectors + bigSectors;
  let fatSectors = 1;
  while (fatSectors * (SECTOR / 4) < fatSectors + rest) fatSectors++;
  if (fatSectors > 109) throw new Error('.vpx factice trop gros (plus de 109 secteurs de FAT)');
  const dirAt = fatSectors;
  const miniFatAt = dirAt + dirSectors;
  const miniStreamAt = miniFatAt + miniFatSectors;
  const bigAt = miniStreamAt + miniStreamSectors;
  const fat = new Array(fatSectors * (SECTOR / 4)).fill(FREE);
  for (let i = 0; i < fatSectors; i++) fat[i] = 0xfffffffd;
  const chain = (start, count) => {
    for (let i = 0; i < count; i++) fat[start + i] = i === count - 1 ? END : start + i + 1;
  };
  chain(dirAt, dirSectors);
  chain(miniFatAt, miniFatSectors);
  chain(miniStreamAt, miniStreamSectors);
  let offset = bigAt;
  for (const b of big) {
    chain(offset, b.length / SECTOR);
    offset += b.length / SECTOR;
  }
  const header = Buffer.alloc(SECTOR);
  Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]).copy(header, 0);
  header.writeUInt16LE(0x3e, 0x18);
  header.writeUInt16LE(3, 0x1a);
  header.writeUInt16LE(0xfffe, 0x1c);
  header.writeUInt16LE(9, 0x1e);
  header.writeUInt16LE(6, 0x20);
  header.writeUInt32LE(fatSectors, 0x2c);
  header.writeUInt32LE(dirAt, 0x30);
  header.writeUInt32LE(4096, 0x38);
  header.writeUInt32LE(miniFatAt, 0x3c);
  header.writeUInt32LE(miniFatSectors, 0x40);
  header.writeUInt32LE(END, 0x44);
  for (let i = 0; i < 109; i++) header.writeUInt32LE(i < fatSectors ? i : FREE, 0x4c + i * 4);
  const dir = Buffer.alloc(dirSectors * SECTOR);
  const entry = (i, name, type, child, right, start, size) => {
    const o = i * 128;
    dir.write(`${name}\0`, o, 'utf16le');
    dir.writeUInt16LE((name.length + 1) * 2, o + 0x40);
    dir[o + 0x42] = type;
    dir[o + 0x43] = 1;
    dir.writeUInt32LE(FREE, o + 0x44);
    dir.writeUInt32LE(right, o + 0x48);
    dir.writeUInt32LE(child, o + 0x4c);
    dir.writeUInt32LE(start, o + 0x74);
    dir.writeUInt32LE(size, o + 0x78);
  };
  const startOf = (i) => (starts[i] < 0 ? bigAt + (-1 - starts[i]) : starts[i]);
  entry(0, 'Root Entry', 5, 1, FREE, miniStream.length ? miniStreamAt : END, miniStream.length);
  entry(1, 'TableInfo', 1, infoNames.length ? 2 : FREE, gameNames.length ? gameAt : FREE, 0, 0);
  infoNames.forEach((n, i) => entry(2 + i, n, 2, FREE, i + 1 < infoNames.length ? 3 + i : FREE, startOf(i), data[i].length));
  if (gameNames.length) {
    entry(gameAt, 'GameStg', 1, gameAt + 1, FREE, 0, 0);
    gameNames.forEach((n, j) => {
      const i = infoNames.length + j;
      entry(gameAt + 1 + j, n, 2, FREE, j + 1 < gameNames.length ? gameAt + 2 + j : FREE, startOf(i), data[i].length);
    });
  }
  for (let i = entries; i < dirSectors * 4; i++) for (const off of [0x44, 0x48, 0x4c]) dir.writeUInt32LE(FREE, i * 128 + off);
  const fatBuf = Buffer.alloc(fatSectors * SECTOR);
  fat.forEach((v, i) => fatBuf.writeUInt32LE(v >>> 0, i * 4));
  const miniFatBuf = Buffer.alloc(miniFatSectors * SECTOR, 0xff);
  miniFat.forEach((v, i) => miniFatBuf.writeUInt32LE(v >>> 0, i * 4));
  return Buffer.concat([header, fatBuf, dir, miniFatBuf, miniStream, Buffer.alloc(miniStreamSectors * SECTOR - miniStream.length), ...big]);
}

/** Enregistrement BIFF de VPX : [longueur][étiquette de 4 lettres][données]. */
function biff(tag, data = Buffer.alloc(0)) {
  const head = Buffer.alloc(8);
  head.writeUInt32LE(4 + data.length, 0);
  head.write(tag, 4, 'latin1');
  return Buffer.concat([head, data]);
}
const biffString = (s) => Buffer.concat([u32(Buffer.byteLength(s)), Buffer.from(s)]);
function u32(v) {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(v, 0);
  return b;
}

/** Flux GameStg/GameData : le nom de l'image du plateau (IMAG). */
function vpxGameData(playfieldImage) {
  return Buffer.concat([biff('IMAG', biffString(playfieldImage)), biff('ENDB')]);
}

/** Flux GameStg/ImageN : nom, dimensions, puis le fichier d'origine (PNG, JPEG) dans un JPEG imbriqué. */
function vpxImage(name, width, height, data) {
  return Buffer.concat([
    biff('NAME', biffString(name)),
    biff('WDTH', u32(width)),
    biff('HGHT', u32(height)),
    biff('JPEG'),
    biff('NAME', biffString(name)),
    biff('PATH', biffString(`${name}.png`)),
    biff('SIZE', u32(data.length)),
    biff('DATA', data),
    biff('ENDB'),
    biff('ENDB'),
  ]);
}

/**
 * .directb2s factice, écrit comme l'éditeur B2S (base64 coupé tous les 76 caractères,
 * sauts de ligne en entités) : image allumée du fronton et ampoules « morceaux d'image »
 * ({ name, x, y, width, height, png }) posées dessus quand elles s'allument.
 */
function directb2s(on, bulbs = []) {
  const b64 = (data) => (data.toString('base64').match(/.{1,76}/g) ?? []).join('&#xD;&#xA;');
  return [
    '<DirectB2SData Version="1.2">',
    '  <Name Value="Fronton factice" />',
    '  <Illumination>',
    ...bulbs.map(
      (b, i) =>
        `    <Bulb Parent="Backglass" ID="${i + 1}" Name="${b.name}" RomID="${19 + i}" RomIDType="2" Intensity="1" LightColor="255.254.232" Visible="1" LocX="${b.x}" LocY="${b.y}" Width="${b.width}" Height="${b.height}" IsImageSnippit="1" Image="${b64(b.png)}" Text="" />`,
    ),
    '  </Illumination>',
    '  <Images>',
    `    <BackglassOnImage RomID="2" RomIDType="3" Value="${b64(on)}" FileName="on.png" />`,
    '  </Images>',
    '</DirectB2SData>',
  ].join('\r\n');
}

/** CRC-32 (zip). */
function crc32(buf) {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}

/** Zip « stocké » (sans compression), assez pour tar.exe et l'import : { nom: contenu }. */
function zipStored(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content);
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    locals.push(local, nameBuf, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const dir = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, dir, end]);
}

module.exports = { directb2s, vpxWithInfo, vpxGameData, vpxImage, zipStored };
