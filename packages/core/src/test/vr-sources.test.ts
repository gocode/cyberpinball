// Toute table dans le casque a un fronton et un DMD (essai sur la borne du 12 novembre 2026 : The Matrix sans
// PuP-Pack, rien ; Terminator 2, rien ; Back to the Future, pas de DMD ; City Hunter, un DMD gris vide).

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { desktopVisibility, dmdFlasherName, parseVrMeasures } from '../fronton-vr';
import { isVrImage, missingVrSources, roomDmdSetting, scriptDmd, VR_DMD_BAND, vrSources } from '../vr-sources';

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
  // Une pièce VR sans cadre DMD dans sa scène : son fronton et son DMD sont les siens.
  assert.deepEqual(vrSources({ ...facts, ownRoom: true, script: 'UltraDMD' }), { backglass: 'room', dmd: 'room' });
  // Rien du tout : dit, pour le journal et la santé de la borne.
  assert.deepEqual(missingVrSources(vrSources(facts)), ['fronton', 'DMD']);
  assert.deepEqual(missingVrSources(vrSources({ ...facts, dmdImage: true })), ['fronton']);
  assert.equal(scriptDmd("' Controller : VPinMAME.Controller\nSub Init : End Sub"), undefined, 'un commentaire ne compte pas');
  // 2001 (table originale) : cGameName pour son .directb2s, B2S.Server, scores d'UltraDMD : pas une ROM.
  assert.equal(scriptDmd('Const cGameName = "HAL9000"\nSet Controller = CreateObject("B2S.Server")\nIf UltraMode = 1 And IsObject(UltraDMD) Then'), 'UltraDMD');
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
  assert.match(cpp, /if \(bande && \(dmdVu \|\| imageDmd \|\| scores\.ok\)\)/);
  assert.match(cpp, /dmdVu = !rendre\(nullptr, chaineDmd,/);
  assert.match(cpp, /if \(f\.empty\(\) && charger\(imageDuFronton, imageFronton_Val\)\)/);
  assert.match(cpp, /Chaine chaineDmd \{ VPXWINDOW_ScoreView \};/);
  const frontend = read('app', 'src', 'frontend.ts');
  assert.match(frontend, /key: 'DmdBand', value: vr\.addBackglass \? String\(VR_DMD_BAND\) : '0'/);
  assert.match(frontend, /key: 'DmdOrder', value: 'PUP,B2S'/);
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

test('cadre DMD d’une pièce VR : la chaîne de la bande, jamais gris (City Hunter, le FullDMD de PuP)', () => {
  // City Hunter : flasher « DMDPUP » en mode DMD, PuP-Pack dont l'écran 1 est le FullDMD, pas de DMD de ROM.
  const cityHunter = { ...facts, ownRoom: true, dmdFrame: true, pupPack: true, pupDmd: true, dmdImage: true, script: 'Set PuPlayer = CreateObject("PinUpPlayer.PinDisplay")' };
  assert.deepEqual(vrSources(cityHunter), { backglass: 'room', dmd: 'PuP-Pack' });
  assert.equal(roomDmdSetting(cityHunter), 'PUP');
  // PuP d'abord, même devant la ROM (le plugin publie une source plus grande : elle l'emporte dans VPX).
  assert.equal(roomDmdSetting({ ...cityHunter, script: 'LoadVPM "01560000", "DE.VBS", 3.36' }), 'PUP');
  // Sans PuP pour le DMD : le DMD du script remplit le cadre lui-même, le plugin ne publie rien.
  const rom = { ...cityHunter, pupDmd: false, script: 'Set FlexDMD = CreateObject("FlexDMD.FlexDMD")' };
  assert.deepEqual(vrSources(rom), { backglass: 'room', dmd: 'FlexDMD' });
  assert.equal(roomDmdSetting(rom), '');
  // Ni PuP ni DMD de script : l'image du DMD de Cyber Pinball ; sans image, dit au journal et dans la santé.
  const none = { ...cityHunter, pupDmd: false, pupPack: false, script: '' };
  assert.equal(roomDmdSetting(none), 'image');
  assert.deepEqual(missingVrSources(vrSources({ ...none, dmdImage: false })), ['DMD']);
  assert.equal(roomDmdSetting({ ...none, dmdImage: false }), '');
  // Fronton posé par VPX (pas de pièce VR) : la bande sous le fronton, jamais cette source.
  assert.equal(roomDmdSetting({ ...cityHunter, ownRoom: false }), '');
  assert.equal(roomDmdSetting({ ...cityHunter, dmdFrame: false }), '');
});

test('cadre DMD de la scène : flasher en mode DMD (IDMD des anciennes tables, RDMD = 1 des nouvelles)', () => {
  const rec = (tag: string, n: number) => ({ tag, body: Buffer.from(new Uint32Array([n]).buffer) });
  const name = (n: string) => {
    const b = Buffer.alloc(4 + n.length * 2);
    b.writeUInt32LE(n.length * 2, 0);
    b.write(n, 4, 'utf16le');
    return { tag: 'NAME', body: b };
  };
  assert.equal(dmdFlasherName([name('DMDPUP'), rec('IDMD', 1)]), 'DMDPUP');
  assert.equal(dmdFlasherName([name('VR_DMD'), rec('RDMD', 1)]), 'VR_DMD');
  assert.equal(dmdFlasherName([name('Flasher1'), rec('RDMD', 0)]), undefined);
  assert.equal(dmdFlasherName([name('Flasher2'), rec('IDMD', 0)]), undefined);
  assert.equal(dmdFlasherName([name('Flasher3')]), undefined);
});

test('plugin : source d’affichage du cadre DMD de la pièce VR, PuP seul puis l’image, au bilan', () => {
  const cpp = read('packages', 'vpx-vision3d', 'src', 'cyberpinball.cpp');
  assert.match(cpp, /MSGPI_STRING_VAL_SETTING\(salleDmd, "RoomDmd"/);
  assert.match(cpp, /GetMsgID\(CTLPI_NAMESPACE, CTLPI_DISPLAY_GET_SRC_MSG\), onGetDisplays/);
  assert.match(cpp, /e\.frameFormat = CTLPI_DISPLAY_FORMAT_SRGB888;/);
  // PuP seul : le rendu ScoreView (DMD de ROM) lirait cette source même, en boucle.
  assert.match(cpp, /chercher\(chaineSalle, "PUP", t\);/);
  assert.match(cpp, /if \(s\.empty\(\) && charger\(imageDuDmd, imageDmd_Val\)\)/);
  assert.match(cpp, /publierSalle\(salleDmd_Val\[0\] != 0\);/);
  assert.match(cpp, /ecrire\("salle dmd=" \+/);
  const pause = read('packages', 'vpx-vision3d', 'src', 'pause.h');
  assert.match(pause, /constexpr int SALLE_DMD_L = 512, SALLE_DMD_H = 288;/);
  const frontend = read('app', 'src', 'frontend.ts');
  assert.match(frontend, /key: 'RoomDmd', value: sources\.roomDmd/);
  assert.match(frontend, /table\(s\) au cadre DMD de pièce VR rempli par Cyber Pinball/);
  assert.equal(parseVrMeasures(['salle source=PUP', 'salle dmd=aucune', 'salle dmd=PUP', ''].join('\n'))?.roomDmd, 'PUP');
});

test('trois emplacements : fronton, full DMD, et les scores par-dessus, jamais cachés (2001, Terminator 2, Back to the Future)', () => {
  const cpp = read('packages', 'vpx-vision3d', 'src', 'cyberpinball.cpp');
  // Le full DMD (PuP, image DMD du .directb2s) est une chaîne ; le ScoreView de VPX n'y est plus : les scores sont dessinés par le plugin.
  assert.match(cpp, /MSGPI_STRING_VAL_SETTING\(ordreDmd, "DmdOrder"[^\n]*"PUP,B2S", 256\);/);
  // Les scores par-dessus le full DMD (sauf l'image DMD de B2S, qui les porte), ou seuls dans la bande.
  assert.match(cpp, /if \(d != "B2S"\)\s*\{[\s\S]{0,400}dessinerScores\(ctx, dans,/);
  // La source des scores : la plus grande source d'affichage d'un autre plugin (jamais celle du DMD de la pièce).
  assert.match(cpp, /if \(d\.id\.endpointId == endpointId \|\| !d\.GetRenderFrame/);
  // Le DMD des scores entier, jamais rogné.
  assert.match(cpp, /Rect p = cadrer\(static_cast<float>\(scores\.l\), static_cast<float>\(scores\.h\), r\.l, r\.h,/);
  // Pièce VR : le full DMD de PuP, puis les scores par-dessus.
  assert.match(cpp, /const Rect fait = dessinerScores\(&c, dans,/);
  // Ce que le plugin dessine est capturé (fronton et DMD de la pièce), pour vérifier les places sans casque.
  assert.match(cpp, /capturerComposition\("debut"\);/);
  assert.match(cpp, /"sources fronton=" \+[\s\S]{0,200}" scores="/);
  // Jamais de DMD incrusté dans le fronton en VR : il a sa bande.
  const frontend = read('app', 'src', 'frontend.ts');
  assert.match(frontend, /key: 'BackglassDMDOverlay', value: '0'/);
  assert.match(frontend, /key: 'ScoreViewDMDOverlay', value: '1'/);
  // 2001 : full DMD de PuP et scores d'UltraDMD, les deux dits.
  assert.deepEqual(vrSources({ ...facts, pupPack: true, pupDmd: true, script: 'IsObject(UltraDMD)' }), { backglass: 'PuP-Pack', dmd: 'UltraDMD', fullDmd: 'PuP-Pack' });
});
