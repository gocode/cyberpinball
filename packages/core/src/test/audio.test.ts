import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  audioFormatFromProperty,
  audioFriendlyName,
  audioScreen,
  guidFromProperty,
  isCabinetCandidate,
  matchAudioOutputs,
  needsChannelTest,
  playfieldModeFromTest,
  speakerPairsOf,
  toAudioOutput,
  vpxSound3D,
} from '../audio';
import { toPhysicalScreen } from '../fingerprint';
import { IniDocument } from '../ini';
import type { Cabinet, CabinetAudio, ObservedAudioOutput } from '../model';
import { keepManualEdits, planVpxSync } from '../sync';
import { vpxOwnedKeys, type VpxSettingsSchema } from '../vpx-settings';
import { devPcDisplays, emptyCabinet } from './fixtures';
import * as fs from 'node:fs';
import * as path from 'node:path';

const SCHEMA = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', '..', 'installer', 'vpx-settings', '10.8.1-5436.json'), 'utf8'),
) as VpxSettingsSchema;

const hex = (s: string) => Uint8Array.from(s.match(/../g)!.map((b) => parseInt(b, 16)));

// Valeurs relevées dans le registre du PC de développement (lecture seule).
const USB_CONTAINER = '4800000001000000FDA278C3B7A7F111B0014C1D9639D06D';
const USB_FORMAT = '4100000001000000FEFF020080BB000000EE02000400100016001000030000000100000000001000800000AA00389B71';

function output(guid: string, deviceDesc: string, interfaceName: string, extra: Partial<ObservedAudioOutput> = {}): ObservedAudioOutput {
  return {
    endpointId: `{0.0.0.00000000}.{${guid}}`,
    friendlyName: audioFriendlyName(deviceDesc, interfaceName),
    deviceDesc,
    interfaceName,
    bus: 'USB',
    formFactor: 1,
    channels: 2,
    channelMask: 0x3,
    ...extra,
  };
}

/** Sorties du PC de développement, plus le HDMI de l'écran Samsung et une carte 7.1. */
function devPcAudio(): ObservedAudioOutput[] {
  return [
    output('265e053d-684a-467c-8c1c-8fc862768bce', 'Haut-parleurs', 'USB Audio Device', { containerId: '{C378A2FD-A7B7-11F1-B001-4C1D9639D06D}' }),
    output('63928751-a6a7-4e1e-84f0-d10301070e97', 'Haut-parleurs/écouteurs', 'Realtek(R) Audio', {
      bus: 'HDAUDIO',
      containerId: '{00000000-0000-0000-FFFF-FFFFFFFFFFFF}',
      isDefault: true,
    }),
    output('ffdd4474-e57f-4e21-a19c-90f06ca29ae0', 'Haut-parleurs', 'Steam Streaming Speakers', { bus: 'ROOT' }),
    output('aaaaaaaa-0000-0000-0000-000000000001', 'S22E450', 'NVIDIA High Definition Audio', {
      bus: 'HDAUDIO',
      formFactor: 9,
      containerId: '{5C5D31D9-DA90-5984-B322-628AD26691C4}',
    }),
    output('aaaaaaaa-0000-0000-0000-000000000002', 'Haut-parleurs', 'Sound Blaster 7.1', { channels: 8, channelMask: 0x63f }),
  ];
}

/** Écrans du PC : le Samsung (fronton) porte le ContainerId de sa sortie HDMI. */
function displaysWithContainers() {
  const displays = devPcDisplays();
  displays[0]!.containerId = '{5c5d31d9-da90-5984-b322-628ad26691c4}';
  displays[1]!.containerId = '{00000000-0000-0000-ffff-ffffffffffff}';
  return displays;
}

function cabinetWithAudio(audio?: Partial<CabinetAudio>): Cabinet {
  const displays = displaysWithContainers();
  const outputs = devPcAudio();
  const cabinet = emptyCabinet();
  cabinet.screens = displays.map(toPhysicalScreen);
  cabinet.roles = { playfield: cabinet.screens[3]!.fingerprint, backglass: cabinet.screens[0]!.fingerprint };
  cabinet.audio = {
    outputs: [outputs[3]!, outputs[4]!].map((o) => toAudioOutput(o, displays)),
    roles: { backglass: outputs[3]!.endpointId, playfield: outputs[4]!.endpointId },
    playfieldMode: 'ssf',
    ...audio,
  };
  return cabinet;
}

test('propriétés binaires du registre : ContainerId et format réglé dans Windows', () => {
  assert.equal(guidFromProperty(hex(USB_CONTAINER)), '{C378A2FD-A7B7-11F1-B001-4C1D9639D06D}');
  assert.deepEqual(audioFormatFromProperty(hex(USB_FORMAT)), { channels: 2, channelMask: 0x3 });
  // Même format en 7.1 : nChannels = 8, dwChannelMask = 0x63F.
  const surround = hex(USB_FORMAT);
  surround[10] = 8;
  surround.set([0x3f, 0x06, 0, 0], 28);
  assert.deepEqual(audioFormatFromProperty(surround), { channels: 8, channelMask: 0x63f });
  assert.equal(audioFormatFromProperty(hex('41000000010000')), undefined);
  assert.equal(audioFriendlyName('Haut-parleurs', '2- USB Audio Device'), 'Haut-parleurs (2- USB Audio Device)');
});

test('haut-parleurs d’une sortie : rang de chaque canal selon le masque Windows', () => {
  const pairs = (mask: number) => speakerPairsOf({ channelMask: mask }).map((p) => `${p.pair}:${p.left},${p.right}`);
  assert.deepEqual(pairs(0x3), ['front:0,1']);
  assert.deepEqual(pairs(0x63f), ['front:0,1', 'rear:4,5', 'side:6,7']);
  assert.deepEqual(pairs(0x3f), ['front:0,1', 'rear:4,5'], '5.1 arrière');
  assert.deepEqual(pairs(0x60f), ['front:0,1', 'side:4,5'], '5.1 côtés');
  assert.ok(needsChannelTest({ channels: 8, channelMask: 0x63f }));
  assert.ok(needsChannelTest({ channels: 6, channelMask: 0x3f }));
  assert.ok(!needsChannelTest({ channels: 2, channelMask: 0x3 }));
});

test('une sortie HDMI se rattache à son écran par le ContainerId, jamais par le conteneur de l’ordinateur', () => {
  const displays = displaysWithContainers();
  const [usb, realtek, steam, hdmi] = devPcAudio();
  assert.equal(audioScreen(hdmi!, displays)?.friendlyName, 'S22E450');
  assert.equal(audioScreen(realtek!, displays), undefined, 'haut-parleurs intégrés et écran du portable partagent le conteneur racine');
  assert.equal(audioScreen(usb!, displays), undefined);
  assert.equal(toAudioOutput(hdmi!, displays).screen, toPhysicalScreen(displays[0]!).fingerprint);
  assert.equal(toAudioOutput(realtek!, displays).containerId, undefined);
  assert.ok(!isCabinetCandidate(steam!), 'les sorties virtuelles sont écartées');
  assert.ok(isCabinetCandidate(usb!));
});

test('correspondance : par identifiant, puis par ContainerId sans ambiguïté', () => {
  const displays = displaysWithContainers();
  const observed = devPcAudio();
  const saved = observed.map((o) => toAudioOutput(o, displays));
  const exact = matchAudioOutputs(saved, observed);
  assert.equal(exact.matched.size, observed.length);
  assert.deepEqual(exact.missing, []);

  // Le pilote recrée la sortie HDMI : nouveau GUID, même écran.
  const recreated = devPcAudio();
  recreated[3] = { ...recreated[3]!, endpointId: '{0.0.0.00000000}.{bbbbbbbb-0000-0000-0000-000000000001}' };
  const again = matchAudioOutputs(saved, recreated);
  assert.equal(again.matched.get(observed[3]!.endpointId), recreated[3]);
  assert.deepEqual(again.approximate, [observed[3]!.endpointId]);

  // Deux sorties dans le même conteneur : on ne devine pas.
  const twice = [...recreated, { ...recreated[3]!, endpointId: '{0.0.0.00000000}.{bbbbbbbb-0000-0000-0000-000000000002}' }];
  const ambiguous = matchAudioOutputs(saved, twice);
  assert.deepEqual(ambiguous.missing, [observed[3]!.endpointId]);
});

test('modèle sans audio : aucune clé audio écrite', () => {
  const cabinet = cabinetWithAudio();
  delete cabinet.audio;
  const plan = planVpxSync(cabinet, displaysWithContainers(), '[Player]\nSoundDevice = Ma carte\n', undefined, { audio: devPcAudio() });
  const ini = IniDocument.parse(plan.nextIni!);
  assert.equal(ini.get('Player', 'SoundDevice'), 'Ma carte');
  assert.equal(ini.get('Player', 'SoundDeviceBG'), undefined);
  assert.equal(ini.get('Player', 'Sound3D'), undefined);
  assert.ok(!vpxOwnedKeys({ displayIdFormat: 'name', enabledPlugins: [] }).has('player/sounddevice'));
});

test('sorties affectées : nom courant de chaque sortie et Sound3D du SSF', () => {
  const plan = planVpxSync(cabinetWithAudio(), displaysWithContainers(), '', undefined, { audio: devPcAudio() });
  const ini = IniDocument.parse(plan.nextIni!);
  assert.equal(ini.get('Player', 'SoundDeviceBG'), 'S22E450 (NVIDIA High Definition Audio)');
  assert.equal(ini.get('Player', 'SoundDevice'), 'Haut-parleurs (Sound Blaster 7.1)');
  assert.equal(ini.get('Player', 'Sound3D'), '5');
  assert.equal(plan.audio.playfield?.channels, 8);
  assert.deepEqual(plan.findings.filter((f) => f.message.startsWith('Son')), []);

  // La sortie est renommée dans Windows : le nouveau nom est réécrit, ce n'est pas une modification à la main.
  const renamed = devPcAudio();
  renamed[4] = { ...renamed[4]!, deviceDesc: 'Plateau', friendlyName: 'Plateau (Sound Blaster 7.1)' };
  const next = planVpxSync(cabinetWithAudio(), displaysWithContainers(), plan.nextIni!, undefined, { audio: renamed, memory: plan.memory });
  assert.deepEqual(next.manualEdits, []);
  assert.deepEqual(next.changes.map((c) => `${c.key}=${c.value}`), ['SoundDevice=Plateau (Sound Blaster 7.1)']);
});

test('mixage du plateau traduit en Sound3D', () => {
  assert.equal(vpxSound3D({ playfieldMode: 'stereo' }, 2), 0);
  assert.equal(vpxSound3D({ playfieldMode: 'stereo' }, 8), 1, 'le mode 0 annule les gains sur une sortie 7.1');
  assert.equal(vpxSound3D({ playfieldMode: 'surround', lockbarPair: 'front' }, 6), 3);
  assert.equal(vpxSound3D({ playfieldMode: 'surround', lockbarPair: 'rear' }, 6), 2);
  assert.equal(vpxSound3D({ playfieldMode: 'ssf' }, 8), 5);
});

test('rôle sans sortie : clé vide, VPX prend la sortie par défaut', () => {
  const cabinet = cabinetWithAudio({ playfieldMode: 'stereo' });
  delete cabinet.audio!.roles.playfield;
  const plan = planVpxSync(cabinet, displaysWithContainers(), '[Player]\nSoundDevice = Ancienne\n', undefined, { audio: devPcAudio() });
  const ini = IniDocument.parse(plan.nextIni!);
  assert.equal(ini.get('Player', 'SoundDevice'), '');
  assert.equal(ini.get('Player', 'Sound3D'), '0');
});

test('sortie introuvable : signalée, clé laissée telle quelle et mémoire gardée', () => {
  const first = planVpxSync(cabinetWithAudio(), displaysWithContainers(), '', undefined, { audio: devPcAudio() });
  const unplugged = devPcAudio().slice(0, 4);
  const plan = planVpxSync(cabinetWithAudio(), displaysWithContainers(), first.nextIni!, undefined, { audio: unplugged, memory: first.memory });
  assert.ok(plan.findings.some((f) => f.severity === 'warning' && f.message.includes('« Haut-parleurs (Sound Blaster 7.1) » est introuvable')));
  assert.equal(plan.nextIni, undefined, 'rien à réécrire');
  assert.equal(plan.memory['Player.SoundDevice'], 'Haut-parleurs (Sound Blaster 7.1)');
  assert.equal(plan.memory['Player.Sound3D'], '5');
  assert.ok(plan.findings.some((f) => f.message.includes('Est-elle branchée ?')));

  // Le haut-parleur d'un écran éteint : c'est l'écran qu'il faut vérifier.
  const screenOff = devPcAudio().filter((o) => o.formFactor !== 9);
  const hdmi = planVpxSync(cabinetWithAudio(), displaysWithContainers(), first.nextIni!, undefined, { audio: screenOff, memory: first.memory });
  assert.ok(hdmi.findings.some((f) => f.message.includes('« S22E450 (NVIDIA High Definition Audio) » est introuvable. Son écran est-il allumé')));
});

test('deux sorties homonymes : VPX prendra la dernière, c’est signalé', () => {
  const observed = devPcAudio();
  observed.push(output('aaaaaaaa-0000-0000-0000-000000000003', 'Haut-parleurs', 'Sound Blaster 7.1'));
  const plan = planVpxSync(cabinetWithAudio(), displaysWithContainers(), '', undefined, { audio: observed });
  assert.ok(plan.findings.some((f) => f.message.includes('2 sorties s’appellent « Haut-parleurs (Sound Blaster 7.1) »')));
});

test('Sound3D trop ambitieux pour les canaux réglés dans Windows', () => {
  const stereoCard = devPcAudio();
  stereoCard[4] = { ...stereoCard[4]!, channels: 2, channelMask: 0x3 };
  const ssf = planVpxSync(cabinetWithAudio(), displaysWithContainers(), '', undefined, { audio: stereoCard });
  assert.ok(ssf.findings.some((f) => f.message.includes('réglée en stéréo dans Windows') && f.message.includes('7.1')));
  const surround = planVpxSync(cabinetWithAudio({ playfieldMode: 'surround' }), displaysWithContainers(), '', undefined, { audio: stereoCard });
  assert.ok(surround.findings.some((f) => f.message.includes('5.1 ou 7.1')));
  const stereo = planVpxSync(cabinetWithAudio({ playfieldMode: 'stereo' }), displaysWithContainers(), '', undefined, { audio: stereoCard });
  assert.deepEqual(stereo.findings.filter((f) => f.message.startsWith('Son')), []);
});

test('clé audio changée à la main : laissée, signalée, puis gardée', () => {
  const cabinet = cabinetWithAudio();
  const first = planVpxSync(cabinet, displaysWithContainers(), '', undefined, { audio: devPcAudio() });
  const doc = IniDocument.parse(first.nextIni!);
  doc.set('Player', 'Sound3D', '3');
  const plan = planVpxSync(cabinet, displaysWithContainers(), doc.toString(), undefined, { audio: devPcAudio(), memory: first.memory });
  assert.deepEqual(plan.manualEdits.map((e) => `${e.key}=${e.current}`), ['Sound3D=3']);
  assert.equal(plan.nextIni, undefined);
  const kept = keepManualEdits(cabinet, plan.manualEdits, doc.toString());
  assert.deepEqual(kept.vpxManual, ['Player.Sound3D']);
  const owned = vpxOwnedKeys({ displayIdFormat: 'name', enabledPlugins: [] }, kept.vpxManual, true);
  assert.ok(owned.has('player/sounddevicebg') && owned.has('player/sounddevice'));
  assert.ok(!owned.has('player/sound3d'));
});

test('les clés audio gérées existent dans le schéma de VPX 10.8.1', () => {
  const known = new Set(SCHEMA.settings.map((s) => `${s.section}/${s.key}`.toLowerCase()));
  const owned = vpxOwnedKeys({ displayIdFormat: 'name', enabledPlugins: [] }, [], true);
  for (const key of ['player/sounddevicebg', 'player/sounddevice', 'player/sound3d']) {
    assert.ok(owned.has(key), key);
    assert.ok(known.has(key), key);
  }
});

test('test des canaux : SSF, surround dans le sens entendu, ou stéréo', () => {
  assert.deepEqual(playfieldModeFromTest({ front: 'backglass', rear: 'lockbar', side: 'top' }), { playfieldMode: 'ssf', notices: [] });
  const crossed = playfieldModeFromTest({ front: 'backglass', rear: 'top', side: 'lockbar' });
  assert.equal(crossed.playfieldMode, 'ssf');
  assert.equal(crossed.notices.length, 1, 'câblage arrière / côté inversé');
  assert.deepEqual(playfieldModeFromTest({ front: 'lockbar', rear: 'top' }), { playfieldMode: 'surround', lockbarPair: 'front', notices: [] });
  assert.deepEqual(playfieldModeFromTest({ front: 'top', rear: 'lockbar' }), { playfieldMode: 'surround', lockbarPair: 'rear', notices: [] });
  assert.deepEqual(playfieldModeFromTest({ front: 'lockbar', rear: 'none', side: 'none' }), { playfieldMode: 'stereo', notices: [] });
});
