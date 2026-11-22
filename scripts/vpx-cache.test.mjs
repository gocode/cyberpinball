import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { filesFingerprint, matchingBuild, saveBuild } from './vpx-cache.mjs';

test('VPX : seul un couple exécutable/PuP intact avec toutes ses entrées identiques est réutilisable', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-vpx-cache-'));
  try {
    const inputs = path.join(dir, 'sources');
    fs.mkdirSync(inputs);
    const source = path.join(inputs, 'table.cpp');
    fs.writeFileSync(source, 'source');
    const outputs = ['vpx.exe', 'pup.dll'].map((name) => path.join(dir, name));
    for (const file of outputs) fs.writeFileSync(file, 'compiled');
    const certificate = path.join(dir, 'build.json');
    const fingerprint = () => filesFingerprint([inputs]);
    assert.equal(matchingBuild(certificate, fingerprint(), outputs), false);
    saveBuild(certificate, fingerprint(), outputs, fs.writeFileSync);
    assert.equal(matchingBuild(certificate, fingerprint(), outputs), true);
    // Une modification de même taille ne se voit pas par la présence ou la taille du fichier.
    for (const file of outputs) {
      fs.writeFileSync(file, 'tampered');
      assert.equal(matchingBuild(certificate, fingerprint(), outputs), false);
      fs.writeFileSync(file, 'compiled');
    }
    fs.writeFileSync(source, 'change');
    assert.equal(matchingBuild(certificate, fingerprint(), outputs), false);
    fs.writeFileSync(source, 'source');
    fs.writeFileSync(path.join(inputs, 'added.h'), 'new dependency');
    assert.equal(matchingBuild(certificate, fingerprint(), outputs), false);
    fs.rmSync(path.join(inputs, 'added.h'));
    fs.rmSync(outputs[1]);
    assert.equal(matchingBuild(certificate, fingerprint(), outputs), false);
    fs.writeFileSync(certificate, '{');
    assert.equal(matchingBuild(certificate, fingerprint(), outputs), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('VPX : une DLL du compilateur modifiée invalide les entrées même si cl.exe reste identique', () => {
  const tools = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-vpx-tools-'));
  try {
    const driver = path.join(tools, 'cl.exe');
    const compiler = path.join(tools, 'c1xx.dll');
    fs.writeFileSync(driver, 'driver');
    fs.writeFileSync(compiler, 'version1');
    const before = filesFingerprint([tools]);
    fs.writeFileSync(compiler, 'version2');
    assert.equal(fs.readFileSync(driver, 'utf8'), 'driver');
    assert.notEqual(filesFingerprint([tools]), before);
  } finally {
    fs.rmSync(tools, { recursive: true, force: true });
  }
});
