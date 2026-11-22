import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { parseXml } from '../dof';
import { ensureVpxClr, vpxClrConfig } from '../vpxclr';

test('CLR : moteur moderne pour tous les anciens objets COM, configuration stable', () => {
  for (const source of [undefined, '<configuration/>', '<configuration>\n</configuration>', '<configuration><startup /></configuration>']) {
    const result = vpxClrConfig(source);
    const startup = parseXml(result).children[0]!.children.find((node) => node.name === 'startup')!;
    assert.equal(startup.attrs.useLegacyV2RuntimeActivationPolicy, 'true');
    assert.equal(startup.children[0]!.attrs.version, 'v4.0');
    assert.equal(vpxClrConfig(result), result);
  }
});

test('CLR : commentaires, sections et attributs existants préservés, CLR4 préféré à CLR2', () => {
  const other = '<runtime><assemblyBinding xmlns="urn:schemas-microsoft-com:asm.v1" /></runtime>';
  const comment = '<!-- <startup><supportedRuntime version="v2.0.50727" /></startup> -->';
  const source = `<?xml version="1.0"?>\r\n<configuration>${comment}${other}<startup useLegacyV2RuntimeActivationPolicy='false' other="keep"><supportedRuntime version="v2.0.50727"/><supportedRuntime version="v4.0"/><!-- keep --></startup></configuration>`;
  const result = vpxClrConfig(source);
  assert.ok(result.includes(other));
  assert.ok(result.includes(comment));
  assert.ok(result.includes('other="keep"'));
  assert.ok(result.includes('<!-- keep -->'));
  const startup = parseXml(result).children[0]!.children.find((node) => node.name === 'startup')!;
  assert.deepEqual(startup.children.map((node) => node.attrs.version), ['v4.0', 'v2.0.50727']);
  assert.equal(vpxClrConfig(result), result);
  assert.ok(!/(?<!\r)\n/.test(result), 'fins de ligne conservées');
  const quoted = '<configuration><startup note="useLegacyV2RuntimeActivationPolicy=\'false\'"><supportedRuntime version="v2.0.50727"/></startup></configuration>';
  const merged = vpxClrConfig(quoted);
  const attributes = parseXml(merged).children[0]!.children[0]!.attrs;
  assert.equal(attributes.note, "useLegacyV2RuntimeActivationPolicy='false'");
  assert.equal(attributes.useLegacyV2RuntimeActivationPolicy, 'true');
});

test('CLR : fichier invalide ou trop grand laissé entier, écritures atomiques et idempotentes', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-clr-config-'));
  try {
    const exe = path.join(dir, 'VPX.exe');
    const file = `${exe}.config`;
    fs.writeFileSync(exe, 'fake executable');
    assert.equal(ensureVpxClr(exe), true);
    const first = fs.statSync(file).mtimeMs;
    assert.equal(ensureVpxClr(exe), false);
    assert.equal(fs.statSync(file).mtimeMs, first);
    for (const bad of ['<configuration><startup></configuration>', '<configuration><broken attr=bad /></configuration>', '<configuration><startup/><startup/></configuration>', '<configuration>' + ' '.repeat(1024 * 1024) + '</configuration>']) {
      fs.writeFileSync(file, bad);
      assert.throws(() => ensureVpxClr(exe));
      assert.equal(fs.readFileSync(file, 'utf8'), bad);
    }
    assert.throws(() => ensureVpxClr(path.join(dir, 'absent.exe')));
    assert.ok(!fs.existsSync(path.join(dir, 'absent.exe.config')));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('CLR : configuration UTF16 existante conservée dans son encodage', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-clr-utf16-'));
  try {
    const exe = path.join(dir, 'VPX.exe');
    fs.writeFileSync(exe, 'fake executable');
    fs.writeFileSync(`${exe}.config`, String.fromCharCode(0xfeff) + '<?xml version="1.0" encoding="utf-16"?><configuration><!-- réglages --></configuration>', 'utf16le');
    assert.equal(ensureVpxClr(exe), true);
    const data = fs.readFileSync(`${exe}.config`);
    assert.deepEqual([...data.subarray(0, 2)], [255, 254]);
    assert.ok(data.toString('utf16le').includes('<!-- réglages -->'));
    assert.equal(ensureVpxClr(exe), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('CLR exécuté : vraies collections .NET utilisables depuis un hôte VBScript natif', { skip: process.platform !== 'win32' }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-clr-host-'));
  try {
    // Copie d'un hôte natif dans un dossier d'essai : aucun réglage de Windows n'est modifié.
    const exe = path.join(dir, 'native-host.exe');
    fs.copyFileSync(path.join(process.env.SystemRoot!, 'System32', 'cscript.exe'), exe);
    ensureVpxClr(exe);
    const script = [
      'Option Explicit',
      'Dim list, queue, stack, sorted, table, item, count',
      'Set list = CreateObject("System.Collections.ArrayList")',
      'list.Add "z" : list.Add "a" : list.Sort',
      'count = 0',
      'For Each item In list : count = count + 1 : Next',
      'WScript.Echo list(0) & ":" & list(1) & ":" & list.Count & ":" & count',
      'Set queue = CreateObject("System.Collections.Queue")',
      'queue.Enqueue "queue" : WScript.Echo queue.Dequeue()',
      'Set stack = CreateObject("System.Collections.Stack")',
      'stack.Push "stack" : WScript.Echo stack.Pop()',
      'Set sorted = CreateObject("System.Collections.SortedList")',
      'sorted.Add "key", "sorted" : WScript.Echo sorted.Item("key")',
      'Set table = CreateObject("System.Collections.Hashtable")',
      'table.Add "key", "table" : WScript.Echo table.Item("key")',
    ].join('\r\n');
    const file = path.join(dir, 'probe.vbs');
    fs.writeFileSync(file, script, 'latin1');
    const result = spawnSync(exe, ['//NoLogo', '//E:vbscript', file], { encoding: 'latin1', windowsHide: true, timeout: 30_000 });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, '');
    assert.deepEqual(result.stdout.trim().split(/\r?\n/), ['a:z:2:2', 'queue', 'stack', 'sorted', 'table']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
