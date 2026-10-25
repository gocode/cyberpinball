import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Cabinet, EdidInfo, ObservedDisplay, Rect } from '../model';

/** Construit un EDID de base valide (128 octets) avec les champs utiles aux tests. */
export function makeEdid(opts: {
  manufacturer: string;
  productCode: number;
  serialNumber?: number;
  serialText?: string;
  monitorName?: string;
  widthCm: number;
  heightCm: number;
  imageMm?: { width: number; height: number };
}): Uint8Array {
  const b = new Uint8Array(128);
  b.set([0x00, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x00], 0);
  const [c1, c2, c3] = [...opts.manufacturer].map((c) => c.charCodeAt(0) - 64) as [number, number, number];
  const packed = (c1 << 10) | (c2 << 5) | c3;
  b[8] = packed >> 8;
  b[9] = packed & 0xff;
  b[10] = opts.productCode & 0xff;
  b[11] = opts.productCode >> 8;
  const serial = opts.serialNumber ?? 0;
  b[12] = serial & 0xff;
  b[13] = (serial >> 8) & 0xff;
  b[14] = (serial >> 16) & 0xff;
  b[15] = (serial >>> 24) & 0xff;
  b[21] = opts.widthCm;
  b[22] = opts.heightCm;
  // Le premier descripteur (offset 54) est normalement un timing ; on le laisse non nul.
  b[54] = 0x01;
  if (opts.imageMm) {
    b[66] = opts.imageMm.width & 0xff;
    b[67] = opts.imageMm.height & 0xff;
    b[68] = ((opts.imageMm.width >> 8) << 4) | (opts.imageMm.height >> 8);
  }
  const writeText = (offset: number, tag: number, text: string) => {
    b[offset + 3] = tag;
    const bytes = [...text].map((c) => c.charCodeAt(0));
    if (bytes.length < 13) bytes.push(0x0a);
    while (bytes.length < 13) bytes.push(0x20);
    b.set(bytes.slice(0, 13), offset + 5);
  };
  if (opts.serialText) writeText(72, 0xff, opts.serialText);
  if (opts.monitorName) writeText(90, 0xfc, opts.monitorName);
  return b;
}

export function display(
  gdiName: string,
  friendlyName: string,
  bounds: Rect,
  edid: EdidInfo | undefined,
  instance: string,
): ObservedDisplay {
  const model = edid ? `${edid.manufacturer}${edid.productCode.toString(16).toUpperCase().padStart(4, '0')}` : 'Default_Monitor';
  return {
    gdiName,
    friendlyName,
    monitorDescription: 'Generic PnP Monitor',
    devicePath: `\\\\?\\DISPLAY#${model}#${instance}#{e6f07b5f-ee97-4a90-b076-33f57bf4eaa7}`,
    bounds,
    rotation: 0,
    primary: bounds.x === 0 && bounds.y === 0,
    scale: 1,
    edid,
  };
}

const SAM: EdidInfo = { manufacturer: 'SAM', productCode: 0x0c8d, serialNumber: 0, serialText: 'H4LN301501', monitorName: 'S22E450', widthCm: 48, heightCm: 27 };
const IVM: EdidInfo = { manufacturer: 'IVM', productCode: 0x564c, serialNumber: 0, serialText: '1206923502001', monitorName: 'PLX2283HSU', widthCm: 48, heightCm: 26 };
const PHL: EdidInfo = { manufacturer: 'PHL', productCode: 0xc032, serialNumber: 0, serialText: 'AU40939005076', monitorName: 'Philips 192E', widthCm: 41, heightCm: 23 };
const AUO: EdidInfo = { manufacturer: 'AUO', productCode: 0x139d, serialNumber: 0, widthCm: 38, heightCm: 21 };

/** Les quatre écrans du PC de développement, tels que relevés le 19 octobre 2026. */
export function devPcDisplays(): ObservedDisplay[] {
  return [
    display('\\\\.\\DISPLAY14', 'S22E450', { x: -1920, y: 0, width: 1920, height: 1080 }, SAM, '8&20834467&0&UID257'),
    display('\\\\.\\DISPLAY1', '', { x: 0, y: 0, width: 1920, height: 1080 }, AUO, '5&253a7f23&0&UID4357'),
    display('\\\\.\\DISPLAY12', 'Philips 192E', { x: 288, y: -768, width: 1366, height: 768 }, PHL, '7&4b6b2ff&0&UID256'),
    display('\\\\.\\DISPLAY13', 'PLX2283HSU', { x: 1920, y: 0, width: 1920, height: 1080 }, IVM, '8&20834467&0&UID256'),
  ];
}

export function emptyCabinet(): Cabinet {
  return { version: 1, screens: [], roles: {}, vpx: { iniPath: 'VPinballX.ini' }, updatedAt: '' };
}

const DEL: EdidInfo = { manufacturer: 'DEL', productCode: 0xa0c4, serialNumber: 0, serialText: 'CN0J2X4F7426', monitorName: 'DELL P2422H', widthCm: 53, heightCm: 30 };
const BNQ: EdidInfo = { manufacturer: 'BNQ', productCode: 0x7f53, serialNumber: 0, serialText: 'ETR7M01234SL0', monitorName: 'BenQ GW2480', widthCm: 53, heightCm: 30 };

/**
 * L'autre poste de l'utilisateur : le même écran principal (l'AUO intégré, empreinte
 * faible, même port) et deux écrans à numéro de série qui ne sont pas ceux du PC de développement.
 */
export function secondDeskDisplays(): ObservedDisplay[] {
  return [
    display('\\.\DISPLAY1', '', { x: 0, y: 0, width: 1920, height: 1080 }, AUO, '5&253a7f23&0&UID4357'),
    display('\\.\DISPLAY5', 'DELL P2422H', { x: 1920, y: 0, width: 1920, height: 1080 }, DEL, '8&1a2b3c4d&0&UID260'),
    display('\\.\DISPLAY6', 'BenQ GW2480', { x: 3840, y: 0, width: 1920, height: 1080 }, BNQ, '8&1a2b3c4d&0&UID261'),
  ];
}

const TV: EdidInfo = { manufacturer: 'SAM', productCode: 0x7121, serialNumber: 0x01010101, monitorName: 'SAMSUNG', widthCm: 95, heightCm: 54 };
const LG: EdidInfo = { manufacturer: 'GSM', productCode: 0x5b7f, serialNumber: 0, serialText: '205NTRL3H912', monitorName: 'LG FULL HD', widthCm: 70, heightCm: 39 };
const DMD: EdidInfo = { manufacturer: 'HSD', productCode: 0x0b2c, serialNumber: 0x00a1b2c3, monitorName: 'LCD 12.3', widthCm: 29, heightCm: 11 };

/** Borne typique : téléviseur 43″ sans numéro de série (playfield, principal), backglass 32″, écran DMD 12,3″. */
export function cabinetDisplays(): ObservedDisplay[] {
  return [
    display('\\.\DISPLAY1', 'SAMSUNG', { x: 0, y: 0, width: 3840, height: 2160 }, TV, '4&2f0e1c&0&UID4352'),
    display('\\.\DISPLAY2', 'LG FULL HD', { x: 3840, y: 0, width: 1920, height: 1080 }, LG, '4&2f0e1c&0&UID4353'),
    display('\\.\DISPLAY3', 'LCD 12.3', { x: 5760, y: 0, width: 1920, height: 720 }, DMD, '4&2f0e1c&0&UID4354'),
  ];
}

/**
 * Pack de Star Trek LE (Stern 2013), tel qu'installé sur la borne de développement : trois
 * options, aucune n'a d'écran DMD (1) ni FullDMD (5). L'écran 13 « BGdmdText » est un encart
 * posé sur le backglass (26 %, 79 %, 48 % × 21 %) : éteint, il attend le DMD (option 1) ;
 * allumé, il montre les animations DMD du pack (option 3) ; l'option 2 y met le topper.
 */
export function starTrekPack(root: string): void {
  const lines = (dmdText: string, topper: string, topper2: string) =>
    [
      'ScreenNum,ScreenDes,PlayList,PlayFile,Loopit,Active,Priority,CustomPos',
      '11,backglassunderlay,bgumain,bgmain.mp4,0,ForceBack,,"2,0,0,100,100"',
      '14,Backglassvideo,bg,,0,ForceBack,,"2,4,6,92,70.4"',
      '12,otherbackglass,,,0,ForcePopBack,,"2,4,6,92,70.4"',
      `13,BGdmdText,dmd,dmdmain.mp4,0,${dmdText},,"2,26,79,48,21"`,
      topper,
      topper2,
      '4,Music,musikmain,,0,MusicOnly,90,',
      '2,PuPOverlays,,,0,ForceOn,,',
      '7,transbg,,,1,ForcePop,,',
      '',
    ].join('\r\n');
  const options: [string, string][] = [
    ['Option 1 - DMD on BG No Topper', lines('off', '0,Topper,topper,topperlogo.mp4,0,off,0,', '15,Other2/Topper2,,,0,off,,"0,0,0,100,100"')],
    ['Option 2 - Topper on BG No DMD', lines('off', '0,Topper,topper,topperlogo.mp4,0,show,0,"2,26,79,48,21"', '15,Other2/Topper2,,,0,ForcePop,,"2,26,79,48,21"')],
    ['Option 3 - BG and Topper Seperate', lines('ForceBack', '0,Topper,topper,topperlogo.mp4,0,show,0,', '15,Other2/Topper2,,,0,ForcePopBack,,"0,0,0,100,100"')],
  ];
  for (const [name, screens] of options) {
    fs.mkdirSync(path.join(root, 'PuP-Pack_Options', name), { recursive: true });
    fs.writeFileSync(path.join(root, 'PuP-Pack_Options', name, 'screens.pup'), screens);
    fs.writeFileSync(path.join(root, 'PuP-Pack_Options', name, 'triggers.pup'), 'triggers');
    fs.writeFileSync(path.join(root, `${name}.bat`), `rem echo off\r\nxcopy /y "PuP-Pack_Options\\${name}\\*.pup"\r\n`);
  }
  // Option 1 appliquée à la racine, comme sur la borne.
  for (const f of ['screens.pup', 'triggers.pup']) fs.copyFileSync(path.join(root, 'PuP-Pack_Options', options[0]![0], f), path.join(root, f));
}

// ---------------------------------------------------------------------------
// Fichier composé OLE minimal, comme VPX en écrit : TableInfo et ses flux UTF-16LE, et
// GameStg (GameData, ImageN) si on lui en donne.

export function cfb(streams: Record<string, string | Buffer>, game: Record<string, Buffer> = {}): Buffer {
  const SECTOR = 512;
  const FREE = 0xffffffff;
  const END = 0xfffffffe;
  const FATSECT = 0xfffffffd;
  const infoNames = Object.keys(streams);
  const gameNames = Object.keys(game);
  const names = [...infoNames, ...gameNames];
  const data = [
    ...infoNames.map((n) => {
      const v = streams[n]!;
      return Buffer.isBuffer(v) ? v : Buffer.from(v, 'utf16le');
    }),
    ...gameNames.map((n) => game[n]!),
  ];
  // Entrées : racine, TableInfo et ses flux, puis GameStg et ses flux (les petits dans le mini-flux, les gros en secteurs).
  const gameAt = 2 + infoNames.length;
  const entries = gameAt + (gameNames.length ? 1 + gameNames.length : 0);
  const dirSectors = Math.ceil((entries * 128) / SECTOR);
  const mini: Buffer[] = [];
  const miniFat: number[] = [];
  const big: Buffer[] = [];
  const starts: number[] = [];
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
  // Secteurs : 0 FAT, puis répertoire, mini-FAT, mini-flux, gros flux.
  const dirAt = 1;
  const miniFatAt = dirAt + dirSectors;
  const miniStreamAt = miniFatAt + miniFatSectors;
  const bigAt = miniStreamAt + miniStreamSectors;
  const total = bigAt + bigSectors;
  const fat = new Array<number>(SECTOR / 4).fill(FREE);
  fat[0] = FATSECT;
  const chain = (start: number, count: number) => {
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
  assert.ok(total <= SECTOR / 4, 'une seule FAT suffit pour ce test');

  const header = Buffer.alloc(SECTOR);
  Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]).copy(header, 0);
  header.writeUInt16LE(0x3e, 0x18);
  header.writeUInt16LE(3, 0x1a);
  header.writeUInt16LE(0xfffe, 0x1c);
  header.writeUInt16LE(9, 0x1e);
  header.writeUInt16LE(6, 0x20);
  header.writeUInt32LE(1, 0x2c);
  header.writeUInt32LE(dirAt, 0x30);
  header.writeUInt32LE(4096, 0x38);
  header.writeUInt32LE(miniFatAt, 0x3c);
  header.writeUInt32LE(miniFatSectors, 0x40);
  header.writeUInt32LE(END, 0x44);
  for (let i = 0; i < 109; i++) header.writeUInt32LE(i === 0 ? 0 : FREE, 0x4c + i * 4);

  const dir = Buffer.alloc(dirSectors * SECTOR);
  const entry = (i: number, name: string, type: number, child: number, right: number, start: number, size: number) => {
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
  entry(0, 'Root Entry', 5, 1, FREE, miniStream.length ? miniStreamAt : END, miniStream.length);
  entry(1, 'TableInfo', 1, infoNames.length ? 2 : FREE, gameNames.length ? gameAt : FREE, 0, 0);
  const startOf = (i: number) => (starts[i]! < 0 ? bigAt + (-1 - starts[i]!) : starts[i]!);
  infoNames.forEach((n, i) => entry(2 + i, n, 2, FREE, i + 1 < infoNames.length ? 3 + i : FREE, startOf(i), data[i]!.length));
  if (gameNames.length) {
    entry(gameAt, 'GameStg', 1, gameAt + 1, FREE, 0, 0);
    gameNames.forEach((n, j) => {
      const i = infoNames.length + j;
      entry(gameAt + 1 + j, n, 2, FREE, j + 1 < gameNames.length ? gameAt + 2 + j : FREE, startOf(i), data[i]!.length);
    });
  }
  for (let i = entries; i < dirSectors * 4; i++) {
    dir.writeUInt32LE(FREE, i * 128 + 0x44);
    dir.writeUInt32LE(FREE, i * 128 + 0x48);
    dir.writeUInt32LE(FREE, i * 128 + 0x4c);
  }
  const fatBuf = Buffer.alloc(SECTOR);
  fat.forEach((v, i) => fatBuf.writeUInt32LE(v >>> 0, i * 4));
  const miniFatBuf = Buffer.alloc(miniFatSectors * SECTOR, 0xff);
  miniFat.forEach((v, i) => miniFatBuf.writeUInt32LE(v >>> 0, i * 4));
  return Buffer.concat([header, fatBuf, dir, miniFatBuf, Buffer.concat([miniStream, Buffer.alloc(miniStreamSectors * SECTOR - miniStream.length)]), ...big]);
}

// Enregistrements BIFF de VPX : [longueur][étiquette][données], chaînes [longueur][octets].
export const biff = (tag: string, data: Buffer = Buffer.alloc(0)) => {
  const head = Buffer.alloc(8);
  head.writeUInt32LE(4 + data.length, 0);
  head.write(tag, 4, 'latin1');
  return Buffer.concat([head, data]);
};
export const biffStr = (s: string) => {
  const n = Buffer.alloc(4);
  n.writeUInt32LE(Buffer.byteLength(s), 0);
  return Buffer.concat([n, Buffer.from(s)]);
};
export const u32 = (v: number) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(v, 0);
  return b;
};

/**
 * .vpx minimal dont GameStg/GameData porte ce script, comme VPX l'écrit : l'enregistrement
 * CODE (longueur 4), puis la longueur du texte et le texte. `protectedScript` : un
 * enregistrement SECB qui marque le script comme protégé (chiffré).
 */
export function vpxWithScript(script: string, protectedScript = false): Buffer {
  const secb = Buffer.alloc(52);
  secb.writeUInt32LE(0x00000002, 32);
  const text = Buffer.from(script, 'latin1');
  const gameData = Buffer.concat([...(protectedScript ? [biff('SECB', secb)] : []), biff('NAME', biffStr('Table1')), biff('CODE'), u32(text.length), text, biff('ENDB')]);
  return cfb({ TableName: 'Table' }, { GameData: gameData });
}
