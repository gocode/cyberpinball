// Écran du DMD : FullDMD ou DMD seul (dmdscreen.ts), et ce qui le respecte : médias du menu,
// VPinballX.ini (fenêtre ScoreView, plugin B2S), choix d'option des PuP-Packs, assistant.
//
// Cas réel (« Poste à 3 écrans 2 », octobre 2026) : le DMD seul sur un écran 16:9 (PLX2283HSU),
// dans une bande 4,8:1 au milieu. Le menu y montrait l'image FullDMD réduite dans la bande, VPX y
// ouvrait une fenêtre en bande, les PuP-Packs étaient choisis pour un DMD 4:1.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  cabinetRoleLabel,
  centeredDmdBand,
  dmdKindAfterArrange,
  dmdKindChoices,
  dmdKindFindings,
  dmdKindForRatio,
  dmdKindLabel,
  dmdKindOf,
  dmdKindQuestion,
  withDmdKind,
} from '../dmdscreen';
import { toPhysicalScreen } from '../fingerprint';
import { IniDocument } from '../ini';
import { dmdMediaType } from '../medias';
import type { Cabinet } from '../model';
import { cabinetFullDmd, describePupCabinet, parseScreens, pupCabinet, pupDmdRoot, scoreVariant, type VariantTraits } from '../puppack';
import { planVpxSync } from '../sync';
import { vpxPluginDefaults, vpxSettingsFor, type VpxProfile } from '../vpx';
import { cabinetChanges, stepCabinet, wizardStepInfo } from '../wizardsteps';
import { cabinetZones, isFullZone, roleZone, splitBackglassDmd, zoneRatio } from '../zones';
import { devPcDisplays, emptyCabinet } from './fixtures';

const [samsung, auo, , plx] = devPcDisplays() as [ReturnType<typeof devPcDisplays>[number], ReturnType<typeof devPcDisplays>[number], unknown, ReturnType<typeof devPcDisplays>[number]];
const PROFILE: VpxProfile = { displayIdFormat: 'name', enabledPlugins: ['B2S', 'PUP', 'ScoreView'] };
const BAND = { x: 0.06041666666666667, y: 0.37962962962962965, width: 0.8796875, height: 0.32685185185185184 };

/** « Poste à 3 écrans 2 » : playfield sur l'AUO, fronton sur le Samsung, DMD en bande 4,8:1 sur le PLX, sans type dit. */
function poste(): Cabinet {
  const cabinet = emptyCabinet();
  cabinet.screens = devPcDisplays().map(toPhysicalScreen);
  cabinet.roles = { playfield: cabinet.screens[1]!.fingerprint, backglass: cabinet.screens[0]!.fingerprint, dmd: cabinet.screens[3]!.fingerprint };
  cabinet.zones = { dmd: { ...BAND } };
  cabinet.playfield = { flipperEdge: 'bottom' };
  return cabinet;
}

const assignments = { playfield: auo, backglass: samsung, dmd: plx };
const scoreView = (cabinet: Cabinet) =>
  Object.fromEntries(
    vpxSettingsFor(assignments, PROFILE, cabinetZones(cabinet), dmdKindOf(cabinet))
      .filter((s) => s.section === 'ScoreView')
      .map((s) => [s.key, s.value]),
  );

test('Écran du DMD : le type dit l’emporte sur la forme, la forme décide sans lui (8:3)', () => {
  assert.equal(dmdKindForRatio(4), 'dmd');
  assert.equal(dmdKindForRatio(16 / 9), 'fulldmd');
  assert.equal(dmdKindForRatio(8 / 3), 'dmd');
  const cabinet = poste();
  assert.equal(dmdKindOf(cabinet), 'dmd', 'bande 4,8:1 sans type dit : DMD seul, comme avant');
  assert.equal(dmdKindOf({ ...cabinet, dmdKind: 'fulldmd' }), 'fulldmd');
  assert.equal(dmdKindOf({ ...cabinet, zones: undefined }), 'fulldmd', 'écran 16:9 entier : FullDMD');
  assert.equal(dmdKindOf({ ...cabinet, roles: { playfield: cabinet.roles.playfield } }), undefined);
  assert.equal(dmdKindLabel('fulldmd'), 'FullDMD');
  assert.equal(dmdKindLabel('dmd'), 'DMD');
  assert.equal(cabinetRoleLabel({ ...cabinet, dmdKind: 'fulldmd' }, 'dmd', 'DMD'), 'FullDMD');
  assert.equal(cabinetRoleLabel(cabinet, 'backglass', 'Backglass'), 'Backglass');
});

test('Écran du DMD : la configuration ambiguë (bande seule sur un écran large) est repérée, les autres non', () => {
  const question = dmdKindQuestion(poste());
  assert.ok(question);
  assert.equal(question.screen, poste().screens[3]!.label);
  assert.ok(Math.abs(question.zoneRatio - (0.8796875 * 1920) / (0.32685185185185184 * 1080)) < 1e-9);
  assert.ok(question.zoneRatio > 4.7 && question.zoneRatio < 4.9);
  // Réponse donnée, écran entier, bande sous le fronton, incrustation : pas de question.
  assert.equal(dmdKindQuestion({ ...poste(), dmdKind: 'dmd' }), undefined);
  assert.equal(dmdKindQuestion({ ...poste(), zones: undefined }), undefined);
  const shared = poste();
  shared.roles.backglass = shared.roles.dmd;
  shared.zones = splitBackglassDmd(plx.bounds);
  assert.equal(dmdKindQuestion(shared), undefined);
  const embedded = poste();
  embedded.roles.dmd = embedded.roles.playfield;
  assert.equal(dmdKindQuestion(embedded), undefined);
  // Un vrai écran DMD (4:1) n'est jamais un FullDMD en puissance.
  const lcd = poste();
  lcd.screens[3] = { ...lcd.screens[3]!, widthPx: 1920, heightPx: 480 };
  lcd.zones = { dmd: { x: 0.1, y: 0, width: 0.8, height: 1 } };
  assert.equal(dmdKindQuestion(lcd), undefined);
  // Signalée par la synchronisation, en « À vérifier ».
  const findings = dmdKindFindings(poste());
  assert.equal(findings.length, 1);
  assert.equal(findings[0]!.severity, 'warning');
  assert.match(findings[0]!.message, /bande 4,78:1 .*« PLX2283HSU \(1920 × 1080\) » \(16:9\)/);
  assert.ok(planVpxSync(poste(), devPcDisplays(), '', PROFILE).findings.some((f) => f.message === findings[0]!.message));
});

test('Écran du DMD : « C’est un FullDMD » rend tout l’écran ; « DMD seul » garde la bande telle quelle', () => {
  const full = withDmdKind(poste(), 'fulldmd');
  assert.equal(full.dmdKind, 'fulldmd');
  assert.equal(full.zones, undefined, 'seul sur son écran : l’écran entier');
  assert.equal(dmdKindQuestion(full), undefined);
  assert.deepEqual(dmdKindFindings(full), []);
  assert.equal(dmdMediaType(full), 'FullDMD');
  // VPX : ScoreView plein écran sur le PLX, B2S y dessine le FullDMD du .directb2s et incruste le DMD.
  const sv = scoreView(full);
  assert.equal(sv.ScoreViewFullScreen, '1');
  assert.equal(sv.ScoreViewWidth, '1920');
  assert.equal(sv.ScoreViewHeight, '1080');
  assert.equal(sv['Priority.B2S'], '50');
  assert.deepEqual(
    vpxPluginDefaults(assignments, PROFILE, 'fulldmd').map((s) => s.key),
    ['ScoreViewDMDOverlay', 'ScoreViewDMDAutoPos'],
  );

  const band = withDmdKind(poste(), 'dmd');
  assert.equal(band.dmdKind, 'dmd');
  assert.deepEqual(band.zones?.dmd, BAND, 'la bande déjà en forme n’est pas retouchée');
  assert.equal(dmdKindQuestion(band), undefined);
  assert.equal(dmdMediaType(band), 'DMD');
  // VPX : fenêtre en bande, et B2S passe après ScoreView : pas d'image FullDMD dans la bande.
  const svBand = scoreView(band);
  assert.equal(svBand.ScoreViewFullScreen, '0');
  assert.equal(svBand['Priority.B2S'], '0');
  assert.equal(svBand['Priority.ScoreView'], '10');
  assert.deepEqual(vpxPluginDefaults(assignments, PROFILE, 'dmd'), []);

  // Et retour : DMD seul depuis l'écran entier, une bande 4:1 centrée.
  const back = withDmdKind(full, 'dmd');
  assert.deepEqual(back.zones?.dmd, centeredDmdBand(plx.bounds));
  assert.ok(Math.abs(zoneRatio(back.zones!.dmd!, plx.bounds)! - 4) < 1e-9);
});

test('Écran du DMD : sous le fronton partagé, la bande du bas suit le type ; incrusté, jamais FullDMD', () => {
  const shared = poste();
  shared.roles.backglass = shared.roles.dmd;
  shared.zones = splitBackglassDmd(plx.bounds, 4);
  assert.equal(dmdKindOf(shared), 'dmd');
  const full = withDmdKind(shared, 'fulldmd');
  assert.deepEqual(full.zones, splitBackglassDmd(plx.bounds, 16 / 9));
  assert.ok(zoneRatio(full.zones!.dmd!, plx.bounds)! < 2);

  const embedded = poste();
  embedded.roles.dmd = embedded.roles.playfield;
  assert.deepEqual(dmdKindChoices(embedded), ['dmd']);
  assert.deepEqual(dmdKindChoices(poste()), ['fulldmd', 'dmd']);
  assert.deepEqual(dmdKindChoices({ ...poste(), roles: {} }), []);
});

test('Écran du DMD : un type contraire à la forme de la zone est signalé (information)', () => {
  const squeezed = { ...poste(), dmdKind: 'fulldmd' as const };
  const findings = dmdKindFindings(squeezed);
  assert.equal(findings.length, 1);
  assert.equal(findings[0]!.severity, 'info');
  const stretched: Cabinet = { ...poste(), zones: undefined, dmdKind: 'dmd' };
  assert.equal(dmdKindFindings(stretched)[0]?.severity, 'info');
});

test('Écran du DMD : la disposition garde le type tant que la zone ne change pas, sinon la forme décide', () => {
  const before = poste();
  // Zone inchangée et type jamais dit : la question reste posée.
  assert.equal(dmdKindAfterArrange(before, poste()), undefined);
  assert.equal(dmdKindAfterArrange({ ...before, dmdKind: 'dmd' }, poste()), 'dmd');
  // Tirée en 16:9 : FullDMD ; en bande : DMD seul.
  const widened = poste();
  widened.zones = { dmd: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 } };
  assert.equal(dmdKindAfterArrange({ ...before, dmdKind: 'dmd' }, widened), 'fulldmd');
  const narrowed: Cabinet = { ...poste(), zones: { dmd: centeredDmdBand(plx.bounds) } };
  assert.equal(dmdKindAfterArrange(withDmdKind(before, 'fulldmd'), narrowed), 'dmd');
  assert.equal(dmdKindAfterArrange(before, { ...poste(), roles: { playfield: before.roles.playfield } }), undefined);
});

test('Écran du DMD : l’assistant enregistre le type avec les écrans et la disposition', () => {
  const previous = poste();
  const built = withDmdKind(poste(), 'fulldmd');
  const saved = stepCabinet(previous, built, wizardStepInfo('ecrans'));
  assert.equal(saved.dmdKind, 'fulldmd');
  assert.equal(saved.zones, undefined);
  assert.equal(stepCabinet(previous, built, wizardStepInfo('disposition')).dmdKind, 'fulldmd');
  // Une autre étape ne le touche pas.
  assert.equal(stepCabinet({ ...previous, dmdKind: 'dmd' }, built, wizardStepInfo('son')).dmdKind, 'dmd');
  assert.ok(cabinetChanges(previous, built).includes('Écran du DMD : FullDMD'));
  assert.ok(!cabinetChanges(built, built).some((l) => l.startsWith('Écran du DMD')));
});

test('Écran du DMD : le choix d’option des PuP-Packs suit le type, pas seulement la forme', () => {
  // Bande 4,8:1 déclarée FullDMD par l'utilisateur, avant que la zone ne soit refaite.
  const declared = pupCabinet({ ...poste(), dmdKind: 'fulldmd' })!;
  assert.equal(declared.fullDmd, true);
  assert.ok(declared.dmdRatio! > 4);
  assert.equal(cabinetFullDmd(declared), true);
  assert.match(describePupCabinet(declared), /FullDMD/);
  const band = pupCabinet(withDmdKind(poste(), 'dmd'))!;
  assert.equal(band.fullDmd, false);
  assert.match(describePupCabinet(band), /DMD 4:1/);
  // Sans type (modèle ancien, ou cabinet de test) : la forme.
  assert.equal(cabinetFullDmd({ backglass: true, dmd: true, topper: false, dmdRatio: 16 / 9 }), true);
  assert.equal(cabinetFullDmd({ backglass: true, dmd: true, topper: false, dmdRatio: 4 }), false);
  assert.equal(cabinetFullDmd({ backglass: true, dmd: false, topper: false }), undefined);

  const traits = (fullDmd: boolean): VariantTraits => ({ desktop: false, unsupported: false, dmd: 'separate', fullDmd, ratios: [] });
  assert.ok(scoreVariant(traits(true), declared) > scoreVariant(traits(false), declared));
  assert.ok(scoreVariant(traits(false), band) > scoreVariant(traits(true), band));
});

test('PuP-Packs : la fenêtre du DMD reçoit l’écran 5 (FullDMD), sinon l’écran 1 (DMD)', () => {
  const HEADER = 'ScreenNum,ScreenDes,PlayList,PlayFile,Loopit,Active,Priority,CustomPos';
  assert.equal(pupDmdRoot(parseScreens(`${HEADER}\n5,FullDMD,FullDMD,,,ForceBack,,\n1,DMD,DMD,,,ForceBack,,\n`)), 5);
  assert.equal(pupDmdRoot(parseScreens(`${HEADER}\n5,FullDMD,,,,off,,\n1,DMD,DMD,,,ForceBack,,\n`)), 1);
  assert.equal(pupDmdRoot(parseScreens(`${HEADER}\n2,Backglass,,,,ForceBack,,\n`)), undefined);
});

test('Écran du DMD : la synchronisation écrit la fenêtre ScoreView du type choisi', () => {
  const ini = (cabinet: Cabinet) => IniDocument.parse(planVpxSync(cabinet, devPcDisplays(), '', PROFILE).nextIni ?? '');
  const full = ini(withDmdKind(poste(), 'fulldmd'));
  assert.equal(full.get('ScoreView', 'ScoreViewFullScreen'), '1');
  assert.equal(full.get('ScoreView', 'Priority.B2S'), '50');
  assert.equal(full.get('Plugin.B2S', 'ScoreViewDMDAutoPos'), '1');
  const band = ini(withDmdKind(poste(), 'dmd'));
  assert.equal(band.get('ScoreView', 'ScoreViewFullScreen'), '0');
  assert.equal(band.get('ScoreView', 'Priority.B2S'), '0');
  assert.equal(band.get('Plugin.B2S', 'ScoreViewDMDAutoPos'), undefined);
  // Le modèle ancien (sans type) reste écrit comme avant : DMD seul d'après la forme.
  assert.equal(ini(poste()).get('ScoreView', 'Priority.B2S'), '0');
  assert.ok(isFullZone(roleZone(withDmdKind(poste(), 'fulldmd'), 'dmd')));
});
