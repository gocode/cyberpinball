// Vision 3D, chaîne de la Kinect pour Xbox 360 sans capteur : une fausse Kinect10.dll (construite par
// scripts/vision3d.mjs, packages/vpx-vision3d/test/kinect-factice.cpp) rend des images de squelette à
// la structure du SDK 1.8. HeadTracker la lit par koffi, mesure la position de jeu, puis envoie le
// déplacement de la tête (10 cm vers la droite du joueur) par UDP. La lecture de la structure
// (2 664 octets, tête = articulation 3) est aussi vérifiée seule, sur un tampon construit ici.
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { runElectron } from './electron-run';
import { REPO } from './interne';

const FAKE_DLL = path.join(REPO, 'build', 'vision3d', 'Release', 'kinect-factice.dll');

function electronPath(): string | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require(require.resolve('electron', { paths: [REPO] })) as string;
  } catch {
    return undefined;
  }
}

test('Kinect : la structure du squelette se lit comme le SDK 1.8 la remplit (premier squelette suivi, tête = articulation 3)', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { readSkeletonFrame, NUI_SKELETON_FRAME_SIZE } = require(path.join(REPO, 'app', 'dist', 'vision3d.js')) as {
    readSkeletonFrame: (frame: Buffer) => { head: { x: number; y: number; z: number }; floor: { x: number; y: number; z: number } } | undefined;
    NUI_SKELETON_FRAME_SIZE: number;
  };
  assert.equal(NUI_SKELETON_FRAME_SIZE, 2664);
  const frame = Buffer.alloc(2664);
  frame.writeFloatLE(1, 20); // sol : normale (0, 1, 0)
  assert.equal(readSkeletonFrame(frame), undefined, 'personne devant le capteur');
  const head = (s: number) => s + 32 + 3 * 16;
  // Deuxième squelette : suivi, mais tête non suivie ; cinquième : suivi, tête suivie.
  const second = 48 + 436;
  frame.writeInt32LE(2, second);
  frame.writeFloatLE(9, head(second));
  const fifth = 48 + 4 * 436;
  frame.writeInt32LE(2, fifth);
  frame.writeFloatLE(-0.25, head(fifth));
  frame.writeFloatLE(0.5, head(fifth) + 4);
  frame.writeFloatLE(1.5, head(fifth) + 8);
  frame.writeInt32LE(2, fifth + 32 + 320 + 3 * 4);
  assert.deepEqual(readSkeletonFrame(frame), { head: { x: -0.25, y: 0.5, z: 1.5 }, floor: { x: 0, y: 1, z: 0 } });
});

test('pilote de la Kinect : l’archive des paquets se trouve dans l’enveloppe (la plus grande archive CAB), paquets pris sans lancer son interface', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { attachedCabinet } = require(path.join(REPO, 'app', 'dist', 'vision3d.js')) as { attachedCabinet: (b: Buffer) => { offset: number; size: number } | undefined };
  const cab = (size: number) => {
    const b = Buffer.alloc(size);
    b.write('MSCF\0\0\0\0', 0, 'latin1');
    b.writeUInt32LE(size, 8);
    return b;
  };
  const exe = Buffer.concat([Buffer.alloc(100), cab(300), Buffer.alloc(20), cab(5000), Buffer.alloc(10)]);
  assert.deepEqual(attachedCabinet(exe), { offset: 420, size: 5000 });
  assert.equal(attachedCabinet(Buffer.alloc(64)), undefined);
  // Une taille annoncée au-delà du fichier : pas une archive.
  const broken = cab(300);
  broken.writeUInt32LE(9999, 8);
  assert.equal(attachedCabinet(broken), undefined);
  // Le manifeste : trois paquets de l'enveloppe, jamais d'arguments /quiet donnés à son interface.
  const manifest = JSON.parse(fs.readFileSync(path.join(REPO, 'packages', 'installer', 'components.json'), 'utf8')) as { components: { id: string; bundlePackages?: { file: string }[]; silentArguments?: unknown }[] };
  const kinect = manifest.components.find((c) => c.id === 'kinect-sdk-1.8')!;
  // Le SDK 1.8 (pas le runtime seul) : sans lui, le pilote refuse une Kinect pour Xbox 360 (E_NUI_NOTSUPPORTED).
  assert.deepEqual(kinect.bundlePackages!.map((p) => p.file), ['vcredist_x64.exe', 'KinectDrivers-v1.8-x64.WHQL.msi', 'KinectRuntime-v1.8-x64.msi', 'redist.cab', 'KinectSDK-v1.8-x64.msi']);
  // L'archive externe du SDK est posée à côté de lui, avant lui, sans être lancée.
  const pkgs = kinect.bundlePackages as { file: string; companion?: boolean }[];
  assert.equal(pkgs.find((p) => p.file === 'redist.cab')!.companion, true);
  assert.equal(kinect.silentArguments, undefined);
});

const electron = electronPath();
const skip = process.platform !== 'win32' ? 'Windows seulement' : !electron ? 'Electron absent' : !fs.existsSync(FAKE_DLL) ? 'fausse Kinect10.dll pas construite (node scripts/vision3d.mjs)' : false;

test('Kinect : tête suivie par koffi, position de jeu mesurée, tête à droite -> x ≈ +10 cm par UDP', { skip, timeout: 120_000 }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-kinect-'));
  try {
    const main = path.join(dir, 'main.js');
    const report = path.join(dir, 'rapport.json');
    const vision3d = path.join(REPO, 'app', 'dist', 'vision3d.js');
    const core = path.join(REPO, 'packages', 'core', 'dist', 'vision3d.js');
    fs.writeFileSync(
      main,
      `const { app } = require('electron');
const fs = require('node:fs');
const dgram = require('node:dgram');
app.on('window-all-closed', () => undefined);
app.whenReady().then(async () => {
  const seen = { packets: [], log: [] };
  const sock = dgram.createSocket('udp4');
  sock.on('message', (m) => seen.packets.push([m.readDoubleLE(0), m.readDoubleLE(8), m.readDoubleLE(16)]));
  await new Promise((r) => sock.bind(47423, '127.0.0.1', r));
  try {
    const { HeadTracker, readSkeletonFrame } = require(${JSON.stringify(vision3d)});
    const { parseVision3dSetting } = require(${JSON.stringify(core)});
    const tracker = new HeadTracker({ dataDir: ${JSON.stringify(dir)}, appDir: ${JSON.stringify(path.join(REPO, 'app'))}, log: (l) => seen.log.push(l) });
    tracker.start('kinect1', 'essai', parseVision3dSetting({ intensity: 1 }));
    await new Promise((r) => setTimeout(r, 4000));
    seen.full = seen.packets.at(-1);
    // Intensité à moitié, en plein suivi : le déplacement envoyé est divisé par deux, aussitôt.
    tracker.configure({ intensity: 0.5, smoothing: 'normal' });
    await new Promise((r) => setTimeout(r, 500));
    seen.half = seen.packets.at(-1);
    seen.state = tracker.state;
    seen.failure = tracker.failureReason;
    tracker.stop();
  } catch (e) {
    seen.error = String(e && e.stack || e);
  }
  sock.close();
  fs.writeFileSync(${JSON.stringify(report)}, JSON.stringify(seen));
  app.exit(0);
});
`,
    );
    const run = runElectron(electron!, [`--user-data-dir=${path.join(dir, 'profil')}`, main], {
      dir,
      timeout: 60_000,
      env: { ...process.env, CYBERPINBALL_HORS_ECRAN: '1', CYBERPINBALL_VISION3D_PORT: '47423', CYBERPINBALL_KINECT_DLL: FAKE_DLL },
    });
    assert.ok(fs.existsSync(report), `pas de rapport : ${run.stdout}\n${run.stderr}`);
    const seen = JSON.parse(fs.readFileSync(report, 'utf8')) as { packets: number[][]; log: string[]; error?: string; failure?: string; state?: string };
    const trace = `\n${seen.log.join('\n')}\n${seen.error ?? ''}`;
    assert.equal(seen.error, undefined, trace);
    assert.equal(seen.failure, undefined, trace);
    assert.equal(seen.state, 'tracking', trace);
    assert.ok(seen.packets.length > 20, `${seen.packets.length} paquets${trace}`);
    const last = (seen as unknown as { full: number[] }).full;
    assert.ok(Math.abs(last[0]! - 10) < 1, `x à 100 % : ${last[0]} cm (10 attendus)${trace}`);
    assert.ok(Math.abs(last[1]!) < 0.5 && Math.abs(last[2]!) < 0.5, `y, z finaux ${last[1]}, ${last[2]}`);
    const half = (seen as unknown as { half: number[] }).half;
    assert.ok(Math.abs(half[0]! - 5) < 0.6, `x à 50 % : ${half[0]} cm (5 attendus)`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
