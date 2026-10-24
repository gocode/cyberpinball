import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { detectHardwareDmds, findGlobalDmdFolders, vpxDmdSettings } from '../dmd';
import { toPhysicalScreen } from '../fingerprint';
import { IniDocument } from '../ini';
import type { Cabinet, ObservedUsbDevice } from '../model';
import { keepManualEdits, planVpxSync } from '../sync';
import { parseAncillaryRenderers, parsePluginConfig, parsePluginSettings } from '../vpx-plugin-settings';
import { isOwned, vpxOwnedKeys, type VpxSettingsSchema } from '../vpx-settings';
import { vpxSettingsFor, type VpxProfile } from '../vpx';
import { devPcDisplays, emptyCabinet } from './fixtures';

const INSTALLER = path.join(__dirname, '..', '..', '..', 'installer');
const SCHEMA = JSON.parse(fs.readFileSync(path.join(INSTALLER, 'vpx-settings', '10.8.1-5436.json'), 'utf8')) as VpxSettingsSchema;
// Profil réel de VPX 10.8.1-5436 (components.json) : PinMAME, B2S, ScoreView, PUP, Serum, VNI…
const PROFILE = {
  displayIdFormat: 'name',
  ...(JSON.parse(fs.readFileSync(path.join(INSTALLER, 'components.json'), 'utf8')) as { components: { adapterSettings: object }[] }).components[0]!
    .adapterSettings,
} as VpxProfile;

function cabinet(withTopper = false): Cabinet {
  const displays = devPcDisplays();
  const c = emptyCabinet();
  c.screens = displays.map(toPhysicalScreen);
  c.roles = { playfield: c.screens[3]!.fingerprint, backglass: c.screens[0]!.fingerprint, dmd: c.screens[2]!.fingerprint };
  if (withTopper) c.roles.topper = c.screens[1]!.fingerprint;
  return c;
}

const get = (ini: string | undefined, section: string, key: string) => IniDocument.parse(ini ?? '').get(section, key);

// ---------------------------------------------------------------------------
// Lot 1 : schéma des réglages déclarés par les plugins

// Extraits de plugins/ au commit af26b2d93 de VPX.
const B2S = { id: 'B2S', name: 'B2S' };

test('plugin.cfg : identifiant et nom', () => {
  assert.deepEqual(parsePluginConfig('[configuration]\nid = "B2SLegacy"\nname = "B2S Legacy"\n'), { id: 'B2SLegacy', name: 'B2S Legacy' });
  assert.equal(parsePluginConfig('[configuration]\n'), undefined);
});

test('MSGPI_*_SETTING : types, bornes, constantes, et seulement les réglages enregistrés', () => {
  const files = [
    {
      path: 'plugins/dmdutil/DMDUtilPlugin.cpp',
      text: `#define DMDUTIL_TINT_R 255
MSGPI_BOOL_VAL_SETTING(zeDMDProp, "ZeDMD", "ZeDMD", "", true, false);
MSGPI_INT_VAL_SETTING(zeDMDBrightnessFolderProp, "ZeDMDBrightness", "ZeDMDBrightness", "", true, -1, 1000, -1);
MSGPI_INT_VAL_SETTING(lumTintRProp, "LumTintR", "LumTintR", "", true, 0, 255, DMDUTIL_TINT_R);
MSGPI_STRING_VAL_SETTING(zeDMDWiFiAddrFolderProp, "ZeDMDWiFiAddr", "ZeDMDWiFiAddr", "", true, "zedmd-wifi.local", 1024);
MSGPI_FLOAT_VAL_SETTING(pupMainVolume, "MainVol", "Main Volume", "Overall volume", true, 0.f, 1.f, 0.01f, 1.f);
static const char* upscalerNames[] = { "Disabled", "ScaleFX AA 1x", "ScaleFX 3x" };
static constexpr int scaleFactors[] = { 1, 1, 3 };
MSGPI_ENUM_SETTING(upscaleModeProp, "UpscaleMode", "Mode", "Select upscaler", true, 0, std::size(scaleFactors), upscalerNames, 0, GetUpscalerMode, SetUpscalerMode);
MSGPI_STRING_VAL_SETTING(pupBGFrameOverlayPath, "BGFrameOverlay", "Backglass Frame Overlay", "", true, "", 1024);
void Load() {
   msgApi->RegisterSetting(endpointId, &zeDMDProp);
   msgApi->RegisterSetting(endpointId, &zeDMDBrightnessFolderProp);
   msgApi->RegisterSetting(endpointId, &lumTintRProp);
   msgApi->RegisterSetting(endpointId, &zeDMDWiFiAddrFolderProp);
   msgApi->RegisterSetting(endpointId, &pupMainVolume);
   msgApi->RegisterSetting(endpointId, &upscaleModeProp);
   //msgApi->RegisterSetting(endpointId, &pupBGFrameOverlayPath);
}`,
    },
  ];
  const settings = parsePluginSettings({ id: 'DMDUtil', name: 'DMDUtil' }, files);
  assert.deepEqual(
    settings.map((s) => s.key),
    ['ZeDMD', 'ZeDMDBrightness', 'LumTintR', 'ZeDMDWiFiAddr', 'MainVol', 'UpscaleMode'],
  );
  const byKey = Object.fromEntries(settings.map((s) => [s.key, s]));
  assert.deepEqual(byKey.ZeDMD, { section: 'Plugin.DMDUtil', key: 'ZeDMD', type: 'bool', label: 'ZeDMD', description: '', default: false, plugin: 'DMDUtil' });
  assert.equal(byKey.ZeDMDBrightness!.min, -1);
  assert.equal(byKey.LumTintR!.default, 255);
  assert.equal(byKey.ZeDMDWiFiAddr!.default, 'zedmd-wifi.local');
  assert.deepEqual([byKey.MainVol!.type, byKey.MainVol!.min, byKey.MainVol!.max, byKey.MainVol!.step, byKey.MainVol!.default], ['float', 0, 1, 0.01, 1]);
  assert.deepEqual(byKey.UpscaleMode!.values, ['Disabled', 'ScaleFX AA 1x', 'ScaleFX 3x']);
  assert.equal(byKey.UpscaleMode!.max, 2);
});

test('RegisterSetting sans déclaration : erreur explicite', () => {
  assert.throws(() => parsePluginSettings(B2S, [{ path: 'a.cpp', text: 'msgApi->RegisterSetting(endpointId, &inconnu);' }]), /sans déclaration/);
});

test('moteurs de rendu des fenêtres annexes', () => {
  const renderers = parseAncillaryRenderers(B2S, [
    { path: 'plugins/b2s/B2SServer.cpp', text: '   , m_ancillaryRendererDef({ "B2S", "B2S Backglass & FullDMD", "Renderer for directb2s backglass files", this, OnRender })' },
    {
      path: 'plugins/b2slegacy/Server.cpp',
      text: `const AncillaryRendererDef backglassEntry = { "B2SLegacy", "B2S Legacy Backglass", "Renderer for B2S legacy backglass files", me, OnRenderStatic };
   const AncillaryRendererDef dmdEntry = { "B2SLegacyDMD", "B2S Legacy DMD", "Renderer for B2S legacy DMD files", me, OnRenderStatic };`,
    },
  ]);
  assert.deepEqual(
    renderers.map((r) => [r.id, r.name]),
    [
      ['B2S', 'B2S Backglass & FullDMD'],
      ['B2SLegacy', 'B2S Legacy Backglass'],
      ['B2SLegacyDMD', 'B2S Legacy DMD'],
    ],
  );
});

test('schéma 10.8.1-5436 : réglages des plugins et priorités des fenêtres', () => {
  const def = (section: string, key: string) => SCHEMA.settings.find((s) => s.section === section && s.key === key);
  for (const [section, key] of [
    ['Plugin.B2S', 'Enable'],
    ['Plugin.B2S', 'ShowGrill'],
    ['Plugin.B2S', 'ScoreViewDMDOverlay'],
    ['Plugin.B2SLegacy', 'B2SHideDMD'],
    ['Plugin.DMDUtil', 'ZeDMD'],
    ['Plugin.DMDUtil', 'PIN2DMD'],
    ['Plugin.DMDUtil', 'Pixelcade'],
    ['Plugin.Serum', 'SerumPath'],
    ['Plugin.VNI', 'VniPath'],
    ['Plugin.PinMAME', 'PinMAMEPath'],
    ['Plugin.PUP', 'PUPFolder'],
    ['Plugin.DOF', 'Enable'],
    ['Backglass', 'Priority.PUP'],
    ['Backglass', 'Priority.B2S'],
    ['ScoreView', 'Priority.ScoreView'],
    ['Topper', 'Priority.PUP'],
  ]) {
    assert.ok(def(section!, key!)?.plugin, `[${section}] ${key}`);
  }
  // PUP n'enregistre pas ses images de cadre (appel commenté dans PUPManager.cpp).
  assert.equal(def('Plugin.PUP', 'BGFrameOverlay'), undefined);
  // B2S ne se propose pas sur le topper.
  assert.equal(def('Topper', 'Priority.B2S'), undefined);
  // Les Enable de Settings_properties.inl restent ceux d'origine.
  assert.equal(def('Plugin.PinMAME', 'Enable')?.plugin, undefined);
  assert.deepEqual([def('Backglass', 'Priority.PUP')!.min, def('Backglass', 'Priority.PUP')!.max], [0, 100]);
});

// ---------------------------------------------------------------------------
// Lot 2 : priorités des fenêtres, B2SLegacy, DMD du .directb2s

test('priorités écrites pour les fenêtres affectées, avec les plugins activés', () => {
  const plan = planVpxSync(cabinet(), devPcDisplays(), '', PROFILE);
  const ini = plan.nextIni;
  assert.equal(get(ini, 'Backglass', 'Priority.PUP'), '100');
  assert.equal(get(ini, 'Backglass', 'Priority.B2S'), '50');
  assert.equal(get(ini, 'ScoreView', 'Priority.PUP'), '100');
  assert.equal(get(ini, 'ScoreView', 'Priority.B2S'), '50');
  assert.equal(get(ini, 'ScoreView', 'Priority.ScoreView'), '10');
  // Pas de topper : rien n'est écrit dans sa section en dehors de sa désactivation.
  assert.equal(get(ini, 'Topper', 'Priority.PUP'), undefined);
  assert.equal(get(planVpxSync(cabinet(true), devPcDisplays(), '', PROFILE).nextIni, 'Topper', 'Priority.PUP'), '100');
  // Sans le plugin PUP, pas de priorité PUP.
  const noPup = vpxSettingsFor({ backglass: devPcDisplays()[0] }, { ...PROFILE, enabledPlugins: ['B2S'] });
  assert.deepEqual(
    noPup.filter((s) => s.key.startsWith('Priority.')),
    [{ section: 'Backglass', key: 'Priority.B2S', value: '50' }],
  );
});

test('B2SLegacy éteint tant que B2S est activé', () => {
  const plan = planVpxSync(cabinet(), devPcDisplays(), '[Plugin.B2SLegacy]\nEnable = 1\n', PROFILE);
  assert.equal(get(plan.nextIni, 'Plugin.B2SLegacy', 'Enable'), '0');
  assert.equal(get(plan.nextIni, 'Plugin.B2S', 'Enable'), '1');
  assert.ok(!plan.findings.some((f) => f.message.includes('activés ensemble')));
  // Sans B2S, B2SLegacy n'est pas touché.
  const legacy = planVpxSync(cabinet(), devPcDisplays(), '', { ...PROFILE, enabledPlugins: ['PinMAME'] });
  assert.equal(get(legacy.nextIni, 'Plugin.B2SLegacy', 'Enable'), undefined);
});

test('B2S et B2SLegacy activés ensemble : changé à la main, signalé sans être écrasé', () => {
  const first = planVpxSync(cabinet(), devPcDisplays(), '', PROFILE);
  const edited = IniDocument.parse(first.nextIni!);
  edited.set('Plugin.B2SLegacy', 'Enable', '1');
  const plan = planVpxSync(cabinet(), devPcDisplays(), edited.toString(), PROFILE, { memory: first.memory });
  assert.deepEqual(
    plan.manualEdits.map((e) => [e.section, e.key, e.current]),
    [['Plugin.B2SLegacy', 'Enable', '1']],
  );
  const warning = plan.findings.find((f) => f.message.includes('B2S et B2SLegacy activés ensemble'));
  assert.equal(warning?.severity, 'warning');
  // Gardé par l'utilisateur : plus de modification signalée, mais le constat reste.
  const kept = keepManualEdits(cabinet(), plan.manualEdits, edited.toString());
  assert.deepEqual(kept.vpxManual, ['Plugin.B2SLegacy.Enable']);
  const after = planVpxSync(kept, devPcDisplays(), edited.toString(), PROFILE, { memory: plan.memory });
  assert.equal(after.manualEdits.length, 0);
  assert.ok(after.findings.some((f) => f.message.includes('activés ensemble')));
  assert.ok(!isOwned(vpxOwnedKeys(PROFILE, kept.vpxManual), 'Plugin.B2SLegacy', 'Enable'));
});

test('priorité changée à la main : détectée comme les autres clés gérées', () => {
  const first = planVpxSync(cabinet(), devPcDisplays(), '', PROFILE);
  const edited = IniDocument.parse(first.nextIni!);
  edited.set('ScoreView', 'Priority.ScoreView', '80');
  const plan = planVpxSync(cabinet(), devPcDisplays(), edited.toString(), PROFILE, { memory: first.memory });
  assert.deepEqual(
    plan.manualEdits.map((e) => [e.section, e.key, e.current, e.value]),
    [['ScoreView', 'Priority.ScoreView', '80', '10']],
  );
  const kept = keepManualEdits(cabinet(), plan.manualEdits, edited.toString());
  // « Section.Clé » avec un point dans la clé : seule cette clé est rendue à l'utilisateur.
  const owned = vpxOwnedKeys(PROFILE, kept.vpxManual, false, { roles: ['playfield', 'backglass', 'dmd'] });
  assert.ok(!isOwned(owned, 'ScoreView', 'Priority.ScoreView'));
  assert.ok(isOwned(owned, 'ScoreView', 'Priority.B2S'));
  assert.ok(isOwned(owned, 'ScoreView', 'ScoreViewDisplay'));
});

test('DMD du .directb2s dans la fenêtre ScoreView : proposé seulement avec un écran DMD', () => {
  const plan = planVpxSync(cabinet(), devPcDisplays(), '[Plugin.B2S]\nScoreViewDMDOverlay = \n', PROFILE);
  assert.equal(get(plan.nextIni, 'Plugin.B2S', 'ScoreViewDMDOverlay'), '1');
  assert.equal(get(plan.nextIni, 'Plugin.B2S', 'ScoreViewDMDAutoPos'), '1');
  // Valeur choisie par l'utilisateur : gardée, et ce n'est pas une modification à la main.
  const chosen = planVpxSync(cabinet(), devPcDisplays(), '[Plugin.B2S]\nScoreViewDMDOverlay = 0\n', PROFILE);
  assert.equal(get(chosen.nextIni, 'Plugin.B2S', 'ScoreViewDMDOverlay'), '0');
  assert.equal(chosen.manualEdits.length, 0);
  const noDmd = cabinet();
  delete noDmd.roles.dmd;
  assert.equal(get(planVpxSync(noDmd, devPcDisplays(), '', PROFILE).nextIni, 'Plugin.B2S', 'ScoreViewDMDOverlay'), undefined);
});

// ---------------------------------------------------------------------------
// Lot 3 : DMD réel et dossiers globaux

const usb = (instanceId: string, extra: Partial<ObservedUsbDevice> = {}): ObservedUsbDevice => {
  const m = /VID_([0-9A-F]{4})&PID_([0-9A-F]{4})/i.exec(instanceId)!;
  return { instanceId, vid: parseInt(m[1]!, 16), pid: parseInt(m[2]!, 16), ...extra };
};
// Périphériques réels du PC de développement (aucun DMD).
const DEV_PC_USB = [
  usb('USB\\VID_8087&PID_0029\\5&2d88c2ec&0&14', { name: 'Intel(R) Wireless Bluetooth(R)' }),
  usb('USB\\VID_0BDA&PID_5532\\200901010001', { name: 'USB Composite Device' }),
  usb('USB\\VID_0BDA&PID_5532&MI_00\\6&316d4b5b&0&0000', { name: 'Integrated Webcam' }),
  usb('USB\\VID_0711&PID_5640\\7&188f1d5c&0&8003', { name: 'USB Audio Device' }),
];
const ZEDMD_S3 = [
  usb('USB\\VID_303A&PID_1001\\DC:54:75:C1:2A:30', { name: 'Périphérique USB composite' }),
  usb('USB\\VID_303A&PID_1001&MI_00\\7&1a2b3c&0&0000', { name: 'Périphérique série USB (COM5)', port: 'COM5' }),
  usb('USB\\VID_303A&PID_1001&MI_02\\7&1a2b3c&0&0002', { name: 'USB JTAG/serial debug unit' }),
];

test('DMD réels : reconnus à leur VID/PID, une fois par périphérique composite', () => {
  assert.deepEqual(detectHardwareDmds(DEV_PC_USB), []);
  const zedmd = detectHardwareDmds([...DEV_PC_USB, ...ZEDMD_S3]);
  assert.equal(zedmd.length, 1);
  assert.equal(zedmd[0]!.model, 'ZeDMD');
  assert.equal(zedmd[0]!.device.port, 'COM5');
  assert.equal(zedmd[0]!.generic, false);
  const all = detectHardwareDmds([
    usb('USB\\VID_0314&PID_E457\\5&1&0&2'),
    usb('USB\\VID_1B4F&PID_0008\\6&2&0&3', { port: 'COM7' }),
    usb('USB\\VID_1A86&PID_7523\\5&3&0&4', { name: 'USB-SERIAL CH340 (COM3)', port: 'COM3' }),
  ]);
  assert.deepEqual(
    all.map((d) => [d.model, d.generic]),
    [
      ['ZeDMD', true],
      ['PIN2DMD', false],
      ['Pixelcade', false],
    ],
  );
});

test('[Plugin.DMDUtil] : Enable et la clé du modèle détecté, sinon rien', () => {
  assert.deepEqual(vpxDmdSettings(DEV_PC_USB).settings, []);
  assert.deepEqual(vpxDmdSettings(ZEDMD_S3).settings, [
    { section: 'Plugin.DMDUtil', key: 'Enable', value: '1' },
    { section: 'Plugin.DMDUtil', key: 'ZeDMD', value: '1' },
  ]);
  const ch340 = vpxDmdSettings([usb('USB\\VID_1A86&PID_7523\\5&3&0&4', { port: 'COM3' })]);
  assert.ok(ch340.findings.some((f) => f.message.includes('convertisseur USB-série courant')));
});

test('synchronisation : DMD branché puis débranché', () => {
  const none = planVpxSync(cabinet(), devPcDisplays(), '', PROFILE, { usb: DEV_PC_USB });
  assert.equal(get(none.nextIni, 'Plugin.DMDUtil', 'Enable'), undefined);
  const plugged = planVpxSync(cabinet(), devPcDisplays(), '', PROFILE, { usb: ZEDMD_S3 });
  assert.equal(get(plugged.nextIni, 'Plugin.DMDUtil', 'Enable'), '1');
  assert.equal(get(plugged.nextIni, 'Plugin.DMDUtil', 'ZeDMD'), '1');
  assert.equal(get(plugged.nextIni, 'Plugin.DMDUtil', 'PIN2DMD'), undefined);
  assert.equal(plugged.dmd[0]?.model, 'ZeDMD');
  // Débranché : rien n'est réécrit, la mémoire garde la dernière valeur écrite.
  const unplugged = planVpxSync(cabinet(), devPcDisplays(), plugged.nextIni!, PROFILE, { usb: DEV_PC_USB, memory: plugged.memory });
  assert.equal(unplugged.nextIni, undefined);
  assert.equal(unplugged.memory['Plugin.DMDUtil.ZeDMD'], '1');
  // Rebranché après un changement à la main : signalé, pas écrasé.
  const edited = IniDocument.parse(plugged.nextIni!);
  edited.set('Plugin.DMDUtil', 'ZeDMD', '0');
  const back = planVpxSync(cabinet(), devPcDisplays(), edited.toString(), PROFILE, { usb: ZEDMD_S3, memory: unplugged.memory });
  assert.deepEqual(
    back.manualEdits.map((e) => e.key),
    ['ZeDMD'],
  );
  // L'écran des réglages les montre gérées d'après la mémoire.
  const owned = vpxOwnedKeys(PROFILE, [], false, { dmdKeys: ['Enable', 'ZeDMD'] });
  assert.ok(isOwned(owned, 'Plugin.DMDUtil', 'ZeDMD'));
  assert.ok(!isOwned(owned, 'Plugin.DMDUtil', 'PIN2DMD'));
});

test('dossiers globaux de ROM et de colorisation : proposés seulement s’ils existent', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-dmd-'));
  assert.deepEqual(findGlobalDmdFolders(root), {});
  fs.mkdirSync(path.join(root, 'pinmame', 'roms'), { recursive: true });
  fs.mkdirSync(path.join(root, 'pinmame', 'altcolor', 't2_l8'), { recursive: true });
  assert.deepEqual(findGlobalDmdFolders(root), { pinmame: path.join(root, 'pinmame') });
  fs.writeFileSync(path.join(root, 'pinmame', 'altcolor', 't2_l8', 't2_l8.cRZ'), '');
  const folders = findGlobalDmdFolders(root);
  assert.deepEqual(folders, { pinmame: path.join(root, 'pinmame'), serum: path.join(root, 'pinmame', 'altcolor') });
  const plan = planVpxSync(cabinet(), devPcDisplays(), '[Plugin.PinMAME]\nPinMAMEPath = D:\\Mes ROM\n', PROFILE, { folders });
  assert.equal(get(plan.nextIni, 'Plugin.PinMAME', 'PinMAMEPath'), 'D:\\Mes ROM');
  assert.equal(get(plan.nextIni, 'Plugin.Serum', 'SerumPath'), path.join(root, 'pinmame', 'altcolor'));
  assert.equal(get(plan.nextIni, 'Plugin.VNI', 'VniPath'), undefined);
});

test('chaque clé écrite pour VPX 10.8.1-5436 existe dans son schéma', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-dmd-'));
  fs.mkdirSync(path.join(root, 'pinmame', 'roms'), { recursive: true });
  fs.mkdirSync(path.join(root, 'pinmame', 'altcolor', 'afm'), { recursive: true });
  fs.writeFileSync(path.join(root, 'pinmame', 'altcolor', 'afm', 'afm.pal'), '');
  const devices = [...ZEDMD_S3, usb('USB\\VID_0314&PID_E457\\1'), usb('USB\\VID_1B4F&PID_0008\\2')];
  const plan = planVpxSync(cabinet(true), devPcDisplays(), '', PROFILE, { usb: devices, folders: findGlobalDmdFolders(root) });
  const known = new Set(SCHEMA.settings.map((s) => `${s.section}/${s.key}`.toLowerCase()));
  const written = IniDocument.parse(plan.nextIni!).entries();
  assert.ok(written.length > 40);
  for (const e of written) assert.ok(known.has(`${e.section}/${e.key}`.toLowerCase()), `[${e.section}] ${e.key}`);
  // Et l'écran des réglages les montre toutes comme gérées, sauf les valeurs proposées.
  const owned = vpxOwnedKeys(PROFILE, [], false, { roles: ['playfield', 'backglass', 'dmd', 'topper'], dmdKeys: ['Enable', 'ZeDMD', 'PIN2DMD', 'Pixelcade'] });
  const proposed = ['CabinetAutofitMode', 'ScoreViewDMDOverlay', 'ScoreViewDMDAutoPos', 'PinMAMEPath', 'VniPath'];
  for (const e of written) if (!proposed.includes(e.key)) assert.ok(isOwned(owned, e.section, e.key), `[${e.section}] ${e.key}`);
});
