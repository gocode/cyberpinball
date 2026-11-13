// Scénarios du banc d'essai du casque (scripts/banc-casque.mjs) : le vrai compagnon sur le runtime OpenXR
// factice, sans casque ni fenêtre. Plus aucun correctif de la VR sans passage ici (13 novembre 2026).
// Le banc se construit avec le compagnon (npm run casque-vr) ; sans lui, ces essais sont sautés et le disent.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as os from 'node:os';
import * as path from 'node:path';
import { BANC_RUNTIME, BANC_SONDE, bancPerime, bancPret, jouer, sonder } from './banc-casque.mjs';

const pret = bancPret();
const sauf = pret ? {} : { skip: 'banc pas construit : npm run casque-vr' };

// Un banc compilé avant ses sources joue l'ancien code : ses échecs ne disent rien du nouveau (vu le 13/11/2026,
// une sonde de 21:16 face au test de 21:49). L'essai le dit au lieu de laisser chercher une fausse régression.
test('banc : compilé après ses sources', sauf, () => {
  const perimees = bancPerime();
  assert.deepEqual(perimees, [], `banc compilé avant ces sources, relancez npm run casque-vr : ${perimees.join(', ')}`);
});

const lignes = (r, re) => r.lignes.filter((l) => re.test(l.ligne));
const trace = (r, re) => r.trace.filter((l) => re.test(l.ligne));

test('banc : dix retraits du casque de suite, une seule vie du compagnon et une seule session', sauf, async () => {
  const etapes = ['0 porte 1', '0 limite fixe'];
  for (let i = 0; i < 10; i++) etapes.push(`${1500 + i * 1200} porte 0`, `${2100 + i * 1200} porte 1`);
  const r = await jouer(etapes.join('\n'), { dureeMs: 15000, relancer: true });
  assert.equal(r.lancements, 1, 'le compagnon n’est jamais relancé');
  assert.equal(trace(r, /^session creee$/).length, 1, 'une seule session');
  assert.equal(lignes(r, /^session-suspendue$/).length, 10);
  assert.equal(lignes(r, /^session-reprise ok/).length, 10);
  assert.equal(lignes(r, /^porte 1$/).length, 11);
  assert.equal(lignes(r, /^session-arretee/).length, 0);
  // Le casque remis, les images repartent dans la même session.
  assert.ok(trace(r, /^begin$/).length === 11);
});

test('banc : Link qui ne redonne pas la session (accueil à rechoisir) ; repli sur une session neuve', sauf, async () => {
  const r = await jouer(['0 porte 1', '0 reprise manuelle', '1500 porte 0', '2200 porte 1'].join('\n'), { dureeMs: 7000, relancer: true, suspensionMaxMs: 3000 });
  assert.equal(lignes(r, /^session-suspendue$/).length, 1);
  assert.equal(lignes(r, /^session-arretee pas reprise en 3 s$/).length, 1, 'repli dit au journal');
  assert.equal(r.lancements, 2, 'compagnon relancé une fois, après le délai seulement');
  // La session neuve prend le casque porté.
  assert.equal(lignes(r, /^porte 1$/).filter((l) => l.pid !== r.lignes[0].pid).length, 1);
});

test('banc : la session redonnée quand l’application est rechoisie, avant le repli', sauf, async () => {
  const r = await jouer(['0 porte 1', '0 reprise manuelle', '1500 porte 0', '2200 porte 1', '3500 choisir'].join('\n'), { dureeMs: 6000, relancer: true, suspensionMaxMs: 10000 });
  assert.equal(r.lancements, 1);
  assert.equal(lignes(r, /^session-reprise ok/).length, 1);
});

test('banc : limite fixe ou limite de pièce, dites au lancement', sauf, async () => {
  const fixe = await jouer('0 porte 1\n0 limite fixe', { dureeMs: 2500 });
  assert.equal(lignes(fixe, /^piece aucune$/).length, 1);
  const piece = await jouer('0 porte 1\n0 limite piece 2.49 3.38', { dureeMs: 2500 });
  assert.equal(lignes(piece, /^piece 2\.49\d* 3\.38\d*$/).length, 1);
});

test('banc : les deux clics des joysticks arrivent au menu, casque porté', sauf, async () => {
  const r = await jouer(
    ['0 porte 1', '1500 bouton /user/hand/left/input/thumbstick/click 1', '1600 bouton /user/hand/right/input/thumbstick/click 1', '2500 bouton /user/hand/left/input/thumbstick/click 0', '2500 bouton /user/hand/right/input/thumbstick/click 0'].join('\n'),
    { dureeMs: 3500 },
  );
  assert.equal(lignes(r, /^bouton clic-joystick-gauche 1$/).length, 1);
  assert.equal(lignes(r, /^bouton clic-joystick-droit 1$/).length, 1);
  assert.equal(lignes(r, /^bouton clic-joystick-gauche 0$/).length, 1);
});

test('banc : calage, les deux bouts et les deux prises des manettes à la gâchette', sauf, async () => {
  const r = await jouer(['0 porte 1', '0 manette gauche -0.3 1.02 -0.35', '0 manette droite 0.3 1.02 -0.35', '1500 valeur /user/hand/right/input/trigger/value 1'].join('\n'), { dureeMs: 2500, commandes: [[800, 'calage 1']] });
  const p = lignes(r, /^pointes droite /);
  assert.equal(p.length, 1);
  assert.match(p[0].ligne, /^pointes droite -0\.30\d* 1\.02\d* -0\.35\d* 0\.30\d* 1\.02\d* -0\.35\d* tete [-\d.]+ [-\d.]+ prises -0\.30\d* 1\.05\d* -0\.27\d* 0\.30\d* 1\.05\d* -0\.27\d*$/);
});

test('banc : sonde LibOVR, client invisible : limite fixée à la pièce, tête, manettes, clics bruts', pret && fs.existsSync(BANC_SONDE) ? {} : { skip: 'sonde pas construite : npm run casque-vr' }, async () => {
  const r = await sonder(
    [
      '0 porte 1',
      '0 limite piece 2.5 3.4',
      '0 contour -1.2,-1.6 1.3,-1.7 1.4,1.5 -1.1,1.8 -1.5,0.2',
      '0 tete 0.1 1.6 0.2 0.3',
      '1000 bouton /user/hand/left/input/thumbstick/click 1',
      '1300 bouton /user/hand/left/input/thumbstick/click 0',
      '1400 bouton /user/hand/right/input/thumbstick/click 1',
      '1500 origine 0.5 0.2 0.7',
      '2600 ovr-entrees 0',
      '2700 bouton /user/hand/right/input/thumbstick/click 0',
    ].join('\n'),
    { dureeMs: 4000 },
  );
  const l = (re) => r.lignes.filter((x) => re.test(x));
  assert.equal(r.code, 0, r.lignes.join('\n'));
  assert.equal(l(/^ovr charge /).length, 1);
  assert.deepEqual(l(/^ovr init /), ['ovr init 0 version 1.43']);
  assert.deepEqual(l(/^ovr etat /), ['ovr etat visible=0 casque=1 porte=1 regard=0 recentrer=0']);
  assert.match(l(/^ovr tete /)[0], /^ovr tete 0\.100 1\.600 0\.200 0\.300 suivi=15$/);
  assert.match(l(/^ovr manettes /)[0], /^ovr manettes -0\.300 1\.000 -0\.350 suivi=15 0\.300 1\.000 -0\.350 suivi=15$/);
  // Le contour et l'aire sont fixés à la pièce : l'origine déplacée (Link), ils changent dans l'espace de suivi.
  const contours = l(/^ovr contour exterieur /);
  assert.equal(contours.length, 2);
  assert.match(contours[0], /n=5 pts=-1\.200,-1\.600 1\.300,-1\.700 /);
  assert.equal(l(/^ovr aire code=0 n=4 dims=2\.500x3\.400 /).length, 2);
  // Chaque appui et relâchement des clics, bruts ; les entrées rendues à zéro (sans regard) relâchent le droit.
  assert.deepEqual(l(/^ovr bouton /), ['ovr bouton clic-joystick-gauche 1', 'ovr bouton clic-joystick-gauche 0', 'ovr bouton clic-joystick-droit 1', 'ovr bouton clic-joystick-droit 0']);
  assert.equal(l(/^ovr fin$/).length, 1);
});

// La sonde trouvée comme l'application la trouve (app/src/sonde-ovr.ts, activeOvrDll), depuis un manifeste copié
// sur celui de Meta Horizon Link (13 novembre 2026 : il nomme LibOVRRTImpl64_1.dll ; la sonde cherchait le nom du
// manifeste, « pas lancée » sur la borne). La DLL d'entrée LibOVRRT64_1.dll d'abord, l'autre à défaut.
const sondeOvr = createRequire(import.meta.url)('../app/dist/sonde-ovr.js');
const vraiManifeste = JSON.stringify({ file_format_version: '1.0.0', runtime: { name: 'Oculus OpenXR', library_path: '.\\LibOVRRTImpl64_1.dll' } }, null, 4);

test('banc : la DLL de LibOVR trouvée depuis le manifeste réel de Meta (LibOVRRTImpl64_1.dll nommée)', pret && fs.existsSync(BANC_SONDE) ? {} : { skip: 'sonde pas construite : npm run casque-vr' }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'banc-manifeste-meta-'));
  const manifeste = path.join(dir, 'oculus_openxr_64.json');
  fs.writeFileSync(manifeste, vraiManifeste);
  assert.equal(sondeOvr.activeOvrDll(manifeste), undefined);
  fs.copyFileSync(BANC_RUNTIME, path.join(dir, 'LibOVRRTImpl64_1.dll'));
  assert.equal(sondeOvr.activeOvrDll(manifeste), path.join(dir, 'LibOVRRTImpl64_1.dll'));
  fs.copyFileSync(BANC_RUNTIME, path.join(dir, 'LibOVRRT64_1.dll'));
  const dll = sondeOvr.activeOvrDll(manifeste);
  assert.equal(dll, path.join(dir, 'LibOVRRT64_1.dll'));
  const r = await sonder('0 porte 1', { dureeMs: 1500, dll });
  assert.ok(r.lignes.includes(`ovr charge ${dll}`), r.lignes.join('\n'));
  assert.ok(r.lignes.includes('ovr init 0 version 1.43'), r.lignes.join('\n'));
});

// Le vrai runtime de Meta, s'il est installé sur ce poste : la sonde chargée et initialisée en client invisible.
// Sans casque branché, ovr_Create répond « No HMD attached » (-1007) : attendu, et dit au journal.
const META = 'C:\\Program Files\\Meta Horizon\\Support\\oculus-runtime\\oculus_openxr_64.json';
test('sonde sur le vrai runtime de Meta (poste où il est installé) : chargée, initialisée, session dite', fs.existsSync(META) && fs.existsSync(BANC_SONDE) ? {} : { skip: 'runtime de Meta absent de ce poste' }, async () => {
  const dll = sondeOvr.activeOvrDll(META);
  assert.ok(dll && /LibOVRRT64_1\.dll$/i.test(dll), String(dll));
  const r = await sonder('', { dureeMs: 4000, dll, reel: true });
  assert.ok(r.lignes.includes(`ovr charge ${dll}`), r.lignes.join('\n'));
  assert.ok(r.lignes.some((l) => /^ovr init 0 /.test(l)), r.lignes.join('\n'));
  assert.ok(r.lignes.some((l) => /^ovr session (0|-1007)\b/.test(l)), r.lignes.join('\n'));
});

// La borne reposée sur la limite du Quest et par les sauts mesurés, sur la vraie sonde et le runtime factice (essai réel
// du 13 novembre 2026 en Air Link) : un contour de 406 points fixé à la pièce, l'origine de suivi que le Quest remet sur
// la tête à chaque remise du casque, les manettes posées sur la vraie barre comme témoin indépendant. Le repère de la
// pièce (RoomFrame) : J, les sauts mesurés depuis le dernier contour rafraîchi, reporte le contour lu dans le repère
// courant ; la place garde ce contour effectif.
const core = createRequire(import.meta.url)('../packages/core/dist/index.js');

/** Un contour de pièce irrégulier de 406 points, dans le monde (mètres). */
function contourMonde() {
  const pts = [];
  for (let i = 0; i < 406; i++) {
    const a = (2 * Math.PI * i) / 406;
    const r = 1.7 + 0.25 * Math.cos(2 * a) + 0.15 * Math.sin(3 * a) + 0.1 * Math.cos(5 * a + 1);
    pts.push([0.3 + r * Math.cos(a), -0.2 + r * Math.sin(a)]);
  }
  return pts;
}

/** Rotation du lacet `a` autour de Y, comme yawQuat du runtime factice (x' = x cos a + z sin a). */
const tourner = (a, [x, z]) => [x * Math.cos(a) + z * Math.sin(a), -x * Math.sin(a) + z * Math.cos(a)];

/** L'origine qui envoie le point `m` du monde en `m + d` dans le nouvel espace de suivi, tourné de `a`. */
function origineVers(m, d, a) {
  const [rx, rz] = tourner(a, [m[0] + d[0], m[1] + d[1]]);
  return [m[0] - rx, m[1] - rz];
}

const GAUCHE = [0.6, 0.95, -0.45];
const DROITE = [1.15, 0.95, -0.45];
const TETE = [0.87, 1.6, -0.12];
const pts = (c) => c.map(([x, z]) => `${x.toFixed(4)},${z.toFixed(4)}`).join(' ');
const lire = (r) => ({
  points: r.lignes.filter((l) => l.startsWith('ovr points ')).map((l) => sondeOvr.parseOvrPoints(l)),
  bouts: r.lignes
    .filter((l) => l.startsWith('ovr manettes '))
    .map((l) => {
      const v = l.split(' ').slice(2).filter((x) => !x.startsWith('suivi')).map(Number);
      return [{ x: v[0], y: v[1], z: v[2] }, { x: v[3], y: v[4], z: v[5] }];
    }),
  tetes: r.lignes.filter((l) => l.startsWith('ovr tete ')).map((l) => l.split(' ').slice(2, 6).map(Number)),
  sauts: r.lignes.filter((l) => l.startsWith('ovr saut ')).map((l) => sondeOvr.parseOvrJump(l)),
});
const sansPoints = (r) => r.lignes.filter((l) => !l.startsWith('ovr points')).join('\n');

/** La place calée sur les manettes posées (comme le calage à la main), avec la tête et le contour du même repère. */
function calee(bouts, tete, contour) {
  return { ...core.lockbarPlace(bouts[0], bouts[1]), head: { x: tete[0], z: tete[2] }, contour };
}

const banc = pret && fs.existsSync(BANC_SONDE) ? {} : { skip: 'sonde pas construite : npm run casque-vr' };

test('banc : ancrage sur la limite du Quest, saut de 155 cm et 97° (contour qui suit la pièce), la borne reposée à moins de 2 cm et 1°', banc, async () => {
  const a = (97 * Math.PI) / 180;
  const milieu = [(GAUCHE[0] + DROITE[0]) / 2, (GAUCHE[2] + DROITE[2]) / 2];
  const origine = origineVers(milieu, [1.55, 0], a);
  const r = await sonder(
    ['0 porte 1', '0 limite piece 3.4 3.6', `0 contour ${pts(contourMonde())}`, `0 tete ${TETE.join(' ')} 0`, `0 manette gauche ${GAUCHE.join(' ')}`, `0 manette droite ${DROITE.join(' ')}`, `7000 origine ${origine[0]} ${origine[1]} ${a}`].join('\n'),
    { dureeMs: 13000 },
  );
  const { points, bouts, tetes, sauts } = lire(r);
  assert.equal(points.length, 2, sansPoints(r));
  // La tête n'arrive pas à l'origine : ce n'est pas la signature de la remise d'origine, la sonde refuse le bond.
  assert.equal(sauts.length, 0);
  assert.ok(r.lignes.some((l) => /^ovr saut-refuse raison=arrivee-hors-origine/.test(l)), sansPoints(r));
  const avant = calee(bouts[0], tetes[0], points[0]);
  const vraie = core.lockbarPlace(bouts.at(-1)[0], bouts.at(-1)[1]);
  const ancre = core.anchorPlace(avant, points[1]);
  assert.equal(ancre.kind, 'moved');
  const reste = core.placeGap(ancre.place, vraie);
  assert.ok(reste.cm < 2 && reste.deg < 1, `reste ${JSON.stringify(reste)}`);
  assert.equal(core.anchorPlace(ancre.place, points[1]).kind, 'same');
});

test('banc : contour lu figé après le saut (périmé), vu par ovr_TestBoundary face au contour lu', banc, async () => {
  const r = await sonder(
    ['0 porte 1', '0 limite piece 3.4 3.6', `0 contour ${pts(contourMonde())}`, `0 tete ${TETE.join(' ')} 0`, '6990 contour-fige 1', '7000 origine 0.4 -0.3 0.9'].join('\n'),
    { dureeMs: 17000 },
  );
  const tests = r.lignes.filter((l) => l.startsWith('ovr test-limite code=0'));
  const ecart = (l) => Number(/ ecart=([\d.]+)/.exec(l)[1]);
  const points = (l) => Number(/ points=([\d.]+)/.exec(l)[1]);
  assert.ok(tests.length >= 2, sansPoints(r));
  assert.ok(points(tests[0]) < 1 && ecart(tests[0]) < 1, tests[0]);
  assert.ok(tests.slice(1).some((l) => points(l) > 20), tests.join(' | '));
});

// Les neuf remises d'origine du 13 novembre 2026 (20:08-20:12, Air Link) : la tête d'avant (« de= » du journal), puis
// l'origine remise sur elle ; la sonde doit les prendre toutes, avec la rotation relevée.
const REMISES = [
  [0.429, 1.655, -0.165, -0.447],
  [-0.3, 1.609, 0.69, 0.344],
  [-0.201, 1.679, -1.556, 2.598],
  [-1.052, 1.653, -1.538, -1.461],
  [0.413, 1.658, -0.059, -0.676],
  [-0.391, 1.649, 0.485, 1.078],
  [0.704, 1.64, 0.064, -0.884],
  [0.121, 1.666, 0.213, -1.184],
  [-0.111, 1.667, 0.012, 0.634],
];

test('banc : les neuf remises d’origine réelles du 13 novembre 2026, toutes mesurées, la tête arrivée à l’origine', banc, async () => {
  const etapes = ['0 porte 1'];
  let o = [0, 0, 0]; // l'origine courante dans le monde (x, z, lacet)
  REMISES.forEach(([x, y, z, yaw], i) => {
    // La tête, vue dans l'espace courant comme dans le journal, puis l'origine remise sur elle.
    const [wx, wz] = tourner(o[2], [x, z]);
    const tete = [o[0] + wx, o[1] + wz, o[2] + yaw];
    const t = 500 + i * 1000;
    etapes.push(`${t} tete ${tete[0]} ${y} ${tete[1]} ${tete[2]}`, `${t + 600} origine ${tete[0]} ${tete[1]} ${tete[2]}`);
    o = tete;
  });
  const r = await sonder(etapes.join('\n'), { dureeMs: 11000 });
  const { sauts } = lire(r);
  assert.equal(sauts.length, REMISES.length, r.lignes.filter((l) => l.startsWith('ovr saut')).join('\n'));
  sauts.forEach((s, i) => {
    assert.ok(Math.abs(Math.abs(s.angle) - Math.abs(REMISES[i][3])) < 0.01, `${i} : ${s.angle}`);
    assert.ok(Math.hypot(s.headAfter.x, s.headAfter.z) < 0.02, JSON.stringify(s.headAfter));
  });
});

test('banc : rafales du casque tenu en main (tête basculée vers 90°, cap qui tourne sans bouger) refusées, même à l’origine', banc, async () => {
  const etapes = ['0 porte 1', '0 tete 0.4 1.6 0.3 0', '500 tete-penche 1.45'];
  // Ailleurs, puis à l'origine même : le cap saute de 15 à 30° toutes les 5 ms, la position ne bouge pas.
  for (let i = 0; i < 8; i++) etapes.push(`${1000 + i * 5} tete 0.4 1.6 0.3 ${(i * 0.4) % 6.28}`);
  for (let i = 0; i < 8; i++) etapes.push(`${2500 + i * 5} tete 0 1.6 0 ${i === 7 ? 0 : (i * 0.5) % 6.28}`);
  const r = await sonder(etapes.join('\n'), { dureeMs: 4000 });
  const { sauts } = lire(r);
  assert.equal(sauts.length, 0, r.lignes.filter((l) => l.startsWith('ovr saut')).join('\n'));
  assert.ok(r.lignes.some((l) => /^ovr saut-refuse raison=tete-inclinee/.test(l)), r.lignes.filter((l) => l.startsWith('ovr saut')).join('\n'));
});

/** Le saut de 18:37 rejoué : tête et barre du jour, l'origine remise sur la tête ; contour figé ou non, saut refusé. */
async function sauterReel({ figer = false, suivie = true, rafraichir = false } = {}) {
  const monde = contourMonde();
  const r = await sonder(
    [
      '0 porte 1',
      '0 limite piece 3.4 3.6',
      `0 contour ${pts(monde)}`,
      '0 tete 1.142 1.358 0.090 -1.667',
      '0 manette gauche 0.548584 0.9 -0.441898',
      '0 manette droite 1.127474 0.9 -0.436842',
      ...(suivie ? [] : ['6900 tete-suivie 0']),
      ...(figer ? ['6990 contour-fige 1'] : []),
      '7000 origine 1.142 0.090 -1.667',
      // Le contour rafraîchi par le runtime (à la session neuve d'une application, fait 4 du 13 novembre).
      ...(rafraichir ? ['10500 contour-fige 0'] : []),
    ].join('\n'),
    { dureeMs: 13000 },
  );
  const l = lire(r);
  return { r, ...l, avant: calee(l.bouts[0], l.tetes[0], l.points[0]), vraie: core.lockbarPlace(l.bouts.at(-1)[0], l.bouts.at(-1)[1]) };
}

/** Ce que fait l'application : J au saut, la borne reposée par lui, la place gardée avec le contour effectif. */
function rejouer({ points, sauts, avant }) {
  const frame = new core.RoomFrame();
  frame.onRead(points[0]);
  let place = avant;
  for (const s of sauts) {
    frame.onJump(s);
    place = { ...core.movePlace(place, s), contour: frame.effective() };
  }
  const kinds = points.slice(1).map((p) => frame.onRead(p));
  return { frame, place, kinds };
}

test('banc : saut de 18:37 rejoué (contour figé), la borne reposée par le saut, l’ancrage ne la défait pas', banc, async () => {
  const run = await sauterReel({ figer: true });
  assert.equal(run.sauts.length, 1, sansPoints(run.r));
  const { frame, place, kinds } = rejouer(run);
  assert.ok(kinds.every((k) => k === 'inchange'), kinds.join(','));
  const reste = core.placeGap(place, run.vraie);
  assert.ok(reste.cm < 2 && reste.deg < 1, JSON.stringify(reste));
  assert.deepEqual(core.anchorPlace(place, frame.effective()), { kind: 'same' });
});

test('banc : contour qui suit la remise d’origine, une seule correction (le saut, puis le contour qui confirme)', banc, async () => {
  const run = await sauterReel();
  assert.equal(run.sauts.length, 1);
  const { frame, place, kinds } = rejouer(run);
  assert.ok(kinds.includes('rafraichi'), kinds.join(','));
  const reste = core.placeGap(place, run.vraie);
  assert.ok(reste.cm < 2 && reste.deg < 1, JSON.stringify(reste));
  assert.deepEqual(core.anchorPlace(place, frame.effective()), { kind: 'same' });
});

test('banc : saut refusé (tête suivie en orientation seule), le contour rafraîchi ensuite repose seul la borne', banc, async () => {
  const run = await sauterReel({ suivie: false, figer: true, rafraichir: true });
  assert.equal(run.sauts.length, 0, run.r.lignes.filter((l) => l.startsWith('ovr saut')).join('\n'));
  assert.ok(run.r.lignes.some((l) => /^ovr saut-refuse raison=suivi-incomplet/.test(l)));
  const { frame, place, kinds } = rejouer(run);
  assert.ok(kinds.includes('rafraichi'), kinds.join(','));
  const ancre = core.anchorPlace(place, frame.effective());
  assert.equal(ancre.kind, 'moved');
  const reste = core.placeGap(ancre.place, run.vraie);
  assert.ok(reste.cm < 2 && reste.deg < 1, JSON.stringify(reste));
});

// Une tête qui tourne vite (6 rad/s, 344°/s) n'est pas un saut : la sonde avance la tête d'avant par sa vitesse.
test('banc : tête qui tourne vite (344°/s), aucun saut ; la remise d’origine ensuite, mesurée', banc, async () => {
  const r = await sonder(['0 porte 1', '0 tete 0.2 1.6 0.1 0', '500 tete-tourne 6', '4000 tete-tourne 0', '4100 tete 0.2 1.6 0.1 0', '5000 origine 0.2 0.1 0'].join('\n'), { dureeMs: 8000 });
  const sauts = r.lignes.filter((l) => l.startsWith('ovr saut '));
  const tous = r.lignes.filter((l) => l.startsWith('ovr saut')).join(' | ');
  // Pendant la rotation : aucun saut. La remise ensuite : mesurée, ou refusée pour un intervalle trop long quand la
  // machine du banc est saturée (la suite complète en parallèle) ; jamais un faux saut, jamais un saut mal mesuré.
  assert.ok(sauts.length <= 1, tous);
  if (sauts.length) assert.ok(Math.abs(sondeOvr.parseOvrJump(sauts[0]).tx + 0.2) < 0.02, sauts[0]);
  else assert.ok(r.lignes.some((l) => /^ovr saut-refuse raison=intervalle-long .*bond=22/.test(l)), tous);
});

// Essai a) : l'ancien repère redonné par la sonde (ovr_SpecifyTrackingOrigin). Pour elle seule (défaut du runtime
// factice) : la tête y revient pour elle ; « origine-retour » lui rend le repère du runtime, sans faux saut ensuite.
test('banc : essai a), origine défaite pour la sonde seule, puis rendue au runtime ; aucun faux saut', banc, async () => {
  const r = await sonder(['0 porte 1', '0 tete 0.6 1.6 -0.3 0.8', '1000 origine 0.6 -0.3 0.8'].join('\n'), {
    dureeMs: 6000,
    args: ['--defaire-origine'],
    commandes: [[3500, 'origine-retour']],
  });
  const defaite = r.lignes.find((l) => l.startsWith('ovr origine-defaite '));
  assert.match(defaite ?? '', /code=0 revenue=1 /, r.lignes.join('\n'));
  assert.ok(r.lignes.includes('ovr origine-retablie code=0'), r.lignes.join('\n'));
  assert.equal(r.lignes.filter((l) => l.startsWith('ovr saut ')).length, 1, r.lignes.filter((l) => l.startsWith('ovr saut')).join('\n'));
  // Rendue : la tête est de nouveau dans le repère d'après la remise (à l'origine).
  const tete = r.lignes.filter((l) => l.startsWith('ovr tete ')).at(-1).split(' ').slice(2, 5).map(Number);
  assert.ok(Math.hypot(tete[0], tete[2]) < 0.02, JSON.stringify(tete));
  // Sans l'argument : rien n'est tenté.
  const sans = await sonder(['0 porte 1', '0 tete 0.6 1.6 -0.3 0.8', '1000 origine 0.6 -0.3 0.8'].join('\n'), { dureeMs: 3000 });
  assert.equal(sans.lignes.some((l) => l.startsWith('ovr origine-defaite')), false);
});

// Essai c) : après un saut, la session LibOVR de la sonde refaite, le contour relu ; s'il est figé, il ne change pas.
test('banc : essai c), session LibOVR refaite après le saut, contour relu (inchangé s’il est figé)', banc, async () => {
  const r = await sonder(['0 porte 1', '0 limite piece 3.4 3.6', `0 contour ${pts(contourMonde())}`, '0 tete 0.6 1.6 -0.3 0.8', '990 contour-fige 1', '1000 origine 0.6 -0.3 0.8'].join('\n'), { dureeMs: 6000 });
  assert.ok(r.lignes.includes('ovr session-neuve demandee'), sansPoints(r));
  assert.match(r.lignes.find((l) => l.startsWith('ovr contour-apres-session-neuve')) ?? '', /change=0 /, sansPoints(r));
});
