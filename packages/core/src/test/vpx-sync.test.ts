import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { toPhysicalScreen } from '../fingerprint';
import { IniDocument } from '../ini';
import { rotatedDisplay } from '../layout';
import { writeWithBackup } from '../store';
import { keepManualEdits, planVpxSync } from '../sync';
import { vpxDisplayId, vpxSettingsFor } from '../vpx';
import { devPcDisplays, emptyCabinet } from './fixtures';

function cabinetForDevPc() {
  const displays = devPcDisplays();
  const cabinet = emptyCabinet();
  cabinet.screens = displays.map(toPhysicalScreen);
  // Playfield sur l'iiyama, backglass sur le Samsung, DMD sur le Philips.
  cabinet.roles = {
    playfield: cabinet.screens[3]!.fingerprint,
    backglass: cabinet.screens[0]!.fingerprint,
    dmd: cabinet.screens[2]!.fingerprint,
  };
  return cabinet;
}

test("identifiant d'écran au format de VPX, avec repli sur la description", () => {
  const [sam, auo] = devPcDisplays();
  assert.equal(vpxDisplayId(sam!), 'S22E450 [-1920, 0]');
  assert.equal(vpxDisplayId(auo!), 'Generic PnP Monitor [0, 0]');
});

test('les rôles non affectés sont désactivés sans toucher à leurs autres clés', () => {
  const settings = vpxSettingsFor({ playfield: devPcDisplays()[3] });
  assert.deepEqual(
    settings.filter((s) => s.section !== 'Player'),
    [
      { section: 'Backglass', key: 'BackglassOutput', value: '0' },
      { section: 'ScoreView', key: 'ScoreViewOutput', value: '0' },
      { section: 'Topper', key: 'TopperOutput', value: '0' },
    ],
  );
});

test('première génération : écrit les quatre fenêtres', () => {
  const plan = planVpxSync(cabinetForDevPc(), devPcDisplays(), '');
  const ini = IniDocument.parse(plan.nextIni!);
  assert.equal(ini.get('Player', 'PlayfieldDisplay'), 'PLX2283HSU [1920, 0]');
  assert.equal(ini.get('Player', 'PlayfieldFullScreen'), '1');
  assert.equal(ini.get('Backglass', 'BackglassDisplay'), 'S22E450 [-1920, 0]');
  assert.equal(ini.get('Backglass', 'BackglassOutput'), '1');
  assert.equal(ini.get('ScoreView', 'ScoreViewDisplay'), 'Philips 192E [288, -768]');
  assert.equal(ini.get('Topper', 'TopperOutput'), '0');
  assert.deepEqual(plan.findings.filter((f) => f.severity !== 'info'), []);
});

test('rien à écrire quand les écrans n’ont pas bougé', () => {
  const cabinet = cabinetForDevPc();
  const first = planVpxSync(cabinet, devPcDisplays(), '[Player]\nBallTrail = 1\n');
  const second = planVpxSync(cabinet, devPcDisplays(), first.nextIni!);
  assert.deepEqual(second.changes, []);
  assert.equal(second.nextIni, undefined);
});

test('écrans permutés par Windows : seules les clés Display sont réécrites', () => {
  const cabinet = cabinetForDevPc();
  const first = planVpxSync(cabinet, devPcDisplays(), '[Player]\nBallTrail = 1\n');

  const swapped = devPcDisplays();
  swapped[0]!.bounds = { ...swapped[0]!.bounds, x: 1920 };
  swapped[3]!.bounds = { ...swapped[3]!.bounds, x: -1920 };
  const plan = planVpxSync(cabinet, swapped, first.nextIni!);

  assert.deepEqual(
    plan.changes.map((c) => `${c.key}=${c.value}`),
    ['PlayfieldDisplay=PLX2283HSU [-1920, 0]', 'BackglassDisplay=S22E450 [1920, 0]'],
  );
  assert.equal(IniDocument.parse(plan.nextIni!).get('Player', 'BallTrail'), '1');
});

test("n'écrit rien et bloque si l'écran du playfield est introuvable", () => {
  const cabinet = cabinetForDevPc();
  const plan = planVpxSync(cabinet, devPcDisplays().slice(0, 3), '');
  assert.equal(plan.nextIni, undefined);
  assert.equal(plan.findings[0]?.severity, 'blocking');
});

test('signale une mise à l’échelle différente de 100 %', () => {
  const displays = devPcDisplays();
  displays[3]!.scale = 1.25;
  const plan = planVpxSync(cabinetForDevPc(), displays, '');
  assert.ok(plan.findings.some((f) => f.severity === 'warning' && f.message.includes('125 %')));
});

const VPX_5436 = { displayIdFormat: 'name' as const, enabledPlugins: ['PinMAME', 'B2S'] };

test('VPX 10.8.1-5436 : nom d’écran seul, et plugins activés', () => {
  const plan = planVpxSync(cabinetForDevPc(), devPcDisplays(), '[Plugin.PinMAME]\nEnable = \n', VPX_5436);
  const ini = IniDocument.parse(plan.nextIni!);
  assert.equal(ini.get('Player', 'PlayfieldDisplay'), 'PLX2283HSU');
  assert.equal(ini.get('ScoreView', 'ScoreViewDisplay'), 'Philips 192E');
  assert.equal(ini.get('Plugin.PinMAME', 'Enable'), '1');
  assert.equal(ini.get('Plugin.B2S', 'Enable'), '1');
});

test('format « nom seul » : avertit quand deux écrans portent le même nom', () => {
  const displays = devPcDisplays();
  displays[0]!.friendlyName = 'PLX2283HSU'; // deux iiyama identiques
  const plan = planVpxSync(cabinetForDevPc(), displays, '', VPX_5436);
  assert.ok(plan.findings.some((f) => f.severity === 'warning' && f.message.includes('2 écrans s\'appellent « PLX2283HSU »')));
});

test('sauvegarde l’ancien fichier et garde 10 versions', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-'));
  const file = path.join(dir, 'VPinballX.ini');
  const backups = path.join(dir, 'backups');
  for (let i = 0; i < 13; i++) {
    const report = writeWithBackup(file, `[Player]\nV = ${i}\n`, backups);
    assert.equal(report.backup === undefined, i === 0);
  }
  assert.equal(fs.readFileSync(file, 'utf8'), '[Player]\nV = 12\n');
  assert.equal(fs.readdirSync(backups).length, 10);
  fs.rmSync(dir, { recursive: true });
});

test('borne, joueur à droite d’un playfield paysage : vue borne, taille EDID, cadrage automatique', () => {
  const cabinet = { ...cabinetForDevPc(), playfield: { flipperEdge: 'right' as const } };
  const plan = planVpxSync(cabinet, devPcDisplays(), '[Player]\nCabinetAutofitMode = \n');
  const ini = IniDocument.parse(plan.nextIni!);
  assert.equal(ini.get('Player', 'BGSet'), '1');
  assert.equal(ini.get('Player', 'ScreenWidth'), '48');
  assert.equal(ini.get('Player', 'ScreenHeight'), '26');
  assert.equal(ini.get('Player', 'CabinetAutofitMode'), '1');
  assert.ok(!plan.findings.some((f) => f.message.includes("à l'envers")));
});

test('vue borne : le mode de cadrage choisi est gardé, le cadrage manuel est remplacé', () => {
  const cabinet = { ...cabinetForDevPc(), playfield: { flipperEdge: 'right' as const } };
  const fill = planVpxSync(cabinet, devPcDisplays(), '[Player]\nCabinetAutofitMode = 2\n');
  assert.equal(IniDocument.parse(fill.nextIni!).get('Player', 'CabinetAutofitMode'), '2');
  // En manuel, VPX garde la rotation de chaque table : le sens des tables n'est plus garanti.
  for (const manual of ['0', 'Manual']) {
    const plan = planVpxSync(cabinet, devPcDisplays(), `[Player]\nCabinetAutofitMode = ${manual}\n`);
    assert.equal(IniDocument.parse(plan.nextIni!).get('Player', 'CabinetAutofitMode'), '1');
    assert.ok(plan.findings.some((f) => f.severity === 'info' && f.message.includes(`CabinetAutofitMode = ${manual} → 1`)));
    assert.ok(!plan.findings.some((f) => f.severity === 'warning'));
  }
  // Clé gardée par l'utilisateur : laissée, mais signalée.
  const kept = planVpxSync({ ...cabinet, vpxManual: ['Player.CabinetAutofitMode'] }, devPcDisplays(), '[Player]\nCabinetAutofitMode = 0\n');
  assert.equal(IniDocument.parse(kept.nextIni!).get('Player', 'CabinetAutofitMode'), '0');
  assert.ok(kept.findings.some((f) => f.severity === 'warning' && f.message.includes('la rotation réglée par son auteur')));
});

test('joueur à gauche : VPX tournerait la table à l’envers, on le signale', () => {
  const cabinet = { ...cabinetForDevPc(), playfield: { flipperEdge: 'left' as const } };
  const plan = planVpxSync(cabinet, devPcDisplays(), '');
  const finding = plan.findings.find((f) => f.severity === 'warning' && f.message.includes("à l'envers"));
  assert.ok(finding);
  // Plus de manipulation dans Windows : c'est l'assistant qui retourne l'écran.
  assert.ok(finding.message.includes("relancez l'assistant d'écrans"));
  assert.ok(!finding.message.includes('paramètres'));
});

test('écran du playfield retourné hors de l’assistant : le bord du joueur suit', () => {
  // Joueur à droite, enregistré en paysage ; Windows a depuis retourné l'écran.
  const displays = devPcDisplays();
  displays[3] = rotatedDisplay(displays[3]!, 180);
  const right = { ...cabinetForDevPc(), playfield: { flipperEdge: 'right' as const } };
  assert.ok(planVpxSync(right, displays, '').findings.some((f) => f.message.includes("flippers à gauche de l'image")));
  // Joueur à gauche à l'enregistrement : le retournement l'a mis à droite, plus rien à signaler.
  const left = { ...cabinetForDevPc(), playfield: { flipperEdge: 'left' as const } };
  const plan = planVpxSync(left, displays, '');
  assert.ok(!plan.findings.some((f) => f.message.includes("à l'envers")));
  assert.equal(IniDocument.parse(plan.nextIni!).get('Player', 'BGSet'), '1');
});

test('PC de bureau : vue bureau, pas de cadrage automatique, taille saisie', () => {
  const cabinet = {
    ...cabinetForDevPc(),
    playfield: { flipperEdge: 'bottom' as const, manualSizeCm: { width: 95.19, height: 53.55 } },
  };
  const plan = planVpxSync(cabinet, devPcDisplays(), '');
  const ini = IniDocument.parse(plan.nextIni!);
  assert.equal(ini.get('Player', 'BGSet'), '0');
  assert.equal(ini.get('Player', 'ScreenWidth'), '95.2');
  assert.equal(ini.get('Player', 'ScreenHeight'), '53.6');
  assert.equal(ini.get('Player', 'CabinetAutofitMode'), undefined);
  assert.deepEqual(plan.findings.filter((f) => f.message.startsWith('Playfield')), []);
});

test('Windows en portrait, joueur en bas : vue borne sans avertissement', () => {
  const displays = devPcDisplays();
  displays[3]!.bounds = { ...displays[3]!.bounds, width: 1080, height: 1920 };
  const cabinet = { ...cabinetForDevPc(), playfield: { flipperEdge: 'bottom' as const } };
  const plan = planVpxSync(cabinet, displays, '');
  const ini = IniDocument.parse(plan.nextIni!);
  assert.equal(ini.get('Player', 'BGSet'), '1');
  assert.equal(ini.get('Player', 'ScreenWidth'), '48');
  assert.ok(!plan.findings.some((f) => f.message.includes("à l'envers")));
});

test('modèle enregistré avant l’orientation : aucune clé de cadrage écrite', () => {
  const plan = planVpxSync(cabinetForDevPc(), devPcDisplays(), '');
  assert.equal(IniDocument.parse(plan.nextIni!).get('Player', 'BGSet'), undefined);
  assert.ok(plan.findings.some((f) => f.severity === 'info' && f.message.includes('orientation')));
});

test('clé gérée changée à la main : laissée telle quelle, signalée, puis gardée ou remise', () => {
  const cabinet = { ...cabinetForDevPc(), playfield: { flipperEdge: 'right' as const } };
  const first = planVpxSync(cabinet, devPcDisplays(), '');
  assert.equal(first.memory['Player.BGSet'], '1');

  // Quelqu'un passe en vue bureau et change la largeur dans VPinballX.ini.
  const doc = IniDocument.parse(first.nextIni!);
  doc.set('Player', 'BGSet', '0');
  doc.set('Player', 'ScreenWidth', '95.9');
  doc.set('Player', 'ScreenHeight', '54');
  const edited = doc.toString();

  const plan = planVpxSync(cabinet, devPcDisplays(), edited, undefined, { memory: first.memory });
  assert.deepEqual(plan.manualEdits.map((e) => `${e.key}=${e.current}`), ['BGSet=0', 'ScreenWidth=95.9', 'ScreenHeight=54']);
  assert.equal(plan.nextIni, undefined, 'rien n’est écrasé en silence');
  assert.ok(plan.findings.some((f) => f.message.includes('[Player] BGSet = 0 au lieu de 1')));
  assert.equal(plan.memory['Player.BGSet'], '1', 'la mémoire garde la dernière valeur écrite');

  // Remettre les valeurs de Cyber Pinball.
  const rewrite = planVpxSync(cabinet, devPcDisplays(), edited, undefined, { memory: first.memory, overwriteManual: true });
  assert.equal(IniDocument.parse(rewrite.nextIni!).get('Player', 'BGSet'), '1');

  // Garder : la taille revient dans le modèle, BGSet est laissé à l'utilisateur.
  const kept = keepManualEdits(cabinet, plan.manualEdits, edited);
  assert.deepEqual(kept.playfield?.manualSizeCm, { width: 95.9, height: 54 });
  assert.deepEqual(kept.vpxManual, ['Player.BGSet']);
  const after = planVpxSync(kept, devPcDisplays(), edited, undefined, { memory: plan.memory });
  assert.deepEqual(after.manualEdits, []);
  assert.equal(after.nextIni, undefined);
  assert.equal(after.memory['Player.BGSet'], undefined);
});

test('les écrans qui bougent ne passent pas pour une modification à la main', () => {
  const cabinet = cabinetForDevPc();
  const first = planVpxSync(cabinet, devPcDisplays(), '');
  const moved = devPcDisplays();
  moved[3]!.bounds = { ...moved[3]!.bounds, x: 3840 };
  const plan = planVpxSync(cabinet, moved, first.nextIni!, undefined, { memory: first.memory });
  assert.deepEqual(plan.manualEdits, []);
  assert.ok(plan.changes.some((c) => c.key === 'PlayfieldDisplay'));
});

test('un nombre réenregistré par VPX avec d’autres décimales n’est pas une modification', () => {
  const cabinet = { ...cabinetForDevPc(), playfield: { flipperEdge: 'right' as const } };
  const first = planVpxSync(cabinet, devPcDisplays(), '');
  const doc = IniDocument.parse(first.nextIni!);
  doc.set('Player', 'ScreenWidth', '48.000000');
  const plan = planVpxSync(cabinet, devPcDisplays(), doc.toString(), undefined, { memory: first.memory });
  assert.deepEqual(plan.manualEdits, []);
});
