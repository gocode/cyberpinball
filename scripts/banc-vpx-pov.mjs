// Regression of legacy automatic POV imports in VPX 5436. Run through banc-vpx-pov.ps1:
// a copy of the bundled stripped table, isolated preferences, no ROM, no original file modified.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const options = process.argv.slice(2);
const value = (name) => options[options.indexOf(name) + 1];
const vpx = options.includes('--vpx') && path.resolve(value('--vpx'));
const exe = options.includes('--exe') ? path.resolve(value('--exe')) : path.join(repo, 'build', 'vpx-corrige', 'VPinballX_BGFX64.exe');
if (!vpx || !fs.existsSync(exe)) throw new Error('Usage: banc-vpx-pov.ps1 -Vpx <VPX 5436 folder> [-Exe <patched executable>]');
if (process.env.CYBERPINBALL_BANC_POV_HIDDEN !== '1') throw new Error('Run through banc-vpx-pov.ps1 on the hidden desktop');
fs.mkdirSync(path.join(repo, 'tmp'), { recursive: true });
const work = fs.mkdtempSync(path.join(repo, 'tmp', 'banc-vpx-pov-'));
const runExe = path.join(work, 'vpx');
fs.mkdirSync(runExe);
// -Pov only loads and exports settings. It does not start plugins or a game; the DLLs must
// nevertheless sit next to the executable for Windows to load it.
for (const entry of fs.readdirSync(vpx, { withFileTypes: true })) {
  if (entry.isFile() && /\.dll$/i.test(entry.name)) fs.copyFileSync(path.join(vpx, entry.name), path.join(runExe, entry.name));
}
const program = path.join(runExe, 'VPinballX_BGFX64.exe');
fs.copyFileSync(exe, program);
const tableSource = path.join(vpx, 'assets', 'strippedTable.vpx');
const cases = [
  { name: 'without-pov' },
  { name: 'named-pov', file: 'probe.pov', xml: '<POV><fullscreen><fov>41</fov></fullscreen></POV>' },
  { name: 'automatic-pov', file: 'autopov.pov', xml: '<POV><fullscreen><fov>42</fov></fullscreen></POV>' },
  { name: 'empty-legacy-fields', file: 'probe.pov', xml: '<POV><customsettings><FPSLimiter/><OverwriteDetailsLevel/><OverwriteNightDay/></customsettings></POV>' },
  { name: 'invalid-legacy-fields', file: 'probe.pov', xml: '<POV><customsettings><FPSLimiter>bad</FPSLimiter><OverwriteDetailsLevel>bad</OverwriteDetailsLevel><OverwriteNightDay>bad</OverwriteNightDay></customsettings></POV>' },
  { name: 'valid-legacy-fields', file: 'probe.pov', xml: '<POV><customsettings><FPSLimiter>60</FPSLimiter><OverwriteDetailsLevel>1</OverwriteDetailsLevel><DetailsLevel>6</DetailsLevel><OverwriteNightDay>1</OverwriteNightDay><NightDayLevel>75</NightDayLevel></customsettings></POV>', settings: { MaxFramerate: 60, AlphaRampAccuracy: 6, EmissionScale: 0.75 } },
];
const results = [];
for (const scenario of cases) {
  const dir = path.join(work, scenario.name);
  const prefs = path.join(dir, 'prefs');
  fs.mkdirSync(prefs, { recursive: true });
  const table = path.join(dir, 'probe.vpx');
  fs.copyFileSync(tableSource, table);
  if (scenario.file) fs.writeFileSync(path.join(dir, scenario.file), scenario.xml);
  const ini = path.join(dir, 'global.ini');
  fs.writeFileSync(ini, '[Editor]\r\nEnableLog=1\r\n');
  const child = spawn(program, ['-PrefPath', prefs, '-Ini', ini, '-Pov', table], { cwd: runExe, windowsHide: true, stdio: 'ignore' });
  let timer;
  const code = await new Promise((resolve, reject) => {
    timer = setTimeout(() => { child.kill(); reject(new Error(`${scenario.name}: VPX did not exit within 30 s`)); }, 30000);
    child.once('error', reject);
    child.once('exit', resolve);
  }).finally(() => clearTimeout(timer));
  const exportedPath = path.join(dir, 'probe.ini');
  const exported = fs.existsSync(exportedPath) ? fs.readFileSync(exportedPath, 'utf8') : '';
  const result = { name: scenario.name, code, exported: Boolean(exported) };
  results.push(result);
  fs.writeFileSync(path.join(work, 'results.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(result));
  assert.equal(code, 0, `${scenario.name}: no crash while loading an automatic POV`);
  assert.ok(exported, `${scenario.name}: table settings exported`);
  const number = (key) => Number(new RegExp(`^${key}\\s*=\\s*([^\\r\\n]+)`, 'm').exec(exported)?.[1]);
  if (scenario.file) assert.equal(fs.readFileSync(path.join(dir, scenario.file), 'utf8'), scenario.xml, 'the original POV is untouched');
  for (const [key, expected] of Object.entries(scenario.settings ?? {})) assert.equal(number(key), expected, `${scenario.name}: ${key} preserved`);
}
console.log(`VPX automatic POV imports: ${results.length} cases passed. Results: ${work}`);
