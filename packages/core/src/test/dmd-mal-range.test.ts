// Dossier du DMD rangé chez une autre table, et images du DMD qui ne se chargent pas (19/11/2026, une borne).
// Goldorak.UltraDMD avait été collé par erreur dans le dossier de Champions League ; le diagnostic le copiait comme pour
// une autre version de Goldorak. Et « Asset not loaded » du plugin FlexDMD vaut pour un fichier absent comme pour un
// fichier présent mais illisible. Invariants : copié depuis une autre version de la table qui le charge aussi, déplacé
// depuis une table qui ne le charge pas (et dit en une phrase) ; une image présente est dite illisible, pas absente.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { diagnose, scriptFacts } from '../doctor';
import { scanTables } from '../tables';
import { vpxWithScript } from './fixtures';

const LOADS = (name: string) => `Sub LoadUltraDMD\r\n  UltraDMD.SetProjectFolder curDir & "\\${name}.UltraDMD"\r\nEnd Sub\r\n`;

function setup(other: { folder: string; script: string }) {
  const tablesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-dmd-range-'));
  const mine = path.join(tablesDir, 'Goldorak (Original 2017)');
  fs.mkdirSync(mine, { recursive: true });
  fs.writeFileSync(path.join(mine, 'Goldorak_PUP.vpx'), vpxWithScript(LOADS('Goldorak')));
  const host = path.join(tablesDir, other.folder);
  fs.mkdirSync(path.join(host, 'Goldorak.UltraDMD'), { recursive: true });
  fs.writeFileSync(path.join(host, 'Goldorak.UltraDMD', 'black.jpg'), 'x');
  fs.writeFileSync(path.join(host, `${other.folder}.vpx`), vpxWithScript(other.script));
  const entry = scanTables(tablesDir).find((e) => e.folder === mine)!;
  const finding = diagnose(entry, { tablesDir, script: scriptFacts(LOADS('Goldorak')) }).find((f) => f.code === 'dmdFolderMissing');
  return { tablesDir, finding };
}

test('dossier du DMD chez une autre version de la table : copié', () => {
  const { tablesDir, finding } = setup({ folder: 'Goldorak (Original 2017) sans PuP', script: LOADS('Goldorak') });
  try {
    assert.equal(finding?.fix?.ops[0]?.op, 'copy');
    assert.match(finding?.detail ?? '', /dans le dossier de « Goldorak \(Original 2017\) sans PuP »/);
  } finally {
    fs.rmSync(tablesDir, { recursive: true, force: true });
  }
});

test('dossier du DMD chez une table qui ne le charge pas : déplacé, et dit', () => {
  const { tablesDir, finding } = setup({ folder: 'Champions League - Season 2023 (Original 2023)', script: LOADS('UEFA') });
  try {
    assert.equal(finding?.fix?.ops[0]?.op, 'move');
    assert.match(finding?.detail ?? '', /« Goldorak\.UltraDMD » était dans le dossier de « Champions League - Season 2023 \(Original 2023\) », qui ne le charge pas/);
  } finally {
    fs.rmSync(tablesDir, { recursive: true, force: true });
  }
});

test('image du DMD présente mais refusée par le plugin : illisible, pas absente', () => {
  const tablesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-dmd-illisible-'));
  try {
    const folder = path.join(tablesDir, 'Goldorak (Original 2017)');
    const dmd = path.join(folder, 'Goldorak.UltraDMD');
    fs.mkdirSync(dmd, { recursive: true });
    const vpx = path.join(folder, 'Goldorak_PUP.vpx');
    fs.writeFileSync(vpx, vpxWithScript(LOADS('Goldorak')));
    fs.writeFileSync(path.join(dmd, 'DMD meta.gif'), 'pas un gif');
    const log = (files: string[]) =>
      [
        `2026-11-19 11:02:15.636 INFO  [Main] [PinTable::LoadGameFromFilename@1419] LoadGameFromFilename ${vpx}`,
        ...files.map((f) => `2026-11-19 11:02:17.356 ERROR [Main] [FlexDMD:Flex::AssetManager::Open@300] Asset not loaded: ${path.join(dmd, f)}`),
      ].join('\r\n');
    const entry = scanTables(tablesDir)[0]!;
    const unreadable = diagnose(entry, { tablesDir, vpxLog: log(['DMD meta.gif']) }).find((f) => f.code === 'dmdImagesMissing');
    assert.equal(unreadable?.title, 'Image du DMD illisible');
    assert.match(unreadable?.detail ?? '', /n’a pas su lire « DMD meta\.gif »/);
    const absent = diagnose(entry, { tablesDir, vpxLog: log(['DMD meta.gif', 'black.jpg']) }).find((f) => f.code === 'dmdImagesMissing');
    assert.equal(absent?.title, 'Image du DMD absente');
    assert.match(absent?.detail ?? '', /« black\.jpg »/);
  } finally {
    fs.rmSync(tablesDir, { recursive: true, force: true });
  }
});
