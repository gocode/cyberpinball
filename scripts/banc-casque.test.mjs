// Scénarios du banc d'essai du casque (scripts/banc-casque.mjs) : le vrai compagnon sur le runtime OpenXR
// factice, sans casque ni fenêtre. Plus aucun correctif de la VR sans passage ici (13 novembre 2026).
// Le banc se construit avec le compagnon (npm run casque-vr) ; sans lui, ces essais sont sautés et le disent.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as os from 'node:os';
import * as path from 'node:path';
import { BANC_RUNTIME, BANC_SONDE, bancPret, jouer, sonder } from './banc-casque.mjs';

const pret = bancPret();
const sauf = pret ? {} : { skip: 'banc pas construit : npm run casque-vr' };

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
  assert.deepEqual(l(/^ovr etat /), ['ovr etat visible=0 casque=1 porte=1 regard=0']);
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

// La borne reposée sur la limite du Quest (ancrage), sur la vraie sonde et le runtime factice : un contour de 406
// points fixé à la pièce, l'origine de suivi qui saute (Link), les manettes posées sur la vraie barre comme témoin.
// La place calée avant le saut, reposée par anchorPlace avec le contour relu par la sonde, doit retomber sur la
// barre que les manettes donnent après le saut. Trois cas de l'essai du 13 novembre 2026 : saut de 155 cm et 97°,
// origine remise sur la tête au port (ancrage confirmé par la tête), pièce refaite avec sa limite (rien à reposer,
// tête loin : le calage reste proposé).
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

/** Joue le scénario, rend les contours relus (« ovr points »), les bouts des manettes et la tête, avant et après le saut. */
async function sauter(origine, { contourApres, figer, dureeMs = 13000 } = {}) {
  const monde = contourMonde();
  const pts = (c) => c.map(([x, z]) => `${x.toFixed(4)},${z.toFixed(4)}`).join(' ');
  const r = await sonder(
    [
      '0 porte 1',
      '0 limite piece 3.4 3.6',
      `0 contour ${pts(monde)}`,
      `0 tete ${TETE.join(' ')} 0`,
      `0 manette gauche ${GAUCHE.join(' ')}`,
      `0 manette droite ${DROITE.join(' ')}`,
      `7000 origine ${origine.join(' ')}`,
      ...(contourApres ? [`7000 contour ${pts(contourApres(monde))}`] : []),
      ...(figer ? ['6990 contour-fige 1'] : []),
    ].join('\n'),
    { dureeMs },
  );
  const points = r.lignes.filter((l) => l.startsWith('ovr points ')).map((l) => sondeOvr.parseOvrPoints(l));
  const bouts = r.lignes
    .filter((l) => l.startsWith('ovr manettes '))
    .map((l) => {
      const v = l.split(' ').slice(2).filter((x) => !x.startsWith('suivi')).map(Number);
      return [{ x: v[0], y: v[1], z: v[2] }, { x: v[3], y: v[4], z: v[5] }];
    });
  const tetes = r.lignes.filter((l) => l.startsWith('ovr tete ')).map((l) => l.split(' ').slice(2, 6).map(Number));
  return { r, points, bouts, tetes };
}

/** La place calée sur les manettes posées (comme le calage à la main), avec la tête et le contour du même repère. */
function calee(bouts, tete, contour) {
  return { ...core.lockbarPlace(bouts[0], bouts[1]), head: { x: tete[0], z: tete[2] }, contour };
}

const banc = pret && fs.existsSync(BANC_SONDE) ? {} : { skip: 'sonde pas construite : npm run casque-vr' };

test('banc : ancrage sur la limite du Quest, saut de 155 cm et 97° (Link), la borne reposée à moins de 2 cm et 1°', banc, async () => {
  const a = (97 * Math.PI) / 180;
  const milieu = [(GAUCHE[0] + DROITE[0]) / 2, (GAUCHE[2] + DROITE[2]) / 2];
  const origine = origineVers(milieu, [1.55, 0], a);
  const { r, points, bouts, tetes } = await sauter([origine[0], origine[1], a]);
  assert.equal(points.length, 2, r.lignes.filter((l) => !l.startsWith('ovr points')).join('\n'));
  assert.equal(points[0].length, 406);
  const avant = calee(bouts[0], tetes[0], points[0]);
  const vraie = core.lockbarPlace(bouts.at(-1)[0], bouts.at(-1)[1]);
  const saut = core.placeGap(avant, vraie);
  assert.ok(Math.abs(saut.cm - 155) < 2 && Math.abs(saut.deg - 97) < 1, JSON.stringify(saut));
  const ancre = core.anchorPlace(avant, points[1]);
  assert.equal(ancre.kind, 'moved');
  const reste = core.placeGap(ancre.place, vraie);
  assert.ok(reste.cm < 2 && reste.deg < 1, `reste ${JSON.stringify(reste)}`);
  assert.ok(ancre.residualCm < 1, String(ancre.residualCm));
  // Reposée : plus rien à faire au relevé suivant (le même contour).
  assert.equal(core.anchorPlace(ancre.place, points[1]).kind, 'same');
});

test('banc : origine remise sur la tête au port, la borne reposée et l’ancrage confirmé par la tête', banc, async () => {
  const a = 0.6;
  const { points, bouts, tetes } = await sauter([TETE[0], TETE[2], a]);
  const avant = calee(bouts[0], tetes[0], points[0]);
  // La tête retombe sur l'origine (originResetAtWear) ; la barre a sauté.
  assert.ok(Math.hypot(tetes.at(-1)[0], tetes.at(-1)[2]) < 0.01, JSON.stringify(tetes.at(-1)));
  const vraie = core.lockbarPlace(bouts.at(-1)[0], bouts.at(-1)[1]);
  const ancre = core.anchorPlace(avant, points.at(-1));
  assert.equal(ancre.kind, 'moved');
  const reste = core.placeGap(ancre.place, vraie);
  assert.ok(reste.cm < 2 && reste.deg < 1, `reste ${JSON.stringify(reste)}`);
  const tete = core.anchorHeadAtOrigin(ancre.place);
  assert.ok(tete.confirmed && tete.cm < 2, JSON.stringify(tete));
});

test('banc : pièce refaite avec sa limite au port (contour inchangé dans le suivi), rien à reposer, tête loin : calage proposé', banc, async () => {
  const a = 0.6;
  const origine = [TETE[0], TETE[2], a];
  // Le Quest replace sa limite avec l'origine : le contour suit, il est inchangé dans l'espace de suivi.
  const avec = (monde) => monde.map(([x, z]) => {
    const [rx, rz] = tourner(a, [x, z]);
    return [rx + origine[0], rz + origine[1]];
  });
  const { points, bouts, tetes } = await sauter(origine, { contourApres: avec });
  const avant = calee(bouts[0], tetes[0], points[0]);
  const ancre = core.anchorPlace(avant, points.at(-1));
  assert.equal(ancre.kind, 'same');
  // La vraie barre a pourtant sauté : seule la tête (à l'origine, loin de celle du calage) le dit.
  const vraie = core.lockbarPlace(bouts.at(-1)[0], bouts.at(-1)[1]);
  assert.ok(core.placeGap(avant, vraie).cm > 30);
  const tete = core.anchorHeadAtOrigin(avant);
  assert.equal(tete.confirmed, false, JSON.stringify(tete));
});

// Piste 1 (13 novembre 2026) : le saut mesuré dans le flux de la tête, relevée toutes les quelques millisecondes ;
// une tête ne se téléporte pas, le bond entre deux relevés consécutifs est la transformation du saut. Validé sur les
// relevés du jour : la tête lue par la sonde à 18:37:17.891 puis par OpenXR à 18:37:18.019 prédit la barre après le
// saut de 155 cm et 97° à 2,1 cm et 2,2° près (le contour, lui, ne bougeait que de 12 cm).
test('banc : saut de l’espace de suivi mesuré par la sonde dans le flux de la tête, la borne reposée à moins de 2 cm et 1°', banc, async () => {
  const a = (97 * Math.PI) / 180;
  const milieu = [(GAUCHE[0] + DROITE[0]) / 2, (GAUCHE[2] + DROITE[2]) / 2];
  const origine = origineVers(milieu, [1.55, 0], a);
  const { r, bouts, tetes, points } = await sauter([origine[0], origine[1], a]);
  const sauts = r.lignes.filter((l) => l.startsWith('ovr saut '));
  assert.equal(sauts.length, 1, r.lignes.filter((l) => !l.startsWith('ovr points')).join('\n'));
  const saut = sondeOvr.parseOvrJump(sauts[0]);
  assert.ok(saut && saut.dtMs < 25, sauts[0]);
  assert.equal(r.lignes.filter((l) => l.startsWith('ovr saut-refuse')).length, 0);
  const avant = calee(bouts[0], tetes[0], points[0]);
  const vraie = core.lockbarPlace(bouts.at(-1)[0], bouts.at(-1)[1]);
  const reposee = core.movePlace(avant, saut);
  const reste = core.placeGap(reposee, vraie);
  assert.ok(reste.cm < 2 && reste.deg < 1, `reste ${JSON.stringify(reste)} (${sauts[0]})`);
  // Le test de la limite par le runtime suit le saut ; le contour relu concorde avec lui (pas périmé).
  const tests = r.lignes.filter((l) => l.startsWith('ovr test-limite code=0'));
  assert.ok(tests.length >= 2, r.lignes.join('\n'));
  for (const l of tests) {
    assert.ok(Number(/ ecart=([\d.]+)/.exec(l)[1]) < 1, l);
    assert.ok(Number(/ points=([\d.]+)/.exec(l)[1]) < 1, l);
  }
});

// Piste 2 : le runtime recentre l'origine sans retransformer le contour qu'il rend. ovr_TestBoundary, lui, garde la
// vraie limite : sa distance diverge de celle calculée sur le contour lu, et les points lus ne sont plus sur la limite.
test('banc : contour lu figé après le saut (périmé), vu par ovr_TestBoundary face au contour lu', banc, async () => {
  const a = 0.9;
  const { r } = await sauter([0.4, -0.3, a], { figer: true, dureeMs: 17000 });
  const tests = r.lignes.filter((l) => l.startsWith('ovr test-limite code=0'));
  const ecart = (l) => Number(/ ecart=([\d.]+)/.exec(l)[1]);
  const pts = (l) => Number(/ points=([\d.]+)/.exec(l)[1]);
  assert.ok(tests.length >= 2, r.lignes.join('\n'));
  // Avant le saut : concordants ; après : les points lus à des dizaines de centimètres de la vraie limite.
  assert.ok(pts(tests[0]) < 1 && ecart(tests[0]) < 1, tests[0]);
  assert.ok(tests.slice(1).some((l) => pts(l) > 20), tests.join(' | '));
});
