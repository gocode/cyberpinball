// La table de VPX derrière le joueur au lancement de la partie (essai du 10 novembre 2026, 13:44) : le
// runtime garde « Réinitialiser la vue » par application. Preuve sur les relevés de l'essai, puis les
// invariants du correctif (une clé de runtime neuve pour le compagnon à chaque recentrage) et des
// détecteurs (joué dos à la borne, changement de pièce reçu par VPX).

import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { companionKeyFolder, gameHeadSummary, lockbarPlace, placeLockbar, readCompanionKey, roomMismatchProblem, vpxRoomChanges, type Point3 } from '../calage';

const DEG = Math.PI / 180;
const close = (a: number, b: number, eps: number, what: string) => assert.ok(Math.abs(a - b) <= eps, `${what} : ${a.toFixed(3)} ≠ ${b.toFixed(3)}`);
const wrap = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;

// Le même bord de bureau, touché dans deux sessions neuves du compagnon, sur le même lien Link :
// 11:26:43 (avant) et 11:35:26 (après), autour de deux « Réinitialiser la vue » de Link visant la clé
// du compagnon (journal du service d'Oculus, 11:28:29 et 11:31:09) et d'un compagnon relancé (11:34:35).
const C = { left: { x: -0.45239, y: 1.008356, z: 0.82886 }, right: { x: -0.870554, y: 1.029442, z: 0.669632 } };
const D = { left: { x: -0.297873, y: 1.075623, z: 0.347397 }, right: { x: 0.230506, y: 1.062592, z: 0.379818 } };
const angle = (p: typeof C) => Math.atan2(p.right.z - p.left.z, p.right.x - p.left.x);
const mid = (p: typeof C) => ({ x: (p.left.x + p.right.x) / 2, z: (p.left.z + p.right.z) / 2 });

test('pièce de VPX : le recentrage du compagnon garde sa pièce tournée dans ses sessions neuves', () => {
  // Session neuve après les recentrages : le bord de bureau tourné de 163°. Une session neuve ne revient
  // donc pas à la pièce d'origine : le recentrage reste attaché au compagnon.
  close(Math.abs(wrap((angle(D) - angle(C)) / DEG)), 162.7, 0.5, 'rotation du bord de bureau entre les deux sessions neuves');
});

test('pièce de VPX : calée dans la pièce recentrée du compagnon, la table tombe derrière le joueur dans celle de VPX', () => {
  // De la pièce du compagnon (D) à celle de VPX, jamais recentré (C) : le bord de bureau en repère commun.
  const turn = angle(C) - angle(D);
  const mC = mid(C);
  const mD = mid(D);
  const toC = (p: { x: number; z: number }) => {
    const x = p.x - mD.x;
    const z = p.z - mD.z;
    return { x: mC.x + x * Math.cos(turn) - z * Math.sin(turn), z: mC.z + x * Math.sin(turn) + z * Math.cos(turn) };
  };
  // Tête du joueur au lancement (13:44:49, compagnon en veille) : 4 cm derrière la barre avant calée, face à elle.
  const place = lockbarPlace(D.left as Point3, D.right as Point3);
  const head = { x: -0.21, z: 0.422, yaw: 5 * DEG };
  const fwd = (yaw: number) => ({ x: -Math.sin(yaw), z: -Math.cos(yaw) });
  const { left, right } = placeLockbar(place);
  const bar = { x: (left.x + right.x) / 2, z: (left.z + right.z) / 2 };
  const ahead = (p: { x: number; z: number }, from: { x: number; z: number }, f: { x: number; z: number }) => (p.x - from.x) * f.x + (p.z - from.z) * f.z;
  assert.ok(ahead(bar, head, fwd(head.yaw)) > 0, 'dans la pièce du compagnon, la barre avant devant le joueur');
  // VPX pose la table aux mêmes nombres, mais dans sa pièce : vue de la tête (la même, physiquement).
  const headC = toC(head);
  const f0 = fwd(head.yaw);
  const fC = { x: f0.x * Math.cos(turn) - f0.z * Math.sin(turn), z: f0.x * Math.sin(turn) + f0.z * Math.cos(turn) };
  close(ahead(bar, headC, fC), -0.47, 0.03, 'barre avant de VPX devant la tête (négatif : derrière)');
  const tableYaw = Math.atan2(-fwd(place.yaw).x, -fwd(place.yaw).z);
  const gazeYaw = Math.atan2(-fC.x, -fC.z);
  assert.ok(Math.abs(wrap((tableYaw - gazeYaw) / DEG)) > 160, 'table tournée vers l’arrière du joueur');
});

test('clé du compagnon : génération gardée, dossier par génération', () => {
  assert.equal(readCompanionKey(undefined), 0);
  assert.equal(readCompanionKey('pas du json'), 0);
  assert.equal(readCompanionKey('{"generation": 0}'), 0);
  assert.equal(readCompanionKey('{"generation": 3, "pourquoi": "x"}'), 3);
  assert.equal(companionKeyFolder(4), 'compagnon-4');
});

test('détecteurs : joué dos à la borne calée, changement de pièce reçu par VPX', () => {
  const place = lockbarPlace(D.left as Point3, D.right as Point3);
  const facing = [0, 1, 2, 3].map((i) => ({ x: -0.2, z: 0.42, yaw: place.yaw + i * 5 * DEG }));
  const behind = [0, 1, 2, 3].map((i) => ({ x: -0.2, z: 0.42, yaw: place.yaw + Math.PI + i * 5 * DEG }));
  assert.equal(roomMismatchProblem(gameHeadSummary(facing, place)), undefined);
  assert.match(roomMismatchProblem(gameHeadSummary(behind, place)) ?? '', /dos à la borne calée/);
  // Trop peu de relevés : rien n'est conclu.
  assert.equal(roomMismatchProblem(gameHeadSummary(behind.slice(0, 2), place)), undefined);
  assert.equal(gameHeadSummary(behind, place).turned, 4);
  const log = '2026-11-10 14:45:00.000 INFO  [RenderThread] [VRDevice::PollEvents@816] OPENXR: Reference Space Change pending for Session: 0000000000000002\n';
  assert.equal(vpxRoomChanges(log + log), 2);
  assert.equal(vpxRoomChanges('OPENXR: Interaction Profile changed for Session: 2'), 0);
});

test('correctif : le compagnon sous une clé de runtime neuve à chaque recentrage, la partie jamais fermée pour sa veille', () => {
  const repo = path.join(__dirname, '..', '..', '..', '..');
  const read = (...p: string[]) => fs.readFileSync(path.join(repo, ...p), 'utf8');
  const menu = read('app', 'src', 'casque.ts');
  // Lancé depuis la copie de la génération en cours ; première fois : clé 1, la borne à vérifier.
  assert.match(menu, /const exe = this\.keyedExe\(headsetExe\(this\.opts\.appDir\)\);/);
  assert.match(menu, /const target = path\.join\(dir, companionKeyFolder\(generation\), EXE\);/);
  assert.match(menu, /generation = 1;\s*this\.writeKey\(generation, 'première clé à lui'\);[^\n]*\s*this\.keyRenewed = /);
  // Pièce recentrée sous sa session : génération suivante, puis session neuve.
  assert.match(menu, /if \(line\.startsWith\('piece-changee'\)\) \{[\s\S]{0,1600}this\.writeKey\(generation \+ 1, /);
  // Session en veille perdue : pas le casque perdu (onLost ferme VPX).
  assert.match(menu, /if \(line\.startsWith\('session-veille-perdue'\)\) \{\s*this\.opts\.log\([^\n]*\n\s*continue;\s*\}/);
  const cpp = read('packages', 'casque-vr', 'src', 'casque.cpp');
  assert.match(cpp, /if \(standby && r == XR_ERROR_RUNTIME_FAILURE\)\s*\{[\s\S]{0,200}say\("session-veille-perdue xrWaitFrame " \+ hex\(r\)\);/);
  const frontend = read('app', 'src', 'frontend.ts');
  assert.match(frontend, /keyDir: path\.join\(loc\.dataDir, 'vr'\),/);
  // Toutes les têtes de la partie, et le bilan à la fin ; dit à l'écran du calage.
  assert.match(frontend, /function headInGame\(head: HeadPose\): void \{\s*gameHeads\.push\(head\);/);
  assert.match(frontend, /if \(playedVr && vrGame\) checkVrRoomAfterGame\(vpxLog, vrLogFrom\);/);
  assert.match(frontend, /problem \?\?\s*vrRoomProblem \?\?/);
});

test('écrans stables : en couches « quad » hors calage, profondeur de la scène soumise au runtime', () => {
  // Essai du 10 novembre 2026 : Link comptait 147 à 1 359 images du compagnon par minute (4 320 attendues
  // à 72 Hz) ; les écrans, dessinés dans la couche de projection sans profondeur, étaient réaffichés par
  // le runtime avec la seule rotation de la tête : ils glissaient quand elle bougeait de côté.
  const repo = path.join(__dirname, '..', '..', '..', '..');
  const cpp = fs.readFileSync(path.join(repo, 'packages', 'casque-vr', 'src', 'casque.cpp'), 'utf8');
  assert.match(cpp, /const bool quadScreens = projection && !calibrating;/);
  assert.match(cpp, /for \(Panel& p : panels\)\s*\{\s*if \(quadScreens\)\s*break;/);
  assert.match(cpp, /if \(fs\.shouldRender && worn && \(!projection \|\| quadScreens\)\)/);
  // Chaque couche quad : posée dans la pièce (STAGE), à l'heure prédite de l'image.
  assert.match(cpp, /q\.space = base;/);
  assert.match(cpp, /fe\.displayTime = fs\.predictedDisplayTime;/);
  assert.match(cpp, /vli\.displayTime = fs\.predictedDisplayTime;\s*vli\.space = base;/);
  // Profondeur : extension demandée si présente, mêmes proche et lointain que la projection.
  assert.match(cpp, /depthLayer \|= std::string\(e\.extensionName\) == XR_KHR_COMPOSITION_LAYER_DEPTH_EXTENSION_NAME;/);
  assert.match(cpp, /constexpr float NEAR_Z = 0\.05f, FAR_Z = 50\.f;/);
  assert.doesNotMatch(cpp, /0\.05f, 50\.f\)/);
  assert.match(cpp, /depthInfos\[e\]\.nearZ = NEAR_Z;\s*depthInfos\[e\]\.farZ = FAR_Z;\s*projViews\[e\]\.next = &depthInfos\[e\];/);
});
