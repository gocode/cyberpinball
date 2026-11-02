// Réglages de Windows de la borne (windowssettings.ts) : Cyber Pinball à la place du bureau
// sans Shell Launcher (Windows Pro et Famille), ou lancé au démarrage, le bureau masqué. Ces
// tests ne touchent jamais Windows :
// - la logique du vrai script tourne dans PowerShell sur une couche système simulée (un
//   fichier JSON), et doit rendre exactement ce que rend simulateSettingsRun ;
// - installer puis désactiver remet chaque réglage tel qu'il était, valeur absente comprise ;
// - une écriture qui échoue en route remet l'état d'avant d'elle-même.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { HANDOVER_EXIT_CODE } from '../dedicated';
import {
  commandLine,
  freshSettings,
  modeOf,
  needsElevation,
  readSettingsOutcome,
  REAL_SETTINGS_LAYER,
  referenceFor,
  settingsDifferences,
  settingsScript,
  settingValueLabel,
  simulateSettingsRun,
  SUPERVISOR_FLAG,
  SUPERVISOR_LOOP_LIMIT,
  SUPERVISOR_LOOP_MS,
  supervisorVerdict,
  wantedSettings,
  type SettingsOutcome,
  type SettingsRun,
  type SimulatedSettings,
} from '../windowssettings';

const SID = 'S-1-5-21-1111111111-2222222222-3333333333-1001';
const EXE = 'D:\\CyberPinball\\app\\CyberPinball.exe';
const STARTUP = 'D:\Borne\Démarrage';

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cp-reglages-'));
}

function run(want: SettingsRun['want']): SettingsRun {
  return { sid: SID, startupDir: STARTUP, want };
}

test('les deux façons : le surveillant comme shell du compte (UAC), ou le raccourci et le bureau masqué (sans UAC)', () => {
  assert.deepEqual(wantedSettings('shell', [EXE]), { shell: `${EXE} ${SUPERVISOR_FLAG}` });
  assert.deepEqual(wantedSettings('shell', ['C:\\Program Files\\Cyber Pinball\\CyberPinball.exe']).shell, `"C:\\Program Files\\Cyber Pinball\\CyberPinball.exe" ${SUPERVISOR_FLAG}`);
  assert.deepEqual(wantedSettings('startup', [EXE]), { startup: EXE, wallpaper: '', background: '0 0 0', icons: 1 });
  assert.ok(needsElevation(wantedSettings('shell', [EXE])));
  assert.ok(!needsElevation(wantedSettings('startup', [EXE])));
  assert.equal(commandLine(['a b.exe', '--x']), '"a b.exe" --x');
  assert.equal(modeOf({ shell: `${EXE} ${SUPERVISOR_FLAG}` }), 'shell');
  assert.equal(modeOf({ shell: 'C:\\Autre\\menu.exe', startup: EXE }), 'startup');
  assert.equal(modeOf({ shell: null, startup: null }), undefined);
});

test('le surveillant relance Cyber Pinball, s’arrête pour une mise à jour, rend la main à l’Explorateur s’il plante en boucle', () => {
  const now = 1_000_000;
  assert.equal(supervisorVerdict(0, [now], now), 'relaunch');
  assert.equal(supervisorVerdict(1, [now], now), 'relaunch', 'plantage');
  assert.equal(supervisorVerdict(null, [now], now), 'relaunch', 'tué');
  assert.equal(supervisorVerdict(HANDOVER_EXIT_CODE, [now], now), 'stop');
  const loop = Array.from({ length: SUPERVISOR_LOOP_LIMIT }, (_, i) => now - i * 1000);
  assert.equal(supervisorVerdict(1, loop, now), 'explorer');
  const spread = Array.from({ length: SUPERVISOR_LOOP_LIMIT }, (_, i) => now - i * SUPERVISOR_LOOP_MS);
  assert.equal(supervisorVerdict(1, spread, now), 'relaunch', 'des sorties espacées ne sont pas une boucle');
});

const STARTS: Record<string, SimulatedSettings> = {
  'compte tel que Windows le crée': freshSettings(),
  'raccourci de l’installeur, fond et icônes réglés': { values: { shell: null, startup: EXE, wallpaper: 'D:\\Photos\\flipper.jpg', background: '10 20 30', icons: 0 } },
  'un autre shell déjà réglé pour ce compte': { values: { shell: 'C:\\Ancien\\menu.exe', startup: null, wallpaper: '', background: '0 0 0', icons: 1 } },
};

for (const [name, start] of Object.entries(STARTS)) {
  for (const mode of ['shell', 'startup'] as const) {
    test(`installer puis désactiver remet chaque réglage tel qu’il était : ${name}, ${mode}`, () => {
      const want = wantedSettings(mode, [EXE]);
      const installed = simulateSettingsRun(start, run(want));
      assert.equal(installed.outcome.status, 'done', installed.outcome.error);
      assert.deepEqual(settingsDifferences(want, installed.outcome.after), []);
      const reference = referenceFor(want, installed.outcome.before!);
      assert.deepEqual(Object.keys(reference).sort(), Object.keys(want).sort(), 'la sauvegarde ne porte que sur ce qui change');
      // Les réglages que la façon ne touche pas restent tels quels.
      for (const k of Object.keys(start.values) as (keyof SimulatedSettings['values'])[]) if (!(k in want)) assert.equal(installed.windows.values[k], start.values[k], k);
      const back = simulateSettingsRun(installed.windows, run(reference));
      assert.equal(back.outcome.status, 'done');
      assert.deepEqual(settingsDifferences(reference, back.outcome.after), []);
      assert.deepEqual(back.windows, start);
    });
  }
}

test('une écriture qui échoue en route remet l’état d’avant d’elle-même', () => {
  for (const failOn of ['wallpaper', 'background', 'icons'] as const) {
    // Fond d'une autre couleur : chaque réglage a bien quelque chose à écrire.
    const start: SimulatedSettings = { values: { ...freshSettings().values, background: '10 20 30' }, failOn };
    const { windows, outcome } = simulateSettingsRun(start, run(wantedSettings('startup', [EXE])));
    assert.equal(outcome.status, 'failed');
    assert.ok(outcome.rolledBack, outcome.rollbackError);
    assert.deepEqual(windows, start, failOn);
  }
});

test('le jugement voit chaque différence, et rien quand tout est là', () => {
  const want = wantedSettings('startup', [EXE]);
  assert.deepEqual(settingsDifferences(want, { startup: EXE.toLowerCase(), wallpaper: '', background: '0 0 0', icons: 1 }), []);
  assert.deepEqual(settingsDifferences(want, { startup: null, wallpaper: '', background: '0 0 0', icons: 0 }).map((d) => d.key), ['startup', 'icons']);
  assert.deepEqual(settingsDifferences({ shell: null }, { shell: null }), []);
  assert.deepEqual(settingsDifferences({ shell: null }, undefined), []);
  assert.deepEqual(settingsDifferences({ wallpaper: '' }, { wallpaper: null }).map((d) => d.key), ['wallpaper'], 'vide n’est pas absent');
  assert.equal(settingValueLabel('shell', null), 'Explorateur Windows (aucun réglage)');
  assert.equal(settingValueLabel('shell', `"C:\\Program Files\\x\\CyberPinball.exe" ${SUPERVISOR_FLAG}`), 'CyberPinball.exe');
});

// ---------------------------------------------------------------------------
// Le vrai script, sur une couche système simulée

/** Noms qui n'existent que dans la vraie couche système : aucun ne doit rester dans le script d'essai. */
const SYSTEM_CALLS = /ItemProperty|WScript\.Shell|Remove-Item|New-Item|Registry::|HKCU:|HKLM:|reg(\.exe)?\s+(add|delete)/i;

function fakeLayer(stateFile: string): string {
  return String.raw`
$FakeFile = '${stateFile.replace(/'/g, "''")}'
$Fake = [System.IO.File]::ReadAllText($FakeFile) | ConvertFrom-Json
function Sys-Get([string]$k) { $Fake.values.$k }
function Sys-Set([string]$k, $value) { if ($Fake.failOn -eq $k) { throw "$k failed (simulated)" }; $Fake.values.$k = $value }
function Sys-End { [System.IO.File]::WriteAllText($FakeFile, ($Fake | ConvertTo-Json -Depth 6), (New-Object System.Text.UTF8Encoding $false)) }
`;
}

async function runScript(start: SimulatedSettings, settingsRun: SettingsRun): Promise<{ windows: SimulatedSettings; outcome: SettingsOutcome }> {
  const dir = tmp();
  const stateFile = path.join(dir, 'windows.json');
  const resultFile = path.join(dir, 'resultat.json');
  const scriptFile = path.join(dir, 'script.ps1');
  fs.writeFileSync(stateFile, JSON.stringify({ failOn: null, ...start }));
  const script = settingsScript(settingsRun, resultFile, fakeLayer(stateFile));
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
  const outcome = readSettingsOutcome(resultFile);
  assert.ok(outcome, `résultat illisible : ${ps.output}`);
  const windows = JSON.parse(fs.readFileSync(stateFile, 'utf8')) as SimulatedSettings & { failOn: string | null };
  return { windows: { values: windows.values, ...(windows.failOn ? { failOn: windows.failOn as SimulatedSettings['failOn'] } : {}) }, outcome };
}

const windowsOnly = process.platform === 'win32' ? test : test.skip;

windowsOnly('le vrai script et la simulation font exactement la même chose', async () => {
  const cases: [string, SimulatedSettings, SettingsRun][] = [];
  for (const [name, start] of Object.entries(STARTS)) {
    cases.push([`${name}, relevé`, start, run({})]);
    for (const mode of ['shell', 'startup'] as const) {
      const want = wantedSettings(mode, [EXE]);
      cases.push([`${name}, ${mode}`, start, run(want)]);
      const installed = simulateSettingsRun(start, run(want));
      cases.push([`${name}, ${mode}, désactiver`, installed.windows, run(referenceFor(want, installed.outcome.before!))]);
    }
  }
  cases.push(['échec en route', { ...freshSettings(), failOn: 'icons' }, run(wantedSettings('startup', [EXE]))]);
  const reals = await Promise.all(cases.map(([, start, r]) => runScript(start, r)));
  for (const [i, [name, start, r]] of cases.entries()) {
    const real = reals[i]!;
    const simulated = simulateSettingsRun(start, r);
    assert.deepEqual(real.windows, JSON.parse(JSON.stringify(simulated.windows)), `${name} : état final`);
    assert.deepEqual(JSON.parse(JSON.stringify(real.outcome)), JSON.parse(JSON.stringify(simulated.outcome)), `${name} : résultat`);
  }
});

test('le script réel n’écrit que la stratégie Shell, le fond, les icônes du compte et le raccourci du dossier Démarrage', () => {
  const keys = [...REAL_SETTINGS_LAYER.matchAll(/key = "\$Hive\\([^"]+)"; name = '(\w+)'/g)].map((m) => `${m[1]}\\${m[2]}`).sort();
  assert.deepEqual(keys, [
    'Control Panel\\Colors\\Background',
    'Control Panel\\Desktop\\WallPaper',
    'Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced\\HideIcons',
    'Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\System\\Shell',
  ]);
  // Toujours dans la ruche du compte de la borne, jamais celle de la machine.
  assert.match(REAL_SETTINGS_LAYER, /\$Hive = "Registry::HKEY_USERS\\\$Sid"/);
  assert.doesNotMatch(REAL_SETTINGS_LAYER, /HKLM|HKEY_LOCAL_MACHINE/);
  // Le seul fichier écrit ou supprimé : le raccourci du dossier Démarrage.
  for (const line of REAL_SETTINGS_LAYER.split('\n').filter((l) => /Remove-Item |\.Save\(\)/.test(l))) assert.match(line, /\$Shortcut|\$l\.Save\(\)/);
  assert.match(REAL_SETTINGS_LAYER, /\$Shortcut = Join-Path \$StartupDir 'Cyber Pinball\.lnk'/);
  // Les valeurs viennent du script : chaînes entre apostrophes, objets en JSON.
  const script = settingsScript({ sid: "S-1-5-21-0'; Remove-Item C:\\ -Recurse; '", startupDir: "C:\\x'y", want: {} }, 'C:\\r.json');
  assert.match(script, /\$Sid = 'S-1-5-21-0''; Remove-Item C:\\ -Recurse; '''/);
  assert.match(script, /\$StartupDir = 'C:\\x''y'/);
});
