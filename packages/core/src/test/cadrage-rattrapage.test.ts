// Rattrapage du cadrage d'origine (27/11/2026) : sur une borne, cinq tables reprises de PinUP Popper sur six
// gardaient une vue « Window » posée à la place de la vue « Legacy » de leur .ini d'origine. Le gel du cadrage à
// l'ajout n'avait jamais tourné : tables reprises avant qu'il existe, ou par un import sans indice d'installation.
// Invariants :
// - une table reprise d'une autre installation, sans cadrage choisi par le joueur, se joue avec la vue de l'origine ;
// - le reste du .ini de la copie est gardé, l'état d'avant va dans l'historique du cadrage (retour arrière possible) ;
// - un cadrage choisi dans Cyber Pinball (Point de vue, réglage en partie, œil bas, coins) n'est jamais remplacé ;
// - une table n'est traitée qu'une fois, et les réparations automatiques ne défont pas ensuite le cadrage rendu.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { diagnose, repairPupForPlay, scriptFacts, type DoctorContext } from '../doctor';
import { framingHistory, rememberFraming, restoreFramingOps } from '../framing-history';
import { applyOps } from '../fileops';
import { IniDocument } from '../ini';
import { originFramingOf, planOriginFraming, type OriginVpx } from '../origin-framing';
import { mergeOriginFraming, originCatchUpOf, sameFraming } from '../origin-framing-catchup';
import { readInfo, scanTables } from '../tables';
import { devPcDisplays, vpxWithScript } from './fixtures';
import { REPO_ROOT } from './i18n-scan';

const { catchUpOriginFraming } = require(path.join(REPO_ROOT, 'app', 'dist', 'origin-framing-catchup.js')) as {
  catchUpOriginFraming(
    tables: { file: string; infoFile: string; id?: string }[],
    deps: {
      dataDir: string;
      orientation: DoctorContext['orientation'];
      findOrigin(tableFile: string): { vpx: string; exe: string } | undefined;
      plan(vpx: string, exe: string, orientation: NonNullable<DoctorContext['orientation']>): ReturnType<typeof planOriginFraming>;
      log(line: string): void;
    },
  ): { restored: string[]; noted: number };
};

const TABLE = 'Back To The Future (Data East 1990)';
const SCRIPT = 'Sub Table1_Init\r\nEnd Sub\r\n';
const VIEW_CODES = ['originFraming', 'povView', 'povWrongWay', 'manualView', 'importedView', 'tableOrientation'];

/** La vue « Legacy » du .ini de la table dans PinUP Popper (VPX 10.8.0), rotation 270 sur un écran paysage. */
const POPPER_INI = '[TableOverride]\r\nViewCabMode = 0\r\nViewCabScaleX = 1.129808\r\nViewCabScaleY = 1.384357\r\nViewCabScaleZ = 0.977951\r\nViewCabRotation = 270.000000\r\nViewCabPlayerX = -154.622528\r\nViewCabPlayerY = 0.000000\r\nViewCabPlayerZ = -50.660011\r\nViewCabLookAt = 4.400005\r\nViewCabFOV = 27.999935\r\nViewCabLayback = 61.800083\r\n';
/** Ce que la copie portait : une vue « Window » d'une autre taille, cadrage manuel, plus des réglages à garder. */
const COPY_INI = '[Player]\r\nCabinetAutofitMode = 0\r\nScreenPlayerZ = 80\r\n\r\n[TableOverride]\r\nViewCabMode = 2\r\nViewCabScaleX = 1.194766\r\nViewCabScaleY = 1.029094\r\nViewCabHOfs = 0.0\r\nViewCabVOfs = -0.8225\r\nViewCabWindowTop = 270.0\r\nViewCabWindowBot = 109.261429\r\nViewCabRotation = 0.0\r\n\r\n[ScoreView]\r\nScoreViewWndX = 68\r\n';
const POPPER_GLOBAL = '[Player]\r\nWidth = 3840\r\nHeight = 2160\r\nBGSet = 1\r\n';

function landscape(): NonNullable<DoctorContext['orientation']> {
  return { window: devPcDisplays()[3]!, edge: 'right', globalIni: '[Player]\nBGSet = 1\nWidth = 3840\nHeight = 2160\nCabinetAutofitMode = 1\nCabinetAutofitKeepTop = 1\nCabinetAutofitMaxStretch = 0.15\nScreenWidth = 94.1\nScreenHeight = 52.9\n' };
}

const popperVpx: OriginVpx = { exe: 'C:\\vPinball\\VisualPinball\\VPinballX64.exe', version: '10.8.0.1234', source: 'VPinballX.ini', ini: POPPER_GLOBAL };

/** Une borne : la table copiée dans Cyber Pinball, et la même dans l'installation de PinUP Popper. */
function setup(copyIni: string | undefined, popperIni: string | undefined) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-cadrage-rattrapage-'));
  const tablesDir = path.join(root, 'tables');
  const folder = path.join(tablesDir, TABLE);
  const popperDir = path.join(root, 'popper', TABLE);
  const dataDir = path.join(root, 'data');
  for (const d of [folder, popperDir, dataDir]) fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(folder, `${TABLE}.vpx`), vpxWithScript(SCRIPT));
  fs.writeFileSync(path.join(popperDir, `${TABLE}.vpx`), vpxWithScript(SCRIPT));
  if (copyIni !== undefined) fs.writeFileSync(path.join(folder, `${TABLE}.ini`), copyIni);
  if (popperIni !== undefined) fs.writeFileSync(path.join(popperDir, `${TABLE}.ini`), popperIni);
  const orientation = landscape();
  const entry = () => scanTables(tablesDir)[0]!;
  const ini = path.join(folder, `${TABLE}.ini`);
  const read = () => (fs.existsSync(ini) ? fs.readFileSync(ini, 'utf8') : undefined);
  const lines: string[] = [];
  const run = () =>
    catchUpOriginFraming(scanTables(tablesDir), {
      dataDir,
      orientation,
      findOrigin: () => ({ vpx: path.join(popperDir, `${TABLE}.vpx`), exe: popperVpx.exe }),
      plan: (vpx, _exe, o) => planOriginFraming({ origin: popperVpx, tableIni: fs.existsSync(vpx.replace(/\.vpx$/, '.ini')) ? fs.readFileSync(vpx.replace(/\.vpx$/, '.ini'), 'utf8') : undefined, pov: undefined, orientation: o }),
      log: (line) => lines.push(line),
    });
  const ctx = (): DoctorContext => ({ tablesDir, script: scriptFacts(SCRIPT), orientation });
  const done = () => fs.rmSync(root, { recursive: true, force: true });
  return { root, dataDir, entry, ini, read, run, ctx, lines, done, trashDir: path.join(root, 'corbeille') };
}

test('rattrapage : la vue « Legacy » de PinUP Popper est rendue, le reste du .ini gardé, l’état d’avant dans l’historique', () => {
  const s = setup(COPY_INI, POPPER_INI);
  try {
    const result = s.run();
    assert.deepEqual(result.restored.map((f) => path.basename(f)), [`${TABLE}.vpx`]);
    const doc = IniDocument.parse(s.read()!);
    // La vue de Popper, exactement.
    for (const e of IniDocument.parse(POPPER_INI).entries()) assert.equal(doc.get('TableOverride', e.key), e.value, e.key);
    assert.equal(doc.get('TableOverride', 'ViewCabWindowTop'), undefined, 'vue « Window » retirée');
    assert.equal(doc.get('TableOverride', 'ViewCabHOfs'), undefined);
    assert.equal(doc.get('Player', 'CabinetAutofitMode'), '0', 'cadrage manuel, comme VPX 10.8.0');
    // Œil et mesures : ceux de l'origine (valeurs par défaut de VPX), pas ceux posés depuis.
    assert.notEqual(doc.get('Player', 'ScreenPlayerZ'), '80');
    // Le reste du .ini de la copie est gardé.
    assert.equal(doc.get('ScoreView', 'ScoreViewWndX'), '68');
    // Noté : le diagnostic et les réparations le respectent.
    assert.equal(originFramingOf(readInfo(s.entry().infoFile))?.mode, 'manual');
    // L'état d'avant est gardé, et se rétablit.
    const history = framingHistory(s.dataDir, s.entry().file);
    assert.equal(history.length, 1);
    assert.equal(history[0]!.ini, COPY_INI);
    const back = restoreFramingOps(s.dataDir, s.entry().file, s.ini)!;
    assert.equal((back.ops[0] as { content?: string }).content, COPY_INI);
  } finally {
    s.done();
  }
});

test('rattrapage : une seule fois par table, et les réparations automatiques ne le défont pas', () => {
  const s = setup(COPY_INI, POPPER_INI);
  try {
    s.run();
    const after = s.read();
    assert.equal(originCatchUpOf(s.dataDir, s.entry().file)?.result, 'restored');
    // Le joueur revient ensuite à la vue d'avant : le rattrapage ne repasse pas.
    fs.writeFileSync(s.ini, COPY_INI);
    assert.deepEqual(s.run().restored, []);
    assert.equal(s.read(), COPY_INI);
    fs.writeFileSync(s.ini, after!);
    repairPupForPlay(s.entry(), s.ctx(), { trashDir: s.trashDir });
    assert.equal(s.read(), after, 'réparations avant la partie');
    const views = diagnose(s.entry(), s.ctx()).filter((f) => VIEW_CODES.includes(f.code));
    assert.deepEqual(views.map((f) => [f.code, f.severity]), [['originFraming', 'info']]);
  } finally {
    s.done();
  }
});

test('rattrapage : un cadrage choisi dans Cyber Pinball n’est jamais remplacé', () => {
  const s = setup(COPY_INI, POPPER_INI);
  try {
    // Point de vue, ou réglage en partie dans le menu de VPX : noté dans l'historique.
    rememberFraming(s.dataDir, s.entry().file, { at: '2026-11-24T11:40:21.249Z', label: 'Cadrage de la borne', ini: null });
    assert.deepEqual(s.run().restored, []);
    assert.equal(s.read(), COPY_INI);
    assert.equal(originCatchUpOf(s.dataDir, s.entry().file)?.result, 'kept');
    assert.equal(originFramingOf(readInfo(s.entry().infoFile)), undefined);
  } finally {
    s.done();
  }
});

test('rattrapage : table sans .ini dans Popper (Apollo 13) : cadrage manuel sur la vue du .vpx, comme VPX 10.8.0', () => {
  const s = setup('[Player]\r\nCabinetAutofitMode = 1\r\n\r\n[TableOverride]\r\nViewCabMode = 2\r\nViewCabScaleX = 1.3\r\nViewCabWindowTop = 400\r\n', undefined);
  try {
    assert.equal(s.run().restored.length, 1);
    const doc = IniDocument.parse(s.read()!);
    assert.equal(doc.get('Player', 'CabinetAutofitMode'), '0');
    assert.equal(doc.entries().filter((e) => /^ViewCab/i.test(e.key)).length, 0, 'la vue du .vpx, comme dans Popper');
  } finally {
    s.done();
  }
});

test('rattrapage : la même vue déjà en place est seulement notée, sans écriture du .ini', () => {
  const s = setup(POPPER_INI.replace('[TableOverride]', '[Player]\r\nCabinetAutofitMode = 0\r\n\r\n[TableOverride]'), POPPER_INI);
  try {
    const before = s.read();
    const result = s.run();
    assert.deepEqual(result.restored, []);
    assert.equal(result.noted, 1);
    assert.ok(sameFraming(before, s.read()));
    assert.equal(framingHistory(s.dataDir, s.entry().file).length, 0);
  } finally {
    s.done();
  }
});

test('mergeOriginFraming : seules la vue et les clés du cadrage changent', () => {
  const merged = mergeOriginFraming(COPY_INI, '[Player]\r\nCabinetAutofitMode = 0\r\n\r\n' + POPPER_INI);
  const doc = IniDocument.parse(merged);
  assert.equal(doc.get('ScoreView', 'ScoreViewWndX'), '68');
  assert.equal(doc.get('Player', 'ScreenPlayerZ'), undefined);
  assert.equal(doc.get('TableOverride', 'ViewCabRotation'), '270.000000');
  assert.equal(mergeOriginFraming(undefined, ''), '');
});
