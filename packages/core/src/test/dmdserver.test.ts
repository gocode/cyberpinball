// Image du menu sur le DMD réel (bêta) : le protocole de dmdserver (libdmdutil, DMDServer.cpp et
// DMD.h au commit 3485e2e épinglé par VPX 10.8.1), dmdserver.ini d'après les choix, [Plugin.DMDUtil]
// en mode serveur, et le client du menu (app/src/dmd-server.ts) face à un faux serveur qui lit les
// images exactement comme DMDServer::ClientThread : 25 octets d'en-tête, puis length octets.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as path from 'node:path';
import { test } from 'node:test';
import { hardwareDmdFacts, vpxDmdSettings } from '../dmd';
import { DMDSTREAM_HEADER_SIZE, dmdRgb24, dmdServerFrame, dmdServerIni, dmdServerWanted, dmdStreamHeader, parseDmdStreamHeader } from '../dmdserver';
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
  assert.equal(dmdServerWanted([PIN2DMD], undefined), false, 'sans le choix, VPX garde le DMD en direct');
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
  // Jamais réglé : DMDServer reste tel quel.
  assert.equal(vpxDmdSettings([PIN2DMD]).settings.find((s) => s.key === 'DMDServer'), undefined);
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
  const rows = [...known.matchAll(/\{"([0-9a-f]{64})", "VPX ([^"]+)"\}/g)].map((m) => m[2]);
  assert.ok(rows.includes(vpxComponent().version), `empreintes.h : aucune ligne pour VPX ${vpxComponent().version} (${rows.join(', ') || 'aucune'}) ; voir packages/dmdserver/vendor/PROVENANCE.txt`);
});

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
  assert.deepEqual(hardwareDmdFacts([PIN2DMD], { menu: true }, problem).problems, [`Image du menu sur le DMD réel : ${problem}`]);
  assert.deepEqual(hardwareDmdFacts([PIN2DMD], undefined, problem).problems, [], 'image du menu non demandée : rien à dire');
  assert.deepEqual(hardwareDmdFacts([], { menu: true }, problem).problems, [], 'aucun DMD : rien à dire');
  assert.deepEqual(hardwareDmdFacts([PIN2DMD], { menu: true }).problems, [], 'serveur prêt');
});
