// Règles du pare-feu après une mise à jour (retour du 01/11/2026 : le réseau des bornes bloqué
// après la mise à jour en 0.1.5, alors que l'autorisation avait été donnée avant). La cause, lue
// dans le journal des évènements du pare-feu de la borne : seules existaient les règles « Query
// User » que Windows pose lui-même à l'affichage de son invite, bloquantes tant que personne ne
// clique, et nommées « Cyber Pinball » comme la nôtre ; la lecture par nom les prenait pour une
// autorisation. Et la règle de VPX, nouvelle, n'est posée par aucune mise à jour.
//
// Invariants fixés ici, toutes les commandes simulées (PowerShell, netsh, schtasks : jamais le vrai
// pare-feu du poste) : la lecture par programme voit une règle bloquante et une autorisation
// partielle ; la vérification au démarrage qui suit une mise à jour écrit l'état de chaque règle
// au journal et repose ce qui manque par la tâche de réparation, sans invite ; sans tâche, l'état
// reste visible avec sa raison (« Partage et réseau », la présence des amis « bloqué par le
// pare-feu », l'écran ouvert après la mise à jour) jusqu'à l'autorisation, qui pose la tâche.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';
import { createDownloadManager } from '../downloadmanager';
import {
  FIREWALL_REPAIR_TASK,
  FIREWALL_RULE,
  VPX_FIREWALL_RULE,
  appFirewallState,
  firewallBlocksNetwork,
  firewallProblems,
  firewallReadScript,
  firewallRepairScript,
  firewallSetupScript,
  readFirewallRules,
  vpxFirewallState,
  type FirewallRuleInfo,
} from '../firewall';
import { newSocialState } from '../social';

const APP_DIST = path.join(REPO_ROOT, 'app', 'dist');

interface Row {
  text: string;
  detail?: string;
  tone?: string;
  badges?: string[];
}
interface Built {
  heading: string;
  lead?: string;
  sections: { title?: string; rows: Row[] }[];
  actions: { label: string; run: () => void | Promise<void> }[];
}
type Build = () => Built;
type RunResult = { status: number | null; stdout: string; stderr: string };
interface Rule {
  state(): string | undefined;
  vpxState(): string | undefined;
  taskState(): boolean | undefined;
  check(): Promise<string>;
  allow(): Promise<object>;
  repair(): Promise<boolean>;
}

/* eslint-disable @typescript-eslint/no-require-imports */
const { createFirewallRule } = require(path.join(APP_DIST, 'firewall-rule.js')) as { createFirewallRule(o: object): Rule };
const { guardFirewall } = require(path.join(APP_DIST, 'firewall-guard.js')) as {
  guardFirewall(rule: Rule, o: { update?: { from: string; to: string }; log: (l: string) => void }): Promise<{ app: string; vpx?: string; task?: boolean; repaired?: boolean; problems: { rule: string; reason: string }[] }>;
};
const { createFriendsMenu } = require(path.join(APP_DIST, 'friends-menu.js')) as {
  createFriendsMenu(host: object): { items: Record<string, { run(): void }>; openFirewall(back?: () => void): void };
};
const { createSocialNet } = require(path.join(APP_DIST, 'social-net.js')) as { createSocialNet(o: object): { status(): object } & Record<string, unknown> };
const { createFriendContent } = require(path.join(APP_DIST, 'friend-content.js')) as { createFriendContent(o: object): object };
/* eslint-enable @typescript-eslint/no-require-imports */

const EXE = 'D:\\CyberPinball\\app\\CyberPinball.exe';
const VPX_REAL = 'D:\\CyberPinball\\emulators\\vpx\\10.8.1-5436\\VPinballX_BGFX64.exe';
const VPX_CURRENT = 'D:\\CyberPinball\\emulators\\vpx\\current\\VPinballX_BGFX64.exe';

const rule = (o: Partial<FirewallRuleInfo> & { program: string }): FirewallRuleInfo => ({ name: FIREWALL_RULE, inbound: true, allow: true, block: false, enabled: true, profiles: 7, ...o });
/** Les règles que Windows pose à l'affichage de son invite : TCP et UDP, un profil, bloquantes tant que personne ne clique. */
const queryUser = (profiles: number, block: boolean) => [rule({ program: EXE.toLowerCase(), profiles, allow: !block, block }), rule({ program: EXE.toLowerCase(), profiles, allow: !block, block })];


/** L'autorisation de Windows est prévenue d'abord (uac-confirm.ts) : « Plus tard » choisi d'office, on confirme. */
async function confirmUac(last: () => { build(): { actions: { label: string; run(): unknown }[] }; at?: number }): Promise<void> {
  const warning = last().build();
  assert.equal(warning.actions[0]!.label, 'Plus tard, au bureau', '« Plus tard » en premier');
  assert.equal(last().at, 0, '« Plus tard » choisi d’office');
  await warning.actions.find((a) => a.label === 'Continuer : Windows demande l’autorisation')!.run();
}

test('lecture par programme : une règle bloquante de l’invite de Windows n’est jamais une autorisation', () => {
  const read = (rules: FirewallRuleInfo[], vpxRules = 0) => ({ rules, vpxRules });
  // Le cas de la borne : rien que des règles « Query User », nommées comme la nôtre.
  assert.equal(appFirewallState(read([...queryUser(4, true), ...queryUser(2, false)]), EXE), 'blocked', 'invite restée sans réponse sur le réseau public');
  assert.equal(appFirewallState(read(queryUser(2, false)), EXE), 'partial', 'autorisé sur le réseau privé seulement');
  assert.equal(appFirewallState(read([...queryUser(2, false), ...queryUser(4, false), ...queryUser(1, false)]), EXE), 'allowed', 'les trois profils couverts');
  assert.equal(appFirewallState(read([rule({ program: EXE })]), EXE), 'allowed', 'notre règle, tous profils');
  assert.equal(appFirewallState(read([rule({ program: EXE, enabled: false })]), EXE), 'missing', 'désactivée : comme absente');
  assert.equal(appFirewallState(read([rule({ program: EXE, inbound: false })]), EXE), 'missing', 'sortante : ne compte pas');
  assert.equal(appFirewallState(read([rule({ program: 'C:\\Ailleurs\\CyberPinball.exe' })]), EXE), 'missing');
  // VPX : bloqué en entrée pour chacun de ses programmes, tous profils.
  const vpxBlock = (program: string, profiles = 7) => rule({ program, name: VPX_FIREWALL_RULE, allow: false, block: true, profiles });
  assert.equal(vpxFirewallState(read([vpxBlock(VPX_REAL), vpxBlock(VPX_CURRENT)], 2), [VPX_REAL, VPX_CURRENT]), 'closed');
  assert.equal(vpxFirewallState(read([vpxBlock(VPX_CURRENT)], 1), [VPX_REAL, VPX_CURRENT]), 'other-version');
  assert.equal(vpxFirewallState(read([vpxBlock(VPX_REAL, 2), vpxBlock(VPX_CURRENT)], 2), [VPX_REAL, VPX_CURRENT]), 'other-version', 'un seul profil : à reposer');
  assert.equal(vpxFirewallState(read([]), [VPX_REAL, VPX_CURRENT]), 'missing');
  // La sortie de PowerShell : valeurs numériques de NetSecurity, une règle seule ou un tableau.
  const json = JSON.stringify({ rules: [{ p: EXE, n: 'Cyber Pinball', d: 1, a: 4, e: 1, f: 4 }], vpx: 0 });
  assert.deepEqual(readFirewallRules(json, 0)!.rules[0], { program: EXE, name: 'Cyber Pinball', inbound: true, allow: false, block: true, enabled: true, profiles: 4 });
  assert.equal(readFirewallRules(JSON.stringify({ rules: { p: EXE, n: 'x', d: 1, a: 2, e: 1, f: 0 }, vpx: 1 }), 0)!.rules[0]!.profiles, 7, 'Profile 0 : tous');
  assert.equal(readFirewallRules('', 1), undefined, 'PowerShell en échec : illisible');
  assert.equal(readFirewallRules('pas du JSON', 0), undefined);
  // Le réseau est dit bloqué par le pare-feu dès que l'autorisation n'est pas complète.
  for (const s of ['blocked', 'missing', 'partial', 'other-program'] as const) assert.ok(firewallBlocksNetwork(s), s);
  assert.ok(!firewallBlocksNetwork('allowed') && !firewallBlocksNetwork('unknown') && !firewallBlocksNetwork(undefined));
  assert.deepEqual(firewallProblems('allowed', 'closed'), []);
  assert.deepEqual(firewallProblems('unknown', undefined), [], 'illisible : rien à réparer à l’aveugle');
  assert.match(firewallProblems('blocked', undefined)[0]!.reason, /invite « Autoriser l’accès » est restée sans réponse/);
});

/** Décode le script d'un `-EncodedCommand`. */
const decoded = (args: readonly string[]) => Buffer.from(args[args.indexOf('-EncodedCommand') + 1]!, 'base64').toString('utf16le');

test('la pose retire toute règle d’entrée sur l’exécutable, et la tâche de réparation ne lance qu’un script figé', () => {
  const repair = firewallRepairScript({ exe: EXE, vpxDir: 'D:\\CyberPinball\\emulators\\vpx' });
  assert.match(repair, /Where-Object \{ \$_\.Program -ieq \$exe \} \| Get-NetFirewallRule \| Where-Object \{ \$_\.Direction -eq 'Inbound' \} \| Remove-NetFirewallRule/, 'les règles de l’invite de Windows, quel que soit leur nom');
  assert.ok(repair.indexOf('Remove-NetFirewallRule') < repair.indexOf('New-NetFirewallRule'), 'retirées avant la pose');
  assert.match(repair, new RegExp(`New-NetFirewallRule -DisplayName '${FIREWALL_RULE}' -Direction Inbound -Action Allow -Program \\$exe -Profile Any -Enabled True`));
  assert.match(repair, new RegExp(`New-NetFirewallRule -DisplayName '${VPX_FIREWALL_RULE}' -Direction Inbound -Action Block -Program \\$f\\.FullName -Profile Any`), 'chaque version de VPX et la jonction current');
  assert.match(firewallRepairScript({ exe: "D:\\L'arcade\\app\\CyberPinball.exe" }), /\$exe = 'D:\\L''arcade\\app\\CyberPinball\.exe'/, 'apostrophe doublée');
  assert.match(firewallRepairScript({ exe: 'D:\\L’arcade\\app\\CyberPinball.exe' }), /\$exe = 'D:\\L’’arcade/, 'l’apostrophe typographique aussi : PowerShell la lit comme une apostrophe');
  const setup = firewallSetupScript({ exe: EXE, vpxDir: 'D:\\CyberPinball\\emulators\\vpx' });
  assert.ok(setup.startsWith(repair), 'la pose d’abord, sous la même autorisation');
  assert.match(setup, new RegExp(`Register-ScheduledTask -TaskName '${FIREWALL_REPAIR_TASK}'`));
  assert.match(setup, /-LogonType S4U -RunLevel Highest/, 'hors de la session, sans fenêtre, droits d’administrateur');
  assert.doesNotMatch(setup, /New-ScheduledTaskTrigger/, 'aucun déclencheur : seule l’application la lance');
  // La tâche lance PowerShell de Windows sur le script encodé dans ses arguments : la même pose, aucun fichier.
  const args = /-Argument '([^']+)'/.exec(setup)![1]!.split(' ');
  assert.equal(decoded(args), repair);
  assert.doesNotMatch(args.join(' '), /-File|\.ps1/);
  // La lecture : par programme, sans élévation, aucun changement.
  const read = firewallReadScript([EXE, VPX_REAL]);
  assert.match(read, /Get-NetFirewallApplicationFilter -PolicyStore ActiveStore/);
  assert.doesNotMatch(read, /Remove-|New-|Set-|netsh/);
});

test('les scripts PowerShell sont syntaxiquement valides (analysés, jamais exécutés)', { skip: process.platform !== 'win32' }, () => {
  const scripts = [firewallReadScript([EXE, VPX_REAL]), firewallSetupScript({ exe: EXE, vpxDir: 'D:\\CyberPinball\\emulators\\vpx' })];
  for (const script of scripts) {
    const check = `$e = $null; [void][System.Management.Automation.Language.Parser]::ParseInput([Text.Encoding]::Unicode.GetString([Convert]::FromBase64String('${Buffer.from(script, 'utf16le').toString('base64')}')), [ref]$null, [ref]$e); if ($e.Count) { $e | ForEach-Object { $_.Message }; exit 1 }`;
    const r = spawnSync(path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), ['-NoProfile', '-NonInteractive', '-Command', check], { encoding: 'utf8', windowsHide: true });
    assert.equal(r.status, 0, `${r.stdout}${r.stderr}`);
  }
});

/**
 * Un poste simulé : ses règles, sa tâche de réparation, et les commandes que l'application lance.
 * Aucune commande ne part vers le vrai système ; toute commande qui modifierait le pare-feu sans
 * élévation fait échouer le test.
 */
function fakeMachine(start: { rules: FirewallRuleInfo[]; task: boolean; cancel?: boolean }) {
  const machine = { rules: [...start.rules], task: start.task, commands: [] as string[], elevations: 0 };
  const good = () => {
    machine.rules = [rule({ program: EXE }), ...[VPX_REAL, VPX_CURRENT].map((program) => rule({ program, name: VPX_FIREWALL_RULE, allow: false, block: true }))];
  };
  const run = async (file: string, args: string[]): Promise<RunResult> => {
    const base = path.basename(file).toLowerCase();
    machine.commands.push(`${base} ${args.filter((a) => a.length < 200).join(' ')}`);
    if (base === 'powershell.exe' && args.includes('-EncodedCommand')) {
      const script = decoded(args);
      assert.match(script, /^\$t = @\(/, 'seule la lecture passe sans élévation');
      const wanted = [...script.matchAll(/'([^']+\.exe)'/gi)].map((m) => m[1]!.toLowerCase());
      const rules = machine.rules.filter((r) => wanted.includes(r.program.toLowerCase()));
      return { status: 0, stdout: JSON.stringify({ rules: rules.map((r) => ({ p: r.program, n: r.name, d: r.inbound ? 1 : 2, a: r.block ? 4 : 2, e: r.enabled ? 1 : 2, f: r.profiles === 7 ? 0 : r.profiles })), vpx: machine.rules.filter((r) => r.name === VPX_FIREWALL_RULE).length }), stderr: '' };
    }
    if (base === 'powershell.exe' && args.includes('-Command')) {
      // L'élévation : Start-Process -Verb RunAs sur le script de pose écrit à côté.
      const command = args[args.indexOf('-Command') + 1]!;
      assert.match(command, /Start-Process -FilePath '[^']+powershell\.exe' -Verb RunAs/);
      const file = /'-File', '"([^"]+)"'/.exec(command)![1]!.replace(/''/g, "'");
      const script = fs.readFileSync(file, 'utf8');
      assert.ok(script.startsWith('\ufeff'), 'UTF-8 avec BOM, lu par PowerShell 5');
      assert.match(script, /Register-ScheduledTask/);
      machine.elevations++;
      if (start.cancel) return { status: 1223, stdout: '', stderr: 'L’opération a été annulée par l’utilisateur.' };
      good();
      machine.task = true;
      return { status: 0, stdout: '', stderr: '' };
    }
    if (base === 'schtasks.exe') {
      assert.equal(args[2], FIREWALL_REPAIR_TASK);
      if (args[0] === '/query') return { status: machine.task ? 0 : 1, stdout: '', stderr: '' };
      if (args[0] === '/run' && machine.task) {
        good();
        return { status: 0, stdout: '', stderr: '' };
      }
      return { status: 1, stdout: '', stderr: 'ERREUR' };
    }
    if (base === 'netsh.exe') {
      assert.equal(args[3], 'show', 'netsh ne sert qu’à lire, sans élévation');
      return { status: 1, stdout: 'Aucune règle ne correspond aux critères spécifiés.\r\n', stderr: '' };
    }
    throw new Error(`commande inattendue : ${file}`);
  };
  return { machine, run };
}

const firewallOn = (run: (file: string, args: string[]) => Promise<RunResult>) =>
  createFirewallRule({ exe: EXE, simulated: false, vpx: () => [VPX_REAL, VPX_CURRENT], run, wait: async () => undefined });

test('après une mise à jour : chaque règle au journal, reposée d’elle-même par la tâche de réparation, sans invite', async () => {
  // Le poste du 01/11/2026 : les règles bloquantes de l'invite de Windows, rien pour VPX ; la tâche posée.
  const { machine, run } = fakeMachine({ rules: [...queryUser(4, true), ...queryUser(2, false)], task: true });
  const firewall = firewallOn(run);
  const log: string[] = [];
  const report = await guardFirewall(firewall, { update: { from: '0.1.5', to: '0.1.6' }, log: (l) => log.push(l) });
  assert.equal(log[0], 'Pare-feu (après la mise à jour 0.1.5 → 0.1.6) : Cyber Pinball blocked, VPX missing, réparation automatique prête.');
  assert.ok(log.some((l) => /^Pare-feu : à reposer \(Cyber Pinball, blocked\) : Une règle de Windows bloque Cyber Pinball/.test(l)));
  assert.ok(log.some((l) => /^Pare-feu : à reposer \(VPX, missing\)/.test(l)));
  assert.ok(log.includes('Pare-feu : réparation automatique lancée (sans invite).'));
  assert.equal(log.at(-1), 'Pare-feu (après la mise à jour 0.1.5 → 0.1.6, après la réparation) : Cyber Pinball allowed, VPX closed, réparation automatique prête.');
  assert.deepEqual([report.app, report.vpx, report.repaired, report.problems], ['allowed', 'closed', true, []]);
  assert.equal(machine.elevations, 0, 'aucune demande de Windows');
  assert.ok(machine.commands.some((c) => c === `schtasks.exe /run /tn ${FIREWALL_REPAIR_TASK}`));
  // Au démarrage suivant, tout est en ordre : une ligne au journal, rien d'autre.
  const next: string[] = [];
  const again = await guardFirewall(firewall, { log: (l) => next.push(l) });
  assert.deepEqual(next, ['Pare-feu (démarrage) : Cyber Pinball allowed, VPX closed, réparation automatique prête.']);
  assert.equal(again.repaired, undefined);
});

/** « Mes amis » et « Partage et réseau » sur ce poste simulé, le réseau des bornes ouvert (jamais démarré). */
function friendsOn(firewall: Rule) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-pare-feu-maj-'));
  const friend = newSocialState().key.publicKey;
  fs.writeFileSync(path.join(dir, 'social.json'), JSON.stringify({ ...newSocialState(), friends: [{ key: friend, name: 'Bruno', since: new Date().toISOString(), events: [] }] }));
  const off = createSocialNet({ dataDir: dir, mode: 'off' });
  const net = { ...off, status: () => ({ ...(off.status() as object), mode: 'public' }) };
  const opened: { build: Build; at?: number }[] = [];
  const games = { current: () => undefined, board: () => [], history: () => [], table: () => undefined, waitView: () => undefined, invites: () => [], stop: () => undefined };
  const menu = createFriendsMenu({
    library: { openCustom: (build: Build, at?: number) => opened.push({ build, at }), openSystem: () => undefined, openPrompt: () => undefined, task: async (_m: string, work: () => unknown) => work(), openMediasWith: () => undefined, catalogFor: () => undefined, installReceived: () => undefined, isShowing: () => false },
    net,
    firewall,
    downloads: { manager: createDownloadManager({ dataDir: dir, transports: {} }), finisher: () => undefined, deliverer: () => undefined, opener: () => undefined, deliver: () => undefined, openReturn: () => undefined },
    content: createFriendContent({ net, dataDir: dir, tables: () => [], root: () => undefined, contents: () => undefined }),
    games,
    tables: () => [],
    root: () => undefined,
    redraw: () => undefined,
  });
  const last = () => opened.at(-1)!;
  const rows = () => last().build().sections.flatMap((s) => s.rows);
  return { menu, last, rows };
}

test('sans tâche de réparation : la raison reste visible, la présence dit « bloqué par le pare-feu », l’autorisation pose tout', async () => {
  const { machine, run } = fakeMachine({ rules: queryUser(4, true), task: false });
  const firewall = firewallOn(run);
  const log: string[] = [];
  const report = await guardFirewall(firewall, { update: { from: '0.1.5', to: '0.1.6' }, log: (l) => log.push(l) });
  assert.deepEqual(report.problems.map((p) => p.rule), ['app', 'vpx']);
  assert.match(log[0]!, /Cyber Pinball blocked, VPX missing, réparation automatique pas encore autorisée\.$/);
  assert.ok(log.some((l) => l.startsWith('Pare-feu : pas de réparation automatique sur ce poste')));
  assert.equal(machine.elevations, 0, 'jamais d’invite sans un geste de l’utilisateur');
  const { menu, last, rows } = friendsOn(firewall);
  // « Mes amis » : le réseau bloqué, avec sa raison, et l'ami « bloqué par le pare-feu » plutôt que hors ligne.
  menu.items.friends!.run();
  const blocked = rows().find((r) => r.text === 'Réseau des bornes bloqué par le pare-feu de Windows')!;
  assert.ok(blocked, 'en tête de « Mes amis »');
  assert.equal(blocked.tone, 'error');
  assert.match(blocked.detail!, /^Une règle de Windows bloque Cyber Pinball .* · Partage et réseau : « Autoriser dans le pare-feu de Windows »$/);
  const bruno = rows().find((r) => r.text.startsWith('Bruno'))!;
  assert.deepEqual(bruno.badges, ['Bloqué par le pare-feu']);
  assert.match(bruno.detail!, /le pare-feu de Windows bloque le réseau des bornes/);
  assert.ok(last().build().sections.some((s) => s.title === 'Injoignables : pare-feu de Windows (1)'));
  // « Partage et réseau » : chaque règle avec sa raison, la réparation automatique à autoriser.
  menu.items.sharing!.run();
  assert.equal(rows().find((r) => r.text === 'Pare-feu de Windows : Cyber Pinball bloqué')!.tone, 'error');
  assert.equal(rows().find((r) => r.text === 'Réparation automatique du pare-feu : pas encore autorisée')!.tone, 'warning');
  // L'écran ouvert d'office après la mise à jour : la raison de chaque règle, l'autorisation sélectionnée d'office.
  menu.openFirewall();
  assert.equal(last().at, 0);
  const screen = last().build();
  assert.equal(screen.heading, 'Pare-feu de Windows');
  assert.equal(screen.actions[0]!.label, 'Autoriser dans le pare-feu de Windows');
  assert.deepEqual(screen.sections.flatMap((s) => s.rows).filter((r) => r.badges?.includes('À reposer')).map((r) => r.text), ['Réseau des bornes', 'État en direct des tables Stern SAM']);
  await screen.actions[0]!.run();
  await confirmUac(last);
  assert.equal(machine.elevations, 1, 'une seule demande de Windows, pour les règles et la tâche');
  const after = last().build();
  assert.deepEqual(after.actions.map((a) => a.label), ['Retour'], 'tout en ordre : plus rien à autoriser');
  assert.ok(after.sections.flatMap((s) => s.rows).some((r) => r.text === 'Règles du pare-feu en place'));
  assert.ok(after.sections.flatMap((s) => s.rows).some((r) => r.text === 'Réparation automatique du pare-feu : prête'));
  // La présence redevient celle du réseau : hors ligne, sans mention du pare-feu.
  menu.items.friends!.run();
  assert.ok(!rows().some((r) => r.text === 'Réseau des bornes bloqué par le pare-feu de Windows'));
  assert.deepEqual(rows().find((r) => r.text.startsWith('Bruno'))!.badges, ['Hors ligne']);
  // La prochaine fois qu'une règle manque, la réparation suffit : plus d'invite.
  machine.rules = queryUser(4, true);
  const next = await guardFirewall(firewall, { log: () => undefined });
  assert.deepEqual([next.repaired, next.problems.length, machine.elevations], [true, 0, 1]);
});

test('autorisation refusée : rien de posé, l’état reste à reposer', async () => {
  const { machine, run } = fakeMachine({ rules: [], task: false, cancel: true });
  const firewall = firewallOn(run);
  await firewall.check();
  assert.deepEqual(await firewall.allow(), { cancelled: true });
  assert.deepEqual([firewall.state(), firewall.taskState(), machine.elevations], ['missing', false, 1]);
  // Le script de pose écrit pour l'élévation est retiré, accepté ou non.
  assert.deepEqual(fs.readdirSync(os.tmpdir()).filter((f) => f.startsWith(`cyberpinball-pare-feu-${process.pid}-`)), []);
});

test('l’application vérifie les règles à chaque démarrage et juste après une mise à jour, jamais au milieu d’une partie', () => {
  const front = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'frontend.ts'), 'utf8');
  assert.match(front, /if \(socialMode !== 'off'\) void checkFirewallAtStart\(\)/, 'à chaque démarrage, réseau des bornes en marche');
  const check = front.slice(front.indexOf('async function checkFirewallAtStart'), front.indexOf('function showBanner'));
  assert.match(check, /const update = updates\.justInstalled\(\);/, 'la mise à jour constatée au démarrage');
  assert.match(check, /guardFirewall\(socialFirewall, /);
  assert.match(check, /if \(update && state\.phase === 'menu' && !guest\.active && !closing\) friendsMenu\.openFirewall\(/, 'l’écran seulement au menu des tables');
  assert.match(check, /showBanner\(/, 'sinon, un constat en haut du menu');
  const updates = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'updates-menu.ts'), 'utf8');
  assert.match(updates, /if \(outcome\.kind === 'installed'\) installed = \{ from: outcome\.from, to: outcome\.to \};/, 'mise à jour complète ou légère : le même constat au démarrage');
  // L'installeur retire aussi les règles de l'invite de Windows avant de poser la sienne, et la désinstallation la tâche.
  const nsi = fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'installeur', 'cyberpinball.nsi'), 'utf8');
  assert.match(nsi, /netsh advfirewall firewall delete rule name="all" dir=in program="\$Racine\\app\\\$\{EXE\}" >nul 2>&1 & netsh advfirewall firewall add rule name="Cyber Pinball"/);
  const uninstall = nsi.slice(nsi.indexOf('Section "Uninstall"'), nsi.indexOf('SectionEnd', nsi.indexOf('Section "Uninstall"')));
  assert.match(uninstall, new RegExp(`schtasks /delete /tn "${FIREWALL_REPAIR_TASK}" /f`));
});
