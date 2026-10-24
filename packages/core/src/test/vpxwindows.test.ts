import assert from 'node:assert/strict';
import { test } from 'node:test';
import { toPhysicalScreen } from '../fingerprint';
import { IniDocument } from '../ini';
import { planVpxSync } from '../sync';
import { VPX_PLAY_SETTINGS } from '../vpx';
import { isOwned, vpxOwnedKeys } from '../vpx-settings';
import { classifyVpxWindow, VPX_GAME_TITLES } from '../vpxwindows';
import { devPcDisplays, emptyCabinet } from './fixtures';

// Fenêtres relevées sur le PC de développement, VPX 10.8.1-5436 en -Play (docs/tests-manuels.md).

test('les fenêtres de jeu de VPX sont laissées telles quelles', () => {
  for (const title of VPX_GAME_TITLES) assert.deepEqual(classifyVpxWindow({ title, className: 'SDL_app' }), { kind: 'game' });
});

test("l'invite ActiveX (SecurityLevel ≥ 1) arrête la partie avec le réglage à remettre", () => {
  const verdict = classifyVpxWindow({
    title: 'Visual Pinball',
    className: '#32770',
    texts: [
      '&Oui',
      '&Non',
      "This table is attempting to create an object of type 'Scripting.Dictionary'.  This object may not be safe.  Do you want to allow this object to be created?  Only answer Yes if you trust the author of this table.",
    ],
  });
  assert.equal(verdict.kind, 'dialog');
  assert.match(verdict.kind === 'dialog' ? verdict.message : '', /« Scripting\.Dictionary ».*\[Player\] SecurityLevel = 0/);
});

test('la question du casque VR (AskToTurnOn = 0) arrête la partie avec le réglage à remettre', () => {
  for (const w of [
    { title: 'Connection to VR headset failed', texts: ['&Oui', '&Non', 'Retry connection ?'] },
    { title: 'Visual Pinball Error', texts: ['OK', 'VR mode activated but OpenXR initialization failed.'] },
  ]) {
    const verdict = classifyVpxWindow({ ...w, className: '#32770' });
    assert.equal(verdict.kind, 'dialog');
    assert.match(verdict.kind === 'dialog' ? verdict.message : '', /\[PlayerVR\] AskToTurnOn = 2/);
  }
});

test('une autre boîte de dialogue garde son texte, sans les boutons', () => {
  assert.deepEqual(classifyVpxWindow({ title: 'Visual Pinball Error', className: '#32770 ', texts: ['OK', "Can't start game"] }), {
    kind: 'dialog',
    message: "Visual Pinball Error : Can't start game",
  });
});

test("l'audit de la table est fermé, la partie continue", () => {
  const audit =
    "This table contains error(s) that need to be fixed to ensure correct play.\r\n\r\nTable audit:\r\n. Error: sound 'DropTarget_Down' is used for playfield physical sound but has multiple channels (not mono).\r\n . Error: sound 'RampLoop1' is used for playfield physical sound but has multiple channels (not mono).\r\n";
  assert.deepEqual(classifyVpxWindow({ title: 'Dialog', className: '#32770', texts: ['OK', audit] }), {
    kind: 'editor',
    action: 'close',
    notice: 'Fenêtre « Table audit » de VPX fermée (2 erreurs signalées par VPX).',
  });
  assert.equal(classifyVpxWindow({ title: 'Dialog', className: '#32770', texts: ['Table audit:\r\n. Warning: …'] }).kind, 'editor');
});

test("l'éditeur, le script et la progression sont masqués : les fermer quitterait VPX ou poserait une question", () => {
  for (const w of [
    { title: 'Visual Pinball', className: 'VPinball' },
    { title: 'Visual Pinball - [Terminator 2]', className: 'VPinball' },
    { title: 'Terminator 2', className: 'CVFrame' },
    { title: 'Preparing Table', className: '#32770', texts: ['Loading Textures...'] },
  ]) {
    const verdict = classifyVpxWindow(w);
    assert.equal(verdict.kind, 'editor', w.title);
    assert.equal(verdict.kind === 'editor' && verdict.action, 'hide', w.title);
  }
});

test('une fenêtre inconnue est signalée sans être touchée', () => {
  const verdict = classifyVpxWindow({ title: 'FlexDMD', className: 'WindowsForms10.Window.8.app.0.1' });
  assert.equal(verdict.kind, 'unknown');
  assert.match(verdict.kind === 'unknown' ? verdict.notice : '', /« FlexDMD » \(classe WindowsForms10/);
});

function cabinetForDevPc() {
  const cabinet = emptyCabinet();
  cabinet.screens = devPcDisplays().map(toPhysicalScreen);
  cabinet.roles = { playfield: cabinet.screens[3]!.fingerprint };
  return cabinet;
}

test('SecurityLevel et AskToTurnOn sont des clés gérées, écrites à la synchronisation', () => {
  const plan = planVpxSync(cabinetForDevPc(), devPcDisplays(), '[Player]\nSecurityLevel = \n[PlayerVR]\nAskToTurnOn = \n');
  const ini = IniDocument.parse(plan.nextIni!);
  assert.equal(ini.get('Player', 'SecurityLevel'), '0');
  assert.equal(ini.get('PlayerVR', 'AskToTurnOn'), '2');
  assert.equal(plan.memory['Player.SecurityLevel'], '0');
  assert.equal(plan.memory['PlayerVR.AskToTurnOn'], '2');
  const owned = vpxOwnedKeys({ displayIdFormat: 'name', enabledPlugins: [] });
  for (const s of VPX_PLAY_SETTINGS) assert.ok(isOwned(owned, s.section, s.key), `${s.section}.${s.key}`);
});

test('SecurityLevel changé à la main : repéré, jamais écrasé en silence, repris sur demande', () => {
  const cabinet = cabinetForDevPc();
  const first = planVpxSync(cabinet, devPcDisplays(), '');
  const edited = IniDocument.parse(first.nextIni!);
  edited.set('Player', 'SecurityLevel', '1');
  const second = planVpxSync(cabinet, devPcDisplays(), edited.toString(), undefined, { memory: first.memory });
  assert.deepEqual(
    second.manualEdits.map((e) => [e.section, e.key, e.current, e.value]),
    [['Player', 'SecurityLevel', '1', '0']],
  );
  assert.equal(second.nextIni, undefined, 'rien n’est écrasé en silence');
  assert.ok(second.findings.some((f) => f.severity === 'warning' && /\[Player\] SecurityLevel = 1 au lieu de 0/.test(f.message)));

  const restored = planVpxSync(cabinet, devPcDisplays(), edited.toString(), undefined, { memory: first.memory, overwriteManual: true });
  assert.equal(IniDocument.parse(restored.nextIni!).get('Player', 'SecurityLevel'), '0');
});

test('les clés gardées par l’utilisateur ne sont plus écrites', () => {
  const cabinet = { ...cabinetForDevPc(), vpxManual: ['PlayerVR.AskToTurnOn'] };
  const plan = planVpxSync(cabinet, devPcDisplays(), '[PlayerVR]\nAskToTurnOn = 1\n');
  assert.equal(IniDocument.parse(plan.nextIni!).get('PlayerVR', 'AskToTurnOn'), '1');
  assert.ok(!isOwned(vpxOwnedKeys({ displayIdFormat: 'name', enabledPlugins: [] }, cabinet.vpxManual), 'PlayerVR', 'AskToTurnOn'));
});
