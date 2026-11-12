// Écrans dans le casque (12 novembre 2026, The Matrix : le PuP-Pack trop petit dans le fronton) : chaque source
// remplit la partie visible de son cadre, pour toute table ; un cadre mal rempli est vu avant le joueur.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { flasherRatio } from '../fronton-vr';
import { vrLines } from '../health';
import { frameRatio, mergeVrScreens, parseVrScreensBlock, poorFillSummary, poorlyFilled, VR_FILL_MIN, vrScreensSettings, vrTableKey } from '../vr-ecrans';

const repo = path.join(__dirname, '..', '..', '..', '..');
const read = (...p: string[]) => fs.readFileSync(path.join(repo, ...p), 'utf8').replace(/\r\n/g, '\n');

test('invariant : toute source passe par « remplir » et sa couverture est mesurée, dans chaque cadre', () => {
  const cpp = read('packages', 'vpx-vision3d', 'src', 'cyberpinball.cpp');
  const pause = read('packages', 'vpx-vision3d', 'src', 'pause.h');
  // Rendus annexes (PuP, B2S, ScoreView) : le cadre intermédiaire ; images de secours : dessinerImage ; les deux remplissent.
  assert.match(cpp, /const Rect r = remplir\(cadre\.dedans\.srcWidth, cadre\.dedans\.srcHeight, cadre\.zone\.l, cadre\.zone\.h, \{ x, y, l, h \}, cadre\.reglage\);\s*cadre\.couvert = englober\(cadre\.couvert, r\);/);
  assert.match(cpp, /const Rect r = remplir\(img\.l, img\.h, cible\.l, cible\.h, \{ 0\.f, 0\.f, img\.l, img\.h \}, g\);/);
  // Cadrage « contenu seulement » : le repère de la pause (menu, ajustement des écrans, calage de la borne), et le
  // DMD des scores (jamais rogné) ; toute autre source remplit.
  assert.equal(cpp.match(/cadrer\(/g)?.length, 4);
  assert.match(cpp, /cadrer\(L, H, zone\.l, zone\.h/);
  // Les trois cadres mesurés : fronton, bande DMD, cadre DMD de la pièce VR.
  assert.match(cpp, /rendre\(ctx, chaineFronton, fronton, t, pause\.reglage\(Ecran::Fronton\), &rf\)/);
  assert.match(cpp, /rendre\(ctx, chaineDmd, dmd, t, pause\.reglage\(Ecran::Dmd\), &rd\)/);
  assert.match(cpp, /rendre\(&c, chaineSalle, tout, t, pause\.reglage\(Ecran::Dmd\), &remplissage\.salle\)/);
  assert.match(cpp, /remplir_fronton=%\.2f remplir_dmd=%\.2f remplir_salle=%\.2f/);
  // Proportions de PuP apprises de ce qu'il pose sur toute sa surface, pour le fronton comme pour le DMD.
  assert.match(cpp, /apprendre\(cadre\.dedans\.window, texW \/ texH, texW \* texH\);/);
  assert.match(cpp, /const float ratio = appris\[i\] > 0\.1f \? appris\[i\] : \(defaut > 0\.1f \? defaut : 16\.f \/ 9\.f\);/);
  // Le seuil du plugin et celui de Cyber Pinball sont les mêmes.
  assert.match(pause, new RegExp(`constexpr float REMPLI_MIN = ${VR_FILL_MIN}f;`));
  // Le cadre DMD de la pièce VR prend la forme de son flasher.
  assert.match(read('app', 'src', 'frontend.ts'), /key: 'RoomDmdRatio', value: String\(sources\.dmdFrames\.find\(\(f\) => f\.ratio\)\?\.ratio \?\? 1\.7778\)/);
});

test('détection : un cadre mal rempli est relevé à la partie, dit au journal et dans la santé de la borne', () => {
  const key = vrTableKey('D:\\Tables\\The Matrix (Original 2023)\\The Matrix.vpx');
  assert.equal(key, 'The%20Matrix.vpx');
  const block = [
    `debut zone=0,0.2,1,1 ordre=PUP,B2S table=${key}`,
    'mesure t=5 vpx=72.0 remplir_fronton=0.48 remplir_dmd=0.97 remplir_salle=-1.00',
    'ratio fenetre=fronton valeur=1.333',
    'mesure t=10 vpx=72.0 remplir_fronton=0.62 remplir_dmd=0.97 remplir_salle=-1.00',
    'reglage fronton=0.000,-0.020,1.100 dmd=0.000,0.000,1.000',
  ].join('\n');
  const { table, entry } = parseVrScreensBlock(block);
  assert.equal(table, key);
  assert.equal(entry.pupRatio, 1.333);
  assert.deepEqual(entry.fill, { fronton: 0.62, dmd: 0.97 });
  assert.deepEqual(entry.adjust, { fronton: '0.000,-0.020,1.100', dmd: '0.000,0.000,1.000' });
  assert.deepEqual(poorlyFilled(entry), [{ frame: 'fronton', fill: 0.62 }]);
  // Gardé pour la table, repris à la partie suivante (proportions apprises, réglage du joueur).
  const store = mergeVrScreens({}, key, { ...entry, title: 'The Matrix' }, '2026-11-12T17:00:00.000Z');
  const settings = Object.fromEntries(vrScreensSettings(key, store[key]).map((s) => [s.key, s.value]));
  assert.equal(settings.PupRatio, '1.333');
  assert.equal(settings.TableId, key);
  assert.equal(settings.Screens, 'fronton=0.000,-0.020,1.100;dmd=0.000,0.000,1.000');
  assert.deepEqual(poorFillSummary(store), ['The Matrix (fronton 62 %)']);
  const lines = vrLines({ poorFill: poorFillSummary(store) });
  assert.equal(lines.length, 1);
  assert.match(lines[0]!.title, /écran mal rempli pour 1 table/);
  assert.match(lines[0]!.detail ?? '', /Ajuster les écrans/);
  // Partie suivante bien remplie : plus rien à signaler ; le réglage du joueur reste.
  const next = mergeVrScreens(store, key, parseVrScreensBlock(`debut table=${key}\nmesure t=5 remplir_fronton=0.96 remplir_dmd=0.97 remplir_salle=-1.00`).entry);
  assert.deepEqual(poorFillSummary(next), []);
  assert.equal(next[key]!.adjust?.fronton, '0.000,-0.020,1.100');
  assert.equal(next[key]!.pupRatio, 1.333);
  // Sans table connue (ancien plugin) : rien n'est gardé ; valeurs absurdes écartées.
  assert.equal(parseVrScreensBlock('debut zone=0,0,1,1').table, undefined);
  assert.equal(parseVrScreensBlock('ratio fenetre=fronton valeur=40').entry.pupRatio, undefined);
  assert.equal(parseVrScreensBlock('reglage fronton=a,b,c').entry.adjust?.fronton, undefined);
  // Neutre sans rien de connu : 16:9, aucun réglage.
  assert.deepEqual(Object.fromEntries(vrScreensSettings(key, undefined).map((s) => [s.key, s.value])), { TableId: key, PupRatio: '1.7778', PupDmdRatio: '1.7778', Screens: '' });
});

test('forme du cadre DMD de la pièce VR : d’après les points de son flasher', () => {
  assert.equal(frameRatio([{ x: 0, y: 0 }, { x: 160, y: 0 }, { x: 160, y: 90 }, { x: 0, y: 90 }]), 1.778);
  assert.equal(frameRatio([{ x: 0, y: 0 }, { x: 128, y: 0 }, { x: 128, y: 32 }]), 4);
  assert.equal(frameRatio([{ x: 0, y: 0 }, { x: 1, y: 0 }]), undefined);
  const vcen = (x: number, y: number) => {
    const b = Buffer.alloc(12);
    b.writeFloatLE(x, 0);
    b.writeFloatLE(y, 4);
    return { tag: 'VCEN', body: b };
  };
  assert.equal(flasherRatio([vcen(10, 10), vcen(410, 10), vcen(410, 110), vcen(10, 110)]), 4);
});
