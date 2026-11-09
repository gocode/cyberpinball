// Vision 3D (vision3d.ts) : capteurs reconnus parmi les périphériques USB, choix du capteur,
// géométrie de la webcam et de la Kinect dans le repère attendu par le plugin VPX (x à droite du
// joueur, y en haut, z vers le joueur), lissage, position de jeu, paquets au format d'opentrack.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ObservedUsbDevice } from '../model';
import {
  clampShift,
  DEFAULT_VISION3D,
  HeadFilter,
  kinectAim,
  kinectHead,
  medianHead,
  OneEuroFilter,
  opentrackPacket,
  parseVision3dSetting,
  vision3dHardware,
  vision3dMenuText,
  vision3dReadiness,
  webcamHead,
} from '../vision3d';

const usb = (vid: number, pid: number, extra: Partial<ObservedUsbDevice> = {}): ObservedUsbDevice => ({ instanceId: `USB\\VID_${vid.toString(16)}&PID_${pid.toString(16)}\\1`, vid, pid, ...extra });
const near = (a: number, b: number, tol = 0.05) => assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b}`);

test('réglage : valeurs douteuses ramenées aux valeurs par défaut, position de jeu gardée par configuration', () => {
  assert.deepEqual(parseVision3dSetting(undefined), DEFAULT_VISION3D);
  assert.deepEqual(parseVision3dSetting({ mode: 'oui', source: 'radar', webcamFovDeg: 500 }), DEFAULT_VISION3D);
  const s = parseVision3dSetting({ mode: 'on', source: 'webcam', webcamFovDeg: 78, neutral: { borne: { x: 1, y: 2, z: 80, source: 'webcam' }, faux: { x: 'a' } } });
  assert.equal(s.mode, 'on');
  assert.equal(s.source, 'webcam');
  assert.equal(s.webcamFovDeg, 78);
  assert.deepEqual(s.neutral, { borne: { x: 1, y: 2, z: 80, source: 'webcam' } });
});

test('matériel : Kinect v1 reconnue avec ou sans pilote, webcams par leur classe, caméra de la Kinect exclue', () => {
  const hw = vision3dHardware(
    [
      usb(0x045e, 0x02b0), // moteur Kinect, sans pilote : aucune classe
      usb(0x045e, 0x02ae, { deviceClass: 'Image', name: 'Kinect for Windows Camera' }),
      usb(0x046d, 0x085c, { deviceClass: 'Camera', name: 'C922 Pro Stream Webcam' }),
      usb(0x046d, 0x085c, { deviceClass: 'Camera', name: 'C922 Pro Stream Webcam' }),
      usb(0xfafa, 0x00f0, { deviceClass: 'HIDClass', name: 'Pinscape' }),
    ],
    false,
  );
  assert.deepEqual(hw, { kinect1: true, kinect1Driver: false, kinect2: false, webcams: ['C922 Pro Stream Webcam'] });
});

test('choix du capteur : Kinect prête d’abord, pilote à installer proposé, sinon webcam, sinon raison', () => {
  const base = { kinect1: false, kinect1Driver: false, kinect2: false, webcams: [] as string[] };
  assert.deepEqual(vision3dReadiness({ ...base, kinect1: true, kinect1Driver: true, webcams: ['Cam'] }), { ready: true, source: 'kinect1', label: 'Kinect pour Xbox 360' });
  const noDriver = vision3dReadiness({ ...base, kinect1: true, webcams: ['Cam'] });
  assert.equal(noDriver.ready, false);
  assert.equal(!noDriver.ready && noDriver.installKinectDriver, true);
  // Choisie exprès, la webcam sert même quand une Kinect attend son pilote.
  assert.deepEqual(vision3dReadiness({ ...base, kinect1: true, webcams: ['Cam'] }, 'webcam'), { ready: true, source: 'webcam', label: 'Cam' });
  assert.deepEqual(vision3dReadiness({ ...base, webcams: ['Cam'] }), { ready: true, source: 'webcam', label: 'Cam' });
  const v2 = vision3dReadiness({ ...base, kinect2: true });
  assert.ok(!v2.ready && /Xbox One/.test(v2.reason));
  const none = vision3dReadiness(base);
  assert.ok(!none.ready && /Aucune caméra/.test(none.reason) && !none.installKinectDriver);
});

test('menu : indisponible grisé avec sa raison ; pilote à installer reste choisissable ; état activé ou non', () => {
  const nothing = vision3dMenuText({ mode: 'on' }, { ready: false, reason: 'Aucune caméra' });
  assert.equal(nothing.unavailable, true);
  assert.equal(nothing.detail, 'Aucune caméra');
  const driver = vision3dMenuText({ mode: 'off' }, { ready: false, reason: 'Kinect détectée', installKinectDriver: true }, { driverMb: 116 });
  assert.equal(driver.unavailable, false);
  assert.match(driver.detail, /116 Mo/);
  assert.match(vision3dMenuText({ mode: 'on' }, { ready: true, source: 'webcam', label: 'Cam' }).label, /activée/);
  assert.match(vision3dMenuText({ mode: 'off' }, { ready: true, source: 'webcam', label: 'Cam' }).label, /désactivée/);
  assert.equal(vision3dMenuText({ mode: 'off' }, { ready: true, source: 'webcam', label: 'Cam' }, { pluginMissing: true }).unavailable, true);
});

test('webcam : distance par l’écart des yeux, droite du joueur à gauche de l’image, haut vers le haut', () => {
  const size = { width: 640, height: 480 };
  const fov = 70;
  const focal = 320 / Math.tan((35 * Math.PI) / 180);
  // Yeux centrés, écartés de 64 px : distance = focale × 6,3 / 64.
  const centre = webcamHead({ leftX: 0.45, leftY: 0.5, rightX: 0.55, rightY: 0.5 }, size, fov)!;
  near(centre.z, (focal * 6.3) / 64);
  near(centre.x, 0);
  near(centre.y, 0);
  // Visage décalé vers la gauche de l'image : le joueur s'est déplacé vers sa droite.
  const droite = webcamHead({ leftX: 0.25, leftY: 0.5, rightX: 0.35, rightY: 0.5 }, size, fov)!;
  assert.ok(droite.x > 5, `x = ${droite.x}`);
  // Visage plus haut dans l'image : y positif.
  assert.ok(webcamHead({ leftX: 0.45, leftY: 0.3, rightX: 0.55, rightY: 0.3 }, size, fov)!.y > 5);
  // Yeux plus écartés : plus près.
  assert.ok(webcamHead({ leftX: 0.4, leftY: 0.5, rightX: 0.6, rightY: 0.5 }, size, fov)!.z < centre.z);
  assert.equal(webcamHead({ leftX: 0.5, leftY: 0.5, rightX: 0.5, rightY: 0.5 }, size, fov), undefined);
});

test('Kinect : mètres en centimètres, capteur penché redressé d’après le sol', () => {
  // Sol vu droit : rien à redresser.
  const droit = kinectHead({ x: 0.1, y: 0.2, z: 1.2 }, { x: 0, y: 1, z: 0 });
  near(droit.x, 10);
  near(droit.y, 20);
  near(droit.z, 120);
  // Capteur sur le fronton, penché de 20° vers le joueur : le sol vu « penché » (normale 0, cos, -sin).
  const a = (20 * Math.PI) / 180;
  const n = { x: 0, y: Math.cos(a), z: -Math.sin(a) };
  // Un point dans l'axe du capteur, à 1 m, est sous l'horizontale du capteur.
  const axe = kinectHead({ x: 0, y: 0, z: 1 }, n);
  near(axe.y, -100 * Math.sin(a));
  near(axe.z, 100 * Math.cos(a));
  // Sol invisible (plan nul) : aucun redressement.
  near(kinectHead({ x: 0, y: 0.5, z: 1 }, { x: 0, y: 0, z: 0 }).y, 50);
});

test('Kinect : le moteur vise la tête une fois, seulement si elle est loin du centre', () => {
  assert.equal(kinectAim({ x: 0, y: 0.05, z: 1.2 }, 0), undefined);
  assert.equal(kinectAim({ x: 0, y: 0.5, z: 1.0 }, 0), 27);
  assert.equal(kinectAim({ x: 0, y: -0.3, z: 1.2 }, 5), 5 - 14);
});

test('lissage : immobile, le tremblement disparaît ; un vrai mouvement passe vite', () => {
  const f = new OneEuroFilter();
  let out = 0;
  for (let i = 0; i < 60; i++) out = f.filter(i % 2 ? 0.6 : -0.6, i / 30);
  assert.ok(Math.abs(out) < 0.3, `tremblement restant ${out}`);
  const h = new HeadFilter();
  h.filter({ x: 0, y: 0, z: 80 }, 0);
  let p = { x: 0, y: 0, z: 0 };
  for (let i = 1; i <= 15; i++) p = h.filter({ x: 20, y: 0, z: 80 }, i / 30);
  assert.ok(p.x > 18, `après une demi-seconde, x = ${p.x}`);
});

test('position de jeu : médiane, insensible à une détection ratée ; déplacement plafonné', () => {
  const m = medianHead([
    { x: 1, y: 2, z: 80 },
    { x: 1.2, y: 2.1, z: 81 },
    { x: 90, y: -50, z: 300 },
  ])!;
  assert.deepEqual(m, { x: 1.2, y: 2, z: 81 });
  assert.equal(medianHead([]), undefined);
  assert.deepEqual(clampShift({ x: 100, y: -100, z: 5 }), { x: 60, y: -60, z: 5 });
});

test('paquet opentrack : 48 octets, trois doubles petit-boutistes puis trois zéros', () => {
  const b = opentrackPacket({ x: 1.5, y: -2.5, z: 3.5 });
  assert.equal(b.length, 48);
  assert.equal(b.readDoubleLE(0), 1.5);
  assert.equal(b.readDoubleLE(8), -2.5);
  assert.equal(b.readDoubleLE(16), 3.5);
  assert.equal(b.readDoubleLE(24) + b.readDoubleLE(32) + b.readDoubleLE(40), 0);
});
