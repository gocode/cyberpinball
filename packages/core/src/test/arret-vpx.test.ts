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
import { chooseDmdDisplay, diagnoseVpxFailure, DOF_UNLOAD_FIXED_IN, GUEST_DOORS, inspectorDisplayReadable, liveFailedPlaying, livePlayerStateLabel, liveWaitView, vpxExitName, vpxScriptError, vpxShutdownCrash, type InspectorDisplay, type LiveGame } from '../index';
import { historyStateLabel } from '../gamehistory';
import { frontendSource } from './frontend-source';

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

// Fin de journal d'une borne à ZeDMD WiFi (rapport du 17/11/2026, Daredevil) : la partie s'est fermée
// (« Closing player… »), DMDUtil a recréé son DMD et relancé la connexion au ZeDMD, puis a été déchargé.
const FERMETURE = [
  '2026-11-17 12:29:59.259 INFO  [Main] [Player::~Player@865] Closing player...',
  '2026-11-17 12:29:59.259 INFO  [Main] [DMDUtil:DMDUtilPlugin::onDmdSrcChanged@209] DMD Source Changed: format=2, width=128, height=32',
  '2026-11-17 12:29:59.276 INFO  [Main] [DMDUtil:DMDUtilPlugin::OnDMDUtilLog@91] DMD destructor start',
  '2026-11-17 12:29:59.279 INFO  [Main] [DMDUtil:DMDUtilPlugin::OnDMDUtilLog@91] DMD destructor finished',
  '2026-11-17 12:29:59.279 INFO  [Main] [PUP:PUP::PUPManager::Stop@115] PUP Manager stop',
  '2026-11-17 12:30:00.256 INFO  [Main] [DMDUtil:DMDUtilPlugin::onDmdSrcChanged@209] DMD Source Changed: format=2, width=128, height=32',
  '2026-11-17 12:30:00.270 INFO  [6600] [DMDUtil:DMDUtilPlugin::OnDMDUtilLog@91] Attempting to connect to IP address: ‹adresse IP›',
  '2026-11-17 12:30:00.283 INFO  [Main] [MsgPI::MsgPlugin::Unload@550] Plugin vpx unloaded [id=1]',
  ...Array.from({ length: 30 }, (_, i) => `2026-11-17 12:30:00.29${i % 10} INFO  [Main] [DMDUtil:DMDUtilPlugin::OnDMDUtilLog@91] ligne ${i}`),
  '2026-11-17 12:30:00.295 INFO  [Main] [DMDUtil:DMDUtilPlugin::OnDMDUtilLog@91] DMD destructor finished',
  '2026-11-17 12:30:00.295 INFO  [Main] [MsgPI::MsgPlugin::Unload@550] Plugin DMDUtil unloaded [id=7]',
  "2026-11-17 12:30:04.450 INFO  [Main] [FileLocator::GetTablePath@306] Cache folder was created for table 'DAREDEVIL2.0.2.vpx'",
];

test('plantage à la fermeture : la partie s’est jouée, dit tel ; la recherche du DMD réel relancée par DMDUtil est nommée', () => {
  const d = diagnoseVpxFailure(FERMETURE, 3221225477, 'DAREDEVIL2.0.2.vbs')!;
  assert.equal(d.title, 'VPX a planté en se fermant');
  assert.match(d.lines[0]!, /^La partie s’est jouée jusqu’au bout : VPX s’est arrêté \(0xC0000005, accès mémoire interdit\) après sa fin/);
  assert.match(d.lines[1]!, /DMDUtil de VPX a relancé la recherche du DMD réel/);
  assert.match(d.journal, /^VPX arrêté en se fermant, après la partie \(DAREDEVIL2\.0\.2\.vbs\) : 0xC0000005.* DMDUtil relançait/);
  assert.deepEqual(vpxShutdownCrash(FERMETURE, 3221225477), { dmdProbe: true, dofUnload: false });
  // Fermeture normale (World Cup Soccer, même borne) : DMD détruit, aucune recherche après ; un plantage y serait autre chose.
  const propre = FERMETURE.filter((l) => !/Attempting to connect/.test(l));
  assert.deepEqual(vpxShutdownCrash(propre, 3221225477), { dmdProbe: false, dofUnload: false });
  assert.match(diagnoseVpxFailure(propre, 3221225477, 'x.vpx')!.lines[1]!, /^Rien n’est à réparer dans la table/);
  // Sans « Closing player » : arrêté pendant la partie, comme avant ; code ordinaire : rien.
  assert.equal(vpxShutdownCrash(FERMETURE.slice(1), 3221225477), undefined);
  assert.equal(diagnoseVpxFailure(FERMETURE.slice(1), 3221225477, 'x.vpx')!.title, 'VPX s’est arrêté pendant la partie');
  assert.equal(vpxShutdownCrash(FERMETURE, 1), undefined);
  // Une erreur du script plus haut que les 15 dernières lignes ne fait plus le diagnostic.
  const ancienne = ['Runtime error on line 3, col 1: Type incompatible', ...FERMETURE];
  assert.equal(diagnoseVpxFailure(ancienne, 3221225477, 'x.vpx')!.scriptError, undefined);
});

// Fins de journal inventées d'une borne à DudesCab, sur le modèle des rapports du 19/11 et du 23/11/2026 (Apollo 13,
// Cobra) : la partie se ferme, le fil de DOF arrête la carte, les plugins se déchargent. Fermeture réussie : la libdof
// de la 5436 arrête la carte une seconde fois sur le fil principal, puis « Plugin DOF unloaded ». Plantage : rien après.
const dofLine = (thread: string, text: string) => `2026-11-20 21:14:02.130 INFO  [${thread}] [DOF:DOFPlugin::OnDOFLog@70] ${text}`;
const unload = (plugin: string, id: number) => `2026-11-20 21:14:02.400 INFO  [Main] [MsgPI::MsgPlugin::Unload@550] Plugin ${plugin} unloaded [id=${id}]`;
const DOF_FERMETURE = [
  '2026-11-20 21:14:02.118 INFO  [Main] [Player::~Player@865] Closing player...',
  dofLine('DOF.EventQueue', 'DudesCab DudesCab Controller 01 finished and updater thread stopped.'),
  dofLine('DOF.EventQueue', 'Cabinet finished'),
  unload('PUP', 13),
  unload('CyberPinballDmd', 15),
];
const DOF_REUSSIE = [...DOF_FERMETURE, dofLine('Main', 'DudesCab DudesCab Controller 01 finished and updater thread stopped.'), unload('DOF', 9), unload('PinMAME', 4)];
const DOF_PLANTEE = DOF_FERMETURE;

test('plantage à la fermeture pendant le déchargement de DOF avec une DudesCab : reconnu, nommé, corrigé par la série 6', () => {
  // Fermeture réussie : rien à dire (VPX sort avec le code 0, aucun diagnostic).
  assert.equal(diagnoseVpxFailure(DOF_REUSSIE, 0, 'Apollo 13.vpx'), undefined);
  // Le même journal avec un code de plantage : DOF a fini de se décharger, ce n'est pas ce défaut-là.
  assert.deepEqual(vpxShutdownCrash(DOF_REUSSIE, 3221225477), { dmdProbe: false, dofUnload: false });

  // Plantage : plugins déchargés, pas de « Plugin DOF unloaded », DudesCab au journal.
  assert.deepEqual(vpxShutdownCrash(DOF_PLANTEE, 3221225477), { dmdProbe: false, dofUnload: true });
  const d = diagnoseVpxFailure(DOF_PLANTEE, 3221225477, 'Cobra.vpx')!;
  assert.equal(d.title, 'VPX a planté en se fermant');
  assert.match(d.lines[0]!, /^La partie s’est jouée jusqu’au bout : VPX s’est arrêté \(0xC0000005, accès mémoire interdit\)/);
  assert.match(d.lines[1]!, /bibliothèque DOF, qui pilote ta carte DudesCab\. Rien n’est à réparer dans la table : c’est un défaut connu de la bibliothèque DOF de VPX 10\.8\.1/);
  assert.match(d.lines[2]!, /corrigé dans le VPX de Cyber Pinball à partir de la série 6 \(« patched Cyber Pinball 6 »\)/);
  assert.equal(d.lines.length, 3);
  assert.equal(d.journal, 'VPX arrêté en se fermant, après la partie (Cobra.vpx) : 0xC0000005, accès mémoire interdit ; plantage en déchargeant DOF avec une DudesCab (défaut de la libdof de VPX 10.8.1, corrigé par la série 6 du VPX corrigé ; en place : aucune série).');
  assert.equal(DOF_UNLOAD_FIXED_IN, 6);

  // VPX corrigé d'une série plus ancienne en place : la correction reste à venir, la série en place est au journal.
  const ancienne = diagnoseVpxFailure(DOF_PLANTEE, 3221225477, 'Cobra.vpx', undefined, { vpxPatch: 5 })!;
  assert.match(ancienne.lines[2]!, /à partir de la série 6/);
  assert.match(ancienne.journal, /en place : série 5\)\.$/);
  // La série corrigée était en place et VPX plante quand même : ne pas promettre ce qui est déjà là.
  const corrigee = diagnoseVpxFailure(DOF_PLANTEE, 3221225477, 'Cobra.vpx', undefined, { vpxPatch: 6 })!;
  assert.match(corrigee.lines[2]!, /depuis la série 6, et il était en place \(série 6\) : ce plantage a donc une autre cause/);
  assert.match(corrigee.journal, /en place : série 6\)\.$/);

  // DOF écrit beaucoup en fermant : « Closing player » est sorti des 120 dernières lignes, le cas reste reconnu.
  const longue = [...Array.from({ length: 130 }, (_, i) => dofLine('DOF.EventQueue', `Toy ${i} finished`)), ...DOF_PLANTEE.slice(1)];
  assert.equal(longue.some((l) => /Closing player/.test(l)), false);
  assert.equal(vpxShutdownCrash(longue, 3221225477)?.dofUnload, true);
  assert.equal(diagnoseVpxFailure(longue, 3221225477, 'x.vpx')!.title, 'VPX a planté en se fermant');

  // Sans DudesCab (Pinscape), ou plantage pendant la partie (aucun plugin déchargé) : pas ce défaut.
  const pinscape = DOF_PLANTEE.map((l) => l.replace(/DudesCab DudesCab Controller 01/, 'Pinscape Pinscape Controller 01'));
  assert.deepEqual(vpxShutdownCrash(pinscape, 3221225477), { dmdProbe: false, dofUnload: false });
  assert.match(diagnoseVpxFailure(pinscape, 3221225477, 'x.vpx')!.lines[1]!, /^Rien n’est à réparer dans la table/);
  const enPartie = DOF_PLANTEE.filter((l) => !/unloaded|Closing player/.test(l));
  assert.equal(vpxShutdownCrash(enPartie, 3221225477), undefined);
  assert.equal(diagnoseVpxFailure(enPartie, 3221225477, 'x.vpx')!.title, 'VPX s’est arrêté pendant la partie');
  // Code ordinaire : rien.
  assert.equal(vpxShutdownCrash(DOF_PLANTEE, 1), undefined);

  // Le plantage DMDUtil du 17/11/2026 garde son explication.
  assert.match(diagnoseVpxFailure(FERMETURE, 3221225477, 'x.vpx')!.lines[1]!, /DMDUtil de VPX a relancé la recherche du DMD réel/);
});

test('application : la série du VPX corrigé en place accompagne le diagnostic d’une partie échouée', () => {
  const front = frontendSource();
  assert.match(front, /const vpxPatch = simulated === undefined && !otherVpx \? vpxCorrigeInPlace\(path\.dirname\(install\.exe\), install\.version/);
  assert.match(front, /explain\(result, table, repaired, Boolean\(double\), changedFiles, vpxPatch\)/);
  assert.match(front, /\.\.\.\(vpxPatch !== undefined && \{ vpxPatch \}\)/);
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
  const front = frontendSource();
  assert.match(front, /const known = repaired \? undefined : diagnoseVpxFailure\(result\.logTail, result\.exitCode,/);
  // Arrêté en démarrant, fichiers de VPX modifiés : Start les remet (vpx-fichiers-modifies.test.ts) ; sinon rejouer.
  assert.match(front, /const action: Message\['action'\] = known\.startup && changedFiles\.length \? 'install-vpx' : live \? 'live' : 'replay';/);
  assert.match(front, /return \{ title: known\.title, lines, action, table: table\.file, report: failureReport\(result, table, known\.title, known\.startup\) \};/);
  assert.match(front, /explain\(result, table, repaired, Boolean\(double\), changedFiles, vpxPatch\)/);
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
