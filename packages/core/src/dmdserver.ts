// Image du menu sur le DMD réel (bêta) par dmdserver, le serveur de libdmdutil : un seul programme
// tient le matériel (un port série ou un périphérique libusb n'a qu'un propriétaire), le menu et VPX
// lui envoient leurs images par le réseau local. Protocole lu dans libdmdutil (src/DMDServer.cpp,
// include/DMDUtil/DMD.h) au commit 3485e2e qu'épingle VPX 10.8.1, identique à la version 0.11.0
// publiée pour ce qu'en envoient le menu (RGB24) et le plugin DMDUtil de VPX (RGB24, RGB16) :
// - chaque image : un en-tête « DMDStream » de 25 octets, sans remplissage (#pragma pack(1)), les
//   nombres dans l'ordre du réseau (htonl, htons), puis width × height × 3 octets RGB ;
// - le serveur donne l'afficheur au client le plus récent ; au début d'une partie, VPX lui demande
//   de couper les autres (nouvelle ROM). Le menu se déconnecte donc avant de lancer VPX et se
//   reconnecte au retour ; déconnecté, il rend l'afficheur au client précédent, ou le noircit.

import { DMD_HEIGHT, DMD_WIDTH, type DmdColors, type DmdDots } from './livedmd';
import { t } from './i18n';
import { detectHardwareDmds, hardwareDmdChoice, hardwareDmdDriverProblem, type HardwareDmdSetup } from './dmd';
import type { ObservedUsbDevice } from './model';
import type { VpxSetting } from './vpx';

/** Port de dmdserver (DMDServerPort de VPX, Port de dmdserver.ini). */
export const DMDSERVER_PORT = 6789;
/** Le serveur n'écoute que la borne elle-même : rien n'arrive du réseau. */
export const DMDSERVER_ADDR = '127.0.0.1';

/** DMD::Mode (include/DMDUtil/DMD.h). */
const MODE_RGB24 = 2;
/** sizeof(DMD::StreamHeader) : char[10], uint8, int, uint16, uint16, uint8, uint8, uint32. */
export const DMDSTREAM_HEADER_SIZE = 25;

/** En-tête d'une image RGB24 pour dmdserver. */
export function dmdStreamHeader(width: number, height: number, length = width * height * 3): Buffer {
  const b = Buffer.alloc(DMDSTREAM_HEADER_SIZE);
  b.write('DMDStream', 0, 'latin1'); // char header[10], fini par un zéro
  b.writeUInt8(1, 10); // version
  b.writeInt32BE(MODE_RGB24, 11); // mode, htonl
  b.writeUInt16BE(width, 15);
  b.writeUInt16BE(height, 17);
  b.writeUInt8(0, 19); // buffered : non, le serveur noircit l'afficheur quand le menu se déconnecte
  b.writeUInt8(0, 20); // disconnectOthers : jamais, c'est VPX qui prend la main en partie
  b.writeUInt32BE(length, 21);
  return b;
}

/** Lecture d'un en-tête, comme DMDServer::ClientThread (essais). */
export function parseDmdStreamHeader(b: Buffer): { header: string; version: number; mode: number; width: number; height: number; buffered: number; disconnectOthers: number; length: number } {
  return {
    header: b.toString('latin1', 0, 10).replace(/\0.*$/s, ''),
    version: b.readUInt8(10),
    mode: b.readInt32BE(11),
    width: b.readUInt16BE(15),
    height: b.readUInt16BE(17),
    buffered: b.readUInt8(19),
    disconnectOthers: b.readUInt8(20),
    length: b.readUInt32BE(21),
  };
}

/** Éclat de chaque nuance, la courbe de l'écran (app/renderer/fallback.js, LEVELS_16). */
const LEVELS_16 = Array.from({ length: 16 }, (_, v) => (v ? 0.12 + 0.88 * Math.pow(v / 15, 1.6) : 0));

function hexRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const n = m ? parseInt(m[1]!, 16) : 0x8be23a; // vert signal
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Une image du DMD du menu en RGB pour le DMD réel : la même courbe que l'écran, mais un point
 * éteint est noir (l'écran le montre gris foncé pour imiter le verre ; une LED éteinte ne luit pas).
 * colors : la couleur propre de chaque point (visualiseur du Juke-box), sinon la couleur réglée.
 */
export function dmdRgb24(dots: DmdDots, color: string, colors?: DmdColors): Buffer {
  const out = Buffer.alloc(DMD_WIDTH * DMD_HEIGHT * 3);
  const [r, g, b] = hexRgb(color);
  const own = colors && colors.length === dots.length * 3 ? colors : undefined;
  for (let i = 0; i < DMD_WIDTH * DMD_HEIGHT; i++) {
    const f = LEVELS_16[Math.min(15, dots[i] ?? 0)]!;
    if (!f) continue;
    out[i * 3] = Math.round((own ? own[i * 3]! : r) * f);
    out[i * 3 + 1] = Math.round((own ? own[i * 3 + 1]! : g) * f);
    out[i * 3 + 2] = Math.round((own ? own[i * 3 + 2]! : b) * f);
  }
  return out;
}

/** Une image complète à écrire sur la connexion : en-tête puis points. */
export function dmdServerFrame(dots: DmdDots, color: string, colors?: DmdColors): Buffer {
  const rgb = dmdRgb24(dots, color, colors);
  return Buffer.concat([dmdStreamHeader(DMD_WIDTH, DMD_HEIGHT, rgb.length), rgb]);
}

/**
 * Le module DMD de la version de VPX que Cyber Pinball installe (dmdutil64.dll de VPX 10.8.1-5436,
 * libdmdutil 3485e2e) ne pilote aucun PIN2DMD : son code PIN2DMD est sous DMDUTIL_ENABLE_PIN2DMD, que
 * son CMakeLists.txt ne définit jamais, et la DLL n'appelle jamais libusb (relevé dans le binaire). Seul
 * cyberpinball-dmdserver pilote donc la carte (packages/dmdserver/src/pin2dmd.h), dans le front-end comme
 * en partie (VPX lui envoie ses images, DMDServer = 1). Même fait que la colonne pin2dmd de
 * packages/dmdserver/src/empreintes.h pour cette version de VPX (vérifié par dmdserver.test.ts).
 */
export const PIN2DMD_ONLY_THROUGH_SERVER = true;

function modelOn(devices: ObservedUsbDevice[], setup: HardwareDmdSetup | undefined, model: 'ZeDMD' | 'PIN2DMD' | 'Pixelcade'): boolean {
  const choice = hardwareDmdChoice(setup, model);
  return choice === 'on' || (choice === 'auto' && detectHardwareDmds(devices).some((d) => d.model === model));
}

/** Un PIN2DMD est allumé (reconnu en USB, ou forcé) et seul le serveur du DMD sait le piloter. */
export function dmdServerDrivesPin2dmd(devices: ObservedUsbDevice[], setup: HardwareDmdSetup | undefined): boolean {
  return PIN2DMD_ONLY_THROUGH_SERVER && modelOn(devices, setup, 'PIN2DMD');
}

/**
 * Le serveur du DMD doit-il tourner ? Avec « Image du front-end : oui » et au moins un DMD allumé
 * (reconnu en USB, automatique ou oui, forcé, ou en wifi) ; et toujours pour un PIN2DMD allumé, que
 * VPX ne sait pas piloter lui-même (PIN2DMD_ONLY_THROUGH_SERVER), même sans l'image du front-end.
 */
export function dmdServerWanted(devices: ObservedUsbDevice[], setup: HardwareDmdSetup | undefined): boolean {
  if (dmdServerDrivesPin2dmd(devices, setup)) return true;
  if (!setup?.menu) return false;
  if (setup.zedmdWifi?.enabled) return true;
  return (['ZeDMD', 'PIN2DMD', 'Pixelcade'] as const).some((m) => modelOn(devices, setup, m));
}

/**
 * Le serveur n'a trouvé aucun afficheur dans le délai (app/src/dmd-server.ts, FIND_TIMEOUT_MS) : il est
 * arrêté, VPX ouvre le DMD lui-même. Dit à l'écran « DMD réel » (« … ; VPX ouvre le DMD lui-même pendant
 * les parties ») et dans la Santé. La cause, quand elle est connue (pilote, sonde du PIN2DMD : nom refusé,
 * carte prise…), est déjà dite à part, juste à côté ; sinon, demander un rapport.
 */
export function dmdServerNotFoundProblem(devices: ObservedUsbDevice[], setup: HardwareDmdSetup | undefined, seconds: number): string {
  const known = detectHardwareDmds(devices).some((d) => hardwareDmdChoice(setup, d.model) !== 'off' && hardwareDmdDriverProblem(d));
  return known
    ? t('Le serveur du DMD ne trouve pas l’afficheur (aucune réponse en {seconds} s)', { seconds })
    : t('Le serveur du DMD ne trouve pas l’afficheur (aucune réponse en {seconds} s), sans cause trouvée : envoyez un rapport (Menu système > Cyber Pinball > Retours et propositions)', { seconds });
}

/**
 * dmdserver.ini d'après les choix de « DMD réel » : le serveur n'ouvre que les DMD allumés, comme
 * VPX en direct ; il n'écoute que la borne ; la colorisation reste à VPX (ses images arrivent déjà en
 * couleur), et le serveur ne cherche pas de vidéos PuP.
 */
export function dmdServerIni(devices: ObservedUsbDevice[], setup: HardwareDmdSetup | undefined): string {
  // Sans « Image du front-end », le serveur ne tourne que pour le PIN2DMD : il n'ouvre que lui.
  const onlyPin2dmd = !setup?.menu;
  const on = (m: 'ZeDMD' | 'PIN2DMD' | 'Pixelcade') => ((!onlyPin2dmd || m === 'PIN2DMD') && modelOn(devices, setup, m) ? 1 : 0);
  const wifi = !onlyPin2dmd && setup?.zedmdWifi?.enabled ? setup.zedmdWifi.address.trim() : '';
  return [
    `; ${t('Écrit par Cyber Pinball (Menu système > Borne > DMD > DMD réel) : réécrit à chaque lancement du serveur.')}`,
    '[DMDServer]',
    `Addr = ${DMDSERVER_ADDR}`,
    `Port = ${DMDSERVER_PORT}`,
    'AltColor = 0',
    'AltColorPath =',
    'PUPCapture = 0',
    'SerumPUPTriggers = 0',
    'PUPVideosPath =',
    'PUPExactColorMatch = 1',
    '',
    '[ZeDMD]',
    `Enabled = ${on('ZeDMD')}`,
    'Device =',
    'Debug = 0',
    'RGBOrder = -1',
    'Brightness = -1',
    'SaveSettings = 0',
    '',
    '[ZeDMD-WiFi]',
    `Enabled = ${wifi ? 1 : 0}`,
    `WiFiAddr = ${wifi}`,
    '',
    '[ZeDMD-SPI]',
    'Enabled = 0',
    '',
    '[Pixelcade]',
    `Enabled = ${on('Pixelcade')}`,
    'Device =',
    '',
    '[PIN2DMD]',
    `Enabled = ${on('PIN2DMD')}`,
    '',
  ].join('\r\n');
}

/**
 * [Plugin.DMDUtil] quand dmdserver tient le DMD : VPX lui envoie ses images et n'ouvre plus le
 * matériel lui-même (deux propriétaires pour un port, et le DMD resterait noir).
 */
export function vpxDmdServerSettings(): VpxSetting[] {
  const s = (key: string, value: string): VpxSetting => ({ section: 'Plugin.DMDUtil', key, value });
  return [
    s('Enable', '1'),
    s('DMDServer', '1'),
    s('DMDServerAddr', DMDSERVER_ADDR),
    s('DMDServerPort', String(DMDSERVER_PORT)),
    s('ZeDMD', '0'),
    s('PIN2DMD', '0'),
    s('Pixelcade', '0'),
    s('ZeDMDWiFiEnabled', '0'),
  ];
}
