// Choix du cadrage (23/11/2026) : trois styles montrés sur une image de la table, « Plein écran,
// apron rogné » par défaut, le style de la borne écrit dans VPinballX.ini, celui d'une table dans son .ini, un retour
// arrière, et le parcours d'une table qui propose de choisir son cadrage et un POV de la communauté.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { toPhysicalScreen } from '../fingerprint';
import { DEFAULT_FRAMING_STYLE, framingStyleOf, framingStyles, framingStyleSettings, withTableFramingStyle, type FramingStyle } from '../framing-styles';
import { customViewHolds, customViewOf, rememberCustomView, savedCustomView, withCustomView } from '../framing-custom';
import { framingHistory, rememberFraming, restoreFramingOps } from '../framing-history';
import { IniDocument } from '../ini';
import { planJourney, type JourneyInput } from '../journey';
import { decodeQoi } from '../qoi';
import { planVpxSync } from '../sync';
import { DEFAULT_VPX_PROFILE } from '../vpx';
import { devPcDisplays, emptyCabinet } from './fixtures';

function cabinetForDevPc() {
  const displays = devPcDisplays();
  const cabinet = emptyCabinet();
  cabinet.screens = displays.map(toPhysicalScreen);
  cabinet.roles = { playfield: cabinet.screens[3]!.fingerprint, backglass: cabinet.screens[0]!.fingerprint, dmd: cabinet.screens[2]!.fingerprint };
  return { ...cabinet, playfield: { flipperEdge: 'right' as const } };
}
const patched = { ...DEFAULT_VPX_PROFILE, keepTopFraming: true };
const reader = (text: string) => {
  const doc = IniDocument.parse(text);
  return (s: string, k: string) => doc.get(s, k);
};

test('styles : « apron rogné » par défaut, chacun se relit tel quel, « Table entière » seulement avec le VPX corrigé', () => {
  assert.equal(DEFAULT_FRAMING_STYLE, 'garde-le-haut');
  assert.deepEqual(framingStyles(true), ['garde-le-haut', 'entiere', 'remplir']);
  assert.deepEqual(framingStyles(false), ['garde-le-haut', 'remplir']);
  for (const keepTop of [true, false]) {
    for (const style of framingStyles(keepTop)) {
      const ini = withTableFramingStyle('[TableOverride]\r\nViewCabScaleX = 1.2\r\n', style, keepTop);
      assert.equal(framingStyleOf(reader(ini), keepTop), style, `${style} (${keepTop})`);
      assert.equal(IniDocument.parse(ini).get('TableOverride', 'ViewCabScaleX'), '1.2', 'les autres réglages de la table restent');
    }
  }
  assert.equal(framingStyleOf(reader('[Player]\nCabinetAutofitMode = 0\n'), true), undefined, 'cadrage manuel : pas un style');
  // Un style changé pour un autre : plus aucune clé de l'ancien.
  const again = withTableFramingStyle(withTableFramingStyle('', 'entiere', true), 'remplir', true);
  assert.equal(IniDocument.parse(again).get('Player', 'CabinetAutofitPos'), undefined);
});

test('style de la borne : écrit dans VPinballX.ini comme clés gérées ; sans choix, le comportement d’avant', () => {
  const choices: FramingStyle[] = ['entiere', 'remplir', 'garde-le-haut'];
  for (const framing of choices) {
    const next = IniDocument.parse(planVpxSync({ ...cabinetForDevPc(), framing }, devPcDisplays(), '', patched).nextIni!);
    for (const s of framingStyleSettings(framing, true)) assert.equal(next.get(s.section, s.key), s.value, `${framing} ${s.key}`);
  }
  // Rien de choisi : « Ajuster » imposé et « garder le haut » proposé seulement dans les clés vides (0.2.3-essai.37).
  const none = IniDocument.parse(planVpxSync(cabinetForDevPc(), devPcDisplays(), '[Player]\nCabinetAutofitMaxStretch = 0.3\n', patched).nextIni!);
  assert.equal(none.get('Player', 'CabinetAutofitMode'), '1');
  assert.equal(none.get('Player', 'CabinetAutofitMaxStretch'), '0.3');
  // « Table entière » demandée à un VPX qui ne sait pas garder le haut : le défaut de ce VPX, jamais des clés qu'il ignore.
  const plain = IniDocument.parse(planVpxSync({ ...cabinetForDevPc(), framing: 'entiere' }, devPcDisplays(), '').nextIni!);
  assert.equal(plain.get('Player', 'CabinetAutofitKeepTop'), undefined);
  assert.equal(plain.get('Player', 'CabinetAutofitMode'), '1');
});

test('retour arrière : chaque état gardé se rétablit, du plus récent au plus ancien, sans .ini compris', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-cadrage-histo-'));
  const table = path.join(dataDir, 'Table.vpx');
  const ini = path.join(dataDir, 'Table.ini');
  rememberFraming(dataDir, table, { at: '2026-11-23T10:00:00Z', label: 'Cadrage de la borne', ini: null });
  rememberFraming(dataDir, table, { at: '2026-11-23T10:01:00Z', label: 'POV « a.pov »', ini: '[Player]\r\nCabinetAutofitMode = 0\r\n' });
  assert.equal(framingHistory(dataDir, table).length, 2);
  const last = restoreFramingOps(dataDir, table, ini)!;
  assert.deepEqual(last.ops, [{ op: 'write', path: ini, content: '[Player]\r\nCabinetAutofitMode = 0\r\n' }]);
  last.commit();
  fs.writeFileSync(ini, 'x');
  const first = restoreFramingOps(dataDir, table, ini)!;
  assert.deepEqual(first.ops, [{ op: 'trash', path: ini }], 'la table n’avait pas de .ini : il part à la corbeille');
  first.commit();
  assert.equal(restoreFramingOps(dataDir, table, ini), undefined);
  for (let i = 0; i < 15; i++) rememberFraming(dataDir, table, { at: '', label: String(i), ini: null });
  assert.equal(framingHistory(dataDir, table).length, 10, 'dix états au plus');
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('vue personnalisée : gardée quand un style ou un POV la remplace, remise telle quelle, sans toucher aux autres réglages', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-cadrage-perso-'));
  const table = path.join(dataDir, 'Monster Bash.vpx');
  const mine = '[Player]\r\nCabinetAutofitMode = 0\r\n[TableOverride]\r\nViewCabScaleX = 1.31\r\nViewCabScaleY = 1.07\r\nViewCabPlayerZ = 640\r\n[Autre]\r\nA = 1\r\n';
  assert.equal(rememberCustomView(dataDir, table, mine), true);
  assert.deepEqual(savedCustomView(dataDir, table)?.values, [
    { key: 'ViewCabScaleX', value: '1.31' },
    { key: 'ViewCabScaleY', value: '1.07' },
    { key: 'ViewCabPlayerZ', value: '640' },
  ]);
  // Un .ini sans vue propre (style automatique, ou POV sans réglage) ne remplace pas la vue gardée.
  assert.equal(rememberCustomView(dataDir, table, '[Player]\r\nCabinetAutofitMode = 1\r\n'), false);
  assert.equal(savedCustomView(dataDir, table)?.values.length, 3);
  // Un autre style est passé par-dessus : la vue du joueur est encore dans le .ini, et customViewOf la retrouve.
  const style = withTableFramingStyle(mine, 'entiere', true);
  assert.equal(customViewOf(style).length, 3);
  // Un POV importé retire ses ViewCab… : la vue gardée les remet, en cadrage manuel, sans clés de style.
  const pov = '[Player]\r\nCabinetAutofitMode = 0\r\n[TableOverride]\r\nViewCabScaleX = 0.9\r\nViewCabLookAt = 20\r\n[Autre]\r\nA = 1\r\n';
  const back = IniDocument.parse(withCustomView(withTableFramingStyle(pov, 'remplir', true), savedCustomView(dataDir, table)!));
  assert.equal(back.get('Player', 'CabinetAutofitMode'), '0');
  assert.equal(back.get('Player', 'CabinetAutofitKeepTop'), undefined);
  assert.equal(back.get('TableOverride', 'ViewCabScaleX'), '1.31');
  assert.equal(back.get('TableOverride', 'ViewCabLookAt'), undefined, 'les ViewCab… du POV sont retirés');
  assert.equal(back.get('Autre', 'A'), '1', 'les autres réglages de la table restent');
  assert.equal(customViewHolds(back.toString(), savedCustomView(dataDir, table)!), true);
  assert.equal(customViewHolds(style, savedCustomView(dataDir, table)!), false, 'sous un style automatique, ce n’est pas la vue du joueur');
  fs.rmSync(dataDir, { recursive: true, force: true });
});

function journeyInput(over: Partial<JourneyInput>): JourneyInput {
  return { file: 'C:\\t\\Table.vpx', vpxInstalled: true, cabinetConfigured: true, screens: { backglass: false, dmd: 'none', topper: false }, findings: [], ...over };
}

test('parcours d’une table : en vue borne, « Choisir le cadrage » ; sur un bureau, rien de plus', () => {
  const cabinet = planJourney(journeyInput({ cabinetView: true })).extras.find((s) => s.id === 'display');
  assert.ok(cabinet?.choices.some((c) => c.action.kind === 'framing'));
  assert.equal(cabinet?.required, false, 'jamais indispensable pour jouer');
  assert.equal(planJourney(journeyInput({ cabinetView: false })).extras.find((s) => s.id === 'display'), undefined);
});

test('aperçus : VPinballX.ini fenêtré à la forme du playfield, sans son ni toys ni vrai DMD ni fenêtres annexes', () => {
  // Module de l'application (app/dist), compilé avant les tests.
  type Size = { width: number; height: number };
  const { previewIni, renderSize } = require(path.resolve(__dirname, '../../../../app/dist/framing-preview.js')) as {
    previewIni(globalIni: string, window: Size, pinmame: string, pup: boolean): string;
    renderSize(window: Size): Size;
  };
  assert.deepEqual(renderSize({ width: 1080, height: 1920 }), { width: 540, height: 960 });
  assert.deepEqual(renderSize({ width: 3840, height: 2160 }), { width: 1706, height: 960 });
  const doc = IniDocument.parse(previewIni('[Player]\nPlayfieldFullScreen = 1\nSoundVolume = 80\n[Plugin.DOF]\nEnable = 1\n', { width: 1080, height: 1920 }, 'X:\\travail\\pinmame', false));
  const get = (s: string, k: string) => doc.get(s, k);
  assert.deepEqual([get('Player', 'PlayfieldFullScreen'), get('Player', 'PlayfieldWidth'), get('Player', 'PlayfieldHeight'), get('Player', 'SoundVolume')], ['0', '540', '960', '0']);
  for (const id of ['DOF', 'DMDUtil', 'CyberPinball', 'CyberPinballDmd', 'PUP']) assert.equal(get(`Plugin.${id}`, 'Enable'), '0', id);
  assert.equal(get('Plugin.PinMAME', 'PinMAMEPath'), 'X:\\travail\\pinmame', 'mémoire de PinMAME à part : celle du joueur n’est jamais écrite');
  assert.equal(get('Backglass', 'BackglassOutput'), '0');
  // Une table dont le script exige PinUP Player : PUP rallumé au second essai.
  assert.equal(IniDocument.parse(previewIni('', { width: 1080, height: 1920 }, 'X:\\p', true)).get('Plugin.PUP', 'Enable'), '1');
});

test('aperçus : chaque image donnée est autorisée à l’affichage (cache hors des dossiers de médias)', async () => {
  // 0.2.4-essai.12 sur la borne : images rendues, mais cartes vides, « accès refusé hors des dossiers de médias ».
  type Req = { table: string; tableIni: string; globalIni: string; window: { width: number; height: number } };
  const mod = require(path.resolve(__dirname, '../../../../app/dist/framing-preview.js')) as {
    createFramingPreviews(deps: { dataDir: string; vpxExe(): string; allow(file: string): void }): { cached(req: Req): string | undefined; render(req: Req): Promise<string> };
    previewKey(req: Req, exe: string): string;
  };
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-cadrage-apercus-'));
  const exe = path.join(dataDir, 'VPinballX_BGFX64.exe');
  const table = path.join(dataDir, 'Table.vpx');
  fs.writeFileSync(exe, 'x');
  fs.writeFileSync(table, 'x');
  const allowed: string[] = [];
  const previews = mod.createFramingPreviews({ dataDir, vpxExe: () => exe, allow: (file) => allowed.push(file) });
  const req: Req = { table, tableIni: '', globalIni: '[Player]\nBGSet = 1\n', window: { width: 1080, height: 1920 } };
  assert.equal(previews.cached(req), undefined);
  const png = path.join(dataDir, 'cache', 'cadrage', `${mod.previewKey(req, exe)}.png`);
  fs.mkdirSync(path.dirname(png), { recursive: true });
  fs.writeFileSync(png, 'png');
  assert.equal(previews.cached(req), png);
  assert.equal(await previews.render(req), png, 'déjà rendue : pas de VPX lancé');
  assert.deepEqual(allowed, [png, png]);
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('aperçus : la clé du cache suit le cadrage effectif, pas le texte du .ini (choisir un point de vue ne refait pas les autres images)', () => {
  // 24/11/2026 : après un choix dans « Point de vue », les aperçus étaient tous rendus de nouveau, parce que le .ini de
  // chaque proposition (écrit à partir de celui de la table, qui venait de changer) différait par son texte seulement.
  const mod = require(path.resolve(__dirname, '../../../../app/dist/framing-preview.js')) as { framingFingerprint(tableIni: string, globalIni: string): string };
  const globalIni = '[Player]\nBGSet = 2\nCabinetAutofitMode = 1\nCabinetAutofitKeepTop = 1\nCabinetAutofitMaxStretch = 0.15\nScreenWidth = 94.1\n';
  const same = (a: string, b: string) => assert.equal(mod.framingFingerprint(a, globalIni), mod.framingFingerprint(b, globalIni));
  // Le mode de la borne écrit dans la table, ou laissé à VPinballX.ini : même rendu.
  same('', '[Player]\nCabinetAutofitMode = 1\n');
  same('', '[Player]\nCabinetAutofitMode =\n');
  // Ordre, casse, espaces, sections sans effet sur le rendu (ScoreView, plugins).
  same('[Player]\nscreenplayerz = 150\nCabinetAutofitMaxStretch = 0.5\n', '[ScoreView]\nScoreViewWndX = 68\n\n[Player]\nCabinetAutofitMaxStretch=0.5\nScreenPlayerZ = 150\n');
  // Ce qui change l'image change la clé : mode, étirement, œil, vue réglée de la table.
  const differs = (a: string, b: string) => assert.notEqual(mod.framingFingerprint(a, globalIni), mod.framingFingerprint(b, globalIni));
  differs('', '[Player]\nCabinetAutofitMode = 2\n');
  differs('', '[Player]\nCabinetAutofitMaxStretch = 0.5\n');
  differs('[Player]\nScreenPlayerZ = 100\n', '[Player]\nScreenPlayerZ = 70\n');
  differs('', '[TableOverride]\nViewCabMode = 2\nViewCabScaleX = 1.27\n');
  // Le cadrage de la borne (VPinballX.ini) compte aussi.
  assert.notEqual(mod.framingFingerprint('', globalIni), mod.framingFingerprint('', globalIni.replace('= 0.15', '= 0.5')));
});

test('aperçus : une image QOI de VPX lue en RGBA opaque', () => {
  // 2 × 1 : un pixel rouge (QOI_OP_RGB), puis le même (QOI_OP_RUN), marqueur de fin.
  const header = Buffer.alloc(14);
  header.write('qoif', 0, 'latin1');
  header.writeUInt32BE(2, 4);
  header.writeUInt32BE(1, 8);
  header[12] = 4;
  const img = decodeQoi(Buffer.concat([header, Buffer.from([0xfe, 255, 0, 0, 0xc0]), Buffer.from([0, 0, 0, 0, 0, 0, 0, 1])]));
  assert.deepEqual([img.width, img.height], [2, 1]);
  assert.deepEqual([...img.data], [255, 0, 0, 255, 255, 0, 0, 255]);
});
