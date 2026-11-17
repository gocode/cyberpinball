// Tables reprises d'une autre installation avec leurs réglages (installation.ts, vpreg.ts). Un
// joueur venu de PinUP Popper, le 17/11/2026 : « les deux premières tables reprises, il a fallu les
// régler de nouveau ». VPX et PinMAME gardent hors du .vpx ce qu'une table a réglé : son .ini
// (déjà repris), les interrupteurs DIP de sa ROM (VPinMAME\cfg\<rom>.cfg) et ce que son script a
// enregistré (SaveValue, dans <VPX>\User\VPReg.stg, un stockage par table). Invariant : la table
// reprise emporte son .cfg et ses stockages de VPReg.stg, jamais ceux des autres tables.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { compareCfbNames, writeCompoundFile } from '../cfbwrite';
import { readVpReg } from '../highscores';
import { installationCompanions } from '../installation';
import { planImport } from '../tableimport';
import { CompoundFile } from '../vpxinfo';
import { vpRegStorageNames } from '../vpreg';

function write(file: string, data: string | Buffer = 'x'): string {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
  return file;
}

const value = (text: string) => Buffer.from(text, 'utf16le');
const TABLE = 'Guns N Roses (Data East 1994)';
const SCRIPT = [
  'Option Explicit',
  'Const cGameName = "gnr_300"',
  "' SaveValue \"Commentaire\", \"x\", 1",
  'Sub SaveOptions : SaveValue cGameName, "BallsPerGame", BallsPerGame : SaveValue "GNR_Options", "Colors", 2 : End Sub',
  'x = LoadValue(cGameName, "BallsPerGame")',
  '',
].join('\r\n');

/** Installation rangée à l'ancienne : VPX et son User\VPReg.stg, Tables à plat, VPinMAME à côté. */
function oldInstallation() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-reglages-'));
  const vpx = path.join(root, 'vPinball', 'VisualPinball');
  write(path.join(vpx, 'VPinballX64.exe'));
  write(
    path.join(vpx, 'User', 'VPReg.stg'),
    writeCompoundFile({
      storages: [
        { name: 'gnr_300', streams: [{ name: 'BallsPerGame', data: value('5') }, { name: 'HighScore1', data: value('120000000') }] },
        { name: 'GNR_Options', streams: [{ name: 'Colors', data: value('2') }] },
        { name: 'TheGoonies', streams: [{ name: 'HighScore1', data: value('9000') }] },
      ],
    }),
  );
  const tables = path.join(vpx, 'Tables');
  const table = write(path.join(tables, `${TABLE}.vpx`));
  write(path.join(tables, `${TABLE}.vbs`), SCRIPT);
  const vpm = path.join(vpx, 'VPinMAME');
  write(path.join(vpm, 'roms', 'gnr_300.zip'), 'rom');
  write(path.join(vpm, 'cfg', 'gnr_300.cfg'), 'dip switches');
  write(path.join(vpm, 'cfg', 'tmnt_104.cfg'), 'autre jeu');
  const own = path.join(root, 'CyberPinball');
  fs.mkdirSync(path.join(own, 'tables'), { recursive: true });
  return { root, vpx, table, own };
}

test('stockages de VPReg.stg nommés par le script : chaîne ou variable, jamais un commentaire', () => {
  assert.deepEqual(vpRegStorageNames(SCRIPT), ['gnr_300', 'GNR_Options']);
});

test('reprise : le .cfg de la ROM et les seuls stockages de la table dans son VPReg.stg', () => {
  const i = oldInstallation();
  const { sources, reports } = installationCompanions([{ path: i.table, mode: 'copy' }], () => ({ usesPinmame: true, roms: ['gnr_300'] }), [i.own]);
  const found = reports[0]!.found;
  assert.ok(found.some((c) => c.part === 'cfg' && path.basename(c.path) === 'gnr_300.cfg'), found.map((c) => c.part).join(', '));
  const vpreg = found.find((c) => c.part === 'vpreg');
  assert.deepEqual(vpreg?.storages, ['gnr_300', 'GNR_Options']);

  const plan = planImport(sources, { tablesDir: path.join(i.own, 'tables') });
  const tp = plan.tables[0]!;
  const to = tp.steps.map((s) => path.relative(tp.folder, s.to));
  for (const want of [path.join('pinmame', 'cfg', 'gnr_300.cfg'), 'user']) assert.ok(to.includes(want), `${want}\n${to.join('\n')}`);
  assert.ok(!to.some((f) => /tmnt_104/.test(f)), 'jamais le .cfg d’un autre jeu');

  // Le VPReg.stg préparé : les deux stockages de la table, leurs valeurs, rien de The Goonies.
  const user = tp.steps.find((s) => path.relative(tp.folder, s.to) === 'user')!.from;
  const reg = readVpReg(path.join(user, 'VPReg.stg'))!;
  assert.deepEqual([...reg.keys()].sort(), ['GNR_Options', 'gnr_300']);
  assert.equal(reg.get('gnr_300')!.get('BallsPerGame'), '5');
  assert.equal(reg.get('gnr_300')!.get('HighScore1'), '120000000');
  assert.equal(reg.get('GNR_Options')!.get('Colors'), '2');
  // L'installation d'origine n'est pas touchée.
  assert.equal(readVpReg(path.join(i.vpx, 'User', 'VPReg.stg'))!.size, 3);
  fs.rmSync(i.root, { recursive: true });
});

test('fichier composé écrit : arbre rouge-noir trié, gros flux hors du mini-flux, relu à l’identique', () => {
  const names = Array.from({ length: 23 }, (_, n) => `Key${n}`).concat(['a', 'Zz', 'HighScore10Name']);
  const big = Buffer.alloc(9000, 7);
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-cfb-')), 'VPReg.stg');
  fs.writeFileSync(file, writeCompoundFile({ storages: [{ name: 'T', streams: [...names.map((n) => ({ name: n, data: value(n) })), { name: 'Big', data: big }] }] }));
  const fd = fs.openSync(file, 'r');
  try {
    const cfb = new CompoundFile(fd);
    const [storage] = cfb.children(cfb.entries[0]!);
    const kids = cfb.children(storage!);
    // Parcours infixe = ordre de Windows (longueur, puis majuscules).
    assert.deepEqual(
      kids.map((k) => k.name),
      [...names, 'Big'].sort(compareCfbNames),
    );
    assert.ok(cfb.stream(kids.find((k) => k.name === 'Big')!).equals(big));
    for (const n of names) assert.equal(cfb.stream(kids.find((k) => k.name === n)!).toString('utf16le'), n);
    // Rouge-noir : pas deux rouges de suite, autant de noirs sur chaque chemin.
    const byIndex = cfb.entries;
    const raw = fs.readFileSync(file);
    const colorOf = (index: number) => raw[cfb.entryOffset(byIndex[index]!) + 0x43];
    const blackHeights = new Set<number>();
    const walk = (index: number, blacks: number, parentRed: boolean) => {
      if (index === 0xffffffff) return void blackHeights.add(blacks);
      const red = colorOf(index) === 0;
      assert.ok(!(red && parentRed), 'deux rouges de suite');
      walk(byIndex[index]!.left, blacks + (red ? 0 : 1), red);
      walk(byIndex[index]!.right, blacks + (red ? 0 : 1), red);
    };
    walk(storage!.child, 0, false);
    assert.equal(blackHeights.size, 1, `hauteurs noires : ${[...blackHeights].join(', ')}`);
  } finally {
    fs.closeSync(fd);
    fs.rmSync(path.dirname(file), { recursive: true });
  }
});
