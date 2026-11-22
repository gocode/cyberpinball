// Lunettes 3D (anaglyph.ts) : la stéréo posée dans la copie du fichier de la table, avec des clés que
// chaque VPX du manifeste connaît, dans leurs bornes ; le profil libre de VPX, jamais un des siens ;
// SMAA remplacé en stéréo ; le calibrage de VPX refait aux boutons ; l'entrée rangée avec la Vision 3D.
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import {
  adjustCalibration,
  ANAGLYPH_CALIBRATION_STEPS,
  ANAGLYPH_FACE,
  ANAGLYPH_PROFILE,
  ANAGLYPH_STEREO_MODE,
  anaglyphCalibrationView,
  anaglyphFilters,
  anaglyphGameSettings,
  anaglyphMenuText,
  anaglyphWheelRelief,
  calibrationLevel,
  calibrationStepOf,
  DEFAULT_ANAGLYPH,
  GLASSES_PRESETS,
  isAnaglyphKey,
  nextDepth,
  nextGlasses,
  parseAnaglyphSetting,
  type AnaglyphSetting,
} from '../anaglyph';
import { IniDocument } from '../ini';
import { SYSTEM_GROUPS, SYSTEM_ITEMS, systemPathOf } from '../systemmenu';
import type { VpxSettingsSchema } from '../vpx-settings';
import { VR_REFUSED_FXAA, VR_STEREO_FXAA } from '../vr';

const INSTALLER = path.join(__dirname, '..', '..', '..', 'installer');
const VPX_VERSIONS = (JSON.parse(fs.readFileSync(path.join(INSTALLER, 'components.json'), 'utf8')) as { components: { id: string; version: string }[] }).components
  .filter((c) => c.id === 'vpx')
  .map((c) => c.version);
const ON: AnaglyphSetting = { ...DEFAULT_ANAGLYPH, mode: 'on' };
const get = (settings: { key: string; value: string }[], key: string) => settings.find((s) => s.key === key)?.value;

test('le profil des lunettes est le premier libre de VPX : Stereo3D = 11, clés Anaglyph7…', () => {
  assert.equal(ANAGLYPH_STEREO_MODE, 11);
  assert.equal(ANAGLYPH_PROFILE, ANAGLYPH_STEREO_MODE - 5 + 1);
  const s = anaglyphGameSettings(ON, '', '');
  assert.equal(get(s, 'Stereo3D'), '11');
  assert.equal(get(s, 'Stereo3DEnabled'), '1');
  assert.ok(s.filter((x) => x.key.startsWith('Anaglyph')).every((x) => x.key.startsWith('Anaglyph7')), 'jamais un des profils de VPX');
  assert.ok(s.every((x) => x.section === 'Player'));
});

for (const version of VPX_VERSIONS) {
  test(`chaque réglage de la partie en relief existe dans VPX ${version}, dans ses bornes`, () => {
    const schema = JSON.parse(fs.readFileSync(path.join(INSTALLER, 'vpx-settings', `${version}.json`), 'utf8')) as VpxSettingsSchema;
    const defs = new Map(schema.settings.map((d) => [`${d.section}/${d.key}`.toLowerCase(), d]));
    const extremes: AnaglyphSetting[] = [
      { ...ON, depth: 0.5, colors: 'vivid' },
      { ...ON, depth: 1.5, colors: 'comfort', glasses: 'amber-blue' },
      { ...ON, calibration: { left: [0.01, 1, 0.5], right: [1, 0.01, 0.2] } },
    ];
    for (const setting of extremes) {
      for (const s of anaglyphGameSettings(setting, '', '[Player]\nFXAA = 6\n')) {
        const def = defs.get(`${s.section}/${s.key}`.toLowerCase()) as { type?: string; min?: number; max?: number } | undefined;
        assert.ok(def, `[${s.section}] ${s.key} inconnu de VPX ${version}`);
        if (def.type === 'float' || def.type === 'int' || def.type === 'enum') {
          const v = Number(s.value);
          assert.ok(Number.isFinite(v), `[${s.section}] ${s.key} = ${s.value}`);
          if (def.min !== undefined) assert.ok(v >= def.min, `[${s.section}] ${s.key} = ${s.value} < ${def.min}`);
          if (def.max !== undefined) assert.ok(v <= def.max, `[${s.section}] ${s.key} = ${s.value} > ${def.max}`);
        }
      }
    }
  });
  test(`les valeurs d’usine des lunettes sont celles de VPX ${version}`, () => {
    const schema = JSON.parse(fs.readFileSync(path.join(INSTALLER, 'vpx-settings', `${version}.json`), 'utf8')) as VpxSettingsSchema;
    const def = (key: string) => (schema.settings.find((d) => d.section === 'Player' && d.key === key) as { default?: number } | undefined)?.default;
    const profile = { 'red-cyan': 1, 'green-magenta': 2, 'amber-blue': 6 } as const;
    for (const [glasses, n] of Object.entries(profile)) {
      const p = GLASSES_PRESETS[glasses as keyof typeof profile];
      assert.deepEqual([def(`Anaglyph${n}LeftRed`), def(`Anaglyph${n}LeftGreen`), def(`Anaglyph${n}LeftBlue`)], [...p.left], glasses);
      assert.deepEqual([def(`Anaglyph${n}RightRed`), def(`Anaglyph${n}RightGreen`), def(`Anaglyph${n}RightBlue`)], [...p.right], glasses);
    }
  });
}

test('profondeur : l’écart réel des yeux (63 mm) multiplié ; couleurs : la désaturation de VPX', () => {
  assert.equal(get(anaglyphGameSettings(ON, '', ''), 'Stereo3DEyeSeparation'), '63');
  assert.equal(get(anaglyphGameSettings({ ...ON, depth: 1.5 }, '', ''), 'Stereo3DEyeSeparation'), '94.5');
  assert.equal(get(anaglyphGameSettings({ ...ON, colors: 'comfort' }, '', ''), 'Anaglyph7DynDesat'), '1');
  assert.equal(get(anaglyphGameSettings({ ...ON, colors: 'vivid' }, '', ''), 'Anaglyph7DynDesat'), '0');
  assert.deepEqual([nextDepth(1), nextDepth(1.5)], [1.25, 0.5]);
});

test('SMAA, que VPX n’applique pas en stéréo, devient FXAA qualité ; un autre anticrénelage est gardé', () => {
  assert.equal(get(anaglyphGameSettings(ON, '', `[Player]\nFXAA = ${VR_REFUSED_FXAA}\n`), 'FXAA'), VR_STEREO_FXAA);
  // Le fichier de la table prime sur celui de la borne, dans les deux sens.
  assert.equal(get(anaglyphGameSettings(ON, `[Player]\nFXAA = ${VR_REFUSED_FXAA}\n`, '[Player]\nFXAA = 1\n'), 'FXAA'), VR_STEREO_FXAA);
  assert.equal(get(anaglyphGameSettings(ON, '[Player]\nFXAA = 2\n', `[Player]\nFXAA = ${VR_REFUSED_FXAA}\n`), 'FXAA'), undefined);
  assert.equal(get(anaglyphGameSettings(ON, '', '[Player]\nFXAA = 3\n'), 'FXAA'), undefined);
});

test('rien de la stéréo n’est reporté dans le fichier de la table ; ses autres réglages, si', () => {
  for (const s of anaglyphGameSettings(ON, '', `[Player]\nFXAA = ${VR_REFUSED_FXAA}\n`)) assert.ok(isAnaglyphKey(s.section, s.key), s.key);
  assert.ok(!isAnaglyphKey('Player', 'PlayfieldDisplay'));
  assert.ok(!isAnaglyphKey('TableOverride', 'ViewCabMode'));
  assert.ok(!isAnaglyphKey('Player', 'Anaglyph1LeftRed'), 'les profils de VPX ne sont pas à Cyber Pinball');
});

test('la copie du fichier de la table garde ce qu’il réglait', () => {
  const table = '[TableOverride]\r\nViewCabMode = 2\r\n';
  const doc = IniDocument.parse(table);
  for (const s of anaglyphGameSettings(ON, table, '')) doc.set(s.section, s.key, s.value);
  assert.equal(doc.get('TableOverride', 'ViewCabMode'), '2');
  assert.equal(doc.get('Player', 'Stereo3D'), '11');
});

test('un réglage douteux reprend sa valeur par défaut ; un calibrage incomplet est ignoré', () => {
  assert.deepEqual(parseAnaglyphSetting(undefined), DEFAULT_ANAGLYPH);
  assert.deepEqual(parseAnaglyphSetting({ mode: 'yes', glasses: 'purple', depth: 9, colors: 'x' }), DEFAULT_ANAGLYPH);
  assert.equal(parseAnaglyphSetting({ calibration: { left: [1, 0, 0] } }).calibration, undefined);
  // Zéro casserait le calcul de VPX (logarithme) : 1 % au moins.
  assert.deepEqual(parseAnaglyphSetting({ calibration: { left: [0, 2, 0.5], right: [0.1, 0.2, 0.3] } }).calibration, { left: [0.01, 1, 0.5], right: [0.1, 0.2, 0.3] });
  assert.equal(nextGlasses('amber-blue'), 'red-cyan');
});

test('calibrage : six étapes, l’œil gauche puis le droit, rouge, vert, bleu', () => {
  assert.equal(ANAGLYPH_CALIBRATION_STEPS, 6);
  assert.deepEqual(
    Array.from({ length: 6 }, (_, i) => calibrationStepOf(i)),
    [
      { eye: 'left', channel: 0 },
      { eye: 'left', channel: 1 },
      { eye: 'left', channel: 2 },
      { eye: 'right', channel: 0 },
      { eye: 'right', channel: 1 },
      { eye: 'right', channel: 2 },
    ],
  );
  const cal = anaglyphFilters(ON);
  assert.deepEqual(cal, GLASSES_PRESETS['red-cyan']);
  const darker = adjustCalibration(cal, 3, -0.01);
  assert.equal(calibrationLevel(darker, 3), 0.05);
  assert.deepEqual(darker.left, cal.left, 'les autres étapes ne bougent pas');
  assert.equal(calibrationLevel(adjustCalibration(cal, 0, 1), 0), 1);
  assert.equal(calibrationLevel(adjustCalibration(cal, 0, -5), 0), 0.01);
  const view = anaglyphCalibrationView(cal, 4);
  assert.deepEqual([view.eye, view.color, view.percent, view.gray], ['right', '#00ff00', 92, '#ebebeb']);
});

test('le visage du calibrage : 13 polygones, tous dans leur carré de 160 × 320', () => {
  assert.equal(ANAGLYPH_FACE.length, 13);
  for (const polygon of ANAGLYPH_FACE) {
    for (const point of polygon.split(' ')) {
      const [x, y] = point.split(',').map(Number) as [number, number];
      assert.ok(x > 0 && x < 160 && y > 0 && y < 320, point);
    }
  }
});

test('roue en relief : activée d’office avec les lunettes, verres inversés d’après le calibrage', () => {
  assert.equal(parseAnaglyphSetting(undefined).wheel, true);
  assert.equal(parseAnaglyphSetting({ wheel: false }).wheel, false);
  assert.equal(anaglyphWheelRelief(DEFAULT_ANAGLYPH), undefined, 'lunettes désactivées : roue à plat');
  assert.equal(anaglyphWheelRelief({ ...ON, wheel: false }), undefined);
  assert.deepEqual(anaglyphWheelRelief(ON), { glasses: 'red-cyan', swapped: false });
  // Le calibrage mesure ce que chaque œil voit : le rouge vu surtout de l'œil droit, verres à l'envers.
  const reversed = { left: GLASSES_PRESETS['red-cyan'].right, right: GLASSES_PRESETS['red-cyan'].left };
  assert.deepEqual(anaglyphWheelRelief({ ...ON, calibration: reversed }), { glasses: 'red-cyan', swapped: true });
  for (const glasses of ['green-magenta', 'amber-blue'] as const) {
    assert.equal(anaglyphWheelRelief({ ...ON, glasses, calibration: GLASSES_PRESETS[glasses] })!.swapped, false, glasses);
    const p = GLASSES_PRESETS[glasses];
    assert.equal(anaglyphWheelRelief({ ...ON, glasses, calibration: { left: p.right, right: p.left } })!.swapped, true, glasses);
  }
});

test('l’entrée « Lunettes 3D » est rangée juste après la Vision 3D', () => {
  const entries = SYSTEM_GROUPS['realite-virtuelle'].entries;
  assert.equal(entries.indexOf('anaglyph'), entries.indexOf('vision3d') + 1);
  assert.deepEqual(systemPathOf('anaglyph'), ['borne', 'realite-virtuelle']);
  assert.equal(SYSTEM_ITEMS.anaglyph.icon, 'glasses');
  assert.match(anaglyphMenuText(ON).label, /activées/);
  assert.match(anaglyphMenuText(DEFAULT_ANAGLYPH).label, /désactivées/);
});
