// L'inspector de VPX pour les parties entre amis sur une table Stern SAM (30/10/2026) : la règle du
// pare-feu qui ferme VPX au réseau (lecture de netsh, installeur, une seule élévation avec celle de
// Cyber Pinball), qui suit la version active de VPX (jonction emulators\vpx\current déplacée : la
// règle est à reposer, l'inspector reste éteint) ; ce que le double reçoit (carte réduite, copie du
// VPinballX.ini, l'habituel jamais touché). Aucun test ne touche au vrai pare-feu, ni n'ouvre de port
// ailleurs qu'à 127.0.0.1.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';
import {
  FIREWALL_RULE,
  INSPECTOR_PORTS,
  VPX_FIREWALL_RULE,
  firewallCommandLine,
  iniChanges,
  iniWithInspector,
  inspectorMemMapFiles,
  readVpxFirewallShow,
  vpxFirewallAddArgs,
  vpxFirewallPrograms,
} from '../index';

/* eslint-disable @typescript-eslint/no-require-imports */
const APP_DIST = path.join(REPO_ROOT, 'app', 'dist');
const { createFirewallRule } = require(path.join(APP_DIST, 'firewall-rule.js')) as {
  createFirewallRule(o: object): { check(): Promise<string>; checkVpx(): Promise<string | undefined>; vpxState(): string | undefined; allow(): Promise<object> };
};
const { inspectorFor, vpxFirewallTargets, freeInspectorPort } = require(path.join(APP_DIST, 'vpx-inspector.js')) as {
  inspectorFor(f: object, log?: (l: string) => void): Promise<{ port: number } | undefined>;
  vpxFirewallTargets(exe: string | undefined): string[] | undefined;
  freeInspectorPort(ports?: readonly number[]): Promise<number | undefined>;
};
/* eslint-enable @typescript-eslint/no-require-imports */

const B = String.fromCharCode(92);
const win = (...parts: string[]) => parts.join(B);
const REAL = win('D:', 'CyberPinball', 'emulators', 'vpx', '10.8.1-5436', 'VPinballX_BGFX64.exe');
const CURRENT = win('D:', 'CyberPinball', 'emulators', 'vpx', 'current', 'VPinballX_BGFX64.exe');

test('règle de VPX : l’entrée bloquée, lue quelle que soit la langue de Windows, pour sa version active', () => {
  assert.deepEqual(vpxFirewallPrograms(REAL, CURRENT), [REAL, CURRENT]);
  assert.deepEqual(vpxFirewallPrograms(REAL, REAL.toUpperCase()), [REAL], 'sans jonction, un seul programme');
  assert.deepEqual(vpxFirewallAddArgs(REAL).slice(4), [`name=${VPX_FIREWALL_RULE}`, 'dir=in', 'action=block', `program=${REAL}`, 'enable=yes', 'profile=any']);
  const block = (program: string, fr = false) =>
    fr
      ? `\r\nNom de la règle :                     ${VPX_FIREWALL_RULE}\r\nSens :                                Entrée\r\nProgramme :                           ${program.toLowerCase()}\r\nAction :                              Bloquer\r\n`
      : `\r\nRule Name:                            ${VPX_FIREWALL_RULE}\r\nDirection:                            In\r\nProgram:                              ${program}\r\nAction:                               Block\r\n`;
  const both = block(REAL) + block(CURRENT) + 'Ok.\r\n';
  assert.equal(readVpxFirewallShow(both, 0, [REAL, CURRENT]), 'closed');
  assert.equal(readVpxFirewallShow(block(REAL, true) + block(CURRENT, true), 0, [REAL, CURRENT]), 'closed', 'en français, sans casse');
  assert.equal(readVpxFirewallShow(block(CURRENT), 0, [REAL, CURRENT]), 'other-version', 'un seul des deux chemins : à reposer');
  // VPX a changé de version : la règle vise l'ancien dossier.
  const next = [REAL.replace('10.8.1-5436', '10.8.2-6000'), CURRENT];
  assert.equal(readVpxFirewallShow(both, 0, next), 'other-version');
  assert.equal(readVpxFirewallShow('No rules match the specified criteria.\r\n', 1, next), 'missing');
  assert.equal(readVpxFirewallShow('', null, next), 'unknown');
  assert.equal(readVpxFirewallShow(both, 0, []), 'unknown', 'sans VPX installé, rien à dire');
});

test('une seule élévation : la règle de Cyber Pinball puis celle de VPX, chacune retirée puis reposée', () => {
  const app = win('D:', 'CyberPinball', 'app', 'CyberPinball.exe');
  const line = firewallCommandLine({ app, vpx: [REAL, CURRENT] });
  assert.equal(
    line,
    [
      `netsh advfirewall firewall delete rule name="${FIREWALL_RULE}" >nul 2>&1`,
      `netsh advfirewall firewall add rule name="${FIREWALL_RULE}" dir="in" action="allow" program="${app}" enable="yes" profile="any"`,
      `netsh advfirewall firewall delete rule name="${VPX_FIREWALL_RULE}" >nul 2>&1`,
      `netsh advfirewall firewall add rule name="${VPX_FIREWALL_RULE}" dir="in" action="block" program="${REAL}" enable="yes" profile="any"`,
      `netsh advfirewall firewall add rule name="${VPX_FIREWALL_RULE}" dir="in" action="block" program="${CURRENT}" enable="yes" profile="any"`,
    ].join(' & '),
  );
  assert.equal(firewallCommandLine({ app }), line.split(' & ').slice(0, 2).join(' & '), 'sans VPX installé : la règle de Cyber Pinball seule');
  const src = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'firewall-rule.ts'), 'utf8');
  assert.equal((src.match(/-Verb RunAs/g) ?? []).length, 1, 'une seule demande d’autorisation pour les deux règles');
  assert.match(src, /firewallCommandLine\(\{ app: opts\.exe, \.\.\.\(vpx\?\.length \? \{ vpx \} : \{\}\) \}\)/);
});

test('l’installeur pose la règle de VPX sous la même autorisation, pour la version que l’application installera', () => {
  const nsi = fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'installeur', 'cyberpinball.nsi'), 'utf8');
  const section = nsi.slice(nsi.indexOf('Section "Partage entre bornes'), nsi.indexOf('!insertmacro MUI_FUNCTION_DESCRIPTION_BEGIN'));
  const runas = /ExecShellWait "runas" "\$SYSDIR\\cmd\.exe" '\/d \/c ([^']*)'/.exec(section)?.[1] ?? '';
  const parts = runas.split(' & ');
  // Mêmes commandes que firewallCommandLine, les chemins sous la racine choisie.
  const expected = firewallCommandLine({ app: '$Racine\\app\\${EXE}', vpx: ['$Racine\\${VPX_PAREFEU_REEL}', '$Racine\\${VPX_PAREFEU_JONCTION}'] })
    .split(' & ')
    .map((c) => c.replace(/ (dir|action|enable|profile)="([^"]*)"/g, ' $1=$2'));
  assert.deepEqual(parts, expected);
  // Présente seulement si les deux règles visent bien cette racine et cette version.
  const present = nsi.slice(nsi.indexOf('Function RegleParefeuPresente'), nsi.indexOf('FunctionEnd', nsi.indexOf('Function RegleParefeuPresente')));
  assert.match(present, new RegExp(`name="${VPX_FIREWALL_RULE}" verbose`));
  assert.match(present, /\$\{WordFind\} "\$2" "\$Racine\\\$\{VPX_PAREFEU_REEL\}" "E#" \$3/);
  // Désinstallation : la règle de VPX retirée si elle vise cette racine, sous la même demande que l'autre.
  const uninstall = nsi.slice(nsi.indexOf('Section "Uninstall"'), nsi.indexOf('SectionEnd', nsi.indexOf('Section "Uninstall"')));
  assert.match(uninstall, /\$\{WordFind\} "\$2" "\$Racine\\emulators\\vpx\\" "E#" \$3/);
  assert.match(uninstall, new RegExp(`delete rule name="${VPX_FIREWALL_RULE}"`));
  assert.equal((uninstall.match(/ExecShellWait "runas"/g) ?? []).length, 1);
  // Les chemins viennent du manifeste : la version et l'exécutable que l'application installera.
  const manifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'packages', 'installer', 'components.json'), 'utf8')) as { components: { id: string; version: string; installDir: string; executable?: string; executablePattern: string }[] };
  const vpx = manifest.components.find((c) => c.id === 'vpx')!;
  assert.ok(vpx.executable && new RegExp(vpx.executablePattern).test(vpx.executable), 'executable répond à executablePattern');
  const build = fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'installeur.mjs'), 'utf8');
  assert.match(build, /VPX_PAREFEU_REEL: `\$\{vpxDir\}\\\\\$\{vpx\.version\}\\\\\$\{vpx\.executable\}`/);
  assert.match(build, /VPX_PAREFEU_JONCTION: `\$\{vpxDir\}\\\\current\\\\\$\{vpx\.executable\}`/);
  assert.match(build, /const common = \{[^}]*VPX_PAREFEU_REEL/, 'les deux installeurs, léger et complet');
});

test('la règle suit VPX quand sa version change : jonction déplacée, règle à reposer, inspector éteint d’ici là', { skip: process.platform !== 'win32' }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-vpx-version-'));
  try {
    const base = path.join(root, 'emulators', 'vpx');
    for (const v of ['10.8.1-5436', '10.8.2-6000']) {
      fs.mkdirSync(path.join(base, v), { recursive: true });
      fs.writeFileSync(path.join(base, v, 'VPinballX_BGFX64.exe'), 'vpx');
    }
    const current = path.join(base, 'current');
    fs.symlinkSync(path.join(base, '10.8.1-5436'), current, 'junction');
    const exe = path.join(current, 'VPinballX_BGFX64.exe');
    const first = vpxFirewallTargets(exe)!;
    assert.equal(first.length, 2);
    assert.equal(first[0]!.toLowerCase(), path.join(fs.realpathSync.native(root), 'emulators', 'vpx', '10.8.1-5436', 'VPinballX_BGFX64.exe').toLowerCase(), 'le dossier réel de la version');
    assert.equal(first[1], exe, 'et la jonction par laquelle VPX est lancé');
    assert.equal(vpxFirewallTargets(path.join(base, 'absent', 'VPinballX_BGFX64.exe')), undefined);
    const firewall = createFirewallRule({ exe: 'C:\\x\\CyberPinball.exe', simulated: true, vpx: () => vpxFirewallTargets(exe) });
    const lines: string[] = [];
    assert.equal(await firewall.checkVpx(), 'missing');
    assert.equal(await inspectorFor(firewall, (l) => lines.push(l)), undefined, 'pas d’inspector sans la règle');
    assert.match(lines.at(-1)!, /règle du pare-feu de VPX : missing/);
    await firewall.allow();
    assert.equal(firewall.vpxState(), 'closed');
    const offered = await inspectorFor(firewall);
    assert.ok(offered && INSPECTOR_PORTS.includes(offered.port));
    // Nouvelle version de VPX : la jonction change de cible.
    fs.rmdirSync(current);
    fs.symlinkSync(path.join(base, '10.8.2-6000'), current, 'junction');
    assert.equal(await firewall.checkVpx(), 'other-version');
    assert.equal(await inspectorFor(firewall), undefined, 'inspector éteint tant que la règle n’est pas reposée');
    await firewall.allow();
    assert.equal(await firewall.checkVpx(), 'closed');
    // L'application relit la règle avant chaque partie entre amis.
    const front = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'frontend.ts'), 'utf8');
    assert.match(front, /vpx: \(\) => vpxFirewallTargets\(vpxInstall\(loc\)\?\.exe\)/);
    assert.match(front, /const inspectorReady = hooks\.double && !displayMode && simulated === undefined \? inspectorFor\(socialFirewall, /);
    assert.match(fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'vpx-inspector.ts'), 'utf8'), /const state = await firewall\.checkVpx\(\)/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('port de l’inspector : le premier libre à 127.0.0.1, cherché sans rien ouvrir en écoute', async () => {
  const taken = net.createServer();
  await new Promise<void>((resolve) => taken.listen(0, '127.0.0.1', resolve));
  const busy = (taken.address() as { port: number }).port;
  try {
    const free = await freeInspectorPort([busy, busy + 1]);
    assert.ok(free === busy + 1 || free === undefined, 'le port occupé est sauté');
    assert.equal(await freeInspectorPort([busy]), undefined);
  } finally {
    taken.close();
  }
  assert.ok(!/\.listen\(/.test(fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'vpx-inspector.ts'), 'utf8')), 'aucune écoute : pas d’invite du pare-feu pour Cyber Pinball');
});

test('le double : carte réduite sous les deux noms du jeu, VPinballX.ini copié l’inspector activé, l’habituel jamais touché', () => {
  const states = [
    { name: 'cyberpinball_joueur', start: 0x31988, length: 1, bcd: false, little: true },
    { name: 'cyberpinball_fin', start: 0x319ba, length: 1, bcd: false, little: true },
  ];
  const [index, map] = inspectorMemMapFiles(states, ['st_162h', 'st_161h', 'st_161h']);
  assert.equal(index!.rel, 'pinmame/memmaps/index.json');
  assert.deepEqual(JSON.parse(index!.text), { st_162h: 'cyberpinball.json', st_161h: 'cyberpinball.json' }, 'le nom demandé par le script et celui chargé par alias');
  assert.equal(map!.rel, 'pinmame/memmaps/cyberpinball.json');
  const parsed = JSON.parse(map!.text) as { cyberpinball: Record<string, Record<string, unknown>> };
  assert.deepEqual(parsed.cyberpinball.cyberpinball_fin, { label: 'cyberpinball_fin', start: '0x000319BA', length: 1, encoding: 'int', endian: 'little', nibble: 'both' }, 'valeur brute : ni masque ni inversion');
  // VPinballX.ini : la section ajoutée, ou corrigée si elle existe ; le reste à l'identique.
  const ini = '[Player]\r\nBallTrail = 1\r\n\r\n[Plugin.PinMAME]\r\nEnable = 1\r\n';
  assert.equal(iniWithInspector(ini, 2115), '[Player]\r\nBallTrail = 1\r\n\r\n[Plugin.PinMAME]\r\nEnable = 1\r\n\r\n[Plugin.Inspector]\r\nEnable = 1\r\nport = 2115\r\n');
  const had = '[Plugin.Inspector]\nEnable = 0\nport = 3000\nAutre = x\n[Standalone]\nA = 1\n';
  assert.equal(iniWithInspector(had, 2113), '[Plugin.Inspector]\nEnable = 1\nport = 2113\nAutre = x\n[Standalone]\nA = 1\n');
  assert.deepEqual(iniChanges(ini, iniWithInspector(ini, 2115).replace('BallTrail = 1', 'BallTrail = 0')), ['[Player] BallTrail'], 'l’inspector ne compte pas comme un réglage changé');
  // Le double : la copie seulement quand l'inspector sert ; le fichier lié à l'original remplacé, jamais réécrit ; -Ini de la copie.
  const doubles = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'table-double.ts'), 'utf8');
  assert.match(doubles, /if \(hook\.ok && hook\.inspector\.length\) \{/);
  assert.match(doubles, /fs\.rmSync\(out, \{ force: true \}\);\s*fs\.writeFileSync\(out, f\.text, 'utf8'\);/);
  assert.match(doubles, /fs\.writeFileSync\(file, iniWithInspector\(iniText!, offered!\.port\), 'utf8'\);\s*ini = \{ file, text: iniText! \};/);
  assert.ok(!/writeFileSync\(iniSource/.test(doubles), 'le VPinballX.ini de la borne n’est jamais écrit');
  const front = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'frontend.ts'), 'utf8');
  assert.match(front, /ini: double\?\.ini \?\? activeVpxIni\(loc\)/);
});
