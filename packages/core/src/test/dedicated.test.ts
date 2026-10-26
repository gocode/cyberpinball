// Borne dédiée (dedicated.ts) : Cyber Pinball à la place de l'Explorateur comme shell de
// Windows, par Shell Launcher. Ces tests ne touchent jamais Windows :
// - la logique du vrai script élevé tourne dans PowerShell sur une couche système simulée
//   (un fichier JSON), et doit rendre exactement ce que rend simulateRun ;
// - activer puis désactiver remet Windows dans l'état d'avant, quel qu'il soit ;
// - une activation qui échoue en route remet l'état d'avant d'elle-même.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import {
  activationProblems,
  DEDICATED_FLAG,
  elevatedScript,
  freshWindows,
  HANDOVER_EXIT_CODE,
  isExplorer,
  programName,
  readElevatedOutcome,
  REAL_SYSTEM_LAYER,
  referenceOf,
  restoreDifferences,
  SHELL_ACTION,
  shellLauncherEdition,
  shellSettingFor,
  SIMULATED_LAUNCHER_HOST,
  simulateRun,
  takeDedicatedFlag,
  takeShellRelaunch,
  windowsEditionLabel,
  writeShellRelaunch,
  type ElevatedOutcome,
  type ElevatedRun,
  type ShellSnapshot,
  type SimulatedWindows,
} from '../dedicated';

const SID = 'S-1-5-21-1111111111-2222222222-3333333333-1001';
const SETTING = shellSettingFor(['D:\\CyberPinball\\app\\CyberPinball.exe']);

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cp-dedicated-'));
}

test('la commande de Shell Launcher : l’exécutable entre guillemets, l’option de la borne dédiée, rien à relancer pour une mise à jour', () => {
  assert.equal(SETTING.shell, `D:\\CyberPinball\\app\\CyberPinball.exe ${DEDICATED_FLAG}`);
  assert.equal(shellSettingFor(['C:\\Program Files\\Cyber Pinball\\CyberPinball.exe']).shell, `"C:\\Program Files\\Cyber Pinball\\CyberPinball.exe" ${DEDICATED_FLAG}`);
  // Toute sortie relance Cyber Pinball (plantage compris), sauf le code de passage de relais.
  assert.equal(SETTING.defaultAction, SHELL_ACTION.restartShell);
  assert.deepEqual([SETTING.returnCodes, SETTING.returnActions], [[HANDOVER_EXIT_CODE], [SHELL_ACTION.doNothing]]);
  assert.equal(programName(SETTING.shell), 'CyberPinball.exe');
  assert.equal(programName('"C:\\Program Files\\x\\a b.exe" --x'), 'a b.exe');
});

test('l’option de la borne dédiée ne passe jamais aux relances', () => {
  assert.deepEqual(takeDedicatedFlag(['app', DEDICATED_FLAG, '--assistant']), { argv: ['app', '--assistant'], launched: true });
  assert.deepEqual(takeDedicatedFlag(['app']), { argv: ['app'], launched: false });
  const data = tmp();
  writeShellRelaunch(data, ['--assistant', '--boutons', DEDICATED_FLAG], 1000);
  assert.deepEqual(takeShellRelaunch(data, 2000), ['--assistant', '--boutons']);
  assert.deepEqual(takeShellRelaunch(data, 2000), [], 'consommée une seule fois');
  writeShellRelaunch(data, ['--assistant'], 1000);
  assert.deepEqual(takeShellRelaunch(data, 1000 + 61_000), [], 'trop ancienne : pas la nôtre');
  assert.equal(fs.existsSync(path.join(data, 'borne-dediee', 'relance.json')), false);
});

test('éditions : Shell Launcher n’existe que dans Entreprise, Éducation et IoT Enterprise', () => {
  for (const id of ['IoTEnterpriseS', 'IoTEnterprise', 'EnterpriseS', 'Enterprise', 'EnterpriseN', 'Education']) assert.ok(shellLauncherEdition(id), id);
  for (const id of ['Professional', 'ProfessionalWorkstation', 'Core', 'CoreSingleLanguage', '']) assert.ok(!shellLauncherEdition(id), id);
  assert.equal(windowsEditionLabel('IoTEnterpriseS', 26100), 'Windows 11 IoT Enterprise LTSC');
  assert.equal(windowsEditionLabel('Professional', 19045), 'Windows 10 Pro');
});

test('l’Explorateur reconnu sous toutes ses formes', () => {
  for (const shell of ['explorer.exe', 'Explorer.EXE', 'C:\\Windows\\explorer.exe', '"C:\\Windows\\explorer.exe"', 'explorer']) assert.ok(isExplorer(shell), shell);
  for (const shell of ['cmd.exe', 'myexplorer.exe', SETTING.shell, undefined]) assert.ok(!isExplorer(shell), String(shell));
});

/** Activer, (redémarrer si Windows le demande, puis reprendre), puis désactiver ; rend chaque étape. */
function roundTrip(start: SimulatedWindows) {
  const activate: ElevatedRun = { kind: 'activate', sid: SID, setting: SETTING };
  let { windows, outcome } = simulateRun(start, activate);
  let reference = referenceOf(outcome);
  const steps: ElevatedOutcome[] = [outcome];
  if (outcome.status === 'restart') {
    windows = reboot(windows);
    ({ windows, outcome } = simulateRun(windows, activate));
    reference = referenceOf(outcome, reference);
    steps.push(outcome);
  }
  assert.equal(outcome.status, 'done', outcome.error);
  assert.deepEqual(activationProblems(outcome.after, SETTING), []);
  const active = windows;
  const back = simulateRun(windows, { kind: 'deactivate', sid: SID, reference: reference! });
  steps.push(back.outcome);
  return { active, windows: back.windows, outcome: back.outcome, reference: reference!, steps };
}

/** Redémarrage simulé : les fonctions en attente prennent leur état final. */
function reboot(w: SimulatedWindows): SimulatedWindows {
  const features = Object.fromEntries(Object.entries(w.features).map(([f, s]) => [f, s === 'EnablePending' ? 'Enabled' : s === 'DisablePending' ? 'Disabled' : s]));
  return { ...w, features, wesl: features['Client-EmbeddedShellLauncher'] === 'Enabled', restartOnEnable: false };
}

const STARTS: Record<string, SimulatedWindows> = {
  'Windows tel que livré': freshWindows(),
  'Shell Launcher déjà en service, avec un autre shell pour ce compte': {
    features: { 'Client-DeviceLockdown': 'Enabled', 'Client-EmbeddedShellLauncher': 'Enabled' },
    wesl: true,
    enabled: true,
    defaultShell: { shell: 'explorer.exe', defaultAction: 0 },
    customs: { [SID]: { shell: 'C:\\Ancien\\menu.exe', defaultAction: 1, returnCodes: [0, 5], returnActions: [3, 2] }, 'S-1-5-21-9': { shell: 'notepad.exe', defaultAction: 0, returnCodes: [], returnActions: [] } },
    winlogonShell: 'C:\\Ancien\\host.exe',
  },
  'fonctions activées, Shell Launcher arrêté': {
    features: { 'Client-DeviceLockdown': 'Enabled', 'Client-EmbeddedShellLauncher': 'Enabled' },
    wesl: true,
    enabled: false,
    defaultShell: { shell: 'cmd.exe', defaultAction: 2 },
    customs: {},
    winlogonShell: 'explorer.exe',
  },
  'seule la première fonction activée': { ...freshWindows(), features: { 'Client-DeviceLockdown': 'Enabled', 'Client-EmbeddedShellLauncher': 'Disabled' } },
  'activation qui demande un redémarrage': { ...freshWindows(), restartOnEnable: true },
};

for (const [name, start] of Object.entries(STARTS)) {
  test(`activer puis désactiver remet l’état d’avant : ${name}`, () => {
    const { active, windows, outcome, reference } = roundTrip(start);
    // Activée : ce compte a Cyber Pinball, les autres l'Explorateur.
    assert.ok(active.enabled);
    assert.equal(active.customs[SID]!.shell, SETTING.shell);
    assert.ok(isExplorer(active.defaultShell?.shell));
    for (const [sid, setting] of Object.entries(start.customs)) if (sid !== SID) assert.deepEqual(active.customs[sid], setting, 'les autres comptes ne sont pas touchés');
    // Désactivée : exactement l'état d'avant, et le jugement le confirme.
    assert.equal(outcome.status, 'done', outcome.error);
    assert.deepEqual(restoreDifferences(reference, outcome.settled, outcome.after), []);
    const { restartOnEnable: _, ...expected } = start;
    const { restartOnEnable: __, ...actual } = windows;
    assert.deepEqual(actual, expected);
  });
}

test('une activation qui échoue en route remet l’état d’avant d’elle-même', () => {
  // Chaque écriture que l'activation fait sur ce Windows-là peut échouer.
  const cases: [SimulatedWindows, string][] = [
    [freshWindows(), 'SetDefaultShell'],
    [freshWindows(), 'SetCustomShell'],
    [freshWindows(), 'SetEnabled'],
    [STARTS['Shell Launcher déjà en service, avec un autre shell pour ce compte']!, 'SetCustomShell'],
    [STARTS['fonctions activées, Shell Launcher arrêté']!, 'SetEnabled'],
  ];
  for (const [start, failOn] of cases) {
    {
      const { windows, outcome } = simulateRun({ ...start, failOn }, { kind: 'activate', sid: SID, setting: SETTING });
      assert.equal(outcome.status, 'failed');
      assert.match(outcome.error ?? '', new RegExp(failOn));
      assert.ok(outcome.rolledBack, `${failOn} : ${outcome.rollbackError}`);
      assert.deepEqual({ ...windows, failOn: undefined }, { ...start, failOn: undefined }, failOn);
    }
  }
});

test('Windows Pro : rien n’est touché, la raison est dite', () => {
  const pro: SimulatedWindows = { ...freshWindows(), features: {} };
  const { windows, outcome } = simulateRun(pro, { kind: 'activate', sid: SID, setting: SETTING });
  assert.equal(outcome.status, 'failed');
  assert.equal(outcome.error, 'absent-features');
  assert.deepEqual(windows, pro);
});

test('le jugement de la désactivation voit chaque différence', () => {
  const reference: ShellSnapshot = {
    features: { 'Client-DeviceLockdown': 'Disabled', 'Client-EmbeddedShellLauncher': 'Disabled' },
    winlogonShell: 'explorer.exe',
    enabled: false,
    defaultShell: { shell: 'cmd.exe', defaultAction: 0 },
    custom: null,
  };
  const settled: ShellSnapshot = { ...reference, features: { 'Client-DeviceLockdown': 'Enabled', 'Client-EmbeddedShellLauncher': 'Enabled' }, custom: SETTING, enabled: true, defaultShell: { shell: 'explorer.exe', defaultAction: 0 } };
  const after: ShellSnapshot = { features: { 'Client-DeviceLockdown': 'DisablePending', 'Client-EmbeddedShellLauncher': 'Enabled' }, winlogonShell: SIMULATED_LAUNCHER_HOST };
  const items = restoreDifferences(reference, settled, after).map((d) => d.item).sort();
  assert.deepEqual(items, ['custom', 'defaultShell', 'enabled', 'features', 'winlogonShell']);
  // « En attente du redémarrage » compte pour l'état final ; Shell Launcher illisible avant n'est pas jugé.
  const ok: ShellSnapshot = { features: { 'Client-DeviceLockdown': 'DisablePending', 'Client-EmbeddedShellLauncher': 'Disabled' }, winlogonShell: 'Explorer.exe' };
  assert.deepEqual(restoreDifferences({ features: reference.features, winlogonShell: 'explorer.exe' }, undefined, ok), []);
  // Shell Launcher en service avant mais illisible après : non vérifié, donc signalé.
  assert.deepEqual(restoreDifferences(reference, undefined, ok).map((d) => d.item), ['enabled']);
});

// ---------------------------------------------------------------------------
// Le vrai script, sur une couche système simulée

/** Noms qui n'existent que dans la vraie couche système : aucun ne doit rester dans le script d'essai. */
const SYSTEM_CALLS = /Get-WindowsOptionalFeature|Enable-WindowsOptionalFeature|Disable-WindowsOptionalFeature|wmiclass|Get-CimInstance|Invoke-CimMethod|Set-ItemProperty|Remove-ItemProperty|New-ItemProperty|Get-ItemProperty|HKLM:|HKCU:|reg(\.exe)?\s+(add|delete)|dism/i;

/** Couche système en mémoire : l'état de Windows simulé, lu et réécrit dans un fichier JSON. */
function fakeLayer(stateFile: string): string {
  return String.raw`
$FakeFile = '${stateFile.replace(/'/g, "''")}'
$Fake = [System.IO.File]::ReadAllText($FakeFile) | ConvertFrom-Json
function Sys-Fail([string]$op) { if ($Fake.failOn -eq $op) { throw "$op failed (simulated)" } }
function Sys-FeatureState([string]$name) { $v = $Fake.features.$name; if ($null -eq $v) { 'Absent' } else { "$v" } }
function Sys-EnableFeatures([string[]]$names) { Sys-Fail 'EnableFeatures'; foreach ($n in $names) { $Fake.features.$n = $(if ($Fake.restartOnEnable) { 'EnablePending' } else { 'Enabled' }) }; if (-not $Fake.restartOnEnable) { $Fake.wesl = $true }; [bool]$Fake.restartOnEnable }
function Sys-DisableFeature([string]$name) { Sys-Fail 'DisableFeature'; $Fake.features.$name = 'Disabled'; if ($name -eq 'Client-EmbeddedShellLauncher') { $Fake.wesl = $false }; $false }
function Sys-GetWinlogonShell { $Fake.winlogonShell }
function Sys-SetWinlogonShell($value) { Sys-Fail 'SetWinlogonShell'; $Fake.winlogonShell = $value }
function Sys-WeslAvailable { [bool]$Fake.wesl }
function Sys-IsEnabled { [bool]$Fake.enabled }
function Sys-SetEnabled([bool]$on) { Sys-Fail 'SetEnabled'; $Fake.enabled = $on; $Fake.winlogonShell = $(if ($on) { '${SIMULATED_LAUNCHER_HOST}' } else { 'explorer.exe' }) }
function Sys-GetDefaultShell { if ($null -eq $Fake.defaultShell) { return $null }; [ordered]@{ shell = "$($Fake.defaultShell.shell)"; defaultAction = [int]$Fake.defaultShell.defaultAction } }
function Sys-SetDefaultShell([string]$shell, [int]$action) { Sys-Fail 'SetDefaultShell'; $Fake.defaultShell = [pscustomobject]@{ shell = $shell; defaultAction = $action } }
function Sys-GetCustomShell([string]$sid) {
  $c = $Fake.customs.$sid
  if ($null -eq $c) { return $null }
  [ordered]@{ shell = "$($c.shell)"; defaultAction = [int]$c.defaultAction; returnCodes = @(@($c.returnCodes) | ForEach-Object { [int]$_ }); returnActions = @(@($c.returnActions) | ForEach-Object { [int]$_ }) }
}
function Sys-SetCustomShell([string]$sid, [string]$shell, [int[]]$codes, [int[]]$actions, [int]$action) {
  Sys-Fail 'SetCustomShell'
  $v = [pscustomobject]@{ shell = $shell; defaultAction = $action; returnCodes = @($codes); returnActions = @($actions) }
  $Fake.customs.PSObject.Properties.Remove($sid)
  $Fake.customs | Add-Member -NotePropertyName $sid -NotePropertyValue $v
}
function Sys-RemoveCustomShell([string]$sid) { Sys-Fail 'RemoveCustomShell'; $Fake.customs.PSObject.Properties.Remove($sid) }
function Sys-End { [System.IO.File]::WriteAllText($FakeFile, ($Fake | ConvertTo-Json -Depth 8), (New-Object System.Text.UTF8Encoding $false)) }
`;
}

/** Fait tourner le vrai script sur la couche simulée ; rend son résultat et l'état final. */
async function runScript(start: SimulatedWindows, run: ElevatedRun): Promise<{ windows: SimulatedWindows; outcome: ElevatedOutcome }> {
  const dir = tmp();
  const stateFile = path.join(dir, 'windows.json');
  const resultFile = path.join(dir, 'resultat.json');
  const scriptFile = path.join(dir, 'script.ps1');
  fs.writeFileSync(stateFile, JSON.stringify(start));
  const script = elevatedScript(run, resultFile, fakeLayer(stateFile));
  // Garde-fou : le script d'essai n'appelle rien de Windows.
  assert.doesNotMatch(script, SYSTEM_CALLS);
  fs.writeFileSync(scriptFile, '\ufeff' + script, 'utf8');
  const ps = await new Promise<{ status: number | null; output: string }>((resolve) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptFile], { windowsHide: true });
    let output = '';
    child.stdout.on('data', (d) => (output += d));
    child.stderr.on('data', (d) => (output += d));
    child.on('close', (status) => resolve({ status, output }));
  });
  assert.equal(ps.status, 0, ps.output);
  const outcome = readElevatedOutcome(resultFile);
  assert.ok(outcome, `résultat illisible : ${ps.output}`);
  return { windows: JSON.parse(fs.readFileSync(stateFile, 'utf8')) as SimulatedWindows, outcome };
}

/** Ce qui compte de l'état simulé, dans une forme comparable. */
function comparable(w: SimulatedWindows) {
  return JSON.parse(JSON.stringify({ ...w, failOn: w.failOn ?? null, restartOnEnable: Boolean(w.restartOnEnable) }));
}

const windowsOnly = process.platform === 'win32' ? test : test.skip;

windowsOnly('le vrai script et la simulation font exactement la même chose', async () => {
  const cases: [string, SimulatedWindows, ElevatedRun][] = [];
  for (const [name, start] of Object.entries(STARTS)) {
    cases.push([`${name}, activer`, start, { kind: 'activate', sid: SID, setting: SETTING }]);
    const { active, reference } = roundTrip(start);
    cases.push([`${name}, désactiver`, active, { kind: 'deactivate', sid: SID, reference }]);
  }
  cases.push(['échec en route', { ...freshWindows(), failOn: 'SetCustomShell' }, { kind: 'activate', sid: SID, setting: SETTING }]);
  cases.push(['Windows Pro', { ...freshWindows(), features: {} }, { kind: 'activate', sid: SID, setting: SETTING }]);
  const reals = await Promise.all(cases.map(([, start, run]) => runScript(start, run)));
  for (const [i, [name, start, run]] of cases.entries()) {
    const real = reals[i]!;
    const simulated = simulateRun(start, run);
    assert.deepEqual(comparable(real.windows), comparable(simulated.windows), `${name} : état final`);
    const { log: realLog, ...realOutcome } = real.outcome;
    const { log: simulatedLog, ...simulatedOutcome } = simulated.outcome;
    assert.deepEqual(JSON.parse(JSON.stringify(realOutcome)), JSON.parse(JSON.stringify(simulatedOutcome)), `${name} : résultat`);
    assert.deepEqual(realLog, simulatedLog, `${name} : journal`);
  }
});

test('le script réel n’écrit que dans Shell Launcher, les fonctions facultatives et la valeur Shell de Winlogon', () => {
  const writes = [...REAL_SYSTEM_LAYER.matchAll(/(Enable-WindowsOptionalFeature|Disable-WindowsOptionalFeature|Set-ItemProperty|Remove-ItemProperty|\.Set\w+\(|\.Remove\w+\()/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(writes)].sort(), ['.RemoveCustomShell(', '.SetCustomShell(', '.SetDefaultShell(', '.SetEnabled(', 'Disable-WindowsOptionalFeature', 'Enable-WindowsOptionalFeature', 'Remove-ItemProperty', 'Set-ItemProperty']);
  for (const line of REAL_SYSTEM_LAYER.split('\n').filter((l) => /ItemProperty -Path/.test(l) && !/Get-ItemProperty/.test(l))) assert.match(line, /\$WinlogonKey -Name Shell/);
  // Les valeurs viennent du script : chaînes entre apostrophes, objets en JSON.
  const script = elevatedScript({ kind: 'activate', sid: "S-1-5-21-0'; Remove-Item C:\\ -Recurse; '", setting: SETTING }, "C:\\x'y\\r.json");
  assert.match(script, /\$Sid = 'S-1-5-21-0''; Remove-Item C:\\ -Recurse; '''/);
  assert.match(script, /\$ResultFile = 'C:\\x''y\\r\.json'/);
});
