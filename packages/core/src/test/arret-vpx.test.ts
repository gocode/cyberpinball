// Arrêt de VPX en pleine partie (essai réel du 04/11/2026, PinCab, 0.1.6-essai.8, partie entre amis
// sur The Goonies) : « VPX s'est terminé avec le code 3221226356 » après « Actor Ball not found in
// children of » et « Runtime error on line 9781, col 2: Objet requis: 'FlexDMD.Stage.GetLabel(...)' ».
// Cause : Cyber Pinball lisait le DMD de FlexDMD par l'inspector de VPX, dont le fil fait dessiner la
// scène de FlexDMD pendant que le script de la table la modifie (corruption du tas, 0xC0000374).
// Invariants : l'inspector ne lit que le DMD de PinMAME ; un arrêt de VPX se lit dans son journal et se
// nomme ; l'écran d'échec dit la vraie raison et ne renvoie pas à « ce qu'il manque pour jouer ».

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';
import { chooseDmdDisplay, diagnoseVpxFailure, GUEST_DOORS, inspectorDisplayReadable, liveFailedPlaying, livePlayerStateLabel, liveWaitView, vpxExitName, vpxScriptError, type InspectorDisplay, type LiveGame } from '../index';
import { historyStateLabel } from '../gamehistory';

// La fin du journal de VPX, telle que l'écran du PinCab l'a montrée.
const TAIL = [
  "2026-11-04 13:17:50.831 ERROR [Main] [PUP:PUP::PUPMediaManager::Play@61] PlayFile not found: screen={screenNum=4, screenDes=Music, mode=MusicOnly}, playlist={folder=Music, description=, randomize=false, restSeconds=0, volume=90.000000, priority=0, function=Default}, playFile=end.ogg",
  '2026-11-04 13:17:52.728 WARN [Main] [PUP:PUP::PUPMediaManager::Play@48] Skipping same priority, screen={screenNum=2, screenDes=Backglass, mode=ForceBack}, playlist={folder=Fight, description=, randomize=true, restSeconds=0, volume=100.000000, priority=0, function=Default}, playFile={}, priority=8',
  '2026-11-04 13:18:04.950 WARN [Main] [FlexDMD:Flex::Group::Get@127] Actor Ball not found in children of ',
  "2026-11-04 13:18:04.962 ERROR [Main] [Player::OnScriptError@1235] Runtime error on line 9781, col 2: Objet requis: 'FlexDMD.Stage.GetLabel(...)'",
];

// Le script de la table autour de la ligne 9781 (The Goonies 1.5, Sub FlexDMDshowGroups).
const SCRIPT = [...Array.from({ length: 9780 }, (_, i) => `' ligne ${i + 1}`), '\tFlexDMD.Stage.GetLabel("Ball").Visible=True', "' suite"].join('\r\n');

test('règle : l’erreur du script se lit dans le journal de VPX, avec l’élément FlexDMD absent et la ligne en faute', () => {
  const e = vpxScriptError(TAIL, SCRIPT)!;
  assert.deepEqual(e, { kind: 'runtime', line: 9781, column: 2, message: "Objet requis: 'FlexDMD.Stage.GetLabel(...)'", flexActor: 'Ball', code: 'FlexDMD.Stage.GetLabel("Ball").Visible=True' });
  // Sans script lisible : la ligne n'est pas citée, le reste est là.
  assert.equal(vpxScriptError(TAIL)!.code, undefined);
  // Erreur de compilation, sans colonne ; la dernière erreur du journal l'emporte.
  const compile = vpxScriptError(['Runtime error on line 3, col 1: Type incompatible', 'Compile error on line 12: Instruction attendue']);
  assert.deepEqual(compile, { kind: 'compile', line: 12, message: 'Instruction attendue' });
  assert.equal(vpxScriptError(TAIL.slice(0, 2)), undefined);
});

test('règle : les codes de sortie de Windows se nomment, signés ou non', () => {
  assert.equal(vpxExitName(3221226356), '0xC0000374, mémoire de VPX abîmée (corruption du tas)');
  assert.equal(vpxExitName(-1073740940), '0xC0000374, mémoire de VPX abîmée (corruption du tas)');
  assert.match(vpxExitName(3221225477)!, /^0xC0000005, /);
  for (const code of [0, 1, -1, null, undefined]) assert.equal(vpxExitName(code), undefined);
});

test('diagnostic : la vraie raison, une ligne de journal, rien de « manquant » ; undefined quand rien n’est reconnu', () => {
  const d = diagnoseVpxFailure(TAIL, 3221226356, 'The Goonies Never Say Die Pinball (VPW 2021) 1.5.vbs', SCRIPT)!;
  assert.equal(d.title, 'Le script de la table s’est arrêté');
  assert.equal(d.lines[0], "Le script de la table s’est arrêté ligne 9781 de The Goonies Never Say Die Pinball (VPW 2021) 1.5.vbs : Objet requis: 'FlexDMD.Stage.GetLabel(...)'");
  assert.ok(d.lines.some((l) => /élément « Ball » de son DMD \(FlexDMD\)/.test(l)));
  assert.ok(d.lines.some((l) => /0xC0000374/.test(l)));
  assert.ok(d.lines.some((l) => /^Rien ne manque pour jouer/.test(l)));
  assert.match(d.journal, /^VPX arrêté \(The Goonies .*\) : erreur du script ligne 9781, col 2 : Objet requis.* \(élément FlexDMD « Ball » introuvable\) ; ligne : FlexDMD\.Stage\.GetLabel\("Ball"\)\.Visible=True ; VPX fermé \(0xC0000374, /);
  // Un code de sortie connu seul : VPX s'est arrêté, sans erreur du script.
  const exit = diagnoseVpxFailure([], 3221225477, 'x.vpx')!;
  assert.equal(exit.title, 'VPX s’est arrêté pendant la partie');
  assert.equal(exit.scriptError, undefined);
  // Rien de reconnu (un code ordinaire, une ROM absente…) : l'écran garde son explication et « ce qu'il manque ».
  assert.equal(diagnoseVpxFailure(['ERROR … can’t start game'], 1, 'x.vpx'), undefined);
});

const tree = (controller: string, name = 'Display 0 128x32') => ({ name: controller, type: 'controller', children: [{ type: 'category', name: 'Displays', children: [{ type: 'display', name, mapping: 7 }] }] });

test('cause : l’inspector ne lit que le DMD de PinMAME, jamais celui de FlexDMD (dessiné à la demande, hors du fil du script)', () => {
  assert.ok(inspectorDisplayReadable('PinMAME'));
  for (const c of ['FlexDMD', 'UltraDMD', 'B2S', '', 'Unknown Controller']) assert.ok(!inspectorDisplayReadable(c), c);
  const refused: InspectorDisplay[] = [];
  assert.equal(chooseDmdDisplay([tree('FlexDMD')], refused), undefined);
  assert.deepEqual(refused.map((d) => d.controller), ['FlexDMD']);
  assert.equal(chooseDmdDisplay([tree('PinMAME')])?.controller, 'PinMAME');
  // Une table à ROM qui dessinerait aussi par FlexDMD : seul le DMD de PinMAME est lu, même plus petit.
  assert.equal(chooseDmdDisplay([tree('FlexDMD', 'Display 0 256x64'), tree('PinMAME')])?.controller, 'PinMAME');
});

test('application : l’inspector n’est pas posé pour le DMD d’une table sans PinMAME ; la montre du DMD refuse et le dit', () => {
  const double = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'table-double.ts'), 'utf8');
  assert.match(double, /const pinmame = roms\.length > 0 \|\| \(script \? usesPinmameCode\(script\) : false\);/);
  assert.match(double, /dmd: Boolean\(inspector\.dmd && pinmame\)/);
  const watch = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'dmd-watch.ts'), 'utf8');
  assert.match(watch, /chooseDmdDisplay\(\(\(await res\.json\(\)\) as \{ tree\?: unknown \}\)\.tree, refused\)/);
  assert.match(watch, /pas lu par l'inspector de VPX/);
});

test('écran d’échec : arrêt reconnu = vraie raison, Start rejoue (ou ouvre la partie entre amis), jamais « ce qu’il manque »', () => {
  const front = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'frontend.ts'), 'utf8');
  assert.match(front, /const known = repaired \? undefined : diagnoseVpxFailure\(result\.logTail, result\.exitCode,/);
  assert.match(front, /return \{ title: known\.title, lines, action: live \? 'live' : 'replay', table: table\.file \};/);
  assert.match(front, /explain\(result, table, repaired, Boolean\(double\)\)/);
  assert.match(front, /state\.message\?\.action === 'replay' && is\(KEYS\.confirm\)/);
  assert.match(front, /state\.message\?\.action === 'live' && is\(KEYS\.confirm\)/);
  const renderer = fs.readFileSync(path.join(REPO_ROOT, 'app', 'renderer', 'frontend.js'), 'utf8');
  assert.match(renderer, /s\.message\.action === 'replay'\) cover\.append\(footer\(\[\[t\('Start : rejouer la table'\)/);
  assert.match(renderer, /s\.message\.action === 'live'\) cover\.append\(footer\(\[\[t\('Start : voir la partie entre amis'\)/);
  // Mode invité : rejouer est ouvert (comme « Jouer »), la partie entre amis non (comme « Jouer avec un ami »).
  assert.equal(GUEST_DOORS['message.replay'], true);
  assert.equal(GUEST_DOORS['message.live'], false);
});

test('partie entre amis : VPX arrêté en cours de partie se dit tel, distinct d’une partie jamais démarrée ; les autres ne l’attendent pas', () => {
  assert.ok(liveFailedPlaying({ state: 'failed', score: 120_000 }));
  assert.ok(liveFailedPlaying({ state: 'failed', seconds: 40 }));
  assert.ok(!liveFailedPlaying({ state: 'failed', seconds: 0 }));
  assert.ok(!liveFailedPlaying({ state: 'done', score: 1 }));
  assert.equal(livePlayerStateLabel({ state: 'failed', score: 120_000 }), 'VPX s’est arrêté pendant sa partie : score compté jusqu’à l’arrêt');
  assert.equal(livePlayerStateLabel({ state: 'failed' }), 'La partie n’a pas démarré de son côté');
  assert.equal(historyStateLabel({ state: 'failed', seconds: 95 }), 'VPX s’est arrêté pendant sa partie : score compté jusqu’à l’arrêt');
  assert.equal(historyStateLabel({ state: 'failed' }), 'La partie n’a pas démarré de son côté');
  // Pendant l'attente du départ : celui dont VPX s'est arrêté est « sorti », les autres partent sans lui.
  const game: LiveGame = {
    id: '0123456789abcdef',
    host: 'h',
    table: { table: { title: 'The Goonies' } },
    title: 'The Goonies',
    players: [
      { key: 'h', name: 'Alexis', state: 'loading', host: true },
      { key: 'b', name: 'Bruno', state: 'failed', seconds: 12 },
    ],
    phase: 'playing',
    createdAt: '2026-11-04T12:15:00.000Z',
    startAt: '2026-11-04T12:15:10.000Z',
  };
  const view = liveWaitView(game, 'h', new Date('2026-11-04T12:15:20.000Z'));
  const row = view!.rows.find((r) => r.name === 'Bruno')!;
  assert.deepEqual([row.status, row.out], ['VPX arrêté pendant sa partie', true]);
});
