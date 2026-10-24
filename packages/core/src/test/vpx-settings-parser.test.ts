import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { evalNumber, extractConstants, parseSettingsProperties, SettingsParseError, type ParseOptions, type VpxSettingDef } from '../vpx-settings-parser';
import type { VpxSettingsSchema } from '../vpx-settings';

// Extraits tels quels de src/core/Settings_properties.inl, VPX 10.8.1-5436 (commit af26b2d93).
const BGFX: ParseOptions = { defines: ['_WIN32', 'ENABLE_BGFX'], constants: { g_isMobile: 0, g_isStandalone: 0 } };
const OPENGL: ParseOptions = { ...BGFX, defines: ['_WIN32'] };

const parseOne = (src: string, options = BGFX): VpxSettingDef => {
  const all = parseSettingsProperties(src, options);
  assert.equal(all.length, 1);
  return all[0]!;
};

test('PropInt : bornes et défaut', () => {
  const s = parseOne(
    'PropInt(Player, MusicVolume, "Backglass Volume"s, "Main volume for music and sound played from the backglass speakers"s, 0, 100, 100);',
  );
  assert.deepEqual(s, {
    section: 'Player',
    key: 'MusicVolume',
    type: 'int',
    label: 'Backglass Volume',
    description: 'Main volume for music and sound played from the backglass speakers',
    default: 100,
    min: 0,
    max: 100,
  });
});

test('PropEnum sur plusieurs lignes, description en chaînes accolées avec \\n', () => {
  const s = parseOne(`PropEnum(Player, SyncMode, "Synchronization"s,
   "None: No synchronization.\\nVertical Sync: Synchronize on video sync, avoids video tearing at the price of high visual latency.\\nAdaptive Sync: Synchronize on video sync, "
   "except for late frames (below target FPS), also features higher visual latency.\\nFrame Pacing: pace the frame rendering to limit visual latency, comes with the risk of introducing more stutters if the computer is not powerful enough."s,
   int, 3, "No Sync"s, "Vertical Sync"s, "Adaptive Sync"s, "Frame Pacing"s);`);
  assert.equal(s.type, 'enum');
  assert.equal(s.default, 3);
  assert.deepEqual(s.values, ['No Sync', 'Vertical Sync', 'Adaptive Sync', 'Frame Pacing']);
  assert.equal(s.min, 0);
  assert.equal(s.max, 3);
  assert.ok(s.description.startsWith('None: No synchronization.\nVertical Sync'));
  assert.ok(s.description.includes('Synchronize on video sync, except for late frames'));
});

test('PropEnumDyn : réglage contextuel, commentaires dans les arguments', () => {
  const s = parseOne(`PropEnumDyn(Backglass, BackglassOutput, "Output Mode"s, "Select between disabled, floating, or embedded in another window mode"s, int /* OutputMode */, 0 /* OM_DISABLED */, "Disabled"s,
   "Floating"s, "Embedded in playfield"s);`);
  assert.equal(s.contextual, true);
  assert.deepEqual(s.values, ['Disabled', 'Floating', 'Embedded in playfield']);
});

const FULLSCREEN = `PropStringDyn(Player, PlayfieldDisplay, "Display"s, "Display used for the main Playfield window"s, ""s);
#ifdef ENABLE_BGFX
PropEnumDyn(Player, PlayfieldFullScreen, "Display Mode"s, "Select between windowed or borderless fullscreen mode"s, int, 0, "Windowed"s, "Borderless Fullscreen"s);
#else
PropEnumDyn(Player, PlayfieldFullScreen, "Display Mode"s, "Select between windowed, borderless fullscreen or fullscreen mode"s, int, 0, "Windowed"s, "Borderless Fullscreen"s, "Fullscreen"s);
#endif
PropIntDyn(Player, PlayfieldWndX, "X Position"s, "Horizontal position of the window on the selected display"s, 0, 16384, 0);`;

test('#ifdef ENABLE_BGFX : on garde la branche du build installé', () => {
  const bgfx = parseSettingsProperties(FULLSCREEN, BGFX);
  assert.deepEqual(bgfx.map((s) => s.key), ['PlayfieldDisplay', 'PlayfieldFullScreen', 'PlayfieldWndX']);
  assert.deepEqual(bgfx[1]!.values, ['Windowed', 'Borderless Fullscreen']);
  const opengl = parseSettingsProperties(FULLSCREEN, OPENGL);
  assert.deepEqual(opengl[1]!.values, ['Windowed', 'Borderless Fullscreen', 'Fullscreen']);
});

test('#if imbriqués, #elif defined(), macros en commentaire de bloc ignorées', () => {
  const src = `#if defined(ENABLE_BGFX)
#ifdef __ANDROID__
/* PropEnum(Player, GfxBackend, "Graphics Backend"s, "Graphics API/backend used for rendering"s, int, bgfx::RendererType::OpenGLES, "Noop"s, "Agc"s, "Direct3D11"s, "Direct3D12"s, "Gnm"s,
   "Metal"s, "Nvn"s, "OpenGLES"s, "OpenGL"s, "Vulkan"s, "Default"s);*/
PropString(Player, GfxBackend, "Graphics Backend"s, "Graphics API/backend used for rendering"s, "OpenGLES"s);
#elif defined(__APPLE__)
PropString(Player, GfxBackend, "Graphics Backend"s, "Graphics API/backend used for rendering"s, "Metal"s);
#else
PropString(Player, GfxBackend, "Graphics Backend"s, "Graphics API/backend used for rendering"s, "Default"s);
/* PropEnum(Player, GfxBackend, "Graphics Backend"s, "Graphics API/backend used for rendering"s, int, bgfx::RendererType::Count, "Noop"s, "Agc"s, "Direct3D11"s, "Direct3D12"s, "Gnm"s,
   "Metal"s,
   "Nvn"s, "OpenGLES"s, "OpenGL"s, "Vulkan"s, "Default"s); */
#endif
#endif
#if SDL_PLATFORM_ANDROID && defined(ENABLE_XR)
PropEnum(PlayerVR, AskToTurnOn, "Enable VR"s, "Ask to turn on VR"s, int, 0, "Enabled"s, "Autodetect"s, "Disabled"s);
#else
PropEnum(PlayerVR, AskToTurnOn, "Enable VR"s, "Ask to turn on VR"s, int, 2, "Enabled"s, "Autodetect"s, "Disabled"s);
#endif`;
  const bgfx = parseSettingsProperties(src, BGFX);
  assert.deepEqual(bgfx.map((s) => [s.key, s.default]), [['GfxBackend', 'Default'], ['AskToTurnOn', 2]]);
  assert.deepEqual(parseSettingsProperties(src, OPENGL).map((s) => s.key), ['AskToTurnOn']);
  const android = parseSettingsProperties(src, { ...BGFX, defines: ['ENABLE_BGFX', '__ANDROID__', 'SDL_PLATFORM_ANDROID', 'ENABLE_XR'] });
  assert.deepEqual(android.map((s) => [s.key, s.default]), [['GfxBackend', 'OpenGLES'], ['AskToTurnOn', 0]]);
});

test('PropArray est ignoré : ce sont des alias de réglages déjà déclarés', () => {
  const src = `PropIntDyn(Player, PlayfieldWidth, "Width"s, "Width of the window"s, 0, 16384, 16384);
PropArray(Window, Display, string, String, String, m_propPlayer_PlayfieldDisplay, m_propBackglass_BackglassDisplay, m_propScoreView_ScoreViewDisplay, m_propTopper_TopperDisplay,
   m_propPlayerVR_PreviewDisplay);
PropArray(
   Window, Height, int, Int, Int, m_propPlayer_PlayfieldHeight, m_propBackglass_BackglassHeight, m_propScoreView_ScoreViewHeight, m_propTopper_TopperHeight, m_propPlayerVR_PreviewHeight);`;
  assert.deepEqual(parseSettingsProperties(src, BGFX).map((s) => s.key), ['PlayfieldWidth']);
});

test('CMTOVPU : bornes et défaut convertis comme VPX, en float 32 bits', () => {
  const s = parseOne(
    'PropFloatDyn(TableOverride, ViewDTPlayerY, "Camera Y"s, "View point height offset"s, CMTOVPU(-100.f), CMTOVPU(100.f), CMTOVPU(20.f));',
  );
  // 50 / (2.54 × 1.0625) unités VPX par centimètre.
  assert.equal(s.min, -1852.71);
  assert.equal(s.max, 1852.71);
  assert.equal(s.default, 370.5419);
  assert.equal(s.contextual, true);
});

test('g_isMobile ? … : … et littéraux float (0.2f, 3.f)', () => {
  const tex = parseOne(
    'PropInt(Player, MaxTexDimension, "Maximum texture dimension"s, "Images sized above this limit will be automatically scaled down on load"s, 512, 16384, g_isMobile ? 1536 : 16384);',
  );
  assert.equal(tex.default, 16384);
  assert.equal(parseOne('PropInt(Player, MaxTexDimension, "x"s, ""s, 512, 16384, g_isMobile ? 1536 : 16384);', { ...BGFX, constants: { g_isMobile: 1 } }).default, 1536);
  const fit = parseOne(
    'PropFloat(Player, CabinetAutofitPos, "Cabinet Autofit Pos"s, "Relative lower flipper bat position when using automatic view fitting (0% for bottom of screen, 100% for top)"s, 0.f, 0.2f, 0.05f);',
  );
  assert.deepEqual([fit.min, fit.max, fit.default], [0, 0.2, 0.05]);
});

test('Unbounded, conversions (int)0xFFFFFFFFu, couleurs et RGB()', () => {
  const loops = parseOne(`PropIntUnbounded(Player, PhysicsMaxLoops, "Physics Max Loops"s,
   "Maximum number of physics iteration above which physics engine just skip to stay playable.\\nThis is somewhat hacky, override table setup, and may cause gameplay issues. This should not be used anymore."s,
   (int)0xFFFFFFFFu);`);
  assert.equal(loops.default, -1);
  assert.equal(loops.min, undefined);
  const tint = parseOne('PropInt(DMD, Profile2DotTint, "Dot Tint"s, "Color of lit dots"s, 0x000000, 0xFFFFFF, 0x2D52FF);');
  assert.equal(tint.color, true);
  assert.equal(tint.default, 0x2d52ff);
  const back = parseOne('PropInt(DefaultPropsDispReel, BackColor, "BackColor"s, ""s, 0x000000, 0xFFFFFF, RGB(64, 64, 64));');
  assert.equal(back.section, 'DefaultProps\\DispReel');
  assert.equal(back.default, 0x404040);
  assert.equal(parseOne('PropInt(Player, Exitconfirm, "Direct Exit Length"s, "x"s, 0, 30 * 60, 120);').max, 1800);
});

test('Énumérations dont le défaut est une constante des en-têtes, PropEnum1 et PropEnumWithMin', () => {
  // Extraits de src/core/vpinball.idl.
  const constants = extractConstants([
    `typedef [uuid(5E83616D-C764-4071-8C17-AB2A73D1B7A9)]
        enum GateType
                {
                GateWireW = 1,
                GateWireRectangle = 2,
                GatePlate = 3,
                GateLongPlate = 4,
                }
                GateType;`,
    `enum TriggerShape { TriggerNone = 0, TriggerWireA = 1, TriggerStar = 2 } TriggerShape;`,
  ]);
  const gate = parseOne(
    'PropEnum1(DefaultPropsGate, GateType, "GateType"s, ""s, GateType, GateWireW, "GateWireW"s, "GateWireRectangle"s, "GatePlate"s, "GateLongPlate"s);',
    { ...BGFX, constants },
  );
  assert.deepEqual([gate.min, gate.max, gate.default], [1, 4, 1]);
  const trigger = parseOne(
    'PropEnum(DefaultPropsTrigger, Shape, "Shape"s, ""s, TriggerShape, TriggerWireA, "None"s, "Wire A"s, "Star"s, "Wire B"s, "Button"s, "Wire C"s, "Wire D"s, "Inder"s);',
    { ...BGFX, constants },
  );
  assert.equal(trigger.default, 1);
  const mode = parseOne('PropEnumWithMin(Standalone, RenderingModeOverride, "Override rendering mode"s, ""s, int, -1, -1, "Default"s, "2D"s, "Stereo 3D"s, "VR"s);');
  assert.deepEqual([mode.min, mode.max, mode.default], [-1, 2, -1]);
});

test('#define en chaîne et constantes manquantes', () => {
  const constants = extractConstants(['#define DEFAULT_TABLE_GRAVITY            0.97f\n#define DEFAULT_STEPTIME_S    0.01       // VPT\n#define PHYS_FACTOR (1 / DEFAULT_STEPTIME_S)']);
  assert.equal(constants.DEFAULT_TABLE_GRAVITY, 0.97);
  assert.equal(constants.PHYS_FACTOR, 100);
  assert.throws(
    () => parseSettingsProperties('PropFloatUnbounded(Player, TablePhysicsGravityConstant0, "x"s, ""s, DEFAULT_TABLE_GRAVITY);', BGFX),
    (e: Error) => e instanceof SettingsParseError && /constante inconnue DEFAULT_TABLE_GRAVITY/.test(e.message),
  );
  assert.equal(evalNumber('(float)(M_PI / 2.0)', { M_PI: Math.PI }), Math.PI / 2);
  assert.equal(evalNumber('(float)((2 * EDITOR_BG_WIDTH) / 2)', { EDITOR_BG_WIDTH: 1000 }), 1000);
});

test('sections : Plugin… et DefaultProps… comme Settings::GetBackwardCompatibleSection', () => {
  const s = parseSettingsProperties(
    'PropBoolDyn(PluginPinMAME, Enable, "Enable"s, "Enable PinMAME plugin"s, g_isStandalone);\nPropFloat(DefaultPropsBall, Mass, "Ball Mass"s, ""s, 0.1f, 2.f, 1.f);',
    BGFX,
  );
  assert.deepEqual(s.map((d) => [d.section, d.key, d.default]), [['Plugin.PinMAME', 'Enable', false], ['DefaultProps\\Ball', 'Mass', 1]]);
});

test('une macro inconnue ou un réglage en double est une erreur, pas un réglage faux', () => {
  assert.throws(() => parseSettingsProperties('PropColor(Player, X, ""s, ""s, 0);', BGFX), /macro inconnue PropColor/);
  assert.throws(
    () => parseSettingsProperties('PropBool(Player, Mirror, ""s, ""s, false);\nPropBool(Player, mirror, ""s, ""s, false);', BGFX),
    /déclaré deux fois/,
  );
});

// Le schéma committé, produit par `npm run vpx-schema` à partir du vrai fichier.
const SCHEMA_FILE = path.join(__dirname, '..', '..', '..', 'installer', 'vpx-settings', '10.8.1-5436.json');

test('schéma de VPX 10.8.1-5436 : nombre de réglages et cas particuliers', () => {
  const schema = JSON.parse(fs.readFileSync(SCHEMA_FILE, 'utf8')) as VpxSettingsSchema;
  // 1148 macros de réglage moins les 9 de la branche #else (non BGFX), puis 101 réglages
  // déclarés par les plugins ; vérifié par `npm run vpx-schema -- --ini` contre un
  // VPinballX.ini écrit par cette version.
  assert.equal(schema.count, 1240);
  assert.equal(schema.settings.length, 1240);
  assert.equal(schema.settings.filter((s) => !s.plugin).length, 1139);
  assert.equal(schema.sourceCommit, 'af26b2d93');
  const get = (section: string, key: string) => schema.settings.find((s) => s.section === section && s.key === key);
  assert.deepEqual(get('Player', 'BGSet')?.values, ['Desktop / Full Single Screen', 'Cabinet', 'Full Single Screen']);
  assert.equal(get('Player', 'PlayfieldFullScreen')?.values?.length, 2);
  assert.equal(get('TableOverride', 'ToneMapper')?.values?.length, 5);
  assert.equal(get('Player', 'SecurityLevel')?.default, 0);
  assert.equal(get('Player', 'TablePhysicsGravityConstant0')?.default, 0.97);
  assert.equal(get('DefaultProps\\Gate', 'AngleMax')?.default, 1.570796);
  assert.equal(get('Version', 'VPinball')?.default, '10815436');
});
