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

test('banc : recalage automatique, les bouts des manettes suivies relevés au menu (« repos »), rien sans la commande', sauf, async () => {
  const scenario = ['0 porte 1', '0 manette gauche -0.3 0.9 -0.4', '0 manette droite 0.3 0.9 -0.4', '2500 suivie gauche 0'].join('\n');
  const r = await jouer(scenario, { dureeMs: 3500, commandes: [[300, 'repos 1']] });
  const vus = lignes(r, /^repos -?\d/);
  // 10 fois par seconde jusqu'à 2,5 s (moins si la machine est chargée : la commande arrive plus tard).
  assert.ok(vus.length >= 3 && vus.length <= 25, String(vus.length));
  assert.match(vus[0].ligne, /^repos -0\.30\d* 0\.90\d* -0\.40\d* (-?[\d.]+ ){3}[\d.]+ 0\.30\d* 0\.90\d* -0\.40\d* (-?[\d.]+ ){3}[\d.]+$/);
  // Une manette plus suivie (endormie, hors de vue) : dit une fois, plus de relevé.
  assert.equal(lignes(r, /^repos aucune$/).length, 1);
  const perte = r.lignes.findIndex((l) => l.ligne === 'repos aucune');
  assert.ok(r.lignes.slice(perte).every((l) => !/^repos -?\d/.test(l.ligne)), 'relevé après la perte du suivi');
  const sans = await jouer(scenario, { dureeMs: 2000 });
  assert.equal(lignes(sans, /^repos /).length, 0);
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
