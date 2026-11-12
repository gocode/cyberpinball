// Toute table dans le casque a un fronton et un DMD (essai sur la borne du 12 novembre 2026 : The Matrix sans
// PuP-Pack, rien ; Terminator 2, rien ; Back to the Future, pas de DMD ; City Hunter, un DMD gris vide).

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { desktopVisibility } from '../fronton-vr';
import { isVrImage, missingVrSources, scriptDmd, VR_DMD_BAND, vrSources } from '../vr-sources';

const repo = path.join(__dirname, '..', '..', '..', '..');
const read = (...p: string[]) => fs.readFileSync(path.join(repo, ...p), 'utf8').replace(/\r\n/g, '\n');

const facts = { ownRoom: false, pupPack: false, directb2s: false, backglassImage: false, dmdImage: false, script: '' };

test('sources du fronton et du DMD : la première de chaque chaîne, les quatre tables de l’essai', () => {
  // Back to the Future : directb2s et ROM de PinMAME ; le DMD passe désormais par la bande sous le fronton.
  assert.deepEqual(vrSources({ ...facts, directb2s: true, script: 'Const cGameName = "bttf_a27"\nLoadVPM "01560000", "DE.VBS", 3.36' }), { backglass: 'directb2s', dmd: 'PinMAME' });
  // Terminator 2 : directb2s et ROM.
  assert.deepEqual(vrSources({ ...facts, directb2s: true, script: 'Set Controller = CreateObject("VPinMAME.Controller")' }), { backglass: 'directb2s', dmd: 'PinMAME' });
  // The Matrix sans PuP-Pack : l'image du fronton de Cyber Pinball, et le DMD de FlexDMD.
  assert.deepEqual(vrSources({ ...facts, backglassImage: true, script: 'Set FlexDMD = CreateObject("FlexDMD.FlexDMD")' }), { backglass: 'image', dmd: 'FlexDMD' });
  // City Hunter : sa pièce VR a son fronton et son DMD (alimenté par son script).
  assert.deepEqual(vrSources({ ...facts, ownRoom: true, script: 'UltraDMD' }), { backglass: 'room', dmd: 'room' });
  // Rien du tout : dit, pour le journal et la santé de la borne.
  assert.deepEqual(missingVrSources(vrSources(facts)), ['fronton', 'DMD']);
  assert.deepEqual(missingVrSources(vrSources({ ...facts, dmdImage: true })), ['fronton']);
  assert.equal(scriptDmd("' Controller : VPinMAME.Controller\nSub Init : End Sub"), undefined, 'un commentaire ne compte pas');
  assert.equal(isVrImage('a.png') && isVrImage('b.JPG') && !isVrImage('c.mp4'), true);
  assert.equal(VR_DMD_BAND, 0.25);
});

test('mode bureau en VR : la visibilité réglée par le script selon ShowDT est connue (Terminator 2)', () => {
  const t2 = 'Dim DesktopMode: DesktopMode = Table1.ShowDT\nSub Table1_Init\n  If DesktopMode Then\n    Cab_FS.visible=0\n    Cab_DT.visible=1\n  Else\n    Cab_FS.visible=1\n    Cab_DT.visible=0\n  End If\nEnd Sub';
  const v = desktopVisibility(t2);
  assert.equal(v.get('cab_fs'), false);
  assert.equal(v.get('cab_dt'), true);
  // Directement sur Table1.ShowDT, en une ligne, et « Not ».
  assert.equal(desktopVisibility('If Table1.ShowDT Then Rails.Visible = True Else Rails.Visible = False').get('rails'), true);
  assert.equal(desktopVisibility('If Not Table1.ShowDT Then Cab.Visible = 1').get('cab'), undefined);
  // Une condition qui n'est pas le mode : inconnu.
  assert.equal(desktopVisibility('If VRRoom = 1 Then\n  Cab.Visible = 1\nEnd If').get('cab'), undefined);
});

test('plugin : bande DMD sous le fronton seulement quand une source y dessine, images de secours, jamais de cadre vide', () => {
  const cpp = read('packages', 'vpx-vision3d', 'src', 'cyberpinball.cpp');
  assert.match(cpp, /if \(bande && \(dmdVu \|\| imageDmd\)\)/);
  assert.match(cpp, /dmdVu = !rendre\(nullptr, chaineDmd,/);
  assert.match(cpp, /if \(f\.empty\(\) && charger\(imageDuFronton, imageFronton_Val\)\)/);
  assert.match(cpp, /Chaine chaineDmd \{ VPXWINDOW_ScoreView \};/);
  const frontend = read('app', 'src', 'frontend.ts');
  assert.match(frontend, /key: 'DmdBand', value: vr\.addBackglass \? String\(VR_DMD_BAND\) : '0'/);
  assert.match(frontend, /key: 'DmdOrder', value: 'PUP,ScoreView,B2S'/);
  assert.match(frontend, /VR : pas de source \$\{missing\.join\(' ni de '\)\} pour cette table/);
});

test('casque non détecté au lancement : la partie en mode normal, sans attente, l’option VR gardée', () => {
  const frontend = read('app', 'src', 'frontend.ts');
  assert.match(frontend, /if \(headset && !HEADSET_TRIAL_DIR && !headsetDetected\(\)\) \{[\s\S]{0,300}showBanner\(t\('Casque non détecté : partie en mode normal'\)\);\s*return undefined;/);
  assert.match(frontend, /function headsetDetected\(\): boolean \{\s*return Boolean\(headset && \(headset\.state === 'shown' \|\| headset\.inUse\)\);/);
  // L'option n'est pas décochée : writeVrMode n'est appelé que par l'entrée du menu.
  assert.equal(frontend.match(/writeVrMode\(/g)?.length, 1);
});

test('recopie sur le playfield : une option du menu, éteinte par défaut, passée à la partie', () => {
  const frontend = read('app', 'src', 'frontend.ts');
  assert.match(frontend, /library\.provideSystemItem\('vr-mirror', \{/);
  assert.match(frontend, /prepareVrGame\(\{[^}]*mirror: vrMirror \}\)/);
  assert.match(read('app', 'src', 'vr.ts'), /\.mirror === true;/);
});
