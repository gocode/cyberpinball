// Cadence des images d'une partie : écrite dans vpinball.log par le plugin « CyberPinballDmd » (cadence.h), relue par
// Cyber Pinball (vpxcadence.ts). Le 17/11/2026, des tables « ramaient énormément » sur une borne et aucun rapport ne
// disait de combien : chaque partie laisse désormais son bilan dans le journal de VPX, donc dans chaque rapport.

import * as assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { nativeBench } from './banc-natif';
import { cadenceJournal, cadenceVerdict, parseVpxCadence, readVpxCadence, readVpxTargetFps, stallPlace, stallPlaceJournal, vpxMemoryGrowth } from '../vpxcadence';

const repo = path.join(__dirname, '..', '..', '..', '..');
const read = (...p: string[]) => fs.readFileSync(path.join(repo, ...p), 'utf8');

const END = '2026-11-17 12:32:48.240 INFO  [Main] [CyberPinballDmd:onGameEnd@560] Cadence end: frames=3512 duration=61.2s fps=57.4 p50=17ms p95=18ms p99=33ms max=412ms late=2.1% stalls=5 worst10s=41.2fps';

test('cadence : la ligne de bilan du plugin, relue champ par champ', () => {
  assert.deepEqual(parseVpxCadence(END), { phase: 'end', frames: 3512, durationS: 61.2, fps: 57.4, p50: 17, p95: 18, p99: 33, max: 412, late: 2.1, stalls: 5, worst10s: 41.2 });
  // Partie de moins de 10 s mesurées : pas de pire fenêtre (-1 dans la ligne).
  assert.equal(parseVpxCadence('Cadence running: frames=500 duration=8.3s fps=60.0 p50=17ms p95=17ms p99=17ms max=20ms late=0.0% stalls=0 worst10s=-1.0fps')?.worst10s, undefined);
  assert.equal(parseVpxCadence('Cadence: stall of 250 ms at 31.2s'), undefined);
  // La mémoire de VPX, à la suite du bilan.
  assert.equal(parseVpxCadence(`${END} mem=1834MB`)?.memMB, 1834);
});

test('cadence : la mémoire prise par VPX d’un bilan à l’autre', () => {
  const at = (s: number, mem: number) => `Cadence running: frames=${s * 60} duration=${s}.0s fps=60.0 p50=17ms p95=17ms p99=17ms max=17ms late=0.0% stalls=0 worst10s=60.0fps mem=${mem}MB`;
  assert.deepEqual(vpxMemoryGrowth([at(55, 1200), at(115, 1900), at(175, 2600)]), { fromMB: 1200, toMB: 2600, minutes: 2 });
  assert.equal(vpxMemoryGrowth([at(55, 1200)]), undefined);
  assert.equal(vpxMemoryGrowth([END]), undefined);
});

test('cadence : même forme écrite par le plugin et lue par Cyber Pinball (cadence.h)', () => {
  const h = read('packages', 'vpx-vision3d', 'src', 'cadence.h');
  const format = /"(Cadence %s: [^"]+)"/.exec(h)?.[1];
  assert.ok(format, 'format du bilan introuvable dans cadence.h');
  // Le format rempli comme le ferait snprintf : il doit se relire.
  const values = ['end', '1200', '20.0', '60.0', '17', '17', '17', '17', '0.0', '0', '60.0'];
  let i = 0;
  const line = format.replace(/%%/g, '\u0000').replace(/%(\.1f|d|s)/g, () => values[i++]!).replace(/\u0000/g, '%');
  assert.equal(i, values.length);
  assert.deepEqual(parseVpxCadence(line), { phase: 'end', frames: 1200, durationS: 20, fps: 60, p50: 17, p95: 17, p99: 17, max: 17, late: 0, stalls: 0, worst10s: 60 });
});

test('cadence : le bilan de fin l’emporte, sinon le dernier d’étape (VPX arrêté avant la fin)', () => {
  const running = (fps: number) => `Cadence running: frames=3600 duration=60.0s fps=${fps} p50=17ms p95=17ms p99=20ms max=40ms late=0.5% stalls=0 worst10s=59.0fps`;
  assert.equal(readVpxCadence([running(59), 'autre ligne', running(41)])?.fps, 41);
  assert.equal(readVpxCadence([running(59), END, running(30)])?.fps, 30);
  assert.equal(readVpxCadence([running(59), END])?.phase, 'end');
  assert.equal(readVpxCadence(['rien']), undefined);
});

test('cadence : la cible lue au lancement de VPX (son maximum et l’écran)', () => {
  assert.equal(readVpxTargetFps(['[Player::Player@344] Synchronization mode: 3 with maximum FPS: 60, display FPS: 60']), 60);
  assert.equal(readVpxTargetFps(['Synchronization mode: 3 with maximum FPS: -1, display FPS: 120']), 120);
  assert.equal(readVpxTargetFps(['Synchronization mode: 0 with maximum FPS: 0, display FPS: 144']), 144);
  assert.equal(readVpxTargetFps(['Synchronization mode: 1 with maximum FPS: 60, display FPS: 120']), 60);
  assert.equal(readVpxTargetFps([]), undefined);
});

test('cadence : verdict (moyenne, pire moment, images en retard, à-coups)', () => {
  const c = parseVpxCadence(END)!;
  // 57,4 pour 60 : moyenne tenue, mais une fenêtre à 41 (sous 75 %) : la table rame par moments.
  assert.deepEqual(cadenceVerdict(c, 60), { slow: true, stutters: true });
  assert.deepEqual(cadenceVerdict({ ...c, worst10s: 58, stalls: 0 }, 60), { slow: false, stutters: false });
  assert.deepEqual(cadenceVerdict({ ...c, worst10s: 58, stalls: 0, late: 12 }, 60), { slow: true, stutters: false });
  assert.deepEqual(cadenceVerdict({ ...c, worst10s: 58, stalls: 0, fps: 52 }, 60), { slow: true, stutters: false });
  // À-coups : au moins trois, et au moins un par minute.
  assert.equal(cadenceVerdict({ ...c, worst10s: 58, stalls: 3, durationS: 600 }, 60)?.stutters, false);
  // Écran à 120 Hz : 60 images/s, c'est ramer.
  assert.equal(cadenceVerdict({ ...c, fps: 60, worst10s: 60, stalls: 0 }, 120)?.slow, true);
  // Trop court pour juger.
  assert.equal(cadenceVerdict({ ...c, durationS: 12 }, 60), undefined);
});

test('cadence : la ligne du journal de la borne dit le verdict et les chiffres', () => {
  const line = cadenceJournal('Deadpool (Stern 2018)', parseVpxCadence(END)!, 60);
  assert.match(line, /^Cadence de la partie \(Deadpool \(Stern 2018\)\) : RAME, avec des à-coups — 57,4 images\/s pour 60 visées/);
  assert.match(line, /pire écart 412 ms, 2,1 % d'images en retard, 5 à-coup\(s\), pire fenêtre de 10 s à 41,2 images\/s ; 61,2 s mesurées\.$/);
});

test('plugin du DMD : la cadence écrite dans vpinball.log (API de journal de VPX), à-coups au moment où ils arrivent', () => {
  const cpp = read('packages', 'vpx-vision3d', 'src', 'dmd-suivi.cpp');
  assert.match(cpp, /#include "LoggingPlugin\.h"/);
  assert.match(cpp, /LPISetup\(endpointId, msgApi\);/);
  assert.match(cpp, /LPI_LOGW\("Cadence: stall of %d ms at %\.1fs%s"/);
  assert.match(cpp, /direBilan\("end"\);/);
  // La mémoire de VPX à chaque bilan (« fuite de mémoire » d'un rapport du 17/11/2026).
  assert.match(cpp, /" mem=%dMB", memoireMo\(\)/);
  for (const set of ['vpx-10.8.1', 'vpx-10.9.0']) assert.match(read('packages', 'vpx-vision3d', 'vendor', set, 'PROVENANCE.txt'), /LoggingPlugin\.h/);
});

test('à-coups : chacun dit où était le fil des images (relevé pendant l’attente, sans verrou pendant la suspension)', () => {
  const cpp = read('packages', 'vpx-vision3d', 'src', 'dmd-suivi.cpp');
  assert.match(cpp, /#include "arrets\.h"/);
  assert.match(cpp, /releveDemarre = releve\.demarrer\(\);/, 'démarré depuis le fil des images');
  assert.match(cpp, /"; main thread "/);
  assert.match(cpp, /releve\.arreter\(\);[\s\S]*CyberPinballDmdPluginUnload|CyberPinballDmdPluginUnload[\s\S]*releve\.arreter\(\);/);
  // Pendant la suspension : registres, VirtualQuery et une copie, rien d'autre (ni allocation, ni chargeur, ni journal).
  const h = read('packages', 'vpx-vision3d', 'src', 'arrets.h');
  // Le même relevé sert à la boucle de jeu et au fil du rendu (`cible`).
  const suspended = h.slice(h.indexOf('SuspendThread(cible)'), h.indexOf('ResumeThread(cible)'));
  assert.ok(suspended.length > 0);
  const calls = [...suspended.matchAll(/\b([A-Za-z_]\w*)\s*\(/g)].map((m) => m[1]);
  for (const call of calls) assert.ok(['SuspendThread', 'GetThreadContext', 'static_cast', 'reinterpret_cast', 'VirtualQuery', 'sizeof', 'min', 'memcpy', 'if', 'defined'].includes(call!), `appel pendant la suspension : ${call}`);
  // Les fils à relever se cherchent entre les arrêts, jamais pendant : l'instantané des fils de la machine prend des
  // centaines de ms quand elle est chargée et mangeait tout le relevé d'un à-coup (banc du 25/11/2026).
  const veiller = h.slice(h.indexOf('void veiller()'), h.indexOf('timeEndPeriodSur();', h.indexOf('void veiller()')));
  const pendant = veiller.slice(veiller.indexOf('MAX_PAR_ARRET'));
  assert.ok(veiller.includes('ouvrirFilNomme(') && veiller.includes('ouvrirAutres()') && pendant.length > 0);
  assert.doesNotMatch(pendant, /ouvrirFilNomme\(|ouvrirAutres\(|CreateToolhelp32Snapshot/, 'recherche des fils pendant un arrêt');
  assert.match(read('packages', 'vpx-vision3d', 'CMakeLists.txt'), /add_executable\(banc-arrets test\/banc-arrets\.cpp\)/);
});

test('à-coups : où attendait VPX, lu dans les lignes du relevé (rapport de Daredevil du 18/11/2026)', () => {
  const lines = [
    "2026-11-18 15:27:25.395 WARN  [Main] [CyberPinballDmd:`anonymous-namespace'::compterImage@309] Cadence: stall of 508 ms at 5.9s; main thread 104 samples: in ntdll.dll 104; under MPCLIENT.DLL 104; top MPCLIENT.DLL+0x2ee6f (99)",
    "2026-11-18 15:27:25.510 WARN  [Main] [CyberPinballDmd:`anonymous-namespace'::compterImage@309] Cadence: stall of 115 ms at 6.0s; main thread 17 samples: in ntdll.dll 14, amsi.dll 2, msvcrt.dll 1; under MPCLIENT.DLL 13, VPinballX_BGFX64.exe 4; top MPCLIENT.DLL+0x17dc0 (12)",
    "2026-11-18 15:27:53.588 WARN  [Main] [CyberPinballDmd:`anonymous-namespace'::compterImage@309] Cadence: stall of 143 ms at 34.1s; main thread 22 samples: in ntdll.dll 17, RPCRT4.dll 1, vbscript.dll 1, amsi.dll 1; under MPCLIENT.DLL 17, VPinballX_BGFX64.exe 5; top MPCLIENT.DLL+0x17dc0 (13) (no more stalls logged)",
    'Cadence: stall of 250 ms at 31.2s',
  ];
  const place = stallPlace(lines)!;
  assert.equal(place.module, 'MPCLIENT.DLL');
  assert.equal(place.samples, 143);
  assert.equal(Math.round(place.share * 100), 94);
  assert.match(place.what!, /antivirus/);
  assert.equal(stallPlaceJournal('DAREDEVIL_1.3', lines), "À-coups de la partie (DAREDEVIL_1.3) : le fil des images de VPX était surtout dans MPCLIENT.DLL (94 % de 143 relevés), l'antivirus de Windows, qui analyse du code compilé par le script (ExecuteGlobal, Execute, Eval).");
  // Plugin d'avant le relevé, ou partie sans à-coup : rien à dire.
  assert.equal(stallPlace(['Cadence: stall of 250 ms at 31.2s']), undefined);
  assert.equal(stallPlace(['Cadence: stall of 300 ms at 2.0s; main thread 50 samples: in avcodec-61.dll 50; under plugin-flexdmd64.dll 50; top x (1)'])?.module, 'plugin-flexdmd64.dll');
  assert.match(stallPlace(['Cadence: stall of 300 ms at 2.0s; main thread 50 samples: in x 50; under swscale-8.dll 50; top x (1)'])!.what!, /vidéo/);
});

test('à-coups : la boucle de jeu qui attend le rendu (rapport du 21/11/2026), et où était le fil du rendu', () => {
  // Lignes réelles de la borne d'Eric (24, plugin d'avant le relevé du rendu) : SDL364.dll = la pause de la boucle de jeu.
  const old = [
    "2026-11-21 14:04:22.115 WARN  [Main] [CyberPinballDmd:`anonymous-namespace'::compterImage@309] Cadence: stall of 128 ms at 104.3s; main thread 20 samples: in ntdll.dll 13, SDL364.dll 5, KERNELBASE.dll 1, VPinballX_BGFX64.exe 1; under SDL364.dll 15, VPinballX_BGFX64.exe 5; top SDL364.dll+0x1770c0 (8)",
    "2026-11-21 14:06:30.305 WARN  [Main] [CyberPinballDmd:`anonymous-namespace'::compterImage@309] Cadence: stall of 129 ms at 232.4s; main thread 20 samples: in ntdll.dll 17, SDL364.dll 2, USER32.dll 1; under SDL364.dll 20; top SDL364.dll+0x1770c0 (17)",
  ];
  assert.match(stallPlaceJournal('24', old)!, /surtout dans SDL364\.dll \(88 % de 40 relevés\), une pause de VPX, qui attend le fil du rendu\.$/);
  // Nouveau relevé : la partie du rendu ne se mêle pas à celle de la boucle de jeu, et dit où le rendu bloquait.
  const withRender = [
    'Cadence: stall of 128 ms at 104.3s; main thread 20 samples: in ntdll.dll 15, SDL364.dll 5; under SDL364.dll 20; top SDL364.dll+0x1770c0 (8) | render thread 20 samples: in nvwgf2umx.dll 14, ntdll.dll 6; under VPinballX_BGFX64.exe 20; top VPinballX_BGFX64.exe+0x5c042d (9)',
    'Cadence: stall of 131 ms at 120.0s; main thread 21 samples: in ntdll.dll 21; under SDL364.dll 21 | render thread 21 samples: in nvwgf2umx.dll 21; under VPinballX_BGFX64.exe 21; top VPinballX_BGFX64.exe+0x5c042d (21) (no more stalls logged)',
  ];
  const place = stallPlace(withRender)!;
  assert.equal(place.module, 'SDL364.dll', 'la liste du rendu ne pollue pas celle de la boucle de jeu');
  assert.equal(place.samples, 41);
  assert.equal(place.render!.module, 'nvwgf2umx.dll');
  assert.match(place.render!.what!, /pilote de la carte graphique/);
  assert.match(stallPlaceJournal('24', withRender)!, / ; le fil du rendu était surtout dans nvwgf2umx\.dll \(85 % de 41 relevés\), le pilote de la carte graphique\.$/);
  // Rendu qui attend dans Windows : on dit qui l'a appelé.
  const waiting = ['Cadence: stall of 120 ms at 9.0s; main thread 10 samples: in ntdll.dll 10; under SDL364.dll 10 | render thread 10 samples: in ntdll.dll 10; under plugin-pup64.dll 10; top plugin-pup64.dll+0x40 (10)'];
  assert.equal(stallPlace(waiting)!.render!.module, 'plugin-pup64.dll');
  assert.equal(stallPlace(waiting)!.render!.what, undefined);
});

test('à-coups : banc du relevé (comptes par module, vrai fil suspendu), s’il est construit', (t) => {
  const banc = nativeBench('banc-arrets.exe');
  if ('skip' in banc) return t.skip(banc.skip);
  const run = spawnSync(banc.exe, [], { encoding: 'utf8', windowsHide: true });
  assert.equal(run.status, 0, run.stdout);
  assert.match(run.stdout, /tout va bien/);
});

test('cadence : banc de la logique (histogramme, centiles, à-coups, pire fenêtre), s’il est construit', (t) => {
  const banc = nativeBench('banc-cadence.exe');
  if ('skip' in banc) return t.skip(banc.skip);
  const run = spawnSync(banc.exe, [], { encoding: 'utf8', windowsHide: true });
  assert.equal(run.status, 0, run.stdout);
  assert.match(run.stdout, /tout va bien/);
});
