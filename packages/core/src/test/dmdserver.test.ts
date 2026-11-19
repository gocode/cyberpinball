// Image du menu sur le DMD réel (bêta) : le protocole de dmdserver (libdmdutil, DMDServer.cpp et
// DMD.h au commit 3485e2e épinglé par VPX 10.8.1), dmdserver.ini d'après les choix, [Plugin.DMDUtil]
// en mode serveur, et le client du menu (app/src/dmd-server.ts) face à un faux serveur qui lit les
// images exactement comme DMDServer::ClientThread : 25 octets d'en-tête, puis length octets.

import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as path from 'node:path';
import { test } from 'node:test';
import { hardwareDmdFacts, vpxDmdSettings } from '../dmd';
import {
  DMDSTREAM_HEADER_SIZE,
  dmdRgb24,
  dmdServerDrivesPin2dmd,
  dmdServerFrame,
  dmdServerIni,
  dmdServerNotFoundProblem,
  dmdServerWanted,
  dmdStreamHeader,
  parseDmdStreamHeader,
  PIN2DMD_ONLY_THROUGH_SERVER,
} from '../dmdserver';
import { setLanguage } from '../i18n';
import { DMD_HEIGHT, DMD_WIDTH } from '../livedmd';
import type { ObservedUsbDevice } from '../model';
import { REPO_ROOT } from './i18n-scan';

const usb = (instanceId: string, extra: Partial<ObservedUsbDevice> = {}): ObservedUsbDevice => {
  const m = /VID_([0-9A-F]{4})&PID_([0-9A-F]{4})/i.exec(instanceId)!;
  return { instanceId, vid: parseInt(m[1]!, 16), pid: parseInt(m[2]!, 16), ...extra };
};
const PIN2DMD = usb('USB\\VID_0314&PID_E457\\5&1&0&2', { service: 'WinUSB' });
const ZEDMD = usb('USB\\VID_303A&PID_1001\\DC:54:75:C1:2A:30', { port: 'COM5', service: 'usbser' });

test('dmdserver : en-tête DMDStream de 25 octets, nombres dans l’ordre du réseau', () => {
  const h = dmdStreamHeader(128, 32);
  assert.equal(h.length, DMDSTREAM_HEADER_SIZE);
  // char header[10] = "DMDStream" (9 lettres et le zéro final), comme strcmp côté serveur.
  assert.equal(h.toString('latin1', 0, 10), 'DMDStream\0');
  assert.equal(h[10], 1, 'version 1, la seule que le serveur accepte');
  assert.deepEqual([...h.subarray(11, 15)], [0, 0, 0, 2], 'mode RGB24 = 2, htonl');
  assert.deepEqual([...h.subarray(15, 19)], [0, 128, 0, 32], 'largeur et hauteur, htons');
  assert.equal(h[19], 0, 'non mis en mémoire : le serveur noircit l’afficheur au départ du menu');
  assert.equal(h[20], 0, 'le menu ne coupe jamais les autres clients');
  assert.equal(h.readUInt32BE(21), 128 * 32 * 3);
  assert.deepEqual(parseDmdStreamHeader(h), { header: 'DMDStream', version: 1, mode: 2, width: 128, height: 32, buffered: 0, disconnectOthers: 0, length: 12288 });
});

test('dmdserver : les nuances du DMD du menu en RGB, point éteint noir', () => {
  const dots = new Uint8Array(DMD_WIDTH * DMD_HEIGHT);
  dots[0] = 15;
  dots[1] = 8;
  const rgb = dmdRgb24(dots, '#ff8a1f');
  assert.equal(rgb.length, DMD_WIDTH * DMD_HEIGHT * 3);
  assert.deepEqual([...rgb.subarray(0, 3)], [255, 138, 31], 'plein éclat : la couleur réglée');
  const half = [...rgb.subarray(3, 6)];
  assert.ok(half[0]! > 0 && half[0]! < 255, 'nuance intermédiaire');
  assert.deepEqual([...rgb.subarray(6, 9)], [0, 0, 0], 'éteint : noir, pas le gris de l’écran');
  // Couleurs propres (visualiseur du Juke-box) : elles remplacent la couleur réglée.
  const own = new Uint8Array(DMD_WIDTH * DMD_HEIGHT * 3);
  own.set([10, 200, 250], 0);
  assert.deepEqual([...dmdRgb24(dots, '#ff8a1f', own).subarray(0, 3)], [10, 200, 250]);
  const frame = dmdServerFrame(dots, '#ff8a1f');
  assert.equal(frame.length, DMDSTREAM_HEADER_SIZE + 128 * 32 * 3);
});

test('dmdserver : lancé seulement avec « Image du menu » et un DMD allumé ; son ini suit les choix', () => {
  setLanguage('fr');
  assert.equal(dmdServerWanted([ZEDMD], undefined), false, 'sans le choix, VPX garde le ZeDMD en direct');
  assert.equal(dmdServerWanted([PIN2DMD], { menu: true }), true);
  assert.equal(dmdServerWanted([], { menu: true }), false, 'rien de branché : pas de serveur');
  assert.equal(dmdServerWanted([PIN2DMD], { menu: true, models: { PIN2DMD: 'off' } }), false);
  assert.equal(dmdServerWanted([], { menu: true, zedmdWifi: { enabled: true, address: 'zedmd-wifi.local' } }), true);
  const ini = dmdServerIni([PIN2DMD, ZEDMD], { menu: true, models: { ZeDMD: 'off' } });
  assert.match(ini, /\[DMDServer\]\r\nAddr = 127\.0\.0\.1\r\nPort = 6789/);
  assert.match(ini, /\[ZeDMD\]\r\nEnabled = 0/);
  assert.match(ini, /\[PIN2DMD\]\r\nEnabled = 1/);
  assert.match(ini, /\[Pixelcade\]\r\nEnabled = 0/);
  assert.match(ini, /AltColor = 0/, 'VPX envoie ses images déjà en couleur');
  assert.match(dmdServerIni([], { menu: true, zedmdWifi: { enabled: true, address: '192.168.1.50' } }), /\[ZeDMD-WiFi\]\r\nEnabled = 1\r\nWiFiAddr = 192\.168\.1\.50/);
});

// Borne d'un joueur (19/11/2026, rapport OLHIA6EE-L) : PIN2DMD noir alors que la sonde l'ouvrait, le
// nommait « PIN2DMD » et le relâchait sans erreur. Le dmdutil64.dll de VPX 10.8.1-5436 n'a pas de code
// PIN2DMD (DMDUTIL_ENABLE_PIN2DMD jamais défini par libdmdutil 3485e2e, aucun appel à libusb dans le
// binaire). Invariant : un PIN2DMD allumé passe toujours par le serveur, qui le pilote lui-même, même sans
// l'image du front-end ; et VPX ne garde jamais un DMDServer = 1 d'une partie précédente quand le serveur
// ne répond pas.
test('PIN2DMD : toujours par le serveur du DMD, que le module DMD de VPX ne sait pas le piloter', () => {
  setLanguage('fr');
  assert.equal(PIN2DMD_ONLY_THROUGH_SERVER, true);
  assert.equal(dmdServerDrivesPin2dmd([PIN2DMD], undefined), true, 'reconnu en USB, choix automatique');
  assert.equal(dmdServerDrivesPin2dmd([], { models: { PIN2DMD: 'on' } }), true, 'forcé');
  assert.equal(dmdServerDrivesPin2dmd([PIN2DMD], { models: { PIN2DMD: 'off' } }), false, 'éteint');
  assert.equal(dmdServerDrivesPin2dmd([ZEDMD], undefined), false);
  assert.equal(dmdServerWanted([PIN2DMD], undefined), true, 'sans « Image du front-end » : le serveur tourne pour le PIN2DMD');
  assert.equal(dmdServerWanted([PIN2DMD], { menu: false }), true);
  // Sans l'image du front-end, le serveur n'ouvre que le PIN2DMD : un ZeDMD reste à VPX.
  const ini = dmdServerIni([PIN2DMD, ZEDMD], { menu: false });
  assert.match(ini, /\[PIN2DMD\]\r\nEnabled = 1/);
  assert.match(ini, /\[ZeDMD\]\r\nEnabled = 0/);
  assert.match(ini, /\[ZeDMD-WiFi\]\r\nEnabled = 0/);
  // Serveur prêt : VPX lui envoie ses images et n'ouvre rien lui-même.
  const through = vpxDmdSettings([PIN2DMD], undefined, true).settings;
  assert.equal(through.find((s) => s.key === 'DMDServer')?.value, '1');
  assert.equal(through.find((s) => s.key === 'PIN2DMD')?.value, '0');
  // Serveur absent : DMDServer = 0 écrit, même sans réglage de l'image du front-end.
  assert.equal(vpxDmdSettings([PIN2DMD]).settings.find((s) => s.key === 'DMDServer')?.value, '0');
});

test('[Plugin.DMDUtil] : en mode serveur, VPX passe par dmdserver et n’ouvre plus le matériel', () => {
  setLanguage('fr');
  const server = vpxDmdSettings([PIN2DMD], { menu: true }, true).settings;
  const value = (key: string) => server.find((s) => s.key === key)?.value;
  assert.equal(value('DMDServer'), '1');
  assert.equal(value('DMDServerAddr'), '127.0.0.1');
  assert.equal(value('DMDServerPort'), '6789');
  for (const key of ['ZeDMD', 'PIN2DMD', 'Pixelcade', 'ZeDMDWiFiEnabled']) assert.equal(value(key), '0', `${key} : le serveur seul ouvre le DMD`);
  // Serveur absent (pas encore lancé, ou attend le DMD) : VPX ouvre le DMD lui-même.
  const direct = vpxDmdSettings([PIN2DMD], { menu: true }, false).settings;
  assert.equal(direct.find((s) => s.key === 'DMDServer')?.value, '0');
  assert.equal(direct.find((s) => s.key === 'PIN2DMD')?.value, '1');
  // Jamais réglé, et aucun PIN2DMD (que seul le serveur pilote) : DMDServer reste tel quel.
  assert.equal(vpxDmdSettings([ZEDMD]).settings.find((s) => s.key === 'DMDServer'), undefined);
});

/** Faux dmdserver : lit les images comme DMDServer::ClientThread (en-tête, puis length octets). */
function fakeServer(): Promise<{ port: number; frames: { client: number; header: ReturnType<typeof parseDmdStreamHeader>; rgb: Buffer }[]; clients: () => number; close(): Promise<void> }> {
  const frames: { client: number; header: ReturnType<typeof parseDmdStreamHeader>; rgb: Buffer }[] = [];
  let count = 0;
  let open = 0;
  const sockets = new Set<net.Socket>();
  const server = net.createServer((socket) => {
    const client = ++count;
    open++;
    sockets.add(socket);
    let buffer = Buffer.alloc(0);
    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      for (;;) {
        if (buffer.length < DMDSTREAM_HEADER_SIZE) return;
        const header = parseDmdStreamHeader(buffer.subarray(0, DMDSTREAM_HEADER_SIZE));
        if (buffer.length < DMDSTREAM_HEADER_SIZE + header.length) return;
        frames.push({ client, header, rgb: Buffer.from(buffer.subarray(DMDSTREAM_HEADER_SIZE, DMDSTREAM_HEADER_SIZE + header.length)) });
        buffer = buffer.subarray(DMDSTREAM_HEADER_SIZE + header.length);
      }
    });
    socket.on('close', () => {
      open--;
      sockets.delete(socket);
    });
    socket.on('error', () => undefined);
  });
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () =>
      resolve({
        port: (server.address() as net.AddressInfo).port,
        frames,
        clients: () => open,
        close: () =>
          new Promise<void>((done) => {
            for (const s of sockets) s.destroy();
            server.close(() => done());
          }),
      }),
    ),
  );
}

const until = async (cond: () => boolean, ms = 3000) => {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error('délai dépassé');
    await new Promise((r) => setTimeout(r, 20));
  }
};

test('client du menu : images reçues entières, lâche l’afficheur pendant la partie, le reprend après', async () => {
  const { DmdServerHost } = require(path.join(REPO_ROOT, 'app', 'dist', 'dmd-server.js')) as {
    DmdServerHost: new (o: { program(): { exe: string; dmdutilDir: string } | undefined; iniPath: string; log(l: string): void; port?: number; retryMs?: number }) => {
      start(ini: string): void;
      stop(): void;
      pause(): void;
      resume(): void;
      ready(): boolean;
      send(dots: Uint8Array, color: string): void;
    };
  };
  const fake = await fakeServer();
  const log: string[] = [];
  // Un serveur répond déjà sur le port : le client s'y connecte sans lancer dmdserver.exe.
  const host = new DmdServerHost({ program: () => ({ exe: 'cyberpinball-dmdserver.exe', dmdutilDir: 'plugins' }), iniPath: path.join(REPO_ROOT, 'tmp', 'essai-dmdserver.ini'), log: (l) => log.push(l), port: fake.port, retryMs: 50 });
  try {
    host.start('[DMDServer]\r\n');
    await until(() => host.ready());
    const dots = new Uint8Array(DMD_WIDTH * DMD_HEIGHT).fill(15);
    host.send(dots, '#8be23a');
    await until(() => fake.frames.length === 1);
    assert.equal(fake.frames[0]!.header.width, 128);
    assert.deepEqual([...fake.frames[0]!.rgb.subarray(0, 3)], [0x8b, 0xe2, 0x3a]);
    // Partie : le menu se déconnecte (VPX devient le seul client) et n'envoie plus rien.
    host.pause();
    await until(() => fake.clients() === 0);
    assert.equal(host.ready(), false, 'en partie, VPX ne compte pas sur le menu');
    host.send(dots, '#8be23a');
    await new Promise((r) => setTimeout(r, 150));
    assert.equal(fake.frames.length, 1, 'rien n’est envoyé pendant la partie');
    // Retour : reconnexion, et la dernière image repart aussitôt.
    host.resume();
    await until(() => host.ready() && fake.frames.length === 2);
    assert.equal(fake.frames[1]!.client, 3, 'une nouvelle connexion (la 1re était la sonde du port)');
    // Le serveur coupe le menu (VPX lancé ailleurs, nouvelle ROM) : le client se reconnecte seul.
    await fake.close();
    assert.ok(log.some((l) => l.includes('déjà à l’écoute')));
  } finally {
    host.stop();
    await fake.close().catch(() => undefined);
  }
});

test('serveur du DMD : arguments, et codes de sortie qui ne se règlent pas en relançant', () => {
  setLanguage('fr');
  const { dmdServerArgs, dmdServerExitProblem } = require(path.join(REPO_ROOT, 'app', 'dist', 'dmd-server.js')) as {
    dmdServerArgs(p: { exe: string; dmdutilDir: string }, ini: string): string[];
    dmdServerExitProblem(code: number | null): string | undefined;
  };
  // La DLL de VPX (-d), l'ini, attendre le DMD (-w) plutôt que s'arrêter, journal (-l).
  assert.deepEqual(dmdServerArgs({ exe: 'x.exe', dmdutilDir: 'C:\\VPX\\plugins\\dmdutil' }, 'C:\\data\\dmdserver.ini'), ['-d', 'C:\\VPX\\plugins\\dmdutil', '-c', 'C:\\data\\dmdserver.ini', '-w', '-l']);
  // 0 (DMD débranché), 1 (port pris), 2 (pas de DMD), plantage : relancé.
  for (const code of [0, 1, 2, null, 0xc0000005]) assert.equal(dmdServerExitProblem(code), undefined, `code ${code}`);
  assert.match(dmdServerExitProblem(3)!, /Visual C\+\+/);
  // 4 (fonction manquante) et 6 (empreinte inconnue) : la version de VPX installée, dite par son numéro.
  const vpxVersion = vpxComponent().version.split('-')[0];
  for (const code of [4, 6]) assert.ok(dmdServerExitProblem(code)!.includes(`VPX ${vpxVersion}`), `code ${code} : VPX ${vpxVersion} attendu`);
});

// Invariant : la version de VPX que Cyber Pinball installe a l'empreinte de son dmdutil64.dll dans
// packages/dmdserver/src/empreintes.h. Sans elle, « Image du menu » serait indisponible pour tous.
test('serveur du DMD : empreinte connue pour la version de VPX installée', () => {
  const known = fs.readFileSync(path.join(REPO_ROOT, 'packages', 'dmdserver', 'src', 'empreintes.h'), 'utf8');
  const rows = [...known.matchAll(/\{"([0-9a-f]{64})", "VPX ([^"]+)", (true|false)\}/g)].map((m) => ({ vpx: m[2]!, pin2dmd: m[3] === 'true' }));
  const row = rows.find((r) => r.vpx === vpxComponent().version);
  assert.ok(row, `empreintes.h : aucune ligne pour VPX ${vpxComponent().version} (${rows.map((r) => r.vpx).join(', ') || 'aucune'}) ; voir packages/dmdserver/vendor/PROVENANCE.txt`);
  // Le cœur et le serveur disent la même chose du PIN2DMD de cette version de VPX.
  assert.equal(PIN2DMD_ONLY_THROUGH_SERVER, !row.pin2dmd, 'PIN2DMD_ONLY_THROUGH_SERVER (dmdserver.ts) et la colonne pin2dmd de empreintes.h divergent');
});

// Le vrai serveur sur le vrai dmdutil64.dll de VPX, avec une carte simulée (--pin2dmd-essai) : une image
// du front-end, puis une de VPX (son client réseau, --client-essai), reçues par notre serveur réseau,
// rendues par le fil RGB24DMD de libdmdutil, arrivent dans le paquet PIN2DMD au format du firmware, celui
// qu'emploient les autres front-ends (décrit en tête de packages/dmdserver/src/pin2dmd.h) : en-tête 81 C3 E9 00, puis
// six plans de 2048 octets. Demande la DLL de VPX : CYBERPINBALL_VPX_DMDUTIL, ou tmp/vpx-dmdutil (le
// dossier plugins\dmdutil de VPX 10.8.1-5436). Borne d'un joueur (19/11/2026) : le DMDServer de cette DLL
// coupait chaque client sous Windows et noyait le journal ; aucune image ne passait.
const vpxDmdutil = process.env.CYBERPINBALL_VPX_DMDUTIL || path.join(REPO_ROOT, 'tmp', 'vpx-dmdutil');
const serverExe = path.join(REPO_ROOT, 'build', 'dmdserver', 'Release', 'cyberpinball-dmdserver.exe');
test(
  'cyberpinball-dmdserver : une image du front-end arrive au PIN2DMD (carte simulée, DLL de VPX)',
  { skip: (!fs.existsSync(serverExe) && 'non construit') || (!fs.existsSync(path.join(vpxDmdutil, 'dmdutil64.dll')) && 'DLL de VPX absente'), timeout: 30_000 },
  async () => {
    const dir = path.join(REPO_ROOT, 'tmp', 'essai-pin2dmd');
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    const ini = path.join(dir, 'dmdserver.ini');
    fs.writeFileSync(ini, dmdServerIni([PIN2DMD], undefined));
    const packet = path.join(dir, 'paquet.bin');
    const port = await freePort();
    const child = spawn(serverExe, ['-d', vpxDmdutil, '-c', ini, '-p', String(port), '-w', '-l', '--pin2dmd-essai', packet], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let log = '';
    child.stderr.on('data', (d: Buffer) => (log += d.toString('utf8')));
    // Calculé à la main d'après le format (ordre des couleurs 0 : rouge au bit 0, vert au bit 1, bleu au bit 2 ;
    // 6 bits par couleur, arrondi de 63 × (v / 255)^2,5) : (255, 128, 0) → rouge 63 (111111), vert 11 (001011),
    // bleu 0. Le point 0 (moitié haute) a son rouge au bit 0 et son vert au bit 1 de l'octet 0 de chaque plan ;
    // le dernier point (moitié basse, octet 2047) au bit 3 et au bit 4.
    const planes = (lastPixel: boolean) => {
      const expected = Buffer.alloc(2048 * 6);
      for (let k = 0; k < 6; k++) {
        const r = (63 >> k) & 1;
        const b = (11 >> k) & 1;
        expected[k * 2048] = r | (b << 1);
        if (lastPixel) expected[2047 + k * 2048] = (r << 3) | (b << 4);
      }
      return expected;
    };
    const SIZE = 4 + 2048 * 6;
    /** Les paquets complets écrits jusqu'ici (le serveur ajoute chaque envoi au fichier). */
    const packets = (): Buffer[] => {
      if (!fs.existsSync(packet)) return [];
      const all = fs.readFileSync(packet);
      return Array.from({ length: Math.floor(all.length / SIZE) }, (_, i) => all.subarray(i * SIZE, (i + 1) * SIZE));
    };
    const waitPacket = async (send: () => void): Promise<Buffer | undefined> => {
      const deadline = Date.now() + 10_000;
      while (Date.now() < deadline) {
        send();
        await new Promise((r) => setTimeout(r, 200));
        const got = packets();
        if (got.length) return got[0];
      }
      return undefined;
    };
    try {
      // 1. Le front-end : une connexion gardée, des images RGB24 (dmdServerFrame).
      const socket = await connectWithin(port, 15_000);
      const dots = new Uint8Array(DMD_WIDTH * DMD_HEIGHT);
      dots[0] = 15;
      dots[DMD_WIDTH * DMD_HEIGHT - 1] = 15;
      let closed = false;
      socket.once('close', () => (closed = true));
      const menu = await waitPacket(() => socket.write(dmdServerFrame(dots, '#ff8000')));
      assert.ok(menu, `aucun paquet PIN2DMD écrit ; journal du serveur :\n${log.slice(0, 2000)}`);
      assert.equal(closed, false, 'le serveur garde la connexion du front-end (DMDServer de libdmdutil la coupait)');
      assert.deepEqual([...menu.subarray(0, 4)], [0x81, 0xc3, 0xe9, 0x00], 'en-tête des images RGB du firmware');
      assert.deepEqual(menu.subarray(4), planes(true), 'six plans de bits, moitiés haute et basse');
      socket.destroy();
      await new Promise((r) => setTimeout(r, 300));

      // 2. VPX en partie : le client réseau de la DLL de VPX elle-même (mode Data, Paths + Update).
      const before = packets().length;
      const client = spawnSync(serverExe, ['-d', vpxDmdutil, '-a', '127.0.0.1', '-p', String(port), '--client-essai'], { encoding: 'utf8', windowsHide: true, timeout: 15_000 });
      assert.equal(client.status, 0, client.stderr);
      await new Promise((r) => setTimeout(r, 300));
      const expectedGame = planes(false);
      const game = packets()
        .slice(before)
        .some((p) => p.subarray(4).equals(expectedGame));
      assert.ok(game, `aucune image de VPX arrivée au PIN2DMD ; journal du serveur :\n${log.slice(-2000)}`);

      assert.match(log, /carte simulee/);
      // Ni boucle à vide ni journal noyé (DMDServer de libdmdutil : « Error accepting connection » sans fin).
      assert.doesNotMatch(log, /Error accepting connection/);
      assert.ok(log.split('\n').length < 200, `journal du serveur trop long : ${log.split('\n').length} lignes`);
    } finally {
      child.kill();
    }
  },
);

/** Connexion au serveur dès qu'il écoute. */
async function connectWithin(port: number, ms: number): Promise<net.Socket> {
  const deadline = Date.now() + ms;
  for (;;) {
    try {
      return await new Promise<net.Socket>((resolve, reject) => {
        const s = net.connect({ host: '127.0.0.1', port }, () => resolve(s));
        s.once('error', reject);
      });
    } catch (error) {
      if (Date.now() > deadline) throw error;
      await new Promise((r) => setTimeout(r, 200));
    }
  }
}

function vpxComponent(): { version: string } {
  const list = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'packages', 'installer', 'components.json'), 'utf8')) as { components: { id: string; version: string }[] };
  return list.components.find((c) => c.id === 'vpx')!;
}

// Le vrai serveur (packages/dmdserver), s'il est construit (node scripts/dmdserver.mjs) : sans la DLL de VPX,
// il s'arrête avec le code 3 ; avec une DLL inconnue (un autre fichier sous ce nom), avec le code 6 sans
// la charger ; jamais de fenêtre d'erreur ni de recherche de DMD.
const builtServer = path.join(REPO_ROOT, 'build', 'dmdserver', 'Release', 'cyberpinball-dmdserver.exe');
test('cyberpinball-dmdserver : aide, DLL de VPX absente (code 3) ou inconnue (code 6)', { skip: !fs.existsSync(builtServer) && 'non construit' }, () => {
  const help = spawnSync(builtServer, ['--help'], { encoding: 'utf8', windowsHide: true });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /--dmdutil/);
  const missing = spawnSync(builtServer, ['--verifier', '-d', path.join(REPO_ROOT, 'tmp', 'aucun-vpx')], { encoding: 'utf8', windowsHide: true });
  assert.equal(missing.status, 3);
  assert.match(missing.stderr, /dmdutil64\.dll absent/);
  const otherDir = path.join(REPO_ROOT, 'tmp', 'dmdutil-inconnu');
  fs.mkdirSync(otherDir, { recursive: true });
  fs.writeFileSync(path.join(otherDir, 'dmdutil64.dll'), 'pas la DLL de VPX');
  const other = spawnSync(builtServer, ['--verifier', '-d', otherDir], { encoding: 'utf8', windowsHide: true });
  assert.equal(other.status, 6);
  assert.match(other.stderr, /non prise en charge \(empreinte [0-9a-f]{64}\)/);
  const unknown = spawnSync(builtServer, ['--inconnue'], { encoding: 'utf8', windowsHide: true });
  assert.equal(unknown.status, 5);
});

test('santé : « Image du menu » demandée mais serveur impossible, dit avec sa raison', () => {
  setLanguage('fr');
  const problem = 'Version de VPX non prise en charge par le serveur du DMD (VPX 10.8.1 attendu)';
  assert.deepEqual(hardwareDmdFacts([PIN2DMD], { menu: true }, problem).problems, [`Image du front-end sur le DMD réel : ${problem}`]);
  assert.deepEqual(hardwareDmdFacts([ZEDMD], undefined, problem).problems, [], 'image du menu non demandée : rien à dire pour un ZeDMD, que VPX pilote seul');
  assert.deepEqual(hardwareDmdFacts([PIN2DMD], undefined, problem).problems, [`PIN2DMD : ${problem}`], 'un PIN2DMD ne s’allume que par le serveur');
  assert.deepEqual(hardwareDmdFacts([], { menu: true }, problem).problems, [], 'aucun DMD : rien à dire');
  assert.deepEqual(hardwareDmdFacts([PIN2DMD], { menu: true }).problems, [], 'serveur prêt');
});

// Borne d'un joueur (18/11/2026, PIN2DMD noir en partie comme dans le front-end) : le serveur, lancé avec -w,
// relançait FindDisplays chaque seconde sans rien trouver ; PIN2DMDInit de libdmdutil garde la carte ouverte
// et réservée quand il la refuse, et le serveur restait lancé pendant la partie, où VPX ouvrait le DMD
// lui-même. Invariants : un serveur muet s'arrête de lui-même, et jamais il ne tourne quand VPX ouvre le DMD.
type Host = {
  start(ini: string): void;
  stop(): void;
  handOver(throughServer: boolean): Promise<void>;
  ready(): boolean;
  active(): boolean;
  notFound(): number | undefined;
};
type HostOptions = {
  program(): { exe: string; dmdutilDir: string } | undefined;
  iniPath: string;
  log(l: string): void;
  port?: number;
  retryMs?: number;
  restartMs?: number;
  findTimeoutMs?: number;
  onGiveUp?(): void;
  args?(): string[];
};

/** Un port où rien n'écoute. */
function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address() as net.AddressInfo;
      s.close(() => resolve(port));
    });
  });
}

/** Un faux serveur qui ne trouve jamais d'afficheur : il tourne sans jamais écouter (comme dmdserver -w). */
function mute(port: number, extra: Partial<HostOptions> = {}): { host: Host; log: string[]; pid(): number | undefined } {
  const { DmdServerHost } = require(path.join(REPO_ROOT, 'app', 'dist', 'dmd-server.js')) as { DmdServerHost: new (o: HostOptions) => Host };
  const log: string[] = [];
  const dir = path.join(REPO_ROOT, 'tmp');
  fs.mkdirSync(dir, { recursive: true });
  const host = new DmdServerHost({
    program: () => ({ exe: process.execPath, dmdutilDir: dir }),
    iniPath: path.join(dir, 'essai-dmdserver-muet.ini'),
    log: (l) => log.push(l),
    port,
    retryMs: 50,
    restartMs: 50,
    args: () => ['-e', 'setInterval(() => {}, 1000)'],
    ...extra,
  });
  return { host, log, pid: () => (host as unknown as { child?: { pid?: number } }).child?.pid };
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

test('serveur du DMD sans afficheur : arrêté au bout du délai, la carte rendue avant la sonde, pas de relance seule', async () => {
  setLanguage('fr');
  let started: number | undefined;
  let aliveAtGiveUp: boolean | undefined;
  const { host, log, pid } = mute(await freePort(), {
    findTimeoutMs: 400,
    onGiveUp: () => {
      aliveAtGiveUp = alive(started!);
    },
  });
  try {
    host.start('[DMDServer]\r\n');
    await until(() => (started = pid()) !== undefined);
    await until(() => aliveAtGiveUp !== undefined);
    // onGiveUp vient après la fin du processus : c'est alors que le système rend la carte à la sonde.
    assert.equal(aliveAtGiveUp, false, 'le serveur est terminé quand la sonde part');
    assert.equal(host.active(), false);
    assert.equal(host.ready(), false);
    assert.equal(host.notFound(), 0, 'abandonné, au bout du délai (en secondes, arrondi)');
    assert.ok(log.some((l) => /aucun afficheur trouvé en 0 s, arrêté/.test(l)));
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(pid(), undefined, 'pas de relance de lui-même');
    // Au prochain appel (retour de partie, « Vérifier de nouveau ») : nouvel essai, mêmes choix.
    host.start('[DMDServer]\r\n');
    assert.equal(host.notFound(), undefined);
    assert.equal(host.active(), true);
  } finally {
    host.stop();
  }
});

test('avant une partie que VPX ne confie pas au serveur : le serveur muet est arrêté, et sa fin attendue', async () => {
  const { host, log, pid } = mute(await freePort(), { findTimeoutMs: 60_000 });
  try {
    host.start('[DMDServer]\r\n');
    let child: number | undefined;
    await until(() => (child = pid()) !== undefined);
    // La synchronisation a écrit DMDServer = 0 (serveur muet) : VPX ouvrira la carte lui-même.
    await host.handOver(false);
    assert.equal(alive(child!), false, 'terminé avant que VPX ne parte');
    assert.equal(host.active(), false);
    assert.ok(log.some((l) => /arrêté avant la partie/.test(l)));
    // Au retour, applyMenuDmdServer le relance.
    host.start('[DMDServer]\r\n');
    assert.equal(host.active(), true);
  } finally {
    host.stop();
  }
});

test('avant une partie que VPX confie au serveur : il reste lancé, le menu lâche seulement l’afficheur', async () => {
  const fake = await fakeServer();
  const { DmdServerHost } = require(path.join(REPO_ROOT, 'app', 'dist', 'dmd-server.js')) as { DmdServerHost: new (o: HostOptions) => Host };
  const host = new DmdServerHost({ program: () => ({ exe: 'cyberpinball-dmdserver.exe', dmdutilDir: 'plugins' }), iniPath: path.join(REPO_ROOT, 'tmp', 'essai-dmdserver.ini'), log: () => undefined, port: fake.port, retryMs: 50 });
  try {
    host.start('[DMDServer]\r\n');
    await until(() => host.ready());
    await host.handOver(true);
    await until(() => fake.clients() === 0);
    assert.equal(host.active(), true, 'le serveur tourne : VPX s’y connecte');
  } finally {
    host.stop();
    await fake.close().catch(() => undefined);
  }
});

test('lancement d’une partie : la synchronisation retient sa réponse, le serveur est rendu d’après elle juste avant VPX', () => {
  const read = (f: string) => fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', f), 'utf8');
  assert.match(read('vpx-ini.ts'), /dmdServer: dmdServerForVpx\(\)/, 'la réponse écrite dans VPinballX.ini est celle que handDmdToVpx reprend');
  const frontend = read('frontend.ts');
  const handed = frontend.indexOf('await handDmdToVpx();');
  assert.ok(handed > 0, 'frontend.ts : await handDmdToVpx() avant la partie');
  assert.ok(handed < frontend.indexOf('launchVpx({'), 'avant le lancement de VPX');
  assert.doesNotMatch(frontend, /menuDmdServer\(\)\.pause\(\)/, 'jamais seulement lâché : un serveur muet tiendrait la carte');
});

test('santé et « DMD réel » : le serveur qui ne trouve pas l’afficheur le dit, avec la cause ou un rapport à envoyer', () => {
  setLanguage('fr');
  const refused: ObservedUsbDevice = { ...PIN2DMD, libusbProbe: { stage: 'name', code: 0, product: 'PIN2DMD EVO' } };
  // Cause trouvée (la sonde, dite à part) : la phrase du serveur ne la répète pas.
  const known = dmdServerNotFoundProblem([refused], { menu: true }, 20);
  assert.equal(known, 'Le serveur du DMD ne trouve pas l’afficheur (aucune réponse en 20 s)');
  const facts = hardwareDmdFacts([refused], { menu: true }, known);
  assert.equal(facts.problems.length, 2);
  assert.match(facts.problems[0]!, /« PIN2DMD EVO »/);
  assert.equal(facts.problems[1], `Image du front-end sur le DMD réel : ${known}`);
  // Sans cause trouvée : un rapport.
  assert.match(dmdServerNotFoundProblem([{ ...PIN2DMD, libusbProbe: { stage: 'ok', code: 0, product: 'PIN2DMD' } }], { menu: true }, 20), /sans cause trouvée : envoyez un rapport/);
  // La cause d'un modèle éteint ne compte pas.
  assert.match(dmdServerNotFoundProblem([refused, ZEDMD], { menu: true, models: { PIN2DMD: 'off' } }, 20), /sans cause trouvée/);
});

test('dmdserver.ini : un modèle ni reconnu ni forcé n’est jamais cherché (Pixelcade chez un joueur à PIN2DMD seul)', () => {
  const ini = dmdServerIni([PIN2DMD], { menu: true });
  assert.match(ini, /\[PIN2DMD\]\r\nEnabled = 1/);
  assert.match(ini, /\[Pixelcade\]\r\nEnabled = 0/);
  assert.match(ini, /\[ZeDMD\]\r\nEnabled = 0/);
  assert.match(ini, /\[ZeDMD-WiFi\]\r\nEnabled = 0/);
  // « Pixelcade : oui » (le Start passe par « oui » entre « automatique » et « non ») : cherché, comme demandé.
  assert.match(dmdServerIni([PIN2DMD], { menu: true, models: { Pixelcade: 'on' } }), /\[Pixelcade\]\r\nEnabled = 1/);
});
