// VPX arrêté au démarrage du PuP-Pack (rapports du 27/11/2026, The Avengers Pro (Stern 2012), PuP-Pack
// avs_170, chez un joueur et sur le PinCab) : 0xC0000409 0,7 s après « PUP Manager start », sans
// crash.txt ; Windows notait plugin-pup64.dll, décalage 0x7c4f5 (abort() du runtime C++). L'écran
// disait « dépassement de pile » et le rapport ne nommait pas le module.
// Invariants : un arrêt qui suit de près le démarrage du PuP-Pack (ou que Windows situe dans le plugin
// PUP) se nomme comme tel et propose de jouer sans le PuP-Pack, rangé à part, jamais effacé ; un autre
// plugin nommé par Windows n'accuse pas le PuP-Pack ; le module fautif noté par Windows part au
// rapport quand VPX n'a pas écrit de crash.txt.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';
import { describeWindowsFault, diagnoseVpxFailure, faultQueryScript, GUEST_DOORS, isPupPluginModule, parseWindowsFault, vpxExitName, vpxPupStartCrash, type WindowsFault } from '../index';
import { frontendSource } from './frontend-source';

const STACK_BUFFER = 0xc0000409;

// La fin du journal du PinCab (vpinball.log, 27/11/2026 23:06), abrégée.
const TAIL = [
  '2026-11-27 23:06:08.356 INFO  [Main] [MsgPI::MsgPlugin::Load@520] Plugin PUP loaded (library: C:\\CyberPinball\\emulators\\vpx\\current\\plugins\\pup\\plugin-pup64.dll) [id=15]',
  '2026-11-27 23:06:09.535 INFO  [Main] [PUP:PUP::PUPManager::Start@180] PUP Manager start',
  '2026-11-27 23:06:09.940 ERROR [Main] [PUP:PUP::PUPPlaylist::GetPlayFilePath@95] PlayFile not found: BG_Callouts Agents_Lit.mp4',
  '2026-11-27 23:06:10.255 INFO  [DOF.EventQueue] [DOF:DOFPlugin::OnDOFLog@82] Cabinet loaded',
];

// L'événement 1000 tel que la commande de faultQueryScript l'écrit (champs séparés par une tabulation).
const EVENT = [
  'VPinballX_BGFX64.exe', '10.8.1.0', '67e1a2b3', 'plugin-pup64.dll', '0.0.0.0', '6b09ec6a', 'c0000409', '000000000007c4f5',
  '0x1f30', '0x01db4f6e2a5b8c00', 'C:\\CyberPinball\\emulators\\vpx\\10.8.1-5436\\VPinballX_BGFX64.exe',
  '\\\\?\\C:\\CyberPinball\\emulators\\vpx\\10.8.1-5436\\plugins\\pup\\plugin-pup64.dll', 'a1b2c3d4-0000-0000-0000-000000000000',
].join('\t');

const PUP_FAULT: WindowsFault = { app: 'VPinballX_BGFX64.exe', module: 'plugin-pup64.dll', moduleVersion: '0.0.0.0', moduleStamp: '0x6b09ec6a', code: '0xc0000409', offset: '0x000000000007c4f5', modulePath: 'C:\\CyberPinball\\emulators\\vpx\\10.8.1-5436\\plugins\\pup\\plugin-pup64.dll' };

test('règle : l’événement « Application Error » de Windows donne le module fautif, ses valeurs hexadécimales en 0x…', () => {
  const other = ['explorer.exe', '10.0', '1', 'ntdll.dll', '10.0', '2', 'c0000005', '0000000000001234'].join('\t');
  // Get-WinEvent rend le plus récent d'abord ; un autre programme est ignoré, la casse aussi.
  assert.deepEqual(parseWindowsFault(`${other}\r\n${EVENT}\r\n`, 'C:\\CyberPinball\\emulators\\vpx\\10.8.1-5436\\vpinballx_bgfx64.exe'), PUP_FAULT);
  assert.equal(parseWindowsFault(other, 'VPinballX_BGFX64.exe'), undefined);
  assert.equal(parseWindowsFault('', 'VPinballX_BGFX64.exe'), undefined);
  assert.equal(describeWindowsFault(PUP_FAULT), 'plugin-pup64.dll (0.0.0.0, 0x6b09ec6a), 0xc0000409 au décalage 0x7c4f5');
  assert.equal(describeWindowsFault({ app: 'x.exe', module: 'ucrtbase.dll' }), 'ucrtbase.dll');
  assert.ok(isPupPluginModule('plugin-pup64.dll') && isPupPluginModule('C:\\vpx\\plugins\\pup\\Plugin-PUP.dll'));
  assert.ok(!isPupPluginModule('plugin-dof64.dll') && !isPupPluginModule(undefined));
  // La requête ne dépend pas de la langue de Windows : le journal, la source et l'identifiant de l'événement.
  const script = faultQueryScript(Date.UTC(2026, 10, 27, 22, 6, 10));
  assert.match(script, /ProviderName='Application Error';Id=1000;StartTime=\$s/);
  assert.match(script, /-join "`t"/);
  assert.match(script, /2026-11-27T22:06:08\.000Z/);
});

test('règle : 0xC0000409 n’est pas nommé « dépassement de pile » : c’est l’arrêt d’urgence de VPX ou d’un plugin', () => {
  assert.match(vpxExitName(STACK_BUFFER)!, /arrêt d’urgence demandé par VPX ou l’un de ses plugins/);
  assert.doesNotMatch(vpxExitName(STACK_BUFFER)!, /pile/);
});

test('règle : un arrêt au plus 15 s après « PUP Manager start » est un arrêt au démarrage du PuP-Pack', () => {
  assert.deepEqual(vpxPupStartCrash(TAIL, STACK_BUFFER), { afterSeconds: 0.7 });
  // Code signé, comme Node le rend parfois.
  assert.deepEqual(vpxPupStartCrash(TAIL, STACK_BUFFER | 0), { afterSeconds: 0.7 });
  // La partie a duré : ce n'est plus le démarrage du PuP-Pack (sauf si Windows situe l'arrêt dans le plugin PUP).
  const later = [...TAIL, '2026-11-27 23:08:40.000 INFO  [Main] [Player] tilt'];
  assert.equal(vpxPupStartCrash(later, STACK_BUFFER), undefined);
  assert.deepEqual(vpxPupStartCrash(later, STACK_BUFFER, PUP_FAULT), {});
  // Passage de minuit.
  assert.deepEqual(vpxPupStartCrash(['2026-11-27 23:59:59.500 INFO PUP Manager start', '2026-11-28 00:00:01.000 INFO x'], STACK_BUFFER), { afterSeconds: 1.5 });
  // Ni partie fermée normalement, ni code inconnu, ni bibliothèque manquante, ni journal sans PuP-Pack.
  assert.equal(vpxPupStartCrash([...TAIL, '2026-11-27 23:06:10.300 INFO [Main] Closing player'], STACK_BUFFER), undefined);
  assert.equal(vpxPupStartCrash(TAIL, 0), undefined);
  assert.equal(vpxPupStartCrash(TAIL, 0xc0000135), undefined);
  assert.equal(vpxPupStartCrash(TAIL.filter((l) => !/PUP Manager start/.test(l)), STACK_BUFFER), undefined);
  // Windows nomme un autre plugin (DOF charge dans la même seconde) : le PuP-Pack n'est pas accusé.
  assert.equal(vpxPupStartCrash(TAIL, STACK_BUFFER, { ...PUP_FAULT, module: 'plugin-dof64.dll' }), undefined);
  // Un module du système (abort() du runtime) ne contredit pas l'heure.
  assert.deepEqual(vpxPupStartCrash(TAIL, STACK_BUFFER, { ...PUP_FAULT, module: 'ucrtbase.dll' }), { afterSeconds: 0.7 });
});

test('écran d’échec : arrêt au démarrage du PuP-Pack, Start propose de jouer sans lui, rangé à part', () => {
  const file = 'Avengers Pro (Stern 2012)_Bigus(MOD)1.3.vbs';
  const d = diagnoseVpxFailure(TAIL, STACK_BUFFER, file, undefined, { logWritten: true, fault: PUP_FAULT, pupActive: true })!;
  assert.equal(d.title, 'VPX s’est arrêté au démarrage du PuP-Pack');
  assert.equal(d.withoutPup, true);
  assert.match(d.lines[0]!, /0,7 s|0\.7 s/);
  assert.ok(d.lines.some((l) => /plugin-pup64\.dll/.test(l)), 'le module fautif est nommé');
  assert.ok(d.lines.some((l) => /Start : essayer sans le PuP-Pack/.test(l) && /pas effacé/.test(l) && /Réactiver le PuP-Pack/.test(l)));
  assert.match(d.journal, /VPX arrêté au démarrage du PuP-Pack .*0\.7 s après « PUP Manager start » ; module fautif \(Windows\) : plugin-pup64\.dll \(0\.0\.0\.0, 0x6b09ec6a\), 0xc0000409 au décalage 0x7c4f5/);
  // Sans PuP-Pack à ranger (table sans dossier à elle, pack déjà rangé) : pas de geste proposé.
  const none = diagnoseVpxFailure(TAIL, STACK_BUFFER, file, undefined, { logWritten: true })!;
  assert.equal(none.title, 'VPX s’est arrêté au démarrage du PuP-Pack');
  assert.equal(none.withoutPup, undefined);
  assert.ok(!none.lines.some((l) => /Start/.test(l)));
  // Une erreur du script de la table l'emporte : c'est elle qu'on montre.
  const script = diagnoseVpxFailure([...TAIL, "2026-11-27 23:06:10.260 ERROR [Main] [Player::OnScriptError@1235] Runtime error on line 12, col 2: Objet requis: 'x'"], STACK_BUFFER, file, undefined, { pupActive: true })!;
  assert.equal(script.withoutPup, undefined);
});

test('câblage : Start range le PuP-Pack par le geste de « Parties du jeu », puis rejoue ; fermé à l’invité', () => {
  const front = frontendSource();
  assert.match(front, /\.\.\.\(result\.fault && \{ fault: result\.fault \}\),\s*pupActive: library\.pupActive\(table\),/);
  assert.match(front, /state\.message\?\.action === 'no-pup' && is\(KEYS\.confirm\)\) \{[\s\S]{0,400}library\.setPup\(again, false\)[\s\S]{0,300}void play\(again\)/);
  const library = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'library.ts'), 'utf8');
  assert.match(library, /setPup: \(table: TableEntry, enable: boolean\) => setPupEnabled\(table, enable\)/);
  const renderer = fs.readFileSync(path.join(REPO_ROOT, 'app', 'renderer', 'frontend.js'), 'utf8');
  assert.match(renderer, /s\.message\.action === 'no-pup'\) cover\.append\(footer\(\[\[t\('Start : rejouer sans le PuP-Pack'\)/);
  // Ranger un PuP-Pack modifie la table : fermé en mode invité, comme « Parties du jeu ».
  assert.equal(GUEST_DOORS['message.no-pup'], false);
});

test('rapport : planté sans crash.txt, le module noté par Windows part dans evenement-windows.txt, sans le profil', () => {
  const launcher = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'launcher.ts'), 'utf8');
  assert.match(launcher, /failure === 'crash' && !crashReport && vpxExitName\(exitCode\) && !vpxMissingLibrary\(exitCode\)/);
  assert.match(launcher, /readWindowsFault\(opts\.exe, t0\)/);
  const evidence = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'launch-evidence.ts'), 'utf8');
  assert.match(evidence, /else if \(last\?\.fault\) out\.push\(\{ name: 'evenement-windows\.txt', text: faultText\(last\.fault\), kind: 'crash' \}\)/);
  // Du chemin du module, les quatre derniers segments : jamais C:\Users\<profil>.
  assert.match(evidence, /parts\.slice\(-4\)/);
});
