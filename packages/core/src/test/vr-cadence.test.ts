// Cadence de VPX dans le casque (13 novembre 2026 sur une borne : chaque partie tombait de 69 à 28,1 images
// par seconde huit secondes après son début, sur toutes les tables ; « VPX ne répondait plus » en quittant
// casque retiré).

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { parseVrMeasures } from '../fronton-vr';
import { VR_NO_MIRROR } from '../vr';
import { describeVrCadence, describeVrCadenceTest, parseVrCadence, vrCadenceCapped, vrCadencePlateau, vrCadenceTest, vrQuitWithoutHeadset, vrTimerDegraded } from '../vr-cadence';

const repo = path.join(__dirname, '..', '..', '..', '..');
const read = (...p: string[]) => fs.readFileSync(path.join(repo, ...p), 'utf8').replace(/\r\n/g, '\n');

const row = (t: number, vpx: number, gap: number, timer?: number) =>
  `mesure t=${t} vpx=${vpx} ecart_ms=${gap} fronton=0.0 pup=0.0 video=0.2 jeu=1.00 pompees=56.2 zone=0,0,1,1 remplir_fronton=-1.00 remplir_dmd=-1.00 remplir_salle=0.75${timer === undefined ? '' : ` minuterie_ms=${timer}`}`;

/** Une partie de la borne, telle que le plugin l'a écrite le 13 novembre 2026 (avant la sonde de la minuterie). */
const BORNE = ['debut zone=0,0,1,1 ordre=PUP,B2S table=Table.vpx', row(5, 69.5, 64), 'capture nom=debut source=ecran luminosite=42 taille=960x540 resultat=ok', row(10, 54.0, 70), row(15, 28.1, 48), row(20, 28.0, 48), row(25, 28.1, 48), row(30, 28.1, 48), row(35, 28.1, 49), row(40, 28.0, 48)].join('\n');

test('cadence : le palier de la borne est reconnu (cadence fixe sous celle du casque), sans la sonde de la minuterie', () => {
  const c = parseVrCadence(BORNE)!;
  assert.equal(c.series.length, 8);
  assert.deepEqual(c.plateau, { fps: 28.1, samples: 6, share: 6 / 8, before: 69.5, at: 15 });
  assert.equal(c.timer, undefined);
  assert.equal(vrCadenceCapped(c), true);
  const said = describeVrCadence(c).join(' | ');
  assert.match(said, /palier de 28,1 images\/s/);
  assert.match(said, /après 69,5 images\/s en début de partie/);
  assert.match(said, /pas une table trop lourde/);
});

test('cadence : une table lourde, dont la cadence suit la scène, ou une partie qui tient sa cadence, ne fait pas un palier', () => {
  const series = (values: number[]) => values.map((fps, i) => ({ at: 5 * (i + 1), fps }));
  // Table lourde : la cadence varie de plus de 2,5 % d'un relevé à l'autre.
  assert.equal(vrCadencePlateau(series([31, 36, 28, 40, 33, 30, 37])), undefined);
  // Cadence tenue : stable, mais à celle du casque.
  assert.equal(vrCadencePlateau(series([69.5, 70.1, 69.8, 70.0, 69.9])), undefined);
  // Deux relevés seulement à la même cadence : pas encore un palier.
  assert.equal(vrCadencePlateau(series([69.5, 28.1, 28.0])), undefined);
  // Casque à 90 Hz : 45 images par seconde stables (demi-cadence) est un palier.
  assert.equal(vrCadencePlateau(series([88, 45.1, 45.0, 45.0, 44.9]), 90)?.fps, 45);
  assert.equal(vrCadenceCapped(parseVrCadence(['debut', row(5, 70, 30, 1.4), row(10, 69.8, 28, 1.3)].join('\n'))), false);
  assert.equal(parseVrCadence(''), undefined);
});

test('minuterie : dégradée (Sleep(1) à 15,6 ms), dite avec son instant et la garde ; tenue, dite aussi', () => {
  const degraded = parseVrCadence(
    ['debut', 'minuterie garde=0 quand=debut resultat=ok', row(5, 69.4, 60, 1.4), 'minuterie etat=degradee t=8.3 ms=15.6', row(10, 54, 70, 9.8), row(15, 28.1, 48, 15.6), row(20, 28.0, 48, 15.6), row(25, 28.1, 48, 15.5)].join('\n'),
  )!;
  assert.deepEqual(degraded.guard, { mode: 0, ok: true });
  assert.deepEqual(degraded.timerEvents, [{ degraded: true, at: 8.3, ms: 15.6 }]);
  assert.equal(degraded.timer!.degraded, 4);
  assert.equal(vrTimerDegraded(degraded), true);
  const said = describeVrCadence(degraded).join(' | ');
  assert.match(said, /minuterie de Windows dégradée à 8,3 s de partie/);
  assert.match(said, /Sleep\(1\) dure 15,6 ms au lieu de 1 à 2, 4 relevé\(s\) sur 5 ; sans garde/);
  const held = parseVrCadence(['debut', 'minuterie garde=1 quand=debut resultat=ok', row(5, 69.4, 60, 1.4), row(10, 69.9, 30, 1.3), row(15, 70.0, 29, 1.3)].join('\n'))!;
  assert.equal(vrTimerDegraded(held), false);
  assert.equal(held.plateau, undefined);
  assert.match(describeVrCadence(held).join(' | '), /minuterie de Windows tenue \(Sleep\(1\) dure 1,3 ms en moyenne, 1,4 au plus ; garde posée\)/);
  // Garde refusée par Windows (avant Windows 11) : dit tel quel.
  assert.match(describeVrCadence(parseVrCadence(['debut', 'minuterie garde=1 quand=debut resultat=refuse', row(5, 70, 30, 1.5)].join('\n'))!).join(' | '), /garde refusée par Windows/);
});

test('essai de cadence : les trois phases, et la conclusion selon ce que font la cadence et la minuterie', () => {
  const run = (after: [number, number], guarded: [number, number]) =>
    [
      'debut',
      'minuterie garde=0 quand=debut resultat=ok',
      'essai etape=debut t=0.0',
      row(5, 60, 200, 1.4), // démarrage de la partie : écarté
      row(10, 69.5, 30, 1.4),
      row(15, 69.6, 30, 1.3),
      row(20, 69.4, 30, 1.4),
      'essai etape=capture t=20.0',
      row(25, 40, 90, 9), // bascule après la capture : écarté
      row(30, after[0], 48, after[1]),
      row(35, after[0], 48, after[1]),
      row(40, after[0], 48, after[1]),
      'essai etape=garde t=40.0 resultat=ok',
      row(45, 50, 60, 5), // bascule après la garde : écarté
      row(50, guarded[0], 30, guarded[1]),
      row(55, guarded[0], 30, guarded[1]),
      row(60, guarded[0], 30, guarded[1]),
      'essai etape=fin t=60.0',
    ].join('\n');
  const proven = vrCadenceTest(run([28.1, 15.6], [69.5, 1.4]))!;
  assert.equal(proven.verdict, 'timer');
  assert.ok(Math.abs(proven.afterCapture!.fps - 28.1) < 1e-9);
  assert.equal(proven.afterCapture!.samples, 3);
  assert.ok(Math.abs(proven.afterGuard!.timerMs! - 1.4) < 1e-9);
  assert.match(describeVrCadenceTest(proven), /après la capture d’une fenêtre cachée 28,1 images\/s, Sleep\(1\) 15,6 ms ; après la garde de la minuterie 69,5 images\/s, Sleep\(1\) 1,4 ms ; cause prouvée/);
  assert.equal(vrCadenceTest(run([28.1, 1.4], [28.1, 1.4]))!.verdict, 'other');
  assert.equal(vrCadenceTest(run([28.1, 15.6], [28.1, 15.6]))!.verdict, 'guard-failed');
  assert.equal(vrCadenceTest(run([69.5, 1.4], [69.5, 1.4]))!.verdict, 'no-drop');
  // Partie quittée avant la fin de l'essai, ou sans essai.
  assert.equal(vrCadenceTest(['debut', 'essai etape=debut t=0.0', row(5, 69, 30, 1.4), row(10, 69, 30, 1.4)].join('\n'))!.verdict, 'incomplete');
  assert.equal(vrCadenceTest(BORNE), undefined);
});

test('sortie casque retiré : VPX ne préparait plus d’image quand la sortie a été demandée', () => {
  assert.deepEqual(vrQuitWithoutHeadset(['debut', row(5, 69, 30, 1.4), 'sortie t=118.2 sans_image_ms=2412'].join('\n')), { at: 118.2, idleMs: 2412 });
  // Casque porté : la dernière image date de quelques millisecondes.
  assert.equal(vrQuitWithoutHeadset(['debut', 'sortie t=40.0 sans_image_ms=14'].join('\n')), undefined);
  // La dernière demande compte (la première a pu ouvrir un menu, casque porté).
  assert.equal(vrQuitWithoutHeadset(['debut', 'sortie t=10.0 sans_image_ms=3000', 'sortie t=40.0 sans_image_ms=12'].join('\n')), undefined);
  assert.equal(vrQuitWithoutHeadset(BORNE), undefined);
});

test('capture de l’aperçu : pas prise quand l’aperçu est réduit à un timbre, et jamais sur une fenêtre cachée de VPX', () => {
  const m = parseVrMeasures(['debut', 'capture nom=debut taille=320x180 resultat=apercu_reduit', row(5, 69, 30, 1.4)].join('\n'))!;
  assert.deepEqual(m.captures, [{ name: 'debut', source: '?', brightness: 0, ok: false, reason: 'apercu_reduit' }]);
  const plugin = read('packages', 'vpx-vision3d', 'src', 'cyberpinball.cpp');
  // La capture ne vise que les fenêtres montrées (la plus grande fenêtre de VPX est une fenêtre cachée en VR)…
  assert.match(plugin, /const std::vector<HWND> fenetres = fenetresVpx\(!commeAvant\);/);
  assert.match(plugin, /\(!reinterpret_cast<Trouvees\*>\(p\)->visibles \|\| IsWindowVisible\(w\)\)/);
  // … et seulement un aperçu qui recopie la vue du casque : le timbre de la recopie éteinte est plus petit.
  const min = /constexpr int APERCU_MIN_L = (\d+), APERCU_MIN_H = (\d+);/.exec(plugin)!;
  const stamp = (key: string) => Number(VR_NO_MIRROR.find((s) => s.key === key)!.value);
  assert.ok(stamp('PreviewWidth') < Number(min[1]) && stamp('PreviewHeight') < Number(min[2]));
  // Seul l'essai de cadence refait la capture d'avant, et seulement s'il est demandé.
  assert.equal(plugin.match(/capturer\("\w+", true\)/g)?.length, 1);
  assert.match(plugin, /if \(!essaiCadence_Val \|\| mesures\.debut < 0\.0 \|\| mesures\.essai >= 4\)\s+return;/);
  assert.match(read('app', 'src', 'frontend.ts'), /process\.env\.CYBERPINBALL_ESSAI_CADENCE === '1' \? \[\{ section: 'Plugin\.CyberPinball', key: 'CadenceTest', value: '1' \}\] : \[\]/);
});

test('garde de la minuterie : posée au début de chaque partie dans le casque, mesurée à chaque relevé', () => {
  const plugin = read('packages', 'vpx-vision3d', 'src', 'cyberpinball.cpp');
  const start = plugin.slice(plugin.indexOf('void MSGPIAPI onGameStart'), plugin.indexOf('void MSGPIAPI onGameEnd'));
  assert.match(start, /garderMinuterie\("debut"\);\s+sondeMinuterie\.demarrer\(\);/);
  // La garde est le défaut du plugin : une borne dont l'INI ne dit rien est gardée.
  assert.match(plugin, /MSGPI_INT_VAL_SETTING\(gardeMinuterie, "TimerGuard", .+, true, 0, 2, 1\);/);
  assert.match(plugin, /remplir_salle=%\.2f minuterie_ms=%\.1f"/);
  // La sonde ne coûte rien à l'image : aucune attente dans la boucle de VPX (elle dort sur son propre fil).
  const frame = plugin.slice(plugin.indexOf('void suivreMinuterie'), plugin.indexOf('/** À chaque image : compte'));
  assert.doesNotMatch(frame, /Sleep\(|WaitFor/);
  const header = read('packages', 'vpx-vision3d', 'src', 'minuterie.h');
  assert.match(header, /SetProcessInformation\(GetCurrentProcess\(\), ProcessPowerThrottling, &etat, sizeof\(etat\)\)/);
  assert.match(header, /constexpr ULONG MINUTERIE_IGNOREE = 0x4;/);
  // Le journal de fin de partie dit le palier, la minuterie et la sortie casque retiré.
  const frontend = read('app', 'src', 'frontend.ts');
  for (const call of ['describeVrCadence(cadence)', 'vrCadenceTest(block.text, cadence)', 'vrQuitWithoutHeadset(block.text)']) assert.ok(frontend.includes(call), call);
});
