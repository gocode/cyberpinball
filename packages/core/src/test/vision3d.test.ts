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
  vision3dGameReport,
  vision3dHardware,
  vision3dPluginLog,
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
  assert.deepEqual(hw, { kinect1: true, kinect1Driver: false, kinect2: false, webcams: ['C922 Pro Stream Webcam'], kinectCamera: { started: true, problem: 0 } });
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

test('intégrité de la mémoire : la Kinect refusée par Windows cède la place à la webcam, sinon la raison et la page de Sécurité Windows', () => {
  const blocked = { kinect1: true, kinect1Driver: true, kinect2: false, webcams: [] as string[], memoryIntegrity: true };
  const alone = vision3dReadiness(blocked);
  assert.ok(!alone.ready && alone.memoryIntegrity && !alone.installKinectDriver && /intégrité de la mémoire/.test(alone.reason));
  const text = vision3dMenuText({ mode: 'on' }, alone);
  assert.equal(text.unavailable, false, 'choisissable : elle ouvre « Isolation du noyau »');
  assert.match(text.detail, /Isolation du noyau/);
  // Pilote pas encore installé : jamais proposé, il serait refusé de même.
  const noDriver = vision3dReadiness({ ...blocked, kinect1Driver: false });
  assert.ok(!noDriver.ready && !noDriver.installKinectDriver && noDriver.memoryIntegrity);
  // Une webcam branchée : elle sert, et le menu dit pourquoi pas la Kinect.
  const webcam = vision3dReadiness({ ...blocked, webcams: ['Cam'] });
  assert.ok(webcam.ready && webcam.source === 'webcam' && /intégrité de la mémoire/.test(webcam.note ?? ''));
  assert.match(vision3dMenuText({ mode: 'on' }, webcam).detail, /webcam utilisée/);
  // Intégrité de la mémoire sans Kinect : rien ne change pour la webcam.
  assert.deepEqual(vision3dReadiness({ kinect1: false, kinect1Driver: false, kinect2: false, webcams: ['Cam'], memoryIntegrity: true }), { ready: true, source: 'webcam', label: 'Cam' });
  assert.equal(vision3dHardware([], false, true).memoryIntegrity, true);
  assert.equal(vision3dHardware([], false).memoryIntegrity, undefined);
});

test('pilote de la Kinect : licence de Microsoft dite avant l’installation', () => {
  const driver = vision3dMenuText({ mode: 'off' }, { ready: false, reason: 'Kinect détectée', installKinectDriver: true }, { driverMb: 116 });
  assert.match(driver.detail, /acceptation de sa licence/);
});

test('Kinect : chaque raison de ne pas servir est dite (sans courant, sans pilote, pilote pas chargé), la webcam prend le relais', () => {
  const motor = usb(0x045e, 0x02b0);
  const camera = usb(0x045e, 0x02ae, { deviceClass: 'KinectSensor' });
  const cam = usb(0x046d, 0x085c, { deviceClass: 'Camera', name: 'Cam' });
  // Adaptateur secteur débranché : moteur et micros seulement.
  const noPower = vision3dReadiness(vision3dHardware([motor], true));
  assert.ok(!noPower.ready && /adaptateur secteur/.test(noPower.reason));
  // Pilote posé, mais Windows ne l'a pas chargé (intégrité de la mémoire désactivée sans redémarrer) : redémarrer.
  const notLoaded = vision3dReadiness(vision3dHardware([motor, camera], true, false, { started: false, problem: 52 }));
  assert.ok(!notLoaded.ready && notLoaded.restart && /code 52/.test(notLoaded.reason) && /redémarrez/.test(notLoaded.reason));
  // Le périphérique n'a aucun pilote (code 28), même si Kinect10.dll est là : réinstaller.
  const missing = vision3dReadiness(vision3dHardware([motor, camera], true, false, { started: false, problem: 28 }));
  assert.ok(!missing.ready && missing.installKinectDriver);
  // Pilote chargé : la Kinect sert.
  assert.equal(vision3dReadiness(vision3dHardware([motor, camera], true, false, { started: true, problem: 0 })).ready, true);
  // Pas prête mais une webcam branchée : la webcam sert, avec la raison.
  const fallback = vision3dReadiness(vision3dHardware([motor, camera, cam], true, false, { started: false, problem: 52 }));
  assert.ok(fallback.ready && fallback.source === 'webcam' && /Kinect pas prête/.test(fallback.note ?? ''));
  // Pilote à installer : proposé même avec une webcam branchée (la Kinect a été branchée pour servir).
  const install = vision3dReadiness(vision3dHardware([motor, camera, cam], false));
  assert.ok(!install.ready && install.installKinectDriver);
});

test('bilan d’une partie : le journal de VPX dit si le module est chargé, éteint ou introuvable', () => {
  const line = (s: string) => `2026-11-09 22:39:29.487 INFO  [Main] ${s}\n`;
  assert.equal(vision3dPluginLog(line('[MsgPI::MsgPlugin::Load@520] Plugin Vision3D loaded (library: D:\\CyberPinball\\emulators\\vpx\\current\\plugins\\vision3d\\plugin-vision3d64.dll) [id=20]')), 'loaded');
  assert.equal(vision3dPluginLog(line('[Player::Player@173] Plugin Vision3D was found but is disabled (D:\\x\\plugin-vision3d64.dll)')), 'disabled');
  assert.equal(vision3dPluginLog(line('[MsgPI::MsgPlugin::Load@500] Plugin Vision3D failed to load library plugin-vision3d64.dll')), 'failed');
  assert.equal(vision3dPluginLog(line('Plugin Vision3DX loaded (library: x)') + line('Plugin PUP loaded (library: y)')), 'absent');
  assert.equal(vision3dGameReport('loaded', 812).ok, true);
  assert.match(vision3dGameReport('loaded', 812).text, /812 positions/);
  assert.match(vision3dGameReport('loaded', 0).text, /aucune tête vue/);
  assert.match(vision3dGameReport('disabled', 300).text, /éteint/);
  assert.match(vision3dGameReport('absent', 300).text, /pas trouvé/);
  assert.match(vision3dGameReport('loaded', 0, 'la Kinect ne répond plus').text, /ne répondait pas/);
});
